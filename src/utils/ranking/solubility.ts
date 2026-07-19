import { getRDKit } from "../rdkit";
import type { FunctionalGroupResult } from "../functionalGroups/types";
import { parseMolBlock } from "../nomenclature/molParser";
import type { PropertyTendencyLevel } from "../nomenclature/types";
import {
  countCarboxylicAcidGroups,
  estimateWaterSolubilityTendency,
  getNumberDescriptor,
  safeParseDescriptors,
} from "../nomenclature/properties";

export type SolubilityRankingResult = {
  waterSolubilityScore: number;
  tendency: PropertyTendencyLevel;
  molecularWeight: number | null;
  formalCharge: number;
  hydrogenBondDonors: number | null;
  hydrogenBondAcceptors: number | null;
  topologicalPolarSurfaceArea: number | null;
  logP: number | null;
  factors: string[];
  explanation: string;
};

function getAdjustedHydrogenBondAcceptors(
  parsedMol: ReturnType<typeof parseMolBlock>,
  descriptors: Record<string, unknown>
) {
  const rawAcceptors = getNumberDescriptor(descriptors, [
    "lipinskiHBA",
    "NumHAcceptors",
    "hba",
  ]);

  if (rawAcceptors === null) return null;

  return Math.max(
    0,
    rawAcceptors - countCarboxylicAcidGroups(parsedMol)
  );
}

/**
 * Estimates relative water-solubility tendency. A larger score means greater
 * predicted water solubility; it is not an experimental solubility value.
 */
export async function analyzeSolubilityRanking(
  smiles: string,
  functionalGroups: FunctionalGroupResult[]
): Promise<SolubilityRankingResult | null> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) return null;

  try {
    const parsedMol = parseMolBlock(mol.get_molblock());
    const descriptorMol = mol as { get_descriptors?: () => unknown };
    const descriptors = safeParseDescriptors(descriptorMol.get_descriptors?.());

    const molecularWeight = getNumberDescriptor(descriptors, [
      "amw",
      "MolWt",
      "molwt",
    ]);

    const hydrogenBondDonors = getNumberDescriptor(descriptors, [
      "lipinskiHBD",
      "NumHDonors",
      "hbd",
    ]);

    const hydrogenBondAcceptors = getAdjustedHydrogenBondAcceptors(
      parsedMol,
      descriptors
    );

    const topologicalPolarSurfaceArea = getNumberDescriptor(descriptors, [
      "tpsa",
      "TPSA",
    ]);

    const logP = getNumberDescriptor(descriptors, [
      "CrippenClogP",
      "MolLogP",
      "logp",
    ]);

    const formalCharge = parsedMol.atoms.reduce(
      (sum, atom) => sum + atom.charge,
      0
    );

    const tendency = estimateWaterSolubilityTendency(
      molecularWeight,
      formalCharge,
      hydrogenBondDonors,
      hydrogenBondAcceptors,
      topologicalPolarSurfaceArea,
      logP,
      functionalGroups
    );

    return {
      waterSolubilityScore: tendency.score,
      tendency: tendency.level,
      molecularWeight,
      formalCharge,
      hydrogenBondDonors,
      hydrogenBondAcceptors,
      topologicalPolarSurfaceArea,
      logP,
      factors: tendency.factors,
      explanation:
        "Charge, polarity, and hydrogen bonding increase water solubility, while large hydrophobic structures and high logP decrease it.",
    };
  } finally {
    mol.delete?.();
  }
}

/** Array.sort comparator: greatest predicted water solubility first. */
export function compareSolubilityResults(
  a: SolubilityRankingResult,
  b: SolubilityRankingResult
) {
  if (a.waterSolubilityScore !== b.waterSolubilityScore) {
    return b.waterSolubilityScore - a.waterSolubilityScore;
  }

  const aCharge = Math.abs(a.formalCharge);
  const bCharge = Math.abs(b.formalCharge);

  if (aCharge !== bCharge) {
    return bCharge - aCharge;
  }

  if (
    a.topologicalPolarSurfaceArea !== null &&
    b.topologicalPolarSurfaceArea !== null &&
    a.topologicalPolarSurfaceArea !== b.topologicalPolarSurfaceArea
  ) {
    return b.topologicalPolarSurfaceArea - a.topologicalPolarSurfaceArea;
  }

  if (a.logP !== null && b.logP !== null && a.logP !== b.logP) {
    return a.logP - b.logP;
  }

  if (a.molecularWeight === null && b.molecularWeight === null) return 0;
  if (a.molecularWeight === null) return 1;
  if (b.molecularWeight === null) return -1;

  return a.molecularWeight - b.molecularWeight;
}