import type {
  NamingFeature,
  ParentDescriptor,
  ParsedMol,
  Substituent,
} from "./types";

import type { FunctionalGroupResult } from "../functionalGroups/types";

import { formatLocants } from "./formatUtils";
import { getSimpleBenzeneDerivativeName } from "./aromaticNames";
import { getParentDescriptor, getParentStemWithUnsaturation, getBestAcylParentDescriptor } from "./parentSelection";
import { detectNamingFeatures, getCarboxylicAcidCarbons } from "./featureDetection";



import {
  detectSubstituents,
  formatSubstituents,
  omitUnnecessaryRingLocant,
} from "./substituents";

export type EstimatedIupacResult = {
  estimatedName: string;
  parent: ParentDescriptor;
  features: NamingFeature[];
  primaryFeature: NamingFeature | null;
  substituents: Substituent[];
};

function getPrimaryFunctionalGroup(
  functionalGroups: FunctionalGroupResult[] = [],
  mainGroup: FunctionalGroupResult | null = null
) {
  return (
    mainGroup ??
    [...functionalGroups]
      .filter((group) => typeof group.nomenclaturePriority === "number")
      .sort((a, b) => a.nomenclaturePriority - b.nomenclaturePriority)[0] ??
    null
  );
}

function getParentStrategy(group: FunctionalGroupResult | null) {
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

export function buildEstimatedIupacName(
  parsedMol: ParsedMol,
  functionalGroups: FunctionalGroupResult[] = [],
  mainGroup: FunctionalGroupResult | null = null
): EstimatedIupacResult | null {
  const defaultParent = getParentDescriptor(parsedMol);
  const primaryGroup = getPrimaryFunctionalGroup(functionalGroups, mainGroup);

  const parent =
    getParentStrategy(primaryGroup) === "acyl"
      ? getBestAcylParentDescriptor(parsedMol) ?? defaultParent
      : defaultParent;

  const features = detectNamingFeatures(parsedMol, parent);
  const primaryFeature = features[0] ?? null;

  const aromaticAcidOverride = getAromaticAcidOverride(
    parsedMol,
    parent,
    features
  );

  if (aromaticAcidOverride) return aromaticAcidOverride;

  const suffixName =
    buildFunctionalGroupSuffixName(parsedMol, parent, primaryGroup) ??
    buildSuffixName(parsedMol, parent, primaryFeature);

  if (!suffixName) return null;

  const prefixString = buildPrefixString(
    features,
    primaryFeature,
  );

  const substituents = detectSubstituents(parsedMol, parent);
  const branchString = buildSubstituentPrefix(substituents, parent);

  const aromaticCommonName = getAromaticCommonName(
    parent,
    substituents,
    primaryFeature
  );

  const estimatedName =
    aromaticCommonName ??
    [branchString, prefixString, suffixName].filter(Boolean).join("");

  return {
    estimatedName,
    parent,
    features,
    primaryFeature,
    substituents,
  };
}

function getAromaticAcidOverride(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  features: NamingFeature[]
): EstimatedIupacResult | null {
  const aromaticAcidCarbonCount = parent.aromaticRing
    ? getCarboxylicAcidCarbons(parsedMol).length
    : 0;

  if (!parent.aromaticRing || aromaticAcidCarbonCount === 0) {
    return null;
  }

  const benzoicAcidFeature: NamingFeature = {
    type: "carboxylicAcid",
    locants: [1],
    suffix: "oic acid",
    prefix: "carboxy",
    priority: 1,
  };

  return {
    estimatedName: "benzoic acid",
    parent,
    features: [benzoicAcidFeature, ...features],
    primaryFeature: benzoicAcidFeature,
    substituents: [],
  };
}

function buildSubstituentPrefix(
  substituents: Substituent[],
  parent: ParentDescriptor
) {
  const branchString = formatSubstituents(substituents);

  return omitUnnecessaryRingLocant(
    branchString,
    parent,
    substituents.length
  );
}

function getAromaticCommonName(
  parent: ParentDescriptor,
  substituents: Substituent[],
  primaryFeature: NamingFeature | null
) {
  if (!parent.aromaticRing) return null;
  if (primaryFeature) return null;

  if (substituents.length === 0) return "benzene";

  if (substituents.length === 1) {
    const sub = substituents[0];

    if (sub.name === "methyl") return "toluene";
    if (sub.name === "ethyl") return "ethylbenzene";
    if (sub.name === "methoxy") return "anisole";
    if (sub.name === "ethenyl" || sub.name === "vinyl") return "styrene";
    if (sub.name === "propan-2-yl") return "cumene";

    return `${sub.name}benzene`;
  }

  return null;
}

function buildFunctionalGroupSuffixName(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  primaryGroup: FunctionalGroupResult | null
) {
  if (!primaryGroup) return null;
  if (!parent.parentStem || !parent.parentHydrocarbon) return null;

  const suffix = primaryGroup.suffix;
  if (!suffix || suffix.toLowerCase().includes("never suffix")) return null;

  const parentStem = getParentStemWithUnsaturation(parsedMol, parent);
  if (!parentStem) return null;

  const cleanSuffix = suffix.replace(/^-/, "");

  if (cleanSuffix === "oic anhydride") return `${parentStem}oic anhydride`;
  if (cleanSuffix === "oic acid") return `${parentStem}oic acid`;
  if (cleanSuffix === "oate") return `${parentStem}oate`;
  if (cleanSuffix === "amide") return `${parentStem}amide`;
  if (cleanSuffix === "nitrile") return `${parent.parentHydrocarbon}nitrile`;

  return `${parentStem}${cleanSuffix}`;
}

export function buildSuffixName(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  primaryFeature: NamingFeature | null
) {
  if (!parent.parentStem || !parent.parentHydrocarbon) return null;
  if (!primaryFeature) return parent.parentHydrocarbon;

  const parentStem = getParentStemWithUnsaturation(parsedMol, parent);
  if (!parentStem) return null;

  if (parent.kind === "ring") {
    if (parent.aromaticRing) {
      return getSimpleBenzeneDerivativeName(primaryFeature);
    }

    if (primaryFeature.type === "ketone") {
      return `${parent.parentStem}one`;
    }

    if (primaryFeature.type === "alcohol") {
      return `${parent.parentStem}ol`;
    }

    if (primaryFeature.type === "amine") {
      return `${parent.parentStem}amine`;
    }

    if (primaryFeature.type === "thiol") {
      return `${parent.parentStem}ethiol`;
    }

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
    if (count > 1) {
      return `${parentStem}-${locants.join(",")}-${multiplier}amine`;
    }

    if (parent.carbonCount <= 2) {
      return `${parentStem}amine`;
    }

    return `${parentStem}-${locants[0]}-amine`;
  }

  if (feature.type === "nitrile") {
    const alkaneName = parent.parentHydrocarbon ?? parentStem;

    if (count > 1) {
      return `${alkaneName}dinitrile`;
    }

    return `${alkaneName}nitrile`;
  }

  if (count > 1) {
    return `${parentStem}-${locants.join(",")}-${multiplier}${feature.suffix}`;
  }

  if (shouldOmitSingleLocant(parent, feature)) {
    return `${parentStem}${feature.suffix}`;
  }

  return `${parentStem}-${locants[0]}-${feature.suffix}`;
}

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

export function formatPrefix(feature: NamingFeature) {
  if (feature.locants.length === 0) return feature.prefix;

  const multiplier = getMultiplier(feature.locants.length);
  return `${formatLocants(feature.locants)}-${multiplier}${feature.prefix}`;
}

export function shouldOmitSingleLocant(
  parent: ParentDescriptor,
  feature: NamingFeature
) {
  return (
    feature.locants.length === 1 &&
    ((feature.type === "alcohol" && parent.carbonCount <= 2) ||
      (feature.type === "ketone" && parent.carbonCount <= 3))
  );
}

export function formatDisplayName(
  iupacName: string,
  commonName: string | null
) {
  return commonName ? `${iupacName} (${commonName})` : iupacName;
}

export function getMultiplier(count: number) {
  if (count === 2) return "di";
  if (count === 3) return "tri";
  if (count === 4) return "tetra";
  if (count === 5) return "penta";
  if (count === 6) return "hexa";
  return "";
}