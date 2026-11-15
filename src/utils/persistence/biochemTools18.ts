/**
 * Saved state of the Stage 18 metabolic-pathway tools (persisted pages "glycolysis", "gluconeogenesis", "tca", "etc", "metabolism";
 * subject "biochemistry"). Inputs are the scientific and view state: pathway position, selected reaction or metabolite, regulatory signals,
 * respiratory-chain donor and condition, shuttle, learning mode. The ledger, equations, tendencies and outcomes are rebuilt from them on open.
 * Validators build new objects from known fields, reject unknown ids and out-of-range values, and never coerce.
 */
import { ENZYMES_BY_ID, METABOLITES_BY_ID, PATHWAYS, REACTIONS_BY_ID, SIGNALS, pathwayReactions, type PathwayId, type SignalId, type SignalLevel } from "../biochem/metabolism/network";
import { CONDITIONS_BY_ID } from "../biochem/metabolism/etc";
import { glucoseLedger, glycolysisAtpBreakdown, pathwayNet, carriersOf, SHUTTLES, type Shuttle } from "../biochem/metabolism/ledger";
import { MAP_SCENARIOS } from "../biochem/metabolism/learning";
import { NORMAL_SIGNALS, REG_SCENARIOS_BY_ID, SIGNAL_IDS, SUBSTRATE_CYCLES, comparePathways, enzymeTendency, type CycleId, type Signals } from "../biochem/metabolism/regulation";
import { etcOutcome, type Donor } from "../biochem/metabolism/etc";
import type { LearningMode } from "../../components/ui/LearningModeSwitch";
import type { BiochemResults } from "./biochemTools17";

export const GLYCOLYSIS_ENGINE_VERSION = 1;
export const GLUCONEOGENESIS_ENGINE_VERSION = 1;
export const TCA_ENGINE_VERSION = 1;
export const ETC_ENGINE_VERSION = 1;
export const METABOLISM_ENGINE_VERSION = 1;

const MODES: readonly LearningMode[] = ["explore", "practice", "challenge"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const validMode = (v: unknown): v is LearningMode => typeof v === "string" && (MODES as readonly string[]).includes(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const LEVELS: readonly SignalLevel[] = ["low", "normal", "high"];

function validateSignals(raw: unknown): Signals | null {
  if (!isObject(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== SIGNAL_IDS.length || !SIGNAL_IDS.every((k) => keys.includes(k))) return null;
  const out = { ...NORMAL_SIGNALS };
  for (const k of SIGNAL_IDS) { const v = raw[k]; if (!oneOf(v, LEVELS)) return null; out[k as SignalId] = v; }
  return out;
}
const reactionIn = (v: unknown, pathway: PathwayId): v is string => typeof v === "string" && pathwayReactions(pathway).some((x) => x.reaction.id === v);
const nullableReaction = (v: unknown, pathway: PathwayId): string | null | undefined => (v === null ? null : reactionIn(v, pathway) ? v : undefined);

// ---- glycolysis -------------------------------------------------------------------------------------------------------------------

export const GLYCOLYSIS_VIEWS = ["pathway", "energy", "regulation"] as const;
export type GlycolysisView = (typeof GLYCOLYSIS_VIEWS)[number];
export type GlycolysisInputs = { subject: "biochemistry"; tool: "glycolysis"; mode: LearningMode; view: GlycolysisView; step: number; selected: string | null; signals: Signals; challenge: number };
export const DEFAULT_GLYCOLYSIS_INPUTS: GlycolysisInputs = { subject: "biochemistry", tool: "glycolysis", mode: "explore", view: "pathway", step: 0, selected: null, signals: NORMAL_SIGNALS, challenge: 0 };
export function validateGlycolysisInputs(raw: unknown): GlycolysisInputs | null {
  if (!isObject(raw) || raw.subject !== "biochemistry" || raw.tool !== "glycolysis" || !validMode(raw.mode) || !oneOf(raw.view, GLYCOLYSIS_VIEWS)) return null;
  const selected = nullableReaction(raw.selected, "glycolysis"), signals = validateSignals(raw.signals);
  if (selected === undefined || !signals || !isInt(raw.step, 0, 10) || !isInt(raw.challenge, 0, 10000)) return null;
  return { subject: "biochemistry", tool: "glycolysis", mode: raw.mode, view: raw.view, step: raw.step, selected, signals, challenge: raw.challenge };
}
export const describeGlycolysisAnalysis = (i: GlycolysisInputs) =>
  i.view === "regulation" ? "Glycolysis regulation (curated qualitative signals)" : i.view === "energy" ? "Glycolysis energy ledger" : `Glycolysis: ${i.step} of 10 reactions${i.selected ? `, ${REACTIONS_BY_ID[i.selected].name}` : ""}`.slice(0, 300);

// ---- gluconeogenesis --------------------------------------------------------------------------------------------------------------

export const GNG_VIEWS = ["pathway", "compare", "regulation"] as const;
export type GngView = (typeof GNG_VIEWS)[number];
const CYCLE_IDS = SUBSTRATE_CYCLES.map((c) => c.id) as CycleId[];
export type GluconeogenesisInputs = { subject: "biochemistry"; tool: "gluconeogenesis"; mode: LearningMode; view: GngView; step: number; selected: string | null; scenario: string; signals: Signals; cycle: CycleId; challenge: number };
export const DEFAULT_GLUCONEOGENESIS_INPUTS: GluconeogenesisInputs = { subject: "biochemistry", tool: "gluconeogenesis", mode: "explore", view: "pathway", step: 0, selected: null, scenario: "reference", signals: NORMAL_SIGNALS, cycle: "f6p-f16bp", challenge: 0 };
export function validateGluconeogenesisInputs(raw: unknown): GluconeogenesisInputs | null {
  if (!isObject(raw) || raw.subject !== "biochemistry" || raw.tool !== "gluconeogenesis" || !validMode(raw.mode) || !oneOf(raw.view, GNG_VIEWS)) return null;
  const selected = nullableReaction(raw.selected, "gluconeogenesis"), signals = validateSignals(raw.signals);
  if (selected === undefined || !signals || !isInt(raw.step, 0, 14) || !isInt(raw.challenge, 0, 10000)) return null;
  if (typeof raw.scenario !== "string" || !(raw.scenario in REG_SCENARIOS_BY_ID) || !oneOf(raw.cycle, CYCLE_IDS)) return null;
  return { subject: "biochemistry", tool: "gluconeogenesis", mode: raw.mode, view: raw.view, step: raw.step, selected, scenario: raw.scenario, signals, cycle: raw.cycle, challenge: raw.challenge };
}
export const describeGluconeogenesisAnalysis = (i: GluconeogenesisInputs) =>
  i.view === "compare" ? "Glycolysis and gluconeogenesis compared" : i.view === "regulation" ? `Gluconeogenesis regulation: ${REG_SCENARIOS_BY_ID[i.scenario].title}`.slice(0, 300) : `Gluconeogenesis: ${i.step} of 14 reactions`;

// ---- pyruvate oxidation and citric acid cycle -------------------------------------------------------------------------------------

export const TCA_VIEWS = ["pdh", "cycle", "energy"] as const;
export type TcaView = (typeof TCA_VIEWS)[number];
export type TcaInputs = { subject: "biochemistry"; tool: "tca"; mode: LearningMode; view: TcaView; pdhStep: number; step: number; turns: 1 | 2; selected: string | null; signals: Signals; challenge: number };
export const DEFAULT_TCA_INPUTS: TcaInputs = { subject: "biochemistry", tool: "tca", mode: "explore", view: "cycle", pdhStep: 0, step: 0, turns: 1, selected: null, signals: NORMAL_SIGNALS, challenge: 0 };
export function validateTcaInputs(raw: unknown): TcaInputs | null {
  if (!isObject(raw) || raw.subject !== "biochemistry" || raw.tool !== "tca" || !validMode(raw.mode) || !oneOf(raw.view, TCA_VIEWS)) return null;
  const sel = raw.selected === null ? null : (typeof raw.selected === "string" && (reactionIn(raw.selected, "tca") || raw.selected === "PDH") ? raw.selected : undefined);
  const signals = validateSignals(raw.signals);
  if (sel === undefined || !signals || !(raw.turns === 1 || raw.turns === 2) || !isInt(raw.step, 0, raw.turns * 8) || !isInt(raw.pdhStep, 0, 5) || !isInt(raw.challenge, 0, 10000)) return null;
  return { subject: "biochemistry", tool: "tca", mode: raw.mode, view: raw.view, pdhStep: raw.pdhStep, step: raw.step, turns: raw.turns, selected: sel, signals, challenge: raw.challenge };
}
export const describeTcaAnalysis = (i: TcaInputs) => i.view === "pdh" ? `Pyruvate dehydrogenase complex, stage ${i.pdhStep} of 5` : i.view === "energy" ? `Citric acid cycle energy carriers, ${i.turns} turn${i.turns === 1 ? "" : "s"}` : `Citric acid cycle: ${i.step} of ${i.turns * 8} reactions`;

// ---- respiratory chain ------------------------------------------------------------------------------------------------------------

export const ETC_VIEWS = ["chain", "inhibitors", "yield"] as const;
export type EtcView = (typeof ETC_VIEWS)[number];
export type DonorChoice = Donor | "both";
export type EtcInputs = { subject: "biochemistry"; tool: "etc"; mode: LearningMode; view: EtcView; donor: DonorChoice; condition: string; step: number; shuttle: Shuttle; challenge: number };
export const DEFAULT_ETC_INPUTS: EtcInputs = { subject: "biochemistry", tool: "etc", mode: "explore", view: "chain", donor: "nadh", condition: "control", step: 0, shuttle: "malate-aspartate", challenge: 0 };
export function validateEtcInputs(raw: unknown): EtcInputs | null {
  if (!isObject(raw) || raw.subject !== "biochemistry" || raw.tool !== "etc" || !validMode(raw.mode) || !oneOf(raw.view, ETC_VIEWS)) return null;
  if (!oneOf(raw.donor, ["nadh", "succinate", "both"] as const) || typeof raw.condition !== "string" || !(raw.condition in CONDITIONS_BY_ID)) return null;
  if (!isInt(raw.step, 0, 7) || !oneOf(raw.shuttle, Object.keys(SHUTTLES) as Shuttle[]) || !isInt(raw.challenge, 0, 10000)) return null;
  return { subject: "biochemistry", tool: "etc", mode: raw.mode, view: raw.view, donor: raw.donor, condition: raw.condition, step: raw.step, shuttle: raw.shuttle, challenge: raw.challenge };
}
export const describeEtcAnalysis = (i: EtcInputs) => `Respiratory chain: ${CONDITIONS_BY_ID[i.condition].title}, ${i.donor === "both" ? "NADH and succinate" : i.donor === "nadh" ? "NADH" : "succinate"}`.slice(0, 300);

// ---- integrated map ---------------------------------------------------------------------------------------------------------------

export const MAP_LEVELS = ["pathway", "reaction"] as const;
export type MapLevel = (typeof MAP_LEVELS)[number];
export type MetabolismInputs = { subject: "biochemistry"; tool: "metabolism"; mode: LearningMode; level: MapLevel; pathway: PathwayId | null; reaction: string | null; metabolite: string | null; shuttle: Shuttle; scenario: string; challenge: number };
export const DEFAULT_METABOLISM_INPUTS: MetabolismInputs = { subject: "biochemistry", tool: "metabolism", mode: "explore", level: "pathway", pathway: null, reaction: null, metabolite: null, shuttle: "malate-aspartate", scenario: "baseline", challenge: 0 };
export function validateMetabolismInputs(raw: unknown): MetabolismInputs | null {
  if (!isObject(raw) || raw.subject !== "biochemistry" || raw.tool !== "metabolism" || !validMode(raw.mode) || !oneOf(raw.level, MAP_LEVELS)) return null;
  const pathway = raw.pathway === null ? null : oneOf(raw.pathway, Object.keys(PATHWAYS) as PathwayId[]) ? raw.pathway : undefined;
  const reaction = raw.reaction === null ? null : typeof raw.reaction === "string" && raw.reaction in REACTIONS_BY_ID ? raw.reaction : undefined;
  const metabolite = raw.metabolite === null ? null : typeof raw.metabolite === "string" && raw.metabolite in METABOLITES_BY_ID ? raw.metabolite : undefined;
  if (pathway === undefined || reaction === undefined || metabolite === undefined) return null;
  if (!oneOf(raw.shuttle, Object.keys(SHUTTLES) as Shuttle[]) || typeof raw.scenario !== "string" || !MAP_SCENARIOS.some((s) => s.id === raw.scenario) || !isInt(raw.challenge, 0, 10000)) return null;
  return { subject: "biochemistry", tool: "metabolism", mode: raw.mode, level: raw.level, pathway, reaction, metabolite, shuttle: raw.shuttle, scenario: raw.scenario, challenge: raw.challenge };
}
export const describeMetabolismAnalysis = (i: MetabolismInputs) => `Metabolic map: ${MAP_SCENARIOS.find((s) => s.id === i.scenario)!.title}${i.pathway ? `, ${PATHWAYS[i.pathway].label}` : ""}`.slice(0, 300);

// ---- assumptions and summaries ----------------------------------------------------------------------------------------------------

export const CONVENTION =
  "Bookkeeping convention: metabolites are written as neutral acid forms (NAD⁺ as a cation, H⁺ explicit) so that atoms and charge balance exactly; at cellular pH most are ionized, which changes proton bookkeeping but not carbon, phosphate or electron accounting.";
export const METABOLIC_ASSUMPTIONS = [
  CONVENTION,
  "The network is stoichiometry plus curated qualitative regulation. It is not a kinetic or flux model: no rates, concentrations, time courses or realistic cellular fluxes are computed.",
  "Regulation labels (higher, lower, reference, uncertain) mean the direction in which curated signals push an enzyme's net activity relative to an all-normal reference; conflicting signals give 'uncertain'.",
  "ATP, GTP and their diphosphates are interchangeable for accounting (nucleoside diphosphate kinase); ATP figures for oxidative phosphorylation are estimates (about 2.5 per NADH and 1.5 per FADH₂ from 10 and 6 H⁺ pumped and about 4 H⁺ per ATP).",
  "Eukaryotic compartmentation is assumed (cytosol, mitochondrial matrix, inner membrane); tissue-specific enzymes such as glucose-6-phosphatase are present only in some tissues.",
];

const res = (engineVersion: number, headline: string[], check: number, checkLabel: string): BiochemResults =>
  ({ engineVersion, headline: headline.map((h) => h.slice(0, 390)), assumptions: METABOLIC_ASSUMPTIONS, check, checkLabel });

export function summarizeGlycolysis(i: GlycolysisInputs): BiochemResults | null {
  const b = glycolysisAtpBreakdown();
  if (i.view === "regulation") {
    const pfk = enzymeTendency("pfk1", i.signals), pk = enzymeTendency("pk", i.signals);
    return res(GLYCOLYSIS_ENGINE_VERSION, [`PFK-1: ${pfk.tendency}; pyruvate kinase: ${pk.tendency} (qualitative, relative to the reference state)`], b.net, "net ATP per glucose (stoichiometry)");
  }
  const done = carriersOf(pathwayNet("glycolysis", "glucose", i.step));
  return res(GLYCOLYSIS_ENGINE_VERSION, [`Glycolysis: ${b.invested} ATP invested, ${b.produced} made, ${b.net} net; 2 NADH`, `After ${i.step} of 10 reactions: ATP ${done.atp >= 0 ? "+" : ""}${done.atp}, NADH ${done.nadh}`], b.net, "net ATP per glucose");
}
export function summarizeGluconeogenesis(i: GluconeogenesisInputs): BiochemResults | null {
  const c = carriersOf(pathwayNet("gluconeogenesis"));
  const cmp = comparePathways(i.signals);
  return res(GLUCONEOGENESIS_ENGINE_VERSION, [`2 pyruvate → glucose: ${-c.atp} ATP + ${-c.gtp} GTP + ${-c.nadh} NADH consumed`, `Curated regulation: ${cmp.verdict.replace(/-/g, " ")}`], -c.ntpEquivalents, "NTP consumed per glucose");
}
export function summarizeTca(i: TcaInputs): BiochemResults | null {
  const t = carriersOf(pathwayNet("tca", "event"));
  return res(TCA_ENGINE_VERSION, [`One turn: ${t.nadh} NADH, ${t.fadh2} FADH₂, ${t.gtp} GTP, ${t.co2} CO₂`, i.view === "energy" ? `${i.turns} turn${i.turns === 1 ? "" : "s"} shown` : `Position: ${i.step} of ${i.turns * 8}`], t.nadh, "NADH per turn");
}
export function summarizeEtc(i: EtcInputs): BiochemResults | null {
  const donors: Donor[] = i.donor === "both" ? ["nadh", "succinate"] : [i.donor];
  const o = etcOutcome(donors, i.condition);
  return res(ETC_ENGINE_VERSION, [`${CONDITIONS_BY_ID[i.condition].title}: electron flow ${o.electronFlow}, gradient ${o.gradient}, ATP synthesis ${o.atpSynthesis} (qualitative)`], o.donors.reduce((s, d) => s + (d.flows ? d.protonsPerPair : 0), 0), "H⁺ pumped per electron pair (all flowing donors)");
}
export function summarizeMetabolism(i: MetabolismInputs): BiochemResults | null {
  const g = glucoseLedger(i.shuttle);
  return res(METABOLISM_ENGINE_VERSION, [`Complete glucose oxidation: ${g.co2} CO₂, about ${g.totalAtp} ATP (estimate, ${SHUTTLES[i.shuttle].label})`], g.totalAtp, "estimated ATP per glucose");
}
export { ENZYMES_BY_ID, SIGNALS };
