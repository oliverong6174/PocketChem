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

function isMolBlockInput(input: string) {
  return (
    input.includes("M  END") ||
    input.includes("V2000") ||
    input.includes("V3000")
  );
}

function normalizeMoleculeInput(input: string) {
  const raw = input.trim();

  if (isMolBlockInput(raw)) {
    return raw;
  }

  return raw.replace(/\s+/g, "");
}

export async function analyzeNomenclatureAndProperties(
  moleculeInput: string,
  functionalGroups: FunctionalGroupResult[],
  mainGroup: FunctionalGroupResult | null
): Promise<MoleculeIdentityResult> {
  const RDKit = await getRDKit();

  const cleanInput = normalizeMoleculeInput(moleculeInput);
  const inputKind = isMolBlockInput(cleanInput) ? "molblock" : "smiles";

  console.log("Molecule input received by nomenclature:", {
    inputKind,
    raw: moleculeInput,
  });

  const mol = RDKit.get_mol(cleanInput);

  if (!mol) {
    console.error("Nomenclature RDKit failed for molecule input:", {
      inputKind,
      raw: moleculeInput,
      cleaned: cleanInput,
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

  const estimatedName = namingResult.estimatedName ?? "Name not estimated yet";
  const parent = namingResult.parent ?? null;
  const features = namingResult.features ?? [];
  const primaryFeature = namingResult.primaryFeature ?? null;
  const substituents = namingResult.substituents ?? [];

  const commonName = getCommonName(estimatedName);
  const displayName = formatDisplayName(estimatedName, commonName);
  const motifs = detectAromaticMotifs(parsedMol);

  if (!parent) {
    return {
      estimatedName,
      commonName,
      displayName,
      namingConfidence: namingResult.confidence === "high"
        ? "High"
        : namingResult.confidence === "medium"
        ? "Medium"
        : "Low",
      parentChain: null,
      parentChainLength: 0,
      mainSuffix: mainGroup?.suffix ?? (primaryFeature ? `-${primaryFeature.suffix}` : null),
      prefixes,
      motifs,
      explanation:
        namingResult.reason ??
        "PocketChem estimated a name but could not resolve a parent chain or ring.",
      limitations: [
        "Parent-chain/ring resolution is incomplete for this structure.",
      ],
    };
  }

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
          ],
  };
}