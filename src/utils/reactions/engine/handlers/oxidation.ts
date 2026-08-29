import { getRDKit } from "../../../rdkit";
import { runReactionSmarts } from "../rdkitReaction";

type OxidationMode =
  | "alcoholOxidation"
  | "aldehydeOxidation"
  | "alkeneOxidativeCleavage"
  | "alkyneOxidativeCleavage";
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

async function runUniqueReactionSet(
  reactantSmiles: string,
  reactionSmarts: string[]
): Promise<string[]> {
  const products = new Set<string>();

  for (const smarts of reactionSmarts) {
    for (const product of await runReactionSmarts(reactantSmiles, smarts)) {
      products.add(product);
    }
  }

  return [...products];
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

  if (mode === "alkeneOxidativeCleavage") {
    return runUniqueReactionSet(reactantSmiles, [
      // Alkene carbon with one H -> carboxylic acid.
      "[C;H1:1]=[C;H1:2]>>[C:1](=O)O.[C:2](=O)O",
      // Alkene carbon with no H -> ketone.
      "[C;H0:1]=[C;H1:2]>>[C:1]=O.[C:2](=O)O",
      "[C;H1:1]=[C;H0:2]>>[C:1](=O)O.[C:2]=O",
      "[C;H0:1]=[C;H0:2]>>[C:1]=O.[C:2]=O",
      // Terminal =CH2 carbon -> CO2 under vigorous permanganate oxidation.
      "[CH2:1]=[C;H1:2]>>[C:1](=O)=O.[C:2](=O)O",
      "[C;H1:1]=[CH2:2]>>[C:1](=O)O.[C:2](=O)=O",
      "[CH2:1]=[C;H0:2]>>[C:1](=O)=O.[C:2]=O",
      "[C;H0:1]=[CH2:2]>>[C:1]=O.[C:2](=O)=O",
    ]);
  }

  if (mode === "alkyneOxidativeCleavage") {
    return runUniqueReactionSet(reactantSmiles, [
      // Internal alkyne -> two carboxylic-acid fragments.
      "[C;H0:1]#[C;H0:2]>>[C:1](=O)O.[C:2](=O)O",
      // Terminal alkyne carbon -> CO2; substituted carbon -> carboxylic acid.
      "[CH:1]#[C;H0:2]>>[C:1](=O)=O.[C:2](=O)O",
      "[C;H0:1]#[CH:2]>>[C:1](=O)O.[C:2](=O)=O",
    ]);
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
