import type { FunctionalGroupResult } from "../../functionalGroups/types";
import { toFunctionalGroupId } from "../../functionalGroups/groupIds";
import { getNamingIntent } from "./namingIntent";
import { getRetainedHeterocycleSpecFromGroup } from "./functionalGroupNaming";

/**
 * Groups that are intentionally represented as prefixes/parent motifs rather
 * than by a dedicated suffix or functional-class builder.
 *
 * If a newly added high-priority functional group is not in one of the
 * supported routes, PocketChem should say that naming is unsupported instead
 * of silently returning a plausible hydrocarbon name.
 */
const PREFIX_OR_PARENT_SUPPORTED_GROUPS = new Set([
  "alkane",
  "alkene",
  "alkyne",
  "diene",
  "triene",
  "enyne",
  "terminalAlkyne",
  "internalAlkyne",
  "cycloalkane",
  "benzene",
  "alkylbenzene",
  "toluene",
  "arylHalide",
  "haloalkane",
  "halogen",
  "ether",
  "arylEther",
  "acetal",
  "hemiacetal",
  "ketal",
  "hemiketal",
  "nitro",
  "nitroso",
  "azide",
  "azo",
  "diazo",
  "enamine",
  "ketene",
]);

export type NamingGuardResult = {
  blocked: boolean;
  reason: string | null;
};

export function getNamingGuardResult(
  mainGroup: FunctionalGroupResult | null
): NamingGuardResult {
  if (!mainGroup) return { blocked: false, reason: null };

  const intent = getNamingIntent(mainGroup);
  if (intent.featureType) return { blocked: false, reason: null };

  if (getRetainedHeterocycleSpecFromGroup(mainGroup)) {
    return { blocked: false, reason: null };
  }

  const groupId = toFunctionalGroupId(mainGroup.name);
  if (PREFIX_OR_PARENT_SUPPORTED_GROUPS.has(groupId)) {
    return { blocked: false, reason: null };
  }

  // Motifs/scaffolds are descriptive annotations and should not by themselves
  // invalidate an otherwise nameable molecule.
  if (mainGroup.category === "motif" || mainGroup.category === "scaffold") {
    return { blocked: false, reason: null };
  }

  return {
    blocked: true,
    reason: `PocketChem recognizes ${mainGroup.name}, but does not yet have a reliable nomenclature route for that functional group.`,
  };
}
