import type { MoleculeIdentityResult } from "./nomenclatureUtils";
import {
  findCarbohydrateVariants,
  findRelatedChemicalNames,
  lookupLocalChemicalNameDetailed,
  normalizeChemicalName,
  type LocalChemicalNameRecord,
  type SugarForm,
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
  /** Set on choices offered for an ambiguous name: the specific form and a short qualifier. */
  variantLabel?: string;
  variantDetail?: string;
};

/** The offline database has no unique entry for the name (as opposed to a database read failure). */
export class MoleculeNameNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoleculeNameNotFoundError";
  }
}

/** The name matches several structures; `variants` are the supported specific choices. */
export class MoleculeNameAmbiguousError extends MoleculeNameNotFoundError {
  variants: MoleculeNameResolution[];
  constructor(message: string, variants: MoleculeNameResolution[]) {
    super(message);
    this.name = "MoleculeNameAmbiguousError";
    this.variants = variants;
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

function toResolution(local: LocalChemicalNameRecord, query: string, variant: { label: string; detail: string } | null): MoleculeNameResolution {
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
  if (variant) {
    resolution.variantLabel = variant.label;
    resolution.variantDetail = variant.detail;
  }
  return resolution;
}

/** A short name and qualifier for a carbohydrate form: "α-D-glucopyranose" / "cyclic six-membered ring, α anomer". */
function describeSugar(form: SugarForm): { label: string; detail: string } {
  const series = form.series === "l" ? "L" : "D";
  const anomer = form.anomer === "alpha" ? "α-" : form.anomer === "beta" ? "β-" : "";
  const ending = form.ring ? `o${form.ring}` : "ose";
  const label = `${form.open ? `${form.open}-` : ""}${anomer}${series}-${form.stem}${ending}`;
  const shape = form.open ? "open chain" : form.ring ?? "cyclic";
  const configuration = form.anomer ? `${form.anomer === "alpha" ? "α" : "β"} anomer` : form.open ? "" : "anomer unspecified";
  return { label, detail: [shape, configuration].filter(Boolean).join(", ") };
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

  let detail: Awaited<ReturnType<typeof lookupLocalChemicalNameDetailed>>;
  let sugar: Awaited<ReturnType<typeof findCarbohydrateVariants>>;
  try {
    [detail, sugar] = await Promise.all([lookupLocalChemicalNameDetailed(query), findCarbohydrateVariants(query)]);
  } catch (error) {
    throw asLookupFailure(error);
  }

  // "glucose" or "D-glucose" does not say open chain versus ring, anomer or pyranose versus furanose, so the
  // database's single synonym match is not a safe answer: offer the supported forms instead.
  const mentionsSeries = sugar.variants.length > 0;
  if (mentionsSeries && !sugar.qualified && (sugar.variants.length > 1 || !detail.record)) {
    throw new MoleculeNameAmbiguousError(
      `“${query}” does not specify one structure. Choose the form you mean.`,
      sugar.variants.map(({ record, form }) => toResolution(record, query, describeSugar(form))),
    );
  }

  const local = detail.record;
  if (!local) {
    if (detail.candidates.length > 1) {
      throw new MoleculeNameAmbiguousError(
        `“${query}” matches several database structures. Choose the one you mean.`,
        detail.candidates.slice(0, 8).map((record) => toResolution(record, query, null)),
      );
    }
    throw new MoleculeNameNotFoundError(
      `No unique offline structure was found for “${query}”. Try another synonym or draw the molecule.`,
    );
  }

  const resolution = toResolution(local, query, null);

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

/** The same connectivity with every tetrahedral and double-bond stereo mark removed (for matching only). */
export async function flatStructureKey(structure: string): Promise<string | null> {
  const stripped = structure.replace(/[@/\\]/g, "");
  return molecularStructureKey(stripped);
}

/**
 * Specific stereoisomers of a name whose database structure leaves stereochemistry unspecified
 * (for example "leucine": L-leucine and D-leucine). Each candidate comes from the same offline database
 * under its own name and is accepted only when it has exactly the same connectivity. No isomer is chosen for the user.
 */
export async function findStereoVariants(resolution: MoleculeNameResolution): Promise<MoleculeNameResolution[]> {
  if (isGenericResolution(resolution)) return [];
  const base = (resolution.title ?? resolution.query).trim();
  if (!base || /^(?:[dl]|dl|\(?[rs]\)?)-/i.test(base)) return [];
  const flat = await flatStructureKey(resolution.smiles);
  if (!flat) return [];
  const variants: MoleculeNameResolution[] = [];
  for (const prefix of ["L", "D"]) {
    const name = `${prefix}-${base}`;
    try {
      const candidate = await resolveMoleculeName(name);
      if (candidate.smiles === resolution.smiles || (await flatStructureKey(candidate.smiles)) !== flat) continue;
      variants.push({ ...candidate, variantLabel: name, variantDetail: "specified stereochemistry" });
    } catch { /* this stereoisomer is not in the offline database */ }
  }
  return variants;
}
