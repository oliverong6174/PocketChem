import { useEffect, useMemo, useRef, useState } from "react";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import { readKetcherStructureSnapshot } from "../utils/ketcherSnapshot";
import {
  analyzeFunctionalGroupHierarchy,
  getMoleculeSvg,
} from "../utils/functionalGroups";
import { analyzeNomenclatureAndProperties } from "../utils/nomenclatureUtils";
import { getHighlightedMoleculeSvg } from "../utils/moleculeAnnotation";
import {
  analyzeMolecularSpectroscopy,
  resolveIRPeakHighlightSite,
  type CNMRSignal,
  type HNMRSignal,
  type IRPeak,
  type MassSpectrumPeak,
  type SpectroscopyResult,
} from "../utils/spectroscopy";

type SpectroscopyTab = "proton" | "carbon" | "ir" | "mass";

type Stick = {
  x: number;
  height: number;
  label?: string;
  id?: string;
  signal?: HNMRSignal | CNMRSignal;
  massPeak?: MassSpectrumPeak;
};

type IrCurvePoint = {
  wavenumber: number;
  transmittance: number;
};

type IrTexturePeak = {
  center: number;
  width: number;
  absorbance: number;
};

type ResolvedIrHighlight = {
  atomIndices: number[];
  bondIndices: number[];
  specificity: "vibration" | "functional-group" | "none";
};

const TABS: Array<{ id: SpectroscopyTab; label: string; shortLabel: string }> = [
  { id: "proton", label: "¹H NMR", shortLabel: "¹H NMR" },
  { id: "carbon", label: "¹³C NMR", shortLabel: "¹³C NMR" },
  { id: "ir", label: "IR", shortLabel: "IR" },
  { id: "mass", label: "Mass Spec", shortLabel: "MS" },
];

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

function createSeededRandom(seedText: string) {
  let seed = hashString(seedText) || 1;
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseWavenumberCenter(range: string) {
  const values = range.match(/\d{3,4}/g)?.map(Number) ?? [];
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  return (Math.min(...values) + Math.max(...values)) / 2;
}

function nmrSignalIdentity(signal: HNMRSignal | CNMRSignal, carbon: boolean) {
  return `${carbon ? "c" : "h"}|${signal.shift}|${signal.sourceGroup}|${(signal.atomIndices ?? []).join(",")}`;
}

function irPeakIdentity(peak: IRPeak) {
  return peak.id ?? `${peak.sourceGroup}|${peak.label}|${peak.center ?? peak.range}`;
}

function massPeakIdentity(peak: MassSpectrumPeak) {
  return `${peak.kind}|${peak.mz}|${peak.label}`;
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function addMassSpeciesBadge(svg: string, label: string | undefined, contributorLabels: string[] = []) {
  if (!label) return svg;
  const viewBox = svg.match(/viewBox=["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i);
  if (!viewBox) return svg;

  const minX = Number(viewBox[1]);
  const minY = Number(viewBox[2]);
  const width = Number(viewBox[3]);
  const height = Number(viewBox[4]);
  if (![minX, minY, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return svg;

  const fontSize = Math.max(12, Math.min(18, height * 0.055));
  const paddingX = fontSize * 0.6;
  const badgeWidth = Math.max(fontSize * 3.1, label.length * fontSize * 0.66 + paddingX * 2);
  const badgeHeight = fontSize * 1.65;
  const chipFontSize = Math.max(9, fontSize * 0.68);
  const chipPaddingX = chipFontSize * 0.55;
  const chipHeight = chipFontSize * 1.6;
  const chipCount = Math.min(contributorLabels.length, 2);
  const contributorBlockHeight = chipCount > 0
    ? fontSize * 0.35 + chipCount * chipHeight + Math.max(0, chipCount - 1) * (chipFontSize * 0.25)
    : 0;
  const reservedTop = badgeHeight + contributorBlockHeight + Math.max(16, height * 0.09);
  const expandedMinY = minY - reservedTop;
  const expandedHeight = height + reservedTop;
  const badgeRight = minX + width - Math.max(8, width * 0.025);
  const badgeX = badgeRight - badgeWidth;
  const badgeY = expandedMinY + Math.max(8, reservedTop * 0.14);
  const badgeTextX = badgeX + badgeWidth / 2;
  const badgeTextY = badgeY + badgeHeight * 0.68;
  const escaped = escapeSvgText(label);

  const expandedSvg = svg.replace(
    /viewBox=["'][^"']+["']/i,
    `viewBox="${minX.toFixed(2)} ${expandedMinY.toFixed(2)} ${width.toFixed(2)} ${expandedHeight.toFixed(2)}"`,
  );

  const badgeParts = [`<g class="mass-species-badge" pointer-events="none">`, `<rect x="${badgeX.toFixed(2)}" y="${badgeY.toFixed(2)}" width="${badgeWidth.toFixed(2)}" height="${badgeHeight.toFixed(2)}" rx="${(badgeHeight * 0.28).toFixed(2)}" style="fill:#fff7d6;stroke:#ca8a04;stroke-width:1.5"/>`, `<text x="${badgeTextX.toFixed(2)}" y="${badgeTextY.toFixed(2)}" text-anchor="middle" style="fill:#92400e;font-family:Arial,sans-serif;font-size:${fontSize.toFixed(2)}px;font-weight:700">${escaped}</text>`];

  contributorLabels.slice(0, 2).forEach((chipLabel, index) => {
    const safeLabel = escapeSvgText(chipLabel);
    const chipWidth = Math.max(chipFontSize * 4.2, chipLabel.length * chipFontSize * 0.62 + chipPaddingX * 2);
    const chipX = badgeRight - chipWidth;
    const chipY = badgeY + badgeHeight + fontSize * 0.35 + index * (chipHeight + chipFontSize * 0.25);
    const chipTextX = chipX + chipWidth / 2;
    const chipTextY = chipY + chipHeight * 0.69;
    badgeParts.push(`<rect x="${chipX.toFixed(2)}" y="${chipY.toFixed(2)}" width="${chipWidth.toFixed(2)}" height="${chipHeight.toFixed(2)}" rx="${(chipHeight * 0.32).toFixed(2)}" style="fill:#fffdf2;stroke:#d1a13c;stroke-width:1.15"/>`);
    badgeParts.push(`<text x="${chipTextX.toFixed(2)}" y="${chipTextY.toFixed(2)}" text-anchor="middle" style="fill:#8a5a00;font-family:Arial,sans-serif;font-size:${chipFontSize.toFixed(2)}px;font-weight:600">${safeLabel}</text>`);
  });

  badgeParts.push(`</g>`);
  return expandedSvg.replace(/<\/svg>\s*$/i, `${badgeParts.join("")}</svg>`);
}

function protonSignalRawVisualIntensity(signal: HNMRSignal) {
  const inferredCount = Number.parseInt(signal.integration ?? "1", 10) || 1;
  const protonCount = clamp(signal.protonCount ?? inferredCount, 1, 12);
  const multiplicity = String(signal.multiplicity ?? "singlet").toLowerCase();
  const sourceGroup = signal.sourceGroup.toLowerCase();
  const isAromaticCH = sourceGroup === "aromatic c–h" || sourceGroup === "aromatic c-h";
  const isVinylicH = sourceGroup === "vinylic proton";

  // Peak HEIGHT in a printed 1H spectrum is not proportional to integration.
  // Integration controls area, while splitting and line broadening spread that area
  // across several lines. Use sqrt(integration) as the area contribution and then
  // estimate how concentrated that area is for the displayed multiplicity.
  const multiplicityFactor = multiplicity === "doublet" ? 2.35
    : multiplicity === "triplet" ? 1.00
    : multiplicity === "quartet" ? 1.70
    : multiplicity === "quintet" ? 0.88
    : multiplicity === "sextet" ? 0.80
    : multiplicity === "septet" ? 0.72
    : multiplicity === "multiplet" ? 0.52
    : 1.18;

  let environmentFactor = 1;
  // Aromatic multiplets are commonly broad and visually short even when they
  // integrate to several protons, so compress them strongly.
  if (isAromaticCH) environmentFactor *= multiplicity === "multiplet" ? 0.16 : 0.86;
  else if (sourceGroup.includes("carboxylic acid o–h") || sourceGroup.includes("carboxylic acid o-h")) environmentFactor *= 0.42;
  else if (sourceGroup.includes("alcohol o–h") || sourceGroup.includes("alcohol o-h")) environmentFactor *= 0.55;
  else if (isVinylicH) environmentFactor *= 0.68;
  // A benzylic methine multiplet can be visually more concentrated than a nearby
  // benzylic CH2 triplet even though it integrates to fewer protons.
  else if (sourceGroup.includes("benzylic") && protonCount === 1) environmentFactor *= 3.10;

  // Compact methyl doublets are frequently the tallest feature in printed spectra.
  if (protonCount === 3 && multiplicity === "doublet") environmentFactor *= 1.55;
  // Ethyl-like quartets often appear taller than neighboring broader 2H multiplets.
  if (protonCount === 2 && multiplicity === "quartet") environmentFactor *= 1.18;
  if (protonCount === 2 && multiplicity === "multiplet") environmentFactor *= 0.76;

  return Math.sqrt(protonCount) * multiplicityFactor * environmentFactor;
}

function nmrLineComponents(stick: Stick) {
  const multiplicity = stick.signal && "multiplicity" in stick.signal
    ? String(stick.signal.multiplicity ?? "singlet").toLowerCase()
    : "singlet";

  const patterns: Record<string, Array<{ offset: number; weight: number }>> = {
    singlet: [{ offset: 0, weight: 1 }],
    doublet: [
      { offset: -0.022, weight: 1 },
      { offset: 0.022, weight: 1 },
    ],
    triplet: [
      { offset: -0.034, weight: 0.52 },
      { offset: 0, weight: 1 },
      { offset: 0.034, weight: 0.52 },
    ],
    quartet: [
      { offset: -0.049, weight: 0.26 },
      { offset: -0.016, weight: 0.82 },
      { offset: 0.016, weight: 0.82 },
      { offset: 0.049, weight: 0.26 },
    ],
    quintet: [
      { offset: -0.064, weight: 0.18 },
      { offset: -0.032, weight: 0.68 },
      { offset: 0, weight: 1 },
      { offset: 0.032, weight: 0.68 },
      { offset: 0.064, weight: 0.18 },
    ],
    sextet: [
      { offset: -0.075, weight: 0.16 },
      { offset: -0.045, weight: 0.52 },
      { offset: -0.015, weight: 1 },
      { offset: 0.015, weight: 1 },
      { offset: 0.045, weight: 0.52 },
      { offset: 0.075, weight: 0.16 },
    ],
    septet: [
      { offset: -0.09, weight: 0.12 },
      { offset: -0.06, weight: 0.38 },
      { offset: -0.03, weight: 0.78 },
      { offset: 0, weight: 1 },
      { offset: 0.03, weight: 0.78 },
      { offset: 0.06, weight: 0.38 },
      { offset: 0.09, weight: 0.12 },
    ],
    multiplet: [
      { offset: -0.075, weight: 0.36 },
      { offset: -0.043, weight: 0.72 },
      { offset: -0.016, weight: 1 },
      { offset: 0.012, weight: 0.86 },
      { offset: 0.041, weight: 0.62 },
      { offset: 0.072, weight: 0.30 },
    ],
  };
  if (multiplicity === "multiplet" && stick.signal && "multiplicity" in stick.signal) {
    const sourceGroup = stick.signal.sourceGroup.toLowerCase();
    const isAromaticCH = sourceGroup === "aromatic c–h" || sourceGroup === "aromatic c-h";
    if (isAromaticCH) {
      return [
        { offset: -0.14, weight: 0.16 },
        { offset: -0.09, weight: 0.28 },
        { offset: -0.04, weight: 0.42 },
        { offset: 0.01, weight: 0.52 },
        { offset: 0.06, weight: 0.36 },
        { offset: 0.11, weight: 0.20 },
      ];
    }
  }
  return patterns[multiplicity] ?? patterns.singlet;
}

function irPeakIsSelected(peak: IRPeak, selectedPeak: IRPeak | null) {
  return selectedPeak !== null && irPeakIdentity(peak) === irPeakIdentity(selectedPeak);
}

const IR_TARGET_TRANSMITTANCE: Record<IRPeak["intensity"], number> = {
  veryWeak: 0.88,
  weak: 0.68,
  medium: 0.42,
  strong: 0.20,
  veryStrong: 0.07,
  variable: 0.50,
};

function opticalDepthForTransmittance(targetTransmittance: number) {
  return -Math.log(clamp(targetTransmittance, 0.01, 0.99));
}

function irOpticalDepth(peak: IRPeak) {
  // Alkyl C-H stretches use their own family-overlap model below. Keep their
  // per-line optical depths moderate so CH3/CH2 bands merge into a realistic
  // envelope instead of each independently reaching the global intensity target.
  if (peak.overlapRole === "alkyl-ch") {
    if (peak.intensity === "strong" || peak.intensity === "veryStrong") return 0.82;
    if (peak.intensity === "medium" || peak.intensity === "variable") return 0.34;
    if (peak.intensity === "weak") return 0.22;
    return 0.14;
  }

  // Map the qualitative chemistry label to the approximate minimum transmittance
  // of an isolated band. Peak kind (diagnostic/supporting/fingerprint) no longer
  // silently weakens the band: intensity controls depth; kind controls semantics.
  const baseOpticalDepth = opticalDepthForTransmittance(IR_TARGET_TRANSMITTANCE[peak.intensity]);

  // Broad bands spread the same qualitative strength over a much wider region, so
  // slightly reduce their central optical depth to avoid unrealistically black floors.
  const shapeScale = peak.shape === "extremelyBroad" ? 0.78 : peak.shape === "broad" ? 0.90 : 1;
  return baseOpticalDepth * shapeScale;
}

function irWidth(peak: IRPeak) {
  if (peak.widthCm1) return peak.widthCm1;
  if (peak.shape === "veryNarrow") return 9;
  if (peak.shape === "narrow" || peak.shape === "sharp") return 18;
  if (peak.shape === "broad") return 110;
  if (peak.shape === "extremelyBroad") return 280;
  if (peak.shape === "variable") return 45;
  return 32;
}

function irProfile(distance: number, peak: IRPeak) {
  const gaussian = Math.exp(-0.5 * distance * distance);
  const lorentzian = 1 / (1 + distance * distance);

  if (peak.shape === "veryNarrow") return 0.82 * lorentzian + 0.18 * gaussian;
  if (peak.shape === "narrow" || peak.shape === "sharp") return 0.62 * lorentzian + 0.38 * gaussian;
  if (peak.shape === "broad") {
    const shoulder = Math.exp(-0.5 * ((distance + 0.45) / 1.45) ** 2);
    return 0.72 * gaussian + 0.28 * shoulder;
  }
  if (peak.shape === "extremelyBroad") {
    const isCarboxylicAcidOH = peak.overlapRole === "acidic-oh-envelope";
    if (isCarboxylicAcidOH) {
      // Carboxylic-acid O-H envelopes are strongly hydrogen-bonded, asymmetric, and
      // often lumpy rather than a single symmetric bell. The three overlapping
      // components below create a broad 2500-3300 cm^-1 envelope without a flat floor.
      const lowWing = Math.exp(-0.5 * ((distance + 0.95) / 0.95) ** 2);
      const central = Math.exp(-0.5 * ((distance + 0.08) / 1.08) ** 2);
      const highWing = Math.exp(-0.5 * ((distance - 0.72) / 0.78) ** 2);
      const texture = 0.97 + 0.035 * Math.sin(distance * 8.4) + 0.02 * Math.sin(distance * 15.7);
      return Math.min(1, (0.34 * lowWing + 0.48 * central + 0.18 * highWing) * texture);
    }
    const leftShoulder = Math.exp(-0.5 * ((distance + 0.9) / 1.65) ** 2);
    const rightShoulder = Math.exp(-0.5 * ((distance - 0.55) / 1.95) ** 2);
    return Math.min(1, 0.44 * gaussian + 0.33 * leftShoulder + 0.23 * rightShoulder);
  }
  return gaussian;
}

function buildIrTexturePeaks(peaks: IRPeak[]) {
  const seedText = peaks.map((peak) => irPeakIdentity(peak)).join("|") || "ir";
  const random = createSeededRandom(seedText);
  const strongCenters = peaks
    .filter((peak) => peak.center !== undefined && (peak.intensity === "veryStrong" || peak.intensity === "strong"))
    .map((peak) => peak.center as number);
  const fingerprintCount = peaks.filter((peak) => peak.kind === "fingerprint").length;
  const assignedFingerprintCount = peaks.filter((peak) => {
    const center = peak.center ?? parseWavenumberCenter(peak.range);
    return center !== null && center <= 1500;
  }).length;
  const diagnosticCount = peaks.length - fingerprintCount;
  const alkylChPeaks = peaks
    .map((peak) => ({ peak, center: peak.center ?? parseWavenumberCenter(peak.range) }))
    .filter((item): item is { peak: IRPeak; center: number } =>
      item.center !== null
      && item.center >= 2800
      && item.center <= 3050
      && item.peak.overlapRole === "alkyl-ch",
    );

  // The rule engine already contributes chemically meaningful fingerprint bands.
  // This renderer layer should only add sparse fine texture, not a second full
  // fingerprint spectrum on top of those assignments.
  const microPeakCount = Math.min(
    18,
    Math.max(5, Math.round(4 + fingerprintCount * 0.24 + assignedFingerprintCount * 0.18 + diagnosticCount * 0.06)),
  );
  const deepFingerprintProbability = clamp(0.008 + assignedFingerprintCount * 0.002, 0.008, 0.035);
  const mediumFingerprintProbability = clamp(deepFingerprintProbability + 0.07 + assignedFingerprintCount * 0.003, 0.08, 0.15);
  const microPeaks: IrTexturePeak[] = [];

  for (let index = 0; index < microPeakCount; index += 1) {
    const bucket = random();
    const isFingerprint = bucket < 0.72;
    const isMidRegion = !isFingerprint && bucket < 0.94;
    const center = isFingerprint
      ? 560 + random() * 850
      : isMidRegion
        ? 1400 + random() * 320
        : 3150 + random() * 700;
    const nearStrong = strongCenters.some((value) => Math.abs(value - center) < 24);

    let opticalDepth: number;
    let width: number;
    if (isFingerprint) {
      const strengthRoll = random();
      opticalDepth = strengthRoll < deepFingerprintProbability
        ? 0.55 + random() * 0.28
        : strengthRoll < mediumFingerprintProbability
          ? 0.13 + random() * 0.20
          : 0.018 + random() * 0.065;
      width = 5.5 + random() * (strengthRoll < mediumFingerprintProbability ? 6 : 10);
    } else if (isMidRegion) {
      opticalDepth = 0.025 + random() * 0.085;
      width = 5 + random() * 8;
    } else {
      opticalDepth = 0.003 + random() * 0.012;
      width = 8 + random() * 12;
    }

    microPeaks.push({
      center,
      width,
      absorbance: opticalDepth * (nearStrong ? 0.28 : 1),
    });
  }

  // Give the alkyl C-H stretch envelope the closely spaced, sharp fine structure
  // commonly seen around 2850–3000 cm^-1. These are visualization subfeatures of
  // the assigned CH2/CH3 modes, not additional functional-group assignments.
  if (alkylChPeaks.length > 0) {
    const fineStructureCount = Math.min(6, Math.max(3, alkylChPeaks.length + 1));
    for (let index = 0; index < fineStructureCount; index += 1) {
      const anchor = alkylChPeaks[index % alkylChPeaks.length];
      const direction = index % 2 === 0 ? -1 : 1;
      const offset = direction * (5 + random() * 13) + (random() - 0.5) * 4;
      microPeaks.push({
        center: clamp(anchor.center + offset, 2820, 3010),
        width: 3.2 + random() * 3.8,
        absorbance: 0.075 + random() * 0.13,
      });
    }
  }

  // Narrow unsaturated diagnostic bands can have subtle shoulders, but keep them
  // weak enough that they do not masquerade as extra assigned peaks.
  peaks
    .filter((peak) => {
      const center = peak.center ?? parseWavenumberCenter(peak.range);
      return center !== null
        && center >= 1800
        && center <= 3400
        && peak.overlapRole !== "alkyl-ch"
        && (peak.shape === "veryNarrow" || peak.shape === "narrow");
    })
    .forEach((peak, peakIndex) => {
      const center = peak.center ?? parseWavenumberCenter(peak.range);
      if (center === null) return;
      const baseOffset = 18 + (peakIndex % 3) * 7;
      [-baseOffset, baseOffset + 5].forEach((offset, offsetIndex) => {
        microPeaks.push({
          center: center + offset,
          width: 4.5 + ((peakIndex + offsetIndex) % 2) * 1.4,
          absorbance: 0.025 + 0.012 * ((peakIndex + offsetIndex) % 2),
        });
      });
    });

  return {
    microPeaks,
    noisePhases: [random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2] as const,
  };
}

function renderInstrumentRipple(wavenumber: number, phases: readonly number[]) {
  const fingerprintWeight = wavenumber <= 1500 ? 0.48 : wavenumber <= 2200 ? 0.42 : 0.30;
  const chFineWeight = wavenumber >= 2820 && wavenumber <= 3010 ? 0.9 : 0;
  return fingerprintWeight * (
    0.052 * Math.sin(wavenumber / 41 + phases[0])
    + 0.036 * Math.sin(wavenumber / 18.5 + phases[1])
    + 0.020 * Math.sin(wavenumber / 9.8 + phases[2])
  ) + chFineWeight * (
    0.055 * Math.sin(wavenumber / 7.2 + phases[2])
    + 0.030 * Math.sin(wavenumber / 4.6 + phases[3])
  );
}

function generateIrCurve(peaks: IRPeak[]) {
  const prepared = peaks
    .map((peak) => {
      const center = peak.center ?? parseWavenumberCenter(peak.range);
      return center === null ? null : {
        peak,
        center,
        width: irWidth(peak),
        opticalDepth: irOpticalDepth(peak),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const alkylChBandCount = prepared.filter((item) => item.peak.overlapRole === "alkyl-ch").length;
  // Treat the C-H stretch region as an overlapping family rather than multiplying
  // every member equally. The strongest local component sets the main trough while
  // neighboring modes deepen it only where they genuinely overlap. This preserves
  // a ~20-30% asymmetric envelope without forcing the symmetric bands equally deep.
  const alkylChDominantScale = alkylChBandCount >= 4 ? 2.5 : alkylChBandCount >= 2 ? 2.2 : 1.9;
  const alkylChOverlapScale = alkylChBandCount >= 4 ? 2.8 : alkylChBandCount >= 2 ? 2.4 : 2.0;
  const alkylChSoftCap = 2.2;
  const { microPeaks, noisePhases } = buildIrTexturePeaks(peaks);

  const points: IrCurvePoint[] = [];
  for (let wavenumber = 4000; wavenumber >= 400; wavenumber -= 4) {
    const baseline = 98.2
      + 0.18 * Math.sin(wavenumber / 47)
      + 0.09 * Math.sin(wavenumber / 19)
      + 0.05 * Math.sin(wavenumber / 7.7)
      + renderInstrumentRipple(wavenumber, noisePhases);

    let ordinaryAbsorbance = 0;
    const alkylChContributions: number[] = [];

    for (const item of prepared) {
      const distance = (wavenumber - item.center) / item.width;
      const contribution = item.opticalDepth * irProfile(distance, item.peak);
      if (item.peak.overlapRole === "alkyl-ch") {
        alkylChContributions.push(contribution);
      } else {
        ordinaryAbsorbance += contribution;
      }
    }

    const strongestAlkylCh = alkylChContributions.length > 0
      ? Math.max(...alkylChContributions)
      : 0;
    const overlappingAlkylCh = Math.max(
      0,
      alkylChContributions.reduce((sum, contribution) => sum + contribution, 0) - strongestAlkylCh,
    );
    const scaledAlkylCh = strongestAlkylCh * alkylChDominantScale
      + overlappingAlkylCh * alkylChOverlapScale;
    const combinedAlkylCh = alkylChSoftCap * (1 - Math.exp(-scaledAlkylCh / alkylChSoftCap));

    let textureAbsorbance = 0;
    for (const microPeak of microPeaks) {
      const distance = (wavenumber - microPeak.center) / microPeak.width;
      textureAbsorbance += microPeak.absorbance * Math.exp(-0.5 * distance * distance);
    }

    const totalAbsorbance = ordinaryAbsorbance + combinedAlkylCh + textureAbsorbance;
    const transmittance = baseline * Math.exp(-totalAbsorbance);

    points.push({
      wavenumber,
      transmittance: clamp(transmittance, 3, 100),
    });
  }
  return points;
}

function formatIrShape(shape: IRPeak["shape"]) {
  if (!shape) return "moderate";
  if (shape === "veryNarrow") return "very narrow";
  if (shape === "extremelyBroad") return "extremely broad";
  return shape;
}

function formatIrIntensity(intensity: IRPeak["intensity"]) {
  if (intensity === "veryStrong") return "very strong";
  if (intensity === "veryWeak") return "very weak";
  return intensity;
}

function irPeakNeedsSpecificBondHighlight(peak: IRPeak) {
  return Boolean(peak.vibrationTarget);
}


function IrSpectrumPlot({
  peaks,
  xLabel,
  selectedPeak,
  onSelectPeak,
}: {
  peaks: IRPeak[];
  xLabel: string;
  selectedPeak: IRPeak | null;
  onSelectPeak: (peak: IRPeak) => void;
}) {
  const width = 900;
  const height = 320;
  const left = 58;
  const right = 22;
  const top = 18;
  const bottom = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const minX = 400;
  const maxX = 4000;

  const toX = (value: number) => left + (1 - (value - minX) / (maxX - minX)) * plotWidth;
  const toY = (transmittance: number) => top + ((100 - transmittance) / 100) * plotHeight;
  const curve = generateIrCurve(peaks);
  const path = curve
    .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.wavenumber).toFixed(2)} ${toY(point.transmittance).toFixed(2)}`)
    .join(" ");
  const tickValues = [4000, 3400, 2800, 2200, 1600, 1000, 400];
  const markers = peaks
    .filter((peak) => peak.kind !== "fingerprint" && (peak.intensity === "veryStrong" || peak.intensity === "strong" || peak.shape === "broad" || peak.shape === "extremelyBroad"))
    .map((peak) => {
      const center = peak.center ?? parseWavenumberCenter(peak.range);
      if (center === null) return null;
      return { peak, center, label: peak.label };
    })
    .filter((peak): peak is NonNullable<typeof peak> => Boolean(peak));
  const clickablePeaks = peaks
    .filter((peak) => peak.kind !== "fingerprint" && (peak.center ?? parseWavenumberCenter(peak.range)) !== null)
    .sort((a, b) => irWidth(b) - irWidth(a));

  return (
    <div className="spectrum-plot-shell" aria-label={`${xLabel} predicted spectrum`}>
      <svg className="spectrum-plot" viewBox={`0 0 ${width} ${height}`} role="img">
        <rect x={left} y={top} width={plotWidth} height={plotHeight} fill="#f8fafc" />
        <line x1={left} y1={top} x2={left} y2={height - bottom} className="spectrum-axis" />
        <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} className="spectrum-axis" />

        {[0, 25, 50, 75, 100].map((transmittance) => {
          const y = toY(transmittance);
          return (
            <g key={`ir-y-${transmittance}`}>
              <line
                x1={left}
                y1={y}
                x2={width - right}
                y2={y}
                stroke="rgba(148, 163, 184, 0.28)"
                strokeWidth="1"
                strokeDasharray={transmittance === 0 || transmittance === 100 ? undefined : "4 6"}
              />
              <text x={left - 10} y={y + 4} textAnchor="end" className="spectrum-tick-label">
                {transmittance}
              </text>
            </g>
          );
        })}

        {tickValues.map((value) => {
          const x = toX(value);
          return (
            <g key={`ir-x-${value}`}>
              <line x1={x} y1={height - bottom - 4} x2={x} y2={height - bottom + 4} className="spectrum-axis" />
              <text x={x} y={height - 20} textAnchor="middle" className="spectrum-tick-label">
                {value}
              </text>
            </g>
          );
        })}

        {clickablePeaks.map((peak) => {
          const center = peak.center ?? parseWavenumberCenter(peak.range);
          if (center === null) return null;
          const halfSpan = Math.max(18, Math.min(420, irWidth(peak) * 1.15));
          const xA = toX(clamp(center + halfSpan, minX, maxX));
          const xB = toX(clamp(center - halfSpan, minX, maxX));
          const x = Math.min(xA, xB);
          const hitWidth = Math.max(12, Math.abs(xB - xA));
          const selected = irPeakIsSelected(peak, selectedPeak);
          return (
            <g key={`ir-hit-${irPeakIdentity(peak)}`}>
              <rect
                x={x}
                y={top}
                width={hitWidth}
                height={plotHeight}
                fill={selected ? "rgba(250, 204, 21, 0.12)" : "transparent"}
                stroke={selected ? "rgba(202, 138, 4, 0.62)" : "transparent"}
                strokeWidth={selected ? 1.5 : 0}
                style={{ cursor: "pointer" }}
                onClick={() => onSelectPeak(peak)}
              >
                <title>{`${peak.label} — ${Math.round(center)} cm⁻¹. Click to highlight its molecular assignment.`}</title>
              </rect>
              {selected && (
                <line
                  x1={toX(center)}
                  y1={top}
                  x2={toX(center)}
                  y2={height - bottom}
                  stroke="#ca8a04"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}

        <path d={path} fill="none" stroke="#0f172a" strokeWidth="2.35" strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />

        {markers.slice(0, 10).map((marker, index) => {
          const x = toX(marker.center);
          const selected = irPeakIsSelected(marker.peak, selectedPeak);
          return (
            <g key={`${marker.label}-${marker.center}-${index}`} pointerEvents="none">
              <line x1={x} y1={top + 4} x2={x} y2={height - bottom} stroke={selected ? "rgba(202, 138, 4, 0.36)" : "rgba(15, 23, 42, 0.08)"} strokeWidth={selected ? 1.6 : 1} />
              <text x={x} y={top + 13 + (index % 3) * 12} textAnchor="middle" className="spectrum-peak-label" fill={selected ? "#a16207" : undefined}>
                {Math.round(marker.center)}
              </text>
            </g>
          );
        })}

        <text x={left + plotWidth / 2} y={height - 2} textAnchor="middle" className="spectrum-axis-label">
          {xLabel}
        </text>
        <text
          x={18}
          y={top + plotHeight / 2}
          textAnchor="middle"
          className="spectrum-axis-label"
          transform={`rotate(-90 18 ${top + plotHeight / 2})`}
        >
          % Transmittance
        </text>
      </svg>
    </div>
  );
}

function SpectrumPlot({
  sticks,
  minX,
  maxX,
  reversed = false,
  xLabel,
  mode = "up",
  selectedStickId = null,
  onSelectStick,
}: {
  sticks: Stick[];
  minX: number;
  maxX: number;
  reversed?: boolean;
  xLabel: string;
  mode?: "up" | "down";
  selectedStickId?: string | null;
  onSelectStick?: (stick: Stick) => void;
}) {
  const width = 900;
  const height = 280;
  const left = 52;
  const right = 22;
  const top = 22;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const baseline = mode === "down" ? top + 10 : height - bottom;

  const toX = (value: number) => {
    const fraction = clamp((value - minX) / (maxX - minX), 0, 1);
    const adjusted = reversed ? 1 - fraction : fraction;
    return left + adjusted * plotWidth;
  };

  const ticks = Array.from({ length: 7 }, (_, index) => {
    const value = minX + ((maxX - minX) * index) / 6;
    return reversed ? maxX - ((maxX - minX) * index) / 6 : value;
  });

  return (
    <div className="spectrum-plot-shell" aria-label={`${xLabel} predicted spectrum`}>
      <svg className="spectrum-plot" viewBox={`0 0 ${width} ${height}`} role="img">
        <line x1={left} y1={baseline} x2={width - right} y2={baseline} className="spectrum-axis" />
        {ticks.map((value, index) => {
          const x = left + (plotWidth * index) / 6;
          return (
            <g key={`${value}-${index}`}>
              <line x1={x} y1={baseline - 4} x2={x} y2={baseline + 4} className="spectrum-axis" />
              <text x={x} y={height - 22} textAnchor="middle" className="spectrum-tick-label">
                {Math.abs(value) >= 100 ? Math.round(value) : Number(value.toFixed(1))}
              </text>
            </g>
          );
        })}

        {sticks.map((stick, index) => {
          const x = toX(stick.x);
          const normalizedHeight = clamp(stick.height, 4, 100) / 100;
          const components = nmrLineComponents(stick);
          const componentXs = components.map((component) => toX(stick.x + component.offset));
          const minComponentX = Math.min(...componentXs, x);
          const maxComponentX = Math.max(...componentXs, x);
          const interactive = Boolean(onSelectStick && stick.id && (stick.signal || stick.massPeak));
          const selected = Boolean(stick.id && selectedStickId === stick.id);
          const massPeakHitWidth = stick.massPeak ? 8 : null;
          const massPeakSelectionWidth = stick.massPeak ? 5 : null;
          const labelY = mode === "down"
            ? baseline + normalizedHeight * (plotHeight - 24) + 14
            : baseline - normalizedHeight * (plotHeight - 12) - 7;

          return (
            <g key={stick.id ?? `${stick.x}-${index}`}>
              {interactive && (
                <rect
                  x={stick.massPeak ? x - (massPeakHitWidth ?? 8) / 2 : minComponentX - 10}
                  y={top}
                  width={stick.massPeak ? (massPeakHitWidth ?? 8) : Math.max(22, maxComponentX - minComponentX + 20)}
                  height={plotHeight}
                  fill={selected && !stick.massPeak ? "rgba(250, 204, 21, 0.12)" : "transparent"}
                  stroke={selected && !stick.massPeak ? "rgba(202, 138, 4, 0.62)" : "transparent"}
                  strokeWidth={selected && !stick.massPeak ? 1.5 : 0}
                  style={{ cursor: "pointer" }}
                  onClick={() => onSelectStick?.(stick)}
                >
                  <title>{stick.massPeak ? "Click to select this fragment peak." : "Click to highlight this signal's molecular environment."}</title>
                </rect>
              )}
              {selected && stick.massPeak && (
                <rect
                  x={x - (massPeakSelectionWidth ?? 5) / 2}
                  y={top}
                  width={massPeakSelectionWidth ?? 5}
                  height={plotHeight}
                  fill="rgba(250, 204, 21, 0.12)"
                  stroke="rgba(202, 138, 4, 0.72)"
                  strokeWidth={1.2}
                  pointerEvents="none"
                />
              )}
              {components.map((component, componentIndex) => {
                const componentX = componentXs[componentIndex];
                const componentHeight = normalizedHeight * component.weight;
                const componentY = mode === "down"
                  ? baseline + componentHeight * (plotHeight - 24)
                  : baseline - componentHeight * (plotHeight - 12);
                return (
                  <line
                    key={`${stick.id ?? stick.x}-component-${componentIndex}`}
                    x1={componentX}
                    y1={baseline}
                    x2={componentX}
                    y2={componentY}
                    className={`spectrum-stick spectrum-stick-${mode}`}
                    stroke={selected ? "#ca8a04" : undefined}
                    strokeWidth={selected ? 3.6 : undefined}
                    pointerEvents={interactive ? "none" : undefined}
                  />
                );
              })}
              {stick.label && (
                <text
                  x={x}
                  y={mode === "down" ? Math.min(height - bottom - 4, labelY) : Math.max(top + 10, labelY)}
                  textAnchor="middle"
                  className="spectrum-peak-label"
                  style={selected ? { fill: "#a16207" } : undefined}
                  pointerEvents="none"
                >
                  {stick.label}
                </text>
              )}
            </g>
          );
        })}
        <text x={left + plotWidth / 2} y={height - 4} textAnchor="middle" className="spectrum-axis-label">
          {xLabel}
        </text>
      </svg>
    </div>
  );
}

function NmrTable({
  signals,
  carbon = false,
  selectedSignal = null,
  onSelectSignal,
}: {
  signals: Array<HNMRSignal | CNMRSignal>;
  carbon?: boolean;
  selectedSignal?: HNMRSignal | CNMRSignal | null;
  onSelectSignal?: (signal: HNMRSignal | CNMRSignal) => void;
}) {
  if (signals.length === 0) {
    return <p className="empty">No distinct {carbon ? "carbon" : "proton"} environments were predicted.</p>;
  }

  return (
    <div className="spectroscopy-table-wrap">
      <table className="spectroscopy-table">
        <thead>
          <tr>
            <th>δ range</th>
            {!carbon && <th>Integration</th>}
            {!carbon && <th>Multiplicity</th>}
            {carbon && <th>Equivalent C</th>}
            <th>Assignment</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((signal, index) => {
            const proton = signal as HNMRSignal;
            const carbonSignal = signal as CNMRSignal;
            const selectable = Boolean(onSelectSignal && (signal.atomIndices?.length ?? 0) > 0);
            const selected = selectedSignal !== null
              && nmrSignalIdentity(signal, carbon) === nmrSignalIdentity(selectedSignal, carbon);
            return (
              <tr
                key={`${signal.sourceGroup}-${signal.shift}-${index}`}
                onClick={selectable ? () => onSelectSignal?.(signal) : undefined}
                onKeyDown={selectable ? (event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelectSignal?.(signal);
                } : undefined}
                tabIndex={selectable ? 0 : undefined}
                aria-selected={selected}
                style={selectable ? {
                  cursor: "pointer",
                  background: selected ? "rgba(250, 204, 21, 0.12)" : undefined,
                  boxShadow: selected ? "inset 3px 0 0 rgba(250, 204, 21, 0.9)" : undefined,
                } : undefined}
              >
                <td><strong>{signal.shift}</strong>{selectable && <span title="Structure-linked signal"> ◉</span>}</td>
                {!carbon && <td>{proton.integration ?? "—"}</td>}
                {!carbon && <td>{proton.multiplicity}</td>}
                {carbon && <td>{carbonSignal.carbonCount ?? 1}</td>}
                <td>{signal.sourceGroup}</td>
                <td>{signal.explanation}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IrTable({
  peaks,
  selectedPeak,
  onSelectPeak,
}: {
  peaks: IRPeak[];
  selectedPeak: IRPeak | null;
  onSelectPeak: (peak: IRPeak) => void;
}) {
  const assigned = peaks.filter((peak) => peak.kind !== "fingerprint");
  if (assigned.length === 0) return <p className="empty">No diagnostic IR bands are currently mapped for the detected structure.</p>;

  return (
    <div className="spectroscopy-table-wrap">
      <table className="spectroscopy-table">
        <thead>
          <tr>
            <th>Band</th>
            <th>Predicted center</th>
            <th>Rule range</th>
            <th>Intensity</th>
            <th>Width / shape</th>
            <th>Source</th>
            <th>Rule / modifier</th>
          </tr>
        </thead>
        <tbody>
          {assigned.map((peak, index) => {
            const selected = irPeakIsSelected(peak, selectedPeak);
            const hasSite = (peak.vibrationAtomIndices?.length ?? 0) > 0
              || (peak.vibrationBondIndices?.length ?? 0) > 0
              || (peak.atomIndices?.length ?? 0) > 0
              || (peak.bondIndices?.length ?? 0) > 0;
            return (
              <tr
                key={`${peak.id ?? peak.label}-${peak.range}-${index}`}
                onClick={() => onSelectPeak(peak)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelectPeak(peak);
                }}
                tabIndex={0}
                aria-selected={selected}
                title={hasSite ? "Select this band and highlight its molecular assignment" : "Select this band"}
                style={{
                  cursor: "pointer",
                  background: selected ? "rgba(250, 204, 21, 0.12)" : undefined,
                  boxShadow: selected ? "inset 3px 0 0 rgba(250, 204, 21, 0.9)" : undefined,
                }}
              >
                <td><strong>{peak.label}</strong>{hasSite && <span title="Structure-linked peak"> ◉</span>}</td>
                <td>{peak.center === undefined ? "—" : `${Math.round(peak.center)} cm⁻¹`}</td>
                <td>{peak.range}</td>
                <td>{formatIrIntensity(peak.intensity)}</td>
                <td>{formatIrShape(peak.shape)}</td>
                <td>{peak.sourceGroup}</td>
                <td>
                  {peak.modifiers && peak.modifiers.length > 0 && <strong>{peak.modifiers.join(", ")}: </strong>}
                  {peak.explanation}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MassTable({
  peaks,
  selectedPeak = null,
  onSelectPeak,
}: {
  peaks: MassSpectrumPeak[];
  selectedPeak?: MassSpectrumPeak | null;
  onSelectPeak?: (peak: MassSpectrumPeak) => void;
}) {
  if (peaks.length === 0) return <p className="empty">No mass-spectrum peaks could be generated.</p>;
  return (
    <div className="spectroscopy-table-wrap">
      <table className="spectroscopy-table">
        <thead><tr><th>m/z</th><th>Relative intensity</th><th>Assignment</th><th>Interpretation</th></tr></thead>
        <tbody>
          {[...peaks].sort((a, b) => b.relativeIntensity - a.relativeIntensity).map((peak, index) => {
            const selected = selectedPeak ? massPeakIdentity(selectedPeak) === massPeakIdentity(peak) : false;
            return (
              <tr
                key={`${peak.mz}-${peak.label}-${index}`}
                onClick={() => onSelectPeak?.(peak)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelectPeak?.(peak);
                }}
                tabIndex={0}
                aria-selected={selected}
                style={{
                  cursor: "pointer",
                  background: selected ? "rgba(250, 204, 21, 0.12)" : undefined,
                  boxShadow: selected ? "inset 3px 0 0 rgba(250, 204, 21, 0.9)" : undefined,
                }}
                title={(peak.previewStructure || peak.fragmentSmiles) ? "Select this peak and show its ion/fragment above" : "Select this peak"}
              >
                <td><strong>{peak.mz}</strong></td>
                <td>{peak.relativeIntensity.toFixed(1)}%</td>
                <td>{peak.label}</td>
                <td>{peak.explanation}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SpectroscopyPage() {
  const [ketcher, setKetcher] = useState<KetcherApi | null>(null);
  const [editorResetVersion, setEditorResetVersion] = useState(0);
  const [activeTab, setActiveTab] = useState<SpectroscopyTab>("proton");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [status, setStatus] = useState("Draw a molecule first");
  const [smiles, setSmiles] = useState("Not analyzed yet");
  const [structureSvg, setStructureSvg] = useState<string | null>(null);
  const [structureSource, setStructureSource] = useState("");
  const [selectedIrPeak, setSelectedIrPeak] = useState<IRPeak | null>(null);
  const [resolvedIrHighlight, setResolvedIrHighlight] = useState<ResolvedIrHighlight | null>(null);
  const [irHighlightedSvg, setIrHighlightedSvg] = useState<string | null>(null);
  const [selectedNmrSignal, setSelectedNmrSignal] = useState<HNMRSignal | CNMRSignal | null>(null);
  const [nmrHighlightedSvg, setNmrHighlightedSvg] = useState<string | null>(null);
  const [selectedMassPeak, setSelectedMassPeak] = useState<MassSpectrumPeak | null>(null);
  const [massFragmentSvg, setMassFragmentSvg] = useState<string | null>(null);
  const [massPreviewSvgs, setMassPreviewSvgs] = useState<Array<{ label: string; svg: string }>>([]);
  const [name, setName] = useState<string | null>(null);
  const [formula, setFormula] = useState<string | null>(null);
  const [result, setResult] = useState<SpectroscopyResult | null>(null);
  const structurePreviewRef = useRef<HTMLDivElement | null>(null);

  const protonSticks = useMemo<Stick[]>(() => {
    const signals = result?.protonNMR ?? [];
    const rawIntensities = signals.map(protonSignalRawVisualIntensity);
    const maxIntensity = Math.max(...rawIntensities, 1);
    return signals.map((signal, index) => ({
      x: signal.shiftCenter ?? 0,
      // Normalize the tallest predicted line to ~92% of the plot height, like a
      // conventionally normalized experimental spectrum. Keep weak multiplets visible.
      height: clamp(18 + 74 * (rawIntensities[index] / maxIntensity), 18, 92),
      label: signal.integration,
      id: nmrSignalIdentity(signal, false),
      signal,
    }));
  }, [result]);

  const protonMax = useMemo(() => {
    const maxShift = Math.max(...(result?.protonNMR ?? []).map((signal) => signal.shiftCenter ?? 0), 0);
    return maxShift > 11.5 ? 14 : 12;
  }, [result]);

  const carbonSticks = useMemo<Stick[]>(() =>
    (result?.carbonNMR ?? []).map((signal) => ({
      x: signal.shiftCenter ?? 0,
      height: 72,
      label: signal.carbonCount && signal.carbonCount > 1 ? `×${signal.carbonCount}` : undefined,
      id: nmrSignalIdentity(signal, true),
      signal,
    })), [result]);


  const massSticks = useMemo<Stick[]>(() =>
    (result?.massSpec?.peaks ?? []).map((peak) => ({
      x: peak.mz,
      height: peak.relativeIntensity,
      label: peak.kind === "molecular-ion" || peak.kind === "diagnostic" ? peak.label : undefined,
      id: massPeakIdentity(peak),
      massPeak: peak,
    })), [result]);

  const massMax = useMemo(() => {
    const values = result?.massSpec?.peaks.map((peak) => peak.mz) ?? [];
    return Math.max(100, Math.ceil((Math.max(...values, 100) + 10) / 25) * 25);
  }, [result]);

  const revealSelectedAssignment = () => {
    window.setTimeout(() => {
      document.getElementById("spectroscopy-selected-assignment")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 0);
  };

  const selectNextNmrSignalForAtoms = (atomIndices: number[]) => {
    if (!result || (activeTab !== "proton" && activeTab !== "carbon")) return;
    const carbon = activeTab === "carbon";
    const signals: Array<HNMRSignal | CNMRSignal> = carbon ? result.carbonNMR : result.protonNMR;
    const atomSet = new Set(atomIndices);
    const candidates = signals.filter((signal) =>
      (signal.atomIndices ?? []).some((atomIndex) => atomSet.has(atomIndex)),
    );
    if (candidates.length === 0) return;

    const currentIndex = selectedNmrSignal
      ? candidates.findIndex((candidate) =>
          nmrSignalIdentity(candidate, carbon) === nmrSignalIdentity(selectedNmrSignal, carbon),
        )
      : -1;
    const nextSignal = candidates[(currentIndex + 1) % candidates.length];
    setSelectedNmrSignal(nextSignal);
    revealSelectedAssignment();
  };

  const selectNextIrPeakForSite = async (atomIndices: number[], bondIndex: number | null) => {
    if (!result || !structureSource) return;
    const assignedPeaks = result.ir.filter((peak) => peak.kind !== "fingerprint");
    const resolved = await Promise.all(assignedPeaks.map(async (peak) => ({
      peak,
      site: await resolveIRPeakHighlightSite(structureSource, peak),
    })));
    const clickedAtoms = new Set(atomIndices);

    const exactBondMatches = bondIndex === null
      ? []
      : resolved.filter(({ site }) => site.bondIndices.includes(bondIndex));
    const atomMatches = resolved.filter(({ site }) =>
      site.atomIndices.some((atomIndex) => clickedAtoms.has(atomIndex)),
    );
    const candidates = (exactBondMatches.length > 0 ? exactBondMatches : atomMatches).map(({ peak }) => peak);
    if (candidates.length === 0) return;

    const currentIndex = selectedIrPeak
      ? candidates.findIndex((candidate) => irPeakIsSelected(candidate, selectedIrPeak))
      : -1;
    setSelectedIrPeak(candidates[(currentIndex + 1) % candidates.length]);
    revealSelectedAssignment();
  };

  const handleMoleculeSiteSelection = (atomIndices: number[], bondIndex: number | null) => {
    if (activeTab === "ir") {
      void selectNextIrPeakForSite(atomIndices, bondIndex);
      return;
    }
    if (activeTab === "proton" || activeTab === "carbon") {
      selectNextNmrSignalForAtoms(atomIndices);
    }
  };

  const handleIrPeakSelect = (peak: IRPeak) => {
    setSelectedIrPeak((current) => irPeakIsSelected(peak, current) ? null : peak);
  };

  useEffect(() => {
    let cancelled = false;

    if (!selectedIrPeak || !structureSource) {
      setResolvedIrHighlight(null);
      setIrHighlightedSvg(null);
      return () => { cancelled = true; };
    }

    void (async () => {
      try {
        const resolved = await resolveIRPeakHighlightSite(structureSource, selectedIrPeak);
        if (cancelled) return;

        setResolvedIrHighlight(resolved);
        if (resolved.atomIndices.length === 0 && resolved.bondIndices.length === 0) {
          setIrHighlightedSvg(null);
          return;
        }

        const hasResolvedBonds = resolved.bondIndices.length > 0;
        const svg = await getHighlightedMoleculeSvg(
          structureSource,
          [],
          [],
          null,
          null,
          // Bond vibrations are shown as clean bond overlays. Atom circles are only
          // retained for atom-only assignments where there is no explicit bond site.
          hasResolvedBonds ? [] : resolved.atomIndices,
          resolved.bondIndices,
          {
            selectedAtomRadius: 0.24,
            softAtomRadius: 0.20,
            bondWidthMultiplier: hasResolvedBonds ? 3.2 : 4,
          },
        );
        if (!cancelled) setIrHighlightedSvg(svg);
      } catch (error) {
        console.warn("IR peak highlighting failed:", error);
        if (cancelled) return;

        // Do not display a chemically misleading parent group for a bond-specific
        // assignment. If exact resolution fails, show no structural highlight rather
        // than highlighting (for example) a carboxylic acid for an aromatic C=C peak.
        if (irPeakNeedsSpecificBondHighlight(selectedIrPeak)) {
          setResolvedIrHighlight({ atomIndices: [], bondIndices: [], specificity: "none" });
          setIrHighlightedSvg(null);
          return;
        }

        // Preserve the existing functional-group behavior for genuinely broad/group-level
        // assignments such as O–H envelopes.
        const atoms = selectedIrPeak.atomIndices ?? [];
        const bonds = selectedIrPeak.bondIndices ?? [];
        setResolvedIrHighlight({
          atomIndices: atoms,
          bondIndices: bonds,
          specificity: atoms.length > 0 || bonds.length > 0 ? "functional-group" : "none",
        });

        if (atoms.length === 0 && bonds.length === 0) {
          setIrHighlightedSvg(null);
          return;
        }

        try {
          const hasFallbackBonds = bonds.length > 0;
          const svg = await getHighlightedMoleculeSvg(
            structureSource,
            [],
            [],
            null,
            null,
            hasFallbackBonds ? [] : atoms,
            bonds,
            {
              selectedAtomRadius: 0.24,
              softAtomRadius: 0.20,
              bondWidthMultiplier: hasFallbackBonds ? 3.2 : 4,
            },
          );
          if (!cancelled) setIrHighlightedSvg(svg);
        } catch (fallbackError) {
          console.warn("IR functional-group fallback highlighting failed:", fallbackError);
          if (!cancelled) setIrHighlightedSvg(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedIrPeak, structureSource]);

  const handleNmrSignalSelect = (signal: HNMRSignal | CNMRSignal) => {
    const carbon = activeTab === "carbon";
    setSelectedNmrSignal((current) => current && nmrSignalIdentity(current, carbon) === nmrSignalIdentity(signal, carbon) ? null : signal);
  };

  const handleMassPeakSelect = (peak: MassSpectrumPeak) => {
    setSelectedMassPeak((current) => current && massPeakIdentity(current) === massPeakIdentity(peak) ? null : peak);
  };

  useEffect(() => {
    let cancelled = false;
    const atoms = selectedNmrSignal?.atomIndices ?? [];
    if (!selectedNmrSignal || !structureSource || atoms.length === 0) {
      setNmrHighlightedSvg(null);
      return () => { cancelled = true; };
    }

    void getHighlightedMoleculeSvg(
      structureSource,
      [],
      [],
      null,
      null,
      atoms,
      [],
    ).then((svg) => {
      if (!cancelled) setNmrHighlightedSvg(svg);
    }).catch((error) => {
      console.warn("NMR signal highlighting failed:", error);
      if (!cancelled) setNmrHighlightedSvg(null);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedNmrSignal, structureSource]);

  useEffect(() => {
    let cancelled = false;
    const previewSource = selectedMassPeak?.previewStructure ?? selectedMassPeak?.fragmentSmiles;
    if (activeTab !== "mass" || !selectedMassPeak || !previewSource) {
      setMassFragmentSvg(null);
      setMassPreviewSvgs([]);
      return () => { cancelled = true; };
    }

    const alternatives = selectedMassPeak.previewAlternatives?.length
      ? selectedMassPeak.previewAlternatives
      : [{
          structure: previewSource,
          label: selectedMassPeak.previewContributorLabels?.[0] ?? selectedMassPeak.previewLabel ?? selectedMassPeak.label,
        }];

    void Promise.all(alternatives.map(async (alternative) => {
      const rawSvg = await getMoleculeSvg(alternative.structure);
      if (!rawSvg) return null;
      const badgeLabel = alternatives.length > 1
        ? `${selectedMassPeak.previewLabel ?? selectedMassPeak.label} · ${alternative.label}`
        : selectedMassPeak.previewLabel ?? selectedMassPeak.label;
      return {
        label: alternative.label,
        svg: addMassSpeciesBadge(rawSvg, badgeLabel),
      };
    })).then((entries) => {
      if (cancelled) return;
      const rendered = entries.filter((entry): entry is { label: string; svg: string } => Boolean(entry));
      setMassPreviewSvgs(rendered);
      setMassFragmentSvg(rendered[0]?.svg ?? null);
    }).catch((error) => {
      console.warn("Mass-species rendering failed:", error);
      if (cancelled) return;
      setMassFragmentSvg(null);
      setMassPreviewSvgs([]);
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedMassPeak]);

  const displayedStructureSvg = activeTab === "ir" && irHighlightedSvg
    ? irHighlightedSvg
    : activeTab === "mass" && massFragmentSvg
      ? massFragmentSvg
      : (activeTab === "proton" || activeTab === "carbon") && nmrHighlightedSvg
        ? nmrHighlightedSvg
        : structureSvg;

  useEffect(() => {
    const container = structurePreviewRef.current;
    if (!container || !displayedStructureSvg || !result) return;
    const svg = container.querySelector("svg");
    if (!svg) return;

    const clickableElements = svg.querySelectorAll("[class*='atom-'], [class*='bond-']");
    const cleanups: Array<() => void> = [];

    clickableElements.forEach((element) => {
      element.classList.add("svg-clickable-site");
      const handleClick = (event: Event) => {
        if (activeTab === "mass") return;
        event.stopPropagation();
        const className = element.getAttribute("class") ?? "";
        const bondMatch = className.match(/bond-(\d+)/);
        const atomIndices = Array.from(className.matchAll(/atom-(\d+)/g))
          .map((match) => Number(match[1]))
          .filter((value, index, values) => Number.isFinite(value) && values.indexOf(value) === index);
        if (atomIndices.length === 0 && !bondMatch) return;
        handleMoleculeSiteSelection(atomIndices, bondMatch ? Number(bondMatch[1]) : null);
      };
      element.addEventListener("click", handleClick);
      cleanups.push(() => element.removeEventListener("click", handleClick));
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [displayedStructureSvg, result, activeTab, selectedIrPeak, selectedNmrSignal, structureSource]);

  const analyze = async () => {
    if (!ketcher || isAnalyzing) return;
    setIsAnalyzing(true);
    setStatus("Reading structure…");

    try {
      const snapshot = await readKetcherStructureSnapshot(ketcher);
      const currentSmiles = snapshot?.smiles?.trim() ?? "";
      if (!currentSmiles) {
        setStatus("Draw a molecule before predicting spectra.");
        setResult(null);
        return;
      }

      setSmiles(currentSmiles);
      const spectroscopyStructure = snapshot?.molfile || currentSmiles;
      setStructureSource(spectroscopyStructure);
      setSelectedIrPeak(null);
      setResolvedIrHighlight(null);
      setIrHighlightedSvg(null);
      setSelectedNmrSignal(null);
      setNmrHighlightedSvg(null);
      setSelectedMassPeak(null);
      setMassFragmentSvg(null);
      setMassPreviewSvgs([]);
      setStatus("Detecting functional groups and molecular properties…");
      const hierarchy = await analyzeFunctionalGroupHierarchy(spectroscopyStructure);
      const identity = await analyzeNomenclatureAndProperties(
        currentSmiles,
        hierarchy.primaryGroups,
        hierarchy.mainGroup,
      );
      const svgPromise = getMoleculeSvg(currentSmiles);
      const exactMassValue = Number.parseFloat(identity.properties.exactMass ?? "");

      setStatus("Predicting NMR, IR, and mass spectra…");
      const spectroscopy = await analyzeMolecularSpectroscopy({
        structure: spectroscopyStructure,
        functionalGroups: hierarchy.functionalGroups,
        formula: identity.properties.molecularFormula,
        exactMass: Number.isFinite(exactMassValue) ? exactMassValue : null,
      });

      setResult(spectroscopy);
      setStructureSvg(await svgPromise);
      setName(identity.nomenclature.displayName || identity.nomenclature.estimatedName);
      setFormula(identity.properties.molecularFormula);
      setStatus("Spectroscopy prediction complete");
    } catch (error) {
      console.error("Spectroscopy analysis failed:", error);
      setStatus("Spectroscopy prediction failed. Check the structure and try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const clear = () => {
    // Reset both the spectroscopy state and the editor itself. Importing an empty
    // structure into Ketcher can leave stale selection/tool/zoom state, so remount
    // the drawer to guarantee a genuinely blank canvas.
    setKetcher(null);
    setEditorResetVersion((version) => version + 1);
    setResult(null);
    setStatus("Draw a molecule first");
    setSmiles("Not analyzed yet");
    setStructureSvg(null);
    setStructureSource("");
    setSelectedIrPeak(null);
    setResolvedIrHighlight(null);
    setIrHighlightedSvg(null);
    setSelectedNmrSignal(null);
    setNmrHighlightedSvg(null);
    setSelectedMassPeak(null);
    setMassFragmentSvg(null);
    setMassPreviewSvgs([]);
    setName(null);
    setFormula(null);
    setActiveTab("proton");
  };

  return (
    <div className="spectroscopy-page">
      <section className="card spectroscopy-input-card">
        <div className="card-header">
          <div>
            <h2>Spectroscopy</h2>
            <p>Draw one molecule to predict its ¹H NMR, ¹³C NMR, IR, and mass-spectrum features.</p>
          </div>
          <span className={`status ${ketcher ? "ready" : "loading"}`}>{ketcher ? "Editor ready" : "Loading editor"}</span>
        </div>

        <div className="drawer-placeholder spectroscopy-drawer">
          <MoleculeDrawer
            key={`spectroscopy-ketcher-${editorResetVersion}`}
            onReady={setKetcher}
            globalKey="spectroscopyKetcher"
          />
        </div>

        <div className="button-row">
          <button className="primary-button" type="button" onClick={analyze} disabled={!ketcher || isAnalyzing}>
            {isAnalyzing ? "Predicting…" : "Predict Spectra"}
          </button>
          <button className="secondary-button" type="button" onClick={clear} disabled={isAnalyzing}>Clear Analysis</button>
        </div>
      </section>

      <section className="card spectroscopy-results-card">
        <div className="spectroscopy-summary">
          <div>
            <p className="label">Status</p>
            <strong>{status}</strong>
          </div>
          <div>
            <p className="label">Compound</p>
            <strong>{name ?? "—"}</strong>
          </div>
          <div>
            <p className="label">Formula</p>
            <strong>{formula ?? "—"}</strong>
          </div>
          <div>
            <p className="label">SMILES</p>
            <code>{smiles}</code>
          </div>
        </div>

        {activeTab === "mass" && massPreviewSvgs.length > 1 ? (
          <div
            className="spectroscopy-structure-preview highlighted-molecule-svg"
            title={selectedMassPeak?.kind === "isotope"
              ? "Multiple isotope-labeled molecular ions can contribute to this same isotope-envelope peak."
              : "The selected ion and its related fragment(s) are shown above."
            }
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "12px",
              alignItems: "stretch",
            }}
          >
            {massPreviewSvgs.map((preview, index) => (
              <div
                key={`${preview.label}-${index}`}
                style={{ minWidth: 0, width: "100%", overflow: "hidden" }}
                dangerouslySetInnerHTML={{ __html: preview.svg }}
              />
            ))}
          </div>
        ) : displayedStructureSvg && (
          <div
            ref={structurePreviewRef}
            className={((activeTab === "ir" && irHighlightedSvg) || ((activeTab === "proton" || activeTab === "carbon") && nmrHighlightedSvg) || (activeTab === "mass" && massFragmentSvg)) ? "spectroscopy-structure-preview highlighted-molecule-svg" : "spectroscopy-structure-preview"}
            title={activeTab === "mass"
              ? ((selectedMassPeak?.previewStructure || selectedMassPeak?.fragmentSmiles) ? "Selected mass-spectral ion or fragment shown above." : undefined)
              : "Tap an atom or bond to jump to the corresponding spectral assignment. Tap the same site again to cycle through multiple matching assignments."}
            dangerouslySetInnerHTML={{ __html: displayedStructureSvg }}
          />
        )}

        <div className="spectroscopy-tab-row" role="tablist" aria-label="Spectroscopy methods">
          {TABS.map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "spectroscopy-tab active" : "spectroscopy-tab"}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedIrPeak(null);
                setResolvedIrHighlight(null);
                setIrHighlightedSvg(null);
                setSelectedNmrSignal(null);
                setNmrHighlightedSvg(null);
                setSelectedMassPeak(null);
                setMassFragmentSvg(null);
                setMassPreviewSvgs([]);
              }}
              key={tab.id}
            >
              <span className="spectroscopy-tab-full">{tab.label}</span>
              <span className="spectroscopy-tab-short">{tab.shortLabel}</span>
            </button>
          ))}
        </div>

        {!result ? (
          <div className="spectroscopy-empty-state">
            <h3>No spectrum yet</h3>
            <p>Draw a structure and choose <strong>Predict Spectra</strong>. Predictions are educational estimates based on local chemical environments and diagnostic functional-group rules.</p>
          </div>
        ) : (
          <div className="spectroscopy-panel">
            {activeTab === "proton" && (
              <>
                <div className="spectroscopy-panel-heading">
                  <div><h3>Predicted ¹H NMR</h3><p>Estimated chemical-shift regions, integrations, and first-order splitting.</p></div>
                  <span>{result.protonNMR.length} signal{result.protonNMR.length === 1 ? "" : "s"}</span>
                </div>
                <SpectrumPlot
                  sticks={protonSticks}
                  minX={0}
                  maxX={protonMax}
                  reversed
                  xLabel="δ (ppm)"
                  selectedStickId={selectedNmrSignal ? nmrSignalIdentity(selectedNmrSignal, false) : null}
                  onSelectStick={(stick) => stick.signal && handleNmrSignalSelect(stick.signal)}
                />
                {selectedNmrSignal && (
                  <div id="spectroscopy-selected-assignment" className="annotation-card annotation-card-selected" style={{ cursor: "default" }}>
                    <h3>{selectedNmrSignal.sourceGroup}</h3>
                    <p><strong>{selectedNmrSignal.shift}</strong>{` · ${(selectedNmrSignal as HNMRSignal).integration ?? "—"} · ${(selectedNmrSignal as HNMRSignal).multiplicity ?? "—"}`}</p>
                    <p>{selectedNmrSignal.explanation}</p>
                    <p className="selected-note">The atoms responsible for this ¹H signal are highlighted above.</p>
                    {nmrHighlightedSvg && (
                      <div className="highlight-preview">
                        <div className="highlighted-molecule-svg" dangerouslySetInnerHTML={{ __html: nmrHighlightedSvg }} />
                      </div>
                    )}
                  </div>
                )}
                <NmrTable signals={result.protonNMR} selectedSignal={selectedNmrSignal} onSelectSignal={handleNmrSignalSelect} />
                <p className="spectroscopy-method-note">Tap a signal or assignment row to connect it to the molecular environment, or tap the corresponding atom/bond in the molecule to jump back to its signal. If one molecular site maps to multiple signals, repeated taps cycle through them. Multiplicity uses a simplified first-order local-coupling model with graph-symmetry handling for common aromatic patterns. Exchangeable O-H positions are approximate; second-order coupling, diastereotopic protons, and long-range coupling are not fully simulated.</p>
              </>
            )}

            {activeTab === "carbon" && (
              <>
                <div className="spectroscopy-panel-heading">
                  <div><h3>Predicted ¹³C NMR</h3><p>Distinct carbon environments are grouped using iterative graph-environment fingerprints.</p></div>
                  <span>{result.carbonNMR.length} signal{result.carbonNMR.length === 1 ? "" : "s"}</span>
                </div>
                <SpectrumPlot
                  sticks={carbonSticks}
                  minX={0}
                  maxX={220}
                  reversed
                  xLabel="δ (ppm)"
                  selectedStickId={selectedNmrSignal ? nmrSignalIdentity(selectedNmrSignal, true) : null}
                  onSelectStick={(stick) => stick.signal && handleNmrSignalSelect(stick.signal)}
                />
                {selectedNmrSignal && (
                  <div id="spectroscopy-selected-assignment" className="annotation-card annotation-card-selected" style={{ cursor: "default" }}>
                    <h3>{selectedNmrSignal.sourceGroup}</h3>
                    <p><strong>{selectedNmrSignal.shift}</strong>{` · ${(selectedNmrSignal as CNMRSignal).carbonCount ?? 1} equivalent C`}</p>
                    <p>{selectedNmrSignal.explanation}</p>
                    <p className="selected-note">The carbon environment responsible for this ¹³C signal is highlighted above.</p>
                    {nmrHighlightedSvg && (
                      <div className="highlight-preview">
                        <div className="highlighted-molecule-svg" dangerouslySetInnerHTML={{ __html: nmrHighlightedSvg }} />
                      </div>
                    )}
                  </div>
                )}
                <NmrTable signals={result.carbonNMR} carbon selectedSignal={selectedNmrSignal} onSelectSignal={handleNmrSignalSelect} />
              </>
            )}

            {activeTab === "ir" && (
              <>
                <div className="spectroscopy-panel-heading">
                  <div>
                    <h3>Predicted IR</h3>
                    <p>Rule-based percent-transmittance simulation with structure-dependent peak position, intensity, width, overlap, and fingerprint features.</p>
                  </div>
                  <span>
                    {result.ir.filter((peak) => peak.kind !== "fingerprint").length} assigned band{result.ir.filter((peak) => peak.kind !== "fingerprint").length === 1 ? "" : "s"}
                  </span>
                </div>
                <IrSpectrumPlot
                  peaks={result.ir}
                  xLabel="Wavenumber (cm⁻¹)"
                  selectedPeak={selectedIrPeak}
                  onSelectPeak={handleIrPeakSelect}
                />
                {selectedIrPeak && (
                  <div id="spectroscopy-selected-assignment" className="annotation-card annotation-card-selected" style={{ cursor: "default" }}>
                    <h3>{selectedIrPeak.label}</h3>
                    <p>
                      <strong>{selectedIrPeak.center === undefined ? selectedIrPeak.range : `${Math.round(selectedIrPeak.center)} cm⁻¹`}</strong>
                      {` · ${formatIrIntensity(selectedIrPeak.intensity)} · ${formatIrShape(selectedIrPeak.shape)}`}
                    </p>
                    <p>{selectedIrPeak.sourceGroup}: {selectedIrPeak.explanation}</p>
                    {resolvedIrHighlight?.specificity === "vibration" && resolvedIrHighlight.bondIndices.length > 0 ? (
                      <p className="selected-note">
                        The specific bond{resolvedIrHighlight.bondIndices.length === 1 ? "" : "s"} participating in this vibration {resolvedIrHighlight.bondIndices.length === 1 ? "is" : "are"} highlighted above. The parent functional-group assignment remains available only as a fallback.
                      </p>
                    ) : resolvedIrHighlight?.specificity === "vibration" && resolvedIrHighlight.atomIndices.length > 0 ? (
                      <p className="selected-note">The specific atom site participating in this vibration is highlighted above. The parent functional-group assignment remains available only as a fallback.</p>
                    ) : resolvedIrHighlight?.specificity === "functional-group" && resolvedIrHighlight.bondIndices.length > 0 ? (
                      <p className="selected-note">This vibration could not be localized more narrowly, so the original functional-group bond site is highlighted above.</p>
                    ) : resolvedIrHighlight?.specificity === "functional-group" && resolvedIrHighlight.atomIndices.length > 0 ? (
                      <p className="selected-note">This vibration could not be localized more narrowly, so the original functional-group atom site is highlighted above.</p>
                    ) : (
                      <p className="spectroscopy-method-note">This band does not map cleanly to one local atom/bond set, so only the spectral assignment is selected.</p>
                    )}
                    {irHighlightedSvg && (
                      <div className="highlight-preview">
                        <div
                          className="highlighted-molecule-svg"
                          dangerouslySetInnerHTML={{ __html: irHighlightedSvg }}
                        />
                      </div>
                    )}
                  </div>
                )}
                <div className="spectroscopy-notes">
                  <p><strong>Two-way linking:</strong> tap an assigned IR band to highlight its molecular vibration, or tap an atom/bond in the molecule to select the corresponding band and card. Repeated taps cycle through multiple bands associated with the same molecular site.</p>
                  <p><strong>Functional-group region:</strong> 4000–1500 cm⁻¹. The engine applies characteristic stretches plus modifiers such as hydrogen bonding, conjugation, ring strain, resonance donation, overlap suppression, and symmetry suppression.</p>
                  <p><strong>Fingerprint region:</strong> below 1500 cm⁻¹. Named bands are combined with deterministic, complexity-weighted skeletal/bending modes; the 650–1350 cm⁻¹ region is intentionally more crowded while major diagnostic bands remain visible.</p>
                </div>
                <IrTable peaks={result.ir} selectedPeak={selectedIrPeak} onSelectPeak={handleIrPeakSelect} />
              </>
            )}

            {activeTab === "mass" && result.massSpec && (
              <>
                <div className="spectroscopy-panel-heading">
                  <div><h3>Predicted Mass Spectrum</h3><p>Molecular ion, natural-isotope envelope, and selected common fragments.</p></div>
                  <span>M = {result.massSpec.molecularIonMz ?? "—"}</span>
                </div>
                <SpectrumPlot
                  sticks={massSticks}
                  minX={0}
                  maxX={massMax}
                  xLabel="m/z"
                  selectedStickId={selectedMassPeak ? massPeakIdentity(selectedMassPeak) : null}
                  onSelectStick={(stick) => {
                    if (stick.massPeak) handleMassPeakSelect(stick.massPeak);
                  }}
                />
                <div className="mass-summary-grid">
                  <div><span>Molecular ion</span><strong>{result.massSpec.molecularIonMz ?? "—"}</strong></div>
                  <div><span>Nominal mass</span><strong>{result.massSpec.nominalMass ?? "—"}</strong></div>
                  <div><span>Predicted base peak</span><strong>{result.massSpec.basePeakMz ?? "—"}</strong></div>
                </div>
                {selectedMassPeak && (
                  <div id="spectroscopy-selected-assignment" className="selected-assignment-card">
                    <p className="selected-tag">Selected mass-spectral assignment</p>
                    <h4>{selectedMassPeak.label}</h4>
                    <p><strong>m/z {selectedMassPeak.mz}</strong> · {selectedMassPeak.relativeIntensity.toFixed(1)}% relative intensity</p>
                    <p>{selectedMassPeak.explanation}</p>
                    {selectedMassPeak.kind === "molecular-ion" && selectedMassPeak.previewStructure ? (
                      <p className="selected-note">The intact molecular radical-cation skeleton is shown above. Its charge/radical is labeled at the species level rather than assigned to an arbitrary atom.</p>
                    ) : selectedMassPeak.kind === "isotope" && selectedMassPeak.previewStructure ? (
                      <p className="selected-note">A representative isotope-labeled molecular ion for this isotope peak is shown above. Equivalent isotope placements may contribute to the same m/z.</p>
                    ) : (selectedMassPeak.previewStructure || selectedMassPeak.fragmentSmiles) ? (
                      <p className="selected-note">{selectedMassPeak.previewAlternatives && selectedMassPeak.previewAlternatives.length > 1
                        ? "The selected ion and its companion fragment(s) are shown above instead of the full neutral parent molecule."
                        : "The ion/fragment corresponding to this selected peak is shown above instead of the full neutral parent molecule."
                      }</p>
                    ) : (
                      <p className="selected-note">A specific structure is not available for this peak yet, so the parent molecule remains shown above.</p>
                    )}
                  </div>
                )}
                <MassTable peaks={result.massSpec.peaks} selectedPeak={selectedMassPeak} onSelectPeak={handleMassPeakSelect} />
                <div className="spectroscopy-notes">
                  {result.massSpec.notes.map((note) => <p key={note}>{note}</p>)}
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
