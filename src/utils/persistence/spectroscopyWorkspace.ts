/**
 * What the Spectroscopy page persists, and how saved data is validated before it is shown.
 *
 * One prediction run computes all four spectra together (IR, ¹H NMR, ¹³C NMR, mass spectrum), so
 * a saved result is that single run; nothing is stored for a spectrum that was not computed. The
 * data are model predictions, not measurements, and are labelled that way when restored.
 *
 * Stored: the drawn structure (KET), the structure source the predictions were indexed against
 * (atom and bond indices in the assignments refer to it), name, formula, the peaks with their
 * assignments and explanations, the active tab and the ¹H zoom window. Not stored: rendered SVGs,
 * IR curves and spectrum plots (rebuilt from the saved peaks), and transient peak selections.
 */
import type { SpectroscopyResult } from "../spectroscopy/types";

/** Bump when the shape or meaning of saved spectroscopy results changes. */
export const SPECTROSCOPY_ENGINE_VERSION = 1;

export type SpectroscopyTabId = "proton" | "carbon" | "ir" | "mass";

export type SpectroscopyWorkspaceInputs = {
  ket: string | null;
  /** Chemistry identity of the drawn structure when it was captured (see ketIdentity.ts). */
  key: string | null;
  activeTab: SpectroscopyTabId;
  protonWindow: { min: number; max: number } | null;
};

export type SpectroscopyWorkspaceResults = {
  /** Identity of the structure that was predicted. */
  inputKey: string;
  smiles: string;
  /** Molfile or SMILES the predictions were computed from. */
  structureSource: string;
  name: string | null;
  formula: string | null;
  result: SpectroscopyResult;
};

const TABS: readonly string[] = ["proton", "carbon", "ir", "mass"];
const MASS_KINDS: readonly string[] = ["molecular-ion", "isotope", "fragment", "diagnostic"];
const MAX_KET_CHARS = 1_500_000;
const MAX_SOURCE_CHARS = 1_000_000;
const MAX_PEAKS = 2000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown): value is string | null => value === null || isString(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const optionalNumber = (value: unknown) => value === undefined || isFiniteNumber(value);
const optionalIndexList = (value: unknown) =>
  value === undefined || (Array.isArray(value) && value.every((item) => Number.isInteger(item) && item >= 0));

export function validateSpectroscopyInputs(raw: unknown): SpectroscopyWorkspaceInputs | null {
  if (!isObject(raw)) return null;
  const { ket, key, activeTab, protonWindow } = raw;
  if (!isNullableString(ket) || !isNullableString(key)) return null;
  if (typeof activeTab !== "string" || !TABS.includes(activeTab)) return null;
  if (protonWindow !== null) {
    if (!isObject(protonWindow) || !isFiniteNumber(protonWindow.min) || !isFiniteNumber(protonWindow.max)) return null;
  }
  if (ket !== null) {
    if (ket.length > MAX_KET_CHARS) return null;
    try {
      const parsed: unknown = JSON.parse(ket);
      if (!isObject(parsed) || !isObject(parsed.root)) return null;
    } catch {
      return null;
    }
  }
  return {
    ket,
    key,
    activeTab: activeTab as SpectroscopyTabId,
    protonWindow: protonWindow === null ? null : { min: (protonWindow as { min: number }).min, max: (protonWindow as { max: number }).max },
  };
}

function validIrPeak(peak: unknown): boolean {
  return (
    isObject(peak) &&
    isString(peak.label) && isString(peak.range) && isString(peak.intensity) &&
    isString(peak.sourceGroup) && isString(peak.explanation) &&
    optionalNumber(peak.center) && optionalNumber(peak.widthCm1) && optionalNumber(peak.suppressionPriority) &&
    optionalIndexList(peak.atomIndices) && optionalIndexList(peak.bondIndices) &&
    optionalIndexList(peak.vibrationAtomIndices) && optionalIndexList(peak.vibrationBondIndices)
  );
}

function validProtonSignal(signal: unknown): boolean {
  return (
    isObject(signal) &&
    isString(signal.shift) && isString(signal.multiplicity) && isString(signal.sourceGroup) && isString(signal.explanation) &&
    optionalNumber(signal.shiftCenter) && optionalNumber(signal.protonCount) && optionalIndexList(signal.atomIndices) &&
    (signal.integration === undefined || isString(signal.integration))
  );
}

function validCarbonSignal(signal: unknown): boolean {
  return (
    isObject(signal) &&
    isString(signal.shift) && isString(signal.sourceGroup) && isString(signal.explanation) &&
    optionalNumber(signal.shiftCenter) && optionalNumber(signal.carbonCount) && optionalIndexList(signal.atomIndices)
  );
}

function validMassPeak(peak: unknown): boolean {
  if (!isObject(peak)) return false;
  if (!isFiniteNumber(peak.mz) || !isFiniteNumber(peak.relativeIntensity)) return false;
  if (!isString(peak.label) || !isString(peak.explanation) || !isString(peak.kind) || !MASS_KINDS.includes(peak.kind)) return false;
  if (peak.previewAlternatives !== undefined) {
    if (!Array.isArray(peak.previewAlternatives)) return false;
    if (!peak.previewAlternatives.every((alt) => isObject(alt) && isString(alt.structure) && isString(alt.label))) return false;
  }
  return true;
}

function validMassSpec(spec: unknown): boolean {
  if (!isObject(spec) || !isString(spec.formula)) return false;
  for (const field of ["molecularIonMz", "nominalMass", "basePeakMz"]) {
    if (spec[field] !== null && !isFiniteNumber(spec[field])) return false;
  }
  return (
    Array.isArray(spec.peaks) && spec.peaks.length <= MAX_PEAKS && spec.peaks.every(validMassPeak) &&
    Array.isArray(spec.notes) && spec.notes.every(isString)
  );
}

/** Returns usable results, or null when the predictions cannot be shown safely. */
export function validateSpectroscopyResults(raw: unknown): SpectroscopyWorkspaceResults | null {
  if (!isObject(raw)) return null;
  if (!isString(raw.inputKey) || !isString(raw.smiles) || !raw.smiles.trim()) return null;
  if (!isString(raw.structureSource) || !raw.structureSource.trim() || raw.structureSource.length > MAX_SOURCE_CHARS) return null;
  if (!isNullableString(raw.name) || !isNullableString(raw.formula)) return null;
  const result = raw.result;
  if (!isObject(result)) return null;
  const { ir, protonNMR, carbonNMR, massSpec } = result;
  if (!Array.isArray(ir) || ir.length > MAX_PEAKS || !ir.every(validIrPeak)) return null;
  if (!Array.isArray(protonNMR) || protonNMR.length > MAX_PEAKS || !protonNMR.every(validProtonSignal)) return null;
  if (!Array.isArray(carbonNMR) || carbonNMR.length > MAX_PEAKS || !carbonNMR.every(validCarbonSignal)) return null;
  if (massSpec !== undefined && !validMassSpec(massSpec)) return null;
  return raw as unknown as SpectroscopyWorkspaceResults;
}
