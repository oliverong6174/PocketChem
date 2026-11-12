// Stage 13: Mechanics and Motion model. References are textbook closed forms evaluated independently of the implementation
// (v^2 sin(2a)/g, sqrt(2h/g), energy conservation, finite differences, brute-force search), not the tool's own output.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let M, C, F;
before(async () => {
  M = await loadModule("/src/utils/physics/mechanics.ts");
  C = await loadModule("/src/utils/physics/simClock.ts");
  F = await loadModule("/src/utils/physics/format.ts");
});
after(async () => { await closeEngine(); });

const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const rel = (a, b, tol, label = "") => near(a, b, tol * Math.abs(b), label);
const rad = (d) => (d * Math.PI) / 180;
const proj = (o = {}) => ({ x0: 0, y0: 0, speed: 20, angleDeg: 30, g: 9.81, ...o });
const K = (o) => M.projectileKinematics(proj(o));

describe("position and velocity equations", () => {
  test("[level launch] v = 20 m/s at 30 deg from the ground: vx = 20cos30, vy = 10; range = v^2 sin(2a)/g; height = v^2 sin^2(a)/2g", () => {
    const k = K();
    near(k.vx0, 20 * Math.cos(rad(30)), 1e-12);
    near(k.vy0, 10, 1e-12);
    const s = M.summarize(k);
    rel(s.tFlight, (2 * 20 * Math.sin(rad(30))) / 9.81, 1e-12);
    rel(s.range, (400 * Math.sin(rad(60))) / 9.81, 1e-12);
    rel(s.maxHeight, (400 * 0.25) / (2 * 9.81), 1e-12);
    near(s.range, 35.3119, 1e-3);
    near(s.maxHeight, 5.0968, 1e-3);
  });
  test("[hand check] x(t) = x0 + vx t and y(t) = y0 + vy t - g t^2/2 at t = 1.5 s for x0 = 3, y0 = 10, v = 12 at 60 deg", () => {
    const k = K({ x0: 3, y0: 10, speed: 12, angleDeg: 60 });
    const s = M.stateAt(k, 1.5);
    near(s.x, 3 + 6 * 1.5, 1e-12);
    near(s.y, 10 + 12 * Math.sin(rad(60)) * 1.5 - 0.5 * 9.81 * 2.25, 1e-12);
    near(s.vx, 6, 1e-12);
    near(s.vy, 12 * Math.sin(rad(60)) - 9.81 * 1.5, 1e-12);
    near(s.ax, 0, 0);
    near(s.ay, -9.81, 0);
  });
  test("[constant acceleration] x0 = 0, v0 = 4 m/s, a = 1.5 m/s^2 for 6 s: x = 4*6 + 0.5*1.5*36 = 51 m, v = 13 m/s", () => {
    const k = M.constantKinematics({ x0: 0, y0: 0, vx0: 4, vy0: 0, ax: 1.5, ay: 0, ground: false, duration: 10 });
    const s = M.stateAt(k, 6);
    near(s.x, 51, 1e-12);
    near(s.vx, 13, 1e-12);
    near(s.displacement, 51, 1e-12);
    near(s.dy, 0, 0);
  });
  test("[v^2 = v0^2 + 2 a dx] the time-independent kinematic relation holds at every sampled time", () => {
    const k = M.constantKinematics({ x0: 2, y0: 0, vx0: 3, vy0: 0, ax: -0.8, ay: 0, ground: false, duration: 12 });
    for (const t of [0, 1, 4.2, 7.7, 12]) {
      const s = M.stateAt(k, t);
      near(s.vx * s.vx, 9 + 2 * -0.8 * (s.x - 2), 1e-9);
    }
  });
  test("[derivatives] velocity equals the numerical derivative of position and acceleration of velocity", () => {
    const k = K({ y0: 15, speed: 30, angleDeg: 50 });
    const h = 1e-4;
    for (const t of [0.5, 1.7, 3.1]) {
      const a = M.stateAt(k, t - h);
      const b = M.stateAt(k, t + h);
      const s = M.stateAt(k, t);
      near((b.x - a.x) / (2 * h), s.vx, 1e-6);
      near((b.y - a.y) / (2 * h), s.vy, 1e-6);
      near((b.vy - a.vy) / (2 * h), s.ay, 1e-6);
    }
  });
});

describe("launch and landing conditions", () => {
  test("[from a height] 40 m/s at 25 deg from 30 m: t = (vy + sqrt(vy^2 + 2 g h)) / g, and y(t) = 0 there", () => {
    const k = K({ y0: 30, speed: 40, angleDeg: 25 });
    const vy = 40 * Math.sin(rad(25));
    const t = (vy + Math.sqrt(vy * vy + 2 * 9.81 * 30)) / 9.81;
    const s = M.summarize(k);
    rel(s.tFlight, t, 1e-12);
    near(M.stateAt(k, s.tFlight).y, 0, 1e-9);
    rel(s.range, 40 * Math.cos(rad(25)) * t, 1e-12);
    assert.equal(s.lands, true);
    assert.equal(s.apexIsTurning, true);
  });
  test("[dropped] from rest at 50 m: t = sqrt(2h/g) = 3.1927 s, impact speed sqrt(2gh) = 31.32 m/s, no horizontal range", () => {
    const s = M.summarize(K({ y0: 50, speed: 0, angleDeg: 0 }));
    near(s.tFlight, Math.sqrt(100 / 9.81), 1e-12);
    near(s.tFlight, 3.1927, 1e-3);
    near(s.end.speed, Math.sqrt(2 * 9.81 * 50), 1e-9);
    near(s.end.speed, 31.3209, 1e-3);
    near(s.range, 0, 1e-12);
    assert.equal(s.apexIsTurning, false);
    near(s.maxHeight, 50, 0);
  });
  test("[horizontal launch] 15 m/s from a 45 m cliff: t = sqrt(90/9.81) = 3.0289 s, range = 45.43 m, landing vy = -g t", () => {
    const s = M.summarize(K({ y0: 45, speed: 15, angleDeg: 0 }));
    near(s.tFlight, Math.sqrt(90 / 9.81), 1e-12);
    near(s.range, 15 * Math.sqrt(90 / 9.81), 1e-9);
    near(s.range, 45.4337, 1e-3);
    near(s.end.vy, -9.81 * s.tFlight, 1e-9);
    near(s.end.vx, 15, 1e-12);
    near(s.maxHeight, 45, 0);
  });
  test("[downward launch] 10 m/s straight down from 20 m: 4.905 t^2 + 10 t - 20 = 0, t = 1.2426 s; the vertical launch has exactly zero range", () => {
    const s = M.summarize(K({ y0: 20, speed: 10, angleDeg: -90 }));
    near(s.tFlight, (-10 + Math.sqrt(100 + 2 * 9.81 * 20)) / 9.81, 1e-12);
    near(s.tFlight, 1.2426, 1e-4);
    assert.equal(s.range, 0);
    assert.equal(s.launch.vx, 0);
  });
  test("[downward at an angle] 12 m/s at -30 deg from 8 m reaches the ground sooner than an object dropped from 8 m (t < sqrt(2h/g))", () => {
    const t = M.summarize(K({ y0: 8, speed: 12, angleDeg: -30 })).tFlight;
    assert.ok(t < Math.sqrt(16 / 9.81));
    near(M.stateAt(K({ y0: 8, speed: 12, angleDeg: -30 }), t).y, 0, 1e-9);
  });
  test("[vertical up] v = 19.62 m/s at 90 deg: rises v^2/2g = 19.62 m in 2 s and is back after 4 s with the launch speed", () => {
    const s = M.summarize(K({ speed: 19.62, angleDeg: 90 }));
    near(s.tFlight, 4, 1e-12);
    near(s.maxHeight, 19.62, 1e-9);
    near(s.tApex, 2, 1e-12);
    near(s.end.speed, 19.62, 1e-9);
    assert.equal(s.range, 0);
    near(M.stateAt(K({ speed: 19.62, angleDeg: 90 }), 2).vy, 0, 1e-12);
  });
  test("[gravity] on the Moon (1.62 m/s^2) the same launch stays up 9.81/1.62 times longer and goes that much farther and higher", () => {
    const a = M.summarize(K());
    const b = M.summarize(K({ g: 1.62 }));
    near(b.tFlight / a.tFlight, 9.81 / 1.62, 1e-12);
    near(b.range / a.range, 9.81 / 1.62, 1e-12);
    near(b.maxHeight / a.maxHeight, 9.81 / 1.62, 1e-12);
  });
  test("[best angle] brute-force search over angles agrees with tan(a) = v / sqrt(v^2 + 2 g h): 45 deg on level ground, less from a height", () => {
    for (const [v, h, g] of [[20, 0, 9.81], [20, 30, 9.81], [35, 12, 3.71], [8, 80, 9.81]]) {
      let best = -1;
      let bestA = 0;
      for (let a = -20; a <= 89; a += 0.01) {
        const r = M.summarize(K({ speed: v, y0: h, g, angleDeg: a })).range;
        if (r > best) { best = r; bestA = a; }
      }
      near(bestA, M.bestAngleFromHeight(v, h, g), 0.02, `v=${v} h=${h}`);
    }
    near(M.bestAngleFromHeight(20, 0, 9.81), 45, 1e-9);
    assert.ok(M.bestAngleFromHeight(20, 30, 9.81) < 45);
  });
  test("[complementary angles] on level ground 30 deg and 60 deg have the same range but different heights and times", () => {
    const a = M.summarize(K({ angleDeg: 30 }));
    const b = M.summarize(K({ angleDeg: 60 }));
    rel(a.range, b.range, 1e-12);
    assert.ok(b.maxHeight > a.maxHeight && b.tFlight > a.tFlight);
  });
});

describe("degenerate and boundary cases", () => {
  test("[no motion] zero speed on the ground: the flight is over at t = 0 (degenerate), range 0, no division by zero", () => {
    const k = K({ speed: 0, y0: 0, angleDeg: 0 });
    const s = M.summarize(k);
    assert.equal(s.degenerate, true);
    assert.equal(s.tFlight, 0);
    assert.equal(s.range, 0);
    assert.deepEqual(M.sampleTimes(k), [0]);
    for (const v of Object.values(M.stateAt(k, 0))) assert.ok(Number.isFinite(v));
  });
  test("[level or downward launch from the ground] lands immediately; a launch exactly along the ground is not a flight", () => {
    assert.equal(M.summarize(K({ y0: 0, speed: 10, angleDeg: 0 })).tFlight, 0);
    assert.equal(M.summarize(K({ y0: 0, speed: 10, angleDeg: -20 })).tFlight, 0);
  });
  test("[tiny launch speed] 1e-9 m/s upward from the ground: finite, positive, symmetric flight 2v/g", () => {
    const s = M.summarize(K({ speed: 1e-9, angleDeg: 90 }));
    rel(s.tFlight, 2e-9 / 9.81, 1e-9);
    assert.ok(Number.isFinite(s.maxHeight));
  });
  test("[extremes] v = 1000 m/s with g = 0.1 m/s^2 and 10 km height still gives finite, consistent results", () => {
    const k = K({ speed: 1000, y0: 10000, angleDeg: 45, g: 0.1 });
    const s = M.summarize(k);
    near(M.stateAt(k, s.tFlight).y, 0, 1e-6);
    assert.ok(Number.isFinite(s.range) && s.range > 0);
  });
  test("[no landing] upward acceleration or a window without ground never lands; the end is the observation time", () => {
    const up = M.constantKinematics({ x0: 0, y0: 5, vx0: 1, vy0: 2, ax: 0, ay: 3, ground: true, duration: 8 });
    assert.equal(M.landingTime(up), null);
    assert.equal(M.endTime(up), 8);
    const free = M.constantKinematics({ x0: 0, y0: 5, vx0: 1, vy0: 2, ax: 0, ay: -9.81, ground: false, duration: 3 });
    assert.equal(M.landingTime(free), null);
    assert.equal(M.summarize(free).range, null);
    // y0 = 0, moving up with no acceleration never returns
    assert.equal(M.landingTime(M.constantKinematics({ x0: 0, y0: 0, vx0: 0, vy0: 4, ax: 0, ay: 0, ground: true, duration: 5 })), null);
  });
  test("[linear descent] constant downward velocity with no acceleration lands at t = y0 / |vy|", () => {
    near(M.landingTime(M.constantKinematics({ x0: 0, y0: 30, vx0: 2, vy0: -6, ax: 0, ay: 0, ground: true, duration: 5 })), 5, 1e-12);
  });
  test("[falling, then pulled back up] a particle thrown down with upward acceleration that would return to the ground still lands on its FIRST crossing", () => {
    // y = 10 - 6 t + 0.5*4 t^2 = 2t^2 - 6t + 10: discriminant 36 - 80 < 0: never reaches 0
    assert.equal(M.landingTime(M.constantKinematics({ x0: 0, y0: 10, vx0: 0, vy0: -6, ax: 0, ay: 4, ground: true, duration: 5 })), null);
    // y = 2t^2 - 10t + 10: roots (10 +/- sqrt(100-80))/4 = 1.382, 3.618; the first crossing is the landing
    near(M.landingTime(M.constantKinematics({ x0: 0, y0: 10, vx0: 0, vy0: -10, ax: 0, ay: 4, ground: true, duration: 5 })), (10 - Math.sqrt(20)) / 4, 1e-12);
  });
  test("[summary] max height of a launch that only descends is the launch height, and apex time is 0", () => {
    const s = M.summarize(K({ y0: 12, angleDeg: -10 }));
    assert.equal(s.tApex, 0);
    near(s.maxHeight, 12, 0);
  });
});

describe("energy, time synchronisation and sampling", () => {
  test("[energy] 1/2 v^2 + g y is conserved along the whole flight (no air resistance), for ten random launches", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let i = 0; i < 10; i += 1) {
      const g = 1 + rnd() * 20;
      const k = K({ speed: 1 + rnd() * 80, angleDeg: -60 + rnd() * 150, y0: rnd() * 100, g });
      const e0 = M.specificEnergy(M.stateAt(k, 0), g);
      const tf = M.endTime(k);
      for (const f of [0.1, 0.4, 0.75, 1]) rel(M.specificEnergy(M.stateAt(k, tf * f), g), e0, 1e-12);
    }
  });
  test("[landing speed from energy] impact speed = sqrt(v0^2 + 2 g h) for any launch angle", () => {
    for (const a of [-45, 0, 30, 80]) {
      const s = M.summarize(K({ speed: 18, y0: 25, angleDeg: a }));
      near(s.end.speed, Math.sqrt(18 * 18 + 2 * 9.81 * 25), 1e-9);
    }
  });
  test("[synchronisation] the graph samples are exactly stateAt at the sampled times, and include the apex", () => {
    const k = K({ y0: 3, speed: 25, angleDeg: 55 });
    const tr = M.trace(k, 100);
    const s = M.summarize(k);
    assert.ok(tr.t.some((t) => Math.abs(t - s.tApex) < 1e-12));
    tr.t.forEach((t, i) => {
      const st = M.stateAt(k, t);
      assert.equal(tr.x[i], st.x); assert.equal(tr.y[i], st.y); assert.equal(tr.vx[i], st.vx); assert.equal(tr.vy[i], st.vy);
      if (i) assert.ok(t >= tr.t[i - 1]);
    });
    assert.equal(tr.t[0], 0);
    near(tr.t[tr.t.length - 1], s.tFlight, 1e-12);
    near(tr.y[tr.y.length - 1], 0, 1e-9);
  });
  test("[maximum height] vy = 0 at the apex time and the apex height is the largest sampled y", () => {
    const k = K({ y0: 7, speed: 33, angleDeg: 42 });
    const s = M.summarize(k);
    near(M.stateAt(k, s.tApex).vy, 0, 1e-12);
    const tr = M.trace(k, 400);
    near(Math.max(...tr.y), s.maxHeight, 1e-9);
  });
  test("[clamp] times outside the motion are clamped; NaN becomes 0", () => {
    const k = K();
    assert.equal(M.clampTime(k, -3), 0);
    assert.equal(M.clampTime(k, 1e9), M.endTime(k));
    assert.equal(M.clampTime(k, NaN), 0);
  });
  test("[components] 0, 90 and -90 degree launches have exactly zero horizontal/vertical components", () => {
    assert.equal(M.launchComponents(10, 90).vx0, 0);
    assert.equal(M.launchComponents(10, -90).vx0, 0);
    assert.equal(M.launchComponents(10, 0).vy0, 0);
  });
});

describe("parameter validation", () => {
  const good = { x0: 0, y0: 2, speed: 20, angleDeg: 40, g: 9.81 };
  test("[projectile] accepts the example and rejects each out-of-range or non-numeric field", () => {
    assert.equal(M.validateProjectile(good).ok, true);
    for (const bad of [{ y0: -1 }, { speed: -5 }, { speed: 1001 }, { angleDeg: 91 }, { angleDeg: -91 }, { g: 0 }, { g: 31 }, { x0: NaN }, { speed: "20" }, { y0: Infinity }, { g: null }]) {
      assert.equal(M.validateProjectile({ ...good, ...bad }).ok, false, JSON.stringify(bad));
    }
    assert.equal(M.validateProjectile(null).ok, false);
    assert.equal(M.validateProjectile([]).ok, false);
  });
  test("[constant acceleration] the floor needs y0 >= 0; without a floor negative heights are fine; duration is bounded", () => {
    const c = { x0: 0, y0: -5, vx0: 1, vy0: 0, ax: 0, ay: 0, ground: false, duration: 10 };
    assert.equal(M.validateConstantAccel(c).ok, true);
    assert.equal(M.validateConstantAccel({ ...c, ground: true }).ok, false);
    assert.equal(M.validateConstantAccel({ ...c, duration: 0 }).ok, false);
    assert.equal(M.validateConstantAccel({ ...c, duration: 5000 }).ok, false);
    assert.equal(M.validateConstantAccel({ ...c, ground: "yes" }).ok, false);
    assert.equal(M.validateConstantAccel({ ...c, ay: 101 }).ok, false);
  });
  test("[validated copies] unknown fields are dropped", () => {
    const r = M.validateProjectile({ ...good, extra: 1 });
    assert.deepEqual(Object.keys(r.value).sort(), ["angleDeg", "g", "speed", "x0", "y0"]);
  });
});

describe("simulation clock (independent of render rate)", () => {
  test("[rate] advancing 1 s of wall time at rate 2 gives 2 s of simulated time, whether done in 60 frames or 30", () => {
    let a = 0;
    for (let i = 0; i < 60; i += 1) a = C.advanceClock(a, 1000 / 60, 2, 100).t;
    let b = 0;
    for (let i = 0; i < 30; i += 1) b = C.advanceClock(b, 1000 / 30, 2, 100).t;
    near(a, 2, 1e-9);
    near(b, 2, 1e-9);
  });
  test("[end] stops exactly at tEnd and reports done", () => {
    const s = C.advanceClock(4.99, 100, 10, 5);
    assert.deepEqual(s, { t: 5, done: true });
  });
  test("[long pause] a frame after a hidden tab advances at most MAX_FRAME_MS", () => {
    near(C.advanceClock(0, 60_000, 1, 100).t, C.MAX_FRAME_MS / 1000, 1e-12);
  });
  test("[bad input] NaN, negative dt and zero-length motion end safely", () => {
    assert.deepEqual(C.advanceClock(NaN, 16, 1, 5), { t: 0, done: true });
    assert.equal(C.advanceClock(1, -50, 1, 5).t, 1);
    assert.deepEqual(C.advanceClock(0, 16, 1, 0), { t: 0, done: true });
  });
  test("[transient speeds] slow, normal and fast play any span (nanoseconds to hours) in 12, 6 and 3 wall seconds", () => {
    for (const span of [5e-9, 0.02, 5, 3600]) {
      near(span / C.rateForTransient("quarter", span), 12, 1e-9 * 12);
      near(span / C.rateForTransient("real", span), 6, 1e-9 * 6);
      near(span / C.rateForTransient("fast", span), 3, 1e-9 * 3);
    }
    assert.equal(C.rateForTransient("real", 0), 1);
  });
  test("[speeds] fit-to-6-seconds plays any flight in 6 wall seconds; real time is 1x", () => {
    assert.equal(C.rateFor("real", 30), 1);
    assert.equal(C.rateFor("quarter", 30), 0.25);
    near(C.playbackSeconds("fit", 300), C.FIT_SECONDS, 1e-12);
    near(C.playbackSeconds("real", 4), 4, 1e-12);
  });
});

describe("unit-aware formatting", () => {
  test("[SI] values pick a prefix that keeps the mantissa between 1 and 1000", () => {
    assert.equal(F.formatSI(4700, "Ω"), "4.7 kΩ");
    assert.equal(F.formatSI(0.0022, "A"), "2.2 mA");
    assert.equal(F.formatSI(3.3e-6, "F"), "3.3 µF");
    assert.equal(F.formatSI(0, "V"), "0 V");
    assert.equal(F.formatSI(NaN, "V"), "—");
    assert.equal(F.formatSI(-0.05, "A"), "-50 mA");
  });
  test("[axis scale] picks the prefix of the largest value", () => {
    assert.deepEqual(F.siScale(0.0009, "A"), { unit: "µA", factor: 1e-6 });
    assert.deepEqual(F.siScale(2, "s"), { unit: "s", factor: 1 });
    assert.deepEqual(F.siScale(0.05, "s"), { unit: "ms", factor: 1e-3 });
  });
});
