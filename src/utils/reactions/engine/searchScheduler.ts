/**
 * Adaptive synthesis-search scheduler (Stage 8A-3, experimental, not wired into the UI).
 *
 * The scheduler runs the existing engines ("lanes") one after another inside ONE shared
 * budget (searchBudget.ts). It does not interleave or restart engines: the engines are
 * not resumable, so each lane runs once, with a slice sized from the workload, and
 * time a lane does not use flows to the lanes after it.
 *
 *   - Cheap, bounded lanes go first; the lane that needs the most time goes last and is
 *     guaranteed a reserve (`reserveMs`) that earlier lanes cannot take.
 *   - Verified routes are published the moment a lane reports them.
 *   - After a route exists, later lanes run only while the best route is improvable on
 *     checkable grounds (see routeBook.isImprovable) and only for a bounded slice.
 *   - Stopping is "good enough found" or "budget used". It never claims a route is
 *     shortest or optimal, and an empty result is "no route found within budget/bounds",
 *     never "impossible".
 *
 * This module has no chemistry and no RDKit dependency apart from the pure ranking in
 * routeBook.ts, so it is tested with scripted fake lanes. Real lanes are in searchLanes.ts.
 */
import type { MultistepSynthesisProgress, MultistepSynthesisRoute } from "../reactionTypes";
import { SearchBudget, type BudgetSlice, type SearchClock } from "./searchBudget";
import { RouteBook, isImprovable, type OfferOutcome, type RankedRoute } from "./routeBook";

export type LaneStop =
  /** The lane finished its search within its own bounds (with or without routes). */
  | "completed"
  /** The lane stopped on one of its own computational caps before the slice ended. */
  | "own-limit"
  /** The lane was stopped by its slice, the overall deadline, or cancellation. */
  | "aborted";

export type LaneOutcome = {
  /** Routes the lane returned at the end; any not already reported are offered as well. */
  routes: MultistepSynthesisRoute[];
  stoppedBy: LaneStop;
};

export type LaneContext = {
  slice: BudgetSlice;
  signal: AbortSignal;
  /** Copies of each supplied material. Always the user's choice; default 1. */
  copies: 1 | 2;
  /** Call as soon as a route has passed replay. Ignored once the lane or search is over. */
  reportRoute(route: MultistepSynthesisRoute): void;
  reportProgress(progress: MultistepSynthesisProgress): void;
};

export type SearchLane = {
  id: string;
  label: string;
  /** Below this a slice is not worth starting (the lane is skipped for lack of time). */
  minUsefulMs: number;
  /** Most time one run may take. Use Infinity for the lane that should get what is left. */
  capMs: number;
  /** Time that earlier lanes may not take from this lane. */
  reserveMs: number;
  run(context: LaneContext): Promise<LaneOutcome>;
};

export type LaneStatus =
  | "completed"
  | "own-limit"
  | "slice-limit"
  | "cancelled"
  | "error"
  | "skipped-no-time"
  | "skipped-satisfied"
  | "not-run";

export type LaneReport = {
  id: string;
  label: string;
  status: LaneStatus;
  allottedMs: number;
  usedMs: number;
  /** Time past the slice end before the lane returned (cooperative cancellation is not instant). */
  overrunMs: number;
  routesReported: number;
  lateReports: number;
  error?: string;
};

export type SearchVerdict =
  | "routes-found"
  /** Every lane finished within its own bounds and none found a route. Not a proof of impossibility. */
  | "no-route-within-bounds"
  /** Some lane was cut short by time or its caps. A route may still exist. */
  | "no-route-within-budget"
  | "cancelled";

export type SearchStopReason = "satisfied" | "lanes-complete" | "deadline" | "cancelled";

export type AdaptiveSearchResult = {
  routes: RankedRoute[];
  verdict: SearchVerdict;
  stopReason: SearchStopReason;
  lanes: LaneReport[];
  elapsedMs: number;
  /** Total time lanes ran past their slices; non-zero means a lane did not stop promptly. */
  overrunMs: number;
  /** Copies used for every lane (user-selected; never escalated automatically). */
  copies: 1 | 2;
  lateOffers: number;
};

export type SchedulerOptions = {
  totalMs: number;
  /** User cancellation. Routes found before it are kept. */
  signal?: AbortSignal;
  /** Return false once a newer search has started; later reports are then ignored. */
  isCurrent?: () => boolean;
  /** Explicit user choice only. Defaults to one copy of each material. */
  startingMaterialCopies?: 1 | 2;
  /** Ranked routes after every change. Called as soon as a route is discovered. */
  onRoutes?: (routes: RankedRoute[], change: { lane: string; outcome: OfferOutcome }) => void;
  onStage?: (stage: { laneId: string; label: string; phase: "start" | "end"; allottedMs: number }) => void;
  onProgress?: (laneId: string, progress: MultistepSynthesisProgress) => void;
  /** A later lane's slice is limited to this multiple of the time the first route took. */
  improvementFactor?: number;
  maxRoutes?: number;
  clock?: SearchClock;
};

const DEFAULT_IMPROVEMENT_FACTOR = 2;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runAdaptiveSearch(
  lanes: SearchLane[],
  options: SchedulerOptions,
): Promise<AdaptiveSearchResult> {
  const copies: 1 | 2 = options.startingMaterialCopies === 2 ? 2 : 1;
  const budget = new SearchBudget(options.totalMs, options.signal, options.clock);
  const book = new RouteBook(options.maxRoutes ?? 5);
  const isCurrent = options.isCurrent ?? (() => true);
  const factor = options.improvementFactor ?? DEFAULT_IMPROVEMENT_FACTOR;
  const reports: LaneReport[] = lanes.map((lane) => ({
    id: lane.id,
    label: lane.label,
    status: "not-run",
    allottedMs: 0,
    usedMs: 0,
    overrunMs: 0,
    routesReported: 0,
    lateReports: 0,
  }));
  let firstRouteAtMs: number | null = null;
  let stopReason: SearchStopReason = "lanes-complete";

  const dead = () => budget.cancelled() || !isCurrent();

  for (let index = 0; index < lanes.length; index += 1) {
    const lane = lanes[index];
    const report = reports[index];
    if (dead()) {
      stopReason = "cancelled";
      break;
    }
    if (budget.expired()) {
      stopReason = "deadline";
      break;
    }
    const best = book.best();
    if (best && !isImprovable(best)) {
      // A verified route without checkable problems exists. This is "good enough",
      // not a claim that nothing better exists.
      for (let rest = index; rest < lanes.length; rest += 1) reports[rest].status = "skipped-satisfied";
      stopReason = "satisfied";
      break;
    }

    const reserveAfter = lanes.slice(index + 1).reduce((sum, later) => sum + later.reserveMs, 0);
    let allotted = Math.min(lane.capMs, Math.max(0, budget.remainingMs() - reserveAfter));
    if (best && firstRouteAtMs !== null) {
      // Looking for a better route is only worth about as much time again as the first one took.
      allotted = Math.min(allotted, Math.max(lane.minUsefulMs, factor * firstRouteAtMs));
    }
    if (allotted < lane.minUsefulMs) {
      report.status = "skipped-no-time";
      continue;
    }

    const slice = budget.slice(allotted);
    report.allottedMs = slice.allottedMs;
    let open = true;
    const context: LaneContext = {
      slice,
      signal: slice.signal,
      copies,
      reportRoute(route) {
        if (!open || dead()) {
          report.lateReports += 1;
          return;
        }
        const result = book.offer(route, lane.id);
        if (result.outcome === "added" || result.outcome === "replaced-duplicate") {
          report.routesReported += 1;
          if (firstRouteAtMs === null) firstRouteAtMs = budget.elapsedMs();
          try {
            options.onRoutes?.(book.entries(), { lane: lane.id, outcome: result.outcome });
          } catch (callbackError) {
            console.error("[PocketChem:Synthesis] onRoutes callback failed; continuing.", callbackError);
          }
        }
      },
      reportProgress(progress) {
        if (open && !dead()) options.onProgress?.(lane.id, progress);
      },
    };

    options.onStage?.({ laneId: lane.id, label: lane.label, phase: "start", allottedMs: slice.allottedMs });
    let outcome: LaneOutcome | null = null;
    try {
      outcome = await lane.run(context);
      for (const route of outcome.routes) context.reportRoute(route);
    } catch (error) {
      report.status = "error";
      report.error = errorText(error);
    } finally {
      open = false;
      slice.release();
    }
    report.usedMs = slice.elapsedMs();
    report.overrunMs = Math.max(0, budget.elapsedMs() - (slice.deadlineAt - budget.startedAt));
    options.onStage?.({ laneId: lane.id, label: lane.label, phase: "end", allottedMs: slice.allottedMs });

    if (report.status !== "error") {
      const ended = slice.endedBy();
      if (ended === "cancelled" || dead()) report.status = "cancelled";
      else if (ended === "slice-limit" || ended === "overall-deadline" || outcome?.stoppedBy === "aborted") {
        report.status = "slice-limit";
      } else if (outcome?.stoppedBy === "own-limit") report.status = "own-limit";
      else report.status = "completed";
    }
  }

  if (stopReason === "lanes-complete" && dead()) stopReason = "cancelled";
  if (stopReason === "lanes-complete" && budget.expired() && reports.some((item) => item.status !== "completed")) {
    stopReason = "deadline";
  }
  book.close();

  const routes = book.entries();
  let verdict: SearchVerdict;
  if (routes.length > 0) verdict = "routes-found";
  else if (stopReason === "cancelled") verdict = "cancelled";
  else if (reports.length > 0 && reports.every((item) => item.status === "completed")) verdict = "no-route-within-bounds";
  else verdict = "no-route-within-budget";

  return {
    routes,
    verdict,
    stopReason,
    lanes: reports,
    elapsedMs: budget.elapsedMs(),
    overrunMs: reports.reduce((sum, item) => sum + item.overrunMs, 0),
    copies,
    lateOffers: book.lateOffers,
  };
}

/**
 * Wording for an outcome. A search that finds nothing never says the synthesis is
 * impossible: it can only say what was and was not covered.
 */
export function describeAdaptiveOutcome(result: AdaptiveSearchResult): string {
  switch (result.verdict) {
    case "routes-found": {
      const best = result.routes[0];
      const base = `Found ${result.routes.length} route${result.routes.length === 1 ? "" : "s"}; best-ranked ${
        best.tier === 0 ? "verified" : best.tier === 1 ? "verified (mixture member)" : "connectivity-verified"
      }.`;
      if (result.stopReason === "cancelled") return `${base} Search cancelled; showing the routes found so far.`;
      if (result.stopReason === "deadline") return `${base} Search time ran out; better routes may exist.`;
      return `${base} These are the best routes found within the search budget, not proven optimal.`;
    }
    case "no-route-within-bounds":
      return "No route was found within PocketChem's current reaction set and search bounds. This is not a claim that the synthesis is impossible.";
    case "no-route-within-budget":
      return "No verified route was found within the search budget. A route may still exist; this is a computation stop, not a claim that the synthesis is impossible.";
    default:
      return "Search cancelled before a verified route was found.";
  }
}
