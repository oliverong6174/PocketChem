// Stage 16: genetics engine. Expected values are classical results written out by hand as exact fractions, not produced by the
// model under test (Mendel's 3:1 and 9:3:3:1, test crosses, 1:2:1 for incomplete dominance and codominance, ABO, X-linkage,
// two-point linkage with a stated recombination fraction).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let C, G, L;
before(async () => {
  C = await loadModule("/src/utils/biology/chromosome.ts");
  G = await loadModule("/src/utils/biology/genetics.ts");
  L = await loadModule("/src/utils/biology/bioLearning16.ts");
  half = G.fr(1, 2);
});
after(async () => { await closeEngine(); });

const F = (n, d = 1) => ({ n, d });
const frEq = (a, b) => a.n * b.d === b.n * a.d;
const asMap = (tallies) => Object.fromEntries(tallies.map((t) => [t.label, `${t.p.n}/${t.p.d}`]));
const mono = (a, b) => C.individual("mono", [[a], [b]]);
const di = (a1, b1, a2, b2) => C.individual("di", [[a1], [b1]], [[a2], [b2]]);
let half;
const x = (p1, p2, r = half) => G.cross(p1, p2, r);

describe("monohybrid crosses", () => {
  test("[Rr × Rr] genotypes 1/4, 1/2, 1/4 (1:2:1); phenotypes round 3/4 and wrinkled 1/4 (3:1)", () => {
    const r = x(mono("R", "r"), mono("R", "r"));
    assert.deepEqual(asMap(r.genotypes), { RR: "1/4", Rr: "1/2", rr: "1/4" });
    assert.deepEqual(asMap(r.phenotypes), { round: "3/4", wrinkled: "1/4" });
    assert.equal(r.genotypicRatio, "1:2:1"); assert.equal(r.phenotypicRatio, "3:1");
    assert.equal(r.grid.length * r.grid[0].length, 4);
  });
  test("[segregation] a heterozygote makes two kinds of gamete, each exactly 1/2; a homozygote makes one", () => {
    const g = G.gametesOf(mono("R", "r"), half);
    assert.deepEqual(g.map((q) => [q.label, `${q.p.n}/${q.p.d}`]), [["R", "1/2"], ["r", "1/2"]]);
    assert.deepEqual(G.gametesOf(mono("R", "R"), half).map((q) => [q.label, `${q.p.n}/${q.p.d}`]), [["R", "1/1"]]);
  });
  test("[RR × rr] all offspring Rr round; [Rr × RR] all round, genotypes 1:1", () => {
    const a = x(mono("R", "R"), mono("r", "r")); assert.deepEqual(asMap(a.genotypes), { Rr: "1/1" }); assert.deepEqual(asMap(a.phenotypes), { round: "1/1" });
    const b = x(mono("R", "r"), mono("R", "R")); assert.deepEqual(asMap(b.genotypes), { RR: "1/2", Rr: "1/2" }); assert.equal(b.phenotypicRatio, "1");
  });
  test("[test cross] Rr × rr gives 1:1; RR × rr gives all round; the tester is homozygous recessive", () => {
    const t = G.testerFor(mono("R", "r")); assert.deepEqual(t.pairs[0].a.alleles, ["r"]); assert.deepEqual(t.pairs[0].b.alleles, ["r"]);
    assert.deepEqual(asMap(G.testCross(mono("R", "r")).phenotypes), { round: "1/2", wrinkled: "1/2" });
    assert.deepEqual(asMap(G.testCross(mono("R", "R")).phenotypes), { round: "1/1" });
    const ti = G.testCrossInterpretation("R");
    assert.equal(ti.homozygous.phenotypicRatio, "1"); assert.equal(ti.heterozygous.phenotypicRatio, "1:1");
  });
});

describe("dihybrid crosses and independent assortment", () => {
  test("[RrYy × RrYy] four gametes of 1/4; sixteen boxes; 9:3:3:1 with exact fractions", () => {
    const p = di("R", "r", "Y", "y"); const r = x(p, p);
    assert.equal(r.gametes1.length, 4); assert.ok(r.gametes1.every((g) => frEq(g.p, F(1, 4))));
    assert.deepEqual(r.gametes1.map((g) => g.label).sort(), ["R Y", "R y", "r Y", "r y"]);
    assert.equal(r.grid.length * r.grid[0].length, 16);
    assert.deepEqual(asMap(r.phenotypes), { "round, yellow": "9/16", "round, green": "3/16", "wrinkled, yellow": "3/16", "wrinkled, green": "1/16" });
    assert.equal(r.phenotypicRatio, "9:3:3:1");
    assert.equal(r.genotypes.length, 9);
    assert.equal(asMap(r.genotypes)["Rr Yy"], "1/4");
  });
  test("[independent assortment] P(gamete) = P(allele 1) × P(allele 2) for every gamete class", () => {
    const g = G.gametesOf(di("R", "r", "Y", "y"), half);
    for (const q of g) assert.ok(frEq(q.p, G.frMul(F(1, 2), F(1, 2))));
    // a parent heterozygous at one gene only makes two classes of 1/2
    const g2 = G.gametesOf(di("R", "r", "Y", "Y"), half); assert.deepEqual(g2.map((q) => q.label), ["R Y", "r Y"]);
  });
  test("[test cross] RrYy × rryy gives 1:1:1:1; RrYy × RrYY gives 3:1", () => {
    assert.equal(G.testCross(di("R", "r", "Y", "y")).phenotypicRatio, "1:1:1:1");
    assert.equal(x(di("R", "r", "Y", "y"), di("R", "r", "Y", "Y")).phenotypicRatio, "3:1");
  });
  test("[fractions sum to one] every distribution is a probability distribution", () => {
    for (const [a, b] of [[di("R", "r", "Y", "y"), di("R", "r", "Y", "y")], [mono("R", "r"), mono("R", "r")]]) {
      const r = x(a, b);
      for (const t of [r.genotypes, r.phenotypes]) assert.ok(frEq(t.reduce((s, q) => G.frAdd(s, q.p), G.FR_ZERO), F(1)));
    }
  });
});

describe("beyond simple dominance", () => {
  test("[incomplete dominance] CᴿCᵂ × CᴿCᵂ: red 1/4, pink 1/2, white 1/4 — phenotype ratio equals genotype ratio (1:2:1)", () => {
    const p = C.individual("incomplete", [["CR"], ["CW"]]); const r = x(p, p);
    assert.deepEqual(asMap(r.phenotypes), { red: "1/4", pink: "1/2", white: "1/4" });
    assert.equal(r.phenotypicRatio, "2:1:1"); assert.equal(r.genotypicRatio, "1:2:1");
    assert.equal(C.locusPhenotype("CR", ["CR", "CW"]), "pink");
  });
  test("[codominance] LᴹLᴺ × LᴹLᴺ: M 1/4, MN 1/2, N 1/4; the heterozygote shows both", () => {
    const p = C.individual("codominant", [["LM"], ["LN"]]); const r = x(p, p);
    assert.deepEqual(asMap(r.phenotypes), { M: "1/4", MN: "1/2", N: "1/4" });
    assert.equal(C.locusPhenotype("LM", ["LM", "LN"]), "MN");
  });
  test("[multiple alleles] ABO: IᴬIᴮ is AB, Iᴬi is A, Iᴮi is B, ii is O", () => {
    const pairs = { "IA,IB": "AB", "IA,i": "A", "IB,i": "B", "i,i": "O", "IA,IA": "A", "IB,IB": "B" };
    for (const [k, v] of Object.entries(pairs)) assert.equal(C.locusPhenotype("ABO", k.split(",")), v, k);
    const ab = (a, b) => C.individual("abo", [[a[0]], [a[1]]]);
    void ab;
    const r = x(C.individual("abo", [["IA"], ["i"]]), C.individual("abo", [["IB"], ["i"]]));
    assert.deepEqual(asMap(r.phenotypes), { A: "1/4", B: "1/4", AB: "1/4", O: "1/4" });
    const r2 = x(C.individual("abo", [["IA"], ["IB"]]), C.individual("abo", [["i"], ["i"]])); assert.deepEqual(asMap(r2.phenotypes), { A: "1/2", B: "1/2" });
    const r3 = x(C.individual("abo", [["IA"], ["i"]]), C.individual("abo", [["IA"], ["i"]])); assert.deepEqual(asMap(r3.phenotypes), { A: "3/4", O: "1/4" });
  });
  test("[X-linked recessive] carrier mother × normal father: daughters all normal, sons 1/2 colour-blind", () => {
    const r = x(C.individual("xlinked", [["C"], ["c"]]), C.individual("xlinked", [["C"], []]));
    assert.deepEqual(asMap(r.phenotypes), { "female, normal vision": "1/2", "male, normal vision": "1/4", "male, colour-blind": "1/4" });
    assert.deepEqual(asMap(r.genotypes), { XCXC: "1/4", XCXc: "1/4", XCY: "1/4", XcY: "1/4" });
  });
  test("[X-linked recessive] colour-blind mother × normal father: all sons colour-blind, all daughters carriers with normal vision", () => {
    const r = x(C.individual("xlinked", [["c"], ["c"]]), C.individual("xlinked", [["C"], []]));
    assert.deepEqual(asMap(r.phenotypes), { "female, normal vision": "1/2", "male, colour-blind": "1/2" });
    assert.deepEqual(asMap(r.genotypes), { XCXc: "1/2", XcY: "1/2" });
  });
  test("[X-linked] a male passes his X to every daughter and his Y to every son", () => {
    const r = x(C.individual("xlinked", [["C"], ["C"]]), C.individual("xlinked", [["c"], []]));
    assert.deepEqual(asMap(r.genotypes), { XCXc: "1/2", XCY: "1/2" }, "sons get the mother's X, daughters the father's Xᶜ");
    assert.equal(C.sexOf(C.individual("xlinked", [["C"], []])), "male"); assert.equal(C.sexOf(C.individual("xlinked", [["C"], ["c"]])), "female");
  });
  test("[genotype is not phenotype] different genotypes can share a phenotype only where the stated rule says so", () => {
    assert.equal(C.locusPhenotype("R", ["R", "R"]), C.locusPhenotype("R", ["R", "r"]));
    assert.notEqual(C.locusPhenotype("CR", ["CR", "CR"]), C.locusPhenotype("CR", ["CR", "CW"]));
    assert.match(C.LOCI.CR.rule, /Incomplete dominance/); assert.match(C.LOCI.LM.rule, /Codominance/); assert.match(C.LOCI.XC.rule, /X-linked/);
  });
});

describe("linkage and recombination", () => {
  let coupling, repulsion;
  before(() => { coupling = C.individual("linked", [["A", "B"], ["a", "b"]]); repulsion = C.individual("linked", [["A", "b"], ["a", "B"]]); });
  const freqs = (ind, r) => Object.fromEntries(G.gametesOf(ind, r).map((g) => [g.label, `${g.p.n}/${g.p.d}`]));
  test("[coupling, r = 0.2] parental AB and ab 2/5 each, recombinant Ab and aB 1/10 each", () => {
    assert.deepEqual(freqs(coupling, G.fr(1, 5)), { AB: "2/5", ab: "2/5", Ab: "1/10", aB: "1/10" });
  });
  test("[repulsion, r = 0.2] parental Ab and aB 2/5 each, recombinant AB and ab 1/10 each: phase is preserved", () => {
    assert.deepEqual(freqs(repulsion, G.fr(1, 5)), { Ab: "2/5", aB: "2/5", AB: "1/10", ab: "1/10" });
    assert.equal(G.analyzeLinkage(coupling, half).phase, "coupling"); assert.equal(G.analyzeLinkage(repulsion, half).phase, "repulsion");
  });
  test("[recombinant frequency equals r] for several r", () => {
    for (const [n, d] of [[0, 1], [1, 10], [1, 5], [3, 10], [1, 2], [7, 100]]) {
      const a = G.analyzeLinkage(coupling, G.fr(n, d)); assert.ok(frEq(a.recombinantFrequency, G.fr(n, d)), `${n}/${d}`);
      assert.ok(frEq(G.analyzeLinkage(repulsion, G.fr(n, d)).recombinantFrequency, G.fr(n, d)));
    }
  });
  test("[r = 0] complete linkage: only the two parental classes (1/2 each)", () => {
    assert.deepEqual(freqs(coupling, G.fr(0, 1)), { AB: "1/2", ab: "1/2" });
    assert.equal(x(coupling, coupling, G.fr(0, 1)).phenotypicRatio, "3:1", "AB/ab selfed with no recombination is 3:1");
  });
  test("[r = 0.5] behaves as unlinked: four classes of 1/4 and 9:3:3:1 when selfed", () => {
    assert.deepEqual(freqs(coupling, half), { AB: "1/4", ab: "1/4", Ab: "1/4", aB: "1/4" });
    assert.equal(x(coupling, coupling, half).phenotypicRatio, "9:3:3:1");
  });
  test("[test cross] AB/ab × ab/ab at r = 0.2: offspring phenotypes mirror the gametes, 40:40:10:10", () => {
    const r = G.testCross(coupling, G.fr(1, 5));
    assert.deepEqual(asMap(r.phenotypes), { "A-phenotype, B-phenotype": "2/5", "a-phenotype, b-phenotype": "2/5", "A-phenotype, b-phenotype": "1/10", "a-phenotype, B-phenotype": "1/10" });
    assert.equal(r.phenotypicRatio, "4:4:1:1");
  });
  test("[homozygous at one gene] crossing over cannot make a new combination: AB/aB has only two gamete classes at any r", () => {
    const p = C.individual("linked", [["A", "B"], ["a", "B"]]);
    assert.deepEqual(freqs(p, G.fr(1, 5)), { AB: "1/2", aB: "1/2" });
    assert.equal(G.analyzeLinkage(p, G.fr(1, 5)).phase, "undefined");
  });
  test("[crossing over changes allele combinations] one exchange between non-sister chromatids turns {AB, AB, ab, ab} into {AB, Ab, aB, ab}", () => {
    const before = C.tetrad(coupling.pairs[0], null).map((c) => c.alleles.join(""));
    assert.deepEqual(before, ["AB", "AB", "ab", "ab"]);
    const after = C.tetrad(coupling.pairs[0], { between: 0, m: 1, p: 0 });
    assert.deepEqual(after.map((c) => c.alleles.join("")).sort(), ["AB", "Ab", "aB", "ab"]);
    // the recombinant chromatids are partly maternal and partly paternal; the untouched sisters are not
    assert.deepEqual(after[1].origins, ["maternal", "paternal"]); assert.deepEqual(after[2].origins, ["paternal", "maternal"]);
    assert.deepEqual(after[0].origins, ["maternal", "maternal"]); assert.deepEqual(after[3].origins, ["paternal", "paternal"]);
  });
  test("[recombination input] r must be 0–0.5 with at most 3 decimals", () => {
    for (const ok of [0, 0.25, 0.5, 0.123]) assert.notEqual(G.parseRecombination(ok), null, String(ok));
    for (const bad of [-0.1, 0.51, 0.1234, NaN, Infinity, "0.2", null, undefined]) assert.equal(G.parseRecombination(bad), null, String(bad));
  });
  test("[estimate] r can be estimated from test-cross counts", () => {
    assert.equal(G.estimateRecombination({ parental: 80, recombinant: 20 }), 0.2); assert.equal(G.estimateRecombination({ parental: 0, recombinant: 0 }), null);
  });
});

describe("validation and learning tasks", () => {
  test("[validateIndividual] rejects unknown layouts, wrong allele counts, alleles of another gene, and a Y in an autosomal pair", () => {
    const good = mono("R", "r");
    assert.equal(C.validateIndividual(good).ok, true);
    for (const bad of [null, [], { layout: "nope", pairs: [] }, { ...good, pairs: [] }, { ...good, pairs: [{ a: { alleles: ["R", "r"] }, b: { alleles: ["r"] } }] }, { ...good, pairs: [{ a: { alleles: ["Y"] }, b: { alleles: ["r"] } }] }, { ...good, pairs: [{ a: { alleles: ["R"] }, b: { alleles: [] } }] }])
      assert.equal(C.validateIndividual(bad).ok, false, JSON.stringify(bad));
    assert.equal(C.validateIndividual(C.individual("xlinked", [["C"], []])).ok, true);
  });
  test("[gamete task] the correct set is exactly the gametes with non-zero probability; extra and missing choices are reported", () => {
    const t = L.gameteTask(di("R", "r", "Y", "y"), half);
    assert.deepEqual(t.correct, ["R Y", "R y", "r Y", "r y"]);
    assert.equal(L.gradeGameteTask(t, ["R Y", "R y", "r Y", "r y"]).ok, true);
    const bad = L.gradeGameteTask(t, ["R Y", "r y", "R r"]);
    assert.deepEqual(bad.missing.sort(), ["R y", "r Y"]); assert.deepEqual(bad.extra, ["R r"]); assert.equal(bad.ok, false);
    const lk = L.gameteTask(C.individual("linked", [["A", "B"], ["a", "b"]]), G.fr(0, 1));
    assert.deepEqual(lk.correct, ["AB", "ab"], "with r = 0 only the parental chromosomes are gametes");
  });
  test("[numeric challenge] the answer is the rarest phenotype's exact probability, or the recombinant fraction for linked genes", () => {
    const c = L.geneticsChallenge(mono("R", "r"), mono("R", "r"), half);
    assert.equal(c.kind, "phenotype"); assert.deepEqual([c.answer.n, c.answer.d], [1, 4]); assert.equal(c.className, "wrinkled");
    const d = L.geneticsChallenge(di("R", "r", "Y", "y"), di("R", "r", "Y", "y"), half); assert.deepEqual([d.answer.n, d.answer.d], [1, 16]);
    const k = L.geneticsChallenge(C.individual("linked", [["A", "B"], ["a", "b"]]), C.individual("linked", [["a", "b"], ["a", "b"]]), G.fr(3, 20));
    assert.equal(k.kind, "recombinant"); assert.deepEqual([k.answer.n, k.answer.d], [3, 20]);
  });
  test("[input parsing] fractions, decimals, percentages and 'n in d'", () => {
    assert.equal(L.parseProbabilityInput("1/4"), 0.25); assert.equal(L.parseProbabilityInput("0.25"), 0.25); assert.equal(L.parseProbabilityInput("25%"), 0.25); assert.equal(L.parseProbabilityInput("3 in 16"), 0.1875);
    for (const bad of ["", "abc", "1/0", "2", "-1"]) assert.equal(L.parseProbabilityInput(bad), null, bad);
    assert.equal(L.probabilityMatches(0.25, G.fr(1, 4)), true); assert.equal(L.probabilityMatches(0.3, G.fr(1, 4)), false);
  });
  test("[questions] ratio answer equals the engine's phenotypic ratio; options are unique", () => {
    const p = di("R", "r", "Y", "y"); const qs = L.geneticsQuestions(p, p, half);
    const q = qs.find((z) => z.id === "gen-ratio"); assert.equal(q.options[q.answer], "9:3:3:1");
    for (const z of qs) { assert.equal(new Set(z.options).size, z.options.length, z.id); assert.ok(z.answer >= 0); }
  });
});
