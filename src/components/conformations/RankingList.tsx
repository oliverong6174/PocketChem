import type { ReactNode } from "react";
import { KCAL_PER_KJ, type ComparisonResult, type RankedEntry } from "../../utils/conformations/ranking";
import { Badge, Callout, Disclosure } from "../ui/primitives";

const fmt = (value: number, digits = 1) => value.toFixed(digits);

/**
 * Ranked conformations of ONE molecule, most stable first. Shows rank (ties share a rank), a thumbnail of the
 * conformation, the model energy relative to the lowest entry, a bar proportional to that energy, and the reason.
 * When the ranking abstains, the reason is shown instead of an order.
 */
export function RankingList({
  result,
  thumbnail,
  onShow,
  onRemove,
  activeId,
  idPrefix,
}: {
  result: ComparisonResult;
  thumbnail: (row: RankedEntry) => ReactNode;
  onShow?: (row: RankedEntry) => void;
  onRemove?: (row: RankedEntry) => void;
  activeId?: string | null;
  idPrefix: string;
}) {
  if (!result.ok) {
    return (
      <Callout tone="info" title="Not ranked">
        <p>{result.reason}</p>
      </Callout>
    );
  }
  const max = Math.max(...result.ranked.map((row) => row.relativeKJ ?? 0), 1e-9);
  return (
    <div className="rank-list-wrap">
      <ol className="rank-list" aria-label="Conformations from most to least stable in the model">
        {result.ranked.map((row) => {
          const kJ = row.relativeKJ;
          return (
            <li className={`rank-row${activeId === row.entry.id ? " is-active" : ""}`} key={row.entry.id} data-rank={row.rank}>
              <div className="rank-badge" aria-label={`Rank ${row.rank}${row.tied ? ", tied" : ""}`}>
                <span className="rank-number">{row.rank}</span>
                {row.tied ? <span className="rank-tie">tie</span> : null}
              </div>
              <div className="rank-thumb">{thumbnail(row)}</div>
              <div className="rank-body">
                <div className="rank-head">
                  <strong className="rank-label">{row.entry.label}</strong>
                  <span className="rank-descriptor">{row.descriptor}</span>
                  {kJ === 0 ? <Badge tone="ok">lowest in this set</Badge> : null}
                </div>
                {kJ !== null ? (
                  <div className="rank-energy" id={`${idPrefix}-e-${row.entry.id}`}>
                    <span aria-hidden="true" className="rank-bar"><span style={{ width: `${Math.max(kJ === 0 ? 0 : 3, (kJ / max) * 100)}%` }} /></span>
                    <span className="rank-value">
                      {kJ === 0 ? "0" : `+${fmt(kJ)}`} kJ/mol <span className="rank-sub">({kJ === 0 ? "0" : `+${fmt(kJ * KCAL_PER_KJ, 2)}`} kcal/mol, model)</span>
                    </span>
                  </div>
                ) : (
                  <p className="rank-sub">No energy: only the class is ranked here.</p>
                )}
                <p className="rank-reason">{row.reason}</p>
                {onShow || onRemove ? (
                  <div className="rank-actions">
                    {onShow ? <button className="secondary-button" onClick={() => onShow(row)} type="button">Show this conformation</button> : null}
                    {onRemove ? <button className="ghost-button" onClick={() => onRemove(row)} type="button">Remove</button> : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <Disclosure summary="Basis and limits of this ranking" defaultOpen={false}>
        <ul className="conf-limits">
          {result.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      </Disclosure>
    </div>
  );
}
