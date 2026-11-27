/**
 * Explanations and predict-then-observe scenarios for the acid-base / titration tool.
 * Every number quoted is computed from the same model that draws the curve; the wording is fixed text around them.
 */
import { analyzeSolution, isAcidKind, isWeak, type SpeciesKind } from "./acidBase";
import { formatConc, formatMl, formatPH, formatPercent } from "./format";
import { equivalenceVolume, pHAt, specialPoints, type SpecialPoints, type TitrationInput, type TitrationPoint } from "./titration";

export interface PointExplanation {
  heading: string;
  paragraphs: string[];
}

const counterpart = (kind: SpeciesKind): SpeciesKind => (isAcidKind(kind) ? "strong-acid" : "strong-base");

export function explainPoint(input: TitrationInput, point: TitrationPoint, special: SpecialPoints): PointExplanation {
  const acid = isAcidKind(input.analyte);
  const weak = isWeak(input.analyte);
  const eq = point.equilibrium;
  const analyte = acid ? "acid" : "base";
  const titrant = acid ? "OH⁻" : "H⁺";
  const pH = formatPH(point.pH);
  const veq = special.veq;
  const conj = acid ? "A⁻" : "BH⁺";
  const wk = acid ? "HA" : "B";
  const pair = acid ? eq.acid : eq.base;
  const ratio = pair ? (acid ? eq.acid!.a / eq.acid!.ha : eq.base!.bh / eq.base!.b) : NaN;
  const excess = (input.ct * point.vt - input.c0 * input.v0) / point.vTotal;

  switch (point.region) {
    case "initial": {
      if (!weak) {
        return { heading: "Start: nothing added", paragraphs: [
          `The strong ${analyte} is fully ionized, so the ${acid ? "[H⁺]" : "[OH⁻]"} equals its concentration (${formatConc(input.c0)}) and pH = ${pH}.`,
          "Nothing has been neutralised yet, so the curve starts here and rises (or falls) slowly at first because pH is logarithmic.",
        ] };
      }
      const strong = analyzeSolution({ kind: counterpart(input.analyte), concentration: input.c0 });
      const pct = pair ? (acid ? eq.acid!.alpha : eq.base!.alpha) * 100 : 0;
      return { heading: "Start: a weak " + analyte + " in water", paragraphs: [
        `A weak ${analyte} ionizes only a little: about ${formatPercent(pct)} here, so the pH is ${pH}.`,
        strong && "equilibrium" in strong ? `A strong ${analyte} at the same concentration would be fully ionized and give pH ${formatPH(strong.equilibrium.pH)}; the difference is the unionized ${wk} that has not reacted with water.` : "",
      ].filter(Boolean) };
    }
    case "early":
    case "buffer":
      return { heading: weak ? "Buffer region" : "Before equivalence", paragraphs: [
        `Added ${titrant} has converted part of the ${wk} into ${conj}. Both are present (${formatConc(acid ? eq.acid!.ha : eq.base!.b)} ${wk}, ${formatConc(acid ? eq.acid!.a : eq.base!.bh)} ${conj}), so the mixture is a buffer: a further small addition changes the pH only a little.`,
        `Ratio ${conj}/${wk} = ${ratio.toFixed(ratio < 10 ? 2 : 1)}. ${acid ? "pH = pKa + log([A⁻]/[HA])" : "pOH = pKb + log([BH⁺]/[B])"} predicts pH ${formatPH(acid ? input.pK! + Math.log10(ratio) : 14 - (input.pK! + Math.log10(ratio)))} (the exact model gives ${pH}).`,
      ] };
    case "half-equivalence":
      return { heading: "Half-equivalence point", paragraphs: [
        `Exactly half of the ${wk} has been converted, so [${conj}] ≈ [${wk}] and the logarithm in Henderson–Hasselbalch is zero.`,
        `Therefore pH ≈ pKa${acid ? "" : " (of BH⁺ = 14 − pKb)"} = ${formatPH(special.pKaEffective ?? NaN)}. The exact model gives ${pH}, a difference of ${(point.pH - (special.pKaEffective ?? 0)).toFixed(3)} pH units from water and the weak ${analyte}'s own ionization. Measuring this pH is how pKa values are found experimentally.`,
      ] };
    case "approaching-equivalence":
      return { heading: "Approaching equivalence", paragraphs: weak ? [
        `Only about ${((1 - point.fraction) * 100).toFixed(1)} % of the original ${analyte} is left. The buffer pair is lopsided (${conj}/${wk} = ${ratio.toFixed(1)}), so each drop of titrant now moves the pH much more.`,
      ] : [
        `${acid ? "[H⁺]" : "[OH⁻]"} is now ${formatConc(acid ? eq.h : eq.oh)}. Because pH is logarithmic, the pH is still changing slowly even though most of the ${analyte} is gone; it will change abruptly within the last fraction of a percent.`,
      ] };
    case "equivalence": {
      if (!weak) {
        return { heading: "Equivalence point", paragraphs: [
          `The moles of ${titrant} added equal the moles of strong ${analyte} (${formatMl(veq)} of titrant). Only a neutral salt and water remain, so pH = ${pH}, which is 7 at 25 °C.`,
        ] };
      }
      const ceq = (input.c0 * input.v0) / (input.v0 + veq);
      return { heading: "Equivalence point", paragraphs: [
        `All of the weak ${analyte} has been converted to its conjugate ${acid ? "base A⁻" : "acid BH⁺"} (${formatConc(ceq)}). That ion reacts with water, so the solution is ${acid ? "basic" : "acidic"}: pH = ${pH}, not 7.`,
        `The pH of a titration's equivalence point depends on the conjugate species (here Kw/${acid ? "Ka" : "Kb"}), which is why an indicator must be chosen to match.`,
      ] };
    }
    default:
      return { heading: "Past equivalence", paragraphs: [
        `All of the ${analyte} is consumed. The solution contains ${formatConc(Math.max(excess, 0))} of excess strong ${acid ? "base" : "acid"}, which sets the pH (${pH}); the weak ${analyte}'s conjugate contributes almost nothing.`,
      ] };
  }
}

// ---- "why" lessons -----------------------------------------------------------------------------------------------

export interface ConceptLesson {
  id: string;
  title: string;
  body: string[];
}

export function conceptLessons(input: TitrationInput): ConceptLesson[] {
  const acid = isAcidKind(input.analyte);
  const weak = isWeak(input.analyte);
  const sp = specialPoints(input);
  const lessons: ConceptLesson[] = [];

  const strong = analyzeSolution({ kind: counterpart(input.analyte), concentration: input.c0 });
  const own = analyzeSolution(weak ? { kind: input.analyte, concentration: input.c0, pK: input.pK } : { kind: input.analyte, concentration: input.c0 });
  if ("equilibrium" in strong && "equilibrium" in own) {
    lessons.push({
      id: "initial",
      title: `Why do strong and weak ${acid ? "acids" : "bases"} start at different pH?`,
      body: weak
        ? [
            `A strong ${acid ? "acid" : "base"} at ${formatConc(input.c0)} is fully ionized: pH ${formatPH(strong.equilibrium.pH)}. Your weak one (${acid ? "pKa" : "pKb"} ${input.pK?.toFixed(2)}) ionizes only ${formatPercent(own.percentIonized)}, so it releases far fewer ${acid ? "H⁺" : "OH⁻"} ions: pH ${formatPH(own.equilibrium.pH)}.`,
            `The pH depends on how much ${acid ? "H⁺" : "OH⁻"} is actually produced, not on how much ${acid ? "acid" : "base"} was dissolved.`,
          ]
        : [`Your analyte is strong, so it is fully ionized and the pH (${formatPH(own.equilibrium.pH)}) follows directly from its concentration. A weak ${acid ? "acid" : "base"} of the same concentration would sit closer to 7. Switch the analyte to weak to compare.`],
    });
  }

  lessons.push({
    id: "buffer",
    title: `Why does the ${weak ? "weak-" + (acid ? "acid" : "base") : ""} titration curve ${weak ? "have a buffer region" : "have no buffer region"}?`,
    body: weak && sp.bufferRegion
      ? [
          `As ${acid ? "OH⁻" : "H⁺"} is added, some ${acid ? "HA becomes A⁻" : "B becomes BH⁺"}. With both members of a conjugate pair present, the added reagent is absorbed by the other member, so the pH moves slowly: ${formatPH(sp.bufferRegion.pHStart)} to ${formatPH(sp.bufferRegion.pHEnd)} between ${formatMl(sp.bufferRegion.vStart)} and ${formatMl(sp.bufferRegion.vEnd)} here.`,
          "This is the flat part of the curve. It is bounded by pH = pKa ± 1, where the pair is between 10:1 and 1:10.",
        ]
      : weak
        ? ["With these values the pair never spends a useful stretch within a factor of ten of 1:1 (the analyte is too dilute or too weak), so there is no meaningful buffer region."]
        : ["A strong analyte has no conjugate pair that can absorb the titrant, so there is no buffer region: the pH changes slowly at first only because of the logarithmic scale, then jumps at equivalence."],
  });

  lessons.push({
    id: "equivalence",
    title: "Why does the equivalence-point pH not have to be 7?",
    body: [
      weak
        ? `At equivalence you have only the conjugate ${acid ? "base" : "acid"} of the weak ${acid ? "acid" : "base"}. It reacts with water, making the solution ${acid ? "basic" : "acidic"}: pH ${formatPH(sp.pHEquivalence)}.`
        : `Both reactants are strong, so at equivalence only a neutral salt and water remain: pH ${formatPH(sp.pHEquivalence)}.`,
      "Equivalence means the moles of titrant equal the moles of analyte; it says nothing about the final pH being neutral.",
    ],
  });

  lessons.push({
    id: "half",
    title: "Why does the half-equivalence pH equal the pKa?",
    body: weak && sp.halfEquivalence
      ? [
          `At ${formatMl(sp.halfEquivalence.vt)}, half the weak ${acid ? "acid" : "base"} has been converted, so the conjugate pair is 1:1. Henderson–Hasselbalch then gives pH = pKa (${formatPH(sp.pKaEffective ?? NaN)}).`,
          `The exact model gives ${formatPH(sp.halfEquivalence.pH)}; the small difference (${sp.halfEquivalence.deviationFromPK.toFixed(3)}) is water and the analyte's own ionization.`,
        ]
      : ["Strong acids and bases have no pKa in water (they are fully ionized), so there is no half-equivalence relationship. Choose a weak analyte to see it."],
  });

  const diluted = analyzeSolution(weak ? { kind: input.analyte, concentration: input.c0 / 10, pK: input.pK } : { kind: input.analyte, concentration: input.c0 / 10 });
  if ("equilibrium" in own && "equilibrium" in diluted && input.c0 / 10 >= 1e-7) {
    lessons.push({
      id: "dilution",
      title: "Why does dilution affect equilibrium?",
      body: weak
        ? [
            `Diluting ${input.c0 / 10 >= 1e-7 ? "tenfold" : ""} (${formatConc(input.c0)} → ${formatConc(input.c0 / 10)}) shifts the pH from ${formatPH(own.equilibrium.pH)} to ${formatPH(diluted.equilibrium.pH)}: only about ${Math.abs(diluted.equilibrium.pH - own.equilibrium.pH).toFixed(2)} unit, not 1.`,
            `The weak ${acid ? "acid" : "base"} ionizes more when diluted (${formatPercent(own.percentIonized)} → ${formatPercent(diluted.percentIonized)}) because the equilibrium shifts toward more, smaller particles (Le Chatelier); that partly offsets the lower concentration.`,
          ]
        : [`A strong ${acid ? "acid" : "base"} is already fully ionized, so tenfold dilution changes the pH by exactly one unit (${formatPH(own.equilibrium.pH)} → ${formatPH(diluted.equilibrium.pH)}) as long as water's own ions stay negligible.`],
    });
  }
  return lessons;
}

// ---- predict, then observe ------------------------------------------------------------------------------------------

export type Direction = "higher" | "lower" | "same";

export interface Scenario {
  id: string;
  /** What is changed, phrased as an action. */
  change: string;
  /** The quantity the learner predicts. */
  quantity: string;
  unit: "pH" | "mL";
  apply: (input: TitrationInput) => TitrationInput;
  measure: (input: TitrationInput) => number;
}

const atPH = (i: TitrationInput) => pHAt(i, 0);
const eqPH = (i: TitrationInput) => specialPoints(i).pHEquivalence;

export function scenariosFor(input: TitrationInput): Scenario[] {
  const out: Scenario[] = [
    { id: "dilute-10", change: "make the analyte 10× more dilute (same volume)", quantity: "the starting pH", unit: "pH", apply: (i) => ({ ...i, c0: i.c0 / 10, vt: 0 }), measure: atPH },
    { id: "titrant-x2", change: "double the titrant concentration", quantity: "the volume of titrant needed to reach equivalence", unit: "mL", apply: (i) => ({ ...i, ct: i.ct * 2, vt: 0 }), measure: (i) => equivalenceVolume(i) },
    { id: "volume-x2", change: "double the analyte volume (same concentrations)", quantity: "the pH at the equivalence point", unit: "pH", apply: (i) => ({ ...i, v0: i.v0 * 2, vt: 0 }), measure: eqPH },
  ];
  if (isWeak(input.analyte)) {
    out.splice(2, 0, {
      id: "weaker",
      change: `use ${isAcidKind(input.analyte) ? "an acid" : "a base"} that is one pK unit weaker`,
      quantity: "the pH at the half-equivalence point",
      unit: "pH",
      apply: (i) => ({ ...i, pK: (i.pK as number) + 1, vt: 0 }),
      measure: (i) => pHAt(i, equivalenceVolume(i) / 2),
    });
  }
  return out;
}

export function evaluateScenario(scenario: Scenario, input: TitrationInput): { before: number; after: number; direction: Direction; afterInput: TitrationInput } {
  const before = scenario.measure(input);
  const afterInput = scenario.apply(input);
  const after = scenario.measure(afterInput);
  const tol = scenario.unit === "pH" ? 0.005 : Math.abs(before) * 1e-9;
  const direction: Direction = Math.abs(after - before) <= tol ? "same" : after > before ? "higher" : "lower";
  return { before, after, direction, afterInput };
}

