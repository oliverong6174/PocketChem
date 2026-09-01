import type {
  NamingFeature,
  ParentDescriptor,
  ParsedAtom,
  ParsedBond,
  ParsedMol,
} from "./types";

import { COMMON_VALENCES } from "./constants";
import { getOtherAtom } from "./molParser";
import { buildBranchName } from "./branch/branchConstructor";
import { getHydroxyBearingCarbon } from "./heteroAtomClassifiers";
import { isSimpleAmineNitrogen } from "./classifiers/nitrogen";
import { alkylNameToAlkoxyName } from "./alkoxyNames";

import {
  getLocantMap,
  isAldehydeCarbon,
  isKetoneCarbon,
} from "./graph/parentSelection";

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

function carbonHasCarbonylOxygen(parsedMol: ParsedMol, carbonIndex: number) {
  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "O" && bond.bondOrder === 2;
  });
}

function isAnhydrideBridgeOxygen(
  parsedMol: ParsedMol,
  oxygenIndex: number,
  acylCarbonIndex: number
) {
  const carbonylCarbonNeighbors = (
    parsedMol.adjacency.get(oxygenIndex) ?? []
  )
    .filter((bond) => bond.bondOrder === 1)
    .map((bond) => getOtherAtom(bond, oxygenIndex))
    .filter((atomIndex) => {
      const atom = parsedMol.atoms[atomIndex];

      return (
        atom?.element === "C" &&
        carbonHasCarbonylOxygen(parsedMol, atomIndex)
      );
    });

  return (
    carbonylCarbonNeighbors.includes(acylCarbonIndex) &&
    carbonylCarbonNeighbors.length >= 2
  );
}


function isPeroxyAcidCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (parsedMol.atoms[carbonIndex]?.element !== "C") return false;

  const bonds = parsedMol.adjacency.get(carbonIndex) ?? [];
  const hasCarbonylOxygen = bonds.some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "O" && bond.bondOrder === 2;
  });
  if (!hasCarbonylOxygen) return false;

  return bonds.some((bond) => {
    if (bond.bondOrder !== 1) return false;
    const firstOxygen = getOtherAtom(bond, carbonIndex);
    if (parsedMol.atoms[firstOxygen]?.element !== "O") return false;

    return (parsedMol.adjacency.get(firstOxygen) ?? []).some((ooBond) => {
      if (ooBond.bondOrder !== 1) return false;
      const terminalOxygen = getOtherAtom(ooBond, firstOxygen);
      if (terminalOxygen === carbonIndex) return false;
      const oxygen = parsedMol.atoms[terminalOxygen];
      return (
        oxygen?.element === "O" &&
        countImplicitHydrogens(oxygen, parsedMol.adjacency) > 0
      );
    });
  });
}

export function getPeroxyAcidCarbons(parsedMol: ParsedMol) {
  return parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex)
    .filter((atomIndex) => isPeroxyAcidCarbon(parsedMol, atomIndex));
}

function isAcylAzideCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (parsedMol.atoms[carbonIndex]?.element !== "C") return false;
  const bonds = parsedMol.adjacency.get(carbonIndex) ?? [];

  const hasCarbonylOxygen = bonds.some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "O" && bond.bondOrder === 2;
  });
  if (!hasCarbonylOxygen) return false;

  const firstNitrogens = bonds
    .filter((bond) => {
      const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
      return attached?.element === "N";
    })
    .map((bond) => getOtherAtom(bond, carbonIndex));

  return firstNitrogens.some((firstNitrogen) => {
    const secondNitrogens = (parsedMol.adjacency.get(firstNitrogen) ?? [])
      .map((bond) => getOtherAtom(bond, firstNitrogen))
      .filter(
        (atomIndex) =>
          atomIndex !== carbonIndex &&
          parsedMol.atoms[atomIndex]?.element === "N"
      );

    return secondNitrogens.some((secondNitrogen) =>
      (parsedMol.adjacency.get(secondNitrogen) ?? []).some((bond) => {
        const thirdNitrogen = getOtherAtom(bond, secondNitrogen);
        return (
          thirdNitrogen !== firstNitrogen &&
          parsedMol.atoms[thirdNitrogen]?.element === "N"
        );
      })
    );
  });
}

export function getAcylAzideCarbons(parsedMol: ParsedMol) {
  return parsedMol.atoms
    .filter((atom) => atom.element === "C")
    .map((atom) => atom.atomIndex)
    .filter((atomIndex) => isAcylAzideCarbon(parsedMol, atomIndex));
}

export function getCarboxylicAcidCarbons(parsedMol: ParsedMol) {
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

      const oxygenIndex = getOtherAtom(singleBondedOxygen, carbon.atomIndex);
      const oxygenAtom = parsedMol.atoms[oxygenIndex];

      if (!oxygenAtom) return false;

      const oxygenHasHydrogen =
        countImplicitHydrogens(oxygenAtom, parsedMol.adjacency) > 0;

      return hasCarbonylOxygen && oxygenHasHydrogen;
    })
    .map((atom) => atom.atomIndex);
}

export function getFeatureLocantsFromCarbonIndexes(
  parent: ParentDescriptor,
  carbonIndexes: number[]
) {
  const locantMap = getLocantMap(parent);

  return carbonIndexes
    .map((atomIndex) => locantMap.get(atomIndex))
    .filter((locant): locant is number => typeof locant === "number")
    .sort((a, b) => a - b);
}

export function getEsterGroups(parsedMol: ParsedMol, parent?: ParentDescriptor) {
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

    // Do not classify anhydrides as esters.
    // Ester:      C(=O)-O-C
    // Anhydride:  C(=O)-O-C(=O)
    if (
      isAnhydrideBridgeOxygen(
        parsedMol,
        oxygenIndex,
        carbon.atomIndex
      )
    ) {
      continue;
    }

    const alkylCarbonBond = (parsedMol.adjacency.get(oxygenIndex) ?? []).find(
      (bond) => {
        const other = getOtherAtom(bond, oxygenIndex);
        if (other === carbon.atomIndex) return false;
        return parsedMol.atoms[other]?.element === "C";
      }
    );

    if (!alkylCarbonBond) continue;

    const alkylCarbonIndex = getOtherAtom(alkylCarbonBond, oxygenIndex);

    const alkylName = buildBranchName(
      parsedMol,
      alkylCarbonIndex,
      oxygenIndex
    ).name;

    const attachmentCarbonBond = bonds.find((bond) => {
      const other = getOtherAtom(bond, carbon.atomIndex);
      return parsedMol.atoms[other]?.element === "C";
    });

    const attachmentCarbonIndex = attachmentCarbonBond
      ? getOtherAtom(attachmentCarbonBond, carbon.atomIndex)
      : carbon.atomIndex;

    esters.push({
      carbonIndex: carbon.atomIndex,
      alkylName,
      alkoxyName: alkylNameToAlkoxyName(alkylName),
      attachmentLocant: locantMap.get(attachmentCarbonIndex) ?? 1,
    });
  }

  return esters;
}

export function getAlcoholLocants(
  parsedMol: ParsedMol,
  parent: ParentDescriptor
) {
  const locantMap = getLocantMap(parent);
  const locants: number[] = [];

  for (const oxygen of parsedMol.atoms.filter((atom) => atom.element === "O")) {
    const carbonIndex = getHydroxyBearingCarbon(
      parsedMol,
      oxygen.atomIndex
    );

    if (carbonIndex === null) continue;

    const locant = locantMap.get(carbonIndex);

    if (locant) {
      locants.push(locant);
    }
  }

  return locants.sort((a, b) => a - b);
}

export function getAmineLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
  const locantMap = getLocantMap(parent);
  const locants: number[] = [];

  for (const nitrogen of parsedMol.atoms.filter((atom) => atom.element === "N")) {
    if (!isSimpleAmineNitrogen(parsedMol, nitrogen.atomIndex)) continue;

    for (const bond of parsedMol.adjacency.get(nitrogen.atomIndex) ?? []) {
      if (bond.bondOrder !== 1) continue;
      const carbonIndex = getOtherAtom(bond, nitrogen.atomIndex);
      if (parsedMol.atoms[carbonIndex]?.element !== "C") continue;

      const locant = locantMap.get(carbonIndex);
      if (locant) locants.push(locant);
    }
  }

  return Array.from(new Set(locants)).sort((a, b) => a - b);
}

export function getThiolLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
  const locantMap = getLocantMap(parent);
  const locants: number[] = [];

  for (const sulfur of parsedMol.atoms.filter((atom) => atom.element === "S")) {
    const bonds = parsedMol.adjacency.get(sulfur.atomIndex) ?? [];

    // A thiol sulfur is R-SH. Previously every sulfur attached to carbon was
    // treated as a thiol, which mislabeled thioethers, sulfoxides, sulfones,
    // disulfides, and sulfonyl derivatives. Requiring an available implicit
    // hydrogen cleanly separates the -SH motif from those groups.
    if (bonds.some((bond) => bond.bondOrder > 1)) continue;
    if (countImplicitHydrogens(sulfur, parsedMol.adjacency) < 1) continue;

    const carbonBonds = bonds.filter((bond) => {
      const carbonIndex = getOtherAtom(bond, sulfur.atomIndex);
      return bond.bondOrder === 1 && parsedMol.atoms[carbonIndex]?.element === "C";
    });

    if (carbonBonds.length !== 1) continue;

    const carbonIndex = getOtherAtom(carbonBonds[0], sulfur.atomIndex);
    const locant = locantMap.get(carbonIndex);
    if (locant) locants.push(locant);
  }

  return Array.from(new Set(locants)).sort((a, b) => a - b);
}

export function getNitrileLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
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

export function getAmideLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
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
    if (isAcylAzideCarbon(parsedMol, carbon.atomIndex)) continue;

    const locant = locantMap.get(carbon.atomIndex);
    if (locant) locants.push(locant);
  }

  return locants.sort((a, b) => a - b);
}

export function getAcidHalideGroups(
  parsedMol: ParsedMol,
  parent?: ParentDescriptor
) {
  const acidHalides: {
    carbonIndex: number;
    halogen: "F" | "Cl" | "Br" | "I";
    halideName: string;
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

    const halogenBond = bonds.find((bond) => {
      const otherAtom = parsedMol.atoms[getOtherAtom(bond, carbon.atomIndex)];

      return (
        bond.bondOrder === 1 &&
        ["F", "Cl", "Br", "I"].includes(otherAtom?.element ?? "")
      );
    });

    if (!halogenBond) continue;

    const halogenIndex = getOtherAtom(halogenBond, carbon.atomIndex);
    const halogen = parsedMol.atoms[halogenIndex]?.element as
      | "F"
      | "Cl"
      | "Br"
      | "I"
      | undefined;

    if (!halogen) continue;

    const attachmentCarbonBond = bonds.find((bond) => {
      const other = getOtherAtom(bond, carbon.atomIndex);
      return parsedMol.atoms[other]?.element === "C";
    });

    const attachmentCarbonIndex = attachmentCarbonBond
      ? getOtherAtom(attachmentCarbonBond, carbon.atomIndex)
      : carbon.atomIndex;

    const halideName =
      halogen === "F"
        ? "fluoride"
        : halogen === "Cl"
        ? "chloride"
        : halogen === "Br"
        ? "bromide"
        : "iodide";

    acidHalides.push({
      carbonIndex: carbon.atomIndex,
      halogen,
      halideName,
      attachmentLocant: locantMap.get(attachmentCarbonIndex) ?? 1,
    });
  }

  return acidHalides;
}


function getDoubleBondedElementCount(
  parsedMol: ParsedMol,
  atomIndex: number,
  element: string
) {
  return (parsedMol.adjacency.get(atomIndex) ?? []).filter((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, atomIndex)];
    return attached?.element === element && bond.bondOrder === 2;
  }).length;
}

function hasSingleBondedHydroxyOxygen(
  parsedMol: ParsedMol,
  atomIndex: number
) {
  return (parsedMol.adjacency.get(atomIndex) ?? []).some((bond) => {
    if (bond.bondOrder !== 1) return false;
    const oxygenIndex = getOtherAtom(bond, atomIndex);
    const oxygen = parsedMol.atoms[oxygenIndex];
    return (
      oxygen?.element === "O" &&
      countImplicitHydrogens(oxygen, parsedMol.adjacency) > 0
    );
  });
}

function hasSingleBondedElement(
  parsedMol: ParsedMol,
  atomIndex: number,
  element: string
) {
  return (parsedMol.adjacency.get(atomIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, atomIndex)];
    return bond.bondOrder === 1 && attached?.element === element;
  });
}

function getSulfurFunctionalLocants(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  predicate: (sulfurIndex: number) => boolean
) {
  const locantMap = getLocantMap(parent);
  const locants: number[] = [];

  for (const sulfur of parsedMol.atoms.filter((atom) => atom.element === "S")) {
    if (!predicate(sulfur.atomIndex)) continue;

    for (const bond of parsedMol.adjacency.get(sulfur.atomIndex) ?? []) {
      if (bond.bondOrder !== 1) continue;
      const carbonIndex = getOtherAtom(bond, sulfur.atomIndex);
      if (parsedMol.atoms[carbonIndex]?.element !== "C") continue;
      const locant = locantMap.get(carbonIndex);
      if (locant) locants.push(locant);
    }
  }

  return Array.from(new Set(locants)).sort((a, b) => a - b);
}

export function getSulfonicAcidLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
  return getSulfurFunctionalLocants(parsedMol, parent, (sulfurIndex) =>
    getDoubleBondedElementCount(parsedMol, sulfurIndex, "O") >= 2 &&
    hasSingleBondedHydroxyOxygen(parsedMol, sulfurIndex)
  );
}

export function getSulfinicAcidLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
  return getSulfurFunctionalLocants(parsedMol, parent, (sulfurIndex) =>
    getDoubleBondedElementCount(parsedMol, sulfurIndex, "O") === 1 &&
    hasSingleBondedHydroxyOxygen(parsedMol, sulfurIndex)
  );
}

export function getSulfenicAcidLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
  return getSulfurFunctionalLocants(parsedMol, parent, (sulfurIndex) =>
    getDoubleBondedElementCount(parsedMol, sulfurIndex, "O") === 0 &&
    hasSingleBondedHydroxyOxygen(parsedMol, sulfurIndex)
  );
}

export function getSulfonamideLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
  return getSulfurFunctionalLocants(parsedMol, parent, (sulfurIndex) =>
    getDoubleBondedElementCount(parsedMol, sulfurIndex, "O") >= 2 &&
    hasSingleBondedElement(parsedMol, sulfurIndex, "N")
  );
}

export function getImineLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
  const locantMap = getLocantMap(parent);
  const locants: number[] = [];

  for (const carbonIndex of parent.path) {
    if (parsedMol.atoms[carbonIndex]?.element !== "C") continue;

    const imineBond = (parsedMol.adjacency.get(carbonIndex) ?? []).find((bond) => {
      if (bond.bondOrder !== 2) return false;
      const nitrogenIndex = getOtherAtom(bond, carbonIndex);
      if (parsedMol.atoms[nitrogenIndex]?.element !== "N") return false;

      // Oximes, hydrazones, nitrones, etc. have an additional N-O or N-N
      // bond and are intentionally left to retained/descriptive naming.
      return !(parsedMol.adjacency.get(nitrogenIndex) ?? []).some((nBond) => {
        const attached = getOtherAtom(nBond, nitrogenIndex);
        if (attached === carbonIndex) return false;
        const element = parsedMol.atoms[attached]?.element;
        return element === "O" || element === "N";
      });
    });

    if (!imineBond) continue;
    const locant = locantMap.get(carbonIndex);
    if (locant) locants.push(locant);
  }

  return Array.from(new Set(locants)).sort((a, b) => a - b);
}

type ThioCarbonylKind =
  | "thiocarboxylicAcid"
  | "thioamide"
  | "thioaldehyde"
  | "thioketone";

function classifyThioCarbonylCarbon(
  parsedMol: ParsedMol,
  carbonIndex: number
): ThioCarbonylKind | null {
  if (parsedMol.atoms[carbonIndex]?.element !== "C") return null;
  const bonds = parsedMol.adjacency.get(carbonIndex) ?? [];

  const hasThiocarbonylSulfur = bonds.some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "S" && bond.bondOrder === 2;
  });
  if (!hasThiocarbonylSulfur) return null;

  const hasHydroxyOxygen = bonds.some((bond) => {
    if (bond.bondOrder !== 1) return false;
    const oxygenIndex = getOtherAtom(bond, carbonIndex);
    const oxygen = parsedMol.atoms[oxygenIndex];
    return oxygen?.element === "O" && countImplicitHydrogens(oxygen, parsedMol.adjacency) > 0;
  });
  if (hasHydroxyOxygen) return "thiocarboxylicAcid";

  const hasAmideNitrogen = bonds.some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return bond.bondOrder === 1 && attached?.element === "N";
  });
  if (hasAmideNitrogen) return "thioamide";

  const carbonNeighborCount = bonds.filter((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "C";
  }).length;

  if (carbonNeighborCount >= 2) return "thioketone";
  if (countImplicitHydrogens(parsedMol.atoms[carbonIndex], parsedMol.adjacency) > 0) {
    return "thioaldehyde";
  }

  return null;
}

export function getThioCarbonylLocants(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  kind: ThioCarbonylKind
) {
  const locantMap = getLocantMap(parent);
  return parent.path
    .filter((atomIndex) => classifyThioCarbonylCarbon(parsedMol, atomIndex) === kind)
    .map((atomIndex) => locantMap.get(atomIndex))
    .filter((locant): locant is number => typeof locant === "number")
    .sort((a, b) => a - b);
}

export function detectNamingFeatures(
  parsedMol: ParsedMol,
  parent: ParentDescriptor
): NamingFeature[] {
  const esterGroups = getEsterGroups(parsedMol, parent);
  const acidHalideGroups = getAcidHalideGroups(parsedMol, parent);

  const peroxyAcidLocants = getFeatureLocantsFromCarbonIndexes(
    parent,
    getPeroxyAcidCarbons(parsedMol)
  );

  const acidLocants = getFeatureLocantsFromCarbonIndexes(
    parent,
    getCarboxylicAcidCarbons(parsedMol)
  );

  const acylAzideLocants = getFeatureLocantsFromCarbonIndexes(
    parent,
    getAcylAzideCarbons(parsedMol)
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
  const sulfonicAcidLocants = getSulfonicAcidLocants(parsedMol, parent);
  const sulfinicAcidLocants = getSulfinicAcidLocants(parsedMol, parent);
  const sulfenicAcidLocants = getSulfenicAcidLocants(parsedMol, parent);
  const sulfonamideLocants = getSulfonamideLocants(parsedMol, parent);
  const imineLocants = getImineLocants(parsedMol, parent);
  const thiocarboxylicAcidLocants = getThioCarbonylLocants(parsedMol, parent, "thiocarboxylicAcid");
  const thioamideLocants = getThioCarbonylLocants(parsedMol, parent, "thioamide");
  const thioaldehydeLocants = getThioCarbonylLocants(parsedMol, parent, "thioaldehyde");
  const thioketoneLocants = getThioCarbonylLocants(parsedMol, parent, "thioketone");

  const features: NamingFeature[] = [];

  if (peroxyAcidLocants.length > 0) {
    features.push({
      type: "peroxyAcid",
      locants: peroxyAcidLocants,
      suffix: "peroxoic acid",
      prefix: "peroxy",
      priority: 0.8,
    });
  }

  if (acylAzideLocants.length > 0) {
    features.push({
      type: "acylAzide",
      locants: acylAzideLocants,
      suffix: "oyl azide",
      prefix: "azidocarbonyl",
      priority: 1.45,
    });
  }

  for (const acidHalide of acidHalideGroups) {
    const acidHalideLocants = getFeatureLocantsFromCarbonIndexes(parent, [
      acidHalide.carbonIndex,
    ]);

    if (acidHalideLocants.length === 0) continue;

    features.push({
      type: "acidChloride",
      locants: acidHalideLocants,
      suffix: `oyl ${acidHalide.halideName}`,
      prefix: `${acidHalide.halogen.toLowerCase()}carbonyl`,
      priority: 1.4,
    });
  }

  if (acidLocants.length > 0) {
    features.push({
      type: "carboxylicAcid",
      locants: acidLocants,
      suffix: "oic acid",
      prefix: "carboxy",
      priority: 1,
    });

    for (const ester of esterGroups) {
      const esterLocants = getFeatureLocantsFromCarbonIndexes(parent, [
        ester.carbonIndex,
      ]);

      if (esterLocants.length === 0) continue;

      features.push({
        type: "ester",
        locants: esterLocants,
        suffix: "oate",
        prefix: "alkoxycarbonyl",
        priority: 1,
        alkylName: ester.alkylName,
      });
    }
  } else {
    for (const ester of esterGroups) {
      const esterLocants = getFeatureLocantsFromCarbonIndexes(parent, [
        ester.carbonIndex,
      ]);

      if (esterLocants.length === 0) continue;

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

  if (sulfonicAcidLocants.length > 0) {
    features.push({
      type: "sulfonicAcid",
      locants: sulfonicAcidLocants,
      suffix: "sulfonic acid",
      prefix: "sulfo",
      priority: 0.9,
    });
  }

  if (sulfinicAcidLocants.length > 0) {
    features.push({
      type: "sulfinicAcid",
      locants: sulfinicAcidLocants,
      suffix: "sulfinic acid",
      prefix: "sulfino",
      priority: 1.1,
    });
  }

  if (sulfenicAcidLocants.length > 0) {
    features.push({
      type: "sulfenicAcid",
      locants: sulfenicAcidLocants,
      suffix: "sulfenic acid",
      prefix: "sulfenyl",
      priority: 6.5,
    });
  }

  if (sulfonamideLocants.length > 0) {
    features.push({
      type: "sulfonamide",
      locants: sulfonamideLocants,
      suffix: "sulfonamide",
      prefix: "sulfonamido",
      priority: 1.25,
    });
  }

  if (thiocarboxylicAcidLocants.length > 0) {
    features.push({
      type: "thiocarboxylicAcid",
      locants: thiocarboxylicAcidLocants,
      suffix: "thioic acid",
      prefix: "sulfanylcarbonyl",
      priority: 1.3,
    });
  }

  if (thioamideLocants.length > 0) {
    features.push({
      type: "thioamide",
      locants: thioamideLocants,
      suffix: "thioamide",
      prefix: "carbothioamido",
      priority: 1.6,
    });
  }

  if (thioaldehydeLocants.length > 0) {
    features.push({
      type: "thioaldehyde",
      locants: thioaldehydeLocants,
      suffix: "thial",
      prefix: "thioxo",
      priority: 2.2,
    });
  }

  if (thioketoneLocants.length > 0) {
    features.push({
      type: "thioketone",
      locants: thioketoneLocants,
      suffix: "thione",
      prefix: "thioxo",
      priority: 3.2,
    });
  }

  if (imineLocants.length > 0) {
    features.push({
      type: "imine",
      locants: imineLocants,
      suffix: "imine",
      prefix: "imino",
      priority: 5.5,
    });
  }

  return features.sort((a, b) => a.priority - b.priority);
}