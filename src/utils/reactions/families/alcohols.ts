import type { ReactionRule } from "../reactionTypes";

const alcoholTrigger = {
  functionalGroups: [
    "Alcohol",
    "Primary alcohol",
    "Secondary alcohol",
    "Tertiary alcohol",
  ],
};

export const alcoholReactionRules: ReactionRule[] = [
  {
    id: "alcohol-dehydration-alkene",
    family: "alcohols",
    title: "Alcohol Dehydration to Alkene",
    reagents: "conc. H₂SO₄, heat",
    reagentNote: "E1 elimination; high temperature",
    productHint: "Alkene",
    explanation:
      "Alcohols can dehydrate under concentrated sulfuric acid and heat to form alkenes.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][C:2][OH:3]>>[C:1]=[C:2]",
    },
    priority: 500,
  },
  {
    id: "alcohol-dehydration-ether",
    family: "alcohols",
    title: "Alcohol Dehydration to Ether",
    reagents: "conc. H₂SO₄, 130–140 °C",
    reagentNote: "Intermolecular dehydration",
    productHint: "Ether",
    explanation:
      "At lower temperature, primary alcohols can undergo intermolecular dehydration to form symmetrical ethers.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O:2]C",
    },
    priority: 510,
  },
  {
    id: "alcohol-hbr-substitution",
    family: "alcohols",
    title: "Alcohol Reaction with HBr",
    reagents: "HBr",
    reagentNote: "SN1 or SN2 depending on alcohol class",
    productHint: "Alkyl bromide",
    explanation:
      "Alcohols react with HBr after protonation of OH to form alkyl bromides.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][Br]",
    },
    priority: 520,
  },
  {
    id: "alcohol-lucas-reagent",
    family: "alcohols",
    title: "Lucas Reagent",
    reagents: "ZnCl₂, HCl",
    reagentNote: "Fast for tertiary, slower for secondary alcohols",
    productHint: "Alkyl chloride",
    explanation:
      "Lucas reagent converts secondary and tertiary alcohols into alkyl chlorides.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][Cl]",
    },
    priority: 530,
  },
  {
    id: "alcohol-pbr3",
    family: "alcohols",
    title: "Alcohol to Alkyl Bromide",
    reagents: "PBr₃",
    reagentNote: "Best for primary and secondary alcohols",
    productHint: "Alkyl bromide",
    explanation:
      "PBr₃ converts alcohols into alkyl bromides without strongly acidic conditions.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][Br]",
    },
    priority: 540,
  },
  {
    id: "alcohol-socl2",
    family: "alcohols",
    title: "Alcohol to Alkyl Chloride",
    reagents: "SOCl₂",
    reagentNote: "Substitution",
    productHint: "Alkyl chloride",
    explanation:
      "Thionyl chloride converts alcohols into alkyl chlorides.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][Cl]",
    },
    priority: 550,
  },
  {
    id: "primary-alcohol-mild-oxidation",
    family: "alcohols",
    title: "Primary Alcohol Mild Oxidation",
    reagents: "PCC, DMP, or Swern oxidation",
    reagentNote: "Stops at aldehyde",
    productHint: "Aldehyde",
    explanation:
      "Mild oxidants convert primary alcohols into aldehydes.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][CH2:2][OH:3]>>[C:1][C:2]=[O:3]",
    },
    priority: 560,
  },
  {
    id: "primary-alcohol-strong-oxidation",
    family: "alcohols",
    title: "Primary Alcohol Strong Oxidation",
    reagents: "KMnO₄/HNO₃, H₂CrO₄, or Na₂Cr₂O₇/H₂SO₄",
    reagentNote: "Oxidizes to carboxylic acid",
    productHint: "Carboxylic acid",
    explanation:
      "Strong oxidants convert primary alcohols into carboxylic acids.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][CH2:2][OH:3]>>[C:1][C:2](=O)O",
    },
    priority: 570,
  },
  {
    id: "secondary-alcohol-oxidation",
    family: "alcohols",
    title: "Secondary Alcohol Oxidation",
    reagents: "PCC, DMP, H₂CrO₄, Na₂Cr₂O₇/H₂SO₄, or NaOCl/H₂O",
    reagentNote: "Oxidation to ketone",
    productHint: "Ketone",
    explanation:
      "Secondary alcohols oxidize to ketones.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][CH:2]([OH:3])[C:4]>>[C:1][C:2](=[O:3])[C:4]",
    },
    priority: 580,
  },
  {
    id: "benzylic-allylic-alcohol-oxidation",
    family: "alcohols",
    title: "Benzylic or Allylic Alcohol Oxidation",
    reagents: "MnO₂",
    reagentNote: "Selective allylic/benzylic oxidation",
    productHint: "Carbonyl compound",
    explanation:
      "MnO₂ selectively oxidizes allylic and benzylic alcohols into carbonyl compounds.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][CH:2]([OH:3])>>[C:1][C:2]=[O:3]",
    },
    priority: 590,
  },
  {
    id: "fischer-esterification",
    family: "alcohols",
    title: "Fischer Esterification",
    reagents: "Carboxylic acid, H₂SO₄",
    reagentNote: "Alcohol + carboxylic acid",
    productHint: "Ester",
    explanation:
      "Alcohols react with carboxylic acids under acidic conditions to form esters.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O:2]C(=O)C",
    },
    priority: 600,
  },
  {
    id: "alcohol-acid-chloride-esterification",
    family: "alcohols",
    title: "Ester Formation with Acid Chloride",
    reagents: "Acid chloride",
    reagentNote: "Alcohol + acid chloride",
    productHint: "Ester",
    explanation:
      "Alcohols react with acid chlorides to form esters and HCl.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O:2]C(=O)C",
    },
    priority: 610,
  },
  {
    id: "alcohol-nitrate-ester",
    family: "alcohols",
    title: "Nitrate Ester Formation",
    reagents: "HNO₃",
    reagentNote: "Alcohol to nitrate ester",
    productHint: "Nitrate ester",
    explanation:
      "Alcohols can react with nitric acid to form nitrate esters.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O:2]N(=O)=O",
    },
    priority: 620,
  },
  {
    id: "alcohol-phosphate-ester",
    family: "alcohols",
    title: "Phosphate Ester Formation",
    reagents: "H₃PO₄",
    reagentNote: "Alcohol to phosphate ester",
    productHint: "Phosphate ester",
    explanation:
      "Alcohols can react with phosphoric acid to form phosphate esters.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O:2]P(=O)(O)O",
    },
    priority: 630,
  },
  {
    id: "alcohol-tosylation",
    family: "alcohols",
    title: "Tosylate Ester Formation",
    reagents: "TsCl, pyridine",
    reagentNote: "Converts OH into a better leaving group",
    productHint: "Tosylate",
    explanation:
      "Tosyl chloride converts an alcohol into a tosylate, making the leaving group better for substitution or elimination.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1][OH:2]>>[C:1][O:2]S(=O)(=O)c1ccc(C)cc1",
    },
    priority: 640,
  },
  {
    id: "pinacol-rearrangement",
    family: "alcohols",
    title: "Pinacol Rearrangement",
    reagents: "H₂SO₄, heat",
    reagentNote: "Vicinal diol rearrangement",
    productHint: "Ketone",
    explanation:
      "Vicinal diols can rearrange under acidic conditions to form ketones.",
    trigger: alcoholTrigger,
    transform: {
      type: "rdkitReactionSmarts",
      smarts: "[C:1]([OH:2])[C:3]([OH:4])>>[C:1](=O)[C:3]",
    },
    priority: 650,
  },
];