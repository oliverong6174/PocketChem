import type {
  NamingFeature,
  NomenclatureResult,
  ParentDescriptor,
} from "./types";

export function getNamingConfidence(
  parent: ParentDescriptor,
  lowerPriorityFeatures: NamingFeature[]
): NomenclatureResult["namingConfidence"] {
  if (parent.aromaticRing && lowerPriorityFeatures.length === 0) {
    return "High";
  }

  if (parent.kind === "ring" && lowerPriorityFeatures.length > 0) {
    return "Medium";
  }

  if (lowerPriorityFeatures.length > 1) {
    return "Low";
  }

  return "Medium";
}