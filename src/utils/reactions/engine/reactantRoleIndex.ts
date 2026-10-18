import type { ReactionComponent, ReactionRule, ReactantSupplyMode } from "../reactionTypes";
import { analyzeReactionComponents } from "./reactionInput";
import {
  filterRulesMatchingReactant,
  ruleMatchesReactant,
  triggerMatchesReactant,
} from "./ruleMatcher";

/**
 * Reactant-role index for multi-reactant rules (Phase 4, Stage 2).
 *
 * ISOLATED FOUNDATION: not imported by the production search. It answers one
 * question cheaply and with cached results: "which rules could these lots
 * fill, and in which roles?" so a later planner only calls the (expensive)
 * reaction engine on rule subsets and lot tuples that can possibly react.
 *
 * It deliberately reuses the engine's own matching primitives
 * (ruleMatchesReactant / triggerMatchesReactant / filterRulesMatchingReactant)
 * rather than a parallel implementation, and mirrors matchAllRuleReactants'
 * role semantics, so it can only be wrong in the safe direction: it may
 * propose a tuple the engine then declines (a precision loss), but a tuple the
 * engine would accept is never filtered out (recall).
 *
 * Role semantics mirrored from the engine:
 * - Slot 0 is the rule's primary trigger (plus its blocking constraints);
 *   later slots are `additionalReactants` in order. A rule's structural
 *   arity is therefore 1 + additionalReactants.length.
 * - One lot fills one slot. `equivalents` (several molecules of one drawn
 *   reactant) is a condition of that slot, never extra lots.
 * - With a single lot, only rules whose extra reactants are all supplied by
 *   the rule itself ("auto" with a preset structure, or "condition-only") can
 *   run. Reagents and catalysts are therefore never required as lots.
 * - With two or more lots, every additional reactant of a rule must be filled
 *   by a distinct lot (the engine's matchAllRuleReactants).
 * - `reactantRoleSymmetry: "unordered"` rules report one assignment per set of
 *   lots; other rules report every valid ordering.
 */

export type RoleSlot = {
  slotIndex: number;
  label: string;
  requirementId: string | null;
  supplyMode: ReactantSupplyMode | "primary";
  equivalents: number;
};

export type RuleRoleProfile = {
  ruleId: string;
  rule: ReactionRule;
  slots: RoleSlot[];
  /** Number of distinct lots a multi-lot application consumes. */
  arity: number;
  unordered: boolean;
  /** Can a single lot run this rule (no structural partner needed)? */
  singleLotCapable: boolean;
};

export type IndexableLot = {
  id: string;
  smiles: string;
  canonical: string;
  /**
   * Lots with equal keys are interchangeable (for example two copies of one
   * supplied material). Only the first n of such a group are ever used
   * together, so equivalent assignments are not enumerated repeatedly.
   * Defaults to `canonical`.
   */
  equivalenceKey?: string;
};

export type RoleAssignment = {
  ruleId: string;
  rule: ReactionRule;
  /** Lot ids in role-slot order. */
  lotIds: string[];
};

export type RoleIndexStats = {
  speciesAnalyzed: number;
  fitEvaluations: number;
  fitCacheHits: number;
};

export function buildRuleRoleProfile(rule: ReactionRule): RuleRoleProfile {
  const additional = rule.additionalReactants ?? [];
  const slots: RoleSlot[] = [
    { slotIndex: 0, label: "primary reactant", requirementId: null, supplyMode: "primary", equivalents: 1 },
    ...additional.map((requirement, index) => ({
      slotIndex: index + 1,
      label: requirement.label,
      requirementId: requirement.id ?? null,
      supplyMode: (requirement.supplyMode ?? "user-structure") as ReactantSupplyMode,
      equivalents: Math.max(1, Math.floor(requirement.equivalents ?? 1)),
    })),
  ];
  // buildAutoSuppliedReactants: condition-only is skipped, auto needs a preset,
  // anything else means a structure must be drawn.
  const singleLotCapable = additional.every((requirement) => {
    const mode = requirement.supplyMode ?? "user-structure";
    return mode === "condition-only" || (mode === "auto" && Boolean(requirement.presetSmiles?.trim()));
  });
  return {
    ruleId: rule.id,
    rule,
    slots,
    arity: slots.length,
    unordered: rule.reactantRoleSymmetry === "unordered",
    singleLotCapable,
  };
}

export class ReactantRoleIndex {
  readonly profiles: RuleRoleProfile[];
  private readonly profileById = new Map<string, RuleRoleProfile>();
  private readonly components = new Map<string, Promise<ReactionComponent>>();
  private readonly fits = new Map<string, Promise<boolean>>();
  private readonly singles = new Map<string, Promise<ReactionRule[]>>();
  private stats: RoleIndexStats = { speciesAnalyzed: 0, fitEvaluations: 0, fitCacheHits: 0 };

  constructor(rules: readonly ReactionRule[]) {
    this.profiles = rules.map(buildRuleRoleProfile);
    for (const profile of this.profiles) this.profileById.set(profile.ruleId, profile);
  }

  getStats(): RoleIndexStats {
    return { ...this.stats };
  }

  profileOf(ruleId: string): RuleRoleProfile | undefined {
    return this.profileById.get(ruleId);
  }

  /** Rules that need at least one structural partner (arity >= 2 when drawn together). */
  get multiLotProfiles(): RuleRoleProfile[] {
    return this.profiles.filter((profile) => profile.arity > 1);
  }

  private componentFor(species: { canonical: string; smiles: string }): Promise<ReactionComponent> {
    let pending = this.components.get(species.canonical);
    if (!pending) {
      this.stats.speciesAnalyzed += 1;
      pending = analyzeReactionComponents(species.smiles).then((list) => list[0]);
      this.components.set(species.canonical, pending);
    }
    return pending;
  }

  /** Does this species satisfy the structural requirement of one slot of one rule? */
  async slotFits(
    species: { canonical: string; smiles: string },
    ruleId: string,
    slotIndex: number,
  ): Promise<boolean> {
    const profile = this.profileById.get(ruleId);
    if (!profile || slotIndex < 0 || slotIndex >= profile.slots.length) return false;

    const key = `${species.canonical}\u0000${ruleId}\u0000${slotIndex}`;
    const cached = this.fits.get(key);
    if (cached) {
      this.stats.fitCacheHits += 1;
      return cached;
    }
    this.stats.fitEvaluations += 1;
    const pending = (async () => {
      const component = await this.componentFor(species);
      if (!component) return false;
      return slotIndex === 0
        ? ruleMatchesReactant(profile.rule, component.smiles, component.functionalGroups)
        : triggerMatchesReactant(
            (profile.rule.additionalReactants ?? [])[slotIndex - 1].trigger,
            component.smiles,
            component.functionalGroups,
          );
    })();
    this.fits.set(key, pending);
    return pending;
  }

  /**
   * Rules one lot can run by itself (no structural partner). Equivalent to the
   * engine's single-component path before its competing-rule suppression.
   */
  singleLotRules(species: { canonical: string; smiles: string }): Promise<ReactionRule[]> {
    let pending = this.singles.get(species.canonical);
    if (!pending) {
      pending = (async () => {
        const component = await this.componentFor(species);
        if (!component) return [];
        const capable = this.profiles.filter((profile) => profile.singleLotCapable).map((p) => p.rule);
        return filterRulesMatchingReactant(capable, component.smiles, component.functionalGroups);
      })();
      this.singles.set(species.canonical, pending);
    }
    return pending;
  }

  /**
   * Every way the given lots can fill a multi-lot rule, with each rule's lots
   * in slot order. `maxArity` bounds how many lots one step may consume.
   */
  async candidateAssignments(
    lots: readonly IndexableLot[],
    options: { maxArity?: number } = {},
  ): Promise<RoleAssignment[]> {
    const maxArity = options.maxArity ?? Number.POSITIVE_INFINITY;
    const results: RoleAssignment[] = [];

    // Position of each lot inside its equivalence group, in the given order.
    const groupOrder = new Map<string, string[]>();
    for (const lot of lots) {
      const key = lot.equivalenceKey ?? lot.canonical;
      groupOrder.set(key, [...(groupOrder.get(key) ?? []), lot.id]);
    }
    const keyOf = (lot: IndexableLot) => lot.equivalenceKey ?? lot.canonical;

    for (const profile of this.multiLotProfiles) {
      if (profile.arity > lots.length || profile.arity > maxArity) continue;

      // Slot-by-slot fit lists, so backtracking only visits lots that fit.
      const fitting: IndexableLot[][] = [];
      let feasible = true;
      for (const slot of profile.slots) {
        const fit: IndexableLot[] = [];
        for (const lot of lots) {
          if (await this.slotFits(lot, profile.ruleId, slot.slotIndex)) fit.push(lot);
        }
        if (fit.length === 0) {
          feasible = false;
          break;
        }
        fitting.push(fit);
      }
      if (!feasible) continue;

      const seen = new Set<string>();
      const chosen: IndexableLot[] = [];
      const visit = (slotIndex: number) => {
        if (slotIndex === profile.arity) {
          const ids = chosen.map((lot) => lot.id);
          const dedupeKey = (profile.unordered ? [...ids].sort() : ids).join("|");
          if (seen.has(dedupeKey)) return;
          seen.add(dedupeKey);
          results.push({ ruleId: profile.ruleId, rule: profile.rule, lotIds: ids });
          return;
        }
        for (const lot of fitting[slotIndex]) {
          if (chosen.includes(lot)) continue;
          // Interchangeable lots: use the earliest unused member of the group first.
          const group = groupOrder.get(keyOf(lot)) ?? [];
          const rank = group.indexOf(lot.id);
          if (group.slice(0, rank).some((earlier) => !chosen.some((c) => c.id === earlier))) continue;
          chosen.push(lot);
          visit(slotIndex + 1);
          chosen.pop();
        }
      };
      visit(0);
    }
    return results;
  }

  /** The distinct rules in a set of assignments, for handing a rule subset to the engine. */
  static ruleSubset(assignments: readonly RoleAssignment[]): ReactionRule[] {
    const byId = new Map<string, ReactionRule>();
    for (const assignment of assignments) byId.set(assignment.ruleId, assignment.rule);
    return [...byId.values()];
  }

  /** Dot-joined engine input for one assignment (role order). */
  static reactantInput(assignment: RoleAssignment, lots: readonly IndexableLot[]): string {
    const byId = new Map(lots.map((lot) => [lot.id, lot]));
    return assignment.lotIds.map((id) => byId.get(id)?.smiles ?? "").join(".");
  }
}
