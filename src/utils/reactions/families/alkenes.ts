import type { ReactionRule } from "../reactionTypes";

const alkeneTrigger = {
  functionalGroups: [
    "Alkene",
    "Alkenes",
    "C=C",
    "Carbon-carbon double bond",
  ],
};

export const alkeneReactionRules: ReactionRule[] = [
  {
    id: "alkene-hydrogenation",
    family: "alkenes",
    title: "Alkene Hydrogenation",
    reagents: "H₂, Pd/C",
    reagentNote: "Catalytic reduction",
    productHint: "Alkane",
    explanation:
      "Hydrogenation adds H₂ across the C=C bond, reducing the alkene to an alkane.",
    trigger: alkeneTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1][C:2]",
    },
    priority: 100,
  },

  {
    id: "deuteration",

    family: "alkenes",

    title: "Catalytic Deuteration",

    reagents: "D2, Pd",

    reagentNote: "Syn deuterium addition",

    productHint: "Deuterated alkane",

    explanation:
        "Catalytic addition of deuterium labels the alkene with two deuterium atoms.",

    trigger: alkeneTrigger,

    transform: {
        type: "rdkitReactionSmarts",
        smarts: "[C:1]=[C:2]>>[C:1][C:2]"
    },

    priority: 105
  },

  {
    id: "alkene-hx-addition-hbr",
    family: "alkenes",
    title: "HX Addition: Hydrobromination",
    reagents: "HBr",
    reagentNote: "Markovnikov hydrohalogenation",
    productHint: "Alkyl bromide",
    explanation:
      "HBr adds across the alkene to form an alkyl bromide.",
    trigger: alkeneTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([Br])[C:2]",
    },
    priority: 110,
  },

  {
    id: "alkene-hbr-peroxide",

    family: "alkenes",

    title: "Hydrobromination (Peroxide Effect)",

    reagents: "HBr, ROOR",

    reagentNote: "Anti-Markovnikov radical addition",

    productHint: "Alkyl bromide",

    explanation:
        "Radical addition of HBr in the presence of peroxides gives the anti-Markovnikov product.",

    trigger: alkeneTrigger,

    transform: {
        type: "rdkitReactionSmarts",
        smarts: "[C:1]=[C:2]>>[C:1][C:2]([Br])"
    },

    priority: 115
},

  {
    id: "alkene-halogenation-bromine",
    family: "alkenes",
    title: "Halogenation",
    reagents: "Br₂, CCl₄",
    reagentNote: "Anti addition of halogen",
    productHint: "Vicinal dibromide",
    explanation:
      "Halogenation adds one bromine to each alkene carbon.",
    trigger: alkeneTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([Br])[C:2]([Br])",
    },
    priority: 120,
  },

  {
    id: "alkene-halohydrin-formation",
    family: "alkenes",
    title: "Halohydrin Formation",
    reagents: "Br₂, H₂O",
    reagentNote: "Anti addition of Br and OH",
    productHint: "Halohydrin",
    explanation:
      "Water opens the bromonium ion, giving an alcohol and bromide on adjacent carbons.",
    trigger: alkeneTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([Br])[C:2]([OH])",
    },
    priority: 130,
  },

  {
    id: "alkene-acid-hydration",
    family: "alkenes",
    title: "Acid-Catalyzed Hydration",
    reagents: "H₃O⁺",
    reagentNote: "Markovnikov hydration",
    productHint: "Alcohol",
    explanation:
      "Acid-catalyzed hydration adds water across the alkene to form an alcohol.",
    trigger: alkeneTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([OH])[C:2]",
    },
    priority: 140,
  },

  {
    id: "alkene-hydroboration-oxidation",
    family: "alkenes",
    title: "Hydroboration-Oxidation",
    reagents: "1) BH₃·THF  2) H₂O₂, NaOH",
    reagentNote: "Anti-Markovnikov, syn hydration",
    productHint: "Alcohol",
    explanation:
      "Hydroboration-oxidation hydrates the alkene with anti-Markovnikov orientation.",
    trigger: alkeneTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1][C:2]([OH])",
    },
    priority: 150,
  },

  

  {
    id: "alkene-oxymercuration-demercuration",
    family: "alkenes",
    title: "Oxymercuration-Demercuration",
    reagents: "1) Hg(OAc)₂, H₂O  2) NaBH₄",
    reagentNote: "Markovnikov hydration, no rearrangement",
    productHint: "Alcohol",
    explanation:
      "Oxymercuration-demercuration converts an alkene to a Markovnikov alcohol without rearrangement.",
    trigger: alkeneTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([OH])[C:2]",
    },
    priority: 160,
  },

  {
    id: "alkene-simmons-smith",

    family: "alkenes",

    title: "Simmons–Smith Cyclopropanation",

    reagents: "CH2I2, Zn(Cu)",

    reagentNote: "Cyclopropane formation",

    productHint: "Cyclopropane",

    explanation:
        "A methylene carbene equivalent inserts across the double bond to form a cyclopropane.",

    trigger: alkeneTrigger,

    transform: {
        type: "rdkitReactionSmarts",
        smarts: "[C:1]=[C:2]>>[C:1]1[C][C:2]1"
    },

    priority: 165
  },

  {
    id: "alkene-epoxidation",
    family: "alkenes",
    title: "Epoxidation",
    reagents: "mCPBA",
    reagentNote: "Concerted oxygen transfer",
    productHint: "Epoxide",
    explanation:
      "A peroxyacid converts the alkene into a three-membered epoxide ring.",
    trigger: alkeneTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]1[O][C:2]1",
    },
    priority: 170,
  },

  {
    id: "epoxide-opening",

    family: "alkenes",

    title: "Epoxide Ring Opening",

    reagents: "H3O+",

    reagentNote: "Acid-catalyzed",

    productHint: "Trans diol",

    explanation:
        "Acidic opening of an epoxide produces a trans vicinal diol.",

    trigger: {
        functionalGroups: ["Epoxide"]
    },

    transform: {
        type: "rdkitReactionSmarts",
        smarts: "[C:1]1O[C:2]1>>[C:1](O)[C:2](O)"
    },

    priority: 175
  },

  {
    id: "alkene-syn-dihydroxylation",
    family: "alkenes",
    title: "Syn Dihydroxylation",
    reagents: "OsO₄, NMO",
    reagentNote: "Syn addition of two OH groups",
    productHint: "Vicinal diol",
    explanation:
      "Syn dihydroxylation adds two hydroxyl groups across the alkene.",
    trigger: alkeneTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([OH])[C:2]([OH])",
    },
    priority: 180,
  },

  {
    id: "cold-kmno4",

    family: "alkenes",

    title: "Cold Permanganate Oxidation",

    reagents: "KMnO4, OH-, cold",

    reagentNote: "Syn hydroxylation",

    productHint: "Cis diol",

    explanation:
        "Cold dilute permanganate adds two hydroxyl groups syn across the alkene.",

    trigger: alkeneTrigger,

    transform: {
        type: "rdkitReactionSmarts",
        smarts: "[C:1]=[C:2]>>[C:1](O)[C:2](O)"
    },

    priority: 181
  },

  {
    id: "alkene-anti-dihydroxylation",
    family: "alkenes",
    title: "Anti Dihydroxylation",
    reagents: "1) mCPBA  2) H₃O⁺",
    reagentNote: "Epoxidation then anti opening",
    productHint: "Vicinal diol",
    explanation:
      "Epoxidation followed by acid-catalyzed ring opening gives an anti vicinal diol.",
    trigger: alkeneTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1]([OH])[C:2]([OH])",
    },
    priority: 190,
  },

    {
        id: "alkene-ozonolysis-reductive",
        family: "alkenes",
        title: "Reductive Ozonolysis",
        reagents: "1) O₃  2) (CH₃)₂S or Zn/H₂O",
        reagentNote: "Reductive workup",
        productHint: "Aldehydes / Ketones",
        explanation:
            "Ozone cleaves the alkene. Dimethyl sulfide or zinc prevents further oxidation, giving aldehydes and ketones.",
        trigger: alkeneTrigger,
        transform: {
            type: "rdkitReactionSmarts",
            smarts:
                "[C:1]=[C:2]>>[C:1]=O.[C:2]=O"
        },
        priority: 200
    },

    {
    id: "alkene-ozonolysis-oxidative",
    family: "alkenes",
    title: "Oxidative Ozonolysis",
    reagents: "1) O₃  2) H₂O₂",
    reagentNote: "Oxidative workup",
    productHint: "Carboxylic acids",
    explanation:
        "Oxidative workup converts any aldehydes formed during ozonolysis into carboxylic acids while ketones remain ketones.",
    trigger: alkeneTrigger,
    transform: {
        type: "rdkitReactionSmarts",
        smarts:
            "[C:1]=[C:2]>>[C:1](=O)O.[C:2](=O)O"
    },
    priority: 201
},

  {
    id: "alkene-oxidative-cleavage",
    family: "alkenes",
    title: "Oxidative Cleavage",
    reagents: "KMnO₄, heat",
    reagentNote: "Strong oxidative cleavage",
    productHint: "Oxidized carbonyl products",
    explanation:
      "Hot permanganate cleaves the alkene under strongly oxidative conditions.",
    trigger: alkeneTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[C:2]>>[C:1](=O)O.[C:2](=O)O",
    },
    priority: 210,
  },

  {
    id: "ether-ozonolysis-reductive-workup",
    family: "ethers",
    title: "Ether as Reductive Workup Reagent",
    reagents: "1) O₃  2) sulfide ether",
    reagentNote: "Thioether-type reducing workup",
    productHint: "Carbonyl products",
    explanation:
      "Thioethers can act as reducing agents during ozonolysis workup, giving aldehydes and ketones.",
    trigger: alkeneTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][O:2][C:3]>>[C:1][O:2][C:3]",
    },
    priority: 220,
  },
];