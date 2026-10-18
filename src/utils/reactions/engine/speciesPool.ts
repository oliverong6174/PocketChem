import type { ReactionProductMixtureKind } from "../reactionTypes";

/**
 * Species-pool state for convergent synthesis planning (Phase 4, Stage 2).
 *
 * ISOLATED FOUNDATION: nothing in the production search imports this module.
 * It is pure data and pure functions (no RDKit, no engine calls) so it can be
 * unit-tested exhaustively before any planner integration.
 *
 * Model. A state is a shelf of isolated compounds ("lots"), not a one-pot
 * mixture: each step takes some lots off the shelf, runs one rule on exactly
 * those lots, and puts the products back. Lots not named by a step are
 * spectators and are untouched.
 *
 * - Every copy of every supplied material is its own lot, so inventory is
 *   simply "which supplied lots are still live".
 * - Products and coproducts are lots too. A coproduct is never discarded by a
 *   size heuristic; it is a lot with `role: "coproduct"` and an explicit
 *   availability. Complexity is controlled by budgets (see enforceBudget).
 * - A copy is a qualitative availability count. There are no amounts,
 *   equivalents or yields here, and nothing in this module can compute a
 *   limiting reactant.
 *
 * Lot ids are compatible with routeVerification.ts: supplied copies are
 * `sm<componentIndex>#<copy>` and products are `s<stepNumber>.<n>`, where the
 * step number is the position in the dependency-ordered step list.
 */

export type PoolAvailability = "live" | "shelved" | "consumed";
export type LotRole = "supplied" | "primary" | "coproduct";

export type LotProvenance =
  | { kind: "supplied"; startIndex: number; copy: number }
  | { kind: "product"; step: number; ruleId: string; consumedLotIds: string[] };

export type PoolLot = {
  id: string;
  smiles: string;
  canonical: string;
  connectivity: string;
  hasSpecifiedStereo: boolean;
  /** Set when the lot is one member (or descends from one) of a stereo mixture. */
  stereoMixture: ReactionProductMixtureKind | null;
  /** Exact isomeric members of that mixture when the step reported them. */
  stereoMixtureMembers: string[] | null;
  role: LotRole;
  availability: PoolAvailability;
  provenance: LotProvenance;
  /** Indices of the supplied components this lot descends from, ascending. */
  lineage: number[];
  consumedByStep: number | null;
};

export type PoolStep = {
  stepNumber: number;
  ruleId: string;
  consumedLotIds: string[];
  producedLotIds: string[];
  cost: number;
};

export type PoolState = {
  lots: readonly PoolLot[];
  steps: readonly PoolStep[];
  /** Copies supplied per component, in component order. */
  suppliedCopies: readonly number[];
  pathCost: number;
};

export type SuppliedMaterial = {
  smiles: string;
  canonical: string;
  connectivity: string;
  hasSpecifiedStereo: boolean;
};

export type ProductInput = {
  smiles: string;
  canonical: string;
  connectivity: string;
  hasSpecifiedStereo: boolean;
  role?: "primary" | "coproduct";
  /** Defaults to "live": every generated species stays available unless a budget shelves it. */
  availability?: "live" | "shelved";
};

export type StepInput = {
  ruleId: string;
  consumedLotIds: string[];
  products: ProductInput[];
  /** The mixture the rule itself reported for its products, if any. */
  stepMixture?: { kind: ReactionProductMixtureKind; memberSmiles: string[] } | null;
  cost?: number;
};

export type ApplyStepFailure =
  | "no-reactants"
  | "no-products"
  | "unknown-lot"
  | "lot-not-live"
  | "duplicate-lot";

export type ApplyStepResult =
  | { ok: true; state: PoolState; producedLotIds: string[] }
  | { ok: false; reason: ApplyStepFailure; detail: string };

/** Counts below 1 or non-integers fall back to one copy, as in route verification. */
export function sanitizeCopies(
  copies: number | readonly number[] | undefined,
  componentCount: number,
): number[] {
  return Array.from({ length: componentCount }, (_unused, index) => {
    const value = Array.isArray(copies) ? copies[index] : (copies as number | undefined);
    return Number.isInteger(value) && (value as number) >= 1 ? (value as number) : 1;
  });
}

export function createPoolState(
  materials: readonly SuppliedMaterial[],
  copies?: number | readonly number[],
): PoolState {
  const suppliedCopies = sanitizeCopies(copies, materials.length);
  const lots: PoolLot[] = [];
  materials.forEach((material, startIndex) => {
    for (let copy = 1; copy <= suppliedCopies[startIndex]; copy += 1) {
      lots.push({
        id: `sm${startIndex}#${copy}`,
        smiles: material.smiles,
        canonical: material.canonical,
        connectivity: material.connectivity,
        hasSpecifiedStereo: material.hasSpecifiedStereo,
        stereoMixture: null,
        stereoMixtureMembers: null,
        role: "supplied",
        availability: "live",
        provenance: { kind: "supplied", startIndex, copy },
        lineage: [startIndex],
        consumedByStep: null,
      });
    }
  });
  return { lots, steps: [], suppliedCopies, pathCost: 0 };
}

export function lotById(state: PoolState, id: string): PoolLot | undefined {
  return state.lots.find((lot) => lot.id === id);
}

/** Lots that exist on the shelf, whether or not a budget currently offers them for expansion. */
export function presentLots(state: PoolState): PoolLot[] {
  return state.lots.filter((lot) => lot.availability !== "consumed");
}

/** Lots a step may consume. */
export function liveLots(state: PoolState): PoolLot[] {
  return state.lots.filter((lot) => lot.availability === "live");
}

export type SupplyAccount = {
  startIndex: number;
  total: number;
  remaining: number;
  consumed: number;
};

export function supplyAccounts(state: PoolState): SupplyAccount[] {
  return state.suppliedCopies.map((total, startIndex) => {
    const remaining = state.lots.filter(
      (lot) =>
        lot.provenance.kind === "supplied" &&
        lot.provenance.startIndex === startIndex &&
        lot.availability !== "consumed",
    ).length;
    return { startIndex, total, remaining, consumed: total - remaining };
  });
}

/**
 * Mixture status a product inherits from the lots that made it.
 *
 * Mirrors the single-parent rule in multistepSynthesis.propagatedStereoMixture
 * and extends it to several parents: if a step reports its own mixture that
 * wins; otherwise a product with stereo made from a mixture lot stays a
 * mixture, and two or more mixture parents can only be called generically
 * "stereoisomeric". A product with no specified stereo is never a mixture.
 */
export function inheritedMixture(
  consumed: readonly PoolLot[],
  product: Pick<ProductInput, "hasSpecifiedStereo">,
  stepMixture: StepInput["stepMixture"],
): { kind: ReactionProductMixtureKind | null; members: string[] | null } {
  if (!product.hasSpecifiedStereo) return { kind: null, members: null };
  if (stepMixture) return { kind: stepMixture.kind, members: [...stepMixture.memberSmiles] };

  const parents = consumed.filter((lot) => lot.stereoMixture !== null);
  if (parents.length === 0) return { kind: null, members: null };
  if (parents.length > 1) return { kind: "stereoisomeric", members: null };
  const only = parents[0].stereoMixture as ReactionProductMixtureKind;
  return { kind: only === "racemic" ? "stereoisomeric" : only, members: null };
}

export function applyStep(state: PoolState, input: StepInput): ApplyStepResult {
  if (input.consumedLotIds.length === 0) {
    return { ok: false, reason: "no-reactants", detail: "A step must consume at least one lot." };
  }
  if (input.products.length === 0) {
    return { ok: false, reason: "no-products", detail: "A step must produce at least one species." };
  }
  if (new Set(input.consumedLotIds).size !== input.consumedLotIds.length) {
    return { ok: false, reason: "duplicate-lot", detail: "A lot cannot fill two reactant roles." };
  }

  const consumed: PoolLot[] = [];
  for (const id of input.consumedLotIds) {
    const lot = lotById(state, id);
    if (!lot) return { ok: false, reason: "unknown-lot", detail: `Lot ${id} does not exist.` };
    if (lot.availability !== "live") {
      return {
        ok: false,
        reason: "lot-not-live",
        detail:
          lot.availability === "consumed"
            ? `Lot ${id} was already consumed by step ${lot.consumedByStep}.`
            : `Lot ${id} is shelved by a budget and cannot be consumed.`,
      };
    }
    consumed.push(lot);
  }

  const stepNumber = state.steps.length + 1;
  const lineage = [...new Set(consumed.flatMap((lot) => lot.lineage))].sort((a, b) => a - b);
  const consumedIds = new Set(input.consumedLotIds);
  const produced: PoolLot[] = input.products.map((product, index) => {
    const mixture = inheritedMixture(consumed, product, input.stepMixture);
    return {
      id: `s${stepNumber}.${index + 1}`,
      smiles: product.smiles,
      canonical: product.canonical,
      connectivity: product.connectivity,
      hasSpecifiedStereo: product.hasSpecifiedStereo,
      stereoMixture: mixture.kind,
      stereoMixtureMembers: mixture.members,
      role: product.role ?? "primary",
      availability: product.availability ?? "live",
      provenance: {
        kind: "product",
        step: stepNumber,
        ruleId: input.ruleId,
        consumedLotIds: [...input.consumedLotIds],
      },
      lineage,
      consumedByStep: null,
    };
  });

  const step: PoolStep = {
    stepNumber,
    ruleId: input.ruleId,
    consumedLotIds: [...input.consumedLotIds],
    producedLotIds: produced.map((lot) => lot.id),
    cost: input.cost ?? 0,
  };
  const next: PoolState = {
    lots: [
      ...state.lots.map((lot) =>
        consumedIds.has(lot.id)
          ? { ...lot, availability: "consumed" as const, consumedByStep: stepNumber }
          : lot,
      ),
      ...produced,
    ],
    steps: [...state.steps, step],
    suppliedCopies: state.suppliedCopies,
    pathCost: state.pathCost + step.cost,
  };
  return { ok: true, state: next, producedLotIds: step.producedLotIds };
}

/**
 * - "future" (default): two states are equal when every later step is equally
 *   possible. Order of earlier steps, lot ids, step numbers and which
 *   equivalent supplied copy was used are ignored; structure, mixture status,
 *   availability and the number of copies still on the shelf are not.
 * - "history": additionally separates lots by role and by the supplied
 *   materials they descend from, so routes with different material
 *   attribution are kept apart when that matters for reporting.
 */
export type StateKeyMode = "future" | "history";

/** The part of a lot that decides what later steps can do with it (see StateKeyMode). */
export function lotEquivalenceKey(lot: PoolLot, mode: StateKeyMode = "future"): string {
  const members = lot.stereoMixtureMembers ? [...lot.stereoMixtureMembers].sort().join(",") : "-";
  const base = `${lot.canonical}|${lot.stereoMixture ?? "-"}|${members}|${lot.availability}`;
  return mode === "history" ? `${base}|${lot.role}|L${lot.lineage.join(".")}` : base;
}

export function stateKey(state: PoolState, mode: StateKeyMode = "future"): string {
  return presentLots(state)
    .map((lot) => lotEquivalenceKey(lot, mode))
    .sort()
    .join("\n");
}

export type PoolBudget = {
  /** Most lots that may stay expandable at once. Supplied lots are never shelved. */
  maxLiveLots?: number;
  maxLiveCoproducts?: number;
};

export type BudgetResult = { state: PoolState; shelvedLotIds: string[] };

/**
 * Keeps the number of expandable lots within a budget by shelving (never
 * deleting) generated lots. A shelved lot remains on the shelf, still counts
 * toward the state key and still appears in route reporting; it is merely not
 * offered to further steps. Size is never used: the caller's `keepScore`
 * (higher = keep) decides, with coproducts shelved before primary products and
 * newer lots before older ones among equals. Supplied lots are never shelved
 * because that would silently change the inventory.
 */
export function enforceBudget(
  state: PoolState,
  budget: PoolBudget,
  keepScore: (lot: PoolLot) => number = () => 0,
): BudgetResult {
  const shelve = new Set<string>();
  const order = (a: PoolLot, b: PoolLot) =>
    keepScore(a) - keepScore(b) ||
    (a.role === "coproduct" ? 0 : 1) - (b.role === "coproduct" ? 0 : 1) ||
    (b.provenance.kind === "product" ? b.provenance.step : 0) -
      (a.provenance.kind === "product" ? a.provenance.step : 0) ||
    a.id.localeCompare(b.id);

  const generatedLive = () =>
    liveLots(state)
      .filter((lot) => lot.role !== "supplied" && !shelve.has(lot.id))
      .sort(order);

  if (budget.maxLiveCoproducts !== undefined) {
    const coproducts = generatedLive().filter((lot) => lot.role === "coproduct");
    for (const lot of coproducts.slice(0, Math.max(0, coproducts.length - budget.maxLiveCoproducts))) {
      shelve.add(lot.id);
    }
  }
  if (budget.maxLiveLots !== undefined) {
    const liveCount = () => liveLots(state).filter((lot) => !shelve.has(lot.id)).length;
    for (const lot of generatedLive()) {
      if (liveCount() <= budget.maxLiveLots) break;
      shelve.add(lot.id);
    }
  }
  if (shelve.size === 0) return { state, shelvedLotIds: [] };
  return {
    state: {
      ...state,
      lots: state.lots.map((lot) =>
        shelve.has(lot.id) ? { ...lot, availability: "shelved" as const } : lot,
      ),
    },
    shelvedLotIds: [...shelve].sort(),
  };
}

/** Steps that produced a lot, directly or through its ancestors, plus the supplied lots it came from. */
export function lotAncestry(
  state: PoolState,
  lotId: string,
): { stepNumbers: number[]; suppliedLotIds: string[] } {
  const steps = new Set<number>();
  const supplied = new Set<string>();
  const visit = (id: string) => {
    const lot = lotById(state, id);
    if (!lot) return;
    if (lot.provenance.kind === "supplied") {
      supplied.add(lot.id);
      return;
    }
    if (steps.has(lot.provenance.step)) return;
    steps.add(lot.provenance.step);
    lot.provenance.consumedLotIds.forEach(visit);
  };
  visit(lotId);
  return { stepNumbers: [...steps].sort((a, b) => a - b), suppliedLotIds: [...supplied].sort() };
}
