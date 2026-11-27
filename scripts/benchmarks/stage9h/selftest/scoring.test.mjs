// Harness self-test: the Stage 9H scoring functions are exercised on synthetic engine outputs with known right/wrong answers. No frozen case and no chemistry engine is involved.
// Run: node --test scripts/benchmarks/stage9h/selftest/scoring.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../scoring.mjs";
import { getRdkit, closeEngine } from "../../../tests/engine.mjs";

const rd = await getRdkit();
const withMol = (s, fn) => { const m = rd.get_mol(s); if (!m) return null; try { return fn(m); } finally { m.delete(); } };
const h = {
  constitution: (s) => withMol(s, (m) => m.get_smiles(JSON.stringify({ doIsomericSmiles: false }))),
  isomericCanon: async (s) => withMol(s, (m) => m.get_smiles()) ?? s,
  mirror: (s) => s.replace(/@@/g, "\u0001").replace(/@/g, "@@").replace(/\u0001/g, "@"),
  hasStereoMark: (s) => /@|\/|\\/.test(s),
};
const canonicalOf = (s) => withMol(s, (m) => m.get_smiles()) ?? s;
const st = (d, k) => d[k]?.status;

test("nomenclature", () => {
  const c = { preferred_name: "propan-2-one", accepted_names: ["propan-2-one", "acetone"] };
  assert.equal(st(S.scoreNomenclature(c, { displayName: "propan-2-one", estimatedName: "propan-2-one", status: "systematic", confidence: "High" }), "name"), "correct");
  assert.equal(st(S.scoreNomenclature(c, { displayName: "propanone (acetone)", estimatedName: "propanone", status: "systematic", confidence: "Medium" }), "name"), "correct", "parenthetical synonym");
  assert.equal(st(S.scoreNomenclature(c, { displayName: "propanone (acetone)", estimatedName: "propanone", status: "systematic", confidence: "Medium" }), "systematicName"), "wrong-flagged");
  assert.equal(st(S.scoreNomenclature(c, { displayName: "butan-2-one", estimatedName: "butan-2-one", status: "systematic", confidence: "High" }), "name"), "wrong-confident");
  assert.equal(st(S.scoreNomenclature(c, { displayName: "", estimatedName: "x", status: "unsupported", confidence: "Low" }), "name"), "abstained");
  const stereo = { preferred_name: "(2R)-butan-2-ol", accepted_names: ["(2R)-butan-2-ol"] };
  assert.equal(st(S.scoreNomenclature(stereo, { displayName: "butan-2-ol", estimatedName: "butan-2-ol", status: "systematic", confidence: "High" }), "constitutionName"), "correct");
  assert.equal(st(S.scoreNomenclature(stereo, { displayName: "butan-2-ol", estimatedName: "butan-2-ol", status: "systematic", confidence: "High" }), "name"), "wrong-confident");
});

test("properties tolerances", () => {
  const c = { reference: { formula: "C2H6O", molecular_weight: 46.07, exact_mass: 46.0419, formal_charge: 0 }, logp_exp: { value: -0.31 } };
  const ok = S.scoreProperties(c, { formula: "C2H6O", mw: "46.07", exactMass: "46.0419", charge: 0, logP: -0.0014 });
  assert.deepEqual(Object.values(ok).map((v) => v.status), ["correct", "correct", "correct", "correct", "correct"]);
  const bad = S.scoreProperties(c, { formula: "C2H6O2", mw: "46.20", exactMass: "46.0500", charge: 1, logP: 1.0 });
  assert.deepEqual(Object.values(bad).map((v) => v.status), ["wrong", "wrong", "wrong", "wrong", "wrong"]);
});

test("ranking pairs", () => {
  const c = { smiles: ["A", "B", "C"], expected_order: [["A"], ["B"], ["C"]] };
  const id = (s) => s;
  assert.equal(st(S.scoreRanking(c, { ranks: [0, 1, 2] }, id), "order"), "correct");
  assert.equal(st(S.scoreRanking(c, { ranks: [2, 1, 0] }, id), "order"), "wrong");
  assert.equal(st(S.scoreRanking(c, { ranks: [0, undefined, 2] }, id), "order"), "abstained");
  assert.equal(st(S.scoreRanking(c, { ranks: [0, 0, 0] }, id), "order"), "wrong", "all tied where a strict order is expected");
  assert.match(S.scoreRanking(c, { ranks: [0, 1, 2] }, id).pairs.detail, /"pairs":3/);
});

test("mass spectrum", () => {
  const c = { expected: { molecular_ion_mz: 74, base_peak_mz: 31, key_fragments: [{ mz: 41 }, { mz: 56 }], m_plus_2_ratio: 0.98 } };
  const ms = { molecularIonMz: 74, basePeakMz: 31.2, peaks: [{ mz: 74, relativeIntensity: 10 }, { mz: 76, relativeIntensity: 9.8 }, { mz: 41, relativeIntensity: 30 }, { mz: 56, relativeIntensity: 20 }, { mz: 31, relativeIntensity: 100 }] };
  const d = S.scoreMS(c, ms);
  assert.deepEqual([st(d, "molecularIon"), st(d, "basePeak"), st(d, "fragments"), st(d, "isotopeM2")], ["correct", "correct", "correct", "correct"]);
  const d2 = S.scoreMS(c, { ...ms, basePeakMz: 43, peaks: ms.peaks.filter((p) => p.mz !== 56) });
  assert.deepEqual([st(d2, "basePeak"), st(d2, "fragments")], ["wrong", "wrong"]);
  assert.equal(JSON.parse(d2.fragmentRecall.detail).present, 1);
});

test("infrared", () => {
  const c = { ir: { present: [{ label: "C=O", range_cm1: [1685, 1750] }], absent: [{ label: "OH", range_cm1: [3610, 3670] }] } };
  assert.equal(st(S.scoreIR(c, { peaks: [{ center: 1700, kind: "diagnostic" }] }), "irPresent"), "correct");
  assert.equal(st(S.scoreIR(c, { peaks: [{ center: 1670, kind: "diagnostic" }] }), "irPresent"), "correct", "within 20 cm-1 tolerance");
  assert.equal(st(S.scoreIR(c, { peaks: [{ center: 1600, kind: "diagnostic" }] }), "irPresent"), "wrong");
  assert.equal(st(S.scoreIR(c, { peaks: [{ center: 3640, kind: "diagnostic" }] }), "irAbsent"), "wrong");
  assert.equal(st(S.scoreIR(c, { peaks: [{ center: 3640, kind: "weak-hint" }] }), "irAbsent"), "correct", "non-diagnostic peaks do not count as claims");
});

const P = (productSmiles, level = null, ruleId = "r") => ({ ruleId, title: "t", reagentLabel: "x", productSmiles, selectivityAssessment: level ? { level } : undefined });
const base = { reagent_tokens: ["hbr"], expected: { outcome: "determinate", products: [{ smiles: "CC(C)Br", role: "major" }, { smiles: "CCCBr", role: "minor" }], forbidden: [], stereo: "none" } };
test("reactions: connectivity, regiochemistry, ranking", async () => {
  const good = [P("CC(C)Br", "major"), P("CCCBr", "minor")];
  let d = await S.scoreReaction(base, { pathways: good, pool: good }, h);
  assert.deepEqual([st(d, "connectivity"), st(d, "regiochemistry"), st(d, "ranking")], ["correct", "correct", "correct"]);
  const swapped = [P("CC(C)Br", "minor"), P("CCCBr", "major")];
  d = await S.scoreReaction(base, { pathways: swapped, pool: swapped }, h);
  assert.deepEqual([st(d, "regiochemistry"), st(d, "ranking")], ["wrong", "wrong"]);
  const unranked = [P("CC(C)Br"), P("CCCBr")];
  d = await S.scoreReaction(base, { pathways: unranked, pool: unranked }, h);
  assert.deepEqual([st(d, "regiochemistry"), st(d, "ranking")], ["abstained", "abstained"]);
  d = await S.scoreReaction(base, { pathways: [P("CC(C)Br")], pool: [] }, h);
  assert.equal(st(d, "connectivity"), "abstained");
  d = await S.scoreReaction(base, { pathways: [P("CCCCBr")], pool: [P("CCCCBr")] }, h);
  assert.equal(st(d, "connectivity"), "wrong");
});
test("reactions: negative control, forbidden, ambiguity, stereo", async () => {
  const neg = { reagent_tokens: ["x"], expected: { outcome: "determinate", products: [], forbidden: ["OC(=O)c1ccccc1"], stereo: "none" } };
  assert.equal(st(await S.scoreReaction(neg, { pathways: [], pool: [] }, h), "connectivity"), "correct");
  assert.equal(st(await S.scoreReaction(neg, { pathways: [P("OC(=O)c1ccccc1")], pool: [P("OC(=O)c1ccccc1")] }, h), "connectivity"), "wrong");
  const amb = { reagent_tokens: ["x"], expected: { outcome: "ambiguous", products: [{ smiles: "CC(Cl)C", role: "formed" }, { smiles: "CCCCl", role: "formed" }], forbidden: [], stereo: "none" } };
  let pool = [P("CC(Cl)C"), P("CCCCl")];
  assert.equal(st(await S.scoreReaction(amb, { pathways: pool, pool }, h), "ambiguity"), "correct");
  pool = [P("CC(Cl)C", "major"), P("CCCCl", "minor")];
  assert.equal(st(await S.scoreReaction(amb, { pathways: pool, pool }, h), "ambiguity"), "wrong");
  const sp = { reagent_tokens: ["x"], expected: { outcome: "determinate", products: [{ smiles: "CC[C@@H](C)O", role: "sole" }], forbidden: [], stereo: "specific" } };
  pool = [P("CC[C@@H](C)O")]; assert.equal(st(await S.scoreReaction(sp, { pathways: pool, pool }, h), "stereochemistry"), "correct");
  pool = [P("CC[C@H](C)O")]; assert.equal(st(await S.scoreReaction(sp, { pathways: pool, pool }, h), "stereochemistry"), "wrong");
  pool = [P("CCC(C)O")]; assert.equal(st(await S.scoreReaction(sp, { pathways: pool, pool }, h), "stereochemistry"), "incomplete");
  const rac = { ...sp, expected: { ...sp.expected, stereo: "racemic" } };
  pool = [P("CC[C@@H](C)O"), P("CC[C@H](C)O")]; assert.equal(st(await S.scoreReaction(rac, { pathways: pool, pool }, h), "stereochemistry"), "correct");
  pool = [P("CC[C@@H](C)O")]; assert.equal(st(await S.scoreReaction(rac, { pathways: pool, pool }, h), "stereochemistry"), "wrong");
});

test("synthesis", () => {
  const c = { n_steps_min: 2, n_steps_max: 3, route_must_avoid: ["O=[N+]([O-])c1ccccc1"] };
  const step = (p) => ({ ruleId: "r", productSmiles: p });
  const route = (n, p = "CC") => ({ steps: Array.from({ length: n }, () => step(p)), verificationStatus: "verified" });
  assert.equal(st(S.scoreSynthesis(c, { outcomeKind: "ok", best: route(2), ms: 5 }, h.constitution), "routeDiscovery"), "found");
  assert.equal(st(S.scoreSynthesis(c, { outcomeKind: "deadline", best: null, ms: 45000 }, h.constitution), "routeDiscovery"), "timeout");
  assert.equal(st(S.scoreSynthesis(c, { outcomeKind: "exhausted", best: null, ms: 10 }, h.constitution), "routeDiscovery"), "not-found-within-bounds");
  assert.equal(st(S.scoreSynthesis(c, { outcomeKind: "ok", best: route(1), ms: 5 }, h.constitution), "routeLength"), "shorter");
  assert.equal(st(S.scoreSynthesis(c, { outcomeKind: "ok", best: route(4), ms: 5 }, h.constitution), "routeLength"), "longer");
  assert.equal(st(S.scoreSynthesis(c, { outcomeKind: "ok", best: route(2, "O=[N+]([O-])c1ccccc1"), ms: 5 }, h.constitution), "avoidance"), "wrong");
});

test("summary keeps provisional cases out of scored tallies", () => {
  const s = S.summarize([
    { capability: "reactions", evidence: "verified-textbook-direct", dimensions: { connectivity: S.verdict("correct") } },
    { capability: "reactions", evidence: "rule-derived-provisional", dimensions: { connectivity: S.verdict("wrong") } },
    { capability: "ms", evidence: "reference-database", dimensions: { basePeak: S.verdict("correct"), fragmentRecall: S.verdict("count", "{}") } },
  ]);
  assert.deepEqual(s.reactions["connectivity [scored]"], { correct: 1 });
  assert.deepEqual(s.reactions["connectivity [provisional]"], { wrong: 1 });
  assert.equal(Object.keys(s.ms).length, 1);
});

test.after(async () => { await closeEngine(); });
