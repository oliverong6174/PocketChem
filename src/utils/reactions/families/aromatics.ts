import type { ReactionRule } from "../reactionTypes";

const aromaticTrigger = {
  anyFunctionalGroups: [
    "Benzene",
    "Alkylbenzene",
    "Toluene",
    "Phenol",
    "Aniline",
    "Anisole",
    "Nitrobenzene",
    "Aryl halide",
    "Naphthalene",
    "Anthracene",
    "Phenanthrene",
  ],
  includeSmarts: ["[cH]"],
};

const easModelNotes = {
  productStatus: "representative" as const,
  limitations: [
    "The engine enumerates available aromatic C–H sites but does not yet rank activating/deactivating substituents or ortho/para/meta directing effects.",
  ],
};

export const aromaticReactionRules: ReactionRule[] = [
  {
    id: "aromatic-nitration",
    family: "aromatics",
    reactionType: "substitution",
    title: "Aromatic Nitration",
    reagents: "HNO₃, H₂SO₄",
    reagentNote: "Generates the nitronium electrophile",
    productHint: "Nitroarene",
    explanation:
      "The aromatic ring attacks NO₂⁺ and then loses a proton to restore aromaticity.",
    trigger: aromaticTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[cH:1]>>[c:1][N+](=O)[O-]",
      maxProducts: 12,
    },
    mechanism: "Electrophilic aromatic substitution",
    ...easModelNotes,
    priority: 1800,
  },
  {
    id: "aromatic-sulfonation",
    family: "aromatics",
    reactionType: "substitution",
    title: "Aromatic Sulfonation",
    reagents: "SO₃, H₂SO₄",
    reagentNote: "Reversible electrophilic substitution",
    productHint: "Arenesulfonic acid",
    explanation:
      "Sulfur trioxide electrophilically substitutes for an aromatic hydrogen. Hot dilute acid can reverse the reaction (desulfonation).",
    trigger: aromaticTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[cH:1]>>[c:1]S(=O)(=O)O",
      maxProducts: 12,
    },
    mechanism: "Electrophilic aromatic substitution",
    selectivity: ["Reversible; temperature and acid concentration can control sulfonation versus desulfonation."],
    ...easModelNotes,
    priority: 1810,
  },
  {
    id: "aromatic-halogenation-bromination",
    family: "aromatics",
    reactionType: "substitution",
    title: "Aromatic Bromination",
    reagents: "Br₂, FeBr₃",
    reagentNote: "Lewis-acid-activated bromination",
    productHint: "Bromoarene",
    explanation:
      "FeBr₃ activates bromine, and the ring substitutes bromine for an aromatic hydrogen.",
    trigger: aromaticTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[cH:1]>>[c:1]Br",
      maxProducts: 12,
    },
    mechanism: "Electrophilic aromatic substitution",
    ...easModelNotes,
    priority: 1820,
  },
  {
    id: "aromatic-excess-bromination-phenol",
    family: "aromatics",
    reactionType: "substitution",
    title: "Excess Bromination of Phenol",
    reagents: "excess Br₂, H₂O",
    reagentNote: "Strongly activated ring; rapid 2,4,6-tribromination",
    productHint: "2,4,6-Tribromophenol",
    explanation:
      "Phenol is strongly activating and ortho/para-directing. With excess bromine, the two ortho positions and the para position are brominated rapidly, giving the 2,4,6-tribromo product when those positions are free.",
    trigger: {
      anyFunctionalGroups: ["Phenol"],
      includeSmarts: ["[OH][c]1[cH][cH][cH][cH][cH]1"],
    },
    transform: {
      type: "reactionSmarts",
      smarts:
        "[OH:7][c:1]1[cH:2][cH:3][cH:4][cH:5][cH:6]1>>[OH:7][c:1]1[c:2](Br)[cH:3][c:4](Br)[cH:5][c:6](Br)1",
      maxProducts: 4,
    },
    productStatus: "computed",
    mechanism: "Repeated electrophilic aromatic substitution",
    selectivityProfile: { mixture: "single", majorProductOnly: true },
    selectivity: ["OH directs bromination ortho/para; with all three sites free, 2,4,6-tribromination is the characteristic excess-Br₂ outcome."],
    limitations: ["If an ortho or para site is already substituted, the exact polybromination pattern must be ranked from the remaining available positions."],
    priority: 1821,
  },
  {
    id: "aromatic-excess-bromination-aniline",
    family: "aromatics",
    reactionType: "substitution",
    title: "Excess Bromination of Aniline",
    reagents: "excess Br₂, H₂O",
    reagentNote: "Strongly activated ring; rapid 2,4,6-tribromination",
    productHint: "2,4,6-Tribromoaniline",
    explanation:
      "Aniline is strongly activating and ortho/para-directing. In bromine water, excess bromine commonly substitutes at both ortho positions and the para position when they are available.",
    trigger: {
      anyFunctionalGroups: ["Aniline"],
      includeSmarts: ["[NH2][c]1[cH][cH][cH][cH][cH]1"],
    },
    transform: {
      type: "reactionSmarts",
      smarts:
        "[NH2:7][c:1]1[cH:2][cH:3][cH:4][cH:5][cH:6]1>>[NH2:7][c:1]1[c:2](Br)[cH:3][c:4](Br)[cH:5][c:6](Br)1",
      maxProducts: 4,
    },
    productStatus: "computed",
    mechanism: "Repeated electrophilic aromatic substitution",
    selectivityProfile: { mixture: "single", majorProductOnly: true },
    selectivity: ["NH₂ directs bromination ortho/para; with all three sites free, 2,4,6-tribromination is the characteristic excess-Br₂ outcome."],
    limitations: ["Protected or protonated amines have different directing strength and may not undergo this rapid tribromination pattern."],
    priority: 1822,
  },
  {
    id: "aromatic-excess-bromination-general",
    family: "aromatics",
    reactionType: "substitution",
    title: "Aromatic Polybromination with Excess Br₂",
    reagents: "excess Br₂, FeBr₃",
    reagentNote: "Further EAS is possible under excess/forcing bromination conditions",
    productHint: "Polybrominated arene",
    explanation:
      "Excess bromine can drive more than one electrophilic aromatic substitution when the ring remains sufficiently reactive. The exact number and positions of bromines depend on the substituents already present and on how each newly installed bromine changes ring reactivity.",
    trigger: {
      ...aromaticTrigger,
      excludedFunctionalGroups: ["Phenol", "Aniline"],
    },
    transform: {
      type: "conceptOnly",
      reason:
        "A general excess-Br₂ product cannot be represented as one universal structure: each substitution changes the directing/deactivating pattern. PocketChem computes the standard 2,4,6 products for unsubstituted phenol and aniline separately and keeps this broader case as an explicit polybromination possibility.",
    },
    mechanism: "Repeated electrophilic aromatic substitution",
    limitations: ["Ordinary bromination is usually stopped at monobromination unless excess reagent and sufficient ring activation/forcing conditions are present."],
    priority: 1825,
  },
  {
    id: "aromatic-halogenation-chlorination",
    family: "aromatics",
    reactionType: "substitution",
    title: "Aromatic Chlorination",
    reagents: "Cl₂, FeCl₃",
    reagentNote: "Lewis-acid-activated chlorination",
    productHint: "Chloroarene",
    explanation:
      "FeCl₃ activates chlorine, and the ring substitutes chlorine for an aromatic hydrogen.",
    trigger: aromaticTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[cH:1]>>[c:1]Cl",
      maxProducts: 12,
    },
    mechanism: "Electrophilic aromatic substitution",
    ...easModelNotes,
    priority: 1830,
  },
  {
    id: "aromatic-gattermann-koch-benzene",
    family: "aromatics",
    reactionType: "substitution",
    title: "Gattermann–Koch Formylation",
    reagents: "CO, HCl, AlCl₃ (often CuCl)",
    reagentNote: "Electrophilic aromatic formylation",
    productHint: "Aromatic aldehyde",
    explanation:
      "CO and HCl under Lewis-acid catalysis generate a formylating electrophile. Benzene gives benzaldehyde by electrophilic aromatic substitution.",
    trigger: {
      includeSmarts: ["[cH]1[cH][cH][cH][cH][cH]1"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[cH:1]>>[c:1][CH]=O",
      maxProducts: 6,
    },
    productStatus: "computed",
    mechanism: "Electrophilic aromatic substitution",
    selectivityProfile: { mixture: "single", majorProductOnly: true },
    limitations: ["Strongly deactivated rings do not undergo Gattermann–Koch formylation readily."],
    priority: 1835,
  },
  {
    id: "aromatic-gattermann-koch-alkylbenzene",
    family: "aromatics",
    reactionType: "substitution",
    title: "Gattermann–Koch Formylation of an Alkylbenzene",
    reagents: "CO, HCl, AlCl₃ (often CuCl)",
    reagentNote: "Para formylation is usually favored for a simple monosubstituted alkylbenzene",
    productHint: "para-Alkylbenzaldehyde",
    explanation:
      "An alkyl substituent activates the ring and directs electrophilic formylation ortho/para. For a simple monosubstituted alkylbenzene, the para product is normally favored because it avoids ortho steric crowding; the ortho product can be minor.",
    trigger: {
      includeSmarts: ["[cH]1[cH][cH][c]([C;X4])[cH][cH]1"],
    },
    transform: {
      type: "reactionSmarts",
      smarts:
        "[cH:1]1[cH:2][cH:3][c:4]([C;X4:8])[cH:5][cH:6]1>>[c:1]1([CH]=O)[cH:2][cH:3][c:4]([C:8])[cH:5][cH:6]1",
      maxProducts: 6,
    },
    productStatus: "computed",
    mechanism: "Electrophilic aromatic substitution",
    selectivityProfile: { mixture: "single", majorProductOnly: true },
    selectivity: ["Alkyl groups are ortho/para directors; the less hindered para formylation product is used as the major representative for a simple monosubstituted alkylbenzene."],
    limitations: ["More highly substituted arenes require full directing-group competition rather than this monosubstituted-ring rule."],
    priority: 1836,
  },
  {
    id: "aromatic-friedel-crafts-alkylation",
    family: "aromatics",
    reactionType: "substitution",
    title: "Friedel–Crafts Alkylation",
    reagents: "AlCl₃",
    reagentNote: "Draw the arene and alkyl halide as disconnected structures",
    productHint: "Alkylbenzene",
    explanation:
      "An alkyl electrophile substitutes onto an activated aromatic ring. Carbocation rearrangement and polyalkylation are common complications.",
    trigger: aromaticTrigger,
    additionalReactants: [
      {
        label: "alkyl chloride, bromide, or iodide",
        trigger: { includeSmarts: ["[C;X4][Cl,Br,I]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[cH:1].[C;X4:2][Cl,Br,I]>>[c:1]-[C:2]",
      maxProducts: 12,
    },
    productStatus: "representative",
    mechanism: "Electrophilic aromatic substitution",
    limitations: [
      "The engine enumerates available aromatic C-H sites but does not rank ortho/para/meta directing effects.",
      "Fails on strongly deactivated rings.",
      "Amino groups complex strongly with AlCl₃ unless protected.",
      "Carbocation rearrangement and polyalkylation may occur; the generated structure represents direct attachment of the drawn alkyl group.",
    ],
    priority: 1840,
  },
  {
    id: "aromatic-friedel-crafts-acylation",
    family: "aromatics",
    reactionType: "substitution",
    title: "Friedel–Crafts Acylation",
    reagents: "AlCl₃",
    reagentNote: "Draw the arene and acyl chloride as disconnected structures",
    productHint: "Aryl ketone",
    explanation:
      "An acylium ion substitutes onto an activated aromatic ring to form an aryl ketone. The acylium ion does not normally rearrange.",
    trigger: aromaticTrigger,
    additionalReactants: [
      {
        label: "acyl chloride",
        trigger: { includeSmarts: ["[C](=O)[Cl,Br]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[cH:1].[C:2](=[O:3])[Cl,Br]>>[c:1]-[C:2](=[O:3])",
      maxProducts: 12,
    },
    productStatus: "representative",
    mechanism: "Electrophilic aromatic substitution",
    limitations: ["The engine enumerates available aromatic C-H sites but does not rank ortho/para/meta directing effects.", "Fails on strongly deactivated rings and often on unprotected amino-substituted rings."],
    priority: 1850,
  },
  {
    id: "aromatic-catalytic-hydrogenation",
    family: "aromatics",
    reactionType: "reduction",
    title: "Aromatic Ring Hydrogenation",
    reagents: "H₂, Pt/Pd/Ni, high pressure and heat",
    reagentNote: "Forcing catalytic reduction",
    productHint: "Saturated cyclohexane derivative",
    explanation:
      "Under forcing conditions, an aromatic ring can be fully hydrogenated to the corresponding saturated ring.",
    trigger: aromaticTrigger,
    transform: {
      type: "conceptOnly",
      reason: "A generic exact transformation must preserve every substituent and fused-ring connection while changing the complete aromatic bond network.",
    },
    mechanism: "Heterogeneous catalytic hydrogenation",
    priority: 1860,
  },
  {
    id: "aromatic-birch-reduction",
    family: "aromatics",
    reactionType: "acidBase",
    title: "Birch Reduction",
    reagents: "Na or Li, NH₃(l), ROH",
    reagentNote: "Dissolving-metal partial reduction",
    productHint: "1,4-Cyclohexadiene derivative",
    explanation:
      "A Birch reduction converts an aromatic ring into a nonconjugated 1,4-cyclohexadiene. Substituents control which ring carbons are reduced.",
    trigger: aromaticTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The exact diene regiochemistry depends on the electronic character and positions of the aromatic substituents.",
    },
    mechanism: "Stepwise electron–proton transfer",
    selectivity: ["Electron-donating and electron-withdrawing substituents give different protonation patterns."],
    priority: 1865,
  },
  {
    id: "benzylic-bromination",
    family: "aromatics",
    reactionType: "radical",
    title: "Benzylic Bromination",
    reagents: "NBS, hν or radical initiator",
    reagentNote: "Selective radical substitution",
    productHint: "Benzylic bromide",
    explanation:
      "NBS maintains a low bromine concentration and substitutes a benzylic hydrogen through a resonance-stabilized radical.",
    trigger: {
      // Structural benzylic matching also covers fused systems such as
      // 2,3-dihydrobenzofuran; requiring the high-level "Alkylbenzene" label
      // caused those legitimate benzylic sites to be missed.
      includeSmarts: ["[c][C;H1,H2,H3]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[c:1][C;H1,H2,H3:2]>>[c:1][C:2]Br",
      maxProducts: 8,
    },
    mechanism: "Radical-chain substitution",
    selectivity: ["Occurs at a benzylic carbon bearing at least one hydrogen."],
    productStatus: "representative",
    limitations: ["Multiple nonequivalent benzylic sites can give multiple products; stereochemical outcomes are not ranked."],
    priority: 1870,
  },
  {
    id: "benzylic-oxidation",
    family: "aromatics",
    reactionType: "oxidation",
    title: "Benzylic Side-Chain Oxidation",
    reagents: "1) KMnO4, OH⁻, heat  2) H₃O⁺",
    reagentNote: "Requires at least one benzylic hydrogen",
    productHint: "Aromatic carboxylic acid",
    explanation:
      "Strong oxidation converts an alkyl side chain containing a benzylic hydrogen into a carboxylic acid, regardless of the original side-chain length.",
    trigger: {
      includeSmarts: ["[c][C;H1,H2,H3]"],
    },
    transform: {
      type: "conceptOnly",
      reason: "Oxidation removes the remainder of an arbitrarily long side chain, which requires explicit fragment-deletion logic rather than a local SMARTS replacement.",
    },
    mechanism: "Strong benzylic oxidation",
    priority: 1880,
  },
  {
    id: "nitroarene-reduction",
    family: "aromatics",
    reactionType: "reduction",
    title: "Nitro Group Reduction",
    reagents: "H₂, Pd/C; or Fe/HCl; or Sn/HCl",
    reagentNote: "Nitro-to-amine reduction",
    productHint: "Aryl amine",
    explanation:
      "A nitro substituent can be reduced to an amino group without hydrogenating the aromatic ring under suitable conditions.",
    trigger: {
      anyFunctionalGroups: ["Nitrobenzene"],
      includeSmarts: ["[c][N+](=O)[O-]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[c:1][N+:2](=[O:3])[O-:4]>>[c:1][NH2+0:2]",
    },
    mechanism: "Multi-step reduction",
    priority: 1890,
  },
  {
    id: "aryl-halide-snar",
    family: "aromatics",
    reactionType: "substitution",
    title: "Nucleophilic Aromatic Substitution",
    reagents: "Nu⁻, heat",
    reagentNote: "Addition–elimination on an activated aryl halide",
    productHint: "Substituted arene",
    explanation:
      "An aryl halide bearing strong electron-withdrawing groups ortho or para to the leaving group can undergo addition–elimination substitution.",
    trigger: {
      anyFunctionalGroups: ["Aryl halide"],
      includeSmarts: ["[c][F,Cl,Br,I]"],
    },
    transform: {
      type: "conceptOnly",
      reason: "The nucleophile and the relative position of activating electron-withdrawing groups must be specified to generate and validate an exact product.",
    },
    mechanism: "SNAr addition–elimination",
    limitations: ["Usually requires a strong electron-withdrawing group ortho or para to the leaving group."],
    priority: 1900,
  },
];
