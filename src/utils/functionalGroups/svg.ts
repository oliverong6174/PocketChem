import { getRDKit } from "../rdkit";

const MAX_SVG_CACHE_ENTRIES = 160;
const moleculeSvgCache = new Map<string, string | null>();

function rememberSvg(key: string, svg: string | null) {
  moleculeSvgCache.delete(key);
  moleculeSvgCache.set(key, svg);

  if (moleculeSvgCache.size > MAX_SVG_CACHE_ENTRIES) {
    const oldestKey = moleculeSvgCache.keys().next().value;
    if (oldestKey !== undefined) moleculeSvgCache.delete(oldestKey);
  }
}

export async function getMoleculeSvg(smiles: string): Promise<string | null> {
  const cacheKey = smiles.trim();
  if (!cacheKey) return null;

  if (moleculeSvgCache.has(cacheKey)) {
    return moleculeSvgCache.get(cacheKey) ?? null;
  }

  let mol: any = null;

  try {
    const RDKit = await getRDKit();
    mol = RDKit.get_mol(cacheKey);

    if (!mol) {
      rememberSvg(cacheKey, null);
      return null;
    }

    const svg = mol.get_svg();
    rememberSvg(cacheKey, svg);
    return svg;
  } catch (error) {
    console.error("Failed to generate molecule SVG:", error);
    return null;
  } finally {
    mol?.delete?.();
  }
}
