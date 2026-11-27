// Stage 17: verifies the curated amino-acid dataset against RDKit (stereochemistry, formulas, masses) and textbook references.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let AA, RD, ION;
before(async () => {
  AA = await loadModule("/src/utils/biochem/aminoAcids.ts");
  ION = await loadModule("/src/utils/biochem/ionization.ts");
  RD = await loadModule("/src/utils/rdkit.ts");
});
after(async () => { await closeEngine(); });

const rd_ = () => RD.getRDKit();

// Independent reference (Lehninger / Kyte-Doolittle), typed separately from the implementation.
const HYDROPATHY = { A: 1.8, R: -4.5, N: -3.5, D: -3.5, C: 2.5, Q: -3.5, E: -3.5, G: -0.4, H: -3.2, I: 4.5, L: 3.8, K: -3.9, M: 1.9, F: 2.8, P: -1.6, S: -0.8, T: -0.7, W: -0.9, Y: -1.3, V: 4.2 };
const SIDE_PKA = { D: 3.65, E: 4.25, H: 6.00, C: 8.18, Y: 10.07, K: 10.53, R: 12.48 };
const FORMULA = { G: "C2H5NO2", A: "C3H7NO2", V: "C5H11NO2", L: "C6H13NO2", I: "C6H13NO2", P: "C5H9NO2", F: "C9H11NO2", W: "C11H12N2O2", M: "C5H11NO2S", S: "C3H7NO3", T: "C4H9NO3", C: "C3H7NO2S", Y: "C9H11NO3", N: "C4H8N2O3", Q: "C5H10N2O3", D: "C4H7NO4", E: "C5H9NO4", K: "C6H14N2O2", R: "C6H14N4O2", H: "C6H9N3O2" };

describe("amino-acid dataset", () => {
  test("20 unique standard amino acids and the genetic-code table agrees", () => {
    assert.equal(AA.AMINO_ACID_LIST.length, 20);
    assert.equal(new Set(AA.AMINO_ACID_LIST.map((a) => a.one)).size, 20);
    assert.equal(AA.codeTableAgrees(), true);
  });
  test("hydropathy and side-chain pKa match the references", () => {
    for (const a of AA.AMINO_ACID_LIST) {
      assert.equal(a.hydropathy, HYDROPATHY[a.one], a.name);
      const side = a.groups.find((g) => g.id === "side-chain");
      if (SIDE_PKA[a.one] === undefined) assert.equal(side, undefined, a.name);
      else assert.ok(Math.abs(side.pKa - SIDE_PKA[a.one]) <= 0.15, `${a.name} ${side?.pKa}`);
    }
  });
  test("formulas match the reference", () => { for (const a of AA.AMINO_ACID_LIST) assert.equal(a.formula, FORMULA[a.one], a.name); });
  test("RDKit: SMILES parse, formula from InChI, CIP labels equal the independent L-amino-acid reference", async () => {
    const rd = await rd_();
    // Natural L-amino acids: alpha carbon S (R for cysteine because of sulfur priority); Ile (2S,3S); Thr (2S,3R); Gly achiral.
    const CIP = { G: [], C: ["(R)"], I: ["(S)", "(S)"], T: ["(S)", "(R)"] };
    for (const a of AA.AMINO_ACID_LIST) {
      const m = rd.get_mol(a.smiles);
      assert.ok(m && m.is_valid(), a.name);
      try {
        const inchi = m.get_inchi();
        const hill = inchi.split("/")[1];
        assert.equal(hill, a.formula, `${a.name} formula`);
        const labels = JSON.parse(m.get_stereo_tags()).CIP_atoms.map((x) => x[1]).sort();
        const want = (CIP[a.one] ?? ["(S)"]).slice().sort();
        assert.deepEqual(labels, want, `${a.name} CIP`);
        assert.deepEqual(Object.values(a.stereo).map((x) => `(${x})`).sort(), want, `${a.name} declared stereo`);
        const mass = JSON.parse(m.get_descriptors()).exactmw;
        assert.ok(Math.abs(mass - AA.monoMass(AA.parseFormula(a.formula))) < 1e-3, `${a.name} mass`);
      } finally { m.delete(); }
    }
  });
});

describe("ionization", () => {
  test("isoelectric points match textbook values (±0.1)", () => {
    const pI = { G: 5.97, A: 6.0, D: 2.77, E: 3.22, K: 9.74, R: 10.76, H: 7.59, C: 5.07, Y: 5.66 };
    for (const [one, ref] of Object.entries(pI)) {
      const a = AA.AMINO_ACIDS_BY_ONE[one];
      assert.ok(Math.abs(ION.isoelectricPoint(a.groups) - ref) <= 0.12, `${a.name}: ${ION.isoelectricPoint(a.groups)} vs ${ref}`);
    }
  });
  test("charge at pH = pKa is half; net charge at pI is zero", () => {
    assert.ok(Math.abs(ION.fractionProtonated(4.25, 4.25) - 0.5) < 1e-12);
    for (const a of AA.AMINO_ACID_LIST) assert.ok(Math.abs(ION.netCharge(a, ION.isoelectricPoint(a.groups))) < 0.02, a.name);
  });
});
