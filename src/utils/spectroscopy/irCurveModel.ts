import type { IRPeak } from "./types";
import {
  irProfileAreaFactor,
  normalizeIrBands,
  type IRRenderBand,
} from "./irBandModel";

export type IrCurvePoint = {
  wavenumber: number;
  transmittance: number;
};

export type IRRenderOptions = {
  /** Clean = chemistry only; experimental = instrument/baseline appearance. */
  appearance?: "clean" | "experimental";
  /** Approximate FTIR resolution (FWHM) in cm⁻¹. */
  resolutionCm1?: number;
  /** Multiplier for non-chemical baseline drift/noise in experimental mode. */
  baselineVariation?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function smoothStep01(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function hashNoise(index: number, seed: number) {
  const raw = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453123;
  const fraction = raw - Math.floor(raw);
  return fraction * 2 - 1;
}

function smoothValueNoise(wavenumber: number, scaleCm1: number, seed: number) {
  const position = wavenumber / scaleCm1;
  const left = Math.floor(position);
  const fraction = position - left;
  const blend = smoothStep01(fraction);
  const a = hashNoise(left, seed);
  const b = hashNoise(left + 1, seed);
  return a + (b - a) * blend;
}

function baselineSeed(bands: IRRenderBand[]) {
  return hashString(bands.map((band) => `${band.mode}:${band.center.toFixed(1)}:${band.physicalKey}`).join("|")) || 1;
}

/**
 * Instrument/background appearance only. It is deliberately independent of peak
 * positions so the renderer cannot invent shoulders or diagnostic absorptions near
 * a strong molecular band.
 */
function baselineOffset(wavenumber: number, seed: number, variation: number) {
  const seed0 = 0.37 + (seed % 997) * 0.0013;
  const seed1 = 1.71 + (seed % 1499) * 0.0009;
  const seed2 = 4.03 + (seed % 1879) * 0.0007;
  const seed3 = 6.29 + (seed % 2371) * 0.0005;

  // Real FTIR baselines are not periodic sine waves. Combine several correlated
  // length scales: broad sample/instrument drift, medium wander, and a small
  // detector/sample texture that remains visible on the plotted 4 cm^-1 grid.
  const drift = 0.68 * smoothValueNoise(wavenumber, 760, seed2);
  const broad = 0.58 * smoothValueNoise(wavenumber, 310, seed0);
  const medium = 0.28 * smoothValueNoise(wavenumber, 125, seed1);
  const fine = 0.12 * smoothValueNoise(wavenumber, 24, seed3);
  const micro = 0.055 * smoothValueNoise(wavenumber, 9.5, seed2 + 2.7);
  const tilt = 0.22 * hashNoise(3, seed1) * ((wavenumber - 2200) / 1800);
  return variation * (drift + broad + medium + fine + micro + tilt);
}

function skewForBand(band: IRRenderBand, experimental: boolean) {
  const hash = hashString(`${band.physicalKey}|${band.center.toFixed(1)}`);
  if (!experimental) {
    const magnitude = 0.035 + (hash % 5) * 0.010;
    return (hash & 1) === 0 ? magnitude : -magnitude;
  }

  const base = band.profile === "very-broad" ? 0.18
    : band.profile === "broad" ? 0.14
      : band.profile === "carbonyl" ? 0.11
        : band.profile === "family" ? 0.10
          : 0.085;
  const magnitude = base + (hash % 5) * 0.012;
  return (hash & 1) === 0 ? magnitude : -magnitude;
}

function renderBandProfile(distance: number, band: IRRenderBand, experimental = false) {
  const skew = skewForBand(band, experimental);
  const sideScale = distance < 0 ? 1 + skew : 1 - skew;
  const x = distance / sideScale;
  const gaussian = Math.exp(-0.5 * x * x);
  const lorentzian = 1 / (1 + x * x);

  if (band.profile === "carbonyl") {
    // Carbonyls have a steep core plus unequal wings. The stronger low-frequency
    // wing avoids the perfectly mirrored U-shape of a single analytic Gaussian.
    const lowFrequencyWing = Math.exp(-0.5 * ((distance + 0.24) / 1.52) ** 2);
    const highFrequencyShoulder = Math.exp(-0.5 * ((distance - 0.33) / 0.92) ** 2);
    return experimental
      ? 0.74 * gaussian + 0.09 * lorentzian + 0.13 * lowFrequencyWing + 0.04 * highFrequencyShoulder
      : 0.84 * gaussian + 0.10 * lorentzian + 0.06 * lowFrequencyWing;
  }

  if (band.profile === "family") {
    const skirt = Math.exp(-0.5 * ((distance + 0.18) / (experimental ? 2.55 : 2.25)) ** 2);
    const shoulder = Math.exp(-0.5 * ((distance - 0.48) / 1.05) ** 2);
    return experimental
      ? 0.78 * gaussian + 0.15 * skirt + 0.07 * shoulder
      : 0.89 * gaussian + 0.11 * skirt;
  }

  if (band.profile === "asymmetric-sharp") {
    const skirt = Math.exp(-0.5 * ((distance + 0.20) / (experimental ? 1.92 : 1.70)) ** 2);
    const shoulder = Math.exp(-0.5 * ((distance - 0.58) / 0.92) ** 2);
    return experimental
      ? 0.82 * gaussian + 0.12 * skirt + 0.06 * shoulder
      : 0.93 * gaussian + 0.07 * skirt;
  }

  if (band.profile === "broad") {
    if (band.mode === "secondary-amide-nh") {
      const coreScale = distance < 0 ? (experimental ? 1.55 : 1.38) : (experimental ? 0.86 : 0.91);
      const core = Math.exp(-0.5 * (distance / coreScale) ** 2);
      const bondedWing = Math.exp(-0.5 * ((distance + 0.82) / (experimental ? 2.28 : 2.05)) ** 2);
      return experimental ? 0.72 * core + 0.28 * bondedWing : 0.78 * core + 0.22 * bondedWing;
    }
    const lowFrequencyWing = Math.exp(-0.5 * ((distance + 0.52) / (experimental ? 1.88 : 1.65)) ** 2);
    return experimental ? 0.72 * gaussian + 0.28 * lowFrequencyWing : 0.78 * gaussian + 0.22 * lowFrequencyWing;
  }

  if (band.profile === "very-broad") {
    const lowWing = Math.exp(-0.5 * ((distance + 1.00) / 1.12) ** 2);
    const center = Math.exp(-0.5 * ((distance + 0.08) / 1.26) ** 2);
    const highWing = Math.exp(-0.5 * ((distance - 0.72) / 1.62) ** 2);
    return 0.34 * lowWing + 0.46 * center + 0.20 * highWing;
  }

  if (experimental) {
    const shoulder = Math.exp(-0.5 * ((distance + 0.47) / 1.20) ** 2);
    return 0.88 * gaussian + 0.07 * lorentzian + 0.05 * shoulder;
  }
  return 0.95 * gaussian + 0.05 * lorentzian;
}

function isChFamily(band: IRRenderBand) {
  return band.family === "aromatic-ch"
    || band.family === "vinylic-ch"
    || band.family === "alkyl-ch"
    || band.family === "aldehyde-ch";
}

function deterministicJitter(key: string) {
  return ((hashString(key) % 2001) / 1000) - 1;
}

function splitExperimentalBand(band: IRRenderBand): IRRenderBand[] {
  if (band.profile === "very-broad") return [band];

  const pattern = band.profile === "carbonyl"
    ? [
        { fraction: 0.76, offset: -0.04, width: 0.86 },
        { fraction: 0.15, offset: -0.48, width: 1.18 },
        { fraction: 0.09, offset: 0.39, width: 0.78 },
      ]
    : band.profile === "family"
      ? [
          { fraction: 0.69, offset: 0.00, width: 0.84 },
          { fraction: 0.16, offset: -0.58, width: 0.72 },
          { fraction: 0.10, offset: 0.51, width: 0.68 },
          { fraction: 0.05, offset: -1.18, width: 1.04 },
        ]
      : band.profile === "asymmetric-sharp"
        ? [
            { fraction: 0.82, offset: 0.00, width: 0.88 },
            { fraction: 0.11, offset: -0.62, width: 0.78 },
            { fraction: 0.07, offset: 0.68, width: 0.70 },
          ]
        : band.profile === "broad"
          ? [
              { fraction: 0.87, offset: -0.04, width: 0.96 },
              { fraction: 0.08, offset: -0.75, width: 1.20 },
              { fraction: 0.05, offset: 0.64, width: 0.88 },
            ]
          : [
              { fraction: 0.86, offset: 0.00, width: 0.90 },
              { fraction: 0.08, offset: -0.58, width: 0.78 },
              { fraction: 0.06, offset: 0.70, width: 0.72 },
            ];

  return pattern.map((component, index) => {
    const jitter = deterministicJitter(`${band.physicalKey}|micro|${index}`);
    const offset = component.offset + jitter * 0.09;
    const widthScale = Math.max(0.55, component.width * (1 + jitter * 0.08));
    return {
      ...band,
      id: `${band.id}:micro:${index}`,
      physicalKey: `${band.physicalKey}:micro:${index}`,
      center: band.center + offset * band.widthCm1,
      widthCm1: Math.max(3.5, band.widthCm1 * widthScale),
      integratedStrength: band.integratedStrength * component.fraction,
    };
  });
}

function aromaticAuxiliaryBands(bands: IRRenderBand[]): IRRenderBand[] {
  const aromatic = bands.find((band) => band.family === "aromatic-ring" || band.family === "aromatic-ch");
  if (!aromatic) return [];

  // Weak overtone/combination structure is common for aromatic systems in the
  // 2000-1660 cm^-1 region. These are intentionally unlabeled renderer features:
  // they never appear in the assignment list and remain too weak to be diagnostic.
  const seed = hashString(aromatic.physicalKey);
  return [1945, 1875, 1805].map((baseCenter, index) => {
    const jitter = ((seed >> (index * 3)) & 7) - 3;
    return {
      ...aromatic,
      id: `${aromatic.id}:aromatic-combination:${index}`,
      physicalKey: `${aromatic.physicalKey}:aromatic-combination:${index}`,
      family: "other" as const,
      mode: "generic" as const,
      center: baseCenter + jitter * 2.5,
      widthCm1: 10 + index * 2,
      referenceWidthCm1: 11,
      integratedStrength: 0.42 + index * 0.11,
      profile: "sharp" as const,
    };
  });
}

function buildExperimentalBands(bands: IRRenderBand[]) {
  const chBands = bands.filter(isChFamily);
  const reserveFraction = chBands.length >= 2 ? 0.18 : 0;
  const chKeys = new Set(chBands.map((band) => band.physicalKey));

  const adjusted = bands.map((band) => chKeys.has(band.physicalKey)
    ? { ...band, integratedStrength: band.integratedStrength * (1 - reserveFraction) }
    : band);
  const microBands = adjusted.flatMap(splitExperimentalBand);

  if (reserveFraction > 0) {
    const totalStrength = chBands.reduce((sum, band) => sum + band.integratedStrength, 0);
    const weightedCenter = chBands.reduce((sum, band) => sum + band.center * band.integratedStrength, 0) / totalStrength;
    const minCenter = Math.min(...chBands.map((band) => band.center));
    const maxCenter = Math.max(...chBands.map((band) => band.center));
    const strongest = [...chBands].sort((a, b) => b.integratedStrength - a.integratedStrength)[0];
    const envelopeWidth = clamp((maxCenter - minCenter) * 0.30 + 45, 72, 125);
    microBands.push({
      ...strongest,
      id: `${strongest.id}:ch-manifold`,
      physicalKey: "appearance:ch-manifold",
      center: weightedCenter - 8,
      widthCm1: envelopeWidth,
      referenceWidthCm1: envelopeWidth,
      integratedStrength: totalStrength * reserveFraction,
      profile: "broad",
    });
  }

  return [...microBands, ...aromaticAuxiliaryBands(bands)];
}


function absorbanceTextureFactor(wavenumber: number, seed: number) {
  const coarse = 0.018 * smoothValueNoise(wavenumber, 16, 8.11 + (seed % 1237) * 0.0008);
  const fine = 0.008 * smoothValueNoise(wavenumber, 6.5, 11.73 + (seed % 1741) * 0.0006);
  return clamp(1 + coarse + fine, 0.95, 1.05);
}

function gaussianKernel(resolutionCm1: number, stepCm1: number) {
  const fwhm = clamp(resolutionCm1, 0.5, 16);
  const sigmaPoints = fwhm / 2.35482 / stepCm1;
  const radius = Math.max(1, Math.ceil(sigmaPoints * 3.5));
  const kernel: number[] = [];
  let sum = 0;
  for (let index = -radius; index <= radius; index += 1) {
    const value = Math.exp(-0.5 * (index / sigmaPoints) ** 2);
    kernel.push(value);
    sum += value;
  }
  return kernel.map((value) => value / sum);
}

function convolve(values: number[], kernel: number[]) {
  const radius = Math.floor(kernel.length / 2);
  return values.map((_, index) => {
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sourceIndex = clamp(index + offset, 0, values.length - 1);
      sum += values[sourceIndex] * kernel[offset + radius];
    }
    return sum;
  });
}

function absorbanceAt(wavenumber: number, bands: IRRenderBand[], experimental: boolean) {
  let absorbance = 0;
  for (const band of bands) {
    const distance = (wavenumber - band.center) / band.widthCm1;
    const normalizedProfile = renderBandProfile(distance, band, experimental)
      / (irProfileAreaFactor(band.profile) * band.widthCm1);
    absorbance += band.integratedStrength * normalizedProfile;
  }
  return absorbance;
}

/**
 * Width used by the UI for the clickable IR-band region. Interaction geometry and
 * the plotted band share the same normalized band model.
 */
export function renderIrWidth(peak: IRPeak) {
  return normalizeIrBands([peak])[0]?.widthCm1 ?? peak.widthCm1 ?? 20;
}

/**
 * Render IR in absorbance space first, apply finite instrument resolution, convert
 * through Beer-Lambert to %T, then optionally add small non-chemical baseline drift.
 */
export function generateIrCurve(
  peaks: IRPeak[],
  options: IRRenderOptions = {},
): IrCurvePoint[] {
  const normalizedBands = normalizeIrBands(peaks);
  const appearance = options.appearance ?? "experimental";
  const experimental = appearance === "experimental";
  const bands = experimental ? buildExperimentalBands(normalizedBands) : normalizedBands;
  const resolutionCm1 = options.resolutionCm1 ?? 4;
  const variation = experimental ? (options.baselineVariation ?? 1) : 0;
  const seed = baselineSeed(normalizedBands);

  // Calculate the chemistry on a 1 cm⁻¹ grid so a 2-4 cm⁻¹ FTIR resolution has a
  // meaningful convolution even though the UI only needs a point every 4 cm⁻¹.
  const stepCm1 = 1;
  const highResolutionWavenumbers: number[] = [];
  const rawAbsorbance: number[] = [];
  for (let wavenumber = 4000; wavenumber >= 400; wavenumber -= stepCm1) {
    highResolutionWavenumbers.push(wavenumber);
    rawAbsorbance.push(absorbanceAt(wavenumber, bands, experimental));
  }

  const convolvedAbsorbance = convolve(rawAbsorbance, gaussianKernel(resolutionCm1, stepCm1));
  const points: IrCurvePoint[] = [];
  for (let index = 0; index < highResolutionWavenumbers.length; index += 4) {
    const wavenumber = highResolutionWavenumbers[index];
    const renderedAbsorbance = experimental
      ? convolvedAbsorbance[index] * absorbanceTextureFactor(wavenumber, seed)
      : convolvedAbsorbance[index];
    const idealTransmittance = 100 * Math.exp(-renderedAbsorbance);
    const experimentalBaseline = experimental
      ? -1.6 + baselineOffset(wavenumber, seed, variation)
      : 0;

    points.push({
      wavenumber,
      transmittance: clamp(idealTransmittance + experimentalBaseline, 0, 100),
    });
  }

  return points;
}
