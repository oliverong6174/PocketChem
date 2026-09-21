import type {
  IRBandFamily,
  IRPeak,
  IRPeakIntensity,
  IRPeakShape,
  IRVibrationMode,
} from "./types";

export type IRBandProfile =
  | "sharp"
  | "carbonyl"
  | "asymmetric-sharp"
  | "family"
  | "broad"
  | "very-broad";

export type IRRenderBand = {
  id: string;
  physicalKey: string;
  family: IRBandFamily;
  mode: IRVibrationMode;
  center: number;
  widthCm1: number;
  referenceWidthCm1: number;
  integratedStrength: number;
  profile: IRBandProfile;
  representative: IRPeak;
  members: IRPeak[];
};

type ModeCalibration = {
  targetMinT: readonly [number, number];
  referenceWidthCm1: number;
  widthRange: readonly [number, number];
  profile: IRBandProfile;
  nominalIntensity: IRPeakIntensity;
};

const MODE_CALIBRATION: Partial<Record<IRVibrationMode, ModeCalibration>> = {
  "aldehyde-carbonyl": { targetMinT: [0.2, 5], referenceWidthCm1: 17, widthRange: [13, 24], profile: "carbonyl", nominalIntensity: "veryStrong" },
  "ketone-carbonyl": { targetMinT: [0.5, 8], referenceWidthCm1: 17, widthRange: [13, 24], profile: "carbonyl", nominalIntensity: "veryStrong" },
  "ester-carbonyl": { targetMinT: [0.3, 7], referenceWidthCm1: 18, widthRange: [14, 24], profile: "carbonyl", nominalIntensity: "veryStrong" },
  "acid-carbonyl": { targetMinT: [0.5, 10], referenceWidthCm1: 18, widthRange: [14, 26], profile: "carbonyl", nominalIntensity: "veryStrong" },
  "amide-carbonyl": { targetMinT: [0.3, 8], referenceWidthCm1: 18, widthRange: [14, 26], profile: "carbonyl", nominalIntensity: "veryStrong" },
  "lactone-carbonyl": { targetMinT: [0.3, 7], referenceWidthCm1: 17, widthRange: [13, 24], profile: "carbonyl", nominalIntensity: "veryStrong" },
  "anhydride-carbonyl-low": { targetMinT: [2, 15], referenceWidthCm1: 16, widthRange: [12, 22], profile: "carbonyl", nominalIntensity: "veryStrong" },
  "anhydride-carbonyl-high": { targetMinT: [2, 15], referenceWidthCm1: 16, widthRange: [12, 22], profile: "carbonyl", nominalIntensity: "veryStrong" },
  "carbamate-carbonyl": { targetMinT: [1, 12], referenceWidthCm1: 18, widthRange: [14, 26], profile: "carbonyl", nominalIntensity: "veryStrong" },
  "acyl-halide-carbonyl": { targetMinT: [0.5, 10], referenceWidthCm1: 16, widthRange: [12, 22], profile: "carbonyl", nominalIntensity: "veryStrong" },
  "generic-carbonyl": { targetMinT: [2, 18], referenceWidthCm1: 18, widthRange: [13, 26], profile: "carbonyl", nominalIntensity: "strong" },

  "aromatic-ch": { targetMinT: [84, 94], referenceWidthCm1: 8, widthRange: [6, 11], profile: "asymmetric-sharp", nominalIntensity: "veryWeak" },
  "vinylic-ch": { targetMinT: [78, 92], referenceWidthCm1: 9, widthRange: [7, 12], profile: "asymmetric-sharp", nominalIntensity: "weak" },
  "ch2-asymmetric": { targetMinT: [30, 50], referenceWidthCm1: 15, widthRange: [10, 20], profile: "family", nominalIntensity: "strong" },
  "ch2-symmetric": { targetMinT: [74, 90], referenceWidthCm1: 13, widthRange: [9, 18], profile: "family", nominalIntensity: "medium" },
  "ch3-asymmetric": { targetMinT: [55, 75], referenceWidthCm1: 15, widthRange: [10, 20], profile: "family", nominalIntensity: "strong" },
  "ch3-symmetric": { targetMinT: [78, 91], referenceWidthCm1: 13, widthRange: [9, 18], profile: "family", nominalIntensity: "medium" },
  "aldehyde-fermi-low": { targetMinT: [55, 80], referenceWidthCm1: 8, widthRange: [6, 12], profile: "asymmetric-sharp", nominalIntensity: "weak" },
  "aldehyde-fermi-high": { targetMinT: [55, 80], referenceWidthCm1: 8, widthRange: [6, 12], profile: "asymmetric-sharp", nominalIntensity: "weak" },
  "terminal-alkyne-ch": { targetMinT: [42, 72], referenceWidthCm1: 8, widthRange: [6, 11], profile: "sharp", nominalIntensity: "strong" },

  "alcohol-oh": { targetMinT: [15, 45], referenceWidthCm1: 130, widthRange: [95, 190], profile: "broad", nominalIntensity: "strong" },
  "phenol-oh": { targetMinT: [20, 55], referenceWidthCm1: 135, widthRange: [95, 200], profile: "broad", nominalIntensity: "strong" },
  "acid-oh": { targetMinT: [20, 55], referenceWidthCm1: 330, widthRange: [260, 430], profile: "very-broad", nominalIntensity: "strong" },
  "primary-amide-nh-asymmetric": { targetMinT: [25, 55], referenceWidthCm1: 28, widthRange: [18, 45], profile: "asymmetric-sharp", nominalIntensity: "medium" },
  "primary-amide-nh-symmetric": { targetMinT: [25, 58], referenceWidthCm1: 30, widthRange: [20, 48], profile: "asymmetric-sharp", nominalIntensity: "medium" },
  "secondary-amide-nh": { targetMinT: [15, 40], referenceWidthCm1: 45, widthRange: [32, 70], profile: "broad", nominalIntensity: "medium" },
  "amine-nh": { targetMinT: [35, 70], referenceWidthCm1: 22, widthRange: [14, 38], profile: "asymmetric-sharp", nominalIntensity: "medium" },
  "thiol-sh": { targetMinT: [55, 85], referenceWidthCm1: 15, widthRange: [10, 26], profile: "sharp", nominalIntensity: "weak" },

  "nitrile-stretch": { targetMinT: [8, 28], referenceWidthCm1: 7, widthRange: [5, 10], profile: "sharp", nominalIntensity: "strong" },
  "alkyne-stretch": { targetMinT: [55, 85], referenceWidthCm1: 9, widthRange: [6, 14], profile: "sharp", nominalIntensity: "weak" },
  "alkene-stretch": { targetMinT: [55, 82], referenceWidthCm1: 12, widthRange: [8, 18], profile: "sharp", nominalIntensity: "medium" },
  "aromatic-ring-1600": { targetMinT: [45, 72], referenceWidthCm1: 9, widthRange: [7, 13], profile: "sharp", nominalIntensity: "medium" },
  "aromatic-ring-1580": { targetMinT: [55, 80], referenceWidthCm1: 9, widthRange: [7, 13], profile: "sharp", nominalIntensity: "weak" },
  "aromatic-ring-1500": { targetMinT: [42, 72], referenceWidthCm1: 9, widthRange: [7, 13], profile: "sharp", nominalIntensity: "medium" },
  "amide-ii": { targetMinT: [35, 65], referenceWidthCm1: 10, widthRange: [8, 15], profile: "sharp", nominalIntensity: "medium" },

  "ester-co-low": { targetMinT: [18, 50], referenceWidthCm1: 11, widthRange: [8, 17], profile: "sharp", nominalIntensity: "strong" },
  "ester-co-high": { targetMinT: [18, 50], referenceWidthCm1: 11, widthRange: [8, 17], profile: "sharp", nominalIntensity: "strong" },
  "alcohol-co": { targetMinT: [25, 60], referenceWidthCm1: 14, widthRange: [9, 22], profile: "sharp", nominalIntensity: "strong" },
  "phenol-co": { targetMinT: [25, 60], referenceWidthCm1: 14, widthRange: [9, 22], profile: "sharp", nominalIntensity: "strong" },
  "amine-cn": { targetMinT: [45, 78], referenceWidthCm1: 14, widthRange: [9, 24], profile: "sharp", nominalIntensity: "medium" },
  "aromatic-oop": { targetMinT: [32, 70], referenceWidthCm1: 10, widthRange: [7, 15], profile: "sharp", nominalIntensity: "medium" },
  "alkyl-bend": { targetMinT: [48, 78], referenceWidthCm1: 11, widthRange: [8, 17], profile: "sharp", nominalIntensity: "medium" },
  "generic-fingerprint": { targetMinT: [70, 94], referenceWidthCm1: 8, widthRange: [5, 13], profile: "sharp", nominalIntensity: "weak" },
  generic: { targetMinT: [58, 88], referenceWidthCm1: 16, widthRange: [8, 40], profile: "sharp", nominalIntensity: "medium" },
};

const FAMILY_FALLBACK: Record<IRBandFamily, ModeCalibration> = {
  carbonyl: MODE_CALIBRATION["generic-carbonyl"]!,
  xh: { targetMinT: [35, 75], referenceWidthCm1: 30, widthRange: [14, 150], profile: "broad", nominalIntensity: "medium" },
  "aromatic-ch": MODE_CALIBRATION["aromatic-ch"]!,
  "vinylic-ch": MODE_CALIBRATION["vinylic-ch"]!,
  "alkyl-ch": { targetMinT: [55, 82], referenceWidthCm1: 14, widthRange: [9, 20], profile: "family", nominalIntensity: "medium" },
  "aldehyde-ch": MODE_CALIBRATION["aldehyde-fermi-high"]!,
  nitrile: MODE_CALIBRATION["nitrile-stretch"]!,
  alkyne: MODE_CALIBRATION["alkyne-stretch"]!,
  alkene: MODE_CALIBRATION["alkene-stretch"]!,
  "aromatic-ring": { targetMinT: [48, 78], referenceWidthCm1: 9, widthRange: [7, 14], profile: "sharp", nominalIntensity: "medium" },
  "amide-ii": MODE_CALIBRATION["amide-ii"]!,
  fingerprint: MODE_CALIBRATION["generic-fingerprint"]!,
  other: MODE_CALIBRATION.generic!,
};

const INTENSITY_SCALE: Record<IRPeakIntensity, number> = {
  veryWeak: 0.50,
  weak: 0.72,
  medium: 0.90,
  variable: 0.90,
  strong: 1.00,
  veryStrong: 1.12,
};

const INTENSITY_RANK: Record<IRPeakIntensity, number> = {
  veryWeak: 0,
  weak: 1,
  medium: 2,
  variable: 2,
  strong: 3,
  veryStrong: 4,
};

const PROFILE_AREA_FACTOR: Record<IRBandProfile, number> = {
  sharp: 2.54,
  carbonyl: 2.72,
  "asymmetric-sharp": 2.70,
  family: 3.05,
  broad: 3.45,
  "very-broad": 4.60,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseCenter(range: string) {
  const values = range.match(/\d{3,4}/g)?.map(Number) ?? [];
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  return (Math.min(...values) + Math.max(...values)) / 2;
}

function centerOf(peak: IRPeak) {
  return peak.center ?? parseCenter(peak.range);
}

function familyOf(peak: IRPeak): IRBandFamily {
  if (peak.family) return peak.family;
  return peak.kind === "fingerprint" ? "fingerprint" : "other";
}

function modeOf(peak: IRPeak): IRVibrationMode {
  if (peak.mode) return peak.mode;
  return peak.kind === "fingerprint" ? "generic-fingerprint" : "generic";
}

/** Compatibility export: classification is metadata-only; no label parsing. */
export function classifyIrPeak(peak: IRPeak): IRBandFamily {
  return familyOf(peak);
}

function siteKey(peak: IRPeak) {
  const bonds = peak.vibrationBondIndices?.length
    ? peak.vibrationBondIndices
    : peak.bondIndices?.length
      ? peak.bondIndices
      : [];
  if (bonds.length > 0) return `b:${[...bonds].sort((a, b) => a - b).join(",")}`;

  const atoms = peak.vibrationAtomIndices?.length
    ? peak.vibrationAtomIndices
    : peak.atomIndices?.length
      ? peak.atomIndices
      : [];
  if (atoms.length > 0) return `a:${[...atoms].sort((a, b) => a - b).join(",")}`;
  return "site:unknown";
}

function genericMode(mode: IRVibrationMode) {
  return mode === "generic" || mode === "generic-carbonyl" || mode === "generic-fingerprint";
}

function modesCompatible(a: IRVibrationMode, b: IRVibrationMode, family: IRBandFamily) {
  if (a === b) return true;
  if (family === "carbonyl" && (a === "generic-carbonyl" || b === "generic-carbonyl")) return true;
  if (genericMode(a) || genericMode(b)) return true;
  return false;
}

function mergeTolerance(family: IRBandFamily, mode: IRVibrationMode) {
  if (mode === "aldehyde-fermi-low" || mode === "aldehyde-fermi-high") return 12;
  switch (family) {
    case "carbonyl": return 28;
    case "xh": return 35;
    case "aromatic-ch": return 18;
    case "vinylic-ch": return 18;
    case "alkyl-ch": return 7;
    case "nitrile": return 18;
    case "alkyne": return 18;
    case "alkene": return 16;
    case "aromatic-ring": return 10;
    case "amide-ii": return 14;
    case "fingerprint": return 7;
    default: return 8;
  }
}

function representativeScore(peak: IRPeak) {
  const kindScore = peak.kind === "diagnostic" ? 30 : peak.kind === "supporting" ? 20 : 10;
  const siteScore = (peak.vibrationBondIndices?.length ?? 0) > 0 || (peak.vibrationAtomIndices?.length ?? 0) > 0 ? 8 : 0;
  const typedScore = peak.family && peak.mode ? 8 : 0;
  return kindScore + siteScore + typedScore + INTENSITY_RANK[peak.intensity] * 3;
}

function chooseRepresentative(members: IRPeak[]) {
  return [...members].sort((a, b) => representativeScore(b) - representativeScore(a))[0];
}

function calibrationFor(family: IRBandFamily, mode: IRVibrationMode) {
  return MODE_CALIBRATION[mode] ?? FAMILY_FALLBACK[family];
}

function widthFromShape(shape: IRPeakShape | undefined) {
  switch (shape) {
    case "veryNarrow": return 7;
    case "narrow":
    case "sharp": return 13;
    case "broad": return 95;
    case "extremelyBroad": return 250;
    case "variable": return 40;
    default: return 22;
  }
}

function widthFor(peak: IRPeak, calibration: ModeCalibration) {
  const requested = peak.widthCm1 ?? widthFromShape(peak.shape);
  return clamp(requested, calibration.widthRange[0], calibration.widthRange[1]);
}

function midpoint(range: readonly [number, number]) {
  return (range[0] + range[1]) / 2;
}

function targetOpticalDepth(calibration: ModeCalibration, intensity: IRPeakIntensity) {
  const targetT = clamp(midpoint(calibration.targetMinT), 0.05, 97.5);
  const baseline = 98;
  const baseDepth = -Math.log(targetT / baseline);
  const relativeIntensity = INTENSITY_SCALE[intensity] / INTENSITY_SCALE[calibration.nominalIntensity];
  return Math.max(0.01, baseDepth * relativeIntensity);
}

function alkylChOscillatorScale(peak: IRPeak) {
  if (peak.family !== "alkyl-ch") return 1;
  const mode = peak.mode;
  if (mode !== "ch3-asymmetric" && mode !== "ch3-symmetric" && mode !== "ch2-asymmetric" && mode !== "ch2-symmetric") return 1;

  const sites = peak.vibrationAtomIndices?.length ?? peak.atomIndices?.length ?? 1;
  if (sites <= 1) return 1;

  return clamp(sites, 1, 3.5);
}

function integratedStrengthFor(peak: IRPeak, calibration: ModeCalibration) {
  const peakDepth = targetOpticalDepth(calibration, peak.intensity);
  return peakDepth
    * calibration.referenceWidthCm1
    * PROFILE_AREA_FACTOR[calibration.profile]
    * alkylChOscillatorScale(peak);
}

function physicalModeKey(family: IRBandFamily, mode: IRVibrationMode) {
  // Generic carbonyl assignments should collapse into a specific carbonyl assignment
  // on the same physical C=O bond; coupled anhydride modes remain explicitly distinct.
  if (family === "carbonyl" && mode === "generic-carbonyl") return "carbonyl";
  return mode;
}

type PeakCandidate = {
  peak: IRPeak;
  family: IRBandFamily;
  mode: IRVibrationMode;
  center: number;
  site: string;
};

function mergeRedundantPeaks(peaks: IRPeak[]) {
  const candidates: PeakCandidate[] = peaks
    .map((peak) => ({ peak, family: familyOf(peak), mode: modeOf(peak), center: centerOf(peak), site: siteKey(peak) }))
    .filter((item): item is PeakCandidate => item.center !== null)
    .sort((a, b) => b.center - a.center);

  const groups: Array<{
    family: IRBandFamily;
    mode: IRVibrationMode;
    center: number;
    site: string;
    members: IRPeak[];
  }> = [];

  for (const item of candidates) {
    const tolerance = mergeTolerance(item.family, item.mode);
    const match = groups.find((group) => {
      if (group.family !== item.family) return false;
      if (group.site !== "site:unknown" && item.site !== "site:unknown" && group.site !== item.site) return false;
      if (!modesCompatible(group.mode, item.mode, item.family)) return false;
      return Math.abs(group.center - item.center) <= tolerance;
    });

    if (!match) {
      groups.push({ family: item.family, mode: item.mode, center: item.center, site: item.site, members: [item.peak] });
      continue;
    }

    match.members.push(item.peak);
    const representative = chooseRepresentative(match.members);
    match.center = centerOf(representative) ?? match.center;
    const representativeMode = modeOf(representative);
    if (!genericMode(representativeMode)) match.mode = representativeMode;
    if (match.site === "site:unknown" && item.site !== "site:unknown") match.site = item.site;
  }

  return groups;
}

/**
 * Convert raw rule assignments into one render band per physical vibration.
 *
 * Rules own chemistry and frequency shifts. This layer only deduplicates equivalent
 * assignments and maps typed vibration modes to integrated band strengths/widths.
 * There are intentionally no molecule-wide "family budgets": distinct physical
 * vibrations add in absorbance space and only true duplicates are collapsed.
 */
export function normalizeIrBands(peaks: IRPeak[]): IRRenderBand[] {
  return mergeRedundantPeaks(peaks)
    .map((group) => {
      const representative = chooseRepresentative(group.members);
      const family = familyOf(representative);
      const mode = modeOf(representative);
      const center = centerOf(representative) ?? group.center;
      const calibration = calibrationFor(family, mode);
      const widthCm1 = widthFor(representative, calibration);
      const site = siteKey(representative) !== "site:unknown" ? siteKey(representative) : group.site;
      return {
        id: representative.id ?? `${mode}-${center}`,
        physicalKey: `${physicalModeKey(family, mode)}|${site}|${Math.round(center)}`,
        family,
        mode,
        center,
        widthCm1,
        referenceWidthCm1: calibration.referenceWidthCm1,
        integratedStrength: integratedStrengthFor(representative, calibration),
        profile: calibration.profile,
        representative,
        members: group.members,
      } satisfies IRRenderBand;
    })
    .sort((a, b) => b.center - a.center);
}

export function irProfileAreaFactor(profile: IRBandProfile) {
  return PROFILE_AREA_FACTOR[profile];
}
