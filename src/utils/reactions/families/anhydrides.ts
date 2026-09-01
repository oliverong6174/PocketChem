import type { ReactionRule } from "../reactionTypes";

const anhydrideTrigger = {
  anyFunctionalGroups: ["Acid anhydride"],
};

export const anhydrideReactionRules: ReactionRule[] = [
  {
    id: "anhydride-hydrolysis",
    family: "anhydrides",
    reactionType: "substitution",
    title: "Anhydride Hydrolysis",
    reagents: "H₂O",
    reagentNote: "Nucleophilic acyl substitution",
    productHint: "Carboxylic acids",
    explanation:
      "Acid anhydrides hydrolyze with water to form carboxylic acids.",
    trigger: anhydrideTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1](=[O:2])O[C:3](=[O:4])>>[C:1](=[O:2])O.[C:3](=[O:4])O",
    },
    priority: 1900,
  },
  {
    id: "anhydride-alcoholysis",
    family: "anhydrides",
    reactionType: "substitution",
    title: "Anhydride Alcoholysis",
    reagents: "ROH",
    reagentNote: "Ester formation",
    productHint: "Ester and carboxylic acid",
    explanation:
      "Alcohols react with acid anhydrides to form esters and carboxylic acids.",
    trigger: anhydrideTrigger,
    additionalReactants: [
      { label: "alcohol", trigger: { includeSmarts: ["[O;H1][#6]"] } },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1](=[O:2])O[C:3](=[O:4]).[O;H1:5][#6:6]>>[C:1](=[O:2])[O:5][#6:6].[C:3](=[O:4])O",
      maxProducts: 8,
    },
    productStatus: "representative",
    limitations: ["Unsymmetrical anhydrides can react at either acyl group; the engine enumerates constitutional products but does not rank acyl transfer selectivity."],
    priority: 1910,
  },
  {
    id: "anhydride-aminolysis",
    family: "anhydrides",
    reactionType: "substitution",
    title: "Anhydride Aminolysis",
    reagents: "NH₃ or RNH₂",
    reagentNote: "Amide formation",
    productHint: "Amide and carboxylic acid",
    explanation:
      "Ammonia or amines react with acid anhydrides to form amides and carboxylic acids.",
    trigger: anhydrideTrigger,
    additionalReactants: [
      {
        label: "ammonia, primary amine, or secondary amine",
        trigger: { includeSmarts: ["[N;H1,H2,H3;!$(N[C,S,P]=O)]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1](=[O:2])O[C:3](=[O:4]).[N;H1,H2,H3:5]>>[C:1](=[O:2])[N:5].[C:3](=[O:4])O",
      maxProducts: 8,
    },
    productStatus: "representative",
    limitations: ["Unsymmetrical anhydrides can react at either acyl group; the engine enumerates constitutional products but does not rank acyl transfer selectivity."],
    priority: 1920,
  },
  {
    id: "anhydride-lah-reduction",
    family: "anhydrides",
    reactionType: "reduction",
    title: "Anhydride Reduction",
    reagents: "1) LiAlH₄  2) H₃O⁺",
    reagentNote: "Strong hydride reduction",
    productHint: "Primary alcohols",
    explanation:
      "LiAlH₄ reduces acid anhydrides to primary alcohols.",
    trigger: anhydrideTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1](=[O:2])O[C:3](=[O:4])>>[CH2:1][OH:2].[CH2:3][OH:4]",
    },
    priority: 1930,
  },
  {
    id: "anhydride-friedel-crafts-acylation",
    family: "anhydrides",
    reactionType: "substitution",
    title: "Friedel-Crafts Acylation",
    reagents: "AlCl₃",
    reagentNote: "Anhydride as acylating reagent",
    productHint: "Aryl ketone",
    explanation:
      "Acid anhydrides can act as acylating reagents in Friedel-Crafts acylation.",
    trigger: anhydrideTrigger,
    additionalReactants: [
      {
        label: "aromatic ring",
        trigger: { includeSmarts: ["[cH]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1](=[O:2])O[C:3](=[O:4]).[cH:5]>>[C:1](=[O:2])-[c:5].[C:3](=[O:4])O",
      maxProducts: 16,
    },
    productStatus: "representative",
    limitations: ["The engine enumerates available aromatic C-H sites and either acyl half of an unsymmetrical anhydride, but does not rank directing effects or acyl-transfer selectivity."],
    priority: 1940,
  },
];
