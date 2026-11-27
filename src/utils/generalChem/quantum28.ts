/**
 * Stage 28: quantum numbers, shells, subshells and orbitals (pure; no React).
 *
 * An ORBITAL here is a spatial one-electron function labelled (n, l, m_l). An electron STATE adds the spin projection m_s = ±1/2, so every
 * orbital holds at most two states. Rules: n >= 1; 0 <= l <= n-1; -l <= m_l <= l; m_s = ±1/2 (stored as +1 / -1, meaning +1/2 and -1/2).
 * Nothing here moves electrons: an orbital is a probability amplitude, not an orbit.
 */
export const SUBSHELL_LETTERS = ["s", "p", "d", "f", "g", "h", "i"] as const;
export const MAX_SHELL = 7;

export interface QuantumInput { n: number; l: number; ml: number; ms?: number }
export type QuantumCheck = { ok: true } | { ok: false; reasons: string[] };

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

export function subshellLetter(l: number): string { return SUBSHELL_LETTERS[l] ?? `l=${l}`; }
export function subshellLabel(n: number, l: number): string { return `${n}${subshellLetter(l)}`; }
/** Number of spatial orbitals in a subshell: 2l + 1. */
export const subshellOrbitalCount = (l: number): number => 2 * l + 1;
/** Electron capacity of a subshell: 2(2l + 1). */
export const subshellCapacity = (l: number): number => 2 * (2 * l + 1);
/** Orbitals in shell n: n². */
export const shellOrbitalCount = (n: number): number => n * n;
/** Electrons in a full shell: 2n². */
export const shellCapacity = (n: number): number => 2 * n * n;

/** Checks every rule and reports each one that is broken, so the explorer can say why a combination is not allowed. */
export function checkQuantumNumbers(q: QuantumInput): QuantumCheck {
  const reasons: string[] = [];
  if (!isInt(q.n) || q.n < 1) reasons.push("n must be a whole number of at least 1.");
  if (!isInt(q.l) || q.l < 0) reasons.push("l must be a whole number of at least 0.");
  else if (isInt(q.n) && q.n >= 1 && q.l > q.n - 1) reasons.push(`l can be at most n − 1 = ${q.n - 1}; l = ${q.l} is not allowed for n = ${q.n}.`);
  if (!isInt(q.ml)) reasons.push("m_l must be a whole number.");
  else if (isInt(q.l) && q.l >= 0 && Math.abs(q.ml) > q.l) reasons.push(`m_l must lie between −l and +l (−${q.l} to ${q.l}); m_l = ${q.ml} is not allowed for l = ${q.l}.`);
  if (q.ms !== undefined && q.ms !== 1 && q.ms !== -1) reasons.push("m_s must be +1/2 or −1/2.");
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

export interface OrbitalInfo { n: number; l: number; ml: number; label: string }

/** All orbitals of shell n in the order l ascending then m_l from −l to +l: n² of them. */
export function enumerateOrbitals(n: number): OrbitalInfo[] {
  if (!isInt(n) || n < 1 || n > MAX_SHELL) return [];
  const out: OrbitalInfo[] = [];
  for (let l = 0; l < n; l++) for (let ml = -l; ml <= l; ml++) out.push({ n, l, ml, label: `${subshellLabel(n, l)} (m_l = ${ml})` });
  return out;
}

/** All electron states (orbital × spin) of shell n: 2n² of them. */
export function enumerateStates(n: number): Array<OrbitalInfo & { ms: 1 | -1 }> {
  return enumerateOrbitals(n).flatMap((o) => ([1, -1] as const).map((ms) => ({ ...o, ms })));
}

/** Radial and angular node counts of a hydrogenic orbital (n − l − 1, l). Valid for the ideal one-electron model. */
export function nodeCounts(n: number, l: number): { radial: number; angular: number; total: number } {
  return { radial: n - l - 1, angular: l, total: n - 1 };
}

/** The ideal one-electron energy depends on n only, so every orbital of shell n has the same energy: n² orbitals, 2n² states. */
export const hydrogenicDegeneracy = (n: number): number => n * n;
