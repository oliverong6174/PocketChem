// Phase 4 / Stage 8A-1..3: shared budget, route book and adaptive scheduler.
//
// Almost everything here is deterministic: scripted fake lanes run against a manual clock,
// so no timer, RDKit search or real planner is involved. Only the last describe block builds
// the real lanes (structure only) and runs one trivial one-step problem end to end.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let budgetModule;
let book;
let scheduler;

before(async () => {
  budgetModule = await loadModule("/src/utils/reactions/engine/searchBudget.ts");
  book = await loadModule("/src/utils/reactions/engine/routeBook.ts");
  scheduler = await loadModule("/src/utils/reactions/engine/searchScheduler.ts");
});

after(async () => {
  await closeEngine();
});

// ---- helpers -------------------------------------------------------------------------

function manualClock() {
  let t = 0;
  const timers = new Set();
  return {
    now: () => t,
    setTimeout(callback, ms) {
      const handle = { at: t + ms, callback };
      timers.add(handle);
      return handle;
    },
    clearTimeout(handle) {
      timers.delete(handle);
    },
    advance(ms) {
      const target = t + ms;
      for (;;) {
        const due = [...timers].filter((item) => item.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers.delete(due);
        t = Math.max(t, due.at);
        due.callback();
      }
      t = target;
    },
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

let ids = 0;
function step(number, ruleId, reactants, products, extra = {}) {
  return {
    id: `s${number}-${ids++}`,
    stepNumber: number,
    ruleId,
    reagentLabel: extra.reagentLabel ?? "reagent",
    reactantComponents: reactants,
    productComponents: products,
    productSmiles: products.join("."),
    reactantSmiles: reactants.join("."),
  };
}

/** A minimal replayed route; every field the book reads is present. */
function makeRoute(steps, overrides = {}) {
  // Step-level findings are what the planner prices; mirror the route-level summary onto step 1.
  if (overrides.compatibility?.warnings?.length) steps[0].compatibility = overrides.compatibility.warnings;
  const verification = {
    status: "verified",
    steps: [],
    targetMatch: "exact",
    unusedStartingMaterials: [],
    coproducts: [],
    problems: [],
    ...(overrides.verification ?? {}),
  };
  return {
    id: overrides.id ?? `route-${ids++}`,
    startingSmiles: "A.B",
    targetSmiles: "T",
    steps,
    confidence: "verified",
    score: 0,
    verification,
    compatibility: overrides.compatibility,
  };
}

const clean = { warnings: [], unassessedRuleIds: [], worst: "none" };
const flagged = { warnings: [{ severity: "model-constraint" }], unassessedRuleIds: [], worst: "model-constraint" };
const plausible = { warnings: [{ severity: "plausible" }], unassessedRuleIds: [], worst: "plausible" };

const twoSteps = () => [step(1, "r1", ["A"], ["A1"]), step(2, "r2", ["A1", "B"], ["T"])];
const cleanRoute = (extra = {}) => makeRoute(twoSteps(), { compatibility: clean, ...extra });

/** A lane that works for `ms` of fake time in small steps, honouring its signal. */
function workLane(clock, spec) {
  return {
    id: spec.id,
    label: spec.id,
    minUsefulMs: spec.minUsefulMs ?? 10,
    capMs: spec.capMs ?? Number.POSITIVE_INFINITY,
    reserveMs: spec.reserveMs ?? 0,
    async run(context) {
      spec.seen?.push({ allotted: context.slice.allottedMs, copies: context.copies });
      let worked = 0;
      const routesAt = spec.routesAt ?? [];
      while (worked < spec.needMs && !context.signal.aborted) {
        clock.advance(10);
        worked += 10;
        for (const item of routesAt) if (item.at === worked) context.reportRoute(item.route);
        spec.onStep?.(context, worked);
        await tick();
      }
      return {
        routes: spec.returns ?? [],
        stoppedBy: context.signal.aborted ? "aborted" : spec.stoppedBy ?? "completed",
      };
    },
  };
}

// ---- budget --------------------------------------------------------------------------

describe("shared budget", () => {
  test("[unit] a slice is clamped to the time that is left and ends at the overall deadline", () => {
    const clock = manualClock();
    const budget = new budgetModule.SearchBudget(1000, undefined, clock);
    clock.advance(900);
    const slice = budget.slice(500);
    assert.equal(slice.allottedMs, 100);
    clock.advance(100);
    assert.equal(slice.signal.aborted, true);
    assert.equal(slice.endedBy(), "overall-deadline");
  });

  test("[unit] a slice shorter than the remaining time ends as a slice limit; the budget is still open", () => {
    const clock = manualClock();
    const budget = new budgetModule.SearchBudget(1000, undefined, clock);
    const slice = budget.slice(200);
    clock.advance(200);
    assert.equal(slice.endedBy(), "slice-limit");
    assert.equal(budget.remainingMs(), 800);
    assert.equal(budget.expired(), false);
  });

  test("[unit] cancelling the parent aborts every open slice; a slice opened afterwards is already aborted", () => {
    const clock = manualClock();
    const parent = new AbortController();
    const budget = new budgetModule.SearchBudget(1000, parent.signal, clock);
    const first = budget.slice(500);
    parent.abort();
    assert.equal(first.signal.aborted, true);
    assert.equal(first.endedBy(), "cancelled");
    assert.equal(budget.slice(100).signal.aborted, true);
  });

  test("[unit] released slices stop their timers (no detached work is left behind)", () => {
    const clock = manualClock();
    const budget = new budgetModule.SearchBudget(1000, undefined, clock);
    const slice = budget.slice(100);
    slice.release();
    clock.advance(500);
    assert.equal(slice.signal.aborted, false);
  });
});

// ---- route book ----------------------------------------------------------------------

describe("route book: admission, identity and ranking", () => {
  test("[unit] failed or never-replayed routes are not admitted; connectivity-only routes are", () => {
    const routes = new book.RouteBook();
    assert.equal(routes.offer(makeRoute(twoSteps(), { verification: { status: "failed" } }), "x").outcome, "not-verified");
    const unreplayed = makeRoute(twoSteps());
    delete unreplayed.verification;
    assert.equal(routes.offer(unreplayed, "x").outcome, "not-verified");
    assert.equal(routes.offer(makeRoute(twoSteps(), { verification: { status: "connectivity-only", targetMatch: "connectivity" } }), "x").outcome, "added");
  });

  test("[unit] the same reactions in a different step order or numbering are one route", () => {
    const routes = new book.RouteBook();
    const a = [step(1, "r1", ["A"], ["A1"]), step(2, "r3", ["B"], ["B1"]), step(3, "r2", ["A1", "B1"], ["T"])];
    const b = [step(1, "r3", ["B"], ["B1"]), step(2, "r1", ["A"], ["A1"]), step(3, "r2", ["B1", "A1"], ["T"])];
    assert.equal(routes.offer(makeRoute(a), "x").outcome, "added");
    assert.equal(routes.offer(makeRoute(b), "y").outcome, "duplicate");
    assert.equal(routes.size(), 1);
  });

  test("[unit] a different rule, reagent label, stereoisomer or inventory provenance is a different route", () => {
    const routes = new book.RouteBook();
    const base = [step(1, "r1", ["C[C@H](O)CC"], ["P"])];
    assert.equal(routes.offer(makeRoute(base), "x").outcome, "added");
    assert.equal(routes.offer(makeRoute([step(1, "r9", ["C[C@H](O)CC"], ["P"])]), "x").outcome, "added", "rule");
    assert.equal(routes.offer(makeRoute([step(1, "r1", ["C[C@H](O)CC"], ["P"], { reagentLabel: "other conditions" })]), "x").outcome, "added", "reagent");
    assert.equal(routes.offer(makeRoute([step(1, "r1", ["C[C@@H](O)CC"], ["P"])]), "x").outcome, "added", "stereo");
    const lot = (stepNumber) => ({
      verification: { inventory: [{ startIndex: 0, smiles: "A", copies: 1, consumed: 1, lotIds: ["l0"], consumedByStep: [stepNumber] }] },
    });
    const twoStepRoute = (consumer) => makeRoute([step(1, "r1", ["A"], ["A1"]), step(2, "r1", ["A"], ["A2"])], lot(consumer));
    const fresh = new book.RouteBook();
    assert.equal(fresh.offer(twoStepRoute(1), "x").outcome, "added");
    assert.equal(fresh.offer(twoStepRoute(2), "x").outcome, "added", "same rules, the single lot is consumed by a different step");
  });

  test("[unit] ranking keeps the verifier's distinctions: exact, mixture member, connectivity-only", () => {
    const routes = new book.RouteBook();
    const make = (rule, verification) => makeRoute([step(1, rule, ["A"], ["T"])], { verification, compatibility: clean });
    routes.offer(make("c", { status: "connectivity-only", targetMatch: "connectivity" }), "x");
    routes.offer(make("m", { targetMatch: "mixture-member" }), "x");
    routes.offer(make("e", { targetMatch: "exact" }), "x");
    assert.deepEqual(routes.entries().map((item) => item.tier), [0, 1, 2]);
  });

  test("[unit] compatibility prices length but never becomes a pass/fail: a flagged route needs a real length advantage", () => {
    const routes = new book.RouteBook();
    const three = (rule) => [step(1, rule + "a", ["A"], ["X"]), step(2, rule + "b", ["X"], ["Y"]), step(3, rule + "c", ["Y"], ["T"])];
    routes.offer(makeRoute(three("f"), { compatibility: flagged }), "x");
    routes.offer(makeRoute(three("g"), { compatibility: clean }), "x");
    assert.equal(routes.best().compatibility, "no-findings", "equal length: the clean route ranks first");
    const shorter = makeRoute([step(1, "s1", ["A"], ["X"]), step(2, "s2", ["X"], ["T"])], { compatibility: flagged });
    routes.offer(shorter, "x");
    assert.equal(routes.best().route, shorter, "a route two steps shorter still wins despite a finding (finding costs < 1 step)");
    assert.equal(routes.best().compatibility, "model-constraint", "and the finding stays visible");
  });

  test("[unit] unassessed stays unknown: not 'no findings', not a finding; fewer unassessed steps breaks ties only", () => {
    const routes = new book.RouteBook();
    const unknown = makeRoute(twoSteps(), { compatibility: { warnings: [], unassessedRuleIds: ["r1", "r2"], worst: "none" } });
    const partly = makeRoute([step(1, "p1", ["A"], ["A1"]), step(2, "p2", ["A1", "B"], ["T"])], { compatibility: { warnings: [], unassessedRuleIds: ["p1"], worst: "none" } });
    const missing = makeRoute([step(1, "q1", ["A"], ["A1"]), step(2, "q2", ["A1", "B"], ["T"])]);
    routes.offer(unknown, "x");
    routes.offer(missing, "x");
    routes.offer(partly, "x");
    const classes = Object.fromEntries(routes.entries().map((item) => [item.route.steps[0].ruleId, item.compatibility]));
    assert.deepEqual(classes, { r1: "unassessed", q1: "not-evaluated", p1: "partly-unassessed" });
    assert.equal(routes.best().route, partly, "tie on length: the more assessed route is listed first");
  });

  test("[unit] unused starting materials are reported but never disqualify a verified route", () => {
    const routes = new book.RouteBook();
    const { entry } = routes.offer(cleanRoute({ verification: { unusedStartingMaterials: ["CCO"] } }), "x");
    assert.deepEqual(entry.unusedStartingMaterials, ["CCO"]);
    assert.equal(book.isAdequate(entry), true);
    assert.equal(book.isImprovable(entry), false);
  });

  test("[unit] the list is capped, keeps the best, and closed books ignore late offers", () => {
    const routes = new book.RouteBook(2);
    for (let n = 0; n < 4; n += 1) {
      const chain = Array.from({ length: n + 1 }, (_unused, i) => step(i + 1, `c${n}-${i}`, ["A"], [i === n ? "T" : "I" + i]));
      routes.offer(makeRoute(chain, { compatibility: clean }), "x");
    }
    assert.deepEqual(routes.entries().map((item) => item.route.steps.length), [1, 2]);
    routes.close();
    assert.equal(routes.offer(cleanRoute(), "x").outcome, "closed");
    assert.equal(routes.lateOffers, 1);
  });
});

// ---- scheduler -----------------------------------------------------------------------

describe("scheduler: budget and time allocation", () => {
  test("[unit] sequential lanes can never add up to more than the overall budget", async () => {
    const clock = manualClock();
    const seen = [];
    const lanes = ["a", "b", "c"].map((id) => workLane(clock, { id, needMs: 100000, seen }));
    const result = await scheduler.runAdaptiveSearch(lanes, { totalMs: 1000, clock });
    assert.ok(clock.now() <= 1000, `elapsed ${clock.now()}`);
    assert.ok(seen.reduce((sum, item) => sum + item.allotted, 0) <= 1000);
    assert.equal(result.verdict, "no-route-within-budget");
    assert.equal(result.stopReason, "deadline");
  });

  test("[unit] a later lane's reserve cannot be taken by an earlier lane", async () => {
    const clock = manualClock();
    const seen = [];
    const lanes = [
      workLane(clock, { id: "first", needMs: 100000, reserveMs: 0, seen }),
      workLane(clock, { id: "last", needMs: 100, reserveMs: 700, seen }),
    ];
    // reserve is declared on the lane that must be protected
    lanes[0].reserveMs = 0;
    await scheduler.runAdaptiveSearch(lanes, { totalMs: 1000, clock });
    assert.equal(seen[0].allotted, 300);
    assert.equal(seen[1].allotted, 700, "the protected lane gets exactly what was reserved when nothing was saved");
  });

  test("[unit] time an early lane does not use flows to the next lane", async () => {
    const clock = manualClock();
    const seen = [];
    const lanes = [
      workLane(clock, { id: "quick", needMs: 50, seen }),
      workLane(clock, { id: "main", needMs: 10, reserveMs: 700, seen }),
    ];
    await scheduler.runAdaptiveSearch(lanes, { totalMs: 1000, clock });
    assert.equal(seen[1].allotted, 950);
  });

  test("[unit] a lane that cannot get its minimum useful time is skipped and reported as such", async () => {
    const clock = manualClock();
    const lanes = [
      workLane(clock, { id: "a", needMs: 1, minUsefulMs: 400, reserveMs: 0 }),
      workLane(clock, { id: "b", needMs: 1, minUsefulMs: 10, reserveMs: 800 }),
    ];
    const result = await scheduler.runAdaptiveSearch(lanes, { totalMs: 1000, clock });
    assert.equal(result.lanes[0].status, "skipped-no-time");
    assert.equal(result.lanes[1].status, "completed");
  });

  test("[unit] a lane that ignores its slice is reported as an overrun, and no further lane starts after the deadline", async () => {
    const clock = manualClock();
    const stubborn = {
      id: "stubborn",
      label: "stubborn",
      minUsefulMs: 1,
      capMs: 100,
      reserveMs: 0,
      async run() {
        clock.advance(400); // does not look at its signal
        return { routes: [], stoppedBy: "completed" };
      },
    };
    const never = workLane(clock, { id: "never", needMs: 10 });
    const result = await scheduler.runAdaptiveSearch([stubborn, never], { totalMs: 300, clock });
    assert.ok(result.overrunMs >= 300, `overrun ${result.overrunMs}`);
    assert.equal(result.lanes[0].status, "slice-limit");
    assert.equal(result.lanes[1].status, "not-run");
    assert.equal(result.stopReason, "deadline");
  });

  test("[unit] a lane that throws is reported and the next lane still runs", async () => {
    const clock = manualClock();
    const broken = { id: "broken", label: "broken", minUsefulMs: 1, capMs: 100, reserveMs: 0, async run() { throw new Error("boom"); } };
    const next = workLane(clock, { id: "next", needMs: 10, returns: [cleanRoute()] });
    const result = await scheduler.runAdaptiveSearch([broken, next], { totalMs: 1000, clock });
    assert.equal(result.lanes[0].status, "error");
    assert.equal(result.lanes[0].error, "boom");
    assert.equal(result.verdict, "routes-found");
  });
});

describe("scheduler: early delivery, stopping and escalation", () => {
  test("[unit] a route is published the moment a lane reports it, before the lane returns", async () => {
    const clock = manualClock();
    const log = [];
    const route = cleanRoute();
    const lane = workLane(clock, { id: "a", needMs: 100, routesAt: [{ at: 30, route }] });
    const original = lane.run;
    lane.run = async (context) => {
      const outcome = await original(context);
      log.push("lane returned");
      return outcome;
    };
    await scheduler.runAdaptiveSearch([lane], {
      totalMs: 1000,
      clock,
      onRoutes: (routes) => log.push(`published ${routes.length}`),
    });
    assert.deepEqual(log, ["published 1", "lane returned"]);
  });

  test("[unit] a clean verified route ends the search as 'satisfied' without claiming optimality", async () => {
    const clock = manualClock();
    const ran = [];
    const first = workLane(clock, { id: "a", needMs: 30, routesAt: [{ at: 20, route: cleanRoute() }], seen: ran });
    const second = workLane(clock, { id: "b", needMs: 30, seen: ran });
    const result = await scheduler.runAdaptiveSearch([first, second], { totalMs: 1000, clock });
    assert.equal(result.stopReason, "satisfied");
    assert.equal(result.lanes[1].status, "skipped-satisfied");
    assert.equal(ran.length, 1);
    assert.match(scheduler.describeAdaptiveOutcome(result), /not proven optimal/);
  });

  test("[unit] a route with a model-constraint is published but the search keeps looking, and a clean route displaces it", async () => {
    const clock = manualClock();
    const flaggedRoute = makeRoute(twoSteps(), { compatibility: flagged });
    const betterRoute = makeRoute([step(1, "b1", ["A"], ["A1"]), step(2, "b2", ["A1", "B"], ["T"])], { compatibility: clean });
    const first = workLane(clock, { id: "a", needMs: 20, routesAt: [{ at: 10, route: flaggedRoute }] });
    const second = workLane(clock, { id: "b", needMs: 20, returns: [betterRoute] });
    const published = [];
    const result = await scheduler.runAdaptiveSearch([first, second], {
      totalMs: 1000,
      clock,
      onRoutes: (routes) => published.push(routes[0].compatibility),
    });
    assert.deepEqual(published, ["model-constraint", "no-findings"]);
    assert.equal(result.routes[0].route, betterRoute);
    assert.equal(result.stopReason, "lanes-complete");
  });

  test("[unit] connectivity-only is improvable: a later exact route is searched for and ranks first", async () => {
    const clock = manualClock();
    const weak = makeRoute(twoSteps(), { verification: { status: "connectivity-only", targetMatch: "connectivity" }, compatibility: clean });
    const exact = makeRoute([step(1, "e1", ["A"], ["A1"]), step(2, "e2", ["A1", "B"], ["T"])], { compatibility: clean });
    const first = workLane(clock, { id: "a", needMs: 20, routesAt: [{ at: 10, route: weak }] });
    const second = workLane(clock, { id: "b", needMs: 20, returns: [exact] });
    const result = await scheduler.runAdaptiveSearch([first, second], { totalMs: 1000, clock });
    assert.deepEqual(result.routes.map((item) => item.tier), [0, 2]);
  });

  test("[unit] once a route exists, the improvement slice is bounded by a multiple of the time the first one took", async () => {
    const clock = manualClock();
    const seen = [];
    const weak = makeRoute(twoSteps(), { verification: { status: "connectivity-only", targetMatch: "connectivity" } });
    const first = workLane(clock, { id: "a", needMs: 100, routesAt: [{ at: 100, route: weak }] });
    const second = workLane(clock, { id: "b", needMs: 5, minUsefulMs: 10, seen });
    await scheduler.runAdaptiveSearch([first, second], { totalMs: 10000, clock, improvementFactor: 2 });
    assert.equal(seen[0].allotted, 200);
  });

  test("[unit] a convergent-style lane is not suppressed by a linear-style route: the earlier lane always runs first", async () => {
    const clock = manualClock();
    const order = [];
    const lanes = [
      workLane(clock, { id: "convergent", needMs: 20, seen: order, returns: [] }),
      workLane(clock, { id: "linear", needMs: 20, seen: order }),
    ];
    const result = await scheduler.runAdaptiveSearch(lanes, { totalMs: 1000, clock });
    assert.deepEqual(result.lanes.map((item) => item.status), ["completed", "completed"]);
  });
});

describe("scheduler: inventory, cancellation and stale results", () => {
  test("[unit] copies default to one for every lane and are never escalated after a failed search", async () => {
    const clock = manualClock();
    const seen = [];
    const lanes = ["a", "b", "c"].map((id) => workLane(clock, { id, needMs: 10, seen }));
    const result = await scheduler.runAdaptiveSearch(lanes, { totalMs: 1000, clock });
    assert.equal(result.copies, 1);
    assert.deepEqual(seen.map((item) => item.copies), [1, 1, 1]);
    assert.equal(seen.length, 3, "no extra lane or tier was added after the failures");
  });

  test("[unit] two copies are used only when the user selected them, for every lane", async () => {
    const clock = manualClock();
    const seen = [];
    const lanes = ["a", "b"].map((id) => workLane(clock, { id, needMs: 10, seen }));
    const result = await scheduler.runAdaptiveSearch(lanes, { totalMs: 1000, clock, startingMaterialCopies: 2 });
    assert.equal(result.copies, 2);
    assert.deepEqual(seen.map((item) => item.copies), [2, 2]);
  });

  test("[unit] cancellation keeps routes found so far, stops later lanes, and ignores reports made afterwards", async () => {
    const clock = manualClock();
    const controller = new AbortController();
    const early = makeRoute(twoSteps(), { verification: { status: "connectivity-only", targetMatch: "connectivity" } });
    const late = cleanRoute();
    const lane = workLane(clock, {
      id: "a",
      needMs: 500,
      routesAt: [{ at: 20, route: early }],
      onStep: (context, worked) => {
        if (worked === 50) {
          controller.abort();
          context.reportRoute(late); // a report after cancellation
        }
      },
    });
    const next = workLane(clock, { id: "b", needMs: 10 });
    const result = await scheduler.runAdaptiveSearch([lane, next], { totalMs: 1000, clock, signal: controller.signal });
    assert.equal(result.stopReason, "cancelled");
    assert.equal(result.verdict, "routes-found");
    assert.equal(result.routes.length, 1);
    assert.equal(result.routes[0].route, early);
    assert.equal(result.lanes[0].status, "cancelled");
    assert.equal(result.lanes[1].status, "not-run");
    assert.equal(result.lanes[0].lateReports >= 1, true);
  });

  test("[unit] cancelling before any route is found is 'cancelled', not a failure to find a route", async () => {
    const clock = manualClock();
    const controller = new AbortController();
    const lane = workLane(clock, { id: "a", needMs: 500, onStep: (_context, worked) => worked === 30 && controller.abort() });
    const result = await scheduler.runAdaptiveSearch([lane], { totalMs: 1000, clock, signal: controller.signal });
    assert.equal(result.verdict, "cancelled");
  });

  test("[unit] a superseded search (isCurrent false) neither publishes nor keeps late routes", async () => {
    const clock = manualClock();
    let current = true;
    const published = [];
    const lane = workLane(clock, {
      id: "a",
      needMs: 100,
      routesAt: [{ at: 10, route: cleanRoute() }],
      onStep: (context, worked) => {
        if (worked === 20) current = false;
        if (worked === 30) context.reportRoute(makeRoute([step(1, "z", ["A"], ["T"])], { compatibility: clean }));
      },
    });
    const result = await scheduler.runAdaptiveSearch([lane], {
      totalMs: 1000,
      clock,
      isCurrent: () => current,
      onRoutes: (routes) => published.push(routes.length),
    });
    assert.deepEqual(published, [1]);
    assert.equal(result.routes.length, 1);
    assert.equal(result.stopReason, "cancelled");
  });

  test("[unit] a report made after the lane returned is counted as late and never added", async () => {
    const clock = manualClock();
    let saved;
    const lane = {
      id: "a", label: "a", minUsefulMs: 1, capMs: 100, reserveMs: 0,
      async run(context) { saved = context; return { routes: [], stoppedBy: "completed" }; },
    };
    const second = workLane(clock, { id: "b", needMs: 10, onStep: () => saved.reportRoute(cleanRoute()) });
    const result = await scheduler.runAdaptiveSearch([lane, second], { totalMs: 1000, clock });
    assert.equal(result.routes.length, 0);
    assert.ok(result.lanes[0].lateReports >= 1);
  });
});

describe("scheduler: incomplete-search outcomes", () => {
  test("[unit] every lane finishing inside its bounds with nothing found is 'within bounds', never 'impossible'", async () => {
    const clock = manualClock();
    const lanes = ["a", "b"].map((id) => workLane(clock, { id, needMs: 10 }));
    const result = await scheduler.runAdaptiveSearch(lanes, { totalMs: 1000, clock });
    assert.equal(result.verdict, "no-route-within-bounds");
    const text = scheduler.describeAdaptiveOutcome(result);
    assert.match(text, /not a claim that the synthesis is impossible/);
  });

  test("[unit] a lane cut short by its own cap or by time makes the outcome 'within budget'", async () => {
    const clock = manualClock();
    const capped = workLane(clock, { id: "a", needMs: 10, stoppedBy: "own-limit" });
    const fine = workLane(clock, { id: "b", needMs: 10 });
    const result = await scheduler.runAdaptiveSearch([capped, fine], { totalMs: 1000, clock });
    assert.equal(result.lanes[0].status, "own-limit");
    assert.equal(result.verdict, "no-route-within-budget");
    assert.match(scheduler.describeAdaptiveOutcome(result), /may still exist/);
  });

  test("[unit] a skipped lane also prevents a 'within bounds' claim", async () => {
    const clock = manualClock();
    const lanes = [
      workLane(clock, { id: "a", needMs: 1, minUsefulMs: 400 }),
      workLane(clock, { id: "b", needMs: 1, reserveMs: 800 }),
    ];
    const result = await scheduler.runAdaptiveSearch(lanes, { totalMs: 1000, clock });
    assert.equal(result.verdict, "no-route-within-budget");
  });
});

// ---- real lanes ----------------------------------------------------------------------

describe("engine lanes (structure, plus one trivial real search)", () => {
  let lanesModule;
  let registry;
  before(async () => {
    lanesModule = await loadModule("/src/utils/reactions/engine/searchLanes.ts");
    ({ reactionRegistry: registry } = await loadModule("/src/utils/reactionUtils.ts"));
  });

  test("[engine] a single material gets only the linear lane; two or more get the convergent lane first", () => {
    const one = lanesModule.createEngineLanes({ startingSmiles: "CCO", targetSmiles: "CC=O", rules: [], totalMs: 45000 });
    assert.deepEqual(one.map((item) => item.id), ["linear"]);
    const three = lanesModule.createEngineLanes({ startingSmiles: "Cc1ccc(O)cc1.CBr.C#C", targetSmiles: "COc1ccc(CC=C)cc1", rules: [], totalMs: 45000 });
    assert.deepEqual(three.map((item) => item.id), ["convergent-bidirectional", "linear"]);
  });

  test("[engine] one material with two user-selected copies can still join two lots, so it gets the convergent lane", () => {
    const lanes = lanesModule.createEngineLanes({ startingSmiles: "CCO", targetSmiles: "CCOCC", rules: [], totalMs: 45000, copies: 2 });
    assert.deepEqual(lanes.map((item) => item.id), ["convergent-bidirectional", "linear"]);
  });

  test("[engine] workload-aware sizing keeps at least 70% of the overall time for the linear lane", () => {
    const [convergent, linear] = lanesModule.createEngineLanes({
      startingSmiles: "Cc1ccc(O)cc1.CBr.C#C", targetSmiles: "COc1ccc(CC=C)cc1", rules: [], totalMs: 45000,
    });
    assert.ok(linear.reserveMs >= 31500 - 1);
    assert.ok(convergent.capMs <= 45000 - linear.reserveMs + 1, `convergent cap ${convergent.capMs}`);
    assert.ok(convergent.capMs >= 3000);
    const bigger = lanesModule.convergentCapMs({ materialCount: 4, targetSize: 30 }, 45000);
    const smaller = lanesModule.convergentCapMs({ materialCount: 2, targetSize: 5 }, 45000);
    assert.ok(bigger >= smaller);
  });

  test("[engine] a shorter total budget shrinks the convergent lane proportionally; the total is not raised", () => {
    const [convergent] = lanesModule.createEngineLanes({ startingSmiles: "A.B", targetSmiles: "CC", rules: [], totalMs: 20000 });
    assert.ok(convergent.capMs <= 6000 + 1);
  });

  test("[engine] heavy-atom estimate counts atom tokens only", () => {
    assert.equal(lanesModule.estimateHeavyAtoms("COc1ccc(CC=C)cc1"), 11);
    assert.equal(lanesModule.estimateHeavyAtoms("CBr"), 2);
    assert.equal(lanesModule.estimateHeavyAtoms("[Mg]Br"), 2);
  });

  test("[engine] one real, trivial problem end to end: ethanol -> acetaldehyde is found, verified and ranked", async () => {
    const lanes = lanesModule.createEngineLanes({ startingSmiles: "CCO", targetSmiles: "CC=O", rules: registry, totalMs: 15000 });
    const published = [];
    const result = await scheduler.runAdaptiveSearch(lanes, {
      totalMs: 15000,
      onRoutes: (routes) => published.push(routes.length),
    });
    assert.equal(result.verdict, "routes-found", JSON.stringify(result.lanes));
    assert.ok(published.length >= 1);
    assert.equal(result.routes[0].route.verification.status, "verified");
    assert.ok(result.elapsedMs < 15000 + 2000);
    assert.equal(result.copies, 1);
  });
});
