// Stage 20: consistency of Multi-Step (real convergent route), Ranking (real molecules) and Spectroscopy (real prediction) at several widths and
// themes, plus search / related-concept / subject-navigation regressions. Populates once per page and re-captures per viewport.
//   npm run build && node scripts/browser/stage20ConsistencyCheck.mjs      (screenshots: node_modules/.cache/pc-live20)
import fs from "node:fs";
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${String(detail).slice(0, 240)}` : ""}`); };
const outDir = path.join(root, "node_modules", ".cache", "pc-live20");
fs.mkdirSync(outDir, { recursive: true });
const { cdp, url, stop } = await startBrowser({ port: 4396, debugPort: 9556 });
const ev = (e) => cdp.evaluate(e);
const text = (sel) => ev(`(document.querySelector(${q(sel)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`);
const count = (sel) => ev(`document.querySelectorAll(${q(sel)}).length`);
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const clickMain = (label) => ev(`(() => { const b = [...document.querySelectorAll('main button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (b) b.click(); return !!b; })()`);
const openTab = async (label) => {
  await ev(`(() => { const d = [...document.querySelectorAll('.tool-tabs [role=tab]')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (d) d.click(); else document.querySelector('.shell-menu')?.click(); })()`); await sleep(700);
  await ev(`(() => { const t = [...document.querySelectorAll('.sheet-tool')].find((x) => x.querySelector('.sheet-tool-name')?.textContent.trim() === ${q(label)}); if (t) t.click(); })()`); await sleep(1200);
};
const waitInput = () => waitFor(() => ev(`[...document.querySelectorAll('main input')].some((i) => /SMILES/.test(i.placeholder || ''))`), "name input and ready editor", 90000);
async function typeName(name, thenClick) {
  await waitInput(); await sleep(1500);
  await ev(`(() => { const el = [...document.querySelectorAll('main input')].find((i) => /SMILES/.test(i.placeholder || '')); el.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(name)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: String.fromCharCode(13) });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await waitFor(() => ev(`document.body.innerText.toLowerCase().includes(${q("loaded: " + name.toLowerCase())})`), `${name} loaded into the editor`, 40000).catch(() => null);
  await sleep(1500);
  if (thenClick) { await clickMain(thenClick); await sleep(3000); }
}
const key = async (k, code, vk, modifiers = 0) => {
  await cdp.send("Input.dispatchKeyEvent", { type: k === "Enter" ? "keyDown" : "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(k === "Enter" ? { text: String.fromCharCode(13) } : {}) });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
};
const views = [[1440, "light"], [820, "dark"], [375, "light"], [375, "dark"]];
async function eachView(label, selector, extra) {
  for (const [w, scheme] of views) {
    await setViewport(cdp, w, w < 500 ? 812 : 900, { scheme }); await sleep(700);
    const off = await overflow();
    const more = extra ? await extra(w) : { ok: true, detail: "" };
    check(`${label} ${w}px ${scheme}: no page overflow${extra ? " and layout rules hold" : ""}`, off <= 0 && more.ok, `${off}px ${more.detail}`);
    await ev(`(document.querySelector(${q(selector)}) || document.body).scrollIntoView()`); await sleep(300);
    await screenshot(cdp, path.join(outDir, `cons-${label.replace(/[^A-Za-z]/g, "")}-${w}-${scheme}.png`), { fullPage: false });
  }
  await setViewport(cdp, 1440, 900, { scheme: "light" }); await sleep(400);
}

try {
  await setViewport(cdp, 1440, 900, { scheme: "light" });
  await cdp.send("Page.navigate", { url: `${url}?n=${Date.now()}` });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");

  // ---- Multi-Step: a real convergent route (1-bromobutane + butan-1-ol -> octan-4-ol)
  await openTab("Multi-Step");
  await waitFor(() => ev(`Boolean(window.synthesisReactantKetcher && window.synthesisProductKetcher)`), "ketchers", 90000);
  await sleep(1500);
  await ev(`window.synthesisReactantKetcher.setMolecule('CCCCBr.CCCCO'); window.synthesisProductKetcher.setMolecule('CCCC(O)CCC')`); await sleep(1500);
  await clickMain("Search");
  await waitFor(() => ev(`!!document.querySelector('[data-testid=route-glance]')`), "route", 90000);
  await sleep(2000);
  const steps = await count(".synthesis-step-card");
  check("Multi-Step: a convergent route is found with step cards", steps >= 3, steps);
  check("Multi-Step: route at a glance lists the same steps in order", (await count("[data-testid=route-glance] li")) === steps);
  check("Multi-Step: objective (starting materials and target) is stated above the route", /Starting materials:/.test(await ev(`document.body.innerText`)) && /Target:/.test(await ev(`document.body.innerText`)));
  check("Multi-Step: evidence and limitations text is present (quality advisory, not experimental)", /model check, not an experimental validation|not an experimental/i.test(await ev(`document.body.innerText`)));
  check("Multi-Step: no alternatives selector when only one route exists", (await count("[data-testid=route-alternatives]")) === 0);
  check("Multi-Step: every step card shows structure drawings", (await ev(`[...document.querySelectorAll('.synthesis-step-card')].every((c) => c.querySelectorAll('svg').length >= 2)`)));
  await eachView("Multi-Step", ".synthesis-route-card", async () => ({ ok: await ev(`[...document.querySelectorAll('.synthesis-step-card')].every((c) => c.scrollWidth <= c.clientWidth + 2)`), detail: "step cards fit" }));

  // ---- Ranking: real molecules, ties/unsupported
  await openTab("Ranking");
  await waitInput(); await sleep(2500);
  await typeName("acetic acid", "Add to comparison"); await typeName("phenol", "Add to comparison"); await typeName("ethanol", "Add to comparison");
  check("Ranking: three molecules compared with an explicit ordering basis", (await count(".ranking-result-card")) === 3 && /How the order was decided/.test(await text("[data-testid=ranking-basis]")), `${await count(".ranking-result-card")} cards; basis: ${await text("[data-testid=ranking-basis]")}`);
  check("Ranking: unranked molecules say so in text for assistive tech and show a dash", (await count(".ranking-unranked")) >= 1 && /Not ranked/.test(await text(".ranking-unranked")), `${await count(".ranking-unranked")}: ${await text(".ranking-unranked")}`);
  check("Ranking: the ranked molecule keeps its rank", /#1/.test(await text(".ranking-result-card")));
  await eachView("Ranking", ".ranking-results-list", async () => ({ ok: await ev(`[...document.querySelectorAll('.ranking-result-card')].every((c) => c.scrollWidth <= c.clientWidth + 2)`), detail: "cards fit" }));

  // ---- Spectroscopy: real prediction; inputs never overlap actions; plot legible
  await openTab("Spectroscopy");
  await waitInput(); await sleep(2500);
  await typeName("acetone");
  await waitFor(() => ev(`!!document.querySelector('[data-testid=spectroscopy-estimate-note]')`), "spectrum", 90000);
  check("Spectroscopy: results are labelled predicted, not measured", /Predicted, not measured/.test(await text("[data-testid=spectroscopy-estimate-note]")));
  check("Spectroscopy: the NMR plot renders with axis labels", (await ev(`!!document.querySelector('.spectroscopy-results-card svg') && document.querySelector('.spectroscopy-results-card').textContent.includes('(ppm)')`)));
  const noOverlap = async () => ev(`(() => { const card = document.querySelector('.spectroscopy-input-card'); const input = [...document.querySelectorAll('main input')].find((i) => /SMILES/.test(i.placeholder || '')); const row = card.querySelector(':scope > .button-row'); const a = input.getBoundingClientRect(), b = row.getBoundingClientRect(); return !(a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right); })()`);
  check("Spectroscopy: name input and action buttons do not overlap at 1440x900", await noOverlap());
  for (const tabName of ["¹³C NMR", "IR", "Mass Spec"]) {
    await ev(`[...document.querySelectorAll('.spectroscopy-tab-row [role=tab]')].find((b) => b.textContent.includes(${q(tabName)}))?.click()`); await sleep(1000);
    check(`Spectroscopy: ${tabName} tab shows a plot`, (await count(".spectroscopy-results-card svg")) >= 1);
  }
  await ev(`[...document.querySelectorAll('.spectroscopy-tab-row [role=tab]')][0]?.click()`); await sleep(500);
  await eachView("Spectroscopy", ".spectroscopy-results-card", async () => ({ ok: await noOverlap(), detail: "input/actions apart" }));

  // ---- Search and related concepts still work from an Organic page
  await key("k", "KeyK", 75, 2); await sleep(500);
  check("search opens with Ctrl+K on an Organic page", (await count(".concept-search[role=dialog]")) === 1);
  await ev(`(() => { const el = document.querySelector('[data-testid=concept-input]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'ATP'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(400);
  await key("Enter", "Enter", 13); await sleep(1800);
  check("search result opens its Biochemistry tool", (await ev("location.hash")) === "#/biochemistry/metabolic-map", await ev("location.hash"));
  check("related-concepts panel renders there", (await count("[data-testid=related-concepts]")) === 1);
  for (const [target, startsWith, label] of [
    ["#/physics/overview", "Overview|Mechanics & motion", "Physics"], ["#/general/overview", "Overview|Acid–base & titration", "General Chemistry"],
    ["#/biology/overview", "Overview|DNA replication", "Biology"], ["#/biochemistry/overview", "Overview|Amino acids & peptides", "Biochemistry"], ["#/organic/properties", "Properties|Ranking|Spectroscopy|Conformations|Reactions", "Organic"],
  ]) {
    await ev(`location.hash = ${q(target)}`); await sleep(1500);
    const tabs = await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].map((b) => b.textContent.trim()).join('|')`);
    check(`${label} navigation intact`, tabs.startsWith(startsWith), tabs.slice(0, 80));
  }
} catch (error) {
  check("script completed", false, error instanceof Error ? error.stack : String(error));
} finally {
  stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
