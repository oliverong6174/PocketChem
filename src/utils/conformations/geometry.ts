/** Small 3D helpers shared by the chair, Newman and sawhorse models. */

export type Vec3 = { x: number; y: number; z: number };

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number): Vec3 => vec(a.x * k, a.y * k, a.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l === 0 ? a : scale(a, 1 / l);
};

/**
 * Handedness of four points: +1 when, looking from `a` towards the centre, b -> c -> d run
 * clockwise (the SMILES "@@" / RDKit CW sense); -1 when anticlockwise; 0 when coplanar.
 */
export function handedness(a: Vec3, b: Vec3, c: Vec3, d: Vec3): 1 | -1 | 0 {
  const volume = dot(sub(b, a), cross(sub(c, a), sub(d, a)));
  if (Math.abs(volume) < 1e-9) return 0;
  return volume > 0 ? 1 : -1;
}

export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
export const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/** Wraps an angle in degrees into (-180, 180]. */
export function wrap180(degrees: number): number {
  let value = ((degrees % 360) + 360) % 360;
  if (value > 180) value -= 360;
  return value;
}

/** Wraps an angle in degrees into [0, 360). */
export function wrap360(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function rotateY(p: Vec3, radians: number): Vec3 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return vec(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}

export function rotateX(p: Vec3, radians: number): Vec3 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return vec(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
}
