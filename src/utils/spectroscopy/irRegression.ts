import { generateIrCurve } from "./irCurveModel";
import type {
  IRBandFamily,
  IRPeak,
  IRPeakIntensity,
  IRPeakShape,
  IRVibrationMode,
} from "./types";

type RegressionResult = {
  name: string;
  passed: boolean;
  details: string;
};

type PeakFixtureOptions = Partial<IRPeak> & {
  family: IRBandFamily;
  mode: IRVibrationMode;
};

function peak(
  id: string,
  sourceGroup: string,
  label: string,
  center: number,
  intensity: IRPeakIntensity,
  shape: IRPeakShape,
  options: PeakFixtureOptions,
): IRPeak {
  return {
    id,
    sourceGroup,
    label,
    center,
    range: `${Math.round(center - 10)}–${Math.round(center + 10)} cm⁻¹`,
    intensity,
    shape,
    explanation: "IR rendering regression fixture.",
    ...options,
  };
}

function curveFor(peaks: IRPeak[]) {
  // Chemistry regressions use clean mode so baseline artifacts cannot hide a bad
  // assignment. Experimental appearance has its own stability check below.
  return generateIrCurve(peaks, { appearance: "clean", resolutionCm1: 4 });
}

function transmittanceAt(peaks: IRPeak[], wavenumber: number) {
  const curve = curveFor(peaks);
  return curve.reduce((best, point) =>
    Math.abs(point.wavenumber - wavenumber) < Math.abs(best.wavenumber - wavenumber) ? point : best,
  ).transmittance;
}

function minTransmittance(peaks: IRPeak[], low: number, high: number) {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  return Math.min(...curveFor(peaks)
    .filter((point) => point.wavenumber >= lo && point.wavenumber <= hi)
    .map((point) => point.transmittance));
}

function between(value: number, min: number, max: number) {
  return value >= min && value <= max;
}

function regression(name: string, condition: boolean, details: string): RegressionResult {
  return { name, passed: condition, details };
}

function localVariationRms(curve: ReturnType<typeof generateIrCurve>, low: number, high: number) {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const points = curve.filter((point) => point.wavenumber >= lo && point.wavenumber <= hi);
  if (points.length < 2) return 0;
  const deltas = points.slice(1).map((point, index) => point.transmittance - points[index].transmittance);
  return Math.sqrt(deltas.reduce((sum, delta) => sum + delta * delta, 0) / deltas.length);
}

function nearestTransmittance(curve: ReturnType<typeof generateIrCurve>, wavenumber: number) {
  return curve.reduce((best, point) =>
    Math.abs(point.wavenumber - wavenumber) < Math.abs(best.wavenumber - wavenumber) ? point : best,
  ).transmittance;
}

const aldehyde: IRPeak[] = [
  peak("aryl-ch", "Aromatic C–H", "Aromatic sp² C–H stretch", 3030, "veryWeak", "narrow", { family: "aromatic-ch", mode: "aromatic-ch" }),
  peak("ch2-asym", "C–H framework", "CH₂ asymmetric C–H stretch", 2927, "strong", "moderate", { family: "alkyl-ch", mode: "ch2-asymmetric", overlapRole: "alkyl-ch" }),
  peak("ch2-sym", "C–H framework", "CH₂ symmetric C–H stretch", 2854, "medium", "moderate", { family: "alkyl-ch", mode: "ch2-symmetric", overlapRole: "alkyl-ch" }),
  peak("ald-high", "Aldehyde", "Aldehyde C–H Fermi band", 2820, "weak", "narrow", { family: "aldehyde-ch", mode: "aldehyde-fermi-high" }),
  peak("ald-low", "Aldehyde", "Aldehyde C–H Fermi band", 2720, "weak", "narrow", { family: "aldehyde-ch", mode: "aldehyde-fermi-low" }),
  peak("ald-co", "Aldehyde", "Aldehyde C=O stretch", 1730, "veryStrong", "narrow", { family: "carbonyl", mode: "aldehyde-carbonyl", bondIndices: [7] }),
];

const ester: IRPeak[] = [
  peak("ch3-asym", "C–H framework", "CH₃ asymmetric C–H stretch", 2960, "strong", "moderate", { family: "alkyl-ch", mode: "ch3-asymmetric", overlapRole: "alkyl-ch" }),
  peak("ch2-asym", "C–H framework", "CH₂ asymmetric C–H stretch", 2927, "strong", "moderate", { family: "alkyl-ch", mode: "ch2-asymmetric", overlapRole: "alkyl-ch" }),
  peak("ester-co", "Ester", "Ester C=O stretch", 1740, "veryStrong", "narrow", { family: "carbonyl", mode: "ester-carbonyl", bondIndices: [1] }),
  peak("ester-c-o-low", "Ester", "Ester C–O stretch", 1120, "strong", "narrow", { family: "fingerprint", mode: "ester-co-low", bondIndices: [2] }),
  peak("ester-c-o-high", "Ester", "Ester C–O stretch", 1240, "strong", "narrow", { family: "fingerprint", mode: "ester-co-high", bondIndices: [2] }),
];

const secondaryAmide: IRPeak[] = [
  peak("amide-nh", "Secondary amide", "N–H stretch", 3300, "medium", "broad", { family: "xh", mode: "secondary-amide-nh", widthCm1: 42, atomIndices: [5] }),
  peak("aryl-ch", "Aromatic C–H", "Aromatic sp² C–H stretch", 3030, "veryWeak", "narrow", { family: "aromatic-ch", mode: "aromatic-ch" }),
  peak("n-ch3", "C–H framework", "CH₃ asymmetric C–H stretch", 2960, "strong", "moderate", { family: "alkyl-ch", mode: "ch3-asymmetric", overlapRole: "alkyl-ch" }),
  peak("amide-i", "Secondary amide", "Amide I / C=O stretch", 1660, "veryStrong", "narrow", { family: "carbonyl", mode: "amide-carbonyl", bondIndices: [4] }),
  peak("ring-1600", "Benzamide", "Aromatic ring C=C stretch", 1600, "medium", "narrow", { family: "aromatic-ring", mode: "aromatic-ring-1600" }),
  peak("amide-ii", "Secondary amide", "Amide II band", 1545, "medium", "narrow", { family: "amide-ii", mode: "amide-ii" }),
];

const tertiaryAmide: IRPeak[] = [
  peak("amide-i", "Tertiary amide", "Amide I / C=O stretch", 1650, "veryStrong", "narrow", { family: "carbonyl", mode: "amide-carbonyl", bondIndices: [4] }),
  peak("n-ch3", "C–H framework", "CH₃ asymmetric C–H stretch", 2960, "strong", "moderate", { family: "alkyl-ch", mode: "ch3-asymmetric", overlapRole: "alkyl-ch" }),
];

const nitrile: IRPeak[] = [
  peak("nitrile", "Nitrile", "C≡N stretch", 2240, "strong", "veryNarrow", { family: "nitrile", mode: "nitrile-stretch", bondIndices: [1] }),
];

const branchedAlkylNitrile: IRPeak[] = [
  peak("ch3-asym", "C–H framework", "CH₃ asymmetric C–H stretch", 2960, "strong", "moderate", { family: "alkyl-ch", mode: "ch3-asymmetric", overlapRole: "alkyl-ch", atomIndices: [0, 3] }),
  peak("ch3-sym", "C–H framework", "CH₃ symmetric C–H stretch", 2870, "medium", "moderate", { family: "alkyl-ch", mode: "ch3-symmetric", overlapRole: "alkyl-ch", atomIndices: [0, 3] }),
  peak("ch2-asym", "C–H framework", "CH₂ asymmetric C–H stretch", 2927, "strong", "moderate", { family: "alkyl-ch", mode: "ch2-asymmetric", overlapRole: "alkyl-ch", atomIndices: [1] }),
  peak("ch2-sym", "C–H framework", "CH₂ symmetric C–H stretch", 2854, "medium", "moderate", { family: "alkyl-ch", mode: "ch2-symmetric", overlapRole: "alkyl-ch", atomIndices: [1] }),
  peak("nitrile", "Nitrile", "C≡N stretch", 2245, "strong", "veryNarrow", { family: "nitrile", mode: "nitrile-stretch", bondIndices: [4] }),
];

const acid: IRPeak[] = [
  peak("acid-oh", "Carboxylic acid", "Carboxylic-acid O–H envelope", 2920, "strong", "extremelyBroad", { family: "xh", mode: "acid-oh", overlapRole: "acidic-oh-envelope", widthCm1: 330 }),
  peak("acid-co", "Carboxylic acid", "Carboxylic-acid C=O stretch", 1710, "veryStrong", "narrow", { family: "carbonyl", mode: "acid-carbonyl", bondIndices: [2] }),
];

/**
 * Cross-family invariants. These intentionally compare relationships and absence
 * regions as well as absolute ranges, preventing a fix for one molecule from
 * silently making a different functional-group family implausible.
 */
export function runIrRegressionSuite(): RegressionResult[] {
  const aldCo = transmittanceAt(aldehyde, 1730);
  const aldAryl = transmittanceAt(aldehyde, 3030);
  const aldCh2 = transmittanceAt(aldehyde, 2927);
  const aldFermi = transmittanceAt(aldehyde, 2820);
  const aldNoXh = minTransmittance(aldehyde, 3200, 3600);

  const esterCo = transmittanceAt(ester, 1740);
  const esterCoStretch = transmittanceAt(ester, 1240);
  const amideNh = transmittanceAt(secondaryAmide, 3300);
  const amideCo = transmittanceAt(secondaryAmide, 1660);
  const amideBetween = transmittanceAt(secondaryAmide, 1625);
  const tertiaryNoNh = minTransmittance(tertiaryAmide, 3150, 3550);
  const nitrileCn = transmittanceAt(nitrile, 2240);
  const nitrileNoCarbonyl = minTransmittance(nitrile, 1650, 1800);
  const branchedNitrileCn = transmittanceAt(branchedAlkylNitrile, 2245);
  const branchedNitrileCh = minTransmittance(branchedAlkylNitrile, 2820, 3010);
  const branchedNitrileExperimental = generateIrCurve(branchedAlkylNitrile, { appearance: "experimental", baselineVariation: 1 });
  const branchedNitrileExperimentalCh = Math.min(...branchedNitrileExperimental.filter((point) => point.wavenumber >= 2820 && point.wavenumber <= 3010).map((point) => point.transmittance));
  const branchedNitrileExperimentalCn = nearestTransmittance(branchedNitrileExperimental, 2245);
  const acidOhEdge = transmittanceAt(acid, 3150);
  const acidOhCenter = transmittanceAt(acid, 2920);

  const duplicateCarbonyl: IRPeak[] = [
    peak("specific", "Aldehyde", "Aldehyde C=O stretch", 1730, "veryStrong", "narrow", { family: "carbonyl", mode: "aldehyde-carbonyl", bondIndices: [7] }),
    peak("generic", "Carbonyl", "C=O stretch", 1725, "strong", "narrow", { family: "carbonyl", mode: "generic-carbonyl", bondIndices: [7] }),
  ];
  const singleCarbonyl = [duplicateCarbonyl[0]];
  const duplicateT = transmittanceAt(duplicateCarbonyl, 1730);
  const singleT = transmittanceAt(singleCarbonyl, 1730);

  const experimentalA = generateIrCurve(aldehyde, { appearance: "experimental", baselineVariation: 1 });
  const experimentalB = generateIrCurve(aldehyde, { appearance: "experimental", baselineVariation: 1 });
  const cleanAldehyde = generateIrCurve(aldehyde, { appearance: "clean", resolutionCm1: 4 });
  const deterministicAppearance = experimentalA.every((point, index) => point.transmittance === experimentalB[index]?.transmittance);
  const quietTextureRms = localVariationRms(experimentalA, 2100, 2500);
  const cleanBridge = nearestTransmittance(cleanAldehyde, 2760);
  const experimentalBridge = nearestTransmittance(experimentalA, 2760);
  const experimentalHighWindow = Math.min(...experimentalA
    .filter((point) => point.wavenumber >= 3200 && point.wavenumber <= 3600)
    .map((point) => point.transmittance));

  return [
    regression("very-strong carbonyl reaches baseline", aldCo < 4 && esterCo < 4 && amideCo < 4, `aldehyde=${aldCo.toFixed(2)}, ester=${esterCo.toFixed(2)}, amide=${amideCo.toFixed(2)} %T`),
    regression("aldehyde diagnostic hierarchy is ordered", aldCo < aldCh2 && aldCh2 < aldFermi && aldFermi < aldAryl, `C=O=${aldCo.toFixed(1)} < CH2=${aldCh2.toFixed(1)} < Fermi=${aldFermi.toFixed(1)} < aryl=${aldAryl.toFixed(1)} %T`),
    regression("aromatic C-H remains weak", aldAryl > 78, `3030=${aldAryl.toFixed(2)} %T`),
    regression("aldehyde has no false O-H/N-H band", aldNoXh > 92, `3200–3600 minimum=${aldNoXh.toFixed(2)} %T`),
    regression("ester C-O remains a strong fingerprint assignment", esterCoStretch < 58, `1240=${esterCoStretch.toFixed(2)} %T`),
    regression("secondary-amide N-H is substantial", between(amideNh, 12, 45), `3300=${amideNh.toFixed(2)} %T`),
    regression("amide I recovers before aromatic/amide-II cluster", amideBetween > 52, `1625=${amideBetween.toFixed(2)} %T`),
    regression("tertiary amide has no N-H absorption", tertiaryNoNh > 92, `3150–3550 minimum=${tertiaryNoNh.toFixed(2)} %T`),
    regression("nitrile is a sharp strong diagnostic band", between(nitrileCn, 8, 28), `2240=${nitrileCn.toFixed(2)} %T`),
    regression("branched alkyl nitrile has a strong crowded C-H manifold", between(branchedNitrileCh, 20, 38), `2820–3010 minimum=${branchedNitrileCh.toFixed(2)} %T`),
    regression("branched alkyl nitrile retains a conspicuous nitrile stretch", between(branchedNitrileCn, 8, 28), `2245=${branchedNitrileCn.toFixed(2)} %T`),
    regression("branched nitrile experimental C-H manifold remains forceful", between(branchedNitrileExperimentalCh, 15, 42), `experimental 2820–3010 minimum=${branchedNitrileExperimentalCh.toFixed(2)} %T`),
    regression("branched nitrile experimental C≡N remains conspicuous", between(branchedNitrileExperimentalCn, 5, 30), `experimental 2245=${branchedNitrileExperimentalCn.toFixed(2)} %T`),
    regression("nitrile-only control has no carbonyl", nitrileNoCarbonyl > 96, `1650–1800 minimum=${nitrileNoCarbonyl.toFixed(2)} %T`),
    regression("acid O-H is a broad envelope", acidOhCenter < 58 && acidOhEdge < 88, `2920=${acidOhCenter.toFixed(2)}, 3150=${acidOhEdge.toFixed(2)} %T`),
    regression("duplicate physical carbonyl is not double-counted", Math.abs(duplicateT - singleT) < 1.5, `single=${singleT.toFixed(2)}, duplicate=${duplicateT.toFixed(2)} %T`),
    regression("experimental appearance is deterministic", deterministicAppearance, "same input produces identical baseline/instrument trace"),
    regression("experimental baseline has correlated fine texture", between(quietTextureRms, 0.025, 0.22), `quiet-region local RMS=${quietTextureRms.toFixed(3)} %T`),
    regression("C-H manifold fills unrealistic inter-band recovery", experimentalBridge < cleanBridge - 3.0, `2760 clean=${cleanBridge.toFixed(2)}, experimental=${experimentalBridge.toFixed(2)} %T`),
    regression("experimental texture does not invent strong X-H bands", experimentalHighWindow > 88, `3200–3600 minimum=${experimentalHighWindow.toFixed(2)} %T`),
  ];
}
