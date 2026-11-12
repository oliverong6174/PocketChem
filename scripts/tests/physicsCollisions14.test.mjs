// Stage 14: one-dimensional collisions. Expected values are hand-derived from conservation of momentum and the restitution law.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let C;
before(async () => { C = await loadModule("/src/utils/physics/collisions.ts"); });
after(async () => { await closeEngine(); });

const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const base = (o = {}) => ({ ...C.DEFAULT_COLLISION_INPUT, ...o });
const solve = (o) => C.solveCollision(base(o));

describe("final velocities", () => {
  test("[elastic, equal masses] equal masses exchange velocities: 2 kg at +3 and 2 kg at -1 leave at -1 and +3", () => {
    const r = solve({ mA: 2, mB: 2, vA: 3, vB: -1, e: 1 });
    near(r.vA2, -1, 1e-12); near(r.vB2, 3, 1e-12);
  });
  test("[elastic, unequal] 2 kg at +4 hits 3 kg at -1: v_A' = ((mA - mB) vA + 2 mB vB)/M = -2, v_B' = ((mB - mA) vB + 2 mA vA)/M = +3; kinetic energy 17.5 J before and after", () => {
    const r = solve({ mA: 2, mB: 3, vA: 4, vB: -1, e: 1 });
    near(r.vA2, -2, 1e-12); near(r.vB2, 3, 1e-12);
    near(r.KEbefore, 17.5, 1e-12); near(r.KEafter, 17.5, 1e-12); near(r.lossJ, 0, 1e-12);
    assert.equal(r.kind, "elastic");
  });
  test("[perfectly inelastic] same bodies: they move together at p/M = 5/5 = 1 m/s; kinetic energy falls from 17.5 J to 2.5 J, a loss of 15 J = 1/2 mu (vA - vB)^2 with mu = 1.2 kg", () => {
    const r = solve({ mA: 2, mB: 3, vA: 4, vB: -1, e: 0 });
    near(r.vA2, 1, 1e-12); near(r.vB2, 1, 1e-12);
    near(r.KEafter, 2.5, 1e-12); near(r.lossJ, 15, 1e-12);
    near(r.lossJ, 0.5 * 1.2 * 25, 1e-12);
    assert.equal(r.kind, "perfectly inelastic");
    near(r.vA2, r.vcm, 1e-12);
  });
  test("[partial, e = 0.5] v_A' = -0.5, v_B' = +2: the separation speed 2.5 is e times the approach speed 5; kinetic energy 6.25 J, loss 11.25 J = 1/2 mu (1 - e^2) 25", () => {
    const r = solve({ mA: 2, mB: 3, vA: 4, vB: -1, e: 0.5 });
    near(r.vA2, -0.5, 1e-12); near(r.vB2, 2, 1e-12);
    near(r.vB2 - r.vA2, 0.5 * 5, 1e-12);
    near(r.KEafter, 6.25, 1e-12); near(r.lossJ, 11.25, 1e-12);
    near(r.lossJ, 0.5 * 1.2 * (1 - 0.25) * 25, 1e-12);
    assert.equal(r.kind, "partially inelastic");
  });
  test("[restitution is not the kinetic-energy ratio] e = 0.5 keeps 6.25/17.5 = 35.7 % of the kinetic energy, not 50 % or 25 %", () => {
    const r = solve({ mA: 2, mB: 3, vA: 4, vB: -1, e: 0.5 });
    near(r.KEafter / r.KEbefore, 6.25 / 17.5, 1e-12);
    assert.ok(Math.abs(r.KEafter / r.KEbefore - 0.5) > 0.1 && Math.abs(r.KEafter / r.KEbefore - 0.25) > 0.1);
  });
  test("[light hits heavy] 1 kg at 10 m/s on a 1000 kg body at rest, elastic: it bounces back at 10*(999/1001) = 9.980 m/s and the heavy body gets 2*10/1001 = 0.01998 m/s", () => {
    const r = solve({ mA: 1, mB: 1000, vA: 10, vB: 0, e: 1 });
    near(r.vA2, -10 * 999 / 1001, 1e-12); near(r.vB2, 20 / 1001, 1e-12);
  });
  test("[heavy hits light] 1000 kg at 10 m/s on a 1 kg body at rest, elastic: the light body leaves at 2*1000*10/1001 = 19.98 m/s (nearly twice the speed), the heavy body barely slows", () => {
    const r = solve({ mA: 1000, mB: 1, vA: 10, vB: 0, e: 1 });
    near(r.vB2, 20000 / 1001, 1e-12); near(r.vA2, 9990 / 1001, 1e-12);
  });
  test("[heavy hits light, perfectly inelastic] 1000 kg at 10 m/s sticks to 1 kg: both at 10000/1001 = 9.99 m/s", () => {
    const r = solve({ mA: 1000, mB: 1, vA: 10, vB: 0, e: 0 });
    near(r.vA2, 10000 / 1001, 1e-12);
  });
  test("[both moving the same way] A faster than B: 1 kg at 6 and 2 kg at 2, e = 1: v_A' = (-1*... ) = ((1-2)*6 + 2*2*2)/3 = 0.667, v_B' = ((2-1)*2 + 2*1*6)/3 = 4.667", () => {
    const r = solve({ mA: 1, mB: 2, vA: 6, vB: 2, e: 1 });
    near(r.vA2, ((1 - 2) * 6 + 2 * 2 * 2) / 3, 1e-12); near(r.vB2, ((2 - 1) * 2 + 2 * 1 * 6) / 3, 1e-12);
  });
  test("[opposite directions, e = 0 with equal speeds] equal masses meeting at +5 and -5 stop dead: momentum 0, centre-of-mass velocity 0", () => {
    const r = solve({ mA: 3, mB: 3, vA: 5, vB: -5, e: 0 });
    near(r.vA2, 0, 1e-12); near(r.vB2, 0, 1e-12); near(r.vcm, 0, 1e-12); near(r.KEafter, 0, 1e-12);
  });
});

describe("conserved and changing quantities", () => {
  const random = () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    return Array.from({ length: 400 }, () => base({ mA: 0.1 + rnd() * 50, mB: 0.1 + rnd() * 50, vA: -20 + rnd() * 40, vB: -20 + rnd() * 40, e: [0, 1, rnd()][Math.floor(rnd() * 3)], xA: -10, xB: -10 + 1 + rnd() * 20 }));
  };
  test("[momentum] total momentum is identical before and after, and at every time of the trace, for 400 seeded collisions", () => {
    for (const input of random()) {
      const r = C.solveCollision(input);
      for (const s of C.traceCollision(input, r, 40)) near(s.p, r.pTotal, 1e-9 * Math.max(1, Math.abs(r.pTotal)));
      near(input.mA * r.vA2 + input.mB * r.vB2, input.mA * input.vA + input.mB * input.vB, 1e-9 * Math.max(1, Math.abs(r.pTotal)));
    }
  });
  test("[restitution relation and energy] relative separation speed = e x approach speed; the kinetic energy never rises; e = 1 conserves it", () => {
    for (const input of random()) {
      const r = C.solveCollision(input);
      if (!r.collides) continue;
      near(r.vB2 - r.vA2, input.e * (input.vA - input.vB), 1e-9 * Math.max(1, Math.abs(input.vA - input.vB)));
      assert.ok(r.KEafter <= r.KEbefore + 1e-9 * Math.max(1, r.KEbefore));
      if (input.e === 1) near(r.lossJ, 0, 1e-9 * Math.max(1, r.KEbefore));
      const mu = (input.mA * input.mB) / (input.mA + input.mB);
      near(r.lossJ, 0.5 * mu * (1 - input.e * input.e) * (input.vA - input.vB) ** 2, 1e-8 * Math.max(1, r.KEbefore));
    }
  });
  test("[centre of mass] the centre-of-mass velocity p/M is unchanged by the collision and equals the velocity of the combined body when e = 0", () => {
    const r = solve({ mA: 2, mB: 3, vA: 4, vB: -1, e: 0.5 });
    near(r.vcm, 1, 1e-12);
    near((2 * r.vA2 + 3 * r.vB2) / 5, 1, 1e-12);
  });
  test("[impulse] J = m_B (v_B' - v_B) = 3(3 - (-1)) = 12 N s = -m_A (v_A' - v_A) = mu (1 + e) (vA - vB) = 1.2 * 2 * 5; the momentum changes are equal and opposite", () => {
    const r = solve({ mA: 2, mB: 3, vA: 4, vB: -1, e: 1 });
    near(r.J, 12, 1e-12); near(r.dpB, 12, 1e-12); near(r.dpA, -12, 1e-12);
    near(r.J, 1.2 * 2 * 5, 1e-12);
    const inel = solve({ mA: 2, mB: 3, vA: 4, vB: -1, e: 0 });
    near(inel.J, 1.2 * 5, 1e-12);
  });
  test("[average force only with a duration] no duration -> null; 12 N s over 0.02 s -> 600 N", () => {
    assert.equal(solve({ mA: 2, mB: 3, vA: 4, vB: -1, e: 1 }).averageForce, null);
    near(solve({ mA: 2, mB: 3, vA: 4, vB: -1, e: 1, contactTime: 0.02 }).averageForce, 600, 1e-9);
    assert.equal(solve({ vA: 1, vB: 3, contactTime: 0.02 }).averageForce, null);
  });
  test("[mass ratio] a much lighter A rebounds (v_A' < 0) off a heavy B at rest, a much heavier A continues forward (v_A' > 0); equal masses at e = 1 stop A", () => {
    assert.ok(solve({ mA: 1, mB: 10, vA: 5, vB: 0, e: 1 }).vA2 < 0);
    assert.ok(solve({ mA: 10, mB: 1, vA: 5, vB: 0, e: 1 }).vA2 > 0);
    near(solve({ mA: 4, mB: 4, vA: 5, vB: 0, e: 1 }).vA2, 0, 1e-12);
  });
  test("[which dissipates more] with the same bodies, lower e loses more kinetic energy: e = 0 > e = 0.5 > e = 1", () => {
    const losses = [0, 0.5, 1].map((e) => solve({ mA: 2, mB: 3, vA: 4, vB: -1, e }).lossJ);
    assert.ok(losses[0] > losses[1] && losses[1] > losses[2]);
  });
});

describe("when a collision happens", () => {
  test("[timing] A at -4 m moving +4 m/s, B at +3 m moving -1 m/s, 1 m wide: the faces are 6 m apart, closing at 5 m/s, so they touch at t = 1.2 s with centres at 0.8 m and 1.8 m", () => {
    const r = solve({});
    near(r.tc, 1.2, 1e-12); near(r.xAc, 0.8, 1e-12); near(r.xBc, 1.8, 1e-12);
    near(r.xBc - r.xAc, C.BODY_WIDTH, 1e-12);
    near(r.tEnd, 1.2 + 4, 1e-12);
  });
  test("[touching and closing] already in contact and closing: the collision is at t = 0", () => {
    near(solve({ xA: 0, xB: 1, vA: 2, vB: 0 }).tc, 0, 0);
  });
  test("[separating] A moving away from B, or slower than B: no collision, velocities unchanged, no impulse, no energy change", () => {
    for (const o of [{ vA: 1, vB: 3 }, { vA: -2, vB: 0 }, { vA: -3, vB: 2 }]) {
      const r = solve(o);
      assert.equal(r.collides, false, JSON.stringify(o));
      assert.equal(r.tc, null);
      assert.match(r.reason, /no collision/);
      near(r.vA2, o.vA, 0); near(r.vB2, o.vB, 0); near(r.lossJ, 0, 1e-12); near(r.dpA, 0, 1e-12);
      assert.equal(r.averageForce, null);
    }
  });
  test("[zero closing speed] equal velocities never meet: no collision; both at rest too", () => {
    assert.equal(solve({ vA: 2, vB: 2 }).collides, false);
    assert.match(solve({ vA: 2, vB: 2 }).reason, /same velocity/);
    assert.equal(solve({ vA: 0, vB: 0 }).collides, false);
  });
  test("[no collision trace] positions follow straight lines the whole time, momentum constant, no jump", () => {
    const input = base({ vA: -1, vB: 2, span: 3 });
    const r = C.solveCollision(input);
    const tr = C.traceCollision(input, r, 30);
    for (const s of tr) { near(s.xA, input.xA - s.t, 1e-12); near(s.xB, input.xB + 2 * s.t, 1e-12); assert.equal(s.after, false); }
    near(r.tEnd, 3, 1e-12);
  });
  test("[piecewise motion] positions are continuous through the collision; velocities change only at t_c; afterwards x = x_c + v' (t - t_c)", () => {
    const input = base({});
    const r = C.solveCollision(input);
    const before = C.stateAt(input, r, r.tc - 1e-9);
    const at = C.stateAt(input, r, r.tc);
    near(before.xA, at.xA, 1e-8); near(before.xB, at.xB, 1e-8);
    near(before.vA, 4, 0); near(at.vA, -2, 1e-12);
    const later = C.stateAt(input, r, r.tc + 2);
    near(later.xA, r.xAc + 2 * r.vA2, 1e-12); near(later.xB, r.xBc + 2 * r.vB2, 1e-12);
    // bodies separate after an elastic collision and never overlap before it
    assert.ok(later.xB - later.xA > C.BODY_WIDTH);
    for (const s of C.traceCollision(input, r, 100)) if (!s.after) assert.ok(s.xB - s.xA >= C.BODY_WIDTH - 1e-9);
  });
  test("[perfectly inelastic after] the two bodies stay in contact and move together", () => {
    const input = base({ e: 0 });
    const r = C.solveCollision(input);
    const later = C.stateAt(input, r, r.tc + 3);
    near(later.xB - later.xA, C.BODY_WIDTH, 1e-9);
    near(later.vA, later.vB, 1e-12);
  });
  test("[trace includes the contact instant] the jump in velocity is drawn at t_c", () => {
    const input = base({});
    const r = C.solveCollision(input);
    const tr = C.traceCollision(input, r, 20);
    assert.ok(tr.some((s) => s.t === r.tc));
    for (let i = 1; i < tr.length; i += 1) assert.ok(tr[i].t >= tr[i - 1].t);
  });
});

describe("validation", () => {
  test("[inputs] accepts the default and rejects overlap, B left of A, bad restitution, bad masses and non-numbers; contact time may be null", () => {
    assert.equal(C.validateCollisionInput(base()).ok, true);
    for (const bad of [{ mA: 0 }, { mB: -1 }, { mA: "2" }, { e: 1.2 }, { e: -0.1 }, { xB: -3.5 }, { xB: -4.5 }, { xA: 5 }, { vA: 100 }, { span: 0 }, { contactTime: 0 }, { contactTime: -1 }, { contactTime: undefined }, { vB: NaN }]) {
      assert.equal(C.validateCollisionInput({ ...base(), ...bad }).ok, false, JSON.stringify(bad));
    }
    assert.equal(C.validateCollisionInput({ ...base(), xB: -3 }).ok, true, "faces exactly touching is allowed");
    assert.equal(C.validateCollisionInput({ ...base(), contactTime: 0.05 }).ok, true);
    assert.equal(C.validateCollisionInput(null).ok, false);
    assert.deepEqual(Object.keys(C.validateCollisionInput({ ...base(), extra: 1 }).value).sort(), Object.keys(base()).sort());
  });
});
