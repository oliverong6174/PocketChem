import type { FunctionalGroupPattern } from "../types";

export const oxygenGroups: FunctionalGroupPattern[] = [
        {
    name: "Primary alcohol",
    priority: 9.7,
    nomenclaturePriority: 9.7,
    confidence: "High",
    suffix: "-ol",
    prefix: "hydroxy",
    equivalentNames: ["1° alcohol"],
    smarts: "[CH2][OX2H]",
    mcatNote:
        "Primary alcohols have the OH-bearing carbon attached to one other carbon. They can usually be oxidized to aldehydes and then carboxylic acids.",
    },
    {
    name: "Secondary alcohol",
    priority: 9.8,
    nomenclaturePriority: 9.8,
    confidence: "High",
    suffix: "-ol",
    prefix: "hydroxy",
    equivalentNames: ["2° alcohol"],
    smarts: "[CH1]([#6])[#6][OX2H]",
    mcatNote:
        "Secondary alcohols have the OH-bearing carbon attached to two other carbons. They can usually be oxidized to ketones.",
    },
    {
    name: "Tertiary alcohol",
    priority: 9.9,
    nomenclaturePriority: 9.9,
    confidence: "High",
    suffix: "-ol",
    prefix: "hydroxy",
    equivalentNames: ["3° alcohol"],
    smarts: "[C]([#6])([#6])([#6])[OX2H]",
    mcatNote:
        "Tertiary alcohols have the OH-bearing carbon attached to three other carbons. They resist normal oxidation because the carbinol carbon has no C-H bond.",
    },
    {
    name: "Alcohol",
    priority: 10,
    nomenclaturePriority: 10,
    confidence: "High",
    suffix: "-ol",
    prefix: "hydroxy",
    smarts: "[CX4;!$(C=O)][OX2H]",
    mcatNote:
      "Alcohols contain an -OH group. They are polar, can donate and accept hydrogen bonds, and can often be oxidized.",
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
      "Enols contain an OH group attached to an alkene carbon. They are tautomers of carbonyl compounds and are important in enolate chemistry.",
  },
  {
    name: "Hemiacetal",
    priority: 10.9,
    nomenclaturePriority: 10.9,
    confidence: "Medium",
    suffix: "hemiacetal",
    prefix: "hydroxyalkoxy",
    equivalentNames: ["hemiketal if derived from ketone"],
    smarts: "[CX4]([OX2H])([OX2][#6])",
    mcatNote:
      "Hemiacetals contain a carbon bonded to both OH and OR. Cyclic hemiacetals are common in carbohydrates.",
  },
  {
    name: "Ether",
    priority: 19,
    nomenclaturePriority: 15,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "alkoxy",
    smarts: "[#6][OX2][#6]",
    mcatNote:
      "Ethers contain an oxygen between two carbon groups. They can accept hydrogen bonds but cannot donate hydrogen bonds.",
  },
  {
    name: "Acetal",
    priority: 19.2,
    nomenclaturePriority: 15.2,
    confidence: "High",
    suffix: "acetal",
    prefix: "dialkoxy",
    equivalentNames: ["ketal if derived from ketone"],
    smarts: "[CX4]([OX2][#6])([OX2][#6])",
    mcatNote:
      "Acetals contain a carbon bonded to two OR groups. They are protected forms of aldehydes or ketones and are stable to base.",
  },
  {
    name: "Peroxide",
    priority: 22.5,
    nomenclaturePriority: 16.8,
    confidence: "High",
    suffix: "peroxide",
    prefix: "peroxy",
    equivalentNames: ["organic peroxide"],
    smarts: "[OX2][OX2]",
    mcatNote:
      "Peroxides contain an O-O single bond. The weak O-O bond can undergo homolytic cleavage and radical reactions.",
  },
  {
    name: "Epoxide",
    priority: 23,
    nomenclaturePriority: 17,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "epoxy",
    smarts: "[OX2r3]1[#6r3][#6r3]1",
    mcatNote:
      "Epoxides are three-membered cyclic ethers. Ring strain makes them more reactive than ordinary ethers.",
  },
];