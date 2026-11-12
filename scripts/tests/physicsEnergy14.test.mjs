// Stage 14: work and mechanical energy. Expected values are hand-derived from the work-energy theorem and standard formulas
// (g = 10 m/s^2 where convenient); the ledger checks recompute work with independent arithmetic.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let E;
before(async () => { E = await loadModule("/src/utils/physics/energy.ts"); });
after(async () => { await closeEngine(); });

const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const rel = (a, b, tol, label = "") => near(a, b, tol * Math.max(Math.abs(b), 1e-12), label);
const base = (o = {}) => ({ ...E.DEFAULT_ENERGY_INPUT, g: 10, ...o });
const rad = (d) => (d * Math.PI) / 180;

describe("incline", () => {
  test("[frictionless] 2 kg from the top of a 5 m, 30 degree incline (h = 2.5 m): v = sqrt(2 g h) = 7.071 m/s, t = sqrt(2L/(g sin30)) = 1.414 s, KE = mgh = 50 J, no heat", () => {
    const a = E.analyzeEnergy(base({ mus: 0, muk: 0 }));
    near(a.tEnd, Math.SQRT2, 1e-9);
    const f = a.final;
    near(f.v, -Math.sqrt(50), 1e-9); // downhill is toward smaller u
    near(f.KE, 50, 1e-9); near(f.PEg, 0, 1e-9); near(f.Q, 0, 1e-12);
    near(a.initial.PEg, 50, 1e-9); near(a.initial.KE, 0, 0);
    assert.match(a.ending, /bottom/);
  });
  test("[friction] mu_k = 0.2: a = g(sin30 - 0.2 cos30) = 3.268 m/s^2, v = sqrt(2 a L) = 5.717 m/s, heat Q = mu m g cos30 L = 17.32 J, KE = 50 - 17.32 = 32.68 J", () => {
    const a = E.analyzeEnergy(base({ mus: 0.3, muk: 0.2 }));
    const acc = 10 * (0.5 - 0.2 * Math.cos(rad(30)));
    near(-a.final.v, Math.sqrt(2 * acc * 5), 1e-9);
    near(a.final.Q, 0.2 * 2 * 10 * Math.cos(rad(30)) * 5, 1e-9);
    near(a.final.KE, 50 - a.final.Q, 1e-9);
    near(a.final.KE, 0.5 * 2 * 2 * acc * 5, 1e-9);
    near(a.tEnd, Math.sqrt((2 * 5) / acc), 1e-9);
  });
  test("[stays] if tan(theta) <= mu_s the block does not move: 30 degrees with mu_s = 0.7 -> stays, zero time of motion, energies unchanged", () => {
    const a = E.analyzeEnergy(base({ mus: 0.7, muk: 0.5 }));
    assert.equal(a.stays, true);
    assert.match(a.ending, /does not move/);
    near(a.final.KE, 0, 0); near(a.final.Q, 0, 0); near(a.final.PEg, a.initial.PEg, 0);
    assert.ok(a.tEnd > 0, "a window is still defined so the graphs have an axis");
  });
  test("[up the slope, frictionless] launched up at 5 m/s from the bottom: it rises v^2/(2 g sin30) = 2.5 m and returns; if the incline is longer than that it never reaches 3 m, and energy explains why", () => {
    const a = E.analyzeEnergy(base({ m: 1, L: 5, u0: 0, v0: 5, mus: 0, muk: 0 }));
    const miss = E.reachPosition(a, 3);
    assert.equal(miss.reached, false);
    near(miss.max, 2.5, 1e-3);
    const hit = E.reachPosition(a, 2);
    assert.equal(hit.reached, true);
    near(Math.abs(hit.state.v), Math.sqrt(25 - 2 * 5 * 2), 1e-6); // v^2 = v0^2 - 2 g sin30 d
    assert.equal(E.speedFromEnergy(1, 5, -0.5 * 5 * 3 * 2 * 0 - 1 * 10 * 0.5 * 3), null);
    near(E.speedFromEnergy(1, 5, -10 * 0.5 * 2), Math.sqrt(5), 1e-12);
  });
  test("[friction stops an upward slide] rough incline, 10 m/s up from the bottom, mu_k = 0.2: it stops after v^2/(2 g (sin30 + 0.2 cos30)) metres and stays (tan30 < mu_s)", () => {
    const a = E.analyzeEnergy(base({ m: 1, L: 50, u0: 0, v0: 10, mus: 0.8, muk: 0.2 }));
    const d = 100 / (2 * 10 * (0.5 + 0.2 * Math.cos(rad(30))));
    near(a.posMax, d, 1e-6);
    near(a.final.v, 0, 1e-9); near(a.final.KE, 0, 1e-9);
    assert.match(a.ending, /rest/);
    // energy: initial KE = PE gained + heat
    near(a.initial.KE, a.final.PEg + a.final.Q, 1e-9);
  });
});

describe("rough horizontal surface", () => {
  test("[friction stops a slider] 4 kg at 6 m/s, mu_k = 0.25: a = -2.5 m/s^2, stops after 36/5 = 7.2 m in 2.4 s; heat = 72 J = initial KE", () => {
    const a = E.analyzeEnergy(base({ scenario: "flat", m: 4, v0: 6, mus: 0.3, muk: 0.25, F: 0 }));
    near(a.tEnd, 2.4, 1e-9);
    near(a.final.pos, 7.2, 1e-9); near(a.final.Q, 72, 1e-9); near(a.final.KE, 0, 1e-9);
    near(a.initial.KE, 72, 1e-9);
  });
  test("[applied force] 4 kg from rest, F = 20 N, mu_k = 0.25: a = (20 - 10)/4 = 2.5 m/s^2; at 2 s x = 5 m, v = 5 m/s, W_F = 100 J, Q = 50 J, KE = 50 J", () => {
    const a = E.analyzeEnergy(base({ scenario: "flat", m: 4, v0: 0, mus: 0.3, muk: 0.25, F: 20 }));
    const s = a.at(2);
    near(s.pos, 5, 1e-9); near(s.v, 5, 1e-9);
    near(s.Wapplied, 100, 1e-9); near(s.Q, 50, 1e-9); near(s.KE, 50, 1e-9);
    near(s.Wapplied - s.Q, s.KE, 1e-9);
  });
  test("[static limit] 10 N on a 4 kg block with mu_s = 0.3 (limit 12 N): no motion, no work, no heat", () => {
    const a = E.analyzeEnergy(base({ scenario: "flat", m: 4, v0: 0, mus: 0.3, muk: 0.25, F: 10 }));
    assert.equal(a.stays, true);
    near(a.final.Wapplied, 0, 0); near(a.final.Q, 0, 0);
  });
  test("[negative work] a force against the motion does negative work: 3 kg at 8 m/s on a smooth floor with F = -12 N stops after 8^2*3/(2*12) = 8 m; W_F = -96 J = -KE0", () => {
    const a = E.analyzeEnergy(base({ scenario: "flat", m: 3, v0: 8, mus: 0, muk: 0, F: -12 }));
    const stop = a.at(2); // v0 m / |F| = 8*3/12 = 2 s
    near(stop.pos, 8, 1e-9);
    near(stop.Wapplied, -96, 1e-9); near(stop.KE, 0, 1e-9); near(a.initial.KE, 96, 1e-9);
    assert.ok(a.at(4).v < 0, "the same force then accelerates it backwards: work is positive again");
  });
});

describe("spring", () => {
  test("[frictionless launch] k = 200 N/m, x0 = 0.5 m, m = 2 kg: PE = 1/2 k x0^2 = 25 J, v = x0 sqrt(k/m) = 5 m/s at the natural length after a quarter period pi/20 s", () => {
    const a = E.analyzeEnergy(base({ scenario: "spring", mus: 0, muk: 0, duration: 2 }));
    near(a.initial.PEs, 25, 1e-9);
    const t1 = Math.PI / 20;
    const s = a.at(t1);
    near(s.v, 5, 1e-9); near(s.KE, 25, 1e-9); near(s.PEs, 0, 1e-9); near(s.compression, 0, 1e-9);
    near(a.at(t1 * 2 + 0.3).v, 5, 1e-9);
  });
  test("[frictional launch] mu_k = 0.2: leaving speed from the energy balance 1/2 m v^2 = 1/2 k x0^2 - mu m g x0 = 25 - 2 = 23 J -> v = sqrt(23) = 4.796 m/s; it then slides v^2/(2 mu g) = 5.75 m", () => {
    const a = E.analyzeEnergy(base({ scenario: "spring", mus: 0.3, muk: 0.2, duration: 20 }));
    const w = Math.sqrt(200 / 2);
    const ue = 0.2 * 2 * 10 / 200;
    const t1 = Math.acos(-ue / (0.5 - ue)) / w;
    near(t1, 0.1612473, 1e-6);
    const s = a.at(t1);
    near(s.v, Math.sqrt(23), 1e-9); near(s.KE, 23, 1e-9); near(s.compression, 0, 1e-9);
    near(s.Q, 2, 1e-9);
    near(a.final.pos, 23 / (2 * 0.2 * 10), 1e-9);
    near(a.final.Q, 25, 1e-9);
    near(a.final.KE, 0, 1e-9);
  });
  test("[stops inside the spring] k = 200, x0 = 0.1, mu = 0.9, m = 2: the spring cannot push through friction: it stops at compression 2 mu m g/k - x0 = 0.08 m after half a period", () => {
    const a = E.analyzeEnergy(base({ scenario: "spring", x0: 0.1, mus: 0.9, muk: 0.9 }));
    assert.match(a.ending, /still compressed/);
    near(a.final.compression, 0.08, 1e-9); near(a.final.v, 0, 1e-9);
    near(a.tEnd, Math.PI / 10, 1e-9);
    near(a.initial.PEs - a.final.PEs, a.final.Q, 1e-9);
  });
  test("[held by friction] if k x0 <= mu_s m g the block does not move (200 N/m x 0.1 m = 20 N <= 0.9 * 20 N is false; 0.1 m with mu_s = 1.1 holds)", () => {
    const a = E.analyzeEnergy(base({ scenario: "spring", x0: 0.1, mus: 1.1, muk: 1.0 }));
    assert.equal(a.stays, true);
    near(a.final.PEs, 100 * 0.01, 1e-12); near(a.final.KE, 0, 0);
  });
  test("[spring energy scales with the square] doubling the compression quadruples the stored energy", () => {
    const e1 = E.analyzeEnergy(base({ scenario: "spring", x0: 0.2, mus: 0, muk: 0 })).initial.PEs;
    const e2 = E.analyzeEnergy(base({ scenario: "spring", x0: 0.4, mus: 0, muk: 0 })).initial.PEs;
    near(e2 / e1, 4, 1e-12);
  });
});

describe("object changing height", () => {
  test("[thrown up] 1 kg up at 10 m/s from the ground, g = 10: top at 5 m after 1 s, back after 2 s with the launch speed; KE + PE = 50 J throughout", () => {
    const a = E.analyzeEnergy(base({ scenario: "height", m: 1, h0: 0, v0: 10 }));
    near(a.tEnd, 2, 1e-12);
    near(a.at(1).height, 5, 1e-12); near(a.at(1).KE, 0, 1e-12); near(a.at(1).PEg, 50, 1e-12);
    near(a.final.v, -10, 1e-12); near(a.final.KE, 50, 1e-12);
    for (const t of [0, 0.3, 1, 1.6, 2]) near(a.at(t).Emech, 50, 1e-9);
  });
  test("[dropped from a height] 2 kg from 20 m: lands after 2 s at 20 m/s with KE = 400 J = mgh", () => {
    const a = E.analyzeEnergy(base({ scenario: "height", m: 2, h0: 20, v0: 0 }));
    near(a.tEnd, 2, 1e-12);
    near(a.final.v, -20, 1e-12); near(a.final.KE, 400, 1e-9);
  });
  test("[reference height] moving the zero of potential energy changes PE and the total by a constant but not KE or any change in energy", () => {
    const a0 = E.analyzeEnergy(base({ scenario: "height", m: 1, h0: 10, v0: 0, href: 0 }));
    const a1 = E.analyzeEnergy(base({ scenario: "height", m: 1, h0: 10, v0: 0, href: 4 }));
    near(a0.initial.PEg, 100, 1e-12); near(a1.initial.PEg, 60, 1e-12);
    near(a0.final.KE, a1.final.KE, 1e-12);
    near(a0.final.PEg - a0.initial.PEg, a1.final.PEg - a1.initial.PEg, 1e-12);
    assert.ok(E.analyzeEnergy(base({ scenario: "height", h0: 1, v0: 0, href: 5 })).initial.PEg < 0, "potential energy can be negative below the reference");
  });
  test("[on the ground and not rising] no motion: stays, zero energy change", () => {
    const a = E.analyzeEnergy(base({ scenario: "height", h0: 0, v0: -3 }));
    assert.equal(a.stays, true);
  });
});

describe("energy accounting", () => {
  const scenarios = () => {
    let seed = 5;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const out = [];
    for (let i = 0; i < 60; i += 1) {
      const mus = rnd();
      const muk = mus * rnd();
      const common = { m: 0.5 + rnd() * 10, g: 1 + rnd() * 20, mus, muk, duration: 8 };
      out.push(base({ ...common, scenario: "incline", theta: 5 + rnd() * 70, L: 1 + rnd() * 30, u0: 0, v0: -10 + rnd() * 20 }));
      out[out.length - 1].u0 = out[out.length - 1].L * rnd();
      out.push(base({ ...common, scenario: "flat", v0: -10 + rnd() * 20, F: -80 + rnd() * 160 }));
      out.push(base({ ...common, scenario: "spring", k: 20 + rnd() * 2000, x0: 0.05 + rnd() * 1.5 }));
      out.push(base({ ...common, scenario: "height", h0: rnd() * 100, v0: -20 + rnd() * 50, href: -5 + rnd() * 10 }));
    }
    return out;
  };
  test("[ledger] KE + PE_g + PE_s + Q - W_applied is constant over the whole motion in every scenario (240 seeded systems)", () => {
    for (const input of scenarios()) {
      const a = E.analyzeEnergy(input);
      const e0 = a.initial.Etotal - a.initial.Wapplied;
      for (let i = 0; i <= 40; i += 1) {
        const s = a.at((a.tEnd * i) / 40);
        assert.ok(s.KE >= 0, "kinetic energy is never negative");
        assert.ok(s.Q >= -1e-12, "heat is never negative");
        near(s.Etotal - s.Wapplied, e0, 1e-8 * Math.max(1, Math.abs(e0), s.KE), `${input.scenario} at ${i}/40`);
      }
    }
  });
  test("[work-energy theorem] KE(t) - KE(0) = W_gravity + W_spring + W_friction + W_applied, with each work computed separately (240 systems)", () => {
    for (const input of scenarios()) {
      const a = E.analyzeEnergy(input);
      for (const f of [0.25, 0.6, 1]) {
        const s = a.at(a.tEnd * f);
        near(s.KE - a.initial.KE, s.Wgravity + s.Wspring + s.Wfriction + s.Wapplied, 1e-8 * Math.max(1, s.KE, Math.abs(a.initial.KE)), `${input.scenario}`);
      }
    }
  });
  test("[independent work values] incline work by gravity m g (h_i - h_f) and by friction -mu m g cos(theta) d are recomputed by hand from the geometry", () => {
    const input = base({ mus: 0.3, muk: 0.2 });
    const a = E.analyzeEnergy(input);
    const s = a.at(a.tEnd * 0.5);
    const d = a.initial.pos - s.pos; // distance slid down the slope
    near(s.Wgravity, 2 * 10 * d * Math.sin(rad(30)), 1e-9);
    near(s.Wfriction, -0.2 * 2 * 10 * Math.cos(rad(30)) * d, 1e-9);
  });
  test("[energy balance as a calculator] final speed from v^2 = v0^2 + 2W/m agrees with the simulation, and a negative result is refused", () => {
    const a = E.analyzeEnergy(base({ mus: 0.3, muk: 0.2 }));
    const W = a.final.Wgravity + a.final.Wfriction;
    near(E.speedFromEnergy(2, 0, W), Math.abs(a.final.v), 1e-9);
    assert.equal(E.speedFromEnergy(2, 1, -5), null);
  });
  test("[heat is not lost energy] friction lowers mechanical energy by exactly the heat produced; total stays constant", () => {
    const a = E.analyzeEnergy(base({ scenario: "flat", m: 4, v0: 6, mus: 0.3, muk: 0.25, F: 0 }));
    near(a.initial.Emech - a.final.Emech, a.final.Q, 1e-9);
    near(a.final.Etotal, a.initial.Etotal, 1e-9);
  });
});

describe("validation", () => {
  test("[inputs] accepts the defaults and rejects out-of-range, contradictory and non-numeric values", () => {
    assert.equal(E.validateEnergyInput(base()).ok, true);
    for (const bad of [{ m: 0 }, { m: "2" }, { scenario: "orbit" }, { theta: 0 }, { theta: 85 }, { L: 0 }, { u0: 9, L: 5 }, { k: 0 }, { x0: 0 }, { x0: 6 }, { h0: -1 }, { mus: 0.1, muk: 0.5 }, { F: 900 }, { g: 0 }, { duration: 0 }, { href: 5000 }, { v0: NaN }]) {
      assert.equal(E.validateEnergyInput({ ...base(), ...bad }).ok, false, JSON.stringify(bad));
    }
    assert.equal(E.validateEnergyInput(null).ok, false);
    assert.deepEqual(Object.keys(E.validateEnergyInput({ ...base(), extra: 1 }).value).sort(), Object.keys(base()).sort());
  });
});
