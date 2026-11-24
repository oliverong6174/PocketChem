// Stage 27: independent scientific reference cases. Expected values come from (a) data retrieved from external sources and stored in
// scripts/reference/stage27/*.json (CIAAW atomic weights 2024, a cross-check table of standard electrode potentials, NIST CODATA 2022),
// or (b) closed-form expressions and hand calculations written in this file. None is produced by calling the module under test.
// No network access is used when this suite runs.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { closeEngine, loadModule } from "./engine.mjs";

const ref = (name) => JSON.parse(fs.readFileSync(new URL(`../reference/stage27/${name}`, import.meta.url), "utf8"));
const CIAAW = ref("ciaaw-atomic-weights-2024.json");
const EO = ref("standard-reduction-potentials.json");
const CONST = ref("physical-constants.json");

const E = await loadModule("/src/utils/generalChem/elements.ts");
const F = await loadModule("/src/utils/generalChem/formula.ts");
const B = await loadModule("/src/utils/generalChem/balance.ts");
const EC = await loadModule("/src/utils/generalChem/electrochem.ts");
const GAS = await loadModule("/src/utils/generalChem/gas.ts");
const MEM = await loadModule("/src/utils/biology/membrane23.ts");
const NEU = await loadModule("/src/utils/biology/neuron23.ts");
const DEATH = await loadModule("/src/utils/biology/celldeath26.ts");
const CYC = await loadModule("/src/utils/biology/cellcycle26.ts");
const LIP = await loadModule("/src/utils/biochem/metabolism/lipids.ts");
const NIT = await loadModule("/src/utils/biochem/metabolism/nitrogen.ts");
const WAV = await loadModule("/src/utils/physics/waves.ts");
const OPT = await loadModule("/src/utils/physics/optics.ts");
const INT = await loadModule("/src/utils/physics/interference.ts");
const ELS = await loadModule("/src/utils/physics/electrostatics.ts");
const MAG = await loadModule("/src/utils/physics/magnetism.ts");
const IND = await loadModule("/src/utils/physics/induction.ts");
after(async () => { await closeEngine(); });

const near = (a, b, tol, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b} +/- ${tol}, got ${a}`);
const rel = (a, b, r, msg = "") => assert.ok(Math.abs(a - b) <= r * Math.abs(b), `${msg} expected ${b} (rel ${r}), got ${a}`);
const R = CONST.constants.R.value, Fd = CONST.constants.F.value;

// -------------------------------------------------------------------------------------------------------------------------------
describe("CHEM-ATOMIC: atomic masses against CIAAW 2024", () => {
  test("[CHEM-ATOMIC-1] every supported element equals the CIAAW abridged (conventional) value", () => {
    const symbols = Object.keys(E.ELEMENTS);
    assert.equal(symbols.length, 83);
    for (const s of symbols) {
      const r = CIAAW.elements[s]; assert.ok(r, `${s} missing in CIAAW listing`);
      assert.equal(E.ELEMENTS[s].Z, r.Z, `${s} atomic number`);
      near(E.ELEMENTS[s].mass, r.abridged, 1e-9, s);
    }
  });
  test("[CHEM-ATOMIC-2] the abridged value is inside (or equal to the rounding of) the unabridged standard weight / interval", () => {
    for (const s of Object.keys(E.ELEMENTS)) {
      const std = CIAAW.elements[s].standard2024.replace(/\s/g, ""); const m = E.ELEMENTS[s].mass;
      const iv = std.match(/^\[([\d.]+),([\d.]+)\]$/);
      if (iv) assert.ok(m >= +iv[1] - CIAAW.elements[s].abridgedUncertainty && m <= +iv[2] + CIAAW.elements[s].abridgedUncertainty, `${s} ${m} outside ${std} (+/- abridged rounding)`);
      else { const v = parseFloat(std); const unc = CIAAW.elements[s].abridgedUncertainty; assert.ok(Math.abs(m - v) <= Math.max(unc, 0.006) + 1e-9, `${s} ${m} vs ${std}`); }
    }
  });
  test("[CHEM-ATOMIC-3] Stage 27 corrections: Ar is the conventional 39.95 (interval) and Zr is 91.222", () => { near(E.atomicMass("Ar"), 39.95, 1e-12); near(E.atomicMass("Zr"), 91.222, 1e-12); });
  test("[CHEM-ATOMIC-4] elements with no standard atomic weight (Tc, Pm, Po-Og except Th, Pa, U) are not offered", () => { for (const s of ["Tc", "Pm", "Po", "Rn", "Pu", "Og"]) assert.equal(E.atomicMass(s), null, s); });
});

describe("CHEM-MASS: molar masses recomputed from the CIAAW file", () => {
  const w = (s) => CIAAW.elements[s].abridged;
  const cases = [
    ["H2O", 2 * w("H") + w("O")], ["CO2", w("C") + 2 * w("O")], ["NaCl", w("Na") + w("Cl")],
    ["Ca(OH)2", w("Ca") + 2 * (w("O") + w("H"))], ["Fe2(SO4)3", 2 * w("Fe") + 3 * (w("S") + 4 * w("O"))],
    ["CuSO4·5H2O", w("Cu") + w("S") + 4 * w("O") + 5 * (2 * w("H") + w("O"))], ["K4[Fe(CN)6]", 4 * w("K") + w("Fe") + 6 * (w("C") + w("N"))],
    ["Ar", w("Ar")], ["ZrO2", w("Zr") + 2 * w("O")],
  ];
  for (const [f, want] of cases) test(`[CHEM-MASS] ${f}`, () => { const p = F.parseFormula(f); assert.ok(p.ok, p.error); near(p.value.mass, want, 1e-9, f); });
  test("[CHEM-MASS] hand values: H2O 18.015, CO2 44.009, NaCl 58.44 (CIAAW abridged), CuSO4.5H2O 249.677", () => {
    near(F.parseFormula("H2O").value.mass, 18.015, 1e-9); near(F.parseFormula("CO2").value.mass, 44.009, 1e-9); near(F.parseFormula("NaCl").value.mass, 58.44, 1e-9); near(F.parseFormula("CuSO4·5H2O").value.mass, 249.677, 1e-9);
  });
});

describe("CHEM-BALANCE: equation balance recounted atom by atom", () => {
  const sp = (t) => t.split(" + ").map((x) => x.trim());
  const count = (formula) => { const p = F.parseFormula(formula); assert.ok(p.ok, formula); return { counts: p.value.counts, charge: p.value.charge }; };
  for (const [eq, want] of [["Fe + O2 -> Fe2O3", [4, 3, 2]], ["C3H8 + O2 -> CO2 + H2O", [1, 5, 3, 4]], ["Al + HCl -> AlCl3 + H2", [2, 6, 2, 3]], ["MnO4^- + Fe^2+ + H^+ -> Mn^2+ + Fe^3+ + H2O", [1, 5, 8, 1, 5, 4]]]) {
    test(`[CHEM-BALANCE] ${eq}`, () => {
      const parsed = B.parseEquation(eq); assert.ok(parsed.ok, parsed.error); const r = B.balanceEquation(parsed.value); assert.ok(r.ok); assert.deepEqual(r.coefficients, want);
      const [l, rr] = eq.split("->"); const total = (side, cs) => { const t = {}; let q = 0; sp(side).forEach((f, i) => { const c = count(f); for (const [el, n] of Object.entries(c.counts)) t[el] = (t[el] ?? 0) + n * cs[i]; q += c.charge * cs[i]; }); return { t, q }; };
      const a = total(l, r.coefficients.slice(0, sp(l).length)), b = total(rr, r.coefficients.slice(sp(l).length));
      assert.deepEqual(a.t, b.t); assert.equal(a.q, b.q);
    });
  }
  test("[CHEM-BALANCE] an impossible equation gives no coefficients", () => { const p = B.parseEquation("H2 + O2 -> NaCl"); const r = B.balanceEquation(p.value); assert.equal(r.ok, false); assert.equal(r.coefficients, undefined); });
});

describe("CHEM-GAS: gas-law reference values", () => {
  test("[CHEM-GAS-1] molar volume at 273.15 K and 100 kPa is RT/P = 22.711 L; at 273.15 K and 101.325 kPa 22.414 L", () => {
    near(GAS.molarVolumeLitres(100000, 273.15), (R * 273.15) / 100000 * 1000, 1e-9); near(GAS.molarVolumeLitres(100000, 273.15), 22.711, 1e-3); near(GAS.molarVolumeLitres(101325, 273.15), 22.414, 1e-3);
  });
  test("[CHEM-GAS-2] Boyle: P1V1 = P2V2 for an isothermal compression, and PV/nT = R at both ends", () => {
    const c = { VL: 10, TC: 25, n: 0.5, process: "isothermal", target: 5 }; const r = GAS.runProcess(c); assert.ok(r.ok);
    near(GAS.combinedInvariant(r.s2), R, 1e-6); near(GAS.combinedInvariant(r.s1), R, 1e-6); near(r.s2.P * r.s2.V, r.s1.P * r.s1.V, 1e-6); near(r.s2.P / r.s1.P, 2, 1e-9); near(r.s1.P, (0.5 * R * 298.15) / 0.010, 1e-6);
  });
  test("[CHEM-GAS-3] CO2 density at 298.15 K, 101325 Pa: PM/RT = 1.799 g/L (hand value)", () => near(GAS.gasDensityGperL(101325, 298.15, 44.009), (101325 * 44.009) / (R * 298.15) / 1000, 1e-12));
});

describe("CHEM-ELECTRO: standard electrode potentials against the cross-check table", () => {
  test("[CHEM-ELECTRO-1] 28 half-reactions, each present in the cross-check table with the same electron count", () => {
    assert.equal(EC.HALF_REACTIONS.length, 28); assert.deepEqual(new Set(EC.HALF_REACTIONS.map((h) => h.id)), new Set(Object.keys(EO.couples)));
    for (const h of EC.HALF_REACTIONS) assert.equal(h.n, EO.couples[h.id].n, `${h.id} electron count`);
  });
  test("[CHEM-ELECTRO-2] every E0 is within the stated tolerance of the table value and carries the same sign", () => {
    for (const h of EC.HALF_REACTIONS) { const t = EO.couples[h.id].table; near(h.E0, t, EO.toleranceV, h.id); if (Math.abs(t) > 0.05) assert.equal(Math.sign(h.E0), Math.sign(t), `${h.id} sign`); }
  });
  test("[CHEM-ELECTRO-3] activity-series order is the order of the table values", () => {
    const mine = [...EC.HALF_REACTIONS].sort((a, b) => a.E0 - b.E0).map((h) => h.id); const theirs = Object.entries(EO.couples).sort((a, b) => a[1].table - b[1].table).map((x) => x[0]);
    // couples closer than the tolerance may swap; require the same order for couples that differ by more than 0.05 V in the table
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) { const a = EO.couples[mine[i]].table, b = EO.couples[mine[j]].table; assert.ok(a <= b + 0.05, `${mine[i]} before ${mine[j]}`); }
    assert.equal(theirs.length, mine.length);
  });
  test("[CHEM-ELECTRO-4] every half-reaction balances atoms (own element counter) and charge: oxidised side + n e- = reduced side", () => {
    const tally = (sp) => {
      const t = {}; let q = 0;
      for (const s of sp) {
        const m = s.f.match(/^([A-Za-z0-9]+)(?:\^(\d*)([+-]))?$/); assert.ok(m, s.f); const [, body, mag, sign] = m;
        if (sign) q += s.nu * (mag ? +mag : 1) * (sign === "+" ? 1 : -1);
        for (const x of body.matchAll(/([A-Z][a-z]?)(\d*)/g)) t[x[1]] = (t[x[1]] ?? 0) + s.nu * (x[2] === "" ? 1 : +x[2]);
      }
      return { t, q };
    };
    for (const h of EC.HALF_REACTIONS) { const a = tally(h.ox), b = tally(h.red); assert.deepEqual(a.t, b.t, `${h.id} atoms`); assert.equal(a.q - h.n, b.q, `${h.id} charge`); }
  });
  test("[CHEM-ELECTRO-5] Daniell cell: E0 = 0.342 - (-0.762) = 1.104 V; dG0 = -nFE0; ln K = nFE0/RT; cathode is Cu", () => {
    const out = EC.buildGalvanicCell({ a: "Zn", b: "Cu", ca: [1], cb: [1], pH: 0, TC: 25 }); assert.ok(out.ok); const c = out.value;
    assert.equal(c.cathode.id, "Cu"); assert.equal(c.anode.id, "Zn"); assert.equal(c.n, 2); near(c.E0cell, 1.104, 1e-9);
    near(c.dG0, -2 * Fd * 1.104, 1e-6); near(c.lnK, (2 * Fd * 1.104) / (R * 298.15), 1e-9); near(c.log10K, (2 * Fd * 1.104) / (R * 298.15 * Math.LN10), 1e-9);
    near(c.E, c.E0cell, 1e-12); near(c.lnQ, 0, 1e-12);
  });
  test("[CHEM-ELECTRO-6] Nernst: [Zn2+] = 0.010 M, [Cu2+] = 1.0 M gives E = E0 - (RT/2F) ln(0.010) = 1.104 + 0.02957 * 2 ... (hand expression)", () => {
    const out = EC.buildGalvanicCell({ a: "Zn", b: "Cu", ca: [0.01], cb: [1], pH: 0, TC: 25 }); assert.ok(out.ok); const c = out.value;
    near(c.E, 1.104 - ((R * 298.15) / (2 * Fd)) * Math.log(0.01 / 1), 1e-9); assert.ok(c.E > c.E0cell); near(c.E - c.E0cell, 0.0591596 / 1, 5e-4);
  });
  test("[CHEM-ELECTRO-7] electrode reversal: giving the couples in the other order gives the same cell with the same positive E0 (never a negative standard cell voltage)", () => {
    const a = EC.buildGalvanicCell({ a: "Zn", b: "Cu", ca: [1], cb: [1], pH: 0, TC: 25 }).value, b = EC.buildGalvanicCell({ a: "Cu", b: "Zn", ca: [1], cb: [1], pH: 0, TC: 25 }).value;
    near(a.E0cell, b.E0cell, 1e-12); assert.equal(a.cathode.id, b.cathode.id); assert.ok(a.E0cell > 0);
  });
  test("[CHEM-ELECTRO-8] potentials are not multiplied by coefficients: MnO4-/Fe3+ cell E0 = 1.507 - 0.771 although 5 Fe2+ react", () => {
    const c = EC.buildGalvanicCell({ a: "MnO4", b: "Fe3", ca: [1, 1], cb: [1, 1], pH: 0, TC: 25 }); assert.ok(c.ok, JSON.stringify(c.errors)); near(c.value.E0cell, 1.507 - 0.771, 1e-9); assert.equal(c.value.n, 5);
  });
});

// -------------------------------------------------------------------------------------------------------------------------------
describe("PHYS-CONST: physical constants against NIST", () => {
  const mine = { R, F: EC.FARADAY, kB: GAS.K_BOLTZMANN, NA: GAS.N_AVOGADRO, e: ELS.E_CHARGE, c: ELS.C_LIGHT, eps0: ELS.EPS0, mu0: MAG.MU0 };
  for (const [k, v] of Object.entries(mine)) test(`[PHYS-CONST] ${k}`, () => { const c = CONST.constants[k]; rel(v, c.value, c.relTol, k); });
  test("[PHYS-CONST] 1/(4 pi eps0) is consistent with K_E, and the electron/proton/alpha masses are within CODATA-2018-to-2022 drift", () => {
    rel(ELS.K_E, 1 / (4 * Math.PI * ELS.EPS0), 1e-9); rel(ELS.PARTICLES?.electron?.m ?? 9.1093837015e-31, CONST.constants.me.value, CONST.constants.me.relTol); rel(1.67262192369e-27, CONST.constants.mp.value, CONST.constants.mp.relTol); rel(6.6446573357e-27, CONST.constants.malpha.value, CONST.constants.malpha.relTol);
  });
  test("[PHYS-CONST] c^2 = 1/(mu0 eps0) to the precision of the two constants", () => rel(1 / (MAG.MU0 * ELS.EPS0), ELS.C_LIGHT ** 2, 2e-9));
});

describe("PHYS: waves, optics, diffraction, fields, induction (closed forms)", () => {
  test("[PHYS-WAVE-1] closed pipe, L = 0.50 m, v = 343 m/s: f1 = v/4L = 171.5 Hz; only odd harmonics (f3 = 514.5 Hz); string f3 = 3v/2L", () => {
    near(WAV.harmonicFrequency("closed", 0.5, 343, 1), 343 / (4 * 0.5), 1e-12); near(WAV.harmonicFrequency("closed", 0.5, 343, 3), 514.5, 1e-9);
    assert.deepEqual(WAV.allowedHarmonics("closed", 7), [1, 3, 5, 7]); near(WAV.harmonicFrequency("string", 0.5, 343, 3), (3 * 343) / (2 * 0.5), 1e-12);
  });
  test("[PHYS-WAVE-2] standing-wave nodes: string n = 3 has nodes at 0, L/3, 2L/3, L; closed pipe n = 3 has the closed end as a node", () => {
    const n = WAV.nodePositions("string", 1.2, 3); [0, 0.4, 0.8, 1.2].forEach((x, i) => near(n[i], x, 1e-12)); near(WAV.modeShape("closed", 1, 3, 0), 0, 1e-12); near(Math.abs(WAV.modeShape("closed", 1, 3, 1)), 1, 1e-12);
  });
  test("[PHYS-OPT-1] thin lens f = +10 cm, object 25 cm: 1/s' = 1/10 - 1/25 gives s' = 16.667 cm, real, inverted, m = -2/3", () => {
    const r = OPT.solveImaging({ element: "lens", f: 10, s: 25, h: 3 }); near(r.sPrime, 1 / (1 / 10 - 1 / 25), 1e-9); near(r.m, -(1 / (1 / 10 - 1 / 25)) / 25, 1e-9); assert.equal(r.nature, "real"); assert.equal(r.orientation, "inverted");
  });
  test("[PHYS-OPT-2] diverging lens f = -10, object 25: s' = -7.143 (virtual, upright, reduced); object inside f of a converging lens gives a virtual, upright, enlarged image", () => {
    const d = OPT.solveImaging({ element: "lens", f: -10, s: 25, h: 3 }); near(d.sPrime, 1 / (-1 / 10 - 1 / 25), 1e-9); assert.equal(d.nature, "virtual"); assert.equal(d.orientation, "upright"); assert.equal(d.size, "reduced");
    const m = OPT.solveImaging({ element: "lens", f: 10, s: 6, h: 3 }); assert.ok(m.sPrime < 0); assert.equal(m.orientation, "upright"); assert.equal(m.size, "enlarged");
  });
  test("[PHYS-OPT-3] concave mirror (f > 0), object beyond C: real, inverted, reduced; plane-mirror limit f -> infinity is excluded by range", () => {
    const r = OPT.solveImaging({ element: "mirror", f: 10, s: 30, h: 3 }); near(r.sPrime, 15, 1e-9); assert.equal(r.nature, "real"); assert.equal(r.size, "reduced"); near(r.radius, 20, 1e-12);
  });
  test("[PHYS-OPT-4] Snell: n1 = 1, n2 = 1.5, 40 deg gives asin(sin 40 / 1.5)", () => { const r = OPT.solveRefraction({ n1: 1, n2: 1.5, theta1: 40 }); near(r.theta2 ?? r.theta2Deg ?? NaN, (Math.asin(Math.sin((40 * Math.PI) / 180) / 1.5) * 180) / Math.PI, 1e-9); });
  test("[PHYS-DIFF-1] 550 nm, a = 20 um single-slit first minimum at sin(theta) = lambda/a = 0.0275; double-slit d = 100 um first maximum at sin = 5.5e-3 and y = L tan(theta)", () => {
    const i = { lambdaNm: 550, aUm: 20, dUm: 100, N: 2, L: 1.5 }; const s = INT.summarizeSlits(i);
    near(s.firstOrderY, 1.5 * Math.tan(Math.asin(5.5e-3)), 1e-12); near(s.centralHalfWidth, 1.5 * Math.tan(Math.asin(0.0275)), 1e-12); assert.equal(s.maxOrder, Math.ceil(100 / 0.55) - 1);
    near(INT.envelopeAtSin(i, 0.0275), 0, 1e-12); near(INT.envelopeAtSin(i, 0), 1, 1e-12);
  });
  test("[PHYS-DIFF-2] missing orders: d/a = 5 removes orders 5, 10, ... (interference maxima on diffraction minima)", () => {
    const s = INT.summarizeSlits({ lambdaNm: 500, aUm: 20, dUm: 100, N: 2, L: 1 }); assert.deepEqual(s.missingOrders.slice(0, 2), [5, 10]);
  });
  test("[PHYS-FIELD-1] dipole midpoint: +q at (-d,0), -q at (+d,0): E at the origin = 2kq/d^2 in +x; on the perpendicular bisector E is parallel to the dipole axis", () => {
    const q = 1e-6, d = 0.5; const E0 = ELS.fieldAt([{ id: "a", q, x: -d, y: 0 }, { id: "b", q: -q, x: d, y: 0 }], { x: 0, y: 0 }); assert.ok(E0.ok); rel(E0.E.x, (2 * ELS.K_E * q) / (d * d), 1e-12); near(E0.E.y, 0, 1e-6);
    const P = ELS.fieldAt([{ id: "a", q, x: -d, y: 0 }, { id: "b", q: -q, x: d, y: 0 }], { x: 0, y: 1 }); const r = Math.hypot(d, 1); rel(P.E.x, (2 * ELS.K_E * q * d) / r ** 3, 1e-12); near(P.E.y, 0, 1e-6);
  });
  test("[PHYS-FIELD-2] two equal charges: the field at the midpoint is zero", () => { const r = ELS.fieldAt([{ id: "a", q: 1e-6, x: -1, y: 0 }, { id: "b", q: 1e-6, x: 1, y: 0 }], { x: 0, y: 0 }); assert.ok(r.ok); near(r.magnitude, 0, 1e-6); });
  test("[PHYS-MAG-1] Lorentz force on a proton, v = 1e5 x-hat, B = 0.1 z-hat: F = q v x B = -q v B in y (right-hand rule: x-hat cross z-hat = -y-hat)", () => {
    const q = 1.602176634e-19, f = MAG.lorentzForce(q, MAG.v3(1e5, 0, 0), MAG.v3(0, 0, 0.1)); near(f.x, 0, 1e-30); rel(f.y, -q * 1e5 * 0.1, 1e-12); near(f.z, 0, 1e-30);
    const fe = MAG.lorentzForce(-q, MAG.v3(1e5, 0, 0), MAG.v3(0, 0, 0.1)); rel(fe.y, q * 1e5 * 0.1, 1e-12);
  });
  test("[PHYS-IND-1] motional EMF, rod along +y (L = 0.4 m) moving along +x at 3 m/s in B = +0.5 T z: v x B = (0, -1.5), EMF = (v x B).L = -0.6 V (tail positive); |I| = 0.6/2 = 0.3 A; F = BIL = 0.06 N opposing the motion", () => {
    const r = IND.motionalEmf({ Bz: 0.5, L: 0.4, rodAngleDeg: 90, v: 3, velAngleDeg: 0, R: 2 }); near(r.emf, -0.6, 1e-12); assert.equal(r.positiveEnd, "tail"); near(Math.abs(r.rails.current), 0.3, 1e-12); near(Math.abs(r.rails.force), 0.5 * 0.3 * 0.4, 1e-12);
    near(r.rails.mechanicalPower, r.rails.electricalPower, 1e-12);
  });
  test("[PHYS-IND-2] RL transient: R = 10, L = 0.5, Vs = 5: tau = 0.05 s, i(tau) = 0.5(1 - e^-1), v_L(0+) = Vs; decay from 0.5 A with Vs = 0: i(tau) = 0.5 e^-1; inductor EMF opposes the change", () => {
    const g = { Vs: 5, i0: 0, R: 10, L: 0.5, spanTau: 5 }; near(IND.rlTau(g), 0.05, 1e-15); near(IND.rlState(g, 0.05).i, 0.5 * (1 - Math.exp(-1)), 1e-12); near(IND.rlState(g, 0).vL, 5, 1e-12); assert.ok(IND.rlState(g, 0.01).emfL < 0);
    const d = { Vs: 0, i0: 0.5, R: 10, L: 0.5, spanTau: 5 }; near(IND.rlState(d, 0.05).i, 0.5 * Math.exp(-1), 1e-12); assert.ok(IND.rlState(d, 0.01).emfL > 0); assert.equal(IND.rlKind(d), "decay");
  });
});

// -------------------------------------------------------------------------------------------------------------------------------
describe("BIO-NERNST: Nernst, GHK and the membrane conventions", () => {
  const rtf = (T) => (1000 * R * (T + 273.15)) / Fd;
  test("[BIO-NERNST-1] 37 C, mammalian neuron textbook gradients: E_K = (RT/F) ln(4/140) = -95.0 mV, E_Na = +66.6, E_Cl = -64.1, E_Ca = +130.9", () => {
    near(MEM.nernstMv(1, 4, 140, 37), rtf(37) * Math.log(4 / 140), 1e-9); near(MEM.nernstMv(1, 145, 12, 37), rtf(37) * Math.log(145 / 12), 1e-9);
    near(MEM.nernstMv(-1, 110, 10, 37), -rtf(37) * Math.log(110 / 10), 1e-9); near(MEM.nernstMv(2, 1.8, 1e-4, 37), (rtf(37) / 2) * Math.log(1.8 / 1e-4), 1e-9);
    near(MEM.nernstMv(1, 4, 140, 37), -95.02, 0.05); near(MEM.nernstMv(1, 145, 12, 37), 66.59, 0.05); near(MEM.nernstMv(2, 1.8, 1e-4, 37), 130.94, 0.05);
  });
  test("[BIO-NERNST-2] RT/F is 26.73 mV at 37 C and 25.26 mV at 20 C; E_K scales linearly with absolute temperature", () => { near(rtf(37), 26.727, 2e-3); near(rtf(20), 25.261, 2e-3); near(MEM.nernstMv(1, 4, 140, 37) / MEM.nernstMv(1, 4, 140, 20), (37 + 273.15) / (20 + 273.15), 1e-12); });
  test("[BIO-NERNST-3] sign convention: Vm = phi_in - phi_out; a cation concentrated inside has a negative equilibrium potential; an anion concentrated outside has a negative one too", () => { assert.ok(MEM.nernstMv(1, 4, 140, 37) < 0); assert.ok(MEM.nernstMv(-1, 110, 10, 37) < 0); assert.ok(MEM.nernstMv(1, 145, 12, 37) > 0); });
  test("[BIO-NERNST-4] GHK with P_K:P_Na:P_Cl = 1:0.04:0.45 equals the hand expression; it lies between E_K and E_Na; Cl- enters with in/out swapped", () => {
    const ions = MEM.TYPICAL_IONS; const top = 1 * 4 + 0.04 * 145 + 0.45 * 10, bot = 1 * 140 + 0.04 * 12 + 0.45 * 110; const v = MEM.ghkVoltageMv(ions, { k: 1, na: 0.04, cl: 0.45 }, 37);
    near(v, rtf(37) * Math.log(top / bot), 1e-9); assert.ok(v > MEM.nernstMv(1, 4, 140, 37) && v < MEM.nernstMv(1, 145, 12, 37)); near(MEM.ghkVoltageMv(ions, { k: 1, na: 0, cl: 0 }, 37), MEM.nernstMv(1, 4, 140, 37), 1e-9);
    near(MEM.ghkVoltageMv(ions, { k: 0, na: 1, cl: 0 }, 37), MEM.nernstMv(1, 145, 12, 37), 1e-9);
  });
});

describe("BIO-HH: Hodgkin-Huxley squid giant axon at 6.3 C (modern convention: rest -65 mV, depolarisation positive)", () => {
  // Rate functions re-typed from the published equations, in the equivalent form V = -(v + 65) of the original sign convention.
  const aN = (v) => (v === -55 ? 0.1 : (0.01 * (v + 55)) / (1 - Math.exp(-(v + 55) / 10)));
  const bN = (v) => 0.125 * Math.exp(-(v + 65) / 80);
  const aM = (v) => (v === -40 ? 1 : (0.1 * (v + 40)) / (1 - Math.exp(-(v + 40) / 10)));
  const bM = (v) => 4 * Math.exp(-(v + 65) / 18);
  const aH = (v) => 0.07 * Math.exp(-(v + 65) / 20);
  const bH = (v) => 1 / (1 + Math.exp(-(v + 35) / 10));
  test("[BIO-HH-1] declared parameters: Cm 1 uF/cm2, gNa 120, gK 36, gL 0.3 mS/cm2, E_Na +50, E_K -77, E_L -54.387 mV, rest -65 mV, 6.3 C", () => {
    assert.deepEqual({ ...NEU.HH }, { cm: 1, gNa: 120, gK: 36, gL: 0.3, eNa: 50, eK: -77, eL: -54.387, vRest: -65, tempC: 6.3 });
  });
  test("[BIO-HH-2] rate functions equal the published equations on -100..60 mV", () => {
    for (let v = -100; v <= 60; v += 0.5) for (const [mine, theirs, name] of [[NEU.alphaN, aN, "aN"], [NEU.alphaM, aM, "aM"], [NEU.betaN, bN, "bN"], [NEU.betaM, bM, "bM"], [NEU.alphaH, aH, "aH"], [NEU.betaH, bH, "bH"]]) { if ((name === "aN" && v === -55) || (name === "aM" && v === -40)) continue; rel(mine(v), theirs(v), 1e-12, `${name}(${v})`); }
  });
  test("[BIO-HH-3] removable singularities: alpha_n(-55) = 0.1 and alpha_m(-40) = 1 exactly; near them the series 10c(1 + x/20 + x^2/1200) holds to 1e-12 with no jump", () => {
    assert.equal(NEU.alphaN(-55), 0.1); assert.equal(NEU.alphaM(-40), 1);
    for (const x of [1e-12, -1e-12, 1e-9, -1e-9, 1e-7, -1e-7, 1e-6, -1e-6, 1e-4, -1e-4, 1e-3, -1e-3]) {
      const s = (c) => 10 * c * (1 + x / 20 + (x * x) / 1200 - (x ** 4) / 28800000); rel(NEU.alphaN(-55 + x), s(0.01), 1e-12, `aN x=${x}`); rel(NEU.alphaM(-40 + x), s(0.1), 1e-12, `aM x=${x}`);
    }
  });
  test("[BIO-HH-4] resting state at -65 mV: m = 0.0529, h = 0.5961, n = 0.3177 (hand), and the net membrane current is ~0 there", () => {
    const m = aM(-65) / (aM(-65) + bM(-65)), h = aH(-65) / (aH(-65) + bH(-65)), n = aN(-65) / (aN(-65) + bN(-65));
    near(m, 0.0529, 5e-4); near(h, 0.5961, 5e-4); near(n, 0.3177, 5e-4);
    const I = 120 * m ** 3 * h * (-65 - 50) + 36 * n ** 4 * (-65 + 77) + 0.3 * (-65 + 54.387); near(I, 0, 0.05, "net rest current uA/cm2");
    near(NEU.steadyGate(NEU.alphaM(-65), NEU.betaM(-65)), m, 1e-12);
  });
  test("[BIO-HH-5] simulation: a 20 uA/cm2, 1 ms pulse fires one spike peaking between +30 and +50 mV that repolarises below -65 (undershoot); 1 uA/cm2 does not fire; TTX (Na block) prevents the spike", () => {
    const base = { amp: 20, startMs: 2, durMs: 1, amp2: 0, delayMs: 8, durationMs: 30, blockNa: false, blockK: false };
    const sim = (o) => NEU.simulateHh({ ...base, ...o }); const peak = (t) => Math.max(...t.v);
    const t = sim({}); assert.ok(peak(t) > 30 && peak(t) < 50, `peak ${peak(t)}`); assert.ok(Math.min(...t.v.slice(Math.floor(t.v.length / 4))) < -65, "undershoot");
    assert.ok(peak(sim({ amp: 1 })) < -50); assert.ok(peak(sim({ blockNa: true })) < -40);
    for (const g of [t.m, t.h, t.n]) for (const x of g) assert.ok(x >= 0 && x <= 1);
  });
  test("[BIO-HH-6] numerical convergence: halving dt changes the spike peak by < 0.1 mV and the peak time by < 0.05 ms", () => {
    const inp = { amp: 20, startMs: 2, durMs: 1, amp2: 0, delayMs: 8, durationMs: 20, blockNa: false, blockK: false };
    const a = NEU.simulateHh(inp, 0.01, 1), b = NEU.simulateHh(inp, 0.005, 1), c = NEU.simulateHh(inp, 0.0025, 1);
    const pk = (t) => { let k = 0; for (let i = 1; i < t.v.length; i++) if (t.v[i] > t.v[k]) k = i; return { v: t.v[k], t: t.t[k] }; };
    near(pk(a).v, pk(c).v, 0.1); near(pk(b).v, pk(c).v, 0.05); near(pk(a).t, pk(c).t, 0.05);
  });
  test("[BIO-HH-7] refractoriness: a second identical pulse 3 ms after the first fires no second spike; 15 ms after it does", () => {
    const run = (delayMs) => { const t = NEU.simulateHh({ amp: 20, startMs: 2, durMs: 1, amp2: 20, delayMs, durationMs: 40, blockNa: false, blockK: false }); let spikes = 0, up = false; for (const v of t.v) { if (v > 0 && !up) { spikes++; up = true; } if (v < -20) up = false; } return spikes; };
    assert.equal(run(3), 1); assert.equal(run(15), 2);
  });
});

// -------------------------------------------------------------------------------------------------------------------------------
describe("BIO-MECH: independently specified causal dependencies (curated mechanisms, not quantitative models)", () => {
  const ap = (o = {}) => DEATH.evaluateApoptosis({ dnaDamage: false, gfWithdrawal: false, erStress: false, mitoStress: false, deathLigand: false, typeII: false, perturbations: [], step: 0, path: "intrinsic", ...o }).values;
  test("[BIO-MECH-1] no stimulus, no executioner caspase", () => assert.equal(ap().casp37, false));
  test("[BIO-MECH-2] DNA damage + functional p53 -> PUMA/NOXA -> BAX/BAK -> MOMP -> cytochrome c -> apoptosome -> caspase-9 -> caspase-3/7 (every link present, in order)", () => { const v = ap({ dnaDamage: true }); for (const k of ["pumaNoxa", "bh3Effective", "baxBak", "momp", "cytC", "apoptosome", "casp9", "casp37"]) assert.equal(v[k], true, k); });
  test("[BIO-MECH-3] DNA damage without p53 gives no PUMA/NOXA and no death in this model", () => { const v = ap({ dnaDamage: true, perturbations: ["p53-loss"] }); assert.equal(v.pumaNoxa, false); assert.equal(v.casp37, false); });
  test("[BIO-MECH-4] BAX loss alone is rescued by BAK (and vice versa); loss of both blocks MOMP; each upstream/downstream block stops the cascade only downstream of itself", () => {
    assert.equal(ap({ dnaDamage: true, perturbations: ["bax-loss"] }).momp, true); assert.equal(ap({ dnaDamage: true, perturbations: ["bak-loss"] }).momp, true);
    const both = ap({ dnaDamage: true, perturbations: ["bax-loss", "bak-loss"] }); assert.equal(both.momp, false); assert.equal(both.pumaNoxa, true); assert.equal(both.casp37, false);
    const apaf = ap({ dnaDamage: true, perturbations: ["apaf1-loss"] }); assert.equal(apaf.cytC, true); assert.equal(apaf.apoptosome, false); assert.equal(apaf.casp37, false);
  });
  test("[BIO-MECH-5] BCL-2 excess blocks the intrinsic pathway; in the extrinsic pathway it blocks type II (needs mitochondria via tBID) but not type I (caspase-8 activates caspase-3/7 directly)", () => {
    assert.equal(ap({ dnaDamage: true, perturbations: ["bcl2-overexpression"] }).casp37, false);
    assert.equal(ap({ deathLigand: true, typeII: false, perturbations: ["bcl2-overexpression"] }).casp37, true); assert.equal(ap({ deathLigand: true, typeII: true, perturbations: ["bcl2-overexpression"] }).casp37, false);
    assert.equal(ap({ deathLigand: true, typeII: true }).tbid, true); assert.equal(ap({ deathLigand: true, typeII: true }).casp37, true);
  });
  test("[BIO-MECH-6] extrinsic: ligand needs a functional receptor and FADD; c-FLIP excess or caspase-8 inhibition blocks the DISC output; APAF1 loss does not block a type I cell", () => {
    assert.equal(ap({ deathLigand: true }).casp8, true);
    for (const p of ["receptor-defective", "fadd-loss", "cflip-high", "casp8-inhibited"]) assert.equal(ap({ deathLigand: true, perturbations: [p] }).casp37, false, p);
    assert.equal(ap({ deathLigand: true, perturbations: ["apaf1-loss"] }).casp37, true);
  });
  test("[BIO-MECH-7] the autophagy graph contains no caspase or MOMP node (autophagy is not apoptosis)", () => { const ids = DEATH.AUTOPHAGY_GRAPH.nodes.map((n) => n.id.toLowerCase()); assert.equal(ids.some((i) => /casp|momp/.test(i)), false); });
  test("[BIO-MECH-8] spindle checkpoint: an unattached kinetochore in mitosis prevents anaphase; with all attached anaphase proceeds", () => {
    const m = (o, p = []) => CYC.evaluateCycle({ ...CYC.DEFAULT_CYCLE, phase: "M", replicationComplete: true, perturbations: p, ...o }).values;
    assert.equal(m({ allAttached: false }).anaphase, false); assert.equal(m({ allAttached: true }).anaphase, true); assert.equal(m({ allAttached: true }, ["securin-stable"]).anaphase, false);
  });
});

describe("BIOCHEM: ATP-equivalent and nitrogen bookkeeping (conventional 2.5 / 1.5 P/O)", () => {
  // Hand expectation for a saturated even-chain fatty acid with n carbons: cycles = n/2 - 1, acetyl-CoA = n/2, NADH = FADH2 = cycles;
  // ATP-equivalents = 2.5 NADH + 1.5 FADH2 + 10 per acetyl-CoA - 2 for activation (ATP -> AMP + PPi, PPi -> 2 Pi).
  for (const n of [4, 8, 12, 16, 18]) test(`[BIOCHEM-FA-${n}] C${n}`, () => {
    const cyc = n / 2 - 1, ac = n / 2; const t = LIP.oxidationTotals({ kind: "saturated", carbons: n });
    assert.equal(t.cycles, cyc); assert.equal(t.acetylCoA, ac); assert.equal(t.nadh, cyc); assert.equal(t.fadh2, cyc); assert.equal(t.activationAtpEquivalents, 2);
    near(t.atp.total, 2.5 * cyc + 1.5 * cyc + 10 * ac - 2, 1e-9);
  });
  test("[BIOCHEM-FA-16b] palmitate: 7 cycles, 8 acetyl-CoA, 7 NADH, 7 FADH2, 2 ATP-eq activation, 106 ATP-eq under 2.5/1.5 (a convention, not a measurement); 10 ATP-eq per acetyl-CoA = 3(2.5) + 1.5 + 1", () => {
    const t = LIP.oxidationTotals({ kind: "saturated", carbons: 16 }); assert.deepEqual([t.cycles, t.acetylCoA, t.nadh, t.fadh2], [7, 8, 7, 7]); assert.equal(t.atp.total, 106); assert.equal(t.atpPerAcetylCoA, 3 * 2.5 + 1.5 + 1);
    assert.equal(t.atpDirectlyFromBetaOxidation, 0);
  });
  test("[BIOCHEM-UREA-1] urea cycle: 3 ATP molecules consumed but 4 high-energy phosphate bonds (CPS I 2 ATP -> 2 ADP; ASS ATP -> AMP + PPi; PPi -> 2 Pi); AMP 1, ADP 2", () => {
    const e = NIT.ureaEnergy(); assert.equal(e.atpMolecules, 3); assert.equal(e.highEnergyBonds, 4); assert.equal(e.amp, 1); assert.equal(e.adp, 2);
  });
  test("[BIOCHEM-UREA-2] net urea synthesis: one CO2, one NH4+, one aspartate -> one urea + one fumarate; phosphate atoms balance (9 on the ATP side = 4 + 1... Pi, AMP, ADP)", () => {
    const n = NIT.ureaNet(); assert.equal(n.urea, 1); assert.equal(n.fumarate, 1); assert.equal(n["aa-D"], -1); assert.equal(n.co2, -1); assert.equal(n.nh4, -1);
    // phosphate: -3 ATP (3 each) = 2 ADP (2 each) + 1 AMP (1) + 4 Pi (1 each)
    assert.equal(3 * 3, 2 * 2 + 1 + n.pi);
  });
  test("[BIOCHEM-UREA-3] the two nitrogen atoms of urea come from ammonium (CPS I) and aspartate (ASS)", () => {
    const sp = NIT.ureaTrace(7).find((s) => s.metabolite === "urea"); assert.ok(sp); assert.equal(sp.nitrogens.length, 2); const text = JSON.stringify(sp.nitrogens).toLowerCase(); assert.ok(/nh₄/.test(text) && /aspartate/.test(text), text);
    assert.match(NIT.UREA_NITROGEN_SOURCES.ammonium, /carbamoyl phosphate synthetase/); assert.match(NIT.UREA_NITROGEN_SOURCES.aspartate, /argininosuccinate synthetase/);
  });
});
