import { getRDKit } from "../rdkit";
import { getOtherAtom, parseMolBlock } from "../nomenclature/molParser";
import type { ParsedMol } from "../nomenclature/types";
import type { FunctionalGroupResult } from "../functionalGroups";
import type {
  IRBandFamily,
  IRPeak,
  IRPeakIntensity,
  IRPeakKind,
  IRPeakShape,
  IRVibrationMode,
  IROverlapRole,
  IRSuppressionClass,
  IRVibrationTarget,
} from "./types";

type Range = readonly [number, number];

type PeakOptions = {
  center?: number;
  family?: IRBandFamily;
  mode?: IRVibrationMode;
  intensity?: IRPeakIntensity;
  shape?: IRPeakShape;
  widthCm1?: number;
  kind?: IRPeakKind;
  explanation?: string;
  modifiers?: string[];
  vibrationTarget?: IRVibrationTarget;
  suppressionClass?: IRSuppressionClass;
  suppressionPriority?: number;
  overlapRole?: IROverlapRole;
  atomIndices?: number[];
  bondIndices?: number[];
};

const WIDTH_BY_SHAPE: Record<IRPeakShape, number> = {
  veryNarrow: 9,
  narrow: 16,
  sharp: 20,
  moderate: 32,
  broad: 105,
  extremelyBroad: 260,
  variable: 42,
};

const INTENSITY_RANK: Record<IRPeakIntensity, number> = {
  veryWeak: 0,
  weak: 1,
  medium: 2,
  variable: 2,
  strong: 3,
  veryStrong: 4,
};

const INTENSITY_STEPS: IRPeakIntensity[] = ["veryWeak", "weak", "medium", "strong", "veryStrong"];

function vibrationBonds(
  patterns: IRVibrationTarget["patterns"],
  options: Pick<IRVibrationTarget, "expandWithinRing" | "collectAllNearSite"> = {},
): IRVibrationTarget {
  return { type: "bonds", patterns, ...options };
}

const VIBRATION_TARGETS = {
  carbonyl: vibrationBonds([{ elements: ["C", "O"], bondOrders: [2] }]),
  carbonOxygenSingle: vibrationBonds([{ elements: ["C", "O"], bondOrders: [1] }], { collectAllNearSite: true }),
  carbonNitrogenSingle: vibrationBonds([{ elements: ["C", "N"], bondOrders: [1] }], { collectAllNearSite: true }),
  carbonSulfurSingle: vibrationBonds([{ elements: ["C", "S"], bondOrders: [1] }], { collectAllNearSite: true }),
  alkene: vibrationBonds([{ elements: ["C", "C"], bondOrders: [2] }]),
  aromaticPi: vibrationBonds(
    [{ elements: ["C", "C"], bondOrders: [2, 1.5], ringOnly: true }],
    { expandWithinRing: true, collectAllNearSite: true },
  ),
  alkyne: vibrationBonds([{ elements: ["C", "C"], bondOrders: [3] }]),
  nitrile: vibrationBonds([{ elements: ["C", "N"], bondOrders: [3] }]),
  imine: vibrationBonds([{ elements: ["C", "N"], bondOrders: [2] }]),
  azo: vibrationBonds([{ elements: ["N", "N"], bondOrders: [1.5, 2] }], { collectAllNearSite: true }),
  diazo: vibrationBonds(
    [
      { elements: ["C", "N"], bondOrders: [1, 1.5, 2] },
      { elements: ["N", "N"], bondOrders: [1, 1.5, 2] },
    ],
    { collectAllNearSite: true },
  ),
  nitro: vibrationBonds([{ elements: ["N", "O"], bondOrders: [1, 1.5, 2] }], { collectAllNearSite: true }),
  sulfurOxygen: vibrationBonds([{ elements: ["S", "O"], bondOrders: [1, 1.5, 2] }], { collectAllNearSite: true }),
  phosphorusOxygen: vibrationBonds([{ elements: ["P", "O"], bondOrders: [1, 1.5, 2] }], { collectAllNearSite: true }),
  phosphorusOxygenSingle: vibrationBonds([{ elements: ["P", "O"], bondOrders: [1] }], { collectAllNearSite: true }),
  nitrogenOxygen: vibrationBonds([{ elements: ["N", "O"], bondOrders: [1, 1.5, 2] }], { collectAllNearSite: true }),
  isocyanate: vibrationBonds([
    { elements: ["N", "C"], bondOrders: [2] },
    { elements: ["C", "O"], bondOrders: [2] },
  ], { collectAllNearSite: true }),
  isothiocyanate: vibrationBonds([
    { elements: ["N", "C"], bondOrders: [2] },
    { elements: ["C", "S"], bondOrders: [2] },
  ], { collectAllNearSite: true }),
  carbodiimide: vibrationBonds([{ elements: ["N", "C"], bondOrders: [2] }], { collectAllNearSite: true }),
  ketene: vibrationBonds([
    { elements: ["C", "C"], bondOrders: [2] },
    { elements: ["C", "O"], bondOrders: [2] },
  ], { collectAllNearSite: true }),
  allene: vibrationBonds([{ elements: ["C", "C"], bondOrders: [2] }], { collectAllNearSite: true }),
  carbonFluorine: vibrationBonds([{ elements: ["C", "F"], bondOrders: [1] }]),
  carbonChlorine: vibrationBonds([{ elements: ["C", "Cl"], bondOrders: [1] }]),
  carbonBromine: vibrationBonds([{ elements: ["C", "Br"], bondOrders: [1] }]),
  carbonIodine: vibrationBonds([{ elements: ["C", "I"], bondOrders: [1] }]),
} as const satisfies Record<string, IRVibrationTarget>;

type BandMetadata = { family: IRBandFamily; mode: IRVibrationMode };

/**
 * Assign machine-readable chemistry at rule creation time. The renderer never
 * guesses chemistry from human-facing labels. Stable rule ids/targets are used
 * here only as a compatibility bridge for the existing rule catalog. New rules
 * should pass `family` and `mode` explicitly.
 */
function inferBandMetadata(
  sourceGroup: string,
  id: string,
  options: PeakOptions,
): BandMetadata {
  if (options.family && options.mode) return { family: options.family, mode: options.mode };

  const key = id.toLowerCase();
  const group = sourceGroup.toLowerCase();
  const target = options.vibrationTarget;

  if (options.overlapRole === "alkyl-ch") {
    if (key.includes("ch2-asym")) return { family: "alkyl-ch", mode: "ch2-asymmetric" };
    if (key.includes("ch2-sym")) return { family: "alkyl-ch", mode: "ch2-symmetric" };
    if (key.includes("ch3-asym")) return { family: "alkyl-ch", mode: "ch3-asymmetric" };
    if (key.includes("ch3-sym")) return { family: "alkyl-ch", mode: "ch3-symmetric" };
    return { family: "alkyl-ch", mode: "generic" };
  }
  if (options.overlapRole === "alkyl-bend") return { family: "fingerprint", mode: "alkyl-bend" };

  if (target === VIBRATION_TARGETS.carbonyl) {
    if (key.includes("aldehyde") || group.includes("aldehyde") || group.includes("enal")) return { family: "carbonyl", mode: "aldehyde-carbonyl" };
    if (key.includes("ketone") || group.includes("ketone") || group.includes("enone")) return { family: "carbonyl", mode: "ketone-carbonyl" };
    if (key.includes("ester") || group.includes("ester") || group.includes("enoate")) return { family: "carbonyl", mode: "ester-carbonyl" };
    if (key.includes("acid") || group.includes("carboxylic acid") || group.includes("enoic acid")) return { family: "carbonyl", mode: "acid-carbonyl" };
    if (key.includes("lactone")) return { family: "carbonyl", mode: "lactone-carbonyl" };
    if (key.includes("anhydride") || group.includes("anhydride")) {
      return { family: "carbonyl", mode: key.includes("high") ? "anhydride-carbonyl-high" : "anhydride-carbonyl-low" };
    }
    if (key.includes("carbamate") || group.includes("carbamate")) return { family: "carbonyl", mode: "carbamate-carbonyl" };
    if (key.includes("acyl-halide") || group.includes("acyl halide")) return { family: "carbonyl", mode: "acyl-halide-carbonyl" };
    if (key.includes("amide") || group.includes("amide") || group.includes("lactam")) return { family: "carbonyl", mode: "amide-carbonyl" };
    return { family: "carbonyl", mode: "generic-carbonyl" };
  }

  if (key.includes("aldehyde-ch-low")) return { family: "aldehyde-ch", mode: "aldehyde-fermi-low" };
  if (key.includes("aldehyde-ch-high")) return { family: "aldehyde-ch", mode: "aldehyde-fermi-high" };
  if (key.includes("aromatic-ch-stretch")) return { family: "aromatic-ch", mode: "aromatic-ch" };
  if (key.includes("vinylic-ch-stretch")) return { family: "vinylic-ch", mode: "vinylic-ch" };
  if (key.includes("terminal-alkyne-ch")) return { family: "xh", mode: "terminal-alkyne-ch" };

  if (options.suppressionClass === "oh-site") {
    if (options.overlapRole === "acidic-oh-envelope" || group.includes("carboxylic acid")) return { family: "xh", mode: "acid-oh" };
    if (group.includes("phenol")) return { family: "xh", mode: "phenol-oh" };
    return { family: "xh", mode: "alcohol-oh" };
  }
  if (options.suppressionClass === "nh-site") {
    if (group.includes("primary amide")) return { family: "xh", mode: key.includes("sym") && !key.includes("asym") ? "primary-amide-nh-symmetric" : "primary-amide-nh-asymmetric" };
    if (group.includes("secondary amide")) return { family: "xh", mode: "secondary-amide-nh" };
    return { family: "xh", mode: "amine-nh" };
  }
  if (key.includes("thiol") && key.includes("sh")) return { family: "xh", mode: "thiol-sh" };

  if (target === VIBRATION_TARGETS.nitrile) return { family: "nitrile", mode: "nitrile-stretch" };
  if (target === VIBRATION_TARGETS.alkyne) return { family: "alkyne", mode: "alkyne-stretch" };
  if (target === VIBRATION_TARGETS.alkene) return { family: "alkene", mode: "alkene-stretch" };
  if (target === VIBRATION_TARGETS.aromaticPi) {
    if (key.includes("1600")) return { family: "aromatic-ring", mode: "aromatic-ring-1600" };
    if (key.includes("1580")) return { family: "aromatic-ring", mode: "aromatic-ring-1580" };
    if (key.includes("1500")) return { family: "aromatic-ring", mode: "aromatic-ring-1500" };
    return { family: "aromatic-ring", mode: "generic" };
  }
  if (key.includes("amide-ii")) return { family: "amide-ii", mode: "amide-ii" };

  if (target === VIBRATION_TARGETS.carbonOxygenSingle) {
    if (key.includes("ester") && (key.endsWith("-1") || key.includes("low"))) return { family: "fingerprint", mode: "ester-co-low" };
    if (key.includes("ester")) return { family: "fingerprint", mode: "ester-co-high" };
    if (group.includes("phenol")) return { family: "fingerprint", mode: "phenol-co" };
    if (group.includes("alcohol")) return { family: "fingerprint", mode: "alcohol-co" };
    return { family: "fingerprint", mode: "generic-fingerprint" };
  }
  if (target === VIBRATION_TARGETS.carbonNitrogenSingle) return { family: "fingerprint", mode: "amine-cn" };
  if (key.includes("aryl-oop")) return { family: "fingerprint", mode: "aromatic-oop" };
  if (options.kind === "fingerprint") return { family: "fingerprint", mode: "generic-fingerprint" };
  return { family: "other", mode: "generic" };
}

function formatRange(range: Range) {
  return range[0] === range[1]
    ? `${Math.round(range[0])} cm⁻¹`
    : `${Math.round(range[0])}–${Math.round(range[1])} cm⁻¹`;
}

function irPeak(
  sourceGroup: string,
  id: string,
  label: string,
  range: Range,
  options: PeakOptions = {},
): IRPeak {
  const shape = options.shape ?? "moderate";
  const metadata = inferBandMetadata(sourceGroup, id, options);
  return {
    id,
    sourceGroup,
    label,
    range: formatRange(range),
    center: options.center ?? (range[0] + range[1]) / 2,
    intensity: options.intensity ?? "medium",
    shape,
    widthCm1: options.widthCm1 ?? WIDTH_BY_SHAPE[shape],
    kind: options.kind ?? "diagnostic",
    explanation: options.explanation ?? `${label} predicted from the detected ${sourceGroup.toLowerCase()} functionality.`,
    family: options.family ?? metadata.family,
    mode: options.mode ?? metadata.mode,
    modifiers: options.modifiers,
    vibrationTarget: options.vibrationTarget,
    suppressionClass: options.suppressionClass,
    suppressionPriority: options.suppressionPriority,
    overlapRole: options.overlapRole,
    atomIndices: options.atomIndices,
    bondIndices: options.bondIndices,
  };
}

function alcoholPeaks(group: string, cOCenter = 1100): IRPeak[] {
  return [
    irPeak(group, `${group}-oh`, "O–H stretch", [3200, 3550], {
      center: 3375,
      intensity: "strong",
      shape: "broad",
      widthCm1: 130,
      explanation: "Ordinary condensed-phase alcohols are modeled as hydrogen-bonded: the O–H stretch shifts lower and broadens rather than appearing as a narrow free-O–H line.",
      modifiers: ["hydrogen bonding"],
      suppressionClass: "oh-site",
      suppressionPriority: 10,
    }),
    irPeak(group, `${group}-co`, "C–O stretch", [1000, 1260], {
      center: cOCenter,
      intensity: "strong",
      shape: "moderate",
      explanation: "Alcohol C–O stretching absorption in the fingerprint region.",
      vibrationTarget: VIBRATION_TARGETS.carbonOxygenSingle,
      suppressionClass: "co-site",
      suppressionPriority: 10,
    }),
  ];
}

function phenolPeaks(group: string): IRPeak[] {
  return [
    irPeak(group, `${group}-oh`, "O–H stretch", [3200, 3600], {
      center: 3400,
      intensity: "strong",
      shape: "broad",
      widthCm1: 135,
      explanation: "Phenolic O–H is usually medium-to-strong and broad because hydrogen bonding spreads the absorption over a wide range.",
      modifiers: ["hydrogen bonding"],
      suppressionClass: "oh-site",
      suppressionPriority: 20,
    }),
    irPeak(group, `${group}-co`, "Ar–O stretch", [1180, 1275], {
      center: 1225,
      intensity: "strong",
      shape: "moderate",
      explanation: "Aryl C–O stretching absorption.",
      vibrationTarget: VIBRATION_TARGETS.carbonOxygenSingle,
      suppressionClass: "co-site",
      suppressionPriority: 20,
    }),
  ];
}

function acidPeaks(group: string): IRPeak[] {
  return [
    irPeak(group, `${group}-acid-oh`, "Carboxylic-acid O–H envelope", [2500, 3300], {
      center: 2920,
      intensity: "strong",
      shape: "extremelyBroad",
      widthCm1: 330,
      explanation: "Carboxylic-acid O–H is modeled as an extremely broad 2500–3300 cm⁻¹ envelope that overlaps the C–H region and is qualitatively broader than an alcohol O–H band.",
      modifiers: ["strong hydrogen bonding"],
      suppressionClass: "oh-site",
      suppressionPriority: 30,
      overlapRole: "acidic-oh-envelope",
    }),
    irPeak(group, `${group}-acid-co`, "Carboxylic-acid C=O stretch", [1700, 1725], {
      center: 1710,
      intensity: "veryStrong",
      shape: "narrow",
      explanation: "Strong, sharp carboxylic-acid carbonyl stretch.",
      vibrationTarget: VIBRATION_TARGETS.carbonyl,
    }),
  ];
}

function ketonePeaks(group: string): IRPeak[] {
  return [
    irPeak(group, `${group}-ketone-co`, "Ketone C=O stretch", [1705, 1725], {
      center: 1715,
      intensity: "veryStrong",
      shape: "narrow",
      explanation: "Simple saturated ketones absorb strongly and sharply near 1715 cm⁻¹ before conjugation or ring-strain modifiers are applied.",
      vibrationTarget: VIBRATION_TARGETS.carbonyl,
    }),
  ];
}

function aldehydePeaks(group: string): IRPeak[] {
  return [
    irPeak(group, `${group}-aldehyde-co`, "Aldehyde C=O stretch", [1720, 1740], {
      center: 1730,
      intensity: "veryStrong",
      shape: "narrow",
      explanation: "Saturated aldehydes typically show a strong carbonyl absorption near 1730 cm⁻¹ before conjugation modifiers.",
      vibrationTarget: VIBRATION_TARGETS.carbonyl,
    }),
    irPeak(group, `${group}-aldehyde-ch-low`, "Aldehyde C–H Fermi band", [2705, 2735], {
      center: 2720,
      intensity: "weak",
      shape: "narrow",
      widthCm1: 8,
      explanation: "Lower member of the characteristic aldehydic C–H Fermi doublet.",
    }),
    irPeak(group, `${group}-aldehyde-ch-high`, "Aldehyde C–H Fermi band", [2805, 2835], {
      center: 2820,
      intensity: "weak",
      shape: "narrow",
      widthCm1: 8,
      explanation: "Upper member of the characteristic aldehydic C–H Fermi doublet.",
    }),
  ];
}

function esterPeaks(group: string): IRPeak[] {
  return [
    irPeak(group, `${group}-ester-co`, "Ester C=O stretch", [1735, 1750], {
      center: 1740,
      intensity: "veryStrong",
      shape: "narrow",
      widthCm1: 18,
      explanation: "Saturated ester carbonyl absorption before conjugation or ring-strain modifiers.",
      vibrationTarget: VIBRATION_TARGETS.carbonyl,
    }),
    irPeak(group, `${group}-ester-co-1`, "Ester C–O stretch", [1050, 1180], {
      center: 1120,
      intensity: "strong",
      shape: "narrow",
      widthCm1: 13,
      explanation: "One of the strong ester C–O stretching modes in the fingerprint region.",
      vibrationTarget: VIBRATION_TARGETS.carbonOxygenSingle,
      suppressionClass: "co-site",
      suppressionPriority: 30,
    }),
    irPeak(group, `${group}-ester-co-2`, "Ester C–O stretch", [1180, 1300], {
      center: 1240,
      intensity: "strong",
      shape: "narrow",
      widthCm1: 13,
      explanation: "A second strong ester C–O stretching mode; esters commonly give multiple C–O bands.",
      vibrationTarget: VIBRATION_TARGETS.carbonOxygenSingle,
      suppressionClass: "co-site",
      suppressionPriority: 30,
    }),
  ];
}

function amideCarbonyl(group: string, range: Range = [1630, 1690], center = 1660): IRPeak {
  return irPeak(group, `${group}-amide-i`, "Amide I / C=O stretch", range, {
    center,
    intensity: "veryStrong",
    shape: "narrow",
    explanation: "Amide resonance donation lowers effective C=O bond order, so amide carbonyls absorb below ordinary ketone/ester carbonyls.",
    modifiers: ["resonance donation"],
    vibrationTarget: VIBRATION_TARGETS.carbonyl,
  });
}

function amideIIPeak(group: string): IRPeak {
  return irPeak(group, `${group}-amide-ii`, "Amide II band", [1510, 1580], {
    center: 1545,
    intensity: "medium",
    shape: "narrow",
    widthCm1: 10,
    kind: "supporting",
    explanation: "Amide II is primarily N–H bending coupled with C–N stretching and is normally a distinct band around 1510–1580 cm⁻¹ rather than one broad unresolved basin.",
  });
}

function primaryAmidePeaks(group: string, carbonyl = amideCarbonyl(group)): IRPeak[] {
  return [
    carbonyl,
    irPeak(group, `${group}-nh-asym`, "N–H stretch", [3300, 3500], {
      center: 3350,
      intensity: "medium",
      shape: "narrow",
      widthCm1: 28,
      explanation: "Primary amides normally show two N–H stretching components from symmetric/asymmetric NH₂ motion.",
      suppressionClass: "nh-site",
      suppressionPriority: 30,
    }),
    irPeak(group, `${group}-nh-sym`, "N–H stretch", [3180, 3400], {
      center: 3180,
      intensity: "medium",
      shape: "narrow",
      widthCm1: 30,
      explanation: "Lower-frequency component of the primary-amide NH₂ stretching pair.",
      suppressionClass: "nh-site",
      suppressionPriority: 30,
    }),
    amideIIPeak(group),
  ];
}

function secondaryAmidePeaks(group: string, carbonyl = amideCarbonyl(group)): IRPeak[] {
  return [
    carbonyl,
    irPeak(group, `${group}-nh`, "N–H stretch", [3200, 3400], {
      center: 3300,
      intensity: "medium",
      shape: "broad",
      widthCm1: 42,
      explanation: "Secondary amides normally show one N–H stretching family near 3300 cm⁻¹, broadened and skewed by hydrogen bonding but much narrower than an alcohol O–H envelope.",
      suppressionClass: "nh-site",
      suppressionPriority: 30,
    }),
    amideIIPeak(group),
  ];
}

function tertiaryAmidePeaks(group: string, carbonyl = amideCarbonyl(group)): IRPeak[] {
  // Classical amide II requires an N–H bend, so a tertiary amide (no N–H)
  // should not receive the primary/secondary-amide II assignment.
  return [carbonyl];
}

function aminePeaks(group: string, substitution: "primary" | "secondary" | "tertiary" | "unknown"): IRPeak[] {
  const peaks: IRPeak[] = [
    irPeak(group, `${group}-cn`, "C–N stretch", [1020, 1350], {
      center: 1200,
      intensity: "medium",
      shape: "moderate",
      explanation: "Amine C–N stretching absorption in the fingerprint region.",
      vibrationTarget: VIBRATION_TARGETS.carbonNitrogenSingle,
    }),
  ];

  if (substitution === "primary" || substitution === "unknown") {
    peaks.unshift(
      irPeak(group, `${group}-nh-asym`, "N–H stretch", [3300, 3500], {
        center: 3430,
        intensity: "medium",
        shape: "narrow",
        widthCm1: 20,
        explanation: substitution === "primary"
          ? "Primary amines normally show two N–H stretching bands."
          : "An amine N–H band is possible; substitution level determines whether one, two, or no N–H stretches appear.",
        suppressionClass: "nh-site",
        suppressionPriority: 10,
      }),
    );
  }
  if (substitution === "primary") {
    peaks.unshift(
      irPeak(group, `${group}-nh-sym`, "N–H stretch", [3300, 3500], {
        center: 3350,
        intensity: "medium",
        shape: "narrow",
        widthCm1: 20,
        explanation: "Second N–H stretching band of a primary amine.",
        suppressionClass: "nh-site",
        suppressionPriority: 10,
      }),
    );
  }
  if (substitution === "primary") {
    peaks.push(
      irPeak(group, `${group}-nh2-scissor`, "NH₂ scissoring bend", [1580, 1650], {
        center: 1615,
        intensity: "medium",
        shape: "narrow",
        widthCm1: 20,
        explanation: "Primary amines show an NH₂ scissoring deformation in the ~1580–1650 cm⁻¹ region; in aryl amines it can overlap the aromatic ~1600 cm⁻¹ ring band.",
      }),
    );
  }

  if (substitution === "secondary") {
    peaks.unshift(
      irPeak(group, `${group}-nh`, "N–H stretch", [3300, 3500], {
        center: 3350,
        intensity: "medium",
        shape: "narrow",
        widthCm1: 22,
        explanation: "Secondary amines normally show one N–H stretching band.",
        suppressionClass: "nh-site",
        suppressionPriority: 10,
      }),
    );
  }

  return peaks;
}

function alkenePeaks(group: string): IRPeak[] {
  return [
    irPeak(group, `${group}-cc`, "C=C stretch", [1620, 1680], {
      center: 1645,
      intensity: "medium",
      shape: "moderate",
      explanation: "Alkene C=C stretching absorption; conjugation can shift it somewhat lower and highly symmetric alkenes can be weak.",
      vibrationTarget: VIBRATION_TARGETS.alkene,
    }),
  ];
}

function arylAminePeaks(
  group: string,
  substitution: "primary" | "secondary" | "tertiary" | "unknown",
): IRPeak[] {
  return aminePeaks(group, substitution).map((peak) => {
    if (peak.vibrationTarget !== VIBRATION_TARGETS.carbonNitrogenSingle) return peak;
    return {
      ...peak,
      range: "1250–1360 cm⁻¹",
      center: 1300,
      intensity: "strong" as const,
      shape: "narrow" as const,
      widthCm1: 24,
      explanation: "Aryl amines show a relatively prominent C–N stretch at higher frequency than ordinary alkyl amines because the C–N bond has partial π-bond character from conjugation with the aromatic ring.",
      modifiers: Array.from(new Set([...(peak.modifiers ?? []), "aryl conjugation"])),
    };
  });
}

function aromaticPeaks(group: string): IRPeak[] {
  return [
    irPeak(group, `${group}-ring-1600`, "Aromatic ring C=C stretch", [1585, 1610], {
      center: 1600,
      intensity: "medium",
      shape: "narrow",
      widthCm1: 9,
      explanation: "One of the characteristic aromatic ring stretching bands.",
      vibrationTarget: VIBRATION_TARGETS.aromaticPi,
    }),
    irPeak(group, `${group}-ring-1580`, "Aromatic ring C=C stretch", [1565, 1590], {
      center: 1580,
      intensity: "weak",
      shape: "narrow",
      widthCm1: 8,
      explanation: "Aromatic ring stretching band; not every ring mode is equally intense.",
      vibrationTarget: VIBRATION_TARGETS.aromaticPi,
    }),
    irPeak(group, `${group}-ring-1500`, "Aromatic ring C=C stretch", [1485, 1515], {
      center: 1500,
      intensity: "medium",
      shape: "narrow",
      widthCm1: 9,
      explanation: "Characteristic aromatic ring stretching band near 1500 cm⁻¹.",
      vibrationTarget: VIBRATION_TARGETS.aromaticPi,
    }),
    irPeak(group, `${group}-ring-1450`, "Aromatic ring vibration", [1435, 1465], {
      center: 1450,
      intensity: "medium",
      shape: "narrow",
      widthCm1: 9,
      kind: "supporting",
      explanation: "Lower-frequency aromatic ring vibration near 1450 cm⁻¹.",
      vibrationTarget: VIBRATION_TARGETS.aromaticPi,
    }),
  ];
}

function lactonePeaks(group: string, ringSize?: number): IRPeak[] {
  let range: Range = [1735, 1750];
  let center = 1740;
  let modifier = "ester-like lactone carbonyl";
  if (ringSize === 5) {
    range = [1760, 1780];
    center = 1770;
    modifier = "5-membered ring strain";
  } else if (ringSize === 4) {
    range = [1810, 1840];
    center = 1825;
    modifier = "4-membered ring strain";
  } else if (ringSize === 6) {
    range = [1735, 1750];
    center = 1742;
    modifier = "6-membered lactone";
  }
  const ester = esterPeaks(group).filter((item) => item.vibrationTarget !== VIBRATION_TARGETS.carbonyl);
  return [
    irPeak(group, `${group}-lactone-co`, "Lactone C=O stretch", range, {
      center,
      intensity: "veryStrong",
      shape: "narrow",
      explanation: "Lactone carbonyl frequency rises as ring strain increases; smaller lactone rings absorb at higher wavenumber.",
      modifiers: [modifier],
      vibrationTarget: VIBRATION_TARGETS.carbonyl,
    }),
    ...ester,
  ];
}

function lactamPeaks(group: string, ringSize?: number): IRPeak[] {
  let range: Range = [1630, 1690];
  let center = 1670;
  if (ringSize === 5) {
    range = [1690, 1720];
    center = 1705;
  } else if (ringSize === 4) {
    range = [1730, 1775];
    center = 1750;
  } else if (ringSize === 6) {
    range = [1650, 1690];
    center = 1670;
  }
  return [
    amideCarbonyl(group, range, center),
    amideIIPeak(group),
  ].map((item) => ({
    ...item,
    modifiers: item.vibrationTarget === VIBRATION_TARGETS.carbonyl ? [...(item.modifiers ?? []), "ring strain"] : item.modifiers,
    explanation: item.vibrationTarget === VIBRATION_TARGETS.carbonyl
      ? `${item.explanation} Smaller lactam rings raise the C=O frequency because ring geometry reduces normal amide resonance.`
      : item.explanation,
  }));
}

function anhydridePeaks(group: string): IRPeak[] {
  return [
    irPeak(group, `${group}-co-low`, "Anhydride C=O stretch", [1750, 1775], {
      center: 1760,
      intensity: "veryStrong",
      shape: "narrow",
      explanation: "Acid anhydrides must retain two strong carbonyl absorptions; this is the lower-frequency coupled C=O mode.",
      modifiers: ["coupled carbonyl vibration"],
      vibrationTarget: VIBRATION_TARGETS.carbonyl,
    }),
    irPeak(group, `${group}-co-high`, "Anhydride C=O stretch", [1800, 1830], {
      center: 1820,
      intensity: "veryStrong",
      shape: "narrow",
      explanation: "Higher-frequency coupled carbonyl mode of an acid anhydride.",
      modifiers: ["coupled carbonyl vibration"],
      vibrationTarget: VIBRATION_TARGETS.carbonyl,
    }),
    irPeak(group, `${group}-co-single`, "Anhydride C–O stretch", [1000, 1300], {
      center: 1125,
      intensity: "strong",
      shape: "moderate",
      explanation: "Strong anhydride C–O absorption in the fingerprint region.",
      vibrationTarget: VIBRATION_TARGETS.carbonOxygenSingle,
      suppressionClass: "co-site",
      suppressionPriority: 30,
    }),
  ];
}

const CONJUGATED_CARBONYL_GROUPS = new Map<string, 1 | 2>([
  ["Enone", 1],
  ["Enal", 1],
  ["Enoic acid", 1],
  ["Enoate", 1],
  ["Acrylic acid", 1],
  ["Crotonic acid", 1],
  ["Acrolein", 1],
  ["Crotonaldehyde", 1],
  ["Benzaldehyde", 1],
  ["Chalcone", 2],
  ["Cinnamic acid", 2],
  ["Cinnamaldehyde", 2],
]);

function shiftRangeText(range: string, delta: number) {
  const numbers = range.match(/\d{3,4}/g)?.map(Number) ?? [];
  if (numbers.length < 1) return range;
  if (numbers.length === 1) return `${Math.round(numbers[0] + delta)} cm⁻¹`;
  return `${Math.round(numbers[0] + delta)}–${Math.round(numbers[1] + delta)} cm⁻¹`;
}

function applyConjugation(peaks: IRPeak[]) {
  return peaks.map((item) => {
    if (item.vibrationTarget !== VIBRATION_TARGETS.carbonyl) return item;
    const level = CONJUGATED_CARBONYL_GROUPS.get(item.sourceGroup) ?? 0;
    if (level === 0) return item;
    const delta = level === 2 ? -35 : -25;
    return {
      ...item,
      center: item.center === undefined ? undefined : item.center + delta,
      range: shiftRangeText(item.range, delta),
      modifiers: [...(item.modifiers ?? []), level === 2 ? "extended conjugation" : "conjugation"],
      explanation: `${item.explanation} Conjugation lowers the simulated carbonyl frequency by about ${Math.abs(delta)} cm⁻¹; the modifier saturates rather than subtracting indefinitely for every additional π bond.`,
    };
  });
}

function bondOrderSum(graph: ParsedMol, atomIndex: number) {
  return (graph.adjacency.get(atomIndex) ?? []).reduce((sum, bond) => sum + bond.bondOrder, 0);
}

function inferredHydrogens(graph: ParsedMol, atomIndex: number) {
  const atom = graph.atoms[atomIndex];
  if (!atom) return 0;
  const typicalValence: Record<string, number> = { C: 4, N: atom.charge > 0 ? 4 : 3, O: 2, S: 2 };
  const valence = typicalValence[atom.element];
  if (!valence) return 0;
  return Math.max(0, Math.round(valence - bondOrderSum(graph, atomIndex) - Math.max(0, atom.charge)));
}

function isAromaticAtom(graph: ParsedMol, atomIndex: number) {
  return (graph.adjacency.get(atomIndex) ?? []).some((bond) => bond.bondOrder === 1.5);
}

function structuralCHPeaks(graph: ParsedMol): IRPeak[] {
  const ch3Atoms: number[] = [];
  const ch2Atoms: number[] = [];
  const aromaticCHAtoms: number[] = [];
  const vinylicCHAtoms: number[] = [];
  const terminalAlkyneAtoms: number[] = [];

  for (const atom of graph.atoms) {
    if (atom.element !== "C") continue;
    const hydrogens = inferredHydrogens(graph, atom.atomIndex);
    if (hydrogens <= 0) continue;
    const bonds = graph.adjacency.get(atom.atomIndex) ?? [];
    if (bonds.some((bond) => bond.bondOrder === 3)) {
      terminalAlkyneAtoms.push(atom.atomIndex);
    } else {
      const hasCarbonylLikeDoubleBond = bonds.some((bond) => {
        if (bond.bondOrder !== 2) return false;
        const neighbor = graph.atoms[getOtherAtom(bond, atom.atomIndex)];
        return neighbor?.element === "O" || neighbor?.element === "S";
      });
      const hasOrdinarySp2Bond = bonds.some((bond) => {
        if (bond.bondOrder !== 2) return false;
        const neighbor = graph.atoms[getOtherAtom(bond, atom.atomIndex)];
        return neighbor?.element === "C" || neighbor?.element === "N";
      });

      if (isAromaticAtom(graph, atom.atomIndex)) {
        aromaticCHAtoms.push(atom.atomIndex);
      } else if (hasOrdinarySp2Bond && !hasCarbonylLikeDoubleBond) {
        vinylicCHAtoms.push(atom.atomIndex);
      } else if (hydrogens >= 3) {
        ch3Atoms.push(atom.atomIndex);
      } else if (hydrogens === 2) {
        ch2Atoms.push(atom.atomIndex);
      }
    }
  }

  const peaks: IRPeak[] = [];
  if (ch3Atoms.length > 0) {
    peaks.push(
      irPeak("C–H framework", "ch3-asym", "CH₃ asymmetric C–H stretch", [2945, 2970], {
        center: 2960,
        intensity: "strong",
        shape: "moderate",
        widthCm1: 15,
        kind: "supporting",
        overlapRole: "alkyl-ch",
        atomIndices: ch3Atoms,
        explanation: "sp³ CH₃ asymmetric C–H stretch below 3000 cm⁻¹.",
      }),
      irPeak("C–H framework", "ch3-sym", "CH₃ symmetric C–H stretch", [2855, 2885], {
        center: 2870,
        intensity: "medium",
        shape: "moderate",
        widthCm1: 13,
        kind: "supporting",
        overlapRole: "alkyl-ch",
        atomIndices: ch3Atoms,
        explanation: "sp³ CH₃ symmetric C–H stretch.",
      }),
      irPeak("C–H framework", "ch3-bend-asym", "CH₃ asymmetric bend", [1435, 1460], {
        center: 1450,
        intensity: "medium",
        shape: "moderate",
        widthCm1: 11,
        kind: "supporting",
        overlapRole: "alkyl-bend",
        atomIndices: ch3Atoms,
        explanation: "Common alkyl CH₃ deformation in the fingerprint region.",
      }),
      irPeak("C–H framework", "ch3-bend-sym", "CH₃ symmetric bend", [1360, 1390], {
        center: 1375,
        intensity: "weak",
        shape: "moderate",
        widthCm1: 11,
        kind: "supporting",
        overlapRole: "alkyl-bend",
        atomIndices: ch3Atoms,
        explanation: "Common CH₃ symmetric bending mode near 1375 cm⁻¹.",
      }),
    );
  }
  if (ch2Atoms.length > 0) {
    peaks.push(
      irPeak("C–H framework", "ch2-asym", "CH₂ asymmetric C–H stretch", [2910, 2940], {
        center: 2927,
        intensity: "strong",
        shape: "moderate",
        widthCm1: 16,
        kind: "supporting",
        overlapRole: "alkyl-ch",
        atomIndices: ch2Atoms,
        explanation: "sp³ CH₂ asymmetric C–H stretch below 3000 cm⁻¹.",
      }),
      irPeak("C–H framework", "ch2-sym", "CH₂ symmetric C–H stretch", [2835, 2865], {
        center: 2854,
        intensity: "medium",
        shape: "moderate",
        widthCm1: 14,
        kind: "supporting",
        overlapRole: "alkyl-ch",
        atomIndices: ch2Atoms,
        explanation: "sp³ CH₂ symmetric C–H stretch.",
      }),
      irPeak("C–H framework", "ch2-scissor", "CH₂ scissoring", [1450, 1470], {
        center: 1460,
        intensity: "medium",
        shape: "moderate",
        widthCm1: 10,
        kind: "supporting",
        overlapRole: "alkyl-bend",
        atomIndices: ch2Atoms,
        explanation: "CH₂ scissoring deformation in the fingerprint region.",
      }),
    );
    if (ch2Atoms.length >= 4) {
      peaks.push(
        irPeak("C–H framework", "ch2-rock", "Long-chain CH₂ rocking", [710, 730], {
          center: 720,
          intensity: "medium",
          shape: "narrow",
          kind: "supporting",
          atomIndices: ch2Atoms,
          explanation: "A longer run of methylene groups can give a CH₂ rocking band near 720 cm⁻¹.",
        }),
      );
    }
  }
  if (aromaticCHAtoms.length > 0) {
    peaks.push(
      irPeak("Aromatic C–H", "aromatic-ch-stretch", "Aromatic sp² C–H stretch", [3000, 3100], {
        center: 3030,
        intensity: "veryWeak",
        shape: "narrow",
        widthCm1: 10,
        kind: "supporting",
        atomIndices: aromaticCHAtoms,
        explanation: "Aromatic sp² C–H stretching appears just above 3000 cm⁻¹, typically near 3030 cm⁻¹, and is usually much weaker than a strongly hydrogen-bonded N–H or O–H band.",
      }),
    );
  }
  if (vinylicCHAtoms.length > 0) {
    peaks.push(
      irPeak("Vinylic C–H", "vinylic-ch-stretch", "Vinylic sp² C–H stretch", [3000, 3100], {
        center: 3070,
        intensity: "weak",
        shape: "narrow",
        widthCm1: 11,
        kind: "supporting",
        atomIndices: vinylicCHAtoms,
        explanation: "Vinylic sp² C–H stretching also appears above 3000 cm⁻¹, but is kept separate from the typically weaker aromatic C–H band.",
      }),
    );
  }
  if (terminalAlkyneAtoms.length > 0) {
    peaks.push(
      irPeak("Terminal alkyne", "terminal-alkyne-ch-structural", "≡C–H stretch", [3260, 3330], {
        center: 3300,
        intensity: "strong",
        shape: "veryNarrow",
        atomIndices: terminalAlkyneAtoms,
        explanation: "Terminal alkynes give a sharp, narrow sp C–H absorption near 3300 cm⁻¹; internal alkynes do not.",
      }),
    );
  }
  return peaks;
}

function structuralHalidePeaks(graph: ParsedMol): IRPeak[] {
  const attachedHalogens = new Map<string, { atoms: number[]; bonds: number[] }>();
  for (const atom of graph.atoms) {
    if (!["F", "Cl", "Br", "I"].includes(atom.element)) continue;
    for (const bond of graph.adjacency.get(atom.atomIndex) ?? []) {
      const carbonIndex = getOtherAtom(bond, atom.atomIndex);
      if (graph.atoms[carbonIndex]?.element !== "C") continue;
      const current = attachedHalogens.get(atom.element) ?? { atoms: [], bonds: [] };
      current.atoms.push(atom.atomIndex, carbonIndex);
      current.bonds.push(bond.bondIndex);
      attachedHalogens.set(atom.element, current);
    }
  }

  const optionsFor = (element: string) => {
    const site = attachedHalogens.get(element);
    return site ? { atomIndices: uniqueIndices(site.atoms), bondIndices: uniqueIndices(site.bonds) } : {};
  };

  const peaks: IRPeak[] = [];
  if (attachedHalogens.has("F")) {
    peaks.push(irPeak("C–F bond", "cf-stretch", "C–F stretch", [1000, 1400], {
      center: 1200,
      intensity: "strong",
      shape: "moderate",
      kind: "supporting",
      ...optionsFor("F"),
      explanation: "C–F stretching occurs in the crowded fingerprint region.",
      vibrationTarget: VIBRATION_TARGETS.carbonFluorine,
    }));
  }
  if (attachedHalogens.has("Cl")) {
    peaks.push(irPeak("C–Cl bond", "ccl-stretch", "C–Cl stretch", [600, 800], {
      center: 700,
      intensity: "medium",
      shape: "moderate",
      kind: "supporting",
      ...optionsFor("Cl"),
      explanation: "C–Cl stretching is a lower-priority diagnostic feature in the fingerprint region.",
      vibrationTarget: VIBRATION_TARGETS.carbonChlorine,
    }));
  }
  if (attachedHalogens.has("Br")) {
    peaks.push(irPeak("C–Br bond", "cbr-stretch", "C–Br stretch", [500, 650], {
      center: 575,
      intensity: "medium",
      shape: "moderate",
      kind: "supporting",
      ...optionsFor("Br"),
      explanation: "C–Br stretching appears low in the fingerprint region.",
      vibrationTarget: VIBRATION_TARGETS.carbonBromine,
    }));
  }
  if (attachedHalogens.has("I")) {
    peaks.push(irPeak("C–I bond", "ci-stretch", "C–I stretch", [400, 600], {
      center: 500,
      intensity: "weak",
      shape: "moderate",
      kind: "supporting",
      ...optionsFor("I"),
      explanation: "The heavy iodine atom shifts the C–I vibration to low wavenumber.",
      vibrationTarget: VIBRATION_TARGETS.carbonIodine,
    }));
  }
  return peaks;
}


function structuralXHPeaks(graph: ParsedMol, existing: IRPeak[]): IRPeak[] {
  const peaks: IRPeak[] = [];
  const hasOHAssignment = existing.some((item) => item.suppressionClass === "oh-site");
  const hasNHAssignment = existing.some((item) => item.suppressionClass === "nh-site");

  if (!hasOHAssignment) {
    const oxygenAtoms = graph.atoms
      .filter((atom) => atom.element === "O" && inferredHydrogens(graph, atom.atomIndex) > 0)
      .map((atom) => atom.atomIndex);
    if (oxygenAtoms.length > 0) {
      peaks.push(irPeak("O–H bond", "structural-oh", "O–H stretch", [3200, 3550], {
        center: 3375,
        intensity: "strong",
        shape: "broad",
        widthCm1: 130,
        kind: "supporting",
        atomIndices: oxygenAtoms,
        explanation: "An O–H bond was detected structurally. The teaching simulator defaults ordinary condensed-phase O–H to a broad hydrogen-bonded band rather than a sharp free-O–H line.",
        modifiers: ["hydrogen bonding default"],
        suppressionClass: "oh-site",
        suppressionPriority: 5,
      }));
    }
  }

  if (!hasNHAssignment) {
    const nitrogenSites = graph.atoms
      .filter((atom) => atom.element === "N")
      .map((atom) => ({ atomIndex: atom.atomIndex, hydrogens: inferredHydrogens(graph, atom.atomIndex) }))
      .filter((site) => site.hydrogens > 0);
    const maximum = Math.max(0, ...nitrogenSites.map((site) => site.hydrogens));
    const highlightedNitrogens = nitrogenSites.map((site) => site.atomIndex);
    if (maximum >= 2) {
      peaks.push(
        irPeak("N–H bond", "structural-nh-asym", "N–H stretch", [3300, 3500], {
          center: 3430,
          intensity: "medium",
          shape: "moderate",
          kind: "supporting",
          atomIndices: highlightedNitrogens,
          explanation: "A nitrogen bearing two hydrogens can contribute two N–H stretching modes.",
          suppressionClass: "nh-site",
          suppressionPriority: 5,
        }),
        irPeak("N–H bond", "structural-nh-sym", "N–H stretch", [3300, 3500], {
          center: 3350,
          intensity: "medium",
          shape: "moderate",
          kind: "supporting",
          atomIndices: highlightedNitrogens,
          explanation: "Second N–H stretching mode for an N–H₂ environment.",
          suppressionClass: "nh-site",
          suppressionPriority: 5,
        }),
      );
    } else if (maximum === 1) {
      peaks.push(irPeak("N–H bond", "structural-nh", "N–H stretch", [3200, 3500], {
        center: 3330,
        intensity: "medium",
        shape: "moderate",
        kind: "supporting",
        atomIndices: highlightedNitrogens,
        explanation: "A single N–H bond contributes one relatively sharp/moderate N–H stretching band, narrower than a hydrogen-bonded O–H envelope.",
        suppressionClass: "nh-site",
        suppressionPriority: 5,
      }));
    }
  }

  return peaks;
}

function structuralCSpeaks(graph: ParsedMol, existing: IRPeak[]): IRPeak[] {
  if (existing.some((item) => item.vibrationTarget === VIBRATION_TARGETS.carbonSulfurSingle)) return [];
  const matches = graph.bonds.filter((bond) => {
    const a = graph.atoms[bond.atomA]?.element;
    const b = graph.atoms[bond.atomB]?.element;
    return bond.bondOrder === 1 && ((a === "C" && b === "S") || (a === "S" && b === "C"));
  });
  if (matches.length === 0) return [];
  return [irPeak("C–S bond", "structural-cs", "C–S stretch", [600, 750], {
    center: 675,
    intensity: "weak",
    shape: "moderate",
    kind: "supporting",
    atomIndices: uniqueIndices(matches.flatMap((bond) => [bond.atomA, bond.atomB])),
    bondIndices: uniqueIndices(matches.map((bond) => bond.bondIndex)),
    explanation: "C–S stretching is relatively weak and lies in the crowded fingerprint region.",
    vibrationTarget: VIBRATION_TARGETS.carbonSulfurSingle,
  })];
}

function aromaticComponents(graph: ParsedMol) {
  const aromaticAtoms = new Set(graph.atoms.filter((atom) => isAromaticAtom(graph, atom.atomIndex)).map((atom) => atom.atomIndex));
  const visited = new Set<number>();
  const components: number[][] = [];
  for (const start of aromaticAtoms) {
    if (visited.has(start)) continue;
    const component: number[] = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const current = stack.pop()!;
      component.push(current);
      for (const bond of graph.adjacency.get(current) ?? []) {
        if (bond.bondOrder !== 1.5) continue;
        const next = getOtherAtom(bond, current);
        if (!aromaticAtoms.has(next) || visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
    components.push(component);
  }
  return components;
}

function orderSimpleAromaticSixRing(graph: ParsedMol, component: number[]) {
  if (component.length !== 6) return null;
  const set = new Set(component);
  const aromaticNeighbors = (atomIndex: number) => (graph.adjacency.get(atomIndex) ?? [])
    .filter((bond) => bond.bondOrder === 1.5 && set.has(getOtherAtom(bond, atomIndex)))
    .map((bond) => getOtherAtom(bond, atomIndex));
  if (component.some((atomIndex) => aromaticNeighbors(atomIndex).length !== 2)) return null;

  const order = [component[0]];
  let previous = -1;
  let current = component[0];
  while (order.length < 6) {
    const next = aromaticNeighbors(current).find((candidate) => candidate !== previous && !order.includes(candidate));
    if (next === undefined) return null;
    previous = current;
    current = next;
    order.push(current);
  }
  return order;
}

function aromaticOutOfPlanePeaks(graph: ParsedMol): IRPeak[] {
  const peaks: IRPeak[] = [];
  for (const component of aromaticComponents(graph)) {
    const order = orderSimpleAromaticSixRing(graph, component);
    if (!order) continue;
    const substituted = order
      .map((atomIndex, position) => ({ atomIndex, position }))
      .filter(({ atomIndex }) => inferredHydrogens(graph, atomIndex) === 0);
    const oopAtoms = order.filter((atomIndex) => inferredHydrogens(graph, atomIndex) > 0);

    const oopOptions = { atomIndices: oopAtoms };
    if (substituted.length === 1) {
      peaks.push(
        irPeak("Aromatic substitution pattern", "aryl-oop-mono-low", "Aromatic C–H out-of-plane bend", [690, 710], { center: 700, intensity: "medium", shape: "narrow", kind: "supporting", ...oopOptions, explanation: "Monosubstituted benzene-like ring: one expected out-of-plane C–H bending region." }),
        irPeak("Aromatic substitution pattern", "aryl-oop-mono-high", "Aromatic C–H out-of-plane bend", [730, 770], { center: 750, intensity: "medium", shape: "narrow", kind: "supporting", ...oopOptions, explanation: "Monosubstituted benzene-like ring: second expected out-of-plane C–H bending region." }),
      );
    } else if (substituted.length === 2) {
      const rawDistance = Math.abs(substituted[0].position - substituted[1].position);
      const distance = Math.min(rawDistance, 6 - rawDistance);
      if (distance === 1) {
        peaks.push(irPeak("Aromatic substitution pattern", "aryl-oop-ortho", "Aromatic C–H out-of-plane bend", [735, 770], { center: 752, intensity: "medium", shape: "narrow", kind: "supporting", ...oopOptions, explanation: "Approximate ortho-disubstituted aromatic C–H out-of-plane bending region." }));
      } else if (distance === 2) {
        peaks.push(
          irPeak("Aromatic substitution pattern", "aryl-oop-meta-1", "Aromatic C–H out-of-plane bend", [680, 725], { center: 705, intensity: "medium", shape: "narrow", kind: "supporting", ...oopOptions, explanation: "One of the approximate meta-disubstituted aromatic out-of-plane C–H bending bands." }),
          irPeak("Aromatic substitution pattern", "aryl-oop-meta-2", "Aromatic C–H out-of-plane bend", [750, 810], { center: 780, intensity: "medium", shape: "narrow", kind: "supporting", ...oopOptions, explanation: "Second approximate meta-disubstituted aromatic out-of-plane C–H bending band." }),
          irPeak("Aromatic substitution pattern", "aryl-oop-meta-3", "Aromatic C–H out-of-plane bend", [860, 900], { center: 880, intensity: "weak", shape: "narrow", kind: "supporting", ...oopOptions, explanation: "Higher-frequency approximate meta-disubstituted aromatic out-of-plane C–H bending band." }),
        );
      } else if (distance === 3) {
        peaks.push(irPeak("Aromatic substitution pattern", "aryl-oop-para", "Aromatic C–H out-of-plane bend", [800, 860], { center: 830, intensity: "medium", shape: "narrow", kind: "supporting", ...oopOptions, explanation: "Approximate para-disubstituted aromatic C–H out-of-plane bending region." }));
      }
    }
  }
  return peaks;
}

function branchSignature(graph: ParsedMol, root: number, blocked: number, depth = 2): string {
  if (depth <= 0) return graph.atoms[root]?.element ?? "?";
  const neighbors = (graph.adjacency.get(root) ?? [])
    .filter((bond) => getOtherAtom(bond, root) !== blocked)
    .map((bond) => {
      const neighbor = getOtherAtom(bond, root);
      return `${bond.bondOrder}:${branchSignature(graph, neighbor, root, depth - 1)}`;
    })
    .sort()
    .join("|");
  return `${graph.atoms[root]?.element ?? "?"}[${neighbors}]`;
}

function tripleBondSymmetry(graph: ParsedMol) {
  for (const bond of graph.bonds) {
    if (bond.bondOrder !== 3) continue;
    const hA = inferredHydrogens(graph, bond.atomA);
    const hB = inferredHydrogens(graph, bond.atomB);
    if (hA > 0 || hB > 0) continue;
    const sigA = branchSignature(graph, bond.atomA, bond.atomB, 3);
    const sigB = branchSignature(graph, bond.atomB, bond.atomA, 3);
    if (sigA === sigB) return true;
  }
  return false;
}


function doubleBondSymmetry(graph: ParsedMol, elementA = "C", elementB = "C") {
  for (const bond of graph.bonds) {
    if (bond.bondOrder !== 2) continue;
    const a = graph.atoms[bond.atomA]?.element;
    const b = graph.atoms[bond.atomB]?.element;
    if (!((a === elementA && b === elementB) || (a === elementB && b === elementA))) continue;
    const sigA = branchSignature(graph, bond.atomA, bond.atomB, 3);
    const sigB = branchSignature(graph, bond.atomB, bond.atomA, 3);
    if (sigA === sigB) return true;
  }
  return false;
}

function applySymmetrySuppression(peaks: IRPeak[], graph: ParsedMol, names: Set<string>) {
  const symmetricAlkene = (names.has("Alkene") || names.has("Cycloalkene")) && doubleBondSymmetry(graph, "C", "C");
  const symmetricAzo = names.has("Azo") && doubleBondSymmetry(graph, "N", "N");

  return peaks.map((item) => {
    if (symmetricAlkene && item.vibrationTarget === VIBRATION_TARGETS.alkene) {
      return {
        ...item,
        intensity: "weak" as const,
        modifiers: [...(item.modifiers ?? []), "symmetry suppression"],
        explanation: `${item.explanation} The alkene is approximately symmetric, so the C=C vibration is weakened because the dipole-moment change is small.`,
      };
    }
    if (symmetricAzo && item.vibrationTarget === VIBRATION_TARGETS.azo) {
      return {
        ...item,
        intensity: "veryWeak" as const,
        modifiers: [...(item.modifiers ?? []), "symmetry suppression"],
        explanation: `${item.explanation} Approximate symmetry further suppresses the N=N stretch.`,
      };
    }
    return item;
  });
}

function nitrileConjugated(graph: ParsedMol) {
  for (const bond of graph.bonds) {
    if (bond.bondOrder !== 3) continue;
    const a = graph.atoms[bond.atomA]?.element;
    const b = graph.atoms[bond.atomB]?.element;
    if (!((a === "C" && b === "N") || (a === "N" && b === "C"))) continue;
    const carbon = a === "C" ? bond.atomA : bond.atomB;
    const nitrileN = a === "N" ? bond.atomA : bond.atomB;
    for (const neighborBond of graph.adjacency.get(carbon) ?? []) {
      const neighbor = getOtherAtom(neighborBond, carbon);
      if (neighbor === nitrileN) continue;
      if (isAromaticAtom(graph, neighbor)) return true;
      const neighborBonds = graph.adjacency.get(neighbor) ?? [];
      if (neighborBonds.some((candidate) => candidate.bondOrder === 2 && getOtherAtom(candidate, neighbor) !== carbon)) return true;
    }
  }
  return false;
}

function applyNitrileConjugation(peaks: IRPeak[], graph: ParsedMol, names: Set<string>) {
  if (!names.has("Nitrile") || !nitrileConjugated(graph)) return peaks;
  return peaks.map((item) => item.vibrationTarget === VIBRATION_TARGETS.nitrile
    ? {
        ...item,
        center: item.center === undefined ? undefined : item.center - 8,
        modifiers: [...(item.modifiers ?? []), "conjugation"],
        explanation: `${item.explanation} Conjugation is modeled as a small downward shift.`,
      }
    : item);
}

function shortestPathExcluding(graph: ParsedMol, start: number, target: number, excluded: number) {
  const queue: Array<[number, number]> = [[start, 0]];
  const visited = new Set<number>([excluded, start]);
  while (queue.length > 0) {
    const [node, distance] = queue.shift()!;
    if (node === target) return distance;
    for (const bond of graph.adjacency.get(node) ?? []) {
      const next = getOtherAtom(bond, node);
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push([next, distance + 1]);
    }
  }
  return null;
}

function cyclicKetoneRingSize(graph: ParsedMol): number | null {
  for (const atom of graph.atoms) {
    if (atom.element !== "C") continue;
    const bonds = graph.adjacency.get(atom.atomIndex) ?? [];
    const hasCarbonylO = bonds.some((bond) => bond.bondOrder === 2 && graph.atoms[getOtherAtom(bond, atom.atomIndex)]?.element === "O");
    if (!hasCarbonylO) continue;
    const carbonNeighbors = bonds
      .filter((bond) => bond.bondOrder === 1 && graph.atoms[getOtherAtom(bond, atom.atomIndex)]?.element === "C")
      .map((bond) => getOtherAtom(bond, atom.atomIndex));
    if (carbonNeighbors.length !== 2) continue;
    const path = shortestPathExcluding(graph, carbonNeighbors[0], carbonNeighbors[1], atom.atomIndex);
    if (path !== null) return path + 2;
  }
  return null;
}

function applyCyclicKetoneRule(peaks: IRPeak[], graph: ParsedMol, names: Set<string>) {
  if (!names.has("Ketone") || names.has("Enone")) return peaks;
  const ringSize = cyclicKetoneRingSize(graph);
  if (!ringSize || ringSize >= 6) return peaks;

  const targetCenter = ringSize === 5 ? 1745 : ringSize === 4 ? 1780 : 1810;
  return peaks.map((item) => {
    if (item.vibrationTarget !== VIBRATION_TARGETS.carbonyl || item.sourceGroup !== "Ketone") return item;
    const halfRange = ringSize === 5 ? 12 : 15;
    return {
      ...item,
      center: targetCenter,
      range: formatRange([targetCenter - halfRange, targetCenter + halfRange]),
      modifiers: [...(item.modifiers ?? []), `${ringSize}-membered ring strain`],
      explanation: `${item.explanation} A ${ringSize}-membered cyclic ketone is shifted upward by ring strain (cyclopentanone ≈1745 cm⁻¹; cyclobutanone ≈1780 cm⁻¹).`,
    };
  });
}

function graphRingCount(graph: ParsedMol) {
  if (graph.atoms.length === 0) return 0;
  let components = 0;
  const visited = new Set<number>();
  for (const atom of graph.atoms) {
    if (visited.has(atom.atomIndex)) continue;
    components += 1;
    const stack = [atom.atomIndex];
    visited.add(atom.atomIndex);
    while (stack.length) {
      const current = stack.pop()!;
      for (const bond of graph.adjacency.get(current) ?? []) {
        const next = getOtherAtom(bond, current);
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
  }
  return Math.max(0, graph.bonds.length - graph.atoms.length + components);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seedText: string) {
  let seed = hashString(seedText) || 1;
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fingerprintPeaks(graph: ParsedMol, seedText: string, majorPeaks: IRPeak[]) {
  const atomCount = graph.atoms.length;
  const ringCount = graphRingCount(graph);
  const heteroAtomCount = graph.atoms.filter((atom) => !["C", "H"].includes(atom.element)).length;
  const complexity = atomCount + ringCount * 3 + heteroAtomCount * 2;
  const simpleAcyclicHydrocarbon = ringCount === 0 && heteroAtomCount === 0;
  const peakCount = simpleAcyclicHydrocarbon
    ? Math.min(3, Math.max(1, 1 + Math.floor(atomCount * 0.25)))
    : Math.min(22, Math.max(5, 4 + Math.floor(complexity * 0.42)));
  const random = seededRandom(`${seedText}|${atomCount}|${ringCount}|${heteroAtomCount}`);
  const protectedBands = majorPeaks
    .filter((item) => item.kind !== "fingerprint" && item.center !== undefined)
    .map((item) => ({
      center: item.center as number,
      // Protect diagnostic bands more aggressively. Supporting medium/weak modes may
      // still have nearby fingerprint structure, but random bands should not stack
      // directly on top of them and create artificial deep troughs.
      radius: ["strong", "veryStrong"].includes(item.intensity)
        ? Math.max(28, (item.widthCm1 ?? WIDTH_BY_SHAPE[item.shape ?? "moderate"]) * 1.3)
        : Math.max(12, (item.widthCm1 ?? WIDTH_BY_SHAPE[item.shape ?? "moderate"]) * 0.7),
    }));

  const peaks: IRPeak[] = [];
  for (let index = 0; index < peakCount; index += 1) {
    // Real organic spectra are usually more crowded from roughly 650-1350 cm^-1,
    // with especially dense C-O/C-N/skeletal structure near 900-1250 cm^-1.
    const clusterChoice = random();
    let center = clusterChoice < 0.52
      ? 650 + random() * 800
      : clusterChoice < 0.84
        ? 850 + random() * 430
        : 500 + random() * 950;

    let attempts = 0;
    while (protectedBands.some((band) => Math.abs(band.center - center) < band.radius) && attempts < 10) {
      center = 650 + random() * 800;
      attempts += 1;
    }

    // Fingerprint lines are numerous but usually fairly narrow. Large Gaussian widths
    // make a simple molecule look like it has broad unresolved humps instead of the
    // fine structure seen in measured spectra.
    const width = 4 + random() * 8;
    const intensityRoll = random();
    const intensity: IRPeakIntensity = simpleAcyclicHydrocarbon
      ? intensityRoll > 0.90 ? "weak" : "veryWeak"
      : ringCount > 0
        ? intensityRoll > 0.72 ? "weak" : "veryWeak"
        : intensityRoll > 0.68 ? "weak" : "veryWeak";

    peaks.push(
      irPeak("Fingerprint region", `fingerprint-${index}`, "Skeletal / bending mode", [Math.max(500, center - 14), Math.min(1500, center + 14)], {
        center,
        intensity,
        shape: width < 13 ? "narrow" : "moderate",
        widthCm1: width,
        kind: "fingerprint",
        explanation: "Deterministic fingerprint-region feature representing combined C–C stretches, C–H bends, rocking/wagging, ring modes, and skeletal vibrations. Peak density increases with molecular complexity and is seeded from the molecular structure so the same molecule reproduces the same simulated pattern.",
      }),
    );
  }
  return peaks;
}

function uniqueIndices(values: number[]) {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function attachFunctionalGroupSites(
  peaks: IRPeak[],
  functionalGroups: FunctionalGroupResult[],
) {
  const sites = new Map<string, { atoms: number[]; bonds: number[] }>();

  for (const group of functionalGroups) {
    const matches = group.displayMatches ?? group.matches ?? [];
    const atoms = uniqueIndices(matches.flatMap((match) => match.atoms ?? []));
    const bonds = uniqueIndices(matches.flatMap((match) => match.bonds ?? []));
    if (atoms.length === 0 && bonds.length === 0) continue;
    sites.set(group.name, { atoms, bonds });
  }

  return peaks.map((peak) => {
    if ((peak.atomIndices?.length ?? 0) > 0 || (peak.bondIndices?.length ?? 0) > 0) return peak;
    const site = sites.get(peak.sourceGroup);
    if (!site) return peak;
    return {
      ...peak,
      atomIndices: site.atoms,
      bondIndices: site.bonds,
    };
  });
}


function bondElements(graph: ParsedMol, bond: ParsedMol["bonds"][number]) {
  return [graph.atoms[bond.atomA]?.element, graph.atoms[bond.atomB]?.element] as const;
}

function bondMatchesElements(
  graph: ParsedMol,
  bond: ParsedMol["bonds"][number],
  elementA: string,
  elementB: string,
  bondOrder?: number,
) {
  if (bondOrder !== undefined && bond.bondOrder !== bondOrder) return false;
  const [a, b] = bondElements(graph, bond);
  return (a === elementA && b === elementB) || (a === elementB && b === elementA);
}

function shortestCarbonPathExcludingBond(
  graph: ParsedMol,
  start: number,
  target: number,
  excludedBondIndex: number,
  maxEdges = 7,
) {
  const queue: Array<{ atom: number; path: number[] }> = [{ atom: start, path: [start] }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const edgesUsed = current.path.length - 1;
    if (edgesUsed >= maxEdges) continue;

    for (const bond of graph.adjacency.get(current.atom) ?? []) {
      if (bond.bondIndex === excludedBondIndex) continue;
      const next = getOtherAtom(bond, current.atom);
      if (graph.atoms[next]?.element !== "C") continue;
      if (current.path.includes(next)) continue;

      const nextPath = [...current.path, next];
      if (next === target) return nextPath;
      queue.push({ atom: next, path: nextPath });
    }
  }

  return null;
}

function carbonCycleContainingBond(
  graph: ParsedMol,
  bond: ParsedMol["bonds"][number],
) {
  if (!bondMatchesElements(graph, bond, "C", "C")) return null;
  const path = shortestCarbonPathExcludingBond(
    graph,
    bond.atomA,
    bond.atomB,
    bond.bondIndex,
    7,
  );
  if (!path) return null;

  // The alternative path contains N atoms and N-1 edges. Adding the excluded bond
  // closes a ring with N edges/atoms. Five-, six-, and seven-membered carbon rings are
  // sufficient for the aromatic systems covered by the current teaching rules.
  const cycleSize = path.length;
  if (cycleSize < 5 || cycleSize > 7) return null;
  return new Set(path);
}

function bondMatchesQuery(
  graph: ParsedMol,
  bond: ParsedMol["bonds"][number],
  query: IRVibrationTarget["patterns"][number],
) {
  const [elementA, elementB] = query.elements;
  if (!bondMatchesElements(graph, bond, elementA, elementB)) return false;
  if (query.bondOrders && !query.bondOrders.includes(bond.bondOrder)) return false;
  if (query.ringOnly && carbonCycleContainingBond(graph, bond) === null) return false;
  return true;
}

function uniqueBonds(bonds: ParsedMol["bonds"]) {
  const seen = new Set<number>();
  return bonds.filter((bond) => {
    if (seen.has(bond.bondIndex)) return false;
    seen.add(bond.bondIndex);
    return true;
  });
}

function selectNearSiteBonds(
  candidates: ParsedMol["bonds"],
  peak: IRPeak,
  collectAllNearSite: boolean,
) {
  if (candidates.length === 0) return [];
  const atomScope = new Set(peak.atomIndices ?? []);
  const bondScope = new Set(peak.bondIndices ?? []);

  const scored = candidates.map((bond) => {
    const explicit = bondScope.has(bond.bondIndex);
    const inside = atomScope.has(bond.atomA) && atomScope.has(bond.atomB);
    const touching = atomScope.has(bond.atomA) || atomScope.has(bond.atomB);
    return { bond, score: explicit ? 3 : inside ? 2 : touching ? 1 : 0 };
  });

  const bestScore = Math.max(0, ...scored.map((item) => item.score));
  if (bestScore > 0) {
    if (collectAllNearSite) {
      return scored.filter((item) => item.score > 0).map((item) => item.bond);
    }
    return scored.filter((item) => item.score === bestScore).map((item) => item.bond);
  }

  return candidates.length === 1 ? candidates : [];
}

function resolveRingExpandedBonds(
  graph: ParsedMol,
  peak: IRPeak,
  candidates: ParsedMol["bonds"],
) {
  const groups = new Map<string, { atoms: Set<number>; matches: ParsedMol["bonds"] }>();
  for (const bond of candidates) {
    const cycle = carbonCycleContainingBond(graph, bond);
    if (!cycle) continue;
    const key = Array.from(cycle).sort((a, b) => a - b).join(",");
    const group = groups.get(key) ?? { atoms: cycle, matches: [] };
    group.matches.push(bond);
    groups.set(key, group);
  }
  if (groups.size === 0) return [];

  const atomScope = new Set(peak.atomIndices ?? []);
  const bondScope = new Set(peak.bondIndices ?? []);
  const allGroups = Array.from(groups.values());
  let selected = allGroups.filter((group) =>
    group.matches.some((bond) => bondScope.has(bond.bondIndex))
    || Array.from(group.atoms).some((atomIndex) => atomScope.has(atomIndex)),
  );

  if (selected.length === 0 && allGroups.length === 1) selected = allGroups;

  // The candidate bonds identify which aromatic ring owns this vibration, but an
  // aromatic normal mode is delocalized across the ring rather than belonging to
  // only the Kekule-drawn C=C lines. Once the ring is identified, highlight every
  // C-C bond whose two endpoints belong to that same ring. This keeps detection
  // structural while presenting the aromatic bond network cleanly and accurately.
  return uniqueBonds(selected.flatMap((group) =>
    graph.bonds.filter((bond) =>
      group.atoms.has(bond.atomA)
      && group.atoms.has(bond.atomB)
      && bondMatchesElements(graph, bond, "C", "C"),
    ),
  ));
}

function resolveVibrationTargetBonds(
  graph: ParsedMol,
  peak: IRPeak,
  target: IRVibrationTarget,
) {
  const candidatesByPattern = target.patterns.map((pattern) =>
    graph.bonds.filter((bond) => bondMatchesQuery(graph, bond, pattern)),
  );

  if (target.expandWithinRing) {
    return resolveRingExpandedBonds(graph, peak, uniqueBonds(candidatesByPattern.flat()));
  }

  return uniqueBonds(candidatesByPattern.flatMap((candidates) =>
    selectNearSiteBonds(candidates, peak, target.collectAllNearSite ?? false),
  ));
}

function refinePeakToBonds(
  peak: IRPeak,
  bonds: ParsedMol["bonds"],
): IRPeak {
  if (bonds.length === 0) return peak;
  return {
    ...peak,
    // Parent functional-group indices stay untouched. This is a narrower vibration overlay.
    vibrationAtomIndices: uniqueIndices(bonds.flatMap((bond) => [bond.atomA, bond.atomB])),
    vibrationBondIndices: uniqueIndices(bonds.map((bond) => bond.bondIndex)),
  };
}

function refinePeakSpecificSites(peaks: IRPeak[], graph: ParsedMol) {
  return peaks.map((peak) => {
    if (!peak.vibrationTarget) return peak;
    return refinePeakToBonds(peak, resolveVibrationTargetBonds(graph, peak, peak.vibrationTarget));
  });
}

function atomSitesOverlap(a: IRPeak, b: IRPeak) {
  const atomsA = a.atomIndices ?? [];
  const atomsB = new Set(b.atomIndices ?? []);
  return atomsA.length > 0 && atomsA.some((atomIndex) => atomsB.has(atomIndex));
}

function suppressRedundantContextPeaks(peaks: IRPeak[]) {
  return peaks.filter((peak) => {
    if (!peak.suppressionClass) return true;
    const priority = peak.suppressionPriority ?? 0;

    const shadowed = peaks.some((other) =>
      other !== peak
      && other.suppressionClass === peak.suppressionClass
      && (other.suppressionPriority ?? 0) > priority
      && atomSitesOverlap(peak, other),
    );

    return !shadowed;
  });
}

function lowerPeakIntensity(intensity: IRPeakIntensity, steps = 1): IRPeakIntensity {
  if (intensity === "variable") return "medium";
  const current = INTENSITY_STEPS.indexOf(intensity);
  if (current < 0) return intensity;
  return INTENSITY_STEPS[Math.max(0, current - steps)];
}

function peakHalfWidth(peak: IRPeak) {
  return peak.widthCm1 ?? WIDTH_BY_SHAPE[peak.shape ?? "moderate"];
}

function peaksOverlap(a: IRPeak, b: IRPeak) {
  if (a.center === undefined || b.center === undefined) return false;
  const allowed = Math.max(22, 0.55 * (peakHalfWidth(a) + peakHalfWidth(b)));
  return Math.abs(a.center - b.center) <= allowed;
}

function applyPeakSuppressionRules(peaks: IRPeak[]) {
  const acidicOHEnvelopes = peaks.filter((peak) => peak.overlapRole === "acidic-oh-envelope");

  return peaks.map((peak) => {
    let suppressed = peak;

    if (
      suppressed.overlapRole === "alkyl-ch"
      && acidicOHEnvelopes.some((envelope) => peaksOverlap(suppressed, envelope))
    ) {
      suppressed = {
        ...suppressed,
        intensity: lowerPeakIntensity(suppressed.intensity, 1),
        modifiers: Array.from(new Set([...(suppressed.modifiers ?? []), "overlap suppression"])),
        explanation: suppressed.explanation.includes("It lies within a very broad acidic O–H envelope")
          ? suppressed.explanation
          : `${suppressed.explanation} It lies within a very broad acidic O–H envelope, so the distinct alkyl C–H feature is partially masked and should appear less prominent.`,
      };
    }

    if (suppressed.kind === "supporting" || INTENSITY_RANK[suppressed.intensity] <= INTENSITY_RANK.medium) {
      const strongerOverlap = peaks.some((other) => {
        if (other === peak || other.center === undefined || peak.center === undefined) return false;
        if (other.kind === "fingerprint") return false;
        if (INTENSITY_RANK[other.intensity] <= INTENSITY_RANK[suppressed.intensity]) return false;
        if (other.shape === "broad" || other.shape === "extremelyBroad") return false;
        if (!peaksOverlap(peak, other)) return false;
        return true;
      });

      if (strongerOverlap) {
        suppressed = {
          ...suppressed,
          intensity: lowerPeakIntensity(suppressed.intensity, 1),
          modifiers: Array.from(new Set([...(suppressed.modifiers ?? []), "peak overlap suppression"])),
          explanation: suppressed.explanation.includes("A stronger nearby absorption is expected to partially mask this lower-priority feature.")
            ? suppressed.explanation
            : `${suppressed.explanation} A stronger nearby absorption is expected to partially mask this lower-priority feature.`,
        };
      }
    }

    return suppressed;
  });
}

function jitterPeakCenters(peaks: IRPeak[], _seedText: string) {
  // Deliberately deterministic: environment-specific chemistry rules (conjugation,
  // ring strain, symmetry) own frequency shifts. Rendering no longer adds random
  // center jitter that can move a correct diagnostic band for cosmetic variation.
  return peaks;
}

function suppressImpossibleNH(peaks: IRPeak[], names: Set<string>) {
  const tertiaryAmine = names.has("Tertiary amine") || names.has("Tertiary aryl amine") || names.has("Quaternary ammonium");
  const tertiaryAmide = names.has("Tertiary amide");
  return peaks.filter((item) => {
    if (item.suppressionClass !== "nh-site") return true;
    if (tertiaryAmide && item.sourceGroup.toLowerCase().includes("amide")) return false;
    if (tertiaryAmine && (item.sourceGroup.toLowerCase().includes("amine") || item.sourceGroup === "Amine")) return false;
    return true;
  });
}

function mergeExactDuplicates(peaks: IRPeak[]) {
  const seen = new Set<string>();
  const output: IRPeak[] = [];
  for (const item of peaks) {
    const center = item.center === undefined ? "?" : Math.round(item.center / 4) * 4;
    const key = `${item.label}|${center}|${item.kind ?? "diagnostic"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

const SIMPLE_AROMATIC_GROUPS = [
  "Benzene",
  "Alkylbenzene",
  "Toluene",
  "Naphthalene",
  "Anthracene",
  "Phenanthrene",
  "Aniline",
  "Aryl amine",
  "Primary aryl amine",
  "Secondary aryl amine",
  "Tertiary aryl amine",
  "Aryl ether",
  "Anisole",
  "Aryl halide",
  "Nitrobenzene",
];

export const IR_RULES: Record<string, IRPeak[]> = {
  // O–H / alcohol family
  Alcohol: alcoholPeaks("Alcohol"),
  "Primary alcohol": alcoholPeaks("Primary alcohol", 1050),
  "Secondary alcohol": alcoholPeaks("Secondary alcohol", 1100),
  "Tertiary alcohol": alcoholPeaks("Tertiary alcohol", 1150),
  "Benzyl alcohol": alcoholPeaks("Benzyl alcohol", 1100),
  Phenol: phenolPeaks("Phenol"),
  Enol: [
    irPeak("Enol", "enol-oh", "Enol O–H stretch", [3200, 3550], {
      suppressionClass: "oh-site",
      suppressionPriority: 20,
      center: 3370,
      intensity: "medium",
      shape: "broad",
      explanation: "Enol O–H is broad and variable in the 3200–3550 cm⁻¹ region.",
    }),
  ],

  // Carboxylic acids
  "Carboxylic acid": acidPeaks("Carboxylic acid"),
  "Benzoic acid": [...acidPeaks("Benzoic acid"), ...aromaticPeaks("Benzoic acid")],
  "Cinnamic acid": [...acidPeaks("Cinnamic acid"), ...alkenePeaks("Cinnamic acid"), ...aromaticPeaks("Cinnamic acid")],
  "Acrylic acid": [...acidPeaks("Acrylic acid"), ...alkenePeaks("Acrylic acid")],
  "Crotonic acid": [...acidPeaks("Crotonic acid"), ...alkenePeaks("Crotonic acid")],
  "Enoic acid": [...acidPeaks("Enoic acid"), ...alkenePeaks("Enoic acid")],

  // Ketones / aldehydes
  Ketone: ketonePeaks("Ketone"),
  Enone: [...ketonePeaks("Enone"), ...alkenePeaks("Enone")],
  Chalcone: [...ketonePeaks("Chalcone"), ...alkenePeaks("Chalcone"), ...aromaticPeaks("Chalcone")],
  Aldehyde: aldehydePeaks("Aldehyde"),
  Benzaldehyde: [...aldehydePeaks("Benzaldehyde"), ...aromaticPeaks("Benzaldehyde")],
  Enal: [...aldehydePeaks("Enal"), ...alkenePeaks("Enal")],
  Acrolein: [...aldehydePeaks("Acrolein"), ...alkenePeaks("Acrolein")],
  Crotonaldehyde: [...aldehydePeaks("Crotonaldehyde"), ...alkenePeaks("Crotonaldehyde")],
  Cinnamaldehyde: [...aldehydePeaks("Cinnamaldehyde"), ...alkenePeaks("Cinnamaldehyde"), ...aromaticPeaks("Cinnamaldehyde")],

  // Esters / lactones
  Ester: esterPeaks("Ester"),
  Enoate: [...esterPeaks("Enoate"), ...alkenePeaks("Enoate")],
  Lactone: lactonePeaks("Lactone"),
  "Alpha lactone": lactonePeaks("Alpha lactone"),
  "Beta lactone": lactonePeaks("Beta lactone", 4),
  "Gamma lactone": lactonePeaks("Gamma lactone", 5),
  "Delta lactone": lactonePeaks("Delta lactone", 6),
  "Epsilon lactone": lactonePeaks("Epsilon lactone"),

  // Amides / lactams / related carbonyls
  Amide: [amideCarbonyl("Amide"), amideIIPeak("Amide")],
  "Primary amide": primaryAmidePeaks("Primary amide"),
  "Secondary amide": secondaryAmidePeaks("Secondary amide"),
  "Tertiary amide": tertiaryAmidePeaks("Tertiary amide"),
  Benzamide: [amideCarbonyl("Benzamide"), amideIIPeak("Benzamide"), ...aromaticPeaks("Benzamide")],
  Lactam: lactamPeaks("Lactam"),
  "Beta lactam": lactamPeaks("Beta lactam", 4),
  "Gamma lactam": lactamPeaks("Gamma lactam", 5),
  "Delta lactam": lactamPeaks("Delta lactam", 6),
  "Epsilon lactam": lactamPeaks("Epsilon lactam"),
  Urea: [
    amideCarbonyl("Urea", [1630, 1700], 1660),
    irPeak("Urea", "urea-nh", "N–H stretch", [3200, 3500], {
      suppressionClass: "nh-site",
      suppressionPriority: 30,
      center: 3350,
      intensity: "medium",
      shape: "moderate",
      explanation: "Urea-type structures can show N–H absorption when N–H bonds are present.",
    }),
  ],
  Carbamate: [
    irPeak("Carbamate", "carbamate-co", "Carbamate C=O stretch", [1680, 1740], {
      vibrationTarget: VIBRATION_TARGETS.carbonyl,
      center: 1710,
      intensity: "veryStrong",
      shape: "narrow",
      explanation: "Carbamate carbonyls fall roughly in the 1680–1740 cm⁻¹ region.",
    }),
    irPeak("Carbamate", "carbamate-co-single", "Carbamate C–O stretch", [1050, 1300], {
      suppressionClass: "co-site",
      suppressionPriority: 30,
      vibrationTarget: VIBRATION_TARGETS.carbonOxygenSingle,
      center: 1220,
      intensity: "strong",
      shape: "moderate",
      explanation: "Carbamates also contribute C–O stretching absorption.",
    }),
  ],

  // Acid derivatives
  "Acyl halide": [
    irPeak("Acyl halide", "acyl-halide-co", "Acyl-halide C=O stretch", [1770, 1815], {
      vibrationTarget: VIBRATION_TARGETS.carbonyl,
      center: 1800,
      intensity: "veryStrong",
      shape: "narrow",
      explanation: "The electron-withdrawing acyl halide substituent raises carbonyl frequency to around 1800 cm⁻¹.",
      modifiers: ["electron withdrawal"],
    }),
  ],
  "Acid anhydride": anhydridePeaks("Acid anhydride"),

  // Unsaturation
  Alkene: alkenePeaks("Alkene"),
  Cycloalkene: alkenePeaks("Cycloalkene"),
  Diene: alkenePeaks("Diene"),
  "Conjugated diene": alkenePeaks("Conjugated diene").map((item) => ({
    ...item,
    center: (item.center ?? 1645) - 15,
    modifiers: ["conjugation"],
    explanation: `${item.explanation} Conjugation shifts the C=C region somewhat lower.`,
  })),
  Triene: alkenePeaks("Triene"),
  Allene: [
    irPeak("Allene", "allene-cumulene", "C=C=C stretch", [1900, 2000], {
      vibrationTarget: VIBRATION_TARGETS.allene,
      center: 1950,
      intensity: "medium",
      shape: "narrow",
      explanation: "Allenes show a characteristic cumulated-double-bond absorption around 1900–2000 cm⁻¹.",
    }),
  ],
  "Cumulated diene": [
    irPeak("Cumulated diene", "cumulated-diene", "C=C=C stretch", [1900, 2000], {
      vibrationTarget: VIBRATION_TARGETS.allene,
      center: 1950,
      intensity: "medium",
      shape: "narrow",
      explanation: "Cumulated diene/allene systems show a characteristic C=C=C absorption around 1900–2000 cm⁻¹.",
    }),
  ],
  Alkyne: [
    irPeak("Alkyne", "alkyne-cc", "C≡C stretch", [2100, 2260], {
      vibrationTarget: VIBRATION_TARGETS.alkyne,
      center: 2180,
      intensity: "weak",
      shape: "veryNarrow",
      explanation: "Alkyne C≡C stretching is usually weak-to-medium; symmetry can make an internal alkyne very weak or effectively absent.",
    }),
  ],
  "Internal alkyne": [
    irPeak("Internal alkyne", "internal-alkyne-cc", "C≡C stretch", [2100, 2260], {
      vibrationTarget: VIBRATION_TARGETS.alkyne,
      center: 2180,
      intensity: "weak",
      shape: "veryNarrow",
      explanation: "Internal alkyne C≡C stretching is often weak and may be nearly absent for a symmetric alkyne.",
    }),
  ],
  "Terminal alkyne": [
    irPeak("Terminal alkyne", "terminal-alkyne-cc", "C≡C stretch", [2100, 2260], {
      vibrationTarget: VIBRATION_TARGETS.alkyne,
      center: 2120,
      intensity: "weak",
      shape: "veryNarrow",
      explanation: "Terminal alkyne C≡C stretching absorption is typically fairly weak but sharp.",
    }),
    irPeak("Terminal alkyne", "terminal-alkyne-ch", "≡C–H stretch", [3260, 3330], {
      center: 3300,
      intensity: "strong",
      shape: "veryNarrow",
      explanation: "Sharp terminal-alkyne sp C–H stretch; internal alkynes do not produce this band.",
    }),
  ],
  Cycloalkyne: [
    irPeak("Cycloalkyne", "cycloalkyne-cc", "C≡C stretch", [2100, 2260], {
      vibrationTarget: VIBRATION_TARGETS.alkyne,
      center: 2180,
      intensity: "medium",
      shape: "veryNarrow",
      explanation: "Cycloalkyne C≡C stretching absorption in the triple-bond region.",
    }),
  ],
  Enyne: [
    ...alkenePeaks("Enyne"),
    irPeak("Enyne", "enyne-cc-triple", "C≡C stretch", [2100, 2260], {
      vibrationTarget: VIBRATION_TARGETS.alkyne,
      center: 2180,
      intensity: "weak",
      shape: "veryNarrow",
      explanation: "Enyne triple-bond stretching absorption; intensity depends on substitution and symmetry.",
    }),
  ],
  Nitrile: [
    irPeak("Nitrile", "nitrile-cn", "C≡N stretch", [2210, 2260], {
      vibrationTarget: VIBRATION_TARGETS.nitrile,
      center: 2245,
      intensity: "strong",
      shape: "veryNarrow",
      explanation: "Nitriles give a strong, sharp, narrow absorption near 2240–2250 cm⁻¹; conjugation can shift it slightly lower.",
    }),
  ],

  // Aromatics
  ...Object.fromEntries(SIMPLE_AROMATIC_GROUPS.map((group) => [group, aromaticPeaks(group)])),

  // Amines
  Amine: aminePeaks("Amine", "unknown"),
  "Primary amine": aminePeaks("Primary amine", "primary"),
  "Secondary amine": aminePeaks("Secondary amine", "secondary"),
  "Tertiary amine": aminePeaks("Tertiary amine", "tertiary"),
  "Benzyl amine": aminePeaks("Benzyl amine", "unknown"),
  Aniline: [...arylAminePeaks("Aniline", "primary"), ...aromaticPeaks("Aniline")],
  "Aryl amine": [...arylAminePeaks("Aryl amine", "unknown"), ...aromaticPeaks("Aryl amine")],
  "Primary aryl amine": [...arylAminePeaks("Primary aryl amine", "primary"), ...aromaticPeaks("Primary aryl amine")],
  "Secondary aryl amine": [...arylAminePeaks("Secondary aryl amine", "secondary"), ...aromaticPeaks("Secondary aryl amine")],
  "Tertiary aryl amine": [...arylAminePeaks("Tertiary aryl amine", "tertiary"), ...aromaticPeaks("Tertiary aryl amine")],

  // C–O / epoxide
  Ether: [irPeak("Ether", "ether-co", "C–O–C stretch", [1050, 1150], {
    suppressionClass: "co-site",
    suppressionPriority: 10,
    vibrationTarget: VIBRATION_TARGETS.carbonOxygenSingle,
    center: 1100,
    intensity: "strong",
    shape: "moderate",
    explanation: "Strong ether C–O stretching absorption.",
  })],
  "Aryl ether": [irPeak("Aryl ether", "aryl-ether-co", "Ar–O stretch", [1200, 1275], {
    suppressionClass: "co-site",
    suppressionPriority: 10,
    vibrationTarget: VIBRATION_TARGETS.carbonOxygenSingle,
    center: 1235,
    intensity: "strong",
    shape: "moderate",
    explanation: "Aryl ethers often absorb at somewhat higher C–O frequency than ordinary alkyl ethers.",
  }), ...aromaticPeaks("Aryl ether")],
  Anisole: [irPeak("Anisole", "anisole-co", "Ar–O stretch", [1200, 1275], {
    suppressionClass: "co-site",
    suppressionPriority: 10,
    vibrationTarget: VIBRATION_TARGETS.carbonOxygenSingle,
    center: 1240,
    intensity: "strong",
    shape: "moderate",
    explanation: "Aryl ether C–O stretch.",
  }), ...aromaticPeaks("Anisole")],
  Epoxide: [
    irPeak("Epoxide", "epoxide-coc-1", "Epoxide C–O–C mode", [800, 1050], {
      suppressionClass: "co-site",
      suppressionPriority: 30,
      vibrationTarget: VIBRATION_TARGETS.carbonOxygenSingle,
      center: 920,
      intensity: "strong",
      shape: "moderate",
      explanation: "Epoxides produce several C–O–C fingerprint absorptions; an O–H band is not added unless a separate OH group is present.",
    }),
    irPeak("Epoxide", "epoxide-coc-2", "Epoxide C–O–C mode", [1050, 1300], {
      suppressionClass: "co-site",
      suppressionPriority: 30,
      vibrationTarget: VIBRATION_TARGETS.carbonOxygenSingle,
      center: 1250,
      intensity: "medium",
      shape: "moderate",
      explanation: "Additional epoxide fingerprint C–O–C vibration.",
    }),
  ],

  // Nitrogen / heterocumulenes
  Nitro: [
    irPeak("Nitro", "nitro-asym", "NO₂ asymmetric stretch", [1500, 1570], {
      vibrationTarget: VIBRATION_TARGETS.nitro,
      center: 1530,
      intensity: "veryStrong",
      shape: "narrow",
      explanation: "Strong nitro asymmetric stretch.",
    }),
    irPeak("Nitro", "nitro-sym", "NO₂ symmetric stretch", [1300, 1380], {
      vibrationTarget: VIBRATION_TARGETS.nitro,
      center: 1350,
      intensity: "veryStrong",
      shape: "narrow",
      explanation: "Strong nitro symmetric stretch; both nitro bands should be retained.",
    }),
  ],
  Nitrobenzene: [
    irPeak("Nitrobenzene", "nitrobenzene-asym", "NO₂ asymmetric stretch", [1500, 1570], {
      vibrationTarget: VIBRATION_TARGETS.nitro,
      center: 1530,
      intensity: "veryStrong",
      shape: "narrow",
      explanation: "Strong nitro asymmetric stretch.",
    }),
    irPeak("Nitrobenzene", "nitrobenzene-sym", "NO₂ symmetric stretch", [1300, 1380], {
      vibrationTarget: VIBRATION_TARGETS.nitro,
      center: 1350,
      intensity: "veryStrong",
      shape: "narrow",
      explanation: "Strong nitro symmetric stretch.",
    }),
    ...aromaticPeaks("Nitrobenzene"),
  ],
  Imine: [irPeak("Imine", "imine-cn", "C=N stretch", [1640, 1690], {
    vibrationTarget: VIBRATION_TARGETS.imine,
    center: 1665,
    intensity: "medium",
    shape: "narrow",
    explanation: "Imine C=N stretch; conjugation can shift it lower. N–H is added only when an N–H-bearing group is separately detected.",
  })],
  Aldoxime: [
    irPeak("Aldoxime", "aldoxime-cn", "C=N stretch", [1640, 1690], { vibrationTarget: VIBRATION_TARGETS.imine, center: 1665, intensity: "medium", shape: "narrow", explanation: "Oxime C=N stretching absorption." }),
    irPeak("Aldoxime", "aldoxime-oh", "Oxime O–H stretch", [3200, 3600], { suppressionClass: "oh-site", suppressionPriority: 30, center: 3400, intensity: "medium", shape: "broad", explanation: "Oxime O–H is often broad." }),
    irPeak("Aldoxime", "aldoxime-no", "N–O stretch", [900, 1100], { vibrationTarget: VIBRATION_TARGETS.nitrogenOxygen, center: 1000, intensity: "medium", shape: "moderate", explanation: "Oxime N–O absorption in the fingerprint region." }),
  ],
  Ketoxime: [
    irPeak("Ketoxime", "ketoxime-cn", "C=N stretch", [1640, 1690], { vibrationTarget: VIBRATION_TARGETS.imine, center: 1665, intensity: "medium", shape: "narrow", explanation: "Oxime C=N stretching absorption." }),
    irPeak("Ketoxime", "ketoxime-oh", "Oxime O–H stretch", [3200, 3600], { suppressionClass: "oh-site", suppressionPriority: 30, center: 3400, intensity: "medium", shape: "broad", explanation: "Oxime O–H is often broad." }),
    irPeak("Ketoxime", "ketoxime-no", "N–O stretch", [900, 1100], { vibrationTarget: VIBRATION_TARGETS.nitrogenOxygen, center: 1000, intensity: "medium", shape: "moderate", explanation: "Oxime N–O absorption in the fingerprint region." }),
  ],
  Aminoxime: [
    irPeak("Aminoxime", "aminoxime-cn", "C=N stretch", [1640, 1690], { vibrationTarget: VIBRATION_TARGETS.imine, center: 1665, intensity: "medium", shape: "narrow", explanation: "Oxime-family C=N stretching absorption." }),
    irPeak("Aminoxime", "aminoxime-oh", "Oxime O–H stretch", [3200, 3600], { suppressionClass: "oh-site", suppressionPriority: 30, center: 3400, intensity: "medium", shape: "broad", explanation: "Oxime O–H is often broad." }),
    irPeak("Aminoxime", "aminoxime-no", "N–O stretch", [900, 1100], { vibrationTarget: VIBRATION_TARGETS.nitrogenOxygen, center: 1000, intensity: "medium", shape: "moderate", explanation: "Oxime N–O absorption in the fingerprint region." }),
  ],
  Azo: [irPeak("Azo", "azo-nn", "N=N stretch", [1400, 1500], {
    vibrationTarget: VIBRATION_TARGETS.azo,
    center: 1450,
    intensity: "weak",
    shape: "moderate",
    explanation: "Azo N=N stretching is often weak and can be especially weak in symmetric azo compounds.",
  })],
  Diazo: [irPeak("Diazo", "diazo", "Diazo stretch", [2000, 2200], {
    vibrationTarget: VIBRATION_TARGETS.diazo,
    center: 2100,
    intensity: "strong",
    shape: "narrow",
    explanation: "Diazo functionality can give a strong absorption around 2000–2200 cm⁻¹; exact position is strongly structure-dependent.",
  })],
  Isocyanate: [irPeak("Isocyanate", "isocyanate", "N=C=O stretch", [2250, 2280], {
    vibrationTarget: VIBRATION_TARGETS.isocyanate,
    center: 2265,
    intensity: "veryStrong",
    shape: "veryNarrow",
    explanation: "Very strong, narrow and highly diagnostic isocyanate absorption.",
  })],
  Isothiocyanate: [irPeak("Isothiocyanate", "isothiocyanate", "N=C=S stretch", [2000, 2150], {
    vibrationTarget: VIBRATION_TARGETS.isothiocyanate,
    center: 2075,
    intensity: "strong",
    shape: "narrow",
    explanation: "Strong isothiocyanate N=C=S absorption.",
  })],
  Ketene: [irPeak("Ketene", "ketene", "C=C=O stretch", [2100, 2150], {
    vibrationTarget: VIBRATION_TARGETS.ketene,
    center: 2120,
    intensity: "veryStrong",
    shape: "veryNarrow",
    explanation: "Ketenes give a very strong absorption near 2120 cm⁻¹.",
  })],

  // Sulfur
  Thiol: [irPeak("Thiol", "thiol-sh", "S–H stretch", [2550, 2600], {
    center: 2575,
    intensity: "weak",
    shape: "veryNarrow",
    explanation: "S–H is weak and narrow; it should not be broadened like O–H.",
  })],
  Thioether: [irPeak("Thioether", "thioether-cs", "C–S stretch", [600, 750], {
    vibrationTarget: VIBRATION_TARGETS.carbonSulfurSingle,
    center: 675,
    intensity: "weak",
    shape: "moderate",
    kind: "supporting",
    explanation: "C–S stretching is relatively weak and lies in the fingerprint region.",
  })],
  Sulfoxide: [irPeak("Sulfoxide", "sulfoxide-so", "S=O stretch", [1030, 1070], {
    vibrationTarget: VIBRATION_TARGETS.sulfurOxygen,
    center: 1050,
    intensity: "strong",
    shape: "narrow",
    explanation: "Strong sulfoxide S=O stretch near 1050 cm⁻¹.",
  })],
  Sulfone: [
    irPeak("Sulfone", "sulfone-so-high", "SO₂ asymmetric stretch", [1290, 1350], { vibrationTarget: VIBRATION_TARGETS.sulfurOxygen, center: 1300, intensity: "strong", shape: "narrow", explanation: "One of two strong sulfone S=O stretching modes." }),
    irPeak("Sulfone", "sulfone-so-low", "SO₂ symmetric stretch", [1120, 1160], { vibrationTarget: VIBRATION_TARGETS.sulfurOxygen, center: 1140, intensity: "strong", shape: "narrow", explanation: "Second strong sulfone S=O stretching mode." }),
  ],
  "Sulfonic acid": [
    irPeak("Sulfonic acid", "sulfonic-so", "S=O stretch", [1150, 1350], { vibrationTarget: VIBRATION_TARGETS.sulfurOxygen, center: 1250, intensity: "strong", shape: "moderate", explanation: "Strong sulfonic-acid S=O absorption." }),
    irPeak("Sulfonic acid", "sulfonic-oh", "O–H stretch", [2500, 3500], { overlapRole: "acidic-oh-envelope", suppressionClass: "oh-site", suppressionPriority: 30, center: 3050, intensity: "strong", shape: "extremelyBroad", widthCm1: 300, explanation: "Sulfonic acids also show broad O–H absorption." }),
  ],
  Sulfonamide: [irPeak("Sulfonamide", "sulfonamide-nh", "N–H stretch", [3100, 3400], {
    suppressionClass: "nh-site",
    suppressionPriority: 30,
    center: 3250,
    intensity: "medium",
    shape: "moderate",
    explanation: "Sulfonamide N–H stretching absorption when an N–H bond is present.",
  })],

  // Phosphorus
  "Phosphine oxide": [irPeak("Phosphine oxide", "phosphine-oxide-po", "P=O stretch", [1150, 1300], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygen, center: 1230, intensity: "strong", shape: "narrow", explanation: "Strong phosphoryl P=O stretching absorption." })],
  "Primary phosphine oxide": [irPeak("Primary phosphine oxide", "primary-phosphine-oxide-po", "P=O stretch", [1150, 1300], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygen, center: 1230, intensity: "strong", shape: "narrow", explanation: "Strong phosphoryl P=O stretching absorption." })],
  "Secondary phosphine oxide": [irPeak("Secondary phosphine oxide", "secondary-phosphine-oxide-po", "P=O stretch", [1150, 1300], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygen, center: 1230, intensity: "strong", shape: "narrow", explanation: "Strong phosphoryl P=O stretching absorption." })],
  "Tertiary phosphine oxide": [irPeak("Tertiary phosphine oxide", "tertiary-phosphine-oxide-po", "P=O stretch", [1150, 1300], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygen, center: 1230, intensity: "strong", shape: "narrow", explanation: "Strong phosphoryl P=O stretching absorption." })],
  Phosphate: [
    irPeak("Phosphate", "phosphate-po", "P=O stretch", [1150, 1300], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygen, center: 1230, intensity: "strong", shape: "narrow", explanation: "Strong P=O region for phosphorus oxy-functionalities." }),
    irPeak("Phosphate", "phosphate-poc", "P–O–C stretch", [900, 1100], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygenSingle, center: 1020, intensity: "strong", shape: "moderate", explanation: "P–O–C absorption in the fingerprint region when an organic P–O linkage is present." }),
  ],
  "Phosphate ester": [
    irPeak("Phosphate ester", "phosphate-ester-po", "P=O stretch", [1150, 1300], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygen, center: 1230, intensity: "strong", shape: "narrow", explanation: "Strong P=O region." }),
    irPeak("Phosphate ester", "phosphate-ester-poc", "P–O–C stretch", [900, 1100], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygenSingle, center: 1020, intensity: "strong", shape: "moderate", explanation: "P–O–C stretching absorption." }),
  ],
  "Phosphate triester": [
    irPeak("Phosphate triester", "phosphate-triester-po", "P=O stretch", [1150, 1300], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygen, center: 1230, intensity: "strong", shape: "narrow", explanation: "Strong P=O region." }),
    irPeak("Phosphate triester", "phosphate-triester-poc", "P–O–C stretch", [900, 1100], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygenSingle, center: 1020, intensity: "strong", shape: "moderate", explanation: "P–O–C stretching absorption." }),
  ],
  Phosphonate: [
    irPeak("Phosphonate", "phosphonate-po", "P=O stretch", [1150, 1300], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygen, center: 1230, intensity: "strong", shape: "narrow", explanation: "Strong phosphorus-oxo absorption." }),
    irPeak("Phosphonate", "phosphonate-poc", "P–O–C stretch", [900, 1100], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygenSingle, center: 1020, intensity: "strong", shape: "moderate", explanation: "P–O–C stretching absorption." }),
  ],
  "Phosphonate ester": [
    irPeak("Phosphonate ester", "phosphonate-ester-po", "P=O stretch", [1150, 1300], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygen, center: 1230, intensity: "strong", shape: "narrow", explanation: "Strong phosphorus-oxo absorption." }),
    irPeak("Phosphonate ester", "phosphonate-ester-poc", "P–O–C stretch", [900, 1100], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygenSingle, center: 1020, intensity: "strong", shape: "moderate", explanation: "P–O–C stretching absorption." }),
  ],
  "Phosphonate diester": [
    irPeak("Phosphonate diester", "phosphonate-diester-po", "P=O stretch", [1150, 1300], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygen, center: 1230, intensity: "strong", shape: "narrow", explanation: "Strong phosphorus-oxo absorption." }),
    irPeak("Phosphonate diester", "phosphonate-diester-poc", "P–O–C stretch", [900, 1100], { vibrationTarget: VIBRATION_TARGETS.phosphorusOxygenSingle, center: 1020, intensity: "strong", shape: "moderate", explanation: "P–O–C stretching absorption." }),
  ],
};


export type IRPeakHighlightSite = {
  atomIndices: number[];
  bondIndices: number[];
  specificity: "vibration" | "functional-group" | "none";
};

/**
 * Resolve an IR peak to the atoms/bonds that actually participate in the named vibration.
 * This deliberately runs independently of prediction-time annotations so UI selection can
 * recover an exact vibration site even when a functional-group display match was too broad
 * or too narrow. Parent functional-group indices remain the final fallback.
 */
export async function resolveIRPeakHighlightSite(
  structure: string,
  peak: IRPeak,
): Promise<IRPeakHighlightSite> {
  if ((peak.vibrationBondIndices?.length ?? 0) > 0 || (peak.vibrationAtomIndices?.length ?? 0) > 0) {
    return {
      atomIndices: peak.vibrationAtomIndices ?? [],
      bondIndices: peak.vibrationBondIndices ?? [],
      specificity: "vibration",
    };
  }

  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(structure);
  if (!mol) {
    if (peak.vibrationTarget) return { atomIndices: [], bondIndices: [], specificity: "none" };
    const atoms = peak.atomIndices ?? [];
    const bonds = peak.bondIndices ?? [];
    return {
      atomIndices: atoms,
      bondIndices: bonds,
      specificity: atoms.length > 0 || bonds.length > 0 ? "functional-group" : "none",
    };
  }

  try {
    const graph = parseMolBlock(mol.get_molblock());
    const refined = refinePeakSpecificSites([peak], graph)[0] ?? peak;

    if ((refined.vibrationBondIndices?.length ?? 0) > 0 || (refined.vibrationAtomIndices?.length ?? 0) > 0) {
      return {
        atomIndices: refined.vibrationAtomIndices ?? [],
        bondIndices: refined.vibrationBondIndices ?? [],
        specificity: "vibration",
      };
    }

    if (peak.vibrationTarget) {
      return { atomIndices: [], bondIndices: [], specificity: "none" };
    }

    const atoms = peak.atomIndices ?? [];
    const bonds = peak.bondIndices ?? [];
    return {
      atomIndices: atoms,
      bondIndices: bonds,
      specificity: atoms.length > 0 || bonds.length > 0 ? "functional-group" : "none",
    };
  } finally {
    mol.delete?.();
  }
}

export function predictIRPeaksFromGroups(functionalGroups: FunctionalGroupResult[]): IRPeak[] {
  const names = new Set(functionalGroups.map((group) => group.name));
  let peaks = functionalGroups.flatMap((group) => IR_RULES[group.name] ?? []);
  peaks = attachFunctionalGroupSites(peaks, functionalGroups);
  peaks = suppressImpossibleNH(peaks, names);
  peaks = suppressRedundantContextPeaks(peaks);
  peaks = applyConjugation(peaks);
  peaks = applyPeakSuppressionRules(peaks);
  return mergeExactDuplicates(peaks).sort((a, b) => (b.center ?? 0) - (a.center ?? 0));
}

export async function predictRuleBasedIR(
  functionalGroups: FunctionalGroupResult[],
  structure: string,
): Promise<IRPeak[]> {
  const names = new Set(functionalGroups.map((group) => group.name));
  let peaks = predictIRPeaksFromGroups(functionalGroups);
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(structure);
  if (!mol) return peaks;

  try {
    const canonicalSmiles = typeof mol.get_smiles === "function" ? mol.get_smiles() : structure;
    const graph = parseMolBlock(mol.get_molblock());

    const structuralXH = structuralXHPeaks(graph, peaks);
    const structuralCS = structuralCSpeaks(graph, peaks);
    peaks = [
      ...peaks,
      ...structuralCHPeaks(graph),
      ...structuralHalidePeaks(graph),
      ...structuralXH,
      ...structuralCS,
      ...aromaticOutOfPlanePeaks(graph),
    ];
    peaks = refinePeakSpecificSites(peaks, graph);

    if (names.has("Internal alkyne") && tripleBondSymmetry(graph)) {
      peaks = peaks.map((item) => item.sourceGroup === "Internal alkyne" && item.vibrationTarget === VIBRATION_TARGETS.alkyne
        ? {
            ...item,
            intensity: "veryWeak" as const,
            modifiers: [...(item.modifiers ?? []), "symmetry suppression"],
            explanation: `${item.explanation} This internal alkyne appears approximately symmetric, so the C≡C vibration is strongly suppressed because the dipole-moment change is small.`,
          }
        : item);
    }

    peaks = applyCyclicKetoneRule(peaks, graph, names);
    peaks = applySymmetrySuppression(peaks, graph, names);
    peaks = applyNitrileConjugation(peaks, graph, names);
    peaks = suppressImpossibleNH(peaks, names);
    peaks = suppressRedundantContextPeaks(peaks);
    peaks = applyPeakSuppressionRules(peaks);
    peaks = mergeExactDuplicates(peaks);
    peaks = jitterPeakCenters(peaks, canonicalSmiles);
    peaks = [
      ...peaks,
      ...fingerprintPeaks(graph, canonicalSmiles, peaks),
    ];

    return peaks.sort((a, b) => (b.center ?? 0) - (a.center ?? 0));
  } finally {
    mol.delete?.();
  }
}
