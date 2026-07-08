import type { ParsedBond, ParsedMol } from "../types";

import { CHAIN_PREFIXES } from "../constants";
import { getOtherAtom } from "../molParser";
import { alkylNameToAlkoxyName } from "../alkoxyNames";

type AromaticBranchResult = {
  name: string;
  ringPath: number[];
  carbonCount: number;
};

type AromaticBranchSubstituent = {
  name: string;
  locant: number;
};

const HALOGEN_PREFIXES: Record<string, string> = {
  F: "fluoro",
  Cl: "chloro",
  Br: "bromo",
  I: "iodo",
};

export function buildAromaticBranchName(
  parsedMol: ParsedMol,
  startAtom: number,
  blockedAtom: number
): AromaticBranchResult | null {
  const ringPath = findBenzeneLikeRingContainingAtom(
    parsedMol,
    startAtom,
    blockedAtom
  );

  if (!ringPath) return null;

  const orientedPath = orientAromaticBranchRingPath(
    parsedMol,
    ringPath,
    blockedAtom
  );

  const substituents = detectAromaticBranchSubstituents(
    parsedMol,
    orientedPath,
    blockedAtom
  );

  const prefixString = formatAromaticBranchSubstituents(substituents);

  return {
    name: `${prefixString}phenyl`,
    ringPath: orientedPath,
    carbonCount: orientedPath.length,
  };
}

function findBenzeneLikeRingContainingAtom(
  parsedMol: ParsedMol,
  startAtom: number,
  blockedAtom: number
) {
  const start = parsedMol.atoms[startAtom];

  if (start?.element !== "C") return null;

  const cycle = findSixMemberCarbonCycle(parsedMol, startAtom, blockedAtom);

  if (!cycle) return null;
  if (!isBenzeneLikePath(parsedMol, cycle)) return null;

  return cycle;
}

function findSixMemberCarbonCycle(
  parsedMol: ParsedMol,
  startAtom: number,
  blockedAtom: number
) {
  let found: number[] | null = null;

  const dfs = (current: number, path: number[]) => {
    if (found) return;

    if (path.length === 6) {
      const closesToStart = (parsedMol.adjacency.get(current) ?? []).some(
        (bond) => getOtherAtom(bond, current) === startAtom
      );

      if (closesToStart) {
        found = path;
      }

      return;
    }

    for (const bond of parsedMol.adjacency.get(current) ?? []) {
      const next = getOtherAtom(bond, current);

      if (next === blockedAtom) continue;
      if (next === startAtom) continue;
      if (path.includes(next)) continue;

      const nextAtom = parsedMol.atoms[next];

      if (nextAtom?.element !== "C") continue;

      dfs(next, [...path, next]);
    }
  };

  dfs(startAtom, [startAtom]);

  return found;
}

function getBondBetween(
  parsedMol: ParsedMol,
  atomA: number,
  atomB: number
) {
  return parsedMol.bonds.find(
    (bond) =>
      (bond.atomA === atomA && bond.atomB === atomB) ||
      (bond.atomA === atomB && bond.atomB === atomA)
  );
}

function isBenzeneLikePath(parsedMol: ParsedMol, path: number[]) {
  if (path.length !== 6) return false;

  const ringBonds: ParsedBond[] = [];

  for (let i = 0; i < path.length; i++) {
    const current = path[i];
    const next = path[(i + 1) % path.length];
    const bond = getBondBetween(parsedMol, current, next);

    if (!bond) return false;

    ringBonds.push(bond);
  }

  const aromaticBondCount = ringBonds.filter(
    (bond) => bond.bondOrder === 1.5
  ).length;

  const doubleBondCount = ringBonds.filter(
    (bond) => bond.bondOrder === 2
  ).length;

  return aromaticBondCount >= 5 || doubleBondCount === 3;
}

function orientAromaticBranchRingPath(
  parsedMol: ParsedMol,
  ringPath: number[],
  blockedAtom: number
) {
  const forward = ringPath;
  const reverse = [ringPath[0], ...ringPath.slice(1).reverse()];

  const forwardLocants = getExternalSubstituentLocants(
    parsedMol,
    forward,
    blockedAtom
  );

  const reverseLocants = getExternalSubstituentLocants(
    parsedMol,
    reverse,
    blockedAtom
  );

  return compareLocants(reverseLocants, forwardLocants) < 0
    ? reverse
    : forward;
}

function getExternalSubstituentLocants(
  parsedMol: ParsedMol,
  ringPath: number[],
  blockedAtom: number
) {
  const ringSet = new Set(ringPath);
  const locants: number[] = [];

  ringPath.forEach((ringAtom, index) => {
    for (const bond of parsedMol.adjacency.get(ringAtom) ?? []) {
      const other = getOtherAtom(bond, ringAtom);

      if (other === blockedAtom) continue;
      if (ringSet.has(other)) continue;

      locants.push(index + 1);
    }
  });

  return locants.sort((a, b) => a - b);
}

function detectAromaticBranchSubstituents(
  parsedMol: ParsedMol,
  ringPath: number[],
  blockedAtom: number
): AromaticBranchSubstituent[] {
  const ringSet = new Set(ringPath);
  const substituents: AromaticBranchSubstituent[] = [];

  ringPath.forEach((ringAtom, index) => {
    const locant = index + 1;

    for (const bond of parsedMol.adjacency.get(ringAtom) ?? []) {
      const other = getOtherAtom(bond, ringAtom);

      if (other === blockedAtom) continue;
      if (ringSet.has(other)) continue;

      const name = getAromaticBranchSubstituentName(
        parsedMol,
        ringAtom,
        other,
        bond
      );

      if (!name) continue;

      substituents.push({ name, locant });
    }
  });

  return substituents;
}

function getAromaticBranchSubstituentName(
  parsedMol: ParsedMol,
  ringAtom: number,
  substituentAtom: number,
  bond: ParsedBond
) {
  const atom = parsedMol.atoms[substituentAtom];
  if (!atom) return null;

  const halogenName = HALOGEN_PREFIXES[atom.element];
  if (halogenName) return halogenName;

  if (atom.element === "O") {
    if (bond.bondOrder !== 1) return null;

    const oxygenCarbonNeighbors = getSingleBondedCarbonNeighbors(
      parsedMol,
      substituentAtom
    );

    const alkylCarbon = oxygenCarbonNeighbors.find(
      (carbonIndex) => carbonIndex !== ringAtom
    );

    if (alkylCarbon !== undefined) {
      const alkylName = getSimpleCarbonSideChainName(
        parsedMol,
        alkylCarbon,
        substituentAtom
      );

      return alkylNameToAlkoxyName(alkylName);
    }

    return "hydroxy";
  }

  if (atom.element === "N") {
    return getNitrogenSubstituentName(parsedMol, substituentAtom);
  }

  if (atom.element === "S") {
    return "sulfanyl";
  }

  if (atom.element === "C") {
    const functionalCarbonName = getCarbonFunctionalSubstituentName(
      parsedMol,
      substituentAtom,
      ringAtom
    );

    if (functionalCarbonName) return functionalCarbonName;

    return getSimpleCarbonSideChainName(
      parsedMol,
      substituentAtom,
      ringAtom
    );
  }

  return null;
}

function getSingleBondedCarbonNeighbors(
  parsedMol: ParsedMol,
  atomIndex: number
) {
  return (parsedMol.adjacency.get(atomIndex) ?? [])
    .filter((bond) => bond.bondOrder === 1)
    .map((bond) => getOtherAtom(bond, atomIndex))
    .filter((attached) => parsedMol.atoms[attached]?.element === "C");
}

function getNitrogenSubstituentName(parsedMol: ParsedMol, nitrogenAtom: number) {
  const nitrogenBonds = parsedMol.adjacency.get(nitrogenAtom) ?? [];

  const oxygenCount = nitrogenBonds.filter((bond) => {
    const attached = getOtherAtom(bond, nitrogenAtom);
    return parsedMol.atoms[attached]?.element === "O";
  }).length;

  return oxygenCount >= 2 ? "nitro" : "amino";
}

function carbonHasCarbonylOxygen(parsedMol: ParsedMol, carbonIndex: number) {
  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "O" && bond.bondOrder === 2;
  });
}

function getCarbonFunctionalSubstituentName(
  parsedMol: ParsedMol,
  carbonIndex: number,
  parentAtom: number
) {
  if (isNitrileCarbon(parsedMol, carbonIndex)) return "cyano";

  if (!carbonHasCarbonylOxygen(parsedMol, carbonIndex)) return null;

  const bonds = parsedMol.adjacency.get(carbonIndex) ?? [];

  const singleOxygenBond = bonds.find((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "O" && bond.bondOrder === 1;
  });

  const singleNitrogenBond = bonds.find((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "N" && bond.bondOrder === 1;
  });

  const halogenBond = bonds.find((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];

    return (
      bond.bondOrder === 1 &&
      (attached?.element === "F" ||
        attached?.element === "Cl" ||
        attached?.element === "Br" ||
        attached?.element === "I")
    );
  });

  if (singleOxygenBond) {
    const oxygenIndex = getOtherAtom(singleOxygenBond, carbonIndex);

    const hasAlkylSide = (parsedMol.adjacency.get(oxygenIndex) ?? []).some(
      (bond) => {
        const attached = getOtherAtom(bond, oxygenIndex);

        return (
          attached !== carbonIndex &&
          parsedMol.atoms[attached]?.element === "C"
        );
      }
    );

    return hasAlkylSide ? "alkoxycarbonyl" : "carboxy";
  }

  if (singleNitrogenBond) return "carbamoyl";

  if (halogenBond) {
    const halogen = parsedMol.atoms[getOtherAtom(halogenBond, carbonIndex)]
      ?.element.toLowerCase();

    return halogen ? `${halogen}carbonyl` : "halocarbonyl";
  }

  const nonParentCarbonBond = bonds.find((bond) => {
    const attached = getOtherAtom(bond, carbonIndex);

    if (attached === parentAtom) return false;

    return parsedMol.atoms[attached]?.element === "C";
  });

  if (nonParentCarbonBond) {
    const alkylCarbon = getOtherAtom(nonParentCarbonBond, carbonIndex);
    const alkylName = getSimpleCarbonSideChainName(
      parsedMol,
      alkylCarbon,
      carbonIndex
    );

    if (alkylName === "methyl") return "acetyl";
    if (alkylName === "ethyl") return "propanoyl";

    return `${alkylName}carbonyl`;
  }

  return "formyl";
}

function isNitrileCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "N" && bond.bondOrder === 3;
  });
}

function collectCarbonSideAtoms(
  parsedMol: ParsedMol,
  startAtom: number,
  blockedAtom: number
) {
  const atoms = new Set<number>();

  const dfs = (atomIndex: number) => {
    if (atoms.has(atomIndex)) return;

    const atom = parsedMol.atoms[atomIndex];
    if (!atom || atom.element !== "C") return;

    atoms.add(atomIndex);

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

  return atoms;
}

function getLongestCarbonSidePath(
  parsedMol: ParsedMol,
  sideAtoms: Set<number>,
  attachmentAtom: number
) {
  let bestPath: number[] = [];

  const dfs = (
    current: number,
    visited: Set<number>,
    path: number[]
  ) => {
    if (path.includes(attachmentAtom) && path.length > bestPath.length) {
      bestPath = [...path];
    }

    for (const bond of parsedMol.adjacency.get(current) ?? []) {
      const next = getOtherAtom(bond, current);

      if (!sideAtoms.has(next)) continue;
      if (visited.has(next)) continue;

      visited.add(next);
      dfs(next, visited, [...path, next]);
      visited.delete(next);
    }
  };

  for (const atomIndex of sideAtoms) {
    dfs(atomIndex, new Set([atomIndex]), [atomIndex]);
  }

  return orientPathForAttachment(bestPath, attachmentAtom);
}

function orientPathForAttachment(path: number[], attachmentAtom: number) {
  const forwardLocant = path.indexOf(attachmentAtom) + 1;
  const reversePath = [...path].reverse();
  const reverseLocant = reversePath.indexOf(attachmentAtom) + 1;

  return reverseLocant < forwardLocant ? reversePath : path;
}

function getSimpleCarbonSideChainName(
  parsedMol: ParsedMol,
  startAtom: number,
  blockedAtom: number
) {
  const sideAtoms = collectCarbonSideAtoms(parsedMol, startAtom, blockedAtom);
  const path = getLongestCarbonSidePath(parsedMol, sideAtoms, startAtom);
  const prefix = CHAIN_PREFIXES[path.length || sideAtoms.size];

  if (!prefix) return "alkyl";

  const attachmentLocant = path.indexOf(startAtom) + 1 || 1;
  const { doubleLocants, tripleLocants } = getSideUnsaturation(
    parsedMol,
    path
  );

  if (doubleLocants.length === 0 && tripleLocants.length === 0) {
    if (path.length === 1) return "methyl";
    if (path.length === 2) return "ethyl";
    if (path.length === 3 && attachmentLocant === 1) return "propyl";
    if (path.length === 4 && attachmentLocant === 1) return "butyl";
    if (attachmentLocant === 1) return `${prefix}yl`;

    return `${prefix}an-${attachmentLocant}-yl`;
  }

  if (doubleLocants.length > 0 && tripleLocants.length === 0) {
    return `${prefix}-${doubleLocants.join(",")}-en-${attachmentLocant}-yl`;
  }

  if (tripleLocants.length > 0 && doubleLocants.length === 0) {
    return `${prefix}-${tripleLocants.join(",")}-yn-${attachmentLocant}-yl`;
  }

  return `${prefix}-${doubleLocants.join(",")}-en-${tripleLocants.join(",")}-yn-${attachmentLocant}-yl`;
}

function getSideUnsaturation(parsedMol: ParsedMol, path: number[]) {
  const doubleLocants: number[] = [];
  const tripleLocants: number[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const bond = getBondBetween(parsedMol, path[i], path[i + 1]);

    if (!bond) continue;

    if (bond.bondOrder === 2) doubleLocants.push(i + 1);
    if (bond.bondOrder === 3) tripleLocants.push(i + 1);
  }

  return { doubleLocants, tripleLocants };
}

function getMultiplier(count: number) {
  if (count === 2) return "di";
  if (count === 3) return "tri";
  if (count === 4) return "tetra";
  if (count === 5) return "penta";
  if (count === 6) return "hexa";
  return "";
}

function getPrefixSortKey(name: string) {
  return name
    .toLowerCase()
    .replace(/^(di|tri|tetra|penta|hexa|bis|tris)/, "");
}

function formatAromaticBranchSubstituents(
  substituents: AromaticBranchSubstituent[]
) {
  const groups = new Map<string, number[]>();

  for (const substituent of substituents) {
    const existing = groups.get(substituent.name) ?? [];
    existing.push(substituent.locant);
    groups.set(substituent.name, existing);
  }

  return Array.from(groups.entries())
    .map(([name, locants]) => {
      locants.sort((a, b) => a - b);

      return {
        text: `${locants.join(",")}-${getMultiplier(locants.length)}${name}`,
        sortKey: getPrefixSortKey(name),
        firstLocant: locants[0] ?? Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => {
      const alpha = a.sortKey.localeCompare(b.sortKey);
      if (alpha !== 0) return alpha;

      return a.firstLocant - b.firstLocant;
    })
    .map((entry) => entry.text)
    .join("-");
}

function compareLocants(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i++) {
    const valueA = a[i] ?? Number.POSITIVE_INFINITY;
    const valueB = b[i] ?? Number.POSITIVE_INFINITY;

    if (valueA < valueB) return -1;
    if (valueA > valueB) return 1;
  }

  return 0;
}