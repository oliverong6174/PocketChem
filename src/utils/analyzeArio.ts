 import type { FunctionalGroupResult } from "./analyzeSmiles";

export type ArioResult = {
  relatedGroup: string;
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

type ArioRule = {
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

const ARIO_RULES: ArioRule[] = [
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

export function analyzeArio(
  functionalGroups: FunctionalGroupResult[]
): ArioResult[] {
  const results: ArioResult[] = [];

  for (const group of functionalGroups) {
    const rule = ARIO_RULES.find((rule) => rule.groupName === group.name);

    if (!rule) continue;

    results.push({
      relatedGroup: rule.groupName,
      acidicSite: rule.acidicSite,
      estimatedPka: rule.estimatedPka,
      estimatedPkaNumber: rule.estimatedPkaNumber,
      strengthRank: rule.strengthRank,
      atom: rule.atom,
      resonance: rule.resonance,
      induction: rule.induction,
      orbital: rule.orbital,
      explanation: rule.explanation,
    });
  }

  return results.sort((a, b) => a.estimatedPkaNumber - b.estimatedPkaNumber);
}