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
  NamingStatus,
} from "./types";

import { parseMolBlock } from "./molParser";

import {
  buildEstimatedIupacName,

} from "./nameBuilder";

import {
   formatDisplayName,
} from "./displayName";

import { getCommonNameMatch } from "./nameBuilder/commonNames";
import { getHeterocycleNomenclature } from "./nameBuilder/heterocycleNomenclature";

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

    const molWithHelpers = mol as {
      get_descriptors?: () => unknown;
      get_smiles?: () => string;
    };

    let canonicalSmiles: string | null = null;
    try {
      canonicalSmiles = molWithHelpers.get_smiles?.() ?? null;
    } catch {
      canonicalSmiles = inputKind === "smiles" ? cleanInput : null;
    }

    const molWithDescriptors = molWithHelpers;

    const descriptors = safeParseDescriptors(
      molWithDescriptors.get_descriptors?.()
    );

    return {
      nomenclature: estimateNomenclature(
        RDKit,
        mol as unknown as { get_substruct_matches: (query: { delete?: () => void }) => string },
        parsedMol,
        functionalGroups,
        mainGroup,
        canonicalSmiles
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
  RDKit: { get_qmol: (smarts: string) => { delete?: () => void } | null },
  mol: { get_substruct_matches: (query: { delete?: () => void }) => string },
  parsedMol: ParsedMol,
  functionalGroups: FunctionalGroupResult[],
  mainGroup: FunctionalGroupResult | null,
  canonicalSmiles: string | null
): NomenclatureResult {
  // Structure recognition supplies the common/biological identity, but it no
  // longer replaces the systematic name.  This lets glucose display a normal
  // chain name + "glucose", and lets adenine display 6-aminopurine + adenine.
  const structureCommonName = getCommonNameMatch(
    null,
    parsedMol,
    canonicalSmiles
  );

  // Retained heterocyclic parents must be resolved before the generic feature
  // engine. Otherwise aromatic/Kekule N=C bonds can be misread as standalone
  // imines and a purine/pyrimidine ring gets flattened into an acyclic chain.
  const heterocycleResult = getHeterocycleNomenclature(
    RDKit,
    mol,
    parsedMol
  );

  const prefixes = getPrefixes(functionalGroups, mainGroup);
  const motifs = detectAromaticMotifs(parsedMol);

  // Whole-molecule carbohydrate recognition has priority over generic
  // saturated O-heterocycle naming.  Otherwise a perfectly recognized sugar
  // or disaccharide gets flattened into a huge substituted oxane/oxolane name.
  //
  // This priority is intentionally narrow: nucleobases such as adenine still
  // continue through retained heterocycle nomenclature so PocketChem can show
  // "6-aminopurine (adenine)" instead of only "adenine".
  const structureFirstCarbohydrates = new Set([
    "glucose",
    "galactose",
    "mannose",
    "ribose",
    "arabinose",
    "xylose",
    "fructose",
    "2-deoxyribose",
    "sucrose",
    "lactose",
    "maltose",
    "cellobiose",
    "trehalose",
    "isomaltose",
  ]);

  const recognizedWholeCarbohydrate =
    structureCommonName?.source === "structure" &&
    structureFirstCarbohydrates.has(structureCommonName.name);

  if (recognizedWholeCarbohydrate && structureCommonName) {
    return {
      estimatedName: structureCommonName.name,
      commonName: structureCommonName.name,
      displayName: structureCommonName.name,
      namingConfidence: "High",
      namingStatus: "common",
      parentChain: heterocycleResult?.parentName ?? null,
      parentChainLength: 0,
      mainSuffix: null,
      prefixes,
      motifs,
      explanation:
        `Recognized the complete stereochemically specified carbohydrate structure as ${structureCommonName.name}.`,
      limitations: [],
    };
  }

  if (heterocycleResult) {
    const aliasMatch = getCommonNameMatch(heterocycleResult.name);
    const commonName =
      structureCommonName?.name ?? aliasMatch?.name ?? null;
    const displayName = formatDisplayName(
      heterocycleResult.name,
      commonName && commonName !== heterocycleResult.name ? commonName : null
    );

    return {
      estimatedName: heterocycleResult.name,
      commonName,
      displayName,
      namingConfidence:
        heterocycleResult.confidence === "high" ? "High" : "Medium",
      namingStatus: "retained",
      parentChain: heterocycleResult.parentName,
      parentChainLength: 0,
      mainSuffix: heterocycleResult.mainSuffix,
      prefixes,
      motifs,
      explanation: heterocycleResult.explanation,
      limitations: heterocycleResult.limitations,
    };
  }

  const namingResult = buildEstimatedIupacName(
    parsedMol,
    functionalGroups,
    mainGroup
  );

  if (!namingResult) {
    if (structureCommonName?.name) {
      return {
        estimatedName: structureCommonName.name,
        commonName: structureCommonName.name,
        displayName: structureCommonName.name,
        namingConfidence: "High",
        namingStatus: "common",
        parentChain: null,
        parentChainLength: 0,
        mainSuffix: mainGroup?.suffix ?? null,
        prefixes,
        motifs,
        explanation:
          `Recognized this molecular structure as ${structureCommonName.name}; a systematic parent name is not yet available for this structure.`,
        limitations: [],
      };
    }

    const fallbackName = mainGroup
      ? `${mainGroup.name} derivative`
      : "Name not estimated yet";

    return {
      estimatedName: fallbackName,
      commonName: null,
      displayName: fallbackName,
      namingConfidence: "Low",
      namingStatus: "unsupported",
      parentChain: null,
      parentChainLength: 0,
      mainSuffix: mainGroup?.suffix ?? null,
      prefixes,
      motifs,
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

  const aliasMatch = getCommonNameMatch(estimatedName);
  const commonName = structureCommonName?.name ?? aliasMatch?.name ?? null;
  const displayName = formatDisplayName(
    estimatedName,
    commonName && commonName !== estimatedName ? commonName : null
  );

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
      namingStatus: namingResult.status,
      parentChain: null,
      parentChainLength: 0,
      mainSuffix: primaryFeature ? `-${primaryFeature.suffix}` : mainGroup?.suffix ?? null,
      prefixes,
      motifs,
      explanation:
        namingResult.reason ??
        "PocketChem estimated a name but could not resolve a parent chain or ring.",
      limitations: namingResult.status === "unsupported"
        ? [namingResult.reason]
        : namingResult.parentIndependent
        ? []
        : ["Parent-chain/ring resolution is incomplete for this structure."],
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
      ? parent.parentHydrocarbon === "benzene"
        ? "Detected benzene-like aromatic ring as the parent structure."
        : `Detected retained aromatic heterocycle ${parent.parentHydrocarbon} as the parent structure.`
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
    namingStatus: namingResult.status,
    parentChain: parent.parentHydrocarbon,
    parentChainLength: parent.carbonCount,
    mainSuffix: primaryFeature ? `-${primaryFeature.suffix}` : mainGroup?.suffix ?? null,
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
