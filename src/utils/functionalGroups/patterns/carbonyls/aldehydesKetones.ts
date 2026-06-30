import type { FunctionalGroupPattern } from "../../types";

export const aldehydeKetoneGroups: FunctionalGroupPattern[] = [
  {
    name: "Aldehyde",
    priority: 8,
    nomenclaturePriority: 8,
    confidence: "High",
    suffix: "-al",
    prefix: "formyl / oxo",
    smarts: "[CX3H1](=[OX1])[#6,H]",
    mcatNote:
      "Aldehydes contain a terminal carbonyl. They are electrophilic and readily oxidized to carboxylic acids.",
  },
  {
    name: "Ketone",
    priority: 9,
    nomenclaturePriority: 9,
    confidence: "High",
    suffix: "-one",
    prefix: "oxo",
    smarts: "[#6][CX3](=[OX1])[#6]",
    mcatNote:
      "Ketones contain an internal carbonyl. They undergo nucleophilic addition reactions and are less easily oxidized than aldehydes.",
  },
  {
    name: "Enol",
    priority: 10.8,
    nomenclaturePriority: 10.8,
    confidence: "Medium",
    suffix: "-enol",
    prefix: "hydroxy",
    equivalentNames: ["alkenol"],
    smarts: "[OX2H][C]=[C]",
    mcatNote:
      "Enols contain an OH group attached to an alkene carbon. They are the tautomeric forms of aldehydes and ketones and readily interconvert through keto-enol tautomerism.",
  },
  {
    name: "Aldol",
    priority: 10.7,
    nomenclaturePriority: 10.7,
    confidence: "Medium",
    suffix: "hydroxy carbonyl",
    prefix: "hydroxyoxo",
    equivalentNames: ["β-hydroxy aldehyde", "β-hydroxy ketone"],
    smarts: "[OX2H][CX4][CX3](=O)",
    mcatNote:
      "Aldols are β-hydroxy aldehydes or ketones formed by aldol addition reactions.",
  },
  {
    name: "Benzoin",
    priority: 10.6,
    nomenclaturePriority: 10.6,
    confidence: "Medium",
    suffix: "benzoin",
    prefix: "hydroxyoxo",
    equivalentNames: ["α-hydroxy aryl ketone"],
    smarts: "[a][CX3](=O)[CX4]([OX2H])[a]",
    mcatNote:
      "Benzoin is an α-hydroxy ketone connecting two aromatic rings. It is produced in the benzoin condensation.",
  },
  {
    name: "Imine",
    priority: 12,
    nomenclaturePriority: 12,
    confidence: "High",
    suffix: "-imine",
    prefix: "imino",
    smarts: "[CX3]=[NX2]",
    mcatNote:
      "Imines are carbonyl analogs in which oxygen has been replaced by nitrogen. They are formed from aldehydes or ketones reacting with primary amines.",
  },
  {
    name: "Hydrazone",
    priority: 13,
    nomenclaturePriority: 12.5,
    confidence: "Medium",
    suffix: "hydrazone",
    prefix: "hydrazono",
    smarts: "[CX3]=[NX2][NX3]",
    mcatNote:
      "Hydrazones are condensation products of aldehydes or ketones with hydrazine derivatives.",
  },
  {
    name: "Oxime",
    priority: 14,
    nomenclaturePriority: 12.6,
    confidence: "Medium",
    suffix: "-oxime",
    prefix: "hydroxyimino",
    smarts: "[CX3]=[NX2][OX2H]",
    mcatNote:
      "Oximes are formed when aldehydes or ketones react with hydroxylamine. They are useful synthetic intermediates.",
  },
];