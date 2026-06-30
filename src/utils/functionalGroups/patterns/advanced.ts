import type { FunctionalGroupPattern } from "../types";

export const advancedGroups: FunctionalGroupPattern[] = [
  {
    name: "Enamine",
    priority: 15.8,
    nomenclaturePriority: 13.3,
    confidence: "Medium",
    suffix: "Usually named descriptively",
    prefix: "aminoalkenyl",
    equivalentNames: ["alkenyl amine"],
    smarts: "[NX3][C]=[C]",
    mcatNote:
      "Enamines contain an amine attached to an alkene. They are nitrogen analogs of enols and are useful nucleophilic intermediates.",
  },
  {
    name: "Aldol",
    priority: 10.7,
    nomenclaturePriority: 10.7,
    confidence: "Medium",
    suffix: "hydroxy carbonyl",
    prefix: "hydroxyoxo",
    equivalentNames: ["beta-hydroxy aldehyde or ketone"],
    smarts: "[OX2H][CX4][CX3](=O)",
    mcatNote:
      "Aldols are beta-hydroxy carbonyl compounds formed in aldol addition reactions.",
  },
  {
    name: "Benzoin",
    priority: 10.6,
    nomenclaturePriority: 10.6,
    confidence: "Medium",
    suffix: "benzoin",
    prefix: "hydroxyoxo",
    equivalentNames: ["alpha-hydroxy aryl ketone"],
    smarts: "[a][CX3](=O)[CX4]([OX2H])[a]",
    mcatNote:
      "Benzoin contains an alpha-hydroxy ketone connecting two aromatic rings. It is the product of benzoin condensation.",
  },
];