import type { ReactionRule } from "../reactionTypes";

const amineTrigger = {
  anyFunctionalGroups: [
    "Amine",
    "Primary amine",
    "Secondary amine",
    "Tertiary amine",
    "Benzyl amine",
    "Aniline",
    "Aryl amine",
    "Primary aryl amine",
    "Secondary aryl amine",
    "Tertiary aryl amine",
  ],
};

export const amineReactionRules: ReactionRule[] = [
  {
    id: "amine-acylation",
    family: "amines",
    reactionType: "substitution",
    title: "Acylation",
    reagents: "Acid chloride or anhydride",
    reagentNote: "Nucleophilic acyl substitution",
    productHint: "Amide",
    explanation:
      "Primary and secondary amines react with acid chlorides or acid anhydrides to form amides.",
    trigger: { anyFunctionalGroups: ["Primary amine", "Secondary amine", "Benzyl amine", "Aniline", "Primary aryl amine", "Secondary aryl amine"] },
    transform: {
      type: "conceptOnly",
      reason: "The acyl donor must be specified before an exact amide can be generated.",
    },
    priority: 1700,
  },

  {
    id: "amine-alkylation",
    family: "amines",
    reactionType: "substitution",
    title: "Alkylation",
    reagents: "R-X",
    reagentNote: "SN2 alkylation",
    productHint: "Higher substituted amine",
    explanation:
      "Amines can undergo successive alkylation with alkyl halides.",
    trigger: {
      anyFunctionalGroups: ["Primary amine", "Secondary amine", "Benzyl amine", "Aniline", "Primary aryl amine", "Secondary aryl amine"],
      includeSmarts: ["[N;H1,H2;+0;!$(N[C,S,P]=O)]"],
    },
    additionalReactants: [
      {
        label: "methyl or primary alkyl halide",
        trigger: { includeSmarts: ["[C;X4;H2,H3][Cl,Br,I]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[N;H1,H2;+0:1].[C;X4:2][Cl,Br,I]>>[N:1]-[C:2]",
      maxProducts: 8,
    },
    limitations: ["Further alkylation can occur unless stoichiometry and reaction conditions are controlled."],
    priority: 1710,
  },

  {
    id: "tertiary-amine-quaternization",
    family: "amines",
    reactionType: "substitution",
    title: "Tertiary Amine Quaternization",
    reagents: "methyl or primary R-X",
    reagentNote: "Menshutkin alkylation",
    productHint: "Quaternary ammonium salt",
    explanation:
      "A tertiary amine attacks a methyl or primary alkyl halide to form a quaternary ammonium ion.",
    trigger: {
      anyFunctionalGroups: ["Tertiary amine", "Tertiary aryl amine"],
      includeSmarts: ["[N;H0;+0;X3;!$(N[C,S,P]=O)]"],
    },
    additionalReactants: [
      {
        label: "methyl or primary alkyl halide",
        trigger: { includeSmarts: ["[C;X4;H2,H3][Cl,Br,I]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[N;H0;+0:1].[C;X4:2][Cl,Br,I]>>[N+:1]-[C:2]",
      maxProducts: 8,
    },
    priority: 1712,
  },

  {
    id: "amine-exhaustive-methylation",
    family: "amines",
    reactionType: "substitution",
    title: "Exhaustive Methylation",
    reagents: "Excess CH₃I",
    reagentNote: "Quaternary ammonium formation",
    productHint: "Quaternary ammonium salt",
    explanation:
      "Excess methyl iodide converts amines into quaternary ammonium salts.",
    trigger: amineTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The current one-molecule engine does not explicitly model repeated equivalents and counterions.",
    },
    priority: 1720,
  },

  {
    id: "amine-hofmann-elimination",
    family: "amines",
    reactionType: "elimination",
    title: "Hofmann Elimination",
    reagents: "1) Excess CH₃I  2) Ag₂O, heat",
    reagentNote: "Elimination",
    productHint: "Alkene",
    explanation:
      "Quaternary ammonium hydroxides undergo Hofmann elimination to form the least substituted alkene.",
    trigger: amineTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The elimination site and least-substituted alkene depend on the substrate and require a dedicated regioselective handler.",
    },
    priority: 1730,
  },

  {
    id: "amine-diazotization",
    family: "amines",
    reactionType: "substitution",
    title: "Diazotization",
    reagents: "NaNO₂, HCl, 0°C",
    reagentNote: "Primary aromatic amines",
    productHint: "Diazonium salt",
    explanation:
      "Primary aromatic amines react with nitrous acid to form diazonium salts.",
    trigger: { anyFunctionalGroups: ["Aniline", "Primary aryl amine"], includeSmarts: ["[c][NH2]"] },
    transform: {
      type: "reactionSmarts",
      smarts: "[c:1][NH2:2]>>[c:1][N+:2]#N",
    },
    priority: 1740,
  },

  {
    id: "amine-hinsberg",
    family: "amines",
    reactionType: "substitution",
    title: "Hinsberg Test",
    reagents: "Benzenesulfonyl chloride, NaOH",
    reagentNote: "Classification test",
    productHint: "Sulfonamide",
    explanation:
      "Primary and secondary amines react with benzenesulfonyl chloride to form sulfonamides.",
    trigger: { anyFunctionalGroups: ["Primary amine", "Secondary amine", "Benzyl amine", "Aniline", "Primary aryl amine", "Secondary aryl amine"] },
    transform: {
      type: "conceptOnly",
      reason: "The sulfonylating reagent is external; the card is retained as a qualitative classification reaction.",
    },
    priority: 1750,
  },
];
