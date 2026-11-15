// Stage 19: typed cross-subject relations, validated context transfer, one-shot handoff slot and App wiring.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8").replace(/\r\n/g, "\n");

let R, C, H, Tn, Tl, I, S;
before(async () => {
  R = await loadModule("/src/utils/concepts/relations.ts");
  C = await loadModule("/src/utils/concepts/context.ts");
  H = await loadModule("/src/utils/biology/handoff16.ts");
  Tn = await loadModule("/src/utils/biology/transcription.ts");
  Tl = await loadModule("/src/utils/biology/translation.ts");
  I = await loadModule("/src/utils/concepts/conceptIndex.ts");
  S = await loadModule("/src/navigation/subjects.ts");
});
after(async () => { await closeEngine(); });

const rel = (id) => R.RELATIONS.find((r) => r.id === id);

describe("relationship model", () => {
  test("every endpoint is a real tool and nothing relates to itself", () => {
    assert.deepEqual(R.validateRelations(), []);
  });
  test("broken relations are reported", () => {
    const bad = [
      { id: "x", from: { subject: "physics", toolId: "nope" }, to: { subject: "physics", toolId: "phRc" }, type: "related", label: "a", explanation: "b" },
      { id: "x", from: { subject: "physics", toolId: "phRc" }, to: { subject: "physics", toolId: "phRc" }, type: "related", label: "", explanation: "" },
    ];
    const problems = R.validateRelations(bad);
    assert.ok(problems.some((p) => p.includes("source is not a real tool")));
    assert.ok(problems.some((p) => p.includes("duplicate")));
    assert.ok(problems.some((p) => p.includes("itself")));
    assert.ok(problems.some((p) => p.includes("missing text")));
  });
  test("relation types are the five declared kinds", () => {
    assert.deepEqual(Object.keys(R.RELATION_LABEL).sort(), ["continues", "mechanism", "prerequisite", "related", "tool"]);
    for (const r of R.RELATIONS) assert.ok(R.RELATION_LABEL[r.type], r.id);
  });
  test("the required connections exist with the right endpoints", () => {
    const expect = [
      ["translation-to-peptides", "bioTranslation", "bcAminoAcids"],
      ["amino-acids-to-acid-base", "bcAminoAcids", "gcAcidBase"],
      ["enzymes-to-glycolysis", "bcEnzymes", "bcGlycolysis"],
      ["transcription-to-translation", "bioTranscription", "bioTranslation"],
      ["regulation-to-translation", "bioRegulation", "bioTranslation"],
      ["thermo-to-metabolism", "gcThermo", "bcMetabolism"],
    ];
    for (const [id, from, to] of expect) {
      const r = rel(id);
      assert.ok(r, id);
      assert.equal(r.from.toolId, from);
      assert.equal(r.to.toolId, to);
    }
  });
  test("conceptual connections between different models say what they do not mean", () => {
    for (const id of ["amino-acids-to-acid-base", "enzymes-to-glycolysis", "thermo-to-metabolism", "energy-to-thermo", "rc-to-kinetics", "translation-to-peptides"]) {
      assert.ok(rel(id).caution && rel(id).caution.length > 30, id);
    }
    assert.match(rel("thermo-to-metabolism").caution, /does not predict cellular/);
    assert.match(rel("enzymes-to-glycolysis").caution, /does not predict the flux/);
    assert.match(rel("amino-acids-to-acid-base").caution, /No pKa is copied/);
    assert.match(rel("energy-to-thermo").caution, /not interchangeable/);
  });
  test("no relation claims equivalence or a numerical transfer it does not implement", () => {
    for (const r of R.RELATIONS) assert.doesNotMatch(`${r.label} ${r.explanation}`, /\b(equivalent to|identical to|same as|converts? to)\b/i, r.id);
  });
  test("relationsFrom respects the limit and the source tool", () => {
    const all = R.relationsFrom("biochemistry", "bcEnzymes", 10);
    assert.ok(all.length >= 2);
    assert.ok(all.every((r) => r.from.toolId === "bcEnzymes"));
    assert.equal(R.relationsFrom("biochemistry", "bcEnzymes", 1).length, 1);
    assert.deepEqual(R.relationsFrom("physics", "phOverview"), []);
  });
  test("tools that show the panel have at most the default number of links and a distinct destination each", () => {
    for (const subject of Object.keys(S.SUBJECT_TOOLS)) {
      for (const tool of S.SUBJECT_TOOLS[subject]) {
        const shown = R.relationsFrom(subject, tool.id);
        assert.ok(shown.length <= 3);
        assert.equal(new Set(shown.map((r) => `${r.to.subject}/${r.to.toolId}`)).size, shown.length);
      }
    }
  });
  test("a concept index and the relations agree that every relation destination is a registry tool", () => {
    for (const r of R.RELATIONS) assert.ok(I.isValidDestination(r.to), r.id);
    assert.equal(R.destinationLabel({ subject: "biochemistry", toolId: "bcAminoAcids" }), "Amino acids & peptides");
  });
});

describe("validated context transfer", () => {
  test("a translated peptide keeps its residues in N-to-C order", () => {
    // Hand-derived: GG AUG GCU AAA CUG GGU UAC UGA -> Met Ala Lys Leu Gly Tyr, stop.
    const mrna = "GGAUGGCUAAACUGGGUUACUGAUUAAUAAAGCUAGC";
    const model = Tl.buildTranslation({ mrna, organism: "eukaryote", start: null, step: 0 });
    assert.equal(model.translation.protein, "MAKLGY");
    const ctx = C.preparePeptideContext(model.translation.protein);
    assert.equal(ctx.ok, true);
    assert.equal(ctx.value.sequence, "MAKLGY");
    assert.equal(ctx.value.truncatedFrom, null);
    assert.notEqual(ctx.value.sequence, "YGLKAM");
  });
  test("peptides longer than the builder limit are cut at the N-terminal side and say so", () => {
    const long = "ACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWY";
    const ctx = C.preparePeptideContext(long);
    assert.equal(ctx.ok, true);
    assert.equal(ctx.value.sequence, long.slice(0, 30));
    assert.equal(ctx.value.truncatedFrom, 40);
  });
  test("malformed peptide context is rejected, never coerced", () => {
    for (const bad of ["", "MA*K", "MAKB", "mak", "MA K", "M-A", null, undefined, 42, {}, ["M"]]) assert.equal(C.preparePeptideContext(bad).ok, false, JSON.stringify(bad));
  });
  test("a finished mRNA is validated by the Translation validator", () => {
    assert.equal(C.prepareMrnaContext("GGAUGGCUAAACUGGGUUACUGAUUAAUAAAGCUAGC", "eukaryote").ok, true);
    assert.equal(C.prepareMrnaContext("AUGGCUUAA", "bacteria").value.organism, "bacteria");
    for (const [mrna, org] of [["AUGGCUTAA", "bacteria"], ["AUG", "bacteria"], ["", "eukaryote"], ["AUGGCUUAA", "archaea"], [null, "bacteria"], ["AUGGCUUAA", undefined], ["A".repeat(400), "bacteria"], ["augcuu", "bacteria"]]) {
      assert.equal(C.prepareMrnaContext(mrna, org).ok, false, `${mrna} ${org}`);
    }
  });
  test("Transcription's finished mRNA translates to the same peptide in the Translation tool", () => {
    const model = Tn.buildTranscription(Tn.DEFAULT_TRANSCRIPTION_INPUT);
    const ctx = C.prepareMrnaContext(model.mature, model.input.organism);
    assert.equal(ctx.ok, true);
    assert.equal(ctx.value.mrna, model.mature);
    assert.doesNotMatch(ctx.value.mrna, /T/);
    const translated = Tl.buildTranslation({ mrna: ctx.value.mrna, organism: ctx.value.organism, start: null, step: 0 });
    assert.equal(translated.translation.protein, model.translation.protein);
    assert.equal(model.translation.protein, "MAKLGY");
  });
  test("a bacterial transcript is passed with its organism, not as eukaryotic", () => {
    const model = Tn.buildTranscription({ coding: "ATGGCTAAACTGGGTTACTGA", organism: "bacteria", introns: [], step: 0 });
    const ctx = C.prepareMrnaContext(model.mature, model.input.organism);
    assert.equal(ctx.value.organism, "bacteria");
    assert.equal(ctx.value.mrna, "AUGGCUAAACUGGGUUACUGA");
  });
});

describe("one-shot handoff slot", () => {
  test("a payload is taken once and only by its destination", () => {
    H.clearHandoff();
    H.putHandoff({ to: "translation", mrna: "AUGGCUUAA", organism: "bacteria", source: "x" });
    assert.equal(H.takeHandoff("peptide"), null, "wrong destination must not consume it");
    const taken = H.takeHandoff("translation");
    assert.equal(taken.mrna, "AUGGCUUAA");
    assert.equal(H.takeHandoff("translation"), null);
  });
  test("a newer payload replaces an untaken older one", () => {
    H.clearHandoff();
    H.putHandoff({ to: "peptide", sequence: "MK", source: "a" });
    H.putHandoff({ to: "peptide", sequence: "GG", source: "b" });
    assert.equal(H.takeHandoff("peptide").sequence, "GG");
  });
});

describe("wiring", () => {
  const app = read("src", "App.tsx");
  test("the app provides navigation and the search dialog, and opens through the existing switch functions", () => {
    assert.match(app, /NavigationContext\.Provider/);
    assert.match(app, /<ConceptSearch/);
    assert.match(app, /switchPage\(destination\.toolId as AppPage\)/);
    assert.match(app, /switchGeneralTool\(destination\.toolId as SubjectToolId\)/);
    assert.match(app, /event\.ctrlKey \|\| event\.metaKey/);
    assert.equal((app.match(/onOpenSearch=/g) ?? []).length, 2, "both shell variants expose the search button");
  });
  test("pages with relations render the panel for their own tool", () => {
    const pages = [
      ["biology/TranslationPage.tsx", "bioTranslation"], ["biology/TranscriptionPage.tsx", "bioTranscription"], ["biology/RegulationPage.tsx", "bioRegulation"],
      ["biology/CentralDogmaPage.tsx", "bioDogma"], ["biochem/AminoAcidsPage.tsx", "bcAminoAcids"], ["biochem/EnzymesPage.tsx", "bcEnzymes"],
      ["generalChem/ThermodynamicsPage.tsx", "gcThermo"], ["generalChem/AcidBaseTitrationPage.tsx", "gcAcidBase"], ["generalChem/KineticsPage.tsx", "gcKinetics"],
      ["physics/EnergyPage.tsx", "phEnergy"], ["physics/RcPage.tsx", "phRc"], ["biochem/metabolism/MetabolicMapPage.tsx", "bcMetabolism"],
    ];
    for (const [file, toolId] of pages) {
      assert.ok(read("src", "components", file).includes(`toolId="${toolId}"`), file);
      assert.ok(R.relationsFrom(S.SUBJECTS.find((s) => S.SUBJECT_TOOLS[s.id].some((t) => t.id === toolId)).id, toolId).length > 0, `${toolId} has relations`);
    }
  });
});
