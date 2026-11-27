/**
 * Forces and Newton's laws (pure; no React).
 *
 * Systems:
 *  - "surface": one body of mass m on a flat or inclined plane (angle θ), pulled or pushed by an applied force F at angle φ
 *    to the surface (φ > 0 tilts the force away from the surface, up-slope along it). Gravity, the normal force, and static
 *    or kinetic friction act. The tension case is the same body pulled by a rope (same physics, different label).
 *  - "pulley": a body of mass m on a horizontal table joined by a light string over an ideal pulley to a hanging mass m₂.
 *    Both bodies share one acceleration; the tension is T = m₂(g − a).
 *
 * Axes: x along the surface (positive up-slope or toward the pulley), y perpendicular to it (positive out of the surface).
 * Static friction is an adaptive force with |fₛ| ≤ μₛN; kinetic friction has magnitude μₖN and opposes sliding. The normal
 * force is N = mg cosθ − F sinφ (not simply mg); if that is negative the body has left the surface and N = f = 0.
 * Motion is analytic and piecewise: a decelerating slide ends at the instant it stops, and the next phase is decided from the
 * forces at that moment (it may stay at rest or start sliding the other way).
 */

export const FORCE_LIMITS = {
  minMass: 0.01, maxMass: 1000, maxAngle: 80, maxForce: 2000, maxMu: 3, minG: 0.1, maxG: 30, maxV: 100, minDuration: 0.1, maxDuration: 200,
} as const;

export type ForceMode = "surface" | "pulley";
export type AppliedKind = "applied" | "tension";

export interface ForceInput {
  mode: ForceMode;
  /** Mass of the body (kg). */
  m: number;
  /** Hanging mass (kg), pulley mode only. */
  m2: number;
  /** Incline angle (degrees), surface mode. 0 = horizontal. */
  theta: number;
  /** Applied force magnitude (N) and its angle to the surface (degrees, −90…90), surface mode. */
  F: number;
  phi: number;
  /** Label for the applied force. */
  kind: AppliedKind;
  mus: number;
  muk: number;
  g: number;
  /** Initial velocity along +x (m/s). */
  v0: number;
  /** Observation time (s). */
  duration: number;
}

export const DEFAULT_FORCE_INPUT: ForceInput = { mode: "surface", m: 5, m2: 2, theta: 0, F: 20, phi: 0, kind: "applied", mus: 0.5, muk: 0.3, g: 9.81, v0: 0, duration: 6 };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function validateForceInput(raw: unknown): Validated<ForceInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["The force settings are missing."] };
  const L = FORCE_LIMITS;
  const num = (v: unknown, label: string, lo: number, hi: number, unit: string) => { if (!finite(v) || v < lo || v > hi) errors.push(`${label} must be a number between ${lo} and ${hi} ${unit}.`); };
  if (raw.mode !== "surface" && raw.mode !== "pulley") errors.push("The system must be a surface or a pulley.");
  if (raw.kind !== "applied" && raw.kind !== "tension") errors.push("The applied force must be labelled applied or tension.");
  num(raw.m, "Mass", L.minMass, L.maxMass, "kg");
  num(raw.m2, "Hanging mass", L.minMass, L.maxMass, "kg");
  num(raw.theta, "Incline angle", 0, L.maxAngle, "°");
  num(raw.F, "Applied force", 0, L.maxForce, "N");
  num(raw.phi, "Force angle", -90, 90, "°");
  num(raw.mus, "Static friction coefficient", 0, L.maxMu, "");
  num(raw.muk, "Kinetic friction coefficient", 0, L.maxMu, "");
  num(raw.g, "Gravity", L.minG, L.maxG, "m/s²");
  num(raw.v0, "Initial velocity", -L.maxV, L.maxV, "m/s");
  num(raw.duration, "Observation time", L.minDuration, L.maxDuration, "s");
  if (finite(raw.mus) && finite(raw.muk) && raw.muk > raw.mus) errors.push("The kinetic friction coefficient cannot exceed the static one in this model.");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      mode: raw.mode as ForceMode, m: raw.m as number, m2: raw.m2 as number, theta: raw.theta as number, F: raw.F as number, phi: raw.phi as number,
      kind: raw.kind as AppliedKind, mus: raw.mus as number, muk: raw.muk as number, g: raw.g as number, v0: raw.v0 as number, duration: raw.duration as number,
    },
  };
}

// ---- one-dimensional motion with static and kinetic friction -------------------------------------------------------------------------

export interface SlideSpec {
  /** Net driving force along +x apart from friction (N) and the total inertia it accelerates (kg). */
  P: number;
  M: number;
  /** Normal force pressing the surfaces together (N) and the friction coefficients. */
  N: number;
  mus: number;
  muk: number;
  v0: number;
}

export interface SlidePhase {
  t0: number;
  /** Duration (Infinity for the last phase). */
  dur: number;
  x0: number;
  v0: number;
  a: number;
  /** Friction force along +x during the phase (N). */
  f: number;
  kind: "static" | "kinetic";
  /** Distance travelled before this phase (path length, m). */
  path0: number;
}

const EPS = 1e-12;

export function buildSlide(s: SlideSpec): SlidePhase[] {
  const phases: SlidePhase[] = [];
  let t = 0;
  let x = 0;
  let v = Math.abs(s.v0) < EPS ? 0 : s.v0;
  let path = 0;
  for (let i = 0; i < 4; i += 1) {
    let a: number;
    let f: number;
    let kind: "static" | "kinetic";
    if (v !== 0) {
      const dir = Math.sign(v);
      f = -dir * s.muk * s.N;
      a = (s.P + f) / s.M;
      kind = "kinetic";
      if (a * dir < 0) {
        const dur = Math.abs(v / a);
        phases.push({ t0: t, dur, x0: x, v0: v, a, f, kind, path0: path });
        x += v * dur + 0.5 * a * dur * dur;
        path += Math.abs(x - phases[phases.length - 1].x0);
        t += dur;
        v = 0;
        continue;
      }
    } else if (Math.abs(s.P) <= s.mus * s.N) {
      f = -s.P; a = 0; kind = "static";
    } else {
      const dir = Math.sign(s.P);
      f = -dir * s.muk * s.N;
      a = (s.P + f) / s.M;
      kind = "kinetic";
    }
    phases.push({ t0: t, dur: Infinity, x0: x, v0: v, a, f, kind, path0: path });
    return phases;
  }
  return phases;
}

export interface SlideState { x: number; v: number; a: number; f: number; kind: "static" | "kinetic"; path: number; phase: number }

export function slideAt(phases: SlidePhase[], t: number): SlideState {
  let i = 0;
  while (i + 1 < phases.length && t >= phases[i].t0 + phases[i].dur) i += 1;
  const p = phases[i];
  const tau = Math.min(Math.max(t - p.t0, 0), Number.isFinite(p.dur) ? p.dur : Infinity);
  const v = p.kind === "static" ? 0 : p.v0 + p.a * tau;
  const x = p.x0 + p.v0 * tau + 0.5 * p.a * tau * tau;
  // a body that has just stopped at the end of a decelerating phase is at rest
  const stopped = Number.isFinite(p.dur) && tau >= p.dur;
  return { x, v: stopped ? 0 : v, a: stopped ? phases[Math.min(i + 1, phases.length - 1)].a : p.a, f: p.f, kind: p.kind, path: p.path0 + Math.abs(x - p.x0), phase: i };
}

/** First time at which x reaches `target` (null if it never does). With `afterStart`, a target equal to the starting position only counts on a later visit. */
export function firstReach(phases: SlidePhase[], target: number, afterStart = false): number | null {
  for (const p of phases) {
    const dx = target - p.x0;
    const end = Number.isFinite(p.dur) ? p.dur : Infinity;
    if (dx === 0 && !afterStart) return p.t0;
    const cands: number[] = [];
    if (p.kind === "static") continue;
    if (Math.abs(p.a) < EPS) { if (p.v0 !== 0) cands.push(dx / p.v0); } else {
      const disc = p.v0 * p.v0 + 2 * p.a * dx;
      if (disc >= 0) { const r = Math.sqrt(disc); cands.push((-p.v0 + r) / p.a, (-p.v0 - r) / p.a); }
    }
    const ok = cands.filter((tau) => (afterStart ? tau > 1e-12 : tau >= -1e-12) && tau <= end + 1e-12).sort((a, b) => a - b);
    if (ok.length) return p.t0 + Math.max(0, ok[0]);
  }
  return null;
}

// ---- the force system ----------------------------------------------------------------------------------------------------------------

export type ForceId = "weight" | "normal" | "friction" | "applied" | "tension" | "hangingWeight";

export interface ForceVector {
  id: ForceId;
  label: string;
  /** Components along the surface (x) and perpendicular to it (y), N. */
  x: number;
  y: number;
  magnitude: number;
  /** Direction angle from the surface (+x) in degrees, −180…180 (0 when the force is zero). */
  angle: number;
}

export type MotionState = "rest" | "verge" | "sliding" | "constant-velocity" | "airborne";

export interface ForceMoment {
  t: number;
  x: number;
  y: number;
  v: number;
  a: number;
  forces: ForceVector[];
  net: { x: number; y: number; magnitude: number };
  /** The friction at this instant: its kind and signed value along +x. */
  friction: { kind: "static" | "kinetic" | "none"; value: number };
  state: MotionState;
  /** Tension in the string (pulley mode) or in the rope (tension label), when there is one. */
  tension: number | null;
}

export interface ForceAnalysis {
  input: ForceInput;
  contact: boolean;
  /** N before the "cannot pull" cut: mg cosθ − F sinφ. */
  normalRaw: number;
  normal: number;
  /** Net force along the surface apart from friction (positive up-slope / toward the pulley). */
  driving: number;
  staticMax: number;
  /** True when the body is at rest and the driving force equals the static-friction limit. */
  verge: boolean;
  inertia: number;
  weight: number;
  parallel: number;
  perpendicular: number;
  phases: SlidePhase[] | null;
  at: (t: number) => ForceMoment;
}

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
const snap = (v: number) => (Math.abs(v) < 1e-13 ? 0 : v);

/** Split a force of the given magnitude at an angle (degrees) to the surface into its x and y components. */
export function decompose(magnitude: number, angleDeg: number): { x: number; y: number } {
  return { x: snap(magnitude * Math.cos(rad(angleDeg))), y: snap(magnitude * Math.sin(rad(angleDeg))) };
}

function vec(id: ForceId, label: string, x: number, y: number): ForceVector {
  const magnitude = Math.hypot(x, y);
  return { id, label, x: snap(x), y: snap(y), magnitude, angle: magnitude === 0 ? 0 : deg(Math.atan2(y, x)) };
}

export function analyzeForces(input: ForceInput): ForceAnalysis {
  const pulley = input.mode === "pulley";
  const theta = pulley ? 0 : input.theta;
  const { m, g } = input;
  const th = rad(theta);
  const W = m * g;
  const parallel = W * Math.sin(th);
  const perpendicular = W * Math.cos(th);
  const Fx = pulley ? 0 : decompose(input.F, input.phi).x;
  const Fy = pulley ? 0 : decompose(input.F, input.phi).y;
  const normalRaw = pulley ? W : perpendicular - Fy;
  const contact = normalRaw >= 0;
  const normal = contact ? normalRaw : 0;
  const driving = pulley ? input.m2 * g : Fx - parallel;
  const inertia = pulley ? m + input.m2 : m;
  const staticMax = input.mus * normal;
  const phases = contact ? buildSlide({ P: driving, M: inertia, N: normal, mus: input.mus, muk: input.muk, v0: input.v0 }) : null;
  const verge = contact && input.v0 === 0 && staticMax > 0 && Math.abs(Math.abs(driving) - staticMax) <= 1e-9 * Math.max(1, staticMax);

  const label = input.kind === "tension" ? "Tension" : "Applied force";
  const at = (t: number): ForceMoment => {
    if (!contact) {
      // the body has left the surface: no normal force, no surface friction; a constant net force acts
      const nx = Fx - parallel;
      const ny = Fy - perpendicular;
      const ax = nx / m;
      const ay = ny / m;
      const forces = [vec("weight", "Weight", -parallel, -perpendicular), vec("applied", label, Fx, Fy)];
      return { t, x: input.v0 * t + 0.5 * ax * t * t, y: 0.5 * ay * t * t, v: input.v0 + ax * t, a: ax, forces, net: { x: snap(nx), y: snap(ny), magnitude: Math.hypot(nx, ny) }, friction: { kind: "none", value: 0 }, state: "airborne", tension: input.kind === "tension" ? input.F : null };
    }
    const s = slideAt(phases!, t);
    let tension: number | null = null;
    const forces: ForceVector[] = [];
    if (pulley) {
      tension = input.m2 * (g - s.a);
      forces.push(vec("weight", "Weight", 0, -W), vec("normal", "Normal force", 0, normal), vec("tension", "Tension", tension, 0));
    } else {
      forces.push(vec("weight", "Weight", -parallel, -perpendicular), vec("normal", "Normal force", 0, normal));
      if (input.F > 0) forces.push(vec("applied", label, Fx, Fy));
      if (input.kind === "tension" && input.F > 0) tension = input.F;
    }
    forces.push(vec("friction", s.kind === "static" ? "Static friction" : "Kinetic friction", s.f, 0));
    let nx = 0;
    let ny = 0;
    for (const f of forces) { nx += f.x; ny += f.y; }
    if (pulley) { ny = 0; }
    const resting = s.v === 0;
    const atRestStatic = s.kind === "static" && resting;
    const state: MotionState = atRestStatic ? (verge ? "verge" : "rest") : Math.abs(s.a) < 1e-12 ? (resting ? "rest" : "constant-velocity") : "sliding";
    const fric = normal === 0 && s.f === 0 ? { kind: "none" as const, value: 0 } : { kind: s.kind, value: s.f };
    return { t, x: s.x, y: 0, v: s.v, a: s.a, forces, net: { x: snap(nx), y: snap(ny), magnitude: Math.hypot(snap(nx), snap(ny)) }, friction: fric, state, tension };
  };
  return { input, contact, normalRaw, normal, driving, staticMax, verge, inertia, weight: W, parallel, perpendicular, phases, at };
}

/** Plain-language state for the readout. */
export function describeState(s: MotionState): string {
  return { rest: "at rest (equilibrium)", verge: "at rest, on the verge of sliding", sliding: "accelerating", "constant-velocity": "moving at constant velocity (net force zero)", airborne: "no longer touching the surface" }[s];
}

/** The same body but with a hanging mass: acceleration and tension by the standard two-body equations, for cross-checks and the UI. */
export function pulleyAcceleration(m: number, m2: number, g: number, mu: number): number {
  return (m2 * g - mu * m * g) / (m + m2);
}
