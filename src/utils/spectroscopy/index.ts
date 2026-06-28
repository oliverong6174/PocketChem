export {
  analyzeSpectroscopy,
  predictIRPeaks,
  predictHNMRSignals,
  predictCNMRSignals,
} from "./spectroscopyEngine";

export { IR_RULES } from "./irRules";
export { HNMR_RULES, CNMR_RULES } from "./nmrRules";

export type {
  IRPeak,
  IRPeakIntensity,
  IRPeakShape,
  HNMRSignal,
  CNMRSignal,
  SpectroscopyResult,
} from "./types";