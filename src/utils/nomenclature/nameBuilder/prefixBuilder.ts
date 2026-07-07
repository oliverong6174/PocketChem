import type { FunctionalGroupResult } from "../../functionalGroups/types";

import type {
  NamingFeature,
  ParentDescriptor,
  Substituent,
} from "../types";

import { formatLocants } from "../formatUtils";
import { getMultiplier } from "./suffixBuilder";
import { getNamingIntent } from "./namingIntent";

export type PrefixEntry = {
  text: string;
  sortKey: string;
  firstLocant: number;
};

type SubstituentGroup = {
  name: string;
  locants: Array<number | string>;
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
  substituents: Substituent[],
  parent?: ParentDescriptor
) {
  return renderPrefixEntries([
    ...buildFeaturePrefixEntries(features, primaryFeature, primaryGroup),
    ...buildSubstituentPrefixEntries(substituents, parent, primaryFeature),
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

function shouldSuppressFeaturePrefixForPrimaryGroup(
  feature: NamingFeature,
  primaryGroup: FunctionalGroupResult | null
) {
  const intent = getNamingIntent(primaryGroup);

  return (
    Boolean(intent.featureType) &&
    feature.type === intent.featureType
  );
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
  substituents: Substituent[],
  parent?: ParentDescriptor,
  primaryFeature: NamingFeature | null = null
): PrefixEntry[] {
  const groups = groupSubstituents(substituents);
  const totalSubstituentOccurrences = groups.reduce(
    (sum, group) => sum + group.locants.length,
    0
  );

  return groups.map((group) => {
    const omitLocants = shouldOmitSubstituentLocants(
      group,
      parent,
      primaryFeature,
      totalSubstituentOccurrences
    );

    return {
      text: formatSubstituentGroup(group, omitLocants),
      sortKey: getPrefixSortKey(group.name),
      firstLocant: getFirstLocantSortValue(group.locants),
    };
  });
}

function groupSubstituents(substituents: Substituent[]) {
  const groups = new Map<string, Array<number | string>>();

  for (const substituent of substituents) {
    if (
      substituent.locant === null ||
      substituent.locant === undefined ||
      substituent.locant === ""
    ) {
      continue;
    }

    const existing = groups.get(substituent.name) ?? [];
    existing.push(substituent.locant);
    groups.set(substituent.name, existing);
  }

  return Array.from(groups.entries()).map(([name, locants]) => ({
    name,
    locants: sortLocants(locants),
  }));
}

function shouldOmitSubstituentLocants(
  group: SubstituentGroup,
  parent: ParentDescriptor | undefined,
  primaryFeature: NamingFeature | null,
  totalSubstituentOccurrences: number
) {
  if (!parent) return false;
  if (totalSubstituentOccurrences !== 1) return false;
  if (group.locants.length !== 1) return false;

  const locant = group.locants[0];

  if (typeof locant !== "number") return false;

  // Do not omit locants when there is a true suffix-bearing parent group.
  // Example: 2-chlorophenol, 3-methylcyclohexan-1-ol.
  if (
    primaryFeature &&
    primaryFeature.type !== "alkene" &&
    primaryFeature.type !== "alkyne"
  ) {
    return false;
  }

  // Methane/ethane/ethene/ethyne monosubstitution:
  // 1-chloroethane -> chloroethane
  if (parent.kind === "chain" && parent.carbonCount <= 2) {
    return true;
  }

  // Monosubstituted rings:
  // 1-chlorobenzene -> chlorobenzene
  // 1-methylcyclohexane -> methylcyclohexane
  if (parent.kind === "ring") {
    return true;
  }

  return false;
}

function sortLocants(locants: Array<number | string>) {
  return [...locants].sort(compareLocants);
}

function compareLocants(a: number | string, b: number | string) {
  const valueA = getLocantSortValue(a);
  const valueB = getLocantSortValue(b);

  if (valueA !== valueB) return valueA - valueB;

  return String(a).localeCompare(String(b));
}

function getFirstLocantSortValue(locants: Array<number | string>) {
  return locants.length > 0
    ? getLocantSortValue(locants[0])
    : Number.POSITIVE_INFINITY;
}

function getLocantSortValue(locant: number | string) {
  if (typeof locant === "number") return locant;

  const normalized = locant.trim().toUpperCase();

  // N-substitution should render as N-methyl, N,N-dimethyl,
  // N,6-dimethyl, etc.
  if (normalized === "N") return -1;

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
}

function formatSubstituentGroup(
  group: SubstituentGroup,
  omitLocants = false
) {
  const isComplex = isComplexSubstituentName(group.name);
  const multiplier = isComplex
    ? getComplexSubstituentMultiplier(group.locants.length)
    : getMultiplier(group.locants.length);

  const name = isComplex ? `(${group.name})` : group.name;

  if (omitLocants) {
    return `${multiplier}${name}`;
  }

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