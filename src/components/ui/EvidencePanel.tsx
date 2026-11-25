import { Badge, Disclosure, type Tone } from "./primitives";
import {
  CALC_LABEL, KIND_LABEL, SOURCE_LABEL, evidenceById,
  type CalcStatus, type SourceStatus,
} from "../../utils/evidence/evidence27";
import { evidence28ById } from "../../utils/evidence/evidence28";

const SOURCE_TONE: Record<SourceStatus, Tone> = { "source-verified": "ok", "partly-verified": "info", "not-verified": "estimate" };
const CALC_TONE: Record<CalcStatus, Tone> = { "independently-checked": "ok", "not-checked": "estimate" };

/**
 * Compact, collapsed-by-default statement of what kind of model a workspace is and how far it has been checked. Source verification,
 * independent calculation checks and model class are shown as separate badges, because one does not imply the others. It is not a
 * certification: it lists what was compared with which retrieved text, and what the tool does not support.
 */
export function EvidencePanel({ id }: { id: string }) {
  const record = evidenceById(id) ?? evidence28ById(id);
  if (!record) return null;
  return (
    <section aria-label={`Scientific evidence: ${record.model}`} className="provenance-panel evidence-panel" data-evidence-id={record.id} data-testid="evidence-panel">
      <Disclosure
        hint={`${KIND_LABEL[record.kind]}, ${SOURCE_LABEL[record.source]}`}
        summary="Scientific evidence and assumptions"
      >
        <p className="provenance-note"><strong>{record.model}.</strong> {record.scope}</p>
        <p className="evidence-badges">
          <Badge tone="neutral">{KIND_LABEL[record.kind]}</Badge>{" "}
          <Badge tone={SOURCE_TONE[record.source]}>{SOURCE_LABEL[record.source]}</Badge>{" "}
          <Badge tone={CALC_TONE[record.calc]}>{CALC_LABEL[record.calc]}</Badge>
          {record.quantitative ? null : <>{" "}<Badge tone="estimate">Qualitative: no rates or probabilities</Badge></>}
        </p>
        <dl className="evidence-list">
          <dt>What the source status covers</dt>
          <dd data-testid="evidence-source-covers">{record.sourceCovers}</dd>
          {record.sources.length > 0 ? (
            <>
              <dt>Sources retrieved and read</dt>
              <dd>
                <ul className="evidence-sources">
                  {record.sources.map((s) => (
                    <li key={s.ref}>
                      <a href={`https://${s.ref}`} rel="noreferrer" target="_blank">{s.title}</a> (retrieved {s.retrieved}; {s.covers})
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          ) : (
            <>
              <dt>Sources retrieved and read</dt>
              <dd>None.</dd>
            </>
          )}
          <dt>Reference conditions</dt>
          <dd><ul>{record.conditions.map((c) => <li key={c}>{c}</li>)}</ul></dd>
          <dt>Assumptions</dt>
          <dd><ul>{record.assumptions.map((c) => <li key={c}>{c}</li>)}</ul></dd>
          {record.unsupported.length > 0 ? (
            <>
              <dt>Not supported</dt>
              <dd><ul>{record.unsupported.map((c) => <li key={c}>{c}</li>)}</ul></dd>
            </>
          ) : null}
          {record.checks.length > 0 ? (
            <>
              <dt>Independent reference cases</dt>
              <dd className="evidence-checks">{record.checks.join(", ")}</dd>
            </>
          ) : null}
        </dl>
      </Disclosure>
    </section>
  );
}
