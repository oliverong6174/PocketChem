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
  const candidates = findMatchingRingPaths(parsedMol, spec);
  if (candidates.length === 0) return null;

  const bestPath = [...candidates].sort((a, b) =>
    compareLocants(
      getExternalSubstituentLocants(parsedMol, a),
      getExternalSubstituentLocants(parsedMol, b)
    )
  )[0];

  return {
    kind: "ring",
    path: bestPath,
    carbonCount: spec.ringElements.filter((element) => element === "C").length,
    parentHydrocarbon: spec.parentHydrocarbon,
    parentStem: spec.parentStem,
    aromaticRing: spec.aromatic,
  };
}

function findMatchingRingPaths(
  parsedMol: ParsedMol,
  spec: RetainedHeterocycleSpec
) {
  const ringSize = spec.ringElements.length;
  const matches: number[][] = [];

  const firstElement = spec.ringElements[0];
  const startAtoms = parsedMol.atoms.filter(
    (atom) => atom.element === firstElement
  );

  for (const start of startAtoms) {
    const dfs = (current: number, path: number[]) => {
      const expectedIndex = path.length;

      if (path.length === ringSize) {
        const closes = (parsedMol.adjacency.get(current) ?? []).some(
          (bond) => getOtherAtom(bond, current) === start.atomIndex
        );
        if (closes) matches.push(path);
        return;
      }

      const expectedElement = spec.ringElements[expectedIndex];

      for (const bond of parsedMol.adjacency.get(current) ?? []) {
        const next = getOtherAtom(bond, current);
        if (next === start.atomIndex) continue;
        if (path.includes(next)) continue;

        const nextAtom = parsedMol.atoms[next];
        if (!nextAtom || nextAtom.element !== expectedElement) continue;

        // Both Kekule (1/2) and aromatic (1.5) representations are valid.
        if (bond.bondOrder <= 0) continue;
        dfs(next, [...path, next]);
      }
    };

    dfs(start.atomIndex, [start.atomIndex]);
  }

  return dedupePaths(matches);
}

function dedupePaths(paths: number[][]) {
  const seen = new Set<string>();
  const result: number[][] = [];

  for (const path of paths) {
    const key = path.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(path);
  }

  return result;
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
      if (!otherAtom || otherAtom.element === "H") continue;
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
