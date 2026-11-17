import { useId, type ReactNode } from "react";
import { NumberField } from "../generalChem/shared";
import { ParamSlider } from "../physics/sim";
import { COL, INK } from "./cellConst23";
import "../../styles/bio23.css";

/** Small shared pieces for the Stage 23 Cellular Biology and Physiology tools: SVG helpers and form controls. */


export const Txt = ({ x, y, children, size = 13, bold = false, anchor = "middle", fill = INK, italic = false }: { x: number; y: number; children: ReactNode; size?: number; bold?: boolean; anchor?: "start" | "middle" | "end"; fill?: string; italic?: boolean }) => (
  <text fill={fill} fontFamily="system-ui, sans-serif" fontSize={size} fontStyle={italic ? "italic" : "normal"} fontWeight={bold ? 700 : 500} textAnchor={anchor} x={x} y={y}>{children}</text>
);

/** A selectable SVG group (click, Enter or Space). */
export function SelG({ id, label, selected, onSelect, children }: { id: string; label: string; selected: string | null; onSelect: (id: string | null) => void; children: ReactNode }) {
  const on = selected === id;
  return (
    <g aria-label={label} aria-pressed={on} className="c23-sel" data-component={id} onClick={(e) => { e.stopPropagation(); onSelect(on ? null : id); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(on ? null : id); } }} role="button" tabIndex={0}>
      {children}
    </g>
  );
}

export function ArrowMarkers({ prefix }: { prefix: string }) {
  const head = (name: string, color: string) => (
    <marker id={`${prefix}-${name}`} markerHeight="8" markerWidth="8" orient="auto" refX="6.5" refY="4" viewBox="0 0 8 8"><path d="M0 0.5 L7.5 4 L0 7.5 z" fill={color} /></marker>
  );
  return <defs>{head("ok", COL.ok)}{head("bad", COL.bad)}{head("ink", INK)}{head("atp", COL.atp)}{head("blue", COL.na)}</defs>;
}

/** Radio-less select row with a visible label. */
export function SelectRow<T extends string>({ label, value, options, onChange, id }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void; id?: string }) {
  return (
    <label className="bio-select-row">
      <span>{label}</span>
      <select aria-label={label} data-testid={id} onChange={(e) => onChange(e.target.value as T)} value={value}>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
    </label>
  );
}
export function CheckRow({ label, checked, onChange, id }: { label: string; checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  return <label className="bio-check"><input checked={checked} data-testid={id} onChange={(e) => onChange(e.target.checked)} type="checkbox" /> {label}</label>;
}

/** A slider with its typed number field. */
export function Param({ label, unit, value, min, max, step, onChange, format, error, testId }: { label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string; error?: string | null; testId?: string }) {
  const fmt = format ?? ((v: number) => `${Number(v.toPrecision(4))} ${unit}`);
  const id = useId();
  return (
    <div className="c23-param" data-testid={testId} id={id}>
      <ParamSlider format={fmt} label={label} max={max} min={min} onChange={onChange} step={step} value={value} />
      <NumberField error={error ?? null} label={label} onChange={onChange} unit={unit} value={value} />
    </div>
  );
}

/** Log-scale slider for concentrations: the slider works on log10, the field on the value. */
export function LogParam({ label, unit, value, lo, hi, onChange, error, testId }: { label: string; unit: string; value: number; lo: number; hi: number; onChange: (v: number) => void; error?: string | null; testId?: string }) {
  const safe = Number.isFinite(value) && value > 0 ? value : lo;
  return (
    <div className="c23-param" data-testid={testId}>
      <ParamSlider format={(v) => `${Number((10 ** v).toPrecision(3))} ${unit}`} label={label} max={Math.log10(hi)} min={Math.log10(lo)} onChange={(v) => onChange(Number((10 ** v).toPrecision(4)))} step={0.01} value={Math.log10(safe)} />
      <NumberField error={error ?? null} label={label} onChange={onChange} unit={unit} value={value} />
    </div>
  );
}

