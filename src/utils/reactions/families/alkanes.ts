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

/**
 * Radical halogenation is executable rather than concept-only.  The shared
 * handler enumerates symmetry-distinct C-H sites and orders products by the
 * stability of the intermediate carbon radical.  Minor constitutional
 * products remain available to multistep planning instead of being discarded.
 */
export const alkaneReactionRules: ReactionRule[] = [
  {
    id: "alkane-radical-bromination",
    conditions: { radical: true },
    family: "alkanes",
    reactionType: "radical",
    title: "Free-Radical Bromination",
    reagents: "Br₂, hν or Br₂, Δ",
    reagentNote: "Selective radical-chain bromination",
    productHint: "Alkyl bromide product(s)",
    explanation:
      "Light or heat homolyzes Br₂ and starts a radical-chain substitution. Bromination is strongly selective for the C-H bond whose abstraction gives the most stable carbon radical, although minor constitutional products can still form.",
    trigger: alkaneTrigger,
    transform: {
      type: "customHandler",
      handler: "radical",
      options: {
        mode: "alkaneHalogenation",
        halogen: "Br",
        maxProducts: 16,
      },
    },
    mechanism: "Free-radical substitution",
    selectivityProfile: {
      mixture: "possible",
      sitePreference: "most-stable-radical-site",
    },
    selectivity: [
      "3° H ≫ 2° H > 1° H for ordinary bromination",
      "Symmetry-equivalent C-H sites collapse to one constitutional product",
    ],
    limitations: [
      "Minor constitutional products remain available to synthesis planning, but PocketChem now penalizes them according to an approximate substrate-specific radical selectivity model.",
    ],
    productStatus: "computed",
    priority: 98,
  },
  {
    id: "alkane-radical-chlorination",
    conditions: { radical: true },
    family: "alkanes",
    reactionType: "radical",
    title: "Free-Radical Chlorination",
    reagents: "Cl₂, hν or Cl₂, Δ",
    reagentNote: "Radical-chain chlorination",
    productHint: "Alkyl chloride product(s)",
    explanation:
      "Light or heat homolyzes Cl₂ and starts a radical-chain substitution. Chlorination favors more substituted radical sites but is much less selective than bromination, so constitutional mixtures are common.",
    trigger: alkaneTrigger,
    transform: {
      type: "customHandler",
      handler: "radical",
      options: {
        mode: "alkaneHalogenation",
        halogen: "Cl",
        maxProducts: 16,
      },
    },
    mechanism: "Free-radical substitution",
    selectivityProfile: {
      mixture: "expected",
      sitePreference: "most-stable-radical-site",
    },
    selectivity: [
      "3° H > 2° H > 1° H, but chlorination is comparatively unselective",
      "Constitutional mixtures are commonly expected",
    ],
    limitations: [
      "Constitutional products remain available to synthesis planning and are ranked with an approximate substrate-specific radical selectivity model; displayed percentages are planning estimates rather than measured yields.",
    ],
    productStatus: "computed",
    priority: 99,
  },
];
