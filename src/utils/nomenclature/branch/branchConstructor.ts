import type { ParsedMol } from "../types.ts";
import type { BranchSubstituent } from "./branchTypes.ts";

import { CHAIN_PREFIXES } from "../constants.ts";

import { orientBranchPathForNaming } from "./branchOrientation";
import { formatBranchSubstituents } from "./branchPrefixes";

import {
  collectBranchCarbons,
  getLongestBranchParentPath,
  orientBranchPathForAttachment,
} from "./branchSelection.ts";

import {
  detectBranchInternalSubstituents,
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

  branchPath = orientBranchPathForNaming(parsedMol, branchPath, startAtom);

  const attachmentLocant = branchPath.indexOf(startAtom) + 1;

  const baseName = getBranchBaseName(
    parsedMol,
    branchPath,
    attachmentLocant
  );

  const branchSubstituents = detectBranchInternalSubstituents(
    parsedMol,
    branchAtoms,
    branchPath
  );

  const prefixString = formatBranchSubstituents(branchSubstituents);

  return {
    carbonCount: branchAtoms.size,
    name: prefixString ? `${prefixString}${baseName}` : baseName,
  };
}