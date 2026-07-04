import { getRDKit } from "../rdkit";
import type { FunctionalGroupResult } from "../functionalGroups/types";

import type {
  MoleculeIdentityResult,
  NomenclatureResult,
  ParsedMol,
} from "./types";

export type {
  AtomCount,
  PropertyTendencyLevel,
  PropertyTendencyResult,
  MoleculePropertyResult,
  NomenclatureResult,
  MoleculeIdentityResult,
} from "./types";

import { parseMolBlock } from "./molParser";

import {
  buildEstimatedIupacName,

} from "./nameBuilder";

import {
   formatDisplayName,
} from "./displayName";

import { getCommonName } from "./nameBuilder/commonNames";

import {
  buildProperties,
  safeParseDescriptors,
} from "./properties";

import { getNamingConfidence } from "./confidence";
import { buildLimitations } from "./limitations";

import { detectAromaticMotifs } from "./motifs";


export async function analyzeNomenclatureAndProperties(
  smiles: string,
  functionalGroups: FunctionalGroupResult[],
  mainGroup: FunctionalGroupResult | null
): Promise<MoleculeIdentityResult> {
  const RDKit = await getRDKit();
  const cleanSmiles = smiles.replace(/\s+/g, "").trim();

  console.log("SMILES received by nomenclature:", JSON.stringify(smiles));

  const mol = RDKit.get_mol(cleanSmiles);

  if (!mol) {
    console.error("Nomenclature RDKit failed for SMILES:", {
      raw: smiles,
      cleaned: cleanSmiles,
    });

    throw new Error(
      "Could not create molecule for nomenclature/property analysis."
    );
  }

  try {
    const parsedMol = parseMolBlock(mol.get_molblock());

    const molWithDescriptors = mol as {
      get_descriptors?: () => unknown;
    };

    const descriptors = safeParseDescriptors(
      molWithDescriptors.get_descriptors?.()
    );

    return {
      nomenclature: estimateNomenclature(
        parsedMol,
        functionalGroups,
        mainGroup
      ),
      properties: buildProperties(parsedMol, descriptors, functionalGroups),
    };
  } finally {
    mol.delete?.();
  }
}

function getPrefixes(
  functionalGroups: FunctionalGroupResult[],
  mainGroup: FunctionalGroupResult | null
) {
  return functionalGroups
    .filter((group) => group.name !== mainGroup?.name)
    .map((group) => `${group.prefix}${group.count > 1 ? ` ×${group.count}` : ""}`)
    .filter(
      (prefix) => prefix && !prefix.toLowerCase().includes("never suffix")
    );
}


function estimateNomenclature(
  parsedMol: ParsedMol,
  functionalGroups: FunctionalGroupResult[],
  mainGroup: FunctionalGroupResult | null
): NomenclatureResult {
  const namingResult = buildEstimatedIupacName(
  parsedMol,
  functionalGroups,
  mainGroup
);
  const prefixes = getPrefixes(functionalGroups, mainGroup);

  if (!namingResult) {
    const fallbackName = mainGroup
      ? `${mainGroup.name} derivative`
      : "Name not estimated yet";

    return {
      estimatedName: fallbackName,
      commonName: null,
      displayName: fallbackName,
      namingConfidence: "Low",
      parentChain: null,
      parentChainLength: 0,
      mainSuffix: mainGroup?.suffix ?? null,
      prefixes,
      explanation:
        "PocketChem could not build a parent-based name for this structure yet.",
      limitations: [
        "Complex branching, fused rings, stereochemistry, and full IUPAC tie-breaking are still in development.",
      ],
    };
  }

  const { estimatedName, parent, features, primaryFeature, substituents } =
    namingResult;

  const commonName = getCommonName(estimatedName);
  const displayName = formatDisplayName(estimatedName, commonName);
  const motifs = detectAromaticMotifs(parsedMol);

  const lowerPriorityFeatures = features.filter(
    (feature) => feature !== primaryFeature
  );

  const limitations = buildLimitations(parent, features, substituents);

  const namingConfidence = getNamingConfidence(
    parent,
    lowerPriorityFeatures
  );

  const explanationLines: string[] = [];

  explanationLines.push(
    parent.aromaticRing
      ? "Detected benzene-like aromatic ring as the parent structure."
      : parent.kind === "ring"
      ? `Detected ${parent.parentHydrocarbon} as the parent ring.`
      : `Parent chain contains ${parent.carbonCount} carbons.`
  );

  if (primaryFeature) {
    explanationLines.push(
      `${primaryFeature.type} chosen as highest-priority functional group.`
    );
  }

  if (substituents.length > 0) {
    explanationLines.push(`Detected ${substituents.length} substituent(s).`);
  }

  return {
    estimatedName,
    commonName,
    displayName,
    namingConfidence,
    parentChain: parent.parentHydrocarbon,
    parentChainLength: parent.carbonCount,
    mainSuffix: mainGroup?.suffix ?? (primaryFeature ? `-${primaryFeature.suffix}` : null),
    prefixes,
    motifs,
    explanation: explanationLines.join(" "),
    limitations:
      limitations.length > 0
        ? limitations
        : [
            "This is an estimated learning name, not a full IUPAC engine yet.",
            "Common names are included for high-yield small molecules.",
            "Next step: add full branch numbering, stereochemistry, and advanced ring naming.",
          ],
  };
}