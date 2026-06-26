import type { ReactionRule } from "../reactionTypes";

const epoxideTrigger = {
  functionalGroups: [
    "Epoxide",
    "Oxirane",
  ],
};

export const epoxideReactionRules: ReactionRule[] = [
  {
    id: "epoxide-acid-water-opening",
    family: "epoxides",
    title: "Acid-Catalyzed Epoxide Opening with Water",
    reagents: "H₃O⁺, H₂O",
    reagentNote: "Anti opening; attacks more substituted carbon",
    productHint: "Trans diol",
    explanation:
      "Under acidic conditions, water opens protonated epoxides to form trans diols. Nucleophilic attack favors the more substituted carbon.",
    trigger: epoxideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]1[O:2][C:3]1>>[C:1]([OH])[O:2].[C:3][OH]",
    },
    priority: 800,
  },
  {
    id: "epoxide-base-hydroxide-opening",
    family: "epoxides",
    title: "Base-Catalyzed Epoxide Opening with Hydroxide",
    reagents: "1) NaOH or KOH  2) H₂O",
    reagentNote: "Anti opening; attacks less substituted carbon",
    productHint: "Trans diol",
    explanation:
      "Under basic conditions, hydroxide opens epoxides by attacking the less substituted carbon, followed by protonation.",
    trigger: epoxideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]1[O:2][C:3]1>>[C:1]([OH])[C:3][OH]",
    },
    priority: 810,
  },
  {
    id: "epoxide-acid-alcohol-opening",
    family: "epoxides",
    title: "Acid-Catalyzed Epoxide Opening with Alcohol",
    reagents: "ROH, H⁺",
    reagentNote: "Forms alkoxy alcohol",
    productHint: "Alkoxy alcohol",
    explanation:
      "Alcohols open protonated epoxides under acidic conditions to form alkoxy alcohols.",
    trigger: epoxideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]1[O:2][C:3]1>>[C:1]([OC])[C:3][OH]",
    },
    priority: 820,
  },
  {
    id: "epoxide-base-alkoxide-opening",
    family: "epoxides",
    title: "Base-Catalyzed Epoxide Opening with Alkoxide",
    reagents: "1) RO⁻  2) H₃O⁺",
    reagentNote: "Forms alkoxy alcohol",
    productHint: "Alkoxy alcohol",
    explanation:
      "Alkoxides open epoxides under basic conditions, usually attacking the less substituted carbon.",
    trigger: epoxideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]1[O:2][C:3]1>>[C:1]([OC])[C:3][OH]",
    },
    priority: 830,
  },
  {
    id: "epoxide-hx-opening",
    family: "epoxides",
    title: "Epoxide Opening with HX",
    reagents: "HBr, HCl, or HI",
    reagentNote: "Halohydrin formation",
    productHint: "Halohydrin",
    explanation:
      "Hydrohalic acids open epoxides to form halohydrins.",
    trigger: epoxideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]1[O:2][C:3]1>>[C:1]([Br])[C:3][OH]",
    },
    priority: 840,
  },
  {
    id: "epoxide-grignard-opening",
    family: "epoxides",
    title: "Epoxide Opening with Grignard Reagent",
    reagents: "1) RMgBr or RLi  2) H₃O⁺",
    reagentNote: "C-C bond formation",
    productHint: "Alcohol",
    explanation:
      "Grignard and organolithium reagents open epoxides to form alcohols with a new carbon-carbon bond.",
    trigger: epoxideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]1[O:2][C:3]1>>[C:1](C)[C:3][OH]",
    },
    priority: 850,
  },
  {
    id: "epoxide-ammonia-opening",
    family: "epoxides",
    title: "Epoxide Opening with Ammonia",
    reagents: "NH₃",
    reagentNote: "Amino alcohol formation",
    productHint: "Amino alcohol",
    explanation:
      "Ammonia can open epoxides to form amino alcohols.",
    trigger: epoxideTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]1[O:2][C:3]1>>[C:1]([NH2])[C:3][OH]",
    },
    priority: 860,
  },
];