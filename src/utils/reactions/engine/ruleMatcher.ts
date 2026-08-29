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
 * distinct disconnected structures. The returned array is ordered by the
 * reaction rule's reactant roles, not by drawing order, so reaction SMARTS
 * can be deterministic while users may draw molecules in either order.
 */
export async function matchRuleReactants(
  rule: ReactionRule,
  components: ReactionComponent[]
): Promise<ReactionComponent[] | null> {
  const requirements = [
    { label: "primary reactant", trigger: rule.trigger },
    ...(rule.additionalReactants ?? []),
  ];

  if (components.length < requirements.length) return null;

  const used = new Set<number>();
  const assignment: ReactionComponent[] = [];

  async function assign(requirementIndex: number): Promise<boolean> {
    if (requirementIndex >= requirements.length) return true;

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
      assignment.push(component);

      if (await assign(requirementIndex + 1)) return true;

      assignment.pop();
      used.delete(componentIndex);
    }

    return false;
  }

  return (await assign(0)) ? assignment : null;
}
