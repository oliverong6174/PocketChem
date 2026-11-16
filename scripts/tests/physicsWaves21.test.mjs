// Stage 21: waves and sound. Expected values are hand-derived (closed forms worked out on paper, or a separate brute-force
// time-of-flight calculation for the Doppler effect); none is produced by the functions under test.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let W;
before(async () => { W = await loadModule("/src/utils/physics/waves.ts"); });
after(async () => { await closeEngine(); });

const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const wave = (o = {}) => ({ A: 0.1, f: 2, v: 4, phiDeg: 0, dir: 1, ...o });

describe("traveling wave relations", () => {
  test("[v = f lambda] f = 2 Hz at 4 m/s: lambda = 2 m, T = 0.5 s, omega = 4 pi, k = pi", () => {
    const q = W.waveQuantities(wave());
    near(q.lambda, 2, 1e-12); near(q.T, 0.5, 1e-12); near(q.omega, 4 * Math.PI, 1e-12); near(q.k, Math.PI, 1e-12);
    near(q.omega / q.k, 4, 1e-12, "omega/k = v");
  });
  test("[sound] 440 Hz at 343 m/s: lambda = 343/440 = 0.779545 m", () => {
    near(W.waveQuantities(wave({ f: 440, v: 343, A: 0.001 })).lambda, 0.7795454545, 1e-9);
  });
  test("[forward] a crest at x = 0.5 m at t = 0 is at x = 1.0 m at t = 0.125 s (it moved v t = 0.5 m to the right)", () => {
    near(W.displacement(wave(), 0.5, 0), 0.1, 1e-12);
    near(W.displacement(wave(), 1.0, 0.125), 0.1, 1e-12);
    near(W.displacement(wave(), 0.5, 0.125), 0, 1e-12);
  });
  test("[reverse] with dir = -1 that crest moves left: it is at x = 0 at t = 0.125 s", () => {
    near(W.displacement(wave({ dir: -1 }), 0.5, 0), 0.1, 1e-12);
    near(W.displacement(wave({ dir: -1 }), 0, 0.125), 0.1, 1e-12);
    near(W.displacement(wave({ dir: -1 }), 1.0, 0.125), -0.1, 1e-12); // phase pi + pi/2: a trough has arrived from the right
  });
  test("[phase] phi = 90 degrees puts a crest at the origin at t = 0; phi = 180 degrees inverts the wave", () => {
    near(W.displacement(wave({ phiDeg: 90 }), 0, 0), 0.1, 1e-12);
    near(W.displacement(wave({ phiDeg: 180 }), 0.5, 0), -0.1, 1e-12);
  });
  test("[periodicity] the wave repeats after one wavelength in x and one period in t", () => {
    for (const [x, t] of [[0.3, 0.07], [1.7, 0.31]]) {
      near(W.displacement(wave(), x + 2, t), W.displacement(wave(), x, t), 1e-12);
      near(W.displacement(wave(), x, t + 0.5), W.displacement(wave(), x, t), 1e-12);
    }
  });
  test("[particle velocity] at a node of displacement the particle speed is the maximum omega A = 4 pi (0.1) = 1.2566 m/s, not the wave speed 4 m/s", () => {
    near(Math.abs(W.particleVelocity(wave(), 0, 0)), 4 * Math.PI * 0.1, 1e-12);
    near(W.particleVelocity(wave(), 0.5, 0), 0, 1e-12, "zero speed at a crest");
    // forward wave: the particle at x = 0, t = 0 is moving up? dy/dt = -omega A cos(0) < 0 for a forward wave
    assert.ok(W.particleVelocity(wave(), 0, 0) < 0);
    assert.ok(W.particleVelocity(wave({ dir: -1 }), 0, 0) > 0);
  });
  test("[numerical derivative] particleVelocity equals the central finite difference of displacement", () => {
    const w = wave({ phiDeg: 40, f: 3, v: 6 });
    const h = 1e-6;
    const fd = (W.displacement(w, 0.37, 0.21 + h) - W.displacement(w, 0.37, 0.21 - h)) / (2 * h);
    near(W.particleVelocity(w, 0.37, 0.21), fd, 1e-6);
    const fx = (W.displacement(w, 0.37 + h, 0.21) - W.displacement(w, 0.37 - h, 0.21)) / (2 * h);
    near(W.slope(w, 0.37, 0.21), fx, 1e-6);
  });
});

describe("longitudinal displacement field", () => {
  test("[compression] at t = 0 the density is 1/(1 - 0.314) = 1.458 at x = 1 m (displacement field falling), 1 at a displacement extremum, and 0.760 at x = 0 where the field rises", () => {
    const k = Math.PI;
    near(W.densityRatio(wave(), 1, 0), 1 / (1 - 0.1 * k), 1e-12);
    near(W.densityRatio(wave(), 0.5, 0), 1, 1e-12);
    near(W.densityRatio(wave(), 0, 0), 1 / (1 + 0.1 * k), 1e-12);
    assert.ok(W.densityRatio(wave(), 1, 0) > 1 && W.densityRatio(wave(), 0, 0) < 1);
  });
  test("[particles stay in order] with A <= 0.15 lambda no two particles ever pass each other", () => {
    const w = wave({ A: 0.15 * 2 });
    for (const t of [0, 0.1, 0.25, 0.4]) {
      let prev = -Infinity;
      for (let i = 0; i <= 60; i++) { const p = W.longitudinalPosition(w, i * 0.1, t); assert.ok(p > prev, `order at t=${t}, i=${i}`); prev = p; }
    }
  });
  test("[oscillation about equilibrium] each particle stays within A of its equilibrium position", () => {
    for (let i = 0; i < 20; i++) for (const t of [0, 0.13, 0.29]) assert.ok(Math.abs(W.longitudinalPosition(wave(), i * 0.2, t) - i * 0.2) <= 0.1 + 1e-12);
  });
  test("[mass conservation] the exact density ratio integrates to the same mass: sum of 1/(1+ds/dx) dx over one wavelength equals... checked as particle spacing = dx (1 + ds/dx) = dx / rho", () => {
    const dx = 1e-5;
    const x0 = 0.8;
    const spacing = W.longitudinalPosition(wave(), x0 + dx, 0.05) - W.longitudinalPosition(wave(), x0, 0.05);
    near(dx / spacing, W.densityRatio(wave(), x0 + dx / 2, 0.05), 1e-5);
  });
});

describe("superposition", () => {
  const sup = (a, b) => ({ v: 4, w1: wave(a), w2: wave(b) });
  const peak = (s, x) => { let m = 0; for (let i = 0; i < 4000; i++) m = Math.max(m, Math.abs(W.sumDisplacement(s, x, (i / 4000) * 0.5))); return m; };
  test("[constructive] equal waves in phase: amplitude 2A = 0.2", () => {
    const s = sup({}, {}); near(peak(s, 0.5), 0.2, 1e-6);
    const c = W.classifySuperposition(s);
    assert.equal(c.kind, "same-direction"); near(c.maxAmplitude, 0.2, 1e-12);
  });
  test("[destructive] equal waves 180 degrees apart cancel", () => {
    const s = sup({}, { phiDeg: 180 }); near(peak(s, 0.5), 0, 1e-12);
    assert.match(W.classifySuperposition(s).title, /destructive/);
  });
  test("[phase 90] amplitude sqrt(A^2 + A^2) = 0.14142", () => {
    const s = sup({}, { phiDeg: 90 }); near(peak(s, 0.3), 0.1 * Math.SQRT2, 1e-5);
    near(W.classifySuperposition(s).maxAmplitude, 0.1 * Math.SQRT2, 1e-12);
  });
  test("[unequal amplitudes in phase] 0.1 + 0.05 = 0.15; opposite phase |0.1 - 0.05| = 0.05", () => {
    near(W.classifySuperposition(sup({}, { A: 0.05 })).maxAmplitude, 0.15, 1e-12);
    near(W.classifySuperposition(sup({}, { A: 0.05, phiDeg: 180 })).maxAmplitude, 0.05, 1e-12);
  });
  test("[standing wave] equal waves in opposite directions: y = 2A sin(kx) cos(wt); node at x = lambda/2 = 1 m for all t, antinode of amplitude 0.2 at x = 0.5 m", () => {
    const s = sup({}, { dir: -1 });
    assert.equal(W.classifySuperposition(s).kind, "standing");
    for (const t of [0, 0.05, 0.11, 0.2, 0.37]) {
      near(W.sumDisplacement(s, 1, t), 0, 1e-12);
      near(W.sumDisplacement(s, 0.5, t), 0.2 * Math.cos(4 * Math.PI * t), 1e-12);
    }
    near(peak(s, 0.5), 0.2, 1e-6);
  });
  test("[standing wave with phases] nodes sit at kx + (phi1+phi2)/2 = n pi: for phi1 = 0, phi2 = 90 degrees the first node is at x = (-pi/4)/pi + 1 = 0.75 m", () => {
    const s = sup({}, { dir: -1, phiDeg: 90 });
    for (const t of [0, 0.09, 0.3]) near(W.sumDisplacement(s, 0.75, t), 0, 1e-12);
    assert.equal(W.classifySuperposition(s).kind, "standing");
  });
  test("[not every opposite pair is standing] unequal amplitudes give a partly standing wave whose minimum amplitude is 0.05, never zero", () => {
    const s = sup({}, { dir: -1, A: 0.05 });
    const c = W.classifySuperposition(s);
    assert.equal(c.kind, "partly-standing"); near(c.minAmplitude, 0.05, 1e-12); near(c.maxAmplitude, 0.15, 1e-12);
    near(peak(s, 1), 0.05, 1e-6, "at a would-be node the amplitude is |A1 - A2|");
  });
  test("[same direction is never a standing wave] and different frequencies are not standing either", () => {
    assert.notEqual(W.classifySuperposition(sup({}, {})).kind, "standing");
    assert.notEqual(W.classifySuperposition({ v: 4, w1: wave(), w2: wave({ f: 2.2, v: 4, dir: -1 }) }).kind, "standing");
  });
  test("[beats] 440 Hz and 444 Hz in a 343 m/s medium: 4 beats per second; the envelope 2A|cos(pi df t)| vanishes at t = 1/8 s and is maximal at t = 1/4 s", () => {
    const s = { v: 343, w1: wave({ f: 440, v: 343, A: 0.001 }), w2: wave({ f: 444, v: 343, A: 0.001 }) };
    const c = W.classifySuperposition(s);
    assert.equal(c.kind, "beats"); near(c.beatFrequency, 4, 1e-12);
    const envMax = (t0) => { let m = 0; for (let i = 0; i <= 200; i++) m = Math.max(m, Math.abs(W.sumDisplacement(s, 0, t0 - 0.0025 + i * 0.000025))); return m; };
    assert.ok(envMax(0.125) < 0.002 * 0.04, "near the beat minimum");
    assert.ok(envMax(0.25) > 0.002 * 0.99, "near the beat maximum");
    near(W.beatEnvelope(0.001, 440, 444, 0.125), 0, 1e-12); near(W.beatEnvelope(0.001, 440, 444, 0.25), 0.002, 1e-12);
    near(W.beatFrequency(440, 444), 4, 1e-12);
  });
  test("[common medium] two waves with different speeds are rejected", () => {
    const bad = W.validateSuperposition({ v: 4, w1: wave(), w2: wave({ v: 5 }) });
    assert.equal(bad.ok, false);
  });
});

describe("standing waves and resonance", () => {
  const R = (o = {}) => ({ kind: "string", L: 1.2, v: 120, n: 3, A: 0.02, ...o });
  test("[string] L = 1.2 m, v = 120 m/s: f1 = v/2L = 50 Hz; third harmonic 150 Hz, lambda = 2L/3 = 0.8 m", () => {
    near(W.harmonicFrequency("string", 1.2, 120, 1), 50, 1e-12);
    near(W.harmonicFrequency("string", 1.2, 120, 3), 150, 1e-12);
    near(W.harmonicWavelength("string", 1.2, 3), 0.8, 1e-12);
    near(W.harmonicFrequency("string", 1.2, 120, 3) * W.harmonicWavelength("string", 1.2, 3), 120, 1e-9, "f lambda = v");
  });
  test("[string nodes] third harmonic: nodes at 0, 0.4, 0.8, 1.2 m (two interior nodes); antinodes at 0.2, 0.6, 1.0 m", () => {
    const nodes = W.nodePositions("string", 1.2, 3); const anti = W.antinodePositions("string", 1.2, 3);
    [0, 0.4, 0.8, 1.2].forEach((e, i) => near(nodes[i], e, 1e-12)); assert.equal(nodes.length, 4);
    [0.2, 0.6, 1.0].forEach((e, i) => near(anti[i], e, 1e-12)); assert.equal(anti.length, 3);
    assert.equal(W.summarizeResonator(R()).interiorNodes, 2);
  });
  test("[string boundary condition] displacement is zero at both fixed ends for every harmonic and for all t; and a node has zero displacement while an antinode reaches the full amplitude", () => {
    for (let n = 1; n <= 12; n++) for (const t of [0, 0.002, 0.0071]) {
      const r = R({ n });
      near(W.standingDisplacement(r, 0, t), 0, 1e-12); near(W.standingDisplacement(r, 1.2, t), 0, 1e-9);
    }
    near(W.standingDisplacement(R(), 0.4, 0.0013), 0, 1e-12);
    near(Math.abs(W.standingDisplacement(R(), 0.2, 0)), 0.02, 1e-12);
  });
  test("[open pipe] L = 0.5 m, v = 340 m/s: f1 = 340 Hz, f2 = 680 Hz; second harmonic displacement nodes at 0.125 and 0.375 m, antinodes at 0, 0.25, 0.5 m (both open ends are displacement antinodes)", () => {
    near(W.harmonicFrequency("open", 0.5, 340, 1), 340, 1e-12); near(W.harmonicFrequency("open", 0.5, 340, 2), 680, 1e-12);
    const n = W.nodePositions("open", 0.5, 2); const a = W.antinodePositions("open", 0.5, 2);
    near(n[0], 0.125, 1e-12); near(n[1], 0.375, 1e-12); assert.equal(n.length, 2);
    near(a[0], 0, 1e-12); near(a[1], 0.25, 1e-12); near(a[2], 0.5, 1e-12);
    near(Math.abs(W.modeShape("open", 0.5, 2, 0)), 1, 1e-12); near(Math.abs(W.modeShape("open", 0.5, 2, 0.5)), 1, 1e-12);
  });
  test("[closed pipe] L = 0.85 m, v = 340 m/s: f1 = v/4L = 100 Hz and only odd harmonics 100, 300, 500 Hz exist", () => {
    near(W.harmonicFrequency("closed", 0.85, 340, 1), 100, 1e-9); near(W.harmonicFrequency("closed", 0.85, 340, 3), 300, 1e-9); near(W.harmonicFrequency("closed", 0.85, 340, 5), 500, 1e-9);
    assert.deepEqual(W.allowedHarmonics("closed", 8), [1, 3, 5, 7]);
    assert.equal(W.allowedHarmonic("closed", 2), false); assert.equal(W.allowedHarmonic("closed", 4), false);
    assert.equal(W.allowedHarmonic("open", 2), true); assert.equal(W.allowedHarmonic("string", 2), true);
    assert.equal(W.validateResonator({ kind: "closed", L: 0.85, v: 340, n: 2, A: 0.001 }).ok, false);
    assert.equal(W.validateResonator({ kind: "closed", L: 0.85, v: 340, n: 3, A: 0.001 }).ok, true);
  });
  test("[closed pipe, n = 3] closed end at x = 0 is a displacement node; nodes at 0 and 2L/3 = 0.5667 m, antinodes at L/3 = 0.2833 m and at the open end 0.85 m", () => {
    const nodes = W.nodePositions("closed", 0.85, 3); const anti = W.antinodePositions("closed", 0.85, 3);
    near(nodes[0], 0, 1e-12); near(nodes[1], 0.5666666667, 1e-9); assert.equal(nodes.length, 2);
    near(anti[0], 0.2833333333, 1e-9); near(anti[1], 0.85, 1e-12); assert.equal(anti.length, 2);
    near(W.modeShape("closed", 0.85, 3, 0), 0, 1e-12); near(Math.abs(W.modeShape("closed", 0.85, 3, 0.85)), 1, 1e-12);
  });
  test("[boundary comparison] same L and v: the closed pipe's fundamental is half the open pipe's, and its wavelength is twice as long (4L versus 2L)", () => {
    near(W.fundamentalFrequency({ kind: "closed", L: 0.5, v: 340, n: 1, A: 0.001 }) * 2, W.fundamentalFrequency({ kind: "open", L: 0.5, v: 340, n: 1, A: 0.001 }), 1e-12);
    near(W.harmonicWavelength("closed", 0.5, 1), 2 * W.harmonicWavelength("open", 0.5, 1), 1e-12);
  });
  test("[node and antinode shape zeros] every reported node is a zero of the mode shape and every antinode has |shape| = 1, for all kinds and allowed harmonics", () => {
    for (const kind of ["string", "open", "closed"]) for (const n of W.allowedHarmonics(kind)) {
      for (const x of W.nodePositions(kind, 2, n)) near(W.modeShape(kind, 2, n, x), 0, 1e-9, `${kind} n=${n} node ${x}`);
      for (const x of W.antinodePositions(kind, 2, n)) near(Math.abs(W.modeShape(kind, 2, n, x)), 1, 1e-9, `${kind} n=${n} antinode ${x}`);
    }
  });
  test("[node counts] string n has n+1 nodes (including ends) and n antinodes; open pipe n has n displacement nodes and n+1 antinodes; closed n has (n+1)/2 of each", () => {
    for (let n = 1; n <= 12; n++) { assert.equal(W.nodePositions("string", 1, n).length, n + 1); assert.equal(W.antinodePositions("string", 1, n).length, n); assert.equal(W.nodePositions("open", 1, n).length, n); assert.equal(W.antinodePositions("open", 1, n).length, n + 1); }
    for (const n of [1, 3, 5, 7]) { assert.equal(W.nodePositions("closed", 1, n).length, (n + 1) / 2); assert.equal(W.antinodePositions("closed", 1, n).length, (n + 1) / 2); }
  });
  test("[validation] rejects non-integer, zero and too-large harmonics, bad length and unknown kinds", () => {
    for (const bad of [{ n: 0 }, { n: 1.5 }, { n: 13 }, { L: 0 }, { L: -1 }, { v: NaN }, { kind: "drum" }, { A: 5 }]) assert.equal(W.validateResonator({ kind: "string", L: 1, v: 100, n: 2, A: 0.01, ...bad }).ok, false, JSON.stringify(bad));
  });
});

describe("Doppler effect", () => {
  const D = (o = {}) => ({ fs: 440, c: 343, vs: 0, vo: 0, ...o });
  test("[source approaching at 40 m/s] f' = 440 x 343/(343 - 40) = 150920/303 = 498.09 Hz", () => near(W.solveDoppler(D({ vs: 40 })).fObserved, 150920 / 303, 1e-9));
  test("[source receding at 40 m/s] f' = 440 x 343/383 = 394.05 Hz", () => near(W.solveDoppler(D({ vs: -40 })).fObserved, 150920 / 383, 1e-9));
  test("[observer approaching at 40 m/s] f' = 440 x 383/343 = 491.31 Hz; observer receding: 440 x 303/343 = 388.69 Hz", () => {
    near(W.solveDoppler(D({ vo: 40 })).fObserved, 168520 / 343, 1e-9);
    near(W.solveDoppler(D({ vo: -40 })).fObserved, 133320 / 343, 1e-9);
  });
  test("[moving source and moving observer differ] the same speed gives 498.09 Hz for the source but 491.31 Hz for the observer", () => {
    const a = W.solveDoppler(D({ vs: 40 })).fObserved; const b = W.solveDoppler(D({ vo: 40 })).fObserved;
    assert.ok(a > b + 5);
  });
  test("[both moving toward each other at 40 m/s] f' = 440 x 383/303 = 556.17 Hz = source-only x observer-only / f", () => {
    const r = W.solveDoppler(D({ vs: 40, vo: 40 }));
    near(r.fObserved, 168520 / 303, 1e-9);
    near(r.fSourceOnly * r.fObserverOnly / 440, r.fObserved, 1e-9);
  });
  test("[same velocity both ways] source and observer moving with the same velocity in the same direction (v_s = -v_o in this convention) in air: f' = f(c - v)/(c - v) = f", () => {
    near(W.solveDoppler(D({ vs: 25, vo: -25 })).fObserved, 440, 1e-9);
    assert.equal(W.solveDoppler(D({ vs: 25, vo: -25 })).trend, "same");
  });
  test("[at rest] no shift; wavelength c/f = 0.7795 m", () => { const r = W.solveDoppler(D()); near(r.fObserved, 440, 1e-12); near(r.lambdaMedium, 343 / 440, 1e-12); });
  test("[wavelength in the medium depends only on the source motion] lambda' = (c - vs)/f = 303/440 = 0.68864 m; f' lambda' = c + vo", () => {
    const r = W.solveDoppler(D({ vs: 40, vo: 20 }));
    near(r.lambdaMedium, 303 / 440, 1e-12); near(r.fObserved * r.lambdaMedium, 363, 1e-9);
  });
  test("[trends] toward = higher, away = lower", () => {
    assert.equal(W.solveDoppler(D({ vs: 10 })).trend, "higher"); assert.equal(W.solveDoppler(D({ vs: -10 })).trend, "lower"); assert.equal(W.solveDoppler(D({ vo: -10 })).trend, "lower");
  });
  test("[independent time-of-flight check] bisection on 'a wavefront emitted at te from the moving source reaches the moving observer' gives the same frequency ratio as the formula", () => {
    const cases = [{ vs: 40, vo: 0 }, { vs: -40, vo: 0 }, { vs: 0, vo: 40 }, { vs: 30, vo: 20 }, { vs: -60, vo: 25 }, { vs: 100, vo: -80 }];
    for (const k of cases) {
      const c = 343, fs = 440, gap = 3000; // metres between source and observer at t = 0 (source at 0, observer at gap)
      const xs = (t) => k.vs * t;           // source moves toward +x (toward the observer) when vs > 0
      const xo = (t) => gap - k.vo * t;      // observer moves toward -x (toward the source) when vo > 0
      const arrival = (te) => { let lo = te, hi = te + 100; for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (c * (mid - te) - (xo(mid) - xs(te)) < 0) lo = mid; else hi = mid; } return (lo + hi) / 2; };
      const te0 = 0; const te1 = 20 / fs; // 20 wave periods apart
      const received = 20 / (arrival(te1) - arrival(te0));
      near(received, W.solveDoppler({ fs, c, ...k }).fObserved, 1e-6, JSON.stringify(k));
    }
  });
  test("[dimensionless wavefront picture agrees with the formula] counting wavefront arrivals per source period gives f'/f", () => {
    for (const k of [{ vs: 80, vo: 0 }, { vs: -80, vo: 0 }, { vs: 0, vo: 60 }, { vs: 50, vo: 30 }]) {
      const d = D(k); const g = W.dopplerGeometry(d);
      const dt = g.arrival(10) - g.arrival(0);
      near(10 / dt, W.solveDoppler(d).ratio, 1e-12, JSON.stringify(k));
      assert.ok(g.tEnd > 0);
    }
  });
  test("[crossing] when source and observer approach, the picture stops before they meet", () => {
    const g = W.dopplerGeometry(D({ vs: 200, vo: 100 }));
    assert.ok(g.sourceX(g.tEnd) < g.observerX(g.tEnd));
  });
  test("[unsupported parameters are rejected, never silently clamped] source at or above the speed of sound, observer at or above c, zero or NaN frequency, tiny c", () => {
    for (const bad of [{ vs: 343 }, { vs: 400 }, { vs: -343 }, { vo: 343 }, { vo: -500 }, { fs: 0 }, { fs: NaN }, { c: 10 }, { vs: Infinity }, { vo: "10" }]) assert.equal(W.validateDoppler({ fs: 440, c: 343, vs: 0, vo: 0, ...bad }).ok, false, JSON.stringify(bad));
    const r = W.validateDoppler({ fs: 440, c: 343, vs: 342, vo: 0 });
    assert.equal(r.ok, true); near(W.solveDoppler(r.value).fObserved, 440 * 343, 1e-6);
    assert.match(W.validateDoppler({ fs: 440, c: 343, vs: 343, vo: 0 }).errors[0], /shock wave/);
  });
});

describe("validation of traveling waves", () => {
  test("[valid defaults] the default wave and superposition validate", () => {
    assert.equal(W.validateWave(W.DEFAULT_WAVE).ok, true); assert.equal(W.validateSuperposition(W.DEFAULT_SUPERPOSITION).ok, true);
  });
  test("[rejected] zero or negative frequency, speed or amplitude, NaN, a bad direction, a huge phase, and an amplitude above 0.15 wavelength", () => {
    for (const bad of [{ f: 0 }, { f: -1 }, { v: 0 }, { A: 0 }, { A: NaN }, { dir: 0 }, { dir: 2 }, { phiDeg: 1000 }, { A: 0.31 }, { f: 1e9 }]) assert.equal(W.validateWave(wave(bad)).ok, false, JSON.stringify(bad));
    assert.equal(W.validateWave(wave({ A: 0.3 })).ok, true, "0.15 x 2 m is exactly allowed");
    assert.equal(W.validateWave(null).ok, false); assert.equal(W.validateWave("x").ok, false);
  });
  test("[time window] two close frequencies are shown for two beat periods (capped at 120 carrier cycles), unrelated frequencies for three periods of the slower wave", () => {
    const close = { v: 343, w1: wave({ f: 440, v: 343 }), w2: wave({ f: 444, v: 343 }) };
    near(W.superpositionEnd(close), 120 / 444, 1e-12); // two beat periods (0.5 s) would hold 220 carrier cycles: capped at 120 cycles
    near(W.superpositionEnd({ v: 4, w1: wave({ f: 4 }), w2: wave({ f: 4.5 }) }), 4, 1e-12); // two beat periods of 0.5 Hz
    const far = { v: 4, w1: wave({ f: 2 }), w2: wave({ f: 5 }) };
    near(W.superpositionEnd(far), 1.5, 1e-12);
    near(W.superpositionEnd({ v: 4, w1: wave(), w2: wave() }), 1.5, 1e-12);
  });
});
