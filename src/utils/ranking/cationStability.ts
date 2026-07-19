import { getRDKit } from "../rdkit";

export type CarbocationSubstitution =
  | "methyl"
  | "primary"
  | "secondary"
  | "tertiary"
  | "unknown";

export type CarbocationStabilityResult = {
  chargedAtomIndex: number;
  nearestStabilizer: string | null;
  distance: number | null;
  positionLabel: "alpha" | "beta" | "gamma" | "delta" | "epsilon+" | "none";
  resonanceStabilized: boolean;
  substitution: CarbocationSubstitution;
  stabilityShift: number;
  stabilityScore: number;
  explanation: string;
};

type StabilizerRule = {
  label: string;
  smarts: string;
  atomIndicesInMatch: number[];
  resonanceDistance: number;
  resonanceScore: number;
  shiftsByDistance: Record<number, number>;
};

type ParsedMolBlock = {
  atoms: string[];
  bonds: Array<[number, number]>;
};

function parseMolBlock(molblock: string): ParsedMolBlock {
  const lines = molblock.split(/\r?\n/);
  const countsLine = lines[3];

  if (!countsLine) {
    return { atoms: [], bonds: [] };
  }

  const atomCount = Number.parseInt(countsLine.slice(0, 3).trim(), 10);
  const bondCount = Number.parseInt(countsLine.slice(3, 6).trim(), 10);

  if (!Number.isFinite(atomCount) || !Number.isFinite(bondCount)) {
    return { atoms: [], bonds: [] };
  }

  const atomLines = lines.slice(4, 4 + atomCount);
  const bondLines = lines.slice(4 + atomCount, 4 + atomCount + bondCount);

  const atoms = atomLines.map((line) => {
    const parts = line.trim().split(/\s+/);
    return parts[3] ?? "";
  });

  const bonds: Array<[number, number]> = bondLines
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      const atomA = Number.parseInt(parts[0], 10) - 1;
      const atomB = Number.parseInt(parts[1], 10) - 1;

      if (!Number.isFinite(atomA) || !Number.isFinite(atomB)) {
        return null;
      }

      return [atomA, atomB] as [number, number];
    })
    .filter((bond): bond is [number, number] => bond !== null);

  return { atoms, bonds };
}

function getCarbonNeighborCount(
  parsedMol: ParsedMolBlock,
  atomIndex: number
): number {
  return parsedMol.bonds.reduce((count, [atomA, atomB]) => {
    if (atomA !== atomIndex && atomB !== atomIndex) {
      return count;
    }

    const neighborIndex = atomA === atomIndex ? atomB : atomA;
    const neighborSymbol = parsedMol.atoms[neighborIndex];

    return neighborSymbol === "C" ? count + 1 : count;
  }, 0);
}

function getCarbocationSubstitutionFromMol(
  mol: any,
  chargedAtomIndex: number
): CarbocationSubstitution {
  try {
    const parsedMol = parseMolBlock(mol.get_molblock());
    const carbonNeighborCount = getCarbonNeighborCount(
      parsedMol,
      chargedAtomIndex
    );

    if (carbonNeighborCount === 0) return "methyl";
    if (carbonNeighborCount === 1) return "primary";
    if (carbonNeighborCount === 2) return "secondary";
    if (carbonNeighborCount >= 3) return "tertiary";

    return "unknown";
  } catch (error) {
    console.log("Carbocation substitution detection failed:", error);
    return "unknown";
  }
}

function getLocalizedStabilityScore(
  substitution: CarbocationSubstitution
): number {
  if (substitution === "tertiary") return 2;
  if (substitution === "secondary") return 3;
  if (substitution === "primary") return 4;
  if (substitution === "methyl") return 5;
  return 6;
}

function getResonanceSubstitutionAdjustment(
  substitution: CarbocationSubstitution
): number {
  if (substitution === "tertiary") return 0;
  if (substitution === "secondary") return 0.1;
  if (substitution === "primary") return 0.2;
  if (substitution === "methyl") return 0.3;
  return 0.4;
}

const STABILIZER_RULES: StabilizerRule[] = [
  {
    label: "oxygen lone-pair donor",
    smarts: "[O;X2;+0]",
    atomIndicesInMatch: [0],
    resonanceDistance: 1,
    resonanceScore: 0.8,
    shiftsByDistance: {
      1: -30,
    },
  },
  {
    label: "amine nitrogen lone-pair donor",
    smarts: "[N;X3;+0]",
    atomIndicesInMatch: [0],
    resonanceDistance: 1,
    resonanceScore: 0.9,
    shiftsByDistance: {
      1: -28,
    },
  },
  {
    label: "imine nitrogen lone-pair donor",
    smarts: "[N;X2;+0]",
    atomIndicesInMatch: [0],
    resonanceDistance: 1,
    resonanceScore: 0.9,
    shiftsByDistance: {
      1: -28,
    },
  },
  {
    label: "sulfur lone-pair donor",
    smarts: "[S;X2;+0]",
    atomIndicesInMatch: [0],
    resonanceDistance: 1,
    resonanceScore: 1,
    shiftsByDistance: {
      1: -24,
    },
  },
  {
    label: "aromatic ring",
    smarts: "[c]",
    atomIndicesInMatch: [0],
    resonanceDistance: 1,
    resonanceScore: 1,
    shiftsByDistance: {
      1: -24,
    },
  },
  {
    label: "alkene",
    smarts: "[CX3]=[CX3]",
    atomIndicesInMatch: [0, 1],
    resonanceDistance: 1,
    resonanceScore: 1.1,
    shiftsByDistance: {
      1: -20,
    },
  },
  {
    label: "alkyne",
    smarts: "[CX2]#[CX2]",
    atomIndicesInMatch: [0, 1],
    resonanceDistance: 1,
    resonanceScore: 1.2,
    shiftsByDistance: {
      1: -18,
    },
  },
  {
    label: "cyclopropyl ring",
    smarts: "[C;r3]1[C;r3][C;r3]1",
    atomIndicesInMatch: [0, 1, 2],
    resonanceDistance: 1,
    resonanceScore: 1.2,
    shiftsByDistance: {
      1: -18,
    },
  },
];

function extractAtomMatches(matchesJson: string): number[][] {
  try {
    const parsed = JSON.parse(matchesJson);

    if (Array.isArray(parsed)) {
      return parsed
        .map((match) => {
          if (Array.isArray(match)) return match;
          if (Array.isArray(match.atoms)) return match.atoms;
          return [];
        })
        .filter((atoms) => atoms.length > 0);
    }

    if (parsed && Array.isArray(parsed.atoms)) {
      return [parsed.atoms];
    }

    return [];
  } catch {
    return [];
  }
}

function getPositionLabel(
  distance: number | null
): CarbocationStabilityResult["positionLabel"] {
  if (distance === null) return "none";
  if (distance === 1) return "alpha";
  if (distance === 2) return "beta";
  if (distance === 3) return "gamma";
  if (distance === 4) return "delta";
  return "epsilon+";
}

function getShortestBondDistance(
  parsedMol: ParsedMolBlock,
  atomA: number,
  atomB: number
): number | null {
  const visited = new Set<number>();
  const queue: Array<{ atomIndex: number; distance: number }> = [
    { atomIndex: atomA, distance: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (current.atomIndex === atomB) {
      return current.distance;
    }

    if (visited.has(current.atomIndex)) continue;
    visited.add(current.atomIndex);

    for (const [bondA, bondB] of parsedMol.bonds) {
      if (bondA === current.atomIndex && !visited.has(bondB)) {
        queue.push({ atomIndex: bondB, distance: current.distance + 1 });
      }

      if (bondB === current.atomIndex && !visited.has(bondA)) {
        queue.push({ atomIndex: bondA, distance: current.distance + 1 });
      }
    }
  }

  return null;
}

function getCarbocationAtomIndices(RDKit: any, mol: any): number[] {
  const query = RDKit.get_qmol("[#6+]");

  if (!query) return [];

  try {
    const matches = extractAtomMatches(mol.get_substruct_matches(query));

    return matches
      .map((match) => match[0])
      .filter((atomIndex) => typeof atomIndex === "number");
  } finally {
    query.delete?.();
  }
}

function getLocalizedExplanation(
  substitution: CarbocationSubstitution
): string {
  if (substitution === "tertiary") {
    return "This tertiary carbocation is stabilized by three alkyl groups through hyperconjugation and electron donation.";
  }

  if (substitution === "secondary") {
    return "This secondary carbocation is moderately stabilized by two alkyl groups through hyperconjugation and electron donation.";
  }

  if (substitution === "primary") {
    return "This primary carbocation has limited stabilization from one alkyl group.";
  }

  if (substitution === "methyl") {
    return "This methyl carbocation has no alkyl-group stabilization and is the least stable localized carbocation.";
  }

  return "No nearby resonance donor or reliable substitution pattern was detected for this carbocation.";
}

function getResonanceExplanation(stabilizerLabel: string): string {
  if (stabilizerLabel === "aromatic ring") {
    return "This benzylic carbocation is resonance-stabilized by the adjacent aromatic ring.";
  }

  if (stabilizerLabel === "alkene") {
    return "This allylic carbocation is resonance-stabilized by the adjacent alkene.";
  }

  if (stabilizerLabel === "alkyne") {
    return "This propargylic carbocation is resonance-stabilized by the adjacent alkyne.";
  }

  if (stabilizerLabel === "oxygen lone-pair donor") {
    return "An adjacent oxygen lone pair stabilizes this carbocation by resonance donation.";
  }

  if (
    stabilizerLabel === "amine nitrogen lone-pair donor" ||
    stabilizerLabel === "imine nitrogen lone-pair donor"
  ) {
    return "An adjacent nitrogen lone pair stabilizes this carbocation by resonance donation.";
  }

  if (stabilizerLabel === "sulfur lone-pair donor") {
    return "An adjacent sulfur lone pair stabilizes this carbocation by resonance donation.";
  }

  if (stabilizerLabel === "cyclopropyl ring") {
    return "The adjacent cyclopropyl ring stabilizes this carbocation through sigma delocalization.";
  }

  return "A nearby electron donor stabilizes this carbocation by charge delocalization.";
}

export async function analyzeCarbocationStability(
  smiles: string
): Promise<CarbocationStabilityResult[]> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) return [];

  try {
    const carbocationAtomIndices = getCarbocationAtomIndices(RDKit, mol);
    const parsedMol = parseMolBlock(mol.get_molblock());
    const results: CarbocationStabilityResult[] = [];

    for (const chargedAtomIndex of carbocationAtomIndices) {
      const substitution = getCarbocationSubstitutionFromMol(
        mol,
        chargedAtomIndex
      );

      let bestResult: CarbocationStabilityResult = {
        chargedAtomIndex,
        nearestStabilizer: null,
        distance: null,
        positionLabel: "none",
        resonanceStabilized: false,
        substitution,
        stabilityShift: 0,
        stabilityScore: getLocalizedStabilityScore(substitution),
        explanation: getLocalizedExplanation(substitution),
      };

      for (const stabilizer of STABILIZER_RULES) {
        const query = RDKit.get_qmol(stabilizer.smarts);
        if (!query) continue;

        try {
          const matches = extractAtomMatches(mol.get_substruct_matches(query));

          for (const match of matches) {
            if (match.includes(chargedAtomIndex)) continue;

            for (const atomIndexInMatch of stabilizer.atomIndicesInMatch) {
              const stabilizerAtomIndex = match[atomIndexInMatch];

              if (typeof stabilizerAtomIndex !== "number") continue;

              const distance = getShortestBondDistance(
                parsedMol,
                chargedAtomIndex,
                stabilizerAtomIndex
              );

              if (distance === null) continue;
              if (distance > stabilizer.resonanceDistance) continue;

              const stabilityShift = stabilizer.shiftsByDistance[distance] ?? 0;
              if (stabilityShift === 0) continue;

              const stabilityScore =
                stabilizer.resonanceScore +
                getResonanceSubstitutionAdjustment(substitution);

              const isBetter =
                stabilityScore < bestResult.stabilityScore ||
                (stabilityScore === bestResult.stabilityScore &&
                  stabilityShift < bestResult.stabilityShift) ||
                (stabilityScore === bestResult.stabilityScore &&
                  stabilityShift === bestResult.stabilityShift &&
                  (bestResult.distance === null || distance < bestResult.distance));

              if (!isBetter) continue;

              bestResult = {
                chargedAtomIndex,
                nearestStabilizer: stabilizer.label,
                distance,
                positionLabel: getPositionLabel(distance),
                resonanceStabilized: true,
                substitution,
                stabilityShift,
                stabilityScore,
                explanation: getResonanceExplanation(stabilizer.label),
              };
            }
          }
        } finally {
          query.delete?.();
        }
      }

      results.push(bestResult);
    }

    return results;
  } finally {
    mol.delete?.();
  }
}

export function getBestCarbocationStabilityResult(
  results: CarbocationStabilityResult[]
): CarbocationStabilityResult | null {
  if (results.length === 0) return null;

  return [...results].sort((a, b) => {
    if (a.stabilityScore !== b.stabilityScore) {
      return a.stabilityScore - b.stabilityScore;
    }

    if (a.stabilityShift !== b.stabilityShift) {
      return a.stabilityShift - b.stabilityShift;
    }

    if (a.distance === null && b.distance === null) return 0;
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;

    return a.distance - b.distance;
  })[0];
}