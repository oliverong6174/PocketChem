import type { FunctionalGroupResult } from "../../functionalGroups/types";
import type { NamingFeature, NamingFeatureType } from "../types";

export type ParentStrategy = "hydrocarbon" | "acyl";

export type NamingIntent = {
  featureType: NamingFeatureType | null;
  parentStrategy: ParentStrategy;
  terminalSuffix: boolean;
  aromaticRetainedParentAllowed: boolean;
  cleanSuffix: string;
  groupName: string;
};

export function getNamingIntent(
  primaryGroup: FunctionalGroupResult | null
): NamingIntent {
  const cleanSuffix =
    primaryGroup?.suffix?.toLowerCase().replace(/^-/, "") ?? "";
  const groupName = primaryGroup?.name?.toLowerCase() ?? "";

  const featureType = getExpectedFeatureType(cleanSuffix, groupName);

  return {
    featureType,
    cleanSuffix,
    groupName,
    parentStrategy: isAcylLike(cleanSuffix, groupName)
      ? "acyl"
      : "hydrocarbon",
    terminalSuffix: isTerminalSuffix(cleanSuffix, groupName),
    aromaticRetainedParentAllowed: isAromaticRetainedParentCandidate(
      cleanSuffix,
      groupName,
      featureType
    ),
  };
}

export function getPrimaryFeatureFromIntent(
  features: NamingFeature[],
  intent: NamingIntent
) {
  if (!intent.featureType) return null;

  return (
    features.find((feature) => feature.type === intent.featureType) ?? null
  );
}

export function isSameFeature(
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

function getExpectedFeatureType(
  cleanSuffix: string,
  groupName: string
): NamingFeatureType | null {
  const normalizedSuffix = cleanSuffix
    .trim()
    .toLowerCase()
    .replace(/^-/, "")
    .replace(/[\s-]/g, "");

  const normalizedName = groupName.trim().toLowerCase();

  if (
    normalizedName.includes("hemiacetal") ||
    normalizedName.includes("hemiketal") ||
    normalizedName.includes("acetal") ||
    normalizedName.includes("ketal")
  ) {
    return null;
  }

  if (normalizedSuffix.includes("oicacid")) {
    return "carboxylicAcid";
  }

  if (normalizedSuffix.endsWith("oate")) {
    return "ester";
  }

  if (normalizedSuffix.includes("amide")) {
    return "amide";
  }

  if (normalizedSuffix.includes("oyl")) {
    return "acidChloride";
  }

  // Covers:
  // al, enal, dienal, ynal, diynal, etc.
  if (normalizedSuffix.endsWith("al")) {
    return "aldehyde";
  }

  // Covers:
  // one, enone, dienone, ynone, dione, trione, etc.
  if (normalizedSuffix.endsWith("one")) {
    return "ketone";
  }

  // Covers:
  // ol, enol, dienol, ynol, diynol, phenol, diol, triol, etc.
  if (
    normalizedSuffix.endsWith("ol") ||
    normalizedName.includes("phenol")
  ) {
    return "alcohol";
  }

  // Covers:
  // amine, enamine, diamine, triamine, aniline, etc.
  if (
    normalizedSuffix.includes("amine") ||
    normalizedName.includes("aniline")
  ) {
    return "amine";
  }

  // Covers:
  // thiol, dithiol, trithiol, benzenethiol, etc.
  if (normalizedSuffix.endsWith("thiol")) {
    return "thiol";
  }

  if (
    normalizedSuffix.includes("nitrile") ||
    normalizedSuffix.includes("carbonitrile")
  ) {
    return "nitrile";
  }

  return null;
}

function isAcylLike(suffix: string, name: string) {
  return (
    suffix === "al" ||
    suffix.endsWith("enal") ||
    suffix.includes("oic acid") ||
    suffix.includes("enoic acid") ||
    suffix.includes("oate") ||
    suffix.includes("enoate") ||
    suffix.includes("amide") ||
    suffix.includes("enamide") ||
    suffix.includes("oyl") ||
    suffix.includes("nitrile") ||
    suffix.includes("carbonitrile") ||
    name.includes("aldehyde") ||
    name.includes("carboxylic acid") ||
    name.includes("ester") ||
    name.includes("amide") ||
    name.includes("nitrile")
  );
}

function isTerminalSuffix(suffix: string, name: string) {
  return isAcylLike(suffix, name);
}

function isAromaticRetainedParentCandidate(
  suffix: string,
  name: string,
  featureType: NamingFeatureType | null
) {
  return (
    featureType === "alcohol" ||
    featureType === "amine" ||
    featureType === "thiol" ||
    featureType === "carboxylicAcid" ||
    featureType === "amide" ||
    featureType === "aldehyde" ||
    featureType === "nitrile" ||
    featureType === "ester" ||
    featureType === "acidChloride" ||
    featureType === "ketone" ||
    suffix.includes("phenol") ||
    suffix.includes("aniline") ||
    name.includes("benz")
  );
}