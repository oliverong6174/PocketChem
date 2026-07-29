import { getRDKit } from "../../rdkit";
import type {
  AcidBaseRuleKind,
  AcidBaseSiteRule,
  MatchedAcidBaseSite,
} from "./types";

import { parseAtomMatches } from "./matchParsing";

function chooseBetterSite(
  current: MatchedAcidBaseSite,
  candidate: MatchedAcidBaseSite,
  kind: AcidBaseRuleKind
): MatchedAcidBaseSite {
  if (candidate.rule.priority !== current.rule.priority) {
    return candidate.rule.priority < current.rule.priority ? candidate : current;
  }

  if (kind === "acid") {
    return candidate.rule.pkaCenter < current.rule.pkaCenter ? candidate : current;
  }

  return candidate.rule.pkaCenter > current.rule.pkaCenter ? candidate : current;
}

export async function matchAcidBaseSites(
  smiles: string,
  rules: readonly AcidBaseSiteRule[],
  kind: AcidBaseRuleKind
): Promise<MatchedAcidBaseSite[]> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) return [];

  const bestSiteByAtom = new Map<number, MatchedAcidBaseSite>();

  try {
    const orderedRules = [...rules]
      .filter((rule) => rule.kind === kind)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of orderedRules) {
      let query: any = null;

      try {
        query = RDKit.get_qmol(rule.smarts);
        const matches = parseAtomMatches(mol.get_substruct_matches(query));

        for (const matchedAtomIndices of matches) {
          const atomIndex = matchedAtomIndices[rule.siteAtomIndexInMatch];

          if (atomIndex === undefined) continue;

          const candidate: MatchedAcidBaseSite = {
            rule,
            atomIndex,
            matchedAtomIndices,
          };

          const current = bestSiteByAtom.get(atomIndex);

          if (!current) {
            bestSiteByAtom.set(atomIndex, candidate);
            continue;
          }

          bestSiteByAtom.set(
            atomIndex,
            chooseBetterSite(current, candidate, kind)
          );
        }
      } catch (error) {
        console.warn(`Acid/base SMARTS failed for ${rule.id}:`, error);
      } finally {
        query?.delete?.();
      }
    }
  } finally {
    mol.delete();
  }

  const matchedSites = [...bestSiteByAtom.values()];
  const specificSites = matchedSites.filter((site) => !site.rule.fallbackOnly);
  const fallbackSites = matchedSites.filter((site) => site.rule.fallbackOnly);
  const retainedSites = specificSites.length > 0 ? specificSites : fallbackSites;

  return retainedSites.sort((a, b) => {
    if (kind === "acid") {
      return a.rule.pkaCenter - b.rule.pkaCenter || a.atomIndex - b.atomIndex;
    }

    return b.rule.pkaCenter - a.rule.pkaCenter || a.atomIndex - b.atomIndex;
  });
}