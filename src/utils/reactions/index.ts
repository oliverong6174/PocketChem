import type { FunctionalGroupResult } from "../functionalGroups/types";
import { predictReactionPathwaysFromRules } from "./engine/reactionEngine";
import { reactionRegistry } from "./reactionRegistry";

export type {
  OrganicChemCourse,
  ProductGenerationStatus,
  ReactionPathway,
  ReactionRule,
  ReactionTransform,
  ReactionTrigger,
} from "./reactionTypes";
export { reactionRegistry } from "./reactionRegistry";
export { validateReactionRegistry } from "./reactionValidation";
export * from "./families";
export { getRuleChapter, getRuleCourse } from "./reactionCurriculum";
export {
  filterReactionRules,
  getReactionCatalogSummary,
  getRuleProductStatus,
  type ReactionCatalogSummary,
} from "./reactionCatalog";
export { predictReactionPathwaysFromRules } from "./engine/reactionEngine";

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
