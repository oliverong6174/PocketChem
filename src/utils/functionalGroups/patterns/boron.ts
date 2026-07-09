import type { FunctionalGroupPattern } from "../types";

export const boronGroups: FunctionalGroupPattern[] = [
  {
    name: "Organoboron",
    priority: 35,
    nomenclaturePriority: 25,
    confidence: "Medium",
    suffix: "Never suffix",
    prefix: "boryl",
    equivalentNames: ["organoboron compound", "carbon-boron compound"],
    smarts: "[#6][#5]",
    displaySmarts: "[#6][#5]",
    mcatNote:
      "Organoboron compounds contain a direct carbon-boron bond. More specific groups such as boronic acids, boronate esters, and organotrifluoroborates should override this broad category.",
    category: "functionalGroup",
  },
  {
    name: "Alkylborane",
    priority: 35.05,
    nomenclaturePriority: 25.05,
    confidence: "Medium",
    suffix: "borane",
    prefix: "boryl",
    equivalentNames: ["organoborane", "alkyl borane"],
    smarts: "[#6][#5H1,#5H2,#5H3]",
    displaySmarts: "[#6][#5H1,#5H2,#5H3]",
    mcatNote:
      "Alkylboranes contain a carbon-boron bond with one or more B-H bonds. They are common intermediates in hydroboration chemistry.",
    category: "functionalGroup",
  },
  {
    name: "Boronic acid",
    priority: 35.1,
    nomenclaturePriority: 25.1,
    confidence: "High",
    suffix: "boronic acid",
    prefix: "borono",
    equivalentNames: ["organoboronic acid"],
    smarts:
      "[#6][BX3]([$([OX2H]),$([O-])])([$([OX2H]),$([O-])])",
    displaySmarts:
      "[BX3]([$([OX2H]),$([O-])])([$([OX2H]),$([O-])])",
    mcatNote:
      "Boronic acids contain the R-B(OH)2 motif. This pattern also accepts deprotonated boronate forms where one or both oxygens are O-.",
    category: "functionalGroup",
  },
  {
    name: "Boronate monoester",
    priority: 35.15,
    nomenclaturePriority: 25.15,
    confidence: "High",
    suffix: "boronate",
    prefix: "boronato",
    equivalentNames: ["boronic acid monoester", "boronate half ester"],
    smarts:
      "[#6][BX3]([OX2][#6])([$([OX2H]),$([O-])])",
    displaySmarts:
      "[BX3]([OX2])([$([OX2H]),$([O-])])",
    mcatNote:
      "Boronate monoesters contain one B-O-C bond and one remaining boronic acid/boronate oxygen: R-B(OR)(OH) or R-B(OR)(O-).",
    category: "functionalGroup",
  },
  {
    name: "Boronate ester",
    priority: 35.2,
    nomenclaturePriority: 25.2,
    confidence: "High",
    suffix: "boronate",
    prefix: "boronato",
    equivalentNames: ["boronic ester", "boronic acid diester"],
    smarts: "[#6][BX3]([OX2][#6])([OX2][#6])",
    displaySmarts: "[BX3]([OX2])([OX2])",
    mcatNote:
      "Boronate esters contain the R-B(OR)2 motif. This includes common cyclic boronate esters such as pinacol boronate esters.",
    category: "functionalGroup",
  },
  {
    name: "Borinic acid",
    priority: 35.3,
    nomenclaturePriority: 25.3,
    confidence: "Medium",
    suffix: "borinic acid",
    prefix: "borinico",
    equivalentNames: ["organoborinic acid"],
    smarts: "[#6][BX3]([#6])[$([OX2H]),$([O-])]",
    displaySmarts: "[BX3][$([OX2H]),$([O-])]",
    mcatNote:
      "Borinic acids contain two direct carbon-boron bonds and one B-OH or B-O- group: R2B-OH.",
    category: "functionalGroup",
  },
  {
    name: "Borinic ester",
    priority: 35.35,
    nomenclaturePriority: 25.35,
    confidence: "Medium",
    suffix: "borinate",
    prefix: "borinato",
    equivalentNames: ["borinic acid ester"],
    smarts: "[#6][BX3]([#6])[OX2][#6]",
    displaySmarts: "[BX3][OX2]",
    mcatNote:
      "Borinic esters contain two direct carbon-boron bonds and one B-O-C ester bond: R2B-OR.",
    category: "functionalGroup",
  },
  {
    name: "Borate ester",
    priority: 35.4,
    nomenclaturePriority: 25.4,
    confidence: "Medium",
    suffix: "borate",
    prefix: "borato",
    equivalentNames: ["trialkyl borate", "boric acid ester"],
    smarts: "[BX3]([OX2][#6])([OX2][#6])[OX2][#6]",
    displaySmarts: "[BX3]([OX2])([OX2])[OX2]",
    mcatNote:
      "Borate esters contain boron bonded to three alkoxy oxygens, B(OR)3. They do not contain a direct carbon-boron bond.",
    category: "functionalGroup",
  },
  {
    name: "Organotrifluoroborate",
    priority: 35.5,
    nomenclaturePriority: 25.5,
    confidence: "High",
    suffix: "trifluoroborate",
    prefix: "trifluoroborato",
    equivalentNames: ["potassium organotrifluoroborate", "trifluoroborate salt"],
    smarts: "[#6][B-]([F])([F])[F]",
    displaySmarts: "[B-]([F])([F])[F]",
    mcatNote:
      "Organotrifluoroborates contain the R-BF3- motif and are useful Suzuki coupling partners.",
    category: "functionalGroup",
  },
];