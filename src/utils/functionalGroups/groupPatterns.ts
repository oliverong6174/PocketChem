import type { FunctionalGroupPattern } from "./types";

//CHANGE TO RDKIT???

export const FUNCTIONAL_GROUPS: FunctionalGroupPattern[] = [
  {
    name: "Carboxylic acid",
    priority: 1,
    nomenclaturePriority: 1,
    confidence: "High",
    suffix: "-oic acid",
    prefix: "carboxy",
    smarts: "[CX3](=O)[OX2H1]",
    mcatNote:
      "Carboxylic acids are acidic because their conjugate base is resonance-stabilized. At physiological pH, they are often negatively charged carboxylates.",
  },
  {
    name: "Sulfonic acid",
    priority: 2,
    nomenclaturePriority: 2,
    confidence: "High",
    suffix: "-sulfonic acid",
    prefix: "sulfo",
    smarts: "S(=O)(=O)[OX2H]",
    mcatNote:
      "Sulfonic acids are very strong organic acids because the conjugate base is highly resonance-stabilized over multiple oxygens.",
  },
  {
    name: "Acid anhydride",
    priority: 3,
    nomenclaturePriority: 3,
    confidence: "High",
    suffix: "-oic anhydride",
    prefix: "(acyloxy)carbonyl",
    smarts: "[CX3](=[OX1])[OX2][CX3](=[OX1])",
    mcatNote:
      "Anhydrides are reactive carboxylic acid derivatives. They undergo nucleophilic acyl substitution to form acids, esters, or amides.",
  },
  {
    name: "Ester",
    priority: 4,
    nomenclaturePriority: 4,
    confidence: "High",
    suffix: "-oate",
    prefix: "alkoxycarbonyl",
    smarts: "[CX3](=[OX1])[OX2][CX4,c]",
    mcatNote:
      "Esters are carboxylic acid derivatives. They are common in lipids and can undergo hydrolysis.",
  },
  {
    name: "Acyl halide",
    priority: 5,
    nomenclaturePriority: 5,
    confidence: "High",
    suffix: "-oyl halide",
    prefix: "halocarbonyl",
    smarts: "[CX3](=O)[F,Cl,Br,I]",
    mcatNote:
      "Acyl halides are highly reactive carboxylic acid derivatives and readily undergo nucleophilic acyl substitution.",
  },
  {
    name: "Amide",
    priority: 6,
    nomenclaturePriority: 6,
    confidence: "High",
    suffix: "-amide",
    prefix: "carbamoyl",
    smarts: "[CX3](=[OX1])[NX3]",
    mcatNote:
      "Amides are resonance-stabilized and less basic than amines. Peptide bonds in proteins are amide bonds.",
  },
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
    name: "Aldehyde",
    priority: 8,
    nomenclaturePriority: 8,
    confidence: "High",
    suffix: "-al",
    prefix: "formyl / oxo",
    smarts: "[CX3H1](=[OX1])[#6,H]",
    mcatNote:
        "Aldehydes contain a terminal carbonyl. They are easily oxidized to carboxylic acids and are electrophilic at the carbonyl carbon.",
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
        "Ketones contain an internal carbonyl. They are electrophilic and commonly participate in nucleophilic addition reactions.",
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
    name: "Thiol",
    priority: 11,
    nomenclaturePriority: 11,
    confidence: "High",
    suffix: "-thiol",
    prefix: "sulfanyl",
    smarts: "[#6][SX2H]",
    mcatNote:
      "Thiols contain an -SH group. They are sulfur analogs of alcohols and can form disulfide bonds, especially in cysteine residues.",
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
    name: "Amine",
    priority: 15,
    nomenclaturePriority: 13,
    confidence: "Medium",
    suffix: "-amine",
    prefix: "amino",
    smarts:  "[NX3;!$([NX3][CX3](=[OX1]));!$(N=C);!$([N+](=O)[O-]);!$(N=N)]",
    mcatNote:
      "Amines are basic and often positively charged at physiological pH. Amino groups are common in amino acids and neurotransmitters.",
  },
  {
    name: "Phosphine",
    priority: 16,
    nomenclaturePriority: 13.5,
    confidence: "Medium",
    suffix: "-phosphane",
    prefix: "phosphanyl",
    smarts: "[PX3]",
    mcatNote:
      "Phosphines contain trivalent phosphorus. They are more common in organophosphorus chemistry than in basic MCAT organic chemistry.",
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
    name: "Thioether",
    priority: 20,
    nomenclaturePriority: 16,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "alkylthio",
    smarts: "[#6][SX2][#6]",
    mcatNote:
      "Thioethers, also called sulfides, contain sulfur between two carbon groups. Methionine contains a thioether.",
  },
  {
    name: "Sulfoxide",
    priority: 21,
    nomenclaturePriority: 16.5,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "sulfinyl",
    smarts: "[#6][SX3](=O)[#6]",
    mcatNote:
      "Sulfoxides contain sulfur bonded to oxygen and two carbon groups. The S=O bond is polar.",
  },
  {
    name: "Sulfone",
    priority: 22,
    nomenclaturePriority: 16.6,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "sulfonyl",
    smarts: "[#6][SX4](=O)(=O)[#6]",
    mcatNote:
      "Sulfones contain sulfur double-bonded to two oxygens and bonded to two carbon groups. They are highly polar sulfur-containing groups.",
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
  {
    name: "Alkene",
    priority: 24,
    nomenclaturePriority: 18,
    confidence: "High",
    suffix: "-ene",
    prefix: "none",
    smarts: "C=C",
    mcatNote:
      "Alkenes contain a carbon-carbon double bond. They are electron-rich and commonly undergo addition reactions.",
  },
  {
    name: "Alkyne",
    priority: 25,
    nomenclaturePriority: 19,
    confidence: "High",
    suffix: "-yne",
    prefix: "none",
    smarts: "C#C",
    mcatNote:
      "Alkynes contain a carbon-carbon triple bond. They are linear and count as two degrees of unsaturation.",
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
    name: "Halogen",
    priority: 27,
    nomenclaturePriority: 21,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "fluoro, chloro, bromo, iodo",
    smarts: "[F,Cl,Br,I]",
    mcatNote:
      "Halogens are electronegative substituents. In organic molecules they are often named as fluoro, chloro, bromo, or iodo substituents.",
  },
  {
    name: "Haloalkane",
    priority: 28,
    nomenclaturePriority: 21,
    confidence: "High",
    suffix: "Never suffix",
    prefix: "halo",
    smarts: "[#6][F,Cl,Br,I]",
    mcatNote:
      "Haloalkanes contain a carbon-halogen bond. They are important in substitution and elimination reactions.",
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
  {
    name: "Phosphate",
    priority: 33,
    nomenclaturePriority: 24,
    confidence: "Medium",
    suffix: "phosphate",
    prefix: "phospho",
    smarts: "P(=O)(O)O",
    mcatNote:
      "Phosphates are highly charged and important in ATP, DNA/RNA, signaling, and metabolic activation steps.",
  },

  // BENZENE CLASS 

{
  name: "Phenol",
  priority: 10.5,
  nomenclaturePriority: 10.5,
  confidence: "High",
  suffix: "-phenol",
  prefix: "hydroxy",
  equivalentNames: ["hydroxybenzene", "phenolic alcohol"],
  smarts: "[a][OX2H]",
  mcatNote:
    "Phenols contain an -OH group directly attached to an aromatic ring. They are more acidic than ordinary alcohols because the phenoxide conjugate base is resonance-stabilized.",
},
{
  name: "Aryl ether",
  priority: 19.5,
  nomenclaturePriority: 15.1,
  confidence: "High",
  suffix: "Usually named as substituted benzene",
  prefix: "alkoxy",
  equivalentNames: ["anisole", "methoxybenzene", "phenyl ether"],
  smarts: "[a][OX2][#6]",
  mcatNote:
    "Aryl ethers contain an oxygen attached directly to an aromatic ring. Anisole is methoxybenzene.",
},
{
  name: "Alkylbenzene",
  priority: 31.2,
  nomenclaturePriority: 22.1,
  confidence: "Medium",
  suffix: "Usually named as substituted benzene",
  prefix: "alkyl",
  equivalentNames: ["toluene if methylbenzene", "ethylbenzene", "alkyl arene"],
  smarts: "[a][CX4]",
  mcatNote:
    "Alkylbenzenes contain an alkyl group attached to an aromatic ring. Toluene is methylbenzene.",
},
{
  name: "Aniline",
  priority: 15.5,
  nomenclaturePriority: 13.1,
  confidence: "High",
  suffix: "-aniline",
  prefix: "amino",
  equivalentNames: ["aminobenzene", "aryl amine"],
  smarts: "[a][NX3;H2,H1,H0;!$(NC=O);!$(N=C);!$([N+](=O)[O-])]",
  mcatNote:
    "Anilines are aromatic amines. Their nitrogen lone pair can interact with the aromatic ring, making them less basic than many alkyl amines.",
},
{
  name: "Aryl halide",
  priority: 27.5,
  nomenclaturePriority: 21.1,
  confidence: "High",
  suffix: "Never suffix",
  prefix: "fluoro, chloro, bromo, iodo",
  equivalentNames: ["halobenzene", "haloarene"],
  smarts: "[a][F,Cl,Br,I]",
  mcatNote:
    "Aryl halides have a halogen directly attached to an aromatic ring.",
},
{
  name: "Nitroarene",
  priority: 26.5,
  nomenclaturePriority: 20.1,
  confidence: "High",
  suffix: "Never suffix",
  prefix: "nitro",
  equivalentNames: ["nitrobenzene", "aryl nitro compound"],
  smarts: "[a][NX3+](=O)[O-]",
  mcatNote:
    "Nitroarenes contain a nitro group attached to an aromatic ring. Nitro groups are strongly electron-withdrawing.",
},

// GENERIC ARENE
{
    name: "Arene",
    priority: 31,
    nomenclaturePriority: 22,
    confidence: "High",
    suffix: "benzene",
    prefix: "phenyl",
    smarts: "a",
    mcatNote:
      "Arenes are aromatic rings, the most common type of which is benzene. They are resonance-stabilized and commonly appear in drugs, amino acids, and MCAT passage molecules.",
  },

  //CHARGED GROUPS 
    {
    name: "Oxonium ion",
    priority: 0.1,
    nomenclaturePriority: 0.1,
    confidence: "High",
    suffix: "N/A",
    prefix: "oxonium",
    smarts: "[O+]",
    mcatNote:
      "Oxonium ions contain positively charged oxygen. They are strongly acidic because deprotonation gives a neutral oxygen species.",
  },
  {
    name: "Ammonium ion",
    priority: 0.2,
    nomenclaturePriority: 0.2,
    confidence: "High",
    suffix: "N/A",
    prefix: "ammonium",
    smarts: "[N+;H1,H2,H3,H4]",
    mcatNote:
      "Ammonium ions are protonated amines. They can donate H+ to reform a neutral amine.",
  },
  {
    name: "Carboxylate",
    priority: 0.3,
    nomenclaturePriority: 0.3,
    confidence: "High",
    suffix: "carboxylate",
    prefix: "carboxylato",
    smarts: "[CX3](=[OX1])[O-]",
    mcatNote:
      "Carboxylates are resonance-stabilized conjugate bases of carboxylic acids. They are weaker bases than alkoxides.",
  },
  {
    name: "Alkoxide",
    priority: 0.4,
    nomenclaturePriority: 0.4,
    confidence: "High",
    suffix: "alkoxide",
    prefix: "alkoxy",
    smarts: "[O-][CX4]",
    mcatNote:
      "Alkoxides contain negatively charged oxygen. They are strong bases and strong nucleophiles.",
  },
  {
    name: "Thiolate",
    priority: 0.5,
    nomenclaturePriority: 0.5,
    confidence: "High",
    suffix: "thiolate",
    prefix: "thiolato",
    smarts: "[S-]",
    mcatNote:
      "Thiolates contain negatively charged sulfur. They are strong nucleophiles and are less basic than alkoxides.",
  },
  {
    name: "Carbanion",
    priority: 0.6,
    nomenclaturePriority: 0.6,
    confidence: "Medium",
    suffix: "carbanion",
    prefix: "carbanion",
    smarts: "[C-]",
    mcatNote:
      "Carbanions are usually very strong bases and nucleophiles unless stabilized by resonance or electron-withdrawing groups.",
  },
  {
  name: "Acetylide anion",
  priority: 0.55,
  nomenclaturePriority: 0.55,
  confidence: "High",
  suffix: "acetylide",
  prefix: "acetylido",
  smarts: "[C-]#[C]",
  mcatNote:
    "Acetylide anions are negatively charged carbons attached to a carbon-carbon triple bond. They are strong bases and strong nucleophiles, commonly used to form new C-C bonds.",
},
{
  name: "Amide anion",
  priority: 0.45,
  nomenclaturePriority: 0.45,
  confidence: "High",
  suffix: "amide anion",
  prefix: "amido",
  smarts: "[#7-]",
  mcatNote:
    "Amide anions contain negatively charged nitrogen. They are very strong bases and strong nucleophiles because protonation gives an amine.",
},
{
  name: "Deprotonated carboxamide",
  priority: 0.46,
  nomenclaturePriority: 0.46,
  confidence: "High",
  suffix: "amide anion",
  prefix: "amido",
  smarts: "[#6](=[#8])-[#7-]",
  mcatNote:
    "A deprotonated carboxamide has negative charge on nitrogen next to a carbonyl. Resonance with the carbonyl stabilizes the anion, making it less basic than a simple amide anion.",
},
{
  name: "Methyl carbanion",
  priority: 0.57,
  nomenclaturePriority: 0.57,
  confidence: "High",
  suffix: "carbanion",
  prefix: "carbanion",
  smarts: "[CH2-]",
  mcatNote:
    "A CH2− carbanion is a negatively charged carbon with a lone pair. It is usually a very strong base and strong nucleophile unless stabilized by resonance or nearby electron-withdrawing groups.",
},

];