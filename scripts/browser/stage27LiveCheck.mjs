// Stage 27 live-browser check (headless Chrome, production build): scientific evidence panels, provenance statuses, corrected reference data.
//   npm run build && node scripts/browser/stage27LiveCheck.mjs      (screenshots: node_modules/.cache/pc-live27)
// Expected labels, counts and numbers are typed here independently of src/utils/evidence/evidence27.ts and the provenance modules.
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${String(detail).slice(0, 300)}` : ""}`); };
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live27");
const { cdp, url, stop } = await startBrowser({ port: 4372, debugPort: 9532 });
const ev = (e) => cdp.evaluate(e);
let nav = 0;
const clearStorage = () => ev(`(async () => { try { localStorage.clear(); sessionStorage.clear(); const dbs = (await indexedDB.databases?.()) ?? []; await Promise.all(dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); }))); } catch { /* ignore */ } })()`);
const ready = (what) => waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), what);
const fresh = async (w, scheme, target) => {
  await setViewport(cdp, w, w < 500 ? 812 : w < 1000 ? 1024 : 900, { scheme });
  nav += 1; await cdp.send("Page.navigate", { url: `${url}?n=${nav}#/biology/overview` });
  await ready("app"); await sleep(300); await clearStorage();
  nav += 1; await cdp.send("Page.navigate", { url: `${url}?n=${nav}${target}` });
  await ready("app"); await sleep(1100);
};
const openPanels = () => ev(`document.querySelectorAll('[data-testid=evidence-panel] details').forEach((d) => { d.open = true; })`);
const panels = () => ev(`[...document.querySelectorAll('[data-testid=evidence-panel]')].map((p) => ({
  id: p.getAttribute('data-evidence-id'),
  text: p.innerText.replace(/\\s+/g, ' '),
  badges: [...p.querySelectorAll('.ui-badge')].map((b) => b.textContent.trim()),
  links: [...p.querySelectorAll('a')].map((a) => ({ href: a.href, target: a.target, rel: a.rel })),
  right: p.getBoundingClientRect().right, left: p.getBoundingClientRect().left, sw: p.scrollWidth, cw: p.clientWidth,
}))`);
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const bodyText = () => ev(`document.body.innerText.replace(/\\s+/g, ' ')`);
const hash = () => ev(`location.hash`);
const shot = async (name) => { await sleep(250); await screenshot(cdp, path.join(outDir, name), { fullPage: false }); };
const NATIVE = `const setv = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };`;
const setField = (label, value) => ev(`(() => { ${NATIVE} const l = [...document.querySelectorAll('.gc-field label')].find((x) => x.textContent.trim().startsWith(${q(label)})); if (!l) return false; setv(document.getElementById(l.htmlFor), ${q(value)}); return true; })()`);
const choose = (label) => ev(`(() => { const o = [...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; o.querySelector('input').click(); return true; })()`);

// Expected, per page: panel ids in order, and the badge labels each must show (typed independently).
const KIND = { ref: "Reference data", text: "Textbook approximation", num: "Numerical model", mech: "Curated educational mechanism" };
const PAGES = [
  ["#/general/stoichiometry", [["gc-stoichiometry", KIND.text, "Partly source-verified", "Independently calculation-checked"], ["gc-atomic-masses", KIND.ref, "Source-verified", "Independently calculation-checked"]]],
  ["#/general/gas-laws", [["gc-ideal-gas", KIND.text, "Partly source-verified", "Independently calculation-checked"]]],
  ["#/general/electrochemistry", [["gc-electrode-potentials", KIND.ref, "Partly source-verified", "Independently calculation-checked"], ["gc-nernst-cell", KIND.text, "Partly source-verified", "Independently calculation-checked"]]],
  ["#/biology/membranes-transport", [["bio-membrane", KIND.text, "Partly source-verified", "Independently calculation-checked"]]],
  ["#/biology/neuronal-physiology", [["bio-hodgkin-huxley", KIND.num, "Not verified against a source", "Independently calculation-checked"], ["bio-membrane", KIND.text, "Partly source-verified", "Independently calculation-checked"]]],
  ["#/biology/apoptosis-autophagy", [["bio-apoptosis", KIND.mech, "Partly source-verified", "Independently calculation-checked", "Qualitative: no rates or probabilities"]]],
  ["#/biology/cell-cycle-checkpoints", [["bio-cell-cycle", KIND.mech, "Partly source-verified", "Independently calculation-checked", "Qualitative: no rates or probabilities"]]],
  ["#/biology/organelles-trafficking", [["bio-organelles-trafficking", KIND.mech, "Partly source-verified", "Not independently checked", "Qualitative: no rates or probabilities"]]],
  ["#/biochemistry/fatty-acids-ketone-bodies", [["biochem-fatty-acid-atp", KIND.text, "Partly source-verified", "Independently calculation-checked"]]],
  ["#/biochemistry/amino-acid-metabolism", [["biochem-urea-cycle", KIND.text, "Partly source-verified", "Independently calculation-checked"]]],
  ["#/physics/waves-sound", [["physics-closed-forms", KIND.text, "Not verified against a source", "Independently calculation-checked"]]],
  ["#/physics/geometric-optics", [["physics-closed-forms", KIND.text, "Not verified against a source", "Independently calculation-checked"]]],
];
const WITH_SOURCES = new Set(["gc-atomic-masses", "gc-stoichiometry", "gc-ideal-gas", "gc-electrode-potentials", "gc-nernst-cell", "bio-membrane", "bio-apoptosis", "bio-cell-cycle", "bio-organelles-trafficking", "biochem-fatty-acid-atp", "biochem-urea-cycle"]);

try {
  // ---- 1-3. evidence panels: presence, distinct labels, links, honest scope
  for (const [target, expected] of PAGES) {
    await fresh(1440, "light", target);
    check(`${target} loads`, (await hash()) === target.replace(/^#/, "#"), await hash());
    await openPanels();
    const got = await panels();
    check(`${target}: ${expected.length} evidence panel(s) in order`, JSON.stringify(got.map((p) => p.id)) === JSON.stringify(expected.map((e) => e[0])), got.map((p) => p.id).join(","));
    for (const e of expected) {
      const p = got.find((x) => x.id === e[0]); if (!p) { check(`${e[0]} present`, false); continue; }
      check(`${e[0]}: badges ${e.slice(1).join(" / ")}`, e.slice(1).every((b) => p.badges.includes(b)), p.badges.join(" / "));
      const links = p.links.filter((l) => l.href);
      if (WITH_SOURCES.has(e[0])) check(`${e[0]}: every source link is an external https link opened safely`, links.length > 0 && links.every((l) => l.href.startsWith("https://") && l.target === "_blank" && /noreferrer/.test(l.rel)), JSON.stringify(links.slice(0, 2)));
      else check(`${e[0]}: states that no source was retrieved and has no links`, links.length === 0 && /Sources retrieved and read None\./.test(p.text), p.text.slice(0, 160));
      check(`${e[0]}: lists assumptions, conditions and what the tool does not support`, /Assumptions/.test(p.text) && /Reference conditions/.test(p.text) && (/Not supported/.test(p.text) || e[0] === "physics-constants"), "");
    }
  }

  // ---- 4. no overclaiming: wording checks on specific panels
  await fresh(1440, "light", "#/biology/neuronal-physiology"); await openPanels();
  let p = (await panels()).find((x) => x.id === "bio-hodgkin-huxley");
  check("Hodgkin-Huxley panel admits the 1952 paper was not retrieved and names squid axon, 6.3 °C", /could not be retrieved/.test(p.text) && /squid giant axon/.test(p.text) && /6\.3 °C/.test(p.text) && /Mammalian neurons or other temperatures/.test(p.text), p.text.slice(0, 200));
  await fresh(1440, "light", "#/general/electrochemistry"); await openPanels();
  p = (await panels()).find((x) => x.id === "gc-electrode-potentials");
  check("electrode-potential panel says the cross-check was a SECONDARY compilation and that the CRC Handbook was not opened", /SECONDARY/.test(p.text) && /not opened/.test(p.text) && /1\.498|0\.022 V/.test(p.text), p.text.slice(0, 200));
  await fresh(1440, "light", "#/biochemistry/fatty-acids-ketone-bodies"); await openPanels();
  p = (await panels()).find((x) => x.id === "biochem-fatty-acid-atp");
  check("fatty-acid panel calls 106 ATP a bookkeeping result under a convention, not a measured yield", /106 ATP/.test(p.text) && /not a measured cellular yield/.test(p.text), p.text.slice(0, 200));
  await fresh(1440, "light", "#/biochemistry/amino-acid-metabolism"); await openPanels();
  p = (await panels()).find((x) => x.id === "biochem-urea-cycle");
  check("urea panel notes the textbook simplifies the nitrogen sources and states 3 ATP / 4 bonds", /two ammonia molecules/.test(p.text) && /Three ATP molecules are consumed but four high-energy phosphate bonds/.test(p.text), p.text.slice(0, 200));

  // ---- 5. provenance statuses on the Biology pages (counts typed independently)
  const prov = () => ev(`(() => { const items = [...document.querySelectorAll('[data-testid=provenance] li')]; const c = { verified: 0, 'partly-verified': 0, 'not-checked': 0 }; for (const i of items) c[i.getAttribute('data-status')] += 1; return { c, links: [...document.querySelectorAll('[data-testid=provenance] a')].map((a) => a.href), text: document.querySelector('[data-testid=provenance]').innerText.replace(/\\s+/g, ' ') }; })()`);
  for (const [target, want] of [["#/biology/apoptosis-autophagy", { verified: 1, "partly-verified": 2, "not-checked": 3 }], ["#/biology/cell-cycle-checkpoints", { verified: 5, "partly-verified": 2, "not-checked": 3 }], ["#/biology/organelles-trafficking", { verified: 3, "partly-verified": 2, "not-checked": 5 }]]) {
    await fresh(1440, "light", target); const r = await prov();
    check(`${target}: provenance counts ${JSON.stringify(want)}`, JSON.stringify(r.c) === JSON.stringify(want), JSON.stringify(r.c));
    check(`${target}: every provenance link is https and partly-verified items state what is not covered`, r.links.length > 0 && r.links.every((h) => h.startsWith("https://")) && (r.c["partly-verified"] === 0 || /not (checked|covered|found)|are not|were not|does not|not in/.test(r.text)), r.links.slice(0, 2).join(" "));
  }
  await fresh(1440, "light", "#/biology/apoptosis-autophagy");
  let t = await bodyText();
  check("apoptosis page: the intrinsic-chain claim is Verified and cites doi.org; Fas/DISC is Not independently checked", /Verified BAX\/BAK oligomerise/.test(t) && /Not independently checked Fas-FADD-DISC/.test(t) && (await prov()).links.some((h) => h.startsWith("https://doi.org/10.5936/csbj.201204007")), "");
  await fresh(1440, "light", "#/biochemistry/fatty-acids-ketone-bodies"); t = await bodyText();
  await ev(`document.querySelectorAll('.provenance-panel details').forEach((d) => { d.open = true; })`);
  const partly = await ev(`[...document.querySelectorAll('.provenance-item')].filter((i) => /Partly checked/.test(i.innerText)).length`);
  check("fatty-acid provenance panel lists exactly one partly-checked claim (β-oxidation location); the rest stay unchecked", partly === 1, String(partly));

  // ---- 6. corrected reference data propagates to the tool
  await fresh(1440, "light", "#/general/stoichiometry");
  await choose("Balance an equation"); await sleep(300);
  await setField("Equation", "Zr + O2 -> ZrO2"); await sleep(500);
  t = await bodyText();
  const nums = [...t.matchAll(/\d{2,3}\.\d{2,3}/g)].map((m) => Number(m[0]));
  check("Zr + O2 -> ZrO2 shows the CIAAW 2024 mass of ZrO2 (91.222 + 2 x 15.999 = 123.220), not the former 123.222", nums.some((n) => Math.abs(n - 123.22) < 0.0006) && !nums.some((n) => Math.abs(n - 123.222) < 0.0006), nums.join(" "));
  await setField("Equation", "Fe + O2 -> Fe2O3"); await sleep(400);
  check("existing behaviour unchanged: Fe + O2 -> Fe2O3 still balances to 4, 3, 2", /4 Fe \+ 3 O₂ → 2 Fe₂O₃/.test(await bodyText()), "");

  // ---- 7. layout and themes: panel readable, no horizontal overflow, light and dark, three widths
  for (const [target, id] of [["#/general/electrochemistry", "gc-electrode-potentials"], ["#/biology/neuronal-physiology", "bio-hodgkin-huxley"], ["#/biology/apoptosis-autophagy", "bio-apoptosis"], ["#/biochemistry/fatty-acids-ketone-bodies", "biochem-fatty-acid-atp"]]) {
    for (const w of [1440, 820, 375]) for (const scheme of ["light", "dark"]) {
      await fresh(w, scheme, target); await openPanels();
      const ps = await panels(); const pp = ps.find((x) => x.id === id);
      const ov = await overflow();
      check(`${id} at ${w}px ${scheme}: no page overflow, panel inside the viewport`, ov <= 0 && pp && pp.sw <= pp.cw + 1 && pp.left >= -1 && pp.right <= w + 1, `overflow ${ov} panel ${pp?.left}-${pp?.right} sw ${pp?.sw}/${pp?.cw}`);
      if (w !== 820) {
        await ev(`document.querySelector('[data-evidence-id=${id}]').scrollIntoView({ block: 'start' })`);
        await shot(`${id}-${w}-${scheme}.png`);
      }
    }
  }
  // text contrast: panel text is not the same colour as its background in either theme
  for (const scheme of ["light", "dark"]) {
    await fresh(1440, scheme, "#/biology/neuronal-physiology"); await openPanels();
    const c = await ev(`(() => { const p = document.querySelector('[data-testid=evidence-panel] .evidence-list dd'); const s = getComputedStyle(p); const l = (c) => { const m = c.match(/\\d+(\\.\\d+)?/g).map(Number).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; }; let bgEl = p; let bg = 'rgba(0, 0, 0, 0)'; while (bgEl && /rgba\\(0, 0, 0, 0\\)|transparent/.test(bg)) { bg = getComputedStyle(bgEl).backgroundColor; bgEl = bgEl.parentElement; } const a = l(s.color), b = l(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); })()`);
    check(`evidence text contrast >= 4.5 in ${scheme} theme`, c >= 4.5, c.toFixed(2));
  }

  // ---- 8. representative workflows still work (the evidence panel sits beside them)
  await fresh(1440, "light", "#/general/gas-laws"); check("gas laws page renders its assumptions panel and the evidence panel", /Assumptions and limits/.test(await bodyText()) && (await panels()).length === 1, "");
  await fresh(1440, "light", "#/biology/neuronal-physiology"); check("neuronal physiology page still shows the action-potential tool", /Hodgkin|action potential/i.test(await bodyText()), "");
  await fresh(1440, "light", "#/physics/overview"); check("physics overview still loads", /Waves|Optics|Mechanics/.test(await bodyText()), "");
} catch (e) {
  check("script completed without an uncaught error", false, e.stack ?? e.message);
} finally {
  const passed = results.filter(Boolean).length;
  console.log(`\nStage 27 browser check: ${passed}/${results.length}`);
  stop();
  process.exit(passed === results.length ? 0 : 1);
}
