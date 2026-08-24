import { runReactionSmarts } from "../rdkitReaction";
import {
  readStringOption,
  warnUnsupportedHandlerMode,
} from "./handlerUtils";

type SubstitutionMode = "alkylHalideSubstitution" | "alcoholToHalide";
type AlkylHalideNucleophile = "hydroxide" | "cyanide" | "azide" | "ammonia";
type IncomingHalide = "chloride" | "bromide" | "iodide";

const ALKYL_HALIDE_NUCLEOPHILES = [
  "hydroxide",
  "cyanide",
  "azide",
  "ammonia",
] as const satisfies readonly AlkylHalideNucleophile[];

const INCOMING_HALIDES = [
  "chloride",
  "bromide",
  "iodide",
] as const satisfies readonly IncomingHalide[];

const alkylHalideSubstitutionSmarts: Record<AlkylHalideNucleophile, string> = {
  hydroxide: "[C;X4:1][Cl,Br,I:2]>>[C:1]O",
  cyanide: "[C;X4:1][Cl,Br,I:2]>>[C:1]C#N",
  azide: "[C;X4:1][Cl,Br,I:2]>>[C:1][N-][N+]#N",
  ammonia: "[C;X4:1][Cl,Br,I:2]>>[C:1]N",
};

const alcoholToHalideSmarts: Record<IncomingHalide, string> = {
  chloride: "[C:1][OH:2]>>[C:1]Cl",
  bromide: "[C:1][OH:2]>>[C:1]Br",
  iodide: "[C:1][OH:2]>>[C:1]I",
};

/**
 * Reusable net substitution transforms.
 *
 * Mechanistic eligibility (SN1 vs SN2, substrate class, solvent, etc.) remains
 * in each ReactionRule trigger/metadata. This handler only performs the shared
 * graph edit after a rule has already matched the substrate.
 */
export async function substitution(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const mode = options?.mode as SubstitutionMode | undefined;

  if (mode === "alkylHalideSubstitution") {
    const nucleophile = readStringOption(
      options,
      "nucleophile",
      ALKYL_HALIDE_NUCLEOPHILES
    );

    if (!nucleophile) {
      warnUnsupportedHandlerMode("Substitution", options);
      return [];
    }

    return runReactionSmarts(
      reactantSmiles,
      alkylHalideSubstitutionSmarts[nucleophile]
    );
  }

  if (mode === "alcoholToHalide") {
    const halide = readStringOption(options, "halide", INCOMING_HALIDES);

    if (!halide) {
      warnUnsupportedHandlerMode("Substitution", options);
      return [];
    }

    return runReactionSmarts(reactantSmiles, alcoholToHalideSmarts[halide]);
  }

  warnUnsupportedHandlerMode("Substitution", options);
  return [];
}
