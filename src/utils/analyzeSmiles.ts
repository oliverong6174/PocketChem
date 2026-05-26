export type FunctionalGroupResult = {
  name: string;
  priority: number;
  nomenclaturePriority: number;
  confidence: "High" | "Medium" | "Low";
  suffix: string;
  prefix: string;
  equivalentNames?: string[];
  count: number;
  mcatNote: string;
};

export type FunctionalGroupHierarchy = {
  mainGroup: FunctionalGroupResult | null;
  primaryGroups: FunctionalGroupResult[];
    
};

type FunctionalGroupPattern = Omit<FunctionalGroupResult, "count"> & {
  smarts: string;
};

declare global {
  interface Window {
    initRDKitModule?: () => Promise<any>;
  }
}

let rdkitPromise: Promise<any> | null = null;

export function getRDKit() {
    console.log("window.initRDKitModule:", window.initRDKitModule);

  if (!window.initRDKitModule) {
    throw new Error("RDKit is not loaded. Check the script tag in index.html.");
  }

  if (!rdkitPromise) {
    rdkitPromise = window.initRDKitModule();
  }

  return rdkitPromise;
}

// TODO: Improve overlap filtering with match-level atom tracking.
// Current filtering removes common false positives but may miss edge cases
// where a molecule contains both a parent group and a separate subgroup.

const FUNCTIONAL_GROUPS: FunctionalGroupPattern[] = [
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
    suffix: "Rare",
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
    suffix: "Rare",
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
    suffix: "Rare",
    prefix: "phosphino",
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
    suffix: "benzene / arene parent",
    prefix: "phenyl",
    smarts: "a",
    mcatNote:
      "Arenes are aromatic rings. They are resonance-stabilized and commonly appear in drugs, amino acids, and MCAT passage molecules.",
  },
];


function removeOverlappingGroups(groups: FunctionalGroupResult[]) {
  const names = new Set(groups.map((group) => group.name));

  let filtered = groups;

  // Carboxylic acid should not be treated as ketone/aldehyde,
  // but real separate alcohols should remain.
  if (names.has("Carboxylic acid")) {
    filtered = filtered.filter(
      (group) =>
        group.name !== "Ketone" &&
        group.name !== "Aldehyde"
    );
  }

  // Esters are not generic ethers or ketones,
  // but separate alcohols elsewhere in the molecule should remain.
  if (names.has("Ester")) {
    filtered = filtered.filter(
      (group) =>
        group.name !== "Ether" &&
        group.name !== "Ketone" &&
        group.name !== "Aldehyde"
    );
  }

  // Amides are not amines or ketones.
  if (names.has("Amide")) {
    filtered = filtered.filter(
      (group) =>
        group.name !== "Ketone" &&
        group.name !== "Aldehyde"
    );
  }

  // Acid anhydrides are not esters, ethers, or ketones.
  if (names.has("Acid anhydride")) {
    filtered = filtered.filter(
      (group) =>
        group.name !== "Ether" &&
        group.name !== "Ketone" &&
        group.name !== "Aldehyde"
    );
  }

  // Acyl halides are not ketones or generic halogen groups.
  if (names.has("Acyl halide")) {
    filtered = filtered.filter(
      (group) =>
        group.name !== "Ketone" &&
        group.name !== "Aldehyde" &&
        group.name !== "Halogen" &&
        group.name !== "Haloalkane"
    );
  }

  // Epoxide is a specific cyclic ether.
  if (names.has("Epoxide")) {
    filtered = filtered.filter((group) => group.name !== "Ether");
  }

  // Sulfoxide/sulfone are more specific than thioether.
  if (names.has("Sulfoxide") || names.has("Sulfone")) {
    filtered = filtered.filter((group) => group.name !== "Thioether");
  }

  // More specific nitrogen groups should not also show generic amine.
  if (
    names.has("Imine") ||
    names.has("Hydrazone") ||
    names.has("Oxime") ||
    names.has("Nitrile") ||
    names.has("Isocyanide") ||
    names.has("Isocyanate") ||
    names.has("Azo compound") ||
    names.has("Diazo compound") ||
    names.has("Nitro")
  ) {
    filtered = filtered.filter((group) => group.name !== "Amine");
  }

  // Haloalkane is more specific than generic halogen.
  if (names.has("Haloalkane")) {
    filtered = filtered.filter((group) => group.name !== "Halogen");
  }

// BENZENE CLASS

  // Phenol is not a regular alcohol.
if (names.has("Phenol")) {
  filtered = filtered.filter((group) => group.name !== "Alcohol");
}

// Aniline is a specific aromatic amine.
if (names.has("Aniline")) {
  filtered = filtered.filter((group) => group.name !== "Amine");
}

// Anisole/aryl ether is more specific than generic ether.
if (names.has("Aryl ether")) {
  filtered = filtered.filter((group) => group.name !== "Ether");
}

// Aryl halide is more specific than generic halogen/haloalkane.
if (names.has("Aryl halide")) {
  filtered = filtered.filter(
    (group) => group.name !== "Halogen" && group.name !== "Haloalkane"
  );
}

// Aromatic-specific carbonyl groups are more specific than generic versions.
if (names.has("Benzoic acid derivative")) {
  filtered = filtered.filter((group) => group.name !== "Carboxylic acid");
}

if (names.has("Benzaldehyde derivative")) {
  filtered = filtered.filter((group) => group.name !== "Aldehyde");
}

if (names.has("Aryl ketone")) {
  filtered = filtered.filter((group) => group.name !== "Ketone");
}

if (names.has("Benzonitrile derivative")) {
  filtered = filtered.filter((group) => group.name !== "Nitrile");
}

if (names.has("Nitroarene")) {
  filtered = filtered.filter((group) => group.name !== "Nitro");
}

if (names.has("Arenesulfonic acid")) {
  filtered = filtered.filter((group) => group.name !== "Sulfonic acid");
}

// For the specific benzene groups, no arene
const hasSpecificAromaticGroup =
  names.has("Phenol") ||
  names.has("Aryl ether") ||
  names.has("Aniline") ||
  names.has("Aryl halide") ||
  names.has("Nitroarene") ||
  names.has("Alkylbenzene") ||
  names.has("Benzoic acid derivative") ||
  names.has("Benzaldehyde derivative") ||
  names.has("Aryl ketone") ||
  names.has("Benzonitrile derivative") ||
  names.has("Styrene / Vinylbenzene") ||
  names.has("Arenesulfonic acid");

if (hasSpecificAromaticGroup) {
  filtered = filtered.filter((group) => group.name !== "Arene");
}

  // If the molecule has any real functional group, don't show alkane.
  // Alkane should only show for simple saturated hydrocarbons.
  const hasNonAlkaneGroup = filtered.some((group) => group.name !== "Alkane");

  if (hasNonAlkaneGroup) {
    filtered = filtered.filter((group) => group.name !== "Alkane");
  }

  return filtered;
}
function detectGroupsFromPatterns(
  RDKit: any,
  mol: any,
  patterns: FunctionalGroupPattern[]
): FunctionalGroupResult[] {
  const detectedGroups: FunctionalGroupResult[] = [];

  for (const group of patterns) {
    const query = RDKit.get_qmol(group.smarts);

    let count = 0;

    try {
      const matchesJson = mol.get_substruct_matches(query);
      const matches = JSON.parse(matchesJson);

      if (Array.isArray(matches)) {
        count = matches.length;
      }
    } catch (error) {
      console.warn(`Could not count matches for ${group.name}:`, error);

      const match = mol.get_substruct_match(query);
      if (match && match !== "{}" && match !== "[]") {
        count = 1;
      }
    }

    if (count > 0) {
      detectedGroups.push({
        name: group.name,
        priority: group.priority,
        nomenclaturePriority: group.nomenclaturePriority,
        confidence: group.confidence,
        suffix: group.suffix,
        prefix: group.prefix,
        equivalentNames: group.equivalentNames,
        count,
        mcatNote: group.mcatNote,
      });
    }

    query.delete();
  }

  return detectedGroups;
}

function getMainGroup(groups: FunctionalGroupResult[]): FunctionalGroupResult | null {
  if (groups.length === 0) {
    return null;
  }

  return [...groups].sort(
    (a, b) => a.nomenclaturePriority - b.nomenclaturePriority
  )[0];
}

// TODO: Add all simple molecules: H2O2, PCl5, and others 

function detectSimpleMolecule(smiles: string): FunctionalGroupResult | null {
  const s = smiles.replace(/\s+/g, "").trim();

  const simpleMolecules: Record<string, FunctionalGroupResult> = {
    O: {
      name: "Water",
      priority: 900,
      nomenclaturePriority: 900,
      confidence: "High",
      suffix: "N/A",
      prefix: "N/A",
      count: 1,
      mcatNote:
        "Water is not an organic functional group, but it is biologically essential as a solvent, reactant, and product in hydrolysis and condensation reactions.",
    },

    "O=C=O": {
      name: "Carbon dioxide",
      priority: 900,
      nomenclaturePriority: 900,
      confidence: "High",
      suffix: "N/A",
      prefix: "N/A",
      count: 1,
      mcatNote:
        "Carbon dioxide is not an organic functional group. In biochemistry, it appears in decarboxylation reactions, respiration, and bicarbonate buffering.",
    },

    N: {
      name: "Ammonia",
      priority: 900,
      nomenclaturePriority: 900,
      confidence: "High",
      suffix: "N/A",
      prefix: "N/A",
      count: 1,
      mcatNote:
        "Ammonia is not an organic functional group, but it is related to amines and nitrogen metabolism.",
    },

    "[NH4+]": {
      name: "Ammonium",
      priority: 900,
      nomenclaturePriority: 900,
      confidence: "High",
      suffix: "N/A",
      prefix: "N/A",
      count: 1,
      mcatNote:
        "Ammonium is the protonated form of ammonia. It is positively charged and relevant to acid-base chemistry and nitrogen metabolism.",
    },

    Cl: {
      name: "Chlorine / chloride-like species",
      priority: 900,
      nomenclaturePriority: 900,
      confidence: "Medium",
      suffix: "N/A",
      prefix: "N/A",
      count: 1,
      mcatNote:
        "This is not an organic functional group. Chloride ions and chlorine-containing species are important in electrolyte balance and substitution chemistry.",
    },

    "[Na+]": {
      name: "Sodium ion",
      priority: 900,
      nomenclaturePriority: 900,
      confidence: "High",
      suffix: "N/A",
      prefix: "N/A",
      count: 1,
      mcatNote:
        "Sodium ion is not an organic functional group. It is an important electrolyte in physiology and membrane potentials.",
    },

    "[K+]": {
      name: "Potassium ion",
      priority: 900,
      nomenclaturePriority: 900,
      confidence: "High",
      suffix: "N/A",
      prefix: "N/A",
      count: 1,
      mcatNote:
        "Potassium ion is not an organic functional group. It is important in membrane potentials and action potentials.",
    },
  };

  return simpleMolecules[s] ?? null;
}

export async function analyzeFunctionalGroups(
  smiles: string
): Promise<FunctionalGroupResult[]> {
  const hierarchy = await analyzeFunctionalGroupHierarchy(smiles);
  return hierarchy.primaryGroups;
}

export async function analyzeFunctionalGroupHierarchy(
  smiles: string
): Promise<FunctionalGroupHierarchy> {
  try {
    const RDKit = await getRDKit();
    const cleanSmiles = smiles.replace(/\s+/g, "").trim();
    const simpleMolecule = detectSimpleMolecule(cleanSmiles);

    if (simpleMolecule) {
    return {
        mainGroup: simpleMolecule,
        primaryGroups: [simpleMolecule],
    };
    }

    console.log("Raw SMILES:", smiles);
    console.log("Normalized SMILES:", cleanSmiles);

    const mol = RDKit.get_mol(cleanSmiles);

    if (!mol) {
      const invalidResult: FunctionalGroupResult = {
        name: "Invalid SMILES",
        priority: 999,
        nomenclaturePriority: 999,
        confidence: "Low",
        suffix: "N/A",
        prefix: "N/A",
        count: 0,
        mcatNote:
          "RDKit could not parse this SMILES string. Check the molecule drawing and try again.",
      };

      return {
        mainGroup: invalidResult,
        primaryGroups: [invalidResult],
      };
    }

    const rawPrimaryGroups = detectGroupsFromPatterns(
      RDKit,
      mol,
      FUNCTIONAL_GROUPS
    );

    console.log(
    "Raw detected groups:",
    rawPrimaryGroups.map((group) => group.name)
    );

    mol.delete();

    if (rawPrimaryGroups.length === 0) {
      const noGroupResult: FunctionalGroupResult = {
        name: "No supported organic functional group detected",
        priority: 999,
        nomenclaturePriority: 999,
        confidence: "Low",
        suffix: "N/A",
        prefix: "N/A",
        count: 0,
        mcatNote:
           "RDKit parsed the molecule, but no supported organic functional group matched. This may be an inorganic molecule, an elemental species, or a structure outside the current MVP detector.",
      };

      return {
        mainGroup: noGroupResult,
        primaryGroups: [noGroupResult],
      };
    }

    const primaryGroups = removeOverlappingGroups(rawPrimaryGroups).sort(
      (a, b) => a.nomenclaturePriority - b.nomenclaturePriority
    );

    
    console.log("Filtered groups:", primaryGroups.map((group) => group.name));

    console.log("Filtered groups with counts:", primaryGroups);

    const mainGroup = getMainGroup(primaryGroups);

    return {
      mainGroup,
      primaryGroups,
    };

  } catch (error) {
    console.error("RDKit analysis error:", error);

    const errorResult: FunctionalGroupResult = {
      name: "RDKit analysis error",
      priority: 999,
      nomenclaturePriority: 999,
      confidence: "Low",
      suffix: "N/A",
      prefix: "N/A",
      count: 0,
      mcatNote:
        "Something went wrong while RDKit was analyzing the molecule. Check the console for details.",
    };

    return {
      mainGroup: errorResult,
      primaryGroups: [errorResult],
    };
  }

  
}

export async function getMoleculeSvg(smiles: string): Promise<string | null> {
  try {
    const RDKit = await getRDKit();
    const cleanSmiles = smiles.replace(/\s+/g, "").trim();

    const mol = RDKit.get_mol(cleanSmiles);

    if (!mol) {
      return null;
    }

    const svg = mol.get_svg();
    mol.delete();

    return svg;
  } catch (error) {
    console.error("Molecule SVG error:", error);
    return null;
  }
}
