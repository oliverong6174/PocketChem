// Stage 9J: ring-count consistency guard now counts heterocycle stems and no longer treats "diamino" as a ring multiplier.
// Found by strict re-scoring of the exposed Stage 9H nicotine case: "3-1,4-diaminobutylpyridine" was shown with High confidence.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let groups;
let nom;
before(async () => {
  await loadEngine();
  groups = await loadModule("/src/utils/functionalGroups/index.ts");
  nom = await loadModule("/src/utils/nomenclatureUtils.ts");
});
after(async () => { await closeEngine(); });

const nameOf = async (smiles) => {
  const h = await groups.analyzeFunctionalGroupHierarchy(smiles);
  const n = (await nom.analyzeNomenclatureAndProperties(smiles, h.primaryGroups, h.mainGroup)).nomenclature;
  return { name: n.displayName || n.estimatedName, status: n.namingStatus };
};

describe("two-ring molecules named with a single ring stem are withheld", () => {
  for (const smiles of ["CN1CCCC1c1cccnc1", "C1CCNC1c1cccnc1"]) {
    test(`${smiles} abstains instead of a chain name`, async () => {
      const r = await nameOf(smiles);
      assert.equal(r.status, "unsupported", r.name);
    });
  }
});

describe("negative controls: correct single-ring and multiplied names are kept", () => {
  const keep = [
    ["c1ccncc1", "pyridine"],
    ["CN1CCCC1", "1-methylpyrrolidine"],
    ["Cc1ccc(C)nc1", "2,5-dimethylpyridine"],
    ["NCCCCN", "butane-1,4-diamine"],
    ["C1CCC(CC1)C1CCCCC1", null], // dicyclohexyl was unsupported before and must not become a wrong name
  ];
  for (const [smiles, expected] of keep) {
    test(`${smiles}`, async () => {
      const r = await nameOf(smiles);
      if (expected) assert.match(r.name, new RegExp(expected.replace(/[-,]/g, "[-,]")));
      else assert.notEqual(r.status, "systematic", r.name);
    });
  }
});
