// Stage 21: platform wiring, validated persistence, learning content and challenges for Waves & sound, Geometric optics and
// Interference & diffraction. Challenge solutions are constructed by hand from the stated worked solutions and must satisfy the
// pure checks; the defaults must not satisfy any challenge.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
let S, PT, WL, SUM, PR, W, O, I, CI, REL, Q;
before(async () => {
  S = await loadModule("/src/navigation/subjects.ts");
  PT = await loadModule("/src/utils/persistence/physicsTools.ts");
  WL = await loadModule("/src/utils/physics/waveOpticsLearning.ts");
  SUM = await loadModule("/src/utils/physics/physicsSummary.ts");
  PR = await loadModule("/src/utils/generalChem/predict.ts");
  W = await loadModule("/src/utils/physics/waves.ts");
  O = await loadModule("/src/utils/physics/optics.ts");
  I = await loadModule("/src/utils/physics/interference.ts");
  CI = await loadModule("/src/utils/concepts/conceptIndex.ts");
  REL = await loadModule("/src/utils/concepts/relations.ts");
  Q = await loadModule("/src/utils/concepts/search.ts");
});
after(async () => { await closeEngine(); });

const clone = (x) => JSON.parse(JSON.stringify(x));
const NEW_TOOLS = ["phWaves", "phOptics", "phInterference"];

describe("navigation and wiring", () => {
  test("[tools] the three laboratories sit in their own 'Waves & optics' group between mechanics and electricity, with unique slugs and routes that round-trip", () => {
    const ids = S.PHYSICS_TOOLS.map((t) => t.id);
    assert.deepEqual(ids.slice(5, 8), NEW_TOOLS);
    for (const id of NEW_TOOLS) assert.equal(S.PHYSICS_TOOLS.find((t) => t.id === id).group, "waves");
    assert.equal(S.TOOL_GROUPS.find((g) => g.id === "waves").label, "Waves & optics");
    assert.equal(new Set(S.PHYSICS_TOOLS.map((t) => t.slug)).size, S.PHYSICS_TOOLS.length);
    for (const id of NEW_TOOLS) { const t = S.PHYSICS_TOOLS.find((x) => x.id === id); assert.deepEqual(S.parseRoute(S.routeHash({ subject: "physics", toolId: id })), { subject: "physics", toolId: id }); assert.match(S.routeHash({ subject: "physics", toolId: id }), new RegExp(`#/physics/${t.slug}$`)); }
  });
  test("[planned list] 'Waves and optics' is no longer listed as planned; remaining plans stay", () => {
    const planned = S.getSubject("physics").planned;
    assert.ok(!planned.includes("Waves and optics")); assert.ok(planned.includes("Rotational motion and torque")); assert.ok(planned.includes("Inductors and AC circuits"));
  });
  test("[icons] every new tool icon exists", () => {
    const icons = read("src", "components", "ui", "Icon.tsx");
    for (const id of NEW_TOOLS) assert.match(icons, new RegExp(`\\n  ${S.PHYSICS_TOOLS.find((t) => t.id === id).icon}: "`));
  });
  test("[app] each page is lazily loaded, rendered with its own open request, and openable from Saved", () => {
    const app = read("src", "App.tsx");
    for (const [id, comp] of [["phWaves", "WavesPage"], ["phOptics", "OpticsPage"], ["phInterference", "InterferencePage"]]) {
      assert.match(app, new RegExp(`const ${comp} = lazy\\(\\(\\) => import\\("./components/physics/${comp}"\\)\\)`));
      assert.match(app, new RegExp(`generalTool === "${id}" \\? \\(\\s*<${comp}\\s+openRequest=\\{pendingOpen\\?\\.page === "${id}" \\? pendingOpen : null\\}`));
      assert.match(app, new RegExp(`target === "${id}"`));
    }
  });
  test("[overview] the three laboratories have feature lists and Open buttons; the planned block still has no buttons", () => {
    const overview = read("src", "components", "physics", "PhysicsOverview.tsx");
    for (const id of NEW_TOOLS) assert.match(overview, new RegExp(`${id}:`));
    assert.match(overview, /group === "waves"/);
    assert.doesNotMatch(overview.slice(overview.indexOf('title="Planned"'), overview.indexOf("<Callout")), /<button/);
  });
  test("[concept search] each laboratory is reachable from search and has related-concept links on its page", () => {
    for (const [query, toolId] of [["double slit", "phInterference"], ["diffraction grating", "phInterference"], ["Snell's law", "phOptics"], ["thin lens", "phOptics"], ["Doppler effect", "phWaves"], ["standing wave", "phWaves"], ["beats", "phWaves"], ["closed pipe", "phWaves"]]) {
      const hit = Q.searchConcepts(query, { subject: "physics" })[0];
      assert.ok(hit, query); assert.equal(hit.destination.toolId, toolId, query);
    }
    for (const [file, id] of [["WavesPage.tsx", "phWaves"], ["OpticsPage.tsx", "phOptics"], ["InterferencePage.tsx", "phInterference"]]) {
      assert.ok(read("src", "components", "physics", file).includes(`toolId="${id}"`), file);
      assert.ok(REL.relationsFrom("physics", id).length > 0, `${id} has relations`);
    }
    assert.deepEqual(CI.validateConceptIndex(), []);
  });
  test("[offline] the new modules make no network requests", () => {
    for (const f of ["src/utils/physics/waves.ts", "src/utils/physics/optics.ts", "src/utils/physics/interference.ts", "src/utils/physics/waveOpticsLearning.ts", "src/components/physics/WavesPage.tsx", "src/components/physics/OpticsPage.tsx", "src/components/physics/InterferencePage.tsx", "src/components/physics/WaveDiagrams.tsx", "src/components/physics/OpticsDiagrams.tsx", "src/components/physics/InterferenceDiagrams.tsx"]) assert.doesNotMatch(read(...f.split("/")), /\bfetch\(|XMLHttpRequest|https?:\/\/(?!www\.w3\.org)/, f);
  });
});

describe("validated persistence", () => {
  test("[defaults round-trip] each page's defaults validate and re-validate to themselves", () => {
    for (const [def, v] of [[PT.DEFAULT_WAVES_INPUTS, PT.validateWavesInputs], [PT.DEFAULT_OPTICS_INPUTS, PT.validateOpticsInputs], [PT.DEFAULT_INTERFERENCE_INPUTS, PT.validateInterferenceInputs]]) {
      const out = v(clone(def)); assert.ok(out); assert.deepEqual(v(clone(out)), out);
    }
  });
  test("[waves: every view and a saved time round-trip; tampering is rejected, never coerced]", () => {
    const base = clone(PT.DEFAULT_WAVES_INPUTS);
    for (const view of PT.WAVE_VIEWS) { const x = { ...base, view, tNow: PT.wavesEnd({ ...base, view }) / 2 }; assert.deepEqual(PT.validateWavesInputs(clone(x)), x, view); }
    const end = PT.wavesEnd(base);
    for (const bad of [{ view: "sound" }, { view: 3 }, { tNow: end * 2 }, { tNow: -1 }, { tNow: NaN }, { tNow: "0" }, { speed: "warp" }, { longitudinal: "yes" }, { tool: "optics" }, { subject: "chem" },
      { wave: { ...base.wave, f: 0 } }, { wave: { ...base.wave, A: 5 } }, { wave: null }, { sup: { ...base.sup, w2: { ...base.sup.w2, v: 5 } } },
      { res: { ...base.res, kind: "closed", n: 2 } }, { res: { ...base.res, n: 1.5 } }, { dop: { ...base.dop, vs: 343 } }, { dop: { ...base.dop, vo: -400 } }, { dop: { ...base.dop, fs: -5 } }]) assert.equal(PT.validateWavesInputs({ ...clone(base), ...bad }), null, JSON.stringify(bad).slice(0, 80));
    assert.equal(PT.validateWavesInputs(null), null); assert.equal(PT.validateWavesInputs("x"), null);
  });
  test("[waves: the saved time must fit the shorter axis of the chosen view]", () => {
    const base = clone(PT.DEFAULT_WAVES_INPUTS);
    const tt = PT.wavesEnd({ ...base, view: "travel" }); assert.ok(PT.validateWavesInputs({ ...base, tNow: tt }));
    assert.equal(PT.validateWavesInputs({ ...base, tNow: tt * 1.01 }), null);
    near(PT.wavesEnd({ ...base, view: "standing" }), 3 / W.harmonicFrequency(base.res.kind, base.res.L, base.res.v, base.res.n), 1e-12);
    near(PT.wavesEnd({ ...base, view: "doppler" }), W.dopplerGeometry(base.dop).tEnd, 1e-12);
  });
  test("[optics] views, imaging and refraction validate; zero object distance, TIR-impossible angles and unknown elements are rejected", () => {
    const base = clone(PT.DEFAULT_OPTICS_INPUTS);
    for (const bad of [{ view: "prism" }, { imaging: { ...base.imaging, s: 0 } }, { imaging: { ...base.imaging, element: "grid" } }, { imaging: { ...base.imaging, f: 0 } }, { refraction: { ...base.refraction, theta1: 90 } }, { refraction: { ...base.refraction, n1: 0.5 } }, { tool: "waves" }]) assert.equal(PT.validateOpticsInputs({ ...clone(base), ...bad }), null, JSON.stringify(bad).slice(0, 80));
    const tir = { ...base, view: "refraction", refraction: { n1: 1.5, n2: 1, theta1: 60 } }; assert.deepEqual(PT.validateOpticsInputs(clone(tir)), tir, "total internal reflection is a valid state");
    const atF = { ...base, imaging: { ...base.imaging, s: base.imaging.f } }; assert.deepEqual(PT.validateOpticsInputs(clone(atF)), atF, "object at the focal point is valid (no image)");
  });
  test("[interference] slit settings and the probe are validated together", () => {
    const base = clone(PT.DEFAULT_INTERFERENCE_INPUTS);
    for (const bad of [{ slits: { ...base.slits, N: 2.5 } }, { slits: { ...base.slits, aUm: 150 } }, { slits: { ...base.slits, lambdaNm: 100 } }, { slits: { ...base.slits, L: 0.1 } }, { slits: { ...base.slits, N: 20, dUm: 500, L: 0.3 } }, { probeMm: 1e6 }, { probeMm: NaN }, { probeMm: "4" }, { slits: null }]) assert.equal(PT.validateInterferenceInputs({ ...clone(base), ...bad }), null, JSON.stringify(bad).slice(0, 80));
    assert.deepEqual(PT.validateInterferenceInputs({ ...clone(base), probeMm: -250 }), { ...base, probeMm: -250 });
  });
  test("[library] the app registers all three pages with validators and maps them to their tools", async () => {
    const lib = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
    assert.equal(lib.ANALYSIS_APP_PAGE.waves, "phWaves"); assert.equal(lib.ANALYSIS_APP_PAGE.optics, "phOptics"); assert.equal(lib.ANALYSIS_APP_PAGE.interference, "phInterference");
    for (const p of ["waves", "optics", "interference"]) assert.ok(lib.OPENABLE_ANALYSIS_PAGES.includes(p), p);
    const store = await loadModule("/src/utils/persistence/workspaceStore.ts");
    for (const p of ["waves", "optics", "interference"]) assert.equal(store.PAGE_SUBJECT[p], "physics");
  });
  test("[descriptions] a saved record gets a readable, bounded name for every view", () => {
    for (const view of PT.WAVE_VIEWS) { const d = PT.describeWavesAnalysis({ ...PT.DEFAULT_WAVES_INPUTS, view }); assert.ok(d.length > 10 && d.length <= 300, view); }
    for (const view of PT.OPTICS_VIEWS) { const d = PT.describeOpticsAnalysis({ ...PT.DEFAULT_OPTICS_INPUTS, view }); assert.ok(d.length > 10 && d.length <= 300, view); }
    for (const N of [1, 2, 6]) assert.ok(PT.describeInterferenceAnalysis({ ...PT.DEFAULT_INTERFERENCE_INPUTS, slits: { ...PT.DEFAULT_INTERFERENCE_INPUTS.slits, N } }).length > 10);
  });
});
function near(a, b, tol) { assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`); }

describe("summaries and assumption lists", () => {
  test("[waves] every view summarises with a finite check value and states its assumptions", () => {
    for (const view of PT.WAVE_VIEWS) { const s = SUM.summarizeWaves({ ...PT.DEFAULT_WAVES_INPUTS, view }); assert.ok(s.headline.length > 0 && Number.isFinite(s.check), view); assert.ok(s.assumptions.length >= 4); }
  });
  test("[optics] an object at the focal point is summarised as having no image (never a huge number)", () => {
    const d = PT.DEFAULT_OPTICS_INPUTS; const s = SUM.summarizeOptics({ ...d, imaging: { ...d.imaging, s: d.imaging.f } });
    assert.match(s.headline[0], /no image/i); assert.match(s.checkLabel, /infinity|none/);
    const r = SUM.summarizeOptics({ ...d, view: "refraction", refraction: { n1: 1.5, n2: 1, theta1: 60 } }); assert.match(r.headline[0], /Total internal reflection/);
  });
  test("[interference] single slit and grating summarise with the right headline quantities", () => {
    const d = PT.DEFAULT_INTERFERENCE_INPUTS;
    assert.match(SUM.summarizeInterference({ ...d, slits: { ...d.slits, N: 1 } }).headline[0], /Central maximum/);
    assert.match(SUM.summarizeInterference({ ...d, slits: { ...d.slits, N: 2, aUm: 25, dUm: 100 } }).headline.join(" "), /Missing orders: 4, 8/);
  });
  test("[assumptions are honest] the lists name what is not modelled", () => {
    assert.match(SUM.WAVES_ASSUMPTIONS.join(" "), /shock wave/i); assert.match(SUM.OPTICS_ASSUMPTIONS.join(" "), /paraxial/i); assert.match(SUM.INTERFERENCE_ASSUMPTIONS.join(" "), /Fresnel number/);
  });
});

describe("lessons and predict-then-observe scenarios", () => {
  const wavesAll = () => PT.WAVE_VIEWS.map((view) => ({ ...PT.DEFAULT_WAVES_INPUTS, view }));
  test("[lessons] every view of every laboratory has several lessons that quote the model's own numbers", () => {
    for (const x of wavesAll()) { const l = WL.wavesLessons(x); assert.ok(l.length >= 3, x.view); assert.ok(l.every((q) => q.title.endsWith("?") && q.body.length >= 1 && q.body.join(" ").length > 120)); }
    for (const view of PT.OPTICS_VIEWS) assert.ok(WL.opticsLessons({ ...PT.DEFAULT_OPTICS_INPUTS, view }).length >= 3, view);
    assert.ok(WL.interferenceLessons(PT.DEFAULT_INTERFERENCE_INPUTS).length >= 4);
    assert.match(WL.wavesLessons(wavesAll()[0])[0].body.join(" "), /8 m\/s|0\.1|4 m\/s/, "quotes numbers");
  });
  test("[scenarios] every scenario evaluates, and each outcome matches an independent hand calculation", () => {
    const check = (list, input, id, expectAfter, tol = 1e-9) => { const s = list.find((x) => x.id === id); assert.ok(s, id); const r = PR.evaluatePredict(s, input); assert.ok(r, id); near(r.after, expectAfter, tol); return r; };
    const travel = { ...PT.DEFAULT_WAVES_INPUTS, view: "travel" };
    check(WL.wavesScenarios(travel), travel, "double-f", 1, 1e-12);                 // lambda = 4 / 4 = 1 m
    check(WL.wavesScenarios(travel), travel, "double-v", 4, 1e-12);                 // lambda = 8 / 2 = 4 m
    check(WL.wavesScenarios(travel), travel, "double-A", 2 * Math.PI * 2 * 0.2, 1e-9);   // 2 pi f (2A)
    const st = { ...PT.DEFAULT_WAVES_INPUTS, view: "standing", res: { kind: "string", L: 1.2, v: 120, n: 3, A: 0.02 } };
    check(WL.wavesScenarios(st), st, "double-L", 25, 1e-12);                        // 120 / (2 x 2.4)
    const sc = WL.wavesScenarios(st).find((x) => x.id === "close-one-end"); assert.ok(sc); near(PR.evaluatePredict(sc, st).after, 3 * 120 / (4 * 1.2), 1e-12); // closed pipe harmonic 3 = 75 Hz
    const dop = { ...PT.DEFAULT_WAVES_INPUTS, view: "doppler", dop: { fs: 440, c: 343, vs: 40, vo: 0 } };
    check(WL.wavesScenarios(dop), dop, "reverse-vs", 440 * 343 / 383, 1e-9);
    check(WL.wavesScenarios(dop), dop, "source-to-observer", 440 * 383 / 343, 1e-9);
    const sup = { ...PT.DEFAULT_WAVES_INPUTS, view: "superposition", sup: { v: 343, w1: { A: 0.001, f: 440, v: 343, phiDeg: 0, dir: 1 }, w2: { A: 0.001, f: 444, v: 343, phiDeg: 0, dir: 1 } } };
    check(WL.wavesScenarios(sup), sup, "raise-f2", 5, 1e-12);
    const img = { ...PT.DEFAULT_OPTICS_INPUTS, imaging: { element: "lens", f: 10, s: 25, h: 3 } };
    check(WL.opticsScenarios(img), img, "closer", 12, 1e-9);   // s = 12.5: s' = 50, m = -4, |h'| = 12
    check(WL.opticsScenarios(img), img, "stronger", 25 * 5 / 20, 1e-9);                                       // f = 5, s = 25: s' = 6.25
    check(WL.opticsScenarios(img), img, "flip", 10 / 35, 1e-9); // f = -10, s = 25: s' = -7.143, m = 7.143/25 = 10/35
    const sl = PT.DEFAULT_INTERFERENCE_INPUTS;
    check(WL.interferenceScenarios({ ...sl, slits: { lambdaNm: 500, aUm: 50, dUm: 200, N: 2, L: 2 } }), { ...sl, slits: { lambdaNm: 500, aUm: 50, dUm: 200, N: 2, L: 2 } }, "wider-d", 0.0025, 1e-12);
  });
  test("[scenarios are valid or absent] none is offered when its change would leave the supported range", () => {
    const ok = { ...PT.DEFAULT_OPTICS_INPUTS, imaging: { element: "lens", f: 10, s: 10, h: 3 } };
    assert.ok(WL.opticsScenarios(ok).every((s) => Number.isFinite(s.measure(ok))), "no scenario measures a missing image");
    const dop = { ...PT.DEFAULT_WAVES_INPUTS, view: "doppler", dop: { fs: 440, c: 343, vs: 200, vo: 0 } };
    assert.ok(WL.wavesScenarios(dop).every((s) => s.apply(dop) !== null), "doubling to supersonic is not offered");
    assert.ok(!WL.wavesScenarios(dop).some((s) => s.id === "double-vs"));
  });
});

describe("challenges", () => {
  test("[no challenge is met by the defaults] so a pass can only come from the learner's action", () => {
    for (const c of WL.WAVES_CHALLENGES) for (const view of PT.WAVE_VIEWS) assert.equal(c.check({ ...clone(PT.DEFAULT_WAVES_INPUTS), view }).met, false, `${c.id} ${view}`);
    for (const c of WL.OPTICS_CHALLENGES) for (const view of PT.OPTICS_VIEWS) assert.equal(c.check({ ...clone(PT.DEFAULT_OPTICS_INPUTS), view }).met, false, `${c.id} ${view}`);
    for (const c of WL.INTERFERENCE_CHALLENGES) assert.equal(c.check(clone(PT.DEFAULT_INTERFERENCE_INPUTS)).met, false, c.id);
  });
  test("[each worked solution meets its goal] and a nearby wrong setup does not", () => {
    const ch = (list, id) => list.find((c) => c.id === id);
    const sol = (id, mut, wrong) => { const c = ch(WL.WAVES_CHALLENGES, id); const good = mut(clone(PT.DEFAULT_WAVES_INPUTS)); assert.equal(c.check(good).met, true, id); assert.equal(c.check(wrong(clone(good))).met, false, `${id} wrong`); return good; };
    sol("wave-lambda-T", (x) => ({ ...x, view: "travel", wave: { ...x.wave, A: 0.05, f: 500, v: 250 } }), (x) => ({ ...x, wave: { ...x.wave, v: 300 } }));
    sol("wave-beats-3", (x) => ({ ...x, view: "superposition", sup: { v: 343, w1: { ...x.sup.w1, f: 440, v: 343, dir: 1 }, w2: { ...x.sup.w2, f: 443, v: 343, dir: 1 } } }), (x) => ({ ...x, sup: { ...x.sup, w2: { ...x.sup.w2, f: 445 } } }));
    sol("wave-true-standing", (x) => ({ ...x, view: "superposition", sup: { v: 4, w1: { ...x.sup.w1, A: 0.15 }, w2: { ...x.sup.w2, A: 0.15, dir: -1 } } }), (x) => ({ ...x, sup: { ...x.sup, w2: { ...x.sup.w2, A: 0.05 } } }));
    sol("wave-string-220", (x) => ({ ...x, view: "standing", res: { kind: "string", L: 0.6, v: 264, n: 1, A: 0.01 } }), (x) => ({ ...x, res: { ...x.res, kind: "open" } }));
    sol("wave-closed-170", (x) => ({ ...x, view: "standing", res: { kind: "closed", L: 0.504, v: 343, n: 1, A: 0.01 } }), (x) => ({ ...x, res: { ...x.res, L: 0.6 } }));
    sol("wave-doppler-20", (x) => ({ ...x, view: "doppler", dop: { fs: 440, c: 343, vs: 57.2, vo: 0 } }), (x) => ({ ...x, dop: { ...x.dop, vo: 10 } }));
    const o = clone(PT.DEFAULT_OPTICS_INPUTS);
    const og = (id, input, expected = true) => assert.equal(ch(WL.OPTICS_CHALLENGES, id).check(input).met, expected, id);
    og("opt-same-size", { ...o, imaging: { element: "lens", f: 10, s: 20, h: 3 } }); og("opt-same-size", { ...o, imaging: { element: "lens", f: 10, s: 25, h: 3 } }, false); og("opt-same-size", { ...o, imaging: { element: "mirror", f: 10, s: 20, h: 3 } }, false);
    og("opt-magnifier", { ...o, imaging: { element: "lens", f: 12, s: 8, h: 3 } }); og("opt-magnifier", { ...o, imaging: { element: "lens", f: 12, s: 4, h: 3 } }, false); og("opt-magnifier", { ...o, imaging: { element: "lens", f: 12, s: 14, h: 3 } }, false);
    og("opt-convex-quarter", { ...o, imaging: { element: "mirror", f: -15, s: 45, h: 3 } }); og("opt-convex-quarter", { ...o, imaging: { element: "mirror", f: -15, s: 30, h: 3 } }, false);
    og("opt-collimate", { ...o, imaging: { element: "lens", f: 10, s: 10, h: 3 } }); og("opt-collimate", { ...o, imaging: { element: "lens", f: -10, s: 10, h: 3 } }, false);
    og("opt-just-tir", { ...o, view: "refraction", refraction: { n1: 1.5, n2: 1, theta1: 43 } }); og("opt-just-tir", { ...o, view: "refraction", refraction: { n1: 1.5, n2: 1, theta1: 41 } }, false); og("opt-just-tir", { ...o, view: "refraction", refraction: { n1: 1.5, n2: 1, theta1: 60 } }, false); og("opt-just-tir", { ...o, view: "refraction", refraction: { n1: 1, n2: 1.5, theta1: 80 } }, false);
    const i = (slits) => ({ ...PT.DEFAULT_INTERFERENCE_INPUTS, slits });
    const ig = (id, input, expected = true) => assert.equal(ch(WL.INTERFERENCE_CHALLENGES, id).check(input).met, expected, id);
    ig("int-spacing-4mm", i({ lambdaNm: 500, aUm: 50, dUm: 250, N: 2, L: 2 })); ig("int-spacing-4mm", i({ lambdaNm: 500, aUm: 50, dUm: 200, N: 2, L: 2 }), false); ig("int-spacing-4mm", i({ lambdaNm: 500, aUm: 50, dUm: 250, N: 3, L: 2 }), false);
    ig("int-missing-3", i({ lambdaNm: 500, aUm: 30, dUm: 90, N: 2, L: 2 })); ig("int-missing-3", i({ lambdaNm: 500, aUm: 30, dUm: 100, N: 2, L: 2 }), false);
    ig("int-central-20mm", i({ lambdaNm: 550, aUm: 82.5, dUm: 100, N: 1, L: 1.5 })); ig("int-central-20mm", i({ lambdaNm: 550, aUm: 40, dUm: 100, N: 1, L: 1.5 }), false);
    ig("int-four-secondary", i({ lambdaNm: 550, aUm: 10, dUm: 100, N: 6, L: 1.5 })); ig("int-four-secondary", i({ lambdaNm: 550, aUm: 10, dUm: 100, N: 5, L: 1.5 }), false);
  });
  test("[wrong view] a challenge solved in the wrong view says so instead of passing", () => {
    const c = WL.WAVES_CHALLENGES.find((x) => x.id === "wave-doppler-20"); const r = c.check({ ...clone(PT.DEFAULT_WAVES_INPUTS), view: "travel" });
    assert.equal(r.met, false); assert.match(r.status, /view/i);
  });
  test("[each challenge states a hint and a solution, and names its view where it has one]", () => {
    for (const c of [...WL.WAVES_CHALLENGES, ...WL.OPTICS_CHALLENGES, ...WL.INTERFERENCE_CHALLENGES]) { assert.ok(c.hint.length > 10 && c.solution.length > 10 && c.prompt.length > 30, c.id); }
    for (const c of WL.WAVES_CHALLENGES) assert.ok(PT.WAVE_VIEWS.includes(c.view), c.id);
    for (const c of WL.OPTICS_CHALLENGES) assert.ok(PT.OPTICS_VIEWS.includes(c.view), c.id);
  });
});
