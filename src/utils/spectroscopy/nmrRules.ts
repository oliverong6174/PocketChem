import type { HNMRSignal, CNMRSignal } from "./types";

export const HNMR_RULES: Record<string, HNMRSignal[]> = {
  Alcohol: [
    {
      shift: "0.5–5 ppm",
      multiplicity: "variable",
      sourceGroup: "Alcohol",
      explanation: "Hydroxyl proton; position depends on hydrogen bonding.",
    },
  ],
};

export const CNMR_RULES: Record<string, CNMRSignal[]> = {
  Ketone: [
    {
      shift: "190–220 ppm",
      sourceGroup: "Ketone",
      explanation: "Carbonyl carbon of a ketone.",
    },
  ],
};