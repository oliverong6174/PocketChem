import type { ReactionRule } from "../reactionTypes";
import { GRIGNARD_OR_ORGANOLITHIUM_TRIGGER_SMARTS } from "../organometallic";

const aldehydeTrigger = {
  anyFunctionalGroups: [
    "Aldehyde",
    "Benzaldehyde",
    "Cinnamaldehyde",
    "Crotonaldehyde",
    "Acrolein",
    "Enal",
  ],
};

export const aldehydeReactionRules: ReactionRule[] = [
    {
    id: "aldehyde-reduction",
    family: "aldehydes",
    reactionType: "reduction",
    title: "Aldehyde Reduction",
    reagents: "NaBH₄ or LiAlH₄, then H₃O⁺",
    reagentNote: "Hydride reduction",
    productHint: "Primary alcohol",
    explanation:
      "Hydride reagents reduce aldehydes to primary alcohols.",
    trigger: aldehydeTrigger,
    transform: {
      type: "customHandler",
      handler: "reduction",
      options: {
        mode: "oneTwoAddition",
        nucleophile: "hydride",
      },
    },
    priority: 900,
  },
  {
    id: "aldehyde-organometallic-addition",
    family: "aldehydes",
    reactionType: "addition",
    title: "Organometallic Addition",
    reagents: "1) RMgCl, RMgBr, RMgI, or RLi  2) H₃O⁺",
    reagentNote: "Grignard and organolithium addition",
    productHint: "Secondary alcohol",
    explanation:
      "Grignard and organolithium reagents add to aldehydes to form secondary alcohols after acidic workup. Formaldehyde gives primary alcohols.",
    trigger: aldehydeTrigger,
    additionalReactants: [
      {
        label: "Grignard or organolithium reagent",
        trigger: { includeSmarts: [GRIGNARD_OR_ORGANOLITHIUM_TRIGGER_SMARTS] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[O:2].[#6:3][Mg,Li]>>[C:1]([OH:2])-[#6:3]",
      maxProducts: 8,
    },
    priority: 910,
  },
  {
    id: "aldehyde-oxidation",
    family: "aldehydes",
    reactionType: "oxidation",
    title: "Aldehyde Oxidation",
    reagents: "KMnO4, CrO₃/H₃O⁺, Ag₂O, or Tollens reagent",
    reagentNote: "Oxidation to carboxylic acid",
    productHint: "Carboxylic acid",
    explanation:
      "Aldehydes are easily oxidized to carboxylic acids.",
    trigger: aldehydeTrigger,
    transform: {
      type: "customHandler",
      handler: "oxidation",
      options: {
        mode: "aldehydeOxidation",
      },
    },
    priority: 930,
  },
  {
    id: "aldehyde-hydration",
    family: "aldehydes",
    reactionType: "addition",
    title: "Aldehyde Hydration",
    reagents: "H₂O, acid or base",
    reagentNote: "Nucleophilic addition of water",
    productHint: "Geminal diol",
    explanation:
      "Water adds reversibly to aldehydes to form geminal diols.",
    trigger: aldehydeTrigger,
    transform: {
      type: "customHandler",
      handler: "addition",
      options: {
        mode: "oneTwoAddition",
        nucleophile: "water",
      },
    },
    priority: 940,
  },
  {
    id: "aldehyde-cyanohydrin",
    family: "aldehydes",
    reactionType: "addition",
    title: "Cyanohydrin Formation",
    reagents: "HCN, NaCN/HCl",
    reagentNote: "CN⁻ addition",
    productHint: "Cyanohydrin",
    explanation:
      "Cyanide adds to aldehydes followed by protonation to form cyanohydrins.",
    trigger: aldehydeTrigger,
    transform: {
    type: "customHandler",
      handler: "addition",
    options: {
      mode: "oneTwoAddition",
      nucleophile: "cyanide",
    },
  },
    priority: 950,
  },
  {
    id: "aldehyde-acetal-formation",
    family: "aldehydes",
    reactionType: "condensation",
    title: "Acetal Formation",
    reagents: "ROH, H⁺",
    reagentNote: "Acid-catalyzed addition of alcohol",
    productHint: "Acetal",
    explanation:
      "Aldehydes react with alcohols under acidic conditions to form acetals through hemiacetal intermediates.",
    trigger: aldehydeTrigger,
    additionalReactants: [
      {
        label: "alcohol (2 equivalents)",
        trigger: { includeSmarts: ["[O;H1][#6]"] },
        equivalents: 2,
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[O:2].[O;H1:3][#6:4].[O;H1:5][#6:6]>>[C:1]([O:3][#6:4])([O:5][#6:6])",
      maxProducts: 8,
    },
    priority: 960,
  },
  {
    id: "aldehyde-imine-formation",
    family: "aldehydes",
    reactionType: "condensation",
    title: "Imine Formation",
    reagents: "Primary amine, acid catalyst",
    reagentNote: "Condensation with primary amine",
    productHint: "Imine",
    explanation:
      "Aldehydes react with primary amines to form imines through dehydration.",
    trigger: aldehydeTrigger,
    additionalReactants: [
      {
        label: "primary amine or ammonia",
        trigger: { includeSmarts: ["[N;H2,H3;!$(N[C,S,P]=O)]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[O:2].[N;H2,H3:3]>>[C:1]=[N:3]",
      maxProducts: 8,
    },
    priority: 970,
  },
  {
    id: "aldehyde-enamine-formation",
    family: "aldehydes",
    reactionType: "condensation",
    title: "Enamine Formation",
    reagents: "Secondary amine, acid catalyst",
    reagentNote: "Condensation with secondary amine",
    productHint: "Enamine",
    explanation:
      "Aldehydes with alpha hydrogens can react with secondary amines to form enamines.",
    trigger: { ...aldehydeTrigger, includeSmarts: ["[C;H1,H2,H3][C](=O)"] },
    additionalReactants: [
      {
        label: "secondary amine",
        trigger: { includeSmarts: ["[N;H1;+0;X3;!$(N[C,S,P]=O)]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C;H1,H2,H3:6][C:1](=[O:2]).[N;H1:3]>>[C:6]=[C:1]-[N:3]",
      maxProducts: 12,
    },
    productStatus: "representative",
    limitations: ["The carbonyl must contain an alpha hydrogen. Unsymmetrical carbonyl compounds can form more than one constitutional enamine, and E/Z geometry is not assigned."],
    priority: 980,
  },
  {
    id: "aldehyde-oxime-formation",
    family: "aldehydes",
    reactionType: "condensation",
    title: "Oxime Formation",
    reagents: "NH₂OH",
    reagentNote: "Condensation with hydroxylamine",
    productHint: "Oxime",
    explanation:
      "Aldehydes react with hydroxylamine to form oximes.",
    trigger: aldehydeTrigger,
      transform: {
    type: "customHandler",
      handler: "carbonyl",
    options: {
      mode: "oximeFormation",
    },
  },
    priority: 990,
  },
  {
    id: "aldehyde-hydrazone-formation",
    family: "aldehydes",
    reactionType: "condensation",
    title: "Hydrazone Formation",
    reagents: "NH₂NH₂ or substituted hydrazine",
    reagentNote: "Condensation with hydrazine",
    productHint: "Hydrazone",
    explanation:
      "Aldehydes react with hydrazines to form hydrazones.",
    trigger: aldehydeTrigger,
    additionalReactants: [
      {
        label: "hydrazine or substituted hydrazine",
        trigger: { includeSmarts: ["[N;H1,H2][N]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[O:2].[N;H1,H2:3][N:4]>>[C:1]=[N:3][N:4]",
      maxProducts: 8,
    },
    priority: 1000,
  },
  {
    id: "aldehyde-wolff-kishner",
    family: "aldehydes",
    reactionType: "reduction",
    title: "Wolff-Kishner Reduction",
    reagents: "NH₂NH₂, KOH, heat",
    reagentNote: "Carbonyl to alkane",
    productHint: "Alkane",
    explanation:
      "Wolff-Kishner reduction converts aldehydes to alkanes under strongly basic conditions.",
    trigger: aldehydeTrigger,
    transform: {
      type: "customHandler",
      handler: "reduction",
      options: {
        mode: "carbonylToAlkane",
      },
    },
    priority: 1010,
  },
  {
    id: "aldehyde-clemmensen",
    family: "aldehydes",
    reactionType: "reduction",
    title: "Clemmensen Reduction",
    reagents: "Zn(Hg), HCl",
    reagentNote: "Carbonyl to alkane",
    productHint: "Alkane",
    explanation:
      "Clemmensen reduction converts aldehydes to alkanes under acidic conditions.",
    trigger: aldehydeTrigger,
    transform: {
      type: "customHandler",
      handler: "reduction",
      options: {
        mode: "carbonylToAlkane",
      },
    },
    priority: 1020,
  },
  {
    id: "aldehyde-wittig",
    family: "aldehydes",
    reactionType: "coupling",
    title: "Wittig Reaction",
    reagents: "Ph₃P=CHR",
    reagentNote: "Carbonyl alkene formation",
    productHint: "Alkene",
    explanation:
      "Wittig reagents convert aldehydes into alkenes.",
    trigger: aldehydeTrigger,
    additionalReactants: [
      {
        label: "phosphorus ylide",
        trigger: { includeSmarts: ["[C-][P+]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[O:2].[C-:3][P+:4]>>[C:1]=[C+0:3]",
      maxProducts: 8,
    },
    productStatus: "representative",
    priority: 1030,
  },
  {
    id: "aldehyde-cannizzaro",
    family: "aldehydes",
    reactionType: "oxidation",
    title: "Cannizzaro Reaction",
    reagents: "concentrated NaOH",
    reagentNote: "No alpha hydrogens",
    productHint: "Alcohol and carboxylate",
    explanation:
      "Aldehydes without alpha hydrogens can disproportionate under strong base to give an alcohol and carboxylate.",
    trigger: { ...aldehydeTrigger, excludeSmarts: ["[C;H1,H2,H3][CX3H1](=O)"] },
    additionalReactants: [
      {
        label: "second aldehyde without alpha hydrogens",
        trigger: {
          includeSmarts: ["[CX3H1](=O)"],
          excludeSmarts: ["[C;H1,H2,H3][CX3H1](=O)"],
        },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C;H1:1]=[O:2].[C;H1:3]=[O:4]>>[CH2:1][OH:2].[C:3](=[O:4])[O-]",
      maxProducts: 8,
    },
    productStatus: "representative",
    limitations: ["For crossed Cannizzaro reactions the engine can enumerate which aldehyde is oxidized versus reduced, but does not rank hydride-transfer preference."],
    priority: 1060,
  },
];
