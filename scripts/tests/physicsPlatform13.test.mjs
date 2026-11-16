// Stage 13: Physics navigation, saved-record validation and round trips for Mechanics, DC circuits and RC, compatibility with
// existing General Chemistry and Organic records, summaries/learning content, and App wiring.
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

let S, store, lib, libApp, PT, SUM, LRN, X, MECH, RC, TW, GW;
before(async () => {
  S = await loadModule("/src/navigation/subjects.ts");
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  libApp = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  PT = await loadModule("/src/utils/persistence/physicsTools.ts");
  SUM = await loadModule("/src/utils/physics/physicsSummary.ts");
  LRN = await loadModule("/src/utils/physics/physicsLearning.ts");
  X = await loadModule("/src/utils/physics/circuits.ts");
  MECH = await loadModule("/src/utils/physics/mechanics.ts");
  RC = await loadModule("/src/utils/physics/rc.ts");
  TW = await loadModule("/src/utils/persistence/generalChemTools.ts");
  GW = await loadModule("/src/utils/persistence/generalChemWorkspace.ts");
});
after(async () => { await closeEngine(); });

const TOOLS = [
  { page: "mechanics", tool: "mechanics", id: "phMechanics", slug: "mechanics", defaults: () => PT.DEFAULT_MECHANICS_INPUTS, validate: (v) => PT.validateMechanicsInputs(v), summarize: (v) => SUM.summarizeMechanics(v), describe: (v) => PT.describeMechanicsAnalysis(v), engine: () => PT.MECHANICS_ENGINE_VERSION },
  { page: "circuits", tool: "circuits", id: "phCircuits", slug: "circuits", defaults: () => PT.DEFAULT_CIRCUITS_INPUTS, validate: (v) => PT.validateCircuitsInputs(v), summarize: (v) => SUM.summarizeCircuits(v), describe: (v) => PT.describeCircuitsAnalysis(v), engine: () => PT.CIRCUITS_ENGINE_VERSION },
  { page: "rc", tool: "rc", id: "phRc", slug: "rc-transient", defaults: () => PT.DEFAULT_RC_INPUTS, validate: (v) => PT.validateRcInputs(v), summarize: (v) => SUM.summarizeRc(v), describe: (v) => PT.describeRcAnalysis(v), engine: () => PT.RC_ENGINE_VERSION },
];
const validators = () => Object.fromEntries([
  ...TOOLS.map((t) => [t.page, { engineVersion: t.engine(), validateInputs: t.validate, validateResults: PT.validatePhysicsResults }]),
  ["genchem", { engineVersion: GW.GENCHEM_ENGINE_VERSION, validateInputs: GW.validateGenChemInputs, validateResults: GW.validateGenChemResults }],
  ["equilibrium", { engineVersion: TW.EQUILIBRIUM_ENGINE_VERSION, validateInputs: TW.validateEquilibriumInputs, validateResults: TW.validateEquilibriumResults }],
]);
const ids = () => { let n = 0; return () => `s13x${(n += 1).toString().padStart(4, "0")}`; };

describe("registry, navigation and the overview", () => {
  test("[subjects] Physics is available (Stage 14 adds three mechanics tabs); Biochemistry became available in Stage 17 (Biology became available in Stage 15)", () => {
    assert.equal(S.isAvailable("physics"), true);
    assert.equal(S.getSubject("physics").status, "available");
    assert.deepEqual(S.PHYSICS_TOOLS.map((t) => t.id), ["phOverview", "phMechanics", "phForces", "phEnergy", "phCollisions", "phWaves", "phOptics", "phInterference", "phCircuits", "phRc", "phSaved"]);
    assert.deepEqual(S.PHYSICS_TOOLS.map((t) => t.label), ["Overview", "Mechanics & motion", "Forces & Newton's laws", "Work & energy", "Momentum & collisions", "Waves & sound", "Geometric optics", "Interference & diffraction", "DC circuits", "RC transient", "Saved"]);
    assert.equal(new Set(S.PHYSICS_TOOLS.map((t) => t.slug)).size, S.PHYSICS_TOOLS.length);
    assert.equal(S.SUBJECT_TOOLS.physics, S.PHYSICS_TOOLS);
    assert.equal(S.isAvailable("biochemistry"), true);
  });
  test("[routes] every Physics tool has a deep link that round-trips; bare #/physics opens the Overview; junk is ignored", () => {
    for (const t of TOOLS) {
      const hash = S.routeHash({ subject: "physics", toolId: t.id });
      assert.equal(hash, `#/physics/${t.slug}`);
      assert.deepEqual(S.parseRoute(hash), { subject: "physics", toolId: t.id });
    }
    assert.deepEqual(S.parseRoute("#/physics"), { subject: "physics", toolId: "phOverview" });
    for (const bad of ["#/physics/nope", "#/physics/mechanics/extra", "#/Physics", "#/physics/<script>", "#/physics/gcKinetics"]) assert.equal(S.parseRoute(bad), null, bad);
  });
  test("[other subjects] Organic and General Chemistry tool lists and routes are unchanged", () => {
    assert.deepEqual(S.ORGANIC_TOOLS.map((t) => t.id), ["analysis", "acidBase", "spectroscopy", "conformations", "reactions", "multiStep", "multiCatalytic", "saved"]);
    assert.deepEqual(S.GENERAL_TOOLS.map((t) => t.id), ["gcOverview", "gcStoichiometry", "gcGas", "gcAcidBase", "gcEquilibrium", "gcKinetics", "gcThermo", "gcElectro", "gcSaved"]);
    assert.equal(S.routeHash({ subject: "general", toolId: "gcKinetics" }), "#/general/kinetics");
    assert.equal(S.routeHash({ subject: "organic", toolId: "multiStep" }), "#/organic/multi-step");
  });
  test("[overview] it lists only implemented tools with Open buttons; planned areas are labelled and have no button", () => {
    const overview = read("src", "components", "physics", "PhysicsOverview.tsx");
    for (const id of ["phMechanics", "phCircuits", "phRc"]) assert.match(overview, new RegExp(`${id}:`));
    const plannedBlock = overview.slice(overview.indexOf('title="Planned"'), overview.indexOf("<Callout"));
    for (const id of ["phForces", "phEnergy", "phCollisions"]) assert.match(overview, new RegExp(`${id}:`));
    assert.doesNotMatch(plannedBlock, /<button/);
    assert.match(plannedBlock, /Planned/);
    assert.deepEqual(S.getSubject("physics").planned, ["Rotational motion and torque", "Gravitation and orbits", "Thin-film interference and polarization", "Inductors and AC circuits"]);
  });
  test("[icons] every Physics tool icon exists in the icon set", () => {
    const icons = read("src", "components", "ui", "Icon.tsx");
    for (const t of S.PHYSICS_TOOLS) assert.match(icons, new RegExp(`\\n  ${t.icon}: "`), t.icon);
  });
});

describe("App wiring", () => {
  const app = read("src", "App.tsx");
  test("[app] every Physics page is lazily loaded and rendered with its own open request", () => {
    for (const [component, id, file] of [["MechanicsPage", "phMechanics", "MechanicsPage"], ["CircuitsPage", "phCircuits", "CircuitsPage"], ["RcPage", "phRc", "RcPage"]]) {
      assert.match(app, new RegExp(`const ${component} = lazy\\(\\(\\) => import\\("./components/physics/${file}"\\)\\)`));
      assert.match(app, new RegExp(`pendingOpen\\?\\.page === "${id}" \\? pendingOpen : null`));
    }
    assert.match(app, /activeSubject === "physics" \? \(/);
  });
  test("[app] a saved Physics record switches subject, keeps its open request, and a subject switch picks a tool of that subject", () => {
    assert.match(app, /target === "phMechanics" \|\| target === "phCircuits" \|\| target === "phRc"/);
    assert.match(app, /switchSubject\("physics", \{ keepOpenRequest: true, tool: target \}\)/);
    assert.match(app, /subjectTools\.some\(\(entry\) => entry\.id === generalTool\)/);
    assert.match(app, /onSelectSubject=\{\(id\) => switchSubject\(id\)\}/);
  });
  test("[library] the app library registers the Physics pages and maps each to its tool", () => {
    assert.equal(libApp.ANALYSIS_APP_PAGE.mechanics, "phMechanics");
    assert.equal(libApp.ANALYSIS_APP_PAGE.circuits, "phCircuits");
    assert.equal(libApp.ANALYSIS_APP_PAGE.rc, "phRc");
    for (const t of TOOLS) assert.ok(libApp.OPENABLE_ANALYSIS_PAGES.includes(t.page));
    const labels = read("src", "components", "SavedAnalysesPage.tsx");
    for (const label of ["Mechanics & motion", "DC circuits", "RC transient"]) assert.match(labels, new RegExp(label));
    assert.match(labels, /physics: "Physics"/);
  });
  test("[subject] the new pages belong to Physics; earlier pages keep their subjects", () => {
    for (const t of TOOLS) assert.equal(store.PAGE_SUBJECT[t.page], "physics");
    for (const page of ["equilibrium", "kinetics", "thermo", "genchem"]) assert.equal(store.PAGE_SUBJECT[page], "general");
    for (const page of ["synthesis", "properties", "reactions", "spectroscopy", "ranking", "multicatalytic", "conformations"]) assert.equal(store.PAGE_SUBJECT[page], "organic");
  });
  test("[loops] no animation loop is created outside the clock hook, which cleans up its frame and exists only while playing", () => {
    const sim = read("src", "components", "physics", "simHooks.ts");
    assert.match(sim, /requestAnimationFrame\(frame\)/);
    assert.match(sim, /cancelAnimationFrame\(raf\)/);
    assert.match(sim, /if \(!playing\) return undefined;/);
    for (const f of ["MechanicsPage", "CircuitsPage", "RcPage", "MotionDiagram", "CircuitDiagram", "RcDiagram"]) assert.doesNotMatch(read("src", "components", "physics", `${f}.tsx`), /requestAnimationFrame|setInterval/, f);
    assert.match(sim, /prefers-reduced-motion: reduce/);
  });
});

describe("strict validation of saved inputs", () => {
  test("[defaults] each tool's defaults validate and come back unchanged, with a summary", () => {
    for (const t of TOOLS) {
      const d = t.defaults();
      assert.deepEqual(t.validate(clone(d)), d, t.page);
      const s = t.summarize(d);
      assert.ok(s && s.headline.length > 0 && Number.isFinite(s.check), t.page);
      assert.deepEqual(PT.validatePhysicsResults(clone(s)), s, t.page);
      assert.equal(d.subject, "physics");
      assert.equal(d.tool, t.tool);
    }
  });
  test("[mechanics] wrong types, out-of-range launches and contradictory times are rejected, not coerced", () => {
    const base = PT.DEFAULT_MECHANICS_INPUTS;
    const bad = [
      null, [], "x", {}, { ...base, subject: "general" }, { ...base, tool: "rc" }, { ...base, mode: "orbit" }, { ...base, speed: "warp" },
      { ...base, projectile: { ...base.projectile, speed: -1 } }, { ...base, projectile: { ...base.projectile, angleDeg: 95 } },
      { ...base, projectile: { ...base.projectile, y0: -3 } }, { ...base, projectile: { ...base.projectile, g: 0 } }, { ...base, projectile: { ...base.projectile, speed: "20" } },
      { ...base, constant: { ...base.constant, ground: "yes" } }, { ...base, constant: { ...base.constant, duration: 0 } },
      { ...base, tNow: -0.1 }, { ...base, tNow: NaN }, { ...base, tNow: "1" },
      // contradictory: a selected time beyond the end of the flight
      { ...base, tNow: 1000 },
      { ...base, mode: "constant", constant: { ...base.constant, duration: 5 }, tNow: 6 },
    ];
    for (const v of bad) assert.equal(PT.validateMechanicsInputs(v), null, JSON.stringify(v).slice(0, 140));
  });
  test("[mechanics] a time exactly at the landing time is valid; the validator ignores extra fields", () => {
    const base = PT.DEFAULT_MECHANICS_INPUTS;
    const end = MECH.endTime(PT.mechanicsKinematics(base));
    assert.notEqual(PT.validateMechanicsInputs({ ...base, tNow: end }), null);
    const v = PT.validateMechanicsInputs({ ...base, extra: 1 });
    assert.deepEqual(Object.keys(v).sort(), ["constant", "mode", "projectile", "speed", "subject", "tNow", "tool"]);
  });
  test("[circuits] malformed, unsupported or contradictory circuits are rejected", () => {
    const base = PT.DEFAULT_CIRCUITS_INPUTS;
    const r = (id, ohms) => ({ kind: "resistor", id, label: id, ohms });
    const bad = [
      null, { ...base, subject: "general" }, { ...base, tool: "mechanics" },
      { ...base, circuit: { ...base.circuit, voltage: 0 } }, { ...base, circuit: { ...base.circuit, voltage: 5000 } }, { ...base, circuit: { ...base.circuit, voltage: "12" } },
      { ...base, circuit: { ...base.circuit, root: r("a", 0) } }, { ...base, circuit: { ...base.circuit, root: r("a", -5) } },
      { ...base, circuit: { ...base.circuit, root: { kind: "series", id: "s", children: [r("a", 1)] } } },
      { ...base, circuit: { ...base.circuit, root: { kind: "series", id: "s", children: [r("a", 1), r("a", 2)] } } },
      { ...base, circuit: { ...base.circuit, root: { kind: "bridge", id: "s", children: [r("a", 1), r("b", 2)] } } },
      { ...base, circuit: { ...base.circuit, root: { kind: "capacitor", id: "c", farads: 1 } } },
      { ...base, selected: "nope" }, { ...base, selected: 3 }, { ...base, selected: undefined },
    ];
    for (const v of bad) assert.equal(PT.validateCircuitsInputs(v), null, JSON.stringify(v).slice(0, 140));
    assert.notEqual(PT.validateCircuitsInputs({ ...base, selected: "r2" }), null);
    assert.notEqual(PT.validateCircuitsInputs({ ...base, selected: "g2" }), null);
  });
  test("[rc] bad values, unknown speeds and a time beyond the plotted span are rejected", () => {
    const base = PT.DEFAULT_RC_INPUTS;
    const bad = [
      null, { ...base, subject: "general" }, { ...base, tool: "circuits" }, { ...base, speed: "warp" },
      { ...base, rc: { ...base.rc, R: 0 } }, { ...base, rc: { ...base.rc, C: -1e-6 } }, { ...base, rc: { ...base.rc, Vs: 500 } }, { ...base, rc: { ...base.rc, spanTau: 4 } }, { ...base, rc: { ...base.rc, R: "10000" } },
      { ...base, tNow: -1 }, { ...base, tNow: 5.01 }, { ...base, tNow: NaN },
    ];
    for (const v of bad) assert.equal(PT.validateRcInputs(v), null, JSON.stringify(v).slice(0, 140));
    assert.notEqual(PT.validateRcInputs({ ...base, tNow: 5 }), null, "exactly 5 tau is the end of the window");
  });
  test("[results] damaged summaries are refused", () => {
    const s = SUM.summarizeRc(PT.DEFAULT_RC_INPUTS);
    for (const bad of [null, { ...s, check: "1" }, { ...s, check: Infinity }, { ...s, headline: [1] }, { ...s, engineVersion: 1.5 }, { ...s, checkLabel: 7 }]) assert.equal(PT.validatePhysicsResults(bad), null);
  });
});

describe("summaries and learning content come from the model", () => {
  test("[mechanics] the stored check number is the range (or the observation time when nothing lands) and matches the closed form", () => {
    const s = SUM.summarizeMechanics(PT.DEFAULT_MECHANICS_INPUTS);
    const a = (40 * Math.PI) / 180;
    const vy = 20 * Math.sin(a);
    const T = (vy + Math.sqrt(vy * vy + 2 * 9.81 * 2)) / 9.81;
    assert.ok(Math.abs(s.check - 20 * Math.cos(a) * T) < 1e-9);
    assert.equal(s.checkLabel, "range (m)");
    const free = SUM.summarizeMechanics({ ...PT.DEFAULT_MECHANICS_INPUTS, mode: "constant" });
    assert.equal(free.checkLabel, "observation time (s)");
    assert.equal(free.check, 10);
  });
  test("[circuits] the check number is the equivalent resistance; the headline lists every resistor", () => {
    const s = SUM.summarizeCircuits(PT.DEFAULT_CIRCUITS_INPUTS);
    assert.ok(Math.abs(s.check - 220) < 1e-9);
    assert.equal(s.headline.length, 3 + 3);
  });
  test("[rc] the check number is the time constant", () => {
    assert.ok(Math.abs(SUM.summarizeRc(PT.DEFAULT_RC_INPUTS).check - 1) < 1e-12);
  });
  test("[lessons] every lesson of every tool quotes finite numbers and never prints NaN or undefined", () => {
    const all = [
      ...LRN.mechanicsLessons(PT.DEFAULT_MECHANICS_INPUTS), ...LRN.mechanicsLessons({ ...PT.DEFAULT_MECHANICS_INPUTS, mode: "constant" }),
      ...LRN.mechanicsLessons({ ...PT.DEFAULT_MECHANICS_INPUTS, projectile: { ...PT.DEFAULT_MECHANICS_INPUTS.projectile, y0: 0, angleDeg: -30 } }),
      ...LRN.circuitLessons({ ...PT.DEFAULT_CIRCUITS_INPUTS, selected: "r2" }), ...LRN.circuitLessons({ ...PT.DEFAULT_CIRCUITS_INPUTS, circuit: { voltage: 5, root: { kind: "resistor", id: "r1", label: "R1", ohms: 10 } } }),
      ...LRN.rcLessons(PT.DEFAULT_RC_INPUTS), ...LRN.rcLessons({ ...PT.DEFAULT_RC_INPUTS, rc: { ...PT.DEFAULT_RC_INPUTS.rc, Vs: 0, V0: 9 } }),
    ];
    assert.ok(all.length >= 14);
    for (const l of all) for (const p of l.body) assert.doesNotMatch(p, /NaN|undefined|Infinity/, `${l.id}: ${p}`);
  });
  test("[practice] each scenario's reported trend is the model's: independent recomputation for hand-checkable cases", () => {
    const mech = PT.DEFAULT_MECHANICS_INPUTS;
    const byId = (list, id) => list.find((s) => s.id === id);
    const sc = LRN.mechanicsScenarios(mech);
    // doubling gravity halves the rise above the launch point: (vy^2)/(2g)
    const g2 = byId(sc, "gravity-double");
    const before = g2.measure(mech);
    const after = g2.measure(g2.apply(mech));
    const vy = 20 * Math.sin((40 * Math.PI) / 180);
    assert.ok(Math.abs(before - (2 + (vy * vy) / (2 * 9.81))) < 1e-9);
    assert.ok(Math.abs(after - (2 + (vy * vy) / (2 * 19.62))) < 1e-9);
    // RC: doubling C leaves the initial current alone
    const rc = PT.DEFAULT_RC_INPUTS;
    const c2 = byId(LRN.rcScenarios(rc), "c-double-i0");
    assert.equal(c2.measure(rc), c2.measure(c2.apply(rc)));
    // circuits: doubling the source voltage quadruples the power
    const circ = PT.DEFAULT_CIRCUITS_INPUTS;
    const v2 = byId(LRN.circuitScenarios(circ), "v-double");
    assert.ok(Math.abs(v2.measure(v2.apply(circ)) / v2.measure(circ) - 4) < 1e-12);
    // circuits: adding a parallel resistor always raises the source current
    const par = byId(LRN.circuitScenarios(circ), "add-parallel");
    assert.ok(par.measure(par.apply(circ)) > par.measure(circ));
  });
  test("[practice] scenarios whose change would leave the supported range are dropped or return null, never invalid inputs", () => {
    const edge = { ...PT.DEFAULT_MECHANICS_INPUTS, projectile: { ...PT.DEFAULT_MECHANICS_INPUTS.projectile, speed: 1000, g: 0.1, y0: 9990, angleDeg: 90 } };
    for (const s of LRN.mechanicsScenarios(edge)) { const next = s.apply(edge); if (next) assert.notEqual(PT.validateMechanicsInputs({ ...next, tNow: 0 }), null, s.id); }
    const rc = { ...PT.DEFAULT_RC_INPUTS, rc: { ...PT.DEFAULT_RC_INPUTS.rc, Vs: 100, V0: 100, R: 1e9, C: 1e-3 } };
    for (const s of LRN.rcScenarios(rc)) assert.notEqual(PT.validateRcInputs(s.apply(rc)), null, s.id);
  });
});

describe("saved-analysis round trips", () => {
  const variants = () => [
    { t: TOOLS[0], value: PT.DEFAULT_MECHANICS_INPUTS },
    ...["real", "quarter", "fast", "fit"].map((speed) => ({ t: TOOLS[0], value: { ...PT.DEFAULT_MECHANICS_INPUTS, speed, tNow: 1.25 } })),
    { t: TOOLS[0], value: { ...PT.DEFAULT_MECHANICS_INPUTS, mode: "constant", tNow: 7 } },
    { t: TOOLS[0], value: { ...PT.DEFAULT_MECHANICS_INPUTS, projectile: { x0: -50, y0: 0, speed: 0, angleDeg: 0, g: 3.71 }, tNow: 0 } },
    { t: TOOLS[0], value: { ...PT.DEFAULT_MECHANICS_INPUTS, projectile: { x0: 0, y0: 45, speed: 15, angleDeg: -90, g: 24.8 }, tNow: 0.5 } },
    ...X.CIRCUIT_PRESETS.map((p) => ({ t: TOOLS[1], value: { ...PT.DEFAULT_CIRCUITS_INPUTS, circuit: p.circuit, selected: X.resistorsOf(p.circuit.root)[0].id } })),
    { t: TOOLS[1], value: { ...PT.DEFAULT_CIRCUITS_INPUTS, selected: "g2" } },
    { t: TOOLS[2], value: PT.DEFAULT_RC_INPUTS },
    ...[[0, 9], [9, 0], [12, 3], [-5, 5], [4, 4]].map(([Vs, V0]) => ({ t: TOOLS[2], value: { ...PT.DEFAULT_RC_INPUTS, rc: { ...PT.DEFAULT_RC_INPUTS.rc, Vs, V0 }, tNow: 2.5 } })),
    ...[3, 7, 10].map((spanTau) => ({ t: TOOLS[2], value: { ...PT.DEFAULT_RC_INPUTS, rc: { ...PT.DEFAULT_RC_INPUTS.rc, spanTau }, tNow: 3 } })),
  ];
  test("[save/open] every tool and mode saves with its subject and reopens with identical inputs and the same recomputed summary", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    for (const { t, value } of variants()) {
      const results = t.summarize(value);
      assert.ok(results, `${t.page} ${JSON.stringify(value).slice(0, 60)}`);
      const saved = ok(await real.save(t.page, { name: `${t.page} analysis`, summary: t.describe(value), inputs: value, results: { computedAt: "2026-11-12T00:00:00.000Z", engineVersion: t.engine(), stale: false, status: "complete", data: results } }));
      assert.equal(saved.subject, "physics");
      const raw = JSON.parse(backend.map.get(saved.id));
      assert.equal(raw.page, t.page);
      assert.equal(raw.inputs.subject, "physics");
      const opened = ok(await real.open(saved.id));
      assert.deepEqual(opened.inputs, value);
      assert.equal(opened.resultsDropped, false);
      const fresh = t.summarize(opened.inputs);
      assert.deepEqual(fresh, results, "results are deterministic from the inputs");
      assert.equal(opened.results.data.check, fresh.check);
    }
    const list = ok(await real.list());
    assert.equal(list.problems.length, 0);
    assert.ok(list.items.every((i) => i.subject === "physics"));
  });
  test("[autosave store] each new page has its own workspace key", () => {
    const keys = ["mechanics", "circuits", "rc", "equilibrium", "genchem"].map((p) => store.WorkspaceStore.key(p));
    assert.equal(new Set(keys).size, 5);
  });
  test("[existing records] General Chemistry and Organic records written before Stage 13 still open, beside Physics records", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    const g = GW.DEFAULT_GENCHEM_INPUTS;
    const GSUM = await loadModule("/src/utils/generalChem/summary.ts");
    const gr = GSUM.summarize(g);
    const saved = ok(await real.save("genchem", { name: "Acetic acid", summary: GW.describeGenChemAnalysis(g, gr), inputs: g, results: null }));
    const eq = ok(await real.save("equilibrium", { name: "eq", summary: "s", inputs: TW.DEFAULT_EQUILIBRIUM_INPUTS, results: null }));
    ok(await real.save("mechanics", { name: "m", summary: "s", inputs: PT.DEFAULT_MECHANICS_INPUTS, results: null }));
    assert.deepEqual(ok(await real.open(saved.id)).inputs, g);
    assert.equal(ok(await real.open(eq.id)).record.subject, "general");
    const conf = { source: { kind: "smiles", text: "CC1CCCCC1" }, mode: "chair", chair: { ring: [1, 2, 3, 4, 5, 6], flipped: false, choices: {} }, torsion: { front: null, rear: null, frontRef: null, rearRef: null, rotation: 0 }, comparison: [] };
    const CW = await loadModule("/src/utils/persistence/conformationsWorkspace.ts");
    const real2 = new lib.AnalysisLibrary(backend, { validators: { ...validators(), conformations: { engineVersion: CW.CONFORMATIONS_ENGINE_VERSION, validateInputs: CW.validateConformationsInputs, validateResults: CW.validateConformationsResults } }, newId: () => "legacy000013" });
    const c = ok(await real2.save("conformations", { name: "legacy", summary: "s", inputs: conf, results: null }));
    const rawC = JSON.parse(backend.map.get(c.id)); delete rawC.subject; backend.map.set(c.id, JSON.stringify(rawC));
    const list = ok(await real2.list());
    assert.equal(list.problems.length, 0, JSON.stringify(list.problems));
    assert.equal(list.items.find((i) => i.id === c.id).subject, "organic");
    assert.equal(list.items.filter((i) => i.subject === "physics").length, 1);
    assert.equal(list.items.filter((i) => i.subject === "general").length, 2);
  });
  test("[integrity] a Physics record claiming the wrong subject, or carrying contradictory or invalid inputs, is damaged and never opened", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    const a = ok(await real.save("rc", { name: "rc", summary: "s", inputs: PT.DEFAULT_RC_INPUTS, results: null }));
    const rawA = JSON.parse(backend.map.get(a.id)); rawA.subject = "general"; backend.map.set(a.id, JSON.stringify(rawA));
    const b = ok(await real.save("circuits", { name: "c", summary: "s", inputs: PT.DEFAULT_CIRCUITS_INPUTS, results: null }));
    const rawB = JSON.parse(backend.map.get(b.id)); rawB.inputs.selected = "ghost"; backend.map.set(b.id, JSON.stringify(rawB));
    const m = ok(await real.save("mechanics", { name: "m", summary: "s", inputs: PT.DEFAULT_MECHANICS_INPUTS, results: null }));
    const rawM = JSON.parse(backend.map.get(m.id)); rawM.inputs.tNow = 9999; backend.map.set(m.id, JSON.stringify(rawM));
    const d = ok(await real.save("circuits", { name: "d", summary: "s", inputs: PT.DEFAULT_CIRCUITS_INPUTS, results: null }));
    const rawD = JSON.parse(backend.map.get(d.id)); rawD.inputs.circuit.root.children[0].ohms = 0; backend.map.set(d.id, JSON.stringify(rawD));
    const list = ok(await real.list());
    assert.ok(list.problems.length >= 1);
    for (const id of [a.id, b.id, m.id, d.id]) assert.equal((await real.open(id)).ok, false, id);
  });
  test("[model change] a record whose saved check disagrees with the recomputed one is detectable", () => {
    const rc = PT.DEFAULT_RC_INPUTS;
    const s = SUM.summarizeRc(rc);
    const stale = { ...s, check: s.check * 1.5 };
    assert.ok(Math.abs(stale.check - SUM.summarizeRc(rc).check) > 1e-6 * Math.max(1, Math.abs(stale.check)));
  });
});
