import { useEffect, useState } from "react";
import { getRDKit } from "../../utils/rdkit";

/** RDKit indices are preserved: draw exactly the same source used for the analysis. */
export function MolecularDepiction({ structure, atoms = [], bonds = [], label, indices = true }: { structure: string; atoms?: number[]; bonds?: number[]; label: string; indices?: boolean }) {
  const [result, setResult] = useState<{ key: string; svg: string } | null>(null);
  const key = JSON.stringify([structure, atoms, bonds, indices]);
  useEffect(() => {
    let cancelled = false;
    void getRDKit().then((rdkit) => {
      const mol = rdkit.get_mol(structure);
      if (!mol) return;
      try {
        const [, atomList, bondList, showIndices] = JSON.parse(key) as [string, number[], number[], boolean];
        const svg = mol.get_svg_with_highlights(JSON.stringify({ width: 500, height: 300, atoms: atomList, bonds: bondList, addAtomIndices: showIndices, highlightColour: [0.15, 0.72, 0.72], highlightBondWidthMultiplier: 12 }));
        if (!cancelled) setResult({ key, svg });
      } finally { mol.delete(); }
    }).catch(() => { if (!cancelled) setResult(null); });
    return () => { cancelled = true; };
  }, [structure, key]);
  return <figure className="pr-depiction" aria-label={label}>{result?.key === key ? <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: result.svg }} /> : <p>Drawing structure…</p>}<figcaption>{label}</figcaption></figure>;
}
