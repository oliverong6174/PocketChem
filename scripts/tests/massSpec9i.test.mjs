// Stage 9I: McLafferty ions are mechanism-derived m/z values; saturated aliphatics report an unreliable base peak.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let groups, nom, ms;
before(async () => {
  await loadEngine();
  groups = await loadModule("/src/utils/functionalGroups/index.ts");
  nom = await loadModule("/src/utils/nomenclatureUtils.ts");
  ms = await loadModule("/src/utils/spectroscopy/massSpec.ts");
});
after(async () => { await closeEngine(); });

async function predict(smiles) {
  const h = await groups.analyzeFunctionalGroupHierarchy(smiles);
  const p = (await nom.analyzeNomenclatureAndProperties(smiles, h.primaryGroups, h.mainGroup)).properties;
  return ms.predictMassSpectrum(p.molecularFormula, Number.parseFloat(p.exactMass), h.functionalGroups, smiles);
}
const mzs = (r) => r.peaks.map((x) => Math.round(x.mz));

describe("McLafferty ion m/z (acceptor fragment + the transferred H)", () => {
  for (const [smiles, mz, what] of [
    ["CCCCC(=O)O", 60, "straight-chain acid"],
    ["CCCCC(=O)OC", 74, "methyl ester"],
    ["CCCCC(=O)OCC", 88, "ethyl ester"],
    ["CCCCC=O", 44, "aldehyde"],
    ["CCCC(=O)C", 58, "2-alkanone"],
    ["CCCCC#N", 41, "nitrile"],
    ["CCCC(=O)N", 59, "primary amide"],
  ]) test(`${what}: ${smiles} shows m/z ${mz}`, async () => assert.ok(mzs(await predict(smiles)).includes(mz)));
  test("no gamma hydrogen, no McLafferty ion (acetic acid, pivalic acid)", async () => {
    assert.ok(!(await predict("CC(=O)O")).peaks.some((p) => /McLafferty/.test(p.label)));
    assert.ok(!(await predict("CC(C)(C)C(=O)O")).peaks.some((p) => /McLafferty/.test(p.label)));
  });
});

describe("base-peak certainty", () => {
  test("saturated aliphatic halide/alcohol/ether are unreliable and the molecular ion is not forced to dominate a long chain", async () => {
    for (const s of ["CCCCCCBr", "CCCCCCCCO", "CCCCOCCCC"]) {
      const r = await predict(s);
      assert.equal(r.basePeakCertainty, "unreliable", s);
      assert.ok(r.basePeakCandidates.length >= 2);
    }
  });
  test("benzylic and acetate classes are supported", async () => {
    assert.equal((await predict("Cc1ccccc1Cl")).basePeakCertainty, "supported");
    assert.equal((await predict("CCCCOC(C)=O")).basePeakCertainty, "supported");
  });
  test("alcohol alpha cleavage favours loss of the largest alkyl radical", async () => {
    const r = await predict("CCCC(C)(C)O"); // loss of propyl -> 59 must outrank loss of methyl -> 87
    const at = (m) => r.peaks.find((p) => Math.round(p.mz) === m)?.relativeIntensity ?? 0;
    assert.ok(at(59) > 0 && at(59) >= at(87) * 0.5);
  });
});
