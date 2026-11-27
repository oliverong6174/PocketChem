// Stage 23 live-browser check (real headless Chrome, production build): Membranes & transport, Cell signaling, Neuronal physiology.
//   npm run build && node scripts/browser/stage23LiveCheck.mjs
// Screenshots go to node_modules/.cache/pc-live23 (repository-local, git-ignored) unless SHOT_DIR is set.
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
};
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live23");
const { cdp, url, stop } = await startBrowser({ port: 4303, debugPort: 9463 });
const ev = (expr) => cdp.evaluate(expr);
const click = (label, scope = "document") => ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const choose = (label) => ev(`(() => { const o = [...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; o.querySelector('input').click(); return true; })()`);
const setInput = (selector, value) => ev(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return false; const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const setField = (label, value, nth = 0) => ev(`(() => { const ls = [...document.querySelectorAll('.gc-field label')].filter((x) => x.textContent.trim().startsWith(${q(label)})); const l = ls[${nth}]; if (!l) return false; const el = document.getElementById(l.htmlFor); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const getField = (label, nth = 0) => ev(`(() => { const ls = [...document.querySelectorAll('.gc-field label')].filter((x) => x.textContent.trim().startsWith(${q(label)})); return ls[${nth}] ? document.getElementById(ls[${nth}].htmlFor).value : null; })()`);
const figure = (label) => ev(`(() => { const f = [...document.querySelectorAll('.ui-figure')].find((x) => x.querySelector('dt').textContent.trim().startsWith(${q(label)})); return f ? f.querySelector('dd').textContent : null; })()`);
const text = (selector) => ev(`document.querySelector(${q(selector)})?.innerText ?? ''`);
const hash = () => ev(`location.hash`);
const nums = (s) => String(s).replace(/−/g, "-").match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)?.map(Number) ?? [];
const near = (a, b, rel, abs = 0) => Number.isFinite(a) && Math.abs(a - b) <= Math.max(rel * Math.abs(b), abs);
const clearStorage = () => ev(`(async () => { try { localStorage.clear(); sessionStorage.clear(); const dbs = (await indexedDB.databases?.()) ?? []; await Promise.all(dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); }))); } catch { /* ignore */ } })()`);
let nav = 0;
/** Opens a page in a fresh state (storage cleared) unless keep is set (used to reopen saved work). */
const fresh = async (width, scheme = "dark", target = "", { keep = false, ...viewport } = {}) => {
  await setViewport(cdp, width, width < 500 ? 812 : width < 1000 ? 1024 : 900, { scheme, ...viewport });
  if (!keep) {
    nav += 1;
    await cdp.send("Page.navigate", { url: `${url}?n=${nav}#/biology/overview` });
    await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
    await sleep(300);
    await clearStorage();
  }
  nav += 1;
  await cdp.send("Page.navigate", { url: `${url}?n=${nav}${target}` });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await sleep(800);
};
const waitSel = (selector, ms = 20000) => waitFor(() => ev(`!!document.querySelector(${q(selector)})`), selector, ms);
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const tabs = () => ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].map((b) => b.textContent.trim()).join('|')`);
const shot = async (name, full = true) => { await sleep(350); await screenshot(cdp, path.join(outDir, name), { fullPage: full }); };
const saveAs = async (name) => {
  await click("Save Analysis");
  await sleep(300);
  await ev(`(() => { const el = document.querySelector('.synthesis-save-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(name)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`document.body.innerText.includes(${q(`Saved “${name}”`)})`), "save notice", 15000);
};
const openRecord = async (name) => {
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 1`), "saved list", 15000);
  await ev(`(() => { const row = [...document.querySelectorAll('.saved-list li, .saved-item, article, li')].find((x) => x.textContent.includes(${q(name)}) && x.querySelector('button')); const b = row && [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open'); b?.click(); })()`);
  await sleep(1200);
  if (await ev(`!!document.querySelector('[role=alertdialog]')`)) await click("Replace without saving");
  await sleep(900);
};
const key = async (k, code, vk, modifiers = 0) => {
  await cdp.send("Input.dispatchKeyEvent", { type: k === "Enter" ? "keyDown" : "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(k === "Enter" ? { text: String.fromCharCode(13) } : {}) });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
};
const searchOpen = () => ev(`!!document.querySelector('.concept-search[role=dialog]')`);
const typeSearch = async (value) => { await setInput("[data-testid=concept-input]", value); await sleep(300); };
const resultsList = () => ev(`[...document.querySelectorAll('[data-testid=concept-result]')].map((li) => ({ title: li.querySelector('.concept-result-title').textContent, subject: li.querySelector('.concept-subject').textContent }))`);
const answerNumber = async (value) => { await setInput("#gc-answer", value); await click("Check my answer"); await sleep(250); return text("[data-testid=question-result]"); };

const tick = (testid) => ev(`(() => { const e = document.querySelector('[data-testid=${testid}]'); if (!e) return false; e.click(); return true; })()`);
const step = async (n, label = "Next step") => { for (let i = 0; i < n; i += 1) { await ev(`document.querySelector('button[aria-label=${q(label)}]')?.click()`); await sleep(120); } };
const svgLabel = () => ev(`document.querySelector('.c23-svg')?.getAttribute('aria-label') ?? ''`);
try {
  await fresh(1440, "dark", "#/biology/membranes-transport");
  await waitSel(".c23-svg");
  await choose("Passive transport");
  await setInput("[data-testid=solute]", "k");
  await sleep(400);
  await setField("Membrane voltage Vm", -70);
  await sleep(300);
  check("3 at -70 mV K+ moves outward; the diagram shows the two driving forces", /outward/.test(String(await figure("Net movement"))) && /Forces on K/.test(await ev(`document.querySelector('.c23-svg').textContent`)));
  await shot("q-passive-k.png", false);
  await choose("Active transport");
  await step(4);
  await shot("q-pump.png", false);
  await choose("Bilayer");
  await sleep(300);
  await shot("q-bilayer.png", false);
  await fresh(375, "dark", "#/biology/cell-signaling");
  await waitSel(".c23-card");
  await step(1, "Last step");
  await tick("pert-ac-inhib");
  await sleep(300);
  check("22 signaling at 375 px shows a focused list of events with state words, not a shrunken graph", (await ev(`document.querySelectorAll('.c23-card').length`)) >= 8 && /BLOCKED/.test(await text("ol.c23-mech-list")) && (await overflow()) <= 1, String(await overflow()));
  await shot("q-phone-signaling.png", false);
  for (const [w, scheme] of [[375, "dark"], [375, "light"], [1440, "dark"]]) {
    await fresh(w, scheme, "#/biology/cell-signaling");
    await waitSel(w < 600 ? ".c23-card" : ".c23-svg");
    check(`22 signaling ${w}px ${scheme}: no horizontal overflow`, (await overflow()) <= 1, String(await overflow()));
  }
  await fresh(1440, "dark", "#/biology/neuronal-physiology");
  await waitSel(".c23-svg");
  await choose("Action potential");
  await sleep(900);
  await ev(`(() => { const r = document.querySelector('.ph-timeline input[type=range]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(r, 118); r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(500);
  await shot("q-ap.png", true);
  await ev(`(() => { const r = document.querySelector('.ph-timeline input[type=range]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(r, 200); r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(500);
  check("16 at 6 ms the cursor is in the afterhyperpolarization: K+ conductance still elevated", /K⁺ conductance is still elevated/.test(await text("[data-testid=phase-text]")), (await text("[data-testid=phase-text]")).slice(0, 80));
  await choose("Anatomy");
  await sleep(300);
  await shot("q-anatomy.png", false);
  await choose("Synapse");
  await sleep(400);
  await step(7);
  await shot("q-synapse.png", false);
  check("no uncaught page exceptions", cdp.errors.length === 0, cdp.errors.slice(0, 3).join(" | "));
} catch (error) {
  console.log(`FAIL  script error: ${error?.stack ?? error}`);
  results.push(false);
} finally {
  stop();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
