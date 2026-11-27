// Stage 18 live-browser check (headless Chrome, production build): metabolic pathways in Biochemistry - navigation, glycolysis, gluconeogenesis,
// pyruvate oxidation and the citric acid cycle, the respiratory chain, the integrated map, Explore/Practice/Challenge, saving and reopening,
// layouts and themes. Screenshots are written for visual inspection.
//   npm run build && node scripts/browser/stage18LiveCheck.mjs      (screenshots: node_modules/.cache/pc-live18)
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${String(detail).slice(0, 220)}` : ""}`); };
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live18");
const { cdp, url, stop } = await startBrowser({ port: 4351, debugPort: 9511 });
const ev = (e) => cdp.evaluate(e);
let nav = 0;
const click = (label, scope = "document") => ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const clickStarts = (label) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith(${q(label)}) && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const choose = (label) => ev(`(() => { const o = [...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; o.querySelector('input').click(); return true; })()`);
const setSignal = (group, level) => ev(`(() => { const g = [...document.querySelectorAll('[role=radiogroup]')].find((x) => (x.getAttribute('aria-label') || '').startsWith(${q(group)})); if (!g) return false; const o = [...g.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(level)}); if (!o) return false; o.querySelector('input').click(); return true; })()`);
const setSel = (testid, value) => ev(`(() => { const el = document.querySelector('[data-testid=${testid}]'); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const tick = (testid) => ev(`(() => { const el = document.querySelector('[data-testid=${testid}]'); if (!el) return false; el.click(); return true; })()`);
const svgClick = (testid) => ev(`(() => { const el = document.querySelector('[data-testid=${testid}]'); if (!el) return false; el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
const setText = (selector, value) => ev(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return false; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const text = (sel) => ev(`(document.querySelector(${q(sel)})?.innerText ?? null)`);
const norm = async (sel) => ((await text(sel)) ?? "").replace(/\s+/g, " ").trim();
const count = (sel) => ev(`document.querySelectorAll(${q(sel)}).length`);
const bodyText = () => ev(`document.body.innerText.replace(/\\s+/g, ' ')`);
const clearStorage = () => ev(`(async () => { try { localStorage.clear(); sessionStorage.clear(); const dbs = (await indexedDB.databases?.()) ?? []; await Promise.all(dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); }))); } catch (e) { /* nothing to clear */ } return true; })()`);
const ready = (what) => waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), what);
const fresh = async (w, scheme, target) => {
  await setViewport(cdp, w, w < 500 ? 812 : w < 1000 ? 1024 : 900, { scheme });
  nav += 1;
  await cdp.send("Page.navigate", { url: `${url}?n=${nav}#/biology/overview` });
  await ready("app"); await sleep(300); await clearStorage();
  nav += 1;
  await cdp.send("Page.navigate", { url: `${url}?n=${nav}${target}` });
  await ready("app"); await sleep(900);
};
const next = async (n) => { for (let i = 0; i < n; i += 1) await click("Next ▶"); await sleep(250); };
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const tabs = () => ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].map((b) => b.textContent.trim()).join('|')`);
const shot = async (name, sel = ".ui-diagram") => { await ev(`(document.querySelector(${q(sel)}) || document.body).scrollIntoView({ block: 'start' })`); await sleep(300); await screenshot(cdp, path.join(outDir, name), { fullPage: false }); };
const textOf = (sel) => ev(`(document.querySelector(${q(sel)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`);

try {
  // ---- 1. Biochemistry navigation and the other subjects
  await fresh(1440, "light", "#/biochemistry/overview");
  const want = "Overview|Amino acids & peptides|Protein structure & folding|Enzymes & catalysis|Glycolysis|Gluconeogenesis|Pyruvate oxidation & citric acid cycle|Electron transport & oxidative phosphorylation|Integrated metabolic map|Fatty-acid & ketone-body metabolism|Amino-acid metabolism & urea cycle|Integrated fuel metabolism|Saved";
  check("1 Biochemistry tabs list all five metabolic tools after the Stage 17 tools", (await tabs()) === want, await tabs());
  const ov = await ev(`({ cards: [...document.querySelectorAll('.gc-tool-card button')].map((b) => b.textContent.trim()), pb: document.querySelectorAll('.gc-planned button').length, groups: [...document.querySelectorAll('.ph-group-heading')].map((h) => h.textContent).join('|') })`);
  check("1 overview: eight working tools in two groups, planned list has no buttons", ov.cards.length === 11 && ov.pb === 0 && ov.groups === "Biomolecules|Metabolism", JSON.stringify(ov));
  await click("Open Glycolysis"); await sleep(900);
  check("1 Open button reaches Glycolysis; hash", (await ev("location.hash")) === "#/biochemistry/glycolysis", await ev("location.hash"));
  await shot("overview.png", ".gc-tool-cards");
  const inOrder = (original) => (t) => { const have = t.split("|"); let at = -1; return have[0] === original[0] && have[have.length - 1] === "Saved" && original.every((x) => { const i = have.indexOf(x, at + 1); if (i < 0) return false; at = i; return true; }); };
  for (const [target, expect, label] of [
    ["#/organic/properties", (t) => t.startsWith("Properties|Ranking|Spectroscopy|Conformations|Reactions"), "Organic"],
    // Physics, General Chemistry and Biology gained tools after Stage 18, so an exact list went stale. The behavioural claim that matters here is that the
    // tools those subjects had at Stage 18 are all still present, in the same relative order, with Overview first and Saved last.
    ["#/physics/overview", inOrder(["Overview", "Mechanics & motion", "Forces & Newton's laws", "Work & energy", "Momentum & collisions", "DC circuits", "RC transient", "Saved"]), "Physics"],
    ["#/general/overview", inOrder(["Overview", "Acid–base & titration", "Chemical equilibrium", "Reaction kinetics", "Thermodynamics", "Saved"]), "General Chemistry"],
    ["#/biology/overview", inOrder(["Overview", "DNA replication", "Transcription & RNA processing", "Translation", "DNA → RNA → protein", "Gene regulation", "Genetics & inheritance", "Mitosis & meiosis", "Saved"]), "Biology"],
  ]) { await fresh(1440, "light", target); check(`22 ${label} existing tools still present in order`, expect(await tabs()), await tabs()); }

  // ---- 2. glycolysis progression and ledger
  await fresh(1440, "light", "#/biochemistry/glycolysis");
  check("2 glycolysis: diagram with the ten reactions' connectors and the reaction list", (await count("[data-testid^=conn-]")) >= 10 && (await count("[data-testid=reaction-list] button")) === 10, String(await count("[data-testid^=conn-]")));
  await next(1);
  check("2 step 1: hexokinase card with equation Glc + ATP → G6P + ADP, cytosol", /Glc \+ ATP → G6P \+ ADP/.test(await textOf("[data-testid=reaction-equation]")) && /Cytosol/.test(await textOf("[data-testid=reaction-card]")), await textOf("[data-testid=reaction-equation]"));
  await next(2);
  check("3 after PFK-1 (step 3) the cumulative ledger is −2 ATP (investment phase)", /−2/.test(await textOf("[data-testid=cum-atp]")), await textOf("[data-testid=cum-atp]"));
  await shot("glycolysis-step3.png", "[data-testid=step-caption]");
  await next(4);
  check("3 after phosphoglycerate kinase (step 7) the investment is repaid: ATP 0", /ATP 0/.test(await textOf("[data-testid=cum-atp]")), await textOf("[data-testid=cum-atp]"));
  await next(3);
  check("3 after pyruvate kinase (step 10) the net is +2 ATP", /\+2/.test(await textOf("[data-testid=cum-atp]")), await textOf("[data-testid=cum-atp]"));
  await clickStarts("6. GAPDH"); await sleep(300);
  check("2 selecting GAPDH shows its equation with NADH and the ×2 per glucose badge", /G3P \+ Pi \+ NAD⁺ → 1,3BPG \+ NADH \+ H⁺/.test(await textOf("[data-testid=reaction-equation]")) && /×2 per glucose/.test(await textOf("[data-testid=reaction-card]")), await textOf("[data-testid=reaction-equation]"));
  check("2 substrate and product structures are drawn for the selected reaction", (await count("[data-testid=reaction-card] [data-testid=molecule-svg]")) >= 1);
  await svgClick("conn-PFK1"); await sleep(300);
  check("2 clicking an arrow in the diagram selects that reaction", /PFK1|Phosphofructokinase/.test(await textOf("[data-testid=reaction-card] h3")), await textOf("[data-testid=reaction-card] h3"));
  await svgClick("node-f16"); await sleep(1200);
  check("2 selecting a metabolite node opens its identity card with carbon count and pathways", /Fructose 1,6-bisphosphate/.test(await textOf("[data-testid=metabolite-card]")) && /6 carbons/.test(await textOf("[data-testid=metabolite-card]")) && /Gluconeogenesis/.test(await textOf("[data-testid=metabolite-card]")), await textOf("[data-testid=metabolite-card]"));
  await shot("glycolysis-final.png", "[data-testid=lane-diagram]");
  await choose("Energy ledger"); await sleep(500);
  const ne = await textOf("[data-testid=net-equation]");
  check("3 net equation: Glc + 2 ADP + 2 Pi + 2 NAD⁺ → 2 Pyr + 2 ATP + 2 NADH + 2 H⁺ + 2 H₂O", /Glc/.test(ne) && /2 ADP/.test(ne) && /2 Pi/.test(ne) && /2 NAD⁺/.test(ne) && /2 Pyr/.test(ne) && /2 ATP/.test(ne) && /2 NADH/.test(ne) && /2 H₂O/.test(ne), ne);
  check("3 energy view: four ATP made, two invested, two net, in key figures", /ATP invested 2/i.test(await norm(".ui-figures")) && /ATP made \(gross\) 4/i.test(await norm(".ui-figures")) && /ATP net 2/i.test(await norm(".ui-figures")), await norm(".ui-figures"));
  await shot("glycolysis-energy.png", ".ui-diagram");
  await choose("Regulation"); await sleep(500);
  await setSignal("ATP", "High"); await sleep(300);
  const t1 = await norm("[data-testid=tendency-table]");
  check("4 ATP high: PFK-1 lower and pyruvate kinase lower, as direct allosteric effects", /PFK-1 ▼ Lower/.test(t1) && /PK ▼ Lower/.test(t1) && /Direct allosteric/.test(t1), t1.slice(0, 200));
  await setSignal("AMP", "High"); await sleep(300);
  check("4 ATP and AMP both high: PFK-1 is uncertain, not resolved", /PFK-1 \? Uncertain/i.test(await norm("[data-testid=tendency-table]")));
  await setSignal("ATP", "Normal"); await setSignal("AMP", "Normal"); await setSignal("Fructose 2,6-bisphosphate", "High"); await sleep(300);
  check("4 fructose 2,6-bisphosphate high: PFK-1 higher", /PFK-1 ▲ Higher/i.test(await norm("[data-testid=tendency-table]")));
  await shot("glycolysis-regulation.png", "[data-testid=tendency-table]");

  // ---- 5/6/7. gluconeogenesis
  await fresh(1440, "light", "#/biochemistry/gluconeogenesis");
  check("5 gluconeogenesis: diagram with the mitochondrial detour and 14 reactions listed", (await count("[data-testid=reaction-list] button")) === 14 && /Mitochondrial matrix/.test(await textOf("[data-testid=lane-diagram]")));
  await next(1);
  check("5 step 1 is pyruvate carboxylase in the matrix: Pyr + CO₂ + H₂O + ATP → OAA + ADP + Pi", /Pyr \+ CO₂ \+ H₂O \+ ATP → OAA \+ ADP \+ Pi/.test(await textOf("[data-testid=reaction-equation]")) && /Mitochondrial matrix/.test(await textOf("[data-testid=reaction-card]")) && /Gluconeogenic bypass/.test(await textOf("[data-testid=reaction-card]")), await textOf("[data-testid=reaction-equation]"));
  await next(4);
  check("5 step 5 is PEPCK (GTP), cumulative GTP −2 consumed by the end of this step ×2", /PEPCK|Phosphoenolpyruvate carboxykinase/.test(await textOf("[data-testid=reaction-card] h3")), await textOf("[data-testid=reaction-card] h3"));
  await next(9);
  const net = await textOf("[data-testid=net-equation]");
  check("5 complete pathway: net uses 4 ATP + 2 GTP + 2 NADH and makes 1 glucose with 6 Pi", /4 ATP/.test(net) && /2 GTP/.test(net) && /2 NADH/.test(net) && /Glc/.test(net) && /6 Pi/.test(net), net);
  check("5 energy accounting key figures: ATP 4, GTP 2, NADH 2 consumed", /ATP consumed 4/i.test(await norm(".ui-figures")) && /GTP consumed 2/i.test(await norm(".ui-figures")) && /NADH consumed 2/i.test(await norm(".ui-figures")), await norm(".ui-figures"));
  await shot("gluconeogenesis-final.png", "[data-testid=lane-diagram]");
  await choose("Compare with glycolysis"); await sleep(600);
  check("6 compare: one diagram with both lanes (connectors for all bypasses and shared steps)", (await count("[data-testid^=conn-]")) >= 15 && /side by side/.test(await ev(`document.querySelector('[data-testid=lane-diagram]').getAttribute('aria-label')`)));
  const bt = await norm("[data-testid=bypass-table]");
  check("6 bypass table: PFK-1 → FBPase-1, PK → PC + PEPCK, HK → G6Pase", /PFK-1 FBPase-1/i.test(bt) && /PK PC \+ PEPCK/i.test(bt) && /Hexokinase G6Pase/i.test(bt), bt);
  check("6 futile cycle: one nucleoside triphosphate hydrolysed per cycle", /1 nucleoside triphosphate/.test(await textOf("[data-testid=cycle-cost]")), await textOf("[data-testid=cycle-cost]"));
  await choose("PK / PC + PEPCK"); await sleep(300);
  check("6 the PEP/pyruvate cycle also costs one NTP (GTP), shown from the stoichiometry", /1 nucleoside triphosphate/.test(await textOf("[data-testid=cycle-cost]")) && /GTP/.test(await textOf("[data-testid=cycle-equation]")), await textOf("[data-testid=cycle-equation]"));
  await shot("compare.png", "[data-testid=lane-diagram]");
  await choose("Regulation"); await sleep(400);
  await choose("Fed-associated (liver)"); await sleep(400);
  check("7 fed scenario: curated model favours glycolysis, with the liver-specific caveat", /glycolytic control points up/.test(await textOf("[data-testid=verdict-text]")) && /Liver-specific/.test(await bodyText()), await textOf("[data-testid=verdict-text]"));
  await choose("Fasting-associated (liver)"); await sleep(400);
  check("7 fasting scenario: gluconeogenic control points up, and the page says it is not a tissue prediction", /gluconeogenic control points up/.test(await textOf("[data-testid=verdict-text]")) && /Isolated pathway, not a tissue/.test(await bodyText()), await textOf("[data-testid=verdict-text]"));
  await setSignal("Fructose 2,6-bisphosphate", "High"); await sleep(300);
  check("7 conflicting signals (fasting + high F2,6BP) give mixed/uncertain, not an invented answer", /mixed or conflicting/.test(await textOf("[data-testid=verdict-text]")), await textOf("[data-testid=verdict-text]"));
  await shot("gng-regulation.png", "[data-testid=verdict]");

  // ---- 8/9/10. pyruvate oxidation and the cycle
  await fresh(1440, "light", "#/biochemistry/citric-acid-cycle");
  await choose("Pyruvate oxidation"); await sleep(400);
  check("8 pyruvate dehydrogenase equation and matrix localisation", /Pyr \+ CoA-SH \+ NAD⁺ → AcCoA \+ CO₂ \+ NADH \+ H⁺/.test(await textOf("[data-testid=reaction-equation]")) && /Mitochondrial matrix/.test(await textOf("[data-testid=reaction-card]")), await textOf("[data-testid=reaction-equation]"));
  await next(2);
  check("8 stage 2: the complex diagram shows CO₂ leaving and carbons C3 → C2 + CO₂", /CO₂/.test(await textOf("[data-testid=pdh-diagram]")) && /C2/.test(await textOf("[data-testid=pdh-diagram]")));
  await next(3);
  check("8 stage 5: NADH formed", /NADH \+ H⁺/.test(await textOf("[data-testid=pdh-diagram]")) && /NAD⁺ reduced/.test(await textOf("[data-testid=step-caption]")), await textOf("[data-testid=step-caption]"));
  await shot("pdh.png", "[data-testid=pdh-diagram]");
  await choose("Citric acid cycle"); await sleep(500);
  await next(8);
  check("9 after one turn: 3 NADH, 1 FADH₂, 1 GTP, 2 CO₂ and oxaloacetate regenerated", /NADH 3/.test(await textOf("[data-testid=cum-nadh]")) && /FADH₂ 1/.test(await textOf("[data-testid=cum-fadh2]")) && /GTP 1/.test(await textOf("[data-testid=cum-gtp]")) && /CO₂ 2/.test(await textOf("[data-testid=cum-co2]")) && /regenerated/.test(await textOf("[data-testid=node-oaa]")), await textOf("[data-testid=step-caption]"));
  await shot("tca-turn1.png", "[data-testid=cycle-diagram]");
  await next(0); await choose("Two turns (one glucose)"); await sleep(400);
  await click("Last step"); await sleep(400);
  await click("⏭"); await sleep(400);
  check("9 two turns (one glucose): 6 NADH, 2 FADH₂, 2 GTP, 4 CO₂", /NADH 6/.test(await textOf("[data-testid=cum-nadh]")) && /FADH₂ 2/.test(await textOf("[data-testid=cum-fadh2]")) && /GTP 2/.test(await textOf("[data-testid=cum-gtp]")) && /CO₂ 4/.test(await textOf("[data-testid=cum-co2]")), await textOf("[data-testid=step-caption]"));
  await svgClick("conn-SDH"); await sleep(1000);
  check("9 selecting succinate dehydrogenase explains that it is complex II and makes FADH₂", /complex II/i.test(await textOf("[data-testid=reaction-card]")) && /FADH₂/.test(await textOf("[data-testid=reaction-equation]")), await textOf("[data-testid=reaction-equation]"));
  await choose("Carbons and carriers"); await sleep(500);
  check("10 per-glucose table counts pyruvate oxidation and the cycle separately: 8 NADH and 6 CO₂ in total", (await textOf("[data-testid=tot-nadh]")) === "8" && (await textOf("[data-testid=tot-co2]")) === "6" && /Pyruvate oxidation \(2 pyruvate\) 2 0 0 2/i.test(await norm("[data-testid=per-glucose-table]")), await norm("[data-testid=per-glucose-table]"));
  check("10 carbon table: citrate 6, α-ketoglutarate 5, oxaloacetate 4, and an honest count-not-identity note", /Citrate 6/i.test(await norm("[data-testid=carbon-table]")) && /α-Ketoglutarate 5/i.test(await norm("[data-testid=carbon-table]")) && /not atom tracing|Counts, not atom tracing/.test(await bodyText()));

  // ---- 11-15. respiratory chain
  await fresh(1440, "light", "#/biochemistry/electron-transport");
  check("11 chain diagram is present with complexes I to IV, Q, cytochrome c and ATP synthase", (await count("[data-testid^=complex-]")) === 5 && (await count("[data-testid^=carrier-]")) === 2);
  await next(7);
  check("11 after the last carrier the diagram shows water formed and ATP made", /H₂O formed/.test(await textOf("[data-testid=mito-diagram]")) && /ADP \+ Pi → ATP/.test(await textOf("[data-testid=mito-diagram]")));
  check("12 NADH path: about 10 H⁺ pumped per electron pair", /H⁺ pumped per electron pair 10/i.test(await norm(".ui-figures")), await norm(".ui-figures"));
  await shot("etc-nadh.png", "[data-testid=mito-diagram]");
  await choose("Succinate (FADH₂)"); await sleep(400);
  await next(7);
  check("12 succinate path: about 6 H⁺ per pair and complex I is not on the path", /H⁺ pumped per electron pair 6/i.test(await norm(".ui-figures")), await norm(".ui-figures"));
  await svgClick("complex-CII"); await sleep(300);
  check("12 selecting complex II states that it does NOT pump protons", /does NOT pump protons/.test(await textOf("[data-testid=complex-card]")), await textOf("[data-testid=complex-card]"));
  await svgClick("complex-ATPSYN"); await sleep(300);
  check("13 selecting ATP synthase explains proton flow, rotation and the H⁺-per-ATP assumption", /F₀ rotor/.test(await textOf("[data-testid=complex-card]")) && /approximation/.test(await textOf("[data-testid=complex-card]")));
  await choose("NADH"); await choose("Inhibitors and uncouplers"); await sleep(400);
  await setSel("condition-select", "cyanide"); await sleep(400);
  check("14 cyanide at complex IV: electron flow and O₂ use stop, gradient collapses, carriers upstream more reduced", /stops/.test(await textOf("[data-testid=flow-o2]")) && /collapses/.test(await textOf("[data-testid=flow-gradient]")) && /NADH more reduced/.test(await textOf("[data-testid=redox]")) && /Complex IV unchanged/.test(await textOf("[data-testid=redox]")), await textOf("[data-testid=redox]"));
  await shot("etc-cyanide.png", "[data-testid=mito-diagram]");
  await choose("Both"); await setSel("condition-select", "rotenone"); await sleep(400);
  check("14 rotenone with NADH and succinate supplied: electron flow falls (succinate route continues)", /falls/.test(await textOf("[data-testid=flow-electron]")) && /Succinate \(FADH₂\)[^.]*does not pass complex I/.test(await textOf("[data-testid=outcome-explanation]")), await textOf("[data-testid=outcome-explanation]"));
  await choose("NADH"); await setSel("condition-select", "uncoupler"); await sleep(400);
  check("15 uncoupler: electron flow and O₂ use rise, gradient collapses, ATP synthesis falls", /rises/.test(await textOf("[data-testid=flow-electron]")) && /rises/.test(await textOf("[data-testid=flow-o2]")) && /collapses/.test(await textOf("[data-testid=flow-gradient]")) && /falls/.test(await textOf("[data-testid=flow-atp]")), await textOf("[data-testid=flow-o2]"));
  await shot("etc-uncoupler.png", "[data-testid=mito-diagram]");
  await setSel("condition-select", "oligomycin"); await sleep(400);
  check("15 oligomycin: ATP synthesis stops, gradient higher, electron flow falls", /stops/.test(await textOf("[data-testid=flow-atp]")) && /higher/.test(await textOf("[data-testid=flow-gradient]")) && /falls/.test(await textOf("[data-testid=flow-electron]")));
  await choose("ATP yield"); await sleep(400);
  check("13 yield view: 32 ATP with malate–aspartate, labelled an estimate and not one fixed number", (await textOf("[data-testid=atp-total]")) === "32" && /Not one fixed number/.test(await bodyText()));
  await choose("Glycerol-phosphate shuttle"); await sleep(300);
  check("13 glycerol-phosphate shuttle changes the estimate to 30", (await textOf("[data-testid=atp-total]")) === "30", await textOf("[data-testid=atp-total]"));

  // ---- 16/17. integrated map
  await fresh(1440, "light", "#/biochemistry/metabolic-map");
  check("16 map diagram shows pathway boxes and shared metabolites", (await count("[data-testid^=map-]")) >= 10 && /Glycolysis/.test(await textOf("[data-testid=map-diagram]")) && /Oxaloacetate/.test(await textOf("[data-testid=map-diagram]")));
  check("16 ledger: 32 ATP (estimate), 6 CO₂, 10 NADH + 2 FADH₂", (await textOf("[data-testid=map-total]")) === "32" && /10 NADH \+ 2 FADH₂/i.test(await norm(".ui-figures")) && /CO₂ 6/i.test(await norm(".ui-figures")), await norm(".ui-figures"));
  await svgClick("map-tca"); await sleep(400);
  check("16 selecting the cycle shows its card, net equation and an Open button", /Citric acid cycle/.test(await textOf("[data-testid=pathway-card]")) && /CO₂/.test(await textOf("[data-testid=pathway-card]")) && (await count("[data-testid=open-pathway-tool]")) === 1);
  await shot("map-pathway.png", "[data-testid=map-diagram]");
  await tick("open-pathway-tool"); await sleep(1500);
  check("16 the Open button navigates to the cycle tool", (await ev("location.hash")) === "#/biochemistry/citric-acid-cycle", await ev("location.hash"));
  await fresh(1440, "light", "#/biochemistry/metabolic-map");
  await choose("Glycerol-phosphate shuttle"); await sleep(300);
  check("16 changing the shuttle updates the ledger consistently (30)", (await textOf("[data-testid=map-total]")) === "30");
  await setSel("scenario-select", "fasting"); await sleep(400);
  check("16 fasting scenario: regulation statements derived from the curated table, plus a not-modelled line", /FBPase-1: higher/.test(await textOf("[data-testid=scenario-statements]")) && /Not modelled/.test(await textOf("[data-testid=scenario-statements]")) && /PFK-1: lower/.test(await textOf("[data-testid=scenario-statements]")));
  await setSel("scenario-select", "uncoupling"); await sleep(400);
  check("16 uncoupling scenario: respiratory-model statements (O₂ consumption rises, gradient collapses)", /O₂ consumption rises/.test(await textOf("[data-testid=scenario-statements]")) && /gradient collapses/.test(await textOf("[data-testid=scenario-statements]")), await textOf("[data-testid=scenario-statements]"));
  await shot("map-uncoupling.png", "[data-testid=map-diagram]");
  await choose("Reaction level"); await sleep(400);
  await setSel("met-select", "pyruvate"); await sleep(1200);
  const mc = await textOf("[data-testid=metabolite-card]");
  check("17 pyruvate card: shared by glycolysis, gluconeogenesis and pyruvate oxidation, with its structure", /Glycolysis/.test(mc) && /Gluconeogenesis/.test(mc) && /Pyruvate oxidation/.test(mc) && (await count("[data-testid=metabolite-card] [data-testid=molecule-svg] svg")) >= 1, mc.slice(0, 200));
  await ev(`[...document.querySelectorAll('[data-testid=metabolite-card] .mt-links button')].find((b) => /Pyruvate dehydrogenase/.test(b.textContent))?.click()`); await sleep(1200);
  check("17 following a reaction link from a metabolite opens that same reaction card", /Pyruvate dehydrogenase complex/.test(await textOf("[data-testid=reaction-card] h3")), await textOf("[data-testid=reaction-card] h3"));

  // ---- 18. Explore / Practice / Challenge
  await fresh(1440, "light", "#/biochemistry/glycolysis");
  await choose("Practice"); await sleep(400);
  check("18 practice: enzyme names are hidden in the reaction list and questions appear", /^1\. \?/.test(await textOf("[data-testid=reaction-list] li:first-child")) && (await count("[data-testid=quiz-prompt]")) === 1, await textOf("[data-testid=reaction-list] li:first-child"));
  await next(1);
  check("18 practice: reaction card hides name and explanation until revealed", /Reaction 1/.test(await textOf("[data-testid=reaction-card] h3")) && /hidden/.test(await textOf("[data-testid=reaction-card]")));
  await tick("reveal-labels"); await sleep(300);
  check("18 practice: Reveal labels shows the enzyme", /Hexokinase/.test(await textOf("[data-testid=reaction-card] h3")));
  await ev(`document.querySelectorAll('.bio-quiz .bio-option')[0].click()`); await sleep(300);
  check("18 practice: an answer gets an explanation from the shared data", (await textOf("[data-testid=quiz-explanation]")).length > 30);
  await choose("Challenge"); await sleep(500);
  const prompt = await textOf("[data-testid=predict-prompt]");
  check("18 challenge: asks for a prediction first and does not change the view", /PFK-1|ATP/.test(prompt) && (await ev(`!document.querySelector('[data-testid=tendency-table]')`)), prompt);
  await ev(`document.querySelectorAll('.bio-quiz .bio-option')[1].click()`); await sleep(300);
  await tick("predict-reveal"); await sleep(600);
  check("18 challenge: after committing, Reveal applies the signals and opens the regulation table; the next prediction is offered", (await count("[data-testid=tendency-table]")) === 1 && (await textOf("[data-testid=predict-prompt]")) !== prompt, await textOf("[data-testid=predict-prompt]"));
  await fresh(1440, "light", "#/biochemistry/electron-transport");
  await choose("Challenge"); await sleep(400);
  const eprompt = await textOf("[data-testid=predict-prompt]");
  await ev(`document.querySelectorAll('.bio-quiz .bio-option')[0].click()`); await sleep(300);
  await tick("predict-reveal"); await sleep(700);
  check("18 respiratory-chain challenge: reveal applies the condition and opens the inhibitors view", (await count("[data-testid=outcome-table]")) === 1 && (await textOf("[data-testid=condition-select]")).length > 0 && eprompt.length > 20, eprompt.slice(0, 100));

  // ---- 19. saving, reopening and autosave
  await fresh(1440, "light", "#/biochemistry/glycolysis");
  await next(4); await choose("Regulation"); await setSignal("ATP", "High"); await sleep(400);
  await click("Save Analysis"); await sleep(300);
  await setText(".synthesis-save-form input", "glyco s18");
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`document.body.innerText.includes('Saved “glyco s18”')`), "save notice", 15000);
  check("19 glycolysis save notice shown", true);
  await choose("Pathway"); await next(3); await sleep(300);
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 1`), "saved list", 15000);
  check("19 saved list labels it Biochemistry and Glycolysis", /Biochemistry/.test(await bodyText()) && /Glycolysis/.test(await bodyText()));
  await ev(`(() => { const row = [...document.querySelectorAll('li, article')].find((x) => x.textContent.includes('glyco s18') && x.querySelector('button')); [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open')?.click(); })()`);
  await sleep(700);
  if (await ev(`!!document.querySelector('[role=alertdialog]')`)) await click("Replace without saving");
  await sleep(1500);
  check("19 reopening restores the regulation view with ATP high (PFK-1 lower) on the glycolysis route", (await ev("location.hash")) === "#/biochemistry/glycolysis" && /PFK-1 ▼ Lower/i.test(await norm("[data-testid=tendency-table]")), await ev("location.hash"));
  await choose("Pathway"); await sleep(300);
  check("19 reopening restores the saved position (4 of 10 reactions)", /After reaction 4 of 10/.test(await textOf("[data-testid=step-caption]")), await textOf("[data-testid=step-caption]"));
  for (const [slug, setup, expect, label] of [
    ["gluconeogenesis", async () => { await choose("Regulation"); await choose("Fasting-associated (liver)"); }, async () => /gluconeogenic control points up/.test(await textOf("[data-testid=verdict-text]")), "fasting scenario"],
    ["citric-acid-cycle", async () => { await next(5); }, async () => /Turn 1, after reaction 5 of 8/.test(await textOf("[data-testid=step-caption]")), "cycle position"],
    ["electron-transport", async () => { await choose("Inhibitors and uncouplers"); await setSel("condition-select", "uncoupler"); }, async () => /rises/.test(await textOf("[data-testid=flow-o2]")), "uncoupler"],
    ["metabolic-map", async () => { await setSel("scenario-select", "hypoxia"); await choose("Glycerol-phosphate shuttle"); }, async () => (await textOf("[data-testid=map-total]")) === "30" && /Low oxygen|Reduced oxygen/.test(await bodyText()), "map scenario and shuttle"],
  ]) {
    await fresh(1440, "light", `#/biochemistry/${slug}`);
    await setup(); await sleep(2800);
    await cdp.send("Page.reload"); await ready("reload"); await sleep(1800);
    check(`19 autosave: a reloaded ${slug} page restores its ${label}`, await expect());
  }

  // ---- 20. layouts and themes, with screenshots for visual inspection
  const pages = [["glycolysis", "[data-testid=lane-diagram]"], ["gluconeogenesis", "[data-testid=lane-diagram]"], ["citric-acid-cycle", "[data-testid=cycle-diagram]"], ["electron-transport", "[data-testid=mito-diagram]"], ["metabolic-map", "[data-testid=map-diagram]"]];
  for (const [slug, sel] of pages) for (const w of [1440, 820, 375]) for (const scheme of ["light", "dark"]) {
    await fresh(w, scheme, `#/biochemistry/${slug}`);
    await sleep(500);
    const ov2 = await overflow();
    const box = await ev(`(() => { const e = document.querySelector(${q(sel)}); if (!e) return [0, 0]; const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()`);
    const scrollable = await ev(`(() => { const e = document.querySelector(${q(sel)}); const s = e?.closest('.mt-scroll'); return s ? s.scrollWidth - s.clientWidth : -1; })()`);
    check(`20 ${slug} @${w} ${scheme}: no page overflow, diagram visible (scrolls inside its frame on narrow screens)`, ov2 <= 1 && box[0] > 200 && box[1] > 100, `overflow ${ov2}, box ${box}, inner scroll ${scrollable}`);
    if (scheme === "light" && w !== 1440) await shot(`${slug}-${w}.png`, sel);
    if (scheme === "dark" && w === 1440) await shot(`${slug}-dark.png`, sel);
  }
  // intermediate states on a phone and tablet
  await fresh(375, "light", "#/biochemistry/glycolysis"); await next(4); await shot("glycolysis-phone-step4.png", "[data-testid=step-caption]");
  await fresh(375, "dark", "#/biochemistry/citric-acid-cycle"); await next(5); await shot("tca-phone-dark-step5.png", "[data-testid=step-caption]");
  await fresh(820, "light", "#/biochemistry/electron-transport"); await choose("Inhibitors and uncouplers"); await setSel("condition-select", "rotenone"); await choose("Both"); await next(7); await shot("etc-tablet-rotenone.png", "[data-testid=step-caption]");
  await fresh(375, "light", "#/biochemistry/metabolic-map"); await shot("map-phone.png", "[data-testid=map-diagram]");

  console.log(`errors: ${JSON.stringify(cdp.errors.slice(0, 5))}`);
  check("no page exceptions", cdp.errors.length === 0, cdp.errors.slice(0, 2).join(" | "));
} catch (error) {
  console.log("SCRIPT ERROR", error.message);
  results.push(false);
} finally {
  await stop();
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}
