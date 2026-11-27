// Stage 24: platform wiring, strict persistence, learning content, summaries and the save/open round trip for Electric fields &
// potential, Magnetic fields & forces and Electromagnetic induction. Every expected number is derived by hand from the textbook
// formula (not by calling the function under test); challenge solutions are built from the stated worked solutions and must
// satisfy the pure checks, and the defaults must not satisfy any challenge.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
let S, P, EL, MG, IN, LRN, SUM, PR, CI, REL, Q, LIB, STORE, APP, DW, E0, M0, I0;
before(async () => {
  S = await loadModule("/src/navigation/subjects.ts");
  P = await loadModule("/src/utils/persistence/physicsTools24.ts");
  EL = await loadModule("/src/utils/physics/electrostatics.ts");
  MG = await loadModule("/src/utils/physics/magnetism.ts");
  IN = await loadModule("/src/utils/physics/induction.ts");
  LRN = await loadModule("/src/utils/physics/electromagnetismLearning.ts");
  SUM = await loadModule("/src/utils/physics/electromagnetismSummary.ts");
  PR = await loadModule("/src/utils/generalChem/predict.ts");
  CI = await loadModule("/src/utils/concepts/conceptIndex.ts");
  REL = await loadModule("/src/utils/concepts/relations.ts");
  Q = await loadModule("/src/utils/concepts/search.ts");
  LIB = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  STORE = await loadModule("/src/utils/persistence/workspaceStore.ts");
  APP = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  DW = await loadModule("/src/utils/physics/directionWords.ts");
  E0 = P.DEFAULT_EFIELD_INPUTS; M0 = P.DEFAULT_MAGNETIC_INPUTS; I0 = P.DEFAULT_INDUCTION_INPUTS;
});
after(async () => { await closeEngine(); });

const clone = (x) => JSON.parse(JSON.stringify(x));
const near = (a, b, tol, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);
const rel = (a, b, r = 1e-9, msg = "") => assert.ok(Math.abs(a - b) <= r * Math.max(Math.abs(a), Math.abs(b), 1e-300), `${msg} ${a} vs ${b}`);
const NEW_TOOLS = ["phEfield", "phMagnetic", "phInduction"];
const PAGES = [["efield", "phEfield", "EfieldPage"], ["magnetic", "phMagnetic", "MagneticPage"], ["induction", "phInduction", "InductionPage"]];
const K = 8.9875517923e9, MU0 = 1.25663706212e-6, E = 1.602176634e-19, MP = 1.67262192369e-27;

describe("navigation and wiring", () => {
  test("[tools] three Electromagnetism tools sit between Waves & optics and Electricity, with unique slugs and round-tripping routes", () => {
    const ids = S.PHYSICS_TOOLS.map((t) => t.id);
    assert.deepEqual(ids.slice(8, 11), NEW_TOOLS);
    for (const id of NEW_TOOLS) assert.equal(S.PHYSICS_TOOLS.find((t) => t.id === id).group, "electromagnetism");
    const groups = S.TOOL_GROUPS.map((g) => g.id);
    assert.ok(groups.indexOf("waves") < groups.indexOf("electromagnetism") && groups.indexOf("electromagnetism") < groups.indexOf("electricity"));
    assert.equal(S.TOOL_GROUPS.find((g) => g.id === "electromagnetism").label, "Electromagnetism");
    assert.equal(new Set(S.PHYSICS_TOOLS.map((t) => t.slug)).size, S.PHYSICS_TOOLS.length);
    for (const id of NEW_TOOLS) assert.deepEqual(S.parseRoute(S.routeHash({ subject: "physics", toolId: id })), { subject: "physics", toolId: id });
    assert.deepEqual(S.PHYSICS_TOOLS.slice(0, 8).map((t) => t.id), ["phOverview", "phMechanics", "phForces", "phEnergy", "phCollisions", "phWaves", "phOptics", "phInterference"], "earlier subjects keep their order");
  });
  test("[App] the pages are lazy-loaded and routed, and concept links can open them", () => {
    const app = read("src", "App.tsx");
    for (const [, id, comp] of PAGES) {
      assert.match(app, new RegExp(`const ${comp} = lazy\\(\\(\\) => import\\("./components/physics/${comp}"\\)\\)`));
      assert.match(app, new RegExp(`generalTool === "${id}" \\? \\(\\s*<${comp}\\s+openRequest=\\{pendingOpen\\?\\.page === "${id}" \\? pendingOpen : null\\}`));
      assert.match(app, new RegExp(`target === "${id}"`));
    }
  });
  test("[icons and header] every new tool icon exists and the header accepts the new group", () => {
    const icons = read("src", "components", "ui", "Icon.tsx");
    for (const id of NEW_TOOLS) assert.match(icons, new RegExp(`\\n  ${S.PHYSICS_TOOLS.find((t) => t.id === id).icon}: "`));
    assert.match(read("src", "components", "ui", "primitives.tsx"), /"Electromagnetism"/);
  });
  test("[overview] each tool has a feature list and an Open button; planned items still have none", () => {
    const o = read("src", "components", "physics", "PhysicsOverview.tsx");
    for (const id of NEW_TOOLS) assert.match(o, new RegExp(`${id}:`));
    assert.match(o, /group === "electromagnetism"/);
    assert.doesNotMatch(o.slice(o.indexOf('title="Planned"'), o.indexOf("<Callout")), /<button/);
    assert.ok(!S.getSubject("physics").planned.some((p) => /^Inductors/.test(p)), "inductors are no longer only planned");
    assert.ok(S.getSubject("physics").planned.includes("AC circuits: RLC, impedance and resonance"));
  });
  test("[concept search] each scientific idea finds its tool and every page lists related concepts", () => {
    const cases = [["Coulomb's law", "phEfield"], ["equipotential", "phEfield"], ["electric potential", "phEfield"], ["right-hand rule", "phMagnetic"], ["Lorentz force", "phMagnetic"], ["solenoid", "phMagnetic"], ["cyclotron motion", "phMagnetic"],
      ["Faraday's law", "phInduction"], ["Lenz's law", "phInduction"], ["motional EMF", "phInduction"], ["magnetic flux", "phInduction"], ["inductor", "phInduction"], ["RL circuit", "phInduction"]];
    for (const [query, toolId] of cases) {
      const hit = Q.searchConcepts(query, { subject: "physics" })[0];
      assert.ok(hit, query); assert.equal(hit.destination.toolId, toolId, query);
    }
    for (const [, id, comp] of PAGES) {
      assert.ok(read("src", "components", "physics", `${comp}.tsx`).includes(`toolId="${id}"`), comp);
      assert.ok(REL.relationsFrom("physics", id).length > 0, `${id} has relations`);
    }
    assert.deepEqual(CI.validateConceptIndex(), []);
    assert.deepEqual(REL.validateRelations?.() ?? [], []);
  });
  test("[offline] the new modules make no network requests", () => {
    const files = ["src/utils/physics/electrostatics.ts", "src/utils/physics/magnetism.ts", "src/utils/physics/induction.ts", "src/utils/physics/electromagnetismLearning.ts", "src/utils/physics/electromagnetismSummary.ts", "src/utils/persistence/physicsTools24.ts",
      ...PAGES.flatMap(([, , c]) => [`src/components/physics/${c}.tsx`]), "src/components/physics/EfieldDiagrams.tsx", "src/components/physics/MagneticDiagrams.tsx", "src/components/physics/InductionDiagrams.tsx"];
    for (const f of files) assert.doesNotMatch(read(...f.split("/")), /fetch\(|XMLHttpRequest|WebSocket|https?:\/\/(?!www\.w3\.org)/, f);
  });
  test("[interaction] diagrams are keyboard- and touch-operable and motion respects the system preference", () => {
    for (const f of ["EfieldDiagrams.tsx", "MagneticDiagrams.tsx"]) { const s = read("src", "components", "physics", f); assert.match(s, /onKeyDown/); assert.match(s, /setPointerCapture/); assert.match(s, /tabIndex=\{0\}/); assert.match(s, /aria-label=/); }
    const css = read("src", "styles", "physics.css");
    assert.match(css, /touch-action: none/); assert.match(css, /prefers-reduced-motion/);
    assert.match(read("src", "components", "physics", "sim.tsx"), /usePrefersReducedMotion/, "the shared transport steps instead of animating");
    for (const [, , c] of PAGES) { const s = read("src", "components", "physics", `${c}.tsx`); assert.match(s, /modes=\{\["explore", "practice", "challenge"\]\}/); assert.match(s, /ChallengePanel/); assert.match(s, /GcPredictPanel/); }
  });
});

describe("validated persistence", () => {
  test("[defaults round-trip] each page's defaults validate and re-validate to themselves; unknown fields are dropped, never kept", () => {
    for (const [def, v] of [[E0, P.validateEfieldInputs], [M0, P.validateMagneticInputs], [I0, P.validateInductionInputs]]) {
      const out = v(clone(def)); assert.ok(out); assert.deepEqual(v(clone(out)), out);
      const dirty = v({ ...clone(def), evil: "x" }); assert.ok(dirty); assert.equal("evil" in dirty, false);
    }
  });
  test("[efield] every view and a saved time round-trip; tampering is rejected, never coerced", () => {
    for (const view of P.EFIELD_VIEWS) { const x = { ...clone(E0), view, tNow: E0.particle.duration / 2 }; assert.deepEqual(P.validateEfieldInputs(clone(x)), x, view); }
    const base = clone(E0);
    const bad = [{ view: "sound" }, { view: 3 }, { mode: "hard" }, { challenge: -1 }, { challenge: 1.5 }, { speed: "warp" }, { tool: "magnetic" }, { subject: "chem" }, { showArrows: "yes" },
      { tNow: base.particle.duration * 2 }, { tNow: -1 }, { tNow: NaN }, { tNow: "0" }, { charges: [] }, { charges: null },
      { charges: Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, q: 1e-9, x: -4 + i, y: 0 })) },
      { charges: [{ id: "a", q: 0, x: 0, y: 0 }] }, { charges: [{ id: "a", q: 1e-3, x: 0, y: 0 }] }, { charges: [{ id: "a", q: 1e-9, x: 9, y: 0 }] },
      { charges: [{ id: "a", q: 1e-9, x: 0, y: 0 }, { id: "a", q: 1e-9, x: 1, y: 0 }] }, { charges: [{ id: "a", q: 1e-9, x: 0, y: 0 }, { id: "b", q: -1e-9, x: 0.0005, y: 0 }] },
      { probe: { x: -1, y: 0 } }, { probe: { x: 99, y: 0 } }, { probe: null }, { qTest: 0 }, { qTest: 1 }, { selected: "zz" }, { levels: [1, 2, 3, 4, 5, 6] }, { levels: [0] }, { levels: ["5"] },
      { particle: { ...base.particle, duration: 0 } }, { particle: { ...base.particle, q: 0 } }, { particle: { ...base.particle, vx0: 4e7 } }, { particle: { ...base.particle, Ey: 1e12 } },
      { particle: { ...base.particle, Ey: 1e9, duration: 1e-3 } }, { particle: null }];
    for (const b of bad) assert.equal(P.validateEfieldInputs({ ...clone(base), ...b }), null, JSON.stringify(b).slice(0, 80));
    assert.equal(P.validateEfieldInputs(null), null); assert.equal(P.validateEfieldInputs("x"), null); assert.equal(P.validateEfieldInputs([]), null);
  });
  test("[efield] a probe exactly on a charge is refused (the field is singular there), and moving the charge away makes it valid", () => {
    const x = { ...clone(E0), probe: { x: -1, y: 0 } };
    assert.equal(P.validateEfieldInputs(x), null);
    assert.ok(P.validateEfieldInputs({ ...x, probe: { x: -1, y: 0.05 } }));
  });
  test("[magnetic] every scenario round-trips; singular, duplicate and out-of-range settings are rejected", () => {
    for (const scenario of P.MAGNETIC_SCENARIOS) { const x = { ...clone(M0), scenario, tNow: M0.motion.duration / 2 }; assert.deepEqual(P.validateMagneticInputs(clone(x)), x, scenario); }
    const base = clone(M0);
    const bad = [{ scenario: "dipole" }, { mode: "x" }, { speed: "x" }, { tool: "efield" }, { wires: [] }, { wires: [{ id: "a", x: 0, y: 0, I: 0 }] }, { wires: [{ id: "a", x: 0, y: 0, I: 5 }, { id: "a", x: 0.2, y: 0, I: 5 }] },
      { wires: [{ id: "a", x: 0, y: 0, I: 5 }, { id: "b", x: 0, y: 0, I: 5 }] }, { wires: Array.from({ length: 4 }, (_, i) => ({ id: `w${i}`, x: -0.3 + 0.2 * i, y: 0, I: 1 })) }, { wires: [{ id: "a", x: 2, y: 0, I: 5 }] },
      { probe: { x: 0, y: 0 } }, { probe: { x: 5, y: 0 } }, { selectedWire: "q" }, { axisX: 2 }, { axisX: NaN }, { tNow: base.motion.duration * 3 },
      { loop: { ...base.loop, N: 0.5 } }, { loop: { ...base.loop, a: 0 } }, { loop: { ...base.loop, I: 0 } }, { solenoid: { ...base.solenoid, R: 5 } }, { solenoid: { ...base.solenoid, n: 0 } },
      { lorentz: { ...base.lorentz, v: { x: 4e7, y: 0, z: 0 } } }, { lorentz: { ...base.lorentz, q: 0 } }, { lorentz: { ...base.lorentz, B: { x: 0, y: 0, z: 50 } } },
      { motion: { ...base.motion, Bz: 0 } }, { motion: { ...base.motion, duration: -1 } }, { motion: { ...base.motion, vx: 4e7 } }, { motion: { ...base.motion, duration: 1 } },
      { conductor: { ...base.conductor, L: { x: 0, y: 0, z: 0 } } }, { conductor: { ...base.conductor, I: 0 } }, { conductor: null }];
    for (const b of bad) assert.equal(P.validateMagneticInputs({ ...clone(base), ...b }), null, JSON.stringify(b).slice(0, 80));
  });
  test("[induction] every scenario round-trips; the saved time must fit the run of the chosen scenario", () => {
    for (const scenario of P.INDUCTION_SCENARIOS) { const end = P.inductionEnd({ ...I0, scenario }); const x = { ...clone(I0), scenario, tNow: end / 2 }; assert.deepEqual(P.validateInductionInputs(clone(x)), x, scenario); }
    assert.equal(P.inductionEnd({ ...I0, scenario: "faraday" }), 2);
    rel(P.inductionEnd({ ...I0, scenario: "generator" }), 2 / 50, 1e-12);
    rel(P.inductionEnd({ ...I0, scenario: "rl" }), 5 * 0.5 / 20, 1e-12);
    assert.equal(P.inductionEnd({ ...I0, scenario: "motional" }), P.MOTIONAL_RUN_S);
    assert.ok(P.validateInductionInputs({ ...clone(I0), scenario: "flux", tNow: 1 }));
    assert.equal(P.validateInductionInputs({ ...clone(I0), scenario: "flux", tNow: 1.5 }), null);
    assert.equal(P.validateInductionInputs({ ...clone(I0), scenario: "generator", tNow: 0.05 }), null, "0.05 s exceeds two periods of 50 Hz");
    assert.ok(P.validateInductionInputs({ ...clone(I0), scenario: "generator", tNow: 0.04 }));
  });
  test("[induction] impossible circuits and out-of-range values are rejected", () => {
    const base = clone(I0);
    const bad = [{ scenario: "lenz" }, { mode: "x" }, { tool: "magnetic" }, { flux: { ...base.flux, B: -1 } }, { flux: { ...base.flux, N: 1.5 } }, { flux: { ...base.flux, A: 0 } }, { flux: { ...base.flux, thetaDeg: 400 } },
      { faraday: { ...base.faraday, aRate: -1 } }, { faraday: { ...base.faraday, closed: "yes" } }, { faraday: { ...base.faraday, R: 0 } }, { faraday: { ...base.faraday, duration: 0 } }, { faraday: { ...base.faraday, B0: 19, bRate: 10 } },
      { motional: { ...base.motional, L: 0 } }, { motional: { ...base.motional, v: -1 } }, { motional: { ...base.motional, Bz: 50 } }, { generator: { ...base.generator, periods: 7 } }, { generator: { ...base.generator, frequency: 0 } }, { generator: { ...base.generator, N: 0 } },
      { rl: { ...base.rl, spanTau: 4 } }, { rl: { ...base.rl, R: 0 } }, { rl: { ...base.rl, L: 0 } }, { rl: { ...base.rl, L: 1e-9, R: 1e6 } }, { rl: { ...base.rl, Vs: 200 } }];
    for (const b of bad) assert.equal(P.validateInductionInputs({ ...clone(base), ...b }), null, JSON.stringify(b).slice(0, 80));
  });
  test("[registration] the library maps the pages to their tools, subject and validators", () => {
    for (const [page, tool] of [["efield", "phEfield"], ["magnetic", "phMagnetic"], ["induction", "phInduction"]]) {
      assert.equal(APP.ANALYSIS_APP_PAGE[page], tool); assert.ok(APP.OPENABLE_ANALYSIS_PAGES.includes(page)); assert.equal(STORE.PAGE_SUBJECT[page], "physics");
    }
  });
  test("[descriptions] every view of every page gets a readable, bounded saved name", () => {
    for (const view of P.EFIELD_VIEWS) { const d = P.describeEfieldAnalysis({ ...E0, view }); assert.ok(d.length > 10 && d.length <= 300, view); }
    for (const scenario of P.MAGNETIC_SCENARIOS) { const d = P.describeMagneticAnalysis({ ...M0, scenario }); assert.ok(d.length > 10 && d.length <= 300, scenario); }
    for (const scenario of P.INDUCTION_SCENARIOS) { const d = P.describeInductionAnalysis({ ...I0, scenario }); assert.ok(d.length > 10 && d.length <= 300, scenario); }
  });
});

describe("save, reopen and recalculation", () => {
  let n = 0;
  const validators = () => ({
    efield: { engineVersion: P.EFIELD_ENGINE_VERSION, validateInputs: P.validateEfieldInputs, validateResults: (r) => r },
    magnetic: { engineVersion: P.MAGNETIC_ENGINE_VERSION, validateInputs: P.validateMagneticInputs, validateResults: (r) => r },
    induction: { engineVersion: P.INDUCTION_ENGINE_VERSION, validateInputs: P.validateInductionInputs, validateResults: (r) => r },
  });
  const ok = (r) => { assert.equal(r.ok, true, r.ok ? "" : JSON.stringify(r.error)); return r.value; };
  const envelope = (data, version) => ({ computedAt: "2026-11-18T09:00:00.000Z", engineVersion: version, stale: false, status: "complete", data });
  test("[round trip] a saved record of each page reopens with identical inputs, and the derived numbers recompute to the saved ones", async () => {
    const backend = new STORE.MemoryBackend();
    const library = new LIB.AnalysisLibrary(backend, { validators: validators(), newId: () => `p24-${++n}` });
    const cases = [
      ["efield", { ...clone(P.DEFAULT_EFIELD_INPUTS), view: "potential", showContours: true, tNow: 1e-7, selected: "a" }, SUM.summarizeEfield, P.EFIELD_ENGINE_VERSION, P.describeEfieldAnalysis],
      ["magnetic", { ...clone(P.DEFAULT_MAGNETIC_INPUTS), scenario: "motion", tNow: 5e-8 }, SUM.summarizeMagnetic, P.MAGNETIC_ENGINE_VERSION, P.describeMagneticAnalysis],
      ["induction", { ...clone(P.DEFAULT_INDUCTION_INPUTS), scenario: "generator", tNow: 0.01 }, SUM.summarizeInduction, P.INDUCTION_ENGINE_VERSION, P.describeInductionAnalysis],
    ];
    for (const [page, inputs, summarize, version, describe] of cases) {
      const results = summarize(inputs);
      const saved = ok(await library.save(page, { name: `${page} test`, summary: describe(inputs), inputs, results: envelope(results, version) }));
      const reopened = ok(await new LIB.AnalysisLibrary(backend, { validators: validators(), newId: () => `p24-${++n}` }).open(saved.id));
      assert.deepEqual(reopened.inputs, inputs, page);
      assert.equal(reopened.engineMismatch, false);
      const fresh = summarize(P[{ efield: "validateEfieldInputs", magnetic: "validateMagneticInputs", induction: "validateInductionInputs" }[page]](reopened.inputs));
      rel(fresh.check, reopened.results.data.check, 1e-12, `${page} check recomputed`);
      assert.deepEqual(fresh.headline, reopened.results.data.headline, `${page} headline recomputed`);
    }
  });
  test("[strict] a stored record whose inputs fail validation (a probe on a charge, a time past the end) is refused when opened, not coerced", async () => {
    for (const [page, version, bad] of [
      ["efield", P.EFIELD_ENGINE_VERSION, { ...clone(P.DEFAULT_EFIELD_INPUTS), probe: { x: -1, y: 0 } }],
      ["magnetic", P.MAGNETIC_ENGINE_VERSION, { ...clone(P.DEFAULT_MAGNETIC_INPUTS), tNow: 1 }],
      ["induction", P.INDUCTION_ENGINE_VERSION, { ...clone(P.DEFAULT_INDUCTION_INPUTS), tNow: 99 }],
    ]) {
      const library = new LIB.AnalysisLibrary(new STORE.MemoryBackend(), { validators: validators(), newId: () => `p24-${++n}` });
      const saved = ok(await library.save(page, { name: "tampered", summary: "tampered", inputs: bad, results: envelope({ engineVersion: version, headline: [], assumptions: [], check: 0, checkLabel: "x" }, version) }));
      const opened = await library.open(saved.id);
      assert.equal(opened.ok, false, page);
    }
  });
});

describe("summaries and assumptions (independent hand calculations)", () => {
  test("[efield] dipole of ±2 nC at (∓1, 0), probe (0, 1): each field is kq/2 and the y parts cancel, so |E| = √2·kq/2", () => {
    const expected = Math.SQRT2 * (K * 2e-9) / 2;
    const s = SUM.summarizeEfield(E0); rel(s.check, expected, 1e-9); assert.match(s.checkLabel, /field/);
    const v = SUM.summarizeEfield({ ...E0, view: "potential" }); near(v.check, 0, 1e-9, "equal and opposite potentials cancel on the symmetry axis");
    const p = SUM.summarizeEfield({ ...E0, view: "particle" });
    const a = (E * 5e3) / MP; const vy = a * 4e-7; rel(p.check, Math.hypot(1e5, vy), 1e-9, "final speed");
  });
  test("[magnetic] one 10 A wire at the origin, probe (0.15, 0.1): B = μ₀I/(2πr), directed counter-clockwise", () => {
    const r = Math.hypot(0.15, 0.1);
    const s = SUM.summarizeMagnetic(M0); rel(s.check, (MU0 * 10) / (2 * Math.PI * r), 1e-9);
    const f = MG.wireFieldAt(M0.wires, 0.15, 0.1); assert.ok(f.B.x < 0 && f.B.y > 0, "CCW tangent (−y, x)"); near(f.B.x / f.magnitude, -0.1 / r, 1e-12);
    rel(SUM.summarizeMagnetic({ ...M0, scenario: "solenoid" }).check, MU0 * 1000 * 2, 1e-12);
    rel(SUM.summarizeMagnetic({ ...M0, scenario: "motion" }).check, (2 * Math.PI * MP) / (E * 0.5), 1e-12, "cyclotron period");
    rel(SUM.summarizeMagnetic({ ...M0, scenario: "lorentz" }).check, E * 1e5 * 0.1, 1e-12);
    rel(SUM.summarizeMagnetic({ ...M0, scenario: "conductor" }).check, 5 * 0.2 * 0.3, 1e-12);
    rel(SUM.summarizeMagnetic({ ...M0, scenario: "loop" }).check, (MU0 * 5 * 0.05 ** 2) / (2 * 0.05 ** 3) * 1, 1e-12, "on-axis at x = 0 equals the centre field μ₀NI/2a");
  });
  test("[induction] defaults: ε = −N A dB/dt = −1 V; BLv = 0.6 V; NBAω = 1256.6 V; τ = L/R = 25 ms", () => {
    rel(SUM.summarizeInduction(I0).check, -50 * 0.05 * 0.4, 1e-12);
    rel(SUM.summarizeInduction({ ...I0, scenario: "motional" }).check, -0.5 * 0.4 * 3, 1e-12, "tip is NOT the positive end for this geometry");
    rel(SUM.summarizeInduction({ ...I0, scenario: "generator" }).check, 200 * 0.4 * 0.05 * 2 * Math.PI * 50, 1e-12);
    rel(SUM.summarizeInduction({ ...I0, scenario: "rl" }).check, 0.5 / 20, 1e-12);
    rel(SUM.summarizeInduction({ ...I0, scenario: "flux" }).check, 0.5 * 0.02 * Math.cos(Math.PI / 6), 1e-12);
  });
  test("[assumptions are honest] the lists name what is not modelled and the sign conventions", () => {
    assert.match(SUM.EFIELD_ASSUMPTIONS.join(" "), /singular/); assert.match(SUM.EFIELD_ASSUMPTIONS.join(" "), /non-relativistic/);
    assert.match(SUM.MAGNETIC_ASSUMPTIONS.join(" "), /out of the screen/); assert.match(SUM.MAGNETIC_ASSUMPTIONS.join(" "), /on the axis only|axis only/);
    assert.match(SUM.INDUCTION_ASSUMPTIONS.join(" "), /counter-clockwise/); assert.match(SUM.INDUCTION_ASSUMPTIONS.join(" "), /open-circuit|self-inductance/);
  });
  test("[directionWords] the screen convention is spelled out", () => {
    assert.equal(DW.directionWords({ x: 0, y: 0, z: 2 }), "+z (out of the screen)");
    assert.equal(DW.directionWords({ x: 0, y: 0, z: -2 }), "−z (into the screen)");
    assert.equal(DW.directionWords({ x: 0, y: -3, z: 0 }), "−y (down the screen)");
    assert.equal(DW.directionWords({ x: 5, y: 0, z: 0 }), "+x (to the right)");
    assert.equal(DW.directionWords({ x: 0, y: 0, z: 0 }), "zero");
  });
});

describe("lessons and predict-then-observe scenarios", () => {
  const run = (list, input, id) => { const s = list.find((x) => x.id === id); assert.ok(s, `scenario ${id}`); const r = PR.evaluatePredict(s, input); assert.ok(r, id); return r; };
  test("[lessons] every laboratory has several lessons that quote the model's own numbers", () => {
    const e = LRN.efieldLessons(E0); assert.ok(e.length >= 4); assert.ok(e.every((l) => l.title.endsWith("?") && l.body.join(" ").length > 120));
    assert.match(e[0].body.join(" "), /12\.7/, "quotes the net field at the probe");
    const m = LRN.magneticLessons(M0); assert.ok(m.length >= 5); assert.ok(m.every((l) => l.title.endsWith("?") && l.body.join(" ").length > 100));
    assert.match(m[0].body.join(" "), /out of the screen/); assert.match(m[0].body.join(" "), /counterclockwise/);
    const i = LRN.inductionLessons(I0); assert.ok(i.length >= 6); assert.ok(i.every((l) => l.title.endsWith("?")));
    assert.match(i.map((l) => l.body.join(" ")).join(" "), /ε = −N dΦ\/dt/);
  });
  test("[efield scenarios] doubling the sources doubles the field; flipping them keeps |E| but reverses V", () => {
    const base = (K * 2e-9) / 2 * Math.SQRT2;
    const sc = LRN.efieldScenarios(E0);
    const d = run(sc, E0, "double-sources"); rel(d.before, base, 1e-9); rel(d.after, 2 * base, 1e-9); assert.equal(d.trend, "higher");
    assert.equal(run(sc, E0, "flip-signs").trend, "same");
    const q = run(sc, E0, "double-qtest"); rel(q.before, 1e-9 * base, 1e-9); rel(q.after, 2e-9 * base, 1e-9);
    const part = { ...clone(E0), view: "particle" }; const ps = LRN.efieldScenarios(part);
    const a = (E * 5e3) / MP;
    rel(run(ps, part, "double-field").before, a, 1e-9); rel(run(ps, part, "double-field").after, 2 * a, 1e-9);
    rel(run(ps, part, "double-mass").after, a / 2, 1e-9);
    rel(run(ps, part, "reverse-charge").after, a, 1e-9);
  });
  test("[magnetic scenarios] B ∝ I, B ∝ 1/r, r = mv/(|q|B), T independent of v, parallel v gives no force", () => {
    const sc = LRN.magneticScenarios(M0);
    const r = Math.hypot(0.15, 0.1), B1 = (MU0 * 10) / (2 * Math.PI * r);
    rel(run(sc, M0, "double-I").after, 2 * B1, 1e-9); rel(run(sc, M0, "double-r").after, B1 / 2, 1e-9);
    assert.equal(run(sc, M0, "reverse-I").trend, "same");
    const mo = { ...clone(M0), scenario: "motion" }; const ms = LRN.magneticScenarios(mo);
    const R = (MP * 1e5) / (E * 0.5), T = (2 * Math.PI * MP) / (E * 0.5);
    rel(run(ms, mo, "double-speed").before, R, 1e-9); rel(run(ms, mo, "double-speed").after, 2 * R, 1e-9);
    assert.equal(run(ms, mo, "double-speed-period").trend, "same"); rel(run(ms, mo, "double-speed-period").after, T, 1e-9);
    rel(run(ms, mo, "double-B").after, R / 2, 1e-9);
    const lo = { ...clone(M0), scenario: "lorentz" }; const ls = LRN.magneticScenarios(lo);
    rel(run(ls, lo, "double-v").before, E * 1e5 * 0.1, 1e-9); assert.equal(run(ls, lo, "flip-q").trend, "same");
    const pv = run(ls, lo, "parallel-v"); assert.equal(pv.trend, "lower"); near(pv.after, 0, 1e-24);
    const so = { ...clone(M0), scenario: "solenoid" }; assert.equal(run(LRN.magneticScenarios(so), so, "double-length").trend, "same");
    const co = { ...clone(M0), scenario: "conductor" }; rel(run(LRN.magneticScenarios(co), co, "double-L").after, 0.6, 1e-12);
  });
  test("[induction scenarios] ε ∝ rate and N, a steady field induces nothing, a parallel rod has no EMF, peak ε ∝ f, τ = L/R", () => {
    const fa = { ...clone(I0), scenario: "faraday" }; const fs = LRN.inductionScenarios(fa);
    rel(run(fs, fa, "double-rate").before, 1, 1e-12); rel(run(fs, fa, "double-rate").after, 2, 1e-12); rel(run(fs, fa, "double-turns").after, 2, 1e-12);
    const stop = run(fs, fa, "stop-change"); assert.equal(stop.trend, "lower"); near(stop.after, 0, 1e-12);
    const mo = { ...clone(I0), scenario: "motional" }; const mss = LRN.inductionScenarios(mo);
    rel(run(mss, mo, "double-v").before, 0.6, 1e-12); rel(run(mss, mo, "double-v").after, 1.2, 1e-12); near(run(mss, mo, "rod-parallel").after, 0, 1e-12);
    const ge = { ...clone(I0), scenario: "generator" }; rel(run(LRN.inductionScenarios(ge), ge, "double-f").after, 2 * 200 * 0.4 * 0.05 * 2 * Math.PI * 50, 1e-12);
    const rl = { ...clone(I0), scenario: "rl" }; const rs = LRN.inductionScenarios(rl);
    rel(run(rs, rl, "double-L").after, 0.05, 1e-12); rel(run(rs, rl, "double-R").after, 0.0125, 1e-12); rel(run(rs, rl, "double-Vs").after, 1.2, 1e-12);
    const fl = { ...clone(I0), scenario: "flux" }; near(run(LRN.inductionScenarios(fl), fl, "tilt").after, 0, 1e-12);
  });
  test("[scenarios are valid or absent] none is offered when its change would leave the supported range", () => {
    const big = { ...clone(M0), scenario: "solenoid", solenoid: { n: 1000, I: 2, L: 10, R: 0.02 } };
    for (const s of LRN.magneticScenarios(big)) { const after = s.apply(big); assert.ok(after !== null && Number.isFinite(s.measure(big))); }
    const fast = { ...clone(E0), view: "particle", particle: { ...E0.particle, Ey: 6e8, duration: 4e-7 } };
    for (const s of LRN.efieldScenarios(fast)) assert.ok(s.apply(fast) !== null, s.id);
  });
});

describe("challenges", () => {
  const byId = (list, id) => list.find((c) => c.id === id);
  test("[no challenge is met by the defaults] so a pass can only come from the learner's action", () => {
    for (const c of LRN.EFIELD_CHALLENGES) for (const view of P.EFIELD_VIEWS) assert.equal(c.check({ ...clone(E0), view }).met, false, `${c.id} ${view}`);
    for (const c of LRN.MAGNETIC_CHALLENGES) for (const scenario of P.MAGNETIC_SCENARIOS) assert.equal(c.check({ ...clone(M0), scenario }).met, false, `${c.id} ${scenario}`);
    for (const c of LRN.INDUCTION_CHALLENGES) for (const scenario of P.INDUCTION_SCENARIOS) assert.equal(c.check({ ...clone(I0), scenario }).met, false, `${c.id} ${scenario}`);
  });
  test("[every challenge has a view, a hint and a worked solution; ids are unique]", () => {
    const all = [...LRN.EFIELD_CHALLENGES, ...LRN.MAGNETIC_CHALLENGES, ...LRN.INDUCTION_CHALLENGES];
    assert.equal(new Set(all.map((c) => c.id)).size, all.length);
    for (const c of all) { assert.ok(c.view && c.hint.length > 10 && c.solution.length > 20 && c.prompt.length > 20, c.id); }
    for (const c of LRN.EFIELD_CHALLENGES) assert.ok(P.EFIELD_VIEWS.includes(c.view));
    for (const c of LRN.MAGNETIC_CHALLENGES) assert.ok(P.MAGNETIC_SCENARIOS.includes(c.view));
    for (const c of LRN.INDUCTION_CHALLENGES) assert.ok(P.INDUCTION_SCENARIOS.includes(c.view));
  });
  test("[electric field solutions] a null point between equal charges; V = kq/r; reversing a proton in a field", () => {
    const pair = { ...clone(E0), charges: EL.PRESETS.pair.charges.map((c) => ({ ...c })), probe: { x: 0, y: 0 } };
    assert.ok(P.validateEfieldInputs(pair)); assert.equal(byId(LRN.EFIELD_CHALLENGES, "ef-null").check(pair).met, true);
    const r = (K * 2e-9) / 40;
    const single = { ...clone(E0), view: "potential", charges: [{ id: "a", q: 2e-9, x: 0, y: 0 }], probe: { x: Math.round(r * 20) / 20, y: 0 } };
    near(r, 0.449, 0.001); assert.ok(P.validateEfieldInputs(single)); assert.equal(byId(LRN.EFIELD_CHALLENGES, "ef-potential-40").check(single).met, true);
    const turn = { ...clone(E0), view: "particle", particle: { ...E0.particle, Ex: -8000, Ey: 0 } };
    assert.ok(P.validateEfieldInputs(turn)); assert.equal(byId(LRN.EFIELD_CHALLENGES, "ef-turn-around").check(turn).met, true);
    near(1e5 + ((E * -8000) / MP) * 4e-7, -2.0655e5, 100, "hand-computed final vx");
  });
  test("[magnetic solutions] 500 A at 0.2 m; n = 2000 with 2 A; B = 0.21 T; I = −10 A", () => {
    const wire = { ...clone(M0), wires: [{ id: "a", x: 0, y: 0, I: 500 }], probe: { x: 0.2, y: 0 } };
    assert.ok(P.validateMagneticInputs(wire)); assert.equal(byId(LRN.MAGNETIC_CHALLENGES, "mag-wire-half-mT").check(wire).met, true);
    const sol = { ...clone(M0), scenario: "solenoid", solenoid: { ...M0.solenoid, n: 2000, I: 2 } };
    assert.equal(byId(LRN.MAGNETIC_CHALLENGES, "mag-solenoid-5mT").check(sol).met, true); near(MU0 * 4000, 5.0265e-3, 1e-6);
    const orbit = { ...clone(M0), scenario: "motion", motion: { ...M0.motion, Bz: 0.21 } };
    assert.ok(P.validateMagneticInputs(orbit)); assert.equal(byId(LRN.MAGNETIC_CHALLENGES, "mag-orbit-5mm").check(orbit).met, true);
    assert.equal(byId(LRN.MAGNETIC_CHALLENGES, "mag-orbit-5mm").check({ ...orbit, motion: { ...orbit.motion, Ey: 100 } }).met, false, "an electric field voids the pure-orbit goal");
    const up = { ...clone(M0), scenario: "conductor", conductor: { ...M0.conductor, I: -10 } };
    assert.equal(byId(LRN.MAGNETIC_CHALLENGES, "mag-conductor-up").check(up).met, true);
    const F = MG.conductorForce(-10, MG.v3(0.2, 0, 0), MG.v3(0, 0, 0.3)); near(F.y, 0.6, 1e-12); near(F.x, 0, 1e-12);
  });
  test("[induction solutions] dB/dt = −0.8 T/s gives +1 A; a reversed rod velocity makes the tip positive; 90 × 0.25 × 0.02 at 60 Hz; 24 Ω, 0.24 H", () => {
    const ccw = { ...clone(I0), faraday: { ...I0.faraday, bRate: -0.8 } };
    assert.ok(P.validateInductionInputs(ccw)); assert.equal(byId(LRN.INDUCTION_CHALLENGES, "ind-ccw").check(ccw).met, true);
    assert.equal(byId(LRN.INDUCTION_CHALLENGES, "ind-ccw").check({ ...ccw, faraday: { ...ccw.faraday, closed: false } }).met, false, "an open loop carries no current");
    const mo = { ...clone(I0), scenario: "motional", motional: { ...I0.motional, velAngleDeg: 180, v: 5 } };
    assert.equal(byId(LRN.INDUCTION_CHALLENGES, "ind-motional-1V").check(mo).met, true); assert.equal(IN.motionalEmf(mo.motional).positiveEnd, "tip");
    const ge = { ...clone(I0), scenario: "generator", generator: { B: 0.25, A: 0.02, N: 90, frequency: 60, theta0Deg: 0, periods: 2 } };
    assert.equal(byId(LRN.INDUCTION_CHALLENGES, "ind-generator-170").check(ge).met, true); near(90 * 0.25 * 0.02 * 2 * Math.PI * 60, 169.65, 0.01);
    assert.equal(byId(LRN.INDUCTION_CHALLENGES, "ind-generator-170").check({ ...ge, generator: { ...ge.generator, frequency: 50 } }).met, false, "the frequency is part of the goal");
    const rl = { ...clone(I0), scenario: "rl", rl: { ...I0.rl, Vs: 12, R: 24, L: 0.24 } };
    assert.equal(byId(LRN.INDUCTION_CHALLENGES, "ind-rl").check(rl).met, true);
  });
});
