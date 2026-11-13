import { useEffect, useRef, useState } from "react";

/** True while the viewport is at most `maxWidth` px wide (phones): used to offer a focused diagram view instead of a tiny full one. */
export function useNarrow(maxWidth = 600): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return narrow;
}

/** Upper-cases and removes spaces/line breaks as the user types; anything else is left for the validator to report. */
export const cleanSeq = (text: string) => text.toUpperCase().replace(/\s+/g, "");

export type PlaySpeed = "slow" | "normal" | "fast";
const SPEED_MS: Record<PlaySpeed, number> = { slow: 1200, normal: 650, fast: 220 };

/** Advances a step counter on a timer while playing; stops at the last step. The timer exists only while playing. */
export function useStepPlayer(step: number, max: number, onStep: (next: number) => void) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaySpeed>("normal");
  const latest = useRef({ step, max, onStep });
  useEffect(() => { latest.current = { step, max, onStep }; });
  useEffect(() => {
    if (!playing) return undefined;
    const id = window.setInterval(() => {
      const { step: s, max: m, onStep: go } = latest.current;
      if (s >= m) { setPlaying(false); return; }
      go(s + 1);
    }, SPEED_MS[speed]);
    return () => window.clearInterval(id);
  }, [playing, speed]);
  return { playing: playing && step < max, speed, setSpeed, play: () => { if (step >= max) onStep(0); setPlaying(true); }, pause: () => setPlaying(false) };
}

