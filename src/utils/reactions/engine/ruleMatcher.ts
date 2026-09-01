import { getRDKit } from "../../rdkit";
import type { FunctionalGroupResult } from "../../functionalGroups";
import type {
  ReactionComponent,
  ReactionRule,
  ReactionTrigger,
} from "../reactionTypes";

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function detectedFunctionalGroupNames(
  functionalGroups: FunctionalGroupResult[]
): Set<string> {
  const names = new Set<string>();

  for (const group of functionalGroups) {
    names.add(normalizeName(group.name));

    for (const equivalentName of group.equivalentNames ?? []) {
      names.add(normalizeName(equivalentName));
    }
  }

  return names;
}

async function matchesSmarts(
  reactantSmiles: string,
  includeSmarts: string[],
  excludeSmarts: string[]
): Promise<boolean> {
  if (includeSmarts.length === 0 && excludeSmarts.length === 0) return true;

  const rdkit = await getRDKit();
  const molecule = rdkit.get_mol(reactantSmiles);

  if (!molecule) return false;

  try {
    for (const smarts of includeSmarts) {
      const query = rdkit.get_qmol(smarts);

      try {
        if (!query || molecule.get_substruct_match(query) === "{}") {
          return false;
        }
      } catch (error) {
        console.warn(`Reaction trigger SMARTS failed: ${smarts}`, error);
        return false;
      } finally {
        query?.delete?.();
      }
    }

    for (const smarts of excludeSmarts) {
      const query = rdkit.get_qmol(smarts);

      try {
        if (query && molecule.get_substruct_match(query) !== "{}") {
          return false;
        }
      } catch (error) {
        console.warn(`Reaction exclusion SMARTS failed: ${smarts}`, error);
        return false;
      } finally {
        query?.delete?.();
      }
    }

    return true;
  } finally {
    molecule.delete();
  }
}

export async function triggerMatchesReactant(
  trigger: ReactionTrigger,
  reactantSmiles: string,
  functionalGroups: FunctionalGroupResult[] = []
): Promise<boolean> {
  const detectedNames = detectedFunctionalGroupNames(functionalGroups);
  const legacyAny = trigger.functionalGroups ?? [];
  const anyNames = [...legacyAny, ...(trigger.anyFunctionalGroups ?? [])];
  const allNames = trigger.allFunctionalGroups ?? [];
  const excludedNames = trigger.excludedFunctionalGroups ?? [];
  const includeSmarts = trigger.includeSmarts ?? [];
  const excludeSmarts = trigger.excludeSmarts ?? [];

  if (
    anyNames.length > 0 &&
    !anyNames.some((name) => detectedNames.has(normalizeName(name)))
  ) {
    return false;
  }

  if (allNames.some((name) => !detectedNames.has(normalizeName(name)))) {
    return false;
  }

  if (excludedNames.some((name) => detectedNames.has(normalizeName(name)))) {
    return false;
  }

  const hasNameTrigger = anyNames.length > 0 || allNames.length > 0;
  const hasSmartsTrigger = includeSmarts.length > 0 || excludeSmarts.length > 0;

  if (!hasNameTrigger && !hasSmartsTrigger) return false;

  return matchesSmarts(reactantSmiles, includeSmarts, excludeSmarts);
}

export async function ruleMatchesReactant(
  rule: ReactionRule,
  reactantSmiles: string,
  functionalGroups: FunctionalGroupResult[] = []
): Promise<boolean> {
  return triggerMatchesReactant(rule.trigger, reactantSmiles, functionalGroups);
}

/**
 * Match a rule's primary trigger plus any required additional reactants to
 * distinct disconnected structures. Results are ordered by reaction-role
 * order, not drawing order. All valid role assignments are returned because
 * crossed reactions (for example aldol chemistry) can legitimately swap which
 * drawn carbonyl acts as donor versus electrophile.
 */
export async function matchAllRuleReactants(
  rule: ReactionRule,
  components: ReactionComponent[]
): Promise<ReactionComponent[][]> {
  const requirements = [
    { label: "primary reactant", trigger: rule.trigger },
    ...(rule.additionalReactants ?? []),
  ];

  if (components.length < requirements.length) return [];

  const used = new Set<number>();
  const assignment: ReactionComponent[] = [];
  const results: ReactionComponent[][] = [];
  const seen = new Set<string>();

  async function assign(requirementIndex: number): Promise<void> {
    if (requirementIndex >= requirements.length) {
      const key = assignment.map((component) => component.smiles).join("||");
      if (!seen.has(key)) {
        seen.add(key);
        results.push([...assignment]);
      }
      return;
    }

    const requirement = requirements[requirementIndex];

    for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
      if (used.has(componentIndex)) continue;

      const component = components[componentIndex];
      const matches = await triggerMatchesReactant(
        requirement.trigger,
        component.smiles,
        component.functionalGroups
      );

      if (!matches) continue;

      used.add(componentIndex);
      const equivalents = Math.max(1, Math.floor(requirement.equivalents ?? 1));
      for (let copy = 0; copy < equivalents; copy += 1) {
        assignment.push(component);
      }
      await assign(requirementIndex + 1);
      assignment.splice(assignment.length - equivalents, equivalents);
      used.delete(componentIndex);
    }
  }

  await assign(0);
  return results;
}

/** Backward-compatible convenience helper for callers that only need one match. */
export async function matchRuleReactants(
  rule: ReactionRule,
  components: ReactionComponent[]
): Promise<ReactionComponent[] | null> {
  const matches = await matchAllRuleReactants(rule, components);
  return matches[0] ?? null;
}
