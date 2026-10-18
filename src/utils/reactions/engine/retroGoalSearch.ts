import type { ReactionRule, RetrosynthesisPathway } from "../reactionTypes";
import { isGenericReactionSmiles } from "./reactionInput";
import { predictRetrosynthesisPathwaysFromRules } from "./retroSynthesis";

/**
 * Retrosynthetic goal-set search (Phase 4, Stage 4).
 *
 * A retro state is a multiset of UNRESOLVED PRECURSOR GOALS, not one molecule:
 * disconnecting the target by a two-reactant rule replaces it with two goals, and
 * each goal can be disconnected on its own later. Disconnections come only from
 * the existing registry (retroSynthesis.ts reverses the forward rules and replays
 * each proposal through the ORIGINAL forward rule before returning it), so no
 * chemistry and no structural reactant is invented here.
 *
 * This module never decides that a route exists. It proposes goal sets and the
 * disconnections that led to them; convergentSearch.ts matches them against
 * forward species-pool states (identity, inventory and stereo constraints) and a
 * route is only accepted after the route verifier replays it.
 *
 * - Stepwise. The search is driven one engine call at a time so the forward side
 *   can interleave with it. Which retro state is expanded next is ordered by how
 *   many of its goals the forward side has already reached; the order never
 *   excludes a state, only the budgets do.
 * - Dependencies. Every goal has an id; a disconnection records the goal it
 *   produces and the goals it consumes, so a chain replays in topological order
 *   (deepest disconnection first).
 * - Cycles. A goal that equals one of its own ancestors is rejected.
 * - Reagents. A precursor the forward rule supplies itself (an "auto" preset such
 *   as hydroxide) is a condition, not a goal.
 * - Budgets. Expansions, retro-engine calls, depth, goal count, wall clock and
 *   the abort signal are honoured, and the stop reason is reported.
 */

export const RETRO_DEFAULTS = {
  maxRetroExpansions: 8,
  maxRetroCalls: 6,
  maxRetroDepth: 3,
  maxResultsPerGoal: 40,
  maxGoals: 4,
} as const;

/** Ordering weight per goal the forward side already holds (about half a planning step). */
const REACHED_GOAL_WEIGHT = 60;

export type RetroStructure = {
  smiles: string;
  canonical: string;
  connectivity: string;
  hasSpecifiedStereo: boolean;
};

export type RetroGoal = RetroStructure & {
  id: string;
  /** Canonical structures this goal derives from (nearest first); used for cycle checks. */
  ancestors: string[];
};

export type RetroDisconnection = {
  ruleId: string;
  pathwayId: string;
  /** The goal this step produces (forward direction). */
  producesGoalId: string;
  producesGoal: RetroStructure;
  /** Goals this step consumes (forward direction); reagent conditions are excluded. */
  consumesGoalIds: string[];
  confidence: RetrosynthesisPathway["confidence"];
};

export type RetroState = {
  key: string;
  goals: RetroGoal[];
  /** In the order the retro search applied them: the first produces the target. */
  disconnections: RetroDisconnection[];
  cost: number;
  /** True when every goal is covered by a supplied material (copies respected). */
  resolved: boolean;
};

export type RetroStopReason =
  | "exhausted"
  | "expansion-budget"
  | "call-budget"
  | "time-budget"
  | "cancelled";

export type RetroStats = {
  stopReason: RetroStopReason | "running";
  expansions: number;
  engineCalls: number;
  statesFound: number;
  resolvedStates: number;
  rejectedCycles: number;
  rejectedPrecursors: number;
  maxDepthReached: number;
};

export type RetroSearchArgs = {
  target: RetroStructure;
  rules: ReactionRule[];
  /** Supplied materials with the number of copies of each. */
  supplied: Array<RetroStructure & { copies: number }>;
  structureOf: (smiles: string) => Promise<RetroStructure | null>;
  /** Canonical reagents each rule supplies itself. */
  presetsFor: (ruleId: string) => Set<string>;
  allowGeneric: boolean;
  limits: {
    maxRetroExpansions: number;
    maxRetroCalls: number;
    maxRetroDepth: number;
    maxResultsPerGoal: number;
    maxGoals: number;
  };
  /** Returns the reason to stop now (cancelled / deadline), or null. */
  haltReason: () => "cancelled" | "time-budget" | null;
  signal?: AbortSignal;
};

/** Goals not covered by the given materials, honouring how many copies there are. */
export function unresolvedGoals(
  goals: RetroGoal[],
  covering: Array<{ canonical: string; copies: number }>,
): RetroGoal[] {
  const remaining = new Map<string, number>();
  for (const item of covering) remaining.set(item.canonical, (remaining.get(item.canonical) ?? 0) + item.copies);
  const open: RetroGoal[] = [];
  for (const goal of goals) {
    const left = remaining.get(goal.canonical) ?? 0;
    if (left > 0) remaining.set(goal.canonical, left - 1);
    else open.push(goal);
  }
  return open;
}

function goalSetKey(goals: RetroGoal[]): string {
  return goals
    .map((goal) => goal.canonical)
    .sort()
    .join(".");
}

export type RetroSearch = {
  states: RetroState[];
  stats: RetroStats;
  /**
   * Expands one retro state and returns the states it created. `reached` holds
   * the canonical structures the forward side already has; states whose goals it
   * covers are expanded first. Returns null once the search is finished or stopped
   * (see `stats.stopReason`).
   */
  step: (reached: ReadonlySet<string>) => Promise<RetroState[] | null>;
};

export function createRetroSearch(args: RetroSearchArgs): RetroSearch {
  const { limits, supplied } = args;
  const stats: RetroStats = {
    stopReason: "running",
    expansions: 0,
    engineCalls: 0,
    statesFound: 0,
    resolvedStates: 0,
    rejectedCycles: 0,
    rejectedPrecursors: 0,
    maxDepthReached: 0,
  };
  const states: RetroState[] = [];
  const rootGoal: RetroGoal = { ...args.target, id: "g0", ancestors: [] };
  const root: RetroState = {
    key: goalSetKey([rootGoal]),
    goals: [rootGoal],
    disconnections: [],
    cost: 0,
    resolved: false,
  };
  const best = new Map<string, number>([[root.key, 0]]);
  const open: RetroState[] = [root];
  const engineCache = new Map<string, Promise<RetrosynthesisPathway[]>>();

  const disconnect = (canonical: string, smiles: string): Promise<RetrosynthesisPathway[]> => {
    let pending = engineCache.get(canonical);
    if (!pending) {
      stats.engineCalls += 1;
      pending = predictRetrosynthesisPathwaysFromRules(smiles, args.rules, {
        planning: true,
        signal: args.signal,
        maxResults: limits.maxResultsPerGoal,
      }).catch((error) => {
        console.error("[PocketChem:Synthesis] Retro goal disconnection failed; skipping this goal.", {
          smiles,
          error,
        });
        return [] as RetrosynthesisPathway[];
      });
      engineCache.set(canonical, pending);
    }
    return pending;
  };

  const stop = (reason: RetroStopReason): null => {
    stats.stopReason = reason;
    return null;
  };

  async function step(reached: ReadonlySet<string>): Promise<RetroState[] | null> {
    if (stats.stopReason !== "running") return null;
    const halt = args.haltReason();
    if (halt) return stop(halt);
    if (stats.expansions >= limits.maxRetroExpansions) return stop("expansion-budget");

    // Goals already covered by supplied materials or by something the forward side
    // holds need no disconnection; ordering favours states with more of them.
    const covering = [...supplied, ...[...reached].map((canonical) => ({ canonical, copies: 1 }))];
    let pick = -1;
    let pickOrder = Number.POSITIVE_INFINITY;
    for (let at = 0; at < open.length; at += 1) {
      const state = open[at];
      if (state.disconnections.length >= limits.maxRetroDepth) continue;
      if (unresolvedGoals(state.goals, supplied).length === 0) continue;
      const covered = state.goals.length - unresolvedGoals(state.goals, covering).length;
      const order = state.cost - covered * REACHED_GOAL_WEIGHT;
      if (order < pickOrder) {
        pickOrder = order;
        pick = at;
      }
    }
    if (pick < 0) return stop("exhausted");
    const current = open[pick];

    // Disconnect an unresolved goal the forward side has not reached; the other
    // goals stay in the set. Larger structures first (deterministic tie-break).
    let candidates = unresolvedGoals(current.goals, covering);
    if (candidates.length === 0) candidates = unresolvedGoals(current.goals, supplied);
    candidates = candidates
      .slice()
      .sort((a, b) => b.canonical.length - a.canonical.length || a.canonical.localeCompare(b.canonical));
    const goal = candidates[0];
    if (!engineCache.has(goal.canonical) && stats.engineCalls >= limits.maxRetroCalls) {
      return stop("call-budget");
    }

    open.splice(pick, 1);
    stats.expansions += 1;
    const pathways = await disconnect(goal.canonical, goal.smiles);
    if (args.signal?.aborted) return stop("cancelled");
    const lateHalt = args.haltReason();
    if (lateHalt) return stop(lateHalt);

    const created: RetroState[] = [];
    const ordered = pathways
      .slice()
      .sort((a, b) => a.planningCost - b.planningCost || a.id.localeCompare(b.id));
    for (const pathway of ordered) {
      const presets = args.presetsFor(pathway.ruleId);
      const lineage = new Set([goal.canonical, ...goal.ancestors]);
      const produced: RetroGoal[] = [];
      let valid = pathway.precursorComponents.length > 0;
      let cyclic = false;
      const depth = current.disconnections.length + 1;
      for (const component of pathway.precursorComponents) {
        const structure = await args.structureOf(component);
        if (!structure || (!args.allowGeneric && isGenericReactionSmiles(component))) {
          valid = false;
          break;
        }
        if (presets.has(structure.canonical)) continue;
        if (lineage.has(structure.canonical)) {
          cyclic = true;
          break;
        }
        produced.push({
          ...structure,
          id: `g${depth}.${produced.length + 1}`,
          ancestors: [goal.canonical, ...goal.ancestors],
        });
      }
      if (cyclic) {
        stats.rejectedCycles += 1;
        continue;
      }
      if (!valid || produced.length === 0) {
        stats.rejectedPrecursors += 1;
        continue;
      }
      const goals = [...current.goals.filter((item) => item.id !== goal.id), ...produced];
      if (goals.length > limits.maxGoals) continue;

      // The key keeps the disconnection history: the same goals reached through different
      // rules are different dependency chains and one may replay where the other does not.
      const key = `${goalSetKey(goals)}|${[...current.disconnections.map((item) => item.ruleId), pathway.ruleId].join(">")}`;
      const cost = current.cost + Math.max(1, pathway.planningCost);
      const seen = best.get(key);
      if (seen !== undefined && seen <= cost) continue;
      best.set(key, cost);

      const next: RetroState = {
        key,
        goals,
        cost,
        resolved: unresolvedGoals(goals, supplied).length === 0,
        disconnections: [
          ...current.disconnections,
          {
            ruleId: pathway.ruleId,
            pathwayId: pathway.id,
            producesGoalId: goal.id,
            producesGoal: goal,
            consumesGoalIds: produced.map((item) => item.id),
            confidence: pathway.confidence,
          },
        ],
      };
      stats.maxDepthReached = Math.max(stats.maxDepthReached, depth);
      stats.statesFound += 1;
      if (next.resolved) stats.resolvedStates += 1;
      states.push(next);
      open.push(next);
      created.push(next);
    }
    return created;
  }

  return { states, stats, step };
}
