import {
  analyzeFunctionalGroupHierarchy,
  type FunctionalGroupResult,
} from "../../functionalGroups";
import { analyzeNomenclatureAndProperties } from "../../nomenclatureUtils";
import { getRuleChapter, getRuleCourse } from "../reactionCurriculum";
import type {
  ProductGenerationStatus,
  ReactionComponent,
  ReactionPathway,
  ReactionRule,
} from "../reactionTypes";
import { runCustomHandler } from "./handlers";
import {
  analyzeReactionComponents,
  isGenericReactionSmiles,
} from "./reactionInput";
import { runReactionSmarts } from "./rdkitReaction";
import { classifyReactionProducts } from "./productMixtures";
import {
  filterRulesMatchingReactant,
  matchAllRuleReactants,
} from "./ruleMatcher";

type RuleExecution = {
  products: string[];
  productStatus: ProductGenerationStatus;
};

async function getDisplayName(
  smiles: string,
  functionalGroups: FunctionalGroupResult[],
  fallback: string
): Promise<string> {
  if (isGenericReactionSmiles(smiles)) return fallback;

  try {
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
  } catch {
    return fallback;
  }
}

async function getReactantLabel(components: ReactionComponent[]): Promise<string> {
  const names: string[] = [];

  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    names.push(
      await getDisplayName(
        component.smiles,
        component.functionalGroups,
        component.isGeneric ? `R-group reactant ${index + 1}` : `Reactant ${index + 1}`
      )
    );
  }

  return names.join(" + ");
}

async function getProductName(
  productSmiles: string,
  fallback: string,
): Promise<string> {
  if (isGenericReactionSmiles(productSmiles)) return fallback;

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
          fallback,
      );
    } catch {
      productNames.push(fallback);
    }
  }

  return productNames.length > 0 ? productNames.join(" + ") : fallback;
}

async function applyRule(
  rule: ReactionRule,
  reactants: ReactionComponent[]
): Promise<RuleExecution> {
  const reactantSmiles = reactants.map((component) => component.smiles);
  const hasGenericReactant = reactants.some((component) => component.isGeneric);

  switch (rule.transform.type) {
    case "reactionSmarts":
      return {
        products: await runReactionSmarts(
          reactantSmiles,
          rule.transform.smarts,
          rule.transform.maxProducts
        ),
        productStatus: hasGenericReactant
          ? "generic"
          : rule.productStatus ?? "computed",
      };

    case "customHandler": {
      // Custom handlers receive the ordered structural reactants. Most handlers
      // still use only the primary substrate, but substitution now consumes the
      // drawn nucleophile/solvent directly for SN1/SN2 stereochemistry.
      const products = await runCustomHandler(
        rule.transform.handler,
        reactantSmiles,
        rule.transform.options
      );

      return {
        products,
        productStatus: hasGenericReactant
          ? "generic"
          : rule.productStatus ?? "representative",
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
    reactionType: rule.reactionType,
    title: rule.title,
    reagentLabel: rule.reagents,
    reagentNote: rule.reagentNote,
    shortExplanation: rule.explanation,
    course: getRuleCourse(rule),
    chapter: getRuleChapter(rule),
    mechanism: rule.mechanism ?? null,
    reactionClass: rule.reactionClass ?? null,
    purpose: rule.purpose ?? null,
    selectivity: rule.selectivity ?? [],
    selectivityProfile: rule.selectivityProfile ?? null,
    limitations: rule.limitations ?? [],
  };
}

function formatNameList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function stripLeadingStereoDescriptor(name: string): string {
  return name
    .replace(/^rac-/i, "")
    .replace(/^meso-/i, "")
    .replace(/^\((?:(?:\d+)?[RSEZ])(?:,(?:(?:\d+)?[RSEZ]))*\)-/, "");
}

function sharedMixtureDisplayName(
  kind: "racemic" | "diastereomeric" | "stereoisomeric",
  names: string[],
): string | null {
  const uniqueNames = Array.from(
    new Set(names.map((name) => name.trim()).filter(Boolean)),
  );

  if (uniqueNames.length === 0) return null;

  const bases = uniqueNames.map(stripLeadingStereoDescriptor);
  const sameBase = Boolean(bases[0]) && bases.every((base) => base === bases[0]);

  // A pair of enantiomers is cleanly represented by the conventional rac-
  // prefix. The individual R/S structures remain stored in memberSmiles.
  if (kind === "racemic" && sameBase) {
    return `rac-${bases[0]}`;
  }

  // Diastereomers are NOT interchangeable. If PocketChem knows their exact
  // stereochemical names, show those names instead of flattening both into one
  // achiral base name. This is important for wedge/dash-specific products.
  if (uniqueNames.length <= 3) {
    return formatNameList(uniqueNames);
  }

  if (sameBase) {
    if (kind === "diastereomeric") {
      return `${bases[0]} (diastereomeric mixture)`;
    }
    return `${bases[0]} (stereoisomeric mixture)`;
  }

  if (kind === "diastereomeric") return "Diastereomeric mixture";
  return "Stereoisomeric mixture";
}

async function createExecutedPathways(
  rule: ReactionRule,
  reactants: ReactionComponent[]
): Promise<ReactionPathway[]> {
  const execution = await applyRule(rule, reactants);
  const base = createPathwayBase(rule);
  const reactantSmiles = reactants.map((component) => component.smiles).join(".");
  const reactantLabel = await getReactantLabel(reactants);
  const hasGenericReactant = reactants.some((component) => component.isGeneric);
  const reactantComponents = reactants.map((component) => component.smiles);

  if (rule.transform.type === "conceptOnly") {
    return [{
      ...base,
      id: rule.id,
      reactantSmiles,
      reactantLabel,
      productSmiles: null,
      productLabel: rule.productHint,
      productStatus: execution.productStatus,
      reactantComponents,
      hasGenericReactant,
      productMixture: null,
      limitations: [...(rule.limitations ?? []), rule.transform.reason],
    }];
  }

  if (execution.products.length === 0) {
    return [{
      ...base,
      id: rule.id,
      reactantSmiles,
      reactantLabel,
      productSmiles: null,
      productLabel: rule.productHint,
      productStatus:
        execution.productStatus === "computed"
          ? "representative"
          : execution.productStatus,
      reactantComponents,
      hasGenericReactant,
      productMixture: null,
      limitations: [
        ...(rule.limitations ?? []),
        "The rule matched these reactants, but the current structure generator did not produce a valid product molecule.",
      ],
    }];
  }

  const classifiedProducts = await classifyReactionProducts(
    rule,
    execution.products,
  );
  const namedProducts = await Promise.all(
    classifiedProducts.map(async (product) => ({
      ...product,
      productName: await getProductName(product.smiles, rule.productHint),
    })),
  );

  const mixtureNames = new Map<string, string | null>();
  for (const product of namedProducts) {
    const mixture = product.mixture;
    if (!mixture || mixtureNames.has(mixture.groupId)) continue;
    const group = namedProducts.filter(
      (candidate) => candidate.mixture?.groupId === mixture.groupId,
    );
    mixtureNames.set(
      mixture.groupId,
      sharedMixtureDisplayName(
        mixture.kind,
        group.map((candidate) => candidate.productName),
      ),
    );
  }

  const pathways: ReactionPathway[] = [];

  for (let productIndex = 0; productIndex < namedProducts.length; productIndex += 1) {
    const product = namedProducts[productIndex];
    const mixture = product.mixture
      ? {
          ...product.mixture,
          displayName: mixtureNames.get(product.mixture.groupId) ?? null,
        }
      : null;

    pathways.push({
      ...base,
      id: productIndex === 0 ? rule.id : `${rule.id}--${productIndex + 1}`,
      reactantSmiles,
      reactantLabel,
      productSmiles: product.smiles,
      productLabel: product.productName,
      productStatus: isGenericReactionSmiles(product.smiles)
        ? "generic"
        : execution.productStatus,
      reactantComponents,
      hasGenericReactant,
      productMixture: mixture,
    });
  }

  return pathways;
}


function dedupeReactionPathways(pathways: ReactionPathway[]): ReactionPathway[] {
  const seen = new Set<string>();
  const deduped: ReactionPathway[] = [];

  for (const pathway of pathways) {
    const key = [
      pathway.ruleId,
      pathway.reactantComponents.join("."),
      pathway.productSmiles ?? "<no-product>",
      pathway.productStatus,
    ].join("||");

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(pathway);
  }

  // React can only use a pathway id once. The same reaction rule may
  // legitimately match two different components in one Ketcher canvas, so
  // keep those pathways but give later matches a stable unique id.
  const idCounts = new Map<string, number>();

  return deduped.map((pathway) => {
    const count = (idCounts.get(pathway.id) ?? 0) + 1;
    idCounts.set(pathway.id, count);

    return count === 1
      ? pathway
      : { ...pathway, id: `${pathway.id}--match-${count}` };
  });
}

async function createMissingReactantPathway(
  rule: ReactionRule,
  primary: ReactionComponent
): Promise<ReactionPathway> {
  const base = createPathwayBase(rule);
  const reactantLabel = await getReactantLabel([primary]);
  const missingLabels = (rule.additionalReactants ?? []).map((item) => item.label);

  return {
    ...base,
    id: rule.id,
    reactantSmiles: primary.smiles,
    reactantLabel,
    productSmiles: null,
    productLabel: rule.productHint,
    productStatus: "concept-only",
    reactantComponents: [primary.smiles],
    hasGenericReactant: primary.isGeneric,
    productMixture: null,
    limitations: [
      ...(rule.limitations ?? []),
      `Draw the additional reactant${missingLabels.length === 1 ? "" : "s"} in the same Ketcher canvas: ${missingLabels.join(", ")}.`,
    ],
  };
}

export async function predictReactionPathwaysFromRules(
  reactantSmiles: string,
  functionalGroups: FunctionalGroupResult[] = [],
  rules: ReactionRule[]
): Promise<ReactionPathway[]> {
  const components = await analyzeReactionComponents(
    reactantSmiles,
    functionalGroups
  );

  if (components.length === 0) return [];

  const multiRules = rules.filter((rule) => (rule.additionalReactants?.length ?? 0) > 0);
  const multiMatches: Array<{ rule: ReactionRule; reactants: ReactionComponent[] }> = [];

  if (components.length > 1) {
    for (const rule of multiRules) {
      const assignments = await matchAllRuleReactants(rule, components);
      for (const reactants of assignments) {
        multiMatches.push({ rule, reactants });
      }
    }

    // When the user intentionally draws multiple compatible structures, show
    // reactions that consume those structures instead of flooding the page
    // with unrelated single-substrate possibilities for each component.
    if (multiMatches.length > 0) {
      multiMatches.sort(
        (a, b) => a.rule.priority - b.rule.priority || a.rule.title.localeCompare(b.rule.title)
      );

      const pathways: ReactionPathway[] = [];
      for (const match of multiMatches) {
        pathways.push(...await createExecutedPathways(match.rule, match.reactants));
      }
      return dedupeReactionPathways(pathways);
    }
  }

  const matchingSingles: Array<{ rule: ReactionRule; reactant: ReactionComponent }> = [];
  const missingMulti: Array<{ rule: ReactionRule; reactant: ReactionComponent }> = [];

  for (const component of components) {
    const componentRules = await filterRulesMatchingReactant(
      rules,
      component.smiles,
      component.functionalGroups,
    );

    for (const rule of componentRules) {

      if ((rule.additionalReactants?.length ?? 0) > 0) {
        if (components.length === 1) missingMulti.push({ rule, reactant: component });
        continue;
      }

      matchingSingles.push({ rule, reactant: component });
    }
  }

  matchingSingles.sort(
    (a, b) => a.rule.priority - b.rule.priority || a.rule.title.localeCompare(b.rule.title)
  );
  missingMulti.sort(
    (a, b) => a.rule.priority - b.rule.priority || a.rule.title.localeCompare(b.rule.title)
  );

  const pathways: ReactionPathway[] = [];

  for (const match of matchingSingles) {
    pathways.push(...await createExecutedPathways(match.rule, [match.reactant]));
  }

  for (const match of missingMulti) {
    pathways.push(await createMissingReactantPathway(match.rule, match.reactant));
  }

  return dedupeReactionPathways(pathways);
}
