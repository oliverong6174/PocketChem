import type { ParsedMol } from "../types.ts";

import { CHAIN_PREFIXES } from "../constants.ts";

import { orientBranchPathForNaming } from "./branchOrientation.ts";
import { formatBranchSubstituents } from "./branchPrefixes.ts";
import { buildAromaticBranchName } from "./branchAromatics.ts";

import {
  collectBranchCarbons,
  getLongestBranchParentPath,
} from "./branchSelection.ts";

import {
  detectBranchInternalSubstituents,
  getBranchSubstituentBearingAtoms,
  getBranchUnsaturation,
} from "./branchFeatures.ts";

function getBranchBaseName(
  parsedMol: ParsedMol,
  path: number[],
  attachmentLocant: number
) {
  const prefix = CHAIN_PREFIXES[path.length];
  if (!prefix) return "alkyl";

  const { doubleLocants, tripleLocants } = getBranchUnsaturation(
    parsedMol,
    path
  );

  if (doubleLocants.length === 0 && tripleLocants.length === 0) {
    if (path.length === 1) return "methyl";
    if (path.length === 2) return "ethyl";

    if (attachmentLocant === 1) {
      if (path.length === 3) return "propyl";
      if (path.length === 4) return "butyl";
      return `${prefix}yl`;
    }

    return `${prefix}an-${attachmentLocant}-yl`;
  }

  if (doubleLocants.length > 0 && tripleLocants.length === 0) {
    const eneLocants = doubleLocants.join(",");
    return `${prefix}-${eneLocants}-en-${attachmentLocant}-yl`;
  }

  if (tripleLocants.length > 0 && doubleLocants.length === 0) {
    const yneLocants = tripleLocants.join(",");
    return `${prefix}-${yneLocants}-yn-${attachmentLocant}-yl`;
  }

  return `${prefix}-${doubleLocants.join(",")}-en-${tripleLocants.join(",")}-yn-${attachmentLocant}-yl`;
}

export function buildBranchName(
  parsedMol: ParsedMol,
  startAtom: number,
  blockedAtom: number
) {
  const aromaticBranch = buildAromaticBranchName(
    parsedMol,
    startAtom,
    blockedAtom
  );

  if (aromaticBranch) {
    return {
      carbonCount: aromaticBranch.carbonCount,
      path: aromaticBranch.ringPath,
      attachmentLocant: 1,
      name: aromaticBranch.name,
    };
  }

  const branchAtoms = collectBranchCarbons(
    parsedMol,
    startAtom,
    blockedAtom
  );

  let branchPath = getLongestBranchParentPath(
    parsedMol,
    branchAtoms,
    startAtom
  );

  const ignoredAtoms = new Set<number>([blockedAtom]);

  const substituentBearingAtoms = getBranchSubstituentBearingAtoms(
    parsedMol,
    branchAtoms,
    branchPath,
    ignoredAtoms
  );

  branchPath = orientBranchPathForNaming(
    parsedMol,
    branchPath,
    startAtom,
    substituentBearingAtoms
  );

  const attachmentLocant = branchPath.indexOf(startAtom) + 1;

  const baseName = getBranchBaseName(
    parsedMol,
    branchPath,
    attachmentLocant
  );

    const branchSubstituents = detectBranchInternalSubstituents(
    parsedMol,
    branchAtoms,
    branchPath,
    ignoredAtoms
  );
  const prefixString = formatBranchSubstituents(branchSubstituents);

  return {
    carbonCount: branchAtoms.size,
    path: branchPath,
    attachmentLocant,
    name: prefixString ? `${prefixString}${baseName}` : baseName,
  };
}