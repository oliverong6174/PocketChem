import type { ComparisonMetric, ComparisonModeId } from "../comparisonTypes";
import { metric, strongestNamedEffect, type NamedEffect } from "../comparisonUtils";

const RESONANCE_DONOR_WEIGHTS: Record<string, number> = {
  Phenoxide: 5,
  Aniline: 4.8,
  "Aryl amine": 4.8,
  "Aryl ether": 4.5,
  Anisole: 4.5,
  Phenol: 4.2,
  Enamine: 4.2,
  Pyrrole: 4,
};

const RESONANCE_WITHDRAWER_WEIGHTS: Record<string, number> = {
  Nitrobenzene: 5,
  Nitro: 4.8,
  Benzaldehyde: 4.5,
  "Benzoic acid": 4.3,
  Enone: 4.3,
  Enal: 4.3,
  Nitrile: 4.2,
  Ester: 3.8,
  Amide: 3.4,
  Sulfone: 4.4,
};

export type ResonanceEffects = {
  strongestResDonor: NamedEffect;
  strongestResWithdrawer: NamedEffect;
};

export function applyResonanceEffectMetrics(
  metrics: Record<ComparisonModeId, ComparisonMetric>,
  names: string[],
): ResonanceEffects {
  const strongestResDonor = strongestNamedEffect(names, RESONANCE_DONOR_WEIGHTS);
  const strongestResWithdrawer = strongestNamedEffect(
    names,
    RESONANCE_WITHDRAWER_WEIGHTS,
  );

  metrics.resonanceDonation = metric(
    strongestResDonor.score || null,
    strongestResDonor.name
      ? `${strongestResDonor.name} · ${strongestResDonor.score.toFixed(1)}/5`
      : "No strong +R donor detected",
    "Only groups with a plausible resonance-donating motif receive substantial credit.",
  );
  metrics.resonanceWithdrawal = metric(
    strongestResWithdrawer.score || null,
    strongestResWithdrawer.name
      ? `${strongestResWithdrawer.name} · ${strongestResWithdrawer.score.toFixed(1)}/5`
      : "No strong −R group detected",
    "Higher score indicates a stronger qualitative pi-accepting substituent effect.",
  );

  return { strongestResDonor, strongestResWithdrawer };
}
