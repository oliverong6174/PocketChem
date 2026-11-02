import { getRDKit } from "../../rdkit";
import type { ForwardTemplate } from "../reactionTypes";
import { runReactionSmarts } from "./rdkitReaction";
import { canonicalizeStereoStructure } from "./stereochemistry";

/**
 * Forward-only product templates (Stage 9C).
 *
 * A reaction SMARTS cannot test the E/Z geometry of the alkene it matches (RDKit ignores
 * double-bond stereo in reactant templates), so a rule that is stereospecific in the alkene
 * geometry (epoxidation) or that fixes the geometry it creates (Heck) lists extra templates here.
 * They are used only when forward products are generated; `smarts` stays the retrosynthetic
 * template. The rule's plain `smarts` still runs, and its products are kept only for sites the
 * templates did not already cover, so another alkene in the molecule is never dropped.
 */

export type AlkeneGeometryClass = "E" | "Z" | "unspecified" | "ambiguous";

async function definedGeometries(smiles: string): Promise<Array<"E" | "Z">> {
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(smiles);
  if (!mol) return [];
  try {
    const raw = mol.get_stereo_tags?.();
    if (typeof raw !== "string" || !raw) return [];
    const bonds = (JSON.parse(raw) as { CIP_bonds?: unknown }).CIP_bonds;
    if (!Array.isArray(bonds)) return [];
    const out: Array<"E" | "Z"> = [];
    for (const entry of bonds) {
      const descriptor = Array.isArray(entry) ? String(entry[2]).replace(/[()]/g, "") : "";
      if (descriptor === "E" || descriptor === "Z") out.push(descriptor);
    }
    return out;
  } catch {
    return [];
  } finally {
    mol.delete?.();
  }
}

/**
 * Geometry of the reactants' defined C=C bond. Exactly one defined bond gives E or Z; none gives
 * "unspecified"; several defined bonds are "ambiguous" (no geometry-specific template is chosen).
 */
export async function reactantAlkeneGeometry(reactants: string[]): Promise<AlkeneGeometryClass> {
  const all: Array<"E" | "Z"> = [];
  for (const reactant of reactants) all.push(...(await definedGeometries(reactant)));
  if (all.length === 0) return "unspecified";
  return all.length === 1 ? all[0] : "ambiguous";
}

export async function runForwardTemplates(
  reactants: string[],
  templates: readonly ForwardTemplate[],
  baseSmarts: string,
  baseMaxProducts: number | undefined,
  onIssue?: (message: string) => void,
): Promise<string[]> {
  const geometry = await reactantAlkeneGeometry(reactants);
  const templated = new Set<string>();
  for (const template of templates) {
    if (template.whenAlkene !== undefined && template.whenAlkene !== geometry) continue;
    for (const product of await runReactionSmarts(reactants, template.smarts, template.maxProducts ?? 12, onIssue)) {
      templated.add(product);
    }
  }
  const base = await runReactionSmarts(reactants, baseSmarts, baseMaxProducts, onIssue);
  if (templated.size === 0) return base;

  const covered = new Set<string>();
  for (const product of templated) {
    for (const part of product.split(".")) {
      const structure = await canonicalizeStereoStructure(part);
      if (structure) covered.add(structure.connectivity);
    }
  }
  const out = [...templated];
  for (const product of base) {
    const keys: string[] = [];
    for (const part of product.split(".")) {
      const structure = await canonicalizeStereoStructure(part);
      if (structure) keys.push(structure.connectivity);
    }
    // A plain-SMARTS product is redundant when every component is already covered by a template product.
    if (keys.length > 0 && keys.every((key) => covered.has(key))) continue;
    out.push(product);
  }
  return out;
}
