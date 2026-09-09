import { runReactionSmarts } from "../rdkitReaction";
import { classifyCarbonyl } from "./carbonylUtils";

type ReductionMode = "oneTwoAddition" | "carbonylToAlkane" | "birchReduction";

function hydrideReductionSmarts(
  carbonylType: Awaited<ReturnType<typeof classifyCarbonyl>>
) {
  switch (carbonylType) {
    case "aldehyde":
    case "ketone":
      return "[C:1]=[O:2]>>[C:1][OH:2]";

    case "ester":
      return "[C:1](=[O:2])[O:3][C:4]>>[CH2:1][OH:2].[C:4][OH:3]";

    case "acidChloride":
      return "[C:1](=[O:2])[F,Cl,Br,I:3]>>[CH2:1][OH:2]";

    case "carboxylicAcid":
      return "[C:1](=[O:2])[OH:3]>>[CH2:1][OH:2]";

    case "amide":
      return "[C:1](=[O:2])[N:3]>>[CH2:1][N:3]";

    default:
      return null;
  }
}

function uniqueProducts(products: string[]): string[] {
  return [...new Set(products.filter(Boolean))];
}

/**
 * Birch reduction of a simple six-membered aromatic ring.
 *
 * The product relationship is encoded from the substituent directly attached
 * to the ring rather than from names/IDs:
 *   - pi-accepting EWG (C=O, CN) -> ipso carbon becomes saturated;
 *   - pi-donating/alkyl substituent (OR, NR2, alkyl) -> ipso carbon remains
 *     part of a double bond.
 *
 * EWG templates are attempted first because they dominate the radical-anion
 * charge distribution. Exact symmetry/competition ties are retained.
 */
async function birchReduction(substrate: string): Promise<string[]> {
  const ewgTemplates = [
    // Aryl ketone/ester/acid/amide/acyl derivative.
    "[c:1]1([C:7](=[O:8])[*:9])[c:2][c:3][c:4][c:5][c:6]1>>[C:1]1([C:7](=[O:8])[*:9])-[C:2]=[C:3]-[C:4]-[C:5]=[C:6]-1",
    // Aryl aldehyde.
    "[c:1]1([C;H1:7]=[O:8])[c:2][c:3][c:4][c:5][c:6]1>>[C:1]1([C;H1:7]=[O:8])-[C:2]=[C:3]-[C:4]-[C:5]=[C:6]-1",
    // Aryl nitrile.
    "[c:1]1([C:7]#[N:8])[c:2][c:3][c:4][c:5][c:6]1>>[C:1]1([C:7]#[N:8])-[C:2]=[C:3]-[C:4]-[C:5]=[C:6]-1",
  ];

  const edgTemplates = [
    // Alkoxy/phenoxy and amino donors.
    "[c:1]1([O:7][*:8])[c:2][c:3][c:4][c:5][c:6]1>>[C:1]1([O:7][*:8])=[C:2]-[C:3]-[C:4]=[C:5]-[C:6]-1",
    "[c:1]1([N:7]) [c:2][c:3][c:4][c:5][c:6]1>>[C:1]1([N:7])=[C:2]-[C:3]-[C:4]=[C:5]-[C:6]-1".replace(" ", ""),
    // sp3 carbon directly attached to the ring (alkyl/benzylic donor).
    "[c:1]1([C;X4:7])[c:2][c:3][c:4][c:5][c:6]1>>[C:1]1([C;X4:7])=[C:2]-[C:3]-[C:4]=[C:5]-[C:6]-1",
  ];

  for (const tier of [ewgTemplates, edgTemplates]) {
    const products: string[] = [];
    for (const smarts of tier) {
      products.push(...await runReactionSmarts(substrate, smarts, 16));
    }
    const unique = uniqueProducts(products);
    if (unique.length > 0) return unique;
  }

  // Benzene/unclassified simple arenes: symmetry makes all equivalent
  // mappings collapse to the same 1,4-cyclohexadiene constitution.
  return uniqueProducts(await runReactionSmarts(
    substrate,
    "[c:1]1[c:2][c:3][c:4][c:5][c:6]1>>[C:1]1=[C:2]-[C:3]-[C:4]=[C:5]-[C:6]-1",
    16,
  ));
}

export async function reduction(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const mode = options?.mode as ReductionMode | undefined;

  if (mode === "oneTwoAddition") {
    const carbonylType = await classifyCarbonyl(reactantSmiles);
    const smarts = hydrideReductionSmarts(carbonylType);
    return smarts ? runReactionSmarts(reactantSmiles, smarts) : [];
  }

  if (mode === "carbonylToAlkane") {
    return runReactionSmarts(reactantSmiles, "[C:1]=[O:2]>>[C:1]");
  }

  if (mode === "birchReduction") {
    return birchReduction(reactantSmiles);
  }

  console.warn("Reduction handler missing or unsupported mode:", options);
  return [];
}
