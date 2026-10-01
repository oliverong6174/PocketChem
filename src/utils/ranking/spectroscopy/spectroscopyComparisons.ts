import type { CNMRSignal, HNMRSignal, IRPeak, MassSpectrumResult } from "../../spectroscopy/types";
import type { ComparisonMetric, ComparisonModeId } from "../comparisonTypes";
import { emptyMetric, metric } from "../comparisonUtils";

type NmrPrediction = {
  protonNMR: HNMRSignal[];
  carbonNMR: CNMRSignal[];
};

function strongestShift<T extends HNMRSignal | CNMRSignal>(
  signals: T[],
  direction: "max" | "min",
) {
  const candidates = signals.filter(
    (signal) =>
      typeof signal.shiftCenter === "number" && Number.isFinite(signal.shiftCenter),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, signal) => {
    const value = signal.shiftCenter ?? 0;
    const bestValue = best.shiftCenter ?? 0;
    return direction === "max"
      ? value > bestValue
        ? signal
        : best
      : value < bestValue
        ? signal
        : best;
  });
}

function irCenter(peak: IRPeak) {
  if (typeof peak.center === "number" && Number.isFinite(peak.center)) {
    return peak.center;
  }
  const match = peak.range.match(/(\d+(?:\.\d+)?)/g);
  if (!match || match.length === 0) return null;
  const values = match.map(Number).filter(Number.isFinite);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const IR_INTENSITY_SCORE: Record<string, number> = {
  veryWeak: 1,
  weak: 2,
  variable: 2.5,
  medium: 3,
  strong: 4,
  veryStrong: 5,
};

function topMassFragments(result: MassSpectrumResult | undefined) {
  if (!result) return [];
  return result.peaks
    .filter((peak) => peak.kind === "fragment" || peak.kind === "diagnostic")
    .sort((a, b) => b.relativeIntensity - a.relativeIntensity)
    .slice(0, 4);
}

export function applySpectroscopyMetrics(
  metrics: Record<ComparisonModeId, ComparisonMetric>,
  formula: string,
  nmr: NmrPrediction,
  ir: IRPeak[],
  massSpec: MassSpectrumResult,
) {
  const downfieldH = strongestShift(nmr.protonNMR, "max");
  const upfieldH = strongestShift(nmr.protonNMR, "min");
  const downfieldC = strongestShift(nmr.carbonNMR, "max");
  const upfieldC = strongestShift(nmr.carbonNMR, "min");

  metrics.protonSignalCount = metric(
    nmr.protonNMR.length,
    `${nmr.protonNMR.length} distinct predicted signal${nmr.protonNMR.length === 1 ? "" : "s"}`,
    "Count comes directly from PocketChem's structure-aware ¹H equivalence grouping.",
  );
  metrics.mostDownfieldProton = downfieldH
    ? metric(
        downfieldH.shiftCenter ?? null,
        `${(downfieldH.shiftCenter ?? 0).toFixed(2)} ppm · ${downfieldH.sourceGroup}`,
        downfieldH.explanation,
      )
    : emptyMetric("No proton signal was predicted.");
  metrics.mostUpfieldProton = upfieldH
    ? metric(
        upfieldH.shiftCenter ?? null,
        `${(upfieldH.shiftCenter ?? 0).toFixed(2)} ppm · ${upfieldH.sourceGroup}`,
        upfieldH.explanation,
      )
    : emptyMetric("No proton signal was predicted.");

  const multiplicityScore: Record<string, number> = {
    singlet: 1,
    doublet: 2,
    triplet: 3,
    quartet: 4,
    quintet: 5,
    sextet: 6,
    septet: 7,
    multiplet: 8,
  };
  const mostComplexH = nmr.protonNMR.reduce(
    (best: HNMRSignal | null, signal) => {
      if (!best) return signal;
      return (multiplicityScore[signal.multiplicity.toLowerCase()] ?? 5) >
        (multiplicityScore[best.multiplicity.toLowerCase()] ?? 5)
        ? signal
        : best;
    },
    null,
  );
  metrics.splittingComplexity = mostComplexH
    ? metric(
        multiplicityScore[mostComplexH.multiplicity.toLowerCase()] ?? 5,
        `${mostComplexH.multiplicity} · ${mostComplexH.sourceGroup}`,
        "The ranking uses the most complex predicted multiplicity in each molecule.",
      )
    : emptyMetric("No proton splitting pattern was predicted.");

  metrics.carbonSignalCount = metric(
    nmr.carbonNMR.length,
    `${nmr.carbonNMR.length} distinct predicted signal${nmr.carbonNMR.length === 1 ? "" : "s"}`,
    "Count comes directly from PocketChem's structure-aware ¹³C equivalence grouping.",
  );
  metrics.mostDownfieldCarbon = downfieldC
    ? metric(
        downfieldC.shiftCenter ?? null,
        `${(downfieldC.shiftCenter ?? 0).toFixed(1)} ppm · ${downfieldC.sourceGroup}`,
        downfieldC.explanation,
      )
    : emptyMetric("No carbon signal was predicted.");
  metrics.mostUpfieldCarbon = upfieldC
    ? metric(
        upfieldC.shiftCenter ?? null,
        `${(upfieldC.shiftCenter ?? 0).toFixed(1)} ppm · ${upfieldC.sourceGroup}`,
        upfieldC.explanation,
      )
    : emptyMetric("No carbon signal was predicted.");

  const majorIr = ir.filter((peak) => peak.kind !== "fingerprint");
  const irWithCenters = majorIr
    .map((peak) => ({ peak, center: irCenter(peak) }))
    .filter(
      (entry): entry is { peak: IRPeak; center: number } => entry.center !== null,
    );
  const highIr = irWithCenters.reduce(
    (best: { peak: IRPeak; center: number } | null, entry) =>
      !best || entry.center > best.center ? entry : best,
    null,
  );
  const lowIr = irWithCenters.reduce(
    (best: { peak: IRPeak; center: number } | null, entry) =>
      !best || entry.center < best.center ? entry : best,
    null,
  );
  const strongIr = irWithCenters.reduce(
    (best: { peak: IRPeak; center: number } | null, entry) => {
      if (!best) return entry;
      const currentScore = IR_INTENSITY_SCORE[entry.peak.intensity] ?? 0;
      const bestScore = IR_INTENSITY_SCORE[best.peak.intensity] ?? 0;
      return currentScore > bestScore ||
        (currentScore === bestScore && entry.center > best.center)
        ? entry
        : best;
    },
    null,
  );
  metrics.highestIrBand = highIr
    ? metric(
        highIr.center,
        `${Math.round(highIr.center)} cm⁻¹ · ${highIr.peak.label}`,
        highIr.peak.explanation,
      )
    : emptyMetric("No major IR band predicted.");
  metrics.lowestIrBand = lowIr
    ? metric(
        lowIr.center,
        `${Math.round(lowIr.center)} cm⁻¹ · ${lowIr.peak.label}`,
        lowIr.peak.explanation,
      )
    : emptyMetric("No major IR band predicted.");
  metrics.strongestIrBand = strongIr
    ? metric(
        (IR_INTENSITY_SCORE[strongIr.peak.intensity] ?? 0) * 10000 +
          strongIr.center,
        `${strongIr.peak.intensity} · ${Math.round(strongIr.center)} cm⁻¹ · ${strongIr.peak.label}`,
        strongIr.peak.explanation,
      )
    : emptyMetric("No major IR band predicted.");

  metrics.molecularIonMz =
    massSpec.molecularIonMz !== null
      ? metric(
          massSpec.molecularIonMz,
          `m/z ${massSpec.molecularIonMz.toFixed(3)}`,
          `${formula} molecular radical cation.`,
        )
      : emptyMetric("No molecular-ion mass could be calculated.");
  metrics.basePeakMz =
    massSpec.basePeakMz !== null
      ? metric(
          massSpec.basePeakMz,
          `m/z ${massSpec.basePeakMz}`,
          "Predicted EI base peak from the current educational mass-fragment model.",
        )
      : emptyMetric("No mass-spectrum peak was predicted.");
  const fragments = topMassFragments(massSpec);
  metrics.massFragments =
    fragments.length > 0
      ? metric(
          null,
          fragments.map((peak) => `m/z ${peak.mz}`).join(" · "),
          "Top predicted fragment/diagnostic peaks by relative intensity.",
          fragments.map((peak) => `${peak.label}: ${peak.explanation}`),
        )
      : emptyMetric(
          "No diagnostic fragment rule matched this molecule; the molecular-ion/isotope envelope may still be present.",
        );
  const isotopePeak = massSpec.peaks
    .filter((peak) => peak.kind === "isotope")
    .sort((a, b) => b.relativeIntensity - a.relativeIntensity)[0];
  metrics.isotopeProminence = isotopePeak
    ? metric(
        isotopePeak.relativeIntensity,
        `${isotopePeak.label} · ${isotopePeak.relativeIntensity.toFixed(1)}% relative`,
        isotopePeak.explanation,
      )
    : metric(
        0,
        "No prominent M+n isotope peak",
        "No isotope-envelope peak above the display threshold was predicted.",
      );
}
