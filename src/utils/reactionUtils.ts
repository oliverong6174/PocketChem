import { getRDKit } from "./analyzeSmiles";
import { analyzeFunctionalGroupHierarchy } from "./analyzeSmiles";
import { analyzeNomenclatureAndProperties } from "./nomenclatureUtils";
import type { FunctionalGroupResult } from "./analyzeSmiles";


export type ReactionPathway = {
  id: string;
  title: string;
  reactantSmiles: string;
  reactantLabel: string;
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

async function runReactionSmarts(
  reactantSmiles: string,
  reactionSmarts: string
): Promise<string | null> {
  const RDKit = await getRDKit();

  try {
    const reaction = RDKit.get_rxn(reactionSmarts);
    const reactant = RDKit.get_mol(reactantSmiles);

    const molList = new RDKit.MolList();
    molList.append(reactant);

    const products = reaction.run_reactants(molList);

    console.log("Products size:", products.size?.());

    console.log("Reaction products object:", products);
    console.log(
      "Reaction products methods:",
      Object.getOwnPropertyNames(Object.getPrototypeOf(products))
    );

    let productSmiles: string | null = null;
    let firstSet: any = null;
    let productMol: any = null;

    if (
      products &&
      typeof products.size === "function" &&
      products.size() > 0 &&
      typeof products.get === "function"
    ) {
      firstSet = products.get(0);

      if (
        firstSet &&
        typeof firstSet.size === "function" &&
        firstSet.size() > 0 &&
        typeof firstSet.at === "function"
      ) {
        productMol = firstSet.at(0);
        productSmiles = productMol?.get_smiles?.() ?? null;
      }
    }

    productMol?.delete?.();
    firstSet?.delete?.();
    products?.delete?.();
    molList.delete?.();
    reactant.delete?.();
    reaction.delete?.();

    console.log("Product SMILES:", productSmiles);

    return productSmiles || null;
  } catch (error) {
    console.error("Reaction SMARTS failed:", reactionSmarts, error);
    return null;
  }
}

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

async function applyTransform(
  type: TransformType,
  smiles: string
): Promise<string | null> {
  switch (type) {
    case "alkene-hydrogenation":
      return runReactionSmarts(
            
        smiles,
        "[C:1]=[C:2]>>[C:1][C:2]"
      );

    case "carbonyl-reduction":
      return runReactionSmarts(
        smiles,
        "[C:1]=[O:2]>>[C:1]-[O:2]"
      );

    case "carboxylic-acid-reduction":
      return runReactionSmarts(
        smiles,
        "[C:1](=[O:2])[O:3]>>[C:1][O:3]"
      );

    case "ester-hydrolysis":
      return runReactionSmarts(
        smiles,
        "[C:1](=[O:2])[O:3][C:4]>>[C:1](=[O:2])[O:3]"
      );

    case "amide-hydrolysis":
      return runReactionSmarts(
        smiles,
        "[C:1](=[O:2])[N:3]>>[C:1](=[O:2])O"
      );

    default:
      return null;
  }
}

export async function predictReactionPathways(
  reactantSmiles: string,
  functionalGroups: FunctionalGroupResult[]
): Promise<ReactionPathway[]> {

  const detectedNames = new Set(
    functionalGroups.map((group) => normalizeName(group.name))
  );

  const matchingRules = REACTION_RULES.filter((rule) =>
    rule.groupNames.some((name) => detectedNames.has(normalizeName(name)))
  );

  const pathways: ReactionPathway[] = [];

    console.log("Reactant SMILES:", reactantSmiles);
    console.log("Detected groups:", functionalGroups.map((g) => g.name));
    console.log("Matching rules:", matchingRules.map((r) => r.id));

  const reactantIdentity = await analyzeNomenclatureAndProperties(
  reactantSmiles,
  functionalGroups,
  functionalGroups[0] ?? null
);

  const reactantName =
  reactantIdentity.nomenclature.displayName ||
  reactantIdentity.nomenclature.estimatedName ||
  "Reactant";

  for (const rule of matchingRules) {
    const productSmiles = await applyTransform(rule.transformType, reactantSmiles);

    if (!productSmiles) continue;

    const productHierarchy = await analyzeFunctionalGroupHierarchy(productSmiles);

    const productIdentity = await analyzeNomenclatureAndProperties(
      productSmiles,
      productHierarchy.primaryGroups,
      productHierarchy.mainGroup
    );

    const productName =
      productIdentity.nomenclature.displayName ||
      productIdentity.nomenclature.estimatedName ||
      rule.productLabel;

    pathways.push({
      id: rule.id,
      title: rule.title,
      reactantSmiles,
      reactantLabel: reactantName,
      reagentLabel: rule.reagentLabel,
      reagentNote: rule.reagentNote,
      productSmiles,
      productLabel: productName,
      shortExplanation: rule.shortExplanation,
    });
  }

  return pathways;
}