import type { FunctionalGroupResult } from "../functionalGroups/types";

import type {
  DescriptorMap,
  MoleculePropertyResult,
  ParsedAtom,
  ParsedBond,
  ParsedMol,
  PropertyTendencyLevel,
  PropertyTendencyResult,
} from "./types";

import { COMMON_VALENCES, ELEMENT_ORDER } from "./constants";
import { getOtherAtom } from "./molParser";
import { getLongestCarbonPath } from "./graph/parentSelection";

function getExpectedValence(atom: ParsedAtom) {
  if (atom.element === "N" && atom.charge > 0) return 4;
  if (atom.element === "O" && atom.charge < 0) return 1;
  if (atom.element === "C" && atom.charge < 0) return 3;

  return COMMON_VALENCES[atom.element] ?? 0;
}

function countImplicitHydrogens(
  atom: ParsedAtom,
  adjacency: Map<number, ParsedBond[]>
) {
  if (atom.element === "H") return 0;

  const expectedValence = getExpectedValence(atom);
  if (expectedValence === 0) return 0;

  const bondOrderSum = (adjacency.get(atom.atomIndex) ?? []).reduce(
    (sum, bond) => sum + bond.bondOrder,
    0
  );

  return Math.max(0, Math.round(expectedValence - bondOrderSum));
}

export function buildFormula(atomCounts: Map<string, number>) {
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

export function calculateAtomCounts(parsedMol: ParsedMol) {
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

export function calculateDBE(atomCounts: Map<string, number>) {
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

export function safeParseDescriptors(rawDescriptors: unknown): DescriptorMap {
  if (!rawDescriptors) return {};

  if (typeof rawDescriptors === "string") {
    try {
      const parsed = JSON.parse(rawDescriptors);
      return parsed && typeof parsed === "object"
        ? (parsed as DescriptorMap)
        : {};
    } catch {
      return {};
    }
  }

  if (typeof rawDescriptors === "object") {
    return rawDescriptors as DescriptorMap;
  }

  return {};
}

export function getNumberDescriptor(
  descriptors: DescriptorMap,
  keys: string[]
) {
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

export function formatDescriptor(value: number | null, decimals = 2) {
  return value === null ? null : value.toFixed(decimals);
}

export function scoreToTendencyLevel(score: number): PropertyTendencyLevel {
  if (score <= 1) return "Very low";
  if (score <= 3) return "Low";
  if (score <= 5) return "Medium";
  if (score <= 8) return "High";
  return "Very high";
}

export function estimateBoilingPointTendency(
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
    factors.push(
      "Amines can hydrogen bond, but usually less strongly than alcohols."
    );
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

  const carbonCount = parsedMol.atoms.filter((atom) => atom.element === "C")
    .length;
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

export function estimateWaterSolubilityTendency(
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
      factors.push(
        "Negative logP means the molecule strongly prefers water over oil."
      );
    } else if (logP <= 1) {
      score += 2;
      factors.push("Low logP means the molecule is fairly water-loving.");
    } else if (logP <= 3) {
      score += 1;
      factors.push(
        "Moderate logP gives a balance between water and lipid solubility."
      );
    } else if (logP <= 5) {
      score -= 2;
      factors.push(
        "High logP lowers water solubility because the molecule prefers lipid-like environments."
      );
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
    score += 3;
    factors.push("Carboxylic acids are polar and can hydrogen bond with water.");
  }

  if (groupNames.includes("Alcohol")) {
    score += 2;
    factors.push("Alcohol groups increase water solubility.");
  }

  if (groupNames.includes("Amine")) {
    score += 2;
    factors.push("Amines can interact with water and may be protonated.");
  }

  if (molecularWeight !== null && molecularWeight > 250) {
    score -= 2;
    factors.push("Large molecular size usually lowers water solubility.");
  }

  return {
    level: scoreToTendencyLevel(score),
    score: Number(score.toFixed(1)),
    factors,
    explanation:
      "This is a qualitative water-solubility tendency based on polarity, charge, hydrogen bonding, TPSA, logP, and molecular size.",
  };
}

export function estimateMembranePermeabilityTendency(
  molecularWeight: number | null,
  formalCharge: number,
  hydrogenBondDonors: number | null,
  tpsa: number | null,
  logP: number | null
): PropertyTendencyResult {
  let score = 5;
  const factors: string[] = [];

  if (formalCharge !== 0) {
    score -= 4;
    factors.push("Formal charge strongly lowers passive membrane permeability.");
  }

  if (molecularWeight !== null) {
    if (molecularWeight < 300) {
      score += 1;
      factors.push("Smaller molecules tend to cross membranes more easily.");
    } else if (molecularWeight > 500) {
      score -= 3;
      factors.push("Large molecular weight lowers membrane permeability.");
    }
  }

  if (tpsa !== null) {
    if (tpsa < 60) {
      score += 2;
      factors.push("Low TPSA favors membrane permeability.");
    } else if (tpsa <= 120) {
      factors.push("Moderate TPSA gives moderate permeability.");
    } else {
      score -= 3;
      factors.push("High TPSA lowers membrane permeability.");
    }
  }

  if (logP !== null) {
    if (logP < 0) {
      score -= 2;
      factors.push("Very water-loving molecules cross lipid membranes poorly.");
    } else if (logP <= 3) {
      score += 2;
      factors.push("Moderate logP supports membrane permeability.");
    } else if (logP <= 5) {
      score += 1;
      factors.push("Higher logP supports lipid partitioning.");
    } else {
      score -= 2;
      factors.push("Very high logP can reduce useful permeability.");
    }
  }

  if (hydrogenBondDonors !== null && hydrogenBondDonors > 2) {
    score -= 2;
    factors.push("Many hydrogen-bond donors reduce membrane permeability.");
  }

  score = Math.max(0, score);

  return {
    level: scoreToTendencyLevel(score),
    score: Number(score.toFixed(1)),
    factors,
    explanation:
      "This estimates passive membrane permeability using size, charge, TPSA, logP, and hydrogen-bond donors.",
  };
}

export function estimateVolatilityTendency(
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

  score = Math.max(0, score);

  return {
    level: scoreToTendencyLevel(score),
    score: Number(score.toFixed(1)),
    factors,
    explanation:
      "This estimates how easily a molecule evaporates. Higher volatility usually means lower boiling point, smaller size, and weaker intermolecular forces.",
  };
}

export function countCarboxylicAcidGroups(parsedMol: ParsedMol) {
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

export function buildProperties(
  parsedMol: ParsedMol,
  descriptors: DescriptorMap,
  functionalGroups: FunctionalGroupResult[]
): MoleculePropertyResult {
  const counts = calculateAtomCounts(parsedMol);
  const formula = buildFormula(counts);
  const dbe = calculateDBE(counts);
  const formalCharge = parsedMol.atoms.reduce(
    (sum, atom) => sum + atom.charge,
    0
  );
  const heavyAtomCount = parsedMol.atoms.filter((atom) => atom.element !== "H")
    .length;

  const exactMass = getNumberDescriptor(descriptors, [
    "exactmw",
    "ExactMolWt",
    "exactMolWt",
  ]);

  const molecularWeight = getNumberDescriptor(descriptors, [
    "amw",
    "MolWt",
    "molwt",
  ]);

  let hbd = getNumberDescriptor(descriptors, [
    "lipinskiHBD",
    "NumHDonors",
    "hbd",
  ]);

  let hba = getNumberDescriptor(descriptors, [
    "lipinskiHBA",
    "NumHAcceptors",
    "hba",
  ]);

  const carboxylicAcidCount = countCarboxylicAcidGroups(parsedMol);

  if (carboxylicAcidCount > 0 && hba !== null) {
    hba = Math.max(0, hba - carboxylicAcidCount);
  }

  const rotatableBonds = getNumberDescriptor(descriptors, [
    "NumRotatableBonds",
    "numRotatableBonds",
  ]);

  const tpsa = getNumberDescriptor(descriptors, ["tpsa", "TPSA"]);
  const logP = getNumberDescriptor(descriptors, [
    "CrippenClogP",
    "MolLogP",
    "logp",
  ]);
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