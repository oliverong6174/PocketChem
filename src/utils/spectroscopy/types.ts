export type IRPeakIntensity =
  | "weak"
  | "medium"
  | "strong"
  | "variable";

export type IRPeakShape =
  | "sharp"
  | "broad"
  | "variable";

export type IRPeak = {
  label: string;
  range: string;
  intensity: IRPeakIntensity;
  shape?: IRPeakShape;

  sourceGroup: string;

  explanation: string;
};

export type HNMRSignal = {
  shift: string;
  multiplicity: string;
  integration?: string;

  sourceGroup: string;

  explanation: string;
};

export type CNMRSignal = {
  shift: string;

  sourceGroup: string;

  explanation: string;
};

export type SpectroscopyResult = {
  ir: IRPeak[];
  protonNMR: HNMRSignal[];
  carbonNMR: CNMRSignal[];
};