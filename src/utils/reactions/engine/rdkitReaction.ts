import { getRDKit } from "../../rdkit";
import { getCompiledReactionSync } from "./rdkitCaches";

/**
 * A reaction template that turns a stereogenic sp3 carbon into a trigonal one (alcohol to ketone, for example)
 * leaves the product atom with the reactant's bracket-atom state: a chirality tag AND a fixed explicit H count
 * (`[C@H]` from a stereo-defined input). The product SMILES (`CC[C@H](C)=O`) is then hypervalent and
 * unparsable, so the product was silently dropped and a stereo-defined alcohol could not be oxidised at all.
 * An achiral input has implicit hydrogens and never showed the problem.
 *
 * This repairs ONLY what is invalid: it replaces the smallest set of chiral bracket atoms by plain atoms (which
 * drops the tag and lets the hydrogen count be recomputed) until the product parses. Valid products, and the
 * stereocentres that survive in an invalid one, are untouched.
 */
const CHIRAL_BRACKET_ATOM = /\[([A-Z][a-z]?)@@?H?\d*\]/g;

function parses(rdkit: any, smiles: string): boolean {
  let molecule: any = null;
  try {
    molecule = rdkit.get_mol(smiles);
    return Boolean(molecule);
  } catch {
    return false;
  } finally {
    molecule?.delete?.();
  }
}

function repairDestroyedStereocentres(rdkit: any, productSmiles: string): string {
  if (!productSmiles.includes("@") || parses(rdkit, productSmiles)) return productSmiles;
  const tokens = [...productSmiles.matchAll(CHIRAL_BRACKET_ATOM)].map((match) => ({
    start: match.index as number,
    end: (match.index as number) + match[0].length,
    symbol: match[1],
  }));
  const rebuild = (chosen: number[]): string => {
    let out = "";
    let cursor = 0;
    for (const index of chosen) {
      out += productSmiles.slice(cursor, tokens[index].start) + tokens[index].symbol;
      cursor = tokens[index].end;
    }
    return out + productSmiles.slice(cursor);
  };
  const limit = Math.min(3, tokens.length);
  const attempt = (size: number, from: number, chosen: number[]): string | null => {
    if (chosen.length === size) {
      const candidate = rebuild(chosen);
      return parses(rdkit, candidate) ? candidate : null;
    }
    for (let index = from; index < tokens.length; index += 1) {
      const found = attempt(size, index + 1, [...chosen, index]);
      if (found) return found;
    }
    return null;
  };
  for (let size = 1; size <= limit; size += 1) {
    const repaired = attempt(size, 0, []);
    if (repaired) return repaired;
  }
  return productSmiles;
}

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
            if (smiles) productParts.push(repairDestroyedStereocentres(rdkit, smiles));
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
            if (smiles) productParts.push(repairDestroyedStereocentres(rdkit, smiles));
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

