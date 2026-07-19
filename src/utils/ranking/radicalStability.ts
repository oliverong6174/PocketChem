import { getRDKit } from "../rdkit";

export type CarbonRadicalSubstitution =
  | "methyl"
  | "primary"
  | "secondary"
  | "tertiary"
  | "unknown";

export type CarbonRadicalCenterType =
  | "alpha-heteroatom"
  | "benzylic"
  | "allylic"
  | "propargylic"
  | "alpha-carbonyl"
  | "alpha-nitrile"
  | "alkyl"
  | "vinylic"
  | "aryl"
  | "alkynyl"
  | "unknown";

export type CarbonRadicalStabilityResult = {
  radicalAtomIndex: number;
  nearestStabilizer: string | null;
  distance: number | null;
  positionLabel: "alpha" | "beta" | "gamma" | "delta" | "epsilon+" | "none";
  resonanceStabilized: boolean;
  substitution: CarbonRadicalSubstitution;
  centerType: CarbonRadicalCenterType;
  stabilizerCount: number;
  stabilityShift: number;
  stabilityScore: number;
  explanation: string;
};

type ParsedMolBlock = {
  atoms: string[];
  bonds: Array<{
    atomA: number;
    atomB: number;
    order: number;
  }>;
};

type RadicalFeatureRule = {
  centerType: Exclude<
    CarbonRadicalCenterType,
    "alkyl" | "vinylic" | "aryl" | "alkynyl" | "unknown"
  >;
  label: string;
  smarts: string;
  radicalAtomIndexInMatch: number;
  stabilizerAtomIndexInMatch: number;
  resonanceStabilized: boolean;
  baseScore: number;
  stabilityShift: number;
  explanation: string;
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

  const bonds = bondLines
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      const atomA = Number.parseInt(parts[0], 10) - 1;
      const atomB = Number.parseInt(parts[1], 10) - 1;
      const order = Number.parseInt(parts[2], 10);

      if (
        !Number.isFinite(atomA) ||
        !Number.isFinite(atomB) ||
        !Number.isFinite(order)
      ) {
        return null;
      }

      return { atomA, atomB, order };
    })
    .filter(
      (
        bond
      ): bond is {
        atomA: number;
        atomB: number;
        order: number;
      } => bond !== null
    );

  return { atoms, bonds };
}

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

function getCarbonNeighborCount(
  parsedMol: ParsedMolBlock,
  atomIndex: number
): number {
  return parsedMol.bonds.reduce((count, bond) => {
    if (bond.atomA !== atomIndex && bond.atomB !== atomIndex) {
      return count;
    }

    const neighborIndex =
      bond.atomA === atomIndex ? bond.atomB : bond.atomA;

    return parsedMol.atoms[neighborIndex] === "C" ? count + 1 : count;
  }, 0);
}

function getCarbonRadicalSubstitution(
  parsedMol: ParsedMolBlock,
  radicalAtomIndex: number
): CarbonRadicalSubstitution {
  const carbonNeighborCount = getCarbonNeighborCount(
    parsedMol,
    radicalAtomIndex
  );

  if (carbonNeighborCount === 0) return "methyl";
  if (carbonNeighborCount === 1) return "primary";
  if (carbonNeighborCount === 2) return "secondary";
  if (carbonNeighborCount >= 3) return "tertiary";

  return "unknown";
}

function getSubstitutionScore(
  substitution: CarbonRadicalSubstitution
): number {
  if (substitution === "tertiary") return 2;
  if (substitution === "secondary") return 3;
  if (substitution === "primary") return 4;
  if (substitution === "methyl") return 5;

  return 6;
}

function getResonanceSubstitutionAdjustment(
  substitution: CarbonRadicalSubstitution
): number {
  if (substitution === "tertiary") return 0;
  if (substitution === "secondary") return 0.08;
  if (substitution === "primary") return 0.16;
  if (substitution === "methyl") return 0.24;

  return 0.32;
}

function getPositionLabel(
  distance: number | null
): CarbonRadicalStabilityResult["positionLabel"] {
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

    for (const bond of parsedMol.bonds) {
      if (
        bond.atomA === current.atomIndex &&
        !visited.has(bond.atomB)
      ) {
        queue.push({
          atomIndex: bond.atomB,
          distance: current.distance + 1,
        });
      }

      if (
        bond.atomB === current.atomIndex &&
        !visited.has(bond.atomA)
      ) {
        queue.push({
          atomIndex: bond.atomA,
          distance: current.distance + 1,
        });
      }
    }
  }

  return null;
}

const RADICAL_FEATURE_RULES: RadicalFeatureRule[] = [
  {
    centerType: "alpha-heteroatom",
    label: "adjacent heteroatom lone-pair donor",
    smarts: "[#6;v3;+0]-[O,N,S;X2,X3;+0]",
    radicalAtomIndexInMatch: 0,
    stabilizerAtomIndexInMatch: 1,
    resonanceStabilized: true,
    baseScore: 0.75,
    stabilityShift: -28,
    explanation:
      "An adjacent oxygen, nitrogen, or sulfur lone pair stabilizes this carbon radical by electron donation.",
  },
  {
    centerType: "benzylic",
    label: "aromatic ring",
    smarts: "[#6;v3;+0]-[c]",
    radicalAtomIndexInMatch: 0,
    stabilizerAtomIndexInMatch: 1,
    resonanceStabilized: true,
    baseScore: 0.9,
    stabilityShift: -26,
    explanation:
      "This benzylic radical is stabilized by delocalization into the adjacent aromatic ring.",
  },
  {
    centerType: "allylic",
    label: "alkene",
    smarts: "[#6;v3;+0]-[CX3]=[CX3]",
    radicalAtomIndexInMatch: 0,
    stabilizerAtomIndexInMatch: 1,
    resonanceStabilized: true,
    baseScore: 1,
    stabilityShift: -24,
    explanation:
      "This allylic radical is stabilized by resonance with the adjacent alkene.",
  },
  {
    centerType: "propargylic",
    label: "alkyne",
    smarts: "[#6;v3;+0]-[CX2]#[CX2]",
    radicalAtomIndexInMatch: 0,
    stabilizerAtomIndexInMatch: 1,
    resonanceStabilized: true,
    baseScore: 1.1,
    stabilityShift: -22,
    explanation:
      "This propargylic radical is stabilized by delocalization next to the alkyne.",
  },
  {
    centerType: "alpha-carbonyl",
    label: "carbonyl",
    smarts: "[#6;v3;+0]-[CX3](=[OX1])",
    radicalAtomIndexInMatch: 0,
    stabilizerAtomIndexInMatch: 1,
    resonanceStabilized: true,
    baseScore: 1.2,
    stabilityShift: -20,
    explanation:
      "This alpha-carbonyl radical is stabilized by conjugation with the nearby carbonyl group.",
  },
  {
    centerType: "alpha-nitrile",
    label: "nitrile",
    smarts: "[#6;v3;+0]-[CX2]#N",
    radicalAtomIndexInMatch: 0,
    stabilizerAtomIndexInMatch: 1,
    resonanceStabilized: true,
    baseScore: 1.3,
    stabilityShift: -18,
    explanation:
      "This alpha-cyano radical is stabilized by delocalization toward the nearby nitrile group.",
  },
];

function getCarbonRadicalAtomIndices(RDKit: any, mol: any): number[] {
  const query = RDKit.get_qmol("[#6;v3;+0]");

  if (!query) return [];

  try {
    const matches = extractAtomMatches(
      mol.get_substruct_matches(query)
    );

    return [...new Set(
      matches
        .map((match) => match[0])
        .filter((atomIndex) => typeof atomIndex === "number")
    )];
  } finally {
    query.delete?.();
  }
}

function atomMatchesSmarts(
  RDKit: any,
  mol: any,
  smarts: string,
  radicalAtomIndex: number,
  radicalAtomIndexInMatch: number
): number[][] {
  const query = RDKit.get_qmol(smarts);

  if (!query) return [];

  try {
    return extractAtomMatches(
      mol.get_substruct_matches(query)
    ).filter(
      (match) => match[radicalAtomIndexInMatch] === radicalAtomIndex
    );
  } finally {
    query.delete?.();
  }
}

function getLocalizedCenterType(
  RDKit: any,
  mol: any,
  radicalAtomIndex: number
): CarbonRadicalCenterType {
  const localizedRules: Array<{
    type: CarbonRadicalCenterType;
    smarts: string;
  }> = [
    {
      type: "aryl",
      smarts: "[c;v3;+0]",
    },
    {
      type: "vinylic",
      smarts: "[#6;v3;+0;$([#6]=[#6])]",
    },
    {
      type: "alkynyl",
      smarts: "[#6;v3;+0;$([#6]#[#6])]",
    },
  ];

  for (const rule of localizedRules) {
    const matches = atomMatchesSmarts(
      RDKit,
      mol,
      rule.smarts,
      radicalAtomIndex,
      0
    );

    if (matches.length > 0) {
      return rule.type;
    }
  }

  return "alkyl";
}

function getLocalizedResult(
  substitution: CarbonRadicalSubstitution,
  centerType: CarbonRadicalCenterType
): Pick<
  CarbonRadicalStabilityResult,
  "stabilityScore" | "stabilityShift" | "explanation"
> {
  if (centerType === "aryl") {
    return {
      stabilityScore: 6.2,
      stabilityShift: 8,
      explanation:
        "This aryl radical is relatively unstable because the unpaired electron is located on an sp2 aromatic carbon.",
    };
  }

  if (centerType === "vinylic") {
    return {
      stabilityScore: 6,
      stabilityShift: 7,
      explanation:
        "This vinylic radical is relatively unstable because the unpaired electron is located on an sp2 carbon.",
    };
  }

  if (centerType === "alkynyl") {
    return {
      stabilityScore: 6.5,
      stabilityShift: 10,
      explanation:
        "This alkynyl radical is strongly destabilized because the unpaired electron is located on an sp carbon with high s-character.",
    };
  }

  if (substitution === "tertiary") {
    return {
      stabilityScore: getSubstitutionScore(substitution),
      stabilityShift: -12,
      explanation:
        "This tertiary alkyl radical is stabilized by three alkyl groups through hyperconjugation.",
    };
  }

  if (substitution === "secondary") {
    return {
      stabilityScore: getSubstitutionScore(substitution),
      stabilityShift: -8,
      explanation:
        "This secondary alkyl radical is moderately stabilized by two alkyl groups through hyperconjugation.",
    };
  }

  if (substitution === "primary") {
    return {
      stabilityScore: getSubstitutionScore(substitution),
      stabilityShift: -4,
      explanation:
        "This primary alkyl radical has limited stabilization from one alkyl group.",
    };
  }

  if (substitution === "methyl") {
    return {
      stabilityScore: getSubstitutionScore(substitution),
      stabilityShift: 0,
      explanation:
        "This methyl radical has no alkyl substituents available for hyperconjugative stabilization.",
    };
  }

  return {
    stabilityScore: 7,
    stabilityShift: 0,
    explanation:
      "No reliable resonance or substitution-based stabilization pattern was detected for this carbon radical.",
  };
}

export async function analyzeCarbonRadicalStability(
  smiles: string
): Promise<CarbonRadicalStabilityResult[]> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) return [];

  try {
    const parsedMol = parseMolBlock(mol.get_molblock());
    const radicalAtomIndices = getCarbonRadicalAtomIndices(
      RDKit,
      mol
    );
    const results: CarbonRadicalStabilityResult[] = [];

    for (const radicalAtomIndex of radicalAtomIndices) {
      const substitution = getCarbonRadicalSubstitution(
        parsedMol,
        radicalAtomIndex
      );
      const localizedCenterType = getLocalizedCenterType(
        RDKit,
        mol,
        radicalAtomIndex
      );
      const localized = getLocalizedResult(
        substitution,
        localizedCenterType
      );

      let bestResult: CarbonRadicalStabilityResult = {
        radicalAtomIndex,
        nearestStabilizer: null,
        distance: null,
        positionLabel: "none",
        resonanceStabilized: false,
        substitution,
        centerType: localizedCenterType,
        stabilizerCount: 0,
        stabilityShift: localized.stabilityShift,
        stabilityScore: localized.stabilityScore,
        explanation: localized.explanation,
      };

      for (const rule of RADICAL_FEATURE_RULES) {
        const matches = atomMatchesSmarts(
          RDKit,
          mol,
          rule.smarts,
          radicalAtomIndex,
          rule.radicalAtomIndexInMatch
        );

        if (matches.length === 0) continue;

        const stabilizerAtomIndices = [
          ...new Set(
            matches
              .map(
                (match) =>
                  match[rule.stabilizerAtomIndexInMatch]
              )
              .filter(
                (atomIndex) => typeof atomIndex === "number"
              )
          ),
        ];

        const distances = stabilizerAtomIndices
          .map((stabilizerAtomIndex) =>
            getShortestBondDistance(
              parsedMol,
              radicalAtomIndex,
              stabilizerAtomIndex
            )
          )
          .filter((distance): distance is number => distance !== null);

        if (distances.length === 0) continue;

        const distance = Math.min(...distances);
        const stabilizerCount = stabilizerAtomIndices.length;
        const multipleStabilizerBonus = Math.min(
          Math.max(stabilizerCount - 1, 0) * 0.12,
          0.36
        );
        const stabilityScore = Math.max(
          0.1,
          rule.baseScore +
            getResonanceSubstitutionAdjustment(substitution) -
            multipleStabilizerBonus
        );
        const stabilityShift =
          rule.stabilityShift -
          Math.max(stabilizerCount - 1, 0) * 2;

        const isBetter =
          stabilityScore < bestResult.stabilityScore ||
          (stabilityScore === bestResult.stabilityScore &&
            stabilityShift < bestResult.stabilityShift) ||
          (stabilityScore === bestResult.stabilityScore &&
            stabilityShift === bestResult.stabilityShift &&
            (bestResult.distance === null ||
              distance < bestResult.distance));

        if (!isBetter) continue;

        bestResult = {
          radicalAtomIndex,
          nearestStabilizer: rule.label,
          distance,
          positionLabel: getPositionLabel(distance),
          resonanceStabilized: rule.resonanceStabilized,
          substitution,
          centerType: rule.centerType,
          stabilizerCount,
          stabilityShift,
          stabilityScore,
          explanation:
            stabilizerCount > 1
              ? `${rule.explanation.replace(/\.$/, "")} with additional delocalization from ${stabilizerCount} adjacent stabilizing groups.`
              : rule.explanation,
        };
      }

      results.push(bestResult);
    }

    return results;
  } finally {
    mol.delete?.();
  }
}

export function getBestCarbonRadicalStabilityResult(
  results: CarbonRadicalStabilityResult[]
): CarbonRadicalStabilityResult | null {
  if (results.length === 0) return null;

  return [...results].sort((a, b) => {
    if (a.stabilityScore !== b.stabilityScore) {
      return a.stabilityScore - b.stabilityScore;
    }

    if (a.stabilityShift !== b.stabilityShift) {
      return a.stabilityShift - b.stabilityShift;
    }

    if (a.stabilizerCount !== b.stabilizerCount) {
      return b.stabilizerCount - a.stabilizerCount;
    }

    if (a.distance === null && b.distance === null) return 0;
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;

    return a.distance - b.distance;
  })[0];
}