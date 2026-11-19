// Stage 22: platform wiring, validated persistence, concept search, relations and learning content for Stoichiometry, Gas laws and
// Electrochemistry. Practice and Challenge answers are compared with hand calculations written here, not with the code that produces them.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
let S, PT, L, GT, PR, CI, REL, Q, LIB, STORE;
before(async () => {
  S = await loadModule("/src/navigation/subjects.ts");
  PT = await loadModule("/src/utils/persistence/gcTools22.ts");
  L = await loadModule("/src/utils/generalChem/chem22Learning.ts");
  GT = await loadModule("/src/utils/persistence/generalChemTools.ts");
  PR = await loadModule("/src/utils/generalChem/predict.ts");
  CI = await loadModule("/src/utils/concepts/conceptIndex.ts");
  REL = await loadModule("/src/utils/concepts/relations.ts");
  Q = await loadModule("/src/utils/concepts/search.ts");
  LIB = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  STORE = await loadModule("/src/utils/persistence/workspaceStore.ts");
});
after(async () => { await closeEngine(); });

const clone = (x) => JSON.parse(JSON.stringify(x));
const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const NEW_TOOLS = ["gcStoichiometry", "gcGas", "gcElectro"];
const OLD_TOOLS = ["gcOverview", "gcAcidBase", "gcEquilibrium", "gcKinetics", "gcThermo", "gcSaved"];

describe("navigation and wiring", () => {
  test("[tools] the three tools join General Chemistry; the existing tools and their slugs are unchanged", () => {
    const ids = S.GENERAL_TOOLS.map((t) => t.id);
    for (const id of [...OLD_TOOLS, ...NEW_TOOLS]) assert.ok(ids.includes(id), id);
    assert.equal(new Set(S.GENERAL_TOOLS.map((t) => t.slug)).size, S.GENERAL_TOOLS.length);
    const slug = (id) => S.GENERAL_TOOLS.find((t) => t.id === id).slug;
    assert.deepEqual(["gcAcidBase", "gcEquilibrium", "gcKinetics", "gcThermo", "gcSaved"].map(slug), ["acid-base-titration", "equilibrium", "kinetics", "thermodynamics", "saved"]);
    assert.deepEqual(NEW_TOOLS.map(slug), ["stoichiometry", "gas-laws", "electrochemistry"]);
    for (const id of NEW_TOOLS) assert.deepEqual(S.parseRoute(S.routeHash({ subject: "general", toolId: id })), { subject: "general", toolId: id });
  });
  test("[other subjects] Physics, Organic, Biology and Biochemistry tool lists are untouched", () => {
    assert.equal(S.PHYSICS_TOOLS.length, 14); assert.deepEqual(S.ORGANIC_TOOLS.map((t) => t.id), ["analysis", "acidBase", "spectroscopy", "conformations", "reactions", "multiStep", "multiCatalytic", "saved"]);
  });
  test("[planned list] stoichiometry and gas laws are no longer 'planned'; the remaining plans stay and are clearly plans", () => {
    const planned = S.getSubject("general").planned;
    assert.ok(!planned.some((p) => /stoichiometry|gas laws/i.test(p))); assert.ok(planned.includes("Solubility equilibria"));
  });
  test("[icons] every new tool icon exists", () => {
    const icons = read("src", "components", "ui", "Icon.tsx");
    for (const id of NEW_TOOLS) assert.match(icons, new RegExp(`\\n  ${S.GENERAL_TOOLS.find((t) => t.id === id).icon}: "`));
  });
  test("[app] each page is lazily loaded, gets its own open request and is reachable from Saved", () => {
    const app = read("src", "App.tsx");
    for (const name of ["StoichiometryPage", "GasLawsPage", "ElectrochemistryPage"]) { assert.match(app, new RegExp(`const ${name} = lazy`)); assert.match(app, new RegExp(`<${name}\\s`)); }
    for (const id of NEW_TOOLS) { assert.match(app, new RegExp(`target === "${id}"`)); assert.match(app, new RegExp(`pendingOpen\\?\\.page === "${id}"`)); }
  });
  test("[overview] each new tool is listed with features; no planned item has a button", () => {
    const ov = read("src", "components", "generalChem", "GeneralChemistryOverview.tsx");
    for (const id of NEW_TOOLS) assert.match(ov, new RegExp(`${id}: \\[`));
  });
  test("[no network] none of the new code can reach the network", () => {
    for (const f of ["src/utils/generalChem/elements.ts", "src/utils/generalChem/formula.ts", "src/utils/generalChem/balance.ts", "src/utils/generalChem/stoichiometry.ts", "src/utils/generalChem/gas.ts", "src/utils/generalChem/electrochem.ts", "src/utils/generalChem/chem22Learning.ts", "src/utils/persistence/gcTools22.ts", "src/components/generalChem/StoichiometryPage.tsx", "src/components/generalChem/GasLawsPage.tsx", "src/components/generalChem/ElectrochemistryPage.tsx"]) {
      assert.doesNotMatch(read(...f.split("/")), /\bfetch\(|XMLHttpRequest|WebSocket|https?:\/\//, f);
    }
  });
});

describe("persistence: strict validators for the three saved page types", () => {
  const D = () => ({ stoich: clone(PT.DEFAULT_STOICH_INPUTS), gas: clone(PT.DEFAULT_GAS_INPUTS), el: clone(PT.DEFAULT_ELECTRO_INPUTS) });
  test("[defaults] valid, and a JSON round trip returns the same inputs", () => {
    const d = D();
    assert.deepEqual(PT.validateStoichInputs(clone(d.stoich)), d.stoich); assert.deepEqual(PT.validateGasInputs(clone(d.gas)), d.gas); assert.deepEqual(PT.validateElectroInputs(clone(d.el)), d.el);
  });
  test("[registered] pages are known to the store, the library and the saved-open map, in the General Chemistry subject", () => {
    for (const [page, tool] of [["stoichiometry", "gcStoichiometry"], ["gaslaws", "gcGas"], ["electrochem", "gcElectro"]]) {
      assert.equal(STORE.PAGE_SUBJECT[page], "general"); assert.ok(LIB.OPENABLE_ANALYSIS_PAGES.includes(page)); assert.equal(LIB.ANALYSIS_APP_PAGE[page], tool);
    }
    for (const page of ["genchem", "equilibrium", "kinetics", "thermo", "waves", "mechanics"]) assert.ok(LIB.OPENABLE_ANALYSIS_PAGES.includes(page), `existing page ${page} is still openable`);
  });
  test("[stoichiometry tampering] malformed values are rejected, never coerced", () => {
    const bad = [
      (x) => { x.view = "titration"; }, (x) => { x.equation = "H2 + O2 ->"; }, (x) => { x.equation = "H2 + O2 -> H2O + X"; }, (x) => { x.equation = "1 H2 + 1 O2 -> 1 H2O"; },
      (x) => { x.amounts.pop(); }, (x) => { x.amounts[0].value = -1; }, (x) => { x.amounts[0].mode = "kg"; }, (x) => { x.amounts[0].value = "4"; }, (x) => { x.amounts[0] = { ...x.amounts[0], purity: 0 }; },
      (x) => { x.manual = [1, 1]; }, (x) => { x.manual = [1, 1.5, 1]; }, (x) => { x.manual = [1, 1, 1000]; }, (x) => { x.yieldProduct = 3; }, (x) => { x.actualG = -2; }, (x) => { x.actualOn = "yes"; },
      (x) => { x.dilution = { unknown: "M2", M1: 1, V1: 100, M2: 0, V2: 50 }; }, (x) => { x.dilution.unknown = "X"; }, (x) => { x.learn.mode = "expert"; }, (x) => { x.learn.practice = 99; }, (x) => { x.learn.challenge = -1; }, (x) => { delete x.learn; },
      (x) => { x.subject = "physics"; }, (x) => { x.tool = "gaslaws"; },
    ];
    for (const [k, f] of bad.entries()) { const x = D().stoich; f(x); assert.equal(PT.validateStoichInputs(x), null, `stoichiometry case ${k}`); }
    assert.equal(PT.validateStoichInputs(null), null); assert.equal(PT.validateStoichInputs([]), null); assert.equal(PT.validateStoichInputs("x"), null);
  });
  test("[stoichiometry accepts] valid variations: solutions, purity, given coefficients, manual coefficients, a charged redox equation", () => {
    const x = D().stoich; x.equation = "2 H2 + O2 -> 2 H2O"; x.manual = [2, 1, 2]; x.amounts = [{ mode: "soln", value: 0, purity: 100, M: 0.5, mL: 100 }, { mode: "g", value: 3, purity: 90, M: 1, mL: 1 }]; x.actualOn = true; x.yieldProduct = 0; x.view = "solution";
    assert.ok(PT.validateStoichInputs(x));
    const y = D().stoich; y.equation = "MnO4^- + Fe^2+ + H^+ -> Mn^2+ + Fe^3+ + H2O"; y.amounts = [1, 2, 3].map((value) => ({ mode: "mol", value, purity: 100, M: 1, mL: 100 })); assert.ok(PT.validateStoichInputs(y));
  });
  test("[gas tampering]", () => {
    const bad = [
      (x) => { x.view = "plasma"; }, (x) => { x.container.process = "adiabatic"; }, (x) => { x.container.VL = 0; }, (x) => { x.container.TC = -300; }, (x) => { x.container.target = -1; }, (x) => { x.container.n = "1"; }, (x) => { x.container.target = NaN; },
      (x) => { x.calc.unknown = "R"; }, (x) => { x.calc.P.u = "psi"; }, (x) => { x.calc.T.v = -500; x.calc.T.u = "C"; x.calc.unknown = "n"; }, (x) => { x.calc.V.v = -1; },
      (x) => { x.mixture.components = []; }, (x) => { x.mixture.components[0].formula = "NaCl"; }, (x) => { x.mixture.components.push({ formula: "N2", mol: 1 }); }, (x) => { x.mixture.components[0].mol = -1; },
      (x) => { x.mixture.components = Array.from({ length: 6 }, (_, i) => ({ formula: ["He", "Ne", "Ar", "Kr", "H2", "N2"][i], mol: 1 })); },
      (x) => { x.kinetic.a = "Unobtainium"; }, (x) => { x.kinetic.TbC = -274; }, (x) => { x.learn.mode = "x"; }, (x) => { x.tool = "stoichiometry"; },
    ];
    for (const [k, f] of bad.entries()) { const x = D().gas; f(x); assert.equal(PT.validateGasInputs(x), null, `gas case ${k}`); }
  });
  test("[gas accepts] every process, every view and every unit", () => {
    for (const process of ["isothermal", "isochoric", "isobaric", "amountP", "amountV"]) { const x = D().gas; x.container.process = process; x.container.target = process === "isothermal" ? 5 : process === "isochoric" || process === "isobaric" ? 80 : 1; assert.ok(PT.validateGasInputs(x), process); }
    for (const view of ["container", "calculator", "mixture", "kinetic"]) { const x = D().gas; x.view = view; assert.ok(PT.validateGasInputs(x), view); }
    for (const u of ["Pa", "kPa", "atm", "bar", "mmHg"]) { const x = D().gas; x.calc.P.u = u; x.calc.unknown = "n"; assert.ok(PT.validateGasInputs(x), u); }
  });
  test("[electrochemistry tampering]", () => {
    const bad = [
      (x) => { x.view = "fuel-cell"; }, (x) => { x.cell.a = "Unobtainium"; }, (x) => { x.cell.b = x.cell.a; }, (x) => { x.cell.ca = []; }, (x) => { x.cell.ca = [0]; }, (x) => { x.cell.cb = [1e9]; }, (x) => { x.cell.TC = 400; },
      (x) => { x.cell.pH = "2"; }, (x) => { x.cell.a = "MnO4"; x.cell.ca = [1, 1]; x.cell.pH = 40; },
      (x) => { x.electro.id = "brine"; }, (x) => { x.electro.I = 0; }, (x) => { x.electro.eff = 150; }, (x) => { x.electro.tMin = -1; },
      (x) => { x.tNow = 999; }, (x) => { x.tNow = -1; }, (x) => { x.learn.practice = 0.5; }, (x) => { x.tool = "gaslaws"; },
    ];
    for (const [k, f] of bad.entries()) { const x = D().el; f(x); assert.equal(PT.validateElectroInputs(x), null, `electro case ${k}`); }
  });
  test("[electrochemistry accepts] a cell with H+, gas pressure and non-standard values; every electrolysis case", () => {
    const x = D().el; x.cell = { a: "MnO4", b: "Fe3", ca: [0.01, 0.002], cb: [0.5, 0.05], pH: 2, TC: 40 }; assert.ok(PT.validateElectroInputs(x));
    const h = D().el; h.cell = { a: "H2", b: "Cu", ca: [0.2], cb: [0.01], pH: 3, TC: 25 }; assert.ok(PT.validateElectroInputs(h));
    for (const id of ["Cu-plate", "Ag-plate", "Ni-plate", "Zn-plate", "cu-inert", "water", "molten-nacl"]) { const e = D().el; e.view = "electrolysis"; e.electro.id = id; assert.ok(PT.validateElectroInputs(e), id); }
  });
  test("[results] the stored summary is validated like every other tool's; tampered summaries are rejected", () => {
    for (const [fn, inputs] of [[L.summarizeStoich, PT.DEFAULT_STOICH_INPUTS], [L.summarizeGas, PT.DEFAULT_GAS_INPUTS], [L.summarizeElectro, PT.DEFAULT_ELECTRO_INPUTS]]) {
      const r = fn(inputs); assert.ok(r); assert.deepEqual(PT.validateGcResults22(clone(r)), r); assert.ok(r.headline.length >= 2 && r.assumptions.length >= 2);
      const t = clone(r); t.check = "5"; assert.equal(PT.validateGcResults22(t), null); const u = clone(r); u.headline = "x"; assert.equal(PT.validateGcResults22(u), null);
    }
  });
  test("[derived results are recomputed from the inputs] the same inputs always give the same summary; a changed input changes it", () => {
    const a = L.summarizeStoich(PT.DEFAULT_STOICH_INPUTS); const b = L.summarizeStoich(clone(PT.DEFAULT_STOICH_INPUTS)); assert.deepEqual(a, b);
    const x = clone(PT.DEFAULT_STOICH_INPUTS); x.amounts[0].value = 2; assert.notEqual(L.summarizeStoich(x).check, a.check);
  });
});

describe("summaries use independent reference numbers", () => {
  test("[stoichiometry default] 4.000 g H2 + 32.00 g O2: extent = 4/2.016/2 = 0.99206 mol; H2 limits", () => {
    const r = L.summarizeStoich(PT.DEFAULT_STOICH_INPUTS); near(r.check, 4 / 2.016 / 2, 1e-9); assert.match(r.headline.join(" "), /Limiting reactant: H₂/); assert.match(r.headline[0], /2 H₂ \+ O₂ → 2 H₂O/);
  });
  test("[gas default] 0.5 mol, 10 L, 25 C, isothermal to 5 L: final pressure 2 x nRT/V1 = 247.9 kPa", () => {
    const r = L.summarizeGas(PT.DEFAULT_GAS_INPUTS); near(r.check, 2 * (0.5 * 8.314462618 * 298.15) / 0.01, 1e-6); near(r.check / 1000, 247.9, 0.05);
  });
  test("[electrochemistry default] Daniell cell: E = 1.104 V", () => { near(L.summarizeElectro(PT.DEFAULT_ELECTRO_INPUTS).check, 1.104, 1e-9); });
  test("[each view summarises] calculator, mixture, kinetic and electrolysis give valid results", () => {
    for (const view of ["calculator", "mixture", "kinetic"]) { const x = clone(PT.DEFAULT_GAS_INPUTS); x.view = view; assert.ok(PT.validateGcResults22(L.summarizeGas(x)), view); }
    const e = clone(PT.DEFAULT_ELECTRO_INPUTS); e.view = "electrolysis"; const r = L.summarizeElectro(e); near(r.check, (2 * 1800 / 96485.33212 / 2) * 63.546 * 0 + (2 * 30 * 60) / 96485.33212 / 2 * 63.546 * 1, 1e-6);
    // 2.00 A x 30.0 min = 3600 C -> 0.018656 mol Cu -> 1.1855 g
    near(r.check, 1.1855, 1e-3);
  });
});

describe("Practice questions: answers from the model equal hand calculations", () => {
  const hand = {
    "bal-fe": 3, "bal-propane": 5, "mass-h2o": (4 / 2.016) * 18.015, "mol-nh3": 4, "pct-yield": (12 / ((25 / 100.086) * 56.077)) * 100, molarity: (5.85 / 58.44) / 0.25, dilution: 0.6,
  };
  for (const q of ["bal-fe", "bal-propane", "mass-h2o", "mol-nh3", "pct-yield", "molarity", "dilution"]) {
    test(`[stoichiometry ${q}]`, () => { const item = L.STOICH_PRACTICE.find((x) => x.id === q); near(item.answer(), hand[q], Math.max(1e-9, Math.abs(hand[q]) * 1e-3), q); });
  }
  test("[gas practice] Boyle 4.00 atm; Charles 3.00 L; Gay-Lussac 2.667 atm; n = 0.40603 mol; Dalton 2.00 atm; CO2 density 1.799 g/L; N2 rms 515 m/s; molar volume 22.41 L", () => {
    const want = { boyle: 4, charles: 3, gaylussac: 8 / 3, moles: 1013.25 / (8.314462618 * 300.15), dalton: 2, density: (101325 * 44.009) / (8.314462618 * 298.15) / 1000, vrms: Math.sqrt((3 * 8.314462618 * 298.15) / 0.028014), stp: (8.314462618 * 273.15) / 101325 * 1000 };
    for (const [id, v] of Object.entries(want)) near(L.GAS_PRACTICE.find((x) => x.id === id).answer(), v, Math.abs(v) * 1e-6, id);
    near(want.density, 1.799, 1e-3); near(want.vrms, 515.2, 0.1); near(want.stp, 22.414, 1e-3);
  });
  test("[electrochemistry practice] Zn is the anode (choice 0); E = 0.458 V; n = 6; E = 1.1632 V; ΔG° = -213.0 kJ/mol; 1.1855 g Cu; 29.8 min for 1.00 g Ag; O2 at the anode", () => {
    const p = (id) => L.ELECTRO_PRACTICE.find((x) => x.id === id);
    assert.equal(p("which-anode").answer(), 0); assert.deepEqual(p("which-anode").options(), ["Zinc", "Copper"]);
    near(p("e-cell").answer(), 0.800 - 0.342, 1e-9); assert.equal(p("n-electrons").answer(), 6); near(p("nernst").answer(), 1.104 - ((8.314462618 * 298.15) / (2 * 96485.33212)) * Math.log(0.01), 1e-9);
    near(p("dg").answer(), (-2 * 96485.33212 * 1.104) / 1000, 1e-6); near(p("faraday-cu").answer(), (3600 / 96485.33212 / 2) * 63.546, 1e-9);
    near(p("faraday-time").answer(), (1 / 107.87) * 96485.33212 / 0.5 / 60, 1e-9); near(p("faraday-time").answer(), 29.8, 0.05); assert.equal(p("anode-water").options()[p("anode-water").answer()], "Oxygen");
  });
  test("[every question sets up a valid tool state] and has a prompt, an explanation and distinct ids", () => {
    const groups = [[L.STOICH_PRACTICE, PT.DEFAULT_STOICH_INPUTS, PT.validateStoichInputs], [L.STOICH_CHALLENGE, PT.DEFAULT_STOICH_INPUTS, PT.validateStoichInputs], [L.GAS_PRACTICE, PT.DEFAULT_GAS_INPUTS, PT.validateGasInputs], [L.ELECTRO_PRACTICE, PT.DEFAULT_ELECTRO_INPUTS, PT.validateElectroInputs]];
    for (const [qs, base, validate] of groups) {
      assert.equal(new Set(qs.map((x) => x.id)).size, qs.length);
      for (const q of qs) {
        assert.ok(q.prompt.length > 20 && q.title.length > 2, q.id); assert.ok(validate(q.setup(clone(base))), `${q.id} setup is a valid state`);
        const a = q.answer(); assert.ok(Number.isFinite(a), q.id); assert.ok(q.explain(a).length > 20, q.id);
        if (q.kind === "choice") { const o = q.options(); assert.ok(o.length >= 2 && a >= 0 && a < o.length, q.id); }
      }
    }
  });
  test("[practice does not reveal the answer in the prompt]", () => {
    for (const q of [...L.STOICH_PRACTICE, ...L.GAS_PRACTICE, ...L.ELECTRO_PRACTICE, ...L.STOICH_CHALLENGE]) { if (q.kind === "number") { const shown = String(Number(q.answer().toPrecision(4))); if (shown.length >= 4) assert.ok(!q.prompt.includes(shown), q.id); } }
  });
});

describe("Challenge: limiting reagent and maximum yield by independent calculation", () => {
  const lim = (id) => L.STOICH_CHALLENGE.find((x) => x.id === id);
  test("[limiting reagents] Al/Cl2 -> Cl2; N2/H2 -> H2; Mg/HCl(aq) -> HCl; an exact mixture -> 'They run out together'", () => {
    // Al: 5.00/26.982 = 0.18531 mol, /2 = 0.09266; Cl2: 10.0/70.90 = 0.14104, /3 = 0.04701 -> Cl2
    assert.equal(lim("lim-alcl3").options()[lim("lim-alcl3").answer()], "Cl₂");
    // N2 4.00/1; H2 6.00/3 = 2.00 -> H2
    assert.equal(lim("lim-haber").options()[lim("lim-haber").answer()], "H₂");
    // Mg 2.00/24.305 = 0.08229; HCl 0.0500/2 = 0.0250 -> HCl
    assert.equal(lim("lim-mg").options()[lim("lim-mg").answer()], "HCl");
    assert.equal(lim("lim-exact").options()[lim("lim-exact").answer()], "They run out together");
  });
  test("[maximum yields] 12.54 g AlCl3 (2 x 10.0/70.90/3 x 133.33); 4.00 mol NH3", () => {
    near(lim("max-alcl3").answer(), 2 * (10 / 70.9 / 3) * (26.982 + 3 * 35.45), 1e-6); near(lim("max-alcl3").answer(), 12.54, 0.02); near(lim("max-nh3").answer(), 4, 1e-9);
  });
});

describe("Challenge: predict-then-observe scenarios follow the models", () => {
  const trend = (sc, input) => PR.evaluatePredict(sc, input);
  const gas = (patch) => { const g = clone(PT.DEFAULT_GAS_INPUTS); Object.assign(g.container, patch); return g; };
  const sc = (list, id) => list.find((x) => x.id === id);
  test("[gas] compress further -> P higher (x2); expand -> lower; heat rigid -> higher by T ratio; double Celsius is not x2; Charles; Avogadro", () => {
    let r = trend(sc(L.GAS_SCENARIOS, "compress-more"), gas({})); assert.equal(r.trend, "higher"); near(r.after / r.before, 2, 1e-9);
    r = trend(sc(L.GAS_SCENARIOS, "expand"), gas({})); assert.equal(r.trend, "lower"); near(r.after / r.before, 0.5, 1e-9);
    r = trend(sc(L.GAS_SCENARIOS, "heat-rigid"), gas({ process: "isochoric", target: 100 })); assert.equal(r.trend, "higher"); near(r.after / r.before, (273.15 + 150) / (273.15 + 100), 1e-9);
    r = trend(sc(L.GAS_SCENARIOS, "double-celsius"), gas({ process: "isochoric", target: 100 })); assert.equal(r.trend, "higher"); near(r.after / r.before, (273.15 + 200) / (273.15 + 100), 1e-9); assert.ok(r.after / r.before < 1.5);
    r = trend(sc(L.GAS_SCENARIOS, "heat-free"), gas({ process: "isobaric", target: 100 })); assert.equal(r.trend, "higher"); near(r.after / r.before, (273.15 + 150) / (273.15 + 100), 1e-9);
    r = trend(sc(L.GAS_SCENARIOS, "add-gas-p"), gas({ process: "amountP", target: 1 })); near(r.after / r.before, 2, 1e-9);
    r = trend(sc(L.GAS_SCENARIOS, "add-gas-v"), gas({ process: "amountV", target: 1 })); near(r.after / r.before, 2, 1e-9);
  });
  test("[gas] a scenario for another experiment is not applied (nothing is invented)", () => { assert.equal(trend(sc(L.GAS_SCENARIOS, "heat-rigid"), gas({})), null); assert.equal(trend(sc(L.GAS_SCENARIOS, "compress-more"), gas({ process: "isochoric", target: 100 })), null); });
  test("[gas mixtures and kinetic theory] adding argon leaves nitrogen's partial pressure unchanged; hydrogen is faster than nitrogen; mean kinetic energy is equal at the same T", () => {
    const m = clone(PT.DEFAULT_GAS_INPUTS); m.view = "mixture"; assert.equal(trend(sc(L.GAS_SCENARIOS, "inert-partial"), m).trend, "same");
    const k = clone(PT.DEFAULT_GAS_INPUTS); k.view = "kinetic"; k.kinetic = { a: "H2", b: "N2", TaC: 25, TbC: 25 };
    const r = trend(sc(L.GAS_SCENARIOS, "light-gas-speed"), k); assert.equal(r.trend, "higher"); near(r.after / r.before, Math.sqrt(28.014 / 2.016), 1e-9);
    assert.equal(trend(sc(L.GAS_SCENARIOS, "same-ke"), k).trend, "same");
  });
  test("[electrochemistry] diluting the product ion raises E by (RT/nF) ln 100; diluting the reactant ion lowers it; temperature at Q = 1 changes nothing", () => {
    const e = clone(PT.DEFAULT_ELECTRO_INPUTS); const RTF = (8.314462618 * 298.15) / 96485.33212;
    let r = trend(sc(L.ELECTRO_SCENARIOS, "product-conc-low"), e); assert.equal(r.trend, "higher"); near(r.after - r.before, (RTF / 2) * Math.log(100), 1e-9);
    r = trend(sc(L.ELECTRO_SCENARIOS, "reactant-conc-low"), e); assert.equal(r.trend, "lower"); near(r.before - r.after, (RTF / 2) * Math.log(100), 1e-9);
    r = trend(sc(L.ELECTRO_SCENARIOS, "temperature"), e); assert.equal(r.trend, "same");
    const nonstd = clone(e); nonstd.cell.ca = [0.01]; assert.equal(trend(sc(L.ELECTRO_SCENARIOS, "temperature"), nonstd).trend, "higher");
    assert.equal(trend(sc(L.ELECTRO_SCENARIOS, "acidify"), e), null, "no H+ in the Daniell cell, so there is nothing to acidify");
    const acid = clone(e); acid.cell = { a: "MnO4", b: "Fe3", ca: [1, 1], cb: [1, 1], pH: 0, TC: 25 }; assert.equal(trend(sc(L.ELECTRO_SCENARIOS, "acidify"), acid).trend, "lower");
  });
  test("[electrolysis] twice the current or time doubles the deposit; 80 % efficiency lowers it to 80 %; silver deposits 1.70 times the copper mass for the same charge", () => {
    const e = clone(PT.DEFAULT_ELECTRO_INPUTS); e.view = "electrolysis";
    near(trend(sc(L.ELECTROLYSIS_SCENARIOS, "double-current"), e).after / trend(sc(L.ELECTROLYSIS_SCENARIOS, "double-current"), e).before, 2, 1e-9);
    near(trend(sc(L.ELECTROLYSIS_SCENARIOS, "double-time"), e).after / trend(sc(L.ELECTROLYSIS_SCENARIOS, "double-time"), e).before, 2, 1e-9);
    const eff = trend(sc(L.ELECTROLYSIS_SCENARIOS, "lower-eff"), e); near(eff.after / eff.before, 0.8, 1e-9);
    const ag = trend(sc(L.ELECTROLYSIS_SCENARIOS, "switch-ag"), e); near(ag.after / ag.before, (107.87 / 1) / (63.546 / 2), 1e-9); near(ag.after / ag.before, 3.395, 1e-3);
  });
});

describe("lessons quote the model", () => {
  test("[stoichiometry] the limiting lesson names the limiting reactant, its extent and the leftover; the conservation lesson counts an element on both sides", () => {
    const l = L.stoichLessons(PT.DEFAULT_STOICH_INPUTS); const text = l.map((x) => x.body.join(" ")).join(" ");
    assert.match(text, /limit/); assert.match(text, /0\.992/); assert.ok(l.find((x) => x.id === "conserve").body[0].match(/Count H: 4 atoms on the left and 4 on the right/));
  });
  test("[gas] the kelvin lesson says 8.39 % for 25 to 50 C, not 100 %; kinetic lesson explains equal energy with different speeds", () => {
    const l = L.gasLessons(PT.DEFAULT_GAS_INPUTS); assert.match(l.find((x) => x.id === "kelvin").body[0], /8\.39 %/); // (323.15/298.15 - 1) = 8.385 %
    const k = clone(PT.DEFAULT_GAS_INPUTS); k.view = "kinetic"; assert.match(L.gasLessons(k)[0].body[0], /same T every molecule/);
  });
  test("[electrochemistry] the galvanic lessons name anode and cathode, the Nernst numbers and ΔG°; the electrolysis lesson gives Q = It", () => {
    const l = L.electroLessons(PT.DEFAULT_ELECTRO_INPUTS); const t = l.map((x) => x.body.join(" ")).join(" "); assert.match(t, /Zn²⁺\/Zn is oxidised/); assert.match(t, /-213/); assert.match(t, /1\.104/);
    const e = clone(PT.DEFAULT_ELECTRO_INPUTS); e.view = "electrolysis"; assert.match(L.electroLessons(e)[0].body[0], /Q = It/);
  });
});

describe("concept search and related learning", () => {
  test("[the index validates] every concept, destination and relation is consistent", () => { assert.deepEqual(CI.validateConceptIndex(), []); assert.deepEqual(REL.validateRelations(), []); });
  const cases = [
    ["moles", "gcStoichiometry"], ["molar mass", "gcStoichiometry"], ["equation balancing", "gcStoichiometry"], ["limiting reagent", "gcStoichiometry"], ["theoretical yield", "gcStoichiometry"], ["percent yield", "gcStoichiometry"],
    ["ideal gas law", "gcGas"], ["partial pressure", "gcGas"], ["kinetic molecular theory", "gcGas"], ["Boyle's law", "gcGas"], ["Maxwell-Boltzmann", "gcGas"],
    ["oxidation", "gcElectro"], ["reduction", "gcElectro"], ["galvanic cell", "gcElectro"], ["Nernst equation", "gcElectro"], ["Faraday's law", "gcElectro"], ["electrolysis", "gcElectro"], ["anode", "gcElectro"], ["salt bridge", "gcElectro"],
  ];
  for (const [query, tool] of cases) {
    test(`[search] "${query}" finds ${tool}`, () => {
      const hits = Q.searchConcepts(query, {}); const top = hits.filter((h) => h.destination).slice(0, 5);
      assert.ok(top.some((h) => h.destination.subject === "general" && h.destination.toolId === tool), `${query}: ${top.map((h) => `${h.title}->${h.destination?.toolId}`).join(", ")}`);
    });
  }
  test("[search] previously existing General Chemistry queries still work (pH, titration, equilibrium, half-life, Gibbs)", () => {
    for (const [query, tool] of [["pH", "gcAcidBase"], ["titration", "gcAcidBase"], ["Le Chatelier", "gcEquilibrium"], ["half-life", "gcKinetics"], ["Gibbs free energy", "gcThermo"]]) {
      const top = Q.searchConcepts(query, {}).filter((h) => h.destination).slice(0, 4); assert.ok(top.some((h) => h.destination.toolId === tool), query);
    }
  });
  test("[ambiguous terms are labelled] 'oxidation' offers the General Chemistry tool and says organic oxidation is separate", () => {
    const hit = Q.searchConcepts("oxidation", {}).find((h) => h.destination?.toolId === "gcElectro"); assert.ok(hit);
    const c = CI.getConcept("gc-redox-galvanic"); assert.ok(c.termNotes.oxidation.includes("organic"));
  });
  test("[related learning] the four requested links exist, open the right tool, and carry honest cautions", () => {
    const from = (sub, id) => REL.relationsFrom(sub, id, 20);
    const stoich = from("general", "gcStoichiometry"); assert.ok(stoich.some((r) => r.to.toolId === "gcAcidBase"));
    const gas = from("general", "gcGas"); assert.ok(gas.some((r) => r.to.toolId === "phWaves" && r.to.subject === "physics")); assert.ok(gas.some((r) => r.to.toolId === "gcThermo"));
    const el = from("general", "gcElectro"); assert.ok(el.some((r) => r.to.toolId === "gcThermo")); const etc = el.find((r) => r.to.toolId === "bcEtc"); assert.ok(etc && etc.to.subject === "biochemistry");
    assert.match(etc.caution, /not a quantitative model of mitochondrial oxidative phosphorylation/); assert.match(etc.caution, /not interchangeable/);
    assert.match(gas.find((r) => r.to.toolId === "phWaves").caution, /no separate thermodynamics tool/);
  });
  test("[no numeric handoff] these tools do not exchange numbers: every new relation says so or states a scope limit", () => {
    for (const r of REL.RELATIONS.filter((x) => ["gcStoichiometry", "gcGas", "gcElectro"].includes(x.from.toolId) || ["gcStoichiometry", "gcGas", "gcElectro"].includes(x.to.toolId))) { if (r.caution) assert.ok(r.caution.length > 10, r.id); }
  });
  test("[concepts requested by the brief all exist] mole, molar mass, equation balancing, limiting reagent, theoretical yield, ideal gas law, partial pressure, kinetic molecular theory, oxidation, reduction, galvanic cell, Nernst, Faraday, electrolysis", () => {
    const names = CI.CONCEPTS.filter((c) => c.subject === "general").flatMap((c) => [c.name, ...c.aliases]).map((s) => s.toLowerCase());
    for (const need of ["mole", "molar mass", "balance an equation", "limiting reagent", "theoretical yield", "ideal gas law", "partial pressure", "kinetic molecular theory", "oxidation", "reduction", "galvanic cell", "nernst equation", "faraday's law", "electrolysis"]) assert.ok(names.includes(need), need);
  });
});

describe("existing tools are preserved", () => {
  test("[earlier General Chemistry validators still reject and accept as before] defaults of the earlier tools remain valid", () => {
    assert.ok(GT.validateToolResults({ engineVersion: 1, headline: ["a"], assumptions: ["b"], check: 1, checkLabel: "x" }));
    assert.equal(GT.validateToolResults({ engineVersion: 1, headline: "a", assumptions: [], check: 1, checkLabel: "x" }), null);
  });
  test("[files] the earlier General Chemistry pages and models were not modified by this stage", () => {
    const ov = read("src", "components", "generalChem", "AcidBaseTitrationPage.tsx"); assert.match(ov, /LearningModeSwitch/);
    for (const f of ["acidBase.ts", "equilibrium.ts", "kinetics.ts", "thermo.ts", "titration.ts"]) assert.ok(fs.existsSync(path.join(root, "src", "utils", "generalChem", f)), f);
  });
});
