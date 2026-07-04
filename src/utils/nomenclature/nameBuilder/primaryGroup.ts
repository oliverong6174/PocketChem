import type { FunctionalGroupResult } from "../../functionalGroups/types";
import { groupHasUsableSuffix } from "./nomenclatureRules";

export function getPrimaryFunctionalGroup(
  functionalGroups: FunctionalGroupResult[] = [],
  mainGroup: FunctionalGroupResult | null = null
) {
  return (
    mainGroup ??
    [...functionalGroups]
      .filter(groupHasUsableSuffix)
      .sort((a, b) => a.nomenclaturePriority - b.nomenclaturePriority)[0] ??
    null
  );
}