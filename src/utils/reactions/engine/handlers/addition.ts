import { getRDKit } from "../../../analyzeSmiles";

export type OneTwoAdditionNucleophile =
  | "hydride"
  | "organometallic"
  | "water"
  | "cyanide";
  

export type OneTwoAdditionReagent =
  | "NaBH4"
  | "LiAlH4"
  | "Grignard"
  | "Organolithium";

type CarbonylType =
  | "aldehyde"
  | "ketone"
  | "ester"
  | "acidChloride"
  | "carboxylicAcid"
  | "amide"
  | "unknown";

type EpoxideNucleophile =
  | "water"
  | "hydroxide"
  | "alcohol"
  | "alkoxide"
  | "halide"
  | "organometallic"
  | "ammonia";
  
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

async function classifyCarbonyl(
  rdkit: any,
  smiles: string
): Promise<CarbonylType> {
  if (await hasSubstructure(rdkit, smiles, "[CX3H1](=O)[#6]")) {
    return "aldehyde";
  }

  if (await hasSubstructure(rdkit, smiles, "[#6][CX3](=O)[#6]")) {
    return "ketone";
  }

  if (await hasSubstructure(rdkit, smiles, "[CX3](=O)[OX2][#6]")) {
    return "ester";
  }

  if (await hasSubstructure(rdkit, smiles, "[CX3](=O)Cl")) {
    return "acidChloride";
  }

  if (await hasSubstructure(rdkit, smiles, "[CX3](=O)[OX2H1]")) {
    return "carboxylicAcid";
  }

  if (await hasSubstructure(rdkit, smiles, "[CX3](=O)[NX3]")) {
    return "amide";
  }

  return "unknown";
}

function getOneTwoAdditionSmarts(
  carbonylType: CarbonylType,
  nucleophile: OneTwoAdditionNucleophile,
  reagents: OneTwoAdditionReagent[]
) {
  const hasLAH = reagents.includes("LiAlH4");

  if (nucleophile === "hydride") {
    if (carbonylType === "aldehyde") {
      return "[CH:1]=[O:2]>>[CH2:1][OH:2]";
    }

    if (carbonylType === "ketone") {
      return "[C:1](=[O:2])([C:3])[C:4]>>[C:1]([OH:2])([C:3])[C:4]";
    }

    if (hasLAH && carbonylType === "ester") {
      return "[C:1](=[O:2])[O:3][C:4]>>[CH2:1][OH:2]";
    }

    if (hasLAH && carbonylType === "acidChloride") {
      return "[C:1](=[O:2])[Cl:3]>>[CH2:1][OH:2]";
    }

    if (hasLAH && carbonylType === "carboxylicAcid") {
      return "[C:1](=[O:2])[OH:3]>>[CH2:1][OH:2]";
    }

    if (hasLAH && carbonylType === "amide") {
      return "[C:1](=[O:2])[N:3]>>[CH2:1][N:3]";
    }

    return null;
  }

  if (nucleophile === "organometallic") {
    if (carbonylType === "aldehyde") {
      return "[CH:1]=[O:2]>>[CH:1]([OH:2])C";
    }

    if (carbonylType === "ketone") {
      return "[C:1](=[O:2])([C:3])[C:4]>>[C:1]([OH:2])(C)([C:3])[C:4]";
    }

    if (carbonylType === "ester") {
      return "[C:1](=[O:2])[O:3][C:4]>>[C:1]([OH:2])(C)C";
    }

    if (carbonylType === "acidChloride") {
      return "[C:1](=[O:2])[Cl:3]>>[C:1]([OH:2])(C)C";
    }

    return null;
  }

if (nucleophile === "water") {
  return "[C:1]=[O:2]>>[C:1]([OH:2])O";
}

if (nucleophile === "cyanide") {
  return "[C:1]=[O:2]>>[C:1]([OH:2])C#N";
}

  return null;
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
    console.error("1,2-addition failed:", reactionSmarts, error);
    return null;
  } finally {
    firstSet?.delete?.();
    products?.delete?.();
    molList?.delete?.();
    reactant?.delete?.();
    reaction?.delete?.();
  }
}

export async function addition(
  reactantSmiles: string,
  options?: Record<string, unknown>
) {
  switch (options?.mode) {
    case "oneTwoAddition":
      return oneTwoAddition(reactantSmiles, options);

    case "aldolAddition":
      return aldolAddition(reactantSmiles);

    case "wittigReaction":
      return wittigReaction(reactantSmiles);

    case "epoxideOpening":
      return epoxideOpening(reactantSmiles, options);

    default:
      console.warn("Addition handler missing mode:", options);
      return null;
  }
}

export async function oneTwoAddition(
  reactantSmiles: string,
  options?: Record<string, unknown>
) {
  const rdkit = await getRDKit();

  const nucleophile =
    options?.nucleophile === "organometallic"
      ? "organometallic"
      : "hydride";

    const HYDRIDE_REAGENTS: OneTwoAdditionReagent[] = [
      "NaBH4",
      "LiAlH4",
    ];

    const ORGANOMETALLIC_REAGENTS: OneTwoAdditionReagent[] = [
      "Grignard",
      "Organolithium",
    ];

  const reagents: OneTwoAdditionReagent[] =
    Array.isArray(options?.reagents)
      ? (options.reagents as OneTwoAdditionReagent[])
      : nucleophile === "organometallic"
        ? ORGANOMETALLIC_REAGENTS
        : HYDRIDE_REAGENTS;

  const carbonylType = await classifyCarbonyl(rdkit, reactantSmiles);

  const smarts = getOneTwoAdditionSmarts(
    carbonylType,
    nucleophile,
    reagents
  );

  if (!smarts) return null;

  return runReactionSmarts(rdkit, reactantSmiles, smarts);
}

export async function aldolAddition(
  reactantSmiles: string
) {
  const rdkit = await getRDKit();

  return runReactionSmarts(
    rdkit,
    reactantSmiles,
    "[C:1]=[O:2]>>[C:1]([OH:2])CC=O"
  );
}

export async function wittigReaction(reactantSmiles: string) {
  const rdkit = await getRDKit();

  return runReactionSmarts(
    rdkit,
    reactantSmiles,
    "[C:1]=[O:2]>>[C:1]=C"
  );
}

export async function epoxideOpening(
  reactantSmiles: string,
  options?: Record<string, unknown>
) {
  const rdkit = await getRDKit();

  const nucleophile =
    (options?.nucleophile as EpoxideNucleophile | undefined) ?? "water";

  switch (nucleophile) {
    case "water":
    case "hydroxide":
      return runReactionSmarts(
        rdkit,
        reactantSmiles,
        "[C:1]1[O:2][C:3]1>>[C:1]([OH])[C:3][OH]"
      );

    case "alcohol":
    case "alkoxide":
      return runReactionSmarts(
        rdkit,
        reactantSmiles,
        "[C:1]1[O:2][C:3]1>>[C:1]([OC])[C:3][OH]"
      );

    case "halide":
      return runReactionSmarts(
        rdkit,
        reactantSmiles,
        "[C:1]1[O:2][C:3]1>>[C:1]([Br])[C:3][OH]"
      );

    case "organometallic":
      return runReactionSmarts(
        rdkit,
        reactantSmiles,
        "[C:1]1[O:2][C:3]1>>[C:1](C)[C:3][OH]"
      );

    case "ammonia":
      return runReactionSmarts(
        rdkit,
        reactantSmiles,
        "[C:1]1[O:2][C:3]1>>[C:1]([NH2])[C:3][OH]"
      );

    default:
      console.warn("Epoxide opening missing nucleophile:", options);
      return null;
  }
}