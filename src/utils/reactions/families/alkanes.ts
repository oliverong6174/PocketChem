import type { ReactionRule } from "../reactionTypes";

const alkaneTrigger = {
  anyFunctionalGroups: [
    "Alkane",
    "Methane / Alkane",
    "Cycloalkane",
    "Cyclopropane",
    "Cyclobutane",
    "Cyclopentane",
    "Cyclohexane",
  ],
};

export const alkaneReactionRules: ReactionRule[] = [
  {
    id: "alkane-radical-halogenation",
    family: "alkanes",
    reactionType: "radical",
    title: "Free-Radical Halogenation",
    reagents: "Cl₂ or Br₂, hν or heat",
    reagentNote: "Radical-chain substitution; choose Cl₂ or Br₂",
    productHint: "Alkyl halide product(s)",
    explanation:
      "Light or heat homolyzes Cl₂ or Br₂ and starts a radical-chain substitution. Chlorination is comparatively reactive and often gives a broader regioisomer mixture; bromination is slower but much more selective for the hydrogen that forms the most stable carbon radical.",
    trigger: alkaneTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "An exact product distribution requires enumerating symmetry-distinct C-H sites, ranking the corresponding radicals, and applying halogen-specific selectivity rather than assuming one universal major product.",
    },
    mechanism: "Free-radical substitution",
    selectivity: [
      "Cl₂: 3° H > 2° H > 1° H, but chlorination is relatively unselective and mixtures are common",
      "Br₂: 3° H ≫ 2° H > 1° H; bromination is much more selective",
      "F₂ is generally too vigorous for the standard selective teaching reaction; radical iodination with I₂ is thermodynamically unfavorable under ordinary conditions",
    ],
    priority: 100,
  },
];
