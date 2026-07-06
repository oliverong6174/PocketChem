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
      if (!feature.prefix) return false;

      if (isSameFeatureAsPrimary(feature, primaryFeature)) {
        return false;
      }

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

function isSameFeatureAsPrimary(
  feature: NamingFeature,
  primaryFeature: NamingFeature | null
) {
  if (!primaryFeature) return false;

  if (feature === primaryFeature) return true;

  if (feature.type !== primaryFeature.type) return false;

  return sameLocants(feature.locants, primaryFeature.locants);
}

function sameLocants(a: number[], b: number[]) {
  if (a.length !== b.length) return false;

  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);

  return sortedA.every((value, index) => value === sortedB[index]);
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
  const isComplex = isComplexSubstituentName(group.name);
  const multiplier = isComplex
    ? getComplexSubstituentMultiplier(group.locants.length)
    : getMultiplier(group.locants.length);
  const name = isComplex ? `(${group.name})` : group.name;

  return `${group.locants.join(",")}-${multiplier}${name}`;
}

function isComplexSubstituentName(name: string) {
  // Parenthesize only substituent names that contain their own locants or
  // punctuation. Do not classify simple prefixes like sulfanyl, hydroxy,
  // amino, chloro, etc. as complex merely because their spelling contains
  // the letters "yl".
  return name.includes("-") || name.includes(",") || name.includes("(");
}

function getComplexSubstituentMultiplier(count: number) {
  if (count === 2) return "bis";
  if (count === 3) return "tris";
  if (count === 4) return "tetrakis";
  if (count === 5) return "pentakis";
  if (count === 6) return "hexakis";
  return "";
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