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

const MEM = "#/biology/membranes-transport", SIG = "#/biology/cell-signaling", NEU = "#/biology/neuronal-physiology";
const tick = (testid) => ev(`(() => { const e = document.querySelector('[data-testid=${testid}]'); if (!e) return false; e.click(); return true; })()`);
const step = async (n, label = "Next step") => { for (let i = 0; i < n; i += 1) { await ev(`document.querySelector('button[aria-label=${q(label)}]')?.click()`); await sleep(120); } };
const fig = async (label) => String(await figure(label));
const svgLabel = () => ev(`document.querySelector('.c23-svg')?.getAttribute('aria-label') ?? ''`);
const clickGroup = (id) => ev(`(() => { const g = document.querySelector('[data-component=${id}]'); if (!g) return false; g.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
const mode = async (label) => { await choose(label); await sleep(400); };
const anySvgBad = () => ev(`(() => { const s = [...document.querySelectorAll('.c23-svg')]; return s.map((x) => { const r = x.getBoundingClientRect(); return r.width < 200 || r.height < 80 ? 'tiny' : ''; }).filter(Boolean).join(); })()`);

try {
  // ---------------- 1. biology overview and navigation ----------------
  await fresh(1440, "dark", "#/biology/overview");
  const tb = await tabs();
  check("1 Biology lists the three new tools beside the existing ones", ["Overview", "DNA replication", "Gene regulation", "Genetics & inheritance", "Mitosis & meiosis", "Membranes & transport", "Cell signaling", "Neuronal physiology", "Saved"].every((t) => tb.includes(t)), tb);
  check("1 the overview offers a Cellular biology & physiology group with three tool cards", (await ev(`document.body.innerText.includes('Cellular biology & physiology')`)) && (await ev(`[...document.querySelectorAll('.gc-tool-card button')].filter((b) => /Open (Membranes|Cell signaling|Neuronal)/.test(b.textContent)).length`)) === 3);
  await shot("overview-dark.png");
  await ev(`[...document.querySelectorAll('.gc-tool-card button')].find((b) => b.textContent.includes('Open Membranes')).click()`);
  await sleep(900);
  check("1 Open Membranes goes to #/biology/membranes-transport", (await hash()) === MEM, await hash());

  // ---------------- 2. bilayer ----------------
  await fresh(1440, "dark", MEM);
  await waitSel(".c23-svg");
  check("2 the bilayer diagram is drawn with heads, tails and proteins", (await ev(`document.querySelectorAll('.c23-svg circle').length > 20 && document.querySelectorAll('.c23-svg [data-component]').length >= 9`)));
  await tick("comp-integral");
  await sleep(250);
  check("2 selecting the integral protein shows its function (hydrophobic regions in the lipid core)", /hydrophobic/i.test(await text("[data-testid=component-detail]")), await text("[data-testid=component-detail]"));
  await clickGroup("head");
  await sleep(250);
  check("2 clicking a head group in the diagram selects it (polar, faces water)", /polar/i.test(await text("[data-testid=component-detail]")));
  const f0 = await fig("Schematic fluidity");
  await setInput("[data-testid=lipids]", "unsaturated");
  await setInput("[data-testid=temperature]", "warm");
  await sleep(300);
  const f1 = await fig("Schematic fluidity");
  check("2 unsaturated + warm gives a higher fluidity class than mixed + moderate", /very high/.test(f1) && !/very high/.test(f0), `${f0} -> ${f1}`);
  await tick("cholesterol-toggle");
  await sleep(250);
  check("2 cholesterol moderates the extreme (very high becomes high)", /^high/.test(await fig("Schematic fluidity")), await fig("Schematic fluidity"));
  check("2 the caveat says fluidity is not a measurement", /not a measurement/.test(await text(".gc-stage")));
  await shot("bilayer-dark.png");

  // ---------------- 3-5. passive transport, ion gradients, Nernst ----------------
  await choose("Passive transport");
  await sleep(500);
  check("3 O2 8 mM out / 2 mM in diffuses inward with the arrow and numbers agreeing", /inward/.test(await fig("Net movement")) && /INTO the cell/.test(await svgLabel()) && /No ATP/.test(await text(".gc-stage")), await svgLabel());
  await setField("Outside concentration", 1);
  await setField("Inside concentration", 9);
  await sleep(300);
  check("3 reversing the concentrations reverses the direction", /outward/.test(await fig("Net movement")) && /OUT of the cell/.test(await svgLabel()), await fig("Net movement"));
  await setField("Inside concentration", 1);
  await sleep(300);
  check("3 equal concentrations: no net movement (equilibrium)", /none/.test(await fig("Net movement")) && /equal rates/.test(await ev(`document.querySelector('.c23-svg').textContent`)));
  await setInput("[data-testid=solute]", "glucose");
  await sleep(400);
  check("3 glucose uses a carrier (facilitated diffusion) and still no ATP", /Carrier/.test(await text(".gc-inputs")) && /No ATP/.test(await ev(`document.querySelector('.c23-svg').textContent`)));
  await clickGroup("carrier");
  await sleep(250);
  check("3 selecting the carrier explains it is passive and saturable", /saturable/.test(await text("[data-testid=protein-detail]")));
  await setInput("[data-testid=solute]", "k");
  await sleep(400);
  await setField("Membrane voltage Vm", -120);
  await sleep(300);
  check("3 K+ (4 mM out, 140 mM in) at -120 mV moves INWARD against its concentration gradient", /inward/.test(await fig("Net movement")) && /INTO the cell/.test(await svgLabel()), await fig("Net movement"));
  await setField("Membrane voltage Vm", -70);
  await sleep(300);
  check("3 at -70 mV K+ moves outward; the diagram shows the two driving forces", /outward/.test(await fig("Net movement")) && /Forces on K/.test(await ev(`document.querySelector('.c23-svg').textContent`)));
  await shot("passive-k-dark.png");

  await choose("Ion gradients");
  await sleep(600);
  const eK = nums(await fig("E(K⁺)"))[0];
  check("4 the ion explorer shows E(K+) = -95 mV", near(eK, -95, 0, 0.6), await fig("E(K⁺)"));
  check("4 the membrane voltage (GHK) is about -69 mV", near(nums(await fig("Membrane voltage Vm"))[0], -69.1, 0, 0.3), await fig("Membrane voltage Vm"));
  check("4 the voltage ladder lists every ion", (await ev(`document.querySelectorAll('.c23-svg').length`)) === 2 && /E\(Na/.test(await ev(`document.querySelectorAll('.c23-svg')[1].getAttribute('aria-label')`)));
  await choose("Ca²⁺");
  await sleep(400);
  check("5 E(Ca2+) uses z = +2: about +131 mV", near(nums(await fig("E(Ca²⁺)"))[0], 131, 0, 1), await fig("E(Ca²⁺)"));
  await choose("Cl⁻");
  await sleep(300);
  check("5 E(Cl-) has the opposite sign convention: about -64 mV", near(nums(await fig("E(Cl⁻)"))[0], -64, 0, 1), await fig("E(Cl⁻)"));
  await choose("K⁺");
  await sleep(300);
  await setField("Outside K⁺", 10);
  await sleep(300);
  check("5 raising extracellular K+ to 10 mM moves E(K+) to about -70 mV", near(nums(await fig("E(K⁺)"))[0], -70.5, 0, 1), await fig("E(K⁺)"));
  await setField("Relative P(Na⁺)", 0.2);
  await sleep(300);
  const vNa = nums(await fig("Membrane voltage Vm"))[0];
  check("5 raising P(Na+) depolarizes the GHK voltage; it is not the average of the Nernst potentials", vNa > -60, String(vNa));
  await setInput("[data-testid=temp] input, .gc-field input", "37");
  await shot("ions-dark.png");

  // ---------------- 6-7. active transport ----------------
  await choose("Active transport");
  await sleep(500);
  check("6 the pump starts in E1 with ATP, open to the cytosol", /E1/.test(await fig("Conformation")) && /cytosol/.test(await fig("Conformation")), await fig("Conformation"));
  await step(2);
  check("6 after 3 Na+ bind and the pump is phosphorylated, ATP hydrolysed = 1 and the sites are occluded", /1/.test(await fig("ATP hydrolysed")) && /occluded/.test(await fig("Conformation")), `${await fig("ATP hydrolysed")} ${await fig("Conformation")}`);
  await step(2);
  check("6 Na+ are released outside from E2~P", /3 of 3/.test(await fig("Na⁺ moved out")) && /E2~P/.test(await fig("Conformation")) && /0 of 2/.test(await fig("K⁺ moved in")));
  await shot("pump-step5-dark.png");
  await step(3);
  check("6 completed cycle: 3 Na+ out, 2 K+ in, one ATP; net charge +1", /3 of 3/.test(await fig("Na⁺ moved out")) && /2 of 2/.test(await fig("K⁺ moved in")) && /1/.test(await fig("ATP hydrolysed")) && /\+1 elementary charge/.test(await text(".gc-stage")));
  check("6 the electrogenic note separates the pump's direct charge from the membrane potential", /usually small/.test(await text(".gc-stage")));
  await setInput("[data-testid=pump-pert]", "ouabain");
  await sleep(400);
  await step(1, "Last step");
  check("6 with ouabain the cycle stops after Na+ release: no K+ moved in", /0 of 2/.test(await fig("K⁺ moved in")) && /3 of 3/.test(await fig("Na⁺ moved out")));
  await setInput("[data-testid=pump-pert]", "none");
  await choose("SGLT1 cotransport");
  await sleep(500);
  check("7 SGLT1: 2 Na+ + glucose in: dG about -24 kJ/mol, no ATP at the cotransporter", near(nums(await fig("ΔG per cycle"))[0], -24.4, 0, 0.3) && /none/.test(await fig("ATP used by SGLT1")), await fig("ΔG per cycle"));
  await setField("Inside Na⁺", 60);
  await sleep(300);
  check("7 raising intracellular Na+ lowers the accumulation limit", nums(await fig("Accumulation limit"))[0] < 1000, await fig("Accumulation limit"));
  await shot("sglt-dark.png");

  // ---------------- 8. osmosis ----------------
  await choose("Osmosis & tonicity");
  await sleep(500);
  check("8 150 mM NaCl is isotonic with 300 mOsm inside", /isotonic/.test(await fig("Tonicity")) && /no net movement/.test(await fig("Initial water movement")));
  await click("Hypotonic");
  await sleep(300);
  check("8 hypotonic: water moves in, idealized volume 2.00 x", /hypotonic/.test(await fig("Tonicity")) && /into the cell/.test(await fig("Initial water movement")) && /2\.00/.test(await fig("Idealized equilibrium volume")));
  await click("Hypertonic");
  await sleep(300);
  check("8 hypertonic: water moves out, volume 0.50 x", /out of the cell/.test(await fig("Initial water movement")) && /0\.50/.test(await fig("Idealized equilibrium volume")));
  await click("300 mM urea");
  await sleep(300);
  check("8 300 mM urea: iso-osmotic but hypotonic, with the disagreement explained and no volume claimed", /iso-osmotic/.test(await fig("Osmolarity")) && /hypotonic/.test(await fig("Tonicity")) && /disagree/.test(await text(".gc-stage")) && /not reported/.test(await fig("Idealized equilibrium volume")));
  await shot("osmosis-dark.png");

  // ---------------- 9-12. signaling ----------------
  await fresh(1440, "dark", SIG);
  await waitSel(".c23-svg");
  check("9 the receptor classes are compared in a table (GPCR, RTK, ligand-gated channel, intracellular)", (await ev(`document.querySelectorAll('[data-testid=receptor-table] tbody tr').length`)) === 4);
  await step(1, "Last step");
  await sleep(300);
  check("9 Gs pathway at the end: receptor, G protein, cAMP and PKA all ON", ["Gs-coupled receptor", "Gαs·βγ", "cAMP", "Protein kinase A"].every(async () => true) && /ON/.test(await fig("Gs-coupled receptor")) && /ON/.test(await fig("cAMP")) && /ON/.test(await fig("Protein kinase A")));
  await clickGroup("gp");
  await sleep(250);
  check("9 selecting the G protein shows the GDP/GTP state transition", /Gαs·GTP separated from Gβγ/.test(await text("[data-testid=component-detail]")), await text("[data-testid=component-detail]"));
  await shot("gs-dark.png");
  await tick("pert-ac-inhib");
  await sleep(300);
  check("11 blocking adenylyl cyclase: Gs stays ON but cAMP and PKA are off", /ON/.test(await fig("Gαs·βγ")) && /off/.test(await fig("cAMP")) && /off/.test(await fig("Protein kinase A")) && /blocked/i.test(await text("[data-testid=ac-context]")));
  await tick("pert-ac-inhib");
  await tick("pert-pde-inhib");
  await choose("Ligand removed");
  await sleep(300);
  check("11 phosphodiesterase inhibited and ligand removed: cAMP and PKA PERSIST, the receptor is off", /PERSISTING/.test(await fig("cAMP")) && /PERSISTING/.test(await fig("Protein kinase A")) && /off/.test(await fig("Gs-coupled receptor")));
  await tick("pert-pde-inhib");
  await sleep(250);
  check("11 with PDE working, everything is off after removal", /off/.test(await fig("cAMP")) && /off/.test(await fig("Protein kinase A")));
  await choose("Prolonged exposure");
  await sleep(300);
  check("11 prolonged exposure attenuates the signal (desensitization)", /ATTENUATED/.test(await fig("Gs-coupled receptor")) && /ATTENUATED/.test(await fig("cAMP")));
  await choose("GPCR · Gi");
  await sleep(500);
  await step(1, "Last step");
  check("10 Gi alone: Gαi·GTP inhibits adenylyl cyclase; cAMP is NOT raised", /inhibits adenylyl cyclase/.test(await text("[data-testid=ac-context]")) && /off/.test(await fig("cAMP")));
  await tick("coligand");
  await sleep(300);
  check("10 Gi plus a Gs stimulus: stimulated but opposed (lower than Gs alone)", /opposes it/.test(await text("[data-testid=ac-context]")) && /ON/.test(await fig("cAMP")));
  await choose("GPCR · Gq");
  await sleep(500);
  await step(1, "Last step");
  check("10 Gq: IP3, DAG, Ca2+ and PKC are ON, and there is no cAMP anywhere", /ON/.test(await fig("IP₃")) && /ON/.test(await fig("DAG")) && /ON/.test(await fig("Ca²⁺")) && !/cAMP/.test(await text(".c23-svg")));
  await tick("pert-ip3r-block");
  await sleep(300);
  check("11 blocking the IP3 receptor: IP3 and DAG remain, Ca2+ and conventional PKC are off", /ON/.test(await fig("IP₃")) && /BLOCKED|off/.test(await fig("Ca²⁺")) && /off/.test(await fig("Protein kinase C")));
  await choose("RTK · EGFR → ERK");
  await sleep(500);
  await step(3);
  check("12 RTK: EGFR dimer, autophosphorylation and Grb2 appear in order at event 3", /ON/.test(await fig("EGFR")) && !/ON/.test(await fig("ERK")));
  await step(1, "Last step");
  check("12 at the last event ERK is ON", /ON/.test(await fig("ERK")) && /ON/.test(await fig("Ras")));
  await tick("pert-mek-inhib");
  await sleep(300);
  check("12 a MEK inhibitor leaves Raf ON and ERK off", /ON/.test(await fig("Raf kinase")) && /off/.test(await fig("ERK")));
  await tick("pert-mek-inhib");
  await tick("ligand");
  await tick("pert-ras-g12v");
  await sleep(300);
  check("12 constitutive Ras: ERK is ON with no EGF", /ON/.test(await fig("ERK")) && /off/.test(await fig("EGFR")));
  check("12 the model says downstream phenotypes are not predicted", /proliferation, differentiation, survival/.test(await text(".gc-stage")));
  await shot("rtk-ras-dark.png");
  await choose("Ligand-gated channel");
  await sleep(400);
  await step(1, "Last step");
  check("9 the ligand-gated channel pathway has no G protein, messenger or kinase", !/G PROTEIN|SECOND MESSENGER|KINASE/.test(await ev(`document.querySelector('.c23-svg').textContent`)) && /ON/.test(await fig("Nicotinic receptor (channel)")));

  // ---------------- 13-17. neuron ----------------
  await fresh(1440, "dark", NEU);
  await waitSel(".c23-svg");
  await clickGroup("hillock");
  await sleep(250);
  check("13 selecting the axon hillock explains where the action potential starts", /voltage-gated Na⁺ channels/.test(await text("[data-testid=part-detail]")));
  await tick("part-axon");
  await sleep(250);
  check("13 the axon note says ions do not travel along the axon", /do not travel along the axon/.test(await text("[data-testid=part-detail]")));
  await shot("anatomy-dark.png");
  await choose("Resting potential");
  await sleep(500);
  check("14 the GHK resting potential is about -69 mV and is not E_K", near(nums(await fig("GHK resting potential"))[0], -69.1, 0, 0.3) && nums(await fig("Gap above E_K"))[0] > 20);
  await setField("Relative P(Na⁺)", 0.001);
  await setField("Relative P(Cl⁻)", 0.001);
  await sleep(300);
  check("14 with almost no Na+ and Cl- permeability the voltage approaches E_K", Math.abs(nums(await fig("GHK resting potential"))[0] - nums(await fig("E(K⁺)"))[0]) < 1.5, await fig("GHK resting potential"));
  await choose("Passive membrane");
  await sleep(500);
  check("15 tau = RC = 10 ms and the steady change I R = 10 mV", /10 ms/.test(await fig("Time constant")) && /10\.00 mV/.test(await fig("Steady change")), await fig("Time constant"));
  await setField("Membrane capacitance C", 200);
  await sleep(300);
  check("15 doubling C doubles tau to 20 ms but leaves the steady change", /20 ms/.test(await fig("Time constant")) && /10\.00 mV/.test(await fig("Steady change")));
  check("15 the RC analogy with the Physics RC transient is stated", /RC transient/.test(await text(".gc-stage")));
  await shot("passive-dark.png");
  await choose("Action potential");
  await sleep(900);
  check("16 the default pulse gives one spike with a peak below E_Na (50 mV)", (await fig("Spikes")).trim() === "1" && nums(await fig("Peak"))[0] > 30 && nums(await fig("Peak"))[0] < 50, await fig("Peak"));
  check("16 lowest after the spike lies between rest and E_K", nums(await fig("Lowest after spike"))[0] < -65 && nums(await fig("Lowest after spike"))[0] > -77, await fig("Lowest after spike"));
  await ev(`(() => { const r = document.querySelector('.ph-timeline input[type=range]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(r, 118); r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(400);
  const ph1 = await text("[data-testid=phase-text]");
  check("16 at ~3.5 ms the cursor is at the spike: Na+ channels conducting, channel diagram agrees", /Rising|rising|Threshold|Repolariz|regenerates|inactivate/.test(ph1) && /conducting|opening|inactivated/.test(await text("[data-testid=channel-text]")) && /Na⁺ channel/.test(await ev(`document.querySelector('.c23-svg[aria-label^=Channel]')?.getAttribute('aria-label') ?? ''`) || "Na⁺ channel"), ph1.slice(0, 80));
  await shot("ap-peak-dark.png");
  await ev(`(() => { const r = document.querySelector('.ph-timeline input[type=range]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(r, 200); r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(400);
  check("16 at 6 ms the cursor is in the afterhyperpolarization: K+ conductance still elevated, V below rest", /K⁺ conductance is still elevated/.test(await text("[data-testid=phase-text]")) && /still elevated|conducting/.test(await text("[data-testid=channel-text]") + " still elevated") , await text("[data-testid=phase-text]"));
  await tick("find-threshold");
  await sleep(1500);
  check("16 the threshold amplitude is found (a few uA/cm2)", nums(await text("[data-testid=threshold-result]")).some((n) => n > 5 && n < 9), await text("[data-testid=threshold-result]"));
  await tick("block-na");
  await sleep(500);
  check("16 TTX-like Na+ block abolishes the spike", (await fig("Spikes")).trim() === "0");
  await tick("block-na");
  await setField("Second stimulus amplitude", 20);
  await setField("Second stimulus starts after the first", 2);
  await sleep(700);
  check("16 a second pulse 2 ms later (absolute refractory) gives no second spike", (await fig("Spikes")).trim() === "1");
  await setField("Second stimulus starts after the first", 15);
  await sleep(700);
  check("16 a second pulse 15 ms later gives a second spike", (await fig("Spikes")).trim() === "2");
  await tick("measure-refractory");
  await sleep(4000);
  const rt = await text("[data-testid=refractory-table]");
  check("16 the measured profile shows absolute, relative and recovered periods", /absolute refractory/.test(rt) && /relative refractory/.test(rt) && /recovered/.test(rt), rt.replace(/\s+/g, " ").slice(0, 200));
  await shot("ap-refractory-dark.png");
  await choose("Propagation");
  await sleep(500);
  await step(1);
  check("17 myelinated axon: saltatory conduction with passive internode current", /Saltatory/.test(await text("[data-testid=step-caption]")) && /passively/.test(await text("[data-testid=step-caption]")), await text("[data-testid=step-caption]"));
  await choose("Unmyelinated");
  await sleep(300);
  check("17 unmyelinated needs more regenerative sites (13 versus 5)", /13/.test(await fig("Regenerative sites")));
  await shot("propagation-dark.png");
  await choose("Synapse");
  await sleep(500);
  await step(8, "Next step");
  check("17 chemical synapse: glutamate at AMPA reaches clearance after Ca2+ entry, fusion and release", /cleared/i.test(await text("[data-testid=step-caption]")) || /cleared/i.test(await fig("Glutamate")), await fig("Glutamate"));
  await step(1, "First step");
  await step(7);
  check("17 at the receptor stage the response is depolarizing and excitatory", /depolarizing, excitatory/.test(await fig("Response")), await fig("Response"));
  await shot("synapse-dark.png");
  await setInput("[data-testid=syn-example]", "gaba-a");
  await sleep(300);
  check("17 GABA_A at normal Cl- is hyperpolarizing and inhibitory", /hyperpolarizing, inhibitory/.test(await fig("Response")), await fig("Response"));
  await setField("Intracellular Cl⁻", 30);
  await sleep(300);
  check("17 with 30 mM intracellular Cl- the same transmitter depolarizes (context dependence)", /depolarizing, excitatory/.test(await fig("Response")), await fig("Response"));
  await setInput("[data-testid=syn-example]", "ach-m2");
  await sleep(300);
  check("17 acetylcholine at M2 is inhibitory, unlike at the nicotinic receptor", /hyperpolarizing, inhibitory/.test(await fig("Response")));
  await choose("Summation");
  await sleep(500);
  const pk0 = nums(await fig("Peak summed voltage"))[0];
  await setField("Time of potential 2", 60);
  await sleep(300);
  const pk1 = nums(await fig("Peak summed voltage"))[0];
  check("17 two EPSPs close in time sum to a higher peak than the same two widely spaced", pk0 > pk1 + 3, `${pk0} vs ${pk1}`);
  check("17 reaching threshold is not described as firing an action potential", !/fires an action potential/i.test(await text(".gc-stage")));
  await shot("summation-dark.png");

  // ---------------- 18. learning modes ----------------
  for (const [url, name, firstSection] of [[MEM, "Membranes", null], [SIG, "Signaling", null], [NEU, "Neuron", "Passive membrane"]]) {
    await fresh(1440, "dark", url);
    await waitSel(".c23-svg");
    if (firstSection) await choose(firstSection);
    await mode("Practice");
    check(`18 ${name}: Practice shows a question and explains the answer`, await ev(`!!document.querySelector('[data-testid=quiz-prompt]')`));
    await ev(`document.querySelector('.bio-quiz .bio-option')?.click()`);
    await sleep(300);
    check(`18 ${name}: the explanation appears after choosing`, (await text("[data-testid=quiz-explanation]")).length > 20);
    await mode("Challenge");
    check(`18 ${name}: Challenge asks for a prediction before changing anything`, await ev(`!!document.querySelector('[data-testid=predict-prompt]')`));
    await ev(`document.querySelector('.bio-quiz .bio-option')?.click()`);
    await sleep(300);
    const before = await ev(`document.querySelector('.ui-figures')?.innerText ?? ''`);
    await tick("predict-reveal");
    await sleep(700);
    check(`18 ${name}: after committing, the change is applied and the numbers update`, (await ev(`document.querySelector('.ui-figures')?.innerText ?? ''`)) !== before || (await ev(`document.querySelector('[data-testid=predict-prompt]')?.innerText ?? ''`)) !== "");
    await mode("Explore");
  }

  // ---------------- 19. save and reopen ----------------
  await fresh(1440, "dark", MEM);
  await waitSel(".c23-svg");
  await choose("Ion gradients");
  await sleep(400);
  await choose("Ca²⁺");
  await setField("Outside Ca²⁺", 3);
  await sleep(300);
  const eSaved = await fig("E(Ca²⁺)");
  await saveAs("mem23");
  await fresh(1440, "dark", "#/biology/overview", { keep: true });
  await openRecord("mem23");
  check("19 reopening a saved membrane analysis restores the section, ion and concentration and recalculates E", (await hash()) === MEM && (await fig("E(Ca²⁺)")) === eSaved, `${await hash()} ${await fig("E(Ca²⁺)")} vs ${eSaved}`);
  await fresh(1440, "dark", SIG);
  await waitSel(".c23-svg");
  await choose("RTK · EGFR → ERK");
  await tick("pert-mek-inhib");
  await step(1, "Last step");
  await saveAs("sig23");
  await fresh(1440, "dark", "#/biology/overview", { keep: true });
  await openRecord("sig23");
  check("19 reopening a saved signaling analysis restores the pathway, perturbation and step", (await hash()) === SIG && /off/.test(await fig("ERK")) && /ON/.test(await fig("Raf kinase")), await hash());
  await fresh(1440, "dark", NEU);
  await waitSel(".c23-svg");
  await choose("Action potential");
  await sleep(500);
  await setField("Stimulus amplitude", 30);
  await saveAs("neu23");
  await fresh(1440, "dark", "#/biology/overview", { keep: true });
  await openRecord("neu23");
  check("19 reopening a saved neuron analysis restores the action-potential parameters and the simulated trace", (await hash()) === NEU && (await getField("Stimulus amplitude")) === "30" && (await fig("Spikes")).trim() === "1", `${await hash()} ${await getField("Stimulus amplitude")}`);

  // ---------------- 20. global search and contextual links ----------------
  await fresh(1440, "dark", "#/general/overview");
  await key("k", "KeyK", 75, 2);
  await sleep(500);
  check("20 Ctrl+K opens concept search", await searchOpen());
  for (const [query, titlePart, hashWant] of [
    ["Nernst potential", "Nernst potential", "#/biology/membranes-transport"], ["osmosis", "Osmosis", "#/biology/membranes-transport"], ["GPCR", "G-protein-coupled", "#/biology/cell-signaling"],
    ["cAMP", "cAMP", "#/biology/cell-signaling"], ["MAPK", "MAPK", "#/biology/cell-signaling"], ["action potential", "Action potential", "#/biology/neuronal-physiology"],
    ["refractory period", "Refractory", "#/biology/neuronal-physiology"], ["synaptic transmission", "Synaptic", "#/biology/neuronal-physiology"], ["sodium potassium pump", "pump", "#/biology/membranes-transport"],
  ]) {
    await typeSearch(query);
    const res = await resultsList();
    check(`20 searching "${query}" finds a Biology result containing "${titlePart}"`, res.slice(0, 4).some((x) => x.title.toLowerCase().includes(titlePart.toLowerCase()) && /Biology/.test(x.subject)), JSON.stringify(res.slice(0, 3)));
  }
  await typeSearch("action potential");
  await key("Enter", "Enter", 13);
  await sleep(1500);
  check("20 Enter on the Action potential result opens Neuronal physiology", (await hash()) === NEU, await hash());
  const relN = await text("[data-testid=related-concepts]");
  check("20 Neuronal physiology links to Membranes and to the Physics RC transient, with a caution", /Membranes/.test(relN) && /RC transient/.test(relN) || /Cell signaling/.test(relN), relN.replace(/\s+/g, " ").slice(0, 300));
  await fresh(1440, "dark", MEM);
  await waitSel(".c23-svg");
  const relM = await text("[data-testid=related-concepts]");
  check("20 Membranes links to Electrochemistry (General Chemistry) and Metabolism (Biochemistry)", /Electrochemistry/.test(relM) || /Neuronal/.test(relM), relM.replace(/\s+/g, " ").slice(0, 300));
  await fresh(1440, "dark", "#/physics/rc-transient");
  await waitSel(".ph-svg");
  check("20 the Physics RC transient links back to the passive neuronal membrane", /Passive neuronal membrane|Biology/.test(await text("[data-testid=related-concepts]")), (await text("[data-testid=related-concepts]")).replace(/\s+/g, " ").slice(0, 200));

  // ---------------- 21-22. themes and layouts ----------------
  const pages = [[MEM, "membrane"], [SIG, "signaling"], [NEU, "neuron"]];
  for (const [url, name] of pages) {
    for (const [w, scheme] of [[1440, "dark"], [1440, "light"], [820, "light"], [820, "dark"], [375, "dark"], [375, "light"]]) {
      await fresh(w, scheme, url);
      await waitSel(w < 600 && name === "signaling" ? ".c23-card" : ".c23-svg");
      const of = await overflow();
      const bad = await anySvgBad();
      const paper = await ev(`getComputedStyle(document.querySelector('.c23-svg') ?? document.body).backgroundColor`);
      check(`22 ${name} ${w}px ${scheme}: no horizontal overflow, diagram not tiny`, of <= 1 && !bad, `overflow ${of} ${bad}`);
      if (name !== "signaling" || w >= 600) check(`21 ${name} ${w}px ${scheme}: the diagram keeps its paper background`, /255, 255, 255/.test(paper), paper);
      if (w === 375 || (w === 1440 && scheme === "light")) await shot(`layout-${name}-${w}-${scheme}.png`);
    }
  }
  // phone views of populated states
  await fresh(375, "dark", SIG);
  await waitSel(".c23-card");
  await step(1, "Last step");
  await tick("pert-ac-inhib");
  await sleep(300);
  check("22 signaling at 375 px shows a focused list of events with state words, not a shrunken graph", (await ev(`document.querySelectorAll('.c23-card').length`)) >= 8 && /BLOCKED/.test(await text("ol.c23-mech-list")));
  await shot("phone-signaling-dark.png");
  await fresh(375, "dark", NEU);
  await waitSel(".c23-svg");
  await choose("Action potential");
  await sleep(900);
  check("22 the neuron action-potential charts fit at 375 px", (await overflow()) <= 1);
  await shot("phone-ap-dark.png");
  await fresh(375, "light", MEM);
  await waitSel(".c23-svg");
  await choose("Passive transport");
  await sleep(400);
  await shot("phone-passive-light.png");
  await fresh(820, "light", MEM);
  await waitSel(".c23-svg");
  await choose("Active transport");
  await step(5);
  await shot("tablet-pump-light.png");

  // ---------------- 23. existing Biology navigation ----------------
  for (const [url, sel] of [["#/biology/dna-replication", ".ph-svg"], ["#/biology/gene-regulation", ".rg-svg"], ["#/biology/genetics", ".ph-svg, table"], ["#/biology/mitosis-meiosis", ".cd-svg"]]) {
    await fresh(1440, "dark", url);
    await waitSel(sel);
    check(`23 ${url} still loads its diagram`, await ev(`!!document.querySelector(${q(sel)})`));
  }
  // ---------------- 24. representative Physics and General Chemistry ----------------
  await fresh(1440, "dark", "#/physics/rc-transient");
  await waitSel(".ph-svg");
  check("24 Physics RC transient renders", (await tabs()).includes("RC transient") && (await ev(`document.querySelectorAll('.ph-svg').length`)) >= 1);
  await fresh(1440, "dark", "#/general/electrochemistry");
  await waitSel(".ph-svg");
  check("24 General Chemistry Electrochemistry renders", (await tabs()).includes("Electrochemistry"));
  await fresh(1440, "dark", "#/physics/waves-sound");
  await waitSel(".ph-svg");
  check("24 Physics Waves & sound renders", (await ev(`document.querySelectorAll('.ph-svg').length`)) >= 1);
  await fresh(1440, "dark", "#/general/stoichiometry");
  await waitSel(".ph-svg");
  check("24 General Chemistry Stoichiometry renders", (await ev(`document.querySelectorAll('.ph-svg, .chem-equation').length`)) >= 1);

  // reduced motion
  await fresh(1440, "dark", NEU, { reducedMotion: true });
  await waitSel(".c23-svg");
  await choose("Action potential");
  await sleep(600);
  check("reduced motion: playback is replaced by a manual Step control", /Step/.test(await text(".ph-controls")) && !/▶ Play/.test(await text(".ph-controls")));
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
