/**
 * Experimental pKa reference lookup (optional, locally built, lazily loaded).
 *
 * The data come from the IUPAC Digitized pKa Dataset (CC BY-NC 4.0, see
 * scripts/buildPkaReferenceIndex.mjs). Nothing here is bundled into the application: the compact index is
 * fetched on demand from `data/pka-reference.index.json` and every caller must work when it is absent.
 *
 * Scientific rules implemented here:
 *  - Records belong to a molecule only through an exact canonical-SMILES identity (charge state, tautomer,
 *    salt form and stereochemistry all part of the key). The one relaxation is documented in `matchReference`.
 *  - Reference constants are MACROSCOPIC (whole-molecule charge-state transitions). They are assigned to an
 *    individual site only when the structure makes the assignment unambiguous (`assignToSites`).
 *  - Conflicting measurements are reported as a range, never averaged.
 */

export type PkaKind = "acid" | "conjugateAcid" | "pKb";

/** [type, value, temperature °C | null, assessment, reference code, conditions ("" = plain water)] */
export type PkaRecord = [string, number, number | null, string, string, string];

export type PkaIndex = {
  v: 1;
  source: { name: string; version: string; license: string; url: string; doi: string; attribution: string };
  /** canonical isomeric SMILES -> { s: 1 when the stored structure specifies stereochemistry, r: records } */
  e: Record<string, { s: 0 | 1; r: PkaRecord[] }>;
};

export type PkaKeys = { iso: string; flat: string; tetrahedralCenters: number; hasDoubleBondStereo: boolean; generic: boolean };

type RdkitMol = { get_smiles(details?: string): string; delete(): void };
type RdkitLike = { get_mol(structure: string): RdkitMol | null };

/** Canonical identity keys. `generic` is set for structures with unspecified substituents or dummy atoms. */
export function pkaKeys(rdkit: RdkitLike, structure: string): PkaKeys | null {
  const mol = rdkit.get_mol(structure);
  if (!mol) return null;
  try {
    const iso = mol.get_smiles();
    const flat = mol.get_smiles(JSON.stringify({ doIsomericSmiles: false }));
    return {
      iso,
      flat,
      tetrahedralCenters: (iso.match(/@@?/g) ?? []).length,
      hasDoubleBondStereo: /[/\\]/.test(iso),
      generic: /\*|\[R\d*\]|\[#0\]/.test(iso),
    };
  } finally {
    mol.delete();
  }
}

export type ReferenceMatch = {
  record: PkaIndex["e"][string];
  /** "exact": identical canonical structure. "enantiomer": stereo-free reference applied to a molecule with one stereocentre. */
  basis: "exact" | "enantiomer";
};

/**
 * Match policy (conservative):
 *  1. Generic structures never match.
 *  2. Exact canonical isomeric SMILES match (same connectivity, charges, protonation state, stereochemistry).
 *  3. A reference record that has no stereochemistry applies to a query with exactly one tetrahedral centre
 *     and no double-bond stereo: enantiomers have identical acid-base constants in an achiral solvent.
 *     With two or more stereocentres diastereomers can differ, so there is no match.
 *  4. A query without stereochemistry never inherits a stereo-specific record.
 *  Salts, mixtures, tautomers and other charge states are never merged: they have different canonical keys.
 */
export function matchReference(index: PkaIndex, keys: PkaKeys | null): ReferenceMatch | null {
  if (!keys || keys.generic) return null;
  const exact = index.e[keys.iso];
  if (exact) return { record: exact, basis: "exact" };
  if (keys.iso !== keys.flat && keys.tetrahedralCenters === 1 && !keys.hasDoubleBondStereo) {
    const flat = index.e[keys.flat];
    if (flat && flat.s === 0) return { record: flat, basis: "enantiomer" };
  }
  return null;
}

export type PkaConstant = {
  kind: PkaKind;
  /** 1 for pKa1 / pKaH1 / pKb1, and so on: the dataset's step number from the neutral reference structure. */
  step: number;
  /** Representative value: the median of agreeing measurements, or null when they disagree. */
  value: number | null;
  min: number;
  max: number;
  count: number;
  assessment: string;
  tempC: number | null;
  conflict: boolean;
};

const TYPE_PATTERN = /^(a|h|b)(\d+)$/;
const TIER: Record<string, number> = { Reliable: 3, Approximate: 2, Uncertain: 1 };
const AGREEMENT_SPREAD = 0.5;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * One constant per dissociation step. Only aqueous records without a cosolvent or pressure label are used, at the
 * temperature closest to 25 °C (within 5 °C); the best assessment tier present is kept. Values within 0.5 pK units
 * are summarised by their median; wider disagreement is reported as a range with `value: null`.
 */
export function summarizeConstants(records: readonly PkaRecord[]): PkaConstant[] {
  const groups = new Map<string, PkaRecord[]>();
  for (const record of records) {
    if (record[5] !== "" || !TYPE_PATTERN.test(record[0])) continue;
    groups.set(record[0], [...(groups.get(record[0]) ?? []), record]);
  }
  const out: PkaConstant[] = [];
  for (const [type, group] of groups) {
    const near = group.filter((r) => r[2] != null && Math.abs((r[2] as number) - 25) <= 5);
    if (!near.length) continue;
    const bestT = Math.min(...near.map((r) => Math.abs((r[2] as number) - 25)));
    const atT = near.filter((r) => Math.abs((r[2] as number) - 25) === bestT);
    const bestTier = Math.max(...atT.map((r) => TIER[r[3]] ?? 0));
    const kept = atT.filter((r) => (TIER[r[3]] ?? 0) === bestTier);
    const values = kept.map((r) => r[1]);
    const match = TYPE_PATTERN.exec(type)!;
    const conflict = Math.max(...values) - Math.min(...values) > AGREEMENT_SPREAD;
    out.push({
      kind: match[1] === "a" ? "acid" : match[1] === "h" ? "conjugateAcid" : "pKb",
      step: Number(match[2]),
      value: conflict ? null : Math.round(median(values) * 100) / 100,
      min: Math.min(...values),
      max: Math.max(...values),
      count: kept.length,
      assessment: kept[0][3] || "Unrated",
      tempC: kept[0][2],
      conflict,
    });
  }
  const order = { acid: 0, conjugateAcid: 1, pKb: 2 } as const;
  return out.sort((a, b) => order[a.kind] - order[b.kind] || a.step - b.step);
}

export type SiteForAssignment = { id: string; kind: "Acid" | "Base"; estimate: number; range: readonly [number, number] };

/** Window in which an aqueous constant is experimentally meaningful. */
const AQUEOUS_WINDOW: readonly [number, number] = [-2, 16];
const MAX_DISAGREEMENT = 4;
const inWindow = (value: number) => value >= AQUEOUS_WINDOW[0] && value <= AQUEOUS_WINDOW[1];
const overlapsWindow = (range: readonly [number, number]) => range[1] >= AQUEOUS_WINDOW[0] && range[0] <= AQUEOUS_WINDOW[1];

export type SiteAssignment = { siteId: string; constant: PkaConstant };

/**
 * Site assignment, deliberately strict. A macroscopic constant is attached to a site only when
 *  - the molecule has exactly one model site of that behaviour whose estimated range reaches the aqueous window, and
 *  - the reference holds exactly one single-valued constant of the matching kind inside the window, and
 *  - it lies within 4 pK units of the model estimate (a larger gap suggests a different ionisation, not this site).
 * Otherwise nothing is assigned and the constants remain molecular reference values.
 * Acid sites pair with pKa-type constants; base sites with conjugate-acid (pKaH) constants. pKb is never site-assigned.
 */
export function assignToSites(sites: readonly SiteForAssignment[], constants: readonly PkaConstant[]): SiteAssignment[] {
  const out: SiteAssignment[] = [];
  for (const behaviour of ["Acid", "Base"] as const) {
    const kind: PkaKind = behaviour === "Acid" ? "acid" : "conjugateAcid";
    const candidates = sites.filter((s) => s.kind === behaviour && overlapsWindow(s.range));
    const matching = constants.filter((c) => c.kind === kind && c.value != null && inWindow(c.value));
    if (candidates.length !== 1 || matching.length !== 1) continue;
    if (Math.abs((matching[0].value as number) - candidates[0].estimate) > MAX_DISAGREEMENT) continue;
    out.push({ siteId: candidates[0].id, constant: matching[0] });
  }
  return out;
}

/** Display text for one constant, e.g. "4.76", or "4.1 to 5.2 (measurements disagree)". */
export function formatConstant(c: PkaConstant): string {
  if (c.value != null) return trim(c.value);
  return `${trim(c.min)} to ${trim(c.max)}`;
}
const trim = (n: number) => String(Math.round(n * 100) / 100);

export const CONSTANT_LABEL: Record<PkaKind, string> = { acid: "pKa", conjugateAcid: "pKaH", pKb: "pKb" };

let indexPromise: Promise<PkaIndex | null> | null = null;

/** Lazily loads the optional local index. Resolves to null (never rejects) when it is not installed. */
export function loadPkaIndex(): Promise<PkaIndex | null> {
  indexPromise ??= (async () => {
    try {
      const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
      const response = await fetch(`${base}data/pka-reference.index.json`, { cache: "force-cache" });
      if (!response.ok) return null;
      const parsed = (await response.json()) as PkaIndex;
      return parsed && parsed.v === 1 && parsed.e ? parsed : null;
    } catch {
      return null; // not installed, not JSON (dev servers answer unknown paths with HTML), or offline without the file
    }
  })();
  return indexPromise;
}

/** Test hook: install an index without a network fetch. */
export function setPkaIndexForTests(index: PkaIndex | null): void {
  indexPromise = Promise.resolve(index);
}
