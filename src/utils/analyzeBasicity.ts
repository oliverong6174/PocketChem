import type { FunctionalGroupResult } from "./analyzeSmiles";

export type BasicityResult = {
  relatedGroup: string;
  basicSite: string;
  conjugateAcidPka: string;
  conjugateAcidPkaNumber: number;
  strengthRank: number;
  explanation: string;
};

type BasicityRule = {
  groupName: string;
  basicSite: string;
  conjugateAcidPka: string;
  conjugateAcidPkaNumber: number;
  strengthRank: number;
  explanation: string;
};

const BASICITY_RULES: BasicityRule[] = [
  {
    groupName: "Amine",
    basicSite: "amine nitrogen lone pair",
    conjugateAcidPka: "~9–11",
    conjugateAcidPkaNumber: 10,
    strengthRank: 1,
    explanation:
      "Amines are relatively basic because the nitrogen lone pair can accept a proton. Alkyl groups can donate electron density and increase basicity.",
  },
  {
    groupName: "Aniline",
    basicSite: "aniline nitrogen lone pair",
    conjugateAcidPka: "~4–5",
    conjugateAcidPkaNumber: 4.6,
    strengthRank: 2,
    explanation:
      "Aniline is less basic than an alkyl amine because the nitrogen lone pair is partially delocalized into the aromatic ring.",
  },
  {
    groupName: "Alcohol",
    basicSite: "alcohol oxygen lone pair",
    conjugateAcidPka: "~ -2",
    conjugateAcidPkaNumber: -2,
    strengthRank: 3,
    explanation:
      "Alcohol oxygen can accept a proton, but alcohols are weak bases compared with amines because protonated alcohols are strongly acidic.",
  },
  {
    groupName: "Ether",
    basicSite: "ether oxygen lone pair",
    conjugateAcidPka: "~ -3",
    conjugateAcidPkaNumber: -3,
    strengthRank: 4,
    explanation:
      "Ethers can be protonated on oxygen, but they are weak bases compared with amines.",
  },
  {
    groupName: "Aryl ether",
    basicSite: "aryl ether oxygen lone pair",
    conjugateAcidPka: "~ -3",
    conjugateAcidPkaNumber: -3,
    strengthRank: 4,
    explanation:
      "Aryl ethers can accept a proton on oxygen, but resonance with the aromatic system can reduce lone-pair availability.",
  },
  {
    groupName: "Phenol",
    basicSite: "phenol oxygen lone pair",
    conjugateAcidPka: "~ -6",
    conjugateAcidPkaNumber: -6,
    strengthRank: 5,
    explanation:
      "Phenols are weak bases because the oxygen lone pair is stabilized by interaction with the aromatic ring.",
  },
  {
    groupName: "Carboxylic acid",
    basicSite: "carbonyl oxygen",
    conjugateAcidPka: "~ -6",
    conjugateAcidPkaNumber: -6,
    strengthRank: 6,
    explanation:
      "Carboxylic acids are much more important as acids than bases. Protonation can occur at oxygen, but they are weak bases.",
  },
  {
    groupName: "Benzoic acid derivative",
    basicSite: "carbonyl oxygen",
    conjugateAcidPka: "~ -6",
    conjugateAcidPkaNumber: -6,
    strengthRank: 6,
    explanation:
      "Benzoic acid derivatives are mainly acidic. Their oxygen atoms can be protonated, but they are weak bases overall.",
  },
  {
    groupName: "Amide",
    basicSite: "amide oxygen, not usually nitrogen",
    conjugateAcidPka: "~ -1",
    conjugateAcidPkaNumber: -1,
    strengthRank: 7,
    explanation:
      "Amides are weak bases because the nitrogen lone pair is resonance-delocalized into the carbonyl. Protonation usually occurs on oxygen.",
  },
  {
    groupName: "Ketone",
    basicSite: "carbonyl oxygen",
    conjugateAcidPka: "~ -7",
    conjugateAcidPkaNumber: -7,
    strengthRank: 8,
    explanation:
      "Ketones can be protonated at the carbonyl oxygen, but they are weak bases compared with amines.",
  },
  {
    groupName: "Aldehyde",
    basicSite: "carbonyl oxygen",
    conjugateAcidPka: "~ -7",
    conjugateAcidPkaNumber: -7,
    strengthRank: 8,
    explanation:
      "Aldehydes can be protonated at the carbonyl oxygen, but they are weak bases compared with amines.",
  },
  {
    groupName: "Alkyne",
    basicSite: "alkynyl/acetylide site if deprotonated",
    conjugateAcidPka: "~25 for terminal alkyne",
    conjugateAcidPkaNumber: 25,
    strengthRank: 0,
    explanation:
      "If the molecule is an acetylide/conjugate base form, it is a strong base. A neutral terminal alkyne is not itself basic, but its conjugate base is strong.",
  },
];

export function analyzeBasicity(
  functionalGroups: FunctionalGroupResult[]
): BasicityResult[] {
  const results: BasicityResult[] = [];

  for (const group of functionalGroups) {
    const rule = BASICITY_RULES.find((rule) => rule.groupName === group.name);

    if (!rule) continue;

    results.push({
      relatedGroup: rule.groupName,
      basicSite: rule.basicSite,
      conjugateAcidPka: rule.conjugateAcidPka,
      conjugateAcidPkaNumber: rule.conjugateAcidPkaNumber,
      strengthRank: rule.strengthRank,
      explanation: rule.explanation,
    });
  }

  // Higher conjugate-acid pKa = stronger base
  return results.sort(
    (a, b) => b.conjugateAcidPkaNumber - a.conjugateAcidPkaNumber
  );
}