import { getRDKit } from "../../rdkit";

function canonicalizeProductSet(productSmiles: string): string {
  return productSmiles
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join(".");
}

export async function runReactionSmarts(
  reactantSmiles: string,
  reactionSmarts: string,
  maxProducts = 8
): Promise<string[]> {
  const rdkit = await getRDKit();

  let reaction: any = null;
  let reactant: any = null;
  let molList: any = null;
  let products: any = null;

  try {
    reaction = rdkit.get_rxn(reactionSmarts);
    reactant = rdkit.get_mol(reactantSmiles);

    if (!reaction || !reactant) return [];

    molList = new rdkit.MolList();
    molList.append(reactant);
    products = reaction.run_reactants(molList);

    if (
      !products ||
      typeof products.size !== "function" ||
      typeof products.get !== "function"
    ) {
      return [];
    }

    const uniqueProducts = new Set<string>();

    for (let setIndex = 0; setIndex < products.size(); setIndex += 1) {
      if (uniqueProducts.size >= maxProducts) break;

      const productSet = products.get(setIndex);

      try {
        if (
          !productSet ||
          typeof productSet.size !== "function" ||
          typeof productSet.at !== "function"
        ) {
          continue;
        }

        const productParts: string[] = [];

        for (let productIndex = 0; productIndex < productSet.size(); productIndex += 1) {
          const productMol = productSet.at(productIndex);

          try {
            const smiles = productMol?.get_smiles?.();
            if (smiles) productParts.push(smiles);
          } finally {
            productMol?.delete?.();
          }
        }

        if (productParts.length > 0) {
          uniqueProducts.add(canonicalizeProductSet(productParts.join(".")));
        }
      } finally {
        productSet?.delete?.();
      }
    }

    return [...uniqueProducts];
  } catch (error) {
    console.error("Reaction SMARTS failed:", reactionSmarts, error);
    return [];
  } finally {
    products?.delete?.();
    molList?.delete?.();
    reactant?.delete?.();
    reaction?.delete?.();
  }
}
