import { useRef, useState } from "react";
import { findAromaticCounterparts, type CounterpartCandidate, type CounterpartSearch, type CounterpartTarget } from "../../utils/aromaticCounterparts";
import { molecularStructureKey, type MoleculeNameResolution } from "../../utils/moleculeNameResolver";
import { readKetcherStructureSnapshot } from "../../utils/ketcherSnapshot";
import { MolecularDepiction } from "./MolecularDepiction";

export type CounterpartOriginal = { ket: string; smiles: string; key: string; resolution: MoleculeNameResolution | null };

export function CounterpartExplorer({ smiles, resolution, onApply, onRestore }: { smiles: string; resolution: MoleculeNameResolution | null; onApply: (candidate: CounterpartCandidate, expectedKey: string) => Promise<void>; onRestore: (original: CounterpartOriginal, expectedKey: string) => Promise<void> }) {
  const [preview, setPreview] = useState<{ search: CounterpartSearch; original: CounterpartOriginal } | null>(null);
  const [selection, setSelection] = useState(0);
  const [restore, setRestore] = useState<{ original: CounterpartOriginal; appliedKey: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef(0);
  const candidate = preview?.search.candidates[selection];
  const currentPreview = preview?.original.smiles === smiles;
  async function search(target: CounterpartTarget) {
    const editor = window.ketcher;
    if (!editor || busy) return;
    const token = ++request.current;
    setBusy(true); setMessage(""); setPreview(null);
    try {
      const snapshot = await readKetcherStructureSnapshot(editor);
      const [key, analyzedKey, ket] = await Promise.all([molecularStructureKey(snapshot?.smiles ?? ""), molecularStructureKey(smiles), editor.getKet()]);
      if (!key || key !== analyzedKey) throw new Error("The editor has changed. Analyze it before finding a counterpart.");
      const found = await findAromaticCounterparts(smiles,target);
      if (token !== request.current) return;
      setSelection(0);
      setPreview({ search: found, original: { ket, smiles, key, resolution } });
      setMessage(found.candidates.length ? `${found.candidates.length} validated comparison${found.candidates.length===1?"":"s"}. Review changes before applying.` : found.reason);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Comparison could not be generated."); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!preview || !candidate || !currentPreview || busy) return;
    setBusy(true);
    try {
      await onApply(candidate,preview.original.key);
      const appliedKey = await molecularStructureKey(candidate.smiles);
      if (appliedKey) setRestore({ original: preview.original, appliedKey });
      setPreview(null); setMessage("Counterpart applied. The original drawing can be restored.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The editor could not be updated."); }
    finally { setBusy(false); }
  }
  async function restoreOriginal() {
    if (!restore || busy) return;
    setBusy(true);
    try { await onRestore(restore.original,restore.appliedKey); setRestore(null); setPreview(null); setMessage("Original drawing and loaded identity restored."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The original could not be restored."); }
    finally { setBusy(false); }
  }
  return <section className="pr-counterparts" aria-label="Aromaticity counterpart explorer" data-testid="pr-counterparts">
    <h4>Explore a related ring structure</h4>
    <div className="button-row"><button type="button" className="secondary-button" disabled={busy} onClick={() => void search("aromatic")}>Find aromatic counterpart</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void search("antiaromatic")}>Find antiaromatic counterpart</button>{restore ? <button type="button" className="secondary-button" disabled={busy} onClick={() => void restoreOriginal()}>Restore original</button> : null}</div>
    <p className="pr-note">Bounded structural comparisons of isolated carbon rings. Preview first; edit cost does not predict stability or a chemical reaction.</p>
    {busy ? <p role="status">Validating structure…</p> : <p role="status" className="pr-note" data-testid="pr-counterpart-status">{message}</p>}
    {currentPreview && preview && candidate ? <section className="pr-counterpart-preview" aria-label="Counterpart preview" data-testid="pr-counterpart-preview">
      <h4>Compare before applying</h4>
      {preview.search.candidates.length > 1 ? <fieldset><legend>Validated candidates, ordered by edit cost</legend>{preview.search.candidates.map((c,i) => <label key={c.id}><input type="radio" name="counterpart-candidate" checked={selection===i} onChange={() => setSelection(i)} />Candidate {i+1}, cost {c.cost}, atom {c.atomIndex+1}</label>)}</fieldset> : null}
      <div className="pr-comparison-structures"><MolecularDepiction structure={preview.original.smiles} label="Original structure" indices={false} /><MolecularDepiction structure={candidate.molfile} atoms={[candidate.atomIndex]} label="Proposed structure with the edited carbon highlighted" indices={false} /></div>
      <table className="pr-table"><caption>Local changes at atom {candidate.atomIndex+1}; other atoms and connectivity preserved</caption><thead><tr><th scope="col">Property</th><th scope="col">Original</th><th scope="col">Proposed</th></tr></thead><tbody><tr><th scope="row">Formal charge at edited carbon</th><td>{candidate.originalCharge}</td><td>{candidate.proposedCharge}</td></tr><tr><th scope="row">Hydrogens at edited carbon</th><td>{candidate.originalHydrogens}</td><td>{candidate.proposedHydrogens}</td></tr><tr><th scope="row">System π electrons</th><td>{candidate.piBefore ?? "Unassigned"}</td><td>{candidate.piAfter}</td></tr><tr><th scope="row">Conjugation</th><td>{candidate.conjugationBefore}</td><td>{candidate.conjugationAfter}</td></tr><tr><th scope="row">Bond-order changes</th><td colSpan={2}>{candidate.bondOrderChanges}; heavy-atom connectivity preserved</td></tr></tbody></table>
      <p className="pr-comparison-assumption">{candidate.assumptions}</p>
      <details className="pr-why"><summary>What “closest” means (edit cost {candidate.cost})</summary><p>{preview.search.criterion}</p><code>{candidate.smiles}</code></details>
      <div className="button-row"><button className="primary-button" type="button" disabled={busy} onClick={() => void apply()}>Apply to editor</button><button className="secondary-button" type="button" disabled={busy} onClick={() => { request.current++; setPreview(null); setMessage("Preview cancelled. Drawing unchanged."); }}>Cancel</button></div>
    </section> : null}
  </section>;
}
