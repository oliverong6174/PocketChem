// Stage 28: Lewis structures, formal charge, resonance, VSEPR, bond polarity and hybridisation. Valence-electron tables and expected
// answers are written out here by hand; nothing is taken from the functions under test.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let L, V;
before(async () => { L = await loadModule("/src/utils/generalChem/lewis28.ts"); V = await loadModule("/src/utils/generalChem/vsepr28.ts"); });
after(async () => { await closeEngine(); });
const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const VAL = { H: 1, He: 2, B: 3, C: 4, N: 5, O: 6, F: 7, Si: 4, P: 5, S: 6, Cl: 7, Br: 7, Xe: 8 };
const mol = (id) => { const m = L.getMolecule(id); assert.ok(m, id); return m; };
const rep = (m, s) => L.analyzeLewis(m, L.structureToState(s));
/** formal charge written out here: V − lone-pair electrons − bonds attached (each bond order counts one shared pair → half of 2 per order). */
function hand(m, s) { return m.atoms.map((el, i) => { let bonds = 0; m.bonds.forEach(([a, b], k) => { if (a === i || b === i) bonds += s.bondOrders[k]; }); return VAL[el] - 2 * s.lonePairs[i] - bonds; }); }

describe("valence electrons and electron conservation", () => {
  test("[table] valence electrons of free atoms", () => { for (const [el, v] of Object.entries(VAL)) assert.equal(L.valenceElectrons(el), v, el); assert.equal(L.valenceElectrons("Fe"), null); });
  test("[conservation] every curated structure uses exactly the valence electrons of its atoms minus the ionic charge", () => {
    assert.ok(L.MOLECULES.length >= 25);
    for (const m of L.MOLECULES) for (const s of m.structures) {
      const total = m.atoms.reduce((a, el) => a + VAL[el], 0) - m.charge;
      const bondE = 2 * s.bondOrders.reduce((a, b) => a + b, 0); const lpE = 2 * s.lonePairs.reduce((a, b) => a + b, 0);
      assert.equal(bondE + lpE, total, `${m.id}/${s.id}`);
      const r = rep(m, s); assert.equal(r.valid, true); assert.equal(r.conserved, true, `${m.id}/${s.id}`); assert.equal(r.totalValence, total); assert.equal(r.counted, total);
    }
  });
  test("[formal charge] computed values equal FC = V − N − B/2 written out independently, and sum to the ionic charge", () => {
    for (const m of L.MOLECULES) for (const s of m.structures) { const r = rep(m, s); const h = hand(m, s); r.atoms.forEach((a, i) => assert.equal(a.formalCharge, h[i], `${m.id}/${s.id} atom ${i}`)); assert.equal(h.reduce((a, b) => a + b, 0), m.charge); assert.equal(r.formalChargeSum, m.charge); assert.equal(r.chargeConsistent, true); }
    assert.equal(L.formalCharge(5, 0, 8), 1); assert.equal(L.formalCharge(6, 6, 2), -1); assert.equal(L.formalCharge(6, 4, 4), 0);
  });
  test("[known formal charges] NH₄⁺ N +1; O₃ (+1, 0, −1); NO₃⁻ N +1 with O 0, −1, −1; CO₃²⁻ C 0; CO C −1 O +1; SO₄²⁻ S +2 or 0; BF₃ B 0 or −1", () => {
    const fc = (id, k) => rep(mol(id), mol(id).structures[k]).atoms.map((a) => a.formalCharge);
    assert.deepEqual(fc("nh4", 0), [1, 0, 0, 0, 0]); assert.deepEqual(fc("o3", 0), [1, 0, -1]); assert.deepEqual(fc("no3", 0), [1, 0, -1, -1]); assert.deepEqual(fc("co3", 0), [0, 0, -1, -1]);
    assert.deepEqual(fc("co", 0), [-1, 1]); assert.deepEqual(fc("so4", 0), [2, -1, -1, -1, -1]); assert.deepEqual(fc("so4", 1), [0, 0, 0, -1, -1]); assert.deepEqual(fc("bf3", 0), [0, 0, 0, 0]); assert.deepEqual(fc("bf3", 1), [-1, 1, 0, 0]);
    assert.deepEqual(fc("no2", 0), [0, 0, -1]); assert.deepEqual(fc("so2", 0), [1, 0, -1]); assert.deepEqual(fc("so2", 2), [0, 0, 0]); assert.deepEqual(fc("h2o", 0), [0, 0, 0]);
  });
  test("[errors] a wrong lone-pair count breaks conservation and the report says by how much", () => {
    const m = mol("h2o"); let r = L.analyzeLewis(m, { bondOrders: [1, 1], lonePairs: [1, 0, 0] }); assert.equal(r.conserved, false); assert.equal(r.difference, -2); assert.equal(r.matchedStructure, null);
    r = L.analyzeLewis(m, { bondOrders: [1, 1], lonePairs: [3, 0, 0] }); assert.equal(r.difference, 2); assert.equal(r.atoms[0].status, "exceeds");
    r = L.analyzeLewis(m, { bondOrders: [2, 1], lonePairs: [2, 0, 0] }); assert.equal(r.conserved, false);
  });
  test("[invalid input] bond order 0 or 4, lone pairs −1 or 5, wrong array lengths and non-integers are rejected", () => {
    const m = mol("h2o");
    for (const s of [{ bondOrders: [0, 1], lonePairs: [2, 0, 0] }, { bondOrders: [4, 1], lonePairs: [2, 0, 0] }, { bondOrders: [1, 1], lonePairs: [-1, 0, 0] }, { bondOrders: [1, 1], lonePairs: [5, 0, 0] }, { bondOrders: [1], lonePairs: [2, 0, 0] }, { bondOrders: [1, 1], lonePairs: [2, 0] }, { bondOrders: [1.5, 1], lonePairs: [2, 0, 0] }]) assert.equal(L.analyzeLewis(m, s).valid, false, JSON.stringify(s));
  });
  test("[matching] the curated structures are recognised, and the same electron count in a different pattern is valid but not matched", () => {
    const m = mol("no3"); for (const s of m.structures) assert.equal(rep(m, s).matchedStructure, s.id);
    const odd = L.analyzeLewis(mol("co2"), { bondOrders: [1, 3], lonePairs: [0, 3, 1] }); assert.equal(odd.valid, true); assert.equal(odd.conserved, true); assert.equal(odd.matchedStructure, null); assert.ok(odd.sumAbsFormalCharge > 0);
  });
});

describe("octet bookkeeping", () => {
  const status = (id, k, i) => rep(mol(id), mol(id).structures[k]).atoms[i].status;
  test("[statuses] H duet; O in water octet; B in BF₃ incomplete (6); P in PCl₅ and S in SF₆ expanded (10, 12); Xe in XeF₄ expanded (12)", () => {
    assert.equal(status("h2o", 0, 1), "duet"); assert.equal(status("h2o", 0, 0), "octet"); assert.equal(status("bf3", 0, 0), "incomplete"); assert.equal(rep(mol("bf3"), mol("bf3").structures[0]).atoms[0].electronsAround, 6);
    assert.equal(status("pcl5", 0, 0), "expanded"); assert.equal(rep(mol("pcl5"), mol("pcl5").structures[0]).atoms[0].electronsAround, 10); assert.equal(rep(mol("sf6"), mol("sf6").structures[0]).atoms[0].electronsAround, 12);
    assert.equal(status("xef4", 0, 0), "expanded"); assert.equal(status("so4", 0, 0), "octet"); assert.equal(status("so4", 1, 0), "expanded"); assert.equal(status("so2", 2, 0), "expanded"); assert.equal(status("bf3", 1, 0), "octet");
  });
  test("[period 2] more than eight electrons on N or C is refused as exceeding the octet", () => {
    const r = L.analyzeLewis(mol("ch4"), { bondOrders: [2, 1, 1, 1], lonePairs: [0, 0, 0, 0, 0] }); assert.equal(r.atoms[0].status, "exceeds"); assert.ok(r.concerns.length > 0);
    assert.equal(L.analyzeLewis(mol("nh3"), { bondOrders: [1, 1, 1], lonePairs: [2, 0, 0, 0] }).atoms[0].status, "exceeds");
  });
  test("[nothing is inferred] the curated list is the only source of structures: unknown ids return undefined", () => { assert.equal(L.getMolecule("c60"), undefined); assert.equal(L.getMolecule(""), undefined); });
});

describe("resonance", () => {
  const hybridOf = (id) => L.resonanceHybrid(mol(id));
  test("[equivalence] contributors of O₃, NO₃⁻, CO₃²⁻, NO₂⁻ and SO₂ (octet forms) are equivalent: same elements and formal charges, relabelled", () => {
    for (const id of ["o3", "no3", "co3", "no2", "so2"]) assert.equal(hybridOf(id).equivalent, true, id);
    assert.equal(hybridOf("o3").contributors.length, 2); assert.equal(hybridOf("no3").contributors.length, 3); assert.equal(hybridOf("so2").contributors.length, 2);
  });
  test("[averages] mean bond orders O₃ 1.5, NO₃⁻ and CO₃²⁻ 4/3, NO₂⁻ 1.5, SO₂ 1.5; mean formal charge on each O of NO₃⁻ −2/3, of CO₃²⁻ −2/3, of O₃ ends −1/2", () => {
    for (const x of hybridOf("o3").averageBondOrders) near(x, 1.5, 1e-12); for (const x of hybridOf("no3").averageBondOrders) near(x, 4 / 3, 1e-12); for (const x of hybridOf("co3").averageBondOrders) near(x, 4 / 3, 1e-12); for (const x of hybridOf("no2").averageBondOrders) near(x, 1.5, 1e-12);
    for (const x of hybridOf("so2").averageBondOrders) near(x, 1.5, 1e-12);
    hybridOf("no3").averageFormalCharge.slice(1).forEach((x) => near(x, -2 / 3, 1e-12)); hybridOf("co3").averageFormalCharge.slice(1).forEach((x) => near(x, -2 / 3, 1e-12)); near(hybridOf("o3").averageFormalCharge[1], -0.5, 1e-12); near(hybridOf("o3").averageFormalCharge[2], -0.5, 1e-12); near(hybridOf("o3").averageFormalCharge[0], 1, 1e-12);
  });
  test("[hybrid average conserves charge] the mean formal charges sum to the ionic charge", () => { for (const id of ["o3", "no3", "co3", "no2", "so2"]) near(hybridOf(id).averageFormalCharge.reduce((a, b) => a + b, 0), mol(id).charge, 1e-12, id); });
  test("[no resonance claimed] molecules without equivalent contributors have no hybrid; SO₄²⁻ and BF₃ list alternatives, not resonance", () => {
    for (const id of ["h2o", "ch4", "co2", "so4", "bf3", "n2"]) assert.equal(hybridOf(id), null, id);
    assert.ok(mol("so4").structures.every((s) => s.kind !== "resonance")); assert.ok(mol("so4").caution.length > 20);
  });
  test("[wording] resonance molecules carry the warning that contributors are not real, interconverting species", () => { for (const id of ["o3", "no3", "co3"]) assert.match(mol(id).caution, /not two molecules|real (structure|ion)/i, id); assert.match(mol("o2").caution, /unpaired/); });
});

describe("VSEPR geometry", () => {
  const G = (X, E) => { const r = V.vseprGeometry(X, E); assert.ok(r.ok, `${X},${E}: ${r.error}`); return r.value; };
  const TABLE = [
    [2, 0, "linear", "linear"], [3, 0, "trigonal planar", "trigonal planar"], [2, 1, "trigonal planar", "bent"], [4, 0, "tetrahedral", "tetrahedral"], [3, 1, "tetrahedral", "trigonal pyramidal"], [2, 2, "tetrahedral", "bent"],
    [5, 0, "trigonal bipyramidal", "trigonal bipyramidal"], [4, 1, "trigonal bipyramidal", "seesaw"], [3, 2, "trigonal bipyramidal", "T-shaped"], [2, 3, "trigonal bipyramidal", "linear"],
    [6, 0, "octahedral", "octahedral"], [5, 1, "octahedral", "square pyramidal"], [4, 2, "octahedral", "square planar"],
  ];
  test("[table] electron-domain and molecular geometry for the 13 supported (bonded, lone-pair) combinations", () => {
    for (const [X, E, dg, mg] of TABLE) { const g = G(X, E); assert.equal(g.entry.domainGeometry, dg); assert.equal(g.entry.molecularGeometry, mg); assert.equal(g.entry.domains, X + E); assert.equal(g.atoms.length, X); assert.equal(g.lonePairs.length, E); }
    assert.equal(V.SUPPORTED_VSEPR.length, 13); assert.equal(V.GEOMETRY_NAMES.length, 11); // 11 distinct molecular shapes
  });
  test("[electron-domain vs molecular] bent water and bent SO₂ have different domain geometries; seesaw/T-shape/linear share the trigonal bipyramid", () => {
    assert.equal(G(2, 2).entry.domainGeometry, "tetrahedral"); assert.equal(G(2, 1).entry.domainGeometry, "trigonal planar"); assert.equal(G(2, 2).entry.molecularGeometry, G(2, 1).entry.molecularGeometry);
    assert.equal(new Set([G(4, 1), G(3, 2), G(2, 3), G(5, 0)].map((g) => g.entry.domainGeometry)).size, 1);
  });
  test("[ideal angles] 180, 120, 109.47 (arccos(−1/3)), TBP {90, 120, 180}, octahedral {90, 180}", () => {
    assert.deepEqual(G(2, 0).entry.idealAngles, [180]); assert.deepEqual(G(3, 0).entry.idealAngles, [120]); near(G(4, 0).entry.idealAngles[0], (Math.acos(-1 / 3) * 180) / Math.PI, 0.06); assert.deepEqual(G(5, 0).entry.idealAngles, [90, 120, 180]); assert.deepEqual(G(6, 0).entry.idealAngles, [90, 180]);
    assert.deepEqual(G(4, 1).entry.idealAngles, [90, 120, 180]); assert.deepEqual(G(3, 2).entry.idealAngles, [90, 180]); assert.deepEqual(G(4, 2).entry.idealAngles, [90, 180]); assert.deepEqual(G(5, 1).entry.idealAngles, [90, 180]); assert.deepEqual(G(2, 3).entry.idealAngles, [180]);
  });
  test("[angle counts] number of atom pairs at each ideal angle: seesaw 1×180 4×90 1×120; T-shape 1×180 2×90; square planar 4×90 2×180; square pyramid 8×90 2×180; TBP 3×120 6×90 1×180", () => {
    const cls = (X, E) => Object.fromEntries(G(X, E).angleClasses.map((a) => [a.deg, a.count]));
    assert.deepEqual(cls(4, 1), { 90: 4, 120: 1, 180: 1 }); assert.deepEqual(cls(3, 2), { 90: 2, 180: 1 }); assert.deepEqual(cls(4, 2), { 90: 4, 180: 2 }); assert.deepEqual(cls(5, 1), { 90: 8, 180: 2 }); assert.deepEqual(cls(5, 0), { 90: 6, 120: 3, 180: 1 }); assert.deepEqual(cls(6, 0), { 90: 12, 180: 3 });
  });
  test("[coordinates] atoms and lone pairs are unit vectors; the bond directions of a symmetric geometry sum to zero; lone pairs are placed away from each other", () => {
    for (const [X, E] of V.SUPPORTED_VSEPR.map((r) => [r.X, r.E])) { const g = G(X, E); for (const p of [...g.atoms, ...g.lonePairs]) near(Math.hypot(...p), 1, 1e-12); }
    for (const [X, E] of [[2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [4, 2], [2, 3]]) { const g = G(X, E); const s = [0, 1, 2].map((k) => g.atoms.reduce((a, p) => a + p[k], 0)); near(Math.hypot(...s), 0, 1e-12, `${X},${E}`); }
    const lp2 = G(4, 2).lonePairs; near(V.angleBetween(lp2[0], lp2[1]), 180, 1e-9); const lp5 = G(2, 3).lonePairs; assert.equal(lp5.length, 3); for (const p of lp5) near(p[2], 0, 1e-12); // equatorial
  });
  test("[unsupported] one bonded atom, zero or negative counts, more than six domains, and unlisted combinations are refused with a reason", () => {
    for (const [X, E] of [[1, 3], [0, 0], [1, 0], [7, 0], [4, 3], [3, 3], [2, 4], [-1, 2], [2.5, 0], [6, 1], [5, 2]]) { const r = V.vseprGeometry(X, E); assert.equal(r.ok, false, `${X},${E}`); assert.ok(r.error.length > 10); }
  });
  test("[text description] mentions domains, geometry names, angles and the lone-pair caveat", () => {
    const t = V.describeGeometry(G(3, 1), "Nitrogen"); assert.match(t, /3 bonded atoms/); assert.match(t, /1 lone pair/); assert.match(t, /tetrahedral arrangement/); assert.match(t, /trigonal pyramidal/); assert.match(t, /squeeze/);
    assert.doesNotMatch(V.describeGeometry(G(4, 0)), /squeeze/);
  });
  test("[curated molecules] the central atom's bonded-atom and lone-pair counts give the expected shapes, in every contributor", () => {
    const want = { h2o: [2, 2, "bent"], nh3: [3, 1, "trigonal pyramidal"], ch4: [4, 0, "tetrahedral"], nh4: [4, 0, "tetrahedral"], co2: [2, 0, "linear"], hcn: [2, 0, "linear"], o3: [2, 1, "bent"], no3: [3, 0, "trigonal planar"], co3: [3, 0, "trigonal planar"], no2: [2, 1, "bent"], so2: [2, 1, "bent"], so4: [4, 0, "tetrahedral"], bf3: [3, 0, "trigonal planar"], ccl4: [4, 0, "tetrahedral"], pcl5: [5, 0, "trigonal bipyramidal"], sf4: [4, 1, "seesaw"], clf3: [3, 2, "T-shaped"], xef2: [2, 3, "linear"], sf6: [6, 0, "octahedral"], brf5: [5, 1, "square pyramidal"], xef4: [4, 2, "square planar"], ch2o: [3, 0, "trigonal planar"] };
    for (const [id, [X, E, shape]] of Object.entries(want)) { const m = mol(id); m.structures.forEach((s, k) => { const d = V.centerDomains(m, k); if (m.structures[k].kind === "alternative" && (id === "so2" || id === "bf3" || id === "so4")) return; assert.deepEqual([d.X, d.E], [X, E], `${id}/${s.id}`); assert.equal(V.moleculeGeometry(m, k).value.entry.molecularGeometry, shape, `${id}/${s.id}`); }); }
    assert.equal(V.centerDomains(mol("n2"), 0), null); assert.equal(V.moleculeGeometry(mol("c2h4")), null);
  });
  test("[textbook angles are labelled approximate] only H₂O 104.5°, NH₃ 107°, O₃ 117°, CO₂ 180° are listed; lone-pair molecules sit below the ideal values", () => {
    assert.equal(mol("h2o").textbookAngle.deg, 104.5); assert.ok(mol("h2o").textbookAngle.deg < 109.47); assert.ok(mol("nh3").textbookAngle.deg < 109.47); assert.ok(mol("o3").textbookAngle.deg < 120); assert.equal(mol("co2").textbookAngle.deg, 180);
    assert.ok(L.MOLECULES.filter((m) => m.textbookAngle).length <= 4);
  });
  test("[rotation] a rotation keeps lengths and angles; zero angles are the identity", () => {
    const g = G(4, 0); const r = g.atoms.map((p) => V.rotate(p, 37, -22)); for (const p of r) near(Math.hypot(...p), 1, 1e-12); near(V.angleBetween(r[0], r[1]), V.angleBetween(g.atoms[0], g.atoms[1]), 1e-9); near(V.rotate([1, 2, 3], 0, 0)[0], 1, 1e-15);
  });
});

describe("bond polarity and molecular polarity", () => {
  const EN = { H: 2.20, C: 2.55, N: 3.04, O: 3.44, F: 3.98, Cl: 3.16, S: 2.58, P: 2.19, B: 2.04, Xe: 2.6, Br: 2.96, Na: 0.93 };
  test("[bond] ΔEN, direction and class for H–F, O–H, C–H, Cl–Cl, Na–Cl, C–Cl, N–H", () => {
    const b = (x, y) => V.bondPolarity(x, y);
    near(b("H", "F").delta, 1.78, 1e-9); assert.equal(b("H", "F").moreElectronegative, "F"); assert.equal(b("H", "F").cls, "very polar (ionic character)"); near(b("O", "H").delta, 1.24, 1e-9); assert.equal(b("O", "H").cls, "polar covalent");
    near(b("C", "H").delta, 0.35, 1e-9); assert.equal(b("C", "H").cls, "nonpolar covalent"); assert.equal(b("Cl", "Cl").delta, 0); assert.equal(b("Cl", "Cl").moreElectronegative, null); near(b("Na", "Cl").delta, 2.23, 1e-9); assert.equal(b("Na", "Cl").cls, "very polar (ionic character)");
    near(b("C", "Cl").delta, 0.61, 1e-9); near(b("N", "H").delta, 0.84, 1e-9); assert.equal(b("Fe", "O"), null);
  });
  const P = (id, k = 0) => { const r = V.polarityOf(mol(id), k); assert.ok(r, id); return r; };
  test("[cancellation] CO₂, CCl₄, BF₃, PCl₅, XeF₂, XeF₄, SF₆ have polar bonds but zero net dipole; CH₄ has no polar bond at all", () => {
    for (const id of ["co2", "ccl4", "bf3", "pcl5", "xef2", "xef4", "sf6"]) { const p = P(id); assert.equal(p.anyPolarBond, true, id); assert.equal(p.cancels, true, id); assert.equal(p.classification, "nonpolar molecule", id); assert.match(p.reason, /cancel/); }
    const ch4 = P("ch4"); assert.equal(ch4.anyPolarBond, false); assert.equal(ch4.classification, "nonpolar molecule"); assert.match(ch4.reason, /No bond is appreciably polar/);
  });
  test("[polar molecules] H₂O, NH₃, SO₂, SF₄, ClF₃, BrF₅, CHCl₃, CH₂Cl₂, HCN, CH₂O do not cancel", () => { for (const id of ["h2o", "nh3", "so2", "sf4", "clf3", "brf5", "chcl3", "ch2cl2", "hcn", "ch2o"]) { const p = P(id); assert.equal(p.cancels, false, id); assert.equal(p.classification, "polar molecule", id); assert.ok(p.netMagnitude > 0.05); } });
  test("[hand vectors] water 2·ΔEN·cos(θ/2) = 1.432 with θ = 109.47°; CHCl₃ 0.96; CH₂Cl₂ 0.96·2cos(θ/2) = 1.109 (tetrahedral directions sum to zero)", () => {
    near(P("h2o").netMagnitude, 2 * 1.24 * Math.cos(Math.acos(-1 / 3) / 2), 1e-9); near(P("h2o").netMagnitude, 1.4318, 1e-3);
    near(P("chcl3").netMagnitude, 0.96, 1e-9);
    // CH2Cl2: Σ all four tetrahedral directions = 0, so d_Cl1 + d_Cl2 = −(d_H1 + d_H2); net = −0.35(d_H1+d_H2) + 0.61(d_Cl1+d_Cl2) = −0.96 (d_H1+d_H2); |d_H1+d_H2| = 2cos(109.47°/2) = 1.1547
    near(P("ch2cl2").netMagnitude, 0.96 * 2 * Math.cos((Math.acos(-1 / 3) / 2)), 1e-9);
  });
  test("[direction] the net vector of water points along the bisector toward the hydrogens' side (away from the lone pairs); bond arrows run toward the more electronegative atom", () => {
    const p = P("h2o"); assert.ok(p.bonds.every((b) => b.to === "O" && b.from === "H")); assert.ok(P("co2").bonds.every((b) => b.to === "O")); assert.ok(P("hcn").bonds.some((b) => b.from === "C" && b.to === "N")); assert.ok(P("hcn").bonds.some((b) => b.from === "H" && b.to === "C"));
    const g = V.moleculeGeometry(mol("h2o")).value; const bis = [0, 1, 2].map((k) => g.atoms[0][k] + g.atoms[1][k]); const dotp = p.net.reduce((a, v, k) => a + v * bis[k], 0); // net points toward O's side = −(H bisector)
    assert.ok(dotp < 0); near(Math.abs(dotp), p.netMagnitude * Math.hypot(...bis), 1e-9);
  });
  test("[symmetry cases] SF₄ (seesaw) and XeF₄ (square planar) have the same bonds but different outcomes; the two axial dipoles of SF₄ cancel", () => {
    assert.equal(P("sf4").cancels, false); assert.equal(P("xef4").cancels, true); const s = P("sf4"); const ax = V.vseprGeometry(4, 1).value.atoms.map((a, i) => ({ a, i })).filter(({ a }) => Math.abs(a[2]) > 0.99); assert.equal(ax.length, 2);
    const axSum = [0, 1, 2].map((k) => ax.reduce((t, { i }) => t + s.bonds[i].vector[k], 0)); near(Math.hypot(...axSum), 0, 1e-12);
  });
  test("[limitations are stated] schematic only, with NF₃ and ozone named as cautions; no measured dipole is ever returned", () => {
    const p = P("o3"); assert.equal(p.classification, "nonpolar molecule"); assert.match(p.limitation, /NF₃/); assert.match(p.limitation, /ozone/); assert.ok(!("debye" in p));
    assert.equal(V.polarityOf(mol("n2")), null); assert.equal(V.polarityOf(mol("c2h4")), null);
  });
  test("[electronegativity table] standard Pauling values for the elements used", () => { for (const [el, v] of Object.entries(EN)) near(V.ELECTRONEGATIVITY[el], v, 1e-12, el); assert.ok(V.POLARITY_ELEMENTS.every((e) => V.ELECTRONEGATIVITY[e] !== undefined)); });
});

describe("hybridisation bookkeeping", () => {
  const H = (id, k = 0) => L.hybridization(mol(id), L.structureToState(mol(id).structures[k]));
  test("[carbon] CH₄ sp³ (σ4 π0); C₂H₄ each C sp² (σ3 π1); C₂H₂ each C sp (σ2 π2); C₂H₆ sp³; CO₂ C sp (σ2 π2); HCN C sp; CH₂O C sp² and O sp²", () => {
    const only = (r, i) => r[i]; assert.deepEqual([H("ch4")[0].hybrid, H("ch4")[0].sigma, H("ch4")[0].pi], ["sp³", 4, 0]);
    for (const i of [0, 1]) { assert.deepEqual([H("c2h4")[i].hybrid, H("c2h4")[i].sigma, H("c2h4")[i].pi], ["sp²", 3, 1]); assert.deepEqual([H("c2h2")[i].hybrid, H("c2h2")[i].sigma, H("c2h2")[i].pi], ["sp", 2, 2]); assert.equal(H("c2h6")[i].hybrid, "sp³"); }
    assert.deepEqual([H("co2")[0].hybrid, H("co2")[0].pi], ["sp", 2]); assert.equal(H("hcn")[0].hybrid, "sp"); assert.equal(H("hcn")[2].hybrid, "sp"); assert.equal(H("ch2o")[0].hybrid, "sp²"); assert.equal(H("ch2o")[1].hybrid, "sp²"); void only;
  });
  test("[lone pairs count as domains] H₂O O and NH₃ N are sp³; BF₃ B sp²; NO₃⁻ N sp²; O₃ centre sp²; SO₂ S sp² (octet form); NH₄⁺ N sp³", () => {
    assert.equal(H("h2o")[0].hybrid, "sp³"); assert.equal(H("nh3")[0].hybrid, "sp³"); assert.equal(H("bf3")[0].hybrid, "sp²"); assert.equal(H("no3")[0].hybrid, "sp²"); assert.equal(H("o3")[0].hybrid, "sp²"); assert.equal(H("so2")[0].hybrid, "sp²"); assert.equal(H("nh4")[0].hybrid, "sp³");
  });
  test("[hydrogen] is not hybridised; the report says it uses 1s", () => { const r = H("h2o")[1]; assert.equal(r.hybrid, null); assert.match(r.note, /1s/); });
  test("[hypervalent] PCl₅ and SF₆ get bookkeeping labels with an explicit warning against d-orbital hybridisation; SF₄ (5 domains) also", () => {
    const p = H("pcl5")[0]; assert.equal(p.level, "bookkeeping"); assert.equal(p.hybrid, "sp³d"); assert.match(p.note, /only a label/); const s = H("sf6")[0]; assert.equal(s.hybrid, "sp³d²"); assert.equal(s.level, "bookkeeping"); assert.match(s.note, /do not rely on d-orbital/); assert.equal(H("sf4")[0].level, "bookkeeping");
    assert.equal(H("ch4")[0].level, "model");
  });
  test("[resonance caution] terminal single-bonded O⁻ in ozone is flagged as conjugated (delocalised lone pair)", () => { const r = H("o3", 0); assert.match(r[2].note, /delocalised/); assert.doesNotMatch(r[1].note, /delocalised/); });
  test("[σ and π counts] for every curated molecule Σπ over atoms equals 2 × the number of extra bond orders, and σ counts equal the number of bonds", () => {
    for (const m of L.MOLECULES) for (const s of m.structures) { const r = L.hybridization(m, L.structureToState(s)); const extra = s.bondOrders.reduce((a, b) => a + (b - 1), 0); assert.equal(r.reduce((a, x) => a + x.pi, 0), 2 * extra, `${m.id}/${s.id}`); assert.equal(r.reduce((a, x) => a + x.sigma, 0), 2 * m.bonds.length, `${m.id}/${s.id}`); }
  });
  test("[layout] every molecule has finite 2-D positions for each atom and no two atoms share a position", () => {
    for (const m of L.MOLECULES) { const pts = L.lewisLayout(m); assert.equal(pts.length, m.atoms.length, m.id); assert.ok(pts.flat().every(Number.isFinite)); assert.equal(new Set(pts.map((p) => p.map((v) => v.toFixed(3)).join(","))).size, pts.length, m.id); }
  });
});
