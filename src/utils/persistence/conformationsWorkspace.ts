/**
 * What the Conformations page persists, and how saved data is validated before it is shown.
 *
 * Stored (inputs): the source structure as the user gave it (SMILES or molfile text, so atom indices
 * mean the same thing on reopening), the active view, the selected ring and substituent faces, the chair
 * that was showing, the viewed bond, its direction and reference groups, and the current rotation.
 *
 * Stored (results): the assessment that was on screen, as numbers and labels, together with the model
 * version and the stated limits. When a saved analysis is opened the live views are rebuilt from the
 * inputs and compared with these saved results; a difference is reported, never silently replaced.
 *
 * Not stored: drawings (rebuilt from the model), practice answers, Ketcher editor content.
 */

/** Bump when the meaning of a saved assessment changes. */
export const CONFORMATIONS_ENGINE_VERSION = 1;

import type { ComparisonEntry } from "../conformations/ranking";
import { MAX_COMPARISON_ENTRIES } from "../conformations/ranking";

export type ConformationsMode = "chair" | "newman" | "sawhorse";

export type ConformationsWorkspaceInputs = {
  source: { kind: "smiles" | "molfile"; text: string } | null;
  mode: ConformationsMode;
  chair: {
    /** Atom indices of the selected ring, in path order. */
    ring: number[] | null;
    /** false = Chair A, true = Chair B. */
    flipped: boolean;
    /** Explicit up/down choices for ring atoms whose stereochemistry the input does not specify, by ring atom index. */
    choices: Record<string, "up" | "down">;
  };
  torsion: {
    front: number | null;
    rear: number | null;
    frontRef: number | null;
    rearRef: number | null;
    /** Dihedral between the reference groups, degrees. */
    rotation: number;
  };
  /** Conformations the user added to the within-molecule comparison (Stage 10B). Energies are recomputed, never stored. */
  comparison: ComparisonEntry[];
};

export type ChairSummary = {
  ring: number[];
  status: "ready" | "needs-choice";
  preferenceKind: "no-substituents" | "equivalent-by-symmetry" | "quantified" | "unassessed";
  preferred: "Chair A" | "Chair B" | "equal" | null;
  deltaKcal: number | null;
  strainAKcal: number | null;
  strainBKcal: number | null;
  axialA: string[];
  axialB: string[];
  showing: "Chair A" | "Chair B";
};

export type TorsionSummary = {
  front: number;
  rear: number;
  rotation: number;
  kind: "staggered" | "eclipsed" | "skew";
  name: string;
  energyKJ: number | null;
  /** Energy relative to the lowest conformation of this bond, or null if the model does not cover the substituents. */
  relativeKJ: number | null;
  quantified: boolean;
};

export type ConformationsWorkspaceResults = {
  smiles: string;
  mode: ConformationsMode;
  engineVersion: number;
  chair: ChairSummary | null;
  torsion: TorsionSummary | null;
  /** The limits that applied, shown with the saved values. */
  limits: string[];
};

const MODES: readonly string[] = ["chair", "newman", "sawhorse"];
const MAX_SOURCE_CHARS = 1_000_000;
const MAX_ATOMS = 2000;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isIndex = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_ATOMS;
const isNullableIndex = (value: unknown): value is number | null => value === null || isIndex(value);
const isNullableNumber = (value: unknown): value is number | null => value === null || isFiniteNumber(value);

function validComparison(raw: unknown): ComparisonEntry[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_COMPARISON_ENTRIES) return null;
  const out: ComparisonEntry[] = [];
  for (const item of raw) {
    if (!isObject(item) || !isString(item.id) || item.id.length > 40 || !isString(item.label) || item.label.length > 120 || !isString(item.molecule) || item.molecule.length === 0 || item.molecule.length > 2000) return null;
    if (item.kind === "chair") {
      const c = item.chair;
      if (!isObject(c) || typeof c.flipped !== "boolean" || !Array.isArray(c.ring) || c.ring.length !== 6 || !c.ring.every(isIndex) || !isObject(c.choices)) return null;
      const choices: Record<string, "up" | "down"> = {};
      for (const [k, v] of Object.entries(c.choices)) {
        if (!/^\d{1,4}$/.test(k) || (v !== "up" && v !== "down")) return null;
        choices[k] = v;
      }
      out.push({ id: item.id, kind: "chair", label: item.label, molecule: item.molecule, chair: { ring: c.ring as number[], flipped: c.flipped, choices } });
    } else if (item.kind === "torsion") {
      const t = item.torsion;
      if (!isObject(t) || !isIndex(t.front) || !isIndex(t.rear) || !isNullableIndex(t.frontRef) || !isNullableIndex(t.rearRef) || !isFiniteNumber(t.rotation) || Math.abs(t.rotation) > 720) return null;
      out.push({ id: item.id, kind: "torsion", label: item.label, molecule: item.molecule, torsion: { front: t.front as number, rear: t.rear as number, frontRef: t.frontRef as number | null, rearRef: t.rearRef as number | null, rotation: t.rotation } });
    } else return null;
  }
  return out;
}

export function validateConformationsInputs(raw: unknown): ConformationsWorkspaceInputs | null {
  if (!isObject(raw)) return null;
  const { source, mode, chair, torsion } = raw;
  const comparison = validComparison(raw.comparison);
  if (comparison === null) return null;
  if (!isString(mode) || !MODES.includes(mode)) return null;
  let cleanSource: ConformationsWorkspaceInputs["source"] = null;
  if (source !== null) {
    if (!isObject(source) || (source.kind !== "smiles" && source.kind !== "molfile") || !isString(source.text)) return null;
    if (source.text.length === 0 || source.text.length > MAX_SOURCE_CHARS) return null;
    cleanSource = { kind: source.kind, text: source.text };
  }
  if (!isObject(chair) || typeof chair.flipped !== "boolean" || !isObject(chair.choices)) return null;
  if (chair.ring !== null && !(Array.isArray(chair.ring) && chair.ring.length === 6 && chair.ring.every(isIndex))) return null;
  const choices: Record<string, "up" | "down"> = {};
  for (const [key, value] of Object.entries(chair.choices)) {
    if (!/^\d{1,4}$/.test(key) || (value !== "up" && value !== "down")) return null;
    choices[key] = value;
  }
  if (!isObject(torsion)) return null;
  if (!isNullableIndex(torsion.front) || !isNullableIndex(torsion.rear) || !isNullableIndex(torsion.frontRef) || !isNullableIndex(torsion.rearRef)) return null;
  if (!isFiniteNumber(torsion.rotation) || Math.abs(torsion.rotation) > 720) return null;
  return {
    source: cleanSource,
    mode: mode as ConformationsMode,
    chair: { ring: chair.ring as number[] | null, flipped: chair.flipped, choices },
    torsion: {
      front: torsion.front as number | null,
      rear: torsion.rear as number | null,
      frontRef: torsion.frontRef as number | null,
      rearRef: torsion.rearRef as number | null,
      rotation: torsion.rotation,
    },
    comparison,
  };
}

function validChairSummary(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    Array.isArray(value.ring) && value.ring.length === 6 && value.ring.every(isIndex) &&
    (value.status === "ready" || value.status === "needs-choice") &&
    ["no-substituents", "equivalent-by-symmetry", "quantified", "unassessed"].includes(value.preferenceKind as string) &&
    (value.preferred === null || ["Chair A", "Chair B", "equal"].includes(value.preferred as string)) &&
    isNullableNumber(value.deltaKcal) && isNullableNumber(value.strainAKcal) && isNullableNumber(value.strainBKcal) &&
    Array.isArray(value.axialA) && value.axialA.every(isString) && Array.isArray(value.axialB) && value.axialB.every(isString) &&
    (value.showing === "Chair A" || value.showing === "Chair B")
  );
}

function validTorsionSummary(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    isIndex(value.front) && isIndex(value.rear) && isFiniteNumber(value.rotation) &&
    ["staggered", "eclipsed", "skew"].includes(value.kind as string) && isString(value.name) &&
    isNullableNumber(value.energyKJ) && isNullableNumber(value.relativeKJ) && typeof value.quantified === "boolean"
  );
}

/** Returns usable results, or null when they cannot be shown safely. */
export function validateConformationsResults(raw: unknown): ConformationsWorkspaceResults | null {
  if (!isObject(raw)) return null;
  if (!isString(raw.smiles) || !raw.smiles.trim() || raw.smiles.length > MAX_SOURCE_CHARS) return null;
  if (!isString(raw.mode) || !MODES.includes(raw.mode)) return null;
  if (!isFiniteNumber(raw.engineVersion)) return null;
  if (raw.chair !== null && !validChairSummary(raw.chair)) return null;
  if (raw.torsion !== null && !validTorsionSummary(raw.torsion)) return null;
  if (!Array.isArray(raw.limits) || raw.limits.length > 50 || !raw.limits.every(isString)) return null;
  if (raw.chair === null && raw.torsion === null) return null;
  return raw as unknown as ConformationsWorkspaceResults;
}

/** The one-line description a saved conformations analysis gets in the library list. */
export function describeConformationsAnalysis(data: Pick<ConformationsWorkspaceResults, "smiles" | "mode" | "chair" | "torsion">): string {
  if (data.mode === "chair" && data.chair) {
    const pref = data.chair.preferenceKind === "quantified" && data.chair.preferred && data.chair.preferred !== "equal"
      ? `${data.chair.preferred} favoured by ${data.chair.deltaKcal?.toFixed(2)} kcal/mol (additive A-values)`
      : data.chair.preferenceKind === "unassessed" ? "stability not assessed"
      : data.chair.preferenceKind === "equivalent-by-symmetry" ? "chairs equivalent by symmetry" : "no substituents";
    return `${data.smiles} · cyclohexane chair, ${data.chair.showing} · ${pref}`;
  }
  if (data.torsion) {
    const energy = data.torsion.quantified && data.torsion.relativeKJ !== null ? `${data.torsion.relativeKJ.toFixed(1)} kJ/mol above the lowest` : "no numeric energy";
    return `${data.smiles} · ${data.mode === "sawhorse" ? "sawhorse" : "Newman"} about atoms ${data.torsion.front}–${data.torsion.rear}, ${data.torsion.name} at ${data.torsion.rotation.toFixed(0)}° · ${energy}`;
  }
  return data.smiles;
}
