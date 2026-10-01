import type { CipSubstituentPriorityResult } from "./cipPriority";
import type { ComparisonMetric, ComparisonModeId } from "../comparisonTypes";
import { flattenCipKey, metric } from "../comparisonUtils";

export function applyStructureMetrics(
  metrics: Record<ComparisonModeId, ComparisonMetric>,
  cip: CipSubstituentPriorityResult | null,
  heavyAtoms: number,
  branching: number,
  ringCount: number | null,
  rotatableBonds: number | null,
  rigidityScore: number,
) {
  const stericScore = heavyAtoms + branching * 3 + (ringCount ?? 0) * 1.5;
  metrics.stericBulk = metric(
    stericScore,
    `${heavyAtoms} heavy atoms · ${branching} branch center(s)`,
    "Higher molecular size, branching and ring content increase the qualitative steric-bulk score.",
  );
  metrics.conformationalStability = metric(
    rigidityScore,
    `${ringCount ?? 0} ring(s) · ${rotatableBonds ?? 0} rotatable bond(s)`,
    "This ranks conformational rigidity rather than a calculated conformer energy; rings/pi bonds raise and rotatable bonds lower the score.",
  );

  if (cip) {
    metrics.cipPriority = metric(
      cip.directAtomicNumber,
      `${cip.rootElement} at atom ${cip.rootAtomIndex + 1}`,
      cip.explanation,
      undefined,
      [cip.directAtomicNumber, ...flattenCipKey(cip.comparisonKey)],
    );
  }
}
