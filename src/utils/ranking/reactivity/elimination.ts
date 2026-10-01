import type { ComparisonMetric, ComparisonModeId } from "../comparisonTypes";
import { metric } from "../comparisonUtils";
import type { LeavingGroupSite } from "./substitution";

export function applyEliminationMetrics(
  metrics: Record<ComparisonModeId, ComparisonMetric>,
  leavingGroup: LeavingGroupSite | null,
) {
  if (!leavingGroup) return;

  const substitutionBonus =
    leavingGroup.substitution >= 3
      ? 4
      : leavingGroup.substitution === 2
        ? 2.5
        : leavingGroup.substitution === 1
          ? 1.2
          : 0.4;
  const resonanceBonus = leavingGroup.benzylicOrAllylic ? 3 : 0;
  const arylPenalty = leavingGroup.arylOrVinylic ? 6 : 0;
  const sn1 =
    leavingGroup.score * 2 + substitutionBonus + resonanceBonus - arylPenalty;
  const e1 = sn1 + Math.min(3, leavingGroup.betaHydrogenCount) * 0.5;
  const e2 =
    leavingGroup.score * 2 +
    leavingGroup.substitution * 1.2 +
    Math.min(4, leavingGroup.betaHydrogenCount) * 0.8 -
    arylPenalty;
  const siteDescription =
    leavingGroup.carbonIndex === null
      ? leavingGroup.label
      : `${leavingGroup.label} at C${leavingGroup.carbonIndex + 1} (${leavingGroup.substitution} carbon substituent${leavingGroup.substitution === 1 ? "" : "s"})`;

  metrics.e1Reactivity = metric(
    e1,
    `${siteDescription} · β-H ${leavingGroup.betaHydrogenCount}`,
    "E1 uses the same ionization logic as SN1 plus beta-hydrogen availability.",
  );
  metrics.e2Reactivity = metric(
    e2,
    `${siteDescription} · β-H ${leavingGroup.betaHydrogenCount}`,
    "E2 score rewards leaving-group ability, substituted alkene-forming substrates and beta-H availability; 3D anti-periplanar geometry is not inferred.",
  );
}
