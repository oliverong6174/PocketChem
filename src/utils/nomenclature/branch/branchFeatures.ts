import type { ParsedMol, ParsedBond } from "../types.ts";
import type { BranchSubstituent } from "./branchTypes.ts";

import { getOtherAtom } from "../molParser.ts";

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

export function detectBranchInternalSubstituents(
  parsedMol: ParsedMol,
  branchAtoms: Set<number>,
  branchPath: number[]
): BranchSubstituent[] {
  const branchPathSet = new Set(branchPath);
  const locants = getBranchLocantMap(branchPath);
  const substituents: BranchSubstituent[] = [];

  for (const branchAtom of branchPath) {
    const locant = locants.get(branchAtom) ?? 0;

    for (const bond of parsedMol.adjacency.get(branchAtom) ?? []) {
      const other = getOtherAtom(bond, branchAtom);
      const otherAtom = parsedMol.atoms[other];

      if (!otherAtom) continue;
      if (branchPathSet.has(other)) continue;

      const halogenName = HALOGEN_PREFIXES[otherAtom.element];

      if (halogenName) {
        substituents.push({ name: halogenName, locant });
        continue;
      }

      if (otherAtom.element === "O") {
        if (bond.bondOrder !== 1) continue;
        substituents.push({ name: "hydroxy", locant });
        continue;
      }

      if (otherAtom.element === "S") {
        substituents.push({ name: "sulfanyl", locant });
        continue;
      }

      if (otherAtom.element === "N") {
        substituents.push({ name: "amino", locant });
        continue;
      }

      if (otherAtom.element === "C") {
        if (!branchAtoms.has(other)) continue;

        substituents.push({
          name: "methyl",
          locant,
        });
      }
    }
  }

  return substituents;
}