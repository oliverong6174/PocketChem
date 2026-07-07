import type { FunctionalGroupResult } from "../functionalGroups/types";

import type {
  NamingFeature,
  ParentDescriptor,
  ParsedMol,
  Substituent,
} from "./types";

import {
  getParentCandidateAtomsForPrimaryGroup,
  getParentDescriptor,
  getBestAcylParentDescriptor,
} from "./graph/parentSelection";

import { orientParentForPrimaryGroup } from "./graph/parentOrientation";
import { detectNamingFeatures } from "./featureDetection";
import { detectSubstituents } from "./substituents";

import {
  buildCombinedPrefixString,
} from "./nameBuilder/prefixBuilder";

import {
  buildFunctionalGroupSuffixName,
  buildSuffixName,
} from "./nameBuilder/suffixBuilder";

import { constructName } from "./nameBuilder/nameConstructor";
import { getPrimaryFunctionalGroup } from "./nameBuilder/primaryGroup";
import { getParentStrategy } from "./nameBuilder/parentStrategy";

import {
  getAromaticSuffixContext,
  orientAromaticParentForSuffix,
  type AromaticSuffixContext,
} from "./nameBuilder/ringNomenclature";

import {
  getNamingIntent,
  getPrimaryFeatureFromIntent,
} from "./nameBuilder/namingIntent";

type EstimatedIupacResult = {
  estimatedName: string;
  confidence: "low" | "medium" | "high";
  reason: string;
  parent: ParentDescriptor | null;
  features: NamingFeature[];
  primaryFeature: NamingFeature | null;
  substituents: Substituent[];
};

export function buildEstimatedIupacName(
  parsedMol: ParsedMol,
  functionalGroups: FunctionalGroupResult[],
  mainGroup: FunctionalGroupResult | null
): EstimatedIupacResult | null {
  if (!parsedMol || parsedMol.atoms.length === 0) {
    return {
      estimatedName: "Name not estimated yet",
      confidence: "low",
      reason: "Could not parse molecule.",
      parent: null,
      features: [],
      primaryFeature: null,
      substituents: [],
    };
  }
  const primaryGroup = getPrimaryFunctionalGroup(functionalGroups, mainGroup);
  const namingIntent = getNamingIntent(primaryGroup);

  const preferredParentAtoms = getParentCandidateAtomsForPrimaryGroup(
    parsedMol,
    primaryGroup
  );

  const defaultParent = getParentDescriptor(
    parsedMol,
    preferredParentAtoms
  );

  const initialAromaticSuffixContext =
    namingIntent.aromaticRetainedParentAllowed
      ? getAromaticSuffixContext(parsedMol, defaultParent, primaryGroup)
      : null;

  const unorientedParent =
    initialAromaticSuffixContext
      ? defaultParent
      : getParentStrategy(primaryGroup) === "acyl"
      ? getBestAcylParentDescriptor(parsedMol) ?? defaultParent
      : defaultParent;

  const parent = initialAromaticSuffixContext
    ? orientAromaticParentForSuffix(
        parsedMol,
        unorientedParent,
        initialAromaticSuffixContext
      )
    : orientParentForPrimaryGroup(
        parsedMol,
        unorientedParent,
        primaryGroup
      );

  const finalAromaticSuffixContext = initialAromaticSuffixContext
    ? getAromaticSuffixContext(parsedMol, parent, primaryGroup) ??
      initialAromaticSuffixContext
    : null;

  const features = detectNamingFeatures(parsedMol, parent);

  const primaryFeature = selectPrimaryFeature(
    features,
    namingIntent,
    finalAromaticSuffixContext,
    primaryGroup
  );

  const effectiveAromaticSuffixContext = getEffectiveAromaticSuffixContext(
  finalAromaticSuffixContext,
  primaryFeature
);

  const substituents = detectSubstituents(
  parsedMol,
  parent,
  features,
  effectiveAromaticSuffixContext?.representedExternalAtoms ?? new Set(),
  primaryGroup
);

  const suffixName =
    effectiveAromaticSuffixContext?.suffixName ??
    buildFunctionalGroupSuffixName(
      parsedMol,
      parent,
      primaryGroup,
      primaryFeature
    ) ??
    buildSuffixName(parsedMol, parent, primaryFeature);

  if (!suffixName) return null;

  const prefixString = buildCombinedPrefixString(
    features,
    primaryFeature,
    primaryGroup,
    substituents,
    parent
  );

  const simpleAromaticAlias = getSimpleAromaticAlias(
    parent,
    substituents,
    primaryGroup,
    primaryFeature,
    finalAromaticSuffixContext
  );

  const estimatedName =
    simpleAromaticAlias ??
    constructFinalName(prefixString, suffixName, primaryFeature);

  return {
      estimatedName,
      confidence: "medium",
      reason: "Estimated from detected parent chain, suffix group, and substituents.",
      parent,
      features,
      primaryFeature,
      substituents,
    };
}

function constructFinalName(
  prefixString: string,
  suffixName: string,
  primaryFeature: NamingFeature | null
) {
  if (primaryFeature?.type === "ester" && primaryFeature.alkylName) {
    const alkylPart = primaryFeature.alkylName;
    const esterPrefix = `${alkylPart} `;

    if (suffixName.startsWith(esterPrefix)) {
      const acylPart = suffixName.slice(esterPrefix.length);

      return `${alkylPart} ${constructName([
        prefixString,
        acylPart,
      ])}`;
    }
  }

  return constructName([prefixString, suffixName]);
}

function getSimpleAromaticAlias(
  parent: ParentDescriptor,
  substituents: Substituent[],
  primaryGroup: FunctionalGroupResult | null,
  primaryFeature: NamingFeature | null,
  aromaticSuffixContext: { suffixName: string } | null
) {
  if (!parent.aromaticRing) return null;

  // Retained aromatic functional parents are base/suffix names, not complete
  // final names. Otherwise prefixes such as 4-amino in 4-aminobenzoic acid get
  // thrown away.
  if (primaryGroup || primaryFeature || aromaticSuffixContext) return null;

  if (substituents.length !== 1) return null;

  const sub = substituents[0];

  if (sub.name === "methyl") return "toluene";
  if (sub.name === "ethyl") return "ethylbenzene";
  if (sub.name === "methoxy") return "anisole";
  if (sub.name === "ethenyl" || sub.name === "vinyl") return "styrene";
  if (sub.name === "propan-2-yl") return "cumene";

  return null;
}

function getEffectiveAromaticSuffixContext(
  context: AromaticSuffixContext | null,
  primaryFeature: NamingFeature | null
) {
  if (!context) return null;
  if (!primaryFeature) return context;

  const sameFeatureType =
    context.primaryFeature.type === primaryFeature.type;

  const primaryHasMoreRepresentedGroups =
    primaryFeature.locants.length > context.primaryFeature.locants.length;

  if (sameFeatureType && primaryHasMoreRepresentedGroups) {
    return null;
  }

  return context;
}

function selectPrimaryFeature(
  features: NamingFeature[],
  namingIntent: ReturnType<typeof getNamingIntent>,
  aromaticContext: AromaticSuffixContext | null,
  primaryGroup: FunctionalGroupResult | null
) {
  let detectedFeature: NamingFeature | null = null;

  const featureFromIntent = getPrimaryFeatureFromIntent(
    features,
    namingIntent
  );

  if (featureFromIntent) {
    detectedFeature = featureFromIntent;
  } else if (!namingIntent.featureType) {
    // If primaryGroup is hydrocarbon-only or informational, still allow
    // real detected suffix features like ketone/alcohol/amine to win.
    detectedFeature = features[0] ?? null;
  } else if (!primaryGroup) {
    detectedFeature = features[0] ?? null;
  }

  if (!aromaticContext) return detectedFeature;

  if (!detectedFeature) return aromaticContext.primaryFeature;

  const sameFeatureType =
    detectedFeature.type === aromaticContext.primaryFeature.type;

  const detectedHasMoreLocants =
    detectedFeature.locants.length >
    aromaticContext.primaryFeature.locants.length;

  if (sameFeatureType && detectedHasMoreLocants) {
    return detectedFeature;
  }

  return aromaticContext.primaryFeature;
}