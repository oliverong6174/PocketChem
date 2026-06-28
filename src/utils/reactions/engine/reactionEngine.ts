import { getRDKit, analyzeFunctionalGroupHierarchy } from "../../analyzeGroups";
import { analyzeNomenclatureAndProperties } from "../../nomenclatureUtils";
import type { FunctionalGroupResult } from "../../analyzeGroups";
import type { ReactionPathway, ReactionRule } from "../reactionTypes";
import { runEngineHandler } from "./handlers";

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function ruleMatchesFunctionalGroups(
  rule: ReactionRule,
  functionalGroups: FunctionalGroupResult[]
) {
  const detectedNames = functionalGroups.map((group) =>
    normalizeName(group.name)
  );

  return rule.trigger.functionalGroups.some((triggerName) => {
    const normalizedTrigger = normalizeName(triggerName);

    return detectedNames.some(
      (detectedName) =>
        detectedName === normalizedTrigger ||
        detectedName.includes(normalizedTrigger) ||
        normalizedTrigger.includes(detectedName)
    );
  });
}

async function getDisplayName(
  smiles: string,
  functionalGroups: FunctionalGroupResult[],
  fallback: string
) {
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

async function runReactionSmarts(
  reactantSmiles: string,
  reactionSmarts: string
): Promise<string | null> {
  const RDKit = await getRDKit();

  let reaction: any = null;
  let reactant: any = null;
  let molList: any = null;
  let products: any = null;
  let firstSet: any = null;

  try {
    reaction = RDKit.get_rxn(reactionSmarts);
    reactant = RDKit.get_mol(reactantSmiles);

    molList = new RDKit.MolList();
    molList.append(reactant);

    products = reaction.run_reactants(molList);

    if (
      !products ||
      typeof products.size !== "function" ||
      products.size() === 0 ||
      typeof products.get !== "function"
    ) {
      return null;
    }

    firstSet = products.get(0);

    if (
      !firstSet ||
      typeof firstSet.size !== "function" ||
      firstSet.size() === 0 ||
      typeof firstSet.at !== "function"
    ) {
      return null;
    }

    const productSmiles: string[] = [];

    for (let i = 0; i < firstSet.size(); i += 1) {
      const productMol = firstSet.at(i);
      const smiles = productMol?.get_smiles?.();

      if (smiles) productSmiles.push(smiles);

      productMol?.delete?.();
    }

    return productSmiles.length > 0 ? productSmiles.join(".") : null;
  } catch (error) {
    console.error("Reaction SMARTS failed:", reactionSmarts, error);
    return null;
  } finally {
    firstSet?.delete?.();
    products?.delete?.();
    molList?.delete?.();
    reactant?.delete?.();
    reaction?.delete?.();
  }
}

async function applyRule(rule: ReactionRule, reactantSmiles: string) {
  switch (rule.transform.type) {
    case "rdkitReactionSmarts":
      return runReactionSmarts(reactantSmiles, rule.transform.smarts);

    case "engineHandler":
      return runEngineHandler(
        rule.transform.handler,
        reactantSmiles,
        rule.transform.options
      );

    default:
      return null;
  }
}

export async function predictReactionPathwaysFromRules(
  reactantSmiles: string,
  functionalGroups: FunctionalGroupResult[],
  rules: ReactionRule[]
): Promise<ReactionPathway[]> {
  const matchingRules = rules
    .filter((rule) => ruleMatchesFunctionalGroups(rule, functionalGroups))
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));

  const reactantName = await getDisplayName(
    reactantSmiles,
    functionalGroups,
    "Reactant"
  );

  const pathways: ReactionPathway[] = [];

  for (const rule of matchingRules) {
    const productSmiles = await applyRule(rule, reactantSmiles);

    if (!productSmiles) continue;

    
    
    const productParts = productSmiles
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);

    const productNames: string[] = [];

    for (const productPart of productParts) {
      try {
        const singleProductHierarchy =
          await analyzeFunctionalGroupHierarchy(productPart);

        const singleProductIdentity = await analyzeNomenclatureAndProperties(
          productPart,
          singleProductHierarchy.primaryGroups,
          singleProductHierarchy.mainGroup
        );

        productNames.push(
          singleProductIdentity.nomenclature.displayName ||
            singleProductIdentity.nomenclature.estimatedName ||
            rule.productHint
        );
      } catch {
        productNames.push(rule.productHint);
      }
    }

    const productName =
      productNames.length > 0 ? productNames.join(" + ") : rule.productHint;

    pathways.push({
      id: rule.id,
      title: rule.title,
      reactantSmiles,
      reactantLabel: reactantName,
      reagentLabel: rule.reagents,
      reagentNote: rule.reagentNote,
      productSmiles,
      productLabel: productName,
      shortExplanation: rule.explanation,
    });
  }

  return pathways;
}