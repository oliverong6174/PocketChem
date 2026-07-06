import type { FunctionalGroupResult } from "../../functionalGroups/types";

import type {
  NamingFeature,
  ParentDescriptor,
  ParsedAtom,
  ParsedBond,
  ParsedMol,
} from "../types";

import { COMMON_VALENCES } from "../constants";
import { getOtherAtom } from "../molParser";
import { buildBranchName } from "../branch/branchConstructor";

export type AromaticSuffixContext = {
  suffixName: string;
  anchorAtom: number;
  representedExternalAtoms: ReadonlySet<number>;
  primaryFeature: NamingFeature;
};

type RingAttachedGroupMatch = {
  anchorAtom: number;
  externalAtom: number;
  representedExternalAtoms: Set<number>;
};

const HALIDE_NAMES: Record<string, string> = {
  F: "fluoride",
  Cl: "chloride",
  Br: "bromide",
  I: "iodide",
};

export function getAromaticSuffixContext(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  primaryGroup: FunctionalGroupResult | null
): AromaticSuffixContext | null {
  if (!parent.aromaticRing) return null;
  if (!primaryGroup) return null;

  const suffix = primaryGroup.suffix?.toLowerCase().replace(/^-/, "") ?? "";
  const groupName = primaryGroup.name.toLowerCase();

  if (suffix.includes("amide") || groupName.includes("amide")) {
    const match = findRingAttachedAcylGroup(parsedMol, parent, isAmideCarbon);

    if (match) {
      return makeContext(match, "benzamide", {
        type: "amide",
        suffix: "amide",
        prefix: "carbamoyl",
        priority: 1.5,
      });
    }
  }

  if (
    suffix.includes("oic acid") ||
    groupName.includes("carboxylic acid")
  ) {
    const match = findRingAttachedAcylGroup(
      parsedMol,
      parent,
      isCarboxylicAcidCarbon
    );

    if (match) {
      return makeContext(match, "benzoic acid", {
        type: "carboxylicAcid",
        suffix: "oic acid",
        prefix: "carboxy",
        priority: 1,
      });
    }
  }

  if (
    suffix.includes("oyl") ||
    groupName.includes("acid chloride") ||
    groupName.includes("acyl halide")
  ) {
    const match = findRingAttachedAcylGroup(
      parsedMol,
      parent,
      isAcidHalideCarbon
    );

    const halideName = match
      ? getAcidHalideName(parsedMol, match.externalAtom)
      : null;

    if (match && halideName) {
      return makeContext(match, `benzoyl ${halideName}`, {
        type: "acidChloride",
        suffix: `oyl ${halideName}`,
        prefix: "halocarbonyl",
        priority: 1.4,
      });
    }
  }

  if (suffix === "al" || groupName.includes("aldehyde")) {
    const match = findRingAttachedAcylGroup(
      parsedMol,
      parent,
      isAldehydeCarbon
    );

    if (match) {
      return makeContext(match, "benzaldehyde", {
        type: "aldehyde",
        suffix: "al",
        prefix: "formyl",
        priority: 2,
      });
    }
  }

  if (
    suffix.includes("nitrile") ||
    suffix.includes("carbonitrile") ||
    groupName.includes("nitrile")
  ) {
    const match = findRingAttachedNitrileGroup(parsedMol, parent);

    if (match) {
      return makeContext(match, "benzonitrile", {
        type: "nitrile",
        suffix: "nitrile",
        prefix: "cyano",
        priority: 1.7,
      });
    }
  }

  if (suffix.includes("oate") || groupName.includes("ester")) {
    const match = findRingAttachedAcylGroup(parsedMol, parent, isEsterCarbon);
    const alkylName = match
      ? getEsterAlkylName(parsedMol, match.externalAtom)
      : null;

    if (match && alkylName) {
      return makeContext(match, `${alkylName} benzoate`, {
        type: "ester",
        suffix: "oate",
        prefix: "alkoxycarbonyl",
        priority: 1,
        alkylName,
      });
    }
  }

  return null;
}

export function orientAromaticParentForSuffix(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  context: AromaticSuffixContext
): ParentDescriptor {
  if (!parent.aromaticRing) return parent;

  return {
    ...parent,
    path: orientRingPathFromAnchor(
      parsedMol,
      parent.path,
      context.anchorAtom,
      context.representedExternalAtoms
    ),
  };
}

function makeContext(
  match: RingAttachedGroupMatch,
  suffixName: string,
  feature: Omit<NamingFeature, "locants">
): AromaticSuffixContext {
  return {
    suffixName,
    anchorAtom: match.anchorAtom,
    representedExternalAtoms: match.representedExternalAtoms,
    primaryFeature: {
      ...feature,
      locants: [1],
    },
  };
}

function findRingAttachedAcylGroup(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  predicate: (parsedMol: ParsedMol, carbonIndex: number) => boolean
): RingAttachedGroupMatch | null {
  const ringSet = new Set(parent.path);

  for (const ringAtom of parent.path) {
    for (const bond of parsedMol.adjacency.get(ringAtom) ?? []) {
      const other = getOtherAtom(bond, ringAtom);
      const otherAtom = parsedMol.atoms[other];

      if (!otherAtom) continue;
      if (ringSet.has(other)) continue;
      if (otherAtom.element !== "C") continue;
      if (!predicate(parsedMol, other)) continue;

      return {
        anchorAtom: ringAtom,
        externalAtom: other,
        representedExternalAtoms: collectExternalGroupAtoms(
          parsedMol,
          other,
          ringSet
        ),
      };
    }
  }

  return null;
}

function findRingAttachedNitrileGroup(
  parsedMol: ParsedMol,
  parent: ParentDescriptor
): RingAttachedGroupMatch | null {
  const ringSet = new Set(parent.path);

  for (const ringAtom of parent.path) {
    for (const bond of parsedMol.adjacency.get(ringAtom) ?? []) {
      const nitrileCarbon = getOtherAtom(bond, ringAtom);
      const carbonAtom = parsedMol.atoms[nitrileCarbon];

      if (!carbonAtom) continue;
      if (ringSet.has(nitrileCarbon)) continue;
      if (carbonAtom.element !== "C") continue;

      const hasTripleNitrogen = (
        parsedMol.adjacency.get(nitrileCarbon) ?? []
      ).some((candidate) => {
        const attached = getOtherAtom(candidate, nitrileCarbon);
        const attachedAtom = parsedMol.atoms[attached];

        return attachedAtom?.element === "N" && candidate.bondOrder === 3;
      });

      if (!hasTripleNitrogen) continue;

      return {
        anchorAtom: ringAtom,
        externalAtom: nitrileCarbon,
        representedExternalAtoms: collectExternalGroupAtoms(
          parsedMol,
          nitrileCarbon,
          ringSet
        ),
      };
    }
  }

  return null;
}

function collectExternalGroupAtoms(
  parsedMol: ParsedMol,
  rootAtom: number,
  blockedAtoms: Set<number>
) {
  const collected = new Set<number>([rootAtom]);

  for (const bond of parsedMol.adjacency.get(rootAtom) ?? []) {
    const other = getOtherAtom(bond, rootAtom);

    if (blockedAtoms.has(other)) continue;

    collected.add(other);
  }

  return collected;
}

function hasCarbonylOxygen(parsedMol: ParsedMol, carbonIndex: number) {
  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "O" && bond.bondOrder === 2;
  });
}

function isAmideCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "N" && bond.bondOrder === 1;
  });
}

function isCarboxylicAcidCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const oxygenIndex = getOtherAtom(bond, carbonIndex);
    const oxygen = parsedMol.atoms[oxygenIndex];

    return (
      oxygen?.element === "O" &&
      bond.bondOrder === 1 &&
      countImplicitHydrogens(oxygen, parsedMol.adjacency) > 0
    );
  });
}

function isAcidHalideCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  return Boolean(getAcidHalideName(parsedMol, carbonIndex));
}

function getAcidHalideName(parsedMol: ParsedMol, carbonIndex: number) {
  for (const bond of parsedMol.adjacency.get(carbonIndex) ?? []) {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];

    if (attached && HALIDE_NAMES[attached.element]) {
      return HALIDE_NAMES[attached.element];
    }
  }

  return null;
}

function isAldehydeCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  const carbon = parsedMol.atoms[carbonIndex];
  if (!carbon) return false;

  const carbonNeighborCount = (
    parsedMol.adjacency.get(carbonIndex) ?? []
  ).filter((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "C";
  }).length;

  return (
    carbonNeighborCount === 1 &&
    countImplicitHydrogens(carbon, parsedMol.adjacency) > 0
  );
}

function isEsterCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  return Boolean(getEsterAlkylName(parsedMol, carbonIndex));
}

function getEsterAlkylName(parsedMol: ParsedMol, carbonIndex: number) {
  const singleOxygenBond = (
    parsedMol.adjacency.get(carbonIndex) ?? []
  ).find((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "O" && bond.bondOrder === 1;
  });

  if (!singleOxygenBond) return null;

  const oxygenIndex = getOtherAtom(singleOxygenBond, carbonIndex);
  const oxygen = parsedMol.atoms[oxygenIndex];

  if (!oxygen) return null;

  if (countImplicitHydrogens(oxygen, parsedMol.adjacency) > 0) {
    return null;
  }

  const alkylBond = (parsedMol.adjacency.get(oxygenIndex) ?? []).find(
    (bond) => {
      const attached = getOtherAtom(bond, oxygenIndex);

      if (attached === carbonIndex) return false;

      return parsedMol.atoms[attached]?.element === "C";
    }
  );

  if (!alkylBond) return null;

  const alkylCarbon = getOtherAtom(alkylBond, oxygenIndex);

  return buildBranchName(parsedMol, alkylCarbon, oxygenIndex).name;
}

function orientRingPathFromAnchor(
  parsedMol: ParsedMol,
  ringPath: number[],
  anchorAtom: number,
  ignoredExternalAtoms: ReadonlySet<number>
) {
  const anchorIndex = ringPath.indexOf(anchorAtom);

  if (anchorIndex < 0) return ringPath;

  const rotated = [
    ...ringPath.slice(anchorIndex),
    ...ringPath.slice(0, anchorIndex),
  ];

  const reversed = [
    rotated[0],
    ...rotated.slice(1).reverse(),
  ];

  return compareRingOrientation(
    parsedMol,
    reversed,
    rotated,
    ignoredExternalAtoms
  ) < 0
    ? reversed
    : rotated;
}

function compareRingOrientation(
  parsedMol: ParsedMol,
  candidateA: number[],
  candidateB: number[],
  ignoredExternalAtoms: ReadonlySet<number>
) {
  const locantsA = getExternalSubstituentLocants(
    parsedMol,
    candidateA,
    ignoredExternalAtoms
  );

  const locantsB = getExternalSubstituentLocants(
    parsedMol,
    candidateB,
    ignoredExternalAtoms
  );

  return compareLocantLists(locantsA, locantsB);
}

function getExternalSubstituentLocants(
  parsedMol: ParsedMol,
  path: number[],
  ignoredExternalAtoms: ReadonlySet<number>
) {
  const ringSet = new Set(path);
  const locants: number[] = [];

  path.forEach((ringAtom, index) => {
    for (const bond of parsedMol.adjacency.get(ringAtom) ?? []) {
      const other = getOtherAtom(bond, ringAtom);

      if (ringSet.has(other)) continue;
      if (ignoredExternalAtoms.has(other)) continue;

      locants.push(index + 1);
    }
  });

  return locants.sort((a, b) => a - b);
}

function compareLocantLists(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i++) {
    const valueA = a[i] ?? Number.POSITIVE_INFINITY;
    const valueB = b[i] ?? Number.POSITIVE_INFINITY;

    if (valueA < valueB) return -1;
    if (valueA > valueB) return 1;
  }

  return 0;
}

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