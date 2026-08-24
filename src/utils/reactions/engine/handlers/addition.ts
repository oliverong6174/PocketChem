import { getRDKit } from "../../../rdkit";
import { runReactionSmarts } from "../rdkitReaction";

export type OneTwoAdditionNucleophile = "hydride" | "water" | "cyanide";
export type OneTwoAdditionReagent = "NaBH4" | "LiAlH4";

type CarbonylType =
  | "aldehyde"
  | "ketone"
  | "ester"
  | "acidChloride"
  | "carboxylicAcid"
  | "amide"
  | "unknown";

type EpoxideNucleophile = "water" | "hydroxide";

async function hasSubstructure(rdkit: any, smiles: string, smarts: string) {
  const molecule = rdkit.get_mol(smiles);
  const query = rdkit.get_qmol(smarts);

  try {
    return Boolean(
      molecule && query && molecule.get_substruct_match(query) !== "{}"
    );
  } finally {
    molecule?.delete?.();
    query?.delete?.();
  }
}

async function classifyCarbonyl(
  rdkit: any,
  smiles: string
): Promise<CarbonylType> {
  if (await hasSubstructure(rdkit, smiles, "[CX3H1,H2](=O)")) {
    return "aldehyde";
  }

  if (await hasSubstructure(rdkit, smiles, "[#6][CX3](=O)[#6]")) {
    return "ketone";
  }

  if (await hasSubstructure(rdkit, smiles, "[CX3](=O)[OX2][#6]")) {
    return "ester";
  }

  if (await hasSubstructure(rdkit, smiles, "[CX3](=O)[F,Cl,Br,I]")) {
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
): string | null {
  const hasLAH = reagents.includes("LiAlH4");

  if (nucleophile === "hydride") {
    if (carbonylType === "aldehyde" || carbonylType === "ketone") {
      return "[C:1]=[O:2]>>[C:1][OH:2]";
    }

    if (hasLAH && carbonylType === "ester") {
      return "[C:1](=[O:2])[O:3][C:4]>>[CH2:1][OH:2].[C:4][OH:3]";
    }

    if (hasLAH && carbonylType === "acidChloride") {
      return "[C:1](=[O:2])[F,Cl,Br,I:3]>>[CH2:1][OH:2]";
    }

    if (hasLAH && carbonylType === "carboxylicAcid") {
      return "[C:1](=[O:2])[OH:3]>>[CH2:1][OH:2]";
    }

    if (hasLAH && carbonylType === "amide") {
      return "[C:1](=[O:2])[N:3]>>[CH2:1][N:3]";
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

export async function addition(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  switch (options?.mode) {
    case "oneTwoAddition":
      return oneTwoAddition(reactantSmiles, options);

    case "epoxideOpening":
      return epoxideOpening(reactantSmiles, options);

    default:
      console.warn("Addition handler missing or unsupported mode:", options);
      return [];
  }
}

export async function oneTwoAddition(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const rdkit = await getRDKit();
  const requestedNucleophile = options?.nucleophile;
  const nucleophile: OneTwoAdditionNucleophile =
    requestedNucleophile === "water" || requestedNucleophile === "cyanide"
      ? requestedNucleophile
      : "hydride";

  const reagents: OneTwoAdditionReagent[] = Array.isArray(options?.reagents)
    ? (options.reagents as OneTwoAdditionReagent[])
    : ["NaBH4", "LiAlH4"];

  const carbonylType = await classifyCarbonyl(rdkit, reactantSmiles);
  const smarts = getOneTwoAdditionSmarts(
    carbonylType,
    nucleophile,
    reagents
  );

  if (!smarts) return [];
  return runReactionSmarts(reactantSmiles, smarts);
}

export async function epoxideOpening(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const nucleophile =
    (options?.nucleophile as EpoxideNucleophile | undefined) ?? "water";

  if (nucleophile !== "water" && nucleophile !== "hydroxide") {
    console.warn("Unsupported epoxide-opening nucleophile:", nucleophile);
    return [];
  }

  return runReactionSmarts(
    reactantSmiles,
    "[C:1]1[O:2][C:3]1>>[C:1](O)[C:3][OH:2]"
  );
}
