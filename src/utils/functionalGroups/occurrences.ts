import type { FunctionalGroupResult } from "./types";

export type FunctionalGroupOccurrence = {
  id: string;
  group: FunctionalGroupResult;
  groupName: string;
  occurrence: number;
  totalOccurrences: number;
  atoms: number[];
  bonds: number[];
};

export function flattenFunctionalGroupOccurrences(
  groups: FunctionalGroupResult[]
): FunctionalGroupOccurrence[] {
  return groups.flatMap((group) => {
    const matches = group.displayMatches ?? group.matches ?? [];

    return matches.map((match, index) => ({
      id: `${group.name}-${index + 1}`,
      group,
      groupName: group.name,
      occurrence: index + 1,
      totalOccurrences: matches.length,
      atoms: match.atoms,
      bonds: match.bonds,
    }));
  });
}