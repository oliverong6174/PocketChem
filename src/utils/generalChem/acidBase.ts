/**
 * Aqueous acid-base equilibrium model (General Chemistry, Stage 11).
 *
 * SCOPE (anything else is refused, never approximated silently)
 *   - one monoprotic acid OR one monobasic base per solution, strong or weak, in water
 *   - optional strong-base cation / strong-acid anion (a titrant, or the counter-ion of a buffer salt)
 *   - T = 25 °C only (Kw = 1.0e-14, pKw = 14); ideal solutions: activities are taken equal to concentrations
 * NOT SUPPORTED: polyprotic species, mixtures of several weak acids/bases, activity or ionic-strength corrections,
 * non-aqueous solvents, other temperatures, amphoteric salts, complexation, dissolved CO2.
 *
 * METHOD
 *   Every system is solved with the full charge balance, with mass balance built into the species fractions:
 *       [H+] + [Na+-like cations] + [BH+]  =  [OH-] + [Cl−-like anions] + [A-]
 *       [A-]  = C_HA * Ka / (Ka + [H+])            ([HA] + [A-] = C_HA)
 *       [BH+] = C_B  * [H+] / ([H+] + Kw/Kb)       ([B] + [BH+] = C_B)
 *       [OH-] = Kw / [H+]
 *   The left side minus the right side is strictly increasing in [H+], so exactly one physical root exists and
 *   bisection on pH finds it without any piecewise approximation. No branch (strong / weak / buffer / near-neutral /
 *   very dilute) uses a different formula, so curves built from it have no discontinuities.
 */

export const KW_25C = 1.0e-14;
export const PKW_25C = 14;
export const TEMPERATURE_C = 25;

/** Bounds of the supported domain. */
export const LIMITS = {
  minConcentration: 1e-7,
  maxConcentration: 5,
  /** Above this the ideal-solution assumption is poor (reported as a warning, not refused). */
  idealWarnConcentration: 0.5,
  /** Below this water autoionization and dissolved CO2 dominate real solutions (warning). */
  dilutWarnConcentration: 1e-5,
  minVolumeMl: 0.1,
  maxVolumeMl: 5000,
  minPK: 0.5,
  maxPK: 13.5,
} as const;

export type SpeciesKind = "strong-acid" | "weak-acid" | "strong-base" | "weak-base";

/** Final-solution analytical composition, all in mol/L. */
export interface SolutionSpec {
  /** Concentration of spectator cations from strong bases / basic salts (Na+, K+ ...). */
  strongBaseCation?: number;
  /** Concentration of spectator anions from strong acids / acid salts (Cl-, NO3- ...). */
  strongAcidAnion?: number;
  weakAcid?: { total: number; pKa: number };
  weakBase?: { total: number; pKb: number };
}

export interface EquilibriumResult {
  ok: true;
  h: number;
  oh: number;
  pH: number;
  pOH: number;
  /** Concentrations of the weak-acid pair, when present. */
  acid: { ha: number; a: number; alpha: number } | null;
  /** Concentrations of the weak-base pair, when present. */
  base: { b: number; bh: number; alpha: number } | null;
  positiveCharge: number;
  negativeCharge: number;
  /** |positive - negative| / max(positive, negative): checks the solution, should be ~1e-12 or below. */
  chargeBalanceError: number;
  iterations: number;
}

export type EquilibriumFailure = { ok: false; reason: string };

function finiteNonNeg(x: number | undefined): boolean {
  return x === undefined || (Number.isFinite(x) && x >= 0);
}

/** Charge-balance function of pH: positive charge minus negative charge (strictly increasing in [H+]). */
function imbalance(spec: SolutionSpec, h: number): number {
  const cation = spec.strongBaseCation ?? 0;
  const anion = spec.strongAcidAnion ?? 0;
  let positive = h + cation;
  let negative = KW_25C / h + anion;
  if (spec.weakAcid) {
    const ka = 10 ** -spec.weakAcid.pKa;
    negative += (spec.weakAcid.total * ka) / (ka + h);
  }
  if (spec.weakBase) {
    const kah = KW_25C / 10 ** -spec.weakBase.pKb; // Ka of BH+
    positive += (spec.weakBase.total * h) / (h + kah);
  }
  return positive - negative;
}

export function solveEquilibrium(spec: SolutionSpec): EquilibriumResult | EquilibriumFailure {
  const values = [spec.strongBaseCation, spec.strongAcidAnion, spec.weakAcid?.total, spec.weakBase?.total];
  if (!values.every(finiteNonNeg)) return { ok: false, reason: "Concentrations must be finite and not negative." };
  if (spec.weakAcid && !Number.isFinite(spec.weakAcid.pKa)) return { ok: false, reason: "pKa must be a finite number." };
  if (spec.weakBase && !Number.isFinite(spec.weakBase.pKb)) return { ok: false, reason: "pKb must be a finite number." };

  // bisection on pH; the root of a strictly monotone function is bracketed by [-3, 17] for every supported input
  let lo = -3; // acidic end: imbalance > 0 means too much positive charge, i.e. h too large
  let hi = 17;
  if (imbalance(spec, 10 ** -lo) < 0 || imbalance(spec, 10 ** -hi) > 0) {
    return { ok: false, reason: "The composition is outside the pH range this model can represent (-3 to 17)." };
  }
  let iterations = 0;
  while (hi - lo > 1e-13 && iterations < 200) {
    const mid = (lo + hi) / 2;
    // larger pH = smaller h = more negative imbalance
    if (imbalance(spec, 10 ** -mid) > 0) lo = mid;
    else hi = mid;
    iterations += 1;
  }
  const pH = (lo + hi) / 2;
  const h = 10 ** -pH;
  const oh = KW_25C / h;

  let acid: EquilibriumResult["acid"] = null;
  let base: EquilibriumResult["base"] = null;
  let positive = h + (spec.strongBaseCation ?? 0);
  let negative = oh + (spec.strongAcidAnion ?? 0);
  if (spec.weakAcid) {
    const ka = 10 ** -spec.weakAcid.pKa;
    const alpha = ka / (ka + h);
    const a = spec.weakAcid.total * alpha;
    acid = { a, ha: spec.weakAcid.total - a, alpha };
    negative += a;
  }
  if (spec.weakBase) {
    const kah = KW_25C / 10 ** -spec.weakBase.pKb;
    const alpha = h / (h + kah);
    const bh = spec.weakBase.total * alpha;
    base = { bh, b: spec.weakBase.total - bh, alpha };
    positive += bh;
  }
  const scale = Math.max(positive, negative, 1e-300);
  return {
    ok: true,
    h,
    oh,
    pH,
    pOH: PKW_25C - pH,
    acid,
    base,
    positiveCharge: positive,
    negativeCharge: negative,
    chargeBalanceError: Math.abs(positive - negative) / scale,
    iterations,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Single solution
// ---------------------------------------------------------------------------------------------------------------

export interface SingleSolutionInput {
  kind: SpeciesKind;
  /** Analytical (formal) concentration, mol/L. */
  concentration: number;
  /** pKa of the weak acid, or pKb of the weak base. Ignored for strong species. */
  pK?: number;
}

export type Validation<T> = { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[] };

const KINDS: readonly SpeciesKind[] = ["strong-acid", "weak-acid", "strong-base", "weak-base"];
export const isSpeciesKind = (v: unknown): v is SpeciesKind => typeof v === "string" && (KINDS as readonly string[]).includes(v);
export const isWeak = (kind: SpeciesKind) => kind === "weak-acid" || kind === "weak-base";
export const isAcidKind = (kind: SpeciesKind) => kind === "strong-acid" || kind === "weak-acid";

export function validateConcentration(value: unknown, label: string, errors: string[], warnings: string[]): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${label} must be a number.`);
    return NaN;
  }
  if (value < LIMITS.minConcentration || value > LIMITS.maxConcentration) {
    errors.push(`${label} must be between ${LIMITS.minConcentration.toExponential(0)} and ${LIMITS.maxConcentration} mol/L (outside that range this ideal-solution model is not meaningful).`);
  } else if (value > LIMITS.idealWarnConcentration) {
    warnings.push(`${label} is above ${LIMITS.idealWarnConcentration} mol/L: real solutions deviate from ideal behaviour (activity effects), so treat the pH as an idealised estimate.`);
  } else if (value < LIMITS.dilutWarnConcentration) {
    warnings.push(`${label} is below ${LIMITS.dilutWarnConcentration.toExponential(0)} mol/L: water autoionization is included, but dissolved CO2 and trace impurities, which this model ignores, matter in real solutions this dilute.`);
  }
  return value;
}

export function validatePK(kind: SpeciesKind, value: unknown, errors: string[]): number | undefined {
  if (!isWeak(kind)) return undefined;
  const label = kind === "weak-acid" ? "pKa" : "pKb";
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${label} must be a number for a weak ${kind === "weak-acid" ? "acid" : "base"}.`);
    return undefined;
  }
  if (value < LIMITS.minPK || value > LIMITS.maxPK) {
    errors.push(`${label} must be between ${LIMITS.minPK} and ${LIMITS.maxPK}. A more acidic/basic species behaves as strong in water; a weaker one barely reacts with water.`);
  }
  return value;
}

export function validateSingleSolution(raw: unknown): Validation<SingleSolutionInput> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["No input given."] };
  const r = raw as Record<string, unknown>;
  if (!isSpeciesKind(r.kind)) return { ok: false, errors: ["Choose strong acid, weak acid, strong base or weak base. Polyprotic, mixed and amphoteric systems are not supported."] };
  const concentration = validateConcentration(r.concentration, "Concentration", errors, warnings);
  const pK = validatePK(r.kind, r.pK, errors);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { kind: r.kind, concentration, ...(pK === undefined ? {} : { pK }) }, warnings };
}

export interface SolutionAnalysis {
  input: SingleSolutionInput;
  equilibrium: EquilibriumResult;
  /** Percent of the solute that reacted with water (100 for strong species). */
  percentIonized: number;
  /** Equilibrium constant of the dissociation, or null for strong species. */
  Ka: number | null;
  Kb: number | null;
  /** True when [H+] or [OH-] from water is comparable to the solute's contribution (the simple approximation fails). */
  waterMatters: boolean;
  /** Result of the textbook shortcut (x << C) for comparison, or null for strong species. */
  approximation: { pH: number; valid: boolean; errorPH: number; rule: string } | null;
}

export function specOf(input: SingleSolutionInput): SolutionSpec {
  const c = input.concentration;
  switch (input.kind) {
    case "strong-acid": return { strongAcidAnion: c };
    case "strong-base": return { strongBaseCation: c };
    case "weak-acid": return { weakAcid: { total: c, pKa: input.pK as number } };
    default: return { weakBase: { total: c, pKb: input.pK as number } };
  }
}

export function analyzeSolution(input: SingleSolutionInput): SolutionAnalysis | { ok: false; reason: string } {
  const v = validateSingleSolution(input);
  if (!v.ok) return { ok: false, reason: v.errors.join(" ") };
  const eq = solveEquilibrium(specOf(input));
  if (!eq.ok) return eq;
  const c = input.concentration;
  let percentIonized = 100;
  let Ka: number | null = null;
  let Kb: number | null = null;
  let approximation: SolutionAnalysis["approximation"] = null;
  if (input.kind === "weak-acid" && eq.acid) {
    percentIonized = (eq.acid.a / c) * 100;
    Ka = 10 ** -(input.pK as number);
    const x = Math.sqrt(Ka * c);
    const pH = -Math.log10(x);
    approximation = { pH, valid: x / c < 0.05 && x > 20 * eq.oh, errorPH: pH - eq.pH, rule: "x = √(Ka·C), valid when x < 5 % of C and water's [H⁺] is negligible" };
  } else if (input.kind === "weak-base" && eq.base) {
    percentIonized = (eq.base.bh / c) * 100;
    Kb = 10 ** -(input.pK as number);
    const x = Math.sqrt(Kb * c);
    const pH = PKW_25C + Math.log10(x);
    approximation = { pH, valid: x / c < 0.05 && x > 20 * eq.h, errorPH: pH - eq.pH, rule: "x = √(Kb·C), valid when x < 5 % of C and water's [OH⁻] is negligible" };
  }
  const solute = isAcidKind(input.kind) ? eq.h : eq.oh;
  const water = isAcidKind(input.kind) ? eq.oh : eq.h;
  return { input, equilibrium: eq, percentIonized, Ka, Kb, waterMatters: water > 0.05 * solute, approximation };
}

/** Dilution with solvent: C2 = C1 V1 / V2. Only dilution (V2 >= V1) is supported. */
export function dilute(input: SingleSolutionInput, v1Ml: number, v2Ml: number): { ok: true; input: SingleSolutionInput; factor: number } | { ok: false; reason: string } {
  if (![v1Ml, v2Ml].every((x) => Number.isFinite(x) && x >= LIMITS.minVolumeMl && x <= LIMITS.maxVolumeMl)) {
    return { ok: false, reason: `Volumes must be between ${LIMITS.minVolumeMl} and ${LIMITS.maxVolumeMl} mL.` };
  }
  if (v2Ml < v1Ml) return { ok: false, reason: "The final volume must be at least the starting volume: only dilution with solvent is supported (not evaporation)." };
  const next = { ...input, concentration: (input.concentration * v1Ml) / v2Ml };
  const check = validateSingleSolution(next);
  if (!check.ok) return { ok: false, reason: `After dilution: ${check.errors.join(" ")}` };
  return { ok: true, input: next, factor: v2Ml / v1Ml };
}

// ---------------------------------------------------------------------------------------------------------------
// Buffers
// ---------------------------------------------------------------------------------------------------------------

export interface BufferInput {
  /** "acid": weak acid HA plus its conjugate base A- (as a sodium-like salt). "base": weak base B plus BH+ (as a chloride-like salt). */
  family: "acid" | "base";
  pK: number;
  /** Concentration of the weak acid HA (or weak base B), mol/L in the final solution. */
  weak: number;
  /** Concentration of the conjugate (A- or BH+), mol/L in the final solution. */
  conjugate: number;
}

export interface BufferAnalysis {
  equilibrium: EquilibriumResult;
  hh: { pH: number; valid: boolean; reasons: string[]; ratio: number; errorPH: number };
  /** Buffer capacity beta (mol/L per pH unit) from the exact model, by finite difference on strong base. */
  capacity: number;
}

export function validateBuffer(raw: unknown): Validation<BufferInput> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["No input given."] };
  const r = raw as Record<string, unknown>;
  if (r.family !== "acid" && r.family !== "base") return { ok: false, errors: ["Choose a weak-acid or a weak-base buffer."] };
  const kind: SpeciesKind = r.family === "acid" ? "weak-acid" : "weak-base";
  const pK = validatePK(kind, r.pK, errors);
  const weak = validateConcentration(r.weak, r.family === "acid" ? "Weak acid concentration" : "Weak base concentration", errors, warnings);
  const conjugate = validateConcentration(r.conjugate, "Conjugate concentration", errors, warnings);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { family: r.family, pK: pK as number, weak, conjugate }, warnings };
}

export function bufferSpec(b: BufferInput): SolutionSpec {
  return b.family === "acid"
    ? { weakAcid: { total: b.weak + b.conjugate, pKa: b.pK }, strongBaseCation: b.conjugate }
    : { weakBase: { total: b.weak + b.conjugate, pKb: b.pK }, strongAcidAnion: b.conjugate };
}

/**
 * Henderson–Hasselbalch estimate and a statement of whether it is within its regime:
 *   - both components present, ratio between 1:10 and 10:1
 *   - each component at least 20x the [H+] / [OH-] the estimate itself implies (so water and the acid's own
 *     dissociation do not change the component concentrations noticeably)
 */
export function hendersonHasselbalch(b: BufferInput): BufferAnalysis["hh"] {
  const ratio = b.conjugate / b.weak;
  const pH = b.family === "acid" ? b.pK + Math.log10(ratio) : PKW_25C - (b.pK + Math.log10(b.conjugate / b.weak));
  const reasons: string[] = [];
  if (!(ratio >= 0.1 && ratio <= 10)) reasons.push(`the conjugate:weak ratio is ${ratio.toPrecision(2)}, outside 0.1 to 10`);
  const smaller = Math.min(b.weak, b.conjugate);
  const h = 10 ** -pH;
  const oh = KW_25C / h;
  if (smaller < 20 * Math.max(h, oh)) reasons.push("a component is not much larger than the [H⁺] or [OH⁻] it would produce");
  return { pH, valid: reasons.length === 0, reasons, ratio, errorPH: 0 };
}

export function analyzeBuffer(raw: BufferInput): BufferAnalysis | { ok: false; reason: string } {
  const v = validateBuffer(raw);
  if (!v.ok) return { ok: false, reason: v.errors.join(" ") };
  const b = v.value;
  const eq = solveEquilibrium(bufferSpec(b));
  if (!eq.ok) return eq;
  const hh = hendersonHasselbalch(b);
  hh.errorPH = hh.pH - eq.pH;
  // capacity: add a small amount of strong base (acid buffer) or strong acid (base buffer) and measure the pH change
  const d = Math.min(b.weak, b.conjugate) * 1e-4;
  const shifted = solveEquilibrium(
    b.family === "acid"
      ? { ...bufferSpec(b), strongBaseCation: b.conjugate + d }
      : { ...bufferSpec(b), strongAcidAnion: b.conjugate + d },
  );
  const capacity = shifted.ok ? Math.abs(d / (shifted.pH - eq.pH)) : NaN;
  return { equilibrium: eq, hh, capacity };
}
