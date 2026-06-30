import { getRDKit } from "./rdkit";
import { FUNCTIONAL_GROUPS } from "./groupPatterns";
import { detectSimpleMolecule } from "./simpleMolecules";
import { removeOverlappingGroups } from "./overlapRules";
import { deduplicateAromaticMatches } from "./aromaticUtils";
import { parseRDKitSubstructureMatches } from "./matchUtils";

import type {
  FunctionalGroupHierarchy,
  FunctionalGroupResult,
} from "./types";

export async function analyzeFunctionalGroupHierarchy(
  smiles: string
): Promise<FunctionalGroupHierarchy> {
  const simpleResult = detectSimpleMolecule(smiles);

  if (simpleResult) {
    const sortedSimple = [...simpleResult].sort(
      (a, b) => a.priority - b.priority
    );

    return {
      mainGroup: sortedSimple[0] ?? null,
      primaryGroups: sortedSimple,
      functionalGroups: sortedSimple,
    };
  }

  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) {
    return {
      mainGroup: null,
      primaryGroups: [],
      functionalGroups: [],
    };
  }

  const detectedGroups: FunctionalGroupResult[] = [];

  for (const group of FUNCTIONAL_GROUPS) {
    let query: any = null;

    try {
      query = RDKit.get_qmol(group.smarts);
      const matchesRaw = mol.get_substruct_matches(query);

       const matchedAtoms = parseRDKitSubstructureMatches(matchesRaw);

        const finalMatches = deduplicateAromaticMatches(
          group.name,
          matchedAtoms
        );

      if (finalMatches.length > 0) {
        detectedGroups.push({
          name: group.name,
          priority: group.priority,
          nomenclaturePriority: group.nomenclaturePriority,
          confidence: group.confidence,
          suffix: group.suffix,
          prefix: group.prefix,
          equivalentNames: group.equivalentNames,
          count: finalMatches.length,
          mcatNote: group.mcatNote,
          matches: finalMatches,
        });
      }
    } catch (error) {
      console.warn(`SMARTS failed for ${group.name}:`, error);
    } finally {
      query?.delete?.();
    }
  }

  mol.delete();

  const functionalGroups = removeOverlappingGroups(detectedGroups).sort(
    (a, b) => a.priority - b.priority
  );

  return {
    mainGroup: functionalGroups[0] ?? null,
    primaryGroups: functionalGroups,
    functionalGroups,
  };
}