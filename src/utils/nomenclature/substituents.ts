import type {
  NamingFeature,
  ParentDescriptor,
  ParsedBond,
  ParsedMol,
  Substituent,
} from "./types";

import type { FunctionalGroupResult } from "../functionalGroups/types";

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
  ignoredExternalAtoms: ReadonlySet<number> = new Set(),
  primaryGroup: FunctionalGroupResult | null = null
): Substituent[] {
  const parentSet = new Set(parent.path);
  const locants = getLocantMap(parent);
  const substituents: Substituent[] = [];

 for (const parentAtom of parent.path) {
  for (const bond of parsedMol.adjacency.get(parentAtom) ?? []) {
    const other = getOtherAtom(bond, parentAtom);

    if (ignoredExternalAtoms.has(other)) continue;
    if (parentSet.has(other)) continue;

    const atom = parsedMol.atoms[other];
    if (!atom) continue;

    const locant = locants.get(parentAtom) ?? 0;

    const ownedNitrogenSubstituents = getOwnedNitrogenSuffixSubstituents(
      parsedMol,
      parentAtom,
      other,
      bond,
      locant,
      features
    );

    if (ownedNitrogenSubstituents.length > 0) {
      substituents.push(...ownedNitrogenSubstituents);
      continue;
    }

    if (
      shouldSkipSubstituentForParent(
        parsedMol,
        parent,
        parentAtom,
        other,
        bond,
        features,
        primaryGroup
      )
    ) {
      continue;
    }

      if (atom.element === "C") {
        const functionalCarbonName = getCarbonFunctionalSubstituentName(
          parsedMol,
          other,
          parentAtom
        );

        if (functionalCarbonName) {
          substituents.push({
            name: functionalCarbonName,
            locant,
          });

          continue;
        }

        const ownedNitrogenSubstituents = getOwnedNitrogenSuffixSubstituents(
          parsedMol,
          parentAtom,
          other,
          bond,
          locant,
          features
        );

        if (ownedNitrogenSubstituents.length > 0) {
          substituents.push(...ownedNitrogenSubstituents);
          continue;
        }

        const branch = buildBranchName(parsedMol, other, parentAtom);

        substituents.push({
          name: branch.name,
          locant,
        });

        continue;
      }

      if (atom.element === "N") {
        // Nitrile, imine, azo, etc. nitrogens are not amino substituents.
        if (bond.bondOrder > 1) continue;

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

function getOwnedNitrogenSuffixSubstituents(
  parsedMol: ParsedMol,
  parentAtom: number,
  nitrogenAtom: number,
  connectingBond: ParsedBond,
  parentLocant: number,
  features: NamingFeature[]
): Substituent[] {
  if (connectingBond.bondOrder !== 1) return [];
  if (parsedMol.atoms[nitrogenAtom]?.element !== "N") return [];

  const ownsNitrogen = features.some((feature) => {
    if (!feature.locants.includes(parentLocant)) return false;

    return feature.type === "amine" || feature.type === "amide";
  });

  if (!ownsNitrogen) return [];

  const substituents: Substituent[] = [];

  for (const nitrogenBond of parsedMol.adjacency.get(nitrogenAtom) ?? []) {
    const attached = getOtherAtom(nitrogenBond, nitrogenAtom);

    if (attached === parentAtom) continue;
    if (nitrogenBond.bondOrder !== 1) continue;

    const attachedAtom = parsedMol.atoms[attached];

    if (attachedAtom?.element !== "C") continue;

    const branch = buildBranchName(parsedMol, attached, nitrogenAtom);

    substituents.push({
      name: branch.name,
      locant: "N",
    });
  }

  return substituents;
}

function getCarbonFunctionalSubstituentName(
  parsedMol: ParsedMol,
  carbonIndex: number,
  parentAtom: number
) {
  if (isNitrileSubstituentCarbon(parsedMol, carbonIndex)) return "cyano";

  const bonds = parsedMol.adjacency.get(carbonIndex) ?? [];

  const hasCarbonylOxygen = bonds.some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "O" && bond.bondOrder === 2;
  });

  if (!hasCarbonylOxygen) return null;

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
    const alkylName = buildBranchName(parsedMol, alkylCarbon, carbonIndex).name;

    if (alkylName === "methyl") return "acetyl";
    if (alkylName === "ethyl") return "propanoyl";

    return `${alkylName}carbonyl`;
  }

  return "formyl";
}

function isNitrileSubstituentCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  const carbon = parsedMol.atoms[carbonIndex];

  if (!carbon || carbon.element !== "C") return false;

  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "N" && bond.bondOrder === 3;
  });
}

function shouldSkipSubstituentForParent(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  parentAtom: number,
  otherAtom: number,
  connectingBond: ParsedBond,
  features: NamingFeature[],
  primaryGroup: FunctionalGroupResult | null = null
) {
  const other = parsedMol.atoms[otherAtom];
  if (!other) return false;

  const locant = getLocantMap(parent).get(parentAtom);

    if (
      isAnhydridePrimaryGroup(primaryGroup) &&
      isAnhydrideBridgeSubstituent(
        parsedMol,
        parentAtom,
        otherAtom,
        connectingBond
      )
    ) {
      return true;
    }

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

    if (feature.type === "nitrile") {
      return isNitrileNitrogenSubstituent(
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

  return nitrogenBonds.some((bond) => {
    const attached = getOtherAtom(bond, otherAtom);

    return attached === parentAtom;
  });
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

function isAnhydridePrimaryGroup(
  primaryGroup: FunctionalGroupResult | null
) {
  if (!primaryGroup) return false;

  const name = primaryGroup.name.trim().toLowerCase();
  const suffix = primaryGroup.suffix?.trim().toLowerCase() ?? "";

  return name.includes("anhydride") || suffix.includes("anhydride");
}

function isAnhydrideBridgeSubstituent(
  parsedMol: ParsedMol,
  parentAtom: number,
  otherAtom: number,
  connectingBond: ParsedBond
) {
  if (connectingBond.bondOrder !== 1) return false;
  if (parsedMol.atoms[parentAtom]?.element !== "C") return false;
  if (parsedMol.atoms[otherAtom]?.element !== "O") return false;
  if (!carbonHasCarbonylOxygen(parsedMol, parentAtom)) return false;

  const oxygenCarbonylNeighbors = (
    parsedMol.adjacency.get(otherAtom) ?? []
  )
    .filter((bond) => bond.bondOrder === 1)
    .map((bond) => getOtherAtom(bond, otherAtom))
    .filter((atomIndex) => {
      const atom = parsedMol.atoms[atomIndex];

      return (
        atom?.element === "C" &&
        carbonHasCarbonylOxygen(parsedMol, atomIndex)
      );
    });

  return (
    oxygenCarbonylNeighbors.includes(parentAtom) &&
    oxygenCarbonylNeighbors.length >= 2
  );
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

function isNitrileNitrogenSubstituent(
  parsedMol: ParsedMol,
  parentAtom: number,
  otherAtom: number,
  connectingBond: ParsedBond
) {
  if (connectingBond.bondOrder !== 3) return false;
  if (parsedMol.atoms[parentAtom]?.element !== "C") return false;
  if (parsedMol.atoms[otherAtom]?.element !== "N") return false;

  return true;
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