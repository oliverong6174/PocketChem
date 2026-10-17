// Opt-in Multi-Step search regression. NOT part of `npm test`: it runs the real
// planner for up to the page's hard time limit per case (several seconds each).
//
//   npm run test:search            normal search, page limits (15 s)
//   PC_DEEP=1 npm run test:search  also run the deep search (45 s limit)
//   PC_SEARCH_LIMIT_MS=30000 ...   override the normal-search limit on slow machines
//
// Each case must find a route AND the route must replay end to end from the
// supplied starting materials (routeVerification). Timings are printed so a
// regression in search efficiency is visible even when a route is still found.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine } from "../tests/engine.mjs";

const NORMAL_LIMIT_MS = Number(process.env.PC_SEARCH_LIMIT_MS ?? 15000);
const DEEP_LIMIT_MS = 45000;

// Options mirror SynthesisPage.tsx exactly.
const EFFORT = {
  normal: { beamWidth: 10, branchLimit: 18, maxSteps: 7 },
  deep: { beamWidth: 16, branchLimit: 32, maxSteps: 9 },
};

let utils;

before(async () => {
  ({ utils } = await loadEngine());
});

after(async () => {
  await closeEngine();
});

async function search(start, target, effort, limitMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limitMs);
  const startedAt = performance.now();
  const metrics = { progressEvents: 0, maxProgressGapMs: 0, deepestForward: 0, deepestRetro: 0 };
  let last = startedAt;
  let routes = [];
  try {
    routes = await utils.findMultistepSynthesisRoutes(
      start,
      target,
      {
        ...EFFORT[effort],
        maxRoutes: 1,
        preferFirstVerifiedRoute: true,
        searchEffort: effort,
        signal: controller.signal,
      },
      (progress) => {
        const now = performance.now();
        metrics.progressEvents += 1;
        metrics.maxProgressGapMs = Math.max(metrics.maxProgressGapMs, now - last);
        last = now;
        if (progress.phase === "forward") metrics.deepestForward = Math.max(metrics.deepestForward, progress.depth);
        if (progress.phase === "retrosynthesis") metrics.deepestRetro = Math.max(metrics.deepestRetro, progress.depth);
      },
    );
  } finally {
    clearTimeout(timer);
  }
  const elapsedMs = performance.now() - startedAt;
  console.log(
    `  [${effort}] ${start} -> ${target}: ${routes.length ? `${routes[0].steps.length} step(s) ` +
      routes[0].steps.map((s) => s.ruleId).join(" > ") : "no route"} ` +
      `in ${(elapsedMs / 1000).toFixed(1)}s, aborted=${controller.signal.aborted}, ` +
      `${JSON.stringify(metrics)}`,
  );
  return { routes, elapsedMs, aborted: controller.signal.aborted, metrics };
}

function assertReplayVerified(route) {
  assert.ok(route.verification, "the planner must attach an end-to-end replay");
  assert.equal(
    route.verification.status,
    "verified",
    `replay problems: ${route.verification.problems.join(" | ")}`,
  );
  assert.equal(route.verification.targetMatch, "exact");
}

describe("normal search finds short valid syntheses within the interactive limit", () => {
  test("[heuristic] acetone -> ethanol (Baeyer-Villiger, then ester reduction)", async () => {
    const { routes, elapsedMs, aborted } = await search("CC(=O)C", "CCO", "normal", NORMAL_LIMIT_MS);
    assert.ok(!aborted, `normal search hit the ${NORMAL_LIMIT_MS} ms limit without a route`);
    assert.equal(routes.length, 1);
    assert.ok(elapsedMs < NORMAL_LIMIT_MS);
    assert.equal(routes[0].steps.length, 2);
    assert.deepEqual(routes[0].steps.map((s) => s.ruleId), ["ketone-baeyer-villiger", "ester-lah-reduction"]);
    assertReplayVerified(routes[0]);
  });

  // Control cases: they passed before the acetone fix and must keep passing, so
  // a change that helps one search cannot silently break the others.
  for (const [label, start, target, steps] of [
    ["propene -> 2-propanol", "C=CC", "CC(C)O", 1],
    ["propene -> acetone", "C=CC", "CC(=O)C", 2],
    ["benzene -> nitrobenzene", "c1ccccc1", "c1ccc(cc1)[N+](=O)[O-]", 1],
    ["2-butanol -> 2-butanone", "CC(O)CC", "CCC(C)=O", 1],
  ]) {
    test(`[heuristic] control: ${label}`, async () => {
      const { routes, aborted } = await search(start, target, "normal", NORMAL_LIMIT_MS);
      assert.ok(!aborted);
      assert.equal(routes.length, 1);
      assert.equal(routes[0].steps.length, steps);
      assertReplayVerified(routes[0]);
    });
  }
});

describe("deep search (opt-in: PC_DEEP=1)", { skip: !process.env.PC_DEEP }, () => {
  test("[heuristic] acetone -> ethanol", async () => {
    const { routes, aborted } = await search("CC(=O)C", "CCO", "deep", DEEP_LIMIT_MS);
    assert.ok(!aborted);
    assert.equal(routes.length, 1);
    assert.equal(routes[0].steps.length, 2);
    assertReplayVerified(routes[0]);
  });
});
