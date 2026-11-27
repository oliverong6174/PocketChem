// Stage 15: sequence utilities, genetic code, reading frames, translation and mutations.
// Expected values are hand-derived (textbook codon table degeneracy, worked mutation examples), not taken from the engine.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let S, G, T, M;
before(async () => {
  S = await loadModule("/src/utils/biology/sequence.ts");
  G = await loadModule("/src/utils/biology/geneticCode.ts");
  T = await loadModule("/src/utils/biology/translate.ts");
  M = await loadModule("/src/utils/biology/mutations.ts");
});
after(async () => { await closeEngine(); });

describe("sequence input and strands", () => {
  test("DNA input is upper-cased, whitespace is ignored and counted", () => {
    const p = S.parseNucleic("atg c\nGT a", "DNA", 1);
    assert.equal(p.ok, true); assert.equal(p.seq, "ATGCGTA"); assert.equal(p.ignoredWhitespace, 3);
  });
  test("U in DNA and T in RNA are rejected with their position and a hint; nothing is substituted", () => {
    const d = S.parseNucleic("ATGU", "DNA", 1); assert.equal(d.ok, false); assert.equal(d.index, 3); assert.match(d.error, /DNA uses T/);
    const r = S.parseNucleic("AUGT", "RNA", 1); assert.equal(r.ok, false); assert.match(r.error, /instead of T/);
    assert.equal(S.parseNucleic("ATGX", "DNA", 1).ok, false);
    assert.equal(S.parseNucleic(42, "DNA").ok, false);
  });
  test("length limits are enforced both ways", () => {
    assert.equal(S.parseNucleic("ATG", "DNA", 6).ok, false);
    assert.equal(S.parseNucleic("A".repeat(121), "DNA", 6).ok, false);
    assert.equal(S.parseNucleic("A".repeat(120), "DNA", 6).ok, true);
  });
  test("complement is not reversed; reverse complement is the 5'->3' partner: 5'-ATGCCG-3' pairs with 5'-CGGCAT-3'", () => {
    assert.equal(S.complementDna("ATGCCG"), "TACGGC");
    assert.equal(S.reverseComplementDna("ATGCCG"), "CGGCAT");
    assert.equal(S.reverseComplementRna("AUGCCG"), "CGGCAU");
    assert.equal(S.reverseComplementDna(S.reverseComplementDna("ATGCCGTTA")), "ATGCCGTTA");
  });
  test("template of a gene: coding 5'-ATGGCC-3' has template 5'-GGCCAT-3'; the coding strand's RNA is the coding strand with U", () => {
    assert.equal(S.templateFromCoding("ATGGCC"), "GGCCAT");
    assert.equal(S.codingFromTemplate("GGCCAT"), "ATGGCC");
    assert.equal(S.dnaToRna("ATGGCCTTA"), "AUGGCCUUA");
    assert.equal(S.pairedIndex(0, 6), 5);
  });
  test("hydrogen bonds: A-T/U 2, G-C 3; GC content", () => {
    assert.equal(S.hydrogenBonds("A"), 2); assert.equal(S.hydrogenBonds("T"), 2); assert.equal(S.hydrogenBonds("G"), 3); assert.equal(S.hydrogenBonds("C"), 3);
    assert.equal(S.gcContent("GGCCAATT"), 50);
  });
});

describe("the genetic code", () => {
  test("64 codons: 61 sense + 3 stops", () => {
    assert.equal(G.ALL_CODONS.length, 64);
    const stops = G.ALL_CODONS.filter((c) => G.readCodon(c).kind === "stop").sort();
    assert.deepEqual(stops, ["UAA", "UAG", "UGA"]);
  });
  test("degeneracy per amino acid matches the standard table (independent list)", () => {
    const expected = { A: 4, R: 6, N: 2, D: 2, C: 2, Q: 2, E: 2, G: 4, H: 2, I: 3, L: 6, K: 2, M: 1, F: 2, P: 4, S: 6, T: 4, W: 1, Y: 2, V: 4 };
    for (const [aa, n] of Object.entries(expected)) assert.equal(G.codonsFor(aa).length, n, aa);
    assert.equal(Object.values(expected).reduce((a, b) => a + b, 0), 61);
  });
  test("spot checks from the textbook table", () => {
    const aa = (c) => G.readCodon(c).aa;
    const cases = { AUG: "M", UGG: "W", UUU: "F", GAU: "D", GAA: "E", CGA: "R", AGA: "R", AGC: "S", UCA: "S", AUA: "I", CCC: "P", UAU: "Y", UGU: "C", GGG: "G", CAU: "H", CAA: "Q", AAU: "N", AAG: "K", ACU: "T", GUC: "V", CUG: "L", GCG: "A" };
    for (const [c, a] of Object.entries(cases)) assert.equal(aa(c), a, c);
  });
  test("non-codons are rejected, DNA codons too", () => {
    assert.equal(G.readCodon("ATG"), null); assert.equal(G.readCodon("AU"), null); assert.equal(G.readCodon("AUGA"), null);
  });
  test("anticodons: codon 5'-AUG-3' pairs with 5'-CAU-3'; written under the codon (3'->5') it is UAC", () => {
    assert.equal(G.anticodon5to3("AUG"), "CAU"); assert.equal(G.anticodonUnderCodon("AUG"), "UAC");
    assert.equal(G.anticodon5to3("GCU"), "AGC");
  });
  test("release factors: UAA both, UAG RF1, UGA RF2", () => {
    assert.deepEqual(G.releaseFactorFor("UAA"), ["RF1", "RF2"]); assert.deepEqual(G.releaseFactorFor("UAG"), ["RF1"]); assert.deepEqual(G.releaseFactorFor("UGA"), ["RF2"]);
  });
});

describe("reading frames and translation", () => {
  test("AUGGCUAAAUGA reads M A K then stops at UGA", () => {
    const t = T.translateFrom("AUGGCUAAAUGA", 0);
    assert.equal(t.protein, "MAK"); assert.equal(t.status, "terminated"); assert.equal(t.stopPosition, 9); assert.equal(t.codons.at(-1).codon, "UGA");
  });
  test("a start in the middle: GGAUGUUUUAAGG -> M F then UAA", () => {
    const m = "GGAUGUUUUAAGG";
    assert.equal(T.findStarts(m)[0].position, 2);
    const t = T.translateFirstAug(m);
    assert.equal(t.protein, "MF"); assert.equal(t.status, "terminated");
  });
  test("no stop: the status says so; a trailing partial codon is reported", () => {
    assert.equal(T.translateFrom("AUGGCUAAA", 0).status, "no-stop");
    const t = T.translateFrom("AUGGCUAAAGG", 0);
    assert.equal(t.status, "incomplete-codon"); assert.equal(t.leftover, "GG"); assert.equal(t.protein, "MAK");
  });
  test("three frames of the same mRNA differ (hand-read)", () => {
    const m = "AUGGCUAAAUGA";
    assert.equal(T.translateFrame(m, 0).protein, "MAK*");
    assert.equal(T.translateFrame(m, 1).protein, "WLN"); // UGG CUA AAU | GA
    assert.equal(T.translateFrame(m, 2).protein, "G*M"); // GGC UAA AUG | A
  });
  test("every AUG is listed with its frame", () => {
    assert.deepEqual(T.findStarts("AUGAUGGAUG"), [{ position: 0, frame: 0 }, { position: 3, frame: 0 }, { position: 7, frame: 1 }]);
    assert.deepEqual(T.findStarts("CAUGAAUG").map((s) => s.frame), [1, 2]);
  });
  test("no AUG gives no translation", () => { assert.equal(T.translateFirstAug("GGCCUUAA"), null); });
});

describe("mutations and their consequences", () => {
  const wild = "AUGGCUAAAUGA"; // M A K *
  const run = (m) => { const mut = M.applyMutation(wild, m, "ACGU"); return M.classify(wild, mut, 0, m); };
  test("silent: GCU -> GCC (Ala -> Ala)", () => { const c = run({ kind: "substitution", pos: 5, base: "C" }); assert.equal(c.class, "silent"); assert.equal(c.mutant.protein, "MAK"); });
  test("missense: GCU -> GAU (Ala -> Asp) at residue 2", () => { const c = run({ kind: "substitution", pos: 4, base: "A" }); assert.equal(c.class, "missense"); assert.equal(c.mutant.protein, "MDK"); assert.equal(c.firstDifference, 1); });
  test("nonsense: AAA -> UAA makes a premature stop", () => { const c = run({ kind: "substitution", pos: 6, base: "U" }); assert.equal(c.class, "nonsense"); assert.equal(c.mutant.protein, "MA"); });
  test("start loss: AUG -> ACG", () => { assert.equal(run({ kind: "substitution", pos: 1, base: "C" }).class, "start-loss"); });
  test("stop loss: UGA -> UGG (Trp) reads on", () => { assert.equal(run({ kind: "substitution", pos: 11, base: "G" }).class, "stop-loss"); });
  test("frameshift: deleting the C of GCU leaves AUG GUA AAU GA -> M V N", () => {
    const m = { kind: "deletion", pos: 4, length: 1 };
    assert.equal(M.applyMutation(wild, m, "ACGU"), "AUGGUAAAUGA"); // hand check
    const c = run(m);
    assert.equal(c.class, "frameshift"); assert.equal(c.mutant.protein, "MVN");
  });
  test("insertion of one base is a frameshift; insertion of three is in-frame", () => {
    assert.equal(run({ kind: "insertion", pos: 3, bases: "C" }).class, "frameshift");
    const c = run({ kind: "insertion", pos: 3, bases: "GGG" });
    assert.equal(c.class, "in-frame insertion"); assert.equal(c.mutant.protein, "MGAK");
  });
  test("in-frame deletion of one codon removes exactly one residue", () => { const c = run({ kind: "deletion", pos: 3, length: 3 }); assert.equal(c.class, "in-frame deletion"); assert.equal(c.mutant.protein, "MK"); });
  test("an insertion upstream of the start shifts the start site without changing the peptide", () => {
    const w = "GGAUGGCUUAA"; const m = { kind: "insertion", pos: 1, bases: "C" };
    const mut = M.applyMutation(w, m, "ACGU");
    const c = M.classify(w, mut, 2, m);
    assert.equal(c.class, "silent"); assert.match(c.summary, /upstream of the start codon/); assert.equal(c.mutant.protein, "MA");
  });
  test("malformed edits are refused, never clamped", () => {
    assert.equal(M.applyMutation(wild, { kind: "substitution", pos: 99, base: "A" }, "ACGU"), null);
    assert.equal(M.applyMutation(wild, { kind: "substitution", pos: 1, base: "T" }, "ACGU"), null);
    assert.equal(M.applyMutation(wild, { kind: "deletion", pos: 10, length: 5 }, "ACGU"), null);
    assert.equal(M.applyMutation(wild, { kind: "insertion", pos: 0, bases: "" }, "ACGU"), null);
    assert.equal(M.applyMutation(wild, { kind: "insertion", pos: 0, bases: "AAAAAAA" }, "ACGU"), null);
  });
});
