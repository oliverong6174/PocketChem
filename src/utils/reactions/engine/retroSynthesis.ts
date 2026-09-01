import { analyzeFunctionalGroupHierarchy } from "../../functionalGroups";
import { analyzeNomenclatureAndProperties } from "../../nomenclatureUtils";
import { getRDKit } from "../../rdkit";
import { getRuleChapter, getRuleCourse } from "../reactionCurriculum";
import type {
  ReactionComponent,
  ReactionRule,
  RetrosynthesisConfidence,
  RetrosynthesisPathway,
} from "../reactionTypes";
import { runCustomHandler } from "./handlers";
import { alkeneHydrationReactionSmarts } from "./handlers/addition";
import {
  analyzeReactionComponents,
  isGenericReactionSmiles,
  splitReactionComponents,
} from "./reactionInput";
import { runReactionSmarts } from "./rdkitReaction";
import { matchAllRuleReactants, ruleMatchesReactant } from "./ruleMatcher";

type ReverseTransform = {
  smarts: string;
  source: RetrosynthesisPathway["source"];
};

type ValidationResult = {
  confidence: RetrosynthesisConfidence;
  orderedReactants: string[];
};

const MAX_RESULTS_PER_RULE = 12;
const MAX_TOTAL_RESULTS = 80;

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function reverseReactionSmarts(smarts: string): string | null {
  const splitIndex = smarts.indexOf(">>");
  if (splitIndex < 0) return null;

  const reactants = smarts.slice(0, splitIndex).trim();
  const products = smarts.slice(splitIndex + 2).trim();
  if (!reactants || !products) return null;

  return `${products}>>${reactants}`;
}

function templateCount(side: string): number {
  if (!side.trim()) return 0;
  return side.split(".").filter(Boolean).length;
}


function expandElementAlternativesForReverse(smarts: string): string[] {
  const splitIndex = smarts.indexOf(">>");
  if (splitIndex < 0) return [smarts];

  const lhs = smarts.slice(0, splitIndex);
  const rhs = smarts.slice(splitIndex + 2);
  const elementList = /\[(F,Cl,Br,I|Cl,Br,I|Cl,Br|Mg,Li)(:\d+)?\]/;
  const variants: string[] = [];

  function expand(current: string): void {
    const match = current.match(elementList);
    if (!match || match.index === undefined) {
      variants.push(`${current}>>${rhs}`);
      return;
    }

    const [whole, elementsText, atomMap = ""] = match;
    const before = current.slice(0, match.index);
    const after = current.slice(match.index + whole.length);

    for (const element of elementsText.split(",")) {
      expand(`${before}[${element}${atomMap}]${after}`);
    }
  }

  expand(lhs);
  return unique(variants);
}

function productTemplateCount(reactionSmarts: string): number {
  const splitIndex = reactionSmarts.indexOf(">>");
  if (splitIndex < 0) return 0;
  return templateCount(reactionSmarts.slice(splitIndex + 2));
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  if (items.length > 4) return [items];

  const output: T[][] = [];

  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const suffix of permutations(rest)) output.push([item, ...suffix]);
  });

  return output;
}

async function canonicalizeSmiles(smiles: string): Promise<string | null> {
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(smiles);
  if (!mol) return null;

  try {
    return mol.get_smiles?.() ?? null;
  } catch {
    return null;
  } finally {
    mol.delete?.();
  }
}

async function canonicalizeReactionSmiles(smiles: string): Promise<string | null> {
  const components = splitReactionComponents(smiles);
  if (components.length === 0) return null;

  const canonical: string[] = [];
  for (const component of components) {
    const normalized = await canonicalizeSmiles(component);
    if (!normalized) return null;
    canonical.push(normalized);
  }

  return canonical.sort((a, b) => a.localeCompare(b)).join(".");
}

function connectivityKeyFromCanonicalSmiles(smiles: string): string {
  // Forward transforms that intentionally omit E/Z or tetrahedral assignment
  // should still be usable in retrosynthesis. Canonical RDKit SMILES is first
  // generated above; removing stereochemical tokens leaves a stable enough
  // connectivity key for the same constitutional graph.
  return smiles.replace(/@@?/g, "").replace(/[\\/]/g, "");
}

async function compareProductToTarget(
  productSmiles: string,
  targetCanonical: string,
): Promise<RetrosynthesisConfidence | null> {
  const productCanonical = await canonicalizeReactionSmiles(productSmiles);
  if (!productCanonical) return null;

  if (productCanonical === targetCanonical) return "confirmed";

  return connectivityKeyFromCanonicalSmiles(productCanonical) ===
    connectivityKeyFromCanonicalSmiles(targetCanonical)
    ? "connectivity-confirmed"
    : null;
}

async function getDisplayName(smiles: string, fallback: string): Promise<string> {
  if (isGenericReactionSmiles(smiles)) return fallback;

  try {
    const hierarchy = await analyzeFunctionalGroupHierarchy(smiles);
    const identity = await analyzeNomenclatureAndProperties(
      smiles,
      hierarchy.primaryGroups,
      hierarchy.mainGroup,
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

async function getComponentLabel(
  components: string[],
  fallbackPrefix: string,
): Promise<string> {
  const names: string[] = [];

  for (let index = 0; index < components.length; index += 1) {
    names.push(
      await getDisplayName(components[index], `${fallbackPrefix} ${index + 1}`),
    );
  }

  // Collapse repeated stoichiometric components in the text label without
  // losing the actual duplicate structures stored in precursorComponents.
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);

  return [...counts.entries()]
    .map(([name, count]) => (count > 1 ? `${count} equiv ${name}` : name))
    .join(" + ");
}

async function componentsFromSmiles(smiles: string): Promise<ReactionComponent[]> {
  return analyzeReactionComponents(smiles, []);
}

async function executeForwardRule(
  rule: ReactionRule,
  orderedReactants: string[],
): Promise<string[]> {
  switch (rule.transform.type) {
    case "reactionSmarts":
      return runReactionSmarts(
        orderedReactants,
        rule.transform.smarts,
        Math.max(rule.transform.maxProducts ?? 8, 12),
      );

    case "customHandler":
      return runCustomHandler(
        rule.transform.handler,
        orderedReactants,
        rule.transform.options,
      );

    case "conceptOnly":
      return [];
  }
}

async function validateForward(
  rule: ReactionRule,
  precursorSmiles: string,
  targetCanonical: string,
): Promise<ValidationResult | null> {
  const components = await componentsFromSmiles(precursorSmiles);
  if (components.length === 0) return null;

  const assignments = await matchAllRuleReactants(rule, components);
  const orderedAssignments: string[][] = assignments.map((assignment) =>
    assignment.map((component) => component.smiles),
  );

  // Custom elimination/ring/addition/reduction handlers sometimes model a
  // reagent as a condition rather than consuming a structural partner. When a
  // reverse transform can reconstruct only the substrate, still require the
  // substrate itself to satisfy the original rule trigger before replaying the
  // handler. This avoids inventing an arbitrary solvent/base molecule.
  if (
    orderedAssignments.length === 0 &&
    rule.transform.type === "customHandler"
  ) {
    for (const component of components) {
      if (
        await ruleMatchesReactant(
          rule,
          component.smiles,
          component.functionalGroups,
        )
      ) {
        orderedAssignments.push([component.smiles]);
      }
    }
  }

  for (const orderedReactants of orderedAssignments) {
    const products = await executeForwardRule(rule, orderedReactants);

    for (const product of products) {
      const confidence = await compareProductToTarget(product, targetCanonical);
      if (confidence) return { confidence, orderedReactants };
    }
  }

  return null;
}

function halideReverseProducts(
  productPattern: string,
  nucleophileProduct: string,
  chiral = false,
): string[] {
  const halides = ["Cl", "Br", "I"];
  const transforms: string[] = [];

  for (const halide of halides) {
    if (chiral) {
      transforms.push(
        `[C@H:1]([*:3])([*:4])${productPattern}>>[C@@H:1]([*:3])([*:4])${halide}.${nucleophileProduct}`,
        `[C@@H:1]([*:3])([*:4])${productPattern}>>[C@H:1]([*:3])([*:4])${halide}.${nucleophileProduct}`,
      );
    }

    transforms.push(
      `[C;X4:1]${productPattern}>>[C:1]${halide}.${nucleophileProduct}`,
    );
  }

  return transforms;
}

function sn2ReverseSmarts(nucleophile: string): string[] {
  switch (nucleophile) {
    case "hydroxide":
      return halideReverseProducts("[O;H1;+0:5]", "[O-;H1:5]", true);
    case "cyanide":
      return halideReverseProducts("[C:5]#[N:6]", "[C-:5]#[N:6]", true);
    case "azide":
      return halideReverseProducts(
        "[N+0:5]=[N+:6]=[N-:7]",
        "[N-:5]~[N+:6]~[N:7]",
        true,
      );
    case "ammonia":
      return halideReverseProducts("[N;H2;+0:5]", "[N;H3;+0:5]", true);
    case "alkoxide": {
      const output: string[] = [];
      for (const halide of ["Cl", "Br", "I"]) {
        output.push(
          `[C@H:1]([*:3])([*:4])[O+0:5][#6:6]>>[C@@H:1]([*:3])([*:4])${halide}.[O-:5][#6:6]`,
          `[C@@H:1]([*:3])([*:4])[O+0:5][#6:6]>>[C@H:1]([*:3])([*:4])${halide}.[O-:5][#6:6]`,
          `[C;X4:1][O+0:5][#6:6]>>[C:1]${halide}.[O-:5][#6:6]`,
        );
      }
      return output;
    }
    case "acetylide": {
      const output: string[] = [];
      for (const halide of ["Cl", "Br", "I"]) {
        output.push(
          `[C@H:1]([*:3])([*:4])[C:6]#[#6:5]>>[C@@H:1]([*:3])([*:4])${halide}.[C-:6]#[#6:5]`,
          `[C@@H:1]([*:3])([*:4])[C:6]#[#6:5]>>[C@H:1]([*:3])([*:4])${halide}.[C-:6]#[#6:5]`,
          `[C;X4:1][C:6]#[#6:5]>>[C:1]${halide}.[C-:6]#[#6:5]`,
        );
      }
      return output;
    }
    default:
      return [];
  }
}

function sn1ReverseSmarts(nucleophile: string): string[] {
  const output: string[] = [];

  for (const halide of ["Cl", "Br", "I"]) {
    if (nucleophile === "water") {
      // SN1 loses the stereochemical memory of the ionizing substrate. Both
      // precursor configurations are therefore legitimate retrosynthetic
      // candidates when the carbon is stereogenic.
      output.push(
        `[C;H1;X4:1]([*:3])([*:4])[O;H1;+0:5]>>[C@H:1]([*:3])([*:4])${halide}.[O;H2;+0:5]`,
        `[C;H1;X4:1]([*:3])([*:4])[O;H1;+0:5]>>[C@@H:1]([*:3])([*:4])${halide}.[O;H2;+0:5]`,
        `[C;X4:1][O;H1;+0:5]>>[C:1]${halide}.[O;H2;+0:5]`,
      );
    }

    if (nucleophile === "alcohol") {
      output.push(
        `[C;H1;X4:1]([*:3])([*:4])[O+0:5][#6:6]>>[C@H:1]([*:3])([*:4])${halide}.[O;H1;+0:5][#6:6]`,
        `[C;H1;X4:1]([*:3])([*:4])[O+0:5][#6:6]>>[C@@H:1]([*:3])([*:4])${halide}.[O;H1;+0:5][#6:6]`,
        `[C;X4:1][O+0:5][#6:6]>>[C:1]${halide}.[O;H1;+0:5][#6:6]`,
      );
    }
  }

  return output;
}

function eliminationReverseSmarts(leavingGroup: string): string[] {
  if (leavingGroup === "alcohol") {
    return [
      "[C:1]=[C:2]>>[C:1][C:2][OH]",
      "[C:1]=[C:2]>>[C:1]([OH])[C:2]",
    ];
  }

  if (leavingGroup === "halide") {
    return ["Cl", "Br", "I"].flatMap((halide) => [
      `[C:1]=[C:2]>>[C:1][C:2]${halide}`,
      `[C:1]=[C:2]>>[C:1](${halide})[C:2]`,
    ]);
  }

  return [];
}

function oxidationCleavageForwardSmarts(mode: string): string[] {
  if (mode === "alkeneOxidativeCleavage") {
    return [
      "[C;H1:1]=[C;H1:2]>>[C:1](=O)O.[C:2](=O)O",
      "[C;H0:1]=[C;H1:2]>>[C:1]=O.[C:2](=O)O",
      "[C;H1:1]=[C;H0:2]>>[C:1](=O)O.[C:2]=O",
      "[C;H0:1]=[C;H0:2]>>[C:1]=O.[C:2]=O",
      "[CH2:1]=[C;H1:2]>>[C:1](=O)=O.[C:2](=O)O",
      "[C;H1:1]=[CH2:2]>>[C:1](=O)O.[C:2](=O)=O",
      "[CH2:1]=[C;H0:2]>>[C:1](=O)=O.[C:2]=O",
      "[C;H0:1]=[CH2:2]>>[C:1]=O.[C:2](=O)=O",
    ];
  }

  if (mode === "alkyneOxidativeCleavage") {
    return [
      "[C;H0:1]#[C;H0:2]>>[C:1](=O)O.[C:2](=O)O",
      "[CH:1]#[C;H0:2]>>[C:1](=O)=O.[C:2](=O)O",
      "[C;H0:1]#[CH:2]>>[C:1](=O)O.[C:2](=O)=O",
    ];
  }

  return [];
}

function customReverseTransforms(rule: ReactionRule): ReverseTransform[] {
  if (rule.transform.type !== "customHandler") return [];

  const handler = rule.transform.handler;
  const options = rule.transform.options ?? {};
  const mode = String(options.mode ?? "");
  const output: string[] = [];

  if (handler === "addition") {
    if (mode === "oneTwoAddition") {
      if (options.nucleophile === "water") {
        output.push("[C:1]([OH:2])O>>[C:1]=[O:2]");
      } else if (options.nucleophile === "cyanide") {
        output.push("[C:1]([OH:2])C#N>>[C:1]=[O:2]");
      }
    }

    if (mode === "alkeneHydration") {
      const regioselectivity = options.regioselectivity;
      if (
        regioselectivity === "markovnikov" ||
        regioselectivity === "anti-markovnikov"
      ) {
        output.push(
          ...alkeneHydrationReactionSmarts(regioselectivity)
            .map(reverseReactionSmarts)
            .filter((item): item is string => Boolean(item)),
        );
      }
    }
  }

  if (handler === "carbonyl" && mode === "oximeFormation") {
    output.push("[C:1]=NO>>[C:1]=O");
  }

  if (handler === "oxidation") {
    if (mode === "aldehydeOxidation") {
      output.push("[C:1](=[O:2])O>>[CH:1]=[O:2]");
    }

    if (mode === "alcoholOxidation") {
      const level = String(options.level ?? "mild");
      if (level === "mild") {
        output.push(
          "[C;H1:1]=[O:2]>>[CH2:1][OH:2]",
          "[C;H0:1](=[O:2])([#6:3])[#6:4]>>[CH:1]([OH:2])([#6:3])[#6:4]",
        );
      } else {
        output.push(
          "[C:1](=[O:2])O>>[CH2:1][OH:2]",
          "[C;H0:1](=[O:2])([#6:3])[#6:4]>>[CH:1]([OH:2])([#6:3])[#6:4]",
        );
      }
    }

    if (
      mode === "alkeneOxidativeCleavage" ||
      mode === "alkyneOxidativeCleavage"
    ) {
      output.push(
        ...oxidationCleavageForwardSmarts(mode)
          .map(reverseReactionSmarts)
          .filter((item): item is string => Boolean(item)),
      );
    }
  }

  if (handler === "reduction") {
    if (mode === "oneTwoAddition") {
      switch (rule.family) {
        case "aldehydes":
          output.push("[#6:3][CH2:1][OH:2]>>[#6:3][CH:1]=[O:2]");
          break;
        case "ketones":
          output.push(
            "[#6:3][CH:1]([OH:2])[#6:4]>>[#6:3][C:1](=[O:2])[#6:4]",
          );
          break;
        case "carboxylic-acids":
          output.push("[CH2:1][OH:2]>>[C:1](=[O:2])O");
          break;
        case "acid-chlorides":
          output.push("[CH2:1][OH:2]>>[C:1](=[O:2])Cl");
          break;
        case "amides":
          output.push("[CH2:1][N:3]>>[C:1](=O)[N:3]");
          break;
        default:
          output.push(
            "[#6:3][CH2:1][OH:2]>>[#6:3][CH:1]=[O:2]",
            "[#6:3][CH:1]([OH:2])[#6:4]>>[#6:3][C:1](=[O:2])[#6:4]",
          );
      }
    }

    if (mode === "carbonylToAlkane") {
      if (rule.family === "aldehydes") {
        output.push("[#6:3][CH3:1]>>[#6:3][CH:1]=O");
      } else if (rule.family === "ketones") {
        output.push("[#6:3][CH2:1][#6:4]>>[#6:3][C:1](=O)[#6:4]");
      }
    }
  }

  if (handler === "ring" && mode === "epoxideOpening") {
    output.push("[C:1](O)[C:3][OH:2]>>[C:1]1[O:2][C:3]1");
  }

  if (handler === "elimination") {
    output.push(...eliminationReverseSmarts(String(options.leavingGroup ?? "")));
  }

  if (handler === "substitution") {
    if (mode === "sn2" || mode === "alkylHalideSubstitution") {
      output.push(...sn2ReverseSmarts(String(options.nucleophile ?? "")));
    }

    if (mode === "sn1") {
      output.push(...sn1ReverseSmarts(String(options.nucleophile ?? "")));
    }

    if (mode === "alcoholToHalide") {
      const halide =
        options.halide === "chloride"
          ? "Cl"
          : options.halide === "bromide"
            ? "Br"
            : options.halide === "iodide"
              ? "I"
              : null;
      if (halide) output.push(`[C:1]${halide}>>[C:1]O`);
    }

    if (mode === "intermolecularAlcoholDehydration") {
      output.push("[C:1][O:2][C:3]>>[C:1][OH:2].[C:3]O");
    }
  }

  return unique(output).map((smarts) => ({
    smarts,
    source: "reversed-custom-handler" as const,
  }));
}

function reverseTransformsForRule(rule: ReactionRule): ReverseTransform[] {
  if (rule.transform.type === "reactionSmarts") {
    return expandElementAlternativesForReverse(rule.transform.smarts)
      .map(reverseReactionSmarts)
      .filter((smarts): smarts is string => Boolean(smarts))
      .map((smarts) => ({
        smarts,
        source: "reversed-reaction-smarts" as const,
      }));
  }

  if (rule.transform.type === "customHandler") {
    return customReverseTransforms(rule);
  }

  return [];
}

async function runReverseTransform(
  targetComponents: string[],
  transform: ReverseTransform,
  forwardRule: ReactionRule,
): Promise<string[]> {
  const expectedProductTemplates =
    forwardRule.transform.type === "reactionSmarts"
      ? productTemplateCount(forwardRule.transform.smarts)
      : productTemplateCount(transform.smarts.split(">>").reverse().join(">>"));

  // A cleavage reaction cannot be uniquely reconstructed from only one of its
  // two product fragments. If the target has all product components, order is
  // handled independently of Ketcher drawing order.
  if (expectedProductTemplates > 0 && targetComponents.length !== expectedProductTemplates) {
    return [];
  }

  const candidateSets = new Set<string>();
  const inputOrders =
    targetComponents.length > 1 ? permutations(targetComponents) : [targetComponents];

  for (const input of inputOrders) {
    const products = await runReactionSmarts(input, transform.smarts, MAX_RESULTS_PER_RULE);
    for (const product of products) candidateSets.add(product);
  }

  return [...candidateSets];
}

async function createRetrosynthesisPathway(
  rule: ReactionRule,
  targetSmiles: string,
  targetLabel: string,
  precursorSmiles: string,
  validation: ValidationResult,
  source: RetrosynthesisPathway["source"],
): Promise<RetrosynthesisPathway> {
  const precursorComponents = splitReactionComponents(precursorSmiles);
  const precursorLabel = await getComponentLabel(precursorComponents, "Precursor");
  const customMode =
    rule.transform.type === "customHandler"
      ? String(rule.transform.options?.mode ?? "")
      : "";
  const reverseAlreadyContainsStructuralPartners =
    source === "reversed-reaction-smarts" ||
    (rule.transform.type === "customHandler" &&
      rule.transform.handler === "substitution" &&
      ["sn1", "sn2", "alkylHalideSubstitution"].includes(customMode));
  const requiredReactantLabels = reverseAlreadyContainsStructuralPartners
    ? []
    : (rule.additionalReactants ?? []).map((reactant) => reactant.label);

  return {
    id: `${rule.id}--retro--${encodeURIComponent(precursorSmiles)}`,
    ruleId: rule.id,
    family: rule.family,
    reactionType: rule.reactionType,
    title: rule.title,
    targetSmiles,
    targetLabel,
    precursorSmiles,
    precursorComponents,
    precursorLabel,
    requiredReactantLabels,
    reagentLabel: rule.reagents,
    reagentNote: rule.reagentNote,
    shortExplanation: rule.explanation,
    priority: rule.priority,
    course: getRuleCourse(rule),
    chapter: getRuleChapter(rule),
    mechanism: rule.mechanism ?? null,
    reactionClass: rule.reactionClass ?? null,
    purpose: rule.purpose ?? null,
    selectivity: rule.selectivity ?? [],
    limitations: [
      ...(rule.limitations ?? []),
      ...(validation.confidence === "connectivity-confirmed"
        ? [
            "The proposed precursors reproduce the target connectivity under the forward rule, but the current forward model does not fully specify the target stereochemistry.",
          ]
        : []),
    ],
    confidence: validation.confidence,
    source,
    alternativeRoutes: [],
  };
}

function compareRetrosynthesisPathways(
  a: RetrosynthesisPathway,
  b: RetrosynthesisPathway,
): number {
  const confidenceA = a.confidence === "confirmed" ? 0 : 1;
  const confidenceB = b.confidence === "confirmed" ? 0 : 1;
  if (confidenceA !== confidenceB) return confidenceA - confidenceB;

  if (a.priority !== b.priority) return a.priority - b.priority;

  const precursorDifference =
    a.precursorComponents.length - b.precursorComponents.length;
  if (precursorDifference !== 0) return precursorDifference;

  return a.title.localeCompare(b.title);
}

async function precursorStructureKey(
  pathway: RetrosynthesisPathway,
): Promise<string> {
  // Use RDKit canonical SMILES so equivalent atom-order renderings collapse,
  // while retaining stereochemistry. Retrosynthetic candidates that differ in
  // R/S or E/Z assignment therefore remain separate cards.
  return (
    (await canonicalizeReactionSmiles(pathway.precursorSmiles)) ??
    pathway.precursorComponents
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .join(".")
  );
}

async function dedupeAndRank(
  pathways: RetrosynthesisPathway[],
): Promise<RetrosynthesisPathway[]> {
  // Sort first so the best supported/highest-priority rule becomes the visible
  // card. Any later rule yielding the same precursor structures is attached as
  // an alternate set of conditions rather than rendered as a duplicate card.
  const ranked = pathways.slice().sort(compareRetrosynthesisPathways);
  const byPrecursors = new Map<string, RetrosynthesisPathway>();

  for (const pathway of ranked) {
    const key = await precursorStructureKey(pathway);
    const existing = byPrecursors.get(key);

    if (!existing) {
      byPrecursors.set(key, pathway);
      continue;
    }

    // Reverse-SMARTS expansion can produce the same candidate more than once
    // within one rule. Only genuinely different forward rules are useful as
    // alternate conditions.
    if (existing.ruleId === pathway.ruleId) continue;

    const duplicateAlternative = existing.alternativeRoutes.some(
      (route) => route.ruleId === pathway.ruleId,
    );
    if (duplicateAlternative) continue;

    existing.alternativeRoutes.push({
      ruleId: pathway.ruleId,
      title: pathway.title,
      reagentLabel: pathway.reagentLabel,
      reagentNote: pathway.reagentNote,
      mechanism: pathway.mechanism,
      reactionClass: pathway.reactionClass,
      selectivity: pathway.selectivity,
    });
  }

  return [...byPrecursors.values()]
    .sort(compareRetrosynthesisPathways)
    .slice(0, MAX_TOTAL_RESULTS)
    .map((pathway, index) => ({
      ...pathway,
      id: `${pathway.ruleId}--retro-${index + 1}`,
    }));
}

/**
 * Search the existing forward reaction registry backwards.
 *
 * Reaction-SMARTS rules are reversed automatically. Custom graph handlers have
 * explicit inverse templates for the handler modes whose chemistry is
 * sufficiently determined. Every proposed precursor set is replayed through
 * the ORIGINAL forward rule and is discarded unless it regenerates the drawn
 * target (exact stereochemistry when available, otherwise exact connectivity).
 */
export async function predictRetrosynthesisPathwaysFromRules(
  targetSmiles: string,
  rules: ReactionRule[],
): Promise<RetrosynthesisPathway[]> {
  const targetComponents = splitReactionComponents(targetSmiles);
  if (targetComponents.length === 0) return [];

  const targetCanonical = await canonicalizeReactionSmiles(targetSmiles);
  if (!targetCanonical) return [];

  const targetLabel = await getComponentLabel(targetComponents, "Target product");
  const pathways: RetrosynthesisPathway[] = [];

  for (const rule of rules) {
    const transforms = reverseTransformsForRule(rule);
    if (transforms.length === 0) continue;

    for (const transform of transforms) {
      const precursorCandidates = await runReverseTransform(
        targetComponents,
        transform,
        rule,
      );

      for (const precursorCandidate of precursorCandidates) {
        const validation = await validateForward(
          rule,
          precursorCandidate,
          targetCanonical,
        );
        if (!validation) continue;

        pathways.push(
          await createRetrosynthesisPathway(
            rule,
            targetSmiles,
            targetLabel,
            precursorCandidate,
            validation,
            transform.source,
          ),
        );

        if (pathways.length >= MAX_TOTAL_RESULTS * 2) break;
      }

      if (pathways.length >= MAX_TOTAL_RESULTS * 2) break;
    }

    if (pathways.length >= MAX_TOTAL_RESULTS * 2) break;
  }

  return dedupeAndRank(pathways);
}
