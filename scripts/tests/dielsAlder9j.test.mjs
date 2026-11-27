// Stage 9J: Diels-Alder endo rule in the stereo representative. The relative configuration is checked from the SMILES parity, independent of
// wedge/hash counts or drawing projection. Parity rule (verified on 1,2-dimethylcyclohexane in this file): for ring atoms written
// "[C@H](branch)" in a ring path, equal symbols mean the branches are on the same face; an atom that closes the ring before its branch flips it.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, getRdkit, loadEngine, loadModule } from "./engine.mjs";

let rdkit;
let da;
let de;
before(async () => {
  await loadEngine();
  rdkit = await getRdkit();
  da = await loadModule("/src/utils/stereochemistry/dielsAlderMechanism.ts");
  de = await loadModule("/src/utils/stereochemistry/depictionEngine.ts");
});
after(async () => { await closeEngine(); });

const raw = (s) => rdkit.get_mol(s);
const canon = (s) => { const m = rdkit.get_mol(s); try { return m.get_smiles(); } finally { m.delete(); } };
const mirror = (s) => canon(s.replace(/@@/g, "#").replace(/@/g, "@@").replace(/#/g, "@"));
const sameCompound = (a, b) => canon(a) === canon(b) || canon(a) === mirror(b);

function complete(diene, dienophile, activated) {
  const gen = da.generateMechanisticDielsAlderCandidates(rdkit, raw, diene, dienophile);
  const directive = {
    kind: "diels-alder", ruleId: "t", reactantSmiles: [diene, dienophile], representativeFace: "back", relationship: "syn", referenceIds: ["openstax-da-14.4"],
    dielsAlder: { dieneTerminalRelationship: null, dienophileGeometry: null, activatedDienophile: activated,
      preferredRegioRelationship: gen.regio.preferredRelationship, dieneDirectorPosition: gen.regio.dieneDirectorPosition, regioConfidence: gen.regio.confidence, regioReason: gen.regio.reason },
  };
  return de.completeStereoRepresentative(raw, gen.products[0], directive);
}

describe("parity rule sanity", () => {
  test("cis-1,2-dimethylcyclohexane (same symbols, second atom closes the ring first) is meso; the other is chiral", () => {
    assert.equal(canon("C1CCC[C@H](C)[C@@H]1C"), mirror("C1CCC[C@H](C)[C@@H]1C"));
    assert.notEqual(canon("C1CCC[C@H](C)[C@H]1C"), mirror("C1CCC[C@H](C)[C@H]1C"));
  });
});

describe("activated dienophile adds endo: substituents all on one face", () => {
  test("(E,E)-hexa-2,4-diene + methyl acrylate gives the all-cis adduct", () => {
    const completed = complete("C/C=C/C=C/C", "C=CC(=O)OC", true);
    assert.ok(completed);
    assert.ok(sameCompound(completed, "C1[C@H](C)C=C[C@H](C)[C@@H]1C(=O)OC"), completed);
  });
  test("the exo diastereomer (ester trans to both methyls) is NOT what the engine returns", () => {
    const completed = complete("C/C=C/C=C/C", "C=CC(=O)OC", true);
    assert.ok(!sameCompound(completed, "C1[C@@H](C)C=C[C@@H](C)[C@@H]1C(=O)OC"), completed);
  });
  test("negative control: an unactivated dienophile (propene) keeps the previous projection (methyl trans to the diene methyls)", () => {
    const completed = complete("C/C=C/C=C/C", "C=CC", false);
    assert.ok(completed);
    assert.ok(!sameCompound(completed, "C1[C@H](C)C=C[C@H](C)[C@@H]1C"), completed);
  });
});
