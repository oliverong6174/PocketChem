import { runReactionSmarts } from "../rdkitReaction";
import { classifyCarbonyl } from "./carbonylUtils";

type CarbonylMode = "oximeFormation";

export async function carbonyl(
  reactantSmiles: string,
  options?: Record<string, unknown>
): Promise<string[]> {
  const mode = options?.mode as CarbonylMode | undefined;

  if (mode !== "oximeFormation") {
    console.warn("Carbonyl handler missing or unsupported mode:", options);
    return [];
  }

  const carbonylType = await classifyCarbonyl(reactantSmiles);
  if (carbonylType !== "aldehyde" && carbonylType !== "ketone") {
    return [];
  }

  return runReactionSmarts(reactantSmiles, "[C:1]=[O:2]>>[C:1]=NO");
}
