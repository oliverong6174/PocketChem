import type {
  ParentDescriptor,
  ParsedAtom,
  ParsedBond,
  ParsedMol,
  RingDescriptor,
} from "./types";

import { CHAIN_PREFIXES, COMMON_VALENCES } from "./constants";
import { getOtherAtom } from "./molParser";

function getExpectedValence(atom: ParsedAtom) {
  if (atom.element === "N" && atom.charge > 0) return 4;
  if (atom.element === "O" && atom.charge < 0) return 1;
  if (atom.element === "C" && atom.charge < 0) return 3;

  return COMMON_VALENCES[atom.element] ?? 0;
}

function countImplicitHydrogens(
  atom: ParsedAtom,
  adjacency: Map<number, ParsedBond[]>
) {
  if (atom.element === "H") return 0;

  const expectedValence = getExpectedValence(atom);
  if (expectedValence === 0) return 0;

  const bondOrderSum = (adjacency.get(atom.atomIndex) ?? []).reduce(
    (sum, bond) => sum + bond.bondOrder,
    0
  );

  return Math.max(0, Math.round(expectedValence - bondOrderSum));
}

export function isAldehydeCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  const atom = parsedMol.atoms[carbonIndex];
  if (!atom || atom.element !== "C") return false;

  const bonds = parsedMol.adjacency.get(carbonIndex) ?? [];

  const hasCarbonylOxygen = bonds.some((bond) => {
    const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return otherAtom?.element === "O" && bond.bondOrder === 2;
  });

  if (!hasCarbonylOxygen) return false;

  const implicitHydrogens = countImplicitHydrogens(atom, parsedMol.adjacency);

  return implicitHydrogens >= 1;
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
    const bonds = parsedMol.adjacency.get(oxygen.atomIndex) ?? [];

    const carbonBond = bonds.find((bond) => {
      const otherAtom = parsedMol.atoms[getOtherAtom(bond, oxygen.atomIndex)];
      return otherAtom?.element === "C" && bond.bondOrder === 1;
    });

    if (!carbonBond) continue;

    const carbonIndex = getOtherAtom(carbonBond, oxygen.atomIndex);
    const carbonBonds = parsedMol.adjacency.get(carbonIndex) ?? [];

    const isCarboxylicAcidOxygen = carbonBonds.some((bond) => {
      const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
      return otherAtom?.element === "O" && bond.bondOrder === 2;
    });

    if (!isCarboxylicAcidOxygen) {
      alcoholCarbons.push(carbonIndex);
    }
  }

  return Array.from(new Set(alcoholCarbons));
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

export function getBestNomenclatureCarbonPath(parsedMol: ParsedMol) {
  const carbonAtoms = parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex);

  const alcoholCarbons = new Set(getAlcoholBearingCarbons(parsedMol));

  let bestPath: number[] = [];

  const scoreAlcohols = (path: number[]) =>
    path.filter((atomIndex) => alcoholCarbons.has(atomIndex)).length;

  const isBetterPath = (path: number[]) => {
    if (bestPath.length === 0) return true;

    const pathUnsaturation = getPathUnsaturationCount(parsedMol, path);
    const bestUnsaturation = getPathUnsaturationCount(parsedMol, bestPath);

    if (pathUnsaturation > bestUnsaturation) return true;
    if (pathUnsaturation < bestUnsaturation) return false;

    if (path.length > bestPath.length) return true;
    if (path.length < bestPath.length) return false;

    const pathAlcohols = scoreAlcohols(path);
    const bestAlcohols = scoreAlcohols(bestPath);

    if (pathAlcohols > bestAlcohols) return true;

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

function compareLocantLists(a: number[], b: number[]) {
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

export function getBestAcylParentDescriptor(parsedMol: ParsedMol): ParentDescriptor | null {
  const carbonylCarbons = parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex)
    .filter((atomIndex) => isCarbonylCarbon(parsedMol, atomIndex));

  let bestPath: number[] = [];

  const dfs = (current: number, visited: Set<number>, path: number[]) => {
    if (path.length > bestPath.length) {
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
    getBestNomenclatureCarbonPath(parsedMol)
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