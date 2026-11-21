// Stage 26: navigation, strict versioned persistence, saved-analysis round trips, learning modes, concept search, cross-subject links and App wiring for
// Organelles & protein trafficking, Cell cycle & checkpoints and Apoptosis & autophagy.
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

let PV, S, store, lib, libApp, BT, BT26, SUM, L, T, C, D, I, Q, R, Lay;
before(async () => {
  PV = await loadModule("/src/utils/biology/provenance26.ts");
  S = await loadModule("/src/navigation/subjects.ts");
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  libApp = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  BT = await loadModule("/src/utils/persistence/biologyTools.ts");
  BT26 = await loadModule("/src/utils/persistence/biologyTools26.ts");
  SUM = await loadModule("/src/utils/biology/bioSummary26.ts");
  L = await loadModule("/src/utils/biology/bioLearning26.ts");
  T = await loadModule("/src/utils/biology/trafficking26.ts");
  C = await loadModule("/src/utils/biology/cellcycle26.ts");
  D = await loadModule("/src/utils/biology/celldeath26.ts");
  I = await loadModule("/src/utils/concepts/conceptIndex.ts");
  Q = await loadModule("/src/utils/concepts/search.ts");
  R = await loadModule("/src/utils/concepts/relations.ts");
  Lay = await loadModule("/src/components/biology/layout26.ts");
});
after(async () => { await closeEngine(); });

const TOOLS = () => [
  { page: "organelles", id: "bioOrganelles", slug: "organelles-trafficking", defaults: BT26.DEFAULT_ORGANELLE_INPUTS, validate: BT26.validateOrganelleInputs, summarize: SUM.summarizeOrganelles, describe: SUM.describeOrganelles, engine: BT26.ORGANELLES_ENGINE_VERSION },
  { page: "cellcycle", id: "bioCellCycle", slug: "cell-cycle-checkpoints", defaults: BT26.DEFAULT_CELLCYCLE_INPUTS, validate: BT26.validateCellCycleInputs, summarize: SUM.summarizeCellCycle, describe: SUM.describeCellCycle, engine: BT26.CELLCYCLE_ENGINE_VERSION },
  { page: "celldeath", id: "bioCellDeath", slug: "apoptosis-autophagy", defaults: BT26.DEFAULT_CELLDEATH_INPUTS, validate: BT26.validateCellDeathInputs, summarize: SUM.summarizeCellDeath, describe: SUM.describeCellDeath, engine: BT26.CELLDEATH_ENGINE_VERSION },
];
const validators = () => Object.fromEntries(TOOLS().map((t) => [t.page, { engineVersion: t.engine, validateInputs: t.validate, validateResults: BT.validateBiologyResults }]));
const ids = () => { let n = 0; return () => `s26x${(n += 1).toString().padStart(4, "0")}`; };

describe("navigation and registration", () => {
  test("[tools] a Cell organization & regulation group holds the three tools after the Stage 23 tools and before Saved", () => {
    const list = S.BIOLOGY_TOOLS.map((t) => t.id);
    assert.deepEqual(list.slice(0, 11), ["bioOverview", "bioReplication", "bioTranscription", "bioTranslation", "bioDogma", "bioRegulation", "bioGenetics", "bioDivision", "bioMembrane", "bioSignaling", "bioNeuron"], "existing order unchanged");
    assert.deepEqual(list.slice(11), ["bioOrganelles", "bioCellCycle", "bioCellDeath", "bioSaved"]);
    for (const t of TOOLS()) { const def = S.BIOLOGY_TOOLS.find((x) => x.id === t.id); assert.equal(def.slug, t.slug); assert.equal(def.group, "cellOrg"); }
    assert.ok(S.TOOL_GROUPS.some((g) => g.id === "cellOrg" && /Cell organization/.test(g.label)));
    assert.equal(new Set(S.BIOLOGY_TOOLS.map((t) => t.slug)).size, S.BIOLOGY_TOOLS.length);
  });
  test("[routes] deep links round-trip", () => {
    for (const t of TOOLS()) { assert.equal(S.routeHash({ subject: "biology", toolId: t.id }), `#/biology/${t.slug}`); assert.deepEqual(S.parseRoute(`#/biology/${t.slug}`), { subject: "biology", toolId: t.id }); }
  });
  test("[existing subjects] other tool lists are unchanged", () => {
    assert.deepEqual(S.GENERAL_TOOLS.map((t) => t.id), ["gcOverview", "gcStoichiometry", "gcGas", "gcAcidBase", "gcEquilibrium", "gcKinetics", "gcThermo", "gcElectro", "gcSaved"]);
    assert.deepEqual(S.ORGANIC_TOOLS.map((t) => t.id), ["analysis", "acidBase", "spectroscopy", "conformations", "reactions", "multiStep", "multiCatalytic", "saved"]);
    assert.equal(S.BIOCHEMISTRY_TOOLS.length, 13);
  });
  test("[pages] each tool is a persisted page of subject biology that Saved Analyses can open", () => {
    for (const t of TOOLS()) { assert.equal(store.PAGE_SUBJECT[t.page], "biology"); assert.equal(libApp.ANALYSIS_APP_PAGE[t.page], t.id); assert.ok(libApp.OPENABLE_ANALYSIS_PAGES.includes(t.page)); }
  });
  test("[wiring] App renders each page, routes openings from Saved and the overview lists the tools", () => {
    const app = read("src", "App.tsx");
    for (const [Comp, id] of [["OrganellesPage", "bioOrganelles"], ["CellCyclePage", "bioCellCycle"], ["CellDeathPage", "bioCellDeath"]]) {
      assert.ok(app.includes(`lazy(() => import("./components/biology/${Comp}"))`), Comp);
      assert.ok(app.includes(`generalTool === "${id}" ? (`), id);
      assert.ok(app.includes(`target === "${id}"`), `${id} saved-opening route`);
      assert.ok(app.includes(`pendingOpen?.page === "${id}"`), `${id} open request`);
      assert.ok(read("src", "components", "biology", `${Comp}.tsx`).includes(`toolId="${id}"`), `${Comp} related links`);
    }
    const overview = read("src", "components", "biology", "BiologyOverview.tsx");
    for (const id of ["bioOrganelles", "bioCellCycle", "bioCellDeath"]) assert.match(overview, new RegExp(`${id}: \\[`));
    assert.ok(overview.includes('"cellOrg"'));
    const saved = read("src", "components", "SavedAnalysesPage.tsx");
    for (const label of ["Organelles & protein trafficking", "Cell cycle & checkpoints", "Apoptosis & autophagy"]) assert.ok(saved.includes(label), label);
    for (const Comp of ["ReplicationPage", "TranslationPage", "CellDivisionPage", "MembranePage", "SignalingPage", "NeuronPage"]) assert.ok(app.includes(`components/biology/${Comp}`), Comp);
  });
  test("[subject registry] the Biology tagline names the new tools and the explorer is no longer listed as planned", () => {
    const b = S.SUBJECTS.find((s) => s.id === "biology");
    assert.match(b.tagline, /organelles/); assert.match(b.tagline, /apoptosis/);
    assert.ok(!b.planned.includes("Cell structure explorer"));
  });
  test("[layout] the diagram layout places every node of every graph exactly once and keeps rows non-overlapping", () => {
    for (const g of [T.QC_GRAPH, C.CYCLE_GRAPH, C.CDK_GRAPH, C.LICENSE_GRAPH, D.APOPTOSIS_GRAPH, D.AUTOPHAGY_GRAPH]) {
      const mods = [...new Set(g.nodes.map((n) => n.module))];
      for (const m of mods) {
        const own = g.nodes.filter((n) => n.module === m);
        const lay = Lay.layeredLayout(own.map((n) => ({ id: n.id, w: 196, h: 60 })), []);
        assert.equal(Object.keys(lay.pos).length, own.length, `${g.id}/${m}`);
      }
    }
    const lay = Lay.layeredLayout([{ id: "a", w: 100, h: 40 }, { id: "b", w: 100, h: 40 }, { id: "c", w: 100, h: 40 }], [{ from: "a", to: "b" }, { from: "b", to: "c" }]);
    assert.ok(lay.pos.a.y < lay.pos.b.y && lay.pos.b.y < lay.pos.c.y, "dependencies run top to bottom");
  });
});

describe("strict persistence", () => {
  test("[defaults] validate and summarize", () => {
    for (const t of TOOLS()) {
      assert.notEqual(t.validate(clone(t.defaults)), null, t.page);
      assert.notEqual(BT.validateBiologyResults(t.summarize(t.defaults)), null, `${t.page} results validate`);
      assert.ok(t.describe(t.defaults).length <= 300);
    }
  });
  test("[summaries] every section's results validate and assumption lines stay under 400 characters", () => {
    for (const s of BT26.ORGANELLE_SECTIONS) assert.notEqual(BT.validateBiologyResults(SUM.summarizeOrganelles({ ...BT26.DEFAULT_ORGANELLE_INPUTS, section: s })), null, s);
    for (const s of BT26.CYCLE_SECTIONS) assert.notEqual(BT.validateBiologyResults(SUM.summarizeCellCycle({ ...BT26.DEFAULT_CELLCYCLE_INPUTS, section: s })), null, s);
    for (const s of BT26.DEATH_SECTIONS) assert.notEqual(BT.validateBiologyResults(SUM.summarizeCellDeath({ ...BT26.DEFAULT_CELLDEATH_INPUTS, section: s, apop: { ...D.DEFAULT_APOPTOSIS, path: s === "extrinsic" ? "extrinsic" : "intrinsic" } })), null, s);
    for (const list of [SUM.ORGANELLE_ASSUMPTIONS, SUM.CYCLE_ASSUMPTIONS, SUM.DEATH_ASSUMPTIONS]) for (const line of list) assert.ok(line.length <= 400, line.slice(0, 40));
  });
  test("[check numbers] come from the models (independent values)", () => {
    const org = (p) => SUM.summarizeOrganelles({ ...BT26.DEFAULT_ORGANELLE_INPUTS, section: "tracker", ...p });
    assert.equal(org({ cargo: "secreted" }).check, 11, "secreted protein route has 11 steps");
    assert.equal(org({ cargo: "nuclear" }).check, 5);
    assert.equal(org({ cargo: "secreted", perturbations: ["srp-disabled"] }).check, 1, "stops after translation starts");
    assert.equal(SUM.summarizeOrganelles({ ...BT26.DEFAULT_ORGANELLE_INPUTS, section: "endosomes", endo: { cargo: "ldl", perturbations: [], stage: null } }).check, 1);
    assert.equal(SUM.summarizeOrganelles({ ...BT26.DEFAULT_ORGANELLE_INPUTS, section: "endosomes", endo: { cargo: "transferrin", perturbations: [], stage: null } }).check, 0);
    assert.equal(SUM.summarizeCellCycle(BT26.DEFAULT_CELLCYCLE_INPUTS).check, 5, "a healthy default cell: all five transitions proceed");
    assert.equal(SUM.summarizeCellCycle({ ...BT26.DEFAULT_CELLCYCLE_INPUTS, section: "licensing", license: { phase: "s", perturbations: [] } }).check, 0);
    assert.equal(SUM.summarizeCellDeath({ ...BT26.DEFAULT_CELLDEATH_INPUTS, section: "intrinsic", apop: { ...D.DEFAULT_APOPTOSIS, path: "intrinsic" } }).check, 8);
    assert.equal(SUM.summarizeCellDeath({ ...BT26.DEFAULT_CELLDEATH_INPUTS, section: "intrinsic", apop: { ...D.DEFAULT_APOPTOSIS, path: "intrinsic", perturbations: ["apaf1-loss"] } }).check, 5);
  });

  const variants = () => {
    const out = [];
    const O = BT26.DEFAULT_ORGANELLE_INPUTS, CC = BT26.DEFAULT_CELLCYCLE_INPUTS, CD = BT26.DEFAULT_CELLDEATH_INPUTS;
    for (const section of BT26.ORGANELLE_SECTIONS) for (const mode of ["explore", "practice", "challenge"]) out.push({ t: TOOLS()[0], value: { ...O, section, mode, challenge: 3 } });
    for (const cargo of T.CARGO_IDS) out.push({ t: TOOLS()[0], value: { ...O, section: "tracker", cargo, step: T.traceCargo(cargo, []).steps.length - 1, organelle: "golgi" } });
    out.push({ t: TOOLS()[0], value: { ...O, section: "tracker", cargo: "lysosomal", perturbations: ["m6p-blocked"], step: T.traceCargo("lysosomal", ["m6p-blocked"]).steps.length - 1 } });
    out.push({ t: TOOLS()[0], value: { ...O, section: "vesicles", vesicle: { route: "copi", stage: "tethering" }, endo: { cargo: "egf", perturbations: ["v-atpase-inhibited"], stage: "late" }, qc: { defect: true, aggregates: true, perturbations: ["erad-impaired"] }, qcSelected: "lysoDeg" } });
    for (const section of BT26.CYCLE_SECTIONS) for (const mode of ["explore", "challenge"]) out.push({ t: TOOLS()[1], value: { ...CC, section, mode } });
    out.push({ t: TOOLS()[1], value: { ...CC, section: "ddr", cycle: { ...C.withPhase(C.DEFAULT_CYCLE, "G1"), dsb: true, perturbations: ["p53-loss", "atm-defective"] }, selected: "p21" } });
    out.push({ t: TOOLS()[1], value: { ...CC, section: "sac", cycle: { ...C.withPhase(C.DEFAULT_CYCLE, "M"), allAttached: false, perturbations: ["sac-defective"] }, selected: "anaphase" } });
    out.push({ t: TOOLS()[1], value: { ...CC, section: "licensing", license: { phase: "s", perturbations: ["geminin-loss", "cdt1-stable", "cdc6-cdk-resistant"] }, selected: "relicensing" } });
    out.push({ t: TOOLS()[1], value: { ...CC, section: "cdk", cdk: { complex: "cdk2e", cyclin: true, cak: false, inhibPhos: false, cki: true }, selected: "active" } });
    for (const section of BT26.DEATH_SECTIONS) for (const mode of ["explore", "practice"]) out.push({ t: TOOLS()[2], value: { ...CD, section, mode, apop: { ...D.DEFAULT_APOPTOSIS, path: section === "extrinsic" ? "extrinsic" : "intrinsic" } } });
    out.push({ t: TOOLS()[2], value: { ...CD, section: "intrinsic", apop: { ...D.DEFAULT_APOPTOSIS, path: "intrinsic", step: 5, perturbations: ["apaf1-loss"] }, selected: "apoptosome" } });
    out.push({ t: TOOLS()[2], value: { ...CD, section: "extrinsic", apop: { ...D.DEFAULT_APOPTOSIS, dnaDamage: false, deathLigand: true, typeII: true, path: "extrinsic", step: 4, perturbations: ["bcl2-overexpression"] } } });
    out.push({ t: TOOLS()[2], value: { ...CD, section: "autophagy", auto: { nutrients: false, energyStress: false, cargoAvailable: true, perturbations: ["fusion-defective"], step: 7 }, selected: "accumulating" } });
    out.push({ t: TOOLS()[2], value: { ...CD, section: "fate", fate: { scenario: "lysosomal-dysfunction", perturbations: ["mtor-inhibited"], selected: "recycling" } } });
    return out;
  };
  test("[save/open] every tool, section and mode saves with subject biology and reopens with identical inputs and the same recomputed summary", async () => {
    const real = new lib.AnalysisLibrary(new store.MemoryBackend(), { validators: validators(), newId: ids() });
    for (const { t, value } of variants()) {
      assert.notEqual(t.validate(clone(value)), null, `${t.page} ${JSON.stringify(value).slice(0, 110)}`);
      const results = t.summarize(value);
      const saved = ok(await real.save(t.page, { name: `${t.page} analysis`, summary: t.describe(value), inputs: value, results: { computedAt: "2026-11-20T00:00:00.000Z", engineVersion: t.engine, stale: false, status: "complete", data: results } }));
      assert.equal(saved.subject, "biology");
      const opened = ok(await real.open(saved.id));
      assert.deepEqual(opened.inputs, value);
      assert.deepEqual(t.summarize(opened.inputs), results, "derived results are recomputed from inputs");
      assert.equal(opened.inputs.mode, value.mode, "learning mode survives");
    }
    assert.equal(ok(await real.list()).problems.length, 0);
  });
  test("[contradictions] impossible organelle states are rejected", () => {
    const d = () => clone(BT26.DEFAULT_ORGANELLE_INPUTS);
    const bad = [
      (x) => { x.section = "x"; }, (x) => { x.mode = "learn"; }, (x) => { x.challenge = -1; }, (x) => { x.cargo = "peroxisomal"; }, (x) => { x.organelle = "chloroplast"; },
      (x) => { x.perturbations = ["srp-disabled"]; x.cargo = "secreted"; x.step = 5; }, // the route stops after one step
      (x) => { x.perturbations = ["srp-disabled", "srp-disabled"]; }, (x) => { x.perturbations = ["nonsense"]; }, (x) => { x.perturbations = ["srp-disabled", "er-export-impaired", "m6p-blocked", "mts-defective"]; },
      (x) => { x.step = 99; }, (x) => { x.step = -1; }, (x) => { x.step = 1.5; }, (x) => { x.vesicle.route = "copiii"; }, (x) => { x.vesicle.stage = "merging"; }, (x) => { x.endo.cargo = "albumin"; },
      (x) => { x.endo.perturbations = ["v-atpase-inhibited", "v-atpase-inhibited"]; }, (x) => { x.endo.stage = "nowhere"; }, (x) => { x.qc.aggregates = true; x.qc.defect = false; }, (x) => { x.qcSelected = "ghost"; },
      (x) => { x.subject = "physics"; }, (x) => { x.tool = "cellcycle"; },
    ];
    for (const [i, f] of bad.entries()) { const x = d(); f(x); assert.equal(BT26.validateOrganelleInputs(x), null, `case ${i}`); }
    assert.equal(BT26.validateOrganelleInputs(null), null);
    const good = d(); good.perturbations = ["er-export-impaired"]; good.step = 4; assert.notEqual(BT26.validateOrganelleInputs(good), null, "last step the cargo actually takes before the blocked export");
    good.step = 5; assert.equal(BT26.validateOrganelleInputs(good), null, "the blocked step itself is not a step the cargo takes");
  });
  test("[contradictions] impossible cell-cycle states are rejected", () => {
    const d = () => clone(BT26.DEFAULT_CELLCYCLE_INPUTS);
    const bad = [
      (x) => { x.section = "x"; }, (x) => { x.cycle.phase = "G0"; x.cycle.pastRestriction = true; }, (x) => { x.cycle.phase = "S"; }, (x) => { x.cycle.allAttached = false; }, (x) => { x.cycle.replStress = true; },
      (x) => { x.cycle.perturbations = ["rb-loss", "rb-loss"]; }, (x) => { x.cycle.perturbations = ["bogus"]; }, (x) => { x.cycle.perturbations = ["rb-loss", "cdk46-inhibited", "wee1-inhibited", "cdc25-loss", "p53-loss"]; },
      (x) => { x.cdk.complex = "cdk9"; }, (x) => { x.license.phase = "s2"; }, (x) => { x.selected = "ghost"; }, (x) => { x.selected = "p21"; /* overview has no graph */ }, (x) => { x.section = "cdk"; x.selected = "p21"; },
      (x) => { x.cycle.mitogen = 1; }, (x) => { x.mode = "x"; },
    ];
    for (const [i, f] of bad.entries()) { const x = d(); f(x); assert.equal(BT26.validateCellCycleInputs(x), null, `case ${i}`); }
    const good = d(); good.section = "g1s"; good.selected = "e2f"; assert.notEqual(BT26.validateCellCycleInputs(good), null);
  });
  test("[contradictions] impossible apoptosis, autophagy and fate states are rejected", () => {
    const d = () => clone(BT26.DEFAULT_CELLDEATH_INPUTS);
    const bad = [
      (x) => { x.section = "x"; }, (x) => { x.section = "intrinsic"; x.apop.path = "extrinsic"; }, (x) => { x.section = "extrinsic"; x.apop.path = "intrinsic"; }, (x) => { x.apop.step = 9; },
      (x) => { x.apop.perturbations = ["bax-loss", "bax-loss"]; }, (x) => { x.apop.perturbations = ["nope"]; }, (x) => { x.apop.perturbations = ["bax-loss", "bak-loss", "p53-loss", "apaf1-loss", "casp9-inhibited"]; },
      (x) => { x.auto.step = 9; }, (x) => { x.auto.perturbations = ["bax-loss"]; }, (x) => { x.fate.scenario = "x"; }, (x) => { x.fate.perturbations = ["bid-loss"]; }, (x) => { x.fate.selected = "ghost"; },
      (x) => { x.selected = "momp"; /* overview has no graph */ }, (x) => { x.section = "autophagy"; x.selected = "momp"; }, (x) => { x.section = "fate"; x.selected = "momp"; },
    ];
    for (const [i, f] of bad.entries()) { const x = d(); f(x); assert.equal(BT26.validateCellDeathInputs(x), null, `case ${i}`); }
  });
  test("[integrity] damaged saved records are refused when opened, and records of the other subjects coexist", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: { ...validators(), signaling: { engineVersion: 1, validateInputs: (await loadModule("/src/utils/persistence/biologyTools23.ts")).validateSignalingInputs, validateResults: BT.validateBiologyResults } }, newId: ids() });
    const make = async (page, inputs, mutate) => { const r = ok(await real.save(page, { name: page, summary: "s", inputs, results: null })); const raw = JSON.parse(backend.map.get(r.id)); mutate(raw); backend.map.set(r.id, JSON.stringify(raw)); return r.id; };
    const badIds = [
      await make("organelles", BT26.DEFAULT_ORGANELLE_INPUTS, (r) => { r.inputs.cargo = "ghost"; }),
      await make("organelles", BT26.DEFAULT_ORGANELLE_INPUTS, (r) => { r.subject = "physics"; }),
      await make("cellcycle", BT26.DEFAULT_CELLCYCLE_INPUTS, (r) => { r.inputs.cycle.perturbations = ["nonsense"]; }),
      await make("celldeath", BT26.DEFAULT_CELLDEATH_INPUTS, (r) => { r.inputs.apop.step = 1e6; }),
    ];
    for (const id of badIds) assert.equal((await real.open(id)).ok, false, id);
    const a = ok(await real.save("organelles", { name: "o", summary: "s", inputs: BT26.DEFAULT_ORGANELLE_INPUTS, results: null }));
    const b = ok(await real.save("signaling", { name: "s", summary: "s", inputs: (await loadModule("/src/utils/persistence/biologyTools23.ts")).DEFAULT_SIGNALING_INPUTS, results: null }));
    for (const x of [a, b]) assert.equal((await real.open(x.id)).ok, true);
  });
});

describe("learning modes", () => {
  let O;
  before(() => { O = BT26.DEFAULT_ORGANELLE_INPUTS; });
  const sections = () => [
    ...BT26.ORGANELLE_SECTIONS.map((s) => ({ name: `organelles/${s}`, q: (extra = {}) => L.organelleQuestions({ ...O, section: s, ...extra }), c: (i) => L.organelleChallenge({ ...O, section: s }, i), valid: BT26.validateOrganelleInputs })),
    ...BT26.CYCLE_SECTIONS.map((s) => ({ name: `cellcycle/${s}`, q: () => L.cellCycleQuestions({ ...BT26.DEFAULT_CELLCYCLE_INPUTS, section: s }), c: (i) => L.cellCycleChallenge({ ...BT26.DEFAULT_CELLCYCLE_INPUTS, section: s }, i), valid: BT26.validateCellCycleInputs })),
    ...BT26.DEATH_SECTIONS.map((s) => ({ name: `celldeath/${s}`, q: () => L.cellDeathQuestions({ ...BT26.DEFAULT_CELLDEATH_INPUTS, section: s, apop: { ...D.DEFAULT_APOPTOSIS, path: s === "extrinsic" ? "extrinsic" : "intrinsic" } }), c: (i) => L.cellDeathChallenge({ ...BT26.DEFAULT_CELLDEATH_INPUTS, section: s, apop: { ...D.DEFAULT_APOPTOSIS, path: s === "extrinsic" ? "extrinsic" : "intrinsic" } }, i), valid: BT26.validateCellDeathInputs })),
  ];
  const wellFormed = (q, where) => {
    assert.ok(q.prompt.length > 15, where); assert.ok(q.options.length >= 2 && q.options.length <= 5, where);
    assert.equal(new Set(q.options).size, q.options.length, `${where}: options are distinct`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, where); assert.ok(q.explanation.length > 20, where);
  };
  test("[practice] every section has well-formed questions", () => { for (const s of sections()) { if (s.name === "celldeath/overview" || s.name === "organelles/quality") { assert.ok(s.q().length >= 2, s.name); } const qs = s.q(); assert.ok(qs.length >= 2, s.name); qs.forEach((q, i) => wellFormed(q, `${s.name}#${i}`)); } });
  test("[challenge] every section's challenges are well formed and apply to a valid state", () => {
    for (const s of sections()) for (let i = 0; i < 8; i += 1) {
      const ch = s.c(i); assert.notEqual(ch, null, `${s.name} ${i}`);
      wellFormed(ch.question, `${s.name} challenge ${i}`);
      assert.notEqual(s.valid(clone(ch.next)), null, `${s.name} challenge ${i} next state is valid`);
    }
  });
  test("[required questions] every question the milestone names is asked somewhere", () => {
    const prompts = sections().flatMap((s) => s.q().map((q) => q.prompt)).concat(L.organelleQuestions({ ...O, section: "tracker", cargo: "membrane" }).map((q) => q.prompt));
    for (const re of [/Which proteins enter the secretory pathway\?/, /role of SRP/, /distinguishes COPII from COPI/, /Why can lysosomal hydrolase sorting fail\?/, /When can replication origins be licensed/, /Why can an unattached kinetochore delay anaphase\?/,
      /What activates the intrinsic apoptotic pathway\?/, /difference between initiator and executioner caspases\?/, /Why is autophagy not synonymous with apoptosis\?/]) assert.ok(prompts.some((p) => re.test(p)), String(re));
  });
  test("[independent answers] practice questions match hand-derived biology", () => {
    const pick = (qs, re) => qs.find((q) => re.test(q.prompt));
    const sec = pick(L.organelleQuestions({ ...O, section: "cell" }), /secretory pathway/);
    assert.match(sec.options[sec.answer], /Secreted protein, integral membrane protein and lysosomal hydrolase/i);
    const lic = pick(L.cellCycleQuestions({ ...BT26.DEFAULT_CELLCYCLE_INPUTS, section: "licensing" }), /When can replication origins be licensed/);
    assert.match(lic.options[lic.answer], /^Mitotic exit \(late M\) and G1/);
    const sac = pick(L.cellCycleQuestions({ ...BT26.DEFAULT_CELLCYCLE_INPUTS, section: "sac" }), /unattached kinetochore/);
    assert.match(sac.options[sac.answer], /MCC.*APC\/C–Cdc20.*securin/);
    const casp = pick(L.cellDeathQuestions({ ...BT26.DEFAULT_CELLDEATH_INPUTS, section: "caspases" }), /initiator and executioner/);
    assert.match(casp.options[casp.answer], /Initiators \(caspase-8, -9\).*executioners \(caspase-3, -7\)/);
    const here = pick(L.cellDeathQuestions({ ...BT26.DEFAULT_CELLDEATH_INPUTS, section: "intrinsic", apop: { ...D.DEFAULT_APOPTOSIS, path: "intrinsic", perturbations: ["apaf1-loss"] } }), /how far does the intrinsic pathway get/);
    assert.match(here.options[here.answer], /“Cytochrome c released” and stops before “Apoptosome assembled”/);
  });
  test("[challenge answers] match the engines", () => {
    const ch = L.organelleChallenge({ ...O, section: "tracker" }, 0);
    assert.equal(ch.question.options[ch.question.answer], "Cytosol", "SRP disabled: a secreted protein stays in the cytosol");
    assert.deepEqual(ch.next.perturbations, ["srp-disabled"]);
    const m6p = L.organelleChallenge({ ...O, section: "tracker" }, 2);
    assert.equal(m6p.question.options[m6p.question.answer], "Extracellular space", "no M6P tag: the hydrolase is secreted");
    const cc = L.cellCycleChallenge({ ...BT26.DEFAULT_CELLCYCLE_INPUTS, section: "sac" }, 1);
    assert.match(cc.question.options[cc.question.answer], /^Permitted although a checkpoint signal is present/);
    const cd = L.cellDeathChallenge({ ...BT26.DEFAULT_CELLDEATH_INPUTS, section: "intrinsic" }, 2);
    assert.match(cd.question.options[cd.question.answer], /completes/, "BAX lost but BAK present: the pathway still completes");
  });
});

describe("concept search and cross-subject links", () => {
  const dest = (q) => Q.searchConcepts(q)[0]?.destination;
  test("[validity] concept index and relations are valid", () => {
    assert.deepEqual(I.validateConceptIndex(), []);
    assert.deepEqual(R.validateRelations?.() ?? [], []);
  });
  test("[search] organelles, targeting, trafficking, licensing, CDK, apoptosis and autophagy concepts open their tools", () => {
    const want = {
      "signal recognition particle": "bioOrganelles", "nuclear localization sequence": "bioOrganelles", "copii": "bioOrganelles", "snare": "bioOrganelles", "erad": "bioOrganelles", "mannose 6-phosphate": "bioOrganelles",
      "origin licensing": "bioCellCycle", "geminin": "bioCellCycle", "cyclin cdk": "bioCellCycle", "retinoblastoma": "bioCellCycle", "spindle assembly checkpoint": "bioCellCycle", "securin": "bioCellCycle", "atm": "bioCellCycle",
      "apoptosis": "bioCellDeath", "apoptosome": "bioCellDeath", "caspase": "bioCellDeath", "bcl-2": "bioCellDeath", "autophagy": "bioCellDeath", "ulk1": "bioCellDeath",
    };
    for (const [q, id] of Object.entries(want)) assert.equal(dest(q)?.toolId, id, q);
  });
  test("[tools] the three tools are searchable entries", () => {
    for (const name of ["Organelles & protein trafficking", "Cell cycle & checkpoints", "Apoptosis & autophagy"]) assert.ok(I.TOOL_ENTRIES.some((t) => t.name === name), name);
  });
  test("[relations] the nine requested connections exist, are conceptual and carry a caution", () => {
    const has = (a, b) => R.RELATIONS.find((r) => r.from.toolId === a && r.to.toolId === b);
    const pairs = [["bioTranslation", "bioOrganelles"], ["bcProteins", "bioOrganelles"], ["bioMembrane", "bioOrganelles"], ["bioSignaling", "bioCellCycle"], ["bioReplication", "bioCellCycle"], ["bioDivision", "bioCellCycle"],
      ["bioSignaling", "bioCellDeath"], ["bcEtc", "bioCellDeath"], ["bioOrganelles", "bioCellDeath"]];
    for (const [a, b] of pairs) { const r = has(a, b); assert.ok(r, `${a} → ${b}`); assert.match(r.caution ?? "", /conceptual|context-dependent/, `${a} → ${b} is conceptual`); }
    for (const id of ["bioOrganelles", "bioCellCycle", "bioCellDeath"]) assert.ok(R.relationsFrom("biology", id).length >= 2, id);
  });
  test("[links are reachable] every source tool of a Stage 26 relation renders the related-learning panel so the link is visible", () => {
    const files = (dir) => fs.readdirSync(path.join(root, ...dir)).flatMap((n) => { const p = path.join(root, ...dir, n); return fs.statSync(p).isDirectory() ? files([...dir, n]) : n.endsWith(".tsx") ? [p] : []; });
    const src = files(["src", "components"]).map((p) => fs.readFileSync(p, "utf8"));
    for (const r of R.RELATIONS.filter((x) => /celldeath|organelles|cellcycle|-to-division|replication-to-cellcycle|etc-to-celldeath|proteins-to-organelles|division-to-cellcycle|metabolism-to-celldeath/.test(x.id))) {
      assert.ok(src.some((t) => t.includes(`toolId="${r.from.toolId}"`) && t.includes("RelatedConcepts")), `${r.id}: no page renders related learning for ${r.from.toolId}`);
    }
  });
  test("[provenance] verified claims cite an opened source page; unchecked claims cite nothing and are labelled so", () => {
    assert.ok(PV.CLAIMS.filter((c) => c.status === "verified").length >= 6);
    for (const c of PV.CLAIMS) {
      if (c.status === "verified") assert.match(c.source?.url ?? "", /^openstax\.org\/books\/biology-2e\/pages\//, c.id);
      else assert.equal(c.source, undefined, c.id);
    }
    assert.ok(PV.CLAIMS.filter((c) => c.status === "not-checked").length >= 10, "most mechanisms were not independently checked and say so");
    for (const t of ["organelles", "cellcycle", "celldeath"]) assert.ok(PV.claimsFor(t).length >= 3, t);
  });
  test("[no silent handoff] the Stage 26 pages never write to another tool's saved or in-progress state", () => {
    for (const f of ["OrganellesPage", "CellCyclePage", "CellDeathPage"]) {
      const src = read("src", "components", "biology", `${f}.tsx`);
      assert.doesNotMatch(src, /handoff|setHandoff|writeHandoff/i, f);
      assert.match(src, /onNavigate\(/, `${f} only navigates`);
    }
  });
});
