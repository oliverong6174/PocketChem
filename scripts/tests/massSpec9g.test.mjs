// Stage 9G mass spectrometry: the base peak is a qualitative EI prediction, not a calibrated intensity.
// Reference base peaks: NIST WebBook EI spectra (aniline 93, phenol 94, anisole 108, benzonitrile 103, isopropyl bromide 43, toluene 91).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let ms;
let groups;
before(async () => {
  await loadEngine();
  ms = await loadModule("/src/utils/spectroscopy/massSpec.ts");
  groups = await loadModule("/src/utils/functionalGroups/index.ts");
});
after(async () => { await closeEngine(); });

async function basePeak(smiles, formula, exactMass) {
  const hierarchy = await groups.analyzeFunctionalGroupHierarchy(smiles);
  const result = await ms.predictMassSpectrum(formula, exactMass, hierarchy.functionalGroups, smiles);
  return Math.round(result.basePeakMz);
}

describe("stable aromatic molecular ion", () => {
  for (const [smiles, formula, mz] of [["Nc1ccccc1", "C6H7N", 93], ["Oc1ccccc1", "C6H6O", 94], ["COc1ccccc1", "C7H8O", 108], ["N#Cc1ccccc1", "C7H5N", 103], ["Clc1ccccc1", "C6H5Cl", 112]]) {
    test(`${smiles} has its molecular ion as the base peak (m/z ${mz})`, async () => {
      assert.equal(await basePeak(smiles, formula, null), mz);
    });
  }
  test("toluene is excluded: the benzylic/tropylium ion m/z 91 stays the base peak", async () => {
    assert.equal(await basePeak("Cc1ccccc1", "C7H8", null), 91);
  });
});

describe("secondary alkyl bromide", () => {
  test("isopropyl bromide: loss of Br gives the isopropyl cation, m/z 43", async () => {
    assert.equal(await basePeak("CC(C)Br", "C3H7Br", null), 43);
  });
});
