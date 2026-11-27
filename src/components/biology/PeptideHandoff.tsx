import { putHandoff } from "../../utils/biology/handoff16";
import { PEPTIDE_LIMITS } from "../../utils/biochem/peptide";
import { preparePeptideContext } from "../../utils/concepts/context";

/** Sends a translated peptide to the Biochemistry peptide explorer (one-shot, validated; long peptides are cut to the explorer's limit and say so). Residue order is kept N to C. */
export function PeptideHandoff({ sequence, source, onOpen }: { sequence: string; source: string; onOpen?: () => void }) {
  if (!onOpen || !sequence) return null;
  const context = preparePeptideContext(sequence);
  if (!context.ok) return <p className="ph-note">{context.error} It cannot be opened in the peptide builder.</p>;
  const { value } = context;
  return (
    <p>
      <button className="secondary-button" data-testid="to-peptide" onClick={() => { putHandoff({ to: "peptide", sequence: value.sequence, source }); onOpen(); }} type="button">
        Open {value.truncatedFrom ? `the first ${PEPTIDE_LIMITS.max} residues` : "this peptide"} in Biochemistry
      </button>
      {value.truncatedFrom ? <span className="ph-note"> The explorer takes up to {PEPTIDE_LIMITS.max} residues; this peptide has {value.truncatedFrom}. Only the amino-acid sequence is sent; no folded structure is implied.</span> : <span className="ph-note"> Sends the amino-acid sequence only (N to C); no folded structure is implied.</span>}
    </p>
  );
}
