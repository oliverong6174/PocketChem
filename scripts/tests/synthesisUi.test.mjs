// Phase 4 / Stage 5: UI-facing search options, inventory, branch presentation and
// best-so-far routes. The React page itself is not rendered here; everything it
// decides is in pure modules (searchOptionsFromUi.ts, routePresentation.ts) that
// these tests exercise against the real engine.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";
import { fixtureById } from "./fixtures/convergentFixtures.mjs";
import { modules } from "./fixtures/convergentHelpers.mjs";

let registry;
let synthesis;
let ui;
let presentation;

before(async () => {
  ({ registry } = await modules());
  synthesis = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts");
  ui = await loadModule("/src/utils/reactions/engine/searchOptionsFromUi.ts");
  presentation = await loadModule("/src/utils/reactions/engine/routePresentation.ts");
});

after(async () => {
  await closeEngine();
});

const NORMAL_HARD = 15000;
const DEEP_HARD = 45000;
const OFF = { convergent: false, bidirectional: false, copies: 1 };
const ON = { convergent: true, bidirectional: false, copies: 1 };

// The page's Deep limit keeps these lane runs independent of machine speed.
const laneOnly = (supplied, target, settings, extra = {}, onRouteFound) => {
  const options = ui.buildSynthesisSearchOptions("deep", DEEP_HARD, settings, { onRouteFound });
  options.convergentSearch = { ...options.convergentSearch, ...extra };
  return synthesis.findConvergentSynthesisRoutes(supplied.join("."), target, registry, options);
};

describe("UI options: defaults are the ordinary search", () => {
  test("[engine] with advanced search off, options match the previous Normal and Deep settings", () => {
    const normal = ui.buildSynthesisSearchOptions("normal", NORMAL_HARD, OFF);
    assert.deepEqual(
      { ...normal, signal: undefined, onRouteFound: undefined },
      {
        beamWidth: 10, branchLimit: 18, maxSteps: 7, maxRoutes: 1, preferFirstVerifiedRoute: true,
        searchEffort: "normal", signal: undefined, onRouteFound: undefined,
      },
    );
    assert.equal(normal.convergentSearch, undefined);
    const deep = ui.buildSynthesisSearchOptions("deep", DEEP_HARD, OFF);
    assert.equal(deep.beamWidth, 16);
    assert.equal(deep.branchLimit, 32);
    assert.equal(deep.maxSteps, 9);
    assert.equal(deep.convergentSearch, undefined);
  });

  test("[engine] advanced settings map to engine options and stay inside the hard limit", () => {
    const two = ui.buildSynthesisSearchOptions("normal", NORMAL_HARD, { convergent: true, bidirectional: true, copies: 2 });
    assert.equal(two.convergentSearch.startingMaterialCopies, 2);
    assert.equal(two.convergentSearch.bidirectional, true);
    assert.ok(two.convergentSearch.maxWallMs < NORMAL_HARD);
    const one = ui.buildSynthesisSearchOptions("deep", DEEP_HARD, ON);
    assert.equal(one.convergentSearch.startingMaterialCopies, 1);
    assert.equal(one.convergentSearch.bidirectional, false);
    // Bidirectional and copies mean nothing without the convergent switch.
    const gated = ui.buildSynthesisSearchOptions("normal", NORMAL_HARD, { convergent: false, bidirectional: true, copies: 2 });
    assert.equal(gated.convergentSearch, undefined);
  });
});

for (const id of ["fischer-isopropyl-propanoate", "williamson-cyclohexyl-propyl-ether"]) {
  describe(`UI options request the ${id} convergent route`, () => {
    const fixture = fixtureById(id);
    let result;
    before(async () => {
      result = await laneOnly(fixture.supplied, fixture.target, ON);
    });

    test("[engine] verified convergent route found with the UI-facing options", () => {
      assert.ok(result.routes.length >= 1, `stop=${result.stats.stopReason}`);
      assert.equal(result.routes[0].verification.status, "verified");
      assert.deepEqual(
        result.routes[0].steps.map((step) => step.ruleId).sort(),
        fixture.steps.map((step) => step.ruleId).sort(),
      );
    });

    test("[engine] branch structure and final product are represented from replay metadata", () => {
      const route = result.routes[0];
      const structure = presentation.describeRouteStructure(route);
      assert.equal(structure.kind, "convergent");
      assert.equal(structure.joins.length, 1);
      const join = structure.joins[0];
      assert.equal(join.step, route.steps.length);
      assert.deepEqual(join.branches.map((branch) => branch.steps.length), [1, 1]);
      assert.deepEqual(join.branches.map((branch) => branch.startingMaterials.join()).sort(), ["0", "1"]);
      assert.deepEqual(structure.unusedSteps, []);
      assert.equal(structure.stepInputs[join.step].filter((text) => text.startsWith("product of step")).length, 2);
      assert.ok(structure.stepInputs[1].every((text) => text.startsWith("supplied starting material")));
      assert.equal(route.verification.targetMatch, "exact");
      assert.equal(route.steps[route.steps.length - 1].productSmiles, fixture.target);
    });
  });
}

describe("UI options: inventory copies", () => {
  const grignard = fixtureById("grignard-2-butanol-from-ethanol");

  test("[engine] one copy rejects the route that needs ethanol twice", async () => {
    const { routes, stats } = await laneOnly(grignard.supplied, grignard.target, ON, { maxStateExpansions: 20 });
    assert.deepEqual(routes, []);
    assert.notEqual(stats.stopReason, "found");
  });

  test("[engine] an explicit two-copy inventory permits the route when budgets allow", async () => {
    const { routes } = await laneOnly(
      grignard.supplied,
      grignard.target,
      { ...ON, copies: 2 },
      { maxStateExpansions: 120, maxReactionExecutions: 600 },
    );
    assert.ok(routes.length >= 1);
    const inventory = routes[0].verification.inventory;
    assert.equal(inventory[0].copies, 2);
    assert.equal(inventory[0].consumed, 2);
    assert.notEqual(routes[0].verification.status, "failed");
    const structure = presentation.describeRouteStructure(routes[0]);
    assert.equal(structure.kind, "convergent");
  });
});

describe("best-so-far routes", () => {
  const fischer = fixtureById("fischer-isopropyl-propanoate");

  test("[engine] a verified route reported before a forced stop stays accessible", async () => {
    const controller = new AbortController();
    const collector = ui.createRouteCollector(() => true, controller.signal);
    const options = ui.buildSynthesisSearchOptions("deep", DEEP_HARD, ON, {
      signal: controller.signal,
      onRouteFound: (route) => {
        collector.onRouteFound(route);
        controller.abort(); // the time limit fires right after the route is verified
      },
    });
    options.convergentSearch = { ...options.convergentSearch };
    await synthesis.findConvergentSynthesisRoutes(fischer.supplied.join("."), fischer.target, registry, options);
    assert.equal(collector.routes.length, 1);
    assert.notEqual(collector.routes[0].verification.status, "failed");
    assert.equal(collector.routes[0].verification.targetMatch, "exact");
  });

  test("[engine] only routes that passed replay are reported, and a throwing callback does not break the search", async () => {
    const seen = [];
    const { routes } = await laneOnly(fischer.supplied, fischer.target, ON, {}, (route) => {
      seen.push(route);
      throw new Error("callback failure");
    });
    assert.ok(routes.length >= 1);
    assert.ok(seen.length >= 1);
    for (const route of seen) assert.ok(route.verification && route.verification.status !== "failed");
  });

  test("[engine] a superseded or cancelled run cannot add routes to the current results", () => {
    const controller = new AbortController();
    let current = true;
    const collector = ui.createRouteCollector(() => current, controller.signal, 2);
    const route = (id, status = "verified") => ({ id, verification: { status } });
    collector.onRouteFound(route("a"));
    collector.onRouteFound(route("a")); // duplicate
    collector.onRouteFound(route("b", "failed")); // never accepted
    collector.onRouteFound(route("c"));
    collector.onRouteFound(route("d")); // over the cap
    assert.deepEqual(collector.routes.map((item) => item.id), ["a", "c"]);
    current = false; // a newer search started
    collector.onRouteFound(route("e"));
    controller.abort();
    assert.equal(collector.routes.length, 2);
    const aborted = ui.createRouteCollector(() => true, controller.signal);
    aborted.onRouteFound(route("x"));
    assert.deepEqual(aborted.routes, []);
  });

  test("[engine] a kept route's confidence label follows its replay, not the planner's label", () => {
    const collector = ui.createRouteCollector(() => true, new AbortController().signal);
    collector.onRouteFound({ id: "m", confidence: "verified", verification: { status: "connectivity-only" } });
    collector.onRouteFound({ id: "v", confidence: "connectivity-verified", verification: { status: "verified" } });
    assert.deepEqual(collector.routes.map((item) => item.confidence), ["connectivity-verified", "verified"]);
  });

  test("[engine] a search that ends without a route reports a budget stop, not a reaction failure", async () => {
    const { routes, stats } = await laneOnly(["CC(C)=O", "CCCCCC"], fischer.target, ON, { maxStateExpansions: 2 });
    assert.deepEqual(routes, []);
    assert.equal(stats.stopReason, "expansion-budget");
  });
});

describe("route structure: nothing is invented", () => {
  test("[engine] a route without replay metadata is 'unknown' and shows no inputs or branches", () => {
    const structure = presentation.describeRouteStructure({ id: "r", steps: [], verification: undefined });
    assert.equal(structure.kind, "unknown");
    assert.deepEqual(structure.joins, []);
    assert.deepEqual(structure.stepInputs, {});
  });

  test("[engine] a linear chain of dependencies is linear, with no join", () => {
    const route = {
      id: "r",
      steps: [],
      verification: {
        steps: [
          { stepNumber: 1, reactants: [{ origin: "starting-material", lineage: [0], lotId: "sm0#1" }] },
          { stepNumber: 2, reactants: [{ origin: "earlier-step", lotId: "s1.1", lineage: [0] }] },
        ],
        stepDependencies: [
          { stepNumber: 1, consumedLotIds: ["sm0#1"], producedLotIds: ["s1.1"], dependsOnSteps: [] },
          { stepNumber: 2, consumedLotIds: ["s1.1"], producedLotIds: ["s2.1"], dependsOnSteps: [1] },
        ],
        targetLineage: { unusedSteps: [] },
      },
    };
    const structure = presentation.describeRouteStructure(route);
    assert.equal(structure.kind, "linear");
    assert.deepEqual(structure.joins, []);
  });

  test("[engine] branches that share an ancestor are not presented as independent", () => {
    const route = {
      id: "r",
      steps: [],
      verification: {
        steps: [],
        stepDependencies: [
          { stepNumber: 1, consumedLotIds: [], producedLotIds: ["a"], dependsOnSteps: [] },
          { stepNumber: 2, consumedLotIds: ["a"], producedLotIds: ["b"], dependsOnSteps: [1] },
          { stepNumber: 3, consumedLotIds: ["a"], producedLotIds: ["c"], dependsOnSteps: [1] },
          { stepNumber: 4, consumedLotIds: ["b", "c"], producedLotIds: ["d"], dependsOnSteps: [2, 3] },
        ],
      },
    };
    assert.equal(presentation.describeRouteStructure(route).kind, "linear");
  });
});
