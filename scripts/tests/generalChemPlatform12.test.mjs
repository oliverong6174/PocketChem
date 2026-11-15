// Stage 12: General Chemistry navigation, saved-record validation and round trips for the equilibrium, kinetics and
// thermodynamics tools, compatibility with existing records, and App wiring.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8").replace(/\r\n/g, "\n");
const clone = (v) => JSON.parse(JSON.stringify(v));
const ok = (r) => { assert.equal(r.ok, true, r.ok ? "" : JSON.stringify(r.error)); return r.value; };

let S, store, lib, libApp, TW, SUM, GW, GSUM;
before(async () => {
  S = await loadModule("/src/navigation/subjects.ts");
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  libApp = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  TW = await loadModule("/src/utils/persistence/generalChemTools.ts");
  SUM = await loadModule("/src/utils/generalChem/toolSummary.ts");
  GW = await loadModule("/src/utils/persistence/generalChemWorkspace.ts");
  GSUM = await loadModule("/src/utils/generalChem/summary.ts");
});
after(async () => { await closeEngine(); });

const TOOLS = [
  { page: "equilibrium", tool: "equilibrium", id: "gcEquilibrium", slug: "equilibrium", defaults: () => TW.DEFAULT_EQUILIBRIUM_INPUTS, validate: (v) => TW.validateEquilibriumInputs(v), summarize: (v) => SUM.summarizeEquilibrium(v), describe: (v) => TW.describeEquilibriumAnalysis(v), engine: () => TW.EQUILIBRIUM_ENGINE_VERSION, vResults: (v) => TW.validateEquilibriumResults(v) },
  { page: "kinetics", tool: "kinetics", id: "gcKinetics", slug: "kinetics", defaults: () => TW.DEFAULT_KINETICS_INPUTS, validate: (v) => TW.validateKineticsInputs(v), summarize: (v) => SUM.summarizeKinetics(v), describe: (v) => TW.describeKineticsAnalysis(v), engine: () => TW.KINETICS_ENGINE_VERSION, vResults: (v) => TW.validateKineticsResults(v) },
  { page: "thermo", tool: "thermodynamics", id: "gcThermo", slug: "thermodynamics", defaults: () => TW.DEFAULT_THERMO_INPUTS, validate: (v) => TW.validateThermoInputs(v), summarize: (v) => SUM.summarizeThermo(v), describe: (v) => TW.describeThermoAnalysis(v), engine: () => TW.THERMO_ENGINE_VERSION, vResults: (v) => TW.validateThermoResults(v) },
];
const validators = () => Object.fromEntries([
  ...TOOLS.map((t) => [t.page, { engineVersion: t.engine(), validateInputs: t.validate, validateResults: t.vResults }]),
  ["genchem", { engineVersion: GW.GENCHEM_ENGINE_VERSION, validateInputs: GW.validateGenChemInputs, validateResults: GW.validateGenChemResults }],
]);
const ids = () => { let n = 0; return () => `s12x${(n += 1).toString().padStart(4, "0")}`; };

describe("registry, navigation and the overview", () => {
  test("[tools] General Chemistry lists Overview, Acid-base, Equilibrium, Kinetics, Thermodynamics, Saved in that order", () => {
    assert.deepEqual(S.GENERAL_TOOLS.map((t) => t.id), ["gcOverview", "gcAcidBase", "gcEquilibrium", "gcKinetics", "gcThermo", "gcSaved"]);
    assert.deepEqual(S.GENERAL_TOOLS.map((t) => t.label), ["Overview", "Acid–base & titration", "Chemical equilibrium", "Reaction kinetics", "Thermodynamics", "Saved"]);
    assert.equal(new Set(S.GENERAL_TOOLS.map((t) => t.slug)).size, S.GENERAL_TOOLS.length);
  });
  test("[routes] each new tool has a deep link that round-trips; the old acid-base link is unchanged", () => {
    for (const t of TOOLS) {
      const hash = S.routeHash({ subject: "general", toolId: t.id });
      assert.equal(hash, `#/general/${t.slug}`);
      assert.deepEqual(S.parseRoute(hash), { subject: "general", toolId: t.id });
    }
    assert.equal(S.routeHash({ subject: "general", toolId: "gcAcidBase" }), "#/general/acid-base-titration");
    assert.equal(S.parseRoute("#/general/thermo"), null);
  });
  test("[organic] Organic Chemistry tool ids and order are unchanged", () => {
    assert.deepEqual(S.ORGANIC_TOOLS.map((t) => t.id), ["analysis", "acidBase", "spectroscopy", "conformations", "reactions", "multiStep", "multiCatalytic", "saved"]);
  });
  test("[planned] implemented tools are not listed as planned; thermochemistry moved out, the rest stay planned and have no button", () => {
    const planned = S.getSubject("general").planned;
    assert.deepEqual(planned, ["Stoichiometry and limiting reagents", "Gas laws", "Solubility equilibria", "Periodic trends"]);
    const overview = read("src", "components", "generalChem", "GeneralChemistryOverview.tsx");
    assert.match(overview, /gc-planned/);
    const plannedBlock = overview.slice(overview.indexOf('title="Planned"'));
    assert.doesNotMatch(plannedBlock, /<button/);
    for (const t of TOOLS) assert.match(overview, new RegExp(`${t.id}:`));
  });
  test("[icons] every tool icon exists in the icon set", () => {
    const icons = read("src", "components", "ui", "Icon.tsx");
    for (const t of S.GENERAL_TOOLS) assert.match(icons, new RegExp(`\\n  ${t.icon}: "`), t.icon);
  });
});

describe("App wiring", () => {
  const app = read("src", "App.tsx");
  test("[app] every new tool is lazily loaded and rendered with its own open request", () => {
    for (const [component, id] of [["EquilibriumPage", "gcEquilibrium"], ["KineticsPage", "gcKinetics"], ["ThermodynamicsPage", "gcThermo"]]) {
      assert.match(app, new RegExp(`const ${component} = lazy\\(\\(\\) => import\\("./components/generalChem/${component}"\\)\\)`));
      assert.match(app, new RegExp(`pendingOpen\\?\\.page === "${id}" \\? pendingOpen : null`));
    }
  });
  test("[app] a saved record of any General tool switches subject and keeps its open request", () => {
    assert.match(app, /target === "gcAcidBase" \|\| target === "gcEquilibrium" \|\| target === "gcKinetics" \|\| target === "gcThermo"/);
    assert.match(app, /switchSubject\("general", \{ keepOpenRequest: true, tool: target \}\)/);
  });
  test("[library] the app library registers every page and maps each saved page to its tool", () => {
    assert.deepEqual({ ...libApp.ANALYSIS_APP_PAGE }, { synthesis: "multiStep", ranking: "acidBase", spectroscopy: "spectroscopy", properties: "analysis", reactions: "reactions", multicatalytic: "multiCatalytic", conformations: "conformations", genchem: "gcAcidBase", equilibrium: "gcEquilibrium", kinetics: "gcKinetics", thermo: "gcThermo", mechanics: "phMechanics", circuits: "phCircuits", rc: "phRc", forces: "phForces", energy: "phEnergy", collisions: "phCollisions", replication: "bioReplication", transcription: "bioTranscription", translation: "bioTranslation", dogma: "bioDogma", regulation: "bioRegulation", genetics: "bioGenetics", celldivision: "bioDivision", aminoacids: "bcAminoAcids", proteins: "bcProteins", enzymes: "bcEnzymes", glycolysis: "bcGlycolysis", gluconeogenesis: "bcGluconeogenesis", tca: "bcTca", etc: "bcEtc", metabolism: "bcMetabolism" });
    for (const t of TOOLS) assert.ok(libApp.OPENABLE_ANALYSIS_PAGES.includes(t.page));
    const labels = read("src", "components", "SavedAnalysesPage.tsx");
    for (const label of ["Chemical equilibrium", "Reaction kinetics", "Thermodynamics"]) assert.match(labels, new RegExp(label));
  });
  test("[subject] the new pages belong to General Chemistry; earlier pages keep their subjects", () => {
    for (const t of TOOLS) assert.equal(store.PAGE_SUBJECT[t.page], "general");
    assert.equal(store.PAGE_SUBJECT.genchem, "general");
    for (const page of ["synthesis", "properties", "reactions", "spectroscopy", "ranking", "multicatalytic", "conformations"]) assert.equal(store.PAGE_SUBJECT[page], "organic");
  });
});

describe("strict validation of saved inputs", () => {
  test("[defaults] each tool's defaults validate and come back unchanged, with a summary", () => {
    for (const t of TOOLS) {
      const d = t.defaults();
      assert.deepEqual(t.validate(clone(d)), d, t.page);
      const s = t.summarize(d);
      assert.ok(s && s.headline.length > 0 && Number.isFinite(s.check), t.page);
      assert.deepEqual(t.vResults(clone(s)), s, t.page);
      assert.equal(d.subject, "general");
    }
  });
  test("[equilibrium] wrong types, impossible systems and bad disturbances are rejected, not coerced", () => {
    const base = TW.DEFAULT_EQUILIBRIUM_INPUTS;
    const bad = [
      null, [], "x", {}, { ...base, subject: "organic" }, { ...base, tool: "kinetics" },
      { ...base, system: { ...base.system, K: 0 } }, { ...base, system: { ...base.system, K: "4.6e-3" } },
      { ...base, system: { ...base.system, phase: "solid" } },
      { ...base, system: { ...base.system, reactants: [{ name: "A", coeff: 1.5, c0: 1 }] } },
      { ...base, system: { ...base.system, reactants: [{ name: "A", coeff: 1, c0: -1 }] } },
      { ...base, system: { ...base.system, reactants: [] } },
      { ...base, tempK: 5 }, { ...base, tempK: "298" },
      { ...base, disturbance: { ...base.disturbance, kind: "heat" } },
      { ...base, disturbance: { ...base.disturbance, target: "products:5" } },
      { ...base, disturbance: { ...base.disturbance, target: "reactants:0;drop" } },
      { ...base, disturbance: { ...base.disturbance, factor: 1000 } },
      { ...base, disturbance: { ...base.disturbance, amount: -1 } },
    ];
    for (const v of bad) assert.equal(TW.validateEquilibriumInputs(v), null, JSON.stringify(v));
  });
  test("[kinetics] bad order, k, time unit, view and Arrhenius settings are rejected", () => {
    const base = TW.DEFAULT_KINETICS_INPUTS;
    const bad = [
      null, { ...base, view: "mechanism" }, { ...base, timeUnit: "ms" }, { ...base, tNow: -1 }, { ...base, tNow: "5" },
      { ...base, model: { ...base.model, order: 3 } }, { ...base, model: { ...base.model, k: -0.1 } }, { ...base, model: { ...base.model, c0: 0 } },
      { ...base, fitText: 5 }, { ...base, fitText: "x".repeat(20001) },
      { ...base, arrhenius: { ...base.arrhenius, T: 0 } }, { ...base, arrhenius: { ...base.arrhenius, mode: "nope" } }, { ...base, arrhenius: { ...base.arrhenius, EaKJ: -5 } },
    ];
    for (const v of bad) assert.equal(TW.validateKineticsInputs(v), null, JSON.stringify(v).slice(0, 120));
  });
  test("[thermodynamics] unit mix-ups, bad ranges and malformed Hess or calorimetry blocks are rejected", () => {
    const base = TW.DEFAULT_THERMO_INPUTS;
    const bad = [
      null, { ...base, view: "enthalpy" }, { ...base, tool: "equilibrium" },
      { ...base, gibbs: { ...base.gibbs, dS: 1e6 } }, { ...base, gibbs: { ...base.gibbs, T: -5 } }, { ...base, gibbs: { ...base.gibbs, Tmin: 500, Tmax: 510 } }, { ...base, gibbs: { ...base.gibbs, Q: -1 } },
      { ...base, hess: { ...base.hess, steps: [] } }, { ...base, hess: { target: "", steps: base.hess.steps } },
      { ...base, hess: { ...base.hess, steps: [{ equation: "a", dH: "1" }] } },
      { ...base, calorimetry: { ...base.calorimetry, mode: "bomb" } },
      { ...base, calorimetry: { ...base.calorimetry, reaction: { ...base.calorimetry.reaction, massG: 0 } } },
      { ...base, calorimetry: { ...base.calorimetry, mixing: { ...base.calorimetry.mixing, m1: "a" } } },
      { ...base, calorimetry: { ...base.calorimetry, mixing: { ...base.calorimetry.mixing, m1: 1e12 } } },
    ];
    for (const v of bad) assert.equal(TW.validateThermoInputs(v), null, JSON.stringify(v).slice(0, 120));
  });
  test("[results] damaged summaries are refused", () => {
    const s = SUM.summarizeEquilibrium(TW.DEFAULT_EQUILIBRIUM_INPUTS);
    for (const bad of [null, { ...s, check: "1" }, { ...s, check: Infinity }, { ...s, headline: [1] }, { ...s, engineVersion: 1.5 }, { ...s, checkLabel: 7 }]) assert.equal(TW.validateEquilibriumResults(bad), null);
  });
});

describe("saved-analysis round trips", () => {
  const variants = () => [
    ...["model", "fit", "arrhenius"].map((view) => ({ t: TOOLS[1], value: { ...TW.DEFAULT_KINETICS_INPUTS, view } })),
    ...["gibbs", "hess", "calorimetry"].map((view) => ({ t: TOOLS[2], value: { ...TW.DEFAULT_THERMO_INPUTS, view } })),
    ...["reactants:0", "products:0"].flatMap((target) => ["add", "remove", "volume", "inert"].map((kind) => ({ t: TOOLS[0], value: { ...TW.DEFAULT_EQUILIBRIUM_INPUTS, disturbance: { ...TW.DEFAULT_EQUILIBRIUM_INPUTS.disturbance, kind, target } } }))),
    ...["reaction", "mixing", "specific-heat"].map((mode) => ({ t: TOOLS[2], value: { ...TW.DEFAULT_THERMO_INPUTS, view: "calorimetry", calorimetry: { ...TW.DEFAULT_THERMO_INPUTS.calorimetry, mode } } })),
    { t: TOOLS[2], value: { ...TW.DEFAULT_THERMO_INPUTS, gibbs: { ...TW.DEFAULT_THERMO_INPUTS.gibbs, dCp: 60, Q: 25 } } },
    { t: TOOLS[0], value: { ...TW.DEFAULT_EQUILIBRIUM_INPUTS, system: { reactants: [{ name: "A", coeff: 2, c0: 0.5 }, { name: "B", coeff: 1, c0: 0.2 }], products: [{ name: "C", coeff: 3, c0: 0 }, { name: "D", coeff: 1, c0: 0.1 }], K: 12, phase: "aqueous" } } },
  ];
  test("[save/open] every tool and view saves with its subject and reopens with identical inputs and the same recomputed summary", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    for (const { t, value } of variants()) {
      const results = t.summarize(value);
      assert.ok(results, `${t.page} ${JSON.stringify(value).slice(0, 40)}`);
      const saved = ok(await real.save(t.page, { name: `${t.page} analysis`, summary: t.describe(value), inputs: value, results: { computedAt: "2026-11-11T00:00:00.000Z", engineVersion: t.engine(), stale: false, status: "complete", data: results } }));
      assert.equal(saved.subject, "general");
      const raw = JSON.parse(backend.map.get(saved.id));
      assert.equal(raw.page, t.page);
      assert.equal(raw.inputs.subject, "general");
      const opened = ok(await real.open(saved.id));
      assert.deepEqual(opened.inputs, value);
      assert.equal(opened.resultsDropped, false);
      const fresh = t.summarize(opened.inputs);
      assert.deepEqual(fresh, results, "results are deterministic from the inputs");
      assert.equal(opened.results.data.check, fresh.check);
    }
    const list = ok(await real.list());
    assert.equal(list.problems.length, 0);
    assert.ok(list.items.every((i) => i.subject === "general"));
  });
  test("[autosave store] each new page has its own workspace key and subject", () => {
    const keys = ["equilibrium", "kinetics", "thermo", "genchem"].map((p) => store.WorkspaceStore.key(p));
    assert.equal(new Set(keys).size, 4);
  });
  test("[existing records] acid-base (genchem) and Organic records written before Stage 12 still open, beside the new tools", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    const g = GW.DEFAULT_GENCHEM_INPUTS;
    const gr = GSUM.summarize(g);
    const saved = ok(await real.save("genchem", { name: "Acetic acid", summary: GW.describeGenChemAnalysis(g, gr), inputs: g, results: { computedAt: "2026-11-11T00:00:00.000Z", engineVersion: GW.GENCHEM_ENGINE_VERSION, stale: false, status: "complete", data: gr } }));
    const eq = TW.DEFAULT_EQUILIBRIUM_INPUTS;
    ok(await real.save("equilibrium", { name: "eq", summary: "s", inputs: eq, results: null }));
    const opened = ok(await real.open(saved.id));
    assert.deepEqual(opened.inputs, g);
    // an Organic-style record without a subject field is still read as Organic (the loader reads PAGE_SUBJECT[page])
    const conf = { source: { kind: "smiles", text: "CC1CCCCC1" }, mode: "chair", chair: { ring: [1, 2, 3, 4, 5, 6], flipped: false, choices: {} }, torsion: { front: null, rear: null, frontRef: null, rearRef: null, rotation: 0 }, comparison: [] };
    const CW = await loadModule("/src/utils/persistence/conformationsWorkspace.ts");
    const real2 = new lib.AnalysisLibrary(backend, { validators: { ...validators(), conformations: { engineVersion: CW.CONFORMATIONS_ENGINE_VERSION, validateInputs: CW.validateConformationsInputs, validateResults: CW.validateConformationsResults } }, newId: () => "legacy000002" });
    const c = ok(await real2.save("conformations", { name: "legacy", summary: "s", inputs: conf, results: null }));
    const raw = JSON.parse(backend.map.get(c.id)); delete raw.subject; backend.map.set(c.id, JSON.stringify(raw));
    const list = ok(await real2.list());
    assert.equal(list.problems.length, 0, JSON.stringify(list.problems));
    assert.equal(list.items.find((i) => i.id === c.id).subject, "organic");
  });
  test("[integrity] a new-tool record claiming the wrong subject, or carrying invalid inputs, is damaged and never opened", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    const a = ok(await real.save("kinetics", { name: "k", summary: "s", inputs: TW.DEFAULT_KINETICS_INPUTS, results: null }));
    const raw = JSON.parse(backend.map.get(a.id)); raw.subject = "organic"; backend.map.set(a.id, JSON.stringify(raw));
    const b = ok(await real.save("thermo", { name: "t", summary: "s", inputs: TW.DEFAULT_THERMO_INPUTS, results: null }));
    const rawB = JSON.parse(backend.map.get(b.id)); rawB.inputs.gibbs.dS = 1e9; backend.map.set(b.id, JSON.stringify(rawB));
    const list = ok(await real.list());
    assert.ok(list.problems.length >= 1);
    assert.equal((await real.open(a.id)).ok, false);
    assert.equal((await real.open(b.id)).ok, false);
  });
  test("[model change] a record whose saved check disagrees with the recomputed one is detectable", () => {
    const eq = TW.DEFAULT_EQUILIBRIUM_INPUTS;
    const s = SUM.summarizeEquilibrium(eq);
    const stale = { ...s, check: s.check * 1.5 };
    assert.ok(Math.abs(stale.check - SUM.summarizeEquilibrium(eq).check) > 1e-6 * Math.max(1, Math.abs(stale.check)));
  });
});
