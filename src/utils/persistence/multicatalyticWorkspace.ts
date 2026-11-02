/**
 * What the Multi-Catalytic workspace persists, and how saved data is validated before it is shown.
 *
 * Inputs: the action log (molecules added to the inventory and every reaction step requested, in
 * order) plus the user's current selection. Results: the workspace exactly as it was displayed
 * (inventory lots with provenance, every attempt with its outcomes, failures and explanations)
 * and the structure-replay / compatibility / selectivity summaries computed for it.
 *
 * Restoring shows the saved result; no reaction is run again. The action log is enough to
 * recompute the workspace (`replayActions`), but that is a separate, explicit action and never
 * overwrites a saved result. A draft that was only drawn in the editor (not yet added to the
 * inventory) is not part of the workspace and is not saved.
 */
import type { ReactionWorkspace } from "../reactions/engine/reactionWorkspace";
import type { RouteCompatibility, RouteSelectivity, RouteVerification } from "../reactions/reactionTypes";

/** Bump when the shape or meaning of saved workspaces changes. */
export const MULTICATALYTIC_ENGINE_VERSION = 1;

export type MulticatalyticAction = ReactionWorkspace["actions"][number];

export type MulticatalyticWorkspaceInputs = {
  actions: MulticatalyticAction[];
  /** The reaction and molecules chosen in the step builder but not yet run. */
  selection: { ruleId: string | null; lotIds: string[] };
};

export type MulticatalyticAssessmentSummary = {
  verification: RouteVerification;
  compatibility: RouteCompatibility;
  selectivity: RouteSelectivity;
};

export type MulticatalyticWorkspaceResults = {
  /** Identity of the action log that produced these results. */
  inputKey: string;
  workspace: ReactionWorkspace;
  assessment: MulticatalyticAssessmentSummary | null;
};

const MAX_ACTIONS = 300;
const MAX_LOTS = 600;
const MAX_STEP_OUTCOMES = 24;
const ROLES: readonly string[] = ["supplied", "primary", "coproduct"];
const AVAILABILITY: readonly string[] = ["live", "shelved", "consumed"];
const STEP_STATUS: readonly string[] = [
  "reaction",
  "needs-selection",
  "needs-input",
  "no-reaction",
  "unsupported",
  "unknown-rule",
  "execution-error",
  "invalid-selection",
  "dependency-failed",
];
const MIXTURE_KINDS: readonly string[] = ["racemic", "diastereomeric", "stereoisomeric"];
const SELECTIVITY_CLASSES: readonly string[] = ["major", "single-outcome", "disfavored", "unranked", "unassessed"];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown): value is string | null => value === null || isString(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

export function multicatalyticInputKey(actions: readonly MulticatalyticAction[]): string {
  return JSON.stringify(actions);
}

function isRequest(value: unknown): boolean {
  return (
    isObject(value) &&
    isString(value.ruleId) &&
    isStringArray(value.lotIds) &&
    (value.outcome === undefined || isCount(value.outcome))
  );
}

function isAction(value: unknown): value is MulticatalyticAction {
  if (!isObject(value)) return false;
  if (value.kind === "material") return isString(value.smiles) && value.smiles.trim().length > 0;
  return value.kind === "step" && isRequest(value.request);
}

export function validateMulticatalyticInputs(raw: unknown): MulticatalyticWorkspaceInputs | null {
  if (!isObject(raw)) return null;
  if (!Array.isArray(raw.actions) || raw.actions.length > MAX_ACTIONS || !raw.actions.every(isAction)) return null;
  const selection = raw.selection;
  if (!isObject(selection) || !isNullableString(selection.ruleId) || !isStringArray(selection.lotIds)) return null;
  if (selection.lotIds.length > 12) return null;
  return {
    actions: raw.actions,
    selection: { ruleId: selection.ruleId, lotIds: selection.lotIds },
  };
}

function isMaterial(value: unknown): boolean {
  return (
    isObject(value) &&
    isString(value.smiles) && isString(value.canonical) && isString(value.connectivity) &&
    typeof value.hasSpecifiedStereo === "boolean"
  );
}

function isLot(value: unknown): boolean {
  if (!isObject(value)) return false;
  const provenance = value.provenance;
  const provenanceOk =
    isObject(provenance) &&
    ((provenance.kind === "supplied" && isCount(provenance.startIndex) && isCount(provenance.copy)) ||
      (provenance.kind === "product" && isCount(provenance.step) && isString(provenance.ruleId) && isStringArray(provenance.consumedLotIds)));
  return (
    isString(value.id) && isString(value.smiles) && isString(value.canonical) && isString(value.connectivity) &&
    typeof value.hasSpecifiedStereo === "boolean" &&
    (value.stereoMixture === null || (isString(value.stereoMixture) && MIXTURE_KINDS.includes(value.stereoMixture))) &&
    (value.stereoMixtureMembers === null || isStringArray(value.stereoMixtureMembers)) &&
    isString(value.role) && ROLES.includes(value.role) &&
    isString(value.availability) && AVAILABILITY.includes(value.availability) &&
    provenanceOk && isNumberArray(value.lineage) &&
    (value.consumedByStep === null || isCount(value.consumedByStep))
  );
}

function isFinding(value: unknown): boolean {
  return (
    isObject(value) &&
    isString(value.class) && SELECTIVITY_CLASSES.includes(value.class) &&
    (value.alternatives === null || isCount(value.alternatives)) &&
    typeof value.representative === "boolean" && isStringArray(value.limitations) && isString(value.basis)
  );
}

function isOutcome(value: unknown): boolean {
  if (!isObject(value)) return false;
  const mixture = value.mixture;
  return (
    isCount(value.index) && isString(value.pathwayId) && isString(value.productSmiles) &&
    isStringArray(value.productComponents) && isString(value.productLabel) && isString(value.productStatus) &&
    isString(value.explanation) && isStringArray(value.limitations) &&
    (value.selectivity === null || isObject(value.selectivity)) &&
    isFinding(value.selectivityFinding) &&
    (mixture === null ||
      (isObject(mixture) && isString(mixture.kind) && MIXTURE_KINDS.includes(mixture.kind) &&
        isString(mixture.groupId) && isString(mixture.label) && isCount(mixture.memberCount) &&
        typeof mixture.collapsed === "boolean" && isStringArray(mixture.memberSmiles)))
  );
}

const ROLE_KINDS: readonly string[] = [
  "structural-reactant", "stoichiometric-reagent", "reagent", "catalyst", "co-catalyst", "solvent", "reaction-condition", "workup-reagent",
];

/** Roles are optional (workspaces saved before they existed have none), but a present value must be well formed. */
function isRoleProfile(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isObject(value) || !isString(value.ruleId) || !isString(value.reagentText) || typeof value.structured !== "boolean") return false;
  if (!isString(value.catalystIdentity) || !["named", "generic", "none", "unknown"].includes(value.catalystIdentity)) return false;
  return (
    Array.isArray(value.roles) &&
    value.roles.length <= 40 &&
    value.roles.every(
      (role) =>
        isObject(role) && isString(role.kind) && ROLE_KINDS.includes(role.kind) && isString(role.name) &&
        isString(role.source) && ["registry-structure", "registry-text", "textbook"].includes(role.source),
    )
  );
}

/** Conditions are optional (older saves have none), but a present value must be well formed. */
function isConditionProfile(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isObject(value) || !isString(value.ruleId) || !isString(value.reagentText)) return false;
  if (!Array.isArray(value.declared) || value.declared.length > 20) return false;
  if (!value.declared.every((item) => isObject(item) && isString(item.dimension) && isString(item.value) && isString(item.source))) return false;
  if (typeof value.declaresRuleConditions !== "boolean" || typeof value.anhydrous !== "boolean") return false;
  if (!Array.isArray(value.workup) || !Array.isArray(value.notStated) || !isStringArray(value.notStated)) return false;
  if (value.intolerances !== null && !Array.isArray(value.intolerances)) return false;
  return isObject(value.isolation) && value.isolation.kind === "isolated-step" && isString(value.isolation.statement);
}

function isHistoryStep(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    isCount(value.attempt) && (value.committedStep === null || isCount(value.committedStep)) &&
    isString(value.ruleId) && isString(value.title) && isString(value.reagentLabel) && isString(value.reagentNote) &&
    isString(value.status) && STEP_STATUS.includes(value.status) && isString(value.explanation) &&
    isStringArray(value.requestedLotIds) && (value.requestedOutcome === null || isCount(value.requestedOutcome)) &&
    isStringArray(value.consumedLotIds) && isStringArray(value.producedLotIds) && isStringArray(value.retainedLotIds) &&
    Array.isArray(value.outcomes) && value.outcomes.length <= MAX_STEP_OUTCOMES && value.outcomes.every(isOutcome) &&
    isCount(value.omittedOutcomes) &&
    (value.selectedOutcome === null || isCount(value.selectedOutcome)) &&
    (value.selectedBy === null || value.selectedBy === "only-option" || value.selectedBy === "user") &&
    isStringArray(value.missingPartners) && isStringArray(value.issues) &&
    (value.compatibility === null || Array.isArray(value.compatibility)) &&
    isRoleProfile(value.roles) &&
    isConditionProfile(value.conditions)
  );
}

function isRecord(value: unknown): boolean {
  if (!isObject(value) || !isStringArray(value.reactantLotIds) || !isObject(value.step)) return false;
  const step = value.step;
  return (
    isString(step.id) && typeof step.stepNumber === "number" && isString(step.ruleId) && isString(step.title) &&
    isString(step.reactantSmiles) && isStringArray(step.reactantComponents) && isString(step.reactantLabel) &&
    isString(step.productSmiles) && isStringArray(step.productComponents) && isString(step.productLabel) &&
    isString(step.reagentLabel) && isString(step.shortExplanation) &&
    isStringArray(step.selectivity) && isStringArray(step.limitations)
  );
}

/**
 * The saved workspace is only shown when every part is well formed AND the parts agree with
 * each other (every id a step names exists, consumed lots say which step consumed them, the
 * records match the committed steps). A partly damaged workspace is never shown as if whole.
 */
export function validateWorkspaceSnapshot(raw: unknown): ReactionWorkspace | null {
  if (!isObject(raw) || !isObject(raw.pool)) return null;
  const { pool, materials, history, records, actions } = raw;
  if (!Array.isArray(pool.lots) || pool.lots.length > MAX_LOTS || !pool.lots.every(isLot)) return null;
  if (!Array.isArray(pool.steps) || !isNumberArray(pool.suppliedCopies) || typeof pool.pathCost !== "number") return null;
  if (!Array.isArray(materials) || !materials.every(isMaterial)) return null;
  if (!Array.isArray(history) || history.length > MAX_ACTIONS || !history.every(isHistoryStep)) return null;
  if (!Array.isArray(records) || !records.every(isRecord)) return null;
  if (!Array.isArray(actions) || actions.length > MAX_ACTIONS || !actions.every(isAction)) return null;

  const lots = pool.lots as Array<Record<string, unknown>>;
  const ids = new Set(lots.map((lot) => lot.id as string));
  if (ids.size !== lots.length) return null;
  const steps = pool.steps as unknown[];
  if (records.length !== steps.length) return null;
  if ((pool.suppliedCopies as number[]).length !== materials.length) return null;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (
      !isObject(step) || step.stepNumber !== index + 1 || !isString(step.ruleId) ||
      !isStringArray(step.consumedLotIds) || !isStringArray(step.producedLotIds) || typeof step.cost !== "number"
    ) {
      return null;
    }
    for (const id of [...step.consumedLotIds, ...step.producedLotIds]) if (!ids.has(id)) return null;
  }
  for (const lot of lots) {
    const consumed = lot.availability === "consumed";
    if (consumed !== (lot.consumedByStep !== null)) return null;
    if (consumed && (lot.consumedByStep as number) > steps.length) return null;
  }
  const committed = (history as Array<Record<string, unknown>>).filter((step) => step.status === "reaction");
  if (committed.length !== steps.length) return null;
  for (const step of history as Array<Record<string, unknown>>) {
    if (step.status !== "reaction" && ((step.consumedLotIds as string[]).length > 0 || (step.producedLotIds as string[]).length > 0)) {
      return null;
    }
  }
  return raw as unknown as ReactionWorkspace;
}

function isAssessment(value: unknown): value is MulticatalyticAssessmentSummary {
  if (!isObject(value)) return false;
  const { verification, compatibility, selectivity } = value;
  if (!isObject(verification) || !isString(verification.status) || !Array.isArray(verification.steps)) return false;
  if (!isStringArray(verification.problems) || !isStringArray(verification.coproducts) || !isStringArray(verification.unusedStartingMaterials)) return false;
  if (!isObject(compatibility) || !Array.isArray(compatibility.warnings) || !isStringArray(compatibility.unassessedRuleIds)) return false;
  return isObject(selectivity) && Array.isArray(selectivity.findings) && isObject(selectivity.counts);
}

export function validateMulticatalyticResults(raw: unknown): MulticatalyticWorkspaceResults | null {
  if (!isObject(raw) || !isString(raw.inputKey)) return null;
  const workspace = validateWorkspaceSnapshot(raw.workspace);
  if (!workspace) return null;
  if (raw.assessment !== null && !isAssessment(raw.assessment)) return null;
  return { inputKey: raw.inputKey, workspace, assessment: raw.assessment as MulticatalyticAssessmentSummary | null };
}

/** The one-line description a saved Multi-Catalytic workspace gets in the library list. */
export function describeMulticatalyticAnalysis(
  data: Pick<MulticatalyticWorkspaceResults, "workspace" | "assessment">,
): string {
  const { workspace } = data;
  const materials = workspace.materials.length;
  const done = workspace.records.length;
  const attempts = workspace.history.length;
  const failed = attempts - done;
  const live = workspace.pool.lots.filter((lot) => lot.availability === "live").length;
  const parts = [
    `${materials} starting molecule${materials === 1 ? "" : "s"}`,
    `${done} completed step${done === 1 ? "" : "s"}`,
  ];
  if (failed > 0) parts.push(`${failed} step${failed === 1 ? "" : "s"} not completed`);
  parts.push(`${live} molecule${live === 1 ? "" : "s"} in inventory`);
  return parts.join(" · ");
}
