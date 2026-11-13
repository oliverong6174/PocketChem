// Stage 15: Biology navigation, strict validation of saved inputs, summaries, saved-analysis round trips, App wiring and
// compatibility with the existing subjects.
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

let S, store, lib, libApp, BT, SUM, L, E, R, X, TR, D;
before(async () => {
  S = await loadModule("/src/navigation/subjects.ts");
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  libApp = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  BT = await loadModule("/src/utils/persistence/biologyTools.ts");
  SUM = await loadModule("/src/utils/biology/bioSummary.ts");
  L = await loadModule("/src/utils/biology/bioLearning.ts");
  E = await loadModule("/src/utils/biology/examples.ts");
  R = await loadModule("/src/utils/biology/replication.ts");
  X = await loadModule("/src/utils/biology/transcription.ts");
  TR = await loadModule("/src/utils/biology/translation.ts");
  D = await loadModule("/src/utils/biology/dogma.ts");
});
after(async () => { await closeEngine(); });

const TOOLS = [
  { page: "replication", tool: "replication", id: "bioReplication", slug: "dna-replication", defaults: () => BT.DEFAULT_REPLICATION_INPUTS, validate: (v) => BT.validateReplicationInputs(v), summarize: (v) => SUM.summarizeReplication(v), describe: (v) => BT.describeReplicationAnalysis(v), engine: () => BT.REPLICATION_ENGINE_VERSION },
  { page: "transcription", tool: "transcription", id: "bioTranscription", slug: "transcription", defaults: () => BT.DEFAULT_TRANSCRIPTION_INPUTS, validate: (v) => BT.validateTranscriptionInputs(v), summarize: (v) => SUM.summarizeTranscription(v), describe: (v) => BT.describeTranscriptionAnalysis(v), engine: () => BT.TRANSCRIPTION_ENGINE_VERSION },
  { page: "translation", tool: "translation", id: "bioTranslation", slug: "translation", defaults: () => BT.DEFAULT_TRANSLATION_INPUTS, validate: (v) => BT.validateTranslationInputs(v), summarize: (v) => SUM.summarizeTranslation(v), describe: (v) => BT.describeTranslationAnalysis(v), engine: () => BT.TRANSLATION_ENGINE_VERSION },
  { page: "dogma", tool: "dogma", id: "bioDogma", slug: "dna-rna-protein", defaults: () => BT.DEFAULT_DOGMA_INPUTS, validate: (v) => BT.validateDogmaInputs(v), summarize: (v) => SUM.summarizeDogma(v), describe: (v) => BT.describeDogmaAnalysis(v), engine: () => BT.DOGMA_ENGINE_VERSION },
];
const validators = () => Object.fromEntries(TOOLS.map((t) => [t.page, { engineVersion: t.engine(), validateInputs: t.validate, validateResults: BT.validateBiologyResults }]));
const ids = () => { let n = 0; return () => `s15x${(n += 1).toString().padStart(4, "0")}`; };
const withIn = (d, patch) => ({ ...d, input: { ...d.input, ...patch } });

describe("navigation", () => {
  test("[tools] Biology is available and lists Overview, the Stage 15 tools, the Stage 16 tools and Saved, in groups with unique slugs", () => {
    const biology = S.getSubject("biology");
    assert.equal(biology.status, "available"); assert.equal(biology.mode, "learning"); assert.equal(S.isAvailable("biology"), true);
    assert.deepEqual(S.BIOLOGY_TOOLS.map((t) => t.id), ["bioOverview", "bioReplication", "bioTranscription", "bioTranslation", "bioDogma", "bioRegulation", "bioGenetics", "bioDivision", "bioSaved"]);
    assert.deepEqual(S.BIOLOGY_TOOLS.map((t) => t.group), ["analyze", "geneExpression", "geneExpression", "geneExpression", "geneExpression", "geneExpression", "inheritance", "inheritance", "library"]);
    assert.ok(S.TOOL_GROUPS.some((g) => g.id === "geneExpression"));
    assert.equal(new Set(S.BIOLOGY_TOOLS.map((t) => t.slug)).size, S.BIOLOGY_TOOLS.length);
    assert.equal(S.getSubject("biochemistry").status, "available"); assert.equal(S.isAvailable("biochemistry"), true);
  });
  test("[routes] deep links round-trip; other subjects' tool lists are unchanged", () => {
    for (const t of TOOLS) { assert.equal(S.routeHash({ subject: "biology", toolId: t.id }), `#/biology/${t.slug}`); assert.deepEqual(S.parseRoute(`#/biology/${t.slug}`), { subject: "biology", toolId: t.id }); }
    assert.deepEqual(S.parseRoute("#/biology"), { subject: "biology", toolId: "bioOverview" });
    assert.equal(S.parseRoute("#/biology/nonsense"), null); assert.deepEqual(S.parseRoute("#/biochemistry"), { subject: "biochemistry", toolId: "bcOverview" });
    assert.deepEqual(S.PHYSICS_TOOLS.map((t) => t.id), ["phOverview", "phMechanics", "phForces", "phEnergy", "phCollisions", "phCircuits", "phRc", "phSaved"]);
    assert.deepEqual(S.GENERAL_TOOLS.map((t) => t.id), ["gcOverview", "gcAcidBase", "gcEquilibrium", "gcKinetics", "gcThermo", "gcSaved"]);
    assert.deepEqual(S.ORGANIC_TOOLS.map((t) => t.id), ["analysis", "acidBase", "spectroscopy", "conformations", "reactions", "multiStep", "multiCatalytic", "saved"]);
  });
  test("[icons] every Biology tool icon exists", () => {
    const icons = read("src", "components", "ui", "Icon.tsx");
    for (const t of S.BIOLOGY_TOOLS) assert.match(icons, new RegExp(`\\n  ${t.icon}: "`), t.icon);
  });
  test("[app] pages are lazy, open requests reach them and saved records switch to Biology", () => {
    const app = read("src", "App.tsx");
    for (const [c, id] of [["ReplicationPage", "bioReplication"], ["TranscriptionPage", "bioTranscription"], ["TranslationPage", "bioTranslation"], ["CentralDogmaPage", "bioDogma"], ["BiologyOverview", "bioOverview"]]) {
      assert.match(app, new RegExp(`const ${c} = lazy\\(\\(\\) => import\\("./components/biology/${c}"\\)\\)`));
      if (id !== "bioOverview") assert.match(app, new RegExp(`pendingOpen\\?\\.page === "${id}" \\? pendingOpen : null`));
    }
    assert.match(app, /target === "bioReplication" \|\| target === "bioTranscription" \|\| target === "bioTranslation" \|\| target === "bioDogma"/);
  });
  test("[subject] the pages belong to Biology and are registered in the library with labels", () => {
    for (const t of TOOLS) { assert.equal(store.PAGE_SUBJECT[t.page], "biology"); assert.ok(libApp.OPENABLE_ANALYSIS_PAGES.includes(t.page)); assert.equal(libApp.ANALYSIS_APP_PAGE[t.page], t.id); }
    const labels = read("src", "components", "SavedAnalysesPage.tsx");
    for (const l of ["DNA replication", "Transcription & RNA processing", "Translation", "DNA → RNA → protein", "Biology"]) assert.ok(labels.includes(l), l);
  });
  test("[no animation outside hooks] only the step-player hook runs a timer; diagrams and pages never do", () => {
    for (const f of ["ReplicationDiagram", "TranscriptionDiagram", "RibosomeDiagram", "ReplicationPage", "TranscriptionPage", "TranslationPage", "CentralDogmaPage"]) assert.doesNotMatch(read("src", "components", "biology", `${f}.tsx`), /requestAnimationFrame|setInterval/, f);
    assert.match(read("src", "components", "biology", "bioHooks.ts"), /clearInterval/);
  });
  test("[offline] no Biology module uses the network", () => {
    for (const f of fs.readdirSync(path.join(root, "src", "utils", "biology"))) assert.doesNotMatch(read("src", "utils", "biology", f), /fetch\(|XMLHttpRequest|WebSocket|https?:\/\//, f);
    for (const f of fs.readdirSync(path.join(root, "src", "components", "biology"))) assert.doesNotMatch(read("src", "components", "biology", f), /fetch\(|XMLHttpRequest|WebSocket/, f);
  });
});

describe("strict validation of saved inputs", () => {
  test("[defaults] each tool's defaults validate unchanged, summarize, and the summary validates", () => {
    for (const t of TOOLS) {
      const d = t.defaults();
      assert.deepEqual(t.validate(clone(d)), d, t.page);
      const s = t.summarize(d);
      assert.ok(s && s.headline.length > 0 && Number.isFinite(s.check), t.page);
      assert.deepEqual(BT.validateBiologyResults(clone(s)), s, t.page);
      assert.equal(d.subject, "biology"); assert.equal(d.tool, t.tool);
    }
  });
  test("[replication] bad types, wrong tool or mode, invalid sequence/parameters and a step beyond the timeline are rejected", () => {
    const base = BT.DEFAULT_REPLICATION_INPUTS; const n = R.buildReplication(base.input).steps.length;
    const bad = [null, [], {}, { ...base, subject: "physics" }, { ...base, tool: "dogma" }, { ...base, mode: "quiz" }, { ...base, step: -1 }, { ...base, step: 1.5 }, { ...base, step: n }, { ...base, step: "3" },
      withIn(base, { template: "ATGU" + "A".repeat(10) }), withIn(base, { direction: "up" }), withIn(base, { primerLength: 9 }), withIn(base, { okazakiLength: 3 }), withIn(base, { organism: "virus" })];
    for (const v of bad) assert.equal(BT.validateReplicationInputs(v), null, JSON.stringify(v).slice(0, 100));
    assert.notEqual(BT.validateReplicationInputs({ ...base, step: n - 1, mode: "challenge" }), null);
    assert.deepEqual(Object.keys(BT.validateReplicationInputs({ ...base, extra: 1 })).sort(), ["input", "mode", "step", "subject", "tool"]);
  });
  test("[transcription] invalid introns, bacterial introns, bad organism and a step beyond the timeline are rejected", () => {
    const base = BT.DEFAULT_TRANSCRIPTION_INPUTS; const n = X.buildTranscription(base.input).steps.length;
    const bad = [null, { ...base, tool: "translation" }, { ...base, mode: "x" }, withIn(base, { step: n }), withIn(base, { step: -1 }), withIn(base, { introns: [{ start: 15, end: 31 }] }), withIn(base, { introns: [{ start: 14, end: 30 }] }),
      withIn(base, { organism: "bacteria" }), withIn(base, { organism: "yeast" }), withIn(base, { coding: "AUGAUGAUGAUGAUG" }), withIn(base, { introns: "none" })];
    for (const v of bad) assert.equal(BT.validateTranscriptionInputs(v), null, JSON.stringify(v).slice(0, 100));
    assert.notEqual(BT.validateTranscriptionInputs(withIn(base, { step: n - 1 })), null);
  });
  test("[translation] DNA letters, a chosen start that is not an AUG, a scanning eukaryote with a chosen start, and a step beyond the timeline are rejected", () => {
    const base = BT.DEFAULT_TRANSLATION_INPUTS; const n = TR.buildTranslation(base.input).steps.length;
    const bad = [null, withIn(base, { mrna: "ATGGCT" }), withIn(base, { start: 0 }), withIn(base, { step: n }), withIn(base, { organism: "bacteria", start: 1 }), { ...base, mode: "" }];
    for (const v of bad) assert.equal(BT.validateTranslationInputs(v), null, JSON.stringify(v).slice(0, 100));
    assert.notEqual(BT.validateTranslationInputs(withIn(base, { organism: "bacteria", start: 2 })), null);
  });
  test("[dogma] mutations that do not fit are rejected", () => {
    const base = BT.DEFAULT_DOGMA_INPUTS;
    const bad = [null, withIn(base, { mutation: { kind: "substitution", pos: 99, base: "A" } }), withIn(base, { mutation: { kind: "substitution", pos: 3, base: "U" } }), withIn(base, { mutation: { kind: "insertion", pos: 3, bases: "AAAAAAA" } }), withIn(base, { mutation: { kind: "deletion", pos: 30, length: 9 } }), withIn(base, { mutation: { kind: "swap" } }), withIn(base, { coding: "ATG" })];
    for (const v of bad) assert.equal(BT.validateDogmaInputs(v), null, JSON.stringify(v).slice(0, 100));
    assert.notEqual(BT.validateDogmaInputs(withIn(base, { mutation: { kind: "deletion", pos: 8, length: 1 } })), null);
  });
  test("[summaries] check numbers match independent values", () => {
    const r = SUM.summarizeReplication(BT.DEFAULT_REPLICATION_INPUTS); // 44 steps after the intact duplex was verified in the replication tests
    assert.equal(r.check, 44);
    // 65 nt gene - 17 nt intron = 48 nt spliced; AAUAAA at index 25, cleavage 25 + 6 + 15 = 46 nt; the last 2 nt are cut off
    assert.equal(SUM.summarizeTranscription(BT.DEFAULT_TRANSCRIPTION_INPUTS).check, 46);
    assert.equal(SUM.summarizeTranslation(BT.DEFAULT_TRANSLATION_INPUTS).check, 6); // M A K L G Y
    assert.equal(SUM.summarizeDogma(BT.DEFAULT_DOGMA_INPUTS).check, 9); // M A K L G Y E P S
    assert.match(SUM.summarizeTranslation({ ...BT.DEFAULT_TRANSLATION_INPUTS, input: { ...BT.DEFAULT_TRANSLATION_INPUTS.input, mrna: "GGCCUUAAGGCC" } }).headline[0], /No AUG/);
  });
});

describe("learning questions", () => {
  const sane = (q) => {
    assert.ok(q.options.length >= 2 && q.options.length <= 4, q.id);
    assert.equal(new Set(q.options).size, q.options.length, `${q.id}: duplicate options`);
    assert.ok(q.answer >= 0 && q.answer < q.options.length, q.id);
    for (const t of [q.prompt, q.explanation, ...q.options]) assert.doesNotMatch(t, /NaN|undefined|Infinity|\[object/, q.id);
  };
  test("[replication] questions are well formed for every step, both directions and both organisms; answers follow from the model", () => {
    for (const direction of ["right", "left"]) for (const organism of ["bacteria", "eukaryote"]) {
      const m = R.buildReplication({ ...R.DEFAULT_REPLICATION_INPUT, direction, organism });
      for (let s = 0; s < m.steps.length; s += 1) { for (const q of L.replicationQuestions(m, s)) sane(q); const p = L.replicationPredictNext(m, s); if (p) sane(p); }
      const lead = L.replicationQuestions(m, 0)[0];
      assert.equal(lead.options[lead.answer], `The ${direction === "right" ? "bottom" : "top"} strand`);
      assert.equal(L.replicationPredictNext(m, m.steps.length - 1), null);
    }
  });
  test("[replication] the 'which nucleotide next' answer is the complement of the template base (independent check)", () => {
    const m = R.buildReplication(R.DEFAULT_REPLICATION_INPUT); const comp = { A: "T", T: "A", C: "G", G: "C" };
    let seen = 0;
    for (let s = 0; s < m.steps.length - 1; s += 1) {
      const a = m.steps[s + 1].actions.find((x) => x.kind === "leadExtend"); const q = L.replicationQuestions(m, s).find((x) => x.id.startsWith("rep-next-"));
      if (!a) { assert.equal(q, undefined); continue; }
      seen += 1;
      // right-moving fork: the leading template is the bottom strand, column = u
      assert.equal(q.options[q.answer], comp[m.bottom[a.u]]); assert.equal(q.options[q.answer], m.top[a.u]);
    }
    assert.ok(seen > 20);
  });
  test("[transcription] questions are well formed at every step for both organisms, and 'next RNA base' pairs with the template", () => {
    const comp = { A: "U", T: "A", C: "G", G: "C" };
    for (const t of E.TRANSCRIPTION_EXAMPLES) {
      const v = X.validateTranscriptionInput({ coding: t.coding, organism: t.organism, introns: t.introns, step: 0 }).value; const m = X.buildTranscription(v);
      for (let s = 0; s < m.steps.length; s += 1) {
        for (const q of L.transcriptionQuestions(m, s)) sane(q);
        const p = L.transcriptionPredictNext(m, s); if (p) sane(p);
        const next = m.steps[s + 1];
        if (next && next.phase === "elongation") assert.equal(p.options[p.answer], comp[m.template[next.state.transcribed - 1]]);
      }
    }
    const bact = X.buildTranscription({ coding: E.TRANSCRIPTION_EXAMPLES[3].coding, organism: "bacteria", introns: [], step: 0 });
    assert.ok(!L.transcriptionQuestions(bact, 0).some((q) => /splicing|cap/i.test(q.prompt) && !/bacteri/i.test(q.prompt) && /eukaryotic pre-mRNA/.test(q.prompt)));
  });
  test("[translation] questions are well formed at every step, and the amino acid answers follow the genetic code", () => {
    const m = TR.buildTranslation({ ...TR.DEFAULT_TRANSLATION_INPUT, organism: "bacteria" });
    for (let s = 0; s < m.steps.length; s += 1) { for (const q of L.translationQuestions(m, s)) sane(q); const p = L.translationPredictNext(m, s); if (p) sane(p); }
    const p = L.translationPredictNext(m, 1); // next: binding of codon 2 = GCU = Alanine
    assert.equal(p.options[p.answer], "Alanine");
  });
  test("[dogma and mutations] question answers equal the classified consequence; example mutations cover several classes", () => {
    const a = D.analyzeDogma(D.DEFAULT_DOGMA_INPUT);
    for (const q of L.dogmaQuestions(a)) sane(q);
    const ex = L.exampleMutations(a.coding, a.start);
    const classes = new Set(ex.map((e) => e.class));
    for (const c of ["silent", "missense", "nonsense", "frameshift", "in-frame deletion", "in-frame insertion"]) assert.ok(classes.has(c), c);
    for (const e of ex) { const q = L.mutationQuestion(a.coding, a.start, e.mutation); sane(q); assert.equal(q.options[q.answer], L.mutationClassLabel(e.class)); }
  });
  test("[determinism] the same state gives the same question and option order", () => {
    const m = R.buildReplication(R.DEFAULT_REPLICATION_INPUT);
    assert.deepEqual(L.replicationQuestions(m, 5), L.replicationQuestions(m, 5));
  });
});

describe("saved-analysis round trips", () => {
  const variants = () => [
    { t: TOOLS[0], value: BT.DEFAULT_REPLICATION_INPUTS },
    { t: TOOLS[0], value: { ...withIn(BT.DEFAULT_REPLICATION_INPUTS, { direction: "left", organism: "eukaryote", template: "ATATTAATTTAATATTATAATTAA" }), step: 12, mode: "practice" } },
    ...["explore", "practice", "challenge"].map((mode) => ({ t: TOOLS[1], value: { ...BT.DEFAULT_TRANSCRIPTION_INPUTS, mode } })),
    ...E.TRANSCRIPTION_EXAMPLES.map((e) => ({ t: TOOLS[1], value: { ...BT.DEFAULT_TRANSCRIPTION_INPUTS, input: { coding: e.coding, organism: e.organism, introns: e.introns, step: 20 } } })),
    ...E.TRANSLATION_EXAMPLES.map((e) => ({ t: TOOLS[2], value: withIn(BT.DEFAULT_TRANSLATION_INPUTS, { mrna: e.mrna, step: 0 }) })),
    { t: TOOLS[2], value: withIn(BT.DEFAULT_TRANSLATION_INPUTS, { organism: "bacteria", mrna: "GGAUGGCUAUGAAAUAAGGCC", start: 8, step: 3 }) },
    ...[null, { kind: "substitution", pos: 6, base: "A" }, { kind: "deletion", pos: 8, length: 1 }, { kind: "insertion", pos: 8, bases: "GGG" }].map((mutation) => ({ t: TOOLS[3], value: withIn(BT.DEFAULT_DOGMA_INPUTS, { mutation }) })),
  ];
  test("[save/open] every tool and mode saves with subject biology and reopens with identical inputs and the same recomputed summary", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    for (const { t, value } of variants()) {
      assert.notEqual(t.validate(clone(value)), null, `${t.page} ${JSON.stringify(value).slice(0, 80)}`);
      const results = t.summarize(value);
      const saved = ok(await real.save(t.page, { name: `${t.page} analysis`, summary: t.describe(value), inputs: value, results: { computedAt: "2026-11-12T00:00:00.000Z", engineVersion: t.engine(), stale: false, status: "complete", data: results } }));
      assert.equal(saved.subject, "biology");
      const opened = ok(await real.open(saved.id));
      assert.deepEqual(opened.inputs, value); assert.equal(opened.resultsDropped, false);
      assert.deepEqual(t.summarize(opened.inputs), results);
    }
    const list = ok(await real.list());
    assert.equal(list.problems.length, 0); assert.ok(list.items.every((i) => i.subject === "biology"));
  });
  test("[integrity] a wrong subject, an impossible step, an invalid sequence or a non-fitting mutation make a record damaged", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    const make = async (page, inputs, mutate) => { const r = ok(await real.save(page, { name: page, summary: "s", inputs, results: null })); const raw = JSON.parse(backend.map.get(r.id)); mutate(raw); backend.map.set(r.id, JSON.stringify(raw)); return r.id; };
    const badIds = [
      await make("replication", BT.DEFAULT_REPLICATION_INPUTS, (r) => { r.subject = "physics"; }),
      await make("replication", BT.DEFAULT_REPLICATION_INPUTS, (r) => { r.inputs.step = 9999; }),
      await make("replication", BT.DEFAULT_REPLICATION_INPUTS, (r) => { r.inputs.input.template = "ATGZ" + "A".repeat(10); }),
      await make("transcription", BT.DEFAULT_TRANSCRIPTION_INPUTS, (r) => { r.inputs.input.introns = [{ start: 3, end: 9 }]; }),
      await make("translation", BT.DEFAULT_TRANSLATION_INPUTS, (r) => { r.inputs.input.mrna = "ATGGCT"; }),
      await make("dogma", BT.DEFAULT_DOGMA_INPUTS, (r) => { r.inputs.input.mutation = { kind: "deletion", pos: 99, length: 2 }; }),
    ];
    for (const id of badIds) assert.equal((await real.open(id)).ok, false, id);
    assert.equal(ok(await real.list()).items.length + ok(await real.list()).problems.length >= 6, true);
  });
  test("[existing records] a Physics record and a Biology record coexist and both open", async () => {
    const PT = await loadModule("/src/utils/persistence/physicsTools.ts");
    const all = { ...validators(), forces: { engineVersion: PT.FORCES_ENGINE_VERSION, validateInputs: PT.validateForcesInputs, validateResults: PT.validatePhysicsResults } };
    const real = new lib.AnalysisLibrary(new store.MemoryBackend(), { validators: all, newId: ids() });
    const a = ok(await real.save("forces", { name: "f", summary: "s", inputs: PT.DEFAULT_FORCES_INPUTS, results: null }));
    const b = ok(await real.save("dogma", { name: "d", summary: "s", inputs: BT.DEFAULT_DOGMA_INPUTS, results: null }));
    assert.equal((await real.open(a.id)).ok, true); assert.equal((await real.open(b.id)).ok, true);
    assert.deepEqual(ok(await real.list()).items.map((i) => i.subject).sort(), ["biology", "physics"]);
  });
});
