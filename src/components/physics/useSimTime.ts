import { useRef, useState } from "react";

/**
 * The simulation time shown on a page. It lives in local state so that animation frames do not re-validate and re-save the whole
 * tool state sixty times a second; the value is written to the saved inputs when the user stops (scrub, pause, end) and at most
 * four times a second during playback. A time that arrives from outside (an opened analysis, a reset) replaces the local value.
 */
export function useSimTime(saved: number, tEnd: number, commit: (t: number) => void) {
  const [t, setT] = useState(saved);
  const [seen, setSeen] = useState(saved);
  const lastCommit = useRef(0);
  if (!Object.is(saved, seen)) { setSeen(saved); setT(saved); }
  const clamped = Number.isFinite(t) ? Math.min(Math.max(t, 0), Math.max(tEnd, 0)) : 0;
  const set = (next: number, final = true) => {
    setT(next);
    const now = performance.now();
    if (final || now - lastCommit.current > 250) {
      lastCommit.current = now;
      setSeen(next);
      commit(next);
    }
  };
  return [clamped, set] as const;
}
