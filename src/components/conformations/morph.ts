import type { ChairConformer } from "../../utils/conformations/chair";

type Vec3 = { x: number; y: number; z: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (p: Vec3, q: Vec3, t: number): Vec3 => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t), z: lerp(p.z, q.z, t) });

/** Smooth start and finish so the two real chairs are the visually longest-held frames. */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Straight-line interpolation between two COMPUTED chairs (A and B), used only to animate a flip.
 * The intermediate frames are a visual cue, not a model of the ring-flip pathway (no half-chair or
 * twist-boat geometry is calculated); the page says so while it plays and draws no axial/equatorial
 * labels during the transition. t = 0 returns `from`, t = 1 returns `to` exactly.
 */
export function morphConformer(from: ChairConformer, to: ChairConformer, t: number): ChairConformer {
  if (t <= 0) return from;
  if (t >= 1) return to;
  return {
    ...from,
    ringPoints: from.ringPoints.map((point, index) => lerp3(point, to.ringPoints[index], t)),
    substituents: from.substituents.map((item, index) => ({ ...item, point: lerp3(item.point, to.substituents[index].point, t) })),
  };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
