import type { FunctionalGroupResult } from "../../functionalGroups/types";
import type { NamingFeature } from "../types";

import { getNamingIntent } from "./namingIntent";

import {
  isInformationalOrUnsafeSuffix,
  isUnsafePrimaryGroup,
} from "./functionalGroupNaming";

const NON_NOMENCLATURE_PRIMARY_GROUPS = new Set([
  "hemiacetal",
  "hemiketal",
  "acetal",
  "ketal",
  "ether",
  "aryl ether",
  "thioether",
  "epoxide",
  "peroxide",
  "aldol",
  "benzoin",
]);

function isHydrocarbonOnlyGroup(group: FunctionalGroupResult) {
  const name = group.name.trim().toLowerCase();
  const suffix = group.suffix?.trim().toLowerCase().replace(/^-/, "") ?? "";
  const normalizedSuffix = suffix.replace(/-/g, "");

  if (
    name === "alkane" ||
    name === "alkene" ||
    name === "alkyne" ||
    name === "hydrocarbon" ||
    name === "saturated hydrocarbon" ||
    name === "unsaturated hydrocarbon" ||
    name === "cyclic hydrocarbon" ||
    name.includes("alkene") ||
    name.includes("alkyne") ||
    name.includes("hydrocarbon")
  ) {
    return true;
  }

  if (
    suffix === "ane" ||
    suffix === "ene" ||
    suffix === "yne" ||
    suffix === "diene" ||
    suffix === "triene" ||
    suffix === "tetraene" ||
    suffix === "pentaene" ||
    suffix === "hexaene" ||
    suffix === "diyne" ||
    suffix === "triyne" ||
    suffix === "tetrayne" ||
    suffix === "pentayne" ||
    suffix === "hexayne"
  ) {
    return true;
  }

  // Handles combined hydrocarbon suffixes like:
  // enyne, dienyne, enediyne, etc.
  return normalizedSuffix.includes("en") && normalizedSuffix.includes("yn");
}

export function groupHasUsableSuffix(group: FunctionalGroupResult): boolean {
  const name = group.name.trim().toLowerCase();
  const suffix = group.suffix?.trim().toLowerCase() ?? "";

  if (!suffix) return false;
  if (isInformationalOrUnsafeSuffix(suffix)) return false;
  if (isUnsafePrimaryGroup(group)) return false;
  if (NON_NOMENCLATURE_PRIMARY_GROUPS.has(name)) return false;
  if (isHydrocarbonOnlyGroup(group)) return false;

  return true;
}

export function shouldSuppressFeaturePrefixForPrimaryGroup(
  feature: NamingFeature,
  primaryGroup: FunctionalGroupResult | null
): boolean {
  const intent = getNamingIntent(primaryGroup);

  return (
    Boolean(intent.featureType) &&
    feature.type === intent.featureType
  );
}

export function isAcylSuffix(suffix: string | null | undefined): boolean {
  const cleanSuffix = suffix?.toLowerCase().replace(/^-/, "") ?? "";

  return (
    cleanSuffix === "al" ||
    cleanSuffix.endsWith("enal") ||
    cleanSuffix.includes("oic acid") ||
    cleanSuffix.includes("enoic acid") ||
    cleanSuffix.includes("oic anhydride") ||
    cleanSuffix.includes("oate") ||
    cleanSuffix.includes("enoate") ||
    cleanSuffix.includes("amide") ||
    cleanSuffix.includes("enamide") ||
    cleanSuffix.includes("oyl") ||
    cleanSuffix.includes("nitrile") ||
    cleanSuffix.includes("carbonitrile")
  );
}

export function getPrimaryFeatureType(
  primaryGroup: FunctionalGroupResult | null
) {
  return getNamingIntent(primaryGroup).featureType;
}

export function shouldUseParentHydrocarbonOnly(
  primaryGroup: FunctionalGroupResult | null,
  primaryFeature: NamingFeature | null
): boolean {
  if (primaryGroup) return false;
  if (!primaryFeature) return true;

  return primaryFeature.type === "alkene" || primaryFeature.type === "alkyne";
}