// Runs the project's existing in-source chemistry regression suites unchanged.
// Failures that already existed before the Phase 1 work are listed explicitly
// (and verified against the unmodified tree) so that any NEW failure fails the run.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine } from "./engine.mjs";

// id -> reason. Baseline-verified failing on the unmodified `main` tree.
const PREEXISTING_FAILURES = new Map([
  [
    "DA-dimethyl-diene-acrylate-three-dashes",
    "Diels-Alder stereo-depiction expects 0 wedge / 3 dash but the renderer yields 2 / 1 (fails identically on main)",
  ],
]);

let modules;
before(async () => {
  modules = await loadEngine();
});
after(async () => {
  await closeEngine();
});

function registerSuite(name, getResults) {
  describe(name, () => {
    test("suite executes and returns results", async () => {
      const results = await getResults();
      assert.ok(Array.isArray(results) && results.length > 0);
    });

    test("no new failures beyond the documented baseline", async () => {
      const results = await getResults();
      const unexpected = results.filter((r) => !r.passed && !PREEXISTING_FAILURES.has(r.id));
      assert.deepEqual(
        unexpected.map((r) => `${r.id}: ${r.message}`),
        [],
      );
    });

    test("documented pre-existing failures (tracked, not hidden)", { todo: true }, async () => {
      const results = await getResults();
      const failing = results.filter((r) => !r.passed && PREEXISTING_FAILURES.has(r.id));
      assert.equal(failing.length, 0, failing.map((r) => `${r.id}: ${PREEXISTING_FAILURES.get(r.id)}`).join("\n"));
    });
  });
}

const cache = new Map();
function once(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

registerSuite("runReactionRegressionSuite", () =>
  once("reaction", () => modules.regression.runReactionRegressionSuite()),
);
registerSuite("runMechanisticStereoRegressionSuite", () =>
  once("stereo", () => modules.stereoRegression.runMechanisticStereoRegressionSuite()),
);
