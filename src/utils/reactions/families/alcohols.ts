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
    reactionType: "acidBase",
    title: "Alcohol Deprotonation",
    reagents: "NaH, KH, or Na metal",
    reagentNote: "Formation of an alkoxide",
    productHint: "Alkoxide ion",
    explanation:
      "A sufficiently strong base removes the alcohol proton to form an alkoxide, a strong nucleophile and base.",
    trigger: alcoholTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O-:2]",
    },
    mechanism: "Proton transfer",
    priority: 490,
  },
  {
    id: "alcohol-dehydration-alkene",
    family: "alcohols",
    reactionType: "elimination",
    title: "E1 Dehydration of a Secondary/Tertiary Alcohol",
    reagents: "Concentrated H₂SO₄ or H₃PO₄, heat",
    reagentNote: "Acid-catalyzed E1 dehydration",
    productHint: "Major Zaitsev alkene",
    explanation:
      "Protonation converts hydroxyl into water, ionization forms a carbocation, and beta deprotonation gives an alkene. Secondary and tertiary alcohols commonly follow this E1 pathway.",
    trigger: {
      anyFunctionalGroups: ["Secondary alcohol", "Tertiary alcohol"],
      includeSmarts: ["[C;H1,H2,H3][C;H0,H1][OH]"],
      // Vicinal diols under strong acid are handled by the higher-priority
      // pinacol rearrangement rule rather than ordinary alcohol E1 dehydration.
      excludeSmarts: ["[C;X4]([OH])-[C;X4]([OH])"],
    },
    transform: {
      type: "customHandler",
      handler: "elimination",
      options: {
        mode: "e1",
        leavingGroup: "alcohol",
        preference: "zaitsev",
        allowRearrangement: true,
        maxShiftDepth: 2,
        maxProducts: 12,
      },
    },
    productStatus: "representative",
    mechanism: "E1",
    selectivityProfile: {
      stereochemistry: { mode: "e-preferred", stereoselective: true },
      regiochemistry: { mode: "zaitsev", regioselective: true },
      mixture: "possible",
      majorProductOnly: true,
      allowsRearrangement: true,
    },
    selectivity: [
      "Usually Zaitsev",
      "E geometry is usually favored when E/Z is possible",
      "Carbocation rearrangements are possible",
    ],
    limitations: [
      "The shared carbocation engine now evaluates favorable hydride/alkyl shifts before alcohol E1 elimination.",
      "E/Z is explicit for common acyclic disubstituted alkenes; general highly substituted geometry is still in development.",
    ],
    priority: 500,
  },
  {
    id: "alcohol-dehydration-primary",
    family: "alcohols",
    reactionType: "elimination",
    title: "Dehydration of a Primary Alcohol",
    reagents: "Concentrated H₂SO₄ or H₃PO₄, high heat",
    reagentNote: "Concerted dehydration; avoid a free primary carbocation",
    productHint: "Alkene",
    explanation:
      "Primary alcohols generally dehydrate without forming a discrete primary carbocation. Under strong acid and heat, beta C–H cleavage and C–O bond loss are treated as a concerted E2-like elimination.",
    trigger: {
      ...primaryAlcoholTrigger,
      includeSmarts: ["[C;H1,H2,H3][CH2][OH]"],
      excludeSmarts: ["[C;X4]([OH])-[C;X4]([OH])"],
    },
    transform: {
      type: "customHandler",
      handler: "elimination",
      options: {
        mode: "e2",
        leavingGroup: "alcohol",
        preference: "zaitsev",
        maxProducts: 8,
      },
    },
    productStatus: "representative",
    mechanism: "E2-like acid-catalyzed dehydration",
    selectivityProfile: {
      stereochemistry: { mode: "e-preferred", stereoselective: true },
      regiochemistry: { mode: "zaitsev", regioselective: true },
      mixture: "possible",
      majorProductOnly: true,
      allowsRearrangement: false,
    },
    selectivity: ["No free primary carbocation", "Usually the more stable accessible alkene"],
    limitations: [
      "Detailed acid-mediated transition-state and conformational effects are simplified.",
    ],
    priority: 502,
  },
  {
    id: "alcohol-dehydration-ether",
    family: "alcohols",
    reactionType: "substitution",
    title: "Intermolecular Alcohol Dehydration",
    reagents: "Concentrated H₂SO₄, about 130–140 °C",
    reagentNote: "Bimolecular ether formation",
    productHint: "Symmetrical ether",
    explanation:
      "Under controlled lower-temperature acidic conditions, unhindered primary alcohols can form symmetrical ethers.",
    trigger: primaryAlcoholTrigger,
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: { mode: "intermolecularAlcoholDehydration" },
    },
    productStatus: "computed",
    mechanism: "SN2 after alcohol protonation",
    limitations: ["Most useful for unhindered primary alcohols."],
    priority: 510,
  },
  {
    id: "vicinal-diol-hbr-substitution",
    family: "alcohols",
    reactionType: "substitution",
    title: "Vicinal Diol Conversion with HBr",
    reagents: "excess HBr",
    reagentNote: "Convert both vicinal OH groups to bromides",
    productHint: "Vicinal dibromide",
    explanation:
      "With excess hydrobromic acid, both alcohol groups of a vicinal diol can be protonated and replaced by bromide. Secondary/tertiary centers react through carbocation-like ionization/capture, so stereochemical scrambling can occur at the reacting carbons.",
    trigger: {
      includeSmarts: ["[C;X4]([OH])-[C;X4]([OH])"],
    },
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: {
        mode: "vicinalDiolToDihalide",
        halide: "bromide",
      },
    },
    productStatus: "representative",
    mechanism: "Acid-promoted substitution",
    selectivityProfile: {
      stereochemistry: { mode: "racemization" },
      mixture: "possible",
      allowsRearrangement: false,
    },
    selectivity: [
      "Both OH groups are consumed under excess HBr",
      "Configuration at secondary/tertiary reacting centers is not retained as one enantiopure product",
    ],
    priority: 518,
  },
  {
    id: "alcohol-hbr-substitution-primary",
    family: "alcohols",
    reactionType: "substitution",
    title: "Primary Alcohol Conversion with HBr",
    reagents: "HBr",
    reagentNote: "Primary-alcohol substitution",
    productHint: "Primary alkyl bromide",
    explanation:
      "After protonation of hydroxyl, bromide displaces water from an ordinary primary alcohol by an SN2 pathway rather than through a free primary carbocation.",
    trigger: {
      anyFunctionalGroups: ["Primary alcohol"],
      excludedFunctionalGroups: ["Benzyl alcohol"],
      includeSmarts: ["[CH2][OH]"],
      excludeSmarts: ["[C;X4]([OH])-[C;X4]([OH])"],
    },
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: {
        mode: "alcoholToHalide",
        halide: "bromide",
        stereochemistry: "invert",
      },
    },
    productStatus: "representative",
    mechanism: "SN2",
    selectivityProfile: {
      stereochemistry: { mode: "inversion", stereospecific: true },
      mixture: "single",
      allowsRearrangement: false,
    },
    selectivity: ["Backside displacement", "No carbocation rearrangement"],
    priority: 520,
  },
  {
    id: "alcohol-hbr-substitution-sn1",
    family: "alcohols",
    reactionType: "substitution",
    title: "Secondary/Tertiary Alcohol Conversion with HBr",
    reagents: "HBr",
    reagentNote: "Carbocation-forming substitution",
    productHint: "Alkyl bromide or rearranged alkyl bromide",
    explanation:
      "Secondary, tertiary, and resonance-stabilized alcohols can lose water after protonation to form a carbocation; bromide then captures the planar cation.",
    trigger: {
      anyFunctionalGroups: ["Secondary alcohol", "Tertiary alcohol", "Benzyl alcohol"],
      excludeSmarts: ["[C;X4]([OH])-[C;X4]([OH])"],
    },
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: {
        mode: "alcoholSn1ToHalide",
        halide: "bromide",
        allowRearrangement: true,
        maxShiftDepth: 2,
        maxProducts: 12,
      },
    },
    productStatus: "representative",
    mechanism: "SN1",
    selectivityProfile: {
      stereochemistry: { mode: "racemization" },
      mixture: "possible",
      allowsRearrangement: true,
    },
    selectivity: ["Racemization at a newly stereogenic capture center", "Carbocation rearrangements are possible"],
    limitations: [
      "Real ion-pair effects can make experimental racemization incomplete.",
      "Equal-stability rearrangements are not automatically promoted.",
    ],
    priority: 522,
  },
  {
    id: "alcohol-lucas-reagent",
    family: "alcohols",
    reactionType: "substitution",
    title: "Lucas Reagent Conversion",
    reagents: "Concentrated HCl, ZnCl₂",
    reagentNote: "Fast for tertiary; slower for secondary alcohols",
    productHint: "Alkyl chloride",
    explanation:
      "Zinc chloride activates the alcohol and chloride replaces water. The reaction is also used to distinguish alcohol classes by reaction rate.",
    trigger: {
      // Structural SMARTS keeps Lucas reagent visible even when a secondary
      // allylic/benzylic alcohol is labeled under a more specific functional
      // group name by the hierarchy engine.
      includeSmarts: [
        "[$([C;X4;H0,H1][OH]),$([c][CH2][OH])]",
      ],
    },
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: {
        mode: "alcoholSn1ToHalide",
        halide: "chloride",
        allowRearrangement: true,
        maxShiftDepth: 2,
        maxProducts: 12,
      },
    },
    productStatus: "representative",
    mechanism: "SN1 for tertiary and many secondary alcohols",
    selectivityProfile: {
      stereochemistry: { mode: "racemization" },
      mixture: "possible",
      allowsRearrangement: true,
    },
    selectivity: ["Rearrangements and racemization may occur"],
    priority: 530,
  },
  {
    id: "alcohol-pbr3",
    family: "alcohols",
    reactionType: "substitution",
    title: "Alcohol to Alkyl Bromide with PBr₃",
    reagents: "PBr₃",
    reagentNote: "Best for primary and secondary alcohols",
    productHint: "Alkyl bromide",
    explanation:
      "PBr₃ converts primary and secondary alcohols into alkyl bromides without forming a free carbocation.",
    trigger: primaryOrSecondaryAlcoholTrigger,
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: {
        mode: "alcoholToHalide",
        halide: "bromide",
        stereochemistry: "invert",
      },
    },
    productStatus: "representative",
    mechanism: "SN2 substitution",
    selectivityProfile: {
      stereochemistry: { mode: "inversion", stereospecific: true },
      mixture: "single",
      allowsRearrangement: false,
    },
    selectivity: ["Inversion at a reacting stereocenter"],
    priority: 540,
  },
  {
    id: "alcohol-socl2",
    family: "alcohols",
    reactionType: "substitution",
    title: "Alcohol to Alkyl Chloride with SOCl₂",
    reagents: "SOCl₂, pyridine",
    reagentNote: "Formation and displacement of a chlorosulfite",
    productHint: "Alkyl chloride",
    explanation:
      "Thionyl chloride converts alcohols into alkyl chlorides; pyridine commonly promotes substitution with inversion.",
    trigger: primaryOrSecondaryAlcoholTrigger,
    transform: {
      type: "customHandler",
      handler: "substitution",
      options: {
        mode: "alcoholToHalide",
        halide: "chloride",
        stereochemistry: "invert",
      },
    },
    productStatus: "representative",
    mechanism: "Substitution through a chlorosulfite intermediate",
    selectivityProfile: {
      stereochemistry: { mode: "inversion", stereospecific: true },
      mixture: "single",
      allowsRearrangement: false,
    },
    selectivity: ["Often inversion with pyridine"],
    priority: 550,
  },
  {
    id: "primary-alcohol-mild-oxidation",
    family: "alcohols",
    reactionType: "oxidation",
    title: "Primary Alcohol Oxidation to an Aldehyde",
    reagents: "PCC, DMP, or Swern oxidation",
    reagentNote: "Anhydrous mild oxidation",
    productHint: "Aldehyde",
    explanation:
      "Mild, water-free oxidants convert a primary alcohol into an aldehyde without substantial overoxidation.",
    trigger: primaryAlcoholTrigger,
    transform: {
      type: "customHandler",
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
    reactionType: "oxidation",
    title: "Primary Alcohol Oxidation to a Carboxylic Acid",
    reagents: "Jones reagent, Na₂Cr₂O₇/H₂SO₄, or hot KMnO4",
    reagentNote: "Strong aqueous oxidation",
    productHint: "Carboxylic acid",
    explanation:
      "Strong aqueous oxidants convert a primary alcohol through the aldehyde hydrate to a carboxylic acid.",
    trigger: primaryAlcoholTrigger,
    transform: {
      type: "customHandler",
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
    id: "secondary-alcohol-oxidation-pcc",
    family: "alcohols",
    reactionType: "oxidation",
    title: "Secondary Alcohol Oxidation with PCC",
    reagents: "PCC",
    reagentNote: "Mild oxidation to a ketone",
    productHint: "Ketone",
    explanation:
      "PCC oxidizes a secondary alcohol to a ketone without changing the carbon skeleton.",
    trigger: secondaryAlcoholTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1][CH:2]([OH:3])[C:4]>>[C:1][C:2](=[O:3])[C:4]",
    },
    mechanism: "Oxidation",
    selectivityProfile: {
      stereochemistry: { mode: "retention", stereospecific: true },
      mixture: "single",
      allowsRearrangement: false,
    },
    selectivity: [
      "Only the secondary C-OH center is oxidized; unrelated stereocenters are retained",
    ],
    priority: 580,
  },
  {
    id: "secondary-alcohol-oxidation-dmp",
    family: "alcohols",
    reactionType: "oxidation",
    title: "Secondary Alcohol Oxidation with DMP",
    reagents: "Dess–Martin periodinane (DMP)",
    reagentNote: "Mild oxidation to a ketone",
    productHint: "Ketone",
    explanation:
      "Dess–Martin periodinane oxidizes a secondary alcohol to a ketone under mild conditions.",
    trigger: secondaryAlcoholTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1][CH:2]([OH:3])[C:4]>>[C:1][C:2](=[O:3])[C:4]",
    },
    mechanism: "Oxidation",
    priority: 581,
  },
  {
    id: "secondary-alcohol-oxidation-jones",
    family: "alcohols",
    reactionType: "oxidation",
    title: "Secondary Alcohol Oxidation with Jones Reagent",
    reagents: "CrO₃, H₂SO₄, H₂O (Jones reagent)",
    reagentNote: "Strong aqueous oxidation to a ketone",
    productHint: "Ketone",
    explanation:
      "Jones reagent oxidizes a secondary alcohol to a ketone; unlike primary alcohols, ketones are not normally overoxidized under standard conditions.",
    trigger: secondaryAlcoholTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1][CH:2]([OH:3])[C:4]>>[C:1][C:2](=[O:3])[C:4]",
    },
    mechanism: "Oxidation",
    priority: 582,
  },
  {
    id: "secondary-alcohol-oxidation-naocl",
    family: "alcohols",
    reactionType: "oxidation",
    title: "Secondary Alcohol Oxidation with Hypochlorite",
    reagents: "NaOCl",
    reagentNote: "Oxidation to a ketone",
    productHint: "Ketone",
    explanation:
      "Sodium hypochlorite can oxidize a secondary alcohol to the corresponding ketone under suitable reaction conditions.",
    trigger: secondaryAlcoholTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1][CH:2]([OH:3])[C:4]>>[C:1][C:2](=[O:3])[C:4]",
    },
    mechanism: "Oxidation",
    priority: 583,
  },
  {
    id: "secondary-alcohol-oxidation-kmno4",
    family: "alcohols",
    reactionType: "oxidation",
    title: "Secondary Alcohol Oxidation with Permanganate",
    reagents: "KMnO₄",
    reagentNote: "Strong oxidation to a ketone",
    productHint: "Ketone",
    explanation:
      "Permanganate can oxidize a secondary alcohol to a ketone, although it is a harsher and less selective choice than PCC or DMP.",
    trigger: secondaryAlcoholTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1][CH:2]([OH:3])[C:4]>>[C:1][C:2](=[O:3])[C:4]",
    },
    mechanism: "Oxidation",
    limitations: ["A harsher oxidant; other oxidizable functional groups may reduce chemoselectivity."],
    priority: 584,
  },
  {
    id: "vicinal-diol-periodate-cleavage",
    family: "alcohols",
    reactionType: "cleavage",
    title: "Periodic Acid Cleavage of a Vicinal Diol",
    reagents: "HIO₄ or NaIO₄",
    reagentNote: "Oxidative cleavage through a cyclic periodate ester",
    productHint: "Aldehyde and/or ketone cleavage products",
    explanation:
      "Periodic acid (or periodate) cleaves the C-C bond of a vicinal 1,2-diol. Each carbon bearing OH becomes a carbonyl carbon; cyclic vicinal diols open to a single dicarbonyl chain when the cleaved C-C bond belongs to the ring.",
    trigger: {
      includeSmarts: ["[C;X4]([OH])-[C;X4]([OH])"],
    },
    transform: {
      type: "customHandler",
      handler: "oxidation",
      options: { mode: "vicinalDiolCleavage" },
    },
    productStatus: "computed",
    mechanism: "Periodate ester formation followed by C-C oxidative cleavage",
    selectivity: [
      "Requires vicinal oxygen substituents capable of forming the cyclic periodate intermediate",
      "C-H-bearing diol carbons give aldehydes; fully substituted diol carbons give ketones",
    ],
    priority: 585,
  },
  {
    id: "benzylic-allylic-alcohol-oxidation",
    family: "alcohols",
    reactionType: "oxidation",
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
      type: "reactionSmarts",
      smarts: "[C,c:1][CH1,CH2:2][OH:3]>>[C,c:1][C:2]=[O:3]",
      maxProducts: 4,
    },
    mechanism: "Oxidation",
    priority: 590,
  },
  {
    id: "alcohol-williamson-ether",
    family: "alcohols",
    reactionType: "substitution",
    title: "Williamson Ether Synthesis from an Alcohol",
    reagents: "1) NaH or another strong base  2) methyl or primary R-X",
    reagentNote: "Draw the alcohol and alkyl halide as disconnected structures",
    productHint: "Ether",
    explanation:
      "Strong base converts the alcohol to an alkoxide, which then displaces a leaving group from a methyl or primary alkyl halide by SN2.",
    trigger: {
      includeSmarts: ["[#6][O;H1]"],
    },
    additionalReactants: [
      { label: "methyl or primary alkyl halide", trigger: { includeSmarts: ["[C;X4;H2,H3][Cl,Br,I]"] } },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[#6:1][O;H1:2].[C;X4:3][Cl,Br,I]>>[#6:1][O:2]-[C:3]",
      maxProducts: 8,
    },
    mechanism: "SN2",
    selectivityProfile: {
      stereochemistry: { mode: "retention", stereospecific: true },
      mixture: "single",
      allowsRearrangement: false,
    },
    selectivity: [
      "The C-O bond at the alcohol stereocenter is not broken, so configuration at that carbon is retained",
      "SN2 inversion occurs at the alkyl-halide carbon only if that electrophilic carbon is stereogenic",
    ],
    limitations: ["Secondary and tertiary alkyl halides favor elimination rather than Williamson substitution."],
    priority: 595,
  },
  {
    id: "alcohol-methylation-methyl-iodide",
    family: "alcohols",
    reactionType: "substitution",
    title: "Alcohol O-Methylation with Methyl Iodide",
    reagents: "base, then CH₃I",
    reagentNote: "Williamson methylation with a fixed methyl electrophile",
    productHint: "Methyl ether",
    explanation:
      "Base forms an alkoxide, which attacks methyl iodide by SN2. Because the electrophile is specifically CH₃I, PocketChem can supply the methyl group without requiring the user to draw a second arbitrary alkyl halide.",
    trigger: {
      includeSmarts: ["[C;X4][O;H1]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[C;X4:1][O;H1:2]>>[C:1][O:2]C",
      maxProducts: 8,
    },
    productStatus: "computed",
    mechanism: "Williamson ether synthesis / SN2 methylation",
    selectivityProfile: {
      stereochemistry: { mode: "retention", stereospecific: true },
      mixture: "single",
      allowsRearrangement: false,
    },
    selectivity: [
      "Methyl iodide reacts by SN2 at methyl; the C–O bond at the alcohol-bearing stereocenter is not broken.",
      "Only aliphatic alcohol O–H groups are targeted by this rule; phenolic O–H is handled separately.",
    ],
    limitations: ["If several nonequivalent aliphatic alcohols are present, chemoselective methylation requires substrate-specific conditions or protection."],
    priority: 596,
  },
  {
    id: "fischer-esterification",
    family: "alcohols",
    reactionType: "substitution",
    title: "Fischer Esterification",
    reagents: "Catalytic H₂SO₄, heat",
    reagentNote: "Draw an alcohol and a carboxylic acid as disconnected structures",
    productHint: "Ester",
    explanation:
      "An alcohol and a carboxylic acid equilibrate with an ester and water under acid catalysis.",
    trigger: {
      includeSmarts: ["[#6X4,#0][OX2H1]"],
    },
    additionalReactants: [
      {
        label: "carboxylic acid",
        trigger: {
          includeSmarts: ["[CX3](=O)[OX2H1]"],
        },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts:
        "[#6X4,#0:1][O;H1:2].[C:3](=[O:4])[O;H1]>>[#6,#0:1][O:2][C:3](=[O:4])",
    },
    mechanism: "Acid-catalyzed nucleophilic acyl substitution",
    limitations: ["Reversible; removing water or using excess reactant drives the equilibrium toward ester."],
    priority: 600,
  },
  {
    id: "alcohol-acid-chloride-esterification",
    family: "alcohols",
    reactionType: "substitution",
    title: "Ester Formation with an Acyl Halide",
    reagents: "Pyridine or another base",
    reagentNote: "Draw an alcohol and an acyl chloride as disconnected structures",
    productHint: "Ester",
    explanation:
      "An alcohol attacks an acyl halide to form an ester; base neutralizes the hydrogen halide byproduct.",
    trigger: {
      includeSmarts: ["[#6X4,#0][OX2H1]"],
    },
    additionalReactants: [
      {
        label: "acyl chloride",
        trigger: {
          includeSmarts: ["[CX3](=O)[Cl,Br,I]"],
        },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts:
        "[#6X4,#0:1][O;H1:2].[C:3](=[O:4])[Cl,Br,I]>>[#6,#0:1][O:2][C:3](=[O:4])",
    },
    mechanism: "Nucleophilic acyl substitution",
    priority: 610,
  },
  {
    id: "alcohol-tosylation",
    family: "alcohols",
    reactionType: "substitution",
    title: "Tosylate Formation",
    reagents: "TsCl, pyridine",
    reagentNote: "Convert OH into a good leaving group",
    productHint: "Alkyl tosylate",
    explanation:
      "The alcohol oxygen attacks tosyl chloride. The carbon-oxygen bond is retained, so configuration at carbon is unchanged during tosylate formation.",
    trigger: alcoholTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O:2]S(=O)(=O)c1ccc(C)cc1",
    },
    mechanism: "Sulfonyl substitution",
    selectivity: ["Retention at the carbon bearing oxygen"],
    priority: 620,
  },
  {
    id: "alcohol-mesylation",
    family: "alcohols",
    reactionType: "substitution",
    title: "Mesylate Formation",
    reagents: "MsCl, triethylamine or pyridine",
    reagentNote: "Convert OH into a good leaving group",
    productHint: "Alkyl mesylate",
    explanation:
      "Methanesulfonyl chloride converts an alcohol into a mesylate without breaking the carbon-oxygen bond.",
    trigger: alcoholTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O:2]S(=O)(=O)C",
    },
    mechanism: "Sulfonyl substitution",
    selectivity: ["Retention at the carbon bearing oxygen"],
    priority: 630,
  },
  {
    id: "alcohol-nitrate-ester",
    family: "alcohols",
    reactionType: "substitution",
    title: "Nitrate Ester Formation",
    reagents: "HNO₃ under controlled conditions",
    reagentNote: "O-nitration",
    productHint: "Nitrate ester",
    explanation:
      "Alcohol oxygen can be converted into an organic nitrate ester under strongly acidic nitrating conditions.",
    trigger: alcoholTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O:2][N+](=O)[O-]",
    },
    course: "advanced",
    mechanism: "Condensation / O-nitration",
    priority: 640,
  },
  {
    id: "alcohol-phosphate-ester",
    family: "alcohols",
    reactionType: "substitution",
    title: "Phosphate Ester Formation",
    reagents: "Activated phosphoric acid derivative",
    reagentNote: "O-phosphorylation",
    productHint: "Phosphate monoester",
    explanation:
      "Alcohols form phosphate esters through activated phosphorus reagents; direct reaction with phosphoric acid is generally equilibrium-limited.",
    trigger: alcoholTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O:2]P(=O)(O)O",
    },
    course: "advanced",
    mechanism: "Substitution at phosphorus",
    priority: 650,
  },
  {
    id: "pinacol-rearrangement",
    family: "alcohols",
    reactionType: "rearrangement",
    title: "Pinacol Rearrangement",
    reagents: "Concentrated H₂SO₄ or H₃PO₄, heat",
    reagentNote: "Vicinal diol rearrangement",
    productHint: "Rearranged aldehyde or ketone",
    explanation:
      "A vicinal diol is protonated and loses water, then a stereoelectronically aligned 1,2-migration occurs while the neighboring OH forms a carbonyl. PocketChem ranks hydride first when available, then aryl/exocyclic alkyl migration, and uses ring C-C migration as a ring-contraction fallback rather than assuming every cyclic tertiary diol must contract.",
    trigger: {
      ...alcoholTrigger,
      includeSmarts: ["[C;X4]([OH])-[C;X4]([OH])"],
    },
    transform: {
      type: "customHandler",
      handler: "rearrangement",
      options: {
        mode: "pinacol",
        maxProducts: 8,
      },
    },
    productStatus: "computed",
    mechanism: "Pinacol 1,2-migration",
    selectivityProfile: {
      regiochemistry: { mode: "directed", regioselective: true },
      mixture: "possible",
      allowsRearrangement: true,
    },
    selectivity: [
      "Antiperiplanar/stereoelectronic alignment controls which group migrates",
      "Hydride migration is prioritized for secondary vicinal diols when a migratable H is present",
      "For cyclic tertiary vicinal diols lacking hydride, an eligible exocyclic alkyl migration is considered before ring contraction",
      "Ring C-C migration is retained as a fallback when the higher-ranked migration classes are unavailable",
    ],
    limitations: [
      "PocketChem reports the highest-priority migration class rather than mixing generic dehydration products into the same strong-acid/heat condition.",
    ],
    // Must outrank ordinary secondary/tertiary alcohol E1 dehydration (500).
    priority: 480,
  },
];
