// Stage 16: gene-regulation models. Expected outcomes are written out by hand from textbook regulation (Jacob–Monod lac operon,
// trp repression + attenuation, eukaryotic activation) and are NOT built by calling the model under test.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let G, L;
before(async () => {
  G = await loadModule("/src/utils/biology/geneRegulation.ts");
  L = await loadModule("/src/utils/biology/bioLearning16.ts");
});
after(async () => { await closeEngine(); });

const wt = { I: "+", O: "+", P: "+", Z: "+" };
const lac = (copies, lactose, glucose, crp = "+") => ({ lactose, glucose, crp, copies: copies.map((c) => ({ ...wt, ...c })), step: 4 });
const rank = (copies, lactose, glucose, crp) => G.evaluateLac(lac(copies, lactose, glucose, crp)).transcription.rank;
const enzyme = (copies, lactose, glucose) => G.evaluateLac(lac(copies, lactose, glucose)).enzyme.rank;
// ranks: 0 none, 1 basal (leaky), 2 low, 3 high

describe("lac operon: one copy", () => {
  test("[induction] wild type: lactose and no glucose = high; both = low; no lactose = basal (leaky, not zero) whatever glucose does", () => {
    assert.equal(rank([{}], true, false), 3);
    assert.equal(rank([{}], true, true), 2);
    assert.equal(rank([{}], false, false), 1);
    assert.equal(rank([{}], false, true), 1);
    assert.ok(rank([{}], false, false) > 0, "leaky expression is not zero");
  });
  test("[catabolite repression] glucose lowers expression only when the operator is free; it cannot raise it", () => {
    for (const lactose of [true, false]) assert.ok(rank([{}], lactose, true) <= rank([{}], lactose, false));
    assert.equal(rank([{}], false, true), rank([{}], false, false));
  });
  test("[operator and repressor] repressor is bound exactly when there is no lactose; allolactose releases it", () => {
    assert.equal(G.evaluateLac(lac([{}], false, false)).copies[0].repressorBound, true);
    assert.equal(G.evaluateLac(lac([{}], true, false)).copies[0].repressorBound, false);
    assert.equal(G.evaluateLac(lac([{}], true, false)).allolactose, true);
  });
  test("[mutants] lacI⁻ is constitutive; lacIˢ is never induced; lacOᶜ is constitutive; lacP⁻ is silent; cAMP–CRP loss caps expression at low", () => {
    for (const lactose of [true, false]) { assert.equal(rank([{ I: "-" }], lactose, false), 3); assert.equal(rank([{ I: "-" }], lactose, true), 2); }
    for (const [lactose, glucose] of [[true, false], [true, true], [false, false], [false, true]]) assert.equal(rank([{ I: "s" }], lactose, glucose), 1);
    for (const lactose of [true, false]) { assert.equal(rank([{ O: "c" }], lactose, false), 3); assert.equal(rank([{ O: "c" }], lactose, true), 2); }
    for (const lactose of [true, false]) for (const glucose of [true, false]) assert.equal(rank([{ P: "-" }], lactose, glucose), 0);
    assert.equal(rank([{}], true, false, "-"), 2);
    assert.equal(rank([{}], false, false, "-"), 1);
  });
  test("[lacZ] a lacZ⁻ operon is transcribed as usual but makes no working enzyme", () => {
    assert.equal(rank([{ Z: "-" }], true, false), 3);
    assert.equal(enzyme([{ Z: "-" }], true, false), 0);
    assert.equal(enzyme([{}], true, false), 3);
  });
});

describe("lac operon: two copies (cis / trans)", () => {
  test("[trans] lacI⁻ is recessive: a lacI⁺ copy restores inducible control to both operons", () => {
    const cps = [{ I: "-" }, {}];
    const off = G.evaluateLac(lac(cps, false, false)); const on = G.evaluateLac(lac(cps, true, false));
    assert.deepEqual(off.copies.map((c) => c.level.rank), [1, 1]);
    assert.deepEqual(on.copies.map((c) => c.level.rank), [3, 3]);
  });
  test("[trans] lacIˢ is dominant: even with lacI⁺ present the operons cannot be induced", () => {
    assert.deepEqual(G.evaluateLac(lac([{ I: "s" }, {}], true, false)).copies.map((c) => c.level.rank), [1, 1]);
  });
  test("[cis] lacOᶜ affects only its own operon", () => {
    const r = G.evaluateLac(lac([{ O: "c" }, {}], false, false));
    assert.deepEqual(r.copies.map((c) => c.level.rank), [3, 1]);
    assert.deepEqual(r.copies.map((c) => c.repressorBound), [false, true]);
  });
  test("[cis] the classic marker tests: Oᶜ lacZ⁺ / O⁺ lacZ⁻ makes enzyme without lactose; Oᶜ lacZ⁻ / O⁺ lacZ⁺ does not (only the repressed copy has a good lacZ)", () => {
    assert.equal(enzyme([{ O: "c" }, { Z: "-" }], false, false), 3);
    assert.equal(enzyme([{ O: "c", Z: "-" }, {}], false, false), 1);
    assert.equal(enzyme([{ P: "-" }, { Z: "-" }], true, false), 0);
    assert.equal(enzyme([{ P: "-", Z: "-" }, {}], true, false), 3);
  });
  test("[verdicts] derived cis/trans classes match the textbook: lacI⁻ and lacIˢ trans; lacOᶜ and lacP⁻ cis", () => {
    assert.equal(G.lacCisTrans("I-").verdict, "trans");
    assert.equal(G.lacCisTrans("Is").verdict, "trans");
    assert.equal(G.lacCisTrans("Oc").verdict, "cis");
    assert.equal(G.lacCisTrans("P-").verdict, "cis");
  });
  test("[components] DNA elements are labelled cis and diffusible proteins trans", () => {
    const comps = Object.fromEntries(G.lacComponents(lac([{}], true, false)).map((c) => [c.id, c.kind]));
    for (const id of ["operator", "promoter", "cap"]) assert.equal(comps[id], "cis-acting DNA element", id);
    for (const id of ["repressor", "crp"]) assert.equal(comps[id], "trans-acting protein", id);
  });
});

describe("trp operon", () => {
  const trp = (o) => ({ ...G.DEFAULT_TRP_INPUT, ...o });
  // rank = initiation (blocked 0, partial 1, open 2) + read-through (terminated 0, partial 1, through 2)
  test("[leader] the schematic leader keeps the real leader peptide (14 residues, two adjacent Trp) and exactly the pairings 1:2, 2:3, 3:4", () => {
    assert.equal(G.TRP_LEADER_PEPTIDE, "MKAIFVLKGWWRTS");
    assert.equal((G.TRP_LEADER_PEPTIDE.match(/W/g) ?? []).length, 2);
    assert.ok(G.TRP_LEADER_PEPTIDE.includes("WW"));
    assert.deepEqual(G.possiblePairings(), ["1:2", "2:3", "3:4"]);
    // hand-derived complements: region 2 AGUGCG is the reverse complement of CGCACU (last 6 nt of region 1 and first 6 of region 3)
    assert.equal(G.TRP_REGIONS[1].seq, "AGUGCG");
    assert.ok(G.TRP_REGIONS[0].seq.endsWith("CGCACU")); assert.ok(G.TRP_REGIONS[2].seq.startsWith("CGCACU"));
    assert.ok(G.TRP_REGIONS[3].seq.endsWith("UUUUUUUU"), "region 4 is followed by a run of U");
    assert.ok(G.TRP_REGIONS[3].seq.startsWith("UCCAGG") && G.TRP_REGIONS[2].seq.endsWith("CCUGGA"));
  });
  test("[ribosome] a ribosome stalled on the Trp codons covers region 1; one at the stop codon covers region 2", () => {
    assert.deepEqual(G.ribosomeCovers(G.TRP_CODON_INDEX.firstTrp), [1]);
    assert.deepEqual(G.ribosomeCovers(G.TRP_CODON_INDEX.stop), [2]);
    assert.deepEqual(G.ribosomeCovers(0), []);
  });
  test("[folding] stalled ribosome: 2:3 antiterminator; ribosome passes: 3:4 terminator; no ribosome: 1:2 then 3:4", () => {
    assert.deepEqual(G.foldLeader([1]), ["2:3"]);
    assert.deepEqual(G.foldLeader([2]), ["3:4"]);
    assert.deepEqual(G.foldLeader([]), ["1:2", "3:4"]);
    assert.deepEqual(G.foldLeader([2], [1, 2, 3]), [], "no region 4: no terminator");
  });
  test("[repression] tryptophan activates the repressor: operator free at low Trp, partly bound at moderate, bound at high", () => {
    assert.equal(G.evaluateTrp(trp({ trp: "low" })).operator, "free");
    assert.equal(G.evaluateTrp(trp({ trp: "moderate" })).operator, "partly bound");
    assert.equal(G.evaluateTrp(trp({ trp: "high" })).operator, "bound");
    assert.equal(G.evaluateTrp(trp({ trp: "high", repressor: "-" })).operator, "free");
    assert.equal(G.evaluateTrp(trp({ trp: "high", operator: "-" })).operator, "free");
  });
  test("[attenuation] low Trp reads through, high Trp terminates, moderate is a mixture; hairpins as above", () => {
    const low = G.evaluateTrp(trp({ trp: "low" })), high = G.evaluateTrp(trp({ trp: "high" })), mid = G.evaluateTrp(trp({ trp: "moderate" }));
    assert.equal(low.readthrough, 2); assert.deepEqual(low.structures[0].pairs, ["2:3"]);
    assert.equal(high.readthrough, 0); assert.deepEqual(high.structures[0].pairs, ["3:4"]);
    assert.equal(mid.readthrough, 1); assert.equal(mid.scenario, "mixed");
  });
  test("[levels] wild type: low Trp highest (4), moderate intermediate (2), high lowest (0)", () => {
    assert.deepEqual(["low", "moderate", "high"].map((t) => G.evaluateTrp(trp({ trp: t })).level.rank), [4, 2, 0]);
  });
  test("[repression is not attenuation] trpR⁻ removes repression only: at high Trp the operator is free but the leader still terminates (rank 2, not 4)", () => {
    const e = G.evaluateTrp(trp({ trp: "high", repressor: "-" }));
    assert.equal(e.initiation, 2); assert.equal(e.readthrough, 0); assert.equal(e.level.rank, 2);
    const a = G.evaluateTrp(trp({ trp: "high", attenuator: "-" }));
    assert.equal(a.initiation, 0); assert.equal(a.readthrough, 2); assert.equal(a.level.rank, 2);
    const both = G.evaluateTrp(trp({ trp: "high", repressor: "-", attenuator: "-" }));
    assert.equal(both.level.rank, 4, "losing both controls gives full expression at high Trp");
  });
  test("[leader mutations] without a leader start or without the Trp codons the ribosome cannot sense Trp: termination even at low Trp", () => {
    for (const m of [{ leaderStart: "-" }, { trpCodons: "-" }]) {
      const e = G.evaluateTrp(trp({ trp: "low", ...m }));
      assert.equal(e.readthrough, 0, JSON.stringify(m)); assert.equal(e.level.rank, 2, JSON.stringify(m));
    }
    assert.deepEqual(G.evaluateTrp(trp({ trp: "low", leaderStart: "-" })).structures[0].pairs, ["1:2", "3:4"]);
  });
  test("[steps] every step yields a state; the ribosome stalls at low Trp and stops at the stop codon at high Trp", () => {
    for (let s = 0; s < G.TRP_STEPS; s += 1) { const st = G.trpStep(trp({ trp: "low", step: s }), s); assert.ok(st.title && st.text.length > 20); }
    assert.equal(G.trpStep(trp({ trp: "low" }), 3).ribosome.mode, "stalled");
    assert.equal(G.trpStep(trp({ trp: "high" }), 3).ribosome.mode, "stopping");
    assert.equal(G.trpStep(trp({ trp: "low" }), 5).outcome, "readthrough");
    assert.equal(G.trpStep(trp({ trp: "high" }), 5).outcome, "terminated");
    assert.equal(G.trpStep(trp({ trp: "low", leaderStart: "-" }), 3).ribosome.mode, "absent");
  });
});

describe("eukaryotic regulation", () => {
  const euk = (o) => ({ ...G.DEFAULT_EUK_INPUT, ...o });
  const lvl = (o) => G.evaluateEuk(euk(o)).level;
  test("[activation] default (enhancer, activator, Mediator, open chromatin, intact TATA) is high", () => {
    assert.equal(lvl({}).rank, 2); assert.equal(G.evaluateEuk(euk({})).polII, "strong");
  });
  test("[trans loss] no activator, or no Mediator, leaves only basal transcription", () => {
    assert.equal(lvl({ activator: false }).rank, 1); assert.equal(lvl({ mediator: false }).rank, 1);
  });
  test("[cis loss] a mutated or absent enhancer leaves basal transcription although the activator is present", () => {
    for (const enhancer of ["mutated", "absent"]) { assert.equal(lvl({ enhancer }).rank, 1); assert.equal(G.evaluateEuk(euk({ enhancer })).activatorBound, false); }
  });
  test("[context] enhancer orientation and distance do not change the result", () => {
    assert.equal(lvl({ enhancerOrientation: "reverse" }).rank, 2); assert.equal(lvl({ enhancerDistance: "far" }).rank, 2);
  });
  test("[chromatin] without acetylation chromatin is closed and silent; methylation without acetylation is silent too", () => {
    assert.equal(lvl({ acetylation: false }).rank, 0); assert.equal(lvl({ acetylation: false, methylation: true }).rank, 0);
    assert.equal(G.evaluateEuk(euk({ acetylation: false })).polII, "no");
  });
  test("[uncertain] acetylation with methylation is reported as uncertain, not as a guess", () => {
    const l = lvl({ methylation: true }); assert.equal(l.rank, null); assert.equal(l.uncertain, true);
    assert.equal(G.evaluateEuk(euk({ methylation: true })).chromatin, "conflicting");
  });
  test("[silencer] a silencer works only with its repressor; with both and an activator the model says uncertain", () => {
    assert.equal(lvl({ silencer: "present", repressor: false }).rank, 2);
    assert.equal(lvl({ silencer: "present", repressor: true, activator: false }).rank, 0);
    assert.equal(lvl({ silencer: "present", repressor: true }).rank, null);
  });
  test("[promoter] a TATA mutation lowers this model's promoter (declared as model-specific)", () => {
    assert.equal(lvl({ promoter: "TATA-mutated" }).rank, 0);
    assert.ok(G.evaluateEuk(euk({ promoter: "TATA-mutated" })).reasons.join(" ").includes("model-specific"));
  });
  test("[cis versus trans labelling]", () => {
    const c = Object.fromEntries(G.eukComponents(euk({})).map((x) => [x.id, x.kind]));
    for (const id of ["enhancer", "silencer", "promoter"]) assert.equal(c[id], "cis-acting DNA element");
    for (const id of ["activator", "repressor", "mediator"]) assert.equal(c[id], "trans-acting protein");
  });
  test("[unsupported interpretations] nothing in the model claims universal effects: methylation and acetylation notes say context dependent", () => {
    const text = G.eukComponents(euk({})).map((c) => `${c.role} ${c.mutation}`).join(" ");
    assert.match(text, /context dependent/); assert.match(text, /not change the DNA sequence/);
  });
});

describe("validators and challenges", () => {
  test("[validators] reject unknown values and out-of-range steps", () => {
    assert.equal(G.validateLacInput({ ...G.DEFAULT_LAC_INPUT, step: 5 }).ok, false);
    assert.equal(G.validateLacInput({ ...G.DEFAULT_LAC_INPUT, copies: [] }).ok, false);
    assert.equal(G.validateLacInput({ ...G.DEFAULT_LAC_INPUT, copies: [wt, wt, wt] }).ok, false);
    assert.equal(G.validateLacInput({ ...G.DEFAULT_LAC_INPUT, copies: [{ ...wt, I: "x" }] }).ok, false);
    assert.equal(G.validateTrpInput({ ...G.DEFAULT_TRP_INPUT, trp: "extreme" }).ok, false);
    assert.equal(G.validateTrpInput({ ...G.DEFAULT_TRP_INPUT, step: 6 }).ok, false);
    assert.equal(G.validateEukInput({ ...G.DEFAULT_EUK_INPUT, enhancer: "huge" }).ok, false);
    assert.equal(G.validateEukInput({ ...G.DEFAULT_EUK_INPUT, activator: "yes" }).ok, false);
    assert.equal(G.validateEukInput({ ...G.DEFAULT_EUK_INPUT, step: 5 }).ok, false);
  });
  test("[challenges] the correct answer follows the rank comparison of the two states, for every candidate change", () => {
    const check = (changes, rankOf, challengeFn, input) => {
      for (let i = 0; i < changes.length; i += 1) {
        const c = challengeFn(input, i);
        const before = rankOf(input), after = rankOf(c.change.next);
        const expected = before === null || after === null ? "It cannot be predicted from the conditions given" : after > before ? "Transcription increases" : after < before ? "Transcription decreases" : "Transcription stays about the same";
        assert.equal(c.question.options[c.question.answer], expected, c.change.label);
        assert.equal(new Set(c.question.options).size, c.question.options.length);
      }
    };
    check(G.lacChanges(G.DEFAULT_LAC_INPUT), (i) => G.evaluateLac(i).transcription.rank, L.lacChallenge, G.DEFAULT_LAC_INPUT);
    check(G.trpChanges(G.DEFAULT_TRP_INPUT), (i) => G.evaluateTrp(i).level.rank, L.trpChallenge, G.DEFAULT_TRP_INPUT);
    check(G.eukChanges(G.DEFAULT_EUK_INPUT), (i) => G.evaluateEuk(i).level.rank, L.eukChallenge, G.DEFAULT_EUK_INPUT);
  });
  test("[challenge answers span the three outcomes] across the three systems an increase, a decrease and 'about the same' all occur", () => {
    const seen = new Set();
    for (const [chs, input, f] of [[G.lacChanges, G.DEFAULT_LAC_INPUT, L.lacChallenge], [G.trpChanges, G.DEFAULT_TRP_INPUT, L.trpChallenge], [G.eukChanges, G.DEFAULT_EUK_INPUT, L.eukChallenge], [G.lacChanges, { ...G.DEFAULT_LAC_INPUT, lactose: false }, L.lacChallenge], [G.trpChanges, { ...G.DEFAULT_TRP_INPUT, trp: "low" }, L.trpChallenge]])
      for (let i = 0; i < chs(input).length; i += 1) seen.add(f(input, i).effect);
    for (const e of ["increases", "decreases", "same"]) assert.ok(seen.has(e), e);
  });
  test("[questions] regulation questions are well formed", () => {
    const sane = (q) => { assert.ok(q.options.length >= 2 && q.options.length <= 4, q.id); assert.equal(new Set(q.options).size, q.options.length, q.id); assert.ok(q.answer >= 0 && q.answer < q.options.length, q.id); for (const t of [q.prompt, q.explanation, ...q.options]) assert.doesNotMatch(t, /NaN|undefined|\[object/, q.id); };
    for (const q of [...L.lacQuestions(G.DEFAULT_LAC_INPUT), ...L.trpQuestions(G.DEFAULT_TRP_INPUT), ...L.eukQuestions(G.DEFAULT_EUK_INPUT)]) sane(q);
    const q = L.lacQuestions({ ...G.DEFAULT_LAC_INPUT, lactose: false }).find((x) => x.id === "lac-state");
    assert.equal(q.options[q.answer], "Basal (leaky)");
  });
});
