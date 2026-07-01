import { getRDKit } from "../rdkit";

export async function getMoleculeSvg(smiles: string): Promise<string | null> {
  try {
    const RDKit = await getRDKit();
    const mol = RDKit.get_mol(smiles);

    if (!mol) {
      return null;
    }

    const svg = mol.get_svg();

    mol.delete();

    return svg;
  } catch (error) {
    console.error("Failed to generate molecule SVG:", error);
    return null;
  }
}