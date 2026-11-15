// Stage 20: Multi-Catalytic route views in both modes, driven through the real UI with real engine runs, then re-captured at several
// widths/themes without re-running. Real engine: the convergent workspace (BuBr -> Grignard, BuOH -> butanal, join, oxidation) and an
// ordered sequence (propene + HBr, then a second condition that cannot react).
//   npm run build && node scripts/browser/stage20McCheck.mjs      (screenshots: node_modules/.cache/pc-live20)
import fs from "node:fs";
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${String(detail).slice(0, 240)}` : ""}`); };
const outDir = path.join(root, "node_modules", ".cache", "pc-live20");
fs.mkdirSync(outDir, { recursive: true });
const { cdp, url, stop } = await startBrowser({ port: 4392, debugPort: 9552 });
const ev = (e) => cdp.evaluate(e);
const text = (sel) => ev(`(document.querySelector(${q(sel)})?.innerText ?? '').replace(/\\s+/g, ' ').trim()`);
const count = (sel) => ev(`document.querySelectorAll(${q(sel)}).length`);
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const clickMain = (label) => ev(`(() => { const b = [...document.querySelectorAll('main button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (b) b.click(); return !!b; })()`);
const setText = (selector, value) => ev(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const shot = async (name) => { await ev(`window.scrollTo(0, 0)`); await sleep(300); await screenshot(cdp, path.join(outDir, `mc-${name}.png`)); };

async function pickRule(ruleId, query) {
  await setText(".multicatalytic-search-input", query);
  await sleep(500);
  let ok = await ev(`(() => { const o = document.querySelector('[data-rule-id=${ruleId}]'); if (o) { o.click(); return true; } return false; })()`);
  if (!ok) { await ev(`(() => { const c = [...document.querySelectorAll('main input[type=checkbox]')].find((x) => /every reaction/i.test(x.closest('label')?.innerText || '')); if (c && !c.checked) c.click(); })()`); await sleep(500);
    ok = await ev(`(() => { const o = document.querySelector('[data-rule-id=${ruleId}]'); if (o) { o.click(); return true; } return false; })()`); }
  await sleep(500);
  return ok;
}
async function tickLots(ids) {
  for (const id of ids) await ev(`(() => { const c = [...document.querySelectorAll('main input[type=checkbox]')].find((x) => (x.getAttribute('aria-label') || '').includes('(${id})')); if (c && !c.checked) c.click(); })()`);
  await sleep(400);
}

try {
  await setViewport(cdp, 1440, 900, { scheme: "light" });
  await cdp.send("Page.navigate", { url: `${url}?n=${Date.now()}` });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((x) => x.textContent.trim() === 'Multi-Catalytic').click()`);
  await waitFor(() => ev(`Boolean(window.multiCatalyticWorkspaceKetcher)`), "workspace ketcher", 90000);
  await sleep(1500);

  // ---- Workspace mode: empty, then the convergent route
  check("workspace: no route panel before any step", (await count("[data-testid=workspace-route]")) === 0);
  for (const smiles of ["CCCCBr", "CCCCO"]) {
    await ev(`window.multiCatalyticWorkspaceKetcher.setMolecule(${q(smiles)})`); await sleep(1200);
    await clickMain("Add drawn molecule(s) to inventory"); await sleep(2500);
  }
  const steps = [
    ["haloalkane-grignard-formation-bromide", "Grignard", ["sm0#1"]],
    ["primary-alcohol-mild-oxidation", "oxidation", ["sm1#1"]],
    ["aldehyde-organometallic-addition", "organometallic", ["s2.1", "s1.1"]],
    ["secondary-alcohol-oxidation-pcc", "PCC", ["s3.1"]],
  ];
  for (const [rule, query, lots] of steps) {
    const picked = await pickRule(rule, query);
    if (!picked) { check(`workspace: rule ${rule} selectable`, false); break; }
    await tickLots(lots);
    await clickMain("Run step"); await sleep(5000);
  }
  await waitFor(() => ev(`!!document.querySelector('[data-testid=workspace-route]')`), "route panel", 20000).catch(() => null);
  check("workspace: objective panel shows supplied starting materials and an end product", (await count("[data-testid=mc-objective]")) === 1 && /starting materials/i.test(await text("[data-testid=mc-objective]")) && /nonan|octan|CCCCC\(=O\)CCC/i.test(await text("[data-testid=mc-objective]")), await text("[data-testid=mc-objective]"));
  check("workspace: four steps on the route ladder", (await count("[data-testid=mc-rung]")) === 4, await count("[data-testid=mc-rung]"));
  check("workspace: the join is reported (not drawn as a linear step)", (await count(".mc-rung.is-join")) === 1 && /joins 2 separate inputs/.test(await text(".mc-rung.is-join")), await text(".mc-rung.is-join"));
  check("workspace: step details are disclosures; only the latest is open", (await count("[data-testid=mc-step-details]")) === 4 && (await count("[data-testid=mc-step-details][open]")) === 1);
  check("workspace: inventory and assessment still present", /Inventory/.test(await ev(`document.body.innerText`)) && /Assessment of the completed steps/.test(await ev(`document.body.innerText`)));
  for (const [w, scheme] of [[1440, "light"], [820, "dark"], [375, "light"], [375, "dark"]]) {
    await setViewport(cdp, w, w < 500 ? 812 : 900, { scheme }); await sleep(600);
    check(`workspace ${w}px ${scheme}: no page overflow`, (await overflow()) <= 0, await overflow());
    await ev(`document.querySelector('[data-testid=workspace-route]').scrollIntoView()`); await sleep(300);
    await screenshot(cdp, path.join(outDir, `mc-workspace-${w}-${scheme}.png`), { fullPage: false });
  }
  await setViewport(cdp, 1440, 900, { scheme: "light" });

  // ---- Ordered-sequence mode
  await ev(`window.scrollTo(0, 0)`);
  await ev(`[...document.querySelectorAll('.multicatalytic-mode-tabs [role=tab], .multicatalytic-mode-tabs button')].find((b) => /Ordered sequence/.test(b.textContent))?.click()`);
  await waitFor(() => ev(`Boolean(window.multiCatalyticKetcher)`), "sequence ketcher", 90000);
  await sleep(1500);
  await ev(`window.multiCatalyticKetcher.setMolecule('C=CC')`); await sleep(1200);
  for (const [id, query, reagent] of [["alkene-hx-addition-hbr", "HBr", "HBr"], ["alkene-hydrogenation", "Pd/C", "H₂, Pd/C"]]) {
    await setText(".multicatalytic-sequence-mode .multicatalytic-search-input", query); await sleep(700);
    const ok = await ev(`(() => { const o = [...document.querySelectorAll('.multicatalytic-sequence-mode .multicatalytic-condition-option')].find((x) => x.querySelector('span')?.textContent.trim() === ${q(reagent)}); if (o) o.click(); return !!o; })()`); await sleep(700);
    check(`sequence: condition ${id} added`, ok);
  }
  await clickMain("Run Sequence"); await sleep(7000);
    const seqPanel = await count("[data-testid=sequence-route]");
  check("sequence: objective, outcomes list and route strip render", seqPanel === 1 && (await count("[data-testid=sequence-route] [data-testid=mc-objective]")) === 1 && (await count("[data-testid=mc-alternatives]")) === 1 && (await count("[data-testid=mc-strip]")) === 1, await text("[data-testid=sequence-route]"));
  const nOutcomes = await count("[data-testid=mc-outcome]");
  check("sequence: every engine outcome is selectable", nOutcomes >= 1, nOutcomes);
  check("sequence: only the selected outcome's detail card is mounted", (await count(".multicatalytic-results .reaction-pathway-card")) === 1);
  if (nOutcomes > 1) {
    await ev(`document.querySelectorAll('[data-testid=mc-outcome]')[1].click()`); await sleep(500);
    check("sequence: selecting another outcome changes the strip and the detail", /Route of outcome #2/.test(await text("[data-testid=mc-strip]")) && /Step-by-step details of outcome #2/.test(await text(".multicatalytic-results")));
  }
  check("sequence: unresolved steps are visible as text, not colour only", /Stops at step|All steps reacted/.test(await text("[data-testid=mc-alternatives]")));
  for (const [w, scheme] of [[1440, "light"], [820, "dark"], [375, "light"], [375, "dark"]]) {
    await setViewport(cdp, w, w < 500 ? 812 : 900, { scheme }); await sleep(600);
    check(`sequence ${w}px ${scheme}: no page overflow`, (await overflow()) <= 0, await overflow());
    await ev(`document.querySelector('[data-testid=sequence-route]').scrollIntoView()`); await sleep(300);
    await screenshot(cdp, path.join(outDir, `mc-sequence-${w}-${scheme}.png`), { fullPage: false });
  }
} catch (error) {
  check("script completed", false, error instanceof Error ? error.stack : String(error));
} finally {
  stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
