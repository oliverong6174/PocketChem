import type { ReactionRule } from "../reactionTypes";

const nitrileTrigger = {
  anyFunctionalGroups: ["Nitrile"],
};

export const nitrileReactionRules: ReactionRule[] = [
  {
    id: "nitrile-acidic-hydrolysis",
    family: "nitriles",
    title: "Acidic Nitrile Hydrolysis",
    reagents: "H₃O⁺, heat",
    reagentNote: "Hydrolysis through an amide intermediate",
    productHint: "Carboxylic acid",
    explanation:
      "A nitrile hydrolyzes through an amide intermediate and ultimately forms a carboxylic acid under strongly acidic aqueous conditions.",
    trigger: nitrileTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]#[N:2]>>[C:1](=O)O",
    },
    mechanism: "Nucleophilic addition and hydrolysis",
    priority: 1700,
  },
  {
    id: "nitrile-basic-hydrolysis",
    family: "nitriles",
    title: "Basic Nitrile Hydrolysis",
    reagents: "NaOH, H₂O, heat",
    reagentNote: "Hydrolysis to a carboxylate",
    productHint: "Carboxylate salt",
    explanation:
      "Strong base hydrolyzes a nitrile through an amide intermediate to a carboxylate. Acidic workup gives the carboxylic acid.",
    trigger: nitrileTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]#[N:2]>>[C:1](=O)[O-]",
    },
    mechanism: "Nucleophilic addition and hydrolysis",
    priority: 1710,
  },
  {
    id: "nitrile-lah-reduction",
    family: "nitriles",
    title: "Nitrile Reduction to a Primary Amine",
    reagents: "1) LiAlH₄  2) H₂O",
    reagentNote: "Strong hydride reduction",
    productHint: "Primary amine",
    explanation:
      "LiAlH₄ reduces the nitrile carbon to a methylene while retaining nitrogen, producing a primary amine.",
    trigger: nitrileTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]#[N:2]>>[CH2:1][NH2:2]",
    },
    mechanism: "Hydride addition and reduction",
    priority: 1720,
  },
  {
    id: "nitrile-dibal-aldehyde",
    family: "nitriles",
    title: "Partial Reduction of a Nitrile",
    reagents: "1) DIBAL-H, −78 °C  2) H₃O⁺",
    reagentNote: "Controlled partial reduction",
    productHint: "Aldehyde",
    explanation:
      "A controlled amount of DIBAL-H reduces a nitrile to an imine-aluminum intermediate that hydrolyzes to an aldehyde.",
    trigger: nitrileTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]#[N:2]>>[CH:1]=O",
    },
    mechanism: "Partial hydride reduction",
    priority: 1730,
  },
  {
    id: "nitrile-grignard-ketone",
    family: "nitriles",
    title: "Grignard Addition to a Nitrile",
    reagents: "1) RMgX  2) H₃O⁺",
    reagentNote: "Addition followed by imine hydrolysis",
    productHint: "Ketone",
    explanation:
      "A Grignard reagent adds once to a nitrile. Hydrolysis of the resulting imine gives a ketone.",
    trigger: nitrileTrigger,
    transform: {
      type: "conceptOnly",
      reason:
        "The Grignard carbon group must be specified before an exact ketone can be generated.",
    },
    mechanism: "Nucleophilic addition",
    priority: 1740,
  },
];
