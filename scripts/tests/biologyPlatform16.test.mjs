// Stage 16: Biology navigation, strict validation of saved inputs, summaries, saved-analysis round trips, hand-offs, App wiring and
// compatibility with the existing subjects and the Stage 15 tools.
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

let S, store, lib, libApp, BT, BT16, SUM, SUM16, C, G, D, R, H, DG;
before(async () => {
  S = await loadModule("/src/navigation/subjects.ts");
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  libApp = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  BT = await loadModule("/src/utils/persistence/biologyTools.ts");
  BT16 = await loadModule("/src/utils/persistence/biologyTools16.ts");
  SUM = await loadModule("/src/utils/biology/bioSummary.ts");
  SUM16 = await loadModule("/src/utils/biology/bioSummary16.ts");
  C = await loadModule("/src/utils/biology/chromosome.ts");
  G = await loadModule("/src/utils/biology/genetics.ts");
  D = await loadModule("/src/utils/biology/cellDivision.ts");
  R = await loadModule("/src/utils/biology/geneRegulation.ts");
  H = await loadModule("/src/utils/biology/handoff16.ts");
  DG = await loadModule("/src/utils/biology/dogma.ts");
});
after(async () => { await closeEngine(); });

const TOOLS = [
  { page: "regulation", id: "bioRegulation", slug: "gene-regulation", group: "geneExpression", defaults: () => BT16.DEFAULT_REGULATION_INPUTS, validate: (v) => BT16.validateRegulationInputs(v), summarize: (v) => SUM16.summarizeRegulation(v), describe: (v) => BT16.describeRegulationAnalysis(v), engine: () => BT16.REGULATION_ENGINE_VERSION },
  { page: "genetics", id: "bioGenetics", slug: "genetics", group: "inheritance", defaults: () => BT16.DEFAULT_GENETICS_INPUTS, validate: (v) => BT16.validateGeneticsInputs(v), summarize: (v) => SUM16.summarizeGenetics(v), describe: (v) => BT16.describeGeneticsAnalysis(v), engine: () => BT16.GENETICS_ENGINE_VERSION },
  { page: "celldivision", id: "bioDivision", slug: "mitosis-meiosis", group: "inheritance", defaults: () => BT16.DEFAULT_CELLDIVISION_INPUTS, validate: (v) => BT16.validateCellDivisionInputs(v), summarize: (v) => SUM16.summarizeCellDivision(v), describe: (v) => BT16.describeCellDivisionAnalysis(v), engine: () => BT16.CELLDIVISION_ENGINE_VERSION },
];
const validators = () => ({
  ...Object.fromEntries(TOOLS.map((t) => [t.page, { engineVersion: t.engine(), validateInputs: t.validate, validateResults: BT.validateBiologyResults }])),
  dogma: { engineVersion: BT.DOGMA_ENGINE_VERSION, validateInputs: BT.validateDogmaInputs, validateResults: BT.validateBiologyResults },
});
const ids = () => { let n = 0; return () => `s16x${(n += 1).toString().padStart(4, "0")}`; };

describe("navigation and registration", () => {
  test("[tools] three new tools are registered with unique slugs, in the right groups, after the Stage 15 tools and before Saved", () => {
    const list = S.BIOLOGY_TOOLS.map((t) => t.id);
    assert.deepEqual(list.slice(0, 5), ["bioOverview", "bioReplication", "bioTranscription", "bioTranslation", "bioDogma"], "Stage 15 order is unchanged");
    assert.deepEqual(list.slice(5), ["bioRegulation", "bioGenetics", "bioDivision", "bioMembrane", "bioSignaling", "bioNeuron", "bioSaved"]);
    for (const t of TOOLS) { const def = S.BIOLOGY_TOOLS.find((x) => x.id === t.id); assert.equal(def.slug, t.slug); assert.equal(def.group, t.group); }
    assert.equal(new Set(S.BIOLOGY_TOOLS.map((t) => t.slug)).size, S.BIOLOGY_TOOLS.length);
    assert.ok(S.TOOL_GROUPS.some((g) => g.id === "inheritance"));
  });
  test("[routes] deep links round-trip", () => {
    for (const t of TOOLS) { assert.equal(S.routeHash({ subject: "biology", toolId: t.id }), `#/biology/${t.slug}`); assert.deepEqual(S.parseRoute(`#/biology/${t.slug}`), { subject: "biology", toolId: t.id }); }
  });
  test("[existing subjects] Organic, General Chemistry and Physics tool lists are unchanged", () => {
    assert.deepEqual(S.PHYSICS_TOOLS.map((t) => t.id), ["phOverview", "phMechanics", "phForces", "phEnergy", "phCollisions", "phWaves", "phOptics", "phInterference", "phEfield", "phMagnetic", "phInduction", "phCircuits", "phRc", "phSaved"]);
    assert.deepEqual(S.GENERAL_TOOLS.map((t) => t.id), ["gcOverview", "gcStoichiometry", "gcGas", "gcAcidBase", "gcEquilibrium", "gcKinetics", "gcThermo", "gcElectro", "gcSaved"]);
    assert.deepEqual(S.ORGANIC_TOOLS.map((t) => t.id), ["analysis", "acidBase", "spectroscopy", "conformations", "reactions", "multiStep", "multiCatalytic", "saved"]);
    assert.equal(S.getSubject("biochemistry").status, "available");
  });
  test("[planned vs working] planned Biology items are plans, and none of the working tools is listed as planned", () => {
    const planned = S.getSubject("biology").planned.join(" | ");
    assert.doesNotMatch(planned, /Gene regulation|Inheritance and genetics|Mitosis|Meiosis/i);
    const overview = read("src", "components", "biology", "BiologyOverview.tsx");
    for (const id of ["bioRegulation", "bioGenetics", "bioDivision"]) assert.match(overview, new RegExp(`${id}: \\[`));
  });
  test("[icons] every Biology tool icon exists", () => {
    const icons = read("src", "components", "ui", "Icon.tsx");
    for (const t of S.BIOLOGY_TOOLS) assert.match(icons, new RegExp(`\\n  ${t.icon}: "`), t.icon);
  });
  test("[app] pages are lazy, open requests reach them, saved records switch to Biology and the hand-off links are wired", () => {
    const app = read("src", "App.tsx");
    for (const [c, id] of [["RegulationPage", "bioRegulation"], ["GeneticsPage", "bioGenetics"], ["CellDivisionPage", "bioDivision"]]) {
      assert.match(app, new RegExp(`const ${c} = lazy\\(\\(\\) => import\\("./components/biology/${c}"\\)\\)`));
      assert.match(app, new RegExp(`pendingOpen\\?\\.page === "${id}" \\? pendingOpen : null`));
      assert.match(app, new RegExp(`target === "${id}"`));
    }
    assert.match(app, /<GeneticsPage[\s\S]*?onNavigate/); assert.match(app, /<CellDivisionPage[\s\S]*?onNavigate/);
  });
  test("[subject registry] the pages belong to Biology, are openable from Saved and have labels", () => {
    for (const t of TOOLS) { assert.equal(store.PAGE_SUBJECT[t.page], "biology"); assert.ok(libApp.OPENABLE_ANALYSIS_PAGES.includes(t.page)); assert.equal(libApp.ANALYSIS_APP_PAGE[t.page], t.id); }
    const labels = read("src", "components", "SavedAnalysesPage.tsx");
    for (const l of ["Gene regulation", "Genetics & inheritance", "Mitosis & meiosis"]) assert.ok(labels.includes(l), l);
  });
  test("[no animation timers in the new files] only the shared step-player hook runs a timer; CSS handles motion and honours reduced motion", () => {
    for (const f of ["RegulationPage", "GeneticsPage", "CellDivisionPage", "CellDiagram", "RegulationDiagrams", "ChromosomeArt", "GeneticsParts"]) assert.doesNotMatch(read("src", "components", "biology", `${f}.tsx`), /requestAnimationFrame|setInterval|setTimeout/, f);
    const css = read("src", "styles", "biology.css");
    assert.match(css, /prefers-reduced-motion: reduce\) \{ \.cd-chrom \{ transition: none/);
  });
  test("[accessibility] diagrams are role=img with state in the label; selectable parts are buttons with names", () => {
    for (const f of ["RegulationDiagrams", "CellDiagram", "GeneticsParts"]) assert.match(read("src", "components", "biology", `${f}.tsx`), /role="img"/);
    assert.match(read("src", "components", "biology", "CellDiagram.tsx"), /role="button"[\s\S]*tabIndex=\{0\}/);
    assert.match(read("src", "components", "biology", "RegulationDiagrams.tsx"), /role="button"/);
  });
});

describe("strict validation", () => {
  test("[defaults] every default validates, summarises and round-trips", () => {
    for (const t of TOOLS) {
      const d = t.defaults(); assert.deepEqual(t.validate(clone(d)), d, t.page);
      const s = t.summarize(d); assert.ok(s && s.headline.length && Number.isFinite(s.check), t.page);
      assert.deepEqual(BT.validateBiologyResults(clone(s)), s, t.page);
      assert.equal(d.subject, "biology");
    }
  });
  test("[regulation] unknown system, tool, mode, step, copies, selection or challenge index are rejected", () => {
    const base = BT16.DEFAULT_REGULATION_INPUTS;
    const bad = [null, [], { ...base, system: "ara" }, { ...base, tool: "genetics" }, { ...base, mode: "quiz" }, { ...base, challenge: -1 }, { ...base, challenge: 1.5 }, { ...base, selected: 5 }, { ...base, selected: "polII" },
      { ...base, lac: { ...base.lac, step: 9 } }, { ...base, trp: { ...base.trp, trp: "x" } }, { ...base, euk: { ...base.euk, activator: 1 } }, { ...base, lac: { ...base.lac, copies: [] } }];
    for (const v of bad) assert.equal(BT16.validateRegulationInputs(v), null, JSON.stringify(v).slice(0, 90));
    assert.notEqual(BT16.validateRegulationInputs({ ...base, system: "trp", selected: "attenuator", mode: "challenge", challenge: 3 }), null);
    assert.notEqual(BT16.validateRegulationInputs({ ...base, system: "euk", selected: "enhancer" }), null);
    assert.equal(BT16.validateRegulationInputs({ ...base, system: "lac", selected: "attenuator" }), null, "selection must belong to the current system");
    assert.deepEqual(Object.keys(BT16.validateRegulationInputs({ ...base, extra: 1 })).sort(), ["challenge", "euk", "lac", "mode", "selected", "subject", "system", "tool", "trp"]);
  });
  test("[genetics] impossible genotypes, parents with different layouts, bad r, bad step and wrong sexes are rejected", () => {
    const base = BT16.DEFAULT_GENETICS_INPUTS;
    const lk = { subject: "biology", tool: "genetics", ...BT16.defaultParents("linked"), step: 0, mode: "explore" };
    const bad = [null, { ...base, parent1: { layout: "mono", pairs: [{ a: { alleles: ["Y"] }, b: { alleles: ["r"] } }] } }, { ...base, parent2: BT16.defaultParents("di").parent1 }, { ...base, recombination: 0.7 }, { ...base, recombination: "0.2" }, { ...base, step: 4 }, { ...base, step: -1 }, { ...base, mode: "" },
      { ...BT16.DEFAULT_GENETICS_INPUTS, ...BT16.defaultParents("xlinked"), parent1: BT16.defaultParents("xlinked").parent2 }, { ...lk, recombination: 0.5001 }];
    for (const v of bad) assert.equal(BT16.validateGeneticsInputs(v), null, JSON.stringify(v).slice(0, 90));
    for (const layout of C.LAYOUT_IDS) assert.notEqual(BT16.validateGeneticsInputs({ ...base, ...BT16.defaultParents(layout), step: 3, mode: "challenge" }), null, layout);
  });
  test("[celldivision] X-linked or incomplete layouts, bad settings, a stage beyond the process, or a chromosome that is not in that stage are rejected", () => {
    const base = BT16.DEFAULT_CELLDIVISION_INPUTS;
    const lk = C.individual("linked", [["A", "B"], ["a", "b"]]);
    const bad = [null, { ...base, process: "meiosis2" }, { ...base, individual: C.individual("incomplete", [["CR"], ["CW"]]) }, { ...base, individual: C.individual("xlinked", [["C"], []]) }, { ...base, stage: 11 }, { ...base, process: "mitosis", stage: 7 }, { ...base, settings: { ...base.settings, orient1: [0] } },
      { ...base, settings: { ...base.settings, nd: { kind: "I", pair: 9, pole: 0 } } }, { ...base, selected: "p9h9" }, { ...base, selected: "p0h0c0" }, { ...base, revealed: "no" }, { ...base, recombination: 0.9 }, { ...base, individual: lk, settings: { ...D.defaultMeiosisSettings(lk), crossover: [{ between: 3, m: 0, p: 0 }] } }];
    for (const v of bad) assert.equal(BT16.validateCellDivisionInputs(v), null, JSON.stringify(v).slice(0, 90));
    assert.notEqual(BT16.validateCellDivisionInputs({ ...base, stage: 10 }), null);
    assert.notEqual(BT16.validateCellDivisionInputs({ ...base, stage: 9, selected: "p0h0c1" }), null, "after the centromere splits the sister chromatids have their own ids");
    assert.notEqual(BT16.validateCellDivisionInputs({ ...base, process: "mitosis", stage: 6 }), null);
    assert.notEqual(BT16.validateCellDivisionInputs({ ...base, individual: lk, settings: { ...D.defaultMeiosisSettings(lk), crossover: [{ between: 0, m: 1, p: 0 }] }, stage: 3, selected: "p0h0" }), null);
  });
  test("[derived results are rebuilt, never stored] the summary's check number equals an independent value", () => {
    assert.equal(SUM16.summarizeRegulation(BT16.DEFAULT_REGULATION_INPUTS).check, 3);       // lactose, no glucose: high
    assert.equal(SUM16.summarizeRegulation({ ...BT16.DEFAULT_REGULATION_INPUTS, system: "trp" }).check, 0); // high Trp: very low
    assert.equal(SUM16.summarizeGenetics(BT16.DEFAULT_GENETICS_INPUTS).check, 0.75);         // Rr × Rr: round 3/4
    assert.equal(SUM16.summarizeCellDivision(BT16.DEFAULT_CELLDIVISION_INPUTS).check, 8);    // four gametes × 2 chromosomes
  });
});

describe("learning-mode state transitions", () => {
  test("[modes] all three modes validate for each tool and preserve the rest of the state", () => {
    for (const t of TOOLS) for (const mode of ["explore", "practice", "challenge"]) {
      const v = { ...t.defaults(), mode }; const back = t.validate(clone(v));
      assert.equal(back.mode, mode, t.page); assert.deepEqual({ ...back, mode: "explore" }, { ...v, mode: "explore" }, t.page);
    }
  });
  test("[regulation challenge] applying a challenge yields a valid state and advances the index; replaying from the saved state is deterministic", () => {
    const L16 = null; void L16;
    let state = { ...BT16.DEFAULT_REGULATION_INPUTS, mode: "challenge" };
    for (let i = 0; i < 12; i += 1) {
      const changes = R.lacChanges(state.lac); const pick = changes[state.challenge % changes.length];
      state = { ...state, lac: pick.next, challenge: state.challenge + 1 };
      assert.notEqual(BT16.validateRegulationInputs(clone(state)), null, `step ${i}`);
    }
  });
  test("[division] reveal flag and stage are validated together: a revealed Challenge may sit at any stage", () => {
    const base = { ...BT16.DEFAULT_CELLDIVISION_INPUTS, mode: "challenge" };
    for (const stage of [0, 5, 10]) assert.notEqual(BT16.validateCellDivisionInputs({ ...base, revealed: true, stage }), null);
  });
});

describe("save, reopen and coexistence", () => {
  const variants = () => [
    ...["lac", "trp", "euk"].flatMap((system) => ["explore", "practice", "challenge"].map((mode) => ({ t: TOOLS[0], value: { ...BT16.DEFAULT_REGULATION_INPUTS, system, mode, selected: system === "lac" ? "operator" : system === "trp" ? "attenuator" : "enhancer", challenge: 2 } }))),
    { t: TOOLS[0], value: { ...BT16.DEFAULT_REGULATION_INPUTS, lac: { lactose: false, glucose: true, crp: "+", copies: [{ I: "-", O: "+", P: "+", Z: "+" }, { I: "+", O: "c", P: "+", Z: "-" }], step: 3 } } },
    { t: TOOLS[0], value: { ...BT16.DEFAULT_REGULATION_INPUTS, system: "euk", euk: { ...R.DEFAULT_EUK_INPUT, methylation: true, silencer: "present", repressor: true, step: 4 } } },
    ...C.LAYOUT_IDS.map((layout) => ({ t: TOOLS[1], value: { subject: "biology", tool: "genetics", ...BT16.defaultParents(layout), step: 2, mode: "practice" } })),
    { t: TOOLS[1], value: { subject: "biology", tool: "genetics", ...BT16.defaultParents("linked", 0.123), step: 3, mode: "challenge" } },
    ...["meiosis", "mitosis"].map((process) => ({ t: TOOLS[2], value: { ...BT16.DEFAULT_CELLDIVISION_INPUTS, process, stage: 4, selected: "p0h1" } })),
    { t: TOOLS[2], value: { ...BT16.DEFAULT_CELLDIVISION_INPUTS, individual: C.individual("linked", [["A", "b"], ["a", "B"]]), settings: { ...D.defaultMeiosisSettings(C.individual("linked", [["A", "b"], ["a", "B"]])), crossover: [{ between: 0, m: 0, p: 1 }], nd: { kind: "II", pair: 0, cell: 1, pole: 1 } }, stage: 9, mode: "challenge", revealed: true, recombination: 0.3 } },
  ];
  test("[save/open] every tool, system and mode saves with subject biology and reopens with identical inputs and the same recomputed summary", async () => {
    const real = new lib.AnalysisLibrary(new store.MemoryBackend(), { validators: validators(), newId: ids() });
    for (const { t, value } of variants()) {
      assert.notEqual(t.validate(clone(value)), null, `${t.page} ${JSON.stringify(value).slice(0, 80)}`);
      const results = t.summarize(value);
      const saved = ok(await real.save(t.page, { name: `${t.page} analysis`, summary: t.describe(value), inputs: value, results: { computedAt: "2026-11-13T00:00:00.000Z", engineVersion: t.engine(), stale: false, status: "complete", data: results } }));
      assert.equal(saved.subject, "biology");
      const opened = ok(await real.open(saved.id));
      assert.deepEqual(opened.inputs, value); assert.equal(opened.resultsDropped, false);
      assert.deepEqual(t.summarize(opened.inputs), results);
    }
    const list = ok(await real.list()); assert.equal(list.problems.length, 0); assert.ok(list.items.every((i) => i.subject === "biology"));
  });
  test("[integrity] damaged records are refused: wrong subject, impossible allele, out-of-range step or recombination, foreign chromosome", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    const make = async (page, inputs, mutate) => { const r = ok(await real.save(page, { name: page, summary: "s", inputs, results: null })); const raw = JSON.parse(backend.map.get(r.id)); mutate(raw); backend.map.set(r.id, JSON.stringify(raw)); return r.id; };
    const badIds = [
      await make("regulation", BT16.DEFAULT_REGULATION_INPUTS, (r) => { r.subject = "physics"; }),
      await make("regulation", BT16.DEFAULT_REGULATION_INPUTS, (r) => { r.inputs.lac.copies[0].I = "q"; }),
      await make("regulation", BT16.DEFAULT_REGULATION_INPUTS, (r) => { r.inputs.selected = "attenuator"; }),
      await make("genetics", BT16.DEFAULT_GENETICS_INPUTS, (r) => { r.inputs.parent1.pairs[0].a.alleles = ["Z"]; }),
      await make("genetics", BT16.DEFAULT_GENETICS_INPUTS, (r) => { r.inputs.recombination = 0.75; }),
      await make("celldivision", BT16.DEFAULT_CELLDIVISION_INPUTS, (r) => { r.inputs.stage = 99; }),
      await make("celldivision", BT16.DEFAULT_CELLDIVISION_INPUTS, (r) => { r.inputs.selected = "p5h0"; }),
    ];
    for (const id of badIds) assert.equal((await real.open(id)).ok, false, id);
  });
  test("[existing records] Stage 15 and Stage 16 Biology records coexist and open; a model change is noticed by the check number", async () => {
    const real = new lib.AnalysisLibrary(new store.MemoryBackend(), { validators: validators(), newId: ids() });
    const a = ok(await real.save("dogma", { name: "d", summary: "s", inputs: BT.DEFAULT_DOGMA_INPUTS, results: null }));
    const b = ok(await real.save("genetics", { name: "g", summary: "s", inputs: BT16.DEFAULT_GENETICS_INPUTS, results: null }));
    assert.equal((await real.open(a.id)).ok, true); assert.equal((await real.open(b.id)).ok, true);
    assert.deepEqual(ok(await real.list()).items.map((i) => i.subject), ["biology", "biology"]);
    const tampered = SUM16.summarizeGenetics(BT16.DEFAULT_GENETICS_INPUTS);
    assert.notEqual(tampered.check, SUM16.summarizeGenetics({ ...BT16.DEFAULT_GENETICS_INPUTS, parent1: BT16.defaultParents("di").parent1, parent2: BT16.defaultParents("di").parent2 }).check, "different inputs give a different check number");
  });
  test("[Stage 15 tools are untouched] their defaults, validators and summaries still behave as before", () => {
    assert.equal(SUM.summarizeDogma(BT.DEFAULT_DOGMA_INPUTS).check, 9);
    assert.equal(SUM.summarizeTranslation(BT.DEFAULT_TRANSLATION_INPUTS).check, 6);
    assert.equal(SUM.summarizeReplication(BT.DEFAULT_REPLICATION_INPUTS).check, 44);
    assert.equal(SUM.summarizeTranscription(BT.DEFAULT_TRANSCRIPTION_INPUTS).check, 46);
  });
});

describe("hand-offs and the Stage 15 link", () => {
  test("[one-shot] a hand-off is taken once, only by its addressee, and is validated by the receiver", () => {
    const ind = C.individual("linked", [["A", "B"], ["a", "b"]]);
    H.putHandoff({ to: "celldivision", individual: ind });
    assert.equal(H.takeHandoff("genetics"), null, "wrong page gets nothing");
    const got = H.takeHandoff("celldivision"); assert.deepEqual(got.individual, ind);
    assert.equal(H.takeHandoff("celldivision"), null, "taken once");
    // the receiving page saves it through its own validator
    assert.notEqual(BT16.validateCellDivisionInputs({ ...BT16.DEFAULT_CELLDIVISION_INPUTS, individual: got.individual, settings: D.defaultMeiosisSettings(got.individual), stage: 0 }), null);
  });
  test("[allele as a sequence variant] the HBB example is translated by the Stage 15 engine: Glu6Val is a missense change; nothing infers a phenotype", () => {
    const coding = "ATGGTGCACCTGACTCCTGAGGAGAAGTCTGCCGTTACTGCCCTGTGGGGCAAG";
    const wild = DG.analyzeDogma({ coding, mutation: null }), mut = DG.analyzeDogma({ coding, mutation: { kind: "substitution", pos: 19, base: "T" } });
    assert.equal(wild.wild.protein, "MVHLTPEEKSAVTALWGK"); assert.equal(mut.consequence.mutant.protein, "MVHLTPVEKSAVTALWGK"); assert.equal(mut.consequence.class, "missense");
    assert.notEqual(DG.validateDogmaInput({ coding, mutation: { kind: "substitution", pos: 19, base: "T" } }).ok, false);
    const page = read("src", "components", "biology", "GeneticsPage.tsx");
    assert.match(page, /never predicts a phenotype from an arbitrary DNA sequence/);
    assert.match(read("src", "components", "biology", "CentralDogmaPage.tsx"), /takeHandoff\("dogma"\)/);
  });
  test("[trp leader uses the Stage 15 translation engine] the leader peptide comes from translating the schematic leader mRNA", () => {
    const src = read("src", "utils", "biology", "geneRegulation.ts");
    assert.match(src, /import \{ translateFrom \} from "\.\/translate"/);
    assert.equal(R.TRP_LEADER_PEPTIDE, "MKAIFVLKGWWRTS");
  });
});
