import { getRDKit } from "../../../rdkit";

type OxidationMode =
  | "alcoholOxidation"
  | "aldehydeOxidation"
  | "baeyerVilliger";

type OxidationLevel =
  | "mild"
  | "strong";

type AlcoholType =
  | "primary"
  | "secondary"
  | "tertiary"
  | "unknown";

async function hasSubstructure(rdkit: any, smiles: string, smarts: string) {
  const mol = rdkit.get_mol(smiles);
  const query = rdkit.get_qmol(smarts);

  try {
    return mol.get_substruct_match(query) !== "{}";
  } finally {
    mol?.delete?.();
    query?.delete?.();
  }
}

async function classifyAlcohol(
  rdkit: any,
  smiles: string
): Promise<AlcoholType> {
  if (await hasSubstructure(rdkit, smiles, "[CH2][OH]")) {
    return "primary";
  }

  if (await hasSubstructure(rdkit, smiles, "[CH]([#6])[OH]")) {
    return "secondary";
  }

  if (await hasSubstructure(rdkit, smiles, "[C]([#6])([#6])[OH]")) {
    return "tertiary";
  }

  return "unknown";
}

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
    console.error("Oxidation handler failed:", reactionSmarts, error);
    return null;
  } finally {
    firstSet?.delete?.();
    products?.delete?.();
    molList?.delete?.();
    reactant?.delete?.();
    reaction?.delete?.();
  }
}

export async function oxidation(
  reactantSmiles: string,
  options?: Record<string, unknown>
) {
  const rdkit = await getRDKit();

  const mode = options?.mode as OxidationMode | undefined;
  const level = (options?.level as OxidationLevel | undefined) ?? "mild";

  if (mode === "alcoholOxidation") {
    const alcoholType = await classifyAlcohol(rdkit, reactantSmiles);

    if (alcoholType === "primary") {
      if (level === "strong") {
        return runReactionSmarts(
          rdkit,
          reactantSmiles,
          "[C:1][CH2:2][OH:3]>>[C:1][C:2](=O)O"
        );
      }

      return runReactionSmarts(
        rdkit,
        reactantSmiles,
        "[C:1][CH2:2][OH:3]>>[C:1][C:2]=[O:3]"
      );
    }

    if (alcoholType === "secondary") {
      return runReactionSmarts(
        rdkit,
        reactantSmiles,
        "[C:1][CH:2]([OH:3])[C:4]>>[C:1][C:2](=[O:3])[C:4]"
      );
    }

    return null;
  }

  if (mode === "aldehydeOxidation") {
    return runReactionSmarts(
      rdkit,
      reactantSmiles,
      "[CH:1]=[O:2]>>[C:1](=[O:2])O"
    );
  }

  if (mode === "baeyerVilliger") {
    return runReactionSmarts(
      rdkit,
      reactantSmiles,
      "[C:1](=[O:2])([C:3])[C:4]>>[C:1](=[O:2])O[C:3]"
    );
  }

  console.warn("Oxidation handler missing mode:", options);
  return null;
}