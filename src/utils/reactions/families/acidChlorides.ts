import type { ReactionRule } from "../reactionTypes";

const acidChlorideTrigger = {
  functionalGroups: ["Acid chloride"],
};

export const acidChlorideReactionRules: ReactionRule[] = [
  {
    id: "acid-chloride-water",
    family: "acid-chlorides",
    title: "Hydrolysis",
    reagents: "H₂O",
    reagentNote: "Nucleophilic acyl substitution",
    productHint: "Carboxylic acid",
    explanation:
      "Acid chlorides hydrolyze rapidly in water to form carboxylic acids.",
    trigger: acidChlorideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[Cl:3]>>[C:1](=[O:2])[OH]",
    },
    priority: 1500,
  },

  {
    id: "acid-chloride-alcohol",
    family: "acid-chlorides",
    title: "Alcoholysis",
    reagents: "ROH",
    reagentNote: "Nucleophilic acyl substitution",
    productHint: "Ester",
    explanation:
      "Alcohols react with acid chlorides to produce esters.",
    trigger: acidChlorideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[Cl:3]>>[C:1](=[O:2])OC",
    },
    priority: 1510,
  },

  {
    id: "acid-chloride-amine",
    family: "acid-chlorides",
    title: "Amidation",
    reagents: "NH₃ or RNH₂",
    reagentNote: "Nucleophilic acyl substitution",
    productHint: "Amide",
    explanation:
      "Ammonia and amines convert acid chlorides into amides.",
    trigger: acidChlorideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[Cl:3]>>[C:1](=[O:2])N",
    },
    priority: 1520,
  },

  {
    id: "acid-chloride-lah",
    family: "acid-chlorides",
    title: "Reduction",
    reagents: "1) LiAlH₄  2) H₃O⁺",
    reagentNote: "Strong hydride reduction",
    productHint: "Primary alcohol",
    explanation:
      "LiAlH₄ reduces acid chlorides completely to primary alcohols.",
    trigger: acidChlorideTrigger,
    transform: {
      type: "engineHandler",
      handler: "addition",
      options: {
        mode: "oneTwoAddition",
        nucleophile: "hydride",
      },
    },
    priority: 1530,
  },

  {
    id: "acid-chloride-grignard",
    family: "acid-chlorides",
    title: "Organometallic Addition",
    reagents: "1) excess RMgBr, RMgCl, or RLi  2) H₃O⁺",
    reagentNote: "Double addition",
    productHint: "Tertiary alcohol",
    explanation:
      "Acid chlorides react twice with Grignard or organolithium reagents to form tertiary alcohols.",
    trigger: acidChlorideTrigger,
    transform: {
      type: "engineHandler",
      handler: "addition",
      options: {
        mode: "oneTwoAddition",
        nucleophile: "organometallic",
      },
    },
    priority: 1540,
  },

  {
    id: "acid-chloride-gilman",
    family: "acid-chlorides",
    title: "Gilman Reagent",
    reagents: "R₂CuLi",
    reagentNote: "Single addition",
    productHint: "Ketone",
    explanation:
      "Gilman reagents convert acid chlorides into ketones without over-addition.",
    trigger: acidChlorideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[Cl:3]>>[C:1](=[O:2])C",
    },
    priority: 1550,
  },
];