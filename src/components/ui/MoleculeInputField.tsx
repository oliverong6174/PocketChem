import { useState, type ReactNode } from "react";
import { MoleculeInputError } from "../../utils/moleculeInput";
import { resolveWithFallback, type FallbackReader, type ResolvedInput } from "../../utils/moleculeInputFallback";
import { Icon } from "./Icon";

/** See src/utils/moleculeInputFallback.ts for how input is resolved. */

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ok"; result: ResolvedInput }
  | { kind: "error"; message: string; code: string };

export function MoleculeInputField({
  label = "Name or SMILES",
  help = "A common name (acetone), an IUPAC name, or SMILES. Stereochemistry is used exactly as written; none is added.",
  placeholder = "e.g. methylcyclohexane or C[C@H]1CCCCC1",
  value,
  onChange,
  onResolved,
  fallback,
  maxComponents = 1,
  disabled = false,
  className = "",
  submitLabel = "Load",
  extra,
}: {
  label?: string;
  help?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  /** Called with the resolved structure. Return false if the tool then rejects it (the message is shown by the tool). */
  onResolved: (result: ResolvedInput) => boolean | void;
  fallback?: FallbackReader;
  maxComponents?: number;
  disabled?: boolean;
  className?: string;
  submitLabel?: string;
  extra?: ReactNode;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit() {
    const text = value.trim();
    if (!text) {
      setStatus({ kind: "error", message: "Enter a chemical name or a SMILES string first.", code: "empty" });
      return;
    }
    setStatus({ kind: "busy" });
    try {
      const result = await resolveWithFallback(text, { maxComponents, fallback });
      const accepted = onResolved(result);
      setStatus(accepted === false ? { kind: "idle" } : { kind: "ok", result });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "That input could not be read.",
        code: error instanceof MoleculeInputError ? error.code : "error",
      });
    }
  }

  return (
    <div className={`mol-input ${className}`.trim()}>
      <form
        className="mol-input-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="mol-input-label">
          <span>{label}</span>
          <input
            aria-describedby="mol-input-help mol-input-status"
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => {
              onChange(event.target.value);
              if (status.kind !== "idle" && status.kind !== "busy") setStatus({ kind: "idle" });
            }}
            placeholder={placeholder}
            spellCheck={false}
            type="text"
            value={value}
          />
        </label>
        <button className="secondary-button" disabled={disabled || status.kind === "busy"} type="submit">
          {submitLabel}
        </button>
        {value ? (
          <button
            aria-label="Clear the name or SMILES field"
            className="ghost-button"
            onClick={() => {
              onChange("");
              setStatus({ kind: "idle" });
            }}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </form>
      <p className="mol-input-help" id="mol-input-help">{help}</p>
      <div className="mol-input-status" id="mol-input-status" aria-live="polite">
        {status.kind === "busy" ? (
          <p className="mol-status is-busy"><span aria-hidden="true" className="loading-spinner" /> Looking that up…</p>
        ) : null}
        {status.kind === "ok" ? (
          <p className={`mol-status is-ok source-${status.result.source}`}>
            <Icon name="check" size={16} />
            <span>
              <strong>{status.result.label}</strong>
              <span className="mol-status-sub">, {status.result.provenance}</span>
              {status.result.notes.map((note) => (
                <span className="mol-status-note" key={note}>{note}</span>
              ))}
            </span>
          </p>
        ) : null}
        {status.kind === "error" ? (
          <p className={`mol-status is-error code-${status.code}`} role="alert">
            <Icon name={status.code === "ambiguous" ? "warning" : "error"} size={16} />
            <span>{status.message}</span>
          </p>
        ) : null}
      </div>
      {extra}
    </div>
  );
}
