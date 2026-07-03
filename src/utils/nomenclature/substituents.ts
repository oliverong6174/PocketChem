import type {
  ParentDescriptor,
  ParsedMol,
  Substituent,
} from "./types";

import { CHAIN_PREFIXES } from "./constants";
import { getOtherAtom } from "./molParser";
import { getLocantMap } from "./parentSelection";
import { getAlkylSubtreeInfo } from "./featureDetection";

function getMultiplier(count: number) {
  if (count === 2) return "di";
  if (count === 3) return "tri";
  if (count === 4) return "tetra";
  if (count === 5) return "penta";
  if (count === 6) return "hexa";
  return "";
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
  const reverseLocant = [...path].reverse().indexOf(attachmentAtom) + 1;

  return reverseLocant < forwardLocant ? [...path].reverse() : path;
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

  const branchPathSet = new Set(branchPath);
  const attachmentLocant = branchPath.indexOf(startAtom) + 1;

  const miniSubstituents: Substituent[] = [];

  branchPath.forEach((branchAtom, index) => {
    for (const bond of parsedMol.adjacency.get(branchAtom) ?? []) {
      const other = getOtherAtom(bond, branchAtom);

      if (!branchAtoms.has(other)) continue;
      if (branchPathSet.has(other)) continue;

      const otherAtom = parsedMol.atoms[other];
      if (otherAtom?.element !== "C") continue;

      const miniBranchAtoms = collectBranchCarbons(
        parsedMol,
        other,
        branchAtom
      );

      miniSubstituents.push({
        name: getAlkylBaseName(miniBranchAtoms.size, 1),
        locant: index + 1,
      });
    }
  });

  const baseName = getAlkylBaseName(branchPath.length, attachmentLocant);
  const prefixString = formatSubstituents(miniSubstituents);

  const hasHalogenOnBranch = Array.from(branchAtoms).some((branchAtom) => {
    return (parsedMol.adjacency.get(branchAtom) ?? []).some((bond) => {
      const other = getOtherAtom(bond, branchAtom);
      const element = parsedMol.atoms[other]?.element;
      return ["F", "Cl", "Br", "I"].includes(element ?? "");
    });
  });

  if (branchAtoms.size === 1 && hasHalogenOnBranch) {
    const branchAtom = Array.from(branchAtoms)[0];

    const halogenBond = (parsedMol.adjacency.get(branchAtom) ?? []).find(
      (bond) => {
        const other = getOtherAtom(bond, branchAtom);
        const element = parsedMol.atoms[other]?.element;
        return ["F", "Cl", "Br", "I"].includes(element ?? "");
      }
    );

    const halogenElement = halogenBond
      ? parsedMol.atoms[getOtherAtom(halogenBond, branchAtom)]?.element
      : null;

    const halogenPrefix =
      halogenElement === "Br"
        ? "bromo"
        : halogenElement === "Cl"
        ? "chloro"
        : halogenElement === "F"
        ? "fluoro"
        : halogenElement === "I"
        ? "iodo"
        : "";

    return {
      carbonCount: branchAtoms.size,
      name: `${halogenPrefix}methyl`,
    };
  }

  return {
    carbonCount: branchAtoms.size,
    name: prefixString ? `${prefixString}${baseName}` : baseName,
  };
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
      }

      if (atom.element === "N") {
        const nBonds = parsedMol.adjacency.get(other) ?? [];

        const oxygenCount = nBonds.filter((bond) => {
          const attached = getOtherAtom(bond, other);
          return parsedMol.atoms[attached]?.element === "O";
        }).length;

        if (oxygenCount >= 2) {
          substituents.push({
            name: "nitro",
            locant,
          });

          continue;
        }
      }

      if (atom.element === "O") {
        const oxygenBonds = parsedMol.adjacency.get(other) ?? [];

        const alkylBond = oxygenBonds.find((oxygenBond) => {
          const attached = getOtherAtom(oxygenBond, other);

          if (attached === parentAtom) return false;

          return parsedMol.atoms[attached]?.element === "C";
        });

        if (alkylBond) {
          const alkylCarbon = getOtherAtom(alkylBond, other);

          const alkylInfo = getAlkylSubtreeInfo(
            parsedMol,
            alkylCarbon,
            other
          );

          const alkoxyName =
            alkylInfo.carbonCount === 1
              ? "methoxy"
              : alkylInfo.carbonCount === 2
              ? "ethoxy"
              : alkylInfo.carbonCount === 3
              ? "propoxy"
              : "alkoxy";

          substituents.push({
            name: alkoxyName,
            locant,
          });
        }
      }

      const halogenPrefixes: Record<string, string> = {
        F: "fluoro",
        Cl: "chloro",
        Br: "bromo",
        I: "iodo",
      };

      const halogenName = halogenPrefixes[atom.element];

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

  // Do not treat the anhydride bridge oxygen as alkoxy.
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

      return `${locants.join(",")}-${multiplier}${name}`;
    })
    .sort((a, b) => {
      const cleanA = a
        .replace(/^\d+(,\d+)*-/, "")
        .replace(/^(di|tri|tetra|penta|hexa)/, "");

      const cleanB = b
        .replace(/^\d+(,\d+)*-/, "")
        .replace(/^(di|tri|tetra|penta|hexa)/, "");

      return cleanA.localeCompare(cleanB);
    })
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