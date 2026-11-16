/**
 * Waves and sound (pure; no React). All quantities are SI.
 *
 * Traveling wave:   y(x, t) = A sin(kx − s·ωt + φ)   with k = 2π/λ, ω = 2πf, s = +1 (toward +x) or −1 (toward −x), v = fλ.
 * Particle (medium) velocity ∂y/∂t = −s·ωA cos(kx − s·ωt + φ). It is NOT the wave speed: its maximum is ωA = 2πfA.
 * Longitudinal wave: the same function is the displacement s(x, t) of each particle ALONG x from its equilibrium position x₀; a
 *   particle sits at x₀ + s(x₀, t) and the local density is ρ/ρ₀ = 1/(1 + ∂s/∂x₀), so compressions are where ∂s/∂x₀ < 0.
 * Standing waves: fixed-fixed string and open–open / closed–open pipes with the elementary boundary conditions (no end correction).
 * Doppler (sound in a medium at rest): f′ = f (c + v_o)/(c − v_s), v_o positive toward the source and v_s positive toward the observer.
 */

export const TWO_PI = 2 * Math.PI;
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };
export type Dir = 1 | -1;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const rel = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

export const WAVE_LIMITS = { minF: 0.05, maxF: 5000, minV: 0.1, maxV: 5000, minLambda: 0.001, maxLambda: 10000, maxSteep: 0.15, minA: 1e-6, maxPhase: 360 } as const;

// ---- one traveling wave -------------------------------------------------------------------------------------------------------

export interface WaveInput {
  /** Amplitude (m). */
  A: number;
  /** Frequency (Hz). */
  f: number;
  /** Wave speed (m/s), set by the medium. */
  v: number;
  /** Initial phase φ (degrees). */
  phiDeg: number;
  dir: Dir;
}
export const DEFAULT_WAVE: WaveInput = { A: 0.1, f: 2, v: 4, phiDeg: 0, dir: 1 };

export interface WaveQuantities { lambda: number; T: number; omega: number; k: number; phi: number }
export function waveQuantities(w: WaveInput): WaveQuantities {
  const lambda = w.v / w.f;
  return { lambda, T: 1 / w.f, omega: TWO_PI * w.f, k: TWO_PI / lambda, phi: (w.phiDeg * Math.PI) / 180 };
}
const phase = (w: WaveInput, q: WaveQuantities, x: number, t: number) => q.k * x - w.dir * q.omega * t + q.phi;
/** y(x, t) = A sin(kx − sωt + φ). */
export function displacement(w: WaveInput, x: number, t: number): number { return w.A * Math.sin(phase(w, waveQuantities(w), x, t)); }
/** ∂y/∂t = −sωA cos(kx − sωt + φ): the speed of the medium itself. */
export function particleVelocity(w: WaveInput, x: number, t: number): number { const q = waveQuantities(w); return -w.dir * q.omega * w.A * Math.cos(phase(w, q, x, t)); }
/** ∂y/∂x = kA cos(kx − sωt + φ). */
export function slope(w: WaveInput, x: number, t: number): number { const q = waveQuantities(w); return q.k * w.A * Math.cos(phase(w, q, x, t)); }
/** Longitudinal view: new position of the particle whose equilibrium position is x0. */
export function longitudinalPosition(w: WaveInput, x0: number, t: number): number { return x0 + displacement(w, x0, t); }
/** Longitudinal view: ρ/ρ₀ = 1/(1 + ∂s/∂x₀) (above 1 = compression, below 1 = rarefaction). */
export function densityRatio(w: WaveInput, x0: number, t: number): number { return 1 / (1 + slope(w, x0, t)); }

function checkNumber(errors: string[], v: unknown, label: string, lo: number, hi: number, unit: string) {
  if (!finite(v) || v < lo || v > hi) errors.push(`${label} must be a number between ${lo} and ${hi}${unit ? ` ${unit}` : ""}.`);
}

export function validateWave(raw: unknown, name = "Wave"): Validated<WaveInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: [`${name}: the settings are missing.`] };
  const L = WAVE_LIMITS;
  checkNumber(errors, raw.f, `${name} frequency`, L.minF, L.maxF, "Hz");
  checkNumber(errors, raw.v, `${name} speed`, L.minV, L.maxV, "m/s");
  checkNumber(errors, raw.A, `${name} amplitude`, L.minA, 1e6, "m");
  checkNumber(errors, raw.phiDeg, `${name} phase`, -L.maxPhase, L.maxPhase, "degrees");
  if (raw.dir !== 1 && raw.dir !== -1) errors.push(`${name} direction must be +x or −x.`);
  if (errors.length) return { ok: false, errors };
  const w: WaveInput = { A: raw.A as number, f: raw.f as number, v: raw.v as number, phiDeg: raw.phiDeg as number, dir: raw.dir as Dir };
  const lambda = w.v / w.f;
  if (lambda < L.minLambda || lambda > L.maxLambda) errors.push(`${name} wavelength v/f = ${lambda.toPrecision(3)} m is outside ${L.minLambda}–${L.maxLambda} m.`);
  if (w.A > L.maxSteep * lambda) errors.push(`${name} amplitude must not exceed ${L.maxSteep} of the wavelength (${(L.maxSteep * lambda).toPrecision(3)} m): the model is for small-amplitude, linear waves and longitudinal particles must not pass each other.`);
  return errors.length ? { ok: false, errors } : { ok: true, value: w };
}

// ---- superposition --------------------------------------------------------------------------------------------------------------

export interface SuperpositionInput { v: number; w1: WaveInput; w2: WaveInput }
export const DEFAULT_SUPERPOSITION: SuperpositionInput = {
  v: 4,
  w1: { ...DEFAULT_WAVE, A: 0.1, f: 2, v: 4, dir: 1 },
  w2: { ...DEFAULT_WAVE, A: 0.1, f: 2, v: 4, dir: -1, phiDeg: 0 },
};
export function sumDisplacement(s: SuperpositionInput, x: number, t: number): number { return displacement(s.w1, x, t) + displacement(s.w2, x, t); }

export function validateSuperposition(raw: unknown): Validated<SuperpositionInput> {
  if (!isObject(raw)) return { ok: false, errors: ["The two-wave settings are missing."] };
  const errors: string[] = [];
  checkNumber(errors, raw.v, "Wave speed", WAVE_LIMITS.minV, WAVE_LIMITS.maxV, "m/s");
  const a = validateWave(raw.w1, "Wave 1");
  const b = validateWave(raw.w2, "Wave 2");
  if (!a.ok) errors.push(...a.errors);
  if (!b.ok) errors.push(...b.errors);
  if (errors.length || !a.ok || !b.ok) return { ok: false, errors };
  const v = raw.v as number;
  if (!rel(a.value.v, v) || !rel(b.value.v, v)) return { ok: false, errors: ["Both waves must travel in the same medium: they share one wave speed."] };
  return { ok: true, value: { v, w1: a.value, w2: b.value } };
}

export type SuperKind = "same-direction" | "standing" | "partly-standing" | "beats" | "general";
export interface SuperClass {
  kind: SuperKind;
  title: string;
  detail: string;
  /** |f1 − f2| (Hz). */
  beatFrequency: number;
  /** Phase difference φ₂ − φ₁ wrapped to (−180°, 180°] (degrees); meaningful when the frequencies are equal. */
  phaseDifferenceDeg: number;
  /** Largest and smallest amplitude of the resultant at a fixed place (m). */
  maxAmplitude: number;
  minAmplitude: number;
}
const wrapDeg = (d: number) => { let r = ((d % 360) + 360) % 360; if (r > 180) r -= 360; return r; };

/** Names the combination from the two waves themselves. Two similar waveforms are a standing wave only if they are equal in frequency and amplitude and travel in opposite directions. */
export function classifySuperposition(s: SuperpositionInput): SuperClass {
  const { w1, w2 } = s;
  const dphi = wrapDeg(w2.phiDeg - w1.phiDeg);
  const df = Math.abs(w1.f - w2.f);
  const fbar = (w1.f + w2.f) / 2;
  const base = { beatFrequency: df, phaseDifferenceDeg: dphi };
  if (rel(w1.f, w2.f)) {
    if (w1.dir === w2.dir) {
      const R = Math.sqrt(w1.A ** 2 + w2.A ** 2 + 2 * w1.A * w2.A * Math.cos((dphi * Math.PI) / 180));
      const tag = Math.abs(dphi) < 1e-6 ? "constructive" : Math.abs(Math.abs(dphi) - 180) < 1e-6 ? "destructive" : "partly constructive";
      return {
        ...base, kind: "same-direction", maxAmplitude: R, minAmplitude: R,
        title: `Same frequency, same direction: ${tag} interference`,
        detail: `One traveling wave of amplitude √(A₁² + A₂² + 2A₁A₂cosΔφ) = ${R.toPrecision(3)} m. Phase difference Δφ = ${dphi.toPrecision(3)}°.${tag === "destructive" && rel(w1.A, w2.A) ? " The equal amplitudes cancel completely." : ""}`,
      };
    }
    if (rel(w1.A, w2.A)) {
      return {
        ...base, kind: "standing", maxAmplitude: 2 * w1.A, minAmplitude: 0,
        title: "Standing wave",
        detail: "Equal frequency and amplitude in opposite directions: y = 2A sin(kx + (φ₁+φ₂)/2) cos(ωt + (φ₂−φ₁)/2). The nodes stay at fixed places and never move.",
      };
    }
    return {
      ...base, kind: "partly-standing", maxAmplitude: w1.A + w2.A, minAmplitude: Math.abs(w1.A - w2.A),
      title: "Partly standing wave (not a true standing wave)",
      detail: `The amplitudes differ, so the minima are not zero: the amplitude varies between ${Math.abs(w1.A - w2.A).toPrecision(3)} m and ${(w1.A + w2.A).toPrecision(3)} m and the pattern still carries a traveling part. There are no nodes.`,
    };
  }
  if (df / fbar <= 0.25) {
    return {
      ...base, kind: "beats", maxAmplitude: w1.A + w2.A, minAmplitude: Math.abs(w1.A - w2.A),
      title: `Beats at ${df.toPrecision(3)} Hz`,
      detail: `At one place the combined disturbance swells and fades ${df.toPrecision(3)} times per second (|f₁ − f₂|); the envelope runs between ${Math.abs(w1.A - w2.A).toPrecision(3)} m and ${(w1.A + w2.A).toPrecision(3)} m.`,
    };
  }
  return {
    ...base, kind: "general", maxAmplitude: w1.A + w2.A, minAmplitude: Math.abs(w1.A - w2.A),
    title: "Superposition of two different frequencies",
    detail: "The sum is not a single sinusoid and the frequencies are too far apart for slow beats; the pattern does not repeat after a short interval unless the frequencies are in a simple ratio.",
  };
}

/** Time needed to show the superposition: a few periods of the slower wave, or two beat periods when they are close. */
export function superpositionEnd(s: SuperpositionInput): number {
  const slow = Math.min(s.w1.f, s.w2.f);
  const fast = Math.max(s.w1.f, s.w2.f);
  const df = fast - slow;
  const base = 3 / slow;
  if (df > 0 && df / ((fast + slow) / 2) <= 0.25) return Math.min(Math.max(base, 2 / df), 120 / fast);
  return base;
}
export function superpositionWindow(s: SuperpositionInput): number { return 3 * Math.max(s.v / s.w1.f, s.v / s.w2.f); }

// ---- standing waves and resonance ---------------------------------------------------------------------------------------------------

export type ResonatorKind = "string" | "open" | "closed";
export const RESONATOR_LABEL: Record<ResonatorKind, string> = { string: "String fixed at both ends", open: "Pipe open at both ends", closed: "Pipe closed at one end" };
export const RESONATOR_LIMITS = { minL: 0.05, maxL: 20, minV: 1, maxV: 5000, maxN: 12 } as const;
export interface ResonatorInput { kind: ResonatorKind; L: number; v: number; n: number; /** Antinode amplitude (m), for the animation only. */ A: number }
export const DEFAULT_RESONATOR: ResonatorInput = { kind: "string", L: 1.2, v: 120, n: 3, A: 0.02 };

/** String and open pipe: any n = 1, 2, 3, …  Closed pipe: only odd n. */
export function allowedHarmonic(kind: ResonatorKind, n: number): boolean {
  if (!Number.isInteger(n) || n < 1 || n > RESONATOR_LIMITS.maxN) return false;
  return kind === "closed" ? n % 2 === 1 : true;
}
export function allowedHarmonics(kind: ResonatorKind, count = RESONATOR_LIMITS.maxN): number[] {
  const out: number[] = [];
  for (let n = 1; n <= count; n++) if (allowedHarmonic(kind, n)) out.push(n);
  return out;
}
/** f_n = n v/(2L) for string and open pipe; n v/(4L) (n odd) for a closed pipe. */
export function harmonicFrequency(kind: ResonatorKind, L: number, v: number, n: number): number { return (n * v) / ((kind === "closed" ? 4 : 2) * L); }
/** λ_n = 2L/n or 4L/n (n odd). */
export function harmonicWavelength(kind: ResonatorKind, L: number, n: number): number { return (kind === "closed" ? 4 : 2) * L / n; }
export function fundamentalFrequency(r: ResonatorInput): number { return harmonicFrequency(r.kind, r.L, r.v, 1); }

/**
 * Displacement shape of mode n on 0 ≤ x ≤ L. String: sin(nπx/L) (nodes at both ends). Open pipe: cos(nπx/L) (displacement antinodes at both open
 * ends). Closed pipe with the closed end at x = 0 and the open end at x = L: sin(nπx/2L), n odd.
 */
export function modeShape(kind: ResonatorKind, L: number, n: number, x: number): number {
  if (kind === "string") return Math.sin((n * Math.PI * x) / L);
  if (kind === "open") return Math.cos((n * Math.PI * x) / L);
  return Math.sin((n * Math.PI * x) / (2 * L));
}
/** Places where the displacement is always zero (including the fixed or closed ends). */
export function nodePositions(kind: ResonatorKind, L: number, n: number): number[] {
  const out: number[] = [];
  if (kind === "string") for (let m = 0; m <= n; m++) out.push((m * L) / n);
  else if (kind === "open") for (let m = 1; m <= n; m++) out.push(((2 * m - 1) * L) / (2 * n));
  else for (let m = 0; m <= (n - 1) / 2; m++) out.push((2 * m * L) / n);
  return out;
}
/** Places of maximum displacement amplitude. */
export function antinodePositions(kind: ResonatorKind, L: number, n: number): number[] {
  const out: number[] = [];
  if (kind === "string") for (let m = 1; m <= n; m++) out.push(((2 * m - 1) * L) / (2 * n));
  else if (kind === "open") for (let m = 0; m <= n; m++) out.push((m * L) / n);
  else for (let m = 0; m <= (n - 1) / 2; m++) out.push(((2 * m + 1) * L) / n);
  return out;
}
export function standingDisplacement(r: ResonatorInput, x: number, t: number): number {
  return r.A * modeShape(r.kind, r.L, r.n, x) * Math.cos(TWO_PI * harmonicFrequency(r.kind, r.L, r.v, r.n) * t);
}
export interface ResonatorSummary {
  f1: number; fn: number; lambdaN: number; T: number; nodes: number[]; antinodes: number[]; allowed: number[];
  /** Interior nodes (not counting the fixed/closed ends). */
  interiorNodes: number;
}
export function summarizeResonator(r: ResonatorInput): ResonatorSummary {
  const nodes = nodePositions(r.kind, r.L, r.n);
  const fn = harmonicFrequency(r.kind, r.L, r.v, r.n);
  const endNodes = r.kind === "string" ? 2 : r.kind === "closed" ? 1 : 0;
  return {
    f1: harmonicFrequency(r.kind, r.L, r.v, 1), fn, lambdaN: harmonicWavelength(r.kind, r.L, r.n), T: 1 / fn,
    nodes, antinodes: antinodePositions(r.kind, r.L, r.n), allowed: allowedHarmonics(r.kind), interiorNodes: nodes.length - endNodes,
  };
}

export function validateResonator(raw: unknown): Validated<ResonatorInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["The resonator settings are missing."] };
  const L = RESONATOR_LIMITS;
  if (raw.kind !== "string" && raw.kind !== "open" && raw.kind !== "closed") errors.push("The system must be a string, an open pipe or a closed pipe.");
  checkNumber(errors, raw.L, "Length", L.minL, L.maxL, "m");
  checkNumber(errors, raw.v, raw.kind === "string" ? "Wave speed on the string" : "Speed of sound", L.minV, L.maxV, "m/s");
  checkNumber(errors, raw.A, "Amplitude", 1e-6, 1, "m");
  if (!finite(raw.n) || !Number.isInteger(raw.n) || raw.n < 1 || raw.n > L.maxN) errors.push(`The harmonic number must be a whole number from 1 to ${L.maxN}.`);
  if (errors.length) return { ok: false, errors };
  const r: ResonatorInput = { kind: raw.kind as ResonatorKind, L: raw.L as number, v: raw.v as number, n: raw.n as number, A: raw.A as number };
  if (!allowedHarmonic(r.kind, r.n)) return { ok: false, errors: [`A pipe closed at one end supports only odd harmonics (1, 3, 5, …); harmonic ${r.n} is not allowed.`] };
  if (r.A > 0.15 * harmonicWavelength(r.kind, r.L, r.n)) return { ok: false, errors: ["The amplitude is too large for this wavelength (small-amplitude model)."] };
  return { ok: true, value: r };
}

// ---- Doppler effect ---------------------------------------------------------------------------------------------------------------

export const DOPPLER_LIMITS = { minF: 1, maxF: 100000, minC: 100, maxC: 6000 } as const;
export interface DopplerInput {
  /** Frequency emitted by the source (Hz). */
  fs: number;
  /** Speed of sound in the medium (m/s). */
  c: number;
  /** Source speed relative to the medium, positive when moving toward the observer (m/s). */
  vs: number;
  /** Observer speed relative to the medium, positive when moving toward the source (m/s). */
  vo: number;
}
export const DEFAULT_DOPPLER: DopplerInput = { fs: 440, c: 343, vs: 40, vo: 0 };

export function validateDoppler(raw: unknown): Validated<DopplerInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["The Doppler settings are missing."] };
  const L = DOPPLER_LIMITS;
  checkNumber(errors, raw.fs, "Source frequency", L.minF, L.maxF, "Hz");
  checkNumber(errors, raw.c, "Speed of sound", L.minC, L.maxC, "m/s");
  if (errors.length) return { ok: false, errors };
  const c = raw.c as number;
  if (!finite(raw.vs) || !finite(raw.vo)) return { ok: false, errors: ["The source and observer velocities must be numbers."] };
  if (Math.abs(raw.vs) >= c) errors.push(`The source speed must be below the speed of sound (${c} m/s). At or above it the simple Doppler formula fails (the denominator c − v_s reaches zero or changes sign) and a shock wave forms; this model does not cover that.`);
  if (Math.abs(raw.vo) >= c) errors.push(`The observer speed must be below the speed of sound (${c} m/s) in this model: an observer receding at or above c would never receive the wave, and the model is bounded to subsonic motion.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { fs: raw.fs as number, c, vs: raw.vs, vo: raw.vo } };
}

export interface DopplerResult {
  /** Observed frequency f′ = f (c + v_o)/(c − v_s). */
  fObserved: number;
  /** Frequency if only the source moves: f c/(c − v_s). */
  fSourceOnly: number;
  /** Frequency if only the observer moves: f (c + v_o)/c. */
  fObserverOnly: number;
  /** Wavelength in the medium λ′ = (c − v_s)/f; it depends on the source motion only. */
  lambdaMedium: number;
  lambdaAtRest: number;
  ratio: number;
  trend: "higher" | "lower" | "same";
}
export function solveDoppler(d: DopplerInput): DopplerResult {
  const fObserved = (d.fs * (d.c + d.vo)) / (d.c - d.vs);
  const ratio = fObserved / d.fs;
  return {
    fObserved,
    fSourceOnly: (d.fs * d.c) / (d.c - d.vs),
    fObserverOnly: (d.fs * (d.c + d.vo)) / d.c,
    lambdaMedium: (d.c - d.vs) / d.fs,
    lambdaAtRest: d.c / d.fs,
    ratio,
    trend: Math.abs(ratio - 1) < 1e-9 ? "same" : ratio > 1 ? "higher" : "lower",
  };
}

/**
 * Dimensionless picture of the Doppler effect (lengths in rest wavelengths λ₀ = c/f, times in source periods T₀ = 1/f, so c = 1):
 * the source starts at 0 and moves toward +x at M_s = v_s/c; the observer starts at D and moves toward −x at M_o = v_o/c.
 * Wavefront k leaves the source at te = k and reaches the observer at ta = (D + (1 − M_s)·te)/(1 + M_o).
 */
export const DOPPLER_START_GAP = 14;
export function dopplerGeometry(d: DopplerInput) {
  const Ms = d.vs / d.c;
  const Mo = d.vo / d.c;
  const closing = Ms + Mo;
  const meet = closing > 0 ? DOPPLER_START_GAP / closing : Infinity;
  const tEnd = Math.min(10, 0.92 * meet);
  return {
    Ms, Mo, D: DOPPLER_START_GAP, tEnd,
    sourceX: (t: number) => Ms * t,
    observerX: (t: number) => DOPPLER_START_GAP - Mo * t,
    arrival: (te: number) => (DOPPLER_START_GAP + (1 - Ms) * te) / (1 + Mo),
  };
}
/** Number of wavefronts that have reached the observer by time t (source periods). */
export function wavefrontsReceived(d: DopplerInput, t: number): number {
  const g = dopplerGeometry(d);
  let n = 0;
  for (let k = 0; k <= Math.ceil(g.tEnd); k++) if (g.arrival(k) <= t + 1e-12) n++;
  return n;
}

// ---- beats ------------------------------------------------------------------------------------------------------------------------------

export function beatFrequency(f1: number, f2: number): number { return Math.abs(f1 - f2); }
/** Envelope 2A|cos(πΔf·t)| of two equal-amplitude waves at one place (m). */
export function beatEnvelope(A: number, f1: number, f2: number, t: number): number { return 2 * A * Math.abs(Math.cos(Math.PI * (f1 - f2) * t)); }
