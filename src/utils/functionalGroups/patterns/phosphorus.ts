// Add phosphoramidite

import type { FunctionalGroupPattern } from "../types";

export const phosphorusGroups: FunctionalGroupPattern[] = [
  {
    name: "Phosphine",
    priority: 16,
    nomenclaturePriority: 13.5,
    confidence: "Medium",
    suffix: "-phosphane",
    prefix: "phosphanyl",
    smarts: "[PX3]",
    displaySmarts: "[PX3]",
    mcatNote:
      "Phosphines contain trivalent phosphorus. They are widely used as ligands and in Wittig chemistry.",
    category: "functionalGroup",
  },
  {
    name: "Phosphate",
    priority: 33,
    nomenclaturePriority: 24,
    confidence: "High",
    suffix: "phosphate",
    prefix: "phospho",
    equivalentNames: ["phosphate group", "phosphoric acid", "phosphate salt"],
    smarts: "[PX4](=[OX1])([O;X1,X2])([O;X1,X2])[O;X1,X2]",
    displaySmarts:
      "[PX4](=[OX1])([O;X1,X2])([O;X1,X2])[O;X1,X2]",
    mcatNote:
      "Phosphates contain a phosphorus(V) center double-bonded to oxygen and single-bonded to three oxygen atoms. This includes phosphoric acid, phosphate salts, and phosphate ester cores.",
    category: "functionalGroup",
  },
  {
    name: "Phosphate ester",
    priority: 33.1,
    nomenclaturePriority: 24.1,
    confidence: "High",
    suffix: "phosphate",
    prefix: "phospho",
    equivalentNames: ["phosphate monoester", "organophosphate monoester"],
    smarts:
      "[PX4](=[OX1])([OX2][#6])([O;X1,X2;!$([OX2][#6])])[O;X1,X2;!$([OX2][#6])]",
    displaySmarts:
        "[PX4](=[OX1])([OX2])([O;X1,X2;!$([OX2][#6])])[O;X1,X2;!$([OX2][#6])]",
    mcatNote:
      "Phosphate esters contain one P-O-C ester bond on a phosphate center. This entry is for phosphate monoesters; phosphodiesters and phosphate triesters are detected separately.",
    category: "functionalGroup",
  },
  {
    name: "Phosphodiester",
    priority: 33.15,
    nomenclaturePriority: 24.15,
    confidence: "High",
    suffix: "phosphodiester",
    prefix: "phosphodiester",
    equivalentNames: ["phosphate diester"],
    smarts:
      "[PX4](=[OX1])([OX2][#6])([OX2][#6])[O;X1,X2;!$([OX2][#6])]",
    displaySmarts:
          "[PX4](=[OX1])([OX2])([OX2])[O;X1,X2;!$([OX2][#6])]",
    mcatNote:
      "Phosphodiesters contain a phosphate center with two P-O-C ester bonds and one remaining singly bonded oxygen. They form the linkage between nucleotides in DNA and RNA.",
    category: "functionalGroup",
  },
  {
    name: "Phosphate triester",
    priority: 33.18,
    nomenclaturePriority: 24.18,
    confidence: "High",
    suffix: "phosphate",
    prefix: "phospho",
    equivalentNames: ["phosphotriester", "phosphate triester"],
    smarts: "[PX4](=[OX1])([OX2][#6])([OX2][#6])[OX2][#6]",
    displaySmarts: "[PX4](=[OX1])([OX2])([OX2])[OX2]",
    mcatNote:
      "Phosphate triesters contain a phosphate center with three P-O-C ester bonds.",
    category: "functionalGroup",
  },
  {
    name: "Phosphonate",
    priority: 33.2,
    nomenclaturePriority: 24.2,
    confidence: "High",
    suffix: "phosphonate",
    prefix: "phosphonato",
    equivalentNames: ["phosphonic acid derivative"],
    smarts: "[#6][PX4](=[OX1])([O;X1,X2])([O;X1,X2])",
    displaySmarts: "[PX4](=[OX1])([O;X1,X2])([O;X1,X2])",
    mcatNote:
      "Phosphonates contain one direct carbon-phosphorus bond and two phosphorus-oxygen single bonds: R-P(=O)(O)2. This separates them from phosphates, which have no direct P-C bond.",
    category: "functionalGroup",
  },
    {
    name: "Phosphonate ester",
    priority: 33.22,
    nomenclaturePriority: 24.22,
    confidence: "High",
    suffix: "phosphonate",
    prefix: "phosphonato",
    equivalentNames: ["phosphonate monoester", "phosphonic acid monoester"],
    smarts:
      "[#6][PX4](=[OX1])([OX2][#6])[O;X1,X2;!$([OX2][#6])]",
    displaySmarts:
      "[PX4](=[OX1])([OX2])[O;X1,X2;!$([OX2][#6])]",
    mcatNote:
      "Phosphonate esters contain one direct carbon-phosphorus bond and one P-O-C ester bond: R-P(=O)(OR)(O). This is different from phosphate esters, which do not have a direct P-C bond.",
    category: "functionalGroup",
  },
  {
    name: "Phosphonate diester",
    priority: 33.24,
    nomenclaturePriority: 24.24,
    confidence: "High",
    suffix: "phosphonate",
    prefix: "phosphonato",
    equivalentNames: ["phosphonic acid diester", "dialkyl phosphonate"],
    smarts:
      "[#6][PX4](=[OX1])([OX2][#6])[OX2][#6]",
    displaySmarts:
      "[PX4](=[OX1])([OX2])[OX2]",
    mcatNote:
      "Phosphonate diesters contain one direct carbon-phosphorus bond and two P-O-C ester bonds: R-P(=O)(OR)2.",
    category: "functionalGroup",
  },
  {
    name: "Phosphinate",
    priority: 33.3,
    nomenclaturePriority: 24.3,
    confidence: "High",
    suffix: "phosphinate",
    prefix: "phosphinato",
    equivalentNames: ["phosphinic acid derivative", "phosphinate ester"],
    smarts: "[#6][PX4](=[OX1])([#6])[O;X1,X2]",
    displaySmarts: "[PX4](=[OX1])([#6])[O;X1,X2]",
    mcatNote:
      "Phosphinates contain two direct carbon-phosphorus bonds and one phosphorus-oxygen single bond: R2P(=O)O.",
    category: "functionalGroup",
  },
  {
    name: "Phosphine oxide",
    priority: 33.4,
    nomenclaturePriority: 24.4,
    confidence: "High",
    suffix: "phosphine oxide",
    prefix: "phosphoryl",
    equivalentNames: ["tertiary phosphine oxide"],
    smarts: "[#6][#15](=[OX1])",
    displaySmarts: "[#15](=[OX1])",
    mcatNote:
      "Phosphine oxides contain a phosphorus-oxygen double bond on a phosphorus attached to three carbon groups: R3P=O. This avoids falsely detecting phosphates, phosphonates, and phosphinates as phosphine oxides.",
    category: "functionalGroup",
  },
  {
    name: "Primary phosphine oxide",
    priority: 33.4,
    nomenclaturePriority: 24.4,
    confidence: "High",
    suffix: "phosphine oxide",
    prefix: "phosphoryl",
    equivalentNames: ["primary phosphine oxide", "organophosphine oxide"],
    smarts:
      "[#6]-[#15;!$([#15](-[#6])(-[#6]))]~[O;D1;H0]",
    displaySmarts: "[#15]~[O;D1;H0]",
    mcatNote:
      "Primary phosphine oxides contain one direct carbon-phosphorus bond and a terminal phosphorus-oxygen bond, commonly represented as R-P(=O)H2. The implicit P-H bonds may not be drawn, so this pattern counts carbon substituents instead of relying on explicit hydrogens.",
    category: "functionalGroup",
  },
  {
    name: "Secondary phosphine oxide",
    priority: 33.45,
    nomenclaturePriority: 24.45,
    confidence: "High",
    suffix: "phosphine oxide",
    prefix: "phosphoryl",
    equivalentNames: ["secondary phosphine oxide"],
    smarts:
      "[#6]-[#15;!$([#15](-[#6])(-[#6])(-[#6]))](-[#6])~[O;D1;H0]",
    displaySmarts: "[#15]~[O;D1;H0]",
    mcatNote:
      "Secondary phosphine oxides contain two direct carbon-phosphorus bonds and a terminal phosphorus-oxygen bond, commonly represented as R2P(=O)H.",
    category: "functionalGroup",
  },
  {
    name: "Tertiary phosphine oxide",
    priority: 33.5,
    nomenclaturePriority: 24.5,
    confidence: "High",
    suffix: "phosphine oxide",
    prefix: "phosphoryl",
    equivalentNames: ["tertiary phosphine oxide", "phosphine oxide"],
    smarts:
      "[#6]-[#15](-[#6])(-[#6])~[O;D1;H0]",
    displaySmarts: "[#15]~[O;D1;H0]",
    mcatNote:
      "Tertiary phosphine oxides contain three direct carbon-phosphorus bonds and a terminal phosphorus-oxygen bond, commonly represented as R3P=O.",
    category: "functionalGroup",
  },
  {
    name: "Phosphine sulfide",
    priority: 33.45,
    nomenclaturePriority: 24.45,
    confidence: "High",
    suffix: "phosphine sulfide",
    prefix: "thiophosphoryl",
    equivalentNames: ["phosphine thiooxide", "tertiary phosphine sulfide"],
    smarts: "[#6]-[#15v3]~[S;D1;H0]",
    displaySmarts: "[#15]~[S;D1;H0]",
    mcatNote:
      "Phosphine sulfides are sulfur analogs of phosphine oxides and contain the R3P=S motif.",
    category: "functionalGroup",
  },
    {
    name: "Primary phosphine sulfide",
    priority: 33.55,
    nomenclaturePriority: 24.55,
    confidence: "High",
    suffix: "phosphine sulfide",
    prefix: "thiophosphoryl",
    equivalentNames: ["primary phosphine sulfide", "primary phosphine thiooxide"],
    smarts: "[#6]-[#15;!$([#15](-[#6])(-[#6]))]~[S;D1;H0]",
    displaySmarts: "[#15]~[S;D1;H0]",
    mcatNote:
      "Primary phosphine sulfides contain one direct carbon-phosphorus bond and a terminal phosphorus-sulfur bond, commonly represented as R-P(=S)H2. The implicit P-H bonds may not be drawn, so this pattern counts carbon substituents instead.",
    category: "functionalGroup",
  },
  {
    name: "Secondary phosphine sulfide",
    priority: 33.56,
    nomenclaturePriority: 24.56,
    confidence: "High",
    suffix: "phosphine sulfide",
    prefix: "thiophosphoryl",
    equivalentNames: ["secondary phosphine sulfide", "secondary phosphine thiooxide"],
    smarts: "[#6]-[#15;!$([#15](-[#6])(-[#6])(-[#6]))](-[#6])~[S;D1;H0]",
    displaySmarts: "[#15]~[S;D1;H0]",
    mcatNote:
      "Secondary phosphine sulfides contain two direct carbon-phosphorus bonds and a terminal phosphorus-sulfur bond, commonly represented as R2P(=S)H.",
    category: "functionalGroup",
  },
  {
    name: "Tertiary phosphine sulfide",
    priority: 33.57,
    nomenclaturePriority: 24.57,
    confidence: "High",
    suffix: "phosphine sulfide",
    prefix: "thiophosphoryl",
    equivalentNames: ["tertiary phosphine sulfide", "phosphine sulfide", "phosphine thiooxide"],
    smarts: "[#6]-[#15](-[#6])(-[#6])~[S;D1;H0]",
    displaySmarts: "[#15]~[S;D1;H0]",
    mcatNote:
      "Tertiary phosphine sulfides contain three direct carbon-phosphorus bonds and a terminal phosphorus-sulfur bond, commonly represented as R3P=S.",
    category: "functionalGroup",
  },
  {
    name: "Thiophosphate ester",
    priority: 33.5,
    nomenclaturePriority: 24.5,
    confidence: "High",
    suffix: "thiophosphate",
    prefix: "thiophospho",
    equivalentNames: ["phosphorothioate ester", "thiophosphate monoester"],
    smarts: "[PX4](=[SX1])([OX2][#6])([O;X1,X2])[O;X1,X2]",
    displaySmarts: "[PX4](=[SX1])([OX2][#6])([O;X1,X2])[O;X1,X2]",
    mcatNote:
      "Thiophosphate esters are phosphate ester analogs where the phosphoryl oxygen is replaced by sulfur, giving a P=S center with at least one P-O-C ester bond.",
    category: "functionalGroup",
  },
  {
    name: "Dithiophosphate",
    priority: 33.55,
    nomenclaturePriority: 24.55,
    confidence: "High",
    suffix: "dithiophosphate",
    prefix: "dithiophosphato",
    equivalentNames: ["phosphorodithioate", "dithiophosphate group"],
    smarts: "[PX4](=[SX1])([S;X1,X2])([O;X1,X2])[O;X1,X2]",
    displaySmarts: "[PX4](=[SX1])([S;X1,X2])([O;X1,X2])[O;X1,X2]",
    mcatNote:
      "Dithiophosphates contain a phosphorus center with one P=S bond and one additional P-S single bond, along with oxygen substituents.",
    category: "functionalGroup",
  },
  {
    name: "Phosphoramidate",
    priority: 33.6,
    nomenclaturePriority: 24.6,
    confidence: "High",
    suffix: "phosphoramidate",
    prefix: "phosphoramidato",
    equivalentNames: ["phosphoramide", "phosphoramidate group"],
    smarts: "[PX4](=[OX1])([#7])([O;X1,X2])[O;X1,X2]",
    displaySmarts: "[PX4](=[OX1])([#7])([O;X1,X2])[O;X1,X2]",
    mcatNote:
      "Phosphoramidates contain a phosphorus-nitrogen bond on a phosphoryl center, usually P(=O)(N)(O)2.",
    category: "functionalGroup",
  },
  {
  name: "Phosphoramidite",
  priority: 33.65,
  nomenclaturePriority: 24.65,
  confidence: "High",
  suffix: "phosphoramidite",
  prefix: "phosphoramidito",
  equivalentNames: [
    "phosphoramidite group",
    "phosphite amide",
    "P(III) phosphoramidite",
  ],
  smarts:
    "[PX3]([$([OX2H]),$([OX2][#6])])([$([OX2H]),$([OX2][#6])])[#7;!$([#7+](=O)[O-]);!$([#7]=O)]",
  displaySmarts:
    "[PX3]([OX2])([OX2])[#7;!$([#7+](=O)[O-]);!$([#7]=O)]",
  mcatNote:
    "Phosphoramidites are phosphorus(III) compounds containing a trivalent phosphorus bonded to two alkoxy oxygens and one nitrogen, commonly written as P(OR)2NR2. They are important in DNA/RNA oligonucleotide synthesis and are different from phosphoramidates, which contain P=O.",
  category: "functionalGroup",
  },
];