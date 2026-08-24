import type { ReactionRule } from "../reactionTypes";

const ketoneTrigger = {
  anyFunctionalGroups: ["Ketone", "Enone", "Chalcone"],
};

export const ketoneReactionRules: ReactionRule[] = [
  {
    id: "ketone-reduction",
    family: "ketones",
    title: "Ketone Reduction",
    reagents: "NaBH₄ or LiAlH₄, then H₃O⁺",
    reagentNote: "Hydride reduction",
    productHint: "Secondary alcohol",
    explanation:
      "Hydride reagents reduce ketones to secondary alcohols.",
    trigger: ketoneTrigger,
    transform: {
      type: "engineHandler",
      handler: "addition",
      options: {
        mode: "oneTwoAddition",
        nucleophile: "hydride",
      },
    },
    priority: 1100,
  },
    {
    id: "ketone-organometallic-addition",
    family: "ketones",
    title: "Organometallic Addition",
    reagents: "1) RMgBr, RMgCl, or RLi  2) H₃O⁺",
    reagentNote: "Grignard and organolithium addition",
    productHint: "Tertiary alcohol",
    explanation:
      "Grignard reagents and organolithium reagents add to ketones to form tertiary alcohols after acidic workup.",
    trigger: ketoneTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The Grignard or organolithium carbon group must be specified before an exact alcohol can be generated.",
    },
    priority: 1110,
  },
  {
    id: "ketone-hydration",
    family: "ketones",
    title: "Ketone Hydration",
    reagents: "H₂O, acid or base",
    reagentNote: "Reversible nucleophilic addition",
    productHint: "Geminal diol",
    explanation:
      "Water can add reversibly to ketones to form geminal diols, although ketones are usually less hydrated than aldehydes.",
    trigger: ketoneTrigger,
    transform: {
    type: "engineHandler",
    handler: "addition",
    options: {
      mode: "oneTwoAddition",
      nucleophile: "water",
    },
  },
    priority: 1130,
  },
  {
    id: "ketone-cyanohydrin",
    family: "ketones",
    title: "Cyanohydrin Formation",
    reagents: "HCN, NaCN/HCl",
    reagentNote: "CN⁻ addition",
    productHint: "Cyanohydrin",
    explanation:
      "Cyanide adds to ketones followed by protonation to form cyanohydrins.",
    trigger: ketoneTrigger,
    transform: {
    type: "engineHandler",
    handler: "addition",
    options: {
      mode: "oneTwoAddition",
      nucleophile: "cyanide",
    },
  },
    priority: 1140,
  },
  {
    id: "ketone-ketal-formation",
    family: "ketones",
    title: "Ketal Formation",
    reagents: "ROH, H⁺",
    reagentNote: "Acid-catalyzed alcohol addition",
    productHint: "Ketal",
    explanation:
      "Ketones react with alcohols under acidic conditions to form ketals through hemiketal intermediates.",
    trigger: ketoneTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The alcohol identity must be specified before an exact ketal can be generated.",
    },
    priority: 1150,
  },
  {
    id: "ketone-imine-formation",
    family: "ketones",
    title: "Imine Formation",
    reagents: "Primary amine, acid catalyst",
    reagentNote: "Condensation with primary amine",
    productHint: "Imine",
    explanation:
      "Ketones react with primary amines to form imines through dehydration.",
    trigger: ketoneTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The primary amine substituent must be specified before an exact imine can be generated.",
    },
    priority: 1160,
  },
  {
    id: "ketone-enamine-formation",
    family: "ketones",
    title: "Enamine Formation",
    reagents: "Secondary amine, acid catalyst",
    reagentNote: "Condensation with secondary amine",
    productHint: "Enamine",
    explanation:
      "Ketones with alpha hydrogens can react with secondary amines to form enamines.",
    trigger: ketoneTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The secondary amine substituents must be specified before an exact enamine can be generated.",
    },
    priority: 1170,
  },
  {
    id: "ketone-oxime-formation",
    family: "ketones",
    title: "Oxime Formation",
    reagents: "NH₂OH",
    reagentNote: "Condensation with hydroxylamine",
    productHint: "Oxime",
    explanation:
      "Ketones react with hydroxylamine to form oximes.",
    trigger: ketoneTrigger,
    transform: {
      type: "engineHandler",
      handler: "condensation",
      options: {
        mode: "oximeFormation",
      },
    },
    priority: 1180,
  },
  {
    id: "ketone-hydrazone-formation",
    family: "ketones",
    title: "Hydrazone Formation",
    reagents: "NH₂NH₂ or substituted hydrazine",
    reagentNote: "Condensation with hydrazine",
    productHint: "Hydrazone",
    explanation:
      "Ketones react with hydrazines to form hydrazones.",
    trigger: ketoneTrigger,
    transform: {
      type: "conceptOnly",
      reason: "A substituted hydrazine can change the product; specify it for an exact structure.",
    },
    priority: 1190,
  },
  {
    id: "ketone-wolff-kishner",
    family: "ketones",
    title: "Wolff-Kishner Reduction",
    reagents: "NH₂NH₂, KOH, heat",
    reagentNote: "Carbonyl to alkane",
    productHint: "Alkane",
    explanation:
      "Wolff-Kishner reduction converts ketones to alkanes under strongly basic conditions.",
    trigger: ketoneTrigger,
    transform: {
      type: "engineHandler",
      handler: "reduction",
      options: {
        mode: "carbonylToAlkane",
      },
    },
    priority: 1200,
  },
  {
    id: "ketone-clemmensen",
    family: "ketones",
    title: "Clemmensen Reduction",
    reagents: "Zn(Hg), HCl",
    reagentNote: "Carbonyl to alkane",
    productHint: "Alkane",
    explanation:
      "Clemmensen reduction converts ketones to alkanes under acidic conditions.",
    trigger: ketoneTrigger,
    transform: {
      type: "engineHandler",
      handler: "reduction",
      options: {
        mode: "carbonylToAlkane",
      },
    },
    priority: 1210,
  },
  {
    id: "ketone-wittig",
    family: "ketones",
    title: "Wittig Reaction",
    reagents: "Ph₃P=CHR",
    reagentNote: "Carbonyl alkene formation",
    productHint: "Alkene",
    explanation:
      "Wittig reagents convert ketones into substituted alkenes.",
    trigger: ketoneTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The ylide substituent must be specified before an exact alkene can be generated.",
    },
    priority: 1220,
  },
  {
    id: "ketone-baeyer-villiger",
    family: "ketones",
    title: "Baeyer-Villiger Oxidation",
    reagents: "mCPBA or peroxyacid",
    reagentNote: "Oxygen insertion",
    productHint: "Ester",
    explanation:
      "Baeyer-Villiger oxidation inserts oxygen next to the carbonyl carbon of a ketone, forming an ester.",
    trigger: ketoneTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])([C:3])[C:4]>>[C:1](=[O:2])([C:4])O[C:3]",
      maxProducts: 8,
    },
    mechanism: "Criegee rearrangement",
    selectivity: [
      "The group with greater migratory aptitude usually migrates; stereochemistry at a migrating stereocenter is retained.",
    ],
    productStatus: "representative",
    limitations: [
      "The engine enumerates both possible oxygen-insertion orientations but does not rank migratory aptitude.",
    ],
    priority: 1250,
  },
];
