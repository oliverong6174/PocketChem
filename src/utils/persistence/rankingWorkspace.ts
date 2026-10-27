/**
 * What the Ranking page persists, and how saved data is validated before it is shown.
 *
 * Inputs: the structure currently drawn in the editor (KET) and the chosen category and mode.
 * Results: the compared molecules with their computed profiles (every mode's metric, headline,
 * detail and "why" factors) and the ranking exactly as it was displayed (order and tie-aware ranks).
 * Molecule previews are rendered from the saved SMILES again; they are not stored.
 *
 * Each molecule's profile is computed once, when it is added, and does not depend on the other
 * molecules. Adding or deleting a molecule therefore never makes the others stale; the visible
 * ranking is always re-ordered from the saved profiles by the page's own ordering code.
 */
import { COMPARISON_CATEGORIES, COMPARISON_MODES } from "../ranking/comparisonModes";
import type { ComparisonCategory, ComparisonMetric, ComparisonModeId, ComparisonProfile } from "../ranking/comparisonTypes";

/** Bump when the shape or meaning of saved ranking profiles changes. */
export const RANKING_ENGINE_VERSION = 1;
export const MAX_RANKING_MOLECULES = 5;

export type RankingWorkspaceInputs = {
  editorKet: string | null;
  editorKey: string | null;
  activeCategory: ComparisonCategory;
  rankingMode: ComparisonModeId;
};

export type SavedRankingMolecule = {
  id: number;
  label: string;
  smiles: string;
  profile: ComparisonProfile;
};

export type DisplayedRanking = {
  modeId: ComparisonModeId;
  /** Molecule ids in the order they were shown. */
  order: number[];
  /** Tie-aware rank of each rankable molecule; empty for compare-only modes. */
  ranks: Array<[number, number]>;
};

export type RankingWorkspaceResults = {
  molecules: SavedRankingMolecule[];
  displayed: DisplayedRanking | null;
};

const MODE_IDS: ReadonlySet<string> = new Set(COMPARISON_MODES.map((mode) => mode.id));
const CATEGORIES: ReadonlySet<string> = new Set(COMPARISON_CATEGORIES);
const MAX_KET_CHARS = 1_500_000;
const MAX_SMILES_CHARS = 2000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function isComparisonModeId(value: unknown): value is ComparisonModeId {
  return typeof value === "string" && MODE_IDS.has(value);
}

export function validateRankingInputs(raw: unknown): RankingWorkspaceInputs | null {
  if (!isObject(raw)) return null;
  const { editorKet, editorKey, activeCategory, rankingMode } = raw;
  if (!isNullableString(editorKet) || !isNullableString(editorKey)) return null;
  if (typeof activeCategory !== "string" || !CATEGORIES.has(activeCategory)) return null;
  if (!isComparisonModeId(rankingMode)) return null;
  if (editorKet !== null) {
    if (editorKet.length > MAX_KET_CHARS) return null;
    try {
      const parsed: unknown = JSON.parse(editorKet);
      if (!isObject(parsed) || !isObject(parsed.root)) return null;
    } catch {
      return null;
    }
  }
  return { editorKet, editorKey, activeCategory: activeCategory as ComparisonCategory, rankingMode };
}

function isMetric(value: unknown): value is ComparisonMetric {
  if (!isObject(value)) return false;
  if (value.score !== null && !isFiniteNumber(value.score)) return false;
  if (typeof value.headline !== "string" || typeof value.detail !== "string") return false;
  if (value.factors !== undefined && !(Array.isArray(value.factors) && value.factors.every((f) => typeof f === "string"))) return false;
  if (value.sortVector !== undefined && !(Array.isArray(value.sortVector) && value.sortVector.every(isFiniteNumber))) return false;
  return true;
}

function isProfile(value: unknown): value is ComparisonProfile {
  if (!isObject(value) || typeof value.formula !== "string" || !isObject(value.metrics)) return false;
  // Every mode must be present, otherwise switching modes on a restored molecule would break.
  return COMPARISON_MODES.every((mode) => isMetric((value.metrics as Record<string, unknown>)[mode.id]));
}

function validateDisplayed(raw: unknown, ids: Set<number>): DisplayedRanking | null {
  if (!isObject(raw) || !isComparisonModeId(raw.modeId)) return null;
  if (!Array.isArray(raw.order) || raw.order.length !== ids.size) return null;
  if (!raw.order.every((id) => isFiniteNumber(id) && ids.has(id)) || new Set(raw.order).size !== ids.size) return null;
  if (!Array.isArray(raw.ranks)) return null;
  for (const entry of raw.ranks) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    if (!isFiniteNumber(entry[0]) || !ids.has(entry[0]) || !Number.isInteger(entry[1]) || entry[1] < 1) return null;
  }
  return { modeId: raw.modeId, order: raw.order as number[], ranks: raw.ranks as Array<[number, number]> };
}

/** Returns usable results, or null when the molecule list cannot be shown safely. */
export function validateRankingResults(raw: unknown): RankingWorkspaceResults | null {
  if (!isObject(raw) || !Array.isArray(raw.molecules)) return null;
  if (raw.molecules.length === 0 || raw.molecules.length > MAX_RANKING_MOLECULES) return null;
  const ids = new Set<number>();
  const smiles = new Set<string>();
  const molecules: SavedRankingMolecule[] = [];
  for (const entry of raw.molecules) {
    if (!isObject(entry) || !isFiniteNumber(entry.id) || ids.has(entry.id)) return null;
    if (typeof entry.label !== "string" || !entry.label.trim()) return null;
    if (typeof entry.smiles !== "string" || !entry.smiles.trim() || entry.smiles.length > MAX_SMILES_CHARS || /\s/.test(entry.smiles)) return null;
    if (smiles.has(entry.smiles) || !isProfile(entry.profile)) return null;
    ids.add(entry.id);
    smiles.add(entry.smiles);
    molecules.push({ id: entry.id, label: entry.label, smiles: entry.smiles, profile: entry.profile });
  }
  // The shown ranking is optional: if it is damaged the profiles can still be ordered again.
  return { molecules, displayed: validateDisplayed(raw.displayed, ids) };
}
