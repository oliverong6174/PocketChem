import { deduplicateAtomMatches } from "./matchUtils";
import type { FunctionalGroupMatch } from "./types";

const AROMATIC_RING_GROUPS = new Set([
  "Benzene",
  "Phenol",
  "Aryl ether",
  "Anisole",
  "Aryl amine",
  "Aniline",
  "Aryl halide",
  "Nitrobenzene",
  "Alkylbenzene",
  "Toluene",
  "Naphthalene",
  "Anthracene",
  "Phenanthrene",
  "Indane",
  "Pyridine",
  "Pyrrole",
  "Furan",
  "Thiophene",
  "Indole",
]);

export function isAromaticRingGroup(groupName: string) {
  return AROMATIC_RING_GROUPS.has(groupName);
}

export function deduplicateAromaticMatches(
  groupName: string,
  matches: FunctionalGroupMatch[]
): FunctionalGroupMatch[] {
  if (!isAromaticRingGroup(groupName)) {
    return matches;
  }

  const uniqueAtomMatches = deduplicateAtomMatches(
    matches.map((match) => match.atoms)
  );

  return uniqueAtomMatches.map((atoms) => {
    const original = matches.find(
      (match) =>
        [...match.atoms].sort((a, b) => a - b).join("-") ===
        [...atoms].sort((a, b) => a - b).join("-")
    );

    return original ?? { atoms, bonds: [] };
  });
}