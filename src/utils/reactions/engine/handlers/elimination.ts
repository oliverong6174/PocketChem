import { runReactionSmarts } from "../rdkitReaction";
import {
  readPositiveIntegerOption,
  readStringOption,
  warnUnsupportedHandlerMode,
} from "./handlerUtils";

type EliminationMode = "betaElimination";
type LeavingGroup = "halide" | "alcohol";

const LEAVING_GROUPS = ["halide", "alcohol"] as const satisfies readonly LeavingGroup[];

const betaEliminationSmarts: Record<LeavingGroup, string> = {
  halide: "[C;H1,H2,H3:1][C;X4:2][Cl,Br,I:3]>>[C:1]=[C:2]",
  alcohol: "[C;H1,H2,H3:1][C:2][OH:3]>>[C:1]=[C:2]",
};

/**
 * Enumerates constitutional beta-elimination products.
 *
 * The rule layer remains responsible for saying whether the chemistry is E1,
 * E2, dehydration, Zaitsev-favored, Hofmann-favored, etc. This handler does
 * not pretend to rank anti-periplanar conformers or carbocation rearrangements
 * yet; it provides the reusable beta-site graph operation those rules need.
 */
export async function elimination(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const mode = options?.mode as EliminationMode | undefined;

  if (mode !== "betaElimination") {
    warnUnsupportedHandlerMode("Elimination", options);
    return [];
  }

  const leavingGroup = readStringOption(options, "leavingGroup", LEAVING_GROUPS);
  if (!leavingGroup) {
    warnUnsupportedHandlerMode("Elimination", options);
    return [];
  }

  const maxProducts = readPositiveIntegerOption(options, "maxProducts", 8);

  return runReactionSmarts(
    reactantSmiles,
    betaEliminationSmarts[leavingGroup],
    maxProducts
  );
}
