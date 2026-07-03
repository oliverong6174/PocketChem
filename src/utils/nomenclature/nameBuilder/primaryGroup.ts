import type { FunctionalGroupResult } from "../../functionalGroups/types";

export function getPrimaryFunctionalGroup(
  functionalGroups: FunctionalGroupResult[] = [],
  mainGroup: FunctionalGroupResult | null = null
) {
  return (
    mainGroup ??
    [...functionalGroups]
      .filter((group) => typeof group.nomenclaturePriority === "number")
      .sort((a, b) => a.nomenclaturePriority - b.nomenclaturePriority)[0] ??
    null
  );
}