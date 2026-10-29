/**
 * What the Reactions page persists, and how saved data is validated before it is shown.
 *
 * The page has no reagent or condition pickers: the engine derives reagents from the structures on
 * the canvas, so the inputs are the drawn structure(s) (KET), the analysis mode (forward products or
 * retrosynthesis) and how many results were expanded. The result is exactly what the page showed
 * for one finished analysis: the input snapshot (SMILES, molfile, per-component molfiles, name),
 * the pathways with their explanations, selectivity and product mixtures, the retrosynthetic routes,
 * and the NO REACTION outcomes. Reaction and product drawings are rendered again from the saved
 * data; they are not stored and no prediction is rerun.
 *
 * The page discards its results the moment the canvas is edited, so a saved result is always about
 * the structures it was saved with.
 */
import type {
  NoReactionOutcome,
  ReactionPathway,
  RetrosynthesisPathway,
} from "../reactionUtils";

/** Bump when the shape or meaning of saved reaction results changes. */
export const REACTIONS_ENGINE_VERSION = 1;
export const MAX_SAVED_PATHWAYS = 500;

export type ReactionsAnalysisMode = "forward" | "retrosynthesis";

export type ReactionsOutcomeKind = "forward-found" | "forward-none" | "retro-found" | "retro-none";

export type ReactionsWorkspaceInputs = {
  ket: string | null;
  /** Chemistry identity of the drawn structure(s) when captured (see ketIdentity.ts). */
  key: string | null;
  analysisMode: ReactionsAnalysisMode;
  /** How many result cards were expanded; a display preference that never affects validity. */
  visibleResultCount: number;
  /** A prediction was running when the page was last saved; it was not completed. */
  interrupted: ReactionsAnalysisMode | null;
  /**
   * Id of the last Properties analysis this workspace has already taken over (see
   * handoffOfferAvailable). Absent in records written before the handoff rule existed.
   */
  handoffSeen: string | null;
};

export type ReactionsWorkspaceResults = {
  /** Identity of the structure(s) the analysis was run on. */
  inputKey: string;
  mode: ReactionsAnalysisMode;
  smiles: string;
  molfile: string | null;
  componentMolfiles: string[];
  inputName: string;
  /** The status line that was shown when the analysis finished. */
  statusText: string;
  pathways: ReactionPathway[];
  retroPathways: RetrosynthesisPathway[];
  noReactionOutcomes: NoReactionOutcome[];
};

const OUTCOME_KINDS: readonly string[] = ["forward-found", "forward-none", "retro-found", "retro-none"];
const MAX_KET_CHARS = 1_500_000;
const MAX_MOLFILE_CHARS = 1_000_000;
const COURSES: readonly string[] = ["ochem-1", "ochem-2", "advanced"];
const MIXTURE_KINDS: readonly string[] = ["racemic", "diastereomeric", "stereoisomeric"];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown): value is string | null => value === null || isString(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Should the page offer "Use in Reactions" for the latest Properties analysis? `handoffId` names
 * that analysis (null when there is none) and `handoffSeen` is the last one this workspace has
 * already adopted. The offer is only an offer: opening the page always restores the saved
 * workspace, and nothing is replaced until the user chooses to adopt the molecule.
 */
export function handoffOfferAvailable(handoffId: string | null, handoffSeen: string | null): boolean {
  return handoffId !== null && handoffId !== handoffSeen;
}

/**
 * A saved result is only current when the drawing saved beside it is the structure it was computed
 * from. Anything else (no key, a different key, or a result already marked stale) is a snapshot.
 */
export function restoredResultsAreStale(
  inputs: Pick<ReactionsWorkspaceInputs, "key">,
  results: { stale: boolean; data: Pick<ReactionsWorkspaceResults, "inputKey"> },
): boolean {
  return results.stale || inputs.key === null || inputs.key !== results.data.inputKey;
}

export function isReactionsOutcomeKind(kind: string): kind is ReactionsOutcomeKind {
  return OUTCOME_KINDS.includes(kind);
}

export function validateReactionsInputs(raw: unknown): ReactionsWorkspaceInputs | null {
  if (!isObject(raw)) return null;
  const { ket, key, analysisMode, visibleResultCount, interrupted } = raw;
  const handoffSeen = raw.handoffSeen === undefined ? null : raw.handoffSeen;
  if (!isNullableString(ket) || !isNullableString(key)) return null;
  if (!isNullableString(handoffSeen) || (handoffSeen !== null && handoffSeen.length > 200)) return null;
  if (analysisMode !== "forward" && analysisMode !== "retrosynthesis") return null;
  if (interrupted !== null && interrupted !== "forward" && interrupted !== "retrosynthesis") return null;
  if (!Number.isInteger(visibleResultCount) || (visibleResultCount as number) < 1 || (visibleResultCount as number) > MAX_SAVED_PATHWAYS) return null;
  if (ket !== null) {
    if (ket.length > MAX_KET_CHARS) return null;
    try {
      const parsed: unknown = JSON.parse(ket);
      if (!isObject(parsed) || !isObject(parsed.root)) return null;
    } catch {
      return null;
    }
  }
  return { ket, key, analysisMode, visibleResultCount: visibleResultCount as number, interrupted, handoffSeen };
}

function isRequirementList(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => isObject(item) && isString(item.label));
}

function isMixture(value: unknown): boolean {
  if (value === null) return true;
  return (
    isObject(value) &&
    isString(value.kind) && MIXTURE_KINDS.includes(value.kind) &&
    isString(value.groupId) && isString(value.label) &&
    isFiniteNumber(value.memberIndex) && isFiniteNumber(value.memberCount) &&
    isStringArray(value.memberSmiles) && isNullableString(value.displayName)
  );
}

function isForwardPathway(value: unknown): value is ReactionPathway {
  if (!isObject(value)) return false;
  return (
    isString(value.id) && isString(value.ruleId) && isString(value.title) &&
    isString(value.family) && isString(value.reactionType) &&
    isString(value.reactantSmiles) && isString(value.reactantLabel) &&
    isString(value.reagentLabel) && isString(value.reagentNote) &&
    isNullableString(value.productSmiles) && isString(value.productLabel) && isString(value.shortExplanation) &&
    isString(value.course) && COURSES.includes(value.course) && isString(value.chapter) &&
    isNullableString(value.mechanism) && isNullableString(value.reactionClass) &&
    isStringArray(value.selectivity) && isStringArray(value.limitations) &&
    isString(value.productStatus) && isStringArray(value.reactantComponents) &&
    typeof value.hasGenericReactant === "boolean" &&
    isMixture(value.productMixture) &&
    (value.display === null || isObject(value.display)) &&
    isRequirementList(value.missingReactants) && isRequirementList(value.reactantRequirements) &&
    (value.competition === null || isObject(value.competition)) &&
    (value.selectivityProfile === null || isObject(value.selectivityProfile)) &&
    isFiniteNumber(value.planningCost)
  );
}

function isRetroPathway(value: unknown): value is RetrosynthesisPathway {
  if (!isObject(value)) return false;
  return (
    isString(value.id) && isString(value.ruleId) && isString(value.title) &&
    isString(value.family) && isString(value.reactionType) &&
    isString(value.targetSmiles) && isString(value.targetLabel) &&
    isString(value.precursorSmiles) && isStringArray(value.precursorComponents) && isString(value.precursorLabel) &&
    isStringArray(value.requiredReactantLabels) &&
    isString(value.reagentLabel) && isString(value.reagentNote) && isString(value.shortExplanation) &&
    isFiniteNumber(value.priority) &&
    isString(value.course) && COURSES.includes(value.course) && isString(value.chapter) &&
    isNullableString(value.mechanism) &&
    isStringArray(value.limitations) && isStringArray(value.selectivity) &&
    Array.isArray(value.alternativeRoutes) && isMixture(value.productMixture) &&
    (value.display === null || isObject(value.display))
  );
}

function isNoReaction(value: unknown): value is NoReactionOutcome {
  return (
    isObject(value) &&
    isString(value.id) && isString(value.title) && isString(value.reagentLabel) && isString(value.explanation) &&
    isString(value.category) && isStringArray(value.ruleIds) &&
    (value.suggestion === undefined || isString(value.suggestion))
  );
}

/** Returns usable results, or null when the analysis cannot be shown safely. */
export function validateReactionsResults(raw: unknown): ReactionsWorkspaceResults | null {
  if (!isObject(raw)) return null;
  if (!isString(raw.inputKey) || !isString(raw.smiles) || !raw.smiles.trim()) return null;
  if (raw.mode !== "forward" && raw.mode !== "retrosynthesis") return null;
  if (!isNullableString(raw.molfile) || (raw.molfile !== null && raw.molfile.length > MAX_MOLFILE_CHARS)) return null;
  if (!isStringArray(raw.componentMolfiles) || raw.componentMolfiles.some((m) => m.length > MAX_MOLFILE_CHARS)) return null;
  if (!isString(raw.inputName) || !isString(raw.statusText)) return null;
  const { pathways, retroPathways, noReactionOutcomes } = raw;
  if (!Array.isArray(pathways) || pathways.length > MAX_SAVED_PATHWAYS || !pathways.every(isForwardPathway)) return null;
  if (!Array.isArray(retroPathways) || retroPathways.length > MAX_SAVED_PATHWAYS || !retroPathways.every(isRetroPathway)) return null;
  if (!Array.isArray(noReactionOutcomes) || noReactionOutcomes.length > MAX_SAVED_PATHWAYS || !noReactionOutcomes.every(isNoReaction)) return null;
  // A saved analysis shows only the results of its own mode.
  if (raw.mode === "forward" && retroPathways.length > 0) return null;
  if (raw.mode === "retrosynthesis" && (pathways.length > 0 || noReactionOutcomes.length > 0)) return null;
  return raw as unknown as ReactionsWorkspaceResults;
}
