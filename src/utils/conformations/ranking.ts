/**
 * Conformational ranking (Stage 10B).
 *
 * A ranking is only ever made WITHIN ONE MOLECULE (one ring, or one bond), from the model energies the existing
 * engines already compute:
 *   - chairs: additive A-value strain (chair.ts), kcal/mol, only when every axial group has a documented A-value;
 *   - torsions: the textbook pairwise eclipsing + gauche model (torsion.ts), kJ/mol, only for H/CH3 substituents.
 * Anything else abstains (qualitative class ordering for torsions, or no ranking at all) rather than inventing numbers.
 * Energies from different molecules, or from different stereoisomers of "the same" constitution, are never
 * placed on a common scale: conformational preference is not absolute thermodynamic stability.
 *
 * No new energy parameters are introduced here; the references for the existing ones are in ENERGY_MODEL
 * (McMurry; Clayden et al.) and A_VALUE_TABLE (Eliel & Wilen; Jensen & Bushweller; Hirsch).
 */
import type { ConformationGraph } from "./graph";
import type { ChairAnalysis, ChairModel } from "./chair";
import {
  classify,
  energyProfile,
  energySupport,
  setupTorsion,
  strainBreakdownKJ,
  strainEnergyKJ,
  type TorsionSetup,
} from "./torsion";
import { wrap180, wrap360 } from "./geometry";

export const KCAL_PER_KJ = 1 / 4.184;
/** Energies closer than this are reported as tied. */
export const TIE_KJ = 0.05;

// ------------------------------------------------------------------------------------------------
// Comparison entries (what the user adds to a comparison; also what is saved)
// ------------------------------------------------------------------------------------------------

export type ComparisonEntry =
  | {
      id: string;
      kind: "chair";
      label: string;
      /** Canonical SMILES of the molecule the entry was taken from. */
      molecule: string;
      chair: { ring: number[]; flipped: boolean; choices: Record<string, "up" | "down"> };
    }
  | {
      id: string;
      kind: "torsion";
      label: string;
      molecule: string;
      torsion: { front: number; rear: number; frontRef: number | null; rearRef: number | null; rotation: number };
    };

export const MAX_COMPARISON_ENTRIES = 8;

export type RankedEntry = {
  entry: ComparisonEntry;
  /** 1 = most stable. Tied entries share a rank. */
  rank: number;
  tied: boolean;
  /** Relative energy within this comparison in kJ/mol, or null when only a qualitative order exists. */
  relativeKJ: number | null;
  /** Learner-facing reason for the position. */
  reason: string;
  /** Dihedral / conformer descriptor shown next to the label. */
  descriptor: string;
};

export type ComparisonResult =
  | {
      ok: true;
      basis: "chair-a-values" | "torsion-pairwise-model" | "torsion-qualitative";
      /** true when relativeKJ values are model numbers; false when the order is by class only. */
      quantified: boolean;
      ranked: RankedEntry[];
      notes: string[];
    }
  | { ok: false; reason: string };

export const NOT_ABSOLUTE_NOTE =
  "This ranks conformations of one molecule against each other. It is not a statement about the absolute stability of different molecules, and energies from different molecules are never compared.";

// ------------------------------------------------------------------------------------------------
// Torsion conformers of one bond
// ------------------------------------------------------------------------------------------------

export type TorsionConformer = {
  rotation: number;
  name: string;
  kind: "staggered" | "eclipsed" | "skew";
  relativeKJ: number | null;
};

/**
 * The six principal conformations of a bond (every 60 degrees from the reference), ordered from lowest to highest
 * model energy. When the model does not cover the substituents the energies are null and the order is by class only
 * (staggered before eclipsed), with ties.
 */
export function torsionConformers(graph: ConformationGraph, setup: TorsionSetup): { quantified: boolean; conformers: TorsionConformer[]; reason: string | null } {
  const support = energySupport(graph, setup);
  const profile = support.supported ? energyProfile(graph, setup) : null;
  const baseline = profile && profile.supported ? profile.baselineKJ : 0;
  const list: TorsionConformer[] = [0, 60, 120, 180, 240, 300].map((rotation) => {
    const cls = classify(graph, setup, rotation);
    const abs = support.supported ? strainEnergyKJ(graph, setup, rotation) : null;
    return { rotation: wrap180(rotation), name: cls.name, kind: cls.kind, relativeKJ: abs === null ? null : Math.max(0, abs - baseline) };
  });
  if (support.supported) {
    list.sort((a, b) => (a.relativeKJ as number) - (b.relativeKJ as number) || Math.abs(a.rotation) - Math.abs(b.rotation));
    return { quantified: true, conformers: list, reason: null };
  }
  const order = { staggered: 0, skew: 1, eclipsed: 2 } as const;
  list.sort((a, b) => order[a.kind] - order[b.kind] || Math.abs(a.rotation) - Math.abs(b.rotation));
  return { quantified: false, conformers: list, reason: support.reason };
}

function torsionDescriptor(graph: ConformationGraph, setup: TorsionSetup, rotation: number): string {
  const cls = classify(graph, setup, rotation);
  return `${Math.round(wrap360(rotation))}°, ${cls.name}`;
}

function torsionReason(graph: ConformationGraph, setup: TorsionSetup, rotation: number): string {
  const cls = classify(graph, setup, rotation);
  const parts = strainBreakdownKJ(graph, setup, rotation);
  if (!parts) {
    return cls.kind === "staggered"
      ? "Staggered: no torsional strain. Steric differences between these groups are not parameterised, so only the class is ranked."
      : cls.kind === "eclipsed"
        ? "Eclipsed: front and rear bonds line up, which costs torsional strain. The size of the penalty is not parameterised for these groups."
        : "Between staggered and eclipsed.";
  }
  const bits: string[] = [];
  if (parts.eclipsing < 0.05 && parts.gauche < 0.05) bits.push(`${cls.name === "anti" ? "Anti" : "Staggered"}: no eclipsing and no gauche CH₃/CH₃ interaction`);
  if (parts.eclipsing >= 0.05) bits.push(`${parts.eclipsing.toFixed(1)} kJ/mol from eclipsed bonds (torsional strain${cls.name === "fully eclipsed" ? " plus the CH₃/CH₃ clash" : ""})`);
  if (parts.gauche >= 0.05) bits.push(`${parts.gauche.toFixed(1)} kJ/mol from a gauche CH₃/CH₃ pair (steric crowding)`);
  return `${bits.join("; ")}.`;
}

// ------------------------------------------------------------------------------------------------
// Chair entries
// ------------------------------------------------------------------------------------------------

function chairStrainKcal(analysis: ChairAnalysis, flipped: boolean): number | null {
  return (flipped ? analysis.B : analysis.A).strainKcal;
}

function chairReason(analysis: ChairAnalysis, flipped: boolean): string {
  const side = flipped ? analysis.B : analysis.A;
  const axial = side.axialGroups.length === 0 ? "no non-hydrogen group is axial" : `axial: ${side.axialGroups.map((g) => `${g.label}${g.aValue !== null ? ` (A = ${g.aValue})` : " (no A-value)"}`).join(", ")}`;
  const dia = side.synDiaxial.length > 0 ? `; ${side.synDiaxial.length} 1,3-diaxial contact${side.synDiaxial.length === 1 ? "" : "s"} (${side.synDiaxial.filter((x) => x.partnerIsHydrogen).length} with hydrogen)` : "";
  return `${axial}${dia}.`;
}

// ------------------------------------------------------------------------------------------------
// Comparison
// ------------------------------------------------------------------------------------------------

export type ComparisonContext = {
  graph: ConformationGraph;
  /** Canonical SMILES of the molecule currently loaded. */
  molecule: string;
  /** Chair model + analysis for the entry's ring, built by the caller from the entry's ring and face choices. */
  chairFor: (entry: Extract<ComparisonEntry, { kind: "chair" }>) => { model: ChairModel; analysis: ChairAnalysis } | null;
};

/** Validates that the entries may be ranked together and, if so, ranks them (lowest model energy first). */
export function compareEntries(entries: ComparisonEntry[], context: ComparisonContext): ComparisonResult {
  if (entries.length === 0) return { ok: false, reason: "Add at least two conformations to compare." };
  if (entries.length < 2) return { ok: false, reason: "Add a second conformation to rank it against the first." };
  const molecules = new Set(entries.map((entry) => entry.molecule));
  if (molecules.size > 1) {
    return {
      ok: false,
      reason: `These entries come from different molecules (${[...molecules].join(", ")}). ${NOT_ABSOLUTE_NOTE} Compare conformations of one molecule at a time.`,
    };
  }
  if (entries[0].molecule !== context.molecule) {
    return { ok: false, reason: `These entries are for ${entries[0].molecule}, but ${context.molecule} is loaded. Load ${entries[0].molecule} again to rank them.` };
  }
  const kinds = new Set(entries.map((entry) => entry.kind));
  if (kinds.size > 1) return { ok: false, reason: "A chair and a Newman/sawhorse entry describe different motions (ring flip versus bond rotation) and are not ranked together." };

  if (entries[0].kind === "chair") return compareChairs(entries as Array<Extract<ComparisonEntry, { kind: "chair" }>>, context);
  return compareTorsions(entries as Array<Extract<ComparisonEntry, { kind: "torsion" }>>, context);
}

const sameChoices = (a: Record<string, string>, b: Record<string, string>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => a[key] === b[key]);
};

function compareChairs(entries: Array<Extract<ComparisonEntry, { kind: "chair" }>>, context: ComparisonContext): ComparisonResult {
  const first = entries[0].chair;
  for (const entry of entries) {
    if (entry.chair.ring.join("-") !== first.ring.join("-")) return { ok: false, reason: "These chairs belong to different rings. Rank chairs of one ring at a time." };
    if (!sameChoices(entry.chair.choices, first.choices)) {
      return {
        ok: false,
        reason: "These entries use different up/down substituent arrangements. Those are different stereoisomers (for example cis and trans), not conformers of one molecule, so their energies are not ranked against each other.",
      };
    }
  }
  const built = context.chairFor(entries[0]);
  if (!built) return { ok: false, reason: "The chair analysis for this ring is not available (unspecified ring stereochemistry or an unsupported ring)." };
  const { analysis } = built;
  if (analysis.preference.kind === "no-substituents") return { ok: false, reason: analysis.preference.summary };
  const rows = entries.map((entry) => ({ entry, kcal: chairStrainKcal(analysis, entry.chair.flipped) }));
  if (rows.some((row) => row.kcal === null)) {
    const kind = analysis.preference.kind === "unassessed" ? analysis.preference.summary : "A-values are missing for an axial group.";
    return { ok: false, reason: `${kind} Without a documented A-value for every axial group the chairs are not ranked.` };
  }
  const minKcal = Math.min(...rows.map((row) => row.kcal as number));
  const sorted = rows.map((row) => ({ ...row, relativeKJ: ((row.kcal as number) - minKcal) / KCAL_PER_KJ })).sort((a, b) => a.relativeKJ - b.relativeKJ);
  const ranked = assignRanks(sorted.map((row) => ({ entry: row.entry, relativeKJ: row.relativeKJ, reason: chairReason(analysis, row.entry.chair.flipped), descriptor: row.entry.chair.flipped ? "Chair B" : "Chair A" })));
  const lowerBound = [...analysis.A.axialGroups, ...analysis.B.axialGroups].some((g) => g.lowerBound);
  const notes = [
    "Ranked by the additive A-value model: the strain of a chair is the sum of the A-values of its axial groups.",
    ...(lowerBound ? ["At least one A-value is a lower bound, so the gap between the chairs is at least the value shown."] : []),
    ...analysis.notIncluded,
    NOT_ABSOLUTE_NOTE,
  ];
  return { ok: true, basis: "chair-a-values", quantified: true, ranked, notes };
}

function compareTorsions(entries: Array<Extract<ComparisonEntry, { kind: "torsion" }>>, context: ComparisonContext): ComparisonResult {
  const key = (entry: (typeof entries)[number]) => [entry.torsion.front, entry.torsion.rear].sort((a, b) => a - b).join("-");
  const first = key(entries[0]);
  if (entries.some((entry) => key(entry) !== first)) return { ok: false, reason: "These entries view different bonds. Rank conformations of one bond at a time; the same bond seen from either end counts as one bond." };
  const rows = entries.map((entry) => {
    const setup = setupTorsion(context.graph, entry.torsion.front, entry.torsion.rear, { frontRef: entry.torsion.frontRef ?? undefined, rearRef: entry.torsion.rearRef ?? undefined });
    return { entry, setup };
  });
  const support = energySupport(context.graph, rows[0].setup);
  if (support.supported) {
    // The baseline is the lowest energy of this bond's own profile, so values do not depend on which entries were added.
    const profile = energyProfile(context.graph, rows[0].setup);
    const baseline = profile.supported ? profile.baselineKJ : 0;
    const sorted = rows
      .map((row) => ({ ...row, relativeKJ: Math.max(0, (strainEnergyKJ(context.graph, row.setup, row.entry.torsion.rotation) as number) - baseline) }))
      .sort((a, b) => a.relativeKJ - b.relativeKJ);
    const ranked = assignRanks(sorted.map((row) => ({ entry: row.entry, relativeKJ: row.relativeKJ, reason: torsionReason(context.graph, row.setup, row.entry.torsion.rotation), descriptor: torsionDescriptor(context.graph, row.setup, row.entry.torsion.rotation) })));
    return {
      ok: true,
      basis: "torsion-pairwise-model",
      quantified: true,
      ranked,
      notes: ["Energies are relative to the lowest conformation of this bond and come from the teaching model (textbook eclipsing and gauche increments), not a force field or quantum-chemical calculation.", NOT_ABSOLUTE_NOTE],
    };
  }
  // qualitative: class order only
  const order = { staggered: 0, skew: 1, eclipsed: 2 } as const;
  const sorted = rows
    .map((row) => ({ ...row, cls: classify(context.graph, row.setup, row.entry.torsion.rotation) }))
    .sort((a, b) => order[a.cls.kind] - order[b.cls.kind]);
  let rank = 0;
  let previous: string | null = null;
  const ranked: RankedEntry[] = sorted.map((row, index) => {
    if (row.cls.kind !== previous) {
      rank = index + 1;
      previous = row.cls.kind;
    }
    const tied = sorted.filter((other) => other.cls.kind === row.cls.kind).length > 1;
    return { entry: row.entry, rank, tied, relativeKJ: null, reason: torsionReason(context.graph, row.setup, row.entry.torsion.rotation), descriptor: torsionDescriptor(context.graph, row.setup, row.entry.torsion.rotation) };
  });
  return {
    ok: true,
    basis: "torsion-qualitative",
    quantified: false,
    ranked,
    notes: [support.reason, "Only the class (staggered below eclipsed) is ranked. No energies are shown because none are parameterised for these groups, and conformations of the same class are tied.", NOT_ABSOLUTE_NOTE],
  };
}

function assignRanks(rows: Array<{ entry: ComparisonEntry; relativeKJ: number; reason: string; descriptor: string }>): RankedEntry[] {
  const out: RankedEntry[] = [];
  let rank = 0;
  rows.forEach((row, index) => {
    const prev = out[index - 1];
    if (!prev || row.relativeKJ - (prev.relativeKJ as number) > TIE_KJ) rank = index + 1;
    out.push({ ...row, rank, tied: false });
  });
  for (const row of out) row.tied = out.filter((other) => other.rank === row.rank).length > 1;
  return out;
}

/** A stable id for an entry so that adding the same conformation twice is recognised. */
export function entrySignature(entry: ComparisonEntry): string {
  if (entry.kind === "chair") return `chair|${entry.molecule}|${entry.chair.ring.join("-")}|${entry.chair.flipped ? "B" : "A"}|${JSON.stringify(Object.entries(entry.chair.choices).sort())}`;
  const t = entry.torsion;
  return `torsion|${entry.molecule}|${[t.front, t.rear].join(">")}|${Math.round(wrap360(t.rotation))}|${t.frontRef}|${t.rearRef}`;
}
