/**
 * Saved state of the Stage 26 Biology tools (persisted pages "organelles", "cellcycle", "celldeath"; subject "biology").
 *
 * Inputs are the scientific state only: the selected cargo, step, perturbations, checkpoint conditions, pathway stimuli, the component or organelle
 * selected, the learning mode and the visualisation section. Every derived outcome (route taken, verdicts, pathway states, stage reached) is rebuilt
 * from them on open and never read back. Validators build new objects from known fields, reject unknown ids, out-of-range steps and contradictory
 * combinations (including steps that lie beyond a blocked route), and never coerce.
 */
import {
  CARGO_IDS, ENDO_CARGOS, ENDO_PERTURBATIONS, ENDO_STAGES, MAX_TRAFF_PERTURBATIONS, ORGANELLES, TRAFF_PERT_IDS, VESICLE_ROUTES, VESICLE_STAGES, DEFAULT_QC, QC_GRAPH, traceCargo, validateQc,
  type CargoId, type EndoCargoId, type EndoPert, type EndoStageId, type QcInput, type TraffPertId, type VesicleRoute, type VesicleStageId,
} from "../biology/trafficking26";
import { CDK_GRAPH, CYCLE_GRAPH, DEFAULT_CDK, DEFAULT_CYCLE, DEFAULT_LICENSE, LICENSE_GRAPH, validateCdk, validateCycle, validateLicense, type CdkInput, type CycleInput, type LicenseInput } from "../biology/cellcycle26";
import {
  APOPTOSIS_GRAPH, AUTOPHAGY_GRAPH, DEFAULT_APOPTOSIS, DEFAULT_AUTOPHAGY, DEFAULT_FATE, validateApoptosis, validateAutophagy, validateFate,
  type ApoptosisInput, type AutophagyInput, type FateInput,
} from "../biology/celldeath26";
import type { LearningMode } from "../../components/ui/LearningModeSwitch";

export const ORGANELLES_ENGINE_VERSION = 1;
export const CELLCYCLE_ENGINE_VERSION = 1;
export const CELLDEATH_ENGINE_VERSION = 1;

const MODES: readonly LearningMode[] = ["explore", "practice", "challenge"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const validMode = (v: unknown): v is LearningMode => typeof v === "string" && (MODES as readonly string[]).includes(v);
const validChallenge = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10000;
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

// ---- organelles and trafficking ---------------------------------------------------------------------------------------------------

export type OrganelleSection = "cell" | "tracker" | "vesicles" | "endosomes" | "quality";
export const ORGANELLE_SECTIONS: readonly OrganelleSection[] = ["cell", "tracker", "vesicles", "endosomes", "quality"];
export type OrganelleInputs = {
  subject: "biology"; tool: "organelles";
  section: OrganelleSection;
  /** Organelle selected in the cell map. */
  organelle: string | null;
  cargo: CargoId;
  perturbations: TraffPertId[];
  /** Index of the step shown in the cargo tracker (into the steps the cargo actually takes). */
  step: number;
  vesicle: { route: VesicleRoute["id"]; stage: VesicleStageId | null };
  endo: { cargo: EndoCargoId; perturbations: EndoPert[]; stage: EndoStageId | null };
  qc: QcInput;
  qcSelected: string | null;
  mode: LearningMode;
  challenge: number;
};
export const DEFAULT_ORGANELLE_INPUTS: OrganelleInputs = {
  subject: "biology", tool: "organelles", section: "cell", organelle: null, cargo: "secreted", perturbations: [], step: 0,
  vesicle: { route: "copii", stage: null }, endo: { cargo: "ldl", perturbations: [], stage: null }, qc: DEFAULT_QC, qcSelected: null, mode: "explore", challenge: 0,
};
export function validateOrganelleInputs(raw: unknown): OrganelleInputs | null {
  if (!isObject(raw) || raw.subject !== "biology" || raw.tool !== "organelles" || !validMode(raw.mode) || !validChallenge(raw.challenge)) return null;
  if (!oneOf(raw.section, ORGANELLE_SECTIONS) || !oneOf(raw.cargo, CARGO_IDS)) return null;
  let organelle: string | null = null;
  if (raw.organelle !== null) { if (typeof raw.organelle !== "string" || !ORGANELLES.some((o) => o.id === raw.organelle)) return null; organelle = raw.organelle; }
  if (!Array.isArray(raw.perturbations) || raw.perturbations.length > MAX_TRAFF_PERTURBATIONS || new Set(raw.perturbations).size !== raw.perturbations.length) return null;
  if (!raw.perturbations.every((p) => oneOf(p, TRAFF_PERT_IDS))) return null;
  const perturbations = raw.perturbations as TraffPertId[];
  const trace = traceCargo(raw.cargo, perturbations);
  if (typeof raw.step !== "number" || !Number.isInteger(raw.step) || raw.step < 0 || raw.step >= trace.steps.length) return null;
  const v = raw.vesicle;
  if (!isObject(v) || !oneOf(v.route, VESICLE_ROUTES.map((r) => r.id))) return null;
  if (v.stage !== null && !oneOf(v.stage, VESICLE_STAGES)) return null;
  const e = raw.endo;
  if (!isObject(e) || !oneOf(e.cargo, ENDO_CARGOS.map((c) => c.id))) return null;
  if (!Array.isArray(e.perturbations) || e.perturbations.length > 2 || new Set(e.perturbations).size !== e.perturbations.length || !e.perturbations.every((p) => oneOf(p, ENDO_PERTURBATIONS.map((x) => x.id)))) return null;
  if (e.stage !== null && !oneOf(e.stage, ENDO_STAGES.map((s) => s.id))) return null;
  const qc = validateQc(raw.qc); if (!qc.ok) return null;
  let qcSelected: string | null = null;
  if (raw.qcSelected !== null) { if (typeof raw.qcSelected !== "string" || !QC_GRAPH.nodes.some((n) => n.id === raw.qcSelected)) return null; qcSelected = raw.qcSelected; }
  return {
    subject: "biology", tool: "organelles", section: raw.section, organelle, cargo: raw.cargo, perturbations, step: raw.step,
    vesicle: { route: v.route as VesicleRoute["id"], stage: v.stage as VesicleStageId | null }, endo: { cargo: e.cargo as EndoCargoId, perturbations: e.perturbations as EndoPert[], stage: e.stage as EndoStageId | null },
    qc: qc.value, qcSelected, mode: raw.mode, challenge: raw.challenge,
  };
}

// ---- cell cycle --------------------------------------------------------------------------------------------------------------------

export type CycleSection = "overview" | "cdk" | "g1s" | "licensing" | "ddr" | "g2m" | "sac";
export const CYCLE_SECTIONS: readonly CycleSection[] = ["overview", "cdk", "g1s", "licensing", "ddr", "g2m", "sac"];
export type CellCycleInputs = {
  subject: "biology"; tool: "cellcycle";
  section: CycleSection;
  cycle: CycleInput;
  cdk: CdkInput;
  license: LicenseInput;
  /** A component of the graph of the current section selected in its diagram. */
  selected: string | null;
  mode: LearningMode;
  challenge: number;
};
export const DEFAULT_CELLCYCLE_INPUTS: CellCycleInputs = { subject: "biology", tool: "cellcycle", section: "overview", cycle: DEFAULT_CYCLE, cdk: DEFAULT_CDK, license: DEFAULT_LICENSE, selected: null, mode: "explore", challenge: 0 };
export function validateCellCycleInputs(raw: unknown): CellCycleInputs | null {
  if (!isObject(raw) || raw.subject !== "biology" || raw.tool !== "cellcycle" || !validMode(raw.mode) || !validChallenge(raw.challenge)) return null;
  if (!oneOf(raw.section, CYCLE_SECTIONS)) return null;
  const cycle = validateCycle(raw.cycle), cdk = validateCdk(raw.cdk), license = validateLicense(raw.license);
  if (!cycle.ok || !cdk.ok || !license.ok) return null;
  let selected: string | null = null;
  if (raw.selected !== null) {
    if (typeof raw.selected !== "string") return null;
    const graph = raw.section === "cdk" ? CDK_GRAPH : raw.section === "licensing" ? LICENSE_GRAPH : raw.section === "overview" ? null : CYCLE_GRAPH;
    if (!graph || !graph.nodes.some((n) => n.id === raw.selected)) return null;
    selected = raw.selected;
  }
  return { subject: "biology", tool: "cellcycle", section: raw.section, cycle: cycle.value, cdk: cdk.value, license: license.value, selected, mode: raw.mode, challenge: raw.challenge };
}

// ---- apoptosis, autophagy and cell fate ------------------------------------------------------------------------------------------------

export type DeathSection = "overview" | "intrinsic" | "extrinsic" | "caspases" | "autophagy" | "fate";
export const DEATH_SECTIONS: readonly DeathSection[] = ["overview", "intrinsic", "extrinsic", "caspases", "autophagy", "fate"];
export type CellDeathInputs = {
  subject: "biology"; tool: "celldeath";
  section: DeathSection;
  apop: ApoptosisInput;
  auto: AutophagyInput;
  fate: FateInput;
  /** A component of the current section's graph selected in the diagram (the fate map keeps its own selection in `fate.selected`). */
  selected: string | null;
  mode: LearningMode;
  challenge: number;
};
export const DEFAULT_CELLDEATH_INPUTS: CellDeathInputs = { subject: "biology", tool: "celldeath", section: "overview", apop: DEFAULT_APOPTOSIS, auto: DEFAULT_AUTOPHAGY, fate: DEFAULT_FATE, selected: null, mode: "explore", challenge: 0 };
export function validateCellDeathInputs(raw: unknown): CellDeathInputs | null {
  if (!isObject(raw) || raw.subject !== "biology" || raw.tool !== "celldeath" || !validMode(raw.mode) || !validChallenge(raw.challenge)) return null;
  if (!oneOf(raw.section, DEATH_SECTIONS)) return null;
  const apop = validateApoptosis(raw.apop), auto = validateAutophagy(raw.auto), fate = validateFate(raw.fate);
  if (!apop.ok || !auto.ok || !fate.ok) return null;
  if ((raw.section === "intrinsic" || raw.section === "extrinsic") && apop.value.path !== raw.section) return null;
  let selected: string | null = null;
  if (raw.selected !== null) {
    if (typeof raw.selected !== "string") return null;
    const graph = raw.section === "autophagy" ? AUTOPHAGY_GRAPH : raw.section === "intrinsic" || raw.section === "extrinsic" || raw.section === "caspases" ? APOPTOSIS_GRAPH : null;
    if (!graph || !graph.nodes.some((n) => n.id === raw.selected)) return null;
    selected = raw.selected;
  }
  return { subject: "biology", tool: "celldeath", section: raw.section, apop: apop.value, auto: auto.value, fate: fate.value, selected, mode: raw.mode, challenge: raw.challenge };
}
