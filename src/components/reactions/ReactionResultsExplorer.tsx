import { useMemo, useState, type ReactNode } from "react";
import {
  NO_FILTER, STATUS_LABEL, STATUS_ORDER, filterResults, groupResults, initialOpenGroups, isFiltering, summarizeResults,
  type ExplorerPathway, type ResultFilter, type StatusKey,
} from "../../utils/reactions/resultsExplorer";

interface Props<T extends ExplorerPathway> {
  outcomes: readonly T[];
  /** Pathways returned by the engine before display grouping. */
  candidateCount: number;
  noReactionCount: number;
  substrate: string;
  /** Row ids whose body is mounted. Owned by the page so it can build diagrams only for rows that are open. */
  expanded: ReadonlySet<string>;
  onToggleRow: (id: string) => void;
  onSetExpanded: (ids: readonly string[]) => void;
  renderBody: (outcome: T) => ReactNode;
}

/**
 * Results explorer for forward reactions: overview, filter, groups by reaction type and collapsed rows whose full card (with its
 * diagrams) is mounted only when opened. Every outcome stays reachable: collapsing hides a body, never a result; filtering shows a
 * count of what it hides and a one-click way back.
 */
export function ReactionResultsExplorer<T extends ExplorerPathway>({ outcomes, candidateCount, noReactionCount, substrate, expanded, onToggleRow, onSetExpanded, renderBody }: Props<T>) {
  const [filter, setFilter] = useState<ResultFilter>(NO_FILTER);
  const summary = useMemo(() => summarizeResults(outcomes, candidateCount, noReactionCount), [outcomes, candidateCount, noReactionCount]);
  const shown = useMemo(() => filterResults(outcomes, filter), [outcomes, filter]);
  const groups = useMemo(() => groupResults(shown), [shown]);
  const [manualOpen, setManualOpen] = useState<Set<string> | null>(null);
  const filtering = isFiltering(filter);
  // The first group is open initially; while filtering every matching group is open so no match hides behind a collapsed header.
  const openGroups = filtering ? new Set(groups.map((group) => group.key)) : (manualOpen ?? initialOpenGroups(groups));
  const toggleGroup = (key: string) => {
    const next = new Set(openGroups);
    if (next.has(key)) next.delete(key); else next.add(key);
    setManualOpen(next);
  };
  const statusesPresent = STATUS_ORDER.filter((status) => summary.byStatus[status] > 0);
  const allShownExpanded = shown.length > 0 && shown.every((p) => expanded.has(p.id));

  return (
    <div className="rxe" data-testid="reaction-explorer">
      <section aria-labelledby="rxe-overview" className="rxe-overview" data-testid="results-overview">
        <h3 id="rxe-overview">Results overview{substrate ? <span className="rxe-substrate"> · {substrate}</span> : null}</h3>
        <dl className="rxe-figures">
          <div><dt>Outcomes</dt><dd data-testid="ov-outcomes">{summary.outcomes}</dd></div>
          <div><dt>Distinct products</dt><dd data-testid="ov-products">{summary.distinctProducts}</dd></div>
          <div><dt>Reaction families</dt><dd data-testid="ov-families">{summary.families.length}</dd></div>
          <div><dt>Reagent sets</dt><dd>{summary.reagentSets}</dd></div>
        </dl>
        <ul className="rxe-notes">
          <li>
            {summary.outcomes} {summary.outcomes === 1 ? "outcome is" : "outcomes are"} listed from {summary.candidates} rule {summary.candidates === 1 ? "match" : "matches"}
            {summary.candidates !== summary.outcomes ? " (rule-level variants, such as the halogen series, are combined into one row; each keeps its own details)" : ""}.
            They are <strong>alternatives</strong> for different reagents or conditions, not consecutive steps.
          </li>
          <li>
            Product status: {statusesPresent.map((status) => `${summary.byStatus[status]} ${STATUS_LABEL[status].toLowerCase()}`).join(", ") || "none"}.
            Only “computed” products were generated from your structure; the others are representative, generic or conceptual (see each row).
          </li>
          <li>
            {summary.withSelectivity} with selectivity notes · {summary.withLimitations} with stated limitations · {summary.mixtures} listing more than one product
            {summary.competing > 0 ? ` · ${summary.competing} in competition with another outcome for the same event` : ""}.
          </li>
          {summary.noReaction > 0 ? <li>{summary.noReaction} related catalog {summary.noReaction === 1 ? "reaction is" : "reactions are"} predicted <strong>not</strong> to occur for this substrate (listed below the outcomes).</li> : null}
          <li>Predictions are rule-based estimates, not experimental results.</li>
        </ul>
        <p aria-label="Reaction families" className="rxe-families">
          {summary.families.map((family) => <span className="rxe-chip" key={family.type}>{family.label} <strong>{family.count}</strong></span>)}
        </p>
      </section>

      <div aria-label="Filter and expand results" className="rxe-controls" role="group">
        <label className="rxe-field">
          <span>Find an outcome</span>
          <input data-testid="rxe-query" onChange={(event) => setFilter((f) => ({ ...f, query: event.target.value }))} placeholder="Reagent, product or name" type="search" value={filter.query} />
        </label>
        <label className="rxe-field">
          <span>Product status</span>
          <select data-testid="rxe-status" onChange={(event) => setFilter((f) => ({ ...f, status: event.target.value as StatusKey | "all" }))} value={filter.status}>
            <option value="all">All ({summary.outcomes})</option>
            {statusesPresent.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]} ({summary.byStatus[status]})</option>)}
          </select>
        </label>
        <div className="rxe-actions">
          <button className="secondary-button" data-testid="rxe-expand-all" onClick={() => { if (!allShownExpanded) setManualOpen(new Set(groups.map((group) => group.key))); onSetExpanded(allShownExpanded ? [] : shown.map((p) => p.id)); }} type="button">
            {allShownExpanded ? "Collapse all details" : `Expand all ${shown.length} ${shown.length === 1 ? "outcome" : "outcomes"}`}
          </button>
        </div>
      </div>
      <p aria-live="polite" className="rxe-count" data-testid="rxe-count" role="status">
        {filtering ? `Showing ${shown.length} of ${outcomes.length} outcomes.` : `${outcomes.length} ${outcomes.length === 1 ? "outcome" : "outcomes"} in ${groups.length} ${groups.length === 1 ? "group" : "groups"}.`}
        {filtering ? <> <button className="rxe-link" onClick={() => setFilter(NO_FILTER)} type="button">Clear filters</button></> : null}
      </p>
      {expanded.size > 12 ? <p className="rxe-note">{expanded.size} outcomes are expanded; collapsing some makes the page lighter.</p> : null}

      {groups.length === 0 ? (
        <p className="empty" data-testid="rxe-empty">No outcome matches this filter. {outcomes.length} {outcomes.length === 1 ? "outcome is" : "outcomes are"} hidden by it, not removed.</p>
      ) : null}

      {groups.map((group) => {
        const open = openGroups.has(group.key);
        const panelId = `rxe-group-${group.key}`;
        return (
          <section className="rxe-group" data-testid="rxe-group" key={group.key}>
            <h3 className="rxe-group-title">
              <button aria-controls={panelId} aria-expanded={open} className="rxe-group-toggle" data-group={group.key} onClick={() => toggleGroup(group.key)} type="button">
                <span aria-hidden="true" className="rxe-caret">{open ? "▾" : "▸"}</span>
                {group.label} <span className="rxe-group-count">{group.items.length} {group.items.length === 1 ? "outcome" : "outcomes"}</span>
              </button>
            </h3>
            {open ? (
              <ul className="rxe-rows" id={panelId}>
                {group.items.map((p) => {
                  const isOpen = expanded.has(p.id);
                  const bodyId = `rxe-body-${p.id}`;
                  return (
                    <li className={`rxe-row${isOpen ? " is-open" : ""}`} data-testid="rxe-row" key={p.id}>
                      <button aria-controls={bodyId} aria-expanded={isOpen} className="rxe-row-toggle" data-row={p.id} onClick={() => onToggleRow(p.id)} type="button">
                        <span aria-hidden="true" className="rxe-caret">{isOpen ? "▾" : "▸"}</span>
                        <span className="rxe-row-main">
                          <span className="rxe-row-title">{p.title}</span>
                          <span className="rxe-row-sub">{p.reagentLabel}{p.productLabel ? ` → ${p.productLabel}` : ""}</span>
                        </span>
                        <span className="rxe-row-tags">
                          <span className={`rxe-tag status-${p.productStatus}`}>{STATUS_LABEL[p.productStatus]}</span>
                          {p.selectivity.length > 0 ? <span className="rxe-tag">Selectivity</span> : null}
                          {p.limitations.length > 0 ? <span className="rxe-tag is-warn">Limitations</span> : null}
                        </span>
                      </button>
                      {isOpen ? <div aria-label={`${p.title} details`} className="rxe-body" id={bodyId} role="region">{renderBody(p)}</div> : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
