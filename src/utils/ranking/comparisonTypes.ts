export type ComparisonCategory =
  | "Electronic effects"
  | "Stability"
  | "Acid/base & mechanisms"
  | "Diels–Alder & aromatic"
  | "¹H NMR"
  | "¹³C NMR"
  | "IR"
  | "Mass spectrometry"
  | "Physical properties"
  | "Structure & stereochemistry";

export type ComparisonModeId =
  | "ewgStrength"
  | "edgStrength"
  | "inductiveWithdrawal"
  | "resonanceDonation"
  | "resonanceWithdrawal"
  | "anionStability"
  | "cationStability"
  | "radicalStability"
  | "alkeneStability"
  | "conjugateBaseStability"
  | "resonanceStabilization"
  | "aromaticStabilization"
  | "conjugation"
  | "acidity"
  | "basicity"
  | "nucleophilicity"
  | "sn1Reactivity"
  | "sn2Reactivity"
  | "e1Reactivity"
  | "e2Reactivity"
  | "leavingGroupAbility"
  | "electrophilicity"
  | "carbonylReactivity"
  | "dielsAlderDiene"
  | "dielsAlderDienophile"
  | "easReactivity"
  | "easDirecting"
  | "snarReactivity"
  | "protonSignalCount"
  | "mostDownfieldProton"
  | "mostUpfieldProton"
  | "splittingComplexity"
  | "carbonSignalCount"
  | "mostDownfieldCarbon"
  | "mostUpfieldCarbon"
  | "highestIrBand"
  | "lowestIrBand"
  | "strongestIrBand"
  | "molecularIonMz"
  | "basePeakMz"
  | "massFragments"
  | "isotopeProminence"
  | "boilingPoint"
  | "meltingPoint"
  | "solubility"
  | "polarity"
  | "lipophilicity"
  | "hydrogenBonding"
  | "dipoleTendency"
  | "dispersionTendency"
  | "cipPriority"
  | "stericBulk"
  | "conformationalStability";

export type ComparisonModeDefinition = {
  id: ComparisonModeId;
  label: string;
  shortLabel: string;
  category: ComparisonCategory;
  description: string;
  direction: "desc" | "asc" | "none";
  tieTolerance?: number;
  assumption?: string;
};

export type ComparisonMetric = {
  score: number | null;
  headline: string;
  detail: string;
  factors?: string[];
  sortVector?: number[];
};

export type ComparisonProfile = {
  formula: string;
  metrics: Record<ComparisonModeId, ComparisonMetric>;
};
