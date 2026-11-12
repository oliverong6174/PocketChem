// Stage 14: forces and Newton's laws. Expected values are hand-derived (g = 10 m/s^2 where convenient), not taken from the implementation.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let F;
before(async () => { F = await loadModule("/src/utils/physics/forces.ts"); });
after(async () => { await closeEngine(); });

const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const base = (o = {}) => ({ ...F.DEFAULT_FORCE_INPUT, g: 10, ...o });
const force = (m, id) => m.forces.find((f) => f.id === id);
const rad = (d) => (d * Math.PI) / 180;

describe("decomposition and the force table", () => {
  test("[vectors] 100 N at 30 degrees has components 86.603 and 50; at 90 degrees the x component is exactly 0", () => {
    const c = F.decompose(100, 30);
    near(c.x, 100 * Math.cos(rad(30)), 1e-12); near(c.y, 50, 1e-12);
    assert.equal(F.decompose(100, 90).x, 0);
    assert.equal(F.decompose(100, 0).y, 0);
  });
  test("[incline] the weight splits into mg sin(theta) along and mg cos(theta) into the surface: 10 kg, 30 degrees, g = 10 -> 50 N and 86.603 N", () => {
    const a = F.analyzeForces(base({ m: 10, theta: 30, F: 0, mus: 0.9, muk: 0.8 }));
    near(a.parallel, 50, 1e-9); near(a.perpendicular, 100 * Math.cos(rad(30)), 1e-9);
    const w = force(a.at(0), "weight");
    near(w.x, -50, 1e-9); near(w.y, -86.60254, 1e-4);
    near(w.magnitude, 100, 1e-9);
  });
  test("[Newton II] the force components add to M*a for 300 seeded random surface systems and pulley systems", () => {
    let seed = 9;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let i = 0; i < 300; i += 1) {
      const mus = rnd() * 1.5;
      const input = base({ mode: i % 3 === 0 ? "pulley" : "surface", m: 0.5 + rnd() * 20, m2: 0.5 + rnd() * 20, theta: rnd() * 60, F: rnd() * 100, phi: -40 + rnd() * 80, mus, muk: mus * rnd(), v0: i % 2 ? 0 : -5 + rnd() * 10 });
      const a = F.analyzeForces(input);
      if (!a.contact) continue;
      for (const t of [0, 0.3, 1.7]) {
        const m = a.at(t);
        near(m.net.x, input.m * m.a, 1e-8 * Math.max(1, Math.abs(input.m * m.a)), `net x at ${t}`);
        near(m.net.y, 0, 1e-8 * Math.max(1, a.weight));
      }
    }
  });
});

describe("horizontal systems and friction", () => {
  test("[static, below threshold] 5 kg, mu_s = 0.5, push 20 N: friction is 20 N (not mu_s N = 25 N), no acceleration", () => {
    const a = F.analyzeForces(base({ F: 20 }));
    near(a.normal, 50, 1e-12); near(a.staticMax, 25, 1e-12);
    const m = a.at(0);
    assert.equal(m.state, "rest"); assert.equal(m.friction.kind, "static");
    near(m.friction.value, -20, 1e-12); near(m.a, 0, 0); near(m.net.magnitude, 0, 1e-12);
    for (const Fa of [0, 5, 12.5, 24.9]) near(F.analyzeForces(base({ F: Fa })).at(0).friction.value, -Fa, 1e-12, `F=${Fa}`);
  });
  test("[impending motion] a push of exactly mu_s N = 25 N is still static, flagged on the verge of sliding", () => {
    const a = F.analyzeForces(base({ F: 25 }));
    assert.equal(a.verge, true);
    assert.equal(a.at(0).state, "verge");
    near(a.at(5).x, 0, 0);
  });
  test("[onset of sliding] 30 N exceeds 25 N: kinetic friction mu_k N = 15 N opposes it and a = (30 - 15)/5 = 3 m/s^2; x(2) = 6 m, v(2) = 6 m/s", () => {
    const a = F.analyzeForces(base({ F: 30 }));
    const m0 = a.at(0);
    assert.equal(m0.state, "sliding"); assert.equal(m0.friction.kind, "kinetic");
    near(m0.friction.value, -15, 1e-12); near(m0.a, 3, 1e-12);
    const m2 = a.at(2);
    near(m2.x, 6, 1e-12); near(m2.v, 6, 1e-12);
    near(m2.net.x, 15, 1e-12);
  });
  test("[kinetic friction direction] moving left (v0 = -3) with no applied force: friction pushes right, 15 N; it stops after 1.0 s, 1.5 m away, then stays at rest with zero friction", () => {
    const a = F.analyzeForces(base({ F: 0, v0: -3 }));
    near(a.at(0).friction.value, 15, 1e-12); near(a.at(0).a, 3, 1e-12);
    near(a.at(1).x, -1.5, 1e-9); near(a.at(1).v, 0, 1e-9);
    const rest = a.at(3);
    near(rest.x, -1.5, 1e-9); assert.equal(rest.v, 0); assert.equal(rest.state, "rest"); near(rest.friction.value, 0, 1e-12);
  });
  test("[net force zero is not zero velocity] pushing 15 N while sliding at 4 m/s with mu_k N = 15 N: constant velocity, no acceleration", () => {
    const a = F.analyzeForces(base({ F: 15, v0: 4 }));
    const m = a.at(2);
    assert.equal(m.state, "constant-velocity");
    near(m.a, 0, 1e-12); near(m.v, 4, 1e-12); near(m.x, 8, 1e-12); near(m.net.magnitude, 0, 1e-12);
  });
  test("[sliding and still pushed] moving right at 6 m/s with a 40 N push and mu_k N = 15 N: friction stays 15 N to the left and a = (40 - 15)/5 = 5 m/s^2, so v(2) = 16 m/s", () => {
    const a = F.analyzeForces(base({ F: 40, v0: 6 }));
    assert.equal(a.at(0).state, "sliding");
    near(a.at(0).a, 5, 1e-12); near(a.at(0).friction.value, -15, 1e-12); near(a.at(2).v, 16, 1e-12);
  });
  test("[frictionless] mu = 0: a = F/m exactly and v(t) = a t", () => {
    const a = F.analyzeForces(base({ F: 12, mus: 0, muk: 0, m: 4 }));
    near(a.at(0).a, 3, 1e-12); near(a.at(2).v, 6, 1e-12);
  });
  test("[Newton third-law pair] normal force equals weight on a flat surface with no vertical applied force: N = mg = 50 N", () => {
    near(F.analyzeForces(base({ F: 0 })).normal, 50, 1e-12);
  });
});

describe("normal force is not always mg", () => {
  test("[incline] N = mg cos(theta): 10 kg at 30 degrees -> 86.60 N, not 100 N", () => {
    near(F.analyzeForces(base({ m: 10, theta: 30, F: 0 })).normal, 86.60254, 1e-4);
  });
  test("[pulling upward] 10 kg flat, 40 N at 30 degrees above horizontal: N = 100 - 40 sin30 = 80 N; friction limit 0.5*80 = 40 N exceeds the horizontal pull 34.64 N, so the body stays at rest with f = 34.64 N", () => {
    const a = F.analyzeForces(base({ m: 10, F: 40, phi: 30 }));
    near(a.normal, 80, 1e-9); near(a.staticMax, 40, 1e-9);
    const m = a.at(0);
    assert.equal(m.state, "rest");
    near(m.friction.value, -40 * Math.cos(rad(30)), 1e-9);
  });
  test("[pushing down] 10 kg flat, 40 N pushing down at 30 degrees: N = 100 + 20 = 120 N", () => {
    near(F.analyzeForces(base({ m: 10, F: 40, phi: -30 })).normal, 120, 1e-9);
  });
  test("[incline with a pull up the slope] 10 kg, 30 degrees, pulled 40 N parallel: driving force 40 - 50 = -10 N, within mu_s N = 0.5*86.6 = 43 N, so at rest with friction +10 N (up-slope)", () => {
    const a = F.analyzeForces(base({ m: 10, theta: 30, F: 40, phi: 0 }));
    near(a.driving, -10, 1e-9);
    const m = a.at(0);
    assert.equal(m.state, "rest"); near(m.friction.value, 10, 1e-9);
  });
  test("[contact lost] 1 kg, 30 N straight up (phi = 90): N would be 10 - 30 = -20 N, so N = 0, no friction, and the net force is 20 N upward (a = 20 m/s^2), weight and applied force only", () => {
    const a = F.analyzeForces(base({ m: 1, F: 30, phi: 90 }));
    assert.equal(a.contact, false);
    near(a.normalRaw, -20, 1e-9); assert.equal(a.normal, 0);
    const m = a.at(0);
    assert.equal(m.state, "airborne"); assert.equal(m.friction.kind, "none"); assert.equal(m.friction.value, 0);
    assert.deepEqual(m.forces.map((f) => f.id), ["weight", "applied"]);
    near(m.net.y, 20, 1e-9); near(m.a, 0, 1e-12);
    near(a.at(2).y, 0.5 * 20 * 4, 1e-9);
  });
  test("[contact exactly lost] N = 0 exactly (10 N straight up on a 1 kg body): still touching with zero normal force and zero friction", () => {
    const a = F.analyzeForces(base({ m: 1, F: 10, phi: 90 }));
    assert.equal(a.contact, true); assert.equal(a.normal, 0);
    near(a.at(0).friction.value, 0, 1e-12);
  });
});

describe("inclined planes", () => {
  test("[stays] 10 kg, 30 degrees, mu_s = 0.7: the 50 N down-slope pull is below mu_s N = 60.6 N, so it rests and static friction is 50 N up the slope", () => {
    const a = F.analyzeForces(base({ m: 10, theta: 30, F: 0, mus: 0.7, muk: 0.5 }));
    const m = a.at(0);
    assert.equal(m.state, "rest"); near(m.friction.value, 50, 1e-9);
    near(a.staticMax, 0.7 * 86.60254, 1e-4);
  });
  test("[slides] mu_s = 0.5 (limit 43.3 N < 50 N): slides down with kinetic friction 0.4*86.6 = 34.64 N up-slope, a = (-50 + 34.64)/10 = -1.536 m/s^2 (down the slope)", () => {
    const a = F.analyzeForces(base({ m: 10, theta: 30, F: 0, mus: 0.5, muk: 0.4 }));
    const m = a.at(0);
    assert.equal(m.state, "sliding");
    near(m.friction.value, 0.4 * 86.60254, 1e-4); near(m.a, (-50 + 0.4 * 86.60254) / 10, 1e-4);
    near(a.at(2).x, 0.5 * m.a * 4, 1e-4);
  });
  test("[critical angle] a body at rest begins to slide exactly when tan(theta) exceeds mu_s: mu_s = 0.5 -> 26.565 degrees", () => {
    const crit = (Math.atan(0.5) * 180) / Math.PI;
    assert.equal(F.analyzeForces(base({ theta: crit - 0.01, F: 0, mus: 0.5, muk: 0.4 })).at(0).state, "rest");
    assert.equal(F.analyzeForces(base({ theta: crit + 0.01, F: 0, mus: 0.5, muk: 0.4 })).at(0).state, "sliding");
  });
  test("[frictionless incline] a = -g sin(theta) down the slope: 30 degrees -> -5 m/s^2", () => {
    near(F.analyzeForces(base({ theta: 30, F: 0, mus: 0, muk: 0 })).at(0).a, -5, 1e-9);
  });
  test("[force reversal on a slope] up the slope at 5 m/s: friction down-slope, a = (-10 - 3.464)/2 = -6.732 m/s^2, stops at t = 0.7427 s, 1.857 m up; the weight component then beats static friction (10 N > 5.2 N) and it slides back with kinetic friction up-slope, a = -3.268 m/s^2", () => {
    const a = F.analyzeForces(base({ m: 2, theta: 30, F: 0, mus: 0.3, muk: 0.2, v0: 5 }));
    const N = 20 * Math.cos(rad(30));
    const a1 = (-10 - 0.2 * N) / 2;
    const t1 = 5 / -a1;
    const x1 = 25 / (2 * -a1);
    near(a.at(0).a, a1, 1e-9); near(a.at(0).friction.value, -0.2 * N, 1e-9);
    near(a.at(t1).x, x1, 1e-9); near(a.at(t1).v, 0, 1e-9);
    const a2 = (-10 + 0.2 * N) / 2;
    const later = a.at(t1 + 1);
    near(later.a, a2, 1e-9); near(later.v, a2, 1e-9); near(later.x, x1 + 0.5 * a2, 1e-9);
    near(later.friction.value, 0.2 * N, 1e-9);
    // after reversal the friction direction has flipped
    assert.ok(a.at(0.1).friction.value < 0 && later.friction.value > 0);
  });
  test("[force reversal, stays] with mu_s = 0.7 the same body stops and then stays at rest (static friction 10 N)", () => {
    const a = F.analyzeForces(base({ m: 2, theta: 30, F: 0, mus: 0.7, muk: 0.5, v0: 5 }));
    const rest = a.at(50);
    assert.equal(rest.state, "rest"); near(rest.v, 0, 1e-12); near(rest.friction.value, 10, 1e-9); assert.equal(rest.friction.kind, "static");
  });
});

describe("two bodies and tension", () => {
  test("[static] 4 kg on a table, 2 kg hanging, mu_s = 0.5: the hanging weight 20 N equals mu_s m g = 20 N, so nothing moves, T = 20 N, friction -20 N", () => {
    const a = F.analyzeForces(base({ mode: "pulley", m: 4, m2: 2 }));
    const m = a.at(0);
    assert.equal(a.verge, true);
    near(m.tension, 20, 1e-12); near(m.friction.value, -20, 1e-12); near(m.a, 0, 0);
  });
  test("[sliding] 4 kg and 3 kg, mu_k = 0.3: a = (30 - 12)/7 = 2.571 m/s^2, T = 3(10 - a) = 22.29 N; the block obeys T - 12 = 4a", () => {
    const a = F.analyzeForces(base({ mode: "pulley", m: 4, m2: 3 }));
    const m = a.at(0);
    near(m.a, 18 / 7, 1e-12); near(m.tension, 3 * (10 - 18 / 7), 1e-12);
    near(m.tension - 12, 4 * m.a, 1e-12);
    near(F.pulleyAcceleration(4, 3, 10, 0.3), 18 / 7, 1e-12);
    near(a.at(2).x, 0.5 * (18 / 7) * 4, 1e-12);
  });
  test("[frictionless Atwood-like table] mu = 0: a = m2 g/(m + m2) and T = m m2 g/(m + m2) (4 kg, 2 kg: 3.333 m/s^2, 13.33 N)", () => {
    const m = F.analyzeForces(base({ mode: "pulley", m: 4, m2: 2, mus: 0, muk: 0 })).at(0);
    near(m.a, 20 / 6, 1e-12); near(m.tension, 4 * 20 / 6, 1e-12);
  });
  test("[block moving away from the pulley] v0 = -2: friction pushes toward the pulley, so the block decelerates at (20 + 12)/6 = 5.333 m/s^2, then reverses toward the pulley when the hanging weight beats static friction", () => {
    const a = F.analyzeForces(base({ mode: "pulley", m: 4, m2: 2, mus: 0.4, muk: 0.3, v0: -2 }));
    near(a.at(0).a, (20 + 12) / 6, 1e-12);
    const t1 = 2 / ((20 + 12) / 6);
    near(a.at(t1).v, 0, 1e-9);
    assert.ok(a.at(t1 + 1).v > 0);
  });
  test("[tension label] a rope pull labelled tension has the same physics as an applied force", () => {
    const a = F.analyzeForces(base({ F: 30, kind: "applied" }));
    const b = F.analyzeForces(base({ F: 30, kind: "tension" }));
    near(a.at(1).a, b.at(1).a, 0);
    assert.equal(b.at(0).forces.find((f) => f.id === "applied").label, "Tension");
    near(b.at(0).tension, 30, 0);
  });
});

describe("motion engine and validation", () => {
  test("[piecewise motion] first time to reach a position: from rest at a = 3 m/s^2, x = 6 m at t = 2 s; a decelerating slide never reaches beyond its stopping distance", () => {
    const up = F.buildSlide({ P: 30, M: 5, N: 50, mus: 0.5, muk: 0.3, v0: 0 });
    near(F.firstReach(up, 6), 2, 1e-12);
    const dec = F.buildSlide({ P: 0, M: 5, N: 50, mus: 0.5, muk: 0.3, v0: 3 });
    assert.equal(F.firstReach(dec, 2), null);
    near(F.firstReach(dec, 1.5), 1, 1e-9);
  });
  test("[validation] rejects non-numbers, out-of-range values, mu_k greater than mu_s and unknown modes; keeps only known fields", () => {
    const ok = base();
    assert.equal(F.validateForceInput(ok).ok, true);
    for (const bad of [{ m: 0 }, { m: "5" }, { theta: 85 }, { theta: -1 }, { F: -5 }, { phi: 100 }, { mus: 0.2, muk: 0.5 }, { g: 0 }, { v0: 500 }, { duration: 0 }, { mode: "ramp" }, { kind: "push" }, { F: NaN }]) {
      assert.equal(F.validateForceInput({ ...ok, ...bad }).ok, false, JSON.stringify(bad));
    }
    assert.equal(F.validateForceInput(null).ok, false);
    assert.deepEqual(Object.keys(F.validateForceInput({ ...ok, extra: 1 }).value).sort(), Object.keys(ok).sort());
  });
  test("[state text] every state has a plain-language description", () => {
    for (const s of ["rest", "verge", "sliding", "constant-velocity", "airborne"]) assert.ok(F.describeState(s).length > 5);
  });
});
