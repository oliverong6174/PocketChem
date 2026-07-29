import type {
  AcidBaseConfidence,
  AcidBaseRuleKind,
  MatchedAcidBaseSite,
} from "./types";

export type SiteHybridization = "sp" | "sp2" | "sp3" | "unknown";

export type WithdrawingFeatureKind =
  | "halogen"
  | "carbonyl"
  | "nitrile"
  | "nitro"
  | "sulfonyl";

export type WithdrawingFeatureMatch = {
  kind: WithdrawingFeatureKind;
  atomIndex: number;
  distance: number;
};

export type SiteEnvironment = {
  siteAtomIndex: number;
  element: string;
  formalCharge: number;
  hybridization: SiteHybridization;
  heavyAtomNeighborCount: number;
  carbonNeighborCount: number;
  heteroatomNeighborCount: number;
  siteCarbonSubstituentCount: number;
  attachedCarbonIndex: number | null;
  attachedCarbonSubstituentCount: number;
  isSiteInRing: boolean;
  isAttachedCarbonInRing: boolean;
  isAromatic: boolean;
  isAttachedToAromaticCarbon: boolean;
  attachedCarbonHasAromaticNeighbor: boolean;
  isBenzylic: boolean;
  isAllylic: boolean;
  adjacentCarbonylCount: number;
  adjacentNitrileCount: number;
  adjacentNitroCount: number;
  nearbyWithdrawingFeatures: WithdrawingFeatureMatch[];
};

export type EnvironmentProfile = {
  relatedGroup?: string;
  pkaCenter: number;
  pkaRange: readonly [number, number];
  confidence: AcidBaseConfidence;
  description: string;
  induction?: string;
};

export type AcidBaseFactorCategory =
  | "atom"
  | "resonance"
  | "induction"
  | "orbital"
  | "substitution"
  | "solvation";

export type AcidBaseFactor = {
  id: string;
  category: AcidBaseFactorCategory;
  pkaDelta: number;
  rangeUncertainty: number;
  confidence: AcidBaseConfidence;
  explanation: string;
  consumedFeatureAtomIndices?: number[];
};

export type SiteEvaluationContext = {
  kind: AcidBaseRuleKind;
  site: MatchedAcidBaseSite;
  environment: SiteEnvironment;
  profile: EnvironmentProfile;
};

export type SiteEvaluation = {
  relatedGroup: string;
  pkaCenter: number;
  pkaRange: readonly [number, number];
  confidence: AcidBaseConfidence;
  induction: string;
  factors: AcidBaseFactor[];
  modifiers: string[];
  explanation: string;
};