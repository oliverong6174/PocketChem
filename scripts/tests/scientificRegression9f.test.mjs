// Stage 9F: the four in-source regression suites were never part of `npm test`. They are gated here. A suite may only fail on the ids listed as KNOWN
// (defects that existed when the gate was added and are documented in the Stage 9F report); a new failure fails the build, and so does a known failure
// that starts passing (remove it from the list when that happens, so the gate does not go stale).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let engine;
before(async () => { engine = await loadEngine(); });
after(async () => { await closeEngine(); });

const failedIds = (results) => results.filter((r) => r.passed === false || r.ok === false).map((r) => r.id ?? r.name).sort();

describe("in-source scientific regression suites", () => {
  test("reaction regression suite passes completely", async () => {
    const results = await engine.regression.runReactionRegressionSuite();
    assert.ok(results.length >= 5);
    assert.deepEqual(failedIds(results), []);
  });

  test("IR regression suite passes completely", async () => {
    const ir = await loadModule("/src/utils/spectroscopy/irRegression.ts");
    const results = ir.runIrRegressionSuite();
    assert.ok(results.length >= 20);
    assert.deepEqual(failedIds(results), []);
  });

  test("mechanistic stereo regression suite: only the documented depiction defect fails", async () => {
    const results = await engine.stereoRegression.runMechanisticStereoRegressionSuite();
    assert.ok(results.length >= 10);
    // Known: the Diels-Alder drawing of the dimethyl-diene/acrylate adduct uses 2 wedges + 1 dash where the suite expects 3 dashes (depiction only).
    assert.deepEqual(failedIds(results), ["DA-dimethyl-diene-acrylate-three-dashes"]);
  });

  test("nomenclature regression suite: only the documented defects fail", async () => {
    const nomenclature = await loadModule("/src/utils/nomenclature/index.ts");
    const suite = await nomenclature.runNomenclatureRegressionSuite();
    assert.ok(suite.total >= 59);
    const failed = suite.failures.map((f) => f.id).sort();
    // Known: cytosine, thymine and uracil (lactam tautomer SMILES are not matched by the retained pyrimidine templates; the name is now withheld
    // instead of being a garbled chain name), aspirin (the acetyl-oxy substituent is read as "ethoxy"), ethanamine (the suite expects the retained
    // spelling, PocketChem writes the equally valid ethan-1-amine).
    assert.deepEqual(failed, [
      "aspirin-structure-common-name",
      "cytosine-retained-pyrimidine",
      "ethanamine",
      "thymine-retained-pyrimidine",
      "uracil-retained-pyrimidine",
    ]);
  });
});
