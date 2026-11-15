// Stage 19: concept index integrity and deterministic search ranking.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let I, Q, S;
before(async () => {
  I = await loadModule("/src/utils/concepts/conceptIndex.ts");
  Q = await loadModule("/src/utils/concepts/search.ts");
  S = await loadModule("/src/navigation/subjects.ts");
});
after(async () => { await closeEngine(); });

const titles = (query, options) => Q.searchConcepts(query, options).map((r) => r.title);
const top = (query, options) => Q.searchConcepts(query, options)[0];

describe("concept index integrity", () => {
  test("every concept has a real destination and real related concepts", () => {
    assert.deepEqual(I.validateConceptIndex(), []);
  });
  test("covers all five subjects with a substantial selection", () => {
    for (const subject of ["organic", "general", "physics", "biology", "biochemistry"]) {
      assert.ok(I.CONCEPTS.filter((c) => c.subject === subject).length >= 6, subject);
    }
    assert.ok(I.CONCEPTS.length >= 40);
  });
  test("the required example concepts exist", () => {
    const names = I.CONCEPTS.map((c) => c.name.toLowerCase()).join("|");
    for (const needle of ["functional groups", "stereochemistry", "conformations", "synthesis planning", "ph", "chemical equilibrium", "acid–base titration", "reaction kinetics", "gibbs free energy", "enthalpy and entropy", "projectile motion", "newton's laws", "friction", "mechanical energy", "momentum", "electric circuits", "rc time constants", "dna replication", "transcription", "translation", "operons", "mendelian inheritance", "meiosis", "amino acids", "peptide bonds", "protein secondary structure", "enzyme inhibition", "glycolysis", "citric acid cycle", "oxidative phosphorylation"]) {
      assert.ok(names.includes(needle), `missing concept: ${needle}`);
    }
  });
  test("tool entries come from the registry and cover every tool of every subject", () => {
    const expected = Object.values(S.SUBJECT_TOOLS).reduce((n, tools) => n + tools.length, 0);
    assert.equal(I.TOOL_ENTRIES.length, expected);
    for (const entry of I.TOOL_ENTRIES) assert.ok(I.isValidDestination(entry.destination));
  });
  test("invalid destinations are detected and never returned", () => {
    assert.equal(I.isValidDestination({ subject: "physics", toolId: "nope" }), false);
    assert.equal(I.isValidDestination({ subject: "chemistry", toolId: "analysis" }), false);
    assert.equal(I.isValidDestination(null), false);
    const bad = [{ ...I.CONCEPTS[0], id: "bad", destination: { subject: "organic", toolId: "missing" }, related: ["ghost"] }];
    const problems = I.validateConceptIndex(bad);
    assert.ok(problems.some((p) => p.includes("not a real tool")));
    assert.ok(problems.some((p) => p.includes("ghost")));
    assert.deepEqual(Q.searchConcepts("functional groups", { concepts: bad, tools: [] }), []);
  });
  test("duplicate ids are reported", () => {
    const dup = [I.CONCEPTS[0], I.CONCEPTS[0]];
    assert.ok(I.validateConceptIndex(dup).some((p) => p.includes("duplicate")));
  });
});

describe("search ranking", () => {
  test("canonical name ranks first and exactly", () => {
    const r = top("Gibbs free energy");
    assert.equal(r.title, "Gibbs free energy");
    assert.equal(r.score, Q.LEVEL.nameExact);
    assert.equal(top("pH").title, "pH");
  });
  test("aliases and synonyms resolve to the concept", () => {
    assert.equal(top("Krebs cycle").title, "Citric acid cycle");
    assert.equal(top("TCA cycle").title, "Citric acid cycle");
    assert.equal(top("electron transport chain").title, "Oxidative phosphorylation");
    assert.equal(top("lac operon").title, "Operons and gene regulation");
    assert.equal(top("Punnett square").title, "Mendelian inheritance");
    assert.equal(top("F = ma").title, "Newton's laws");
    assert.equal(top("Hess's law").title, "Enthalpy and entropy");
  });
  test("exact and alias matches outrank loose keyword matches", () => {
    const results = Q.searchConcepts("ATP");
    assert.equal(results[0].title, "ATP and energy coupling");
    const spread = results.filter((r) => r.score <= Q.LEVEL.termExact);
    assert.ok(spread.length >= 5);
    assert.ok(results[0].score > spread[0].score);
  });
  test("ATP surfaces the cycle, oxidative phosphorylation, enzyme kinetics and thermodynamics with explanations", () => {
    const results = Q.searchConcepts("ATP");
    const byTitle = Object.fromEntries(results.map((r) => [r.title, r]));
    for (const t of ["Citric acid cycle", "Oxidative phosphorylation", "Enzyme kinetics", "Gibbs free energy", "Glycolysis"]) assert.ok(byTitle[t], t);
    assert.match(byTitle["Gibbs free energy"].reason, /does not model cells/);
    assert.match(byTitle["Enzyme kinetics"].reason, /does not model cellular ATP/);
  });
  test("peptide surfaces translation and the peptide builder", () => {
    const results = Q.searchConcepts("peptide");
    assert.equal(results[0].title, "Peptide bonds and peptides");
    assert.ok(results.some((r) => r.title === "Translation" && r.kind === "concept"));
    assert.ok(results.some((r) => r.kind === "tool" && r.destination.toolId === "bcAminoAcids"));
  });
  test("pH surfaces the acid–base analyzer and amino-acid ionization", () => {
    const results = Q.searchConcepts("pH");
    assert.equal(results[0].destination.toolId, "gcAcidBase");
    const aa = results.find((r) => r.title === "Amino acids");
    assert.ok(aa); assert.match(aa.reason, /pKa/);
  });
  test("multiword queries match all words, in any order", () => {
    assert.equal(top("free energy gibbs").title, "Gibbs free energy");
    assert.equal(top("rate law").destination.toolId, "gcKinetics");
    assert.equal(top("competitive inhibition").title, "Enzyme inhibition");
    assert.ok(titles("citric acid cycle").includes("Citric acid cycle"));
  });
  test("stop words are ignored in multiword queries", () => {
    assert.equal(top("the citric acid cycle").title, "Citric acid cycle");
  });
  test("accents, case, dashes, subscripts and punctuation are normalized", () => {
    assert.equal(top("MICHAELIS–MENTEN").title, "Enzyme kinetics");
    assert.equal(top("Le Chatelier").title, "Chemical equilibrium");
    assert.equal(top("FADH₂").title, "ATP and energy coupling");
    assert.equal(top("  newton's   laws ").title, "Newton's laws");
  });
  test("subject filters restrict results", () => {
    for (const subject of ["organic", "general", "physics", "biology", "biochemistry"]) {
      const r = Q.searchConcepts("energy", { subject });
      for (const item of r) assert.equal(item.subject, subject);
    }
    assert.ok(Q.searchConcepts("energy", { subject: "physics" }).length > 0);
    assert.equal(Q.searchConcepts("operon", { subject: "physics" }).length, 0);
  });
  test("kind filters separate concepts, tools and saved analyses", () => {
    const saved = [{ id: "s1", name: "My glycolysis run", subject: "biochemistry", page: "glycolysis" }];
    assert.ok(Q.searchConcepts("glycolysis", { kind: "concept", saved }).every((r) => r.kind === "concept"));
    assert.ok(Q.searchConcepts("glycolysis", { kind: "tool", saved }).every((r) => r.kind === "tool"));
    const onlySaved = Q.searchConcepts("glycolysis", { kind: "saved", saved });
    assert.equal(onlySaved.length, 1);
    assert.equal(onlySaved[0].savedId, "s1");
    assert.equal(onlySaved[0].destination, null);
  });
  test("a tool with the same name and destination as a matched concept is not listed twice", () => {
    const kinds = Q.searchConcepts("glycolysis").filter((r) => r.title === "Glycolysis").map((r) => r.kind);
    assert.deepEqual(kinds, ["concept"]);
    assert.deepEqual(Q.searchConcepts("translation").filter((r) => r.title === "Translation").map((r) => r.kind), ["concept"]);
  });
  test("results are unique by key", () => {
    for (const query of ["energy", "acid", "rate", "atp", "protein", "reaction"]) {
      const keys = Q.searchConcepts(query).map((r) => r.key);
      assert.equal(new Set(keys).size, keys.length, query);
    }
  });
  test("ordering is stable across repeated calls", () => {
    for (const query of ["energy", "acid", "atp", "protein"]) {
      const a = JSON.stringify(Q.searchConcepts(query));
      const b = JSON.stringify(Q.searchConcepts(query));
      assert.equal(a, b);
    }
  });
  test("scores never increase down the list", () => {
    const r = Q.searchConcepts("acid");
    for (let i = 1; i < r.length; i += 1) assert.ok(r[i - 1].score >= r[i].score);
  });
  test("a single typo is tolerated only for long words and is labelled approximate", () => {
    const r = top("glycolisis");
    assert.equal(r.title, "Glycolysis");
    assert.equal(r.approximate, true);
    assert.deepEqual(Q.searchConcepts("glycolxxis"), []);
  });
  test("fuzzy matching does not equate unrelated concepts", () => {
    assert.equal(Q.searchConcepts("friction").some((r) => r.title === "Photosynthesis"), false);
    assert.deepEqual(titles("mitosis", { subject: "physics" }), []);
    assert.ok(!titles("entropy").includes("Friction"));
    assert.ok(!titles("enzyme").includes("Newton's laws"));
  });
  test("unsupported or missing concepts return nothing, never a guess", () => {
    for (const query of ["photosynthesis", "black hole", "quantum chromodynamics", "zzzz", "!!!", "", "   "]) assert.deepEqual(Q.searchConcepts(query), [], query);
  });
  test("each result names a real destination (or is a saved analysis)", () => {
    for (const query of ["energy", "acid", "cell", "rate", "protein", "structure", "reaction"]) {
      for (const r of Q.searchConcepts(query)) {
        if (r.kind === "saved") continue;
        assert.ok(I.isValidDestination(r.destination), `${query}: ${r.key}`);
      }
    }
  });
  test("every concept is found by its own canonical name", () => {
    for (const concept of I.CONCEPTS) {
      const r = Q.searchConcepts(concept.name).find((x) => x.conceptId === concept.id);
      assert.ok(r, concept.id);
      assert.equal(r.score, Q.LEVEL.nameExact, concept.id);
    }
  });
  test("every alias reaches its own concept", () => {
    for (const concept of I.CONCEPTS) {
      for (const alias of concept.aliases) {
        assert.ok(Q.searchConcepts(alias, { limit: 100 }).some((x) => x.conceptId === concept.id), `${concept.id}: ${alias}`);
      }
    }
  });
  test("limit truncates after ranking", () => {
    const all = Q.searchConcepts("energy");
    const two = Q.searchConcepts("energy", { limit: 2 });
    assert.deepEqual(two.map((r) => r.key), all.slice(0, 2).map((r) => r.key));
  });
});
