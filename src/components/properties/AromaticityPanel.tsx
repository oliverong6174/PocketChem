import { useState, type ReactNode } from "react";
import { useAromaticity } from "./useAromaticity";
import { MolecularDepiction } from "./MolecularDepiction";


export function AromaticityPanel({ smiles, children }: { smiles: string; children?: ReactNode }) {
  const state = useAromaticity(smiles);
  const [selected, setSelected] = useState<string | null>(null);
  const analysis = state?.result;
  const system = analysis?.systems.find((s) => s.id === selected) ?? analysis?.systems[0];
  return <section className="pr-aromaticity" data-testid="pr-aromaticity">
    <h3>Aromaticity</h3>
    {!analysis ? <p role="status">{state?.error ?? "Reading ring systems…"}</p> : <><p className="pr-aromatic-summary">{analysis.summary}</p></>}
    {children}
    {analysis ? <>
      {system ? <>
        <div className="pr-ring-list" aria-label="Ring systems">{analysis.systems.map((s, i) => <button type="button" key={s.id} aria-pressed={s.id === system.id} onClick={() => setSelected(s.id)}><strong>System {i+1}</strong><span>{s.classification}, {s.rings.length} {s.rings.length===1?"ring":"rings"}, {s.atoms.length} atoms</span><span>{s.piElectrons === null ? "π count unassigned" : `${s.piElectrons} π electrons`}</span></button>)}</div>
        <MolecularDepiction structure={smiles} atoms={system.atoms} bonds={system.bonds} label={`Ring system ${analysis.systems.indexOf(system)+1}: ${system.classification}`} />
        <dl className="pr-factors"><div><dt>Class</dt><dd>{system.classification}</dd></div><div><dt>π electrons</dt><dd>{system.piElectrons ?? "Unassigned for this system"}</dd></div><div><dt>Conjugation</dt><dd>{system.conjugation}</dd></div><div><dt>Geometry</dt><dd>{system.geometry}</dd></div></dl>
        <p className="pr-science-explanation">{system.explanation}</p>
        <details className="pr-why"><summary>Ring membership and electron contributions</summary><p className="pr-note">Atom numbers start at 0 and match the drawing. A shared fused atom contributes once.</p>{system.rings.map((ring, i) => <p key={i}>Ring {i+1}: atoms {ring.atoms.join(", ")}: {ring.aromatic ? "aromatic bonds throughout" : "not aromatic on its own"}</p>)}<p>Bonds: {system.bonds.join(", ")}</p><table className="pr-table"><thead><tr><th scope="col">Atom</th><th scope="col">Charge</th><th scope="col">π e−</th><th scope="col">Contribution</th></tr></thead><tbody>{system.contributions.map((c) => <tr key={c.atom}><th scope="row">{c.element} {c.atom}</th><td>{c.charge}</td><td>{c.electrons ?? "Unassigned"}</td><td>{c.reason}</td></tr>)}</tbody></table></details>
      </> : null}
      <details className="pr-why"><summary>Limits and sources</summary><ul>{analysis.limitations.map((lim) => <li key={lim}>{lim}</li>)}</ul><p><a href="https://www.rdkit.org/docs/RDKit_Book.html#aromaticity" target="_blank" rel="noreferrer">RDKit aromaticity model</a>, <a href="https://openstax.org/books/organic-chemistry/pages/15-3-aromaticity-and-the-huckel-4n-2-rule" target="_blank" rel="noreferrer">OpenStax: cyclic conjugation and geometry</a>, <a href="https://openstax.org/books/organic-chemistry/pages/15-5-aromatic-heterocycles-pyridine-and-pyrrole" target="_blank" rel="noreferrer">Heteroatom lone pairs</a></p></details>
    </> : null}
  </section>;
}
