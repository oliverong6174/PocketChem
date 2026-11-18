/**
 * Stage 24: electrostatics of stationary point charges and motion in a uniform electric field. Pure SI model; no React.
 *
 * Conventions
 *  - Positions are in metres in a 2-D plane (x right, y up); charges in coulombs, fields in V/m, potentials in volts.
 *  - Force on charge 2 due to charge 1:  F₂ = kₑ q₁q₂ r₂₁ / |r₂₁|³ with r₂₁ = r₂ − r₁. Like charges give a force on 2 pointing
 *    away from 1 (repulsion), unlike charges point toward 1 (attraction).
 *  - E(r) = Σ kₑ qᵢ (r − rᵢ)/|r − rᵢ|³ is a property of the SOURCE charges only; the force on a test charge is F = qE.
 *  - Potential V(r) = Σ kₑ qᵢ/|r − rᵢ| with V = 0 at infinity (the stated reference); potential energy of a test charge U = qV;
 *    the work done BY the field moving it from A to B is W = −ΔU = q(V_A − V_B).
 * The point-charge model is singular at a charge. Nothing here clamps a singularity: a request closer than MIN_SEPARATION to a
 * source returns `{ ok: false, reason: "singular" }` (or throws for the pairwise functions) instead of a made-up finite value.
 */

export const K_E = 8.9875517923e9; // N m² C⁻² (1/4πε₀, CODATA 2018)
export const EPS0 = 8.8541878128e-12; // F/m
export const E_CHARGE = 1.602176634e-19; // C (exact)
export const C_LIGHT = 299792458; // m/s

export interface Vec2 { x: number; y: number }
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const norm = (a: Vec2) => Math.hypot(a.x, a.y);
/** Angle of a vector in degrees, counter-clockwise from +x, in (−180, 180]. */
export const angleDeg = (a: Vec2) => (Math.atan2(a.y, a.x) * 180) / Math.PI;

export interface PointCharge { id: string; q: number; x: number; y: number }
export const WORLD = { xMin: -5, xMax: 5, yMin: -3.5, yMax: 3.5 } as const;
export const MIN_SEPARATION = 1e-3; // m: closer than this the ideal point-charge model is treated as singular
export const MAX_CHARGES = 6;
export const Q_RANGE: [number, number] = [1e-10, 1e-4]; // |q| in coulombs
/** Radius around a source inside which the maps do not draw arrows or contours (the 1/r singularity would only mislead). */
export const MAP_EXCLUSION = 0.15;

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateCharges(raw: unknown): Validated<PointCharge[]> {
  if (!Array.isArray(raw)) return { ok: false, errors: ["Charges must be a list."] };
  if (raw.length < 1 || raw.length > MAX_CHARGES) return { ok: false, errors: [`Between 1 and ${MAX_CHARGES} charges are supported.`] };
  const errors: string[] = [];
  const out: PointCharge[] = [];
  const ids = new Set<string>();
  for (const c of raw) {
    if (!isObject(c) || typeof c.id !== "string" || !/^[a-z0-9]{1,8}$/.test(c.id) || ids.has(c.id)) { errors.push("Each charge needs a unique short id."); continue; }
    ids.add(c.id);
    if (!finite(c.q) || Math.abs(c.q) < Q_RANGE[0] || Math.abs(c.q) > Q_RANGE[1]) errors.push(`Charge ${c.id}: |q| must be between 0.1 nC and 100 µC (and not zero).`);
    if (!finite(c.x) || c.x < WORLD.xMin || c.x > WORLD.xMax || !finite(c.y) || c.y < WORLD.yMin || c.y > WORLD.yMax) errors.push(`Charge ${c.id}: position must lie inside the ${WORLD.xMax * 2} m × ${WORLD.yMax * 2} m window.`);
    if (finite(c.q) && finite(c.x) && finite(c.y)) out.push({ id: c.id, q: c.q, x: c.x, y: c.y });
  }
  if (!errors.length) {
    for (let i = 0; i < out.length; i += 1) for (let j = i + 1; j < out.length; j += 1) {
      if (Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y) < MIN_SEPARATION) errors.push(`Charges ${out[i].id} and ${out[j].id} coincide: the ideal point-charge force is singular there.`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

// ---- Coulomb's law ----------------------------------------------------------------------------------------------------------

export const coulombMagnitude = (q1: number, q2: number, r: number): number => {
  if (!(r > 0)) throw new RangeError("Separation must be positive.");
  return (K_E * Math.abs(q1 * q2)) / (r * r);
};
/** Force vector on `target` due to `source` (newtons). Throws if the two coincide. */
export function coulombForceOn(target: PointCharge, source: PointCharge): Vec2 {
  const d = sub(target, source);
  const r = norm(d);
  if (r < MIN_SEPARATION) throw new RangeError("The charges coincide: Coulomb's law is singular.");
  const k = (K_E * target.q * source.q) / (r * r * r);
  return { x: k * d.x, y: k * d.y };
}
/** Net force on one charge from all the others (vector superposition). */
export function netForceOn(charges: PointCharge[], id: string): Vec2 {
  const target = charges.find((c) => c.id === id);
  if (!target) throw new RangeError(`No charge ${id}.`);
  let f: Vec2 = { x: 0, y: 0 };
  for (const c of charges) if (c.id !== id) f = add(f, coulombForceOn(target, c));
  return f;
}

// ---- field and potential ------------------------------------------------------------------------------------------------------

export type FieldResult = { ok: true; E: Vec2; magnitude: number; angleDeg: number } | { ok: false; reason: "singular" };
export function fieldAt(charges: PointCharge[], p: Vec2): FieldResult {
  let E: Vec2 = { x: 0, y: 0 };
  for (const c of charges) {
    const d = sub(p, c), r = norm(d);
    if (r < MIN_SEPARATION) return { ok: false, reason: "singular" };
    const k = (K_E * c.q) / (r * r * r);
    E = add(E, { x: k * d.x, y: k * d.y });
  }
  const m = norm(E);
  return { ok: true, E, magnitude: m, angleDeg: m > 0 ? angleDeg(E) : 0 };
}
export type PotentialResult = { ok: true; V: number } | { ok: false; reason: "singular" };
export function potentialAt(charges: PointCharge[], p: Vec2): PotentialResult {
  let V = 0;
  for (const c of charges) {
    const r = Math.hypot(p.x - c.x, p.y - c.y);
    if (r < MIN_SEPARATION) return { ok: false, reason: "singular" };
    V += (K_E * c.q) / r;
  }
  return { ok: true, V };
}
/** F = qE for a test charge; the source field E is not modified by the test charge. */
export const forceOnTest = (E: Vec2, qTest: number): Vec2 => scale(E, qTest);
/** U = qV. */
export const potentialEnergy = (qTest: number, V: number) => qTest * V;
/** Work done BY the electric field moving a test charge from A to B: W = −ΔU = q(V_A − V_B). */
export const workByField = (qTest: number, VA: number, VB: number) => qTest * (VA - VB);

// ---- visualization helpers (derived from the same E and V functions) ---------------------------------------------------------------------

export const nearSource = (charges: PointCharge[], p: Vec2, radius = MAP_EXCLUSION) => charges.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < radius);

/** Grid of field samples for arrows. Points inside the exclusion radius of a source are omitted rather than drawn with a huge arrow. */
export function fieldGrid(charges: PointCharge[], nx = 17, ny = 11): Array<{ x: number; y: number; E: Vec2; magnitude: number }> {
  const out: Array<{ x: number; y: number; E: Vec2; magnitude: number }> = [];
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    const x = WORLD.xMin + ((i + 0.5) * (WORLD.xMax - WORLD.xMin)) / nx, y = WORLD.yMin + ((j + 0.5) * (WORLD.yMax - WORLD.yMin)) / ny;
    if (nearSource(charges, { x, y }, MAP_EXCLUSION * 1.6)) continue;
    const f = fieldAt(charges, { x, y });
    if (f.ok) out.push({ x, y, E: f.E, magnitude: f.magnitude });
  }
  return out;
}

export type Segment = [number, number, number, number];
/**
 * Equipotential contour of V(x, y) = level by marching squares on a regular grid, using the SAME potentialAt as the readout.
 * Cells with a corner inside the exclusion disc around a source are skipped, so no contour is drawn through the singularity.
 */
export function equipotential(charges: PointCharge[], level: number, nx = 161, ny = 113): Segment[] {
  const xs = (i: number) => WORLD.xMin + (i * (WORLD.xMax - WORLD.xMin)) / (nx - 1);
  const ys = (j: number) => WORLD.yMin + (j * (WORLD.yMax - WORLD.yMin)) / (ny - 1);
  const V = new Float64Array(nx * ny);
  const ok = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    const p = { x: xs(i), y: ys(j) };
    const masked = nearSource(charges, p);
    const r = masked ? { ok: false as const } : potentialAt(charges, p);
    ok[j * nx + i] = r.ok ? 1 : 0;
    V[j * nx + i] = r.ok ? r.V - level : 0;
  }
  const segs: Segment[] = [];
  const interp = (x1: number, y1: number, v1: number, x2: number, y2: number, v2: number): [number, number] => { const t = v1 / (v1 - v2); return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]; };
  for (let j = 0; j < ny - 1; j += 1) for (let i = 0; i < nx - 1; i += 1) {
    const idx = [j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i];
    if (!idx.every((k) => ok[k])) continue;
    const v = idx.map((k) => V[k]);
    const px = [xs(i), xs(i + 1), xs(i + 1), xs(i)], py = [ys(j), ys(j), ys(j + 1), ys(j + 1)];
    const code = (v[0] > 0 ? 1 : 0) | (v[1] > 0 ? 2 : 0) | (v[2] > 0 ? 4 : 0) | (v[3] > 0 ? 8 : 0);
    if (code === 0 || code === 15) continue;
    const edge = (a: number, b: number) => interp(px[a], py[a], v[a], px[b], py[b], v[b]);
    const e = [() => edge(0, 1), () => edge(1, 2), () => edge(2, 3), () => edge(3, 0)];
    const pairs: Record<number, number[][]> = {
      1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]],
    };
    let list = pairs[code];
    if (code === 5 || code === 10) {
      const centre = (v[0] + v[1] + v[2] + v[3]) / 4;
      list = (code === 5) === centre > 0 ? [[3, 2], [0, 1]] : [[3, 0], [1, 2]];
    }
    for (const [a, b] of list) { const A = e[a](), B = e[b](); segs.push([A[0], A[1], B[0], B[1]]); }
  }
  return segs;
}

export interface FieldLine { points: Vec2[]; ended: "charge" | "boundary" | "length" | "null" }
/**
 * A field LINE traced numerically (RK4 along the unit field direction). It is a visualization of the field direction, not the
 * trajectory of any particle. `dir = +1` follows E, `−1` runs against it. It stops near a source, outside the window, where the
 * field vanishes, or after a maximum length.
 */
export function fieldLine(charges: PointCharge[], start: Vec2, dir: 1 | -1 = 1, step = 0.04, maxSteps = 1500): FieldLine {
  const unit = (p: Vec2): Vec2 | null => { const f = fieldAt(charges, p); if (!f.ok || f.magnitude < 1e-9) return null; return scale(f.E, dir / f.magnitude); };
  const pts: Vec2[] = [start];
  let p = start;
  for (let n = 0; n < maxSteps; n += 1) {
    if (nearSource(charges, p, 0.08) && n > 0) return { points: pts, ended: "charge" };
    const k1 = unit(p); if (!k1) return { points: pts, ended: "null" };
    const k2 = unit(add(p, scale(k1, step / 2))); if (!k2) return { points: pts, ended: "null" };
    const k3 = unit(add(p, scale(k2, step / 2))); if (!k3) return { points: pts, ended: "null" };
    const k4 = unit(add(p, scale(k3, step))); if (!k4) return { points: pts, ended: "null" };
    p = add(p, scale({ x: k1.x + 2 * k2.x + 2 * k3.x + k4.x, y: k1.y + 2 * k2.y + 2 * k3.y + k4.y }, step / 6));
    pts.push(p);
    if (p.x < WORLD.xMin || p.x > WORLD.xMax || p.y < WORLD.yMin || p.y > WORLD.yMax) return { points: pts, ended: "boundary" };
  }
  return { points: pts, ended: "length" };
}
/** Starting points for field lines: a ring around every positive charge (or, if there is none, around every negative charge traced backwards). */
export function fieldLineSeeds(charges: PointCharge[], perCharge = 8): Array<{ start: Vec2; dir: 1 | -1 }> {
  const pos = charges.filter((c) => c.q > 0);
  const sources = pos.length ? pos : charges;
  const dir: 1 | -1 = pos.length ? 1 : -1;
  const seeds: Array<{ start: Vec2; dir: 1 | -1 }> = [];
  for (const c of sources) {
    const n = Math.max(4, Math.round(perCharge * Math.min(3, Math.sqrt(Math.abs(c.q) / Math.abs(sources[0].q)))));
    for (let k = 0; k < n; k += 1) { const a = (2 * Math.PI * k) / n + 0.13; seeds.push({ start: { x: c.x + 0.12 * Math.cos(a), y: c.y + 0.12 * Math.sin(a) }, dir }); }
  }
  return seeds;
}

export const PRESETS: Record<string, { label: string; charges: PointCharge[] }> = {
  single: { label: "Single positive charge", charges: [{ id: "a", q: 2e-9, x: 0, y: 0 }] },
  dipole: { label: "Dipole (+2 nC and −2 nC)", charges: [{ id: "a", q: 2e-9, x: -1, y: 0 }, { id: "b", q: -2e-9, x: 1, y: 0 }] },
  pair: { label: "Two equal positive charges", charges: [{ id: "a", q: 2e-9, x: -1, y: 0 }, { id: "b", q: 2e-9, x: 1, y: 0 }] },
  triangle: { label: "Three charges (+, +, −)", charges: [{ id: "a", q: 2e-9, x: -1.5, y: -1 }, { id: "b", q: 2e-9, x: 1.5, y: -1 }, { id: "c", q: -4e-9, x: 0, y: 1.5 }] },
};

// ---- uniform electric field: a charged particle --------------------------------------------------------------------------------------

export interface UniformFieldInput {
  /** Mass (kg) and signed charge (C). */
  m: number; q: number;
  x0: number; y0: number; vx0: number; vy0: number;
  /** Uniform field (V/m). */
  Ex: number; Ey: number;
  /** Simulated duration (s). */
  duration: number;
}
export const DEFAULT_UNIFORM: UniformFieldInput = { m: 1.67262192369e-27, q: E_CHARGE, x0: 0, y0: 0, vx0: 1e5, vy0: 0, Ex: 0, Ey: 5e3, duration: 4e-7 };
export const PARTICLES: Record<string, { label: string; m: number; q: number }> = {
  proton: { label: "Proton", m: 1.67262192369e-27, q: E_CHARGE },
  electron: { label: "Electron", m: 9.1093837015e-31, q: -E_CHARGE },
  alpha: { label: "Alpha particle", m: 6.6446573357e-27, q: 2 * E_CHARGE },
};
export function validateUniform(raw: unknown): Validated<UniformFieldInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["Particle settings are missing."] };
  const num = (k: string) => raw[k];
  if (!finite(raw.m) || raw.m < 1e-31 || raw.m > 1e-3) errors.push("Mass must be between 1e-31 kg and 1e-3 kg.");
  if (!finite(raw.q) || raw.q === 0 || Math.abs(raw.q) < 1e-19 || Math.abs(raw.q) > 1e-3) errors.push("Charge must be non-zero with magnitude between 1e-19 C and 1e-3 C.");
  for (const k of ["x0", "y0"]) if (!finite(num(k)) || Math.abs(num(k) as number) > 1e3) errors.push("Initial position must be within ±1000 m.");
  for (const k of ["vx0", "vy0"]) if (!finite(num(k)) || Math.abs(num(k) as number) > 3e7) errors.push("Initial velocity components must be within ±3×10⁷ m/s (the model is non-relativistic).");
  for (const k of ["Ex", "Ey"]) if (!finite(num(k)) || Math.abs(num(k) as number) > 1e9) errors.push("Field components must be within ±10⁹ V/m.");
  if (!finite(raw.duration) || raw.duration <= 0 || raw.duration > 1e6) errors.push("Duration must be positive and at most 10⁶ s.");
  if (errors.length) return { ok: false, errors };
  const p = raw as unknown as UniformFieldInput;
  const v = { m: p.m, q: p.q, x0: p.x0, y0: p.y0, vx0: p.vx0, vy0: p.vy0, Ex: p.Ex, Ey: p.Ey, duration: p.duration };
  const end = uniformState(v, v.duration);
  if (Math.hypot(end.vx, end.vy) > 0.1 * C_LIGHT) return { ok: false, errors: ["The particle would exceed 10 % of the speed of light: this non-relativistic model does not apply. Shorten the duration or reduce the field."] };
  return { ok: true, value: v };
}
export interface UniformState { t: number; x: number; y: number; vx: number; vy: number; ax: number; ay: number; speed: number; ke: number; fx: number; fy: number }
/** a = qE/m (constant); r = r₀ + v₀t + ½at²; v = v₀ + at. Exact for a constant field and non-relativistic speeds; ignores gravity and radiation. */
export function uniformState(p: UniformFieldInput, t: number): UniformState {
  const fx = p.q * p.Ex, fy = p.q * p.Ey;
  const ax = fx / p.m, ay = fy / p.m;
  const vx = p.vx0 + ax * t, vy = p.vy0 + ay * t;
  return { t, x: p.x0 + p.vx0 * t + 0.5 * ax * t * t, y: p.y0 + p.vy0 * t + 0.5 * ay * t * t, vx, vy, ax, ay, speed: Math.hypot(vx, vy), ke: 0.5 * p.m * (vx * vx + vy * vy), fx, fy };
}
export function uniformTrace(p: UniformFieldInput, points = 200): UniformState[] {
  const out: UniformState[] = [];
  for (let k = 0; k <= points; k += 1) out.push(uniformState(p, (p.duration * k) / points));
  return out;
}
