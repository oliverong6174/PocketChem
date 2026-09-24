import type { MoleculeIdentityResult } from "./nomenclatureUtils";
import {
  lookupLocalChemicalName,
  normalizeChemicalName,
} from "./chemicalNameDatabase";

export type MoleculeNameResolution = {
  query: string;
  smiles: string;
  connectivitySmiles: string | null;
  iupacName: string | null;
  title: string | null;
  molecularFormula: string | null;
  inchiKey: string | null;
  source: "chebi";
};

const resolverCache = new Map<string, MoleculeNameResolution>();
const MAX_CACHE_ENTRIES = 300;

function normalizeNameQuery(value: string) {
  return value
    .trim()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ");
}

function cacheKey(value: string) {
  return normalizeChemicalName(value);
}

function rememberResolution(key: string, value: MoleculeNameResolution) {
  if (resolverCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = resolverCache.keys().next().value as string | undefined;
    if (oldestKey) resolverCache.delete(oldestKey);
  }
  resolverCache.set(key, value);
}

/**
 * Fully offline name resolution.
 *
 * Runtime resolution uses only the ChEBI-derived database bundled in
 * PocketChem's public/data directory. There are deliberately NO requests to
 * PubChem, ChEBI, or any other external service here.
 */
export async function resolveMoleculeName(
  rawQuery: string,
): Promise<MoleculeNameResolution> {
  const query = normalizeNameQuery(rawQuery);
  if (!query) throw new Error("Enter a common or IUPAC molecule name first.");
  if (query.length > 240) throw new Error("That molecule name is too long to resolve safely.");

  const key = cacheKey(query);
  const cached = resolverCache.get(key);
  if (cached) return cached;

  let local;
  try {
    local = await lookupLocalChemicalName(query);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("PocketChem could not read its local chemical-name database.");
  }

  if (!local) {
    throw new Error(
      `No unique offline structure was found for “${query}”. Try another synonym or draw the molecule.`,
    );
  }

  const resolution: MoleculeNameResolution = {
    query,
    smiles: local.smiles,
    // ChEBI's local structure is already the authoritative imported structure;
    // a separate online connectivity SMILES is intentionally not requested.
    connectivitySmiles: null,
    iupacName: local.iupacName,
    title: local.preferredName,
    molecularFormula: local.molecularFormula,
    inchiKey: local.inchiKey,
    source: "chebi",
  };

  rememberResolution(key, resolution);
  return resolution;
}

export function clearMoleculeNameResolverCache() {
  resolverCache.clear();
}

function comparableName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ");
}

/** Preserve the exact local database identity that supplied the imported structure. */
export function applyResolvedNameToIdentity(
  identity: MoleculeIdentityResult,
  resolution: MoleculeNameResolution | null | undefined,
): MoleculeIdentityResult {
  const resolvedIupac = resolution?.iupacName?.trim();
  if (!resolvedIupac) return identity;

  const resolvedTitle = resolution?.title?.trim();
  const resolvedQuery = resolution?.query?.trim();
  const iupacKey = comparableName(resolvedIupac);
  const matchedCommonName = [resolvedTitle, resolvedQuery]
    .find((candidate) => candidate && comparableName(candidate) !== iupacKey)
    ?? identity.nomenclature.commonName;

  const lookupExplanation = resolvedQuery
    ? `“${resolvedQuery}” was resolved from PocketChem's bundled ChEBI database; the IUPAC name shown here belongs to that exact local structure.`
    : "The displayed IUPAC identity comes from PocketChem's bundled ChEBI database for the imported structure.";

  return {
    ...identity,
    nomenclature: {
      ...identity.nomenclature,
      estimatedName: resolvedIupac,
      displayName: resolvedIupac,
      commonName: matchedCommonName ?? null,
      namingConfidence: "High",
      namingStatus: "systematic",
      explanation: lookupExplanation,
      limitations: [
        ...identity.nomenclature.limitations.filter(
          (item) => !item.toLocaleLowerCase().includes("estimated name"),
        ),
        "For a name-imported molecule, PocketChem preserves the bundled database identity associated with the structure instead of replacing it with a second local naming guess.",
      ],
    },
  };
}
