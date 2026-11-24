import { useMemo, useState } from "react";
import type { AcidityResult } from "../../utils/ranking/acidBase/analyzeAcidity";
import type { BasicityResult } from "../../utils/ranking/acidBase/analyzeBasicity";
import { acidBaseSiteRows } from "../../utils/acidBasePresentation";
import { MolecularDepiction } from "./MolecularDepiction";

export function AcidBasePanel({ smiles, acids, bases, generic = false }: { smiles: string; acids: AcidityResult[]; bases: BasicityResult[]; generic?: boolean }) {
  const rows = useMemo(() => acidBaseSiteRows(acids, bases), [acids, bases]);
  const [selected, setSelected] = useState<string | null>(null);
  const site = rows.find((r) => r.id === selected) ?? rows[0];
  return <section className="pr-acid-base" data-testid="pr-acid-base" aria-label="Acid/base sites">
    <h3>Acid/base sites</h3>
    <p className="pr-note">Estimated ranges, not measured values. Rank 1 is strongest within each behavior. Base values refer to the conjugate acid; solvent and conditions can shift pKa.</p>
    {generic ? <p className="pr-generic">Scaffold sites only: unspecified substituents can change pKa and ranking.</p> : null}
    {site ? <>
      <table className="pr-table pr-site-table"><caption>Select a site to inspect its contributing factors</caption><thead><tr><th scope="col">Site / atom</th><th scope="col">Behavior</th><th scope="col">Est. pKa range</th><th scope="col">Confidence</th><th scope="col">Rank</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id} className={r.id === site.id ? "is-selected" : ""}><th scope="row"><button type="button" aria-pressed={r.id === site.id} onClick={() => setSelected(r.id)}>{r.label} <span>· atom {r.atomIndex + 1}</span></button></th><td>{r.kind}</td><td>{r.range[0]}–{r.range[1]}</td><td>{r.confidence}</td><td>{r.rank}</td></tr>)}</tbody></table>
      <div className="pr-site-detail" key={site.id}>
        <MolecularDepiction structure={smiles} atoms={[site.atomIndex]} label={`Selected atom ${site.atomIndex + 1} · ${site.group}. Drawing indices start at 0.`} />
        <div><h4>{site.label}</h4><p className="pr-note">{site.group} · {site.kind === "Acid" ? "Acidic site" : "Basic site · conjugate-acid pKa"} · {site.confidence} confidence</p><dl className="pr-factors">{site.reasons.map((r, i) => <div key={i}><dt>{r.label}</dt><dd>{r.text}</dd></div>)}</dl>
          <details className="pr-why"><summary>Detailed reasoning</summary><p>{site.detail.explanation}</p>{"atom" in site.detail ? <dl className="pr-factors">{(["atom", "resonance", "induction", "orbital"] as const).map((key) => <div key={key}><dt>{key}</dt><dd>{(site.detail as AcidityResult)[key]}</dd></div>)}</dl> : null}{site.detail.modifiers.length ? <ul>{site.detail.modifiers.map((m) => <li key={m}>{m}</li>)}</ul> : null}<p className="pr-note">Ranges are model estimates. Effects are not independent measurements and should not be added a second time.</p></details>
        </div>
      </div>
    </> : <p>No supported acid/base sites detected. This does not establish complete chemical inertness.</p>}
  </section>;
}
