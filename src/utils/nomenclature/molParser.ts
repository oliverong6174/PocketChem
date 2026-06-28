import type { ParsedAtom, ParsedBond, ParsedMol } from "./types";

export function parseMolBlock(molblock: string): ParsedMol {
  const lines = molblock.split(/\r?\n/);
  const countsLine = lines[3];

  if (!countsLine) {
    return { atoms: [], bonds: [], adjacency: new Map() };
  }

  const atomCount = Number.parseInt(countsLine.slice(0, 3).trim(), 10);
  const bondCount = Number.parseInt(countsLine.slice(3, 6).trim(), 10);

  if (!Number.isFinite(atomCount) || !Number.isFinite(bondCount)) {
    return { atoms: [], bonds: [], adjacency: new Map() };
  }

  const atoms: ParsedAtom[] = lines.slice(4, 4 + atomCount).map((line, index) => {
    const parts = line.trim().split(/\s+/);

    return {
      atomIndex: index,
      element: parts[3] ?? "",
      charge: 0,
    };
  });

  const bonds: ParsedBond[] = lines
    .slice(4 + atomCount, 4 + atomCount + bondCount)
    .map((line, index) => {
      const atomA = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
      const atomB = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
      const bondOrder = Number.parseInt(line.slice(6, 9).trim(), 10);

      return {
        bondIndex: index,
        atomA,
        atomB,
        bondOrder: bondOrder === 4 ? 1.5 : bondOrder,
      };
    })
    .filter(
      (bond) =>
        Number.isFinite(bond.atomA) &&
        Number.isFinite(bond.atomB) &&
        Number.isFinite(bond.bondOrder)
    );

  for (const line of lines) {
    if (!line.startsWith("M  CHG")) continue;

    const parts = line.trim().split(/\s+/);
    const pairCount = Number.parseInt(parts[2] ?? "0", 10);

    for (let i = 0; i < pairCount; i++) {
      const atomNumber = Number.parseInt(parts[3 + i * 2] ?? "", 10);
      const charge = Number.parseInt(parts[4 + i * 2] ?? "", 10);
      const atom = atoms[atomNumber - 1];

      if (atom && Number.isFinite(charge)) {
        atom.charge = charge;
      }
    }
  }

  const adjacency = new Map<number, ParsedBond[]>();
  atoms.forEach((atom) => adjacency.set(atom.atomIndex, []));

  bonds.forEach((bond) => {
    adjacency.get(bond.atomA)?.push(bond);
    adjacency.get(bond.atomB)?.push(bond);
  });

  return { atoms, bonds, adjacency };
}

export function getOtherAtom(bond: ParsedBond, atomIndex: number) {
  return bond.atomA === atomIndex ? bond.atomB : bond.atomA;
}