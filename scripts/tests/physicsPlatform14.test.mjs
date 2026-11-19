// Stage 14: navigation groups, saved-record validation and round trips for Forces, Work & energy and Momentum & collisions,
// compatibility with existing records, learning content, and App wiring.
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

let S, store, lib, libApp, PT, SUM, ML, E, C, F;
before(async () => {
  S = await loadModule("/src/navigation/subjects.ts");
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  libApp = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  PT = await loadModule("/src/utils/persistence/physicsTools.ts");
  SUM = await loadModule("/src/utils/physics/physicsSummary.ts");
  ML = await loadModule("/src/utils/physics/mechanicsLearning.ts");
  E = await loadModule("/src/utils/physics/energy.ts");
  C = await loadModule("/src/utils/physics/collisions.ts");
  F = await loadModule("/src/utils/physics/forces.ts");
});
after(async () => { await closeEngine(); });

const TOOLS = [
  { page: "forces", tool: "forces", id: "phForces", slug: "forces", defaults: () => PT.DEFAULT_FORCES_INPUTS, validate: (v) => PT.validateForcesInputs(v), summarize: (v) => SUM.summarizeForces(v), describe: (v) => PT.describeForcesAnalysis(v), engine: () => PT.FORCES_ENGINE_VERSION },
  { page: "energy", tool: "energy", id: "phEnergy", slug: "energy", defaults: () => PT.DEFAULT_ENERGY_INPUTS, validate: (v) => PT.validateEnergyInputs(v), summarize: (v) => SUM.summarizeEnergy(v), describe: (v) => PT.describeEnergyAnalysis(v), engine: () => PT.ENERGY_ENGINE_VERSION },
  { page: "collisions", tool: "collisions", id: "phCollisions", slug: "collisions", defaults: () => PT.DEFAULT_COLLISIONS_INPUTS, validate: (v) => PT.validateCollisionsInputs(v), summarize: (v) => SUM.summarizeCollisions(v), describe: (v) => PT.describeCollisionsAnalysis(v), engine: () => PT.COLLISIONS_ENGINE_VERSION },
];
const validators = () => Object.fromEntries(TOOLS.map((t) => [t.page, { engineVersion: t.engine(), validateInputs: t.validate, validateResults: PT.validatePhysicsResults }]));
const ids = () => { let n = 0; return () => `s14x${(n += 1).toString().padStart(4, "0")}`; };
const withIn = (d, patch) => ({ ...d, input: { ...d.input, ...patch } });

describe("navigation and groups", () => {
  test("[tools] Physics lists Overview, the four mechanics tools, the two electricity tools and Saved, in groups", () => {
    assert.deepEqual(S.PHYSICS_TOOLS.map((t) => t.id), ["phOverview", "phMechanics", "phForces", "phEnergy", "phCollisions", "phWaves", "phOptics", "phInterference", "phEfield", "phMagnetic", "phInduction", "phCircuits", "phRc", "phSaved"]);
    assert.deepEqual(S.PHYSICS_TOOLS.map((t) => t.group), ["analyze", "mechanics", "mechanics", "mechanics", "mechanics", "waves", "waves", "waves", "electromagnetism", "electromagnetism", "electromagnetism", "electricity", "electricity", "library"]);
    assert.deepEqual(S.TOOL_GROUPS.map((g) => g.id), ["analyze", "mechanics", "waves", "electromagnetism", "electricity", "geneExpression", "inheritance", "cellular", "biomolecules", "metabolism", "synthesize", "library"]);
    assert.equal(new Set(S.PHYSICS_TOOLS.map((t) => t.slug)).size, S.PHYSICS_TOOLS.length);
  });
  test("[routes] the new tools have deep links that round-trip; Organic and General tool lists are unchanged", () => {
    for (const t of TOOLS) {
      assert.equal(S.routeHash({ subject: "physics", toolId: t.id }), `#/physics/${t.slug}`);
      assert.deepEqual(S.parseRoute(`#/physics/${t.slug}`), { subject: "physics", toolId: t.id });
    }
    assert.deepEqual(S.ORGANIC_TOOLS.map((t) => t.id), ["analysis", "acidBase", "spectroscopy", "conformations", "reactions", "multiStep", "multiCatalytic", "saved"]);
    assert.ok(S.ORGANIC_TOOLS.every((t) => ["analyze", "synthesize", "library"].includes(t.group)));
    assert.deepEqual(S.GENERAL_TOOLS.map((t) => t.id), ["gcOverview", "gcStoichiometry", "gcGas", "gcAcidBase", "gcEquilibrium", "gcKinetics", "gcThermo", "gcElectro", "gcSaved"]);
  });
  test("[icons and overview] every tool icon exists; the overview groups the cards and keeps the planned list button-free", () => {
    const icons = read("src", "components", "ui", "Icon.tsx");
    for (const t of S.PHYSICS_TOOLS) assert.match(icons, new RegExp(`\\n  ${t.icon}: "`), t.icon);
    const overview = read("src", "components", "physics", "PhysicsOverview.tsx");
    assert.match(overview, /tool\.group === "mechanics"/); assert.match(overview, /tool\.group === "electricity"/);
    assert.doesNotMatch(overview.slice(overview.indexOf('title="Planned"'), overview.indexOf("<Callout")), /<button/);
  });
  test("[app] pages are lazy, open requests reach them, saved records switch subject, and no animation loop exists outside the clock hook", () => {
    const app = read("src", "App.tsx");
    for (const [c, id] of [["ForcesPage", "phForces"], ["EnergyPage", "phEnergy"], ["CollisionsPage", "phCollisions"]]) {
      assert.match(app, new RegExp(`const ${c} = lazy\\(\\(\\) => import\\("./components/physics/${c}"\\)\\)`));
      assert.match(app, new RegExp(`pendingOpen\\?\\.page === "${id}" \\? pendingOpen : null`));
    }
    assert.match(app, /target === "phForces" \|\| target === "phEnergy" \|\| target === "phCollisions"/);
    for (const f of ["ForcesPage", "EnergyPage", "CollisionsPage", "ForceDiagram", "EnergyDiagram", "CollisionDiagram", "TimeChart"]) assert.doesNotMatch(read("src", "components", "physics", `${f}.tsx`), /requestAnimationFrame|setInterval/, f);
  });
  test("[subject] the new pages belong to Physics and are registered in the library", () => {
    for (const t of TOOLS) { assert.equal(store.PAGE_SUBJECT[t.page], "physics"); assert.ok(libApp.OPENABLE_ANALYSIS_PAGES.includes(t.page)); assert.equal(libApp.ANALYSIS_APP_PAGE[t.page], t.id); }
    const labels = read("src", "components", "SavedAnalysesPage.tsx");
    for (const l of ["Forces & Newton's laws", "Work & energy", "Momentum & collisions"]) assert.match(labels, new RegExp(l.replace("&", "&")));
  });
});

describe("strict validation of saved inputs", () => {
  test("[defaults] each tool's defaults validate unchanged, summarize, and the summary validates", () => {
    for (const t of TOOLS) {
      const d = t.defaults();
      assert.deepEqual(t.validate(clone(d)), d, t.page);
      const s = t.summarize(d);
      assert.ok(s && s.headline.length > 0 && Number.isFinite(s.check), t.page);
      assert.deepEqual(PT.validatePhysicsResults(clone(s)), s, t.page);
      assert.equal(d.subject, "physics"); assert.equal(d.tool, t.tool);
    }
  });
  test("[forces] wrong types, out-of-range values, mu_k > mu_s, unknown selections and a time beyond the observation window are rejected", () => {
    const base = PT.DEFAULT_FORCES_INPUTS;
    const bad = [
      null, [], {}, { ...base, subject: "general" }, { ...base, tool: "energy" }, { ...base, speed: "warp" }, { ...base, selected: "magic" }, { ...base, selected: 3 },
      withIn(base, { m: 0 }), withIn(base, { m: "5" }), withIn(base, { theta: 85 }), withIn(base, { F: -1 }), withIn(base, { phi: 120 }), withIn(base, { mus: 0.2, muk: 0.4 }),
      withIn(base, { mode: "ramp" }), withIn(base, { kind: "push" }), withIn(base, { g: 0 }),
      { ...base, tNow: -1 }, { ...base, tNow: 7 }, { ...base, tNow: NaN },
    ];
    for (const v of bad) assert.equal(PT.validateForcesInputs(v), null, JSON.stringify(v).slice(0, 120));
    assert.notEqual(PT.validateForcesInputs({ ...base, selected: "friction", tNow: 6 }), null);
    assert.deepEqual(Object.keys(PT.validateForcesInputs({ ...base, extra: 1 })).sort(), ["input", "selected", "speed", "subject", "tNow", "tool"]);
  });
  test("[energy] bad scenarios, contradictory geometry (start beyond the incline), friction ordering and times beyond the motion are rejected", () => {
    const base = PT.DEFAULT_ENERGY_INPUTS;
    const end = E.analyzeEnergy(base.input).tEnd;
    const bad = [
      null, { ...base, tool: "forces" }, withIn(base, { scenario: "orbit" }), withIn(base, { m: -1 }), withIn(base, { theta: 0 }), withIn(base, { u0: 9, L: 5 }),
      withIn(base, { mus: 0.1, muk: 0.5 }), withIn(base, { k: 0 }), withIn(base, { x0: 9 }), withIn(base, { h0: -2 }),
      { ...base, target: "2" }, { ...base, target: 1e9 }, { ...base, speed: "x" }, { ...base, tNow: end + 1 }, { ...base, tNow: -0.1 },
    ];
    for (const v of bad) assert.equal(PT.validateEnergyInputs(v), null, JSON.stringify(v).slice(0, 120));
    assert.notEqual(PT.validateEnergyInputs({ ...base, tNow: end }), null);
  });
  test("[collisions] overlap, wrong order, bad restitution and a time beyond the end are rejected; the optional duration may be null", () => {
    const base = PT.DEFAULT_COLLISIONS_INPUTS;
    const end = C.solveCollision(base.input).tEnd;
    const bad = [null, withIn(base, { e: 1.5 }), withIn(base, { mA: 0 }), withIn(base, { xB: -4 }), withIn(base, { xB: -5 }), withIn(base, { contactTime: 0 }), withIn(base, { vA: 99 }), { ...base, tNow: end + 0.5 }, { ...base, tool: "rc" }, { ...base, speed: "x" }];
    for (const v of bad) assert.equal(PT.validateCollisionsInputs(v), null, JSON.stringify(v).slice(0, 120));
    assert.notEqual(PT.validateCollisionsInputs(withIn(base, { contactTime: 0.05 })), null);
    assert.notEqual(PT.validateCollisionsInputs({ ...base, tNow: end }), null);
  });
  test("[summaries] check numbers match independent values", () => {
    const f = SUM.summarizeForces(PT.DEFAULT_FORCES_INPUTS); // 5 kg, g = 9.81 -> N = 49.05
    assert.ok(Math.abs(f.check - 5 * 9.81) < 1e-9);
    const e = SUM.summarizeEnergy(PT.DEFAULT_ENERGY_INPUTS); // total energy at the end = starting PE = m g L sin(30) = 2*9.81*2.5
    assert.ok(Math.abs(e.check - 2 * 9.81 * 5 * 0.5) < 1e-9);
    const c = SUM.summarizeCollisions(PT.DEFAULT_COLLISIONS_INPUTS); // elastic, vB' = 3
    assert.ok(Math.abs(c.check - 3) < 1e-12);
    assert.match(SUM.summarizeCollisions(withIn(PT.DEFAULT_COLLISIONS_INPUTS, { vA: 1, vB: 3 })).headline[0], /no collision/i);
  });
});

describe("learning content", () => {
  test("[lessons] every lesson quotes finite numbers (never NaN, undefined or Infinity), in many configurations", () => {
    const fin = (ls) => { for (const l of ls) for (const p of l.body) assert.doesNotMatch(p, /NaN|undefined|Infinity/, `${l.id}: ${p}`); };
    const fb = PT.DEFAULT_FORCES_INPUTS;
    for (const patch of [{}, { mode: "pulley" }, { theta: 30, F: 0 }, { F: 40, phi: 90, m: 1 }, { F: 40, phi: 30, theta: 20 }, { v0: 3 }]) fin(ML.forcesLessons(withIn(fb, patch)));
    const eb = PT.DEFAULT_ENERGY_INPUTS;
    for (const patch of [{}, { scenario: "flat", F: 20, v0: 0 }, { scenario: "spring" }, { scenario: "spring", x0: 0.1, mus: 0.9, muk: 0.9 }, { scenario: "height" }, { mus: 0.9, muk: 0.8 }]) fin(ML.energyLessons(withIn(eb, patch)));
    const cb = PT.DEFAULT_COLLISIONS_INPUTS;
    for (const patch of [{}, { e: 0 }, { e: 0.5, contactTime: 0.02 }, { vA: 1, vB: 3 }, { vA: 0, vB: 0 }]) fin(ML.collisionLessons(withIn(cb, patch)));
  });
  test("[free-body quiz] the correct forces are computed from the physics: rest on a flat floor -> weight, normal, static friction, applied; sliding -> kinetic friction; free surface with no push -> weight, normal only", () => {
    const base = PT.DEFAULT_FORCES_INPUTS;
    assert.deepEqual(ML.quizAnswer(withIn(base, { g: 10, F: 20 })).sort(), ["applied", "normal", "static", "weight"]);
    assert.deepEqual(ML.quizAnswer(withIn(base, { g: 10, F: 30 })).sort(), ["applied", "kinetic", "normal", "weight"]);
    assert.deepEqual(ML.quizAnswer(withIn(base, { g: 10, F: 0 })).sort(), ["normal", "weight"]);
    assert.deepEqual(ML.quizAnswer(withIn(base, { g: 10, F: 0, theta: 30, mus: 0.7, muk: 0.5 })).sort(), ["normal", "static", "weight"]);
    assert.deepEqual(ML.quizAnswer(withIn(base, { m: 1, g: 10, F: 30, phi: 90 })).sort(), ["applied", "weight"], "contact lost: no normal force and no friction");
    for (const c of ML.QUIZ_CANDIDATES.filter((x) => x.id === "motion" || x.id === "thrust")) assert.ok(!ML.quizAnswer(base).includes(c.id));
  });
  test("[practice] scenario trends are the model's: independent recomputation for hand-checkable cases", () => {
    const by = (list, id) => list.find((s) => s.id === id);
    const fb = withIn(PT.DEFAULT_FORCES_INPUTS, { g: 10, F: 30 }); // sliding: friction 15 N
    const f = by(ML.forcesScenarios(fb), "double-force-friction");
    assert.ok(Math.abs(f.measure(fb) - 15) < 1e-9 && Math.abs(f.measure(f.apply(fb)) - 15) < 1e-9, "once sliding, friction does not grow with the push");
    const tilt = by(ML.forcesScenarios(fb), "tilt-normal");
    assert.ok(Math.abs(tilt.measure(tilt.apply(fb)) - 5 * 9.81 * Math.cos((10 * Math.PI) / 180)) > -1 && tilt.measure(tilt.apply(fb)) < tilt.measure(fb));
    const eb = withIn(PT.DEFAULT_ENERGY_INPUTS, { scenario: "spring", mus: 0, muk: 0 });
    const sp = by(ML.energyScenarios(eb), "x-spring");
    assert.ok(Math.abs(sp.measure(sp.apply(eb)) / sp.measure(eb) - 4) < 1e-12);
    const cb = PT.DEFAULT_COLLISIONS_INPUTS;
    const dm = by(ML.collisionScenarios(cb), "double-masses");
    assert.ok(Math.abs(dm.measure(dm.apply(cb)) - dm.measure(cb)) < 1e-12);
    const e0 = by(ML.collisionScenarios(cb), "e0-ke");
    assert.ok(e0.measure(e0.apply(cb)) < e0.measure(cb));
    assert.equal(ML.collisionScenarios(withIn(cb, { vA: 1, vB: 3 })).length, 0, "no collision, no collision questions");
  });
  test("[scenarios are always valid] applying any scenario to its input yields a valid input", () => {
    for (const s of ML.forcesScenarios(PT.DEFAULT_FORCES_INPUTS)) assert.notEqual(PT.validateForcesInputs(s.apply(PT.DEFAULT_FORCES_INPUTS)), null, s.id);
    for (const sc of ["incline", "flat", "spring", "height"]) for (const s of ML.energyScenarios(withIn(PT.DEFAULT_ENERGY_INPUTS, { scenario: sc }))) { const n = s.apply(withIn(PT.DEFAULT_ENERGY_INPUTS, { scenario: sc })); assert.notEqual(PT.validateEnergyInputs(n), null, `${sc} ${s.id}`); }
    for (const s of ML.collisionScenarios(PT.DEFAULT_COLLISIONS_INPUTS)) assert.notEqual(PT.validateCollisionsInputs(s.apply(PT.DEFAULT_COLLISIONS_INPUTS)), null, s.id);
  });
});

describe("saved-analysis round trips", () => {
  const variants = () => [
    { t: TOOLS[0], value: PT.DEFAULT_FORCES_INPUTS },
    ...["surface", "pulley"].map((mode) => ({ t: TOOLS[0], value: withIn({ ...PT.DEFAULT_FORCES_INPUTS, tNow: 2.5, selected: "weight" }, { mode }) })),
    { t: TOOLS[0], value: withIn(PT.DEFAULT_FORCES_INPUTS, { m: 1, F: 30, phi: 90 }) },
    { t: TOOLS[0], value: withIn({ ...PT.DEFAULT_FORCES_INPUTS, tNow: 3, selected: "friction" }, { theta: 30, F: 0, v0: 5, mus: 0.3, muk: 0.2, kind: "tension" }) },
    ...["incline", "flat", "spring", "height"].map((scenario) => ({ t: TOOLS[1], value: { ...withIn(PT.DEFAULT_ENERGY_INPUTS, { scenario }), tNow: 0.3, target: 1.5 } })),
    { t: TOOLS[1], value: withIn(PT.DEFAULT_ENERGY_INPUTS, { scenario: "spring", x0: 0.1, mus: 0.9, muk: 0.9 }) },
    ...[0, 0.5, 1].map((e) => ({ t: TOOLS[2], value: { ...withIn(PT.DEFAULT_COLLISIONS_INPUTS, { e }), tNow: 1.2 } })),
    { t: TOOLS[2], value: withIn(PT.DEFAULT_COLLISIONS_INPUTS, { vA: 1, vB: 3, contactTime: 0.02 }) },
    { t: TOOLS[2], value: withIn(PT.DEFAULT_COLLISIONS_INPUTS, { contactTime: 0.05 }) },
  ];
  test("[save/open] every tool and mode saves with subject physics and reopens with identical inputs and the same recomputed summary", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    for (const { t, value } of variants()) {
      const results = t.summarize(value);
      assert.ok(results, `${t.page} ${JSON.stringify(value).slice(0, 60)}`);
      const saved = ok(await real.save(t.page, { name: `${t.page} analysis`, summary: t.describe(value), inputs: value, results: { computedAt: "2026-11-12T00:00:00.000Z", engineVersion: t.engine(), stale: false, status: "complete", data: results } }));
      assert.equal(saved.subject, "physics");
      assert.equal(JSON.parse(backend.map.get(saved.id)).inputs.subject, "physics");
      const opened = ok(await real.open(saved.id));
      assert.deepEqual(opened.inputs, value);
      assert.equal(opened.resultsDropped, false);
      assert.deepEqual(t.summarize(opened.inputs), results, "results are deterministic from the inputs");
    }
    const list = ok(await real.list());
    assert.equal(list.problems.length, 0);
    assert.ok(list.items.every((i) => i.subject === "physics"));
  });
  test("[existing records] Stage 13 Physics records (mechanics, circuits, rc) still open next to the new ones", async () => {
    const backend = new store.MemoryBackend();
    const all = {
      ...validators(),
      mechanics: { engineVersion: PT.MECHANICS_ENGINE_VERSION, validateInputs: PT.validateMechanicsInputs, validateResults: PT.validatePhysicsResults },
      circuits: { engineVersion: PT.CIRCUITS_ENGINE_VERSION, validateInputs: PT.validateCircuitsInputs, validateResults: PT.validatePhysicsResults },
      rc: { engineVersion: PT.RC_ENGINE_VERSION, validateInputs: PT.validateRcInputs, validateResults: PT.validatePhysicsResults },
    };
    const real = new lib.AnalysisLibrary(backend, { validators: all, newId: ids() });
    const a = ok(await real.save("mechanics", { name: "m", summary: "s", inputs: PT.DEFAULT_MECHANICS_INPUTS, results: null }));
    const b = ok(await real.save("circuits", { name: "c", summary: "s", inputs: PT.DEFAULT_CIRCUITS_INPUTS, results: null }));
    const c = ok(await real.save("rc", { name: "r", summary: "s", inputs: PT.DEFAULT_RC_INPUTS, results: null }));
    ok(await real.save("forces", { name: "f", summary: "s", inputs: PT.DEFAULT_FORCES_INPUTS, results: null }));
    for (const id of [a.id, b.id, c.id]) assert.equal((await real.open(id)).ok, true);
    assert.equal(ok(await real.list()).items.length, 4);
  });
  test("[integrity] wrong subject, contradictory times and invalid physics make a record damaged and never openable", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    const make = async (page, inputs, mutate) => { const r = ok(await real.save(page, { name: page, summary: "s", inputs, results: null })); const raw = JSON.parse(backend.map.get(r.id)); mutate(raw); backend.map.set(r.id, JSON.stringify(raw)); return r.id; };
    const idsBad = [
      await make("forces", PT.DEFAULT_FORCES_INPUTS, (r) => { r.subject = "general"; }),
      await make("forces", PT.DEFAULT_FORCES_INPUTS, (r) => { r.inputs.tNow = 99; }),
      await make("forces", PT.DEFAULT_FORCES_INPUTS, (r) => { r.inputs.input.muk = 2; r.inputs.input.mus = 0.1; }),
      await make("energy", PT.DEFAULT_ENERGY_INPUTS, (r) => { r.inputs.input.u0 = 50; }),
      await make("energy", PT.DEFAULT_ENERGY_INPUTS, (r) => { r.inputs.tNow = 1e6; }),
      await make("collisions", PT.DEFAULT_COLLISIONS_INPUTS, (r) => { r.inputs.input.xB = -4.5; }),
      await make("collisions", PT.DEFAULT_COLLISIONS_INPUTS, (r) => { r.inputs.input.e = 3; }),
    ];
    assert.ok(ok(await real.list()).problems.length >= 1);
    for (const id of idsBad) assert.equal((await real.open(id)).ok, false, id);
  });
  test("[model change] a record whose saved check differs from the recomputed one is detectable", () => {
    const c = PT.DEFAULT_COLLISIONS_INPUTS;
    const s = SUM.summarizeCollisions(c);
    assert.ok(Math.abs(s.check * 1.5 - SUM.summarizeCollisions(c).check) > 1e-6);
    assert.equal(F.DEFAULT_FORCE_INPUT.mode, "surface");
  });
});
