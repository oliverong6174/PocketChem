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
import { classifyOxygen } from "./classifiers/oxygen";
import { getNitrogenSubstituentPrefix } from "./classifiers/nitrogen";

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

function getNitrogenSubstituentName(
  parsedMol: ParsedMol,
  nitrogenAtom: number,
  parentAtom?: number
) {
  return getNitrogenSubstituentPrefix(parsedMol, nitrogenAtom, parentAtom);
}

function getSulfurSubstituentName(
  parsedMol: ParsedMol,
  sulfurAtom: number,
  parentAtom: number
) {
  const bonds = parsedMol.adjacency.get(sulfurAtom) ?? [];
  const doubleOCount = bonds.filter((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, sulfurAtom)];
    return attached?.element === "O" && bond.bondOrder === 2;
  }).length;

  const hydroxyOxygen = bonds.find((bond) => {
    if (bond.bondOrder !== 1) return false;
    const oxygenIndex = getOtherAtom(bond, sulfurAtom);
    if (parsedMol.atoms[oxygenIndex]?.element !== "O") return false;
    const orderSum = (parsedMol.adjacency.get(oxygenIndex) ?? []).reduce(
      (sum, candidate) => sum + candidate.bondOrder,
      0
    );
    return orderSum < 2;
  });

  if (doubleOCount >= 2 && hydroxyOxygen) return "sulfo";
  if (doubleOCount === 1 && hydroxyOxygen) return "sulfino";

  const nitrogenBond = bonds.find((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, sulfurAtom)];
    return bond.bondOrder === 1 && attached?.element === "N";
  });
  if (doubleOCount >= 2 && nitrogenBond) return "sulfonamido";

  const chlorineBond = bonds.find((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, sulfurAtom)];
    return bond.bondOrder === 1 && attached?.element === "Cl";
  });
  if (doubleOCount >= 2 && chlorineBond) return "chlorosulfonyl";

  const otherCarbonBond = bonds.find((bond) => {
    if (bond.bondOrder !== 1) return false;
    const attached = getOtherAtom(bond, sulfurAtom);
    return attached !== parentAtom && parsedMol.atoms[attached]?.element === "C";
  });

  if (otherCarbonBond) {
    const carbonIndex = getOtherAtom(otherCarbonBond, sulfurAtom);
    const branch = buildBranchName(parsedMol, carbonIndex, sulfurAtom).name;
    if (doubleOCount >= 2) return `${branch}sulfonyl`;
    if (doubleOCount === 1) return `${branch}sulfinyl`;
    return `${branch}sulfanyl`;
  }

  const sulfurBond = bonds.find((bond) => {
    const attached = getOtherAtom(bond, sulfurAtom);
    return bond.bondOrder === 1 && parsedMol.atoms[attached]?.element === "S";
  });

  if (sulfurBond) {
    const otherSulfur = getOtherAtom(sulfurBond, sulfurAtom);
    const carbonBond = (parsedMol.adjacency.get(otherSulfur) ?? []).find((bond) => {
      const attached = getOtherAtom(bond, otherSulfur);
      return attached !== sulfurAtom &&
        bond.bondOrder === 1 &&
        parsedMol.atoms[attached]?.element === "C";
    });

    if (carbonBond) {
      const carbonIndex = getOtherAtom(carbonBond, otherSulfur);
      const branch = buildBranchName(parsedMol, carbonIndex, otherSulfur).name;
      return `${branch}disulfanyl`;
    }
  }

  return "sulfanyl";
}

function getOxygenSubstituentName(
  parsedMol: ParsedMol,
  oxygenAtom: number,
  parentAtom: number
) {
  const classification = classifyOxygen(parsedMol, oxygenAtom);
  const oxygenBonds = parsedMol.adjacency.get(oxygenAtom) ?? [];

  if (!classification) return "oxy";

  if (classification.kind === "nitrateEster") return "nitrooxy";
  if (classification.kind === "sulfurOxygenEster") return "sulfonyloxy";
  if (classification.kind === "phosphateEster") return "phosphoryloxy";
  if (classification.kind === "silylEther") return "silyloxy";

  if (classification.kind === "peroxide") {
    const otherOxygenBond = oxygenBonds.find((bond) => {
      const attached = getOtherAtom(bond, oxygenAtom);
      return attached !== parentAtom && parsedMol.atoms[attached]?.element === "O";
    });

    if (otherOxygenBond) {
      const otherOxygen = getOtherAtom(otherOxygenBond, oxygenAtom);
      const peroxideCarbonBond = (parsedMol.adjacency.get(otherOxygen) ?? []).find(
        (bond) => {
          const attached = getOtherAtom(bond, otherOxygen);
          return attached !== oxygenAtom && parsedMol.atoms[attached]?.element === "C";
        }
      );

      if (peroxideCarbonBond) {
        const carbonIndex = getOtherAtom(peroxideCarbonBond, otherOxygen);
        const branch = buildBranchName(parsedMol, carbonIndex, otherOxygen).name;
        return `${branch}peroxy`;
      }
    }
    return "hydroperoxy";
  }

  if (classification.kind === "ether") {
    const alkylBond = oxygenBonds.find((bond) => {
      const attached = getOtherAtom(bond, oxygenAtom);
      return attached !== parentAtom && parsedMol.atoms[attached]?.element === "C";
    });
    if (alkylBond) {
      return getAlkoxyName(parsedMol, getOtherAtom(alkylBond, oxygenAtom), oxygenAtom);
    }
  }

  if (classification.kind === "hydroxy") return "hydroxy";
  if (classification.kind === "alkoxide") return "oxido";

  // Unknown C-O-X connectivity should never silently become hydroxy.
  return "oxy";
}

function getDirectHeteroSubstituentName(
  parsedMol: ParsedMol,
  atomIndex: number
) {
  const atom = parsedMol.atoms[atomIndex];
  if (!atom) return null;

  if (atom.element === "P") {
    const hasTerminalO = (parsedMol.adjacency.get(atomIndex) ?? []).some((bond) => {
      const attached = parsedMol.atoms[getOtherAtom(bond, atomIndex)];
      return attached?.element === "O" && bond.bondOrder >= 1.5;
    });
    return hasTerminalO ? "phosphoryl" : "phosphanyl";
  }

  if (atom.element === "B") {
    const oxygenCount = (parsedMol.adjacency.get(atomIndex) ?? []).filter((bond) => {
      const attached = parsedMol.atoms[getOtherAtom(bond, atomIndex)];
      return attached?.element === "O";
    }).length;
    return oxygenCount >= 2 ? "borono" : "boryl";
  }

  if (atom.element === "Si") return "silyl";
  return null;
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
          name: getNitrogenSubstituentName(parsedMol, other, parentAtom),
          locant,
        });

        continue;
      }

      if (atom.element === "O") {
        if (bond.bondOrder !== 1) continue;

        substituents.push({
          name: getOxygenSubstituentName(parsedMol, other, parentAtom),
          locant,
        });

        continue;
      }

      if (atom.element === "S") {
        substituents.push({
          name: getSulfurSubstituentName(parsedMol, other, parentAtom),
          locant,
        });

        continue;
      }

      const directHeteroName = getDirectHeteroSubstituentName(parsedMol, other);
      if (directHeteroName) {
        substituents.push({ name: directHeteroName, locant });
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

    if (attachedAtom?.element === "O") {
      const oxygenHeavyBonds = (parsedMol.adjacency.get(attached) ?? []).filter(
        (bond) => parsedMol.atoms[getOtherAtom(bond, attached)]?.element !== "H"
      );

      // Hydroxamic acids and related N-hydroxy amides are most clearly named
      // as N-hydroxy amides. Restrict this to a terminal O-H-like oxygen so
      // N-alkoxy substituents are not incorrectly collapsed to hydroxy.
      if (oxygenHeavyBonds.length === 1 && attachedAtom.charge <= 0) {
        substituents.push({ name: "hydroxy", locant: "N" });
      }
      continue;
    }

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

  const nitrogenBonds = bonds.filter((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "N";
  });
  const imineNitrogenBond = nitrogenBonds.find((bond) => bond.bondOrder === 2);

  if (imineNitrogenBond) {
    const imineNitrogen = getOtherAtom(imineNitrogenBond, carbonIndex);
    const nNeighbors = parsedMol.adjacency.get(imineNitrogen) ?? [];

    const nHasHydroxyOxygen = nNeighbors.some((bond) => {
      if (bond.bondOrder !== 1) return false;
      const oxygen = getOtherAtom(bond, imineNitrogen);
      if (parsedMol.atoms[oxygen]?.element !== "O") return false;
      const oxygenHeavyBonds = (parsedMol.adjacency.get(oxygen) ?? []).filter(
        (candidate) =>
          parsedMol.atoms[getOtherAtom(candidate, oxygen)]?.element !== "H"
      );
      return oxygenHeavyBonds.length === 1;
    });
    if (nHasHydroxyOxygen) return "hydroxyimino";

    const nHasNitrogen = nNeighbors.some((bond) => {
      const attached = getOtherAtom(bond, imineNitrogen);
      return attached !== carbonIndex && parsedMol.atoms[attached]?.element === "N";
    });
    if (nHasNitrogen) return "hydrazono";

    if (nitrogenBonds.length >= 3) return "guanidino";
    if (nitrogenBonds.length >= 2) return "amidino";
  }

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

    if (
      feature.type === "sulfonicAcid" ||
      feature.type === "sulfinicAcid" ||
      feature.type === "sulfenicAcid" ||
      feature.type === "sulfonamide"
    ) {
      return parsedMol.atoms[otherAtom]?.element === "S" &&
        connectingBond.bondOrder === 1;
    }

    if (feature.type === "imine") {
      return parsedMol.atoms[otherAtom]?.element === "N" &&
        connectingBond.bondOrder === 2;
    }

    if (
      feature.type === "thioaldehyde" ||
      feature.type === "thioketone" ||
      feature.type === "thioamide" ||
      feature.type === "thiocarboxylicAcid"
    ) {
      return parsedMol.atoms[otherAtom]?.element === "S" &&
        connectingBond.bondOrder === 2;
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