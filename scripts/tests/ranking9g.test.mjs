// Stage 9G: compound-ranking corrections. Reference values are textbook/PubChem experimental data or the published Joback-Reid constants.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let analysis;
let display;
let groups;
before(async () => {
  await loadEngine();
  analysis = await loadModule("/src/utils/ranking/comparisonAnalysis.ts");
  display = await loadModule("/src/utils/ranking/rankingDisplay.ts");
  groups = await loadModule("/src/utils/functionalGroups/index.ts");
});
after(async () => { await closeEngine(); });

async function profileOf(smiles) {
  const hierarchy = await groups.analyzeFunctionalGroupHierarchy(smiles);
  return analysis.analyzeComparisonMolecule(smiles, hierarchy);
}
async function ranks(mode, smilesList) {
  const molecules = [];
  for (let i = 0; i < smilesList.length; i += 1) molecules.push({ id: i, profile: await profileOf(smilesList[i]) });
  const { rankById } = display.deriveRanking(molecules, mode);
  return smilesList.map((_, i) => rankById.get(i));
}

describe("Joback boiling-point estimate", () => {
  test("group sums reproduce the hand-calculated Joback values", async () => {
    const expected = { CCCO: 360.22, CC_C_O: 321.91, CCOCC: 313.34, CCCCCC: 336.68, "CC(=O)O": 390.67, CCOC_C_O: 349.14 };
    const cases = { CCCO: "CCCO", CC_C_O: "CC(C)=O", CCOCC: "CCOCC", CCCCCC: "CCCCCC", "CC(=O)O": "CC(=O)O", CCOC_C_O: "CCOC(C)=O" };
    for (const [key, smiles] of Object.entries(cases)) {
      const m = (await profileOf(smiles)).metrics.boilingPoint;
      assert.ok(Math.abs(m.score - expected[key]) < 0.01, `${smiles}: ${m.score}`);
    }
  });
  test("1-propanol > hexane > acetone > diethyl ether (experimental 97.2, 68.7, 56, 34.6 degC)", async () => {
    const r = await ranks("boilingPoint", ["CCCO", "CCCCCC", "CC(C)=O", "CCOCC"]);
    assert.deepEqual(r, [1, 2, 3, 4]);
  });
  test("cis-2-butene > trans-2-butene > butane (3.7, 0.9, -0.5 degC)", async () => {
    const r = await ranks("boilingPoint", ["C/C=C" + String.fromCharCode(92) + "C", "C/C=C/C", "CCCC"]);
    assert.deepEqual(r, [1, 2, 3]);
  });
  test("amides are not ranked (the method has no amide group and underestimates them badly)", async () => {
    const m = (await profileOf("CC(N)=O")).metrics.boilingPoint;
    assert.equal(m.score, null);
    assert.match(m.detail, /amide/);
  });
});

describe("Hammett sigma-p substituent strength (Hansch, Leo & Taft 1991)", () => {
  test("EWG order nitrobenzene (0.78) > benzonitrile (0.66) > acetophenone (0.50) > chlorobenzene (0.23) > toluene (none)", async () => {
    const r = await ranks("ewgStrength", ["O=[N+]([O-])c1ccccc1", "N#Cc1ccccc1", "CC(=O)c1ccccc1", "Clc1ccccc1"]);
    assert.deepEqual(r, [1, 2, 3, 4]);
  });
  test("EDG order dimethylaniline (-0.83) > aniline (-0.66) > anisole (-0.27) > toluene (-0.17)", async () => {
    const r = await ranks("edgStrength", ["CN(C)c1ccccc1", "Nc1ccccc1", "COc1ccccc1", "Cc1ccccc1"]);
    assert.deepEqual(r, [1, 2, 3, 4]);
  });
  test("a molecule with no tabulated donor is unranked, not given a zero", async () => {
    const m = (await profileOf("O=[N+]([O-])c1ccccc1")).metrics.edgStrength;
    assert.equal(m.score, null);
  });
});
