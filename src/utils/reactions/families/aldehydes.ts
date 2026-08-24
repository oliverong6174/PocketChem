import type { ReactionRule } from "../reactionTypes";

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
    title: "Aldehyde Reduction",
    reagents: "NaBH₄ or LiAlH₄, then H₃O⁺",
    reagentNote: "Hydride reduction",
    productHint: "Primary alcohol",
    explanation:
      "Hydride reagents reduce aldehydes to primary alcohols.",
    trigger: aldehydeTrigger,
    transform: {
      type: "engineHandler",
      handler: "addition",
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
    title: "Organometallic Addition",
    reagents: "1) RMgBr, RMgCl, or RLi  2) H₃O⁺",
    reagentNote: "Grignard and organolithium addition",
    productHint: "Secondary alcohol",
    explanation:
      "Grignard and organolithium reagents add to aldehydes to form secondary alcohols after acidic workup. Formaldehyde gives primary alcohols.",
    trigger: aldehydeTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The Grignard or organolithium carbon group must be specified before an exact alcohol can be generated.",
    },
    priority: 910,
  },
  {
    id: "aldehyde-oxidation",
    family: "aldehydes",
    title: "Aldehyde Oxidation",
    reagents: "KMnO₄, CrO₃/H₃O⁺, Ag₂O, or Tollens reagent",
    reagentNote: "Oxidation to carboxylic acid",
    productHint: "Carboxylic acid",
    explanation:
      "Aldehydes are easily oxidized to carboxylic acids.",
    trigger: aldehydeTrigger,
    transform: {
      type: "engineHandler",
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
    title: "Aldehyde Hydration",
    reagents: "H₂O, acid or base",
    reagentNote: "Nucleophilic addition of water",
    productHint: "Geminal diol",
    explanation:
      "Water adds reversibly to aldehydes to form geminal diols.",
    trigger: aldehydeTrigger,
    transform: {
      type: "engineHandler",
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
    title: "Cyanohydrin Formation",
    reagents: "HCN, NaCN/HCl",
    reagentNote: "CN⁻ addition",
    productHint: "Cyanohydrin",
    explanation:
      "Cyanide adds to aldehydes followed by protonation to form cyanohydrins.",
    trigger: aldehydeTrigger,
    transform: {
    type: "engineHandler",
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
    title: "Acetal Formation",
    reagents: "ROH, H⁺",
    reagentNote: "Acid-catalyzed addition of alcohol",
    productHint: "Acetal",
    explanation:
      "Aldehydes react with alcohols under acidic conditions to form acetals through hemiacetal intermediates.",
    trigger: aldehydeTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The alcohol identity must be specified before an exact acetal can be generated.",
    },
    priority: 960,
  },
  {
    id: "aldehyde-imine-formation",
    family: "aldehydes",
    title: "Imine Formation",
    reagents: "Primary amine, acid catalyst",
    reagentNote: "Condensation with primary amine",
    productHint: "Imine",
    explanation:
      "Aldehydes react with primary amines to form imines through dehydration.",
    trigger: aldehydeTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The primary amine substituent must be specified before an exact imine can be generated.",
    },
    priority: 970,
  },
  {
    id: "aldehyde-enamine-formation",
    family: "aldehydes",
    title: "Enamine Formation",
    reagents: "Secondary amine, acid catalyst",
    reagentNote: "Condensation with secondary amine",
    productHint: "Enamine",
    explanation:
      "Aldehydes with alpha hydrogens can react with secondary amines to form enamines.",
    trigger: aldehydeTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The secondary amine substituents must be specified before an exact enamine can be generated.",
    },
    priority: 980,
  },
  {
    id: "aldehyde-oxime-formation",
    family: "aldehydes",
    title: "Oxime Formation",
    reagents: "NH₂OH",
    reagentNote: "Condensation with hydroxylamine",
    productHint: "Oxime",
    explanation:
      "Aldehydes react with hydroxylamine to form oximes.",
    trigger: aldehydeTrigger,
      transform: {
    type: "engineHandler",
    handler: "condensation",
    options: {
      mode: "oximeFormation",
    },
  },
    priority: 990,
  },
  {
    id: "aldehyde-hydrazone-formation",
    family: "aldehydes",
    title: "Hydrazone Formation",
    reagents: "NH₂NH₂ or substituted hydrazine",
    reagentNote: "Condensation with hydrazine",
    productHint: "Hydrazone",
    explanation:
      "Aldehydes react with hydrazines to form hydrazones.",
    trigger: aldehydeTrigger,
    transform: {
      type: "conceptOnly",
      reason: "A substituted hydrazine can change the product; specify it for an exact structure.",
    },
    priority: 1000,
  },
  {
    id: "aldehyde-wolff-kishner",
    family: "aldehydes",
    title: "Wolff-Kishner Reduction",
    reagents: "NH₂NH₂, KOH, heat",
    reagentNote: "Carbonyl to alkane",
    productHint: "Alkane",
    explanation:
      "Wolff-Kishner reduction converts aldehydes to alkanes under strongly basic conditions.",
    trigger: aldehydeTrigger,
    transform: {
      type: "engineHandler",
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
    title: "Clemmensen Reduction",
    reagents: "Zn(Hg), HCl",
    reagentNote: "Carbonyl to alkane",
    productHint: "Alkane",
    explanation:
      "Clemmensen reduction converts aldehydes to alkanes under acidic conditions.",
    trigger: aldehydeTrigger,
    transform: {
      type: "engineHandler",
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
    title: "Wittig Reaction",
    reagents: "Ph₃P=CHR",
    reagentNote: "Carbonyl alkene formation",
    productHint: "Alkene",
    explanation:
      "Wittig reagents convert aldehydes into alkenes.",
    trigger: aldehydeTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The ylide substituent must be specified before an exact alkene can be generated.",
    },
    priority: 1030,
  },
  {
    id: "aldehyde-cannizzaro",
    family: "aldehydes",
    title: "Cannizzaro Reaction",
    reagents: "concentrated NaOH",
    reagentNote: "No alpha hydrogens",
    productHint: "Alcohol and carboxylate",
    explanation:
      "Aldehydes without alpha hydrogens can disproportionate under strong base to give an alcohol and carboxylate.",
    trigger: { ...aldehydeTrigger, excludeSmarts: ["[C;H1,H2,H3][CX3H1](=O)"] },
    transform: {
      type: "conceptOnly",
      reason: "Cannizzaro disproportionation consumes two aldehyde molecules; the one-reactant engine does not duplicate stoichiometric reactants.",
    },
    priority: 1060,
  },
];
