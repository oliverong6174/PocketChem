import type {
  NamingFeature,
  ParentDescriptor,
  ParsedBond,
  ParsedMol,
  Substituent,
} from "./types";

import { getOtherAtom } from "./molParser";
import { getLocantMap } from "./graph/parentSelection";
import { buildBranchName } from "./branch/branchConstructor";
import { alkylNameToAlkoxyName } from "./alkoxyNames";

const HALOGEN_PREFIXES: Record<string, string> = {
  F: "fluoro",
  Cl: "chloro",
  Br: "bromo",
  I: "iodo",
};

function getAlkoxyName(
  parsedMol: ParsedMol,
  alkylCarbon: number,
  oxygenAtom: number
) {
  const branchName = buildBranchName(
    parsedMol,
    alkylCarbon,
    oxygenAtom
  ).name;

  return alkylNameToAlkoxyName(branchName);
}

function getNitrogenSubstituentName(parsedMol: ParsedMol, nitrogenAtom: number) {
  const nitrogenBonds = parsedMol.adjacency.get(nitrogenAtom) ?? [];

  const oxygenCount = nitrogenBonds.filter((nitrogenBond) => {
    const attached = getOtherAtom(nitrogenBond, nitrogenAtom);
    return parsedMol.atoms[attached]?.element === "O";
  }).length;

  return oxygenCount >= 2 ? "nitro" : "amino";
}

export function detectSubstituents(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  features: NamingFeature[] = [],
  ignoredExternalAtoms: ReadonlySet<number> = new Set()
): Substituent[] {
  const parentSet = new Set(parent.path);
  const locants = getLocantMap(parent);
  const substituents: Substituent[] = [];

  for (const parentAtom of parent.path) {
    for (const bond of parsedMol.adjacency.get(parentAtom) ?? []) {
      const other = getOtherAtom(bond, parentAtom);
      if (ignoredExternalAtoms.has(other)) continue;

      if (parentSet.has(other)) continue;
      if (
        shouldSkipSubstituentForParent(
          parsedMol,
          parent,
          parentAtom,
          other,
          bond,
          features
        )
      ) {
        continue;
      }

      const atom = parsedMol.atoms[other];
      if (!atom) continue;

      const locant = locants.get(parentAtom) ?? 0;

      if (atom.element === "C") {
        const branch = buildBranchName(parsedMol, other, parentAtom);

        substituents.push({
          name: branch.name,
          locant,
        });

        continue;
      }

      if (atom.element === "N") {
        substituents.push({
          name: getNitrogenSubstituentName(parsedMol, other),
          locant,
        });

        continue;
      }

      if (atom.element === "O") {
        if (bond.bondOrder !== 1) continue;

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
  parent: ParentDescriptor,
  parentAtom: number,
  otherAtom: number,
  connectingBond: ParsedBond,
  features: NamingFeature[]
) {
  const other = parsedMol.atoms[otherAtom];
  if (!other) return false;

  const locant = getLocantMap(parent).get(parentAtom);

  if (
    locant &&
    isAlreadyRepresentedByNamingFeature(
      parsedMol,
      parentAtom,
      otherAtom,
      connectingBond,
      locant,
      features
    )
  ) {
    return true;
  }

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

function isAlreadyRepresentedByNamingFeature(
  parsedMol: ParsedMol,
  parentAtom: number,
  otherAtom: number,
  connectingBond: ParsedBond,
  locant: number,
  features: NamingFeature[]
) {
  return features.some((feature) => {
    if (!feature.locants.includes(locant)) return false;

    if (feature.type === "alcohol") {
      return isHydroxySubstituent(
        parsedMol,
        parentAtom,
        otherAtom,
        connectingBond
      );
    }

    if (feature.type === "thiol") {
      return isThiolSubstituent(
        parsedMol,
        parentAtom,
        otherAtom,
        connectingBond
      );
    }

    if (feature.type === "amine") {
      return isAmineSubstituent(
        parsedMol,
        parentAtom,
        otherAtom,
        connectingBond
      );
    }

    if (feature.type === "ester") {
      return isEsterAlkoxySubstituent(
        parsedMol,
        parentAtom,
        otherAtom,
        connectingBond
      );
    }

    if (feature.type === "carboxylicAcid") {
      return isCarboxylicAcidHydroxySubstituent(
        parsedMol,
        parentAtom,
        otherAtom,
        connectingBond
      );
    }

    if (feature.type === "amide") {
      return isAmideNitrogenSubstituent(
        parsedMol,
        parentAtom,
        otherAtom,
        connectingBond
      );
    }

    if (feature.type === "acidChloride") {
      return isAcidHalideSubstituent(
        parsedMol,
        otherAtom,
        connectingBond
      );
    }

    return false;
  });
}

function isHydroxySubstituent(
  parsedMol: ParsedMol,
  parentAtom: number,
  otherAtom: number,
  connectingBond: ParsedBond
) {
  if (connectingBond.bondOrder !== 1) return false;
  if (parsedMol.atoms[otherAtom]?.element !== "O") return false;

  const oxygenBonds = parsedMol.adjacency.get(otherAtom) ?? [];

  return oxygenBonds.every((bond) => {
    const attached = getOtherAtom(bond, otherAtom);
    return attached === parentAtom || parsedMol.atoms[attached]?.element !== "C";
  });
}

function isThiolSubstituent(
  parsedMol: ParsedMol,
  parentAtom: number,
  otherAtom: number,
  connectingBond: ParsedBond
) {
  if (connectingBond.bondOrder !== 1) return false;
  if (parsedMol.atoms[otherAtom]?.element !== "S") return false;

  const sulfurBonds = parsedMol.adjacency.get(otherAtom) ?? [];

  return sulfurBonds.every((bond) => {
    const attached = getOtherAtom(bond, otherAtom);
    return attached === parentAtom || parsedMol.atoms[attached]?.element !== "C";
  });
}

function isAmineSubstituent(
  parsedMol: ParsedMol,
  parentAtom: number,
  otherAtom: number,
  connectingBond: ParsedBond
) {
  if (connectingBond.bondOrder !== 1) return false;
  if (parsedMol.atoms[otherAtom]?.element !== "N") return false;

  const nitrogenBonds = parsedMol.adjacency.get(otherAtom) ?? [];
  const attachedCarbons = nitrogenBonds.filter((bond) => {
    const attached = getOtherAtom(bond, otherAtom);
    return parsedMol.atoms[attached]?.element === "C";
  });

  return attachedCarbons.length === 1 &&
    getOtherAtom(attachedCarbons[0], otherAtom) === parentAtom;
}

function carbonHasCarbonylOxygen(parsedMol: ParsedMol, carbonAtom: number) {
  return (parsedMol.adjacency.get(carbonAtom) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonAtom)];
    return attached?.element === "O" && bond.bondOrder === 2;
  });
}

function isEsterAlkoxySubstituent(
  parsedMol: ParsedMol,
  parentAtom: number,
  otherAtom: number,
  connectingBond: ParsedBond
) {
  if (connectingBond.bondOrder !== 1) return false;
  if (parsedMol.atoms[parentAtom]?.element !== "C") return false;
  if (parsedMol.atoms[otherAtom]?.element !== "O") return false;
  if (!carbonHasCarbonylOxygen(parsedMol, parentAtom)) return false;

  const oxygenBonds = parsedMol.adjacency.get(otherAtom) ?? [];

  return oxygenBonds.some((bond) => {
    const attached = getOtherAtom(bond, otherAtom);

    if (attached === parentAtom) return false;

    return parsedMol.atoms[attached]?.element === "C";
  });
}

function isCarboxylicAcidHydroxySubstituent(
  parsedMol: ParsedMol,
  parentAtom: number,
  otherAtom: number,
  connectingBond: ParsedBond
) {
  if (connectingBond.bondOrder !== 1) return false;
  if (parsedMol.atoms[parentAtom]?.element !== "C") return false;
  if (parsedMol.atoms[otherAtom]?.element !== "O") return false;

  return carbonHasCarbonylOxygen(parsedMol, parentAtom);
}

function isAmideNitrogenSubstituent(
  parsedMol: ParsedMol,
  parentAtom: number,
  otherAtom: number,
  connectingBond: ParsedBond
) {
  if (connectingBond.bondOrder !== 1) return false;
  if (parsedMol.atoms[parentAtom]?.element !== "C") return false;
  if (parsedMol.atoms[otherAtom]?.element !== "N") return false;

  return carbonHasCarbonylOxygen(parsedMol, parentAtom);
}

function isAcidHalideSubstituent(
  parsedMol: ParsedMol,
  otherAtom: number,
  connectingBond: ParsedBond
) {
  if (connectingBond.bondOrder !== 1) return false;

  const element = parsedMol.atoms[otherAtom]?.element;

  return (
    element === "F" ||
    element === "Cl" ||
    element === "Br" ||
    element === "I"
  );
}

export function hasComplexSubstituent(substituents: Substituent[]) {
  return substituents.some((sub) => isComplexSubstituentName(sub.name));
}

function isComplexSubstituentName(name: string) {
  return name.includes("-") || name.includes(",") || name.includes("(");
}