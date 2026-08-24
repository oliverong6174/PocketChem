import type { ReactionRule } from "../reactionTypes";

const diazoniumTrigger = {
  anyFunctionalGroups: ["Benzenediazonium"],
};

export const diazoniumReactionRules: ReactionRule[] = [
  {
    id: "diazonium-sandmeyer-chloride",
    family: "diazonium",
    reactionType: "substitution",
    title: "Sandmeyer Chlorination",
    reagents: "CuCl, HCl",
    reagentNote: "Diazonium replacement",
    productHint: "Aryl chloride",
    explanation:
      "Copper(I) chloride replaces the diazonium group with chlorine while nitrogen gas leaves.",
    trigger: diazoniumTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[c:1][N+:2]#[N:3]>>[c:1]Cl",
    },
    mechanism: "Sandmeyer substitution",
    priority: 2000,
  },
  {
    id: "diazonium-sandmeyer-bromide",
    family: "diazonium",
    reactionType: "substitution",
    title: "Sandmeyer Bromination",
    reagents: "CuBr, HBr",
    reagentNote: "Diazonium replacement",
    productHint: "Aryl bromide",
    explanation:
      "Copper(I) bromide replaces the diazonium group with bromine while nitrogen gas leaves.",
    trigger: diazoniumTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[c:1][N+:2]#[N:3]>>[c:1]Br",
    },
    mechanism: "Sandmeyer substitution",
    priority: 2010,
  },
  {
    id: "diazonium-sandmeyer-cyanide",
    family: "diazonium",
    reactionType: "substitution",
    title: "Sandmeyer Cyanation",
    reagents: "CuCN",
    reagentNote: "Diazonium replacement",
    productHint: "Aryl nitrile",
    explanation:
      "Copper(I) cyanide replaces the diazonium group with a nitrile, providing a useful carbon-carbon bond-forming conversion.",
    trigger: diazoniumTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[c:1][N+:2]#[N:3]>>[c:1]C#N",
    },
    mechanism: "Sandmeyer substitution",
    priority: 2020,
  },
  {
    id: "diazonium-hydrolysis-phenol",
    family: "diazonium",
    reactionType: "substitution",
    title: "Diazonium Hydrolysis",
    reagents: "H₂O, heat",
    reagentNote: "Replacement by hydroxyl",
    productHint: "Phenol",
    explanation:
      "Heating an arenediazonium salt in water replaces the diazonium group with hydroxyl.",
    trigger: diazoniumTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[c:1][N+:2]#[N:3]>>[c:1]O",
    },
    mechanism: "Diazonium substitution",
    priority: 2030,
  },
  {
    id: "diazonium-iodide",
    family: "diazonium",
    reactionType: "substitution",
    title: "Diazonium Replacement by Iodide",
    reagents: "KI",
    reagentNote: "Direct iodide substitution",
    productHint: "Aryl iodide",
    explanation:
      "Iodide replaces the diazonium group without requiring a copper catalyst.",
    trigger: diazoniumTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[c:1][N+:2]#[N:3]>>[c:1]I",
    },
    mechanism: "Diazonium substitution",
    priority: 2040,
  },
  {
    id: "diazonium-balz-schiemann-fluoride",
    family: "diazonium",
    reactionType: "substitution",
    title: "Balz–Schiemann Fluorination",
    reagents: "1) HBF₄  2) heat",
    reagentNote: "Thermal diazonium tetrafluoroborate decomposition",
    productHint: "Aryl fluoride",
    explanation:
      "An arenediazonium tetrafluoroborate decomposes on heating to form an aryl fluoride and nitrogen gas.",
    trigger: diazoniumTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[c:1][N+:2]#[N:3]>>[c:1]F",
    },
    mechanism: "Diazonium substitution",
    priority: 2050,
  },
  {
    id: "diazonium-reduction-hydrogen",
    family: "diazonium",
    reactionType: "reduction",
    title: "Diazonium Reduction",
    reagents: "H₃PO₂",
    reagentNote: "Replacement by hydrogen",
    productHint: "Arene",
    explanation:
      "Hypophosphorous acid replaces the diazonium group with hydrogen, allowing an amino group to serve as a temporary directing group.",
    trigger: diazoniumTrigger,
    transform: {
      type: "reactionSmarts",
      smarts: "[c:1][N+:2]#[N:3]>>[cH:1]",
    },
    mechanism: "Radical reduction",
    priority: 2060,
  },
  {
    id: "diazonium-azo-coupling",
    family: "diazonium",
    reactionType: "substitution",
    title: "Azo Coupling",
    reagents: "Activated aromatic ring such as phenol or aniline, mildly basic conditions",
    reagentNote: "Electrophilic aromatic coupling",
    productHint: "Azo compound",
    explanation:
      "An arenediazonium ion acts as an electrophile toward a strongly activated aromatic ring, forming an intensely colored azo linkage.",
    trigger: diazoniumTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "The activated aromatic coupling partner and its substitution position must be specified before an exact azo product can be generated.",
    },
    mechanism: "Electrophilic aromatic substitution",
    selectivity: ["Usually para coupling when the para position is open"],
    priority: 2070,
  },
];
