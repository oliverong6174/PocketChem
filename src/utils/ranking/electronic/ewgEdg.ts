import type { ComparisonMetric, ComparisonModeId } from "../comparisonTypes";
import { metric, strongestNamedEffect, type NamedEffect } from "../comparisonUtils";

const EWG_WEIGHTS: Record<string, number> = {
  "Quaternary ammonium": 5,
  "Ammonium ion": 5,
  Benzenediazonium: 5,
  Nitro: 4.8,
  Nitrobenzene: 4.8,
  "Sulfonyl chloride": 4.7,
  "Acyl halide": 4.6,
  Nitrile: 4.4,
  Isocyanate: 4.2,
  Isothiocyanate: 4.1,
  "Acid anhydride": 4.1,
  Aldehyde: 4,
  Benzaldehyde: 4,
  Enal: 4,
  Ketone: 3.8,
  Enone: 4,
  Sulfone: 4,
  "Carboxylic acid": 3.6,
  "Benzoic acid": 3.7,
  Ester: 3.5,
  Enoate: 3.7,
  Amide: 3,
  "Sulfonamide": 3.2,
  "Aryl halide": 1.6,
  Fluoride: 2,
  Chloride: 1.6,
  Bromide: 1.4,
  Iodide: 1.2,
};

const EDG_WEIGHTS: Record<string, number> = {
  Phenoxide: 5,
  Alkoxide: 4.9,
  "Amide anion": 4.9,
  Aniline: 4.6,
  "Aryl amine": 4.6,
  Enamine: 4.5,
  "Aryl ether": 4.2,
  Anisole: 4.2,
  Phenol: 4,
  Amine: 3.7,
  "Primary amine": 3.8,
  "Secondary amine": 3.9,
  "Tertiary amine": 4,
  Pyrrole: 3.8,
  Indole: 3.6,
  "Alkylbenzene": 1.8,
};

export type DonorAcceptorEffects = {
  strongestEwg: NamedEffect;
  strongestEdg: NamedEffect;
};

export function applyEwgEdgMetrics(
  metrics: Record<ComparisonModeId, ComparisonMetric>,
  names: string[],
): DonorAcceptorEffects {
  const strongestEwg = strongestNamedEffect(names, EWG_WEIGHTS);
  const strongestEdg = strongestNamedEffect(names, EDG_WEIGHTS);

  metrics.ewgStrength = metric(
    strongestEwg.score || null,
    strongestEwg.name
      ? `${strongestEwg.name} · ${strongestEwg.score.toFixed(1)}/5`
      : "No strong EWG detected",
    "This is the strongest detected substituent-level withdrawing effect, not a single whole-molecule Hammett constant.",
  );
  metrics.edgStrength = metric(
    strongestEdg.score || null,
    strongestEdg.name
      ? `${strongestEdg.name} · ${strongestEdg.score.toFixed(1)}/5`
      : "No strong EDG detected",
    "This is the strongest detected substituent-level donating effect.",
  );

  return { strongestEwg, strongestEdg };
}
