import type { FunctionalGroupResult } from "../functionalGroups/types";
import { predictReactionPathwaysFromRules } from "./engine/reactionEngine";
import { reactionRegistry } from "./reactionRegistry";
import { predictRetrosynthesisPathwaysFromRules } from "./engine/retroSynthesis";
import { findMultistepSynthesisRoutesFromRules } from "./engine/multistepSynthesis";

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
  RetrosynthesisConfidence,
  RetrosynthesisPathway,
  MultistepSynthesisRoute,
  MultistepSynthesisSearchOptions,
  MultistepSynthesisProgress,
  SynthesisRouteConfidence,
  SynthesisStep,
  SynthesisStepSource,
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
export { predictRetrosynthesisPathwaysFromRules } from "./engine/retroSynthesis";
export { findMultistepSynthesisRoutesFromRules } from "./engine/multistepSynthesis";
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

export async function predictRetrosynthesisPathways(targetSmiles: string) {
  return predictRetrosynthesisPathwaysFromRules(targetSmiles, reactionRegistry);
}

export async function findMultistepSynthesisRoutes(
  startingSmiles: string,
  targetSmiles: string,
  options: import("./reactionTypes").MultistepSynthesisSearchOptions = {},
  onProgress?: (progress: import("./reactionTypes").MultistepSynthesisProgress) => void,
) {
  return findMultistepSynthesisRoutesFromRules(
    startingSmiles,
    targetSmiles,
    reactionRegistry,
    options,
    onProgress,
  );
}
