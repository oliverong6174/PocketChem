import type { ReactionRule } from "./reactionTypes";
import { alcoholReactionRules } from "./families/alcohols";
import { aldehydeReactionRules } from "./families/aldehydes";
import { alkeneReactionRules } from "./families/alkenes";
import { alkyneReactionRules } from "./families/alkynes";
import { epoxideReactionRules } from "./families/epoxides";
import { etherReactionRules } from "./families/ethers";
import { ketoneReactionRules } from "./families/ketones";
import { legacyReactionRules } from "./reactionRules";

export const reactionRegistry: ReactionRule[] = [
  ...alkeneReactionRules,
  ...alkyneReactionRules,
  ...alcoholReactionRules,
  ...etherReactionRules,
  ...epoxideReactionRules,
  ...aldehydeReactionRules,
  ...ketoneReactionRules,
  ...legacyReactionRules,
];