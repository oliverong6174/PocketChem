import type { FunctionalGroupResult } from "../functionalGroups";
import { IR_RULES } from "./irRules";
import { HNMR_RULES, CNMR_RULES } from "./nmrRules";

import type {
  IRPeak,
  HNMRSignal,
  CNMRSignal,
  SpectroscopyResult,
} from "./types";

export function predictIRPeaks(
  functionalGroups: FunctionalGroupResult[]
): IRPeak[] {
  return functionalGroups.flatMap(
    (group) => IR_RULES[group.name] ?? []
  );
}

export function predictHNMRSignals(
  functionalGroups: FunctionalGroupResult[]
): HNMRSignal[] {
  return functionalGroups.flatMap(
    (group) => HNMR_RULES[group.name] ?? []
  );
}

export function predictCNMRSignals(
  functionalGroups: FunctionalGroupResult[]
): CNMRSignal[] {
  return functionalGroups.flatMap(
    (group) => CNMR_RULES[group.name] ?? []
  );
}

export function analyzeSpectroscopy(
  functionalGroups: FunctionalGroupResult[]
): SpectroscopyResult {
  return {
    ir: predictIRPeaks(functionalGroups),
    protonNMR: predictHNMRSignals(functionalGroups),
    carbonNMR: predictCNMRSignals(functionalGroups),
  };
}