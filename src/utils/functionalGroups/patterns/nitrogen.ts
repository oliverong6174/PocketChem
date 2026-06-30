import type { FunctionalGroupPattern } from "../types";

export const nitrogenGroups: FunctionalGroupPattern[] = [
  {
    name: "Nitrile",
    priority: 7,
    nomenclaturePriority: 7,
    confidence: "High",
    suffix: "-nitrile",
    prefix: "cyano",
    smarts: "[CX2]#N",
    mcatNote:
      "Nitriles contain a carbon-nitrogen triple bond. The nitrile carbon is electrophilic and can be hydrolyzed to carboxylic acid derivatives.",
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
      "Imines contain a carbon-nitrogen double bond. They are related to carbonyl chemistry and can form from aldehydes or ketones with amines.",
  },
  {
    name: "Hydrazone",
    priority: 13,
    nomenclaturePriority: 12.5,
    confidence: "Medium",
    suffix: "hydrazone (appended)",
    prefix: "hydrazono",
    smarts: "[CX3]=[NX2][NX3]",
    mcatNote:
      "Hydrazones contain a C=N-N group and are commonly formed from aldehydes or ketones reacting with hydrazine derivatives.",
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
      "Oximes contain a C=N-OH group and are commonly formed from aldehydes or ketones reacting with hydroxylamine.",
  },
    {
    name: "Primary amine",
    priority: 14.8,
    nomenclaturePriority: 14.8,
    confidence: "High",
    suffix: "-amine",
    prefix: "amino",
    equivalentNames: ["1° amine"],
    smarts: "[NX3H2;!$([NX3][CX3](=[OX1]));!$(N=C);!$([N+](=O)[O-]);!$(N=N)]",
    mcatNote:
        "Primary amines have nitrogen bonded to one carbon and two hydrogens. They are basic and can act as nucleophiles.",
    },
    {
    name: "Secondary amine",
    priority: 14.9,
    nomenclaturePriority: 14.9,
    confidence: "High",
    suffix: "-amine",
    prefix: "amino",
    equivalentNames: ["2° amine"],
    smarts: "[NX3H1;!$([NX3][CX3](=[OX1]));!$(N=C);!$([N+](=O)[O-]);!$(N=N)]",
    mcatNote:
        "Secondary amines have nitrogen bonded to two carbons and one hydrogen. They are generally basic and nucleophilic.",
    },
    {
    name: "Tertiary amine",
    priority: 15.0,
    nomenclaturePriority: 15.0,
    confidence: "High",
    suffix: "-amine",
    prefix: "amino",
    equivalentNames: ["3° amine"],
    smarts: "[NX3H0;!$([NX3][CX3](=[OX1]));!$(N=C);!$([N+](=O)[O-]);!$(N=N)]",
    mcatNote:
        "Tertiary amines have nitrogen bonded to three carbons and no N-H bond. They are basic but cannot donate hydrogen bonds.",
    },
  {
    name: "Amine",
    priority: 15.5,
    nomenclaturePriority: 15.5,
    confidence: "Medium",
    suffix: "-amine",
    prefix: "amino",
    smarts: "[NX3;!$([NX3][CX3](=[OX1]));!$(N=C);!$([N+](=O)[O-]);!$(N=N)]",
    mcatNote:
      "Amines are basic and often positively charged at physiological pH. Amino groups are common in amino acids and neurotransmitters.",
  },
  {
    name: "Azo compound",
    priority: 17,
    nomenclaturePriority: 14,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "azo",
    smarts: "[#6][NX2]=[NX2][#6]",
    mcatNote:
      "Azo compounds contain an N=N linkage between carbon groups. They are often highly conjugated and can appear in dyes.",
  },
  {
    name: "Diazo compound",
    priority: 18,
    nomenclaturePriority: 14.5,
    confidence: "Medium",
    suffix: "Never suffix",
    prefix: "diazo",
    smarts: "[#6][N+]#N",
    mcatNote:
      "Diazo compounds contain a carbon attached to a diazo group. They are reactive nitrogen-containing functional groups.",
  },
  {
    name: "Nitro",
    priority: 26,
    nomenclaturePriority: 20,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "nitro",
    smarts: "[NX3+](=O)[O-]",
    mcatNote:
      "Nitro groups contain nitrogen bonded to oxygens and are strongly electron-withdrawing.",
  },
  {
    name: "Isocyanide",
    priority: 29,
    nomenclaturePriority: 13.2,
    confidence: "Medium",
    suffix: "Rare",
    prefix: "isocyano",
    smarts: "[NX1+]#[CX1-]",
    mcatNote:
      "Isocyanides contain the R-NC connectivity. They are structural isomers of nitriles but have different connectivity.",
  },
  {
    name: "Isocyanate",
    priority: 30,
    nomenclaturePriority: 18.5,
    confidence: "High",
    suffix: "Rare",
    prefix: "isocyanato",
    smarts: "[NX2]=[CX2]=[OX1]",
    mcatNote:
      "Isocyanates contain the N=C=O group. They are electrophilic and can react with nucleophiles such as alcohols or amines.",
  },
  {
    name: "Azide",
    priority: 29.5,
    nomenclaturePriority: 20.5,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "azido",
    equivalentNames: ["organic azide"],
    smarts: "[NX3-][NX2+]#N",
    mcatNote:
      "Azides contain an N3 group. Organic azides are useful in click chemistry and can be reduced to amines.",
  },
];