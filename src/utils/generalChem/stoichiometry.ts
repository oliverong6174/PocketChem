/**
 * Stoichiometry of ONE supplied, balanced reaction (pure). Everything is derived from a single reaction extent ξ:
 *   n_i(final) = n_i(initial) + ν_i ξ   (ν negative for reactants, positive for products)
 * and the reaction stops when the first reactant is used up: ξ_max = min over reactants of n_i(initial)/|ν_i|. Products are
 * never limited one at a time; there is one extent for the whole reaction.
 *
 * Theoretical yield is the product amount at ξ_max for a reaction that goes to completion. It is a calculation from the balanced
 * equation, not an observation, and not a prediction that the reaction occurs.
 */
import { balanceEquation, conservation, isBalanced, isLowestTerms, parseEquation, type Equation } from "./balance";

export type AmountMode = "mol" | "g" | "soln";
export interface AmountSpec {
  mode: AmountMode;
  /** moles (mode mol) or grams of the sample (mode g). */
  value: number;
  /** Mass percent of the reactant in the sample, 0 < p ≤ 100 (mode g only). */
  purity: number;
  /** Molarity (mol/L) and volume (mL) of a solution of the reactant (mode soln). */
  M: number;
  mL: number;
}
export const DEFAULT_AMOUNT: AmountSpec = { mode: "mol", value: 1, purity: 100, M: 1, mL: 100 };
export const STOICH_LIMITS = { maxMol: 1e6, maxGrams: 1e9, maxMolarity: 30, maxMl: 1e7, minPurity: 0.001 } as const;

export interface RxnSpecies { text: string; coeff: number; mass: number; charge: number }
export interface ReactionModel { equation: Equation; reactants: RxnSpecies[]; products: RxnSpecies[]; balancedBy: "given" | "auto"; lowestTerms: boolean }
export type ReactionResult = { ok: true; value: ReactionModel } | { ok: false; error: string };

/** Turn the entered equation into a balanced reaction: use the coefficients the user wrote if all are given and correct, else balance it. */
export function resolveReaction(text: string): ReactionResult {
  const parsed = parseEquation(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const eq = parsed.value;
  const all = [...eq.reactants, ...eq.products];
  if (all.some((s) => s.parsed.electron)) return { ok: false, error: "Free electrons belong in the electrochemistry tool; stoichiometry here uses species with a molar mass." };
  const given = all.every((s) => s.coeff !== null);
  let coeffs: number[];
  let balancedBy: "given" | "auto";
  if (given) {
    coeffs = all.map((s) => s.coeff as number);
    if (!isBalanced(eq, coeffs)) {
      const bad = conservation(eq, coeffs).filter((r) => !r.balanced).map((r) => `${r.label}: ${r.left} vs ${r.right}`).join("; ");
      const b = balanceEquation(eq);
      return { ok: false, error: `The coefficients you wrote do not balance (${bad}).${b.ok ? ` A balanced form is ${b.coefficients.join(", ")} in the order written.` : ""}` };
    }
    balancedBy = "given";
  } else {
    const b = balanceEquation(eq);
    if (!b.ok) return { ok: false, error: b.error };
    coeffs = b.coefficients;
    balancedBy = "auto";
  }
  const toSp = (s: (typeof all)[number], i: number): RxnSpecies => ({ text: s.text, coeff: coeffs[i], mass: s.parsed.mass, charge: s.parsed.charge });
  const nR = eq.reactants.length;
  return { ok: true, value: { equation: eq, reactants: eq.reactants.map((s, i) => toSp(s, i)), products: eq.products.map((s, i) => toSp(s, nR + i)), balancedBy, lowestTerms: isLowestTerms(coeffs) } };
}

const finite = (v: number) => Number.isFinite(v);

export type MolesResult = { ok: true; moles: number; grams: number } | { ok: false; error: string };
/** Moles of the reactant in the sample described by the spec (mass is the pure-reactant mass). */
export function amountToMoles(a: AmountSpec, molarMass: number): MolesResult {
  if (a.mode === "mol") {
    if (!finite(a.value) || a.value < 0) return { ok: false, error: "The amount must be a number of moles that is not negative." };
    if (a.value > STOICH_LIMITS.maxMol) return { ok: false, error: `Amounts above ${STOICH_LIMITS.maxMol} mol are outside the supported range.` };
    return { ok: true, moles: a.value, grams: a.value * molarMass };
  }
  if (a.mode === "g") {
    if (!finite(a.value) || a.value < 0) return { ok: false, error: "The mass must be a number of grams that is not negative." };
    if (a.value > STOICH_LIMITS.maxGrams) return { ok: false, error: "Masses above 10⁹ g are outside the supported range." };
    if (!finite(a.purity) || a.purity < STOICH_LIMITS.minPurity || a.purity > 100) return { ok: false, error: "Purity must be a percentage above 0 and at most 100." };
    const pure = (a.value * a.purity) / 100;
    return { ok: true, moles: pure / molarMass, grams: pure };
  }
  if (!finite(a.M) || a.M < 0 || a.M > STOICH_LIMITS.maxMolarity) return { ok: false, error: `Molarity must be from 0 to ${STOICH_LIMITS.maxMolarity} mol/L.` };
  if (!finite(a.mL) || a.mL < 0 || a.mL > STOICH_LIMITS.maxMl) return { ok: false, error: "The volume must be a number of millilitres that is not negative (and below 10⁷ mL)." };
  const n = (a.M * a.mL) / 1000;
  return { ok: true, moles: n, grams: n * molarMass };
}

export interface LedgerRow {
  text: string;
  role: "reactant" | "product";
  coeff: number;
  molarMass: number;
  initialMol: number;
  finalMol: number;
  initialG: number;
  finalG: number;
  /** For reactants: initial moles / coefficient, the extent this reactant alone would allow. */
  capacity: number | null;
  limiting: boolean;
  excess: boolean;
}
export interface StoichResult {
  extent: number;
  /** Indices (into the reactants) that run out first; more than one is a stoichiometric mixture. */
  limiting: number[];
  ledger: LedgerRow[];
  /** All reactants are used up together (within 1e-9 relative). */
  exact: boolean;
  /** Total solution volume (mL) when every reactant was given as a solution, with volumes assumed additive. */
  totalMl: number | null;
}

export type StoichOutcome = { ok: true; value: StoichResult } | { ok: false; error: string };

/** Limiting reagent, excess and theoretical yields for a balanced reaction and the amount of each reactant (products start at zero). */
export function solveStoichiometry(rxn: ReactionModel, amounts: AmountSpec[]): StoichOutcome {
  if (amounts.length !== rxn.reactants.length) return { ok: false, error: "Give an amount for every reactant." };
  const moles: Array<{ moles: number; grams: number }> = [];
  for (let i = 0; i < rxn.reactants.length; i += 1) {
    const m = amountToMoles(amounts[i], rxn.reactants[i].mass);
    if (!m.ok) return { ok: false, error: `${rxn.reactants[i].text}: ${m.error}` };
    moles.push(m);
  }
  const capacity = rxn.reactants.map((r, i) => moles[i].moles / r.coeff);
  const extent = Math.min(...capacity);
  const tol = 1e-9 * Math.max(extent, 1e-300);
  const limiting = capacity.map((c, i) => (c - extent <= tol ? i : -1)).filter((i) => i >= 0);
  const ledger: LedgerRow[] = [
    ...rxn.reactants.map((r, i): LedgerRow => {
      const final = limiting.includes(i) ? 0 : Math.max(0, moles[i].moles - r.coeff * extent);
      return { text: r.text, role: "reactant", coeff: r.coeff, molarMass: r.mass, initialMol: moles[i].moles, finalMol: final, initialG: moles[i].grams, finalG: final * r.mass, capacity: capacity[i], limiting: limiting.includes(i), excess: !limiting.includes(i) && final > 0 };
    }),
    ...rxn.products.map((p): LedgerRow => ({ text: p.text, role: "product", coeff: p.coeff, molarMass: p.mass, initialMol: 0, finalMol: p.coeff * extent, initialG: 0, finalG: p.coeff * extent * p.mass, capacity: null, limiting: false, excess: false })),
  ];
  const totalMl = amounts.every((a) => a.mode === "soln") ? amounts.reduce((s, a) => s + a.mL, 0) : null;
  return { ok: true, value: { extent, limiting, ledger, exact: limiting.length === rxn.reactants.length, totalMl } };
}

export interface YieldResult {
  theoreticalMol: number;
  theoreticalG: number;
  actualG: number;
  /** null when the theoretical yield is zero. */
  percent: number | null;
  /** Above 100 %: not a chemical result, so it is flagged. */
  over100: boolean;
}
/** Percent yield = actual / theoretical × 100 for one product. Both are masses of that product. */
export function percentYield(result: StoichResult, productIndex: number, actualG: number): YieldResult | { error: string } {
  const row = result.ledger.filter((r) => r.role === "product")[productIndex];
  if (!row) return { error: "Choose one of the products." };
  if (!finite(actualG) || actualG < 0) return { error: "The actual yield must be a mass in grams that is not negative." };
  const theoreticalG = row.finalG;
  const percent = theoreticalG > 0 ? (actualG / theoreticalG) * 100 : null;
  return { theoreticalMol: row.finalMol, theoreticalG, actualG, percent, over100: percent !== null && percent > 100 + 1e-9 };
}

// ---- solutions -----------------------------------------------------------------------------------------------------------------------

export const molarity = (moles: number, litres: number) => moles / litres;
export const molesFromSolution = (M: number, mL: number) => (M * mL) / 1000;

export type DilutionUnknown = "M2" | "V2" | "V1" | "M1";
export interface DilutionInput { unknown: DilutionUnknown; M1: number; V1: number; M2: number; V2: number }
export type DilutionResult = { ok: true; value: number; unknown: DilutionUnknown; solute: number; solventAdded: number | null } | { ok: false; error: string };
/** M1V1 = M2V2: dilution adds solvent only. The amount of solute (mol) does not change, the volume and concentration do. */
export function solveDilution(d: DilutionInput): DilutionResult {
  const need = (v: number, name: string) => (finite(v) && v > 0 ? null : `${name} must be a positive number.`);
  const names: Record<keyof Omit<DilutionInput, "unknown">, string> = { M1: "The stock molarity", V1: "The stock volume", M2: "The final molarity", V2: "The final volume" };
  for (const k of ["M1", "V1", "M2", "V2"] as const) {
    if (k === d.unknown) continue;
    const e = need(d[k], names[k]);
    if (e) return { ok: false, error: e };
  }
  let value: number;
  if (d.unknown === "M2") value = (d.M1 * d.V1) / d.V2;
  else if (d.unknown === "V2") value = (d.M1 * d.V1) / d.M2;
  else if (d.unknown === "V1") value = (d.M2 * d.V2) / d.M1;
  else value = (d.M2 * d.V2) / d.V1;
  const M1 = d.unknown === "M1" ? value : d.M1; const V1 = d.unknown === "V1" ? value : d.V1;
  const M2 = d.unknown === "M2" ? value : d.M2; const V2 = d.unknown === "V2" ? value : d.V2;
  if (M2 > M1 * (1 + 1e-12) || V2 < V1 * (1 - 1e-12)) return { ok: false, error: "That would make the solution more concentrated (or smaller in volume). Diluting only adds solvent: the final molarity cannot exceed the stock and the final volume cannot be smaller. Concentrating needs evaporation or more solute, which is not this calculation." };
  return { ok: true, value, unknown: d.unknown, solute: (M1 * V1) / 1000, solventAdded: V2 - V1 };
}

/** Product and leftover concentrations after mixing reactant solutions that react completely (volumes additive, no dilution effects on the reaction). */
export function concentrationsAfterMixing(result: StoichResult): Array<{ text: string; role: "reactant" | "product"; M: number }> | null {
  if (result.totalMl === null || result.totalMl <= 0) return null;
  return result.ledger.map((r) => ({ text: r.text, role: r.role, M: (r.finalMol / result.totalMl!) * 1000 }));
}

const nice = (v: number) => { if (v <= 0) return 1; const e = 10 ** Math.floor(Math.log10(v)); const m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; };
/** Moles that one marker of the schematic particle picture stands for (about 24 markers for the largest amount). */
export const particleUnit = (result: StoichResult) => nice(Math.max(1e-300, ...result.ledger.map((r) => Math.max(r.initialMol, r.finalMol))) / 24);
