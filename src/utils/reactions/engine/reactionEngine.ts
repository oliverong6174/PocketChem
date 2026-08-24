import {
  analyzeFunctionalGroupHierarchy,
  type FunctionalGroupResult,
} from "../../functionalGroups";
import { analyzeNomenclatureAndProperties } from "../../nomenclatureUtils";
import { getRuleChapter, getRuleCourse } from "../reactionCurriculum";
import type {
  ProductGenerationStatus,
  ReactionPathway,
  ReactionRule,
} from "../reactionTypes";
import { runEngineHandler } from "./handlers";
import { runReactionSmarts } from "./rdkitReaction";
import { ruleMatchesReactant } from "./ruleMatcher";

type RuleExecution = {
  products: string[];
  productStatus: ProductGenerationStatus;
};

async function getDisplayName(
  smiles: string,
  functionalGroups: FunctionalGroupResult[],
  fallback: string
): Promise<string> {
  const identity = await analyzeNomenclatureAndProperties(
    smiles,
    functionalGroups,
    functionalGroups[0] ?? null
  );

  return (
    identity.nomenclature.displayName ||
    identity.nomenclature.estimatedName ||
    fallback
  );
}

async function getProductName(
  productSmiles: string,
  fallback: string
): Promise<string> {
  const productParts = productSmiles
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  const productNames: string[] = [];

  for (const productPart of productParts) {
    try {
      const hierarchy = await analyzeFunctionalGroupHierarchy(productPart);
      const identity = await analyzeNomenclatureAndProperties(
        productPart,
        hierarchy.primaryGroups,
        hierarchy.mainGroup
      );

      productNames.push(
        identity.nomenclature.displayName ||
          identity.nomenclature.estimatedName ||
          fallback
      );
    } catch {
      productNames.push(fallback);
    }
  }

  return productNames.length > 0 ? productNames.join(" + ") : fallback;
}

async function applyRule(
  rule: ReactionRule,
  reactantSmiles: string
): Promise<RuleExecution> {
  switch (rule.transform.type) {
    case "rdkitReactionSmarts":
      return {
        products: await runReactionSmarts(
          reactantSmiles,
          rule.transform.smarts,
          rule.transform.maxProducts
        ),
        productStatus: rule.productStatus ?? "computed",
      };

    case "engineHandler": {
      const products = await runEngineHandler(
        rule.transform.handler,
        reactantSmiles,
        rule.transform.options
      );

      return {
        products,
        productStatus: rule.productStatus ?? "representative",
      };
    }

    case "conceptOnly":
      return {
        products: [],
        productStatus: "concept-only",
      };
  }
}

function createPathwayBase(rule: ReactionRule) {
  return {
    ruleId: rule.id,
    family: rule.family,
    title: rule.title,
    reagentLabel: rule.reagents,
    reagentNote: rule.reagentNote,
    shortExplanation: rule.explanation,
    course: getRuleCourse(rule),
    chapter: getRuleChapter(rule),
    mechanism: rule.mechanism ?? null,
    selectivity: rule.selectivity ?? [],
    limitations: rule.limitations ?? [],
  };
}

export async function predictReactionPathwaysFromRules(
  reactantSmiles: string,
  functionalGroups: FunctionalGroupResult[] = [],
  rules: ReactionRule[]
): Promise<ReactionPathway[]> {
  const matchingRules: ReactionRule[] = [];

  for (const rule of rules) {
    if (await ruleMatchesReactant(rule, reactantSmiles, functionalGroups)) {
      matchingRules.push(rule);
    }
  }

  matchingRules.sort(
    (a, b) => a.priority - b.priority || a.title.localeCompare(b.title)
  );

  const reactantName = await getDisplayName(
    reactantSmiles,
    functionalGroups,
    "Reactant"
  );

  const pathways: ReactionPathway[] = [];

  for (const rule of matchingRules) {
    const execution = await applyRule(rule, reactantSmiles);
    const base = createPathwayBase(rule);

    if (rule.transform.type === "conceptOnly") {
      pathways.push({
        ...base,
        id: rule.id,
        reactantSmiles,
        reactantLabel: reactantName,
        productSmiles: null,
        productLabel: rule.productHint,
        productStatus: execution.productStatus,
        limitations: [
          ...(rule.limitations ?? []),
          rule.transform.reason,
        ],
      });
      continue;
    }

    if (execution.products.length === 0) {
      pathways.push({
        ...base,
        id: rule.id,
        reactantSmiles,
        reactantLabel: reactantName,
        productSmiles: null,
        productLabel: rule.productHint,
        productStatus:
          execution.productStatus === "computed"
            ? "representative"
            : execution.productStatus,
        limitations: [
          ...(rule.limitations ?? []),
          "The rule matched this substrate, but the current structure generator did not produce a valid product molecule.",
        ],
      });
      continue;
    }

    for (let productIndex = 0; productIndex < execution.products.length; productIndex += 1) {
      const productSmiles = execution.products[productIndex];
      const productName = await getProductName(productSmiles, rule.productHint);

      pathways.push({
        ...base,
        id: productIndex === 0 ? rule.id : `${rule.id}--${productIndex + 1}`,
        reactantSmiles,
        reactantLabel: reactantName,
        productSmiles,
        productLabel: productName,
        productStatus: execution.productStatus,
      });
    }
  }

  return pathways;
}
