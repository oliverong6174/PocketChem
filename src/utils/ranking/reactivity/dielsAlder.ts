import type { ParsedMol } from "../../nomenclature/types";
import type { ComparisonMetric, ComparisonModeId } from "../comparisonTypes";
import { metric, type NamedEffect } from "../comparisonUtils";

export function applyDielsAlderMetrics(
  metrics: Record<ComparisonModeId, ComparisonMetric>,
  graph: ParsedMol,
  names: string[],
  strongestEwg: NamedEffect,
  strongestEdg: NamedEffect,
) {
  const hasConjugatedDiene =
    names.includes("Conjugated diene") || names.includes("Diene");
  const dieneScore = hasConjugatedDiene ? 5 + strongestEdg.score * 0.8 : 0;
  metrics.dielsAlderDiene = metric(
    dieneScore || null,
    hasConjugatedDiene
      ? `conjugated diene · activation ${dieneScore.toFixed(1)}`
      : "No conjugated diene detected",
    "Electron donation raises the qualitative diene score. The current graph analysis does not fully model s-cis conformer populations.",
  );

  const hasAlkeneOrAlkyne = graph.bonds.some(
    (bond) =>
      bond.bondOrder >= 2 &&
      graph.atoms[bond.atomA]?.element === "C" &&
      graph.atoms[bond.atomB]?.element === "C",
  );
  const dienophileScore = hasAlkeneOrAlkyne ? 2 + strongestEwg.score * 1.2 : 0;
  metrics.dielsAlderDienophile = metric(
    dienophileScore || null,
    hasAlkeneOrAlkyne
      ? `π bond + EWG activation ${dienophileScore.toFixed(1)}`
      : "No C=C/C≡C dienophile detected",
    "Electron-withdrawing activation raises the qualitative dienophile score; steric and orbital effects are simplified.",
  );
}
