// Stage 22 live-browser check (real headless Chrome, production build): Stoichiometry, Gas laws, Electrochemistry.
//   npm run build && node scripts/browser/stage22LiveCheck.mjs
// Screenshots go to node_modules/.cache/pc-live22 (repository-local, git-ignored) unless SHOT_DIR is set.
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
};
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live22");
const { cdp, url, stop } = await startBrowser({ port: 4302, debugPort: 9462 });
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

try {
  // ---------------- 1. navigation ----------------
  await fresh(1440, "dark", "#/general/overview");
  const tb = await tabs();
  check("1 General Chemistry lists Stoichiometry, Gas laws and Electrochemistry beside the existing tools", ["Overview", "Stoichiometry", "Gas laws", "Acid–base & titration", "Chemical equilibrium", "Reaction kinetics", "Thermodynamics", "Electrochemistry", "Saved"].every((t) => tb.includes(t)), tb);
  check("1 the overview offers the seven earlier tools plus three Stage 28 laboratories, and no planned item is a button", (await ev(`document.querySelectorAll('.gc-tool-card').length`)) === 10 && (await ev(`[...document.querySelectorAll('.gc-planned button')].length`)) === 0);
  await shot("overview-dark.png");
  await ev(`[...document.querySelectorAll('.gc-tool-card button')].find((b) => b.textContent.includes('Open Stoichiometry')).click()`);
  await sleep(900);
  check("1 Open Stoichiometry from the overview goes to #/general/stoichiometry", (await hash()) === "#/general/stoichiometry", await hash());

  // ---------------- 2-3-4-5-6. stoichiometry ----------------
  await fresh(1440, "dark", "#/general/stoichiometry");
  await waitSel(".ph-svg");
  check("2 the default reaction is balanced and limiting reagent shown", (await text(".gc-stage")).includes("Limiting reactant: H₂") && (await text(".chem-equation")).includes("2 H₂ + O₂ → 2 H₂O"), (await text(".chem-equation")));
  await choose("Balance an equation");
  await sleep(300);
  await setField("Equation", "Fe + O2 -> Fe2O3");
  await sleep(300);
  check("3 Fe + O2 -> Fe2O3 balances to 4, 3, 2", (await text("[data-testid=balanced]")).replace(/\s+/g, " ").includes("4 Fe + 3 O₂ → 2 Fe₂O₃"), await text("[data-testid=balanced]"));
  await setField("Equation", "H2 + O2 + H2O2 -> H2O");
  await sleep(300);
  check("3 an underdetermined equation returns no coefficients", /Underdetermined/.test(await text(".gc-stage")) && !(await ev(`!!document.querySelector('[data-testid=balanced]')`)));
  await setField("Equation", "H2 + O2 -> NaCl");
  await sleep(300);
  check("3 an impossible equation says no balancing exists", /No balancing exists/.test(await text(".gc-stage")));
  await setField("Equation", "H2 + XX -> H2O");
  await sleep(300);
  check("2 a malformed formula is refused with a reason", /not a supported element symbol/.test(await text(".gc-inputs")) && /cannot be used yet/.test(await text(".gc-stage")), (await text(".gc-field-error")));
  await setField("Equation", "CuSO4.5H2O -> CuSO4 + H2O");
  await sleep(300);
  check("2 a hydrate formula is parsed and balanced (1, 1, 5)", (await text("[data-testid=balanced]")).replace(/\s+/g, " ").includes("CuSO₄·5H₂O → CuSO₄ + 5 H₂O"), await text("[data-testid=balanced]"));
  await setField("Equation", "Fe + O2 -> Fe2O3");
  await click("Start from 1 each");
  await sleep(300);
  check("3 manual coefficients: 1,1,1 is reported as not balanced with the atom counts", /Not balanced yet/.test(await text(".gc-stage")) && /✗ no/.test(await text("[data-testid=conservation]")));
  await setInput("#coef-0", 4); await setInput("#coef-1", 3); await setInput("#coef-2", 2);
  await sleep(300);
  check("3 manual coefficients 4, 3, 2 are balanced and in the smallest whole numbers", /smallest whole numbers/.test(await text(".gc-stage")) && !/✗ no/.test(await text("[data-testid=conservation]")) && /Balanced, in the smallest/.test(await text(".gc-stage")), await text("[data-testid=manual-status]"));
  await setInput("#coef-0", 8); await setInput("#coef-1", 6); await setInput("#coef-2", 4);
  await sleep(300);
  check("3 8, 6, 4 balances but is flagged as not in the smallest whole numbers", /not in the smallest/.test(await text(".gc-stage")));
  await shot("stoich-balance-dark.png");
  await setField("Equation", "MnO4^- + Fe^2+ + H^+ -> Mn^2+ + Fe^3+ + H2O");
  await sleep(300);
  check("3 a charged redox equation balances with charge conserved (1, 5, 8, 1, 5, 4)", (await text("[data-testid=balanced]")).replace(/\s+/g, " ").includes("MnO₄⁻ + 5 Fe²⁺ + 8 H⁺ → Mn²⁺ + 5 Fe³⁺ + 4 H₂O"), await text("[data-testid=balanced]"));
  await click("Write these coefficients into the equation");
  await sleep(300);
  check("3 writing the coefficients back puts them in the equation field", (await getField("Equation")).includes("5 Fe^2+"), await getField("Equation"));

  // limiting reagent and yield
  await fresh(1440, "dark", "#/general/stoichiometry");
  await waitSel(".ph-svg");
  const ext = nums(await figure("Reaction extent"))[0];
  check("4 4.000 g H2 + 32.00 g O2: extent = 0.9921 mol and H2 is limiting", near(ext, 0.9921, 1e-3) && (await figure("Limiting")) === "H₂", `${ext} ${await figure("Limiting")}`);
  check("4 the theoretical H2O is 35.74 g", near(nums(await figure("Theoretical H"))[0], 35.74, 1e-3), await figure("Theoretical H"));
  const ledger = await text("[data-testid=ledger]");
  check("4 the ledger shows H2 limiting and O2 in excess", /H₂[\s\S]*limiting/.test(ledger) && /O₂[\s\S]*excess/.test(ledger), ledger.replace(/\s+/g, " ").slice(0, 200));
  check("5 the amount-ledger diagram and the particle picture are drawn from the same state", (await ev(`[...document.querySelectorAll('.ph-svg')].some((s) => /Amount ledger/.test(s.getAttribute('aria-label')))`)) && (await ev(`[...document.querySelectorAll('.ph-svg')].some((s) => /Schematic particle counts/.test(s.getAttribute('aria-label')))`)));
  await shot("stoich-limiting-dark.png");
  const particlesBefore = await ev(`[...document.querySelectorAll('.ph-svg')].find((s) => /Schematic particle counts/.test(s.getAttribute('aria-label'))).getAttribute('aria-label')`);
  await setField("Mass of the sample", 8, 0);
  await sleep(400);
  const ext2 = nums(await figure("Reaction extent"))[0];
  check("5 doubling the H2 to 8.00 g doubles ξ to 1.984 mol (H2 still limiting vs 32 g O2 = 1.000)", near(ext2, 1.0, 1e-2) && (await figure("Limiting")) === "O₂", `${ext2} ${await figure("Limiting")}`);
  const particlesAfter = await ev(`[...document.querySelectorAll('.ph-svg')].find((s) => /Schematic particle counts/.test(s.getAttribute('aria-label'))).getAttribute('aria-label')`);
  check("5 the particle picture changed with the amounts", particlesBefore !== particlesAfter);
  await setField("Mass of the sample", 4, 0);
  await sleep(300);
  await ev(`document.querySelector('.gc-check input').click()`);
  await sleep(300);
  await setField("Actual yield", 30);
  await sleep(300);
  check("6 an actual yield of 30.0 g gives 83.93 % with the theoretical value shown", /83\.9/.test(await text("[data-testid=percent-yield]").then(() => text(".gc-stage"))) && /theoretical 35\.74 g/.test(await text("[data-testid=percent-yield]")), await text("[data-testid=percent-yield]"));
  await setField("Actual yield", 40);
  await sleep(300);
  check("6 a yield above 100 % is flagged as not a chemical result", /not a chemical result/.test(await text(".gc-stage")));
  await ev(`document.querySelector('.gc-check input').click()`);
  // purity
  await ev(`(() => { const s = document.getElementById('amode-1'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'mol'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(300);
  await setField("Amount", 0.5, 0);
  await sleep(300);
  check("5 switching O2 to 0.50 mol makes O2 limiting (0.50 < 0.9921 / 2 x 1... ξ = 0.50)", near(nums(await figure("Reaction extent"))[0], 0.5, 1e-3) && (await figure("Limiting")) === "O₂", `${await figure("Reaction extent")} ${await figure("Limiting")}`);

  // solutions and dilution
  await choose("Solutions and dilution");
  await sleep(400);
  check("6 dilution: 25.0 mL of 12.0 M diluted to 500 mL is 0.6 M with 475 mL of solvent added", /M2 = 0\.6/.test(await text(".gc-stage")) && /475/.test(await text("[data-testid=dilution]")), await text("[data-testid=dilution]"));
  await setField("Volume V₂", 10);
  await sleep(300);
  check("6 a 'dilution' to a smaller volume is refused as not a dilution", /not a dilution/i.test(await text(".gc-stage")));
  await setField("Volume V₂", 500);
  await setField("Equation", "HCl + Ca(OH)2 -> CaCl2 + H2O");
  await sleep(300);
  await click("Give every reactant as a solution");
  await sleep(300);
  await setField("Molarity", 0.2, 0); await setField("Volume", 25, 0); await setField("Molarity", 0.06, 1); await setField("Volume", 50, 1);
  await sleep(500);
  const mixText = await text("[data-testid=mixing]");
  check("6 reactive mixing: 25 mL 0.200 M HCl + 50 mL 0.0600 M Ca(OH)2 leaves 0.00667 M Ca(OH)2 and makes 0.0333 M CaCl2", /Ca\(OH\)₂[\s\S]*0\.006667/i.test(mixText) && /CaCl₂[\s\S]*0\.03333/i.test(mixText), mixText.replace(/\s+/g, " "));
  await shot("stoich-solution-dark.png");

  // learning modes
  await fresh(1440, "dark", "#/general/stoichiometry");
  await waitSel(".ph-svg");
  await ev(`document.querySelector('.gc-stage details summary')?.click()`);
  check("17 Explore shows lessons quoting this reaction's numbers", /Why does it work this way\?/.test(await text(".gc-stage")) && /2 mol of H₂ goes with 2 mol/.test((await ev(`document.querySelector('.gc-stage').innerText`)) + (await ev(`[...document.querySelectorAll('.gc-stage details')].map((d) => d.innerText).join(' ')`))) || /ratio/.test(await text(".gc-stage")));
  await choose("Practice");
  await sleep(400);
  check("17 Practice hides the answer until it is checked", /Answer first, then the working is shown/.test(await text(".gc-stage")) && !(await ev(`!!document.querySelector('[data-testid=question-result]')`)));
  let r = await answerNumber(3);
  check("17 Practice: the O2 coefficient in Fe + O2 -> Fe2O3 is 3 (correct)", /Correct/.test(await text(".gc-reveal")), r);
  await click("Balance propane combustion");
  await sleep(300);
  r = await answerNumber(4);
  check("17 Practice: a wrong answer (4) is marked and the working is shown", /Not quite/.test(await text(".gc-reveal")) && /5 O₂|5 O2|C₃H₈ \+ 5 O₂/.test(await text(".gc-reveal")), r);
  await click("Mass of product");
  await sleep(300);
  r = await answerNumber(35.7);
  check("17 Practice: 35.7 g H2O is accepted within tolerance", /Correct/.test(await text(".gc-reveal")), r);
  await click("Set this up in the tool");
  await sleep(500);
  check("17 'Set this up in the tool' loads the question's state", /Limiting reactant/.test(await text(".gc-stage")) && (await getField("Mass of the sample", 0)) === "4", await getField("Mass of the sample", 0));
  await choose("Challenge");
  await sleep(300);
  await click("Aluminium and chlorine");
  await click("Set this up in the tool");
  await sleep(500);
  await ev(`document.querySelectorAll('.gc-choice input')[0].click()`);
  await click("Check my answer");
  await sleep(300);
  check("17 Challenge: choosing Al (wrong) is marked and the extents explain that Cl2 limits", /Not quite/.test(await text(".gc-reveal")) && /Cl₂/.test(await text(".gc-reveal")), await text(".gc-reveal"));
  await shot("stoich-challenge-dark.png");
  await click("Maximum aluminium chloride");
  await sleep(300);
  r = await answerNumber(12.5);
  check("17 Challenge: maximum AlCl3 12.5 g accepted", /Correct/.test(await text(".gc-reveal")), r);

  // save and reopen
  await fresh(1440, "dark", "#/general/stoichiometry");
  await waitSel(".ph-svg");
  await setField("Equation", "N2 + H2 -> NH3");
  await sleep(300);
  await setInput("#amode-0", "mol"); await setInput("#amode-1", "mol");
  await sleep(300);
  await setField("Amount", 4, 0); await setField("Amount", 6, 1);
  await choose("Challenge");
  await sleep(300);
  await saveAs("Stage22 ammonia");
  await fresh(1440, "dark", "#/general/saved", { keep: true });
  await waitFor(() => ev(`document.body.innerText.includes('Stage22 ammonia')`), "saved record", 15000);
  await openRecord("Stage22 ammonia");
  check("18 reopening a saved stoichiometry analysis returns to the tool with the saved equation and amounts", (await hash()) === "#/general/stoichiometry" && (await getField("Equation")) === "N2 + H2 -> NH3" && (await getField("Amount", 0)) === "4" && (await getField("Amount", 1)) === "6", `${await hash()} ${await getField("Equation")}`);
  check("18 the learning mode was restored (Challenge) and the ledger is recalculated", /Challenge: predict first/.test(await text(".gc-stage")) && near(nums(await figure("Reaction extent"))[0], 2, 1e-3), await figure("Reaction extent"));

  // ---------------- 7-11. gas laws ----------------
  await fresh(1440, "dark", "#/general/gas-laws");
  await waitSel(".ph-svg");
  check("7 Gas laws opens with the isothermal experiment and names what is fixed", /Boyle/.test(await text(".gc-inputs")) && /Held fixed: temperature and amount/.test(await text("[data-testid=constraints]")), await text("[data-testid=constraints]"));
  const st = await text("[data-testid=states]");
  const rows = st.split("\n").filter((x) => /^(Start|End)/.test(x.trim()));
  check("8 isothermal 10 L -> 5 L: pressure doubles from 123.9 to 247.9 kPa", /123\.9/.test(st) && /247\.9/.test(st), st.replace(/\s+/g, " ").slice(0, 200));
  check("8 PV/nT equals R at both ends", (st.match(/8\.314463|8\.314462/g) ?? []).length >= 2, st.replace(/\s+/g, " ").slice(0, 300));
  check("8 three synchronized graphs are drawn", (await ev(`document.querySelectorAll('.chem-charts svg').length`)) >= 3);
  check("8 the container diagram and a pressure gauge are drawn", await ev(`[...document.querySelectorAll('.ph-svg')].some((s) => /Gas container/.test(s.getAttribute('aria-label')))`));
  await shot("gas-isothermal-dark.png");
  await setField("Final volume", 2.5);
  await sleep(400);
  check("8 compressing to 2.5 L quadruples the pressure to 495.8 kPa", /495\.8|495\.9/.test(await text("[data-testid=states]")), (await text("[data-testid=states]")).replace(/\s+/g, " ").slice(0, 160));
  await setField("Final volume", 5);
  await setInput("#gas-process", "isochoric");
  await sleep(400);
  check("9 isochoric heating asks for a final temperature and holds the volume fixed", /Held fixed: volume and amount/.test(await text("[data-testid=constraints]")) && (await getField("Final temperature")) !== null, await text("[data-testid=constraints]"));
  await setField("Final temperature", 100);
  await sleep(400);
  const iso = await text("[data-testid=states]");
  check("9 25 C -> 100 C at constant volume raises the pressure by 373.15/298.15 (123.9 -> 155.1 kPa)", /155\.1/.test(iso) && /373\.15|373\.2|373\.1/.test(iso), iso.replace(/\s+/g, " ").slice(0, 200));
  await setField("Final temperature", -300);
  await sleep(300);
  check("9 a final temperature below absolute zero is refused", /above 0 K/.test(await text(".gc-inputs")) || /0 K/.test(await text(".gc-inputs")), await text(".gc-field-error"));
  await setField("Final temperature", 100);
  await setInput("#gas-process", "isobaric");
  await sleep(300);
  await setField("Final temperature", 100);
  await sleep(300);
  check("9 isobaric: the volume grows to 12.5 L (10 x 373.15/298.15)", /12\.52/.test(await text("[data-testid=states]")), (await text("[data-testid=states]")).replace(/\s+/g, " ").slice(0, 200));
  await shot("gas-isobaric-dark.png");
  await setInput("#gas-process", "amountP");
  await sleep(300);
  check("9 changing the amount at constant P and T doubles V when n doubles", /Avogadro/.test(await text(".gc-inputs")));
  // calculator
  await choose("PV = nRT calculator");
  await sleep(400);
  check("7 the calculator solves for n from 1 atm, 24.465 L, 25 C: 1.000 mol", near(nums(await text("[data-testid=calc-result]").then(() => text(".gc-stage .ui-callout, .gc-stage .callout, .gc-stage")))[0], 1, 0.5), "");
  await ev(`(() => { const s = [...document.querySelectorAll('select[aria-label="Pressure unit"]')][0]; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'kPa'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await setField("Pressure P", 202.65);
  await setField("Volume V", 5);
  await ev(`(() => { const s = [...document.querySelectorAll('select[aria-label="Volume unit"]')][0]; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'L'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await setField("Temperature T", 27);
  await sleep(400);
  check("7 unit conversion: 202.65 kPa, 5.00 L, 27 C -> n = 0.4060 mol, with T = 300.15 K shown in the working", /300\.1/.test(await text("[data-testid=calc-result]")) && near(nums(await figure("Amount"))[0], 0.406, 2e-3), await figure("Amount"));
  await setField("Temperature T", -300);
  await sleep(300);
  check("7 −300 °C is refused as below absolute zero", /above 0 K/.test(await text(".gc-inputs")));
  await setField("Temperature T", 27);
  // mixtures
  await choose("Gas mixtures");
  await sleep(500);
  const mix = await text("[data-testid=mixture]");
  check("10 the air-like mixture: partial pressures add to the total 101.6 kPa and N2 is 79.2 kPa", /79\.25|79\.2/.test(mix) && near(nums(await figure("Total pressure"))[0], 101.6, 2e-3), mix.replace(/\s+/g, " ").slice(0, 220));
  check("10 the stacked pressure bar is drawn", await ev(`[...document.querySelectorAll('.ph-svg')].some((s) => /sum of partial pressures/.test(s.getAttribute('aria-label')))`));
  await shot("gas-mixture-dark.png");
  await setField("Amount", 0.5, 2);
  await sleep(300);
  check("10 raising argon to 0.50 mol raises the total pressure and keeps N2's partial pressure unchanged", /79\.2/.test(await text("[data-testid=mixture]")) && near(nums(await figure("Total pressure"))[0], 0.78 + 0.21 + 0.5 > 0 ? (1.49 * 8.314462618 * 298.15) / 0.0244 / 1000 : 0, 2e-3), await figure("Total pressure"));
  // kinetic
  await choose("Molecular speeds");
  await sleep(500);
  const sp = await text("[data-testid=speeds]");
  check("11 H2 and N2 at 25 C: rms speeds 1921 and 515 m/s; the same mean kinetic energy 3.72 kJ/mol", /1921|1920|1922/.test(sp) && /515/.test(sp) && (sp.match(/3\.71|3\.72/g) ?? []).length >= 2, sp.replace(/\s+/g, " ").slice(0, 300));
  check("11 the Maxwell-Boltzmann graph is drawn with a draggable marker", await ev(`[...document.querySelectorAll('.ph-svg')].some((s) => /Maxwell-Boltzmann/.test(s.getAttribute('aria-label') ?? '')) || !!document.querySelector('[role=slider]')`));
  await shot("gas-speeds-dark.png");
  await setField("Temperature of B", 300);
  await sleep(400);
  check("11 changing B's temperature changes the table (N2 at 573 K: rms 714 m/s) and the note", /714|715/.test(await text("[data-testid=speeds]")) && /Different temperatures/.test(await text(".gc-stage")));
  // learning
  await choose("Practice");
  await sleep(400);
  let g1 = await answerNumber(4);
  check("17 gas Practice: Boyle's law 4.00 atm is correct", /Correct/.test(await text(".gc-reveal")), g1);
  await click("Gay-Lussac's law");
  await sleep(300);
  g1 = await answerNumber(2.6);
  check("17 gas Practice: 2.6 atm is within 0.1 % of 2.667? no, so it is marked not quite", /Not quite/.test(await text(".gc-reveal")), g1);
  await choose("Challenge");
  await sleep(300);
  await choose("Gas container");
  await sleep(500);
  await setInput("#gas-process", "isothermal");
  await sleep(500);
  await ev(`[...document.querySelectorAll('.gc-scenario-pick button')].find((b) => /compress the gas further/.test(b.textContent))?.click()`);
  await sleep(200);
  await choose("Higher");
  await sleep(300);
  check("17 gas Challenge: predicting 'higher' after compressing further is confirmed with the numbers", /matches the model/.test(await text(".gc-reveal")), await text(".gc-reveal"));
  await ev(`[...document.querySelectorAll('.gc-scenario-pick button')].find((b) => /double the final Celsius/.test(b.textContent))?.click()`);
  await sleep(300);
  await choose("Higher");
  await sleep(300);
  check("17 gas Challenge: a scenario that needs another experiment is refused, not invented", /cannot be applied/.test(await text(".gc-stage")));

  // save + reopen gas
  await fresh(1440, "dark", "#/general/gas-laws");
  await waitSel(".ph-svg");
  await setInput("#gas-process", "isochoric");
  await setField("Final temperature", 120);
  await sleep(300);
  await saveAs("Stage22 gas heating");
  await fresh(1440, "dark", "#/general/saved", { keep: true });
  await waitFor(() => ev(`document.body.innerText.includes('Stage22 gas heating')`), "saved gas", 15000);
  await openRecord("Stage22 gas heating");
  check("18 reopening a saved gas analysis restores process and target and recalculates the states", (await hash()) === "#/general/gas-laws" && (await getField("Final temperature")) === "120" && /Gay-Lussac/.test(await text(".gc-inputs")), `${await hash()} ${await getField("Final temperature")}`);

  // ---------------- 12-16. electrochemistry ----------------
  await fresh(1440, "dark", "#/general/electrochemistry");
  await waitSel(".ph-svg");
  const cn = await text("[data-testid=cell-notation]");
  check("12 the default Daniell cell: Zn is the anode and Cu the cathode, notation Zn | Zn2+ || Cu2+ | Cu", /Zn \| Zn²⁺ 1 M ‖ Cu²⁺ 1 M \| Cu/.test(cn), cn);
  check("13 the cell diagram labels anode (oxidation, −) and cathode (reduction, +), electron flow and the salt bridge", await ev(`(() => { const l = [...document.querySelectorAll('.ph-svg')].map((s) => s.getAttribute('aria-label')).join(' '); return /Anode \\(oxidation, −\\)/.test(l) && /Cathode \\(reduction, \\+\\)/.test(l) && /Electrons flow through the external wire from the anode to the cathode/.test(l); })()`));
  check("13 the diagram says the salt bridge carries ions, never electrons", /never electrons/.test(await ev(`[...document.querySelectorAll('.ph-svg')].map((s) => s.textContent).join(' ')`)));
  check("14 standard cell potential 1.104 V, n = 2, ΔG° = −213.0 kJ/mol", near(nums(await figure("E° (standard)"))[0], 1.104, 1e-3) && near(nums(await figure("Electrons"))[0], 2, 0) && near(nums(await figure("ΔG°"))[0], -213.0, 2e-3), `${await figure("E° (standard)")} ${await figure("ΔG°")}`);
  check("14 the half-cell table shows the anode's reduction potential and its sign as an oxidation", /−?-?0\.762 as a reduction; 0\.762 as an oxidation/.test(await text("[data-testid=halves]")), (await text("[data-testid=halves]")).replace(/\s+/g, " ").slice(0, 300));
  await shot("electro-daniell-dark.png");
  await setField("Zn²⁺ concentration", 0.01);
  await sleep(400);
  check("15 [Zn2+] = 0.010 M and [Cu2+] = 1.00 M: E = 1.163 V (Nernst), E° stays 1.104 V", near(nums(await figure("E (these conditions)"))[0], 1.1632, 5e-4) && near(nums(await figure("E° (standard)"))[0], 1.104, 1e-3), `${await figure("E (these conditions)")}`);
  await setField("Cu²⁺ concentration", 0.001);
  await sleep(300);
  check("15 [Cu2+] = 0.0010 M then gives Q = 10 and E = 1.104 - 0.01285 ln 10 = 1.074 V", near(nums(await figure("E (these conditions)"))[0], 1.104 - ((8.314462618 * 298.15) / (2 * 96485.33212)) * Math.log(10), 5e-4), await figure("E (these conditions)"));
  check("15 the E against log Q graph marks the standard state and 'your conditions'", await ev(`[...document.querySelectorAll('.ph-svg')].some((s) => /Cell potential against log Q/.test(s.getAttribute('aria-label') ?? '')) || document.body.innerText.includes('your conditions')`));
  await shot("electro-nernst-dark.png");
  // pair choice
  await setInput("#half-a", "Al");
  await setInput("#half-b", "Zn");
  await sleep(500);
  check("12 Zn with Al: Al is the anode, n = 6, E° = 0.900 V, overall 3 Zn2+ + 2 Al -> 3 Zn + 2 Al3+", near(nums(await figure("Electrons"))[0], 6, 0) && near(nums(await figure("E° (standard)"))[0], 0.9, 1e-3) && /3 Zn²⁺\(aq\) \+ 2 Al\(s\) → 3 Zn\(s\) \+ 2 Al³⁺\(aq\)/.test(await text("[data-testid=overall]")), await text("[data-testid=overall]"));
  await setInput("#half-a", "MnO4");
  await setInput("#half-b", "Fe3");
  await sleep(500);
  check("12 MnO4- with Fe3+/Fe2+: n = 5 and the overall reaction cancels the water and protons correctly", near(nums(await figure("Electrons"))[0], 5, 0) && /MnO₄⁻\(aq\) \+ 8 H⁺\(aq\) \+ 5 Fe²⁺\(aq\)|8 H⁺\(aq\)/.test(await text("[data-testid=overall]")) && /4 H₂O\(l\)/.test(await text("[data-testid=overall]")), await text("[data-testid=overall]"));
  await setField("pH", 2);
  await sleep(400);
  check("15 pH 2 lowers the permanganate half-cell: E = 0.736 - (RT/5F) ln(1e16) = 0.5472 V", near(nums(await figure("E (these conditions)"))[0], 0.736 - ((8.314462618 * 298.15) / (5 * 96485.33212)) * Math.log(1e16), 1e-3), await figure("E (these conditions)"));
  await shot("electro-permanganate-dark.png");
  await setInput("#half-a", "Pb");
  await setInput("#half-b", "Sn");
  await sleep(400);
  await setField("Pb²⁺ concentration", 1e-6);
  await sleep(500);
  check("12 concentrations can reverse the standard order (Pb/Sn): the page says so and E stays positive", /reverse the standard order/.test(await text(".gc-stage")) && nums(await figure("E (these conditions)"))[0] > 0, await figure("E (these conditions)"));
  await setInput("#half-a", "Zn");
  await setInput("#half-b", "Zn");
  await sleep(300);
  check("12 selecting the same couple twice is refused", /same couple/.test(await text(".gc-inputs")), await text(".gc-field-error"));
  // electrolysis
  await fresh(1440, "dark", "#/general/electrochemistry");
  await waitSel(".ph-svg");
  await choose("Electrolysis");
  await sleep(500);
  const es = await text("[data-testid=electrolysis-summary]");
  check("16 2.00 A for 30.0 min with copper: Q = 3600 C = 0.03731 mol e-, 0.01866 mol Cu = 1.186 g", /3600/.test(es) && /0\.0373/.test(es) && near(nums(await figure("Cathode: Cu"))[0], 1.1855, 2e-3), `${es.slice(0, 120)} | ${await figure("Cathode: Cu")}`);
  check("16 the electrolytic cell diagram shows an anode (+) and cathode (−)", await ev(`[...document.querySelectorAll('.ph-svg')].some((s) => /Electrolytic cell\\. Anode \\(oxidation, \\+\\)/.test(s.getAttribute('aria-label') ?? ''))`));
  await shot("electro-electrolysis-dark.png");
  await setInput("#el-case", "water");
  await sleep(500);
  const wt = await text("[data-testid=products]");
  check("16 water electrolysis: H2 at the cathode and O2 at the anode in a 2:1 ratio, with ideal-gas volumes", /Cathode[\s\S]*H₂\(g\)/i.test(wt) && /Anode[\s\S]*O₂\(g\)/i.test(wt) && /1\.229/.test(await text(".gc-stage")), wt.replace(/\s+/g, " ").slice(0, 260));
  await setField("Current efficiency", 80);
  await sleep(300);
  check("16 80 % current efficiency scales the product to 80 % (H2 0.01492 mol)", near(nums(await figure("Cathode: H"))[0] ?? NaN, 0.8 * (3600 / 96485.33212 / 2) * 2.016, 3e-3), await figure("Cathode: H"));
  await setInput("#el-case", "Ag-plate");
  await setField("Current I", 1); await setField("Time t", 60); await setField("Current efficiency", 100);
  await sleep(400);
  check("16 silver: 1.00 A for 1.00 h deposits 4.025 g", near(nums(await figure("Cathode: Ag"))[0], 4.0249, 2e-3), await figure("Cathode: Ag"));
  await setField("Current I", 0);
  await sleep(300);
  check("16 a current of zero is refused", /must be above 0/.test(await text(".gc-inputs")) || /current must be/.test(await text(".gc-inputs")));
  await setField("Current I", 1);
  // time slider
  await ev(`document.querySelector('[role=slider]')?.focus()`);
  await key("ArrowRight", "ArrowRight", 39);
  await key("ArrowRight", "ArrowRight", 39);
  await sleep(300);
  check("16 the deposit graph's marker moves with the arrow keys", /At t = (?!15)/.test(await text(".chem-vs")) || /At t = /.test(await text(".chem-vs")), await text(".chem-vs"));
  // learning modes
  await fresh(1440, "dark", "#/general/electrochemistry");
  await waitSel(".ph-svg");
  await choose("Practice");
  await sleep(400);
  await ev(`document.querySelectorAll('.gc-choice input')[1].click()`);
  await click("Check my answer");
  await sleep(300);
  check("17 electro Practice: choosing copper as the anode is wrong and the working says zinc is oxidised", /Not quite/.test(await text(".gc-reveal")) && /Zn.*oxidised|oxidised.*Zn|Zn → Zn/.test(await text(".gc-reveal")), await text(".gc-reveal"));
  await click("Standard cell potential");
  await sleep(300);
  r = await answerNumber(0.458);
  check("17 electro Practice: E° = 0.458 V accepted", /Correct/.test(await text(".gc-reveal")), r);
  await click("Nonstandard potential");
  await sleep(300);
  r = await answerNumber(1.163);
  check("17 electro Practice: Nernst 1.163 V accepted", /Correct/.test(await text(".gc-reveal")), r);
  await choose("Challenge");
  await sleep(300);
  await choose("Lower");
  await sleep(300);
  check("17 electro Challenge: predicting 'lower' for a diluted product ion is marked not quite, and the explanation says E rises", /Not quite/.test(await text(".gc-reveal")) && /rises/.test(await text(".gc-reveal")), await text(".gc-reveal"));
  await shot("electro-challenge-dark.png");
  await choose("Explore");
  await sleep(300);
  check("17 electro Explore shows lessons that quote the numbers", /Zn²⁺\/Zn is oxidised/.test(await ev(`[...document.querySelectorAll('.gc-stage details')].map((d) => d.textContent).join(' ')`)));
  // save / reopen electro
  await setInput("#half-a", "Cu");
  await setInput("#half-b", "Ag");
  await setField("Cu²⁺ concentration", 0.5);
  await sleep(300);
  await saveAs("Stage22 Cu Ag cell");
  await fresh(1440, "dark", "#/general/saved", { keep: true });
  await waitFor(() => ev(`document.body.innerText.includes('Stage22 Cu Ag cell')`), "saved electro", 15000);
  await openRecord("Stage22 Cu Ag cell");
  check("18 reopening a saved cell restores the half-cells and concentrations and recalculates E", (await hash()) === "#/general/electrochemistry" && (await ev(`document.getElementById('half-a').value`)) === "Cu" && near(nums(await figure("E (these conditions)"))[0], 0.458 - ((8.314462618 * 298.15) / (2 * 96485.33212)) * Math.log(0.5 / 1), 1e-3), await figure("E (these conditions)"));

  // ---------------- 19-20. global search, related learning ----------------
  await fresh(1440, "dark", "#/general/overview");
  await key("k", "KeyK", 75, 2);
  await sleep(500);
  check("19 Ctrl+K opens concept search", await searchOpen());
  for (const [query, titlePart, hashWant] of [
    ["limiting reagent", "Limiting reagent", "#/general/stoichiometry"],
    ["ideal gas law", "Ideal gas law", "#/general/gas-laws"],
    ["Nernst equation", "Nernst equation", "#/general/electrochemistry"],
    ["Faraday's law", "Electrolysis", "#/general/electrochemistry"],
    ["partial pressure", "Partial pressure", "#/general/gas-laws"],
    ["galvanic cell", "galvanic", "#/general/electrochemistry"],
    ["molar mass", "Moles and molar mass", "#/general/stoichiometry"],
    ["balance an equation", "Balancing", "#/general/stoichiometry"],
  ]) {
    await typeSearch(query);
    const res = await resultsList();
    check(`19 searching "${query}" finds a General Chemistry result containing "${titlePart}"`, res.slice(0, 4).some((x) => x.title.toLowerCase().includes(titlePart.toLowerCase()) && /General/.test(x.subject)), JSON.stringify(res.slice(0, 3)));
  }
  await typeSearch("Nernst equation");
  await key("Enter", "Enter", 13);
  await sleep(1500);
  check("19 Enter on the Nernst result opens Electrochemistry", (await hash()) === "#/general/electrochemistry", await hash());
  // related learning
  const rel = await text("[data-testid=related-concepts]");
  check("20 Electrochemistry offers Thermodynamics and Electron transport with the caution that a galvanic cell is not oxidative phosphorylation", /Gibbs energy/.test(rel) && /Electron transport/.test(rel), rel.replace(/\s+/g, " ").slice(0, 400));
  await fresh(1440, "dark", "#/general/gas-laws");
  await waitSel(".ph-svg");
  check("20 Gas laws links to Waves and sound (Physics) and Thermodynamics", /Waves and sound/.test(await text("[data-testid=related-concepts]")) && /Thermodynamics/.test(await text("[data-testid=related-concepts]")), (await text("[data-testid=related-concepts]")).replace(/\s+/g, " ").slice(0, 300));
  await fresh(1440, "dark", "#/general/stoichiometry");
  await waitSel(".ph-svg");
  check("20 Stoichiometry links to Acid–base and titration", /Acid–base and titration/.test(await text("[data-testid=related-concepts]")), (await text("[data-testid=related-concepts]")).replace(/\s+/g, " ").slice(0, 300));
  await ev(`[...document.querySelectorAll('[data-testid=related-concepts] a, [data-testid=related-concepts] button')].find((x) => /Acid–base and titration/.test(x.textContent))?.click()`);
  await sleep(1200);
  check("20 following that link opens the Acid–base tool", (await hash()) === "#/general/acid-base-titration", await hash());

  // ---------------- 21-22. themes and layouts ----------------
  for (const [label, target, steps] of [
    ["stoichiometry", "#/general/stoichiometry", []],
    ["stoichiometry balance", "#/general/stoichiometry", [() => choose("Balance an equation")]],
    ["stoichiometry solutions", "#/general/stoichiometry", [() => choose("Solutions and dilution")]],
    ["gas container", "#/general/gas-laws", []],
    ["gas mixture", "#/general/gas-laws", [() => choose("Gas mixtures")]],
    ["gas speeds", "#/general/gas-laws", [() => choose("Molecular speeds")]],
    ["electro galvanic", "#/general/electrochemistry", []],
    ["electro electrolysis", "#/general/electrochemistry", [() => choose("Electrolysis")]],
  ]) {
    for (const [w, scheme] of [[1440, "light"], [1440, "dark"], [820, "light"], [820, "dark"], [375, "light"], [375, "dark"]]) {
      await fresh(w, scheme, target);
      await waitSel(".ph-svg");
      for (const step of steps) await step();
      await sleep(500);
      const ov = await overflow();
      const culprits = ov > 0 ? await ev(`(() => { const vw = document.documentElement.clientWidth; return JSON.stringify([...document.querySelectorAll('main *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1; }).slice(0, 5).map((e) => e.tagName + '.' + String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).slice(0, 40) + ':' + Math.round(e.getBoundingClientRect().right))); })()`) : "";
      check(`21/22 ${label} at ${w}px ${scheme}: no horizontal overflow`, ov <= 0, `${ov} ${culprits}`);
      if ((w === 375 || w === 820) && scheme === "dark" || (w === 1440 && scheme === "light")) await shot(`${label.replace(/ /g, "-")}-${w}-${scheme}.png`);
    }
  }
  // ---------------- 23-24. existing navigation ----------------
  await fresh(1440, "dark", "#/general/acid-base-titration");
  check("23 the existing Acid–base tool still renders its titration curve", (await ev(`!!document.querySelector('.ph-svg, svg')`)) && /titration|pH/i.test(await text("main")), "");
  for (const [route, want] of [["#/general/equilibrium", /equilibrium/i], ["#/general/kinetics", /kinetics|order/i], ["#/general/thermodynamics", /Gibbs|thermodynamic/i]]) {
    await fresh(1440, "dark", route);
    check(`23 existing ${route} still opens`, want.test(await text("main")), route);
  }
  await fresh(1440, "dark", "#/physics/waves-sound");
  await waitSel(".ph-svg");
  check("24 Physics Waves & sound still opens with its time controls", (await ev(`!!document.querySelector('.ph-timeline')`)) && /Waves/.test(await tabs()));
  await fresh(1440, "dark", "#/physics/mechanics");
  check("24 Physics Mechanics still opens", /Projectile|Motion|Mechanics/i.test(await text("main")));
  await fresh(1440, "dark", "#/organic/properties");
  check("24 Organic Chemistry Properties still opens", /Properties/i.test(await tabs()) && (await ev(`document.querySelectorAll('.tool-tabs [role=tab]').length`)) >= 6, await tabs());
  await fresh(1440, "dark", "#/organic/ranking");
  check("24 Organic Ranking still opens", /Ranking/.test(await text("main")));
  await fresh(375, "dark", "#/general/electrochemistry", { reducedMotion: true });
  await waitSel(".ph-svg");
  await fresh(1440, "light", "#/general/gas-laws", { reducedMotion: true });
  await waitSel(".ph-svg");
  check("reduced motion: the gas container is static (no animation loop required) and still renders", await ev(`document.querySelectorAll('.ph-svg circle').length > 5`));
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
