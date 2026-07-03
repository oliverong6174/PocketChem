import type { FunctionalGroupResult } from "../../functionalGroups/types";

import type { NamingFeature } from "../types";
import { formatLocants } from "../formatUtils";
import { getMultiplier } from "./suffixBuilder";

export function buildPrefixString(
  features: NamingFeature[],
  primaryFeature: NamingFeature | null,
  primaryGroup: FunctionalGroupResult | null = null
) {
  return features
    .filter((feature) => {
      if (feature === primaryFeature) return false;
      if (shouldSuppressFeaturePrefixForPrimaryGroup(feature, primaryGroup)) {
        return false;
      }

      return true;
    })
    .map(formatPrefix)
    .sort()
    .join("-");
}

export function formatPrefix(feature: NamingFeature) {
  if (feature.locants.length === 0) return feature.prefix;

  const multiplier = getMultiplier(feature.locants.length);
  return `${formatLocants(feature.locants)}-${multiplier}${feature.prefix}`;
}

function shouldSuppressFeaturePrefixForPrimaryGroup(
  feature: NamingFeature,
  primaryGroup: FunctionalGroupResult | null
) {
  if (!primaryGroup) return false;

  const primaryName = primaryGroup.name.toLowerCase();

  if (primaryName.includes("anhydride")) {
    return [
      "ester",
      "ketone",
      "aldehyde",
      "acidChloride",
      "carboxylicAcid",
      "alkoxycarbonyl",
      "carbonyl",
      "alkoxy",
    ].includes(feature.type);
  }

  return false;
}