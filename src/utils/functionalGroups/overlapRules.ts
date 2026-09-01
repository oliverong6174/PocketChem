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
  "Benzylic carbocation": ["Carbocation"],
  "Allylic carbocation": ["Carbocation"],
  "Deprotonated carboxamide": ["Amide anion"],

  // Acid derivatives
  Peroxyacid: ["Carboxylic acid", "Peroxide"],
  "Acid anhydride": ["Ester", "Ether", "Ketone", "Carbonyl"],
  "Carbonate ester": ["Ester", "Ether"],
  Carbamate: [
  "Amide",
  "Primary amide",
  "Secondary amide",
  "Tertiary amide",
  "Ester",
  "Ether"
  ],
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
  "Lactam": ["Cycloalkane", "Amide", "Primary amide", "Secondary amide", "Tertiary amide"],
  "Alpha lactam": ["Lactam", "Cycloalkane", "Amide", "Primary amide", "Secondary amide", "Tertiary amide"],
  "Beta lactam": ["Lactam", "Cycloalkane", "Amide", "Primary amide", "Secondary amide", "Tertiary amide"],
  "Gamma lactam": ["Lactam", "Cycloalkane", "Amide", "Primary amide", "Secondary amide", "Tertiary amide"],
  "Delta lactam": ["Lactam", "Cycloalkane", "Amide", "Primary amide", "Secondary amide", "Tertiary amide"],
  "Epsilon lactam": ["Lactam", "Cycloalkane", "Amide", "Primary amide", "Secondary amide", "Tertiary amide"],

  // Lactims
  "Lactim": ["Cycloalkane", "Enol", "Imine"],
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
  Aniline: ["Benzene", "Aryl amine", "Primary aryl amine","Primary amine", "Amine"],
  "Aryl amine": ["Benzene", "Primary amine", "Amine"],

  //Anilines
  "Primary aryl amine": [
    "Aryl amine",
    "Primary amine",
    "Amine",
  ],

  "Secondary aryl amine": [
    "Aryl amine",
    "Secondary amine",
    "Amine",
  ],

  "Tertiary aryl amine": [
    "Aryl amine",
    "Tertiary amine",
    "Amine",
  ],

  //Nitrogens
  "N-oxide": ["Amine"],
  "Nitrate ester": ["Nitro", "N-oxide"],
  "Nitro": ["N-oxide", "Nitroso", "Amine"],
  Azide: [],

  "Acyl azide": [
  "Azide",
  "Amide",
  "Primary amide",
  "Secondary amide",
  "Tertiary amide",
  "Amine",
  "Primary amine",
  "Secondary amine",
  "Tertiary amine",
],
  Isocyanide: ["Nitrile"],
  Isocyanate: ["Amine", "Primary amine", "Secondary amine", "Tertiary amine"],
  Diazo: ["Amine", "Primary amine", "Secondary amine", "Tertiary amine"],
  Amidine: [
  "Imine",
  "Amine",
  "Primary amine",
  "Secondary amine",
  "Tertiary amine",
],

Guanidine: [
  "Amidine",
  "Imine",
  "Amine",
  "Primary amine",
  "Secondary amine",
  "Tertiary amine",
],

Aldoxime: ["Imine"],
Ketoxime: ["Imine"],
Aminoxime: [
  "Aldoxime",
  "Ketoxime",
  "Imine",
  "Amine",
  "Primary amine",
  "Secondary amine",
  "Tertiary amine",
],

  Urea: [
  "Amide",
  "Primary amide",
  "Secondary amide",
  "Tertiary amide",
  "Amine",
  "Primary amine",
  "Secondary amine",
  "Tertiary amine",
],


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
  Imine: ["Amine", "Primary amine", "Secondary amine", "Tertiary amine"],
  Hydrazone: ["Imine", "Amine", "Primary amine", "Secondary amine", "Tertiary amine"],

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
  Enamide: ["Amide", "Amine", "Primary amine", "Secondary amine", "Tertiary amine", "Alkene"],
  Enamine: ["Amine", "Primary amine", "Secondary amine", "Tertiary amine", "Alkene"],
  Enoate: ["Ester", "Alkene", "Acryloyl group"],



  // Aromatics
  Alkylbenzene: ["Benzene"],
  Toluene: ["Benzene", "Alkylbenzene"],
  "Aryl halide": ["Benzene", "Halogen", "Haloalkane"],
  Nitrobenzene: [
  "Benzene",
  "Nitro",
  "Nitroso",
  "Halogen",
  "Haloalkane"
],
  "Benzenediazonium": ["Aniline", "Benzene", "Diazo", "Amine", "Primary amine", "Secondary amine", "Tertiary amine"],

    Benzaldehyde: [
    "Benzene",
    "Aldehyde",
  ],

  "Benzyl alcohol": [
    "Benzene",
    "Alkylbenzene",
    "Alcohol",
    "Primary alcohol",
  ],

  "Benzyl amine": [
  "Benzene",
  "Alkylbenzene",
  "Amine",
  "Primary amine",
  "Secondary amine",
  "Tertiary amine",
],

  "Benzoic acid": [
    "Benzene",
    "Carboxylic acid",
  ],

  Benzamide: [
    "Benzene",
    "Amide",
    "Primary amide",
    "Secondary amide",
    "Tertiary amide",
    "Amine",
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

  // Sulfur
  Sulfoxide: ["Thioether"],
  Sulfone: ["Sulfoxide", "Thioether"],
  "Sulfonic acid": ["Sulfone"],
    Thioester: ["Ester", "Thioether"],
  Thioamide: [
    "Primary amide",
    "Secondary amide",
    "Tertiary amide",
    "Amide",
    "Primary amine",
    "Secondary amine",
    "Tertiary amine",
    "Amine",
  ],
  Sulfonamide: [
    "Primary amide",
    "Secondary amide",
    "Tertiary amide",
    "Amide",
    "Primary amine",
    "Secondary amine",
    "Tertiary amine",
    "Amine",
  ],
  Thioketone: ["Ketone"],
  Thioaldehyde: ["Aldehyde"],

  //Phosphorus
  "Phosphate ester": ["Phosphate"],

  "Phosphodiester": [
    "Phosphate ester",
    "Phosphate",
  ],

  "Phosphate triester": [
    "Phosphodiester",
    "Phosphate ester",
    "Phosphate",
  ],

  Phosphonate: [
  "Primary phosphine oxide",
  "Secondary phosphine oxide",
  "Tertiary phosphine oxide",
],

"Phosphonate ester": [
  "Phosphonate",
  "Primary phosphine oxide",
  "Secondary phosphine oxide",
  "Tertiary phosphine oxide",
],

"Phosphonate diester": [
  "Phosphonate ester",
  "Phosphonate",
  "Primary phosphine oxide",
  "Secondary phosphine oxide",
  "Tertiary phosphine oxide",
],

Phosphinate: [
  "Phosphonate diester",
  "Phosphonate ester",
  "Phosphonate",
  "Primary phosphine oxide",
  "Secondary phosphine oxide",
  "Tertiary phosphine oxide",
],

  "Phosphine oxide": [
    "Phosphate",
  ],

  "Primary phosphine oxide": [
    "Phosphine oxide",
  ],

  "Secondary phosphine oxide": [
  "Primary phosphine oxide",
  "Phosphine oxide",
],

"Tertiary phosphine oxide": [
  "Secondary phosphine oxide",
  "Primary phosphine oxide",
  "Phosphine oxide",
],


  "Phosphine sulfide": [
    "Thiophosphate ester",
    "Dithiophosphate",
  ],

  "Primary phosphine sulfide": [
  "Phosphine sulfide",
],

"Secondary phosphine sulfide": [
  "Primary phosphine sulfide",
  "Phosphine sulfide",
],

"Tertiary phosphine sulfide": [
  "Secondary phosphine sulfide",
  "Primary phosphine sulfide",
  "Phosphine sulfide",
],

"Thiophosphate ester": [
  "Phosphine sulfide",
  "Primary phosphine sulfide",
  "Secondary phosphine sulfide",
  "Tertiary phosphine sulfide",
  "Phosphate ester",
  "Phosphate",
],

Dithiophosphate: [
  "Thiophosphate ester",
  "Phosphine sulfide",
  "Primary phosphine sulfide",
  "Secondary phosphine sulfide",
  "Tertiary phosphine sulfide",
  "Phosphate ester",
  "Phosphate",
],



  Phosphoramidate: [
    "Phosphate",
    "Phosphine oxide",
    "Amine",
    "Primary amine",
    "Secondary amine",
    "Tertiary amine",
    "Primary phosphine oxide",
  "Secondary phosphine oxide",
  "Tertiary phosphine oxide",
  ],

  Phosphoramidite: [
  "Phosphine",
  "Amine",
  "Primary amine",
  "Secondary amine",
  "Tertiary amine",
],

  //Cycloalkanes
  Cyclopropane: ["Cycloalkane", "Alkane"],
  Cyclobutane: ["Cycloalkane", "Alkane"],
  Cyclopentane: ["Cycloalkane", "Alkane"],
  Cyclohexane: ["Cycloalkane", "Alkane"],
  Cycloalkene: ["Alkene"],
  Cycloalkyne: ["Alkyne"],

  //Boron and Silicon
    // Boron
  Alkylborane: [
    "Organoboron",
  ],

  "Boronic acid": [
    "Organoboron",
  ],

  "Boronate monoester": [
    "Boronic acid",
    "Organoboron",
  ],

  "Boronate ester": [
    "Boronate monoester",
    "Boronic acid",
    "Organoboron",
  ],

  "Borinic acid": [
    "Organoboron",
  ],

  "Borinic ester": [
    "Borinic acid",
    "Organoboron",
  ],

  "Borate ester": [
    "Organoboron",
  ],

  Organotrifluoroborate: [
    "Organoboron",
    "Halogen",
  ],

  // Silicon
  Silane: [
    "Organosilicon",
  ],

  "Silyl ether": [
    "Silane",
    "Organosilicon",
  ],

  "Silyl enol ether": [
    "Silyl ether",
    "Silane",
    "Organosilicon",
    "Alkene",
  ],

  Silanol: [
    "Silane",
    "Organosilicon",
  ],

  Siloxane: [
    "Silanol",
    "Silane",
    "Organosilicon",
  ],

  "Silyl halide": [
    "Silane",
    "Organosilicon",
    "Halogen",
  ],

  Disilane: [
    "Silane",
    "Organosilicon",
  ],

  //Halogens
"Vinyl halide": [
  "Halogen",
  "Alkene"
],

"Allylic halide": [
  "Haloalkane",
  "Halogen",
  "Alkene",
],

"Benzyl halide": [
  "Benzene",
  "Alkylbenzene",
  "Haloalkane",
  "Halogen",
],

"Geminal dihalide": [
  "Haloalkane",
  "Halogen",
],

"Vicinal dihalide": [
  "Haloalkane",
  "Halogen",
],
  
  //Advanced Groups
  Hydroperoxide: ["Peroxide"],
  Oxetane: ["Ether"],
  Aziridine: ["Amine"], 
  "Hydroxamic acid": ["Amide"],

 
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