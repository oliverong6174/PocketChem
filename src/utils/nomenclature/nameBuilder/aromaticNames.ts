import type { NamingFeature } from "../types";

export function getSimpleBenzeneDerivativeName(
  primaryFeature: NamingFeature | null
) {
  if (!primaryFeature) return "benzene";

  if (primaryFeature.type === "alcohol") return "phenol";
  if (primaryFeature.type === "amine") return "aniline";
  if (primaryFeature.type === "carboxylicAcid") return "benzoic acid";
  if (primaryFeature.type === "aldehyde") return "benzaldehyde";
  if (primaryFeature.type === "nitrile") return "benzonitrile";
  if (primaryFeature.type === "amide") return "benzamide";
  if (primaryFeature.type === "acidChloride") return "benzoyl chloride";
  if (primaryFeature.type === "sulfonicAcid") return "benzenesulfonic acid";
  if (primaryFeature.type === "sulfinicAcid") return "benzenesulfinic acid";
  if (primaryFeature.type === "sulfenicAcid") return "benzenesulfenic acid";
  if (primaryFeature.type === "sulfonamide") return "benzenesulfonamide";

  return "benzene";
}