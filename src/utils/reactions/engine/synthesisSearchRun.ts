/**
 * One unified synthesis search run, as the Multi-Step Synthesis page uses it (Stage 8A-4).
 *
 * The page owns the editors and rendering; this controller owns everything that has to
 * stay correct when searches overlap or stop early, so it can be tested without React:
 *   - one Search starts the adaptive scheduler (searchScheduler.ts) under ONE 45 s budget;
 *   - verified routes are published to subscribers the moment a lane reports them;
 *   - cancel / Clear / a newer search invalidate the run: nothing from an older run can
 *     reach the state afterwards (stale-run protection);
 *   - cancel and deadline keep the best verified routes found so far;
 *   - a stall watchdog and a hard backstop guard against an engine that stops answering
 *     (a synchronous RDKit call cannot be interrupted, so the backstop abandons the run);
 *   - "no route found within the budget" is never worded as chemical impossibility.
 */
import type { MultistepSynthesisProgress, MultistepSynthesisRoute, ReactionRule } from "../reactionTypes";
import type { RankedRoute } from "./routeBook";
import { routeQualityLabel } from "./routeQuality";
import { createEngineLanes } from "./searchLanes";
import {
  describeAdaptiveOutcome,
  runAdaptiveSearch,
  type AdaptiveSearchResult,
  type SearchLane,
} from "./searchScheduler";

/** The overall limit for one search (unchanged from the previous Deep limit). */
export const UNIFIED_SEARCH_TOTAL_MS = 45000;
/** No lane activity for this long is treated as a stalled engine. */
export const UNIFIED_SEARCH_STALL_MS = 18000;
/** After the deadline, how long a cooperative stop may take before the run is abandoned. */
export const UNIFIED_SEARCH_GRACE_MS = 2000;

export type SearchOutcomeKind =
  | "found"
  /** Routes were found but the search was cut short (deadline, cancel or stall). */
  | "found-interrupted"
  | "no-route-within-budget"
  | "no-route-within-bounds"
  | "cancelled"
  | "stalled"
  | "error";

export type SearchOutcome = {
  kind: SearchOutcomeKind;
  message: string;
  /** True when the search did not finish its work (so better routes may exist). */
  interrupted: boolean;
};

export type SearchRunState = {
  runId: number;
  phase: "idle" | "running" | "finished";
  /** Verified / connectivity-verified routes, best first. Never contains an unverified route. */
  routes: MultistepSynthesisRoute[];
  ranked: RankedRoute[];
  /** Label of the lane currently searching, or null. */
  stage: string | null;
  /** Latest engine progress report of the current stage. */
  progress: MultistepSynthesisProgress | null;
  /** Monotonic 0-100 work estimate, not a time estimate. */
  percent: number;
  startedAt: number | null;
  firstRouteAfterMs: number | null;
  outcome: SearchOutcome | null;
  errorDetail: string | null;
  copies: 1 | 2;
};

export type SearchRunnerArgs = {
  startingSmiles: string;
  targetSmiles: string;
  rules: ReactionRule[];
  totalMs: number;
  copies: 1 | 2;
  signal: AbortSignal;
  isCurrent: () => boolean;
  onRoutes: (ranked: RankedRoute[]) => void;
  onStage: (stage: { laneId: string; label: string; phase: "start" | "end" }) => void;
  onProgress: (laneId: string, progress: MultistepSynthesisProgress) => void;
  /** Number of lanes the runner will use (for the progress estimate). */
  onPlan: (laneCount: number) => void;
};

export type SearchRunner = (args: SearchRunnerArgs) => Promise<AdaptiveSearchResult>;

export const defaultSearchRunner: SearchRunner = async (args) => {
  const lanes: SearchLane[] = createEngineLanes({
    startingSmiles: args.startingSmiles,
    targetSmiles: args.targetSmiles,
    rules: args.rules,
    totalMs: args.totalMs,
    copies: args.copies,
  });
  args.onPlan(lanes.length);
  return runAdaptiveSearch(lanes, {
    totalMs: args.totalMs,
    signal: args.signal,
    isCurrent: args.isCurrent,
    startingMaterialCopies: args.copies,
    onRoutes: (ranked) => args.onRoutes(ranked),
    onStage: (stage) => args.onStage(stage),
    onProgress: args.onProgress,
  });
};

export type SearchRunControllerOptions = {
  rules: ReactionRule[];
  runner?: SearchRunner;
  totalMs?: number;
  stallMs?: number;
  graceMs?: number;
  now?: () => number;
};

export type StartSearchArgs = {
  startingSmiles: string;
  targetSmiles: string;
  /** Explicit user choice; defaults to one copy. Never changed by the search. */
  copies?: 1 | 2;
};

const IDLE: SearchRunState = {
  runId: 0,
  phase: "idle",
  routes: [],
  ranked: [],
  stage: null,
  progress: null,
  percent: 0,
  startedAt: null,
  firstRouteAfterMs: null,
  outcome: null,
  errorDetail: null,
  copies: 1,
};

/** The confidence label always follows the replay, never a planner label. */
function normaliseRoute(route: MultistepSynthesisRoute): MultistepSynthesisRoute {
  return { ...route, confidence: route.verification?.status === "verified" ? "verified" : "connectivity-verified" };
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}

export function describeFoundRoutes(routes: MultistepSynthesisRoute[]): string {
  const best = routes[0];
  if (!best) return "";
  if (best.steps.length === 0) return "A supplied starting material already matches the target product.";
  const confirmed = best.verification?.status === "verified" ? "Structure-verified" : "Connectivity-verified";
  const quality = best.quality ? ` Chemical quality: ${routeQualityLabel(best.quality.tier).toLowerCase()}.` : "";
  return `${confirmed} route found: ${best.steps.length} ${plural(best.steps.length, "step", "steps")}.${quality}`;
}

export class SearchRunController {
  private state: SearchRunState = IDLE;
  private runId = 0;
  private abort: AbortController | null = null;
  private readonly listeners = new Set<(state: SearchRunState) => void>();
  private timers: { stall?: ReturnType<typeof setTimeout>; hard?: ReturnType<typeof setTimeout> } = {};
  private readonly rules: ReactionRule[];
  private readonly runner: SearchRunner;
  private readonly totalMs: number;
  private readonly stallMs: number;
  private readonly graceMs: number;
  private readonly now: () => number;

  constructor(options: SearchRunControllerOptions) {
    this.rules = options.rules;
    this.runner = options.runner ?? defaultSearchRunner;
    this.totalMs = options.totalMs ?? UNIFIED_SEARCH_TOTAL_MS;
    this.stallMs = options.stallMs ?? UNIFIED_SEARCH_STALL_MS;
    this.graceMs = options.graceMs ?? UNIFIED_SEARCH_GRACE_MS;
    this.now = options.now ?? (() => Date.now());
  }

  getState(): SearchRunState {
    return this.state;
  }

  isRunning(): boolean {
    return this.state.phase === "running";
  }

  subscribe(listener: (state: SearchRunState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(next: SearchRunState) {
    this.state = next;
    for (const listener of [...this.listeners]) {
      try {
        listener(next);
      } catch (listenerError) {
        console.error("[PocketChem:Synthesis] search-state listener failed; continuing.", listenerError);
      }
    }
  }

  private clearTimers() {
    if (this.timers.stall !== undefined) clearTimeout(this.timers.stall);
    if (this.timers.hard !== undefined) clearTimeout(this.timers.hard);
    this.timers = {};
  }

  private armStall(runId: number) {
    if (this.timers.stall !== undefined) clearTimeout(this.timers.stall);
    this.timers.stall = setTimeout(() => {
      if (runId !== this.runId || !this.isRunning()) return;
      const seconds = Math.round(this.stallMs / 1000);
      this.abandon(runId, "stall", `No search progress was reported for ${seconds} seconds.`);
    }, this.stallMs);
  }

  /** Ends a run whose engine stopped answering. Anything it reports later is ignored. */
  private abandon(runId: number, cause: "stall" | "deadline", reason: string) {
    if (runId !== this.runId) return;
    this.abort?.abort();
    this.abort = null;
    this.clearTimers();
    this.runId += 1; // invalidate the abandoned run
    const kept = this.state.routes.length;
    const base = this.state;
    const interruptedKind: SearchOutcomeKind = kept > 0 ? "found-interrupted" : cause === "stall" ? "stalled" : "no-route-within-budget";
    this.publish({
      ...base,
      runId: this.runId,
      phase: "finished",
      stage: null,
      percent: kept > 0 ? Math.max(base.percent, 97) : 100,
      outcome: {
        kind: interruptedKind,
        interrupted: true,
        message:
          kept > 0
            ? `${reason} The ${plural(kept, "route", "routes")} below passed end-to-end replay before the search stopped, but the search did not finish, so other (possibly better) routes may exist. This is a computation stop, not a claim about what is chemically possible.`
            : `${reason} A route may still exist; this is a computation stop, not a claim that the synthesis is impossible.`,
      },
    });
  }

  /**
   * Starts one search. Any earlier run is aborted and invalidated first, so only the newest
   * run can ever change the state. Resolves when the run has finished or been superseded.
   */
  async start(args: StartSearchArgs, onProgress?: (laneId: string, progress: MultistepSynthesisProgress) => void): Promise<void> {
    this.abort?.abort();
    this.clearTimers();
    this.runId += 1;
    const runId = this.runId;
    const copies: 1 | 2 = args.copies === 2 ? 2 : 1;
    const controller = new AbortController();
    this.abort = controller;
    const startedAt = this.now();
    let laneCount = 2;
    let stagesFinished = 0;
    const isCurrent = () => runId === this.runId && !controller.signal.aborted;

    this.publish({ ...IDLE, runId, phase: "running", startedAt, percent: 3, copies });
    this.armStall(runId);
    this.timers.hard = setTimeout(() => {
      if (runId !== this.runId || !this.isRunning()) return;
      this.abandon(runId, "deadline", `The ${Math.round(this.totalMs / 1000)}-second search limit was reached.`);
    }, this.totalMs + this.graceMs);

    const update = (change: Partial<SearchRunState>) => {
      if (!isCurrent()) return;
      this.publish({ ...this.state, ...change });
    };

    try {
      const result = await this.runner({
        startingSmiles: args.startingSmiles,
        targetSmiles: args.targetSmiles,
        rules: this.rules,
        totalMs: this.totalMs,
        copies,
        signal: controller.signal,
        isCurrent,
        onPlan: (count) => {
          if (count > 0) laneCount = count;
        },
        onRoutes: (ranked) => {
          if (!isCurrent()) return;
          this.armStall(runId);
          const first = this.state.firstRouteAfterMs ?? this.now() - startedAt;
          update({
            ranked,
            routes: ranked.map((entry) => normaliseRoute(entry.route)),
            firstRouteAfterMs: first,
          });
        },
        onStage: (stage) => {
          if (!isCurrent()) return;
          this.armStall(runId);
          if (stage.phase === "start") {
            update({ stage: stage.label, progress: null });
          } else {
            stagesFinished += 1;
            update({ percent: Math.max(this.state.percent, 5 + Math.round((90 * stagesFinished) / laneCount)) });
          }
        },
        onProgress: (laneId, progress) => {
          if (!isCurrent()) return;
          this.armStall(runId);
          onProgress?.(laneId, progress);
          const lanePercent =
            typeof progress.percent === "number"
              ? progress.percent
              : Math.round((progress.depth / Math.max(1, progress.maxSteps)) * 100);
          const base = 5 + (90 * stagesFinished) / laneCount;
          const next = Math.min(95, Math.round(base + (90 / laneCount) * Math.min(100, Math.max(0, lanePercent)) / 100));
          update({ progress, percent: Math.max(this.state.percent, next) });
        },
      });
      if (!isCurrent()) return;
      this.clearTimers();
      this.finish(runId, result);
    } catch (searchError) {
      if (runId !== this.runId) return;
      this.clearTimers();
      this.abort = null;
      this.publish({
        ...this.state,
        phase: "finished",
        stage: null,
        percent: 100,
        errorDetail:
          searchError instanceof Error
            ? `${searchError.name}: ${searchError.message}${searchError.stack ? `\n\n${searchError.stack}` : ""}`
            : String(searchError),
        outcome: {
          kind: "error",
          interrupted: true,
          message:
            "The synthesis engine encountered an internal error. The structures do not need to be redrawn; the technical details are shown below." +
            (this.state.routes.length > 0 ? " Routes verified before the error are kept." : ""),
        },
      });
    }
  }

  private finish(runId: number, result: AdaptiveSearchResult) {
    if (runId !== this.runId) return;
    this.abort = null;
    const routes = result.routes.map((entry) => normaliseRoute(entry.route));
    let outcome: SearchOutcome;
    if (result.verdict === "routes-found") {
      const interrupted = result.stopReason === "deadline" || result.stopReason === "cancelled";
      outcome = {
        kind: interrupted ? "found-interrupted" : "found",
        interrupted,
        message: interrupted
          ? `${describeFoundRoutes(routes)} The search stopped before it finished, so other (possibly better) routes may exist. This is a computation stop, not a claim about what is chemically possible.`
          : `${describeFoundRoutes(routes)} These are the best routes found within the search budget, not proven optimal.`,
      };
    } else if (result.verdict === "no-route-within-bounds") {
      outcome = { kind: "no-route-within-bounds", interrupted: false, message: describeAdaptiveOutcome(result) };
    } else if (result.verdict === "no-route-within-budget") {
      outcome = { kind: "no-route-within-budget", interrupted: true, message: describeAdaptiveOutcome(result) };
    } else {
      outcome = { kind: "cancelled", interrupted: true, message: describeAdaptiveOutcome(result) };
    }
    this.publish({
      ...this.state,
      phase: "finished",
      stage: null,
      progress: null,
      percent: 100,
      ranked: result.routes,
      routes,
      outcome,
    });
  }

  /** User cancel: keeps the verified routes found so far and invalidates the run. */
  cancel(): void {
    if (!this.isRunning()) return;
    this.abort?.abort();
    this.abort = null;
    this.clearTimers();
    this.runId += 1;
    const kept = this.state.routes.length;
    this.publish({
      ...this.state,
      runId: this.runId,
      phase: "finished",
      stage: null,
      progress: null,
      percent: 0,
      outcome: {
        kind: "cancelled",
        interrupted: true,
        message:
          kept > 0
            ? `The search was cancelled. The ${plural(kept, "route", "routes")} below passed end-to-end replay before it stopped, but the search did not finish, so other (possibly better) routes may exist.`
            : "Synthesis search cancelled.",
      },
    });
  }

  /** Clear: aborts and invalidates any run and forgets every result. */
  reset(): void {
    this.abort?.abort();
    this.abort = null;
    this.clearTimers();
    this.runId += 1;
    this.publish({ ...IDLE, runId: this.runId });
  }

  /** Page unmount: stop everything without publishing. */
  dispose(): void {
    this.abort?.abort();
    this.abort = null;
    this.clearTimers();
    this.runId += 1;
    this.listeners.clear();
  }
}
