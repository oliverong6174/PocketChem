import type { ReactionRule } from "../reactionTypes";

const conjugatedDieneTrigger = {
  // Structural matching is more reliable than depending on the nomenclature/FG
  // label of a fused or substituted diene.
  includeSmarts: ["[C;!a]=[C;!a]-[C;!a]=[C;!a]"],
};

type DieneHydrohalogen = {
  suffix: "hcl" | "hbr" | "hi";
  reagent: "HCl" | "HBr" | "HI";
  halogen: "Cl" | "Br" | "I";
};

const DIENE_HX: DieneHydrohalogen[] = [
  // HBr is listed first because the 1 equiv / temperature-controlled case is
  // the canonical O-Chem conjugated-diene example and should appear before
  // the generic alkene peroxide card in the reaction results.
  { suffix: "hbr", reagent: "HBr", halogen: "Br" },
  { suffix: "hcl", reagent: "HCl", halogen: "Cl" },
  { suffix: "hi", reagent: "HI", halogen: "I" },
];

const dieneHydrohalogenationRules: ReactionRule[] = DIENE_HX.flatMap(
  ({ suffix, reagent, halogen }, index) => [
    {
      id: `diene-hx-1-2-${suffix}`,
      family: "dienes",
      reactionType: "addition",
      title: "Electrophilic Addition to a Diene: 1,2 Product",
      reagents: `1 equiv ${reagent}, low temperature`,
      reagentNote: "Kinetic 1,2-addition",
      productHint: "1,2-hydrohalogenation product",
      explanation:
        "Protonation forms an allylic carbocation. Fast halide capture at the adjacent allylic position gives the kinetic 1,2-addition product.",
      trigger: conjugatedDieneTrigger,
      transform: {
        type: "customHandler",
        handler: "addition",
        options: {
          mode: "dieneHydrohalogenation",
          halogen,
          additionPattern: "1,2",
        },
      },
      productStatus: "representative",
      mechanism: "Electrophilic addition through an allylic carbocation",
      selectivityProfile: {
        regiochemistry: { mode: "directed", regioselective: true },
        mixture: "single",
        allowsRearrangement: false,
      },
      selectivity: [
        "Kinetic 1,2 product",
        "Favored at lower temperature",
        "PocketChem ranks the allylic-cation orientations and keeps the favored regioisomer instead of displaying every formal atom-map match.",
      ],
      priority: 106 + index * 2,
    },
    {
      id: `diene-hx-1-4-${suffix}`,
      family: "dienes",
      reactionType: "addition",
      title: "Electrophilic Addition to a Diene: 1,4 Product",
      reagents: reagent === "HBr" ? "1 equiv HBr, 40 °C" : `1 equiv ${reagent}, higher temperature`,
      reagentNote: "Thermodynamic 1,4-addition",
      productHint: "1,4-hydrohalogenation product",
      explanation:
        "The allylic carbocation is resonance-delocalized. At higher temperature the reversible addition can equilibrate toward remote halide capture and the thermodynamically favored 1,4-addition alkene.",
      trigger: conjugatedDieneTrigger,
      transform: {
        type: "customHandler",
        handler: "addition",
        options: {
          mode: "dieneHydrohalogenation",
          halogen,
          additionPattern: "1,4",
        },
      },
      productStatus: "representative",
      mechanism: "Electrophilic addition through an allylic carbocation",
      selectivityProfile: {
        regiochemistry: { mode: "directed", regioselective: true },
        mixture: "single",
        allowsRearrangement: false,
      },
      selectivity: [
        "Thermodynamic 1,4 product",
        reagent === "HBr" ? "40 °C is a common higher-temperature/thermodynamic HBr condition" : "Favored at higher temperature",
        "The major product is ranked by the stability of the resulting alkene and allylic-cation pathway; lower-ranked formal regioisomers are not displayed.",
        "One equivalent adds one HX across the conjugated diene rather than saturating both double bonds.",
      ],
      priority: 107 + index * 2,
    },
  ],
);

export const dieneReactionRules: ReactionRule[] = [
  ...dieneHydrohalogenationRules,
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
      type: "customHandler",
      handler: "pericyclic",
      options: {
        mode: "dielsAlder",
        maxProducts: 8,
      },
    },
    productStatus: "representative",
    selectivityProfile: {
      // With achiral starting materials, attack on the two enantiotopic faces
      // gives a racemate. Both members remain stored for chemical identity,
      // while ReactionsPage draws one representative enantiomer and labels the
      // outcome racemic instead of presenting the mirror image as an "OR".
      mixture: "expected",
    },
    mechanism: "Pericyclic [4+2] cycloaddition",
    selectivity: [
      "Stereospecific: a Z dienophile retains a cis substituent relationship and an E dienophile retains a trans relationship",
      "When facial attack gives an enantiomeric pair, PocketChem stores both members but displays one representative structure labeled as a racemate",
      "Endo approach is often favored kinetically for electron-withdrawing dienophile substituents",
    ],
    limitations: [
      "The diene must be able to adopt an s-cis conformation.",
      "PocketChem propagates dienophile E/Z stereochemistry and, for supported substituted-diene halo-enal/halo-enone motifs, also assigns the new diene-terminal stereocenter. Other highly substituted patterns fall back to constitution rather than inventing R/S labels.",
      "Full endo/exo facial ranking for every unsymmetrical substituted diene remains a separate selectivity problem.",
    ],
    priority: 700,
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
    priority: 702,
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
