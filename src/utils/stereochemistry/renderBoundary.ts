import { getRDKit } from "../rdkit";
import { getMechanisticStereoDirective } from "./runtime";
import {
  renderWithMechanisticStereoDirective,
  type RawGetMol,
} from "./depictionEngine";

/**
 * Apply reaction-aware stereochemical presentation only at the reaction SVG
 * boundary. Never monkey-patch RDKit's embind module methods: get_mol is an
 * overloaded embind function whose internal dispatcher reads its own
 * `overloadTable` property. Replacing that function breaks the dispatcher and
 * causes unrelated Ketcher imports to throw inside RDKit_minimal.js.
 *
 * This boundary keeps Ketcher snapshots, nomenclature, SMARTS matching, and all
 * other RDKit consumers completely untouched. Only a product that has an
 * explicitly registered mechanistic directive is intercepted here.
 */
export async function renderMechanisticReactionProductSvg(
  source: string,
  drawOptions?: string,
): Promise<string | null> {
  if (!source?.trim()) return null;

  const rdkit = await getRDKit();
  if (!rdkit || typeof rdkit.get_mol !== "function") return null;

  let mol: any = null;
  try {
    mol = rdkit.get_mol(source);
    if (!mol) return null;

    const canonical = mol.get_smiles?.();
    if (typeof canonical !== "string" || !canonical.trim()) return null;

    const directive = getMechanisticStereoDirective(canonical.trim());
    if (!directive) return null;

    // Binding the original embind function is safe; replacing it is not.
    const rawGetMol: RawGetMol = rdkit.get_mol.bind(rdkit);
    return renderWithMechanisticStereoDirective(
      rawGetMol,
      canonical.trim(),
      directive,
      drawOptions,
      source,
    );
  } catch (error) {
    console.warn(
      "Mechanistic reaction-product rendering failed; using the normal renderer.",
      error,
    );
    return null;
  } finally {
    mol?.delete?.();
  }
}
