import type { FunctionalGroupResult } from "../../functionalGroups/types";
import { normalizeFunctionalGroupName } from "../../functionalGroups/groupIds";
import type { ParsedMol } from "../types";
import { getOtherAtom } from "../molParser";
import { buildBranchName } from "../branch/branchConstructor";
import { alkylNameToAlkoxyName } from "../alkoxyNames";

export type FunctionalClassNameResult = {
  name: string;
  confidence: "medium" | "high";
  reason: string;
};

const FUNCTIONAL_CLASS_GROUPS = new Set([
  // Carbonyl / acid-derivative functional classes
  "acid anhydride",
  "carbonate ester",
  "carbamate",
  "urea",
  "thioester",

  // Sulfur
  "thioether",
  "disulfide",
  "sulfoxide",
  "sulfone",
  "sulfonate ester",
  "sulfonyl chloride",

  // Oxygen
  "peroxide",
  "hydroperoxide",
  "nitrate ester",

  // Nitrogen families that do not fit a simple hydrocarbon suffix engine
  "isocyanide",
  "isocyanate",
  "isothiocyanate",
  "n-oxide",
  "hydrazone",
  "aldoxime",
  "ketoxime",
  "aminoxime",
  "nitrone",
  "amidine",
  "guanidine",

  // Boron
  "boronic acid",
  "alkylborane",
  "boronate monoester",
  "boronate ester",
  "borinic acid",
  "borinic ester",
  "borate ester",
  "organotrifluoroborate",

  // Phosphorus
  "phosphine",
  "phosphate",
  "phosphate ester",
  "phosphodiester",
  "phosphate triester",
  "phosphonate",
  "phosphonate ester",
  "phosphonate diester",
  "phosphinate",
  "phosphine oxide",
  "primary phosphine oxide",
  "secondary phosphine oxide",
  "tertiary phosphine oxide",
  "phosphine sulfide",
  "primary phosphine sulfide",
  "secondary phosphine sulfide",
  "tertiary phosphine sulfide",
  "thiophosphate ester",
  "dithiophosphate",
  "phosphoramidate",
  "phosphoramidite",

  // Silicon
  "silane",
  "silyl ether",
  "silanol",
  "siloxane",
  "silyl halide",
  "disilane",

  // Common charged organic classes
  "alkoxide",
  "phenoxide",
  "carboxylate",
  "oxonium ion",
  "ammonium ion",
  "primary ammonium",
  "secondary ammonium",
  "tertiary ammonium",
  "quaternary ammonium",
  "thiolate",
  "sulfonium ion",
  "phosphonium ion",
]);

function getBestSpecialGroup(
  functionalGroups: FunctionalGroupResult[],
  mainGroup: FunctionalGroupResult | null
) {
  const candidates = [
    ...(mainGroup ? [mainGroup] : []),
    ...functionalGroups,
  ]
    .filter((group) => FUNCTIONAL_CLASS_GROUPS.has(normalizeFunctionalGroupName(group.name)))
    .sort((a, b) => a.nomenclaturePriority - b.nomenclaturePriority);

  return candidates[0] ?? null;
}

function carbonBranchNamesAtAtom(parsedMol: ParsedMol, centerAtom: number) {
  const names: string[] = [];

  for (const bond of parsedMol.adjacency.get(centerAtom) ?? []) {
    if (bond.bondOrder !== 1) continue;

    const attached = getOtherAtom(bond, centerAtom);
    if (parsedMol.atoms[attached]?.element !== "C") continue;

    names.push(buildBranchName(parsedMol, attached, centerAtom).name);
  }

  return names;
}

function getCenters(parsedMol: ParsedMol, element: string) {
  return parsedMol.atoms
    .filter((atom) => atom.element === element)
    .map((atom) => atom.atomIndex);
}

function oxygenBoundCarbonNamesAtAtom(parsedMol: ParsedMol, centerAtom: number) {
  const names: string[] = [];

  for (const bond of parsedMol.adjacency.get(centerAtom) ?? []) {
    if (bond.bondOrder !== 1) continue;
    const oxygen = getOtherAtom(bond, centerAtom);
    if (parsedMol.atoms[oxygen]?.element !== "O") continue;

    const carbonBond = getSingleBondedNeighbor(parsedMol, oxygen, "C", centerAtom);
    if (!carbonBond) continue;

    const carbon = getOtherAtom(carbonBond, oxygen);
    names.push(buildBranchName(parsedMol, carbon, oxygen).name);
  }

  return names;
}

function countSingleBondedElement(
  parsedMol: ParsedMol,
  centerAtom: number,
  element: string
) {
  return (parsedMol.adjacency.get(centerAtom) ?? []).filter((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, centerAtom)];
    return bond.bondOrder === 1 && attached?.element === element;
  }).length;
}

function countDoubleBondedElement(
  parsedMol: ParsedMol,
  centerAtom: number,
  element: string
) {
  return (parsedMol.adjacency.get(centerAtom) ?? []).filter((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, centerAtom)];
    return attached?.element === element && bond.bondOrder === 2;
  }).length;
}

function getSingleBondedNeighbor(
  parsedMol: ParsedMol,
  centerAtom: number,
  element: string,
  excludeAtom?: number
) {
  return (parsedMol.adjacency.get(centerAtom) ?? []).find((bond) => {
    if (bond.bondOrder !== 1) return false;
    const attached = getOtherAtom(bond, centerAtom);
    if (attached === excludeAtom) return false;
    return parsedMol.atoms[attached]?.element === element;
  });
}

function alkylStem(name: string) {
  const retained: Record<string, string> = {
    methyl: "methane",
    ethyl: "ethane",
    propyl: "propane",
    butyl: "butane",
    pentyl: "pentane",
    hexyl: "hexane",
    heptyl: "heptane",
    octyl: "octane",
    nonyl: "nonane",
    decyl: "decane",
  };

  return retained[name] ?? name.replace(/yl$/, "ane");
}

function multiplierForCount(count: number) {
  if (count === 2) return "di";
  if (count === 3) return "tri";
  if (count === 4) return "tetra";
  if (count === 5) return "penta";
  if (count === 6) return "hexa";
  if (count === 7) return "hepta";
  if (count === 8) return "octa";
  return "";
}

function compactLigandPrefix(names: string[]) {
  const cleaned = names.filter(Boolean);
  if (cleaned.length === 0) return "";

  const sorted = [...cleaned].sort();
  const allSame = sorted.every((name) => name === sorted[0]);
  if (allSame) return `${multiplierForCount(sorted.length)}${sorted[0]}`;
  return sorted.join("");
}

function formatLigands(names: string[], className: string) {
  const cleaned = names.filter(Boolean);
  if (cleaned.length === 0) return null;

  const allSame = cleaned.every((name) => name === cleaned[0]);

  if (allSame) {
    const multiplier = multiplierForCount(cleaned.length);

    return `${multiplier}${cleaned[0]} ${className}`;
  }

  return `${[...cleaned].sort().join(" ")} ${className}`;
}

function isCarbonylCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "O" && bond.bondOrder === 2;
  });
}

function simpleAcidNameFromAcylCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  const carbonBond = (parsedMol.adjacency.get(carbonIndex) ?? []).find((bond) => {
    const attached = getOtherAtom(bond, carbonIndex);
    return bond.bondOrder === 1 && parsedMol.atoms[attached]?.element === "C";
  });

  if (!carbonBond) return "methanoic acid";

  const alkylCarbon = getOtherAtom(carbonBond, carbonIndex);
  const alkylName = buildBranchName(parsedMol, alkylCarbon, carbonIndex).name;
  const map: Record<string, string> = {
    phenyl: "benzoic acid",
    methyl: "ethanoic acid",
    ethyl: "propanoic acid",
    propyl: "butanoic acid",
    butyl: "pentanoic acid",
    pentyl: "hexanoic acid",
    hexyl: "heptanoic acid",
    heptyl: "octanoic acid",
    octyl: "nonanoic acid",
    nonyl: "decanoic acid",
  };

  return map[alkylName] ?? `${alkylName}carboxylic acid`;
}

function buildAcidDerivativeClassName(
  parsedMol: ParsedMol,
  groupName: string
): FunctionalClassNameResult | null {
  if (groupName === "acid anhydride") {
    for (const oxygen of getCenters(parsedMol, "O")) {
      const carbonylNeighbors = (parsedMol.adjacency.get(oxygen) ?? [])
        .filter((bond) => bond.bondOrder === 1)
        .map((bond) => getOtherAtom(bond, oxygen))
        .filter((atomIndex) =>
          parsedMol.atoms[atomIndex]?.element === "C" &&
          isCarbonylCarbon(parsedMol, atomIndex)
        );

      if (carbonylNeighbors.length !== 2) continue;

      const acids = carbonylNeighbors.map((carbon) =>
        simpleAcidNameFromAcylCarbon(parsedMol, carbon).replace(/ acid$/, "")
      );

      const name = acids[0] === acids[1]
        ? `${acids[0]} anhydride`
        : `${[...acids].sort().join(" ")} anhydride`;

      return {
        name,
        confidence: "high",
        reason: "Built from the two acyl groups joined by the anhydride oxygen.",
      };
    }
  }

  if (groupName === "carbonate ester") {
    for (const carbon of parsedMol.atoms.filter((atom) => atom.element === "C")) {
      if (!isCarbonylCarbon(parsedMol, carbon.atomIndex)) continue;

      const alkoxyNames: string[] = [];
      for (const bond of parsedMol.adjacency.get(carbon.atomIndex) ?? []) {
        if (bond.bondOrder !== 1) continue;
        const oxygen = getOtherAtom(bond, carbon.atomIndex);
        if (parsedMol.atoms[oxygen]?.element !== "O") continue;
        const carbonBond = getSingleBondedNeighbor(parsedMol, oxygen, "C", carbon.atomIndex);
        if (!carbonBond) continue;
        const alkylCarbon = getOtherAtom(carbonBond, oxygen);
        alkoxyNames.push(buildBranchName(parsedMol, alkylCarbon, oxygen).name);
      }

      if (alkoxyNames.length !== 2) continue;
      const name = formatLigands(alkoxyNames, "carbonate");
      if (!name) continue;
      return {
        name,
        confidence: "high",
        reason: "Built as a dialkyl carbonate from the two O-bound carbon groups.",
      };
    }
  }

  if (groupName === "urea") {
    for (const carbon of parsedMol.atoms.filter((atom) => atom.element === "C")) {
      if (!isCarbonylCarbon(parsedMol, carbon.atomIndex)) continue;
      const nitrogenNeighbors = (parsedMol.adjacency.get(carbon.atomIndex) ?? [])
        .filter((bond) => bond.bondOrder === 1)
        .map((bond) => getOtherAtom(bond, carbon.atomIndex))
        .filter((atomIndex) => parsedMol.atoms[atomIndex]?.element === "N");
      if (nitrogenNeighbors.length !== 2) continue;

      const sides = nitrogenNeighbors.map((nitrogen) =>
        carbonBranchNamesAtAtom(parsedMol, nitrogen).sort()
      );
      const ordered = [...sides].sort((a, b) => a.join(",").localeCompare(b.join(",")));
      const locanted: Array<{ locant: number; name: string }> = [];
      ordered[0].forEach((name) => locanted.push({ locant: 1, name }));
      ordered[1].forEach((name) => locanted.push({ locant: 3, name }));

      if (locanted.length === 0) {
        return {
          name: "urea",
          confidence: "high",
          reason: "Recognized an unsubstituted urea carbonyl bonded to two nitrogens.",
        };
      }

      const groups = new Map<string, number[]>();
      for (const item of locanted) {
        const list = groups.get(item.name) ?? [];
        list.push(item.locant);
        groups.set(item.name, list);
      }

      const prefix = Array.from(groups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, locants]) => {
          const multiplier = multiplierForCount(locants.length);
          return `${locants.join(",")}-${multiplier}${name}`;
        })
        .join("-");

      return {
        name: `${prefix}urea`,
        confidence: "medium",
        reason: "Built from the substituents on the two urea nitrogens using urea positions 1 and 3.",
      };
    }
  }

  if (groupName === "thioester") {
    for (const carbon of parsedMol.atoms.filter((atom) => atom.element === "C")) {
      if (!isCarbonylCarbon(parsedMol, carbon.atomIndex)) continue;

      const sulfurBond = getSingleBondedNeighbor(
        parsedMol,
        carbon.atomIndex,
        "S"
      );
      if (!sulfurBond) continue;

      const sulfur = getOtherAtom(sulfurBond, carbon.atomIndex);
      const sCarbonBond = getSingleBondedNeighbor(
        parsedMol,
        sulfur,
        "C",
        carbon.atomIndex
      );
      if (!sCarbonBond) continue;

      const sAlkyl = buildBranchName(
        parsedMol,
        getOtherAtom(sCarbonBond, sulfur),
        sulfur
      ).name;
      const acidName = simpleAcidNameFromAcylCarbon(parsedMol, carbon.atomIndex);
      const thioateName = acidName.replace(/oic acid$/, "ethioate");

      return {
        name: `S-${sAlkyl} ${thioateName}`,
        confidence: "high",
        reason: "Built from the acyl group and the sulfur-bound carbon group of the thioester.",
      };
    }
  }

  if (groupName === "carbamate") {
    for (const carbon of parsedMol.atoms.filter((atom) => atom.element === "C")) {
      if (!isCarbonylCarbon(parsedMol, carbon.atomIndex)) continue;

      const nitrogenBond = getSingleBondedNeighbor(parsedMol, carbon.atomIndex, "N");
      const oxygenBond = (parsedMol.adjacency.get(carbon.atomIndex) ?? []).find((bond) => {
        if (bond.bondOrder !== 1) return false;
        const oxygen = getOtherAtom(bond, carbon.atomIndex);
        if (parsedMol.atoms[oxygen]?.element !== "O") return false;
        return Boolean(getSingleBondedNeighbor(parsedMol, oxygen, "C", carbon.atomIndex));
      });

      if (!nitrogenBond || !oxygenBond) continue;
      const nitrogen = getOtherAtom(nitrogenBond, carbon.atomIndex);
      const oxygen = getOtherAtom(oxygenBond, carbon.atomIndex);
      const oCarbonBond = getSingleBondedNeighbor(parsedMol, oxygen, "C", carbon.atomIndex);
      if (!oCarbonBond) continue;
      const oAlkyl = buildBranchName(parsedMol, getOtherAtom(oCarbonBond, oxygen), oxygen).name;

      const nAlkyls = carbonBranchNamesAtAtom(parsedMol, nitrogen).filter((name) => name);
      const nPrefix = nAlkyls.length === 0
        ? ""
        : nAlkyls.length === 1
        ? `N-${nAlkyls[0]} `
        : `N,N-${nAlkyls.join(",")} `;

      return {
        name: `${oAlkyl} ${nPrefix}carbamate`.replace(/\s+/g, " ").trim(),
        confidence: "medium",
        reason: "Built from the O-alkyl and N-substituent sides of the carbamate group.",
      };
    }
  }

  return null;
}

function buildSulfurClassName(
  parsedMol: ParsedMol,
  groupName: string
): FunctionalClassNameResult | null {
  if (groupName === "disulfide") {
    for (const sulfur of getCenters(parsedMol, "S")) {
      const ssBond = getSingleBondedNeighbor(parsedMol, sulfur, "S");
      if (!ssBond) continue;

      const otherSulfur = getOtherAtom(ssBond, sulfur);
      const left = carbonBranchNamesAtAtom(parsedMol, sulfur)[0];
      const right = carbonBranchNamesAtAtom(parsedMol, otherSulfur)[0];
      if (!left || !right) continue;

      const name = formatLigands([left, right], "disulfide");
      if (!name) continue;

      return {
        name,
        confidence: "high",
        reason: "Built as a sulfur functional-class name from the two groups attached to the S-S bond.",
      };
    }
  }

  for (const sulfur of getCenters(parsedMol, "S")) {
    const carbonNames = carbonBranchNamesAtAtom(parsedMol, sulfur);
    const doubleO = countDoubleBondedElement(parsedMol, sulfur, "O");

    if (groupName === "thioether" && carbonNames.length === 2 && doubleO === 0) {
      const name = formatLigands(carbonNames, "sulfide");
      if (name) return { name, confidence: "high", reason: "Built as a sulfide functional-class name." };
    }

    if (groupName === "sulfoxide" && carbonNames.length === 2 && doubleO === 1) {
      const name = formatLigands(carbonNames, "sulfoxide");
      if (name) return { name, confidence: "high", reason: "Built as a sulfoxide functional-class name." };
    }

    if (groupName === "sulfone" && carbonNames.length === 2 && doubleO >= 2) {
      const name = formatLigands(carbonNames, "sulfone");
      if (name) return { name, confidence: "high", reason: "Built as a sulfone functional-class name." };
    }

    if (groupName === "sulfonyl chloride" && carbonNames.length >= 1 && doubleO >= 2) {
      const chlorine = getSingleBondedNeighbor(parsedMol, sulfur, "Cl");
      if (!chlorine) continue;
      return {
        name: `${alkylStem(carbonNames[0])}sulfonyl chloride`,
        confidence: "high",
        reason: "Built from the carbon group attached to the sulfonyl chloride center.",
      };
    }

    if (groupName === "sulfonate ester" && carbonNames.length >= 1 && doubleO >= 2) {
      const esterO = (parsedMol.adjacency.get(sulfur) ?? []).find((bond) => {
        if (bond.bondOrder !== 1) return false;
        const oxygen = getOtherAtom(bond, sulfur);
        if (parsedMol.atoms[oxygen]?.element !== "O") return false;
        return Boolean(getSingleBondedNeighbor(parsedMol, oxygen, "C", sulfur));
      });

      if (!esterO) continue;
      const oxygen = getOtherAtom(esterO, sulfur);
      const carbonBond = getSingleBondedNeighbor(parsedMol, oxygen, "C", sulfur);
      if (!carbonBond) continue;
      const esterCarbon = getOtherAtom(carbonBond, oxygen);
      const esterAlkyl = buildBranchName(parsedMol, esterCarbon, oxygen).name;

      return {
        name: `${esterAlkyl} ${alkylStem(carbonNames[0])}sulfonate`,
        confidence: "high",
        reason: "Built as an alkyl alkanesulfonate functional-class name.",
      };
    }
  }

  return null;
}

function buildPeroxideClassName(
  parsedMol: ParsedMol,
  groupName: string
): FunctionalClassNameResult | null {
  for (const oxygen of getCenters(parsedMol, "O")) {
    const ooBond = getSingleBondedNeighbor(parsedMol, oxygen, "O");
    if (!ooBond) continue;

    const otherO = getOtherAtom(ooBond, oxygen);
    const leftCarbonBond = getSingleBondedNeighbor(parsedMol, oxygen, "C", otherO);
    const rightCarbonBond = getSingleBondedNeighbor(parsedMol, otherO, "C", oxygen);

    const names: string[] = [];
    if (leftCarbonBond) {
      const carbon = getOtherAtom(leftCarbonBond, oxygen);
      names.push(buildBranchName(parsedMol, carbon, oxygen).name);
    }
    if (rightCarbonBond) {
      const carbon = getOtherAtom(rightCarbonBond, otherO);
      names.push(buildBranchName(parsedMol, carbon, otherO).name);
    }

    if (groupName === "peroxide" && names.length === 2) {
      const name = formatLigands(names, "peroxide");
      if (name) return { name, confidence: "high", reason: "Built from the two carbon groups attached to the peroxide bond." };
    }

    if (groupName === "hydroperoxide" && names.length === 1) {
      return {
        name: `${names[0]} hydroperoxide`,
        confidence: "high",
        reason: "Built from the carbon group attached to the hydroperoxide unit.",
      };
    }
  }

  return null;
}


function buildNitrateEsterName(
  parsedMol: ParsedMol
): FunctionalClassNameResult | null {
  for (const nitrogen of getCenters(parsedMol, "N")) {
    const nitrogenAtom = parsedMol.atoms[nitrogen];
    if (!nitrogenAtom || nitrogenAtom.charge <= 0) continue;

    const oxygenBonds = (parsedMol.adjacency.get(nitrogen) ?? []).filter(
      (bond) => parsedMol.atoms[getOtherAtom(bond, nitrogen)]?.element === "O"
    );

    const hasDoubleO = oxygenBonds.some((bond) => bond.bondOrder === 2);
    const hasAnionicO = oxygenBonds.some((bond) => {
      const oxygen = parsedMol.atoms[getOtherAtom(bond, nitrogen)];
      return bond.bondOrder === 1 && (oxygen?.charge ?? 0) < 0;
    });
    if (!hasDoubleO || !hasAnionicO) continue;

    for (const nitrogenOxygenBond of oxygenBonds) {
      if (nitrogenOxygenBond.bondOrder !== 1) continue;
      const oxygen = getOtherAtom(nitrogenOxygenBond, nitrogen);
      if ((parsedMol.atoms[oxygen]?.charge ?? 0) < 0) continue;

      const carbonBond = getSingleBondedNeighbor(parsedMol, oxygen, "C", nitrogen);
      if (!carbonBond) continue;

      const carbon = getOtherAtom(carbonBond, oxygen);
      const alkylName = buildBranchName(parsedMol, carbon, oxygen).name;

      return {
        name: `${alkylName} nitrate`,
        confidence: "high",
        reason: "Built from the carbon group bonded through oxygen to a nitrate group.",
      };
    }
  }

  return null;
}


function centralCarbonBranchNames(parsedMol: ParsedMol, carbonIndex: number) {
  return (parsedMol.adjacency.get(carbonIndex) ?? [])
    .filter((bond) => {
      if (bond.bondOrder !== 1) return false;
      const attached = getOtherAtom(bond, carbonIndex);
      return parsedMol.atoms[attached]?.element === "C";
    })
    .map((bond) => {
      const attached = getOtherAtom(bond, carbonIndex);
      return buildBranchName(parsedMol, attached, carbonIndex).name;
    });
}

function carbonylClassBaseFromSubstituents(names: string[], aldehydeLike: boolean) {
  const sorted = [...names].sort();

  if (aldehydeLike) {
    const retained: Record<string, string> = {
      methyl: "acetaldehyde",
      ethyl: "propionaldehyde",
      propyl: "butyraldehyde",
      phenyl: "benzaldehyde",
    };
    return retained[sorted[0] ?? ""] ?? `${sorted[0] ?? "alkyl"} aldehyde`;
  }

  if (sorted.length === 2 && sorted[0] === "methyl" && sorted[1] === "methyl") {
    return "acetone";
  }

  return formatLigands(sorted, "ketone") ?? "ketone";
}

function amidineBaseName(parsedMol: ParsedMol, carbonIndex: number) {
  const carbonNames = centralCarbonBranchNames(parsedMol, carbonIndex);
  if (carbonNames.length === 0) return "methanamidine";

  const map: Record<string, string> = {
    methyl: "ethanamidine",
    ethyl: "propanamidine",
    propyl: "butanamidine",
    butyl: "pentanamidine",
    phenyl: "benzamidine",
  };

  return map[carbonNames[0]] ?? `${carbonNames[0]}carboxamidine`;
}

function buildNitrogenClassName(
  parsedMol: ParsedMol,
  groupName: string
): FunctionalClassNameResult | null {
  if (
    groupName === "isocyanide" ||
    groupName === "isocyanate" ||
    groupName === "isothiocyanate"
  ) {
    for (const nitrogen of getCenters(parsedMol, "N")) {
      const carbonNames = carbonBranchNamesAtAtom(parsedMol, nitrogen);
      if (carbonNames.length === 0) continue;

      const bonds = parsedMol.adjacency.get(nitrogen) ?? [];
      const hasIsocyanide = bonds.some((bond) => {
        const attached = getOtherAtom(bond, nitrogen);
        return bond.bondOrder === 3 && parsedMol.atoms[attached]?.element === "C";
      });
      const cumuleneCarbon = bonds.find((bond) => {
        const attached = getOtherAtom(bond, nitrogen);
        return bond.bondOrder === 2 && parsedMol.atoms[attached]?.element === "C";
      });

      if (groupName === "isocyanide" && hasIsocyanide) {
        return {
          name: `${carbonNames[0]} isocyanide`,
          confidence: "high",
          reason: "Built from the carbon group attached to the isocyanide nitrogen.",
        };
      }

      if (cumuleneCarbon) {
        const carbon = getOtherAtom(cumuleneCarbon, nitrogen);
        const terminal = (parsedMol.adjacency.get(carbon) ?? [])
          .map((bond) => ({ bond, atom: getOtherAtom(bond, carbon) }))
          .find(
            ({ bond, atom }) =>
              atom !== nitrogen &&
              bond.bondOrder === 2 &&
              (parsedMol.atoms[atom]?.element === "O" ||
                parsedMol.atoms[atom]?.element === "S")
          );

        if (!terminal) continue;
        const terminalElement = parsedMol.atoms[terminal.atom]?.element;
        if (groupName === "isocyanate" && terminalElement === "O") {
          return {
            name: `${carbonNames[0]} isocyanate`,
            confidence: "high",
            reason: "Built from the carbon group attached to the isocyanate nitrogen.",
          };
        }
        if (groupName === "isothiocyanate" && terminalElement === "S") {
          return {
            name: `${carbonNames[0]} isothiocyanate`,
            confidence: "high",
            reason: "Built from the carbon group attached to the isothiocyanate nitrogen.",
          };
        }
      }
    }
  }

  if (groupName === "n-oxide") {
    for (const nitrogen of getCenters(parsedMol, "N")) {
      const atom = parsedMol.atoms[nitrogen];
      if (!atom || atom.charge <= 0) continue;
      const oxide = (parsedMol.adjacency.get(nitrogen) ?? []).some((bond) => {
        const oxygen = getOtherAtom(bond, nitrogen);
        return parsedMol.atoms[oxygen]?.element === "O" &&
          (parsedMol.atoms[oxygen]?.charge ?? 0) < 0;
      });
      if (!oxide) continue;

      const ligands = carbonBranchNamesAtAtom(parsedMol, nitrogen);
      if (ligands.length > 0) {
        return {
          name: `${compactLigandPrefix(ligands)}amine N-oxide`,
          confidence: "medium",
          reason: "Built as an amine N-oxide from the carbon substituents on the oxidized nitrogen.",
        };
      }
    }
  }

  if (
    groupName === "aldoxime" ||
    groupName === "ketoxime" ||
    groupName === "hydrazone"
  ) {
    for (const carbon of parsedMol.atoms.filter((atom) => atom.element === "C")) {
      const imineBond = (parsedMol.adjacency.get(carbon.atomIndex) ?? []).find(
        (bond) => {
          const attached = getOtherAtom(bond, carbon.atomIndex);
          return bond.bondOrder === 2 && parsedMol.atoms[attached]?.element === "N";
        }
      );
      if (!imineBond) continue;

      const nitrogen = getOtherAtom(imineBond, carbon.atomIndex);
      const nNeighbors = parsedMol.adjacency.get(nitrogen) ?? [];
      const hasOxygen = nNeighbors.some(
        (bond) => parsedMol.atoms[getOtherAtom(bond, nitrogen)]?.element === "O"
      );
      const hasNitrogen = nNeighbors.some((bond) => {
        const attached = getOtherAtom(bond, nitrogen);
        return attached !== carbon.atomIndex && parsedMol.atoms[attached]?.element === "N";
      });

      const carbonNames = centralCarbonBranchNames(parsedMol, carbon.atomIndex);
      const aldehydeLike = carbonNames.length <= 1;
      const base = carbonylClassBaseFromSubstituents(carbonNames, aldehydeLike);

      if (groupName === "hydrazone" && hasNitrogen) {
        return {
          name: `${base} hydrazone`,
          confidence: "medium",
          reason: "Built as the hydrazone derivative of the corresponding aldehyde or ketone skeleton.",
        };
      }

      if ((groupName === "aldoxime" || groupName === "ketoxime") && hasOxygen) {
        return {
          name: `${base} oxime`,
          confidence: "medium",
          reason: "Built as the oxime derivative of the corresponding aldehyde or ketone skeleton.",
        };
      }
    }
  }

  if (groupName === "aminoxime") {
    for (const carbon of parsedMol.atoms.filter((atom) => atom.element === "C")) {
      const bonds = parsedMol.adjacency.get(carbon.atomIndex) ?? [];
      const imineN = bonds.find((bond) => {
        const attached = getOtherAtom(bond, carbon.atomIndex);
        return bond.bondOrder === 2 && parsedMol.atoms[attached]?.element === "N";
      });
      const aminoN = bonds.find((bond) => {
        const attached = getOtherAtom(bond, carbon.atomIndex);
        return bond.bondOrder === 1 && parsedMol.atoms[attached]?.element === "N";
      });
      if (!imineN || !aminoN) continue;

      const imineNitrogen = getOtherAtom(imineN, carbon.atomIndex);
      const hasHydroxyO = (parsedMol.adjacency.get(imineNitrogen) ?? []).some(
        (bond) => parsedMol.atoms[getOtherAtom(bond, imineNitrogen)]?.element === "O"
      );
      if (!hasHydroxyO) continue;

      const carbonNames = centralCarbonBranchNames(parsedMol, carbon.atomIndex);
      const base = carbonNames[0] === "methyl"
        ? "acetamidoxime"
        : carbonNames[0] === "phenyl"
        ? "benzamidoxime"
        : `${carbonNames[0] ?? "form"}amidoxime`;

      return {
        name: base,
        confidence: "medium",
        reason: "Built from the carbon substituent on the amidoxime carbon.",
      };
    }
  }

  if (groupName === "amidine" || groupName === "guanidine") {
    for (const carbon of parsedMol.atoms.filter((atom) => atom.element === "C")) {
      const nBonds = (parsedMol.adjacency.get(carbon.atomIndex) ?? []).filter(
        (bond) => parsedMol.atoms[getOtherAtom(bond, carbon.atomIndex)]?.element === "N"
      );
      if (!nBonds.some((bond) => bond.bondOrder === 2)) continue;

      if (groupName === "guanidine" && nBonds.length >= 3) {
        return {
          name: "guanidine",
          confidence: "medium",
          reason: "Recognized the guanidine carbon bonded to three nitrogens; complex N-substitution remains descriptive.",
        };
      }

      if (groupName === "amidine" && nBonds.length >= 2) {
        return {
          name: amidineBaseName(parsedMol, carbon.atomIndex),
          confidence: "medium",
          reason: "Built from the carbon skeleton attached to the amidine carbon.",
        };
      }
    }
  }

  if (groupName === "nitrone") {
    return {
      name: "substituted nitrone",
      confidence: "medium",
      reason: "Recognized an imine N-oxide (nitrone); full N/C substituent locants are not yet generalized.",
    };
  }

  return null;
}

function buildBoronClassName(
  parsedMol: ParsedMol,
  groupName: string
): FunctionalClassNameResult | null {
  for (const boron of getCenters(parsedMol, "B")) {
    const carbonNames = carbonBranchNamesAtAtom(parsedMol, boron);
    const oxygenCarbonNames = oxygenBoundCarbonNamesAtAtom(parsedMol, boron);

    if (groupName === "boronic acid" && carbonNames.length >= 1) {
      return {
        name: `${carbonNames[0]}boronic acid`,
        confidence: "high",
        reason: "Built as an organoboronic-acid functional-class name.",
      };
    }

    if (groupName === "alkylborane" && carbonNames.length > 0) {
      return {
        name: `${compactLigandPrefix(carbonNames)}borane`,
        confidence: "medium",
        reason: "Built from the carbon substituents directly attached to boron.",
      };
    }

    if (
      (groupName === "boronate monoester" || groupName === "boronate ester") &&
      carbonNames.length >= 1 &&
      oxygenCarbonNames.length >= 1
    ) {
      const esterPrefix = compactLigandPrefix(oxygenCarbonNames);
      return {
        name: `${esterPrefix} ${carbonNames[0]}boronate`,
        confidence: "medium",
        reason: "Built from the carbon-boron substituent and the O-alkyl substituent(s) of the boronate.",
      };
    }

    if (groupName === "borinic acid" && carbonNames.length >= 2) {
      return {
        name: `${compactLigandPrefix(carbonNames)}borinic acid`,
        confidence: "medium",
        reason: "Built from the two carbon substituents directly attached to boron.",
      };
    }

    if (
      groupName === "borinic ester" &&
      carbonNames.length >= 2 &&
      oxygenCarbonNames.length >= 1
    ) {
      return {
        name: `${oxygenCarbonNames[0]} ${compactLigandPrefix(carbonNames)}borinate`,
        confidence: "medium",
        reason: "Built from the two B-C groups and the O-alkyl group of the borinic ester.",
      };
    }

    if (groupName === "borate ester" && oxygenCarbonNames.length >= 3) {
      const name = formatLigands(oxygenCarbonNames, "borate");
      if (name) {
        return {
          name,
          confidence: "high",
          reason: "Built from the three O-bound organic groups of the borate ester.",
        };
      }
    }

    if (groupName === "organotrifluoroborate" && carbonNames.length >= 1) {
      const fluorineCount = countSingleBondedElement(parsedMol, boron, "F");
      if (fluorineCount >= 3) {
        return {
          name: `${carbonNames[0]}trifluoroborate`,
          confidence: "high",
          reason: "Built from the carbon group attached to the BF3 anion center.",
        };
      }
    }
  }

  return null;
}

function buildPhosphorusClassName(
  parsedMol: ParsedMol,
  groupName: string
): FunctionalClassNameResult | null {
  for (const phosphorus of getCenters(parsedMol, "P")) {
    const carbonNames = carbonBranchNamesAtAtom(parsedMol, phosphorus);
    const oxygenCarbonNames = oxygenBoundCarbonNamesAtAtom(parsedMol, phosphorus);

    if (
      groupName === "phosphate" ||
      groupName === "phosphate ester" ||
      groupName === "phosphodiester" ||
      groupName === "phosphate triester"
    ) {
      if (oxygenCarbonNames.length >= 3) {
        const name = formatLigands(oxygenCarbonNames, "phosphate");
        if (name) return {
          name,
          confidence: "high",
          reason: "Built from the O-bound organic groups on the phosphate center.",
        };
      }

      if (oxygenCarbonNames.length === 2) {
        const name = formatLigands(oxygenCarbonNames, "hydrogen phosphate");
        if (name) return {
          name,
          confidence: "medium",
          reason: "Built as a phosphate diester with one remaining acidic/ionic oxygen.",
        };
      }

      if (oxygenCarbonNames.length === 1) {
        return {
          name: `${oxygenCarbonNames[0]} dihydrogen phosphate`,
          confidence: "medium",
          reason: "Built as a phosphate monoester from its O-bound carbon group.",
        };
      }

      return {
        name: "phosphate",
        confidence: "medium",
        reason: "Recognized a phosphate center without enough protonation/counterion information for a more specific salt name.",
      };
    }

    if (
      groupName === "phosphonate" ||
      groupName === "phosphonate ester" ||
      groupName === "phosphonate diester"
    ) {
      if (carbonNames.length < 1) continue;
      const direct = carbonNames[0];

      if (oxygenCarbonNames.length >= 2) {
        const name = formatLigands(oxygenCarbonNames, `${direct}phosphonate`);
        if (name) return {
          name,
          confidence: "medium",
          reason: "Built from the P-C group and O-alkyl groups of the phosphonate ester.",
        };
      }

      if (oxygenCarbonNames.length === 1) {
        return {
          name: `${oxygenCarbonNames[0]} hydrogen ${direct}phosphonate`,
          confidence: "medium",
          reason: "Built as a phosphonate monoester with one remaining acidic/ionic oxygen.",
        };
      }

      return {
        name: `${direct}phosphonic acid`,
        confidence: "medium",
        reason: "Built from the carbon group directly attached to the phosphonic-acid phosphorus.",
      };
    }

    if (groupName === "phosphinate" && carbonNames.length >= 2) {
      const directPrefix = compactLigandPrefix(carbonNames);
      if (oxygenCarbonNames.length >= 1) {
        return {
          name: `${oxygenCarbonNames[0]} ${directPrefix}phosphinate`,
          confidence: "medium",
          reason: "Built from the two P-C groups and O-alkyl group of the phosphinate.",
        };
      }
      return {
        name: `${directPrefix}phosphinic acid`,
        confidence: "medium",
        reason: "Built from the two carbon substituents directly attached to phosphorus.",
      };
    }

    if (
      groupName === "thiophosphate ester" ||
      groupName === "dithiophosphate" ||
      groupName === "phosphoramidate" ||
      groupName === "phosphoramidite"
    ) {
      const className =
        groupName === "thiophosphate ester" ? "thiophosphate" : groupName;
      const ligandName = oxygenCarbonNames.length > 0
        ? formatLigands(oxygenCarbonNames, className)
        : null;
      return {
        name: ligandName ?? className,
        confidence: "medium",
        reason: "Recognized the phosphorus functional class; complex heteroatom substitution is represented with a functional-class name.",
      };
    }

    if (groupName === "phosphine" && carbonNames.length > 0) {
      return {
        name: `${compactLigandPrefix(carbonNames)}phosphane`,
        confidence: "medium",
        reason: "Built from the carbon substituents directly attached to phosphorus.",
      };
    }

    if (groupName.includes("phosphine") && carbonNames.length > 0) {
      const suffix = groupName.includes("sulfide")
        ? "phosphane sulfide"
        : "phosphane oxide";

      return {
        name: `${compactLigandPrefix(carbonNames)}${suffix}`,
        confidence: "medium",
        reason: "Built from the carbon substituents directly attached to the phosphorus center.",
      };
    }
  }

  return null;
}

function buildSiliconClassName(
  parsedMol: ParsedMol,
  groupName: string
): FunctionalClassNameResult | null {
  if (groupName === "siloxane") {
    for (const oxygen of getCenters(parsedMol, "O")) {
      const siliconNeighbors = (parsedMol.adjacency.get(oxygen) ?? [])
        .filter((bond) => bond.bondOrder === 1)
        .map((bond) => getOtherAtom(bond, oxygen))
        .filter((atomIndex) => parsedMol.atoms[atomIndex]?.element === "Si");
      if (siliconNeighbors.length !== 2) continue;

      const ligands = siliconNeighbors.flatMap((silicon) =>
        carbonBranchNamesAtAtom(parsedMol, silicon)
      );
      if (ligands.length > 0) {
        return {
          name: `${compactLigandPrefix(ligands)}disiloxane`,
          confidence: "medium",
          reason: "Built from the carbon substituents on the two silicon atoms of the Si-O-Si unit.",
        };
      }
    }
  }

  if (groupName === "disilane") {
    for (const silicon of getCenters(parsedMol, "Si")) {
      const siBond = getSingleBondedNeighbor(parsedMol, silicon, "Si");
      if (!siBond) continue;
      const otherSilicon = getOtherAtom(siBond, silicon);
      const ligands = [
        ...carbonBranchNamesAtAtom(parsedMol, silicon),
        ...carbonBranchNamesAtAtom(parsedMol, otherSilicon),
      ];
      if (ligands.length > 0) {
        return {
          name: `${compactLigandPrefix(ligands)}disilane`,
          confidence: "medium",
          reason: "Built from the carbon substituents on the two atoms of the Si-Si skeleton.",
        };
      }
    }
  }

  for (const silicon of getCenters(parsedMol, "Si")) {
    const carbonNames = carbonBranchNamesAtAtom(parsedMol, silicon);

    if (groupName === "silyl ether") {
      const oxygenBond = getSingleBondedNeighbor(parsedMol, silicon, "O");
      if (oxygenBond && carbonNames.length > 0) {
        const oxygen = getOtherAtom(oxygenBond, silicon);
        const carbonBond = getSingleBondedNeighbor(parsedMol, oxygen, "C", silicon);
        if (carbonBond) {
          const oAlkyl = buildBranchName(
            parsedMol,
            getOtherAtom(carbonBond, oxygen),
            oxygen
          ).name;
          return {
            name: `${alkylNameToAlkoxyName(oAlkyl)}${compactLigandPrefix(carbonNames)}silane`,
            confidence: "medium",
            reason: "Built as an alkoxy-substituted silane from the C-O-Si linkage.",
          };
        }
      }
    }

    if (groupName === "silanol" && carbonNames.length > 0) {
      return {
        name: `${compactLigandPrefix(carbonNames)}silanol`,
        confidence: "medium",
        reason: "Built from the carbon substituents directly attached to silicon.",
      };
    }

    if (groupName === "silyl halide" && carbonNames.length > 0) {
      const halogen = (parsedMol.adjacency.get(silicon) ?? [])
        .map((bond) => parsedMol.atoms[getOtherAtom(bond, silicon)]?.element)
        .find((element) => ["F", "Cl", "Br", "I"].includes(element ?? ""));

      if (halogen) {
        const halide =
          halogen === "F" ? "fluoride" :
          halogen === "Cl" ? "chloride" :
          halogen === "Br" ? "bromide" : "iodide";
        return {
          name: `${compactLigandPrefix(carbonNames)}silyl ${halide}`,
          confidence: "medium",
          reason: "Built from the substituents attached to the silyl-halide center.",
        };
      }
    }

    if (groupName === "silane" && carbonNames.length > 0) {
      return {
        name: `${compactLigandPrefix(carbonNames)}silane`,
        confidence: "medium",
        reason: "Built from the carbon substituents directly attached to silicon.",
      };
    }
  }

  return null;
}


function alkoxideNameFromBranch(branch: string) {
  const retained: Record<string, string> = {
    methyl: "methoxide",
    ethyl: "ethoxide",
    propyl: "propoxide",
    butyl: "butoxide",
    pentyl: "pentoxide",
  };
  return retained[branch] ?? branch.replace(/yl$/, "olate");
}

function carboxylateNameFromAcid(acidName: string) {
  if (acidName === "benzoic acid") return "benzoate";
  return acidName.replace(/oic acid$/, "oate").replace(/ic acid$/, "ate");
}

function buildIonClassName(
  parsedMol: ParsedMol,
  groupName: string
): FunctionalClassNameResult | null {
  if (groupName === "phenoxide") {
    return {
      name: "phenoxide",
      confidence: "high",
      reason: "Recognized the resonance-stabilized conjugate base of phenol.",
    };
  }

  if (groupName === "alkoxide") {
    for (const oxygen of getCenters(parsedMol, "O")) {
      if ((parsedMol.atoms[oxygen]?.charge ?? 0) >= 0) continue;
      const carbonBond = getSingleBondedNeighbor(parsedMol, oxygen, "C");
      if (!carbonBond) continue;
      const branch = buildBranchName(
        parsedMol,
        getOtherAtom(carbonBond, oxygen),
        oxygen
      ).name;
      return {
        name: alkoxideNameFromBranch(branch),
        confidence: "high",
        reason: "Built from the carbon group attached to the negatively charged oxygen.",
      };
    }
  }

  if (groupName === "carboxylate") {
    for (const carbon of parsedMol.atoms.filter((atom) => atom.element === "C")) {
      if (!isCarbonylCarbon(parsedMol, carbon.atomIndex)) continue;
      const anionicOxygen = (parsedMol.adjacency.get(carbon.atomIndex) ?? []).some(
        (bond) => {
          const oxygen = getOtherAtom(bond, carbon.atomIndex);
          return (
            bond.bondOrder === 1 &&
            parsedMol.atoms[oxygen]?.element === "O" &&
            (parsedMol.atoms[oxygen]?.charge ?? 0) < 0
          );
        }
      );
      if (!anionicOxygen) continue;
      return {
        name: carboxylateNameFromAcid(
          simpleAcidNameFromAcylCarbon(parsedMol, carbon.atomIndex)
        ),
        confidence: "high",
        reason: "Built as the carboxylate conjugate base of the corresponding carboxylic acid.",
      };
    }
  }

  const cationCenters: Array<[string, string]> = [
    ["oxonium ion", "O"],
    ["ammonium ion", "N"],
    ["primary ammonium", "N"],
    ["secondary ammonium", "N"],
    ["tertiary ammonium", "N"],
    ["quaternary ammonium", "N"],
    ["sulfonium ion", "S"],
    ["phosphonium ion", "P"],
  ];

  const cationSpec = cationCenters.find(([name]) => name === groupName);
  if (cationSpec) {
    const [, element] = cationSpec;
    for (const center of getCenters(parsedMol, element)) {
      if ((parsedMol.atoms[center]?.charge ?? 0) <= 0) continue;
      const ligands = carbonBranchNamesAtAtom(parsedMol, center);
      const classSuffix =
        element === "O" ? "oxonium" :
        element === "N" ? "ammonium" :
        element === "S" ? "sulfonium" : "phosphonium";
      return {
        name: ligands.length > 0
          ? `${compactLigandPrefix(ligands)}${classSuffix}`
          : classSuffix,
        confidence: "medium",
        reason: `Built from the carbon substituents attached to the positively charged ${element} center.`,
      };
    }
  }

  if (groupName === "thiolate") {
    for (const sulfur of getCenters(parsedMol, "S")) {
      if ((parsedMol.atoms[sulfur]?.charge ?? 0) >= 0) continue;
      const carbonNames = carbonBranchNamesAtAtom(parsedMol, sulfur);
      if (carbonNames.length === 0) continue;
      return {
        name: `${alkylStem(carbonNames[0])}thiolate`,
        confidence: "medium",
        reason: "Built as the conjugate base of the corresponding thiol.",
      };
    }
  }

  return null;
}

export function getFunctionalClassName(
  parsedMol: ParsedMol,
  functionalGroups: FunctionalGroupResult[],
  mainGroup: FunctionalGroupResult | null
): FunctionalClassNameResult | null {
  const group = getBestSpecialGroup(functionalGroups, mainGroup);
  if (!group) return null;

  const groupName = normalizeFunctionalGroupName(group.name);

  if (
    groupName === "acid anhydride" ||
    groupName === "carbonate ester" ||
    groupName === "carbamate" ||
    groupName === "urea" ||
    groupName === "thioester"
  ) {
    return buildAcidDerivativeClassName(parsedMol, groupName);
  }

  if (
    groupName === "thioether" ||
    groupName === "disulfide" ||
    groupName === "sulfoxide" ||
    groupName === "sulfone" ||
    groupName === "sulfonate ester" ||
    groupName === "sulfonyl chloride"
  ) {
    return buildSulfurClassName(parsedMol, groupName);
  }

  if (groupName === "peroxide" || groupName === "hydroperoxide") {
    return buildPeroxideClassName(parsedMol, groupName);
  }

  if (groupName === "nitrate ester") {
    return buildNitrateEsterName(parsedMol);
  }

  if (
    groupName === "isocyanide" ||
    groupName === "isocyanate" ||
    groupName === "isothiocyanate" ||
    groupName === "n-oxide" ||
    groupName === "hydrazone" ||
    groupName === "aldoxime" ||
    groupName === "ketoxime" ||
    groupName === "aminoxime" ||
    groupName === "nitrone" ||
    groupName === "amidine" ||
    groupName === "guanidine"
  ) {
    return buildNitrogenClassName(parsedMol, groupName);
  }

  if (
    groupName === "boronic acid" ||
    groupName === "alkylborane" ||
    groupName === "boronate monoester" ||
    groupName === "boronate ester" ||
    groupName === "borinic acid" ||
    groupName === "borinic ester" ||
    groupName === "borate ester" ||
    groupName === "organotrifluoroborate"
  ) {
    return buildBoronClassName(parsedMol, groupName);
  }

  if (
    groupName === "phosphine" ||
    groupName.startsWith("phosphate") ||
    groupName.startsWith("phosphonate") ||
    groupName === "phosphodiester" ||
    groupName === "phosphinate" ||
    groupName.includes("phosphine") ||
    groupName === "thiophosphate ester" ||
    groupName === "dithiophosphate" ||
    groupName === "phosphoramidate" ||
    groupName === "phosphoramidite"
  ) {
    return buildPhosphorusClassName(parsedMol, groupName);
  }

  if (
    groupName === "silane" ||
    groupName === "silyl ether" ||
    groupName === "silanol" ||
    groupName === "siloxane" ||
    groupName === "silyl halide" ||
    groupName === "disilane"
  ) {
    return buildSiliconClassName(parsedMol, groupName);
  }

  if (
    groupName === "alkoxide" ||
    groupName === "phenoxide" ||
    groupName === "carboxylate" ||
    groupName === "oxonium ion" ||
    groupName === "ammonium ion" ||
    groupName === "primary ammonium" ||
    groupName === "secondary ammonium" ||
    groupName === "tertiary ammonium" ||
    groupName === "quaternary ammonium" ||
    groupName === "thiolate" ||
    groupName === "sulfonium ion" ||
    groupName === "phosphonium ion"
  ) {
    return buildIonClassName(parsedMol, groupName);
  }
  return null;
}
