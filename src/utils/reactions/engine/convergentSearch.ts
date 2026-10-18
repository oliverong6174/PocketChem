import type {
  ConvergentSearchOptions,
  MultistepSynthesisProgress,
  MultistepSynthesisRoute,
  ReactionPathway,
  ReactionRule,
  SynthesisStep,
} from "../reactionTypes";
import { resolveReactantRequirement } from "../profiles/reactants";
import { isGenericReactionSmiles, splitReactionComponents } from "./reactionInput";
import { predictReactionPathwaysFromRules } from "./reactionEngine";
import { canonicalizeStereoStructure } from "./stereochemistry";
import { getPlanningSignature, planningSignatureDistance } from "./planningHeuristics";
import { ReactantRoleIndex, type IndexableLot, type RoleAssignment } from "./reactantRoleIndex";
import {
  applyStep,
  createPoolState,
  enforceBudget,
  lotAncestry,
  lotById,
  lotEquivalenceKey,
  liveLots,
  sanitizeCopies,
  stateKey,
  type PoolLot,
  type PoolState,
  type ProductInput,
  type SuppliedMaterial,
} from "./speciesPool";
import { verifyMultistepRoute } from "./routeVerification";
import {
  RETRO_DEFAULTS,
  createRetroSearch,
  type RetroSearch,
  type RetroState,
  type RetroStats,
  type RetroStructure,
} from "./retroGoalSearch";

/**
 * Forward convergent search (Phase 4, Stage 3).
 *
 * Finds routes of the shape  A -> A', B -> B', A' + B' -> target  by searching
 * over species-pool states (speciesPool.ts) instead of single molecules. It is
 * opt-in (`convergentSearch` in the search options) and a separate lane: the
 * linear search is not modified and does not call into this module.
 *
 * - Expansion. A state is a shelf of live lots. A successor consumes ONE lot
 *   through a rule that needs no structural partner, or SEVERAL lots through a
 *   rule whose reactant roles they fill (reactantRoleIndex.ts). Only live lots
 *   are consumed, each at most once; nothing is invented, so a rule that needs
 *   a structural reactant nobody supplied simply never matches. Reagents the
 *   rule supplies itself are conditions, not lots.
 * - Identity. States are merged with the pool's "future" key, which keeps
 *   structure, mixture status, availability and remaining copies, so states
 *   with different supply or shelved lots are never merged.
 * - Budgets. State expansions, engine executions and depth are capped, as is
 *   wall-clock time; the abort signal is honoured between executions. When a
 *   budget stops the search it returns only routes already found and verified.
 * - Verification. A route is returned only after verifyMultistepRoute replays
 *   it against the supplied inventory. A failed replay discards the route.
 *
 * "Convergent" is checked, not assumed: a route is kept only if the target's
 * ancestry includes at least two supplied lots joined by a multi-lot step.
 * Purely linear routes are left to the linear search.
 */

export const CONVERGENT_DEFAULTS = {
  maxStateExpansions: 60,
  maxReactionExecutions: 400,
  maxDepth: 5,
  maxArity: 3,
  maxLiveLots: 8,
  maxLiveCoproducts: 3,
  maxPathwaysPerExecution: 4,
  maxWallMs: 15000,
  maxRoutes: 2,
} as const;

const PLANNING_HEURISTIC_SCALE = 8;
const NON_COMPUTED_PENALTY = 12;
const MIXTURE_PENALTY = 24;
const EXTRA_PRODUCT_PENALTY = 4;
/**
 * Ordering bonus (never a validity test) for a state whose lots from independent
 * origins can already fill one multi-lot rule: that is the signature of A' + B'.
 * One planning step costs roughly 100, so the bonus is about one step.
 */
const INDEPENDENT_JOIN_BONUS = 45;

export type ConvergentStopReason =
  | "found"
  | "exhausted"
  | "expansion-budget"
  | "execution-budget"
  | "retro-budget"
  | "time-budget"
  | "cancelled";

export type ConvergentSearchStats = {
  stopReason: ConvergentStopReason;
  stateExpansions: number;
  reactionExecutions: number;
  cachedExecutionHits: number;
  statesGenerated: number;
  duplicateStatesMerged: number;
  maxDepthReached: number;
  /** Routes that reached the target structure but were not returned. */
  rejectedRoutes: Array<{ reason: string; steps: number }>;
  elapsedMs: number;
  /** Present only when `bidirectional` was requested. */
  retro: (RetroStats & { meetingsAttempted: number; chainsCompleted: number; chainsRejected: number }) | null;
};

/**
 * An empty `routes` list means no route was found within the stated budgets
 * (see `stats.stopReason`); it is not evidence that none exists.
 */
export type ConvergentSearchResult = {
  routes: MultistepSynthesisRoute[];
  stats: ConvergentSearchStats;
};

export type ConvergentSearchArgs = {
  startingSmiles: string;
  targetSmiles: string;
  rules: ReactionRule[];
  options: ConvergentSearchOptions;
  /** Builds the public step record from an engine pathway (shared with the linear lane). */
  stepFromPathway: (pathway: ReactionPathway) => SynthesisStep | null;
  signal?: AbortSignal;
  onProgress?: (progress: MultistepSynthesisProgress) => void;
};

type Structure = { smiles: string; canonical: string; connectivity: string; hasSpecifiedStereo: boolean };

type Successor = {
  pathway: ReactionPathway;
  consumedLotIds: string[];
  /** Per reactant component, the lot id or "" for a reagent the rule supplies itself. */
  reactantLotIds: string[];
  products: ProductInput[];
  cost: number;
};

type Frontier = {
  state: PoolState;
  /** Multi-lot rule assignments over the live lots (computed once per state). */
  assignments: RoleAssignment[];
  /** True when some assignment joins lots with no supplied lot in common. */
  independentJoin: boolean;
  /** Independent, carbon-consistent joins; run eagerly as a one-step lookahead. */
  gatedJoins: RoleAssignment[];
  /** One step record per pool step, parallel to state.steps. */
  stepRecords: Array<{ step: SynthesisStep; reactantLotIds: string[] }>;
  rank: number;
};

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

export async function searchConvergentRoutesCore(args: ConvergentSearchArgs): Promise<ConvergentSearchResult> {
  const startedAt = Date.now();
  const { options, rules, signal, onProgress } = args;
  const maxExpansions = positive(options.maxStateExpansions, CONVERGENT_DEFAULTS.maxStateExpansions);
  const maxExecutions = positive(options.maxReactionExecutions, CONVERGENT_DEFAULTS.maxReactionExecutions);
  const maxDepth = positive(options.maxDepth, CONVERGENT_DEFAULTS.maxDepth);
  const maxArity = positive(options.maxArity, CONVERGENT_DEFAULTS.maxArity);
  const maxWallMs = positive(options.maxWallMs, CONVERGENT_DEFAULTS.maxWallMs);
  const maxRoutes = positive(options.maxRoutes, CONVERGENT_DEFAULTS.maxRoutes);
  const perExecution = positive(options.maxPathwaysPerExecution, CONVERGENT_DEFAULTS.maxPathwaysPerExecution);
  const deadline = Math.min(
    startedAt + maxWallMs,
    typeof options.deadline === "number" ? options.deadline : Number.POSITIVE_INFINITY,
  );

  const stats: ConvergentSearchStats = {
    stopReason: "exhausted",
    stateExpansions: 0,
    reactionExecutions: 0,
    cachedExecutionHits: 0,
    statesGenerated: 0,
    duplicateStatesMerged: 0,
    maxDepthReached: 0,
    rejectedRoutes: [],
    elapsedMs: 0,
    retro: null,
  };
  const retroMeta = { meetingsAttempted: 0, chainsCompleted: 0, chainsRejected: 0 };
  const finish = (routes: MultistepSynthesisRoute[], reason?: ConvergentStopReason): ConvergentSearchResult => {
    if (reason) stats.stopReason = reason;
    if (stats.retro) Object.assign(stats.retro, retroMeta);
    stats.elapsedMs = Date.now() - startedAt;
    return { routes, stats };
  };

  const structureCache = new Map<string, Promise<Structure | null>>();
  const structureOf = (smiles: string): Promise<Structure | null> => {
    let pending = structureCache.get(smiles);
    if (!pending) {
      pending = canonicalizeStereoStructure(smiles)
        .then((value) =>
          value
            ? {
                smiles,
                canonical: value.isomeric,
                connectivity: value.connectivity,
                hasSpecifiedStereo: value.hasSpecifiedStereo,
              }
            : null,
        )
        .catch(() => null);
      structureCache.set(smiles, pending);
    }
    return pending;
  };

  const startComponents = splitReactionComponents(args.startingSmiles);
  const targetParts = splitReactionComponents(args.targetSmiles);
  if (startComponents.length < 1 || targetParts.length !== 1) return finish([], "exhausted");
  const target = await structureOf(targetParts[0]);
  if (!target) return finish([], "exhausted");
  const supplied: SuppliedMaterial[] = [];
  for (const component of startComponents) {
    const structure = await structureOf(component);
    if (!structure) return finish([], "exhausted");
    supplied.push(structure);
  }
  if (supplied.some((item) => item.canonical === target.canonical)) return finish([], "exhausted");
  // A convergent route joins at least two lots; with fewer there is nothing to search.
  if (sanitizeCopies(options.startingMaterialCopies, supplied.length).reduce((sum, n) => sum + n, 0) < 2) {
    return finish([], "exhausted");
  }

  const allowGeneric =
    startComponents.some((item) => isGenericReactionSmiles(item)) || isGenericReactionSmiles(targetParts[0]);
  const targetSignature = await getPlanningSignature(target.canonical);
  const targetCarbons = targetSignature?.carbonCount ?? 0;
  const distanceCache = new Map<string, number>();
  const distanceTo = async (canonical: string): Promise<number> => {
    let value = distanceCache.get(canonical);
    if (value === undefined) {
      value = planningSignatureDistance(await getPlanningSignature(canonical), targetSignature);
      distanceCache.set(canonical, value);
    }
    return value;
  };

  const index = new ReactantRoleIndex(rules);
  // Reagents a rule supplies itself (auto presets) may appear among a pathway's
  // reactant components; they are conditions and need no lot.
  const presetsByRule = new Map<string, Set<string>>();
  for (const rule of rules) {
    const presets = new Set<string>();
    for (const requirement of (rule.additionalReactants ?? []).map(resolveReactantRequirement)) {
      if (requirement.supplyMode !== "auto" || !requirement.presetSmiles) continue;
      const structure = await structureOf(requirement.presetSmiles);
      if (structure) presets.add(structure.canonical);
    }
    presetsByRule.set(rule.id, presets);
  }

  // Engine results depend only on the reactant structures and the rule, never on
  // lot ids, so they are shared across every state that holds those species.
  const executionCache = new Map<string, ReactionPathway[]>();
  let budgetHit: ConvergentStopReason | null = null;

  const stopReason = (): ConvergentStopReason | null => {
    if (signal?.aborted) return "cancelled";
    if (Date.now() >= deadline) return "time-budget";
    return budgetHit;
  };

  async function execute(
    cacheKey: string,
    reactantSmiles: string,
    ruleSubset: ReactionRule[],
  ): Promise<ReactionPathway[] | null> {
    const cached = executionCache.get(cacheKey);
    if (cached) {
      stats.cachedExecutionHits += 1;
      return cached;
    }
    if (stats.reactionExecutions >= maxExecutions) {
      budgetHit = "execution-budget";
      return null;
    }
    if (stopReason()) return null;
    stats.reactionExecutions += 1;
    let pathways: ReactionPathway[] = [];
    try {
      pathways = await predictReactionPathwaysFromRules(reactantSmiles, [], ruleSubset, {
        planning: true,
        signal,
      });
    } catch (error) {
      console.error("[PocketChem:Synthesis] Convergent expansion failed for one reactant set; skipping it.", {
        reactantSmiles,
        error,
      });
    }
    const usable = pathways
      .filter((pathway) => pathway.productSmiles && pathway.productStatus !== "concept-only")
      .sort((a, b) => a.planningCost - b.planningCost || a.id.localeCompare(b.id));
    // Cap alternatives (for example regiochemical variants) per rule, never across
    // rules: a global cap would silently drop whole reaction types.
    const perRule = new Map<string, number>();
    const capped = usable.filter((pathway) => {
      const used = perRule.get(pathway.ruleId) ?? 0;
      perRule.set(pathway.ruleId, used + 1);
      return used < perExecution;
    });
    // An aborted run may be partial; never cache it as the true answer.
    if (!signal?.aborted) executionCache.set(cacheKey, capped);
    return capped;
  }

  /** Successors from one set of consumed lots and the pathways the engine gave for it. */
  async function successorsFor(
    lots: PoolLot[],
    ruleId: string,
    pathways: ReactionPathway[],
  ): Promise<Successor[]> {
    const out: Successor[] = [];
    const presets = presetsByRule.get(ruleId) ?? new Set<string>();
    const seenProductSets = new Set<string>();
    const lotCanonicals = lots.map((lot) => lot.canonical).sort();

    for (const pathway of pathways) {
      // Match each reactant the engine consumed to one distinct assigned lot.
      const unused = [...lots];
      const consumedLotIds: string[] = [];
      const reactantLotIds: string[] = [];
      let matched = true;
      for (const component of pathway.reactantComponents) {
        const structure = await structureOf(component);
        const at = structure ? unused.findIndex((lot) => lot.canonical === structure.canonical) : -1;
        if (at >= 0) {
          const [lot] = unused.splice(at, 1);
          consumedLotIds.push(lot.id);
          reactantLotIds.push(lot.id);
        } else if (structure && presets.has(structure.canonical)) {
          reactantLotIds.push("");
        } else {
          matched = false;
          break;
        }
      }
      // The engine must use exactly the lots assigned to it: a pathway that
      // ignores one is a different (smaller) step that has its own entry.
      if (!matched || unused.length > 0 || consumedLotIds.length !== lots.length) continue;

      if (!pathway.productSmiles) continue;
      const productSmiles = splitReactionComponents(pathway.productSmiles);
      const products: ProductInput[] = [];
      for (let position = 0; position < productSmiles.length; position += 1) {
        const smiles = productSmiles[position];
        if (!allowGeneric && isGenericReactionSmiles(smiles)) {
          products.length = 0;
          break;
        }
        const structure = await structureOf(smiles);
        if (!structure) {
          products.length = 0;
          break;
        }
        products.push({ ...structure, role: position === 0 ? "primary" : "coproduct" });
      }
      if (products.length === 0) continue;

      const productKey = products.map((item) => item.canonical).sort();
      if (JSON.stringify(productKey) === JSON.stringify(lotCanonicals)) continue;
      const dedupe = productKey.join(".");
      if (seenProductSets.has(dedupe)) continue;
      seenProductSets.add(dedupe);

      const cost =
        Math.max(0, pathway.planningCost) +
        (pathway.productStatus === "computed" ? 0 : NON_COMPUTED_PENALTY) +
        Math.max(0, products.length - 1) * EXTRA_PRODUCT_PENALTY +
        (pathway.productMixture && pathway.productMixture.memberCount > 1 ? MIXTURE_PENALTY : 0);
      out.push({ pathway, consumedLotIds, reactantLotIds, products, cost });
    }
    return out;
  }

  async function joinInfo(
    state: PoolState,
  ): Promise<{ assignments: RoleAssignment[]; independentJoin: boolean; gatedJoins: RoleAssignment[] }> {
    const live = liveLots(state);
    const indexable: IndexableLot[] = live.map((lot) => ({
      id: lot.id,
      smiles: lot.smiles,
      canonical: lot.canonical,
      equivalenceKey: lotEquivalenceKey(lot, "future"),
    }));
    const assignments = await index.candidateAssignments(indexable, { maxArity });
    const origins = new Map(live.map((lot) => [lot.id, new Set(lotAncestry(state, lot.id).suppliedLotIds)]));
    // Lots with a lot of their own origin in common are not independent branches.
    const carbons = new Map<string, number>();
    for (const lot of live) carbons.set(lot.id, (await getPlanningSignature(lot.canonical))?.carbonCount ?? 0);
    const gatedJoins = assignments.filter((assignment) => {
      // Ordering only: the joined lots must also account for the target's carbon skeleton.
      const total = assignment.lotIds.reduce((sum, id) => sum + (carbons.get(id) ?? 0), 0);
      if (targetCarbons > 0 && total !== targetCarbons) return false;
      const seen = new Set<string>();
      for (const id of assignment.lotIds) {
        for (const origin of origins.get(id) ?? []) {
          if (seen.has(origin)) return false;
          seen.add(origin);
        }
      }
      return true;
    });
    return { assignments, independentJoin: gatedJoins.length > 0, gatedJoins };
  }

  async function expand(frontier: Frontier): Promise<Successor[] | null> {
    const live = liveLots(frontier.state);
    const byId = new Map(live.map((lot) => [lot.id, lot]));
    const out: Successor[] = [];

    // 1. Rules a single lot can run on its own.
    for (const lot of live) {
      const subset = await index.singleLotRules(lot);
      if (subset.length === 0) continue;
      const pathways = await execute(`1|${lot.smiles}`, lot.smiles, subset);
      if (!pathways) return null;
      for (const rule of subset) {
        out.push(
          ...(await successorsFor([lot], rule.id, pathways.filter((item) => item.ruleId === rule.id))),
        );
      }
    }

    // 2. Rules whose reactant roles are filled by several distinct lots.
    for (const assignment of frontier.assignments) {
      const lots = assignment.lotIds.map((id) => byId.get(id) as PoolLot);
      const smiles = lots.map((lot) => lot.smiles).join(".");
      const key = `${assignment.ruleId}|${lots.map((lot) => lot.smiles).join("|")}`;
      const pathways = await execute(key, smiles, [assignment.rule]);
      if (!pathways) return null;
      out.push(...(await successorsFor(lots, assignment.ruleId, pathways)));
    }
    return out;
  }

  /** The produced lot that is `wanted`, if any: exact structure or a known mixture member. */
  async function lotMatching(state: PoolState, producedIds: string[], wanted: Structure): Promise<PoolLot | null> {
    for (const id of producedIds) {
      const lot = lotById(state, id);
      if (!lot) continue;
      if (lot.canonical === wanted.canonical) return lot;
      if (lot.connectivity !== wanted.connectivity || !lot.stereoMixtureMembers?.length) continue;
      for (const member of lot.stereoMixtureMembers) {
        if ((await structureOf(member))?.canonical === wanted.canonical) return lot;
      }
    }
    return null;
  }
  const targetLot = (state: PoolState, producedIds: string[]) => lotMatching(state, producedIds, target!);

  /** Route restricted to the target's ancestry, with lots renumbered to match the replay. */
  function routeFor(frontier: Frontier, lot: PoolLot): MultistepSynthesisRoute | { rejected: string } {
    const { stepNumbers, suppliedLotIds } = lotAncestry(frontier.state, lot.id);
    if (suppliedLotIds.length < 2) return { rejected: "target derives from fewer than two supplied lots (linear)" };
    const joins = stepNumbers.some(
      (number) => frontier.state.steps[number - 1].consumedLotIds.length >= 2,
    );
    if (!joins) return { rejected: "no step joins two lots (linear)" };

    const renumber = new Map(stepNumbers.map((old, position) => [old, position + 1]));
    const remap = (id: string) => {
      const match = /^s(\d+)\.(\d+)$/.exec(id);
      return match ? `s${renumber.get(Number(match[1])) ?? match[1]}.${match[2]}` : id;
    };
    const steps = stepNumbers.map((old, position) => {
      const record = frontier.stepRecords[old - 1];
      return {
        ...record.step,
        id: `${record.step.id}--convergent-${position + 1}`,
        stepNumber: position + 1,
        reactantLotIds: record.reactantLotIds.map(remap),
      };
    });
    const digest = steps.map((step) => step.ruleId).join(">");
    return {
      id: `convergent-route-${digest}-${steps.length}`,
      startingSmiles: startComponents.join("."),
      targetSmiles: targetParts[0],
      steps,
      confidence: "verified",
      score: frontier.state.pathCost,
    };
  }

  async function makeNext(
    current: Frontier,
    successor: Successor,
    /** Retro chains must not shelve lots a later step still needs. */
    keepAllLots = false,
  ): Promise<{ next: Frontier; budgeted: PoolState; hit: PoolLot | null; producedIds: string[] } | null> {
    const applied = applyStep(current.state, {
      ruleId: successor.pathway.ruleId,
      consumedLotIds: successor.consumedLotIds,
      products: successor.products,
      stepMixture: successor.pathway.productMixture
        ? {
            kind: successor.pathway.productMixture.kind,
            memberSmiles: successor.pathway.productMixture.memberSmiles,
          }
        : null,
      cost: successor.cost,
    });
    if (!applied.ok) return null;
    const step = args.stepFromPathway(successor.pathway);
    if (!step) return null;
    const keepScores = new Map<string, number>();
    for (const lot of liveLots(applied.state)) keepScores.set(lot.id, -(await distanceTo(lot.canonical)));
    const budgeted = keepAllLots
      ? applied.state
      : enforceBudget(
          applied.state,
          {
            maxLiveLots: positive(options.maxLiveLots, CONVERGENT_DEFAULTS.maxLiveLots),
            maxLiveCoproducts: positive(options.maxLiveCoproducts, CONVERGENT_DEFAULTS.maxLiveCoproducts),
          },
          (lot) => keepScores.get(lot.id) ?? 0,
        ).state;
    const next: Frontier = {
      state: budgeted,
      stepRecords: [...current.stepRecords, { step, reactantLotIds: successor.reactantLotIds }],
      rank: 0,
      assignments: [],
      independentJoin: false,
      gatedJoins: [],
    };
    return { next, budgeted, hit: await targetLot(budgeted, applied.producedLotIds), producedIds: applied.producedLotIds };
  }

  /** Builds, replays and (only if the replay holds) records a route ending at `hit`. */
  async function acceptHit(next: Frontier, hit: PoolLot): Promise<void> {
    const route = routeFor(next, hit);
    if ("rejected" in route) {
      stats.rejectedRoutes.push({ reason: route.rejected, steps: next.state.steps.length });
      return;
    }
    if (foundIds.has(route.id)) return;
    const verification = await verifyMultistepRoute(route, rules, {
      startingMaterialCopies: [...initial.suppliedCopies],
    });
    if (verification.status === "failed") {
      stats.rejectedRoutes.push({
        reason: `replay failed: ${verification.problems[0] ?? "unknown"}`,
        steps: route.steps.length,
      });
      return;
    }
    foundIds.add(route.id);
    found.push({
      ...route,
      confidence: verification.status === "verified" ? "verified" : "connectivity-verified",
      verification,
    });
  }

  /**
   * One-step lookahead: run the independent, carbon-consistent joins of a new
   * state now, so a route is recognised when its last coupling becomes possible
   * instead of after the state is popped. Same cache, budgets and verification.
   */
  async function lookahead(state: Frontier): Promise<void> {
    if (state.state.steps.length + 1 > maxDepth) return;
    const byId = new Map(liveLots(state.state).map((lot) => [lot.id, lot]));
    for (const assignment of state.gatedJoins) {
      if (stopReason()) return;
      const lots = assignment.lotIds.map((id) => byId.get(id) as PoolLot);
      const key = `${assignment.ruleId}|${lots.map((lot) => lot.smiles).join("|")}`;
      const pathways = await execute(key, lots.map((lot) => lot.smiles).join("."), [assignment.rule]);
      if (!pathways) return;
      for (const successor of await successorsFor(lots, assignment.ruleId, pathways)) {
        const made = await makeNext(state, successor);
        if (made?.hit) await acceptHit(made.next, made.hit);
      }
    }
  }

  const initial = createPoolState(supplied, options.startingMaterialCopies);
  const open: Frontier[] = [{ state: initial, stepRecords: [], rank: 0, ...(await joinInfo(initial)) }];
  const bestCost = new Map<string, number>([[stateKey(initial), 0]]);
  const found: MultistepSynthesisRoute[] = [];
  const foundIds = new Set<string>();

  // ---- Bidirectional (opt-in): retro goal sets matched against forward states ----
  const retroOptions = typeof options.bidirectional === "object" ? options.bidirectional : {};
  const bidirectional = Boolean(options.bidirectional);
  const retroStates: RetroState[] = [];
  const retroTried = new Set<string>();
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const RETRO_MATCH_BONUS = 60;

  /** How a live lot can stand in for a goal. Connectivity-only fits are still replayed. */
  function fitKind(lot: PoolLot, goal: RetroStructure): "exact" | "mixture-member" | "connectivity" | null {
    if (lot.canonical === goal.canonical) return "exact";
    if (lot.connectivity !== goal.connectivity) return null;
    if (lot.stereoMixtureMembers?.includes(goal.smiles)) return "mixture-member";
    return goal.hasSpecifiedStereo ? null : "connectivity";
  }

  /** Assigns every goal a distinct live lot (inventory: one lot per goal), or null. */
  function matchGoals(state: PoolState, goals: RetroState["goals"]): Map<string, string> | null {
    const live = liveLots(state);
    if (goals.length > live.length) return null;
    const fits = goals.map((goal) => live.filter((lot) => fitKind(lot, goal) !== null).map((lot) => lot.id));
    if (fits.some((list) => list.length === 0)) return null;
    const used = new Set<string>();
    const chosen = new Map<string, string>();
    const place = (position: number): boolean => {
      if (position === goals.length) return true;
      for (const id of fits[position]) {
        if (used.has(id)) continue;
        used.add(id);
        chosen.set(goals[position].id, id);
        if (place(position + 1)) return true;
        used.delete(id);
        chosen.delete(goals[position].id);
      }
      return false;
    };
    return place(0) ? chosen : null;
  }

  /** Ordering only: how many goals of the best retro state this state already holds. */
  function retroProgress(state: PoolState): number {
    if (retroStates.length === 0) return 0;
    const live = liveLots(state);
    let best = 0;
    for (const retro of retroStates) {
      const taken = new Set<string>();
      let count = 0;
      for (const goal of retro.goals) {
        const lot = live.find((item) => !taken.has(item.id) && fitKind(item, goal) !== null);
        if (lot) {
          taken.add(lot.id);
          count += 1;
        }
      }
      best = Math.max(best, count);
    }
    return best;
  }

  /**
   * Replays a retro chain forward from `base`: deepest disconnection first, each
   * through the real engine on the matched lots. A chain whose step the engine
   * does not reproduce (missing reactant, wrong product) is dropped. The final
   * route still goes through acceptHit's end-to-end replay.
   */
  async function completeChain(base: Frontier, retro: RetroState, assigned: Map<string, string>): Promise<void> {
    let frontier = base;
    const lotOfGoal = new Map(assigned);
    for (const step of [...retro.disconnections].reverse()) {
      const rule = rulesById.get(step.ruleId);
      const byId = new Map(liveLots(frontier.state).map((lot) => [lot.id, lot]));
      const lots = step.consumesGoalIds.map((id) => byId.get(lotOfGoal.get(id) ?? ""));
      if (!rule || lots.some((lot) => !lot)) {
        retroMeta.chainsRejected += 1;
        return;
      }
      const used = lots as PoolLot[];
      const key = `${rule.id}|${used.map((lot) => lot.smiles).join("|")}`;
      const pathways = await execute(key, used.map((lot) => lot.smiles).join("."), [rule]);
      if (!pathways) return;
      let advanced = false;
      for (const successor of await successorsFor(used, rule.id, pathways)) {
        const made = await makeNext(frontier, successor, true);
        if (!made) continue;
        const lot = await lotMatching(made.budgeted, made.producedIds, step.producesGoal);
        if (!lot) continue;
        lotOfGoal.set(step.producesGoalId, lot.id);
        frontier = made.next;
        advanced = true;
        break;
      }
      if (!advanced) {
        retroMeta.chainsRejected += 1;
        return;
      }
    }
    retroMeta.chainsCompleted += 1;
    const finalId = lotOfGoal.get("g0");
    const hit = finalId ? await lotMatching(frontier.state, [finalId], target!) : null;
    if (hit) await acceptHit(frontier, hit);
    else retroMeta.chainsRejected += 1;
  }

  /** Tries every known retro goal set whose goals the forward state can supply. */
  async function tryMeetings(frontier: Frontier, retroList: RetroState[]): Promise<void> {
    const forwardKey = stateKey(frontier.state, "future");
    for (const retro of retroList) {
      if (found.length > 0 || stopReason()) return;
      const pair = `${retro.key}|${forwardKey}`;
      if (retroTried.has(pair)) continue;
      retroTried.add(pair);
      const assigned = matchGoals(frontier.state, retro.goals);
      if (!assigned) continue;
      retroMeta.meetingsAttempted += 1;
      await completeChain(frontier, retro, assigned);
    }
  }

  // Forward species reached so far (ordering input for the retro side) and every
  // forward frontier a newly found retro goal set can be matched against.
  const reached = new Set<string>(initial.lots.map((lot) => lot.canonical));
  const frontiers: Frontier[] = [open[0]];
  let retro: RetroSearch | null = null;
  if (bidirectional) {
    const copies = sanitizeCopies(options.startingMaterialCopies, supplied.length);
    retro = createRetroSearch({
      target,
      rules,
      supplied: supplied.map((item, at) => ({ ...item, copies: copies[at] })),
      structureOf,
      presetsFor: (ruleId) => presetsByRule.get(ruleId) ?? new Set<string>(),
      allowGeneric,
      limits: {
        maxRetroExpansions: positive(retroOptions.maxRetroExpansions, RETRO_DEFAULTS.maxRetroExpansions),
        maxRetroCalls: positive(retroOptions.maxRetroCalls, RETRO_DEFAULTS.maxRetroCalls),
        maxRetroDepth: positive(retroOptions.maxRetroDepth, RETRO_DEFAULTS.maxRetroDepth),
        maxResultsPerGoal: positive(retroOptions.maxResultsPerGoal, RETRO_DEFAULTS.maxResultsPerGoal),
        maxGoals: positive(retroOptions.maxGoals, RETRO_DEFAULTS.maxGoals),
      },
      haltReason: () => (signal?.aborted ? "cancelled" : Date.now() >= deadline ? "time-budget" : null),
      signal,
    });
    stats.retro = { ...retro.stats, ...retroMeta };
  }

  /** One retro expansion; its new goal sets are matched against every forward frontier so far. */
  async function advanceRetro(): Promise<boolean> {
    if (!retro) return false;
    const fresh = await retro.step(reached);
    stats.retro = { ...retro.stats, ...retroMeta };
    if (!fresh) return false;
    for (const state of fresh) {
      retroStates.push(state);
      for (const frontier of frontiers) {
        if (found.length > 0 || stopReason()) return true;
        await tryMeetings(frontier, [state]);
      }
    }
    return true;
  }
  if (retro) await advanceRetro();
  if (found.length > 0) return finish(found, "found");

  while (open.length > 0) {
    const halt = stopReason();
    if (halt) return finish(found, found.length > 0 ? "found" : halt);
    if (stats.stateExpansions >= maxExpansions) return finish(found, found.length > 0 ? "found" : "expansion-budget");

    if (retro && retro.stats.stopReason === "running") {
      await advanceRetro();
      if (found.length > 0) return finish(found, "found");
    }
    let best = 0;
    for (let at = 1; at < open.length; at += 1) if (open[at].rank < open[best].rank) best = at;
    const current = open.splice(best, 1)[0];
    if (current.state.steps.length >= maxDepth) continue;

    stats.stateExpansions += 1;
    stats.maxDepthReached = Math.max(stats.maxDepthReached, current.state.steps.length + 1);
    onProgress?.({
      phase: "forward",
      depth: current.state.steps.length + 1,
      maxSteps: maxDepth,
      processed: stats.stateExpansions,
      total: maxExpansions,
      candidateCount: open.length,
      percent: Math.min(99, Math.round((stats.stateExpansions / maxExpansions) * 100)),
    });

    const successors = await expand(current);
    if (successors === null) {
      // A budget, deadline or abort fired mid-expansion; keep only what is proven.
      return finish(found, found.length > 0 ? "found" : (stopReason() ?? "execution-budget"));
    }

    for (const successor of successors) {
      const made = await makeNext(current, successor);
      if (!made) continue;
      const { next, budgeted } = made;
      stats.statesGenerated += 1;
      if (made.hit) {
        await acceptHit(next, made.hit);
        continue;
      }

      const key = stateKey(budgeted, "future");
      const seen = bestCost.get(key);
      if (seen !== undefined && seen <= budgeted.pathCost) {
        stats.duplicateStatesMerged += 1;
        continue;
      }
      bestCost.set(key, budgeted.pathCost);
      let heuristic = Number.POSITIVE_INFINITY;
      for (const lot of liveLots(budgeted)) heuristic = Math.min(heuristic, await distanceTo(lot.canonical));
      Object.assign(next, await joinInfo(budgeted));
      for (const lot of liveLots(budgeted)) reached.add(lot.canonical);
      frontiers.push(next);
      await lookahead(next);
      if (bidirectional && found.length === 0) await tryMeetings(next, retroStates);
      next.rank =
        budgeted.pathCost +
        (Number.isFinite(heuristic) ? heuristic : 0) * PLANNING_HEURISTIC_SCALE -
        (next.independentJoin ? INDEPENDENT_JOIN_BONUS : 0) -
        (bidirectional ? retroProgress(budgeted) * RETRO_MATCH_BONUS : 0);
      open.push(next);
    }

    if (found.length >= maxRoutes) return finish(found, "found");
    // A hit ends the search after the state that produced it has been fully
    // expanded; deeper exploration is the linear search's job.
    if (found.length > 0) return finish(found, "found");
  }
  // The forward frontier ran dry: let the retro side use what budget it has left,
  // matching its goal sets against everything the forward side reached.
  while (found.length === 0 && retro && retro.stats.stopReason === "running") {
    if (!(await advanceRetro())) break;
  }
  if (found.length > 0) return finish(found, "found");
  const retroHalt = retro && retro.stats.stopReason !== "running" ? retro.stats.stopReason : null;
  if (retroHalt === "time-budget" || retroHalt === "cancelled") return finish(found, retroHalt);
  if (retroHalt === "expansion-budget" || retroHalt === "call-budget") {
    return finish(found, "retro-budget");
  }
  return finish(found, "exhausted");
}
