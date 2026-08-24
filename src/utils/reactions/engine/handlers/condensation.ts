import { runReactionSmarts } from "../rdkitReaction";

type CondensationMode = "oximeFormation";

export async function condensation(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const mode = options?.mode as CondensationMode | undefined;

  if (mode !== "oximeFormation") {
    console.warn("Condensation handler missing or unsupported mode:", options);
    return [];
  }

  return runReactionSmarts(
    reactantSmiles,
    "[C:1]=[O:2]>>[C:1]=NO"
  );
}
