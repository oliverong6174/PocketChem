import { getRDKit } from "../../rdkit";

/**
 * RDKit query/reaction objects are expensive to parse from SMARTS. Search used
 * to rebuild them for every node and every candidate, which made a small
 * retrosynthesis frontier spend most of its time reparsing the same chemistry.
 *
 * These objects are immutable for PocketChem's use and can be reused for the
 * lifetime of the page. Caches are bounded and delete the oldest RDKit object
 * on eviction so long sessions do not grow without limit.
 */
const MAX_QUERY_CACHE = 768;
const MAX_REACTION_CACHE = 512;

const queryCache = new Map<string, any | null>();
const reactionCache = new Map<string, any | null>();

function evictOldest(cache: Map<string, any | null>, maximum: number): void {
  while (cache.size > maximum) {
    const key = cache.keys().next().value as string | undefined;
    if (!key) break;
    const value = cache.get(key);
    cache.delete(key);
    value?.delete?.();
  }
}

export async function getCompiledQuery(smarts: string): Promise<any | null> {
  if (queryCache.has(smarts)) return queryCache.get(smarts) ?? null;

  const rdkit = await getRDKit();
  let query: any | null = null;
  try {
    query = rdkit.get_qmol(smarts) ?? null;
  } catch {
    query = null;
  }

  queryCache.set(smarts, query);
  evictOldest(queryCache, MAX_QUERY_CACHE);
  return query;
}

export function getCompiledQuerySync(rdkit: any, smarts: string): any | null {
  if (queryCache.has(smarts)) return queryCache.get(smarts) ?? null;

  let query: any | null = null;
  try {
    query = rdkit.get_qmol(smarts) ?? null;
  } catch {
    query = null;
  }

  queryCache.set(smarts, query);
  evictOldest(queryCache, MAX_QUERY_CACHE);
  return query;
}

export function getCompiledReactionSync(rdkit: any, smarts: string): any | null {
  if (reactionCache.has(smarts)) return reactionCache.get(smarts) ?? null;

  let reaction: any | null = null;
  try {
    reaction = rdkit.get_rxn(smarts) ?? null;
  } catch {
    reaction = null;
  }

  reactionCache.set(smarts, reaction);
  evictOldest(reactionCache, MAX_REACTION_CACHE);
  return reaction;
}

export function clearPlanningRdkitCaches(): void {
  for (const query of queryCache.values()) query?.delete?.();
  for (const reaction of reactionCache.values()) reaction?.delete?.();
  queryCache.clear();
  reactionCache.clear();
}
