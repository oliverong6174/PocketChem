/** Headline results of the acid-base tool for one view; shared by the page, the saved-analysis summary and tests. */
import { analyzeBuffer, analyzeSolution, dilute, PKW_25C, TEMPERATURE_C, validateBuffer, validateSingleSolution } from "./acidBase";
import { formatConc, formatMl, formatPH, formatPercent } from "./format";
import { pointAt, specialPoints, validateTitration } from "./titration";
import { GENCHEM_ENGINE_VERSION, type GenChemInputs, type GenChemResults, type GenChemView } from "../persistence/generalChemWorkspace";

export const ASSUMPTIONS: string[] = [
  `Water at ${TEMPERATURE_C} °C: Kw = 1.0×10⁻¹⁴, pKw = ${PKW_25C}.`,
  "Ideal solutions: activities are taken equal to concentrations (no ionic-strength correction).",
  "One monoprotic acid or base, strong or weak; volumes are additive.",
  "Not modelled: polyprotic species, mixtures, activity effects, other temperatures, non-aqueous solvents, dissolved CO₂.",
];

export function summarize(inputs: GenChemInputs, view: GenChemView = inputs.view): GenChemResults | null {
  const base = { view, engineVersion: GENCHEM_ENGINE_VERSION, assumptions: ASSUMPTIONS };
  if (view === "titration") {
    const v = validateTitration(inputs.titration);
    if (!v.ok) return null;
    const sp = specialPoints(v.value);
    const point = pointAt(v.value, v.value.vt, sp);
    const headline = [
      `pH ${formatPH(point.pH)} after ${formatMl(point.vt)} of titrant (${(point.fraction * 100).toFixed(1)} % of equivalence)`,
      `Equivalence: ${formatMl(sp.veq)}, pH ${formatPH(sp.pHEquivalence)}`,
    ];
    if (sp.halfEquivalence) headline.push(`Half-equivalence: ${formatMl(sp.halfEquivalence.vt)}, pH ${formatPH(sp.halfEquivalence.pH)} (pKa ${formatPH(sp.pKaEffective ?? NaN)})`);
    return { ...base, headline, pH: point.pH };
  }
  if (view === "solution") {
    const v = validateSingleSolution(inputs.solution);
    if (!v.ok) return null;
    const a = analyzeSolution(v.value);
    if (!("equilibrium" in a)) return null;
    const headline = [`pH ${formatPH(a.equilibrium.pH)} at ${formatConc(v.value.concentration)}`, `${formatPercent(a.percentIonized)} ionized`];
    const d = dilute(v.value, inputs.solution.startVolumeMl, inputs.solution.dilutedVolumeMl);
    if (d.ok) {
      const after = analyzeSolution(d.input);
      if ("equilibrium" in after) headline.push(`After ${d.factor.toPrecision(3)}× dilution: pH ${formatPH(after.equilibrium.pH)}, ${formatPercent(after.percentIonized)} ionized`);
    }
    return { ...base, headline, pH: a.equilibrium.pH };
  }
  const v = validateBuffer(inputs.buffer);
  if (!v.ok) return null;
  const a = analyzeBuffer(v.value);
  if (!("equilibrium" in a)) return null;
  return {
    ...base,
    headline: [
      `pH ${formatPH(a.equilibrium.pH)} (exact model)`,
      `Henderson–Hasselbalch ${formatPH(a.hh.pH)}: ${a.hh.valid ? "within its regime" : "outside its regime (" + a.hh.reasons.join("; ") + ")"}`,
    ],
    pH: a.equilibrium.pH,
  };
}
