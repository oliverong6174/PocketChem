import type { FunctionalGroupResult } from "../functionalGroups/types";
import type { ParentDescriptor, ParsedMol } from "./types";

import {
  getAlcoholBearingCarbons,
  orientPathForLowestUnsaturationLocants,
} from "./parentSelection";

function getFunctionalGroupBearingAtoms(
  parsedMol: ParsedMol,
  primaryGroup: FunctionalGroupResult | null
) {
  const suffix = primaryGroup?.suffix?.toLowerCase() ?? "";

  if (suffix.includes("thiol")) {
    return getHeteroatomAttachedCarbons(parsedMol, "S");
  }

  if (suffix.includes("ol")) {
    return getAlcoholBearingCarbons(parsedMol);
  }

  if (suffix.includes("amine")) {
    return getHeteroatomAttachedCarbons(parsedMol, "N");
  }

  return [];
}

function getHeteroatomAttachedCarbons(
  parsedMol: ParsedMol,
  element: string
) {
  const carbons: number[] = [];

  for (const atom of parsedMol.atoms) {
    if (atom.element !== element) continue;

    for (const bond of parsedMol.adjacency.get(atom.atomIndex) ?? []) {
      const otherIndex =
        bond.atomA === atom.atomIndex ? bond.atomB : bond.atomA;

      const other = parsedMol.atoms[otherIndex];

      if (other?.element === "C" && bond.bondOrder === 1) {
        carbons.push(otherIndex);
      }
    }
  }

  return Array.from(new Set(carbons));
}

function getLocantsForAtoms(path: number[], atomIndexes: number[]) {
  const atomSet = new Set(atomIndexes);

  return path
    .map((atomIndex, index) => atomSet.has(atomIndex) ? index + 1 : null)
    .filter((locant): locant is number => locant !== null);
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

  const bearingAtoms = getFunctionalGroupBearingAtoms(parsedMol, primaryGroup);

  if (bearingAtoms.length === 0) {
    return {
      ...parent,
      path: orientPathForLowestUnsaturationLocants(parsedMol, parent.path),
    };
  }

  const forwardPath = parent.path;
  const reversePath = [...parent.path].reverse();

  const forwardLocants = getLocantsForAtoms(forwardPath, bearingAtoms);
  const reverseLocants = getLocantsForAtoms(reversePath, bearingAtoms);

  const chosenPath =
    compareLocants(reverseLocants, forwardLocants) < 0
      ? reversePath
      : forwardPath;

  return {
    ...parent,
    path: chosenPath,
  };
}