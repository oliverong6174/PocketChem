/**
 * Simulation clock arithmetic (pure). Simulation time is advanced by the measured wall-clock interval between animation
 * frames, scaled by a rate, so playback speed never depends on how often React renders or on the display's refresh rate.
 */

/** A single frame is never allowed to advance more than this much wall time (ms): a hidden tab or a long pause must not make the simulation jump. */
export const MAX_FRAME_MS = 100;

export interface ClockStep { t: number; done: boolean }

/** Advance simulated time `t` by `dtMs` of wall time at `rate` simulated seconds per wall second, stopping at `tEnd`. */
export function advanceClock(t: number, dtMs: number, rate: number, tEnd: number): ClockStep {
  if (!Number.isFinite(t) || !Number.isFinite(dtMs) || !Number.isFinite(rate) || !Number.isFinite(tEnd) || tEnd <= 0) return { t: 0, done: true };
  const dt = Math.min(Math.max(dtMs, 0), MAX_FRAME_MS) / 1000;
  const next = t + dt * Math.max(rate, 0);
  return next >= tEnd ? { t: tEnd, done: true } : { t: Math.max(next, 0), done: false };
}

export type SpeedChoice = "quarter" | "real" | "fast" | "fit";
export const SPEED_CHOICES: readonly SpeedChoice[] = ["quarter", "real", "fast", "fit"];
/** How long the whole motion takes when the "fit" speed is chosen (wall seconds). */
export const FIT_SECONDS = 6;

/** Simulated seconds per wall second for a speed choice and a motion that lasts `tEnd` simulated seconds. */
export function rateFor(speed: SpeedChoice, tEnd: number): number {
  if (speed === "quarter") return 0.25;
  if (speed === "real") return 1;
  if (speed === "fast") return 4;
  return tEnd > 0 ? tEnd / FIT_SECONDS : 1;
}

/** Wall-clock seconds the whole motion takes at a speed choice. */
export function playbackSeconds(speed: SpeedChoice, tEnd: number): number {
  const r = rateFor(speed, tEnd);
  return r > 0 ? tEnd / r : 0;
}
