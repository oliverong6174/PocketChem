// Stage 22: electrochemistry. Expected values are hand calculations from the tabulated standard potentials (E°cell = E°cathode - E°anode),
// the Nernst equation, delta G = -nFE and Faraday's laws. Half-reactions are checked for atom and charge balance with the separate formula
// parser. None of the expectations is read from the functions under test.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let X, F, G;
before(async () => {
  X = await loadModule("/src/utils/generalChem/electrochem.ts");
  F = await loadModule("/src/utils/generalChem/formula.ts");
  G = await loadModule("/src/utils/generalChem/gas.ts");
});
after(async () => { await closeEngine(); });

const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const FARADAY = 96485.33212; const R = 8.314462618;
const RTF = (R * 298.15) / FARADAY; // 0.0256926 V
const cell = (a, b, extra = {}) => { const ha = X.halfReaction(a); const hb = X.halfReaction(b); return { a, b, ca: X.variableSpecies(ha).map(() => 1), cb: X.variableSpecies(hb).map(() => 1), pH: 0, TC: 25, ...extra }; };
const build = (c) => { const r = X.buildGalvanicCell(c); assert.ok(r.ok, JSON.stringify(r.errors)); return r.value; };

describe("curated half-reactions", () => {
  test("every half-reaction conserves atoms and charge (ox side + n e- = red side), checked with the formula parser", () => {
    for (const h of X.HALF_REACTIONS) {
      const side = (list) => { const counts = {}; let charge = 0; for (const s of list) { const p = F.parseFormula(s.f); assert.ok(p.ok, `${h.id} ${s.f}`); for (const [k, v] of Object.entries(p.value.counts)) counts[k] = (counts[k] ?? 0) + v * s.nu; charge += p.value.charge * s.nu; } return { counts, charge }; };
      const L = side(h.ox); const Rr = side(h.red);
      assert.deepEqual(L.counts, Rr.counts, `${h.id} atoms`); assert.equal(L.charge - h.n, Rr.charge, `${h.id} charge`);
      assert.ok(Number.isInteger(h.n) && h.n >= 1, h.id);
    }
  });
  test("ids are unique and the series is ordered as the familiar activity series (Li < K < Ca < Na < Mg < Al < Zn < Fe < Pb < H2 < Cu < Ag < Au < F2)", () => {
    assert.equal(new Set(X.HALF_REACTIONS.map((h) => h.id)).size, X.HALF_REACTIONS.length);
    const E = (id) => X.halfReaction(id).E0; const order = ["Li", "K", "Ca", "Na", "Mg", "Al", "Zn", "Fe", "Pb", "H2", "Cu", "Ag", "Au", "F2"];
    for (let i = 1; i < order.length; i++) assert.ok(E(order[i - 1]) < E(order[i]), `${order[i - 1]} < ${order[i]}`);
  });
  test("well-known values: SHE is 0; Cu2+/Cu +0.34; Zn2+/Zn -0.76; Ag+/Ag +0.80; MnO4-/Mn2+ +1.51; O2/H2O +1.23 (within 0.01 V)", () => {
    const E = (id) => X.halfReaction(id).E0; near(E("H2"), 0, 1e-12); near(E("Cu"), 0.34, 0.01); near(E("Zn"), -0.76, 0.01); near(E("Ag"), 0.80, 0.01); near(E("MnO4"), 1.51, 0.01); near(E("O2"), 1.23, 0.01);
  });
});

describe("galvanic cell at standard conditions: E°cell = E°cathode - E°anode", () => {
  test("[Daniell cell] Zn | Zn2+ || Cu2+ | Cu: Cu is the cathode, Zn the anode, E° = 0.342 - (-0.762) = 1.104 V, n = 2", () => {
    const c = build(cell("Zn", "Cu")); assert.equal(c.cathode.id, "Cu"); assert.equal(c.anode.id, "Zn"); near(c.E0cell, 1.104, 1e-9); near(c.E, 1.104, 1e-9); assert.equal(c.n, 2);
    assert.equal(c.reversedByConditions, false); near(c.Q, 1, 1e-12);
    assert.deepEqual(c.reaction.reactants.map((s) => [s.f, s.nu]).sort(), [["Cu^2+", 1], ["Zn", 1]]); assert.deepEqual(c.reaction.products.map((s) => [s.f, s.nu]).sort(), [["Cu", 1], ["Zn^2+", 1]]);
  });
  test("[the order the couples are picked in does not change the cell]", () => { const a = build(cell("Zn", "Cu")); const b = build(cell("Cu", "Zn")); assert.equal(a.cathode.id, b.cathode.id); near(a.E, b.E, 1e-12); });
  test("[the potential is not multiplied by the coefficients] Cu + 2Ag+ -> Cu2+ + 2Ag has E° = 0.800 - 0.342 = 0.458 V, not 0.916 V", () => {
    const c = build(cell("Cu", "Ag")); near(c.E0cell, 0.458, 1e-9); assert.ok(Math.abs(c.E0cell - 0.916) > 0.4); assert.equal(c.n, 2);
    assert.deepEqual(c.reaction.reactants.map((s) => [s.f, s.nu]).sort(), [["Ag^+", 2], ["Cu", 1]]);
  });
  test("[electron balancing with unequal electron counts] Zn and Al: 3 Zn2+ + 2 Al -> 3 Zn + 2 Al3+, n = 6, E° = -0.762 - (-1.662) = 0.900 V", () => {
    const c = build(cell("Zn", "Al")); assert.equal(c.cathode.id, "Zn"); assert.equal(c.anode.id, "Al"); assert.equal(c.n, 6); near(c.E0cell, 0.9, 1e-9);
    assert.deepEqual(c.reaction.reactants.map((s) => [s.f, s.nu]).sort(), [["Al", 2], ["Zn^2+", 3]]); assert.deepEqual(c.reaction.products.map((s) => [s.f, s.nu]).sort(), [["Al^3+", 2], ["Zn", 3]]);
  });
  test("[protons and water cancel correctly] MnO4- with Fe3+/Fe2+: MnO4- + 8 H+ + 5 Fe2+ -> Mn2+ + 4 H2O + 5 Fe3+, n = 5, E° = 1.507 - 0.771 = 0.736 V", () => {
    const c = build(cell("MnO4", "Fe3")); assert.equal(c.n, 5); near(c.E0cell, 0.736, 1e-9);
    assert.deepEqual(c.reaction.reactants.map((s) => [s.f, s.nu]).sort(), [["Fe^2+", 5], ["H^+", 8], ["MnO4^-", 1]]);
    assert.deepEqual(c.reaction.products.map((s) => [s.f, s.nu]).sort(), [["Fe^3+", 5], ["H2O", 4], ["Mn^2+", 1]]);
  });
  test("[dichromate with iron(II)] Cr2O7(2-) + 14 H+ + 6 Fe2+ -> 2 Cr3+ + 7 H2O + 6 Fe3+, n = 6, E° = 1.33 - 0.771 = 0.559 V", () => {
    const c = build(cell("Cr2O7", "Fe3")); assert.equal(c.n, 6); near(c.E0cell, 0.559, 1e-9);
    assert.deepEqual(c.reaction.reactants.map((s) => [s.f, s.nu]).sort(), [["Cr2O7^2-", 1], ["Fe^2+", 6], ["H^+", 14]]);
  });
  test("[every pair gives a balanced overall equation] atoms and charge on both sides, using the parser; no electrons remain", () => {
    for (const a of X.HALF_REACTIONS) for (const b of X.HALF_REACTIONS) {
      if (a.id >= b.id) continue;
      const c = build(cell(a.id, b.id)); const tot = (list) => { const counts = {}; let q = 0; for (const s of list) { const p = F.parseFormula(s.f).value; for (const [k, v] of Object.entries(p.counts)) counts[k] = (counts[k] ?? 0) + v * s.nu; q += p.charge * s.nu; } return { counts, q }; };
      const L = tot(c.reaction.reactants); const Rr = tot(c.reaction.products); assert.deepEqual(L.counts, Rr.counts, `${a.id}/${b.id}`); assert.equal(L.q, Rr.q, `${a.id}/${b.id} charge`);
      assert.ok(c.E0cell >= -1e-12 || c.reversedByConditions === true);
      near(c.E0cell, Math.abs(a.E0 - b.E0), 1e-9, `${a.id}/${b.id}`);
    }
  });
  test("[SHE as a reference] Cu against the hydrogen electrode: E° = +0.342 V with H2 as the anode (H2 -> 2 H+ + 2 e-)", () => {
    const c = build(cell("H2", "Cu")); assert.equal(c.anode.id, "H2"); near(c.E0cell, 0.342, 1e-9); assert.deepEqual(c.reaction.reactants.map((s) => [s.f, s.nu]).sort(), [["Cu^2+", 1], ["H2", 1]]);
  });
});

describe("Nernst: E = E° - (RT/nF) ln Q", () => {
  test("[Daniell, dilute Zn2+] [Zn2+] = 0.010, [Cu2+] = 1.00: Q = 0.010, E = 1.104 - (0.0256926/2) ln 0.010 = 1.1632 V", () => {
    const c = build(cell("Zn", "Cu", { ca: [0.01], cb: [1] })); near(c.Q, 0.01, 1e-12); near(c.E, 1.104 - (RTF / 2) * Math.log(0.01), 1e-9); near(c.E, 1.1632, 1e-4); assert.ok(c.E > c.E0cell);
  });
  test("[Daniell, concentrated Zn2+ lowers E] [Zn2+] = 1.00, [Cu2+] = 0.0010: Q = 1000, E = 1.104 - 0.0128463 x 6.9078 = 1.0153 V", () => {
    const c = build(cell("Zn", "Cu", { ca: [1], cb: [0.001] })); near(c.Q, 1000, 1e-6); near(c.E, 1.104 - (RTF / 2) * Math.log(1000), 1e-9); near(c.E, 1.0153, 1e-4);
  });
  test("[Q = 1 gives E = E°] and a tenfold change of Q moves E by (RT ln10)/(nF) = 0.05916/n V at 25 C", () => {
    const c1 = build(cell("Cu", "Ag", { ca: [1], cb: [1] })); near(c1.E, c1.E0cell, 1e-12);
    const c2 = build(cell("Cu", "Ag", { ca: [0.1], cb: [1] })); // [Cu2+] = 0.1 -> Q = 0.1, n = 2
    near(c2.E - c2.E0cell, 0.05916 / 2, 2e-5); near(X.nernstSlope(2, 298.15), 0.05916 / 2, 2e-5);
  });
  test("[Q is the overall reaction quotient with the stoichiometric powers] Cu + 2Ag+ -> Cu2+ + 2Ag: Q = [Cu2+]/[Ag+]^2", () => {
    const c = build(cell("Cu", "Ag", { ca: [0.5], cb: [0.2] })); near(c.Q, 0.5 / 0.2 ** 2, 1e-9); near(c.E, 0.458 - (RTF / 2) * Math.log(12.5), 1e-9);
  });
  test("[pH enters through H+] MnO4-/Mn2+ half-cell at pH 2 vs standard: E = 1.507 - (RT/5F) ln(1/[H+]^8) = 1.507 - 0.0051385 x 36.84 = 1.3177 V", () => {
    const h = X.halfReaction("MnO4"); const E = X.halfPotential(h, [1, 1], 2, 298.15); near(E, 1.507 - (RTF / 5) * Math.log(1 / 1e-16), 1e-9); near(E, 1.3177, 1e-4);
    near(X.halfPotential(h, [1, 1], 0, 298.15), 1.507, 1e-12);
  });
  test("[gases enter as pressure] H+/H2 at 0.100 bar H2, pH 0: E = 0 - (RT/2F) ln(0.100) = +0.0296 V; O2/H2O at 0.21 bar, pH 7: E = 1.229 - (RT/4F) ln(1/(0.21 x 1e-28))", () => {
    near(X.halfPotential(X.halfReaction("H2"), [0.1], 0, 298.15), -(RTF / 2) * Math.log(0.1), 1e-9);
    near(X.halfPotential(X.halfReaction("O2"), [0.21], 7, 298.15), 1.229 - (RTF / 4) * Math.log(1 / (0.21 * 1e-28)), 1e-9);
    near(X.halfPotential(X.halfReaction("O2"), [0.21], 7, 298.15), 0.8, 0.05, "about 0.80 V at pH 7");
  });
  test("[temperature] the same concentrations at 50 C use T = 323.15 K in RT/nF", () => {
    const c = build(cell("Zn", "Cu", { ca: [0.01], cb: [1], TC: 50 })); near(c.E, 1.104 - ((R * 323.15) / (2 * FARADAY)) * Math.log(0.01), 1e-9);
  });
  test("[the potential and the concentrations are independent of volume] the same ratio at any absolute size gives the same E", () => {
    near(build(cell("Zn", "Cu", { ca: [0.02], cb: [0.2] })).E, build(cell("Zn", "Cu", { ca: [0.002], cb: [0.02] })).E, 1e-12);
  });
  test("[the half-cell potentials differ by E] E = E_cathode - E_anode computed from each half-cell separately", () => {
    const c = build(cell("Zn", "Cu", { ca: [0.05], cb: [0.8] })); near(c.Ecathode - c.Eanode, c.E, 1e-12); near(c.Ecathode, 0.342 - (RTF / 2) * Math.log(1 / 0.8), 1e-9); near(c.Eanode, -0.762 - (RTF / 2) * Math.log(1 / 0.05), 1e-9);
  });
  test("[concentrations can reverse the cell] Pb and Sn differ by only 0.012 V: at standard conditions Pb is the cathode; with [Pb2+] = 1e-6 M the Pb half-cell drops to -0.126 - 0.0128463 ln(1e6) = -0.3035 V, below Sn (-0.138 V), so Sn becomes the cathode and E°(as assigned) is negative", () => {
    const std = build(cell("Pb", "Sn")); assert.equal(std.cathode.id, "Pb"); near(std.E0cell, 0.012, 1e-9); assert.equal(std.reversedByConditions, false);
    const flipped = build(cell("Pb", "Sn", { ca: [1e-6], cb: [1] })); assert.equal(flipped.cathode.id, "Sn"); assert.equal(flipped.anode.id, "Pb"); assert.equal(flipped.reversedByConditions, true);
    near(flipped.E0cell, -0.012, 1e-9); near(flipped.Eanode, -0.126 - (RTF / 2) * Math.log(1e6), 1e-9); near(flipped.E, -0.138 - (-0.126 - (RTF / 2) * Math.log(1e6)), 1e-9); assert.ok(flipped.E > 0); assert.ok(flipped.dG0 > 0 && flipped.dG < 0, "unfavourable at standard state, favourable under these conditions");
  });
});

describe("Gibbs energy and equilibrium: ΔG° = -nFE° = -RT ln K", () => {
  test("[Daniell] ΔG° = -2 x 96485.33 x 1.104 = -213.04 kJ/mol, ln K = 85.94, log10 K = 37.32", () => {
    const c = build(cell("Zn", "Cu")); near(c.dG0, -2 * FARADAY * 1.104, 1e-6); near(c.dG0 / 1000, -213.04, 0.01); near(c.lnK, 213038.6 / (R * 298.15), 0.01); near(c.log10K, 37.32, 0.01);
    near(-R * 298.15 * c.lnK, c.dG0, 1e-6); // ΔG° = -RT ln K, consistent with ΔG° = -nFE°
  });
  test("[sign and size agree] E° > 0 -> ΔG° < 0 and K > 1; at Q = K the potential is zero", () => {
    const c = build(cell("Cu", "Ag")); assert.ok(c.E0cell > 0 && c.dG0 < 0 && c.lnK > 0);
    near(X.nernstAtLog10Q(c.E0cell, c.n, c.T, c.log10K), 0, 1e-12); near(X.nernstAtLog10Q(c.E0cell, c.n, c.T, 0), c.E0cell, 1e-12);
  });
  test("[ΔG under the conditions] ΔG = -nFE = ΔG° + RT ln Q", () => {
    const c = build(cell("Zn", "Cu", { ca: [0.01], cb: [1] })); near(c.dG, c.dG0 + R * 298.15 * c.lnQ, 1e-6); near(c.dG, -2 * FARADAY * c.E, 1e-6);
  });
  test("[different n changes the energy but not the potential] the Zn/Al cell: ΔG° = -6 x F x 0.900 = -521.0 kJ per reaction as written", () => { near(build(cell("Zn", "Al")).dG0 / 1000, -(6 * FARADAY * 0.9) / 1000, 1e-6); });
  test("[the slope] -(RT ln10)/(nF) = -0.05916/n V per unit log10 Q at 298.15 K", () => { near(X.nernstSlope(1, 298.15), 0.05916, 2e-5); near(X.nernstSlope(6, 298.15), 0.05916 / 6, 2e-5); });
});

describe("invalid or unsupported cells", () => {
  test("unknown or identical couples, impossible concentrations, wrong value counts and bad temperature are refused", () => {
    assert.equal(X.buildGalvanicCell({ ...cell("Zn", "Cu"), a: "Xx" }).ok, false); assert.equal(X.buildGalvanicCell(cell("Zn", "Zn")).ok, false);
    assert.equal(X.buildGalvanicCell(cell("Zn", "Cu", { ca: [0] })).ok, false); assert.equal(X.buildGalvanicCell(cell("Zn", "Cu", { ca: [-1] })).ok, false); assert.equal(X.buildGalvanicCell(cell("Zn", "Cu", { cb: [NaN] })).ok, false);
    assert.equal(X.buildGalvanicCell(cell("Zn", "Cu", { ca: [1, 1] })).ok, false); assert.equal(X.buildGalvanicCell(cell("Zn", "Cu", { TC: 150 })).ok, false); assert.equal(X.buildGalvanicCell(cell("Zn", "Cu", { TC: -5 })).ok, false);
    assert.equal(X.buildGalvanicCell(cell("MnO4", "Cu", { pH: 20 })).ok, false); assert.equal(X.buildGalvanicCell(cell("H2", "Cu", { ca: [1000] })).ok, false);
  });
});

describe("galvanic versus electrolytic conventions", () => {
  test("oxidation is at the anode and reduction at the cathode in both; terminal signs are opposite; electrons always go anode -> cathode externally", () => {
    const g = X.polarity("galvanic"); const e = X.polarity("electrolytic");
    for (const p of [g, e]) { assert.equal(p.oxidationAt, "anode"); assert.equal(p.reductionAt, "cathode"); assert.match(p.electronsFlow, /anode.*cathode/); assert.match(p.conventionalCurrent, /cathode.*anode/); }
    assert.deepEqual([g.anodeSign, g.cathodeSign], ["negative", "positive"]); assert.deepEqual([e.anodeSign, e.cathodeSign], ["positive", "negative"]);
  });
});

describe("electrolysis and Faraday's laws", () => {
  const run = (o = {}) => { const r = X.solveElectrolysis({ ...X.DEFAULT_ELECTROLYSIS, ...o }); assert.ok(r.ok, JSON.stringify(r.errors)); return r.value; };
  test("[copper] 2.00 A for 30.0 min: Q = 3600 C, 0.037312 mol e-, 0.018656 mol Cu = 1.1855 g", () => {
    const r = run({ id: "Cu-plate", I: 2, tMin: 30 }); near(r.Q, 3600, 1e-9); near(r.molElectrons, 3600 / FARADAY, 1e-12); near(r.cathode[0].mol, 3600 / FARADAY / 2, 1e-12); near(r.cathode[0].massG, (3600 / FARADAY / 2) * 63.546, 1e-9); near(r.cathode[0].massG, 1.1855, 1e-3);
    assert.equal(r.cathode[0].f, "Cu"); assert.equal(r.anode[0].f, "Cu^2+"); near(r.anode[1].mol, r.cathode[0].mol, 1e-15); // the anode loses as much copper as the cathode gains
  });
  test("[silver] 1.00 A for 1.00 h: 0.037312 mol Ag = 4.025 g (one electron per Ag+)", () => { const r = run({ id: "Ag-plate", I: 1, tMin: 60 }); near(r.cathode[0].mol, 3600 / FARADAY, 1e-12); near(r.cathode[0].massG, 4.0249, 2e-3); });
  test("[the electron count matters] the same charge deposits mass in proportion to M/n: Ag 107.87/1 vs Ni 58.693/2 vs Zn 65.38/2 vs Cu 63.546/2", () => {
    const q = { I: 1, tMin: 60 }; const m = (id) => run({ id, ...q }).cathode[0].massG; near(m("Ag-plate"), (3600 / FARADAY) * 107.87, 1e-6); near(m("Ni-plate"), (3600 / FARADAY / 2) * 58.693, 1e-6); near(m("Zn-plate"), (3600 / FARADAY / 2) * 65.38, 1e-6); near(m("Cu-plate"), (3600 / FARADAY / 2) * 63.546, 1e-6);
  });
  test("[current efficiency] 90 % of the charge deposits 90 % of the ideal mass; 100 % is the ideal", () => { near(run({ eff: 90 }).cathode[0].massG / run({ eff: 100 }).cathode[0].massG, 0.9, 1e-12); });
  test("[linear in I and in t] doubling either doubles the deposit; the rate (g/min) is mass/time", () => {
    const base = run({ I: 1, tMin: 10 }).cathode[0].massG; near(run({ I: 2, tMin: 10 }).cathode[0].massG, 2 * base, 1e-12); near(run({ I: 1, tMin: 20 }).cathode[0].massG, 2 * base, 1e-12); near(run({ I: 1, tMin: 10 }).rateGPerMin, base / 10, 1e-12);
    near(run({ I: 1, tMin: 0 }).cathode[0].massG, 0, 1e-15); near(run({ I: 1, tMin: 0 }).rateGPerMin, run({ I: 1, tMin: 10 }).rateGPerMin, 1e-12);
  });
  test("[water] 1.00 A for 1.00 h: 0.018656 mol H2 and 0.009328 mol O2 (2:1); gas volumes from PV = nRT at 25 C and 101.325 kPa are 0.4564 L and 0.2282 L", () => {
    const r = run({ id: "water", I: 1, tMin: 60 }); const h2 = r.cathode[0]; const o2 = r.anode[0]; assert.equal(h2.f, "H2"); assert.equal(o2.f, "O2");
    near(h2.mol, 3600 / FARADAY / 2, 1e-12); near(o2.mol, 3600 / FARADAY / 4, 1e-12); near(h2.mol / o2.mol, 2, 1e-12);
    near(h2.volumeL, ((3600 / FARADAY / 2) * R * 298.15) / 101325 * 1000, 1e-9); near(h2.volumeL, 0.4564, 1e-3); near(o2.volumeL, 0.2282, 1e-3); near(h2.volumeL / o2.volumeL, 2, 1e-12);
    near(h2.volumeL, G.solveIdeal("V", { n: h2.mol, T: 298.15, P: 101325 }) * 1000, 1e-9); // same ideal-gas relation as the Gas Laboratory
    const hot = run({ id: "water", I: 1, tMin: 60, TC: 100 }); near(hot.cathode[0].volumeL / h2.volumeL, 373.15 / 298.15, 1e-12);
  });
  test("[molten NaCl] 5.00 A for 1.00 h: 0.0932 mol Na (2.14 g) and 0.0466 mol Cl2 (3.30 g); no minimum voltage is claimed", () => {
    const r = run({ id: "molten-nacl", I: 5, tMin: 60 }); const ne = 18000 / FARADAY; near(r.cathode[0].mol, ne, 1e-12); near(r.cathode[0].massG, ne * 22.990, 1e-9); near(r.cathode[0].massG, 4.289, 1e-3); near(r.anode[0].mol, ne / 2, 1e-12); near(r.anode[0].massG, (ne / 2) * 70.9, 0.01); assert.equal(r.minVoltage, null);
  });
  test("[thermodynamic minimum voltage] water 1.229 V; Cu with an inert anode 1.229 - 0.342 = 0.887 V; same-metal plating 0 V", () => {
    near(run({ id: "water" }).minVoltage, 1.229, 1e-9); near(run({ id: "cu-inert" }).minVoltage, 0.887, 1e-9); near(run({ id: "Cu-plate" }).minVoltage, 0, 1e-12);
  });
  test("[inert anode] O2 and H+ form at the anode while Cu deposits; per mole of electrons Cu : O2 = 1/2 : 1/4", () => { const r = run({ id: "cu-inert", I: 1, tMin: 60 }); near(r.cathode[0].mol / r.anode[0].mol, 2, 1e-12); assert.equal(r.anode[0].f, "O2"); });
  test("[invalid inputs] unknown case, non-positive current, negative time, impossible efficiency or gas state are refused", () => {
    for (const bad of [{ id: "salt-water" }, { I: 0 }, { I: -1 }, { I: NaN }, { tMin: -1 }, { eff: 0 }, { eff: 120 }, { TC: 200 }, { PkPa: 0 }]) assert.equal(X.solveElectrolysis({ ...X.DEFAULT_ELECTROLYSIS, ...bad }).ok, false, JSON.stringify(bad));
  });
  test("[the tool does not pick products for arbitrary aqueous electrolyses] only the curated cases exist", () => {
    assert.ok(X.ELECTROLYSIS_CASES.length >= 7); assert.equal(X.electrolysisCase("aqueous-nacl"), undefined); assert.equal(X.electrolysisCase("brine"), undefined);
  });
});
