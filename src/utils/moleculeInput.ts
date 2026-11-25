/**
 * Unified molecule text input: a chemical name (common or IUPAC, resolved offline from the
 * bundled ChEBI index) or a SMILES string (validated and normalised by the existing RDKit
 * integration). There is no SMILES parser here: RDKit decides what is valid.
 *
 * Interpretation is conservative:
 *   - "smiles:<text>" forces SMILES.
 *   - Otherwise both readings are tried. If only one works it is used. If both work and they
 *     describe the same structure the name is used. If both work and they differ (for example
 *     a short string such as "CO"), the input is rejected as ambiguous and the user is told how
 *     to choose; PocketChem never picks silently.
 *
 * SMILES are normalised through RDKit before they reach the editor: explicit hydrogens that
 * RDKit treats as implicit are removed ("[H]C([H])([H])Br" becomes "CBr", the same form the
 * synthesis page later reads back from the editor), while connectivity, aromaticity, charges,
 * isotopes and explicit stereochemistry are preserved. Disconnected components stay separate.
 */
import { getRDKit } from "./rdkit";
import { normalizeChemicalName } from "./chemicalNameDatabase";
import {
  MoleculeNameAmbiguousError,
  MoleculeNameNotFoundError,
  resolveMoleculeName,
  type MoleculeNameResolution,
} from "./moleculeNameResolver";

export type MoleculeInputErrorCode =
  | "empty"
  | "too-long"
  | "invalid-smiles"
  | "not-found"
  | "ambiguous"
  | "too-many-components"
  | "lookup-failed"
  | "suspicious-alias";

export class MoleculeInputError extends Error {
  code: MoleculeInputErrorCode;
  /** Supported specific structures to choose from when a name matches several. */
  variants: MoleculeNameResolution[];
  constructor(code: MoleculeInputErrorCode, message: string, variants: MoleculeNameResolution[] = []) {
    super(message);
    this.name = "MoleculeInputError";
    this.code = code;
    this.variants = variants;
  }
}

export type NormalizedSmiles = {
  /** Canonical isomeric SMILES of the whole input (components joined with "."). */
  smiles: string;
  /** One canonical SMILES per disconnected component. */
  components: string[];
};

export type MoleculeInputResolution = {
  kind: "name" | "smiles";
  /** The text the user typed, without a "smiles:" prefix. */
  query: string;
  /** SMILES to load into the editor (RDKit-normalised; components joined with "."). */
  smiles: string;
  components: string[];
  /** Present for names: the unchanged offline database resolution. */
  nameResolution: MoleculeNameResolution | null;
  /** Short text for the status line. */
  label: string;
  /** Anything the user should know about how the input was read. */
  notes: string[];
};

export type MoleculeInputDeps = {
  resolveName?: (query: string) => Promise<MoleculeNameResolution>;
  normalize?: (smiles: string) => Promise<NormalizedSmiles | null>;
};

export type MoleculeInputOptions = MoleculeInputDeps & {
  /** Most disconnected components accepted (the synthesis target takes one). */
  maxComponents?: number;
};

const MAX_SMILES_LENGTH = 2000;
const MAX_NAME_LENGTH = 240;
const SMILES_PREFIX = /^smiles\s*:\s*/i;

/**
 * Validates a SMILES with RDKit and returns its canonical form, or null when RDKit cannot
 * parse it. Whitespace is rejected first: RDKit would otherwise read text after a space as a
 * molecule title and accept "CC water" as ethane.
 */
export async function normalizeSmilesWithRdkit(input: string): Promise<NormalizedSmiles | null> {
  const text = input.trim();
  if (!text || text.length > MAX_SMILES_LENGTH || /\s/.test(text)) return null;
  let rdkit;
  try {
    rdkit = await getRDKit();
  } catch {
    return null;
  }
  let mol;
  try {
    mol = rdkit.get_mol(text);
  } catch {
    return null;
  }
  if (!mol) return null;
  try {
    if (typeof mol.is_valid === "function" && !mol.is_valid()) return null;
    const smiles = mol.get_smiles?.();
    if (typeof smiles !== "string" || !smiles.trim()) return null;
    const canonical = smiles.trim();
    // RDKit writes each disconnected fragment as its own dot-separated part and never lets a
    // ring-closure bond span a dot, so splitting its canonical output is safe.
    const components = canonical.split(".").filter(Boolean);
    return components.length > 0 ? { smiles: canonical, components } : null;
  } catch {
    return null;
  } finally {
    mol.delete?.();
  }
}

// Text built only from organic-subset atom symbols, bonds, branches and ring digits: it "looks
// like" SMILES even when RDKit rejects it (for example lowercase "cc", aromatic atoms outside a ring).
const SMILES_LOOKING = /^(?=.*[BCNOPSFIbcnops])(?:Cl|Br|[BCNOPSFIbcnops]|[0-9]|%[0-9]{2}|[=#$:/\\()+.@-])+$/;

function heavyAtomCount(formula: string | null): number | null {
  if (!formula || !/^(?:[A-Z][a-z]?\d*)+$/.test(formula)) return null;
  let total = 0;
  for (const [, element, count] of formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    if (element !== "H") total += count ? Number(count) : 1;
  }
  return total;
}

/**
 * General guard against short synonyms hijacking SMILES-like typing. Input is suspicious when
 * (1) it is not valid SMILES but is made only of SMILES characters, (2) the database reached its
 * structure through a synonym rather than the entry's own title or IUPAC name, and (3) that
 * structure has more than twice as many non-hydrogen atoms as the text has characters, so the
 * text could not plausibly be a SMILES for it. Real abbreviations and formulas (DMF, THF, Na,
 * CCl4, NO2) fail condition (1) or (3) and still resolve.
 */
function suspiciousShortAlias(
  query: string,
  resolution: MoleculeNameResolution,
): { heavyAtoms: number } | null {
  if (!SMILES_LOOKING.test(query)) return null;
  const key = normalizeChemicalName(query);
  if ([resolution.title, resolution.iupacName].some((name) => name && normalizeChemicalName(name) === key)) {
    return null;
  }
  const heavyAtoms = heavyAtomCount(resolution.molecularFormula);
  if (heavyAtoms === null || heavyAtoms <= 2 * query.length) return null;
  return { heavyAtoms };
}

function componentLabel(components: string[]): string {
  return components.length === 1 ? components[0] : `${components.length} components: ${components.join(" . ")}`;
}

function assertComponentLimit(components: string[], maxComponents: number | undefined, what: string) {
  if (maxComponents !== undefined && components.length > maxComponents) {
    throw new MoleculeInputError(
      "too-many-components",
      `${what} contains ${components.length} separate molecules, but this editor accepts ${
        maxComponents === 1 ? "one connected molecule" : `at most ${maxComponents} molecules`
      }. Enter a single molecule (nothing was dropped or loaded).`,
    );
  }
}

export async function resolveMoleculeInput(
  rawInput: string,
  options: MoleculeInputOptions = {},
): Promise<MoleculeInputResolution> {
  const resolveName = options.resolveName ?? resolveMoleculeName;
  const normalize = options.normalize ?? normalizeSmilesWithRdkit;
  const trimmed = rawInput.trim();
  if (!trimmed) throw new MoleculeInputError("empty", "Enter a chemical name or SMILES first.");

  const forced = SMILES_PREFIX.test(trimmed);
  const query = forced ? trimmed.replace(SMILES_PREFIX, "").trim() : trimmed;
  if (!query) throw new MoleculeInputError("empty", "Enter a SMILES after “smiles:”.");

  // ---- explicit SMILES -------------------------------------------------------------------
  if (forced) {
    if (/\s/.test(query)) {
      throw new MoleculeInputError("invalid-smiles", `“${query}” is not a valid SMILES: SMILES cannot contain spaces.`);
    }
    if (query.length > MAX_SMILES_LENGTH) {
      throw new MoleculeInputError("too-long", "That SMILES is too long to load safely.");
    }
    const parsed = await normalize(query);
    if (!parsed) {
      throw new MoleculeInputError("invalid-smiles", `“${query}” is not a valid SMILES (RDKit could not parse it).`);
    }
    assertComponentLimit(parsed.components, options.maxComponents, `“${query}”`);
    return {
      kind: "smiles",
      query,
      smiles: parsed.smiles,
      components: parsed.components,
      nameResolution: null,
      label: `SMILES ${componentLabel(parsed.components)}`,
      notes: [],
    };
  }

  if (trimmed.length > Math.max(MAX_NAME_LENGTH, MAX_SMILES_LENGTH)) {
    throw new MoleculeInputError("too-long", "That input is too long to resolve safely.");
  }

  // ---- try both readings -----------------------------------------------------------------
  const parsedPromise = normalize(trimmed);
  const namePromise: Promise<
    { ok: true; value: MoleculeNameResolution } | { ok: false; notFound: boolean; message: string; variants: MoleculeNameResolution[] }
  > =
    trimmed.length > MAX_NAME_LENGTH
      ? Promise.resolve({ ok: false as const, notFound: true, message: "", variants: [] })
      : resolveName(trimmed).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({
            ok: false as const,
            notFound: error instanceof MoleculeNameNotFoundError,
            message: error instanceof Error ? error.message : "The molecule name could not be resolved.",
            variants: error instanceof MoleculeNameAmbiguousError ? error.variants : [],
          }),
        );
  const [parsed, named] = await Promise.all([parsedPromise, namePromise]);

  if (parsed && !named.ok) {
    assertComponentLimit(parsed.components, options.maxComponents, `“${trimmed}”`);
    return {
      kind: "smiles",
      query: trimmed,
      smiles: parsed.smiles,
      components: parsed.components,
      nameResolution: null,
      label: `SMILES ${componentLabel(parsed.components)}`,
      notes: named.notFound
        ? []
        : ["The chemical-name lookup was unavailable, so this input was read as SMILES without checking it against names."],
    };
  }

  if (!parsed && named.ok) {
    const alias = suspiciousShortAlias(trimmed, named.value);
    if (alias) {
      const upper = trimmed.toUpperCase();
      const upperReading = upper !== trimmed ? await normalize(upper) : null;
      const caseHint = upperReading
        ? ` SMILES is case-sensitive: “${upper}” would be read as ${upperReading.smiles}.`
        : "";
      throw new MoleculeInputError(
        "suspicious-alias",
        `“${trimmed}” is not valid SMILES.${caseHint} The offline database only lists it as a short synonym for ${
          named.value.title || named.value.iupacName || "a larger molecule"
        } (${alias.heavyAtoms} non-hydrogen atoms), which a ${trimmed.length}-character SMILES-like text cannot describe, so nothing was loaded. Enter the full chemical name, or type “smiles:” followed by a SMILES string.`,
      );
    }
    return fromName(trimmed, named.value, normalize, options.maxComponents, []);
  }

  if (parsed && named.ok) {
    const nameStructure = await normalize(named.value.smiles);
    if (nameStructure && nameStructure.smiles === parsed.smiles) {
      // Both readings are the same molecule: nothing to choose between.
      return fromName(trimmed, named.value, normalize, options.maxComponents, [
        "The input is both a valid SMILES and a chemical name for the same structure.",
      ]);
    }
    const nameTitle = named.value.title || named.value.iupacName || "a database entry";
    throw new MoleculeInputError(
      "ambiguous",
      `“${trimmed}” is ambiguous: as SMILES it is ${parsed.smiles}, but it is also a chemical name in the database for ${nameTitle} (${
        nameStructure?.smiles ?? named.value.smiles
      }). Type “smiles:${trimmed}” to draw the SMILES, or enter the full chemical name.`,
    );
  }

  // Neither reading worked.
  if (!named.ok && named.variants.length > 0) {
    throw new MoleculeInputError("ambiguous", named.message, named.variants);
  }
  if (!named.ok && !named.notFound) {
    throw new MoleculeInputError(
      "lookup-failed",
      `${named.message} “${trimmed}” was also not a valid SMILES.`,
    );
  }
  throw new MoleculeInputError(
    "not-found",
    `“${trimmed}” is not a valid SMILES and no unique offline chemical name was found for it. Check the spelling, try another synonym, or type “smiles:” followed by a SMILES string.`,
  );
}

/** Load a database structure the user picked from an ambiguity list (same normalisation as a typed name). */
export function inputFromNameResolution(
  resolution: MoleculeNameResolution,
  options: MoleculeInputOptions = {},
): Promise<MoleculeInputResolution> {
  return fromName(resolution.variantLabel ?? resolution.query, resolution, options.normalize ?? normalizeSmilesWithRdkit, options.maxComponents, []);
}

async function fromName(
  query: string,
  resolution: MoleculeNameResolution,
  normalize: (smiles: string) => Promise<NormalizedSmiles | null>,
  maxComponents: number | undefined,
  notes: string[],
): Promise<MoleculeInputResolution> {
  // Same RDKit normalisation as SMILES input, so a database entry written with explicit
  // hydrogens ("[H]C([H])([H])Br") loads as the equivalent ordinary form ("CBr"). If RDKit
  // cannot read the database SMILES, the stored form is used unchanged.
  const normalized = await normalize(resolution.smiles);
  const components = normalized?.components ?? resolution.smiles.split(".").filter(Boolean);
  assertComponentLimit(components, maxComponents, `“${query}”`);
  const label = resolution.iupacName || resolution.title || resolution.query;
  return {
    kind: "name",
    query,
    smiles: normalized?.smiles ?? resolution.smiles,
    components,
    nameResolution: resolution,
    label: resolution.molecularFormula ? `${label} · ${resolution.molecularFormula}` : label,
    notes,
  };
}

/** The few Ketcher calls needed to put a resolved input into an editor. */
export type InputEditorApi = {
  setMolecule: (structure: string) => Promise<unknown>;
  addFragment?: (structure: string, options?: { needZoom?: boolean }) => Promise<unknown>;
  getSmiles: () => Promise<string>;
};

/**
 * Replace swaps the editor content for the input. Add keeps what is there and adds each
 * disconnected component as its own fragment, so components never merge or get dropped.
 * Starting-material inventory is unaffected: one drawn molecule is one available copy.
 */
export async function loadInputIntoEditor(
  api: InputEditorApi,
  input: Pick<MoleculeInputResolution, "smiles" | "components">,
  action: "add" | "replace",
): Promise<void> {
  if (action === "replace") {
    await api.setMolecule(input.smiles);
    return;
  }
  if (api.addFragment) {
    for (const component of input.components) {
      await api.addFragment(component, { needZoom: true });
    }
    return;
  }
  const current = (await api.getSmiles()).trim();
  await api.setMolecule(current ? `${current}.${input.smiles}` : input.smiles);
}
