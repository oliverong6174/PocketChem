import type { FunctionalGroupResult } from "./analyzeSmiles";

export type ReactionPathway = {
  id: string;
  title: string;
  reactantSmiles: string;
  reagentLabel: string;
  reagentNote: string;
  productSmiles: string | null;
  productLabel: string;
  shortExplanation: string;
};

type TransformType =
  | "alkene-hydrogenation"
  | "carboxylic-acid-reduction"
  | "carbonyl-reduction"
  | "ester-hydrolysis"
  | "amide-hydrolysis"
  | "no-transform";

type ReactionRule = {
  id: string;
  groupNames: string[];
  title: string;
  reagentLabel: string;
  reagentNote: string;
  productLabel: string;
  shortExplanation: string;
  transformType: TransformType;
};

const REACTION_RULES: ReactionRule[] = [
  {
    id: "alkene-hydrogenation",
    groupNames: ["Alkene"],
    title: "Alkene Hydrogenation",
    reagentLabel: "H₂, Pd/C",
    reagentNote: "Adds H₂ across C=C",
    productLabel: "Alkane",
    shortExplanation: "The alkene is reduced to an alkane while the rest of the molecule stays unchanged.",
    transformType: "alkene-hydrogenation",
  },
  {
    id: "carboxylic-acid-reduction",
    groupNames: ["Carboxylic acid", "Benzoic acid derivative"],
    title: "Carboxylic Acid Reduction",
    reagentLabel: "LiAlH₄",
    reagentNote: "Strong reducing agent",
    productLabel: "Primary alcohol",
    shortExplanation: "LiAlH₄ reduces the carboxylic acid group to a primary alcohol.",
    transformType: "carboxylic-acid-reduction",
  },
  {
    id: "carbonyl-reduction",
    groupNames: ["Aldehyde", "Ketone", "Aryl ketone", "Benzaldehyde derivative"],
    title: "Carbonyl Reduction",
    reagentLabel: "NaBH₄",
    reagentNote: "Hydride donor",
    productLabel: "Alcohol",
    shortExplanation: "The aldehyde or ketone carbonyl is reduced to an alcohol.",
    transformType: "carbonyl-reduction",
  },
  {
    id: "ester-hydrolysis",
    groupNames: ["Ester"],
    title: "Ester Hydrolysis",
    reagentLabel: "H₃O⁺, heat",
    reagentNote: "Acidic hydrolysis",
    productLabel: "Carboxylic acid",
    shortExplanation: "The ester is hydrolyzed to a carboxylic acid derivative on the acyl side.",
    transformType: "ester-hydrolysis",
  },
  {
    id: "amide-hydrolysis",
    groupNames: ["Amide"],
    title: "Amide Hydrolysis",
    reagentLabel: "H₃O⁺, heat",
    reagentNote: "Strong conditions",
    productLabel: "Carboxylic acid",
    shortExplanation: "The amide is hydrolyzed to a carboxylic acid derivative on the acyl side.",
    transformType: "amide-hydrolysis",
  },
];

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function replaceFirst(smiles: string, patterns: Array<[RegExp, string]>): string | null {
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(smiles)) {
      return smiles.replace(pattern, replacement);
    }
  }

  return null;
}

function hydrogenateAlkene(smiles: string): string | null {
  return replaceFirst(smiles, [
    [/C=C/, "CC"],
    [/C=([A-Z])/, "C$1"],
  ]);
}

function reduceCarboxylicAcid(smiles: string): string | null {
  return replaceFirst(smiles, [
    [/C\(=O\)O/, "CO"],
    [/C\(=O\)\[OH\]/, "CO"],
    [/C\(=O\)O\[H\]/, "CO"],
  ]);
}

function reduceCarbonyl(smiles: string): string | null {
  return replaceFirst(smiles, [
    [/C\(=O\)/, "C(O)"],
    [/C=O/, "CO"],
  ]);
}

function hydrolyzeEster(smiles: string): string | null {
  return replaceFirst(smiles, [
    [/C\(=O\)O[A-Za-z0-9@+\-\[\]\(\)=#$\\/]+/, "C(=O)O"],
  ]);
}

function hydrolyzeAmide(smiles: string): string | null {
  return replaceFirst(smiles, [
    [/C\(=O\)N[A-Za-z0-9@+\-\[\]\(\)=#$\\/]*?/, "C(=O)O"],
  ]);
}

function applyTransform(type: TransformType, smiles: string): string | null {
  switch (type) {
    case "alkene-hydrogenation":
      return hydrogenateAlkene(smiles);

    case "carboxylic-acid-reduction":
      return reduceCarboxylicAcid(smiles);

    case "carbonyl-reduction":
      return reduceCarbonyl(smiles);

    case "ester-hydrolysis":
      return hydrolyzeEster(smiles);

    case "amide-hydrolysis":
      return hydrolyzeAmide(smiles);

    case "no-transform":
      return null;

    default:
      return null;
  }
}

export function predictReactionPathways(
  reactantSmiles: string,
  functionalGroups: FunctionalGroupResult[]
): ReactionPathway[] {
  const detectedNames = new Set(
    functionalGroups.map((group) => normalizeName(group.name))
  );

  return REACTION_RULES.filter((rule) =>
    rule.groupNames.some((name) => detectedNames.has(normalizeName(name)))
  )
    .map((rule) => {
      const productSmiles = applyTransform(rule.transformType, reactantSmiles);

      return {
        id: rule.id,
        title: rule.title,
        reactantSmiles,
        reagentLabel: rule.reagentLabel,
        reagentNote: rule.reagentNote,
        productSmiles,
        productLabel: productSmiles ? rule.productLabel : "Product not generated yet",
        shortExplanation: productSmiles
          ? rule.shortExplanation
          : "This reaction was detected, but the dynamic product transform is not implemented for this molecule yet.",
      };
    })
    .filter((pathway) => pathway.productSmiles !== null);
}