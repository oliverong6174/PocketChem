// Stage 25: navigation, strict versioned validators, summaries, saved-analysis round trips, concept search and related-learning links, App wiring and
// coexistence with earlier Biochemistry records, for the three lipid / nitrogen / fuel laboratories.
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

let S, store, lib, libApp, BT, B17, B18, B25, CI, Q, REL;
before(async () => {
  S = await loadModule("/src/navigation/subjects.ts");
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  libApp = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  BT = await loadModule("/src/utils/persistence/biologyTools.ts");
  B17 = await loadModule("/src/utils/persistence/biochemTools17.ts");
  B18 = await loadModule("/src/utils/persistence/biochemTools18.ts");
  B25 = await loadModule("/src/utils/persistence/biochemTools25.ts");
  CI = await loadModule("/src/utils/concepts/conceptIndex.ts");
  Q = await loadModule("/src/utils/concepts/search.ts");
  REL = await loadModule("/src/utils/concepts/relations.ts");
});
after(async () => { await closeEngine(); });

const T = [
  { page: "fattyacids", id: "bcFattyAcids", slug: "fatty-acids-ketone-bodies", defaults: () => B25.DEFAULT_FATTYACID_INPUTS, validate: (v) => B25.validateFattyAcidInputs(v), summarize: (v) => B25.summarizeFattyAcid(v), describe: (v) => B25.describeFattyAcidAnalysis(v), engine: () => B25.FATTYACIDS_ENGINE_VERSION },
  { page: "aminometabolism", id: "bcAminoMetabolism", slug: "amino-acid-metabolism", defaults: () => B25.DEFAULT_AMINO_INPUTS, validate: (v) => B25.validateAminoInputs(v), summarize: (v) => B25.summarizeAmino(v), describe: (v) => B25.describeAminoAnalysis(v), engine: () => B25.AMINOMETABOLISM_ENGINE_VERSION },
  { page: "fuelmetabolism", id: "bcFuel", slug: "fuel-metabolism", defaults: () => B25.DEFAULT_FUEL_INPUTS, validate: (v) => B25.validateFuelInputs(v), summarize: (v) => B25.summarizeFuel(v), describe: (v) => B25.describeFuelAnalysis(v), engine: () => B25.FUELMETABOLISM_ENGINE_VERSION },
];
const validators = () => Object.fromEntries([
  ...T.map((t) => [t.page, { engineVersion: t.engine(), validateInputs: t.validate, validateResults: BT.validateBiologyResults }]),
  ["etc", { engineVersion: B18.ETC_ENGINE_VERSION, validateInputs: B18.validateEtcInputs, validateResults: BT.validateBiologyResults }],
  ["enzymes", { engineVersion: B17.ENZYMES_ENGINE_VERSION, validateInputs: B17.validateEnzymesInputs, validateResults: BT.validateBiologyResults }],
]);
const ids = () => { let n = 0; return () => `s25x${(n += 1).toString().padStart(4, "0")}`; };

describe("navigation and registration", () => {
  test("[subject] three new functional tools in the Metabolism group with unique ids and slugs; earlier tools unchanged", () => {
    const tools = S.BIOCHEMISTRY_TOOLS;
    assert.deepEqual(tools.filter((t) => t.group === "metabolism").map((t) => t.id).slice(-3), ["bcFattyAcids", "bcAminoMetabolism", "bcFuel"]);
    assert.deepEqual(tools.filter((t) => t.group === "biomolecules").map((t) => t.id), ["bcAminoAcids", "bcProteins", "bcEnzymes"]);
    for (const t of T) { const d = tools.find((x) => x.id === t.id); assert.ok(d, t.id); assert.equal(d.slug, t.slug); }
    assert.equal(new Set(tools.map((t) => t.id)).size, tools.length); assert.equal(new Set(tools.map((t) => t.slug)).size, tools.length);
  });
  test("[persistence registry] pages are persisted, openable, mapped to their tool and assigned to Biochemistry", () => {
    for (const t of T) {
      assert.equal(store.PAGE_SUBJECT[t.page], "biochemistry"); assert.ok(libApp.OPENABLE_ANALYSIS_PAGES.includes(t.page)); assert.equal(libApp.ANALYSIS_APP_PAGE[t.page], t.id);
      assert.ok(S.SUBJECT_TOOLS.biochemistry.some((x) => x.id === t.id));
    }
  });
  test("[App wiring] App lazy-loads and routes each page, the saved list names them and the Overview describes each", () => {
    const app = read("src", "App.tsx"), saved = read("src", "components", "SavedAnalysesPage.tsx"), overview = read("src", "components", "biochem", "BiochemOverview.tsx");
    for (const [c, id] of [["FattyAcidPage", "bcFattyAcids"], ["AminoMetabolismPage", "bcAminoMetabolism"], ["FuelMetabolismPage", "bcFuel"]]) {
      assert.ok(app.includes(`lazy(() => import("./components/biochem/metabolism/${c}"))`), c); assert.ok(app.includes(`generalTool === "${id}"`), id); assert.ok(app.includes(`target === "${id}"`), `${id} cross-subject open`);
      assert.ok(overview.includes(`${id}: [`), `${id} overview`); assert.ok(fs.existsSync(path.join(root, "src", "components", "biochem", "metabolism", `${c}.tsx`)));
    }
    for (const label of ["Fatty-acid and ketone-body metabolism", "Amino-acid metabolism and urea cycle", "Integrated fuel metabolism"]) assert.ok(saved.includes(label), label);
  });
});

describe("validators and persistence", () => {
  test("defaults validate and a full round trip of non-default state is exact", () => {
    const states = [
      { ...B25.DEFAULT_FATTYACID_INPUTS, mode: "practice", view: "oxidation", chain: 12, step: 9, shuttleStep: 2, synthStep: 11, acetylSource: "cytosolic", ketoneMode: "ketolysis", ketoneForm: "bhb", ketoneStep: 3, conditions: { hormone: "glucagon", energy: "low", citrate: "low", acylCoa: "high" }, challenge: 4 },
      { ...B25.DEFAULT_AMINO_INPUTS, mode: "challenge", view: "urea", aa: "L", transSubstrate: "V", plpStep: 5, gdhDirection: "amination", gdhCofactor: "nadp", ureaStep: 4, selected: "ASS", nag: false, arginine: "high", nitrogenExample: "liver-urea", challenge: 2 },
      { ...B25.DEFAULT_FUEL_INPUTS, mode: "practice", display: "scenario", focus: "ketone", pathway: "ketogenesis", metabolite: "acetylcoa", reaction: "HMGCS2", scenario: "fasting-fao", tissue: "extrahepatic", shuttle: "glycerol-phosphate", challenge: 1 },
    ];
    T.forEach((t, i) => { assert.notEqual(t.validate(clone(t.defaults())), null, t.page); assert.deepEqual(t.validate(clone(states[i])), states[i], t.page); });
  });
  test("odd-chain and oleate states round trip; oleate requires chain 18", () => {
    const odd = { ...B25.DEFAULT_FATTYACID_INPUTS, chain: 15, view: "energy", step: 24 }; assert.deepEqual(B25.validateFattyAcidInputs(clone(odd)), odd);
    const ole = { ...B25.DEFAULT_FATTYACID_INPUTS, chain: 18, substrate: "oleate", step: 32 }; assert.deepEqual(B25.validateFattyAcidInputs(clone(ole)), ole);
    assert.equal(B25.validateFattyAcidInputs({ ...ole, chain: 16 }), null);
  });
  test("invalid values are rejected, never coerced", () => {
    const f = B25.DEFAULT_FATTYACID_INPUTS;
    for (const bad of [{ chain: 2 }, { chain: 20 }, { chain: 16.5 }, { chain: "16" }, { view: "peroxisome" }, { step: 29 }, { step: -1 }, { shuttleStep: 5 }, { activationStep: 4 }, { synthStep: 45 }, { substrate: "linoleate" }, { acetylSource: "acetate" }, { ketoneMode: "both" }, { ketoneForm: "acetone" }, { ketoneStep: 6 }, { mode: "expert" }, { challenge: -2 }, { tool: "other" }, { conditions: { hormone: "insulin" } }, { conditions: { hormone: "x", energy: "low", citrate: "low", acylCoa: "low" } }])
      assert.equal(B25.validateFattyAcidInputs({ ...f, ...bad }), null, JSON.stringify(bad));
    assert.equal(B25.validateFattyAcidInputs({ ...f, chain: 8, step: 13 }), null, "C8 has only 12 steps");
    assert.notEqual(B25.validateFattyAcidInputs({ ...f, chain: 8, step: 12 }), null);
    const a = B25.DEFAULT_AMINO_INPUTS;
    for (const bad of [{ aa: "B" }, { aa: "Ala" }, { transSubstrate: "G" }, { plpStep: 9 }, { ureaStep: 9 }, { selected: "HK" }, { gdhDirection: "up" }, { gdhCofactor: "fad" }, { nag: "yes" }, { arginine: "low" }, { nitrogenExample: "x" }, { view: "x" }])
      assert.equal(B25.validateAminoInputs({ ...a, ...bad }), null, JSON.stringify(bad));
    const u = B25.DEFAULT_FUEL_INPUTS;
    for (const bad of [{ focus: "all" }, { pathway: "fermentation" }, { metabolite: "water-ish" }, { reaction: "nope" }, { scenario: "weekend" }, { tissue: "brain" }, { shuttle: "none" }, { display: "x" }, { challenge: 1e9 }])
      assert.equal(B25.validateFuelInputs({ ...u, ...bad }), null, JSON.stringify(bad));
    assert.notEqual(B25.validateFuelInputs({ ...u, reaction: "ACAD:16" }), null, "palmitate instance is a registered reaction");
    assert.equal(B25.validateFuelInputs({ ...u, reaction: "ACAD:12" }), null, "generated chain-length reactions are not saved selections");
  });
  test("summaries are rebuilt from state and agree with the engines", () => {
    assert.equal(B25.summarizeFattyAcid({ ...B25.DEFAULT_FATTYACID_INPUTS, chain: 16 }).check, 106);
    assert.equal(B25.summarizeFattyAcid({ ...B25.DEFAULT_FATTYACID_INPUTS, chain: 18, substrate: "oleate" }).check, 118.5);
    assert.equal(B25.summarizeFattyAcid({ ...B25.DEFAULT_FATTYACID_INPUTS, chain: 15 }).check, 2, "odd chain falls back to the activation cost, with no ATP claim");
    assert.ok(!B25.summarizeFattyAcid({ ...B25.DEFAULT_FATTYACID_INPUTS, chain: 15 }).headline.join(" ").includes("conventional"));
    assert.equal(B25.summarizeAmino(B25.DEFAULT_AMINO_INPUTS).check, 4);
    assert.equal(B25.summarizeFuel(B25.DEFAULT_FUEL_INPUTS).check, 106);
    assert.ok(B25.summarizeFuel(B25.DEFAULT_FUEL_INPUTS).headline[0].includes("Glucose 32"));
  });
});

describe("saved analyses", () => {
  test("[round trip] every tool saves, lists as Biochemistry and reopens with identical inputs and a rebuilt summary", async () => {
    const real = new lib.AnalysisLibrary(new store.MemoryBackend(), { validators: validators(), newId: ids() });
    for (const t of T) {
      const value = t.defaults(), results = t.summarize(value);
      assert.ok(results && Number.isFinite(results.check) && results.headline.length && results.assumptions.length, t.page);
      const saved = ok(await real.save(t.page, { name: `${t.page} analysis`, summary: t.describe(value), inputs: value, results: { computedAt: "2026-11-19T00:00:00.000Z", engineVersion: t.engine(), stale: false, status: "complete", data: results } }));
      assert.equal(saved.subject, "biochemistry");
      const opened = ok(await real.open(saved.id));
      assert.deepEqual(opened.inputs, value); assert.equal(opened.resultsDropped, false); assert.deepEqual(t.summarize(opened.inputs), results);
    }
    const list = ok(await real.list()); assert.equal(list.problems.length, 0); assert.ok(list.items.every((i) => i.subject === "biochemistry"));
  });
  test("[integrity] damaged records are refused", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    const make = async (page, inputs, mutate) => { const r = ok(await real.save(page, { name: page, summary: "s", inputs, results: null })); const raw = JSON.parse(backend.map.get(r.id)); mutate(raw); backend.map.set(r.id, JSON.stringify(raw)); return r.id; };
    const bad = [
      await make("fattyacids", B25.DEFAULT_FATTYACID_INPUTS, (r) => { r.subject = "biology"; }),
      await make("fattyacids", B25.DEFAULT_FATTYACID_INPUTS, (r) => { r.inputs.chain = 3; }),
      await make("fattyacids", B25.DEFAULT_FATTYACID_INPUTS, (r) => { r.inputs.conditions.energy = "enormous"; }),
      await make("aminometabolism", B25.DEFAULT_AMINO_INPUTS, (r) => { r.inputs.aa = "Z"; }),
      await make("aminometabolism", B25.DEFAULT_AMINO_INPUTS, (r) => { r.inputs.ureaStep = 99; }),
      await make("fuelmetabolism", B25.DEFAULT_FUEL_INPUTS, (r) => { r.inputs.scenario = "x"; }),
    ];
    for (const id of bad) assert.equal((await real.open(id)).ok, false, id);
  });
  test("[compatibility] Stage 17 and Stage 18 Biochemistry records and Biology records coexist with Stage 25 records", async () => {
    const v = { ...validators(), dogma: { engineVersion: BT.DOGMA_ENGINE_VERSION, validateInputs: BT.validateDogmaInputs, validateResults: BT.validateBiologyResults } };
    const real = new lib.AnalysisLibrary(new store.MemoryBackend(), { validators: v, newId: ids() });
    const a = ok(await real.save("dogma", { name: "d", summary: "s", inputs: BT.DEFAULT_DOGMA_INPUTS, results: null }));
    const b = ok(await real.save("enzymes", { name: "e", summary: "s", inputs: B17.DEFAULT_ENZYMES_INPUTS, results: null }));
    const c = ok(await real.save("etc", { name: "t", summary: "s", inputs: B18.DEFAULT_ETC_INPUTS, results: null }));
    const d = ok(await real.save("fattyacids", { name: "f", summary: "s", inputs: B25.DEFAULT_FATTYACID_INPUTS, results: null }));
    for (const r of [a, b, c, d]) assert.equal((await real.open(r.id)).ok, true);
    assert.deepEqual(ok(await real.list()).items.map((i) => i.subject).sort(), ["biochemistry", "biochemistry", "biochemistry", "biology"]);
  });
});

describe("global concept search and related-learning links", () => {
  const dest = (q) => Q.searchConcepts(q)[0]?.destination?.toolId;
  test("concept index remains valid and each new concept points at a real new tool", () => {
    assert.deepEqual(CI.validateConceptIndex(), []);
    for (const id of ["bc-beta-oxidation", "bc-fatty-acid-activation", "bc-fatty-acid-synthesis", "bc-ketone-bodies", "bc-amino-acid-catabolism", "bc-transamination", "bc-glutamate-dehydrogenase", "bc-urea-cycle", "bc-fuel-metabolism"]) {
      const c = CI.CONCEPTS.find((x) => x.id === id); assert.ok(c, id); assert.ok(["bcFattyAcids", "bcAminoMetabolism", "bcFuel"].includes(c.destination.toolId), id);
    }
  });
  test("search finds the new laboratories from common names", () => {
    for (const [q, tool] of [["beta oxidation", "bcFattyAcids"], ["carnitine shuttle", "bcFattyAcids"], ["ketone bodies", "bcFattyAcids"], ["fatty acid synthesis", "bcFattyAcids"], ["urea cycle", "bcAminoMetabolism"], ["transamination", "bcAminoMetabolism"], ["glucogenic amino acids", "bcAminoMetabolism"], ["oxidative deamination", "bcAminoMetabolism"], ["fuel metabolism", "bcFuel"]])
      assert.equal(dest(q), tool, q);
  });
  test("relations are valid and connect the required topics", () => {
    assert.deepEqual(REL.validateRelations(), []);
    const has = (from, to) => REL.RELATIONS.some((r) => r.from.toolId === from && r.to.toolId === to);
    assert.ok(has("bcFattyAcids", "bcTca")); assert.ok(has("bcFattyAcids", "bcEtc")); assert.ok(has("bcAminoAcids", "bcAminoMetabolism")); assert.ok(has("bcGluconeogenesis", "bcAminoMetabolism"));
    assert.ok(has("bcAminoMetabolism", "bcTca")); assert.ok(has("bcFattyAcids", "bcMetabolism")); assert.ok(has("bcFuel", "bcAminoMetabolism"));
    for (const r of REL.RELATIONS.filter((x) => ["bcFattyAcids", "bcAminoMetabolism", "bcFuel"].includes(x.from.toolId))) assert.ok(r.caution, `${r.id} states it is conceptual`);
  });
});
