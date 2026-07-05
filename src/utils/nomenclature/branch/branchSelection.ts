import type { ParsedMol } from "../types";
import { getOtherAtom } from "../molParser";

export function collectBranchCarbons(
  parsedMol: ParsedMol,
  startAtom: number,
  blockedAtom: number
) {
  const branchAtoms = new Set<number>();

  const dfs = (atomIndex: number) => {
    if (branchAtoms.has(atomIndex)) return;

    const atom = parsedMol.atoms[atomIndex];
    if (!atom || atom.element !== "C") return;

    branchAtoms.add(atomIndex);

    for (const bond of parsedMol.adjacency.get(atomIndex) ?? []) {
      const next = getOtherAtom(bond, atomIndex);
      if (next === blockedAtom) continue;

      const nextAtom = parsedMol.atoms[next];
      if (nextAtom?.element === "C") dfs(next);
    }
  };

  dfs(startAtom);

  return branchAtoms;
}

export function getLongestBranchParentPath(
  parsedMol: ParsedMol,
  branchAtoms: Set<number>,
  attachmentAtom: number
) {
  let bestPath: number[] = [];

  const dfs = (
    current: number,
    visited: Set<number>,
    path: number[]
  ) => {
    if (path.includes(attachmentAtom) && path.length > bestPath.length) {
      bestPath = [...path];
    }

    for (const bond of parsedMol.adjacency.get(current) ?? []) {
      const next = getOtherAtom(bond, current);

      if (!branchAtoms.has(next)) continue;
      if (visited.has(next)) continue;

      visited.add(next);
      dfs(next, visited, [...path, next]);
      visited.delete(next);
    }
  };

  for (const atomIndex of branchAtoms) {
    dfs(atomIndex, new Set([atomIndex]), [atomIndex]);
  }

  return bestPath;
}

export function orientBranchPathForAttachment(
  path: number[],
  attachmentAtom: number
) {
  const forwardLocant = path.indexOf(attachmentAtom) + 1;
  const reversePath = [...path].reverse();
  const reverseLocant = reversePath.indexOf(attachmentAtom) + 1;

  return reverseLocant < forwardLocant ? reversePath : path;
}