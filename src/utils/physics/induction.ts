/**
 * Stage 24: magnetic flux, Faraday's and Lenz's laws, motional EMF, an ideal AC generator and the series RL transient. Pure SI model.
 *
 * ORIENTATION CONVENTION (used everywhere, including the diagrams)
 *   A loop has an area normal n̂ fixed by the right-hand rule from a chosen sense of circulation: if the fingers of the right hand curl the way
 *   the "positive" current flows, the thumb points along n̂. Equivalently, positive EMF and positive current circulate COUNTER-CLOCKWISE
 *   as seen by a viewer looking at the loop from the side n̂ points toward (looking against n̂).
 *   θ is the angle between n̂ and the magnetic-field vector B (not the angle to the plane of the loop). Φ = B A cos θ is signed.
 *   ε = −N dΦ/dt.  ε > 0 drives positive (counter-clockwise from the n̂ side) current; ε < 0 drives it the other way.
 *   Lenz's law is the minus sign: the induced current's own field through the loop opposes the CHANGE in flux.
 *
 * Idealizations: single planar loop(s) in a uniform field, no self-inductance in the loop currents, instantaneous field everywhere (no
 * retardation), and for the generator and RL models no losses beyond the stated resistor.
 */

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const inRange = (v: unknown, lo: number, hi: number): v is number => finite(v) && v >= lo && v <= hi;
const rad = (deg: number) => (deg * Math.PI) / 180;

// ---- flux -------------------------------------------------------------------------------------------------------------------------

export interface FluxInput { B: number; A: number; N: number; thetaDeg: number }
export const DEFAULT_FLUX: FluxInput = { B: 0.5, A: 0.02, N: 100, thetaDeg: 30 };
export function validateFlux(raw: unknown): Validated<FluxInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["Flux settings are missing."] };
  if (!inRange(raw.B, 0, 20)) errors.push("Field magnitude must be between 0 and 20 T.");
  if (!inRange(raw.A, 1e-6, 10)) errors.push("Loop area must be between 1 mm² and 10 m².");
  if (!finite(raw.N) || !Number.isInteger(raw.N) || raw.N < 1 || raw.N > 10000) errors.push("Number of turns must be an integer from 1 to 10 000.");
  if (!inRange(raw.thetaDeg, -360, 360)) errors.push("The angle between the area normal and B must be within ±360°.");
  return errors.length ? { ok: false, errors } : { ok: true, value: { B: raw.B as number, A: raw.A as number, N: raw.N as number, thetaDeg: raw.thetaDeg as number } };
}
/** Φ = B A cos θ for ONE turn, θ being the angle between the area normal and B (weber). */
export const flux = (B: number, A: number, thetaDeg: number): number => B * A * Math.cos(rad(thetaDeg));
/** Flux linkage NΦ (weber-turns). */
export const fluxLinkage = (p: FluxInput): number => p.N * flux(p.B, p.A, p.thetaDeg);

// ---- Faraday's law with a time-dependent loop ----------------------------------------------------------------------------------------------

export interface FaradayInput {
  /** B(t) = B0 + bRate·t (T, T/s), signed along the chosen +n̂ reference when θ = 0. */
  B0: number; bRate: number;
  /** A(t) = A0 + aRate·t (m², m²/s). */
  A0: number; aRate: number;
  N: number;
  /** θ(t) = theta0 + ω t: the loop turns about an axis perpendicular to B (degrees, rad/s). */
  theta0Deg: number; omega: number;
  /** A closed circuit of resistance R carries I = ε/R; an open loop has an EMF but no sustained current. */
  closed: boolean; R: number;
  duration: number;
}
export const DEFAULT_FARADAY: FaradayInput = { B0: 0.2, bRate: 0.4, A0: 0.05, aRate: 0, N: 50, theta0Deg: 0, omega: 0, closed: true, R: 2, duration: 2 };
export function validateFaraday(raw: unknown): Validated<FaradayInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["Induction settings are missing."] };
  if (!inRange(raw.B0, -20, 20)) errors.push("Initial field must be within ±20 T.");
  if (!inRange(raw.bRate, -1000, 1000)) errors.push("dB/dt must be within ±1000 T/s.");
  if (!inRange(raw.A0, 1e-6, 10)) errors.push("Initial area must be between 1 mm² and 10 m².");
  if (!inRange(raw.aRate, -100, 100)) errors.push("dA/dt must be within ±100 m²/s.");
  if (!finite(raw.N) || !Number.isInteger(raw.N) || raw.N < 1 || raw.N > 10000) errors.push("Number of turns must be an integer from 1 to 10 000.");
  if (!inRange(raw.theta0Deg, -360, 360)) errors.push("Initial angle must be within ±360°.");
  if (!inRange(raw.omega, -1e4, 1e4)) errors.push("Angular velocity must be within ±10⁴ rad/s.");
  if (typeof raw.closed !== "boolean") errors.push("Closed/open must be true or false.");
  if (!inRange(raw.R, 1e-3, 1e6)) errors.push("Resistance must be between 1 mΩ and 1 MΩ.");
  if (!finite(raw.duration) || raw.duration <= 0 || raw.duration > 1e3) errors.push("Duration must be positive and at most 1000 s.");
  if (errors.length) return { ok: false, errors };
  const p = raw as unknown as FaradayInput;
  const out: FaradayInput = { B0: p.B0, bRate: p.bRate, A0: p.A0, aRate: p.aRate, N: p.N, theta0Deg: p.theta0Deg, omega: p.omega, closed: p.closed, R: p.R, duration: p.duration };
  if (out.A0 + out.aRate * out.duration < 1e-6) errors.push("The area would shrink to zero or below within the duration: choose a smaller dA/dt or a shorter time.");
  if (Math.abs(out.B0 + out.bRate * out.duration) > 20) errors.push("The field would exceed 20 T within the duration.");
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}
export const fieldAtTime = (p: FaradayInput, t: number) => p.B0 + p.bRate * t;
export const areaAtTime = (p: FaradayInput, t: number) => p.A0 + p.aRate * t;
export const angleAtTime = (p: FaradayInput, t: number) => p.theta0Deg + ((p.omega * t) * 180) / Math.PI;
/** Single-turn flux Φ(t) = B(t) A(t) cos θ(t). */
export const fluxAtTime = (p: FaradayInput, t: number) => flux(fieldAtTime(p, t), areaAtTime(p, t), angleAtTime(p, t));
/**
 * ε(t) = −N dΦ/dt, differentiated analytically by the product rule:
 *   dΦ/dt = B′A cos θ + B A′ cos θ − B A ω sin θ.
 */
export function emfAtTime(p: FaradayInput, t: number): number {
  const B = fieldAtTime(p, t), A = areaAtTime(p, t), th = rad(angleAtTime(p, t));
  const dPhi = p.bRate * A * Math.cos(th) + B * p.aRate * Math.cos(th) - B * A * p.omega * Math.sin(th);
  return -p.N * dPhi + 0; // + 0 turns −0 into 0
}
/** A numerical derivative for checking the analytic one: central difference with step h. */
export function emfNumeric(p: FaradayInput, t: number, h = 1e-5): number { return (-p.N * (fluxAtTime(p, t + h) - fluxAtTime(p, t - h))) / (2 * h); }
export const currentAtTime = (p: FaradayInput, t: number): number => (p.closed ? emfAtTime(p, t) / p.R : 0);

export type Sense = "counterclockwise" | "clockwise" | "none";
export const VIEWING_CONVENTION = "viewed from the side the area normal n̂ points toward (looking against n̂)";
/** Sense of a (signed) EMF or current for the convention above. */
export const senseOf = (x: number, tol = 1e-12): Sense => (Math.abs(x) <= tol ? "none" : x > 0 ? "counterclockwise" : "clockwise");

export interface LenzReading {
  flux: number; dFluxDt: number; emf: number; current: number;
  /** Direction of the flux change relative to n̂: "increasing" means Φ is becoming more positive. */
  change: "increasing" | "decreasing" | "constant";
  sense: Sense;
  /** Sign of the induced loop's own field along n̂ at its centre: +1 along n̂, −1 against, 0 none. */
  inducedFieldAlongNormal: 1 | -1 | 0;
  /** True when the induced field opposes the CHANGE in flux (always, by construction); stated for the diagram. */
  opposesChange: boolean;
  text: string;
}
export function lenz(p: FaradayInput, t: number): LenzReading {
  const emf = emfAtTime(p, t);
  const tol = 1e-12 * Math.max(1, Math.abs(p.N) * Math.abs(fluxAtTime(p, t)));
  const dPhi = -emf / p.N;
  const change = Math.abs(dPhi) <= 1e-12 ? "constant" : dPhi > 0 ? "increasing" : "decreasing";
  const current = currentAtTime(p, t);
  void tol;
  const driving = p.closed ? current : emf; // the sense a current WOULD have
  const sense = senseOf(driving, 1e-15);
  const induced = sense === "counterclockwise" ? 1 : sense === "clockwise" ? -1 : 0;
  const text = change === "constant"
    ? "The flux is constant, so dΦ/dt = 0: no EMF is induced and no current flows, even if a magnetic field is present."
    : `The flux through the loop is ${change} along n̂, so the induced effect must oppose that change: ${p.closed ? "the induced current" : "an induced current would"} circulate${p.closed ? "s" : ""} ${sense} (${VIEWING_CONVENTION}), making its own field ${induced > 0 ? "along" : "against"} n̂ at the centre.${p.closed ? "" : " The loop is open, so the EMF appears across the gap but no sustained current circulates."}`;
  return { flux: fluxAtTime(p, t), dFluxDt: dPhi, emf, current, change, sense, inducedFieldAlongNormal: induced as 1 | -1 | 0, opposesChange: true, text };
}
export interface FaradayPoint { t: number; B: number; A: number; thetaDeg: number; flux: number; emf: number; current: number }
export function faradayTrace(p: FaradayInput, points = 300): FaradayPoint[] {
  const out: FaradayPoint[] = [];
  for (let k = 0; k <= points; k += 1) { const t = (p.duration * k) / points; out.push({ t, B: fieldAtTime(p, t), A: areaAtTime(p, t), thetaDeg: angleAtTime(p, t), flux: fluxAtTime(p, t), emf: emfAtTime(p, t), current: currentAtTime(p, t) }); }
  return out;
}

// ---- motional EMF ----------------------------------------------------------------------------------------------------------------------------

export interface MotionalInput {
  /** B along z (T): positive out of the screen. */
  Bz: number;
  /** Rod length (m) and the direction its tip points, in the plane (degrees from +x). */
  L: number; rodAngleDeg: number;
  /** Rod velocity (m/s) and its direction in the plane (degrees from +x). */
  v: number; velAngleDeg: number;
  /** Rails circuit resistance (Ω), used only when the motion is perpendicular to the rod. */
  R: number;
}
export const DEFAULT_MOTIONAL: MotionalInput = { Bz: 0.5, L: 0.4, rodAngleDeg: 90, v: 3, velAngleDeg: 0, R: 2 };
export function validateMotional(raw: unknown): Validated<MotionalInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["Motional-EMF settings are missing."] };
  if (!inRange(raw.Bz, -20, 20)) errors.push("Field must be within ±20 T.");
  if (!inRange(raw.L, 1e-3, 100)) errors.push("Rod length must be between 1 mm and 100 m.");
  if (!inRange(raw.rodAngleDeg, -360, 360)) errors.push("Rod angle must be within ±360°.");
  if (!inRange(raw.v, 0, 1e4)) errors.push("Speed must be between 0 and 10⁴ m/s.");
  if (!inRange(raw.velAngleDeg, -360, 360)) errors.push("Velocity angle must be within ±360°.");
  if (!inRange(raw.R, 1e-3, 1e6)) errors.push("Resistance must be between 1 mΩ and 1 MΩ.");
  return errors.length ? { ok: false, errors } : { ok: true, value: { Bz: raw.Bz as number, L: raw.L as number, rodAngleDeg: raw.rodAngleDeg as number, v: raw.v as number, velAngleDeg: raw.velAngleDeg as number, R: raw.R as number } };
}
export interface MotionalResult {
  /** ε = (v × B) · L: the EMF from the rod's tail to its tip (volts); positive means the TIP is at the higher potential. */
  emf: number;
  /** The force on positive charges in the rod, q(v×B), as a direction in the plane. */
  forceDirDeg: number | null;
  /** Which end is positive. */
  positiveEnd: "tip" | "tail" | "neither";
  /** sin of the angle between the velocity and the rod: ε = B L v sin(ψ − α). */
  geometryFactor: number;
  /** True when v ⟂ rod (and both ⟂ B): the textbook |ε| = BLv case. */
  perpendicular: boolean;
  /** Rails model (only when perpendicular): current, magnetic force on the rod (opposes the motion) and the powers. */
  rails: { current: number; force: number; mechanicalPower: number; electricalPower: number } | null;
}
export function motionalEmf(p: MotionalInput): MotionalResult {
  const a = rad(p.rodAngleDeg), w = rad(p.velAngleDeg);
  // v × B with B = Bz ẑ:  (vy Bz, −vx Bz, 0);  L = L (cos a, sin a, 0)
  const vx = p.v * Math.cos(w), vy = p.v * Math.sin(w);
  const fx = vy * p.Bz, fy = -vx * p.Bz;
  const emf = fx * p.L * Math.cos(a) + fy * p.L * Math.sin(a);
  const mag = Math.hypot(fx, fy);
  const geometryFactor = Math.sin(w - a);
  const perpendicular = Math.abs(Math.abs(geometryFactor) - 1) < 1e-9;
  let rails: MotionalResult["rails"] = null;
  if (perpendicular && p.v > 0 && p.Bz !== 0) {
    const I = emf / p.R;
    const F = Math.abs(p.Bz) * Math.abs(I) * p.L; // magnitude of B I L, directed against the velocity
    rails = { current: I, force: F, mechanicalPower: F * p.v, electricalPower: emf * emf / p.R };
  }
  return {
    emf, forceDirDeg: mag > 0 ? (Math.atan2(fy, fx) * 180) / Math.PI : null,
    positiveEnd: Math.abs(emf) < 1e-15 ? "neither" : emf > 0 ? "tip" : "tail", geometryFactor, perpendicular, rails,
  };
}

// ---- ideal AC generator ---------------------------------------------------------------------------------------------------------------------------

export interface GeneratorInput { B: number; A: number; N: number; frequency: number; theta0Deg: number; periods: number }
export const DEFAULT_GENERATOR: GeneratorInput = { B: 0.4, A: 0.05, N: 200, frequency: 50, theta0Deg: 0, periods: 2 };
export function validateGenerator(raw: unknown): Validated<GeneratorInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["Generator settings are missing."] };
  if (!inRange(raw.B, 1e-4, 10)) errors.push("Field must be between 0.1 mT and 10 T.");
  if (!inRange(raw.A, 1e-4, 10)) errors.push("Coil area must be between 1 cm² and 10 m².");
  if (!finite(raw.N) || !Number.isInteger(raw.N) || raw.N < 1 || raw.N > 10000) errors.push("Number of turns must be an integer from 1 to 10 000.");
  if (!inRange(raw.frequency, 0.1, 1000)) errors.push("Rotation frequency must be between 0.1 Hz and 1 kHz.");
  if (!inRange(raw.theta0Deg, -360, 360)) errors.push("Initial angle must be within ±360°.");
  if (!finite(raw.periods) || !Number.isInteger(raw.periods) || raw.periods < 1 || raw.periods > 6) errors.push("Show between 1 and 6 periods.");
  return errors.length ? { ok: false, errors } : { ok: true, value: { B: raw.B as number, A: raw.A as number, N: raw.N as number, frequency: raw.frequency as number, theta0Deg: raw.theta0Deg as number, periods: raw.periods as number } };
}
export const generatorOmega = (p: GeneratorInput) => 2 * Math.PI * p.frequency;
export const generatorPeriod = (p: GeneratorInput) => 1 / p.frequency;
export const generatorDuration = (p: GeneratorInput) => p.periods / p.frequency;
/** θ(t) = θ₀ + ωt; Φ = B A cos θ (one turn) and ε = −N dΦ/dt = N B A ω sin θ. */
export function generatorState(p: GeneratorInput, t: number) {
  const th = rad(p.theta0Deg) + generatorOmega(p) * t;
  return { t, thetaDeg: (th * 180) / Math.PI, flux: p.B * p.A * Math.cos(th), linkage: p.N * p.B * p.A * Math.cos(th), emf: p.N * p.B * p.A * generatorOmega(p) * Math.sin(th) };
}
export const generatorPeakEmf = (p: GeneratorInput) => p.N * p.B * p.A * generatorOmega(p);
export const generatorRmsEmf = (p: GeneratorInput) => generatorPeakEmf(p) / Math.SQRT2;
export const GENERATOR_ASSUMPTIONS = [
  "A single rigid planar coil turning at constant angular velocity about an axis perpendicular to a uniform field.",
  "The EMF is the open-circuit value: no load, internal resistance, self-inductance or losses are modelled, so no power output or efficiency is stated.",
  "ε = N B A ω sin θ is largest when the flux is zero (coil plane parallel to B) and zero when the flux is extremal (coil plane perpendicular to B).",
];

// ---- series RL transient -------------------------------------------------------------------------------------------------------------------------

export interface RlInput {
  /** DC source voltage the circuit is switched to (V); 0 means the source is removed and the current decays through R. */
  Vs: number; i0: number; R: number; L: number; spanTau: number;
}
export const RL_LIMITS = { maxV: 100, maxI: 100, minR: 1e-3, maxR: 1e9, minL: 1e-9, maxL: 1e3, minTau: 1e-9, maxTau: 1e6, spans: [3, 5, 7, 10] as readonly number[] } as const;
export const DEFAULT_RL: RlInput = { Vs: 12, i0: 0, R: 20, L: 0.5, spanTau: 5 };
export function validateRl(raw: unknown): Validated<RlInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["RL circuit settings are missing."] };
  if (!inRange(raw.Vs, -RL_LIMITS.maxV, RL_LIMITS.maxV)) errors.push(`Source voltage must be within ±${RL_LIMITS.maxV} V.`);
  if (!inRange(raw.i0, -RL_LIMITS.maxI, RL_LIMITS.maxI)) errors.push(`Initial current must be within ±${RL_LIMITS.maxI} A.`);
  if (!inRange(raw.R, RL_LIMITS.minR, RL_LIMITS.maxR)) errors.push("Resistance must be between 1 mΩ and 1 GΩ (it must be non-zero for a finite time constant).");
  if (!inRange(raw.L, RL_LIMITS.minL, RL_LIMITS.maxL)) errors.push("Inductance must be between 1 nH and 1000 H.");
  if (!finite(raw.spanTau) || !RL_LIMITS.spans.includes(raw.spanTau)) errors.push(`The plotted span must be one of ${RL_LIMITS.spans.join(", ")} time constants.`);
  if (errors.length) return { ok: false, errors };
  const tau = (raw.L as number) / (raw.R as number);
  if (tau < RL_LIMITS.minTau || tau > RL_LIMITS.maxTau) return { ok: false, errors: [`The time constant L/R must be between 1 ns and 10⁶ s (here ${tau} s).`] };
  return { ok: true, value: { Vs: raw.Vs as number, i0: raw.i0 as number, R: raw.R as number, L: raw.L as number, spanTau: raw.spanTau as number } };
}
export const rlTau = (p: RlInput) => p.L / p.R;
export const rlEnd = (p: RlInput) => p.spanTau * rlTau(p);
/**
 * V_s = R i + L di/dt  with the passive sign convention (current enters the inductor's + terminal, v_L = +L di/dt):
 *   i(t)  = V_s/R + (i₀ − V_s/R) e^{−t/τ},  τ = L/R
 *   v_R   = R i,   v_L = L di/dt = (V_s − R i₀) e^{−t/τ} = V_s − R i
 *   ε_L   = −L di/dt = −v_L (the induced EMF opposing the change),   U = ½ L i²,   flux linkage NΦ = L i.
 */
export function rlState(p: RlInput, t: number) {
  const tau = rlTau(p), iInf = p.Vs / p.R;
  const e = Math.exp(-t / tau);
  const i = iInf + (p.i0 - iInf) * e;
  const vL = (p.Vs - p.R * p.i0) * e;
  return { t, i, vR: p.R * i, vL, emfL: -vL, energy: 0.5 * p.L * i * i, linkage: p.L * i, didt: vL / p.L, progress: Math.abs(iInf - p.i0) < 1e-15 ? 1 : (i - p.i0) / (iInf - p.i0) };
}
export function rlKind(p: RlInput): "growth" | "decay" | "steady" {
  const iInf = p.Vs / p.R;
  if (Math.abs(iInf - p.i0) < 1e-12 * Math.max(1, Math.abs(iInf))) return "steady";
  return Math.abs(iInf) > Math.abs(p.i0) ? "growth" : "decay";
}
export function rlTrace(p: RlInput, points = 240) {
  const out = [];
  for (let k = 0; k <= points; k += 1) out.push(rlState(p, (rlEnd(p) * k) / points));
  return out;
}
export const RL_ASSUMPTIONS = [
  "One ideal inductor L in series with one resistor R and an ideal DC source switched at t = 0. The inductor has no resistance, capacitance or core loss.",
  "The inductor opposes CHANGES in current through the induced EMF −L di/dt; it does not oppose a steady current (in steady state di/dt = 0 and v_L = 0).",
  "Passive sign convention: the current enters the + terminal of the inductor, so v_L = +L di/dt. Current growth makes v_L > 0; decay makes v_L < 0 (the inductor then acts as a source).",
];
