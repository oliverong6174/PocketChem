import { acidDerivativeGroups } from "./acidDerivatives";
import { aldehydeKetoneGroups } from "./aldehydesKetones";
import { conjugatedCarbonyls } from "./conjugatedCarbonyls";
import { lactamGroups } from "./lactams";
import { lactimGroups } from "./lactims";
import { lactoneGroups } from "./lactones";

export const carbonylGroups = [
  ...acidDerivativeGroups,
  ...lactoneGroups,
  ...lactamGroups,
  ...lactimGroups,
  ...aldehydeKetoneGroups,
  ...conjugatedCarbonyls,
];