import type { FunctionalGroupResult } from "../analyzeGroups";
import { predictReactionPathwaysFromRules } from "./engine/reactionEngine";
import { reactionRegistry } from "./reactionRegistry";

export type { ReactionPathway, ReactionRule } from "./reactionTypes";
export { reactionRegistry } from "./reactionRegistry";
export { alkeneReactionRules } from "./families/alkenes";

export async function predictReactionPathways(
  reactantSmiles: string,
  functionalGroups: FunctionalGroupResult[]
) {
  return predictReactionPathwaysFromRules(
    reactantSmiles,
    functionalGroups,
    reactionRegistry
  );
}