import { getRDKit } from "../rdkit";
import { getMechanisticStereoDirective } from "./runtime";
import {
  renderWithMechanisticStereoDirective,
  type RawGetMol,
} from "./depictionEngine";

const ALPHA_PYRONE_DIELS_ALDER_SMARTS =
  "[$([O]=[c]1[o][c][c][c][c]1),$([O]=[C]1O[C]=[C][C]=[C]1)]";

function isAlphaPyroneDielsAlder(rdkit: any, directive: any): boolean {
  if (directive?.kind !== "diels-alder") return false;
  const diene = directive.reactantSmiles?.[0];
  if (typeof diene !== "string" || !diene.trim()) return false;

  let mol: any = null;
  let query: any = null;
  try {
    mol = rdkit.get_mol(diene);
    if (!mol) return false;
    query = rdkit.get_qmol(ALPHA_PYRONE_DIELS_ALDER_SMARTS);
    return Boolean(query && mol.get_substruct_match?.(query) !== "{}");
  } catch {
    return false;
  } finally {
    query?.delete?.();
    mol?.delete?.();
  }
}

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

    // The generic mechanistic Diels-Alder projection is deliberately bypassed
    // for alpha-pyrone heterodienes. Its bridge-layout logic was developed for
    // hydrocarbon cycloadducts and overconstrains the lactone-containing
    // bicyclic framework, producing the crossed/mangled SVG seen for pyrone +
    // propiolate. Returning null here lets the dedicated reaction renderer use
    // a fresh, chemically identical RDKit layout instead.
    if (isAlphaPyroneDielsAlder(rdkit, directive)) return null;

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
