/**
 * Stage 24: magnetic fields and the Lorentz force. Pure SI model; no React.
 *
 * Coordinate convention (right-handed, used by every function and every diagram): x to the right, y up, z OUT of the screen
 * toward the viewer. "Out of the page" is +z (drawn ⊙), "into the page" is −z (drawn ⊗).
 *
 * Models (each is an idealization, and each says where it stops):
 *  - long straight wire:  B = μ₀I/(2πr), azimuthal, direction from the right-hand rule (thumb along the current); r = 0 is rejected
 *  - circular loop on its AXIS only:  B = μ₀NIa²/(2(a²+x²)^{3/2}); not the field away from the axis
 *  - ideal long solenoid interior:  B ≈ μ₀nI (uniform, axial); the finite-solenoid on-axis formula is provided for comparison; the field
 *    outside and the end effects of a finite solenoid are NOT represented by the ideal equation
 *  - Lorentz force:  F = q(E + v × B);  straight conductor segment:  F = I L × B
 *  - particle in a uniform B along z (optionally with a uniform in-plane E): exact analytic helical / cycloidal motion, non-relativistic
 */

export const MU0 = 1.25663706212e-6; // N A⁻² (CODATA 2018; no longer exactly 4π×10⁻⁷)

export interface Vec3 { x: number; y: number; z: number }
export const v3 = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
export const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale3 = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot3 = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const norm3 = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
export const unit3 = (a: Vec3): Vec3 => { const n = norm3(a); if (n === 0) throw new RangeError("Zero vector has no direction."); return scale3(a, 1 / n); };
/** Angle between two non-zero vectors in degrees, in [0, 180]. */
export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const na = norm3(a), nb = norm3(b);
  if (na === 0 || nb === 0) throw new RangeError("The angle with a zero vector is undefined.");
  return (Math.acos(Math.min(1, Math.max(-1, dot3(a, b) / (na * nb)))) * 180) / Math.PI;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const inRange = (v: unknown, lo: number, hi: number): v is number => finite(v) && v >= lo && v <= hi;

export const C_LIGHT = 299792458;

// ---- straight wires ---------------------------------------------------------------------------------------------------------

export interface Wire { id: string; x: number; y: number; /** Signed current in amperes: positive is out of the screen (+z). */ I: number }
export const WIRE_WORLD = { xMin: -0.5, xMax: 0.5, yMin: -0.35, yMax: 0.35 } as const; // metres
export const MIN_WIRE_DISTANCE = 1e-3; // m: the filamentary model is singular at r = 0
export const MAX_WIRES = 3;
export const WIRE_I_RANGE: [number, number] = [1e-3, 1e3];

export function validateWires(raw: unknown): Validated<Wire[]> {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_WIRES) return { ok: false, errors: [`Between 1 and ${MAX_WIRES} wires are supported.`] };
  const errors: string[] = [], out: Wire[] = [], ids = new Set<string>();
  for (const w of raw) {
    if (!isObject(w) || typeof w.id !== "string" || !/^[a-z0-9]{1,8}$/.test(w.id) || ids.has(w.id)) { errors.push("Each wire needs a unique short id."); continue; }
    ids.add(w.id);
    if (!finite(w.I) || Math.abs(w.I) < WIRE_I_RANGE[0] || Math.abs(w.I) > WIRE_I_RANGE[1]) errors.push(`Wire ${w.id}: |I| must be between 1 mA and 1 kA.`);
    if (!inRange(w.x, WIRE_WORLD.xMin, WIRE_WORLD.xMax) || !inRange(w.y, WIRE_WORLD.yMin, WIRE_WORLD.yMax)) errors.push(`Wire ${w.id}: position must lie inside the ${WIRE_WORLD.xMax * 200} cm × ${WIRE_WORLD.yMax * 200} cm window.`);
    if (finite(w.I) && finite(w.x) && finite(w.y)) out.push({ id: w.id, I: w.I, x: w.x, y: w.y });
  }
  if (!errors.length) for (let i = 0; i < out.length; i += 1) for (let j = i + 1; j < out.length; j += 1) if (Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y) < MIN_WIRE_DISTANCE) errors.push(`Wires ${out[i].id} and ${out[j].id} coincide.`);
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

/** Magnitude of the field of one long straight wire: B = μ₀|I|/(2πr). r must be positive. */
export function wireMagnitude(I: number, r: number): number {
  if (!(r > 0)) throw new RangeError("The ideal filamentary wire is singular at r = 0.");
  return (MU0 * Math.abs(I)) / (2 * Math.PI * r);
}
/** Field vector (tesla) at (x, y) in the plane z = 0 from wires along z: B = μ₀I/(2πr²) (−dy, dx, 0). Counter-clockwise for I > 0. */
export type WireField = { ok: true; B: Vec3; magnitude: number } | { ok: false; reason: "singular" };
export function wireFieldAt(wires: Wire[], x: number, y: number): WireField {
  let B = v3(0, 0, 0);
  for (const w of wires) {
    const dx = x - w.x, dy = y - w.y, r2 = dx * dx + dy * dy;
    if (Math.sqrt(r2) < MIN_WIRE_DISTANCE) return { ok: false, reason: "singular" };
    const k = (MU0 * w.I) / (2 * Math.PI * r2);
    B = add3(B, v3(-k * dy, k * dx, 0));
  }
  return { ok: true, B, magnitude: norm3(B) };
}
/** Direction the field circulates as seen by a viewer looking at the screen (from +z). */
export const circulation = (I: number): "counterclockwise" | "clockwise" => (I > 0 ? "counterclockwise" : "clockwise");
export const currentDirectionWord = (I: number): "out of the screen" | "into the screen" => (I > 0 ? "out of the screen" : "into the screen");

export function wireGrid(wires: Wire[], nx = 15, ny = 11): Array<{ x: number; y: number; B: Vec3; magnitude: number }> {
  const out: Array<{ x: number; y: number; B: Vec3; magnitude: number }> = [];
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    const x = WIRE_WORLD.xMin + ((i + 0.5) * (WIRE_WORLD.xMax - WIRE_WORLD.xMin)) / nx, y = WIRE_WORLD.yMin + ((j + 0.5) * (WIRE_WORLD.yMax - WIRE_WORLD.yMin)) / ny;
    if (wires.some((w) => Math.hypot(x - w.x, y - w.y) < 0.03)) continue;
    const f = wireFieldAt(wires, x, y);
    if (f.ok) out.push({ x, y, B: f.B, magnitude: f.magnitude });
  }
  return out;
}

// ---- current loop (on-axis) -------------------------------------------------------------------------------------------------------

export interface LoopInput { I: number; a: number; N: number }
export const DEFAULT_LOOP: LoopInput = { I: 5, a: 0.05, N: 1 };
export function validateLoop(raw: unknown): Validated<LoopInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["Loop settings are missing."] };
  if (!finite(raw.I) || Math.abs(raw.I) < 1e-3 || Math.abs(raw.I) > 1e3) errors.push("Current must be between 1 mA and 1 kA in magnitude.");
  if (!inRange(raw.a, 1e-3, 1)) errors.push("Loop radius must be between 1 mm and 1 m.");
  if (!finite(raw.N) || !Number.isInteger(raw.N) || raw.N < 1 || raw.N > 1000) errors.push("Number of turns must be an integer from 1 to 1000.");
  return errors.length ? { ok: false, errors } : { ok: true, value: { I: raw.I as number, a: raw.a as number, N: raw.N as number } };
}
/**
 * Axial field of N tightly wound circular turns: B(x) = μ₀NIa²/(2(a²+x²)^{3/2}) along the axis. I > 0 means the current circulates
 * counter-clockwise as seen from the +x side, which makes B point along +x (right-hand rule). Valid ON THE AXIS only.
 */
export const loopAxial = (p: LoopInput, x: number): number => (MU0 * p.N * p.I * p.a * p.a) / (2 * Math.pow(p.a * p.a + x * x, 1.5));
export const loopCentre = (p: LoopInput): number => (MU0 * p.N * p.I) / (2 * p.a);

// ---- solenoid -----------------------------------------------------------------------------------------------------------------------

export interface SolenoidInput { n: number; I: number; L: number; R: number }
export const DEFAULT_SOLENOID: SolenoidInput = { n: 1000, I: 2, L: 0.5, R: 0.02 };
export function validateSolenoid(raw: unknown): Validated<SolenoidInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["Solenoid settings are missing."] };
  if (!inRange(raw.n, 1, 1e5)) errors.push("Turn density must be between 1 and 100 000 turns per metre.");
  if (!finite(raw.I) || Math.abs(raw.I) < 1e-3 || Math.abs(raw.I) > 1e3) errors.push("Current must be between 1 mA and 1 kA in magnitude.");
  if (!inRange(raw.L, 0.01, 10)) errors.push("Length must be between 1 cm and 10 m.");
  if (!inRange(raw.R, 1e-3, 1)) errors.push("Radius must be between 1 mm and 1 m.");
  return errors.length ? { ok: false, errors } : { ok: true, value: { n: raw.n as number, I: raw.I as number, L: raw.L as number, R: raw.R as number } };
}
/** Ideal long-solenoid interior field: B = μ₀nI, along the axis (sign of I: positive current circulating counter-clockwise from +x gives +x). */
export const solenoidIdeal = (p: SolenoidInput): number => MU0 * p.n * p.I;
/** Exact on-axis field of a FINITE solenoid of length L centred on x = 0: (μ₀nI/2)[(x+L/2)/√((x+L/2)²+R²) − (x−L/2)/√((x−L/2)²+R²)]. */
export function solenoidAxial(p: SolenoidInput, x: number): number {
  const a = x + p.L / 2, b = x - p.L / 2;
  return ((MU0 * p.n * p.I) / 2) * (a / Math.sqrt(a * a + p.R * p.R) - b / Math.sqrt(b * b + p.R * p.R));
}
/** The long-solenoid approximation is reasonable when the length is much larger than the diameter and the point is well inside. */
export const longSolenoidOk = (p: SolenoidInput) => p.L >= 10 * p.R;
export const SOLENOID_ASSUMPTIONS = [
  "Ideal long solenoid: length much larger than radius, tightly wound, uniform turn density n; the interior field is uniform and equals μ₀nI.",
  "The interior value is not exact near the ends: on the axis the field falls to about half of μ₀nI at an end of a long solenoid.",
  "The field outside an ideal long solenoid is taken as negligible; a real finite solenoid has a return field and end effects that this equation does not describe.",
];

// ---- Lorentz force --------------------------------------------------------------------------------------------------------------------

/** F = q(E + v × B), all SI. */
export const lorentzForce = (q: number, v: Vec3, B: Vec3, E: Vec3 = v3(0, 0, 0)): Vec3 => add3(scale3(E, q), scale3(cross3(v, B), q));
export const magneticForce = (q: number, v: Vec3, B: Vec3): Vec3 => scale3(cross3(v, B), q);
/** |F_B| = |q| v B sin θ with θ the angle between v and B. */
export function magneticMagnitude(q: number, speed: number, B: number, thetaDeg: number): number { return Math.abs(q) * speed * B * Math.abs(Math.sin((thetaDeg * Math.PI) / 180)); }
/** F = I L × B for a straight segment; L points along the conventional current. */
export const conductorForce = (I: number, L: Vec3, B: Vec3): Vec3 => scale3(cross3(L, B), I);

export interface LorentzInput { q: number; m: number; v: Vec3; B: Vec3; E: Vec3 }
export const DEFAULT_LORENTZ: LorentzInput = { q: 1.602176634e-19, m: 1.67262192369e-27, v: v3(1e5, 0, 0), B: v3(0, 0, 0.1), E: v3(0, 0, 0) };
export function validateLorentz(raw: unknown): Validated<LorentzInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["Lorentz-force settings are missing."] };
  const vec = (x: unknown, lim: number, name: string): Vec3 | null => {
    if (!isObject(x) || !finite(x.x) || !finite(x.y) || !finite(x.z) || Math.abs(x.x) > lim || Math.abs(x.y) > lim || Math.abs(x.z) > lim) { errors.push(`${name} components must be finite and within ±${lim}.`); return null; }
    return v3(x.x, x.y, x.z);
  };
  const v = vec(raw.v, 3e7, "Velocity"), B = vec(raw.B, 10, "Magnetic field"), E = vec(raw.E, 1e9, "Electric field");
  if (!finite(raw.q) || raw.q === 0 || Math.abs(raw.q) < 1e-19 || Math.abs(raw.q) > 1e-3) errors.push("Charge must be non-zero with magnitude between 1e-19 C and 1e-3 C.");
  if (!finite(raw.m) || raw.m < 1e-31 || raw.m > 1e-3) errors.push("Mass must be between 1e-31 kg and 1e-3 kg.");
  if (v && norm3(v) > 0.1 * C_LIGHT) errors.push("Speed must stay below 10 % of the speed of light (non-relativistic model).");
  return errors.length || !v || !B || !E ? { ok: false, errors } : { ok: true, value: { q: raw.q as number, m: raw.m as number, v, B, E } };
}

// ---- particle motion in a uniform B along z (optionally with an in-plane E) ---------------------------------------------------------------

export interface MotionInput {
  q: number; m: number;
  x0: number; y0: number; z0: number;
  vx: number; vy: number; vz: number;
  /** Signed field along z (T): positive points out of the screen. */
  Bz: number;
  /** Uniform in-plane electric field (V/m); zero for a purely magnetic field. */
  Ex: number; Ey: number;
  duration: number;
}
export const DEFAULT_MOTION: MotionInput = { q: 1.602176634e-19, m: 1.67262192369e-27, x0: 0, y0: 0, z0: 0, vx: 1e5, vy: 0, vz: 0, Bz: 0.5, Ex: 0, Ey: 0, duration: 1.4e-7 };
export function validateMotion(raw: unknown): Validated<MotionInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["Particle settings are missing."] };
  if (!finite(raw.q) || raw.q === 0 || Math.abs(raw.q) < 1e-19 || Math.abs(raw.q) > 1e-3) errors.push("Charge must be non-zero with magnitude between 1e-19 C and 1e-3 C.");
  if (!finite(raw.m) || raw.m < 1e-31 || raw.m > 1e-3) errors.push("Mass must be between 1e-31 kg and 1e-3 kg.");
  for (const k of ["x0", "y0", "z0"]) if (!inRange(raw[k], -1e3, 1e3)) errors.push("Initial position must be within ±1000 m.");
  for (const k of ["vx", "vy", "vz"]) if (!inRange(raw[k], -3e7, 3e7)) errors.push("Velocity components must be within ±3×10⁷ m/s.");
  if (!finite(raw.Bz) || Math.abs(raw.Bz) < 1e-6 || Math.abs(raw.Bz) > 10) errors.push("Magnetic field must be between 1 µT and 10 T in magnitude (it may point out of or into the screen).");
  for (const k of ["Ex", "Ey"]) if (!inRange(raw[k], -1e6, 1e6)) errors.push("Electric-field components must be within ±10⁶ V/m.");
  if (!finite(raw.duration) || raw.duration <= 0) errors.push("Duration must be positive.");
  if (errors.length) return { ok: false, errors };
  const p = raw as unknown as MotionInput;
  const out: MotionInput = { q: p.q, m: p.m, x0: p.x0, y0: p.y0, z0: p.z0, vx: p.vx, vy: p.vy, vz: p.vz, Bz: p.Bz, Ex: p.Ex, Ey: p.Ey, duration: p.duration };
  const s = motionSummary(out);
  if (Math.hypot(out.vx, out.vy, out.vz) > 0.1 * C_LIGHT) errors.push("Speed must stay below 10 % of the speed of light (non-relativistic model).");
  if (out.duration / s.period > 5000) errors.push("That duration covers more than 5000 orbits; shorten it.");
  const worst = Math.max(...[0, 0.25, 0.5, 0.75, 1].map((f) => Math.hypot(motionState(out, f * out.duration).vx, motionState(out, f * out.duration).vy, out.vz)));
  if (worst > 0.1 * C_LIGHT) errors.push("The particle would exceed 10 % of the speed of light: the non-relativistic model does not apply.");
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

export interface MotionSummary {
  /** Signed cyclotron angular frequency ω = qB/m (rad/s). Positive: clockwise as seen from +z (viewer looking at the screen). */
  omega: number; frequency: number; period: number;
  vPerp: number; vPar: number;
  /** Radius of the circular part of the motion (m): m v⊥/(|q|B) when E = 0. */
  radius: number;
  /** Distance advanced along the field per orbit (m): v∥ T. */
  pitch: number;
  /** E × B drift velocity (in-plane), zero when E = 0. */
  drift: { x: number; y: number };
  sense: "clockwise" | "counterclockwise";
}
export function motionSummary(p: MotionInput): MotionSummary {
  const omega = (p.q * p.Bz) / p.m;
  const T = (2 * Math.PI) / Math.abs(omega);
  // drift w_d = E×B/B² = (Ey, −Ex)/Bz
  const drift = { x: p.Ey / p.Bz, y: -p.Ex / p.Bz };
  const rel = { x: p.vx - drift.x, y: p.vy - drift.y };
  return {
    omega, frequency: Math.abs(omega) / (2 * Math.PI), period: T,
    vPerp: Math.hypot(p.vx, p.vy), vPar: p.vz,
    radius: Math.hypot(rel.x, rel.y) / Math.abs(omega),
    pitch: p.vz * T, drift, sense: omega > 0 ? "clockwise" : "counterclockwise",
  };
}
export interface MotionState { t: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; speed: number; ke: number; fx: number; fy: number; fz: number }
/**
 * Exact solution of m dv/dt = q(E + v × B) for B = B_z ẑ and in-plane E, using w = vx + i vy:
 *   w(t) = w_d + (w₀ − w_d) e^{−iωt},   w_d = E×B/B² = −i(Ex + iEy)/B_z,   ω = qB_z/m
 *   position = r₀ + w_d t + i (w₀ − w_d)(e^{−iωt} − 1)/ω,   z = z₀ + v_z t  (v_z is constant: neither force has a z component).
 * With E = 0 the speed, and so the kinetic energy, is exactly constant.
 */
export function motionState(p: MotionInput, t: number): MotionState {
  const omega = (p.q * p.Bz) / p.m;
  const wd = { re: p.Ey / p.Bz, im: -p.Ex / p.Bz };
  const w0 = { re: p.vx - wd.re, im: p.vy - wd.im };
  const c = Math.cos(omega * t), s = Math.sin(omega * t);
  // (w₀ − w_d) e^{−iωt}
  const wr = w0.re * c + w0.im * s, wi = -w0.re * s + w0.im * c;
  const vx = wd.re + wr, vy = wd.im + wi;
  // i (w₀−w_d)(e^{−iωt} − 1)/ω
  const dr = wr - w0.re, di = wi - w0.im; // (e^{−iωt}−1)(w₀−w_d)
  const px = -di / omega, py = dr / omega; // multiply by i/ω
  const x = p.x0 + wd.re * t + px, y = p.y0 + wd.im * t + py;
  const F = lorentzForce(p.q, v3(vx, vy, p.vz), v3(0, 0, p.Bz), v3(p.Ex, p.Ey, 0));
  return { t, x, y, z: p.z0 + p.vz * t, vx, vy, vz: p.vz, speed: Math.hypot(vx, vy, p.vz), ke: 0.5 * p.m * (vx * vx + vy * vy + p.vz * p.vz), fx: F.x, fy: F.y, fz: F.z };
}
export function motionTrace(p: MotionInput, points = 400): MotionState[] {
  const out: MotionState[] = [];
  for (let k = 0; k <= points; k += 1) out.push(motionState(p, (p.duration * k) / points));
  return out;
}
/** Convert a speed and two angles to a velocity: azimuth in the xy plane from +x (degrees, counter-clockwise from the viewer's side), pitch above the xy plane (toward +z). */
export function velocityFromAngles(speed: number, azimuthDeg: number, pitchDeg: number): Vec3 {
  const az = (azimuthDeg * Math.PI) / 180, pt = (pitchDeg * Math.PI) / 180;
  return v3(speed * Math.cos(pt) * Math.cos(az), speed * Math.cos(pt) * Math.sin(az), speed * Math.sin(pt));
}

export const RIGHT_HAND_RULES = {
  wire: "Point the right thumb along the current; the fingers curl the way the field circulates.",
  loop: "Curl the right fingers the way the current circulates; the thumb points along the field inside the loop.",
  force: "For F = q v × B with q > 0: point the fingers along v, curl them toward B, and the thumb gives F. For q < 0 reverse the result.",
} as const;
