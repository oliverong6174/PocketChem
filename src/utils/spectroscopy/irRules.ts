import type { IRPeak } from "./types";

export const IR_RULES: Record<string, IRPeak[]> = {
  "Carboxylic acid": [
    {
      label: "O-H stretch",
      range: "2500–3300 cm⁻¹",
      intensity: "strong",
      shape: "broad",
      sourceGroup: "Carboxylic acid",
      explanation: "Very broad acidic O-H stretch.",
    },
    {
      label: "C=O stretch",
      range: "1700–1725 cm⁻¹",
      intensity: "strong",
      sourceGroup: "Carboxylic acid",
      explanation: "Strong carbonyl absorption.",
    },
  ],

  Alcohol: [
    {
      label: "O-H stretch",
      range: "3200–3600 cm⁻¹",
      intensity: "strong",
      shape: "broad",
      sourceGroup: "Alcohol",
      explanation: "Broad alcohol O-H stretch from hydrogen bonding.",
    },
  ],

  Ketone: [
    {
      label: "C=O stretch",
      range: "1715 cm⁻¹",
      intensity: "strong",
      sourceGroup: "Ketone",
      explanation: "Strong ketone carbonyl stretch.",
    },
  ],
};