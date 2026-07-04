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
  getParentDescriptor,
  getBestAcylParentDescriptor,
} from "./graph/parentSelection";

import {
  detectNamingFeatures,
  getCarboxylicAcidCarbons,
} from "./featureDetection";

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
  const defaultParent = getParentDescriptor(parsedMol);
  const primaryGroup = getPrimaryFunctionalGroup(functionalGroups, mainGroup);

  const unorientedParent =
    getParentStrategy(primaryGroup) === "acyl"
      ? getBestAcylParentDescriptor(parsedMol) ?? defaultParent
      : defaultParent;

  const parent = orientParentForPrimaryGroup(
    parsedMol,
    unorientedParent,
    primaryGroup
  );

  const features = detectNamingFeatures(parsedMol, parent);
  const primaryFeature = features[0] ?? null;
  const substituents = detectSubstituents(parsedMol, parent);

  const aromaticAcidOverride = getAromaticAcidOverride(
    parsedMol,
    parent,
    features
  );

  if (aromaticAcidOverride) return aromaticAcidOverride;

  const suffixName =
    buildFunctionalGroupSuffixName(
      parsedMol,
      parent,
      primaryGroup,
      primaryFeature
    ) ?? buildSuffixName(parsedMol, parent, primaryFeature);

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
    constructName([prefixString, suffixName]);


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

  if (!parent.aromaticRing || aromaticAcidCarbonCount === 0) return null;

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