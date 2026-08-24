import { getRDKit } from "../../rdkit";
import type { FunctionalGroupResult } from "../../functionalGroups";
import type { ReactionRule } from "../reactionTypes";

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

export async function ruleMatchesReactant(
  rule: ReactionRule,
  reactantSmiles: string,
  functionalGroups: FunctionalGroupResult[] = []
): Promise<boolean> {
  const detectedNames = detectedFunctionalGroupNames(functionalGroups);
  const legacyAny = rule.trigger.functionalGroups ?? [];
  const anyNames = [...legacyAny, ...(rule.trigger.anyFunctionalGroups ?? [])];
  const allNames = rule.trigger.allFunctionalGroups ?? [];
  const excludedNames = rule.trigger.excludedFunctionalGroups ?? [];

  if (
    anyNames.length > 0 &&
    !anyNames.some((name) => detectedNames.has(normalizeName(name)))
  ) {
    return false;
  }

  if (
    allNames.some((name) => !detectedNames.has(normalizeName(name)))
  ) {
    return false;
  }

  if (
    excludedNames.some((name) => detectedNames.has(normalizeName(name)))
  ) {
    return false;
  }

  if (anyNames.length === 0 && allNames.length === 0) return false;

  return matchesSmarts(
    reactantSmiles,
    rule.trigger.includeSmarts ?? [],
    rule.trigger.excludeSmarts ?? []
  );
}
