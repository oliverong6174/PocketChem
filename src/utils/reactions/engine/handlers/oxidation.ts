import { getRDKit } from "../../../rdkit";
import { runReactionSmarts } from "../rdkitReaction";

type OxidationMode = "alcoholOxidation" | "aldehydeOxidation";
type OxidationLevel = "mild" | "strong";
type AlcoholType = "primary" | "secondary" | "tertiary" | "unknown";

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

async function classifyAlcohol(
  rdkit: any,
  smiles: string
): Promise<AlcoholType> {
  if (await hasSubstructure(rdkit, smiles, "[CH2][OH]")) {
    return "primary";
  }

  if (await hasSubstructure(rdkit, smiles, "[CH]([#6])([#6])[OH]")) {
    return "secondary";
  }

  if (await hasSubstructure(rdkit, smiles, "[C;H0]([#6])([#6])([#6])[OH]")) {
    return "tertiary";
  }

  return "unknown";
}

export async function oxidation(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const mode = options?.mode as OxidationMode | undefined;
  const level = (options?.level as OxidationLevel | undefined) ?? "mild";

  if (mode === "aldehydeOxidation") {
    return runReactionSmarts(
      reactantSmiles,
      "[C;H1,H2:1]=[O:2]>>[C:1](=[O:2])O"
    );
  }

  if (mode !== "alcoholOxidation") {
    console.warn("Oxidation handler missing or unsupported mode:", options);
    return [];
  }

  const rdkit = await getRDKit();
  const alcoholType = await classifyAlcohol(rdkit, reactantSmiles);

  if (alcoholType === "primary") {
    return runReactionSmarts(
      reactantSmiles,
      level === "strong"
        ? "[C:1][CH2:2][OH:3]>>[C:1][C:2](=O)O"
        : "[C:1][CH2:2][OH:3]>>[C:1][CH:2]=[O:3]"
    );
  }

  if (alcoholType === "secondary") {
    return runReactionSmarts(
      reactantSmiles,
      "[C:1][CH:2]([OH:3])[C:4]>>[C:1][C:2](=[O:3])[C:4]"
    );
  }

  return [];
}
