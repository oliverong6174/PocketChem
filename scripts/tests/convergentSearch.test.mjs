// Phase 4 / Stage 3: forward convergent search lane (opt-in).
// Fixtures come from convergentFixtures.mjs, whose every step is replayed against
// the unchanged registry in convergentFixtures.test.mjs. Searches here are
// bounded by explicit budgets, never by "run until it finishes".
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";
import { fixtureById } from "./fixtures/convergentFixtures.mjs";
import { modules } from "./fixtures/convergentHelpers.mjs";

let registry;
let synthesis;

before(async () => {
  ({ registry } = await modules());
  synthesis = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts");
});

after(async () => {
  await closeEngine();
});

const run = (supplied, target, convergentSearch, extra = {}) =>
  synthesis.findConvergentSynthesisRoutes(supplied.join("."), target, registry, {
    convergentSearch,
    ...extra,
  });

const ruleIds = (route) => route.steps.map((step) => step.ruleId).sort();
const expectedRules = (fixture) => fixture.steps.map((step) => step.ruleId).sort();

for (const id of ["fischer-isopropyl-propanoate", "williamson-cyclohexyl-propyl-ether"]) {
  describe(`convergent lane: ${id}`, () => {
    const fixture = fixtureById(id);
    const budget = { maxStateExpansions: 40, maxReactionExecutions: 300, maxDepth: 4, maxWallMs: 60000 };

    test("[engine] finds the independently validated route and it replays as verified", async () => {
      const { routes, stats } = await run(fixture.supplied, fixture.target, budget);
      assert.ok(routes.length >= 1, `no route; stop=${stats.stopReason}`);
      const route = routes[0];
      assert.deepEqual(ruleIds(route), expectedRules(fixture));
      assert.equal(route.verification.status, "verified");
      assert.equal(route.confidence, "verified");
      assert.equal(route.verification.targetMatch, "exact");
      assert.equal(stats.stopReason, "found");
      assert.ok(stats.stateExpansions <= budget.maxStateExpansions);
      assert.ok(stats.reactionExecutions <= budget.maxReactionExecutions);
    });

    test("[engine] the route is convergent: both supplied materials feed the target through a join", async () => {
      const { routes } = await run(fixture.supplied, fixture.target, budget);
      const lineage = routes[0].verification.targetLineage;
      assert.deepEqual(lineage.startingMaterialIndices, [0, 1]);
      assert.ok(routes[0].steps.some((step) => step.reactantComponents.length >= 2));
      assert.deepEqual(lineage.unusedSteps, []);
    });

    test("[engine] inventory: each supplied copy is consumed exactly once", async () => {
      const { routes } = await run(fixture.supplied, fixture.target, budget);
      const { inventory, unusedStartingMaterials } = routes[0].verification;
      assert.deepEqual(unusedStartingMaterials, []);
      for (const entry of inventory) {
        assert.equal(entry.copies, 1);
        assert.equal(entry.consumed, 1);
      }
    });

    test("[engine] result does not depend on the order of the supplied materials", async () => {
      const forward = await run(fixture.supplied, fixture.target, budget);
      const reversed = await run([...fixture.supplied].reverse(), fixture.target, budget);
      assert.deepEqual(ruleIds(reversed.routes[0]), ruleIds(forward.routes[0]));
      assert.equal(reversed.routes[0].verification.status, "verified");
    });

    test("[engine] an irrelevant third material is a spectator and is reported unused", async () => {
      const { routes } = await run([...fixture.supplied, "CCCCCC"], fixture.target, budget);
      assert.ok(routes.length >= 1);
      assert.deepEqual(routes[0].verification.unusedStartingMaterials, ["CCCCCC"]);
      assert.equal(routes[0].verification.inventory[2].consumed, 0);
      assert.deepEqual(ruleIds(routes[0]), expectedRules(fixture));
    });

    test("[engine] coproducts and leftovers are reported, not dropped", async () => {
      const { routes } = await run(fixture.supplied, fixture.target, budget);
      const { leftovers, coproducts } = routes[0].verification;
      const targetLot = routes[0].verification.targetLineage.lotId;
      const others = leftovers.filter((item) => item.lotId !== targetLot).map((item) => item.smiles);
      assert.deepEqual([...others].sort(), [...coproducts].sort());
    });
  });
}

describe("convergent lane: inventory and availability", () => {
  const grignard = fixtureById("grignard-2-butanol-from-ethanol");

  test("[engine] one copy of a material cannot be reused: the two-copy route is not returned", async () => {
    const { routes, stats } = await run(["CCO"], grignard.target, {
      maxStateExpansions: 40,
      maxDepth: 4,
      maxWallMs: 60000,
    });
    assert.deepEqual(routes, []);
    // A single lot can never converge, so the lane declines without searching.
    assert.equal(stats.reactionExecutions, 0);
  });

  test("[engine] two copies of one material support the route that uses it twice", async () => {
    const { routes } = await run(grignard.supplied, grignard.target, {
      startingMaterialCopies: [2],
      maxStateExpansions: 120,
      maxReactionExecutions: 600,
      maxDepth: 4,
      maxWallMs: 90000,
    });
    assert.ok(routes.length >= 1);
    assert.equal(routes[0].verification.inventory[0].copies, 2);
    assert.equal(routes[0].verification.inventory[0].consumed, 2);
    assert.notEqual(routes[0].verification.status, "failed");
  });

  test("[engine] a coupling that needs a structural reactant nobody supplied is rejected", async () => {
    // Isopropanol and hexane are supplied, but the ester needs propanoic acid
    // (or its precursors), which is not available and is never invented.
    const { routes, stats } = await run(["CC(C)O", "CCCCCC"], "CCC(=O)OC(C)C", {
      maxStateExpansions: 15,
      maxReactionExecutions: 120,
      maxDepth: 3,
      maxWallMs: 30000,
    });
    assert.deepEqual(routes, []);
    assert.notEqual(stats.stopReason, "found");
  });
});

describe("convergent lane: stereochemistry and honesty of labels", () => {
  test("[heuristic] a racemic intermediate yields a connectivity-level label, never 'verified'", async () => {
    const fixture = fixtureById("racemic-diol-coupling");
    const { routes } = await run(fixture.supplied, fixture.target, {
      maxStateExpansions: 20,
      maxDepth: 3,
      maxWallMs: 60000,
    });
    assert.ok(routes.length >= 1);
    assert.equal(routes[0].verification.status, "connectivity-only");
    assert.equal(routes[0].confidence, "connectivity-verified");
  });

  test("[engine] every returned route carries a replay and none has a failed status", async () => {
    const fixture = fixtureById("fischer-isopropyl-propanoate");
    const { routes } = await run(fixture.supplied, fixture.target, { maxStateExpansions: 40, maxDepth: 4 });
    for (const route of routes) {
      assert.ok(route.verification);
      assert.notEqual(route.verification.status, "failed");
    }
  });
});

describe("convergent lane: budgets, cancellation, opt-in", () => {
  const fischer = fixtureById("fischer-isopropyl-propanoate");

  test("[engine] an exhausted execution budget stops the search and returns nothing unproven", async () => {
    const { routes, stats } = await run(fischer.supplied, fischer.target, {
      maxReactionExecutions: 3,
      maxWallMs: 60000,
    });
    assert.deepEqual(routes, []);
    assert.equal(stats.stopReason, "execution-budget");
    assert.ok(stats.reactionExecutions <= 3);
  });

  test("[engine] an exhausted expansion budget stops the search", async () => {
    const { routes, stats } = await run(fischer.supplied, fischer.target, {
      maxStateExpansions: 1,
      maxWallMs: 60000,
    });
    assert.deepEqual(routes, []);
    assert.equal(stats.stopReason, "expansion-budget");
    assert.equal(stats.stateExpansions, 1);
  });

  test("[engine] the depth budget bounds the steps considered", async () => {
    const { routes, stats } = await run(fischer.supplied, fischer.target, {
      maxDepth: 2,
      maxStateExpansions: 40,
      maxWallMs: 60000,
    });
    // The route needs three steps: depth 2 cannot reach it.
    assert.deepEqual(routes, []);
    assert.ok(stats.maxDepthReached <= 2);
  });

  test("[engine] an already-aborted signal returns immediately with a cancelled stop", async () => {
    const controller = new AbortController();
    controller.abort();
    const { routes, stats } = await run(fischer.supplied, fischer.target, {}, { signal: controller.signal });
    assert.deepEqual(routes, []);
    assert.equal(stats.stopReason, "cancelled");
    assert.equal(stats.reactionExecutions, 0);
  });

  test("[engine] a deadline in the past stops the search before any reaction runs", async () => {
    const { routes, stats } = await run(fischer.supplied, fischer.target, { deadline: Date.now() - 1 });
    assert.deepEqual(routes, []);
    assert.equal(stats.stopReason, "time-budget");
    assert.equal(stats.reactionExecutions, 0);
  });

  test("[engine] the lane is opt-in: without the option the public search never calls it", async () => {
    // acetone -> ethanol is single-input; with the lane enabled it must decline at
    // once (nothing to join) and the linear result must be identical to the default.
    const started = Date.now();
    const plain = await synthesis.findMultistepSynthesisRoutesFromRules("CC(C)=O", "CCO", registry, {
      preferFirstVerifiedRoute: true,
      searchEffort: "normal",
    });
    const plainMs = Date.now() - started;
    const withLane = await synthesis.findMultistepSynthesisRoutesFromRules("CC(C)=O", "CCO", registry, {
      preferFirstVerifiedRoute: true,
      searchEffort: "normal",
      convergentSearch: true,
    });
    assert.ok(plain.length >= 1);
    assert.deepEqual(
      withLane.map((route) => route.steps.map((step) => step.ruleId)),
      plain.map((route) => route.steps.map((step) => step.ruleId)),
    );
    assert.deepEqual(plain[0].steps.map((step) => step.ruleId), ["ketone-baeyer-villiger", "ester-lah-reduction"]);
    assert.ok(plainMs < 15000, `acetone -> ethanol took ${plainMs} ms (limit 15000)`);
  });

  test("[engine] through the public entry point, convergentSearch returns the verified convergent route", async () => {
    const routes = await synthesis.findMultistepSynthesisRoutesFromRules(
      fischer.supplied.join("."),
      fischer.target,
      registry,
      { convergentSearch: { maxStateExpansions: 40, maxDepth: 4, maxWallMs: 60000 } },
    );
    assert.deepEqual(ruleIds(routes[0]), expectedRules(fischer));
    assert.equal(routes[0].verification.status, "verified");
  });
});
