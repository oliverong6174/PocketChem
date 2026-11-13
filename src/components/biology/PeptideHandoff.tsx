import { PEPTIDE_LIMITS, parsePeptide } from "../../utils/biochem/peptide";
import { putHandoff } from "../../utils/biology/handoff16";

/** Sends a translated peptide to the Biochemistry peptide explorer (one-shot, validated; long peptides are cut to the explorer's limit and say so). */
export function PeptideHandoff({ sequence, source, onOpen }: { sequence: string; source: string; onOpen?: () => void }) {
  if (!onOpen || !sequence) return null;
  const cut = sequence.slice(0, PEPTIDE_LIMITS.max);
  const p = parsePeptide(cut);
  if (!p.ok) return <p className="ph-note">This peptide contains a symbol the peptide explorer does not accept, so it cannot be opened there.</p>;
  return (
    <p>
      <button className="secondary-button" data-testid="to-peptide" onClick={() => { putHandoff({ to: "peptide", sequence: p.seq, source }); onOpen(); }} type="button">
        Open {sequence.length > PEPTIDE_LIMITS.max ? `the first ${PEPTIDE_LIMITS.max} residues` : "this peptide"} in Biochemistry
      </button>
      {sequence.length > PEPTIDE_LIMITS.max ? <span className="ph-note"> The explorer takes up to {PEPTIDE_LIMITS.max} residues; this peptide has {sequence.length}.</span> : null}
    </p>
  );
}
