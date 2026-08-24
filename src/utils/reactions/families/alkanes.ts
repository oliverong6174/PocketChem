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
    id: "alkane-radical-chlorination",
    family: "alkanes",
    title: "Free-Radical Chlorination",
    reagents: "Cl₂, hν or heat",
    reagentNote: "Radical chain substitution",
    productHint: "Mixture of alkyl chlorides",
    explanation:
      "Chlorine radicals replace an alkane hydrogen. Chlorination is reactive and usually gives a regioisomer mixture when different hydrogens are present.",
    trigger: alkaneTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "The major product depends on every distinct hydrogen environment, so a regioselective radical-site enumerator is required.",
    },
    mechanism: "Free-radical substitution",
    selectivity: ["3° H > 2° H > 1° H", "Low selectivity"],
    priority: 100,
  },
  {
    id: "alkane-radical-bromination",
    family: "alkanes",
    title: "Free-Radical Bromination",
    reagents: "Br₂, hν or heat",
    reagentNote: "Selective radical chain substitution",
    productHint: "Major alkyl bromide",
    explanation:
      "Bromine radicals replace the hydrogen that forms the most stable carbon radical, making bromination much more selective than chlorination.",
    trigger: alkaneTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "An exact product requires ranking all distinct radical intermediates and preserving symmetry-equivalent sites.",
    },
    mechanism: "Free-radical substitution",
    selectivity: ["3° H ≫ 2° H > 1° H", "High selectivity"],
    priority: 110,
  },
];
