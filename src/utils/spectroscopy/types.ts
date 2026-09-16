export type IRPeakIntensity =
  | "veryWeak"
  | "weak"
  | "medium"
  | "strong"
  | "veryStrong"
  | "variable";

export type IRPeakShape =
  | "veryNarrow"
  | "narrow"
  | "sharp"
  | "moderate"
  | "broad"
  | "extremelyBroad"
  | "variable";

export type IRPeakKind = "diagnostic" | "supporting" | "fingerprint";

export type IRBondQuery = {
  /** Element pair for the vibrating bond; order is orientation-independent. */
  elements: readonly [string, string];
  /** Allowed bond orders in the parsed molecular graph. */
  bondOrders?: readonly number[];
  /** Require this bond to belong to a carbon ring. */
  ringOnly?: boolean;
};

export type IRVibrationTarget = {
  /** Resolve one or more chemically defined bonds without inspecting display labels. */
  type: "bonds";
  /** One or more bond patterns participating in the vibration. */
  patterns: readonly IRBondQuery[];
  /** When true, retain all matching bonds from the same selected ring system. */
  expandWithinRing?: boolean;
  /** When true, all matching bonds near the functional-group site are retained. */
  collectAllNearSite?: boolean;
};

export type IRSuppressionClass =
  | "oh-site"
  | "nh-site"
  | "co-site";

export type IROverlapRole =
  | "acidic-oh-envelope"
  | "alkyl-ch"
  | "alkyl-bend";

export type IRPeak = {
  id?: string;
  label: string;
  range: string;
  center?: number;
  intensity: IRPeakIntensity;
  shape?: IRPeakShape;
  widthCm1?: number;
  kind?: IRPeakKind;
  sourceGroup: string;
  explanation: string;
  modifiers?: string[];
  /** Machine-readable structural query for the exact bond(s) responsible for this vibration. */
  vibrationTarget?: IRVibrationTarget;
  /** Generic suppression channel. Higher priority wins for overlapping assignments on the same site. */
  suppressionClass?: IRSuppressionClass;
  suppressionPriority?: number;
  /** Optional typed overlap behavior used by the spectrum/suppression engine. */
  overlapRole?: IROverlapRole;
  /** Zero-based atom indices for the parent functional-group/site assignment. */
  atomIndices?: number[];
  /** Zero-based bond indices for the parent functional-group/site assignment. */
  bondIndices?: number[];
  /** Optional narrower atom set for the actual vibration named by this peak. */
  vibrationAtomIndices?: number[];
  /** Optional narrower bond set for the actual vibration named by this peak. */
  vibrationBondIndices?: number[];
};

export type HNMRSignal = {
  shift: string;
  shiftCenter?: number;
  multiplicity: string;
  integration?: string;
  protonCount?: number;
  atomIndices?: number[];
  sourceGroup: string;
  explanation: string;
};

export type CNMRSignal = {
  shift: string;
  shiftCenter?: number;
  carbonCount?: number;
  atomIndices?: number[];
  sourceGroup: string;
  explanation: string;
};

export type MassSpectrumPeakKind =
  | "molecular-ion"
  | "isotope"
  | "fragment"
  | "diagnostic";

export type MassSpectrumPeak = {
  mz: number;
  relativeIntensity: number;
  label: string;
  kind: MassSpectrumPeakKind;
  explanation: string;
  /** Optional actual fragment SMILES for fragment/diagnostic ions. */
  fragmentSmiles?: string;
  /** Structure source displayed when this peak is selected. May be an intact isotopologue. */
  previewStructure?: string;
  /** Short species label drawn directly on the selected mass-spectrum preview. */
  previewLabel?: string;
  /** Optional additional isotope-contributor labels shown on the selected preview. */
  previewContributorLabels?: string[];
  /** Alternate molecular drawings that contribute to the same isotope-envelope peak. */
  previewAlternatives?: Array<{
    structure: string;
    label: string;
  }>;
};

export type MassSpectrumResult = {
  formula: string;
  molecularIonMz: number | null;
  nominalMass: number | null;
  basePeakMz: number | null;
  peaks: MassSpectrumPeak[];
  notes: string[];
};

export type SpectroscopyResult = {
  ir: IRPeak[];
  protonNMR: HNMRSignal[];
  carbonNMR: CNMRSignal[];
  massSpec?: MassSpectrumResult;
};
