import { getOtherAtom, parseMolBlock } from "../../nomenclature/molParser";
import { getRDKit } from "../../rdkit";
import { parseAtomMatches } from "./matchParsing";
import type { MatchedAcidBaseSite } from "./types";
import type {
  SiteEnvironment,
  SiteHybridization,
  WithdrawingFeatureKind,
  WithdrawingFeatureMatch,
} from "./environmentTypes";

type ParsedMolecule = ReturnType<typeof parseMolBlock>;

type DisposableMol = {
  get_molblock: () => string;
  get_substruct_matches: (query: DisposableQuery) => string;
  delete: () => void;
};

type DisposableQuery = {
  delete: () => void;
};

function getNeighborAtomIndices(
  parsedMol: ParsedMolecule,
  atomIndex: number
): number[] {
  return (parsedMol.adjacency.get(atomIndex) ?? []).map((bond) =>
    getOtherAtom(bond, atomIndex)
  );
}

function hasPathExcludingAtom(
  parsedMol: ParsedMolecule,
  startAtomIndex: number,
  targetAtomIndex: number,
  excludedAtomIndex: number
): boolean {
  const visited = new Set<number>([excludedAtomIndex]);
  const queue = [startAtomIndex];

  while (queue.length > 0) {
    const currentAtomIndex = queue.shift();
    if (currentAtomIndex === undefined) continue;
    if (currentAtomIndex === targetAtomIndex) return true;
    if (visited.has(currentAtomIndex)) continue;

    visited.add(currentAtomIndex);

    for (const neighborAtomIndex of getNeighborAtomIndices(
      parsedMol,
      currentAtomIndex
    )) {
      if (!visited.has(neighborAtomIndex)) {
        queue.push(neighborAtomIndex);
      }
    }
  }

  return false;
}

function isAtomInCycle(parsedMol: ParsedMolecule, atomIndex: number): boolean {
  const neighbors = getNeighborAtomIndices(parsedMol, atomIndex);

  for (let firstIndex = 0; firstIndex < neighbors.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < neighbors.length;
      secondIndex += 1
    ) {
      const firstNeighbor = neighbors[firstIndex];
      const secondNeighbor = neighbors[secondIndex];

      if (
        firstNeighbor !== undefined &&
        secondNeighbor !== undefined &&
        hasPathExcludingAtom(
          parsedMol,
          firstNeighbor,
          secondNeighbor,
          atomIndex
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function isAromaticAtom(
  aromaticAtomIndices: ReadonlySet<number>,
  atomIndex: number
): boolean {
  return aromaticAtomIndices.has(atomIndex);
}

function getHybridization(
  parsedMol: ParsedMolecule,
  aromaticAtomIndices: ReadonlySet<number>,
  atomIndex: number
): SiteHybridization {
  if (aromaticAtomIndices.has(atomIndex)) return "sp2";
  const bondOrders = (parsedMol.adjacency.get(atomIndex) ?? []).map(
    (bond) => bond.bondOrder
  );

  if (bondOrders.length === 0) return "unknown";
  if (bondOrders.some((bondOrder) => bondOrder >= 3)) return "sp";
  if (bondOrders.some((bondOrder) => bondOrder >= 2 || bondOrder === 1.5)) {
    return "sp2";
  }

  return "sp3";
}

function isCarbonylCarbon(
  parsedMol: ParsedMolecule,
  atomIndex: number
): boolean {
  if (parsedMol.atoms[atomIndex]?.element !== "C") return false;

  return (parsedMol.adjacency.get(atomIndex) ?? []).some((bond) => {
    const neighborIndex = getOtherAtom(bond, atomIndex);
    return (
      bond.bondOrder === 2 &&
      parsedMol.atoms[neighborIndex]?.element === "O"
    );
  });
}

function isNitrileCarbon(
  parsedMol: ParsedMolecule,
  atomIndex: number
): boolean {
  if (parsedMol.atoms[atomIndex]?.element !== "C") return false;

  return (parsedMol.adjacency.get(atomIndex) ?? []).some((bond) => {
    const neighborIndex = getOtherAtom(bond, atomIndex);
    return (
      bond.bondOrder === 3 &&
      parsedMol.atoms[neighborIndex]?.element === "N"
    );
  });
}

function isNitroNitrogen(
  parsedMol: ParsedMolecule,
  atomIndex: number
): boolean {
  if (parsedMol.atoms[atomIndex]?.element !== "N") return false;

  return (
    (parsedMol.adjacency.get(atomIndex) ?? []).filter(
      (bond) =>
        parsedMol.atoms[getOtherAtom(bond, atomIndex)]?.element === "O"
    ).length >= 2
  );
}

function isSulfonylSulfur(
  parsedMol: ParsedMolecule,
  atomIndex: number
): boolean {
  if (parsedMol.atoms[atomIndex]?.element !== "S") return false;

  return (
    (parsedMol.adjacency.get(atomIndex) ?? []).filter((bond) => {
      const neighborIndex = getOtherAtom(bond, atomIndex);
      return (
        bond.bondOrder === 2 &&
        parsedMol.atoms[neighborIndex]?.element === "O"
      );
    }).length >= 2
  );
}

function getWithdrawingFeatureKind(
  parsedMol: ParsedMolecule,
  atomIndex: number
): WithdrawingFeatureKind | null {
  const element = parsedMol.atoms[atomIndex]?.element;

  if (["F", "Cl", "Br", "I"].includes(element ?? "")) return "halogen";
  if (isCarbonylCarbon(parsedMol, atomIndex)) return "carbonyl";
  if (isNitrileCarbon(parsedMol, atomIndex)) return "nitrile";
  if (isNitroNitrogen(parsedMol, atomIndex)) return "nitro";
  if (isSulfonylSulfur(parsedMol, atomIndex)) return "sulfonyl";

  return null;
}

function collectWithdrawingFeatures(
  parsedMol: ParsedMolecule,
  startAtomIndex: number,
  excludedAtomIndices: ReadonlySet<number>
): WithdrawingFeatureMatch[] {
  const visited = new Set<number>();
  const queue: Array<{ atomIndex: number; distance: number }> = [
    { atomIndex: startAtomIndex, distance: 0 },
  ];
  const features: WithdrawingFeatureMatch[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.atomIndex)) continue;

    visited.add(current.atomIndex);

    if (current.distance > 0 && !excludedAtomIndices.has(current.atomIndex)) {
      const kind = getWithdrawingFeatureKind(parsedMol, current.atomIndex);

      if (kind) {
        features.push({
          kind,
          atomIndex: current.atomIndex,
          distance: current.distance,
        });
      }
    }

    if (current.distance >= 4) continue;

    for (const neighborIndex of getNeighborAtomIndices(
      parsedMol,
      current.atomIndex
    )) {
      if (!visited.has(neighborIndex)) {
        queue.push({
          atomIndex: neighborIndex,
          distance: current.distance + 1,
        });
      }
    }
  }

  return features.sort(
    (first, second) =>
      first.distance - second.distance || first.atomIndex - second.atomIndex
  );
}

function isBenzylicCarbon(
  parsedMol: ParsedMolecule,
  aromaticAtomIndices: ReadonlySet<number>,
  atomIndex: number
): boolean {
  if (parsedMol.atoms[atomIndex]?.element !== "C") return false;

  return getNeighborAtomIndices(parsedMol, atomIndex).some(
    (neighborIndex) =>
      parsedMol.atoms[neighborIndex]?.element === "C" &&
      isAromaticAtom(aromaticAtomIndices, neighborIndex)
  );
}

function isAllylicCarbon(
  parsedMol: ParsedMolecule,
  atomIndex: number
): boolean {
  if (parsedMol.atoms[atomIndex]?.element !== "C") return false;

  return getNeighborAtomIndices(parsedMol, atomIndex).some((neighborIndex) => {
    if (parsedMol.atoms[neighborIndex]?.element !== "C") return false;

    return (parsedMol.adjacency.get(neighborIndex) ?? []).some((bond) => {
      const otherIndex = getOtherAtom(bond, neighborIndex);
      return otherIndex !== atomIndex && bond.bondOrder === 2;
    });
  });
}

function countAdjacentFeature(
  parsedMol: ParsedMolecule,
  atomIndex: number,
  predicate: (parsedMol: ParsedMolecule, atomIndex: number) => boolean
): number {
  return getNeighborAtomIndices(parsedMol, atomIndex).filter((neighborIndex) =>
    predicate(parsedMol, neighborIndex)
  ).length;
}

function countCarbonNeighbors(
  parsedMol: ParsedMolecule,
  atomIndex: number,
  excludedAtomIndices: ReadonlySet<number> = new Set<number>()
): number {
  return getNeighborAtomIndices(parsedMol, atomIndex).filter(
    (neighborIndex) =>
      parsedMol.atoms[neighborIndex]?.element === "C" &&
      !excludedAtomIndices.has(neighborIndex)
  ).length;
}

function getAttachedCarbonIndex(
  parsedMol: ParsedMolecule,
  siteAtomIndex: number
): number | null {
  return (
    getNeighborAtomIndices(parsedMol, siteAtomIndex).find(
      (neighborIndex) => parsedMol.atoms[neighborIndex]?.element === "C"
    ) ?? null
  );
}


function getMatchingAtomIndexSet(
  RDKit: any,
  mol: DisposableMol,
  smarts: string
): Set<number> {
  const query = RDKit.get_qmol(smarts) as DisposableQuery | null;
  if (!query) return new Set<number>();

  try {
    return new Set(
      parseAtomMatches(mol.get_substruct_matches(query)).flat()
    );
  } finally {
    query.delete();
  }
}

export class MolecularEnvironmentGraph {
  private readonly mol: DisposableMol;
  private readonly parsedMol: ParsedMolecule;
  private readonly aromaticAtomIndices: ReadonlySet<number>;

  private constructor(
    mol: DisposableMol,
    parsedMol: ParsedMolecule,
    aromaticAtomIndices: ReadonlySet<number>
  ) {
    this.mol = mol;
    this.parsedMol = parsedMol;
    this.aromaticAtomIndices = aromaticAtomIndices;
  }

  static async create(smiles: string): Promise<MolecularEnvironmentGraph | null> {
    const RDKit = await getRDKit();
    const mol = RDKit.get_mol(smiles) as DisposableMol | null;

    if (!mol) return null;

    return new MolecularEnvironmentGraph(
      mol,
      parseMolBlock(mol.get_molblock()),
      getMatchingAtomIndexSet(RDKit, mol, "[a]")
    );
  }

  dispose(): void {
    this.mol.delete();
  }

  buildSiteEnvironment(site: MatchedAcidBaseSite): SiteEnvironment {
    const atom = this.parsedMol.atoms[site.atomIndex];
    const neighborIndices = getNeighborAtomIndices(
      this.parsedMol,
      site.atomIndex
    );
    const excludedAtomIndices = new Set(site.matchedAtomIndices);
    const attachedCarbonIndex = getAttachedCarbonIndex(
      this.parsedMol,
      site.atomIndex
    );
    const attachedCarbonExclusions = new Set(excludedAtomIndices);

    if (attachedCarbonIndex !== null) {
      attachedCarbonExclusions.delete(attachedCarbonIndex);
      attachedCarbonExclusions.add(site.atomIndex);
    }

    return {
      siteAtomIndex: site.atomIndex,
      element: atom?.element ?? "",
      formalCharge: atom?.charge ?? 0,
      hybridization: getHybridization(
        this.parsedMol,
        this.aromaticAtomIndices,
        site.atomIndex
      ),
      heavyAtomNeighborCount: neighborIndices.length,
      carbonNeighborCount: neighborIndices.filter(
        (neighborIndex) =>
          this.parsedMol.atoms[neighborIndex]?.element === "C"
      ).length,
      heteroatomNeighborCount: neighborIndices.filter(
        (neighborIndex) =>
          this.parsedMol.atoms[neighborIndex]?.element !== "C"
      ).length,
      siteCarbonSubstituentCount: countCarbonNeighbors(
        this.parsedMol,
        site.atomIndex,
        excludedAtomIndices
      ),
      attachedCarbonIndex,
      attachedCarbonSubstituentCount:
        attachedCarbonIndex === null
          ? 0
          : countCarbonNeighbors(
              this.parsedMol,
              attachedCarbonIndex,
              attachedCarbonExclusions
            ),
      isSiteInRing: isAtomInCycle(this.parsedMol, site.atomIndex),
      isAttachedCarbonInRing:
        attachedCarbonIndex !== null &&
        isAtomInCycle(this.parsedMol, attachedCarbonIndex),
      isAromatic: isAromaticAtom(
        this.aromaticAtomIndices,
        site.atomIndex
      ),
      isAttachedToAromaticCarbon:
        attachedCarbonIndex !== null &&
        isAromaticAtom(this.aromaticAtomIndices, attachedCarbonIndex),
      attachedCarbonHasAromaticNeighbor:
        attachedCarbonIndex !== null &&
        getNeighborAtomIndices(this.parsedMol, attachedCarbonIndex).some(
          (neighborIndex) =>
            neighborIndex !== site.atomIndex &&
            isAromaticAtom(this.aromaticAtomIndices, neighborIndex)
        ),
      isBenzylic: isBenzylicCarbon(
        this.parsedMol,
        this.aromaticAtomIndices,
        site.atomIndex
      ),
      isAllylic: isAllylicCarbon(this.parsedMol, site.atomIndex),
      adjacentCarbonylCount: countAdjacentFeature(
        this.parsedMol,
        site.atomIndex,
        isCarbonylCarbon
      ),
      adjacentNitrileCount: countAdjacentFeature(
        this.parsedMol,
        site.atomIndex,
        isNitrileCarbon
      ),
      adjacentNitroCount: countAdjacentFeature(
        this.parsedMol,
        site.atomIndex,
        isNitroNitrogen
      ),
      nearbyWithdrawingFeatures: collectWithdrawingFeatures(
        this.parsedMol,
        site.atomIndex,
        excludedAtomIndices
      ),
    };
  }
}