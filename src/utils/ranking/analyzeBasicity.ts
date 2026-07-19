import { getRDKit } from "../rdkit";
import type { FunctionalGroupResult } from "../functionalGroups/types";
import { getInductiveModifiersForSite } from "./inductionUtils";
import {
  analyzeCarbanionStability,
  getBestCarbanionStabilityResult,
} from "./anionStability";


export type BasicityResult = {
  relatedGroup: string;
  basicSite: string;
  conjugateAcidPka: string;
  conjugateAcidPkaNumber: number;
  baseConjugateAcidPkaNumber: number;
  strengthRank: number;
  modifiers: string[];
  explanation: string;
};

type BasicityRule = {
  groupName: string;
  basicSite: string;
  siteSmarts: string;
  anchorAtomIndexInMatch: number;
  inductionSensitivity: number;
  conjugateAcidPka: string;
  conjugateAcidPkaNumber: number;
  strengthRank: number;
  explanation: string;
};

const BASICITY_RULES: BasicityRule[] = [
  {
    groupName: "Amine",
    basicSite: "amine nitrogen lone pair",
    siteSmarts:
      "[NX3;!$([NX3][CX3](=[OX1]));!$(N=C);!$([N+](=O)[O-]);!$(N=N)]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 0.8,
    conjugateAcidPka: "~9–11",
    conjugateAcidPkaNumber: 10,
    strengthRank: 1,
    explanation:
      "Amines are relatively basic because the nitrogen lone pair can accept a proton. Electron-donating groups increase basicity, while electron-withdrawing groups decrease it.",
  },
  {
    groupName: "Aniline",
    basicSite: "aniline nitrogen lone pair",
    siteSmarts:
      "[a][NX3;!$([NX3][CX3](=[OX1]));!$(N=C);!$([N+](=O)[O-])]",
    anchorAtomIndexInMatch: 1,
    inductionSensitivity: 0.7,
    conjugateAcidPka: "~4–5",
    conjugateAcidPkaNumber: 4.6,
    strengthRank: 2,
    explanation:
      "Aniline is less basic than an alkyl amine because the nitrogen lone pair is partially delocalized into the aromatic ring.",
  },
  {
    groupName: "Alcohol",
    basicSite: "alcohol oxygen lone pair",
    siteSmarts: "[CX4][OX2H]",
    anchorAtomIndexInMatch: 1,
    inductionSensitivity: 0.4,
    conjugateAcidPka: "~ -2",
    conjugateAcidPkaNumber: -2,
    strengthRank: 3,
    explanation:
      "Alcohol oxygen can accept a proton, but alcohols are weak bases compared with amines.",
  },
  {
    groupName: "Ether",
    basicSite: "ether oxygen lone pair",
    siteSmarts: "[#6][OX2][#6]",
    anchorAtomIndexInMatch: 1,
    inductionSensitivity: 0.4,
    conjugateAcidPka: "~ -3",
    conjugateAcidPkaNumber: -3,
    strengthRank: 4,
    explanation:
      "Ethers can be protonated on oxygen, but they are weak bases compared with amines.",
  },
  {
    groupName: "Aryl ether",
    basicSite: "aryl ether oxygen lone pair",
    siteSmarts: "[a][OX2][#6]",
    anchorAtomIndexInMatch: 1,
    inductionSensitivity: 0.35,
    conjugateAcidPka: "~ -3",
    conjugateAcidPkaNumber: -3,
    strengthRank: 4,
    explanation:
      "Aryl ethers can accept a proton on oxygen, but resonance with the aromatic system can reduce lone-pair availability.",
  },
  {
    groupName: "Phenol",
    basicSite: "phenol oxygen lone pair",
    siteSmarts: "[a][OX2H]",
    anchorAtomIndexInMatch: 1,
    inductionSensitivity: 0.35,
    conjugateAcidPka: "~ -6",
    conjugateAcidPkaNumber: -6,
    strengthRank: 5,
    explanation:
      "Phenols are weak bases because the oxygen lone pair is stabilized by interaction with the aromatic ring.",
  },
  {
    groupName: "Carboxylic acid",
    basicSite: "carbonyl oxygen",
    siteSmarts: "[CX3](=[OX1])[OX2H1]",
    anchorAtomIndexInMatch: 1,
    inductionSensitivity: 0.3,
    conjugateAcidPka: "~ -6",
    conjugateAcidPkaNumber: -6,
    strengthRank: 6,
    explanation:
      "Carboxylic acids are mainly acids, not bases. Protonation can occur at oxygen, but they are weak bases overall.",
  },
  {
    groupName: "Benzoic acid derivative",
    basicSite: "carbonyl oxygen",
    siteSmarts: "[a][CX3](=[OX1])[OX2H1]",
    anchorAtomIndexInMatch: 2,
    inductionSensitivity: 0.3,
    conjugateAcidPka: "~ -6",
    conjugateAcidPkaNumber: -6,
    strengthRank: 6,
    explanation:
      "Benzoic acid derivatives are mainly acidic. Their oxygen atoms can be protonated, but they are weak bases overall.",
  },
  {
    groupName: "Amide",
    basicSite: "amide oxygen, not usually nitrogen",
    siteSmarts: "[CX3](=[OX1])[NX3]",
    anchorAtomIndexInMatch: 1,
    inductionSensitivity: 0.35,
    conjugateAcidPka: "~ -1",
    conjugateAcidPkaNumber: -1,
    strengthRank: 7,
    explanation:
      "Amides are weak bases because the nitrogen lone pair is resonance-delocalized into the carbonyl. Protonation usually occurs on oxygen.",
  },
  {
    groupName: "Ketone",
    basicSite: "carbonyl oxygen",
    siteSmarts: "[#6][CX3](=[OX1])[#6]",
    anchorAtomIndexInMatch: 2,
    inductionSensitivity: 0.5,
    conjugateAcidPka: "~ -7",
    conjugateAcidPkaNumber: -7,
    strengthRank: 8,
    explanation:
      "Ketones can be protonated at the carbonyl oxygen, but they are weak bases compared with amines.",
  },
  {
    groupName: "Aldehyde",
    basicSite: "carbonyl oxygen",
    siteSmarts: "[CX3H1](=[OX1])[#6,H]",
    anchorAtomIndexInMatch: 1,
    inductionSensitivity: 0.5,
    conjugateAcidPka: "~ -7",
    conjugateAcidPkaNumber: -7,
    strengthRank: 8,
    explanation:
      "Aldehydes can be protonated at the carbonyl oxygen, but they are weak bases compared with amines.",
  },
  {
    groupName: "Nitrile",
    basicSite: "nitrile nitrogen",
    siteSmarts: "[CX2]#N",
    anchorAtomIndexInMatch: 1,
    inductionSensitivity: 0.3,
    conjugateAcidPka: "~ -10",
    conjugateAcidPkaNumber: -10,
    strengthRank: 9,
    explanation:
      "Nitriles are weak bases. The nitrogen lone pair is held tightly in an sp orbital, making it less available for protonation.",
  },

  //CHARGED GROUPS

  {
    groupName: "Carboxylate",
    basicSite: "carboxylate oxygen",
    siteSmarts: "[CX3](=[OX1])[O-]",
    anchorAtomIndexInMatch: 2,
    inductionSensitivity: 0.8,
    conjugateAcidPka: "~4–5",
    conjugateAcidPkaNumber: 4.5,
    strengthRank: 0,
    explanation:
      "Carboxylates are basic at oxygen, but resonance delocalization makes them weaker bases than alkoxides.",
  },
  {
    groupName: "Alkoxide",
    basicSite: "alkoxide oxygen",
    siteSmarts: "[O-][CX4]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 0.6,
    conjugateAcidPka: "~16–18",
    conjugateAcidPkaNumber: 16.5,
    strengthRank: 1,
    explanation:
      "Alkoxides are strong bases because protonation gives an alcohol with a relatively high pKa.",
  },
  {
    groupName: "Thiolate",
    basicSite: "thiolate sulfur",
    siteSmarts: "[S-]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 0.5,
    conjugateAcidPka: "~10–11",
    conjugateAcidPkaNumber: 10.5,
    strengthRank: 2,
    explanation:
      "Thiolates are basic and very nucleophilic. They are less basic than alkoxides because sulfur is larger and stabilizes negative charge better.",
  },
  {
    groupName: "Carbanion",
    basicSite: "negatively charged carbon",
    siteSmarts: "[C-]",
    anchorAtomIndexInMatch: 0,
    inductionSensitivity: 1.0,
    conjugateAcidPka: "~25–50",
    conjugateAcidPkaNumber: 35,
    strengthRank: 0,
    explanation:
      "Carbanions are usually very strong bases. Their exact basicity depends on resonance, nearby carbonyls, nitriles, or other electron-withdrawing groups.",
  },
{
  groupName: "Acetylide anion",
  basicSite: "acetylide carbon",
  siteSmarts: "[C-]#[C]",
  anchorAtomIndexInMatch: 0,
  inductionSensitivity: 0.8,
  conjugateAcidPka: "~25",
  conjugateAcidPkaNumber: 25,
  strengthRank: 0,
  explanation:
    "Acetylide anions are strong bases and strong nucleophiles. Protonation gives a terminal alkyne, whose pKa is about 25.",
},
{
  groupName: "Deprotonated carboxamide",
  basicSite: "amide anion nitrogen",
  siteSmarts: "[#6](=[#8])-[#7-]",
  anchorAtomIndexInMatch: 2,
  inductionSensitivity: 0.8,
  conjugateAcidPka: "~15–17",
  conjugateAcidPkaNumber: 15.5,
  strengthRank: 2,
  explanation:
    "This nitrogen is negatively charged, so it is basic. However, resonance with the adjacent carbonyl stabilizes the anion, making it less basic than a simple amide anion.",
},
{
  groupName: "Amide anion",
  basicSite: "negatively charged nitrogen",
  siteSmarts: "[N-]",
  anchorAtomIndexInMatch: 0,
  inductionSensitivity: 0.7,
  conjugateAcidPka: "~35–40",
  conjugateAcidPkaNumber: 38,
  strengthRank: 0,
  explanation:
    "A negatively charged nitrogen is a very strong base. Protonation gives a neutral amine, whose N-H bond is much less acidic.",
},
{
  groupName: "Methyl carbanion",
  basicSite: "CH2− carbon",
  siteSmarts: "[CH2-]",
  anchorAtomIndexInMatch: 0,
  inductionSensitivity: 1.0,
  conjugateAcidPka: "~45–50",
  conjugateAcidPkaNumber: 48,
  strengthRank: 0,
  explanation:
    "A CH2− carbanion is extremely basic because protonation gives an alkane-like C-H bond with a very high pKa.",
},

];


function isRuleAllowedForFunctionalGroups(
  rule: BasicityRule,
  functionalGroups: FunctionalGroupResult[]
) {
  return functionalGroups.some((group) => group.name === rule.groupName);
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

async function ruleActuallyMatchesSmiles(
  smiles: string,
  siteSmarts: string
): Promise<boolean> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) return false;

  try {
    const query = RDKit.get_qmol(siteSmarts);
    const matches = extractAtomMatches(mol.get_substruct_matches(query));

    return matches.length > 0;
  } catch (error) {
    console.log("SMARTS match failed:", siteSmarts, error);
    return false;
  }
}

export async function analyzeBasicity(
  smiles: string,
  functionalGroups: FunctionalGroupResult[]
): Promise<BasicityResult[]> {
  const results: BasicityResult[] = [];

  //Carbanion support
  const carbanionStabilityResults = await analyzeCarbanionStability(smiles);
  const bestCarbanionStability = getBestCarbanionStabilityResult(
    carbanionStabilityResults
  );
  
for (const rule of BASICITY_RULES) {
  if (!isRuleAllowedForFunctionalGroups(rule, functionalGroups)) continue;

  const ruleMatches = await ruleActuallyMatchesSmiles(smiles, rule.siteSmarts);

  if (!ruleMatches) continue;

    const inductiveModifiers = await getInductiveModifiersForSite(
      smiles,
      rule.siteSmarts,
      rule.anchorAtomIndexInMatch,
      rule.inductionSensitivity,
      "basicity"
    );

    const totalPkaShift = inductiveModifiers.reduce(
      (sum, modifier) => sum + modifier.pkaShift,
      0
    );

    const adjustedConjugateAcidPka =
      rule.conjugateAcidPkaNumber + totalPkaShift;

    let finalConjugateAcidPkaNumber = adjustedConjugateAcidPka;
    let finalConjugateAcidPka =
      inductiveModifiers.length > 0
        ? `~${adjustedConjugateAcidPka.toFixed(2)}`
        : rule.conjugateAcidPka;

    let finalRelatedGroup = rule.groupName;
    let finalBasicSite = rule.basicSite;
    let extraExplanation = "";

    const isCarbanionRule =
    rule.groupName.toLowerCase().includes("carbanion") ||
    rule.basicSite.toLowerCase().includes("carbon");



    if (isCarbanionRule && bestCarbanionStability) {
      finalConjugateAcidPkaNumber =
        rule.conjugateAcidPkaNumber + bestCarbanionStability.pkaShift;

      finalConjugateAcidPka = `~${finalConjugateAcidPkaNumber.toFixed(2)}`;

      if (
        bestCarbanionStability.resonanceStabilized &&
        bestCarbanionStability.nearestStabilizer
      ) {
        finalRelatedGroup = `${bestCarbanionStability.positionLabel} resonance-stabilized carbanion near ${bestCarbanionStability.nearestStabilizer}`;
        finalBasicSite = `${bestCarbanionStability.positionLabel} resonance-stabilized carbanion`;
      } else {
        finalRelatedGroup = `${bestCarbanionStability.substitution} localized carbanion`;
        finalBasicSite = `${bestCarbanionStability.substitution} localized carbanion`;
      }

      extraExplanation = ` ${bestCarbanionStability.explanation}`;
    }

    results.push({
      relatedGroup: finalRelatedGroup,
      basicSite: finalBasicSite,
      conjugateAcidPka: finalConjugateAcidPka,
      conjugateAcidPkaNumber: finalConjugateAcidPkaNumber,
      baseConjugateAcidPkaNumber: rule.conjugateAcidPkaNumber,
      strengthRank: rule.strengthRank,
      modifiers: inductiveModifiers.map((modifier) => modifier.explanation),
      explanation:
        inductiveModifiers.length > 0
          ? `${rule.explanation} ${inductiveModifiers
              .map((modifier) => modifier.explanation)
              .join(" ")}${extraExplanation}`
          : `${rule.explanation}${extraExplanation}`,
    });
  }

const hasDeprotonatedCarboxamide = results.some(
  (result) => result.relatedGroup === "Deprotonated carboxamide"
);

const filteredResults = results.filter((result) => {
  if (
    hasDeprotonatedCarboxamide &&
    result.relatedGroup === "Amide anion" &&
    result.basicSite === "negatively charged nitrogen"
  ) {
    return false;
  }

  return true;
});

const dedupedResults = filteredResults.reduce<BasicityResult[]>((acc, result) => {
  const key = `${result.relatedGroup}-${result.basicSite}`;

  const existingIndex = acc.findIndex(
    (item) => `${item.relatedGroup}-${item.basicSite}` === key
  );

  if (existingIndex === -1) {
    acc.push(result);
    return acc;
  }

  // For duplicate same-site basicity results, keep the stronger base:
  // higher conjugate acid pKa = stronger base.
  if (
    result.conjugateAcidPkaNumber >
    acc[existingIndex].conjugateAcidPkaNumber
  ) {
    acc[existingIndex] = result;
  }

  return acc;
}, []);

return dedupedResults.sort(
  (a, b) => b.conjugateAcidPkaNumber - a.conjugateAcidPkaNumber
);

}