/**
 * Chemistry-level identity of a drawn structure, used to decide whether saved results still
 * describe what is in an editor. It is derived from Ketcher's KET document through RDKit, so
 * coordinates, zoom and drawing order cannot change it, while connectivity, charges, isotopes,
 * stereochemistry and disconnected components can.
 */
import { extractKetMolecules, ketMoleculeToV3000, type KetDocument } from "../ketcherKet";
import { getRDKit } from "../rdkit";

export function ketHasStructureText(ket: string | null | undefined): boolean {
  if (!ket) return false;
  try {
    return extractKetMolecules(JSON.parse(ket) as KetDocument).length > 0;
  } catch {
    return false;
  }
}

/** Canonical isomeric SMILES of every disconnected molecule, sorted and joined with ".". */
export async function ketIdentityKey(ket: string | null | undefined): Promise<string | null> {
  if (!ket) return null;
  let molecules;
  try {
    molecules = extractKetMolecules(JSON.parse(ket) as KetDocument);
  } catch {
    return null;
  }
  if (molecules.length === 0) return null;
  try {
    const rdkit = await getRDKit();
    const parts: string[] = [];
    for (const molecule of molecules) {
      const block = ketMoleculeToV3000(molecule);
      if (!block) return null;
      const mol = rdkit.get_mol(block);
      if (!mol) return null;
      try {
        const smiles = mol.get_smiles?.();
        if (typeof smiles !== "string" || !smiles.trim()) return null;
        parts.push(...smiles.trim().split(".").filter(Boolean));
      } finally {
        mol.delete?.();
      }
    }
    return parts.sort().join(".");
  } catch {
    return null;
  }
}
