/**
 * Saved state of the Stage 23 Biology tools (persisted pages "membrane", "signaling", "neuron"; subject "biology").
 *
 * Inputs are the scientific state: concentrations, mechanisms, perturbations, electrical parameters, the step or simulation time
 * shown, the learning mode and the component selected. Every derived quantity (Nernst potentials, fluxes, pathway states, the
 * action-potential trace and its phases) is rebuilt from them on open, never read back. Validators build new objects from known
 * fields, reject unknown ids, out-of-range values and contradictory combinations, and never coerce.
 */
import {
  DEFAULT_BILAYER, DEFAULT_ION_EXPLORER, DEFAULT_OSMOSIS, DEFAULT_PASSIVE, DEFAULT_SGLT, SGLT_STEPS, PUMP_PERTURBATIONS, NAK_STEPS, pumpMaxStep,
  validateBilayer, validateIonExplorer, validateOsmosis, validatePassive, validateSglt,
  type BilayerState, type IonExplorerInput, type OsmosisInput, type PassiveInput, type PumpPerturbation, type SgltInput,
} from "../biology/membrane23";
import { DEFAULT_SIGNALING, SYSTEMS, validateSignaling, type SignalingInput } from "../biology/signaling23";
import {
  DEFAULT_HH, DEFAULT_PASSIVE_MEMBRANE, DEFAULT_SUMMATION, DEFAULT_SYNAPSE, NEURON_PARTS, propagationMaxStep, validateHh, validatePassiveMembrane, validateSummation, validateSynapse,
  type HhInput, type PartId, type PassiveMembraneInput, type SummationInput, type SynapseInput,
} from "../biology/neuron23";
import type { LearningMode } from "../../components/ui/LearningModeSwitch";

export const MEMBRANE_ENGINE_VERSION = 1;
export const SIGNALING_ENGINE_VERSION = 1;
export const NEURON_ENGINE_VERSION = 1;

const MODES: readonly LearningMode[] = ["explore", "practice", "challenge"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const validMode = (v: unknown): v is LearningMode => typeof v === "string" && (MODES as readonly string[]).includes(v);
const validChallenge = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10000;

// ---- membranes and transport -----------------------------------------------------------------------------------------------------

export type MembraneSection = "bilayer" | "passive" | "ions" | "active" | "osmosis";
export const MEMBRANE_SECTIONS: readonly MembraneSection[] = ["bilayer", "passive", "ions", "active", "osmosis"];
export type MembraneProtein = "channel" | "carrier" | "pump" | "sglt";
const PROTEINS_BY_SECTION: Record<MembraneSection, Array<MembraneProtein | null>> = {
  bilayer: [null], passive: [null, "channel", "carrier"], ions: [null, "channel"], active: [null, "pump", "sglt"], osmosis: [null],
};
export type ActiveTransporter = "nak" | "sglt";

export type MembraneInputs = {
  subject: "biology"; tool: "membrane";
  section: MembraneSection;
  bilayer: BilayerState;
  passive: PassiveInput;
  ions: IonExplorerInput;
  active: { transporter: ActiveTransporter; pumpStep: number; pumpPerturbation: PumpPerturbation; sgltStep: number; sglt: SgltInput };
  osmosis: OsmosisInput;
  /** Transport protein selected in the current section's diagram (the bilayer section selects through `bilayer.selected`). */
  selectedProtein: MembraneProtein | null;
  mode: LearningMode;
  challenge: number;
};
export const DEFAULT_MEMBRANE_INPUTS: MembraneInputs = {
  subject: "biology", tool: "membrane", section: "bilayer", bilayer: DEFAULT_BILAYER, passive: DEFAULT_PASSIVE, ions: DEFAULT_ION_EXPLORER,
  active: { transporter: "nak", pumpStep: 0, pumpPerturbation: "none", sgltStep: 0, sglt: DEFAULT_SGLT }, osmosis: DEFAULT_OSMOSIS, selectedProtein: null, mode: "explore", challenge: 0,
};

export function validateMembraneInputs(raw: unknown): MembraneInputs | null {
  if (!isObject(raw) || raw.subject !== "biology" || raw.tool !== "membrane" || !validMode(raw.mode) || !validChallenge(raw.challenge)) return null;
  if (typeof raw.section !== "string" || !(MEMBRANE_SECTIONS as readonly string[]).includes(raw.section)) return null;
  const section = raw.section as MembraneSection;
  const bilayer = validateBilayer(raw.bilayer), passive = validatePassive(raw.passive), ions = validateIonExplorer(raw.ions), osmosis = validateOsmosis(raw.osmosis);
  if (!bilayer.ok || !passive.ok || !ions.ok || !osmosis.ok) return null;
  const a = raw.active;
  if (!isObject(a) || (a.transporter !== "nak" && a.transporter !== "sglt")) return null;
  if (typeof a.pumpPerturbation !== "string" || !PUMP_PERTURBATIONS.some((p) => p.id === a.pumpPerturbation)) return null;
  const pert = a.pumpPerturbation as PumpPerturbation;
  if (typeof a.pumpStep !== "number" || !Number.isInteger(a.pumpStep) || a.pumpStep < 0 || a.pumpStep >= NAK_STEPS || a.pumpStep > pumpMaxStep(pert)) return null;
  if (typeof a.sgltStep !== "number" || !Number.isInteger(a.sgltStep) || a.sgltStep < 0 || a.sgltStep >= SGLT_STEPS.length) return null;
  const sglt = validateSglt(a.sglt); if (!sglt.ok) return null;
  let selectedProtein: MembraneProtein | null = null;
  if (raw.selectedProtein !== null) {
    if (typeof raw.selectedProtein !== "string" || !(PROTEINS_BY_SECTION[section] as Array<string | null>).includes(raw.selectedProtein)) return null;
    selectedProtein = raw.selectedProtein as MembraneProtein;
  }
  return {
    subject: "biology", tool: "membrane", section, bilayer: bilayer.value, passive: passive.value, ions: ions.value,
    active: { transporter: a.transporter, pumpStep: a.pumpStep, pumpPerturbation: pert, sgltStep: a.sgltStep, sglt: sglt.value },
    osmosis: osmosis.value, selectedProtein, mode: raw.mode, challenge: raw.challenge,
  };
}

// ---- signaling -----------------------------------------------------------------------------------------------------------------

export type SignalingInputs = {
  subject: "biology"; tool: "signaling";
  sig: SignalingInput;
  /** A node of the current pathway selected in the diagram. */
  selected: string | null;
  mode: LearningMode;
  challenge: number;
};
export const DEFAULT_SIGNALING_INPUTS: SignalingInputs = { subject: "biology", tool: "signaling", sig: DEFAULT_SIGNALING, selected: null, mode: "explore", challenge: 0 };
export function validateSignalingInputs(raw: unknown): SignalingInputs | null {
  if (!isObject(raw) || raw.subject !== "biology" || raw.tool !== "signaling" || !validMode(raw.mode) || !validChallenge(raw.challenge)) return null;
  const sig = validateSignaling(raw.sig); if (!sig.ok) return null;
  let selected: string | null = null;
  if (raw.selected !== null) {
    if (typeof raw.selected !== "string" || !SYSTEMS[sig.value.system].nodes.some((n) => n.id === raw.selected)) return null;
    selected = raw.selected;
  }
  return { subject: "biology", tool: "signaling", sig: sig.value, selected, mode: raw.mode, challenge: raw.challenge };
}

// ---- neuron --------------------------------------------------------------------------------------------------------------------

export type NeuronSection = "anatomy" | "resting" | "passive" | "ap" | "propagation" | "synapse" | "summation";
export const NEURON_SECTIONS: readonly NeuronSection[] = ["anatomy", "resting", "passive", "ap", "propagation", "synapse", "summation"];
export type NeuronInputs = {
  subject: "biology"; tool: "neuron";
  section: NeuronSection;
  part: PartId | null;
  resting: IonExplorerInput;
  passive: PassiveMembraneInput;
  /** Cursor on the passive-membrane graph (ms). */
  passiveTimeMs: number;
  hh: HhInput;
  /** Cursor on the action-potential trace (ms). */
  hhTimeMs: number;
  prop: { myelinated: boolean; step: number };
  synapse: SynapseInput;
  summation: SummationInput;
  mode: LearningMode;
  challenge: number;
};
const SUMMATION_FOR_PASSIVE: SummationInput = { ...DEFAULT_SUMMATION, rMohm: DEFAULT_PASSIVE_MEMBRANE.rMohm, cPf: DEFAULT_PASSIVE_MEMBRANE.cPf, vRestMv: DEFAULT_PASSIVE_MEMBRANE.vRestMv };
export const DEFAULT_NEURON_INPUTS: NeuronInputs = {
  subject: "biology", tool: "neuron", section: "anatomy", part: null, resting: DEFAULT_ION_EXPLORER, passive: DEFAULT_PASSIVE_MEMBRANE, passiveTimeMs: 0,
  hh: DEFAULT_HH, hhTimeMs: 0, prop: { myelinated: true, step: 0 }, synapse: DEFAULT_SYNAPSE, summation: SUMMATION_FOR_PASSIVE, mode: "explore", challenge: 0,
};
export function validateNeuronInputs(raw: unknown): NeuronInputs | null {
  if (!isObject(raw) || raw.subject !== "biology" || raw.tool !== "neuron" || !validMode(raw.mode) || !validChallenge(raw.challenge)) return null;
  if (typeof raw.section !== "string" || !(NEURON_SECTIONS as readonly string[]).includes(raw.section)) return null;
  let part: PartId | null = null;
  if (raw.part !== null) {
    if (typeof raw.part !== "string" || !NEURON_PARTS.some((p) => p.id === raw.part)) return null;
    part = raw.part as PartId;
  }
  const resting = validateIonExplorer(raw.resting);
  if (!resting.ok || resting.value.vmSource !== "ghk") return null; // the neuron's resting voltage is the GHK value
  const passive = validatePassiveMembrane(raw.passive); if (!passive.ok) return null;
  const hh = validateHh(raw.hh); if (!hh.ok) return null;
  const synapse = validateSynapse(raw.synapse); if (!synapse.ok) return null;
  const summation = validateSummation(raw.summation); if (!summation.ok) return null;
  // the summation compartment IS the passive membrane: the two must agree
  if (summation.value.rMohm !== passive.value.rMohm || summation.value.cPf !== passive.value.cPf || summation.value.vRestMv !== passive.value.vRestMv) return null;
  if (typeof raw.passiveTimeMs !== "number" || !Number.isFinite(raw.passiveTimeMs) || raw.passiveTimeMs < 0 || raw.passiveTimeMs > passive.value.tMaxMs) return null;
  if (typeof raw.hhTimeMs !== "number" || !Number.isFinite(raw.hhTimeMs) || raw.hhTimeMs < 0 || raw.hhTimeMs > hh.value.durationMs) return null;
  const p = raw.prop;
  if (!isObject(p) || typeof p.myelinated !== "boolean" || typeof p.step !== "number" || !Number.isInteger(p.step) || p.step < 0 || p.step > propagationMaxStep(p.myelinated)) return null;
  return {
    subject: "biology", tool: "neuron", section: raw.section as NeuronSection, part, resting: resting.value, passive: passive.value, passiveTimeMs: raw.passiveTimeMs,
    hh: hh.value, hhTimeMs: raw.hhTimeMs, prop: { myelinated: p.myelinated, step: p.step }, synapse: synapse.value, summation: summation.value, mode: raw.mode, challenge: raw.challenge,
  };
}
