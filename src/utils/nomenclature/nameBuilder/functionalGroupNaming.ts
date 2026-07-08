import type { FunctionalGroupResult } from "../../functionalGroups/types";

export type RetainedHeterocycleSpec = {
  groupName: string;
  parentHydrocarbon: string;
  parentStem: string;
  prefix: string;
  heteroElement: "O" | "N" | "S";
  ringSize: number;
  carbonCount: number;
};

export const DEFAULT_RETAINED_HETEROCYCLE_SPECS: RetainedHeterocycleSpec[] = [
  {
    groupName: "Epoxide",
    parentHydrocarbon: "oxirane",
    parentStem: "oxiran",
    prefix: "epoxy",
    heteroElement: "O",
    ringSize: 3,
    carbonCount: 2,
  },
  {
    groupName: "Oxetane",
    parentHydrocarbon: "oxetane",
    parentStem: "oxetan",
    prefix: "oxetanyl",
    heteroElement: "O",
    ringSize: 4,
    carbonCount: 3,
  },
  {
    groupName: "Aziridine",
    parentHydrocarbon: "aziridine",
    parentStem: "aziridin",
    prefix: "aziridinyl",
    heteroElement: "N",
    ringSize: 3,
    carbonCount: 2,
  },
  {
    groupName: "Thiirane",
    parentHydrocarbon: "thiirane",
    parentStem: "thiiran",
    prefix: "thiiranyl",
    heteroElement: "S",
    ringSize: 3,
    carbonCount: 2,
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
  return name.trim().toLowerCase();
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

  const merged = new Map<string, RetainedHeterocycleSpec>();

  for (const spec of [
    ...detectedSpecs,
    ...DEFAULT_RETAINED_HETEROCYCLE_SPECS,
  ]) {
    merged.set(spec.parentHydrocarbon, spec);
  }

  return Array.from(merged.values());
}