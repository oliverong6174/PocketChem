import type { MoleculeIdentityResult } from "./nomenclatureUtils";
import {
  findCarbohydrateVariants,
  findRelatedChemicalNames,
  lookupLocalChemicalNameDetailed,
  normalizeChemicalName,
  parseSugarName,
  type LocalChemicalNameRecord,
  type SugarForm,
  type SugarVariantRecord,
} from "./chemicalNameDatabase";
import { NAMED_PREFERENCES, SUGAR_PREFERENCES, type NamedPreference } from "./preferredForms";
import { restoreAromaticNH } from "./aromaticNH";
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
  /** Set when the name did not fix one structure and this one was chosen as the representative reading. */
  representative?: boolean;
  /** Every supported form of that name, representative first. Not stored with an analysis. */
  forms?: MoleculeNameResolution[];
  /** Set when the stored structure had to be completed (see aromaticNH.ts). */
  structureNote?: string;
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

function asRepresentative(choice: MoleculeNameResolution, forms: MoleculeNameResolution[]): MoleculeNameResolution {
  return forms.length > 1 ? { ...choice, representative: true, forms } : choice;
}

/** The database record a preference names, or null when this database does not hold exactly one. */
async function preferredRecord(name: string, query: string, label: string | null): Promise<MoleculeNameResolution | null> {
  const { record } = await lookupLocalChemicalNameDetailed(name);
  if (!record) return null;
  const resolution = toResolution(record, query, null);
  resolution.aliases = [...new Set([...(resolution.aliases ?? []), name])];
  resolution.variantLabel = label ?? resolution.title ?? name;
  return resolution;
}

async function resolvePreference(query: string, preference: NamedPreference): Promise<MoleculeNameResolution | null> {
  const stated = (name: string) => (preference.unspecified ? name : null);
  const [choice, ...rest] = await Promise.all([
    preferredRecord(preference.load, query, stated(preference.load)),
    ...preference.others.map((name) => preferredRecord(name, query, stated(name))),
    ...(preference.unspecified ? [preferredRecord(preference.unspecified, query, `${preference.unspecified}, stereochemistry unspecified`)] : []),
  ]);
  if (!choice) return null;
  const forms = [choice, ...rest.filter((form): form is MoleculeNameResolution => form !== null && form.sourceId !== choice.sourceId)];
  return asRepresentative(choice, forms);
}

/** Common alternatives first: pyranose anomers, the open chain, then the rarer ring forms; the stated or D series first. */
function formOrder(form: SugarForm): number {
  const shape = form.open ? 1 : form.ring === "pyranose" ? (form.anomer ? 0 : 2) : form.ring === "furanose" ? (form.anomer ? 3 : 4) : 5;
  return (form.series === "l" ? 100 : 0) + shape * 10 + (form.anomer === "beta" ? 0 : 1);
}

function preferredSugar(query: string, variants: SugarVariantRecord[]): MoleculeNameResolution | null {
  const asked = parseSugarName(query);
  const preference = asked && SUGAR_PREFERENCES[asked.stem];
  if (!asked || !preference) return null;
  const ordered = [...variants].sort((a, b) => formOrder(a.form) - formOrder(b.form));
  const index = ordered.findIndex(({ form }) => form.series === (asked.series ?? "d") && !form.open && form.ring === preference.ring && form.anomer === preference.anomer);
  if (index < 0) return null;
  const [chosen] = ordered.splice(index, 1);
  const forms = [chosen, ...ordered].map(({ record, form }) => toResolution(record, query, describeSugar(form)));
  return asRepresentative(forms[0], forms);
}

/** Completes stored structures that no toolkit can read because an aromatic N–H was dropped. */
async function readable(resolution: MoleculeNameResolution): Promise<MoleculeNameResolution> {
  if (resolution.structureNote || resolution.smiles.includes("*") || !resolution.smiles.includes("n")) return resolution;
  let rdkit: Awaited<ReturnType<typeof getRDKit>>;
  try {
    rdkit = await getRDKit();
  } catch {
    return resolution;
  }
  const mol = rdkit.get_mol(resolution.smiles);
  if (mol) {
    mol.delete();
    return resolution;
  }
  const restored = restoreAromaticNH(rdkit, resolution.smiles, resolution.molecularFormula);
  if (!restored) return resolution;
  return {
    ...resolution,
    smiles: restored.smiles,
    structureNote: restored.tautomer
      ? "The database entry does not record where the aromatic N–H sits; one tautomer matching its formula is shown."
      : "The aromatic N–H missing from the database entry was restored to match its formula.",
  };
}

async function readableResolution(resolution: MoleculeNameResolution): Promise<MoleculeNameResolution> {
  if (!resolution.forms) return readable(resolution);
  const forms = await Promise.all(resolution.forms.map(readable));
  return { ...forms[0], representative: resolution.representative, forms };
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
  try {
    return await readableResolution(await lookUpName(rawQuery));
  } catch (error) {
    if (error instanceof MoleculeNameAmbiguousError) error.variants = await Promise.all(error.variants.map(readable));
    throw error;
  }
}

async function lookUpName(rawQuery: string): Promise<MoleculeNameResolution> {
  const query = normalizeNameQuery(rawQuery);
  if (!query) throw new Error("Enter a common or IUPAC molecule name first.");
  if (query.length > 240) throw new Error("That molecule name is too long to resolve safely.");

  const key = cacheKey(query);
  const cached = resolverCache.get(key);
  if (cached) return { ...cached, query };

  // "open-chain D-glucose" is the database's aldehydo- (or, for a ketose, keto-) form.
  const openChain = /^(?:open[- ]chain|acyclic)[- ]+(.+)$/i.exec(query);
  if (openChain) {
    for (const prefix of ["aldehydo", "keto"]) {
      try {
        return { ...(await resolveMoleculeName(`${prefix}-${openChain[1]}`)), query };
      } catch (error) {
        if (!(error instanceof MoleculeNameNotFoundError)) throw error;
      }
    }
  }

  const preference = NAMED_PREFERENCES[key];
  if (preference) {
    let preferred: MoleculeNameResolution | null;
    try {
      preferred = await resolvePreference(query, preference);
    } catch (error) {
      throw asLookupFailure(error);
    }
    if (preferred) {
      rememberResolution(key, preferred);
      return preferred;
    }
  }

  let detail: Awaited<ReturnType<typeof lookupLocalChemicalNameDetailed>>;
  let sugar: Awaited<ReturnType<typeof findCarbohydrateVariants>>;
  try {
    [detail, sugar] = await Promise.all([lookupLocalChemicalNameDetailed(query), findCarbohydrateVariants(query, 32)]);
  } catch (error) {
    throw asLookupFailure(error);
  }

  // "glucose" or "D-glucose" does not say open chain versus ring, anomer or pyranose versus furanose, so the
  // database's single synonym match is not a safe answer: load the representative form where one is defined
  // (keeping every other form reachable), otherwise offer the supported forms.
  const mentionsSeries = sugar.variants.length > 0;
  if (mentionsSeries && !sugar.qualified && (sugar.variants.length > 1 || !detail.record)) {
    const preferred = preferredSugar(query, sugar.variants);
    if (preferred) {
      rememberResolution(key, preferred);
      return preferred;
    }
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

/** The identity of one structure, without the chooser data that came with the name. */
function withoutForms(resolution: MoleculeNameResolution): MoleculeNameResolution {
  const single = { ...resolution };
  delete single.forms;
  delete single.representative;
  return single;
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
      sourceId: resolution.sourceId ?? null, confidence: "Database match", fullySpecified, resolution: withoutForms(resolution),
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
