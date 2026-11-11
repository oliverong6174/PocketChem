// Stage 12: thermodynamics model. References: textbook values worked by hand, thermodynamic identities checked by finite
// differences (Kirchhoff, Gibbs-Helmholtz), and energy conservation, not the tool's own output.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let T;
before(async () => { T = await loadModule("/src/utils/generalChem/thermo.ts"); });
after(async () => { await closeEngine(); });

const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const g = (over = {}) => ({ dH: -92.2, dS: -198.7, dCp: 0, T0: 298.15, T: 298.15, Tmin: 200, Tmax: 1000, Q: null, ...over });

describe("Gibbs energy", () => {
  test("[Haber] dH = -92.2 kJ, dS = -198.7 J/K: dG(298.15 K) = -92.2 + 298.15*0.1987 = -32.96 kJ; crossover at 464.0 K", () => {
    const a = T.analyzeGibbs(g());
    near(a.dGT, -92.2 + 298.15 * 0.1987, 1e-9);
    near(a.dGT, -32.958, 0.001);
    near(a.closedFormCrossover, 92200 / 198.7, 1e-9);
    assert.equal(a.crossovers.length, 1);
    near(a.crossovers[0], 464.0, 0.1);
    assert.equal(a.case, "low-T");
    assert.equal(a.favourable, true);
  });
  test("[CaCO3] dH = +178.3, dS = +160.5: unfavourable at 298 K (+130.4), favourable at 1200 K (-14.3), crossover 1111 K", () => {
    const base = { dH: 178.3, dS: 160.5, Tmin: 300, Tmax: 1500 };
    near(T.gibbsAt(g(base), 298.15), 178.3 - 298.15 * 0.1605, 1e-9);
    near(T.gibbsAt(g(base), 298.15), 130.44, 0.01);
    near(T.gibbsAt(g(base), 1200), -14.3, 0.01);
    const a = T.analyzeGibbs(g(base));
    near(a.crossovers[0], 1111.0, 0.5);
    assert.equal(a.case, "high-T");
  });
  test("[four sign cases] always / never / low-T / high-T, with no crossover inside the range for always/never", () => {
    assert.equal(T.classifyCase(-10, 50), "always");
    assert.equal(T.classifyCase(10, -50), "never");
    assert.equal(T.classifyCase(-10, -50), "low-T");
    assert.equal(T.classifyCase(10, 50), "high-T");
    assert.equal(T.classifyCase(0, 0), "degenerate");
    assert.equal(T.analyzeGibbs(g({ dH: -10, dS: 50 })).crossovers.length, 0);
    assert.equal(T.analyzeGibbs(g({ dH: 10, dS: -50 })).crossovers.length, 0);
    assert.equal(T.analyzeGibbs(g({ dH: -10, dS: 50 })).closedFormCrossover, null);
  });
  test("[boiling water] dH = 40.7, dS = 109 J/K: dG = 0 at 373 K, > 0 below, < 0 above", () => {
    const b = g({ dH: 40.7, dS: 109, Tmin: 300, Tmax: 450 });
    near(T.analyzeGibbs(b).crossovers[0], 373.4, 0.1);
    assert.ok(T.gibbsAt(b, 350) > 0 && T.gibbsAt(b, 400) < 0);
  });
  test("[K from dG] ln K = -dG/RT: Haber at 298.15 K gives ln K = 13.30 and K = 5.9e5; Q = K gives dG = 0, Q = 1 gives dG(standard)", () => {
    const a = T.analyzeGibbs(g());
    near(a.lnK, 32957.6 / (8.314462618 * 298.15), 1e-3);
    near(a.lnK, 13.295, 0.002);
    near(Math.log10(a.K), 5.774, 0.01);
    near(T.gibbsNonstandard(g(), 298.15, a.K), 0, 1e-6);
    near(T.gibbsNonstandard(g(), 298.15, 1), a.dGT, 1e-12);
    const q = T.analyzeGibbs(g({ Q: 10 }));
    near(q.dGnon, a.dGT + (8.314462618 * 298.15 * Math.log(10)) / 1000, 1e-9);
  });
  test("[Kirchhoff and Gibbs-Helmholtz] with dCp: d(dH)/dT = dCp, d(dS)/dT = dCp/T, d(dG/T)/dT = -dH/T^2 (finite differences)", () => {
    const x = g({ dH: -50, dS: -80, dCp: 60, T0: 298.15 });
    const h = 1e-3;
    for (const Tt of [250, 400, 700]) {
      near((T.enthalpyAt(x, Tt + h) - T.enthalpyAt(x, Tt - h)) / (2 * h), x.dCp / 1000, 1e-8);
      near((T.entropyAt(x, Tt + h) - T.entropyAt(x, Tt - h)) / (2 * h), x.dCp / Tt, 1e-7);
      const f = (t) => T.gibbsAt(x, t) / t;
      near((f(Tt + h) - f(Tt - h)) / (2 * h), -T.enthalpyAt(x, Tt) / (Tt * Tt), 1e-8);
    }
    near(T.gibbsAt(x, 298.15), -50 + 298.15 * 0.08, 1e-9); // at T0 the constants apply exactly
  });
  test("[crossovers with dCp] two roots are found, each satisfies dG = 0, and a brute-force grid sees the same sign changes", () => {
    const x = g({ dH: 20, dS: 20, dCp: -80, T0: 298.15, Tmin: 100, Tmax: 3000 });
    const roots = T.crossoverTemperatures(x);
    let brute = 0;
    for (let t = 100; t < 3000; t += 0.5) if (Math.sign(T.gibbsAt(x, t)) !== Math.sign(T.gibbsAt(x, t + 0.5))) brute += 1;
    assert.equal(roots.length, brute);
    for (const r of roots) near(T.gibbsAt(x, r), 0, 1e-6);
  });
  test("[curve] sampled points equal the model values and cover the requested range exactly", () => {
    const a = T.analyzeGibbs(g({ Tmin: 250, Tmax: 750 }));
    assert.equal(a.curve[0].T, 250);
    assert.equal(a.curve[a.curve.length - 1].T, 750);
    for (const p of a.curve) near(p.dG, p.dH - p.TdS, 1e-9);
  });
  test("[validation] unit mix-ups and impossible values are rejected; wide ranges with dCp = 0 warn", () => {
    assert.ok(T.validateGibbs(g()).ok);
    for (const bad of [g({ dS: 1e6 }), g({ dH: NaN }), g({ T: 0 }), g({ T: -5 }), g({ Tmin: 500, Tmax: 510 }), g({ Q: 0 }), g({ Q: -1 }), g({ T0: 10 }), null, g({ dCp: 1e5 })]) {
      assert.equal(T.validateGibbs(bad).ok, false, JSON.stringify(bad));
    }
    const wide = T.validateGibbs(g({ Tmin: 200, Tmax: 1500 }));
    assert.ok(wide.ok && wide.warnings.some((w) => /constant|approximation/i.test(w)));
    assert.equal(T.validateGibbs(g({ Tmin: 250, Tmax: 400 })).warnings.length, 0);
  });
});

describe("Hess's law", () => {
  const solve = (target, steps) => T.solveHess({ target, steps: steps.map(([equation, dH]) => ({ equation, dH })) });
  test("[CO formation] C + 1/2 O2 -> CO from C + O2 -> CO2 (-393.5) and CO + 1/2 O2 -> CO2 (-283.0): reverse the second, total -110.5", () => {
    const r = solve("C(s) + 1/2 O2(g) -> CO(g)", [["C(s) + O2(g) -> CO2(g)", -393.5], ["CO(g) + 1/2 O2(g) -> CO2(g)", -283.0]]);
    assert.ok(r.ok, r.error);
    assert.deepEqual(r.lines.map((l) => l.multiplier), [1, -1]);
    near(r.total, -110.5, 1e-9);
    assert.equal(r.lines[1].reversed, true);
    assert.match(r.lines[1].description, /reversed/);
  });
  test("[NO2] N2 + 2 O2 -> 2 NO2 from N2 + O2 -> 2 NO (+180.5) and 2 NO + O2 -> 2 NO2 (-114.1): +66.4", () => {
    const r = solve("N2(g) + 2 O2(g) -> 2 NO2(g)", [["N2(g) + O2(g) -> 2 NO(g)", 180.5], ["2 NO(g) + O2(g) -> 2 NO2(g)", -114.1]]);
    assert.ok(r.ok, r.error);
    near(r.total, 66.4, 1e-9);
  });
  test("[scaling] 2 H2 + O2 -> 2 H2O(l) from H2 + 1/2 O2 -> H2O(l) (-285.8): multiplier 2, -571.6", () => {
    const r = solve("2 H2(g) + O2(g) -> 2 H2O(l)", [["H2(g) + 1/2 O2(g) -> H2O(l)", -285.8]]);
    assert.ok(r.ok, r.error);
    assert.equal(r.lines[0].multiplier, 2);
    near(r.total, -571.6, 1e-9);
    assert.match(r.lines[0].description, /multiplied by 2/);
  });
  test("[fractions] a third-of-an-equation multiplier is found as a rational number", () => {
    const r = solve("1/3 N2(g) + H2(g) -> 2/3 NH3(g)", [["N2(g) + 3 H2(g) -> 2 NH3(g)", -92.2]]);
    assert.ok(r.ok, r.error);
    near(r.lines[0].multiplier, 1 / 3, 1e-12);
    near(r.total, -92.2 / 3, 1e-9);
  });
  test("[species check] every species nets to the target after scaling and reversing", () => {
    const r = solve("C(s) + 1/2 O2(g) -> CO(g)", [["C(s) + O2(g) -> CO2(g)", -393.5], ["CO(g) + 1/2 O2(g) -> CO2(g)", -283.0]]);
    for (const s of r.species) near(s.net, s.target, 1e-9, s.key);
  });
  test("[states] H2O(l) is not H2O(g): incompatible equations are refused and the states are named", () => {
    const r = solve("2 H2(g) + O2(g) -> 2 H2O(l)", [["2 H2(g) + O2(g) -> 2 H2O(g)", -483.6]]);
    assert.equal(r.ok, false);
    assert.match(r.error, /states/i);
    assert.match(r.error, /H2O\(g\)/);
  });
  test("[refusals] unbalanced, unreachable, redundant, malformed and empty input", () => {
    assert.match(solve("C(s) + O2(g) -> CO(g)", [["C(s) + O2(g) -> CO2(g)", -393.5]]).error, /not balanced/);
    assert.match(solve("Fe(s) -> Fe(s)", [["C(s) + O2(g) -> CO2(g)", -393.5]]).error, /No combination|not independent|no net reaction/);
    assert.match(solve("C(s) + O2(g) -> CO2(g)", [["C(s) + O2(g) -> CO2(g)", -393.5], ["2 C(s) + 2 O2(g) -> 2 CO2(g)", -787.0]]).error, /not independent/);
    assert.equal(solve("not an equation", [["C(s) + O2(g) -> CO2(g)", -393.5]]).ok, false);
    assert.equal(solve("C(s) + O2(g) -> CO2(g)", [["C(s) + O2(g) -> CO2(g) -> x", -1]]).ok, false);
    assert.equal(T.validateHess({ target: "", steps: [{ equation: "a", dH: 1 }] }).ok, false);
    assert.equal(T.validateHess({ target: "x", steps: [] }).ok, false);
    assert.equal(T.validateHess({ target: "x", steps: Array.from({ length: 7 }, () => ({ equation: "a", dH: 1 })) }).ok, false);
    assert.equal(T.validateHess({ target: "x", steps: [{ equation: "a", dH: Infinity }] }).ok, false);
  });
  test("[parser] parenthesised formulas balance (Ca(OH)2 + 2 HCl), arrows and spacing variants parse", () => {
    assert.ok(T.parseEquation("Ca(OH)2(s) + 2 HCl(aq) -> CaCl2(aq) + 2 H2O(l)").ok);
    assert.ok(T.parseEquation("2H2(g) + O2(g) → 2H2O(l)").ok);
    assert.ok(T.parseEquation("H2(g) + 0.5 O2(g) = H2O(l)").ok);
    assert.equal(T.parseEquation("H2(g) -> H3(g)").ok, false);
    assert.equal(T.parseEquation("Na+ + Cl- -> NaCl").ok, false);
  });
});

describe("calorimetry", () => {
  const cal = (mode, patch) => T.analyzeCalorimetry({ mode, reaction: { massG: 100, cJgK: 4.184, ccalJK: 0, Ti: 22, Tf: 28.5, moles: 0.05 }, mixing: { m1: 100, c1: 4.184, T1: 80, m2: 100, c2: 4.184, T2: 20 }, specificHeat: { mMetal: 50, TMetal: 100, mWater: 100, TWater: 20, Tf: 25 }, ...patch });
  test("[reaction] 100 g, 4.184 J/(g K), +6.5 K, 0.050 mol: q = 2719.6 J absorbed, dH = -54.39 kJ/mol, exothermic", () => {
    const r = cal("reaction");
    near(r.value, -2719.6 / 0.05 / 1000, 1e-9);
    near(r.value, -54.392, 0.001);
    assert.equal(r.classification, "exothermic");
  });
  test("[reaction + calorimeter] adding C_cal = 150 J/K adds 975 J: dH = -73.89 kJ/mol", () => {
    const r = cal("reaction", { reaction: { massG: 100, cJgK: 4.184, ccalJK: 150, Ti: 22, Tf: 28.5, moles: 0.05 } });
    near(r.value, -(2719.6 + 975) / 50, 1e-9);
    near(r.value, -73.892, 0.001);
  });
  test("[endothermic] a temperature drop gives a positive dH", () => {
    const r = cal("reaction", { reaction: { massG: 50, cJgK: 4.184, ccalJK: 0, Ti: 25, Tf: 21, moles: 0.02 } });
    near(r.value, (50 * 4.184 * 4) / 0.02 / 1000, 1e-9);
    assert.equal(r.classification, "endothermic");
  });
  test("[mixing] 100 g at 80 C + 100 g at 20 C of water: 50 C; unequal masses and different c: energy gained = energy lost", () => {
    near(cal("mixing").value, 50, 1e-12);
    const m = { m1: 50, c1: 4.184, T1: 90, m2: 150, c2: 4.184, T2: 20 };
    near(cal("mixing", { mixing: m }).value, 37.5, 1e-12);
    const cu = { m1: 100, c1: 0.385, T1: 100, m2: 200, c2: 4.184, T2: 20 };
    const tf = cal("mixing", { mixing: cu }).value;
    near(tf, (100 * 0.385 * 100 + 200 * 4.184 * 20) / (100 * 0.385 + 200 * 4.184), 1e-12);
    near(tf, 23.52, 0.01);
    near(100 * 0.385 * (tf - 100) + 200 * 4.184 * (tf - 20), 0, 1e-9);
  });
  test("[specific heat] 50 g metal at 100 C into 100 g water at 20 C ending at 25 C: c = 2092/(50*75) = 0.558 J/(g K)", () => {
    const r = cal("specific-heat");
    near(r.value, 2092 / 3750, 1e-9);
    near(r.value, 0.558, 0.001);
  });
  test("[validation] equal temperatures, final outside the two starting temperatures, zero masses and NaN are refused", () => {
    const ok = { mode: "reaction", reaction: { massG: 100, cJgK: 4.184, ccalJK: 0, Ti: 22, Tf: 28.5, moles: 0.05 } };
    assert.ok(T.validateCalorimetry(ok).ok);
    assert.equal(T.validateCalorimetry({ ...ok, reaction: { ...ok.reaction, massG: 0 } }).ok, false);
    assert.equal(T.validateCalorimetry({ ...ok, reaction: { ...ok.reaction, moles: -1 } }).ok, false);
    assert.equal(T.validateCalorimetry({ ...ok, reaction: { ...ok.reaction, Tf: NaN } }).ok, false);
    assert.equal(T.validateCalorimetry({ mode: "mixing", mixing: { m1: 1, c1: 4, T1: 20, m2: 1, c2: 4, T2: 20 } }).ok, false);
    assert.equal(T.validateCalorimetry({ mode: "specific-heat", specificHeat: { mMetal: 50, TMetal: 100, mWater: 100, TWater: 20, Tf: 120 } }).ok, false);
    assert.equal(T.validateCalorimetry({ mode: "specific-heat", specificHeat: { mMetal: 50, TMetal: 20, mWater: 100, TWater: 20, Tf: 20 } }).ok, false);
    assert.equal(T.validateCalorimetry({ mode: "nope" }).ok, false);
    assert.equal(T.validateCalorimetry(null).ok, false);
  });
  test("[energy-balance steps] each calculation lists its steps with the numbers it used", () => {
    const r = cal("reaction");
    assert.ok(r.steps.length >= 4);
    assert.ok(r.steps.every((s) => s.label && s.expression));
    assert.match(r.steps.map((s) => s.value).join(" "), /2720/);
  });
});
