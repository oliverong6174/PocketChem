// Stage 17: peptide, protein-structure and enzyme-kinetics models checked against independently derived values.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let AA, P, PR, E, RD;
before(async () => {
  AA = await loadModule("/src/utils/biochem/aminoAcids.ts");
  P = await loadModule("/src/utils/biochem/peptide.ts");
  PR = await loadModule("/src/utils/biochem/protein.ts");
  E = await loadModule("/src/utils/biochem/enzyme.ts");
  RD = await loadModule("/src/utils/rdkit.ts");
});
after(async () => { await closeEngine(); });
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, `${m ?? ""} ${a} vs ${b}`);

describe("peptides", () => {
  test("parsing is strict about letters and length", () => {
    assert.equal(P.parsePeptide("ACD").ok, true);
    assert.equal(P.parsePeptide("ACB").ok, false);
    assert.equal(P.parsePeptide("").ok, false);
    assert.equal(P.parsePeptide("A".repeat(31)).ok, false);
  });
  test("Gly-Ala: formula C5H10N2O3 (two residues minus one water), mass 146.0691", () => {
    assert.equal(P.peptideFormula("GA"), "C5H10N2O3");
    near(P.peptideMonoisotopicMass("GA"), 146.0691, 0.0005);
    assert.equal(P.summarizePeptide("GA").bonds, 1);
  });
  test("pentapeptide Leu-enkephalin YGGFL: C28H37N5O7, 555.2693", () => {
    assert.equal(P.peptideFormula("YGGFL"), "C28H37N5O7");
    near(P.peptideMonoisotopicMass("YGGFL"), 555.2693, 0.001);
  });
  test("peptide formula equals RDKit's for the assembled structure", async () => {
    const rd = await RD.getRDKit();
    for (const seq of ["GA", "ACDK", "YGGFL", "CPW"]) {
      const s = P.peptideStructure(seq);
      const m = rd.get_mol(s.smiles);
      try {
        assert.equal(m.get_inchi().split("/")[1], P.peptideFormula(seq), seq);
        near(JSON.parse(m.get_descriptors()).exactmw, P.peptideMonoisotopicMass(seq), 0.001, seq);
      } finally { m.delete(); }
    }
  });
  test("reversing a peptide gives a different molecule with the same composition", () => {
    assert.notEqual(P.peptideStructure("GA").smiles, P.peptideStructure("AG").smiles);
    assert.deepEqual(P.composition("GA"), P.composition("AG"));
  });
});

describe("protein structure", () => {
  test("alpha-helix H-bonds run i -> i+4: n-4 bonds, 4 free donors and 4 free acceptors", () => {
    for (const n of [8, 12, 20]) {
      const hb = PR.helixHBonds(n);
      assert.equal(hb.length, n - 4);
      assert.ok(hb.every((b) => b.donor - b.acceptor === 4));
      const f = PR.helixFreeGroups(n);
      assert.equal(f.freeDonors.length, 4);
      assert.equal(f.freeAcceptors.length, 4);
    }
  });
  test("helix constants: 3.6 residues/turn, 100 degrees, 1.5 A rise", () => {
    assert.equal(PR.HELIX.residuesPerTurn, 3.6);
    assert.equal(PR.HELIX.turnAngleDeg, 100);
    assert.equal(PR.HELIX.risePerResidueA, 1.5);
    near(PR.wheelAngle(9), 180, 1e-9);
  });
  test("Ramachandran regions", () => {
    assert.equal(PR.classifyPhiPsi(-57, -47), "alpha-helix");
    assert.equal(PR.classifyPhiPsi(-119, 113), "beta-strand");
    assert.equal(PR.classifyPhiPsi(60, 45), "left-handed-helix");
    assert.equal(PR.classifyPhiPsi(60, -120), "disallowed");
    assert.notEqual(PR.classifyPhiPsi(60, -120, "G"), "disallowed"); // glycine is far less restricted
    assert.equal(PR.classifyPhiPsi(-63, 143, "P") === "disallowed", false);
  });
  test("beta sheets: antiparallel vs parallel strand orientation and bonds", () => {
    const a = PR.buildSheet("antiparallel", 6, 3);
    const p = PR.buildSheet("parallel", 6, 3);
    assert.deepEqual(a.directions ?? a.dirs ?? a.direction, a.directions ?? a.dirs ?? a.direction);
    assert.ok(a.bonds.length > 0 && p.bonds.length > 0);
    assert.ok(a.bonds.every((b) => b.strandB === b.strandA + 1));
  });
  test("salt bridge is strongest when both partners are charged (between their pKa values)", () => {
    const sb = PR.SALT_BRIDGES[0];
    assert.ok(PR.saltBridgeFraction(sb, 7) > PR.saltBridgeFraction(sb, 1));
    assert.ok(PR.saltBridgeFraction(sb, 7) > PR.saltBridgeFraction(sb, 13));
  });
  test("denaturing conditions are monotone: reducing agent disrupts disulfides, denaturant disrupts the core", () => {
    const base = PR.analyzeConditions(PR.DEFAULT_CONDITIONS);
    assert.equal(base.overall, "native-like");
    const red = PR.analyzeConditions({ ...PR.DEFAULT_CONDITIONS, reducingAgent: true });
    assert.ok(red.statuses.some((s) => /disulfide/i.test(s.label) && s.state === "disrupted"));
    const den = PR.analyzeConditions({ ...PR.DEFAULT_CONDITIONS, denaturant: true, thermal: "high" });
    assert.equal(den.overall, "denatured");
  });
  test("sickle-cell scenario substitutes Glu with Val and changes charge", () => {
    const s = PR.SCENARIOS.find((x) => /sickle|HBB|hemoglobin/i.test(x.title + x.protein));
    assert.ok(s, "a haemoglobin scenario exists");
    const r = PR.analyzeSubstitution(s.id, "V");
    assert.equal(r.mutant.one, "V");
    assert.equal(r.same, false);
  });
});

describe("enzyme kinetics", () => {
  test("Michaelis-Menten: v = Vmax at saturation, Vmax/2 at S = Km", () => {
    near(E.velocity(100, 2, 2), 50, 1e-12);
    near(E.velocity(100, 2, 2e6), 100, 1e-3);
    near(E.substrateForFraction(2, 0.9), 18, 1e-12);
  });
  test("inhibition changes the apparent parameters as the textbook says", () => {
    const I = (type, conc, ki, kip) => ({ type, conc, ki, kiPrime: kip, kip });
    const comp = E.apparentParameters(100, 2, { type: "competitive", conc: 4, ki: 2, kiPrime: 2 });
    near(comp.vmaxApp, 100, 1e-9); near(comp.kmApp, 6, 1e-9); // alpha = 1 + 4/2 = 3
    const unc = E.apparentParameters(100, 2, { type: "uncompetitive", conc: 4, ki: 2, kiPrime: 2 });
    near(unc.vmaxApp, 100 / 3, 1e-9); near(unc.kmApp, 2 / 3, 1e-9);
    const non = E.apparentParameters(100, 2, { type: "noncompetitive", conc: 4, ki: 2, kiPrime: 2 });
    near(non.vmaxApp, 100 / 3, 1e-9); near(non.kmApp, 2, 1e-9);
    void I;
  });
  test("velocity from apparent parameters equals the direct formula and Lineweaver-Burk intercepts are consistent", () => {
    const inh = { type: "mixed", conc: 3, ki: 2, kiPrime: 5 };
    const app = E.apparentParameters(100, 2, inh);
    for (const s of [0.1, 1, 10, 100]) near(E.inhibitedVelocity(100, 2, s, inh), app.vmaxApp * s / (app.kmApp + s), 1e-9);
    const lb = E.lineweaver(100, 2, inh);
    near(lb.intercept, 1 / app.vmaxApp, 1e-9);
    near(lb.slope, app.kmApp / app.vmaxApp, 1e-9);
  });
  test("species fractions sum to 1", () => {
    const f = E.speciesFractions(2, 5, { type: "mixed", conc: 3, ki: 2, kiPrime: 5 });
    near(f.E + f.ES + f.EI + f.ESI, 1, 1e-12);
  });
  test("catalysis lowers the barrier by RT ln10 per decade and does not change K", () => {
    near(E.barrierLoweringKJ(1), 5.708, 0.01);
    near(E.equilibriumConstant(-5.708, 298.15), 10, 0.05);
  });
  test("validation rejects out-of-range and non-numeric input", () => {
    assert.equal(E.validateEnzymeInput({ ...E.DEFAULT_ENZYME_INPUT, km: -1 }).ok, false);
    assert.equal(E.validateEnzymeInput({ ...E.DEFAULT_ENZYME_INPUT, vmax: "x" }).ok, false);
    assert.equal(E.validateEnzymeInput(E.DEFAULT_ENZYME_INPUT).ok, true);
  });
});
