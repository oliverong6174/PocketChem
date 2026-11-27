// End-to-end route replay tests (Multi-Step route verification).
// Routes are assembled from products the real engine computes, then replayed
// and deliberately corrupted to check what the verifier catches. Nothing here
// runs the (slow) planner search; see scripts/bench for that.
//
// Labels: [confirmed] textbook-level, [heuristic] PocketChem's rule model,
// [engine] verifier bookkeeping.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let utils;
let engine;
let registry;
let split;

before(async () => {
  ({ utils } = await loadEngine());
  engine = await loadModule("/src/utils/reactions/engine/reactionEngine.ts");
  registry = utils.reactionRegistry;
  split = utils.splitReactionComponents;
});

after(async () => {
  await closeEngine();
});

/** One real engine product, shaped like a planner step. */
async function stepFor(ruleId, reactants, pick = (list) => list[0]) {
  const rule = registry.find((item) => item.id === ruleId);
  assert.ok(rule, `unknown rule ${ruleId}`);
  const pathways = await engine.predictReactionPathwaysFromRules(reactants, [], [rule], {
    planning: true,
  });
  const pathway = pick(pathways.filter((item) => item.productSmiles));
  assert.ok(pathway, `${ruleId} produced nothing for ${reactants}`);
  return {
    pathway,
    step: {
      ruleId,
      reactantSmiles: pathway.reactantSmiles,
      reactantComponents: pathway.reactantComponents,
      productSmiles: pathway.productSmiles,
      productComponents: split(pathway.productSmiles),
      productMixture: pathway.productMixture,
    },
  };
}

function routeOf(startingSmiles, targetSmiles, steps) {
  return { id: "test-route", startingSmiles, targetSmiles, steps, confidence: "verified", score: 0 };
}

const verify = (route) => utils.verifyMultistepRoute(route, registry);

describe("replay of valid routes", () => {
  test("[heuristic] acetone -> methyl acetate -> ethanol replays as verified", async () => {
    const one = await stepFor("ketone-baeyer-villiger", "CC(=O)C");
    const two = await stepFor("ester-lah-reduction", "COC(C)=O");
    const result = await verify(routeOf("CC(=O)C", "CCO", [one.step, two.step]));
    assert.equal(result.status, "verified", result.problems.join(" | "));
    assert.equal(result.targetMatch, "exact");
    assert.deepEqual(result.steps.map((s) => s.status), ["verified", "verified"]);
    assert.equal(result.steps[1].reactants[0].origin, "earlier-step");
  });

  test("[engine] a rule's own auto-supplied reagent is not treated as an invented reactant", async () => {
    const { step } = await stepFor("haloalkane-e2-hofmann", "CCBr");
    assert.ok(step.reactantComponents.length >= 1);
    const result = await verify(routeOf("CCBr", "C=C", [step]));
    assert.equal(result.status, "verified", result.problems.join(" | "));
  });

  test("[engine] a starting material the route never uses is reported, not hidden", async () => {
    const { step } = await stepFor("ketone-baeyer-villiger", "CC(=O)C");
    const result = await verify(routeOf("CC(=O)C.CCCC", "COC(C)=O", [step]));
    assert.equal(result.status, "verified");
    assert.deepEqual(result.unusedStartingMaterials, ["CCCC"]);
  });

  test("[confirmed] ester reduction gives ethanol AND methanol: the target is exact, the coproduct is reported", async () => {
    const one = await stepFor("ketone-baeyer-villiger", "CC(=O)C");
    const two = await stepFor("ester-lah-reduction", "COC(C)=O");
    const toEthanol = await verify(routeOf("CC(=O)C", "CCO", [one.step, two.step]));
    assert.equal(toEthanol.targetMatch, "exact");
    assert.deepEqual(toEthanol.coproducts.map((s) => s), ["CO"]);
    // Symmetric: methanol as the target leaves ethanol as the coproduct.
    const toMethanol = await verify(routeOf("CC(=O)C", "CO", [one.step, two.step]));
    assert.deepEqual(toMethanol.coproducts, ["CCO"]);
    // A single-product route reports none.
    assert.deepEqual((await verify(routeOf("CC(=O)C", "COC(C)=O", [one.step]))).coproducts, []);
  });

  test("[engine] a zero-step route is valid only if a supplied material already is the target", async () => {
    assert.equal((await verify(routeOf("CCO.CCC", "CCO", []))).status, "verified");
    assert.equal((await verify(routeOf("CCC", "CCO", []))).status, "failed");
  });
});

describe("routes that must be rejected", () => {
  test("[engine] a structural reactant that was never supplied is detected as invented", async () => {
    // Ester reduction on methyl acetate, but the route only supplies acetone.
    const { step } = await stepFor("ester-lah-reduction", "COC(C)=O");
    const result = await verify(routeOf("CC(=O)C", "CCO", [step]));
    assert.equal(result.status, "failed");
    assert.equal(result.steps[0].reactants[0].origin, "missing");
    assert.match(result.problems.join(" "), /neither a supplied starting material nor a product/);
  });

  test("[engine] a material consumed by an earlier step cannot be reused", async () => {
    const first = await stepFor("ketone-baeyer-villiger", "CC(=O)C");
    // Step 2 claims to react acetone again although step 1 consumed it.
    const second = await stepFor("ketone-baeyer-villiger", "CC(=O)C");
    const result = await verify(routeOf("CC(=O)C", "COC(C)=O", [first.step, second.step]));
    assert.equal(result.status, "failed");
    assert.equal(result.steps[1].reactants[0].origin, "already-consumed");
  });

  test("[engine] a recorded product the rule does not give for the available materials is rejected", async () => {
    const { step } = await stepFor("ketone-baeyer-villiger", "CC(=O)C");
    const forged = { ...step, productSmiles: "CCO", productComponents: ["CCO"] };
    const result = await verify(routeOf("CC(=O)C", "CCO", [forged]));
    assert.equal(result.status, "failed");
    assert.equal(result.steps[0].productMatch, "none");
  });

  test("[engine] a route that does not end at the target is rejected", async () => {
    const { step } = await stepFor("ketone-baeyer-villiger", "CC(=O)C");
    const result = await verify(routeOf("CC(=O)C", "CCCO", [step]));
    assert.equal(result.status, "failed");
    assert.equal(result.targetMatch, "none");
  });

  test("[engine] an unknown rule id fails the replay instead of being skipped", async () => {
    const { step } = await stepFor("ketone-baeyer-villiger", "CC(=O)C");
    const result = await verify(routeOf("CC(=O)C", "COC(C)=O", [{ ...step, ruleId: "no-such-rule" }]));
    assert.equal(result.status, "failed");
    assert.match(result.problems.join(" "), /unknown rule/);
  });

  test("[engine] steps run in order: a later product cannot be consumed by an earlier step", async () => {
    const one = await stepFor("ketone-baeyer-villiger", "CC(=O)C");
    const two = await stepFor("ester-lah-reduction", "COC(C)=O");
    const result = await verify(routeOf("CC(=O)C", "CCO", [two.step, one.step]));
    assert.equal(result.status, "failed");
  });
});

describe("stereochemical distinctions", () => {
  // syn-dihydroxylation of (E)-2-butene gives the racemic (R,R)/(S,S) diol pair.
  const dihydroxylation = () =>
    stepFor("alkene-syn-dihydroxylation", "C/C=C/C");

  test("[confirmed] a racemic product that includes the requested enantiomer is a mixture member, not a pure product", async () => {
    const { pathway, step } = await dihydroxylation();
    assert.equal(pathway.productMixture?.kind, "racemic");
    const member = pathway.productMixture.memberSmiles[0];
    const result = await verify(routeOf("C/C=C/C", member, [step]));
    assert.equal(result.targetMatch, "mixture-member");
    assert.equal(result.status, "connectivity-only", "a racemate must not be reported as stereochemically verified");
    assert.match(result.problems.join(" "), /mixture/);
  });

  test("[confirmed] the meso diastereomer is not a valid target for the trans-alkene racemate", async () => {
    const { step } = await dihydroxylation();
    const result = await verify(routeOf("C/C=C/C", "C[C@H](O)[C@@H](C)O", [step]));
    assert.notEqual(result.status, "verified");
    assert.notEqual(result.targetMatch, "exact");
  });

  test("[engine] a target without stereo is matched exactly by an unspecified product", async () => {
    const { step } = await stepFor("ketone-baeyer-villiger", "CC(=O)C");
    assert.equal((await verify(routeOf("CC(=O)C", "COC(C)=O", [step]))).targetMatch, "exact");
  });
});
