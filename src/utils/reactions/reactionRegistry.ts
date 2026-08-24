import { reactionFamilies } from "./families";
import type { ReactionRule } from "./reactionTypes";
import { assertValidReactionRegistry } from "./reactionValidation";

export const reactionRegistry: ReactionRule[] = reactionFamilies.flat();

assertValidReactionRegistry(reactionRegistry);
