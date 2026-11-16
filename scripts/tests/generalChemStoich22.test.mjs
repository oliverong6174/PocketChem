// Stage 22: formula parsing, equation balancing, limiting reagents, yields and solution stoichiometry. Expected values are worked out by hand
// (sums of tabulated atomic masses, known balanced equations, mole-ratio arithmetic); none comes from the function under test.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let F, B, S, E;
before(async () => {
  F = await loadModule("/src/utils/generalChem/formula.ts");
  B = await loadModule("/src/utils/generalChem/balance.ts");
  S = await loadModule("/src/utils/generalChem/stoichiometry.ts");
  E = await loadModule("/src/utils/generalChem/elements.ts");
});
after(async () => { await closeEngine(); });

const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const parse = (t) => { const r = F.parseFormula(t); assert.ok(r.ok, `${t}: ${r.error}`); return r.value; };
const eq = (t) => { const r = B.parseEquation(t); assert.ok(r.ok, `${t}: ${r.error}`); return r.value; };
const bal = (t) => B.balanceEquation(eq(t));
const mol = (value) => ({ mode: "mol", value, purity: 100, M: 1, mL: 100 });
const grams = (value, purity = 100) => ({ mode: "g", value, purity, M: 1, mL: 100 });
const soln = (M, mL) => ({ mode: "soln", value: 0, purity: 100, M, mL });

describe("atomic masses", () => {
  test("a few elements match the tabulated conventional values", () => {
    near(E.atomicMass("H"), 1.008, 1e-9); near(E.atomicMass("C"), 12.011, 1e-9); near(E.atomicMass("O"), 15.999, 1e-9);
    near(E.atomicMass("Na"), 22.990, 1e-9); near(E.atomicMass("Fe"), 55.845, 1e-9); near(E.atomicMass("Au"), 196.97, 1e-9);
    assert.equal(E.atomicMass("Xx"), null);
  });
  test("every element has a positive mass and increasing atomic number mostly follows mass order for the light elements", () => {
    for (const el of Object.values(E.ELEMENTS)) assert.ok(el.mass > 0 && el.Z > 0, el.symbol);
    assert.ok(E.ELEMENTS.H.mass < E.ELEMENTS.He.mass && E.ELEMENTS.He.mass < E.ELEMENTS.Li.mass);
  });
});

describe("formula parsing: counts, masses, groups, hydrates, charges", () => {
  test("[water] H2O = 2(1.008) + 15.999 = 18.015", () => { const f = parse("H2O"); assert.deepEqual(f.counts, { H: 2, O: 1 }); near(f.mass, 18.015, 1e-9); });
  test("[table salt] NaCl = 22.990 + 35.45 = 58.44", () => near(parse("NaCl").mass, 58.44, 1e-9));
  test("[glucose] C6H12O6 = 72.066 + 12.096 + 95.994 = 180.156", () => { const f = parse("C6H12O6"); assert.deepEqual(f.counts, { C: 6, H: 12, O: 6 }); near(f.mass, 180.156, 1e-9); });
  test("[parentheses] Ca(OH)2: Ca 1, O 2, H 2; 40.078 + 2(15.999 + 1.008) = 74.092", () => { const f = parse("Ca(OH)2"); assert.deepEqual(f.counts, { Ca: 1, O: 2, H: 2 }); near(f.mass, 74.092, 1e-9); });
  test("[parentheses] Fe2(SO4)3: Fe 2, S 3, O 12; 111.69 + 96.18 + 191.988 = 399.858", () => { const f = parse("Fe2(SO4)3"); assert.deepEqual(f.counts, { Fe: 2, S: 3, O: 12 }); near(f.mass, 399.858, 1e-9); });
  test("[nested brackets] K4[Fe(CN)6]: K 4, Fe 1, C 6, N 6; 156.392 + 55.845 + 72.066 + 84.042 = 368.345", () => { const f = parse("K4[Fe(CN)6]"); assert.deepEqual(f.counts, { K: 4, Fe: 1, C: 6, N: 6 }); near(f.mass, 368.345, 1e-9); });
  test("[hydrate] CuSO4·5H2O = 159.602 + 5(18.015) = 249.677, with '.' and '*' as separators too", () => {
    const f = parse("CuSO4·5H2O"); assert.deepEqual(f.counts, { Cu: 1, S: 1, O: 9, H: 10 }); near(f.mass, 249.677, 1e-9);
    assert.deepEqual(parse("CuSO4.5H2O").counts, f.counts); assert.deepEqual(parse("CuSO4*5H2O").counts, f.counts);
    assert.equal(f.parts.length, 2); assert.equal(f.parts[1].multiplier, 5);
  });
  test("[case matters] Co is cobalt (1 atom) but CO is carbon monoxide (2 atoms)", () => { assert.deepEqual(parse("Co").counts, { Co: 1 }); assert.deepEqual(parse("CO").counts, { C: 1, O: 1 }); });
  test("[ions] SO4^2- has charge -2 and the mass of SO4; NH4+ and OH- have charge ±1; Fe^3+ charge +3; Fe3+ is Fe3 with charge +1 (documented)", () => {
    const s = parse("SO4^2-"); assert.equal(s.charge, -2); near(s.mass, 96.056, 1e-9);
    assert.equal(parse("NH4+").charge, 1); assert.equal(parse("OH-").charge, -1); assert.equal(parse("Fe^3+").charge, 3);
    const odd = parse("Fe3+"); assert.equal(odd.charge, 1); assert.deepEqual(odd.counts, { Fe: 3 });
  });
  test("[electron] e- is a free electron: charge -1, no atoms, zero mass", () => { const e = parse("e-"); assert.equal(e.electron, true); assert.equal(e.charge, -1); assert.equal(e.mass, 0); });
  test("[pretty] display form uses subscripts and a superscript charge", () => {
    assert.equal(F.prettyFormula("H2O"), "H₂O"); assert.equal(F.prettyFormula("SO4^2-"), "SO₄²⁻"); assert.equal(F.prettyFormula("Fe^3+"), "Fe³⁺");
    assert.equal(F.prettyFormula("CuSO4.5H2O"), "CuSO₄·5H₂O"); assert.equal(F.prettyFormula("e-"), "e⁻"); assert.equal(F.prettyFormula("NH4+"), "NH₄⁺");
  });
  test("[rejected] malformed or unsupported notation is refused, never reinterpreted", () => {
    for (const bad of ["", "h2o", "H2O)", "(H2O", "Xx2", "H0", "2H2O", "H2 O", "H2O-+", "Na^+-", "CuSO4·0H2O", "()", "H2O^0+", "C6H12O6!", "[H2O)", "Fe^10+", "H1000", "NaCl^2+3"]) {
      assert.equal(F.parseFormula(bad).ok, false, `"${bad}" should be rejected`);
    }
    assert.equal(F.parseFormula("Ca(OH)2^2+").ok, true);
    assert.equal(F.parseFormula("CuSO4.5H2O^2+").ok, false, "a charge on a hydrate is not supported");
    assert.equal(F.parseFormula("x".repeat(200)).ok, false);
  });
  test("[nesting limit] more than 6 nested groups is refused", () => {
    assert.equal(F.parseFormula("(".repeat(8) + "H" + ")".repeat(8)).ok, false);
    assert.equal(F.parseFormula("((H))").ok, true);
  });
});

describe("equation parsing", () => {
  test("coefficients, arrows and species lists", () => {
    const e = eq("2 H2 + O2 -> 2 H2O"); assert.deepEqual(e.reactants.map((s) => s.coeff), [2, null]); assert.deepEqual(e.products.map((s) => s.text), ["H2O"]);
    assert.equal(B.parseEquation("H2 + O2 → H2O").ok, true); assert.equal(B.parseEquation("H2 + O2 = H2O").ok, true);
    assert.equal(eq("Fe^3+ + e- -> Fe^2+").reactants[1].parsed.electron, true);
  });
  test("bad equations are rejected with a reason", () => {
    for (const bad of ["", "H2 + O2", "H2 -> O2 -> H2O", "H2 + -> H2O", "H2+O2 -> H2O", "Xx + O2 -> H2O", "0 H2 -> H2"]) assert.equal(B.parseEquation(bad).ok, false, bad);
  });
});

describe("balancing by exact null-space: smallest whole numbers", () => {
  const cases = [
    ["H2 + O2 -> H2O", [2, 1, 2]],
    ["Fe + O2 -> Fe2O3", [4, 3, 2]],
    ["C3H8 + O2 -> CO2 + H2O", [1, 5, 3, 4]],
    ["Al + O2 -> Al2O3", [4, 3, 2]],
    ["N2 + H2 -> NH3", [1, 3, 2]],
    ["KMnO4 + HCl -> KCl + MnCl2 + Cl2 + H2O", [2, 16, 2, 2, 5, 8]],
    ["C6H12O6 + O2 -> CO2 + H2O", [1, 6, 6, 6]],
    ["Ca(OH)2 + H3PO4 -> Ca3(PO4)2 + H2O", [3, 2, 1, 6]],
    ["Al2(SO4)3 + Ca(OH)2 -> Al(OH)3 + CaSO4", [1, 3, 2, 3]],
    ["CuSO4.5H2O -> CuSO4 + H2O", [1, 1, 5]],
    ["MnO4^- + Fe^2+ + H^+ -> Mn^2+ + Fe^3+ + H2O", [1, 5, 8, 1, 5, 4]],
    ["Cr2O7^2- + Fe^2+ + H^+ -> Cr^3+ + Fe^3+ + H2O", [1, 6, 14, 2, 6, 7]],
    ["MnO4^- + H^+ + e- -> Mn^2+ + H2O", [1, 8, 5, 1, 4]],
    ["Cu + Ag^+ -> Cu^2+ + Ag", [1, 2, 1, 2]],
  ];
  for (const [text, want] of cases) {
    test(text, () => {
      const r = bal(text); assert.ok(r.ok, r.error); assert.deepEqual(r.coefficients, want);
      assert.equal(B.isBalanced(eq(text), r.coefficients), true); assert.equal(B.isLowestTerms(r.coefficients), true);
    });
  }
  test("a balanced equation conserves each element and the charge on both sides (independent recount)", () => {
    const e = eq("Cr2O7^2- + Fe^2+ + H^+ -> Cr^3+ + Fe^3+ + H2O"); const c = bal("Cr2O7^2- + Fe^2+ + H^+ -> Cr^3+ + Fe^3+ + H2O").coefficients;
    const rows = B.conservation(e, c); const charge = rows.find((r) => r.label === "charge");
    assert.deepEqual([charge.left, charge.right], [-2 + 12 + 14, 6 + 18]); // 24 = 24
    assert.ok(rows.every((r) => r.balanced));
  });
  test("manual coefficients are checked, not assumed", () => {
    const e = eq("H2 + O2 -> H2O");
    assert.equal(B.isBalanced(e, [2, 1, 2]), true); assert.equal(B.isBalanced(e, [1, 1, 1]), false); assert.equal(B.isBalanced(e, [4, 2, 4]), true);
    assert.equal(B.isLowestTerms([4, 2, 4]), false); assert.equal(B.isBalanced(e, [2, 1]), false); assert.equal(B.isBalanced(e, [0, 0, 0]), false);
    const rows = B.conservation(e, [1, 1, 1]); assert.deepEqual(rows.map((r) => [r.label, r.left, r.right]), [["H", 2, 2], ["O", 2, 1]]);
  });
  test("[no solution] species that cannot conserve atoms give no coefficients", () => { const r = bal("H2 + O2 -> NaCl"); assert.equal(r.ok, false); assert.equal(r.kind, "none"); assert.equal(r.coefficients, undefined); });
  test("[underdetermined] two independent balances: nothing is invented", () => { const r = bal("H2 + O2 + H2O2 -> H2O"); assert.equal(r.ok, false); assert.equal(r.kind, "underdetermined"); });
  test("[inadmissible] a unique conserving solution that needs a species on the other side is not returned", () => { const r = bal("H2 + H2O -> O2"); assert.equal(r.ok, false); assert.equal(r.kind, "inadmissible"); });
  test("[inadmissible] a species that takes no part gets coefficient 0 and is refused", () => { const r = bal("H2 + O2 + NaCl -> H2O"); assert.equal(r.ok, false); });
  test("[duplicates] the same species twice is refused", () => { assert.equal(bal("H2 + H2 -> H2").ok, false); });
  test("[charge matters] without the charge row an unbalanced-charge equation would pass; with it, it must fail", () => { assert.equal(bal("Fe^3+ + Fe -> Fe^2+").ok, true); assert.equal(bal("Cu + Ag^+ -> Cu^2+ + Ag").ok, true); assert.equal(bal("Cu^2+ -> Cu").ok, false); });
});

describe("resolving a reaction for stoichiometry", () => {
  test("auto-balances when coefficients are omitted; accepts correct given coefficients (even if not lowest)", () => {
    const a = S.resolveReaction("H2 + O2 -> H2O"); assert.ok(a.ok); assert.equal(a.value.balancedBy, "auto"); assert.deepEqual(a.value.reactants.map((s) => s.coeff), [2, 1]);
    const g = S.resolveReaction("4 H2 + 2 O2 -> 4 H2O"); assert.ok(g.ok); assert.equal(g.value.balancedBy, "given"); assert.equal(g.value.lowestTerms, false);
  });
  test("wrong given coefficients are refused with the imbalance", () => { const r = S.resolveReaction("H2 + O2 -> 2 H2O"); assert.equal(r.ok, true); const bad = S.resolveReaction("1 H2 + 1 O2 -> 1 H2O"); assert.equal(bad.ok, false); assert.match(bad.error, /do not balance/); });
  test("electrons are not allowed in stoichiometry", () => { assert.equal(S.resolveReaction("Fe^3+ + e- -> Fe^2+").ok, false); });
});

describe("limiting reagent, excess, theoretical and percent yield (one reaction extent)", () => {
  test("[2H2 + O2 -> 2H2O] 4.000 g H2 and 32.00 g O2: H2 limits; n(H2) = 4/2.016 = 1.98413, ξ = 0.99206, 1.98413 mol H2O = 35.744 g, O2 left 0.0080 mol", () => {
    const r = S.resolveReaction("H2 + O2 -> H2O").value; const out = S.solveStoichiometry(r, [grams(4), grams(32)]); assert.ok(out.ok);
    const v = out.value; near(v.extent, 4 / 2.016 / 2, 1e-12); assert.deepEqual(v.limiting, [0]); assert.equal(v.exact, false);
    const [h2, o2, h2o] = v.ledger; assert.equal(h2.limiting, true); assert.equal(h2.finalMol, 0); assert.equal(o2.excess, true);
    near(o2.finalMol, 32 / 31.998 - 4 / 2.016 / 2, 1e-9); near(h2o.finalMol, 4 / 2.016, 1e-9); near(h2o.finalG, (4 / 2.016) * 18.015, 1e-9); near(h2o.finalG, 35.744, 1e-3);
    // mass is conserved: reactant mass consumed equals product mass formed
    const used = h2.initialG + (o2.initialG - o2.finalG); near(used, h2o.finalG, 1e-9);
  });
  test("[percent yield] 30.0 g collected from a theoretical 35.744 g is 83.93 %", () => {
    const r = S.resolveReaction("H2 + O2 -> H2O").value; const v = S.solveStoichiometry(r, [grams(4), grams(32)]).value;
    const y = S.percentYield(v, 0, 30); near(y.percent, (30 / 35.744) * 100, 1e-2); assert.equal(y.over100, false); near(y.theoreticalG, 35.744, 1e-3);
  });
  test("[over 100 %] is flagged, not hidden or validated", () => {
    const r = S.resolveReaction("H2 + O2 -> H2O").value; const v = S.solveStoichiometry(r, [mol(2), mol(1)]).value;
    const y = S.percentYield(v, 0, 40); assert.ok(y.percent > 100); assert.equal(y.over100, true);
    assert.ok(S.percentYield(v, 0, -1).error); assert.ok(S.percentYield(v, 3, 1).error);
  });
  test("[stoichiometric mixture] 2 mol H2 + 1 mol O2: both are limiting and nothing is left over", () => {
    const r = S.resolveReaction("H2 + O2 -> H2O").value; const v = S.solveStoichiometry(r, [mol(2), mol(1)]).value;
    assert.deepEqual(v.limiting, [0, 1]); assert.equal(v.exact, true); near(v.extent, 1, 1e-12); assert.ok(v.ledger.every((x) => !x.excess));
  });
  test("[purity] 10.00 g of 80.0 % CaCO3 with excess HCl: 8.000 g / 100.086 = 0.07993 mol -> 0.07993 mol CO2 = 3.518 g", () => {
    const r = S.resolveReaction("CaCO3 + HCl -> CaCl2 + H2O + CO2").value; assert.deepEqual(r.reactants.map((x) => x.coeff), [1, 2]);
    const v = S.solveStoichiometry(r, [grams(10, 80), mol(1)]).value; near(v.ledger[0].initialMol, 8 / 100.086, 1e-9); assert.deepEqual(v.limiting, [0]);
    const co2 = v.ledger.find((x) => x.text === "CO2"); near(co2.finalMol, 8 / 100.086, 1e-9); near(co2.finalG, (8 / 100.086) * 44.009, 1e-9); near(co2.finalG, 3.518, 2e-3);
    near(v.ledger[1].finalMol, 1 - 2 * (8 / 100.086), 1e-9);
  });
  test("[three reactants and two products share one extent] 2Al + 6HCl -> 2AlCl3 + 3H2 with 3 mol Al and 6 mol HCl: HCl limits, ξ = 1", () => {
    const r = S.resolveReaction("Al + HCl -> AlCl3 + H2").value; assert.deepEqual([...r.reactants, ...r.products].map((x) => x.coeff), [2, 6, 2, 3]);
    const v = S.solveStoichiometry(r, [mol(3), mol(6)]).value; near(v.extent, 1, 1e-12); assert.deepEqual(v.limiting, [1]);
    near(v.ledger[0].finalMol, 1, 1e-12); near(v.ledger[2].finalMol, 2, 1e-12); near(v.ledger[3].finalMol, 3, 1e-12);
  });
  test("[zero reactant] a reactant at 0 mol gives zero extent and zero product", () => {
    const r = S.resolveReaction("H2 + O2 -> H2O").value; const v = S.solveStoichiometry(r, [mol(0), mol(1)]).value; assert.equal(v.extent, 0); assert.equal(v.ledger[2].finalMol, 0); assert.equal(S.percentYield(v, 0, 1).percent, null);
  });
  test("[invalid amounts] negative, non-numeric, impossible purity and missing entries are refused", () => {
    const r = S.resolveReaction("H2 + O2 -> H2O").value;
    for (const bad of [[mol(-1), mol(1)], [mol(NaN), mol(1)], [grams(1, 0), mol(1)], [grams(1, 120), mol(1)], [mol(1)], [grams(-3), mol(1)], [soln(-1, 10), mol(1)], [mol(1e9), mol(1)]]) assert.equal(S.solveStoichiometry(r, bad).ok, false);
  });
  test("[molar mass lookups] gram amounts convert with the formula's own mass", () => { const r = S.amountToMoles(grams(18.015), 18.015); near(r.moles, 1, 1e-12); assert.equal(S.amountToMoles(mol(2), 18.015).grams, 2 * 18.015); });
});

describe("solution stoichiometry: molarity, dilution and reactive mixing are different things", () => {
  test("[molarity] 0.250 mol in 500 mL is 0.500 M; moles from M and V", () => { near(S.molarity(0.25, 0.5), 0.5, 1e-12); near(S.molesFromSolution(0.5, 250), 0.125, 1e-12); });
  test("[dilution] 25.0 mL of 12.0 M diluted to 500 mL is 0.600 M; the solute (0.300 mol) is unchanged and 475 mL of solvent is added", () => {
    const d = S.solveDilution({ unknown: "M2", M1: 12, V1: 25, M2: NaN, V2: 500 }); assert.ok(d.ok); near(d.value, 0.6, 1e-12); near(d.solute, 0.3, 1e-12); near(d.solventAdded, 475, 1e-9);
  });
  test("[dilution] V1 for 250 mL of 0.100 M from 12.0 M stock = 2.083 mL; V2 and M1 solve too", () => {
    near(S.solveDilution({ unknown: "V1", M1: 12, V1: NaN, M2: 0.1, V2: 250 }).value, 25 / 12, 1e-12);
    near(S.solveDilution({ unknown: "V2", M1: 6, V1: 10, M2: 0.5, V2: NaN }).value, 120, 1e-12);
    near(S.solveDilution({ unknown: "M1", M1: NaN, V1: 10, M2: 0.5, V2: 120 }).value, 6, 1e-12);
  });
  test("[dilution] concentrating is refused: dilution adds solvent only", () => {
    assert.equal(S.solveDilution({ unknown: "M2", M1: 1, V1: 100, M2: NaN, V2: 50 }).ok, false);
    assert.equal(S.solveDilution({ unknown: "V2", M1: 1, V1: 100, M2: 2, V2: NaN }).ok, false);
    assert.equal(S.solveDilution({ unknown: "M2", M1: -1, V1: 100, M2: NaN, V2: 200 }).ok, false);
  });
  test("[reactive mixing] 25.0 mL of 0.200 M HCl + 50.0 mL of 0.0600 M Ca(OH)2: 0.00500 mol H+ side vs 0.00300 mol; HCl limits at ξ = 0.00250; 0.00050 mol Ca(OH)2 left in 75.0 mL", () => {
    const r = S.resolveReaction("HCl + Ca(OH)2 -> CaCl2 + H2O").value; assert.deepEqual([...r.reactants, ...r.products].map((x) => x.coeff), [2, 1, 1, 2]);
    const v = S.solveStoichiometry(r, [soln(0.2, 25), soln(0.06, 50)]).value; near(v.extent, 0.0025, 1e-12); assert.deepEqual(v.limiting, [0]); near(v.totalMl, 75, 1e-12);
    const c = S.concentrationsAfterMixing(v); near(c.find((x) => x.text === "Ca(OH)2").M, 0.0005 / 0.075, 1e-9); near(c.find((x) => x.text === "CaCl2").M, 0.0025 / 0.075, 1e-9);
  });
  test("[mixing] precipitation 50.0 mL 0.100 M AgNO3 + 50.0 mL 0.100 M NaCl: exact; 0.00500 mol AgCl = 0.7166 g", () => {
    const r = S.resolveReaction("AgNO3 + NaCl -> AgCl + NaNO3").value; const v = S.solveStoichiometry(r, [soln(0.1, 50), soln(0.1, 50)]).value;
    assert.equal(v.exact, true); const agcl = v.ledger.find((x) => x.text === "AgCl"); near(agcl.finalMol, 0.005, 1e-12); near(agcl.finalG, 0.005 * 143.32, 1e-9);
  });
  test("[mixing needs all solutions] a gram-mode reactant gives no total volume and no concentrations", () => {
    const r = S.resolveReaction("AgNO3 + NaCl -> AgCl + NaNO3").value; const v = S.solveStoichiometry(r, [soln(0.1, 50), grams(1)]).value; assert.equal(v.totalMl, null); assert.equal(S.concentrationsAfterMixing(v), null);
  });
});
