import { getRDKit, type FunctionalGroupResult } from "./analyzeSmiles";

export type AtomCount = {
  element: string;
  count: number;
};

export type PropertyTendencyLevel =
  | "Very low"
  | "Low"
  | "Medium"
  | "High"
  | "Very high";

export type PropertyTendencyResult = {
  level: PropertyTendencyLevel;
  score: number;
  factors: string[];
  explanation: string;
};

export type MoleculePropertyResult = {
  molecularFormula: string;
  exactMass: string | null;
  molecularWeight: string | null;
  degreesOfUnsaturation: number | null;
  formalCharge: number;
  atomCounts: AtomCount[];
  heavyAtomCount: number;
  hydrogenBondDonors: number | null;
  hydrogenBondAcceptors: number | null;
  rotatableBonds: number | null;
  topologicalPolarSurfaceArea: string | null;
  logP: string | null;
  ringCount: number | null;
  notes: string[];
  boilingPointTendency: PropertyTendencyResult;
waterSolubilityTendency: PropertyTendencyResult;
membranePermeabilityTendency: PropertyTendencyResult;
volatilityTendency: PropertyTendencyResult;
};

export type NomenclatureResult = {
  estimatedName: string;
  commonName: string | null;
  displayName: string;
  namingConfidence: "High" | "Medium" | "Low";
  parentChain: string | null;
  parentChainLength: number;
  mainSuffix: string | null;
  prefixes: string[];
  explanation: string;
  limitations: string[];
};

export type MoleculeIdentityResult = {
  nomenclature: NomenclatureResult;
  properties: MoleculePropertyResult;
};

type ParsedAtom = {
  atomIndex: number;
  element: string;
  charge: number;
};

type ParsedBond = {
  bondIndex: number;
  atomA: number;
  atomB: number;
  bondOrder: number;
};

type ParsedMol = {
  atoms: ParsedAtom[];
  bonds: ParsedBond[];
  adjacency: Map<number, ParsedBond[]>;
};

type DescriptorMap = Record<string, unknown>;

const ELEMENT_ORDER = ["C", "H", "N", "O", "F", "Cl", "Br", "I", "S", "P"];

const CHAIN_PREFIXES: Record<number, string> = {
  1: "meth",
  2: "eth",
  3: "prop",
  4: "but",
  5: "pent",
  6: "hex",
  7: "hept",
  8: "oct",
  9: "non",
  10: "dec",
};

const COMMON_VALENCES: Record<string, number> = {
  C: 4,
  N: 3,
  O: 2,
  S: 2,
  P: 3,
  F: 1,
  Cl: 1,
  Br: 1,
  I: 1,
};

function parseMolBlock(molblock: string): ParsedMol {
  const lines = molblock.split(/\r?\n/);
  const countsLine = lines[3];

  if (!countsLine) {
    return { atoms: [], bonds: [], adjacency: new Map() };
  }

  const atomCount = Number.parseInt(countsLine.slice(0, 3).trim(), 10);
  const bondCount = Number.parseInt(countsLine.slice(3, 6).trim(), 10);

  if (!Number.isFinite(atomCount) || !Number.isFinite(bondCount)) {
    return { atoms: [], bonds: [], adjacency: new Map() };
  }

  const atoms: ParsedAtom[] = lines.slice(4, 4 + atomCount).map((line, index) => {
    const parts = line.trim().split(/\s+/);

    return {
      atomIndex: index,
      element: parts[3] ?? "",
      charge: 0,
    };
  });

  const bonds: ParsedBond[] = lines
    .slice(4 + atomCount, 4 + atomCount + bondCount)
    .map((line, index) => {
      const atomA = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
      const atomB = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
      const bondOrder = Number.parseInt(line.slice(6, 9).trim(), 10);

      return {
        bondIndex: index,
        atomA,
        atomB,
        bondOrder: bondOrder === 4 ? 1.5 : bondOrder,
      };
    })
    .filter(
      (bond) =>
        Number.isFinite(bond.atomA) &&
        Number.isFinite(bond.atomB) &&
        Number.isFinite(bond.bondOrder)
    );

  for (const line of lines) {
    if (!line.startsWith("M  CHG")) continue;

    const parts = line.trim().split(/\s+/);
    const pairCount = Number.parseInt(parts[2] ?? "0", 10);

    for (let i = 0; i < pairCount; i++) {
      const atomNumber = Number.parseInt(parts[3 + i * 2] ?? "", 10);
      const charge = Number.parseInt(parts[4 + i * 2] ?? "", 10);
      const atom = atoms[atomNumber - 1];

      if (atom && Number.isFinite(charge)) {
        atom.charge = charge;
      }
    }
  }

  const adjacency = new Map<number, ParsedBond[]>();
  atoms.forEach((atom) => adjacency.set(atom.atomIndex, []));

  bonds.forEach((bond) => {
    adjacency.get(bond.atomA)?.push(bond);
    adjacency.get(bond.atomB)?.push(bond);
  });

  return { atoms, bonds, adjacency };
}

function getOtherAtom(bond: ParsedBond, atomIndex: number) {
  return bond.atomA === atomIndex ? bond.atomB : bond.atomA;
}

function getExpectedValence(atom: ParsedAtom) {
  if (atom.element === "N" && atom.charge > 0) return 4;
  if (atom.element === "O" && atom.charge < 0) return 1;
  if (atom.element === "C" && atom.charge < 0) return 3;

  return COMMON_VALENCES[atom.element] ?? 0;
}

function countImplicitHydrogens(atom: ParsedAtom, adjacency: Map<number, ParsedBond[]>) {
  if (atom.element === "H") return 0;

  const expectedValence = getExpectedValence(atom);
  if (expectedValence === 0) return 0;

  const bondOrderSum = (adjacency.get(atom.atomIndex) ?? []).reduce(
    (sum, bond) => sum + bond.bondOrder,
    0
  );

  return Math.max(0, Math.round(expectedValence - bondOrderSum));
}

function buildFormula(atomCounts: Map<string, number>) {
  const orderedElements = [
    ...ELEMENT_ORDER.filter((element) => atomCounts.has(element)),
    ...Array.from(atomCounts.keys())
      .filter((element) => !ELEMENT_ORDER.includes(element))
      .sort(),
  ];

  return orderedElements
    .map((element) => {
      const count = atomCounts.get(element) ?? 0;
      return count === 1 ? element : `${element}${count}`;
    })
    .join("");
}

function calculateAtomCounts(parsedMol: ParsedMol) {
  const counts = new Map<string, number>();

  for (const atom of parsedMol.atoms) {
    counts.set(atom.element, (counts.get(atom.element) ?? 0) + 1);

    const implicitHydrogens = countImplicitHydrogens(atom, parsedMol.adjacency);

    if (implicitHydrogens > 0) {
      counts.set("H", (counts.get("H") ?? 0) + implicitHydrogens);
    }
  }

  return counts;
}

function calculateDBE(atomCounts: Map<string, number>) {
  const carbon = atomCounts.get("C") ?? 0;
  if (carbon === 0) return null;

  const hydrogen = atomCounts.get("H") ?? 0;
  const nitrogen = atomCounts.get("N") ?? 0;

  const halogens =
    (atomCounts.get("F") ?? 0) +
    (atomCounts.get("Cl") ?? 0) +
    (atomCounts.get("Br") ?? 0) +
    (atomCounts.get("I") ?? 0);

  const dbe = carbon - (hydrogen + halogens) / 2 + nitrogen / 2 + 1;

  return Math.max(0, Number(dbe.toFixed(1)));
}

function safeParseDescriptors(rawDescriptors: unknown): DescriptorMap {
  if (!rawDescriptors) return {};

  if (typeof rawDescriptors === "string") {
    try {
      const parsed = JSON.parse(rawDescriptors);
      return parsed && typeof parsed === "object" ? (parsed as DescriptorMap) : {};
    } catch {
      return {};
    }
  }

  if (typeof rawDescriptors === "object") {
    return rawDescriptors as DescriptorMap;
  }

  return {};
}

function getNumberDescriptor(descriptors: DescriptorMap, keys: string[]) {
  for (const key of keys) {
    const value = descriptors[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function formatDescriptor(value: number | null, decimals = 2) {
  return value === null ? null : value.toFixed(decimals);
}

function getLongestCarbonPath(parsedMol: ParsedMol) {
  const carbonAtoms = parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex);

  let bestPath: number[] = [];

  const dfs = (current: number, visited: Set<number>, path: number[]) => {
    if (path.length > bestPath.length) {
      bestPath = [...path];
    }

    for (const bond of parsedMol.adjacency.get(current) ?? []) {
      const nextAtomIndex = getOtherAtom(bond, current);
      const nextAtom = parsedMol.atoms[nextAtomIndex];

      if (!nextAtom || nextAtom.element !== "C" || visited.has(nextAtomIndex)) {
        continue;
      }

      visited.add(nextAtomIndex);
      dfs(nextAtomIndex, visited, [...path, nextAtomIndex]);
      visited.delete(nextAtomIndex);
    }
  };

  for (const atomIndex of carbonAtoms) {
    dfs(atomIndex, new Set([atomIndex]), [atomIndex]);
  }

  return bestPath;
}

function getChainUnsaturation(parsedMol: ParsedMol, path: number[]) {
  const doubleLocants: number[] = [];
  const tripleLocants: number[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const bond = parsedMol.bonds.find(
      (candidate) =>
        (candidate.atomA === path[i] && candidate.atomB === path[i + 1]) ||
        (candidate.atomB === path[i] && candidate.atomA === path[i + 1])
    );

    if (!bond) continue;

    if (bond.bondOrder === 2) doubleLocants.push(i + 1);
    if (bond.bondOrder === 3) tripleLocants.push(i + 1);
  }

  return { doubleLocants, tripleLocants };
}

function getHydrocarbonBaseName(parsedMol: ParsedMol, path: number[]) {
  const prefix = CHAIN_PREFIXES[path.length];
  if (!prefix) return null;

  const { doubleLocants, tripleLocants } = getChainUnsaturation(parsedMol, path);

  if (tripleLocants.length === 1 && doubleLocants.length === 0) {
    return path.length <= 3 ? `${prefix}yne` : `${prefix}-${tripleLocants[0]}-yne`;
  }

  if (doubleLocants.length === 1 && tripleLocants.length === 0) {
    return path.length <= 3 ? `${prefix}ene` : `${prefix}-${doubleLocants[0]}-ene`;
  }

  if (doubleLocants.length > 0 || tripleLocants.length > 0) {
    return `${prefix}ene/yne`;
  }

  return `${prefix}ane`;
}

function getCommonName(iupacName: string) {
  const normalizedName = iupacName.trim().toLowerCase();

const commonNames: Record<string, string> = {
  // ----------------------------
  // Carboxylic acids
  // ----------------------------
  "methanoic acid": "formic acid",
  "ethanoic acid": "acetic acid",
  "propanoic acid": "propionic acid",
  "butanoic acid": "butyric acid",
  "pentanoic acid": "valeric acid",
  "hexanoic acid": "caproic acid",
  "heptanoic acid": "enanthic acid",
  "octanoic acid": "caprylic acid",
  "nonanoic acid": "pelargonic acid",
  "decanoic acid": "capric acid",
  "dodecanoic acid": "lauric acid",
  "tetradecanoic acid": "myristic acid",
  "hexadecanoic acid": "palmitic acid",
  "octadecanoic acid": "stearic acid",

  // Unsaturated fatty acids
  "octadec-9-enoic acid": "oleic acid",
  "octadeca-9,12-dienoic acid": "linoleic acid",
  "octadeca-9,12,15-trienoic acid": "linolenic acid",
  "eicosanoic acid": "arachidic acid",
  "eicosa-5,8,11,14-tetraenoic acid": "arachidonic acid",

  // Dicarboxylic acids
  "ethanedioic acid": "oxalic acid",
  "propanedioic acid": "malonic acid",
  "butanedioic acid": "succinic acid",
  "pentanedioic acid": "glutaric acid",
  "hexanedioic acid": "adipic acid",
  "heptanedioic acid": "pimelic acid",
  "octanedioic acid": "suberic acid",
  "nonanedioic acid": "azelaic acid",
  "decanedioic acid": "sebacic acid",

  // Hydroxy acids / keto acids
  "2-hydroxypropanoic acid": "lactic acid",
  "2-hydroxybutanedioic acid": "malic acid",
  "2,3-dihydroxybutanedioic acid": "tartaric acid",
  "2-hydroxypropane-1,2,3-tricarboxylic acid": "citric acid",
  "2-oxopropanoic acid": "pyruvic acid",
  "2-oxobutanedioic acid": "oxaloacetic acid",
  "2-oxopentanedioic acid": "alpha-ketoglutaric acid",

  // Aromatic acids
  "benzenecarboxylic acid": "benzoic acid",
  "2-hydroxybenzoic acid": "salicylic acid",
  "4-hydroxybenzoic acid": "p-hydroxybenzoic acid",
  "benzene-1,2-dicarboxylic acid": "phthalic acid",
  "benzene-1,3-dicarboxylic acid": "isophthalic acid",
  "benzene-1,4-dicarboxylic acid": "terephthalic acid",

  // ----------------------------
  // Carboxylates
  // ----------------------------
  "methanoate": "formate",
  "ethanoate": "acetate",
  "propanoate": "propionate",
  "butanoate": "butyrate",
  "pentanoate": "valerate",
  "hexanoate": "caproate",
  "benzoate": "benzoate",
  "2-hydroxypropanoate": "lactate",
  "2-oxopropanoate": "pyruvate",
  "ethanedioate": "oxalate",
  "propanedioate": "malonate",
  "butanedioate": "succinate",
  "pentanedioate": "glutarate",
  "hexanedioate": "adipate",

  // ----------------------------
  // Aldehydes
  // ----------------------------
  "methanal": "formaldehyde",
  "ethanal": "acetaldehyde",
  "propanal": "propionaldehyde",
  "butanal": "butyraldehyde",
  "pentanal": "valeraldehyde",
  "hexanal": "caproaldehyde",
  "benzaldehyde": "benzaldehyde",
  "2-hydroxybenzaldehyde": "salicylaldehyde",
  "4-hydroxybenzaldehyde": "p-hydroxybenzaldehyde",
  "2-oxopropanedial": "mesoxaldehyde",

  // ----------------------------
  // Ketones
  // ----------------------------
  "propanone": "acetone",
  "butanone": "methyl ethyl ketone",
  "pentan-2-one": "methyl propyl ketone",
  "pentan-3-one": "diethyl ketone",
  "hexan-2-one": "methyl butyl ketone",
  "hexan-3-one": "ethyl propyl ketone",
  "cyclohexanone": "cyclohexanone",
  "phenylethanone": "acetophenone",
  "1-phenylethanone": "acetophenone",
  "diphenylmethanone": "benzophenone",

  // ----------------------------
  // Alcohols
  // ----------------------------
  "methanol": "methyl alcohol",
  "ethanol": "ethyl alcohol",
  "propanol": "propyl alcohol",
  "propan-1-ol": "n-propyl alcohol",
  "propan-2-ol": "isopropyl alcohol",
  "butanol": "butyl alcohol",
  "butan-1-ol": "n-butyl alcohol",
  "butan-2-ol": "sec-butyl alcohol",
  "2-methylpropan-1-ol": "isobutyl alcohol",
  "2-methylpropan-2-ol": "tert-butyl alcohol",
  "ethane-1,2-diol": "ethylene glycol",
  "propane-1,2-diol": "propylene glycol",
  "propane-1,2,3-triol": "glycerol",
  "cyclohexanol": "cyclohexanol",
  "phenylmethanol": "benzyl alcohol",

  // ----------------------------
  // Phenols / aromatic alcohol-like compounds
  // ----------------------------
  "hydroxybenzene": "phenol",
  "methylphenol": "cresol",
  "2-methylphenol": "o-cresol",
  "3-methylphenol": "m-cresol",
  "4-methylphenol": "p-cresol",
  "benzene-1,2-diol": "catechol",
  "benzene-1,3-diol": "resorcinol",
  "benzene-1,4-diol": "hydroquinone",
  "benzene-1,2,3-triol": "pyrogallol",

  // ----------------------------
  // Ethers
  // ----------------------------
  "methoxybenzene": "anisole",
  "ethoxybenzene": "phenetole",
  "methoxymethane": "dimethyl ether",
  "ethoxyethane": "diethyl ether",
  "methoxyethane": "methyl ethyl ether",
  "2-methoxy-2-methylpropane": "MTBE",

  // ----------------------------
  // Amines
  // ----------------------------
  "methanamine": "methylamine",
  "ethanamine": "ethylamine",
  "propan-1-amine": "propylamine",
  "propan-2-amine": "isopropylamine",
  "butan-1-amine": "butylamine",
  "aminobenzene": "aniline",
  "phenylmethanamine": "benzylamine",
  "dimethylamine": "dimethylamine",
  "trimethylamine": "trimethylamine",
  "diethylamine": "diethylamine",
  "triethylamine": "triethylamine",

  // ----------------------------
  // Amides
  // ----------------------------
  "methanamide": "formamide",
  "ethanamide": "acetamide",
  "propanamide": "propionamide",
  "butanamide": "butyramide",
  "benzamide": "benzamide",
  "n,n-dimethylmethanamide": "DMF",
  "n,n-dimethylformamide": "DMF",
  "n,n-dimethylethanamide": "DMA",
  "n,n-dimethylacetamide": "DMA",

  // ----------------------------
  // Esters
  // ----------------------------
  "methyl methanoate": "methyl formate",
  "methyl ethanoate": "methyl acetate",
  "ethyl ethanoate": "ethyl acetate",
  "propyl ethanoate": "propyl acetate",
  "butyl ethanoate": "butyl acetate",
  "methyl propanoate": "methyl propionate",
  "ethyl propanoate": "ethyl propionate",
  "methyl butanoate": "methyl butyrate",
  "ethyl butanoate": "ethyl butyrate",

  // ----------------------------
  // Nitriles
  // ----------------------------
  "methanenitrile": "hydrogen cyanide",
  "ethanenitrile": "acetonitrile",
  "propanenitrile": "propionitrile",
  "butanenitrile": "butyronitrile",
  "benzenecarbonitrile": "benzonitrile",

  // ----------------------------
  // Thiols / sulfur compounds
  // ----------------------------
  "methanethiol": "methyl mercaptan",
  "ethanethiol": "ethyl mercaptan",
  "propanethiol": "propyl mercaptan",
  "benzenethiol": "thiophenol",
  "dimethyl sulfide": "dimethyl sulfide",
  "dimethyl sulfoxide": "DMSO",

  // ----------------------------
  // Aromatic hydrocarbons
  // ----------------------------
  "benzene": "benzene",
  "methylbenzene": "toluene",
  "ethylbenzene": "ethylbenzene",
  "ethenylbenzene": "styrene",
  "vinylbenzene": "styrene",
  "dimethylbenzene": "xylene",
  "1,2-dimethylbenzene": "o-xylene",
  "1,3-dimethylbenzene": "m-xylene",
  "1,4-dimethylbenzene": "p-xylene",
  "isopropylbenzene": "cumene",
  "propan-2-ylbenzene": "cumene",
  "naphthalene": "naphthalene",
  "anthracene": "anthracene",
  "phenanthrene": "phenanthrene",

  // ----------------------------
  // Halogenated compounds
  // ----------------------------
  "chloromethane": "methyl chloride",
  "dichloromethane": "methylene chloride",
  "trichloromethane": "chloroform",
  "tetrachloromethane": "carbon tetrachloride",
  "bromoethane": "ethyl bromide",
  "iodoethane": "ethyl iodide",
  "chloroethane": "ethyl chloride",
  "fluoroethane": "ethyl fluoride",
  "1,1,1-trichloroethane": "methyl chloroform",
  "tetrachloroethene": "perchloroethylene",
  "trichloroethene": "trichloroethylene",

  // ----------------------------
  // Common small inorganic/simple molecules
  // ----------------------------
  "water": "water",
  "ammonia": "ammonia",
  "methane": "methane",
  "ethane": "ethane",
  "propane": "propane",
  "butane": "butane",
  "ethene": "ethylene",
  "propene": "propylene",
  "ethyne": "acetylene",
  "carbon dioxide": "carbon dioxide",
  "carbon monoxide": "carbon monoxide",

  // ----------------------------
  // Sugars / biomolecule names
  // ----------------------------
  "glucose": "glucose",
  "fructose": "fructose",
  "galactose": "galactose",
  "ribose": "ribose",
  "deoxyribose": "deoxyribose",
  "sucrose": "sucrose",
  "lactose": "lactose",
  "maltose": "maltose",

  // ----------------------------
  // Amino acids
  // ----------------------------
  "2-aminoethanoic acid": "glycine",
  "2-aminopropanoic acid": "alanine",
  "2-amino-3-methylbutanoic acid": "valine",
  "2-amino-4-methylpentanoic acid": "leucine",
  "2-amino-3-methylpentanoic acid": "isoleucine",
  "2-amino-3-hydroxypropanoic acid": "serine",
  "2-amino-3-hydroxybutanoic acid": "threonine",
  "2-amino-3-phenylpropanoic acid": "phenylalanine",
  "2-amino-3-(4-hydroxyphenyl)propanoic acid": "tyrosine",
  "2-amino-3-sulfanylpropanoic acid": "cysteine",
  "2-amino-4-methylsulfanylbutanoic acid": "methionine",
  "2-aminopentanedioic acid": "glutamic acid",
  "2-aminobutanedioic acid": "aspartic acid",
  "2,6-diaminohexanoic acid": "lysine",
  "2-amino-5-guanidinopentanoic acid": "arginine",
  "2-amino-3-(1h-imidazol-4-yl)propanoic acid": "histidine",
  "pyrrolidine-2-carboxylic acid": "proline",
  "2-amino-3-(1h-indol-3-yl)propanoic acid": "tryptophan",
  "2-amino-3-carbamoylpropanoic acid": "asparagine",
  "2-amino-4-carbamoylbutanoic acid": "glutamine",
};

  return commonNames[normalizedName] ?? null;
}

function formatDisplayName(iupacName: string, commonName: string | null) {
  return commonName ? `${iupacName} (${commonName})` : iupacName;
}

function getPrefixes(
  functionalGroups: FunctionalGroupResult[],
  mainGroup: FunctionalGroupResult | null
) {
  return functionalGroups
    .filter((group) => group.name !== mainGroup?.name)
    .map((group) => `${group.prefix}${group.count > 1 ? ` ×${group.count}` : ""}`)
    .filter((prefix) => prefix && !prefix.toLowerCase().includes("never suffix"));
}

function isAldehydeCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  const atom = parsedMol.atoms[carbonIndex];
  if (!atom || atom.element !== "C") return false;

  const bonds = parsedMol.adjacency.get(carbonIndex) ?? [];

  const hasCarbonylOxygen = bonds.some((bond) => {
    const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return otherAtom?.element === "O" && bond.bondOrder === 2;
  });

  if (!hasCarbonylOxygen) return false;

  const implicitHydrogens = countImplicitHydrogens(atom, parsedMol.adjacency);

  return implicitHydrogens >= 1;
}

function isKetoneCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  const atom = parsedMol.atoms[carbonIndex];
  if (!atom || atom.element !== "C") return false;

  const bonds = parsedMol.adjacency.get(carbonIndex) ?? [];

  const hasCarbonylOxygen = bonds.some((bond) => {
    const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return otherAtom?.element === "O" && bond.bondOrder === 2;
  });

  if (!hasCarbonylOxygen) return false;

  const carbonNeighbors = bonds.filter((bond) => {
    const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return otherAtom?.element === "C";
  });

  return carbonNeighbors.length >= 2;
}

function hasCarbonCycle(parsedMol: ParsedMol) {
  const carbonAtomIndexes = parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex);

  const carbonAtomSet = new Set(carbonAtomIndexes);

  const carbonCarbonBonds = parsedMol.bonds.filter((bond) => {
    return carbonAtomSet.has(bond.atomA) && carbonAtomSet.has(bond.atomB);
  });

  // For a simple connected carbon ring, C-C bonds are at least equal to C atoms.
  return carbonAtomIndexes.length >= 3 && carbonCarbonBonds.length >= carbonAtomIndexes.length;
}

function getParentDescriptor(parsedMol: ParsedMol): ParentDescriptor {
  const carbonPath = getLongestCarbonPath(parsedMol);
  const carbonCount = parsedMol.atoms.filter((atom) => atom.element === "C").length;

  const isSimpleCarbonRing = hasCarbonCycle(parsedMol);
  const prefix = CHAIN_PREFIXES[isSimpleCarbonRing ? carbonCount : carbonPath.length];

  if (isSimpleCarbonRing && prefix) {
    return {
      kind: "ring",
      path: parsedMol.atoms
        .filter((atom) => atom.element === "C")
        .map((atom) => atom.atomIndex),
      carbonCount,
      parentHydrocarbon: `cyclo${prefix}ane`,
      parentStem: `cyclo${prefix}an`,
    };
  }

  return {
    kind: "chain",
    path: carbonPath,
    carbonCount: carbonPath.length,
    parentHydrocarbon: getHydrocarbonBaseName(parsedMol, carbonPath),
    parentStem: prefix ? `${prefix}an` : null,
  };
}

function getLocantMap(parent: ParentDescriptor) {
  const locants = new Map<number, number>();

  parent.path.forEach((atomIndex, index) => {
    locants.set(atomIndex, index + 1);
  });

  return locants;
}

function getCarboxylicAcidCarbons(parsedMol: ParsedMol) {
  return parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .filter((carbon) => {
      const bonds = parsedMol.adjacency.get(carbon.atomIndex) ?? [];

      const hasCarbonylOxygen = bonds.some((bond) => {
        const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbon.atomIndex)];
        return otherAtom?.element === "O" && bond.bondOrder === 2;
      });

      const hasSingleBondedOxygen = bonds.some((bond) => {
        const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbon.atomIndex)];
        return otherAtom?.element === "O" && bond.bondOrder === 1;
      });

      return hasCarbonylOxygen && hasSingleBondedOxygen;
    })
    .map((atom) => atom.atomIndex);
}

function getAlcoholLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
  const locantMap = getLocantMap(parent);
  const locants: number[] = [];

  for (const oxygen of parsedMol.atoms.filter((atom) => atom.element === "O")) {
    const bonds = parsedMol.adjacency.get(oxygen.atomIndex) ?? [];

    const singleCarbonBond = bonds.find((bond) => {
      const otherAtom = parsedMol.atoms[getOtherAtom(bond, oxygen.atomIndex)];
      return otherAtom?.element === "C" && bond.bondOrder === 1;
    });

    if (!singleCarbonBond) continue;

    const carbonIndex = getOtherAtom(singleCarbonBond, oxygen.atomIndex);
    const carbonBonds = parsedMol.adjacency.get(carbonIndex) ?? [];

    const carbonAlsoHasCarbonylOxygen = carbonBonds.some((bond) => {
      const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
      return otherAtom?.element === "O" && bond.bondOrder === 2;
    });

    // Skip carboxylic acid OH. It is part of acid naming, not alcohol naming.
    if (carbonAlsoHasCarbonylOxygen) continue;

    const locant = locantMap.get(carbonIndex);
    if (locant) locants.push(locant);
  }

  return Array.from(new Set(locants)).sort((a, b) => a - b);
}

function getFeatureLocantsFromCarbonIndexes(
  parent: ParentDescriptor,
  carbonIndexes: number[]
) {
  const locantMap = getLocantMap(parent);

  return carbonIndexes
    .map((atomIndex) => locantMap.get(atomIndex))
    .filter((locant): locant is number => typeof locant === "number")
    .sort((a, b) => a - b);
}

function detectNamingFeatures(parsedMol: ParsedMol, parent: ParentDescriptor): NamingFeature[] {
  const acidLocants = getFeatureLocantsFromCarbonIndexes(
    parent,
    getCarboxylicAcidCarbons(parsedMol)
  );

  const aldehydeLocants = getFeatureLocantsFromCarbonIndexes(
    parent,
    parent.path.filter((atomIndex) => isAldehydeCarbon(parsedMol, atomIndex))
  );

  const ketoneLocants = getFeatureLocantsFromCarbonIndexes(
    parent,
    parent.path.filter((atomIndex) => isKetoneCarbon(parsedMol, atomIndex))
  );

  const alcoholLocants = getAlcoholLocants(parsedMol, parent);

  const features: NamingFeature[] = [];

  if (acidLocants.length > 0) {
    features.push({
      type: "carboxylicAcid",
      locants: acidLocants,
      suffix: "oic acid",
      prefix: "carboxy",
      priority: 1,
    });
  }

  if (aldehydeLocants.length > 0) {
    features.push({
      type: "aldehyde",
      locants: aldehydeLocants,
      suffix: "al",
      prefix: "formyl",
      priority: 2,
    });
  }

  if (ketoneLocants.length > 0) {
    features.push({
      type: "ketone",
      locants: ketoneLocants,
      suffix: "one",
      prefix: "oxo",
      priority: 3,
    });
  }

  if (alcoholLocants.length > 0) {
    features.push({
      type: "alcohol",
      locants: alcoholLocants,
      suffix: "ol",
      prefix: "hydroxy",
      priority: 4,
    });
  }

  return features.sort((a, b) => a.priority - b.priority);
}

function formatLocants(locants: number[]) {
  return locants.join(",");
}

function formatPrefix(feature: NamingFeature) {
  const locants = formatLocants(feature.locants);

  if (feature.locants.length === 0) return feature.prefix;

  if (feature.locants.length === 1) {
    return `${locants}-${feature.prefix}`;
  }

  const multiplier =
    feature.locants.length === 2
      ? "di"
      : feature.locants.length === 3
        ? "tri"
        : "";

  return `${locants}-${multiplier}${feature.prefix}`;
}

function buildPrefixString(features: NamingFeature[], primaryFeature: NamingFeature | null) {
  return features
    .filter((feature) => feature !== primaryFeature)
    .map(formatPrefix)
    .sort()
    .join("");
}

function buildSuffixName(parent: ParentDescriptor, primaryFeature: NamingFeature | null) {
  if (!parent.parentStem || !parent.parentHydrocarbon) {
    return null;
  }

  if (!primaryFeature) {
    return parent.parentHydrocarbon;
  }

  const locants = primaryFeature.locants;
  const firstLocant = locants[0];

  if (parent.kind === "ring") {
    switch (primaryFeature.type) {
      case "ketone":
        return `${parent.parentStem}one`;

      case "alcohol":
        return `${parent.parentStem}ol`;

      default:
        return `${parent.parentHydrocarbon} with ${primaryFeature.suffix}`;
    }
  }

  switch (primaryFeature.type) {
    case "carboxylicAcid":
      if (locants.length >= 2) return `${parent.parentStem}edioic acid`;
      return `${parent.parentStem}oic acid`;

    case "aldehyde":
      if (locants.length >= 2) return `${parent.parentStem}edial`;
      return `${parent.parentStem}al`;

    case "ketone":
      if (!firstLocant) return `${parent.parentStem}one`;
      if (parent.carbonCount <= 3) return `${parent.parentStem}one`;
      return `${parent.parentStem}-${firstLocant}-one`;

    case "alcohol":
      if (!firstLocant) return `${parent.parentStem}ol`;
      if (parent.carbonCount <= 2) return `${parent.parentStem}ol`;
      return `${parent.parentStem}-${firstLocant}-ol`;

    default:
      return parent.parentHydrocarbon;
  }
}



function buildEstimatedIupacName(parsedMol: ParsedMol) {
  const parent = getParentDescriptor(parsedMol);
  const features = detectNamingFeatures(parsedMol, parent);
  const primaryFeature = features[0] ?? null;

  const suffixName = buildSuffixName(parent, primaryFeature);

  if (!suffixName) {
    return null;
  }

  const prefixString = buildPrefixString(features, primaryFeature);
  const estimatedName = `${prefixString}${suffixName}`;

  return {
    estimatedName,
    parent,
    features,
    primaryFeature,
  };
}

type ParentDescriptor = {
  kind: "chain" | "ring";
  path: number[];
  carbonCount: number;
  parentHydrocarbon: string | null;
  parentStem: string | null;
};

type NamingFeatureType =
  | "carboxylicAcid"
  | "aldehyde"
  | "ketone"
  | "alcohol"
  | "amine"
  | "thiol"
  | "nitrile"
  | "amide";

type NamingFeature = {
  type: NamingFeatureType;
  locants: number[];
  suffix: string;
  prefix: string;
  priority: number;
};

function estimateNomenclature(
  parsedMol: ParsedMol,
  functionalGroups: FunctionalGroupResult[],
  mainGroup: FunctionalGroupResult | null
): NomenclatureResult {
  const namingResult = buildEstimatedIupacName(parsedMol);
  const prefixes = getPrefixes(functionalGroups, mainGroup);
  const limitations: string[] = [];

  if (!namingResult) {
    const fallbackName = mainGroup
      ? `${mainGroup.name} derivative`
      : "Name not estimated yet";

    return {
      estimatedName: fallbackName,
      commonName: null,
      displayName: fallbackName,
      namingConfidence: "Low",
      parentChain: null,
      parentChainLength: 0,
      mainSuffix: mainGroup?.suffix ?? null,
      prefixes,
      explanation:
        "PocketChem could not build a parent-based name for this structure yet.",
      limitations: [
        "Current nomenclature support is strongest for simple chains, simple rings, and common carbonyl/alcohol combinations.",
        "Complex branching, fused rings, stereochemistry, and full IUPAC tie-breaking are still in development.",
      ],
    };
  }

  const { estimatedName, parent, features, primaryFeature } = namingResult;
  const commonName = getCommonName(estimatedName);
  const displayName = formatDisplayName(estimatedName, commonName);

  const lowerPriorityFeatures = features.filter((feature) => feature !== primaryFeature);

  if (parent.kind === "ring") {
    limitations.push(
      "Simple ring naming is supported, but substituted ring locant numbering is still limited."
    );
  }

  if (lowerPriorityFeatures.length > 0) {
    limitations.push(
      "Lower-priority functional groups are treated as prefixes, such as oxo or hydroxy."
    );
  }

  if (parsedMol.bonds.some((bond) => bond.bondOrder === 1.5)) {
    limitations.push("Aromatic naming is not fully implemented yet.");
  }

  const namingConfidence: NomenclatureResult["namingConfidence"] =
    parent.kind === "ring" && lowerPriorityFeatures.length > 0
      ? "Medium"
      : lowerPriorityFeatures.length > 1
        ? "Low"
        : "Medium";

  return {
    estimatedName,
    commonName,
    displayName,
    namingConfidence,
    parentChain: parent.parentHydrocarbon,
    parentChainLength: parent.carbonCount,
    mainSuffix: primaryFeature ? `-${primaryFeature.suffix}` : null,
    prefixes,
    explanation: primaryFeature
      ? `Detected ${primaryFeature.type} as the highest-priority naming group. Lower-priority groups are named as prefixes when possible.`
      : "Uses the carbon parent structure as the estimated hydrocarbon name.",
    limitations:
      limitations.length > 0
        ? limitations
        : [
            "This is an estimated learning name, not a full IUPAC engine yet.",
            "Common names are included for high-yield small molecules.",
            "Next step: add full branch numbering, stereochemistry, and advanced ring naming.",
          ],
  };
}

function scoreToTendencyLevel(score: number): PropertyTendencyLevel {
  if (score <= 1) return "Very low";
  if (score <= 3) return "Low";
  if (score <= 5) return "Medium";
  if (score <= 8) return "High";
  return "Very high";
}

function estimateBoilingPointTendency(
  parsedMol: ParsedMol,
  functionalGroups: FunctionalGroupResult[],
  molecularWeight: number | null,
  formalCharge: number,
  hydrogenBondDonors: number | null,
  hydrogenBondAcceptors: number | null
): PropertyTendencyResult {
  let score = 0;
  const factors: string[] = [];

  if (molecularWeight !== null) {
    if (molecularWeight < 50) {
      factors.push("Small molecular weight lowers boiling point.");
    } else if (molecularWeight < 100) {
      score += 1;
      factors.push("Moderate molecular weight slightly raises boiling point.");
    } else if (molecularWeight < 200) {
      score += 2;
      factors.push("Larger molecular weight raises boiling point.");
    } else {
      score += 3;
      factors.push("High molecular weight strongly raises boiling point.");
    }
  }

  if (formalCharge !== 0) {
    score += 5;
    factors.push("Formal charge greatly increases intermolecular attraction.");
  }

  const groupNames = functionalGroups.map((group) => group.name);

  if (groupNames.includes("Carboxylic acid")) {
    score += 4;
    factors.push(
      "Carboxylic acids have high boiling points because they can form strong hydrogen-bonded dimers."
    );
  }

  if (groupNames.includes("Amide")) {
    score += 4;
    factors.push("Amides have very strong dipoles and hydrogen bonding.");
  }

  if (groupNames.includes("Alcohol")) {
    score += 3;
    factors.push("Alcohols can hydrogen bond, which raises boiling point.");
  }

  if (groupNames.includes("Amine")) {
    score += 2;
    factors.push("Amines can hydrogen bond, but usually less strongly than alcohols.");
  }

  if (
    groupNames.includes("Ketone") ||
    groupNames.includes("Aldehyde") ||
    groupNames.includes("Ester") ||
    groupNames.includes("Nitrile")
  ) {
    score += 2;
    factors.push("Polar functional groups increase dipole-dipole attractions.");
  }

  if (groupNames.includes("Ether")) {
    score += 1;
    factors.push("Ethers are polar but cannot donate hydrogen bonds.");
  }

  if (hydrogenBondDonors !== null && hydrogenBondDonors > 0) {
    score += Math.min(hydrogenBondDonors, 3);
    factors.push("Hydrogen-bond donors raise boiling point.");
  }

  if (hydrogenBondAcceptors !== null && hydrogenBondAcceptors > 0) {
    score += Math.min(hydrogenBondAcceptors * 0.5, 2);
    factors.push("Hydrogen-bond acceptors increase intermolecular attraction.");
  }

  const carbonCount = parsedMol.atoms.filter((atom) => atom.element === "C").length;
  const longestCarbonPath = getLongestCarbonPath(parsedMol);
  const branchEstimate = carbonCount - longestCarbonPath.length;

  if (branchEstimate >= 2) {
    score -= 1;
    factors.push("Branching lowers boiling point by reducing surface contact.");
  }

  return {
    level: scoreToTendencyLevel(score),
    score: Number(score.toFixed(1)),
    factors,
    explanation:
      "This is a qualitative boiling point tendency, not an exact experimental boiling point. It is based on molecular weight, polarity, hydrogen bonding, charge, and branching.",
  };
}

function estimateWaterSolubilityTendency(
  molecularWeight: number | null,
  formalCharge: number,
  hydrogenBondDonors: number | null,
  hydrogenBondAcceptors: number | null,
  tpsa: number | null,
  logP: number | null,
  functionalGroups: FunctionalGroupResult[]
): PropertyTendencyResult {
  let score = 0;
  const factors: string[] = [];

  const groupNames = functionalGroups.map((group) => group.name);

  if (formalCharge !== 0) {
    score += 5;
    factors.push("Formal charge strongly increases water solubility.");
  }

  if (tpsa !== null) {
    if (tpsa < 40) {
      factors.push("Low TPSA means less polar surface area.");
    } else if (tpsa < 90) {
      score += 2;
      factors.push("Moderate TPSA increases water interaction.");
    } else if (tpsa < 140) {
      score += 3;
      factors.push("High TPSA strongly increases water interaction.");
    } else {
      score += 4;
      factors.push("Very high TPSA usually means strong water interaction.");
    }
  }

  if (logP !== null) {
    if (logP < 0) {
      score += 3;
      factors.push("Negative logP means the molecule strongly prefers water over oil.");
    } else if (logP <= 1) {
      score += 2;
      factors.push("Low logP means the molecule is fairly water-loving.");
    } else if (logP <= 3) {
      score += 1;
      factors.push("Moderate logP gives a balance between water and lipid solubility.");
    } else if (logP <= 5) {
      score -= 2;
      factors.push("High logP lowers water solubility because the molecule prefers lipid-like environments.");
    } else {
      score -= 4;
      factors.push("Very high logP usually means poor water solubility.");
    }
  }

  if (hydrogenBondDonors !== null && hydrogenBondDonors > 0) {
    score += Math.min(hydrogenBondDonors, 3);
    factors.push("Hydrogen-bond donors increase water solubility.");
  }

  if (hydrogenBondAcceptors !== null && hydrogenBondAcceptors > 0) {
    score += Math.min(hydrogenBondAcceptors * 0.5, 2);
    factors.push("Hydrogen-bond acceptors help the molecule interact with water.");
  }

  if (groupNames.includes("Carboxylic acid")) {
    score += 2;
    factors.push("Carboxylic acids are polar and can hydrogen bond with water.");
  }

  if (groupNames.includes("Alcohol")) {
    score += 2;
    factors.push("Alcohol groups increase water solubility through hydrogen bonding.");
  }

  if (molecularWeight !== null && molecularWeight > 250 && formalCharge === 0) {
    score -= 1;
    factors.push("Larger neutral molecules are usually less water-soluble.");
  }

  return {
    level: scoreToTendencyLevel(score),
    score: Number(score.toFixed(1)),
    factors,
    explanation:
      "This estimates how easily the molecule dissolves in water. It uses charge, polarity, hydrogen bonding, TPSA, logP, and molecular size.",
  };
}

function estimateMembranePermeabilityTendency(
  molecularWeight: number | null,
  formalCharge: number,
  hydrogenBondDonors: number | null,
  tpsa: number | null,
  logP: number | null
): PropertyTendencyResult {
  let score = 5;
  const factors: string[] = [];

  if (formalCharge !== 0) {
    score -= 5;
    factors.push("Formal charge strongly lowers passive membrane permeability.");
  }

  if (molecularWeight !== null) {
    if (molecularWeight < 300) {
      score += 1;
      factors.push("Lower molecular weight helps membrane crossing.");
    } else if (molecularWeight > 500) {
      score -= 3;
      factors.push("Very large molecules usually cross membranes poorly.");
    } else if (molecularWeight > 400) {
      score -= 1;
      factors.push("Larger molecular weight can reduce membrane crossing.");
    }
  }

  if (tpsa !== null) {
    if (tpsa < 40) {
      score += 2;
      factors.push("Low TPSA usually supports membrane permeability.");
    } else if (tpsa < 90) {
      factors.push("Moderate TPSA may still allow membrane crossing.");
    } else if (tpsa < 140) {
      score -= 2;
      factors.push("High TPSA lowers membrane permeability.");
    } else {
      score -= 4;
      factors.push("Very high TPSA usually strongly lowers membrane permeability.");
    }
  }

  if (logP !== null) {
    if (logP < 0) {
      score -= 2;
      factors.push("Negative logP means the molecule is very water-loving, which lowers lipid membrane crossing.");
    } else if (logP <= 3) {
      score += 2;
      factors.push("logP around 1–3 often supports a good balance for membrane crossing.");
    } else if (logP <= 5) {
      score += 1;
      factors.push("Higher logP can support lipid membrane crossing but may reduce water solubility.");
    } else {
      score -= 1;
      factors.push("Very high logP can reduce useful permeability because of poor water solubility.");
    }
  }

  if (hydrogenBondDonors !== null && hydrogenBondDonors > 3) {
    score -= 1;
    factors.push("Many hydrogen-bond donors can reduce passive membrane crossing.");
  }

  return {
    level: scoreToTendencyLevel(score),
    score: Number(score.toFixed(1)),
    factors,
    explanation:
      "This estimates passive membrane crossing tendency. It uses charge, molecular weight, TPSA, logP, and hydrogen-bonding ability.",
  };
}

function estimateVolatilityTendency(
  boilingPointTendency: PropertyTendencyResult,
  molecularWeight: number | null,
  formalCharge: number
): PropertyTendencyResult {
  let score = 10 - boilingPointTendency.score;
  const factors: string[] = [
    "Volatility usually moves opposite to boiling point: lower boiling point means higher volatility.",
  ];

  if (formalCharge !== 0) {
    score -= 4;
    factors.push("Charged molecules are usually not very volatile.");
  }

  if (molecularWeight !== null && molecularWeight < 75) {
    score += 1;
    factors.push("Small molecules tend to be more volatile.");
  }

  if (molecularWeight !== null && molecularWeight > 200) {
    score -= 2;
    factors.push("Large molecules tend to be less volatile.");
  }

  return {
    level: scoreToTendencyLevel(score),
    score: Number(score.toFixed(1)),
    factors,
    explanation:
      "This estimates how easily a molecule evaporates. Higher volatility usually means lower boiling point, smaller size, and weaker intermolecular forces.",
  };
}

function buildProperties(
  parsedMol: ParsedMol,
  descriptors: DescriptorMap,
  functionalGroups: FunctionalGroupResult[]
): MoleculePropertyResult {
  const counts = calculateAtomCounts(parsedMol);
  const formula = buildFormula(counts);
  const dbe = calculateDBE(counts);
  const formalCharge = parsedMol.atoms.reduce((sum, atom) => sum + atom.charge, 0);
  const heavyAtomCount = parsedMol.atoms.filter((atom) => atom.element !== "H").length;

  const exactMass = getNumberDescriptor(descriptors, ["exactmw", "ExactMolWt", "exactMolWt"]);
  const molecularWeight = getNumberDescriptor(descriptors, ["amw", "MolWt", "molwt"]);
  let hbd = getNumberDescriptor(descriptors, ["lipinskiHBD", "NumHDonors", "hbd"]);
  let hba = getNumberDescriptor(descriptors, ["lipinskiHBA", "NumHAcceptors", "hba"]);

    /**
     * Teaching override:
     * RDKit or descriptor methods may count both oxygens in a carboxylic acid
     * as H-bond acceptors. For organic chemistry / MCAT-style teaching,
     * the carboxylic acid OH oxygen is usually not counted as an effective
     * H-bond acceptor. The carbonyl oxygen is the main acceptor.
     *
     * Example:
     * CH3COOH = 1 HBD, 1 HBA
     */
    const carboxylicAcidCount = countCarboxylicAcidGroups(parsedMol);

    if (carboxylicAcidCount > 0 && hba !== null) {
    hba = Math.max(0, hba - carboxylicAcidCount);
    }

  
  const rotatableBonds = getNumberDescriptor(descriptors, [
    "NumRotatableBonds",
    "numRotatableBonds",
  ]);
  
  const tpsa = getNumberDescriptor(descriptors, ["tpsa", "TPSA"]);
  const logP = getNumberDescriptor(descriptors, ["CrippenClogP", "MolLogP", "logp"]);
  const ringCount = getNumberDescriptor(descriptors, ["NumRings", "numRings"]);

  const boilingPointTendency = estimateBoilingPointTendency(
  parsedMol,
  functionalGroups,
  molecularWeight,
  formalCharge,
  hbd,
  hba
);

const waterSolubilityTendency = estimateWaterSolubilityTendency(
  molecularWeight,
  formalCharge,
  hbd,
  hba,
  tpsa,
  logP,
  functionalGroups
);

const membranePermeabilityTendency = estimateMembranePermeabilityTendency(
  molecularWeight,
  formalCharge,
  hbd,
  tpsa,
  logP
);

const volatilityTendency = estimateVolatilityTendency(
  boilingPointTendency,
  molecularWeight,
  formalCharge
);

  const atomCounts = Array.from(counts.entries()).map(([element, count]) => ({
    element,
    count,
  }));

  const notes = [
    "Formula and DBE are calculated from the RDKit mol block plus PocketChem implicit-hydrogen estimates.",
  ];

  if (exactMass === null || molecularWeight === null) {
    notes.push("Some descriptor values were not available from the current RDKit build.");
  }

  return {
    molecularFormula: formula || "Not available",
    exactMass: formatDescriptor(exactMass, 4),
    molecularWeight: formatDescriptor(molecularWeight, 2),
    degreesOfUnsaturation: dbe,
    formalCharge,
    atomCounts,
    heavyAtomCount,
    hydrogenBondDonors: hbd,
    hydrogenBondAcceptors: hba,
    rotatableBonds,
    topologicalPolarSurfaceArea: formatDescriptor(tpsa, 2),
    logP: formatDescriptor(logP, 2),
    ringCount,
    boilingPointTendency,
    waterSolubilityTendency,
    membranePermeabilityTendency,
    volatilityTendency,
    notes,
   
  };
}

function countCarboxylicAcidGroups(parsedMol: ParsedMol) {
  let count = 0;

  for (const carbon of parsedMol.atoms.filter((atom) => atom.element === "C")) {
    const carbonBonds = parsedMol.adjacency.get(carbon.atomIndex) ?? [];

    const hasCarbonylOxygen = carbonBonds.some((bond) => {
      const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbon.atomIndex)];
      return otherAtom?.element === "O" && bond.bondOrder === 2;
    });

    const hasSingleBondedOxygen = carbonBonds.some((bond) => {
      const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbon.atomIndex)];
      return otherAtom?.element === "O" && bond.bondOrder === 1;
    });

    if (hasCarbonylOxygen && hasSingleBondedOxygen) {
      count += 1;
    }
  }

  return count;
}

export async function analyzeNomenclatureAndProperties(
  smiles: string,
  functionalGroups: FunctionalGroupResult[],
  mainGroup: FunctionalGroupResult | null
): Promise<MoleculeIdentityResult> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) {
    throw new Error("Could not create molecule for nomenclature/property analysis.");
  }

  try {
    const parsedMol = parseMolBlock(mol.get_molblock());

    const molWithDescriptors = mol as {
      get_descriptors?: () => unknown;
    };

    const descriptors = safeParseDescriptors(molWithDescriptors.get_descriptors?.());

    return {
      nomenclature: estimateNomenclature(parsedMol, functionalGroups, mainGroup),
      properties: buildProperties(parsedMol, descriptors, functionalGroups),
    };
  } finally {
    mol.delete?.();
  }
}