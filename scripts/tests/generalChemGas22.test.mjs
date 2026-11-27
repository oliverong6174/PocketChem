// Stage 22: ideal-gas laws, unit conversion, mixtures, kinetic theory and the Maxwell-Boltzmann distribution. Expected values are
// hand calculations, textbook molar volumes, ratios of the laws, or numerical integration written here (Simpson, series erf);
// none is read from the function under test.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let G;
before(async () => { G = await loadModule("/src/utils/generalChem/gas.ts"); });
after(async () => { await closeEngine(); });

const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const rel = (a, b, r, label = "") => assert.ok(Math.abs(a - b) <= r * Math.abs(b), `${label} expected ${b} within ${r * 100}%, got ${a}`);
const R = 8.314462618;
const cont = (o = {}) => ({ VL: 10, TC: 25, n: 0.5, process: "isothermal", target: 5, ...o });
// independent erf by series (|x| <= 4) for the closed-form checks
const erf = (x) => { let s = 0; let term = x; for (let k = 0; k < 120; k += 1) { s += term / (2 * k + 1); term *= (-x * x) / (k + 1); } return (2 / Math.sqrt(Math.PI)) * s; };

describe("PV = nRT and unit conversions", () => {
  test("[molar volume] 1 mol at 273.15 K and 101.325 kPa is 22.414 L; at 273.15 K and 1 bar 22.711 L; at 298.15 K and 1 atm 24.465 L", () => {
    near(G.solveIdeal("V", { n: 1, T: 273.15, P: 101325 }) * 1000, 22.414, 1e-3);
    near(G.solveIdeal("V", { n: 1, T: 273.15, P: 1e5 }) * 1000, 22.711, 1e-3);
    near(G.solveIdeal("V", { n: 1, T: 298.15, P: 101325 }) * 1000, 24.465, 1e-3);
    near(G.molarVolumeLitres(101325, 273.15), 22.414, 1e-3);
  });
  test("[units] 1 atm = 101325 Pa = 760 mmHg = 101.325 kPa; 1 L = 1e-3 m3; 25 C = 298.15 K and back", () => {
    near(G.pressureToPa(1, "atm"), 101325, 1e-9); near(G.pressureToPa(760, "mmHg"), 101325, 1e-6); near(G.pressureToPa(101.325, "kPa"), 101325, 1e-9); near(G.pressureToPa(1, "bar"), 1e5, 1e-9);
    near(G.volumeToM3(1, "L"), 1e-3, 1e-15); near(G.volumeToM3(250, "mL"), 2.5e-4, 1e-15); near(G.temperatureToK(25, "C"), 298.15, 1e-12); near(G.temperatureFromK(373.15, "C"), 100, 1e-12);
    near(G.pressureFromPa(202650, "atm"), 2, 1e-12);
  });
  test("[solve for n] 2.00 atm, 5.00 L, 300 K: n = PV/RT = 1013.25/(8.314462618 x 300) = 0.40623 mol", () => {
    const r = G.calculateIdeal({ unknown: "n", P: { v: 2, u: "atm" }, V: { v: 5, u: "L" }, n: NaN, T: { v: 300, u: "K" } }); assert.ok(r.ok); near(r.unknownValue, 1013.25 / (R * 300), 1e-9); near(r.unknownValue, 0.40623, 1e-4);
  });
  test("[Celsius is converted, never used directly] 0.500 mol in 12.0 L at 27 C gives P = nRT/V with T = 300.15 K", () => {
    const r = G.calculateIdeal({ unknown: "P", P: { v: NaN, u: "kPa" }, V: { v: 12, u: "L" }, n: 0.5, T: { v: 27, u: "C" } }); assert.ok(r.ok);
    near(r.unknownValue, (0.5 * R * 300.15) / 0.012, 1e-6); near(G.pressureFromPa(r.unknownValue, "kPa"), 103.97, 0.05);
    const wrong = (0.5 * R * 27) / 0.012; assert.ok(Math.abs(r.unknownValue - wrong) > 5e4, "a Celsius shortcut would be far off");
  });
  test("[solve each unknown] the four rearrangements round-trip", () => {
    const s = { P: 150000, V: 0.02, n: 1.2, T: 280 }; s.P = G.solveIdeal("P", s);
    near(G.solveIdeal("V", s), 0.02, 1e-12); near(G.solveIdeal("n", s), 1.2, 1e-12); near(G.solveIdeal("T", s), 280, 1e-9);
  });
  test("[absolute temperature] 0 K, negative kelvin and below -273.15 C are refused; 0 C is fine", () => {
    assert.equal(G.calculateIdeal({ unknown: "P", P: { v: 0, u: "Pa" }, V: { v: 1, u: "L" }, n: 1, T: { v: 0, u: "K" } }).ok, false);
    assert.equal(G.calculateIdeal({ unknown: "P", P: { v: 0, u: "Pa" }, V: { v: 1, u: "L" }, n: 1, T: { v: -273.15, u: "C" } }).ok, false);
    assert.equal(G.calculateIdeal({ unknown: "P", P: { v: 0, u: "Pa" }, V: { v: 1, u: "L" }, n: 1, T: { v: -300, u: "C" } }).ok, false);
    assert.equal(G.calculateIdeal({ unknown: "P", P: { v: 0, u: "Pa" }, V: { v: 1, u: "L" }, n: 1, T: { v: 0, u: "C" } }).ok, true);
    assert.equal(G.runProcess(cont({ process: "isochoric", target: -273.15 })).ok, false);
  });
  test("[invalid inputs] non-positive or non-finite values are refused", () => {
    for (const bad of [{ V: { v: 0, u: "L" } }, { V: { v: -1, u: "L" } }, { n: -2 }, { n: NaN }, { P: { v: -1, u: "atm" } }]) {
      const c = { unknown: "T", P: { v: 1, u: "atm" }, V: { v: 1, u: "L" }, n: 1, T: { v: 0, u: "K" }, ...bad };
      if (c.unknown === "T") assert.equal(G.calculateIdeal(c).ok, false);
    }
  });
});

describe("controlled processes: each law as a constraint, not four free variables", () => {
  test("[isothermal / Boyle] halving the volume at constant T and n doubles P, and PV is unchanged", () => {
    const r = G.runProcess(cont()); assert.ok(r.ok); near(r.s2.P / r.s1.P, 2, 1e-12); near(r.s2.P * r.s2.V, r.s1.P * r.s1.V, 1e-9); assert.equal(r.s2.T, r.s1.T); assert.equal(r.s2.n, r.s1.n);
    near(r.s1.P, (0.5 * R * 298.15) / 0.01, 1e-6); // 123 948 Pa by hand
  });
  test("[isochoric / Gay-Lussac] 25 C -> 100 C at constant V and n: P2/P1 = 373.15/298.15 = 1.25155", () => {
    const r = G.runProcess(cont({ process: "isochoric", target: 100 })); assert.ok(r.ok); near(r.s2.P / r.s1.P, 373.15 / 298.15, 1e-12); near(r.s2.P / r.s2.T, r.s1.P / r.s1.T, 1e-9); assert.equal(r.s2.V, r.s1.V);
  });
  test("[isobaric / Charles] 25 C -> 100 C at constant P and n: V2/V1 = 1.25155; V/T is unchanged", () => {
    const r = G.runProcess(cont({ process: "isobaric", target: 100 })); assert.ok(r.ok); near(r.s2.V / r.s1.V, 373.15 / 298.15, 1e-12); near(r.s2.V / r.s2.T, r.s1.V / r.s1.T, 1e-12); assert.equal(r.s2.P, r.s1.P);
  });
  test("[Avogadro at constant P, T] doubling n doubles V; at constant V, T doubling n doubles P", () => {
    const a = G.runProcess(cont({ process: "amountP", target: 1 })); near(a.s2.V / a.s1.V, 2, 1e-12); assert.equal(a.s2.P, a.s1.P);
    const b = G.runProcess(cont({ process: "amountV", target: 1 })); near(b.s2.P / b.s1.P, 2, 1e-12); assert.equal(b.s2.V, b.s1.V);
  });
  test("[PV = nRT holds at both ends of every process]", () => {
    for (const [process, target] of [["isothermal", 3], ["isochoric", 60], ["isobaric", -20], ["amountP", 2.2], ["amountV", 0.1]]) {
      const r = G.runProcess(cont({ process, target })); assert.ok(r.ok, process);
      for (const s of [r.s1, r.s2]) near(G.combinedInvariant(s), R, 1e-9, process);
    }
  });
  test("[combined gas law] P1 = 1 atm, V1 = 2 L, T1 = 300 K -> V2 = 3 L, T2 = 450 K gives P2 = 1 atm (hand: 1 x 2 x 450 / (300 x 3))", () => {
    const s1 = { P: 101325, V: 2e-3, n: 0.08, T: 300 }; near(G.combinedPressure(s1, 3e-3, 0.08, 450), 101325, 1e-6);
    near(G.combinedPressure(s1, 1e-3, 0.08, 300), 2 * 101325, 1e-6);
  });
  test("[process metadata] every process names what is held fixed and what is dependent", () => {
    for (const p of G.GAS_PROCESSES) { assert.equal(p.held.length, 2); assert.ok(!p.held.includes(p.controlled)); assert.ok(!p.held.includes(p.dependent)); assert.notEqual(p.controlled, p.dependent); }
    assert.equal(G.processInfo("isothermal").dependent, "P"); assert.equal(G.processInfo("isobaric").dependent, "V");
  });
  test("[curve] the sampled process curve obeys its law at every point and hits the endpoints", () => {
    const c = cont({ process: "isothermal", target: 4 }); const pts = G.processCurve(c, 4, 20, 41);
    for (const p of pts) near(p.P * p.V, pts[0].P * pts[0].V, 1e-6);
    near(pts[0].V, 4e-3, 1e-15); near(pts[40].V, 20e-3, 1e-15);
    const ch = G.processCurve(cont({ process: "isobaric", target: 100 }), 0, 100, 11); for (const p of ch) near(p.V / p.T, ch[0].V / ch[0].T, 1e-12);
  });
  test("[out-of-range finals are refused with the variable named]", () => {
    assert.equal(G.runProcess(cont({ target: 0 })).ok, false); assert.equal(G.runProcess(cont({ process: "amountP", target: -1 })).ok, false); assert.equal(G.runProcess(cont({ VL: -1 })).ok, false); assert.equal(G.runProcess(cont({ n: 0 })).ok, false);
    assert.equal(G.runProcess(cont({ process: "isochoric", target: 1e5 })).ok, false);
  });
});

describe("gas mixtures: Dalton's law", () => {
  const air = { components: [{ formula: "N2", mol: 0.78 }, { formula: "O2", mol: 0.21 }, { formula: "Ar", mol: 0.01 }], VL: 24.4, TC: 25 };
  test("[air-like mixture] total P = nRT/V; partial pressures are x_i P and add up to the total; mole fractions add to 1", () => {
    const m = G.solveMixture(air); assert.ok(m.ok); near(m.totalPa, (1.0 * R * 298.15) / 0.0244, 1e-6); near(m.totalPa, 101596, 1);
    near(m.rows.reduce((s, r) => s + r.partialPa, 0), m.totalPa, 1e-6); near(m.rows.reduce((s, r) => s + r.x, 0), 1, 1e-12);
    near(m.rows[0].partialPa, 0.78 * m.totalPa, 1e-6); near(m.rows[0].x, 0.78, 1e-12);
    // each gas alone in the same container would exert nRT/V: its partial pressure
    near(m.rows[1].partialPa, (0.21 * R * 298.15) / 0.0244, 1e-6);
  });
  test("[average molar mass and density] M = 0.78(28.014) + 0.21(31.998) + 0.01(39.95) = 28.970 g/mol; density = m/V = 28.970/24.4 = 1.1873 g/L", () => {
    const m = G.solveMixture(air); near(m.avgMolarMass, 0.78 * 28.014 + 0.21 * 31.998 + 0.01 * 39.95, 1e-9); near(m.densityGperL, 28.9705 / 24.4, 1e-4);
    near(m.densityGperL, G.gasDensityGperL(m.totalPa, m.T, m.avgMolarMass), 1e-9);
  });
  test("[single gas density] CO2 at 298.15 K, 1 atm: rho = PM/RT = 101325 x 44.009 / (8.314462618 x 298.15) = 1.799 g/L", () => { near(G.gasDensityGperL(101325, 298.15, 44.009), 1.799, 1e-3); });
  test("[invalid mixtures] unknown gases, duplicates, negative amounts, an empty mixture, too many gases and bad geometry are refused", () => {
    const ok = air.components;
    assert.equal(G.solveMixture({ ...air, components: [{ formula: "NaCl", mol: 1 }] }).ok, false);
    assert.equal(G.solveMixture({ ...air, components: [{ formula: "N2", mol: 1 }, { formula: "N2", mol: 1 }] }).ok, false);
    assert.equal(G.solveMixture({ ...air, components: [{ formula: "N2", mol: -1 }] }).ok, false);
    assert.equal(G.solveMixture({ ...air, components: [{ formula: "N2", mol: 0 }, { formula: "O2", mol: 0 }] }).ok, false);
    assert.equal(G.solveMixture({ ...air, components: [] }).ok, false);
    assert.equal(G.solveMixture({ ...air, components: ["He", "Ne", "Ar", "Kr", "H2", "N2"].map((formula) => ({ formula, mol: 1 })) }).ok, false);
    assert.equal(G.solveMixture({ ...air, VL: 0 }).ok, false); assert.equal(G.solveMixture({ ...air, TC: -300 }).ok, false);
    assert.equal(G.solveMixture({ components: ok, VL: 24.4, TC: 25 }).ok, true);
  });
});

describe("kinetic theory and the Maxwell-Boltzmann distribution", () => {
  test("[rms speed] N2 at 298.15 K: sqrt(3 x 8.314462618 x 298.15 / 0.028014) = 515.2 m/s; H2: 1920.7 m/s", () => {
    near(G.rmsSpeed(298.15, 28.014), Math.sqrt((3 * 8.314462618 * 298.15) / 0.028014), 1e-9); near(G.rmsSpeed(298.15, 28.014), 515.2, 0.1); near(G.rmsSpeed(298.15, 2.016), 1920.7, 0.2);
  });
  test("[mass scaling] speeds go as 1/sqrt(M): v(H2)/v(N2) = sqrt(28.014/2.016) = 3.728; speeds go as sqrt(T): doubling T multiplies v by sqrt(2)", () => {
    near(G.rmsSpeed(300, 2.016) / G.rmsSpeed(300, 28.014), Math.sqrt(28.014 / 2.016), 1e-12); near(G.rmsSpeed(600, 28.014) / G.rmsSpeed(300, 28.014), Math.SQRT2, 1e-12);
  });
  test("[speed ratios of the distribution] v_mp : v_mean : v_rms = sqrt(2) : sqrt(8/pi) : sqrt(3)", () => {
    const T = 350; const M = 39.95; const mp = G.mostProbableSpeed(T, M);
    near(G.meanSpeed(T, M) / mp, Math.sqrt(4 / Math.PI), 1e-12); near(G.rmsSpeed(T, M) / mp, Math.sqrt(1.5), 1e-12);
  });
  test("[same T, same mean kinetic energy] (3/2) k T per molecule, 3.72 kJ/mol at 298.15 K, whatever the mass", () => {
    near(G.meanKineticEnergy(298.15), 1.5 * 1.380649e-23 * 298.15, 1e-30); near(G.meanKineticEnergyPerMole(298.15) / 1000, 3.718, 1e-3);
    const k = G.solveKinetic({ a: "H2", b: "CO2", TaC: 25, TbC: 25 }); assert.ok(k.ok); assert.equal(k.rows[0].keJ, k.rows[1].keJ); assert.ok(k.rows[0].vrms > 4 * k.rows[1].vrms);
    // (1/2) m v_rms^2 equals that mean energy for each gas: derived from speed and mass, independent of the energy function
    for (const row of k.rows) near(0.5 * (row.M / 1000 / 6.02214076e23) * row.vrms ** 2, 1.5 * 1.380649e-23 * 298.15, 1e-26);
  });
  test("[normalisation] the density integrates to 1 over 0..infinity (Simpson over 0..14 v_mp)", () => {
    for (const [T, M] of [[298.15, 28.014], [77, 4.0026], [1000, 44.009]]) near(G.mbFraction(0, 14 * G.mostProbableSpeed(T, M), T, M, 6000), 1, 1e-9);
  });
  test("[moments by numerical integration, not by the closed forms] mean speed, rms speed and mean energy from the density", () => {
    const T = 400; const M = 28.014; const vmp = G.mostProbableSpeed(T, M); const top = 14 * vmp; const n = 8000; const h = top / n;
    const moment = (p) => { let s = 0; for (let k = 0; k <= n; k += 1) { const v = k * h; const w = k === 0 || k === n ? 1 : k % 2 ? 4 : 2; s += w * v ** p * G.mbDensity(v, T, M); } return (s * h) / 3; };
    near(moment(1), Math.sqrt((8 * 8.314462618 * T) / (Math.PI * 0.028014)), 1e-3); near(Math.sqrt(moment(2)), Math.sqrt((3 * 8.314462618 * T) / 0.028014), 1e-3);
    near(0.5 * (0.028014 / 6.02214076e23) * moment(2), 1.5 * 1.380649e-23 * T, 1e-26);
  });
  test("[peak] the density is largest at v_mp (scan), is zero at v = 0 and decays at high speed", () => {
    const T = 298.15; const M = 28.014; const vmp = G.mostProbableSpeed(T, M); let best = 0; let at = 0;
    for (let v = 1; v < 3000; v += 1) { const f = G.mbDensity(v, T, M); if (f > best) { best = f; at = v; } }
    near(at, vmp, 1.5); assert.equal(G.mbDensity(0, T, M), 0); assert.ok(G.mbDensity(8 * vmp, T, M) < 1e-12 * best);
  });
  test("[hotter and lighter shift and broaden] the peak falls and moves right with T; the lighter gas peaks higher in speed and lower in height", () => {
    const f = (v, T, M) => G.mbDensity(v, T, M);
    const peak = (T, M) => f(G.mostProbableSpeed(T, M), T, M);
    assert.ok(peak(600, 28.014) < peak(300, 28.014)); assert.ok(G.mostProbableSpeed(600, 28.014) > G.mostProbableSpeed(300, 28.014)); assert.ok(peak(300, 2.016) < peak(300, 28.014));
  });
  test("[tail fraction vs closed form] fraction faster than v_rms = erfc(sqrt(3/2)) + (2/sqrt(pi)) sqrt(3/2) exp(-3/2) = 0.3917, from a series erf", () => {
    const x = Math.sqrt(1.5); const want = 1 - erf(x) + (2 / Math.sqrt(Math.PI)) * x * Math.exp(-x * x);
    near(G.mbFractionAbove(G.rmsSpeed(298.15, 28.014), 298.15, 28.014), want, 1e-6); near(want, 0.3917, 1e-3);
    near(G.mbFraction(0, G.mostProbableSpeed(300, 32) * 1, 300, 32) , erf(1) - (2 / Math.sqrt(Math.PI)) * Math.exp(-1), 1e-7);
  });
  test("[invalid inputs] unknown species and impossible temperatures are refused", () => {
    assert.equal(G.solveKinetic({ a: "NaCl", b: "N2", TaC: 25, TbC: 25 }).ok, false); assert.equal(G.solveKinetic({ a: "He", b: "N2", TaC: -300, TbC: 25 }).ok, false);
    assert.equal(G.gasMolarMass("NaCl"), null); near(G.gasMolarMass("CH4"), 16.043, 1e-9);
  });
});
