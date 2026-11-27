/**
 * Interference and diffraction by N identical slits (pure; no React). Far-field (Fraunhofer) model, monochromatic light, SI units
 * except where a name says otherwise (wavelength nm, slit sizes µm, screen distance m).
 *
 *   I(θ)/I₀ = [sin β / β]² · [sin(Nγ) / (N sin γ)]²,   β = π a sinθ/λ,   γ = π d sinθ/λ
 *
 * a = slit width, d = slit separation (centre to centre), N = number of slits. N = 1 is single-slit diffraction (the second factor is 1);
 * N = 2 is Young's double slit with finite slits (the second factor equals cos²γ); larger N is a diffraction grating. The pattern on
 * a screen at distance L is evaluated at the true angle (y = L tanθ), with no small-angle approximation in the intensity.
 */

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const SLIT_LIMITS = { minLambda: 380, maxLambda: 780, minA: 0.5, maxA: 200, minD: 2, maxD: 500, minN: 1, maxN: 20, minL: 0.3, maxL: 10, maxFresnel: 0.5 } as const;

export interface SlitInput {
  /** Wavelength (nm). */
  lambdaNm: number;
  /** Slit width a (µm). */
  aUm: number;
  /** Slit separation d (µm); not used when N = 1. */
  dUm: number;
  /** Number of slits. */
  N: number;
  /** Distance to the screen (m). */
  L: number;
}
export const DEFAULT_SLITS: SlitInput = { lambdaNm: 550, aUm: 20, dUm: 100, N: 2, L: 1.5 };

const lam = (i: SlitInput) => i.lambdaNm * 1e-9;
const aM = (i: SlitInput) => i.aUm * 1e-6;
const dM = (i: SlitInput) => i.dUm * 1e-6;

/** Overall width of the illuminated aperture (m): from the first slit's edge to the last slit's edge. */
export const apertureSize = (i: SlitInput) => (i.N - 1) * (i.N > 1 ? dM(i) : 0) + aM(i);
/** Fresnel number D²/(λL): the far-field model needs this to be small. */
export const fresnelNumber = (i: SlitInput) => apertureSize(i) ** 2 / (lam(i) * i.L);

export function validateSlits(raw: unknown): Validated<SlitInput> {
  if (!isObject(raw)) return { ok: false, errors: ["The slit settings are missing."] };
  const L = SLIT_LIMITS;
  const errors: string[] = [];
  if (!finite(raw.lambdaNm) || raw.lambdaNm < L.minLambda || raw.lambdaNm > L.maxLambda) errors.push(`Wavelength must be between ${L.minLambda} and ${L.maxLambda} nm (visible light).`);
  if (!finite(raw.aUm) || raw.aUm < L.minA || raw.aUm > L.maxA) errors.push(`Slit width must be between ${L.minA} and ${L.maxA} µm.`);
  if (!finite(raw.N) || !Number.isInteger(raw.N) || raw.N < L.minN || raw.N > L.maxN) errors.push(`The number of slits must be a whole number from ${L.minN} to ${L.maxN}.`);
  if (!finite(raw.L) || raw.L < L.minL || raw.L > L.maxL) errors.push(`Screen distance must be between ${L.minL} and ${L.maxL} m.`);
  const multi = finite(raw.N) && raw.N > 1;
  if (multi && (!finite(raw.dUm) || raw.dUm < L.minD || raw.dUm > L.maxD)) errors.push(`Slit separation must be between ${L.minD} and ${L.maxD} µm.`);
  if (!multi && !finite(raw.dUm)) errors.push("The slit separation must be a number (it is not used for one slit).");
  if (errors.length) return { ok: false, errors };
  const v: SlitInput = { lambdaNm: raw.lambdaNm as number, aUm: raw.aUm as number, dUm: raw.dUm as number, N: raw.N as number, L: raw.L as number };
  if (v.N > 1 && v.aUm >= v.dUm) return { ok: false, errors: ["Each slit must be narrower than the separation between slits (a < d), otherwise the slits overlap."] };
  if (v.N > 1 && v.dUm * 1e-6 <= lam(v)) return { ok: false, errors: ["The slit separation must be larger than the wavelength, or there would be no interference maxima other than the central one."] };
  if (v.aUm * 1e-6 < lam(v) * 0.5) return { ok: false, errors: ["A slit narrower than half a wavelength is outside this scalar-diffraction model."] };
  const F = fresnelNumber(v);
  if (F > L.maxFresnel) return { ok: false, errors: [`The screen is too close for the far-field (Fraunhofer) model: the Fresnel number D²/(λL) = ${F.toPrecision(2)} must not exceed ${L.maxFresnel}. Move the screen at least ${(apertureSize(v) ** 2 / (lam(v) * L.maxFresnel)).toPrecision(2)} m away or use narrower slits.`] };
  return { ok: true, value: v };
}

const sinc = (x: number) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x);
/** [sin(Nγ)/(N sin γ)]²; exactly 1 at the principal maxima. */
function arrayFactor(N: number, gamma: number): number {
  const s = Math.sin(gamma);
  if (Math.abs(s) < 1e-9) return 1;
  const r = Math.sin(N * gamma) / (N * s);
  return r * r;
}
/** Relative intensity I/I₀ at sinθ (|sinθ| < 1). */
export function intensityAtSin(i: SlitInput, sinTheta: number): number {
  const beta = (Math.PI * aM(i) * sinTheta) / lam(i);
  const env = sinc(beta) ** 2;
  if (i.N === 1) return env;
  return env * arrayFactor(i.N, (Math.PI * dM(i) * sinTheta) / lam(i));
}
export const intensityAtAngle = (i: SlitInput, thetaRad: number) => intensityAtSin(i, Math.sin(thetaRad));
export const sinAtScreen = (i: SlitInput, y: number) => Math.sin(Math.atan2(y, i.L));
export const intensityAtScreen = (i: SlitInput, y: number) => intensityAtSin(i, sinAtScreen(i, y));
/** Diffraction envelope alone, sinc²β. */
export const envelopeAtSin = (i: SlitInput, sinTheta: number) => sinc((Math.PI * aM(i) * sinTheta) / lam(i)) ** 2;

/** Path difference (in wavelengths) between light from adjacent slits arriving at screen height y: d sinθ/λ. */
export function pathDifferenceWavelengths(i: SlitInput, y: number): number { return (dM(i) * sinAtScreen(i, y)) / lam(i); }

export interface SlitSummary {
  /** Highest interference order that exists (d sinθ = mλ needs |m| ≤ d/λ, and < d/λ so that θ < 90°). */
  maxOrder: number;
  /** Orders m > 0 that exist and are visible. */
  orders: Array<{ m: number; sinTheta: number; thetaDeg: number; y: number; missing: boolean; intensity: number }>;
  /** Small-angle fringe spacing λL/d (m); null for one slit. */
  fringeSpacing: number | null;
  /** Exact distance between the central and first-order maxima (m); null if there is no first order. */
  firstOrderY: number | null;
  /** Half-width of the central diffraction maximum on the screen, to the first minimum (m); null if a < λ (no minimum exists). */
  centralHalfWidth: number | null;
  /** Orders of the interference pattern that fall on diffraction minima ("missing orders"). */
  missingOrders: number[];
  /** Full angular distance between the central maximum and its first zero in the array factor λ/(N d) (rad, small-angle), null for N = 1. */
  principalHalfWidth: number | null;
  /** Number of interference fringes inside the central diffraction maximum (N ≥ 2). */
  fringesInCentral: number | null;
  /** Subsidiary maxima between principal maxima: N − 2 (N ≥ 2). */
  secondaryMaxima: number | null;
  fresnel: number;
}
const MISSING_TOL = 1e-6;
export function summarizeSlits(i: SlitInput): SlitSummary {
  const lambda = lam(i);
  const a = aM(i);
  const d = dM(i);
  const maxOrder = i.N > 1 ? Math.ceil(d / lambda) - 1 : 0;
  const ratio = d / a;
  const isMissing = (m: number) => { const k = (m * a) / d; return i.N > 1 && k >= 1 - MISSING_TOL && Math.abs(k - Math.round(k)) < MISSING_TOL; };
  const orders: SlitSummary["orders"] = [];
  for (let m = 1; m <= maxOrder; m++) {
    const sinTheta = (m * lambda) / d;
    const theta = Math.asin(sinTheta);
    orders.push({ m, sinTheta, thetaDeg: (theta * 180) / Math.PI, y: i.L * Math.tan(theta), missing: isMissing(m), intensity: intensityAtSin(i, sinTheta) });
  }
  const missingOrders = orders.filter((o) => o.missing).map((o) => o.m);
  const firstMin = lambda / a < 1 ? Math.asin(lambda / a) : null;
  void ratio;
  const central = firstMin === null ? null : i.L * Math.tan(firstMin);
  return {
    maxOrder, orders,
    fringeSpacing: i.N > 1 ? (lambda * i.L) / d : null,
    firstOrderY: orders.length ? orders[0].y : null,
    centralHalfWidth: central,
    missingOrders,
    principalHalfWidth: i.N > 1 ? lambda / (i.N * d) : null,
    fringesInCentral: i.N > 1 && firstMin !== null ? countFringesInCentral(i, firstMin) : null,
    secondaryMaxima: i.N > 1 ? i.N - 2 : null,
    fresnel: fresnelNumber(i),
  };
}
/** Interference maxima strictly inside the central diffraction peak, counting the central one: 2·floor(m*) + 1 with m* = d/a (a missing order at the edge is not inside). */
function countFringesInCentral(i: SlitInput, firstMinRad: number): number {
  const d = dM(i);
  const lambda = lam(i);
  const mStar = (d * Math.sin(firstMinRad)) / lambda; // = d/a
  const inside = Math.ceil(mStar - MISSING_TOL) - 1;
  return 2 * Math.max(0, Math.min(inside, Math.ceil(d / lambda) - 1)) + 1;
}

/** Sample the pattern across the screen from −yMax to +yMax. */
export function samplePattern(i: SlitInput, yMax: number, n = 601): Array<{ y: number; I: number; envelope: number }> {
  const out: Array<{ y: number; I: number; envelope: number }> = [];
  for (let k = 0; k < n; k++) {
    const y = -yMax + (2 * yMax * k) / (n - 1);
    const s = sinAtScreen(i, y);
    out.push({ y, I: intensityAtSin(i, s), envelope: envelopeAtSin(i, s) });
  }
  return out;
}
/** A screen half-width that shows the central maximum and a few orders, but never beyond ±1 m·L-independent limits. */
export function defaultScreenHalfWidth(i: SlitInput): number {
  const s = summarizeSlits(i);
  const wanted = i.N === 1 ? 3 * (s.centralHalfWidth ?? 0.01) : Math.max(4.5 * (s.fringeSpacing ?? 0), 1.2 * (s.centralHalfWidth ?? 0));
  const cap = i.L * Math.tan(Math.asin(Math.min(0.9, (SLIT_LIMITS.maxLambda * 1e-9) / aM(i) * 3)));
  return Math.max(1e-4, Math.min(wanted, cap, 0.5 * i.L));
}

/** The first-order angle for each of a few wavelengths: the dispersion of a grating. */
export function dispersion(i: SlitInput, lambdasNm: number[]): Array<{ lambdaNm: number; thetaDeg: number | null; y: number | null }> {
  return lambdasNm.map((nm) => {
    const s = (nm * 1e-9) / dM(i);
    if (i.N < 2 || s >= 1) return { lambdaNm: nm, thetaDeg: null, y: null };
    const th = Math.asin(s);
    return { lambdaNm: nm, thetaDeg: (th * 180) / Math.PI, y: i.L * Math.tan(th) };
  });
}

/** Approximate sRGB for a visible wavelength, for drawing only (the intensity is the physics; the colour is a display aid). */
export function wavelengthColor(nm: number): string {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; } else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; } else if (nm < 645) { r = 1; g = -(nm - 645) / 65; } else { r = 1; }
  const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1;
  const c = (v: number) => Math.round(255 * Math.pow(Math.max(0, v) * f, 0.8));
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}
