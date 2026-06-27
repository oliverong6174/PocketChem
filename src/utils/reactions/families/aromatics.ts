import type { ReactionRule } from "../reactionTypes";

const aromaticTrigger = {
  functionalGroups: [
    "Arene",
    "Aromatic ring",
    "Benzene derivative",
    "Benzene",
    "Phenol",
    "Aniline",
    "Anisole",
    "Toluene",
  ],
};

export const aromaticReactionRules: ReactionRule[] = [
  {
    id: "aromatic-nitration",
    family: "aromatics",
    title: "Aromatic Nitration",
    reagents: "HNO₃, H₂SO₄",
    reagentNote: "Electrophilic aromatic substitution",
    productHint: "Nitroarene",
    explanation:
      "Aromatic rings undergo nitration with nitric acid and sulfuric acid to install a nitro group.",
    trigger: aromaticTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[cH:1]>>[c:1][N+](=O)[O-]",
    },
    priority: 1800,
  },
  {
    id: "aromatic-sulfonation",
    family: "aromatics",
    title: "Aromatic Sulfonation",
    reagents: "SO₃, H₂SO₄",
    reagentNote: "Electrophilic aromatic substitution",
    productHint: "Arenesulfonic acid",
    explanation:
      "Aromatic rings react with sulfur trioxide in sulfuric acid to form sulfonic acid derivatives.",
    trigger: aromaticTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[cH:1]>>[c:1]S(=O)(=O)O",
    },
    priority: 1810,
  },
  {
    id: "aromatic-halogenation-bromination",
    family: "aromatics",
    title: "Aromatic Bromination",
    reagents: "Br₂, FeBr₃",
    reagentNote: "Electrophilic aromatic substitution",
    productHint: "Bromoarene",
    explanation:
      "Aromatic rings undergo bromination with bromine and iron(III) bromide.",
    trigger: aromaticTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[cH:1]>>[c:1]Br",
    },
    priority: 1820,
  },
  {
    id: "aromatic-halogenation-chlorination",
    family: "aromatics",
    title: "Aromatic Chlorination",
    reagents: "Cl₂, FeCl₃",
    reagentNote: "Electrophilic aromatic substitution",
    productHint: "Chloroarene",
    explanation:
      "Aromatic rings undergo chlorination with chlorine and iron(III) chloride.",
    trigger: aromaticTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[cH:1]>>[c:1]Cl",
    },
    priority: 1830,
  },
  {
    id: "aromatic-friedel-crafts-alkylation",
    family: "aromatics",
    title: "Friedel-Crafts Alkylation",
    reagents: "R-Cl, AlCl₃",
    reagentNote: "Electrophilic aromatic substitution",
    productHint: "Alkylbenzene",
    explanation:
      "Aromatic rings can undergo Friedel-Crafts alkylation to install an alkyl group.",
    trigger: aromaticTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[cH:1]>>[c:1]C",
    },
    priority: 1840,
  },
  {
    id: "aromatic-friedel-crafts-acylation",
    family: "aromatics",
    title: "Friedel-Crafts Acylation",
    reagents: "Acid chloride, AlCl₃",
    reagentNote: "Electrophilic aromatic substitution",
    productHint: "Aryl ketone",
    explanation:
      "Aromatic rings react with acid chlorides and aluminum chloride to form aryl ketones.",
    trigger: aromaticTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[cH:1]>>[c:1]C(=O)C",
    },
    priority: 1850,
  },
  {
    id: "aromatic-catalytic-hydrogenation",
    family: "aromatics",
    title: "Aromatic Ring Hydrogenation",
    reagents: "H₂, Pt or Pd, high pressure",
    reagentNote: "Strong catalytic reduction",
    productHint: "Cyclohexane derivative",
    explanation:
      "Aromatic rings can be hydrogenated under forcing catalytic conditions to form cyclohexane derivatives.",
    trigger: aromaticTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "c1ccccc1>>C1CCCCC1",
    },
    priority: 1860,
  },
  {
    id: "benzylic-bromination",
    family: "aromatics",
    title: "Benzylic Bromination",
    reagents: "NBS, hv",
    reagentNote: "Radical benzylic substitution",
    productHint: "Benzyl bromide",
    explanation:
      "Alkylbenzenes with benzylic hydrogens undergo radical bromination at the benzylic position.",
    trigger: aromaticTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[c:1][CH3:2]>>[c:1][CH2:2]Br",
    },
    priority: 1870,
  },
  {
    id: "benzylic-oxidation",
    family: "aromatics",
    title: "Benzylic Oxidation",
    reagents: "KMnO₄, heat",
    reagentNote: "Requires benzylic hydrogen",
    productHint: "Benzoic acid derivative",
    explanation:
      "Alkylbenzenes with at least one benzylic hydrogen can be oxidized to benzoic acid derivatives.",
    trigger: aromaticTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[c:1][CH3:2]>>[c:1]C(=O)O",
    },
    priority: 1880,
  },
];