/**
 * Geometric optics (pure; no React). Lengths in centimetres, angles in degrees at the interface, thin-element paraxial model.
 *
 * Sign convention ("real is positive"): object distance s > 0 for a real object in front of the element; focal length f > 0 for a
 * converging lens or concave mirror, f < 0 for a diverging lens or convex mirror; image distance s' > 0 for a REAL image (on the far
 * side of a lens, in front of a mirror) and s' < 0 for a VIRTUAL image. 1/s + 1/s' = 1/f, magnification m = −s'/s (m < 0: inverted).
 * Mirror focal length f = R/2 for a spherical mirror of radius R (paraxial).
 *
 * Diagram coordinates: the element is at x = 0, light arrives from −x, the object is at x = −s. A real lens image is at x = +s',
 * a real mirror image at x = −s' (in front). Principal rays are traced geometrically (not from the lens equation) so the tests can
 * check the equation against the construction.
 */

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export type Element = "lens" | "mirror";
export const OPTICS_LIMITS = { minF: 2, maxF: 100, minS: 1, maxS: 300, minH: 0.1, maxH: 20, minN: 1, maxN: 3, maxAngle: 89.9 } as const;

export interface ImagingInput {
  element: Element;
  /** Signed focal length (cm): converging lens / concave mirror positive. */
  f: number;
  /** Object distance (cm), real objects only. */
  s: number;
  /** Object height (cm). */
  h: number;
}
export const DEFAULT_IMAGING: ImagingInput = { element: "lens", f: 10, s: 25, h: 3 };

export function validateImaging(raw: unknown): Validated<ImagingInput> {
  if (!isObject(raw)) return { ok: false, errors: ["The imaging settings are missing."] };
  const L = OPTICS_LIMITS;
  const errors: string[] = [];
  if (raw.element !== "lens" && raw.element !== "mirror") errors.push("The element must be a lens or a mirror.");
  if (!finite(raw.f) || Math.abs(raw.f) < L.minF || Math.abs(raw.f) > L.maxF) errors.push(`Focal length must be a number with a size between ${L.minF} and ${L.maxF} cm (negative for a diverging lens or convex mirror).`);
  if (!finite(raw.s) || raw.s < L.minS || raw.s > L.maxS) errors.push(`Object distance must be between ${L.minS} and ${L.maxS} cm (a real object in front of the element; virtual objects are not modelled).`);
  if (!finite(raw.h) || raw.h < L.minH || raw.h > L.maxH) errors.push(`Object height must be between ${L.minH} and ${L.maxH} cm.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { element: raw.element as Element, f: raw.f as number, s: raw.s as number, h: raw.h as number } };
}

export interface ImagingResult {
  /** Image distance s' (cm); null when the object is at the focal point (the image is at infinity). */
  sPrime: number | null;
  /** Lateral magnification m = −s'/s; null at infinity. */
  m: number | null;
  /** Image height (signed: negative = inverted) (cm). */
  hPrime: number | null;
  nature: "real" | "virtual" | "none";
  orientation: "inverted" | "upright" | null;
  size: "enlarged" | "reduced" | "same size" | null;
  /** Optical power 1/f in dioptres (f in metres). */
  power: number;
  /** Mirror radius of curvature R = 2f (cm), signed like f. */
  radius: number | null;
  /** Where the object is relative to the focal point and the centre of curvature (the textbook cases). */
  region: "beyond-2f" | "at-2f" | "between-f-and-2f" | "at-f" | "inside-f" | "diverging";
  /** x of the image on the diagram axis (cm), null at infinity. */
  imageX: number | null;
}

export function solveImaging(i: ImagingInput): ImagingResult {
  const { f, s, h } = i;
  const power = 100 / f;
  const radius = i.element === "mirror" ? 2 * f : null;
  const atFocus = f > 0 && Math.abs(s - f) <= 1e-9 * Math.max(1, f);
  const region: ImagingResult["region"] =
    f < 0 ? "diverging" : atFocus ? "at-f" : s < f ? "inside-f" : Math.abs(s - 2 * f) <= 1e-9 * f ? "at-2f" : s < 2 * f ? "between-f-and-2f" : "beyond-2f";
  if (atFocus) return { sPrime: null, m: null, hPrime: null, nature: "none", orientation: null, size: null, power, radius, region, imageX: null };
  const sPrime = (s * f) / (s - f);
  const m = -sPrime / s;
  const nature = sPrime > 0 ? "real" : "virtual";
  const am = Math.abs(m);
  return {
    sPrime, m, hPrime: m * h, nature, orientation: m < 0 ? "inverted" : "upright",
    size: Math.abs(am - 1) <= 1e-9 ? "same size" : am > 1 ? "enlarged" : "reduced",
    power, radius, region, imageX: i.element === "lens" ? sPrime : -sPrime,
  };
}

// ---- principal rays (geometric construction) ---------------------------------------------------------------------------------------

export interface Pt { x: number; y: number }
export interface PrincipalRay {
  id: "parallel" | "focal" | "centre";
  label: string;
  /** Object tip → the point on the element where the ray is deviated. */
  incoming: [Pt, Pt];
  /** Point on the element and the unit direction after it (real rays travel along this). */
  hit: Pt;
  dir: Pt;
}
const unit = (x: number, y: number): Pt => { const n = Math.hypot(x, y) || 1; return { x: x / n, y: y / n }; };

/**
 * The three principal rays from the tip of the object, built only from the rules of the construction:
 *  lens   – parallel ray → through the far focal point (diverging: appears to come from the near one); ray through the near focal
 *           point → leaves parallel; ray through the centre → undeviated.
 *  mirror – parallel ray → through F (convex: appears to come from F); ray toward F → returns parallel; ray to the vertex →
 *           reflects at the same angle on the other side of the axis.
 * The focal point F is at x = +f for a lens (far side) and x = −f for a mirror (in front); a lens's near focal point is at x = −f.
 */
export function principalRays(i: ImagingInput): PrincipalRay[] {
  const { f, s, h, element } = i;
  const tip: Pt = { x: -s, y: h };
  const sg = Math.sign(f);
  // Height at which the "focal" ray meets the element: the line from the tip through (−f, 0) evaluated at x = 0.
  const yFocal = Math.abs(s - f) < 1e-12 ? NaN : (-h * f) / (s - f);
  if (element === "lens") {
    return [
      { id: "parallel", label: "parallel to the axis", incoming: [tip, { x: 0, y: h }], hit: { x: 0, y: h }, dir: unit(Math.abs(f), -h * sg) },
      { id: "focal", label: "through the near focal point", incoming: [tip, { x: 0, y: yFocal }], hit: { x: 0, y: yFocal }, dir: { x: 1, y: 0 } },
      { id: "centre", label: "through the centre", incoming: [tip, { x: 0, y: 0 }], hit: { x: 0, y: 0 }, dir: unit(s, -h) },
    ];
  }
  return [
    { id: "parallel", label: "parallel to the axis", incoming: [tip, { x: 0, y: h }], hit: { x: 0, y: h }, dir: unit(-Math.abs(f), -h * sg) },
    { id: "focal", label: "toward the focal point", incoming: [tip, { x: 0, y: yFocal }], hit: { x: 0, y: yFocal }, dir: { x: -1, y: 0 } },
    { id: "centre", label: "to the vertex", incoming: [tip, { x: 0, y: 0 }], hit: { x: 0, y: 0 }, dir: unit(-s, -h) },
  ];
}

/** Intersection of the infinite lines carried by two rays after the element; null when they are parallel (image at infinity). */
export function imageFromRays(a: PrincipalRay, b: PrincipalRay): Pt | null {
  const det = a.dir.x * b.dir.y - a.dir.y * b.dir.x;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((b.hit.x - a.hit.x) * b.dir.y - (b.hit.y - a.hit.y) * b.dir.x) / det;
  return { x: a.hit.x + t * a.dir.x, y: a.hit.y + t * a.dir.y };
}

// ---- refraction at a plane interface -----------------------------------------------------------------------------------------------

export interface RefractionInput { n1: number; n2: number; /** Angle of incidence from the normal (degrees). */ theta1: number }
export const DEFAULT_REFRACTION: RefractionInput = { n1: 1, n2: 1.5, theta1: 40 };

export function validateRefraction(raw: unknown): Validated<RefractionInput> {
  if (!isObject(raw)) return { ok: false, errors: ["The refraction settings are missing."] };
  const L = OPTICS_LIMITS;
  const errors: string[] = [];
  if (!finite(raw.n1) || raw.n1 < L.minN || raw.n1 > L.maxN) errors.push(`The refractive index of medium 1 must be between ${L.minN} and ${L.maxN}.`);
  if (!finite(raw.n2) || raw.n2 < L.minN || raw.n2 > L.maxN) errors.push(`The refractive index of medium 2 must be between ${L.minN} and ${L.maxN}.`);
  if (!finite(raw.theta1) || raw.theta1 < 0 || raw.theta1 > L.maxAngle) errors.push(`The angle of incidence must be from 0° to ${L.maxAngle}° (measured from the normal).`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { n1: raw.n1 as number, n2: raw.n2 as number, theta1: raw.theta1 as number } };
}

export interface RefractionResult {
  /** Angle of refraction (degrees from the normal); null under total internal reflection. */
  theta2: number | null;
  tir: boolean;
  /** Critical angle (degrees); null when light goes into a denser (or equal) medium, where no total internal reflection is possible. */
  critical: number | null;
  /** Angle of the reflected ray (= incidence). */
  thetaReflected: number;
  /** Speed of light in each medium as a fraction of c, v = c/n. */
  speed1: number;
  speed2: number;
  /** Direction of bending relative to the normal. */
  bending: "toward the normal" | "away from the normal" | "undeviated";
}
const RAD = Math.PI / 180;
export function solveRefraction(r: RefractionInput): RefractionResult {
  const critical = r.n1 > r.n2 ? Math.asin(r.n2 / r.n1) / RAD : null;
  const sin2 = (r.n1 * Math.sin(r.theta1 * RAD)) / r.n2;
  const tir = sin2 > 1 + 1e-12;
  const theta2 = tir ? null : Math.asin(Math.min(1, sin2)) / RAD;
  return {
    theta2, tir, critical, thetaReflected: r.theta1, speed1: 1 / r.n1, speed2: 1 / r.n2,
    bending: Math.abs(r.n1 - r.n2) < 1e-12 || r.theta1 === 0 ? "undeviated" : r.n2 > r.n1 ? "toward the normal" : "away from the normal",
  };
}
