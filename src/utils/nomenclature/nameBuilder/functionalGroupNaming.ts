import type { FunctionalGroupResult } from "../../functionalGroups/types";
import { normalizeFunctionalGroupName as normalizeGroupName } from "../../functionalGroups/groupIds";

export type RetainedHeterocycleSpec = {
  groupName: string;
  parentHydrocarbon: string;
  parentStem: string;
  prefix: string;
  ringElements: string[];
  aromatic: boolean;
};

export const DEFAULT_RETAINED_HETEROCYCLE_SPECS: RetainedHeterocycleSpec[] = [
  {
    groupName: "Epoxide",
    parentHydrocarbon: "oxirane",
    parentStem: "oxiran",
    prefix: "epoxy",
    ringElements: ["O", "C", "C"],
    aromatic: false,
  },
  {
    groupName: "Oxetane",
    parentHydrocarbon: "oxetane",
    parentStem: "oxetan",
    prefix: "oxetanyl",
    ringElements: ["O", "C", "C", "C"],
    aromatic: false,
  },
  {
    groupName: "Aziridine",
    parentHydrocarbon: "aziridine",
    parentStem: "aziridin",
    prefix: "aziridinyl",
    ringElements: ["N", "C", "C"],
    aromatic: false,
  },
  {
    groupName: "Thiirane",
    parentHydrocarbon: "thiirane",
    parentStem: "thiiran",
    prefix: "thiiranyl",
    ringElements: ["S", "C", "C"],
    aromatic: false,
  },

  // Common retained aromatic heterocycles. The element order is the retained
  // numbering order, so locant 1 starts at the senior heteroatom and the two
  // possible directions are compared using substituent locants.
  {
    groupName: "Pyridine",
    parentHydrocarbon: "pyridine",
    parentStem: "pyridin",
    prefix: "pyridinyl",
    ringElements: ["N", "C", "C", "C", "C", "C"],
    aromatic: true,
  },
  {
    groupName: "Pyrrole",
    parentHydrocarbon: "pyrrole",
    parentStem: "pyrrol",
    prefix: "pyrrolyl",
    ringElements: ["N", "C", "C", "C", "C"],
    aromatic: true,
  },
  {
    groupName: "Furan",
    parentHydrocarbon: "furan",
    parentStem: "furan",
    prefix: "furyl",
    ringElements: ["O", "C", "C", "C", "C"],
    aromatic: true,
  },
  {
    groupName: "Thiophene",
    parentHydrocarbon: "thiophene",
    parentStem: "thiophen",
    prefix: "thienyl",
    ringElements: ["S", "C", "C", "C", "C"],
    aromatic: true,
  },
  {
    groupName: "Imidazole",
    parentHydrocarbon: "imidazole",
    parentStem: "imidazol",
    prefix: "imidazolyl",
    ringElements: ["N", "C", "N", "C", "C"],
    aromatic: true,
  },
  {
    groupName: "Pyrazole",
    parentHydrocarbon: "pyrazole",
    parentStem: "pyrazol",
    prefix: "pyrazolyl",
    ringElements: ["N", "N", "C", "C", "C"],
    aromatic: true,
  },
  {
    groupName: "Oxazole",
    parentHydrocarbon: "oxazole",
    parentStem: "oxazol",
    prefix: "oxazolyl",
    ringElements: ["O", "C", "N", "C", "C"],
    aromatic: true,
  },
  {
    groupName: "Isoxazole",
    parentHydrocarbon: "isoxazole",
    parentStem: "isoxazol",
    prefix: "isoxazolyl",
    ringElements: ["O", "N", "C", "C", "C"],
    aromatic: true,
  },
  {
    groupName: "Thiazole",
    parentHydrocarbon: "thiazole",
    parentStem: "thiazol",
    prefix: "thiazolyl",
    ringElements: ["S", "C", "N", "C", "C"],
    aromatic: true,
  },
  {
    groupName: "Isothiazole",
    parentHydrocarbon: "isothiazole",
    parentStem: "isothiazol",
    prefix: "isothiazolyl",
    ringElements: ["S", "N", "C", "C", "C"],
    aromatic: true,
  },
  {
    groupName: "Pyrimidine",
    parentHydrocarbon: "pyrimidine",
    parentStem: "pyrimidin",
    prefix: "pyrimidinyl",
    ringElements: ["N", "C", "N", "C", "C", "C"],
    aromatic: true,
  },
];

const PREFIX_ONLY_SUFFIXES = new Set([
  "never suffix",
  "rare",
]);

const UNSAFE_PRIMARY_NAMES = new Set([
  "hemiacetal",
  "hemiketal",
  "acetal",
  "ketal",
  "ether",
  "aryl ether",
  "thioether",
  "peroxide",
  "aldol",
  "benzoin",
  "ketene",
  "enamine",
  "isocyanide",
  "isocyanate",
]);

export function normalizeFunctionalGroupName(name: string) {
  return normalizeGroupName(name);
}

export function normalizeFunctionalGroupSuffix(suffix: string | null | undefined) {
  return suffix?.trim().toLowerCase().replace(/^-/, "") ?? "";
}

export function isInformationalOrUnsafeSuffix(suffix: string | null | undefined) {
  const cleanSuffix = normalizeFunctionalGroupSuffix(suffix);

  if (!cleanSuffix) return true;
  if (PREFIX_ONLY_SUFFIXES.has(cleanSuffix)) return true;

  return (
    cleanSuffix.includes("usually named") ||
    cleanSuffix.includes("named as") ||
    cleanSuffix.includes("substituted benzene") ||
    cleanSuffix.includes("substituted aniline") ||
    cleanSuffix.includes("use common name") ||
    cleanSuffix.includes("retained name") ||
    cleanSuffix.includes("derivative")
  );
}

export function isUnsafePrimaryGroup(group: FunctionalGroupResult) {
  const name = normalizeFunctionalGroupName(group.name);
  const suffix = normalizeFunctionalGroupSuffix(group.suffix);

  if (UNSAFE_PRIMARY_NAMES.has(name)) return true;
  if (isInformationalOrUnsafeSuffix(suffix)) return true;

  return false;
}

export function getRetainedHeterocycleSpecFromGroup(
  group: FunctionalGroupResult
) {
  const groupName = normalizeFunctionalGroupName(group.name);
  const suffix = normalizeFunctionalGroupSuffix(group.suffix);

  return (
    DEFAULT_RETAINED_HETEROCYCLE_SPECS.find((spec) => {
      const specName = normalizeFunctionalGroupName(spec.groupName);
      const parentName = normalizeFunctionalGroupName(spec.parentHydrocarbon);

      return (
        groupName === specName ||
        groupName === parentName ||
        suffix === specName ||
        suffix === parentName
      );
    }) ?? null
  );
}

export function getRetainedHeterocycleSpecsFromGroups(
  functionalGroups: FunctionalGroupResult[]
) {
  const detectedSpecs = functionalGroups
    .map(getRetainedHeterocycleSpecFromGroup)
    .filter((spec): spec is RetainedHeterocycleSpec => spec !== null);

  // Detected specs come first so the engine does not needlessly scan every
  // possible heterocycle for each molecule. Defaults are retained for the
  // small saturated rings because overlap filtering can occasionally suppress
  // their specific pattern in favor of another oxygen/nitrogen group.
  const fallbackNames = new Set(["oxirane", "oxetane", "aziridine", "thiirane"]);
  const fallbackSpecs = DEFAULT_RETAINED_HETEROCYCLE_SPECS.filter((spec) =>
    fallbackNames.has(spec.parentHydrocarbon)
  );

  const merged = new Map<string, RetainedHeterocycleSpec>();

  for (const spec of [...detectedSpecs, ...fallbackSpecs]) {
    merged.set(spec.parentHydrocarbon, spec);
  }

  return Array.from(merged.values());
}
