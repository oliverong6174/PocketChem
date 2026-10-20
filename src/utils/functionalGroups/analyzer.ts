import { getRDKit } from "../rdkit";
import { FUNCTIONAL_GROUPS } from "./groupPatterns";
import { detectSimpleMolecule } from "./simpleMolecules";
import { removeOverlappingGroups } from "./overlapRules";
import { deduplicateAromaticMatches } from "./aromaticUtils";
import { parseRDKitSubstructureMatches } from "./matchUtils";
import { getDisplayMatchesForGroup } from "./displayMatches";

import type {
  FunctionalGroupHierarchy,
  FunctionalGroupResult,
} from "./types";

// Compiled group queries are immutable and reused for every molecule analysed; compiling
// ~250 SMARTS per call used to be a large share of every planner expansion. They live for
// the page's lifetime (a few hundred small objects) and are intentionally never deleted.
const groupQueryCache = new Map<string, any>();

function compiledGroupQuery(RDKit: any, smarts: string): any {
  let query = groupQueryCache.get(smarts);
  if (query === undefined) {
    query = RDKit.get_qmol(smarts) ?? null;
    if (query) groupQueryCache.set(smarts, query);
  }
  if (!query) throw new Error("Could not compile functional-group SMARTS");
  return query;
}

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
    try {
      const query = compiledGroupQuery(RDKit, group.smarts);
      const matchesRaw = mol.get_substruct_matches(query);

       const detectedMatches = parseRDKitSubstructureMatches(matchesRaw);

       const finalMatches = deduplicateAromaticMatches(
          group.name,
          detectedMatches
        );

      if (finalMatches.length > 0) {
        // Display matches are only used for groups that were detected.
        const displayMatches = getDisplayMatchesForGroup(
          RDKit,
          mol,
          group,
          finalMatches
        );
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
          displayMatches,
          displaySmarts: group.displaySmarts,
          category: group.category ?? "functionalGroup",
        });
      }
    } catch (error) {
      console.warn(`SMARTS failed for ${group.name}:`, error);
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
