// Stage 28: atomic structure. Expected values are closed forms, hand calculations or the NIST ground-state tables downloaded in Stage 28
// (scripts/reference/stage28/nist-ground-states.json); none is read from the functions under test. Quadrature is written in this file.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let Q, H, C;
before(async () => {
  Q = await loadModule("/src/utils/generalChem/quantum28.ts");
  H = await loadModule("/src/utils/generalChem/hydrogenic28.ts");
  C = await loadModule("/src/utils/generalChem/config28.ts");
});
after(async () => { await closeEngine(); });
const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const rel = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${label} expected ${b} (rel ${tol}), got ${a}`);
const SUPPORTED = [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2]];
/** Composite Simpson rule, written here. */
function simpson(f, a, b, n = 4000) { const h = (b - a) / n; let s = f(a) + f(b); for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return (s * h) / 3; }

describe("quantum numbers", () => {
  test("[valid] n >= 1, 0 <= l <= n-1, -l <= ml <= l, ms = +-1/2", () => {
    for (const q of [{ n: 1, l: 0, ml: 0, ms: 1 }, { n: 2, l: 1, ml: -1, ms: -1 }, { n: 3, l: 2, ml: 2, ms: 1 }, { n: 4, l: 3, ml: -3, ms: -1 }]) assert.equal(Q.checkQuantumNumbers(q).ok, true, JSON.stringify(q));
  });
  test("[invalid] each broken rule is reported with its own reason", () => {
    const bad = (q, re) => { const r = Q.checkQuantumNumbers(q); assert.equal(r.ok, false, JSON.stringify(q)); assert.ok(r.reasons.some((x) => re.test(x)), `${JSON.stringify(q)} -> ${r.reasons}`); };
    bad({ n: 0, l: 0, ml: 0 }, /n must/); bad({ n: 1, l: 1, ml: 0 }, /at most n/); bad({ n: 2, l: 1, ml: 2 }, /between/); bad({ n: 3, l: -1, ml: 0 }, /l must/);
    bad({ n: 2, l: 1, ml: 0, ms: 0 }, /m_s/); bad({ n: 2.5, l: 0, ml: 0 }, /n must/); bad({ n: 2, l: 0, ml: 1 }, /between/); bad({ n: 1, l: 0, ml: 0, ms: 2 }, /m_s/);
  });
  test("[capacity] s 2, p 6, d 10, f 14 electrons; 1, 3, 5, 7 orbitals", () => {
    assert.deepEqual([0, 1, 2, 3].map(Q.subshellCapacity), [2, 6, 10, 14]);
    assert.deepEqual([0, 1, 2, 3].map(Q.subshellOrbitalCount), [1, 3, 5, 7]);
  });
  test("[shell] n^2 orbitals and 2n^2 states; enumeration agrees and has no repeated (l, ml)", () => {
    for (let n = 1; n <= 7; n++) {
      const orbs = Q.enumerateOrbitals(n); assert.equal(orbs.length, n * n); assert.equal(Q.enumerateStates(n).length, 2 * n * n);
      assert.equal(new Set(orbs.map((o) => `${o.l},${o.ml}`)).size, n * n); assert.equal(Q.shellCapacity(n), 2 * n * n);
      assert.equal(orbs.reduce((s, o) => s + 0, 0), 0);
    }
    assert.deepEqual(Q.enumerateOrbitals(0), []); assert.deepEqual(Q.enumerateOrbitals(8), []);
  });
  test("[states vs orbitals] two spin states per orbital; the 2p subshell has 3 orbitals and 6 states", () => {
    const p2 = Q.enumerateStates(2).filter((s) => s.l === 1); assert.equal(p2.length, 6); assert.equal(new Set(p2.map((s) => s.ml)).size, 3);
    assert.equal(Q.hydrogenicDegeneracy(3), 9);
  });
  test("[nodes] radial n-l-1, angular l (OpenStax 6.3 rule), total n-1", () => {
    assert.deepEqual(Q.nodeCounts(4, 3), { radial: 0, angular: 3, total: 3 }); assert.equal(Q.nodeCounts(4, 1).radial, 2); assert.equal(Q.nodeCounts(7, 3).radial, 3); assert.equal(Q.nodeCounts(5, 2).radial, 2);
  });
});

describe("hydrogenic radial functions", () => {
  for (const Z of [1, 2, 3]) for (const [n, l] of SUPPORTED) {
    test(`[normalization] ∫R² r² dr = 1 for ${n}${"spd"[l]}, Z = ${Z}`, () => {
      const integral = simpson((r) => H.radialR(n, l, r, Z) ** 2 * r * r, 0, 80 / Z, 8000);
      near(integral, 1, 1e-6);
    });
  }
  test("[expectation] ⟨r⟩ = (3n² − l(l+1))/2Z agrees with numerical ∫ r·P(r) dr; hand values 1.5, 6, 5, 13.5, 12.5, 10.5", () => {
    const hand = { "1,0": 1.5, "2,0": 6, "2,1": 5, "3,0": 13.5, "3,1": 12.5, "3,2": 10.5 };
    for (const [n, l] of SUPPORTED) {
      const num = simpson((r) => r * r * r * H.radialR(n, l, r, 1) ** 2, 0, 90, 9000);
      near(num, hand[`${n},${l}`], 1e-5, `${n},${l}`); near(H.expectationR(n, l, 1), hand[`${n},${l}`], 1e-12);
    }
  });
  test("[Z scaling] the orbital shrinks as 1/Z: ⟨r⟩(Z) = ⟨r⟩(1)/Z and R(Z; r) = Z^1.5 R(1; Zr)", () => {
    for (const Z of [2, 3, 4]) { rel(H.expectationR(2, 1, Z), 5 / Z, 1e-12); for (const r of [0.2, 0.9, 2.3]) rel(H.radialR(3, 1, r, Z), Z ** 1.5 * H.radialR(3, 1, Z * r, 1), 1e-12); }
  });
  test("[radial nodes] count of sign changes of R on a fine grid equals n − l − 1, at the closed-form radii", () => {
    for (const [n, l] of SUPPORTED) {
      let changes = 0; let prev = Math.sign(H.radialR(n, l, 0.0137)); const found = [];
      for (let r = 0.02; r < 60; r += 0.0137) { const s = Math.sign(H.radialR(n, l, r)); if (s !== 0 && prev !== 0 && s !== prev) { changes++; found.push(r); } if (s !== 0) prev = s; }
      assert.equal(changes, n - l - 1, `${n},${l}`);
      const want = { "2,0": [2], "3,0": [(9 - 3 * Math.sqrt(3)) / 2, (9 + 3 * Math.sqrt(3)) / 2], "3,1": [6] }[`${n},${l}`] ?? [];
      const got = H.radialNodeRadii(n, l, 1); assert.equal(got.length, want.length);
      want.forEach((w, i) => { near(got[i], w, 1e-12); near(found[i], w, 0.03); });
    }
    near(H.radialNodeRadii(3, 0, 1)[0], 1.9019237886, 1e-9); near(H.radialNodeRadii(2, 0, 2)[0], 1, 1e-12);
  });
  test("[probability peaks] 1s at 1 a0, 2p at 4, 3d at 9; 2s has lobes at 3 ± √5 (0.764 and 5.236)", () => {
    near(H.radialPeaks(1, 0, 1)[0], 1, 0.01); near(H.radialPeaks(2, 1, 1)[0], 4, 0.01); near(H.radialPeaks(3, 2, 1)[0], 9, 0.01);
    const p = H.radialPeaks(2, 0, 1); assert.equal(p.length, 2); near(p[0], 3 - Math.sqrt(5), 0.02); near(p[1], 3 + Math.sqrt(5), 0.02);
    assert.equal(H.radialPeaks(3, 0, 1).length, 3); assert.equal(H.radialPeaks(3, 1, 1).length, 2);
  });
  test("[1s density at the nucleus] |ψ(0)|² = Z³/π", () => {
    for (const Z of [1, 2, 3]) rel(H.density(1, 0, 0, "real", 0, 0, 0, Z), Z ** 3 / Math.PI, 1e-12);
    assert.equal(H.density(2, 1, 0, "real", 0, 0, 0, 1), 0); // p orbitals vanish at the nucleus
  });
  test("[unsupported] orbitals outside 1s…3d give NaN rather than a made-up value", () => { assert.ok(Number.isNaN(H.radialR(4, 0, 1, 1))); assert.equal(H.isSupportedOrbital(4, 0), false); });
});

describe("angular functions", () => {
  const sphere = (f, n = 120) => { // ∫ f(θ,φ) sinθ dθ dφ
    return simpson((th) => Math.sin(th) * simpson((ph) => f(th, ph), 0, 2 * Math.PI, 2 * n), 0, Math.PI, n);
  };
  const cart = (th, ph) => [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
  test("[real basis] each of the nine real functions is normalised and they are mutually orthogonal", () => {
    const fns = [[0, 0], [1, 0], [1, 1], [1, -1], [2, 0], [2, 1], [2, -1], [2, 2], [2, -2]];
    for (let a = 0; a < fns.length; a++) for (let b = a; b < fns.length; b++) {
      const v = sphere((th, ph) => { const [x, y, z] = cart(th, ph); return H.realAngular(...fns[a], x, y, z) * H.realAngular(...fns[b], x, y, z); }, 100);
      near(v, a === b ? 1 : 0, 1e-5, `${fns[a]}|${fns[b]}`);
    }
  });
  test("[complex basis] |Y_lm|² integrates to 1, and Σ_m |Y_lm|² = (2l+1)/4π (Unsöld) in both bases", () => {
    for (let l = 0; l <= 2; l++) {
      for (let m = -l; m <= l; m++) near(sphere((th, ph) => { const y = H.complexAngular(l, m, th, ph); return y.re * y.re + y.im * y.im; }, 100), 1, 1e-5);
      for (const [th, ph] of [[0.4, 1.1], [1.3, 4.0], [2.6, 0.2]]) {
        let sc = 0; let sr = 0; const [x, y, z] = cart(th, ph);
        for (let m = -l; m <= l; m++) { const c = H.complexAngular(l, m, th, ph); sc += c.re * c.re + c.im * c.im; sr += H.realAngular(l, m, x, y, z) ** 2; }
        near(sc, (2 * l + 1) / (4 * Math.PI), 1e-12); near(sr, (2 * l + 1) / (4 * Math.PI), 1e-12);
      }
    }
  });
  test("[Condon–Shortley] Y_1^1 = −√(3/8π) sinθ e^{iφ}; Y_1^{-1} = +√(3/8π) sinθ e^{-iφ}", () => {
    const y1 = H.complexAngular(1, 1, Math.PI / 2, 0); near(y1.re, -Math.sqrt(3 / (8 * Math.PI)), 1e-12); near(y1.im, 0, 1e-12);
    const ym = H.complexAngular(1, -1, Math.PI / 2, 0); near(ym.re, Math.sqrt(3 / (8 * Math.PI)), 1e-12);
    const yi = H.complexAngular(1, 1, Math.PI / 2, Math.PI / 2); near(yi.re, 0, 1e-12); near(yi.im, -Math.sqrt(3 / (8 * Math.PI)), 1e-12);
  });
  test("[angular nodes] sign changes along θ (generic φ) give l − |m|; along φ at fixed θ give 2|m| crossings = |m| planes; total l", () => {
    const cases = [[0, 0], [1, 0], [1, 1], [1, -1], [2, 0], [2, 1], [2, -1], [2, 2], [2, -2]];
    for (const [l, m] of cases) {
      const phi0 = 0.3; let tn = 0; let prev = 0;
      for (let k = 1; k < 2000; k++) { const th = (Math.PI * k) / 2000; const [x, y, z] = cart(th, phi0); const s = Math.sign(H.realAngular(l, m, x, y, z)); if (s && prev && s !== prev) tn++; if (s) prev = s; }
      let pn = 0; prev = 0;
      for (let k = 0; k < 4000; k++) { const ph = (2 * Math.PI * (k + 0.37)) / 4000; const [x, y, z] = cart(1.0, ph); const s = Math.sign(H.realAngular(l, m, x, y, z)); if (s && prev && s !== prev) pn++; if (s) prev = s; }
      const first = Math.sign(H.realAngular(l, m, ...cart(1.0, 0.37 * 2 * Math.PI / 4000))); if (first && first !== prev) pn++; // wrap-around
      const a = H.angularNodes(l, m, "real");
      assert.equal(a.thetaNodes, tn, `θ nodes l=${l} m=${m}`); assert.equal(a.planesThroughAxis * 2, pn, `φ crossings l=${l} m=${m}`); assert.equal(a.total, l);
    }
  });
  test("[complex density] depends on θ but not φ; for m ≠ 0 it vanishes on the z axis and has l − |m| θ-nodes", () => {
    for (const [l, m] of [[1, 1], [2, 1], [2, -2], [1, -1]]) {
      const d = (th, ph) => { const y = H.complexAngular(l, m, th, ph); return y.re * y.re + y.im * y.im; };
      near(d(0.9, 0.2), d(0.9, 4.4), 1e-14); near(d(0, 0), 0, 1e-14);
    }
    assert.equal(H.angularNodes(2, 1, "complex").total, 1); assert.equal(H.angularNodes(1, 1, "complex").total, 0); assert.equal(H.angularNodes(2, 0, "complex").total, 2);
  });
  test("[parity] ψ(−r) = (−1)^l ψ(r) for every supported real orbital; p_x density is mirror-symmetric in x, y, z", () => {
    for (const [n, l] of SUPPORTED) for (let m = -l; m <= l; m++) for (const [x, y, z] of [[0.7, 1.1, -0.4], [2.3, -0.5, 1.6]]) {
      near(H.psi(n, l, m, "real", -x, -y, -z).re, (l % 2 ? -1 : 1) * H.psi(n, l, m, "real", x, y, z).re, 1e-13, `${n}${l}${m}`);
      near(H.density(n, l, m, "real", -x, -y, -z), H.density(n, l, m, "real", x, y, z), 1e-14);
    }
    near(H.density(2, 1, 1, "real", 1.3, 0.6, 0.2), H.density(2, 1, 1, "real", -1.3, 0.6, 0.2), 1e-14);
  });
  test("[nodal planes] p_z is zero in the xy plane, d_xy in the xz and yz planes, d_z² on the cone cos²θ = 1/3", () => {
    near(H.psi(2, 1, 0, "real", 2, 1.5, 0).re, 0, 1e-15); near(H.psi(3, 2, -2, "real", 2, 0, 1.5).re, 0, 1e-15); near(H.psi(3, 2, -2, "real", 0, 2, 1.5).re, 0, 1e-15);
    const c = Math.sqrt(1 / 3); near(H.psi(3, 2, 0, "real", Math.sqrt(1 - c * c) * 4, 0, c * 4).re, 0, 1e-13);
  });
  test("[names] real orbital convention: ml=+1 → p_x, −1 → p_y; d: +1 d_xz, −1 d_yz, +2 d_x²−y², −2 d_xy", () => {
    assert.equal(H.realOrbitalName(1, 1), "p_x"); assert.equal(H.realOrbitalName(1, -1), "p_y"); assert.equal(H.realOrbitalName(2, 2), "d_x²−y²"); assert.equal(H.realOrbitalName(2, -2), "d_xy"); assert.equal(H.realOrbitalName(0, 0), "s");
  });
});

describe("grids", () => {
  test("[slice] largest 1s density on a slice through the nucleus is Z³/π; a nodal plane gives an all-zero slice", () => {
    const g = H.sliceGrid({ n: 1, l: 0, ml: 0, basis: "real", plane: "xz", Z: 1 }); near(g.maxDensity, 1 / Math.PI, 0.01 / Math.PI);
    const z = H.sliceGrid({ n: 2, l: 1, ml: 0, basis: "real", plane: "xy", Z: 1 }); assert.equal(z.maxDensity, 0);
    const g2 = H.sliceGrid({ n: 1, l: 0, ml: 0, basis: "real", plane: "xz", Z: 2 }); assert.ok(g2.maxDensity > 7 / Math.PI);
    assert.equal(g.density.length, g.N * g.N);
  });
  test("[slice symmetry] p_x on xz is left-right symmetric in density and antisymmetric in amplitude; d_z² density is symmetric under z → −z", () => {
    const g = H.sliceGrid({ n: 2, l: 1, ml: 1, basis: "real", plane: "xz", Z: 1 }); const N = g.N;
    for (const [i, j] of [[10, 30], [25, 40], [5, 5]]) { near(g.density[j * N + i], g.density[j * N + (N - 1 - i)], 1e-14); near(g.amplitude[j * N + i], -g.amplitude[j * N + (N - 1 - i)], 1e-14); }
    const d = H.sliceGrid({ n: 3, l: 2, ml: 0, basis: "real", plane: "xz", Z: 1 });
    for (const [i, j] of [[12, 20], [30, 8]]) near(d.density[j * N + i], d.density[(N - 1 - j) * N + i], 1e-14);
  });
  test("[enclosure] the 3-D grid captures nearly all probability, and the 90 % surface of 1s lies at r90 = 2.66 a0 from the closed-form CDF", () => {
    for (const [n, l] of SUPPORTED) { const t = H.enclosureTable(n, l, 0, "real", 1); near(t.gridTotal, 1, 0.04, `${n}${l}`); }
    const t = H.enclosureTable(1, 0, 0, "real", 1); const iso = H.isoDensityForEnclosure(t, 0.9);
    const cdf = (r) => 1 - Math.exp(-2 * r) * (1 + 2 * r + 2 * r * r); let lo = 0; let hi = 10; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (cdf(m) < 0.9) lo = m; else hi = m; }
    near(lo, 2.66, 0.01); near(cdf(2.66), 0.9, 2e-4); /* hand check: e^-5.32 (1 + 5.32 + 14.15) = 0.0999 */ rel(iso, Math.exp(-2 * lo) / Math.PI, 0.12);
    assert.ok(H.isoDensityForEnclosure(t, 0.5) > H.isoDensityForEnclosure(t, 0.99));
  });
  test("[describe] orbital descriptions carry nodes, mean radius, messages for invalid or unsupported input", () => {
    const d = H.describeOrbital(3, 1, 0, "real", 1); assert.equal(d.radialNodes, 1); assert.equal(d.angularNodes, 1); assert.equal(d.totalNodes, 2); near(d.nodeRadii[0], 6, 1e-12); near(d.meanRadius, 12.5, 1e-12);
    assert.equal(H.describeOrbital(2, 2, 0, "real").valid, false); assert.equal(H.describeOrbital(4, 3, 0, "real").supported, false); assert.equal(H.describeOrbital(4, 3, 0, "real").valid, true);
  });
});

describe("hydrogenic energies and transitions", () => {
  // independent: R∞ = 1.0973731568160e7 m^-1 (CODATA 2018) → 1/λ = R∞ Z² (1/nf² − 1/ni²)
  const RINF = 1.097373156816e7;
  const lamNm = (ni, nf, Z = 1) => 1e9 / (RINF * Z * Z * Math.abs(1 / (nf * nf) - 1 / (ni * ni)));
  test("[constants] hc = 1239.84198 eV·nm; Rydberg energy 13.605693 eV", () => { near(H.HC_EV_NM, 1239.841984, 1e-5); near(H.RYDBERG_EV, 13.605693123, 1e-9); });
  test("[levels] E_n = −13.6057/n² eV; E_1(He⁺) = −54.4228 eV; 4× for Z = 2", () => {
    near(H.hydrogenicEnergyEV(1), -13.605693, 1e-6); near(H.hydrogenicEnergyEV(2), -3.401423, 1e-6); near(H.hydrogenicEnergyEV(3), -1.511744, 1e-6); near(H.hydrogenicEnergyEV(1, 2), -54.422772, 1e-5); near(H.hydrogenicEnergyEV(2, 3), -13.605693 * 9 / 4, 1e-6);
    assert.ok(H.hydrogenicEnergyEV(2) > H.hydrogenicEnergyEV(1)); near(H.ionisationEnergyEV(1), 13.6057, 1e-4);
  });
  test("[Balmer] H-alpha 3→2: 1.8897 eV, 656.11 nm (infinite nuclear mass), visible, emission", () => {
    const t = H.transition(3, 2, 1).value; near(t.photonEV, (13.605693123 * 5) / 36, 1e-9); near(t.wavelengthNm, lamNm(3, 2), 1e-4); near(t.wavelengthNm, 656.11, 0.01);
    assert.equal(t.kind, "emission"); assert.equal(t.region, "visible"); assert.equal(t.series, "Balmer"); assert.equal(t.lowerLevel, 2);
    near(t.frequencyHz, 2.99792458e8 / (t.wavelengthNm * 1e-9), 1e5); near(t.frequencyHz, 4.5693e14, 2e10);
  });
  test("[Balmer visible set] 3→2 656, 4→2 486, 5→2 434, 6→2 410, 7→2 397, 8→2 389, 9→2 383 are visible; 10→2 380 is not (UV cut at 380 nm)", () => {
    const want = { 3: 656.11, 4: 486.01, 5: 433.94, 6: 410.07, 7: 396.9, 8: 388.8, 9: 383.4, 10: 379.7 };
    for (const [ni, w] of Object.entries(want)) { const t = H.transition(Number(ni), 2, 1).value; near(t.wavelengthNm, lamNm(Number(ni), 2), 1e-4); near(t.wavelengthNm, w, 0.35, `n=${ni}`); assert.equal(t.region, Number(ni) <= 9 ? "visible" : "ultraviolet", `n=${ni}`); }
  });
  test("[Lyman, Paschen] Lyman-α 2→1 121.50 nm UV; Lyman limit 91.13 nm; Paschen-α 3→4 absorption 1875 nm infrared", () => {
    near(H.transition(2, 1).value.wavelengthNm, lamNm(2, 1), 1e-4); near(H.transition(2, 1).value.wavelengthNm, 121.5, 0.05); assert.equal(H.transition(2, 1).value.region, "ultraviolet"); assert.equal(H.transition(2, 1).value.series, "Lyman");
    near(H.seriesLimitNm(1, 1), 91.13, 0.01); near(H.seriesLimitNm(2, 1), 364.5, 0.1);
    const p = H.transition(3, 4).value; assert.equal(p.kind, "absorption"); near(p.wavelengthNm, lamNm(4, 3), 1e-4); near(p.wavelengthNm, 1874.6, 0.5); assert.equal(p.region, "infrared"); assert.equal(p.series, "Paschen");
  });
  test("[absorption and emission] the same pair gives the same photon in opposite directions", () => {
    const a = H.transition(1, 4).value; const e = H.transition(4, 1).value; assert.equal(a.kind, "absorption"); assert.equal(e.kind, "emission"); near(a.wavelengthNm, e.wavelengthNm, 1e-12); near(a.Ef - a.Ei, e.Ei - e.Ef, 1e-12);
  });
  test("[Z scaling] He⁺ lines are 4× the energy and 1/4 the wavelength of the same transition in hydrogen; no named series for Z > 1", () => {
    const h = H.transition(3, 2, 1).value; const he = H.transition(3, 2, 2).value; rel(he.photonEV, 4 * h.photonEV, 1e-12); rel(he.wavelengthNm, h.wavelengthNm / 4, 1e-12); assert.equal(he.series, null); near(he.wavelengthNm, lamNm(3, 2, 2), 1e-4);
  });
  test("[series lines] the Balmer series has nine lines up to n = 10, wavelengths decrease toward the 364.5 nm limit", () => {
    const L = H.seriesLines(2, 1); assert.equal(L.length, 8); for (let i = 1; i < L.length; i++) assert.ok(L[i].wavelengthNm < L[i - 1].wavelengthNm); assert.ok(L.at(-1).wavelengthNm > H.seriesLimitNm(2, 1));
  });
  test("[invalid input] equal levels, n < 1 or > 10, non-integers and unsupported Z are refused with messages", () => {
    for (const a of [[2, 2, 1], [0, 1, 1], [11, 1, 1], [1.5, 2, 1], [3, 2, 5], [3, 2, 0], [3, 2, 1.5], [NaN, 2, 1]]) { const r = H.transition(...a); assert.equal(r.ok, false, JSON.stringify(a)); assert.ok(r.error.length > 10); }
  });
  test("[colour] visible wavelengths map to colours, others to null; the approximation is only a display aid", () => {
    assert.equal(H.wavelengthToRgb(300), null); assert.equal(H.wavelengthToRgb(900), null); const red = H.wavelengthToRgb(650); assert.ok(red[0] > 200 && red[2] < 30); const blue = H.wavelengthToRgb(460); assert.ok(blue[2] > blue[0]);
  });
});

describe("electron configurations", () => {
  const nist = JSON.parse(fs.readFileSync(path.join(root, "scripts", "reference", "stage28", "nist-ground-states.json"), "utf8"));
  test("[NIST ground states] all 36 neutral atoms equal the NIST Handbook configuration", () => {
    assert.equal(nist.rows.length, 36);
    for (const row of nist.rows) { const r = C.configurationFor(row.Z, 0); assert.ok(r.ok); assert.equal(C.compactConfiguration(r.value.occupation), row.raw[0].conf, `Z=${row.Z}`); }
  });
  test("[Aufbau exceptions] within Z ≤ 36 the Madelung order is wrong exactly for Cr and Cu; every other atom equals its Aufbau configuration", () => {
    for (let Z = 1; Z <= 36; Z++) { const r = C.configurationFor(Z, 0).value; const same = C.compactConfiguration(r.occupation) === C.compactConfiguration(r.aufbau); assert.equal(same, ![24, 29].includes(Z), `Z=${Z}`); assert.equal(r.isException, [24, 29].includes(Z)); }
    assert.equal(C.formatConfiguration(C.configurationFor(24).value.occupation, { noble: true }), "[Ar] 3d⁵ 4s¹"); assert.equal(C.formatConfiguration(C.configurationFor(29).value.aufbau, { noble: true }), "[Ar] 3d⁹ 4s²");
    assert.equal(C.formatConfiguration(C.configurationFor(29).value.occupation, { noble: true }), "[Ar] 3d¹⁰ 4s¹");
  });
  test("[electron counts] the electrons in every neutral configuration equal Z; ions equal Z − charge", () => {
    for (let Z = 1; Z <= 36; Z++) assert.equal(C.electronCount(C.configurationFor(Z, 0).value.occupation), Z);
    for (const [Z, q] of [[26, 3], [29, 2], [8, -2], [17, -1], [35, -1], [20, 2], [1, 1], [1, -1]]) assert.equal(C.electronCount(C.configurationFor(Z, q).value.occupation), Z - q);
  });
  test("[unpaired electrons] by Hund's rule: H1 He0 B1 C2 N3 O2 F1 Ne0 Na1 Cr6 Mn5 Fe4 Co3 Ni2 Cu1 Zn0 Ga1 As3 Kr0", () => {
    const want = { 1: 1, 2: 0, 5: 1, 6: 2, 7: 3, 8: 2, 9: 1, 10: 0, 11: 1, 24: 6, 25: 5, 26: 4, 27: 3, 28: 2, 29: 1, 30: 0, 31: 1, 33: 3, 36: 0 };
    for (const [Z, u] of Object.entries(want)) assert.equal(C.configurationFor(Number(Z)).value.unpaired, u, `Z=${Z}`);
  });
  test("[cations] 4s is removed before 3d: Fe²⁺ 3d⁶, Fe³⁺ 3d⁵, Mn²⁺ 3d⁵, Cr³⁺ 3d³, Cu⁺ 3d¹⁰, Cu²⁺ 3d⁹, Zn²⁺ 3d¹⁰, Ti²⁺ 3d²; main group removes p before s", () => {
    const f = (Z, q) => C.formatConfiguration(C.configurationFor(Z, q).value.occupation, { noble: true });
    assert.equal(f(26, 2), "[Ar] 3d⁶"); assert.equal(f(26, 3), "[Ar] 3d⁵"); assert.equal(f(25, 2), "[Ar] 3d⁵"); assert.equal(f(24, 3), "[Ar] 3d³"); assert.equal(f(29, 1), "[Ar] 3d¹⁰"); assert.equal(f(29, 2), "[Ar] 3d⁹"); assert.equal(f(30, 2), "[Ar] 3d¹⁰"); assert.equal(f(22, 2), "[Ar] 3d²");
    assert.equal(f(31, 1), "[Ar] 3d¹⁰ 4s²"); assert.equal(f(31, 3), "[Ar] 3d¹⁰"); assert.equal(f(13, 3), "[Ne]"); assert.equal(f(19, 1), "[Ar]"); assert.equal(f(11, 1), "[Ne]"); assert.equal(f(20, 2), "[Ar]");
    assert.equal(C.configurationFor(26, 2).value.unpaired, 4); assert.equal(C.configurationFor(26, 3).value.unpaired, 5); assert.equal(C.configurationFor(1, 1).value.electrons, 0); assert.equal(C.formatConfiguration([], {}), "no electrons");
  });
  test("[anions] fill the next Aufbau subshell: O²⁻, F⁻, N³⁻ = [Ne]; Cl⁻, S²⁻, P³⁻ = [Ar]; Br⁻ = [Kr]; H⁻ = 1s²", () => {
    const f = (Z, q) => C.formatConfiguration(C.configurationFor(Z, q).value.occupation, { noble: true });
    for (const [Z, q, w] of [[8, -2, "[Ne]"], [9, -1, "[Ne]"], [7, -3, "[Ne]"], [17, -1, "[Ar]"], [16, -2, "[Ar]"], [15, -3, "[Ar]"], [35, -1, "[Kr]"], [1, -1, "[He]"], [6, -1, "[He] 2s² 2p³"]]) assert.equal(f(Z, q), w, `${Z},${q}`);
    assert.equal(C.configurationFor(8, -2).value.status, "filling-rule"); assert.equal(C.configurationFor(26, 2).value.status, "removal-rule"); assert.equal(C.configurationFor(26, 0).value.status, "reference-atom");
  });
  test("[NIST ions] the removal rule agrees with the NIST gas-phase ion configuration for every +1 ion in the table except V⁺, Co⁺ and Ni⁺, and those three carry a note", () => {
    const differ = [];
    for (const row of nist.rows) { if (row.raw.length < 2) continue; const mine = C.compactConfiguration(C.configurationFor(row.Z, 1).value.occupation); if (mine !== row.raw[1].conf) differ.push(row.Z); }
    assert.deepEqual(differ, [23, 27, 28]);
    for (const Z of [23, 27, 28]) { const r = C.configurationFor(Z, 1).value; assert.ok(r.gasPhaseNote); const g = C.parseConfiguration(C.GAS_PHASE_CATION_EXCEPTIONS[Z]); assert.equal(C.compactConfiguration(g), nist.rows[Z - 1].raw[1].conf); }
    assert.equal(C.configurationFor(26, 1).value.gasPhaseNote, null);
  });
  test("[unsupported] bad Z or charge, too many electrons removed, d-block and over-full anions, noble-gas anions are refused", () => {
    for (const a of [[0, 0], [37, 0], [1.5, 0], [8, -4], [8, 9], [2, 3], [10, -1], [26, -1], [8, -3], [3.5, 1]]) assert.equal(C.configurationFor(...a).ok, false, JSON.stringify(a));
  });
  test("[orbital boxes] Hund: N 2p ↑↑↑, O 2p ↑↓ ↑ ↑, Fe 3d ↑↓ ↑ ↑ ↑ ↑, Cr 3d five singles and 4s single; Pauli: no box above 2", () => {
    const b = (Z, q = 0) => C.orbitalBoxes(C.configurationFor(Z, q).value.occupation);
    assert.deepEqual(b(7).find((s) => s.label === "2p").boxes, [1, 1, 1]); assert.deepEqual(b(8).find((s) => s.label === "2p").boxes, [3, 1, 1]); assert.deepEqual(b(26).find((s) => s.label === "3d").boxes, [3, 1, 1, 1, 1]);
    assert.deepEqual(b(24).find((s) => s.label === "3d").boxes, [1, 1, 1, 1, 1]); assert.deepEqual(b(24).find((s) => s.label === "4s").boxes, [1]);
    for (let Z = 1; Z <= 36; Z++) for (const s of b(Z)) { assert.ok(s.boxes.every((c) => c >= 0 && c <= 3)); assert.equal(s.boxes.reduce((a, c) => a + (c === 3 ? 2 : c ? 1 : 0), 0), s.count); }
  });
  test("[noble-gas abbreviation] Na [Ne] 3s¹, Cl [Ne] 3s² 3p⁵, Kr [Ar] 3d¹⁰ 4s² 4p⁶, He 1s², Li [He] 2s¹", () => {
    const f = (Z) => C.formatConfiguration(C.configurationFor(Z).value.occupation, { noble: true, neutral: true });
    assert.equal(f(11), "[Ne] 3s¹"); assert.equal(f(17), "[Ne] 3s² 3p⁵"); assert.equal(f(36), "[Ar] 3d¹⁰ 4s² 4p⁶"); assert.equal(f(2), "1s²"); assert.equal(f(3), "[He] 2s¹");
    assert.equal(C.formatConfiguration(C.configurationFor(26).value.occupation, { unicode: false }), "1s2 2s2 2p6 3s2 3p6 3d6 4s2");
  });
  test("[student build] Pauli, electron count and exceptions are all reported; Cr: Aufbau answer is flagged as not observed", () => {
    // order: 1s 2s 2p 3s 3p 4s 3d 4p
    const cr = C.checkBuild(24, 0, [2, 2, 6, 2, 6, 1, 5, 0]); assert.equal(cr.cls, "matches-model");
    const crAufbau = C.checkBuild(24, 0, [2, 2, 6, 2, 6, 2, 4, 0]); assert.equal(crAufbau.cls, "matches-aufbau-only");
    assert.equal(C.checkBuild(26, 0, [2, 2, 6, 2, 6, 2, 6, 0]).cls, "matches-model"); assert.equal(C.checkBuild(26, 0, [2, 2, 6, 2, 6, 2, 5, 0]).cls, "wrong-count");
    assert.equal(C.checkBuild(8, 0, [2, 3, 3, 0, 0, 0, 0, 0]).cls, "pauli-violation"); assert.equal(C.checkBuild(8, 0, [2, 2, 5, 0, 0, 0, 0, 0]).cls, "wrong-count");
    assert.equal(C.checkBuild(8, 0, [2, 1, 5, 0, 0, 0, 0, 0]).cls, "valid-other"); assert.equal(C.checkBuild(26, 3, [2, 2, 6, 2, 6, 0, 5, 0]).cls, "matches-model");
    assert.equal(C.checkBuild(8, 0, [2, 2, 4, 0, 0, 0, 0, 0]).cls, "matches-model"); assert.equal(C.checkBuild(8, 0, [2, 2, 4, 0, 0, 0, 0]), null); assert.equal(C.checkBuild(99, 0, [0, 0, 0, 0, 0, 0, 0, 0]), null);
  });
  test("[parse] malformed or over-full strings are rejected", () => { for (const s of ["1s3", "2d1", "1s2 1s1", "xx", "2p7", "3d11"]) assert.equal(C.parseConfiguration(s), null, s); assert.ok(C.parseConfiguration("1s2 2s2 2p6")); });
});
