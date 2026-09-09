import { reactionFamilies } from "./families";
import { deriveReactionDisplayMetadata } from "./reactionDisplay";
import { resolveReactantRequirement } from "./profiles/reactants";
import type { ReactionRule } from "./reactionTypes";
import { assertValidReactionRegistry } from "./reactionValidation";

function normalizeReactionRule(rule: ReactionRule): ReactionRule {
  const normalized: ReactionRule = {
    ...rule,
    additionalReactants: rule.additionalReactants?.map(resolveReactantRequirement),
    planningCost: rule.planningCost ?? rule.priority,
  };

  normalized.display = deriveReactionDisplayMetadata(normalized) ?? undefined;
  return normalized;
}

/**
 * Runtime registry contains normalized, self-describing rules. Family files may
 * stay concise, while every consumer sees stable reactant IDs, supply metadata,
 * display metadata, and an explicit planning cost.
 */
export const reactionRegistry: ReactionRule[] = reactionFamilies
  .flat()
  .map(normalizeReactionRule);

assertValidReactionRegistry(reactionRegistry);
