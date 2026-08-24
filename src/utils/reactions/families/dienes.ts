import type { ReactionRule } from "../reactionTypes";

const conjugatedDieneTrigger = {
  anyFunctionalGroups: ["Conjugated diene", "Diene"],
  includeSmarts: ["[C;!a]=[C;!a]-[C;!a]=[C;!a]"],
};

export const dieneReactionRules: ReactionRule[] = [
  {
    id: "diene-hx-1-2-addition",
    family: "dienes",
    title: "Electrophilic Addition to a Diene: 1,2 Product",
    reagents: "HBr or HCl, low temperature",
    reagentNote: "Kinetic addition",
    productHint: "1,2-addition product",
    explanation:
      "Protonation forms an allylic carbocation. Fast nucleophilic capture near the protonated carbon gives the kinetic 1,2-addition product.",
    trigger: conjugatedDieneTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "Regioselective allylic-cation mapping is required to generate the correct 1,2 product for an unsymmetrical diene.",
    },
    mechanism: "Electrophilic addition",
    selectivity: ["Kinetic product", "Favored at lower temperature"],
    priority: 700,
  },
  {
    id: "diene-hx-1-4-addition",
    family: "dienes",
    title: "Electrophilic Addition to a Diene: 1,4 Product",
    reagents: "HBr or HCl, higher temperature",
    reagentNote: "Thermodynamic addition",
    productHint: "1,4-addition product",
    explanation:
      "Resonance delocalization of the allylic carbocation allows halide attack at the remote position, often giving the more stable thermodynamic alkene.",
    trigger: conjugatedDieneTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "Regioselective allylic-cation mapping is required to generate the correct 1,4 product for an unsymmetrical diene.",
    },
    mechanism: "Electrophilic addition",
    selectivity: ["Thermodynamic product", "Favored at higher temperature"],
    priority: 710,
  },
  {
    id: "diene-diels-alder",
    family: "dienes",
    title: "Diels–Alder Cycloaddition",
    reagents: "Dienophile, heat",
    reagentNote: "Concerted [4+2] cycloaddition",
    productHint: "Cyclohexene derivative",
    explanation:
      "A conjugated diene in the s-cis conformation reacts with a dienophile in one concerted step to form a six-membered ring.",
    trigger: conjugatedDieneTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "The dienophile structure must be supplied as a second reactant before the cycloaddition product can be generated.",
    },
    mechanism: "Pericyclic [4+2] cycloaddition",
    selectivity: ["Stereospecific", "Endo product often favored kinetically"],
    limitations: ["The diene must be able to adopt an s-cis conformation."],
    priority: 720,
  },
  {
    id: "diene-polymerization",
    family: "dienes",
    title: "Conjugated Diene Polymerization",
    reagents: "Radical, cationic, anionic, or coordination initiator",
    reagentNote: "Chain-growth polymerization",
    productHint: "Polyene polymer",
    explanation:
      "Conjugated dienes can polymerize by 1,2- or 1,4-addition pathways, producing polymers with different alkene placement and stereochemistry.",
    trigger: conjugatedDieneTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "Polymer repeat units and chain length require a polymer-specific representation rather than a finite small-molecule product.",
    },
    mechanism: "Chain-growth polymerization",
    priority: 730,
  },
];
