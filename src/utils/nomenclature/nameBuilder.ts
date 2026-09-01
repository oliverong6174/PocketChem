import type { FunctionalGroupResult } from "../functionalGroups/types";

import type {
  NamingFeature,
  NamingStatus,
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
  getRenderedRingSuffixName,
  getRingSuffixContext,
  orientRingParentForSuffix,
  type RingSuffixContext,
} from "./nameBuilder/ringNomenclature";

import {
  getNamingIntent,
  getPrimaryFeatureFromIntent,
} from "./nameBuilder/namingIntent";

import { getExoticParentDescriptor } from "./nameBuilder/exoticParents";

import {
  getRetainedHeterocycleSpecsFromGroups,
} from "./nameBuilder/functionalGroupNaming";
import { getWholeMoleculeRetainedName } from "./nameBuilder/retainedNames";
import { getFunctionalClassName } from "./nameBuilder/functionalClassNames";
import { getNamingGuardResult } from "./nameBuilder/namingGuard";

type EstimatedIupacResult = {
  estimatedName: string;
  confidence: "low" | "medium" | "high";
  status: NamingStatus;
  reason: string;
  parent: ParentDescriptor | null;
  features: NamingFeature[];
  primaryFeature: NamingFeature | null;
  substituents: Substituent[];
  parentIndependent?: boolean;
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
      status: "unsupported",
      reason: "Could not parse molecule.",
      parent: null,
      features: [],
      primaryFeature: null,
      substituents: [],
    };
  }
  const retainedWholeMoleculeName = getWholeMoleculeRetainedName(
    parsedMol,
    functionalGroups,
    mainGroup
  );

  if (retainedWholeMoleculeName) {
    return {
      estimatedName: retainedWholeMoleculeName,
      confidence: "high",
      status: "retained",
      reason: "Recognized a complete retained-name scaffold from the functional-group pattern registry.",
      parent: null,
      features: [],
      primaryFeature: null,
      substituents: [],
      parentIndependent: true,
    };
  }

  const rawPrimaryGroup = getPrimaryFunctionalGroup(functionalGroups, mainGroup);
  const rawNamingIntent = getNamingIntent(rawPrimaryGroup);

  // Some O-chem families are more legible as functional-class names than as
  // forced hydrocarbon suffixes (e.g. dimethyl sulfoxide, methyl hydroperoxide,
  // ethylboronic acid). Use that route only when no structurally supported
  // principal suffix is competing for the molecule.
  if (!rawNamingIntent.featureType) {
    const functionalClassName = getFunctionalClassName(
      parsedMol,
      functionalGroups,
      mainGroup
    );

    if (functionalClassName) {
      return {
        estimatedName: functionalClassName.name,
        confidence: functionalClassName.confidence,
        status: "functional-class",
        reason: functionalClassName.reason,
        parent: null,
        features: [],
        primaryFeature: null,
        substituents: [],
        parentIndependent: true,
      };
    }
  }

  const namingGuard = getNamingGuardResult(rawPrimaryGroup);
  if (namingGuard.blocked) {
    return {
      estimatedName: "Name not yet supported",
      confidence: "low",
      status: "unsupported",
      reason: namingGuard.reason ?? "Recognized functional group is not yet safely nameable.",
      parent: null,
      features: [],
      primaryFeature: null,
      substituents: [],
      parentIndependent: true,
    };
  }

      const retainedHeterocycleSpecs =
        getRetainedHeterocycleSpecsFromGroups(functionalGroups);

      const exoticParent = getExoticParentDescriptor(
        parsedMol,
        retainedHeterocycleSpecs
      );

      const neutralParent = getParentDescriptor(parsedMol, []);
      const neutralFeatures = detectNamingFeatures(parsedMol, neutralParent);

  const primaryGroup = validatePrimaryGroupAgainstStructuralFeatures(
    parsedMol,
    rawPrimaryGroup,
    neutralFeatures
  );

const namingIntent = getNamingIntent(primaryGroup);

const preferredParentAtoms = getParentCandidateAtomsForPrimaryGroup(
  parsedMol,
  primaryGroup
);

  const carbonDefaultParent = getParentDescriptor(
    parsedMol,
    preferredParentAtoms
  );

  const shouldUseExoticParent =
    exoticParent !== null &&
    primaryGroup === null &&
    !neutralFeatures.some(isStructurallyReliableSuffixFeature);

  const defaultParent = shouldUseExoticParent
    ? exoticParent
    : carbonDefaultParent;

  const initialRingSuffixContext = getRingSuffixContext(
  parsedMol,
  defaultParent,
  primaryGroup
);

const shouldUseAcylParent =
  !shouldUseExoticParent &&
  getParentStrategy(primaryGroup) === "acyl" &&
  preferredParentAtoms.length > 0;

const unorientedParent =
  initialRingSuffixContext
    ? defaultParent
    : shouldUseAcylParent
    ? getBestAcylParentDescriptor(parsedMol, preferredParentAtoms) ?? defaultParent
    : defaultParent;

const parentBeforeAromaticOrientation =
  shouldUseExoticParent
    ? unorientedParent
    : orientParentForPrimaryGroup(
        parsedMol,
        unorientedParent,
        primaryGroup
      );

const parent =
  initialRingSuffixContext && !shouldUseExoticParent
    ? orientRingParentForSuffix(
        parsedMol,
        parentBeforeAromaticOrientation,
        initialRingSuffixContext
      )
    : parentBeforeAromaticOrientation;

  const finalRingSuffixContext = initialRingSuffixContext
    ? getRingSuffixContext(parsedMol, parent, primaryGroup) ??
      initialRingSuffixContext
    : null;

  const features = detectNamingFeatures(parsedMol, parent);

  const primaryFeature = selectPrimaryFeature(
    features,
    namingIntent,
    finalRingSuffixContext,
    primaryGroup
  );

  const effectiveRingSuffixContext = getEffectiveRingSuffixContext(
  finalRingSuffixContext,
  primaryFeature
);

  const substituents = detectSubstituents(
  parsedMol,
  parent,
  features,
  effectiveRingSuffixContext?.representedExternalAtoms ?? new Set(),
  primaryGroup
);

  const suffixName = effectiveRingSuffixContext
    ? getRenderedRingSuffixName(
        parent,
        effectiveRingSuffixContext,
        substituents.length
      )
    : buildFunctionalGroupSuffixName(
        parsedMol,
        parent,
        primaryGroup,
        primaryFeature
      ) ?? buildSuffixName(parsedMol, parent, primaryFeature);

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
    finalRingSuffixContext
  );

  const estimatedName =
    simpleAromaticAlias ??
    constructFinalName(prefixString, suffixName, primaryFeature);

  return {
      estimatedName,
      confidence: "medium",
      status: "systematic",
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
  ringSuffixContext: { suffixName: string } | null
) {
  if (!parent.aromaticRing) return null;
  if (parent.parentHydrocarbon !== "benzene") return null;

  // Retained aromatic functional parents are base/suffix names, not complete
  // final names. Otherwise prefixes such as 4-amino in 4-aminobenzoic acid get
  // thrown away.
  if (primaryGroup || primaryFeature || ringSuffixContext) return null;

  if (substituents.length !== 1) return null;

  const sub = substituents[0];

  if (sub.name === "methyl") return "toluene";
  if (sub.name === "ethyl") return "ethylbenzene";
  if (sub.name === "methoxy") return "anisole";
  if (sub.name === "ethenyl" || sub.name === "vinyl") return "styrene";
  if (sub.name === "propan-2-yl") return "cumene";

  return null;
}

function getEffectiveRingSuffixContext(
  context: RingSuffixContext | null,
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
  aromaticContext: RingSuffixContext | null,
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

function validatePrimaryGroupAgainstStructuralFeatures(
  parsedMol: ParsedMol,
  primaryGroup: FunctionalGroupResult | null,
  structuralFeatures: NamingFeature[]
) {
  if (!primaryGroup) return null;

  const intent = getNamingIntent(primaryGroup);

  if (!intent.featureType) {
    return null;
  }

  // First validate globally, not only against the neutral parent.
  // This fixes aryl ketones like:
  // HO-Ph-CH2-CH2-C(=O)-CH3
  // where the neutral parent may be phenol, but the true principal group
  // is a side-chain ketone.
  const candidateAtoms = getParentCandidateAtomsForPrimaryGroup(
    parsedMol,
    primaryGroup
  );

  if (candidateAtoms.length > 0) {
    return primaryGroup;
  }

  const hasMatchingStructuralFeature = structuralFeatures.some(
    (feature) => feature.type === intent.featureType
  );

  if (hasMatchingStructuralFeature) {
    return primaryGroup;
  }

  const hasAnyStructuralSuffixFeature = structuralFeatures.some(
    isStructurallyReliableSuffixFeature
  );

  if (hasAnyStructuralSuffixFeature) {
    return null;
  }

  return primaryGroup;
}

function isStructurallyReliableSuffixFeature(feature: NamingFeature) {
  return (
    feature.type === "peroxyAcid" ||
    feature.type === "carboxylicAcid" ||
    feature.type === "acylAzide" ||
    feature.type === "ester" ||
    feature.type === "amide" ||
    feature.type === "acidChloride" ||
    feature.type === "aldehyde" ||
    feature.type === "ketone" ||
    feature.type === "nitrile" ||
    feature.type === "alcohol" ||
    feature.type === "amine" ||
    feature.type === "thiol" ||
    feature.type === "sulfonicAcid" ||
    feature.type === "sulfinicAcid" ||
    feature.type === "sulfenicAcid" ||
    feature.type === "sulfonamide" ||
    feature.type === "imine" ||
    feature.type === "thioaldehyde" ||
    feature.type === "thioketone" ||
    feature.type === "thioamide" ||
    feature.type === "thiocarboxylicAcid"
  );
}