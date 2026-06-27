import type { ReactionRule } from "../reactionTypes";

const carboxylicAcidTrigger = {
  functionalGroups: [
    "Carboxylic acid",
    "Benzoic acid derivative",
  ],
};

export const carboxylicAcidReactionRules: ReactionRule[] = [
  {
    id: "carboxylic-acid-lah-reduction",
    family: "carboxylic-acids",
    title: "Carboxylic Acid Reduction",
    reagents: "1) LiAlH₄  2) H₃O⁺",
    reagentNote: "Strong hydride reduction",
    productHint: "Primary alcohol",
    explanation:
      "LiAlH₄ reduces carboxylic acids to primary alcohols. NaBH₄ is usually not strong enough.",
    trigger: carboxylicAcidTrigger,
    transform: {
      type: "engineHandler",
      handler: "addition",
      options: {
        mode: "oneTwoAddition",
        nucleophile: "hydride",
      },
    },
    priority: 1300,
  },
  {
    id: "carboxylic-acid-fischer-esterification",
    family: "carboxylic-acids",
    title: "Fischer Esterification",
    reagents: "ROH, H₂SO₄",
    reagentNote: "Acid-catalyzed ester formation",
    productHint: "Ester",
    explanation:
      "Carboxylic acids react with alcohols under acidic conditions to form esters.",
    trigger: carboxylicAcidTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[OH:3]>>[C:1](=[O:2])OC",
    },
    priority: 1310,
  },
  {
    id: "carboxylic-acid-to-acid-chloride",
    family: "carboxylic-acids",
    title: "Acid Chloride Formation",
    reagents: "SOCl₂ or oxalyl chloride",
    reagentNote: "Converts OH into Cl",
    productHint: "Acid chloride",
    explanation:
      "Carboxylic acids react with thionyl chloride or oxalyl chloride to form acid chlorides.",
    trigger: carboxylicAcidTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[OH:3]>>[C:1](=[O:2])Cl",
    },
    priority: 1320,
  },
  {
    id: "carboxylic-acid-amide-formation",
    family: "carboxylic-acids",
    title: "Amide Formation",
    reagents: "1) SOCl₂  2) NH₃ or RNH₂",
    reagentNote: "Usually through acid chloride",
    productHint: "Amide",
    explanation:
      "Carboxylic acids are commonly converted to amides by first forming an acid chloride, then reacting with ammonia or an amine.",
    trigger: carboxylicAcidTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1](=[O:2])[OH:3]>>[C:1](=[O:2])N",
    },
    priority: 1330,
  },
  {
    id: "carboxylic-acid-decarboxylation",
    family: "carboxylic-acids",
    title: "Decarboxylation",
    reagents: "heat",
    reagentNote: "Loss of CO₂ when structurally activated",
    productHint: "Decarboxylated product",
    explanation:
      "Some carboxylic acids, especially beta-keto acids and malonic acid derivatives, lose CO₂ upon heating.",
    trigger: carboxylicAcidTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][C:2](=[O:3])[OH:4]>>[C:1]",
    },
    priority: 1340,
  },
  {
    id: "carboxylic-acid-alpha-halogenation-hvz",
    family: "carboxylic-acids",
    title: "Hell-Volhard-Zelinsky Reaction",
    reagents: "Br₂, PBr₃",
    reagentNote: "Alpha bromination",
    productHint: "Alpha-bromo carboxylic acid",
    explanation:
      "Carboxylic acids with alpha hydrogens can undergo alpha bromination through the Hell-Volhard-Zelinsky reaction.",
    trigger: carboxylicAcidTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[CH2:1][C:2](=[O:3])[OH:4]>>[CH:1]([Br])[C:2](=[O:3])[OH:4]",
    },
    priority: 1350,
  },
];