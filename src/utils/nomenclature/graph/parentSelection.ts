import type { FunctionalGroupResult } from "../../functionalGroups/types";

import type {
  ParentDescriptor,
  ParsedMol,
  RingDescriptor,
} from "../types";

import { getHydroxyBearingCarbon } from "../heteroAtomClassifiers";

import { CHAIN_PREFIXES } from "../constants";
import { getOtherAtom } from "../molParser";

export function isAldehydeCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  const atom = parsedMol.atoms[carbonIndex];
  if (!atom || atom.element !== "C") return false;

  const bonds = parsedMol.adjacency.get(carbonIndex) ?? [];

  const carbonylOxygenBond = bonds.find((bond) => {
    const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return otherAtom?.element === "O" && bond.bondOrder === 2;
  });

  if (!carbonylOxygenBond) return false;

  const carbonNeighborCount = bonds.filter((bond) => {
    const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return otherAtom?.element === "C";
  }).length;

  const hasSingleBondedHeteroAcylSubstituent = bonds.some((bond) => {
    if (bond === carbonylOxygenBond) return false;
    if (bond.bondOrder !== 1) return false;

    const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];

    return (
      otherAtom?.element === "O" ||
      otherAtom?.element === "N" ||
      otherAtom?.element === "S" ||
      otherAtom?.element === "F" ||
      otherAtom?.element === "Cl" ||
      otherAtom?.element === "Br" ||
      otherAtom?.element === "I"
    );
  });

  if (hasSingleBondedHeteroAcylSubstituent) return false;

  const bondOrderSum = bonds.reduce((sum, bond) => sum + bond.bondOrder, 0);
  const implicitHydrogenCount = Math.max(0, Math.round(4 - bondOrderSum));

  return carbonNeighborCount <= 1 && implicitHydrogenCount > 0;
}

export function isKetoneCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  const atom = parsedMol.atoms[carbonIndex];
  if (!atom || atom.element !== "C") return false;

  const bonds = parsedMol.adjacency.get(carbonIndex) ?? [];

  const hasCarbonylOxygen = bonds.some((bond) => {
    const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return otherAtom?.element === "O" && bond.bondOrder === 2;
  });

  if (!hasCarbonylOxygen) return false;

  const carbonNeighbors = bonds.filter((bond) => {
    const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return otherAtom?.element === "C";
  });

  return carbonNeighbors.length >= 2;
}

export function getLongestCarbonPath(parsedMol: ParsedMol) {
  const carbonAtoms = parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex);

  let bestPath: number[] = [];

  const dfs = (current: number, visited: Set<number>, path: number[]) => {
    if (path.length > bestPath.length) {
      bestPath = [...path];
    }

    for (const bond of parsedMol.adjacency.get(current) ?? []) {
      const nextAtomIndex = getOtherAtom(bond, current);
      const nextAtom = parsedMol.atoms[nextAtomIndex];

      if (!nextAtom || nextAtom.element !== "C" || visited.has(nextAtomIndex)) {
        continue;
      }

      visited.add(nextAtomIndex);
      dfs(nextAtomIndex, visited, [...path, nextAtomIndex]);
      visited.delete(nextAtomIndex);
    }
  };

  for (const atomIndex of carbonAtoms) {
    dfs(atomIndex, new Set([atomIndex]), [atomIndex]);
  }

  return bestPath;
}

export function getAlcoholBearingCarbons(parsedMol: ParsedMol) {
  const alcoholCarbons: number[] = [];

  for (const oxygen of parsedMol.atoms.filter((atom) => atom.element === "O")) {
    const carbonIndex = getHydroxyBearingCarbon(
      parsedMol,
      oxygen.atomIndex
    );

    if (carbonIndex !== null) {
      alcoholCarbons.push(carbonIndex);
    }
  }

  return Array.from(new Set(alcoholCarbons));
}

function getHeteroatomAttachedCarbons(
  parsedMol: ParsedMol,
  element: "N" | "O" | "S"
) {
  const carbons: number[] = [];

  for (const heteroAtom of parsedMol.atoms.filter(
    (atom) => atom.element === element
  )) {
    for (const bond of parsedMol.adjacency.get(heteroAtom.atomIndex) ?? []) {
      if (bond.bondOrder !== 1) continue;

      const carbonIndex = getOtherAtom(bond, heteroAtom.atomIndex);
      const carbon = parsedMol.atoms[carbonIndex];

      if (carbon?.element === "C") {
        carbons.push(carbonIndex);
      }
    }
  }

  return Array.from(new Set(carbons));
}

export function getThiolBearingCarbons(parsedMol: ParsedMol) {
  return getHeteroatomAttachedCarbons(parsedMol, "S");
}

export function getAmineBearingCarbons(parsedMol: ParsedMol) {
  const carbons: number[] = [];

  for (const nitrogen of parsedMol.atoms.filter(
    (atom) => atom.element === "N"
  )) {
    const bonds = parsedMol.adjacency.get(nitrogen.atomIndex) ?? [];

    // Nitriles, imines, etc. should not be treated as simple amine suffixes.
    if (bonds.some((bond) => bond.bondOrder > 1)) continue;

    const attachedToCarbonyl = bonds.some((bond) => {
      const carbonIndex = getOtherAtom(bond, nitrogen.atomIndex);
      const carbon = parsedMol.atoms[carbonIndex];

      if (carbon?.element !== "C") return false;

      return (parsedMol.adjacency.get(carbonIndex) ?? []).some(
        (candidate) => {
          const attached = parsedMol.atoms[
            getOtherAtom(candidate, carbonIndex)
          ];

          return attached?.element === "O" && candidate.bondOrder === 2;
        }
      );
    });

    if (attachedToCarbonyl) continue;

    for (const bond of bonds) {
      if (bond.bondOrder !== 1) continue;

      const carbonIndex = getOtherAtom(bond, nitrogen.atomIndex);
      const carbon = parsedMol.atoms[carbonIndex];

      if (carbon?.element === "C") {
        carbons.push(carbonIndex);
      }
    }
  }

  return Array.from(new Set(carbons));
}

export function getKetoneBearingCarbons(parsedMol: ParsedMol) {
  return parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex)
    .filter((atomIndex) => isKetoneCarbon(parsedMol, atomIndex));
}

export function getAldehydeBearingCarbons(parsedMol: ParsedMol) {
  return parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex)
    .filter((atomIndex) => isAldehydeCarbon(parsedMol, atomIndex));
}

export function getNitrileBearingCarbons(parsedMol: ParsedMol) {
  const carbons: number[] = [];

  for (const bond of parsedMol.bonds) {
    if (bond.bondOrder !== 3) continue;

    const atomA = parsedMol.atoms[bond.atomA];
    const atomB = parsedMol.atoms[bond.atomB];

    if (atomA?.element === "C" && atomB?.element === "N") {
      carbons.push(bond.atomA);
    }

    if (atomB?.element === "C" && atomA?.element === "N") {
      carbons.push(bond.atomB);
    }
  }

  return Array.from(new Set(carbons));
}

export function getSuffixBearingCarbonCandidates(parsedMol: ParsedMol) {
  return Array.from(
    new Set([
      ...getAlcoholBearingCarbons(parsedMol),
      ...getThiolBearingCarbons(parsedMol),
      ...getAmineBearingCarbons(parsedMol),
      ...getKetoneBearingCarbons(parsedMol),
      ...getAldehydeBearingCarbons(parsedMol),
      ...getNitrileBearingCarbons(parsedMol),
    ])
  );
}

export function getParentCandidateAtomsForPrimaryGroup(
  parsedMol: ParsedMol,
  primaryGroup: FunctionalGroupResult | null
) {
  const suffix = primaryGroup?.suffix?.toLowerCase().replace(/^-/, "") ?? "";
  const name = primaryGroup?.name?.toLowerCase() ?? "";

  if (suffix.includes("thiol") || name.includes("thiol")) {
    return getThiolBearingCarbons(parsedMol);
  }

  if (
    suffix === "ol" ||
    name.includes("alcohol") ||
    name.includes("phenol")
  ) {
    return getAlcoholBearingCarbons(parsedMol);
  }

  if (suffix.includes("amine") || name.includes("amine")) {
    return getAmineBearingCarbons(parsedMol);
  }

  if (suffix === "one" || name.includes("ketone")) {
    return getKetoneBearingCarbons(parsedMol);
  }

  if (suffix === "al" || name.includes("aldehyde")) {
    return getAldehydeBearingCarbons(parsedMol);
  }

  if (suffix.includes("nitrile") || name.includes("nitrile")) {
    return getNitrileBearingCarbons(parsedMol);
  }

  return [];
}

export function getPathUnsaturationCount(parsedMol: ParsedMol, path: number[]) {
  let count = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const bond = parsedMol.bonds.find(
      (candidate) =>
        (candidate.atomA === path[i] && candidate.atomB === path[i + 1]) ||
        (candidate.atomB === path[i] && candidate.atomA === path[i + 1])
    );

    if (!bond) continue;

    if (bond.bondOrder === 2 || bond.bondOrder === 3) {
      count++;
    }
  }

  return count;
}

export function getBestNomenclatureCarbonPath(
  parsedMol: ParsedMol,
  preferredAtoms: number[] = []
) {
  const carbonAtoms = parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex);

  const preferredAtomSet = new Set(preferredAtoms);
  const suffixCandidateAtoms = new Set(
    getSuffixBearingCarbonCandidates(parsedMol)
  );

  let bestPath: number[] = [];

  const scoreAtoms = (path: number[], atomSet: Set<number>) =>
    path.filter((atomIndex) => atomSet.has(atomIndex)).length;

  const isBetterPath = (path: number[]) => {
    if (bestPath.length === 0) return true;

    const atomsToPrioritize =
      preferredAtomSet.size > 0 ? preferredAtomSet : suffixCandidateAtoms;

    const pathPreferredAtoms = scoreAtoms(path, atomsToPrioritize);
    const bestPreferredAtoms = scoreAtoms(bestPath, atomsToPrioritize);

    if (pathPreferredAtoms > bestPreferredAtoms) return true;
    if (pathPreferredAtoms < bestPreferredAtoms) return false;

    const pathUnsaturation = getPathUnsaturationCount(parsedMol, path);
    const bestUnsaturation = getPathUnsaturationCount(parsedMol, bestPath);

    if (pathUnsaturation > bestUnsaturation) return true;
    if (pathUnsaturation < bestUnsaturation) return false;

    if (path.length > bestPath.length) return true;
    if (path.length < bestPath.length) return false;

    return false;
  };

  const dfs = (current: number, visited: Set<number>, path: number[]) => {
    if (isBetterPath(path)) {
      bestPath = [...path];
    }

    for (const bond of parsedMol.adjacency.get(current) ?? []) {
      const nextAtomIndex = getOtherAtom(bond, current);
      const nextAtom = parsedMol.atoms[nextAtomIndex];

      if (!nextAtom || nextAtom.element !== "C" || visited.has(nextAtomIndex)) {
        continue;
      }

      visited.add(nextAtomIndex);
      dfs(nextAtomIndex, visited, [...path, nextAtomIndex]);
      visited.delete(nextAtomIndex);
    }
  };

  for (const atomIndex of carbonAtoms) {
    dfs(atomIndex, new Set([atomIndex]), [atomIndex]);
  }

  return bestPath.length > 0 ? bestPath : getLongestCarbonPath(parsedMol);
}

export function getChainUnsaturation(parsedMol: ParsedMol, path: number[]) {
  const doubleLocants: number[] = [];
  const tripleLocants: number[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const bond = parsedMol.bonds.find(
      (candidate) =>
        (candidate.atomA === path[i] && candidate.atomB === path[i + 1]) ||
        (candidate.atomB === path[i] && candidate.atomA === path[i + 1])
    );

    if (!bond) continue;

    if (bond.bondOrder === 2) doubleLocants.push(i + 1);
    if (bond.bondOrder === 3) tripleLocants.push(i + 1);
  }

  return { doubleLocants, tripleLocants };
}



function getLowestLocantList(values: number[]) {
  return [...values].sort((a, b) => a - b);
}

export function compareLocantLists(a: number[], b: number[]) {
  const sortedA = getLowestLocantList(a);
  const sortedB = getLowestLocantList(b);

  const length = Math.max(sortedA.length, sortedB.length);

  for (let i = 0; i < length; i++) {
    const valueA = sortedA[i] ?? Number.POSITIVE_INFINITY;
    const valueB = sortedB[i] ?? Number.POSITIVE_INFINITY;

    if (valueA < valueB) return -1;
    if (valueA > valueB) return 1;
  }

  return 0;
}

export function orientPathForLowestUnsaturationLocants(
  parsedMol: ParsedMol,
  path: number[]
) {
  const forward = getChainUnsaturation(parsedMol, path);
  const reversePath = [...path].reverse();
  const reverse = getChainUnsaturation(parsedMol, reversePath);

  const forwardLocants = [
    ...forward.doubleLocants,
    ...forward.tripleLocants,
  ];

  const reverseLocants = [
    ...reverse.doubleLocants,
    ...reverse.tripleLocants,
  ];

  return compareLocantLists(reverseLocants, forwardLocants) < 0
    ? reversePath
    : path;
}

function getMultiplier(count: number) {
  if (count === 2) return "di";
  if (count === 3) return "tri";
  if (count === 4) return "tetra";
  if (count === 5) return "penta";
  if (count === 6) return "hexa";
  return "";
}

export function getParentStemWithUnsaturation(
  parsedMol: ParsedMol,
  parent: ParentDescriptor
) {
  // Aromatic rings should stay retained aromatic parents.
  // Do not turn benzene into hexa-1,3,5-triene / hexa-2,4-diene stems.
  if (parent.kind === "ring" && parent.aromaticRing) {
    return parent.parentStem;
  }

  const prefix = CHAIN_PREFIXES[parent.carbonCount];
  if (!prefix) return parent.parentStem;

  const { doubleLocants, tripleLocants } = getChainUnsaturation(
    parsedMol,
    parent.path
  );

  if (doubleLocants.length === 0 && tripleLocants.length === 0) {
    return `${prefix}an`;
  }

  const doubleMultiplier = getMultiplier(doubleLocants.length);
  const tripleMultiplier = getMultiplier(tripleLocants.length);

  if (doubleLocants.length > 0 && tripleLocants.length === 0) {
    if (doubleLocants.length === 1) {
      return `${prefix}-${doubleLocants[0]}-en`;
    }

    return `${prefix}a-${doubleLocants.join(",")}-${doubleMultiplier}en`;
  }

  if (tripleLocants.length > 0 && doubleLocants.length === 0) {
    if (tripleLocants.length === 1) {
      return `${prefix}-${tripleLocants[0]}-yn`;
    }

    return `${prefix}a-${tripleLocants.join(",")}-${tripleMultiplier}yn`;
  }

  return `${prefix}a-${doubleLocants.join(",")}-${doubleMultiplier}en-${tripleLocants.join(",")}-${tripleMultiplier}yn`;
}

export function getUnsaturationSuffix(parsedMol: ParsedMol, path: number[]) {
  const prefix = CHAIN_PREFIXES[path.length];
  if (!prefix) return null;

  const { doubleLocants, tripleLocants } = getChainUnsaturation(parsedMol, path);

  if (doubleLocants.length === 0 && tripleLocants.length === 0) {
    return `${prefix}ane`;
  }

  const doubleMultiplier = getMultiplier(doubleLocants.length);
  const tripleMultiplier = getMultiplier(tripleLocants.length);

  if (doubleLocants.length > 0 && tripleLocants.length === 0) {
    if (doubleLocants.length === 1) {
      return `${prefix}-${doubleLocants[0]}-ene`;
    }

    return `${prefix}a-${doubleLocants.join(",")}-${doubleMultiplier}ene`;
  }

  if (tripleLocants.length > 0 && doubleLocants.length === 0) {
    if (tripleLocants.length === 1) {
      return `${prefix}-${tripleLocants[0]}-yne`;
    }

    return `${prefix}a-${tripleLocants.join(",")}-${tripleMultiplier}yne`;
  }

  return `${prefix}a-${doubleLocants.join(",")}-${doubleMultiplier}en-${tripleLocants.join(",")}-${tripleMultiplier}yne`;
}

export function getHydrocarbonBaseName(parsedMol: ParsedMol, path: number[]) {
  return getUnsaturationSuffix(parsedMol, path);
}

export function getLongestAcyclicCarbonPath(
  parsedMol: ParsedMol,
  ringAtoms: number[]
) {
  const ringSet = new Set(ringAtoms);

  const carbonAtoms = parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex);

  let bestPath: number[] = [];

  const dfs = (
    current: number,
    visited: Set<number>,
    path: number[]
  ) => {
    if (path.length > bestPath.length) {
      bestPath = [...path];
    }

    for (const bond of parsedMol.adjacency.get(current) ?? []) {
      const next = getOtherAtom(bond, current);
      const nextAtom = parsedMol.atoms[next];

      if (!nextAtom || nextAtom.element !== "C") continue;
      if (visited.has(next)) continue;

      if (ringSet.has(current) && ringSet.has(next)) continue;

      visited.add(next);
      dfs(next, visited, [...path, next]);
      visited.delete(next);
    }
  };

  for (const atomIndex of carbonAtoms) {
    dfs(atomIndex, new Set([atomIndex]), [atomIndex]);
  }

  return bestPath;
}

export function getSimpleCarbonRing(parsedMol: ParsedMol): RingDescriptor | null {
  const carbonAtoms = parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex);

  const carbonSet = new Set(carbonAtoms);

  const carbonNeighbors = (atomIndex: number) =>
    (parsedMol.adjacency.get(atomIndex) ?? [])
      .map((bond) => getOtherAtom(bond, atomIndex))
      .filter((other) => carbonSet.has(other));

  const findCycleFrom = (
    start: number,
    current: number,
    visited: number[]
  ): number[] | null => {
    for (const next of carbonNeighbors(current)) {
      if (next === start && visited.length >= 3) {
        return visited;
      }

      if (visited.includes(next)) continue;

      const result = findCycleFrom(start, next, [...visited, next]);

      if (result) return result;
    }

    return null;
  };

  let bestCycle: number[] | null = null;

  for (const atomIndex of carbonAtoms) {
    const cycle = findCycleFrom(atomIndex, atomIndex, [atomIndex]);

    if (!cycle) continue;

    if (!bestCycle || cycle.length > bestCycle.length) {
      bestCycle = cycle;
    }
  }

  if (!bestCycle || bestCycle.length < 3) return null;

  const ringSet = new Set(bestCycle);

  const ringBonds = parsedMol.bonds.filter(
    (bond) => ringSet.has(bond.atomA) && ringSet.has(bond.atomB)
  );

  return {
    ringAtoms: bestCycle,
    ringBonds,
  };
}

export function orientRingPathForNaming(
  parsedMol: ParsedMol,
  ringAtoms: number[]
) {
  const scoreAtom = (atomIndex: number) => {
    let score = 0;

    if (isKetoneCarbon(parsedMol, atomIndex)) score += 100;
    if (isAldehydeCarbon(parsedMol, atomIndex)) score += 90;

    for (const bond of parsedMol.adjacency.get(atomIndex) ?? []) {
      const other = getOtherAtom(bond, atomIndex);
      const otherAtom = parsedMol.atoms[other];

      if (otherAtom?.element === "O") score += 60;
      if (otherAtom?.element === "N") score += 50;
      if (otherAtom?.element === "S") score += 40;

      if (otherAtom?.element === "C" && !ringAtoms.includes(other)) {
        score += 20;
      }
    }

    return score;
  };

  const rotations = ringAtoms.flatMap((_, index) => {
    const rotated = [...ringAtoms.slice(index), ...ringAtoms.slice(0, index)];
    const reversed = [...rotated].reverse();
    return [rotated, reversed];
  });

  return rotations.sort((a, b) => {
    const aScores = a.map(scoreAtom);
    const bScores = b.map(scoreAtom);

    for (let i = 0; i < aScores.length; i++) {
      if (bScores[i] !== aScores[i]) return bScores[i] - aScores[i];
    }

    return 0;
  })[0];
}

export function isBenzeneLikeRing(
  parsedMol: ParsedMol,
  ring: RingDescriptor
) {
  if (ring.ringAtoms.length !== 6) {
    return false;
  }

  const ringSet = new Set(ring.ringAtoms);

  const ringBonds = parsedMol.bonds.filter(
    (bond) =>
      ringSet.has(bond.atomA) &&
      ringSet.has(bond.atomB)
  );

  const aromaticBondCount = ringBonds.filter(
    (bond) => bond.bondOrder === 1.5
  ).length;

  const doubleBondCount = ringBonds.filter(
    (bond) => bond.bondOrder === 2
  ).length;

  return aromaticBondCount >= 6 || doubleBondCount === 3;
}

function isCarbonylCarbon(parsedMol: ParsedMol, atomIndex: number) {
  const atom = parsedMol.atoms[atomIndex];
  if (!atom || atom.element !== "C") return false;

  return (parsedMol.adjacency.get(atomIndex) ?? []).some((bond) => {
    const other = parsedMol.atoms[getOtherAtom(bond, atomIndex)];
    return other?.element === "O" && bond.bondOrder === 2;
  });
}

export function getBestAcylParentDescriptor(
  parsedMol: ParsedMol
): ParentDescriptor | null {
  const carbonylCarbons = parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex)
    .filter((atomIndex) => isCarbonylCarbon(parsedMol, atomIndex));

  let bestPath: number[] = [];

  const isBetterAcylPath = (path: number[]) => {
    if (bestPath.length === 0) return true;

    // Acyl/aldehyde parent chain must start at the carbonyl carbon.
    // Then choose the longest chain, then the most unsaturation.
    if (path.length > bestPath.length) return true;
    if (path.length < bestPath.length) return false;

    const pathUnsaturation = getPathUnsaturationCount(parsedMol, path);
    const bestUnsaturation = getPathUnsaturationCount(parsedMol, bestPath);

    if (pathUnsaturation > bestUnsaturation) return true;
    if (pathUnsaturation < bestUnsaturation) return false;

    return false;
  };

  const dfs = (
    current: number,
    visited: Set<number>,
    path: number[]
  ) => {
    if (isBetterAcylPath(path)) {
      bestPath = [...path];
    }

    for (const bond of parsedMol.adjacency.get(current) ?? []) {
      const next = getOtherAtom(bond, current);
      const nextAtom = parsedMol.atoms[next];

      if (!nextAtom || nextAtom.element !== "C") continue;
      if (visited.has(next)) continue;

      visited.add(next);
      dfs(next, visited, [...path, next]);
      visited.delete(next);
    }
  };

  for (const carbonylCarbon of carbonylCarbons) {
    dfs(carbonylCarbon, new Set([carbonylCarbon]), [carbonylCarbon]);
  }

  if (bestPath.length === 0) return null;

  const prefix = CHAIN_PREFIXES[bestPath.length];

  return {
    kind: "chain",
    path: bestPath,
    carbonCount: bestPath.length,
    parentHydrocarbon: getHydrocarbonBaseName(parsedMol, bestPath),
    parentStem: prefix ? `${prefix}an` : null,
  };
}

export function getParentDescriptor(
  parsedMol: ParsedMol,
  preferredAtoms: number[] = []
): ParentDescriptor {
  const ring = getSimpleCarbonRing(parsedMol);

  if (ring) {
    const acyclicPath = getLongestAcyclicCarbonPath(parsedMol, ring.ringAtoms);
    const prefix = CHAIN_PREFIXES[ring.ringAtoms.length];
    const aromaticRing = isBenzeneLikeRing(parsedMol, ring);

    if (prefix && ring.ringAtoms.length >= acyclicPath.length) {
      return {
        kind: "ring",
        path: orientRingPathForNaming(parsedMol, ring.ringAtoms),
        carbonCount: ring.ringAtoms.length,
        parentHydrocarbon: aromaticRing ? "benzene" : `cyclo${prefix}ane`,
        parentStem: aromaticRing ? "benzen" : `cyclo${prefix}an`,
        aromaticRing,
      };
    }
  }

  const carbonPath = orientPathForLowestUnsaturationLocants(
    parsedMol,
    getBestNomenclatureCarbonPath(parsedMol, preferredAtoms)
  );

  const prefix = CHAIN_PREFIXES[carbonPath.length];

  return {
    kind: "chain",
    path: carbonPath,
    carbonCount: carbonPath.length,
    parentHydrocarbon: getHydrocarbonBaseName(parsedMol, carbonPath),
    parentStem: prefix ? `${prefix}an` : null,
  };
}

export function getLocantMap(parent: ParentDescriptor) {
  const locants = new Map<number, number>();

  parent.path.forEach((atomIndex, index) => {
    locants.set(atomIndex, index + 1);
  });

  return locants;
}