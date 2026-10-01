import type { ComparisonMetric, ComparisonModeId } from "../comparisonTypes";
import { metric, strongestNamedEffect, type NamedEffect } from "../comparisonUtils";

const INDUCTIVE_WITHDRAWER_WEIGHTS: Record<string, number> = {
  "Quaternary ammonium": 5,
  "Ammonium ion": 5,
  Fluoride: 4.8,
  Nitro: 4.7,
  Nitrobenzene: 4.7,
  "Sulfonyl chloride": 4.5,
  "Acyl halide": 4.5,
  Nitrile: 4.3,
  Chloride: 3.8,
  Bromide: 3.4,
  Iodide: 3,
  "Carboxylic acid": 3.5,
  Ester: 3.3,
  Amide: 2.8,
};

export function applyInductiveMetrics(
  metrics: Record<ComparisonModeId, ComparisonMetric>,
  names: string[],
): NamedEffect {
  const strongestInductive = strongestNamedEffect(
    names,
    INDUCTIVE_WITHDRAWER_WEIGHTS,
  );
  metrics.inductiveWithdrawal = metric(
    strongestInductive.score || null,
    strongestInductive.name
      ? `${strongestInductive.name} · ${strongestInductive.score.toFixed(1)}/5`
      : "No strong −I group detected",
    "Higher score indicates stronger qualitative sigma-bond electron withdrawal.",
  );
  return strongestInductive;
}
