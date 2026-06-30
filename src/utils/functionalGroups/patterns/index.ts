import { chargedGroups } from "./charged";
import { carbonylGroups } from "./carbonyls/index";
import { oxygenGroups } from "./oxygen";
import { nitrogenGroups } from "./nitrogen";
import { sulfurPhosphorusGroups } from "./sulfurPhosphorus";
import { aromaticGroups } from "./aromatics";
import { advancedGroups } from "./advanced";
import { hydrocarbonGroups } from "./hydrocarbons/index";

export const functionalGroupRegistry = {
  charged: chargedGroups,
  carbonyls: carbonylGroups,
  oxygen: oxygenGroups,
  nitrogen: nitrogenGroups,
  sulfurPhosphorus: sulfurPhosphorusGroups,
  aromatics: aromaticGroups,
  hydrocarbons: hydrocarbonGroups,
  advanced: advancedGroups,
};

export const FUNCTIONAL_GROUPS = Object.values(
  functionalGroupRegistry
).flat();