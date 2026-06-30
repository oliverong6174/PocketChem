import { saturatedHydrocarbons } from "./saturated";
import { unsaturatedHydrocarbons } from "./unsaturated";
import { cyclicHydrocarbonGroups } from "./cyclicHCs";
import { halogenGroups } from "./halogens";

export const hydrocarbonGroups = [
  ...unsaturatedHydrocarbons,
  ...cyclicHydrocarbonGroups,
  ...halogenGroups,
  ...saturatedHydrocarbons,
];