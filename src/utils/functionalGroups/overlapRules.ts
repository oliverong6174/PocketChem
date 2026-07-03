import type {
  FunctionalGroupMatch,
  FunctionalGroupResult,
} from "./types";
import { hasAtomOverlap } from "./matchUtils";

const SUPPRESSION_RULES: Record<string, string[]> = {
  // Charged/specific ions
  Carboxylate: ["Carboxylic acid"],
  "Acetylide anion": ["Alkyne", "Carbanion"],
  "Methyl carbanion": ["Carbanion"],
  "Deprotonated carboxamide": ["Amide anion"],

  // Acid derivatives
  Peroxyacid: ["Carboxylic acid", "Peroxide"],
  "Acid anhydride": ["Ester", "Ether", "Ketone", "Carbonyl"],
  "Carbonate ester": ["Ester", "Ether"],
"Carbamate": ["Amide", "Ester", "Ether"],
  Ester: ["Ether"],
  "Acyl halide": ["Halogen", "Haloalkane"],
  Amide: ["Amine"],

  "Primary amide": ["Amide"],
  "Secondary amide": ["Amide"],
  "Tertiary amide": ["Amide"],

  // Lactones
  "Lactone": ["Cycloalkane", "Ester"],
  "Alpha lactone": ["Lactone", "Cycloalkane", "Ester"],
  "Beta lactone": ["Lactone", "Cycloalkane", "Ester"],
  "Gamma lactone": ["Lactone", "Cycloalkane", "Ester"],
  "Delta lactone": ["Lactone", "Cycloalkane", "Ester"],
  "Epsilon lactone": ["Lactone", "Cycloalkane", "Ester"],

  // Lactams
  "Alpha lactam": ["Lactam", "Cycloalkane", "Amide"],
  "Beta lactam": ["Lactam", "Cycloalkane", "Amide"],
  "Gamma lactam": ["Lactam", "Cycloalkane", "Amide"],
  "Delta lactam": ["Lactam", "Cycloalkane", "Amide"],
  "Epsilon lactam": ["Lactam", "Cycloalkane", "Amide"],

  // Lactims
  "Alpha lactim": ["Lactim", "Cycloalkane", "Enol", "Imine"],
  "Beta lactim": ["Lactim",  "Cycloalkane", "Enol", "Imine"],
  "Gamma lactim": ["Lactim",  "Cycloalkane", "Enol", "Imine"],
  "Delta lactim": ["Lactim",  "Cycloalkane", "Enol", "Imine"],
  "Epsilon lactim": ["Lactim", "Cycloalkane", "Enol", "Imine"],

  // Alcohols
  "Primary alcohol": ["Alcohol"],
  "Secondary alcohol": ["Alcohol"],
  "Tertiary alcohol": ["Alcohol"],
  Phenol: [
    "Benzene",
    "Alcohol",
    "Primary alcohol",
    "Secondary alcohol",
    "Tertiary alcohol",
  ],

  // Amines
  "Primary amine": ["Amine"],
  "Secondary amine": ["Amine"],
  "Tertiary amine": ["Amine"],
  Aniline: ["Benzene", "Aryl amine", "Primary amine", "Amine"],
  "Aryl amine": ["Benzene", "Primary amine", "Amine"],

  //Nitrogens
  "N-oxide": ["Amine"],
  "Nitro": ["N-oxide", "Amine"],

  // Oxygen/ether motifs
  Hemiacetal: ["Alcohol", "Ether"],
  Acetal: ["Ether"],
  "Aryl ether": ["Benzene", "Ether"],
  Anisole: ["Benzene", "Aryl ether", "Ether"],
  Epoxide: ["Ether"],

  // Aldehyde/ketone derivatives
  Enol: ["Alcohol", "Alkene"],
  Aldol: ["Alcohol"],
  Benzoin: ["Ketone", "Alcohol"],
  Imine: ["Amine"],
  Hydrazone: ["Imine"],
  Oxime: ["Imine"],

  // Conjugated carbonyls / Michael acceptors
  Enal: ["Aldehyde", "Alkene", "Acryloyl group"],
  Enone: ["Ketone", "Alkene", "Acryloyl group"],
  Acrolein: [
    "Enal",
    "Aldehyde",
    "Alkene",
    "Acryloyl group",
    "Enone"
],
  "Acryloyl group": ["Alkene"],
  "Acrylic acid": ["Enoic acid", "Carboxylic acid", "Alkene", "Acryloyl group"],
  "Enoic acid": ["Carboxylic acid", "Alkene", "Acryloyl group"],
  "Crotonic acid": ["Enoic acid", "Carboxylic acid", "Alkene", "Acryloyl group"],
  Crotonaldehyde: [
    "Acrolein",
    "Enal",
    "Aldehyde",
    "Alkene",
    "Acryloyl group",
],
  "Cinnamic acid": ["Benzene", "Enoic acid", "Carboxylic acid", "Alkene", "Acryloyl group"],
  Cinnamaldehyde: [
    "Crotonaldehyde",
    "Acrolein",
    "Enal",
    "Aldehyde",
    "Alkene",
    "Benzene",
],
  Chalcone: ["Benzene", "Enone", "Ketone", "Alkene", "Acryloyl group"],
  Enamide: ["Amide", "Alkene"],
  Enoate: ["Ester", "Alkene", "Acryloyl group"],

  // Nitrogen motifs
  Azide: [],
  Isocyanide: ["Nitrile"],
  Isocyanate: ["Amine"],

  // Aromatics
  Alkylbenzene: ["Benzene"],
  Toluene: ["Benzene", "Alkylbenzene"],
  "Aryl halide": ["Benzene", "Halogen", "Haloalkane"],
  Nitrobenzene: [
  "Benzene",
  "Nitro",
  "Halogen",
  "Haloalkane"
],


  Naphthalene: ["Benzene"],
  Anthracene: ["Benzene", "Naphthalene"],
  Phenanthrene: ["Benzene", "Naphthalene"],
  Indane: ["Benzene", "Alkylbenzene", "Toluene"],
  Pyridine: ["Benzene", "Amine"],
  Pyrrole: ["Benzene", "Amine"],
  Furan: ["Benzene", "Ether"],
  Thiophene: ["Benzene", "Thioether"],
  Indole: ["Benzene", "Pyrrole"],

  // Unsaturated hydrocarbons
  Diene: ["Alkene"],
  Triene: ["Diene", "Alkene"],
  Nitrile: ["Alkyne"],
  "Conjugated diene": ["Diene", "Alkene"],
  "Cumulated diene": ["Diene", "Alkene"],
  "Allene": ["Cumulated diene", "Diene", "Alkene"],

  Enyne: ["Alkene", "Alkyne"],

  "Terminal alkyne": ["Alkyne"],
  "Internal alkyne": ["Alkyne"],

  // Sulfur/phosphorus
  Sulfoxide: ["Thioether"],
  Sulfone: ["Sulfoxide", "Thioether"],
  "Sulfonic acid": ["Sulfone"],

  //Cycloalkanes
  Cyclopropane: ["Cycloalkane", "Alkane"],
  Cyclobutane: ["Cycloalkane", "Alkane"],
  Cyclopentane: ["Cycloalkane", "Alkane"],
  Cyclohexane: ["Cycloalkane", "Alkane"],
  Cycloalkene: ["Alkene"],
  Cycloalkyne: ["Alkyne"],

  //Halogens
  "Haloalkane": ["Halogen"],

  "Allylic halide": ["Haloalkane", "Halogen"],
  "Benzylic halide": ["Haloalkane", "Halogen"],

  "Geminal dihalide": ["Haloalkane", "Halogen"],
  "Vicinal dihalide": ["Haloalkane", "Halogen"],

  "Allylic fluoride": ["Allylic halide", "Haloalkane", "Halogen"],
  "Allylic chloride": ["Allylic halide", "Haloalkane", "Halogen"],
  "Allylic bromide": ["Allylic halide", "Haloalkane", "Halogen"],

  "Benzylic chloride": ["Benzylic halide", "Haloalkane", "Halogen"],
  "Benzylic bromide": ["Benzylic halide", "Haloalkane", "Halogen"],
  
  //Advanced Groups
  Hydroperoxide: ["Peroxide"],
  Oxetane: ["Ether"],
  Aziridine: ["Amine"], 
  Guanidine: ["Amidine", "Amine"],
  Urea: ["Amide"],
  "Hydroxamic acid": ["Amide"],
  Thioester: ["Ester"],
  Thioamide: ["Amide"],
  Thioketone: ["Ketone"],
  Thioaldehyde: ["Aldehyde"],
  "Phosphodiester": ["Phosphate"],

 
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function namesMatch(a: string, b: string) {
  return normalizeName(a) === normalizeName(b);
}

function shouldSuppressMatch(
  childGroup: FunctionalGroupResult,
  childMatch: FunctionalGroupMatch,
  allGroups: FunctionalGroupResult[]
) {
  for (const [parentName, suppressedNames] of Object.entries(SUPPRESSION_RULES)) {
    const childIsSuppressedType = suppressedNames.some((suppressedName) =>
      namesMatch(childGroup.name, suppressedName)
    );

    if (!childIsSuppressedType) continue;

    const parentGroups = allGroups.filter((group) =>
      namesMatch(group.name, parentName)
    );

    for (const parentGroup of parentGroups) {
      for (const parentMatch of parentGroup.matches ?? []) {
        if (hasAtomOverlap(childMatch.atoms, parentMatch.atoms)) {
          return true;
        }
      }
    }
  }

  return false;
}

export function removeOverlappingGroups(
  groups: FunctionalGroupResult[]
): FunctionalGroupResult[] {
  const filteredGroups = groups
    .map((group) => {
      const remainingMatchIndexes = (group.matches ?? [])
        .map((match, index) => ({ match, index }))
        .filter(({ match }) => !shouldSuppressMatch(group, match, groups))
        .map(({ index }) => index);

      return {
        ...group,
        matches: remainingMatchIndexes.map((index) => group.matches[index]),
        displayMatches: group.displayMatches
          ? remainingMatchIndexes.map((index) => group.displayMatches![index])
          : undefined,
        count: remainingMatchIndexes.length,
      };
    })
    .filter((group) => group.count > 0);

  const meaningfulGroups = filteredGroups.filter(
    (group) => group.name !== "Alkane"
  );

  return meaningfulGroups.length > 0 ? meaningfulGroups : filteredGroups;
}