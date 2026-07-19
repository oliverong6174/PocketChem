import { getRDKit } from "../rdkit";
import type { FunctionalGroupResult } from "../functionalGroups/types";
import { getLongestCarbonPath } from "../nomenclature/graph/parentSelection";
import { parseMolBlock } from "../nomenclature/molParser";
import type { PropertyTendencyLevel } from "../nomenclature/types";
import {
  countCarboxylicAcidGroups,
  estimateBoilingPointTendency,
  getNumberDescriptor,
  safeParseDescriptors,
} from "../nomenclature/properties";

export type BoilingPointRankingResult = {
  boilingPointScore: number;
  tendency: PropertyTendencyLevel;
  molecularWeight: number | null;
  formalCharge: number;
  hydrogenBondDonors: number | null;
  hydrogenBondAcceptors: number | null;
  carbonCount: number;
  branchingEstimate: number;
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
 * Estimates relative boiling-point tendency rather than an experimental
 * temperature. A larger score means a higher predicted boiling point.
 */
export async function analyzeBoilingPointRanking(
  smiles: string,
  functionalGroups: FunctionalGroupResult[]
): Promise<BoilingPointRankingResult | null> {
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

    const formalCharge = parsedMol.atoms.reduce(
      (sum, atom) => sum + atom.charge,
      0
    );

    const tendency = estimateBoilingPointTendency(
      parsedMol,
      functionalGroups,
      molecularWeight,
      formalCharge,
      hydrogenBondDonors,
      hydrogenBondAcceptors
    );

    const carbonCount = parsedMol.atoms.filter(
      (atom) => atom.element === "C"
    ).length;

    const longestCarbonPath = getLongestCarbonPath(parsedMol);
    const branchingEstimate = Math.max(
      0,
      carbonCount - longestCarbonPath.length
    );

    return {
      boilingPointScore: tendency.score,
      tendency: tendency.level,
      molecularWeight,
      formalCharge,
      hydrogenBondDonors,
      hydrogenBondAcceptors,
      carbonCount,
      branchingEstimate,
      factors: tendency.factors,
      explanation:
        "Higher molecular mass and stronger intermolecular forces raise boiling point, while branching usually lowers it.",
    };
  } finally {
    mol.delete?.();
  }
}

/** Array.sort comparator: highest predicted boiling point first. */
export function compareBoilingPointResults(
  a: BoilingPointRankingResult,
  b: BoilingPointRankingResult
) {
  if (a.boilingPointScore !== b.boilingPointScore) {
    return b.boilingPointScore - a.boilingPointScore;
  }

  const aCharge = Math.abs(a.formalCharge);
  const bCharge = Math.abs(b.formalCharge);

  if (aCharge !== bCharge) {
    return bCharge - aCharge;
  }

  if (a.molecularWeight === null && b.molecularWeight === null) return 0;
  if (a.molecularWeight === null) return 1;
  if (b.molecularWeight === null) return -1;

  if (a.molecularWeight !== b.molecularWeight) {
    return b.molecularWeight - a.molecularWeight;
  }

  return a.branchingEstimate - b.branchingEstimate;
}