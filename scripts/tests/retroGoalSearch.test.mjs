// Phase 4 / Stage 4: retrosynthetic goal-set search matched against forward pool
// states (opt-in `bidirectional`). Fixtures come from convergentFixtures.mjs, whose
// every step is replayed against the unchanged registry. Every search here is
// bounded by explicit budgets.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";
import { fixtureById } from "./fixtures/convergentFixtures.mjs";
import { modules } from "./fixtures/convergentHelpers.mjs";

let registry;
let synthesis;
let retroModule;
let stereo;

before(async () => {
  ({ registry } = await modules());
  synthesis = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts");
  retroModule = await loadModule("/src/utils/reactions/engine/retroGoalSearch.ts");
  stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
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

// A forward budget far too small for the forward-only lane (it needs about 40
// expansions on these fixtures without help) but enough once the retro goal sets
// say which species to aim for.
const TINY = { maxStateExpansions: 3, maxReactionExecutions: 600, maxDepth: 4, maxWallMs: 60000 };
const BI = { ...TINY, bidirectional: true };

for (const id of ["fischer-isopropyl-propanoate", "williamson-cyclohexyl-propyl-ether"]) {
  describe(`bidirectional: ${id}`, () => {
    const fixture = fixtureById(id);
    let forwardOnly;
    let both;
    let reversed;

    before(async () => {
      forwardOnly = await run(fixture.supplied, fixture.target, TINY);
      both = await run(fixture.supplied, fixture.target, BI);
      reversed = await run([...fixture.supplied].reverse(), fixture.target, BI);
    });

    test("[engine] forward-only search fails at this budget, bidirectional finds the verified route", () => {
      assert.deepEqual(forwardOnly.routes, []);
      assert.equal(forwardOnly.stats.retro, null);
      assert.ok(both.routes.length >= 1, `no route; stop=${both.stats.stopReason}`);
      assert.equal(both.stats.stopReason, "found");
      assert.equal(both.routes[0].verification.status, "verified");
      assert.equal(both.routes[0].verification.targetMatch, "exact");
      assert.equal(both.routes[0].confidence, "verified");
      assert.deepEqual(ruleIds(both.routes[0]), expectedRules(fixture));
    });

    test("[engine] the route came from matching a retro goal set, and the work is reported", () => {
      const retro = both.stats.retro;
      assert.ok(retro, "bidirectional stats missing");
      assert.ok(retro.engineCalls >= 1 && retro.statesFound >= 1);
      assert.ok(retro.meetingsAttempted >= 1);
      assert.ok(retro.chainsCompleted >= 1);
      assert.ok(both.stats.stateExpansions <= TINY.maxStateExpansions);
      assert.ok(both.stats.reactionExecutions <= TINY.maxReactionExecutions);
    });

    test("[engine] both precursor branches execute independently and jointly consume the inventory", () => {
      const route = both.routes[0];
      const { targetLineage, inventory, unusedStartingMaterials } = route.verification;
      assert.deepEqual(targetLineage.startingMaterialIndices, [0, 1]);
      assert.deepEqual(targetLineage.unusedSteps, []);
      assert.deepEqual(unusedStartingMaterials, []);
      for (const entry of inventory) {
        assert.equal(entry.copies, 1);
        assert.equal(entry.consumed, 1);
      }
      // Topological order: the coupling step is last and consumes two earlier products.
      const last = route.steps[route.steps.length - 1];
      assert.equal(last.reactantComponents.length, 2);
      assert.deepEqual(
        route.steps.slice(0, -1).map((step) => step.stepNumber),
        [1, 2],
      );
    });

    test("[engine] the result does not depend on the order of the supplied materials", () => {
      assert.ok(reversed.routes.length >= 1);
      assert.deepEqual(ruleIds(reversed.routes[0]), ruleIds(both.routes[0]));
      assert.equal(reversed.routes[0].verification.status, "verified");
    });
  });
}

describe("bidirectional: rejection of unsupported routes", () => {
  const fischer = fixtureById("fischer-isopropyl-propanoate");

  test("[engine] an unresolved precursor goal is never invented: no supplied route to the acid half", async () => {
    // Acetone gives the alcohol half, but nothing supplied leads to propanoic acid.
    const { routes, stats } = await run(["CC(C)=O", "CCCCCC"], fischer.target, {
      maxStateExpansions: 6,
      maxReactionExecutions: 200,
      maxDepth: 3,
      maxWallMs: 60000,
      bidirectional: { maxRetroCalls: 3 },
    });
    assert.deepEqual(routes, []);
    assert.notEqual(stats.stopReason, "found");
    assert.equal(stats.retro.chainsCompleted, 0);
  });

  test("[engine] a structurally valid join that needs a second copy nobody supplied is rejected", async () => {
    // Two lots exist (ethanol + hexane) so the lane runs, but the Grignard route
    // needs ethanol twice. One copy must never be reused.
    const grignard = fixtureById("grignard-2-butanol-from-ethanol");
    const { routes, stats } = await run(["CCO", "CCCCCC"], grignard.target, {
      maxStateExpansions: 6,
      maxReactionExecutions: 300,
      maxDepth: 4,
      maxWallMs: 60000,
      bidirectional: { maxRetroCalls: 3 },
    });
    assert.deepEqual(routes, []);
    assert.notEqual(stats.stopReason, "found");
  });

  test("[heuristic] a racemic intermediate stays connectivity-level under bidirectional search", async () => {
    const fixture = fixtureById("racemic-diol-coupling");
    const { routes } = await run(fixture.supplied, fixture.target, {
      maxStateExpansions: 6,
      maxDepth: 3,
      maxWallMs: 60000,
      bidirectional: { maxRetroCalls: 3 },
    });
    assert.ok(routes.length >= 1);
    assert.equal(routes[0].verification.status, "connectivity-only");
    assert.equal(routes[0].confidence, "connectivity-verified");
    for (const route of routes) assert.notEqual(route.verification.status, "failed");
  });
});

describe("retro goal sets: structure of the proposals", () => {
  const fischer = fixtureById("fischer-isopropyl-propanoate");

  async function collect() {
    const structureOf = async (smiles) => {
      const value = await stereo.canonicalizeStereoStructure(smiles);
      return value
        ? {
            smiles,
            canonical: value.isomeric,
            connectivity: value.connectivity,
            hasSpecifiedStereo: value.hasSpecifiedStereo,
          }
        : null;
    };
    const target = await structureOf(fischer.target);
    const supplied = [];
    for (const smiles of fischer.supplied) supplied.push({ ...(await structureOf(smiles)), copies: 1 });
    const search = retroModule.createRetroSearch({
      target,
      rules: registry,
      supplied,
      structureOf,
      presetsFor: () => new Set(),
      allowGeneric: false,
      limits: { maxRetroExpansions: 4, maxRetroCalls: 3, maxRetroDepth: 3, maxResultsPerGoal: 40, maxGoals: 4 },
      haltReason: () => null,
    });
    const reached = new Set(supplied.map((item) => item.canonical));
    while ((await search.step(reached)) !== null) {
      /* run until a budget stops it */
    }
    return { search, target };
  }

  test("[engine] goal sets are multisets with several goals, no cycles, and consistent dependencies", async () => {
    const { search, target } = await collect();
    assert.ok(search.states.some((state) => state.goals.length >= 2), "expected a multi-goal state");
    for (const state of search.states) {
      const ids = state.goals.map((goal) => goal.id);
      assert.equal(new Set(ids).size, ids.length, "goal ids must be unique");
      for (const goal of state.goals) {
        assert.ok(!goal.ancestors.includes(goal.canonical), `cycle at ${goal.canonical}`);
        assert.notEqual(goal.canonical, target.canonical);
      }
      // Dependencies: each step's consumed goals are either still open goals or
      // produced by a LATER disconnection (which therefore replays earlier).
      state.disconnections.forEach((step, at) => {
        const laterProduces = new Set(state.disconnections.slice(at + 1).map((item) => item.producesGoalId));
        for (const id of step.consumesGoalIds) {
          assert.ok(
            state.goals.some((goal) => goal.id === id) || laterProduces.has(id),
            `dangling dependency ${id} in ${step.ruleId}`,
          );
        }
        assert.ok(registry.some((rule) => rule.id === step.ruleId), `unknown rule ${step.ruleId}`);
      });
    }
  });

  test("[engine] the retro search stops with an accurate reason when its call budget is spent", async () => {
    const { search } = await collect();
    assert.ok(["call-budget", "expansion-budget", "exhausted"].includes(search.stats.stopReason));
    assert.ok(search.stats.engineCalls <= 3);
    assert.ok(search.stats.expansions <= 4);
  });
});

describe("bidirectional: budgets, cancellation, opt-in", () => {
  const fischer = fixtureById("fischer-isopropyl-propanoate");
  const noRoute = ["CC(C)=O", "CCCCCC"];

  test("[engine] default search is unchanged: no retro work without the option", async () => {
    const { stats } = await run(fischer.supplied, fischer.target, { maxStateExpansions: 40, maxDepth: 4 });
    assert.equal(stats.retro, null);
  });

  test("[engine] a small retro call budget stops the retro side and reports it, returning nothing unproven", async () => {
    const { routes, stats } = await run(noRoute, fischer.target, {
      maxStateExpansions: 40,
      maxReactionExecutions: 300,
      maxDepth: 3,
      maxWallMs: 60000,
      bidirectional: { maxRetroCalls: 1 },
    });
    assert.deepEqual(routes, []);
    assert.ok(stats.retro.engineCalls <= 1);
    assert.equal(stats.retro.stopReason, "call-budget");
    assert.notEqual(stats.stopReason, "found");
  });

  test("[engine] an exhausted retro expansion budget is reported as such", async () => {
    const { routes, stats } = await run(noRoute, fischer.target, {
      maxStateExpansions: 2,
      maxWallMs: 60000,
      bidirectional: { maxRetroExpansions: 1 },
    });
    assert.deepEqual(routes, []);
    assert.ok(stats.retro.expansions <= 1);
    assert.equal(stats.stopReason, "expansion-budget");
  });

  test("[engine] an already-aborted signal does no retro or forward work", async () => {
    const controller = new AbortController();
    controller.abort();
    const { routes, stats } = await run(fischer.supplied, fischer.target, BI, { signal: controller.signal });
    assert.deepEqual(routes, []);
    assert.equal(stats.stopReason, "cancelled");
    assert.equal(stats.reactionExecutions, 0);
    assert.equal(stats.retro?.engineCalls ?? 0, 0);
  });

  test("[engine] a deadline in the past stops before any engine work", async () => {
    const { routes, stats } = await run(fischer.supplied, fischer.target, { ...BI, deadline: Date.now() - 1 });
    assert.deepEqual(routes, []);
    assert.equal(stats.stopReason, "time-budget");
    assert.equal(stats.reactionExecutions, 0);
    assert.equal(stats.retro?.engineCalls ?? 0, 0);
  });

  test("[engine] cancellation in the middle of a search stops it promptly", async () => {
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 700);
    const { routes, stats } = await run(
      noRoute,
      fischer.target,
      { maxStateExpansions: 60, maxReactionExecutions: 600, maxWallMs: 60000, bidirectional: true },
      { signal: controller.signal },
    );
    assert.deepEqual(routes, []);
    assert.equal(stats.stopReason, "cancelled");
    assert.ok(Date.now() - started < 15000, "abort was not honoured promptly");
  });

  test("[engine] through the public entry point, bidirectional returns the verified convergent route", async () => {
    const routes = await synthesis.findMultistepSynthesisRoutesFromRules(
      fischer.supplied.join("."),
      fischer.target,
      registry,
      { convergentSearch: { ...BI } },
    );
    assert.deepEqual(ruleIds(routes[0]), expectedRules(fischer));
    assert.equal(routes[0].verification.status, "verified");
  });
});
