import { analyzeFunctionalGroupHierarchy } from "../../functionalGroups";
import { analyzeNomenclatureAndProperties } from "../../nomenclatureUtils";
import { getRDKit } from "../../rdkit";
import { getRuleChapter, getRuleCourse } from "../reactionCurriculum";
import {
  SN1_NUCLEOPHILE_PROFILES,
  SN2_NUCLEOPHILE_PROFILES,
  isSn1NucleophileId,
  isSn2NucleophileId,
} from "../profiles/nucleophiles";
import type {
  ReactionComponent,
  ReactionProductMixture,
  ReactionRule,
  ReactionSelectivityAssessment,
  RetrosynthesisConfidence,
  RetrosynthesisPathway,
} from "../reactionTypes";
import { runCustomHandler } from "./handlers";
import {
  alkeneHalohydrinReactionSmarts,
  alkeneHaloetherReactionSmarts,
  alkeneHydrationReactionSmarts,
  alkeneHydrohalogenationReactionSmarts,
  alkoxymercurationReactionSmarts,
} from "./handlers/addition";
import {
  analyzeReactionComponents,
  isGenericReactionSmiles,
  splitReactionComponents,
} from "./reactionInput";
import { runReactionSmarts } from "./rdkitReaction";
import { getCompiledQuerySync } from "./rdkitCaches";
import { alkeneReductiveCleavageReactionSmarts } from "./cleavageSmarts";
import { classifyReactionProducts } from "./productMixtures";
import { assessReactionProductSelectivity } from "./productSelectivity";
import {
  canonicalizeStereoStructure,
  compareProductStructureToTarget,
  type CanonicalStereoStructure,
} from "./stereochemistry";
import { matchAllRuleReactants, ruleMatchesReactant } from "./ruleMatcher";

type ReverseTransform = {
  smarts: string;
  source: RetrosynthesisPathway["source"];
};

type ValidationResult = {
  confidence: RetrosynthesisConfidence;
  orderedReactants: string[];
  productMixture: ReactionProductMixture | null;
  selectivityAssessment: ReactionSelectivityAssessment | null;
};

type RetrosynthesisPredictionOptions = {
  /** Skip expensive nomenclature generation during multistep planning. */
  planning?: boolean;
  /** Cooperative cancellation for bounded multistep searches. */
  signal?: AbortSignal;
  /** Cap verified reverse candidates retained during planner expansion. */
  maxResults?: number;
  /** Optional fast-pass cap on how many interleaved catalog rules are scanned. */
  maxRulesScanned?: number;
  /** Cap expensive reverse executions after cheap product-side screening/sorting. */
  maxTransformsExecuted?: number;
};

const MAX_RESULTS_PER_RULE = 12;
const MAX_TOTAL_RESULTS = 80;

function searchCancelled(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

async function yieldToBrowser(signal?: AbortSignal): Promise<boolean> {
  if (searchCancelled(signal)) return false;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return !searchCancelled(signal);
}

function reverseInputTemplates(reactionSmarts: string): string[] {
  const splitIndex = reactionSmarts.indexOf(">>");
  if (splitIndex < 0) return [];
  return reactionSmarts
    .slice(0, splitIndex)
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Cheap product-side gate before running a reverse reaction. Returns a rough
 * specificity score for matching transforms (larger product-side patterns are
 * tried first) and null when the reverse transform cannot match the target.
 *
 * If RDKit cannot safely parse/use a query we return 0 rather than excluding
 * it. The gate is an optimization only; authoritative chemistry still comes
 * from reverse execution followed by exact forward replay.
 */
function reverseTransformMatchSpecificity(
  rdkit: any,
  targetMolecules: any[],
  transform: ReverseTransform,
): number | null {
  const templates = reverseInputTemplates(transform.smarts);
  if (templates.length === 0) return 0;
  if (templates.length !== targetMolecules.length) return null;

  const queries: any[] = [];
  try {
    for (const template of templates) {
      const query = getCompiledQuerySync(rdkit, template);
      if (!query) return 0;
      queries.push(query);
    }

    const usedTargets = new Set<number>();
    const matchTemplate = (templateIndex: number): boolean => {
      if (templateIndex >= queries.length) return true;
      const query = queries[templateIndex];

      for (let targetIndex = 0; targetIndex < targetMolecules.length; targetIndex += 1) {
        if (usedTargets.has(targetIndex)) continue;
        const molecule = targetMolecules[targetIndex];
        let matched = false;
        try {
          matched = molecule.get_substruct_match(query) !== "{}";
        } catch {
          // Conservative fallback: do not filter a transform merely because a
          // query feature is unsupported by the substructure screening API.
          return true;
        }
        if (!matched) continue;

        usedTargets.add(targetIndex);
        if (matchTemplate(templateIndex + 1)) return true;
        usedTargets.delete(targetIndex);
      }

      return false;
    };

    if (!matchTemplate(0)) return null;

    return queries.reduce((score, query) => {
      try {
        return score + Number(query.get_num_atoms?.() ?? 0);
      } catch {
        return score;
      }
    }, 0);
  } catch {
    return 0;
  }
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function interleaveRulesByFamily(rules: ReactionRule[]): ReactionRule[] {
  // The registry is grouped by family, so a hard result cap can otherwise
  // starve late families (notably diazonium chemistry) before they are even
  // considered. Round-robin the families while preserving each family's own
  // order so every chemistry family gets an early chance to match the target.
  const byFamily = new Map<ReactionRule["family"], ReactionRule[]>();
  const familyOrder: ReactionRule["family"][] = [];

  for (const rule of rules) {
    if (rule.retrosynthesis?.tier === "disabled") continue;
    const existing = byFamily.get(rule.family);
    if (existing) {
      existing.push(rule);
    } else {
      byFamily.set(rule.family, [rule]);
      familyOrder.push(rule.family);
    }
  }

  const output: ReactionRule[] = [];
  let index = 0;
  while (output.length < rules.length) {
    let added = false;
    for (const family of familyOrder) {
      const rule = byFamily.get(family)?.[index];
      if (!rule) continue;
      output.push(rule);
      added = true;
    }
    if (!added) break;
    index += 1;
  }

  return output;
}

type ReverseRuleIndexEntry = {
  rule: ReactionRule;
  transforms: ReverseTransform[];
  ruleOrder: number;
};

const reverseRuleIndexCache = new WeakMap<ReactionRule[], ReverseRuleIndexEntry[]>();

function getReverseRuleIndex(rules: ReactionRule[]): ReverseRuleIndexEntry[] {
  const cached = reverseRuleIndexCache.get(rules);
  if (cached) return cached;

  const ordered = interleaveRulesByFamily(rules);
  const index = ordered.map((rule, ruleOrder) => ({
    rule,
    transforms: reverseTransformsForRule(rule),
    ruleOrder,
  }));
  reverseRuleIndexCache.set(rules, index);
  return index;
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

async function canonicalizeReactionSmiles(
  smiles: string,
): Promise<CanonicalStereoStructure | null> {
  const components = splitReactionComponents(smiles);
  if (components.length === 0) return null;

  const structures: CanonicalStereoStructure[] = [];
  for (const component of components) {
    const structure = await canonicalizeStereoStructure(component);
    if (!structure) return null;
    structures.push(structure);
  }

  return {
    isomeric: structures
      .map((structure) => structure.isomeric)
      .sort((a, b) => a.localeCompare(b))
      .join("."),
    connectivity: structures
      .map((structure) => structure.connectivity)
      .sort((a, b) => a.localeCompare(b))
      .join("."),
    hasSpecifiedStereo: structures.some(
      (structure) => structure.hasSpecifiedStereo,
    ),
  };
}

async function compareProductToTarget(
  productSmiles: string,
  targetStructure: CanonicalStereoStructure,
  productMixture: ReactionProductMixture | null,
): Promise<RetrosynthesisConfidence | null> {
  const productStructure = await canonicalizeReactionSmiles(productSmiles);
  if (!productStructure) return null;

  const stereoMatch = compareProductStructureToTarget(
    productStructure,
    targetStructure,
  );

  if (stereoMatch === "exact") {
    // A racemic/stereoisomeric product set can still contain the exact
    // stereoisomer drawn by the user. Accept that route for synthesis
    // discovery, but downgrade confidence so it is never presented as an
    // enantiopure synthesis.
    if (productMixture && targetStructure.hasSpecifiedStereo) {
      return "connectivity-confirmed";
    }
    return "confirmed";
  }

  if (stereoMatch === "connectivity-only" && !targetStructure.hasSpecifiedStereo) {
    return "connectivity-confirmed";
  }

  // An unspecified or opposite stereoisomer cannot stand in for a specifically
  // drawn R/S or E/Z target.
  return null;
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

async function validateProductsAgainstTarget(
  rule: ReactionRule,
  products: string[],
  targetStructure: CanonicalStereoStructure,
  orderedReactants: string[],
): Promise<ValidationResult | null> {
  const stereoSensitive = Boolean(
    targetStructure.hasSpecifiedStereo ||
    rule.selectivityProfile?.stereochemistry ||
    rule.selectivityProfile?.mixture === "expected"
  );

  // Most multistep O-Chem searches are achiral. Avoid mixture grouping and CIP
  // analysis in that common path; exact connectivity is still canonicalized
  // and checked against the target.
  if (!stereoSensitive) {
    for (const product of products) {
      const confidence = await compareProductToTarget(product, targetStructure, null);
      if (confidence) {
        return {
          confidence,
          orderedReactants,
          productMixture: null,
          selectivityAssessment: await assessReactionProductSelectivity(
            rule,
            orderedReactants[0] ?? "",
            product,
          ),
        };
      }
    }
    return null;
  }

  const classifiedProducts = await classifyReactionProducts(rule, products);
  for (const product of classifiedProducts) {
    const confidence = await compareProductToTarget(
      product.smiles,
      targetStructure,
      product.mixture,
    );
    if (confidence) {
      return {
        confidence,
        orderedReactants,
        productMixture: product.mixture,
        selectivityAssessment: await assessReactionProductSelectivity(
          rule,
          orderedReactants[0] ?? "",
          product.smiles,
        ),
      };
    }
  }
  return null;
}

function primaryTriggerHasNameScope(rule: ReactionRule): boolean {
  return Boolean(
    rule.trigger.functionalGroups?.length ||
      rule.trigger.anyFunctionalGroups?.length ||
      rule.trigger.allFunctionalGroups?.length ||
      rule.trigger.excludedFunctionalGroups?.length,
  );
}

function reactantAssignmentKey(
  smiles: string[],
  unordered: boolean,
): string {
  const values = unordered ? [...smiles].sort() : smiles;
  return values.join("||");
}

/**
 * Reverse SMARTS can reconstruct a structure that is algebraically compatible
 * with a forward transform but outside that reaction's actual substrate scope.
 * Planning must therefore re-check the ORIGINAL rule trigger and any blocking
 * mechanistic constraints before accepting the replay. This prevents false
 * routes such as Gattermann-Koch formylation of benzonitrile.
 */
async function planningReactantsAreEligible(
  rule: ReactionRule,
  precursorSmiles: string,
  orderedReactants: string[],
): Promise<boolean> {
  const precursorComponents = splitReactionComponents(precursorSmiles);
  if (precursorComponents.length === 0) return false;

  if (
    precursorComponents.length === 1 &&
    (rule.additionalReactants?.length ?? 0) === 0
  ) {
    // Structural-only triggers (the common planner path) avoid functional-group
    // analysis entirely. Named triggers fall back to the cached component
    // analysis so the check remains chemically authoritative.
    if (!primaryTriggerHasNameScope(rule)) {
      return ruleMatchesReactant(rule, precursorComponents[0], []);
    }

    const components = await componentsFromSmiles(precursorSmiles);
    const component = components[0];
    return Boolean(
      component &&
        (await ruleMatchesReactant(
          rule,
          component.smiles,
          component.functionalGroups,
        )),
    );
  }

  const components = await componentsFromSmiles(precursorSmiles);
  if (components.length === 0) return false;
  const assignments = await matchAllRuleReactants(rule, components);
  const wanted = reactantAssignmentKey(
    orderedReactants,
    rule.reactantRoleSymmetry === "unordered",
  );
  if (assignments.some((assignment) =>
    reactantAssignmentKey(
      assignment.map((component) => component.smiles),
      rule.reactantRoleSymmetry === "unordered",
    ) === wanted
  )) {
    return true;
  }

  // Some custom handlers model a reagent as a condition rather than as a
  // consumed structural partner. In that case the primary substrate still has
  // to satisfy the full forward rule.
  if (rule.transform.type === "customHandler" && orderedReactants.length === 1) {
    const component = components.find(
      (item) => item.smiles === orderedReactants[0],
    );
    return Boolean(
      component &&
        (await ruleMatchesReactant(
          rule,
          component.smiles,
          component.functionalGroups,
        )),
    );
  }

  return false;
}

async function validateForward(
  rule: ReactionRule,
  precursorSmiles: string,
  targetStructure: CanonicalStereoStructure,
  planning = false,
): Promise<ValidationResult | null> {
  // Reverse transforms reconstruct structural precursor candidates, but an
  // algebraically reversible SMARTS does not prove that the precursor lies
  // inside the forward reaction's chemical scope. During planning we keep the
  // fast direct replay, but only after the original trigger and executable
  // constraints approve that exact precursor set.
  if (planning) {
    const precursorComponents = splitReactionComponents(precursorSmiles);
    let expectedReactants = precursorComponents.length;
    if (rule.transform.type === "reactionSmarts") {
      const lhs = rule.transform.smarts.split(">>", 1)[0] ?? "";
      expectedReactants = templateCount(lhs);
    }

    if (
      precursorComponents.length > 0 &&
      (rule.transform.type === "customHandler" ||
        precursorComponents.length === expectedReactants)
    ) {
      const orders = precursorComponents.length > 1
        ? permutations(precursorComponents)
        : [precursorComponents];

      for (const orderedReactants of orders) {
        if (!(await planningReactantsAreEligible(
          rule,
          precursorSmiles,
          orderedReactants,
        ))) {
          continue;
        }

        const products = await executeForwardRule(rule, orderedReactants);
        const verified = await validateProductsAgainstTarget(
          rule,
          products,
          targetStructure,
          orderedReactants,
        );
        if (verified) return verified;
      }
    }
  }

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
    const verified = await validateProductsAgainstTarget(
      rule,
      products,
      targetStructure,
      orderedReactants,
    );
    if (verified) return verified;
  }

  return null;
}

function halideReverseProducts(
  productPattern: string,
  nucleophileProduct: string,
  chiral = false,
  halides: readonly ("Cl" | "Br" | "I")[] = ["Cl", "Br", "I"],
): string[] {
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
  if (!isSn2NucleophileId(nucleophile)) return [];
  const profile = SN2_NUCLEOPHILE_PROFILES[nucleophile].reverse;
  return halideReverseProducts(
    profile.productPattern,
    profile.nucleophileProduct,
    profile.chiral,
    profile.leavingHalogens,
  );
}

function sn1ReverseSmarts(nucleophile: string): string[] {
  if (!isSn1NucleophileId(nucleophile)) return [];
  const profile = SN1_NUCLEOPHILE_PROFILES[nucleophile].reverse;
  const output: string[] = [];

  for (const halide of ["Cl", "Br", "I"] as const) {
    output.push(
      `[C;H1;X4:1]([*:3])([*:4])${profile.productPattern}>>[C@H:1]([*:3])([*:4])${halide}.${profile.nucleophileProduct}`,
      `[C;H1;X4:1]([*:3])([*:4])${profile.productPattern}>>[C@@H:1]([*:3])([*:4])${halide}.${profile.nucleophileProduct}`,
      `[C;X4:1]${profile.productPattern}>>[C:1]${halide}.${profile.nucleophileProduct}`,
    );
  }

  return output;
}

function alcoholToHalideReverseSmarts(
  halide: "Cl" | "Br" | "I",
  invertStereo: boolean,
): string[] {
  if (!invertStereo) {
    return [`[C;X4:1]${halide}>>[C:1]O`];
  }

  return [
    `[C@H:1]([*:3])([*:4])${halide}>>[C@@H:1]([*:3])([*:4])O`,
    `[C@@H:1]([*:3])([*:4])${halide}>>[C@H:1]([*:3])([*:4])O`,
    `[C;X4:1]${halide}>>[C:1]O`,
  ];
}

function alcoholSn1ToHalideReverseSmarts(
  halide: "Cl" | "Br" | "I",
): string[] {
  // The planar carbocation erases the precursor alcohol configuration, so a
  // stereogenic target halide can arise from either alcohol enantiomer.
  return [
    `[C;H1;X4:1]([*:3])([*:4])${halide}>>[C@H:1]([*:3])([*:4])O`,
    `[C;H1;X4:1]([*:3])([*:4])${halide}>>[C@@H:1]([*:3])([*:4])O`,
    `[C;X4:1]${halide}>>[C:1]O`,
  ];
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
  if (mode === "alkeneReductiveCleavage") {
    return alkeneReductiveCleavageReactionSmarts();
  }

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
  const options = (rule.transform.options ?? {}) as Record<string, unknown>;
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

    if (mode === "alkeneHydrohalogenation") {
      const regioselectivity = options.regioselectivity;
      const halogen = options.halogen;
      if (
        (regioselectivity === "markovnikov" ||
          regioselectivity === "anti-markovnikov") &&
        (halogen === "Cl" || halogen === "Br" || halogen === "I")
      ) {
        output.push(
          ...alkeneHydrohalogenationReactionSmarts(regioselectivity, halogen)
            .map(reverseReactionSmarts)
            .filter((item): item is string => Boolean(item)),
        );
      }
    }

    if (mode === "halohydrin") {
      const halogen = options.halogen;
      if (halogen === "Cl" || halogen === "Br" || halogen === "I") {
        output.push(
          ...alkeneHalohydrinReactionSmarts(halogen)
            .map(reverseReactionSmarts)
            .filter((item): item is string => Boolean(item)),
        );
      }
    }

    if (mode === "haloether") {
      const halogen = options.halogen;
      if (halogen === "Cl" || halogen === "Br" || halogen === "I") {
        output.push(
          ...alkeneHaloetherReactionSmarts(halogen)
            .map(reverseReactionSmarts)
            .filter((item): item is string => Boolean(item)),
        );
      }
    }

    if (mode === "alkoxymercuration") {
      output.push(
        ...alkoxymercurationReactionSmarts()
          .map(reverseReactionSmarts)
          .filter((item): item is string => Boolean(item)),
      );
    }

    if (
      mode === "synDihydroxylation" ||
      mode === "antiDihydroxylation"
    ) {
      // For the common H1/H1 vicinal-diol case, explicitly propose both alkene
      // geometries. The previous achiral C=C reverse product discarded E/Z,
      // which meant a later reverse Lindlar/dissolving-metal step could not
      // recognize the alkene even though the forward synthesis was valid.
      //
      // We deliberately propose BOTH E and Z here. validateForward() replays
      // the original syn/anti dihydroxylation rule and keeps only the geometry
      // that actually regenerates the requested stereochemical target.
      output.push(
        "[*:3][C;H1:1]([OH])-[C;H1:2]([OH])[*:4]>>[*:3]/[C:1]=[C:2]\\[*:4]",
        "[*:3][C;H1:1]([OH])-[C;H1:2]([OH])[*:4]>>[*:3]/[C:1]=[C:2]/[*:4]",
        // Fallback for substitution patterns that do not define two alkene
        // geometries. Forward replay still verifies the chemistry.
        "[C:1]([OH])[C:2]([OH])>>[C:1]=[C:2]",
      );
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
      mode === "alkeneReductiveCleavage" ||
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
      const substrateClass = String(options.substrateClass ?? "");
      switch (substrateClass) {
        case "aldehyde":
          output.push("[#6:3][CH2:1][OH:2]>>[#6:3][CH:1]=[O:2]");
          break;
        case "ketone":
          output.push(
            "[#6:3][CH:1]([OH:2])[#6:4]>>[#6:3][C:1](=[O:2])[#6:4]",
          );
          break;
        case "carboxylic-acid":
          output.push("[CH2:1][OH:2]>>[C:1](=[O:2])O");
          break;
        case "acid-chloride":
          output.push("[CH2:1][OH:2]>>[C:1](=[O:2])Cl");
          break;
        case "amide":
          output.push("[CH2:1][N:3]>>[C:1](=O)[N:3]");
          break;
        default:
          // Generic fallback is intentionally limited to ordinary aldehyde/ketone
          // reductions. Family/folder names never determine chemistry here.
          output.push(
            "[#6:3][CH2:1][OH:2]>>[#6:3][CH:1]=[O:2]",
            "[#6:3][CH:1]([OH:2])[#6:4]>>[#6:3][C:1](=[O:2])[#6:4]",
          );
      }
    }

    if (mode === "carbonylToAlkane") {
      const substrateClass = String(options.substrateClass ?? "");
      if (substrateClass === "aldehyde") {
        output.push("[#6:3][CH3:1]>>[#6:3][CH:1]=O");
      } else if (substrateClass === "ketone") {
        output.push("[#6:3][CH2:1][#6:4]>>[#6:3][C:1](=O)[#6:4]");
      }
    }
  }

  if (handler === "ring" && mode === "epoxideOpening") {
    output.push("[C:1](O)[C:3][OH:2]>>[C:1]1[O:2][C:3]1");
  }

  if (handler === "ring" && mode === "intramolecularWilliamson") {
    const ringSize = Number(options.ringSize ?? 0);
    if (Number.isInteger(ringSize) && ringSize >= 3 && ringSize <= 7) {
      const carbonMaps = Array.from(
        { length: ringSize - 1 },
        (_, index) => index + 2,
      );
      const cyclicCarbons = carbonMaps.map((map) => `[CH2:${map}]`).join("");
      const openChain = carbonMaps.map((map) => `[CH2:${map}]`).join("-");

      // Br/Cl/I are all legitimate Williamson precursors. Enumerate them here
      // because automatic reversal of a ring-closure SMARTS cannot recreate an
      // atom that disappeared as the leaving group.
      for (const halogen of ["Br", "Cl", "I"] as const) {
        output.push(
          `[O:1]1${cyclicCarbons}1>>[OH:1]-${openChain}${halogen}`,
        );
      }
    }
  }

  if (handler === "rearrangement" && mode === "pinacol") {
    // Reverse both the hydride-shift (ring-retaining ketone) and cyclic
    // ring-contraction branches. Forward replay below rejects precursor sets
    // that do not regenerate the requested target.
    output.push(
      "[C:1](=[O:2])-[C:3]>>[C:1]([OH:2])-[C:3]([OH])",
      "[C;R:5]-[C;R:3]-[C:1](=[O:2])>>[C;R:5]-[C:1]([OH:2])-[C:3]([OH])",
    );
  }

  if (handler === "pericyclic" && mode === "dielsAlder") {
    output.push(
      "[C:1]1-[C:2]=[C:3]-[C:4]-[C:5]-[C:6]-1>>[C:1]=[C:2]-[C:3]=[C:4].[C:5]=[C:6]",
    );
  }

  if (handler === "elimination") {
    output.push(...eliminationReverseSmarts(String(options.leavingGroup ?? "")));
  }

  if (handler === "radical" && mode === "alkaneHalogenation") {
    const halogen = options.halogen;
    if (halogen === "Cl" || halogen === "Br") {
      // Replacing the C-X bond with an implicit C-H is the exact reverse
      // constitution of monohalogenation. Forward replay through the radical
      // handler verifies that the reconstructed alkane genuinely regenerates
      // the requested haloalkane.
      output.push(`[C;X4:1]${halogen}>>[C:1]`);
    }
  }

  if (handler === "substitution") {
    if (mode === "aromaticEas") {
      const electrophile = String(options.electrophile ?? "");
      // EAS is intrinsically easy to propose backwards: remove the installed
      // electrophile and restore the aromatic hydrogen. Forward replay below
      // is the authority on whether the proposed precursor actually regenerates
      // the requested regioisomer, so these templates do not invent chemistry.
      if (electrophile === "nitro") {
        output.push("[c:1][N+](=O)[O-]>>[cH:1]");
      } else if (electrophile === "sulfonic-acid") {
        output.push("[c:1]S(=O)(=O)O>>[cH:1]");
      } else if (electrophile === "bromo") {
        output.push("[c:1]Br>>[cH:1]");
      } else if (electrophile === "chloro") {
        output.push("[c:1]Cl>>[cH:1]");
      } else if (electrophile === "iodo") {
        output.push("[c:1]I>>[cH:1]");
      } else if (electrophile === "fluoro") {
        output.push("[c:1]F>>[cH:1]");
      }
    }

    if (mode === "sn2" || mode === "alkylHalideSubstitution") {
      output.push(...sn2ReverseSmarts(String(options.nucleophile ?? "")));
    }

    if (mode === "sn1") {
      output.push(...sn1ReverseSmarts(String(options.nucleophile ?? "")));
    }

    if (mode === "alcoholToHalide" || mode === "alcoholSn1ToHalide") {
      const halide =
        options.halide === "chloride"
          ? "Cl"
          : options.halide === "bromide"
            ? "Br"
            : options.halide === "iodide"
              ? "I"
              : null;

      if (halide) {
        if (mode === "alcoholSn1ToHalide") {
          output.push(...alcoholSn1ToHalideReverseSmarts(halide));
        } else {
          output.push(
            ...alcoholToHalideReverseSmarts(
              halide,
              options.stereochemistry === "invert",
            ),
          );
        }
      }
    }

    if (mode === "vicinalDiolToDihalide") {
      const halide =
        options.halide === "chloride"
          ? "Cl"
          : options.halide === "bromide"
            ? "Br"
            : options.halide === "iodide"
              ? "I"
              : null;

      if (halide) {
        output.push(
          `[C:1](${halide})-[C:3](${halide})>>[C:1](O)-[C:3](O)`,
        );
      }
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

function explicitAlkyneReverseTransforms(
  rule: ReactionRule,
): ReverseTransform[] | null {
  /*
   * Some alkyne-forming reactions are NOT safely reversible by simply swapping
   * the two sides of the forward SMARTS. Their forward rules remove leaving
   * groups that are not atom-mapped into the product. When such a SMARTS is
   * naively reversed, RDKit reconstructs those atoms as wildcard "*" atoms
   * rather than actual Br/Cl/I atoms.
   *
   * Example:
   *   R-C#CH + R'-Br -> R-C#C-R'
   *
   * Naive reverse:
   *   R-C#C-R' -> R-C#CH + R'-*
   *
   * That wildcard precursor can never match an explicitly supplied
   * 1-bromopropane starting material, so a perfectly valid acetylide synthesis
   * becomes invisible to bidirectional planning.
   *
   * These explicit disconnections encode the actual synthetic chemistry while
   * still relying on validateForward() below as the final authority.
   */

  if (rule.reactionClass === "acetylide SN2 alkylation") {
    const halogens = ["Br", "Cl", "I"];
    return halogens.flatMap((halogen) => [
      {
        // Cleave either alkyl side of an internal alkyne when that side could
        // have originated from a methyl/primary alkyl halide. The same SMARTS
        // naturally enumerates both orientations of an unsymmetrical alkyne.
        smarts:
          `[*:4][C:1]#[C:2]-[C;X4;H2,H3:3]>>` +
          `[*:4][C:1]#[CH:2].[${halogen}]-[C:3]`,
        source: "reversed-reaction-smarts" as const,
      },
      {
        // Mono-alkylation of acetylene itself: the product is a TERMINAL alkyne,
        // so its C:1 carries no heavy-atom substituent and the pattern above
        // (which needs [*:4]) cannot match it.
        smarts:
          `[CH:1]#[C:2]-[C;X4;H2,H3:3]>>` +
          `[CH:1]#[CH:2].[${halogen}]-[C:3]`,
        source: "reversed-reaction-smarts" as const,
      },
    ]);
  }

  if (rule.id === "alkyne-synthesis-double-dehydrohalogenation-vicinal") {
    const halogens = ["Br", "Cl", "I"];
    return halogens.flatMap((halogen) => [
      {
        // Terminal alkyne:
        //   R-C#CH  ->  R-CH(X)-CH2X
        //
        // Explicit H counts prevent browser RDKit from satisfying the new
        // single-bond valence with a carbanion such as [CH-]X.
        smarts:
          `[*:3][C:1]#[CH:2]>>` +
          `[*:3][CH:1]([${halogen}])-[CH2:2][${halogen}]`,
        source: "reversed-reaction-smarts" as const,
      },
      {
        // Internal alkyne:
        //   R-C#C-R'  ->  R-CH(X)-CH(X)-R'
        smarts:
          `[*:3][C:1]#[C:2][*:4]>>` +
          `[*:3][CH:1]([${halogen}])-[CH:2]([${halogen}])[*:4]`,
        source: "reversed-reaction-smarts" as const,
      },
    ]);
  }

  if (rule.id === "alkyne-synthesis-double-dehydrohalogenation-geminal") {
    const halogens = ["Br", "Cl", "I"];
    return halogens.flatMap((halogen) => [
      {
        // Terminal alkyne:
        //   R-C#CH -> R-CH2-CHX2
        smarts:
          `[*:3][C:1]#[CH:2]>>` +
          `[*:3][CH2:1]-[CH:2]([${halogen}])[${halogen}]`,
        source: "reversed-reaction-smarts" as const,
      },
      {
        // Internal alkyne, geminal dihalide on the right alkyne carbon.
        smarts:
          `[*:3][C:1]#[C:2][*:4]>>` +
          `[*:3][CH2:1]-[C:2]([${halogen}])([${halogen}])[*:4]`,
        source: "reversed-reaction-smarts" as const,
      },
      {
        // Internal alkyne, equivalent alternative with the geminal center on
        // the left alkyne carbon.
        smarts:
          `[*:3][C:1]#[C:2][*:4]>>` +
          `[*:3][C:1]([${halogen}])([${halogen}])-[CH2:2][*:4]`,
        source: "reversed-reaction-smarts" as const,
      },
    ]);
  }

  return null;
}

function reverseTransformsForRule(rule: ReactionRule): ReverseTransform[] {
  const explicitAlkyneTransforms = explicitAlkyneReverseTransforms(rule);
  if (explicitAlkyneTransforms) {
    return explicitAlkyneTransforms;
  }

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
  options: RetrosynthesisPredictionOptions = {},
): Promise<RetrosynthesisPathway> {
  const precursorComponents = splitReactionComponents(precursorSmiles);
  const precursorLabel = options.planning
    ? precursorComponents.length > 1
      ? "Precursor set"
      : "Precursor"
    : await getComponentLabel(precursorComponents, "Precursor");
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
    planningCost:
      (rule.planningCost ?? 100) +
      (validation.selectivityAssessment?.planningPenalty ?? 0),
    display: rule.display ?? null,
    course: getRuleCourse(rule),
    chapter: getRuleChapter(rule),
    mechanism: rule.mechanism ?? null,
    reactionClass: rule.reactionClass ?? null,
    purpose: rule.purpose ?? null,
    selectivity: rule.selectivity ?? [],
    selectivityProfile: rule.selectivityProfile ?? null,
    selectivityAssessment: validation.selectivityAssessment,
    limitations: [
      ...(rule.limitations ?? []),
      ...(validation.confidence === "connectivity-confirmed"
        ? [
            "The proposed precursors reproduce the target connectivity under the forward rule, but the current forward model does not fully specify the target stereochemistry.",
          ]
        : []),
      ...(validation.productMixture
        ? [
            `Forward replay produces a ${validation.productMixture.label.toLowerCase()}; one member is not treated as an enantiopure product.`,
          ]
        : []),
    ],
    confidence: validation.confidence,
    source,
    alternativeRoutes: [],
    productMixture: validation.productMixture,
    retrosynthesisTier:
      rule.retrosynthesis?.tier && rule.retrosynthesis.tier !== "disabled"
        ? rule.retrosynthesis.tier
        : "standard",
    retrosynthesisGroup: rule.retrosynthesis?.group ?? null,
  };
}

function retrosynthesisTierRank(
  tier: RetrosynthesisPathway["retrosynthesisTier"],
): number {
  if (tier === "preferred") return 0;
  if (tier === "secondary") return 2;
  return 1;
}

function compareRetrosynthesisPathways(
  a: RetrosynthesisPathway,
  b: RetrosynthesisPathway,
): number {
  const confidenceA = a.confidence === "confirmed" ? 0 : 1;
  const confidenceB = b.confidence === "confirmed" ? 0 : 1;
  if (confidenceA !== confidenceB) return confidenceA - confidenceB;

  const tierA = retrosynthesisTierRank(a.retrosynthesisTier);
  const tierB = retrosynthesisTierRank(b.retrosynthesisTier);
  if (tierA !== tierB) return tierA - tierB;

  if (a.planningCost !== b.planningCost) {
    return a.planningCost - b.planningCost;
  }

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
    (await canonicalizeReactionSmiles(pathway.precursorSmiles))?.isomeric ??
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
      selectivityProfile: pathway.selectivityProfile,
      display: pathway.display,
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
  options: RetrosynthesisPredictionOptions = {},
): Promise<RetrosynthesisPathway[]> {
  const signal = options.signal;
  if (searchCancelled(signal)) return [];

  const targetComponents = splitReactionComponents(targetSmiles);
  if (targetComponents.length === 0) return [];

  const targetCanonical = await canonicalizeReactionSmiles(targetSmiles);
  if (!targetCanonical || searchCancelled(signal)) return [];

  const targetLabel = options.planning
    ? "Target intermediate"
    : await getComponentLabel(targetComponents, "Target product");
  const pathways: RetrosynthesisPathway[] = [];
  const resultBudget = Math.max(
    1,
    Math.min(
      MAX_TOTAL_RESULTS * 2,
      options.maxResults ?? (options.planning ? 36 : MAX_TOTAL_RESULTS * 2),
    ),
  );

  // Build the target molecules once. They are reused by the product-side SMARTS
  // gate for hundreds of catalog rules instead of being reparsed per rule.
  const rdkit = await getRDKit();
  const targetMolecules = targetComponents.map((component) => rdkit.get_mol(component));
  if (targetMolecules.some((molecule) => !molecule)) {
    for (const molecule of targetMolecules) molecule?.delete?.();
    return [];
  }

  // Planning budget: count DISTINCT RULES that produced a verified disconnection, not raw
  // precursor sets. Transforms run most-specific first, so a raw-count budget fills up on
  // the many variants of a few specific rules (halide choices, ring positions) and silently
  // drops generic but valid ones (partial reductions, functional-group interconversions).
  const rulesWithResults = new Map<string, number>();
  const budgetReached = () =>
    options.planning ? rulesWithResults.size >= resultBudget : pathways.length >= resultBudget;

  const transformMatchCache = new Map<string, number | null>();
  const reverseIndex = getReverseRuleIndex(rules);
  const ruleScanLimit = Number.isFinite(options.maxRulesScanned)
    ? Math.max(1, Math.min(reverseIndex.length, Math.floor(options.maxRulesScanned!)))
    : reverseIndex.length;
  const indexedRules = reverseIndex.slice(0, ruleScanLimit);

  type ReverseWorkItem = {
    rule: ReactionRule;
    transform: ReverseTransform;
    specificity: number;
    order: number;
  };
  const matchingTransforms: ReverseWorkItem[] = [];

  try {
    // Phase 1 is deliberately cheap: screen the whole allowed catalog against
    // the product-side SMARTS before executing any reverse reaction. This lets
    // a highly relevant rule late in a family (for example amine diazotization)
    // reach the front of the expensive work queue instead of waiting behind
    // unrelated generic transforms.
    let workOrder = 0;
    for (let ruleIndex = 0; ruleIndex < indexedRules.length; ruleIndex += 1) {
      if (searchCancelled(signal)) return [];
      if (ruleIndex > 0 && ruleIndex % 24 === 0 && !(await yieldToBrowser(signal))) {
        return [];
      }

      const { rule, transforms } = indexedRules[ruleIndex];
      for (const transform of transforms) {
        if (searchCancelled(signal)) return [];

        let specificity = transformMatchCache.get(transform.smarts);
        if (specificity === undefined) {
          specificity = reverseTransformMatchSpecificity(
            rdkit,
            targetMolecules,
            transform,
          );
          transformMatchCache.set(transform.smarts, specificity);
        }
        if (specificity === null) continue;

        matchingTransforms.push({
          rule,
          transform,
          specificity,
          order: workOrder,
        });
        workOrder += 1;
      }
    }

    matchingTransforms.sort(
      (a, b) =>
        b.specificity - a.specificity ||
        (a.rule.planningCost ?? 100) - (b.rule.planningCost ?? 100) ||
        a.order - b.order,
    );

    // Under a transform cap, run the best transform of EVERY matching rule before any rule's
    // second transform. Otherwise the cap is spent on the halide/ring-position variants of a
    // few highly specific rules and generic but valid rules (partial reductions such as
    // Lindlar, functional-group interconversions) are never executed at all.
    if (Number.isFinite(options.maxTransformsExecuted)) {
      const firstPass: ReverseWorkItem[] = [];
      const rest: ReverseWorkItem[] = [];
      const ruleSeen = new Set<string>();
      for (const item of matchingTransforms) {
        if (ruleSeen.has(item.rule.id)) rest.push(item);
        else {
          ruleSeen.add(item.rule.id);
          firstPass.push(item);
        }
      }
      matchingTransforms.splice(0, matchingTransforms.length, ...firstPass, ...rest);
    }

    // Phase 2 does the expensive reverse execution and exact forward replay only
    // for transforms that can actually occur in the drawn target. Interactive
    // planning may intentionally execute only the highest-specificity transforms
    // first; the deep fallback removes this cap.
    const transformBudget = Number.isFinite(options.maxTransformsExecuted)
      ? Math.max(1, Math.min(
          matchingTransforms.length,
          Math.floor(options.maxTransformsExecuted!),
        ))
      : matchingTransforms.length;

    for (let workIndex = 0; workIndex < transformBudget; workIndex += 1) {
      if (searchCancelled(signal)) return [];
      if (workIndex > 0 && workIndex % 6 === 0 && !(await yieldToBrowser(signal))) {
        return [];
      }

      const { rule, transform } = matchingTransforms[workIndex];
      // A rule already at its planning cap cannot add results; skip its remaining transforms.
      if (options.planning && (rulesWithResults.get(rule.id) ?? 0) >= MAX_RESULTS_PER_RULE) continue;
      let precursorCandidates: string[] = [];

      try {
        precursorCandidates = await runReverseTransform(
          targetComponents,
          transform,
          rule,
        );
      } catch (error) {
        console.error(`[PocketChem:Retro] Skipping reverse transform for ${rule.id}.`, {
          smarts: transform.smarts,
          error,
        });
        continue;
      }

      for (const precursorCandidate of precursorCandidates) {
        if (searchCancelled(signal)) return [];
        if (options.planning && (rulesWithResults.get(rule.id) ?? 0) >= MAX_RESULTS_PER_RULE) break;

        try {
          const validation = await validateForward(
            rule,
            precursorCandidate,
            targetCanonical,
            Boolean(options.planning),
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
              options,
            ),
          );
          rulesWithResults.set(rule.id, (rulesWithResults.get(rule.id) ?? 0) + 1);
        } catch (error) {
          console.error(`[PocketChem:Retro] Skipping invalid candidate generated by ${rule.id}.`, {
            precursorCandidate,
            error,
          });
        }

        if (budgetReached()) break;
      }

      if (budgetReached()) break;
    }
  } finally {
    for (const molecule of targetMolecules) molecule?.delete?.();
  }

  return dedupeAndRank(pathways);
}
