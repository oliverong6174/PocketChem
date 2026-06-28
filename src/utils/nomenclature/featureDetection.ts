import type {
  NamingFeature,
  ParentDescriptor,
  ParsedAtom,
  ParsedBond,
  ParsedMol,
} from "./types";

import { CHAIN_PREFIXES, COMMON_VALENCES } from "./constants";
import { getOtherAtom } from "./molParser";

import {
  getLocantMap,
  isAldehydeCarbon,
  isKetoneCarbon,
} from "./parentSelection";

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

export function getAlkylSubtreeInfo(
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

export function getSimpleAlkylName(
  carbonCount: number,
  doubleLocants: number[] = []
) {
  const prefix = CHAIN_PREFIXES[carbonCount];

  if (!prefix) return "alkyl";

  if (doubleLocants.length === 1) {
    const locant = doubleLocants[0];
    return `${prefix}-${locant}-enyl`;
  }

  if (carbonCount === 1) return "methyl";
  if (carbonCount === 2) return "ethyl";
  if (carbonCount === 3) return "propyl";
  if (carbonCount === 4) return "butyl";

  return `${prefix}yl`;
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

export function getAlcoholLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
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

    if (carbonAlsoHasCarbonylOxygen) continue;

    const locant = locantMap.get(carbonIndex);
    if (locant) locants.push(locant);
  }

  return locants.sort((a, b) => a - b);
}

export function getAmineLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
  const locantMap = getLocantMap(parent);
  const locants: number[] = [];

  for (const nitrogen of parsedMol.atoms.filter((atom) => atom.element === "N")) {
    const bonds = parsedMol.adjacency.get(nitrogen.atomIndex) ?? [];

    const hasMultipleBond = bonds.some((bond) => bond.bondOrder > 1);
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

export function getThiolLocants(parsedMol: ParsedMol, parent: ParentDescriptor) {
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

export function detectNamingFeatures(
  parsedMol: ParsedMol,
  parent: ParentDescriptor
): NamingFeature[] {
  const esterGroups = getEsterGroups(parsedMol, parent);
  const acidHalideGroups = getAcidHalideGroups(parsedMol, parent);

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

  for (const acidHalide of acidHalideGroups) {
    const acidHalideLocants = getFeatureLocantsFromCarbonIndexes(parent, [
      acidHalide.carbonIndex,
    ]);

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