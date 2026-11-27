// Stage 9F: boiling-point ranking separates isomers and molecules the coarse score ties. Order from experimental boiling points that are
// textbook facts: n-butanol 117.7 > sec-butanol 99.5 > tert-butanol 82.4 degC; pentane 36.1 > isopentane 27.8 > neopentane 9.5 degC; pentane > butane (-0.5 degC).
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
  test("pentane > butane (same qualitative score; molecular mass breaks the tie)", async () => {
    const [pentane, butane] = await ranks("boilingPoint", ["CCCCC", "CCCC"]);
    assert.ok(pentane < butane);
  });
  test("pentane > isopentane > neopentane (compactness)", async () => {
    const [n, i, neo] = await ranks("boilingPoint", ["CCCCC", "CCC(C)C", "CC(C)(C)C"]);
    assert.ok(n < i && i < neo, `ranks ${n} ${i} ${neo}`);
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
