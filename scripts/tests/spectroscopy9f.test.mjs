// Stage 9F: 1H/13C NMR environment handling for substituted benzenes and fused rings. Expectations come from the symmetry of the structure (how many
// distinct ring-proton environments exist) and from textbook trends (nitro deshields the ortho protons above 8 ppm; ortho/para protons of phenols
// and anilines sit upfield of meta). Counts are of predicted signals; exchangeable O-H/N-H signals are included.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let nmr;
before(async () => {
  await loadEngine();
  nmr = await loadModule("/src/utils/spectroscopy/nmrPrediction.ts");
});
after(async () => { await closeEngine(); });

const predict = (smiles) => nmr.predictStructureNMR(smiles);
const aromaticH = (r) => r.protonNMR.filter((s) => (s.shiftCenter ?? 0) > 6.4 && (s.shiftCenter ?? 0) < 8.8 && /aromatic|ring/i.test(s.sourceGroup ?? "aromatic"));

describe("strongly perturbed monosubstituted rings show separate ortho / meta / para signals", () => {
  for (const [smiles, total, ringSignals] of [
    ["Oc1ccccc1", 4, 3],            // OH + o, m, p
    ["Nc1ccccc1", 4, 3],
    ["COc1ccccc1", 4, 3],            // OCH3 + o, m, p
    ["O=[N+]([O-])c1ccccc1", 3, 3],
    ["COC(=O)c1ccccc1", 4, 3],       // OCH3 + o, m, p
  ]) test(`${smiles}: ${total} proton signals`, async () => {
    const r = await predict(smiles);
    assert.equal(r.protonNMR.length, total);
    assert.equal(aromaticH(r).length, ringSignals);
  });
});

describe("weakly perturbed rings stay one overlapping multiplet (negative controls)", () => {
  for (const [smiles, total] of [["Cc1ccccc1", 2], ["CCc1ccccc1", 3], ["Clc1ccccc1", 1], ["CC(C)c1ccccc1", 3]]) {
    test(`${smiles}: ${total} proton signals`, async () => {
      const r = await predict(smiles);
      assert.equal(r.protonNMR.length, total);
    });
  }
});

describe("symmetry-equivalent rings share signals", () => {
  test("benzophenone: ortho (4H), meta (4H), para (2H) = 3 signals; 5 carbon signals", async () => {
    const r = await predict("O=C(c1ccccc1)c1ccccc1");
    assert.deepEqual(r.protonNMR.map((s) => s.protonCount).sort(), [2, 4, 4]);
    assert.equal(r.carbonNMR.length, 5);
  });
  test("biphenyl: 3 proton and 4 carbon signals", async () => {
    const r = await predict("c1ccc(cc1)-c1ccccc1");
    assert.equal(r.protonNMR.length, 3);
    assert.equal(r.carbonNMR.length, 4);
  });
  test("naphthalene is aromatic in both rings (no 'vinylic' protons): 2 proton and 3 carbon signals", async () => {
    const r = await predict("c1ccc2ccccc2c1");
    assert.equal(r.protonNMR.length, 2);
    assert.equal(r.carbonNMR.length, 3);
    assert.ok(r.protonNMR.every((s) => (s.shiftCenter ?? 0) > 6.4), "no ring proton is placed in the alkene region");
  });
});

describe("nitro is a withdrawing substituent, not an amine-type donor", () => {
  test("nitrobenzene: ortho protons above 8 ppm, para/meta below them; ipso carbon near 148", async () => {
    const r = await predict("O=[N+]([O-])c1ccccc1");
    const centers = r.protonNMR.map((s) => s.shiftCenter).sort((a, b) => b - a);
    assert.ok(centers[0] >= 8.0, `ortho ${centers[0]}`);
    assert.ok(centers[1] < centers[0] && centers[2] < centers[0]);
    const carbons = r.carbonNMR.map((s) => s.shiftCenter).sort((a, b) => b - a);
    assert.ok(carbons[0] > 145 && carbons[0] < 152, `ipso ${carbons[0]}`);
  });
  test("aniline keeps donor behaviour: ortho/para upfield of meta", async () => {
    const r = await predict("Nc1ccccc1");
    const ring = r.protonNMR.filter((s) => (s.shiftCenter ?? 0) > 6 && (s.shiftCenter ?? 0) < 8);
    const meta = ring.find((s) => s.protonCount === 2 && (s.shiftCenter ?? 0) > 7);
    assert.ok(meta, "meta (2H) is the most downfield ring signal");
  });
});
