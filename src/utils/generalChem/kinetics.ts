/**
 * Chemical kinetics model (Stage 12).
 *
 * Scope: ONE reactant A disappearing with the rate law  −d[A]/dt = k [A]ⁿ  for n = 0, 1 or 2, at constant temperature and
 * volume. The order is an input (or a fitted result), NEVER inferred from the stoichiometric coefficient: orders are measured.
 * Rate constants refer to −d[A]/dt; if A has coefficient a in a balanced reaction, the reaction rate is (1/a)(−d[A]/dt).
 *
 *   n = 0   [A] = [A]₀ − k t              (until [A] reaches 0 at t = [A]₀/k; the law does not apply afterwards)
 *   n = 1   [A] = [A]₀ e^(−k t)
 *   n = 2   1/[A] = 1/[A]₀ + k t
 *
 * Temperature dependence follows the Arrhenius equation k = A e^(−Ea/RT), which is an empirical description that assumes Ea
 * and A are constant over the temperature range used.
 */

export type Order = 0 | 1 | 2;
export const ORDERS: readonly Order[] = [0, 1, 2];
export type TimeUnit = "s" | "min" | "h" | "day";
export const TIME_UNITS: readonly TimeUnit[] = ["s", "min", "h", "day"];

/** Gas constant, J/(mol·K). */
export const R_GAS = 8.314462618;

export interface RateModel { order: Order; k: number; c0: number }

export const KIN_LIMITS = {
  minC0: 1e-9, maxC0: 100,
  minK: 1e-12, maxK: 1e12,
  minT: 150, maxT: 2000,
  maxEaKJ: 500,
  maxPoints: 200,
} as const;

export type Validation<T> = { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[] };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateRateModel(raw: unknown): Validation<RateModel> {
  const errors: string[] = [];
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (r.order !== 0 && r.order !== 1 && r.order !== 2) errors.push("The order must be 0, 1 or 2 (this tool supports single-reactant models of those orders).");
  if (!finite(r.k) || r.k < KIN_LIMITS.minK || r.k > KIN_LIMITS.maxK) errors.push(`The rate constant must be a number from ${KIN_LIMITS.minK.toExponential(0)} to ${KIN_LIMITS.maxK.toExponential(0)}.`);
  if (!finite(r.c0) || r.c0 < KIN_LIMITS.minC0 || r.c0 > KIN_LIMITS.maxC0) errors.push(`The initial concentration must be a number from ${KIN_LIMITS.minC0.toExponential(0)} to ${KIN_LIMITS.maxC0} mol/L.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { order: r.order as Order, k: r.k as number, c0: r.c0 as number }, warnings: [] };
}

// ---- units ---------------------------------------------------------------------------------------------------------------

/** Rate-constant units for the order and time unit, e.g. "mol L⁻¹ s⁻¹", "s⁻¹", "L mol⁻¹ s⁻¹". */
export function kUnits(order: Order, unit: TimeUnit): string {
  return order === 0 ? `mol L⁻¹ ${unit}⁻¹` : order === 1 ? `${unit}⁻¹` : `L mol⁻¹ ${unit}⁻¹`;
}
/** Seconds per time unit (used only to convert between displayed units; the model itself is unit-agnostic). */
export const SECONDS_PER: Record<TimeUnit, number> = { s: 1, min: 60, h: 3600, day: 86400 };

// ---- integrated rate laws --------------------------------------------------------------------------------------------------

export function concentrationAt(m: RateModel, t: number): number {
  if (!(t >= 0)) return m.c0;
  if (m.order === 0) return Math.max(0, m.c0 - m.k * t);
  if (m.order === 1) return m.c0 * Math.exp(-m.k * t);
  return 1 / (1 / m.c0 + m.k * t);
}

/** Rate −d[A]/dt at time t, mol L⁻¹ per time unit. Zero once a zero-order reactant is exhausted. */
export function rateAt(m: RateModel, t: number): number {
  const c = concentrationAt(m, t);
  return m.order === 0 ? (c > 0 ? m.k : 0) : m.k * c ** m.order;
}

/** Time to react from [A]₀ to [A]₀/2. */
export function halfLife(m: RateModel): number {
  return m.order === 0 ? m.c0 / (2 * m.k) : m.order === 1 ? Math.LN2 / m.k : 1 / (m.k * m.c0);
}

/** Half-life starting from an arbitrary concentration c (the successive half-lives of one run use c = c₀, c₀/2, c₀/4, …). */
export function halfLifeFrom(m: RateModel, c: number): number {
  return halfLife({ ...m, c0: c });
}

/** Time at which [A] has fallen to `fraction` × [A]₀ (0 < fraction < 1). Infinity if never (first/second order to 0). */
export function timeToFraction(m: RateModel, fraction: number): number {
  if (!(fraction > 0 && fraction < 1)) return fraction >= 1 ? 0 : m.order === 0 ? m.c0 / m.k : Infinity;
  if (m.order === 0) return (m.c0 * (1 - fraction)) / m.k;
  if (m.order === 1) return -Math.log(fraction) / m.k;
  return (1 / fraction - 1) / (m.k * m.c0);
}

/** The quantity that is linear in time for this order: [A], ln[A], or 1/[A]. */
export function linearized(order: Order, c: number): number {
  return order === 0 ? c : order === 1 ? Math.log(c) : 1 / c;
}
export const linearLabel = (order: Order): string => (order === 0 ? "[A]" : order === 1 ? "ln[A]" : "1/[A]");
export const linearUnit = (order: Order): string => (order === 0 ? "mol/L" : order === 1 ? "" : "L/mol");
/** Slope of the linearized plot: −k, −k, +k. */
export const linearSlope = (m: RateModel): number => (m.order === 2 ? m.k : -m.k);

/** Time span over which the model is plotted (long enough to show the characteristic behaviour). */
export function plotSpan(m: RateModel): number {
  return m.order === 0 ? 1.2 * (m.c0 / m.k) : m.order === 1 ? 5 * halfLife(m) : 15 * halfLife(m);
}

export interface CurvePoint { t: number; c: number; y: number }
export function modelCurve(m: RateModel, points = 200, tMax = plotSpan(m)): CurvePoint[] {
  const out: CurvePoint[] = [];
  for (let i = 0; i <= points; i += 1) {
    const t = (tMax * i) / points;
    const c = concentrationAt(m, t);
    out.push({ t, c, y: m.order === 0 ? c : c > 0 ? linearized(m.order, c) : Number.NaN });
  }
  return out;
}

export interface HalfLifeStep { n: number; start: number; duration: number; end: number; cStart: number; cEnd: number }
/** Successive half-lives of one run: how long each halving takes. Constant for first order, doubling for second, halving for zero. */
export function successiveHalfLives(m: RateModel, count = 4): HalfLifeStep[] {
  const out: HalfLifeStep[] = [];
  let t = 0;
  let c = m.c0;
  for (let n = 1; n <= count; n += 1) {
    const d = halfLifeFrom(m, c);
    out.push({ n, start: t, duration: d, end: t + d, cStart: c, cEnd: c / 2 });
    t += d;
    c /= 2;
  }
  return out;
}

// ---- fitting ---------------------------------------------------------------------------------------------------------------

export interface Observation { t: number; c: number }

export function parsePairs(text: string, what: string, maxPoints: number = KIN_LIMITS.maxPoints): { ok: true; rows: Array<[number, number]> } | { ok: false; error: string } {
  const rows: Array<[number, number]> = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));
  if (lines.length > maxPoints) return { ok: false, error: `Use at most ${maxPoints} ${what} rows.` };
  for (const [i, line] of lines.entries()) {
    const parts = line.split(/[\s,;\t]+/).filter(Boolean);
    if (parts.length !== 2) return { ok: false, error: `Row ${i + 1} ("${line.slice(0, 30)}") must contain exactly two numbers.` };
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, error: `Row ${i + 1} ("${line.slice(0, 30)}") contains something that is not a number.` };
    rows.push([a, b]);
  }
  return { ok: true, rows };
}

export interface LineFit { slope: number; intercept: number; r2: number; n: number; slopeSE: number; sse: number }

/** Ordinary least squares y = intercept + slope·x. Needs at least 2 distinct x; standard error needs n ≥ 3. */
export function linearRegression(xs: number[], ys: number[]): LineFit | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0; let sxy = 0; let syy = 0;
  for (let i = 0; i < n; i += 1) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i += 1) sse += (ys[i] - (intercept + slope * xs[i])) ** 2;
  const r2 = syy === 0 ? 1 : 1 - sse / syy;
  const slopeSE = n > 2 ? Math.sqrt(sse / (n - 2) / sxx) : Number.NaN;
  return { slope, intercept, r2, n, slopeSE, sse };
}

export interface OrderFit {
  order: Order;
  /** Whether this order could be tested (log and reciprocal need positive concentrations) and gave a physical k > 0. */
  usable: boolean;
  reason?: string;
  k: number;
  kSE: number;
  c0Fit: number;
  /** R² of the linearized plot (the textbook criterion; not comparable across orders on its own). */
  r2: number;
  /** RMSE in mol/L between the data and the model drawn back on the concentration axis (the common yardstick). */
  rmse: number;
  /** rmse / (max − min concentration). */
  nrmse: number;
}

export type FitVerdict = "supported" | "ambiguous" | "poor" | "insufficient";

export interface FitResult {
  fits: OrderFit[];
  /** Order with the smallest concentration-scale RMSE among usable fits. */
  best: Order | null;
  verdict: FitVerdict;
  /** Orders that fit about as well as the best (RMSE within a factor of 2 of it). */
  comparable: Order[];
  /** Fraction of the initial concentration consumed over the data. */
  conversion: number;
  message: string;
  criterion: string;
}

export const FIT_CRITERION =
  "Each order is fitted by least squares on its linearized plot ([A], ln[A] or 1/[A] against t). The fitted line is then drawn back on the concentration axis and compared with the data by root-mean-square error in mol/L, the one yardstick common to all three orders. R² of the linear plot is also shown, but R² alone cannot choose between orders.";

export function fitRateLaws(data: Observation[]): { ok: false; error: string } | ({ ok: true } & FitResult) {
  if (data.length < 4) return { ok: false, error: "Enter at least 4 concentration–time observations." };
  if (data.length > KIN_LIMITS.maxPoints) return { ok: false, error: `Use at most ${KIN_LIMITS.maxPoints} observations.` };
  if (data.some((d) => !finite(d.t) || !finite(d.c))) return { ok: false, error: "Every time and concentration must be a finite number." };
  if (data.some((d) => d.t < 0)) return { ok: false, error: "Times cannot be negative." };
  if (data.some((d) => d.c < 0)) return { ok: false, error: "Concentrations cannot be negative." };
  const sorted = [...data].sort((a, b) => a.t - b.t);
  if (new Set(sorted.map((d) => d.t)).size !== sorted.length) return { ok: false, error: "Every observation needs a different time." };
  const ts = sorted.map((d) => d.t);
  const cs = sorted.map((d) => d.c);
  const cMax = Math.max(...cs);
  const cMin = Math.min(...cs);
  if (!(cMax > cMin)) return { ok: false, error: "The concentration does not change over the data, so no rate law can be fitted." };
  const first = sorted[0].c;
  const last = sorted[sorted.length - 1].c;
  if (!(last < first)) return { ok: false, error: "The concentration must fall over time for these decay models (the last value is not below the first)." };
  const conversion = first > 0 ? (first - last) / first : 0;
  const positive = cs.every((c) => c > 0);

  const fits: OrderFit[] = ORDERS.map((order) => {
    const unusable = (reason: string): OrderFit => ({ order, usable: false, reason, k: Number.NaN, kSE: Number.NaN, c0Fit: Number.NaN, r2: Number.NaN, rmse: Number.NaN, nrmse: Number.NaN });
    if (order > 0 && !positive) return unusable("needs every concentration to be above zero");
    const ys = cs.map((c) => linearized(order, c));
    const line = linearRegression(ts, ys);
    if (!line) return unusable("the line could not be fitted");
    const k = order === 2 ? line.slope : -line.slope;
    if (!(k > 0)) return unusable("the fitted slope gives a non-positive rate constant");
    const c0Fit = order === 0 ? line.intercept : order === 1 ? Math.exp(line.intercept) : 1 / line.intercept;
    if (!(c0Fit > 0) || !Number.isFinite(c0Fit)) return unusable("the fitted starting concentration is not physical");
    const model: RateModel = { order, k, c0: c0Fit };
    let se = 0;
    for (const d of sorted) se += (d.c - concentrationAt(model, d.t)) ** 2;
    const rmse = Math.sqrt(se / sorted.length);
    return { order, usable: true, k, kSE: line.slopeSE, c0Fit, r2: line.r2, rmse, nrmse: rmse / (cMax - cMin) };
  });

  const usable = fits.filter((f) => f.usable).sort((a, b) => a.rmse - b.rmse);
  if (usable.length === 0) return { ok: true, fits, best: null, verdict: "poor", comparable: [], conversion, message: "None of the three models could be fitted to these data.", criterion: FIT_CRITERION };
  const best = usable[0];
  const comparable = usable.filter((f) => f.rmse <= Math.max(2 * best.rmse, 1e-12 * cMax)).map((f) => f.order);

  let verdict: FitVerdict;
  let message: string;
  if (best.nrmse > 0.1) {
    verdict = "poor";
    message = `No tested order describes these data well (the best has an error of ${(best.nrmse * 100).toFixed(1)} % of the concentration range). The order may be fractional, the rate may depend on other species, or the mechanism may have several steps. Nothing is concluded.`;
  } else if (conversion < 0.3) {
    verdict = "insufficient";
    message = `The data cover only ${(conversion * 100).toFixed(0)} % conversion, too little to tell the orders apart reliably (about 50 % or more, ideally over a few half-lives, is needed). The ${ORDER_NAME[best.order]} model has the smallest error, but the evidence is weak.`;
  } else if (comparable.length > 1) {
    verdict = "ambiguous";
    message = `More than one model fits about equally well (${comparable.map((o) => ORDER_NAME[o]).join(", ")}); the data cannot distinguish them. Measure over a wider concentration range or run experiments at different starting concentrations.`;
  } else {
    verdict = "supported";
    message = `The ${ORDER_NAME[best.order]} model fits clearly better than the others (error ${(best.nrmse * 100).toFixed(1)} % of the concentration range). That supports it for these data; it does not prove the mechanism.`;
  }
  return { ok: true, fits, best: best.order, verdict, comparable, conversion, message, criterion: FIT_CRITERION };
}

export const ORDER_NAME: Record<Order, string> = { 0: "zero-order", 1: "first-order", 2: "second-order" };

// ---- Arrhenius --------------------------------------------------------------------------------------------------------------

/** k at T2 from k at T1 and Ea (kJ/mol): k₂ = k₁ exp[−(Ea/R)(1/T₂ − 1/T₁)]. */
export function kAtTemperature(k1: number, T1: number, EaKJ: number, T2: number): number {
  return k1 * Math.exp(-((EaKJ * 1000) / R_GAS) * (1 / T2 - 1 / T1));
}

/** Ea (kJ/mol) from two rate constants: Ea = R ln(k₂/k₁) / (1/T₁ − 1/T₂). */
export function eaFromTwoPoints(k1: number, T1: number, k2: number, T2: number): number {
  return (R_GAS * Math.log(k2 / k1)) / (1 / T1 - 1 / T2) / 1000;
}

export interface ArrheniusFit { EaKJ: number; lnA: number; A: number; r2: number; n: number; EaSEKJ: number }

/** Linear regression of ln k on 1/T. Needs at least 3 points for a statistical check; 2 points give an exact line. */
export function fitArrhenius(points: Array<{ T: number; k: number }>): { ok: false; error: string } | ({ ok: true } & ArrheniusFit) {
  if (points.length < 2) return { ok: false, error: "Enter at least 2 temperature–rate-constant pairs." };
  if (points.length > KIN_LIMITS.maxPoints) return { ok: false, error: `Use at most ${KIN_LIMITS.maxPoints} pairs.` };
  if (points.some((p) => !finite(p.T) || !finite(p.k))) return { ok: false, error: "Every temperature and rate constant must be a finite number." };
  if (points.some((p) => p.T < KIN_LIMITS.minT || p.T > KIN_LIMITS.maxT)) return { ok: false, error: `Temperatures must be in kelvin, from ${KIN_LIMITS.minT} to ${KIN_LIMITS.maxT} K.` };
  if (points.some((p) => !(p.k > 0))) return { ok: false, error: "Rate constants must be positive." };
  if (new Set(points.map((p) => p.T)).size < 2) return { ok: false, error: "Use at least two different temperatures." };
  const line = linearRegression(points.map((p) => 1 / p.T), points.map((p) => Math.log(p.k)));
  if (!line) return { ok: false, error: "The line could not be fitted." };
  const EaKJ = (-line.slope * R_GAS) / 1000;
  return { ok: true, EaKJ, lnA: line.intercept, A: Math.exp(line.intercept), r2: line.r2, n: points.length, EaSEKJ: (line.slopeSE * R_GAS) / 1000 };
}

/** Factor by which k changes for +10 K at temperature T. */
export const factorPer10K = (EaKJ: number, T: number): number => kAtTemperature(1, T, EaKJ, T + 10);

export interface ArrheniusInput {
  mode: "given" | "two-point" | "fit";
  /** Reference rate constant and temperature (modes "given" and "two-point"). */
  k1: number; T1: number;
  /** Activation energy in kJ/mol (mode "given"). */
  EaKJ: number;
  /** Second measurement (mode "two-point"). */
  k2: number; T2: number;
  /** "T, k" per line (mode "fit"). */
  fitText: string;
  /** Temperature at which the rate constant is wanted. */
  T: number;
}

export interface ArrheniusResult {
  EaKJ: number;
  /** k at the requested temperature. */
  kAtT: number;
  /** Arrhenius pre-exponential factor (same units as k). */
  A: number;
  /** ln k vs 1/T points actually used, for the plot. */
  points: Array<{ T: number; k: number }>;
  fit: ({ ok: true } & ArrheniusFit) | null;
  factor10: number;
  warnings: string[];
}

export function validateArrhenius(raw: unknown): Validation<ArrheniusInput> {
  const errors: string[] = [];
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (r.mode !== "given" && r.mode !== "two-point" && r.mode !== "fit") errors.push("Choose how the activation energy is obtained.");
  const T = (key: string, label: string) => { if (!finite(r[key]) || (r[key] as number) < KIN_LIMITS.minT || (r[key] as number) > KIN_LIMITS.maxT) errors.push(`${label} must be in kelvin, from ${KIN_LIMITS.minT} to ${KIN_LIMITS.maxT} K.`); };
  const k = (key: string, label: string) => { if (!finite(r[key]) || (r[key] as number) < KIN_LIMITS.minK || (r[key] as number) > KIN_LIMITS.maxK) errors.push(`${label} must be a positive rate constant from ${KIN_LIMITS.minK.toExponential(0)} to ${KIN_LIMITS.maxK.toExponential(0)}.`); };
  T("T", "The target temperature");
  if (r.mode === "given") { k("k1", "The reference rate constant"); T("T1", "The reference temperature"); if (!finite(r.EaKJ) || r.EaKJ < 0 || r.EaKJ > KIN_LIMITS.maxEaKJ) errors.push(`Ea must be from 0 to ${KIN_LIMITS.maxEaKJ} kJ/mol.`); }
  if (r.mode === "two-point") { k("k1", "k₁"); T("T1", "T₁"); k("k2", "k₂"); T("T2", "T₂"); if (r.T1 === r.T2) errors.push("The two temperatures must differ."); }
  if (r.mode === "fit" && typeof r.fitText !== "string") errors.push("The data table is missing.");
  if (r.mode === "fit" && typeof r.fitText === "string" && r.fitText.length > 20000) errors.push("The data table is too long.");
  if (errors.length) return { ok: false, errors };
  const num = (key: string, fallback: number) => (finite(r[key]) ? (r[key] as number) : fallback);
  return {
    ok: true,
    value: {
      mode: r.mode as ArrheniusInput["mode"], k1: num("k1", 1e-3), T1: num("T1", 298.15), EaKJ: num("EaKJ", 50), k2: num("k2", 1e-2), T2: num("T2", 318.15),
      fitText: typeof r.fitText === "string" ? r.fitText : "", T: r.T as number,
    },
    warnings: [],
  };
}

export function analyzeArrhenius(input: ArrheniusInput): { ok: false; error: string } | ({ ok: true } & ArrheniusResult) {
  const warnings: string[] = [];
  let points: Array<{ T: number; k: number }>;
  let EaKJ: number;
  let fit: ArrheniusResult["fit"] = null;
  let A: number;
  if (input.mode === "given") {
    points = [{ T: input.T1, k: input.k1 }];
    EaKJ = input.EaKJ;
    A = input.k1 * Math.exp((EaKJ * 1000) / (R_GAS * input.T1));
  } else if (input.mode === "two-point") {
    if (input.T1 === input.T2) return { ok: false, error: "The two temperatures must differ." };
    points = [{ T: input.T1, k: input.k1 }, { T: input.T2, k: input.k2 }];
    EaKJ = eaFromTwoPoints(input.k1, input.T1, input.k2, input.T2);
    if (EaKJ < 0) warnings.push("The rate constant falls as the temperature rises, giving a negative apparent Ea. That is not Arrhenius behaviour (check the data, or the reaction has a more complex mechanism).");
    A = input.k1 * Math.exp((EaKJ * 1000) / (R_GAS * input.T1));
  } else {
    const parsed = parsePairs(input.fitText, "temperature–k");
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const f = fitArrhenius(parsed.rows.map(([T, k]) => ({ T, k })));
    if (!f.ok) return { ok: false, error: f.error };
    fit = f;
    points = parsed.rows.map(([T, k]) => ({ T, k }));
    EaKJ = f.EaKJ;
    A = f.A;
    if (f.n < 3) warnings.push("Two points define a line exactly, so there is no check on whether the data are Arrhenius. Use at least three temperatures.");
    if (f.n >= 3 && f.r2 < 0.98) warnings.push(`R² = ${f.r2.toFixed(3)}: ln k against 1/T is not very linear, so a single constant Ea describes these data poorly.`);
    if (EaKJ < 0) warnings.push("The fitted Ea is negative; this is not Arrhenius behaviour.");
  }
  const kAtT = A * Math.exp(-(EaKJ * 1000) / (R_GAS * input.T));
  if (!Number.isFinite(kAtT) || kAtT <= 0 || kAtT > 1e30) return { ok: false, error: "The rate constant at that temperature is outside the range the tool can represent." };
  const spanLow = Math.min(...points.map((p) => p.T)); const spanHigh = Math.max(...points.map((p) => p.T));
  if (input.T < spanLow - 50 || input.T > spanHigh + 50) warnings.push(`The requested temperature is more than 50 K outside the temperatures the constants were measured at (${Math.round(spanLow)}–${Math.round(spanHigh)} K). Extrapolating assumes Ea and A stay constant there.`);
  if (EaKJ > 200) warnings.push("An Ea above 200 kJ/mol is unusually high; check the units (kJ/mol, not J/mol).");
  return { ok: true, EaKJ, kAtT, A, points, fit, factor10: factorPer10K(EaKJ, input.T), warnings };
}
