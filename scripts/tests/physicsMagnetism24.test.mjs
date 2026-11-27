// Stage 24: magnetic fields and the Lorentz force. Expected values are hand-derived (right-hand rule, cross products, closed forms) or
// computed by an independent RK4 integration written in this file.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

const M = await loadModule("/src/utils/physics/magnetism.ts");
after(async () => { await closeEngine(); });

const near = (a, b, rel, abs = 0, msg = "") => assert.ok(Math.abs(a - b) <= Math.max(rel * Math.abs(b), abs), `${msg} expected ${b}, got ${a}`);
const MU0 = 1.25663706212e-6, QE = 1.602176634e-19, MP = 1.67262192369e-27, ME = 9.1093837015e-31;
const w = (id, x, y, I) => ({ id, x, y, I });
const V = (x, y, z = 0) => ({ x, y, z });

describe("vector algebra", () => {
  test("x̂ × ŷ = ẑ (right-handed), and the cross product is anticommutative", () => {
    assert.deepEqual(M.cross3(V(1, 0, 0), V(0, 1, 0)), V(0, 0, 1));
    assert.deepEqual(M.cross3(V(0, 1, 0), V(0, 0, 1)), V(1, 0, 0));
    assert.deepEqual(M.cross3(V(0, 0, 1), V(1, 0, 0)), V(0, 1, 0));
    const a = V(1, 2, 3), b = V(-2, 0.5, 4);
    const ab = M.cross3(a, b), ba = M.cross3(b, a);
    assert.deepEqual(ab, V(-ba.x, -ba.y, -ba.z));
  });
  test("parallel vectors have zero cross product; the product is orthogonal to both and |a×b| = |a||b| sin θ", () => {
    assert.deepEqual(M.cross3(V(1, 2, 3), V(2, 4, 6)), V(0, 0, 0));
    const a = V(1, 2, 3), b = V(-2, 0.5, 4), c = M.cross3(a, b);
    near(M.dot3(c, a), 0, 1, 1e-12); near(M.dot3(c, b), 0, 1, 1e-12);
    const th = M.angleBetweenDeg(a, b);
    near(M.norm3(c), M.norm3(a) * M.norm3(b) * Math.sin((th * Math.PI) / 180), 1e-12);
  });
  test("a × (b × c) = b (a·c) − c (a·b)", () => {
    const a = V(1, -2, 0.5), b = V(0.3, 1, -1), c = V(2, 2, 1);
    const l = M.cross3(a, M.cross3(b, c));
    const r = M.sub3(M.scale3(b, M.dot3(a, c)), M.scale3(c, M.dot3(a, b)));
    near(l.x, r.x, 1e-12, 1e-12); near(l.y, r.y, 1e-12, 1e-12); near(l.z, r.z, 1e-12, 1e-12);
  });
  test("angles: 0°, 90°, 180°; the zero vector has no direction", () => {
    near(M.angleBetweenDeg(V(1, 0, 0), V(2, 0, 0)), 0, 1, 1e-9); near(M.angleBetweenDeg(V(1, 0, 0), V(0, 3, 0)), 90, 1e-12); near(M.angleBetweenDeg(V(1, 0, 0), V(-1, 0, 0)), 180, 1e-12);
    assert.throws(() => M.angleBetweenDeg(V(0, 0, 0), V(1, 0, 0))); assert.throws(() => M.unit3(V(0, 0, 0)));
  });
});

describe("straight wire", () => {
  test("B = μ₀I/(2πr): 10 A at 5 cm is 40 µT", () => { near(M.wireMagnitude(10, 0.05), 4e-5, 1e-8); near(M.wireMagnitude(-10, 0.05), 4e-5, 1e-8); });
  test("inverse distance: doubling r halves B; B is proportional to I", () => { near(M.wireMagnitude(10, 0.1), M.wireMagnitude(10, 0.05) / 2, 1e-12); near(M.wireMagnitude(20, 0.05), 2 * M.wireMagnitude(10, 0.05), 1e-12); });
  test("right-hand rule for a current OUT of the screen: counter-clockwise circulation", () => {
    const wire = [w("a", 0, 0, 10)];
    const at = (x, y) => M.wireFieldAt(wire, x, y).B;
    const e = at(0.05, 0), n = at(0, 0.05), wst = at(-0.05, 0), s = at(0, -0.05);
    near(e.y, 4e-5, 1e-8); assert.ok(Math.abs(e.x) < 1e-12 && e.z === 0);
    near(n.x, -4e-5, 1e-8); assert.ok(Math.abs(n.y) < 1e-12);
    near(wst.y, -4e-5, 1e-8); near(s.x, 4e-5, 1e-8);
    assert.equal(M.circulation(10), "counterclockwise"); assert.equal(M.currentDirectionWord(10), "out of the screen");
  });
  test("reversing the current (into the screen) reverses every field vector: clockwise", () => {
    const a = M.wireFieldAt([w("a", 0, 0, 10)], 0.07, 0.02).B, b = M.wireFieldAt([w("a", 0, 0, -10)], 0.07, 0.02).B;
    near(b.x, -a.x, 1e-12); near(b.y, -a.y, 1e-12);
    assert.equal(M.circulation(-10), "clockwise"); assert.equal(M.currentDirectionWord(-10), "into the screen");
  });
  test("the field is tangent to circles about the wire and perpendicular to the radius, with magnitude μ₀I/2πr at any angle", () => {
    for (const a of [0.3, 1.1, 2.5, 4.0]) {
      const r = 0.08, x = r * Math.cos(a), y = r * Math.sin(a);
      const f = M.wireFieldAt([w("a", 0, 0, 7)], x, y);
      near(f.magnitude, (MU0 * 7) / (2 * Math.PI * r), 1e-12); near(f.B.x * x + f.B.y * y, 0, 1, 1e-15);
    }
  });
  test("superposition: antiparallel currents add between the wires, parallel currents cancel at the midpoint", () => {
    const anti = M.wireFieldAt([w("a", -0.1, 0, 5), w("b", 0.1, 0, -5)], 0, 0).B;
    near(anti.y, 2 * (MU0 * 5) / (2 * Math.PI * 0.1), 1e-12);
    const par = M.wireFieldAt([w("a", -0.1, 0, 5), w("b", 0.1, 0, 5)], 0, 0).B;
    assert.ok(Math.abs(par.x) < 1e-15 && Math.abs(par.y) < 1e-15);
  });
  test("the field at a wire (r = 0) is singular, not a finite number", () => {
    assert.equal(M.wireFieldAt([w("a", 0, 0, 5)], 0, 0).ok, false); assert.throws(() => M.wireMagnitude(5, 0));
    assert.equal(M.validateWires([w("a", 0, 0, 5), w("b", 0, 0, 5)]).ok, false);
  });
  test("the wire grid omits points near a wire and its vectors are the computed field", () => {
    const wires = [w("a", 0, 0, 5)], g = M.wireGrid(wires);
    assert.ok(g.length > 100);
    for (const s of g) { assert.ok(Math.hypot(s.x, s.y) > 0.03); const f = M.wireFieldAt(wires, s.x, s.y); near(f.B.x, s.B.x, 1e-12, 1e-18); }
  });
});

describe("current loop and solenoid", () => {
  const loop = { I: 5, a: 0.05, N: 1 };
  test("centre of a loop: B = μ₀I/(2a) = 62.8 µT", () => { near(M.loopCentre(loop), (MU0 * 5) / 0.1, 1e-12); near(M.loopAxial(loop, 0), M.loopCentre(loop), 1e-12); });
  test("on the axis at x = a: B(a) = B(0)/2^{3/2}", () => near(M.loopAxial(loop, 0.05), M.loopCentre(loop) / Math.pow(2, 1.5), 1e-12));
  test("far on the axis it falls as 1/x³ like a magnetic dipole μ₀ m/(2π x³), m = I π a²", () => {
    const x = 2; near(M.loopAxial(loop, x), (MU0 * (5 * Math.PI * 0.05 ** 2)) / (2 * Math.PI * x ** 3), 1e-3);
    near(M.loopAxial(loop, 2 * x) / M.loopAxial(loop, x), 1 / 8, 5e-3);
  });
  test("N turns multiply the field; reversing the current reverses it; it is even in x", () => {
    near(M.loopAxial({ ...loop, N: 10 }, 0.03), 10 * M.loopAxial(loop, 0.03), 1e-12);
    near(M.loopAxial({ ...loop, I: -5 }, 0.03), -M.loopAxial(loop, 0.03), 1e-12); near(M.loopAxial(loop, -0.03), M.loopAxial(loop, 0.03), 1e-12);
  });
  const sol = { n: 1000, I: 2, L: 0.5, R: 0.02 };
  test("ideal long solenoid: B = μ₀nI = 2.513 mT, linear in n and I, reversed with the current", () => {
    near(M.solenoidIdeal(sol), MU0 * 1000 * 2, 1e-12);
    near(M.solenoidIdeal({ ...sol, n: 2000 }), 2 * M.solenoidIdeal(sol), 1e-12); near(M.solenoidIdeal({ ...sol, I: 4 }), 2 * M.solenoidIdeal(sol), 1e-12); near(M.solenoidIdeal({ ...sol, I: -2 }), -M.solenoidIdeal(sol), 1e-12);
  });
  test("finite solenoid on its axis: centre ≈ μ₀nI (long limit), each end ≈ half, and exact limits as R → 0", () => {
    const centre = (MU0 * 1000 * 2 * 0.25) / Math.sqrt(0.25 ** 2 + 0.02 ** 2);
    near(M.solenoidAxial(sol, 0), centre, 1e-12); near(M.solenoidAxial(sol, 0) / M.solenoidIdeal(sol), 1, 5e-3);
    near(M.solenoidAxial(sol, 0.25) / M.solenoidIdeal(sol), 0.5, 5e-3);
    const thin = { ...sol, R: 1e-3 }; near(M.solenoidAxial(thin, 0) / M.solenoidIdeal(thin), 1, 1e-4);
  });
  test("a short, fat solenoid does NOT follow the ideal equation, and the validity test says so", () => {
    const fat = { n: 1000, I: 2, L: 0.1, R: 0.1 };
    assert.ok(M.solenoidAxial(fat, 0) / M.solenoidIdeal(fat) < 0.75); assert.equal(M.longSolenoidOk(fat), false); assert.equal(M.longSolenoidOk(sol), true);
    assert.ok(M.SOLENOID_ASSUMPTIONS.some((s) => /not exact near the ends/.test(s))); assert.ok(M.SOLENOID_ASSUMPTIONS.some((s) => /outside/.test(s)));
  });
  test("the field far outside the end on the axis is small and falls off, unlike the interior value", () => assert.ok(Math.abs(M.solenoidAxial(sol, 1.5)) < 0.02 * Math.abs(M.solenoidIdeal(sol))));
  test("validation", () => {
    assert.equal(M.validateLoop(loop).ok, true); assert.equal(M.validateSolenoid(sol).ok, true);
    for (const bad of [{ a: 0 }, { N: 0 }, { N: 1.5 }, { I: 0 }, { I: NaN }]) assert.equal(M.validateLoop({ ...loop, ...bad }).ok, false, JSON.stringify(bad));
    for (const bad of [{ n: 0 }, { L: 0 }, { R: -1 }, { I: 0 }]) assert.equal(M.validateSolenoid({ ...sol, ...bad }).ok, false, JSON.stringify(bad));
  });
});

describe("Lorentz force and conductors", () => {
  test("proton moving +x in B out of the screen: F = q v × B points −y (down)", () => {
    const F = M.magneticForce(QE, V(1e5, 0, 0), V(0, 0, 0.1));
    near(F.y, -QE * 1e4, 1e-12); assert.ok(Math.abs(F.x) < 1e-30 && Math.abs(F.z) < 1e-30);
  });
  test("a negative charge feels exactly the opposite force", () => {
    const fp = M.magneticForce(QE, V(1e5, 0, 0), V(0, 0, 0.1)), fn = M.magneticForce(-QE, V(1e5, 0, 0), V(0, 0, 0.1));
    near(fn.y, -fp.y, 1e-12);
  });
  test("zero force for v ∥ B (either way), for a stationary charge and for B = 0", () => {
    for (const v of [V(0, 0, 1e5), V(0, 0, -1e5)]) { const F = M.magneticForce(QE, v, V(0, 0, 0.1)); assert.equal(M.norm3(F), 0); }
    assert.equal(M.norm3(M.magneticForce(QE, V(0, 0, 0), V(1, 2, 3))), 0); assert.equal(M.norm3(M.magneticForce(QE, V(1e5, 2e5, 0), V(0, 0, 0))), 0);
  });
  test("|F| = |q| v B sin θ, and the force is perpendicular to both v and B", () => {
    const v = V(1e5 * Math.cos(Math.PI / 6), 0, 1e5 * Math.sin(Math.PI / 6)), B = V(0, 0, 0.1);
    const F = M.magneticForce(QE, v, B);
    near(M.norm3(F), M.magneticMagnitude(QE, 1e5, 0.1, 60), 1e-12); near(M.norm3(F), QE * 1e5 * 0.1 * Math.sin(Math.PI / 3), 1e-9);
    near(M.dot3(F, v), 0, 1, 1e-25); near(M.dot3(F, B), 0, 1, 1e-25);
    near(M.angleBetweenDeg(v, B), 60, 1e-9);
  });
  test("full Lorentz force: a velocity selector (E = vB perpendicular to both) gives zero net force; the sign of q does not matter", () => {
    for (const q of [QE, -QE]) { const F = M.lorentzForce(q, V(1e5, 0, 0), V(0, 0, 0.1), V(0, 1e4, 0)); near(M.norm3(F), 0, 1, 1e-25); }
    const F = M.lorentzForce(QE, V(1e5, 0, 0), V(0, 0, 0.1), V(0, 2e4, 0)); near(F.y, QE * (2e4 - 1e4), 1e-9);
  });
  test("current-carrying straight conductor: F = I L × B = 0.3 N toward −y for 5 A in 0.2 m of +x in B out of the screen", () => {
    const F = M.conductorForce(5, V(0.2, 0, 0), V(0, 0, 0.3));
    near(F.y, -0.3, 1e-12); assert.ok(Math.abs(F.x) < 1e-15);
    assert.equal(M.norm3(M.conductorForce(5, V(0.2, 0, 0), V(0.3, 0, 0))), 0);
    const R = M.conductorForce(-5, V(0.2, 0, 0), V(0, 0, 0.3)); near(R.y, 0.3, 1e-12);
  });
  test("the net force on a conductor is the sum of the forces on its moving carriers (I = nqAv_d)", () => {
    const n = 8.5e28, A = 1e-6, qe = -QE, vd = 1e-4, Lm = 0.2; // electrons drifting along −x carry conventional current along +x
    const I = n * qe * A * (-vd) * -1; // conventional current along +x = n |q| A v_d
    const B = V(0, 0, 0.3);
    const sum = M.scale3(M.magneticForce(qe, V(-vd, 0, 0), B), n * A * Lm);
    const wire = M.conductorForce(Math.abs(n * QE * A * vd), V(Lm, 0, 0), B);
    near(sum.y, wire.y, 1e-9); void I;
  });
  test("validation of a Lorentz setup", () => {
    assert.equal(M.validateLorentz(M.DEFAULT_LORENTZ).ok, true);
    for (const bad of [{ q: 0 }, { m: 0 }, { v: V(4e7, 0, 0) }, { B: V(0, 0, 100) }, { v: { x: NaN, y: 0, z: 0 } }]) assert.equal(M.validateLorentz({ ...M.DEFAULT_LORENTZ, ...bad }).ok, false, JSON.stringify(bad));
  });
});

describe("charged-particle motion in a uniform magnetic field", () => {
  const P = { ...M.DEFAULT_MOTION }; // proton, v = 1e5 m/s along +x, B = 0.5 T out of the screen
  const rC = (MP * 1e5) / (QE * 0.5), T = (2 * Math.PI * MP) / (QE * 0.5);
  test("radius r = m v⊥/(|q|B) = 2.088 mm; period T = 2πm/(|q|B) = 131 ns; ω = qB/m", () => {
    const s = M.motionSummary(P);
    near(s.radius, rC, 1e-12); near(s.period, T, 1e-12); near(s.omega, (QE * 0.5) / MP, 1e-12); near(s.frequency, 1 / T, 1e-12); near(rC, 2.0881e-3, 1e-3); near(T, 1.312e-7, 2e-3);
    assert.equal(s.sense, "clockwise");
  });
  test("a positive charge in B out of the screen circulates clockwise: after T/4 it is at (r, −r); after T it is back at the start", () => {
    const q4 = M.motionState(P, T / 4), full = M.motionState(P, T);
    near(q4.x, rC, 1e-9); near(q4.y, -rC, 1e-9); near(full.x, 0, 1, 1e-9 * rC); near(full.y, 0, 1, 1e-9 * rC);
    near(q4.vy, -1e5, 1e-9); assert.ok(Math.abs(q4.vx) < 1e-3);
  });
  test("the initial force is q v × B: down for the proton, up for the electron; the electron circles the other way with a smaller radius", () => {
    const e = { ...P, q: -QE, m: ME };
    assert.ok(M.motionState(P, 0).fy < 0 && M.motionState(e, 0).fy > 0);
    const se = M.motionSummary(e); assert.equal(se.sense, "counterclockwise"); near(se.radius, (ME * 1e5) / (QE * 0.5), 1e-12); near(se.radius / M.motionSummary(P).radius, ME / MP, 1e-12);
    const q4 = M.motionState(e, se.period / 4); assert.ok(q4.y > 0);
  });
  test("reversing B (into the screen) reverses the sense of rotation", () => {
    const into = { ...P, Bz: -0.5 }; assert.equal(M.motionSummary(into).sense, "counterclockwise"); assert.ok(M.motionState(into, T / 4).y > 0);
  });
  test("the period and ω do not depend on speed; the radius is proportional to it", () => {
    const fast = { ...P, vx: 2e5 }; near(M.motionSummary(fast).period, T, 1e-12); near(M.motionSummary(fast).radius, 2 * rC, 1e-12);
  });
  test("kinetic energy and speed are exactly constant under a purely magnetic force (the field does no work)", () => {
    const tr = M.motionTrace({ ...P, vy: 3e4, vz: 4e4, duration: 3 * T }, 300);
    for (const s of tr) { near(s.ke, tr[0].ke, 1e-12); near(s.speed, tr[0].speed, 1e-12); }
    for (const s of tr) near(s.fx * s.vx + s.fy * s.vy + s.fz * s.vz, 0, 1, 1e-25 + 1e-9 * Math.abs(s.fy * s.vy)); // F · v = 0
  });
  test("every point of the xy path lies on one circle of radius m v⊥/(|q|B) about the centre (x₀ + v_y/ω.., y₀ − v_x/ω..)", () => {
    const p = { ...P, vx: 6e4, vy: 8e4, duration: T };
    const w = (QE * 0.5) / MP; const cx = p.x0 + p.vy / w, cy = p.y0 - p.vx / w; // centre for a clockwise (ω > 0) orbit
    for (const s of M.motionTrace(p, 100)) near(Math.hypot(s.x - cx, s.y - cy), M.motionSummary(p).radius, 1e-9);
  });
  test("parallel velocity makes a helix: constant v_z, pitch v∥T per orbit, radius from v⊥ only", () => {
    const p = { ...P, vz: 5e4, duration: 2 * T }; const s = M.motionSummary(p);
    near(s.pitch, 5e4 * T, 1e-12); near(s.radius, rC, 1e-12);
    near(M.motionState(p, T).z, 5e4 * T, 1e-12); near(M.motionState(p, 2 * T).z, 1e5 * T, 1e-12);
    for (const st of M.motionTrace(p, 50)) assert.equal(st.vz, 5e4);
  });
  test("velocity parallel to B: no force, a straight line, no orbit", () => {
    const p = { ...P, vx: 0, vy: 0, vz: 1e5 }; const s = M.motionState(p, 7e-8);
    assert.equal(s.fx, 0); near(s.z, 1e5 * 7e-8, 1e-12); near(s.x, 0, 1, 1e-15); near(s.y, 0, 1, 1e-15); assert.equal(M.motionSummary(p).radius, 0);
  });
  test("agrees with an independent RK4 integration of m dv/dt = q(v × B) over three orbits", () => {
    const p = { ...P, vx: 7e4, vy: -3e4, vz: 2e4, duration: 3 * T };
    let x = 0, y = 0, z = 0, vx = p.vx, vy = p.vy, vz = p.vz; const N = 30000, dt = p.duration / N;
    const acc = (a, b, c) => { const k = (QE / MP); return [k * (b * 0.5 - c * 0), k * (c * 0 - a * 0.5), 0]; };
    for (let n = 0; n < N; n += 1) {
      const k1 = acc(vx, vy, vz), k2 = acc(vx + 0.5 * dt * k1[0], vy + 0.5 * dt * k1[1], vz), k3 = acc(vx + 0.5 * dt * k2[0], vy + 0.5 * dt * k2[1], vz), k4 = acc(vx + dt * k3[0], vy + dt * k3[1], vz);
      const nvx = vx + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), nvy = vy + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      x += 0.5 * dt * (vx + nvx); y += 0.5 * dt * (vy + nvy); z += vz * dt; vx = nvx; vy = nvy;
    }
    const s = M.motionState(p, p.duration);
    near(s.x, x, 0, 5e-4 * rC * 3); near(s.y, y, 0, 5e-4 * rC * 3); near(s.z, z, 1e-12); near(s.vx, vx, 0, 1e-3 * 1e5);
  });
  test("E × B drift: v = E/B makes the net force zero (velocity selector) for either sign of charge", () => {
    for (const q of [QE, -QE]) {
      const p = { ...P, q, vx: 1e4 / 0.5, vy: 0, Ey: 1e4, duration: 1e-6 }; // E = 1e4 V/m along y, B = 0.5 T out: drift = (Ey/Bz, −Ex/Bz) = (2e4, 0)
      const s = M.motionState(p, 8e-7); near(s.x, 2e4 * 8e-7, 1e-9); near(s.y, 0, 1, 1e-12); near(s.vx, 2e4, 1e-9);
    }
    near(M.motionSummary({ ...P, Ey: 1e4 }).drift.x, 2e4, 1e-12); near(M.motionSummary({ ...P, Ex: 1e4 }).drift.y, -2e4, 1e-12);
  });
  test("with E ≠ 0 the work–energy theorem holds: ΔKE = qE·Δr; with E = 0 the kinetic energy is constant", () => {
    const p = { ...P, Ey: 1e4, vx: 0, vy: 0, duration: 4 * T };
    const s0 = M.motionState(p, 0), s = M.motionState(p, 2.3 * T);
    near(s.ke - s0.ke, QE * (p.Ex * (s.x - s0.x) + p.Ey * (s.y - s0.y)), 1e-9);
    near(M.motionState({ ...p, Ey: 0 }, 2.3 * T).ke, M.motionState({ ...p, Ey: 0 }, 0).ke, 1e-12);
  });
  test("starting from rest in crossed fields gives a cycloid whose average drift is E/B", () => {
    const p = { ...P, Ey: 1e4, vx: 0, vy: 0, duration: 10 * T }; const s = M.motionState(p, 10 * T);
    near(s.x / (10 * T), 2e4, 1e-9, 1e-6); near(s.y, 0, 1, 1e-6 * 2e4 * T);
  });
  test("velocityFromAngles: azimuth in the plane, pitch toward +z", () => {
    const v = M.velocityFromAngles(1e5, 90, 0); near(v.y, 1e5, 1e-12); assert.ok(Math.abs(v.x) < 1e-6);
    const u = M.velocityFromAngles(1e5, 0, 90); near(u.z, 1e5, 1e-12); near(M.norm3(M.velocityFromAngles(1e5, 33, 17)), 1e5, 1e-12);
  });
  test("validation: field range, charge, mass, speed, orbit count", () => {
    assert.equal(M.validateMotion(P).ok, true);
    for (const bad of [{ Bz: 0 }, { Bz: 11 }, { q: 0 }, { m: 0 }, { vx: 4e7 }, { duration: -1 }, { duration: 1 }, { Ey: 1e7 }, { vx: NaN }]) assert.equal(M.validateMotion({ ...P, ...bad }).ok, false, JSON.stringify(bad));
    assert.equal(M.validateMotion(null).ok, false);
  });
  test("the right-hand rules are stated", () => { assert.match(M.RIGHT_HAND_RULES.wire, /thumb along the current/); assert.match(M.RIGHT_HAND_RULES.force, /q < 0 reverse/); });
});
