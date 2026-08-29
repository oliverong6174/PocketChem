import type { FunctionalGroupResult } from "../functionalGroups/types";
import { predictReactionPathwaysFromRules } from "./engine/reactionEngine";
import { reactionRegistry } from "./reactionRegistry";

export type {
  OrganicChemCourse,
  ProductGenerationStatus,
  ReactionHandlerName,
  ReactionComponent,
  ReactionPathway,
  ReactionReactantRequirement,
  ReactionRule,
  ReactionPurpose,
  ReactionTransform,
  ReactionTrigger,
  ReactionType,
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
export {
  analyzeReactionComponents,
  isGenericReactionSmiles,
  normalizeKetcherRGroups,
  splitReactionComponents,
} from "./engine/reactionInput";

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
