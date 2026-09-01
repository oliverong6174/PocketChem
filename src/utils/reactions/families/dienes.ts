import type { ReactionRule } from "../reactionTypes";

const conjugatedDieneTrigger = {
  anyFunctionalGroups: ["Conjugated diene", "Diene"],
  includeSmarts: ["[C;!a]=[C;!a]-[C;!a]=[C;!a]"],
};

export const dieneReactionRules: ReactionRule[] = [
  {
    id: "diene-hx-1-2-addition",
    family: "dienes",
    reactionType: "addition",
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
    reactionType: "addition",
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
    reactionType: "pericyclic",
    title: "Diels–Alder Cycloaddition",
    reagents: "heat",
    reagentNote: "Draw the conjugated diene and dienophile as disconnected structures",
    productHint: "Cyclohexene derivative",
    explanation:
      "A conjugated diene in the s-cis conformation reacts with a dienophile in one concerted step to form a six-membered ring.",
    trigger: conjugatedDieneTrigger,
    additionalReactants: [
      {
        label: "dienophile",
        trigger: {
          includeSmarts: ["[C,c]=[C,c]"],
          excludeSmarts: ["[C,c]=[C,c]-[C,c]=[C,c]"],
        },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts:
        "[C:1]=[C:2]-[C:3]=[C:4].[C:5]=[C:6]>>[C:1]1-[C:2]=[C:3]-[C:4]-[C:5]-[C:6]-1",
      maxProducts: 12,
    },
    productStatus: "representative",
    mechanism: "Pericyclic [4+2] cycloaddition",
    selectivity: ["Stereospecific", "Endo product often favored kinetically"],
    limitations: ["The diene must be able to adopt an s-cis conformation.", "Constitutional products are generated, but endo/exo and facial stereochemistry are not yet assigned."],
    priority: 720,
  },
  {
    id: "diene-diels-alder-alkyne",
    family: "dienes",
    reactionType: "pericyclic",
    title: "Diels–Alder Cycloaddition with an Alkyne",
    reagents: "heat",
    reagentNote: "Draw the conjugated diene and alkyne dienophile as disconnected structures",
    productHint: "Cyclohexadiene derivative",
    explanation:
      "A conjugated diene can undergo a concerted [4+2] cycloaddition with an alkyne dienophile, leaving a second double bond in the six-membered product.",
    trigger: conjugatedDieneTrigger,
    additionalReactants: [
      { label: "alkyne dienophile", trigger: { includeSmarts: ["[C]#[C]"] } },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[C:2]-[C:3]=[C:4].[C:5]#[C:6]>>[C:1]1-[C:2]=[C:3]-[C:4]-[C:5]=[C:6]-1",
      maxProducts: 12,
    },
    mechanism: "Pericyclic [4+2] cycloaddition",
    selectivity: ["Stereospecific", "Endo approach is often kinetically favored when applicable"],
    productStatus: "representative",
    limitations: ["The diene must be able to adopt an s-cis conformation.", "Facial and endo/exo stereochemistry are not yet assigned."],
    priority: 722,
  },
  {
    id: "diene-polymerization",
    family: "dienes",
    reactionType: "addition",
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
