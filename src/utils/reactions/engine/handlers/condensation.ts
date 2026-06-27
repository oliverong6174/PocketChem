import { getRDKit } from "../../../analyzeSmiles";

type CondensationMode =
  | "acetalFormation"
  | "imineFormation"
  | "oximeFormation"
  | "hydrazoneFormation"
  | "enamineFormation"
  | "aldolCondensation";

async function runReactionSmarts(
  rdkit: any,
  reactantSmiles: string,
  reactionSmarts: string
) {
  let reaction: any = null;
  let reactant: any = null;
  let molList: any = null;
  let products: any = null;
  let firstSet: any = null;

  try {
    reaction = rdkit.get_rxn(reactionSmarts);
    reactant = rdkit.get_mol(reactantSmiles);

    molList = new rdkit.MolList();
    molList.append(reactant);

    products = reaction.run_reactants(molList);

    if (!products || products.size() === 0) return null;

    firstSet = products.get(0);

    if (!firstSet || firstSet.size() === 0) return null;

    const productSmiles: string[] = [];

    for (let i = 0; i < firstSet.size(); i += 1) {
      const productMol = firstSet.at(i);
      const smiles = productMol?.get_smiles?.();

      if (smiles) productSmiles.push(smiles);

      productMol?.delete?.();
    }

    return productSmiles.length > 0 ? productSmiles.join(".") : null;
  } catch (error) {
    console.error("Condensation handler failed:", reactionSmarts, error);
    return null;
  } finally {
    firstSet?.delete?.();
    products?.delete?.();
    molList?.delete?.();
    reactant?.delete?.();
    reaction?.delete?.();
  }
}

function getCarbonylCondensationSmarts(mode: CondensationMode) {
  switch (mode) {
    case "acetalFormation":
      return "[C:1]=[O:2]>>[C:1](OC)(OC)";

    case "imineFormation":
      return "[C:1]=[O:2]>>[C:1]=NC";

    case "oximeFormation":
      return "[C:1]=[O:2]>>[C:1]=NO";

    case "hydrazoneFormation":
      return "[C:1]=[O:2]>>[C:1]=NN";

    case "enamineFormation":
     return "[C:1]=[O:2]>>[C:1]=CN(C)C";

    case "aldolCondensation":
    return "[C:1]=[O:2]>>[C:1]=CC=O";
    
    default:
      return null;
  }
}

export async function condensation(
  reactantSmiles: string,
  options?: Record<string, unknown>
) {
  const rdkit = await getRDKit();
  const mode = options?.mode as CondensationMode | undefined;

  if (!mode) {
    console.warn("Condensation handler missing mode:", options);
    return null;
  }

  const smarts = getCarbonylCondensationSmarts(mode);

  if (!smarts) return null;

  return runReactionSmarts(rdkit, reactantSmiles, smarts);
}