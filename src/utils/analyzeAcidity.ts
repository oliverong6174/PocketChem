//ADD POTENTIAL DISCLAIMER: pKa values are approximate MCAT-level estimates. Substituents, solvent, and resonance effects can shift actual values.

import {
  getRDKit,
  type FunctionalGroupResult,
} from "./analyzeSmiles";

export type AcidityResult = {
  relatedGroup: string;
  acidicSite: string;
  estimatedPka: string;
  estimatedPkaNumber: number;
  basePkaNumber: number;
  strengthRank: number;
  atom: string;
  resonance: string;
  induction: string;
  orbital: string;
  modifiers: string[];
  explanation: string;
};

type AcidityRule = {
  groupName: string;
  acidicSite: string;
  estimatedPka: string;
  estimatedPkaNumber: number;
  strengthRank: number;
  atom: string;
  resonance: string;
  induction: string;
  orbital: string;
  explanation: string;
};

const ACIDITY_RULES: AcidityRule[] = [
  {
    groupName: "Sulfonic acid",
    acidicSite: "sulfonic acid O-H proton",
    estimatedPka: "~ -1 to 1",
    estimatedPkaNumber: 0,
    strengthRank: 1,
    atom:
      "The acidic proton is attached to oxygen. The conjugate base places negative charge on oxygen atoms.",
    resonance:
      "Very strong resonance stabilization across multiple oxygen atoms.",
    induction:
      "The sulfur-oxygen bonds strongly withdraw electron density.",
    orbital:
      "The negative charge is distributed through the sulfonate system rather than staying localized.",
    explanation:
      "Sulfonic acids are very strong organic acids because the conjugate base is highly stabilized by resonance and induction.",
  },
  {
    groupName: "Arenesulfonic acid",
    acidicSite: "arenesulfonic acid O-H proton",
    estimatedPka: "~ -1 to 1",
    estimatedPkaNumber: 0,
    strengthRank: 1,
    atom:
      "The acidic proton is attached to oxygen. The conjugate base places negative charge on oxygen atoms.",
    resonance:
      "Very strong resonance stabilization across multiple oxygen atoms.",
    induction:
      "The sulfonyl group is strongly electron-withdrawing.",
    orbital:
      "The negative charge is distributed through the sulfonate system.",
    explanation:
      "Arenesulfonic acids are very strong acids because the sulfonate conjugate base is highly stabilized.",
  },
  {
    groupName: "Carboxylic acid",
    acidicSite: "carboxylic acid O-H proton",
    estimatedPka: "~4–5",
    estimatedPkaNumber: 4.8,
    strengthRank: 2,
    atom:
      "The acidic proton is attached to oxygen, and the conjugate base has negative charge on oxygen.",
    resonance:
      "Strong resonance stabilization between the two oxygens of the carboxylate.",
    induction:
      "The nearby carbonyl oxygen withdraws electron density and helps stabilize the conjugate base.",
    orbital:
      "The conjugate base uses p-orbital overlap with the carbonyl system.",
    explanation:
      "Carboxylic acids are much more acidic than alcohols because the carboxylate conjugate base is resonance-stabilized.",
  },
  {
    groupName: "Benzoic acid derivative",
    acidicSite: "benzoic acid O-H proton",
    estimatedPka: "~4–5",
    estimatedPkaNumber: 4.2,
    strengthRank: 2,
    atom:
      "The acidic proton is attached to oxygen, and the conjugate base has negative charge on oxygen.",
    resonance:
      "The carboxylate conjugate base is resonance-stabilized across two oxygens.",
    induction:
      "The aromatic ring can slightly influence acidity depending on substituents.",
    orbital:
      "The carboxylate system uses p-orbital overlap for resonance stabilization.",
    explanation:
      "Benzoic acid derivatives are acidic because the carboxylate conjugate base is resonance-stabilized.",
  },
  {
    groupName: "Phenol",
    acidicSite: "phenolic O-H proton",
    estimatedPka: "~10",
    estimatedPkaNumber: 10,
    strengthRank: 3,
    atom:
      "The acidic proton is attached to oxygen, and the conjugate base has negative charge on oxygen.",
    resonance:
      "The phenoxide conjugate base can delocalize electron density into the aromatic ring.",
    induction:
      "Electron-withdrawing substituents on the ring can increase acidity; electron-donating groups can decrease acidity.",
    orbital:
      "The oxygen lone pair can overlap with the aromatic π system.",
    explanation:
      "Phenols are more acidic than ordinary alcohols because their conjugate base is resonance-stabilized.",
  },
  {
    groupName: "Thiol",
    acidicSite: "thiol S-H proton",
    estimatedPka: "~10",
    estimatedPkaNumber: 10.5,
    strengthRank: 4,
    atom:
      "The acidic proton is attached to sulfur. Sulfur is larger and more polarizable than oxygen.",
    resonance:
      "Simple thiols usually do not gain major resonance stabilization after deprotonation.",
    induction:
      "Nearby electron-withdrawing groups can increase thiol acidity.",
    orbital:
      "The larger sulfur atom can better stabilize negative charge than oxygen in some cases.",
    explanation:
      "Thiols are usually more acidic than alcohols because the thiolate conjugate base is stabilized by sulfur's size and polarizability.",
  },
  {
    groupName: "Alcohol",
    acidicSite: "alcohol O-H proton",
    estimatedPka: "~16–18",
    estimatedPkaNumber: 17,
    strengthRank: 5,
    atom:
      "The acidic proton is attached to oxygen, and the conjugate base has negative charge on oxygen.",
    resonance:
      "Simple alcohols have little to no resonance stabilization after deprotonation.",
    induction:
      "Nearby electron-withdrawing groups can make an alcohol more acidic, but simple alcohols are weak acids.",
    orbital:
      "The negative charge is mostly localized on oxygen.",
    explanation:
      "Alcohols are weak acids because the alkoxide conjugate base is not strongly resonance-stabilized.",
  },
  {
    groupName: "Alkyne",
    acidicSite: "terminal alkyne C-H proton if present",
    estimatedPka: "~25",
    estimatedPkaNumber: 25,
    strengthRank: 6,
    atom:
      "The acidic proton is attached to carbon, which is less electronegative than oxygen or sulfur.",
    resonance:
      "Terminal alkynes usually do not gain resonance stabilization after deprotonation.",
    induction:
      "Nearby electron-withdrawing groups can increase acidity.",
    orbital:
      "The conjugate base places negative charge in an sp orbital, which has more s-character and holds electrons closer to the nucleus.",
    explanation:
      "Terminal alkynes are more acidic than alkenes or alkanes because the conjugate base has negative charge in an sp orbital.",
  },
  {
    groupName: "Amine",
    acidicSite: "amine N-H proton if present",
    estimatedPka: "~35–40",
    estimatedPkaNumber: 38,
    strengthRank: 7,
    atom:
      "The acidic proton is attached to nitrogen. Nitrogen can hold negative charge better than carbon but worse than oxygen.",
    resonance:
      "Simple amines usually do not gain useful resonance stabilization after losing N-H.",
    induction:
      "Nearby electron-withdrawing groups can increase acidity slightly.",
    orbital:
      "The negative charge is mostly localized on nitrogen.",
    explanation:
      "Neutral amines are much more important as bases than as acids. Their N-H protons are weakly acidic.",
  },
];

type InductiveModifier = {
  label: string;
  pkaShift: number;
  distance: number;
  explanation: string;
};

type ParsedMolGraph = {
  adjacency: Map<number, number[]>;
};

function parseMolBlockGraph(molBlock: string): ParsedMolGraph {
  const lines = molBlock.split(/\r?\n/);

  const countsLine = lines[3];
  if (!countsLine) {
    return { adjacency: new Map() };
  }

  const atomCount = Number.parseInt(countsLine.slice(0, 3).trim(), 10);
  const bondCount = Number.parseInt(countsLine.slice(3, 6).trim(), 10);

  const adjacency = new Map<number, number[]>();

  for (let i = 0; i < atomCount; i++) {
    adjacency.set(i, []);
  }

  const bondStart = 4 + atomCount;

  for (let i = 0; i < bondCount; i++) {
    const line = lines[bondStart + i];
    if (!line) continue;

    const atomA = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const atomB = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;

    if (Number.isNaN(atomA) || Number.isNaN(atomB)) continue;

    adjacency.get(atomA)?.push(atomB);
    adjacency.get(atomB)?.push(atomA);
  }

  return { adjacency };
}

function getShortestBondDistance(
  adjacency: Map<number, number[]>,
  start: number,
  target: number
): number | null {
  const visited = new Set<number>();
  const queue: Array<{ atom: number; distance: number }> = [
    { atom: start, distance: 0 },
  ];

  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (current.atom === target) {
      return current.distance;
    }

    const neighbors = adjacency.get(current.atom) ?? [];

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;

      visited.add(neighbor);
      queue.push({
        atom: neighbor,
        distance: current.distance + 1,
      });
    }
  }

  return null;
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

function distanceMultiplier(distance: number): number {
  // For a carboxylic acid carbon:
  // distance 2 = alpha substituent, distance 3 = beta, distance 4 = gamma
  if (distance === 2) return 1.0;
  if (distance === 3) return 0.4;
  if (distance === 4) return 0.15;
  return 0;
}

function describePosition(distance: number): string {
  if (distance === 2) return "alpha";
  if (distance === 3) return "beta";
  if (distance === 4) return "gamma";
  return "distant";
}

async function getInductiveModifiersForCarboxylicAcid(
  smiles: string
): Promise<InductiveModifier[]> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) return [];

  const molBlock = mol.get_molblock();
  const { adjacency } = parseMolBlockGraph(molBlock);

  const acidQuery = RDKit.get_qmol("[CX3](=[OX1])[OX2H1]");
  const acidMatches = extractAtomMatches(mol.get_substruct_matches(acidQuery));

  const substituentQueries = [
    {
      label: "fluorine",
      smarts: "[F]",
      baseShift: -2.3,
    },
    {
      label: "chlorine",
      smarts: "[Cl]",
      baseShift: -1.4,
    },
    {
      label: "bromine",
      smarts: "[Br]",
      baseShift: -1.0,
    },
    {
      label: "iodine",
      smarts: "[I]",
      baseShift: -0.6,
    },
    {
      label: "nitro group",
      smarts: "[NX3+](=O)[O-]",
      baseShift: -2.0,
    },
    {
      label: "cyano group",
      smarts: "[CX2]#N",
      baseShift: -1.6,
    },
  ];

  const rawModifiers: InductiveModifier[] = [];

  for (const acidMatch of acidMatches) {
    const acidCarbonIndex = acidMatch[0];

    for (const substituent of substituentQueries) {
      const query = RDKit.get_qmol(substituent.smarts);
      const matches = extractAtomMatches(mol.get_substruct_matches(query));

      for (const match of matches) {
        const substituentAnchorIndex = match[0];

        const distance = getShortestBondDistance(
          adjacency,
          acidCarbonIndex,
          substituentAnchorIndex
        );

        if (distance === null) continue;

        const multiplier = distanceMultiplier(distance);
        if (multiplier === 0) continue;

        const position = describePosition(distance);
        const pkaShift = substituent.baseShift * multiplier;

        rawModifiers.push({
          label: `${position} ${substituent.label}`,
          pkaShift,
          distance,
          explanation: `${substituent.label} is ${position} to the carboxylic acid, so its inductive electron-withdrawing effect stabilizes the carboxylate conjugate base and lowers pKa.`,
        });
      }

      query.delete();
    }
  }

  acidQuery.delete();
  mol.delete();

  // Strongest effects first
  rawModifiers.sort((a, b) => Math.abs(b.pkaShift) - Math.abs(a.pkaShift));

  // Diminishing returns: the first EWG matters most, additional EWGs stack but not perfectly linearly.
  return rawModifiers.map((modifier, index) => ({
    ...modifier,
    pkaShift: modifier.pkaShift * Math.pow(0.7, index),
  }));
}

export async function analyzeAcidity(
  smiles: string,
  functionalGroups: FunctionalGroupResult[]
): Promise<AcidityResult[]> {
  const results: AcidityResult[] = [];

  for (const group of functionalGroups) {
    const rule = ACIDITY_RULES.find((rule) => rule.groupName === group.name);

    if (!rule) continue;

    const inductiveModifiers =
      group.name === "Carboxylic acid" ||
      group.name === "Benzoic acid derivative"
        ? await getInductiveModifiersForCarboxylicAcid(smiles)
        : [];

    const totalPkaShift = inductiveModifiers.reduce(
      (sum, modifier) => sum + modifier.pkaShift,
      0
    );

    const adjustedPkaNumber = rule.estimatedPkaNumber + totalPkaShift;

    results.push({
      relatedGroup: rule.groupName,
      acidicSite: rule.acidicSite,
      estimatedPka:
        inductiveModifiers.length > 0
          ? `~${adjustedPkaNumber.toFixed(1)}`
          : rule.estimatedPka,
      estimatedPkaNumber: adjustedPkaNumber,
      basePkaNumber: rule.estimatedPkaNumber,
      strengthRank: rule.strengthRank,
      atom: rule.atom,
      resonance: rule.resonance,
      induction:
        inductiveModifiers.length > 0
          ? inductiveModifiers
              .map((modifier) => modifier.explanation)
              .join(" ")
          : rule.induction,
      orbital: rule.orbital,
      modifiers: inductiveModifiers.map((modifier) => modifier.explanation),
      explanation:
        inductiveModifiers.length > 0
          ? `${rule.explanation} ${inductiveModifiers
              .map((modifier) => modifier.explanation)
              .join(" ")}`
          : rule.explanation,
    });
  }

  return results.sort((a, b) => a.estimatedPkaNumber - b.estimatedPkaNumber);
}