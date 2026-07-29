export type AcidBaseConfidence = "High" | "Medium" | "Low";

export type AcidBaseRuleKind = "acid" | "base";

export type AcidBaseSiteRule = {
  id: string;
  kind: AcidBaseRuleKind;
  priority: number;
  relatedGroup: string;
  siteLabel: string;
  smarts: string;
  siteAtomIndexInMatch: number;
  pkaCenter: number;
  pkaRange: readonly [number, number];
  confidence: AcidBaseConfidence;
  fallbackOnly?: boolean;
  atom: string;
  resonance: string;
  induction: string;
  orbital: string;
  explanation: string;
};

export type MatchedAcidBaseSite = {
  rule: AcidBaseSiteRule;
  atomIndex: number;
  matchedAtomIndices: number[];
};