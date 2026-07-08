import type { FunctionalGroupResult } from "../../functionalGroups/types";

import type {
  ParentDescriptor,
  ParsedMol,
  RingDescriptor,
} from "../types";

import { getHydroxyBearingCarbon } from "../heteroAtomClassifiers";
import { getNamingIntent } from "../nameBuilder/namingIntent";

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

function hasCarbonylOxygen(parsedMol: ParsedMol, carbonIndex: number) {
  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "O" && bond.bondOrder === 2;
  });
}

function isCarboxylicAcidCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "O" && bond.bondOrder === 1;
  });
}

function isEsterCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  const singleOxygenBond = (parsedMol.adjacency.get(carbonIndex) ?? []).find(
    (bond) => {
      const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
      return attached?.element === "O" && bond.bondOrder === 1;
    }
  );

  if (!singleOxygenBond) return false;

  const oxygenIndex = getOtherAtom(singleOxygenBond, carbonIndex);

  return (parsedMol.adjacency.get(oxygenIndex) ?? []).some((bond) => {
    const attached = getOtherAtom(bond, oxygenIndex);
    return attached !== carbonIndex && parsedMol.atoms[attached]?.element === "C";
  });
}

function isAmideCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "N" && bond.bondOrder === 1;
  });
}

function isAcidHalideCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];

    return (
      bond.bondOrder === 1 &&
      (attached?.element === "F" ||
        attached?.element === "Cl" ||
        attached?.element === "Br" ||
        attached?.element === "I")
    );
  });
}

export function getCarboxylicAcidBearingCarbons(parsedMol: ParsedMol) {
  return parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex)
    .filter((atomIndex) => isCarboxylicAcidCarbon(parsedMol, atomIndex));
}

export function getEsterBearingCarbons(parsedMol: ParsedMol) {
  return parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex)
    .filter((atomIndex) => isEsterCarbon(parsedMol, atomIndex));
}

export function getAmideBearingCarbons(parsedMol: ParsedMol) {
  return parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex)
    .filter((atomIndex) => isAmideCarbon(parsedMol, atomIndex));
}

export function getAcidHalideBearingCarbons(parsedMol: ParsedMol) {
  return parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex)
    .filter((atomIndex) => isAcidHalideCarbon(parsedMol, atomIndex));
}

export function getParentCandidateAtomsForPrimaryGroup(
  parsedMol: ParsedMol,
  primaryGroup: FunctionalGroupResult | null
) {
  const intent = getNamingIntent(primaryGroup);

  switch (intent.featureType) {
    case "carboxylicAcid":
      return getCarboxylicAcidBearingCarbons(parsedMol);

    case "ester":
      return getEsterBearingCarbons(parsedMol);

    case "amide":
      return getAmideBearingCarbons(parsedMol);

    case "acidChloride":
      return getAcidHalideBearingCarbons(parsedMol);

    case "aldehyde":
      return getAldehydeBearingCarbons(parsedMol);

    case "nitrile":
      return getNitrileBearingCarbons(parsedMol);

    case "ketone":
      return getKetoneBearingCarbons(parsedMol);

    case "alcohol":
      return getAlcoholBearingCarbons(parsedMol);

    case "amine":
      return getAmineBearingCarbons(parsedMol);

    case "thiol":
      return getThiolBearingCarbons(parsedMol);

    default:
      return [];
  }
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

function getBondBetween(
  parsedMol: ParsedMol,
  atomA: number,
  atomB: number
) {
  return parsedMol.bonds.find(
    (bond) =>
      (bond.atomA === atomA && bond.atomB === atomB) ||
      (bond.atomA === atomB && bond.atomB === atomA)
  );
}

function getParentUnsaturation(parsedMol: ParsedMol, parent: ParentDescriptor) {
  if (parent.kind !== "ring") {
    return getChainUnsaturation(parsedMol, parent.path);
  }

  const doubleLocants: number[] = [];
  const tripleLocants: number[] = [];

  for (let i = 0; i < parent.path.length; i++) {
    const current = parent.path[i];
    const next = parent.path[(i + 1) % parent.path.length];

    const bond = getBondBetween(parsedMol, current, next);
    if (!bond) continue;

    if (bond.bondOrder === 2) doubleLocants.push(i + 1);
    if (bond.bondOrder === 3) tripleLocants.push(i + 1);
  }

  return { doubleLocants, tripleLocants };
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

function getLocantsForAtomSet(path: number[], atomSet: Set<number>) {
  return path
    .map((atomIndex, index) => (atomSet.has(atomIndex) ? index + 1 : null))
    .filter((locant): locant is number => locant !== null);
}

function orientPathForPreferredAtomsAndUnsaturation(
  parsedMol: ParsedMol,
  path: number[],
  preferredAtoms: number[] = []
) {
  const preferredSet = new Set(preferredAtoms);

  if (preferredSet.size > 0) {
    const reversePath = [...path].reverse();
    const forwardLocants = getLocantsForAtomSet(path, preferredSet);
    const reverseLocants = getLocantsForAtomSet(reversePath, preferredSet);
    const comparison = compareLocantLists(reverseLocants, forwardLocants);

    if (comparison < 0) return reversePath;
    if (comparison > 0) return path;
  }

  return orientPathForLowestUnsaturationLocants(parsedMol, path);
}

function shouldOmitOnlyPossibleUnsaturationLocant(
  carbonCount: number,
  doubleLocants: number[],
  tripleLocants: number[]
) {
  // Ethene / ethyne:
  // eth-1-ene -> ethene
  // eth-1-yne -> ethyne
  //
  // Do not broadly erase locants from larger chains here.
  return (
    carbonCount === 2 &&
    doubleLocants.length + tripleLocants.length === 1 &&
    (doubleLocants[0] === 1 || tripleLocants[0] === 1)
  );
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
  // Do not turn benzene into hexa-1,3,5-triene.
  if (parent.kind === "ring" && parent.aromaticRing) {
    return parent.parentStem;
  }

  const prefix = CHAIN_PREFIXES[parent.carbonCount];
  if (!prefix) return parent.parentStem;

  const basePrefix = parent.kind === "ring" ? `cyclo${prefix}` : prefix;

  const { doubleLocants, tripleLocants } = getParentUnsaturation(
    parsedMol,
    parent
  );

  const doubleMultiplier = getMultiplier(doubleLocants.length);
  const tripleMultiplier = getMultiplier(tripleLocants.length);

  if (doubleLocants.length === 0 && tripleLocants.length === 0) {
    return `${basePrefix}an`;
  }

  if (doubleLocants.length > 0 && tripleLocants.length === 0) {
    if (doubleLocants.length === 1) {
      return shouldOmitOnlyPossibleUnsaturationLocant(
        parent.carbonCount,
        doubleLocants,
        tripleLocants
      )
        ? `${basePrefix}en`
        : `${basePrefix}-${doubleLocants[0]}-en`;
    }

    return `${basePrefix}a-${doubleLocants.join(",")}-${doubleMultiplier}en`;
  }

  if (tripleLocants.length > 0 && doubleLocants.length === 0) {
    if (tripleLocants.length === 1) {
      return shouldOmitOnlyPossibleUnsaturationLocant(
        parent.carbonCount,
        doubleLocants,
        tripleLocants
      )
        ? `${basePrefix}yn`
        : `${basePrefix}-${tripleLocants[0]}-yn`;
    }

    return `${basePrefix}a-${tripleLocants.join(",")}-${tripleMultiplier}yn`;
  }

  const needsConnectingA =
    doubleLocants.length > 1 || tripleLocants.length > 1;

  const base = needsConnectingA ? `${basePrefix}a` : basePrefix;

  return `${base}-${doubleLocants.join(",")}-${doubleMultiplier}en-${tripleLocants.join(",")}-${tripleMultiplier}yn`;
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
      return shouldOmitOnlyPossibleUnsaturationLocant(
        path.length,
        doubleLocants,
        tripleLocants
      )
        ? `${prefix}ene`
        : `${prefix}-${doubleLocants[0]}-ene`;
    }

    return `${prefix}a-${doubleLocants.join(",")}-${doubleMultiplier}ene`;
  }

  if (tripleLocants.length > 0 && doubleLocants.length === 0) {
    if (tripleLocants.length === 1) {
      return shouldOmitOnlyPossibleUnsaturationLocant(
        path.length,
        doubleLocants,
        tripleLocants
      )
        ? `${prefix}yne`
        : `${prefix}-${tripleLocants[0]}-yne`;
    }

    return `${prefix}a-${tripleLocants.join(",")}-${tripleMultiplier}yne`;
  }

  const needsConnectingA =
  doubleLocants.length > 1 || tripleLocants.length > 1;

const base = needsConnectingA ? `${prefix}a` : prefix;

return `${base}-${doubleLocants.join(",")}-${doubleMultiplier}en-${tripleLocants.join(",")}-${tripleMultiplier}yne`;
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

function findCarbonPathExcludingBond(
  parsedMol: ParsedMol,
  start: number,
  target: number,
  excludedBond: { atomA: number; atomB: number }
) {
  const queue: number[][] = [[start]];
  const visited = new Set<number>([start]);

  while (queue.length > 0) {
    const path = queue.shift();
    if (!path) continue;

    const current = path[path.length - 1];

    if (current === target) {
      return path;
    }

    for (const bond of parsedMol.adjacency.get(current) ?? []) {
      const isExcluded =
        (bond.atomA === excludedBond.atomA &&
          bond.atomB === excludedBond.atomB) ||
        (bond.atomA === excludedBond.atomB &&
          bond.atomB === excludedBond.atomA);

      if (isExcluded) continue;

      const next = getOtherAtom(bond, current);
      const nextAtom = parsedMol.atoms[next];

      if (nextAtom?.element !== "C") continue;
      if (visited.has(next)) continue;

      visited.add(next);
      queue.push([...path, next]);
    }
  }

  return null;
}

function countRingMultipleBonds(parsedMol: ParsedMol, ringAtoms: number[]) {
  const ringSet = new Set(ringAtoms);

  return parsedMol.bonds.filter(
    (bond) =>
      ringSet.has(bond.atomA) &&
      ringSet.has(bond.atomB) &&
      (bond.bondOrder === 2 || bond.bondOrder === 3 || bond.bondOrder === 1.5)
  ).length;
}

export function getSimpleCarbonRing(parsedMol: ParsedMol): RingDescriptor | null {
  const carbonBonds = parsedMol.bonds.filter((bond) => {
    const atomA = parsedMol.atoms[bond.atomA];
    const atomB = parsedMol.atoms[bond.atomB];

    return atomA?.element === "C" && atomB?.element === "C";
  });

  let bestRingAtoms: number[] | null = null;

  for (const excludedBond of carbonBonds) {
    const path = findCarbonPathExcludingBond(
      parsedMol,
      excludedBond.atomA,
      excludedBond.atomB,
      excludedBond
    );

    if (!path) continue;

    const ringAtoms = path;

    if (ringAtoms.length < 3) continue;

    const uniqueRingAtoms = Array.from(new Set(ringAtoms));

    if (uniqueRingAtoms.length !== ringAtoms.length) continue;

    if (
      !bestRingAtoms ||
      uniqueRingAtoms.length > bestRingAtoms.length ||
      (uniqueRingAtoms.length === bestRingAtoms.length &&
        countRingMultipleBonds(parsedMol, uniqueRingAtoms) >
          countRingMultipleBonds(parsedMol, bestRingAtoms))
    ) {
      bestRingAtoms = uniqueRingAtoms;
    }
  }

  if (!bestRingAtoms) return null;

  const ringSet = new Set(bestRingAtoms);

  const ringBonds = parsedMol.bonds.filter(
    (bond) => ringSet.has(bond.atomA) && ringSet.has(bond.atomB)
  );

  return {
    ringAtoms: bestRingAtoms,
    ringBonds,
  };
}

export function orientRingPathForNaming(
  parsedMol: ParsedMol,
  ringAtoms: number[]
) {
  const ringSet = new Set(ringAtoms);

  const scoreAtom = (atomIndex: number) => {
    let score = 0;

    if (isKetoneCarbon(parsedMol, atomIndex)) score += 100;
    if (isAldehydeCarbon(parsedMol, atomIndex)) score += 90;

    for (const bond of parsedMol.adjacency.get(atomIndex) ?? []) {
      const other = getOtherAtom(bond, atomIndex);
      const otherAtom = parsedMol.atoms[other];

      if (ringSet.has(other)) continue;

      if (otherAtom?.element === "O") score += 60;
      if (otherAtom?.element === "N") score += 50;
      if (otherAtom?.element === "S") score += 40;
      if (otherAtom?.element === "C") score += 20;
    }

    return score;
  };

  const rotations = ringAtoms.flatMap((_, index) => {
    const rotated = [...ringAtoms.slice(index), ...ringAtoms.slice(0, index)];

    // Keep the same locant-1 atom while testing the opposite direction.
    // [...rotated].reverse() moves locant 1 to the end and breaks
    // cycloalkene/cycloalkanone numbering.
    const reversed = [rotated[0], ...rotated.slice(1).reverse()];

    return [rotated, reversed];
  });

  return rotations.sort((a, b) => {
    const aScores = a.map(scoreAtom);
    const bScores = b.map(scoreAtom);

    for (let i = 0; i < aScores.length; i++) {
      if (bScores[i] !== aScores[i]) return bScores[i] - aScores[i];
    }

    return compareRingMultipleBondLocants(parsedMol, a, b);
  })[0];
}

function getRingMultipleBondLocantsForPath(
  parsedMol: ParsedMol,
  path: number[]
) {
  const locants: number[] = [];

  for (let i = 0; i < path.length; i++) {
    const current = path[i];
    const next = path[(i + 1) % path.length];
    const bond = getBondBetween(parsedMol, current, next);

    if (!bond) continue;

    if (bond.bondOrder === 2 || bond.bondOrder === 3) {
      locants.push(i + 1);
    }
  }

  return locants.sort((a, b) => a - b);
}

function compareRingMultipleBondLocants(
  parsedMol: ParsedMol,
  pathA: number[],
  pathB: number[]
) {
  return compareLocantLists(
    getRingMultipleBondLocantsForPath(parsedMol, pathA),
    getRingMultipleBondLocantsForPath(parsedMol, pathB)
  );
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

function getBestExternalPreferredCarbonPath(
  parsedMol: ParsedMol,
  preferredAtoms: number[],
  ringAtoms: number[]
) {
  const ringSet = new Set(ringAtoms);
  const preferredSet = new Set(preferredAtoms);

  const externalCarbonAtoms = parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex)
    .filter((atomIndex) => !ringSet.has(atomIndex));

  let bestPath: number[] = [];

  const scorePreferredAtoms = (path: number[]) =>
    path.filter((atomIndex) => preferredSet.has(atomIndex)).length;

  const isBetterPath = (path: number[]) => {
    if (bestPath.length === 0) return true;

    const pathPreferred = scorePreferredAtoms(path);
    const bestPreferred = scorePreferredAtoms(bestPath);

    if (pathPreferred > bestPreferred) return true;
    if (pathPreferred < bestPreferred) return false;

    const pathUnsaturation = getPathUnsaturationCount(parsedMol, path);
    const bestUnsaturation = getPathUnsaturationCount(parsedMol, bestPath);

    if (pathUnsaturation > bestUnsaturation) return true;
    if (pathUnsaturation < bestUnsaturation) return false;

    return path.length > bestPath.length;
  };

  const dfs = (
    current: number,
    visited: Set<number>,
    path: number[]
  ) => {
    if (isBetterPath(path)) {
      bestPath = [...path];
    }

    for (const bond of parsedMol.adjacency.get(current) ?? []) {
      const next = getOtherAtom(bond, current);
      const nextAtom = parsedMol.atoms[next];

      if (!nextAtom || nextAtom.element !== "C") continue;
      if (ringSet.has(next)) continue;
      if (visited.has(next)) continue;

      visited.add(next);
      dfs(next, visited, [...path, next]);
      visited.delete(next);
    }
  };

  for (const atomIndex of externalCarbonAtoms) {
    dfs(atomIndex, new Set([atomIndex]), [atomIndex]);
  }

  return bestPath;
}

export function getBestAcylParentDescriptor(
  parsedMol: ParsedMol,
  preferredAtoms: number[] = []
): ParentDescriptor | null {
  const preferredSet = new Set(preferredAtoms);
  const allCarbonylCarbons = parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex)
    .filter((atomIndex) => isCarbonylCarbon(parsedMol, atomIndex));

  const preferredCarbonylCarbons = allCarbonylCarbons.filter((atomIndex) =>
    preferredSet.has(atomIndex)
  );

  const carbonylCarbons =
    preferredSet.size > 0 && preferredCarbonylCarbons.length > 0
      ? preferredCarbonylCarbons
      : allCarbonylCarbons;

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

function buildRingParentDescriptor(
  parsedMol: ParsedMol,
  ring: RingDescriptor
): ParentDescriptor | null {
  const prefix = CHAIN_PREFIXES[ring.ringAtoms.length];
  if (!prefix) return null;

  const aromaticRing = isBenzeneLikeRing(parsedMol, ring);
  const orientedPath = orientRingPathForNaming(parsedMol, ring.ringAtoms);

  if (aromaticRing) {
    return {
      kind: "ring",
      path: orientedPath,
      carbonCount: ring.ringAtoms.length,
      parentHydrocarbon: "benzene",
      parentStem: "benzen",
      aromaticRing: true,
    };
  }

  const provisionalParent: ParentDescriptor = {
    kind: "ring",
    path: orientedPath,
    carbonCount: ring.ringAtoms.length,
    parentHydrocarbon: `cyclo${prefix}ane`,
    parentStem: `cyclo${prefix}an`,
    aromaticRing: false,
  };

  const unsaturatedStem =
    getParentStemWithUnsaturation(parsedMol, provisionalParent) ??
    provisionalParent.parentStem;

  return {
    ...provisionalParent,
    parentStem: unsaturatedStem,
    parentHydrocarbon: unsaturatedStem
      ? `${unsaturatedStem}e`
      : provisionalParent.parentHydrocarbon,
  };
}

function ringContainsAnyAtom(ring: RingDescriptor, atoms: number[]) {
  if (atoms.length === 0) return false;

  const ringSet = new Set(ring.ringAtoms);
  return atoms.some((atomIndex) => ringSet.has(atomIndex));
}

export function getParentDescriptor(
  parsedMol: ParsedMol,
  preferredAtoms: number[] = []
): ParentDescriptor {
  const ring = getSimpleCarbonRing(parsedMol);

  if (ring) {
  const ringParent = buildRingParentDescriptor(parsedMol, ring);
  const acyclicPath = getLongestAcyclicCarbonPath(parsedMol, ring.ringAtoms);

  const ringOwnsPreferredAtoms =
    preferredAtoms.length > 0 && ringContainsAnyAtom(ring, preferredAtoms);

  const preferredAtomsAreOutsideRing =
    preferredAtoms.length > 0 && !ringOwnsPreferredAtoms;

  if (ringParent && ringOwnsPreferredAtoms) {
    return ringParent;
  }

  // If the principal suffix group is outside the ring, build an external
  // acyclic parent instead of letting phenol/benzene win.
  // Example:
  // HO-Ph-CH2-CH2-C(=O)-CH3 -> 4-(4-hydroxyphenyl)butan-2-one
  if (preferredAtomsAreOutsideRing) {
    const externalPath = getBestExternalPreferredCarbonPath(
      parsedMol,
      preferredAtoms,
      ring.ringAtoms
    );

    if (externalPath.length > 0) {
      const orientedPath = orientPathForPreferredAtomsAndUnsaturation(
        parsedMol,
        externalPath,
        preferredAtoms
      );

      const prefix = CHAIN_PREFIXES[orientedPath.length];

      return {
        kind: "chain",
        path: orientedPath,
        carbonCount: orientedPath.length,
        parentHydrocarbon: getHydrocarbonBaseName(parsedMol, orientedPath),
        parentStem: prefix ? `${prefix}an` : null,
      };
    }
  }

  const suffixBearingAtoms = getSuffixBearingCarbonCandidates(parsedMol);
  const ringOwnsRelevantSuffix =
    ringContainsAnyAtom(ring, suffixBearingAtoms);

  if (
    ringParent &&
    (ringOwnsRelevantSuffix || ring.ringAtoms.length >= acyclicPath.length)
  ) {
    return ringParent;
  }
}

  const carbonPath = orientPathForPreferredAtomsAndUnsaturation(
    parsedMol,
    getBestNomenclatureCarbonPath(parsedMol, preferredAtoms),
    preferredAtoms
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