import type { ReactionRule } from "../reactionTypes";

const acyclicEsterTrigger = {
  anyFunctionalGroups: ["Ester", "Enoate"],
  includeSmarts: ["[CX3](=O)[OX2;R0][#6]"],
};

const lactoneTrigger = {
  anyFunctionalGroups: [
    "Lactone",
    "Alpha lactone",
    "Beta lactone",
    "Gamma lactone",
    "Delta lactone",
    "Epsilon lactone",
  ],
  includeSmarts: ["[CX3;R](=O)[OX2;R]"],
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
      "An ester hydrolyzes under aqueous acidic conditions to a carboxylic acid and an alcohol.",
    trigger: acyclicEsterTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[O:3][C:4]>>[C:1](=[O:2])[OH:3].[C:4]O",
    },
    mechanism: "Nucleophilic acyl substitution",
    priority: 1400,
  },
  {
    id: "lactone-acid-hydrolysis",
    family: "esters",
    title: "Lactone Hydrolysis",
    reagents: "H₃O⁺, heat",
    reagentNote: "Acid-catalyzed ring opening",
    productHint: "Hydroxy carboxylic acid",
    explanation:
      "Hydrolysis cleaves the acyl–oxygen bond of a lactone and opens the ring to a hydroxy carboxylic acid.",
    trigger: lactoneTrigger,
    transform: {
      type: "conceptOnly",
      reason: "Generic ring opening must preserve the entire variable-length ring path; that atom mapping is not represented by a single one-reactant SMARTS template yet.",
    },
    mechanism: "Nucleophilic acyl substitution",
    priority: 1402,
  },
  {
    id: "ester-base-hydrolysis",
    family: "esters",
    title: "Saponification",
    reagents: "1) NaOH, H₂O, heat  2) optional H₃O⁺",
    reagentNote: "Irreversible base-promoted hydrolysis",
    productHint: "Carboxylate and alcohol",
    explanation:
      "Hydroxide converts an ester into a carboxylate and an alcohol. Acidic workup converts the carboxylate into a carboxylic acid.",
    trigger: acyclicEsterTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[O:3][C:4]>>[C:1](=[O:2])[O-:3].[C:4]O",
    },
    mechanism: "Nucleophilic acyl substitution",
    priority: 1410,
  },
  {
    id: "lactone-saponification",
    family: "esters",
    title: "Lactone Saponification",
    reagents: "1) NaOH, H₂O, heat  2) optional H₃O⁺",
    reagentNote: "Base-promoted ring opening",
    productHint: "Hydroxy carboxylate or hydroxy acid",
    explanation:
      "Hydroxide opens a lactone to a hydroxy carboxylate; acidic workup gives the hydroxy carboxylic acid.",
    trigger: lactoneTrigger,
    transform: {
      type: "conceptOnly",
      reason: "A generic exact product must preserve the variable ring path while breaking the acyl–oxygen bond.",
    },
    mechanism: "Nucleophilic acyl substitution",
    priority: 1412,
  },
  {
    id: "ester-lah-reduction",
    family: "esters",
    title: "LiAlH₄ Reduction of an Ester",
    reagents: "1) LiAlH₄  2) H₃O⁺",
    reagentNote: "Strong hydride reduction",
    productHint: "Two alcohol products",
    explanation:
      "LiAlH₄ reduces the acyl portion of an ester to a primary alcohol and releases the alkoxy portion as an alcohol.",
    trigger: acyclicEsterTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[O:3][C:4]>>[CH2:1][OH:2].[C:4][OH:3]",
    },
    mechanism: "Hydride addition–elimination and reduction",
    priority: 1420,
  },
  {
    id: "lactone-lah-reduction",
    family: "esters",
    title: "LiAlH₄ Reduction of a Lactone",
    reagents: "1) LiAlH₄  2) H₃O⁺",
    reagentNote: "Reductive ring opening",
    productHint: "Diol",
    explanation:
      "LiAlH₄ cleaves and reduces a lactone, opening the ring to a diol.",
    trigger: lactoneTrigger,
    transform: {
      type: "conceptOnly",
      reason: "A generic exact diol product must preserve the variable-length carbon chain connecting the two former ester atoms.",
    },
    mechanism: "Hydride addition–elimination and reduction",
    priority: 1422,
  },
  {
    id: "ester-dibal-reduction",
    family: "esters",
    title: "DIBAL-H Partial Reduction",
    reagents: "1) DIBAL-H, −78 °C  2) H₂O",
    reagentNote: "Controlled partial reduction",
    productHint: "Aldehyde",
    explanation:
      "At low temperature with controlled equivalents, DIBAL-H can reduce an ester to an aldehyde after aqueous workup.",
    trigger: acyclicEsterTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[O:3][C:4]>>[CH:1]=[O:2].[C:4][OH:3]",
    },
    mechanism: "Hydride addition–elimination",
    limitations: ["Excess reagent or warmer conditions can cause over-reduction to the primary alcohol."],
    priority: 1425,
  },
  {
    id: "ester-grignard-addition",
    family: "esters",
    title: "Organometallic Addition",
    reagents: "1) excess RMgX or RLi  2) H₃O⁺",
    reagentNote: "Two carbon additions",
    productHint: "Tertiary alcohol",
    explanation:
      "Esters normally undergo two additions of a Grignard or organolithium reagent, giving a tertiary alcohol after workup.",
    trigger: { anyFunctionalGroups: ["Ester", "Enoate", "Lactone", "Alpha lactone", "Beta lactone", "Gamma lactone", "Delta lactone", "Epsilon lactone"] },
    transform: {
      type: "conceptOnly",
      reason: "The organometallic carbon group must be specified before an exact tertiary alcohol can be generated.",
    },
    mechanism: "Addition–elimination followed by nucleophilic addition",
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
      "An ester can exchange its alkoxy group with another alcohol under acid or base catalysis.",
    trigger: acyclicEsterTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The incoming alcohol or alkoxide must be specified before an exact ester can be generated.",
    },
    mechanism: "Nucleophilic acyl substitution",
    priority: 1440,
  },
  {
    id: "ester-aminolysis",
    family: "esters",
    title: "Ester Aminolysis",
    reagents: "NH₃, RNH₂, or R₂NH, heat",
    reagentNote: "Amide formation",
    productHint: "Amide",
    explanation:
      "Ammonia or an amine displaces the alkoxy group of an ester to form an amide, often with heating.",
    trigger: acyclicEsterTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The amine reactant must be specified before an exact amide can be generated.",
    },
    mechanism: "Nucleophilic acyl substitution",
    priority: 1450,
  },
];
