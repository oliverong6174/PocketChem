import { getRDKit } from "./rdkit";

export type ResonanceType =
  | "carboxylate"
  | "enolate-like carbanion"
  | "allylic carbanion"
  | "benzylic carbanion"
  | "phenoxide"
  | "deprotonated carboxamide"
  | "nitro"
  | "allylic radical"
  | "conjugated radical"
  | "benzylic radical"
  | "none";

export type ResonanceStrength = "none" | "weak" | "moderate" | "strong";

export type ResonanceForm = {
  label: string;
  smiles: string | null;
  description: string;
  majorContributor: boolean;
};

export type ResonanceResult = {
  type: ResonanceType;
  siteLabel: string;
  siteSmarts: string;
  matchedAtoms: number[];
  isResonanceStabilized: boolean;
  stabilizationStrength: ResonanceStrength;
  pkaShiftHint: number;
  explanation: string;
  forms: ResonanceForm[];

  // optional fields for radicals / future resonance drawing
  possibleRadicalSites?: number[];
  resonanceBondIndices?: number[];
};

type ResonanceRule = {
  type: ResonanceType;
  siteLabel: string;
  siteSmarts: string;
  stabilizationStrength: ResonanceStrength;
  pkaShiftHint: number;
  explanation: string;
  forms: ResonanceForm[];
};

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

type ParsedAtom = {
  atomIndex: number;
  element: string;
};

type ParsedBond = {
  bondIndex: number;
  atomA: number;
  atomB: number;
  bondOrder: number;
};

type ParsedMolBlock = {
  atoms: ParsedAtom[];
  bonds: ParsedBond[];
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

  const atoms: ParsedAtom[] = atomLines.map((line, index) => {
    const parts = line.trim().split(/\s+/);

    return {
      atomIndex: index,
      element: parts[3] ?? "unknown",
    };
  });

  const bonds: ParsedBond[] = bondLines
    .map((line, index) => {
      const parts = line.trim().split(/\s+/);

      const atomA = Number.parseInt(parts[0], 10) - 1;
      const atomB = Number.parseInt(parts[1], 10) - 1;
      const bondOrder = Number.parseInt(parts[2], 10);

      if (
        !Number.isFinite(atomA) ||
        !Number.isFinite(atomB) ||
        !Number.isFinite(bondOrder)
      ) {
        return null;
      }

      return {
        bondIndex: index,
        atomA,
        atomB,
        bondOrder,
      };
    })
    .filter((bond): bond is ParsedBond => bond !== null);

  return { atoms, bonds };
}

function getBondsForAtom(parsedMol: ParsedMolBlock, atomIndex: number) {
  return parsedMol.bonds.filter(
    (bond) => bond.atomA === atomIndex || bond.atomB === atomIndex
  );
}

function getNeighborAtomIndex(bond: ParsedBond, atomIndex: number) {
  return bond.atomA === atomIndex ? bond.atomB : bond.atomA;
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function getRadicalAtomIndicesFromMolBlock(molblock: string): number[] {
  const lines = molblock.split(/\r?\n/);
  const radicalAtoms: number[] = [];

  for (const line of lines) {
    // V2000 radical line example:
    // M  RAD  1   5   2
    if (!line.startsWith("M  RAD")) continue;

    const parts = line.trim().split(/\s+/);
    const count = Number.parseInt(parts[2], 10);

    if (!Number.isFinite(count)) continue;

    for (let i = 0; i < count; i += 1) {
      const atomNumber = Number.parseInt(parts[3 + i * 2], 10);

      if (Number.isFinite(atomNumber)) {
        radicalAtoms.push(atomNumber - 1);
      }
    }
  }

  return uniqueNumbers(radicalAtoms);
}

function getDoubleBondedCarbonNeighbors(
  parsedMol: ParsedMolBlock,
  atomIndex: number
) {
  return getBondsForAtom(parsedMol, atomIndex)
    .filter((bond) => bond.bondOrder === 2)
    .map((bond) => getNeighborAtomIndex(bond, atomIndex))
    .filter((neighborIndex) => parsedMol.atoms[neighborIndex]?.element === "C");
}

function findAllylicRadicalResults(
  parsedMol: ParsedMolBlock,
  radicalAtomIndices: number[]
): ResonanceResult[] {
  const results: ResonanceResult[] = [];

  for (const radicalAtomIndex of radicalAtomIndices) {
    const radicalAtom = parsedMol.atoms[radicalAtomIndex];

    if (!radicalAtom || radicalAtom.element !== "C") continue;

    const singleBonds = getBondsForAtom(parsedMol, radicalAtomIndex).filter(
      (bond) => bond.bondOrder === 1
    );

    for (const singleBond of singleBonds) {
      const adjacentAtomIndex = getNeighborAtomIndex(
        singleBond,
        radicalAtomIndex
      );

      const doubleBondedCarbonNeighbors = getDoubleBondedCarbonNeighbors(
        parsedMol,
        adjacentAtomIndex
      );

      for (const terminalPiAtomIndex of doubleBondedCarbonNeighbors) {
        if (terminalPiAtomIndex === radicalAtomIndex) continue;

        const piBond = parsedMol.bonds.find(
          (bond) =>
            bond.bondOrder === 2 &&
            ((bond.atomA === adjacentAtomIndex &&
              bond.atomB === terminalPiAtomIndex) ||
              (bond.atomB === adjacentAtomIndex &&
                bond.atomA === terminalPiAtomIndex))
        );

        if (!piBond) continue;

        results.push({
          type: "allylic radical",
          siteLabel: "allylic radical",
          siteSmarts: "molblock radical + adjacent C=C",
          matchedAtoms: uniqueNumbers([
            radicalAtomIndex,
            adjacentAtomIndex,
            terminalPiAtomIndex,
          ]),
          isResonanceStabilized: true,
          stabilizationStrength: "moderate",
          pkaShiftHint: 0,
          explanation:
            "This is an allylic radical. The unpaired electron is next to a π bond, so radical character can delocalize between the two terminal carbons of the allylic system.",
          forms: [
            {
              label: "Radical form 1",
              smiles: null,
              description: "Radical character starts on one end of the allylic system.",
              majorContributor: true,
            },
            {
              label: "Radical form 2",
              smiles: null,
              description:
                "The π bond shifts and radical character moves to the other end of the allylic system.",
              majorContributor: true,
            },
          ],
          possibleRadicalSites: uniqueNumbers([
            radicalAtomIndex,
            terminalPiAtomIndex,
          ]),
          resonanceBondIndices: uniqueNumbers([
            singleBond.bondIndex,
            piBond.bondIndex,
          ]),
        });
      }
    }
  }

  return results;
}

const RESONANCE_RULES: ResonanceRule[] = [
  {
    type: "carboxylate",
    siteLabel: "carboxylate anion",
    siteSmarts: "[CX3](=[OX1])[O-]",
    stabilizationStrength: "strong",
    pkaShiftHint: -12,
    explanation:
      "Carboxylates are strongly resonance-stabilized because the negative charge is delocalized over two oxygens.",
    forms: [
      {
        label: "Form 1",
        smiles: null,
        description: "Negative charge on one oxygen.",
        majorContributor: true,
      },
      {
        label: "Form 2",
        smiles: null,
        description: "Negative charge on the other oxygen.",
        majorContributor: true,
      },
    ],
  },

  {
    type: "enolate-like carbanion",
    siteLabel: "alpha carbanion next to carbonyl",
    siteSmarts: "[C-]-[CX3](=[OX1])",
    stabilizationStrength: "strong",
    pkaShiftHint: -20,
    explanation:
      "This carbanion is next to a carbonyl, so the negative charge can delocalize onto oxygen in an enolate-like resonance form.",
    forms: [
      {
        label: "Carbanion form",
        smiles: null,
        description: "Negative charge is on the alpha carbon.",
        majorContributor: true,
      },
      {
        label: "Oxygen anion form",
        smiles: null,
        description:
          "The carbon lone pair forms a π bond to the carbonyl carbon, and the carbonyl π electrons move onto oxygen.",
        majorContributor: true,
      },
    ],
  },

  {
    type: "enolate-like carbanion",
    siteLabel: "alpha carbanion next to carbonyl",
    siteSmarts: "[CX3](=[OX1])-[C-]",
    stabilizationStrength: "strong",
    pkaShiftHint: -20,
    explanation:
      "This carbanion is next to a carbonyl, so the negative charge can delocalize onto oxygen in an enolate-like resonance form.",
    forms: [
      {
        label: "Carbanion form",
        smiles: null,
        description: "Negative charge is on the alpha carbon.",
        majorContributor: true,
      },
      {
        label: "Oxygen anion form",
        smiles: null,
        description:
          "The carbon lone pair forms a π bond to the carbonyl carbon, and the carbonyl π electrons move onto oxygen.",
        majorContributor: true,
      },
    ],
  },

  {
    type: "allylic carbanion",
    siteLabel: "allylic carbanion",
    siteSmarts: "[C-]-[CX3]=[CX3]",
    stabilizationStrength: "moderate",
    pkaShiftHint: -8,
    explanation:
    "This is an allylic carbanion. The three highlighted atoms form one conjugated resonance system. The negative charge can move between the two terminal carbons while the middle carbon helps connect the π system.",
    forms: [
    {
      label: "Form 1",
      smiles: null,
      description:
        "Negative charge is on one terminal carbon of the allylic system.",
      majorContributor: true,
    },
    {
      label: "Form 2",
      smiles: null,
      description:
        "The π bond shifts, and the negative charge moves to the other terminal carbon.",
      majorContributor: true,
    },
  ],
  },

  {
    type: "allylic carbanion",
    siteLabel: "allylic carbanion",
    siteSmarts: "[CX3]=[CX3]-[C-]",
    stabilizationStrength: "moderate",
    pkaShiftHint: -8,
    explanation:
      "An allylic carbanion is resonance-stabilized because the negative charge can delocalize across the adjacent π bond.",
    forms: [
      {
        label: "Form 1",
        smiles: null,
        description: "Negative charge on one end of the allylic system.",
        majorContributor: true,
      },
      {
        label: "Form 2",
        smiles: null,
        description: "Negative charge shifted to the other end of the allylic system.",
        majorContributor: true,
      },
    ],
  },

  {
    type: "benzylic carbanion",
    siteLabel: "benzylic carbanion",
    siteSmarts: "[C-]-[c]",
    stabilizationStrength: "moderate",
    pkaShiftHint: -10,
    explanation:
      "A benzylic carbanion is resonance-stabilized because the negative charge can delocalize into the aromatic ring.",
    forms: [
      {
        label: "Benzylic form",
        smiles: null,
        description: "Negative charge starts on the benzylic carbon.",
        majorContributor: true,
      },
      {
        label: "Ring-delocalized forms",
        smiles: null,
        description:
          "The negative charge can be delocalized into ortho and para positions of the aromatic ring.",
        majorContributor: true,
      },
    ],
  },

  {
    type: "phenoxide",
    siteLabel: "phenoxide oxygen",
    siteSmarts: "[c][O-]",
    stabilizationStrength: "moderate",
    pkaShiftHint: -6,
    explanation:
      "Phenoxide is resonance-stabilized because the oxygen lone pair can delocalize into the aromatic ring.",
    forms: [
      {
        label: "Oxygen anion form",
        smiles: null,
        description: "Negative charge is on oxygen.",
        majorContributor: true,
      },
      {
        label: "Ring-delocalized forms",
        smiles: null,
        description:
          "Negative charge can be delocalized into the aromatic ring.",
        majorContributor: false,
      },
    ],
  },

  {
    type: "deprotonated carboxamide",
    siteLabel: "carbonyl-stabilized amide anion",
    siteSmarts: "[#6](=[#8])-[#7-]",
    stabilizationStrength: "strong",
    pkaShiftHint: -20,
    explanation:
      "A negatively charged nitrogen attached to a carbonyl is resonance-stabilized, making it much less basic than a simple RNH− anion.",
    forms: [
      {
        label: "Nitrogen anion form",
        smiles: null,
        description: "Negative charge is on nitrogen.",
        majorContributor: true,
      },
      {
        label: "Oxygen anion form",
        smiles: null,
        description:
          "Nitrogen lone pair forms a π bond to the carbonyl carbon, and the carbonyl π electrons move onto oxygen.",
        majorContributor: true,
      },
    ],
  },

  {
    type: "nitro",
    siteLabel: "nitro group",
    siteSmarts: "[NX3+](=O)[O-]",
    stabilizationStrength: "strong",
    pkaShiftHint: -10,
    explanation:
      "Nitro groups are strongly resonance-stabilized and strongly electron-withdrawing.",
    forms: [
      {
        label: "Form 1",
        smiles: null,
        description: "Negative charge on one oxygen.",
        majorContributor: true,
      },
      {
        label: "Form 2",
        smiles: null,
        description: "Negative charge on the other oxygen.",
        majorContributor: true,
      },
    ],
  },
];

function makeResultKey(type: ResonanceType, matchedAtoms: number[]) {
  const normalizedAtoms = [...matchedAtoms].sort((a, b) => a - b);
  return `${type}:${normalizedAtoms.join("-")}`;
}

export async function analyzeResonance(
  smiles: string
): Promise<ResonanceResult[]> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) return [];

  try {
    const results: ResonanceResult[] = [];
    const seen = new Set<string>();
    const molblock = mol.get_molblock();
    const parsedMol = parseMolBlock(molblock);
    const radicalAtomIndices = getRadicalAtomIndicesFromMolBlock(molblock);

  const radicalResults = findAllylicRadicalResults(
    parsedMol,
    radicalAtomIndices
  );

for (const radicalResult of radicalResults) {
  const key = makeResultKey(radicalResult.type, radicalResult.matchedAtoms);

  if (seen.has(key)) continue;
  seen.add(key);

  results.push(radicalResult);
}

    for (const rule of RESONANCE_RULES) {
      let query: any = null;
      try {
        query = RDKit.get_qmol(rule.siteSmarts);
        const matches = extractAtomMatches(mol.get_substruct_matches(query));

        for (const matchedAtoms of matches) {
          const key = makeResultKey(rule.type, matchedAtoms);

          if (seen.has(key)) continue;
          seen.add(key);

          results.push({
            type: rule.type,
            siteLabel: rule.siteLabel,
            siteSmarts: rule.siteSmarts,
            matchedAtoms,
            isResonanceStabilized: rule.stabilizationStrength !== "none",
            stabilizationStrength: rule.stabilizationStrength,
            pkaShiftHint: rule.pkaShiftHint,
            explanation: rule.explanation,
            forms: rule.forms,
            resonanceBondIndices: getBondIndicesAmongAtoms(parsedMol, matchedAtoms),
          });
        }
      } finally {
        query?.delete?.();
      }
    }

    return results;
  } finally {
    mol.delete?.();
  }
}

export function hasResonanceType(
  resonanceResults: ResonanceResult[],
  type: ResonanceType
): boolean {
  return resonanceResults.some((result) => result.type === type);
}

export function getStrongestResonance(
  resonanceResults: ResonanceResult[]
): ResonanceResult | null {
  if (resonanceResults.length === 0) return null;

  const strengthScore: Record<ResonanceStrength, number> = {
    none: 0,
    weak: 1,
    moderate: 2,
    strong: 3,
  };

  return [...resonanceResults].sort(
    (a, b) =>
      strengthScore[b.stabilizationStrength] -
      strengthScore[a.stabilizationStrength]
  )[0];
}

function getBondIndicesAmongAtoms(
  parsedMol: ParsedMolBlock,
  atomIndices: number[]
): number[] {
  const atomSet = new Set(atomIndices);

  return parsedMol.bonds
    .filter((bond) => atomSet.has(bond.atomA) && atomSet.has(bond.atomB))
    .map((bond) => bond.bondIndex);
}

export function getResonanceExplanationSummary(
  resonanceResults: ResonanceResult[]
): string {
  if (resonanceResults.length === 0) {
    return "No major resonance-stabilized charged site detected.";
  }

  return resonanceResults.map((result) => result.explanation).join(" ");
}
