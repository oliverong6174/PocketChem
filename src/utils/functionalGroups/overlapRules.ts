import type { FunctionalGroupResult } from "./types";

const SUPPRESSION_RULES: Record<string, string[]> = {
  "Carboxylic acid": ["Alcohol"],
  Ester: ["Ether"],
  Amide: ["Amine"],
  "Acid chloride": ["Alkyl halide"],
  Anhydride: ["Ester", "Ether"],
  Phenol: ["Alcohol"],
  Aniline: ["Amine"],
  Anisole: ["Ether"],
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function namesMatch(a: string, b: string) {
  const normalizedA = normalizeName(a);
  const normalizedB = normalizeName(b);

  return normalizedA === normalizedB;
}

function isSubset(childAtoms: number[], parentAtoms: number[]) {
  return childAtoms.every((atomIndex) => parentAtoms.includes(atomIndex));
}

function shouldSuppressGroup(
  childGroup: FunctionalGroupResult,
  allGroups: FunctionalGroupResult[]
) {
  for (const [parentName, suppressedNames] of Object.entries(SUPPRESSION_RULES)) {
    const parentGroups = allGroups.filter((group) =>
      namesMatch(group.name, parentName)
    );

    if (parentGroups.length === 0) continue;

    const childIsSuppressedType = suppressedNames.some((suppressedName) =>
      namesMatch(childGroup.name, suppressedName)
    );

    if (!childIsSuppressedType) continue;

    for (const childMatch of childGroup.matches ?? []) {
      const isContainedInParent = parentGroups.some((parentGroup) =>
        (parentGroup.matches ?? []).some((parentMatch) =>
          isSubset(childMatch, parentMatch)
        )
      );

      if (isContainedInParent) {
        return true;
      }
    }
  }

  return false;
}

export function removeOverlappingGroups(
  groups: FunctionalGroupResult[]
): FunctionalGroupResult[] {
  const overlapFiltered = groups.filter(
    (group) => !shouldSuppressGroup(group, groups)
  );

  const meaningfulGroups = overlapFiltered.filter(
    (group) => group.name !== "Alkane"
  );

  if (meaningfulGroups.length > 0) {
    return meaningfulGroups;
  }

  return overlapFiltered;
}