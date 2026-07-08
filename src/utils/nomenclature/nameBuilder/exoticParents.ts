import type { ParentDescriptor, ParsedMol } from "../types";
import type { RetainedHeterocycleSpec } from "./functionalGroupNaming";

import { getOtherAtom } from "../molParser";

export function getExoticParentDescriptor(
  parsedMol: ParsedMol,
  specs: RetainedHeterocycleSpec[] = []
): ParentDescriptor | null {
  for (const spec of specs) {
    const parent = getRetainedHeterocycleParentDescriptor(parsedMol, spec);

    if (parent) return parent;
  }

  return null;
}

function getRetainedHeterocycleParentDescriptor(
  parsedMol: ParsedMol,
  spec: RetainedHeterocycleSpec
): ParentDescriptor | null {
  for (const heteroAtom of parsedMol.atoms.filter(
    (atom) => atom.element === spec.heteroElement
  )) {
    const ringPath = findSimpleRetainedHeterocycleRing(
      parsedMol,
      heteroAtom.atomIndex,
      spec
    );

    if (!ringPath) continue;

    const orientedPath = orientRetainedHeterocycleRing(
      parsedMol,
      ringPath
    );

    return {
      kind: "ring",
      path: orientedPath,
      carbonCount: spec.carbonCount,
      parentHydrocarbon: spec.parentHydrocarbon,
      parentStem: spec.parentStem,
      aromaticRing: false,
    };
  }

  return null;
}

function findSimpleRetainedHeterocycleRing(
  parsedMol: ParsedMol,
  heteroAtom: number,
  spec: RetainedHeterocycleSpec
) {
  let found: number[] | null = null;

  const allowedElements = new Set(["C", spec.heteroElement]);

  const dfs = (current: number, path: number[]) => {
    if (found) return;

    if (path.length === spec.ringSize) {
      const closesToStart = (parsedMol.adjacency.get(current) ?? []).some(
        (bond) => getOtherAtom(bond, current) === heteroAtom
      );

      if (!closesToStart) return;

      const carbonCount = path.filter(
        (atomIndex) => parsedMol.atoms[atomIndex]?.element === "C"
      ).length;

      const heteroCount = path.filter(
        (atomIndex) =>
          parsedMol.atoms[atomIndex]?.element === spec.heteroElement
      ).length;

      if (carbonCount === spec.carbonCount && heteroCount === 1) {
        found = path;
      }

      return;
    }

    for (const bond of parsedMol.adjacency.get(current) ?? []) {
      if (bond.bondOrder !== 1) continue;

      const next = getOtherAtom(bond, current);

      if (next === heteroAtom) continue;
      if (path.includes(next)) continue;

      const nextAtom = parsedMol.atoms[next];

      if (!nextAtom) continue;
      if (!allowedElements.has(nextAtom.element)) continue;

      dfs(next, [...path, next]);
    }
  };

  dfs(heteroAtom, [heteroAtom]);

  return found;
}

function orientRetainedHeterocycleRing(
  parsedMol: ParsedMol,
  ringPath: number[]
) {
  if (ringPath.length <= 2) return ringPath;

  // Heteroatom is always locant 1. Compare the two directions around the ring.
  const forward = ringPath;
  const reverse = [ringPath[0], ...ringPath.slice(1).reverse()];

  const forwardLocants = getExternalSubstituentLocants(parsedMol, forward);
  const reverseLocants = getExternalSubstituentLocants(parsedMol, reverse);

  return compareLocants(reverseLocants, forwardLocants) < 0
    ? reverse
    : forward;
}

function getExternalSubstituentLocants(
  parsedMol: ParsedMol,
  path: number[]
) {
  const ringSet = new Set(path);
  const locants: number[] = [];

  path.forEach((atomIndex, index) => {
    for (const bond of parsedMol.adjacency.get(atomIndex) ?? []) {
      const other = getOtherAtom(bond, atomIndex);

      if (ringSet.has(other)) continue;

      const otherAtom = parsedMol.atoms[other];

      if (!otherAtom) continue;
      if (otherAtom.element === "H") continue;

      locants.push(index + 1);
    }
  });

  return locants.sort((a, b) => a - b);
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