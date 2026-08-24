import type { ReactionRule } from "../reactionTypes";

const phenolTrigger = {
  anyFunctionalGroups: ["Phenol"],
};

export const phenolReactionRules: ReactionRule[] = [
  {
    id: "phenol-deprotonation",
    family: "phenols",
    reactionType: "acidBase",
    title: "Phenol Deprotonation",
    reagents: "NaOH or NaH",
    reagentNote: "Acid-base reaction",
    productHint: "Phenoxide ion",
    explanation:
      "Phenols are more acidic than ordinary alcohols because the phenoxide conjugate base is resonance stabilized.",
    trigger: phenolTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[c:1][OH:2]>>[c:1][O-:2]",
    },
    mechanism: "Proton transfer",
    priority: 1600,
  },
  {
    id: "phenol-williamson-ether",
    family: "phenols",
    reactionType: "substitution",
    title: "Phenoxide Williamson Ether Synthesis",
    reagents: "1) NaOH or NaH  2) primary R–X",
    reagentNote: "O-alkylation",
    productHint: "Aryl ether",
    explanation:
      "Phenoxide attacks a methyl or primary alkyl halide by SN2 to form an aryl ether.",
    trigger: phenolTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "The alkyl halide must be specified before an exact aryl ether can be generated.",
    },
    mechanism: "SN2",
    priority: 1610,
  },
  {
    id: "phenol-bromination-water",
    family: "phenols",
    reactionType: "substitution",
    title: "Bromination of Phenol",
    reagents: "Br₂, H₂O",
    reagentNote: "Strongly activated electrophilic aromatic substitution",
    productHint: "2,4,6-tribromophenol when positions are available",
    explanation:
      "The hydroxyl group strongly activates the ring and directs substitution ortho and para, so bromination in water can occur repeatedly without a Lewis acid.",
    trigger: phenolTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "Available ortho and para positions must be inspected before the number and placement of bromines can be generated.",
    },
    mechanism: "Electrophilic aromatic substitution",
    selectivity: ["Ortho/para directing", "Strong activation"],
    priority: 1620,
  },
  {
    id: "phenol-nitration",
    family: "phenols",
    reactionType: "substitution",
    title: "Nitration of Phenol",
    reagents: "Dilute HNO₃ or HNO₃/H₂SO₄",
    reagentNote: "Electrophilic aromatic substitution",
    productHint: "Ortho- and para-nitrophenol derivatives",
    explanation:
      "Phenol directs nitration to ortho and para positions. Stronger conditions can cause multiple nitrations.",
    trigger: phenolTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "Substitution position and degree of nitration depend on existing ring substituents and reagent strength.",
    },
    mechanism: "Electrophilic aromatic substitution",
    selectivity: ["Ortho/para directing"],
    priority: 1630,
  },
  {
    id: "phenol-kolbe-schmitt",
    family: "phenols",
    reactionType: "substitution",
    title: "Kolbe–Schmitt Reaction",
    reagents: "1) NaOH  2) CO₂, pressure, heat  3) H₃O⁺",
    reagentNote: "Carboxylation of phenoxide",
    productHint: "Ortho-hydroxybenzoic acid derivative",
    explanation:
      "Phenoxide reacts with carbon dioxide, usually placing a carboxyl group ortho to oxygen after acidic workup.",
    trigger: phenolTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "Ring substitution and blocked ortho positions must be evaluated before an exact product can be generated.",
    },
    mechanism: "Electrophilic aromatic substitution",
    selectivity: ["Usually ortho carboxylation"],
    priority: 1640,
  },
  {
    id: "phenol-reimer-tiemann",
    family: "phenols",
    reactionType: "substitution",
    title: "Reimer–Tiemann Formylation",
    reagents: "CHCl₃, NaOH, heat; then H₃O⁺",
    reagentNote: "Ortho formylation",
    productHint: "Ortho-hydroxybenzaldehyde derivative",
    explanation:
      "Dichlorocarbene generated from chloroform leads to formylation of a phenol, usually at an ortho position.",
    trigger: phenolTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "Available ortho positions and competing para substitution must be evaluated before an exact product can be generated.",
    },
    mechanism: "Electrophilic aromatic substitution",
    selectivity: ["Usually ortho formylation"],
    priority: 1650,
  },
  {
    id: "phenol-oxidation-quinone",
    family: "phenols",
    reactionType: "oxidation",
    title: "Oxidation to a Quinone",
    reagents: "Na₂Cr₂O₇/H₂SO₄, Fremy’s salt, or another suitable oxidant",
    reagentNote: "Oxidative dearomatization",
    productHint: "Quinone derivative",
    explanation:
      "Appropriately substituted phenols can be oxidized to conjugated cyclohexadienediones called quinones.",
    trigger: phenolTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "Quinone regiochemistry depends on substitution pattern and oxidant, requiring ring-aware atom mapping.",
    },
    mechanism: "Oxidation",
    priority: 1660,
  },
];
