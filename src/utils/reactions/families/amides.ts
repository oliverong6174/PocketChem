import type { ReactionRule } from "../reactionTypes";

const amideTrigger = {
  functionalGroups: ["Amide"],
};

export const amideReactionRules: ReactionRule[] = [
  {
    id: "amide-hydrolysis-acidic",
    family: "amides",
    title: "Acidic Amide Hydrolysis",
    reagents: "H₃O⁺, heat",
    reagentNote: "Strong acidic hydrolysis",
    productHint: "Carboxylic acid",
    explanation:
      "Amides hydrolyze under strong acidic conditions to form carboxylic acids.",
    trigger: amideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[N:3]>>[C:1](=[O:2])O",
    },
    priority: 1600,
  },
  {
    id: "amide-hydrolysis-basic",
    family: "amides",
    title: "Basic Amide Hydrolysis",
    reagents: "NaOH, heat",
    reagentNote: "Strong basic hydrolysis",
    productHint: "Carboxylate",
    explanation:
      "Amides hydrolyze under strong basic conditions to form carboxylates.",
    trigger: amideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[N:3]>>[C:1](=[O:2])[O-]",
    },
    priority: 1610,
  },
  {
    id: "amide-lah-reduction",
    family: "amides",
    title: "Amide Reduction",
    reagents: "1) LiAlH₄  2) H₃O⁺",
    reagentNote: "Strong hydride reduction",
    productHint: "Amine",
    explanation:
      "LiAlH₄ reduces amides to amines by removing the carbonyl oxygen.",
    trigger: amideTrigger,
    transform: {
      type: "engineHandler",
      handler: "addition",
      options: {
        mode: "oneTwoAddition",
        nucleophile: "hydride",
      },
    },
    priority: 1620,
  },
  {
    id: "amide-dehydration-nitrile",
    family: "amides",
    title: "Amide Dehydration",
    reagents: "SOCl₂, POCl₃, or P₂O₅",
    reagentNote: "Dehydration",
    productHint: "Nitrile",
    explanation:
      "Primary amides can dehydrate to nitriles using strong dehydrating reagents.",
    trigger: amideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[NH2:3]>>[C:1]#N",
    },
    priority: 1630,
  },
  {
    id: "amide-hofmann-rearrangement",
    family: "amides",
    title: "Hofmann Rearrangement",
    reagents: "Br₂, NaOH",
    reagentNote: "Loss of carbonyl carbon",
    productHint: "Amine with one fewer carbon",
    explanation:
      "Primary amides undergo Hofmann rearrangement to form amines with one fewer carbon.",
    trigger: amideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[NH2:3]>>[NH2:3]",
    },
    priority: 1640,
  },
];