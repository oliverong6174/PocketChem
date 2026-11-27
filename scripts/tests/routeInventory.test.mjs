// Phase 4 / Stage 1: route verification with starting-material copies,
// provenance and independent branches. Routes are assembled from real engine
// output (see fixtures/); no planner search runs here.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine } from "./engine.mjs";
import { FIXTURES, fixtureById } from "./fixtures/convergentFixtures.mjs";
import { modules, pathwayGiving, routeFromFixture, stepFromPathway } from "./fixtures/convergentHelpers.mjs";

let utils;
let registry;

before(async () => {
  ({ utils, registry } = await modules());
});

after(async () => {
  await closeEngine();
});

const verify = (route, options) => utils.verifyMultistepRoute(route, registry, options);
const withStart = (route, startingSmiles) => ({ ...route, startingSmiles });

async function step(ruleId, reactants, product, extra) {
  const pathway = await pathwayGiving(ruleId, reactants, product);
  assert.ok(pathway, `${ruleId} does not give ${product}`);
  return stepFromPathway(pathway, extra);
}

describe("convergent routes replay with independent branches", () => {
  test("[engine] Fischer fixture: two independent branches join in the last step", async () => {
    const route = await routeFromFixture(fixtureById("fischer-isopropyl-propanoate"));
    const result = await verify(route);
    assert.equal(result.status, "verified", result.problems.join(" | "));
    assert.equal(result.targetMatch, "exact");
    assert.deepEqual(
      result.stepDependencies.map((item) => item.dependsOnSteps),
      [[], [], [1, 2]],
    );
    const lineage = result.targetLineage;
    assert.deepEqual(lineage.contributingSteps, [1, 2, 3]);
    assert.deepEqual(lineage.unusedSteps, []);
    assert.deepEqual(lineage.startingMaterialIndices, [0, 1]);
    // Two steps in a row on any one branch, not three: the route is convergent.
    assert.equal(lineage.longestLinearSequence, 2);
  });

  test("[engine] the supplied order of the starting materials does not matter", async () => {
    const fixture = fixtureById("fischer-isopropyl-propanoate");
    const route = await routeFromFixture(fixture);
    for (const order of [[0, 1], [1, 0]]) {
      const start = order.map((i) => fixture.supplied[i]).join(".");
      const result = await verify(withStart(route, start));
      assert.equal(result.status, "verified", `${start}: ${result.problems.join(" | ")}`);
      assert.deepEqual(result.targetLineage.startingMaterialIndices, [0, 1]);
    }
  });

  test("[engine] Williamson fixture verifies and reports every supplied material consumed once", async () => {
    const result = await verify(await routeFromFixture(fixtureById("williamson-cyclohexyl-propyl-ether")));
    assert.equal(result.status, "verified", result.problems.join(" | "));
    assert.deepEqual(result.unusedStartingMaterials, []);
    assert.deepEqual(result.inventory.map((item) => [item.copies, item.consumed]), [[1, 1], [1, 1]]);
  });

  test("[engine] a side branch that never feeds the target is reported as unused, and its product as a leftover", async () => {
    const fixture = fixtureById("fischer-isopropyl-propanoate");
    const route = await routeFromFixture(fixture);
    const side = await step("ketone-reduction", ["O=C1CCCCC1"], ["OC1CCCCC1"]);
    const extended = withStart({ ...route, steps: [...route.steps, side] }, `${route.startingSmiles}.O=C1CCCCC1`);
    const result = await verify(extended);
    assert.equal(result.status, "verified", result.problems.join(" | "));
    assert.deepEqual(result.targetLineage.unusedSteps, [4]);
    assert.deepEqual(result.targetLineage.contributingSteps, [1, 2, 3]);
    assert.deepEqual(result.coproducts, ["OC1CCCCC1"]);
    // The target lot (step 3) and the side-branch product (step 4) are both still on the shelf.
    assert.deepEqual(result.leftovers.map((item) => item.producedByStep).sort(), [3, 4]);
  });
});

describe("starting-material copies", () => {
  const fixture = fixtureById("grignard-2-butanol-from-ethanol");

  test("[engine] with one copy, using ethanol twice is rejected and says how many copies exist", async () => {
    const route = await routeFromFixture(fixture);
    const result = await verify(route); // default: one copy per supplied component
    assert.equal(result.status, "failed");
    const problem = result.problems.join(" ");
    assert.match(problem, /already consumed by step 1/);
    assert.match(problem, /only 1 copy supplied/);
    assert.equal(result.steps[1].reactants[0].origin, "already-consumed");
  });

  test("[engine] with two copies the same route verifies and both lots are accounted for", async () => {
    const route = await routeFromFixture(fixture);
    const result = await verify(route, { startingMaterialCopies: 2 });
    assert.equal(result.status, "verified", result.problems.join(" | "));
    assert.equal(result.targetMatch, "exact");
    assert.deepEqual(result.inventory[0].lotIds, ["sm0#1", "sm0#2"]);
    assert.deepEqual(result.inventory[0].consumedByStep, [1, 2]);
    assert.equal(result.inventory[0].consumed, 2);
    // Both copies descend from supplied component 0; the coupling joins branches.
    assert.deepEqual(result.targetLineage.startingMaterialIndices, [0]);
    assert.deepEqual(result.targetLineage.contributingSteps, [1, 2, 3, 4]);
    assert.equal(result.targetLineage.longestLinearSequence, 3);
  });

  test("[engine] supplying the same material twice in the starting SMILES is equivalent to two copies", async () => {
    const route = await routeFromFixture(fixture);
    const result = await verify(withStart(route, "CCO.CCO"));
    assert.equal(result.status, "verified", result.problems.join(" | "));
  });

  test("[engine] a per-component copy array is indexed by component order", async () => {
    const fischer = await routeFromFixture(fixtureById("fischer-isopropyl-propanoate"));
    const result = await verify(fischer, { startingMaterialCopies: [1, 3] });
    assert.deepEqual(result.inventory.map((item) => item.copies), [1, 3]);
    assert.deepEqual(result.unusedStartingMaterials, ["CCC=O", "CCC=O"].slice(0, 2));
  });

  test("[engine] a third use of a twice-supplied material is rejected", async () => {
    const one = await step("ketone-reduction", ["CC(C)=O"], ["CC(C)O"]);
    const route = { id: "r", startingSmiles: "CC(C)=O", targetSmiles: "CC(C)O", steps: [one, one, one], confidence: "verified", score: 0 };
    assert.equal((await verify(route, { startingMaterialCopies: 3 })).status, "verified");
    const short = await verify(route, { startingMaterialCopies: 2 });
    assert.equal(short.status, "failed");
    assert.equal(short.steps[2].reactants[0].origin, "already-consumed");
  });

  test("[engine] nonsense copy counts fall back to one copy", async () => {
    const route = await routeFromFixture(fixtureById("fischer-isopropyl-propanoate"));
    for (const copies of [0, -2, 1.5, Number.NaN, [0, 0]]) {
      const result = await verify(route, { startingMaterialCopies: copies });
      assert.deepEqual(result.inventory.map((item) => item.copies), [1, 1]);
    }
  });
});

describe("routes that must be rejected", () => {
  test("[engine] an intermediate that no step produced is invented", async () => {
    const route = await routeFromFixture(fixtureById("fischer-isopropyl-propanoate"));
    // Drop the propanal oxidation: propanoic acid never exists.
    const broken = { ...route, steps: [route.steps[1], route.steps[2]] };
    const result = await verify(broken);
    assert.equal(result.status, "failed");
    const coupling = result.steps[1];
    assert.equal(coupling.reactants.find((item) => item.smiles === "CCC(=O)O").origin, "missing");
    assert.match(result.problems.join(" "), /neither a supplied starting material nor a product/);
  });

  test("[engine] a coupling cannot run before one of its branches exists", async () => {
    const route = await routeFromFixture(fixtureById("fischer-isopropyl-propanoate"));
    const reordered = { ...route, steps: [route.steps[2], route.steps[0], route.steps[1]] };
    assert.equal((await verify(reordered)).status, "failed");
  });

  test("[engine] a forged coupling product is rejected even though both reactants exist", async () => {
    const route = await routeFromFixture(fixtureById("fischer-isopropyl-propanoate"));
    const forged = { ...route.steps[2], productSmiles: "CCC(=O)OCC", productComponents: ["CCC(=O)OCC"] };
    const result = await verify({ ...route, steps: [route.steps[0], route.steps[1], forged] });
    assert.equal(result.status, "failed");
    assert.equal(result.steps[2].productMatch, "none");
  });

  test("[engine] a missing coupling partner is not made up from a supplied material of another kind", async () => {
    const route = await routeFromFixture(fixtureById("williamson-cyclohexyl-propyl-ether"));
    // Supply a different halide; the recorded 1-bromopropane branch has no source.
    const result = await verify(withStart(route, "O=C1CCCCC1.C=CCC"));
    assert.equal(result.status, "failed");
  });
});

describe("lot provenance (reactantLotIds)", () => {
  const fixture = fixtureById("grignard-2-butanol-from-ethanol");

  test("[engine] named lots are consumed exactly as named", async () => {
    const route = await routeFromFixture(fixture);
    const named = route.steps.map((item, index) => ({
      ...item,
      reactantLotIds:
        index === 0 ? ["sm0#2"] : index === 1 ? ["sm0#1"] : index === 2 ? ["s2.1"] : ["s1.1", "s3.1"],
    }));
    const result = await verify({ ...route, steps: named }, { startingMaterialCopies: 2 });
    assert.equal(result.status, "verified", result.problems.join(" | "));
    assert.deepEqual(result.inventory[0].consumedByStep, [2, 1]);
    assert.deepEqual(result.steps[0].reactants[0].lotId, "sm0#2");
  });

  test("[engine] naming a lot that an earlier step consumed is rejected", async () => {
    const route = await routeFromFixture(fixture);
    const named = route.steps.map((item, index) => ({
      ...item,
      reactantLotIds: index === 0 || index === 1 ? ["sm0#1"] : index === 2 ? ["s2.1"] : ["s1.1", "s3.1"],
    }));
    const result = await verify({ ...route, steps: named }, { startingMaterialCopies: 2 });
    assert.equal(result.status, "failed");
    assert.equal(result.steps[1].reactants[0].origin, "already-consumed");
    assert.match(result.problems.join(" "), /names lot sm0#1/);
  });

  test("[engine] naming a lot with the wrong structure or a lot that does not exist is rejected", async () => {
    const route = await routeFromFixture(fixture);
    // Step 2 (ethanol -> bromide) names the acetaldehyde lot from step 1; s9.9 never exists.
    for (const [lot, pattern] of [["s1.1", /but that lot is/], ["s9.9", /does not exist/]]) {
      const named = route.steps.map((item, index) => (index === 1 ? { ...item, reactantLotIds: [lot] } : item));
      const result = await verify({ ...route, steps: named }, { startingMaterialCopies: 2 });
      assert.equal(result.status, "failed", lot);
      assert.match(result.problems.join(" "), pattern);
    }
  });

  test("[engine] two lots with one structure but different histories stay distinguishable", async () => {
    // 2-Propanol is supplied AND produced from acetone. Which one the esterification
    // consumes decides what is left over and where it came from.
    const reduce = await step("ketone-reduction", ["CC(C)=O"], ["CC(C)O"]);
    const ester = await step("fischer-esterification", ["CC(C)O", "CCC(=O)O"], ["CCC(=O)OC(C)C"]);
    const base = { id: "r", startingSmiles: "CC(C)O.CC(C)=O.CCC(=O)O", targetSmiles: "CCC(=O)OC(C)C", confidence: "verified", score: 0 };

    // Consumes the supplied 2-propanol (sm0#1); the produced one (s1.1) remains.
    const useSupplied = await verify({
      ...base,
      steps: [reduce, { ...ester, reactantLotIds: ["sm0#1", "sm2#1"] }],
    });
    assert.equal(useSupplied.status, "verified", useSupplied.problems.join(" | "));
    const produced = useSupplied.leftovers.find((item) => item.smiles === "CC(C)O");
    assert.equal(produced.origin, "earlier-step");
    assert.deepEqual(produced.lineage, [1]);
    assert.deepEqual(useSupplied.targetLineage.contributingSteps, [2]);

    // Consumes the produced 2-propanol (s1.1); the supplied one remains untouched.
    const useProduced = await verify({
      ...base,
      steps: [reduce, { ...ester, reactantLotIds: ["s1.1", "sm2#1"] }],
    });
    assert.equal(useProduced.status, "verified", useProduced.problems.join(" | "));
    assert.deepEqual(useProduced.unusedStartingMaterials, ["CC(C)O"]);
    assert.deepEqual(useProduced.targetLineage.contributingSteps, [1, 2]);
    assert.deepEqual(useProduced.targetLineage.startingMaterialIndices, [1, 2]);
  });
});

describe("stereochemical and mixture classification is preserved", () => {
  test("[confirmed] a racemic intermediate coupled onward keeps its mixture marker: the target is a member, not a pure product", async () => {
    const route = await routeFromFixture(fixtureById("racemic-diol-coupling"));
    const result = await verify(route);
    assert.equal(result.targetMatch, "mixture-member");
    assert.equal(result.status, "connectivity-only");
    assert.ok(result.leftovers.every((item) => item.origin === "earlier-step" ? item.fromMixture : true));
    assert.deepEqual(result.targetLineage.startingMaterialIndices, [0, 1]);
    assert.match(result.problems.join(" "), /mixture/);
  });

  test("[engine] a pure coupling product is not marked as a mixture", async () => {
    const route = await routeFromFixture(fixtureById("fischer-isopropyl-propanoate"));
    const result = await verify(route);
    assert.ok(result.leftovers.every((item) => item.fromMixture === false));
  });

  test("[engine] the wrong enantiomeric family is not a verified target of the racemic coupling", async () => {
    const route = await routeFromFixture(fixtureById("racemic-diol-coupling"));
    const meso = await verify({ ...route, targetSmiles: "CC(=O)O[C@H](C)[C@H](C)O" });
    assert.notEqual(meso.status, "verified");
  });
});

describe("coproducts and leftovers carry provenance", () => {
  test("[confirmed] ester reduction: the target is exact and the other alcohol is a leftover with lineage", async () => {
    const route = await routeFromFixture(fixtureById("ester-reduction-coproduct"));
    const result = await verify(route);
    assert.equal(result.status, "verified", result.problems.join(" | "));
    assert.deepEqual(result.coproducts, ["CC(C)O"]);
    assert.deepEqual(result.leftovers.map((item) => [item.smiles, item.producedByStep, item.lineage]), [
      ["CC(C)O", 1, [0]],
      ["CCCO", 1, [0]],
    ]);
  });

  test("[engine] every fixture route replays; the Grignard one only with two copies", async () => {
    for (const fixture of FIXTURES) {
      const route = await routeFromFixture(fixture);
      const copies = fixture.copies;
      const result = await verify(route, { startingMaterialCopies: copies });
      assert.notEqual(result.status, "failed", `${fixture.id}: ${result.problems.join(" | ")}`);
      assert.ok(result.targetMatch !== "none", fixture.id);
    }
  });

  test("[engine] results without options keep the pre-existing fields intact", async () => {
    const route = await routeFromFixture(fixtureById("ester-reduction-coproduct"));
    const result = await verify(route);
    for (const key of ["status", "steps", "targetMatch", "unusedStartingMaterials", "coproducts", "problems"]) {
      assert.ok(key in result, key);
    }
  });
});
