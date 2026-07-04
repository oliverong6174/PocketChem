import type { FunctionalGroupResult } from "../../functionalGroups/types";
import type { NamingFeature, Substituent } from "../types";

import { formatLocants } from "../formatUtils";
import { getMultiplier } from "./suffixBuilder";
import { shouldSuppressFeaturePrefixForPrimaryGroup } from "./nomenclatureRules";

export type PrefixEntry = {
  text: string;
  sortKey: string;
  firstLocant: number;
};

type SubstituentGroup = {
  name: string;
  locants: number[];
};

export function buildPrefixString(
  features: NamingFeature[],
  primaryFeature: NamingFeature | null,
  primaryGroup: FunctionalGroupResult | null = null
) {
  return renderPrefixEntries(
    buildFeaturePrefixEntries(features, primaryFeature, primaryGroup)
  );
}

export function buildCombinedPrefixString(
  features: NamingFeature[],
  primaryFeature: NamingFeature | null,
  primaryGroup: FunctionalGroupResult | null,
  substituents: Substituent[]
) {
  return renderPrefixEntries([
    ...buildFeaturePrefixEntries(features, primaryFeature, primaryGroup),
    ...buildSubstituentPrefixEntries(substituents),
  ]);
}

export function buildFeaturePrefixEntries(
  features: NamingFeature[],
  primaryFeature: NamingFeature | null,
  primaryGroup: FunctionalGroupResult | null = null
): PrefixEntry[] {
  return features
    .filter((feature) => {
      if (feature === primaryFeature) return false;
      if (!feature.prefix) return false;

      return !shouldSuppressFeaturePrefixForPrimaryGroup(
        feature,
        primaryGroup
      );
    })
    .map((feature) => ({
      text: formatFeaturePrefix(feature),
      sortKey: getPrefixSortKey(feature.prefix),
      firstLocant: feature.locants[0] ?? Number.POSITIVE_INFINITY,
    }));
}

export function buildSubstituentPrefixEntries(
  substituents: Substituent[]
): PrefixEntry[] {
  return groupSubstituents(substituents).map((group) => ({
    text: formatSubstituentGroup(group),
    sortKey: getPrefixSortKey(group.name),
    firstLocant: group.locants[0] ?? Number.POSITIVE_INFINITY,
  }));
}

function groupSubstituents(substituents: Substituent[]) {
  const groups = new Map<string, number[]>();

  for (const substituent of substituents) {
    if (!substituent.locant) continue;

    const existing = groups.get(substituent.name) ?? [];
    existing.push(substituent.locant);
    groups.set(substituent.name, existing);
  }

  return Array.from(groups.entries()).map(([name, locants]) => ({
    name,
    locants: locants.sort((a, b) => a - b),
  }));
}

function formatSubstituentGroup(group: SubstituentGroup) {
  const multiplier = getMultiplier(group.locants.length);
  return `${group.locants.join(",")}-${multiplier}${group.name}`;
}

export function formatFeaturePrefix(feature: NamingFeature) {
  if (feature.locants.length === 0) return feature.prefix;

  const multiplier = getMultiplier(feature.locants.length);
  return `${formatLocants(feature.locants)}-${multiplier}${feature.prefix}`;
}

export function getPrefixSortKey(prefix: string) {
  return prefix
    .toLowerCase()
    .replace(/^(di|tri|tetra|penta|hexa|bis|tris)/, "");
}

export function sortPrefixEntries(entries: PrefixEntry[]) {
  return [...entries].sort((a, b) => {
    const alpha = a.sortKey.localeCompare(b.sortKey);
    if (alpha !== 0) return alpha;

    return a.firstLocant - b.firstLocant;
  });
}

function renderPrefixEntries(entries: PrefixEntry[]) {
  return sortPrefixEntries(entries)
    .map((entry) => entry.text)
    .join("-");
}