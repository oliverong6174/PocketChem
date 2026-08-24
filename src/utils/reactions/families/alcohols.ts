import type { ReactionRule } from "../reactionTypes";

const alcoholTrigger = {
  anyFunctionalGroups: [
    "Alcohol",
    "Primary alcohol",
    "Secondary alcohol",
    "Tertiary alcohol",
    "Benzyl alcohol",
  ],
};

const primaryAlcoholTrigger = {
  anyFunctionalGroups: ["Primary alcohol", "Benzyl alcohol"],
  includeSmarts: ["[CH2][OH]"],
};

const secondaryAlcoholTrigger = {
  anyFunctionalGroups: ["Secondary alcohol"],
  includeSmarts: ["[CH]([#6])([#6])[OH]"],
};

const primaryOrSecondaryAlcoholTrigger = {
  anyFunctionalGroups: [
    "Primary alcohol",
    "Secondary alcohol",
    "Benzyl alcohol",
  ],
};

export const alcoholReactionRules: ReactionRule[] = [
  {
    id: "alcohol-deprotonation",
    family: "alcohols",
    title: "Alcohol Deprotonation",
    reagents: "NaH, KH, or Na metal",
    reagentNote: "Formation of an alkoxide",
    productHint: "Alkoxide ion",
    explanation:
      "A sufficiently strong base removes the alcohol proton to form an alkoxide, a strong nucleophile and base.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O-:2]",
    },
    mechanism: "Proton transfer",
    priority: 490,
  },
  {
    id: "alcohol-dehydration-alkene",
    family: "alcohols",
    title: "Alcohol Dehydration to an Alkene",
    reagents: "Concentrated H₂SO₄ or H₃PO₄, heat",
    reagentNote: "Acid-catalyzed elimination",
    productHint: "Alkene or alkene mixture",
    explanation:
      "Protonation converts hydroxyl into water, then elimination forms an alkene. Secondary and tertiary alcohols commonly react by E1; primary alcohols usually require harsher conditions.",
    trigger: {
      ...alcoholTrigger,
      includeSmarts: ["[C;H1,H2,H3][C;H0,H1,H2][OH]"],
    },
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C;H1,H2,H3:1][C:2][OH:3]>>[C:1]=[C:2]",
      maxProducts: 6,
    },
    productStatus: "representative",
    mechanism: "E1 or E2 dehydration",
    selectivity: ["Usually Zaitsev", "Rearrangements are possible in E1 reactions"],
    limitations: [
      "The engine enumerates possible beta eliminations but does not yet rank alkene stability or carbocation rearrangements.",
    ],
    priority: 500,
  },
  {
    id: "alcohol-dehydration-ether",
    family: "alcohols",
    title: "Intermolecular Alcohol Dehydration",
    reagents: "Concentrated H₂SO₄, about 130–140 °C",
    reagentNote: "Bimolecular ether formation",
    productHint: "Symmetrical ether",
    explanation:
      "Under controlled lower-temperature acidic conditions, unhindered primary alcohols can form symmetrical ethers.",
    trigger: primaryAlcoholTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "This reaction consumes two alcohol molecules, so the one-reactant engine must duplicate the substrate before generating an exact ether.",
    },
    mechanism: "SN2 after alcohol protonation",
    limitations: ["Most useful for unhindered primary alcohols."],
    priority: 510,
  },
  {
    id: "alcohol-hbr-substitution",
    family: "alcohols",
    title: "Alcohol Conversion with HBr",
    reagents: "HBr",
    reagentNote: "Conversion of OH into Br",
    productHint: "Alkyl bromide",
    explanation:
      "After protonation of hydroxyl, bromide replaces water. Primary alcohols tend to react by SN2; secondary and tertiary alcohols can react by SN1.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1]Br",
    },
    productStatus: "representative",
    mechanism: "SN1 or SN2",
    selectivity: ["SN2 inversion for primary substrates", "SN1 rearrangement and racemization may occur"],
    priority: 520,
  },
  {
    id: "alcohol-lucas-reagent",
    family: "alcohols",
    title: "Lucas Reagent Conversion",
    reagents: "Concentrated HCl, ZnCl₂",
    reagentNote: "Fast for tertiary; slower for secondary alcohols",
    productHint: "Alkyl chloride",
    explanation:
      "Zinc chloride activates the alcohol and chloride replaces water. The reaction is also used to distinguish alcohol classes by reaction rate.",
    trigger: {
      anyFunctionalGroups: ["Secondary alcohol", "Tertiary alcohol", "Benzyl alcohol"],
    },
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1]Cl",
    },
    productStatus: "representative",
    mechanism: "Usually SN1 for tertiary and many secondary alcohols",
    selectivity: ["Rearrangements and racemization may occur"],
    priority: 530,
  },
  {
    id: "alcohol-pbr3",
    family: "alcohols",
    title: "Alcohol to Alkyl Bromide with PBr₃",
    reagents: "PBr₃",
    reagentNote: "Best for primary and secondary alcohols",
    productHint: "Alkyl bromide",
    explanation:
      "PBr₃ converts primary and secondary alcohols into alkyl bromides without forming a free carbocation.",
    trigger: primaryOrSecondaryAlcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1]Br",
    },
    productStatus: "representative",
    mechanism: "SN2 substitution",
    selectivity: ["Inversion at a reacting stereocenter"],
    priority: 540,
  },
  {
    id: "alcohol-socl2",
    family: "alcohols",
    title: "Alcohol to Alkyl Chloride with SOCl₂",
    reagents: "SOCl₂, pyridine",
    reagentNote: "Formation and displacement of a chlorosulfite",
    productHint: "Alkyl chloride",
    explanation:
      "Thionyl chloride converts alcohols into alkyl chlorides; pyridine commonly promotes substitution with inversion.",
    trigger: primaryOrSecondaryAlcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1]Cl",
    },
    productStatus: "representative",
    mechanism: "Substitution through a chlorosulfite intermediate",
    selectivity: ["Often inversion with pyridine"],
    priority: 550,
  },
  {
    id: "primary-alcohol-mild-oxidation",
    family: "alcohols",
    title: "Primary Alcohol Oxidation to an Aldehyde",
    reagents: "PCC, DMP, or Swern oxidation",
    reagentNote: "Anhydrous mild oxidation",
    productHint: "Aldehyde",
    explanation:
      "Mild, water-free oxidants convert a primary alcohol into an aldehyde without substantial overoxidation.",
    trigger: primaryAlcoholTrigger,
    transform: {
      type: "engineHandler",
      handler: "oxidation",
      options: {
        mode: "alcoholOxidation",
        level: "mild",
      },
    },
    productStatus: "computed",
    mechanism: "Oxidation",
    priority: 560,
  },
  {
    id: "primary-alcohol-strong-oxidation",
    family: "alcohols",
    title: "Primary Alcohol Oxidation to a Carboxylic Acid",
    reagents: "Jones reagent, Na₂Cr₂O₇/H₂SO₄, or hot KMnO₄",
    reagentNote: "Strong aqueous oxidation",
    productHint: "Carboxylic acid",
    explanation:
      "Strong aqueous oxidants convert a primary alcohol through the aldehyde hydrate to a carboxylic acid.",
    trigger: primaryAlcoholTrigger,
    transform: {
      type: "engineHandler",
      handler: "oxidation",
      options: {
        mode: "alcoholOxidation",
        level: "strong",
      },
    },
    productStatus: "computed",
    mechanism: "Oxidation",
    priority: 570,
  },
  {
    id: "secondary-alcohol-oxidation",
    family: "alcohols",
    title: "Secondary Alcohol Oxidation",
    reagents: "PCC, DMP, Jones reagent, or NaOCl",
    reagentNote: "Oxidation to a ketone",
    productHint: "Ketone",
    explanation:
      "A secondary alcohol loses one hydrogen from oxygen and one from carbon to form a ketone.",
    trigger: secondaryAlcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][CH:2]([OH:3])[C:4]>>[C:1][C:2](=[O:3])[C:4]",
    },
    mechanism: "Oxidation",
    priority: 580,
  },
  {
    id: "benzylic-allylic-alcohol-oxidation",
    family: "alcohols",
    title: "Selective Allylic or Benzylic Alcohol Oxidation",
    reagents: "MnO₂",
    reagentNote: "Selective oxidation beside a pi system",
    productHint: "Aldehyde or ketone",
    explanation:
      "Activated manganese dioxide selectively oxidizes primary or secondary allylic and benzylic alcohols while often leaving ordinary alcohols unchanged.",
    trigger: {
      ...alcoholTrigger,
      includeSmarts: [
        "[$([c][CH1,CH2][OH]),$([C]=[C][CH1,CH2][OH])]",
      ],
    },
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C,c:1][CH1,CH2:2][OH:3]>>[C,c:1][C:2]=[O:3]",
      maxProducts: 4,
    },
    mechanism: "Oxidation",
    priority: 590,
  },
  {
    id: "fischer-esterification",
    family: "alcohols",
    title: "Fischer Esterification",
    reagents: "Carboxylic acid, catalytic H₂SO₄, heat",
    reagentNote: "Reversible condensation",
    productHint: "Ester",
    explanation:
      "An alcohol and a carboxylic acid equilibrate with an ester and water under acid catalysis.",
    trigger: alcoholTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "The carboxylic acid reactant must be specified before an exact ester can be generated.",
    },
    mechanism: "Acid-catalyzed nucleophilic acyl substitution",
    limitations: ["Removing water or using excess reactant drives the equilibrium toward ester."],
    priority: 600,
  },
  {
    id: "alcohol-acid-chloride-esterification",
    family: "alcohols",
    title: "Ester Formation with an Acyl Halide",
    reagents: "Acyl chloride, pyridine or another base",
    reagentNote: "Nucleophilic acyl substitution",
    productHint: "Ester",
    explanation:
      "An alcohol attacks an acyl halide to form an ester; base neutralizes the hydrogen halide byproduct.",
    trigger: alcoholTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "The acyl halide reactant must be specified before an exact ester can be generated.",
    },
    mechanism: "Nucleophilic acyl substitution",
    priority: 610,
  },
  {
    id: "alcohol-tosylation",
    family: "alcohols",
    title: "Tosylate Formation",
    reagents: "TsCl, pyridine",
    reagentNote: "Convert OH into a good leaving group",
    productHint: "Alkyl tosylate",
    explanation:
      "The alcohol oxygen attacks tosyl chloride. The carbon-oxygen bond is retained, so configuration at carbon is unchanged during tosylate formation.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O:2]S(=O)(=O)c1ccc(C)cc1",
    },
    mechanism: "Sulfonyl substitution",
    selectivity: ["Retention at the carbon bearing oxygen"],
    priority: 620,
  },
  {
    id: "alcohol-mesylation",
    family: "alcohols",
    title: "Mesylate Formation",
    reagents: "MsCl, triethylamine or pyridine",
    reagentNote: "Convert OH into a good leaving group",
    productHint: "Alkyl mesylate",
    explanation:
      "Methanesulfonyl chloride converts an alcohol into a mesylate without breaking the carbon-oxygen bond.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O:2]S(=O)(=O)C",
    },
    mechanism: "Sulfonyl substitution",
    selectivity: ["Retention at the carbon bearing oxygen"],
    priority: 630,
  },
  {
    id: "alcohol-nitrate-ester",
    family: "alcohols",
    title: "Nitrate Ester Formation",
    reagents: "HNO₃ under controlled conditions",
    reagentNote: "O-nitration",
    productHint: "Nitrate ester",
    explanation:
      "Alcohol oxygen can be converted into an organic nitrate ester under strongly acidic nitrating conditions.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O:2][N+](=O)[O-]",
    },
    course: "advanced",
    mechanism: "Condensation / O-nitration",
    priority: 640,
  },
  {
    id: "alcohol-phosphate-ester",
    family: "alcohols",
    title: "Phosphate Ester Formation",
    reagents: "Activated phosphoric acid derivative",
    reagentNote: "O-phosphorylation",
    productHint: "Phosphate monoester",
    explanation:
      "Alcohols form phosphate esters through activated phosphorus reagents; direct reaction with phosphoric acid is generally equilibrium-limited.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O:2]P(=O)(O)O",
    },
    course: "advanced",
    mechanism: "Substitution at phosphorus",
    priority: 650,
  },
  {
    id: "pinacol-rearrangement",
    family: "alcohols",
    title: "Pinacol Rearrangement",
    reagents: "Strong acid, heat",
    reagentNote: "Vicinal diol rearrangement",
    productHint: "Rearranged aldehyde or ketone",
    explanation:
      "Protonation and loss of water create a carbocation, followed by a 1,2-shift and carbonyl formation.",
    trigger: {
      ...alcoholTrigger,
      includeSmarts: ["[C]([OH])[C]([OH])"],
    },
    transform: {
      type: "conceptOnly",
      reason:
        "An exact product requires ranking migratory aptitude and mapping the migrating group during the 1,2-shift.",
    },
    mechanism: "Carbocation rearrangement",
    selectivity: ["Migratory aptitude and carbocation stability control the product"],
    priority: 660,
  },
];
