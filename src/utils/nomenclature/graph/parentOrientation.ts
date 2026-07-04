import type { FunctionalGroupResult } from "../../functionalGroups/types";
import type { ParentDescriptor, ParsedMol } from "../types";

import { getOtherAtom } from "../molParser";

import {
  getAlcoholBearingCarbons,
  getChainUnsaturation,
} from "./parentSelection";

function getHeteroatomAttachedCarbons(parsedMol: ParsedMol, element: string) {
  const carbons: number[] = [];

  for (const atom of parsedMol.atoms) {
    if (atom.element !== element) continue;

    for (const bond of parsedMol.adjacency.get(atom.atomIndex) ?? []) {
      const otherIndex = getOtherAtom(bond, atom.atomIndex);
      const other = parsedMol.atoms[otherIndex];

      if (other?.element === "C" && bond.bondOrder === 1) {
        carbons.push(otherIndex);
      }
    }
  }

  return Array.from(new Set(carbons));
}

function getPrimaryGroupBearingAtoms(
  parsedMol: ParsedMol,
  primaryGroup: FunctionalGroupResult | null
) {
  const suffix = primaryGroup?.suffix?.toLowerCase() ?? "";

  if (suffix.includes("thiol")) return getHeteroatomAttachedCarbons(parsedMol, "S");
  if (suffix.includes("ol")) return getAlcoholBearingCarbons(parsedMol);
  if (suffix.includes("amine")) return getHeteroatomAttachedCarbons(parsedMol, "N");

  return [];
}

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

  const forwardPath = parent.path;
  const reversePath = [...parent.path].reverse();

  const primaryAtoms = getPrimaryGroupBearingAtoms(parsedMol, primaryGroup);

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