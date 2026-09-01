import { acidChlorideReactionRules } from "./acidChlorides";
import { alcoholReactionRules } from "./alcohols";
import { aldehydeReactionRules } from "./aldehydes";
import { alkaneReactionRules } from "./alkanes";
import { alkeneReactionRules } from "./alkenes";
import { alkyneReactionRules } from "./alkynes";
import { amideReactionRules } from "./amides";
import { amineReactionRules } from "./amines";
import { anhydrideReactionRules } from "./anhydrides";
import { aromaticReactionRules } from "./aromatics";
import { carboxylicAcidReactionRules } from "./carboxylicAcids";
import { carbonylDerivativeReactionRules } from "./carbonylDerivatives";
import { couplingReactionRules } from "./couplings";
import { diazoniumReactionRules } from "./diazonium";
import { dieneReactionRules } from "./dienes";
import { enolateReactionRules } from "./enolates";
import { epoxideReactionRules } from "./epoxides";
import { esterReactionRules } from "./esters";
import { etherReactionRules } from "./ethers";
import { haloalkaneReactionRules } from "./haloalkanes";
import { ketoneReactionRules } from "./ketones";
import { nitrileReactionRules } from "./nitriles";
import { phenolReactionRules } from "./phenols";
import { sulfurReactionRules } from "./sulfur";
import type { ReactionRule } from "../reactionTypes";

export {
  acidChlorideReactionRules,
  alcoholReactionRules,
  aldehydeReactionRules,
  alkaneReactionRules,
  alkeneReactionRules,
  alkyneReactionRules,
  amideReactionRules,
  amineReactionRules,
  anhydrideReactionRules,
  aromaticReactionRules,
  carboxylicAcidReactionRules,
  carbonylDerivativeReactionRules,
  couplingReactionRules,
  diazoniumReactionRules,
  dieneReactionRules,
  enolateReactionRules,
  epoxideReactionRules,
  esterReactionRules,
  etherReactionRules,
  haloalkaneReactionRules,
  ketoneReactionRules,
  nitrileReactionRules,
  phenolReactionRules,
  sulfurReactionRules,
};

export const reactionFamilies: ReadonlyArray<ReadonlyArray<ReactionRule>> = [
  alkaneReactionRules,
  haloalkaneReactionRules,
  alkeneReactionRules,
  alkyneReactionRules,
  alcoholReactionRules,
  etherReactionRules,
  epoxideReactionRules,
  dieneReactionRules,
  aromaticReactionRules,
  phenolReactionRules,
  aldehydeReactionRules,
  ketoneReactionRules,
  carbonylDerivativeReactionRules,
  couplingReactionRules,
  enolateReactionRules,
  carboxylicAcidReactionRules,
  acidChlorideReactionRules,
  anhydrideReactionRules,
  esterReactionRules,
  amideReactionRules,
  nitrileReactionRules,
  amineReactionRules,
  diazoniumReactionRules,
  sulfurReactionRules,
];
