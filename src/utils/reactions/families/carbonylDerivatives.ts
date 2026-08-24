import type { ReactionRule } from "../reactionTypes";

const carbonylTrigger = {
  anyFunctionalGroups: [
    "Aldehyde",
    "Benzaldehyde",
    "Cinnamaldehyde",
    "Crotonaldehyde",
    "Acrolein",
    "Enal",
    "Ketone",
    "Enone",
    "Chalcone",
  ],
};

export const carbonylDerivativeReactionRules: ReactionRule[] = [
  {
    id: "carbonyl-reductive-amination",
    family: "carbonyl-derivatives",
    title: "Reductive Amination",
    reagents: "1) NH₃, RNH₂, or R₂NH  2) NaBH₃CN or NaBH(OAc)₃",
    reagentNote: "C=N formation followed by selective reduction",
    productHint: "Amine",
    explanation:
      "An aldehyde or ketone condenses with an amine to form an imine or iminium ion, which is reduced to an amine without normally reducing the starting carbonyl directly.",
    trigger: carbonylTrigger,
    transform: {
      type: "conceptOnly",
      reason: "The ammonia or amine reactant must be specified before the exact carbon–nitrogen product can be generated.",
    },
    mechanism: "Condensation followed by hydride reduction",
    priority: 1260,
  },
  {
    id: "acetal-acid-hydrolysis",
    family: "carbonyl-derivatives",
    title: "Acetal or Ketal Hydrolysis",
    reagents: "aqueous H₃O⁺",
    reagentNote: "Carbonyl deprotection",
    productHint: "Aldehyde or ketone and alcohol(s)",
    explanation:
      "Acetals and ketals are stable to base but hydrolyze in aqueous acid to regenerate the parent carbonyl compound.",
    trigger: {
      anyFunctionalGroups: ["Acetal"],
      includeSmarts: ["[CX4]([OX2][#6])([OX2][#6])"],
    },
    transform: {
      type: "conceptOnly",
      reason: "The two alkoxy groups may belong to one cyclic diol or two separate alcohol fragments, so generic exact fragment reconstruction needs a multi-fragment atom-mapping model.",
    },
    mechanism: "Acid-catalyzed hydrolysis",
    priority: 1270,
  },
  {
    id: "hemiacetal-equilibration",
    family: "carbonyl-derivatives",
    title: "Hemiacetal Hydrolysis",
    reagents: "H₂O, catalytic acid",
    reagentNote: "Reversible carbonyl addition",
    productHint: "Carbonyl compound and alcohol",
    explanation:
      "A hemiacetal can collapse back to its carbonyl compound and alcohol under aqueous acidic conditions.",
    trigger: {
      anyFunctionalGroups: ["Hemiacetal"],
      includeSmarts: ["[CX4]([OX2H])([OX2][#6])"],
    },
    transform: {
      type: "conceptOnly",
      reason: "Cyclic hemiacetals require ring-aware fragment reconstruction when the C–O bond is cleaved.",
    },
    mechanism: "Acid-catalyzed hydrolysis",
    priority: 1280,
  },
  {
    id: "imine-hydrolysis",
    family: "carbonyl-derivatives",
    title: "Imine Hydrolysis",
    reagents: "H₃O⁺, H₂O",
    reagentNote: "Reverse of imine formation",
    productHint: "Carbonyl compound and amine",
    explanation:
      "Aqueous acid hydrolyzes an imine back to the aldehyde or ketone and the corresponding amine.",
    trigger: {
      anyFunctionalGroups: ["Imine"],
      includeSmarts: ["[CX3]=[NX2]"],
      excludedFunctionalGroups: ["Hydrazone", "Aldoxime", "Ketoxime", "Aminoxime"],
    },
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[N:2]>>[C:1]=O.[N:2]",
    },
    mechanism: "Acid-catalyzed addition–elimination",
    priority: 1285,
  },
  {
    id: "imine-reduction",
    family: "carbonyl-derivatives",
    title: "Imine Reduction",
    reagents: "NaBH₄, NaBH₃CN, LiAlH₄, or H₂/catalyst",
    reagentNote: "Reduces C=N to C–N",
    productHint: "Amine",
    explanation:
      "Hydride or catalytic hydrogenation reduces an imine carbon–nitrogen double bond to an amine.",
    trigger: {
      anyFunctionalGroups: ["Imine"],
      includeSmarts: ["[CX3]=[NX2]"],
      excludedFunctionalGroups: ["Hydrazone", "Aldoxime", "Ketoxime", "Aminoxime"],
    },
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[N:2]>>[C:1][N:2]",
    },
    mechanism: "Hydride addition or catalytic hydrogenation",
    priority: 1290,
  },
  {
    id: "hydrazone-hydrolysis",
    family: "carbonyl-derivatives",
    title: "Hydrazone Hydrolysis",
    reagents: "H₃O⁺, H₂O",
    reagentNote: "Regenerates the carbonyl",
    productHint: "Carbonyl compound and hydrazine derivative",
    explanation:
      "Aqueous acid reverses hydrazone formation and regenerates the parent aldehyde or ketone.",
    trigger: {
      anyFunctionalGroups: ["Hydrazone"],
      includeSmarts: ["[CX3]=[NX2][NX3]"],
    },
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[N:2][N:3]>>[C:1]=O.[N:2][N:3]",
    },
    mechanism: "Acid-catalyzed hydrolysis",
    priority: 1295,
  },
  {
    id: "oxime-hydrolysis",
    family: "carbonyl-derivatives",
    title: "Oxime Hydrolysis",
    reagents: "H₃O⁺, H₂O",
    reagentNote: "Regenerates the carbonyl",
    productHint: "Carbonyl compound and hydroxylamine",
    explanation:
      "Aqueous acid hydrolyzes an oxime to regenerate its aldehyde or ketone.",
    trigger: {
      anyFunctionalGroups: ["Aldoxime", "Ketoxime", "Aminoxime"],
      includeSmarts: ["[CX3]=[NX2][OX2H]"],
    },
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]=[N:2][O:3]>>[C:1]=O.[N:2][O:3]",
    },
    mechanism: "Acid-catalyzed hydrolysis",
    priority: 1300,
  },
  {
    id: "enamine-hydrolysis",
    family: "carbonyl-derivatives",
    title: "Enamine Hydrolysis",
    reagents: "H₃O⁺, H₂O",
    reagentNote: "Regenerates the carbonyl",
    productHint: "Carbonyl compound and secondary amine",
    explanation:
      "Aqueous acid hydrolyzes an enamine through an iminium ion to regenerate the parent carbonyl compound and secondary amine.",
    trigger: {
      anyFunctionalGroups: ["Enamine"],
      includeSmarts: ["[NX3][CX3]=[CX3]"],
    },
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[N:1][C:2]=[C:3]>>[N:1].[C:2](=O)[C:3]",
    },
    mechanism: "Acid-catalyzed hydrolysis",
    productStatus: "representative",
    limitations: ["For unsymmetrical enamines, the engine does not evaluate alternative tautomeric or regiochemical assignments."],
    priority: 1305,
  },
];
