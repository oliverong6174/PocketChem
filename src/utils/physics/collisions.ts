/**
 * One-dimensional collisions of two bodies (pure; no React).
 *
 * Model: body A (left) and body B (right) are rigid boxes of fixed width BODY_WIDTH moving on a frictionless line. They move
 * at constant velocity until their faces touch; the collision is idealised as instantaneous, with the velocities after it fixed by
 *   conservation of momentum:  mA·vA + mB·vB = mA·vA′ + mB·vB′
 *   Newton's restitution law:  vB′ − vA′ = −e·(vB − vA)         (0 ≤ e ≤ 1; e = 1 elastic, e = 0 perfectly inelastic)
 * which give
 *   vA′ = (mA·vA + mB·vB − mB·e·(vA − vB)) / (mA + mB),   vB′ = (mA·vA + mB·vB + mA·e·(vA − vB)) / (mA + mB).
 * A collision happens only if the bodies are closing on each other (vA > vB); otherwise they never touch and nothing is invented.
 * No contact-force history is modelled: the impulse (change in momentum) is exact, and an average force is reported only if the
 * user supplies a collision duration.
 */

export const BODY_WIDTH = 1;

export const COLLISION_LIMITS = { minMass: 0.01, maxMass: 1000, maxV: 50, maxX: 100, minSpan: 0.5, maxSpan: 200, minDt: 1e-6, maxDt: 10 } as const;

export interface CollisionInput {
  mA: number;
  mB: number;
  vA: number;
  vB: number;
  /** Coefficient of restitution, 0…1. */
  e: number;
  /** Centre positions (m); A must be to the left of B with a non-negative gap between their faces. */
  xA: number;
  xB: number;
  /** Time (s) shown after the collision (or in total when no collision happens). */
  span: number;
  /** Optional collision duration (s) used only to turn the impulse into an average force. */
  contactTime: number | null;
}

export const DEFAULT_COLLISION_INPUT: CollisionInput = { mA: 2, mB: 3, vA: 4, vB: -1, e: 1, xA: -4, xB: 3, span: 4, contactTime: null };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function validateCollisionInput(raw: unknown): Validated<CollisionInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["The collision settings are missing."] };
  const L = COLLISION_LIMITS;
  const num = (v: unknown, label: string, lo: number, hi: number, unit: string) => { if (!finite(v) || v < lo || v > hi) errors.push(`${label} must be a number between ${lo} and ${hi}${unit ? ` ${unit}` : ""}.`); };
  num(raw.mA, "Mass of A", L.minMass, L.maxMass, "kg");
  num(raw.mB, "Mass of B", L.minMass, L.maxMass, "kg");
  num(raw.vA, "Velocity of A", -L.maxV, L.maxV, "m/s");
  num(raw.vB, "Velocity of B", -L.maxV, L.maxV, "m/s");
  num(raw.e, "Coefficient of restitution", 0, 1, "");
  num(raw.xA, "Position of A", -L.maxX, L.maxX, "m");
  num(raw.xB, "Position of B", -L.maxX, L.maxX, "m");
  num(raw.span, "Time shown", L.minSpan, L.maxSpan, "s");
  if (raw.contactTime !== null) num(raw.contactTime, "Collision duration", L.minDt, L.maxDt, "s");
  if (finite(raw.xA) && finite(raw.xB) && raw.xB - raw.xA - BODY_WIDTH < 0) errors.push(`A must start to the left of B and the bodies cannot overlap: their centres must be at least ${BODY_WIDTH} m apart.`);
  if (errors.length) return { ok: false, errors };
  const r = raw as Record<string, number | null>;
  return { ok: true, value: { mA: r.mA as number, mB: r.mB as number, vA: r.vA as number, vB: r.vB as number, e: r.e as number, xA: r.xA as number, xB: r.xB as number, span: r.span as number, contactTime: r.contactTime } };
}

export interface CollisionResult {
  collides: boolean;
  /** Why there is no collision, when there is none. */
  reason: string;
  /** Time of contact (s), positions of the centres at contact. */
  tc: number | null;
  xAc: number | null;
  xBc: number | null;
  vA2: number;
  vB2: number;
  pTotal: number;
  vcm: number;
  KEbefore: number;
  KEafter: number;
  lossJ: number;
  lossFraction: number;
  /** Impulse on B (= −impulse on A), N·s, and the momentum changes. */
  J: number;
  dpA: number;
  dpB: number;
  averageForce: number | null;
  kind: "elastic" | "perfectly inelastic" | "partially inelastic";
  tEnd: number;
}

export function collisionKind(e: number): CollisionResult["kind"] {
  return e === 1 ? "elastic" : e === 0 ? "perfectly inelastic" : "partially inelastic";
}

export function solveCollision(c: CollisionInput): CollisionResult {
  const M = c.mA + c.mB;
  const pTotal = c.mA * c.vA + c.mB * c.vB;
  const closing = c.vA - c.vB;
  const gap = c.xB - c.xA - BODY_WIDTH;
  const collides = closing > 0;
  const vA2 = collides ? (pTotal - c.mB * c.e * closing) / M : c.vA;
  const vB2 = collides ? (pTotal + c.mA * c.e * closing) / M : c.vB;
  const tc = collides ? gap / closing : null;
  const KEbefore = 0.5 * c.mA * c.vA * c.vA + 0.5 * c.mB * c.vB * c.vB;
  const KEafter = 0.5 * c.mA * vA2 * vA2 + 0.5 * c.mB * vB2 * vB2;
  const dpA = c.mA * (vA2 - c.vA);
  const dpB = c.mB * (vB2 - c.vB);
  return {
    collides,
    reason: collides ? "" : closing === 0 ? "The bodies have the same velocity, so they never get closer: no collision." : "A is not catching up with B (they are separating or moving apart), so they never touch: no collision.",
    tc,
    xAc: tc === null ? null : c.xA + c.vA * tc,
    xBc: tc === null ? null : c.xB + c.vB * tc,
    vA2, vB2, pTotal, vcm: pTotal / M,
    KEbefore, KEafter, lossJ: KEbefore - KEafter, lossFraction: KEbefore === 0 ? 0 : (KEbefore - KEafter) / KEbefore,
    J: dpB, dpA, dpB,
    averageForce: collides && c.contactTime !== null ? Math.abs(dpB) / c.contactTime : null,
    kind: collisionKind(c.e),
    tEnd: (tc ?? 0) + c.span,
  };
}

export interface CollisionState {
  t: number;
  xA: number; xB: number;
  vA: number; vB: number;
  pA: number; pB: number; p: number;
  KE: number;
  /** Whether the collision has already happened at this time. */
  after: boolean;
}

export function stateAt(c: CollisionInput, r: CollisionResult, tIn: number): CollisionState {
  const t = Math.min(Math.max(Number.isFinite(tIn) ? tIn : 0, 0), r.tEnd);
  const after = r.collides && t >= (r.tc as number);
  let xA: number; let xB: number; let vA: number; let vB: number;
  if (!after) { xA = c.xA + c.vA * t; xB = c.xB + c.vB * t; vA = c.vA; vB = c.vB; } else {
    const dt = t - (r.tc as number);
    xA = (r.xAc as number) + r.vA2 * dt; xB = (r.xBc as number) + r.vB2 * dt; vA = r.vA2; vB = r.vB2;
  }
  const pA = c.mA * vA;
  const pB = c.mB * vB;
  return { t, xA, xB, vA, vB, pA, pB, p: pA + pB, KE: 0.5 * c.mA * vA * vA + 0.5 * c.mB * vB * vB, after };
}

/** Samples for the graphs, always including the instant of contact (just before and at it, so the jump is drawn as a step). */
export function traceCollision(c: CollisionInput, r: CollisionResult, n = 160): CollisionState[] {
  const times = Array.from({ length: n + 1 }, (_, i) => (r.tEnd * i) / n);
  if (r.collides && r.tc! > 0 && r.tc! < r.tEnd) times.push(r.tc! - 1e-9 * r.tEnd, r.tc!);
  times.sort((a, b) => a - b);
  return times.map((t) => stateAt(c, r, t));
}
