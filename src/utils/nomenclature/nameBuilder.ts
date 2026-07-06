import type {
  NamingFeature,
  ParentDescriptor,
  ParsedMol,
  Substituent,
} from "./types";

import type { FunctionalGroupResult } from "../functionalGroups/types";

import { getPrimaryFunctionalGroup } from "./nameBuilder/primaryGroup";
import { getParentStrategy } from "./nameBuilder/parentStrategy";

import { constructName } from "./nameBuilder/nameConstructor";
import {
  buildFunctionalGroupSuffixName,
  buildSuffixName,
} from "./nameBuilder/suffixBuilder";

import { buildCombinedPrefixString } from "./nameBuilder/prefixBuilder";



import {
  getParentCandidateAtomsForPrimaryGroup,
  getParentDescriptor,
  getBestAcylParentDescriptor,
} from "./graph/parentSelection";

import { detectNamingFeatures } from "./featureDetection";

import {
  getAromaticSuffixContext,
  orientAromaticParentForSuffix,
} from "./nameBuilder/ringNomenclature";

import {
  detectSubstituents,
} from "./substituents";


import { orientParentForPrimaryGroup } from "./graph/parentOrientation";

export type EstimatedIupacResult = {
  estimatedName: string;
  parent: ParentDescriptor;
  features: NamingFeature[];
  primaryFeature: NamingFeature | null;
  substituents: Substituent[];
};

export function buildEstimatedIupacName(
  parsedMol: ParsedMol,
  functionalGroups: FunctionalGroupResult[] = [],
  mainGroup: FunctionalGroupResult | null = null
): EstimatedIupacResult | null {
    const primaryGroup = getPrimaryFunctionalGroup(functionalGroups, mainGroup);

    const preferredParentAtoms = getParentCandidateAtomsForPrimaryGroup(
      parsedMol,
      primaryGroup
    );

    const defaultParent = getParentDescriptor(
      parsedMol,
      preferredParentAtoms
    );

    const aromaticSuffixContext = getAromaticSuffixContext(
      parsedMol,
      defaultParent,
      primaryGroup
    );

    const unorientedParent =
      aromaticSuffixContext
        ? defaultParent
        : getParentStrategy(primaryGroup) === "acyl"
        ? getBestAcylParentDescriptor(parsedMol) ?? defaultParent
        : defaultParent;

    const parent = aromaticSuffixContext
      ? orientAromaticParentForSuffix(
          parsedMol,
          unorientedParent,
          aromaticSuffixContext
        )
      : orientParentForPrimaryGroup(
          parsedMol,
          unorientedParent,
          primaryGroup
        );

    const finalAromaticSuffixContext = aromaticSuffixContext
      ? getAromaticSuffixContext(parsedMol, parent, primaryGroup) ??
        aromaticSuffixContext
      : null;

    const features = detectNamingFeatures(parsedMol, parent);

    const primaryFeature =
      finalAromaticSuffixContext?.primaryFeature ?? features[0] ?? null;

    const substituents = detectSubstituents(
      parsedMol,
      parent,
      features,
      finalAromaticSuffixContext?.representedExternalAtoms
);

    const suffixName =
      finalAromaticSuffixContext?.suffixName ??
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
    primaryGroup ? null : primaryFeature,
    primaryGroup,
    substituents,
  );
    

  const aromaticCommonName = getAromaticCommonName(
    parent,
    substituents,
    primaryFeature
  );

    const estimatedName =
      aromaticCommonName ??
      constructFinalName(prefixString, suffixName, primaryFeature);


  return {
    estimatedName,
    parent,
    features,
    primaryFeature,
    substituents,
  };
}

function getAromaticCommonName(
  parent: ParentDescriptor,
  substituents: Substituent[],
  primaryFeature: NamingFeature | null
) {
  if (!parent.aromaticRing) return null;

  const baseName = getAromaticBaseName(primaryFeature);

  if (substituents.length === 0) {
    return baseName;
  }

  if (substituents.length === 1) {
    const sub = substituents[0];

    if (!primaryFeature) {
      if (sub.name === "methyl") return "toluene";
      if (sub.name === "ethyl") return "ethylbenzene";
      if (sub.name === "methoxy") return "anisole";
      if (sub.name === "ethenyl" || sub.name === "vinyl") return "styrene";
      if (sub.name === "propan-2-yl") return "cumene";
    }

    return `${sub.locant}-${sub.name}${baseName}`;
  }

  return null;
}

function getAromaticBaseName(primaryFeature: NamingFeature | null) {
  if (!primaryFeature) return "benzene";

  if (primaryFeature.type === "alcohol") return "phenol";
  if (primaryFeature.type === "amine") return "aniline";
  if (primaryFeature.type === "thiol") return "thiophenol";
  if (primaryFeature.type === "aldehyde") return "benzaldehyde";
  if (primaryFeature.type === "amide") return "benzamide";
  if (primaryFeature.type === "nitrile") return "benzonitrile";
  if (primaryFeature.type === "carboxylicAcid") return "benzoic acid";

  return "benzene";
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