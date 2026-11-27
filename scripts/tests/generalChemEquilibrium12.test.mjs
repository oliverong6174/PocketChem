// Stage 12: chemical equilibrium model. Reference values are derived independently of the bisection solver:
// closed-form quadratics, perfect-square roots, first-order ratios [B]/[A] = K, and mass-balance arithmetic.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let E;
before(async () => { E = await loadModule("/src/utils/generalChem/equilibrium.ts"); });
after(async () => { await closeEngine(); });

const sp = (name, coeff, c0) => ({ name, coeff, c0 });
const sys = (R, P, K, phase = "aqueous") => ({ reactants: R, products: P, K, phase });
const rel = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1e-300), `${label} expected ${b}, got ${a} (rel tol ${tol})`);
const solve = (s) => { const v = E.validateEquilibrium(s); assert.ok(v.ok, JSON.stringify(v.errors)); return E.solveEquilibrium(v.value); };

describe("closed-form references", () => {
  test("[hi] H2 + I2 <-> 2 HI, K = 54.3, 0.100 M each: 2x/(0.1-x) = sqrt(K) (perfect square)", () => {
    const r = solve(sys([sp("H2", 1, 0.1), sp("I2", 1, 0.1)], [sp("HI", 2, 0)], 54.3));
    const s = Math.sqrt(54.3);
    const x = (0.1 * s) / (2 + s);
    rel(r.xi, x, 1e-12);
    rel(r.reactants[0], 0.1 - x, 1e-12);
    rel(r.products[0], 2 * x, 1e-12);
    assert.equal(r.direction, "forward");
  });
  test("[n2o4] N2O4 <-> 2 NO2 from pure N2O4: 4x^2 + Kx - K c0 = 0", () => {
    for (const [K, c0] of [[4.6e-3, 0.05], [4.6e-3, 1.5], [0.36, 0.2], [1e-8, 1]]) {
      const x = (-K + Math.sqrt(K * K + 16 * K * c0)) / 8;
      const r = solve(sys([sp("N2O4", 1, c0)], [sp("NO2", 2, 0)], K, "gas"));
      rel(r.xi, x, 1e-11, `K=${K} c0=${c0}`);
      rel(r.products[0], 2 * x, 1e-11);
    }
  });
  test("[weak acid form] HA <-> H + A from HA only: x^2/(c0-x) = K", () => {
    const K = 1.8e-5; const c0 = 0.1;
    const x = (-K + Math.sqrt(K * K + 4 * K * c0)) / 2;
    const r = solve(sys([sp("HA", 1, c0)], [sp("H", 1, 0), sp("A", 1, 0)], K));
    rel(r.xi, x, 1e-11);
    rel(r.products[0], r.products[1], 1e-12);
  });
  test("[first order] A <-> B: [B]/[A] = K, so [A] = total/(1+K) for any K, including extremes", () => {
    for (const K of [1e-12, 1e-6, 0.3, 1, 7, 1e6, 1e12]) {
      const total = 0.8;
      const r = solve(sys([sp("A", 1, total)], [sp("B", 1, 0)], K));
      rel(r.reactants[0], total / (1 + K), 1e-9, `K=${K}`);
      rel(r.products[0], (total * K) / (1 + K), 1e-9, `K=${K}`);
    }
  });
  test("[reverse] the same equilibrium is reached from the product side", () => {
    const K = 54.3;
    const fwd = solve(sys([sp("H2", 1, 0.1), sp("I2", 1, 0.1)], [sp("HI", 2, 0)], K));
    const rev = solve(sys([sp("H2", 1, 0), sp("I2", 1, 0)], [sp("HI", 2, 0.2)], K));
    assert.equal(rev.direction, "reverse");
    rel(rev.reactants[0], fwd.reactants[0], 1e-10);
    rel(rev.products[0], fwd.products[0], 1e-10);
    assert.ok(rev.xi < 0);
  });
  test("[dimerisation] 2 A <-> B from pure A: K = b/a^2 (quadratic in x, root with a >= 0)", () => {
    const K = 3.2; const c0 = 1.0;
    // a = c0 - 2x, b = x: K (c0 - 2x)^2 = x  ->  4K x^2 - (4K c0 + 1) x + K c0^2 = 0
    const A = 4 * K; const B = -(4 * K * c0 + 1); const C = K * c0 * c0;
    const x = (-B - Math.sqrt(B * B - 4 * A * C)) / (2 * A);
    const r = solve(sys([sp("A", 2, c0)], [sp("B", 1, 0)], K));
    rel(r.xi, x, 1e-11);
    assert.ok(r.reactants[0] >= 0);
  });
});

describe("conservation and bounds", () => {
  test("[mass balance] c_i - nu_i xi and c_j + nu_j xi exactly; conserved combinations stay constant", () => {
    const s = sys([sp("A", 2, 0.7), sp("B", 1, 0.4)], [sp("C", 3, 0.1), sp("D", 1, 0.05)], 12);
    const r = solve(s);
    s.reactants.forEach((x, i) => rel(r.reactants[i], x.c0 - x.coeff * r.xi, 1e-9));
    s.products.forEach((x, i) => rel(r.products[i], x.c0 + x.coeff * r.xi, 1e-9));
    rel(r.reactants[0] / 2 + r.products[0] / 3, 0.7 / 2 + 0.1 / 3, 1e-9);
    assert.ok(Math.abs((r.reactants[1] - r.reactants[0] / 2) - (0.4 - 0.7 / 2)) < 1e-9);
  });
  test("[K vs Q] at the answer Q = K to high precision, over 300 random systems", () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    let checked = 0;
    for (let n = 0; n < 300; n += 1) {
      const nr = 1 + Math.floor(rnd() * 2); const np = 1 + Math.floor(rnd() * 2);
      const mk = (count, tag) => Array.from({ length: count }, (_, i) => sp(`${tag}${i}`, 1 + Math.floor(rnd() * 3), rnd() < 0.25 ? 0 : Math.round(rnd() * 20) / 20 + 0.001));
      const R = mk(nr, "R"); const P = mk(np, "P");
      if ([...R, ...P].every((x) => x.c0 === 0)) continue;
      const K = 10 ** (rnd() * 24 - 12);
      const r = solve(sys(R, P, K));
      if (r.direction === "none") continue;
      checked += 1;
      for (const c of [...r.reactants, ...r.products]) assert.ok(c >= 0 && Number.isFinite(c));
      assert.ok(r.lnResidual < 1e-9, `lnResidual ${r.lnResidual} for K=${K}`);
      assert.ok(r.xi >= r.xiMin - 1e-12 && r.xi <= r.xiMax + 1e-12);
    }
    assert.ok(checked > 150, `only ${checked} systems exercised`);
  });
  test("[direction] Q < K goes forward, Q > K goes reverse, Q = K stays put", () => {
    assert.equal(solve(sys([sp("A", 1, 1)], [sp("B", 1, 0.5)], 2)).direction, "forward");
    assert.equal(solve(sys([sp("A", 1, 0.1)], [sp("B", 1, 0.5)], 2)).direction, "reverse");
    const at = solve(sys([sp("A", 1, 0.25)], [sp("B", 1, 0.5)], 2));
    assert.equal(at.direction, "none");
    assert.equal(at.xi, 0);
  });
  test("[limiting reactant] large K with excess B: A almost gone, conversion below 100 %", () => {
    const r = solve(sys([sp("A", 1, 0.1), sp("B", 1, 1.0)], [sp("C", 1, 0)], 1e9));
    assert.ok(r.reactants[0] > 0 && r.reactants[0] < 1e-9);
    assert.ok(r.xi < 0.1 && r.xi > 0.1 * (1 - 1e-8));
    rel(r.products[0] / (r.reactants[0] * r.reactants[1]), 1e9, 1e-8);
  });
  test("[zero concentrations] an empty side, or nothing that can react, is handled without NaN", () => {
    const none = solve(sys([sp("A", 1, 0), sp("B", 1, 0.3)], [sp("C", 1, 0), sp("D", 1, 0.2)], 5));
    assert.equal(none.direction, "none");
    assert.ok([...none.reactants, ...none.products].every(Number.isFinite));
    const rev = solve(sys([sp("A", 1, 0), sp("B", 1, 0.3)], [sp("C", 1, 0.2)], 5));
    assert.equal(rev.direction, "reverse");
    rel(rev.products[0] / (rev.reactants[0] * rev.reactants[1]), 5, 1e-9);
  });
});

describe("disturbances (Le Chatelier)", () => {
  const base = sys([sp("N2O4", 1, 1)], [sp("NO2", 2, 0)], 0.25, "gas");
  const eq = () => { const r = solve(base); return { reactants: r.reactants, products: r.products }; };
  test("[add reactant] Q drops below K, the shift is forward, and K is unchanged", () => {
    const o = E.applyDisturbance(base, eq(), { kind: "add", side: "reactants", index: 0, amount: 0.5 });
    assert.ok(o.ok);
    assert.equal(o.shift, "forward");
    assert.ok(o.QImmediate < base.K);
    assert.equal(o.K, 0.25);
    rel(o.after.products[0] ** 2 / o.after.reactants[0], 0.25, 1e-9);
  });
  test("[remove/add product] removing a product shifts forward; adding one shifts reverse", () => {
    assert.equal(E.applyDisturbance(base, eq(), { kind: "remove", side: "products", index: 0, amount: 0.1 }).shift, "forward");
    assert.equal(E.applyDisturbance(base, eq(), { kind: "add", side: "products", index: 0, amount: 0.1 }).shift, "reverse");
  });
  test("[volume] doubling the volume with dn = +1 gives Q = K/2: shift toward more moles", () => {
    const o = E.applyDisturbance(base, eq(), { kind: "volume", factor: 2 });
    rel(o.QImmediate, base.K / 2, 1e-9);
    assert.equal(o.shift, "forward");
    const c = E.applyDisturbance(base, eq(), { kind: "volume", factor: 0.5 });
    rel(c.QImmediate, base.K * 2, 1e-9);
    assert.equal(c.shift, "reverse");
  });
  test("[volume, dn = 0] H2 + I2 <-> 2 HI is unaffected by volume; inert gas does nothing", () => {
    const s = sys([sp("H2", 1, 0.1), sp("I2", 1, 0.1)], [sp("HI", 2, 0)], 54.3, "gas");
    const r = solve(s); const e = { reactants: r.reactants, products: r.products };
    const o = E.applyDisturbance(s, e, { kind: "volume", factor: 3 });
    assert.equal(o.shift, "none");
    rel(o.QImmediate, 54.3, 1e-9);
    assert.equal(E.applyDisturbance(s, e, { kind: "inert" }).shift, "none");
  });
  test("[invalid] removing more than present, bad species, absurd volume factors are refused", () => {
    assert.equal(E.applyDisturbance(base, eq(), { kind: "remove", side: "products", index: 0, amount: 5 }).ok, false);
    assert.equal(E.applyDisturbance(base, eq(), { kind: "add", side: "products", index: 9, amount: 1 }).ok, false);
    assert.equal(E.applyDisturbance(base, eq(), { kind: "volume", factor: 100 }).ok, false);
    assert.equal(E.applyDisturbance(base, eq(), { kind: "add", side: "products", index: 0, amount: -1 }).ok, false);
  });
});

describe("Kp and validation", () => {
  test("[Kp] RT at 298.15 K is the ideal-gas molar volume at 1 bar (24.79 L/mol); conversions round-trip", () => {
    rel(E.R_L_BAR * 298.15, 24.7896, 1e-4);
    const Kc = 4.6e-3;
    rel(E.kpFromKc(Kc, 1, 298.15), Kc * 24.7896, 1e-4);
    rel(E.kcFromKp(E.kpFromKc(Kc, -2, 500), -2, 500), Kc, 1e-12);
    assert.equal(E.kpFromKc(7, 0, 400), 7);
  });
  test("[validation] bad systems are rejected with reasons, not coerced", () => {
    const good = sys([sp("A", 1, 1)], [sp("B", 1, 0)], 1);
    assert.ok(E.validateEquilibrium(good).ok);
    const bad = [
      null, {}, { ...good, K: 0 }, { ...good, K: -1 }, { ...good, K: NaN }, { ...good, K: 1e20 },
      { ...good, reactants: [] }, { ...good, reactants: [sp("A", 1, 1), sp("B", 1, 1), sp("C", 1, 1)] },
      { ...good, reactants: [sp("A", 0, 1)] }, { ...good, reactants: [sp("A", 1.5, 1)] }, { ...good, reactants: [sp("A", 9, 1)] },
      { ...good, reactants: [sp("A", 1, -1)] }, { ...good, reactants: [sp("A", 1, Infinity)] },
      { ...good, products: [sp("A", 1, 0)] },
      { ...good, reactants: [sp("A", 1, 0)], products: [sp("B", 1, 0)] },
      { ...good, phase: "solid" },
    ];
    for (const b of bad) assert.equal(E.validateEquilibrium(b).ok, false, JSON.stringify(b));
  });
  test("[progress curve] spans exactly the physical extent range, contains the equilibrium extent, ln Q increases", () => {
    const s = sys([sp("A", 1, 1)], [sp("B", 1, 0.2)], 3);
    const r = solve(s);
    const c = E.progressCurve(s, r.xi);
    assert.equal(c[0].xi, -0.2);
    assert.equal(c[c.length - 1].xi, 1);
    assert.ok(c.some((p) => p.xi === r.xi));
    for (const p of c) { assert.ok(p.reactants.every((v) => v >= 0)); assert.ok(p.products.every((v) => v >= 0)); }
    for (let i = 1; i < c.length; i += 1) assert.ok(c[i].lnQ >= c[i - 1].lnQ, "ln Q must increase with extent");
  });
});
