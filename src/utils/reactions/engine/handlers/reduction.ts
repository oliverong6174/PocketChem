import { runReactionSmarts } from "../rdkitReaction";

type ReductionMode = "carbonylToAlkane";

export async function reduction(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const mode = options?.mode as ReductionMode | undefined;

  if (mode !== "carbonylToAlkane") {
    console.warn("Reduction handler missing or unsupported mode:", options);
    return [];
  }

  return runReactionSmarts(
    reactantSmiles,
    "[C:1]=[O:2]>>[C:1]"
  );
}
