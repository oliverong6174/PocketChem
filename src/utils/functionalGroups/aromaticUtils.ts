import { deduplicateAtomMatches } from "./matchUtils";

const AROMATIC_RING_GROUPS = new Set([
  "Benzene",
  "Arene",
  "Phenol",
  "Aryl ether",
  "Anisole",
  "Aryl amine",
  "Aniline",
  "Aryl halide",
  "Nitrobenzene",
  "Alkylbenzene",
  "Toluene",
]);

export function isAromaticRingGroup(groupName: string) {
  return AROMATIC_RING_GROUPS.has(groupName);
}

export function deduplicateAromaticMatches(
  groupName: string,
  matches: number[][]
): number[][] {
  if (!isAromaticRingGroup(groupName)) {
    return matches;
  }

  return deduplicateAtomMatches(matches);
}