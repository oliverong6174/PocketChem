import type { ComparisonMetric, ComparisonModeId } from "../comparisonTypes";
import { emptyMetric, metric, type DelocalizationSummary, type NamedEffect } from "../comparisonUtils";
import type { LeavingGroupSite } from "./substitution";

export function applyAromaticReactivityMetrics(
  metrics: Record<ComparisonModeId, ComparisonMetric>,
  names: string[],
  delocalization: DelocalizationSummary,
  strongestEwg: NamedEffect,
  strongestEdg: NamedEffect,
  strongestInductive: NamedEffect,
  strongestResDonor: NamedEffect,
  strongestResWithdrawer: NamedEffect,
  leavingGroup: LeavingGroupSite | null,
) {
  const aromaticBonds = delocalization.aromaticBonds;
  const netEas =
    aromaticBonds > 0 ? 5 + strongestEdg.score - strongestEwg.score : 0;
  metrics.easReactivity = metric(
    aromaticBonds > 0 ? netEas : null,
    aromaticBonds > 0
      ? `activation score ${netEas.toFixed(1)}`
      : "No aromatic ring detected",
    "EDGs raise and EWGs lower the qualitative EAS score; halogens are treated as deactivating despite ortho/para direction.",
  );

  const directingMagnitude = Math.max(
    strongestResDonor.score,
    strongestResWithdrawer.score,
    strongestInductive.score,
  );
  const donorDominates =
    strongestResDonor.score >=
    Math.max(strongestResWithdrawer.score, strongestInductive.score);
  const halogenDirector = names.some((name) =>
    ["Aryl halide", "Fluoride", "Chloride", "Bromide", "Iodide"].includes(
      name,
    ),
  );
  const directionLabel =
    donorDominates || halogenDirector
      ? "ortho/para-directing influence"
      : "meta-directing influence";
  metrics.easDirecting =
    aromaticBonds > 0 && directingMagnitude > 0
      ? metric(
          directingMagnitude,
          directionLabel,
          donorDominates
            ? `Dominant donor: ${strongestResDonor.name ?? "donating group"}.`
            : halogenDirector
              ? "Halogens are deactivating but generally ortho/para directing."
              : `Dominant withdrawing group: ${strongestResWithdrawer.name ?? strongestInductive.name ?? "EWG"}.`,
        )
      : emptyMetric(
          aromaticBonds > 0
            ? "No strong directing substituent detected."
            : "No aromatic ring detected.",
        );

  const hasArylLeavingGroup =
    names.includes("Aryl halide") ||
    Boolean(aromaticBonds > 0 && leavingGroup?.arylOrVinylic);
  const snarScore = hasArylLeavingGroup
    ? (leavingGroup?.score ?? 1) + strongestEwg.score * 1.7
    : 0;
  metrics.snarReactivity = metric(
    snarScore || null,
    hasArylLeavingGroup
      ? `aryl leaving group + EWG activation ${snarScore.toFixed(1)}`
      : "No activated aryl leaving group detected",
    "SNAr is favored by an aryl leaving group plus strong electron withdrawal; exact ortho/para placement is not fully scored here.",
  );
}
