import { getRDKit } from "./rdkit";
import {
  extractKetMolecules,
  ketMoleculeToV3000,
  type KetDocument,
} from "./ketcherKet";

export type KetcherStructureSnapshot = {
  /** Canonical/isomeric structure used by the chemistry engine. */
  smiles: string;
  /**
   * Original Ketcher drawing converted directly from in-memory KET to V3000.
   * No Indigo/Ketcher molfile re-export is involved, so coordinates and
   * wedge/dash bond placement remain exactly tied to the user's drawing.
   * Present only when the editor contains a single molecule component.
   */
  molfile: string | null;
  /** One preserved V3000 block for each KET molecule node. */
  componentMolfiles: string[];
};

type KetcherKetReader = {
  getKet: () => Promise<string>;
};

/**
 * Convert Ketcher's in-memory KET document directly to chemistry SMILES plus
 * preserved V3000 drawing blocks.
 *
 * Why this exists:
 * Ketcher standalone getSmiles()/getMolfile() can pass through Indigo's export
 * pipeline. That is acceptable for chemical identity, but the exporter is free
 * to canonicalize atom ordering and regenerate/reflect 2-D coordinates. A
 * reaction-learning UI must not silently move a double bond, wedge, or dash to
 * a visually different bond merely because the same molecule has a symmetric
 * alternative depiction.
 *
 * KET is Ketcher's actual editor-state serialization. Its atom coordinates,
 * bond begin/end order, and wedge/hash codes are therefore the presentation
 * source of truth. We convert those records ourselves to V3000 and ask RDKit
 * only for the canonical SMILES used by reaction logic.
 */
export async function snapshotFromKetText(
  ketText: string,
): Promise<KetcherStructureSnapshot | null> {
  const trimmed = ketText.trim();
  if (!trimmed) return null;

  const ket = JSON.parse(trimmed) as KetDocument;
  const molecules = extractKetMolecules(ket);
  if (molecules.length === 0) return null;

  const componentMolfiles = molecules
    .map((molecule) => ketMoleculeToV3000(molecule))
    .filter((molfile): molfile is string => Boolean(molfile));
  if (componentMolfiles.length !== molecules.length) return null;

  const rdkit = await getRDKit();
  const componentSmiles: string[] = [];

  for (const molfile of componentMolfiles) {
    const mol = rdkit.get_mol(molfile);
    if (!mol) return null;
    try {
      const smiles = mol.get_smiles?.();
      if (typeof smiles !== "string" || !smiles.trim()) return null;
      componentSmiles.push(smiles.trim());
    } finally {
      mol.delete?.();
    }
  }

  return {
    smiles: componentSmiles.join("."),
    molfile: componentMolfiles.length === 1 ? componentMolfiles[0] : null,
    componentMolfiles,
  };
}

export async function readKetcherStructureSnapshot(
  editor: KetcherKetReader,
): Promise<KetcherStructureSnapshot | null> {
  return snapshotFromKetText(await editor.getKet());
}
