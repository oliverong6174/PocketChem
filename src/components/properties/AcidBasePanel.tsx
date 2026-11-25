import { useEffect, useMemo, useState } from "react";
import type { AcidityResult } from "../../utils/ranking/acidBase/analyzeAcidity";
import type { BasicityResult } from "../../utils/ranking/acidBase/analyzeBasicity";
import { acidBaseSiteRows, formatPkaRange, formatPkaValue, pKbFromConjugateAcid, representativePka } from "../../utils/acidBasePresentation";
import { assignToSites, formatConstant, loadPkaIndex, matchReference, pkaKeys, summarizeConstants, type PkaConstant, type PkaIndex } from "../../utils/pkaReference";
import { getRDKit } from "../../utils/rdkit";
import { MolecularDepiction } from "./MolecularDepiction";

type Reference = { constants: PkaConstant[]; source: PkaIndex["source"]; basis: "exact" | "enantiomer" };

/** Experimental reference constants for this exact structure; null when the optional index is absent or has no match. */
function useReference(smiles: string, generic: boolean): Reference | null {
  const [state, setState] = useState<{ key: string; reference: Reference | null } | null>(null);
  const key = `${generic ? "g" : "s"}:${smiles}`;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let reference: Reference | null = null;
      if (!generic) {
        try {
          const [index, rdkit] = await Promise.all([loadPkaIndex(), getRDKit()]);
          const match = index ? matchReference(index, pkaKeys(rdkit, smiles)) : null;
          const constants = match ? summarizeConstants(match.record.r) : [];
          if (index && match && constants.length) reference = { constants, source: index.source, basis: match.basis };
        } catch { reference = null; }
      }
      if (!cancelled) setState({ key, reference });
    })();
    return () => { cancelled = true; };
  }, [smiles, generic, key]);
  return state?.key === key ? state.reference : null;
}

export function AcidBasePanel({ smiles, acids, bases, generic = false }: { smiles: string; acids: AcidityResult[]; bases: BasicityResult[]; generic?: boolean }) {
  const rows = useMemo(() => acidBaseSiteRows(acids, bases), [acids, bases]);
  const [selected, setSelected] = useState<string | null>(null);
  const reference = useReference(smiles, generic);
  const site = rows.find((r) => r.id === selected) ?? rows[0];
  const assignments = useMemo(() => reference ? assignToSites(rows.map((r) => ({ id: r.id, kind: r.kind, estimate: r.center, range: r.range })), reference.constants) : [], [reference, rows]);
  const experimentalFor = (id: string) => assignments.find((a) => a.siteId === id)?.constant;
  const acidConstants = reference?.constants.filter((c) => c.kind === "acid") ?? [];
  const baseConstants = reference?.constants.filter((c) => c.kind === "conjugateAcid") ?? [];
  const pKbConstants = reference?.constants.filter((c) => c.kind === "pKb") ?? [];
  const unassigned = (constants: PkaConstant[]) => constants.filter((c) => !assignments.some((a) => a.constant === c));
  const showMolecular = unassigned(acidConstants).length + unassigned(baseConstants).length + pKbConstants.length > 0;

  const summary = (row: typeof site) => {
    const estimate = representativePka(row.center, row.range);
    const experimental = experimentalFor(row.id);
    return { estimate, experimental, pKb: row.kind === "Base" ? pKbFromConjugateAcid(estimate) : null };
  };

  return <section className="pr-acid-base" data-testid="pr-acid-base" aria-label="Acid/base sites">
    <h3>Acid/base sites</h3>
    <p className="pr-note">Aqueous-scale estimates; values outside 0 to 14 are extrapolated and are not directly comparable with other solvents. Rank 1 is strongest within each behavior; base sites list the conjugate-acid pKa (pKaH).</p>
    {generic ? <p className="pr-generic">Scaffold sites only: unspecified substituents can change pKa and ranking.</p> : null}
    {reference && showMolecular ? <MolecularReference reference={reference} acid={unassigned(acidConstants)} base={unassigned(baseConstants)} pKb={pKbConstants} /> : null}
    {site ? <div className="pr-site-workspace">
      <SiteDetail key={site.id} smiles={smiles} row={site} {...summary(site)} />
      <table className="pr-table pr-site-table"><caption className="pc-visually-hidden">Acid and base sites. Select a site to update the structure and values.</caption><thead><tr><th scope="col">Site</th><th scope="col">Behavior</th><th scope="col">Estimated pKa</th><th scope="col">Confidence</th><th scope="col">Rank</th></tr></thead><tbody>{rows.map((r) => {
        const s = summary(r);
        return <tr key={r.id} className={r.id === site.id ? "is-selected" : ""}>
          <th scope="row"><button type="button" aria-pressed={r.id === site.id} onClick={() => setSelected(r.id)}>{r.label} <span>Atom {r.atomIndex + 1}</span></button></th>
          <td>{r.kind}</td>
          <td><span className="pr-pka-value">{s.experimental ? <b>Experimental {formatConstant(s.experimental)}</b> : null}<span>≈ {formatPkaValue(s.estimate)} estimated</span><span className="pr-pka-range">Range {formatPkaRange(r.range)}</span></span></td>
          <td>{r.confidence}</td><td>{r.rank}</td></tr>;
      })}</tbody></table>
    </div> : <p>No supported acid/base sites detected. This does not establish complete chemical inertness.</p>}
    {reference ? <p className="pr-note pr-source">Experimental values: <a href={reference.source.url} target="_blank" rel="noreferrer">{reference.source.name} {reference.source.version}</a>, CC BY-NC 4.0, reproduced by permission of IUPAC.</p> : null}
  </section>;
}

function SiteDetail({ smiles, row, estimate, experimental, pKb }: { smiles: string; row: ReturnType<typeof acidBaseSiteRows>[number]; estimate: number; experimental: PkaConstant | undefined; pKb: number | null }) {
  const isBase = row.kind === "Base";
  const quantity = isBase ? "conjugate-acid pKa (pKaH)" : "pKa";
  return <div className="pr-site-aside" data-testid="pr-site-detail">
    <div className="pr-site-head">
      <MolecularDepiction structure={smiles} atoms={[row.atomIndex]} label={`Atom ${row.atomIndex + 1}, ${row.group}`} caption={false} width={420} height={260} />
      <div className="pr-site-info">
        <h4>{row.label}</h4>
        <p className="pr-note">{row.group}<br />Atom {row.atomIndex + 1}, {isBase ? "basic site" : "acidic site"}</p>
        <dl className="pr-pka-summary">
          {experimental ? <div className="pr-pka-experimental"><dt>Experimental {quantity}</dt><dd>{formatConstant(experimental)}<small>{experimental.tempC != null ? `water, ${experimental.tempC} °C` : "water"}</small></dd></div> : null}
          <div><dt>Estimated {quantity}</dt><dd>≈ {formatPkaValue(estimate)}<small>Range {formatPkaRange(row.range)}</small></dd></div>
          {pKb != null ? <div><dt>Estimated pKb</dt><dd>≈ {formatPkaValue(pKb)}<small>14 − pKaH at 25 °C</small></dd></div> : null}
        </dl>
      </div>
    </div>
    <dl className="pr-factors">{row.reasons.map((r, i) => <div key={i}><dt>{r.label}</dt><dd>{r.text}</dd></div>)}</dl>
  </div>;
}

function MolecularReference({ reference, acid, base, pKb }: { reference: Reference; acid: PkaConstant[]; base: PkaConstant[]; pKb: PkaConstant[] }) {
  const list = (constants: PkaConstant[]) => constants.map((c) => formatConstant(c)).join(", ");
  const detail = (constants: PkaConstant[]) => constants.map((c) => `step ${c.step}: ${c.count} ${c.assessment.toLowerCase()} measurement${c.count === 1 ? "" : "s"}${c.conflict ? ", values disagree" : ""}`).join("; ");
  return <div className="pr-molecular-reference" data-testid="pr-molecular-reference">
    <h4>Molecular reference pKa</h4>
    <dl>
      {acid.length ? <div title={detail(acid)}><dt>Acid dissociation (pKa)</dt><dd>{list(acid)}</dd></div> : null}
      {base.length ? <div title={detail(base)}><dt>Conjugate acid (pKaH)</dt><dd>{list(base)}</dd></div> : null}
      {pKb.length ? <div title={detail(pKb)}><dt>Base dissociation (pKb)</dt><dd>{list(pKb)}</dd></div> : null}
    </dl>
    <p className="pr-note">Experimental, water, near 25 °C. These describe whole-molecule charge-state steps, not individual atoms{reference.basis === "enantiomer" ? "; the reference structure does not specify stereochemistry, which does not change these constants for an enantiomer" : ""}.</p>
  </div>;
}
