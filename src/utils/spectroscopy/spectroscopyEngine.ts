import type { FunctionalGroupResult } from "../functionalGroups";
import { predictIRPeaksFromGroups, predictRuleBasedIR } from "./irRules";
import { HNMR_RULES, CNMR_RULES } from "./nmrRules";
import { predictStructureNMR } from "./nmrPrediction";
import { predictMassSpectrum } from "./massSpec";

import type {
  IRPeak,
  HNMRSignal,
  CNMRSignal,
  SpectroscopyResult,
} from "./types";

export function predictIRPeaks(functionalGroups: FunctionalGroupResult[]): IRPeak[] {
  return predictIRPeaksFromGroups(functionalGroups);
}

export function predictHNMRSignals(functionalGroups: FunctionalGroupResult[]): HNMRSignal[] {
  return functionalGroups.flatMap((group) => HNMR_RULES[group.name] ?? []);
}

export function predictCNMRSignals(functionalGroups: FunctionalGroupResult[]): CNMRSignal[] {
  return functionalGroups.flatMap((group) => CNMR_RULES[group.name] ?? []);
}

export function analyzeSpectroscopy(functionalGroups: FunctionalGroupResult[]): SpectroscopyResult {
  return {
    ir: predictIRPeaks(functionalGroups),
    protonNMR: predictHNMRSignals(functionalGroups),
    carbonNMR: predictCNMRSignals(functionalGroups),
  };
}

export async function analyzeMolecularSpectroscopy(input: {
  structure: string;
  functionalGroups: FunctionalGroupResult[];
  formula: string;
  exactMass: number | null;
}): Promise<SpectroscopyResult> {
  const [nmr, ir, massSpec] = await Promise.all([
    predictStructureNMR(input.structure),
    predictRuleBasedIR(input.functionalGroups, input.structure),
    predictMassSpectrum(input.formula, input.exactMass, input.functionalGroups, input.structure),
  ]);
  return {
    ir,
    // Structure-aware NMR now includes exchangeable O-H signals directly from the
    // molecular graph. Do not append legacy functional-group-only OH signals here,
    // because they lack atom identity/shift centers and can create false 0-ppm peaks.
    protonNMR: nmr.protonNMR,
    carbonNMR: nmr.carbonNMR,
    massSpec,
  };
}
