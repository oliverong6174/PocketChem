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
    trigger: {
      anyFunctionalGroups: ["Enone", "Enal", "Enoate", "Chalcone"],
      includeSmarts: ["[C]=[C][C](=O)"],
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
