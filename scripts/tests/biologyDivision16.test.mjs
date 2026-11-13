// Stage 16: mitosis and meiosis engine, nondisjunction, and the genetics ↔ meiosis integration. Reference outcomes are counted by
// hand from the textbook description of each stage (chromosome = centromere, chromatid = DNA molecule, C = chromatids ÷ n).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let C, G, D, L;
before(async () => {
  C = await loadModule("/src/utils/biology/chromosome.ts");
  G = await loadModule("/src/utils/biology/genetics.ts");
  D = await loadModule("/src/utils/biology/cellDivision.ts");
  L = await loadModule("/src/utils/biology/bioLearning16.ts");
});
after(async () => { await closeEngine(); });

const dihybrid = () => C.individual("di", [["R"], ["r"]], [["Y"], ["y"]]);
const monohybrid = () => C.individual("mono", [["R"], ["r"]]);
const linked = () => C.individual("linked", [["A", "B"], ["a", "b"]]);
const byId = (stages) => Object.fromEntries(stages.map((s) => [s.id, s]));
const sum = (a) => a.reduce((x, y) => x + y, 0);
const triple = (s) => s.counts.map((c) => [c.chromosomes, c.chromatids, c.dnaC]);

describe("mitosis: chromosome number, chromatids and DNA content", () => {
  test("[2n = 4] counts at every stage: 4/4/2C, 4/8/4C ×4 stages, 8/8/4C at anaphase, then two cells of 4/4/2C", () => {
    const s = byId(D.buildMitosis(dihybrid()));
    assert.deepEqual(Object.keys(s), ["g1", "s", "prophase", "prometaphase", "metaphase", "anaphase", "telophase"]);
    assert.deepEqual(triple(s.g1), [[4, 4, 2]]);
    for (const id of ["s", "prophase", "prometaphase", "metaphase"]) assert.deepEqual(triple(s[id]), [[4, 8, 4]], id);
    assert.deepEqual(triple(s.anaphase), [[8, 8, 4]], "anaphase doubles the chromosome number but not the DNA");
    assert.deepEqual(triple(s.telophase), [[4, 4, 2], [4, 4, 2]]);
  });
  test("[chromosome number is not DNA content] S phase doubles DNA but not chromosomes; anaphase doubles chromosomes but not DNA", () => {
    const s = byId(D.buildMitosis(monohybrid()));
    assert.equal(s.g1.counts[0].chromosomes, s.s.counts[0].chromosomes); assert.equal(s.s.counts[0].dnaC, 2 * s.g1.counts[0].dnaC);
    assert.equal(s.anaphase.counts[0].chromosomes, 2 * s.metaphase.counts[0].chromosomes); assert.equal(s.anaphase.counts[0].dnaC, s.metaphase.counts[0].dnaC);
  });
  test("[sister chromatids separate] each daughter cell gets one chromatid of every replicated chromosome: genetically identical to the parent", () => {
    const s = byId(D.buildMitosis(dihybrid()));
    for (const cell of s.telophase.cells) {
      assert.equal(cell.chromosomes.every((c) => c.chromatids.length === 1), true);
      assert.equal(D.gameteLabel(cell.chromosomes, 2), "R+r Y+y");
      assert.deepEqual(cell.chromosomes.map((c) => c.chromatids[0].alleles[0]).sort(), ["R", "Y", "r", "y"].sort());
    }
    assert.equal(s.telophase.counts[0].sets, "diploid (2n)");
  });
  test("[no pairing in mitosis] homologs are never paired and no chiasmata exist", () => {
    for (const st of D.buildMitosis(linked())) for (const cell of st.cells) for (const c of cell.chromosomes) { assert.equal(c.paired, false); assert.equal(c.chiasmata.length, 0); }
  });
  test("[spindle] metaphase: each sister kinetochore faces its own pole; chromosomes sit on the plate", () => {
    const m = D.buildMitosis(dihybrid())[4];
    for (const c of m.cells[0].chromosomes) { assert.equal(c.position, "plate"); assert.deepEqual(c.facing, [0, 1]); }
  });
});

describe("meiosis: counts and the two divisions", () => {
  const stages = () => byId(D.buildMeiosis(dihybrid(), D.defaultMeiosisSettings(dihybrid())));
  test("[counts] 4/4/2C → 4/8/4C through prophase I–anaphase I → two cells of 2/4/2C → anaphase II 4/4/2C each → four cells of 2/2/1C", () => {
    const s = stages();
    assert.deepEqual(triple(s.g1), [[4, 4, 2]]);
    for (const id of ["s", "prophase1", "crossing", "metaphase1", "anaphase1"]) assert.deepEqual(triple(s[id]), [[4, 8, 4]], id);
    for (const id of ["telophase1", "prophase2", "metaphase2"]) assert.deepEqual(triple(s[id]), [[2, 4, 2], [2, 4, 2]], id);
    assert.deepEqual(triple(s.anaphase2), [[4, 4, 2], [4, 4, 2]]);
    assert.deepEqual(triple(s.telophase2), [[2, 2, 1], [2, 2, 1], [2, 2, 1], [2, 2, 1]]);
  });
  test("[one S phase, two divisions] DNA is replicated once: total chromatids 4 → 8 and stays 8 until the end", () => {
    const totals = D.buildMeiosis(dihybrid(), D.defaultMeiosisSettings(dihybrid())).map((st) => sum(st.counts.map((c) => c.chromatids)));
    assert.deepEqual(totals, [4, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]);
  });
  test("[meiosis I separates homologs] after telophase I each cell holds exactly one homolog of each pair, with sister chromatids still joined", () => {
    const t1 = byId(D.buildMeiosis(dihybrid(), D.defaultMeiosisSettings(dihybrid()))).telophase1;
    for (const cell of t1.cells) {
      assert.deepEqual(cell.chromosomes.map((c) => c.pair).sort(), [0, 1]);
      assert.ok(cell.chromosomes.every((c) => c.chromatids.length === 2 && !c.paired));
    }
    const homologsOfPair0 = t1.cells.map((cell) => cell.chromosomes.find((c) => c.pair === 0).homolog).sort();
    assert.deepEqual(homologsOfPair0, [0, 1], "the two homologs of a pair go to different cells");
    assert.equal(t1.counts[0].sets, "haploid (n)");
  });
  test("[meiosis II separates sister chromatids] each final cell has single-chromatid chromosomes, one per pair", () => {
    const t2 = byId(D.buildMeiosis(dihybrid(), D.defaultMeiosisSettings(dihybrid()))).telophase2;
    for (const cell of t2.cells) { assert.ok(cell.chromosomes.every((c) => c.chromatids.length === 1)); assert.deepEqual(cell.chromosomes.map((c) => c.pair).sort(), [0, 1]); }
    assert.ok(t2.counts.every((c) => c.sets === "haploid (n)"));
  });
  test("[pairing] prophase I pairs the homologs (bivalents of 4 chromatids); metaphase I keeps them paired on the plate; anaphase I separates them", () => {
    const s = stages();
    assert.ok(s.prophase1.cells[0].chromosomes.every((c) => c.paired)); assert.ok(s.metaphase1.cells[0].chromosomes.every((c) => c.paired && c.position === "plate"));
    assert.ok(s.anaphase1.cells[0].chromosomes.every((c) => !c.paired && c.position === "moving"));
    assert.ok(s.g1.cells[0].chromosomes.every((c) => !c.paired));
  });
  test("[independent assortment] the four metaphase I orientations of a dihybrid give all four gamete classes, two gametes each", () => {
    const seen = new Set();
    for (const o of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const s = { ...D.defaultMeiosisSettings(dihybrid()), orient1: o };
      const labels = D.gameteComplements(dihybrid(), s).map((g) => g.label).sort();
      const [a, b] = [labels[0], labels[2]];
      assert.deepEqual(labels, [a, a, b, b], "two gametes of each of two complementary classes");
      seen.add(a); seen.add(b);
    }
    assert.deepEqual([...seen].sort(), ["R Y", "R y", "r Y", "r y"]);
    assert.deepEqual(D.gameteComplements(dihybrid(), { ...D.defaultMeiosisSettings(dihybrid()), orient1: [0, 0] }).map((g) => g.label), ["R Y", "R Y", "r y", "r y"]);
    assert.deepEqual(D.gameteComplements(dihybrid(), { ...D.defaultMeiosisSettings(dihybrid()), orient1: [0, 1] }).map((g) => g.label).sort(), ["R y", "R y", "r Y", "r Y"]);
  });
});

describe("crossing over", () => {
  test("[outcome] one crossover turns AB/ab's four chromatids into AB, Ab, aB, ab: every gamete class once", () => {
    const s = { ...D.defaultMeiosisSettings(linked()), crossover: [{ between: 0, m: 1, p: 0 }] };
    assert.deepEqual(D.gameteComplements(linked(), s).map((g) => g.label).sort(), ["AB", "Ab", "aB", "ab"]);
    const stages = byId(D.buildMeiosis(linked(), s));
    assert.deepEqual(stages.crossing.cells[0].chromosomes.flatMap((c) => c.chromatids.map((x) => x.alleles.join(""))).sort(), ["AB", "Ab", "aB", "ab"]);
    assert.equal(stages.crossing.cells[0].chromosomes[0].chiasmata.length, 1);
    assert.equal(stages.prophase1.cells[0].chromosomes.flatMap((c) => c.chromatids).filter((x) => new Set(x.origins).size > 1).length, 0, "no recombinant chromatids before crossing over");
    assert.equal(stages.crossing.cells[0].chromosomes.flatMap((c) => c.chromatids).filter((x) => new Set(x.origins).size > 1).length, 2, "two recombinant chromatids after");
  });
  test("[no crossover] gametes are only the parental chromosomes AB and ab (two each)", () => {
    assert.deepEqual(D.gameteComplements(linked(), D.defaultMeiosisSettings(linked())).map((g) => g.label).sort(), ["AB", "AB", "ab", "ab"]);
  });
  test("[sister orientation matters after crossover] flipping metaphase II orientation changes which recombinant pairs with which", () => {
    const base = { ...D.defaultMeiosisSettings(linked()), crossover: [{ between: 0, m: 1, p: 0 }] };
    const flipped = { ...base, orient2: [[1], [0]] };
    assert.deepEqual(D.gameteComplements(linked(), flipped).map((g) => g.label).sort(), ["AB", "Ab", "aB", "ab"]);
    assert.notDeepEqual(D.gameteComplements(linked(), base).map((g) => g.label), D.gameteComplements(linked(), flipped).map((g) => g.label));
  });
  test("[validation] a crossover needs two genes on the pair", () => {
    assert.equal(D.validateMeiosisSettings(monohybrid(), { ...D.defaultMeiosisSettings(monohybrid()), crossover: [{ between: 0, m: 0, p: 0 }] }), null);
    assert.notEqual(D.validateMeiosisSettings(linked(), { ...D.defaultMeiosisSettings(linked()), crossover: [{ between: 0, m: 0, p: 1 }] }), null);
    assert.equal(D.validateMeiosisSettings(linked(), { ...D.defaultMeiosisSettings(linked()), crossover: [{ between: 1, m: 0, p: 1 }] }), null);
  });
});

describe("nondisjunction", () => {
  const withNd = (ind, nd, extra = {}) => ({ ...D.defaultMeiosisSettings(ind), nd, ...extra });
  test("[meiosis I] both homologs of the pair go to one pole: two gametes carry both homologs (n+1), two carry none (n−1); the other pair is normal", () => {
    const g = D.gameteComplements(dihybrid(), withNd(dihybrid(), { kind: "I", pair: 0, pole: 0 }));
    assert.deepEqual(g.map((x) => x.perPair[0]), [2, 2, 0, 0]);
    assert.deepEqual(g.map((x) => x.perPair[1]), [1, 1, 1, 1]);
    assert.deepEqual(g.map((x) => x.sets), ["n + 1 (extra chromosome of pair 1)", "n + 1 (extra chromosome of pair 1)", "n − 1 (no chromosome of pair 1)", "n − 1 (no chromosome of pair 1)"]);
    assert.deepEqual(g.slice(0, 2).map((x) => x.label), ["R+r Y", "R+r Y"], "the disomic gametes hold BOTH different homologs");
  });
  test("[meiosis II] sister chromatids go to the same pole in one cell: one gamete n+1 (two copies of one homolog), one n−1; the other cell is normal", () => {
    const s = withNd(dihybrid(), { kind: "II", pair: 0, cell: 0, pole: 0 });
    const g = D.gameteComplements(dihybrid(), s);
    assert.deepEqual(g.map((x) => x.perPair[0]), [2, 0, 1, 1]);
    assert.deepEqual(g.map((x) => x.label), ["R+R Y", "– Y", "r y", "r y"]);
    const core = D.meiosisCore(dihybrid(), s);
    assert.equal(D.disomyType(core.gametes[0], 0), "sister copies");
    assert.equal(D.disomyType(D.meiosisCore(dihybrid(), withNd(dihybrid(), { kind: "I", pair: 0, pole: 0 })).gametes[0], 0), "both homologs");
  });
  test("[meiosis I and II errors are not equivalent] the disomic gamete differs: R+r (heterozygous) versus R+R (identical copies)", () => {
    const i = D.gameteComplements(dihybrid(), withNd(dihybrid(), { kind: "I", pair: 0, pole: 0 }))[0].label;
    const ii = D.gameteComplements(dihybrid(), withNd(dihybrid(), { kind: "II", pair: 0, cell: 0, pole: 0 }))[0].label;
    assert.notEqual(i, ii); assert.match(i, /R\+r/); assert.match(ii, /R\+R/);
  });
  test("[conservation] whatever the error, the four gametes together still hold 8 chromosomes and 8 chromatids", () => {
    for (const nd of [{ kind: "none" }, { kind: "I", pair: 1, pole: 1 }, { kind: "II", pair: 0, cell: 1, pole: 1 }]) {
      const st = D.buildMeiosis(dihybrid(), withNd(dihybrid(), nd)); const last = st[st.length - 1];
      assert.equal(sum(last.counts.map((c) => c.chromosomes)), 8, JSON.stringify(nd)); assert.equal(sum(last.counts.map((c) => c.chromatids)), 8, JSON.stringify(nd));
    }
  });
  test("[after fertilisation] n+1 → trisomy, n−1 → monosomy; a nondisjunction changes chromosome number, not any allele", () => {
    assert.match(D.fertilisationOutcome(2), /trisomy/); assert.match(D.fertilisationOutcome(0), /monosomy/); assert.match(D.fertilisationOutcome(1), /normal diploid/);
    const alleles = new Set(D.meiosisCore(dihybrid(), withNd(dihybrid(), { kind: "I", pair: 0, pole: 0 })).gametes.flatMap((g) => g.flatMap((c) => c.chromatids[0].alleles)));
    assert.deepEqual([...alleles].sort(), ["R", "Y", "r", "y"].sort(), "no new allele appears");
  });
  test("[single-pair individual] with one pair the labels are still right (n+1 / n−1, not 2n)", () => {
    const g = D.gameteComplements(monohybrid(), withNd(monohybrid(), { kind: "I", pair: 0, pole: 1 }));
    assert.deepEqual(g.map((x) => x.sets), ["n − 1 (no chromosome of pair 1)", "n − 1 (no chromosome of pair 1)", "n + 1 (extra chromosome of pair 1)", "n + 1 (extra chromosome of pair 1)"]);
  });
  test("[challenge] the number of abnormal gametes comes from the segregation: 4 for meiosis I, 2 for meiosis II", () => {
    assert.equal(L.meiosisChallenge(dihybrid(), withNd(dihybrid(), { kind: "I", pair: 0, pole: 0 })).answer, 4);
    assert.equal(L.meiosisChallenge(dihybrid(), withNd(dihybrid(), { kind: "II", pair: 0, cell: 0, pole: 0 })).answer, 2);
    assert.equal(L.meiosisChallenge(linked(), { ...D.defaultMeiosisSettings(linked()), crossover: [{ between: 0, m: 1, p: 0 }] }).answer, 2);
    assert.equal(L.meiosisChallenge(linked(), D.defaultMeiosisSettings(linked())).answer, 0);
  });
});

describe("genetics ↔ meiosis consistency (population frequencies versus single events)", () => {
  const cases = () => [
    [dihybrid(), G.fr(1, 2)], [monohybrid(), G.fr(1, 2)], [C.individual("di", [["R"], ["R"]], [["Y"], ["y"]]), G.fr(1, 2)],
    [linked(), G.fr(1, 5)], [linked(), G.fr(0, 1)], [linked(), G.fr(1, 2)], [linked(), G.fr(3, 10)], [C.individual("linked", [["A", "b"], ["a", "B"]]), G.fr(1, 10)], [C.individual("linked", [["A", "B"], ["a", "B"]]), G.fr(1, 5)],
  ];
  test("[averaging over every meiosis reproduces the Genetics gamete frequencies exactly]", () => {
    for (const [ind, r] of cases()) {
      const expected = new Map(G.gametesOf(ind, r).map((g) => [g.label, g.p]));
      const got = D.meiosisDistribution(ind, r);
      assert.deepEqual([...got.keys()].sort(), [...expected.keys()].sort(), C.describeIndividual(ind));
      for (const [label, p] of expected) { const q = got.get(label); assert.ok(q && q.n * p.d === p.n * q.d, `${C.describeIndividual(ind)} r=${r.n}/${r.d} ${label}: ${q?.n}/${q?.d} vs ${p.n}/${p.d}`); }
    }
  });
  test("[every single meiosis yields a gamete class the Genetics model allows for some r]", () => {
    const allowed = new Set(G.gametesOf(linked(), G.fr(1, 2)).map((g) => g.label));
    for (const m of [0, 1]) for (const p of [0, 1]) for (const o1 of [0, 1]) for (const o2a of [0, 1]) for (const o2b of [0, 1]) {
      const s = { crossover: [{ between: 0, m, p }], orient1: [o1], orient2: [[o2a], [o2b]], nd: { kind: "none" } };
      for (const g of D.gameteComplements(linked(), s)) assert.ok(allowed.has(g.label), g.label);
    }
  });
  test("[parental and recombinant classes match]: the gametes of a crossover-free run are the parental classes of the genetics model", () => {
    const parental = new Set(G.gametesOf(linked(), G.fr(1, 5)).filter((g) => g.kind === "parental").map((g) => g.label));
    for (const g of D.gameteComplements(linked(), D.defaultMeiosisSettings(linked()))) assert.ok(parental.has(g.label));
  });
  test("[a single meiosis is not a distribution] one run has four gametes with frequencies 0, 1/4 or 1/2, never the model's 2/5", () => {
    const labels = D.gameteComplements(linked(), D.defaultMeiosisSettings(linked())).map((g) => g.label);
    assert.equal(new Set(labels).size, 2); assert.equal(labels.length, 4);
  });
  test("[offspring from illustrated gametes] combining two gametes of one run gives a genotype the cross allows", () => {
    const p = dihybrid(); const cross = G.cross(p, p, G.fr(1, 2));
    const allowed = new Set(cross.genotypes.map((t) => t.label));
    const gs = D.gameteComplements(p, D.defaultMeiosisSettings(p)).map((g) => g.label);
    // R Y × r y → Rr Yy is one of the nine genotypes
    assert.deepEqual(gs.slice(0, 1).concat(gs.slice(2, 3)), ["R Y", "r y"]); assert.ok(allowed.has("Rr Yy"));
  });
});

describe("states, validation and questions", () => {
  test("[autosomal only] X-linked layouts are refused by the division engines", () => {
    const xi = C.individual("xlinked", [["C"], ["c"]]);
    assert.throws(() => D.buildMitosis(xi)); assert.throws(() => D.buildMeiosis(xi, D.defaultMeiosisSettings(xi)));
  });
  test("[ids are unique and stable] chromosome ids never repeat across cells in one stage", () => {
    const s = { ...D.defaultMeiosisSettings(dihybrid()), nd: { kind: "II", pair: 0, cell: 0, pole: 0 } };
    for (const st of D.buildMeiosis(dihybrid(), s)) { const ids = st.cells.flatMap((c) => c.chromosomes.map((x) => x.id)); assert.equal(new Set(ids).size, ids.length, st.id); }
  });
  test("[settings validation] unknown fields and out-of-range pairs are rejected", () => {
    const d = D.defaultMeiosisSettings(dihybrid());
    for (const bad of [null, {}, { ...d, orient1: [0] }, { ...d, orient1: [0, 2] }, { ...d, nd: { kind: "I", pair: 5, pole: 0 } }, { ...d, nd: { kind: "II", pair: 0, cell: 2, pole: 0 } }, { ...d, nd: { kind: "III" } }])
      assert.equal(D.validateMeiosisSettings(dihybrid(), bad), null, JSON.stringify(bad));
    assert.notEqual(D.validateMeiosisSettings(dihybrid(), d), null);
  });
  test("[practice answers follow the engine] chromosome, chromatid and DNA questions equal the stage counts", () => {
    const st = D.buildMeiosis(dihybrid(), D.defaultMeiosisSettings(dihybrid()));
    for (let i = 0; i < st.length; i += 1) {
      const qs = L.divisionQuestions(st, i, "meiosis"); const chr = qs.find((q) => q.id.startsWith("dv-chr")); const dna = qs.find((q) => q.id.startsWith("dv-dna"));
      assert.equal(chr.options[chr.answer], String(st[i].counts[0].chromosomes)); assert.equal(dna.options[dna.answer], `${st[i].counts[0].dnaC}C`);
      for (const q of qs) assert.equal(new Set(q.options).size, q.options.length, q.id);
    }
  });
  test("[captions agree with the state] each stage's caption names what the engine does (homologs vs sisters)", () => {
    const s = byId(D.buildMeiosis(dihybrid(), D.defaultMeiosisSettings(dihybrid())));
    assert.match(s.anaphase1.caption, /HOMOLOGS separate/); assert.match(s.anaphase2.caption, /SISTER CHROMATIDS separate/);
    const nd = byId(D.buildMeiosis(dihybrid(), { ...D.defaultMeiosisSettings(dihybrid()), nd: { kind: "I", pair: 0, pole: 0 } }));
    assert.match(nd.anaphase1.caption, /NONDISJUNCTION IN MEIOSIS I/); assert.doesNotMatch(nd.anaphase2.caption, /NONDISJUNCTION/);
  });
});
