import type { ReactionRule } from "../reactionTypes";

const anhydrideTrigger = {
  anyFunctionalGroups: ["Acid anhydride"],
};

export const anhydrideReactionRules: ReactionRule[] = [
  {
    id: "anhydride-hydrolysis",
    family: "anhydrides",
    title: "Anhydride Hydrolysis",
    reagents: "H₂O",
    reagentNote: "Nucleophilic acyl substitution",
    productHint: "Carboxylic acids",
    explanation:
      "Acid anhydrides hydrolyze with water to form carboxylic acids.",
    trigger: anhydrideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])O[C:3](=[O:4])>>[C:1](=[O:2])O.[C:3](=[O:4])O",
    },
    priority: 1900,
  },
  {
    id: "anhydride-alcoholysis",
    family: "anhydrides",
    title: "Anhydride Alcoholysis",
    reagents: "ROH",
    reagentNote: "Ester formation",
    productHint: "Ester and carboxylic acid",
    explanation:
      "Alcohols react with acid anhydrides to form esters and carboxylic acids.",
    trigger: anhydrideTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The alcohol substituent must be specified before an exact ester can be generated.",
    },
    priority: 1910,
  },
  {
    id: "anhydride-aminolysis",
    family: "anhydrides",
    title: "Anhydride Aminolysis",
    reagents: "NH₃ or RNH₂",
    reagentNote: "Amide formation",
    productHint: "Amide and carboxylic acid",
    explanation:
      "Ammonia or amines react with acid anhydrides to form amides and carboxylic acids.",
    trigger: anhydrideTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The amine substituent must be specified before an exact amide can be generated.",
    },
    priority: 1920,
  },
  {
    id: "anhydride-lah-reduction",
    family: "anhydrides",
    title: "Anhydride Reduction",
    reagents: "1) LiAlH₄  2) H₃O⁺",
    reagentNote: "Strong hydride reduction",
    productHint: "Primary alcohols",
    explanation:
      "LiAlH₄ reduces acid anhydrides to primary alcohols.",
    trigger: anhydrideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])O[C:3](=[O:4])>>[CH2:1][OH:2].[CH2:3][OH:4]",
    },
    priority: 1930,
  },
  {
    id: "anhydride-friedel-crafts-acylation",
    family: "anhydrides",
    title: "Friedel-Crafts Acylation",
    reagents: "AlCl₃",
    reagentNote: "Anhydride as acylating reagent",
    productHint: "Aryl ketone",
    explanation:
      "Acid anhydrides can act as acylating reagents in Friedel-Crafts acylation.",
    trigger: anhydrideTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The aromatic reaction partner and substitution position must be specified.",
    },
    priority: 1940,
  },
];
