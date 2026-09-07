import type { ReactionRule } from "../reactionTypes";
import { GRIGNARD_OR_ORGANOLITHIUM_TRIGGER_SMARTS } from "../organometallic";

const ketoneTrigger = {
  anyFunctionalGroups: ["Ketone", "Enone", "Chalcone"],
};

export const ketoneReactionRules: ReactionRule[] = [
  {
    id: "ketone-reduction",
    family: "ketones",
    reactionType: "reduction",
    title: "Ketone Reduction",
    reagents: "NaBH₄ or LiAlH₄, then H₃O⁺",
    reagentNote: "Hydride reduction",
    productHint: "Secondary alcohol",
    explanation:
      "Hydride reagents reduce ketones to secondary alcohols.",
    trigger: ketoneTrigger,
    transform: {
      type: "customHandler",
      handler: "reduction",
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
    reactionType: "addition",
    title: "Organometallic Addition",
    reagents: "1) RMgCl, RMgBr, RMgI, or RLi  2) H₃O⁺",
    reagentNote: "Grignard and organolithium addition",
    productHint: "Tertiary alcohol",
    explanation:
      "Grignard reagents and organolithium reagents add to ketones to form tertiary alcohols after acidic workup.",
    trigger: ketoneTrigger,
    additionalReactants: [
      {
        label: "Grignard or organolithium reagent",
        trigger: { includeSmarts: [GRIGNARD_OR_ORGANOLITHIUM_TRIGGER_SMARTS] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[O:2].[#6:3][Mg,Li]>>[C:1]([OH:2])-[#6:3]",
      maxProducts: 8,
    },
    priority: 1110,
  },
  {
    id: "ketone-hydration",
    family: "ketones",
    reactionType: "addition",
    title: "Ketone Hydration",
    reagents: "H₂O, acid or base",
    reagentNote: "Reversible nucleophilic addition",
    productHint: "Geminal diol",
    explanation:
      "Water can add reversibly to ketones to form geminal diols, although ketones are usually less hydrated than aldehydes.",
    trigger: ketoneTrigger,
    transform: {
    type: "customHandler",
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
    reactionType: "addition",
    title: "Cyanohydrin Formation",
    reagents: "HCN, NaCN/HCl",
    reagentNote: "CN⁻ addition",
    productHint: "Cyanohydrin",
    explanation:
      "Cyanide adds to ketones followed by protonation to form cyanohydrins.",
    trigger: ketoneTrigger,
    transform: {
    type: "customHandler",
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
    reactionType: "condensation",
    title: "Ketal Formation",
    reagents: "ROH, H⁺",
    reagentNote: "Acid-catalyzed alcohol addition",
    productHint: "Ketal",
    explanation:
      "Ketones react with alcohols under acidic conditions to form ketals through hemiketal intermediates.",
    trigger: ketoneTrigger,
    additionalReactants: [
      {
        label: "alcohol (2 equivalents)",
        trigger: { includeSmarts: ["[O;H1][#6]"] },
        equivalents: 2,
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[O:2].[O;H1:3][#6:4].[O;H1:5][#6:6]>>[C:1]([O:3][#6:4])([O:5][#6:6])",
      maxProducts: 8,
    },
    priority: 1150,
  },
  {
    id: "ketone-imine-formation",
    family: "ketones",
    reactionType: "condensation",
    title: "Imine Formation",
    reagents: "Primary amine, acid catalyst",
    reagentNote: "Condensation with primary amine",
    productHint: "Imine",
    explanation:
      "Ketones react with primary amines to form imines through dehydration.",
    trigger: ketoneTrigger,
    additionalReactants: [
      {
        label: "primary amine or ammonia",
        trigger: { includeSmarts: ["[N;H2,H3;!$(N[C,S,P]=O)]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[O:2].[N;H2,H3:3]>>[C:1]=[N:3]",
      maxProducts: 8,
    },
    priority: 1160,
  },
  {
    id: "ketone-enamine-formation",
    family: "ketones",
    reactionType: "condensation",
    title: "Enamine Formation",
    reagents: "Secondary amine, acid catalyst",
    reagentNote: "Condensation with secondary amine",
    productHint: "Enamine",
    explanation:
      "Ketones with alpha hydrogens can react with secondary amines to form enamines.",
    trigger: { ...ketoneTrigger, includeSmarts: ["[C;H1,H2,H3][C](=O)"] },
    additionalReactants: [
      {
        label: "secondary amine",
        trigger: { includeSmarts: ["[N;H1;+0;X3;!$(N[C,S,P]=O)]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C;H1,H2,H3:6][C:1](=[O:2]).[N;H1:3]>>[C:6]=[C:1]-[N:3]",
      maxProducts: 12,
    },
    productStatus: "representative",
    limitations: ["The carbonyl must contain an alpha hydrogen. Unsymmetrical carbonyl compounds can form more than one constitutional enamine, and E/Z geometry is not assigned."],
    priority: 1170,
  },
  {
    id: "ketone-oxime-formation",
    family: "ketones",
    reactionType: "condensation",
    title: "Oxime Formation",
    reagents: "NH₂OH",
    reagentNote: "Condensation with hydroxylamine",
    productHint: "Oxime",
    explanation:
      "Ketones react with hydroxylamine to form oximes.",
    trigger: ketoneTrigger,
    transform: {
      type: "customHandler",
      handler: "carbonyl",
      options: {
        mode: "oximeFormation",
      },
    },
    priority: 1180,
  },
  {
    id: "ketone-hydrazone-formation",
    family: "ketones",
    reactionType: "condensation",
    title: "Hydrazone Formation",
    reagents: "NH₂NH₂ or substituted hydrazine",
    reagentNote: "Condensation with hydrazine",
    productHint: "Hydrazone",
    explanation:
      "Ketones react with hydrazines to form hydrazones.",
    trigger: ketoneTrigger,
    additionalReactants: [
      {
        label: "hydrazine or substituted hydrazine",
        trigger: { includeSmarts: ["[N;H1,H2][N]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[O:2].[N;H1,H2:3][N:4]>>[C:1]=[N:3][N:4]",
      maxProducts: 8,
    },
    priority: 1190,
  },
  {
    id: "ketone-wolff-kishner",
    family: "ketones",
    reactionType: "reduction",
    title: "Wolff-Kishner Reduction",
    reagents: "NH₂NH₂, KOH, heat",
    reagentNote: "Carbonyl to alkane",
    productHint: "Alkane",
    explanation:
      "Wolff-Kishner reduction converts ketones to alkanes under strongly basic conditions.",
    trigger: ketoneTrigger,
    transform: {
      type: "customHandler",
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
    reactionType: "reduction",
    title: "Clemmensen Reduction",
    reagents: "Zn(Hg), HCl",
    reagentNote: "Carbonyl to alkane",
    productHint: "Alkane",
    explanation:
      "Clemmensen reduction converts ketones to alkanes under acidic conditions.",
    trigger: ketoneTrigger,
    transform: {
      type: "customHandler",
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
    reactionType: "coupling",
    title: "Wittig Reaction",
    reagents: "Ph₃P=CHR",
    reagentNote: "Carbonyl alkene formation",
    productHint: "Alkene",
    explanation:
      "Wittig reagents convert ketones into substituted alkenes.",
    trigger: ketoneTrigger,
    additionalReactants: [
      {
        label: "phosphorus ylide",
        trigger: { includeSmarts: ["[C-][P+]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[O:2].[C-:3][P+:4]>>[C:1]=[C+0:3]",
      maxProducts: 8,
    },
    productStatus: "representative",
    priority: 1220,
  },
  {
    id: "ketone-baeyer-villiger",
    family: "ketones",
    reactionType: "oxidation",
    title: "Baeyer-Villiger Oxidation",
    reagents: "mCPBA or peroxyacid",
    reagentNote: "Oxygen insertion",
    productHint: "Ester",
    explanation:
      "Baeyer-Villiger oxidation inserts oxygen next to the carbonyl carbon of a ketone, forming an ester.",
    trigger: ketoneTrigger,
    transform: {
      type: "customHandler",
      handler: "oxidation",
      options: { mode: "baeyerVilliger" },
    },
    mechanism: "Criegee rearrangement",
    selectivity: [
      "The group with greater migratory aptitude usually migrates; stereochemistry at a migrating stereocenter is retained.",
    ],
    productStatus: "representative",
    limitations: [
      "When the two migrating groups have essentially equal aptitude, both genuinely competitive products may remain. Electronic substituent effects within a single aptitude class are not quantitatively modeled.",
    ],
    priority: 1250,
  },
];
