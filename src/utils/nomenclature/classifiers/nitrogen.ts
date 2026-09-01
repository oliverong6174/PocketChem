import type { ParsedMol } from "../types";
import { getOtherAtom } from "../molParser";

function hasDoubleBondedOxygen(parsedMol: ParsedMol, atomIndex: number) {
  return (parsedMol.adjacency.get(atomIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, atomIndex)];
    return attached?.element === "O" && bond.bondOrder === 2;
  });
}

export function isSimpleAmineNitrogen(parsedMol: ParsedMol, nitrogenIndex: number) {
  const nitrogen = parsedMol.atoms[nitrogenIndex];
  if (!nitrogen || nitrogen.element !== "N" || nitrogen.charge > 0) return false;

  const bonds = parsedMol.adjacency.get(nitrogenIndex) ?? [];
  if (bonds.some((bond) => bond.bondOrder > 1)) return false;

  for (const bond of bonds) {
    const attachedIndex = getOtherAtom(bond, nitrogenIndex);
    const attached = parsedMol.atoms[attachedIndex];
    if (!attached) continue;

    if (attached.element === "C" && hasDoubleBondedOxygen(parsedMol, attachedIndex)) {
      return false; // amide/carbamate/urea-like nitrogen
    }

    if (attached.element === "S") {
      const sulfonylOxygens = (parsedMol.adjacency.get(attachedIndex) ?? []).filter(
        (candidate) => {
          const neighbor = parsedMol.atoms[getOtherAtom(candidate, attachedIndex)];
          return neighbor?.element === "O" && candidate.bondOrder === 2;
        }
      ).length;
      if (sulfonylOxygens >= 2) return false;
    }

    if (attached.element === "P" && hasDoubleBondedOxygen(parsedMol, attachedIndex)) {
      return false; // phosphoramidate-like nitrogen
    }
  }

  return true;
}

export function getNitrogenSubstituentPrefix(
  parsedMol: ParsedMol,
  nitrogenIndex: number,
  parentAtom?: number
) {
  const nitrogen = parsedMol.atoms[nitrogenIndex];
  if (!nitrogen || nitrogen.element !== "N") return "amino";

  const bonds = parsedMol.adjacency.get(nitrogenIndex) ?? [];
  const oxygenBonds = bonds.filter(
    (bond) => parsedMol.atoms[getOtherAtom(bond, nitrogenIndex)]?.element === "O"
  );

  if (oxygenBonds.length >= 2 && nitrogen.charge > 0) return "nitro";

  if (oxygenBonds.length === 1 && oxygenBonds[0].bondOrder >= 2) {
    return "nitroso";
  }

  const heterocumuleneCarbonBond = bonds.find((bond) => {
    if (bond.bondOrder !== 2) return false;
    const carbonIndex = getOtherAtom(bond, nitrogenIndex);
    if (parsedMol.atoms[carbonIndex]?.element !== "C") return false;

    return (parsedMol.adjacency.get(carbonIndex) ?? []).some((candidate) => {
      const attached = getOtherAtom(candidate, carbonIndex);
      if (attached === nitrogenIndex || candidate.bondOrder !== 2) return false;
      const element = parsedMol.atoms[attached]?.element;
      return element === "O" || element === "S";
    });
  });

  if (heterocumuleneCarbonBond) {
    const carbonIndex = getOtherAtom(heterocumuleneCarbonBond, nitrogenIndex);
    const hasTerminalSulfur = (parsedMol.adjacency.get(carbonIndex) ?? []).some(
      (candidate) => {
        const attached = getOtherAtom(candidate, carbonIndex);
        return (
          attached !== nitrogenIndex &&
          candidate.bondOrder === 2 &&
          parsedMol.atoms[attached]?.element === "S"
        );
      }
    );
    return hasTerminalSulfur ? "isothiocyanato" : "isocyanato";
  }

  const isocyanideBond = bonds.find((bond) => {
    const carbonIndex = getOtherAtom(bond, nitrogenIndex);
    return bond.bondOrder === 3 && parsedMol.atoms[carbonIndex]?.element === "C";
  });
  if (isocyanideBond) return "isocyano";

  const nnMultipleBond = bonds.find((bond) => {
    const attached = getOtherAtom(bond, nitrogenIndex);
    return (
      bond.bondOrder >= 2 &&
      attached !== parentAtom &&
      parsedMol.atoms[attached]?.element === "N"
    );
  });

  if (nnMultipleBond) {
    const otherNitrogen = getOtherAtom(nnMultipleBond, nitrogenIndex);
    const continuesToCarbon = (parsedMol.adjacency.get(otherNitrogen) ?? []).some(
      (bond) => {
        const attached = getOtherAtom(bond, otherNitrogen);
        return attached !== nitrogenIndex && parsedMol.atoms[attached]?.element === "C";
      }
    );
    return continuesToCarbon ? "azo" : "diazo";
  }

  const nextNitrogen = bonds
    .map((bond) => getOtherAtom(bond, nitrogenIndex))
    .find(
      (attached) =>
        attached !== parentAtom && parsedMol.atoms[attached]?.element === "N"
    );

  if (nextNitrogen !== undefined) {
    const hasThirdNitrogen = (parsedMol.adjacency.get(nextNitrogen) ?? []).some(
      (bond) => {
        const attached = getOtherAtom(bond, nextNitrogen);
        return attached !== nitrogenIndex && parsedMol.atoms[attached]?.element === "N";
      }
    );
    if (hasThirdNitrogen) return "azido";
  }

  return isSimpleAmineNitrogen(parsedMol, nitrogenIndex) ? "amino" : "amino";
}
