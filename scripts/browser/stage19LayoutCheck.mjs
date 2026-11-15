// Stage 19 layout check: the six Organic Chemistry workspaces in populated states, desktop / tablet / 375 px phone, light and dark.
// Asserts no page-level horizontal overflow and the new results-organisation elements; writes screenshots for visual inspection.
//   npm run build && node scripts/browser/stage19LayoutCheck.mjs      (screenshots: node_modules/.cache/pc-live19/layout-*)
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${String(detail).slice(0, 240)}` : ""}`); };
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live19");
const { cdp, url, stop } = await startBrowser({ port: 4381, debugPort: 9541 });
const ev = (e) => cdp.evaluate(e);
let nav = 0;
const ready = (what) => waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), what);
const clearStorage = () => ev(`(async () => { try { localStorage.clear(); sessionStorage.clear(); const dbs = (await indexedDB.databases?.()) ?? []; await Promise.all(dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); }))); } catch {} return true; })()`);
const openTab = async (label) => { await ev(`(() => { const direct = [...document.querySelectorAll('.tool-tabs [role=tab]')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (direct) { direct.click(); return true; } document.querySelector('.shell-menu')?.click(); return false; })()`); await sleep(600);
  await ev(`(() => { const t = [...document.querySelectorAll('.sheet-tool')].find((x) => x.querySelector('.sheet-tool-name')?.textContent.trim() === ${q(label)}); if (t) t.click(); })()`); await sleep(1500); };
const fresh = async (w, scheme) => {
  await setViewport(cdp, w, w < 500 ? 812 : w < 1000 ? 1024 : 900, { scheme });
  nav += 1; await cdp.send("Page.navigate", { url: `${url}?n=${nav}#/organic/properties` }); await ready("app"); await sleep(400); await clearStorage();
  nav += 1; await cdp.send("Page.navigate", { url: `${url}?n=${nav}#/organic/properties` }); await ready("app"); await sleep(800);
};
const typeName = async (name, thenClick) => {
  await waitFor(() => ev(`[...document.querySelectorAll('main input')].some((i) => /SMILES/.test(i.placeholder || ''))`), "name input", 90000);
  await sleep(1500);
  await ev(`(() => { const el = [...document.querySelectorAll('main input')].find((i) => /SMILES/.test(i.placeholder || '')); el.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(name)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: String.fromCharCode(13) });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(4500);
  if (thenClick) { await ev(`(() => { const b = [...document.querySelectorAll('main button')].find((x) => x.innerText.trim() === ${q(thenClick)} && !x.disabled && x.getClientRects().length); if (b) b.click(); })()`); await sleep(3000); }
};
const clickMain = async (label, wait = 4000) => { await ev(`(() => { const b = [...document.querySelectorAll('main button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (b) b.click(); })()`); await sleep(wait); };
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const exists = (sel) => ev(`!!document.querySelector(${q(sel)})`);
const waitKetcher = (name) => waitFor(() => ev(`!!window[${q(name)}]`), `${name}`, 90000);
const shot = async (name) => { await ev(`window.scrollTo(0, 0)`); await sleep(300); await screenshot(cdp, path.join(outDir, `layout-${name}.png`)); };

const pages = {
  Properties: async () => { await typeName("acetic acid"); await clickMain("Analyze Molecule", 6000); return async () => (await exists(".dashboard, [class*=dashboard]")) || /Properties Dashboard/.test(await ev(`document.body.innerText`)); },
  Ranking: async () => { await typeName("acetic acid", "Add to comparison"); await typeName("phenol", "Add to comparison"); await typeName("ethanol", "Add to comparison"); return async () => (await exists("[data-testid=ranking-basis]")) && (await ev(`document.querySelectorAll('.ranking-result-card').length === 3`)); },
  Spectroscopy: async () => { await typeName("acetone"); return async () => (await exists("[data-testid=spectroscopy-estimate-note]")) && (await ev(`!!document.querySelector('svg') && document.body.innerText.includes('Predicted')`)); },
  Reactions: async () => { await waitKetcher("reactionKetcher"); await sleep(1500); await ev(`window.reactionKetcher.setMolecule('CC=CC')`); await sleep(1200); await clickMain("Predict Products", 15000); return async () => (await exists("[data-testid=outcomes-overview]")) && (await ev(`document.querySelectorAll('.reaction-pathway-card').length > 3`)); },
  "Multi-Step": async () => { await waitKetcher("synthesisReactantKetcher"); await sleep(1500); await ev(`window.synthesisReactantKetcher.setMolecule('CCO'); window.synthesisProductKetcher.setMolecule('CC(=O)O')`); await sleep(1500); await clickMain("Search", 20000); return async () => (await exists("[data-testid=route-glance]")) && (await ev(`document.querySelectorAll('.synthesis-step-card').length >= 1`)); },
  "Multi-Catalytic": async () => {
    await waitKetcher("multiCatalyticWorkspaceKetcher"); await sleep(1500);
    await ev(`window.multiCatalyticWorkspaceKetcher.setMolecule('CC=CC')`); await sleep(1500); await clickMain("Add drawn molecule(s) to inventory", 2500);
    await ev(`(() => { const opt = [...document.querySelectorAll('.multicatalytic-condition-option')].find((o) => /H₂, Pd\\/C/.test(o.innerText)); opt?.click(); })()`); await sleep(1200);
    await ev(`(() => { const box = document.querySelector('main input[type=checkbox]'); if (box && !box.checked) box.click(); })()`); await sleep(800); await clickMain("Run step", 6000);
    return async () => (await ev(`document.body.innerText.includes('Assessment of the completed steps')`)) && (await ev(`(() => { const r = [...document.querySelectorAll('.multicatalytic-condition-option')].map((o) => o.getBoundingClientRect()); return r.every((b, i) => i === 0 || b.top >= r[i - 1].bottom - 1); })()`)); },
};

try {
  const configs = [[1440, "light"], [820, "dark"], [375, "light"], [375, "dark"]];
  for (const [label, populate] of Object.entries(pages)) {
    for (const [w, scheme] of configs) {
      await fresh(w, scheme);
      await openTab(label);
      const verify = await populate();
      const markersOk = await verify();
      const off = await overflow();
      check(`${label} ${w}px ${scheme}: populated markers present`, markersOk);
      check(`${label} ${w}px ${scheme}: no horizontal page overflow`, off <= 0, `overflow ${off}px`);
      await shot(`${label.replace(/[^A-Za-z]/g, "")}-${w}-${scheme}`);
    }
  }
} catch (error) {
  check("script completed", false, error instanceof Error ? error.stack : String(error));
} finally {
  stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
