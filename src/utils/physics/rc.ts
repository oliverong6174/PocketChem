/**
 * First-order RC transient (pure; no React).
 *
 * Supported circuit: an ideal DC source Vs in series with one resistor R and one capacitor C, switched on at t = 0 with the
 * capacitor at voltage V0. Kirchhoff's voltage law gives Vs = R·i + vC with i = C·dvC/dt, whose solution is
 *   vC(t) = Vs + (V0 − Vs)·e^(−t/τ),   τ = R·C
 *   i(t)  = (Vs − V0)/R · e^(−t/τ)      (positive when it flows from the source into the capacitor's + plate)
 *   U(t)  = ½·C·vC(t)²
 * This is exact for ONE resistor and ONE capacitor in one loop. It does not describe circuits with several capacitors,
 * several loops, an inductor, a non-ideal source or a leaky capacitor. "Charging" means vC moves toward a higher final value
 * (Vs > V0) and "discharging" toward a lower one (Vs < V0); Vs = 0 is the capacitor discharging through R.
 */

export const RC_LIMITS = {
  maxV: 100,
  minR: 1,
  maxR: 1e9,
  minC: 1e-12,
  maxC: 1,
  minTau: 1e-9,
  maxTau: 1e6,
  spans: [3, 5, 7, 10] as readonly number[],
} as const;

export interface RcInput {
  /** Source voltage Vs (V): the value the capacitor voltage approaches. */
  Vs: number;
  /** Initial capacitor voltage V0 (V), at the instant the switch closes. */
  V0: number;
  R: number;
  C: number;
  /** How many time constants the plotted transient covers. */
  spanTau: number;
}

export const DEFAULT_RC: RcInput = { Vs: 9, V0: 0, R: 10_000, C: 100e-6, spanTau: 5 };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function validateRc(raw: unknown): Validated<RcInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["The RC circuit settings are missing."] };
  const V = RC_LIMITS.maxV;
  if (!finite(raw.Vs) || Math.abs(raw.Vs) > V) errors.push(`Source voltage must be a number between −${V} and ${V} V.`);
  if (!finite(raw.V0) || Math.abs(raw.V0) > V) errors.push(`Initial capacitor voltage must be a number between −${V} and ${V} V.`);
  if (!finite(raw.R) || raw.R < RC_LIMITS.minR || raw.R > RC_LIMITS.maxR) errors.push(`Resistance must be between ${RC_LIMITS.minR} Ω and ${RC_LIMITS.maxR} Ω (it must be greater than zero for a finite current).`);
  if (!finite(raw.C) || raw.C < RC_LIMITS.minC || raw.C > RC_LIMITS.maxC) errors.push(`Capacitance must be between ${RC_LIMITS.minC} F and ${RC_LIMITS.maxC} F.`);
  if (!finite(raw.spanTau) || !RC_LIMITS.spans.includes(raw.spanTau)) errors.push(`The plotted span must be one of ${RC_LIMITS.spans.join(", ")} time constants.`);
  if (errors.length === 0) {
    const tau = (raw.R as number) * (raw.C as number);
    if (tau < RC_LIMITS.minTau || tau > RC_LIMITS.maxTau) errors.push(`The time constant RC must be between 1 ns and 10⁶ s (here ${tau} s).`);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { Vs: raw.Vs as number, V0: raw.V0 as number, R: raw.R as number, C: raw.C as number, spanTau: raw.spanTau as number } };
}

export const timeConstant = (p: RcInput): number => p.R * p.C;
export const tEnd = (p: RcInput): number => p.spanTau * timeConstant(p);

export type Direction = "charging" | "discharging" | "steady";
export function direction(p: RcInput): Direction {
  return p.Vs > p.V0 ? "charging" : p.Vs < p.V0 ? "discharging" : "steady";
}

export interface RcState {
  t: number;
  /** Capacitor voltage, current into the capacitor, resistor voltage, stored energy. */
  vC: number;
  i: number;
  vR: number;
  energy: number;
  /** Fraction of the total change that has happened: (vC − V0)/(Vs − V0) = 1 − e^(−t/τ); 1 when there is no change. */
  progress: number;
  /** Charge on the + plate (C). */
  charge: number;
}

export function stateAt(p: RcInput, t: number): RcState {
  const tau = timeConstant(p);
  const decay = Math.exp(-t / tau);
  const vC = p.Vs + (p.V0 - p.Vs) * decay;
  const i = ((p.Vs - p.V0) / p.R) * decay;
  return { t, vC, i, vR: i * p.R, energy: 0.5 * p.C * vC * vC, progress: p.Vs === p.V0 ? 1 : 1 - decay, charge: p.C * vC };
}

export interface RcSummary {
  tau: number;
  direction: Direction;
  I0: number;
  halfTime: number;
  settle99: number;
  U0: number;
  Uinf: number;
  /** Work done by the source, heat in the resistor and the change in stored energy (J). */
  sourceWork: number;
  resistorHeat: number;
  deltaU: number;
  deltaQ: number;
}

export function summarize(p: RcInput): RcSummary {
  const tau = timeConstant(p);
  const dV = p.Vs - p.V0;
  const deltaQ = p.C * dV;
  return {
    tau,
    direction: direction(p),
    I0: dV / p.R,
    halfTime: tau * Math.LN2,
    settle99: tau * Math.log(100),
    U0: 0.5 * p.C * p.V0 * p.V0,
    Uinf: 0.5 * p.C * p.Vs * p.Vs,
    sourceWork: p.Vs * deltaQ,
    resistorHeat: 0.5 * p.C * dV * dV,
    deltaU: 0.5 * p.C * (p.Vs * p.Vs - p.V0 * p.V0),
    deltaQ,
  };
}

/** Time at which the capacitor has covered the given fraction (0 ≤ f < 1) of the way from V0 to Vs: −τ·ln(1 − f). */
export function timeToFraction(p: RcInput, f: number): number {
  return -timeConstant(p) * Math.log(1 - f);
}

export function samples(p: RcInput, n = 160): RcState[] {
  const end = tEnd(p);
  return Array.from({ length: n + 1 }, (_, k) => stateAt(p, (end * k) / n));
}

export function clampTime(p: RcInput, t: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.min(Math.max(t, 0), tEnd(p));
}
