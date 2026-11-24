import { useId } from "react";

/** A labelled native select for whole numbers or short ids. Native controls keep keyboard and touch behaviour. */
export function SelectField<T extends string | number>({ label, value, options, onChange, hint }: {
  label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; hint?: string;
}) {
  const id = useId();
  return (
    <div className="chem-select">
      <label htmlFor={id}>{label}</label>
      <select
        aria-describedby={hint ? `${id}-hint` : undefined}
        id={id}
        onChange={(event) => { const raw = event.target.value; const match = options.find((o) => String(o.value) === raw); if (match) onChange(match.value); }}
        value={String(value)}
      >
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
      {hint ? <p className="gc-field-hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

/** A range slider with a visible value, used for thresholds and viewpoint angles. */
export function RangeField({ label, value, min, max, step = 1, onChange, unit, valueText }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; unit?: string; valueText?: string;
}) {
  const id = useId();
  return (
    <div className="gc-field">
      <label htmlFor={id}>{label}: <strong>{valueText ?? value}{unit ?? ""}</strong></label>
      <input aria-valuetext={`${valueText ?? value}${unit ?? ""}`} id={id} max={max} min={min} onChange={(e) => onChange(Number(e.target.value))} step={step} type="range" value={value} />
    </div>
  );
}
