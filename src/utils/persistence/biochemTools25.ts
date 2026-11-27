/**
 * Saved state of the three Stage 25 metabolism tools (persisted pages "fattyacids", "aminometabolism", "fuelmetabolism"; subject "biochemistry").
 * Inputs are the scientific and view state (chain length, selected amino acid, regulation conditions, progression step, selected pathway,
 * metabolite and reaction, display and learning mode). Every derived ledger, equation and tendency is rebuilt from them on open. Validators build
 * new objects from known fields, reject unknown ids and out-of-range values, and never coerce.
 */
import { METABOLITES_BY_ID, PATHWAYS, REACTIONS_BY_ID, SUPPORTED_EVEN_CHAINS, SUPPORTED_ODD_CHAINS, TISSUES, type PathwayId, type TissueId } from "../biochem/metabolism/network";
import { SHUTTLES, type Shuttle } from "../biochem/metabolism/ledger";
import {
  NORMAL_LIPID_CONDITIONS, oxidationSequence, oxidationTotals, synthesisLedger, synthesisSequence, activation, ketoneOxidationAtp, lipidRegulation, type LipidConditions, type Substrate,
} from "../biochem/metabolism/lipids";
import { AMINO_CATABOLISM_BY_ONE, TRANSAMINATION_ONES, UREA_CORE, classifyAminoAcid, ureaEnergy } from "../biochem/metabolism/nitrogen";
import { AMINO_ACID_LIST } from "../biochem/aminoAcids";
import { FUEL_SCENARIOS_BY_ID, MAP_FOCUS, substrateComparison, type MapFocus } from "../biochem/metabolism/fuel";
import type { LearningMode } from "../../components/ui/LearningModeSwitch";
import type { BiochemResults } from "./biochemTools17";

export const FATTYACIDS_ENGINE_VERSION = 1;
export const AMINOMETABOLISM_ENGINE_VERSION = 1;
export const FUELMETABOLISM_ENGINE_VERSION = 1;

const MODES: readonly LearningMode[] = ["explore", "practice", "challenge"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const validMode = (v: unknown): v is LearningMode => typeof v === "string" && (MODES as readonly string[]).includes(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const LEVELS = ["low", "normal", "high"] as const;

// ---- fatty acids -------------------------------------------------------------------------------------------------------------------------

export const FA_VIEWS = ["structure", "activation", "oxidation", "energy", "synthesis", "ketone", "regulation"] as const;
export type FaView = (typeof FA_VIEWS)[number];
export const FA_SUBSTRATES = ["saturated", "oleate"] as const;
export type FaSubstrate = (typeof FA_SUBSTRATES)[number];
export const KETONE_MODES = ["ketogenesis", "ketolysis"] as const;
export type KetoneMode = (typeof KETONE_MODES)[number];
export const KETONE_FORMS = ["acetoacetate", "bhb"] as const;
export type FaKetoneForm = (typeof KETONE_FORMS)[number];
export const ACETYL_SOURCES = ["mitochondrial-citrate", "cytosolic"] as const;
export const FA_CHAINS: readonly number[] = [...SUPPORTED_EVEN_CHAINS, ...SUPPORTED_ODD_CHAINS].sort((a, b) => a - b);
export type FattyAcidInputs = {
  subject: "biochemistry"; tool: "fattyacids"; mode: LearningMode; view: FaView; chain: number; substrate: FaSubstrate;
  activationStep: number; shuttleStep: number; step: number; synthStep: number; acetylSource: (typeof ACETYL_SOURCES)[number];
  ketoneMode: KetoneMode; ketoneForm: FaKetoneForm; ketoneStep: number; conditions: LipidConditions; challenge: number;
};
export const DEFAULT_FATTYACID_INPUTS: FattyAcidInputs = {
  subject: "biochemistry", tool: "fattyacids", mode: "explore", view: "structure", chain: 16, substrate: "saturated", activationStep: 0, shuttleStep: 0, step: 0, synthStep: 0,
  acetylSource: "mitochondrial-citrate", ketoneMode: "ketogenesis", ketoneForm: "acetoacetate", ketoneStep: 0, conditions: NORMAL_LIPID_CONDITIONS, challenge: 0,
};
export const substrateOf = (i: Pick<FattyAcidInputs, "substrate" | "chain">): Substrate => (i.substrate === "oleate" ? { kind: "oleate" } : { kind: "saturated", carbons: i.chain });
function validateConditions(raw: unknown): LipidConditions | null {
  if (!isObject(raw) || Object.keys(raw).length !== 4) return null;
  if (!oneOf(raw.hormone, ["insulin", "balanced", "glucagon"] as const) || !oneOf(raw.energy, LEVELS) || !oneOf(raw.citrate, LEVELS) || !oneOf(raw.acylCoa, LEVELS)) return null;
  return { hormone: raw.hormone, energy: raw.energy, citrate: raw.citrate, acylCoa: raw.acylCoa };
}
export function validateFattyAcidInputs(raw: unknown): FattyAcidInputs | null {
  if (!isObject(raw) || raw.subject !== "biochemistry" || raw.tool !== "fattyacids" || !validMode(raw.mode) || !oneOf(raw.view, FA_VIEWS) || !oneOf(raw.substrate, FA_SUBSTRATES)) return null;
  if (typeof raw.chain !== "number" || !FA_CHAINS.includes(raw.chain)) return null;
  if (raw.substrate === "oleate" && raw.chain !== 18) return null;
  const sub = substrateOf({ substrate: raw.substrate, chain: raw.chain });
  const steps = oxidationSequence(sub).length, synth = SUPPORTED_EVEN_CHAINS.includes(raw.chain as 4) && raw.substrate === "saturated" ? synthesisSequence(raw.chain).length : synthesisSequence(16).length;
  const conditions = validateConditions(raw.conditions);
  if (!conditions || !isInt(raw.activationStep, 0, 3) || !isInt(raw.shuttleStep, 0, 4) || !isInt(raw.step, 0, steps) || !isInt(raw.synthStep, 0, synth)) return null;
  if (!oneOf(raw.acetylSource, ACETYL_SOURCES) || !oneOf(raw.ketoneMode, KETONE_MODES) || !oneOf(raw.ketoneForm, KETONE_FORMS) || !isInt(raw.ketoneStep, 0, 5) || !isInt(raw.challenge, 0, 10000)) return null;
  return {
    subject: "biochemistry", tool: "fattyacids", mode: raw.mode, view: raw.view, chain: raw.chain, substrate: raw.substrate, activationStep: raw.activationStep, shuttleStep: raw.shuttleStep, step: raw.step, synthStep: raw.synthStep,
    acetylSource: raw.acetylSource, ketoneMode: raw.ketoneMode, ketoneForm: raw.ketoneForm, ketoneStep: raw.ketoneStep, conditions, challenge: raw.challenge,
  };
}
export const describeFattyAcidAnalysis = (i: FattyAcidInputs) => {
  const what = i.substrate === "oleate" ? "oleate (C18:1)" : `C${i.chain}:0`;
  const v: Record<FaView, string> = { structure: `Fatty-acid structure ${what}`, activation: `Fatty-acid activation and carnitine shuttle, ${what}`, oxidation: `β-Oxidation of ${what}: step ${i.step}`, energy: `Fatty-acid oxidation energy ledger, ${what}`, synthesis: `Fatty-acid synthesis: step ${i.synthStep}`, ketone: `Ketone bodies (${i.ketoneMode})`, regulation: "Fatty-acid metabolism regulation (qualitative)" };
  return v[i.view].slice(0, 300);
};

// ---- amino acids and urea cycle ----------------------------------------------------------------------------------------------------------

export const AA_VIEWS = ["structure", "transamination", "deamination", "skeleton", "nitrogen", "urea"] as const;
export type AaView = (typeof AA_VIEWS)[number];
export const AA_ONES: readonly string[] = AMINO_ACID_LIST.map((a) => a.one);
export const NITROGEN_EXAMPLE_IDS = ["glucose-alanine", "glutamine-transport", "liver-urea", "brain-ammonium"] as const;
export type AminoInputs = {
  subject: "biochemistry"; tool: "aminometabolism"; mode: LearningMode; view: AaView; aa: string; transSubstrate: string; plpStep: number;
  gdhDirection: "deamination" | "amination"; gdhCofactor: "nad" | "nadp"; ureaStep: number; selected: string | null; nag: boolean; arginine: "normal" | "high";
  nitrogenExample: (typeof NITROGEN_EXAMPLE_IDS)[number]; challenge: number;
};
export const DEFAULT_AMINO_INPUTS: AminoInputs = {
  subject: "biochemistry", tool: "aminometabolism", mode: "explore", view: "structure", aa: "A", transSubstrate: "A", plpStep: 0, gdhDirection: "deamination", gdhCofactor: "nad", ureaStep: 0, selected: null,
  nag: true, arginine: "normal", nitrogenExample: "glucose-alanine", challenge: 0,
};
export function validateAminoInputs(raw: unknown): AminoInputs | null {
  if (!isObject(raw) || raw.subject !== "biochemistry" || raw.tool !== "aminometabolism" || !validMode(raw.mode) || !oneOf(raw.view, AA_VIEWS)) return null;
  if (typeof raw.aa !== "string" || !AA_ONES.includes(raw.aa) || typeof raw.transSubstrate !== "string" || !TRANSAMINATION_ONES.includes(raw.transSubstrate)) return null;
  if (!isInt(raw.plpStep, 0, 8) || !oneOf(raw.gdhDirection, ["deamination", "amination"] as const) || !oneOf(raw.gdhCofactor, ["nad", "nadp"] as const) || !isInt(raw.ureaStep, 0, UREA_CORE.length)) return null;
  const selected = raw.selected === null ? null : typeof raw.selected === "string" && (UREA_CORE as readonly string[]).includes(raw.selected) ? raw.selected : undefined;
  if (selected === undefined || typeof raw.nag !== "boolean" || !oneOf(raw.arginine, ["normal", "high"] as const) || !oneOf(raw.nitrogenExample, NITROGEN_EXAMPLE_IDS) || !isInt(raw.challenge, 0, 10000)) return null;
  return {
    subject: "biochemistry", tool: "aminometabolism", mode: raw.mode, view: raw.view, aa: raw.aa, transSubstrate: raw.transSubstrate, plpStep: raw.plpStep, gdhDirection: raw.gdhDirection, gdhCofactor: raw.gdhCofactor,
    ureaStep: raw.ureaStep, selected, nag: raw.nag, arginine: raw.arginine, nitrogenExample: raw.nitrogenExample, challenge: raw.challenge,
  };
}
export const describeAminoAnalysis = (i: AminoInputs) => {
  const a = AMINO_ACID_LIST.find((x) => x.one === i.aa)!;
  const v: Record<AaView, string> = { structure: `Amino-acid catabolism: ${a.name}`, transamination: `Transamination of ${AMINO_ACID_LIST.find((x) => x.one === i.transSubstrate)!.name}`, deamination: "Oxidative deamination by glutamate dehydrogenase", skeleton: `Carbon-skeleton destination of ${a.name}`, nitrogen: "Nitrogen handling between tissues", urea: `Urea cycle: ${i.ureaStep} of ${UREA_CORE.length} steps` };
  return v[i.view].slice(0, 300);
};

// ---- integrated fuel map -----------------------------------------------------------------------------------------------------------------

export const FUEL_DISPLAYS = ["map", "ledger", "scenario", "compare"] as const;
export type FuelDisplay = (typeof FUEL_DISPLAYS)[number];
export type FuelInputs = {
  subject: "biochemistry"; tool: "fuelmetabolism"; mode: LearningMode; display: FuelDisplay; focus: MapFocus; pathway: PathwayId | null; metabolite: string | null; reaction: string | null;
  scenario: string; tissue: TissueId; shuttle: Shuttle; challenge: number;
};
export const DEFAULT_FUEL_INPUTS: FuelInputs = { subject: "biochemistry", tool: "fuelmetabolism", mode: "explore", display: "map", focus: "overview", pathway: null, metabolite: null, reaction: null, scenario: "baseline", tissue: "liver", shuttle: "malate-aspartate", challenge: 0 };
export function validateFuelInputs(raw: unknown): FuelInputs | null {
  if (!isObject(raw) || raw.subject !== "biochemistry" || raw.tool !== "fuelmetabolism" || !validMode(raw.mode) || !oneOf(raw.display, FUEL_DISPLAYS) || !oneOf(raw.focus, Object.keys(MAP_FOCUS) as MapFocus[])) return null;
  const pathway = raw.pathway === null ? null : oneOf(raw.pathway, Object.keys(PATHWAYS) as PathwayId[]) ? raw.pathway : undefined;
  const metabolite = raw.metabolite === null ? null : typeof raw.metabolite === "string" && raw.metabolite in METABOLITES_BY_ID ? raw.metabolite : undefined;
  const reaction = raw.reaction === null ? null : typeof raw.reaction === "string" && raw.reaction in REACTIONS_BY_ID ? raw.reaction : undefined;
  if (pathway === undefined || metabolite === undefined || reaction === undefined) return null;
  if (typeof raw.scenario !== "string" || !(raw.scenario in FUEL_SCENARIOS_BY_ID) || !oneOf(raw.tissue, Object.keys(TISSUES) as TissueId[]) || !oneOf(raw.shuttle, Object.keys(SHUTTLES) as Shuttle[]) || !isInt(raw.challenge, 0, 10000)) return null;
  return { subject: "biochemistry", tool: "fuelmetabolism", mode: raw.mode, display: raw.display, focus: raw.focus, pathway, metabolite, reaction, scenario: raw.scenario, tissue: raw.tissue, shuttle: raw.shuttle, challenge: raw.challenge };
}
export const describeFuelAnalysis = (i: FuelInputs) => `Integrated fuel map: ${FUEL_SCENARIOS_BY_ID[i.scenario].title}, ${MAP_FOCUS[i.focus].label}`.slice(0, 300);

// ---- assumptions and summaries -------------------------------------------------------------------------------------------------------------

export const LIPID_ASSUMPTIONS = [
  "Stoichiometry comes from the shared network (neutral-acid bookkeeping: NAD⁺ as a cation, explicit H⁺). Pathways are stoichiometry plus curated qualitative regulation; no rate, concentration or flux is computed.",
  "ATP equivalents use the Stage 18 convention (about 2.5 ATP per NADH, 1.5 per FADH₂, 10 per acetyl-CoA through the cycle); they are conventions, not measurements. High-energy bonds count phosphoanhydride bonds only.",
  "β-Oxidation itself makes acetyl-CoA, NADH and FADH₂ and no ATP; the ATP estimate arises in the citric acid cycle and respiratory chain.",
  "Supported quantitatively: even-chain saturated C4–C18 and oleate (cis-Δ9). Odd-chain products are counted but their ATP is not; polyunsaturated, branched, very-long-chain and modified fatty acids are not supported.",
  "The 8 ATP for acetyl-CoA export and the NADPH from malic enzyme apply only when acetyl-CoA is exported from mitochondria as citrate; the pentose phosphate pathway is not modelled.",
];
export const AMINO_ASSUMPTIONS = [
  "Reactions shown in full (transamination, glutamate dehydrogenase, glutaminase, glutamine synthetase, the urea cycle) are stoichiometric and balanced in the shared network. Carbon-skeleton and nitrogen routes for individual amino acids are curated textbook summaries: no intermediate enzymes are invented.",
  "Glucogenic and ketogenic are the standard nominal classifications; a glucogenic label does not mean net glucose is made in every condition.",
  "Glutamate dehydrogenase is drawn in the deamination direction with NAD⁺ (NADP⁺ shown as a variant); it is reversible in cells.",
  "Urea-cycle nitrogen tracing follows the accepted mechanism; stoichiometry alone cannot identify which nitrogen is which. The model predicts no ammonia concentration, disease severity or patient outcome.",
  "Three ATP molecules and four high-energy bonds are counted for the urea cycle; NADH recovered from fumarate is shown separately as an estimate, never subtracted from that accounting.",
];
export const FUEL_ASSUMPTIONS = [
  "A connection on the map is a stoichiometric or curated relationship, not a flux prediction. Scenario labels give a direction only; where the model cannot decide, it says so and lists the missing information.",
  "A shared metabolite or energy carrier has one identity (acetyl-CoA, oxaloacetate, α-ketoglutarate, succinyl-CoA, fumarate, ATP, NADH, FADH₂, NADPH, CoA) and is counted once per pathway pass; each pathway's own passes are added.",
  "NADPH is a separate pool from NADH and FADH₂. Nitrogen disposal is not an ATP-producing pathway.",
  "Not every cell performs every pathway: hepatic and extrahepatic activities are stated separately and are coarse (liver versus heart/muscle/kidney/brain).",
  "ATP totals are estimates under the stated Stage 18 convention (about 32 per glucose, 106 per palmitate).",
];

const res = (engineVersion: number, assumptions: string[], headline: string[], check: number, checkLabel: string): BiochemResults =>
  ({ engineVersion, headline: headline.map((h) => h.slice(0, 390)), assumptions, check, checkLabel });

export function summarizeFattyAcid(i: FattyAcidInputs): BiochemResults | null {
  const sub = substrateOf(i), t = oxidationTotals(sub), act = activation(i.chain);
  const lines: string[] = [];
  if (t) lines.push(`${i.substrate === "oleate" ? "Oleate (C18:1)" : `C${i.chain}:0`}: ${t.cycles} cycles, ${t.acetylCoA} acetyl-CoA${t.propionylCoA ? `, ${t.propionylCoA} propionyl-CoA` : ""}, ${t.nadh} NADH, ${t.fadh2} FADH₂; ATP estimate ${t.atp ? `${t.atp.total} (conventional, net of ${t.activationAtpEquivalents} for activation)` : "not calculated for this case"}`);
  if (i.view === "activation") lines.push(`Activation: ${act.atpMolecules} ATP molecule, ${act.bondsAfterPyrophosphatase} high-energy bonds, ${act.atpEquivalents} ATP equivalents`);
  if (i.view === "synthesis") { const s = synthesisLedger(16, i.acetylSource)!; lines.push(`Palmitate synthesis: ${s.malonylCoA} malonyl-CoA, ${s.nadphConsumed} NADPH, ${s.atpForMalonylCoA} ATP (malonyl-CoA)${s.atpForAcetylCoAExport ? ` + ${s.atpForAcetylCoAExport} ATP (acetyl-CoA export)` : ""}`); }
  if (i.view === "ketone") lines.push(`Oxidizing one ${i.ketoneForm === "bhb" ? "β-hydroxybutyrate" : "acetoacetate"}: ${ketoneOxidationAtp(i.ketoneForm).total} ATP equivalents (estimate)`);
  if (i.view === "regulation") { const r = lipidRegulation(i.conditions); lines.push(`Qualitative regulation: ACC ${r.acc}, malonyl-CoA ${r.malonylCoA}, CPT I ${r.cpt1}, oxidation ${r.oxidation}, synthesis ${r.synthesis}`); }
  return res(FATTYACIDS_ENGINE_VERSION, LIPID_ASSUMPTIONS, lines.length ? lines : ["Fatty-acid metabolism"], t?.atp?.total ?? act.atpEquivalents, t?.atp ? "estimated ATP equivalents (complete oxidation)" : "ATP equivalents spent on activation");
}
export function summarizeAmino(i: AminoInputs): BiochemResults | null {
  const a = AMINO_ACID_LIST.find((x) => x.one === i.aa)!, c = AMINO_CATABOLISM_BY_ONE[i.aa], e = ureaEnergy();
  const lines = [`${a.name}: ${classifyAminoAcid(i.aa)}; carbon skeleton enters at ${c.endpoints.join(", ")}`, `Urea cycle: ${e.atpMolecules} ATP molecules, ${e.highEnergyBonds} high-energy bonds`];
  return res(AMINOMETABOLISM_ENGINE_VERSION, AMINO_ASSUMPTIONS, lines, e.highEnergyBonds, "high-energy phosphate bonds spent per urea");
}
export function summarizeFuel(i: FuelInputs): BiochemResults | null {
  const rows = substrateComparison(i.shuttle);
  const lines = [`Estimated ATP equivalents (conventional): ${rows.map((r) => `${r.label} ${r.atp}`).join(", ")}`, `Scenario: ${FUEL_SCENARIOS_BY_ID[i.scenario].title}`];
  return res(FUELMETABOLISM_ENGINE_VERSION, FUEL_ASSUMPTIONS, lines, rows[1].atp, "estimated ATP equivalents per palmitate");
}
