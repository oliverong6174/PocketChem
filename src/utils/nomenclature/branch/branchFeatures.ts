import type { ParsedMol, ParsedBond } from "../types.ts";
import type { BranchSubstituent } from "./branchTypes.ts";

import { CHAIN_PREFIXES } from "../constants.ts";
import { getOtherAtom } from "../molParser.ts";
import {
  collectBranchCarbons,
  getLongestBranchParentPath,
} from "./branchSelection.ts";

import {
  getHydroxyBearingCarbon,
  getSingleBondedCarbonNeighbors,
} from "../heteroAtomClassifiers.ts";

import { alkylNameToAlkoxyName } from "../alkoxyNames.ts";

const HALOGEN_PREFIXES: Record<string, string> = {
  F: "fluoro",
  Cl: "chloro",
  Br: "bromo",
  I: "iodo",
};

export function getBranchLocantMap(path: number[]) {
  const locants = new Map<number, number>();

  path.forEach((atomIndex, index) => {
    locants.set(atomIndex, index + 1);
  });

  return locants;
}

export function getBranchUnsaturation(
  parsedMol: ParsedMol,
  path: number[]
) {
  const doubleLocants: number[] = [];
  const tripleLocants: number[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const bond = parsedMol.bonds.find(
      (candidate: ParsedBond) =>
        (candidate.atomA === path[i] && candidate.atomB === path[i + 1]) ||
        (candidate.atomB === path[i] && candidate.atomA === path[i + 1])
    );

    if (!bond) continue;

    if (bond.bondOrder === 2) doubleLocants.push(i + 1);
    if (bond.bondOrder === 3) tripleLocants.push(i + 1);
  }

  return { doubleLocants, tripleLocants };
}

export function getBranchSubstituentBearingAtoms(
  parsedMol: ParsedMol,
  branchAtoms: Set<number>,
  branchPath: number[],
  ignoredAtoms: ReadonlySet<number> = new Set()
) {
  const branchPathSet = new Set(branchPath);
  const substituentBearingAtoms: number[] = [];

  for (const branchAtom of branchPath) {
    for (const bond of parsedMol.adjacency.get(branchAtom) ?? []) {
      const other = getOtherAtom(bond, branchAtom);
      const otherAtom = parsedMol.atoms[other];

      if (!otherAtom) continue;
      if (ignoredAtoms.has(other)) continue;
      if (branchPathSet.has(other)) continue;

      if (otherAtom.element === "C" && !branchAtoms.has(other)) continue;

      substituentBearingAtoms.push(branchAtom);
    }
  }

  return Array.from(new Set(substituentBearingAtoms));
}
function getSimpleSideChainName(
  parsedMol: ParsedMol,
  startAtom: number,
  blockedAtom: number
) {
  const sideAtoms = collectBranchCarbons(parsedMol, startAtom, blockedAtom);
  const sidePath = getLongestBranchParentPath(parsedMol, sideAtoms, startAtom);
  const prefix = CHAIN_PREFIXES[sidePath.length || sideAtoms.size];

  if (!prefix) return "alkyl";

  const { doubleLocants, tripleLocants } = getBranchUnsaturation(
    parsedMol,
    sidePath
  );

  if (doubleLocants.length === 1 && tripleLocants.length === 0) {
    return `${prefix}-${doubleLocants[0]}-enyl`;
  }

  if (tripleLocants.length === 1 && doubleLocants.length === 0) {
    return `${prefix}-${tripleLocants[0]}-ynyl`;
  }

  if (sidePath.length === 1) return "methyl";
  if (sidePath.length === 2) return "ethyl";
  if (sidePath.length === 3) return "propyl";
  if (sidePath.length === 4) return "butyl";

  return `${prefix}yl`;
}

function getNitrogenSubstituentName(parsedMol: ParsedMol, nitrogenAtom: number) {
  const nitrogenBonds = parsedMol.adjacency.get(nitrogenAtom) ?? [];

  const oxygenCount = nitrogenBonds.filter((bond) => {
    const attached = getOtherAtom(bond, nitrogenAtom);
    return parsedMol.atoms[attached]?.element === "O";
  }).length;

  return oxygenCount >= 2 ? "nitro" : "amino";
}

export function detectBranchInternalSubstituents(
  parsedMol: ParsedMol,
  branchAtoms: Set<number>,
  branchPath: number[],
  ignoredAtoms: ReadonlySet<number> = new Set()
): BranchSubstituent[] {
  const branchPathSet = new Set(branchPath);
  const locants = getBranchLocantMap(branchPath);
  const substituents: BranchSubstituent[] = [];

  for (const branchAtom of branchPath) {
    const locant = locants.get(branchAtom) ?? 0;

    for (const bond of parsedMol.adjacency.get(branchAtom) ?? []) {
      const other = getOtherAtom(bond, branchAtom);
      const otherAtom = parsedMol.atoms[other];
      
      if (ignoredAtoms.has(other)) continue;
      if (!otherAtom) continue;
      if (branchPathSet.has(other)) continue;

      const halogenName = HALOGEN_PREFIXES[otherAtom.element];

      if (halogenName) {
        substituents.push({ name: halogenName, locant });
        continue;
      }

      if (otherAtom.element === "O") {
        if (bond.bondOrder !== 1) continue;

        const hydroxyCarbon = getHydroxyBearingCarbon(parsedMol, other);

        if (hydroxyCarbon === branchAtom) {
          substituents.push({ name: "hydroxy", locant });
          continue;
        }

        const oxygenCarbonNeighbors = getSingleBondedCarbonNeighbors(
          parsedMol,
          other
        );

        const alkylCarbon = oxygenCarbonNeighbors.find(
          (carbonIndex) => carbonIndex !== branchAtom
        );

        if (alkylCarbon !== undefined) {
          const alkylName = getSimpleSideChainName(
            parsedMol,
            alkylCarbon,
            other
          );

          substituents.push({
            name: alkylNameToAlkoxyName(alkylName),
            locant,
          });
        }

        continue;
      }

      if (otherAtom.element === "S") {
        substituents.push({ name: "sulfanyl", locant });
        continue;
      }

      if (otherAtom.element === "N") {
        substituents.push({
          name: getNitrogenSubstituentName(parsedMol, other),
          locant,
        });
        continue;
      }

      if (otherAtom.element === "C") {
        if (!branchAtoms.has(other)) continue;

        substituents.push({
          name: getSimpleSideChainName(parsedMol, other, branchAtom),
          locant,
        });
      }
    }
  }

  return substituents;
}