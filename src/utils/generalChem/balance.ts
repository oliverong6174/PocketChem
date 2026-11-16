/**
 * Equation balancing by exact rational linear algebra (pure). The species of a supplied reaction give one linear condition per element
 * and one for charge: sum(coefficient × count) over reactants = the same over products. The coefficients are a vector in the null space
 * of that matrix, found with BigInt fractions (no floating point, no guessing). It balances a SUPPLIED reaction; it never decides which
 * products form.
 *
 * Outcomes: exactly one independent solution with every coefficient positive (returned in smallest whole numbers); no solution; more than
 * one independent solution (underdetermined: not returned); or a unique solution that is not admissible (a species would have to be on
 * the other side or take no part).
 */
import { parseFormula, type ParsedFormula } from "./formula";

export interface EqSpecies { text: string; coeff: number | null; parsed: ParsedFormula }
export interface Equation { reactants: EqSpecies[]; products: EqSpecies[] }
export type EquationResult = { ok: true; value: Equation } | { ok: false; error: string };

export const EQUATION_LIMITS = { maxSide: 6, maxCoefficient: 999, maxLength: 400 } as const;

function parseSide(text: string, side: string): { ok: true; items: EqSpecies[] } | { ok: false; error: string } {
  const pieces = text.trim().split(/\s+\+\s+/);
  if (pieces.length > EQUATION_LIMITS.maxSide) return { ok: false, error: `The ${side} side has more than ${EQUATION_LIMITS.maxSide} species.` };
  const items: EqSpecies[] = [];
  for (const raw of pieces) {
    const piece = raw.trim();
    if (piece === "") return { ok: false, error: `The ${side} side has an empty species (check for a doubled or trailing "+").` };
    let coeff: number | null = null;
    let formula = piece;
    const lead = /^(\d+)\s*(?=[A-Za-z(\[])/.exec(piece);
    if (lead) {
      coeff = Number(lead[1]);
      if (coeff < 1 || coeff > EQUATION_LIMITS.maxCoefficient) return { ok: false, error: `A coefficient must be a whole number from 1 to ${EQUATION_LIMITS.maxCoefficient} (${lead[1]} in "${piece}").` };
      formula = piece.slice(lead[0].length);
    }
    const p = parseFormula(formula);
    if (!p.ok) return { ok: false, error: `"${piece}": ${p.error}` };
    items.push({ text: formula.trim(), coeff, parsed: p.value });
  }
  return { ok: true, items };
}

/** "A + B -> C + D" (also =>, →, =). Species are separated by " + " with spaces around the plus. */
export function parseEquation(input: string): EquationResult {
  if (typeof input !== "string") return { ok: false, error: "The equation must be text." };
  const text = input.trim();
  if (text === "") return { ok: false, error: "Enter an equation such as H2 + O2 -> H2O." };
  if (text.length > EQUATION_LIMITS.maxLength) return { ok: false, error: `An equation is limited to ${EQUATION_LIMITS.maxLength} characters.` };
  const sides = text.split(/\s*(?:->|=>|→|⟶|=)\s*/);
  if (sides.length !== 2) return { ok: false, error: "Write exactly one arrow (->, → or =) between the reactants and the products." };
  const r = parseSide(sides[0], "reactant");
  if (!r.ok) return r;
  const p = parseSide(sides[1], "product");
  if (!p.ok) return p;
  return { ok: true, value: { reactants: r.items, products: p.items } };
}

// ---- exact fractions ---------------------------------------------------------------------------------------------------------------
type Frac = { n: bigint; d: bigint };
const babs = (a: bigint) => (a < 0n ? -a : a);
const gcd = (a: bigint, b: bigint): bigint => { a = babs(a); b = babs(b); while (b) { [a, b] = [b, a % b]; } return a; };
const frac = (n: bigint, d: bigint = 1n): Frac => { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return { n: n / g, d: d / g }; };
const sub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
const div = (a: Frac, b: Frac) => frac(a.n * b.d, a.d * b.n);

/** The null space of an integer matrix, as vectors of fractions (one per free column). */
function nullSpace(matrix: number[][], cols: number): Frac[][] {
  const m = matrix.map((row) => row.map((v) => frac(BigInt(v))));
  const pivotCols: number[] = [];
  let r = 0;
  for (let c = 0; c < cols && r < m.length; c += 1) {
    let p = -1;
    for (let k = r; k < m.length; k += 1) if (m[k][c].n !== 0n) { p = k; break; }
    if (p < 0) continue;
    [m[r], m[p]] = [m[p], m[r]];
    const pv = m[r][c];
    m[r] = m[r].map((x) => div(x, pv));
    for (let k = 0; k < m.length; k += 1) {
      if (k === r || m[k][c].n === 0n) continue;
      const f = m[k][c];
      m[k] = m[k].map((x, j) => sub(x, mul(f, m[r][j])));
    }
    pivotCols.push(c);
    r += 1;
  }
  const free = Array.from({ length: cols }, (_, c) => c).filter((c) => !pivotCols.includes(c));
  return free.map((fc) => {
    const v: Frac[] = Array.from({ length: cols }, () => frac(0n));
    v[fc] = frac(1n);
    pivotCols.forEach((pc, row) => { v[pc] = frac(-m[row][fc].n, m[row][fc].d); });
    return v;
  });
}

export type BalanceResult =
  | { ok: true; coefficients: number[]; reactantCoefficients: number[]; productCoefficients: number[]; note: string }
  | { ok: false; kind: "none" | "underdetermined" | "inadmissible" | "invalid"; error: string };

function matrixFor(eq: Equation): { matrix: number[][]; cols: number } {
  const all = [...eq.reactants, ...eq.products];
  const symbols = [...new Set(all.flatMap((s) => Object.keys(s.parsed.counts)))].sort();
  const nR = eq.reactants.length;
  const sign = (idx: number) => (idx < nR ? 1 : -1);
  const matrix = symbols.map((sym) => all.map((s, i) => sign(i) * (s.parsed.counts[sym] ?? 0)));
  if (all.some((s) => s.parsed.charge !== 0)) matrix.push(all.map((s, i) => sign(i) * s.parsed.charge));
  return { matrix, cols: all.length };
}

export function balanceEquation(eq: Equation): BalanceResult {
  const all = [...eq.reactants, ...eq.products];
  const keys = all.map((s) => s.parsed.text);
  if (new Set(keys).size !== keys.length) return { ok: false, kind: "invalid", error: "A species appears twice in the equation. List each species once." };
  const { matrix, cols } = matrixFor(eq);
  const basis = nullSpace(matrix, cols);
  if (basis.length === 0) return { ok: false, kind: "none", error: "No set of whole-number coefficients conserves every element and the charge for these species. Check the formulas; a reactant or product may be missing." };
  if (basis.length > 1) return { ok: false, kind: "underdetermined", error: `These species can be balanced in ${basis.length} independent ways (the equation is underdetermined), so no single set of coefficients is returned. Remove a species that is not needed or split it into separate reactions.` };
  const v = basis[0];
  let den = 1n;
  for (const x of v) den = (den * x.d) / gcd(den, x.d);
  let ints = v.map((x) => (x.n * den) / x.d);
  let g = 0n;
  for (const x of ints) g = gcd(g, x);
  ints = ints.map((x) => x / (g || 1n));
  if (ints.every((x) => x <= 0n)) ints = ints.map((x) => -x);
  const zero = ints.findIndex((x) => x === 0n);
  if (zero >= 0) return { ok: false, kind: "inadmissible", error: `The only conserving solution gives ${all[zero].text} a coefficient of 0, so it does not take part. Remove it from the equation.` };
  const wrong = ints.findIndex((x) => x < 0n);
  if (wrong >= 0) return { ok: false, kind: "inadmissible", error: `Balancing would need ${all[wrong].text} on the other side of the arrow (a negative coefficient), so the reaction as written cannot be balanced.` };
  const coefficients = ints.map((x) => Number(x));
  if (coefficients.some((c) => c > 1e6)) return { ok: false, kind: "inadmissible", error: "The smallest whole-number coefficients are larger than 1,000,000; the equation is outside the supported range." };
  return {
    ok: true,
    coefficients,
    reactantCoefficients: coefficients.slice(0, eq.reactants.length),
    productCoefficients: coefficients.slice(eq.reactants.length),
    note: "Smallest whole-number coefficients that conserve every element and the charge. This balances the species you supplied; it does not predict that the reaction occurs.",
  };
}

export interface ConservationRow { label: string; left: number; right: number; balanced: boolean }
/** Atom and charge totals on each side for the given coefficients (manual balancing check). */
export function conservation(eq: Equation, coefficients: number[]): ConservationRow[] {
  const all = [...eq.reactants, ...eq.products];
  const nR = eq.reactants.length;
  const symbols = [...new Set(all.flatMap((s) => Object.keys(s.parsed.counts)))].sort();
  const rows: ConservationRow[] = symbols.map((sym) => {
    let left = 0; let right = 0;
    all.forEach((s, i) => { const t = (s.parsed.counts[sym] ?? 0) * coefficients[i]; if (i < nR) left += t; else right += t; });
    return { label: sym, left, right, balanced: left === right };
  });
  if (all.some((s) => s.parsed.charge !== 0)) {
    let left = 0; let right = 0;
    all.forEach((s, i) => { const t = s.parsed.charge * coefficients[i]; if (i < nR) left += t; else right += t; });
    rows.push({ label: "charge", left, right, balanced: left === right });
  }
  return rows;
}
export const isBalanced = (eq: Equation, coefficients: number[]) => coefficients.length === eq.reactants.length + eq.products.length && coefficients.every((c) => Number.isInteger(c) && c >= 1) && conservation(eq, coefficients).every((r) => r.balanced);
export const isLowestTerms = (coefficients: number[]) => { let g = 0; for (const c of coefficients) { let a = g; let b = c; while (b) { [a, b] = [b, a % b]; } g = a; } return g === 1; };
