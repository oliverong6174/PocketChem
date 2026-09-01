import type { ParsedMol } from "./types";
import { getOtherAtom } from "./molParser";
import { getHydroxyCarbonFromOxygen } from "./classifiers/oxygen";

export function getSingleBondedCarbonNeighbors(
  parsedMol: ParsedMol,
  atomIndex: number
) {
  return (parsedMol.adjacency.get(atomIndex) ?? [])
    .filter((bond) => bond.bondOrder === 1)
    .map((bond) => getOtherAtom(bond, atomIndex))
    .filter((otherIndex) => parsedMol.atoms[otherIndex]?.element === "C");
}

export function carbonHasCarbonylOxygen(
  parsedMol: ParsedMol,
  carbonIndex: number
) {
  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "O" && bond.bondOrder === 2;
  });
}

export function getHydroxyBearingCarbon(
  parsedMol: ParsedMol,
  oxygenIndex: number
) {
  const carbonIndex = getHydroxyCarbonFromOxygen(parsedMol, oxygenIndex);
  if (carbonIndex === null) return null;

  // The hydroxy oxygen of a carboxylic acid is not an alcohol suffix.
  if (carbonHasCarbonylOxygen(parsedMol, carbonIndex)) return null;

  return carbonIndex;
}

export function isHydroxyOxygen(parsedMol: ParsedMol, oxygenIndex: number) {
  return getHydroxyBearingCarbon(parsedMol, oxygenIndex) !== null;
}
