import type { FunctionalGroupResult } from "../../functionalGroups/types";
import type { ParentDescriptor, ParsedMol } from "../types";

import { getOtherAtom } from "../molParser";

import {
  getChainUnsaturation,
  getParentCandidateAtomsForPrimaryGroup,
} from "./parentSelection";

/**
 * Locants of every substituent occurrence along a numbered path, repeats included. IUPAC compares the full set of locants, so a carbon
 * that carries two substituents contributes its locant twice (2,2,4-trimethylpentane beats 2,4,4-); the earlier per-atom list ignored the
 * multiplicity and left such chains in drawing order.
 */
function getSubstituentOccurrenceLocants(parsedMol: ParsedMol, path: number[]) {
  const parentSet = new Set(path);
  const locants: number[] = [];
  path.forEach((parentAtom, index) => {
    for (const bond of parsedMol.adjacency.get(parentAtom) ?? []) {
      const other = getOtherAtom(bond, parentAtom);
      const otherAtom = parsedMol.atoms[other];
      if (!otherAtom || parentSet.has(other)) continue;
      locants.push(index + 1);
    }
  });
  return locants.sort((a, b) => a - b);
}

function getLocantsForAtoms(path: number[], atomIndexes: number[]) {
  const atomSet = new Set(atomIndexes);

  return path
    .map((atomIndex, index) => (atomSet.has(atomIndex) ? index + 1 : null))
    .filter((locant): locant is number => locant !== null)
    .sort((a, b) => a - b);
}

function compareLocants(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i++) {
    const valueA = a[i] ?? Number.POSITIVE_INFINITY;
    const valueB = b[i] ?? Number.POSITIVE_INFINITY;

    if (valueA < valueB) return -1;
    if (valueA > valueB) return 1;
  }

  return 0;
}

export function orientParentForPrimaryGroup(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  primaryGroup: FunctionalGroupResult | null
): ParentDescriptor {
  if (parent.kind !== "chain") return parent;

  // Terminal suffix parents still need explicit orientation. In particular,
  // carboxylic acids, aldehydes, nitriles, amides, etc. must number the
  // suffix-bearing carbon from the lowest possible end of the parent chain.
  // Returning early here made long-chain acids depend on DFS atom order and
  // could reverse every unsaturation locant (e.g. arachidonic acid
  // 5,8,11,14 -> 6,9,12,15).
  const forwardPath = parent.path;
  const reversePath = [...parent.path].reverse();

  const primaryAtoms = getParentCandidateAtomsForPrimaryGroup(
    parsedMol,
    primaryGroup
  );

  const forwardPrimaryLocants = getLocantsForAtoms(forwardPath, primaryAtoms);
  const reversePrimaryLocants = getLocantsForAtoms(reversePath, primaryAtoms);

  const primaryComparison = compareLocants(
    reversePrimaryLocants,
    forwardPrimaryLocants
  );

  if (primaryComparison < 0) return { ...parent, path: reversePath };
  if (primaryComparison > 0) return { ...parent, path: forwardPath };

  const unsaturationComparison = compareMultipleBondLocants(
    parsedMol,
    forwardPath,
    reversePath
  );

  if (unsaturationComparison < 0) return { ...parent, path: reversePath };
  if (unsaturationComparison > 0) return { ...parent, path: forwardPath };

  const forwardSubstituentLocants = getSubstituentOccurrenceLocants(parsedMol, forwardPath);
  const reverseSubstituentLocants = getSubstituentOccurrenceLocants(parsedMol, reversePath);

  return compareLocants(reverseSubstituentLocants, forwardSubstituentLocants) < 0
    ? { ...parent, path: reversePath }
    : { ...parent, path: forwardPath };
}

function getMultipleBondLocants(parsedMol: ParsedMol, path: number[]) {
  const { doubleLocants, tripleLocants } = getChainUnsaturation(parsedMol, path);

  return {
    all: [...doubleLocants, ...tripleLocants].sort((a, b) => a - b),
    doubleLocants: [...doubleLocants].sort((a, b) => a - b),
    tripleLocants: [...tripleLocants].sort((a, b) => a - b),
  };
}

function compareMultipleBondLocants(
  parsedMol: ParsedMol,
  forwardPath: number[],
  reversePath: number[]
) {
  const forward = getMultipleBondLocants(parsedMol, forwardPath);
  const reverse = getMultipleBondLocants(parsedMol, reversePath);

  const allComparison = compareLocants(reverse.all, forward.all);
  if (allComparison !== 0) return allComparison;

  const doubleComparison = compareLocants(
    reverse.doubleLocants,
    forward.doubleLocants
  );

  if (doubleComparison !== 0) return doubleComparison;

  return compareLocants(reverse.tripleLocants, forward.tripleLocants);
}