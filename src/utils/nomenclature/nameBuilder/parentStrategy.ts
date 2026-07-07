import type { FunctionalGroupResult } from "../../functionalGroups/types";

import { getNamingIntent } from "./namingIntent";

export function getParentStrategy(group: FunctionalGroupResult | null) {
  return getNamingIntent(group).parentStrategy;
}