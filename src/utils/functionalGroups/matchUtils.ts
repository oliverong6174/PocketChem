export function parseRDKitSubstructureMatches(matchesRaw: string): number[][] {
  try {
    const parsedMatches = JSON.parse(matchesRaw);

    if (!Array.isArray(parsedMatches)) {
      return [];
    }

    return parsedMatches
      .map((match) => {
        if (
          match &&
          typeof match === "object" &&
          Array.isArray(match.atoms)
        ) {
          return match.atoms as number[];
        }

        if (Array.isArray(match)) {
          return match as number[];
        }

        return [];
      })
      .filter((atoms) => atoms.length > 0);
  } catch {
    return [];
  }
}

export function getAtomKey(atoms: number[]) {
  return [...atoms].sort((a, b) => a - b).join("-");
}

export function hasAtomOverlap(a: number[], b: number[]) {
  return a.some((atomIndex) => b.includes(atomIndex));
}

export function isAtomSubset(childAtoms: number[], parentAtoms: number[]) {
  return childAtoms.every((atomIndex) => parentAtoms.includes(atomIndex));
}

export function deduplicateAtomMatches(matches: number[][]): number[][] {
  const seen = new Set<string>();
  const uniqueMatches: number[][] = [];

  for (const match of matches) {
    const key = getAtomKey(match);

    if (seen.has(key)) continue;

    seen.add(key);
    uniqueMatches.push(match);
  }

  return uniqueMatches;
}