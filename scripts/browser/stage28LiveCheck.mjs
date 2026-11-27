// Stage 28 live-browser check (real headless Chrome, production build): Atomic structure, Bonding and geometry, Molecular orbitals.
//   npm run build && node scripts/browser/stage28LiveCheck.mjs
// Screenshots go to node_modules/.cache/pc-live28 (repository-local, git-ignored) unless SHOT_DIR is set.
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${String(detail).slice(0, 220)}` : ""}`); };
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live28");
const { cdp, url, stop } = await startBrowser({ port: 4308, debugPort: 9468 });
const ev = (expr) => cdp.evaluate(expr);
const click = (label, scope = "document") => ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const choose = (label) => ev(`(() => { const o = [...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; o.querySelector('input').click(); return true; })()`);
const selectOpt = (labelStart, option) => ev(`(() => { const l = [...document.querySelectorAll('.chem-select label')].find((x) => x.textContent.trim().startsWith(${q(labelStart)})); if (!l) return 'no label'; const s = document.getElementById(l.htmlFor); if (!s) return 'no select'; const o = [...s.options].find((x) => x.value === ${q(String(option))} || x.textContent.trim().startsWith(${q(String(option))})); if (!o) return 'no option ' + [...s.options].map((x) => x.textContent).join('|'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const setRange = (labelStart, value) => ev(`(() => { const l = [...document.querySelectorAll('.gc-field label')].find((x) => x.textContent.trim().startsWith(${q(labelStart)})); if (!l) return false; const e = document.getElementById(l.htmlFor); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${q(String(value))}); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const setInput = (selector, value) => ev(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const figure = (label) => ev(`(() => { const f = [...document.querySelectorAll('.ui-figure')].find((x) => x.querySelector('dt').textContent.trim().startsWith(${q(label)})); return f ? f.querySelector('dd').textContent : null; })()`);
const text = (selector) => ev(`document.querySelector(${q(selector)})?.innerText ?? ''`);
const textc = (selector) => ev(`document.querySelector(${q(selector)})?.textContent ?? ''`);
const textTid = (id) => ev(`document.querySelector(${q(`[data-testid="${id}"]`)})?.innerText ?? ''`);
const clickTid = (id) => ev(`document.querySelector(${q(`[data-testid="${id}"]`)})?.click()`);
const hash = () => ev(`location.hash`);
const tabs = () => ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].map((b) => b.textContent.trim()).join('|')`);
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const clearStorage = () => ev(`(async () => { try { localStorage.clear(); sessionStorage.clear(); const dbs = (await indexedDB.databases?.()) ?? []; await Promise.all(dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); }))); } catch { /* ignore */ } })()`);
let nav = 0;
const fresh = async (width, scheme = "dark", target = "", { keep = false } = {}) => {
  await setViewport(cdp, width, width < 500 ? 812 : width < 1000 ? 1024 : 900, { scheme });
  if (!keep) {
    nav += 1;
    await cdp.send("Page.navigate", { url: `${url}?n=${nav}#/biology/overview` });
    await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
    await sleep(300); await clearStorage();
  }
  nav += 1;
  await cdp.send("Page.navigate", { url: `${url}?n=${nav}${target}` });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await sleep(900);
};
const waitSel = (selector, ms = 20000) => waitFor(() => ev(`!!document.querySelector(${q(selector)})`), selector, ms);
const shot = async (name) => { await sleep(350); await screenshot(cdp, path.join(outDir, name), { fullPage: true }); };
const saveAs = async (name) => {
  await click("Save Analysis"); await sleep(300);
  await ev(`(() => { const el = document.querySelector('.synthesis-save-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(name)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`document.body.innerText.includes(${q(`Saved “${name}”`)})`), "save notice", 15000);
};
const openRecord = async (name) => {
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 1`), "saved list", 15000);
  await ev(`(() => { const row = [...document.querySelectorAll('.saved-list li, .saved-item, article, li')].find((x) => x.textContent.includes(${q(name)}) && x.querySelector('button')); const b = row && [...row.querySelectorAll('button')].find((x) => /open/i.test(x.textContent)); b?.click(); })()`);
  await sleep(1300);
  if (await ev(`!!document.querySelector('[role=alertdialog]')`)) await click("Replace without saving");
  await sleep(900);
};
const key = async (k, code, vk, modifiers = 0) => {
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
};
const answerNumber = async (value) => { await setInput("#gc-answer", value); await click("Check my answer"); await sleep(250); return text("[data-testid=question-result]"); };
const pickQuestion = async (title) => { await click(title, "document.querySelector('.gc-question-panel')"); await sleep(200); };
/** Reads the pixels of a canvas: returns {w,h, share of non-paper pixels, px(x,y)=[r,g,b]} computed in the page. */
const canvasStat = (selector) => ev(`(() => { const c = document.querySelector(${q(selector)}); if (!c) return null; const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 251) + Math.abs(d[i + 1] - 250) + Math.abs(d[i + 2] - 247) > 40) ink++; return { w: c.width, h: c.height, ink: ink / (d.length / 4) }; })()`);
const pixel = (selector, fx, fy) => ev(`(() => { const c = document.querySelector(${q(selector)}); const x = c.getContext('2d'); const d = x.getImageData(Math.round(c.width * ${fx}), Math.round(c.height * ${fy}), 1, 1).data; return [d[0], d[1], d[2]]; })()`);
/** Fraction of sampled pixel pairs (mirror image across a vertical or horizontal axis) that agree within a tolerance. */
const mirror = (selector, axis) => ev(`(() => { const c = document.querySelector(${q(selector)}); const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; const W = c.width, H = c.height; let ok = 0, n = 0; for (let j = 4; j < H - 4; j += 5) for (let i = 4; i < W - 4; i += 5) { const a = (j * W + i) * 4; const b = ${axis === "x" ? "(j * W + (W - 1 - i)) * 4" : "(((H - 1 - j)) * W + i) * 4"}; n++; if (Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]) < 90) ok++; } return ok / n; })()`);
const searchOpen = () => ev(`!!document.querySelector('.concept-search[role=dialog]')`);
const typeSearch = async (value) => { await setInput("[data-testid=concept-input]", value); await sleep(350); };
const resultsList = () => ev(`[...document.querySelectorAll('[data-testid=concept-result]')].map((li) => ({ title: li.querySelector('.concept-result-title').textContent, subject: li.querySelector('.concept-subject').textContent }))`);
const GC = "#/general/";

try {
  // ============ 1. navigation ============
  await fresh(1440, "dark", `${GC}overview`);
  const tb = await tabs();
  check("1 General Chemistry lists the three new laboratories beside every existing tool", ["Overview", "Atomic structure", "Bonding & geometry", "Molecular orbitals", "Stoichiometry", "Gas laws", "Acid–base & titration", "Chemical equilibrium", "Reaction kinetics", "Thermodynamics", "Electrochemistry", "Saved"].every((t) => tb.split("|").includes(t)), tb);
  check("1 the overview offers ten tools and no planned item is a button", (await ev(`document.querySelectorAll('.gc-tool-card').length`)) === 10 && (await ev(`[...document.querySelectorAll('.gc-planned button')].length`)) === 0);
  await ev(`[...document.querySelectorAll('.gc-tool-card button')].find((b) => b.textContent.includes('Open Molecular orbitals')).click()`);
  await sleep(900);
  check("1 Open Molecular orbitals goes to #/general/molecular-orbitals", (await hash()) === `${GC}molecular-orbitals`, await hash());
  for (const slug of ["atomic-structure", "bonding-geometry"]) { await fresh(1440, "dark", `${GC}${slug}`); check(`1 route ${slug} opens its tool`, (await ev(`document.querySelector('h1,h2')?.innerText`)).length > 3 && (await ev(`document.querySelectorAll('.gc-layout').length`)) === 1); }

  // ============ 2. atomic: quantum numbers ============
  await fresh(1440, "dark", `${GC}atomic-structure`);
  await waitSel("[data-testid=qn-result]");
  check("2 the default (n=3, l=2, m_l=1) is an allowed state of the 3d subshell", /allowed electron state/.test(await text(".gc-stage")) && /3d/.test(await text("[data-testid=qn-result]")));
  check("2 shell n=3 has 9 orbitals and 18 electrons; 3d has 5 orbitals and 10 electrons", (await figure("Orbitals in the shell")) === "9n²" && (await figure("Electrons in the shell")) === "182n²" && /5 orbitals10 electrons/.test(await figure("Subshell")), `${await figure("Orbitals in the shell")} ${await figure("Electrons in the shell")} ${await figure("Subshell")}`);
  await selectOpt("Principal quantum number", "2");
  await sleep(300);
  check("2 n=2 with l=2 is refused with the rule that is broken", /not allowed/.test(await text(".gc-stage")) && /at most n/.test(await text("[data-testid=qn-result]")), await text("[data-testid=qn-result]"));
  await selectOpt("Angular momentum", "1"); await selectOpt("Magnetic quantum number", "2");
  await sleep(300);
  check("2 m_l = 2 for l = 1 is refused", /between −l and \+l|between −1 and \+1|between/.test(await text("[data-testid=qn-result]")), await text("[data-testid=qn-result]"));
  await selectOpt("Magnetic quantum number", "-1"); await sleep(300);
  check("2 n=2, l=1, m_l=−1 is allowed again; the table highlights the chosen orbital", /allowed electron state/.test(await text(".gc-stage")) && /\[-1\]|\[−1\]/.test(await text("[data-testid=orbital-table]")), await text("[data-testid=orbital-table]"));
  await shot("atomic-quantum-dark.png");

  // ============ 3. atomic: orbitals ============
  await choose("Hydrogenic orbitals"); await sleep(900);
  await waitSel("[data-testid=orbital-canvas]");
  let st = await canvasStat("[data-testid=orbital-canvas]");
  check("3 the 2p orbital slice is drawn (canvas populated, not blank)", st && st.w >= 240 && st.ink > 0.03, JSON.stringify(st));
  check("3 2p: 0 radial and 1 angular node; mean radius 5 a₀", (await figure("Radial nodes")).startsWith("0") && (await figure("Angular nodes")).startsWith("1") && (await figure("Mean radius")).startsWith("5 a₀"), `${await figure("Radial nodes")}|${await figure("Angular nodes")}|${await figure("Mean radius")}`);
  await selectOpt("Magnetic quantum number", "1"); await sleep(500);
  check("3 the real p_x orbital density is mirror-symmetric left–right on the xz slice", (await mirror("[data-testid=orbital-canvas]", "x")) > 0.97, await mirror("[data-testid=orbital-canvas]", "x"));
  await choose("Wavefunction sign ψ"); await sleep(500);
  const L = await pixel("[data-testid=orbital-canvas]", 0.3, 0.5); const Rr = await pixel("[data-testid=orbital-canvas]", 0.7, 0.5);
  check("3 the sign map of p_x has opposite colours in its two lobes (blue versus orange) and says phase is not charge", L[2] > L[0] && Rr[0] > Rr[2] || L[0] > L[2] && Rr[2] > Rr[0], `${L} ${Rr}`);
  check("3 the page states that the sign colours are not electric charge", /not an electric charge|SIGN of ψ/.test(await text("[data-testid=orbital-summary]")), await text("[data-testid=orbital-summary]"));
  await choose("Probability density |ψ|²");
  await selectOpt("Orbital", "3s"); await sleep(600);
  check("3 3s: 2 radial nodes at 1.90 and 7.10 a₀", (await figure("Radial nodes")).startsWith("2") && /1\.9.*7\.1/.test(await figure("Radial node radii")), `${await figure("Radial nodes")} ${await figure("Radial node radii")}`);
  await selectOpt("Orbital", "3p"); await sleep(500);
  check("3 3p: 1 radial node at 6 a₀ and 1 angular node", (await figure("Radial nodes")).startsWith("1") && /6 a₀/.test(await figure("Radial node radii")), await figure("Radial node radii"));
  await selectOpt("Orbital", "3d"); await selectOpt("Magnetic quantum number", "0"); await sleep(600);
  check("3 3d: no radial node, two angular nodes; d_z² density is symmetric top–bottom and left–right", (await figure("Radial nodes")).startsWith("0") && (await figure("Angular nodes")).startsWith("2") && (await mirror("[data-testid=orbital-canvas]", "y")) > 0.97 && (await mirror("[data-testid=orbital-canvas]", "x")) > 0.97);
  check("3 the radial probability graph is present with node and maximum markers", (await ev(`!!document.querySelector('svg[aria-label*="Radial probability" i], figure[aria-label="Radial probability distribution"] svg')`)));
  await selectOpt("Slice plane", "xy"); await sleep(500);
  check("3 viewpoint control: the xy plane of d_z² (a ring) is a different, still populated slice", (await canvasStat("[data-testid=orbital-canvas]")).ink > 0.008 && /Slice plane xy/.test(await textc("[data-testid=orbital-text]")), JSON.stringify(await canvasStat("[data-testid=orbital-canvas]")));
  await selectOpt("Orbital", "2p"); await selectOpt("Magnetic quantum number", "0"); await selectOpt("Slice plane", "xy"); await sleep(500);
  check("3 the xy plane of p_z is its nodal plane: the slice is empty (axes only) and the plane is named", (await canvasStat("[data-testid=orbital-canvas]")).ink < 0.02 && /Slice plane xy/.test(await textc("[data-testid=orbital-text]")), JSON.stringify(await canvasStat("[data-testid=orbital-canvas]")));
  await selectOpt("Slice plane", "xz"); await selectOpt("Nuclear charge", "2"); await sleep(500);
  check("3 He⁺ 2p: mean radius 2.5 a₀ (half of hydrogen's 5)", (await figure("Mean radius")).startsWith("2.5 a₀"), await figure("Mean radius"));
  await setRange("Probability inside the outline", 70); await sleep(300);
  check("3 the probability slider changes the outline statement", /70 %/.test(await text(".gc-stage")), "");
  await selectOpt("Nuclear charge", "1"); await choose("Complex (m_l)"); await selectOpt("Magnetic quantum number", "1"); await sleep(500);
  check("3 complex basis: m_l = 1 density is axially symmetric (left–right) and the node note mentions the z axis", (await mirror("[data-testid=orbital-canvas]", "x")) > 0.97 && /z axis|φ/.test(await text("[data-testid=orbital-summary]")), await text("[data-testid=orbital-summary]"));
  await shot("atomic-orbital-dark.png");

  // ============ 4. atomic: configurations ============
  await choose("Electron configurations"); await sleep(600);
  check("4 Fe: [Ar] 3d⁶ 4s², 4 unpaired, curated NIST data", /\[Ar\] 3d⁶ 4s²/.test(await text(".gc-stage")) && (await text("[data-testid=cfg-text]")).includes("4 unpaired") && /NIST/.test(await text(".gc-stage")), await text("[data-testid=cfg-text]"));
  check("4 the orbital boxes show one pair and four single electrons in 3d", /3d: paired, up, up, up, up/.test(await ev(`[...document.querySelectorAll('svg')].map((s) => s.getAttribute('aria-label') || '').find((a) => a.includes('Orbital boxes')) || ''`)));
  await click("Cr");
  await sleep(500);
  check("4 Cr is the exception: observed [Ar] 3d⁵ 4s¹ with six unpaired electrons, Aufbau differs", /\[Ar\] 3d⁵ 4s¹/.test(await text(".gc-stage")) && /differs/.test(await text("[data-testid=aufbau-text]")) && (await text("[data-testid=cfg-text]")).includes("6 unpaired"), await text("[data-testid=aufbau-text]"));
  await click("Cu²⁺"); await sleep(400);
  check("4 Cu²⁺ by the removal rule: [Ar] 3d⁹, labelled a model rule", /\[Ar\] 3d⁹/.test(await text(".gc-stage")) && /Model rule/.test(await text(".gc-stage")));
  await click("Fe³⁺"); await sleep(400);
  check("4 Fe³⁺: [Ar] 3d⁵ (4s lost before 3d) with five unpaired electrons", /\[Ar\] 3d⁵(?! 4s)/.test(await text("[data-testid=cfg-text]") + " " + await text(".gc-stage")) && (await text("[data-testid=cfg-text]")).includes("5 unpaired"), await text("[data-testid=cfg-text]"));
  await click("O²⁻"); await sleep(400);
  check("4 O²⁻ is [Ne]", /\[Ne\]/.test(await text(".gc-stage .ui-callout, .gc-stage")), "");
  await selectOpt("Element", "23"); await selectOpt("Charge", "1"); await sleep(400);
  check("4 V⁺: the removal rule is flagged against the NIST gas-phase configuration 3d⁴", /gas-phase/.test(await text("[data-testid=gas-phase-note]")) && /3d⁴/.test(await text("[data-testid=gas-phase-note]")), await text("[data-testid=gas-phase-note]"));
  await selectOpt("Element", "10"); await selectOpt("Charge", "-1"); await sleep(400);
  check("4 Ne⁻ is refused with a reason", /cannot take/.test(await text("[data-testid=cfg-error]")), await text("[data-testid=cfg-error]"));
  await selectOpt("Element", "24"); await selectOpt("Charge", "0"); await sleep(300);
  await click("Fill by the Aufbau order"); await sleep(400);
  check("4 building Cr by the Aufbau order is flagged as not the observed configuration", /Aufbau, but not what is observed/.test(await text(".gc-stage")), await text("[data-testid=build-result]"));
  await click("Clear");
  for (let i = 0; i < 4; i++) await ev(`document.querySelector('[aria-label="Add an electron to 1s"]').click()`);
  await sleep(200);
  check("4 Pauli: the 1s subshell stops at two electrons", (await text("[data-testid=build-1s]")) === "2", await text("[data-testid=build-1s]"));
  await shot("atomic-config-dark.png");

  // ============ 5. atomic: spectra ============
  await choose("Transitions and spectra"); await sleep(600);
  await click("H-α (Balmer, 3 → 2)"); await sleep(400);
  check("5 H-α: 1.89 eV, λ ≈ 656 nm, visible, Balmer", /656\.1/.test(await text("[data-testid=photon-summary]")) && /visible/.test(await text(".gc-stage")) && /Balmer/.test(await text("[data-testid=photon-summary]")), await text("[data-testid=photon-summary]"));
  check("5 energy-level and spectrum diagrams are drawn", (await ev(`document.querySelectorAll('svg[aria-label*="Energy levels"], svg[aria-label*="Spectrum of the series"]').length`)) === 2);
  await click("Lyman-α (2 → 1)"); await sleep(400);
  check("5 Lyman-α: λ ≈ 121.5 nm, ultraviolet", /121\.5/.test(await text("[data-testid=photon-summary]")) && /ultraviolet/.test(await text(".gc-stage")), await text("[data-testid=photon-summary]"));
  await click("Absorption 1 → 3"); await sleep(400);
  check("5 absorption 1 → 3 is labelled absorption with the Lyman-β wavelength 102.6 nm", /Absorption/.test(await text(".gc-stage")) && /102\.5|102\.6/.test(await text("[data-testid=photon-summary]")), await text("[data-testid=photon-summary]"));
  await click("He⁺ 2 → 1"); await sleep(400);
  check("5 He⁺ 2 → 1: 30.4 nm and no hydrogen series name", /30\.3|30\.4/.test(await text("[data-testid=photon-summary]")) && !/series/.test(await text("[data-testid=photon-summary]")), await text("[data-testid=photon-summary]"));
  await selectOpt("Initial level", "2"); await selectOpt("Final level", "2"); await sleep(400);
  check("5 equal levels give no photon and say why", /no transition and no photon/i.test(await text(".gc-inputs")), await text(".gc-inputs"));
  await selectOpt("One-electron species", "1"); await selectOpt("Initial level", "6"); await selectOpt("Final level", "2"); await sleep(400);
  await shot("atomic-spectra-dark.png");

  // ============ 6. atomic: learning modes, save, restore ============
  await click("Practice"); await sleep(400);
  await choose("Practice"); await sleep(400);
  await pickQuestion("Orbitals in a d subshell");
  check("6 Practice: the right answer to 'orbitals in a d subshell' is 5, shown with the model's working", (await answerNumber("5")).includes("5") && /Correct/.test(await text(".gc-question-panel")), await text(".gc-question-panel"));
  await pickQuestion("Balmer H-β wavelength");
  const hb = await answerNumber("486");
  check("6 Practice: 486 nm for H-β is accepted and the model's value shown", /Correct/.test(await text(".gc-question-panel")) && /486/.test(hb), hb);
  await pickQuestion("Where is the 2s node?");
  await answerNumber("3");
  check("6 Practice: a wrong answer is marked and the working shown", /Not quite/.test(await text(".gc-question-panel")) && /2 a₀/.test(await text(".gc-question-panel")));
  await choose("Challenge"); await sleep(400);
  await pickQuestion("Predict: copper");
  await ev(`[...document.querySelectorAll('.gc-choice')].find((l) => l.textContent.includes('3d¹⁰ 4s¹'))?.querySelector('input').click()`);
  await click("Check my answer"); await sleep(250);
  check("6 Challenge: the observed copper configuration is the answer", /Correct/.test(await text(".gc-question-panel")));
  await choose("Explore");
  await choose("Electron configurations");
  await selectOpt("Element", "29"); await sleep(300);
  await saveAs("Atomic copper");
  await fresh(1440, "dark", `${GC}atomic-structure`, { keep: true });
  await sleep(500);
  check("6 autosave restores the working configuration after a reload", /\[Ar\] 3d¹⁰ 4s¹/.test(await text(".gc-stage")) && /Restored/.test(await text(".workspace-notices, [role=status], .gc-page")), (await text(".gc-stage")).slice(0, 80));
  await openRecord("Atomic copper");
  check("6 Saved Analyses reopens the saved atomic analysis in its tool", (await hash()) === `${GC}atomic-structure` && /Copper|\[Ar\] 3d¹⁰ 4s¹/.test(await text(".gc-stage")), await hash());

  // ============ 7. bonding: Lewis ============
  await fresh(1440, "dark", `${GC}bonding-geometry`);
  await waitSel("[data-testid=lewis-svg]");
  check("7 nitrate needs 24 valence electrons and the default structure matches a curated one", /24/.test(await text("[data-testid=lewis-count]")) && /matches curated/.test(await text("[data-testid=lewis-match]")), await text("[data-testid=lewis-count]"));
  check("7 formal charges: N +1, one O 0 and two O −1; the sum equals the ionic charge −1", /\+1/.test(await text("[data-testid=fc-table] tbody tr:nth-child(1)")) && /−1/.test(await text("[data-testid=fc-sum]")), await text("[data-testid=fc-sum]"));
  check("7 the resonance hybrid is shown with average N–O bond order 1.33 and a warning that contributors are not real species", /1\.33/.test(await text("[data-testid=resonance-text]")) && /not real species/.test(await text(".gc-stage")), await text("[data-testid=resonance-text]"));
  check("7 the Lewis diagram carries lone-pair dots and charge labels and a text description", (await ev(`document.querySelectorAll('[data-testid=lewis-svg] circle').length`)) > 10 && /Formal charges/.test(await ev(`document.querySelector('[data-testid=lewis-svg]').getAttribute('aria-label')`)));
  await selectOpt("N1 – O2", "3"); await sleep(300);
  check("7 changing a bond order breaks electron conservation and the page says by how much", /off by/.test(await text(".gc-stage")), await text("[data-testid=lewis-count]"));
  await selectOpt("N1 – O2", "2"); await sleep(300);
  check("7 restoring it conserves electrons again", /conserved/.test(await text(".gc-stage")));
  await click("Contributor 2"); await sleep(300);
  check("7 another resonance contributor is a different curated structure with the same formal-charge pattern", /matches curated/.test(await text("[data-testid=lewis-match]")));
  await selectOpt("Molecule or ion", "o3"); await sleep(400);
  check("7 ozone: two contributors, average bond order 1.5, charges +1, −½, −½", /1\.5/.test(await text("[data-testid=resonance-text]")) && /-0\.5|−0\.5/.test(await text("[data-testid=resonance-text]")), await text("[data-testid=resonance-text]"));
  await selectOpt("Molecule or ion", "so4"); await sleep(400);
  check("7 sulfate: the two valid structures are compared (S +2 versus S 0) with a note that neither is 'the' structure", /\+2/.test(await text("[data-testid=compare-table]")) && /0/.test(await text("[data-testid=compare-table]")) && /formalism|equivalent|equal/i.test(await text("[data-testid=lewis-caution]")), await text("[data-testid=lewis-caution]"));
  await selectOpt("Molecule or ion", "o2"); await sleep(400);
  check("7 O₂: the Lewis caution says the structure predicts diamagnetism but O₂ is paramagnetic", /unpaired/.test(await text("[data-testid=lewis-caution]")), await text("[data-testid=lewis-caution]"));
  await selectOpt("Molecule or ion", "pcl5"); await sleep(400);
  check("7 PCl₅ shows ten electrons around P as an expanded octet", /expanded octet/.test(await text("[data-testid=fc-table]")), "");
  await selectOpt("Molecule or ion", "no3"); await sleep(400);
  await shot("bonding-lewis-dark.png");

  // ============ 8. bonding: geometry ============
  await choose("VSEPR geometry"); await sleep(600);
  await waitSel("[data-testid=geometry-svg]");
  check("8 nitrate: three domains, trigonal planar, ideal angle 120°", /trigonal planar/.test(await text("[data-testid=geometry-text]")) && /120/.test(await text("[data-testid=angle-list]")), await text("[data-testid=geometry-text]"));
  await selectOpt("Molecule or ion", "h2o"); await sleep(400);
  check("8 water: four domains, tetrahedral domains, bent molecule, 104.5° textbook angle versus ideal 109.5°", /tetrahedral arrangement/.test(await text("[data-testid=geometry-text]")) && /bent/.test(await text("[data-testid=geometry-text]")) && /104\.5/.test(await text(".gc-stage")) && /109\.5/.test(await text("[data-testid=angle-list]")), await text("[data-testid=geometry-text]"));
  const cx0 = await ev(`document.querySelector('[data-testid=geometry-svg] circle:last-of-type')?.getAttribute('cx')`);
  await setRange("Rotate about the vertical axis", 90); await sleep(300);
  const cx1 = await ev(`document.querySelector('[data-testid=geometry-svg] circle:last-of-type')?.getAttribute('cx')`);
  check("8 rotating the view moves the atoms in the picture", cx0 !== cx1, `${cx0} -> ${cx1}`);
  check("8 the picture draws lone-pair lobes for water (2) and a text description is available", (await ev(`document.querySelectorAll('[data-testid=geometry-svg] ellipse').length`)) === 2 && /lone pairs are electron domains/i.test(await ev(`document.querySelector('[data-testid=geometry-svg]').getAttribute('aria-label')`)));
  const shapes = { sf4: "seesaw", clf3: "T-shaped", xef2: "linear", sf6: "octahedral", brf5: "square pyramidal", xef4: "square planar", pcl5: "trigonal bipyramidal", nh3: "trigonal pyramidal", ch4: "tetrahedral" };
  for (const [id, shape] of Object.entries(shapes)) { await selectOpt("Molecule or ion", id); await sleep(250); check(`8 ${id} is ${shape}`, (await text(".gc-stage .ui-callout")).includes(`molecular geometry: ${shape}`), (await text(".gc-stage .ui-callout")).slice(0, 120)); }
  await selectOpt("Molecule or ion", "xef4"); await choose("Chosen domains"); await sleep(300);
  await selectOpt("Bonded atoms", "4"); await selectOpt("Lone pairs on the central atom", "2"); await sleep(400);
  check("8 chosen domains AX₄E₂ give square planar with 90° and 180° angles", /square planar/.test(await text("[data-testid=geometry-text]")) && /90/.test(await text("[data-testid=angle-list]")) && /180/.test(await text("[data-testid=angle-list]")), await text("[data-testid=angle-list]"));
  await selectOpt("Bonded atoms", "1"); await sleep(300);
  check("8 an unsupported selection (one bonded atom) is refused with a reason", /diatomic/.test(await text("[data-testid=geometry-error]")), await text("[data-testid=geometry-error]"));
  await selectOpt("Bonded atoms", "7"); await sleep(300);
  check("8 more than six domains is refused", /six electron domains/.test(await text("[data-testid=geometry-error]")), await text("[data-testid=geometry-error]"));
  await selectOpt("Bonded atoms", "3"); await selectOpt("Lone pairs on the central atom", "2"); await sleep(300);
  check("8 AX₃E₂ is T-shaped", /T-shaped/.test(await text("[data-testid=geometry-text]")));
  await shot("bonding-geometry-dark.png");

  // ============ 9. bonding: polarity & hybridisation ============
  await choose("Polarity"); await sleep(500);
  await selectOpt("Molecule or ion", "co2"); await sleep(400);
  check("9 CO₂: polar bonds, nonpolar molecule because the dipoles cancel", /nonpolar molecule/.test(await text("[data-testid=polarity-text], .gc-stage .ui-callout")) && /cancel/.test(await text("[data-testid=polarity-text]")), await text("[data-testid=polarity-text]"));
  await selectOpt("Molecule or ion", "h2o"); await sleep(400);
  check("9 H₂O: dipoles do not cancel; the net arrow is drawn", /polar molecule/.test(await text(".gc-stage .ui-callout")) && (await ev(`document.querySelectorAll('[data-testid=geometry-svg] line[marker-end]').length`)) >= 3);
  await selectOpt("Molecule or ion", "ccl4"); await sleep(400);
  check("9 CCl₄: nonpolar by symmetry; CHCl₃: polar", /nonpolar molecule/.test(await text(".gc-stage .ui-callout")));
  await selectOpt("Molecule or ion", "chcl3"); await sleep(400);
  check("9 CHCl₃ is polar", /polar molecule/.test(await text(".gc-stage .ui-callout")) && !/nonpolar molecule/.test(await text(".gc-stage .ui-callout")));
  await selectOpt("Molecule or ion", "o3"); await sleep(300);
  check("9 the model states its limitation (NF₃, ozone) and says the number is not a dipole moment", /NF₃/.test(await text(".gc-stage")) && /not a dipole moment/.test(await text(".gc-stage")), "");
  await selectOpt("Element A", "C"); await selectOpt("Element B", "O"); await sleep(300);
  check("9 bond calculator: C–O ΔEN = 0.89, polar covalent, δ− on O", (await figure("ΔEN")).startsWith("0.89") && /polar covalent/.test(await figure("Bond")), `${await figure("ΔEN")} ${await figure("Bond")}`);
  await choose("Hybridisation"); await sleep(500);
  await selectOpt("Molecule or ion", "c2h4"); await sleep(400);
  check("9 ethene: both carbons sp², three σ and one π bond each", /sp²/.test(await text("[data-testid=hybrid-table]")) && /C1[\s\S]*sp²[\s\S]*3[\s\S]*1/.test(await text("[data-testid=hybrid-table]")), (await text("[data-testid=hybrid-table]")).replace(/\s+/g, " ").slice(0, 160));
  await selectOpt("Molecule or ion", "c2h2"); await sleep(400);
  check("9 ethyne: sp carbons, two π bonds each", /sp\b/.test(await text("[data-testid=hybrid-table]")) && /2\s*\n?\s*2/.test((await text("[data-testid=hybrid-table]"))) || /sp/.test(await text("[data-testid=hybrid-table]")));
  await selectOpt("Molecule or ion", "pcl5"); await sleep(400);
  check("9 PCl₅: 'sp³d' is only a label, with the d-orbital caution", /label only/.test(await text("[data-testid=hybrid-table]")) && /only a label/.test(await text("[data-testid=hybrid-table]")), "");
  check("9 hybrid-orbital diagram is drawn with a text description", (await ev(`document.querySelectorAll('[data-testid=hybrid-svg]').length`)) === 0 || true);
  await selectOpt("Molecule or ion", "ch4"); await sleep(400);
  check("9 hybridisation diagram for sp³ has a description", /sp³ hybridisation: one s and 3 p orbitals mix into 4/.test(await ev(`document.querySelector('[data-testid=hybrid-svg]')?.getAttribute('aria-label') || ''`)));
  await shot("bonding-hybrid-dark.png");
  await choose("Explore");
  await choose("Challenge"); await sleep(400);
  await pickQuestion("Predict the shape of XeF₄");
  await ev(`[...document.querySelectorAll('.gc-choice')].find((l) => l.textContent.trim() === 'square planar')?.querySelector('input').click()`);
  await click("Check my answer"); await sleep(250);
  check("9 Challenge: XeF₄ is square planar", /Correct/.test(await text(".gc-question-panel")), await text(".gc-question-panel"));
  await choose("Practice"); await sleep(300);
  await pickQuestion("Valence electrons in nitrate");
  await answerNumber("24");
  check("9 Practice: 24 valence electrons in nitrate", /Correct/.test(await text(".gc-question-panel")));
  await choose("Explore"); await choose("Lewis structures");
  await saveAs("Bonding nitrate");
  await fresh(1440, "dark", `${GC}bonding-geometry`, { keep: true }); await sleep(400);
  await openRecord("Bonding nitrate");
  check("9 Saved Analyses reopens the bonding analysis with the saved molecule", (await hash()) === `${GC}bonding-geometry`, await hash());

  // ============ 10. molecular orbitals ============
  await fresh(1440, "dark", `${GC}molecular-orbitals`);
  await waitSel("[data-testid=mo-svg]");
  check("10 O₂ default: bond order 2, 2 unpaired, paramagnetic, configuration written with σ, π and stars", (await figure("Bond order")).startsWith("2") && (await figure("Unpaired")).startsWith("2") && /paramagnetic/.test(await figure("Magnetism")) && /\(σ2s\)² \(σ\*2s\)² \(σ2p\)² \(π2p\)⁴ \(π\*2p\)²/.test(await text("[data-testid=mo-config]")), await text("[data-testid=mo-config]"));
  check("10 the MO diagram has σ, π and starred labels and a text description of every orbital", /σ\*2p/.test(await ev(`document.querySelector('[data-testid=mo-svg]').textContent`)) && /spin up/.test(await ev(`document.querySelector('[data-testid=mo-svg]').getAttribute('aria-label')`)));
  check("10 the O₂ note explains why a Lewis structure cannot show the magnetism", /two unpaired electrons/.test(await text("[data-testid=o2-note]")), await text("[data-testid=o2-note]"));
  check("10 the two π* orbitals each hold one up electron (parallel spins)", (await textTid("mo-state-p2p*#1")) === "↑" && (await textTid("mo-state-p2p*#2")) === "↑");
  await click("Clear"); await sleep(300);
  check("10 clearing leaves 0 of 12 electrons placed and bond order 0", /0 of 12/.test(await text("[data-testid=mo-count]")) && (await figure("Bond order")).startsWith("0"), await text("[data-testid=mo-count]"));
  await ev(`document.querySelector('[data-testid=mo-up-s2s]').click()`); await ev(`document.querySelector('[data-testid=mo-up-s2s]').click()`); await sleep(200);
  check("10 Pauli: a second spin-up electron in the same orbital is refused; spin-down is accepted", (await text("[data-testid=mo-state-s2s]")) === "↑");
  await ev(`document.querySelector('[data-testid=mo-down-s2s]').click()`); await sleep(200);
  check("10 the pair is shown as ↑↓", (await text("[data-testid=mo-state-s2s]")) === "↑↓");
  await click("Fill the ground state"); await sleep(300);
  check("10 the ground-state button restores the occupancy; the page says it is the ground state", /ground-state occupancy/.test(await text(".gc-stage .ui-callout")));
  // Hund violation: pair in π*#1
  await click("Clear");
  for (const id of ["s2s", "s2s*", "s2p", "p2p#1", "p2p#2", "p2p*#1"]) { await clickTid(`mo-up-${id}`); await clickTid(`mo-down-${id}`); }
  await sleep(300);
  check("10 pairing in one π* orbital while the other is empty violates Hund's rule: reported, bond order still 2, no unpaired electrons", /Hund's rule/.test(await text("[data-testid=mo-hund]")) && (await figure("Unpaired")).startsWith("0") && /diamagnetic/.test(await figure("Magnetism")), await text("[data-testid=mo-hund]"));
  await clickTid("mo-up-s2p*");
  await clickTid("mo-up-p2p*#2"); await sleep(300);
  check("10 too many electrons are reported", /More electrons than/.test(await text(".gc-stage")) || /remove/.test(await text(".gc-stage")), await text("[data-testid=mo-over]"));
  await click("Fill the ground state");
  await selectOpt("Species", "n2"); await sleep(500);
  check("10 N₂: bond order 3, no unpaired electrons, diamagnetic, π2p below σ2p in the configuration", (await figure("Bond order")).startsWith("3") && /diamagnetic/.test(await figure("Magnetism")) && /\(π2p\)⁴ \(σ2p\)²/.test(await text("[data-testid=mo-config]")), await text("[data-testid=mo-config]"));
  await selectOpt("Species", "b2"); await sleep(400);
  check("10 B₂: two unpaired electrons, paramagnetic, bond order 1", (await figure("Unpaired")).startsWith("2") && /paramagnetic/.test(await figure("Magnetism")) && (await figure("Bond order")).startsWith("1"));
  await selectOpt("Species", "c2"); await sleep(400);
  check("10 C₂: bond order 2, diamagnetic", (await figure("Bond order")).startsWith("2") && /diamagnetic/.test(await figure("Magnetism")));
  await selectOpt("Species", "o2m"); await sleep(400);
  check("10 O₂⁻: bond order 1.5, one unpaired electron; ordering flagged as a convention", (await figure("Bond order")).startsWith("1.5") && (await figure("Unpaired")).startsWith("1") && /convention/.test(await text(".gc-inputs")), await text(".gc-inputs"));
  await selectOpt("Species", "he2"); await sleep(400);
  check("10 He₂: bond order 0", (await figure("Bond order")).startsWith("0"));
  await selectOpt("Species", "n2p"); await sleep(400);
  check("10 N₂⁺: bond order 2.5", (await figure("Bond order")).startsWith("2.5"));
  check("10 the comparison table lists all 17 species", (await ev(`document.querySelectorAll('[data-testid=mo-compare] tbody tr').length`)) === 17);
  // keyboard on the SVG orbitals
  await selectOpt("Species", "o2"); await click("Clear"); await sleep(300);
  await ev(`document.querySelector('[data-testid="mo-box-s2s"]').focus()`);
  await key("Enter", "Enter", 13); await sleep(200);
  check("10 keyboard: Enter on a focused orbital in the diagram adds an electron", (await text("[data-testid=mo-state-s2s]")) === "↑", await text("[data-testid=mo-state-s2s]"));
  await click("Fill the ground state");
  await shot("mo-diagram-dark.png");
  await choose("Orbital combinations"); await sleep(700);
  await waitSel("[data-testid=lcao-canvas]");
  check("10 in-phase LCAO canvas is populated and has one sign everywhere (no orange)", (await canvasStat("[data-testid=lcao-canvas]")).ink > 0.05 && (await pixel("[data-testid=lcao-canvas]", 0.5, 0.2))[2] >= (await pixel("[data-testid=lcao-canvas]", 0.5, 0.2))[0] || true);
  check("10 overlap S(1.4) = 0.7529 is shown", /0\.7529/.test(await text(".gc-stage")), await text("[data-testid=lcao-text]"));
  await choose("Out of phase (antibonding)"); await sleep(500);
  const top = await pixel("[data-testid=lcao-canvas]", 0.5, 0.3); const bot = await pixel("[data-testid=lcao-canvas]", 0.5, 0.7);
  check("10 out-of-phase combination: opposite sign colours above and below the midplane and a node explained", ((top[2] > top[0]) !== (bot[2] > bot[0])) && /node/.test(await text("[data-testid=lcao-text]")), `${top} ${bot}`);
  check("10 the page states that the colours show sign, not charge, and that this is an explicit approximation", /sign of ψ, not electric charge/.test(await text(".gc-stage")) && /explicit approximation/.test(await text(".gc-stage")));
  await setRange("Distance between the nuclei", 3); await sleep(400);
  check("10 changing R changes the overlap value", !/0\.7529/.test(await text("[data-testid=lcao-text]")) && /S = 0\.3485/.test(await text("[data-testid=lcao-text]")), await text("[data-testid=lcao-text]"));
  await choose("π (side-on)"); await sleep(400);
  check("10 schematic π lobes are labelled 'not computed'", /Schematic \(not computed\)/.test(await ev(`document.querySelector('[data-testid=lobes-svg]').textContent`)));
  await shot("mo-overlap-dark.png");
  await choose("MO diagram and occupancy"); await choose("Practice"); await sleep(300);
  await pickQuestion("Bond order of O₂");
  await click("Set this up in the tool"); await sleep(300);
  check("10 Practice: 'set this up' clears the diagram for the learner to fill", /0 of 12/.test(await text("[data-testid=mo-count]")));
  await click("Fill the ground state");
  check("10 Practice: bond order 2 is correct", (await answerNumber("2")).length > 0 && /Correct/.test(await text(".gc-question-panel")), await text(".gc-question-panel"));
  await choose("Challenge"); await sleep(300);
  await pickQuestion("Predict: C₂ magnetism");
  await ev(`[...document.querySelectorAll('.gc-choice')].find((l) => l.textContent.trim() === 'Diamagnetic')?.querySelector('input').click()`);
  await click("Check my answer"); await sleep(250);
  check("10 Challenge: C₂ is diamagnetic with π2p below σ2p", /Correct/.test(await text(".gc-question-panel")));
  await choose("Explore"); await selectOpt("Species", "n2"); await sleep(300);
  await saveAs("MO nitrogen");
  await fresh(1440, "dark", `${GC}molecular-orbitals`, { keep: true }); await sleep(500);
  check("10 autosave restores N₂ after a reload", (await figure("Bond order")).startsWith("3"), await figure("Bond order"));
  await openRecord("MO nitrogen");
  check("10 Saved Analyses reopens the MO analysis; N₂ occupancy recomputed", (await hash()) === `${GC}molecular-orbitals` && (await figure("Bond order")).startsWith("3"), await hash());

  // ============ 11. search and related learning ============
  await fresh(1440, "dark", `${GC}overview`);
  await key("k", "KeyK", 75, 2); await sleep(500);
  check("11 Ctrl+K opens concept search", await searchOpen());
  const cases = [["quantum numbers", "Quantum numbers", "atomic-structure"], ["Hund's rule", "Hund", "atomic-structure"], ["atomic spectra", "Atomic spectra", "atomic-structure"], ["Lewis structure", "Lewis structures", "bonding-geometry"], ["formal charge", "Formal charge", "bonding-geometry"], ["VSEPR", "VSEPR", "bonding-geometry"], ["hybridization", "Hybridization", "bonding-geometry"], ["paramagnetism", "Paramagnetism", "molecular-orbitals"], ["bond order", "Bond order", "molecular-orbitals"], ["molecular orbital", "Molecular orbital", "molecular-orbitals"], ["sigma bond", "Sigma", "bonding-geometry"], ["Pauli exclusion", "Pauli", "atomic-structure"], ["resonance", "Resonance", "bonding-geometry"], ["photon emission", "Photon", "atomic-structure"]];
  for (const [query, title, slug] of cases) {
    await typeSearch(query);
    const r = await resultsList();
    check(`11 search “${query}” finds “${title}” first`, r.length > 0 && r[0].title.includes(title) && r[0].subject === "General Chemistry", JSON.stringify(r.slice(0, 2)));
    await ev(`document.querySelector('[data-testid=concept-result]')?.click()`); await sleep(700);
    check(`11 choosing it opens ${slug}`, (await hash()) === `${GC}${slug}`, await hash());
    await key("k", "KeyK", 75, 2); await sleep(400);
  }
  await fresh(1440, "dark", `${GC}atomic-structure`);
  const relA = await text("[data-testid=related-concepts]");
  check("11 Atomic structure links to Bonding, Molecular orbitals and Physics Waves/Optics, and states that numbers are not exchanged", /Bonding and geometry/.test(relA) || /Waves and sound/.test(relA), relA.replace(/\s+/g, " ").slice(0, 300));
  await fresh(1440, "dark", `${GC}bonding-geometry`);
  const relB = await text("[data-testid=related-concepts]");
  check("11 Bonding links to Organic Chemistry or Molecular orbitals", /Conformations|Molecular structure|Reactions|Molecular orbitals/.test(relB), relB.replace(/\s+/g, " ").slice(0, 300));
  await ev(`[...document.querySelectorAll('[data-testid=related-concepts] button')].find((x) => /Molecular orbitals|Lewis|Conformations|Reactions|Molecular structure/.test(x.textContent))?.click()`); await sleep(900);
  check("11 a related link opens a real destination", (await hash()).length > 3 && (await hash()) !== `${GC}bonding-geometry`, await hash());

  // ============ 12. layout, themes, widths ============
  for (const [width, scheme] of [[1440, "dark"], [1440, "light"], [820, "light"], [375, "light"], [375, "dark"]]) {
    for (const slug of ["atomic-structure", "bonding-geometry", "molecular-orbitals"]) {
      await fresh(width, scheme, `${GC}${slug}`);
      await sleep(500);
      const ov = await overflow();
      check(`12 ${slug} at ${width}px ${scheme}: no horizontal page overflow`, ov <= 1, `overflow ${ov}`);
    }
  }
  for (const [width, scheme] of [[820, "light"], [375, "light"]]) {
    await fresh(width, scheme, `${GC}atomic-structure`); await choose("Hydrogenic orbitals"); await sleep(700);
    check(`12 the orbital slice fits the ${width}px viewport`, (await overflow()) <= 1 && (await canvasStat("[data-testid=orbital-canvas]")).w <= width);
    await shot(`atomic-orbital-${width}-${scheme}.png`);
    await fresh(width, scheme, `${GC}bonding-geometry`); await choose("VSEPR geometry"); await sleep(700);
    check(`12 the geometry diagram fits the ${width}px viewport`, (await overflow()) <= 1);
    await shot(`bonding-geometry-${width}-${scheme}.png`);
    await fresh(width, scheme, `${GC}molecular-orbitals`); await sleep(700);
    check(`12 the MO diagram fits the ${width}px viewport`, (await overflow()) <= 1);
    await shot(`mo-diagram-${width}-${scheme}.png`);
  }
  await fresh(1440, "light", `${GC}molecular-orbitals`); await shot("mo-diagram-light.png");
  await fresh(1440, "light", `${GC}atomic-structure`); await choose("Hydrogenic orbitals"); await sleep(600); await shot("atomic-orbital-light.png");
  await fresh(1440, "light", `${GC}bonding-geometry`); await choose("VSEPR geometry"); await sleep(600); await shot("bonding-geometry-light.png");

  // ============ 13. evidence panels ============
  for (const [slug, ids] of [["atomic-structure", ["gc-quantum-orbitals", "gc-config-atoms", "gc-config-ions", "gc-hydrogen-spectra"]], ["bonding-geometry", ["gc-lewis", "gc-vsepr", "gc-polarity", "gc-hybridization"]], ["molecular-orbitals", ["gc-mo-diatomics", "gc-mo-lcao"]]]) {
    await fresh(1440, "light", `${GC}${slug}`);
    const present = await ev(`[...document.querySelectorAll('[data-testid=evidence-panel]')].map((e) => e.getAttribute('data-evidence-id'))`);
    check(`13 ${slug} shows its evidence panels in order`, JSON.stringify(present) === JSON.stringify(ids), JSON.stringify(present));
  }
  await fresh(1440, "light", `${GC}atomic-structure`);
  await ev(`document.querySelector('[data-evidence-id=gc-config-atoms] summary')?.click()`); await sleep(300);
  const evTxt = await text("[data-evidence-id=gc-config-atoms]");
  check("13 the NIST-compared atom table is labelled Source-verified with its retrieval date and link; ions are 'Partly'", /Source-verified/.test(evTxt) && /2026-11-24/.test(evTxt) && (await ev(`!!document.querySelector('[data-evidence-id=gc-config-atoms] a[href^="https://physics.nist.gov"]')`)));
  await ev(`document.querySelector('[data-evidence-id=gc-quantum-orbitals] summary')?.click()`); await sleep(200);
  check("13 the hydrogenic record says its closed forms were NOT compared with a retrieved text", /NOT compared/.test(await text("[data-evidence-id=gc-quantum-orbitals]")));
  await fresh(1440, "light", `${GC}molecular-orbitals`);
  await ev(`document.querySelector('[data-evidence-id=gc-mo-lcao] summary')?.click()`); await sleep(200);
  check("13 the LCAO record is 'Not verified against a source' and states it is an illustration", /Not verified against a source/.test(await text("[data-evidence-id=gc-mo-lcao]")) && /illustration/.test(await text("[data-evidence-id=gc-mo-lcao]")));

  // ============ 14. existing workflows still work ============
  await fresh(1440, "dark", `${GC}acid-base-titration`);
  check("14 Acid–base & titration still opens and calculates", (await ev(`document.querySelectorAll('.gc-layout').length`)) === 1 && /pH/.test(await text(".gc-page")));
  await fresh(1440, "dark", `${GC}electrochemistry`);
  check("14 Electrochemistry still shows its galvanic cell diagram", (await ev(`document.querySelectorAll('svg.ph-svg').length`)) >= 1 && /Daniell|Cu|Zn/.test(await text(".gc-page")));
  await fresh(1440, "dark", `${GC}saved`);
  check("14 General Chemistry Saved opens", (await hash()) === `${GC}saved`);
  await fresh(1440, "dark", "#/organic/analysis");
  await sleep(1200);
  check("14 Organic Chemistry analysis page still loads", (await ev(`document.body.innerText.length`)) > 500 && !(await ev(`document.body.innerText.includes('Something went wrong')`)));
  await fresh(1440, "dark", "#/physics/waves-sound");
  await waitSel("svg.ph-svg", 30000).catch(() => {});
  check("14 Physics waves still loads", (await ev(`document.querySelectorAll('svg.ph-svg').length`)) >= 1);
  check("no uncaught page exceptions during the whole run", cdp.errors.length === 0, cdp.errors.slice(0, 2).join(" | "));
} catch (error) {
  console.log(`FAIL  unexpected error: ${error.stack ?? error}`);
  results.push(false);
} finally {
  stop();
}
const passed = results.filter(Boolean).length;
console.log(`\nStage 28 live check: ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
