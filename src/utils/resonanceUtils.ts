import { getRDKit } from "./analyzeSmiles";

export type ResonanceType =
  | "carboxylate"
  | "enolate-like carbanion"
  | "allylic carbanion"
  | "benzylic carbanion"
  | "phenoxide"
  | "deprotonated carboxamide"
  | "nitro"
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
  return `${type}:${matchedAtoms.join("-")}`;
}

export async function analyzeResonance(
  smiles: string
): Promise<ResonanceResult[]> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) return [];

  const results: ResonanceResult[] = [];
  const seen = new Set<string>();

  for (const rule of RESONANCE_RULES) {
    const query = RDKit.get_qmol(rule.siteSmarts);
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
      });
    }
  }

  return results;
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

export function getResonanceExplanationSummary(
  resonanceResults: ResonanceResult[]
): string {
  if (resonanceResults.length === 0) {
    return "No major resonance-stabilized charged site detected.";
  }

  return resonanceResults.map((result) => result.explanation).join(" ");
}