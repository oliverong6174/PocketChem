import { useId } from "react";
import { usePrefersReducedMotion } from "./simHooks";
import { Segmented } from "../ui/primitives";
import { rateFor, type SpeedChoice } from "../../utils/physics/simClock";

// Shared simulation pieces for the Physics tools: clock hook, transport controls, a labelled slider and vector arrows. ---------------

const SPEED_LABELS: Record<SpeedChoice, string> = { quarter: "¼×", real: "1×", fast: "4×", fit: "Fit 6 s" };

/** Play / pause / reset, speed, and a time slider. `format` renders the time (with its unit). */
export function SimControls({
  t, tEnd, playing, onPlay, onPause, onReset, onTime, speed, onSpeed, speeds, format, label = "Time", labels, rateOf = rateFor,
}: {
  t: number; tEnd: number; playing: boolean; onPlay: () => void; onPause: () => void; onReset: () => void; onTime: (t: number) => void;
  speed: SpeedChoice; onSpeed: (s: SpeedChoice) => void; speeds: SpeedChoice[]; format: (t: number) => string; label?: string;
  /** Replacement button texts (for tools whose speeds mean something other than real time). */
  labels?: Partial<Record<SpeedChoice, string>>;
  /** Simulated seconds per wall second for a speed (default: real-time multiples). */
  rateOf?: (speed: SpeedChoice, tEnd: number) => number;
}) {
  const reduced = usePrefersReducedMotion();
  const id = useId();
  const disabled = !(tEnd > 0);
  const frac = disabled ? 0 : Math.min(1, Math.max(0, t / tEnd));
  const stepForward = () => onTime(Math.min(tEnd, t + tEnd / 20));
  return (
    <div className="ph-controls" role="group" aria-label="Simulation controls">
      <div className="ph-transport">
        {reduced ? (
          <button className="primary-button" disabled={disabled || t >= tEnd} onClick={stepForward} type="button">Step ▸</button>
        ) : playing ? (
          <button aria-label="Pause" className="primary-button" onClick={onPause} type="button">❚❚ Pause</button>
        ) : (
          <button aria-label={t >= tEnd && !disabled ? "Replay" : "Play"} className="primary-button" disabled={disabled} onClick={onPlay} type="button">{t >= tEnd && !disabled ? "↻ Replay" : "▶ Play"}</button>
        )}
        <button className="secondary-button" disabled={disabled || (t === 0 && !playing)} onClick={onReset} type="button">Reset</button>
        <Segmented<SpeedChoice>
          label="Playback speed"
          onChange={onSpeed}
          options={speeds.map((s) => ({ id: s, label: labels?.[s] ?? SPEED_LABELS[s], title: `Whole motion in ${(rateOf(s, tEnd) > 0 ? tEnd / rateOf(s, tEnd) : 0).toFixed(1)} s of real time` }))}
          value={speed}
        />
      </div>
      <div className="ph-timeline">
        <label htmlFor={`${id}-t`}>{label}</label>
        <input
          aria-valuetext={format(t)}
          disabled={disabled}
          id={`${id}-t`}
          max={1000}
          min={0}
          onChange={(event) => onTime((Number(event.target.value) / 1000) * tEnd)}
          step={1}
          type="range"
          value={Math.round(frac * 1000)}
        />
        <output aria-live="off" className="ph-time-readout" htmlFor={`${id}-t`}>{format(t)}</output>
      </div>
      {reduced ? <p className="ph-note">Your system asks for reduced motion, so the animation is stepped by hand: use Step or drag the slider.</p> : null}
    </div>
  );
}

/** A range slider paired with the value it controls (used next to the numeric field). */
export function ParamSlider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string;
}) {
  const id = useId();
  const ok = Number.isFinite(value);
  return (
    <div className="gc-slider ph-slider">
      <label htmlFor={id}>{label}: <strong>{ok ? format(value) : "—"}</strong></label>
      <input aria-valuetext={ok ? format(value) : undefined} id={id} max={max} min={min} onChange={(e) => onChange(Number(e.target.value))} step={step} type="range" value={ok ? Math.min(max, Math.max(min, value)) : min} />
    </div>
  );
}

/** Arrowhead markers for the vector diagrams. Colours are fixed (ink on paper) so they read the same in light and dark themes. */
export function ArrowDefs({ prefix }: { prefix: string }) {
  const head = (name: string, color: string) => (
    <marker id={`${prefix}-${name}`} markerHeight="8" markerWidth="8" orient="auto-start-reverse" refX="7" refY="4" viewBox="0 0 8 8">
      <path d="M0 0.5 L7.5 4 L0 7.5 z" fill={color} />
    </marker>
  );
  return <defs>{head("v", "#0b6a72")}{head("a", "#b45309")}{head("c", "#475569")}{head("i", "#be123c")}{head("k", "#0f172a")}</defs>;
}

/** A straight arrow from (x1, y1) to (x2, y2) in pixels. Zero-length arrows are not drawn. */
type ArrowProps = { x1: number; y1: number; x2: number; y2: number; kind: "v" | "a" | "c" | "i" | "k"; width?: number; dash?: string; title?: string; prefix: string };
export function Arrow(props: ArrowProps) {
  const { x1, y1, x2, y2, kind, width = 2.6, dash, title, prefix } = props;
  if (Math.hypot(x2 - x1, y2 - y1) < 3) return null;
  const color = { v: "#0b6a72", a: "#b45309", c: "#475569", i: "#be123c", k: "#0f172a" }[kind];
  return (
    <line markerEnd={`url(#${prefix}-${kind})`} stroke={color} strokeDasharray={dash} strokeLinecap="round" strokeWidth={width} x1={x1} x2={x2} y1={y1} y2={y2}>
      {title ? <title>{title}</title> : null}
    </line>
  );
}

