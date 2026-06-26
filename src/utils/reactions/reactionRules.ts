import type { ReactionRule } from "./reactionTypes";

export const legacyReactionRules: ReactionRule[] = [
  {
    id: "carboxylic-acid-reduction",
    family: "legacy-carboxylic-acids",
    title: "Carboxylic Acid Reduction",
    reagents: "LiAlH₄",
    reagentNote: "Strong reducing agent",
    productHint: "Primary alcohol",
    explanation:
      "LiAlH₄ reduces the carboxylic acid group to a primary alcohol.",
    trigger: { functionalGroups: ["Carboxylic acid", "Benzoic acid derivative"] },
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[O:3]>>[C:1][O:3]",
    },
    priority: 1000,
  },

  {
    id: "carbonyl-reduction",
    family: "legacy-carbonyls",
    title: "Carbonyl Reduction",
    reagents: "NaBH₄",
    reagentNote: "Hydride donor",
    productHint: "Alcohol",
    explanation:
      "The aldehyde or ketone carbonyl is reduced to an alcohol.",
    trigger: {
      functionalGroups: [
        "Aldehyde",
        "Ketone",
        "Aryl ketone",
        "Benzaldehyde derivative",
      ],
    },
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[O:2]>>[C:1]-[O:2]",
    },
    priority: 1010,
  },

  {
    id: "ester-hydrolysis",
    family: "legacy-carboxylic-acid-derivatives",
    title: "Ester Hydrolysis",
    reagents: "H₃O⁺, heat",
    reagentNote: "Acidic hydrolysis",
    productHint: "Carboxylic acid",
    explanation:
      "The ester is hydrolyzed to a carboxylic acid derivative on the acyl side.",
    trigger: { functionalGroups: ["Ester"] },
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[O:3][C:4]>>[C:1](=[O:2])[O:3]",
    },
    priority: 1020,
  },

  {
    id: "amide-hydrolysis",
    family: "legacy-carboxylic-acid-derivatives",
    title: "Amide Hydrolysis",
    reagents: "H₃O⁺, heat",
    reagentNote: "Strong conditions",
    productHint: "Carboxylic acid",
    explanation:
      "The amide is hydrolyzed to a carboxylic acid derivative on the acyl side.",
    trigger: { functionalGroups: ["Amide"] },
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[N:3]>>[C:1](=[O:2])O",
    },
    priority: 1030,
  },
];