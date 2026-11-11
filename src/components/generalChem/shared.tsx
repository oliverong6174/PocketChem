import { useId, useMemo, useState, type ReactNode } from "react";
import { Callout, Panel, Segmented } from "../ui/primitives";
import { evaluatePredict, type PredictScenario, type Trend } from "../../utils/generalChem/predict";

/** A number field that keeps what the user typed (so "1e-" or "" can be edited) and reports numbers (NaN when unreadable). */
export function NumberField({ label, unit, value, onChange, error, hint, step, disabled }: {
  label: string; unit?: string; value: number; onChange: (value: number) => void; error?: string | null; hint?: string; step?: number; disabled?: boolean;
}) {
  const id = useId();
  const show = (v: number) => (Number.isFinite(v) ? String(Number(v.toPrecision(10))) : "");
  const [text, setText] = useState(show(value));
  const [seen, setSeen] = useState(value);
  if (!Object.is(value, seen)) {
    // follow external changes (slider, presets, restored analysis) without fighting the user's typing
    setSeen(value);
    const typed = text.trim() === "" ? NaN : Number(text);
    if (!Object.is(typed, value)) setText(show(value));
  }
  return (
    <div className={`gc-field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}{unit ? <span className="gc-unit"> ({unit})</span> : null}</label>
      <input
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        id={id}
        inputMode="decimal"
        onChange={(event) => { setText(event.target.value); onChange(event.target.value.trim() === "" ? NaN : Number(event.target.value)); }}
        step={step}
        type="text"
        value={text}
      />
      {error ? <p className="gc-field-error" id={`${id}-err`} role="alert">{error}</p> : hint ? <p className="gc-field-hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

/** A plain text field (species names, equations). */
export function TextField({ label, value, onChange, error, hint, maxLength = 300, mono }: {
  label: string; value: string; onChange: (value: string) => void; error?: string | null; hint?: string; maxLength?: number; mono?: boolean;
}) {
  const id = useId();
  return (
    <div className={`gc-field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        aria-invalid={error ? true : undefined}
        className={mono ? "gc-mono" : undefined}
        id={id}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        type="text"
        value={value}
      />
      {error ? <p className="gc-field-error" id={`${id}-err`} role="alert">{error}</p> : hint ? <p className="gc-field-hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

export function TextAreaField({ label, value, onChange, error, hint, rows = 7 }: {
  label: string; value: string; onChange: (value: string) => void; error?: string | null; hint?: string; rows?: number;
}) {
  const id = useId();
  return (
    <div className={`gc-field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <textarea
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        aria-invalid={error ? true : undefined}
        className="gc-mono"
        id={id}
        maxLength={20000}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        spellCheck={false}
        value={value}
      />
      {error ? <p className="gc-field-error" id={`${id}-err`} role="alert">{error}</p> : hint ? <p className="gc-field-hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

// ---- predict, then observe (shared by all three tools) --------------------------------------------------------------------------------

export function GcPredictPanel<I>({ input, scenarios, onApply }: { input: I; scenarios: PredictScenario<I>[]; onApply: (next: I) => void }) {
  const [index, setIndex] = useState(0);
  const key = `${index}|${JSON.stringify(input)}`;
  const [answer, setAnswer] = useState<{ key: string; guess: Trend } | null>(null);
  const guess = answer?.key === key ? answer.guess : null;
  const scenario = scenarios[Math.min(index, scenarios.length - 1)];
  const outcome = useMemo(() => (guess && scenario ? evaluatePredict(scenario, input) : null), [guess, scenario, input]);
  if (!scenario) return null;
  return (
    <Panel className="gc-predict" subtitle="Commit to an answer first; the model then shows the result for your system." title="Predict, then observe">
      <div className="gc-scenario-pick" role="group" aria-label="Choose a change to predict">
        {scenarios.map((s, i) => (
          <button aria-pressed={i === index} className={i === index ? "secondary-button is-on" : "ghost-button"} key={s.id} onClick={() => setIndex(i)} type="button">{s.change}</button>
        ))}
      </div>
      <p className="gc-question">If you <strong>{scenario.change}</strong>, will <strong>{scenario.quantity}</strong> be higher, lower, or about the same?</p>
      <Segmented<Trend>
        label="Your prediction"
        onChange={(next) => setAnswer({ key, guess: next })}
        options={[{ id: "higher", label: "Higher" }, { id: "lower", label: "Lower" }, { id: "same", label: "About the same" }]}
        value={(guess ?? "") as Trend}
      />
      {guess && !outcome && <Callout tone="warn" title="This change cannot be applied"><p>The change would leave the model's supported range for the current values; adjust the inputs first.</p></Callout>}
      {outcome && (
        <div aria-live="polite" className="gc-reveal">
          <Callout tone={guess === outcome.trend ? "ok" : "warn"} title={guess === outcome.trend ? "Your prediction matches the model" : "Not quite"}>
            <p>{scenario.quantity[0].toUpperCase() + scenario.quantity.slice(1)} goes from <strong>{scenario.format(outcome.before)}</strong> to <strong>{scenario.format(outcome.after)}</strong>: {outcome.trend === "same" ? "about the same" : outcome.trend}.</p>
            <p>{scenario.explain(outcome.before, outcome.after, outcome.trend)}</p>
            <button className="ghost-button" onClick={() => onApply(outcome.afterInput)} type="button">Apply this change to the tool</button>
          </Callout>
        </div>
      )}
    </Panel>
  );
}

/** Small helper: render a list of paragraphs. */
export function Paragraphs({ items }: { items: string[] }): ReactNode {
  return <>{items.map((p) => <p key={p}>{p}</p>)}</>;
}
