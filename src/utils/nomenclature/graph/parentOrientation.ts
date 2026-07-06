import type { FunctionalGroupResult } from "../../functionalGroups/types";
import type { ParentDescriptor, ParsedMol } from "../types";

import { getOtherAtom } from "../molParser";

import {
  getChainUnsaturation,
  getParentCandidateAtomsForPrimaryGroup,
} from "./parentSelection";

function getSubstituentBearingAtoms(parsedMol: ParsedMol, path: number[]) {
  const parentSet = new Set(path);
  const atoms: number[] = [];

  for (const parentAtom of path) {
    for (const bond of parsedMol.adjacency.get(parentAtom) ?? []) {
      const other = getOtherAtom(bond, parentAtom);
      const otherAtom = parsedMol.atoms[other];

      if (!otherAtom) continue;
      if (parentSet.has(other)) continue;

      atoms.push(parentAtom);
    }
  }

  return Array.from(new Set(atoms));
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

  if (isTerminalSuffixGroup(primaryGroup)) {
  return parent;
}

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

  const substituentAtoms = getSubstituentBearingAtoms(parsedMol, parent.path);

  const forwardSubstituentLocants = getLocantsForAtoms(forwardPath, substituentAtoms);
  const reverseSubstituentLocants = getLocantsForAtoms(reversePath, substituentAtoms);

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

  // Rule 1: lowest set of locants for all multiple bonds
  const allComparison = compareLocants(reverse.all, forward.all);
  if (allComparison !== 0) return allComparison;

  // Rule 2: if tied, double bonds get lower locants than triple bonds
  const doubleComparison = compareLocants(
    reverse.doubleLocants,
    forward.doubleLocants
  );

  if (doubleComparison !== 0) return doubleComparison;

  // Rule 3: then compare triple bonds
  return compareLocants(reverse.tripleLocants, forward.tripleLocants);
}

function isTerminalSuffixGroup(primaryGroup: FunctionalGroupResult | null) {
  const suffix = primaryGroup?.suffix?.toLowerCase().replace(/^-/, "") ?? "";
  const name = primaryGroup?.name?.toLowerCase() ?? "";

  return (
    suffix === "al" ||
    suffix === "oic acid" ||
    suffix === "oate" ||
    suffix === "amide" ||
    suffix.includes("nitrile") ||
    name.includes("aldehyde") ||
    name.includes("carboxylic acid") ||
    name.includes("ester") ||
    name.includes("amide") ||
    name.includes("nitrile")
  );
}