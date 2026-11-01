type SaveFormProps = {
  name: string;
  busy: boolean;
  onChange: (name: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

/** The small inline form shown by a page's "Save Analysis" button. */
export function SaveAnalysisForm({ name, busy, onChange, onSubmit, onCancel }: SaveFormProps) {
  return (
    <form
      className="synthesis-save-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label>
        Name
        <input type="text" value={name} maxLength={120} onChange={(event) => onChange(event.target.value)} autoFocus />
      </label>
      <button className="primary-button" type="submit" disabled={busy || !name.trim()}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button className="secondary-button" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

type PromptProps = {
  /** Render inside an existing card instead of as its own card. */
  embedded?: boolean;
  name: string;
  canSaveFirst: boolean;
  busy: boolean;
  onChoose: (choice: "replace" | "save-first" | "cancel") => void;
};

/** Asked before a saved analysis replaces work that is not itself saved as an analysis. */
export function ReplaceWorkspacePrompt({ embedded = false, name, canSaveFirst, busy, onChoose }: PromptProps) {
  return (
    <div className={embedded ? "workspace-notice workspace-notice-embedded" : "card workspace-notice"} role="alertdialog" aria-label="Replace the current workspace?">
      <ul>
        <li className="workspace-notice-warn">
          Opening “{name}” replaces the structures and results now on this page, which are not saved as an analysis.
        </li>
      </ul>
      <div className="synthesis-actions">
        {canSaveFirst && (
          <button className="primary-button" type="button" disabled={busy} onClick={() => onChoose("save-first")}>
            Save current, then open
          </button>
        )}
        <button className="secondary-button" type="button" onClick={() => onChoose("replace")}>
          Replace without saving
        </button>
        <button className="secondary-button" type="button" onClick={() => onChoose("cancel")}>
          Cancel
        </button>
      </div>
    </div>
  );
}
