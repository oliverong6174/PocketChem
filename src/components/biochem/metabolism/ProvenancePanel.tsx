import { Badge, Disclosure, type Tone } from "../../ui/primitives";
import { STATUS_LABEL, claimsFor, sourceById, type ProvenanceStatus, type ProvenanceTopic } from "../../../utils/biochem/metabolism/provenance";

const TONE: Record<ProvenanceStatus, Tone> = { "source-checked": "ok", "partly-checked": "info", unverified: "warn" };

/** What has and has not been checked against an outside source, for the claims behind this tool's numbers. Collapsed by default. */
export function ProvenancePanel({ topics }: { topics: readonly ProvenanceTopic[] }) {
  const claims = claimsFor(topics);
  if (claims.length === 0) return null;
  const checked = claims.filter((claim) => claim.status === "source-checked").length;
  return (
    <section aria-label="Sources and verification status" className="provenance-panel" data-testid="provenance-panel">
      <Disclosure hint={`${checked} of ${claims.length} checked against a source`} summary="Sources and verification status">
        <p className="provenance-note">These models were written from standard textbook knowledge. This list shows which statements were later compared with an openly available source (OpenStax Biology 2e) and which were not. A source confirming a statement does not make the simplified model exact.</p>
        <ul className="provenance-list">
          {claims.map((claim) => (
            <li className="provenance-item" key={claim.id}>
              <span className="provenance-head"><Badge tone={TONE[claim.status]}>{STATUS_LABEL[claim.status]}</Badge></span>
              <span className="provenance-statement">{claim.statement}</span>
              {claim.sourceIds.length > 0 ? (
                <span className="provenance-sources">Source: {claim.sourceIds.map((id) => sourceById(id)).filter((s) => s !== undefined).map((s, i) => <span key={s.id}>{i > 0 ? "; " : ""}<a href={s.url} rel="noreferrer" target="_blank">{s.publisher}, {s.title}</a> (opened {s.accessed})</span>)}</span>
              ) : null}
              {claim.caveat ? <span className="provenance-caveat">{claim.caveat}</span> : null}
            </li>
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}
