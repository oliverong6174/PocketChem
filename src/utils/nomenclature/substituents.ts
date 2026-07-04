import type {
  ParentDescriptor,
  ParsedMol,
  Substituent,
} from "./types";

import { CHAIN_PREFIXES } from "./constants";
import { getOtherAtom } from "./molParser";
import { getLocantMap } from "./graph/parentSelection";
import { getAlkylSubtreeInfo } from "./featureDetection";

const HALOGEN_PREFIXES: Record<string, string> = {
  F: "fluoro",
  Cl: "chloro",
  Br: "bromo",
  I: "iodo",
};

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

export function getAlkylBaseName(
  carbonCount: number,
  attachmentLocant: number
) {
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

export function collectBranchCarbons(
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

export function getLongestBranchParentPath(
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

export function orientBranchPathForAttachment(
  path: number[],
  attachmentAtom: number
) {
  const forwardLocant = path.indexOf(attachmentAtom) + 1;
  const reversePath = [...path].reverse();
  const reverseLocant = reversePath.indexOf(attachmentAtom) + 1;

  return reverseLocant < forwardLocant ? reversePath : path;
}

function formatMiniSubstituents(substituents: Substituent[]) {
  if (substituents.length === 0) return "";

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
      return {
        text: `${locants.join(",")}-${multiplier}${name}`,
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

function getBranchLocantMap(path: number[]) {
  const locants = new Map<number, number>();

  path.forEach((atomIndex, index) => {
    locants.set(atomIndex, index + 1);
  });

  return locants;
}

function detectBranchInternalSubstituents(
  parsedMol: ParsedMol,
  branchAtoms: Set<number>,
  branchPath: number[]
): Substituent[] {
  const branchPathSet = new Set(branchPath);
  const locants = getBranchLocantMap(branchPath);
  const miniSubstituents: Substituent[] = [];

  for (const branchAtom of branchPath) {
    const locant = locants.get(branchAtom) ?? 0;

    for (const bond of parsedMol.adjacency.get(branchAtom) ?? []) {
      const other = getOtherAtom(bond, branchAtom);
      const otherAtom = parsedMol.atoms[other];

      if (!otherAtom) continue;

      const halogenName = HALOGEN_PREFIXES[otherAtom.element];

      if (halogenName) {
        miniSubstituents.push({
          name: halogenName,
          locant,
        });

        continue;
      }

      if (otherAtom.element === "C") {
        if (!branchAtoms.has(other)) continue;
        if (branchPathSet.has(other)) continue;

        const miniBranchAtoms = collectBranchCarbons(
          parsedMol,
          other,
          branchAtom
        );

        miniSubstituents.push({
          name: getAlkylBaseName(miniBranchAtoms.size, 1),
          locant,
        });

        continue;
      }

      if (otherAtom.element === "O") {
        miniSubstituents.push({
          name: "hydroxy",
          locant,
        });

        continue;
      }

      if (otherAtom.element === "S") {
        miniSubstituents.push({
          name: "sulfanyl",
          locant,
        });

        continue;
      }

      if (otherAtom.element === "N") {
        miniSubstituents.push({
          name: "amino",
          locant,
        });
      }
    }
  }

  return miniSubstituents;
}

export function getCarbonBranchInfo(
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

  const attachmentLocant = branchPath.indexOf(startAtom) + 1;
  const baseName = getAlkylBaseName(branchPath.length, attachmentLocant);

  const miniSubstituents = detectBranchInternalSubstituents(
    parsedMol,
    branchAtoms,
    branchPath
  );

  const prefixString = formatMiniSubstituents(miniSubstituents);

  return {
    carbonCount: branchAtoms.size,
    name: prefixString ? `${prefixString}${baseName}` : baseName,
  };
}

function getAlkoxyName(
  parsedMol: ParsedMol,
  alkylCarbon: number,
  oxygenAtom: number
) {
  const alkylInfo = getAlkylSubtreeInfo(
    parsedMol,
    alkylCarbon,
    oxygenAtom
  );

  if (alkylInfo.carbonCount === 1) return "methoxy";
  if (alkylInfo.carbonCount === 2) return "ethoxy";
  if (alkylInfo.carbonCount === 3) return "propoxy";
  if (alkylInfo.carbonCount === 4) return "butoxy";

  return "alkoxy";
}

export function detectSubstituents(
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
      if (shouldSkipSubstituentForParent(parsedMol, parentAtom, other)) {
        continue;
      }

      const atom = parsedMol.atoms[other];
      if (!atom) continue;

      const locant = locants.get(parentAtom) ?? 0;

      if (atom.element === "C") {
        const branch = getCarbonBranchInfo(parsedMol, other, parentAtom);

        substituents.push({
          name: branch.name,
          locant,
        });

        continue;
      }

      if (atom.element === "N") {
        const nBonds = parsedMol.adjacency.get(other) ?? [];

        const oxygenCount = nBonds.filter((nBond) => {
          const attached = getOtherAtom(nBond, other);
          return parsedMol.atoms[attached]?.element === "O";
        }).length;

        substituents.push({
          name: oxygenCount >= 2 ? "nitro" : "amino",
          locant,
        });

        continue;
      }

      if (atom.element === "O") {
          if (atom.element === "O" && bond.bondOrder !== 1) {
            continue;
      }
        const oxygenBonds = parsedMol.adjacency.get(other) ?? [];

        const alkylBond = oxygenBonds.find((oxygenBond) => {
          const attached = getOtherAtom(oxygenBond, other);

          if (attached === parentAtom) return false;

          return parsedMol.atoms[attached]?.element === "C";
        });

        substituents.push({
          name: alkylBond
            ? getAlkoxyName(parsedMol, getOtherAtom(alkylBond, other), other)
            : "hydroxy",
          locant,
        });

        continue;
      }

      if (atom.element === "S") {
        substituents.push({
          name: "sulfanyl",
          locant,
        });

        continue;
      }

      const halogenName = HALOGEN_PREFIXES[atom.element];

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

function shouldSkipSubstituentForParent(
  parsedMol: ParsedMol,
  parentAtom: number,
  otherAtom: number
) {
  const other = parsedMol.atoms[otherAtom];
  if (!other) return false;

  if (other.element === "O") {
    const oxygenBonds = parsedMol.adjacency.get(otherAtom) ?? [];

    const attachedCarbonylCarbons = oxygenBonds
      .filter((bond) => bond.bondOrder === 1)
      .map((bond) => getOtherAtom(bond, otherAtom))
      .filter((atomIndex) => {
        const atom = parsedMol.atoms[atomIndex];
        if (atom?.element !== "C") return false;

        return (parsedMol.adjacency.get(atomIndex) ?? []).some((bond) => {
          const attached = parsedMol.atoms[getOtherAtom(bond, atomIndex)];
          return attached?.element === "O" && bond.bondOrder === 2;
        });
      });

    if (
      attachedCarbonylCarbons.length >= 2 &&
      attachedCarbonylCarbons.includes(parentAtom)
    ) {
      return true;
    }
  }

  return false;
}

export function formatSubstituents(substituents: Substituent[]) {
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

      return {
        text: `${locants.join(",")}-${multiplier}${name}`,
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

export function omitUnnecessaryRingLocant(
  name: string,
  parent: ParentDescriptor,
  substituentCount: number
) {
  if (parent.kind === "ring" && substituentCount === 1) {
    return name.replace(/^1-/, "");
  }

  return name;
}

export function hasComplexSubstituent(substituents: Substituent[]) {
  return substituents.some(
    (sub) =>
      sub.name.includes("-") ||
      sub.name.includes(",") ||
      (sub.name.includes("yl") && sub.name.length > 6)
  );
}