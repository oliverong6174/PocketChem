import { useEffect, useRef, useState } from "react";
import { advanceClock } from "../../utils/physics/simClock";

/** True when the user asks the system to reduce motion. Playback then steps instead of animating continuously. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    query.addEventListener?.("change", apply);
    return () => query.removeEventListener?.("change", apply);
  }, []);
  return reduced;
}

/**
 * Drives a simulation time with requestAnimationFrame. Simulation time advances by the measured wall-clock interval times a
 * rate (see utils/physics/simClock), so speed does not depend on React's render frequency or the display refresh rate. The loop
 * exists only while playing: a paused simulation schedules no frames, and the effect cancels any pending frame on cleanup.
 */
export function useSimClock({ t, tEnd, rate, onTime }: { t: number; tEnd: number; rate: number; onTime: (t: number, final: boolean) => void }) {
  const [playing, setPlaying] = useState(false);
  const latest = useRef({ t, tEnd, rate, onTime });
  useEffect(() => { latest.current = { t, tEnd, rate, onTime }; });

  useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const { t: base, tEnd: end, rate: r, onTime: emit } = latest.current;
      const step = advanceClock(base, now - last, r, end);
      last = now;
      emit(step.t, step.done);
      if (step.done) { setPlaying(false); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return {
    playing,
    play: () => {
      if (tEnd <= 0) return;
      if (latest.current.t >= tEnd) { latest.current.t = 0; onTime(0, false); }
      setPlaying(true);
    },
    pause: () => setPlaying(false),
  };
}

/** Measures a container's width (for diagrams that lay themselves out in real pixels). */
export function useContainerWidth(initial = 640) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const apply = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    apply();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
