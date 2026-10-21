/**
 * Search-result collector for the adaptive synthesis search (Stage 8A-1).
 *
 * The book admits only routes that passed end-to-end replay ("verified" or
 * "connectivity-only"), removes duplicates by chemical identity, keeps a small ranked
 * list, and ignores everything offered after it was closed (a stale or cancelled run
 * can never add to a newer result).
 *
 * Ranking preserves the distinctions the verifier makes; it never merges them:
 *   tier 0  verified, exact target structure
 *   tier 1  verified, target equals a member of a known stereo mixture
 *   tier 2  connectivity-only (stereochemistry differs or is unspecified)
 * Within a tier routes are ordered by compatibility-adjusted length (Stage 7 prices
 * advisory findings into the step count), then by how much of the route could be
 * assessed, then by discovery order. "Unassessed" stays unknown: it is neither
 * counted as a problem nor as compatible. Nothing here claims a route is the
 * shortest or optimal; the list is the best found within the computational budget.
 *
 * Starting materials a route never uses are reported, not penalised: a valid
 * synthesis does not have to consume everything that was supplied.
 */
import type { MultistepSynthesisRoute, SynthesisStep } from "../reactionTypes";
import { compatibilityAdjustedLength } from "./compatibility";

export type RouteTier = 0 | 1 | 2;

export type CompatibilityClass =
  | "model-constraint"
  | "plausible"
  /** Every step was assessed and none produced a finding. */
  | "no-findings"
  /** No finding, but some steps have no condition metadata. */
  | "partly-unassessed"
  | "unassessed"
  /** The route carries no compatibility summary at all. */
  | "not-evaluated";

export type RankedRoute = {
  route: MultistepSynthesisRoute;
  /** Chemical identity; equal keys are the same route. */
  key: string;
  tier: RouteTier;
  adjustedLength: number;
  compatibility: CompatibilityClass;
  unassessedSteps: number;
  /** Supplied materials the route never consumed (informational only). */
  unusedStartingMaterials: string[];
  /** Id of the lane that first reported it. */
  lane: string;
  /** Discovery sequence number (1-based). */
  order: number;
};

export type OfferOutcome = "added" | "replaced-duplicate" | "duplicate" | "not-verified" | "below-cap" | "closed";

function stepSignature(step: SynthesisStep): string {
  return [
    step.ruleId,
    step.reagentLabel,
    [...step.reactantComponents].sort().join("."),
    [...step.productComponents].sort().join("."),
  ].join("|");
}

/**
 * Identity of a route: the set of reactions (rule, reagent label, exact isomeric
 * species in and out), how the steps depend on each other, and which supplied lot
 * each step consumed. Step numbering and the order of independent steps do not
 * matter; a different rule, reagent, stereoisomer, dependency or inventory
 * provenance does.
 */
export function routeIdentityKey(route: MultistepSynthesisRoute): string {
  const bySignature = new Map<number, string>();
  for (const step of route.steps) bySignature.set(step.stepNumber, stepSignature(step));
  const parts: string[] = [...bySignature.values()].map((signature) => `step:${signature}`);
  const verification = route.verification;
  for (const dependency of verification?.stepDependencies ?? []) {
    const own = bySignature.get(dependency.stepNumber);
    if (!own) continue;
    const upstream = dependency.dependsOnSteps
      .map((number) => bySignature.get(number) ?? `#${number}`)
      .sort()
      .join(",");
    parts.push(`dep:${own}<-${upstream}`);
  }
  for (const entry of verification?.inventory ?? []) {
    entry.consumedByStep.forEach((stepNumber) => {
      if (stepNumber === null) return;
      parts.push(`lot:${entry.startIndex}:${entry.smiles}->${bySignature.get(stepNumber) ?? `#${stepNumber}`}`);
    });
  }
  parts.sort();
  return parts.join("\n");
}

function compatibilityClass(route: MultistepSynthesisRoute): { label: CompatibilityClass; unassessedSteps: number } {
  const summary = route.compatibility;
  if (!summary) return { label: "not-evaluated", unassessedSteps: route.steps.length };
  const unassessed = new Set(summary.unassessedRuleIds);
  const unassessedSteps = route.steps.filter((step) => unassessed.has(step.ruleId)).length;
  if (summary.worst === "model-constraint") return { label: "model-constraint", unassessedSteps };
  if (summary.worst === "plausible") return { label: "plausible", unassessedSteps };
  if (unassessedSteps === 0) return { label: "no-findings", unassessedSteps };
  if (unassessedSteps >= route.steps.length) return { label: "unassessed", unassessedSteps };
  return { label: "partly-unassessed", unassessedSteps };
}

/** Null for a route that did not pass replay (failed, or never replayed). */
export function classifyRoute(
  route: MultistepSynthesisRoute,
  lane: string,
  order: number,
): RankedRoute | null {
  const verification = route.verification;
  if (!verification || verification.status === "failed") return null;
  let tier: RouteTier;
  if (verification.status === "connectivity-only") tier = 2;
  else tier = verification.targetMatch === "mixture-member" ? 1 : 0;
  const { label, unassessedSteps } = compatibilityClass(route);
  return {
    route,
    key: routeIdentityKey(route),
    tier,
    adjustedLength: compatibilityAdjustedLength(route.steps),
    compatibility: label,
    unassessedSteps,
    unusedStartingMaterials: [...verification.unusedStartingMaterials],
    lane,
    order,
  };
}

export function compareRanked(a: RankedRoute, b: RankedRoute): number {
  return (
    a.tier - b.tier ||
    a.adjustedLength - b.adjustedLength ||
    a.unassessedSteps - b.unassessedSteps ||
    a.order - b.order
  );
}

/**
 * A route the search can stop improving on its own account: verified at least to a
 * known mixture member, with no model-constraint finding. (A route with unassessed
 * steps can still be adequate; unassessed is unknown, not a defect.)
 */
export function isAdequate(entry: RankedRoute): boolean {
  return entry.tier < 2 && entry.compatibility !== "model-constraint";
}

/** Could another route plausibly rank better than this one on checkable grounds? */
export function isImprovable(entry: RankedRoute): boolean {
  return !isAdequate(entry) || entry.compatibility === "plausible";
}

export class RouteBook {
  private items: RankedRoute[] = [];
  private sequence = 0;
  private closed = false;
  /** Offers received after close(); reported so a stale run is visible in tests/logs. */
  lateOffers = 0;
  private readonly cap: number;

  constructor(cap = 5) {
    this.cap = cap;
  }

  offer(route: MultistepSynthesisRoute, lane: string): { outcome: OfferOutcome; entry?: RankedRoute } {
    if (this.closed) {
      this.lateOffers += 1;
      return { outcome: "closed" };
    }
    const entry = classifyRoute(route, lane, this.sequence + 1);
    if (!entry) return { outcome: "not-verified" };
    this.sequence += 1;
    const existing = this.items.findIndex((item) => item.key === entry.key);
    if (existing >= 0) {
      if (compareRanked(entry, this.items[existing]) < 0) {
        this.items[existing] = { ...entry, order: this.items[existing].order };
        this.items.sort(compareRanked);
        return { outcome: "replaced-duplicate", entry: this.items.find((item) => item.key === entry.key) };
      }
      return { outcome: "duplicate" };
    }
    this.items.push(entry);
    this.items.sort(compareRanked);
    if (this.items.length > this.cap) {
      const dropped = this.items.pop();
      if (dropped === entry) return { outcome: "below-cap" };
    }
    return { outcome: "added", entry };
  }

  /** Ranked best-first. */
  entries(): RankedRoute[] {
    return [...this.items];
  }

  best(): RankedRoute | undefined {
    return this.items[0];
  }

  size(): number {
    return this.items.length;
  }

  /** After close(), further offers are ignored. */
  close(): void {
    this.closed = true;
  }
}
