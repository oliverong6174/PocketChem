import type { ReactionRule } from "../reactionTypes";

const epoxideTrigger = {
  anyFunctionalGroups: ["Epoxide"],
};

export const epoxideReactionRules: ReactionRule[] = [
  {
    id: "epoxide-acid-water-opening",
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Acid-Catalyzed Epoxide Opening with Water",
    reagents: "H₃O⁺, H₂O",
    reagentNote: "Anti opening; attacks more substituted carbon",
    productHint: "Trans diol",
    explanation:
      "Under acidic conditions, water opens protonated epoxides to form trans diols. Nucleophilic attack favors the more substituted carbon.",
    trigger: epoxideTrigger,
    transform: {
      type: "customHandler",
      handler: "ring",
      options: {
        mode: "epoxideOpening",
        nucleophile: "water",
      },
    },
    priority: 800,
  },
  {
    id: "epoxide-base-hydroxide-opening",
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Base-Catalyzed Epoxide Opening with Hydroxide",
    reagents: "1) NaOH or KOH  2) H₂O",
    reagentNote: "Anti opening; attacks less substituted carbon",
    productHint: "Trans diol",
    explanation:
      "Under basic conditions, hydroxide opens epoxides by attacking the less substituted carbon, followed by protonation.",
    trigger: epoxideTrigger,
    transform: {
      type: "customHandler",
      handler: "ring",
      options: {
        mode: "epoxideOpening",
        nucleophile: "hydroxide",
      },
    },
    priority: 810,
  },
  {
    id: "epoxide-acid-alcohol-opening",
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Acid-Catalyzed Epoxide Opening with Alcohol",
    reagents: "ROH, H⁺",
    reagentNote: "Forms alkoxy alcohol",
    productHint: "Alkoxy alcohol",
    explanation:
      "Alcohols open protonated epoxides under acidic conditions to form alkoxy alcohols.",
    trigger: epoxideTrigger,
    additionalReactants: [
      { label: "alcohol", trigger: { includeSmarts: ["[O;H1][#6]"] } },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[O:1]1[C:2][C:3]1.[O;H1:4][#6:5]>>[OH:1][C:2][C:3][O:4][#6:5]",
      maxProducts: 8,
    },
    productStatus: "representative",
    limitations: ["The engine enumerates constitutional openings but does not yet rank the more-substituted acid-catalyzed attack site or assign anti stereochemistry."],
    priority: 820,
  },
  {
    id: "epoxide-base-alkoxide-opening",
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Base-Catalyzed Epoxide Opening with Alkoxide",
    reagents: "1) RO⁻  2) H₃O⁺",
    reagentNote: "Forms alkoxy alcohol",
    productHint: "Alkoxy alcohol",
    explanation:
      "Alkoxides open epoxides under basic conditions, usually attacking the less substituted carbon.",
    trigger: epoxideTrigger,
    additionalReactants: [
      { label: "alkoxide ion", trigger: { includeSmarts: ["[O-][#6]"] } },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[O:1]1[C:2][C:3]1.[O-:4][#6:5]>>[OH:1][C:2][C:3][O+0:4][#6:5]",
      maxProducts: 8,
    },
    productStatus: "representative",
    limitations: ["The engine enumerates constitutional openings but does not yet rank the less-substituted SN2 attack site or assign anti stereochemistry."],
    priority: 830,
  },
  {
    id: "epoxide-hx-opening",
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Epoxide Opening with HX",
    reagents: "HBr, HCl, or HI",
    reagentNote: "Halohydrin formation",
    productHint: "Halohydrin",
    explanation:
      "Hydrohalic acids open epoxides to form halohydrins.",
    trigger: epoxideTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]1[O:2][C:3]1>>[C:1]([Br])[C:3][OH]",
    },
    priority: 840,
  },
  {
    id: "epoxide-grignard-opening",
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Epoxide Opening with Grignard Reagent",
    reagents: "1) RMgBr or RLi  2) H₃O⁺",
    reagentNote: "C-C bond formation",
    productHint: "Alcohol",
    explanation:
      "Grignard and organolithium reagents open epoxides to form alcohols with a new carbon-carbon bond.",
    trigger: epoxideTrigger,
    additionalReactants: [
      {
        label: "Grignard or organolithium reagent",
        trigger: { includeSmarts: ["[#6][Mg,Li]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[O:1]1[C:2][C:3]1.[#6:4][Mg,Li]>>[OH:1][C:2][C:3]-[#6:4]",
      maxProducts: 8,
    },
    productStatus: "representative",
    limitations: ["The engine enumerates constitutional openings but does not yet rank the less-substituted attack site or assign anti stereochemistry."],
    priority: 850,
  },
  {
    id: "epoxide-amine-opening",
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Epoxide Opening with an Amine",
    reagents: "primary or secondary amine; then proton transfer/workup",
    reagentNote: "Draw the epoxide and amine as disconnected structures",
    productHint: "Beta-amino alcohol",
    explanation:
      "Primary and secondary amines can open epoxides by nucleophilic attack to form beta-amino alcohols.",
    trigger: epoxideTrigger,
    additionalReactants: [
      { label: "primary or secondary amine", trigger: { includeSmarts: ["[N;H1,H2;+0;!$(N[C,S,P]=O)]"] } },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[O:1]1[C:2][C:3]1.[N;H1,H2:4]>>[OH:1][C:2][C:3]-[N:4]",
      maxProducts: 8,
    },
    productStatus: "representative",
    limitations: ["The engine enumerates constitutional openings but does not yet rank the less-hindered attack site or assign anti stereochemistry."],
    priority: 855,
  },
  {
    id: "epoxide-ammonia-opening",
    family: "epoxides",
    reactionType: "ringOpening",
    title: "Epoxide Opening with Ammonia",
    reagents: "NH₃",
    reagentNote: "Amino alcohol formation",
    productHint: "Amino alcohol",
    explanation:
      "Ammonia can open epoxides to form amino alcohols.",
    trigger: epoxideTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]1[O:2][C:3]1>>[C:1]([NH2])[C:3][OH]",
    },
    priority: 860,
  },
];
