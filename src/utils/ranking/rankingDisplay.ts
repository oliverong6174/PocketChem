/**
 * The Ranking page's display ordering, moved out of the page unchanged so that restored
 * (saved) profiles can be ordered by exactly the same code and checked against what was shown.
 */
import { rankComparisonEntries, getComparisonMode } from "./comparisonModes";
import type { ComparisonMetric, ComparisonModeId, ComparisonProfile } from "./comparisonTypes";

export function metricsTie(
  first: ComparisonMetric,
  second: ComparisonMetric,
  tolerance = 1e-9,
) {
  if (first.sortVector || second.sortVector) {
    if (!first.sortVector || !second.sortVector) return false;
    if (first.sortVector.length !== second.sortVector.length) return false;
    return first.sortVector.every(
      (value, index) => value === second.sortVector?.[index],
    );
  }

  if (first.score === null || second.score === null) return false;
  return Math.abs(first.score - second.score) <= tolerance;
}

export type RankableMolecule = { id: number; profile: ComparisonProfile };

/** Rows in display order and the (tie-aware) rank of each rankable molecule for one mode. */
export function deriveRanking<T extends RankableMolecule>(molecules: T[], rankingMode: ComparisonModeId) {
  const activeMode = getComparisonMode(rankingMode);
  const rows = molecules.map((molecule) => ({
    molecule,
    metric: molecule.profile.metrics[rankingMode],
  }));
  const rankedRows = rankComparisonEntries(rows, activeMode);

  const rankById = new Map<number, number>();
  if (activeMode.direction !== "none") {
    let previousMetric: ComparisonMetric | null = null;
    let previousRank = 0;
    let rankablePosition = 0;

    for (const row of rankedRows) {
      if (row.metric.score === null && !row.metric.sortVector) continue;
      rankablePosition += 1;
      const tied =
        previousMetric !== null &&
        metricsTie(row.metric, previousMetric, activeMode.tieTolerance ?? 1e-9);
      const rank = tied ? previousRank : rankablePosition;
      rankById.set(row.molecule.id, rank);
      previousMetric = row.metric;
      previousRank = rank;
    }
  }

  return { activeMode, rankedRows, rankById };
}

/** The order and ranks as shown, in a plain form that can be saved and compared. */
export function displayedRankingSnapshot(
  rankedRows: Array<{ molecule: { id: number } }>,
  rankById: Map<number, number>,
  modeId: ComparisonModeId,
) {
  return {
    modeId,
    order: rankedRows.map((row) => row.molecule.id),
    ranks: [...rankById.entries()].map(([id, rank]) => [id, rank] as [number, number]),
  };
}
