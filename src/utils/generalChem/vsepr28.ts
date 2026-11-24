/**
 * Stage 28: VSEPR geometry, schematic bond dipoles and molecular polarity (pure; no React).
 *
 * VSEPR is a qualitative model: electron domains (bonding pairs of any bond order, and lone pairs) arrange themselves to be as far apart as
 * possible. Electron-domain geometry counts every domain; molecular geometry names only the arrangement of ATOMS. The coordinates below are
 * the IDEAL directions of each domain geometry. Real molecules with lone pairs or unlike substituents deviate from the ideal angles
 * (lone pairs repel more strongly than bonding pairs), and VSEPR alone does not give those deviations as numbers.
 *
 * The polarity model is schematic: each bond contributes a vector of length |ΔEN| (Pauling electronegativity difference) pointing toward
 * the more electronegative atom; lone-pair contributions, bond-order effects and the real charge distribution are ignored. The result says
 * whether bond dipoles CANCEL by symmetry; it is not a measured or calculated dipole moment in debye.
 */
import { getMolecule, structureToState, type MoleculeDef } from "./lewis28";

export const VSEPR_ENGINE_VERSION = 1;
export type DomainGeometry = "linear" | "trigonal planar" | "tetrahedral" | "trigonal bipyramidal" | "octahedral";
export type Vec3 = [number, number, number];

export interface VseprEntry {
  X: number; E: number; domains: number;
  domainGeometry: DomainGeometry; molecularGeometry: string;
  /** Ideal angles between bonds in degrees, from the ideal coordinates. */
  idealAngles: number[];
  note: string;
}

const T = 1 / Math.sqrt(3);
const DIRECTIONS: Record<DomainGeometry, Vec3[]> = {
  linear: [[0, 0, 1], [0, 0, -1]],
  "trigonal planar": [[1, 0, 0], [-0.5, Math.sqrt(3) / 2, 0], [-0.5, -Math.sqrt(3) / 2, 0]],
  tetrahedral: [[T, T, T], [T, -T, -T], [-T, T, -T], [-T, -T, T]],
  // axial first (+z, −z), then the three equatorial positions
  "trigonal bipyramidal": [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-0.5, Math.sqrt(3) / 2, 0], [-0.5, -Math.sqrt(3) / 2, 0]],
  octahedral: [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]],
};
/** Which domain positions the lone pairs take first: equatorial in a trigonal bipyramid, trans positions in an octahedron. */
const LONE_PAIR_ORDER: Record<DomainGeometry, number[]> = {
  linear: [1], "trigonal planar": [2, 1], tetrahedral: [3, 2, 1], "trigonal bipyramidal": [2, 3, 4], octahedral: [0, 1],
};

const ROWS: Array<[number, number, DomainGeometry, string, string]> = [
  [2, 0, "linear", "linear", "Two bonding domains, 180°."],
  [3, 0, "trigonal planar", "trigonal planar", "Three bonding domains, 120° in a plane."],
  [2, 1, "trigonal planar", "bent", "One lone pair: the ideal 120° closes to a smaller angle in real molecules."],
  [4, 0, "tetrahedral", "tetrahedral", "Four bonding domains, 109.5°."],
  [3, 1, "tetrahedral", "trigonal pyramidal", "One lone pair: bond angles are somewhat smaller than 109.5° in real molecules."],
  [2, 2, "tetrahedral", "bent", "Two lone pairs: the angle is smaller than 109.5° in real molecules."],
  [5, 0, "trigonal bipyramidal", "trigonal bipyramidal", "Axial positions at 180° to each other, equatorial at 120°; 90° between axial and equatorial."],
  [4, 1, "trigonal bipyramidal", "seesaw", "The lone pair takes an equatorial position."],
  [3, 2, "trigonal bipyramidal", "T-shaped", "Both lone pairs are equatorial."],
  [2, 3, "trigonal bipyramidal", "linear", "Three equatorial lone pairs leave the two atoms axial: 180°."],
  [6, 0, "octahedral", "octahedral", "All angles 90° or 180°."],
  [5, 1, "octahedral", "square pyramidal", "One lone pair; the atom opposite it is on the axis."],
  [4, 2, "octahedral", "square planar", "The two lone pairs sit opposite each other, leaving four atoms in a plane."],
];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3) => Math.sqrt(dot(a, a));
export const angleBetween = (a: Vec3, b: Vec3): number => (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (norm(a) * norm(b))))) * 180) / Math.PI;

export interface VseprGeometry {
  entry: VseprEntry;
  /** Positions of the bonded atoms (unit bond length). */
  atoms: Vec3[];
  /** Positions of the lone-pair domains. */
  lonePairs: Vec3[];
  /** Every pair of bonded atoms with the ideal angle between them. */
  angles: Array<{ i: number; j: number; deg: number }>;
  /** Distinct ideal angles with a short description of which pairs they connect. */
  angleClasses: Array<{ deg: number; count: number }>;
}
export type VseprOutcome = { ok: true; value: VseprGeometry } | { ok: false; error: string };

export function vseprGeometry(X: number, E: number): VseprOutcome {
  if (!Number.isInteger(X) || !Number.isInteger(E) || X < 0 || E < 0) return { ok: false, error: "Counts must be whole numbers." };
  if (X < 2) return { ok: false, error: X === 1 ? "With one bonded atom the molecule is diatomic: there is no bond angle for VSEPR to predict." : "At least two bonded atoms are needed." };
  if (X + E > 6) return { ok: false, error: "More than six electron domains around a central atom is outside this model." };
  const row = ROWS.find((r) => r[0] === X && r[1] === E);
  if (!row) return { ok: false, error: `${X} bonded atoms with ${E} lone pair${E === 1 ? "" : "s"} (${X + E} domains) is not one of the supported VSEPR cases.` };
  const [, , dg, mg, note] = row;
  const dirs = DIRECTIONS[dg];
  const lpIdx = LONE_PAIR_ORDER[dg].slice(0, E);
  const atoms: Vec3[] = []; const lonePairs: Vec3[] = [];
  dirs.forEach((d, i) => (lpIdx.includes(i) ? lonePairs.push(d) : atoms.push(d)));
  const angles: VseprGeometry["angles"] = [];
  for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) angles.push({ i, j, deg: angleBetween(atoms[i], atoms[j]) });
  const classes = new Map<number, number>();
  for (const a of angles) { const k = Math.round(a.deg * 10) / 10; classes.set(k, (classes.get(k) ?? 0) + 1); }
  const angleClasses = [...classes.entries()].sort((a, b) => a[0] - b[0]).map(([deg, count]) => ({ deg, count }));
  const entry: VseprEntry = { X, E, domains: X + E, domainGeometry: dg, molecularGeometry: mg, idealAngles: angleClasses.map((a) => a.deg), note };
  return { ok: true, value: { entry, atoms, lonePairs, angles, angleClasses } };
}
export const SUPPORTED_VSEPR: ReadonlyArray<{ X: number; E: number }> = ROWS.map((r) => ({ X: r[0], E: r[1] }));
export const GEOMETRY_NAMES: ReadonlyArray<string> = [...new Set(ROWS.map((r) => r[3]))];

/** Text description of the geometry for readers who cannot use the picture. */
export function describeGeometry(g: VseprGeometry, centerLabel = "the central atom"): string {
  const { entry } = g;
  const angleText = g.angleClasses.map((a) => `${a.deg % 1 === 0 ? a.deg : a.deg.toFixed(1)}° (${a.count} pair${a.count === 1 ? "" : "s"})`).join(", ");
  const lp = entry.E === 0 ? "no lone pairs" : `${entry.E} lone pair${entry.E === 1 ? "" : "s"}`;
  return `${centerLabel} has ${entry.X} bonded atom${entry.X === 1 ? "" : "s"} and ${lp}: ${entry.domains} electron domains in a ${entry.domainGeometry} arrangement, so the molecule is ${entry.molecularGeometry}. Ideal bond angles between the atoms: ${angleText}.${entry.E > 0 ? " Lone pairs are electron domains but not atoms; in real molecules they squeeze the bond angles below these ideal values." : ""}`;
}

// ---- geometry of a curated molecule -----------------------------------------------------------------------------------------------------------

export function centerDomains(m: MoleculeDef, structureIndex = 0): { X: number; E: number } | null {
  if (m.center === null) return null;
  const s = m.structures[structureIndex];
  if (!s) return null;
  const X = m.bonds.filter((b) => b[0] === m.center || b[1] === m.center).length;
  return { X, E: s.lonePairs[m.center] };
}
export function moleculeGeometry(m: MoleculeDef, structureIndex = 0): VseprOutcome | null {
  const d = centerDomains(m, structureIndex);
  return d ? vseprGeometry(d.X, d.E) : null;
}

// ---- electronegativity and bond dipoles --------------------------------------------------------------------------------------------------------

/** Pauling electronegativities (widely tabulated; dimensionless). Not retrieved from a source in this app: see the evidence note. */
export const ELECTRONEGATIVITY: Readonly<Record<string, number>> = Object.freeze({
  H: 2.20, Li: 0.98, Be: 1.57, B: 2.04, C: 2.55, N: 3.04, O: 3.44, F: 3.98, Na: 0.93, Mg: 1.31, Al: 1.61, Si: 1.90, P: 2.19, S: 2.58, Cl: 3.16, Br: 2.96, I: 2.66, Se: 2.55, Xe: 2.60,
});
export const POLARITY_ELEMENTS: ReadonlyArray<string> = ["H", "C", "N", "O", "F", "Si", "P", "S", "Cl", "Br", "I", "B", "Na", "Mg", "Li"];
/** Common textbook cut-offs for describing a bond; conventions, not physical boundaries. */
export const POLARITY_CUTOFFS = { nonpolar: 0.4, ionic: 1.7 } as const;

export type BondClass = "nonpolar covalent" | "polar covalent" | "very polar (ionic character)";
export interface BondPolarity { a: string; b: string; ena: number; enb: number; delta: number; moreElectronegative: string | null; cls: BondClass }
export function bondPolarity(a: string, b: string): BondPolarity | null {
  const ena = ELECTRONEGATIVITY[a]; const enb = ELECTRONEGATIVITY[b];
  if (ena === undefined || enb === undefined) return null;
  const delta = Math.abs(ena - enb);
  const cls: BondClass = delta < POLARITY_CUTOFFS.nonpolar ? "nonpolar covalent" : delta < POLARITY_CUTOFFS.ionic ? "polar covalent" : "very polar (ionic character)";
  return { a, b, ena, enb, delta, moreElectronegative: delta < 1e-9 ? null : ena > enb ? a : b, cls };
}

export interface BondDipole { index: number; from: string; to: string; delta: number; vector: Vec3 }
export interface PolarityReport {
  bonds: BondDipole[]; net: Vec3; netMagnitude: number;
  cancels: boolean; anyPolarBond: boolean;
  classification: "nonpolar molecule" | "polar molecule";
  reason: string;
  limitation: string;
}
const CANCEL_TOL = 1e-9;

export function polarityOf(m: MoleculeDef, structureIndex = 0): PolarityReport | null {
  const geo = moleculeGeometry(m, structureIndex);
  if (!geo || !geo.ok || m.center === null) return null;
  const center = m.atoms[m.center];
  const ligands = m.atoms.map((el, i) => ({ el, i })).filter((x) => x.i !== m.center);
  if (ligands.length !== geo.value.atoms.length) return null;
  const bonds: BondDipole[] = [];
  let net: Vec3 = [0, 0, 0];
  for (let k = 0; k < ligands.length; k++) {
    const bp = bondPolarity(center, ligands[k].el);
    if (!bp) return null;
    const dir = geo.value.atoms[k];
    const signed = (ELECTRONEGATIVITY[ligands[k].el] ?? 0) - (ELECTRONEGATIVITY[center] ?? 0); // positive: toward the ligand
    const vector: Vec3 = [dir[0] * signed, dir[1] * signed, dir[2] * signed];
    bonds.push({ index: k, from: signed >= 0 ? center : ligands[k].el, to: signed >= 0 ? ligands[k].el : center, delta: bp.delta, vector });
    net = [net[0] + vector[0], net[1] + vector[1], net[2] + vector[2]];
  }
  const netMagnitude = norm(net);
  const anyPolarBond = bonds.some((b) => b.delta >= POLARITY_CUTOFFS.nonpolar);
  const cancels = netMagnitude < CANCEL_TOL;
  const reason = !anyPolarBond
    ? "No bond is appreciably polar, so there is nothing to add up; the molecule is nonpolar in this model."
    : cancels
      ? "The bond dipoles are equal in size and arranged symmetrically, so they cancel: the polar bonds give a nonpolar molecule."
      : "The bond dipoles do not cancel, so the molecule has a net dipole in this schematic model.";
  return {
    bonds, net, netMagnitude, cancels, anyPolarBond,
    classification: cancels ? "nonpolar molecule" : "polar molecule", reason,
    limitation: "Schematic only: each bond counts |ΔEN| in the ideal geometry. Lone-pair dipoles, bond order, geometric distortion and the real charge distribution are ignored, so for molecules with lone pairs or almost-cancelling terms (for example NF₃, or ozone with identical atoms) the real dipole can be smaller or larger than this picture suggests.",
  };
}

/** Convenience: geometry and polarity of a curated molecule by id. */
export function analyzeCurated(id: string, structureIndex = 0) {
  const m = getMolecule(id);
  if (!m) return null;
  const geo = moleculeGeometry(m, structureIndex);
  return { molecule: m, geometry: geo, polarity: polarityOf(m, structureIndex), state: structureToState(m.structures[structureIndex]) };
}

// ---- rotation helper for the picture --------------------------------------------------------------------------------------------------------------

/** Rotates a point about the vertical (azimuth) then horizontal (elevation) axis; angles in degrees. */
export function rotate(p: Vec3, azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = (azimuthDeg * Math.PI) / 180; const el = (elevationDeg * Math.PI) / 180;
  const x1 = p[0] * Math.cos(az) + p[2] * Math.sin(az);
  const z1 = -p[0] * Math.sin(az) + p[2] * Math.cos(az);
  const y2 = p[1] * Math.cos(el) - z1 * Math.sin(el);
  const z2 = p[1] * Math.sin(el) + z1 * Math.cos(el);
  return [x1, y2, z2];
}
