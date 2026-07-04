import type { FunctionalGroupResult } from "../../functionalGroups/types";

import type {
  NamingFeature,
  ParentDescriptor,
  ParsedMol,
} from "../types";

import { getSimpleBenzeneDerivativeName } from "./aromaticNames";
import { getParentStemWithUnsaturation } from "../graph/parentSelection";

export function buildFunctionalGroupSuffixName(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  primaryGroup: FunctionalGroupResult | null,
  primaryFeature: NamingFeature | null
) {
  if (!primaryGroup) return null;
  if (!parent.parentStem || !parent.parentHydrocarbon) return null;

  const suffix = primaryGroup.suffix;
  if (!suffix || suffix.toLowerCase().includes("never suffix")) return null;

  const saturatedStem = parent.parentStem;
  const unsaturatedStem = getParentStemWithUnsaturation(parsedMol, parent);

  if (!saturatedStem || !unsaturatedStem) return null;

  const cleanSuffix = suffix.replace(/^-/, "");

if (cleanSuffix === "ane" || cleanSuffix === "ene" || cleanSuffix === "yne") {
  return parent.parentHydrocarbon;
}

  if (cleanSuffix === "oic anhydride") return `${unsaturatedStem}oic anhydride`;
  if (cleanSuffix === "oic acid") return `${unsaturatedStem}oic acid`;
  if (cleanSuffix === "oate") return `${unsaturatedStem}oate`;
  if (cleanSuffix === "amide") return `${unsaturatedStem}amide`;
  if (cleanSuffix === "nitrile") return `${parent.parentHydrocarbon}nitrile`;

  if (
    primaryFeature &&
    ["one", "ol", "thiol", "amine"].includes(cleanSuffix)
  ) {
    return buildLocantedSuffix(
      unsaturatedStem,
      primaryFeature.locants,
      cleanSuffix
    );
  }

  if (
    primaryFeature &&
    ["one", "ol", "thiol", "amine"].includes(cleanSuffix)
  ) {
    return buildLocantedSuffix(
      saturatedStem,
      primaryFeature.locants,
      cleanSuffix
    );
  } 

  return `${unsaturatedStem}${cleanSuffix}`;
}

function buildLocantedSuffix(
  parentStem: string,
  locants: number[],
  suffix: string
) {
  if (locants.length === 0) return `${parentStem}${suffix}`;

  const multiplier = getMultiplier(locants.length);

  if (locants.length === 1) {
    return `${parentStem}-${locants[0]}-${suffix}`;
  }

  return `${parentStem}-${locants.join(",")}-${multiplier}${suffix}`;
}
  


export function buildSuffixName(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  primaryFeature: NamingFeature | null
) {
  if (!parent.parentStem || !parent.parentHydrocarbon) return null;
  if (!primaryFeature) return parent.parentHydrocarbon;
  if (primaryFeature.type === "alkene" || primaryFeature.type === "alkyne") {
    return parent.parentHydrocarbon;
  }

  const parentStem = getParentStemWithUnsaturation(parsedMol, parent);
  if (!parentStem) return null;

  if (parent.kind === "ring") {
    if (parent.aromaticRing) {
      return getSimpleBenzeneDerivativeName(primaryFeature);
    }

    if (primaryFeature.type === "ketone") return `${parent.parentStem}one`;
    if (primaryFeature.type === "alcohol") return `${parent.parentStem}ol`;
    if (primaryFeature.type === "amine") return `${parent.parentStem}amine`;
    if (primaryFeature.type === "thiol") return `${parent.parentStem}ethiol`;

    return `${parent.parentHydrocarbon} with ${primaryFeature.suffix}`;
  }

  return buildPrimarySuffixName(parentStem, parent, primaryFeature);
}

export function buildPrimarySuffixName(
  parentStem: string,
  parent: ParentDescriptor,
  feature: NamingFeature
) {
  const locants = feature.locants;
  const count = locants.length;
  const multiplier = getMultiplier(count);

  if (feature.type === "ester") {
    return `${feature.alkylName ?? "alkyl"} ${parentStem}oate`;
  }

  if (feature.type === "acidChloride") {
    return `${parentStem}${feature.suffix}`;
  }

  if (feature.type === "carboxylicAcid") {
    return count > 1 ? `${parentStem}edioic acid` : `${parentStem}oic acid`;
  }

  if (feature.type === "aldehyde") {
    return count > 1 ? `${parentStem}${multiplier}al` : `${parentStem}al`;
  }

  if (feature.type === "amine") {
    if (count > 1) return `${parentStem}-${locants.join(",")}-${multiplier}amine`;
    if (parent.carbonCount <= 2) return `${parentStem}amine`;
    return `${parentStem}-${locants[0]}-amine`;
  }

  if (feature.type === "nitrile") {
    const alkaneName = parent.parentHydrocarbon ?? parentStem;
    return count > 1 ? `${alkaneName}dinitrile` : `${alkaneName}nitrile`;
  }

  if (feature.type === "thiol") {
  if (count > 1) {
    return `${parentStem}-${locants.join(",")}-${multiplier}thiol`;
  }

  return `${parentStem}-${locants[0]}-thiol`;
}

  if (count > 1) {
    return `${parentStem}-${locants.join(",")}-${multiplier}${feature.suffix}`;
  }

  if (shouldOmitSingleLocant(parent, feature)) {
    return `${parentStem}${feature.suffix}`;
  }

  return `${parentStem}-${locants[0]}-${feature.suffix}`;
}

export function shouldOmitSingleLocant(
  parent: ParentDescriptor,
  feature: NamingFeature
) {
  return (
    feature.locants.length === 1 &&
    ((feature.type === "alcohol" && parent.carbonCount <= 2) ||
      (feature.type === "ketone" && parent.carbonCount <= 3)) || 
      (feature.type === "thiol" && parent.carbonCount <= 2)
  );
}

export function getMultiplier(count: number) {
  if (count === 2) return "di";
  if (count === 3) return "tri";
  if (count === 4) return "tetra";
  if (count === 5) return "penta";
  if (count === 6) return "hexa";
  return "";
}