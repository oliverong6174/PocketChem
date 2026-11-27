import type {
  CompatibilityWarning,
  ReactionEngineIssue,
  MultistepSynthesisRoute,
  ReactionPathway,
  ReactionProductMixtureKind,
  ReactionRule,
  ReactionSelectivityAssessment,
  RouteCompatibility,
  RouteSelectivity,
  RouteVerification,
  StepSelectivityFinding,
  SynthesisStep,
} from "../reactionTypes";
import { resolveReactantRequirement } from "../profiles/reactants";
import { assessRouteCompatibility, assessStepCompatibility } from "./compatibility";
import { describeRuleRoles, type StepRoleProfile } from "./catalystRoles";
import { describeStepConditions, type StepConditionProfile } from "./conditionModel";
import { forwardStepFromPathway } from "./multistepSynthesis";
import { predictReactionPathwaysFromRules } from "./reactionEngine";
import { splitReactionComponents } from "./reactionInput";
import { explainNoReactionForRule } from "./noReaction";
import { ReactantRoleIndex } from "./reactantRoleIndex";
import { verifyMultistepRoute } from "./routeVerification";
import { assessRouteSelectivity, classifyStepSelectivity } from "./selectivityAssessment";
import {
  applyStep,
  createPoolState,
  liveLots,
  lotById,
  supplyAccounts,
  type PoolLot,
  type PoolState,
  type ProductInput,
  type SupplyAccount,
  type SuppliedMaterial,
} from "./speciesPool";
import { canonicalizeStereoStructure } from "./stereochemistry";

/**
 * Multi-material reaction workspace (Stage 9B-2A).
 *
 * The workspace is an explicit shelf of isolated compounds (see speciesPool.ts). A step names
 * the rule and the exact lots it consumes; the existing reaction engine runs that rule on
 * only those structures. Nothing is inferred from "the current molecule":
 *
 * - A step that does not produce a product (no reaction, needs input, unsupported, engine
 *   failure, ambiguous outcome) consumes nothing and creates nothing. Every lot stays
 *   exactly as it was.
 * - A step can only consume lots that are live. A lot another step already consumed, or a
 *   product of a step that never happened, cannot be used.
 * - When the engine offers several distinct outcomes the step stops with "needs-selection"
 *   and leaves the shelf untouched until the caller picks one; no outcome is called major
 *   unless the rule's own numeric estimate says so.
 * - Retained lots, products and coproducts all stay on the shelf. Copies are qualitative
 *   availability counts, not amounts.
 *
 * It adds no chemistry: every product comes from predictReactionPathwaysFromRules.
 */

export type WorkspaceStepStatus =
  | "reaction"
  | "needs-selection"
  | "needs-input"
  | "no-reaction"
  | "unsupported"
  | "unknown-rule"
  | "execution-error"
  | "invalid-selection"
  | "dependency-failed";

export type WorkspaceOutcome = {
  index: number;
  pathwayId: string;
  productSmiles: string;
  productComponents: string[];
  productLabel: string;
  productStatus: ReactionPathway["productStatus"];
  explanation: string;
  limitations: string[];
  selectivity: ReactionSelectivityAssessment | null;
  /** Advisory classification; "single-outcome" means unranked, never "major". */
  selectivityFinding: StepSelectivityFinding;
  mixture: {
    kind: ReactionProductMixtureKind;
    groupId: string;
    label: string;
    memberCount: number;
    /** Racemic members share one outcome; other mixtures are separate alternatives. */
    collapsed: boolean;
    memberSmiles: string[];
  } | null;
};

export type WorkspaceStep = {
  /** 1-based position among every attempt, successful or not. */
  attempt: number;
  /** Position among committed steps (the pool step number), or null if nothing happened. */
  committedStep: number | null;
  ruleId: string;
  title: string;
  reagentLabel: string;
  reagentNote: string;
  status: WorkspaceStepStatus;
  explanation: string;
  /** Lots the caller asked to use. */
  requestedLotIds: string[];
  /** The outcome index the caller asked for, if any. */
  requestedOutcome: number | null;
  /** Lots actually consumed (empty unless status is "reaction"). */
  consumedLotIds: string[];
  producedLotIds: string[];
  /** Live lots that were not part of this step and stay on the shelf. */
  retainedLotIds: string[];
  /** Every distinct outcome the engine offered, bounded by maxOutcomes. */
  outcomes: WorkspaceOutcome[];
  omittedOutcomes: number;
  selectedOutcome: number | null;
  selectedBy: "only-option" | "user" | null;
  /** Labels of structural partners the rule still needs. */
  missingPartners: string[];
  issues: string[];
  /** Advisory; null means the rule declares no conditions (unassessed, not compatible). */
  compatibility: CompatibilityWarning[] | null;
  /**
   * Catalyst / reagent roles of the rule, captured when the step was attempted. Absent in
   * workspaces saved before roles existed (shown as unassessed, never rewritten).
   */
  roles?: StepRoleProfile;
  /** Declared conditions, in-vessel intolerances and the isolation boundary, captured with the step. */
  conditions?: StepConditionProfile;
};

/**
 * What the user did, in order. Lot ids are assigned deterministically, so replaying the actions
 * on the same rules rebuilds the same workspace (see replayActions). Script-only
 * "dependency-failed" entries are not actions: they were never requested of the engine.
 */
export type WorkspaceAction =
  | { kind: "material"; smiles: string }
  | { kind: "step"; request: WorkspaceStepRequest };

export type ReactionWorkspace = {
  pool: PoolState;
  materials: SuppliedMaterial[];
  history: WorkspaceStep[];
  /** One public step record per committed step, parallel to pool.steps. */
  records: Array<{ step: SynthesisStep; reactantLotIds: string[] }>;
  actions: WorkspaceAction[];
};

export type WorkspaceStepRequest = {
  ruleId: string;
  lotIds: string[];
  /** Index into the offered outcomes. Required when the engine offers more than one. */
  outcome?: number;
};

export type WorkspaceOptions = {
  /** Most distinct outcomes kept for one step. Default 8. */
  maxOutcomes?: number;
};

const DEFAULT_MAX_OUTCOMES = 8;

// ---------------------------------------------------------------------------------------
// Workspace creation
// ---------------------------------------------------------------------------------------

async function toMaterial(smiles: string): Promise<SuppliedMaterial | null> {
  try {
    const structure = await canonicalizeStereoStructure(smiles);
    return structure
      ? {
          smiles,
          canonical: structure.isomeric,
          connectivity: structure.connectivity,
          hasSpecifiedStereo: structure.hasSpecifiedStereo,
        }
      : null;
  } catch {
    return null;
  }
}

export type CreateWorkspaceResult =
  | { ok: true; workspace: ReactionWorkspace }
  | { ok: false; problems: string[] };

/**
 * One supplied material per connected component of each input, one copy each. Entering the
 * same molecule twice supplies two copies; nothing is duplicated implicitly.
 */
export async function createWorkspace(inputs: readonly string[]): Promise<CreateWorkspaceResult> {
  const problems: string[] = [];
  const materials: SuppliedMaterial[] = [];
  for (const input of inputs) {
    for (const component of splitReactionComponents(input)) {
      const material = await toMaterial(component);
      if (material) materials.push(material);
      else problems.push(`Starting material "${component}" could not be parsed.`);
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  if (materials.length === 0) return { ok: false, problems: ["No starting material was provided."] };
  return {
    ok: true,
    workspace: {
      pool: createPoolState(materials, 1),
      materials,
      history: [],
      records: [],
      actions: materials.map((material) => ({ kind: "material" as const, smiles: material.smiles })),
    },
  };
}

/** Adds one more supplied material (a new lot) without disturbing existing lots or history. */
export async function addMaterial(
  workspace: ReactionWorkspace,
  smiles: string,
): Promise<{ ok: true; workspace: ReactionWorkspace; lotIds: string[] } | { ok: false; problems: string[] }> {
  const parts = splitReactionComponents(smiles);
  if (parts.length === 0) return { ok: false, problems: ["No molecule was provided."] };
  const added: SuppliedMaterial[] = [];
  for (const part of parts) {
    const material = await toMaterial(part);
    if (!material) return { ok: false, problems: [`Starting material "${part}" could not be parsed.`] };
    added.push(material);
  }
  const lots: PoolLot[] = added.map((material, offset) => {
    const startIndex = workspace.materials.length + offset;
    return {
      id: `sm${startIndex}#1`,
      smiles: material.smiles,
      canonical: material.canonical,
      connectivity: material.connectivity,
      hasSpecifiedStereo: material.hasSpecifiedStereo,
      stereoMixture: null,
      stereoMixtureMembers: null,
      role: "supplied",
      availability: "live",
      provenance: { kind: "supplied", startIndex, copy: 1 },
      lineage: [startIndex],
      consumedByStep: null,
    };
  });
  return {
    ok: true,
    lotIds: lots.map((lot) => lot.id),
    workspace: {
      ...workspace,
      actions: [...workspace.actions, ...added.map((material) => ({ kind: "material" as const, smiles: material.smiles }))],
      materials: [...workspace.materials, ...added],
      pool: {
        ...workspace.pool,
        lots: [...workspace.pool.lots, ...lots],
        suppliedCopies: [...workspace.pool.suppliedCopies, ...added.map(() => 1)],
      },
    },
  };
}

// ---------------------------------------------------------------------------------------
// Inventory view
// ---------------------------------------------------------------------------------------

export type WorkspaceInventory = {
  live: PoolLot[];
  consumed: PoolLot[];
  supply: SupplyAccount[];
};

export function workspaceInventory(workspace: ReactionWorkspace): WorkspaceInventory {
  return {
    live: liveLots(workspace.pool),
    consumed: workspace.pool.lots.filter((lot) => lot.availability === "consumed"),
    supply: supplyAccounts(workspace.pool),
  };
}

// ---------------------------------------------------------------------------------------
// Step execution
// ---------------------------------------------------------------------------------------

/**
 * Molecules a step consumes. A partner with `equivalents: n` consumes n molecules; the engine
 * would duplicate a single drawn structure internally, which here would create material, so
 * the workspace asks for n lots (for example two copies of an alcohol for an acetal).
 */
export function structuralArity(rule: ReactionRule): { arity: number; partnerLabels: string[] } {
  const partnerLabels: string[] = [];
  for (const requirement of (rule.additionalReactants ?? []).map(resolveReactantRequirement)) {
    if (requirement.supplyMode === "auto" || requirement.supplyMode === "condition-only") continue;
    const copies = Math.max(1, Math.floor(requirement.equivalents ?? 1));
    for (let copy = 0; copy < copies; copy += 1) partnerLabels.push(requirement.label);
  }
  return { arity: 1 + partnerLabels.length, partnerLabels };
}

function baseStep(
  workspace: ReactionWorkspace,
  request: WorkspaceStepRequest,
  rule: ReactionRule | undefined,
): WorkspaceStep {
  return {
    attempt: workspace.history.length + 1,
    committedStep: null,
    ruleId: request.ruleId,
    title: rule?.title ?? "Unknown reaction condition",
    reagentLabel: rule?.reagents ?? request.ruleId,
    reagentNote: rule?.reagentNote ?? "",
    status: "execution-error",
    explanation: "",
    requestedLotIds: [...request.lotIds],
    requestedOutcome: request.outcome ?? null,
    consumedLotIds: [],
    producedLotIds: [],
    retainedLotIds: liveLots(workspace.pool).map((lot) => lot.id),
    outcomes: [],
    omittedOutcomes: 0,
    selectedOutcome: null,
    selectedBy: null,
    missingPartners: [],
    issues: [],
    compatibility: null,
    ...(rule ? (() => { const roles = describeRuleRoles(rule); return { roles, conditions: describeStepConditions(rule, roles) }; })() : {}),
  };
}

function requestOf(step: WorkspaceStep): WorkspaceStepRequest {
  return step.requestedOutcome === null
    ? { ruleId: step.ruleId, lotIds: [...step.requestedLotIds] }
    : { ruleId: step.ruleId, lotIds: [...step.requestedLotIds], outcome: step.requestedOutcome };
}

/** Records a step that did not change the shelf. */
function withFailure(
  workspace: ReactionWorkspace,
  step: WorkspaceStep,
  status: WorkspaceStepStatus,
  explanation: string,
  extra: Partial<WorkspaceStep> = {},
  recordAction = true,
): { workspace: ReactionWorkspace; step: WorkspaceStep } {
  const recorded: WorkspaceStep = { ...step, ...extra, status, explanation };
  return {
    workspace: {
      ...workspace,
      history: [...workspace.history, recorded],
      actions: recordAction ? [...workspace.actions, { kind: "step", request: requestOf(step) }] : workspace.actions,
    },
    step: recorded,
  };
}

type PathwayMatch = {
  pathway: ReactionPathway;
  reactantLotIds: string[];
  products: ProductInput[];
  productComponents: string[];
  canonicalKey: string;
  connectivityKey: string;
};

async function matchPathways(
  pathways: ReactionPathway[],
  lots: PoolLot[],
  presets: Set<string>,
  structureOf: (smiles: string) => Promise<SuppliedMaterial | null>,
): Promise<PathwayMatch[]> {
  const matches: PathwayMatch[] = [];
  for (const pathway of pathways) {
    if (!pathway.productSmiles) continue;
    const unused = [...lots];
    const reactantLotIds: string[] = [];
    let matched = true;
    for (const component of pathway.reactantComponents) {
      const structure = await structureOf(component);
      const at = structure ? unused.findIndex((lot) => lot.canonical === structure.canonical) : -1;
      if (at >= 0) {
        reactantLotIds.push(unused.splice(at, 1)[0].id);
      } else if (structure && presets.has(structure.canonical)) {
        reactantLotIds.push("");
      } else {
        matched = false;
        break;
      }
    }
    // The rule must use exactly the selected lots; a pathway that ignores one is a
    // different, smaller reaction.
    if (!matched || unused.length > 0) continue;

    const productComponents = splitReactionComponents(pathway.productSmiles);
    const products: ProductInput[] = [];
    for (let position = 0; position < productComponents.length; position += 1) {
      const structure = await structureOf(productComponents[position]);
      if (!structure) {
        products.length = 0;
        break;
      }
      products.push({ ...structure, role: position === 0 ? "primary" : "coproduct" });
    }
    if (products.length === 0) continue;
    matches.push({
      pathway,
      reactantLotIds,
      products,
      productComponents,
      canonicalKey: products.map((item) => item.canonical).sort().join("."),
      connectivityKey: products.map((item) => item.connectivity).sort().join("."),
    });
  }
  return matches;
}

/** Distinct outcomes: racemic members collapse to one representative, duplicates merge. */
function collapseOutcomes(matches: PathwayMatch[]): Array<PathwayMatch & { collapsedMembers: string[] }> {
  const out: Array<PathwayMatch & { collapsedMembers: string[] }> = [];
  const racemic = new Map<string, number>();
  const seen = new Set<string>();
  for (const match of matches) {
    const mixture = match.pathway.productMixture;
    if (mixture?.kind === "racemic") {
      const at = racemic.get(mixture.groupId);
      if (at !== undefined) {
        const kept = out[at];
        if (!kept.collapsedMembers.includes(match.pathway.productSmiles as string)) {
          kept.collapsedMembers.push(match.pathway.productSmiles as string);
        }
        if (mixture.memberIndex < (kept.pathway.productMixture?.memberIndex ?? Infinity)) {
          // Keep the lowest-index member as the representative, as the sequential executor does.
          out[at] = { ...match, collapsedMembers: kept.collapsedMembers };
        }
        continue;
      }
      racemic.set(mixture.groupId, out.length);
    }
    if (seen.has(match.canonicalKey) && mixture?.kind !== "racemic") continue;
    seen.add(match.canonicalKey);
    out.push({ ...match, collapsedMembers: [match.pathway.productSmiles as string] });
  }
  return out;
}

export async function executeWorkspaceStep(
  workspace: ReactionWorkspace,
  request: WorkspaceStepRequest,
  rules: ReactionRule[],
  options: WorkspaceOptions = {},
): Promise<{ workspace: ReactionWorkspace; step: WorkspaceStep }> {
  const rule = rules.find((item) => item.id === request.ruleId);
  const step = baseStep(workspace, request, rule);

  if (!rule) {
    return withFailure(
      workspace,
      step,
      "unknown-rule",
      `Reaction condition "${request.ruleId}" is not in the reaction registry, so nothing was evaluated and no material changed.`,
    );
  }
  if (rule.transform.type === "conceptOnly") {
    return withFailure(workspace, step, "unsupported", rule.transform.reason);
  }

  // 1. The selection must name distinct, live lots.
  if (request.lotIds.length === 0) {
    return withFailure(workspace, step, "invalid-selection", "No molecule was selected for this reaction.");
  }
  if (new Set(request.lotIds).size !== request.lotIds.length) {
    return withFailure(workspace, step, "invalid-selection", "One molecule cannot fill two reactant roles; select distinct molecules.");
  }
  const lots: PoolLot[] = [];
  for (const id of request.lotIds) {
    const lot = lotById(workspace.pool, id);
    if (!lot) return withFailure(workspace, step, "invalid-selection", `Molecule ${id} does not exist in this workspace.`);
    if (lot.availability !== "live") {
      return withFailure(
        workspace,
        step,
        "invalid-selection",
        `Molecule ${id} (${lot.smiles}) was already consumed by step ${lot.consumedByStep} and cannot be used again.`,
      );
    }
    lots.push(lot);
  }

  // 2. Arity: structural partners are molecules, never invented from a reagent name.
  const { arity, partnerLabels } = structuralArity(rule);
  if (lots.length < arity) {
    const missing = partnerLabels.slice(Math.max(0, lots.length - 1));
    return withFailure(
      workspace,
      step,
      "needs-input",
      `This reaction needs ${arity} structural reactant${arity === 1 ? "" : "s"} (substrate plus ${partnerLabels.join(", ") || "none"}); ${lots.length} selected. ` +
        "PocketChem will not invent a structure from a reagent name.",
      { missingPartners: missing },
    );
  }
  if (lots.length > arity) {
    return withFailure(
      workspace,
      step,
      "invalid-selection",
      `This reaction consumes ${arity} structural reactant${arity === 1 ? "" : "s"}; ${lots.length} were selected. Select only the molecules the reaction uses.`,
    );
  }

  // 3. Run the existing engine on exactly these structures.
  const engineIssues: ReactionEngineIssue[] = [];
  let pathways: ReactionPathway[];
  try {
    pathways = await predictReactionPathwaysFromRules(lots.map((lot) => lot.smiles).join("."), [], [rule], {
      issues: engineIssues,
    });
  } catch (error) {
    return withFailure(
      workspace,
      step,
      "execution-error",
      `PocketChem could not evaluate this condition because of an internal engine problem (${error instanceof Error ? error.message : String(error)}). ` +
        "This is not a chemical prediction.",
      { issues: [error instanceof Error ? error.message : String(error)] },
    );
  }
  const uniqueIssues = [...new Set(engineIssues.map((issue) => issue.message))];

  const withProduct = pathways.filter((pathway) => pathway.productSmiles);
  if (withProduct.length === 0) {
    if (pathways.some((pathway) => pathway.missingReactants.length > 0)) {
      return withFailure(
        workspace,
        step,
        "needs-input",
        "This reaction needs an additional structural reactant. PocketChem will not invent that structure from a reagent name.",
        { missingPartners: partnerLabels, issues: uniqueIssues },
      );
    }
    if (uniqueIssues.length > 0) {
      return withFailure(
        workspace,
        step,
        "execution-error",
        `PocketChem could not evaluate this condition because of an internal engine problem (${uniqueIssues.join("; ")}). This is not evidence that the molecules are unreactive.`,
        { issues: uniqueIssues },
      );
    }
    if (pathways.length > 0) {
      return withFailure(
        workspace,
        step,
        "unsupported",
        "This condition matches the selected molecules, but PocketChem's structure generator did not produce a valid product. This is a limitation of the model, not a prediction of nonreactivity.",
      );
    }
    let explanation =
      "The selected molecules do not satisfy the structural requirements for this condition, so PocketChem predicts no reaction. Nothing was consumed.";
    try {
      explanation = `${(await explainNoReactionForRule(lots[0].smiles, rule)).explanation} Nothing was consumed.`;
    } catch {
      /* keep the generic explanation; failing to explain is not a prediction */
    }
    return withFailure(workspace, step, "no-reaction", explanation);
  }

  // 4. Offered outcomes.
  const structureCache = new Map<string, Promise<SuppliedMaterial | null>>();
  const structureOf = (smiles: string) => {
    let pending = structureCache.get(smiles);
    if (!pending) {
      pending = toMaterial(smiles);
      structureCache.set(smiles, pending);
    }
    return pending;
  };
  const presets = new Set<string>();
  for (const requirement of (rule.additionalReactants ?? []).map(resolveReactantRequirement)) {
    if (requirement.supplyMode !== "auto" || !requirement.presetSmiles) continue;
    const preset = await structureOf(requirement.presetSmiles);
    if (preset) presets.add(preset.canonical);
  }
  const matches = await matchPathways(withProduct, lots, presets, structureOf);
  const distinct = collapseOutcomes(matches);
  if (distinct.length === 0) {
    return withFailure(
      workspace,
      step,
      "unsupported",
      "The rule produced products, but none that consumes exactly the selected molecules. This is a limitation of the model, not a prediction of nonreactivity.",
      { issues: uniqueIssues },
    );
  }
  // Offer outcomes the rule itself rates highest first (stable otherwise), so a bounded list never hides them.
  const levelRank = (item: { pathway: ReactionPathway }) => {
    const level = item.pathway.selectivityAssessment?.level;
    return level === "major" ? 0 : level === "competitive" ? 1 : level === "minor" || level === "trace" ? 3 : 2;
  };
  distinct.sort((a, b) => levelRank(a) - levelRank(b));
  const maxOutcomes = Math.max(1, Math.floor(options.maxOutcomes ?? DEFAULT_MAX_OUTCOMES));
  const kept = distinct.slice(0, maxOutcomes);
  const constitutions = new Set(distinct.map((item) => item.connectivityKey)).size;
  const outcomes: WorkspaceOutcome[] = kept.map((item, index) => {
    const mixture = item.pathway.productMixture;
    return {
      index,
      pathwayId: item.pathway.id,
      productSmiles: item.pathway.productSmiles as string,
      productComponents: item.productComponents,
      productLabel: mixture?.displayName ?? item.pathway.productLabel,
      productStatus: item.pathway.productStatus,
      explanation: item.pathway.shortExplanation,
      limitations: item.pathway.limitations,
      selectivity: item.pathway.selectivityAssessment ?? null,
      selectivityFinding: classifyStepSelectivity({
        stepNumber: workspace.pool.steps.length + 1,
        ruleId: rule.id,
        rule,
        dynamic: item.pathway.selectivityAssessment,
        alternatives: constitutions,
      }),
      mixture: mixture
        ? {
            kind: mixture.kind,
            groupId: mixture.groupId,
            label: mixture.label,
            memberCount: mixture.memberCount,
            collapsed: mixture.kind === "racemic" && item.collapsedMembers.length > 1,
            memberSmiles: item.collapsedMembers,
          }
        : null,
    };
  });
  const offered = { outcomes, omittedOutcomes: distinct.length - kept.length, issues: uniqueIssues };

  // 5. Choose. Several distinct outcomes are never resolved silently.
  let chosen = request.outcome;
  let selectedBy: "only-option" | "user" = "user";
  if (chosen === undefined) {
    if (outcomes.length === 1 && offered.omittedOutcomes === 0) {
      chosen = 0;
      selectedBy = "only-option";
    } else {
      return withFailure(
        workspace,
        step,
        "needs-selection",
        `The engine offers ${distinct.length} distinct outcomes for these molecules${
          outcomes.some((item) => item.selectivity) ? "; some carry the rule's own selectivity estimate (shown on each)" : " and does not rank them"
        }. Nothing was consumed; choose one outcome to continue.`,
        offered,
      );
    }
  }
  if (!Number.isInteger(chosen) || chosen < 0 || chosen >= outcomes.length) {
    return withFailure(
      workspace,
      step,
      "invalid-selection",
      `Outcome ${String(chosen)} is not one of the ${outcomes.length} offered outcomes. Nothing was consumed.`,
      offered,
    );
  }

  // 6. Commit: consume the selected lots, add every product and coproduct.
  const picked = kept[chosen];
  const mixtureMeta = picked.pathway.productMixture;
  const applied = applyStep(workspace.pool, {
    ruleId: rule.id,
    consumedLotIds: lots.map((lot) => lot.id),
    products: picked.products,
    stepMixture: mixtureMeta
      ? { kind: mixtureMeta.kind, memberSmiles: picked.collapsedMembers.length > 1 ? picked.collapsedMembers : mixtureMeta.memberSmiles }
      : null,
  });
  if (!applied.ok) {
    return withFailure(workspace, step, "execution-error", `The workspace rejected the step: ${applied.detail}`, offered);
  }
  const consumedIds = lots.map((lot) => lot.id);
  const synthesisStep = forwardStepFromPathway(picked.pathway);
  if (!synthesisStep) {
    return withFailure(workspace, step, "execution-error", "The selected outcome has no product structure.", offered);
  }
  const committedStep = applied.state.steps.length;
  const compatibility = await assessStepCompatibility(
    rule,
    lots.map((lot) => lot.smiles),
    picked.productComponents,
  );
  const recorded: WorkspaceStep = {
    ...step,
    ...offered,
    committedStep,
    status: "reaction",
    explanation: picked.pathway.shortExplanation,
    consumedLotIds: consumedIds,
    producedLotIds: applied.producedLotIds,
    retainedLotIds: liveLots(applied.state)
      .map((lot) => lot.id)
      .filter((id) => !applied.producedLotIds.includes(id)),
    selectedOutcome: chosen,
    selectedBy,
    compatibility,
  };
  return {
    workspace: {
      ...workspace,
      pool: applied.state,
      history: [...workspace.history, recorded],
      actions: [...workspace.actions, { kind: "step", request: requestOf(step) }],
      records: [
        ...workspace.records,
        {
          step: { ...synthesisStep, stepNumber: committedStep, reactantLotIds: picked.reactantLotIds },
          reactantLotIds: picked.reactantLotIds,
        },
      ],
    },
    step: recorded,
  };
}

// ---------------------------------------------------------------------------------------
// Partner discovery (selection support for a UI; never executes anything)
// ---------------------------------------------------------------------------------------

/**
 * Ways the live lots can fill one rule's structural roles, by lot id in role order. Uses the
 * same slot-fit test as the planner, so a suggestion is a structural fit, not a prediction
 * that the reaction gives a useful product.
 */
export async function candidateLotSelections(
  workspace: ReactionWorkspace,
  rule: ReactionRule,
): Promise<string[][]> {
  const live = liveLots(workspace.pool).map((lot) => ({
    id: lot.id,
    smiles: lot.smiles,
    canonical: lot.canonical,
    equivalenceKey: `${lot.canonical}|${lot.stereoMixture ?? "-"}`,
  }));
  const index = new ReactantRoleIndex([rule]);
  const { arity } = structuralArity(rule);
  const slotArity = 1 + (rule.additionalReactants ?? []).filter((item) => {
    const mode = resolveReactantRequirement(item).supplyMode;
    return mode !== "auto" && mode !== "condition-only";
  }).length;
  if (arity === 1) {
    const out: string[][] = [];
    for (const lot of live) {
      if (await index.slotFits(lot, rule.id, 0)) out.push([lot.id]);
    }
    return out;
  }
  const assignments = await index.candidateAssignments(live, { maxArity: slotArity });
  if (arity === slotArity) return assignments.map((item) => item.lotIds);
  // Extra equivalents are further live lots of the same structure as the partner they repeat.
  const requirements = (rule.additionalReactants ?? [])
    .map(resolveReactantRequirement)
    .filter((item) => item.supplyMode !== "auto" && item.supplyMode !== "condition-only");
  const byId = new Map(live.map((lot) => [lot.id, lot]));
  const out: string[][] = [];
  for (const assignment of assignments) {
    const chosen = [...assignment.lotIds];
    let complete = true;
    requirements.forEach((requirement, position) => {
      const lot = byId.get(assignment.lotIds[position + 1]);
      for (let extra = 1; extra < Math.max(1, Math.floor(requirement.equivalents ?? 1)); extra += 1) {
        const copy = live.find((candidate) => candidate.canonical === lot?.canonical && !chosen.includes(candidate.id));
        if (copy) chosen.push(copy.id);
        else complete = false;
      }
    });
    if (complete) out.push(chosen);
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Scripted execution (dependency-aware)
// ---------------------------------------------------------------------------------------

/** A lot, named directly or as "product n of attempt k" so a script need not know lot ids. */
export type WorkspaceLotRef =
  | string
  | { material: number }
  | { attempt: number; product: number };

export type WorkspaceScriptStep = {
  ruleId: string;
  reactants: WorkspaceLotRef[];
  outcome?: number;
};

function resolveRef(workspace: ReactionWorkspace, ref: WorkspaceLotRef): { id: string } | { problem: string; failed: boolean } {
  if (typeof ref === "string") return { id: ref };
  if ("material" in ref) {
    const lot = workspace.pool.lots.find(
      (item) => item.provenance.kind === "supplied" && item.provenance.startIndex === ref.material && item.provenance.copy === 1,
    );
    return lot ? { id: lot.id } : { problem: `Starting material ${ref.material} does not exist.`, failed: false };
  }
  const attempt = workspace.history[ref.attempt - 1];
  if (!attempt) return { problem: `Attempt ${ref.attempt} has not happened.`, failed: true };
  if (attempt.status !== "reaction") {
    return {
      problem: `Attempt ${ref.attempt} (${attempt.title}) did not produce a product (${attempt.status}), so its product is not available.`,
      failed: true,
    };
  }
  const id = attempt.producedLotIds[ref.product - 1];
  return id
    ? { id }
    : { problem: `Attempt ${ref.attempt} produced ${attempt.producedLotIds.length} product(s); product ${ref.product} does not exist.`, failed: false };
}

/**
 * Runs a list of steps in order. A step that depends on a product of a step that failed is
 * recorded as "dependency-failed" and is NOT run; steps on independent branches still run.
 */
export async function runWorkspaceScript(
  workspace: ReactionWorkspace,
  script: readonly WorkspaceScriptStep[],
  rules: ReactionRule[],
  options: WorkspaceOptions = {},
): Promise<ReactionWorkspace> {
  let current = workspace;
  for (const item of script) {
    const ids: string[] = [];
    const problems: string[] = [];
    let dependencyFailed = false;
    for (const ref of item.reactants) {
      const resolved = resolveRef(current, ref);
      if ("id" in resolved) ids.push(resolved.id);
      else {
        problems.push(resolved.problem);
        dependencyFailed ||= resolved.failed;
      }
    }
    if (problems.length > 0) {
      const rule = rules.find((candidate) => candidate.id === item.ruleId);
      const base = baseStep(current, { ruleId: item.ruleId, lotIds: ids }, rule);
      current = withFailure(
        current,
        base,
        dependencyFailed ? "dependency-failed" : "invalid-selection",
        `${problems.join(" ")} This step was not run and no material changed.`,
        {},
        false,
      ).workspace;
      continue;
    }
    current = (await executeWorkspaceStep(current, { ruleId: item.ruleId, lotIds: ids, outcome: item.outcome }, rules, options)).workspace;
  }
  return current;
}

// ---------------------------------------------------------------------------------------
// Verification (replay against the existing rules)
// ---------------------------------------------------------------------------------------

export type WorkspaceAssessment = {
  route: MultistepSynthesisRoute;
  verification: RouteVerification;
  compatibility: RouteCompatibility;
  selectivity: RouteSelectivity;
};

/**
 * Replays every committed step from the supplied materials with the existing route verifier
 * (structure only). Compatibility and selectivity are separate advisory assessments; none of
 * the three is experimental validation. `targetLotId` defaults to the first product of the
 * last committed step.
 */
export async function assessWorkspace(
  workspace: ReactionWorkspace,
  rules: ReactionRule[],
  targetLotId?: string,
): Promise<WorkspaceAssessment | null> {
  if (workspace.records.length === 0) return null;
  const target =
    (targetLotId ? lotById(workspace.pool, targetLotId) : undefined) ??
    lotById(workspace.pool, `s${workspace.records.length}.1`);
  if (!target) return null;
  const route: MultistepSynthesisRoute = {
    id: `workspace-${workspace.records.map((item) => item.step.ruleId).join(">")}`,
    startingSmiles: workspace.materials.map((material) => material.smiles).join("."),
    targetSmiles: target.smiles,
    steps: workspace.records.map((record, position) => ({
      ...record.step,
      id: `${record.step.id}--workspace-${position + 1}`,
      stepNumber: position + 1,
      reactantLotIds: record.reactantLotIds,
    })),
    confidence: "verified",
    score: 0,
  };
  const verification = await verifyMultistepRoute(route, rules, {
    startingMaterialCopies: [...workspace.pool.suppliedCopies],
  });
  const compatibility = await assessRouteCompatibility(route, rules);
  const selectivity = await assessRouteSelectivity(route, rules);
  return { route: { ...route, verification, compatibility, selectivity }, verification, compatibility, selectivity };
}

/**
 * Rebuilds a workspace from its action log by running every action again on the given rules.
 * Used to recompute saved work whose stored result could not be shown; the stored result
 * itself is never rewritten by it.
 */
export async function replayActions(
  actions: readonly WorkspaceAction[],
  rules: ReactionRule[],
  options: WorkspaceOptions = {},
): Promise<CreateWorkspaceResult> {
  const first = actions.findIndex((action) => action.kind === "material");
  if (first !== 0) return { ok: false, problems: ["The first action must add a starting material."] };
  let leading = 0;
  while (leading < actions.length && actions[leading].kind === "material") leading += 1;
  const created = await createWorkspace(
    actions.slice(0, leading).map((action) => (action as { kind: "material"; smiles: string }).smiles),
  );
  if (!created.ok) return created;
  let current = created.workspace;
  for (const action of actions.slice(leading)) {
    if (action.kind === "material") {
      const added = await addMaterial(current, action.smiles);
      if (!added.ok) return added;
      current = added.workspace;
    } else {
      current = (await executeWorkspaceStep(current, action.request, rules, options)).workspace;
    }
  }
  return { ok: true, workspace: current };
}
