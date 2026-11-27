// Stage 12: kinetics model. References are textbook closed forms evaluated by hand or with independent code
// (finite differences, literal worked examples), not the tool's own output.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let K;
before(async () => { K = await loadModule("/src/utils/generalChem/kinetics.ts"); });
after(async () => { await closeEngine(); });

const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const rel = (a, b, tol, label = "") => near(a, b, tol * Math.abs(b), label);

describe("integrated rate laws and half-lives", () => {
  test("[first order] k = 0.0231 1/s: t1/2 = ln2/k = 30.0 s; after 2 half-lives a quarter remains", () => {
    const m = { order: 1, k: 0.0231, c0: 0.8 };
    near(K.halfLife(m), 30.0065, 0.001);
    near(K.concentrationAt(m, 2 * Math.LN2 / 0.0231), 0.2, 1e-12);
  });
  test("[C-14] t1/2 = 5730 y: fraction left after 10 000 y is 2^(-10000/5730) = 0.2982", () => {
    const k = Math.LN2 / 5730;
    near(k, 1.2097e-4, 1e-8);
    near(K.concentrationAt({ order: 1, k, c0: 1 }, 10000), 0.2982, 1e-4);
  });
  test("[second order] k = 0.5 L/(mol s), [A]0 = 0.20 M: t1/2 = 10 s; [A] = 0.1 at 10 s and 1/(5 + 0.5*30) = 0.05 at 30 s", () => {
    const m = { order: 2, k: 0.5, c0: 0.2 };
    near(K.halfLife(m), 10, 1e-12);
    near(K.concentrationAt(m, 10), 0.1, 1e-12);
    near(K.concentrationAt(m, 30), 0.05, 1e-12);
  });
  test("[zero order] k = 0.01 M/s, [A]0 = 0.50 M: t1/2 = 25 s, exhausted at 50 s and stays at exactly 0", () => {
    const m = { order: 0, k: 0.01, c0: 0.5 };
    near(K.halfLife(m), 25, 1e-12);
    near(K.concentrationAt(m, 25), 0.25, 1e-12);
    assert.equal(K.concentrationAt(m, 50), 0);
    assert.equal(K.concentrationAt(m, 500), 0);
    assert.equal(K.rateAt(m, 80), 0);
    assert.equal(K.rateAt(m, 10), 0.01);
  });
  test("[half-life vs concentration] zero order: proportional to [A]0; first: independent; second: inversely proportional", () => {
    const h = (order, c0) => K.halfLife({ order, k: 0.05, c0 });
    near(h(0, 2) / h(0, 1), 2, 1e-12);
    near(h(1, 2) / h(1, 1), 1, 1e-12);
    near(h(2, 2) / h(2, 1), 0.5, 1e-12);
  });
  test("[successive half-lives] 1st constant, 2nd doubles each time, 0th halves each time", () => {
    const ratio = (order) => { const s = K.successiveHalfLives({ order, k: 0.02, c0: 1 }, 4); return [s[1].duration / s[0].duration, s[2].duration / s[1].duration]; };
    assert.deepEqual(ratio(1).map((x) => Number(x.toFixed(10))), [1, 1]);
    assert.deepEqual(ratio(2).map((x) => Number(x.toFixed(10))), [2, 2]);
    assert.deepEqual(ratio(0).map((x) => Number(x.toFixed(10))), [0.5, 0.5]);
  });
  test("[consistency] concentration at each successive half-life boundary is c0/2^n", () => {
    for (const order of [0, 1, 2]) {
      const m = { order, k: 0.07, c0: 0.6 };
      for (const s of K.successiveHalfLives(m, 3)) near(K.concentrationAt(m, s.end), s.cEnd, 1e-10, `order ${order}`);
    }
  });
  test("[rate] -d[A]/dt from a central finite difference equals k[A]^n for every order", () => {
    for (const order of [0, 1, 2]) {
      const m = { order, k: 0.04, c0: 0.9 };
      for (const t of [0.5, 3, 7]) {
        const h = 1e-5;
        const fd = -(K.concentrationAt(m, t + h) - K.concentrationAt(m, t - h)) / (2 * h);
        near(fd, K.rateAt(m, t), 1e-7, `order ${order} t ${t}`);
      }
    }
  });
  test("[time to fraction] inverts the concentration law", () => {
    for (const order of [0, 1, 2]) {
      const m = { order, k: 0.03, c0: 0.4 };
      for (const f of [0.9, 0.5, 0.1]) near(K.concentrationAt(m, K.timeToFraction(m, f)) / m.c0, f, 1e-12, `order ${order} f ${f}`);
    }
  });
  test("[linearized plots] ln[A], 1/[A] and [A] are straight lines in t with slope -k, +k, -k", () => {
    for (const order of [0, 1, 2]) {
      const m = { order, k: 0.01, c0: 1 };
      const pts = [1, 5, 20].map((t) => [t, K.linearized(order, K.concentrationAt(m, t))]);
      const slope1 = (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]);
      const slope2 = (pts[2][1] - pts[1][1]) / (pts[2][0] - pts[1][0]);
      near(slope1, slope2, 1e-12, `order ${order}`);
      near(slope1, K.linearSlope(m), 1e-12);
    }
  });
  test("[units] rate-constant units follow the order and the time unit", () => {
    assert.equal(K.kUnits(0, "s"), "mol L⁻¹ s⁻¹");
    assert.equal(K.kUnits(1, "min"), "min⁻¹");
    assert.equal(K.kUnits(2, "h"), "L mol⁻¹ h⁻¹");
  });
});

describe("rate-law fitting", () => {
  const make = (order, k, c0, times, noise = 0, seed = 7) => {
    let s = seed;
    const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
    return times.map((t) => ({ t, c: K.concentrationAt({ order, k, c0 }, t) * (1 + noise * rnd()) }));
  };
  test("[exact data] each order is recovered with its k and verdict 'supported'", () => {
    const cases = [
      [0, 0.004, 0.5, [0, 20, 40, 60, 80, 100]],
      [1, 0.03, 0.5, [0, 10, 20, 40, 70, 100]],
      [2, 0.8, 0.5, [0, 2, 5, 10, 20, 40, 80]],
    ];
    for (const [order, k, c0, times] of cases) {
      const r = K.fitRateLaws(make(order, k, c0, times));
      assert.ok(r.ok, r.error);
      assert.equal(r.best, order, `order ${order}`);
      assert.equal(r.verdict, "supported", `order ${order}: ${r.message}`);
      const f = r.fits.find((x) => x.order === order);
      rel(f.k, k, 1e-9, `k for order ${order}`);
      rel(f.c0Fit, c0, 1e-9);
      near(f.r2, 1, 1e-12);
    }
  });
  test("[noise] 1 % noise still picks first order over a wide conversion range", () => {
    const r = K.fitRateLaws(make(1, 0.03, 0.5, [0, 5, 10, 20, 30, 45, 60, 90, 120], 0.02));
    assert.equal(r.best, 1);
    assert.ok(r.fits.find((f) => f.order === 1).r2 > 0.99);
  });
  test("[insufficient conversion] about 10 % decay cannot discriminate orders and is not called supported", () => {
    const r = K.fitRateLaws(make(1, 0.001, 1, [0, 20, 40, 60, 80, 100], 0.001));
    assert.ok(r.ok);
    assert.notEqual(r.verdict, "supported");
    assert.ok(r.conversion < 0.3);
    assert.match(r.message, /conversion|distinguish|little/i);
  });
  test("[poor fit] a curve that is none of the three is reported as such (a step function)", () => {
    const data = [[0, 1], [1, 0.98], [2, 0.97], [3, 0.5], [4, 0.2], [5, 0.19], [6, 0.18], [7, 0.1]].map(([t, c]) => ({ t, c }));
    const r = K.fitRateLaws(data);
    assert.ok(r.ok);
    assert.notEqual(r.verdict, "supported");
  });
  test("[zero concentration] log and reciprocal fits are marked unusable instead of producing NaN", () => {
    const r = K.fitRateLaws(make(0, 0.01, 0.5, [0, 10, 20, 30, 40, 50]));
    assert.equal(r.fits[1].usable, false);
    assert.equal(r.fits[2].usable, false);
    assert.equal(r.fits[0].usable, true);
    assert.equal(r.best, 0);
  });
  test("[invalid data] too few points, duplicates, negatives, non-finite, flat or rising data are refused with reasons", () => {
    const base = make(1, 0.03, 0.5, [0, 10, 20, 30, 40]);
    const bad = [
      base.slice(0, 3), [...base, base[1]], base.map((d, i) => (i === 2 ? { ...d, c: -1 } : d)), base.map((d, i) => (i === 2 ? { ...d, t: NaN } : d)),
      base.map((d) => ({ ...d, c: 0.3 })), [...base].reverse().map((d, i) => ({ t: i * 10, c: d.c })).reverse().map((d, i) => ({ t: i * 10, c: 0.1 + i * 0.1 })),
      base.map((d, i) => (i === 1 ? { ...d, t: -5 } : d)),
    ];
    for (const b of bad) assert.equal(K.fitRateLaws(b).ok, false);
  });
  test("[parsing] rows with commas, tabs and comments parse; malformed rows give a row-numbered error", () => {
    const ok = K.parsePairs("# t, c\n0, 1.0\n10\t0.5\n20 0.25\n", "concentration");
    assert.deepEqual(ok.rows, [[0, 1], [10, 0.5], [20, 0.25]]);
    assert.match(K.parsePairs("0 1\nabc 2", "x").error, /Row 2/);
    assert.match(K.parsePairs("0 1 2", "x").error, /Row 1/);
  });
  test("[regression] least squares on exact lines: y = 3 - 2x gives slope -2, intercept 3, R2 = 1", () => {
    const f = K.linearRegression([0, 1, 2, 3], [3, 1, -1, -3]);
    near(f.slope, -2, 1e-12); near(f.intercept, 3, 1e-12); near(f.r2, 1, 1e-12);
    assert.equal(K.linearRegression([1, 1, 1], [1, 2, 3]), null);
  });
});

describe("Arrhenius", () => {
  test("[two-point] k = 1.0e-3 at 300 K and 1.0e-2 at 320 K: Ea = R ln10 / (1/300 - 1/320) = 91.9 kJ/mol", () => {
    near(K.eaFromTwoPoints(1e-3, 300, 1e-2, 320), 91.89, 0.01);
  });
  test("[prediction] Ea = 50 kJ/mol raises k by 1.92x from 298.15 to 308.15 K; round trip recovers Ea", () => {
    const f = K.kAtTemperature(1, 298.15, 50, 308.15);
    near(f, 1.9246, 5e-4);
    near(K.eaFromTwoPoints(1, 298.15, f, 308.15), 50, 1e-9);
    assert.ok(K.factorPer10K(50, 298.15) > 1.5 && K.factorPer10K(50, 298.15) < 3);
    near(K.kAtTemperature(0.37, 350, 80, 350), 0.37, 1e-15);
  });
  test("[fit] points generated from A = 1e12, Ea = 75 kJ/mol are recovered exactly; noise lowers R2", () => {
    const gen = (T) => 1e12 * Math.exp(-75000 / (8.314462618 * T));
    const pts = [290, 300, 310, 320, 330].map((T) => ({ T, k: gen(T) }));
    const f = K.fitArrhenius(pts);
    near(f.EaKJ, 75, 1e-6); rel(f.A, 1e12, 1e-6); near(f.r2, 1, 1e-12);
    const noisy = pts.map((p, i) => ({ ...p, k: p.k * (1 + (i % 2 ? 0.3 : -0.3)) }));
    assert.ok(K.fitArrhenius(noisy).r2 < 0.999);
  });
  test("[analysis modes] given Ea, two-point and fit give the same k(T) for consistent data, with warnings only when extrapolating", () => {
    const base = { mode: "given", k1: 2e-3, T1: 300, EaKJ: 60, k2: 0, T2: 0, fitText: "", T: 320 };
    const g = K.analyzeArrhenius(base);
    const k320 = K.kAtTemperature(2e-3, 300, 60, 320);
    rel(g.kAtT, k320, 1e-12);
    const tp = K.analyzeArrhenius({ ...base, mode: "two-point", k2: K.kAtTemperature(2e-3, 300, 60, 330), T2: 330 });
    rel(tp.kAtT, k320, 1e-9);
    near(tp.EaKJ, 60, 1e-9);
    const fit = K.analyzeArrhenius({ ...base, mode: "fit", fitText: [300, 310, 330].map((T) => `${T}, ${K.kAtTemperature(2e-3, 300, 60, T)}`).join("\n") });
    rel(fit.kAtT, k320, 1e-9);
    assert.equal(g.warnings.length, 0);
    assert.ok(K.analyzeArrhenius({ ...base, T: 600 }).warnings.some((w) => /outside|extrapolat/i.test(w)));
  });
  test("[invalid] non-physical temperatures, negative k, equal temperatures, identical points, huge Ea are refused", () => {
    const base = { mode: "given", k1: 1e-3, T1: 300, EaKJ: 50, k2: 1e-2, T2: 320, fitText: "", T: 310 };
    assert.ok(K.validateArrhenius(base).ok);
    for (const bad of [{ ...base, T: 0 }, { ...base, T: -5 }, { ...base, T1: 10 }, { ...base, k1: 0 }, { ...base, k1: -1 }, { ...base, EaKJ: -3 }, { ...base, EaKJ: 9000 }, { ...base, mode: "two-point", T2: 300 }, { ...base, mode: "x" }, null]) {
      assert.equal(K.validateArrhenius(bad).ok, false, JSON.stringify(bad));
    }
    assert.equal(K.fitArrhenius([{ T: 300, k: 1 }, { T: 300, k: 2 }]).ok, false);
    assert.equal(K.fitArrhenius([{ T: 300, k: 1 }]).ok, false);
    assert.equal(K.fitArrhenius([{ T: 300, k: -1 }, { T: 310, k: 2 }]).ok, false);
    assert.equal(K.analyzeArrhenius({ ...base, mode: "fit", fitText: "300 1e-3\n310 abc" }).ok, false);
  });
  test("[rate model validation] bad order, k and concentrations are refused", () => {
    assert.ok(K.validateRateModel({ order: 2, k: 0.1, c0: 0.5 }).ok);
    for (const bad of [{ order: 3, k: 1, c0: 1 }, { order: 1.5, k: 1, c0: 1 }, { order: 1, k: 0, c0: 1 }, { order: 1, k: 1, c0: 0 }, { order: 1, k: NaN, c0: 1 }, { order: 1, k: 1, c0: 1000 }, null]) {
      assert.equal(K.validateRateModel(bad).ok, false, JSON.stringify(bad));
    }
  });
});
