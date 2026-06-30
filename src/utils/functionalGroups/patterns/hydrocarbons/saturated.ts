import type { FunctionalGroupPattern } from "../../types";

export const saturatedHydrocarbons: FunctionalGroupPattern[] = [
  {
    name: "Alkane",
    priority: 32,
    nomenclaturePriority: 23,
    confidence: "Medium",
    suffix: "-ane",
    prefix: "alkyl",
    smarts: "[CX4;H3,H2,H1,H0]",
    mcatNote:
      "Alkanes are saturated hydrocarbons with only single bonds. They are nonpolar and relatively unreactive.",
  },
];