export type WorkspaceNoticeItem = { tone: "info" | "warn"; text: string };

type Props = {
  notices: WorkspaceNoticeItem[];
  /** Shown when work was recovered from a previous session; discards it and clears the page. */
  onDiscard?: () => void;
  discardDisabled?: boolean;
  /** Render inside an existing card instead of as its own card. */
  embedded?: boolean;
};

/** Explains what was recovered, what is a saved snapshot and what could not be saved. */
export default function WorkspaceNotice({ notices, onDiscard, discardDisabled = false, embedded = false }: Props) {
  if (notices.length === 0) return null;
  return (
    <div className={embedded ? "workspace-notice workspace-notice-embedded" : "card workspace-notice"} role="status" aria-live="polite">
      <ul>
        {notices.map((notice) => (
          <li key={notice.text} className={`workspace-notice-${notice.tone}`}>
            {notice.text}
          </li>
        ))}
      </ul>
      {onDiscard && (
        <button className="secondary-button" type="button" disabled={discardDisabled} onClick={onDiscard}>
          Discard recovered work
        </button>
      )}
    </div>
  );
}
