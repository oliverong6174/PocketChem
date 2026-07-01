import { getRDKit } from "./rdkit";

export type ChiralityConfiguration = "R" | "S" | "unknown";

export type ChiralityAssignmentSource =
  | "rdkit"
  | "pocketchem-fallback"
  | "unassigned";

export type ChiralityResult = {
  atomIndex: number;
  element: string;
  configuration: ChiralityConfiguration;
  assignmentSource: ChiralityAssignmentSource;
  label: string;
  explanation: string;
  whyChiralExplanation: string;
  configurationExplanation: string;
};

type ParsedAtom = {
  atomIndex: number;
  element: string;
  x: number;
  y: number;
};

type ParsedBond = {
  bondIndex: number;
  atomA: number;
  atomB: number;
  bondOrder: number;
  stereoCode: number;
};

type ParsedMolBlock = {
  atoms: ParsedAtom[];
  bonds: ParsedBond[];
};

function parseMolBlock(molblock: string): ParsedMolBlock {
  const lines = molblock.split(/\r?\n/);
  const countsLine = lines[3];

  if (!countsLine) {
    return { atoms: [], bonds: [] };
  }

  const atomCount = Number.parseInt(countsLine.slice(0, 3).trim(), 10);
  const bondCount = Number.parseInt(countsLine.slice(3, 6).trim(), 10);

  if (!Number.isFinite(atomCount) || !Number.isFinite(bondCount)) {
    return { atoms: [], bonds: [] };
  }

  const atomLines = lines.slice(4, 4 + atomCount);
  const bondLines = lines.slice(4 + atomCount, 4 + atomCount + bondCount);

  const atoms: ParsedAtom[] = atomLines.map((line, index) => {
    const parts = line.trim().split(/\s+/);

    return {
      atomIndex: index,
      x: Number.parseFloat(parts[0] ?? "0"),
      y: Number.parseFloat(parts[1] ?? "0"),
      element: parts[3] ?? "unknown",
    };
  });



  const bonds: ParsedBond[] = bondLines
    .map((line, index) => {
      const parts = line.trim().split(/\s+/);

      const atomA = Number.parseInt(parts[0], 10) - 1;
      const atomB = Number.parseInt(parts[1], 10) - 1;
      const bondOrder = Number.parseInt(parts[2], 10);
      const stereoCode = Number.parseInt(parts[3] ?? "0", 10);

      if (
        !Number.isFinite(atomA) ||
        !Number.isFinite(atomB) ||
        !Number.isFinite(bondOrder)
      ) {
        return null;
      }

      return {
        bondIndex: index,
        atomA,
        atomB,
        bondOrder,
        stereoCode: Number.isFinite(stereoCode) ? stereoCode : 0,
      };
    })
    .filter((bond): bond is ParsedBond => bond !== null);

  return { atoms, bonds };
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function extractAtomMatches(matchesJson: string): number[][] {
  try {
    const parsed = JSON.parse(matchesJson);

    if (Array.isArray(parsed)) {
      return parsed
        .map((match) => {
          if (Array.isArray(match)) return match;
          if (Array.isArray(match.atoms)) return match.atoms;
          return [];
        })
        .filter((atoms) => atoms.length > 0);
    }

    if (parsed && Array.isArray(parsed.atoms)) {
      return [parsed.atoms];
    }

    return [];
  } catch {
    return [];
  }
}

function findPotentialTetrahedralCentersFromRDKit(
  RDKit: any,
  mol: any,
  parsedMol: ParsedMolBlock
): number[] {
  const candidateSmarts = [
    "[C;X4;H1]",
    "[C;X4;H0]",
  ];

  const candidateAtomIndices: number[] = [];

  for (const smarts of candidateSmarts) {
    try {
      const query = RDKit.get_qmol(smarts);
      const matches = extractAtomMatches(mol.get_substruct_matches(query));

      for (const match of matches) {
        candidateAtomIndices.push(...match);
      }
    } catch (error) {
      console.log("Chirality SMARTS failed:", smarts, error);
    }
  }

  return uniqueNumbers(candidateAtomIndices).filter((atomIndex) =>
    isPotentialChiralCenterByConnectivity(parsedMol, atomIndex)
  );
}

function parseStereoTags(stereoTagsText: string): Map<number, ChiralityConfiguration> {
  const result = new Map<number, ChiralityConfiguration>();

  const lines = stereoTagsText.split(/\r?\n/);

  for (const line of lines) {
    const atomMatch =
      line.match(/atom\s+(\d+)/i) ??
      line.match(/Atom\s+(\d+)/i) ??
      line.match(/(\d+).*?\b(R|S)\b/);

    const configMatch = line.match(/\b(R|S)\b/);

    if (!atomMatch || !configMatch) continue;

    const atomNumber = Number.parseInt(atomMatch[1], 10);
    const config = configMatch[1] as ChiralityConfiguration;

    if (Number.isFinite(atomNumber)) {
      // RDKit stereo tags may report atoms as 0-based or 1-based depending on output.
      // We first store as-is, then handle fallback in analyzeChirality.
      result.set(atomNumber, config);
    }
  }

  return result;
}

const ATOMIC_NUMBERS: Record<string, number> = {
  H: 1,
  B: 5,
  C: 6,
  N: 7,
  O: 8,
  F: 9,
  P: 15,
  S: 16,
  Cl: 17,
  Br: 35,
  I: 53,
};

type Vector3 = {
  x: number;
  y: number;
  z: number;
};

type ChiralSubstituent = {
  atomIndex: number | null;
  element: string;
  vector: Vector3;
  prioritySignature: number[][];
};

function getAtomicNumber(element: string) {
  return ATOMIC_NUMBERS[element] ?? 0;
}

function getBondsForAtom(parsedMol: ParsedMolBlock, atomIndex: number) {
  return parsedMol.bonds.filter(
    (bond) => bond.atomA === atomIndex || bond.atomB === atomIndex
  );
}

function getNeighborAtomIndex(bond: ParsedBond, atomIndex: number) {
  return bond.atomA === atomIndex ? bond.atomB : bond.atomA;
}

function normalizeVector(vector: Vector3): Vector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);

  if (length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function dot(a: Vector3, b: Vector3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function getStereoZForBond(bond: ParsedBond, centerAtomIndex: number) {
  // Common V2000 stereo codes:
  // 1 = wedge/up
  // 6 = hashed/down
  if (bond.stereoCode !== 1 && bond.stereoCode !== 6) return 0;

  const baseZ = bond.stereoCode === 1 ? 1 : -1;

  // Molfile wedge/dash direction is directional.
  // If the center is the second atom in the bond line, invert the visual direction.
  return bond.atomA === centerAtomIndex ? baseZ : -baseZ;
}

function atomHasStereoBond(parsedMol: ParsedMolBlock, atomIndex: number) {
  return getBondsForAtom(parsedMol, atomIndex).some((bond) => {
    const hasStereoCode = bond.stereoCode === 1 || bond.stereoCode === 6;

    if (!hasStereoCode) return false;

    // Molfile wedge/dash stereochemistry is directional.
    // Only count the stereo bond for the atom it starts from.
    return bond.atomA === atomIndex;
  });
}
function buildPrioritySignature(
  parsedMol: ParsedMolBlock,
  atomIndex: number | null,
  previousAtomIndex: number,
  depth = 0,
  maxDepth = 4
): number[][] {
  if (atomIndex === null) {
    return [[1]];
  }

  const atom = parsedMol.atoms[atomIndex];

  if (!atom) {
    return [[0]];
  }

  const currentLayer = [getAtomicNumber(atom.element)];

  if (depth >= maxDepth) {
    return [currentLayer];
  }

  const nextAtoms: number[] = [];

  for (const bond of getBondsForAtom(parsedMol, atomIndex)) {
    const neighborIndex = getNeighborAtomIndex(bond, atomIndex);

    if (neighborIndex === previousAtomIndex) continue;

    // Approximate CIP multiple-bond duplication:
    // double bond counts attached atom twice, triple bond counts three times.
    const duplicateCount = bond.bondOrder === 2 ? 2 : bond.bondOrder === 3 ? 3 : 1;

    for (let i = 0; i < duplicateCount; i += 1) {
      nextAtoms.push(neighborIndex);
    }
  }

  const nextLayer = nextAtoms
    .map((nextAtomIndex) =>
      getAtomicNumber(parsedMol.atoms[nextAtomIndex]?.element ?? "unknown")
    )
    .sort((a, b) => b - a);

  if (nextLayer.length === 0) {
    return [currentLayer, [0]];
  }

  const deeperLayers = nextAtoms.flatMap((nextAtomIndex) =>
    buildPrioritySignature(
      parsedMol,
      nextAtomIndex,
      atomIndex,
      depth + 1,
      maxDepth
    ).slice(1)
  );

  return [currentLayer, nextLayer, ...deeperLayers];
}

function comparePrioritySignatures(
  a: number[][],
  b: number[][]
): number {
  const maxLayers = Math.max(a.length, b.length);

  for (let layerIndex = 0; layerIndex < maxLayers; layerIndex += 1) {
    const aLayer = a[layerIndex] ?? [0];
    const bLayer = b[layerIndex] ?? [0];

    const maxItems = Math.max(aLayer.length, bLayer.length);

    for (let itemIndex = 0; itemIndex < maxItems; itemIndex += 1) {
      const aValue = aLayer[itemIndex] ?? 0;
      const bValue = bLayer[itemIndex] ?? 0;

      if (aValue !== bValue) {
        return bValue - aValue;
      }
    }
  }

  return 0;
}

function getChiralSubstituents(
  parsedMol: ParsedMolBlock,
  centerAtomIndex: number
): ChiralSubstituent[] {
  const centerAtom = parsedMol.atoms[centerAtomIndex];

  if (!centerAtom) return [];

  const bonds = getBondsForAtom(parsedMol, centerAtomIndex);
  const substituents: ChiralSubstituent[] = [];

  for (const bond of bonds) {
    if (bond.bondOrder !== 1) continue;

    const neighborIndex = getNeighborAtomIndex(bond, centerAtomIndex);
    const neighborAtom = parsedMol.atoms[neighborIndex];

    if (!neighborAtom) continue;

    const stereoZ = getStereoZForBond(bond, centerAtomIndex);

    substituents.push({
      atomIndex: neighborIndex,
      element: neighborAtom.element,
      vector: normalizeVector({
        x: neighborAtom.x - centerAtom.x,
        // invert y so geometry behaves like regular math coordinates
        y: centerAtom.y - neighborAtom.y,
        z: stereoZ,
      }),
      prioritySignature: buildPrioritySignature(
        parsedMol,
        neighborIndex,
        centerAtomIndex
      ),
    });
  }

  // Add implicit H for common skeletal chiral carbons with 3 drawn bonds.
  if (centerAtom.element === "C" && substituents.length === 3) {
    const sumVector = substituents.reduce<Vector3>(
      (sum, substituent) => ({
        x: sum.x + substituent.vector.x,
        y: sum.y + substituent.vector.y,
        z: sum.z + substituent.vector.z,
      }),
      { x: 0, y: 0, z: 0 }
    );

    substituents.push({
      atomIndex: null,
      element: "H",
      vector: normalizeVector({
        x: -sumVector.x,
        y: -sumVector.y,
        z: -sumVector.z,
      }),
      prioritySignature: [[1]],
    });
  }

  return substituents;
}

  function getNeighborDescription(
  parsedMol: ParsedMolBlock,
  atomIndex: number | null
) {
  if (atomIndex === null) return "implicit H";

  const atom = parsedMol.atoms[atomIndex];

  if (!atom) return "unknown group";

  return `${atom.element} atom ${atomIndex + 1}`;
}

function getPriorityListExplanation(
  parsedMol: ParsedMolBlock,
  rankedSubstituents: ChiralSubstituent[]
) {
  return rankedSubstituents
    .map(
      (substituent, index) =>
        `Priority ${index + 1}: ${getNeighborDescription(
          parsedMol,
          substituent.atomIndex
        )}`
    )
    .join("; ");
}

function getRankedChiralSubstituents(
  parsedMol: ParsedMolBlock,
  centerAtomIndex: number
) {
  const substituents = getChiralSubstituents(parsedMol, centerAtomIndex);

  if (substituents.length !== 4) return null;

  const rankedSubstituents = [...substituents].sort((a, b) =>
    comparePrioritySignatures(a.prioritySignature, b.prioritySignature)
  );

  for (let i = 0; i < rankedSubstituents.length - 1; i += 1) {
    if (
      comparePrioritySignatures(
        rankedSubstituents[i].prioritySignature,
        rankedSubstituents[i + 1].prioritySignature
      ) === 0
    ) {
      return null;
    }
  }

  return rankedSubstituents;
}

function getConfigurationFromRankedVectors(
  rankedSubstituents: ChiralSubstituent[]
): ChiralityConfiguration {
  const priority1 = rankedSubstituents[0];
  const priority2 = rankedSubstituents[1];
  const priority3 = rankedSubstituents[2];
  const priority4 = rankedSubstituents[3];

  if (!priority1 || !priority2 || !priority3 || !priority4) {
    return "unknown";
  }

  const awayAxis = normalizeVector(priority4.vector);

  if (
    awayAxis.x === 0 &&
    awayAxis.y === 0 &&
    awayAxis.z === 0
  ) {
    return "unknown";
  }

  const helperAxis =
    Math.abs(awayAxis.z) < 0.9
      ? { x: 0, y: 0, z: 1 }
      : { x: 1, y: 0, z: 0 };

  const xAxis = normalizeVector(cross(helperAxis, awayAxis));
  const yAxis = normalizeVector(cross(awayAxis, xAxis));

  const project = (vector: Vector3) => ({
    x: dot(vector, xAxis),
    y: dot(vector, yAxis),
  });

  const p1 = project(priority1.vector);
  const p2 = project(priority2.vector);
  const p3 = project(priority3.vector);

  const signedArea =
    p1.x * (p2.y - p3.y) +
    p2.x * (p3.y - p1.y) +
    p3.x * (p1.y - p2.y);

  // This mapping is calibrated below against RDKit when RDKit gives at least
  // one known R/S center in the same molecule.
  return signedArea < 0 ? "R" : "S";
}

function invertConfiguration(
  configuration: ChiralityConfiguration
): ChiralityConfiguration {
  if (configuration === "R") return "S";
  if (configuration === "S") return "R";
  return configuration;
}

function getBondOrderSumForAtom(parsedMol: ParsedMolBlock, atomIndex: number) {
  return getBondsForAtom(parsedMol, atomIndex).reduce(
    (sum, bond) => sum + bond.bondOrder,
    0
  );
}

function getImplicitHydrogenCount(parsedMol: ParsedMolBlock, atomIndex: number) {
  const atom = parsedMol.atoms[atomIndex];

  if (!atom) return 0;

  // Basic organic valence estimate for common stereocenter carbon.
  if (atom.element === "C") {
    const bondOrderSum = getBondOrderSumForAtom(parsedMol, atomIndex);
    return Math.max(0, 4 - bondOrderSum);
  }

  return 0;
}

function getExplicitHydrogenCount(parsedMol: ParsedMolBlock, atomIndex: number) {
  return getBondsForAtom(parsedMol, atomIndex).filter((bond) => {
    const neighborIndex = getNeighborAtomIndex(bond, atomIndex);
    return parsedMol.atoms[neighborIndex]?.element === "H";
  }).length;
}

function getTotalHydrogenCount(parsedMol: ParsedMolBlock, atomIndex: number) {
  return (
    getExplicitHydrogenCount(parsedMol, atomIndex) +
    getImplicitHydrogenCount(parsedMol, atomIndex)
  );
}

function hasFourDifferentSubstituentPriorities(
  parsedMol: ParsedMolBlock,
  atomIndex: number
) {
  const substituents = getChiralSubstituents(parsedMol, atomIndex);

  if (substituents.length !== 4) return false;

  const sortedSubstituents = [...substituents].sort((a, b) =>
    comparePrioritySignatures(a.prioritySignature, b.prioritySignature)
  );

  for (let i = 0; i < sortedSubstituents.length - 1; i += 1) {
    const comparison = comparePrioritySignatures(
      sortedSubstituents[i].prioritySignature,
      sortedSubstituents[i + 1].prioritySignature
    );

    if (comparison === 0) {
      return false;
    }
  }

  return true;
}

function isPotentialChiralCenterByConnectivity(
  parsedMol: ParsedMolBlock,
  atomIndex: number
) {
  const atom = parsedMol.atoms[atomIndex];

  if (!atom || atom.element !== "C") {
    debugChiralCandidate(parsedMol, atomIndex, "REJECTED: not carbon");
    return false;
  }

  const bonds = getBondsForAtom(parsedMol, atomIndex);

  if (!bonds.every((bond) => bond.bondOrder === 1)) {
    debugChiralCandidate(parsedMol, atomIndex, "REJECTED: not all single bonds");
    return false;
  }

  const totalHydrogenCount = getTotalHydrogenCount(parsedMol, atomIndex);

  if (totalHydrogenCount >= 2) {
    debugChiralCandidate(parsedMol, atomIndex, "REJECTED: CH2/CH3, duplicate hydrogens");
    return false;
  }

  if (atomHasStereoBond(parsedMol, atomIndex)) {
    debugChiralCandidate(parsedMol, atomIndex, "ACCEPTED: stereo bond attached");
    return true;
  }

  if (hasFourDifferentSubstituentPriorities(parsedMol, atomIndex)) {
    debugChiralCandidate(parsedMol, atomIndex, "ACCEPTED: four different substituent priorities");
    return true;
  }

  debugChiralCandidate(parsedMol, atomIndex, "REJECTED: substituents not distinguishable");
  return false;
}

function getPocketChemFallbackConfiguration(
  parsedMol: ParsedMolBlock,
  centerAtomIndex: number
): ChiralityConfiguration {
  if (!atomHasStereoBond(parsedMol, centerAtomIndex)) {
    return "unknown";
  }

  const substituents = getChiralSubstituents(parsedMol, centerAtomIndex);

  if (substituents.length !== 4) {
    return "unknown";
  }

  const rankedSubstituents = [...substituents].sort((a, b) =>
    comparePrioritySignatures(a.prioritySignature, b.prioritySignature)
  );

  // If two priorities are tied, do not guess.
  for (let i = 0; i < rankedSubstituents.length - 1; i += 1) {
    if (
      comparePrioritySignatures(
        rankedSubstituents[i].prioritySignature,
        rankedSubstituents[i + 1].prioritySignature
      ) === 0
    ) {
      return "unknown";
    }
  }

  return getConfigurationFromRankedVectors(rankedSubstituents);
}

function shouldFlipFallbackAssignments(
  parsedMol: ParsedMolBlock,
  centers: number[],
  stereoMap: Map<number, ChiralityConfiguration>
) {
  let sameCount = 0;
  let oppositeCount = 0;

  for (const atomIndex of centers) {
    const rdkitConfiguration =
      stereoMap.get(atomIndex) ?? stereoMap.get(atomIndex + 1) ?? "unknown";

    if (rdkitConfiguration !== "R" && rdkitConfiguration !== "S") continue;

    const fallbackConfiguration = getPocketChemFallbackConfiguration(
      parsedMol,
      atomIndex
    );

    if (fallbackConfiguration !== "R" && fallbackConfiguration !== "S") continue;

    if (fallbackConfiguration === rdkitConfiguration) {
      sameCount += 1;
    } else {
      oppositeCount += 1;
    }
  }

  return oppositeCount > sameCount;
}

function debugChiralCandidate(
  parsedMol: ParsedMolBlock,
  atomIndex: number,
  decision: string
  
) {
  const atom = parsedMol.atoms[atomIndex];
  const bonds = getBondsForAtom(parsedMol, atomIndex);

  const neighborInfo = bonds.map((bond) => {
    const neighborIndex = getNeighborAtomIndex(bond, atomIndex);
    const neighbor = parsedMol.atoms[neighborIndex];

    return {
      bondIndex: bond.bondIndex,
      neighborAtomIndex: neighborIndex + 1,
      neighborElement: neighbor?.element,
      bondOrder: bond.bondOrder,
      stereoCode: bond.stereoCode,
      ownedStereoBonds: getBondsForAtom(parsedMol, atomIndex)
        .filter(
          (bond) =>
            bond.atomA === atomIndex &&
            (bond.stereoCode === 1 || bond.stereoCode === 6)
        )
        .map((bond) => bond.bondIndex + 1),
          };

    
  });

  const substituents = getChiralSubstituents(parsedMol, atomIndex);

  console.log("CHIRALITY DEBUG", {
    atomIndex0Based: atomIndex,
    atomIndexDisplayed: atomIndex + 1,
    element: atom?.element,
    decision,
    explicitH: getExplicitHydrogenCount(parsedMol, atomIndex),
    implicitH: getImplicitHydrogenCount(parsedMol, atomIndex),
    totalH: getTotalHydrogenCount(parsedMol, atomIndex),
    hasStereoBond: atomHasStereoBond(parsedMol, atomIndex),
    neighbors: neighborInfo,
    substituents: substituents.map((sub) => ({
      atomIndexDisplayed: sub.atomIndex === null ? "implicit H" : sub.atomIndex + 1,
      element: sub.element,
      prioritySignature: sub.prioritySignature,
      vector: sub.vector,
    })),
    hasFourDifferentSubstituentPriorities:
      hasFourDifferentSubstituentPriorities(parsedMol, atomIndex),
  });
}   

export async function analyzeChirality(
  smiles: string,
  molfile?: string
): Promise<ChiralityResult[]> {
  const RDKit = await getRDKit();
  const mol = molfile ? RDKit.get_mol(molfile) : RDKit.get_mol(smiles);

  if (!mol) return [];

  const parsedMol = parseMolBlock(mol.get_molblock());

  const potentialCenters = findPotentialTetrahedralCentersFromRDKit(
    RDKit,
    mol,
    parsedMol
  );

  console.log(
    "FINAL CHIRALITY CENTERS:",
    potentialCenters.map((i) => i + 1)
  );

  let stereoMap = new Map<number, ChiralityConfiguration>();

  try {
    const molWithPossibleStereoMethods = mol as unknown as {
      get_stereo_tags?: () => string;
    };

    const stereoTags = molWithPossibleStereoMethods.get_stereo_tags?.();

    if (stereoTags) {
      stereoMap = parseStereoTags(stereoTags);
    }
  } catch (error) {
    console.log("Could not read RDKit stereo tags:", error);
  }

  const shouldFlipFallback = shouldFlipFallbackAssignments(
    parsedMol,
    potentialCenters,
    stereoMap
  );

  return potentialCenters.map((atomIndex) => {
    const atom = parsedMol.atoms[atomIndex];

    const rdkitConfiguration =
      stereoMap.get(atomIndex) ?? stereoMap.get(atomIndex + 1) ?? "unknown";

    let fallbackConfiguration = getPocketChemFallbackConfiguration(
      parsedMol,
      atomIndex
    );

    if (shouldFlipFallback) {
      fallbackConfiguration = invertConfiguration(fallbackConfiguration);
    }

    const configuration: ChiralityConfiguration =
      rdkitConfiguration !== "unknown"
        ? rdkitConfiguration
        : fallbackConfiguration;

    const assignmentSource: ChiralityAssignmentSource =
      rdkitConfiguration !== "unknown"
        ? "rdkit"
        : fallbackConfiguration !== "unknown"
        ? "pocketchem-fallback"
        : "unassigned";

    const rankedSubstituents = getRankedChiralSubstituents(
      parsedMol,
      atomIndex
    );

    const priorityExplanation = rankedSubstituents
      ? getPriorityListExplanation(parsedMol, rankedSubstituents)
      : "PocketChem could not confidently rank all four substituents with the current simplified CIP rules.";

    const whyChiralExplanation =
      "This atom is flagged as a possible chiral center because it is tetrahedral and does not have duplicate hydrogen groups. A tetrahedral atom is chiral when it is attached to four different substituent groups.";

    const configurationExplanation =
      configuration === "unknown"
        ? "R/S was not assigned. PocketChem found a possible chiral center, but the stereochemistry or substituent priority ranking was not clear enough for assignment."
        : `${priorityExplanation}. With the lowest-priority group treated as pointing away, the 1 → 2 → 3 priority order gives ${configuration}.`;

    return {
      atomIndex,
      element: atom?.element ?? "unknown",
      configuration,
      assignmentSource,
      label:
        configuration === "unknown"
          ? "possible chiral center, R/S not assigned"
          : `${configuration} chiral center`,
      explanation:
        assignmentSource === "rdkit"
          ? `This tetrahedral atom is assigned ${configuration} configuration based on automatic stereochemistry analysis.`
          : assignmentSource === "pocketchem-fallback"
          ? `This tetrahedral atom is assigned ${configuration} configuration by manual stereochemistry analysis using wedge/dash bonds and simplified CIP priority.`
          : "This atom is a possible chiral center because it is tetrahedral and attached to different groups. R/S configuration was not assigned because no readable wedge/dash stereochemistry was detected or the substituent priorities were too ambiguous for the current fallback.",
      whyChiralExplanation,
      configurationExplanation,
    };
  });
}