import type { FunctionalGroupResult } from "../../functionalGroups/types";
import type { NamingFeature } from "../types";


export type ParentStrategy = "hydrocarbon" | "acyl";

export function groupHasUsableSuffix(group: FunctionalGroupResult): boolean {
  const suffix = group.suffix?.toLowerCase() ?? "";

  return Boolean(suffix) && !suffix.includes("never suffix");
}

export function isAcylSuffix(suffix: string | null | undefined): boolean {
  const normalized = suffix?.toLowerCase() ?? "";

  return (
    normalized.includes("oic acid") ||
    normalized.includes("oic anhydride") ||
    normalized.includes("oate") ||
    normalized.includes("amide") ||
    normalized.includes("oyl") ||
    normalized.includes("carbonitrile")
  );
}

export function shouldUseParentHydrocarbonOnly(
  primaryGroup: FunctionalGroupResult | null,
  primaryFeature: NamingFeature | null
): boolean {
  if (primaryGroup) return false;
  if (!primaryFeature) return true;

  // Alkenes/alkynes are already encoded in parent.parentHydrocarbon.
  // They should not append another suffix.
  return primaryFeature.type === "alkene" || primaryFeature.type === "alkyne";
}

export function shouldSuppressFeaturePrefixForPrimaryGroup(
  feature: NamingFeature,
  primaryGroup: FunctionalGroupResult | null
): boolean {
  if (!primaryGroup) return false;

  const suffix = primaryGroup.suffix?.toLowerCase() ?? "";
  const name = primaryGroup.name.toLowerCase();

  // If ketone is the main suffix, do not also show oxo.
  if (suffix.includes("one") && feature.type === "ketone") {
    return true;
  }

  // If alcohol is the main suffix, do not also show hydroxy.
  if (suffix.includes("ol") && feature.type === "alcohol") {
    return true;
  }

  // If thiol is the main suffix, do not also show sulfanyl.
  if (suffix.includes("thiol") && feature.type === "thiol") {
    return true;
  }

  // If amine is the main suffix, do not also show amino.
  if (suffix.includes("amine") && feature.type === "amine") {
    return true;
  }

  if (name.includes("anhydride") || suffix.includes("anhydride")) {
    return new Set<string>([
      "ester",
      "ketone",
      "aldehyde",
      "acidChloride",
      "carboxylicAcid",
      "alkoxycarbonyl",
      "carbonyl",
      "alkoxy",
    ]).has(feature.type);
  }

  if (suffix.includes("oic acid")) {
    return new Set<string>([
      "carboxylicAcid",
      "aldehyde",
      "ketone",
      "carbonyl",
    ]).has(feature.type);
  }

  if (suffix.includes("amide")) {
    return new Set<string>([
      "amide",
      "amine",
      "carbonyl",
    ]).has(feature.type);
  }

  if (suffix.includes("oate")) {
    return new Set<string>([
      "ester",
      "ether",
      "alkoxy",
      "carbonyl",
    ]).has(feature.type);
  }

  return false;
}

export function getParentStrategy(
  primaryGroup: FunctionalGroupResult | null
): "default" | "acyl" {
  const suffix = primaryGroup?.suffix?.toLowerCase().replace(/^-/, "") ?? "";
  const name = primaryGroup?.name?.toLowerCase() ?? "";

  if (
    suffix === "al" ||
    suffix === "oic acid" ||
    suffix === "oate" ||
    suffix === "amide" ||
    suffix.includes("nitrile") ||
    name.includes("aldehyde") ||
    name.includes("carboxylic acid") ||
    name.includes("ester") ||
    name.includes("amide") ||
    name.includes("nitrile")
  ) {
    return "acyl";
  }

  return "default";
}