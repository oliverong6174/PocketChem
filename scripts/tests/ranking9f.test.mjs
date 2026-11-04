// Stage 9F: boiling-point ranking separates isomers and molecules the coarse score ties. Order from experimental boiling points that are
// textbook facts: n-butanol 117.7 > sec-butanol 99.5 > tert-butanol 82.4 degC; ethyl acetate 77 > methyl formate 32 degC; octane > heptane.
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

async function ranks(mode, smilesList) {
  const molecules = [];
  for (let i = 0; i < smilesList.length; i += 1) {
    const hierarchy = await groups.analyzeFunctionalGroupHierarchy(smilesList[i]);
    molecules.push({ id: i, profile: await analysis.analyzeComparisonMolecule(smilesList[i], hierarchy) });
  }
  const { rankById } = display.deriveRanking(molecules, mode);
  return smilesList.map((_, i) => rankById.get(i));
}

describe("boiling point ranking", () => {
  test("n-butanol > sec-butanol > tert-butanol (compactness breaks the tie)", async () => {
    const [n, s, t] = await ranks("boilingPoint", ["CCCCO", "CCC(C)O", "CC(C)(C)O"]);
    assert.ok(n < s && s < t, `ranks ${n} ${s} ${t}`);
  });
  test("ethyl acetate > methyl formate (molecular mass breaks the tie)", async () => {
    const [ea, mf] = await ranks("boilingPoint", ["CCOC(C)=O", "COC=O"]);
    assert.ok(ea < mf);
  });
  test("negative control: unrelated molecules keep the qualitative order (an alcohol outranks an alkane of lower mass)", async () => {
    const [ol, ane] = await ranks("boilingPoint", ["CCCCO", "CCCC"]);
    assert.ok(ol < ane);
  });
  test("identical skeletons still tie", async () => {
    const [a, b] = await ranks("boilingPoint", ["CCCCO", "OCCCC"]);
    assert.equal(a, b);
  });
});
