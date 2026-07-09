import { chargedGroups } from "./ions";
import { carbonylGroups } from "./carbonyls/index";
import { oxygenGroups } from "./oxygen";
import { nitrogenGroups } from "./nitrogen";
import { sulfurGroups } from "./sulfur";
import { phosphorusGroups } from "./phosphorus";
import { boronGroups } from "./boron";
import { siliconGroups } from "./silicon";
import { aromaticGroups } from "./aromatics";
import { hydrocarbonGroups } from "./hydrocarbons/index";
import { validateFunctionalGroupPatterns } from "../validator";


export const functionalGroupRegistry = {
  charged: chargedGroups,
  carbonyls: carbonylGroups,
  oxygen: oxygenGroups,
  nitrogen: nitrogenGroups,
  sulfur: sulfurGroups,
  phosphorus: phosphorusGroups,
    boron: boronGroups,
  silicon: siliconGroups,
  aromatics: aromaticGroups,
  hydrocarbons: hydrocarbonGroups,
};

export const FUNCTIONAL_GROUPS = Object.values(
  functionalGroupRegistry
).flat();

if (import.meta.env.DEV) {
  validateFunctionalGroupPatterns(FUNCTIONAL_GROUPS);
}