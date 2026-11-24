import type { MoleculeIdentityResult } from "./nomenclatureUtils";
import {
  lookupLocalChemicalName,
  findRelatedChemicalNames,
  normalizeChemicalName,
} from "./chemicalNameDatabase";
import { toPlainChemicalName } from "./chemicalNameText";
import { getRDKit } from "./rdkit";

export type MoleculeNameResolution = {
  sourceId?: string;
  aliases?: string[];
  query: string;
  smiles: string;
  connectivitySmiles: string | null;
  iupacName: string | null;
  title: string | null;
  molecularFormula: string | null;
  inchiKey: string | null;
  source: "chebi";
};

/** The offline database has no unique entry for the name (as opposed to a database read failure). */
export class MoleculeNameNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoleculeNameNotFoundError";
  }
}

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
 * What a failed database read is reported as. A real Error is passed on unchanged; anything else that
 * was thrown is wrapped in the user-facing message with the original value kept as `cause`, so the
 * underlying failure is not lost for debugging while users still see only the plain message.
 */
export function asLookupFailure(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error("PocketChem could not read its local chemical-name database.", { cause: error });
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
  if (cached) return { ...cached, query };

  let local;
  try {
    local = await lookupLocalChemicalName(query);
  } catch (error) {
    throw asLookupFailure(error);
  }

  if (!local) {
    throw new MoleculeNameNotFoundError(
      `No unique offline structure was found for “${query}”. Try another synonym or draw the molecule.`,
    );
  }

  const resolution: MoleculeNameResolution = {
    sourceId: local.chebiId,
    aliases: [...new Set([query, toPlainChemicalName(local.preferredName), toPlainChemicalName(local.iupacName)].filter((s): s is string => Boolean(s)))],
    query,
    smiles: local.smiles,
    // ChEBI's local structure is already the authoritative imported structure;
    // a separate online connectivity SMILES is intentionally not requested.
    connectivitySmiles: null,
    // ChEBI stores italics as inline HTML ("3<i>S</i>"); show names as plain text.
    iupacName: toPlainChemicalName(local.iupacName),
    title: toPlainChemicalName(local.preferredName),
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
  if (!resolution) return identity;
  const resolvedIupac = resolution.iupacName?.trim();

  const resolvedTitle = resolution?.title?.trim();
  const resolvedQuery = resolution?.query?.trim();
  const iupacKey = comparableName(resolvedIupac);
  const name = resolvedIupac || resolvedTitle || resolvedQuery;
  if (!name) return identity;
  const fullySpecified = identity.properties.fullySpecified !== false && !isGenericResolution(resolution);
  const matchedCommonName = [resolvedTitle, resolvedQuery]
    .find((candidate) => candidate && comparableName(candidate) !== iupacKey)
    ?? identity.nomenclature.commonName;

  const lookupExplanation = resolvedQuery
    ? `“${resolvedQuery}” was resolved from PocketChem's bundled ChEBI database; the IUPAC name shown here belongs to that exact local structure.`
    : "The displayed IUPAC identity comes from PocketChem's bundled ChEBI database for the imported structure.";

  return {
    ...identity,
    structureDerivedNomenclature: identity.structureDerivedNomenclature ?? identity.nomenclature,
    sourceIdentity: {
      originalQuery: resolution.query, resolvedName: resolvedTitle || name,
      aliases: [...new Set([...(resolution.aliases ?? []), resolution.query, name])],
      sourceId: resolution.sourceId ?? null, confidence: "Database match", fullySpecified, resolution,
    },
    properties: fullySpecified ? identity.properties : {
      ...identity.properties, fullySpecified: false, molecularWeight: null, exactMass: null, degreesOfUnsaturation: null,
      notes: [...identity.properties.notes, "The source entry is a generic chemical family or variable-composition structure. Only scaffold properties are available."],
    },
    nomenclature: {
      ...identity.nomenclature,
      estimatedName: name,
      displayName: name,
      commonName: matchedCommonName ?? null,
      namingConfidence: "High",
      namingStatus: resolvedIupac ? "systematic" : "common",
      explanation: resolvedIupac ? lookupExplanation : `Loaded as ${name} from the bundled ChEBI database. A database identity does not require a structure-derived systematic name.`,
      limitations: [
        ...identity.nomenclature.limitations.filter(
          (item) => !item.toLocaleLowerCase().includes("estimated name"),
        ),
        "For a name-imported molecule, PocketChem preserves the bundled database identity associated with the structure instead of replacing it with a second local naming guess.",
      ],
    },
  };
}

export function isGenericResolution(resolution: MoleculeNameResolution): boolean {
  return resolution.smiles.includes("*") || /(?:R(?![a-z])\d*|\([^)]*\)\s*[nm]|\bn\b)/.test(resolution.molecularFormula ?? "");
}

/** Canonical isomeric matching: never inherit an alias across charge, isotope or stereo changes. */
export async function resolveStructureIdentity(structure: string, identity: MoleculeIdentityResult, resolution: MoleculeNameResolution | null | undefined): Promise<MoleculeIdentityResult> {
  if (!resolution) return identity;
  const [current, original] = await Promise.all([molecularStructureKey(structure), molecularStructureKey(resolution.smiles)]);
  if (!current || current !== original) return identity;
  return applyResolvedNameToIdentity(identity, resolution);
}

export async function molecularStructureKey(structure: string): Promise<string | null> {
  const rdkit = await getRDKit();
  let mol;
  try {
    mol = rdkit.get_mol(structure);
    return mol?.get_smiles().split(".").sort().join(".") ?? null;
  } catch { return null; } finally { mol?.delete(); }
}

/** Bounded suggestions from the same offline database, with concrete formula and scaffold match. */
export async function findConcreteNameVariants(resolution: MoleculeNameResolution): Promise<MoleculeNameResolution[]> {
  if (!isGenericResolution(resolution)) return [];
  const records = await findRelatedChemicalNames([resolution.query, resolution.title ?? ""]);
  const rdkit = await getRDKit();
  const template = rdkit.get_mol(resolution.smiles);
  if (!template) return [];
  // A molecule dummy atom is element 0; a SMARTS wildcard is a query for any atom.
  const scaffold = rdkit.get_qmol(template.get_smarts().replace(/\[#0\]/g, "[*]"));
  template.delete();
  if (!scaffold) return [];
  const variants: MoleculeNameResolution[] = [];
  try {
    for (const record of records) {
      const candidate: MoleculeNameResolution = { query: record.preferredName ?? record.chebiId, smiles: record.smiles, title: toPlainChemicalName(record.preferredName), iupacName: toPlainChemicalName(record.iupacName), molecularFormula: record.molecularFormula, sourceId: record.chebiId, inchiKey: record.inchiKey, connectivitySmiles: null, source: "chebi" };
      if (isGenericResolution(candidate)) continue;
      const mol = rdkit.get_mol(candidate.smiles);
      if (!mol) continue;
      try {
        const match = JSON.parse(mol.get_substruct_match(scaffold));
        if (match.atoms?.length) variants.push(candidate);
      } finally { mol.delete(); }
      if (variants.length >= 6) break;
    }
  } finally { scaffold.delete(); }
  return variants;
}
