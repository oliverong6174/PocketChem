import type { ReactionRule } from "./reactionTypes";
import { acidChlorideReactionRules } from "./families/acidChlorides";
import { alcoholReactionRules } from "./families/alcohols";
import { aldehydeReactionRules } from "./families/aldehydes";
import { alkeneReactionRules } from "./families/alkenes";
import { alkyneReactionRules } from "./families/alkynes";
import { amideReactionRules } from "./families/amides";
import { amineReactionRules } from "./families/amines";
import { anhydrideReactionRules } from "./families/anhydrides";
import { aromaticReactionRules } from "./families/aromatics";
import { carboxylicAcidReactionRules } from "./families/carboxylicAcids";
import { epoxideReactionRules } from "./families/epoxides";
import { esterReactionRules } from "./families/esters";
import { etherReactionRules } from "./families/ethers";
import { ketoneReactionRules } from "./families/ketones";
import { legacyReactionRules } from "./reactionRules";

export const reactionRegistry: ReactionRule[] = [
  ...acidChlorideReactionRules,
  ...alcoholReactionRules,
  ...aldehydeReactionRules,
  ...alkeneReactionRules,
  ...alkyneReactionRules,
  ...alcoholReactionRules,
  ...amideReactionRules,
  ...amineReactionRules,
  ...anhydrideReactionRules,
  ...aromaticReactionRules,
  ...carboxylicAcidReactionRules,
  ...esterReactionRules,
  ...etherReactionRules,
  ...epoxideReactionRules,
  ...ketoneReactionRules,
  ...legacyReactionRules,
];