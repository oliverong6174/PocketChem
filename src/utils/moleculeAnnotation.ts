import { getRDKit } from "./rdkit";

const DEUTERIUM_DRAW_OPTION = { atomLabelDeuteriumTritium: true };

export type Hybridization = "sp" | "sp2" | "sp3" | "unknown";

export type BondType = "single" | "double" | "triple" | "aromatic" | "unknown";

export type LonePairOrbital = "sp3" | "sp2" | "p" | "mixed" | "none" | "unknown";

export type LonePairInfo = {
  count: number;
  orbital: LonePairOrbital;
  participatesInResonance: boolean;
  explanation: string;
};

export type AnnotationConcept =
  | "hybridization"
  | "bondOrbitals"
  | "lonePairs"
  | "acidBaseSites"
  | "reactiveSites"
  | "resonance"
  | "chirality"
  | "functionalGroups";

export type AtomAnnotation = {
  atomIndex: number;
  element: string;
  hybridization: Hybridization;
  siteTypes: string[];
  orbitalInfo: string[];
  lonePairInfo: LonePairInfo;
  explanation: string;
};

export type BondAnnotation = {
  bondIndex: number;
  atomIndices: [number, number];
  bondType: BondType;
  orbitalInfo: string[];
  sigmaOverlap: string;
  piOverlap: string | null;
  explanation: string;
};

export type MoleculeAnnotation = {
  atoms: AtomAnnotation[];
  bonds: BondAnnotation[];
};

type ParsedAtom = {
  atomIndex: number;
  element: string;
};

type ParsedBond = {
  bondIndex: number;
  atomA: number;
  atomB: number;
  bondOrder: number;
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
      element: parts[3] ?? "unknown",
    };
  });

  const bonds: ParsedBond[] = bondLines
    .map((line, index) => {
      const parts = line.trim().split(/\s+/);

      const atomA = Number.parseInt(parts[0], 10) - 1;
      const atomB = Number.parseInt(parts[1], 10) - 1;
      const bondOrder = Number.parseInt(parts[2], 10);

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
      };
    })
    .filter((bond): bond is ParsedBond => bond !== null);

  return { atoms, bonds };
}

function getBondsForAtom(parsedMol: ParsedMolBlock, atomIndex: number) {
  return parsedMol.bonds.filter(
    (bond) => bond.atomA === atomIndex || bond.atomB === atomIndex
  );
}

function getBondType(bondOrder: number): BondType {
  if (bondOrder === 1) return "single";
  if (bondOrder === 2) return "double";
  if (bondOrder === 3) return "triple";
  if (bondOrder === 4) return "aromatic";
  return "unknown";
}

function inferHybridization(
  parsedMol: ParsedMolBlock,
  atom: ParsedAtom
): Hybridization {
  const bonds = getBondsForAtom(parsedMol, atom.atomIndex);

  const hasTripleBond = bonds.some((bond) => bond.bondOrder === 3);
  const hasDoubleBond = bonds.some((bond) => bond.bondOrder === 2);
  const hasAromaticBond = bonds.some((bond) => bond.bondOrder === 4);

  if (hasTripleBond) return "sp";
  if (hasDoubleBond || hasAromaticBond) return "sp2";

  // Nitrogen exceptions:
  // Amide/anilide/enamine/pyrrole-like nitrogens can be sp2 even if drawn with single bonds.
  if (atom.element === "N") {
    if (
      atomIsAttachedToCarbonyl(parsedMol, atom.atomIndex) ||
      atomHasAdjacentPiSystem(parsedMol, atom.atomIndex)
    ) {
      return "sp2";
    }

    return "sp3";
  }

  // Oxygen exceptions:
  // Carbonyl oxygen is already caught by double bond.
  // Phenol/aryl ether/conjugated oxygen may be sp2-like due to resonance donation.
  if (atom.element === "O") {
    if (atomHasAdjacentPiSystem(parsedMol, atom.atomIndex)) {
      return "sp2";
    }

    return "sp3";
  }

  if (["C", "S", "P"].includes(atom.element)) {
    return "sp3";
  }

  return "unknown";
}

function getHybridizationExplanation(
  atom: ParsedAtom,
  hybridization: Hybridization
): string {
  if (hybridization === "sp") {
    return `${atom.element} atom ${atom.atomIndex} is classified as sp because it participates in a triple bond or linear two-domain system.`;
  }

  if (hybridization === "sp2") {
    return `${atom.element} atom ${atom.atomIndex} is classified as sp2 because it participates in a double bond, aromatic system, or trigonal planar π system.`;
  }

  if (hybridization === "sp3") {
    return `${atom.element} atom ${atom.atomIndex} is classified as sp3 because it is mainly involved in single-bond tetrahedral electron geometry.`;
  }

  return `${atom.element} atom ${atom.atomIndex} has unknown hybridization in this first-pass analyzer.`;
}

function getOrbitalInfo(hybridization: Hybridization): string[] {
  if (hybridization === "sp") {
    return ["linear geometry", "high s-character", "can be associated with triple bonds"];
  }

  if (hybridization === "sp2") {
    return ["trigonal planar geometry", "p orbital available for π bonding", "common in carbonyls, alkenes, and aromatic systems"];
  }

  if (hybridization === "sp3") {
    return ["tetrahedral electron geometry", "mostly sigma bonding", "lone pairs may occupy sp3 orbitals"];
  }

  return ["orbital assignment not available yet"];
}

function getAtomSiteTypes(
  parsedMol: ParsedMolBlock,
  atom: ParsedAtom,
  hybridization: Hybridization
): string[] {
  const bonds = getBondsForAtom(parsedMol, atom.atomIndex);
  const siteTypes: string[] = [];

  if (["O", "N", "S"].includes(atom.element)) {
    siteTypes.push("lone-pair atom");
  }

  if (atom.element === "O" || atom.element === "N" || atom.element === "S") {
    siteTypes.push("possible basic site");
  }

  if (atom.element === "C" && hybridization === "sp2") {
    const hasDoubleBondToO = bonds.some((bond) => {
      if (bond.bondOrder !== 2) return false;

      const neighborIndex = bond.atomA === atom.atomIndex ? bond.atomB : bond.atomA;
      const neighbor = parsedMol.atoms[neighborIndex];

      return neighbor?.element === "O";
    });

    if (hasDoubleBondToO) {
      siteTypes.push("electrophilic carbonyl carbon");
    }
  }

  if (atom.element === "C" && hybridization === "sp") {
    siteTypes.push("orbital acidity site");
  }

  return siteTypes;
}

function atomHasAdjacentPiSystem(
  parsedMol: ParsedMolBlock,
  atomIndex: number
): boolean {
  const bonds = getBondsForAtom(parsedMol, atomIndex);

  return bonds.some((bond) => {
    const neighborIndex = bond.atomA === atomIndex ? bond.atomB : bond.atomA;
    const neighborBonds = getBondsForAtom(parsedMol, neighborIndex);

    return neighborBonds.some(
      (neighborBond) =>
        neighborBond.bondOrder === 2 ||
        neighborBond.bondOrder === 3 ||
        neighborBond.bondOrder === 4
    );
  });
}

function atomIsAttachedToCarbonyl(
  parsedMol: ParsedMolBlock,
  atomIndex: number
): boolean {
  const bonds = getBondsForAtom(parsedMol, atomIndex);

  return bonds.some((bond) => {
    const neighborIndex = bond.atomA === atomIndex ? bond.atomB : bond.atomA;
    const neighbor = parsedMol.atoms[neighborIndex];

    if (neighbor?.element !== "C") return false;

    const neighborBonds = getBondsForAtom(parsedMol, neighborIndex);

    return neighborBonds.some((neighborBond) => {
      if (neighborBond.bondOrder !== 2) return false;

      const otherIndex =
        neighborBond.atomA === neighborIndex
          ? neighborBond.atomB
          : neighborBond.atomA;

      return parsedMol.atoms[otherIndex]?.element === "O";
    });
  });
}

function getLonePairInfo(
  parsedMol: ParsedMolBlock,
  atom: ParsedAtom,
  hybridization: Hybridization
): LonePairInfo {
  const element = atom.element;
  const attachedToCarbonyl = atomIsAttachedToCarbonyl(parsedMol, atom.atomIndex);
  const adjacentPi = atomHasAdjacentPiSystem(parsedMol, atom.atomIndex);

  if (element === "O") {
    if (hybridization === "sp2") {
      return {
        count: 2,
        orbital: "sp2",
        participatesInResonance: adjacentPi,
        explanation:
          "Oxygen usually has two lone pairs. In carbonyls or conjugated systems, oxygen is treated as sp2, with lone-pair electron density able to interact with nearby π orbitals.",
      };
    }

    return {
      count: 2,
      orbital: "sp3",
      participatesInResonance: adjacentPi,
      explanation:
        adjacentPi
          ? "Oxygen usually has two lone pairs. Because it is next to a π system, one lone pair may donate into resonance while the other remains more localized."
          : "Oxygen usually has two lone pairs held in sp3-type orbitals when it is not conjugated with a π system.",
    };
  }

 if (element === "N") {
  if (attachedToCarbonyl) {
    return {
      count: 1,
      orbital: "p",
      participatesInResonance: true,
      explanation:
        "This nitrogen has one lone pair in a p orbital. Because it is attached to a carbonyl, the lone pair overlaps with the carbonyl π system, making the nitrogen sp2-like and less basic.",
    };
  }

  if (hybridization === "sp2" || adjacentPi) {
    return {
      count: 1,
      orbital: "p",
      participatesInResonance: true,
      explanation:
        "This nitrogen has one lone pair in a p orbital. The p orbital allows the lone pair to overlap with a nearby π system, so this nitrogen is treated as sp2-like.",
    };
  }

  return {
    count: 1,
    orbital: "sp3",
    participatesInResonance: false,
    explanation:
      "This nitrogen has one lone pair in an sp3 orbital. Because it is not conjugated with a nearby π system, the lone pair is more available for basicity and nucleophilicity.",
  };
}

  if (element === "S") {
    return {
      count: 2,
      orbital: hybridization === "sp2" ? "sp2" : "sp3",
      participatesInResonance: adjacentPi,
      explanation:
        adjacentPi
          ? "Sulfur usually has two lone pairs. If adjacent to a π system, it may participate in resonance, although overlap is often weaker than oxygen or nitrogen."
          : "Sulfur usually has two lone pairs and can act as a nucleophilic/basic site.",
    };
  }

  if (["F", "Cl", "Br", "I"].includes(element)) {
    return {
      count: 3,
      orbital: "sp3",
      participatesInResonance: false,
      explanation:
        "Halogens usually have three lone pairs. They are often electron-withdrawing and can act as leaving groups when attached to carbon.",
    };
  }

  return {
    count: 0,
    orbital: "none",
    participatesInResonance: false,
    explanation: "This atom is not assigned lone pairs in this first-pass analyzer.",
  };
}

function getSigmaOverlap(
  atomA: AtomAnnotation,
  atomB: AtomAnnotation
): string {
  if (atomA.hybridization === "unknown" || atomB.hybridization === "unknown") {
    return "unknown sigma overlap";
  }

  return `${atomA.element}${atomA.hybridization}–${atomB.element}${atomB.hybridization} sigma overlap`;
}

function getPiOverlap(bondType: BondType): string | null {
  if (bondType === "double") {
    return "one p–p pi overlap";
  }

  if (bondType === "triple") {
    return "two p–p pi overlaps";
  }

  if (bondType === "aromatic") {
    return "delocalized p orbital overlap across the aromatic system";
  }

  return null;
}

function getBondExplanation(bondType: BondType, atomA: ParsedAtom, atomB: ParsedAtom) {
  if (bondType === "single") {
    return `Bond ${atomA.atomIndex}-${atomB.atomIndex} is a sigma bond. Rotation is usually possible unless restricted by a ring or resonance.`;
  }

  if (bondType === "double") {
    return `Bond ${atomA.atomIndex}-${atomB.atomIndex} contains one sigma bond and one pi bond. Rotation is restricted.`;
  }

  if (bondType === "triple") {
    return `Bond ${atomA.atomIndex}-${atomB.atomIndex} contains one sigma bond and two pi bonds. The atoms are usually linear and sp-hybridized.`;
  }

  if (bondType === "aromatic") {
    return `Bond ${atomA.atomIndex}-${atomB.atomIndex} is part of an aromatic system with delocalized pi electrons.`;
  }

  return `Bond ${atomA.atomIndex}-${atomB.atomIndex} has unknown bond type.`;
}

export async function getMoleculeAnnotation(
  smiles: string
): Promise<MoleculeAnnotation> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) {
    return { atoms: [], bonds: [] };
  }

  try {
    const parsedMol = parseMolBlock(mol.get_molblock());

  const atoms: AtomAnnotation[] = parsedMol.atoms.map((atom) => {
  const hybridization = inferHybridization(parsedMol, atom);
  const siteTypes = getAtomSiteTypes(parsedMol, atom, hybridization);
  const lonePairInfo = getLonePairInfo(parsedMol, atom, hybridization);

  return {
    atomIndex: atom.atomIndex,
    element: atom.element,
    hybridization,
    siteTypes,
    orbitalInfo: getOrbitalInfo(hybridization),
    lonePairInfo,
    explanation: getHybridizationExplanation(atom, hybridization),
  };
});

const bonds: BondAnnotation[] = parsedMol.bonds.map((bond) => {
  const rawAtomA = parsedMol.atoms[bond.atomA];
  const rawAtomB = parsedMol.atoms[bond.atomB];
  const atomA = atoms[bond.atomA];
  const atomB = atoms[bond.atomB];
  const bondType = getBondType(bond.bondOrder);
  const sigmaOverlap = getSigmaOverlap(atomA, atomB);
  const piOverlap = getPiOverlap(bondType);

  return {
    bondIndex: bond.bondIndex,
    atomIndices: [bond.atomA, bond.atomB],
    bondType,
    orbitalInfo:
      bondType === "single"
        ? [sigmaOverlap]
        : bondType === "double"
        ? [sigmaOverlap, piOverlap ?? "pi overlap"]
        : bondType === "triple"
        ? [sigmaOverlap, "two p–p pi overlaps"]
        : bondType === "aromatic"
        ? [sigmaOverlap, "delocalized aromatic p orbital overlap"]
        : ["unknown bond orbital"],
    sigmaOverlap,
    piOverlap,
    explanation: `${getBondExplanation(bondType, rawAtomA, rawAtomB)} Sigma component: ${sigmaOverlap}.${
      piOverlap ? ` Pi component: ${piOverlap}.` : ""
    }`,
  };
});

    return { atoms, bonds };
  } finally {
    mol.delete?.();
  }
}

export async function getHighlightedMoleculeSvg(
  smiles: string,
  atomIndices: number[],
  bondIndices: number[],
  selectedAtomIndex: number | null,
  selectedBondIndex: number | null,
  selectedSystemAtomIndices: number[] = [],
  selectedSystemBondIndices: number[] = []
): Promise<string | null> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) return null;

  const selectedAtoms =
    selectedAtomIndex !== null ? [selectedAtomIndex] : [];

  const selectedBonds =
    selectedBondIndex !== null ? [selectedBondIndex] : [];

  const strongAtomIndices = Array.from(
    new Set([...selectedAtoms, ...selectedSystemAtomIndices])
  );

  const strongBondIndices = Array.from(
    new Set([...selectedBonds, ...selectedSystemBondIndices])
  );

  const allHighlightedAtoms = Array.from(
    new Set([...atomIndices, ...strongAtomIndices])
  );

  const allHighlightedBonds = Array.from(
    new Set([...bondIndices, ...strongBondIndices])
  );

  const softAtomColor: [number, number, number] = [0.65, 0.82, 1.0];
  const selectedAtomColor: [number, number, number] = [1.0, 0.65, 0.05];

  const softBondColor: [number, number, number] = [0.72, 0.84, 1.0];
  const selectedBondColor: [number, number, number] = [1.0, 0.55, 0.05];

  const highlightAtomColors = Object.fromEntries(
    allHighlightedAtoms.map((atomIndex) => [
      atomIndex,
      strongAtomIndices.includes(atomIndex)
        ? selectedAtomColor
        : softAtomColor,
    ])
  );

  const highlightBondColors = Object.fromEntries(
    allHighlightedBonds.map((bondIndex) => [
      bondIndex,
      strongBondIndices.includes(bondIndex)
        ? selectedBondColor
        : softBondColor,
    ])
  );

  const highlightDetails = {
    width: 420,
    height: 300,
    atoms: allHighlightedAtoms,
    bonds: allHighlightedBonds,
    highlightAtomColors,
    highlightBondColors,
    highlightAtomRadii: Object.fromEntries(
      allHighlightedAtoms.map((atomIndex) => [
        atomIndex,
        strongAtomIndices.includes(atomIndex) ? 0.45 : 0.28,
      ])
    ),
    highlightBondWidthMultiplier: 6,
    ...DEUTERIUM_DRAW_OPTION,
  };

  try {
    return mol.get_svg_with_highlights(JSON.stringify(highlightDetails));
  } catch (error) {
    console.warn("Highlighted SVG failed; using the standard drawing.", error);
    return mol.get_svg_with_highlights(JSON.stringify(DEUTERIUM_DRAW_OPTION));
  } finally {
    mol.delete?.();
  }
}
