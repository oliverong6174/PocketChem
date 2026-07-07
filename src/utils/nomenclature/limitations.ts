import type {
  NamingFeature,
  ParentDescriptor,
  Substituent,
} from "./types";

import { hasComplexSubstituent } from "./substituents";

export function buildLimitations(
  parent: ParentDescriptor,
  features: NamingFeature[],
  substituents: Substituent[]
): string[] {
  const limitations: string[] = [];

  if (parent.carbonCount > 10) {
    limitations.push(
      "Parent chains longer than ten carbons have limited naming support."
    );
  }

  if (
    features.some(
      (feature) =>
        feature.locants.length > 1 &&
        (feature.type === "ester" ||
          feature.type === "amide" ||
          feature.type === "acidChloride")
    )
  ) {
    limitations.push(
      "Multiple high-priority functional groups are still under active development."
    );
  }

  if (hasComplexSubstituent(substituents)) {
    limitations.push(
      "Complex or branched substituents may not yet receive complete systematic names."
    );
  }

  if (
    parent.kind === "ring" &&
    !parent.aromaticRing &&
    substituents.length > 3
  ) {
    limitations.push(
      "Highly substituted cycloalkanes may not always receive optimal numbering."
    );
  }

  if (
    parent.aromaticRing &&
    substituents.length > 2
  ) {
    limitations.push(
      "Multi-substituted aromatic nomenclature is still being expanded."
    );
  }

  if (
    features.some(
      (feature) =>
        feature.type === "ester" &&
        feature.alkylName?.includes("en")
    )
  ) {
    limitations.push(
      "Unsaturated alkoxy ester naming is still experimental."
    );
  }

  if (
    features.some(
      (feature) =>
        feature.type === "acidChloride"
    )
  ) {
    limitations.push(
      "Acid halide naming support is currently limited to common acyclic structures."
    );
  }

  return limitations;
}