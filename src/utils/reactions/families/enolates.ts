import type { ReactionRule } from "../reactionTypes";

const enolizableCarbonylTrigger = {
  anyFunctionalGroups: [
    "Aldehyde",
    "Benzaldehyde",
    "Ketone",
    "Enone",
    "Enal",
    "Ester",
    "Enoate",
  ],
  includeSmarts: ["[C;H1,H2,H3][CX3](=O)"],
};

const methylKetoneTrigger = {
  anyFunctionalGroups: ["Ketone", "Enone"],
  includeSmarts: ["[CH3][CX3](=O)[#6]"],
};

export const enolateReactionRules: ReactionRule[] = [
  {
    id: "carbonyl-acid-alpha-halogenation",
    family: "enolates",
    reactionType: "substitution",
    title: "Acid-Catalyzed Alpha Halogenation",
    reagents: "Br₂ or Cl₂, H₃O⁺",
    reagentNote: "Halogenation through the enol",
    productHint: "Mono-alpha-halogenated carbonyl",
    explanation:
      "Acid-catalyzed enol formation followed by electrophilic halogenation usually gives one alpha substitution because the halogenated product enolizes more slowly.",
    trigger: enolizableCarbonylTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "An exact product requires comparing nonequivalent alpha positions and enol substitution.",
    },
    mechanism: "Enol formation and electrophilic substitution",
    selectivity: ["Usually monohalogenation"],
    priority: 1800,
  },
  {
    id: "carbonyl-base-alpha-halogenation",
    family: "enolates",
    reactionType: "substitution",
    title: "Base-Promoted Alpha Halogenation",
    reagents: "Br₂ or Cl₂, OH⁻",
    reagentNote: "Halogenation through an enolate",
    productHint: "Poly-alpha-halogenated carbonyl when alpha hydrogens remain",
    explanation:
      "Base forms an enolate, which reacts with halogen. Each halogen increases the acidity of remaining alpha hydrogens, so repeated halogenation is common.",
    trigger: enolizableCarbonylTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "The number and location of substitutions require alpha-hydrogen counting and site-specific enolate generation.",
    },
    mechanism: "Enolate formation and electrophilic substitution",
    priority: 1810,
  },
  {
    id: "methyl-ketone-haloform",
    family: "enolates",
    reactionType: "cleavage",
    title: "Haloform Reaction",
    reagents: "Excess X₂, OH⁻; then H₃O⁺",
    reagentNote: "Oxidative cleavage of a methyl ketone",
    productHint: "Carboxylic acid or carboxylate plus CHX₃",
    explanation:
      "A methyl ketone undergoes exhaustive alpha halogenation followed by hydroxide addition and carbon-carbon bond cleavage.",
    trigger: methylKetoneTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "The carbonyl-side fragment and haloform coproduct require a dedicated mapped cleavage transform.",
    },
    mechanism: "Enolate halogenation and nucleophilic acyl substitution",
    priority: 1820,
  },
  {
    id: "enolate-alkylation",
    conditions: { base: "strong", anhydrous: true },
    family: "enolates",
    reactionType: "substitution",
    title: "Enolate Alkylation",
    reagents: "1) LDA, NaH, or alkoxide  2) methyl or primary R–X",
    reagentNote: "Alpha carbon-carbon bond formation",
    productHint: "Alpha-alkylated carbonyl",
    explanation:
      "A base removes an alpha proton to form an enolate, which attacks a methyl or primary alkyl halide by SN2.",
    trigger: enolizableCarbonylTrigger,
    additionalReactants: [
      {
        label: "methyl or primary alkyl halide",
        trigger: { includeSmarts: ["[C;X4;H2,H3][Cl,Br,I]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C;H1,H2,H3:1][C:2](=[O:3]).[C;X4:4][Cl,Br,I]>>[C:1]([C:4])[C:2](=[O:3])",
      maxProducts: 12,
    },
    productStatus: "representative",
    limitations: ["The engine enumerates available alpha positions but does not rank kinetic versus thermodynamic enolate formation."],
    mechanism: "Enolate formation followed by SN2",
    selectivity: ["LDA at low temperature favors the kinetic enolate"],
    priority: 1830,
  },
  {
    id: "enolate-alkylation-kinetic",
    conditions: { base: "strong", anhydrous: true },
    family: "enolates",
    reactionType: "substitution",
    title: "Kinetic Enolate Alkylation",
    reagents: "1) LDA, THF, −78 °C  2) methyl or primary R–X",
    reagentNote: "Irreversible deprotonation at the less substituted alpha carbon",
    productHint: "Alpha-alkylated ketone",
    explanation:
      "A strong, bulky, non-nucleophilic base at low temperature removes the more accessible proton, at the less substituted alpha carbon (more alpha hydrogens), and the kinetic enolate is trapped irreversibly by an SN2 alkylation.",
    trigger: { includeSmarts: ["[C;X4;$([CH3][C](=O)[C;X4;H0,H1,H2]),$([CH2;X4][C](=O)[C;X4;H0,H1]),$([CH1;X4][C](=O)[C;X4;H0])]"] },
    additionalReactants: [
      {
        label: "methyl or primary alkyl halide",
        trigger: { includeSmarts: ["[C;X4;H2,H3][Cl,Br,I]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[CH3:1][C:2](=[O:3])[C;X4;H0,H1,H2:5].[C;X4:4][Cl,Br,I]>>[C:1]([C:4])[C:2](=[O:3])[C;X4;H0,H1,H2:5]",
      maxProducts: 6,
      forwardTemplates: [
        { smarts: "[CH3:1][C:2](=[O:3])[C;X4;H0,H1,H2:5].[C;X4:4][Cl,Br,I]>>[C:1]([C:4])[C:2](=[O:3])[C;X4;H0,H1,H2:5]" },
        { smarts: "[CH2;X4:1][C:2](=[O:3])[C;X4;H0,H1:5].[C;X4:4][Cl,Br,I]>>[C:1]([C:4])[C:2](=[O:3])[C;X4;H0,H1:5]" },
        { smarts: "[CH1;X4:1][C:2](=[O:3])[C;X4;H0:5].[C;X4:4][Cl,Br,I]>>[C:1]([C:4])[C:2](=[O:3])[C;X4;H0:5]" },
      ],
    },
    productStatus: "representative",
    limitations: [
      "Applies only to ketones whose two alpha carbons carry different numbers of hydrogens; for a symmetric ketone use the general enolate alkylation rule.",
      "Selectivity is the textbook trend (kinetic versus thermodynamic control), not a measured ratio; enolate equilibration, aggregation and counter-ion effects are not modeled.",
    ],
    mechanism: "Enolate formation followed by SN2",
    selectivity: [
      "LDA in THF at −78 °C gives the kinetic enolate at the less substituted alpha carbon (for example 2-methylcyclohexanone gives 2,6-dimethylcyclohexanone after methylation).",
    ],
    priority: 1831,
  },
  {
    id: "enolate-alkylation-thermodynamic",
    conditions: { base: "mild", anhydrous: false },
    family: "enolates",
    reactionType: "substitution",
    title: "Thermodynamic Enolate Alkylation",
    reagents: "1) NaOEt/EtOH or NaH, room temperature (equilibrating)  2) methyl or primary R–X",
    reagentNote: "Reversible deprotonation favors the more substituted enolate",
    productHint: "Alpha-alkylated ketone",
    explanation:
      "A base weak enough to leave the enolates in equilibrium lets the more stable, more substituted enolate dominate, and that enolate is alkylated by SN2. Over-alkylation at the same carbon is possible.",
    trigger: { includeSmarts: ["[C;X4;$([CH3][C](=O)[C;X4;H0,H1,H2]),$([CH2;X4][C](=O)[C;X4;H0,H1]),$([CH1;X4][C](=O)[C;X4;H0])]"] },
    additionalReactants: [
      {
        label: "methyl or primary alkyl halide",
        trigger: { includeSmarts: ["[C;X4;H2,H3][Cl,Br,I]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C;H0;X4:1][C:2](=[O:3])[C;X4;H1,H2,H3:5].[C;X4:4][Cl,Br,I]>>[C:1]([C:4])[C:2](=[O:3])[C;X4;H1,H2,H3:5]",
      maxProducts: 6,
      forwardTemplates: [
        { smarts: "[C;H0;X4:1][C:2](=[O:3])[C;X4;H1,H2,H3:5].[C;X4:4][Cl,Br,I]>>[C:1]([C:4])[C:2](=[O:3])[C;X4;H1,H2,H3:5]" },
        { smarts: "[C;H1;X4:1][C:2](=[O:3])[C;X4;H2,H3:5].[C;X4:4][Cl,Br,I]>>[C:1]([C:4])[C:2](=[O:3])[C;X4;H2,H3:5]" },
        { smarts: "[C;H2;X4:1][C:2](=[O:3])[C;X4;H3:5].[C;X4:4][Cl,Br,I]>>[C:1]([C:4])[C:2](=[O:3])[C;X4;H3:5]" },
      ],
    },
    productStatus: "representative",
    limitations: [
      "Applies only to ketones whose two alpha carbons carry different numbers of hydrogens; for a symmetric ketone use the general enolate alkylation rule.",
      "Selectivity is the textbook trend (kinetic versus thermodynamic control), not a measured ratio; enolate equilibration, aggregation and counter-ion effects are not modeled.",
    ],
    mechanism: "Enolate formation followed by SN2",
    selectivity: [
      "Equilibrating conditions give the more substituted enolate (for example 2-methylcyclohexanone gives 2,2-dimethylcyclohexanone after methylation).",
    ],
    priority: 1832,
  },
  {
    id: "aldol-addition-general",
    family: "enolates",
    reactionType: "addition",
    title: "Aldol Addition",
    reagents: "Dilute NaOH or alkoxide, low temperature",
    reagentNote: "Carbonyl addition by an enolate",
    productHint: "Beta-hydroxy aldehyde or ketone",
    explanation:
      "An enolate attacks another aldehyde or ketone, forming a new carbon-carbon bond and a beta-hydroxy carbonyl product.",
    trigger: enolizableCarbonylTrigger,
    additionalReactants: [
      {
        label: "aldehyde or ketone electrophile",
        trigger: { includeSmarts: ["[C](=O)"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C;H1,H2,H3:1][C:2](=[O:3]).[C:4](=[O:5])>>[C:1]([C:4]([OH:5]))[C:2](=[O:3])",
      maxProducts: 16,
    },
    productStatus: "representative",
    productPreferences: [
      {
        id: "aldol-ketone-electrophile-disfavored",
        whenReactantSmarts: ["[CX3H1](=O)[#6]", "[CX3;H0]([#6])([#6])=O"],
        productSmarts: "[CX4;H0]([OX2H])([#6])([#6])[CX4][CX3]=O",
        level: "minor",
        basis:
          "When an aldehyde is present beside a ketone, addition to the ketone carbonyl is the less favorable aldol: ketones are less electrophilic and their aldol adducts are less stable, so the equilibrium lies toward the aldehyde adduct. This marks only the ketone-electrophile product as minor; it does NOT make the aldehyde-electrophile product major, because self-aldol of the more acidic and more electrophilic aldehyde competes and is not enumerated here.",
        references: ["Clayden, Greeves and Warren, Organic Chemistry 2nd ed., ch. 26 (crossed aldol: aldehydes as electrophiles, ketone adducts disfavored); not re-read in this stage."],
      },
    ],
    limitations: ["Crossed aldol reactions can give multiple donor/electrophile and alpha-site combinations; the engine enumerates constitutional products but does not rank them."],
    mechanism: "Enolate addition",
    priority: 1840,
  },
  {
    id: "aldol-condensation-general",
    family: "enolates",
    reactionType: "condensation",
    title: "Aldol Condensation",
    reagents: "Base or acid, heat",
    reagentNote: "Aldol addition followed by dehydration",
    productHint: "Alpha,beta-unsaturated carbonyl",
    explanation:
      "An aldol addition product loses water under heated acidic or basic conditions to form a conjugated carbonyl compound.",
    trigger: enolizableCarbonylTrigger,
    additionalReactants: [
      {
        label: "aldehyde or ketone electrophile",
        trigger: { includeSmarts: ["[C](=O)"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C;H1,H2,H3:1][C:2](=[O:3]).[C:4](=[O:5])>>[C:1](=[C:4])[C:2](=[O:3])",
      maxProducts: 16,
    },
    productStatus: "representative",
    limitations: ["The engine enumerates constitutional condensation products but does not rank crossed-aldol selectivity or assign E/Z geometry."],
    mechanism: "Enolate addition and elimination",
    priority: 1850,
  },
  {
    id: "claisen-condensation-general",
    family: "enolates",
    reactionType: "condensation",
    title: "Claisen Condensation",
    reagents: "1) Matching alkoxide base  2) H₃O⁺",
    reagentNote: "Ester enolate acyl substitution",
    productHint: "Beta-keto ester",
    explanation:
      "An ester enolate attacks another ester, followed by alkoxide elimination and deprotonation of the beta-dicarbonyl product.",
    trigger: {
      anyFunctionalGroups: ["Ester", "Enoate"],
      includeSmarts: ["[C;H1,H2,H3][CX3](=O)O[#6]"],
    },
    additionalReactants: [
      {
        label: "ester electrophile",
        trigger: { includeSmarts: ["[C](=O)O[#6]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C;H1,H2,H3:1][C:2](=[O:3])[O:4][#6:5].[C:6](=[O:7])[O:8][#6:9]>>[C:1]([C:6](=[O:7]))[C:2](=[O:3])[O:4][#6:5]",
      maxProducts: 16,
    },
    productStatus: "representative",
    limitations: ["Crossed Claisen condensations can give mixtures; the engine enumerates constitutional products but does not rank ester pairing or enolate-site selectivity.", "Use an alkoxide matching the ester leaving group."],
    mechanism: "Enolate acyl substitution",
    priority: 1860,
  },
  {
    id: "michael-addition",
    family: "enolates",
    reactionType: "addition",
    title: "Michael Addition",
    reagents: "Stabilized enolate or other soft nucleophile, base",
    reagentNote: "Conjugate 1,4-addition",
    productHint: "1,5-dicarbonyl or related conjugate-addition product",
    explanation:
      "A resonance-stabilized nucleophile adds to the beta carbon of an alpha,beta-unsaturated carbonyl compound.",
    trigger: {
      anyFunctionalGroups: ["Enone", "Enal", "Enoate", "Chalcone"],
      includeSmarts: ["[C]=[C][C](=O)"],
    },
    additionalReactants: [
      {
        label: "enolizable carbonyl donor",
        trigger: { includeSmarts: ["[C;H1,H2,H3][C](=O)"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:4]=[C:5][C:6](=[O:7]).[C;H1,H2,H3:1][C:2](=[O:3])>>[C:1]([C:4][C:5][C:6](=[O:7]))[C:2](=[O:3])",
      maxProducts: 16,
    },
    productStatus: "representative",
    limitations: ["The engine enumerates constitutional 1,4-addition products but does not rank donor alpha sites or stereochemical outcomes."],
    mechanism: "Conjugate addition",
    selectivity: ["1,4-addition"],
    priority: 1870,
  },
  {
    id: "organocuprate-conjugate-addition",
    family: "enolates",
    reactionType: "addition",
    title: "Organocuprate 1,4-Addition",
    reagents: "R₂CuLi; then aqueous workup",
    reagentNote: "Draw the alpha,beta-unsaturated carbonyl and organocuprate as disconnected structures",
    productHint: "Beta-substituted carbonyl",
    explanation:
      "Gilman reagents are soft carbon nucleophiles that typically add to the beta carbon of an alpha,beta-unsaturated carbonyl, preserving the carbonyl group after workup.",
    // Structural trigger only: the functional-group classifier names cyclic enones such as cyclohex-2-enone
    // "Crotonaldehyde"/"Acryloyl" rather than "Enone", so a name-based condition made the rule unreachable for them.
    trigger: {
      includeSmarts: ["[C]=[C][C](=O)"],
      excludeSmarts: ["[CX3](=O)[OX2H1]"],
    },
    additionalReactants: [
      { label: "Gilman or organocuprate reagent", trigger: { includeSmarts: ["[#6][Cu]"] } },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2][C:3](=[O:4]).[#6:5][Cu]>>[C:1]([#6:5])[C:2][C:3](=[O:4])",
      maxProducts: 12,
    },
    mechanism: "Conjugate 1,4-addition",
    selectivity: ["1,4-addition favored over direct 1,2-addition"],
    productStatus: "representative",
    limitations: ["The engine does not yet assign stereochemistry created at the beta or alpha carbon."],
    priority: 1875,
  },
  {
    id: "robinson-annulation",
    family: "enolates",
    reactionType: "cyclization",
    title: "Robinson Annulation",
    reagents: "Enolate donor, alpha,beta-unsaturated carbonyl, base, heat",
    reagentNote: "Michael addition plus intramolecular aldol condensation",
    productHint: "Cyclohexenone derivative",
    explanation:
      "A Michael addition creates a 1,5-dicarbonyl system that cyclizes by intramolecular aldol condensation to form a six-membered enone.",
    trigger: {
      anyFunctionalGroups: ["Enone", "Enal", "Enoate", "Chalcone"],
    },
    transform: {
      type: "conceptOnly",
      reason:
        "Both reaction partners and the ring-forming atom map are required for an exact annulation product.",
    },
    mechanism: "Michael addition and aldol condensation",
    priority: 1880,
  },
  {
    id: "malonic-acetoacetic-synthesis",
    family: "enolates",
    reactionType: "cleavage",
    title: "Malonic Ester or Acetoacetic Ester Synthesis",
    reagents: "1) Alkoxide  2) primary R–X  3) hydrolysis and heat",
    reagentNote: "Alkylation followed by decarboxylation",
    productHint: "Substituted carboxylic acid or methyl ketone",
    explanation:
      "A stabilized beta-dicarbonyl enolate is alkylated, then hydrolysis and decarboxylation reveal a substituted acid or methyl ketone.",
    trigger: {
      anyFunctionalGroups: ["Ester", "Ketone"],
      includeSmarts: ["[CX3](=O)[CH2][CX3](=O)"],
    },
    transform: {
      type: "conceptOnly",
      reason:
        "The alkyl halide and the identity of the beta-dicarbonyl starting material must be specified.",
    },
    mechanism: "Enolate alkylation, hydrolysis, and decarboxylation",
    priority: 1890,
  },
];
