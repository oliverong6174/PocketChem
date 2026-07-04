import type { FunctionalGroupResult } from "../../functionalGroups/types";
import { isAcylSuffix } from "./nomenclatureRules";

export function getParentStrategy(group: FunctionalGroupResult | null) {
  return isAcylSuffix(group?.suffix) ? "acyl" : "hydrocarbon";
}