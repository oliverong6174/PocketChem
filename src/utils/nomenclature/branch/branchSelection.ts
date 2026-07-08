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

function getPathMultipleBondLocants(parsedMol: ParsedMol, path: number[]) {
  const locants: number[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const bond = getBondBetween(parsedMol, path[i], path[i + 1]);

    if (!bond) continue;

    if (bond.bondOrder === 2 || bond.bondOrder === 3) {
      locants.push(i + 1);
    }
  }

  return locants.sort((a, b) => a - b);
}

function getPathUnsaturationCount(parsedMol: ParsedMol, path: number[]) {
  return getPathMultipleBondLocants(parsedMol, path).length;
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

function orientPathForLowestAttachmentLocant(
  path: number[],
  attachmentAtom: number
) {
  const forwardLocant = path.indexOf(attachmentAtom) + 1;

  if (forwardLocant <= 0) return path;

  const reversePath = [...path].reverse();
  const reverseLocant = reversePath.indexOf(attachmentAtom) + 1;

  if (reverseLocant <= 0) return path;

  return reverseLocant < forwardLocant ? reversePath : path;
}

function getAttachmentLocant(path: number[], attachmentAtom: number) {
  const orientedPath = orientPathForLowestAttachmentLocant(
    path,
    attachmentAtom
  );

  const locant = orientedPath.indexOf(attachmentAtom) + 1;

  return locant > 0 ? locant : Number.POSITIVE_INFINITY;
}

function getOrientedMultipleBondLocants(
  parsedMol: ParsedMol,
  path: number[],
  attachmentAtom: number
) {
  return getPathMultipleBondLocants(
    parsedMol,
    orientPathForLowestAttachmentLocant(path, attachmentAtom)
  );
}

function isBetterBranchPath(
  parsedMol: ParsedMol,
  candidate: number[],
  bestPath: number[],
  attachmentAtom: number
) {
  if (candidate.length === 0) return false;
  if (!candidate.includes(attachmentAtom)) return false;

  if (bestPath.length === 0) return true;

  // 1. Choose the longest substituent parent path that contains
  // the atom attached to the parent molecule.
  if (candidate.length > bestPath.length) return true;
  if (candidate.length < bestPath.length) return false;

  // 2. For equal-length paths, give the attachment atom the lowest possible
  // locant before considering unsaturation.
  //
  // This is the bug fix:
  // ring-C-CH2-CH2-CH=CH-CH3 must be pent-3-en-1-yl,
  // not pent-2-en-4-yl.
  const candidateAttachmentLocant = getAttachmentLocant(
    candidate,
    attachmentAtom
  );
  const bestAttachmentLocant = getAttachmentLocant(bestPath, attachmentAtom);

  if (candidateAttachmentLocant < bestAttachmentLocant) return true;
  if (candidateAttachmentLocant > bestAttachmentLocant) return false;

  // 3. Prefer paths containing more unsaturation.
  const candidateUnsaturation = getPathUnsaturationCount(parsedMol, candidate);
  const bestUnsaturation = getPathUnsaturationCount(parsedMol, bestPath);

  if (candidateUnsaturation > bestUnsaturation) return true;
  if (candidateUnsaturation < bestUnsaturation) return false;

  // 4. Then minimize multiple-bond locants after attachment orientation.
  const candidateMultipleBondLocants = getOrientedMultipleBondLocants(
    parsedMol,
    candidate,
    attachmentAtom
  );

  const bestMultipleBondLocants = getOrientedMultipleBondLocants(
    parsedMol,
    bestPath,
    attachmentAtom
  );

  return compareLocants(
    candidateMultipleBondLocants,
    bestMultipleBondLocants
  ) < 0;
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
    if (isBetterBranchPath(parsedMol, path, bestPath, attachmentAtom)) {
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

  if (bestPath.length === 0 && branchAtoms.has(attachmentAtom)) {
    return [attachmentAtom];
  }

  return orientPathForLowestAttachmentLocant(bestPath, attachmentAtom);
}

export function orientBranchPathForAttachment(
  path: number[],
  attachmentAtom: number
) {
  return orientPathForLowestAttachmentLocant(path, attachmentAtom);
}