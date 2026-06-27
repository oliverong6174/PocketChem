import type { ReactionRule } from "../reactionTypes";

const esterTrigger = {
  functionalGroups: ["Ester"],
};

export const esterReactionRules: ReactionRule[] = [
  {
    id: "ester-acid-hydrolysis",
    family: "esters",
    title: "Acidic Ester Hydrolysis",
    reagents: "H₃O⁺, heat",
    reagentNote: "Reverse of Fischer esterification",
    productHint: "Carboxylic acid and alcohol",
    explanation:
      "Esters hydrolyze under acidic conditions to form a carboxylic acid and an alcohol.",
    trigger: esterTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[O:3][C:4]>>[C:1](=[O:2])[OH].[C:4][OH]",
    },
    priority: 1400,
  },
  {
    id: "ester-base-hydrolysis",
    family: "esters",
    title: "Saponification",
    reagents: "NaOH, H₂O",
    reagentNote: "Base-promoted ester hydrolysis",
    productHint: "Carboxylate and alcohol",
    explanation:
      "Esters react with hydroxide to form a carboxylate salt and an alcohol.",
    trigger: esterTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[O:3][C:4]>>[C:1](=[O:2])[O-].[C:4][OH]",
    },
    priority: 1410,
  },
  {
    id: "ester-lah-reduction",
    family: "esters",
    title: "Ester Reduction",
    reagents: "1) LiAlH₄  2) H₃O⁺",
    reagentNote: "Strong hydride reduction",
    productHint: "Primary alcohols",
    explanation:
      "LiAlH₄ reduces esters to alcohols. NaBH₄ is usually not strong enough.",
    trigger: esterTrigger,
    transform: {
      type: "engineHandler",
      handler: "addition",
      options: {
        mode: "oneTwoAddition",
        nucleophile: "hydride",
      },
    },
    priority: 1420,
  },
  {
    id: "ester-grignard-addition",
    family: "esters",
    title: "Organometallic Addition",
    reagents: "1) excess RMgBr, RMgCl, or RLi  2) H₃O⁺",
    reagentNote: "Double addition",
    productHint: "Tertiary alcohol",
    explanation:
      "Esters react twice with Grignard or organolithium reagents to form tertiary alcohols after acidic workup.",
    trigger: esterTrigger,
    transform: {
      type: "engineHandler",
      handler: "addition",
      options: {
        mode: "oneTwoAddition",
        nucleophile: "organometallic",
      },
    },
    priority: 1430,
  },
  {
    id: "ester-transesterification",
    family: "esters",
    title: "Transesterification",
    reagents: "ROH, H⁺ or RO⁻",
    reagentNote: "Alcohol exchange",
    productHint: "New ester",
    explanation:
      "Esters can exchange their alkoxy group with another alcohol under acid or base catalysis.",
    trigger: esterTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[O:3][C:4]>>[C:1](=[O:2])OC",
    },
    priority: 1440,
  },
  {
    id: "ester-aminolysis",
    family: "esters",
    title: "Aminolysis",
    reagents: "NH₃ or RNH₂",
    reagentNote: "Nucleophilic acyl substitution",
    productHint: "Amide",
    explanation:
      "Esters react with ammonia or amines to form amides.",
    trigger: esterTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[O:3][C:4]>>[C:1](=[O:2])N",
    },
    priority: 1450,
  },
  {
    id: "ester-claisen-condensation",
    family: "esters",
    title: "Claisen Condensation",
    reagents: "1) RO⁻  2) H₃O⁺",
    reagentNote: "Requires alpha hydrogens",
    productHint: "Beta-keto ester",
    explanation:
      "Esters with alpha hydrogens undergo Claisen condensation to form beta-keto esters.",
    trigger: esterTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[O:3][C:4]>>[C:1](=[O:2])CC(=O)OC",
    },
    priority: 1460,
  },
];