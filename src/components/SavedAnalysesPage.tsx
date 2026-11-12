import { useCallback, useEffect, useState } from "react";
import { getAppAnalysisLibrary, OPENABLE_ANALYSIS_PAGES } from "../utils/persistence/analysisLibraryApp";
import type { LibraryProblem, SavedAnalysisSummary } from "../utils/persistence/analysisLibrary";

const PAGE_LABELS: Record<string, string> = {
  synthesis: "Multi-Step Synthesis",
  properties: "Properties",
  reactions: "Reactions",
  spectroscopy: "Spectroscopy",
  ranking: "Ranking",
  multicatalytic: "Multi-Catalytic Workspace",
  conformations: "Conformations",
  genchem: "Acid–base & titration",
  equilibrium: "Chemical equilibrium",
  kinetics: "Reaction kinetics",
  thermo: "Thermodynamics",
  mechanics: "Mechanics & motion",
  circuits: "DC circuits",
  rc: "RC transient",
  forces: "Forces & Newton's laws",
  energy: "Work & energy",
  collisions: "Momentum & collisions",
};

const SUBJECT_LABELS: Record<string, string> = { organic: "Organic Chemistry", general: "General Chemistry", physics: "Physics" };

const STATUS_LABELS: Record<string, string> = {
  found: "Routes found",
  "found-interrupted": "Search stopped early",
  cancelled: "Search cancelled",
  "no-route-within-budget": "No route within the time limit",
  "no-route-within-bounds": "No route within the search limits",
  complete: "Completed analysis",
  workspace: "Workspace with completed steps",
  "workspace-empty": "Inventory only (no step completed)",
  "forward-found": "Reactions predicted",
  "forward-none": "No supported reaction",
  "retro-found": "Precursor routes found",
  "retro-none": "No precursor routes",
};

type Props = {
  /** Opens a saved analysis on the page it belongs to. */
  onOpen: (analysis: SavedAnalysisSummary) => void;
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/** The Saved Analyses library: a compact list with Open, Rename, Duplicate and Delete. */
export default function SavedAnalysesPage({ onOpen }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<SavedAnalysisSummary[]>([]);
  const [problems, setProblems] = useState<LibraryProblem[]>([]);
  const [message, setMessage] = useState<{ tone: "info" | "warn"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const listed = await getAppAnalysisLibrary().list();
    if (!listed.ok) {
      setLoadError(listed.error.message);
      setItems([]);
      setProblems([]);
    } else {
      setLoadError(null);
      setItems(listed.value.items);
      setProblems(listed.value.problems);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void getAppAnalysisLibrary().list().then((listed) => {
      if (!active) return;
      if (!listed.ok) {
        setLoadError(listed.error.message);
      } else {
        setItems(listed.value.items);
        setProblems(listed.value.problems);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function run(id: string, action: () => Promise<{ ok: boolean; error?: { message: string } }>, done: string) {
    setBusyId(id);
    setMessage(null);
    try {
      const result = await action();
      setMessage(result.ok ? { tone: "info", text: done } : { tone: "warn", text: result.error?.message ?? "That did not work." });
    } finally {
      setBusyId(null);
      await refresh();
    }
  }

  const openable = new Set<string>(OPENABLE_ANALYSIS_PAGES);

  return (
    <section className="card saved-page">
      <div className="card-header">
        <div>
          <h2>Saved analyses</h2>
          <p>Analyses you chose to keep. Opening one restores it exactly as saved; nothing is recomputed.</p>
        </div>
        <span className="status">{items.length} saved</span>
      </div>

      {message && (
        <p className={message.tone === "warn" ? "reaction-detail reaction-limitation" : "reaction-note"} role="status">
          {message.text}
        </p>
      )}

      {loading ? (
        <p className="empty">Loading…</p>
      ) : loadError ? (
        <p className="reaction-detail reaction-limitation" role="alert">
          The saved analyses could not be read: {loadError}
        </p>
      ) : items.length === 0 && problems.length === 0 ? (
        <p className="empty">
          Nothing saved yet. Use “Save Analysis” on a tool page to keep a result here.
        </p>
      ) : (
        <ul className="saved-list">
          {items.map((item) => {
            const isRenaming = renaming?.id === item.id;
            const disabled = busyId === item.id;
            return (
              <li className="saved-item" key={item.id}>
                <div className="saved-item-main">
                  <div className="saved-item-title">
                    {isRenaming ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          const target = renaming;
                          setRenaming(null);
                          void run(item.id, () => getAppAnalysisLibrary().rename(item.id, target.name), "Renamed.");
                        }}
                      >
                        <input
                          type="text"
                          value={renaming.name}
                          maxLength={120}
                          aria-label="New name"
                          autoFocus
                          onChange={(event) => setRenaming({ id: item.id, name: event.target.value })}
                        />
                        <button className="secondary-button" type="submit" disabled={!renaming.name.trim()}>Save name</button>
                        <button className="secondary-button" type="button" onClick={() => setRenaming(null)}>Cancel</button>
                      </form>
                    ) : (
                      <strong>{item.name}</strong>
                    )}
                    <span className="saved-badge">{SUBJECT_LABELS[item.subject] ?? item.subject} · {PAGE_LABELS[item.page] ?? item.page}</span>
                    {item.status && <span className="saved-badge">{STATUS_LABELS[item.status] ?? item.status}</span>}
                    {item.stale && <span className="saved-badge saved-badge-warn">Earlier structures</span>}
                  </div>
                  <p className="saved-item-summary">{item.summary}</p>
                  <p className="saved-item-date">
                    Saved {formatWhen(item.createdAt)}
                    {item.updatedAt !== item.createdAt ? ` · changed ${formatWhen(item.updatedAt)}` : ""}
                  </p>
                </div>
                <div className="saved-item-actions">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={disabled || !openable.has(item.page)}
                    title={openable.has(item.page) ? undefined : "Opening this kind of analysis is not available yet"}
                    onClick={() => onOpen(item)}
                  >
                    Open
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={disabled}
                    onClick={() => setRenaming({ id: item.id, name: item.name })}
                  >
                    Rename
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={disabled}
                    onClick={() => void run(item.id, () => getAppAnalysisLibrary().duplicate(item.id), "Duplicated.")}
                  >
                    Duplicate
                  </button>
                  {confirmDelete === item.id ? (
                    <span className="saved-confirm">
                      Delete “{item.name}”?
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setConfirmDelete(null);
                          void run(item.id, () => getAppAnalysisLibrary().delete(item.id), "Deleted.");
                        }}
                      >
                        Yes, delete
                      </button>
                      <button className="secondary-button" type="button" onClick={() => setConfirmDelete(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button className="secondary-button" type="button" disabled={disabled} onClick={() => setConfirmDelete(item.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}

          {problems.map((problem) => (
            <li className="saved-item saved-item-problem" key={problem.id}>
              <div className="saved-item-main">
                <strong>{problem.name ?? "Unreadable saved analysis"}</strong>
                <p className="saved-item-summary">
                  {problem.kind === "incompatible" ? "Cannot be opened by this version: " : "Damaged: "}
                  {problem.message}
                </p>
              </div>
              <div className="saved-item-actions">
                {confirmDelete === problem.id ? (
                  <span className="saved-confirm">
                    Delete this entry?
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setConfirmDelete(null);
                        void run(problem.id, () => getAppAnalysisLibrary().delete(problem.id), "Deleted.");
                      }}
                    >
                      Yes, delete
                    </button>
                    <button className="secondary-button" type="button" onClick={() => setConfirmDelete(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button className="secondary-button" type="button" onClick={() => setConfirmDelete(problem.id)}>
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
