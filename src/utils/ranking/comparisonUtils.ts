import type { FunctionalGroupResult } from "../functionalGroups/types";
import type { ParsedMol } from "../nomenclature/types";
import type { ComparisonMetric } from "./comparisonTypes";

export type NamedEffect = { score: number; name: string | null };
export type DelocalizationSummary = {
  aromaticBonds: number;
  piBonds: number;
  adjacentPiConnections: number;
};

export function emptyMetric(detail: string): ComparisonMetric {
  return { score: null, headline: "Not detected", detail };
}

export function metric(
  score: number | null,
  headline: string,
  detail: string,
  factors?: string[],
  sortVector?: number[],
): ComparisonMetric {
  return { score, headline, detail, factors, sortVector };
}

export function groupNames(groups: FunctionalGroupResult[]) {
  return groups.flatMap((group) =>
    Array.from({ length: Math.max(1, group.count) }, () => group.name),
  );
}

export function strongestNamedEffect(
  names: string[],
  weights: Record<string, number>,
): NamedEffect {
  let bestScore = 0;
  let bestName: string | null = null;
  for (const name of names) {
    const score = weights[name] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestName = name;
    }
  }
  return { score: bestScore, name: bestName };
}

export function flattenCipKey(key: number[][]): number[] {
  return key.flatMap((shell) => shell);
}

export function otherAtom(
  bond: ParsedMol["bonds"][number],
  atomIndex: number,
) {
  return bond.atomA === atomIndex ? bond.atomB : bond.atomA;
}

export function aromaticAtomSet(graph: ParsedMol) {
  const set = new Set<number>();
  for (const bond of graph.bonds) {
    if (bond.bondOrder === 1.5) {
      set.add(bond.atomA);
      set.add(bond.atomB);
    }
  }
  return set;
}

export function atomBondOrderSum(graph: ParsedMol, atomIndex: number) {
  return (graph.adjacency.get(atomIndex) ?? []).reduce(
    (sum, bond) => sum + bond.bondOrder,
    0,
  );
}

export function implicitCarbonHydrogens(graph: ParsedMol, atomIndex: number) {
  const atom = graph.atoms[atomIndex];
  if (!atom || atom.element !== "C") return 0;
  return Math.max(0, Math.round(4 - atomBondOrderSum(graph, atomIndex)));
}

export function carbonNeighborCount(
  graph: ParsedMol,
  atomIndex: number,
  excluded?: number,
) {
  return (graph.adjacency.get(atomIndex) ?? []).filter((bond) => {
    const neighbor = otherAtom(bond, atomIndex);
    return neighbor !== excluded && graph.atoms[neighbor]?.element === "C";
  }).length;
}

export function isPiAdjacent(
  graph: ParsedMol,
  atomIndex: number,
  excluded?: number,
) {
  return (graph.adjacency.get(atomIndex) ?? []).some((bond) => {
    const neighbor = otherAtom(bond, atomIndex);
    if (neighbor === excluded) return false;
    return (
      bond.bondOrder > 1 ||
      (graph.adjacency.get(neighbor) ?? []).some((nextBond) => {
        const next = otherAtom(nextBond, neighbor);
        return next !== atomIndex && nextBond.bondOrder > 1;
      })
    );
  });
}

export function aromaticAndConjugation(graph: ParsedMol): DelocalizationSummary {
  const aromaticBonds = graph.bonds.filter((bond) => bond.bondOrder === 1.5).length;
  const piBonds = graph.bonds.filter((bond) => bond.bondOrder >= 2).length;
  let adjacentPiConnections = 0;
  for (const atom of graph.atoms) {
    const piCount = (graph.adjacency.get(atom.atomIndex) ?? []).filter(
      (bond) => bond.bondOrder > 1,
    ).length;
    if (piCount >= 2) adjacentPiConnections += 1;
  }
  return { aromaticBonds, piBonds, adjacentPiConnections };
}

export function descriptorNumber(
  descriptors: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const value = descriptors[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}
