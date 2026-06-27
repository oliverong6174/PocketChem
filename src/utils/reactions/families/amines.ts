import type { ReactionRule } from "../reactionTypes";

const amineTrigger = {
  functionalGroups: ["Amine"],
};

export const amineReactionRules: ReactionRule[] = [
  {
    id: "amine-acylation",
    family: "amines",
    title: "Acylation",
    reagents: "Acid chloride or anhydride",
    reagentNote: "Nucleophilic acyl substitution",
    productHint: "Amide",
    explanation:
      "Primary and secondary amines react with acid chlorides or acid anhydrides to form amides.",
    trigger: amineTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[N:1]>>[N:1]C(=O)C",
    },
    priority: 1700,
  },

  {
    id: "amine-alkylation",
    family: "amines",
    title: "Alkylation",
    reagents: "R-X",
    reagentNote: "SN2 alkylation",
    productHint: "Higher substituted amine",
    explanation:
      "Amines can undergo successive alkylation with alkyl halides.",
    trigger: amineTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[N:1]>>[N:1]C",
    },
    priority: 1710,
  },

  {
    id: "amine-exhaustive-methylation",
    family: "amines",
    title: "Exhaustive Methylation",
    reagents: "Excess CH₃I",
    reagentNote: "Quaternary ammonium formation",
    productHint: "Quaternary ammonium salt",
    explanation:
      "Excess methyl iodide converts amines into quaternary ammonium salts.",
    trigger: amineTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[N:1]>>[N+:1](C)(C)(C)C",
    },
    priority: 1720,
  },

  {
    id: "amine-hofmann-elimination",
    family: "amines",
    title: "Hofmann Elimination",
    reagents: "1) Excess CH₃I  2) Ag₂O, heat",
    reagentNote: "Elimination",
    productHint: "Alkene",
    explanation:
      "Quaternary ammonium hydroxides undergo Hofmann elimination to form the least substituted alkene.",
    trigger: amineTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[N+:1](C)(C)(C)C>>C=C",
    },
    priority: 1730,
  },

  {
    id: "amine-diazotization",
    family: "amines",
    title: "Diazotization",
    reagents: "NaNO₂, HCl, 0°C",
    reagentNote: "Primary aromatic amines",
    productHint: "Diazonium salt",
    explanation:
      "Primary aromatic amines react with nitrous acid to form diazonium salts.",
    trigger: amineTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[N:1]>>[N+]#N",
    },
    priority: 1740,
  },

  {
    id: "amine-hinsberg",
    family: "amines",
    title: "Hinsberg Test",
    reagents: "Benzenesulfonyl chloride, NaOH",
    reagentNote: "Classification test",
    productHint: "Sulfonamide",
    explanation:
      "Primary and secondary amines react with benzenesulfonyl chloride to form sulfonamides.",
    trigger: amineTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[N:1]>>[N:1]S(=O)(=O)c1ccccc1",
    },
    priority: 1750,
  },
];