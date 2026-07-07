import type { FunctionalGroupResult } from "../../functionalGroups/types";
import { groupHasUsableSuffix } from "./nomenclatureRules";

export function getPrimaryFunctionalGroup(
  functionalGroups: FunctionalGroupResult[] = [],
  mainGroup: FunctionalGroupResult | null = null
) {
  const candidates = [
    ...(mainGroup ? [mainGroup] : []),
    ...functionalGroups,
  ];

  const uniqueCandidates = Array.from(
    new Map(candidates.map((group) => [group.name, group])).values()
  );

  return (
    uniqueCandidates
      .filter(groupHasUsableSuffix)
      .sort((a, b) => a.nomenclaturePriority - b.nomenclaturePriority)[0] ??
    null
  );
}