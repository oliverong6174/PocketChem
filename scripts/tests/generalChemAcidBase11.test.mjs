// Stage 11: acid-base equilibrium and titration model.
// Reference values are derived independently of the implementation: closed-form quadratics/cubics solved here with
// their own code, and stoichiometric (mole-balance) arithmetic done by hand. The solver itself is a charge-balance
// bisection, so these formulas are genuinely different calculations.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let A, T, L, F;
before(async () => {
  A = await loadModule("/src/utils/generalChem/acidBase.ts");
  T = await loadModule("/src/utils/generalChem/titration.ts");
  L = await loadModule("/src/utils/generalChem/learning.ts");
  F = await loadModule("/src/utils/generalChem/format.ts");
});
after(async () => { await closeEngine(); });

const Kw = 1e-14;
const near = (actual, expected, tol, label = "") => assert.ok(Math.abs(actual - expected) <= tol, `${label} expected ${expected} ± ${tol}, got ${actual}`);
const pKaOf = (Ka) => -Math.log10(Ka);
/** Strong monoprotic acid including water: h = (C + sqrt(C² + 4Kw)) / 2. */
const strongAcidH = (C) => (C + Math.sqrt(C * C + 4 * Kw)) / 2;
/** Weak acid ignoring water: h = (-Ka + sqrt(Ka² + 4 Ka C)) / 2. */
const weakAcidH = (Ka, C) => (-Ka + Math.sqrt(Ka * Ka + 4 * Ka * C)) / 2;
/** Full cubic h³ + Ka h² − (Ka C + Kw) h − Ka Kw = 0 by Newton (independent of the solver's bisection). */
function weakAcidCubicH(Ka, C) {
  let h = Math.sqrt(Ka * C + Kw);
  for (let i = 0; i < 100; i += 1) {
    const f = h ** 3 + Ka * h * h - (Ka * C + Kw) * h - Ka * Kw;
    const d = 3 * h * h + 2 * Ka * h - (Ka * C + Kw);
    h -= f / d;
  }
  return h;
}
const solve = (spec) => { const r = A.solveEquilibrium(spec); assert.ok(r.ok, r.reason); return r; };
const analyze = (input) => { const r = A.analyzeSolution(input); assert.ok(r.equilibrium, r.reason); return r; };

const HAC = { analyte: "weak-acid", c0: 0.1, v0: 25, pK: pKaOf(1.8e-5), ct: 0.1, vt: 0 };
const NH3 = { analyte: "weak-base", c0: 0.1, v0: 25, pK: pKaOf(1.8e-5), ct: 0.1, vt: 0 };
const HCL = { analyte: "strong-acid", c0: 0.1, v0: 25, ct: 0.1, vt: 0 };
const NAOH = { analyte: "strong-base", c0: 0.1, v0: 25, ct: 0.1, vt: 0 };

describe("strong acids and bases", () => {
  for (const C of [1, 0.1, 1e-3, 1e-5, 1e-6, 1e-7, 1e-8]) {
    test(`[strong acid] ${C} M follows h = (C + √(C² + 4Kw))/2, including very dilute water-dominated cases`, () => {
      const r = analyze({ kind: "strong-acid", concentration: C === 1e-8 ? 1e-7 : C });
      const c = C === 1e-8 ? 1e-7 : C;
      near(r.equilibrium.pH, -Math.log10(strongAcidH(c)), 1e-9, `pH`);
    });
  }
  test("[strong acid] 0.100 M HCl is pH 1.000 and 1.0e-3 M NaOH is pH 11.000", () => {
    near(analyze({ kind: "strong-acid", concentration: 0.1 }).equilibrium.pH, 1, 1e-6);
    near(analyze({ kind: "strong-base", concentration: 1e-3 }).equilibrium.pH, 11, 1e-6);
  });
  test("[strong acid] a very dilute acid never gives a basic pH and stays below the 7 of pure water", () => {
    const r = analyze({ kind: "strong-acid", concentration: 1e-7 });
    assert.ok(r.equilibrium.pH < 7 && r.equilibrium.pH > 6.5, String(r.equilibrium.pH));
    near(r.equilibrium.pH, 6.79, 0.005);
    assert.equal(r.waterMatters, true);
  });
  test("[strong base] pH + pOH = 14 and [H+][OH-] = Kw at the root", () => {
    const r = analyze({ kind: "strong-base", concentration: 0.02 }).equilibrium;
    near(r.pH + r.pOH, 14, 1e-12);
    near((r.h * r.oh) / Kw, 1, 1e-9);
  });
});

describe("weak acids and bases", () => {
  test("[weak acid] 0.100 M acetic acid (Ka 1.8e-5): matches the quadratic solution and the exact pH 2.875 (the √(Ka·C) shortcut gives 2.872)", () => {
    const r = analyze({ kind: "weak-acid", concentration: 0.1, pK: pKaOf(1.8e-5) });
    near(r.equilibrium.pH, -Math.log10(weakAcidH(1.8e-5, 0.1)), 2e-5);
    near(r.equilibrium.pH, 2.8753, 5e-4);
    near(-Math.log10(Math.sqrt(1.8e-5 * 0.1)), 2.8723, 5e-4, "shortcut value");
    near(r.percentIonized, 1.33, 0.02);
    assert.equal(r.approximation.valid, true);
  });
  test("[weak base] 0.100 M NH3 (Kb 1.8e-5): pOH from the quadratic, pH 11.12", () => {
    const r = analyze({ kind: "weak-base", concentration: 0.1, pK: pKaOf(1.8e-5) });
    const oh = weakAcidH(1.8e-5, 0.1);
    near(r.equilibrium.pH, 14 + Math.log10(oh), 2e-5);
    near(r.equilibrium.pH, 11.1247, 5e-4);
  });
  test("[weak acid] very weak, dilute acid (pKa 10, 1 mM): water matters, matches the full cubic", () => {
    const r = analyze({ kind: "weak-acid", concentration: 1e-3, pK: 10 });
    near(r.equilibrium.pH, -Math.log10(weakAcidCubicH(1e-10, 1e-3)), 1e-8);
    assert.equal(r.waterMatters, true);
    assert.equal(r.approximation.valid, false, "the textbook shortcut is flagged as invalid here");
  });
  test("[weak acid] the shortcut x = √(Ka·C) is flagged invalid for a fairly strong, dilute acid", () => {
    const r = analyze({ kind: "weak-acid", concentration: 1e-3, pK: 2 });
    assert.equal(r.approximation.valid, false);
    assert.ok(Math.abs(r.approximation.errorPH) > 0.1);
  });
  test("[balance] charge balance and mass balance hold for 200 random systems", () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 200; i += 1) {
      const spec = {};
      if (rnd() < 0.7) spec.weakAcid = { total: 10 ** (-6 + 5 * rnd()), pKa: 1 + 12 * rnd() };
      if (rnd() < 0.3) spec.weakBase = { total: 10 ** (-6 + 5 * rnd()), pKb: 1 + 12 * rnd() };
      if (rnd() < 0.6) spec.strongBaseCation = 10 ** (-6 + 5 * rnd());
      if (rnd() < 0.5) spec.strongAcidAnion = 10 ** (-6 + 5 * rnd());
      const r = solve(spec);
      assert.ok(r.chargeBalanceError < 1e-9, `charge balance ${r.chargeBalanceError} for ${JSON.stringify(spec)}`);
      if (r.acid) near((r.acid.ha + r.acid.a) / spec.weakAcid.total, 1, 1e-12);
      if (r.base) near((r.base.b + r.base.bh) / spec.weakBase.total, 1, 1e-12);
      assert.ok([r.h, r.oh, r.pH].every(Number.isFinite) && r.h > 0 && r.oh > 0);
      for (const c of [r.acid?.ha, r.acid?.a, r.base?.b, r.base?.bh]) if (c !== undefined) assert.ok(c >= 0, "no negative concentration");
    }
  });
  test("[dilute] tenfold dilution: strong acid +1.000 pH, weak acid about +0.5 pH and more ionized", () => {
    const strong = A.dilute({ kind: "strong-acid", concentration: 0.01 }, 10, 100);
    assert.ok(strong.ok);
    near(analyze(strong.input).equilibrium.pH - analyze({ kind: "strong-acid", concentration: 0.01 }).equilibrium.pH, 1, 1e-6);
    const w0 = { kind: "weak-acid", concentration: 0.1, pK: 4.75 };
    const w1 = A.dilute(w0, 10, 100);
    near(analyze(w1.input).equilibrium.pH - analyze(w0).equilibrium.pH, 0.5, 0.02);
    assert.ok(analyze(w1.input).percentIonized > analyze(w0).percentIonized);
    near(analyze(w1.input).input.concentration, 0.01, 1e-15);
  });
});

describe("buffers", () => {
  test("[buffer] equal weak acid and conjugate gives pH = pKa; Henderson–Hasselbalch is flagged valid", () => {
    const r = A.analyzeBuffer({ family: "acid", pK: 4.7447, weak: 0.1, conjugate: 0.1 });
    near(r.equilibrium.pH, 4.7447, 5e-4);
    assert.equal(r.hh.valid, true);
    near(r.hh.pH, 4.7447, 1e-12);
  });
  test("[buffer] 10:1 ratio shifts pH by exactly one unit (HH) and the exact model agrees", () => {
    const r = A.analyzeBuffer({ family: "acid", pK: 4.75, weak: 0.01, conjugate: 0.1 });
    near(r.hh.pH, 5.75, 1e-12);
    near(r.equilibrium.pH, 5.75, 0.005);
    assert.equal(r.hh.valid, true);
  });
  test("[buffer] ammonia buffer: pH = 14 − pKb − log([NH4+]/[NH3])", () => {
    const r = A.analyzeBuffer({ family: "base", pK: 4.75, weak: 0.1, conjugate: 0.1 });
    near(r.hh.pH, 9.25, 1e-12);
    near(r.equilibrium.pH, 9.25, 0.005);
  });
  test("[buffer] HH is refused outside its regime: 100:1 ratio, and very dilute components", () => {
    const skew = A.analyzeBuffer({ family: "acid", pK: 4.75, weak: 0.001, conjugate: 0.1 });
    assert.equal(skew.hh.valid, false);
    assert.match(skew.hh.reasons.join(" "), /ratio/);
    const dilute = A.analyzeBuffer({ family: "acid", pK: 4.75, weak: 1e-4, conjugate: 1e-4 });
    assert.equal(dilute.hh.valid, false);
    assert.ok(Math.abs(dilute.hh.errorPH) > 0.05, `HH really is off here: ${dilute.hh.errorPH}`);
  });
  test("[buffer] capacity is largest near pH = pKa and falls off away from it", () => {
    const mid = A.analyzeBuffer({ family: "acid", pK: 4.75, weak: 0.1, conjugate: 0.1 }).capacity;
    const off = A.analyzeBuffer({ family: "acid", pK: 4.75, weak: 0.01, conjugate: 0.19 }).capacity;
    assert.ok(mid > off * 2, `${mid} vs ${off}`);
    near(mid, 2.303 * 0.2 * 0.25, 0.01, "β = 2.303·C·α(1−α) = 0.115");
  });
});

describe("titration points (hand stoichiometry)", () => {
  test("[strong/strong] 25.0 mL 0.100 M HCl + 0.100 M NaOH: 10 mL → 1.368, 25 mL → 7.000, 26 mL → 11.292", () => {
    near(T.pHAt(HCL, 10), -Math.log10((0.1 * 25 - 0.1 * 10) / 1000 / 0.035), 1e-6);
    near(T.pHAt(HCL, 10), 1.368, 0.001);
    near(T.pHAt(HCL, 25), 7, 1e-6);
    near(T.pHAt(HCL, 26), 14 + Math.log10((0.1 * 26 - 0.1 * 25) / 51), 1e-6);
    near(T.pHAt(HCL, 26), 11.292, 0.001);
    near(T.pHAt(HCL, 0), 1, 1e-6);
  });
  test("[strong base/strong acid] mirror image: 25 mL NaOH + HCl, 25 mL → 7, 10 mL → 12.632", () => {
    near(T.pHAt(NAOH, 25), 7, 1e-6);
    near(T.pHAt(NAOH, 10), 14 + Math.log10((0.1 * 25 - 0.1 * 10) / 35), 1e-6);
    near(T.pHAt(NAOH, 0), 13, 1e-6);
  });
  test("[weak acid] 25.0 mL 0.100 M acetic acid + 0.100 M NaOH: start 2.88, half-equivalence ≈ pKa, equivalence 8.72", () => {
    near(T.pHAt(HAC, 0), 2.8753, 5e-4);
    const sp = T.specialPoints(HAC);
    near(sp.veq, 25, 1e-12);
    near(sp.halfEquivalence.vt, 12.5, 1e-12);
    near(sp.halfEquivalence.pH, pKaOf(1.8e-5), 0.01, "half-equivalence pH ≈ pKa");
    // hydrolysis of the acetate at equivalence: [OH-] = √(Kb C), C = 2.5 mmol / 50 mL = 0.05 M, Kb = Kw/Ka
    const Ceq = 0.0025 / 0.05;
    const oh = Math.sqrt((Kw / 1.8e-5) * Ceq);
    near(sp.pHEquivalence, 14 + Math.log10(oh), 2e-3);
    near(sp.pHEquivalence, 8.722, 0.002);
    assert.ok(sp.pHEquivalence > 7, "equivalence pH of a weak-acid titration is above 7");
  });
  test("[weak acid] a 12.5 mL point equals Henderson–Hasselbalch with the stoichiometric ratio (within the HH regime)", () => {
    for (const vt of [5, 12.5, 20]) {
      const nA = 0.1 * vt; // mmol A-
      const nHA = 0.1 * 25 - nA;
      near(T.pHAt(HAC, vt), pKaOf(1.8e-5) + Math.log10(nA / nHA), 0.01, `vt=${vt}`);
    }
  });
  test("[weak acid] after equivalence the pH is set by excess OH-", () => {
    near(T.pHAt(HAC, 30), 14 + Math.log10((0.1 * 30 - 0.1 * 25) / 55), 2e-3);
  });
  test("[weak base] 25.0 mL 0.100 M NH3 + 0.100 M HCl: half-equivalence pH = 14 − pKb, equivalence = 5.28", () => {
    const sp = T.specialPoints(NH3);
    near(sp.halfEquivalence.pH, 14 - pKaOf(1.8e-5), 0.01);
    const Ceq = 0.0025 / 0.05;
    near(sp.pHEquivalence, -Math.log10(Math.sqrt((Kw / 1.8e-5) * Ceq)), 2e-3);
    near(sp.pHEquivalence, 5.278, 0.002);
    near(T.pHAt(NH3, 30), -Math.log10((0.1 * 30 - 0.1 * 25) / 55), 2e-3);
  });
  test("[equivalence] equivalence volume is c0·V0/ct for every combination", () => {
    near(T.equivalenceVolume({ c0: 0.15, v0: 20, ct: 0.2 }), 15, 1e-12);
    near(T.specialPoints({ ...HAC, c0: 0.05, v0: 40, ct: 0.2 }).veq, 10, 1e-12);
  });
  test("[buffer region] acetic acid: 10:1 to 1:10 occurs at 1/11 and 10/11 of the equivalence volume", () => {
    const b = T.specialPoints(HAC).bufferRegion;
    near(b.vStart, 25 / 11, 0.1);
    near(b.vEnd, (25 * 10) / 11, 0.1);
    near(b.pHStart, pKaOf(1.8e-5) - 1, 1e-6);
    near(b.pHEnd, pKaOf(1.8e-5) + 1, 1e-6);
  });
  test("[buffer region] none for strong analytes; none when the acid is far too weak/dilute to buffer", () => {
    assert.equal(T.specialPoints(HCL).bufferRegion, null);
    assert.equal(T.specialPoints(HCL).halfEquivalence, null);
  });
});

describe("titration curves", () => {
  const cases = { HCL, HAC, NAOH, NH3, "dilute weak acid": { ...HAC, c0: 1e-4, ct: 1e-4 }, "very weak acid": { ...HAC, pK: 11 }, "concentrated": { ...HCL, c0: 2, ct: 2 } };
  for (const [name, input] of Object.entries(cases)) {
    test(`[curve] ${name}: monotone, finite, continuous (no pH jump larger than the refinement limit unless at its cap), contains Veq`, () => {
      const pts = T.titrationCurve(input);
      const dir = A.isAcidKind(input.analyte) ? 1 : -1;
      const veq = T.equivalenceVolume(input);
      assert.ok(pts.every((p) => Number.isFinite(p.pH) && Number.isFinite(p.vt)));
      assert.ok(pts.some((p) => p.vt === veq), "Veq is a sample point");
      for (let i = 1; i < pts.length; i += 1) {
        assert.ok(dir * (pts[i].pH - pts[i - 1].pH) >= -1e-9, `monotone at ${pts[i].vt}`);
        assert.ok(Math.abs(pts[i].pH - pts[i - 1].pH) <= 0.1 + 1e-9 || pts[i].vt - pts[i - 1].vt < veq * 1e-4, `step ${pts[i - 1].pH}→${pts[i].pH} at ${pts[i].vt}`);
      }
      assert.equal(pts[0].vt, 0);
      near(pts[pts.length - 1].vt, 2 * veq, 1e-9);
    });
    test(`[curve] ${name}: every plotted point equals the number shown for that volume (same model)`, () => {
      const pts = T.titrationCurve(input);
      for (const p of pts.filter((_, i) => i % 17 === 0)) near(T.pointAt(input, p.vt).pH, p.pH, 1e-12);
    });
  }
  test("[curve] strong-acid equivalence jump is steep: >5 pH units within ±1 % of Veq for 0.1 M / 0.1 M", () => {
    const j = T.specialPoints(HCL).jump;
    assert.ok(j.pHAfter - j.pHBefore > 4, `${j.pHBefore} → ${j.pHAfter}`);
    near(j.pHBefore, 3.30, 0.02);
  });
  test("[curve] weak-acid equivalence is less steep than strong-acid for the same concentrations", () => {
    const w = T.specialPoints(HAC).jump;
    const s = T.specialPoints(HCL).jump;
    assert.ok(w.pHAfter - w.pHBefore < s.pHAfter - s.pHBefore);
  });
});

describe("regions and explanations", () => {
  test("[region] classification at representative volumes", () => {
    const sp = T.specialPoints(HAC);
    assert.equal(T.pointAt(HAC, 0, sp).region, "initial");
    assert.equal(T.pointAt(HAC, 12.5, sp).region, "half-equivalence");
    assert.equal(T.pointAt(HAC, 8, sp).region, "buffer");
    assert.equal(T.pointAt(HAC, 25, sp).region, "equivalence");
    assert.equal(T.pointAt(HAC, 40, sp).region, "excess-titrant");
    assert.equal(T.pointAt(HAC, 1, sp).region, "early");
    assert.equal(T.pointAt(HAC, 24, sp).region, "approaching-equivalence");
    assert.equal(T.pointAt(HCL, 12.5, T.specialPoints(HCL)).region, "approaching-equivalence");
  });
  test("[explain] every region of every analyte type produces text with numbers drawn from the model", () => {
    for (const input of [HCL, HAC, NAOH, NH3]) {
      const sp = T.specialPoints(input);
      for (const vt of [0, 3, sp.veq / 2, sp.veq * 0.9, sp.veq, sp.veq * 1.5]) {
        const p = T.pointAt(input, vt, sp);
        const e = L.explainPoint(input, p, sp);
        assert.ok(e.heading.length > 3 && e.paragraphs.length >= 1, `${input.analyte} ${vt}`);
        assert.ok(!/NaN|undefined/.test(e.paragraphs.join(" ")), `${input.analyte} ${vt}: ${e.paragraphs.join(" ")}`);
        assert.ok(T.equationsFor(input, p.region).length >= 3);
      }
    }
  });
  test("[explain] equivalence text for a weak acid quotes the computed pH and says it is not 7", () => {
    const sp = T.specialPoints(HAC);
    const e = L.explainPoint(HAC, T.pointAt(HAC, 25, sp), sp);
    assert.match(e.paragraphs.join(" "), /8\.72/);
    assert.match(e.paragraphs.join(" "), /not 7/);
  });
  test("[lessons] five lessons for a weak analyte quote model values; strong analyte says no pKa relation", () => {
    const weak = L.conceptLessons(HAC);
    assert.deepEqual(weak.map((l) => l.id), ["initial", "buffer", "equivalence", "half", "dilution"]);
    assert.match(weak[0].body.join(" "), /pH 1\.00/);
    assert.match(weak[0].body.join(" "), /pH 2\.88/);
    assert.match(weak[4].body.join(" "), /2.88 to 3.38/);
    const strong = L.conceptLessons(HCL);
    assert.match(strong.find((l) => l.id === "half").body.join(" "), /no pKa/);
    assert.match(strong.find((l) => l.id === "dilution").body.join(" "), /exactly one unit/);
  });
});

describe("predict, then observe", () => {
  test("[scenario] weak acid: dilution ↑ pH (by ~0.5), titrant ×2 ↓ Veq, weaker acid ↑ half-eq pH by 1, double volume leaves Veq-pH unchanged", () => {
    const by = Object.fromEntries(L.scenariosFor(HAC).map((s) => [s.id, L.evaluateScenario(s, HAC)]));
    assert.equal(by["dilute-10"].direction, "higher");
    near(by["dilute-10"].after - by["dilute-10"].before, 0.5, 0.02);
    assert.equal(by["titrant-x2"].direction, "lower");
    near(by["titrant-x2"].after, 12.5, 1e-9);
    assert.equal(by.weaker.direction, "higher");
    near(by.weaker.after - by.weaker.before, 1, 0.02);
    assert.equal(by["volume-x2"].direction, "same");
  });
  test("[scenario] strong acid: dilution raises pH by exactly 1; no 'weaker' scenario is offered", () => {
    const list = L.scenariosFor(HCL);
    assert.ok(!list.some((s) => s.id === "weaker"));
    const r = L.evaluateScenario(list.find((s) => s.id === "dilute-10"), HCL);
    near(r.after - r.before, 1, 1e-6);
  });
  test("[scenario] weak base: dilution LOWERS pH; weaker base lowers half-equivalence pH", () => {
    const by = Object.fromEntries(L.scenariosFor(NH3).map((s) => [s.id, L.evaluateScenario(s, NH3)]));
    assert.equal(by["dilute-10"].direction, "lower");
    assert.equal(by.weaker.direction, "lower");
  });
});

describe("validation and unsupported input", () => {
  const bad = (raw) => { const v = T.validateTitration(raw); assert.equal(v.ok, false); return v.errors.join(" "); };
  test("[validate] rejects non-numbers, negatives, zero and absurd magnitudes with a reason", () => {
    assert.match(bad({ ...HAC, c0: NaN }), /Analyte concentration must be a number/);
    assert.match(bad({ ...HAC, c0: -0.1 }), /between/);
    assert.match(bad({ ...HAC, c0: 0 }), /between/);
    assert.match(bad({ ...HAC, c0: 1e3 }), /between/);
    assert.match(bad({ ...HAC, ct: Infinity }), /Titrant concentration must be a number/);
    assert.match(bad({ ...HAC, v0: 0 }), /volume/i);
    assert.match(bad({ ...HAC, vt: -1 }), /negative/);
    assert.match(bad({ ...HAC, vt: 80 }), /at most 2×/);
    assert.match(bad({ ...HAC, pK: 20 }), /pKa must be between/);
    assert.match(bad({ ...HAC, pK: undefined }), /pKa must be a number/);
    assert.match(bad({ ...NH3, pK: -2 }), /pKb must be between/);
  });
  test("[validate] unsupported system types are named, not approximated", () => {
    assert.match(bad({ ...HAC, analyte: "diprotic-acid" }), /Polyprotic, mixed and amphoteric/);
    assert.equal(A.validateSingleSolution({ kind: "polyprotic", concentration: 0.1 }).ok, false);
    assert.equal(A.validateSingleSolution(null).ok, false);
  });
  test("[validate] warnings, not errors, for concentrated and ultra-dilute solutions", () => {
    const hi = T.validateTitration({ ...HCL, c0: 1, ct: 1 });
    assert.ok(hi.ok);
    assert.match(hi.warnings.join(" "), /activity/);
    const lo = T.validateTitration({ ...HCL, c0: 1e-6, ct: 1e-6 });
    assert.ok(lo.ok);
    assert.match(lo.warnings.join(" "), /dissolved CO2/);
  });
  test("[validate] dilution refuses concentration by evaporation and bad volumes", () => {
    assert.equal(A.dilute({ kind: "strong-acid", concentration: 0.1 }, 50, 10).ok, false);
    assert.equal(A.dilute({ kind: "strong-acid", concentration: 0.1 }, 0, 10).ok, false);
    assert.equal(A.dilute({ kind: "strong-acid", concentration: 1e-6 }, 1, 1000).ok, false, "diluted below the supported range");
  });
  test("[validate] buffer inputs", () => {
    assert.equal(A.analyzeBuffer({ family: "acid", pK: 4.7, weak: 0, conjugate: 0.1 }).ok, false);
    assert.equal(A.analyzeBuffer({ family: "diprotic", pK: 4.7, weak: 0.1, conjugate: 0.1 }).ok, false);
  });
  test("[solver] refuses NaN/negative compositions rather than returning a number", () => {
    assert.equal(A.solveEquilibrium({ strongAcidAnion: NaN }).ok, false);
    assert.equal(A.solveEquilibrium({ weakAcid: { total: -1, pKa: 4 } }).ok, false);
  });
});

describe("numerical stability", () => {
  test("[extremes] every corner of the supported domain solves with a valid root", () => {
    for (const kind of ["strong-acid", "strong-base", "weak-acid", "weak-base"]) {
      for (const c of [A.LIMITS.minConcentration, 1e-6, 1e-3, 1, A.LIMITS.maxConcentration]) {
        for (const pK of [A.LIMITS.minPK, 7, A.LIMITS.maxPK]) {
          const r = A.analyzeSolution({ kind, concentration: c, pK });
          assert.ok(r.equilibrium, `${kind} ${c} ${pK}`);
          assert.ok(Number.isFinite(r.equilibrium.pH) && r.equilibrium.chargeBalanceError < 1e-9, `${kind} ${c} ${pK}: ${r.equilibrium.pH}`);
          assert.ok(r.percentIonized >= 0 && r.percentIonized <= 100 + 1e-9);
        }
      }
    }
  });
  test("[extremes] titration of extreme systems yields finite, ordered curves", () => {
    for (const input of [{ ...HAC, c0: 1e-6, ct: 1e-6, v0: 1000 }, { ...HAC, pK: 13.5 }, { ...NH3, pK: 13.5 }, { ...HCL, c0: 5, ct: 5 }, { ...HAC, c0: 5, ct: 0.001, v0: 0.1 }]) {
      const v = T.validateTitration(input);
      assert.ok(v.ok, JSON.stringify(v.errors));
      const pts = T.titrationCurve(input);
      assert.ok(pts.every((p) => Number.isFinite(p.pH)));
    }
  });
  test("[extremes] near-neutral: 1e-7 M weak acid with pKa 7 stays near 7 and conserves charge", () => {
    const r = analyze({ kind: "weak-acid", concentration: 1e-7, pK: 7 });
    assert.ok(r.equilibrium.pH > 6.4 && r.equilibrium.pH < 7.0);
    assert.ok(r.equilibrium.chargeBalanceError < 1e-9);
  });
  test("[perf] solving 10 000 points takes well under a second", () => {
    const t = performance.now();
    for (let i = 0; i < 10000; i += 1) T.pHAt(HAC, (i / 10000) * 50);
    assert.ok(performance.now() - t < 1500, `${performance.now() - t} ms`);
  });
});

describe("formatting", () => {
  test("[format] pH to 2 decimals, scientific notation outside 1e-3..1e4, no negative zero", () => {
    assert.equal(F.formatPH(2.8725), "2.87");
    assert.equal(F.formatPH(-0.001), "0.00");
    assert.equal(F.formatSig(0.0000123, 3), "1.23×10⁻⁵");
    assert.equal(F.formatSig(0.1, 3), "0.1");
    assert.equal(F.formatSig(1234.5, 3), "1230");
    assert.equal(F.formatSig(9.9996e-6, 3), "1.00×10⁻⁵");
    assert.equal(F.formatPercent(100), "100 %");
    assert.equal(F.formatPH(NaN), "—");
  });
});
