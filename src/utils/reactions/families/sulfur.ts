import type { ReactionRule } from "../reactionTypes";

export const sulfurReactionRules: ReactionRule[] = [
  {
    id: "thiol-deprotonation",
    family: "sulfur",
    reactionType: "acidBase",
    title: "Thiol Deprotonation",
    reagents: "NaH, NaNH₂, or another sufficiently strong base",
    reagentNote: "Forms a thiolate nucleophile",
    productHint: "Thiolate",
    explanation:
      "Thiols are more acidic than alcohols, so a strong base converts RSH into the strongly nucleophilic thiolate RS⁻.",
    trigger: {
      anyFunctionalGroups: ["Thiol"],
      includeSmarts: ["[#6][SX2H]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[S;H1:1]>>[S-:1]",
    },
    mechanism: "Proton transfer",
    priority: 2100,
  },
  {
    id: "thiolate-alkylation",
    family: "sulfur",
    reactionType: "substitution",
    title: "Thioether Formation by Alkylation",
    reagents: "1) base  2) primary R–X",
    reagentNote: "Thiolate SN2 substitution",
    productHint: "Thioether",
    explanation:
      "A thiolate attacks a methyl or primary alkyl halide by SN2 to form a carbon–sulfur bond.",
    trigger: {
      anyFunctionalGroups: ["Thiol", "Thiolate"],
    },
    transform: {
      type: "conceptOnly",
      reason: "The alkyl halide reactant must be specified before an exact thioether can be generated.",
    },
    mechanism: "SN2",
    priority: 2110,
  },
  {
    id: "thiol-oxidation-disulfide",
    family: "sulfur",
    reactionType: "oxidation",
    title: "Thiol Oxidation to a Disulfide",
    reagents: "mild oxidant",
    reagentNote: "Couples two thiol molecules",
    productHint: "Disulfide",
    explanation:
      "Mild oxidation joins two thiols through an S–S bond to form a disulfide.",
    trigger: {
      anyFunctionalGroups: ["Thiol"],
    },
    transform: {
      type: "conceptOnly",
      reason: "Disulfide formation consumes two thiol molecules, while the current predictor accepts one drawn reactant molecule.",
    },
    mechanism: "Oxidative coupling",
    priority: 2120,
  },
  {
    id: "disulfide-reduction",
    family: "sulfur",
    reactionType: "reduction",
    title: "Disulfide Reduction",
    reagents: "Zn/H⁺, DTT, or another reducing agent",
    reagentNote: "Cleaves the S–S bond",
    productHint: "Two thiols",
    explanation:
      "Reduction cleaves a disulfide bond and protonation gives two thiol products.",
    trigger: {
      anyFunctionalGroups: ["Disulfide"],
      includeSmarts: ["[SX2][SX2]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[S:1][S:2]>>[SH:1].[SH:2]",
    },
    mechanism: "Reduction",
    priority: 2130,
  },
  {
    id: "thioether-oxidation-sulfoxide",
    family: "sulfur",
    reactionType: "oxidation",
    title: "Controlled Thioether Oxidation",
    reagents: "1 equivalent mCPBA or H₂O₂",
    reagentNote: "One oxygen transfer",
    productHint: "Sulfoxide",
    explanation:
      "Controlled oxidation of a thioether inserts one oxygen at sulfur to form a sulfoxide.",
    trigger: {
      anyFunctionalGroups: ["Thioether"],
      includeSmarts: ["[#6][SX2][#6]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[S;X2:1]([#6:2])[#6:3]>>[S:1](=O)([#6:2])[#6:3]",
    },
    mechanism: "Oxygen-atom transfer",
    priority: 2140,
  },
  {
    id: "thioether-oxidation-sulfone",
    family: "sulfur",
    reactionType: "oxidation",
    title: "Thioether Oxidation to a Sulfone",
    reagents: "excess mCPBA, H₂O₂, or Oxone",
    reagentNote: "Two oxygen transfers",
    productHint: "Sulfone",
    explanation:
      "Excess oxidant converts a thioether through the sulfoxide oxidation state to a sulfone.",
    trigger: {
      anyFunctionalGroups: ["Thioether"],
      includeSmarts: ["[#6][SX2][#6]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[S;X2:1]([#6:2])[#6:3]>>[S:1](=O)(=O)([#6:2])[#6:3]",
    },
    mechanism: "Oxygen-atom transfer",
    priority: 2150,
  },
  {
    id: "sulfoxide-oxidation-sulfone",
    family: "sulfur",
    reactionType: "oxidation",
    title: "Sulfoxide Oxidation",
    reagents: "mCPBA, H₂O₂, or Oxone",
    reagentNote: "Adds the second sulfur-bound oxygen",
    productHint: "Sulfone",
    explanation:
      "Further oxidation of a sulfoxide gives a sulfone.",
    trigger: {
      anyFunctionalGroups: ["Sulfoxide"],
      includeSmarts: ["[#6][SX3](=O)[#6]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[S:1](=[O:2])([#6:3])[#6:4]>>[S:1](=[O:2])(=O)([#6:3])[#6:4]",
    },
    mechanism: "Oxygen-atom transfer",
    priority: 2160,
  },
  {
    id: "sulfoxide-reduction-thioether",
    family: "sulfur",
    reactionType: "reduction",
    title: "Sulfoxide Reduction",
    reagents: "PPh₃, Zn/AcOH, or another deoxygenating reagent",
    reagentNote: "Removes sulfur-bound oxygen",
    productHint: "Thioether",
    explanation:
      "Deoxygenation converts a sulfoxide back into the corresponding thioether.",
    trigger: {
      anyFunctionalGroups: ["Sulfoxide"],
      includeSmarts: ["[#6][SX3](=O)[#6]"],
    },
    transform: {
      type: "reactionSmarts",
      smarts: "[S:1](=[O:2])([#6:3])[#6:4]>>[S:1]([#6:3])[#6:4]",
    },
    mechanism: "Deoxygenation",
    priority: 2170,
  },
  {
    id: "sulfonyl-chloride-sulfonamide",
    family: "sulfur",
    reactionType: "substitution",
    title: "Sulfonamide Formation",
    reagents: "NH₃, RNH₂, or R₂NH; base",
    reagentNote: "Sulfonyl substitution",
    productHint: "Sulfonamide",
    explanation:
      "An amine displaces chloride from a sulfonyl chloride to form a sulfonamide.",
    trigger: {
      anyFunctionalGroups: ["Sulfonyl chloride"],
    },
    transform: {
      type: "conceptOnly",
      reason: "The amine reactant must be specified before an exact sulfonamide can be generated.",
    },
    mechanism: "Nucleophilic substitution at sulfur",
    priority: 2180,
  },
  {
    id: "sulfonyl-chloride-sulfonate-ester",
    family: "sulfur",
    reactionType: "substitution",
    title: "Sulfonate Ester Formation",
    reagents: "ROH, pyridine or another base",
    reagentNote: "Sulfonylation of an alcohol",
    productHint: "Sulfonate ester",
    explanation:
      "An alcohol reacts with a sulfonyl chloride to form a sulfonate ester such as a tosylate or mesylate.",
    trigger: {
      anyFunctionalGroups: ["Sulfonyl chloride"],
    },
    transform: {
      type: "conceptOnly",
      reason: "The alcohol reactant must be specified before an exact sulfonate ester can be generated.",
    },
    mechanism: "Nucleophilic substitution at sulfur",
    priority: 2190,
  },
];
