// Stage 9J: the beta-halo carbonyl check now also covers strong-base haloalkane rules (hydroxide, alkoxide, bulky base), found by the frozen
// Stage 9J validation set (F06). Negative controls guard against flagging ordinary haloalkanes.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";
import { modules, pathwayGiving } from "./fixtures/convergentHelpers.mjs";

let registry;
let quality;
let planner;
before(async () => {
  ({ registry } = await modules());
  quality = await loadModule("/src/utils/reactions/engine/routeQuality.ts");
  planner = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts");
});
after(async () => { await closeEngine(); });

async function qualityOf(ruleId, reactants, product) {
  const pathway = await pathwayGiving(ruleId, reactants, [product]);
  assert.ok(pathway, `${ruleId} must give ${product}`);
  const step = { ...planner.forwardStepFromPathway(pathway), stepNumber: 1 };
  const route = { id: "t", startingSmiles: reactants.join("."), targetSmiles: product, steps: [step], confidence: "verified", score: 0,
    verification: { status: "verified", steps: [], targetMatch: "exact", unusedStartingMaterials: [], coproducts: [], problems: [] } };
  return quality.assessRouteQuality(route, registry);
}
const codes = (q) => q.findings.map((f) => f.code);

describe("beta-halo carbonyl under a strong-base haloalkane rule", () => {
  test("4-chlorobutan-2-one + hydroxide is flagged (E1cB competes)", async () => {
    const q = await qualityOf("haloalkane-sn2-hydroxide", ["CC(=O)CCCl", "[OH-]"], "CC(=O)CCO");
    assert.ok(codes(q).includes("base-beta-halo-carbonyl"));
    assert.equal(q.tier, "known-concern");
  });
  test("negative control: 1-bromobutane + hydroxide is not flagged for this reason", async () => {
    const q = await qualityOf("haloalkane-sn2-hydroxide", ["CCCCBr", "[OH-]"], "CCCCO");
    assert.ok(!codes(q).includes("base-beta-halo-carbonyl"));
  });
  test("negative control: a weakly basic nucleophile (cyanide) on the beta-halo ketone is not flagged by this check", async () => {
    const pathway = await pathwayGiving("haloalkane-sn2-cyanide", ["CC(=O)CCCl", "[C-]#N"], ["CC(=O)CCC#N"]);
    if (!pathway) return; // the rule may not offer it; nothing to assert
    const q = await qualityOf("haloalkane-sn2-cyanide", ["CC(=O)CCCl", "[C-]#N"], "CC(=O)CCC#N");
    assert.ok(!codes(q).includes("base-beta-halo-carbonyl"));
  });
});
