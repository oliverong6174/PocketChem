import type { HNMRSignal, CNMRSignal } from "./types";

function exchangeable(
  sourceGroup: string,
  shift: string,
  integration: string,
  explanation: string,
): HNMRSignal {
  return {
    shift,
    multiplicity: "broad singlet / variable",
    integration,
    protonCount: Number.parseInt(integration, 10) || 1,
    sourceGroup,
    explanation,
  };
}

export const HNMR_RULES: Record<string, HNMRSignal[]> = {
  Alcohol: [exchangeable("Alcohol", "0.5–5.5 ppm", "1H", "Alcohol O–H protons are exchangeable; shift and line shape depend strongly on solvent, concentration, and hydrogen bonding.")],
  "Primary alcohol": [exchangeable("Primary alcohol", "0.5–5.5 ppm", "1H", "Exchangeable alcohol O–H proton.")],
  "Secondary alcohol": [exchangeable("Secondary alcohol", "0.5–5.5 ppm", "1H", "Exchangeable alcohol O–H proton.")],
  "Tertiary alcohol": [exchangeable("Tertiary alcohol", "0.5–5.5 ppm", "1H", "Exchangeable alcohol O–H proton.")],
  "Benzyl alcohol": [exchangeable("Benzyl alcohol", "1–5.5 ppm", "1H", "Exchangeable benzyl-alcohol O–H proton.")],
  Phenol: [exchangeable("Phenol", "4–12 ppm", "1H", "Phenolic O–H is exchangeable and often appears farther downfield than an aliphatic alcohol.")],
  "Carboxylic acid": [exchangeable("Carboxylic acid", "10–13 ppm", "1H", "The strongly hydrogen-bonded carboxylic-acid proton is characteristically broad and downfield.")],
  "Benzoic acid": [exchangeable("Benzoic acid", "10–13 ppm", "1H", "Carboxylic-acid O–H proton.")],
  "Cinnamic acid": [exchangeable("Cinnamic acid", "10–13 ppm", "1H", "Carboxylic-acid O–H proton.")],
  "Primary amine": [exchangeable("Primary amine", "1–5 ppm", "2H", "Primary-amine N–H protons are exchangeable and often broadened.")],
  "Secondary amine": [exchangeable("Secondary amine", "1–5 ppm", "1H", "Secondary-amine N–H proton is exchangeable and often broadened.")],
  Aniline: [exchangeable("Aniline", "3–6 ppm", "2H", "Aryl-amine N–H protons are exchangeable and can be broadened.")],
  "Primary aryl amine": [exchangeable("Primary aryl amine", "3–6 ppm", "2H", "Aryl-amine N–H protons are exchangeable.")],
  "Secondary aryl amine": [exchangeable("Secondary aryl amine", "3–6 ppm", "1H", "Aryl-amine N–H proton is exchangeable.")],
  "Primary amide": [exchangeable("Primary amide", "5–9 ppm", "2H", "Amide N–H protons are exchangeable and commonly broad.")],
  "Secondary amide": [exchangeable("Secondary amide", "5–9 ppm", "1H", "Amide N–H proton is exchangeable and commonly broad.")],
  Thiol: [exchangeable("Thiol", "1–4 ppm", "1H", "Thiol S–H is exchangeable and variable in chemical shift.")],
};

// Kept for backwards compatibility with the earlier functional-group-only API.
export const CNMR_RULES: Record<string, CNMRSignal[]> = {
  Ketone: [{ shift: "190–220 ppm", shiftCenter: 205, sourceGroup: "Ketone", explanation: "Carbonyl carbon of a ketone." }],
};
