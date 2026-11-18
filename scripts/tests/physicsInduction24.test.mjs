// Stage 24: magnetic flux, Faraday's and Lenz's laws, motional EMF, the ideal generator and the RL transient. Expected values are
// hand-derived or computed by independent numerical differentiation/integration written in this file.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

const I = await loadModule("/src/utils/physics/induction.ts");
after(async () => { await closeEngine(); });

const near = (a, b, rel, abs = 0, msg = "") => assert.ok(Math.abs(a - b) <= Math.max(rel * Math.abs(b), abs), `${msg} expected ${b}, got ${a}`);

describe("magnetic flux", () => {
  test("Φ = B A cos θ with θ between the normal and B: 0.01 Wb, 0.005 Wb, ~0, −0.01 Wb", () => {
    near(I.flux(0.5, 0.02, 0), 0.01, 1e-12); near(I.flux(0.5, 0.02, 60), 0.005, 1e-12); near(I.flux(0.5, 0.02, 90), 0, 1, 1e-15); near(I.flux(0.5, 0.02, 180), -0.01, 1e-12);
  });
  test("the angle is to the NORMAL, not to the plane: a plane 30° from B has θ = 60° and half the maximum flux", () => {
    const planeAngle = 30; near(I.flux(0.5, 0.02, 90 - planeAngle), 0.005, 1e-12); assert.ok(I.flux(0.5, 0.02, planeAngle) > I.flux(0.5, 0.02, 90 - planeAngle));
    near(I.flux(0.5, 0.02, 0), 0.01, 1e-12, 0, "loop face-on to B has the maximum flux"); near(I.flux(0.5, 0.02, 90), 0, 1, 1e-15, "loop edge-on has none");
  });
  test("the sign follows cos θ: negative beyond 90°, antisymmetric under θ → 180° − θ", () => {
    assert.ok(I.flux(0.5, 0.02, 120) < 0); near(I.flux(0.5, 0.02, 60), -I.flux(0.5, 0.02, 120), 1e-12); near(I.flux(0.5, 0.02, 30), I.flux(0.5, 0.02, -30), 1e-12);
  });
  test("flux is proportional to B and to A; flux linkage is N times the single-loop flux", () => {
    near(I.flux(1, 0.02, 30) / I.flux(0.5, 0.02, 30), 2, 1e-12); near(I.flux(0.5, 0.04, 30) / I.flux(0.5, 0.02, 30), 2, 1e-12);
    near(I.fluxLinkage({ B: 0.5, A: 0.02, N: 100, thetaDeg: 30 }), 100 * 0.5 * 0.02 * (Math.sqrt(3) / 2), 1e-12);
  });
  test("validation", () => {
    assert.equal(I.validateFlux(I.DEFAULT_FLUX).ok, true);
    for (const bad of [{ B: -1 }, { A: 0 }, { N: 0 }, { N: 2.5 }, { thetaDeg: 400 }, { B: NaN }]) assert.equal(I.validateFlux({ ...I.DEFAULT_FLUX, ...bad }).ok, false, JSON.stringify(bad));
  });
});

describe("Faraday's law and Lenz's law", () => {
  const ramp = { B0: 0.2, bRate: 0.4, A0: 0.05, aRate: 0, N: 50, theta0Deg: 0, omega: 0, closed: true, R: 2, duration: 2 };
  test("ramping B with θ = 0: ε = −N A dB/dt = −1 V, I = ε/R = −0.5 A, constant in time", () => {
    for (const t of [0, 0.5, 1.9]) { near(I.emfAtTime(ramp, t), -1, 1e-12); near(I.currentAtTime(ramp, t), -0.5, 1e-12); }
    near(I.fluxAtTime(ramp, 0), 0.2 * 0.05, 1e-12); near(I.fluxAtTime(ramp, 1), 0.6 * 0.05, 1e-12);
  });
  test("Lenz: flux through the loop along n̂ is increasing, so the current is clockwise (from the n̂ side) and its field opposes n̂", () => {
    const r = I.lenz(ramp, 0.5);
    assert.equal(r.change, "increasing"); assert.equal(r.sense, "clockwise"); assert.equal(r.inducedFieldAlongNormal, -1); assert.equal(r.opposesChange, true); assert.match(r.text, /oppose that change/);
  });
  test("decreasing the field reverses everything: counter-clockwise current, induced field along n̂", () => {
    const r = I.lenz({ ...ramp, bRate: -0.05, B0: 0.2 }, 1); assert.equal(r.change, "decreasing"); assert.equal(r.sense, "counterclockwise"); assert.equal(r.inducedFieldAlongNormal, 1); assert.ok(r.emf > 0);
  });
  test("a field in the opposite direction (B along −n̂) that grows in size: flux is becoming more negative, so the current is counter-clockwise", () => {
    const r = I.lenz({ ...ramp, B0: -0.2, bRate: -0.4 }, 0.5); assert.equal(r.change, "decreasing"); assert.equal(r.sense, "counterclockwise");
  });
  test("the induced effect opposes the CHANGE, not the field: a decreasing field produces an induced field in the SAME direction as it", () => {
    const r = I.lenz({ ...ramp, B0: 0.5, bRate: -0.1 }, 1); // B along +n̂ and shrinking
    assert.ok(r.flux > 0); assert.equal(r.inducedFieldAlongNormal, 1);
  });
  test("constant flux gives zero EMF even though a strong field is present", () => {
    const still = { ...ramp, B0: 2, bRate: 0 }; assert.equal(I.emfAtTime(still, 0.7), 0); assert.equal(I.currentAtTime(still, 0.7), 0);
    const r = I.lenz(still, 0.7); assert.equal(r.change, "constant"); assert.equal(r.sense, "none"); assert.match(r.text, /no EMF is induced/);
  });
  test("a growing field through a loop whose plane is parallel to B (θ = 90°) induces nothing: the flux is zero and stays zero", () => {
    const edge = { ...ramp, theta0Deg: 90 }; near(I.emfAtTime(edge, 0.6), 0, 1, 1e-12); near(I.fluxAtTime(edge, 1.5), 0, 1, 1e-12);
  });
  test("changing the area at constant B: ε = −N B dA/dt", () => {
    const grow = { ...ramp, B0: 0.2, bRate: 0, A0: 0.05, aRate: 0.01, N: 1 }; near(I.emfAtTime(grow, 0.4), -0.2 * 0.01, 1e-12);
    near(I.emfAtTime({ ...grow, aRate: -0.01 }, 0.4), 0.2 * 0.01, 1e-12);
  });
  test("rotating loop: ε = N B A ω sin θ — zero at θ = 0, N B A ω at θ = 90°", () => {
    const rot = { ...ramp, bRate: 0, B0: 0.2, A0: 0.05, N: 50, omega: 10, duration: 1 };
    near(I.emfAtTime(rot, 0), 0, 1, 1e-12); near(I.emfAtTime(rot, Math.PI / 20), 50 * 0.2 * 0.05 * 10, 1e-12); near(I.emfAtTime(rot, Math.PI / 10), 0, 1, 1e-9);
    near(I.emfAtTime(rot, (3 * Math.PI) / 20), -5, 1e-12);
  });
  test("the analytic EMF agrees with an independent central-difference derivative of the flux, including combined changes", () => {
    const all = { B0: 0.3, bRate: 0.5, A0: 0.04, aRate: 0.02, N: 30, theta0Deg: 25, omega: 7, closed: true, R: 3, duration: 2 };
    for (const t of [0.1, 0.6, 1.3, 1.9]) { near(I.emfAtTime(all, t), I.emfNumeric(all, t, 1e-5), 1e-6, 1e-9); near(I.emfAtTime(all, t), -30 * (I.fluxAtTime(all, t + 1e-6) - I.fluxAtTime(all, t - 1e-6)) / 2e-6, 1e-5, 1e-8); }
  });
  test("an open loop has an EMF but no sustained current; its Lenz text says so", () => {
    const open = { ...ramp, closed: false }; near(I.emfAtTime(open, 0.5), -1, 1e-12); assert.equal(I.currentAtTime(open, 0.5), 0);
    const r = I.lenz(open, 0.5); assert.equal(r.current, 0); assert.match(r.text, /open/); assert.equal(r.sense, "clockwise");
  });
  test("sign convention: positive EMF ⇒ counter-clockwise from the n̂ side", () => {
    assert.equal(I.senseOf(1), "counterclockwise"); assert.equal(I.senseOf(-1), "clockwise"); assert.equal(I.senseOf(0), "none"); assert.match(I.VIEWING_CONVENTION, /n̂ points toward/);
  });
  test("the trace holds flux, EMF and current that agree with the pointwise functions; EMF is the negative slope of the N-turn flux", () => {
    const p = { ...ramp, omega: 3, bRate: 0.1 }; const tr = I.faradayTrace(p, 200);
    assert.equal(tr.length, 201);
    for (const s of tr) { near(s.emf, I.emfAtTime(p, s.t), 1e-12); near(s.flux, I.fluxAtTime(p, s.t), 1e-12); }
    for (let k = 5; k < 195; k += 30) near(tr[k].emf, (-p.N * (tr[k + 1].flux - tr[k - 1].flux)) / (tr[k + 1].t - tr[k - 1].t), 5e-3, 1e-3);
  });
  test("validation: shrinking to zero area, too-strong fields, bad counts, bad resistance", () => {
    assert.equal(I.validateFaraday(ramp).ok, true);
    for (const bad of [{ A0: 0.05, aRate: -0.05, duration: 2 }, { B0: 19, bRate: 10 }, { N: 0 }, { R: 0 }, { closed: "yes" }, { duration: 0 }, { omega: 1e5 }]) assert.equal(I.validateFaraday({ ...ramp, ...bad }).ok, false, JSON.stringify(bad));
  });
});

describe("motional EMF", () => {
  const rails = { Bz: 0.5, L: 0.4, rodAngleDeg: 90, v: 3, velAngleDeg: 0, R: 2 };
  test("perpendicular rod moving through B: |ε| = B L v = 0.6 V", () => near(Math.abs(I.motionalEmf(rails).emf), 0.5 * 0.4 * 3, 1e-12));
  test("with B out of the screen and the rod (along +y) moving right, the force on positive charge is −y, so the TIP is negative (tail positive)", () => {
    const r = I.motionalEmf(rails); near(r.emf, -0.6, 1e-12); assert.equal(r.positiveEnd, "tail"); near(r.forceDirDeg, -90, 1e-9);
  });
  test("reversing B or the velocity reverses the polarity", () => {
    assert.equal(I.motionalEmf({ ...rails, Bz: -0.5 }).positiveEnd, "tip"); near(I.motionalEmf({ ...rails, Bz: -0.5 }).emf, 0.6, 1e-12);
    assert.equal(I.motionalEmf({ ...rails, velAngleDeg: 180 }).positiveEnd, "tip");
  });
  test("moving along the rod induces nothing; at an angle the vector formula gives B L v sin(ψ − α), not BLv", () => {
    near(I.motionalEmf({ ...rails, velAngleDeg: 90 }).emf, 0, 1, 1e-12); assert.equal(I.motionalEmf({ ...rails, velAngleDeg: 90 }).positiveEnd, "neither");
    const r = I.motionalEmf({ ...rails, velAngleDeg: -45 }); near(Math.abs(r.emf), 0.6 * Math.sin(Math.PI / 4), 1e-12); assert.equal(r.perpendicular, false); assert.equal(r.rails, null);
  });
  test("zero field or zero speed: no EMF", () => { assert.equal(I.motionalEmf({ ...rails, Bz: 0 }).emf, 0); assert.equal(I.motionalEmf({ ...rails, v: 0 }).emf, 0); });
  test("rails model: I = ε/R = −0.3 A; the magnetic force B I L = 0.06 N opposes the motion; mechanical power = electrical power = 0.18 W", () => {
    const r = I.motionalEmf(rails).rails; near(r.current, -0.3, 1e-12); near(r.force, 0.06, 1e-12); near(r.mechanicalPower, 0.18, 1e-12); near(r.electricalPower, 0.18, 1e-12); near(r.mechanicalPower, r.electricalPower, 1e-12);
  });
  test("agrees with Faraday's law applied to the growing rails loop (Φ = B L x, dΦ/dt = B L v)", () => {
    const p = { B0: 0.5, bRate: 0, A0: 0.4 * 0.1, aRate: 0.4 * 3, N: 1, theta0Deg: 0, omega: 0, closed: true, R: 2, duration: 1 };
    near(Math.abs(I.emfAtTime(p, 0.5)), Math.abs(I.motionalEmf(rails).emf), 1e-12);
  });
  test("validation", () => { assert.equal(I.validateMotional(rails).ok, true); for (const bad of [{ L: 0 }, { v: -1 }, { R: 0 }, { Bz: 100 }, { v: NaN }]) assert.equal(I.validateMotional({ ...rails, ...bad }).ok, false, JSON.stringify(bad)); });
});

describe("ideal AC generator", () => {
  const g = I.DEFAULT_GENERATOR; // B 0.4 T, A 0.05 m², N 200, 50 Hz
  const w = 2 * Math.PI * 50;
  test("peak EMF = N B A ω = 1256.6 V and rms = peak/√2", () => { near(I.generatorPeakEmf(g), 200 * 0.4 * 0.05 * w, 1e-12); near(I.generatorPeakEmf(g), 1256.64, 1e-5); near(I.generatorRmsEmf(g), 888.58, 1e-5); });
  test("Φ = B A cos(ωt), ε = N B A ω sin(ωt): flux is maximal when the EMF is zero, and the EMF is maximal when the flux is zero", () => {
    const T = 1 / 50;
    const s0 = I.generatorState(g, 0), s1 = I.generatorState(g, T / 4), s2 = I.generatorState(g, T / 2), s3 = I.generatorState(g, (3 * T) / 4);
    near(s0.flux, 0.02, 1e-12); near(s0.emf, 0, 1, 1e-9);
    near(s1.flux, 0, 1, 1e-12); near(s1.emf, I.generatorPeakEmf(g), 1e-12);
    near(s2.flux, -0.02, 1e-12); near(s2.emf, 0, 1, 1e-9);
    near(s3.emf, -I.generatorPeakEmf(g), 1e-12);
  });
  test("the EMF equals the negative derivative of the N-turn flux (independent central difference), so the quarter-period phase relationship is Faraday's law", () => {
    for (const t of [0.001, 0.0053, 0.012, 0.0171]) {
      const h = 1e-7; const num = (-200 * (I.generatorState(g, t + h).flux - I.generatorState(g, t - h).flux)) / (2 * h);
      near(I.generatorState(g, t).emf, num, 1e-6, 1e-4);
    }
  });
  test("EMF crosses zero (rising) exactly where the flux is at an extremum; |EMF| is largest where the flux crosses zero", () => {
    let flux = [], emf = []; for (let k = 0; k <= 4000; k += 1) { const s = I.generatorState(g, (k / 4000) * (2 / 50)); flux.push(s.flux); emf.push(s.emf); }
    const maxFlux = Math.max(...flux.map(Math.abs));
    for (let k = 0; k < 4000; k += 1) { if (Math.abs(flux[k]) > maxFlux * 0.9999) assert.ok(Math.abs(emf[k]) < 0.03 * I.generatorPeakEmf(g), "at flux extremum EMF ≈ 0"); if (Math.abs(emf[k]) > 0.9999 * I.generatorPeakEmf(g)) assert.ok(Math.abs(flux[k]) < 0.02 * maxFlux, "at EMF peak flux ≈ 0"); }
  });
  test("frequency, period and duration are consistent; the EMF is periodic", () => {
    near(I.generatorPeriod(g), 0.02, 1e-12); near(I.generatorDuration(g), 0.04, 1e-12); near(I.generatorOmega(g), w, 1e-12);
    near(I.generatorState(g, 0.0037).emf, I.generatorState(g, 0.0037 + 0.02).emf, 1e-9, 1e-6);
  });
  test("doubling N, B, A or the frequency doubles the peak EMF; the initial angle shifts the phase without changing the peak", () => {
    for (const k of ["N", "B", "A", "frequency"]) near(I.generatorPeakEmf({ ...g, [k]: g[k] * 2 }), 2 * I.generatorPeakEmf(g), 1e-12, 0, k);
    near(I.generatorPeakEmf({ ...g, theta0Deg: 40 }), I.generatorPeakEmf(g), 1e-12); near(I.generatorState({ ...g, theta0Deg: 90 }, 0).emf, I.generatorPeakEmf(g), 1e-12);
  });
  test("the stated assumptions rule out power and efficiency claims", () => {
    assert.ok(I.GENERATOR_ASSUMPTIONS.some((a) => /no load/.test(a) && /no power output or efficiency/.test(a)));
    assert.equal(I.validateGenerator(g).ok, true);
    for (const bad of [{ B: 0 }, { A: 0 }, { N: 0 }, { frequency: 0 }, { frequency: 5000 }, { periods: 0 }, { periods: 9 }]) assert.equal(I.validateGenerator({ ...g, ...bad }).ok, false, JSON.stringify(bad));
  });
});

describe("series RL circuit", () => {
  const rl = { Vs: 12, i0: 0, R: 20, L: 0.5, spanTau: 5 };
  const tau = 0.5 / 20;
  test("τ = L/R = 25 ms; doubling L doubles it and doubling R halves it", () => {
    near(I.rlTau(rl), 0.025, 1e-12); near(I.rlTau({ ...rl, L: 1 }), 0.05, 1e-12); near(I.rlTau({ ...rl, R: 40 }), 0.0125, 1e-12); near(I.rlEnd(rl), 5 * 0.025, 1e-12);
  });
  test("growth: i(t) = (V/R)(1 − e^{−t/τ}): 0, 0.379 A after one τ, 0.596 A after 5τ", () => {
    near(I.rlState(rl, 0).i, 0, 1, 1e-15); near(I.rlState(rl, tau).i, 0.6 * (1 - Math.exp(-1)), 1e-12); near(I.rlState(rl, tau).i, 0.37927, 1e-4); near(I.rlState(rl, 5 * tau).i, 0.6 * (1 - Math.exp(-5)), 1e-12);
    assert.equal(I.rlKind(rl), "growth");
  });
  test("the inductor opposes the CHANGE: v_L(0) = V, decaying as e^{−t/τ}; v_L ≈ 0 in the steady state, i ≈ V/R", () => {
    near(I.rlState(rl, 0).vL, 12, 1e-12); near(I.rlState(rl, tau).vL, 12 * Math.exp(-1), 1e-12);
    const late = I.rlState(rl, 12 * tau); assert.ok(Math.abs(late.vL) < 1e-4 * 12); near(late.i, 0.6, 1e-5);
  });
  test("Kirchhoff's voltage law at every instant: v_R + v_L = V_s", () => { for (const t of [0, 0.004, 0.025, 0.07, 0.2]) { const s = I.rlState(rl, t); near(s.vR + s.vL, 12, 1e-12); } });
  test("the differential equation V = R i + L di/dt holds (independent central difference of i(t))", () => {
    for (const rlx of [rl, { ...rl, i0: 0.6, Vs: 0 }, { ...rl, i0: -0.2 }]) for (const t of [0.003, 0.02, 0.06]) {
      const h = 1e-7; const didt = (I.rlState(rlx, t + h).i - I.rlState(rlx, t - h).i) / (2 * h);
      near(rlx.R * I.rlState(rlx, t).i + rlx.L * didt, rlx.Vs, 1e-6, 1e-6);
    }
  });
  test("initial slope di/dt(0) = (V − R i₀)/L = 24 A/s", () => near(I.rlState(rl, 0).didt, 24, 1e-12));
  test("decay (source removed): i = i₀ e^{−t/τ}; v_L is NEGATIVE (the inductor acts as a source) and equals −R i", () => {
    const d = { ...rl, Vs: 0, i0: 0.6 };
    near(I.rlState(d, tau).i, 0.6 * Math.exp(-1), 1e-12); near(I.rlState(d, 0).vL, -12, 1e-12); near(I.rlState(d, 0.01).vL, -20 * I.rlState(d, 0.01).i, 1e-12);
    assert.equal(I.rlKind(d), "decay"); assert.ok(I.rlState(d, 0.01).didt < 0);
  });
  test("passive sign convention: during growth v_L > 0 and the induced EMF −L di/dt is negative (opposes the growth)", () => { const s = I.rlState(rl, 0.01); assert.ok(s.vL > 0 && s.emfL < 0); near(s.emfL, -s.vL, 1e-12); });
  test("stored energy U = ½ L i² and flux linkage L i; steady-state energy is ½·0.5·0.6² = 0.09 J", () => {
    const s = I.rlState(rl, 20 * tau); near(s.energy, 0.5 * 0.5 * s.i * s.i, 1e-12); near(s.energy, 0.09, 1e-6); near(s.linkage, 0.5 * s.i, 1e-12);
  });
  test("energy balance: ∫ V i dt = ∫ R i² dt + ½ L i² (independent Simpson integration over 5τ)", () => {
    const N = 4000, T = 5 * tau; let src = 0, heat = 0;
    for (let k = 0; k < N; k += 1) { const a = (k / N) * T, b = ((k + 1) / N) * T, m = (a + b) / 2; const f = (t) => I.rlState(rl, t).i; const h = (b - a) / 6; src += h * (12 * f(a) + 4 * 12 * f(m) + 12 * f(b)); heat += h * (20 * f(a) ** 2 + 4 * 20 * f(m) ** 2 + 20 * f(b) ** 2); }
    near(src, heat + I.rlState(rl, T).energy, 1e-8);
  });
  test("a current already at its final value does not change: no transient", () => {
    const steady = { ...rl, i0: 0.6 }; assert.equal(I.rlKind(steady), "steady"); near(I.rlState(steady, 0.01).i, 0.6, 1e-12); assert.ok(Math.abs(I.rlState(steady, 0.01).vL) < 1e-12);
  });
  test("a negative starting current with a positive source passes through zero", () => { const t = I.rlTrace({ ...rl, i0: -0.3 }, 100); assert.ok(t[0].i < 0 && t.at(-1).i > 0); });
  test("the trace covers the span and ends where rlState does", () => { const t = I.rlTrace(rl, 100); assert.equal(t.length, 101); near(t.at(-1).t, 5 * tau, 1e-12); near(t.at(-1).i, I.rlState(rl, 5 * tau).i, 1e-12); });
  test("validation: R = 0 (no finite τ), huge τ, out-of-range values", () => {
    assert.equal(I.validateRl(rl).ok, true);
    for (const bad of [{ R: 0 }, { L: 0 }, { L: 2000 }, { Vs: 500 }, { i0: NaN }, { spanTau: 4 }]) assert.equal(I.validateRl({ ...rl, ...bad }).ok, false, JSON.stringify(bad));
  });
  test("the stated assumptions: opposes changes, passive sign convention", () => { assert.ok(I.RL_ASSUMPTIONS.some((a) => /does not oppose a steady current/.test(a))); assert.ok(I.RL_ASSUMPTIONS.some((a) => /passive sign convention/i.test(a))); });
});
