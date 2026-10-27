/**
 * What the Synthesis page persists, and how saved data is validated before it is shown.
 *
 * Inputs: the two drawn editors as KET (Ketcher's lossless document: connectivity, charges,
 * isotopes, stereo and disconnected components), their chemistry identity keys, and the copies
 * setting. Results: the routes exactly as displayed (steps, verification, compatibility findings,
 * inventory provenance), their labels and the search outcome. Rendered SVGs and live search state
 * (controller, frontiers, progress) are never stored.
 */
import type { MultistepSynthesisRoute } from "../reactions/reactionTypes";

/** Bump when the shape or meaning of saved synthesis results changes. */
export const SYNTHESIS_ENGINE_VERSION = 1;

export type SynthesisWorkspaceInputs = {
  reactantKet: string | null;
  targetKet: string | null;
  /** Chemistry identity of each editor when it was captured (see ketIdentity.ts). */
  reactantKey: string | null;
  targetKey: string | null;
  copies: 1 | 2;
};

export type SynthesisOutcomeKind =
  | "found"
  | "found-interrupted"
  | "cancelled"
  | "no-route-within-budget"
  | "no-route-within-bounds";

export type SynthesisWorkspaceResults = {
  /** Identity of the structures and setting that produced these results. */
  inputKey: string;
  startingSmiles: string;
  targetSmiles: string;
  copies: 1 | 2;
  startingNames: string[];
  targetName: string;
  routes: MultistepSynthesisRoute[];
  outcomeMessage: string;
  interruptedNote: string | null;
  elapsedMs: number;
};

const OUTCOME_KINDS: readonly string[] = [
  "found",
  "found-interrupted",
  "cancelled",
  "no-route-within-budget",
  "no-route-within-bounds",
];

const MAX_KET_CHARS = 1_500_000;
const MAX_ROUTES = 50;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isNullableString = (value: unknown): value is string | null => value === null || isString(value);

export function isSynthesisOutcomeKind(kind: string): kind is SynthesisOutcomeKind {
  return OUTCOME_KINDS.includes(kind);
}

/** The inputs are only accepted if every field has the right type and the KET is plausible. */
export function validateSynthesisInputs(raw: unknown): SynthesisWorkspaceInputs | null {
  if (!isObject(raw)) return null;
  const { reactantKet, targetKet, reactantKey, targetKey, copies } = raw;
  if (copies !== 1 && copies !== 2) return null;
  if (!isNullableString(reactantKet) || !isNullableString(targetKet)) return null;
  if (!isNullableString(reactantKey) || !isNullableString(targetKey)) return null;
  for (const ket of [reactantKet, targetKet]) {
    if (ket === null) continue;
    if (ket.length > MAX_KET_CHARS) return null;
    try {
      const parsed: unknown = JSON.parse(ket);
      if (!isObject(parsed) || !isObject(parsed.root)) return null;
    } catch {
      return null;
    }
  }
  return { reactantKet, targetKet, reactantKey, targetKey, copies };
}

function isRestorableStep(step: unknown): boolean {
  if (!isObject(step)) return false;
  return (
    isString(step.id) &&
    typeof step.stepNumber === "number" &&
    isString(step.ruleId) &&
    isString(step.title) &&
    isString(step.reactantSmiles) &&
    isStringArray(step.reactantComponents) &&
    isString(step.reactantLabel) &&
    isString(step.productSmiles) &&
    isStringArray(step.productComponents) &&
    isString(step.productLabel) &&
    isString(step.reagentLabel) &&
    isString(step.shortExplanation) &&
    isStringArray(step.selectivity) &&
    isStringArray(step.limitations) &&
    (step.compatibility === undefined || Array.isArray(step.compatibility))
  );
}

function isRestorableRoute(route: unknown): route is MultistepSynthesisRoute {
  if (!isObject(route)) return false;
  if (!isString(route.id) || !isString(route.startingSmiles) || !isString(route.targetSmiles)) return false;
  if (typeof route.score !== "number" || !isString(route.confidence)) return false;
  if (!Array.isArray(route.steps) || route.steps.length === 0 || !route.steps.every(isRestorableStep)) return false;
  const verification = route.verification;
  if (verification !== undefined) {
    // The page reads these fields directly, so they must exist with the right types.
    if (!isObject(verification) || !isString(verification.status)) return false;
    if (!isStringArray(verification.unusedStartingMaterials)) return false;
    if (!Array.isArray(verification.steps)) return false;
    if (!isStringArray(verification.coproducts) || !isStringArray(verification.problems)) return false;
    if (verification.inventory !== undefined && !Array.isArray(verification.inventory)) return false;
    if (verification.leftovers !== undefined && !Array.isArray(verification.leftovers)) return false;
  }
  if (route.compatibility !== undefined && !isObject(route.compatibility)) return false;
  return true;
}

/** Returns usable results, or null when nothing in them can be shown safely. */
export function validateSynthesisResults(raw: unknown): SynthesisWorkspaceResults | null {
  if (!isObject(raw)) return null;
  if (!isString(raw.inputKey) || !isString(raw.startingSmiles) || !isString(raw.targetSmiles)) return null;
  if (raw.copies !== 1 && raw.copies !== 2) return null;
  if (!isStringArray(raw.startingNames) || !isString(raw.targetName)) return null;
  if (!isString(raw.outcomeMessage) || !isNullableString(raw.interruptedNote)) return null;
  if (typeof raw.elapsedMs !== "number" || !Number.isFinite(raw.elapsedMs)) return null;
  if (!Array.isArray(raw.routes) || raw.routes.length > MAX_ROUTES) return null;
  const routes = raw.routes.filter(isRestorableRoute);
  // A partly damaged result list is not shown as if it were the whole result.
  if (routes.length !== raw.routes.length) return null;
  return {
    inputKey: raw.inputKey,
    startingSmiles: raw.startingSmiles,
    targetSmiles: raw.targetSmiles,
    copies: raw.copies,
    startingNames: raw.startingNames,
    targetName: raw.targetName,
    routes,
    outcomeMessage: raw.outcomeMessage,
    interruptedNote: raw.interruptedNote,
    elapsedMs: raw.elapsedMs,
  };
}

/** Same structures and setting that produced a result? Keys come from ketIdentityKey(). */
export function synthesisInputKey(startKey: string, targetKey: string, copies: 1 | 2): string {
  return `${startKey}>>${targetKey}|copies=${copies}`;
}
