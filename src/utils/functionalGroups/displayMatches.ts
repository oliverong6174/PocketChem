import { parseRDKitSubstructureMatches } from "./matchUtils";

import type {
  FunctionalGroupMatch,
  FunctionalGroupPattern,
} from "./types";

function isSubset(displayAtoms: number[], detectionAtoms: number[]) {
  return displayAtoms.every((atomIndex) => detectionAtoms.includes(atomIndex));
}

function chooseBestDisplayMatch(
  detectionMatch: FunctionalGroupMatch,
  displayMatches: FunctionalGroupMatch[]
): FunctionalGroupMatch {
  const subsetMatches = displayMatches
    .filter((displayMatch) =>
      isSubset(displayMatch.atoms, detectionMatch.atoms)
    )
    .sort((a, b) => b.atoms.length - a.atoms.length);

    console.log("DISPLAY MATCH CHOICE", {
        detectionMatch,
        displayMatches,
      });

  return subsetMatches[0] ?? detectionMatch;
}

export function getDisplayMatchesForGroup(
  RDKit: any,
  mol: any,
  group: FunctionalGroupPattern,
  detectionMatches: FunctionalGroupMatch[]
): FunctionalGroupMatch[] {
  if (!group.displaySmarts) {
    return detectionMatches;
  }

  let query: any = null;

  try {
    query = RDKit.get_qmol(group.displaySmarts);
    const rawMatches = mol.get_substruct_matches(query);
    const displayMatches = parseRDKitSubstructureMatches(rawMatches);

    if (displayMatches.length === 0) {
      return detectionMatches;
    }

    return detectionMatches.map((detectionMatch) =>
      chooseBestDisplayMatch(detectionMatch, displayMatches)
    );
  } catch (error) {
    console.warn(`Display SMARTS failed for ${group.name}:`, error);
    return detectionMatches;
  } finally {
    query?.delete?.();
  }
}