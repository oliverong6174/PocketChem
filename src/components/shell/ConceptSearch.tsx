import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { SUBJECTS, type SubjectId } from "../../navigation/subjects";
import { getAppAnalysisLibrary, OPENABLE_ANALYSIS_PAGES } from "../../utils/persistence/analysisLibraryApp";
import type { SavedAnalysisSummary } from "../../utils/persistence/analysisLibrary";
import { searchConcepts, suggestedQueries, type ResultKind, type SavedItem, type SearchResult } from "../../utils/concepts/search";
import type { ConceptDestination } from "../../utils/concepts/conceptIndex";
import { Icon } from "../ui/Icon";
import { useDialog } from "../ui/useDialog";

interface Props {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onOpenDestination: (destination: ConceptDestination) => void;
  onOpenSaved: (analysis: SavedAnalysisSummary) => void;
}

const KIND_LABEL: Record<ResultKind, string> = { concept: "Concept", tool: "Tool", saved: "Saved analysis" };
const SUBJECT_LABEL = Object.fromEntries(SUBJECTS.map((s) => [s.id, s.label])) as Record<SubjectId, string>;
const KIND_FILTERS: Array<{ id: ResultKind | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "concept", label: "Concepts" },
  { id: "tool", label: "Tools" },
  { id: "saved", label: "Saved" },
];

/**
 * Global scientific search (Ctrl/Cmd+K). It searches the local concept index, the tool registry and saved analyses. It never
 * touches molecule input: names and SMILES are resolved by the molecule resolver in each tool, not here.
 */
/** The dialog mounts only while open, so every opening starts from the requested query with default filters. */
export function ConceptSearch(props: Props) {
  return props.open ? <ConceptSearchDialog {...props} /> : null;
}

function ConceptSearchDialog({ initialQuery = "", onClose, onOpenDestination, onOpenSaved }: Props) {
  const dialogRef = useDialog<HTMLDivElement>(true, onClose);
  const [query, setQuery] = useState(initialQuery);
  const [subject, setSubject] = useState<SubjectId | "all">("all");
  const [kind, setKind] = useState<ResultKind | "all">("all");
  const [active, setActive] = useState(0);
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [savedById, setSavedById] = useState<Record<string, SavedAnalysisSummary>>({});
  const listRef = useRef<HTMLUListElement | null>(null);
  const baseId = useId();
  const listId = `${baseId}-results`;

  useEffect(() => {
    let cancelled = false;
    void getAppAnalysisLibrary().list().then((result) => {
      if (cancelled || !result.ok) return;
      const openable = result.value.items.filter((item) => (OPENABLE_ANALYSIS_PAGES as readonly string[]).includes(item.page));
      setSaved(openable.map((item) => ({ id: item.id, name: item.name, summary: item.summary, subject: item.subject as SubjectId, page: item.page })));
      setSavedById(Object.fromEntries(openable.map((item) => [item.id, item])));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const results = useMemo(() => searchConcepts(query, { subject, kind, saved, limit: 30 }), [query, subject, kind, saved]);
  const safeActive = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${safeActive}"]`);
    node?.scrollIntoView?.({ block: "nearest" });
  }, [safeActive, results]);

  const choose = (result: SearchResult) => {
    if (result.kind === "saved" && result.savedId) {
      const summary = savedById[result.savedId];
      if (!summary) return;
      onClose();
      onOpenSaved(summary);
      return;
    }
    if (!result.destination) return;
    onClose();
    onOpenDestination(result.destination);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(Math.min(results.length - 1, safeActive + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(Math.max(0, safeActive - 1)); }
    else if (event.key === "Home" && results.length) { event.preventDefault(); setActive(0); }
    else if (event.key === "End" && results.length) { event.preventDefault(); setActive(results.length - 1); }
    else if (event.key === "Enter" && results[safeActive]) { event.preventDefault(); choose(results[safeActive]); }
  };

  const trimmed = query.trim();
  return (
    <div className="dialog-scrim concept-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div aria-label="Search PocketChem" aria-modal="true" className="dialog concept-search" ref={dialogRef} role="dialog">
        <div className="concept-input-row">
          <Icon name="search" size={18} />
          <input
            aria-activedescendant={results.length ? `${baseId}-opt-${safeActive}` : undefined}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={results.length > 0}
            aria-label="Search concepts, tools and saved analyses"
            autoComplete="off"
            className="concept-input"
            data-autofocus
            data-testid="concept-input"
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search concepts, tools and saved analyses (for example pH, ATP, peptide)"
            role="combobox"
            spellCheck={false}
            type="search"
            value={query}
          />
          <button aria-label="Close search" className="icon-button" onClick={onClose} type="button"><Icon name="close" size={18} /></button>
        </div>

        <div className="concept-filters">
          <div aria-label="Filter by subject" className="concept-chips" role="group">
            <button aria-pressed={subject === "all"} className="concept-chip" data-testid="subject-all" onClick={() => setSubject("all")} type="button">All subjects</button>
            {SUBJECTS.map((s) => (
              <button aria-pressed={subject === s.id} className="concept-chip" data-testid={`subject-${s.id}`} key={s.id} onClick={() => setSubject(s.id)} type="button">{s.label}</button>
            ))}
          </div>
          <div aria-label="Filter by type" className="concept-chips" role="group">
            {KIND_FILTERS.map((f) => (
              <button aria-pressed={kind === f.id} className="concept-chip" data-testid={`kind-${f.id}`} key={f.id} onClick={() => setKind(f.id)} type="button">{f.label}</button>
            ))}
          </div>
        </div>

        <p aria-live="polite" className="concept-status" role="status">
          {!trimmed ? "Type to search." : results.length === 0 ? "No matches." : `${results.length} result${results.length === 1 ? "" : "s"}.`}
        </p>

        {results.length > 0 ? (
          <ul className="concept-results" id={listId} ref={listRef} role="listbox">
            {results.map((result, index) => (
              <li
                aria-selected={index === safeActive}
                className={`concept-result kind-${result.kind}${index === safeActive ? " is-active" : ""}`}
                data-index={index}
                data-kind={result.kind}
                data-testid="concept-result"
                id={`${baseId}-opt-${index}`}
                key={result.key}
                onClick={() => choose(result)}
                onMouseMove={() => { if (index !== safeActive) setActive(index); }}
                role="option"
              >
                <span className="concept-result-head">
                  <span className="concept-result-title">{result.title}</span>
                  <span className={`concept-kind kind-${result.kind}`}>{KIND_LABEL[result.kind]}</span>
                  <span className="concept-subject">{SUBJECT_LABEL[result.subject]}</span>
                </span>
                {result.summary ? <span className="concept-result-summary">{result.summary}</span> : null}
                <span className="concept-result-reason">{result.reason}{result.approximate ? " (approximate)" : ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="concept-empty" id={listId}>
            {trimmed ? (
              <>
                <p><strong>No concept, tool or saved analysis matches “{trimmed}”.</strong></p>
                <p>Search covers the concepts and tools PocketChem actually has. It does not search the web or resolve molecule names; to look up a molecule, type its name or SMILES in a tool’s structure input.</p>
                {subject !== "all" || kind !== "all" ? <p><button className="secondary-button" onClick={() => { setSubject("all"); setKind("all"); }} type="button">Clear filters</button></p> : null}
              </>
            ) : (
              <>
                <p>Find a scientific idea and open the tool that works with it, across all five subjects.</p>
                <p className="concept-try">Try:{" "}
                  {suggestedQueries().map((example) => (
                    <button className="concept-chip" key={example} onClick={() => { setQuery(example); setActive(0); }} type="button">{example}</button>
                  ))}
                </p>
              </>
            )}
          </div>
        )}
        <p className="concept-foot">
          <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close
        </p>
      </div>
    </div>
  );
}
