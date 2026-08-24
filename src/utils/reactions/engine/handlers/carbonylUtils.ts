import { getRDKit } from "../../../rdkit";

export type CarbonylType =
  | "aldehyde"
  | "ketone"
  | "ester"
  | "acidChloride"
  | "carboxylicAcid"
  | "amide"
  | "unknown";

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

export async function classifyCarbonyl(smiles: string): Promise<CarbonylType> {
  const rdkit = await getRDKit();

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
