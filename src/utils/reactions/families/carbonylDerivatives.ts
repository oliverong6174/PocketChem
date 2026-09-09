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
    reactionType: "reduction",
    title: "Reductive Amination",
    reagents: "1) NH₃, RNH₂, or R₂NH  2) NaBH₃CN, NaBH(OAc)₃, H₂/Ni, or LiAlH₄ after C=N formation",
    reagentNote: "Imine/iminium formation followed by reduction",
    productHint: "Amine",
    explanation:
      "An aldehyde or ketone condenses with an amine to form an imine or iminium ion, which is reduced to an amine without normally reducing the starting carbonyl directly.",
    trigger: carbonylTrigger,
    additionalReactants: [
      {
        label: "ammonia, primary amine, or secondary amine",
        trigger: { includeSmarts: ["[N;H1,H2,H3;!$(N[C,S,P]=O)]"] },
      },
    ],
    transform: {
      type: "reactionSmarts",
      smarts: "[C:1]=[O:2].[N;H1,H2,H3:3]>>[C:1]-[N:3]",
      maxProducts: 8,
    },
    mechanism: "Condensation followed by reduction of the imine/iminium intermediate",
    limitations: [
      "NaBH₃CN and NaBH(OAc)₃ are preferred for one-pot chemoselective reductive amination. LiAlH₄ is represented as the stepwise variant after the imine/iminium intermediate has been formed, because LiAlH₄ would also reduce an unreacted carbonyl.",
    ],
    searchAliases: ["reductive amination", "secondary amine then LAH", "imine LiAlH4", "iminium reduction"],
    priority: 1260,
  },
  {
    id: "acetal-acid-hydrolysis",
    family: "carbonyl-derivatives",
    reactionType: "cleavage",
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
      type: "reactionSmarts",
      smarts: "[C;X4:1]([O;X2:2][#6:3])([O;X2:4][#6:5])>>[C:1]=O",
      maxProducts: 8,
    },
    productStatus: "computed",
    mechanism: "Acid-catalyzed hydrolysis",
    selectivity: ["PocketChem displays the regenerated aldehyde/ketone as the principal organic product; the alcohol/diol coproduct is implied by hydrolysis rather than duplicated on the product card."],
    priority: 1270,
  },
  {
    id: "hemiacetal-equilibration",
    family: "carbonyl-derivatives",
    reactionType: "cleavage",
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
      type: "reactionSmarts",
      smarts: "[C;X4:1]([O;H1:2])([O;X2:3][#6:4])>>[C:1]=O",
      maxProducts: 8,
    },
    productStatus: "computed",
    mechanism: "Acid-catalyzed hydrolysis",
    selectivity: ["The carbonyl compound is shown as the principal organic product; the corresponding alcohol coproduct is implied."],
    priority: 1280,
  },
  {
    id: "imine-hydrolysis",
    family: "carbonyl-derivatives",
    reactionType: "cleavage",
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
      type: "reactionSmarts",
      smarts: "[C:1]=[N:2]>>[C:1]=O.[N:2]",
    },
    mechanism: "Acid-catalyzed addition–elimination",
    priority: 1285,
  },
  {
    id: "imine-reduction",
    family: "carbonyl-derivatives",
    reactionType: "reduction",
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
      type: "reactionSmarts",
      smarts: "[C:1]=[N:2]>>[C:1][N:2]",
    },
    mechanism: "Hydride addition or catalytic hydrogenation",
    priority: 1290,
  },
  {
    id: "hydrazone-hydrolysis",
    family: "carbonyl-derivatives",
    reactionType: "cleavage",
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
      type: "reactionSmarts",
      smarts: "[C:1]=[N:2][N:3]>>[C:1]=O.[N:2][N:3]",
    },
    mechanism: "Acid-catalyzed hydrolysis",
    priority: 1295,
  },
  {
    id: "oxime-hydrolysis",
    family: "carbonyl-derivatives",
    reactionType: "cleavage",
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
      type: "reactionSmarts",
      smarts: "[C:1]=[N:2][O:3]>>[C:1]=O.[N:2][O:3]",
    },
    mechanism: "Acid-catalyzed hydrolysis",
    priority: 1300,
  },
  {
    id: "enamine-hydrolysis",
    family: "carbonyl-derivatives",
    reactionType: "cleavage",
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
      type: "reactionSmarts",
      smarts: "[N:1][C:2]=[C:3]>>[N:1].[C:2](=O)[C:3]",
    },
    mechanism: "Acid-catalyzed hydrolysis",
    productStatus: "representative",
    limitations: ["For unsymmetrical enamines, the engine does not evaluate alternative tautomeric or regiochemical assignments."],
    priority: 1305,
  },
];
