/**
 * Mechanics and Motion: analytic constant-acceleration kinematics in two dimensions (pure; no React).
 *
 * Model: a point particle (no size, no rotation) with constant acceleration (ax, ay). Position and velocity are closed-form
 * functions of time, so every display evaluates the same function at the same time and nothing accumulates integration error.
 * Projectile motion is the special case ax = 0, ay = −g with no air resistance. The ground is the horizontal line y = 0;
 * the particle must start on or above it (y0 ≥ 0) and the flight ends the first time it comes back down to y = 0.
 *
 * Conventions: x to the right, y up (metres), time in seconds, angles in degrees measured above the +x axis
 * (negative = launched downward), velocities in m/s, accelerations in m/s².
 */

export const MECH_LIMITS = {
  maxPos: 1e4,
  maxSpeed: 1e3,
  minG: 0.1,
  maxG: 30,
  maxAccel: 100,
  minDuration: 0.1,
  maxDuration: 1000,
} as const;

/** Standard gravity and a few reference values used by the presets (m/s²). */
export const GRAVITY_PRESETS: Array<{ label: string; g: number }> = [
  { label: "Earth", g: 9.81 },
  { label: "Moon", g: 1.62 },
  { label: "Mars", g: 3.71 },
  { label: "Jupiter", g: 24.8 },
];

export interface Kinematics {
  x0: number;
  y0: number;
  vx0: number;
  vy0: number;
  ax: number;
  ay: number;
  /** When true, y = 0 is a floor: the motion ends at the first return to it. */
  ground: boolean;
  /** Length of the observed window (s) when there is no landing event. Ignored when the particle lands. */
  duration: number;
}

export type MotionMode = "projectile" | "constant";

export interface ProjectileInput {
  x0: number;
  /** Launch height above the ground (m). */
  y0: number;
  speed: number;
  /** Degrees above horizontal, −90 … 90. */
  angleDeg: number;
  /** Gravitational acceleration magnitude (m/s², downward). */
  g: number;
}

export interface ConstantAccelInput {
  x0: number;
  y0: number;
  vx0: number;
  vy0: number;
  ax: number;
  ay: number;
  ground: boolean;
  duration: number;
}

export const DEFAULT_PROJECTILE: ProjectileInput = { x0: 0, y0: 2, speed: 20, angleDeg: 40, g: 9.81 };
export const DEFAULT_CONSTANT: ConstantAccelInput = { x0: 0, y0: 0, vx0: 4, vy0: 0, ax: 1.5, ay: 0, ground: false, duration: 10 };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function range(errors: string[], v: unknown, label: string, lo: number, hi: number, unit: string): v is number {
  if (!finite(v)) { errors.push(`${label} must be a number.`); return false; }
  if (v < lo || v > hi) { errors.push(`${label} must be between ${lo} and ${hi} ${unit}.`); return false; }
  return true;
}

export function validateProjectile(raw: unknown): Validated<ProjectileInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["Projectile settings are missing."] };
  range(errors, raw.x0, "Initial x position", -MECH_LIMITS.maxPos, MECH_LIMITS.maxPos, "m");
  range(errors, raw.y0, "Launch height", 0, MECH_LIMITS.maxPos, "m (the ground is at 0)");
  range(errors, raw.speed, "Initial speed", 0, MECH_LIMITS.maxSpeed, "m/s");
  range(errors, raw.angleDeg, "Launch angle", -90, 90, "°");
  range(errors, raw.g, "Gravity", MECH_LIMITS.minG, MECH_LIMITS.maxG, "m/s²");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { x0: raw.x0 as number, y0: raw.y0 as number, speed: raw.speed as number, angleDeg: raw.angleDeg as number, g: raw.g as number } };
}

export function validateConstantAccel(raw: unknown): Validated<ConstantAccelInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["Motion settings are missing."] };
  range(errors, raw.x0, "Initial x position", -MECH_LIMITS.maxPos, MECH_LIMITS.maxPos, "m");
  const ground = raw.ground;
  if (typeof ground !== "boolean") errors.push("The ground switch must be on or off.");
  range(errors, raw.y0, "Initial y position", ground === true ? 0 : -MECH_LIMITS.maxPos, MECH_LIMITS.maxPos, ground === true ? "m (the ground is at 0)" : "m");
  range(errors, raw.vx0, "Initial x velocity", -MECH_LIMITS.maxSpeed, MECH_LIMITS.maxSpeed, "m/s");
  range(errors, raw.vy0, "Initial y velocity", -MECH_LIMITS.maxSpeed, MECH_LIMITS.maxSpeed, "m/s");
  range(errors, raw.ax, "x acceleration", -MECH_LIMITS.maxAccel, MECH_LIMITS.maxAccel, "m/s²");
  range(errors, raw.ay, "y acceleration", -MECH_LIMITS.maxAccel, MECH_LIMITS.maxAccel, "m/s²");
  range(errors, raw.duration, "Observation time", MECH_LIMITS.minDuration, MECH_LIMITS.maxDuration, "s");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      x0: raw.x0 as number, y0: raw.y0 as number, vx0: raw.vx0 as number, vy0: raw.vy0 as number,
      ax: raw.ax as number, ay: raw.ay as number, ground: ground as boolean, duration: raw.duration as number,
    },
  };
}

/** Components of the launch velocity. cos/sin of ±90° and 0° are snapped so a vertical or horizontal launch has an exactly zero component. */
export function launchComponents(speed: number, angleDeg: number): { vx0: number; vy0: number } {
  const a = (angleDeg * Math.PI) / 180;
  const snap = (v: number) => (Math.abs(v) < 1e-14 ? 0 : v);
  return { vx0: speed * snap(Math.cos(a)), vy0: speed * snap(Math.sin(a)) };
}

export function projectileKinematics(p: ProjectileInput): Kinematics {
  const { vx0, vy0 } = launchComponents(p.speed, p.angleDeg);
  return { x0: p.x0, y0: p.y0, vx0, vy0, ax: 0, ay: -p.g, ground: true, duration: 0 };
}

export function constantKinematics(c: ConstantAccelInput): Kinematics {
  return { x0: c.x0, y0: c.y0, vx0: c.vx0, vy0: c.vy0, ax: c.ax, ay: c.ay, ground: c.ground, duration: c.duration };
}

// ---- state at a time -----------------------------------------------------------------------------------------------------------------

export interface MotionState {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  speed: number;
  /** Displacement from the starting point. */
  dx: number;
  dy: number;
  /** Straight-line distance from the starting point. */
  displacement: number;
  /** Height above the ground (y). */
  height: number;
}

export function stateAt(k: Kinematics, t: number): MotionState {
  const x = k.x0 + k.vx0 * t + 0.5 * k.ax * t * t;
  const y = k.y0 + k.vy0 * t + 0.5 * k.ay * t * t;
  const vx = k.vx0 + k.ax * t;
  const vy = k.vy0 + k.ay * t;
  const dx = x - k.x0;
  const dy = y - k.y0;
  return { t, x, y, vx, vy, ax: k.ax, ay: k.ay, speed: Math.hypot(vx, vy), dx, dy, displacement: Math.hypot(dx, dy), height: y };
}

// ---- events and extremes -------------------------------------------------------------------------------------------------------------

/**
 * Time of the landing event: the first time after the start at which y returns to 0, or null when it never does.
 * The quadratic ½·ay·t² + vy0·t + y0 = 0 is solved in the cancellation-free form (q = −½(b + sgn(b)√D); roots q/a and c/q).
 * A particle that starts on the ground (y0 = 0) and is not moving upward has landed at t = 0.
 */
export function landingTime(k: Kinematics): number | null {
  if (!k.ground) return null;
  const a = 0.5 * k.ay;
  const b = k.vy0;
  const c = k.y0;
  if (c === 0) {
    const upward = b > 0 || (b === 0 && k.ay > 0);
    if (!upward) return 0;
    if (a === 0) return null; // moving up with no acceleration: never returns
    const t = -b / a; // roots 0 and −b/a
    return t > 0 ? t : null;
  }
  if (a === 0) {
    if (b >= 0) return null;
    return -c / b;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const q = -0.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(disc));
  const roots = [q / a, q === 0 ? NaN : c / q].filter((r) => Number.isFinite(r) && r > 0);
  return roots.length ? Math.min(...roots) : null;
}

/** End of the observed motion: the landing time when there is one, else the chosen observation window. */
export function endTime(k: Kinematics): number {
  const t = landingTime(k);
  return t === null ? k.duration : t;
}

export interface MotionSummary {
  tEnd: number;
  lands: boolean;
  /** Flight ends immediately: the particle starts on the ground and is not moving up. */
  degenerate: boolean;
  tFlight: number | null;
  range: number | null;
  /** Time and height of the highest point reached while the motion is observed. */
  tApex: number;
  maxHeight: number;
  /** True when the highest point is reached after the start (a turning point), false when it is the start or the end. */
  apexIsTurning: boolean;
  launch: MotionState;
  end: MotionState;
  /** Horizontal extent (min and max x) over the observed motion, for scaling. */
  xMin: number;
  xMax: number;
  yMin: number;
}

export function summarize(k: Kinematics): MotionSummary {
  const tl = landingTime(k);
  const tEnd = tl === null ? k.duration : tl;
  const end = stateAt(k, tEnd);
  const launch = stateAt(k, 0);
  // The turning point of y(t) is at t* = −vy0/ay; it is the highest point only when ay < 0.
  let tApex = 0;
  let apexIsTurning = false;
  if (k.ay < 0) {
    const ts = -k.vy0 / k.ay;
    if (ts > 0 && ts < tEnd) { tApex = ts; apexIsTurning = true; }
  }
  if (!apexIsTurning && end.y > launch.y) tApex = tEnd;
  const apex = stateAt(k, tApex);
  // x extent: the x(t) turning point (when ax ≠ 0 and it falls inside the window) matters for scaling only.
  const xs = [launch.x, end.x];
  if (k.ax !== 0) { const tx = -k.vx0 / k.ax; if (tx > 0 && tx < tEnd) xs.push(stateAt(k, tx).x); }
  const ys = [launch.y, end.y, apex.y];
  if (k.ay !== 0) { const ty = -k.vy0 / k.ay; if (ty > 0 && ty < tEnd) ys.push(stateAt(k, ty).y); }
  return {
    tEnd,
    lands: tl !== null,
    degenerate: tl === 0,
    tFlight: tl,
    range: tl === null ? null : end.x - k.x0,
    tApex,
    maxHeight: apex.y,
    apexIsTurning,
    launch,
    end,
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
  };
}

/** Sample the trajectory at `n + 1` evenly spaced times over [0, tEnd], always including the turning point of y when it lies inside. */
export function sampleTimes(k: Kinematics, n = 160): number[] {
  const tEnd = endTime(k);
  if (tEnd <= 0) return [0];
  const times = Array.from({ length: n + 1 }, (_, i) => (tEnd * i) / n);
  if (k.ay !== 0) { const ts = -k.vy0 / k.ay; if (ts > 0 && ts < tEnd) times.push(ts); }
  if (k.ax !== 0) { const ts = -k.vx0 / k.ax; if (ts > 0 && ts < tEnd) times.push(ts); }
  return times.sort((p, q) => p - q);
}

/** Clamp a time into the observed motion [0, tEnd]. NaN becomes 0. */
export function clampTime(k: Kinematics, t: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.min(Math.max(t, 0), endTime(k));
}

// ---- projectile closed forms (used by the explanations and as independent references in the tests) ------------------------------------

/** Flight time from height y0 down to the ground: (v sinθ + √(v² sin²θ + 2 g y0)) / g. */
export function projectileFlightTime(p: ProjectileInput): number {
  const { vy0 } = launchComponents(p.speed, p.angleDeg);
  if (p.y0 === 0 && vy0 <= 0) return 0;
  return (vy0 + Math.sqrt(vy0 * vy0 + 2 * p.g * p.y0)) / p.g;
}

/** Highest point: y0 + (v sinθ)² / 2g when launched upward, else the launch height. */
export function projectileMaxHeight(p: ProjectileInput): number {
  const { vy0 } = launchComponents(p.speed, p.angleDeg);
  return vy0 > 0 ? p.y0 + (vy0 * vy0) / (2 * p.g) : p.y0;
}

/** Specific mechanical energy (J/kg) for the constant-gravity projectile: ½v² + g·y. Conserved when there is no air resistance. */
export function specificEnergy(s: MotionState, g: number): number {
  return 0.5 * s.speed * s.speed + g * s.y;
}

/** The launch angle (0–90°, from level ground, y0 = 0) that gives the greatest range is 45°; with height it is smaller. */
export function bestAngleLevel(): number {
  return 45;
}

/** Angle (degrees, −90…90) that maximises the range from launch height y0 at speed v: tanθ = v / √(v² + 2 g y0). */
export function bestAngleFromHeight(speed: number, y0: number, g: number): number {
  return (Math.atan(speed / Math.sqrt(speed * speed + 2 * g * y0)) * 180) / Math.PI;
}

/** The two quantities that are plotted against time, as separate samples so every chart uses the same times. */
export interface Trace { t: number[]; x: number[]; y: number[]; vx: number[]; vy: number[] }
export function trace(k: Kinematics, n = 160): Trace {
  const times = sampleTimes(k, n);
  const states = times.map((t) => stateAt(k, t));
  return { t: times, x: states.map((s) => s.x), y: states.map((s) => s.y), vx: states.map((s) => s.vx), vy: states.map((s) => s.vy) };
}
