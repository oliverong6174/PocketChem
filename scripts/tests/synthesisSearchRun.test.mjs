// Phase 4 / Stage 8A-4: the single-button search as the page uses it.
//
// The React page is not rendered here (the project has no DOM test setup). Everything the page
// decides about a search run lives in SearchRunController, which is tested with scripted fake
// runners; the page's wiring is checked against its source text, and one trivial real search
// runs end to end through the real scheduler.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let run;
let registry;

before(async () => {
  run = await loadModule("/src/utils/reactions/engine/synthesisSearchRun.ts");
  ({ reactionRegistry: registry } = await loadModule("/src/utils/reactionUtils.ts"));
});

after(async () => {
  await closeEngine();
});

// ---- helpers -------------------------------------------------------------------------

let ids = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tick = () => new Promise((resolve) => setImmediate(resolve));

function makeRoute(status = "verified", extra = {}) {
  const n = ids++;
  return {
    id: `route-${n}`,
    startingSmiles: "A.B",
    targetSmiles: "T",
    confidence: "verified",
    score: 0,
    steps: extra.steps ?? [{ stepNumber: 1, ruleId: `r${n}`, reagentLabel: "x", reactantComponents: ["A"], productComponents: ["T"] }],
    verification: {
      status,
      steps: [],
      targetMatch: status === "verified" ? "exact" : "connectivity",
      unusedStartingMaterials: [],
      coproducts: [],
      problems: [],
    },
    compatibility: extra.compatibility,
  };
}

const ranked = (...routes) => routes.map((route, index) => ({ route, tier: route.verification.status === "verified" ? 0 : 2, order: index + 1, lane: "linear" }));

function result(routes, verdict, stopReason, copies = 1) {
  return { routes: ranked(...routes), verdict, stopReason, lanes: [], elapsedMs: 1, overrunMs: 0, copies, lateOffers: 0 };
}

/** A runner the test drives by hand. */
function manualRunner() {
  const calls = [];
  const runner = (args) =>
    new Promise((resolve, reject) => {
      calls.push({ args, resolve, reject });
    });
  return { runner, calls };
}

function controllerWith(runner, extra = {}) {
  return new run.SearchRunController({ rules: [], runner, ...extra });
}

const START = { startingSmiles: "A.B", targetSmiles: "T" };

// ---- single-button search and inventory ------------------------------------------------

describe("single search: invocation and inventory", () => {
  test("[unit] one start() runs the scheduler once, with the 45 s limit and one copy by default", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner);
    const done = controller.start(START);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args.totalMs, 45000);
    assert.equal(calls[0].args.copies, 1);
    assert.equal(controller.getState().copies, 1);
    assert.equal(controller.getState().phase, "running");
    calls[0].resolve(result([], "no-route-within-bounds", "lanes-complete"));
    await done;
    assert.equal(calls.length, 1, "no second search, no automatic escalation");
  });

  test("[unit] two copies are passed through only when the user chose them, unchanged", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner);
    const done = controller.start({ ...START, copies: 2 });
    assert.equal(calls[0].args.copies, 2);
    assert.equal(controller.getState().copies, 2);
    calls[0].resolve(result([], "no-route-within-bounds", "lanes-complete", 2));
    await done;
    assert.equal(controller.getState().copies, 2);
    const again = controller.start({ ...START, copies: undefined });
    assert.equal(calls[1].args.copies, 1, "the next search starts again from the default");
    calls[1].resolve(result([], "no-route-within-bounds", "lanes-complete"));
    await again;
  });

  test("[unit] the controller passes the supplied structures and rules to the runner unchanged", async () => {
    const { runner, calls } = manualRunner();
    const rules = [{ id: "x" }];
    const controller = new run.SearchRunController({ rules, runner });
    const done = controller.start({ startingSmiles: "CC(C)=O.CCC=O", targetSmiles: "CCC(=O)OC(C)C" });
    assert.equal(calls[0].args.startingSmiles, "CC(C)=O.CCC=O");
    assert.equal(calls[0].args.targetSmiles, "CCC(=O)OC(C)C");
    assert.equal(calls[0].args.rules, rules);
    calls[0].resolve(result([], "no-route-within-bounds", "lanes-complete"));
    await done;
  });
});

// ---- progress and route display ----------------------------------------------------------

describe("progress and route display", () => {
  test("[unit] a verified route is in the state the moment it is reported, before the search ends", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner);
    const seen = [];
    controller.subscribe((state) => seen.push([state.phase, state.routes.length]));
    const done = controller.start(START);
    const route = makeRoute();
    calls[0].args.onRoutes(ranked(route));
    assert.equal(controller.getState().phase, "running");
    assert.equal(controller.getState().routes.length, 1);
    assert.equal(controller.getState().firstRouteAfterMs !== null, true);
    calls[0].resolve(result([route], "routes-found", "satisfied"));
    await done;
    assert.deepEqual(seen.find(([, count]) => count === 1), ["running", 1]);
    assert.equal(controller.getState().outcome.kind, "found");
  });

  test("[unit] progress is monotonic, the stage label is shown, and engine progress is forwarded", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner);
    const forwarded = [];
    const percents = [];
    controller.subscribe((state) => percents.push(state.percent));
    const done = controller.start(START, (laneId, progress) => forwarded.push([laneId, progress.depth]));
    const { args } = calls[0];
    args.onPlan(2);
    args.onStage({ laneId: "convergent", label: "Convergent and bidirectional search", phase: "start" });
    assert.equal(controller.getState().stage, "Convergent and bidirectional search");
    args.onProgress("convergent", { phase: "forward", depth: 1, maxSteps: 4, percent: 50 });
    args.onProgress("convergent", { phase: "forward", depth: 2, maxSteps: 4, percent: 10 }); // never goes back
    args.onStage({ laneId: "convergent", label: "x", phase: "end" });
    args.onStage({ laneId: "linear", label: "Goal-directed linear search", phase: "start" });
    args.onProgress("linear", { phase: "forward", depth: 1, maxSteps: 9, percent: 20 });
    calls[0].resolve(result([], "no-route-within-budget", "deadline"));
    await done;
    for (let i = 1; i < percents.length; i += 1) {
      if (percents[i - 1] > 0 && percents[i] < percents[i - 1]) assert.equal(percents[i], 100, "only the final state may reset the bar");
    }
    assert.deepEqual(forwarded, [["convergent", 1], ["convergent", 2], ["linear", 1]]);
    assert.equal(controller.getState().percent, 100);
  });

  test("[unit] the shown confidence follows replay: verified, or connectivity-verified; never 'unverified'", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner);
    const done = controller.start(START);
    const exact = makeRoute("verified");
    const weak = makeRoute("connectivity-only");
    exact.confidence = "connectivity-verified"; // a wrong planner label must not survive
    weak.confidence = "verified";
    calls[0].args.onRoutes(ranked(exact, weak));
    assert.deepEqual(controller.getState().routes.map((item) => item.confidence), ["verified", "connectivity-verified"]);
    calls[0].resolve(result([exact, weak], "routes-found", "lanes-complete"));
    await done;
    assert.ok(controller.getState().routes.every((item) => item.verification.status !== "failed"));
  });

  test("[unit] Stage 7 compatibility annotations and verification metadata are carried through untouched", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner);
    const done = controller.start(START);
    const compatibility = { warnings: [{ severity: "plausible", stepNumber: 1, group: "alcohol", message: "m" }], unassessedRuleIds: ["r9"], worst: "plausible" };
    const route = makeRoute("verified", { compatibility });
    calls[0].args.onRoutes(ranked(route));
    const shown = controller.getState().routes[0];
    assert.deepEqual(shown.compatibility, compatibility);
    assert.equal(shown.verification, route.verification);
    assert.equal(shown.steps, route.steps);
    calls[0].resolve(result([route], "routes-found", "lanes-complete"));
    await done;
  });

  test("[unit] a starting material that already is the target is reported as such", () => {
    const route = makeRoute("verified", { steps: [] });
    assert.match(run.describeFoundRoutes([route]), /already matches the target/);
  });
});

// ---- cancel, clear, stale callbacks --------------------------------------------------------

describe("cancel, Clear and stale callbacks", () => {
  test("[unit] Cancel keeps the verified routes found so far and says the search did not finish", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner);
    const done = controller.start(START);
    const route = makeRoute();
    calls[0].args.onRoutes(ranked(route));
    controller.cancel();
    const state = controller.getState();
    assert.equal(state.phase, "finished");
    assert.equal(state.outcome.kind, "cancelled");
    assert.equal(state.outcome.interrupted, true);
    assert.equal(state.routes.length, 1);
    assert.match(state.outcome.message, /did not finish/);
    assert.equal(calls[0].args.signal.aborted, true, "the scheduler is told to stop");
    calls[0].resolve(result([route], "routes-found", "cancelled"));
    await done;
    assert.equal(controller.getState(), state, "the run's late completion does not touch the state");
  });

  test("[unit] Cancel with no route found is a plain cancellation", () => {
    const { runner } = manualRunner();
    const controller = controllerWith(runner);
    void controller.start(START);
    controller.cancel();
    assert.equal(controller.getState().outcome.message, "Synthesis search cancelled.");
    assert.equal(controller.getState().routes.length, 0);
  });

  test("[unit] Clear forgets everything and later reports from the cleared run are ignored", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner);
    const done = controller.start(START);
    calls[0].args.onRoutes(ranked(makeRoute()));
    controller.reset();
    const cleared = controller.getState();
    assert.equal(cleared.phase, "idle");
    assert.equal(cleared.routes.length, 0);
    calls[0].args.onRoutes(ranked(makeRoute()));
    calls[0].args.onStage({ laneId: "x", label: "late stage", phase: "start" });
    calls[0].resolve(result([makeRoute()], "routes-found", "lanes-complete"));
    await done;
    assert.equal(controller.getState(), cleared);
  });

  test("[unit] a finished older search can never overwrite a newer search's state", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner);
    const first = controller.start(START);
    const oldRoute = makeRoute();
    const second = controller.start({ startingSmiles: "C.D", targetSmiles: "U" });
    assert.equal(calls[0].args.signal.aborted, true, "starting a new search stops the old one");
    const newRoute = makeRoute();
    calls[1].args.onRoutes(ranked(newRoute));
    calls[0].args.onRoutes(ranked(oldRoute)); // stale
    calls[0].resolve(result([oldRoute], "routes-found", "satisfied")); // stale completion
    await first;
    assert.deepEqual(controller.getState().routes.map((item) => item.id), [newRoute.id]);
    assert.equal(controller.getState().phase, "running");
    calls[1].resolve(result([newRoute], "routes-found", "satisfied"));
    await second;
    assert.deepEqual(controller.getState().routes.map((item) => item.id), [newRoute.id]);
    assert.equal(controller.getState().phase, "finished");
  });

  test("[unit] a throwing subscriber does not break the run", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner);
    controller.subscribe(() => {
      throw new Error("listener failure");
    });
    const done = controller.start(START);
    calls[0].resolve(result([], "no-route-within-bounds", "lanes-complete"));
    await done;
    assert.equal(controller.getState().phase, "finished");
  });
});

// ---- outcomes -----------------------------------------------------------------------------

describe("search outcomes", () => {
  test("[unit] a deadline-limited search with routes keeps them and is not described as complete", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner);
    const done = controller.start(START);
    const route = makeRoute();
    calls[0].resolve(result([route], "routes-found", "deadline"));
    await done;
    const { outcome } = controller.getState();
    assert.equal(outcome.kind, "found-interrupted");
    assert.equal(outcome.interrupted, true);
    assert.match(outcome.message, /better\) routes may exist/);
    assert.equal(controller.getState().routes.length, 1);
  });

  test("[unit] a completed search says the routes are the best found, not proven optimal", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner);
    const done = controller.start(START);
    calls[0].resolve(result([makeRoute()], "routes-found", "satisfied"));
    await done;
    assert.equal(controller.getState().outcome.kind, "found");
    assert.match(controller.getState().outcome.message, /not proven optimal/);
  });

  test("[unit] no route within the budget is not chemical impossibility; within bounds is qualified too", async () => {
    for (const [verdict, kind, interrupted] of [
      ["no-route-within-budget", "no-route-within-budget", true],
      ["no-route-within-bounds", "no-route-within-bounds", false],
    ]) {
      const { runner, calls } = manualRunner();
      const controller = controllerWith(runner);
      const done = controller.start(START);
      calls[0].resolve({ ...result([], verdict, "deadline") });
      await done;
      const { outcome } = controller.getState();
      assert.equal(outcome.kind, kind);
      assert.equal(outcome.interrupted, interrupted);
      assert.match(outcome.message, /not a claim that the synthesis is impossible/);
    }
  });

  test("[unit] an engine error is reported with its details and keeps routes verified before it", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner);
    const done = controller.start(START);
    calls[0].args.onRoutes(ranked(makeRoute()));
    calls[0].reject(new Error("rule exploded"));
    await done;
    const state = controller.getState();
    assert.equal(state.outcome.kind, "error");
    assert.match(state.errorDetail, /rule exploded/);
    assert.equal(state.routes.length, 1);
    assert.match(state.outcome.message, /kept/);
  });
});

describe("watchdogs (small limits)", () => {
  test("[unit] a stalled engine is stopped after the stall limit; verified routes are kept; late reports are ignored", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner, { stallMs: 40, totalMs: 5000, graceMs: 1000 });
    const done = controller.start(START);
    calls[0].args.onRoutes(ranked(makeRoute()));
    await sleep(120);
    const state = controller.getState();
    assert.equal(state.phase, "finished");
    assert.equal(state.outcome.kind, "found-interrupted");
    assert.match(state.outcome.message, /No search progress was reported/);
    assert.equal(calls[0].args.signal.aborted, true);
    calls[0].args.onRoutes(ranked(makeRoute(), makeRoute()));
    calls[0].resolve(result([makeRoute()], "routes-found", "lanes-complete"));
    await done;
    assert.equal(controller.getState(), state);
  });

  test("[unit] any lane activity re-arms the stall guard", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner, { stallMs: 60, totalMs: 5000, graceMs: 1000 });
    const done = controller.start(START);
    for (let i = 0; i < 4; i += 1) {
      await sleep(30);
      calls[0].args.onProgress("linear", { phase: "forward", depth: i, maxSteps: 9, percent: i * 10 });
    }
    assert.equal(controller.getState().phase, "running");
    calls[0].resolve(result([], "no-route-within-bounds", "lanes-complete"));
    await done;
  });

  test("[unit] the hard backstop abandons an engine that ignores the 45 s deadline (no routes: a budget stop)", async () => {
    const { runner, calls } = manualRunner();
    const controller = controllerWith(runner, { stallMs: 5000, totalMs: 50, graceMs: 30 });
    const done = controller.start(START);
    await sleep(160);
    const state = controller.getState();
    assert.equal(state.phase, "finished");
    assert.equal(state.outcome.kind, "no-route-within-budget");
    assert.match(state.outcome.message, /not a claim that the synthesis is impossible/);
    calls[0].resolve(result([makeRoute()], "routes-found", "lanes-complete"));
    await done;
    assert.equal(controller.getState(), state);
  });
});

// ---- real wiring --------------------------------------------------------------------------

describe("real scheduler through the controller", () => {
  test("[engine] ethanol -> acetaldehyde: one Search finds a verified route and reports it while running or at the end", async () => {
    const controller = new run.SearchRunController({ rules: registry, totalMs: 15000 });
    const phases = [];
    controller.subscribe((state) => phases.push([state.phase, state.routes.length]));
    await controller.start({ startingSmiles: "CCO", targetSmiles: "CC=O" });
    const state = controller.getState();
    assert.equal(state.phase, "finished");
    assert.equal(state.outcome.kind, "found", JSON.stringify(state.outcome));
    assert.equal(state.routes[0].verification.status, "verified");
    assert.equal(state.routes[0].confidence, "verified");
    assert.equal(state.copies, 1);
    assert.ok(phases.some(([phase, count]) => phase === "running" && count >= 1), "route published before the run finished");
  });
});

// ---- page wiring (source) -------------------------------------------------------------------

describe("SynthesisPage wiring (source checks)", () => {
  const source = fs.readFileSync(path.join(root, "src", "components", "SynthesisPage.tsx"), "utf8");

  test("[source] one Search button; no Deep, Search deeper or algorithm-selection controls remain", () => {
    assert.equal((source.match(/void findSynthesis\(\)/g) ?? []).length, 1, "the only trigger is findSynthesis()");
    assert.match(source, /"Searching…" : "Search"/);
    assert.doesNotMatch(source, /Search deeper/);
    assert.doesNotMatch(source, /findSynthesis\("(deep|normal)"\)/);
    assert.doesNotMatch(source, /Try convergent routes first/);
    assert.doesNotMatch(source, /Also work backward from the target/);
    assert.doesNotMatch(source, /synthesis-advanced-search/);
    assert.doesNotMatch(source, /canSearchDeeper|activeSearchEffort|buildSynthesisSearchOptions|AdvancedSearchSettings/);
  });

  test("[source] the copies selector defaults to one, offers one or two, and is the value handed to the controller", () => {
    assert.match(source, /useState<1 \| 2>\(1\)/);
    assert.match(source, /<option value=\{1\}>One copy \(default\)<\/option>/);
    assert.match(source, /<option value=\{2\}>Two copies<\/option>/);
    assert.match(source, /controller\.start\(\{ startingSmiles: combinedStart, targetSmiles: targetComponents\[0\], copies \}/);
  });

  test("[source] Cancel, Clear, unmount and the 45 s limit go through the controller", () => {
    assert.match(source, /controller\?\.cancel\(\)/);
    assert.match(source, /searchControllerRef\.current\?\.reset\(\)/);
    assert.match(source, /controller\.dispose\(\)/);
    assert.match(source, /UNIFIED_SEARCH_TOTAL_MS/);
  });

  test("[source] Stage 7 compatibility notes and verification labels are still rendered", () => {
    assert.match(source, /Compatibility notes \(advisory\)/);
    assert.match(source, /Structure verified/);
    assert.match(source, /Connectivity verified/);
    assert.match(source, /Not replay-verified/);
    assert.match(source, /RouteStructurePanel/);
  });

  test("[source] the editors and their ready/clearing guards are untouched", () => {
    assert.match(source, /globalKey="synthesisReactantKetcher"/);
    assert.match(source, /globalKey="synthesisProductKetcher"/);
    assert.match(source, /!editorsReady \|\| isSearching \|\| isClearing/);
  });
});
