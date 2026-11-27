// Stage 24: electrostatics. Expected values are hand-derived (Coulomb's law, symmetry, closed forms, an independent numerical line
// integral) and are not produced by the module's own formulas.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

const E = await loadModule("/src/utils/physics/electrostatics.ts");
after(async () => { await closeEngine(); });

const near = (a, b, rel, abs = 0, msg = "") => assert.ok(Math.abs(a - b) <= Math.max(rel * Math.abs(b), abs), `${msg} expected ${b}, got ${a}`);
const K = 8.9875517923e9; // typed independently
const ch = (id, q, x, y) => ({ id, q, x, y });

describe("constants and Coulomb's law", () => {
  test("kₑ = 1/(4π ε₀)", () => { near(E.K_E, 1 / (4 * Math.PI * 8.8541878128e-12), 1e-9); near(E.K_E, K, 1e-9); });
  test("two 1 µC charges 10 cm apart: F = 0.8988 N", () => near(E.coulombMagnitude(1e-6, 1e-6, 0.1), (K * 1e-12) / 0.01, 1e-12));
  test("like charges repel: the force on the second points away from the first", () => {
    const f = E.coulombForceOn(ch("b", 1e-6, 0.1, 0), ch("a", 1e-6, 0, 0));
    near(f.x, 0.898755, 1e-5); assert.ok(Math.abs(f.y) < 1e-12);
  });
  test("unlike charges attract: the force on the second points toward the first", () => {
    const f = E.coulombForceOn(ch("b", -1e-6, 0.1, 0), ch("a", 1e-6, 0, 0));
    assert.ok(f.x < 0); near(f.x, -0.898755, 1e-5);
  });
  test("Newton's third law: equal and opposite forces", () => {
    const a = ch("a", 3e-9, -0.3, 0.2), b = ch("b", -5e-9, 0.4, -0.1);
    const fab = E.coulombForceOn(b, a), fba = E.coulombForceOn(a, b);
    near(fab.x, -fba.x, 1e-12); near(fab.y, -fba.y, 1e-12);
  });
  test("inverse square: doubling the separation quarters the force, tripling divides by nine", () => {
    const f1 = E.coulombMagnitude(2e-9, 3e-9, 0.5);
    near(E.coulombMagnitude(2e-9, 3e-9, 1.0), f1 / 4, 1e-12); near(E.coulombMagnitude(2e-9, 3e-9, 1.5), f1 / 9, 1e-12);
  });
  test("force is proportional to each charge", () => near(E.coulombMagnitude(4e-9, 3e-9, 0.5) / E.coulombMagnitude(2e-9, 3e-9, 0.5), 2, 1e-12));
  test("vector superposition: symmetric pair on the perpendicular bisector", () => {
    const src = [ch("a", 2e-9, -1, 0), ch("b", 2e-9, 1, 0), ch("t", 1e-9, 0, 1)];
    const f = E.netForceOn(src, "t");
    const each = (K * 2e-9 * 1e-9) / 2; // r² = 2
    near(f.y, 2 * each * Math.SQRT1_2, 1e-9); assert.ok(Math.abs(f.x) < 1e-15);
  });
  test("a 3-4-5 arrangement matches the hand-resolved components", () => {
    const src = [ch("a", 1e-6, 0, 0), ch("b", 1e-6, 4, 0), ch("t", 1e-6, 0, 3)];
    const fa = (K * 1e-12) / 9; // along +y
    const fb = (K * 1e-12) / 25; // from (4,0) to (0,3): direction (−4, 3)/5
    const f = E.netForceOn(src, "t");
    near(f.x, -fb * 0.8, 1e-9); near(f.y, fa + fb * 0.6, 1e-9);
  });
  test("coincident charges are singular and rejected, not clamped", () => {
    assert.throws(() => E.coulombForceOn(ch("a", 1e-9, 1, 1), ch("b", 1e-9, 1, 1)));
    assert.throws(() => E.coulombMagnitude(1e-9, 1e-9, 0));
    assert.equal(E.validateCharges([ch("a", 1e-9, 1, 1), ch("b", 1e-9, 1, 1)]).ok, false);
  });
});

describe("electric field", () => {
  const src = [ch("a", 2e-9, 0, 0)];
  test("single positive charge: E = kq/r² pointing away", () => {
    const f = E.fieldAt(src, { x: 0.5, y: 0 });
    assert.equal(f.ok, true); near(f.E.x, (K * 2e-9) / 0.25, 1e-9); assert.ok(Math.abs(f.E.y) < 1e-9); near(f.magnitude, 71.9, 1e-3);
  });
  test("single negative charge: E points toward the charge", () => {
    const f = E.fieldAt([ch("a", -2e-9, 0, 0)], { x: 0, y: -0.5 });
    assert.ok(f.E.y > 0); assert.ok(Math.abs(f.E.x) < 1e-9);
  });
  test("the field does not depend on any test charge; the force F = qE flips with its sign", () => {
    const f = E.fieldAt(src, { x: 0.5, y: 0 }).E;
    const fp = E.forceOnTest(f, 1e-9), fn = E.forceOnTest(f, -1e-9);
    near(fp.x, -fn.x, 1e-12); near(fp.x, f.x * 1e-9, 1e-12); assert.ok(fp.x > 0 && fn.x < 0);
    const again = E.fieldAt(src, { x: 0.5, y: 0 }).E;
    assert.deepEqual(again, f);
  });
  test("the force on a test charge equals Coulomb's law with the source charge", () => {
    const f = E.forceOnTest(E.fieldAt(src, { x: 0.5, y: 0.2 }).E, 3e-9);
    const c = E.coulombForceOn(ch("t", 3e-9, 0.5, 0.2), src[0]);
    near(f.x, c.x, 1e-12); near(f.y, c.y, 1e-12);
  });
  test("superposition at the midpoint of equal charges is zero; of a dipole it is twice one charge's field", () => {
    const pair = E.fieldAt([ch("a", 2e-9, -1, 0), ch("b", 2e-9, 1, 0)], { x: 0, y: 0 });
    assert.ok(pair.magnitude < 1e-9);
    const dip = E.fieldAt([ch("a", 2e-9, -1, 0), ch("b", -2e-9, 1, 0)], { x: 0, y: 0 });
    near(dip.E.x, 2 * K * 2e-9, 1e-9); assert.ok(Math.abs(dip.E.y) < 1e-9);
  });
  test("a dipole on its axis far away approaches 2kp/r³ (p = q d)", () => {
    const d = 1, q = 2e-9, r = 8;
    const exact = K * q * (1 / ((r - d / 2) ** 2) - 1 / ((r + d / 2) ** 2));
    const f = E.fieldAt([ch("a", q, d / 2, 0), ch("b", -q, -d / 2, 0)], { x: r, y: 0 });
    near(f.E.x, exact, 1e-12); near(f.E.x, (2 * K * q * d) / r ** 3, 0.03);
  });
  test("the field is singular at a source and reports that instead of a number", () => {
    const f = E.fieldAt(src, { x: 0, y: 0 }); assert.equal(f.ok, false); assert.equal(f.reason, "singular");
  });
  test("the field grid omits points near sources and its arrows follow the calculated field", () => {
    const g = E.fieldGrid([ch("a", 2e-9, 0, 0), ch("b", -2e-9, 2, 0)]);
    assert.ok(g.length > 100);
    for (const s of g) { assert.ok(Math.hypot(s.x, s.y) > E.MAP_EXCLUSION && Math.hypot(s.x - 2, s.y) > E.MAP_EXCLUSION); const f = E.fieldAt([ch("a", 2e-9, 0, 0), ch("b", -2e-9, 2, 0)], s); near(f.E.x, s.E.x, 1e-12, 1e-12); }
  });
});

describe("potential and potential energy", () => {
  test("V = kq/r with V = 0 at infinity, and it is a scalar sum", () => {
    near(E.potentialAt([ch("a", 2e-9, 0, 0)], { x: 1, y: 0 }).V, (K * 2e-9) / 1, 1e-12);
    near(E.potentialAt([ch("a", 2e-9, 0, 0)], { x: 0, y: -1 }).V, (K * 2e-9) / 1, 1e-12);
    near(E.potentialAt([ch("a", -2e-9, 0, 0)], { x: 1, y: 0 }).V, -(K * 2e-9), 1e-12);
    assert.ok(Math.abs(E.potentialAt([ch("a", 2e-9, 0, 0)], { x: 4.99, y: 0 }).V) < K * 2e-9 / 4.9 + 1e-9);
  });
  test("superposition: midpoint of a dipole is at 0 V, midpoint of two positives is 2kq/r", () => {
    near(E.potentialAt([ch("a", 2e-9, -1, 0), ch("b", -2e-9, 1, 0)], { x: 0, y: 0 }).V + 1, 1, 1e-12);
    near(E.potentialAt([ch("a", 2e-9, -1, 0), ch("b", 2e-9, 1, 0)], { x: 0, y: 0 }).V, 2 * K * 2e-9, 1e-12);
  });
  test("potential is a scalar: rotating the source about the probe leaves V unchanged while E rotates", () => {
    const v1 = E.potentialAt([ch("a", 2e-9, 1, 0)], { x: 0, y: 0 }).V, v2 = E.potentialAt([ch("a", 2e-9, 0, 1)], { x: 0, y: 0 }).V;
    near(v1, v2, 1e-12);
    const e1 = E.fieldAt([ch("a", 2e-9, 1, 0)], { x: 0, y: 0 }).E, e2 = E.fieldAt([ch("a", 2e-9, 0, 1)], { x: 0, y: 0 }).E;
    assert.ok(e1.x < 0 && Math.abs(e1.y) < 1e-9 && e2.y < 0 && Math.abs(e2.x) < 1e-9);
  });
  test("U = qV, and the sign of q flips it", () => {
    const V = E.potentialAt([ch("a", 2e-9, 0, 0)], { x: 0.5, y: 0 }).V;
    near(E.potentialEnergy(1e-9, V), 1e-9 * V, 1e-12); near(E.potentialEnergy(-1e-9, V), -1e-9 * V, 1e-12);
  });
  test("work by the field equals q(V_A − V_B) and matches an independent numerical ∫F·dl along a straight path", () => {
    const src = [ch("a", 2e-9, 0, 0), ch("b", -1e-9, 1.5, 1)];
    const A = { x: -1, y: 0.5 }, B = { x: 1, y: -1 }, q = 1e-9;
    const N = 4000; let w = 0;
    const F = (p) => { const f = E.fieldAt(src, p).E; return { x: q * f.x, y: q * f.y }; };
    for (let k = 0; k < N; k += 1) { // composite Simpson on each half-interval via midpoint rule with fine steps
      const t0 = k / N, t1 = (k + 1) / N, tm = (t0 + t1) / 2;
      const at = (t) => ({ x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) });
      const g = (t) => { const f = F(at(t)); return f.x * (B.x - A.x) + f.y * (B.y - A.y); };
      w += ((t1 - t0) / 6) * (g(t0) + 4 * g(tm) + g(t1));
    }
    const VA = E.potentialAt(src, A).V, VB = E.potentialAt(src, B).V;
    near(E.workByField(q, VA, VB), w, 1e-6);
  });
  test("a positive test charge moving away from a positive source gains kinetic energy (positive field work) and loses U", () => {
    const src = [ch("a", 2e-9, 0, 0)];
    const VA = E.potentialAt(src, { x: 0.5, y: 0 }).V, VB = E.potentialAt(src, { x: 1.5, y: 0 }).V;
    const w = E.workByField(1e-9, VA, VB);
    assert.ok(w > 0); near(E.potentialEnergy(1e-9, VB) - E.potentialEnergy(1e-9, VA), -w, 1e-12);
    assert.ok(E.workByField(-1e-9, VA, VB) < 0);
  });
  test("potential is singular at a charge", () => assert.equal(E.potentialAt([ch("a", 2e-9, 0, 0)], { x: 0, y: 0 }).ok, false));
});

describe("equipotentials and field lines", () => {
  test("single charge: the 17.97 V contour is a circle of radius 1 m, every endpoint at the contour potential", () => {
    const level = (K * 2e-9) / 1;
    const segs = E.equipotential([ch("a", 2e-9, 0, 0)], level);
    assert.ok(segs.length > 100);
    for (const [x1, y1, x2, y2] of segs) {
      for (const [x, y] of [[x1, y1], [x2, y2]]) { near(Math.hypot(x, y), 1, 0.012); near(E.potentialAt([ch("a", 2e-9, 0, 0)], { x, y }).V, level, 0.03); }
    }
  });
  test("every contour segment is perpendicular to the field (dipole)", () => {
    const src = [ch("a", 2e-9, -1, 0), ch("b", -2e-9, 1, 0)];
    for (const level of [10, -25, 40]) {
      const segs = E.equipotential(src, level);
      assert.ok(segs.length > 20, `level ${level}`);
      for (const [x1, y1, x2, y2] of segs) {
        const tx = x2 - x1, ty = y2 - y1, tl = Math.hypot(tx, ty); if (tl < 1e-9) continue;
        const f = E.fieldAt(src, { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }).E; const fl = Math.hypot(f.x, f.y);
        assert.ok(Math.abs((tx * f.x + ty * f.y) / (tl * fl)) < 0.12, `level ${level}`);
      }
    }
  });
  test("no contour is drawn inside the singularity exclusion disc", () => {
    const src = [ch("a", 2e-9, 0, 0)];
    const segs = E.equipotential(src, 400); // would be at r = 0.045 m, inside the exclusion radius
    assert.equal(segs.length, 0);
    for (const [x1, y1] of E.equipotential(src, 100)) assert.ok(Math.hypot(x1, y1) >= E.MAP_EXCLUSION * 0.99);
  });
  test("a field line from a single positive charge is radial and leaves the window", () => {
    const line = E.fieldLine([ch("a", 2e-9, 0, 0)], { x: 0.12 * Math.cos(0.7), y: 0.12 * Math.sin(0.7) });
    assert.equal(line.ended, "boundary");
    for (const p of line.points) near(Math.atan2(p.y, p.x), 0.7, 1e-6, 1e-6);
  });
  test("dipole field lines run from the positive to the negative charge", () => {
    const src = [ch("a", 2e-9, -1, 0), ch("b", -2e-9, 1, 0)];
    const lines = E.fieldLineSeeds(src).map((s) => E.fieldLine(src, s.start, s.dir));
    const ending = lines.filter((l) => l.ended === "charge");
    assert.ok(ending.length >= 4);
    for (const l of ending) { const p = l.points.at(-1); assert.ok(Math.hypot(p.x - 1, p.y) < 0.12); }
  });
  test("the line direction follows E at every step", () => {
    const src = [ch("a", 2e-9, -1, 0), ch("b", -2e-9, 1, 0)];
    const l = E.fieldLine(src, { x: -0.9, y: 0.3 });
    for (let k = 1; k < l.points.length - 1; k += 10) {
      const p = l.points[k], q = l.points[k + 1], f = E.fieldAt(src, p).E;
      const tx = q.x - p.x, ty = q.y - p.y;
      assert.ok((tx * f.x + ty * f.y) / (Math.hypot(tx, ty) * Math.hypot(f.x, f.y)) > 0.99);
    }
  });
  test("a lone negative charge's lines are traced backward from it", () => {
    const seeds = E.fieldLineSeeds([ch("a", -2e-9, 0, 0)]);
    assert.ok(seeds.length >= 4 && seeds.every((s) => s.dir === -1));
  });
  test("presets are valid configurations: single, dipole, pair, triangle", () => {
    for (const p of Object.values(E.PRESETS)) assert.equal(E.validateCharges(p.charges).ok, true, p.label);
    assert.equal(E.PRESETS.dipole.charges[0].q, -E.PRESETS.dipole.charges[1].q);
  });
});

describe("validation", () => {
  const ok = [ch("a", 2e-9, 0, 0)];
  test("charge count, magnitude, position and ids", () => {
    assert.equal(E.validateCharges(ok).ok, true);
    for (const bad of [[], Array.from({ length: 7 }, (_, i) => ch(`c${i}`, 1e-9, i * 0.5 - 2, 0)), [ch("a", 0, 0, 0)], [ch("a", 1e-3, 0, 0)], [ch("a", 1e-9, 9, 0)], [ch("A!", 1e-9, 0, 0)], [ch("a", NaN, 0, 0)], [ch("a", 1e-9, 0, 0), ch("a", 1e-9, 1, 0)], "x", null]) assert.equal(E.validateCharges(bad).ok, false, JSON.stringify(bad).slice(0, 60));
  });
});

describe("uniform electric field: a charged particle", () => {
  const p = { ...E.DEFAULT_UNIFORM }; // proton, v = 1e5 m/s along x, E = 5 kV/m along y
  test("a = qE/m for a proton: 4.789e11 m/s² along +y", () => {
    const s = E.uniformState(p, 1e-7);
    near(s.ay, (1.602176634e-19 * 5e3) / 1.67262192369e-27, 1e-12); near(s.ay, 4.7893e11, 1e-3); assert.equal(s.ax, 0);
    near(s.x, 1e5 * 1e-7, 1e-12); near(s.y, 0.5 * 4.7893e11 * 1e-14, 1e-3);
  });
  test("an electron accelerates opposite to E, by m_p/m_e times as much", () => {
    const e = { ...p, m: 9.1093837015e-31, q: -1.602176634e-19 };
    const sp = E.uniformState(p, 1e-7), se = E.uniformState(e, 1e-7);
    assert.ok(se.ay < 0 && sp.ay > 0); near(se.ay / sp.ay, -1836.15, 1e-3);
  });
  test("zero field: uniform motion in a straight line; zero velocity: motion along ½at² only", () => {
    const f0 = { ...p, Ex: 0, Ey: 0 }; const s = E.uniformState(f0, 3e-7); assert.equal(s.ay, 0); near(s.x, 1e5 * 3e-7, 1e-12); assert.equal(s.y, 0);
    const r = { ...p, vx0: 0, vy0: 0 }; const s2 = E.uniformState(r, 1e-7); assert.equal(s2.x, 0); near(s2.y, 0.5 * s2.ay * 1e-14, 1e-12);
  });
  test("position, velocity and acceleration agree: dx/dt = v and dv/dt = a (independent differences)", () => {
    const t = 2e-7, h = 1e-12;
    const a = E.uniformState(p, t - h), b = E.uniformState(p, t + h), m = E.uniformState(p, t);
    near((b.x - a.x) / (2 * h), m.vx, 1e-6); near((b.y - a.y) / (2 * h), m.vy, 1e-6); near((b.vy - a.vy) / (2 * h), m.ay, 1e-6);
  });
  test("work–energy: ΔKE = qE·Δr", () => {
    const s0 = E.uniformState(p, 0), s = E.uniformState(p, 3e-7);
    near(s.ke - s0.ke, p.q * (p.Ex * (s.x - s0.x) + p.Ey * (s.y - s0.y)), 1e-9);
  });
  test("the trace starts at the initial state and ends at the duration", () => {
    const tr = E.uniformTrace(p, 50); assert.equal(tr.length, 51); near(tr[0].x, p.x0, 1, 1e-12); near(tr.at(-1).t, p.duration, 1e-12);
    assert.deepEqual(E.uniformTrace(p, 50), tr);
  });
  test("invalid or relativistic settings are rejected", () => {
    assert.equal(E.validateUniform(p).ok, true);
    for (const bad of [{ m: 0 }, { q: 0 }, { duration: 0 }, { Ey: NaN }, { vx0: 1e9 }, { Ey: 1e9, duration: 1 }, { m: -1 }]) assert.equal(E.validateUniform({ ...p, ...bad }).ok, false, JSON.stringify(bad));
    assert.equal(E.validateUniform(null).ok, false);
  });
});
