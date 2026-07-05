import type { ParsedMol } from "../types";
import { getBranchUnsaturation } from "./branchFeatures";

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

function getSubstituentLocants(
  branchPath: number[],
  substituentAtoms: number[]
) {
  const atomSet = new Set(substituentAtoms);

  return branchPath
    .map((atomIndex, index) => (atomSet.has(atomIndex) ? index + 1 : null))
    .filter((locant): locant is number => locant !== null)
    .sort((a, b) => a - b);
}

function getMultipleBondLocants(parsedMol: ParsedMol, path: number[]) {
  const { doubleLocants, tripleLocants } = getBranchUnsaturation(
    parsedMol,
    path
  );

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

export function orientBranchPathForNaming(
  parsedMol: ParsedMol,
  path: number[],
  attachmentAtom: number,
  substituentAtoms: number[] = []
) {
  const reversePath = [...path].reverse();

  const forwardAttachmentLocant = path.indexOf(attachmentAtom) + 1;
  const reverseAttachmentLocant = reversePath.indexOf(attachmentAtom) + 1;

  if (reverseAttachmentLocant < forwardAttachmentLocant) return reversePath;
  if (reverseAttachmentLocant > forwardAttachmentLocant) return path;

  const multipleBondComparison = compareMultipleBondLocants(
    parsedMol,
    path,
    reversePath
  );

  if (multipleBondComparison < 0) return reversePath;
  if (multipleBondComparison > 0) return path;

  const forwardSubstituentLocants = getSubstituentLocants(
    path,
    substituentAtoms
  );

  const reverseSubstituentLocants = getSubstituentLocants(
    reversePath,
    substituentAtoms
  );

  return compareLocants(reverseSubstituentLocants, forwardSubstituentLocants) < 0
    ? reversePath
    : path;
}