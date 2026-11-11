/**
 * Chemical equilibrium model (Stage 12). A deliberately bounded class of systems:
 *
 *   a A (+ b B)  ⇌  c C (+ d D)        one reaction, 1–2 reactants, 1–2 products, integer coefficients 1–6
 *
 * - Every species is a solute or ideal gas whose activity is its concentration in mol/L (Kc = ∏[products]^ν / ∏[reactants]^ν).
 * - Pure solids and liquids, solvents, coupled/simultaneous equilibria, ionic-strength effects and non-ideal gases are NOT supported.
 * - Constant volume and temperature while the system relaxes; K is fixed by temperature alone.
 *
 * Method. With extent ξ (mol/L of reaction events), reactant i has c_i − ν_i ξ and product j has c_j + ν_j ξ. The function
 *   G(ξ) = ln Q(ξ) − ln K = Σ ν_p ln c_p − Σ ν_r ln c_r − ln K
 * has dG/dξ = Σ ν_p²/c_p + Σ ν_r²/c_r > 0 on the physical interval, so it has exactly one root there and no other root keeps all
 * concentrations non-negative. The root is found by bisection (in log ξ, so extreme K keeps full relative precision on the small
 * quantity). Concentrations are always assembled from sums of non-negative terms, never by subtracting near-equal numbers.
 */

export interface Species { name: string; coeff: number; c0: number }
export type Phase = "aqueous" | "gas";
export interface EquilibriumSystem { reactants: Species[]; products: Species[]; K: number; phase: Phase }

export const EQ_LIMITS = {
  maxCoeff: 6,
  maxConc: 100,
  minK: 1e-15,
  maxK: 1e15,
  maxNameLength: 14,
} as const;

export type Validation<T> = { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[] };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function validateSpecies(raw: unknown, side: string, index: number, errors: string[]): Species | null {
  const label = `${side} ${index + 1}`;
  if (typeof raw !== "object" || raw === null) { errors.push(`${label} is missing.`); return null; }
  const s = raw as Record<string, unknown>;
  let ok = true;
  if (typeof s.name !== "string" || s.name.trim() === "" || s.name.length > EQ_LIMITS.maxNameLength) { errors.push(`${label}: the name must be 1–${EQ_LIMITS.maxNameLength} characters.`); ok = false; }
  if (!finite(s.coeff) || !Number.isInteger(s.coeff) || s.coeff < 1 || s.coeff > EQ_LIMITS.maxCoeff) { errors.push(`${label}: the coefficient must be a whole number from 1 to ${EQ_LIMITS.maxCoeff}.`); ok = false; }
  if (!finite(s.c0) || s.c0 < 0 || s.c0 > EQ_LIMITS.maxConc) { errors.push(`${label}: the initial concentration must be a number from 0 to ${EQ_LIMITS.maxConc} mol/L.`); ok = false; }
  return ok ? { name: (s.name as string).trim(), coeff: s.coeff as number, c0: s.c0 as number } : null;
}

export function validateEquilibrium(raw: unknown): Validation<EquilibriumSystem> {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["The system is missing."] };
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.reactants) || r.reactants.length < 1 || r.reactants.length > 2) errors.push("Use 1 or 2 reactants.");
  if (!Array.isArray(r.products) || r.products.length < 1 || r.products.length > 2) errors.push("Use 1 or 2 products.");
  if (r.phase !== "aqueous" && r.phase !== "gas") errors.push("The phase must be aqueous or gas.");
  if (!finite(r.K) || r.K < EQ_LIMITS.minK || r.K > EQ_LIMITS.maxK) errors.push(`K must be a number from ${EQ_LIMITS.minK.toExponential(0)} to ${EQ_LIMITS.maxK.toExponential(0)}.`);
  if (errors.length) return { ok: false, errors };
  const reactants = (r.reactants as unknown[]).map((s, i) => validateSpecies(s, "Reactant", i, errors));
  const products = (r.products as unknown[]).map((s, i) => validateSpecies(s, "Product", i, errors));
  if (errors.length) return { ok: false, errors };
  const all = [...reactants, ...products] as Species[];
  const names = new Set(all.map((s) => s.name));
  if (names.size !== all.length) return { ok: false, errors: ["Every species needs a different name (a species cannot be on both sides)."] };
  if (all.every((s) => s.c0 === 0)) return { ok: false, errors: ["Give at least one species a non-zero initial concentration."] };
  const warnings: string[] = [];
  if (all.some((s) => s.c0 > 10)) warnings.push("Concentrations above about 10 mol/L are far from ideal; activities would differ from concentrations.");
  return {
    ok: true,
    value: { reactants: reactants as Species[], products: products as Species[], K: r.K as number, phase: r.phase as Phase },
    warnings,
  };
}

// ---- core solver ---------------------------------------------------------------------------------------------------

const LN_FLOOR = Math.log(1e-300);

/** ln Q for concentrations (zero concentration on the product side gives −∞, on the reactant side +∞). */
export function lnQ(reactants: Array<{ coeff: number; c: number }>, products: Array<{ coeff: number; c: number }>): number {
  let value = 0;
  for (const p of products) value += p.c > 0 ? p.coeff * Math.log(p.c) : -Infinity;
  for (const r of reactants) value -= r.c > 0 ? r.coeff * Math.log(r.c) : -Infinity;
  return value;
}

interface Directed { xi: number; reactants: number[]; products: number[] }

/** Solves for the forward extent ξ ∈ (0, ξmax) of R ⇌ P with the given ln K. Requires every reactant > 0 and Q0 < K. */
function solveForward(R: Species[], P: Species[], lnK: number): Directed {
  const xiMax = Math.min(...R.map((s) => s.c0 / s.coeff));
  const rem = R.map((s) => (s.c0 / s.coeff === xiMax ? 0 : Math.max(0, s.c0 - s.coeff * xiMax)));
  const byXi = (xi: number) => ({ r: R.map((s) => s.c0 - s.coeff * xi), p: P.map((s) => s.c0 + s.coeff * xi) });
  const byDelta = (d: number) => ({
    r: R.map((s, i) => rem[i] + s.coeff * d),
    p: P.map((s) => s.c0 + s.coeff * xiMax - s.coeff * d),
  });
  const G = (c: { r: number[]; p: number[] }) =>
    lnQ(R.map((s, i) => ({ coeff: s.coeff, c: c.r[i] })), P.map((s, i) => ({ coeff: s.coeff, c: c.p[i] }))) - lnK;

  const mid = xiMax / 2;
  let lo: number;
  let hi: number;
  let param: "xi" | "delta";
  if (G(byXi(mid)) >= 0) { param = "xi"; lo = LN_FLOOR; hi = Math.log(mid); } else { param = "delta"; lo = LN_FLOOR; hi = Math.log(mid); }
  // xi: G increasing in the parameter. delta: G decreasing in the parameter.
  for (let i = 0; i < 200 && hi - lo > 1e-15; i += 1) {
    const m = (lo + hi) / 2;
    const g = G(param === "xi" ? byXi(Math.exp(m)) : byDelta(Math.exp(m)));
    if (param === "xi" ? g > 0 : g < 0) hi = m; else lo = m;
  }
  const t = Math.exp((lo + hi) / 2);
  if (param === "xi") {
    const c = byXi(t);
    return { xi: t, reactants: c.r.map((v) => Math.max(0, v)), products: c.p };
  }
  const c = byDelta(t);
  return { xi: xiMax - t, reactants: c.r, products: c.p.map((v) => Math.max(0, v)) };
}

export type Direction = "forward" | "reverse" | "none";

export interface EquilibriumResult {
  direction: Direction;
  /** Signed extent in mol/L: positive = net forward (towards products). */
  xi: number;
  reactants: number[];
  products: number[];
  /** Reaction quotient of the starting mixture; null when it is undefined or infinite (a species is absent). */
  Q0: number | null;
  /** Bounds of the extent that keep every concentration ≥ 0. */
  xiMin: number;
  xiMax: number;
  /** Q recomputed from the answer, as a self-check against K. */
  Qeq: number;
  /** Largest relative error of ln Q against ln K at the answer. */
  lnResidual: number;
}

export function solveEquilibrium(system: EquilibriumSystem): EquilibriumResult {
  const { reactants: R, products: P, K } = system;
  const lnK = Math.log(K);
  const xiMax = Math.min(...R.map((s) => s.c0 / s.coeff));
  const xiMin = -Math.min(...P.map((s) => s.c0 / s.coeff));
  const start = (xi: number, direction: Direction, r?: number[], p?: number[]): EquilibriumResult => {
    const rc = r ?? R.map((s) => s.c0 - s.coeff * xi);
    const pc = p ?? P.map((s) => s.c0 + s.coeff * xi);
    const lq = lnQ(R.map((s, i) => ({ coeff: s.coeff, c: rc[i] })), P.map((s, i) => ({ coeff: s.coeff, c: pc[i] })));
    const lq0 = lnQ(R.map((s) => ({ coeff: s.coeff, c: s.c0 })), P.map((s) => ({ coeff: s.coeff, c: s.c0 })));
    return {
      direction, xi, reactants: rc, products: pc,
      Q0: Number.isFinite(lq0) ? Math.exp(lq0) : null,
      xiMin, xiMax,
      Qeq: Number.isFinite(lq) ? Math.exp(lq) : Number.NaN,
      lnResidual: Number.isFinite(lq) ? Math.abs(lq - lnK) / Math.max(1, Math.abs(lnK)) : Number.NaN,
    };
  };

  if (xiMax <= 0 && xiMin >= 0) return start(0, "none"); // nothing can react in either direction

  let direction: Direction;
  if (xiMax <= 0) direction = "reverse";
  else if (xiMin >= 0) direction = "forward";
  else {
    const lq0 = lnQ(R.map((s) => ({ coeff: s.coeff, c: s.c0 })), P.map((s) => ({ coeff: s.coeff, c: s.c0 })));
    if (Math.abs(lq0 - lnK) <= 1e-12 * Math.max(1, Math.abs(lnK))) return start(0, "none");
    direction = lq0 < lnK ? "forward" : "reverse";
  }

  if (direction === "forward") {
    const d = solveForward(R, P, lnK);
    return start(d.xi, "forward", d.reactants, d.products);
  }
  // reverse: swap the sides, solve forward with 1/K, then map back
  const d = solveForward(P, R, -lnK);
  return start(-d.xi, "reverse", d.products, d.reactants);
}

// ---- reaction quotient and bounds --------------------------------------------------------------------------------------

/** Q for the given concentrations; null if it is zero/undefined/infinite (use lnQ for the extended value). */
export function reactionQuotient(system: EquilibriumSystem, conc: { reactants: number[]; products: number[] }): number | null {
  const l = lnQ(system.reactants.map((s, i) => ({ coeff: s.coeff, c: conc.reactants[i] })), system.products.map((s, i) => ({ coeff: s.coeff, c: conc.products[i] })));
  return Number.isFinite(l) ? Math.exp(l) : null;
}

/** What Q = K comparison says: the direction the net reaction must go to reach equilibrium. */
export function predictDirection(system: EquilibriumSystem, conc: { reactants: number[]; products: number[] }): { direction: Direction; lnQ: number } {
  const lq = lnQ(system.reactants.map((s, i) => ({ coeff: s.coeff, c: conc.reactants[i] })), system.products.map((s, i) => ({ coeff: s.coeff, c: conc.products[i] })));
  const lnK = Math.log(system.K);
  const anyReactant = conc.reactants.every((c) => c > 0);
  const anyProduct = conc.products.every((c) => c > 0);
  if (!anyReactant && !anyProduct) return { direction: "none", lnQ: lq };
  if (!anyReactant) return { direction: "reverse", lnQ: lq };
  if (!anyProduct) return { direction: "forward", lnQ: lq };
  if (Math.abs(lq - lnK) <= 1e-9 * Math.max(1, Math.abs(lnK))) return { direction: "none", lnQ: lq };
  return { direction: lq < lnK ? "forward" : "reverse", lnQ: lq };
}

export function withInitial(system: EquilibriumSystem, conc: { reactants: number[]; products: number[] }): EquilibriumSystem {
  return {
    ...system,
    reactants: system.reactants.map((s, i) => ({ ...s, c0: conc.reactants[i] })),
    products: system.products.map((s, i) => ({ ...s, c0: conc.products[i] })),
  };
}

/** Δn = Σν(products) − Σν(reactants). */
export const deltaNu = (system: EquilibriumSystem): number =>
  system.products.reduce((a, s) => a + s.coeff, 0) - system.reactants.reduce((a, s) => a + s.coeff, 0);

// ---- progress curve ------------------------------------------------------------------------------------------------------

export interface ProgressPoint { xi: number; reactants: number[]; products: number[]; lnQ: number }

/** Concentrations along the whole physical extent range (for the composition graph). Includes the exact equilibrium extent. */
export function progressCurve(system: EquilibriumSystem, xiEq: number, points = 160): ProgressPoint[] {
  const R = system.reactants;
  const P = system.products;
  const xiMax = Math.min(...R.map((s) => s.c0 / s.coeff));
  const xiMin = -Math.min(...P.map((s) => s.c0 / s.coeff));
  if (!(xiMax - xiMin > 0)) return [];
  const xs = new Set<number>([xiMin, xiMax, xiEq]);
  for (let i = 1; i < points; i += 1) xs.add(xiMin + ((xiMax - xiMin) * i) / points);
  return [...xs].sort((a, b) => a - b).map((xi) => {
    const r = R.map((s) => Math.max(0, s.c0 - s.coeff * xi));
    const p = P.map((s) => Math.max(0, s.c0 + s.coeff * xi));
    return { xi, reactants: r, products: p, lnQ: lnQ(R.map((s, i) => ({ coeff: s.coeff, c: r[i] })), P.map((s, i) => ({ coeff: s.coeff, c: p[i] }))) };
  });
}

// ---- Le Châtelier disturbances -----------------------------------------------------------------------------------------

export type Disturbance =
  | { kind: "add"; side: "reactants" | "products"; index: number; amount: number }
  | { kind: "remove"; side: "reactants" | "products"; index: number; amount: number }
  | { kind: "volume"; factor: number }
  | { kind: "inert" };

export interface DisturbanceOutcome {
  ok: true;
  /** Concentrations immediately after the disturbance, before any reaction. */
  immediate: { reactants: number[]; products: number[] };
  QImmediate: number | null;
  lnQImmediate: number;
  /** Which way the net reaction goes to restore Q = K. */
  shift: Direction;
  after: EquilibriumResult;
  /** K is the same before and after: only Q was disturbed. */
  K: number;
  note: string;
}

export const VOLUME_FACTOR_RANGE: [number, number] = [0.1, 10];

/** Applies a disturbance to a system that is at equilibrium (concentrations `eq`) and re-solves. */
export function applyDisturbance(
  system: EquilibriumSystem,
  eq: { reactants: number[]; products: number[] },
  d: Disturbance,
): DisturbanceOutcome | { ok: false; reason: string } {
  const imm = { reactants: [...eq.reactants], products: [...eq.products] };
  let note = "";
  if (d.kind === "add" || d.kind === "remove") {
    const list = imm[d.side];
    if (!Number.isInteger(d.index) || d.index < 0 || d.index >= list.length) return { ok: false, reason: "Choose a species that is in the reaction." };
    if (!finite(d.amount) || d.amount <= 0) return { ok: false, reason: "The amount must be a positive number of mol/L." };
    if (d.kind === "remove" && d.amount > list[d.index] * (1 + 1e-12)) return { ok: false, reason: "You cannot remove more than is present." };
    const next = d.kind === "add" ? list[d.index] + d.amount : Math.max(0, list[d.index] - d.amount);
    if (next > EQ_LIMITS.maxConc) return { ok: false, reason: `Concentrations above ${EQ_LIMITS.maxConc} mol/L are outside the model.` };
    list[d.index] = next;
    const name = (d.side === "reactants" ? system.reactants : system.products)[d.index].name;
    note = `${d.kind === "add" ? "Adding" : "Removing"} ${name} at constant volume changes only [${name}]; K depends on temperature alone.`;
  } else if (d.kind === "volume") {
    if (!finite(d.factor) || d.factor < VOLUME_FACTOR_RANGE[0] || d.factor > VOLUME_FACTOR_RANGE[1]) return { ok: false, reason: `The volume factor must be between ${VOLUME_FACTOR_RANGE[0]} and ${VOLUME_FACTOR_RANGE[1]}.` };
    imm.reactants = imm.reactants.map((c) => c / d.factor);
    imm.products = imm.products.map((c) => c / d.factor);
    note = `Changing the volume by a factor of ${d.factor} scales every concentration by ${Number((1 / d.factor).toPrecision(4))}; Q changes by ${Number((d.factor ** -deltaNu(system)).toPrecision(4))} (= factor^−Δν, Δν = ${deltaNu(system)}). Valid for ideal gases and ideal dilute solutions only.`;
  } else {
    note = "Adding an inert gas at constant volume leaves every concentration, Q and K unchanged.";
  }
  const lq = lnQ(system.reactants.map((s, i) => ({ coeff: s.coeff, c: imm.reactants[i] })), system.products.map((s, i) => ({ coeff: s.coeff, c: imm.products[i] })));
  const shift = predictDirection(system, imm).direction;
  const after = solveEquilibrium(withInitial(system, imm));
  return { ok: true, immediate: imm, QImmediate: Number.isFinite(lq) ? Math.exp(lq) : null, lnQImmediate: lq, shift, after, K: system.K, note };
}

// ---- Kp --------------------------------------------------------------------------------------------------------------------

/** R in L·bar/(mol·K). */
export const R_L_BAR = 0.0831446261815324;

/**
 * Dimensionless Kp for gases with partial pressures in bar (standard pressure 1 bar), from Kc with concentrations in mol/L
 * (standard concentration 1 mol/L): Kp = Kc · (R T)^Δn with R in L·bar/(mol·K). Ideal gases only.
 */
export function kpFromKc(Kc: number, dn: number, T: number): number {
  return Kc * (R_L_BAR * T) ** dn;
}
export function kcFromKp(Kp: number, dn: number, T: number): number {
  return Kp / (R_L_BAR * T) ** dn;
}

// ---- guided solution ---------------------------------------------------------------------------------------------------------

export function reactionText(system: EquilibriumSystem): string {
  const side = (list: Species[]) => list.map((s) => `${s.coeff === 1 ? "" : s.coeff} ${s.name}`.trim()).join(" + ");
  return `${side(system.reactants)} ⇌ ${side(system.products)}`;
}
export function kExpressionText(system: EquilibriumSystem): string {
  const part = (list: Species[]) => list.map((s) => `[${s.name}]${s.coeff === 1 ? "" : superscript(s.coeff)}`).join("");
  return `K = ${part(system.products)} / ${part(system.reactants)}`;
}
function superscript(n: number): string { return String(n).split("").map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(c)]).join(""); }
