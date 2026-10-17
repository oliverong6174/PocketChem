import { getRDKit } from "../../rdkit";
import { getCompiledReactionSync } from "./rdkitCaches";

function canonicalizeProductSet(productSmiles: string): string {
  return productSmiles
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join(".");
}

/**
 * Run a reaction SMARTS with one or more structural reactants.
 *
 * For multi-reactant rules, `reactantSmiles` must be ordered to match the
 * reactant templates on the left side of the reaction SMARTS. The rule
 * matcher is responsible for producing that role order; drawing order in
 * Ketcher does not matter.
 */
export async function runReactionSmarts(
  reactantSmiles: string | string[],
  reactionSmarts: string,
  maxProducts = 8,
  onIssue?: (message: string) => void,
): Promise<string[]> {
  const rdkit = await getRDKit();
  const reactantList = Array.isArray(reactantSmiles)
    ? reactantSmiles
    : [reactantSmiles];

  let reaction: any = null;
  let molList: any = null;
  let products: any = null;
  const reactants: any[] = [];

  try {
    reaction = getCompiledReactionSync(rdkit, reactionSmarts);
    if (!reaction) {
      onIssue?.(`Reaction SMARTS could not be compiled: ${reactionSmarts}`);
      return [];
    }

    molList = new rdkit.MolList();

    for (const smiles of reactantList) {
      const reactant = rdkit.get_mol(smiles);
      if (!reactant) {
        onIssue?.(`RDKit could not parse reactant "${smiles}".`);
        return [];
      }
      reactants.push(reactant);
      molList.append(reactant);
    }

    products = reaction.run_reactants(molList);

    if (
      !products ||
      typeof products.size !== "function" ||
      typeof products.get !== "function"
    ) {
      onIssue?.(`RDKit returned no usable product list for: ${reactionSmarts}`);
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
    onIssue?.(
      `Reaction SMARTS execution failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  } finally {
    products?.delete?.();
    molList?.delete?.();
    for (const reactant of reactants) reactant?.delete?.();
    // Compiled reactions are cached and reused across planner nodes.
  }
}

export type ReactionProductMultiplicity = {
  productSmiles: string;
  multiplicity: number;
};

/**
 * Run a reaction SMARTS while preserving how many distinct reactant atom
 * matches collapse to the same constitutional product. This is useful for
 * selectivity models: ordinary `runReactionSmarts` intentionally deduplicates
 * equivalent products, but product ratios need the site degeneracy that was
 * removed by that deduplication.
 */
export async function runReactionSmartsWithMultiplicity(
  reactantSmiles: string | string[],
  reactionSmarts: string,
  maxOutcomes = 512,
): Promise<ReactionProductMultiplicity[]> {
  const rdkit = await getRDKit();
  const reactantList = Array.isArray(reactantSmiles)
    ? reactantSmiles
    : [reactantSmiles];

  let reaction: any = null;
  let molList: any = null;
  let products: any = null;
  const reactants: any[] = [];

  try {
    reaction = getCompiledReactionSync(rdkit, reactionSmarts);
    if (!reaction) return [];

    molList = new rdkit.MolList();
    for (const smiles of reactantList) {
      const reactant = rdkit.get_mol(smiles);
      if (!reactant) return [];
      reactants.push(reactant);
      molList.append(reactant);
    }

    products = reaction.run_reactants(molList);
    if (
      !products ||
      typeof products.size !== "function" ||
      typeof products.get !== "function"
    ) {
      return [];
    }

    const counts = new Map<string, number>();
    const outcomeCount = Math.min(products.size(), Math.max(1, maxOutcomes));

    for (let setIndex = 0; setIndex < outcomeCount; setIndex += 1) {
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
          const canonical = canonicalizeProductSet(productParts.join("."));
          counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
        }
      } finally {
        productSet?.delete?.();
      }
    }

    return [...counts.entries()].map(([productSmiles, multiplicity]) => ({
      productSmiles,
      multiplicity,
    }));
  } catch (error) {
    console.error("Reaction SMARTS multiplicity analysis failed:", reactionSmarts, error);
    return [];
  } finally {
    products?.delete?.();
    molList?.delete?.();
    for (const reactant of reactants) reactant?.delete?.();
  }
}

