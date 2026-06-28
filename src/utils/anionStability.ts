import { getRDKit } from "./analyzeGroups";


export type CarbanionSubstitution =
  | "methyl"
  | "primary"
  | "secondary"
  | "tertiary"
  | "unknown";

export type CarbanionStabilityResult = {
  chargedAtomIndex: number;
  nearestStabilizer: string | null;
  distance: number | null;
  positionLabel: "alpha" | "beta" | "gamma" | "delta" | "epsilon+" | "none";
  resonanceStabilized: boolean;
  substitution: CarbanionSubstitution;
  pkaShift: number;
  stabilityScore: number;
  explanation: string;
};




type StabilizerRule = {
  label: string;
  smarts: string;
  atomIndexInMatch: number;
  resonanceDistance: number;
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

function getCarbanionSubstitutionFromMol(
  mol: any,
  chargedAtomIndex: number
): CarbanionSubstitution {
  try {
    const molblock = mol.get_molblock();
    const parsedMol = parseMolBlock(molblock);
    const carbonNeighborCount = getCarbonNeighborCount(parsedMol, chargedAtomIndex);

    if (carbonNeighborCount === 0) return "methyl";
    if (carbonNeighborCount === 1) return "primary";
    if (carbonNeighborCount === 2) return "secondary";
    if (carbonNeighborCount >= 3) return "tertiary";

    return "unknown";
  } catch (error) {
    console.log("Carbanion substitution detection failed:", error);
    return "unknown";
  }
}

const STABILIZER_RULES: StabilizerRule[] = [
  {
    label: "carbonyl",
    smarts: "[CX3]=[OX1]",
    atomIndexInMatch: 0,
    resonanceDistance: 1,
    shiftsByDistance: {
      1: -28,
      2: -10,
      3: -5,
      4: -2,
    },
  },
  {
    label: "nitrile",
    smarts: "[CX2]#N",
    atomIndexInMatch: 0,
    resonanceDistance: 1,
    shiftsByDistance: {
      1: -25,
      2: -8,
      3: -4,
      4: -2,
    },
  },
  {
    label: "nitro",
    smarts: "[NX3+](=O)[O-]",
    atomIndexInMatch: 0,
    resonanceDistance: 1,
    shiftsByDistance: {
      1: -30,
      2: -10,
      3: -5,
      4: -2,
    },
  },
  {
    label: "aromatic ring",
    smarts: "[c]",
    atomIndexInMatch: 0,
    resonanceDistance: 1,
    shiftsByDistance: {
      1: -12,
      2: -4,
      3: -2,
    },
  },
  {
    label: "alkene",
    smarts: "[CX3]=[CX3]",
    atomIndexInMatch: 0,
    resonanceDistance: 1,
    shiftsByDistance: {
      1: -8,
      2: -3,
      3: -1,
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
): CarbanionStabilityResult["positionLabel"] {
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

async function getCarbanionAtomIndices(smiles: string): Promise<number[]> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) return [];

  const query = RDKit.get_qmol("[#6-]");
  const matches = extractAtomMatches(mol.get_substruct_matches(query));

  return matches
    .map((match) => match[0])
    .filter((atomIndex) => typeof atomIndex === "number");
}

export async function analyzeCarbanionStability(
  smiles: string
): Promise<CarbanionStabilityResult[]> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) return [];

  const carbanionAtomIndices = await getCarbanionAtomIndices(smiles);
  const results: CarbanionStabilityResult[] = [];
  const parsedMol = parseMolBlock(mol.get_molblock());

  for (const chargedAtomIndex of carbanionAtomIndices) {
    const substitution = getCarbanionSubstitutionFromMol(mol, chargedAtomIndex);    
    console.log("CARBANION SUBSTITUTION DEBUG:", {
        smiles,
        chargedAtomIndex,
        substitution,
        });

    let bestResult: CarbanionStabilityResult = {
      chargedAtomIndex,
      nearestStabilizer: null,
      distance: null,
      positionLabel: "none",
      resonanceStabilized: false,
      substitution,
      pkaShift: 0,
      stabilityScore:
        substitution === "methyl"
          ? 2
          : substitution === "primary"
          ? 3
          : substitution === "secondary"
          ? 4
          : substitution === "tertiary"
          ? 5
          : 6,
      explanation:
        substitution === "tertiary"
          ? "This is a localized tertiary carbanion. More alkyl substitution destabilizes an already electron-rich carbanion by electron donation."
          : substitution === "secondary"
          ? "This is a localized secondary carbanion. It is less stable than a primary carbanion because alkyl groups donate electron density toward the negatively charged carbon."
          : substitution === "primary"
          ? "This is a localized primary carbanion. It is more stable than secondary or tertiary localized carbanions because it has fewer electron-donating alkyl groups attached to the negatively charged carbon."
          : substitution === "methyl"
          ? "This is a localized methyl carbanion. It is very unstable, but it is less destabilized by alkyl donation than primary, secondary, or tertiary carbanions."
          : "No nearby resonance or strong electron-withdrawing stabilizer was detected for this carbanion.",
    };

    for (const stabilizer of STABILIZER_RULES) {
      const query = RDKit.get_qmol(stabilizer.smarts);
      const matches = extractAtomMatches(mol.get_substruct_matches(query));

      for (const match of matches) {
        const stabilizerAtomIndex = match[stabilizer.atomIndexInMatch];

        if (typeof stabilizerAtomIndex !== "number") continue;
        if (stabilizerAtomIndex === chargedAtomIndex) continue;

        const distance = getShortestBondDistance(
            parsedMol,
            chargedAtomIndex,
            stabilizerAtomIndex
            );

        if (distance === null) continue;

        const pkaShift =
          stabilizer.shiftsByDistance[distance] ??
          stabilizer.shiftsByDistance[4] ??
          0;

        if (pkaShift === 0) continue;

        const positionLabel = getPositionLabel(distance);

            const resonanceStabilized =
                 stabilizer.label === "carbonyl" && distance === 1;

            const positionScore =
            resonanceStabilized
                ? 1
                : substitution === "methyl"
                ? 2
                : substitution === "primary"
                ? 3
                : substitution === "secondary"
                ? 4
                : substitution === "tertiary"
                ? 5
                : 6;

        const isBetter =
          positionScore < bestResult.stabilityScore ||
          pkaShift < bestResult.pkaShift ||
          (bestResult.distance !== null && distance < bestResult.distance);

        if (!isBetter) continue;

        bestResult = {
          chargedAtomIndex,
          nearestStabilizer: stabilizer.label,
          distance,
          positionLabel,
          resonanceStabilized,
          substitution,
          pkaShift,
          stabilityScore: positionScore,
          explanation: resonanceStabilized
            ? `This carbanion is alpha to a ${stabilizer.label}, so the negative charge can be resonance-stabilized. Resonance stabilization overrides substitution effects in this ranking.`
            : bestResult.explanation,
        };
      }
    }

    results.push(bestResult);
  }

  return results;
}

export function getBestCarbanionStabilityResult(
  results: CarbanionStabilityResult[]
): CarbanionStabilityResult | null {
  if (results.length === 0) return null;

  return [...results].sort((a, b) => {
    if (a.stabilityScore !== b.stabilityScore) {
      return a.stabilityScore - b.stabilityScore;
    }

    if (a.pkaShift !== b.pkaShift) {
      return a.pkaShift - b.pkaShift;
    }

    if (a.distance === null && b.distance === null) return 0;
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;

    return a.distance - b.distance;
  })[0];
}

