import type {
  AcidBaseFactor,
  SiteEvaluationContext,
  WithdrawingFeatureKind,
  WithdrawingFeatureMatch,
} from "./environmentTypes";

type FactorRule = {
  id: string;
  evaluate: (
    context: SiteEvaluationContext,
    consumedFeatureAtomIndices: ReadonlySet<number>
  ) => AcidBaseFactor[];
};

const CARBON_ALPHA_RULE_IDS = new Set([
  "nitrile-alpha-ch",
  "ketone-aldehyde-alpha-ch",
  "ester-alpha-ch",
  "amide-alpha-ch",
  "nitro-alpha-ch",
]);

const RESONANCE_ACCEPTOR_DELTAS: Partial<
  Record<WithdrawingFeatureKind, number>
> = {
  carbonyl: -10,
  nitrile: -13.5,
  nitro: -8,
  sulfonyl: -9,
};

const INDUCTIVE_STRENGTHS: Record<WithdrawingFeatureKind, number> = {
  halogen: -0.8,
  carbonyl: -1.4,
  nitrile: -1.5,
  nitro: -1.8,
  sulfonyl: -2,
};

const DISTANCE_MULTIPLIERS: Readonly<Record<number, number>> = {
  1: 1,
  2: 0.55,
  3: 0.25,
  4: 0.1,
};

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function getFeatureLabel(kind: WithdrawingFeatureKind): string {
  if (kind === "halogen") return "halogen";
  if (kind === "carbonyl") return "carbonyl group";
  if (kind === "nitrile") return "nitrile group";
  if (kind === "nitro") return "nitro group";
  return "sulfonyl group";
}

function getInductiveContribution(feature: WithdrawingFeatureMatch): number {
  return roundToTenth(
    INDUCTIVE_STRENGTHS[feature.kind] *
      (DISTANCE_MULTIPLIERS[feature.distance] ?? 0)
  );
}

const additionalPiAcceptorRule: FactorRule = {
  id: "additional-pi-acceptor",
  evaluate(context, consumedFeatureAtomIndices) {
    if (context.kind !== "acid") return [];
    if (!CARBON_ALPHA_RULE_IDS.has(context.site.rule.id)) return [];

    const candidates = context.environment.nearbyWithdrawingFeatures
      .filter(
        (feature) =>
          feature.distance === 1 &&
          !consumedFeatureAtomIndices.has(feature.atomIndex) &&
          RESONANCE_ACCEPTOR_DELTAS[feature.kind] !== undefined
      )
      .sort((first, second) => {
        const firstDelta = RESONANCE_ACCEPTOR_DELTAS[first.kind] ?? 0;
        const secondDelta = RESONANCE_ACCEPTOR_DELTAS[second.kind] ?? 0;
        return firstDelta - secondDelta || first.atomIndex - second.atomIndex;
      });

    return candidates.slice(0, 2).map((feature, index) => {
      const baseDelta = RESONANCE_ACCEPTOR_DELTAS[feature.kind] ?? 0;
      const damping = index === 0 ? 1 : 0.6;
      const pkaDelta = roundToTenth(baseDelta * damping);

      return {
        id: `${additionalPiAcceptorRule.id}-${feature.atomIndex}`,
        category: "resonance",
        pkaDelta,
        rangeUncertainty: 1.5,
        confidence: "Low",
        explanation: `An additional adjacent ${getFeatureLabel(
          feature.kind
        )} provides another resonance or strong π-acceptor pathway for the conjugate base, lowering the ranking estimate by about ${Math.abs(
          pkaDelta
        ).toFixed(1)} pKa units.`,
        consumedFeatureAtomIndices: [feature.atomIndex],
      };
    });
  },
};

const nearbyInductionRule: FactorRule = {
  id: "nearby-electron-withdrawing-induction",
  evaluate(context, consumedFeatureAtomIndices) {
    const candidates = context.environment.nearbyWithdrawingFeatures
      .filter(
        (feature) =>
          feature.distance >= 1 &&
          feature.distance <= 4 &&
          !consumedFeatureAtomIndices.has(feature.atomIndex)
      )
      .map((feature) => ({
        feature,
        contribution: getInductiveContribution(feature),
      }))
      .filter(({ contribution }) => contribution !== 0)
      .sort(
        (first, second) =>
          first.contribution - second.contribution ||
          first.feature.distance - second.feature.distance
      );

    if (candidates.length === 0) return [];

    const damping = [1, 0.65, 0.4, 0.25];
    const selected = candidates.slice(0, damping.length);
    const rawDelta = selected.reduce(
      (sum, candidate, index) =>
        sum + candidate.contribution * (damping[index] ?? 0),
      0
    );
    const pkaDelta = Math.max(-3, roundToTenth(rawDelta));
    const featureSummary = selected
      .map(
        ({ feature }) =>
          `${getFeatureLabel(feature.kind)} at ${feature.distance} bond(s)`
      )
      .join(", ");
    const withdrawalVerb = selected.length === 1 ? "withdraws" : "withdraw";
    const effectDescription =
      context.kind === "acid"
        ? "stabilizing the conjugate base"
        : "reducing electron density and proton affinity at the basic site";

    return [
      {
        id: nearbyInductionRule.id,
        category: "induction",
        pkaDelta,
        rangeUncertainty: roundToTenth(0.4 + (selected.length - 1) * 0.15),
        confidence: "Low",
        explanation: `${featureSummary} ${withdrawalVerb} electron density through sigma bonds, ${effectDescription} and lowering the pKa ranking estimate by about ${Math.abs(
          pkaDelta
        ).toFixed(1)} unit(s).`,
      },
    ];
  },
};

export const ACID_BASE_FACTOR_RULES: readonly FactorRule[] = [
  additionalPiAcceptorRule,
  nearbyInductionRule,
];

export function collectAcidBaseFactors(
  context: SiteEvaluationContext
): AcidBaseFactor[] {
  const factors: AcidBaseFactor[] = [];
  const consumedFeatureAtomIndices = new Set<number>();

  for (const rule of ACID_BASE_FACTOR_RULES) {
    const newFactors = rule.evaluate(context, consumedFeatureAtomIndices);

    for (const factor of newFactors) {
      factors.push(factor);

      for (const atomIndex of factor.consumedFeatureAtomIndices ?? []) {
        consumedFeatureAtomIndices.add(atomIndex);
      }
    }
  }

  return factors;
}