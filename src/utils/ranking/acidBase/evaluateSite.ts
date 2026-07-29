import { collectAcidBaseFactors } from "./factorRules";
import { resolveSiteProfile } from "./siteProfiles";
import type {
  AcidBaseFactor,
  EnvironmentProfile,
  SiteEnvironment,
  SiteEvaluation,
} from "./environmentTypes";
import type {
  AcidBaseConfidence,
  AcidBaseRuleKind,
  MatchedAcidBaseSite,
} from "./types";

const CONFIDENCE_ORDER: Record<AcidBaseConfidence, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

function lowerConfidence(
  first: AcidBaseConfidence,
  second: AcidBaseConfidence
): AcidBaseConfidence {
  return CONFIDENCE_ORDER[first] <= CONFIDENCE_ORDER[second]
    ? first
    : second;
}

function getLowestConfidence(
  profileConfidence: AcidBaseConfidence,
  ruleConfidence: AcidBaseConfidence,
  factors: readonly AcidBaseFactor[]
): AcidBaseConfidence {
  return factors.reduce(
    (current, factor) => lowerConfidence(current, factor.confidence),
    lowerConfidence(profileConfidence, ruleConfidence)
  );
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function calculateRange(
  profile: EnvironmentProfile,
  factors: readonly AcidBaseFactor[]
): readonly [number, number] {
  const totalDelta = factors.reduce(
    (sum, factor) => sum + factor.pkaDelta,
    0
  );
  const totalUncertainty = Math.min(
    3,
    factors.reduce((sum, factor) => sum + factor.rangeUncertainty, 0)
  );

  return [
    roundToTenth(profile.pkaRange[0] + totalDelta - totalUncertainty),
    roundToTenth(profile.pkaRange[1] + totalDelta + totalUncertainty),
  ];
}

function combineSentences(parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" ");
}

export function evaluateAcidBaseSite(
  kind: AcidBaseRuleKind,
  site: MatchedAcidBaseSite,
  environment: SiteEnvironment
): SiteEvaluation {
  const profile = resolveSiteProfile(kind, site, environment);
  const factors = collectAcidBaseFactors({
    kind,
    site,
    environment,
    profile,
  });
  const totalDelta = factors.reduce(
    (sum, factor) => sum + factor.pkaDelta,
    0
  );
  const pkaCenter = roundToTenth(profile.pkaCenter + totalDelta);
  const inductionFactors = factors.filter(
    (factor) => factor.category === "induction"
  );
  const modifiers = [
    profile.description,
    ...factors.map((factor) => factor.explanation),
  ].filter((modifier) => modifier.trim().length > 0);

  return {
    relatedGroup: profile.relatedGroup ?? site.rule.relatedGroup,
    pkaCenter,
    pkaRange: calculateRange(profile, factors),
    confidence: getLowestConfidence(
      profile.confidence,
      site.rule.confidence,
      factors
    ),
    induction: combineSentences([
      profile.induction ?? site.rule.induction,
      ...inductionFactors.map((factor) => factor.explanation),
    ]),
    factors,
    modifiers,
    explanation: combineSentences([
      site.rule.explanation,
      profile.description,
    ]),
  };
}