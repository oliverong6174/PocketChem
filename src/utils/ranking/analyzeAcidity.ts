import type { FunctionalGroupResult } from "../functionalGroups/types";
import {
  getInductiveModifiersForSite,
  type InductiveModifier,
} from "./inductionUtils";

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
  siteSmarts: string;
  anchorAtomIndexInMatch: number;
  inductionSensitivity: number;
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
    siteSmarts: "[SX4](=[OX1])(=[OX1])[OX2H]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 0.2,
    estimatedPka: "~ -1 to 1",
    estimatedPkaNumber: 0,
    strengthRank: 1,
    atom: "Deprotonation leaves negative charge on oxygen.",
    resonance: "The sulfonate charge is shared across three oxygens.",
    induction: "The sulfonyl group strongly withdraws electron density.",
    orbital: "Delocalization spreads the charge through the sulfonate group.",
    explanation: "Strong resonance and induction make sulfonic acids very acidic.",
  },
  {
    groupName: "Arenesulfonic acid",
    acidicSite: "arenesulfonic acid O-H proton",
    siteSmarts: "[a][SX4](=[OX1])(=[OX1])[OX2H]",
    anchorAtomIndexInMatch: 1,
    inductionSensitivity: 0.2,
    estimatedPka: "~ -1 to 1",
    estimatedPkaNumber: 0,
    strengthRank: 1,
    atom: "Deprotonation leaves negative charge on oxygen.",
    resonance: "The sulfonate charge is shared across three oxygens.",
    induction: "The sulfonyl group strongly withdraws electron density.",
    orbital: "Delocalization spreads the charge through the sulfonate group.",
    explanation: "Sulfonate stabilization makes arenesulfonic acids very acidic.",
  },
  {
    groupName: "Carboxylic acid",
    acidicSite: "carboxylic acid O-H proton",
    siteSmarts: "[CX3](=[OX1])[OX2H1]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 1.0,
    estimatedPka: "~4–5",
    estimatedPkaNumber: 4.8,
    strengthRank: 2,
    atom: "Deprotonation leaves negative charge on oxygen.",
    resonance: "The carboxylate charge is shared between two oxygens.",
    induction: "Electron-withdrawing groups stabilize carboxylate and lower pKa.",
    orbital: "Adjacent p orbitals delocalize charge across the carboxylate.",
    explanation: "Resonance makes carboxylic acids more acidic than alcohols.",
  },
  {
    groupName: "Benzoic acid derivative",
    acidicSite: "benzoic acid O-H proton",
    siteSmarts: "[a][CX3](=[OX1])[OX2H1]",
    anchorAtomIndexInMatch: 1,
    inductionSensitivity: 0.9,
    estimatedPka: "~4–5",
    estimatedPkaNumber: 4.2,
    strengthRank: 2,
    atom: "Deprotonation leaves negative charge on oxygen.",
    resonance: "The carboxylate charge is shared between two oxygens.",
    induction: "Ring electron-withdrawing groups stabilize carboxylate and lower pKa.",
    orbital: "Adjacent p orbitals delocalize charge across the carboxylate.",
    explanation: "Carboxylate resonance makes benzoic acid derivatives acidic.",
  },
  {
    groupName: "Phenol",
    acidicSite: "phenolic O-H proton",
    siteSmarts: "[a][OX2H]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 0.25,
    estimatedPka: "~10",
    estimatedPkaNumber: 10,
    strengthRank: 3,
    atom: "Deprotonation leaves negative charge on oxygen.",
    resonance: "Phenoxide delocalizes charge into the aromatic ring.",
    induction: "Electron-withdrawing ring groups increase phenol acidity.",
    orbital: "An oxygen p orbital overlaps with the aromatic π system.",
    explanation: "Phenoxide resonance makes phenols more acidic than alcohols.",
  },
  {
    groupName: "Thiol",
    acidicSite: "thiol S-H proton",
    siteSmarts: "[#6][SX2H]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 0.6,
    estimatedPka: "~10",
    estimatedPkaNumber: 10.5,
    strengthRank: 4,
    atom: "Deprotonation leaves negative charge on sulfur.",
    resonance: "Simple thiolates usually lack significant resonance stabilization.",
    induction: "Electron-withdrawing groups stabilize thiolate and lower pKa.",
    orbital: "Large sulfur orbitals spread negative charge effectively.",
    explanation: "Sulfur's size makes thiols more acidic than alcohols.",
  },
  {
    groupName: "Alcohol",
    acidicSite: "alcohol O-H proton",
    siteSmarts: "[CX4][OX2H]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 0.45,
    estimatedPka: "~16–18",
    estimatedPkaNumber: 17,
    strengthRank: 5,
    atom: "Deprotonation leaves negative charge on oxygen.",
    resonance: "Simple alkoxides lack significant resonance stabilization.",
    induction: "Electron-withdrawing groups stabilize alkoxide and lower pKa.",
    orbital: "The negative charge remains localized on oxygen.",
    explanation: "Limited alkoxide stabilization makes alcohols weak acids.",
  },
  {
    groupName: "Alkyne",
    acidicSite: "terminal alkyne C-H proton if present",
    siteSmarts: "[CX2H]#[CX2]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 0.35,
    estimatedPka: "~25",
    estimatedPkaNumber: 25,
    strengthRank: 6,
    atom: "Deprotonation leaves negative charge on carbon.",
    resonance: "Simple acetylide ions usually lack resonance stabilization.",
    induction: "Electron-withdrawing groups stabilize acetylide and lower pKa.",
    orbital: "An sp orbital stabilizes charge through high s-character.",
    explanation: "sp hybridization makes terminal alkynes more acidic than alkenes.",
  },
  {
    groupName: "Aniline",
    acidicSite: "aniline N-H proton if present",
    siteSmarts:
      "[a][NX3;H1,H2;!$([NX3][CX3](=[OX1]));!$(N=C);!$([N+](=O)[O-])]",
    anchorAtomIndexInMatch: 1,
    inductionSensitivity: 0.4,
    estimatedPka: "~30–35",
    estimatedPkaNumber: 33,
    strengthRank: 7,
    atom: "Deprotonation leaves negative charge on nitrogen.",
    resonance: "The anilide charge can delocalize into the aromatic ring.",
    induction: "Electron-withdrawing ring groups increase N-H acidity.",
    orbital: "A nitrogen p orbital overlaps with the aromatic π system.",
    explanation: "Aromatic delocalization makes anilines slightly more acidic than alkyl amines.",
  },
  {
    groupName: "Amine",
    acidicSite: "amine N-H proton if present",
    siteSmarts:
      "[NX3;H1,H2;!$([NX3][CX3](=[OX1]));!$(N=C);!$([N+](=O)[O-]);!$(N=N)]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 0.35,
    estimatedPka: "~35–40",
    estimatedPkaNumber: 38,
    strengthRank: 7,
    atom: "Deprotonation leaves negative charge on nitrogen.",
    resonance: "Simple amine conjugate bases lack significant resonance stabilization.",
    induction: "Electron-withdrawing groups increase amine N-H acidity.",
    orbital: "The negative charge remains localized on nitrogen.",
    explanation: "Poor anion stabilization makes neutral amines very weak acids.",
  },
  {
    groupName: "Ether",
    acidicSite: "alpha C-H next to ether oxygen",
    siteSmarts: "[CX4;!H0][OX2][#6]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 0.45,
    estimatedPka: "~40–45",
    estimatedPkaNumber: 43,
    strengthRank: 90,
    atom: "Deprotonation leaves negative charge on carbon beside oxygen.",
    resonance: "The resulting carbanion usually lacks resonance stabilization.",
    induction: "Ether oxygen weakly stabilizes the carbanion by induction.",
    orbital: "The charge remains mostly in an sp3 carbon orbital.",
    explanation: "Weak inductive stabilization makes ether alpha hydrogens only slightly acidic.",
  },
  {
    groupName: "Alkane",
    acidicSite: "alkane C-H proton",
    siteSmarts: "[CX4;!H0]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 0.75,
    estimatedPka: "~50",
    estimatedPkaNumber: 50,
    strengthRank: 99,
    atom: "Deprotonation leaves negative charge on sp3 carbon.",
    resonance: "Alkyl carbanions usually lack resonance stabilization.",
    induction: "Alkyl groups do not stabilize the carbanion.",
    orbital: "An sp3 orbital poorly stabilizes negative charge.",
    explanation: "An unstable alkyl carbanion makes alkanes extremely weak acids.",
  },

  // CHARGED GROUPS

  {
    groupName: "Oxonium ion",
    acidicSite: "oxonium O-H proton",
    siteSmarts: "[O+]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 0.2,
    estimatedPka: "~ -2 to 0",
    estimatedPkaNumber: -1,
    strengthRank: 0,
    atom: "The acidic proton is attached to positively charged oxygen.",
    resonance: "Resonance is limited unless a nearby π system is present.",
    induction: "Positive oxygen strongly increases O-H acidity.",
    orbital: "Deprotonation restores neutral oxygen.",
    explanation: "Charge neutralization makes oxonium ions strongly acidic.",
  },
  {
    groupName: "Ammonium ion",
    acidicSite: "ammonium N-H proton",
    siteSmarts: "[N+;H1,H2,H3,H4]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 0.4,
    estimatedPka: "~9–11",
    estimatedPkaNumber: 10,
    strengthRank: 4,
    atom: "The acidic proton is attached to positively charged nitrogen.",
    resonance: "Resonance is limited unless a nearby π system is present.",
    induction: "Positive nitrogen strongly increases N-H acidity.",
    orbital: "Deprotonation restores a neutral amine.",
    explanation: "Ammonium ions donate H+ to regenerate neutral amines.",
  },
];

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function summarizeInductiveModifier(modifier: InductiveModifier): string {
  const direction =
    modifier.pkaShift < 0
      ? "withdraws electron density and lowers pKa"
      : "donates electron density and raises pKa";

  return `${capitalizeFirst(modifier.label)} ${direction}.`;
}

export async function analyzeAcidity(
  smiles: string,
  functionalGroups: FunctionalGroupResult[]
): Promise<AcidityResult[]> {
  const results: AcidityResult[] = [];

  for (const group of functionalGroups) {
    const rule = ACIDITY_RULES.find((candidateRule) => {
      if (
        candidateRule.groupName === "Alkane" &&
        (group.name === "Alkane" ||
          group.name === "Alkyl halide" ||
          group.name === "Haloalkane")
      ) {
        return true;
      }

      return candidateRule.groupName === group.name;
    });

    if (!rule) continue;

    const inductiveModifiers = await getInductiveModifiersForSite(
      smiles,
      rule.siteSmarts,
      rule.anchorAtomIndexInMatch,
      rule.inductionSensitivity,
      "acidity"
    );

    const totalPkaShift = inductiveModifiers.reduce(
      (sum, modifier) => sum + modifier.pkaShift,
      0
    );

    const adjustedPkaNumber = rule.estimatedPkaNumber + totalPkaShift;
    const strongestModifier = inductiveModifiers[0];
    const strongestModifierSummary = strongestModifier
      ? summarizeInductiveModifier(strongestModifier)
      : null;

    results.push({
      relatedGroup: rule.groupName,
      acidicSite: rule.acidicSite,
      estimatedPka:
        inductiveModifiers.length > 0
          ? `~${adjustedPkaNumber.toFixed(2)}`
          : rule.estimatedPka,
      estimatedPkaNumber: adjustedPkaNumber,
      basePkaNumber: rule.estimatedPkaNumber,
      strengthRank: rule.strengthRank,
      atom: rule.atom,
      resonance: rule.resonance,
      induction: strongestModifierSummary ?? rule.induction,
      orbital: rule.orbital,
      modifiers: strongestModifierSummary ? [strongestModifierSummary] : [],
      explanation: rule.explanation,
    });
  }

  return results.sort((a, b) => a.estimatedPkaNumber - b.estimatedPkaNumber);
}