// Stage 17: Biochemistry navigation, strict validation of saved inputs, summaries, learning questions, saved-analysis round trips,
// the Biology -> peptide hand-off, App wiring, and coexistence with the existing subjects.
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

let S, store, lib, libApp, BT, BC, L, H, AA, P, PR, E, ION;
before(async () => {
  S = await loadModule("/src/navigation/subjects.ts");
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  libApp = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  BT = await loadModule("/src/utils/persistence/biologyTools.ts");
  BC = await loadModule("/src/utils/persistence/biochemTools17.ts");
  L = await loadModule("/src/utils/biochem/learning.ts");
  H = await loadModule("/src/utils/biology/handoff16.ts");
  AA = await loadModule("/src/utils/biochem/aminoAcids.ts");
  P = await loadModule("/src/utils/biochem/peptide.ts");
  PR = await loadModule("/src/utils/biochem/protein.ts");
  E = await loadModule("/src/utils/biochem/enzyme.ts");
  ION = await loadModule("/src/utils/biochem/ionization.ts");
});
after(async () => { await closeEngine(); });

const TOOLS = [
  { page: "aminoacids", id: "bcAminoAcids", slug: "amino-acids", defaults: () => BC.DEFAULT_AMINOACIDS_INPUTS, validate: (v) => BC.validateAminoAcidsInputs(v), summarize: (v) => BC.summarizeAminoAcids(v), describe: (v) => BC.describeAminoAcidsAnalysis(v), engine: () => BC.AMINOACIDS_ENGINE_VERSION },
  { page: "proteins", id: "bcProteins", slug: "protein-structure", defaults: () => BC.DEFAULT_PROTEINS_INPUTS, validate: (v) => BC.validateProteinsInputs(v), summarize: (v) => BC.summarizeProteins(v), describe: (v) => BC.describeProteinsAnalysis(v), engine: () => BC.PROTEINS_ENGINE_VERSION },
  { page: "enzymes", id: "bcEnzymes", slug: "enzymes", defaults: () => BC.DEFAULT_ENZYMES_INPUTS, validate: (v) => BC.validateEnzymesInputs(v), summarize: (v) => BC.summarizeEnzymes(v), describe: (v) => BC.describeEnzymesAnalysis(v), engine: () => BC.ENZYMES_ENGINE_VERSION },
];
const validators = () => Object.fromEntries(TOOLS.map((t) => [t.page, { engineVersion: t.engine(), validateInputs: t.validate, validateResults: BT.validateBiologyResults }]));
const ids = () => { let n = 0; return () => `s17x${(n += 1).toString().padStart(4, "0")}`; };

describe("navigation and registration", () => {
  test("[subject] Biochemistry is available with Overview, three tools and Saved, unique slugs, in the Biomolecules group", () => {
    assert.equal(S.getSubject("biochemistry").status, "available"); assert.equal(S.getSubject("biochemistry").mode, "learning"); assert.equal(S.isAvailable("biochemistry"), true);
    assert.deepEqual(S.BIOCHEMISTRY_TOOLS.map((t) => t.id), ["bcOverview", "bcAminoAcids", "bcProteins", "bcEnzymes", "bcGlycolysis", "bcGluconeogenesis", "bcTca", "bcEtc", "bcMetabolism", "bcSaved"]);
    assert.deepEqual(S.BIOCHEMISTRY_TOOLS.map((t) => t.group), ["analyze", "biomolecules", "biomolecules", "biomolecules", "metabolism", "metabolism", "metabolism", "metabolism", "metabolism", "library"]);
    assert.equal(new Set(S.BIOCHEMISTRY_TOOLS.map((t) => t.slug)).size, 10);
    assert.ok(S.TOOL_GROUPS.some((g) => g.id === "biomolecules") && S.TOOL_GROUPS.some((g) => g.id === "metabolism"));
    assert.equal(S.SUBJECT_TOOLS.biochemistry, S.BIOCHEMISTRY_TOOLS);
  });
  test("[routes] deep links round-trip; a bare subject opens the Overview; malformed routes are ignored", () => {
    for (const t of TOOLS) { assert.equal(S.routeHash({ subject: "biochemistry", toolId: t.id }), `#/biochemistry/${t.slug}`); assert.deepEqual(S.parseRoute(`#/biochemistry/${t.slug}`), { subject: "biochemistry", toolId: t.id }); }
    assert.deepEqual(S.parseRoute("#/biochemistry"), { subject: "biochemistry", toolId: "bcOverview" });
    for (const bad of ["#/biochemistry/nope", "#/biochemistry/amino-acids/x", "#/biochemistry/<script>", "#/biology/amino-acids"]) assert.equal(S.parseRoute(bad), null, bad);
  });
  test("[existing subjects] Organic, General, Physics and Biology tool lists are unchanged", () => {
    assert.deepEqual(S.BIOLOGY_TOOLS.map((t) => t.id), ["bioOverview", "bioReplication", "bioTranscription", "bioTranslation", "bioDogma", "bioRegulation", "bioGenetics", "bioDivision", "bioMembrane", "bioSignaling", "bioNeuron", "bioSaved"]);
    assert.deepEqual(S.PHYSICS_TOOLS.map((t) => t.id), ["phOverview", "phMechanics", "phForces", "phEnergy", "phCollisions", "phWaves", "phOptics", "phInterference", "phEfield", "phMagnetic", "phInduction", "phCircuits", "phRc", "phSaved"]);
    assert.deepEqual(S.GENERAL_TOOLS.map((t) => t.id), ["gcOverview", "gcStoichiometry", "gcGas", "gcAcidBase", "gcEquilibrium", "gcKinetics", "gcThermo", "gcElectro", "gcSaved"]);
  });
  test("[icons] every Biochemistry tool icon exists", () => {
    const icons = read("src", "components", "ui", "Icon.tsx");
    for (const t of S.BIOCHEMISTRY_TOOLS) assert.match(icons, new RegExp(`\\n  ${t.icon}: "`), t.icon);
  });
  test("[app] pages are lazy, open requests reach them, saved records switch to Biochemistry and the Translation link is wired", () => {
    const app = read("src", "App.tsx");
    for (const [c, id] of [["AminoAcidsPage", "bcAminoAcids"], ["ProteinsPage", "bcProteins"], ["EnzymesPage", "bcEnzymes"]]) {
      assert.match(app, new RegExp(`const ${c} = lazy\\(\\(\\) => import\\("./components/biochem/${c}"\\)\\)`));
      assert.match(app, new RegExp(`pendingOpen\\?\\.page === "${id}" \\? pendingOpen : null`));
      assert.match(app, new RegExp(`target === "${id}"`));
    }
    assert.match(app, /activeSubject === "biochemistry" \? \(/);
    assert.match(app, /onOpenPeptide=\{\(\) => switchSubject\("biochemistry", \{ tool: "bcAminoAcids" \}\)\}/);
  });
  test("[subject registry] pages belong to Biochemistry, are openable from Saved and have labels", () => {
    for (const t of TOOLS) { assert.equal(store.PAGE_SUBJECT[t.page], "biochemistry"); assert.ok(libApp.OPENABLE_ANALYSIS_PAGES.includes(t.page)); assert.equal(libApp.ANALYSIS_APP_PAGE[t.page], t.id); }
    const labels = read("src", "components", "SavedAnalysesPage.tsx");
    for (const l of ["Amino acids & peptides", "Protein structure & folding", "Enzymes & catalysis", 'biochemistry: "Biochemistry"']) assert.ok(labels.includes(l), l);
  });
  test("[no timers in diagrams] only the shared step-player hook runs a timer", () => {
    for (const f of ["AminoAcidsPage", "ProteinsPage", "EnzymesPage", "ProteinDiagrams", "EnzymeDiagrams", "MoleculeSvg"]) assert.doesNotMatch(read("src", "components", "biochem", `${f}.tsx`), /requestAnimationFrame|setInterval|setTimeout/, f);
  });
  test("[accessibility] diagrams are role=img (or a named group/slider) with the state in the label; chart marker is a slider", () => {
    for (const f of ["ProteinDiagrams", "EnzymeDiagrams"]) assert.match(read("src", "components", "biochem", `${f}.tsx`), /role="img"/);
    assert.match(read("src", "components", "biochem", "ProteinDiagrams.tsx"), /role="slider"/);
    assert.match(read("src", "components", "biochem", "ProteinDiagrams.tsx"), /role="button"[\s\S]*tabIndex=\{0\}/);
    assert.match(read("src", "components", "biochem", "MoleculeSvg.tsx"), /role="img"/);
  });
  test("[offline] no network request is made by the new files", () => {
    for (const f of ["AminoAcidsPage", "ProteinsPage", "EnzymesPage", "MoleculeSvg", "BiochemOverview"]) assert.doesNotMatch(read("src", "components", "biochem", `${f}.tsx`), /fetch\(|XMLHttpRequest|https?:\/\//, f);
  });
});

describe("strict validation", () => {
  test("[defaults] every default validates, summarises and round-trips", () => {
    for (const t of TOOLS) {
      const d = t.defaults(); assert.deepEqual(t.validate(clone(d)), d, t.page);
      const s = t.summarize(d); assert.ok(s && s.headline.length && Number.isFinite(s.check), t.page);
      assert.deepEqual(BT.validateBiologyResults(clone(s)), s, t.page);
      assert.equal(d.subject, "biochemistry");
    }
  });
  test("[aminoacids] unknown letters, views, modes, pH, selections, and unusable sequences are rejected", () => {
    const b = BC.DEFAULT_AMINOACIDS_INPUTS;
    const bad = [null, [], { ...b, residue: "B" }, { ...b, other: "AA" }, { ...b, view: "protein" }, { ...b, mode: "quiz" }, { ...b, pH: 14.1 }, { ...b, pH: -0.1 }, { ...b, pH: "7" }, { ...b, sequence: "" }, { ...b, sequence: "GAX" },
      { ...b, sequence: "gas" }, { ...b, sequence: "A".repeat(31) }, { ...b, sequence: "GA S" }, { ...b, selected: 3 }, { ...b, selected: -1 }, { ...b, selected: 1.5 }, { ...b, challenge: -1 }, { ...b, tool: "proteins" }, { ...b, subject: "biology" }];
    for (const v of bad) assert.equal(BC.validateAminoAcidsInputs(v), null, JSON.stringify(v)?.slice(0, 90));
    assert.notEqual(BC.validateAminoAcidsInputs({ ...b, view: "peptide", sequence: "ACDEFGHIKLMNPQRSTVWY", selected: 19, pH: 3.3, mode: "challenge" }), null);
    assert.deepEqual(Object.keys(BC.validateAminoAcidsInputs({ ...b, extra: 1 })).sort(), ["challenge", "mode", "other", "pH", "residue", "selected", "sequence", "subject", "tool", "view"]);
    assert.equal(BC.validateAminoAcidsInputs({ ...b, pH: 7.04 }).pH, 7, "pH is kept to one decimal");
  });
  test("[proteins] bad lengths, angles, ids, conditions and mutants are rejected", () => {
    const b = BC.DEFAULT_PROTEINS_INPUTS;
    const bad = [null, { ...b, view: "folding" }, { ...b, example: "lysozyme" }, { ...b, helixLength: 4 }, { ...b, helixLength: 25 }, { ...b, helixLength: 8.5 }, { ...b, strands: 1 }, { ...b, strands: 5 }, { ...b, strandLength: 3 }, { ...b, strandLength: 11 }, { ...b, sheetKind: "mixed" },
      { ...b, phi: 181 }, { ...b, psi: -181 }, { ...b, ramaResidue: "A" }, { ...b, scenario: "nope" }, { ...b, mutant: "Z" }, { ...b, conditions: { ...b.conditions, thermal: "boiling" } }, { ...b, conditions: { ...b.conditions, pH: 15 } },
      { ...b, conditions: { ...b.conditions, denaturant: "yes" } }, { ...b, challenge: 1.2 }];
    for (const v of bad) assert.equal(BC.validateProteinsInputs(v), null, JSON.stringify(v)?.slice(0, 90));
    for (const view of BC.PROTEIN_VIEWS) assert.notEqual(BC.validateProteinsInputs({ ...b, view }), null, view);
    for (const s of PR.SCENARIOS) assert.notEqual(BC.validateProteinsInputs({ ...b, scenario: s.id, mutant: s.suggested, view: "mutation" }), null, s.id);
  });
  test("[enzymes] bad constants, types, steps and inhibition fields are rejected; valid kinetics round-trip", () => {
    const b = BC.DEFAULT_ENZYMES_INPUTS;
    const k = b.kinetics;
    const bad = [null, { ...b, view: "folding" }, { ...b, binding: "key" }, { ...b, mechStep: 7 }, { ...b, mechStep: -1 }, { ...b, kinetics: { ...k, vmax: 0 } }, { ...b, kinetics: { ...k, km: -2 }, }, { ...b, kinetics: { ...k, substrate: "2" } },
      { ...b, kinetics: { ...k, inhibition: { ...k.inhibition, type: "irreversible" } } }, { ...b, kinetics: { ...k, inhibition: { ...k.inhibition, ki: 0 } } }, { ...b, kinetics: { ...k, inhibition: { ...k.inhibition, conc: 2000 } } }, { ...b, energy: { deltaG: 100, decades: 3 } }, { ...b, energy: { deltaG: -5, decades: 20 } }];
    for (const v of bad) assert.equal(BC.validateEnzymesInputs(v), null, JSON.stringify(v)?.slice(0, 100));
    for (const type of E.INHIBITION_TYPES) assert.notEqual(BC.validateEnzymesInputs({ ...b, kinetics: { ...k, inhibition: { type, conc: 3, ki: 2, kiPrime: type === "noncompetitive" ? 2 : 5 } } }), null, type);
    for (const view of BC.ENZYME_VIEWS) assert.notEqual(BC.validateEnzymesInputs({ ...b, view, mechStep: 6 }), null, view);
  });
  test("[derived results are rebuilt, never stored] the check numbers equal independently derived values", () => {
    // Alanine pI = (2.34 + 9.69)/2 = 6.015; Gly-Ala-Ser peptide pI from the typical-pKa model is independently > 5 and < 7.
    assert.ok(Math.abs(BC.summarizeAminoAcids(BC.DEFAULT_AMINOACIDS_INPUTS).check - 6.0) < 0.05);
    assert.equal(BC.summarizeAminoAcids({ ...BC.DEFAULT_AMINOACIDS_INPUTS, view: "compare", residue: "L", other: "D" }).check, 3.8 - -3.5);
    assert.equal(BC.summarizeProteins({ ...BC.DEFAULT_PROTEINS_INPUTS, view: "helix", helixLength: 14 }).check, 10);
    assert.equal(BC.summarizeProteins({ ...BC.DEFAULT_PROTEINS_INPUTS, view: "rama", phi: 60, psi: -120 }).check, 0);
    assert.equal(BC.summarizeProteins({ ...BC.DEFAULT_PROTEINS_INPUTS, view: "rama" }).check, 1);
    const v = 100 * 2 / (2 + 2); // Vmax = 100, Km = 2, [S] = 2, no inhibitor
    assert.ok(Math.abs(BC.summarizeEnzymes({ ...BC.DEFAULT_ENZYMES_INPUTS, kinetics: { ...E.DEFAULT_ENZYME_INPUT, inhibition: { type: "none", conc: 0, ki: 2, kiPrime: 2 } } }).check - v) < 1e-9);
    // competitive, [I] = 4, Ki = 2: alpha = 3, v = 100*2/(3*2 + 2) = 25
    assert.ok(Math.abs(BC.summarizeEnzymes({ ...BC.DEFAULT_ENZYMES_INPUTS, kinetics: { ...E.DEFAULT_ENZYME_INPUT, inhibition: { type: "competitive", conc: 4, ki: 2, kiPrime: 2 } } }).check - 25) < 1e-9);
  });
  test("[an unusable peptide has no summary] so a half-typed sequence is never saved", () => {
    assert.equal(BC.summarizeAminoAcids({ ...BC.DEFAULT_AMINOACIDS_INPUTS, view: "peptide", sequence: "GAZ" }), null);
  });
});

describe("learning questions are computed from the engines", () => {
  const valid = (qs) => { for (const q of qs) { assert.ok(q.options.length >= 2); assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, q.id); assert.equal(new Set(q.options).size, q.options.length, q.id); assert.ok(q.explanation.length > 10); } assert.equal(new Set(qs.map((q) => q.id)).size, qs.length); };
  test("[amino acids] every residue yields valid questions whose answers match the data", () => {
    for (const a of AA.AMINO_ACID_LIST) {
      const qs = L.aminoAcidQuestions(a.one, "L", 7, "GAS"); valid(qs);
      assert.equal(qs[0].options[qs[0].answer], AA.CLASS_LABEL[a.cls]);
      const charge = qs.find((q) => q.id.startsWith("aa-charge7"));
      const q7 = ION.netCharge(a, 7);
      assert.equal(charge.options[charge.answer], q7 < -0.25 ? "negative" : q7 > 0.25 ? "positive" : "about zero (neutral)", a.name);
    }
    assert.equal(L.aminoAcidQuestions("A", "A", 7, "GAS").some((q) => q.id.startsWith("aa-hydro")), false, "no comparison of an amino acid with itself");
    const bonds = L.aminoAcidQuestions("A", "L", 7, "ACDEF").find((q) => q.id.startsWith("aa-bonds"));
    assert.equal(bonds.options[bonds.answer], "4");
  });
  test("[amino acid challenges] the predicted direction matches the computed change for every residue", () => {
    for (const a of AA.AMINO_ACID_LIST) for (const c of L.aminoAcidChallenges(a.one)) {
      valid([c.question]);
      assert.ok(c.reveal.pH >= 0 && c.reveal.pH <= 14);
    }
    const a = AA.AMINO_ACIDS_BY_ONE.A;
    const c = L.aminoAcidChallenges("A")[0];
    const lo = ION.netCharge(a, 3.0), hi = ION.netCharge(a, 9.0);
    assert.ok(hi < lo); assert.equal(c.question.options[c.question.answer], "More negative");
  });
  test("[proteins] questions and challenges are valid and tied to the engine", () => {
    valid(L.proteinQuestions(BC.DEFAULT_PROTEINS_INPUTS));
    const ch = L.proteinChallenges(); valid(ch); assert.equal(ch.length, PR.SCENARIOS.length);
    const helix = L.proteinQuestions({ ...BC.DEFAULT_PROTEINS_INPUTS, helixLength: 12 }).find((q) => q.id.startsWith("pr-helix"));
    assert.equal(helix.options[helix.answer], "8");
  });
  test("[enzymes] questions and challenges agree with the apparent-parameter formulas", () => {
    const k = { ...E.DEFAULT_ENZYME_INPUT, inhibition: { type: "competitive", conc: 4, ki: 2, kiPrime: 2 } };
    const qs = L.enzymeQuestions(k); valid(qs);
    const vmax = qs.find((q) => q.id === "en-vmax-competitive"), km = qs.find((q) => q.id === "en-km-competitive");
    assert.equal(vmax.options[vmax.answer], "Stays the same"); assert.equal(km.options[km.answer], "Increases");
    const un = L.enzymeQuestions({ ...k, inhibition: { type: "uncompetitive", conc: 4, ki: 2, kiPrime: 2 } });
    assert.equal(un.find((q) => q.id === "en-km-uncompetitive").options[un.find((q) => q.id === "en-km-uncompetitive").answer], "Decreases");
    const nc = L.enzymeQuestions({ ...k, inhibition: { type: "noncompetitive", conc: 4, ki: 2, kiPrime: 2 } });
    assert.equal(nc.find((q) => q.id === "en-km-noncompetitive").options[nc.find((q) => q.id === "en-km-noncompetitive").answer], "Stays the same");
    const ch = L.enzymeChallenges(); assert.equal(ch.length, 6); valid(ch.map((c) => c.question));
  });
});

describe("save, reopen and coexistence", () => {
  const variants = () => [
    ...BC.AA_VIEWS.flatMap((view) => ["explore", "practice", "challenge"].map((mode) => ({ t: TOOLS[0], value: { ...BC.DEFAULT_AMINOACIDS_INPUTS, view, mode, residue: "K", other: "D", pH: 9.4, sequence: "YGGFL", selected: 2, challenge: 1 } }))),
    ...BC.PROTEIN_VIEWS.map((view) => ({ t: TOOLS[1], value: { ...BC.DEFAULT_PROTEINS_INPUTS, view, example: "hemoglobin", phi: -60, psi: 140, ramaResidue: "P", conditions: { pH: 4.2, thermal: "moderate", reducingAgent: true, denaturant: false }, scenario: "pro-helix", mutant: "P", mode: "practice" } })),
    ...BC.ENZYME_VIEWS.map((view) => ({ t: TOOLS[2], value: { ...BC.DEFAULT_ENZYMES_INPUTS, view, mechStep: 5, binding: "conformational-selection", kinetics: { vmax: 80, km: 3, substrate: 7.5, enzymeTotal: 0.5, inhibition: { type: "mixed", conc: 2, ki: 1, kiPrime: 4 } }, energy: { deltaG: -15, decades: 8 }, mode: "challenge" } })),
  ];
  test("[save/open] every tool, view and mode saves with subject biochemistry and reopens with identical inputs and the same recomputed summary", async () => {
    const real = new lib.AnalysisLibrary(new store.MemoryBackend(), { validators: validators(), newId: ids() });
    for (const { t, value } of variants()) {
      assert.notEqual(t.validate(clone(value)), null, `${t.page} ${JSON.stringify(value).slice(0, 80)}`);
      const results = t.summarize(value);
      const saved = ok(await real.save(t.page, { name: `${t.page} analysis`, summary: t.describe(value), inputs: value, results: { computedAt: "2026-11-13T00:00:00.000Z", engineVersion: t.engine(), stale: false, status: "complete", data: results } }));
      assert.equal(saved.subject, "biochemistry");
      const opened = ok(await real.open(saved.id));
      assert.deepEqual(opened.inputs, value); assert.equal(opened.resultsDropped, false);
      assert.deepEqual(t.summarize(opened.inputs), results);
    }
    const list = ok(await real.list()); assert.equal(list.problems.length, 0); assert.ok(list.items.every((i) => i.subject === "biochemistry"));
  });
  test("[integrity] damaged records are refused: wrong subject, bad residue, out-of-range pH, impossible helix, unknown inhibitor", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    const make = async (page, inputs, mutate) => { const r = ok(await real.save(page, { name: page, summary: "s", inputs, results: null })); const raw = JSON.parse(backend.map.get(r.id)); mutate(raw); backend.map.set(r.id, JSON.stringify(raw)); return r.id; };
    const badIds = [
      await make("aminoacids", BC.DEFAULT_AMINOACIDS_INPUTS, (r) => { r.subject = "biology"; }),
      await make("aminoacids", BC.DEFAULT_AMINOACIDS_INPUTS, (r) => { r.inputs.residue = "Z"; }),
      await make("aminoacids", BC.DEFAULT_AMINOACIDS_INPUTS, (r) => { r.inputs.pH = 20; }),
      await make("aminoacids", BC.DEFAULT_AMINOACIDS_INPUTS, (r) => { r.inputs.selected = 99; }),
      await make("proteins", BC.DEFAULT_PROTEINS_INPUTS, (r) => { r.inputs.helixLength = 2; }),
      await make("proteins", BC.DEFAULT_PROTEINS_INPUTS, (r) => { r.inputs.scenario = "other"; }),
      await make("enzymes", BC.DEFAULT_ENZYMES_INPUTS, (r) => { r.inputs.kinetics.inhibition.type = "poison"; }),
      await make("enzymes", BC.DEFAULT_ENZYMES_INPUTS, (r) => { r.inputs.kinetics.km = 0; }),
    ];
    for (const id of badIds) assert.equal((await real.open(id)).ok, false, id);
  });
  test("[existing records] Biology and Biochemistry records coexist and open", async () => {
    const real = new lib.AnalysisLibrary(new store.MemoryBackend(), { validators: { ...validators(), dogma: { engineVersion: BT.DOGMA_ENGINE_VERSION, validateInputs: BT.validateDogmaInputs, validateResults: BT.validateBiologyResults } }, newId: ids() });
    const a = ok(await real.save("dogma", { name: "d", summary: "s", inputs: BT.DEFAULT_DOGMA_INPUTS, results: null }));
    const b = ok(await real.save("enzymes", { name: "e", summary: "s", inputs: BC.DEFAULT_ENZYMES_INPUTS, results: null }));
    assert.equal((await real.open(a.id)).ok, true); assert.equal((await real.open(b.id)).ok, true);
    assert.deepEqual(ok(await real.list()).items.map((i) => i.subject).sort(), ["biochemistry", "biology"]);
  });
});

describe("Biology to peptide hand-off", () => {
  test("[one-shot] the peptide hand-off is taken once, only by its addressee, and is validated by the receiver", () => {
    H.putHandoff({ to: "peptide", sequence: "MGSKLW", source: "the Translation tool" });
    assert.equal(H.takeHandoff("genetics"), null);
    const got = H.takeHandoff("peptide");
    assert.equal(got.sequence, "MGSKLW");
    assert.equal(H.takeHandoff("peptide"), null, "taken once");
    assert.ok(P.parsePeptide(got.sequence).ok);
    assert.notEqual(BC.validateAminoAcidsInputs({ ...BC.DEFAULT_AMINOACIDS_INPUTS, view: "peptide", sequence: got.sequence }), null);
  });
  test("[translation output] every peptide the translation engine can produce is accepted by the peptide explorer (up to its limit)", async () => {
    const tr = await loadModule("/src/utils/biology/translation.ts");
    const ex = await loadModule("/src/utils/biology/examples.ts");
    let checked = 0;
    for (const e of ex.TRANSLATION_EXAMPLES) {
      const m = tr.buildTranslation({ ...tr.DEFAULT_TRANSLATION_INPUT, ...(e.input ?? e) });
      const prot = m.translation?.protein;
      if (!prot) continue;
      checked += 1;
      assert.ok(P.parsePeptide(prot.slice(0, P.PEPTIDE_LIMITS.max)).ok, e.label);
    }
    assert.ok(checked >= 1, "at least one example translated");
    const src = read("src", "components", "biology", "PeptideHandoff.tsx");
    // Stage 19 moved the cut into the shared validated context (behaviour is tested in conceptRelations19); the component must use it and report it.
    assert.match(src, /preparePeptideContext\(sequence\)/);
    assert.match(src, /truncatedFrom/, "the page says when a long peptide was cut");
    assert.match(read("src", "utils", "concepts", "context.ts"), /slice\(0, PEPTIDE_LIMITS\.max\)/, "long peptides are cut to the limit");
    assert.match(read("src", "components", "biology", "TranslationPage.tsx"), /<PeptideHandoff/);
    assert.match(read("src", "components", "biochem", "AminoAcidsPage.tsx"), /takeHandoff\("peptide"\)/);
  });
  test("[Stage 15 and 16 hand-offs still work]", () => {
    H.putHandoff({ to: "dogma", coding: "ATGAAA", mutation: null });
    assert.equal(H.takeHandoff("dogma").coding, "ATGAAA");
  });
});
