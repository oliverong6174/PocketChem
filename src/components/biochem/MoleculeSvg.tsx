import { useEffect, useState } from "react";
import { getRDKit } from "../../utils/rdkit";
import { MolecularFigure } from "../ui/MolecularFigure";
import { highlightedSvg, type Highlight } from "../../utils/biochem/aaStructure";

export type Role = { atoms: number[]; color: [number, number, number]; label: string };

/** A structure drawn by the project's local RDKit build, with atom groups highlighted. The SVG is RDKit output for a SMILES this app built. */
export function MoleculeSvg({ smiles, highlights = [], width = 340, height = 250, label }: { smiles: string; highlights?: Role[]; width?: number; height?: number; label: string }) {
  const [result, setResult] = useState<{ key: string; svg: string | null } | null>(null);
  const key = JSON.stringify([smiles, highlights.map((h) => [h.atoms, h.color]), width, height]);
  useEffect(() => {
    let live = true;
    getRDKit().then((rd) => {
      if (!live) return;
      const hl: Highlight[] = highlights.map((h) => ({ atoms: h.atoms, color: h.color }));
      const out = highlightedSvg(rd, smiles, hl, { width, height });
      setResult({ key, svg: out });
    }).catch(() => { if (live) setResult({ key, svg: null }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = result && result.key === key ? result : null;
  const svg = current?.svg ?? null, failed = current !== null && current.svg === null;
  return (
    <figure className="bc-mol">
      <div aria-label={label} className="bc-mol-art" data-testid="molecule-svg" role="img" style={{ minHeight: height }}>
        {svg ? <MolecularFigure source={{ smiles }} svg={svg} title={label} /> : failed ? <p className="ph-note">The structure could not be drawn.</p> : <p className="ph-note" role="status">Drawing structure…</p>}
      </div>
      {highlights.length ? (
        <figcaption className="bc-mol-legend">
          {highlights.filter((h) => h.atoms.length).map((h) => (
            <span key={h.label}><i style={{ background: `rgb(${h.color.map((c) => Math.round(c * 255)).join(",")})` }} />{h.label}</span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
}
