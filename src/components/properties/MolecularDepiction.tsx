import { useEffect, useState } from "react";
import { bondEndpointMap } from "../../utils/moleculeAnnotation";
import { getRDKit } from "../../utils/rdkit";
import { MolecularFigure } from "../ui/MolecularFigure";

/**
 * RDKit indices are preserved: draw exactly the same source used for the analysis.
 * A highlighted bond always highlights both of its endpoint atoms, so the participating atoms are identifiable.
 */
export function MolecularDepiction({ structure, atoms = [], bonds = [], label, indices = true, caption = true, width = 500, height = 300 }: { structure: string; atoms?: number[]; bonds?: number[]; label: string; indices?: boolean; caption?: boolean; width?: number; height?: number }) {
  const [result, setResult] = useState<{ key: string; svg: string } | null>(null);
  const key = JSON.stringify([structure, atoms, bonds, indices, width, height]);
  useEffect(() => {
    let cancelled = false;
    void getRDKit().then((rdkit) => {
      const mol = rdkit.get_mol(structure);
      if (!mol) return;
      try {
        const [, atomList, bondList, showIndices, w, h] = JSON.parse(key) as [string, number[], number[], boolean, number, number];
        const endpoints = bondEndpointMap(mol);
        const allAtoms = Array.from(new Set([...atomList, ...bondList.flatMap((bond) => endpoints.get(bond) ?? [])]));
        const svg = mol.get_svg_with_highlights(JSON.stringify({ width: w, height: h, atoms: allAtoms, bonds: bondList, addAtomIndices: showIndices, highlightColour: [0.15, 0.72, 0.72], highlightBondWidthMultiplier: 12 }));
        if (!cancelled) setResult({ key, svg });
      } finally { mol.delete(); }
    }).catch(() => { if (!cancelled) setResult(null); });
    return () => { cancelled = true; };
  }, [structure, key]);
  return <figure className="pr-depiction" aria-label={label}>{result?.key === key ? <MolecularFigure source={/M {2}END/.test(structure) ? { molfile: structure } : { smiles: structure }} svg={result.svg} title={label} /> : <p>Drawing structure…</p>}{caption ? <figcaption>{label}</figcaption> : null}</figure>;
}
