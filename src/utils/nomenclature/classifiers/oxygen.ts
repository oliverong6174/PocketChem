import type { ParsedMol } from "../types";
import { getOtherAtom } from "../molParser";

export type OxygenEnvironment =
  | "hydroxy"
  | "alkoxide"
  | "ether"
  | "peroxide"
  | "hydroperoxide"
  | "nitrateEster"
  | "sulfurOxygenEster"
  | "phosphateEster"
  | "silylEther"
  | "carbonylOxygen"
  | "other";

export type OxygenClassification = {
  kind: OxygenEnvironment;
  carbonNeighbor: number | null;
  heavyNeighbors: number[];
};

function heavyNeighbors(parsedMol: ParsedMol, oxygenIndex: number) {
  return (parsedMol.adjacency.get(oxygenIndex) ?? [])
    .map((bond) => ({
      bond,
      atomIndex: getOtherAtom(bond, oxygenIndex),
    }))
    .filter(({ atomIndex }) => parsedMol.atoms[atomIndex]?.element !== "H");
}

function isNitrateNitrogen(parsedMol: ParsedMol, nitrogenIndex: number) {
  const nitrogen = parsedMol.atoms[nitrogenIndex];
  if (!nitrogen || nitrogen.element !== "N" || nitrogen.charge <= 0) return false;

  const oxygenBonds = (parsedMol.adjacency.get(nitrogenIndex) ?? []).filter(
    (bond) => parsedMol.atoms[getOtherAtom(bond, nitrogenIndex)]?.element === "O"
  );

  const hasDoubleO = oxygenBonds.some((bond) => bond.bondOrder === 2);
  const hasAnionicO = oxygenBonds.some((bond) => {
    const oxygen = parsedMol.atoms[getOtherAtom(bond, nitrogenIndex)];
    return bond.bondOrder === 1 && (oxygen?.charge ?? 0) < 0;
  });

  return oxygenBonds.length >= 2 && hasDoubleO && hasAnionicO;
}

export function classifyOxygen(
  parsedMol: ParsedMol,
  oxygenIndex: number
): OxygenClassification | null {
  const oxygen = parsedMol.atoms[oxygenIndex];
  if (!oxygen || oxygen.element !== "O") return null;

  const neighbors = heavyNeighbors(parsedMol, oxygenIndex);
  const heavyAtomIndexes = neighbors.map(({ atomIndex }) => atomIndex);
  const carbonNeighbors = heavyAtomIndexes.filter(
    (index) => parsedMol.atoms[index]?.element === "C"
  );
  const carbonNeighbor = carbonNeighbors.length === 1 ? carbonNeighbors[0] : null;

  if (oxygen.charge < 0 && neighbors.length <= 1) {
    return { kind: "alkoxide", carbonNeighbor, heavyNeighbors: heavyAtomIndexes };
  }

  if (neighbors.some(({ bond }) => bond.bondOrder === 2)) {
    return {
      kind: "carbonylOxygen",
      carbonNeighbor,
      heavyNeighbors: heavyAtomIndexes,
    };
  }

  const heteroNeighbor = neighbors.find(({ atomIndex }) => {
    const element = parsedMol.atoms[atomIndex]?.element;
    return element !== "C" && element !== "H";
  });

  if (carbonNeighbors.length === 1 && neighbors.length === 1 && oxygen.charge === 0) {
    return { kind: "hydroxy", carbonNeighbor, heavyNeighbors: heavyAtomIndexes };
  }

  if (neighbors.length === 1 && heteroNeighbor) {
    const element = parsedMol.atoms[heteroNeighbor.atomIndex]?.element;
    if (element === "O" && oxygen.charge === 0) {
      return { kind: "hydroperoxide", carbonNeighbor, heavyNeighbors: heavyAtomIndexes };
    }
  }

  if (carbonNeighbors.length === 2 && neighbors.length === 2) {
    return { kind: "ether", carbonNeighbor: null, heavyNeighbors: heavyAtomIndexes };
  }

  if (carbonNeighbors.length === 1 && neighbors.length === 2 && heteroNeighbor) {
    const heteroElement = parsedMol.atoms[heteroNeighbor.atomIndex]?.element;

    if (heteroElement === "O") {
      return { kind: "peroxide", carbonNeighbor, heavyNeighbors: heavyAtomIndexes };
    }

    if (
      heteroElement === "N" &&
      isNitrateNitrogen(parsedMol, heteroNeighbor.atomIndex)
    ) {
      return { kind: "nitrateEster", carbonNeighbor, heavyNeighbors: heavyAtomIndexes };
    }

    if (heteroElement === "S") {
      return {
        kind: "sulfurOxygenEster",
        carbonNeighbor,
        heavyNeighbors: heavyAtomIndexes,
      };
    }

    if (heteroElement === "P") {
      return { kind: "phosphateEster", carbonNeighbor, heavyNeighbors: heavyAtomIndexes };
    }

    if (heteroElement === "Si") {
      return { kind: "silylEther", carbonNeighbor, heavyNeighbors: heavyAtomIndexes };
    }
  }

  return { kind: "other", carbonNeighbor, heavyNeighbors: heavyAtomIndexes };
}

export function getHydroxyCarbonFromOxygen(
  parsedMol: ParsedMol,
  oxygenIndex: number
) {
  const classification = classifyOxygen(parsedMol, oxygenIndex);
  return classification?.kind === "hydroxy"
    ? classification.carbonNeighbor
    : null;
}
