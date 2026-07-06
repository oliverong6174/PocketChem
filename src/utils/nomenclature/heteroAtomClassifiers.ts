import type { ParsedMol } from "./types";

import { getOtherAtom } from "./molParser";

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
  const oxygen = parsedMol.atoms[oxygenIndex];

  if (!oxygen || oxygen.element !== "O") return null;

  const carbonNeighbors = getSingleBondedCarbonNeighbors(
    parsedMol,
    oxygenIndex
  );

  // Alcohol/phenol-style hydroxy oxygen should have exactly one carbon
  // neighbor. Ether oxygen has two carbon neighbors and must not create -ol.
  if (carbonNeighbors.length !== 1) return null;

  const carbonIndex = carbonNeighbors[0];

  // Do not count the single-bonded oxygen of carboxylic acids, esters,
  // carbonates, amides, etc. as ordinary alcohol.
  if (carbonHasCarbonylOxygen(parsedMol, carbonIndex)) return null;

  return carbonIndex;
}

export function isHydroxyOxygen(
  parsedMol: ParsedMol,
  oxygenIndex: number
) {
  return getHydroxyBearingCarbon(parsedMol, oxygenIndex) !== null;
}