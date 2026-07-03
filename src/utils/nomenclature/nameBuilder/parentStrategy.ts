import type { FunctionalGroupResult } from "../../functionalGroups/types";

export function getParentStrategy(group: FunctionalGroupResult | null) {
  const suffix = group?.suffix?.toLowerCase() ?? "";

  if (
    suffix.includes("oic acid") ||
    suffix.includes("oic anhydride") ||
    suffix.includes("oate") ||
    suffix.includes("amide") ||
    suffix.includes("oyl") ||
    suffix.includes("carbonitrile")
  ) {
    return "acyl";
  }

  return "hydrocarbon";
}