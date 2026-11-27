// Stage 18: metabolic-pathway navigation, strict versioned validators, summaries, saved-analysis round trips, learning consistency with the
// shared network, App wiring and coexistence with earlier subjects and Stage 17 Biochemistry records.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8").replace(/\r\n/g, "\n");
const ok = (r) => { assert.equal(r.ok, true, r.ok ? "" : JSON.stringify(r.error)); return r.value; };
const clone = (v) => JSON.parse(JSON.stringify(v));

let S, store, lib, libApp, BT, B17, B18, N, L, LR, R, E;
before(async () => {
  S = await loadModule("/src/navigation/subjects.ts");
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  libApp = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  BT = await loadModule("/src/utils/persistence/biologyTools.ts");
  B17 = await loadModule("/src/utils/persistence/biochemTools17.ts");
  B18 = await loadModule("/src/utils/persistence/biochemTools18.ts");
  N = await loadModule("/src/utils/biochem/metabolism/network.ts");
  L = await loadModule("/src/utils/biochem/metabolism/ledger.ts");
  LR = await loadModule("/src/utils/biochem/metabolism/learning.ts");
  R = await loadModule("/src/utils/biochem/metabolism/regulation.ts");
  E = await loadModule("/src/utils/biochem/metabolism/etc.ts");
});
after(async () => { await closeEngine(); });

const T = [
  { page: "glycolysis", id: "bcGlycolysis", slug: "glycolysis", defaults: () => B18.DEFAULT_GLYCOLYSIS_INPUTS, validate: (v) => B18.validateGlycolysisInputs(v), summarize: (v) => B18.summarizeGlycolysis(v), describe: (v) => B18.describeGlycolysisAnalysis(v), engine: () => B18.GLYCOLYSIS_ENGINE_VERSION },
  { page: "gluconeogenesis", id: "bcGluconeogenesis", slug: "gluconeogenesis", defaults: () => B18.DEFAULT_GLUCONEOGENESIS_INPUTS, validate: (v) => B18.validateGluconeogenesisInputs(v), summarize: (v) => B18.summarizeGluconeogenesis(v), describe: (v) => B18.describeGluconeogenesisAnalysis(v), engine: () => B18.GLUCONEOGENESIS_ENGINE_VERSION },
  { page: "tca", id: "bcTca", slug: "citric-acid-cycle", defaults: () => B18.DEFAULT_TCA_INPUTS, validate: (v) => B18.validateTcaInputs(v), summarize: (v) => B18.summarizeTca(v), describe: (v) => B18.describeTcaAnalysis(v), engine: () => B18.TCA_ENGINE_VERSION },
  { page: "etc", id: "bcEtc", slug: "electron-transport", defaults: () => B18.DEFAULT_ETC_INPUTS, validate: (v) => B18.validateEtcInputs(v), summarize: (v) => B18.summarizeEtc(v), describe: (v) => B18.describeEtcAnalysis(v), engine: () => B18.ETC_ENGINE_VERSION },
  { page: "metabolism", id: "bcMetabolism", slug: "metabolic-map", defaults: () => B18.DEFAULT_METABOLISM_INPUTS, validate: (v) => B18.validateMetabolismInputs(v), summarize: (v) => B18.summarizeMetabolism(v), describe: (v) => B18.describeMetabolismAnalysis(v), engine: () => B18.METABOLISM_ENGINE_VERSION },
];
const validators = () => Object.fromEntries([
  ...T.map((t) => [t.page, { engineVersion: t.engine(), validateInputs: t.validate, validateResults: BT.validateBiologyResults }]),
  ["enzymes", { engineVersion: B17.ENZYMES_ENGINE_VERSION, validateInputs: B17.validateEnzymesInputs, validateResults: BT.validateBiologyResults }],
]);
const ids = () => { let n = 0; return () => `s18x${(n += 1).toString().padStart(4, "0")}`; };

describe("navigation and registration", () => {
  test("[subject] Biochemistry lists the five metabolic tools in a Metabolism group, with unique ids and slugs, and keeps its three Stage 17 tools", () => {
    const tools = S.BIOCHEMISTRY_TOOLS;
    assert.deepEqual(tools.filter((t) => t.group === "metabolism").map((t) => t.id), ["bcGlycolysis", "bcGluconeogenesis", "bcTca", "bcEtc", "bcMetabolism", "bcFattyAcids", "bcAminoMetabolism", "bcFuel"]);
    assert.deepEqual(tools.filter((t) => t.group === "biomolecules").map((t) => t.id), ["bcAminoAcids", "bcProteins", "bcEnzymes"]);
    assert.equal(new Set(tools.map((t) => t.id)).size, tools.length); assert.equal(new Set(tools.map((t) => t.slug)).size, tools.length);
    assert.ok(S.TOOL_GROUPS.some((g) => g.id === "metabolism"));
  });
  test("[routes] each metabolic deep link round-trips", () => {
    for (const t of T) {
      const hash = S.routeHash({ subject: "biochemistry", toolId: t.id });
      assert.equal(hash, `#/biochemistry/${t.slug}`);
      const r = S.parseRoute(hash); assert.equal(r.subject, "biochemistry"); assert.equal(r.toolId, t.id);
    }
    assert.equal(S.parseRoute("#/biochemistry/not-a-tool")?.toolId ?? "bcOverview", "bcOverview");
  });
  test("[persistence registry] every new page is registered for saving, openable, mapped to its tool and filed under Biochemistry", () => {
    for (const t of T) {
      assert.ok(libApp.OPENABLE_ANALYSIS_PAGES.includes(t.page), t.page);
      assert.equal(libApp.ANALYSIS_APP_PAGE[t.page], t.id);
      assert.equal(store.PAGE_SUBJECT[t.page], "biochemistry");
    }
  });
  test("[App wiring] App lazy-loads and routes every new page, the saved list names them, and the Overview describes each", () => {
    const app = read("src", "App.tsx"), saved = read("src", "components", "SavedAnalysesPage.tsx"), overview = read("src", "components", "biochem", "BiochemOverview.tsx");
    for (const [c, id] of [["GlycolysisPage", "bcGlycolysis"], ["GluconeogenesisPage", "bcGluconeogenesis"], ["CitricAcidPage", "bcTca"], ["ElectronTransportPage", "bcEtc"], ["MetabolicMapPage", "bcMetabolism"]]) {
      assert.match(app, new RegExp(`const ${c} = lazy\\(`)); assert.match(app, new RegExp(`generalTool === "${id}"`)); assert.match(overview, new RegExp(`${id}: \\[`));
    }
    for (const t of T) assert.match(saved, new RegExp(`\\n  ${t.page}: "`));
  });
  test("[existing subjects] the other four subjects still have their tools", () => {
    for (const s of ["organic", "general", "physics", "biology"]) assert.ok(S.SUBJECT_TOOLS[s].length > 0, s);
    assert.equal(S.getSubject("biochemistry").status, "available");
  });
});

describe("strict validation", () => {
  test("defaults validate and reconstruct identical state", () => { for (const t of T) assert.deepEqual(t.validate(clone(t.defaults())), t.defaults(), t.page); });
  test("unknown fields are dropped and unknown ids, out-of-range steps, bad modes and malformed signals are rejected (never coerced)", () => {
    const g = B18.DEFAULT_GLYCOLYSIS_INPUTS;
    assert.equal("junk" in B18.validateGlycolysisInputs({ ...g, junk: 1 }), false);
    for (const bad of [{ mode: "expert" }, { view: "x" }, { step: 11 }, { step: -1 }, { step: 1.5 }, { selected: "PC" }, { selected: "nonexistent" }, { signals: { ...g.signals, atp: "huge" } }, { signals: { atp: "high" } }, { signals: null }, { challenge: -1 }, { tool: "other" }, { subject: "biology" }]) {
      assert.equal(B18.validateGlycolysisInputs({ ...g, ...bad }), null, JSON.stringify(bad));
    }
    const n = B18.DEFAULT_GLUCONEOGENESIS_INPUTS;
    for (const bad of [{ step: 15 }, { selected: "HK" }, { scenario: "weekend" }, { cycle: "other" }]) assert.equal(B18.validateGluconeogenesisInputs({ ...n, ...bad }), null, JSON.stringify(bad));
    assert.notEqual(B18.validateGluconeogenesisInputs({ ...n, selected: "PEPCK", step: 5 }), null);
    const tc = B18.DEFAULT_TCA_INPUTS;
    for (const bad of [{ turns: 3 }, { turns: 1, step: 9 }, { pdhStep: 6 }, { selected: "HK" }]) assert.equal(B18.validateTcaInputs({ ...tc, ...bad }), null, JSON.stringify(bad));
    assert.notEqual(B18.validateTcaInputs({ ...tc, turns: 2, step: 16, selected: "MDH-M" }), null);
    assert.notEqual(B18.validateTcaInputs({ ...tc, selected: "PDH", view: "pdh" }), null);
    const e = B18.DEFAULT_ETC_INPUTS;
    for (const bad of [{ donor: "fadh2" }, { condition: "magic" }, { step: 8 }, { shuttle: "none" }]) assert.equal(B18.validateEtcInputs({ ...e, ...bad }), null, JSON.stringify(bad));
    const m = B18.DEFAULT_METABOLISM_INPUTS;
    for (const bad of [{ level: "cell" }, { pathway: "fermentation" }, { reaction: "nope" }, { metabolite: "water-ish" }, { scenario: "x" }, { shuttle: "x" }]) assert.equal(B18.validateMetabolismInputs({ ...m, ...bad }), null, JSON.stringify(bad));
    assert.notEqual(B18.validateMetabolismInputs({ ...m, pathway: "oxphos", reaction: "ETC-NADH", metabolite: "nadh", level: "reaction", scenario: "uncoupling" }), null);
  });
  test("a full round trip of non-default state is exact", () => {
    const states = [
      { ...B18.DEFAULT_GLYCOLYSIS_INPUTS, mode: "practice", view: "regulation", step: 7, selected: "PGK", signals: { ...R.NORMAL_SIGNALS, atp: "high", f26bp: "high" }, challenge: 3 },
      { ...B18.DEFAULT_GLUCONEOGENESIS_INPUTS, view: "compare", step: 9, selected: "GAPDH", scenario: "fasting", signals: R.signalsFor("fasting"), cycle: "pep-pyr" },
      { ...B18.DEFAULT_TCA_INPUTS, view: "energy", turns: 2, step: 12, selected: "AKGDH", pdhStep: 4 },
      { ...B18.DEFAULT_ETC_INPUTS, view: "inhibitors", donor: "both", condition: "rotenone", step: 5, shuttle: "glycerol-phosphate" },
      { ...B18.DEFAULT_METABOLISM_INPUTS, level: "reaction", pathway: "tca", reaction: "SDH", metabolite: "succinate", scenario: "hypoxia", shuttle: "glycerol-phosphate" },
    ];
    T.forEach((t, i) => assert.deepEqual(t.validate(clone(states[i])), states[i], t.page));
  });
});

describe("saved analyses", () => {
  test("[round trip] every tool saves, lists as Biochemistry and reopens with identical inputs and a rebuilt summary", async () => {
    const real = new lib.AnalysisLibrary(new store.MemoryBackend(), { validators: validators(), newId: ids() });
    for (const t of T) {
      const value = t.defaults(), results = t.summarize(value);
      assert.ok(results && Number.isFinite(results.check) && results.headline.length && results.assumptions.length, t.page);
      const saved = ok(await real.save(t.page, { name: `${t.page} analysis`, summary: t.describe(value), inputs: value, results: { computedAt: "2026-11-14T00:00:00.000Z", engineVersion: t.engine(), stale: false, status: "complete", data: results } }));
      assert.equal(saved.subject, "biochemistry");
      const opened = ok(await real.open(saved.id));
      assert.deepEqual(opened.inputs, value); assert.equal(opened.resultsDropped, false);
      assert.deepEqual(t.summarize(opened.inputs), results);
    }
    const list = ok(await real.list()); assert.equal(list.problems.length, 0); assert.ok(list.items.every((i) => i.subject === "biochemistry"));
  });
  test("[integrity] damaged records are refused", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    const make = async (page, inputs, mutate) => { const r = ok(await real.save(page, { name: page, summary: "s", inputs, results: null })); const raw = JSON.parse(backend.map.get(r.id)); mutate(raw); backend.map.set(r.id, JSON.stringify(raw)); return r.id; };
    const bad = [
      await make("glycolysis", B18.DEFAULT_GLYCOLYSIS_INPUTS, (r) => { r.subject = "biology"; }),
      await make("glycolysis", B18.DEFAULT_GLYCOLYSIS_INPUTS, (r) => { r.inputs.step = 99; }),
      await make("glycolysis", B18.DEFAULT_GLYCOLYSIS_INPUTS, (r) => { r.inputs.signals.atp = "enormous"; }),
      await make("gluconeogenesis", B18.DEFAULT_GLUCONEOGENESIS_INPUTS, (r) => { r.inputs.selected = "HK"; }),
      await make("tca", B18.DEFAULT_TCA_INPUTS, (r) => { r.inputs.turns = 5; }),
      await make("etc", B18.DEFAULT_ETC_INPUTS, (r) => { r.inputs.condition = "hydrogen peroxide"; }),
      await make("metabolism", B18.DEFAULT_METABOLISM_INPUTS, (r) => { r.inputs.pathway = "krebs"; }),
    ];
    for (const id of bad) assert.equal((await real.open(id)).ok, false, id);
  });
  test("[compatibility] Stage 17 Biochemistry records and Biology records still save and open alongside Stage 18 records", async () => {
    const v = { ...validators(), dogma: { engineVersion: BT.DOGMA_ENGINE_VERSION, validateInputs: BT.validateDogmaInputs, validateResults: BT.validateBiologyResults } };
    const real = new lib.AnalysisLibrary(new store.MemoryBackend(), { validators: v, newId: ids() });
    const a = ok(await real.save("dogma", { name: "d", summary: "s", inputs: BT.DEFAULT_DOGMA_INPUTS, results: null }));
    const b = ok(await real.save("enzymes", { name: "e", summary: "s", inputs: B17.DEFAULT_ENZYMES_INPUTS, results: null }));
    const c = ok(await real.save("etc", { name: "t", summary: "s", inputs: B18.DEFAULT_ETC_INPUTS, results: null }));
    for (const r of [a, b, c]) assert.equal((await real.open(r.id)).ok, true);
    assert.deepEqual(ok(await real.list()).items.map((i) => i.subject).sort(), ["biochemistry", "biochemistry", "biology"]);
  });
  test("[summaries are rebuilt from state] the summary numbers equal the engine's own figures", () => {
    assert.equal(B18.summarizeGlycolysis(B18.DEFAULT_GLYCOLYSIS_INPUTS).check, 2);
    assert.equal(B18.summarizeGluconeogenesis(B18.DEFAULT_GLUCONEOGENESIS_INPUTS).check, 6);
    assert.equal(B18.summarizeTca(B18.DEFAULT_TCA_INPUTS).check, 3);
    assert.equal(B18.summarizeEtc(B18.DEFAULT_ETC_INPUTS).check, 10);
    assert.equal(B18.summarizeEtc({ ...B18.DEFAULT_ETC_INPUTS, donor: "succinate" }).check, 6);
    assert.equal(B18.summarizeEtc({ ...B18.DEFAULT_ETC_INPUTS, condition: "cyanide" }).check, 0);
    assert.equal(B18.summarizeMetabolism(B18.DEFAULT_METABOLISM_INPUTS).check, 32);
    assert.equal(B18.summarizeMetabolism({ ...B18.DEFAULT_METABOLISM_INPUTS, shuttle: "glycerol-phosphate" }).check, 30);
  });
});

describe("learning content follows the data", () => {
  const all = () => [
    ...LR.glycolysisQuestions(0), ...LR.glycolysisQuestions(5), ...LR.gluconeogenesisQuestions(), ...LR.tcaQuestions(), ...LR.tcaPredictions(), ...LR.etcQuestions(), ...LR.mapQuestions("malate-aspartate"),
    ...LR.glycolysisChallenges().map((c) => c.question), ...LR.gluconeogenesisChallenges().map((c) => c.question), ...LR.etcChallenges().map((c) => c.question), ...LR.mapChallenges().map((c) => c.question),
  ];
  test("every question has an answer index inside its options, no duplicate options, unique ids per set, and a non-empty explanation", () => {
    for (const q of all()) {
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, q.id);
      assert.equal(new Set(q.options).size, q.options.length, `${q.id} options`);
      assert.ok(q.options.length >= 3 && q.explanation.length > 20, q.id);
    }
    for (const set of [LR.glycolysisQuestions(5), LR.gluconeogenesisQuestions(), LR.tcaQuestions(), LR.etcQuestions(), LR.mapQuestions("malate-aspartate")]) assert.equal(new Set(set.map((q) => q.id)).size, set.length);
  });
  test("independently known answers: ATP-consuming glycolytic enzymes, bypass of PFK-1, NADH per turn, protons per NADH, uncoupler effect on O2", () => {
    const ans = (q) => q.options[q.answer];
    assert.match(ans(LR.glycolysisQuestions(0).find((q) => q.id === "gly-spend")), /Hexokinase and PFK-1/);
    assert.match(ans(LR.glycolysisQuestions(0).find((q) => q.id === "gly-net")), /4 made, 2 net/);
    assert.equal(ans(LR.gluconeogenesisQuestions().find((q) => q.id === "gng-pfk")), "FBPase-1");
    assert.match(ans(LR.gluconeogenesisQuestions().find((q) => q.id === "gng-cost")), /^6 /);
    assert.equal(ans(LR.tcaQuestions().find((q) => q.id === "tca-nadh")), "3");
    assert.equal(ans(LR.tcaQuestions().find((q) => q.id === "tca-co2")), "2");
    assert.equal(ans(LR.tcaQuestions().find((q) => q.id === "tca-glucose")), "8");
    assert.equal(ans(LR.etcQuestions().find((q) => q.id === "etc-h-nadh")), "10");
    assert.equal(ans(LR.etcQuestions().find((q) => q.id === "etc-h-fadh")), "6");
    assert.equal(ans(LR.etcQuestions().find((q) => q.id === "etc-cii")), "No");
    assert.match(ans(LR.etcQuestions().find((q) => q.id === "etc-unc")), /O₂ consumption rises; ATP synthesis falls/);
    assert.match(ans(LR.etcQuestions().find((q) => q.id === "etc-cn")), /stops/);
  });
  test("challenge reveals only name states the validators accept", () => {
    for (const c of LR.glycolysisChallenges()) assert.notEqual(B18.validateGlycolysisInputs({ ...B18.DEFAULT_GLYCOLYSIS_INPUTS, signals: { ...R.NORMAL_SIGNALS, ...c.reveal.signals }, view: c.reveal.view }), null);
    for (const c of LR.gluconeogenesisChallenges()) assert.notEqual(B18.validateGluconeogenesisInputs({ ...B18.DEFAULT_GLUCONEOGENESIS_INPUTS, scenario: c.reveal.scenario, view: c.reveal.view }), null);
    for (const c of LR.etcChallenges()) assert.notEqual(B18.validateEtcInputs({ ...B18.DEFAULT_ETC_INPUTS, condition: c.reveal.condition, donor: c.reveal.donor, view: c.reveal.view }), null);
    for (const c of LR.mapChallenges()) assert.notEqual(B18.validateMetabolismInputs({ ...B18.DEFAULT_METABOLISM_INPUTS, scenario: c.reveal.scenario }), null);
  });
  test("every integrated-map scenario produces statements, each labelled with a supported basis; uncertain quantities are marked as not modelled", () => {
    for (const s of LR.MAP_SCENARIOS) {
      const out = LR.mapScenarioOutcome(s.id, "malate-aspartate");
      assert.ok(out.length >= 1, s.id);
      for (const st of out) assert.ok(st.basis in LR.BASIS_LABEL, `${s.id}: ${st.basis}`);
      if (s.id !== "baseline") assert.ok(out.some((st) => st.basis === "not-modelled"), `${s.id} states what is not modelled`);
    }
  });
  test("map scenarios agree with the regulation and respiratory models they cite", () => {
    const fasting = LR.mapScenarioOutcome("fasting", "malate-aspartate").map((s) => s.text).join(" ");
    assert.match(fasting, /FBPase-1: higher/); assert.match(fasting, /PFK-1: lower/);
    const unc = LR.mapScenarioOutcome("uncoupling", "malate-aspartate").map((s) => s.text).join(" ");
    assert.match(unc, /O₂ consumption rises/); assert.match(unc, /gradient collapses/);
    const o = E.etcOutcome(["nadh", "succinate"], "hypoxia");
    assert.match(LR.mapScenarioOutcome("hypoxia", "malate-aspartate")[0].text, new RegExp(`Electron transport ${o.electronFlow}`));
  });
  test("no text claims experimental validation or a computed flux", () => {
    const text = JSON.stringify([all(), LR.MAP_SCENARIOS.flatMap((s) => LR.mapScenarioOutcome(s.id, "malate-aspartate")), B18.METABOLIC_ASSUMPTIONS]);
    assert.doesNotMatch(text, /experimentally validated|validated against experiment/i);
    assert.match(B18.METABOLIC_ASSUMPTIONS.join(" "), /not a kinetic or flux model/);
  });
});
