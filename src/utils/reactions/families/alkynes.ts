import type { ReactionRule } from "../reactionTypes";

const alkyneTrigger = {
  anyFunctionalGroups: [
    "Alkyne",
    "Terminal alkyne",
    "Internal alkyne",
    "Cycloalkyne",
    "Enyne",
  ],
  includeSmarts: ["[C]#[C]"],
};

const terminalAlkyneTrigger = {
  anyFunctionalGroups: ["Terminal alkyne", "Alkyne", "Enyne"],
  includeSmarts: ["[C]#[CH]"],
};

const internalAlkyneTrigger = {
  anyFunctionalGroups: ["Internal alkyne", "Alkyne", "Cycloalkyne", "Enyne"],
  includeSmarts: ["[#6][C]#[C][#6]"],
};

// Alkyne-forming reactions are kept in the alkyne family even though their
// starting substrate is a dihalide. This makes them show up with the chemistry
// they synthesize and gives retrosynthesis an automatic alkyne -> dihalide path.
const vicinalDihalideTrigger = {
  includeSmarts: ["[C;H1,H2]([Cl,Br,I])-[C;H1,H2]([Cl,Br,I])"],
};

const geminalDihalideTrigger = {
  includeSmarts: ["[C;H2,H3]-[C]([Cl,Br,I])([Cl,Br,I])"],
};

const hydroborationAlternativeReagents =
  "1) BH₃·THF  2) H₂O₂, OH⁻; 1) (Sia)₂BH  2) H₂O₂, OH⁻; or 1) 9-BBN  2) H₂O₂, OH⁻";

type Hydrohalogen = {
  symbol: "Cl" | "Br" | "I";
  acid: "HCl" | "HBr" | "HI";
  name: "Hydrochlorination" | "Hydrobromination" | "Hydroiodination";
  vinylHint: string;
  geminalHint: string;
};

const hydrohalogens: Hydrohalogen[] = [
  {
    symbol: "Cl",
    acid: "HCl",
    name: "Hydrochlorination",
    vinylHint: "Vinyl chloride",
    geminalHint: "Geminal dichloride",
  },
  {
    symbol: "Br",
    acid: "HBr",
    name: "Hydrobromination",
    vinylHint: "Vinyl bromide",
    geminalHint: "Geminal dibromide",
  },
  {
    symbol: "I",
    acid: "HI",
    name: "Hydroiodination",
    vinylHint: "Vinyl iodide",
    geminalHint: "Geminal diiodide",
  },
];

function terminalHydrohalogenationRules(
  halogen: Hydrohalogen,
  basePriority: number,
): ReactionRule[] {
  return [
    {
      id: `alkyne-${halogen.acid.toLowerCase()}-addition-one-equivalent-terminal`,
      family: "alkynes",
      reactionType: "addition",
      title: `Hydrohalogenation: ${halogen.name} (1 equiv)`,
      reagents: `1 equiv ${halogen.acid}`,
      reagentNote: "Markovnikov addition to a terminal alkyne",
      productHint: halogen.vinylHint,
      explanation:
        `One equivalent of ${halogen.acid} adds to a terminal alkyne with Markovnikov orientation, placing ${halogen.symbol} on the substituted alkyne carbon and H on the terminal carbon.`,
      trigger: terminalAlkyneTrigger,
      transform: {
        type: "reactionSmarts",
        smarts: `[C:1]#[CH:2]>>[C:1]([${halogen.symbol}])=[CH2:2]`,
        maxProducts: 4,
      },
      productStatus: "computed",
      mechanism: "Electrophilic addition",
      selectivityProfile: {
        regiochemistry: { mode: "markovnikov", regioselective: true },
        mixture: "possible",
      },
      selectivity: [
        `${halogen.symbol} is placed on the more substituted alkyne carbon (Markovnikov orientation).`,
      ],
      priority: basePriority,
    },
    {
      id: `alkyne-${halogen.acid.toLowerCase()}-addition-excess-terminal`,
      family: "alkynes",
      reactionType: "addition",
      title: `Hydrohalogenation: Excess ${halogen.acid}`,
      reagents: `Excess ${halogen.acid}`,
      reagentNote: "Two Markovnikov additions",
      productHint: halogen.geminalHint,
      explanation:
        `Excess ${halogen.acid} adds twice to a terminal alkyne, giving the Markovnikov geminal dihalide with both ${halogen.symbol} atoms on the substituted carbon.`,
      trigger: terminalAlkyneTrigger,
      transform: {
        type: "reactionSmarts",
        smarts: `[C:1]#[CH:2]>>[C:1]([${halogen.symbol}])([${halogen.symbol}])[CH3:2]`,
        maxProducts: 4,
      },
      productStatus: "computed",
      mechanism: "Electrophilic addition",
      selectivityProfile: {
        regiochemistry: { mode: "markovnikov", regioselective: true },
        mixture: "single",
      },
      selectivity: ["Geminal dihalide", "Markovnikov for terminal alkynes"],
      priority: basePriority + 10,
    },
  ];
}

function internalHydrohalogenationRules(
  halogen: Hydrohalogen,
  basePriority: number,
): ReactionRule[] {
  return [
    {
      id: `alkyne-${halogen.acid.toLowerCase()}-addition-one-equivalent-internal`,
      family: "alkynes",
      reactionType: "addition",
      title: `Hydrohalogenation: ${halogen.name} (1 equiv)`,
      reagents: `1 equiv ${halogen.acid}`,
      reagentNote: "Addition to an internal alkyne",
      productHint: halogen.vinylHint,
      explanation:
        `One equivalent of ${halogen.acid} converts an internal alkyne into a vinyl halide. Unsymmetrical internal alkynes can give constitutional and E/Z mixtures.`,
      trigger: internalAlkyneTrigger,
      transform: {
        type: "reactionSmarts",
        smarts: `[C:1]#[C:2]>>[C:1]([${halogen.symbol}])=[C:2]`,
        maxProducts: 8,
      },
      productStatus: "representative",
      mechanism: "Electrophilic addition",
      selectivityProfile: { mixture: "possible" },
      selectivity: ["E/Z mixtures may form"],
      limitations: [
        "Unsymmetrical internal alkynes can give more than one constitutional vinyl-halide product.",
      ],
      priority: basePriority + 1,
    },
    {
      id: `alkyne-${halogen.acid.toLowerCase()}-addition-excess-internal`,
      family: "alkynes",
      reactionType: "addition",
      title: `Hydrohalogenation: Excess ${halogen.acid}`,
      reagents: `Excess ${halogen.acid}`,
      reagentNote: "Addition across both pi bonds",
      productHint: halogen.geminalHint,
      explanation:
        `Excess ${halogen.acid} adds twice to an internal alkyne to form a geminal dihalide. Unsymmetrical alkynes can give regioisomeric products.`,
      trigger: internalAlkyneTrigger,
      transform: {
        type: "reactionSmarts",
        smarts: `[C:1]#[C:2]>>[C:1]([${halogen.symbol}])([${halogen.symbol}])[C:2]`,
        maxProducts: 8,
      },
      productStatus: "representative",
      mechanism: "Electrophilic addition",
      selectivityProfile: { mixture: "possible" },
      selectivity: ["Geminal dihalide"],
      limitations: [
        "Unsymmetrical internal alkynes can give more than one geminal-dihalide regioisomer.",
      ],
      priority: basePriority + 11,
    },
  ];
}

export const alkyneReactionRules: ReactionRule[] = [
  // ---------------------------------------------------------------------------
  // SYNTHESIS OF ALKYNES
  // ---------------------------------------------------------------------------
  {
    id: "alkyne-synthesis-double-dehydrohalogenation-vicinal",
    family: "alkynes",
    reactionType: "elimination",
    reactionClass: "double dehydrohalogenation",
    title: "Double Dehydrohalogenation: Alkyne Synthesis",
    reagents: "1) excess NaNH₂, NH₃(l)  2) H₂O",
    reagentNote: "Vicinal dihalide → alkyne",
    productHint: "Alkyne",
    explanation:
      "Two successive E2 eliminations remove two equivalents of HX from a vicinal dihalide to form an alkyne. A water workup reprotonates a terminal acetylide if excess base was used.",
    trigger: vicinalDihalideTrigger,
    transform: {
      type: "reactionSmarts",
      smarts:
        "[C;H1,H2:1]([Cl,Br,I:3])-[C;H1,H2:2]([Cl,Br,I:4])>>[C:1]#[C:2]",
      maxProducts: 8,
    },
    productStatus: "computed",
    mechanism: "Two successive E2 eliminations",
    selectivity: ["Requires a hydrogen on each carbon involved in alkyne formation"],
    priority: 260,
  },
  {
    id: "alkyne-synthesis-double-dehydrohalogenation-geminal",
    family: "alkynes",
    reactionType: "elimination",
    reactionClass: "double dehydrohalogenation",
    title: "Double Dehydrohalogenation: Alkyne Synthesis",
    reagents: "1) excess NaNH₂, NH₃(l)  2) H₂O",
    reagentNote: "Geminal dihalide → alkyne",
    productHint: "Alkyne",
    explanation:
      "A strong amide base removes two equivalents of HX from a geminal dihalide in two successive eliminations to form an alkyne. Water workup restores a terminal alkyne when needed.",
    trigger: geminalDihalideTrigger,
    transform: {
      type: "reactionSmarts",
      smarts:
        "[C;H2,H3:1]-[C:2]([Cl,Br,I:3])([Cl,Br,I:4])>>[C:1]#[C:2]",
      maxProducts: 8,
    },
    productStatus: "computed",
    mechanism: "Two successive E2 eliminations",
    priority: 261,
  },

  // ---------------------------------------------------------------------------
  // REDUCTIONS / ISOTOPE VARIANTS
  // ---------------------------------------------------------------------------
  {
    id: "alkyne-hydrogenation",
    family: "alkynes",
    reactionType: "reduction",
    title: "Complete Hydrogenation",
    reagents: "Excess H₂, Pt; or Excess H₂, Pd/C",
    reagentNote: "Full catalytic reduction",
    productHint: "Alkane",
    explanation:
      "Excess hydrogen over a metal catalyst reduces both pi bonds of an alkyne to give an alkane.",
    trigger: alkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[C:2]>>[C:1][C:2]",
    },
    mechanism: "Catalytic hydrogenation",
    priority: 300,
  },
  {
    id: "alkyne-complete-deuteration",
    family: "alkynes",
    reactionType: "reduction",
    title: "Complete Catalytic Deuteration",
    reagents: "Excess D₂, Pt; or Excess D₂, Pd/C",
    reagentNote: "Full reduction with deuterium",
    productHint: "Deuterated alkane",
    explanation:
      "Excess D₂ reduces both pi bonds. Each alkyne carbon receives two explicit deuterium atoms while any hydrogen already present on a terminal alkyne is retained.",
    trigger: alkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[C:2]>>[C:1]([2H])([2H])[C:2]([2H])([2H])",
      maxProducts: 4,
    },
    productStatus: "computed",
    mechanism: "Catalytic deuteration",
    selectivityProfile: {
      stereochemistry: { mode: "syn-addition", stereospecific: true },
      mixture: "possible",
      allowsRearrangement: false,
    },
    priority: 305,
  },
  {
    id: "alkyne-lindlar-reduction-internal",
    family: "alkynes",
    reactionType: "reduction",
    title: "Lindlar Reduction (Syn)",
    reagents: "H₂, Lindlar catalyst",
    reagentNote: "Syn addition; cis/Z alkene",
    productHint: "(Z)-alkene",
    explanation:
      "Lindlar catalyst adds hydrogen syn and stops at the alkene. An internal alkyne therefore gives the cis/Z alkene.",
    trigger: internalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[*:3][C:1]#[C:2][*:4]>>[*:3]/[C:1]=[C:2]\\[*:4]",
      maxProducts: 8,
    },
    productStatus: "computed",
    mechanism: "Catalytic hydrogenation",
    selectivityProfile: {
      stereochemistry: { mode: "z-preferred", stereospecific: true },
      mixture: "single",
      allowsRearrangement: false,
    },
    selectivity: ["Syn addition", "Z/cis alkene"],
    priority: 310,
  },
  {
    id: "alkyne-lindlar-reduction-terminal",
    family: "alkynes",
    reactionType: "reduction",
    title: "Lindlar Reduction (Syn)",
    reagents: "H₂, Lindlar catalyst",
    reagentNote: "Syn partial reduction",
    productHint: "Terminal alkene",
    explanation:
      "Lindlar catalyst partially reduces a terminal alkyne to the terminal alkene. E/Z nomenclature does not apply to a terminal CH₂ alkene carbon.",
    trigger: terminalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[CH:2]>>[C:1]=[CH2:2]",
      maxProducts: 4,
    },
    productStatus: "computed",
    mechanism: "Catalytic hydrogenation",
    selectivityProfile: {
      stereochemistry: { mode: "syn-addition", stereospecific: true },
      mixture: "single",
      allowsRearrangement: false,
    },
    selectivity: ["Syn addition"],
    priority: 311,
  },
  {
    id: "alkyne-lindlar-deuteration-internal",
    family: "alkynes",
    reactionType: "reduction",
    title: "Lindlar Deuteration (Syn)",
    reagents: "D₂, Lindlar catalyst",
    reagentNote: "Syn addition of D₂; cis/Z alkene",
    productHint: "cis-1,2-dideuterated alkene",
    explanation:
      "D₂ on Lindlar catalyst adds one explicit D to each alkyne carbon from the same face and stops at the cis/Z alkene.",
    trigger: internalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts:
        "[*:3][C:1]#[C:2][*:4]>>[*:3]/[C:1]([2H])=[C:2]([2H])\\[*:4]",
      maxProducts: 8,
    },
    productStatus: "computed",
    mechanism: "Catalytic deuteration",
    selectivityProfile: {
      stereochemistry: { mode: "z-preferred", stereospecific: true },
      mixture: "single",
      allowsRearrangement: false,
    },
    selectivity: ["D and D add syn", "Z/cis alkene"],
    priority: 312,
  },
  {
    id: "alkyne-lindlar-deuteration-terminal",
    family: "alkynes",
    reactionType: "reduction",
    title: "Lindlar Deuteration (Syn)",
    reagents: "D₂, Lindlar catalyst",
    reagentNote: "Syn addition of D₂",
    productHint: "1,2-dideuterated terminal alkene",
    explanation:
      "D₂ on Lindlar catalyst adds one explicit D to each alkyne carbon and stops at the alkene.",
    trigger: terminalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[CH:2]>>[C:1]([2H])=[C:2]([2H])",
      maxProducts: 4,
    },
    productStatus: "computed",
    mechanism: "Catalytic deuteration",
    selectivityProfile: {
      stereochemistry: { mode: "syn-addition", stereospecific: true },
      mixture: "single",
      allowsRearrangement: false,
    },
    selectivity: ["D and D add syn"],
    priority: 313,
  },
  {
    id: "alkyne-dissolving-metal-reduction-internal",
    family: "alkynes",
    reactionType: "reduction",
    title: "Dissolving-Metal Reduction (Anti)",
    reagents: "Na, NH₃(l); or Li, NH₃(l)",
    reagentNote: "Anti addition; trans/E alkene",
    productHint: "(E)-alkene",
    explanation:
      "Single-electron transfer and protonation occur twice from opposite faces, giving anti addition and the trans/E alkene from an internal alkyne.",
    trigger: internalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[*:3][C:1]#[C:2][*:4]>>[*:3]/[C:1]=[C:2]/[*:4]",
      maxProducts: 8,
    },
    productStatus: "computed",
    mechanism: "Dissolving-metal reduction",
    selectivityProfile: {
      stereochemistry: { mode: "e-preferred", stereospecific: true },
      mixture: "single",
      allowsRearrangement: false,
    },
    selectivity: ["Anti addition", "E/trans alkene"],
    priority: 320,
  },
  {
    id: "alkyne-dissolving-metal-reduction-terminal",
    family: "alkynes",
    reactionType: "reduction",
    title: "Dissolving-Metal Reduction (Anti)",
    reagents: "Na, NH₃(l); or Li, NH₃(l)",
    reagentNote: "Partial reduction",
    productHint: "Terminal alkene",
    explanation:
      "Dissolving-metal reduction converts a terminal alkyne to the corresponding terminal alkene. E/Z nomenclature does not apply to a terminal CH₂ alkene carbon.",
    trigger: terminalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[CH:2]>>[C:1]=[CH2:2]",
      maxProducts: 4,
    },
    productStatus: "computed",
    mechanism: "Dissolving-metal reduction",
    selectivity: ["Anti addition mechanism"],
    priority: 321,
  },
  {
    id: "alkyne-dissolving-metal-deuteration-internal",
    family: "alkynes",
    reactionType: "reduction",
    title: "Dissolving-Metal Deuteration (Anti)",
    reagents: "Na, ND₃(l); or Li, ND₃(l)",
    reagentNote: "Anti addition of D; trans/E alkene",
    productHint: "trans-1,2-dideuterated alkene",
    explanation:
      "Using ND₃ as the deuterium source gives anti delivery of one D to each alkyne carbon and the trans/E alkene.",
    trigger: internalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts:
        "[*:3][C:1]#[C:2][*:4]>>[*:3]/[C:1]([2H])=[C:2]([2H])/[*:4]",
      maxProducts: 8,
    },
    productStatus: "computed",
    mechanism: "Dissolving-metal reduction",
    selectivityProfile: {
      stereochemistry: { mode: "e-preferred", stereospecific: true },
      mixture: "single",
      allowsRearrangement: false,
    },
    selectivity: ["D and D add anti", "E/trans alkene"],
    priority: 322,
  },
  {
    id: "alkyne-dissolving-metal-deuteration-terminal",
    family: "alkynes",
    reactionType: "reduction",
    title: "Dissolving-Metal Deuteration (Anti)",
    reagents: "Na, ND₃(l); or Li, ND₃(l)",
    reagentNote: "Partial deuteration",
    productHint: "1,2-dideuterated terminal alkene",
    explanation:
      "Using ND₃ as the deuterium source gives one explicit D on each carbon as the terminal alkyne is reduced to an alkene.",
    trigger: terminalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[CH:2]>>[C:1]([2H])=[C:2]([2H])",
      maxProducts: 4,
    },
    productStatus: "computed",
    mechanism: "Dissolving-metal reduction",
    priority: 323,
  },

  // ---------------------------------------------------------------------------
  // HYDROHALOGENATION (HCl, HBr, and HI are separate so the product atom is exact)
  // ---------------------------------------------------------------------------
  ...terminalHydrohalogenationRules(hydrohalogens[0], 330),
  ...internalHydrohalogenationRules(hydrohalogens[0], 330),
  ...terminalHydrohalogenationRules(hydrohalogens[1], 350),
  ...internalHydrohalogenationRules(hydrohalogens[1], 350),
  ...terminalHydrohalogenationRules(hydrohalogens[2], 370),
  ...internalHydrohalogenationRules(hydrohalogens[2], 370),

  // ---------------------------------------------------------------------------
  // HALOGENATION (separate Br2 and Cl2 rules so the product matches the reagent)
  // ---------------------------------------------------------------------------
  {
    id: "alkyne-bromination-one-equivalent",
    family: "alkynes",
    reactionType: "addition",
    title: "Bromination: One Equivalent",
    reagents: "1 equiv Br₂",
    reagentNote: "Predominantly anti addition",
    productHint: "1,2-Dibromoalkene",
    explanation:
      "One equivalent of bromine adds across one pi bond to form a vicinal dibromoalkene, commonly favoring trans geometry.",
    trigger: alkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[C:2]>>[C:1]([Br])=[C:2]([Br])",
      maxProducts: 8,
    },
    productStatus: "representative",
    mechanism: "Electrophilic addition",
    selectivityProfile: {
      stereochemistry: { mode: "anti-addition", stereoselective: true },
      mixture: "possible",
    },
    selectivity: ["Predominantly anti addition"],
    limitations: ["General E/Z assignment for every substituted dihaloalkene is not yet enumerated."],
    priority: 400,
  },
  {
    id: "alkyne-chlorination-one-equivalent",
    family: "alkynes",
    reactionType: "addition",
    title: "Chlorination: One Equivalent",
    reagents: "1 equiv Cl₂",
    reagentNote: "Predominantly anti addition",
    productHint: "1,2-Dichloroalkene",
    explanation:
      "One equivalent of chlorine adds across one pi bond to form a vicinal dichloroalkene, commonly favoring trans geometry.",
    trigger: alkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[C:2]>>[C:1]([Cl])=[C:2]([Cl])",
      maxProducts: 8,
    },
    productStatus: "representative",
    mechanism: "Electrophilic addition",
    selectivityProfile: {
      stereochemistry: { mode: "anti-addition", stereoselective: true },
      mixture: "possible",
    },
    selectivity: ["Predominantly anti addition"],
    limitations: ["General E/Z assignment for every substituted dihaloalkene is not yet enumerated."],
    priority: 401,
  },
  {
    id: "alkyne-bromination-excess",
    family: "alkynes",
    reactionType: "addition",
    title: "Bromination: Excess",
    reagents: "Excess Br₂",
    reagentNote: "Addition across both pi bonds",
    productHint: "1,1,2,2-Tetrabromoalkane",
    explanation:
      "Two equivalents of bromine add across the triple bond to form a tetrabromide.",
    trigger: alkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[C:2]>>[C:1]([Br])([Br])[C:2]([Br])([Br])",
      maxProducts: 8,
    },
    mechanism: "Electrophilic addition",
    priority: 410,
  },
  {
    id: "alkyne-chlorination-excess",
    family: "alkynes",
    reactionType: "addition",
    title: "Chlorination: Excess",
    reagents: "Excess Cl₂",
    reagentNote: "Addition across both pi bonds",
    productHint: "1,1,2,2-Tetrachloroalkane",
    explanation:
      "Two equivalents of chlorine add across the triple bond to form a tetrachloride.",
    trigger: alkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[C:2]>>[C:1]([Cl])([Cl])[C:2]([Cl])([Cl])",
      maxProducts: 8,
    },
    mechanism: "Electrophilic addition",
    priority: 411,
  },

  // ---------------------------------------------------------------------------
  // HYDRATION / HYDROBORATION
  // ---------------------------------------------------------------------------
  {
    id: "alkyne-mercury-hydration-terminal",
    family: "alkynes",
    reactionType: "addition",
    reactionClass: "mercury(II)-catalyzed hydration",
    title: "Mercury(II)-Catalyzed Hydration: Terminal Alkyne",
    reagents: "HgSO₄, H₂SO₄, H₂O",
    reagentNote: "Hg²⁺-catalyzed Markovnikov hydration, then tautomerization",
    productHint: "Methyl ketone",
    explanation:
      "Mercury(II) catalysis hydrates a terminal alkyne in the Markovnikov direction. The enol then tautomerizes to a methyl ketone.",
    trigger: terminalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[CH:2]>>[C:1](=O)[CH3:2]",
    },
    mechanism: "Mercury(II)-catalyzed hydration and keto-enol tautomerization",
    selectivityProfile: {
      regiochemistry: { mode: "markovnikov", regioselective: true },
      mixture: "single",
    },
    selectivity: ["Markovnikov hydration of a terminal alkyne"],
    priority: 430,
  },
  {
    id: "alkyne-mercury-hydration-internal",
    family: "alkynes",
    reactionType: "addition",
    reactionClass: "mercury(II)-catalyzed hydration",
    title: "Mercury(II)-Catalyzed Hydration: Internal Alkyne",
    reagents: "HgSO₄, H₂SO₄, H₂O",
    reagentNote: "Hg²⁺-catalyzed hydration, then tautomerization",
    productHint: "Ketone or ketone mixture",
    explanation:
      "Mercury(II)-catalyzed hydration of an internal alkyne gives an enol that tautomerizes to a ketone. Unsymmetrical alkynes can produce constitutional isomers.",
    trigger: internalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[C:2]>>[C:1](=O)[C:2]",
      maxProducts: 8,
    },
    productStatus: "representative",
    mechanism: "Mercury(II)-catalyzed hydration and keto-enol tautomerization",
    selectivityProfile: { mixture: "possible" },
    limitations: ["Unsymmetrical internal alkynes may give a ketone mixture."],
    priority: 431,
  },
  {
    id: "alkyne-hydroboration-oxidation",
    family: "alkynes",
    reactionType: "oxidation",
    title: "Hydroboration–Oxidation of a Terminal Alkyne",
    reagents: hydroborationAlternativeReagents,
    reagentNote: "Anti-Markovnikov hydration followed by tautomerization",
    productHint: "Aldehyde",
    explanation:
      "Hydroboration followed by oxidation gives the anti-Markovnikov enol, which tautomerizes to an aldehyde. (Sia)₂BH and 9-BBN are especially useful bulky reagents; BH₃ is less hindered and can be less selective.",
    trigger: terminalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[CH:2]>>[C:1][CH:2]=O",
    },
    mechanism: "Hydroboration, oxidation, and tautomerization",
    selectivityProfile: {
      regiochemistry: { mode: "anti-markovnikov", regioselective: true },
      mixture: "single",
    },
    selectivity: ["Anti-Markovnikov"],
    priority: 440,
  },
  {
    id: "alkyne-hydroboration-oxidation-internal",
    family: "alkynes",
    reactionType: "oxidation",
    title: "Hydroboration–Oxidation of an Internal Alkyne",
    reagents: hydroborationAlternativeReagents,
    reagentNote: "Hydration followed by tautomerization",
    productHint: "Ketone or ketone mixture",
    explanation:
      "Internal alkynes form ketones after hydroboration, oxidation, and tautomerization. Unsymmetrical substrates can give regioisomer mixtures; bulky boranes improve steric selectivity.",
    trigger: internalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[C:2]>>[C:1](=O)[C:2]",
      maxProducts: 8,
    },
    productStatus: "representative",
    mechanism: "Hydroboration, oxidation, and tautomerization",
    selectivityProfile: { mixture: "possible" },
    limitations: [
      "For unsymmetrical internal alkynes, PocketChem shows accessible ketone constitutions but does not yet quantitatively rank the sterically preferred regioisomer for each borane.",
    ],
    priority: 441,
  },

  // ---------------------------------------------------------------------------
  // OXIDATION / CLEAVAGE
  // ---------------------------------------------------------------------------
  {
    id: "alkyne-cold-kmno4-oxidation",
    family: "alkynes",
    reactionType: "oxidation",
    title: "Cold Permanganate Oxidation of an Internal Alkyne",
    reagents: "KMnO₄, H₂O, cold/dilute",
    reagentNote: "Mild oxidation",
    productHint: "1,2-Diketone",
    explanation:
      "Cold, dilute permanganate oxidizes an internal alkyne to a vicinal diketone without the vigorous cleavage associated with hot permanganate.",
    trigger: internalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C;H0:1]#[C;H0:2]>>[C:1](=O)[C:2](=O)",
    },
    productStatus: "computed",
    mechanism: "Mild permanganate oxidation",
    priority: 450,
  },
  {
    id: "alkyne-ozonolysis-cleavage",
    family: "alkynes",
    reactionType: "cleavage",
    title: "Alkyne Ozonolysis",
    reagents: "1) O₃  2) H₂O",
    reagentNote: "Oxidative cleavage",
    productHint: "Carboxylic acids; terminal carbon gives CO₂",
    explanation:
      "Ozonolysis cleaves an alkyne oxidatively. Internal alkyne carbons become carboxylic acids; a terminal alkyne carbon is ultimately oxidized to CO₂.",
    trigger: alkyneTrigger,
    transform: {
      type: "customHandler",
      handler: "oxidation",
      options: {
        mode: "alkyneOxidativeCleavage",
      },
    },
    productStatus: "computed",
    mechanism: "Oxidative cleavage",
    priority: 460,
  },
  {
    id: "alkyne-hot-kmno4-cleavage",
    family: "alkynes",
    reactionType: "cleavage",
    title: "Hot Permanganate Oxidative Cleavage",
    reagents: "1) KMnO₄, OH⁻, heat  2) H₃O⁺",
    reagentNote: "Strong oxidative cleavage",
    productHint: "Carboxylic acids; terminal carbon gives CO₂",
    explanation:
      "Hot permanganate cleaves an alkyne. Internal alkyne carbons form carboxylic acids, while a terminal alkyne carbon is oxidized to CO₂.",
    trigger: alkyneTrigger,
    transform: {
      type: "customHandler",
      handler: "oxidation",
      options: {
        mode: "alkyneOxidativeCleavage",
      },
    },
    productStatus: "computed",
    mechanism: "Strong oxidative cleavage",
    priority: 461,
  },

  // ---------------------------------------------------------------------------
  // ACETYLIDE CHEMISTRY / ALKYNE CHAIN EXTENSION
  // ---------------------------------------------------------------------------
  {
    id: "terminal-alkyne-deprotonation",
    family: "alkynes",
    reactionType: "acidBase",
    title: "Terminal Alkyne Deprotonation: Acetylide Ion Formation",
    reagents: "NaNH₂, NH₃(l)",
    reagentNote: "Formation of an acetylide ion",
    productHint: "Acetylide anion",
    explanation:
      "A terminal alkyne is acidic enough to be deprotonated by sodium amide, forming a carbon nucleophile.",
    trigger: terminalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[CH:2]>>[C:1]#[C-:2]",
    },
    mechanism: "Proton transfer",
    priority: 480,
  },
  {
    id: "terminal-alkyne-deuterium-exchange",
    family: "alkynes",
    reactionType: "acidBase",
    title: "Terminal Alkyne Deuterium Exchange",
    reagents: "1) NaNH₂, NH₃(l)  2) D₂O",
    reagentNote: "Replace the terminal alkyne H with D",
    productHint: "Terminal deuterioalkyne",
    explanation:
      "Deprotonation gives an acetylide ion; D₂O then quenches the acetylide with deuterium, replacing the terminal alkyne hydrogen with D.",
    trigger: terminalAlkyneTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[CH:2]>>[C:1]#[C:2][2H]",
      maxProducts: 4,
    },
    productStatus: "computed",
    mechanism: "Acid-base isotope exchange",
    priority: 485,
  },
  {
    id: "terminal-alkyne-alkylation",
    family: "alkynes",
    reactionType: "substitution",
    reactionClass: "acetylide SN2 alkylation",
    title: "Acetylide Alkylation: Alkyne Extension",
    reagents: "1) NaNH₂  2) methyl or primary R–X",
    reagentNote: "Acetylide formation followed by SN2",
    productHint: "Extended internal alkyne",
    explanation:
      "A terminal alkyne is deprotonated to an acetylide, which attacks a methyl or primary alkyl halide by SN2 to form a new carbon-carbon bond and extend the alkyne carbon skeleton.",
    trigger: terminalAlkyneTrigger,
    additionalReactants: [
      {
        label: "methyl or primary alkyl halide",
        trigger: {
          includeSmarts: ["[C;X4;H2,H3][Cl,Br,I]"],
        },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]#[CH:2].[C;X4:3][Cl,Br,I]>>[C:1]#[C:2]-[C:3]",
      maxProducts: 8,
    },
    productStatus: "computed",
    mechanism: "Proton transfer followed by SN2",
    limitations: ["Secondary and tertiary alkyl halides favor elimination instead of clean acetylide SN2."],
    priority: 490,
  },
];
