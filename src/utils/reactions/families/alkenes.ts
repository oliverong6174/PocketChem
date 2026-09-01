import type { ReactionRule } from "../reactionTypes";

const alkeneTrigger = {
  anyFunctionalGroups: [
    "Alkene",
    "Cycloalkene",
    "Diene",
    "Conjugated diene",
    "Cumulated diene",
    "Triene",
    "Enyne",
    "Enal",
    "Enone",
    "Enoic acid",
    "Enoate",
    "Chalcone",
    "Cinnamic acid",
    "Cinnamaldehyde",
    "Crotonic acid",
    "Crotonaldehyde",
    "Acrylic acid",
    "Acrolein",
  ],
  includeSmarts: ["[C;!a]=[C;!a]"],
};

export const alkeneReactionRules: ReactionRule[] = [
  {
    id: "alkene-hydrogenation",
    family: "alkenes",
    reactionType: "reduction",
    title: "Alkene Hydrogenation",
    reagents: "H₂, Pd/C",
    reagentNote: "Catalytic reduction",
    productHint: "Alkane",
    explanation:
      "Hydrogenation adds H₂ across the C=C bond, reducing the alkene to an alkane.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1][C:2]",
    },
    priority: 100,
  },

  {
    id: "deuteration",


    reactionType: "reduction",
    family: "alkenes",

    title: "Catalytic Deuteration",

    reagents: "D2, Pd",

    reagentNote: "Syn deuterium addition",

    productHint: "Deuterated alkane",

    explanation:
        "Catalytic addition of deuterium labels the alkene with two deuterium atoms.",

    trigger: alkeneTrigger,

    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([2H])[C:2]([2H])",
    },

    priority: 105
  },

  {
    id: "alkene-hx-addition-hbr",
    family: "alkenes",
    reactionType: "addition",
    title: "HX Addition: Hydrobromination",
    reagents: "HBr",
    reagentNote: "Markovnikov hydrohalogenation",
    productHint: "Alkyl bromide",
    explanation:
      "HBr adds across the alkene to form an alkyl bromide.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([Br])[C:2]",
    },
    productStatus: "representative",
    selectivity: ["Markovnikov orientation; carbocation rearrangements may occur"],
    priority: 110,
  },

  {
    id: "alkene-hbr-peroxide",


    reactionType: "radical",
    family: "alkenes",

    title: "Hydrobromination (Peroxide Effect)",

    reagents: "HBr, ROOR",

    reagentNote: "Anti-Markovnikov radical addition",

    productHint: "Alkyl bromide",

    explanation:
        "Radical addition of HBr in the presence of peroxides gives the anti-Markovnikov product.",

    trigger: alkeneTrigger,

    transform: {
        type: "reactionSmarts",
        smarts: "[C:1]=[C:2]>>[C:1][C:2]([Br])"
    },
    productStatus: "representative",
    selectivity: ["Anti-Markovnikov orientation; radical mechanism"],

    priority: 115
},

  {
    id: "alkene-halogenation-bromine",
    family: "alkenes",
    reactionType: "addition",
    title: "Halogenation",
    reagents: "Br₂, CCl₄",
    reagentNote: "Anti addition of halogen",
    productHint: "Vicinal dibromide",
    explanation:
      "Halogenation adds one bromine to each alkene carbon.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([Br])[C:2]([Br])",
    },
    productStatus: "representative",
    selectivity: ["Anti addition"],
    priority: 120,
  },

  {
    id: "alkene-halohydrin-formation",
    family: "alkenes",
    reactionType: "addition",
    title: "Halohydrin Formation",
    reagents: "Br₂, H₂O",
    reagentNote: "Anti addition of Br and OH",
    productHint: "Halohydrin",
    explanation:
      "Water opens the bromonium ion, giving an alcohol and bromide on adjacent carbons.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([Br])[C:2]([OH])",
    },
    productStatus: "representative",
    selectivity: ["OH goes to the more substituted carbon; anti addition"],
    priority: 130,
  },

  {
    id: "alkene-acid-hydration",
    family: "alkenes",
    reactionType: "addition",
    title: "Acid-Catalyzed Hydration",
    reagents: "H₃O⁺",
    reagentNote: "Markovnikov hydration",
    productHint: "Alcohol",
    explanation:
      "Acid-catalyzed hydration adds water across the alkene to form an alcohol.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "addition",
      options: {
        mode: "alkeneHydration",
        regioselectivity: "markovnikov",
      },
    },
    productStatus: "representative",
    selectivity: ["Markovnikov orientation; rearrangements may occur"],
    limitations: [
      "The current hydration handler enforces constitutional Markovnikov regiochemistry but does not yet model carbocation rearrangements.",
    ],
    priority: 140,
  },

  {
    id: "alkene-hydroboration-oxidation",
    family: "alkenes",
    reactionType: "oxidation",
    title: "Hydroboration-Oxidation",
    reagents: "1) BH₃·THF  2) H₂O₂, NaOH",
    reagentNote: "Anti-Markovnikov, syn hydration",
    productHint: "Alcohol",
    explanation:
      "Hydroboration-oxidation hydrates the alkene with anti-Markovnikov orientation.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "addition",
      options: {
        mode: "alkeneHydration",
        regioselectivity: "anti-markovnikov",
      },
    },
    productStatus: "representative",
    selectivity: ["Anti-Markovnikov and syn addition"],
    limitations: [
      "The current hydration handler enforces anti-Markovnikov connectivity; syn stereochemistry is not yet assigned explicitly in the product structure.",
    ],
    priority: 150,
  },



  {
    id: "alkene-oxymercuration-demercuration",
    family: "alkenes",
    reactionType: "addition",
    title: "Oxymercuration-Demercuration",
    reagents: "1) Hg(OAc)₂, H₂O  2) NaBH₄",
    reagentNote: "Markovnikov hydration, no rearrangement",
    productHint: "Alcohol",
    explanation:
      "Oxymercuration-demercuration converts an alkene to a Markovnikov alcohol without rearrangement.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "addition",
      options: {
        mode: "alkeneHydration",
        regioselectivity: "markovnikov",
      },
    },
    productStatus: "representative",
    selectivity: ["Markovnikov orientation without rearrangement"],
    priority: 160,
  },

  {
    id: "alkene-simmons-smith",


    reactionType: "addition",
    family: "alkenes",

    title: "Simmons–Smith Cyclopropanation",

    reagents: "CH2I2, Zn(Cu)",

    reagentNote: "Cyclopropane formation",

    productHint: "Cyclopropane",

    explanation:
        "A methylene carbene equivalent inserts across the double bond to form a cyclopropane.",

    trigger: alkeneTrigger,

    transform: {
        type: "reactionSmarts",
        smarts: "[C:1]=[C:2]>>[C:1]1[C][C:2]1"
    },
    productStatus: "representative",
    selectivity: ["Stereospecific syn cyclopropanation"],

    priority: 165
  },

  {
    id: "alkene-epoxidation",
    family: "alkenes",
    reactionType: "oxidation",
    title: "Epoxidation",
    reagents: "mCPBA",
    reagentNote: "Concerted oxygen transfer",
    productHint: "Epoxide",
    explanation:
      "A peroxyacid converts the alkene into a three-membered epoxide ring.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]1[O][C:2]1",
    },
    productStatus: "representative",
    selectivity: ["Stereospecific oxygen transfer"],
    priority: 170,
  },

  {
    id: "alkene-syn-dihydroxylation",
    family: "alkenes",
    reactionType: "oxidation",
    title: "Syn Dihydroxylation",
    reagents: "OsO₄, NMO",
    reagentNote: "Syn addition of two OH groups",
    productHint: "Vicinal diol",
    explanation:
      "Syn dihydroxylation adds two hydroxyl groups across the alkene.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([OH])[C:2]([OH])",
    },
    productStatus: "representative",
    selectivity: ["Syn addition"],
    priority: 180,
  },

  {
    id: "cold-kmno4",
    family: "alkenes",
    reactionType: "oxidation",
    title: "Cold Permanganate Oxidation",
    reagents: "KMnO4, OH⁻, H₂O, cold/dilute",
    reagentNote: "Syn dihydroxylation",
    productHint: "Vicinal syn diol",
    explanation:
      "Cold, dilute permanganate adds two hydroxyl groups syn across an alkene.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([OH])[C:2]([OH])",
    },
    productStatus: "representative",
    mechanism: "Syn dihydroxylation",
    selectivity: ["Syn addition of the two hydroxyl groups"],
    limitations: [
      "The current product graph does not encode newly formed stereocenters explicitly.",
    ],
    priority: 181,
  },

  {
    id: "alkene-anti-dihydroxylation",
    family: "alkenes",
    reactionType: "oxidation",
    title: "Anti Dihydroxylation",
    reagents: "1) mCPBA  2) H₃O⁺",
    reagentNote: "Epoxidation then anti opening",
    productHint: "Vicinal diol",
    explanation:
      "Epoxidation followed by acid-catalyzed ring opening gives an anti vicinal diol.",
    trigger: alkeneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([OH])[C:2]([OH])",
    },
    productStatus: "representative",
    selectivity: ["Anti addition"],
    priority: 190,
  },

    {
        id: "alkene-ozonolysis-reductive",
        family: "alkenes",
        reactionType: "cleavage",
        title: "Reductive Ozonolysis",
        reagents: "1) O₃  2) (CH₃)₂S or Zn/H₂O",
        reagentNote: "Reductive workup",
        productHint: "Aldehydes / Ketones",
        explanation:
            "Ozone cleaves the alkene. Dimethyl sulfide or zinc prevents further oxidation, giving aldehydes and ketones.",
        trigger: alkeneTrigger,
        transform: {
            type: "reactionSmarts",
            smarts:
                "[C:1]=[C:2]>>[C:1]=O.[C:2]=O"
        },
        priority: 200
    },

    {
    id: "alkene-ozonolysis-oxidative",
    family: "alkenes",
    reactionType: "cleavage",
    title: "Oxidative Ozonolysis",
    reagents: "1) O₃  2) H₂O₂",
    reagentNote: "Oxidative workup",
    productHint: "Carboxylic acids",
    explanation:
        "Oxidative workup converts any aldehydes formed during ozonolysis into carboxylic acids while ketones remain ketones.",
    trigger: alkeneTrigger,
    transform: {
      type: "conceptOnly",
      reason: "Oxidative workup treats alkene carbons differently depending on whether they bear hydrogen; an oxidation-state-aware cleavage handler is required.",
    },
    priority: 201
},

  {
    id: "alkene-oxidative-cleavage",
    family: "alkenes",
    reactionType: "cleavage",
    title: "Hot Permanganate Oxidative Cleavage",
    reagents: "1) KMnO4, OH⁻, heat  2) H₃O⁺",
    reagentNote: "Strong oxidative cleavage",
    productHint: "Ketones, carboxylic acids, and/or CO₂",
    explanation:
      "Hot permanganate cleaves the alkene. An alkene carbon with no hydrogen gives a ketone, one bearing a hydrogen gives a carboxylic acid, and a terminal CH₂ carbon is oxidized to CO₂.",
    trigger: alkeneTrigger,
    transform: {
      type: "customHandler",
      handler: "oxidation",
      options: {
        mode: "alkeneOxidativeCleavage",
      },
    },
    productStatus: "computed",
    mechanism: "Strong oxidative cleavage",
    priority: 210,
  },



  {
    id: "alkene-allylic-bromination",
    family: "alkenes",
    reactionType: "radical",
    title: "Allylic Bromination",
    reagents: "NBS, hν or radical initiator",
    reagentNote: "Radical substitution at an allylic carbon",
    productHint: "Allylic bromide",
    explanation:
      "NBS replaces an allylic hydrogen with bromine while minimizing direct addition of Br₂ across the double bond.",
    trigger: {
      ...alkeneTrigger,
      includeSmarts: ["[C]=[C][C;H1,H2,H3]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2][C;H1,H2,H3:3]>>[C:1]=[C:2][C:3]Br",
      maxProducts: 8,
    },
    mechanism: "Radical-chain substitution",
    productStatus: "representative",
    selectivity: ["Reaction occurs at an allylic C–H bond."],
    limitations: [
      "Resonance-related allylic bromides can form; the engine enumerates local sites but does not rank the product mixture.",
    ],
    priority: 215,
  },
  {
    id: "alkene-addition-polymerization",
    family: "alkenes",
    reactionType: "addition",
    title: "Addition Polymerization",
    reagents: "radical, cationic, anionic, or coordination initiator",
    reagentNote: "Chain-growth polymerization",
    productHint: "Polyalkene repeat unit",
    explanation:
      "Many alkenes undergo chain-growth addition polymerization in which the pi bond becomes part of a saturated polymer backbone.",
    trigger: alkeneTrigger,
    transform: {
      type: "conceptOnly",
      reason: "A polymer requires repeat-unit, tacticity, end-group, and chain-length representation rather than a finite small-molecule SMILES product.",
    },
    mechanism: "Chain-growth polymerization",
    course: "advanced",
    priority: 220,
  },
];
