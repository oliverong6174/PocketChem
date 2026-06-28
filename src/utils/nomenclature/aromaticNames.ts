import type { NamingFeature } from "./types";

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

  return "benzene";
}