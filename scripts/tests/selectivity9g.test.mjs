// Stage 9G: reaction additions. Isomer distributions: chlorobenzene nitration ~30/1/69.5 (o/m/p), bromobenzene ~36.5/1.2/62.4
// (1954 J. Am. Chem. Soc. study, Caltech-hosted). Claisen/Cope products follow the textbook [3,3] bond reorganisation.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let registry;
let engine;
let stereo;
before(async () => {
  ({ utils: { reactionRegistry: registry } } = await loadEngine());
  engine = await loadModule("/src/utils/reactions/engine/reactionEngine.ts");
  stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
});
after(async () => { await closeEngine(); });

const rule = (id) => registry.find((item) => item.id === id);
const run = (id, reactants) => engine.predictReactionPathwaysFromRules(reactants, [], [rule(id)], { planning: true });
const key = async (smiles) => (await stereo.canonicalizeStereoStructure(smiles)).connectivity;
const levels = async (out) => Object.fromEntries(await Promise.all(out.map(async (p) => [await key(p.productSmiles), p.selectivityAssessment?.level ?? "unranked"])));

describe("halobenzene nitration", () => {
  for (const halide of ["Cl", "Br"]) {
    test(`${halide}benzene: para major, ortho minor, meta not offered`, async () => {
      const got = await levels(await run("aromatic-nitration", `${halide}c1ccccc1`));
      assert.equal(got[await key(`O=[N+]([O-])c1ccc(${halide})cc1`)], "major");
      assert.equal(got[await key(`O=[N+]([O-])c1ccccc1${halide}`)], "minor");
      assert.equal(got[await key(`O=[N+]([O-])c1cccc(${halide})c1`)], undefined);
    });
  }
  test("toluene: ortho and para stay unranked (about 58% ortho, 38% para, so neither is declared major)", async () => {
    const got = await levels(await run("aromatic-nitration", "Cc1ccccc1"));
    assert.deepEqual(Object.values(got), ["unranked", "unranked"]);
  });
});

describe("[3,3]-sigmatropic rearrangements", () => {
  test("allyl phenyl ether gives 2-allylphenol (allyl group on the ortho carbon, terminus attached)", async () => {
    const out = await run("claisen-aromatic-rearrangement", "C=CCOc1ccccc1");
    assert.deepEqual(out.map((p) => p.productSmiles), ["C=CCc1ccccc1O"]);
  });
  test("3-methylhexa-1,5-diene gives hepta-1,5-diene", async () => {
    const out = await run("cope-rearrangement", "C=CC(C)CC=C");
    assert.deepEqual(await Promise.all(out.map((p) => key(p.productSmiles))), [await key("CC=CCCC=C")]);
  });
  test("a molecule without a 1,5-diene is not offered the Cope rearrangement", async () => {
    assert.equal((await run("cope-rearrangement", "CC=CC")).length, 0);
  });
});
