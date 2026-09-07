import type { ReactionRule } from "../reactionTypes";
import { GRIGNARD_OR_ORGANOLITHIUM_TRIGGER_SMARTS } from "../organometallic";

const acidChlorideTrigger = {
  anyFunctionalGroups: ["Acyl halide"],
  includeSmarts: ["[CX3](=O)[F,Cl,Br,I]"],
};

export const acidChlorideReactionRules: ReactionRule[] = [
  {
    id: "acid-chloride-water",
    family: "acid-chlorides",
    reactionType: "substitution",
    title: "Hydrolysis",
    reagents: "H₂O",
    reagentNote: "Nucleophilic acyl substitution",
    productHint: "Carboxylic acid",
    explanation:
      "Acid chlorides hydrolyze rapidly in water to form carboxylic acids.",
    trigger: acidChlorideTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1](=[O:2])[F,Cl,Br,I:3]>>[C:1](=[O:2])[OH]",
    },
    priority: 1500,
  },

  {
    id: "acid-chloride-alcohol",
    family: "acid-chlorides",
    reactionType: "substitution",
    title: "Alcoholysis",
    reagents: "ROH",
    reagentNote: "Nucleophilic acyl substitution",
    productHint: "Ester",
    explanation:
      "Alcohols react with acid chlorides to produce esters.",
    trigger: acidChlorideTrigger,
    transform: {
      type: "conceptOnly",
      reason: "Draw an alcohol in the same Ketcher canvas to generate the ester through the alcohol-side multi-reactant rule.",
    },
    priority: 1510,
  },

  {
    id: "acid-chloride-amine",
    family: "acid-chlorides",
    reactionType: "substitution",
    title: "Amidation",
    reagents: "Base as needed",
    reagentNote: "Draw an acid chloride and NH₃, a primary amine, or a secondary amine",
    productHint: "Amide",
    explanation:
      "Ammonia and amines convert acid chlorides into amides by nucleophilic acyl substitution.",
    trigger: acidChlorideTrigger,
    additionalReactants: [
      {
        label: "NH₃, primary amine, or secondary amine",
        trigger: {
          includeSmarts: ["[N;H1,H2,H3;!$(N[C,S,P]=O)]"],
        },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts:
        "[C:1](=[O:2])[Cl,Br,I].[N;H1,H2,H3:3]>>[C:1](=[O:2])[N:3]",
    },
    priority: 1520,
  },

  {
    id: "acid-chloride-thiol",
    family: "acid-chlorides",
    reactionType: "substitution",
    title: "Thioester Formation",
    reagents: "RSH or RS⁻, base as needed",
    reagentNote: "Draw the acid chloride and thiol/thiolate as disconnected structures",
    productHint: "Thioester",
    explanation:
      "A thiol or thiolate substitutes for chloride at an acid chloride to form a thioester.",
    trigger: acidChlorideTrigger,
    additionalReactants: [
      { label: "thiol or thiolate", trigger: { includeSmarts: ["[S;H1,-1]"] } },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1](=[O:2])[Cl,Br,I].[S;H1,-1:3]>>[C:1](=[O:2])[S+0:3]",
      maxProducts: 8,
    },
    priority: 1525,
  },
  {
    id: "acid-chloride-carboxylate-anhydride",
    family: "acid-chlorides",
    reactionType: "substitution",
    title: "Anhydride Formation from an Acid Chloride",
    reagents: "Carboxylate salt",
    reagentNote: "Draw the acid chloride and carboxylate as disconnected structures",
    productHint: "Acid anhydride",
    explanation:
      "A carboxylate nucleophile displaces chloride from an acid chloride to form an acid anhydride.",
    trigger: acidChlorideTrigger,
    additionalReactants: [
      { label: "carboxylate", trigger: { includeSmarts: ["[C](=O)[O-]"] } },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1](=[O:2])[Cl,Br,I].[C:3](=[O:4])[O-:5]>>[C:1](=[O:2])[O+0:5][C:3](=[O:4])",
      maxProducts: 8,
    },
    priority: 1527,
  },
  {
    id: "acid-chloride-lah",
    family: "acid-chlorides",
    reactionType: "reduction",
    title: "Reduction",
    reagents: "1) LiAlH₄  2) H₃O⁺",
    reagentNote: "Strong hydride reduction",
    productHint: "Primary alcohol",
    explanation:
      "LiAlH₄ reduces acid chlorides completely to primary alcohols.",
    trigger: acidChlorideTrigger,
    transform: {
      type: "customHandler",
      handler: "reduction",
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
    reactionType: "addition",
    title: "Organometallic Addition",
    reagents: "1) excess RMgCl, RMgBr, RMgI, or RLi  2) H₃O⁺",
    reagentNote: "Double addition",
    productHint: "Tertiary alcohol",
    explanation:
      "Acid chlorides react twice with Grignard or organolithium reagents to form tertiary alcohols.",
    trigger: acidChlorideTrigger,
    additionalReactants: [
      {
        label: "Grignard or organolithium reagent (2 equivalents)",
        trigger: { includeSmarts: [GRIGNARD_OR_ORGANOLITHIUM_TRIGGER_SMARTS] },
        equivalents: 2,
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1](=[O:2])[Cl,Br,I].[#6:5][Mg,Li].[#6:6][Mg,Li]>>[C:1]([OH:2])([#6:5])([#6:6])",
      maxProducts: 8,
    },
    priority: 1540,
  },

  {
    id: "acid-chloride-gilman",
    family: "acid-chlorides",
    reactionType: "substitution",
    title: "Gilman Reagent",
    reagents: "R₂CuLi",
    reagentNote: "Single addition",
    productHint: "Ketone",
    explanation:
      "Gilman reagents convert acid chlorides into ketones without over-addition.",
    trigger: acidChlorideTrigger,
    additionalReactants: [
      {
        label: "Gilman or organocuprate reagent",
        trigger: { includeSmarts: ["[#6][Cu]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1](=[O:2])[Cl,Br,I].[#6:3][Cu]>>[C:1](=[O:2])-[#6:3]",
      maxProducts: 8,
    },
    priority: 1550,
  },
];
