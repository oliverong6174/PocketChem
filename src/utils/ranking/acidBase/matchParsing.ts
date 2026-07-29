export function parseAtomMatches(matchesJson: string): number[][] {
  try {
    const parsed: unknown = JSON.parse(matchesJson);

    if (Array.isArray(parsed)) {
      return parsed
        .map((match: unknown): number[] => {
          if (Array.isArray(match)) {
            return match.filter(
              (value: unknown): value is number =>
                typeof value === "number" && Number.isInteger(value)
            );
          }

          if (
            typeof match === "object" &&
            match !== null &&
            "atoms" in match
          ) {
            const atoms: unknown = match.atoms;

            if (Array.isArray(atoms)) {
              return atoms.filter(
                (value: unknown): value is number =>
                  typeof value === "number" && Number.isInteger(value)
              );
            }
          }

          return [];
        })
        .filter((atoms: number[]) => atoms.length > 0);
    }

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "atoms" in parsed
    ) {
      const atoms: unknown = parsed.atoms;

      if (Array.isArray(atoms)) {
        const atomIndices = atoms.filter(
          (value: unknown): value is number =>
            typeof value === "number" && Number.isInteger(value)
        );

        return atomIndices.length > 0 ? [atomIndices] : [];
      }
    }

    return [];
  } catch {
    return [];
  }
}