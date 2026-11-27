/**
 * Saved state of the Stage 16 Biology tools (persisted pages "regulation", "genetics", "celldivision"; subject "biology").
 *
 * Inputs are the scientific state: conditions, genotypes, recombination fraction, meiosis settings, the step or stage shown, the
 * learning mode and the selected component. Every result (gametes, offspring, stage cells, expression levels) is rebuilt from them
 * on open, never read back. Validators build new objects from known fields, reject unknown ids, out-of-range steps and
 * genotypes that do not fit their layout, and never coerce. Each page has its own versioned engine number.
 */
import {
  DEFAULT_EUK_INPUT, DEFAULT_LAC_INPUT, DEFAULT_TRP_INPUT, eukComponents, evaluateEuk, evaluateLac, evaluateTrp, lacComponents, trpComponents, validateEukInput, validateLacInput, validateTrpInput,
  type EukInput, type LacInput, type RegSystem, type TrpInput,
} from "../biology/geneRegulation";
import { LAYOUTS, MEIOSIS_LAYOUTS, describeIndividual, individual, sexOf, validateIndividual, type Individual, type LayoutId } from "../biology/chromosome";
import { cross, fr, parseRecombination } from "../biology/genetics";
import { buildMeiosis, buildMitosis, defaultMeiosisSettings, validateMeiosisSettings, type MeiosisSettings } from "../biology/cellDivision";
import type { LearningMode } from "../../components/ui/LearningModeSwitch";

export const REGULATION_ENGINE_VERSION = 1;
export const GENETICS_ENGINE_VERSION = 1;
export const CELLDIVISION_ENGINE_VERSION = 1;

const MODES: readonly LearningMode[] = ["explore", "practice", "challenge"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const validMode = (v: unknown): v is LearningMode => typeof v === "string" && (MODES as readonly string[]).includes(v);

// ---- gene regulation ---------------------------------------------------------------------------------------------------------

export type RegulationInputs = {
  subject: "biology"; tool: "regulation";
  system: RegSystem; lac: LacInput; trp: TrpInput; euk: EukInput;
  mode: LearningMode;
  /** Index of the current Challenge perturbation. */
  challenge: number;
  /** Component selected in the diagram of the current system (null = none). */
  selected: string | null;
};
export const DEFAULT_REGULATION_INPUTS: RegulationInputs = { subject: "biology", tool: "regulation", system: "lac", lac: DEFAULT_LAC_INPUT, trp: DEFAULT_TRP_INPUT, euk: DEFAULT_EUK_INPUT, mode: "explore", challenge: 0, selected: null };

export const regulationComponentIds = (r: Pick<RegulationInputs, "system" | "lac" | "trp" | "euk">): string[] =>
  (r.system === "lac" ? lacComponents(r.lac) : r.system === "trp" ? trpComponents(r.trp) : eukComponents(r.euk)).map((c) => c.id);

export function validateRegulationInputs(raw: unknown): RegulationInputs | null {
  if (!isObject(raw) || raw.subject !== "biology" || raw.tool !== "regulation" || !validMode(raw.mode)) return null;
  if (raw.system !== "lac" && raw.system !== "trp" && raw.system !== "euk") return null;
  const lac = validateLacInput(raw.lac), trp = validateTrpInput(raw.trp), euk = validateEukInput(raw.euk);
  if (!lac.ok || !trp.ok || !euk.ok) return null;
  if (typeof raw.challenge !== "number" || !Number.isInteger(raw.challenge) || raw.challenge < 0 || raw.challenge > 10000) return null;
  const out: RegulationInputs = { subject: "biology", tool: "regulation", system: raw.system, lac: lac.value, trp: trp.value, euk: euk.value, mode: raw.mode, challenge: raw.challenge, selected: null };
  if (raw.selected !== null) {
    if (typeof raw.selected !== "string" || !regulationComponentIds(out).includes(raw.selected)) return null;
    out.selected = raw.selected;
  }
  return out;
}
export function describeRegulationAnalysis(i: RegulationInputs): string {
  if (i.system === "lac") {
    const e = evaluateLac(i.lac);
    return `lac operon: lactose ${i.lac.lactose ? "present" : "absent"}, glucose ${i.lac.glucose ? "present" : "absent"}${i.lac.copies.length > 1 ? ", two copies" : ""} → ${e.transcription.label}`.slice(0, 300);
  }
  if (i.system === "trp") return `trp operon: tryptophan ${i.trp.trp} → ${evaluateTrp(i.trp).level.label}`.slice(0, 300);
  return `Eukaryotic regulation → ${evaluateEuk(i.euk).level.label}`.slice(0, 300);
}

// ---- genetics ----------------------------------------------------------------------------------------------------------------

export type GeneticsInputs = {
  subject: "biology"; tool: "genetics";
  parent1: Individual; parent2: Individual;
  /** Recombination fraction between the two linked genes (0–0.5, at most 3 decimals); used only by the linked layout. */
  recombination: number;
  /** 0 parents, 1 gametes, 2 Punnett square, 3 offspring. */
  step: number;
  mode: LearningMode;
};
export const GENETICS_STEPS = 4;

export function defaultParents(layout: LayoutId, r = 0.2): { parent1: Individual; parent2: Individual; recombination: number } {
  switch (layout) {
    case "mono": return { parent1: individual("mono", [["R"], ["r"]]), parent2: individual("mono", [["R"], ["r"]]), recombination: 0.5 };
    case "di": return { parent1: individual("di", [["R"], ["r"]], [["Y"], ["y"]]), parent2: individual("di", [["R"], ["r"]], [["Y"], ["y"]]), recombination: 0.5 };
    case "linked": return { parent1: individual("linked", [["A", "B"], ["a", "b"]]), parent2: individual("linked", [["a", "b"], ["a", "b"]]), recombination: r };
    case "incomplete": return { parent1: individual("incomplete", [["CR"], ["CW"]]), parent2: individual("incomplete", [["CR"], ["CW"]]), recombination: 0.5 };
    case "codominant": return { parent1: individual("codominant", [["LM"], ["LN"]]), parent2: individual("codominant", [["LM"], ["LN"]]), recombination: 0.5 };
    case "abo": return { parent1: individual("abo", [["IA"], ["i"]]), parent2: individual("abo", [["IB"], ["i"]]), recombination: 0.5 };
    case "xlinked": return { parent1: individual("xlinked", [["C"], ["c"]]), parent2: individual("xlinked", [["C"], []]), recombination: 0.5 };
  }
}
export const DEFAULT_GENETICS_INPUTS: GeneticsInputs = { subject: "biology", tool: "genetics", ...defaultParents("mono"), step: 0, mode: "explore" };

export function validateGeneticsInputs(raw: unknown): GeneticsInputs | null {
  if (!isObject(raw) || raw.subject !== "biology" || raw.tool !== "genetics" || !validMode(raw.mode)) return null;
  const p1 = validateIndividual(raw.parent1), p2 = validateIndividual(raw.parent2);
  if (!p1.ok || !p2.ok || p1.value.layout !== p2.value.layout) return null;
  if (!parseRecombination(raw.recombination)) return null;
  if (typeof raw.step !== "number" || !Number.isInteger(raw.step) || raw.step < 0 || raw.step >= GENETICS_STEPS) return null;
  // an X-linked cross is a female (XX) mother and a male (XY) father
  if (p1.value.layout === "xlinked" && (sexOf(p1.value) !== "female" || sexOf(p2.value) !== "male")) return null;
  return { subject: "biology", tool: "genetics", parent1: p1.value, parent2: p2.value, recombination: raw.recombination as number, step: raw.step, mode: raw.mode };
}
export function describeGeneticsAnalysis(i: GeneticsInputs): string {
  const x = cross(i.parent1, i.parent2, parseRecombination(i.recombination) ?? fr(1, 2));
  return `Genetics: ${describeIndividual(i.parent1)} × ${describeIndividual(i.parent2)} → ${x.phenotypicRatio}${LAYOUTS[i.parent1.layout].linked ? ` (r = ${i.recombination})` : ""}`.slice(0, 300);
}

// ---- mitosis and meiosis -----------------------------------------------------------------------------------------------------

export type CellDivisionInputs = {
  subject: "biology"; tool: "celldivision";
  process: "mitosis" | "meiosis";
  individual: Individual;
  settings: MeiosisSettings;
  stage: number;
  mode: LearningMode;
  /** Chromosome selected in the diagram (an id such as "p0h1"). */
  selected: string | null;
  /** Challenge: whether the outcome has been revealed. */
  revealed: boolean;
  /** Recombination fraction used only to compare the illustrated gametes with the expected frequencies (linked layout). */
  recombination: number;
};
const DI = individual("di", [["R"], ["r"]], [["Y"], ["y"]]);
export const DEFAULT_CELLDIVISION_INPUTS: CellDivisionInputs = { subject: "biology", tool: "celldivision", process: "meiosis", individual: DI, settings: defaultMeiosisSettings(DI), stage: 0, mode: "explore", selected: null, revealed: false, recombination: 0.2 };

export const divisionStages = (i: Pick<CellDivisionInputs, "process" | "individual" | "settings">) => (i.process === "mitosis" ? buildMitosis(i.individual) : buildMeiosis(i.individual, i.settings));

export function validateCellDivisionInputs(raw: unknown): CellDivisionInputs | null {
  if (!isObject(raw) || raw.subject !== "biology" || raw.tool !== "celldivision" || !validMode(raw.mode)) return null;
  if (raw.process !== "mitosis" && raw.process !== "meiosis") return null;
  const ind = validateIndividual(raw.individual);
  if (!ind.ok || !(MEIOSIS_LAYOUTS as string[]).includes(ind.value.layout)) return null;
  const settings = validateMeiosisSettings(ind.value, raw.settings);
  if (!settings || typeof raw.revealed !== "boolean" || !parseRecombination(raw.recombination)) return null;
  const stages = divisionStages({ process: raw.process, individual: ind.value, settings });
  if (typeof raw.stage !== "number" || !Number.isInteger(raw.stage) || raw.stage < 0 || raw.stage >= stages.length) return null;
  let selected: string | null = null;
  if (raw.selected !== null) {
    if (typeof raw.selected !== "string") return null;
    const ids = new Set(stages[raw.stage].cells.flatMap((c) => c.chromosomes.map((x) => x.id)));
    if (!ids.has(raw.selected)) return null;
    selected = raw.selected;
  }
  return { subject: "biology", tool: "celldivision", process: raw.process, individual: ind.value, settings, stage: raw.stage, mode: raw.mode, selected, revealed: raw.revealed, recombination: raw.recombination as number };
}
export function describeCellDivisionAnalysis(i: CellDivisionInputs): string {
  return `${i.process === "mitosis" ? "Mitosis" : "Meiosis"}: ${describeIndividual(i.individual)}${i.process === "meiosis" && i.settings.nd.kind !== "none" ? `, nondisjunction in meiosis ${i.settings.nd.kind}` : ""}`.slice(0, 300);
}
