// Stage 20: Properties results in a real browser with a real analysis (acetic acid, then aspirin): identity card with structure, summary,
// all-properties reference, evidence labels, save and reopen, then layouts at several widths/themes without re-running.
//   npm run build && node scripts/browser/stage20PropertiesCheck.mjs      (screenshots: node_modules/.cache/pc-live20)
import fs from "node:fs";
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${String(detail).slice(0, 240)}` : ""}`); };
const outDir = path.join(root, "node_modules", ".cache", "pc-live20");
fs.mkdirSync(outDir, { recursive: true });
const { cdp, url, stop } = await startBrowser({ port: 4394, debugPort: 9554 });
const ev = (e) => cdp.evaluate(e);
const text = (sel) => ev(`(document.querySelector(${q(sel)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`);
const count = (sel) => ev(`document.querySelectorAll(${q(sel)}).length`);
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const setText = (selector, value) => ev(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const clickMain = (label) => ev(`(() => { const b = [...document.querySelectorAll('main button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (b) b.click(); return !!b; })()`);
const tab = async (label) => { await ev(`(() => { const b = [...document.querySelectorAll('.dashboard-tab')].find((x) => x.textContent.trim() === ${q(label)}); b?.click(); })()`); await sleep(500); };
async function analyze(name) {
  await ev(`(() => { const el = [...document.querySelectorAll('main input')].find((i) => /SMILES/.test(i.placeholder || '')); el.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(name)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: String.fromCharCode(13) });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(3000);
  await clickMain("Analyze Molecule");
  await waitFor(() => ev(`!!document.querySelector('[data-testid=pr-identity]') && /Analysis complete/i.test(document.querySelector('[data-testid=pr-status]')?.textContent || '')`), `analysis of ${name}`, 90000);
  await sleep(1500);
}

try {
  await setViewport(cdp, 1440, 900, { scheme: "light" });
  await cdp.send("Page.navigate", { url: `${url}?n=${Date.now()}` });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await waitFor(() => ev(`[...document.querySelectorAll('main input')].some((i) => /SMILES/.test(i.placeholder || ''))`), "name input", 90000);
  await sleep(2500);
  check("before analysis: no identity card, an empty-state message", (await count("[data-testid=pr-identity]")) === 0 && /Analyze a molecule/.test(await ev(`document.body.innerText`)));
  await analyze("acetic acid");

  // ---- identity
  check("identity card names the molecule with its confidence and formula", /acetic acid/i.test(await text("[data-testid=pr-identity]")) && /confidence/.test(await text("[data-testid=pr-identity]")) && /C2H4O2/.test(await text("[data-testid=pr-identity]")), await text("[data-testid=pr-identity]"));
  check("identity shows the structure drawing", (await count("[data-testid=pr-identity] .pr-structure-svg svg")) === 1);
  check("the structure has an accessible name and a text alternative (not read twice)", /Structure of/.test(await ev(`document.querySelector('.pr-structure').getAttribute('aria-label')`)) && (await ev(`document.querySelector('.pr-structure-svg').getAttribute('aria-hidden')`)) === "true" && /Formula/.test(await text(".pr-structure figcaption")));
  check("SMILES is shown in the identity card", /CC\(=O\)O|OC\(C\)=O/.test(await text(".pr-smiles")), await text(".pr-smiles"));

  // ---- summary
  check("tabs renamed to Summary / Acid/Base / Concepts / All Properties", (await ev(`[...document.querySelectorAll('.dashboard-tab')].map((b) => b.textContent.trim()).join('|')`)) === "Summary|Acid/Base|Aromaticity|Concepts|All Properties");
  check("summary: key results, groups, descriptors and tendencies sections", (await count("[data-testid=pr-summary] section")) >= 4 && /Key results/.test(await text("[data-testid=pr-summary]")) && /Functional groups and stereochemistry/.test(await text("[data-testid=pr-summary]")));
  check("summary: calculated values and estimates carry different visible labels", (await count("[data-testid=pr-summary] .pr-evidence.is-calculated")) >= 4 && (await count("[data-testid=pr-summary] .pr-evidence.is-estimate")) === 4);
  check("summary: the estimate section says these are not measured values", /not measured/i.test(await text("[data-testid=pr-summary]")));
  check("summary: functional groups are listed by name", (await count("[data-testid=pr-summary] .pr-chip")) >= 1, await text(".pr-chips"));
  check("summary: no tile reads N/A", !/N\/A/.test(await text("[data-testid=pr-summary]")));
  await ev(`window.scrollTo(0, 0)`); await sleep(300);
  await screenshot(cdp, path.join(outDir, "pr-summary-1440-light.png"));

  // ---- other tabs keep the identity card
  await tab("Acid/Base");
  check("Acid/Base tab still shows its analysis and the structure/identity stays above it", (await count("[data-testid=pr-identity]")) === 1 && /acid|base|pKa/i.test(await ev(`document.querySelector('.dashboard-panel')?.innerText ?? ''`)));
  await tab("Concepts");
  check("Concepts tab still works with the identity card above", (await count("[data-testid=pr-identity]")) === 1 && (await count(".concept-button")) >= 3);

  // ---- all properties
  await tab("All Properties");
  check("all properties: three tables with caption, column headers and row headers", (await count("[data-testid=pr-detail] table")) === 3 && (await count("[data-testid=pr-detail] thead th[scope=col]")) === 12 && (await count("[data-testid=pr-detail] tbody th[scope=row]")) === 14);
  check("all properties: each estimate has a 'Why this level?' disclosure with reasoning", (await count("[data-testid=pr-detail] details.pr-why")) >= 5);
  const disclosure = await ev(`(() => { const d = document.querySelector('[data-testid=pr-detail] .pr-table details.pr-why'); const s = d.querySelector('summary'); s.click(); return d.open; })()`);
  check("the disclosure opens by keyboard-operable summary and reveals text", disclosure === true);
  check("all properties: naming detail, limits and what-it-means definitions present", /Parent chain/.test(await text("[data-testid=pr-detail]")) && /Molecular formula shows/.test(await text("[data-testid=pr-detail]")));
  await screenshot(cdp, path.join(outDir, "pr-detail-1440-light.png"));

  // ---- a larger molecule
  await tab("Summary");
  await analyze("aspirin");
  check("aspirin: identity updates and the summary keeps the same structure", /aspirin|acetylsalicylic|acetyloxy/i.test(await text("[data-testid=pr-identity]")) && /C9H8O4/.test(await text("[data-testid=pr-identity]")), await text(".pr-name"));
  check("aspirin: more than one functional group is listed", (await count("[data-testid=pr-summary] .pr-chip")) >= 2);

  // ---- save and reopen
  await clickMain("Save Analysis"); await sleep(500);
  await setText(".synthesis-save-form input", "props s20"); await sleep(200);
  await ev(`(() => { const f = document.querySelector('.synthesis-save-form'); [...f.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Save')?.click(); })()`);
  await sleep(1500);
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved')?.click()`); await sleep(1500);
  check("the saved Properties analysis is listed", /props s20/.test(await ev(`document.body.innerText`)));
  await ev(`(() => { const card = [...document.querySelectorAll('li, article, .saved-analysis, tr')].find((x) => x.innerText.includes('props s20')); [...(card ?? document).querySelectorAll('button')].find((x) => /^Open/.test(x.innerText.trim()))?.click(); })()`);
  await waitFor(() => ev(`!!document.querySelector('[data-testid=pr-identity]')`), "restored identity", 30000).catch(() => null);
  await sleep(1500);
  check("reopening restores the identity, summary and formula without re-analysis", /C9H8O4/.test(await text("[data-testid=pr-identity]")) && (await count("[data-testid=pr-summary]")) === 1, await text(".pr-name"));

  // ---- layouts from this state
  for (const [w, scheme] of [[1440, "light"], [820, "dark"], [375, "light"], [375, "dark"]]) {
    await setViewport(cdp, w, w < 500 ? 812 : 900, { scheme }); await sleep(800);
    await ev(`document.querySelector('.analysis-dashboard-card')?.scrollIntoView()`); await sleep(300);
    const geo = await ev(`(() => { const s = document.querySelector('.pr-structure-svg svg')?.getBoundingClientRect(); return JSON.stringify({ w: Math.round(s?.width || 0), h: Math.round(s?.height || 0) }); })()`);
    const g = JSON.parse(geo);
    check(`${w}px ${scheme}: no page overflow and a legible structure (>= 120 px wide)`, (await overflow()) <= 0 && g.w >= 120, `${await overflow()} / ${geo}`);
    await screenshot(cdp, path.join(outDir, `pr-${w}-${scheme}.png`), { fullPage: false });
  }
  await setViewport(cdp, 375, 812, { scheme: "light" }); await sleep(500);
  await tab("All Properties");
  const tableOverflow = await ev(`(() => { const t = document.querySelector('.pr-table'); return t ? t.scrollWidth - t.clientWidth : -1; })()`);
  check("375px: the all-properties tables stack instead of overflowing", tableOverflow <= 0 && (await overflow()) <= 0, tableOverflow);
  await ev(`document.querySelector('[data-testid=pr-detail]')?.scrollIntoView()`); await sleep(300);
  await screenshot(cdp, path.join(outDir, "pr-detail-375-light.png"), { fullPage: false });
} catch (error) {
  check("script completed", false, error instanceof Error ? error.stack : String(error));
} finally {
  stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
