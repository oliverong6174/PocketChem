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
  motifs?: string[];
};

export type MoleculeIdentityResult = {
  nomenclature: NomenclatureResult;
  properties: MoleculePropertyResult;
};

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

type ParentDescriptor = {
  kind: "chain" | "ring";
  path: number[];
  carbonCount: number;
  parentHydrocarbon: string | null;
  parentStem: string | null;
  aromaticRing?: boolean;
};

type RingDescriptor = {
  ringAtoms: number[];
  ringBonds: ParsedBond[];
};

type NamingFeatureType =
  | "carboxylicAcid"
  | "ester"
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
  alkylName?: string;
};

type Substituent = {
  name: string;
  locant: number;
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

function getAlcoholBearingCarbons(parsedMol: ParsedMol) {
  const alcoholCarbons: number[] = [];

  for (const oxygen of parsedMol.atoms.filter((atom) => atom.element === "O")) {
    const bonds = parsedMol.adjacency.get(oxygen.atomIndex) ?? [];

    const carbonBond = bonds.find((bond) => {
      const otherAtom = parsedMol.atoms[getOtherAtom(bond, oxygen.atomIndex)];
      return otherAtom?.element === "C" && bond.bondOrder === 1;
    });

    if (!carbonBond) continue;

    const carbonIndex = getOtherAtom(carbonBond, oxygen.atomIndex);
    const carbonBonds = parsedMol.adjacency.get(carbonIndex) ?? [];

    const isCarboxylicAcidOxygen = carbonBonds.some((bond) => {
      const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
      return otherAtom?.element === "O" && bond.bondOrder === 2;
    });

    if (!isCarboxylicAcidOxygen) {
      alcoholCarbons.push(carbonIndex);
    }
  }

  return Array.from(new Set(alcoholCarbons));
}

function getBestNomenclatureCarbonPath(parsedMol: ParsedMol) {
  const carbonAtoms = parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex);

  const alcoholCarbons = new Set(getAlcoholBearingCarbons(parsedMol));

  let bestPath: number[] = [];
  let bestAlcoholScore = -1;

  const scorePath = (path: number[]) => {
    return path.filter((atomIndex) => alcoholCarbons.has(atomIndex)).length;
  };

  const isBetterPath = (path: number[]) => {
    const alcoholScore = scorePath(path);

    if (path.length > bestPath.length) return true;

    if (path.length === bestPath.length && alcoholScore > bestAlcoholScore) {
      return true;
    }

    return false;
  };

  const dfs = (current: number, visited: Set<number>, path: number[]) => {
    if (isBetterPath(path)) {
      bestPath = [...path];
      bestAlcoholScore = scorePath(path);
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

  return bestPath.length > 0 ? bestPath : getLongestCarbonPath(parsedMol);
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

function getLowestLocantList(values: number[]) {
  return [...values].sort((a, b) => a - b);
}

function compareLocantLists(a: number[], b: number[]) {
  const sortedA = getLowestLocantList(a);
  const sortedB = getLowestLocantList(b);

  const length = Math.max(sortedA.length, sortedB.length);

  for (let i = 0; i < length; i++) {
    const valueA = sortedA[i] ?? Number.POSITIVE_INFINITY;
    const valueB = sortedB[i] ?? Number.POSITIVE_INFINITY;

    if (valueA < valueB) return -1;
    if (valueA > valueB) return 1;
  }

  return 0;
}

function orientPathForLowestUnsaturationLocants(
  parsedMol: ParsedMol,
  path: number[]
) {
  const forward = getChainUnsaturation(parsedMol, path);
  const reversePath = [...path].reverse();
  const reverse = getChainUnsaturation(parsedMol, reversePath);

  const forwardLocants = [
    ...forward.doubleLocants,
    ...forward.tripleLocants,
  ];

  const reverseLocants = [
    ...reverse.doubleLocants,
    ...reverse.tripleLocants,
  ];

  return compareLocantLists(reverseLocants, forwardLocants) < 0
    ? reversePath
    : path;
}

function getParentStemWithUnsaturation(
  parsedMol: ParsedMol,
  parent: ParentDescriptor
) {
  const prefix = CHAIN_PREFIXES[parent.carbonCount];
  if (!prefix) return parent.parentStem;

  const { doubleLocants, tripleLocants } = getChainUnsaturation(
    parsedMol,
    parent.path
  );

  if (doubleLocants.length === 0 && tripleLocants.length === 0) {
    return `${prefix}an`;
  }

  const doubleMultiplier = getMultiplier(doubleLocants.length);
  const tripleMultiplier = getMultiplier(tripleLocants.length);

  if (doubleLocants.length > 0 && tripleLocants.length === 0) {
    if (doubleLocants.length === 1) {
      return `${prefix}-${doubleLocants[0]}-en`;
    }

    return `${prefix}a-${doubleLocants.join(",")}-${doubleMultiplier}en`;
  }

  if (tripleLocants.length > 0 && doubleLocants.length === 0) {
    if (tripleLocants.length === 1) {
      return `${prefix}-${tripleLocants[0]}-yn`;
    }

    return `${prefix}a-${tripleLocants.join(",")}-${tripleMultiplier}yn`;
  }

  return `${prefix}a-${doubleLocants.join(",")}-${doubleMultiplier}en-${tripleLocants.join(",")}-${tripleMultiplier}yn`;
}

function getUnsaturationSuffix(
  parsedMol: ParsedMol,
  path: number[]
) {
  const prefix = CHAIN_PREFIXES[path.length];
  if (!prefix) return null;

  const { doubleLocants, tripleLocants } = getChainUnsaturation(parsedMol, path);

  if (doubleLocants.length === 0 && tripleLocants.length === 0) {
    return `${prefix}ane`;
  }

  const doubleMultiplier = getMultiplier(doubleLocants.length);
  const tripleMultiplier = getMultiplier(tripleLocants.length);

  if (doubleLocants.length > 0 && tripleLocants.length === 0) {
    if (doubleLocants.length === 1) {
      return `${prefix}-${doubleLocants[0]}-ene`;
    }

    return `${prefix}a-${doubleLocants.join(",")}-${doubleMultiplier}ene`;
  }

  if (tripleLocants.length > 0 && doubleLocants.length === 0) {
    if (tripleLocants.length === 1) {
      return `${prefix}-${tripleLocants[0]}-yne`;
    }

    return `${prefix}a-${tripleLocants.join(",")}-${tripleMultiplier}yne`;
  }

  return `${prefix}a-${doubleLocants.join(",")}-${doubleMultiplier}en-${tripleLocants.join(",")}-${tripleMultiplier}yne`;
}

function getHydrocarbonBaseName(parsedMol: ParsedMol, path: number[]) {
  return getUnsaturationSuffix(parsedMol, path);
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

function getLongestAcyclicCarbonPath(
  parsedMol: ParsedMol,
  ringAtoms: number[]
) {
  const ringSet = new Set(ringAtoms);

  const carbonAtoms = parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex);

  let bestPath: number[] = [];

  const dfs = (
    current: number,
    visited: Set<number>,
    path: number[]
  ) => {
    if (path.length > bestPath.length) {
      bestPath = [...path];
    }

    for (const bond of parsedMol.adjacency.get(current) ?? []) {
      const next = getOtherAtom(bond, current);
      const nextAtom = parsedMol.atoms[next];

      if (!nextAtom || nextAtom.element !== "C") continue;
      if (visited.has(next)) continue;

      // Do not walk around the ring as if it were a straight chain.
      if (ringSet.has(current) && ringSet.has(next)) continue;

      visited.add(next);
      dfs(next, visited, [...path, next]);
      visited.delete(next);
    }
  };

  for (const atomIndex of carbonAtoms) {
    dfs(atomIndex, new Set([atomIndex]), [atomIndex]);
  }

  return bestPath;
}

function getSimpleCarbonRing(parsedMol: ParsedMol): RingDescriptor | null {
  const carbonAtoms = parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex);

  const carbonSet = new Set(carbonAtoms);

  const carbonNeighbors = (atomIndex: number) =>
    (parsedMol.adjacency.get(atomIndex) ?? [])
      .map((bond) => getOtherAtom(bond, atomIndex))
      .filter((other) => carbonSet.has(other));

  const findCycleFrom = (
    start: number,
    current: number,
    visited: number[]
  ): number[] | null => {
    for (const next of carbonNeighbors(current)) {
      if (next === start && visited.length >= 3) {
        return visited;
      }

      if (visited.includes(next)) continue;

      const result = findCycleFrom(start, next, [...visited, next]);

      if (result) return result;
    }

    return null;
  };

  let bestCycle: number[] | null = null;

  for (const atomIndex of carbonAtoms) {
    const cycle = findCycleFrom(atomIndex, atomIndex, [atomIndex]);

    if (!cycle) continue;

    if (!bestCycle || cycle.length > bestCycle.length) {
      bestCycle = cycle;
    }
  }

  if (!bestCycle || bestCycle.length < 3) return null;

  const ringSet = new Set(bestCycle);

  const ringBonds = parsedMol.bonds.filter(
    (bond) => ringSet.has(bond.atomA) && ringSet.has(bond.atomB)
  );

  return {
    ringAtoms: bestCycle,
    ringBonds,
  };
}

function orientRingPathForNaming(parsedMol: ParsedMol, ringAtoms: number[]) {
  const scoreAtom = (atomIndex: number) => {
    let score = 0;

    if (isKetoneCarbon(parsedMol, atomIndex)) score += 100;
    if (isAldehydeCarbon(parsedMol, atomIndex)) score += 90;

    for (const bond of parsedMol.adjacency.get(atomIndex) ?? []) {
      const other = getOtherAtom(bond, atomIndex);
      const otherAtom = parsedMol.atoms[other];

      if (otherAtom?.element === "O") score += 60;
      if (otherAtom?.element === "N") score += 50;
      if (otherAtom?.element === "S") score += 40;

      if (otherAtom?.element === "C" && !ringAtoms.includes(other)) {
        score += 20;
      }
    }

    return score;
  };

  const rotations = ringAtoms.flatMap((_, index) => {
    const rotated = [...ringAtoms.slice(index), ...ringAtoms.slice(0, index)];
    const reversed = [...rotated].reverse();
    return [rotated, reversed];
  });

  return rotations.sort((a, b) => {
    const aScores = a.map(scoreAtom);
    const bScores = b.map(scoreAtom);

    for (let i = 0; i < aScores.length; i++) {
      if (bScores[i] !== aScores[i]) return bScores[i] - aScores[i];
    }

    return 0;
  })[0];
}

function detectAromaticMotifs(parsedMol: ParsedMol) {
  const motifs = new Set<string>();

  const ring = getSimpleCarbonRing(parsedMol);
  if (!ring || !isBenzeneLikeRing(parsedMol, ring)) {
    return [];
  }

  motifs.add("aromatic benzene ring");

  const ringSet = new Set(ring.ringAtoms);

  const halogenNames: Record<string, string> = {
    F: "fluorobenzene motif",
    Cl: "chlorobenzene motif",
    Br: "bromobenzene motif",
    I: "iodobenzene motif",
  };

  const hasCarbonylOxygen = (carbonIndex: number) => {
    return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
      const other = getOtherAtom(bond, carbonIndex);
      return parsedMol.atoms[other]?.element === "O" && bond.bondOrder === 2;
    });
  };

  const hasSingleOxygenWithHydrogen = (carbonIndex: number) => {
    return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
      const other = getOtherAtom(bond, carbonIndex);
      const atom = parsedMol.atoms[other];

      return (
        atom?.element === "O" &&
        bond.bondOrder === 1 &&
        countImplicitHydrogens(atom, parsedMol.adjacency) > 0
      );
    });
  };

  const hasAttachedHalogen = (carbonIndex: number, halogen: string) => {
    return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
      const other = getOtherAtom(bond, carbonIndex);
      return parsedMol.atoms[other]?.element === halogen;
    });
  };

  for (const ringAtom of ring.ringAtoms) {
    for (const bond of parsedMol.adjacency.get(ringAtom) ?? []) {
      const attachedIndex = getOtherAtom(bond, ringAtom);
      if (ringSet.has(attachedIndex)) continue;

      const attachedAtom = parsedMol.atoms[attachedIndex];
      if (!attachedAtom) continue;

      if (attachedAtom.element === "O") {
        const oxygenBonds = parsedMol.adjacency.get(attachedIndex) ?? [];

        const hasCarbonSubstituent = oxygenBonds.some((oxygenBond) => {
          const other = getOtherAtom(oxygenBond, attachedIndex);
          return other !== ringAtom && parsedMol.atoms[other]?.element === "C";
        });

        motifs.add(hasCarbonSubstituent ? "anisole / alkoxybenzene motif" : "phenol motif");
      }

      if (attachedAtom.element === "N") {
        const nBonds = parsedMol.adjacency.get(attachedIndex) ?? [];

        const oxygenCount = nBonds.filter((nBond) => {
          const other = getOtherAtom(nBond, attachedIndex);
          return parsedMol.atoms[other]?.element === "O";
        }).length;

        motifs.add(oxygenCount >= 2 ? "nitrobenzene motif" : "aniline motif");
      }

      if (halogenNames[attachedAtom.element]) {
        motifs.add(halogenNames[attachedAtom.element]);
      }

      if (attachedAtom.element === "S") {
        motifs.add("thiophenol / benzenethiol motif");
      }

      if (attachedAtom.element === "C") {
        const carbonIndex = attachedIndex;

        if (hasCarbonylOxygen(carbonIndex)) {
          if (hasSingleOxygenWithHydrogen(carbonIndex)) {
            motifs.add("benzoic acid motif");
          } else {
            motifs.add("benzoyl motif");
          }
        }

        const implicitH = countImplicitHydrogens(
          attachedAtom,
          parsedMol.adjacency
        );

        if (hasCarbonylOxygen(carbonIndex) && implicitH >= 1) {
          motifs.add("benzaldehyde motif");
        }

        if (hasAttachedHalogen(carbonIndex, "Br")) {
          motifs.add("benzyl bromide motif");
        }

        if (hasAttachedHalogen(carbonIndex, "Cl")) {
          motifs.add("benzyl chloride motif");
        }

        const carbonNeighbors = (parsedMol.adjacency.get(carbonIndex) ?? [])
          .map((carbonBond) => getOtherAtom(carbonBond, carbonIndex))
          .filter((other) => parsedMol.atoms[other]?.element === "C");

        if (carbonNeighbors.length >= 2) {
          motifs.add("benzyl / alkylbenzene motif");
        }

        const hasDoubleCarbonBond = (parsedMol.adjacency.get(carbonIndex) ?? []).some(
          (carbonBond) => {
            const other = getOtherAtom(carbonBond, carbonIndex);
            return parsedMol.atoms[other]?.element === "C" && carbonBond.bondOrder === 2;
          }
        );

        if (hasDoubleCarbonBond) {
          motifs.add("styrene / vinylbenzene motif");
        }
      }
    }
  }

  return Array.from(motifs);
}

function getAromaticCommonName(
  parent: ParentDescriptor,
  substituents: Substituent[],
  primaryFeature: NamingFeature | null
) {
  if (!parent.aromaticRing) return null;
  if (primaryFeature) return null;

  if (substituents.length === 0) return "benzene";

  if (substituents.length === 1) {
    const sub = substituents[0];

    if (sub.name === "methyl") return "toluene";
    if (sub.name === "ethyl") return "ethylbenzene";
    if (sub.name === "methoxy") return "anisole";
    if (sub.name === "ethenyl" || sub.name === "vinyl") return "styrene";
    if (sub.name === "propan-2-yl") return "cumene";

    return `${sub.name}benzene`;
  }

  return null;
}

function isBenzeneLikeRing(
  parsedMol: ParsedMol,
  ring: RingDescriptor
) {
  if (ring.ringAtoms.length !== 6) {
    return false;
  }

  const ringSet = new Set(ring.ringAtoms);

  const ringBonds = parsedMol.bonds.filter(
    (bond) =>
      ringSet.has(bond.atomA) &&
      ringSet.has(bond.atomB)
  );

  const aromaticBondCount = ringBonds.filter(
    (bond) => bond.bondOrder === 1.5
  ).length;

  const doubleBondCount = ringBonds.filter(
    (bond) => bond.bondOrder === 2
  ).length;

  return (
    aromaticBondCount >= 6 ||
    doubleBondCount === 3
  );
}

function getParentDescriptor(parsedMol: ParsedMol): ParentDescriptor {
  const ring = getSimpleCarbonRing(parsedMol);

  if (ring) {
    const acyclicPath = getLongestAcyclicCarbonPath(parsedMol, ring.ringAtoms);
    const prefix = CHAIN_PREFIXES[ring.ringAtoms.length];
    const aromaticRing = isBenzeneLikeRing(parsedMol, ring);

    if (prefix && ring.ringAtoms.length >= acyclicPath.length) {
      return {
        kind: "ring",
        path: orientRingPathForNaming(parsedMol, ring.ringAtoms),
        carbonCount: ring.ringAtoms.length,
        parentHydrocarbon: aromaticRing ? "benzene" : `cyclo${prefix}ane`,
        parentStem: aromaticRing ? "benzen" : `cyclo${prefix}an`,
        aromaticRing,
      };
    }
  }

  const carbonPath = orientPathForLowestUnsaturationLocants(
    parsedMol,
    getBestNomenclatureCarbonPath(parsedMol)
  );

  const prefix = CHAIN_PREFIXES[carbonPath.length];

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

function getAlkylBaseName(carbonCount: number, attachmentLocant: number) {
  const prefix = CHAIN_PREFIXES[carbonCount];

  if (!prefix) return "alkyl";

  if (carbonCount === 1) return "methyl";
  if (carbonCount === 2) return "ethyl";

  if (attachmentLocant === 1) {
    if (carbonCount === 3) return "propyl";
    if (carbonCount === 4) return "butyl";
    return `${prefix}yl`;
  }

  return `${prefix}an-${attachmentLocant}-yl`;
}

function collectBranchCarbons(
  parsedMol: ParsedMol,
  startAtom: number,
  blockedAtom: number
) {
  const branchAtoms = new Set<number>();

  const dfs = (atomIndex: number) => {
    if (branchAtoms.has(atomIndex)) return;

    const atom = parsedMol.atoms[atomIndex];
    if (!atom || atom.element !== "C") return;

    branchAtoms.add(atomIndex);

    for (const bond of parsedMol.adjacency.get(atomIndex) ?? []) {
      const next = getOtherAtom(bond, atomIndex);

      if (next === blockedAtom) continue;

      const nextAtom = parsedMol.atoms[next];

      if (nextAtom?.element === "C") {
        dfs(next);
      }
    }
  };

  dfs(startAtom);

  return branchAtoms;
}

function getLongestBranchParentPath(
  parsedMol: ParsedMol,
  branchAtoms: Set<number>,
  attachmentAtom: number
) {
  let bestPath: number[] = [];

  const dfs = (
    current: number,
    visited: Set<number>,
    path: number[]
  ) => {
    if (path.includes(attachmentAtom)) {
      if (path.length > bestPath.length) {
        bestPath = [...path];
      }
    }

    for (const bond of parsedMol.adjacency.get(current) ?? []) {
      const next = getOtherAtom(bond, current);

      if (!branchAtoms.has(next)) continue;
      if (visited.has(next)) continue;

      visited.add(next);
      dfs(next, visited, [...path, next]);
      visited.delete(next);
    }
  };

  for (const atomIndex of branchAtoms) {
    dfs(atomIndex, new Set([atomIndex]), [atomIndex]);
  }

  return bestPath;
}

function orientBranchPathForAttachment(path: number[], attachmentAtom: number) {
  const forwardLocant = path.indexOf(attachmentAtom) + 1;
  const reverseLocant = [...path].reverse().indexOf(attachmentAtom) + 1;

  return reverseLocant < forwardLocant ? [...path].reverse() : path;
}

function getCarbonBranchInfo(
  parsedMol: ParsedMol,
  startAtom: number,
  blockedAtom: number
) {
  const branchAtoms = collectBranchCarbons(parsedMol, startAtom, blockedAtom);

  let branchPath = getLongestBranchParentPath(
    parsedMol,
    branchAtoms,
    startAtom
  );

  branchPath = orientBranchPathForAttachment(branchPath, startAtom);

  const branchPathSet = new Set(branchPath);
  const attachmentLocant = branchPath.indexOf(startAtom) + 1;

  const miniSubstituents: Substituent[] = [];

  branchPath.forEach((branchAtom, index) => {
    for (const bond of parsedMol.adjacency.get(branchAtom) ?? []) {
      const other = getOtherAtom(bond, branchAtom);

      if (!branchAtoms.has(other)) continue;
      if (branchPathSet.has(other)) continue;

      const otherAtom = parsedMol.atoms[other];
      if (otherAtom?.element !== "C") continue;

      const miniBranchAtoms = collectBranchCarbons(
        parsedMol,
        other,
        branchAtom
      );

      miniSubstituents.push({
        name: getAlkylBaseName(miniBranchAtoms.size, 1),
        locant: index + 1,
      });
    }
  });

  const baseName = getAlkylBaseName(branchPath.length, attachmentLocant);
  const prefixString = formatSubstituents(miniSubstituents);

  const hasHalogenOnBranch = Array.from(branchAtoms).some((branchAtom) => {
    return (parsedMol.adjacency.get(branchAtom) ?? []).some((bond) => {
      const other = getOtherAtom(bond, branchAtom);
      const element = parsedMol.atoms[other]?.element;
      return ["F", "Cl", "Br", "I"].includes(element ?? "");
    });
  });

  if (branchAtoms.size === 1 && hasHalogenOnBranch) {
    const branchAtom = Array.from(branchAtoms)[0];

    const halogenBond = (parsedMol.adjacency.get(branchAtom) ?? []).find((bond) => {
      const other = getOtherAtom(bond, branchAtom);
      const element = parsedMol.atoms[other]?.element;
      return ["F", "Cl", "Br", "I"].includes(element ?? "");
    });

    const halogenElement = halogenBond
      ? parsedMol.atoms[getOtherAtom(halogenBond, branchAtom)]?.element
      : null;

    const halogenPrefix =
      halogenElement === "Br"
        ? "bromo"
        : halogenElement === "Cl"
        ? "chloro"
        : halogenElement === "F"
        ? "fluoro"
        : halogenElement === "I"
        ? "iodo"
        : "";

    return {
      carbonCount: branchAtoms.size,
      name: `${halogenPrefix}methyl`,
    };
  }

  return {
    carbonCount: branchAtoms.size,
    name: prefixString ? `${prefixString}${baseName}` : baseName,
  };
}

function omitUnnecessaryRingLocant(
  name: string,
  parent: ParentDescriptor,
  substituentCount: number
) {
  if (parent.kind === "ring" && substituentCount === 1) {
    return name.replace(/^1-/, "");
  }

  return name;
}

function detectSubstituents(
  parsedMol: ParsedMol,
  parent: ParentDescriptor
): Substituent[] {
  const parentSet = new Set(parent.path);
  const locants = getLocantMap(parent);
  const substituents: Substituent[] = [];

  for (const parentAtom of parent.path) {
    for (const bond of parsedMol.adjacency.get(parentAtom) ?? []) {
      const other = getOtherAtom(bond, parentAtom);
      if (parentSet.has(other)) continue;

      const atom = parsedMol.atoms[other];
      if (!atom) continue;

      const locant = locants.get(parentAtom) ?? 0;

      if (atom.element === "C") {
        const branch = getCarbonBranchInfo(parsedMol, other, parentAtom);

        substituents.push({
          name: branch.name,
          locant: locants.get(parentAtom) ?? 0,
        });
      }

      if (atom.element === "N") {
        const nBonds = parsedMol.adjacency.get(other) ?? [];

        const oxygenCount = nBonds.filter((bond) => {
          const attached = getOtherAtom(bond, other);
          return parsedMol.atoms[attached]?.element === "O";
        }).length;

        if (oxygenCount >= 2) {
          substituents.push({
            name: "nitro",
            locant,
          });

          continue;
        }
      }

      if (atom.element === "O") {
        const oxygenBonds = parsedMol.adjacency.get(other) ?? [];

        const alkylBond = oxygenBonds.find((oxygenBond) => {
          const attached = getOtherAtom(oxygenBond, other);

          if (attached === parentAtom) return false;

          return parsedMol.atoms[attached]?.element === "C";
        });

        if (alkylBond) {
          const alkylCarbon = getOtherAtom(alkylBond, other);

          const alkylInfo = getAlkylSubtreeInfo(
            parsedMol,
            alkylCarbon,
            other
          );

          const alkoxyName =
            alkylInfo.carbonCount === 1
              ? "methoxy"
              : alkylInfo.carbonCount === 2
              ? "ethoxy"
              : alkylInfo.carbonCount === 3
              ? "propoxy"
              : "alkoxy";

          substituents.push({
            name: alkoxyName,
            locant,
          });
        }
      }

      const halogenPrefixes: Record<string, string> = {
        F: "fluoro",
        Cl: "chloro",
        Br: "bromo",
        I: "iodo",
      };

      const halogenName = halogenPrefixes[atom.element];

      if (halogenName) {
        substituents.push({
          name: halogenName,
          locant,
        });
      }
    }
  }

  return substituents;
}

function formatSubstituents(substituents: Substituent[]) {
  const groups = new Map<string, number[]>();

  for (const sub of substituents) {
    if (!sub.locant) continue;

    const existing = groups.get(sub.name) ?? [];
    existing.push(sub.locant);
    groups.set(sub.name, existing);
  }

  return Array.from(groups.entries())
    .map(([name, locants]) => {
      locants.sort((a, b) => a - b);

      const multiplier = getMultiplier(locants.length);

      return `${locants.join(",")}-${multiplier}${name}`;
    })
    .sort((a, b) => {
      const cleanA = a.replace(/^\d+(,\d+)*-/, "").replace(/^(di|tri|tetra|penta|hexa)/, "");
      const cleanB = b.replace(/^\d+(,\d+)*-/, "").replace(/^(di|tri|tetra|penta|hexa)/, "");
      return cleanA.localeCompare(cleanB);
    })
    .join("-");
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

      const singleBondedOxygen = bonds.find((bond) => {
      const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbon.atomIndex)];
      return otherAtom?.element === "O" && bond.bondOrder === 1;
    });

    if (!singleBondedOxygen) return false;

    const oxygenIndex = getOtherAtom(
      singleBondedOxygen,
      carbon.atomIndex
    );

    const oxygenHasHydrogen =
      countImplicitHydrogens(
        parsedMol.atoms[oxygenIndex],
        parsedMol.adjacency
      ) > 0;

      return hasCarbonylOxygen && oxygenHasHydrogen;;
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

  return locants.sort((a, b) => a - b);
}

function getAmineLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
  const locantMap = getLocantMap(parent);
  const locants: number[] = [];

  for (const nitrogen of parsedMol.atoms.filter(
    (atom) => atom.element === "N")) {
    const bonds = parsedMol.adjacency.get(nitrogen.atomIndex) ?? [];

      const hasMultipleBond = bonds.some(
        bond => bond.bondOrder > 1
      );

      if (hasMultipleBond) continue;

      const attachedToCarbonyl = bonds.some((bond) => {
      const carbonIndex = getOtherAtom(bond, nitrogen.atomIndex);
      const carbon = parsedMol.atoms[carbonIndex];

      if (carbon?.element !== "C") return false;

      return (parsedMol.adjacency.get(carbonIndex) ?? []).some((b) => {
        const other = parsedMol.atoms[getOtherAtom(b, carbonIndex)];
        return other?.element === "O" && b.bondOrder === 2;
      });
    });

    if (attachedToCarbonyl) continue;

    for (const bond of bonds) {
      const carbonIndex = getOtherAtom(bond, nitrogen.atomIndex);
      const carbon = parsedMol.atoms[carbonIndex];

      if (carbon?.element !== "C") continue;

      const locant = locantMap.get(carbonIndex);
      if (locant) locants.push(locant);
    }
  }

  return locants.sort((a, b) => a - b);
}

function getThiolLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
  const locantMap = getLocantMap(parent);
  const locants: number[] = [];

  for (const sulfur of parsedMol.atoms.filter((atom) => atom.element === "S")) {
    const bonds = parsedMol.adjacency.get(sulfur.atomIndex) ?? [];

    for (const bond of bonds) {
      const carbonIndex = getOtherAtom(bond, sulfur.atomIndex);
      const carbon = parsedMol.atoms[carbonIndex];

      if (carbon?.element !== "C") continue;

      const locant = locantMap.get(carbonIndex);
      if (locant) locants.push(locant);
    }
  }

  return locants.sort((a, b) => a - b);
}

function getNitrileLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
  const locantMap = getLocantMap(parent);
  const locants: number[] = [];

  for (const bond of parsedMol.bonds) {
    if (bond.bondOrder !== 3) continue;

    const atomA = parsedMol.atoms[bond.atomA];
    const atomB = parsedMol.atoms[bond.atomB];

    const carbonIndex =
      atomA?.element === "C" && atomB?.element === "N"
        ? bond.atomA
        : atomB?.element === "C" && atomA?.element === "N"
        ? bond.atomB
        : null;

    if (carbonIndex === null) continue;

    const locant = locantMap.get(carbonIndex);
    if (locant) locants.push(locant);
  }

  return locants.sort((a, b) => a - b);
}

function getAmideLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
  const locantMap = getLocantMap(parent);
  const locants: number[] = [];

  for (const carbon of parsedMol.atoms.filter((atom) => atom.element === "C")) {
    const bonds = parsedMol.adjacency.get(carbon.atomIndex) ?? [];

    const hasCarbonylOxygen = bonds.some((bond) => {
      const other = parsedMol.atoms[getOtherAtom(bond, carbon.atomIndex)];
      return other?.element === "O" && bond.bondOrder === 2;
    });

    const hasSingleNitrogen = bonds.some((bond) => {
      const other = parsedMol.atoms[getOtherAtom(bond, carbon.atomIndex)];
      return other?.element === "N" && bond.bondOrder === 1;
    });

    if (!hasCarbonylOxygen || !hasSingleNitrogen) continue;

    const locant = locantMap.get(carbon.atomIndex);
    if (locant) locants.push(locant);
  }

  return locants.sort((a, b) => a - b);
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

function getAlkylSubtreeInfo(
  parsedMol: ParsedMol,
  startAtom: number,
  blockedAtom: number
) {
  const visited = new Set<number>();
  const path: number[] = [];

  const dfs = (atomIndex: number) => {
    if (visited.has(atomIndex)) return;
    visited.add(atomIndex);

    const atom = parsedMol.atoms[atomIndex];
    if (!atom || atom.element !== "C") return;

    path.push(atomIndex);

    for (const bond of parsedMol.adjacency.get(atomIndex) ?? []) {
      const next = getOtherAtom(bond, atomIndex);

      if (next === blockedAtom) continue;

      const nextAtom = parsedMol.atoms[next];

      if (nextAtom?.element === "C") {
        dfs(next);
      }
    }
  };

  dfs(startAtom);

  const doubleLocants: number[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const bond = parsedMol.bonds.find(
      (candidate) =>
        (candidate.atomA === path[i] && candidate.atomB === path[i + 1]) ||
        (candidate.atomB === path[i] && candidate.atomA === path[i + 1])
    );

    if (bond?.bondOrder === 2) {
      doubleLocants.push(i + 1);
    }
  }

  return {
    carbonCount: path.length,
    doubleLocants,
  };
}

function getSimpleAlkylName(
  carbonCount: number,
  doubleLocants: number[] = []
) {
  const prefix = CHAIN_PREFIXES[carbonCount];

  if (!prefix) return "alkyl";

  if (doubleLocants.length === 1) {
    const locant = doubleLocants[0];

    if (carbonCount <= 3) {
      return `${prefix}-${locant}-enyl`;
    }

    return `${prefix}-${locant}-enyl`;
  }

  if (carbonCount === 1) return "methyl";
  if (carbonCount === 2) return "ethyl";
  if (carbonCount === 3) return "propyl";
  if (carbonCount === 4) return "butyl";

  return `${prefix}yl`;
}

function getEsterGroups(parsedMol: ParsedMol, parent?: ParentDescriptor) {
  const esters: {
    carbonIndex: number;
    alkylName: string;
    alkoxyName: string;
    attachmentLocant: number;
  }[] = [];

  const locantMap = parent ? getLocantMap(parent) : new Map<number, number>();

  for (const carbon of parsedMol.atoms.filter((atom) => atom.element === "C")) {
    const bonds = parsedMol.adjacency.get(carbon.atomIndex) ?? [];

    const hasCarbonylOxygen = bonds.some((bond) => {
      const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbon.atomIndex)];
      return otherAtom?.element === "O" && bond.bondOrder === 2;
    });

    if (!hasCarbonylOxygen) continue;

    const singleOxygenBond = bonds.find((bond) => {
      const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbon.atomIndex)];
      return otherAtom?.element === "O" && bond.bondOrder === 1;
    });

    if (!singleOxygenBond) continue;

    const oxygenIndex = getOtherAtom(singleOxygenBond, carbon.atomIndex);
    const oxygenAtom = parsedMol.atoms[oxygenIndex];

    if (!oxygenAtom) continue;

    const oxygenHasHydrogen =
      countImplicitHydrogens(oxygenAtom, parsedMol.adjacency) > 0;

    if (oxygenHasHydrogen) continue;

    const alkylCarbonBond = (parsedMol.adjacency.get(oxygenIndex) ?? []).find(
      (bond) => {
        const other = getOtherAtom(bond, oxygenIndex);
        if (other === carbon.atomIndex) return false;
        return parsedMol.atoms[other]?.element === "C";
      }
    );

    if (!alkylCarbonBond) continue;

    const alkylCarbonIndex = getOtherAtom(alkylCarbonBond, oxygenIndex);

    const alkylInfo = getAlkylSubtreeInfo(
      parsedMol,
      alkylCarbonIndex,
      oxygenIndex
    );

    const attachmentCarbonBond = bonds.find((bond) => {
      const other = getOtherAtom(bond, carbon.atomIndex);
      return parsedMol.atoms[other]?.element === "C";
    });

    const attachmentCarbonIndex = attachmentCarbonBond
      ? getOtherAtom(attachmentCarbonBond, carbon.atomIndex)
      : carbon.atomIndex;

    esters.push({
      carbonIndex: carbon.atomIndex,
      alkylName: getSimpleAlkylName(
        alkylInfo.carbonCount,
        alkylInfo.doubleLocants
      ),
      alkoxyName:
        alkylInfo.carbonCount === 1
          ? "methoxy"
          : alkylInfo.carbonCount === 2
          ? "ethoxy"
          : alkylInfo.carbonCount === 3
          ? "propoxy"
          : "alkoxy",
      attachmentLocant: locantMap.get(attachmentCarbonIndex) ?? 1,
    });
  }

  return esters;
}



function detectNamingFeatures(parsedMol: ParsedMol, parent: ParentDescriptor): NamingFeature[] {
  const esterGroups = getEsterGroups(parsedMol, parent);

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
    const amideLocants = getAmideLocants(parsedMol, parent);
    const nitrileLocants = getNitrileLocants(parsedMol, parent);
    const amineLocants = getAmineLocants(parsedMol, parent);
    const thiolLocants = getThiolLocants(parsedMol, parent);

  const features: NamingFeature[] = [];

    if (acidLocants.length > 0) {
      features.push({
        type: "carboxylicAcid",
        locants: acidLocants,
        suffix: "oic acid",
        prefix: "carboxy",
        priority: 1,
      });

      for (const ester of esterGroups) {
        features.push({
          type: "ester",
          locants: [ester.attachmentLocant],
          suffix: "oate",
          prefix: `${ester.alkoxyName}carbonyl`,
          priority: 5,
          alkylName: ester.alkylName,
        });
      }
    } else {
      for (const ester of esterGroups) {
        const esterLocants = getFeatureLocantsFromCarbonIndexes(parent, [
          ester.carbonIndex,
        ]);

        features.push({
          type: "ester",
          locants: esterLocants,
          suffix: "oate",
          prefix: "alkoxycarbonyl",
          priority: 1,
          alkylName: ester.alkylName,
        });
      }
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

  if (amideLocants.length > 0) {
  features.push({
    type: "amide",
    locants: amideLocants,
    suffix: "amide",
    prefix: "carbamoyl",
    priority: 1.5,
  });
}

if (nitrileLocants.length > 0) {
  features.push({
    type: "nitrile",
    locants: nitrileLocants,
    suffix: "nitrile",
    prefix: "cyano",
    priority: 1.7,
  });
}

if (amineLocants.length > 0) {
  features.push({
    type: "amine",
    locants: amineLocants,
    suffix: "amine",
    prefix: "amino",
    priority: 6,
  });
}

if (thiolLocants.length > 0) {
  features.push({
    type: "thiol",
    locants: thiolLocants,
    suffix: "thiol",
    prefix: "sulfanyl",
    priority: 7,
  });
}

  

  return features.sort((a, b) => a.priority - b.priority);
}

function getMultiplier(count: number) {
  if (count === 2) return "di";
  if (count === 3) return "tri";
  if (count === 4) return "tetra";
  if (count === 5) return "penta";
  if (count === 6) return "hexa";
  return "";
}

function formatLocants(locants: number[]) {
  return locants.join(",");
}

function formatPrefix(feature: NamingFeature) {
  if (feature.locants.length === 0) return feature.prefix;

  const multiplier = getMultiplier(feature.locants.length);
  return `${formatLocants(feature.locants)}-${multiplier}${feature.prefix}`;
}

function buildPrefixString(
  features: NamingFeature[],
  primaryFeature: NamingFeature | null
) {
  return features
    .filter((feature) => feature !== primaryFeature)
    .map(formatPrefix)
    .sort()
    .join("-");
}

function shouldOmitSingleLocant(parent: ParentDescriptor, feature: NamingFeature) {
  return (
    feature.locants.length === 1 &&
    ((feature.type === "alcohol" && parent.carbonCount <= 2) ||
      (feature.type === "ketone" && parent.carbonCount <= 3))
  );
}

function hasComplexSubstituent(substituents: Substituent[]) {
  return substituents.some((sub) =>
    sub.name.includes("-") ||
    sub.name.includes(",") ||
    sub.name.includes("yl") && sub.name.length > 6
  );
}

function buildPrimarySuffixName(
  parentStem: string,
  parent: ParentDescriptor,
  feature: NamingFeature
) {
  const locants = feature.locants;
  const count = locants.length;
  const multiplier = getMultiplier(count);

  if (feature.type === "ester") {
    return `${feature.alkylName ?? "alkyl"} ${parentStem}oate`;
  }

  if (feature.type === "carboxylicAcid") {
    return count > 1 ? `${parentStem}edioic acid` : `${parentStem}oic acid`;
  }

  if (feature.type === "aldehyde") {
    return count > 1 ? `${parentStem}${multiplier}al` : `${parentStem}al`;
  }

  if (feature.type === "amine") {
  if (count > 1) {
    return `${parentStem}-${locants.join(",")}-${multiplier}amine`;
  }
      if (parent.carbonCount <= 2) {
        return `${parentStem}amine`;
      }

      return `${parentStem}-${locants[0]}-amine`;
      }
      
  if (feature.type === "nitrile") {
  const alkaneName = parent.parentHydrocarbon ?? parentStem;

    if (count > 1) {
      return `${alkaneName}dinitrile`;
    }

    return `${alkaneName}nitrile`;
  }

  if (count > 1) {
    return `${parentStem}-${locants.join(",")}-${multiplier}${feature.suffix}`;
  }

  if (shouldOmitSingleLocant(parent, feature)) {
    return `${parentStem}${feature.suffix}`;
  }

  return `${parentStem}-${locants[0]}-${feature.suffix}`;
}


function buildSuffixName(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  primaryFeature: NamingFeature | null
  ) {
    if (!parent.parentStem || !parent.parentHydrocarbon) return null;
    if (!primaryFeature) return parent.parentHydrocarbon;

    const parentStem = getParentStemWithUnsaturation(parsedMol, parent);
    if (!parentStem) return null;

    if (parent.kind === "ring") {
    
      if (parent.aromaticRing) {
        if (!primaryFeature) return "benzene";

        if (primaryFeature.type === "alcohol") return "phenol";
        if (primaryFeature.type === "amine") return "aniline";
        if (primaryFeature.type === "carboxylicAcid") return "benzoic acid";
        if (primaryFeature.type === "aldehyde") return "benzaldehyde";
        if (primaryFeature.type === "thiol") return "benzenethiol";
        if (primaryFeature.type === "nitrile") return "benzonitrile";
        if (primaryFeature.type === "amide") return "benzamide";

        return parent.parentHydrocarbon;
      }
      
    if (primaryFeature.type === "ketone") {
      return `${parent.parentStem}one`;
    }

    if (primaryFeature.type === "alcohol") {
      return `${parent.parentStem}ol`;
    }

    if (primaryFeature.type === "amine") {
      return `${parent.parentStem}amine`;
    }

    if (primaryFeature.type === "thiol") {
      return `${parent.parentStem}ethiol`;
    }

    return `${parent.parentHydrocarbon} with ${primaryFeature.suffix}`;
  }

  return buildPrimarySuffixName(parentStem, parent, primaryFeature);
}

function buildEstimatedIupacName(parsedMol: ParsedMol) {
  const parent = getParentDescriptor(parsedMol);
  const features = detectNamingFeatures(parsedMol, parent);
  const primaryFeature = features[0] ?? null;
  const suffixName = buildSuffixName(parsedMol, parent, primaryFeature);
  const aromaticAcidCarbonCount =
  parent.aromaticRing ? getCarboxylicAcidCarbons(parsedMol).length : 0;

if (parent.aromaticRing && aromaticAcidCarbonCount > 0) {
  return {
    estimatedName: "benzoic acid",
    parent,
    features: [
      {
        type: "carboxylicAcid",
        locants: [1],
        suffix: "oic acid",
        prefix: "carboxy",
        priority: 1,
      },
      ...features,
    ],
    primaryFeature: {
      type: "carboxylicAcid",
      locants: [1],
      suffix: "oic acid",
      prefix: "carboxy",
      priority: 1,
    },
    substituents: [],
  };
}

  if (!suffixName) {
    return null;
  }

  const prefixString = buildPrefixString(features, primaryFeature);
  const substituents =
    detectSubstituents(parsedMol, parent);

  let branchString = formatSubstituents(substituents);

  branchString = omitUnnecessaryRingLocant(
    branchString,
    parent,
    substituents.length
  );


  const aromaticCommonName = getAromaticCommonName(
  parent,
  substituents,
  primaryFeature
    );

  const estimatedName =
  aromaticCommonName ??
  [
    branchString,
    prefixString,
    suffixName,
  ]
    .filter(Boolean)
    .join("");




    console.log(
  "Alcohol locants:",
  getAlcoholLocants(parsedMol, parent)
);

  return {
    estimatedName,
    parent,
    features,
    primaryFeature,
    substituents,
  };
}

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

  const { estimatedName, parent, features, primaryFeature, substituents } = namingResult;
  const commonName = getCommonName(estimatedName);
  const displayName = formatDisplayName(estimatedName, commonName);
  const motifs = detectAromaticMotifs(parsedMol);
  const lowerPriorityFeatures = features.filter((feature) => feature !== primaryFeature);

  if (parent.kind === "ring" && !parent.aromaticRing) {
  limitations.push(
    "Simple alicyclic ring naming is supported, but complex fused rings and advanced ring tie-breaking are still limited."
  );
}

  if (hasComplexSubstituent(substituents)) {
  limitations.push(
    "Complex substituent naming is still under development. PocketChem may estimate branched or substituted side chains, but full IUPAC substituent naming is not finalized yet."
  );
}

  if (parent.aromaticRing) {
    limitations.push(
      "Basic benzene derivative naming is supported, including benzene, toluene, phenol, aniline, anisole, and benzoic acid. Advanced substituted aromatic locants are still limited."
    );
  }

  if (lowerPriorityFeatures.length > 0) {
    limitations.push(
      "Lower-priority functional groups are treated as prefixes, such as oxo, hydroxy, amino, or cyano."
    );
  }

const namingConfidence: NomenclatureResult["namingConfidence"] =
  parent.aromaticRing && lowerPriorityFeatures.length === 0
    ? "High"
    : parent.kind === "ring" && lowerPriorityFeatures.length > 0
      ? "Medium"
      : lowerPriorityFeatures.length > 1
        ? "Low"
        : "Medium";

const explanationLines: string[] = [];

explanationLines.push(
  parent.aromaticRing
    ? "Detected benzene-like aromatic ring as the parent structure."
    : parent.kind === "ring"
      ? `Detected ${parent.parentHydrocarbon} as the parent ring.`
      : `Parent chain contains ${parent.carbonCount} carbons.`
);

if (primaryFeature) {
  explanationLines.push(
    `${primaryFeature.type} chosen as highest-priority functional group.`
  );
}

if (substituents.length > 0) {
  explanationLines.push(
    `Detected ${substituents.length} substituent(s).`
  );
}

  return {
    estimatedName,
    commonName,
    displayName,
    namingConfidence,
    parentChain: parent.parentHydrocarbon,
    parentChainLength: parent.carbonCount,
    mainSuffix: primaryFeature ? `-${primaryFeature.suffix}` : null,
    prefixes,
    motifs,
    explanation: explanationLines.join(" "),
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

