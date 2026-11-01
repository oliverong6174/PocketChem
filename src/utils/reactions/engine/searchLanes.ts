/**
 * Real-engine lanes for the adaptive scheduler (Stage 8A-3, experimental).
 *
 * Wraps the existing engines without changing them:
 *   1. convergent + bidirectional lane (findConvergentSynthesisRoutes): bounded by its own
 *      expansion/execution budgets, so it usually ends well before its slice. Only
 *      offered when at least two lots exist (two materials, or two user-selected copies).
 *   2. linear lane (searchLinearSynthesisRoutes): the lane that needs the most time. It
 *      goes last and keeps a reserve that the convergent lane cannot take, so a search
 *      that needs most of the overall time can still finish.
 *
 * Lane sizes come from the workload (number of materials, rough target size) and from the
 * total budget; nothing here knows any particular synthesis. The numbers are initial
 * values to be tuned from the benchmarks in 8A-5, not measured optima.
 */
import type { MultistepSynthesisRoute, ReactionRule } from "../reactionTypes";
import { findConvergentSynthesisRoutes, searchLinearSynthesisRoutes } from "./multistepSynthesis";
import { DEFAULT_ADVANCED_SETTINGS, buildSynthesisSearchOptions } from "./searchOptionsFromUi";
import type { LaneOutcome, SearchLane } from "./searchScheduler";

export type SearchWorkload = {
  /** Dot-separated components supplied by the user. */
  materialCount: number;
  /** Rough heavy-atom count of the target (from the SMILES text, no chemistry perception). */
  targetSize: number;
};

/** Counts atom tokens in a SMILES string; an estimate for sizing budgets only. */
export function estimateHeavyAtoms(smiles: string): number {
  const stripped = smiles.replace(/\[[^\]]*\]/g, "A");
  const tokens = stripped.match(/Cl|Br|[BCNOPSFIAcnopsb]/g);
  return tokens ? tokens.length : 0;
}

export function describeWorkload(startingSmiles: string, targetSmiles: string): SearchWorkload {
  return {
    materialCount: startingSmiles.split(".").filter((part) => part.trim().length > 0).length,
    targetSize: estimateHeavyAtoms(targetSmiles),
  };
}

/** Share of the total kept back for the linear lane. */
const LINEAR_RESERVE_SHARE = 0.7;
/** Linear lane gets Deep settings when its slice is at least this long; otherwise Normal. */
const DEEP_LINEAR_MIN_SLICE_MS = 20000;

export function convergentCapMs(workload: SearchWorkload, totalMs: number): number {
  const wanted = 3000 + 2000 * Math.max(0, workload.materialCount - 1) + 100 * workload.targetSize;
  return Math.min(wanted, 14000, totalMs * (1 - LINEAR_RESERVE_SHARE));
}

function mapConvergentStop(reason: string): LaneOutcome["stoppedBy"] {
  switch (reason) {
    case "found":
    case "exhausted":
      return "completed";
    case "expansion-budget":
    case "execution-budget":
    case "retro-budget":
      return "own-limit";
    default:
      return "aborted";
  }
}

/** Least time worth spending on a second pass that avoids rules with selectivity concerns. */
const SELECTIVITY_REFINE_MIN_MS = 3000;

/**
 * Rules behind steps the first verified route uses although their outcome is documented as
 * minor or trace; empty when it has none. Unranked or unassessed outcomes are not listed:
 * missing information is not a reason to search again.
 */
export function rulesWithSelectivityConcerns(routes: MultistepSynthesisRoute[]): Set<string> {
  const first = routes.find((route) => route.verification && route.verification.status !== "failed");
  const flagged = new Set<string>();
  for (const finding of first?.selectivity?.findings ?? []) {
    if (finding.class === "disfavored") flagged.add(finding.ruleId);
  }
  return flagged;
}

export function createEngineLanes(args: {
  startingSmiles: string;
  targetSmiles: string;
  rules: ReactionRule[];
  totalMs: number;
  /** The user's explicit copy choice (default one). */
  copies?: 1 | 2;
}): SearchLane[] {
  const { startingSmiles, targetSmiles, rules, totalMs } = args;
  const copies = args.copies === 2 ? 2 : 1;
  const workload = describeWorkload(startingSmiles, targetSmiles);
  const lanes: SearchLane[] = [];
  const linearReserve = totalMs * LINEAR_RESERVE_SHARE;

  // A convergent route joins two supplied lots: two different materials, or two copies of one.
  if (workload.materialCount * copies >= 2) {
    lanes.push({
      id: "convergent-bidirectional",
      label: "Convergent and bidirectional search",
      minUsefulMs: 2500,
      capMs: convergentCapMs(workload, totalMs),
      reserveMs: 0,
      async run(context) {
        const result = await findConvergentSynthesisRoutes(
          startingSmiles,
          targetSmiles,
          rules,
          {
            signal: context.signal,
            onRouteFound: (route: MultistepSynthesisRoute) => context.reportRoute(route),
            convergentSearch: {
              startingMaterialCopies: context.copies,
              bidirectional: true,
              maxWallMs: Math.max(1, Math.floor(context.slice.allottedMs)),
              deadline: Date.now() + context.slice.allottedMs,
            },
          },
          (progress) => context.reportProgress(progress),
        );
        return { routes: result.routes, stoppedBy: mapConvergentStop(result.stats.stopReason) };
      },
    });
  }

  lanes.push({
    id: "linear",
    label: "Goal-directed linear search",
    minUsefulMs: 6000,
    capMs: Number.POSITIVE_INFINITY,
    reserveMs: linearReserve,
    async run(context) {
      const effort = context.slice.allottedMs >= DEEP_LINEAR_MIN_SLICE_MS ? "deep" : "normal";
      const options = buildSynthesisSearchOptions(effort, context.slice.allottedMs, DEFAULT_ADVANCED_SETTINGS, {
        signal: context.signal,
        onRouteFound: (route: MultistepSynthesisRoute) => context.reportRoute(route),
      });
      const routes = await searchLinearSynthesisRoutes(
        startingSmiles,
        targetSmiles,
        rules,
        options,
        (progress) => context.reportProgress(progress),
        context.copies === 2 ? 2 : undefined,
      );

      // The search stops at the first verified route. If that route relies on a step whose
      // outcome is documented as disfavored, spend part of what is left of this
      // slice (never more than the first pass took) looking once for a route without those
      // rules. Whatever it finds goes to the same route book, which ranks both; the budget
      // is unchanged.
      const avoided = rulesWithSelectivityConcerns(routes);
      const remainingMs = context.slice.allottedMs - context.slice.elapsedMs();
      const refineMs = Math.min(remainingMs, Math.max(SELECTIVITY_REFINE_MIN_MS, context.slice.elapsedMs()));
      if (avoided.size > 0 && !context.signal.aborted && refineMs >= SELECTIVITY_REFINE_MIN_MS) {
        const refined = await searchLinearSynthesisRoutes(
          startingSmiles,
          targetSmiles,
          rules.filter((rule) => !avoided.has(rule.id)),
          buildSynthesisSearchOptions("normal", refineMs, DEFAULT_ADVANCED_SETTINGS, {
            signal: context.signal,
            onRouteFound: (route: MultistepSynthesisRoute) => context.reportRoute(route),
          }),
          (progress) => context.reportProgress(progress),
          context.copies === 2 ? 2 : undefined,
        );
        routes.push(...refined);
      }
      return { routes, stoppedBy: context.signal.aborted ? "aborted" : "completed" };
    },
  });

  return lanes;
}
