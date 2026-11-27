import { MoleculeInputError, resolveMoleculeInput, type MoleculeInputResolution } from "./moleculeInput";

/**
 * Shared "name or SMILES" entry used next to a structure editor.
 *
 * Resolution always goes through the one PocketChem resolver (resolveMoleculeInput: offline ChEBI database names,
 * SMILES, ambiguity and failure reporting). A tool may add a `fallback` for names the database lacks; the fallback is
 * only consulted after the shared resolver reports "not found", its result is re-validated through the shared resolver
 * as an explicit SMILES, and it is always shown as a different source.
 */
export type InputSource = "database" | "smiles" | "fallback";

export type ResolvedInput = {
  smiles: string;
  source: InputSource;
  /** One-line description of what was loaded. */
  label: string;
  /** Where it came from, for the status line. */
  provenance: string;
  notes: string[];
  resolution: MoleculeInputResolution;
};

export type FallbackReader = (text: string) => { ok: true; smiles: string; description: string; stereo: "specified" | "unspecified" } | { ok: false; reason: string };

export async function resolveWithFallback(text: string, options: { maxComponents?: number; fallback?: FallbackReader } = {}): Promise<ResolvedInput> {
  try {
    const resolution = await resolveMoleculeInput(text, { maxComponents: options.maxComponents });
    const fromName = resolution.kind === "name";
    return {
      smiles: resolution.smiles,
      source: fromName ? "database" : "smiles",
      label: resolution.label,
      provenance: fromName ? "name resolved from PocketChem's bundled offline ChEBI database" : "read as SMILES (stereochemistry exactly as written)",
      notes: resolution.notes,
      resolution,
    };
  } catch (error) {
    if (error instanceof MoleculeInputError && error.code === "not-found" && options.fallback) {
      const read = options.fallback(text);
      if (read.ok) {
        const resolution = await resolveMoleculeInput(`smiles:${read.smiles}`, { maxComponents: options.maxComponents });
        return {
          smiles: resolution.smiles,
          source: "fallback",
          label: read.description,
          provenance: "interpreted by PocketChem's small systematic-name reader (not in the ChEBI database)",
          notes: read.stereo === "unspecified" ? ["The name does not specify stereochemistry, so none was assigned."] : [],
          resolution,
        };
      }
      throw new MoleculeInputError("not-found", `${error.message} ${read.reason}`);
    }
    throw error;
  }
}

