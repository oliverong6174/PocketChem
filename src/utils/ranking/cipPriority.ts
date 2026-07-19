import { getRDKit } from "../rdkit";

const ELEMENT_SYMBOLS = [
  "*",
  "H",
  "He",
  "Li",
  "Be",
  "B",
  "C",
  "N",
  "O",
  "F",
  "Ne",
  "Na",
  "Mg",
  "Al",
  "Si",
  "P",
  "S",
  "Cl",
  "Ar",
  "K",
  "Ca",
  "Sc",
  "Ti",
  "V",
  "Cr",
  "Mn",
  "Fe",
  "Co",
  "Ni",
  "Cu",
  "Zn",
  "Ga",
  "Ge",
  "As",
  "Se",
  "Br",
  "Kr",
  "Rb",
  "Sr",
  "Y",
  "Zr",
  "Nb",
  "Mo",
  "Tc",
  "Ru",
  "Rh",
  "Pd",
  "Ag",
  "Cd",
  "In",
  "Sn",
  "Sb",
  "Te",
  "I",
  "Xe",
  "Cs",
  "Ba",
  "La",
  "Ce",
  "Pr",
  "Nd",
  "Pm",
  "Sm",
  "Eu",
  "Gd",
  "Tb",
  "Dy",
  "Ho",
  "Er",
  "Tm",
  "Yb",
  "Lu",
  "Hf",
  "Ta",
  "W",
  "Re",
  "Os",
  "Ir",
  "Pt",
  "Au",
  "Hg",
  "Tl",
  "Pb",
  "Bi",
  "Po",
  "At",
  "Rn",
  "Fr",
  "Ra",
  "Ac",
  "Th",
  "Pa",
  "U",
  "Np",
  "Pu",
  "Am",
  "Cm",
  "Bk",
  "Cf",
  "Es",
  "Fm",
  "Md",
  "No",
  "Lr",
  "Rf",
  "Db",
  "Sg",
  "Bh",
  "Hs",
  "Mt",
  "Ds",
  "Rg",
  "Cn",
  "Nh",
  "Fl",
  "Mc",
  "Lv",
  "Ts",
  "Og",
] as const;

const ATOMIC_NUMBER = new Map<string, number>(
  ELEMENT_SYMBOLS.map((symbol, index) => [symbol, index])
);

const DEFAULT_MASS_NUMBER: Record<string, number> = {
  H: 1,
  He: 4,
  Li: 7,
  Be: 9,
  B: 11,
  C: 12,
  N: 14,
  O: 16,
  F: 19,
  Ne: 20,
  Na: 23,
  Mg: 24,
  Al: 27,
  Si: 28,
  P: 31,
  S: 32,
  Cl: 35,
  Ar: 40,
  K: 39,
  Ca: 40,
  Br: 79,
  I: 127,
};

export type CipPriorityEntry = {
  priority: number;
  atomIndex: number | null;
  element: string;
  isotopeMassNumber: number | null;
  source: "bondedAtom" | "implicitHydrogen";
  comparisonKey: number[][];
  explanation: string;
};

export type CipCenterResult = {
  centerAtomIndex: number;
  centerElement: string;
  priorities: CipPriorityEntry[];
  isStereogenic: boolean;
  hasPriorityTie: boolean;
  explanation: string;
};

export type CipAttachmentSource = "dummyAtom" | "firstAtomFallback";

export type CipSubstituentPriorityResult = {
  attachmentSource: CipAttachmentSource;
  attachmentAtomIndex: number | null;
  rootAtomIndex: number;
  rootElement: string;
  directAtomicNumber: number;
  isotopeMassNumber: number | null;
  comparisonKey: number[][];
  explanation: string;
};

type CipAtom = {
  atomIndex: number;
  element: string;
  atomicNumber: number;
  isotopeMassNumber: number | null;
  formalCharge: number;
};

type CipBond = {
  atomA: number;
  atomB: number;
  order: number;
};

type ParsedCipMol = {
  atoms: CipAtom[];
  bonds: CipBond[];
  adjacency: Map<number, CipBond[]>;
};

type FrontierNode = {
  atomIndex: number;
  parentIndex: number | null;
  visited: Set<number>;
};

function getAtomicNumber(element: string) {
  return ATOMIC_NUMBER.get(element) ?? 0;
}

function getDefaultMassNumber(element: string) {
  return DEFAULT_MASS_NUMBER[element] ?? 0;
}

function encodeAtomPriority(atom: CipAtom) {
  const massNumber = atom.isotopeMassNumber ?? getDefaultMassNumber(atom.element);

  return atom.atomicNumber * 1000 + massNumber;
}

function getHydrogenPriorityKey() {
  return getAtomicNumber("H") * 1000 + getDefaultMassNumber("H");
}

function getOtherAtom(bond: CipBond, atomIndex: number) {
  return bond.atomA === atomIndex ? bond.atomB : bond.atomA;
}

function mapV2000ChargeCode(chargeCode: number) {
  if (chargeCode === 1) return 3;
  if (chargeCode === 2) return 2;
  if (chargeCode === 3) return 1;
  if (chargeCode === 5) return -1;
  if (chargeCode === 6) return -2;
  if (chargeCode === 7) return -3;

  return 0;
}

function parsePropertyPairs(
  line: string,
  callback: (atomIndex: number, value: number) => void
) {
  const parts = line.trim().split(/\s+/);
  const pairCount = Number.parseInt(parts[2] ?? "0", 10);

  if (!Number.isFinite(pairCount)) return;

  for (let index = 0; index < pairCount; index += 1) {
    const atomNumber = Number.parseInt(parts[3 + index * 2] ?? "", 10);
    const value = Number.parseInt(parts[4 + index * 2] ?? "", 10);

    if (!Number.isFinite(atomNumber) || !Number.isFinite(value)) continue;

    callback(atomNumber - 1, value);
  }
}

function parseMolBlock(molblock: string): ParsedCipMol {
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

  const atoms: CipAtom[] = lines
    .slice(4, 4 + atomCount)
    .map((line, atomIndex) => {
      const split = line.trim().split(/\s+/);
      const element = line.slice(31, 34).trim() || split[3] || "";
      const massDifference = Number.parseInt(line.slice(34, 36).trim(), 10);
      const chargeCode = Number.parseInt(line.slice(36, 39).trim(), 10);
      const defaultMass = getDefaultMassNumber(element);

      return {
        atomIndex,
        element,
        atomicNumber: getAtomicNumber(element),
        isotopeMassNumber:
          Number.isFinite(massDifference) && massDifference !== 0 && defaultMass > 0
            ? defaultMass + massDifference
            : null,
        formalCharge: Number.isFinite(chargeCode)
          ? mapV2000ChargeCode(chargeCode)
          : 0,
      };
    });

  const bonds: CipBond[] = lines
    .slice(4 + atomCount, 4 + atomCount + bondCount)
    .map((line) => {
      const atomA = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
      const atomB = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
      const rawOrder = Number.parseInt(line.slice(6, 9).trim(), 10);

      return {
        atomA,
        atomB,
        order: rawOrder === 4 ? 1.5 : rawOrder,
      };
    })
    .filter(
      (bond) =>
        Number.isFinite(bond.atomA) &&
        Number.isFinite(bond.atomB) &&
        Number.isFinite(bond.order)
    );

  for (const line of lines) {
    if (line.startsWith("M  CHG")) {
      parsePropertyPairs(line, (atomIndex, charge) => {
        const atom = atoms[atomIndex];
        if (atom) atom.formalCharge = charge;
      });
    }

    if (line.startsWith("M  ISO")) {
      parsePropertyPairs(line, (atomIndex, massNumber) => {
        const atom = atoms[atomIndex];
        if (atom) atom.isotopeMassNumber = massNumber;
      });
    }
  }

  const adjacency = new Map<number, CipBond[]>();
  atoms.forEach((atom) => adjacency.set(atom.atomIndex, []));

  bonds.forEach((bond) => {
    adjacency.get(bond.atomA)?.push(bond);
    adjacency.get(bond.atomB)?.push(bond);
  });

  return { atoms, bonds, adjacency };
}

function getExpectedValence(atom: CipAtom) {
  if (atom.element === "C") {
    return atom.formalCharge === 0 ? 4 : 3;
  }

  if (atom.element === "N") {
    return atom.formalCharge > 0 ? 4 : 3;
  }

  if (atom.element === "O") {
    if (atom.formalCharge < 0) return 1;
    if (atom.formalCharge > 0) return 3;
    return 2;
  }

  if (atom.element === "B") return 3;
  if (atom.element === "Si") return 4;
  if (atom.element === "P") return 3;
  if (atom.element === "S") return 2;

  if (["F", "Cl", "Br", "I"].includes(atom.element)) {
    return 1;
  }

  return 0;
}

function getImplicitHydrogenCount(
  parsedMol: ParsedCipMol,
  atomIndex: number,
  simulatedExternalBondOrder = 0
) {
  const atom = parsedMol.atoms[atomIndex];
  if (!atom || atom.element === "H" || atom.atomicNumber === 0) return 0;

  const expectedValence = getExpectedValence(atom);
  if (expectedValence === 0) return 0;

  const bondOrderSum = (parsedMol.adjacency.get(atomIndex) ?? []).reduce(
    (sum, bond) => sum + bond.order,
    simulatedExternalBondOrder
  );

  return Math.max(0, Math.min(4, Math.round(expectedValence - bondOrderSum)));
}

function getBondMultiplicity(order: number) {
  if (order >= 2.5) return 3;
  if (order >= 1.5) return 2;
  return 1;
}

function compareNumberArrays(a: number[], b: number[]) {
  const maxLength = Math.max(a.length, b.length);

  for (let index = 0; index < maxLength; index += 1) {
    const aValue = a[index] ?? -1;
    const bValue = b[index] ?? -1;

    if (aValue !== bValue) {
      return aValue - bValue;
    }
  }

  return 0;
}

/** Positive means a has higher CIP priority than b. */
export function compareCipPriorityKeys(a: number[][], b: number[][]) {
  const maxDepth = Math.max(a.length, b.length);

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const comparison = compareNumberArrays(a[depth] ?? [], b[depth] ?? []);

    if (comparison !== 0) return comparison;
  }

  return 0;
}

function buildSubstituentComparisonKey(
  parsedMol: ParsedCipMol,
  rootAtomIndex: number,
  blockedAtomIndex: number | null,
  simulatedExternalBondOrder = 0
) {
  const rootAtom = parsedMol.atoms[rootAtomIndex];

  if (!rootAtom) return [];

  const layers: number[][] = [[encodeAtomPriority(rootAtom)]];
  let frontier: FrontierNode[] = [
    {
      atomIndex: rootAtomIndex,
      parentIndex: blockedAtomIndex,
      visited: new Set(
        blockedAtomIndex === null
          ? [rootAtomIndex]
          : [blockedAtomIndex, rootAtomIndex]
      ),
    },
  ];

  const maxDepth = parsedMol.atoms.length + 2;

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const layerValues: number[] = [];
    const nextFrontier: FrontierNode[] = [];

    for (const node of frontier) {
      const bonds = parsedMol.adjacency.get(node.atomIndex) ?? [];

      for (const bond of bonds) {
        const neighborIndex = getOtherAtom(bond, node.atomIndex);

        if (neighborIndex === node.parentIndex) continue;
        if (neighborIndex === blockedAtomIndex) continue;

        const neighbor = parsedMol.atoms[neighborIndex];
        if (!neighbor) continue;

        const multiplicity = getBondMultiplicity(bond.order);

        for (let copy = 0; copy < multiplicity; copy += 1) {
          layerValues.push(encodeAtomPriority(neighbor));
        }

        if (!node.visited.has(neighborIndex)) {
          const nextVisited = new Set(node.visited);
          nextVisited.add(neighborIndex);

          nextFrontier.push({
            atomIndex: neighborIndex,
            parentIndex: node.atomIndex,
            visited: nextVisited,
          });
        }
      }

      const extraExternalBond =
        depth === 1 && node.atomIndex === rootAtomIndex
          ? simulatedExternalBondOrder
          : 0;

      const implicitHydrogens = getImplicitHydrogenCount(
        parsedMol,
        node.atomIndex,
        extraExternalBond
      );

      for (let hydrogen = 0; hydrogen < implicitHydrogens; hydrogen += 1) {
        layerValues.push(getHydrogenPriorityKey());
      }
    }

    if (layerValues.length === 0) break;

    layerValues.sort((a, b) => b - a);
    layers.push(layerValues);
    frontier = nextFrontier;
  }

  return layers;
}

function isPotentialTetrahedralCenter(
  parsedMol: ParsedCipMol,
  atom: CipAtom
) {
  if (!["C", "Si", "N", "P", "S"].includes(atom.element)) return false;

  const bonds = parsedMol.adjacency.get(atom.atomIndex) ?? [];
  if (bonds.some((bond) => bond.order > 1.1)) return false;

  const implicitHydrogens = getImplicitHydrogenCount(parsedMol, atom.atomIndex);
  const substituentCount = bonds.length + implicitHydrogens;

  if (substituentCount !== 4) return false;

  if (atom.element === "N" && atom.formalCharge <= 0 && bonds.length < 4) {
    return false;
  }

  return true;
}

function assignPriorityNumbers(entries: Omit<CipPriorityEntry, "priority">[]) {
  const sorted = [...entries].sort((a, b) =>
    -compareCipPriorityKeys(a.comparisonKey, b.comparisonKey)
  );

  let currentPriority = 0;
  let previousKey: number[][] | null = null;

  return sorted.map((entry) => {
    if (
      previousKey === null ||
      compareCipPriorityKeys(previousKey, entry.comparisonKey) !== 0
    ) {
      currentPriority += 1;
      previousKey = entry.comparisonKey;
    }

    return {
      ...entry,
      priority: currentPriority,
    };
  });
}

export async function analyzeCipPriorities(
  smiles: string
): Promise<CipCenterResult[]> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) return [];

  try {
    const parsedMol = parseMolBlock(mol.get_molblock());
    const results: CipCenterResult[] = [];

    for (const center of parsedMol.atoms) {
      if (!isPotentialTetrahedralCenter(parsedMol, center)) continue;

      const entries: Omit<CipPriorityEntry, "priority">[] = [];
      const centerBonds = parsedMol.adjacency.get(center.atomIndex) ?? [];

      for (const bond of centerBonds) {
        const neighborAtomIndex = getOtherAtom(bond, center.atomIndex);
        const neighbor = parsedMol.atoms[neighborAtomIndex];

        if (!neighbor) continue;

        entries.push({
          atomIndex: neighborAtomIndex,
          element: neighbor.element,
          isotopeMassNumber: neighbor.isotopeMassNumber,
          source: "bondedAtom",
          comparisonKey: buildSubstituentComparisonKey(
            parsedMol,
            neighborAtomIndex,
            center.atomIndex
          ),
          explanation: `Atom ${neighborAtomIndex + 1} begins with ${neighbor.element}; ties are resolved one bond farther from the stereocenter.`,
        });
      }

      const implicitHydrogens = getImplicitHydrogenCount(
        parsedMol,
        center.atomIndex
      );

      for (let hydrogen = 0; hydrogen < implicitHydrogens; hydrogen += 1) {
        entries.push({
          atomIndex: null,
          element: "H",
          isotopeMassNumber: null,
          source: "implicitHydrogen",
          comparisonKey: [[getHydrogenPriorityKey()]],
          explanation:
            "Hydrogen has atomic number 1 and therefore usually receives the lowest priority.",
        });
      }

      const priorities = assignPriorityNumbers(entries);
      const uniquePriorityCount = new Set(
        priorities.map((entry) => entry.priority)
      ).size;
      const hasPriorityTie = uniquePriorityCount !== priorities.length;

      results.push({
        centerAtomIndex: center.atomIndex,
        centerElement: center.element,
        priorities,
        isStereogenic: priorities.length === 4 && !hasPriorityTie,
        hasPriorityTie,
        explanation:
          priorities.length === 4 && !hasPriorityTie
            ? "All four substituents have distinct CIP priorities, so this atom can be a stereogenic center."
            : "At least two substituents have equal CIP priority, so this atom is not a stereogenic center by this analysis.",
      });
    }

    return results;
  } finally {
    mol.delete?.();
  }
}

/**
 * Builds one comparable CIP key for a separately drawn substituent.
 * Draw `*` bonded to the attachment atom for an explicit attachment point.
 * Without `*`, atom 1 is used as a fallback attachment atom.
 */
export async function analyzeCipSubstituentPriority(
  smiles: string
): Promise<CipSubstituentPriorityResult | null> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) return null;

  try {
    const parsedMol = parseMolBlock(mol.get_molblock());
    if (parsedMol.atoms.length === 0) return null;

    const dummyAtom = parsedMol.atoms.find(
      (atom) => atom.atomicNumber === 0 || atom.element === "*" || atom.element === "R#"
    );

    let attachmentSource: CipAttachmentSource = "firstAtomFallback";
    let attachmentAtomIndex: number | null = null;
    let rootAtomIndex = 0;
    let blockedAtomIndex: number | null = null;
    let simulatedExternalBondOrder = 1;

    if (dummyAtom) {
      const dummyBonds = parsedMol.adjacency.get(dummyAtom.atomIndex) ?? [];

      if (dummyBonds.length !== 1) return null;

      attachmentSource = "dummyAtom";
      attachmentAtomIndex = dummyAtom.atomIndex;
      rootAtomIndex = getOtherAtom(dummyBonds[0], dummyAtom.atomIndex);
      blockedAtomIndex = dummyAtom.atomIndex;
      simulatedExternalBondOrder = 0;
    }

    const rootAtom = parsedMol.atoms[rootAtomIndex];
    if (!rootAtom || rootAtom.atomicNumber === 0) return null;

    const comparisonKey = buildSubstituentComparisonKey(
      parsedMol,
      rootAtomIndex,
      blockedAtomIndex,
      simulatedExternalBondOrder
    );

    return {
      attachmentSource,
      attachmentAtomIndex,
      rootAtomIndex,
      rootElement: rootAtom.element,
      directAtomicNumber: rootAtom.atomicNumber,
      isotopeMassNumber: rootAtom.isotopeMassNumber,
      comparisonKey,
      explanation:
        attachmentSource === "dummyAtom"
          ? `The substituent is compared from atom ${rootAtomIndex + 1}, which is bonded to the explicit attachment marker.`
          : `No attachment marker was found, so atom ${rootAtomIndex + 1} is treated as the attachment atom.`,
    };
  } finally {
    mol.delete?.();
  }
}

/** Array.sort comparator: highest CIP priority first. */
export function compareCipSubstituentResults(
  a: CipSubstituentPriorityResult,
  b: CipSubstituentPriorityResult
) {
  return -compareCipPriorityKeys(a.comparisonKey, b.comparisonKey);
}