/**
 * Saved state of the Stage 28 General Chemistry laboratories: Atomic structure (page "atomic"), Bonding and geometry ("bonding") and
 * Molecular orbitals ("molorbitals"); subject "general". As for every tool the inputs hold everything needed to rebuild a result; every
 * number the page shows is re-derived from them when a record is opened, and the stored results are only a display summary plus one
 * `check` number. Validators build new objects from known fields and reject anything of the wrong type or outside the model's bounds;
 * they never coerce. The learning state (mode, selected practice and challenge question) is saved with the inputs.
 */
import { checkQuantumNumbers } from "../generalChem/quantum28";
import { MAX_TRANSITION_N, SUPPORTED_Z, isSupportedOrbital, transition, type OrbitalBasis, type SlicePlane } from "../generalChem/hydrogenic28";
import { BUILD_SUBSHELLS, MAX_Z, configurationFor } from "../generalChem/config28";
import { MOLECULES, getMolecule } from "../generalChem/lewis28";
import { POLARITY_ELEMENTS } from "../generalChem/vsepr28";
import { boxesOf, getDiatomic } from "../generalChem/mo28";

export { validateToolResults as validateGcResults28 } from "./generalChemTools";

export const ATOMIC_ENGINE_VERSION = 1;
export const BONDING_ENGINE_VERSION = 1;
export const MOLORBITALS_ENGINE_VERSION = 1;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

// ---- learning state ---------------------------------------------------------------------------------------------------------------------

export const LEARN_MODES_28 = ["explore", "practice", "challenge"] as const;
export type LearnMode28 = (typeof LEARN_MODES_28)[number];
export type LearnState28 = { mode: LearnMode28; practice: number; challenge: number };
export const DEFAULT_LEARN_28: LearnState28 = { mode: "explore", practice: 0, challenge: 0 };
function validateLearn(raw: unknown): LearnState28 | null {
  if (!isObject(raw) || !oneOf(raw.mode, LEARN_MODES_28)) return null;
  if (!int(raw.practice, 0, 49) || !int(raw.challenge, 0, 49)) return null;
  return { mode: raw.mode, practice: raw.practice, challenge: raw.challenge };
}

// ---- atomic structure --------------------------------------------------------------------------------------------------------------------

export const ATOMIC_VIEWS = ["quantum", "orbital", "config", "spectra"] as const;
export type AtomicView = (typeof ATOMIC_VIEWS)[number];
export const ATOMIC_VIEW_LABEL: Record<AtomicView, string> = { quantum: "Quantum numbers", orbital: "Hydrogenic orbitals", config: "Electron configurations", spectra: "Transitions and spectra" };
export const SLICE_PLANES: readonly SlicePlane[] = ["xz", "xy", "yz"];
export const ORBITAL_MODES = ["density", "amplitude"] as const;
export type OrbitalMode = (typeof ORBITAL_MODES)[number];

export type AtomicInputs = {
  subject: "general";
  tool: "atomic";
  view: AtomicView;
  /** The quantum-number explorer may hold an invalid combination: that is how it explains why it is not allowed. */
  q: { n: number; l: number; ml: number; ms: 1 | -1 };
  orbital: { n: number; l: number; ml: number; basis: OrbitalBasis; plane: SlicePlane; mode: OrbitalMode; enclosurePct: number; Z: number };
  config: { Z: number; charge: number; build: number[] | null };
  spectra: { Z: number; ni: number; nf: number };
  learn: LearnState28;
};
export const DEFAULT_ATOMIC_INPUTS: AtomicInputs = {
  subject: "general", tool: "atomic", view: "quantum",
  q: { n: 3, l: 2, ml: 1, ms: 1 },
  orbital: { n: 2, l: 1, ml: 0, basis: "real", plane: "xz", mode: "density", enclosurePct: 90, Z: 1 },
  config: { Z: 26, charge: 0, build: null },
  spectra: { Z: 1, ni: 3, nf: 2 },
  learn: DEFAULT_LEARN_28,
};

export function validateAtomicInputs(raw: unknown): AtomicInputs | null {
  if (!isObject(raw) || raw.subject !== "general" || raw.tool !== "atomic" || !oneOf(raw.view, ATOMIC_VIEWS)) return null;
  const q = raw.q; const o = raw.orbital; const c = raw.config; const s = raw.spectra; const learn = validateLearn(raw.learn);
  if (!isObject(q) || !isObject(o) || !isObject(c) || !isObject(s) || !learn) return null;
  if (!int(q.n, 1, 7) || !int(q.l, 0, 6) || !int(q.ml, -6, 6) || (q.ms !== 1 && q.ms !== -1)) return null;
  if (!int(o.n, 1, 3) || !int(o.l, 0, 2) || !int(o.ml, -2, 2) || !oneOf(o.basis, ["real", "complex"] as const) || !oneOf(o.plane, SLICE_PLANES) || !oneOf(o.mode, ORBITAL_MODES) || !int(o.enclosurePct, 50, 99) || !int(o.Z, 1, 4)) return null;
  if (!isSupportedOrbital(o.n, o.l) || !checkQuantumNumbers({ n: o.n, l: o.l, ml: o.ml }).ok || !(SUPPORTED_Z as readonly number[]).includes(o.Z)) return null;
  if (!int(c.Z, 1, MAX_Z) || !int(c.charge, -3, 8) || !configurationFor(c.Z, c.charge).ok) return null;
  let build: number[] | null = null;
  if (c.build !== null) {
    if (!Array.isArray(c.build) || c.build.length !== BUILD_SUBSHELLS.length) return null;
    if (!c.build.every((v, i) => int(v, 0, 14) && (v as number) <= 2 * (2 * BUILD_SUBSHELLS[i].l + 1))) return null;
    build = [...(c.build as number[])];
  }
  if (!int(s.Z, 1, 4) || !int(s.ni, 1, MAX_TRANSITION_N) || !int(s.nf, 1, MAX_TRANSITION_N) || !transition(s.ni, s.nf, s.Z).ok) return null;
  return {
    subject: "general", tool: "atomic", view: raw.view,
    q: { n: q.n, l: q.l, ml: q.ml, ms: q.ms },
    orbital: { n: o.n, l: o.l, ml: o.ml, basis: o.basis, plane: o.plane, mode: o.mode, enclosurePct: o.enclosurePct, Z: o.Z },
    config: { Z: c.Z, charge: c.charge, build }, spectra: { Z: s.Z, ni: s.ni, nf: s.nf }, learn,
  };
}
export function describeAtomicAnalysis(i: AtomicInputs): string {
  if (i.view === "quantum") return `Quantum numbers n = ${i.q.n}, l = ${i.q.l}, m_l = ${i.q.ml}`;
  if (i.view === "orbital") return `Hydrogenic orbital n = ${i.orbital.n}, l = ${i.orbital.l}, m_l = ${i.orbital.ml}`;
  if (i.view === "config") return `Electron configuration, Z = ${i.config.Z}${i.config.charge ? `, charge ${i.config.charge > 0 ? "+" : ""}${i.config.charge}` : ""}`;
  return `Transition n = ${i.spectra.ni} → ${i.spectra.nf}, Z = ${i.spectra.Z}`;
}

// ---- bonding and geometry ----------------------------------------------------------------------------------------------------------------

export const BONDING_VIEWS = ["lewis", "geometry", "polarity", "hybrid"] as const;
export type BondingView = (typeof BONDING_VIEWS)[number];
export const BONDING_VIEW_LABEL: Record<BondingView, string> = { lewis: "Lewis structures", geometry: "VSEPR geometry", polarity: "Polarity", hybrid: "Hybridisation" };

export type BondingInputs = {
  subject: "general";
  tool: "bonding";
  view: BondingView;
  molecule: string;
  /** The student's Lewis structure (starts from, and can be reset to, a curated one). */
  lewis: { bondOrders: number[]; lonePairs: number[]; structure: number };
  /** Abstract electron-domain explorer. `source` chooses whether the geometry view shows the curated molecule or this selection. */
  vsepr: { X: number; E: number; source: "molecule" | "domains" };
  geometry: { azimuth: number; elevation: number; showLonePairs: boolean; showDomains: boolean; showAngles: boolean; showDipoles: boolean };
  polarity: { a: string; b: string };
  learn: LearnState28;
};
export const DEFAULT_BONDING_INPUTS: BondingInputs = {
  subject: "general", tool: "bonding", view: "lewis", molecule: "no3",
  lewis: { bondOrders: [2, 1, 1], lonePairs: [0, 2, 3, 3], structure: 0 },
  vsepr: { X: 4, E: 0, source: "molecule" },
  geometry: { azimuth: 25, elevation: 15, showLonePairs: true, showDomains: true, showAngles: true, showDipoles: false },
  polarity: { a: "C", b: "O" },
  learn: DEFAULT_LEARN_28,
};

export function validateBondingInputs(raw: unknown): BondingInputs | null {
  if (!isObject(raw) || raw.subject !== "general" || raw.tool !== "bonding" || !oneOf(raw.view, BONDING_VIEWS)) return null;
  if (typeof raw.molecule !== "string") return null;
  const m = getMolecule(raw.molecule);
  const l = raw.lewis; const v = raw.vsepr; const g = raw.geometry; const p = raw.polarity; const learn = validateLearn(raw.learn);
  if (!m || !isObject(l) || !isObject(v) || !isObject(g) || !isObject(p) || !learn) return null;
  if (!Array.isArray(l.bondOrders) || !Array.isArray(l.lonePairs) || l.bondOrders.length !== m.bonds.length || l.lonePairs.length !== m.atoms.length) return null;
  if (!l.bondOrders.every((b) => int(b, 1, 3)) || !l.lonePairs.every((n) => int(n, 0, 4)) || !int(l.structure, -1, m.structures.length - 1)) return null;
  if (!int(v.X, 0, 8) || !int(v.E, 0, 8) || !oneOf(v.source, ["molecule", "domains"] as const)) return null;
  if (!int(g.azimuth, -180, 180) || !int(g.elevation, -90, 90) || typeof g.showLonePairs !== "boolean" || typeof g.showDomains !== "boolean" || typeof g.showAngles !== "boolean" || typeof g.showDipoles !== "boolean") return null;
  if (typeof p.a !== "string" || typeof p.b !== "string" || !POLARITY_ELEMENTS.includes(p.a) || !POLARITY_ELEMENTS.includes(p.b)) return null;
  return {
    subject: "general", tool: "bonding", view: raw.view, molecule: m.id,
    lewis: { bondOrders: [...(l.bondOrders as number[])], lonePairs: [...(l.lonePairs as number[])], structure: l.structure },
    vsepr: { X: v.X, E: v.E, source: v.source },
    geometry: { azimuth: g.azimuth, elevation: g.elevation, showLonePairs: g.showLonePairs, showDomains: g.showDomains, showAngles: g.showAngles, showDipoles: g.showDipoles },
    polarity: { a: p.a, b: p.b }, learn,
  };
}
export function describeBondingAnalysis(i: BondingInputs): string {
  const m = getMolecule(i.molecule);
  return `${BONDING_VIEW_LABEL[i.view]}: ${m ? `${m.name} (${m.formula})` : i.molecule}`.slice(0, 300);
}
/** The Lewis state of a molecule's first curated structure, used when the molecule changes. */
export function lewisStateFor(id: string): BondingInputs["lewis"] {
  const m = MOLECULES.find((x) => x.id === id) ?? MOLECULES[0];
  const s = m.structures[0];
  return { bondOrders: [...s.bondOrders], lonePairs: [...s.lonePairs], structure: 0 };
}

// ---- molecular orbitals ------------------------------------------------------------------------------------------------------------------

export const MO_VIEWS = ["diagram", "overlap"] as const;
export type MOView = (typeof MO_VIEWS)[number];
export const MO_VIEW_LABEL: Record<MOView, string> = { diagram: "MO diagram and occupancy", overlap: "Orbital combinations" };

export type MOInputs = {
  subject: "general";
  tool: "molorbitals";
  view: MOView;
  species: string;
  /** One code per spatial valence orbital (0 empty, 1 up, 2 down, 3 pair), in diagram order from the lowest. */
  occ: number[];
  overlap: { R: number; combo: "bonding" | "antibonding"; pType: "sigma" | "pi" };
  learn: LearnState28;
};
export const DEFAULT_MO_INPUTS: MOInputs = {
  subject: "general", tool: "molorbitals", view: "diagram", species: "o2",
  occ: [3, 3, 3, 3, 3, 1, 1, 0],
  overlap: { R: 1.4, combo: "bonding", pType: "sigma" },
  learn: DEFAULT_LEARN_28,
};
export function validateMOInputs(raw: unknown): MOInputs | null {
  if (!isObject(raw) || raw.subject !== "general" || raw.tool !== "molorbitals" || !oneOf(raw.view, MO_VIEWS) || typeof raw.species !== "string") return null;
  const sp = getDiatomic(raw.species); const ov = raw.overlap; const learn = validateLearn(raw.learn);
  if (!sp || !isObject(ov) || !learn || !Array.isArray(raw.occ)) return null;
  if (raw.occ.length !== boxesOf(sp).length || !raw.occ.every((c) => int(c, 0, 3))) return null;
  if (!finite(ov.R) || ov.R < 0.5 || ov.R > 6 || !oneOf(ov.combo, ["bonding", "antibonding"] as const) || !oneOf(ov.pType, ["sigma", "pi"] as const)) return null;
  return { subject: "general", tool: "molorbitals", view: raw.view, species: sp.id, occ: [...(raw.occ as number[])], overlap: { R: ov.R, combo: ov.combo, pType: ov.pType }, learn };
}
export function describeMOAnalysis(i: MOInputs): string {
  const sp = getDiatomic(i.species);
  return `${MO_VIEW_LABEL[i.view]}: ${sp ? `${sp.formula} (${sp.name})` : i.species}`.slice(0, 300);
}
