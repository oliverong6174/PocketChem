import type { FunctionalGroupResult } from "../../functionalGroups/types";

import type {
  NamingFeature,
  ParentDescriptor,
  ParsedMol,
} from "../types";

import { getSimpleBenzeneDerivativeName } from "./aromaticNames";
import { getParentStemWithUnsaturation } from "../graph/parentSelection";
import { getNamingIntent } from "./namingIntent";

function buildAromaticRingSuffixName(feature: NamingFeature) {
  if (feature.locants.length === 0) return null;

  const locants = [...feature.locants].sort((a, b) => a - b);

  // Single retained aromatic names are okay:
  // phenol, aniline, thiophenol, etc.
  if (locants.length === 1) {
    return getSimpleBenzeneDerivativeName(feature);
  }

  const suffix = getAromaticDirectSuffix(feature);
  if (!suffix) return null;

  const multiplier = getSuffixMultiplier(locants.length, suffix);

  return `benzene-${locants.join(",")}-${multiplier}${suffix}`;
}

function getAromaticDirectSuffix(feature: NamingFeature) {
  // This is intentionally generic for suffix-bearing groups directly attached
  // to aromatic ring atoms. Add future suffix features here if they behave
  // as direct benzene suffixes.
  if (feature.type === "alcohol") return "ol";
  if (feature.type === "amine") return "amine";
  if (feature.type === "thiol") return "thiol";

  // Ring ketones are not normal retained benzene derivatives.
  // Aromatic acyl groups are handled by ringNomenclature.ts.
  return null;
}

function isHydrocarbonOnlySuffix(cleanSuffix: string, groupName = "") {
  const normalizedSuffix = cleanSuffix
    .trim()
    .toLowerCase()
    .replace(/^-/, "")
    .replace(/-/g, "");

  const normalizedName = groupName.trim().toLowerCase();

  if (
    normalizedName === "alkane" ||
    normalizedName === "alkene" ||
    normalizedName === "alkyne" ||
    normalizedName === "hydrocarbon" ||
    normalizedName === "saturated hydrocarbon" ||
    normalizedName === "unsaturated hydrocarbon" ||
    normalizedName === "cyclic hydrocarbon" ||
    normalizedName.includes("alkene") ||
    normalizedName.includes("alkyne") ||
    normalizedName.includes("hydrocarbon")
  ) {
    return true;
  }

  if (
    normalizedSuffix === "ane" ||
    normalizedSuffix === "ene" ||
    normalizedSuffix === "yne" ||
    normalizedSuffix === "diene" ||
    normalizedSuffix === "triene" ||
    normalizedSuffix === "tetraene" ||
    normalizedSuffix === "pentaene" ||
    normalizedSuffix === "hexaene" ||
    normalizedSuffix === "diyne" ||
    normalizedSuffix === "triyne" ||
    normalizedSuffix === "tetrayne" ||
    normalizedSuffix === "pentayne" ||
    normalizedSuffix === "hexayne"
  ) {
    return true;
  }

  return normalizedSuffix.includes("en") && normalizedSuffix.includes("yn");
}

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

  const intent = getNamingIntent(primaryGroup);
  const cleanSuffix = intent.cleanSuffix;

  if (
    primaryFeature &&
    intent.featureType &&
    primaryFeature.type === intent.featureType
  ) {
    return buildPrimarySuffixName(unsaturatedStem, parent, primaryFeature);
  }

  if (intent.featureType && !primaryFeature) {
    return null;
  }

    if (isHydrocarbonOnlySuffix(cleanSuffix, primaryGroup.name)) {
  // Hydrocarbon-only groups like alkene/alkyne/cycloalkene should not
  // override a real suffix-bearing feature like ketone, alcohol, amine, etc.
  if (primaryFeature && isRealSuffixFeature(primaryFeature)) {
    return null;
  }

  return parent.parentHydrocarbon;
}

  if (cleanSuffix === "ane" || cleanSuffix === "ene" || cleanSuffix === "yne") {
    return parent.parentHydrocarbon;
  }

  if (parent.kind === "ring" && parent.aromaticRing && primaryFeature) {
    return buildAromaticRingSuffixName(primaryFeature);
  }

  if (primaryFeature && shouldUseDetectedFeatureSuffix(primaryFeature)) {
    return buildPrimarySuffixName(unsaturatedStem, parent, primaryFeature);
  }

  if (cleanSuffix === "oic anhydride") return `${unsaturatedStem}oic anhydride`;
  if (cleanSuffix === "oic acid") return `${unsaturatedStem}oic acid`;
  if (cleanSuffix === "enoic acid") return `${unsaturatedStem}oic acid`;
  if (cleanSuffix === "oate") return `${unsaturatedStem}oate`;
  if (cleanSuffix === "enoate") return `${unsaturatedStem}oate`;
  if (cleanSuffix === "amide") return `${unsaturatedStem}amide`;
  if (cleanSuffix === "enamide") return `${unsaturatedStem}amide`;
  if (cleanSuffix === "nitrile") return `${parent.parentHydrocarbon}nitrile`;

  if (
    primaryFeature &&
    ["one", "enone", "ol", "enol", "thiol", "amine"].includes(cleanSuffix)
  ) {
    return buildPrimarySuffixName(unsaturatedStem, parent, primaryFeature);
  }

  return `${unsaturatedStem}${cleanSuffix}`;
}

function shouldUseDetectedFeatureSuffix(feature: NamingFeature) {
  return (
    feature.type === "ester" ||
    feature.type === "carboxylicAcid" ||
    feature.type === "amide" ||
    feature.type === "acidChloride" ||
    feature.type === "aldehyde" ||
    feature.type === "nitrile" ||
    feature.type === "ketone" ||
    feature.type === "alcohol" ||
    feature.type === "amine" ||
    feature.type === "thiol"
  );
}

export function buildSuffixName(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  primaryFeature: NamingFeature | null
) {
  if (!parent.parentStem || !parent.parentHydrocarbon) return null;

  // No suffix-bearing functional group:
  // cyclohexane, methylcyclohexane, 1,4-dimethylcyclohexane, etc.
  if (!primaryFeature) {
    return parent.parentHydrocarbon;
  }

  // Alkene/alkyne are already built into parent.parentHydrocarbon.
  // Do not append them again as suffixes.
  if (primaryFeature.type === "alkene" || primaryFeature.type === "alkyne") {
    return parent.parentHydrocarbon;
  }

  if (parent.kind === "ring") {
    if (parent.aromaticRing) {
      return buildAromaticRingSuffixName(primaryFeature);
    }

    // Non-aromatic ring with no oxygen/nitrogen/sulfur/carbonyl suffix
    // should remain cycloalkane.
    if (!isRealSuffixFeature(primaryFeature)) {
      return parent.parentHydrocarbon;
    }

    if (primaryFeature.type === "ketone") {
      return buildPrimarySuffixName(parent.parentStem, parent, primaryFeature);
    }

    if (primaryFeature.type === "alcohol") {
      return buildPrimarySuffixName(parent.parentStem, parent, primaryFeature);
    }

    if (primaryFeature.type === "amine") {
      return buildPrimarySuffixName(parent.parentStem, parent, primaryFeature);
    }

    if (primaryFeature.type === "thiol") {
      return buildPrimarySuffixName(parent.parentStem, parent, primaryFeature);
    }

    return buildPrimarySuffixName(parent.parentStem, parent, primaryFeature);
  }

  const parentStem = getParentStemWithUnsaturation(parsedMol, parent);
  if (!parentStem) return null;

  return buildPrimarySuffixName(parentStem, parent, primaryFeature);
}

function isRealSuffixFeature(feature: NamingFeature) {
  return (
    feature.type === "ester" ||
    feature.type === "carboxylicAcid" ||
    feature.type === "amide" ||
    feature.type === "acidChloride" ||
    feature.type === "aldehyde" ||
    feature.type === "nitrile" ||
    feature.type === "ketone" ||
    feature.type === "alcohol" ||
    feature.type === "amine" ||
    feature.type === "thiol"
  );
}

function getSuffixMultiplier(count: number, suffix: string) {
  const multiplier = getMultiplier(count);
  if (!multiplier) return "";

  const cleanSuffix = suffix.trim().toLowerCase();
  const startsWithVowel = /^[aeiou]/.test(cleanSuffix);

  // For suffixes beginning with vowels:
  // tetra + ol    -> tetrol
  // penta + ol    -> pentol
  // hexa + ol     -> hexol
  // tetra + one   -> tetrone
  // tetra + amine -> tetramine
  //
  // But di/tri stay:
  // di + ol       -> diol
  // tri + ol      -> triol
  if (startsWithVowel && multiplier.endsWith("a")) {
    return multiplier.slice(0, -1);
  }

  return multiplier;
}

function getParentBaseForSuffix(
  parentStem: string,
  parent: ParentDescriptor,
  suffix: string,
  multiplier = ""
) {
  const fullSuffix = `${multiplier}${suffix}`.trim().toLowerCase();
  const parentHydrocarbon = parent.parentHydrocarbon ?? parentStem;

  return suffixDropsTerminalE(fullSuffix)
    ? parentStem
    : parentHydrocarbon;
}

function suffixDropsTerminalE(fullSuffix: string) {
  const firstWord = fullSuffix.split(/\s+/)[0] ?? fullSuffix;

  // Drop terminal e only when the ACTUAL attached suffix begins with a vowel:
  //
  // propane + ol       -> propan-2-ol
  // propane + one      -> propan-2-one
  // propane + al       -> propanal
  // propane + amine    -> propan-2-amine
  // propane + oic acid -> propanoic acid
  //
  // Keep terminal e when the multiplier makes the suffix consonant-starting:
  //
  // ethane + diol      -> ethane-1,2-diol
  // propane + triol    -> propane-1,2,3-triol
  // butane + tetrol    -> butane-1,2,3,4-tetrol
  // butane + dione     -> butane-2,3-dione
  // ethane + diamine   -> ethane-1,2-diamine
  // propane + dithiol  -> propane-1,3-dithiol
  //
  // Also keep e for naturally consonant suffixes:
  //
  // propane + thiol    -> propane-2-thiol
  // propane + nitrile  -> propanenitrile
  return /^[aeiou]/.test(firstWord);
}

function joinSuffixWithoutLocant(
  parentStem: string,
  parent: ParentDescriptor,
  suffix: string,
  multiplier = ""
) {
  const base = getParentBaseForSuffix(parentStem, parent, suffix, multiplier);
  return `${base}${multiplier}${suffix}`;
}

function joinSuffixWithLocants(
  parentStem: string,
  parent: ParentDescriptor,
  suffix: string,
  locants: number[],
  multiplier = ""
) {
  const base = getParentBaseForSuffix(parentStem, parent, suffix, multiplier);

  if (locants.length === 0) {
    return `${base}${multiplier}${suffix}`;
  }

  return `${base}-${locants.join(",")}-${multiplier}${suffix}`;
}

function isTerminalSuffixFeature(feature: NamingFeature) {
  const suffix = feature.suffix.trim().toLowerCase();

  return (
    feature.type === "carboxylicAcid" ||
    feature.type === "amide" ||
    feature.type === "aldehyde" ||
    feature.type === "nitrile" ||
    suffix === "oic acid" ||
    suffix === "amide" ||
    suffix === "al" ||
    suffix === "nitrile"
  );
}

function getTerminalSuffix(feature: NamingFeature) {
  if (feature.type === "carboxylicAcid") return "oic acid";
  if (feature.type === "amide") return "amide";
  if (feature.type === "aldehyde") return "al";
  if (feature.type === "nitrile") return "nitrile";

  return feature.suffix;
}

export function buildPrimarySuffixName(
  parentStem: string,
  parent: ParentDescriptor,
  feature: NamingFeature
) {
  const locants = feature.locants;
  const count = locants.length;
  const multiplier = getSuffixMultiplier(count, feature.suffix);

  // Terminal/acyl-like suffixes do not get parent-chain locants.
  // Correct:
  // ethanamide, ethanoic acid, ethanal, ethanenitrile
  // Incorrect:
  // ethan-1-amide, ethan-1-oic acid, ethan-1-al, ethan-1-nitrile
  if (isTerminalSuffixFeature(feature)) {
    const suffix = getTerminalSuffix(feature);

    return joinSuffixWithoutLocant(
      parentStem,
      parent,
      suffix,
      count > 1 ? multiplier : ""
    );
  }

  if (feature.type === "ester") {
    const esterSuffix = joinSuffixWithoutLocant(
      parentStem,
      parent,
      "oate",
      count > 1 ? multiplier : ""
    );

    return `${feature.alkylName ?? "alkyl"} ${esterSuffix}`;
  }

  if (feature.type === "acidChloride") {
    return joinSuffixWithoutLocant(parentStem, parent, feature.suffix);
  }

  if (feature.type === "amine") {
    if (count > 1) {
      return joinSuffixWithLocants(
        parentStem,
        parent,
        "amine",
        locants,
        multiplier
      );
    }

    if (shouldOmitSingleLocant(parent, feature)) {
      return joinSuffixWithoutLocant(parentStem, parent, "amine");
    }

    return joinSuffixWithLocants(parentStem, parent, "amine", locants);
  }

  if (feature.type === "thiol") {
    if (count > 1) {
      return joinSuffixWithLocants(
        parentStem,
        parent,
        "thiol",
        locants,
        multiplier
      );
    }

    if (shouldOmitSingleLocant(parent, feature)) {
      return joinSuffixWithoutLocant(parentStem, parent, "thiol");
    }

    return joinSuffixWithLocants(parentStem, parent, "thiol", locants);
  }

  if (count > 1) {
    return joinSuffixWithLocants(
      parentStem,
      parent,
      feature.suffix,
      locants,
      multiplier
    );
  }

  if (shouldOmitSingleLocant(parent, feature)) {
    return joinSuffixWithoutLocant(parentStem, parent, feature.suffix);
  }

  return joinSuffixWithLocants(parentStem, parent, feature.suffix, locants);
}

export function shouldOmitSingleLocant(
  parent: ParentDescriptor,
  feature: NamingFeature
) {
  if (feature.locants.length !== 1) return false;

  const locant = feature.locants[0];

  return (
    (feature.type === "alcohol" && parent.carbonCount <= 2 && locant === 1) ||
    (feature.type === "ketone" && parent.carbonCount <= 3) ||
    (feature.type === "thiol" && parent.carbonCount <= 2 && locant === 1)
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