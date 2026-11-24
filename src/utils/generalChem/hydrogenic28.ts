/**
 * Stage 28: the nonrelativistic hydrogenic (one-electron) model, in atomic units of length a0 (bohr). Pure; no React.
 *
 *   ψ_nlm(r,θ,φ) = R_nl(r) · Y_lm(θ,φ),   ρ = Z r / a0,   E_n = −Ry · Z² / n²
 *
 * What is exact here: the radial functions R_nl for 1s, 2s, 2p, 3s, 3p, 3d and the spherical harmonics for l ≤ 2 are the closed-form
 * solutions of the Schrödinger equation for a point nucleus of charge Z and one electron, with infinite nuclear mass.
 * What is neglected: reduced mass (hydrogen's levels are 0.054 % smaller), fine structure, hyperfine structure, the Lamb shift,
 * relativistic effects (growing as Z⁴) and every many-electron effect. None of this applies to atoms with more than one electron.
 *
 * Sign convention: the sign (phase) of ψ is a property of the mathematical function; it is NOT an electric charge. Only |ψ|² has a
 * physical (probability) meaning. Real orbitals (p_x, d_xy, ...) are equal-weight linear combinations of the ±m_l complex functions; they
 * are a choice of basis, not eigenstates of L_z. The map used here: m_l = +1 → p_x or d_xz, m_l = −1 → p_y or d_yz,
 * m_l = +2 → d_x²−y², m_l = −2 → d_xy, m_l = 0 → p_z or d_z².
 */
import { checkQuantumNumbers, nodeCounts, subshellLabel } from "./quantum28";

// ---- constants (exact SI definitions; Rydberg energy from CODATA 2018) --------------------------------------------------------------------
export const PLANCK_J_S = 6.62607015e-34;
export const LIGHT_M_S = 299792458;
export const ELEMENTARY_CHARGE_C = 1.602176634e-19;
/** hc in eV·nm (exact from the SI definitions: h c / e × 10⁹). */
export const HC_EV_NM = (PLANCK_J_S * LIGHT_M_S / ELEMENTARY_CHARGE_C) * 1e9;
/** Rydberg energy R∞hc in eV (CODATA 2018: 13.605 693 122 994 eV); infinite nuclear mass. */
export const RYDBERG_EV = 13.605693122994;

export const HYDROGENIC_ENGINE_VERSION = 1;
export const SUPPORTED_ORBITALS: ReadonlyArray<{ n: number; l: number }> = [
  { n: 1, l: 0 }, { n: 2, l: 0 }, { n: 2, l: 1 }, { n: 3, l: 0 }, { n: 3, l: 1 }, { n: 3, l: 2 },
];
export const SUPPORTED_Z = [1, 2, 3, 4] as const;
export const isSupportedOrbital = (n: number, l: number): boolean => SUPPORTED_ORBITALS.some((o) => o.n === n && o.l === l);

// ---- radial functions -----------------------------------------------------------------------------------------------------------------------

/** R_nl(r) in a0^(-3/2) for a nucleus of charge Z; r in a0. Normalised so that ∫ R² r² dr = 1. */
export function radialR(n: number, l: number, r: number, Z = 1): number {
  const rho = Z * r;
  const z32 = Z ** 1.5;
  if (n === 1 && l === 0) return 2 * z32 * Math.exp(-rho);
  if (n === 2 && l === 0) return (1 / (2 * Math.SQRT2)) * z32 * (2 - rho) * Math.exp(-rho / 2);
  if (n === 2 && l === 1) return (1 / (2 * Math.sqrt(6))) * z32 * rho * Math.exp(-rho / 2);
  if (n === 3 && l === 0) return (2 / (81 * Math.sqrt(3))) * z32 * (27 - 18 * rho + 2 * rho * rho) * Math.exp(-rho / 3);
  if (n === 3 && l === 1) return (8 / (27 * Math.sqrt(6))) * z32 * rho * (1 - rho / 6) * Math.exp(-rho / 3);
  if (n === 3 && l === 2) return (4 / (81 * Math.sqrt(30))) * z32 * rho * rho * Math.exp(-rho / 3);
  return NaN;
}

/** Radial probability distribution P(r) = r² R², the probability per unit radius of finding the electron at distance r (any direction). */
export const radialProbability = (n: number, l: number, r: number, Z = 1): number => r * r * radialR(n, l, r, Z) ** 2;

/** Radii (in a0) where R_nl = 0 for r > 0: the radial nodes; there are n − l − 1 of them. Closed forms. */
export function radialNodeRadii(n: number, l: number, Z = 1): number[] {
  if (n === 2 && l === 0) return [2 / Z];
  if (n === 3 && l === 0) return [(9 - 3 * Math.sqrt(3)) / (2 * Z), (9 + 3 * Math.sqrt(3)) / (2 * Z)]; // roots of 2ρ² − 18ρ + 27
  if (n === 3 && l === 1) return [6 / Z];
  return [];
}

/** ⟨r⟩ = (a0/2Z)(3n² − l(l+1)), the exact expectation value of the radius. */
export const expectationR = (n: number, l: number, Z = 1): number => (3 * n * n - l * (l + 1)) / (2 * Z);

/** Local maxima of the radial probability distribution, found on a fine grid (the lobes of P(r)); radii in a0. */
export function radialPeaks(n: number, l: number, Z = 1): number[] {
  const rmax = displayRadius(n, Z);
  const N = 4000;
  const peaks: number[] = [];
  let prev2 = 0; let prev1 = 0;
  for (let i = 1; i <= N; i++) {
    const r = (rmax * i) / N;
    const p = radialProbability(n, l, r, Z);
    if (i >= 3 && prev1 > prev2 && prev1 >= p) peaks.push((rmax * (i - 1)) / N);
    prev2 = prev1; prev1 = p;
  }
  return peaks;
}

/** Radius shown in plots, in a0: far enough that the radial probability beyond it is below about 10⁻³ for every supported orbital. */
export const displayRadius = (n: number, Z = 1): number => (n === 1 ? 9 : n === 2 ? 26 : 48) / Z;

// ---- angular functions ----------------------------------------------------------------------------------------------------------------------

export type OrbitalBasis = "real" | "complex";
export interface Complex { re: number; im: number }

const PI = Math.PI;
/** Name of the real orbital that stands for (l, m_l), using the documented convention. */
export function realOrbitalName(l: number, ml: number): string {
  if (l === 0) return "s";
  if (l === 1) return ml === 0 ? "p_z" : ml === 1 ? "p_x" : "p_y";
  if (l === 2) return ({ 0: "d_z²", 1: "d_xz", [-1]: "d_yz", 2: "d_x²−y²", [-2]: "d_xy" } as Record<number, string>)[ml] ?? "d";
  return `l=${l}, m=${ml}`;
}

/** Real angular factor of the supported (l, m_l); (x, y, z) is any vector, only its direction matters. */
export function realAngular(l: number, ml: number, x: number, y: number, z: number): number {
  const r2 = x * x + y * y + z * z;
  if (l === 0) return 1 / (2 * Math.sqrt(PI));
  if (r2 === 0) return 0;
  const r = Math.sqrt(r2);
  if (l === 1) {
    const c = Math.sqrt(3 / (4 * PI));
    return ml === 0 ? (c * z) / r : ml === 1 ? (c * x) / r : (c * y) / r;
  }
  if (l === 2) {
    if (ml === 0) return Math.sqrt(5 / (16 * PI)) * ((3 * z * z - r2) / r2);
    if (ml === 1) return Math.sqrt(15 / (4 * PI)) * ((x * z) / r2);
    if (ml === -1) return Math.sqrt(15 / (4 * PI)) * ((y * z) / r2);
    if (ml === 2) return Math.sqrt(15 / (16 * PI)) * ((x * x - y * y) / r2);
    return Math.sqrt(15 / (4 * PI)) * ((x * y) / r2); // ml = -2
  }
  return NaN;
}

/** Complex spherical harmonic Y_l^m(θ,φ) with the Condon–Shortley phase, for l ≤ 2. */
export function complexAngular(l: number, ml: number, theta: number, phi: number): Complex {
  const s = Math.sin(theta); const c = Math.cos(theta);
  const m = Math.abs(ml);
  let mag: number; // the real θ part including the Condon–Shortley sign (−1)^m for m ≥ 0
  if (l === 0) mag = 1 / Math.sqrt(4 * PI);
  else if (l === 1) mag = m === 0 ? Math.sqrt(3 / (4 * PI)) * c : -Math.sqrt(3 / (8 * PI)) * s;
  else if (m === 0) mag = Math.sqrt(5 / (16 * PI)) * (3 * c * c - 1);
  else if (m === 1) mag = -Math.sqrt(15 / (8 * PI)) * s * c;
  else mag = Math.sqrt(15 / (32 * PI)) * s * s;
  // Y_l^{-m} = (−1)^m conj(Y_l^m)
  const sign = ml < 0 ? (m % 2 === 0 ? 1 : -1) : 1;
  return { re: sign * mag * Math.cos(ml * phi), im: sign * mag * Math.sin(ml * phi) };
}

/** The wavefunction ψ_nlm at a point (a0): complex-valued in the complex basis, real-valued in the real basis. */
export function psi(n: number, l: number, ml: number, basis: OrbitalBasis, x: number, y: number, z: number, Z = 1): Complex {
  const r = Math.sqrt(x * x + y * y + z * z);
  const R = radialR(n, l, r, Z);
  if (basis === "real") return { re: R * realAngular(l, ml, x, y, z), im: 0 };
  const theta = r === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, z / r)));
  const Y = complexAngular(l, ml, theta, Math.atan2(y, x));
  return { re: R * Y.re, im: R * Y.im };
}
export const density = (n: number, l: number, ml: number, basis: OrbitalBasis, x: number, y: number, z: number, Z = 1): number => {
  const p = psi(n, l, ml, basis, x, y, z, Z);
  return p.re * p.re + p.im * p.im;
};

/**
 * Angular nodal surfaces. Real basis: l in total, l − |m_l| cones or planes in θ plus |m_l| planes through the z axis.
 * Complex basis (m_l ≠ 0): |ψ|² has the l − |m_l| θ-nodes only (it is independent of φ and vanishes on the z axis for m_l ≠ 0);
 * the |m_l| nodal planes belong to the real combinations.
 */
export function angularNodes(l: number, ml: number, basis: OrbitalBasis): { thetaNodes: number; planesThroughAxis: number; total: number; note: string } {
  const theta = l - Math.abs(ml);
  const planes = Math.abs(ml);
  if (basis === "real") return { thetaNodes: theta, planesThroughAxis: planes, total: l, note: `${l} angular node${l === 1 ? "" : "s"} (nodal surface${l === 1 ? "" : "s"}) in the real orbital.` };
  return {
    thetaNodes: theta, planesThroughAxis: 0, total: theta,
    note: planes > 0
      ? `The complex function has ${theta} θ-node${theta === 1 ? "" : "s"} and vanishes along the z axis; its density does not depend on φ, so the ${planes} azimuthal node plane${planes === 1 ? "" : "s"} of the real combinations do not appear.`
      : `${theta} angular node${theta === 1 ? "" : "s"}.`,
  };
}

// ---- grids ---------------------------------------------------------------------------------------------------------------------------------

export type SlicePlane = "xz" | "xy" | "yz";
export interface SliceSpec { n: number; l: number; ml: number; basis: OrbitalBasis; plane: SlicePlane; Z: number }
export interface SliceGrid {
  N: number; extent: number; plane: SlicePlane;
  /** |ψ|² on the plane, row-major, v from +extent (row 0) to −extent. */
  density: Float64Array; amplitude: Float64Array;
  maxDensity: number; maxAmplitude: number;
}
export const SLICE_N = 81;
const sliceCache = new Map<string, SliceGrid>();

export function sliceGrid(spec: SliceSpec): SliceGrid {
  const key = `${spec.n}|${spec.l}|${spec.ml}|${spec.basis}|${spec.plane}|${spec.Z}`;
  const hit = sliceCache.get(key);
  if (hit) return hit;
  const extent = displayRadius(spec.n, spec.Z) * 0.78;
  const N = SLICE_N;
  const dens = new Float64Array(N * N); const amp = new Float64Array(N * N);
  let md = 0; let ma = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = -extent + (2 * extent * i) / (N - 1);
      const v = extent - (2 * extent * j) / (N - 1);
      const [x, y, z] = spec.plane === "xz" ? [u, 0, v] : spec.plane === "xy" ? [u, v, 0] : [0, u, v];
      const p = psi(spec.n, spec.l, spec.ml, spec.basis, x, y, z, spec.Z);
      const d = p.re * p.re + p.im * p.im;
      dens[j * N + i] = d; amp[j * N + i] = p.re;
      if (d > md) md = d;
      if (Math.abs(p.re) > ma) ma = Math.abs(p.re);
    }
  }
  const grid: SliceGrid = { N, extent, plane: spec.plane, density: dens, amplitude: amp, maxDensity: md, maxAmplitude: ma };
  if (sliceCache.size > 24) sliceCache.clear();
  sliceCache.set(key, grid);
  return grid;
}

/**
 * Probability enclosed by an iso-density surface, estimated on a bounded 3-D grid (cell-centred, 71³ points, cube of half-width
 * 0.85 × `displayRadius`). `gridTotal` is the probability the grid captures (should be close to 1; the part outside the cube and the
 * discretisation error are the reason it is not exactly 1). Fractions are normalised by that total.
 */
export interface EnclosureTable { sortedDensity: Float64Array; cumulative: Float64Array; gridTotal: number; cell: number }
const enclosureCache = new Map<string, EnclosureTable>();
export const ENCLOSURE_N = 71;
export function enclosureTable(n: number, l: number, ml: number, basis: OrbitalBasis, Z: number): EnclosureTable {
  const key = `${n}|${l}|${ml}|${basis}|${Z}`;
  const hit = enclosureCache.get(key);
  if (hit) return hit;
  const half = displayRadius(n, Z) * 0.85;
  const N = ENCLOSURE_N;
  const h = (2 * half) / N;
  const vals = new Float64Array(N * N * N);
  let k = 0;
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) for (let c = 0; c < N; c++) {
    vals[k++] = density(n, l, ml, basis, -half + (a + 0.5) * h, -half + (b + 0.5) * h, -half + (c + 0.5) * h, Z);
  }
  const sorted = Float64Array.from(vals).sort().reverse();
  const cum = new Float64Array(sorted.length);
  let acc = 0;
  const dV = h * h * h;
  for (let i = 0; i < sorted.length; i++) { acc += sorted[i] * dV; cum[i] = acc; }
  const table: EnclosureTable = { sortedDensity: sorted, cumulative: cum, gridTotal: acc, cell: h };
  if (enclosureCache.size > 12) enclosureCache.clear();
  enclosureCache.set(key, table);
  return table;
}
/** The iso-density value whose surface encloses `fraction` (0–1) of the probability on the grid. */
export function isoDensityForEnclosure(t: EnclosureTable, fraction: number): number {
  const target = fraction * t.gridTotal;
  let lo = 0; let hi = t.cumulative.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (t.cumulative[mid] >= target) hi = mid; else lo = mid + 1; }
  return t.sortedDensity[lo];
}

// ---- energy levels, transitions and spectra --------------------------------------------------------------------------------------------------

export const MAX_TRANSITION_N = 10;
export const hydrogenicEnergyEV = (n: number, Z = 1): number => -(RYDBERG_EV * Z * Z) / (n * n);

export type SpectralRegion = "ultraviolet" | "visible" | "infrared";
export const VISIBLE_RANGE_NM: readonly [number, number] = [380, 750];
export const regionOf = (nm: number): SpectralRegion => (nm < VISIBLE_RANGE_NM[0] ? "ultraviolet" : nm <= VISIBLE_RANGE_NM[1] ? "visible" : "infrared");
export const SERIES_NAMES: Record<number, string> = { 1: "Lyman", 2: "Balmer", 3: "Paschen", 4: "Brackett", 5: "Pfund", 6: "Humphreys" };

export interface Transition {
  ni: number; nf: number; Z: number;
  kind: "emission" | "absorption";
  Ei: number; Ef: number;
  photonEV: number; photonJ: number; frequencyHz: number; wavelengthNm: number;
  region: SpectralRegion;
  lowerLevel: number;
  /** Named series only for hydrogen (Z = 1). */
  series: string | null;
}
export type TransitionResult = { ok: true; value: Transition } | { ok: false; error: string };

export function transition(ni: number, nf: number, Z = 1): TransitionResult {
  const okN = (v: number) => Number.isInteger(v) && v >= 1 && v <= MAX_TRANSITION_N;
  if (!okN(ni) || !okN(nf)) return { ok: false, error: `Levels must be whole numbers from 1 to ${MAX_TRANSITION_N}.` };
  if (ni === nf) return { ok: false, error: "The initial and final levels are the same, so there is no transition and no photon." };
  if (!Number.isInteger(Z) || Z < 1 || Z > 4) return { ok: false, error: "This model supports one-electron species with Z = 1 to 4 (H, He⁺, Li²⁺, Be³⁺)." };
  const Ei = hydrogenicEnergyEV(ni, Z); const Ef = hydrogenicEnergyEV(nf, Z);
  const photonEV = Math.abs(Ef - Ei);
  const lower = Math.min(ni, nf);
  const wavelengthNm = HC_EV_NM / photonEV;
  return {
    ok: true,
    value: {
      ni, nf, Z, kind: Ef < Ei ? "emission" : "absorption", Ei, Ef, photonEV,
      photonJ: photonEV * ELEMENTARY_CHARGE_C, frequencyHz: (photonEV * ELEMENTARY_CHARGE_C) / PLANCK_J_S, wavelengthNm,
      region: regionOf(wavelengthNm), lowerLevel: lower, series: Z === 1 ? SERIES_NAMES[lower] ?? null : null,
    },
  };
}

/** Lines of the series that ends on (or, for absorption, starts from) level `lower`, from lower+1 to MAX_TRANSITION_N. */
export function seriesLines(lower: number, Z = 1): Transition[] {
  const out: Transition[] = [];
  for (let up = lower + 1; up <= MAX_TRANSITION_N; up++) { const t = transition(up, lower, Z); if (t.ok) out.push(t.value); }
  return out;
}
/** Series limit (n → ∞) wavelength in nm. */
export const seriesLimitNm = (lower: number, Z = 1): number => HC_EV_NM / ((RYDBERG_EV * Z * Z) / (lower * lower));
/** Ionisation energy of the one-electron species from its ground state, eV. */
export const ionisationEnergyEV = (Z: number): number => RYDBERG_EV * Z * Z;

/** Approximate screen colour for a visible wavelength (Bruton-style piecewise map): a display aid, not a colorimetric result. */
export function wavelengthToRgb(nm: number): [number, number, number] | null {
  if (nm < 380 || nm > 750) return null;
  let r = 0; let g = 0; let b = 0;
  if (nm < 440) { r = (440 - nm) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; } else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; } else if (nm < 645) { r = 1; g = (645 - nm) / 65; } else { r = 1; }
  const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (750 - nm)) / 50 : 1;
  const c = (v: number) => Math.round(255 * Math.pow(Math.max(0, v) * f, 0.8));
  return [c(r), c(g), c(b)];
}

// ---- convenience ---------------------------------------------------------------------------------------------------------------------------

export interface OrbitalDescription {
  label: string; realName: string | null; radialNodes: number; angularNodes: number; totalNodes: number;
  nodeRadii: number[]; meanRadius: number; peaks: number[]; valid: boolean; supported: boolean; messages: string[];
}
export function describeOrbital(n: number, l: number, ml: number, basis: OrbitalBasis, Z = 1): OrbitalDescription {
  const chk = checkQuantumNumbers({ n, l, ml });
  const supported = chk.ok && isSupportedOrbital(n, l);
  const counts = chk.ok ? nodeCounts(n, l) : { radial: 0, angular: 0, total: 0 };
  const ang = chk.ok && supported ? angularNodes(l, ml, basis) : null;
  return {
    label: chk.ok ? subshellLabel(n, l) : "invalid", realName: chk.ok && supported && basis === "real" ? realOrbitalName(l, ml) : null,
    radialNodes: counts.radial, angularNodes: ang ? ang.total : counts.angular, totalNodes: counts.total,
    nodeRadii: supported ? radialNodeRadii(n, l, Z) : [], meanRadius: supported ? expectationR(n, l, Z) : NaN, peaks: supported ? radialPeaks(n, l, Z) : [],
    valid: chk.ok, supported, messages: chk.ok ? (supported ? [] : ["This orbital's wavefunction is outside the supported set (1s, 2s, 2p, 3s, 3p, 3d)."]) : chk.reasons,
  };
}
