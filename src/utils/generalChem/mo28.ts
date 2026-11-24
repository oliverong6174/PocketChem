/**
 * Stage 28: qualitative molecular-orbital diagrams, occupancy, bond order and magnetism for a curated set of homonuclear diatomic
 * species (pure; no React).
 *
 * This is the textbook valence-MO picture built from linear combinations of atomic orbitals (LCAO). It is NOT the output of a
 * quantum-chemistry calculation: the orbital ORDER is a curated, stated convention and the heights in diagrams show order only, not
 * energies. Core 1s electrons (Li–Ne) occupy σ1s and σ*1s in equal numbers and cancel in the bond order, so only valence orbitals are
 * shown and only valence electrons are counted.
 *
 * Ordering (qualitative, as taught for the second-period homonuclear diatomics):
 *   • Li₂ to N₂ (and species built from those atoms): s–p mixing pushes σ2p ABOVE π2p:  σ2s < σ*2s < π2p < σ2p < π*2p < σ*2p
 *   • O₂, F₂, Ne₂ (and species built from those atoms): σ2p BELOW π2p:               σ2s < σ*2s < σ2p < π2p < π*2p < σ*2p
 * For ions the order of the parent atoms' block is used and flagged as a convention. For every ion listed here the bond order and the
 * number of unpaired electrons do not depend on that choice (tested); B₂ and C₂ are the species for which the 2p ordering decides
 * their magnetism.
 */
export const MO_ENGINE_VERSION = 1;

export type MOKind = "bonding" | "antibonding";
export type MOOrdering = "1s-only" | "sp-mixing" | "no-mixing";

export interface MOLevel {
  id: string;
  /** Display label, for example σ2s, σ*2s, π2p. The asterisk marks an antibonding orbital. */
  label: string;
  kind: MOKind;
  /** Number of degenerate spatial orbitals at this level (2 for π levels). */
  degeneracy: 1 | 2;
  symmetry: "σ" | "π";
  /** Atomic orbitals combined (qualitative). */
  combination: string;
}

const L = {
  s1: { id: "s1s", label: "σ1s", kind: "bonding", degeneracy: 1, symmetry: "σ", combination: "1s + 1s (in phase)" },
  s1a: { id: "s1s*", label: "σ*1s", kind: "antibonding", degeneracy: 1, symmetry: "σ", combination: "1s − 1s (out of phase)" },
  s2: { id: "s2s", label: "σ2s", kind: "bonding", degeneracy: 1, symmetry: "σ", combination: "2s + 2s (in phase)" },
  s2a: { id: "s2s*", label: "σ*2s", kind: "antibonding", degeneracy: 1, symmetry: "σ", combination: "2s − 2s (out of phase)" },
  p2: { id: "p2p", label: "π2p", kind: "bonding", degeneracy: 2, symmetry: "π", combination: "2pₓ + 2pₓ and 2p_y + 2p_y (side-on, in phase)" },
  sp2: { id: "s2p", label: "σ2p", kind: "bonding", degeneracy: 1, symmetry: "σ", combination: "2p_z + 2p_z (end-on, in phase)" },
  p2a: { id: "p2p*", label: "π*2p", kind: "antibonding", degeneracy: 2, symmetry: "π", combination: "2pₓ − 2pₓ and 2p_y − 2p_y (side-on, out of phase)" },
  sp2a: { id: "s2p*", label: "σ*2p", kind: "antibonding", degeneracy: 1, symmetry: "σ", combination: "2p_z − 2p_z (end-on, out of phase)" },
} satisfies Record<string, MOLevel>;

/** Ascending orbital order for each ordering convention. */
export const LEVELS_BY_ORDERING: Readonly<Record<MOOrdering, ReadonlyArray<MOLevel>>> = {
  "1s-only": [L.s1, L.s1a],
  "sp-mixing": [L.s2, L.s2a, L.p2, L.sp2, L.p2a, L.sp2a],
  "no-mixing": [L.s2, L.s2a, L.sp2, L.p2, L.p2a, L.sp2a],
};

export interface DiatomicSpecies {
  id: string; formula: string; name: string; charge: number;
  Z: number; // atomic number of each atom
  valenceElectrons: number;
  ordering: MOOrdering;
  /** Why this ordering was assigned. */
  orderingBasis: string;
  /** True for ions, for which the ordering is a stated convention. */
  orderingIsConvention: boolean;
  kind: "neutral" | "ion";
}

const VAL: Record<number, number> = { 1: 1, 2: 2, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8 };
function sp(id: string, formula: string, name: string, Z: number, charge = 0): DiatomicSpecies {
  const ordering: MOOrdering = Z <= 2 ? "1s-only" : Z <= 7 ? "sp-mixing" : "no-mixing";
  const basis = Z <= 2 ? "Only 1s orbitals are involved, so there is no 2p ordering question."
    : Z <= 7 ? "Lighter second-period atoms: the 2s and 2p levels are close, s–p mixing pushes σ2p above π2p."
      : "Heavier second-period atoms: the 2s–2p gap is large, so σ2p lies below π2p.";
  return { id, formula, name, charge, Z, valenceElectrons: 2 * VAL[Z] - charge, ordering, orderingBasis: charge === 0 ? basis : `${basis} For this ion the same ordering is taken from the parent atoms as a convention.`, orderingIsConvention: charge !== 0, kind: charge === 0 ? "neutral" : "ion" };
}

export const DIATOMICS: ReadonlyArray<DiatomicSpecies> = Object.freeze([
  sp("h2", "H₂", "Dihydrogen", 1), sp("h2p", "H₂⁺", "Dihydrogen cation", 1, 1), sp("he2", "He₂", "Dihelium", 2), sp("he2p", "He₂⁺", "Dihelium cation", 2, 1),
  sp("li2", "Li₂", "Dilithium", 3), sp("be2", "Be₂", "Diberyllium", 4), sp("b2", "B₂", "Diboron", 5), sp("c2", "C₂", "Dicarbon", 6), sp("n2", "N₂", "Dinitrogen", 7),
  sp("o2", "O₂", "Dioxygen", 8), sp("f2", "F₂", "Difluorine", 9), sp("ne2", "Ne₂", "Dineon", 10),
  sp("n2p", "N₂⁺", "Dinitrogen cation", 7, 1), sp("c2m2", "C₂²⁻", "Dicarbide(2−) ion", 6, -2),
  sp("o2p", "O₂⁺", "Dioxygenyl cation", 8, 1), sp("o2m", "O₂⁻", "Superoxide ion", 8, -1), sp("o2m2", "O₂²⁻", "Peroxide ion", 8, -2),
]);
export const getDiatomic = (id: string): DiatomicSpecies | undefined => DIATOMICS.find((d) => d.id === id);

// ---- boxes and occupancy -----------------------------------------------------------------------------------------------------------------------

/** One spatial orbital. Occupancy code per box: 0 empty, 1 spin up, 2 spin down, 3 two electrons of opposite spin. */
export interface MOBox { level: number; sub: number; id: string }
export const levelsOf = (s: DiatomicSpecies): ReadonlyArray<MOLevel> => LEVELS_BY_ORDERING[s.ordering];
export function boxesOf(s: DiatomicSpecies): MOBox[] {
  const out: MOBox[] = [];
  levelsOf(s).forEach((lv, li) => { for (let k = 0; k < lv.degeneracy; k++) out.push({ level: li, sub: k, id: `${lv.id}${lv.degeneracy === 2 ? `#${k + 1}` : ""}` }); });
  return out;
}
const electronsIn = (code: number) => (code === 3 ? 2 : code === 0 ? 0 : 1);

/** Ground-state occupancy by the Aufbau principle with Hund's rule: lowest levels first, degenerate boxes singly (spin up) before pairing. */
export function groundOccupancy(s: DiatomicSpecies): number[] {
  const boxes = boxesOf(s);
  const occ = new Array<number>(boxes.length).fill(0);
  let left = s.valenceElectrons;
  for (let li = 0; li < levelsOf(s).length && left > 0; li++) {
    const idx = boxes.map((b, i) => ({ b, i })).filter(({ b }) => b.level === li).map(({ i }) => i);
    for (const i of idx) { if (left > 0) { occ[i] = 1; left--; } }
    for (const i of idx) { if (left > 0 && occ[i] === 1) { occ[i] = 3; left--; } }
  }
  return occ;
}

export interface OccupancyReport {
  valid: boolean; errors: string[];
  placed: number; expected: number; complete: boolean;
  bonding: number; antibonding: number; bondOrder: number;
  unpaired: number; spinTotal: number; multiplicity: number;
  magnetism: "paramagnetic" | "diamagnetic";
  /** A degenerate set holds a pair while another orbital of the set is empty, or its single electrons are not all parallel. */
  hundViolations: string[];
  /** Electrons are in a higher level while a lower level still has room. */
  aufbauViolations: string[];
  isGroundState: boolean;
  perLevel: Array<{ label: string; kind: MOKind; electrons: number; capacity: number }>;
  configuration: string;
  spinOnlyMagneticMoment: number | null;
}

const SUPS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (n: number) => String(n).split("").map((d) => SUPS[Number(d)]).join("");

export function analyzeOccupancy(s: DiatomicSpecies, occ: number[]): OccupancyReport {
  const boxes = boxesOf(s); const levels = levelsOf(s);
  const errors: string[] = [];
  if (occ.length !== boxes.length) errors.push("Occupancy does not match the orbitals of this species.");
  if (occ.some((c) => !Number.isInteger(c) || c < 0 || c > 3)) errors.push("Each orbital holds 0, 1 or 2 electrons, and two electrons must have opposite spins.");
  const empty: OccupancyReport = { valid: false, errors, placed: 0, expected: s.valenceElectrons, complete: false, bonding: 0, antibonding: 0, bondOrder: 0, unpaired: 0, spinTotal: 0, multiplicity: 1, magnetism: "diamagnetic", hundViolations: [], aufbauViolations: [], isGroundState: false, perLevel: [], configuration: "", spinOnlyMagneticMoment: null };
  if (errors.length) return empty;
  const perLevel = levels.map((lv, li) => {
    const mine = boxes.map((b, i) => ({ b, i })).filter(({ b }) => b.level === li);
    return { label: lv.label, kind: lv.kind, electrons: mine.reduce((a, { i }) => a + electronsIn(occ[i]), 0), capacity: 2 * lv.degeneracy };
  });
  const placed = perLevel.reduce((a, l) => a + l.electrons, 0);
  const bonding = perLevel.filter((l) => l.kind === "bonding").reduce((a, l) => a + l.electrons, 0);
  const antibonding = perLevel.filter((l) => l.kind === "antibonding").reduce((a, l) => a + l.electrons, 0);
  const singles = occ.filter((c) => c === 1 || c === 2);
  const unpaired = singles.length;
  const ups = singles.filter((c) => c === 1).length;
  const spinTotal = Math.abs(ups - (unpaired - ups)) / 2;
  const hund: string[] = [];
  levels.forEach((lv, li) => {
    if (lv.degeneracy !== 2) return;
    const idx = boxes.map((b, i) => ({ b, i })).filter(({ b }) => b.level === li).map(({ i }) => i);
    const codes = idx.map((i) => occ[i]);
    if (codes.some((c) => c === 3) && codes.some((c) => c === 0)) hund.push(`${lv.label}: two electrons are paired in one orbital while another orbital of the same level is empty. By Hund's rule they go into separate orbitals with parallel spins first.`);
    else if (codes.every((c) => c === 1 || c === 2) && codes[0] !== codes[1]) hund.push(`${lv.label}: the two single electrons have opposite spins. Hund's rule gives the lowest energy when they are parallel.`);
  });
  const aufbau: string[] = [];
  for (let li = 0; li < levels.length; li++) {
    if (perLevel[li].electrons < perLevel[li].capacity) {
      const higher = perLevel.slice(li + 1).find((l) => l.electrons > 0);
      if (higher) { aufbau.push(`${higher.label} holds electrons while ${perLevel[li].label} is not full: this is an excited configuration, not the ground state.`); break; }
    }
  }
  const ground = groundOccupancy(s);
  // equal up to relabelling the degenerate orbitals of a level and flipping all spins: compare the sorted electron counts per level
  const shape = (o: number[]) => levels.map((_, li) => boxes.map((b, i) => ({ b, i })).filter(({ b }) => b.level === li).map(({ i }) => electronsIn(o[i])).sort().join("")).join("|");
  const sameShape = (a: number[], b: number[]) => shape(a) === shape(b);
  const isGround = placed === s.valenceElectrons && hund.length === 0 && aufbau.length === 0 && sameShape(occ, ground);
  const configuration = perLevel.filter((l) => l.electrons > 0).map((l) => `(${l.label})${sup(l.electrons)}`).join(" ") || "no valence electrons";
  const allParallel = unpaired === 0 || ups === 0 || ups === unpaired;
  return {
    valid: true, errors: [], placed, expected: s.valenceElectrons, complete: placed === s.valenceElectrons, bonding, antibonding, bondOrder: (bonding - antibonding) / 2,
    unpaired, spinTotal, multiplicity: 2 * spinTotal + 1, magnetism: unpaired > 0 ? "paramagnetic" : "diamagnetic", hundViolations: hund, aufbauViolations: aufbau, isGroundState: isGround,
    perLevel, configuration, spinOnlyMagneticMoment: unpaired > 0 && allParallel ? Math.sqrt(unpaired * (unpaired + 2)) : null,
  };
}

/** Cycles one orbital through empty → ↑ → ↓ → ↑↓ → empty. Returns null when the box does not exist. */
export function cycleBox(occ: number[], box: number): number[] | null {
  if (!Number.isInteger(box) || box < 0 || box >= occ.length) return null;
  const next = occ.slice();
  next[box] = [1, 2, 3, 0][occ[box]];
  return next;
}
/** Adds one electron (spin up first, then down) to a box if the box has room. */
export function addElectron(occ: number[], box: number, spin: "up" | "down"): number[] | null {
  if (!Number.isInteger(box) || box < 0 || box >= occ.length) return null;
  const c = occ[box]; const next = occ.slice();
  if (spin === "up") { if (c === 0) next[box] = 1; else if (c === 2) next[box] = 3; else return null; }
  else { if (c === 0) next[box] = 2; else if (c === 1) next[box] = 3; else return null; }
  return next;
}
export function removeElectron(occ: number[], box: number): number[] | null {
  if (!Number.isInteger(box) || box < 0 || box >= occ.length || occ[box] === 0) return null;
  const next = occ.slice();
  next[box] = occ[box] === 3 ? 2 : 0; // remove the spin-up electron of a pair first, leaving ↓; singles are emptied
  return next;
}

/** The species the same atoms would form with the other ordering: used to show why the 2p order matters (B₂, C₂). */
export function withOrdering(s: DiatomicSpecies, ordering: MOOrdering): DiatomicSpecies { return { ...s, ordering }; }

/** Bond order from a ground-state filling, a convenience for tests and labels. */
export const groundBondOrder = (s: DiatomicSpecies): number => analyzeOccupancy(s, groundOccupancy(s)).bondOrder;

// ---- LCAO illustration for two hydrogen 1s orbitals (explicit approximation) -----------------------------------------------------------------------

/**
 * σ1s and σ*1s of H₂-like systems from the LCAO of two hydrogen 1s functions (exponent 1, so φ = e^(−r)/√π) at fixed separation R (bohr):
 *   ψ± = (φ_A ± φ_B) / √(2(1 ± S)),  S(R) = e^(−R)(1 + R + R²/3).
 * The exponent is not optimised and no energy is computed: this is an illustration of in-phase and out-of-phase overlap.
 */
export const overlapS = (R: number): number => Math.exp(-R) * (1 + R + (R * R) / 3);
export const H2_EQUILIBRIUM_R = 1.4;
export function lcaoAmplitude(sign: 1 | -1, R: number, x: number, z: number): number {
  const phi = (zz: number) => Math.exp(-Math.sqrt(x * x + zz * zz)) / Math.sqrt(Math.PI);
  return (phi(z - R / 2) + sign * phi(z + R / 2)) / Math.sqrt(2 * (1 + sign * overlapS(R)));
}
export interface LcaoGrid { N: number; extentX: number; extentZ: number; amplitude: Float64Array; density: Float64Array; maxAmp: number; maxDensity: number }
export function lcaoGrid(sign: 1 | -1, R: number, N = 71): LcaoGrid {
  const extentZ = R / 2 + 4.5; const extentX = 4.5;
  const amp = new Float64Array(N * N); const den = new Float64Array(N * N);
  let ma = 0; let md = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -extentX + (2 * extentX * i) / (N - 1); const z = extentZ - (2 * extentZ * j) / (N - 1);
    const a = lcaoAmplitude(sign, R, x, z);
    amp[j * N + i] = a; den[j * N + i] = a * a;
    if (Math.abs(a) > ma) ma = Math.abs(a); if (a * a > md) md = a * a;
  }
  return { N, extentX, extentZ, amplitude: amp, density: den, maxAmp: ma, maxDensity: md };
}
