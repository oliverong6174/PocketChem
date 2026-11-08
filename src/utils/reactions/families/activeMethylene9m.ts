import type { ReactionRule } from "../reactionTypes";

/**
 * Stage 9M: executable acetoacetic ester and malonic ester syntheses. The older registry entry
 * "malonic-acetoacetic-synthesis" is concept-only (it cannot name the alkyl halide); these rules
 * are ordinary reaction-SMARTS rules with the alkyl halide as an explicit structural partner.
 * Literature support: scripts/benchmarks/stage9m/REFERENCES.md (recalled, not re-read in this stage).
 */

const alkylHalidePartner = {
  label: "alkyl halide (methyl or primary, including allylic/benzylic)",
  trigger: { includeSmarts: ["[CX4;H2,H3;!$(C(F)(F))][Cl,Br,I]"] },
  role: "electrophile" as const,
};

const alkylationCommon = {
  conditions: { base: "mild" as const, anhydrous: true, reactionCentre: ["ester", "ketone"] },
  family: "enolates" as const,
  reactionType: "substitution" as const,
  reactionClass: "enolate C-alkylation",
  reagentAtomSources: [] as string[],
  additionalReactants: [alkylHalidePartner],
  mechanism: "Doubly stabilized enolate formation (pKa about 11-13), then SN2 C-alkylation",
  productStatus: "computed" as const,
  limitations: [
    "Only methyl/primary (including allylic and benzylic) halides are SN2-competent here; secondary and tertiary halides mainly eliminate and are excluded.",
    "Dialkylation (a second alkylation with excess base and halide) and O-alkylation are known side pathways and are not generated.",
    "A new stereocentre created at the active carbon is not assigned: the product epimerizes through its enol/enolate.",
    "Use an alkoxide matching the ester alkyl group to avoid transesterification; this is not enforced.",
  ],
  selectivityProfile: { stereochemistry: { mode: "none" as const }, mixture: "possible" as const },
  planningCost: 45,
};

export const activeMethyleneRules: ReactionRule[] = [
  {
    ...alkylationCommon,
    id: "acetoacetic-ester-alkylation",
    title: "Acetoacetic Ester Alkylation",
    reagents: "1) NaOR (matching alkoxide), ROH  2) alkyl halide",
    reagentNote: "Draw the beta-keto ester and the alkyl halide as separate structures",
    productHint: "alpha-Alkyl beta-keto ester",
    explanation:
      "The CH2 or CH between a ketone and an ester is acidic enough to be deprotonated by alkoxide; the stabilized enolate then displaces a primary alkyl halide at carbon.",
    trigger: { includeSmarts: ["[#6][CX3](=O)[CX4;H1,H2][CX3](=O)O[#6]"] },
    transform: {
      type: "reactionSmarts",
      smarts:
        "[#6:9][CX3:1](=[O:2])[CX4;H1,H2:3][CX3:4](=[O:5])[O:6][#6:7].[CX4;H2,H3:8][Cl,Br,I]>>[#6:9][C:1](=[O:2])[C:3]([C:8])[C:4](=[O:5])[O:6][#6:7]",
      maxProducts: 6,
    },
    retrosynthesis: { tier: "preferred", group: "active-methylene-alkylation" },
    priority: 1891,
  },
  {
    ...alkylationCommon,
    id: "malonic-ester-alkylation",
    title: "Malonic Ester Alkylation",
    reagents: "1) NaOR (matching alkoxide), ROH  2) alkyl halide",
    reagentNote: "Draw the malonate diester and the alkyl halide as separate structures",
    productHint: "alpha-Alkyl malonate diester",
    explanation:
      "The CH2 or CH flanked by two esters is deprotonated by alkoxide, and the malonate enolate displaces a primary alkyl halide at carbon.",
    trigger: { includeSmarts: ["[#6]O[CX3](=O)[CX4;H1,H2][CX3](=O)O[#6]"] },
    transform: {
      type: "reactionSmarts",
      smarts:
        "[#6:9][O:10][CX3:1](=[O:2])[CX4;H1,H2:3][CX3:4](=[O:5])[O:6][#6:7].[CX4;H2,H3:8][Cl,Br,I]>>[#6:9][O:10][C:1](=[O:2])[C:3]([C:8])[C:4](=[O:5])[O:6][#6:7]",
      maxProducts: 6,
    },
    retrosynthesis: { tier: "preferred", group: "active-methylene-alkylation" },
    priority: 1892,
  },
  {
    id: "beta-keto-ester-hydrolysis-decarboxylation",
    conditions: { acid: "strong", reactionCentre: ["ester", "ketone"] },
    family: "enolates",
    reactionType: "cleavage",
    reactionClass: "hydrolysis and decarboxylation",
    title: "Beta-Keto Ester Hydrolysis and Decarboxylation",
    reagents: "H3O+ (or NaOH, then H3O+), heat",
    reagentAtomSources: ["O", "H"],
    reagentNote: "Completes the acetoacetic ester synthesis",
    productHint: "Ketone (the ester carbon is lost as CO2, the alcohol part as ROH)",
    explanation:
      "The ester is hydrolyzed to the beta-keto acid, which loses CO2 on heating through a cyclic six-membered transition state to give an enol and then the ketone.",
    trigger: { includeSmarts: ["[#6][CX3](=O)[CX4][CX3](=O)O[#6]"] },
    transform: {
      type: "reactionSmarts",
      smarts: "[#6:9][CX3:1](=[O:2])[CX4:3][CX3:4](=O)O[#6]>>[#6:9][C:1](=[O:2])[C:3]",
      maxProducts: 6,
    },
    mechanism: "Ester hydrolysis, then cyclic decarboxylation of the beta-keto acid",
    selectivityProfile: { stereochemistry: { mode: "none" }, mixture: "possible" },
    selectivity: ["Only the ester carbon is lost; a stereocentre at the active carbon is destroyed through the enol and is not carried through."],
    limitations: [
      "Other esters or acid-sensitive groups in the molecule are not protected or ranked; each beta-keto ester unit is matched separately.",
      "Ring-opening (retro-Claisen) cleavage under strongly basic hydrolysis is a competing pathway that is not modeled.",
    ],
    productStatus: "computed",
    planningCost: 44,
    retrosynthesis: { tier: "preferred", group: "acetoacetic-ester-synthesis" },
    priority: 1893,
  },
  {
    id: "malonic-ester-hydrolysis-decarboxylation",
    conditions: { acid: "strong", reactionCentre: ["ester", "carboxylic-acid"] },
    family: "enolates",
    reactionType: "cleavage",
    reactionClass: "hydrolysis and decarboxylation",
    title: "Malonic Ester Hydrolysis and Decarboxylation",
    reagents: "H3O+ (or NaOH, then H3O+), heat",
    reagentAtomSources: ["O", "H"],
    reagentNote: "Completes the malonic ester synthesis",
    productHint: "Carboxylic acid carrying the groups introduced at the central carbon",
    explanation:
      "Both esters are hydrolyzed to the malonic acid, one carboxyl is lost as CO2 on heating, and the remaining carboxylic acid carries the alkyl groups introduced at the central carbon.",
    trigger: { includeSmarts: ["[#6]O[CX3](=O)[CX4][CX3](=O)O[#6]"] },
    transform: {
      type: "reactionSmarts",
      smarts: "[#6:8][O:9][CX3:1](=[O:2])[CX4:3][CX3:4](=O)O[#6]>>[OH:9][C:1](=[O:2])[C:3]",
      maxProducts: 6,
    },
    mechanism: "Ester hydrolysis, then cyclic decarboxylation of the malonic half-acid",
    selectivityProfile: { stereochemistry: { mode: "none" }, mixture: "possible" },
    selectivity: ["A stereocentre at the central carbon is destroyed through the enol and is not carried through."],
    limitations: [
      "Either carboxyl can be the one lost; the two outcomes are the same compound for a symmetric malonate, and both are enumerated when the esters differ.",
      "Hindered or acid-sensitive substrates are not assessed.",
    ],
    productStatus: "computed",
    planningCost: 44,
    retrosynthesis: { tier: "preferred", group: "malonic-ester-synthesis" },
    priority: 1894,
  },
];
