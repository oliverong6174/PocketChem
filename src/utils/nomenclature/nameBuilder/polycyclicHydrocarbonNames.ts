import type { ParsedMol } from "../types";

export type PolycyclicHydrocarbonName = {
  name: string;
  confidence: "high" | "medium";
  reason: string;
};

/**
 * Numbered graph for tricyclo[6.4.0.0²,⁷]dodecane (dodecahydrobiphenylene).
 *
 * The important point is that this is a scaffold recognizer, not an exact-
 * SMILES lookup: bond order is ignored while matching, every graph
 * automorphism/allowed numbering is considered, and the orientation giving
 * the lowest set of multiple-bond locants is selected.  Consequently the same
 * code names any alkene/diene positional isomer on this C12 tricyclic parent.
 */
const TRICYCLO_6400_27_EDGES: ReadonlyArray<readonly [number, number]> = [
  [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8],
  [1, 9], [9, 10], [10, 11], [11, 12], [12, 8],
  [1, 8], [2, 7],
];

function adjacencyFromEdges(
  nodes: number[],
  edges: ReadonlyArray<readonly [number, number]>,
): Map<number, Set<number>> {
  const adjacency = new Map<number, Set<number>>();
  for (const node of nodes) adjacency.set(node, new Set());
  for (const [a, b] of edges) {
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
  }
  return adjacency;
}

const TEMPLATE_NODES = Array.from({ length: 12 }, (_, index) => index + 1);
const TEMPLATE_ADJACENCY = adjacencyFromEdges(
  TEMPLATE_NODES,
  TRICYCLO_6400_27_EDGES,
);

function carbonAdjacency(parsedMol: ParsedMol): Map<number, Set<number>> | null {
  if (parsedMol.atoms.length !== 12) return null;
  if (parsedMol.bonds.length !== 14) return null;
  if (parsedMol.atoms.some((atom) => atom.element !== "C" || atom.charge !== 0)) {
    return null;
  }

  const adjacency = new Map<number, Set<number>>();
  for (const atom of parsedMol.atoms) adjacency.set(atom.atomIndex, new Set());
  for (const bond of parsedMol.bonds) {
    adjacency.get(bond.atomA)?.add(bond.atomB);
    adjacency.get(bond.atomB)?.add(bond.atomA);
  }
  return adjacency;
}

function graphNumberings(parsedMol: ParsedMol): Array<Map<number, number>> {
  const targetAdjacency = carbonAdjacency(parsedMol);
  if (!targetAdjacency) return [];

  const templateDegreeCounts = [...TEMPLATE_ADJACENCY.values()]
    .map((neighbors) => neighbors.size)
    .sort((a, b) => a - b);
  const targetDegreeCounts = [...targetAdjacency.values()]
    .map((neighbors) => neighbors.size)
    .sort((a, b) => a - b);
  if (templateDegreeCounts.join(",") !== targetDegreeCounts.join(",")) return [];

  // Map the highly connected bridge/fusion atoms first.  With degree + mapped
  // adjacency pruning this enumerates the small automorphism set immediately,
  // rather than attempting a 12! permutation.
  const order = [...TEMPLATE_NODES].sort((a, b) => {
    const degreeDifference =
      (TEMPLATE_ADJACENCY.get(b)?.size ?? 0) -
      (TEMPLATE_ADJACENCY.get(a)?.size ?? 0);
    return degreeDifference || a - b;
  });

  const candidatesByDegree = new Map<number, number[]>();
  for (const [atomIndex, neighbors] of targetAdjacency) {
    const bucket = candidatesByDegree.get(neighbors.size) ?? [];
    bucket.push(atomIndex);
    candidatesByDegree.set(neighbors.size, bucket);
  }

  const mapping = new Map<number, number>();
  const usedTargets = new Set<number>();
  const numberings: Array<Map<number, number>> = [];

  const compatibleWithMappedNodes = (templateNode: number, targetNode: number) => {
    const templateNeighbors = TEMPLATE_ADJACENCY.get(templateNode) ?? new Set<number>();
    const targetNeighbors = targetAdjacency.get(targetNode) ?? new Set<number>();

    for (const [mappedTemplate, mappedTarget] of mapping) {
      const templateHasEdge = templateNeighbors.has(mappedTemplate);
      const targetHasEdge = targetNeighbors.has(mappedTarget);
      // Preserve both edges and non-edges among already mapped nodes so the
      // completed bijection is an exact graph isomorphism.
      if (templateHasEdge !== targetHasEdge) return false;
    }
    return true;
  };

  const visit = (depth: number) => {
    if (depth === order.length) {
      numberings.push(new Map(mapping));
      return;
    }

    const templateNode = order[depth];
    const degree = TEMPLATE_ADJACENCY.get(templateNode)?.size ?? 0;
    for (const targetNode of candidatesByDegree.get(degree) ?? []) {
      if (usedTargets.has(targetNode)) continue;
      if (!compatibleWithMappedNodes(templateNode, targetNode)) continue;

      mapping.set(templateNode, targetNode);
      usedTargets.add(targetNode);
      visit(depth + 1);
      usedTargets.delete(targetNode);
      mapping.delete(templateNode);
    }
  };

  visit(0);
  return numberings;
}

function compareLocantLists(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? Number.POSITIVE_INFINITY;
    const b = right[index] ?? Number.POSITIVE_INFINITY;
    if (a !== b) return a - b;
  }
  return 0;
}

function multipleBondLocants(
  parsedMol: ParsedMol,
  numbering: Map<number, number>,
): { double: number[]; triple: number[] } {
  const locantByAtom = new Map<number, number>();
  for (const [locant, atomIndex] of numbering) locantByAtom.set(atomIndex, locant);

  const double: number[] = [];
  const triple: number[] = [];
  for (const bond of parsedMol.bonds) {
    if (bond.bondOrder !== 2 && bond.bondOrder !== 3) continue;
    const a = locantByAtom.get(bond.atomA);
    const b = locantByAtom.get(bond.atomB);
    if (a === undefined || b === undefined) continue;
    const locant = Math.min(a, b);
    (bond.bondOrder === 2 ? double : triple).push(locant);
  }

  double.sort((a, b) => a - b);
  triple.sort((a, b) => a - b);
  return { double, triple };
}

function bestUnsaturationLocants(parsedMol: ParsedMol): {
  double: number[];
  triple: number[];
} | null {
  const numberings = graphNumberings(parsedMol);
  if (numberings.length === 0) return null;

  let best: { double: number[]; triple: number[] } | null = null;
  for (const numbering of numberings) {
    const current = multipleBondLocants(parsedMol, numbering);
    if (!best) {
      best = current;
      continue;
    }

    // IUPAC lowest-set comparison: multiple bonds receive the lowest locants;
    // in the (rare here) mixed ene/yne tie, double-bond locants are compared
    // before triple-bond locants.
    const allCurrent = [...current.double, ...current.triple].sort((a, b) => a - b);
    const allBest = [...best.double, ...best.triple].sort((a, b) => a - b);
    const totalComparison = compareLocantLists(allCurrent, allBest);
    if (
      totalComparison < 0 ||
      (totalComparison === 0 &&
        (compareLocantLists(current.double, best.double) < 0 ||
          (compareLocantLists(current.double, best.double) === 0 &&
            compareLocantLists(current.triple, best.triple) < 0)))
    ) {
      best = current;
    }
  }

  return best;
}

function unsaturationSuffix(doubleLocants: number[], tripleLocants: number[]): string | null {
  if (doubleLocants.length > 0 && tripleLocants.length > 0) {
    // Mixed en-yne assembly needs a more general unsaturation-name builder;
    // do not invent a partial name for that uncommon case.
    return null;
  }

  if (doubleLocants.length === 0 && tripleLocants.length === 0) return "dodecane";

  if (doubleLocants.length === 1) return `dodec-${doubleLocants[0]}-ene`;
  if (doubleLocants.length > 1) {
    const multiplicative = doubleLocants.length === 2
      ? "diene"
      : doubleLocants.length === 3
        ? "triene"
        : `${doubleLocants.length}-ene`;
    return `dodeca-${doubleLocants.join(",")}-${multiplicative}`;
  }

  if (tripleLocants.length === 1) return `dodec-${tripleLocants[0]}-yne`;
  const multiplicative = tripleLocants.length === 2
    ? "diyne"
    : tripleLocants.length === 3
      ? "triyne"
      : `${tripleLocants.length}-yne`;
  return `dodeca-${tripleLocants.join(",")}-${multiplicative}`;
}

/**
 * Recognizes the linearly fused cyclohexane–cyclobutane–cyclohexane tricyclic
 * parent and assigns unsaturation locants from the complete graph rather than
 * flattening it into an acyclic dodecene chain.
 */
export function getPolycyclicHydrocarbonName(
  parsedMol: ParsedMol,
): PolycyclicHydrocarbonName | null {
  const locants = bestUnsaturationLocants(parsedMol);
  if (!locants) return null;

  const suffix = unsaturationSuffix(locants.double, locants.triple);
  if (!suffix) return null;

  return {
    name: `tricyclo[6.4.0.0²,⁷]${suffix}`,
    confidence: "high",
    reason:
      "Recognized the complete tricyclo[6.4.0.0²,⁷]dodecane carbon framework and selected the lowest multiple-bond locants across all symmetry-equivalent numberings.",
  };
}
