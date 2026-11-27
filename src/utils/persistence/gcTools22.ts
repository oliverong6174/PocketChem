/**
 * Saved state of the Stage 22 General Chemistry tools: Stoichiometry (page "stoichiometry"), Gas laws ("gaslaws") and Electrochemistry
 * ("electrochem"); subject "general". As for every tool, the inputs hold everything needed to rebuild a result exactly; every number is
 * re-derived from them when a record is opened, and the stored results are only a display summary plus one `check` number. Validators build
 * new objects from known fields and reject anything of the wrong type or outside the model's bounds; they never coerce.
 * The learning state (mode, selected practice question and challenge) is saved with the inputs so the page reopens where it was left.
 */
import { balanceEquation, parseEquation } from "../generalChem/balance";
import {
  DEFAULT_KINETIC, DEFAULT_MIXTURE, DEFAULT_CONTAINER, GAS_PROCESSES, PRESSURE_UNITS, TEMPERATURE_UNITS, VOLUME_UNITS, calculateIdeal, runProcess, solveKinetic, solveMixture,
  type CalcInput, type ContainerInput, type GasProcess, type GasUnknown, type KineticInput, type MixtureInput, type PressureUnit, type TemperatureUnit, type VolumeUnit,
} from "../generalChem/gas";
import {
  DEFAULT_CELL, DEFAULT_ELECTROLYSIS, buildGalvanicCell, solveElectrolysis, type CellInput, type ElectrolysisInput,
} from "../generalChem/electrochem";
import { DEFAULT_AMOUNT, resolveReaction, solveDilution, solveStoichiometry, type AmountSpec, type DilutionInput, type DilutionUnknown } from "../generalChem/stoichiometry";

export { validateToolResults as validateGcResults22 } from "./generalChemTools";

export const STOICHIOMETRY_ENGINE_VERSION = 1;
export const GASLAWS_ENGINE_VERSION = 1;
export const ELECTROCHEM_ENGINE_VERSION = 1;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// ---- learning state ---------------------------------------------------------------------------------------------------------------------

export const LEARN_MODES = ["explore", "practice", "challenge"] as const;
export type LearnMode = (typeof LEARN_MODES)[number];
export type LearnState = { mode: LearnMode; practice: number; challenge: number };
export const DEFAULT_LEARN: LearnState = { mode: "explore", practice: 0, challenge: 0 };
function validateLearn(raw: unknown): LearnState | null {
  if (!isObject(raw)) return null;
  if (typeof raw.mode !== "string" || !(LEARN_MODES as readonly string[]).includes(raw.mode)) return null;
  for (const k of ["practice", "challenge"] as const) { const v = raw[k]; if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 49) return null; }
  return { mode: raw.mode as LearnMode, practice: raw.practice as number, challenge: raw.challenge as number };
}

// ---- stoichiometry ----------------------------------------------------------------------------------------------------------------------

export const STOICH_VIEWS = ["balance", "limiting", "solution"] as const;
export type StoichView = (typeof STOICH_VIEWS)[number];
export const STOICH_VIEW_LABEL: Record<StoichView, string> = { balance: "Balance an equation", limiting: "Limiting reagent and yield", solution: "Solutions and dilution" };

export type StoichInputs = {
  subject: "general";
  tool: "stoichiometry";
  view: StoichView;
  equation: string;
  /** Coefficients the learner is trying out in the balancing view (empty = none entered). */
  manual: number[];
  /** One amount per reactant of the resolved reaction. */
  amounts: AmountSpec[];
  /** Index of the product whose yield is compared, and the mass actually collected (g); `actualOn` false = not entered. */
  yieldProduct: number;
  actualOn: boolean;
  actualG: number;
  /** Dilution calculator; the unknown's own value is ignored. */
  dilution: DilutionInput;
  learn: LearnState;
};
export const DEFAULT_STOICH_INPUTS: StoichInputs = {
  subject: "general", tool: "stoichiometry", view: "limiting", equation: "H2 + O2 -> H2O", manual: [],
  amounts: [{ ...DEFAULT_AMOUNT, mode: "g", value: 4, purity: 100 }, { ...DEFAULT_AMOUNT, mode: "g", value: 32, purity: 100 }],
  yieldProduct: 0, actualOn: false, actualG: 30,
  dilution: { unknown: "M2", M1: 12, V1: 25, M2: 0, V2: 500 },
  learn: DEFAULT_LEARN,
};

function validateAmount(raw: unknown): AmountSpec | null {
  if (!isObject(raw)) return null;
  if (raw.mode !== "mol" && raw.mode !== "g" && raw.mode !== "soln") return null;
  if (!finite(raw.value) || !finite(raw.purity) || !finite(raw.M) || !finite(raw.mL)) return null;
  return { mode: raw.mode, value: raw.value, purity: raw.purity, M: raw.M, mL: raw.mL };
}
const DILUTION_UNKNOWNS: readonly DilutionUnknown[] = ["M2", "V2", "V1", "M1"];
function validateDilution(raw: unknown): DilutionInput | null {
  if (!isObject(raw)) return null;
  if (typeof raw.unknown !== "string" || !(DILUTION_UNKNOWNS as readonly string[]).includes(raw.unknown)) return null;
  if (!finite(raw.M1) || !finite(raw.V1) || !finite(raw.M2) || !finite(raw.V2)) return null;
  const d: DilutionInput = { unknown: raw.unknown as DilutionUnknown, M1: raw.M1, V1: raw.V1, M2: raw.M2, V2: raw.V2 };
  return solveDilution(d).ok ? d : null;
}

export function validateStoichInputs(raw: unknown): StoichInputs | null {
  if (!isObject(raw) || raw.subject !== "general" || raw.tool !== "stoichiometry") return null;
  if (typeof raw.view !== "string" || !(STOICH_VIEWS as readonly string[]).includes(raw.view)) return null;
  if (typeof raw.equation !== "string" || raw.equation.length > 400) return null;
  const rxn = resolveReaction(raw.equation);
  if (!rxn.ok) return null;
  const nSpecies = rxn.value.reactants.length + rxn.value.products.length;
  if (!Array.isArray(raw.manual) || raw.manual.length > 12) return null;
  const manual = raw.manual as unknown[];
  if (manual.length !== 0 && manual.length !== nSpecies) return null;
  if (!manual.every((c) => Number.isInteger(c) && (c as number) >= 0 && (c as number) <= 999)) return null;
  if (!Array.isArray(raw.amounts) || raw.amounts.length !== rxn.value.reactants.length) return null;
  const amounts: AmountSpec[] = [];
  for (const a of raw.amounts) { const v = validateAmount(a); if (!v) return null; amounts.push(v); }
  if (!solveStoichiometry(rxn.value, amounts).ok) return null;
  if (!Number.isInteger(raw.yieldProduct) || (raw.yieldProduct as number) < 0 || (raw.yieldProduct as number) >= rxn.value.products.length) return null;
  if (typeof raw.actualOn !== "boolean" || !finite(raw.actualG) || raw.actualG < 0 || raw.actualG > 1e9) return null;
  const dilution = validateDilution(raw.dilution);
  const learn = validateLearn(raw.learn);
  if (!dilution || !learn) return null;
  return { subject: "general", tool: "stoichiometry", view: raw.view as StoichView, equation: raw.equation, manual: manual as number[], amounts, yieldProduct: raw.yieldProduct as number, actualOn: raw.actualOn, actualG: raw.actualG, dilution, learn };
}
export function describeStoichAnalysis(i: StoichInputs): string {
  const bal = parseEquation(i.equation);
  const text = bal.ok ? i.equation.replace(/\s+/g, " ") : "reaction";
  return `${i.view === "balance" ? "Balance" : i.view === "solution" ? "Solution stoichiometry" : "Limiting reagent"}: ${text}`.slice(0, 300);
}
export { balanceEquation };

// ---- gas laws ---------------------------------------------------------------------------------------------------------------------------

export const GAS_VIEWS = ["container", "calculator", "mixture", "kinetic"] as const;
export type GasView = (typeof GAS_VIEWS)[number];
export const GAS_VIEW_LABEL: Record<GasView, string> = { container: "Gas container", calculator: "PV = nRT calculator", mixture: "Gas mixtures", kinetic: "Molecular speeds" };

export type GasInputs = {
  subject: "general";
  tool: "gaslaws";
  view: GasView;
  container: ContainerInput;
  /** The unknown's own value is ignored (stored as 0). */
  calc: CalcInput;
  mixture: MixtureInput;
  kinetic: KineticInput;
  learn: LearnState;
};
export const DEFAULT_GAS_INPUTS: GasInputs = {
  subject: "general", tool: "gaslaws", view: "container", container: DEFAULT_CONTAINER,
  calc: { unknown: "n", P: { v: 1, u: "atm" }, V: { v: 24.465, u: "L" }, n: 0, T: { v: 25, u: "C" } },
  mixture: DEFAULT_MIXTURE, kinetic: DEFAULT_KINETIC, learn: DEFAULT_LEARN,
};

const GAS_UNKNOWNS: readonly GasUnknown[] = ["P", "V", "n", "T"];
function validateCalc(raw: unknown): CalcInput | null {
  if (!isObject(raw) || typeof raw.unknown !== "string" || !(GAS_UNKNOWNS as readonly string[]).includes(raw.unknown)) return null;
  const P = raw.P; const V = raw.V; const T = raw.T;
  if (!isObject(P) || !isObject(V) || !isObject(T)) return null;
  if (typeof P.u !== "string" || !(P.u in PRESSURE_UNITS) || typeof V.u !== "string" || !(V.u in VOLUME_UNITS) || typeof T.u !== "string" || !(T.u in TEMPERATURE_UNITS)) return null;
  if (!finite(P.v) || !finite(V.v) || !finite(T.v) || !finite(raw.n)) return null;
  const c: CalcInput = { unknown: raw.unknown as GasUnknown, P: { v: P.v, u: P.u as PressureUnit }, V: { v: V.v, u: V.u as VolumeUnit }, n: raw.n, T: { v: T.v, u: T.u as TemperatureUnit } };
  return calculateIdeal(c).ok ? c : null;
}
function validateContainer(raw: unknown): ContainerInput | null {
  if (!isObject(raw) || typeof raw.process !== "string" || !GAS_PROCESSES.some((p) => p.id === raw.process)) return null;
  if (!finite(raw.VL) || !finite(raw.TC) || !finite(raw.n) || !finite(raw.target)) return null;
  const c: ContainerInput = { VL: raw.VL, TC: raw.TC, n: raw.n, process: raw.process as GasProcess, target: raw.target };
  return runProcess(c).ok ? c : null;
}
function validateMixture(raw: unknown): MixtureInput | null {
  if (!isObject(raw) || !Array.isArray(raw.components) || raw.components.length > 5 || !finite(raw.VL) || !finite(raw.TC)) return null;
  const components: MixtureInput["components"] = [];
  for (const c of raw.components) { if (!isObject(c) || typeof c.formula !== "string" || !finite(c.mol)) return null; components.push({ formula: c.formula, mol: c.mol }); }
  const m: MixtureInput = { components, VL: raw.VL, TC: raw.TC };
  return solveMixture(m).ok ? m : null;
}
function validateKinetic(raw: unknown): KineticInput | null {
  if (!isObject(raw) || typeof raw.a !== "string" || typeof raw.b !== "string" || !finite(raw.TaC) || !finite(raw.TbC)) return null;
  const k: KineticInput = { a: raw.a, b: raw.b, TaC: raw.TaC, TbC: raw.TbC };
  return solveKinetic(k).ok ? k : null;
}
export function validateGasInputs(raw: unknown): GasInputs | null {
  if (!isObject(raw) || raw.subject !== "general" || raw.tool !== "gaslaws") return null;
  if (typeof raw.view !== "string" || !(GAS_VIEWS as readonly string[]).includes(raw.view)) return null;
  const container = validateContainer(raw.container); const calc = validateCalc(raw.calc); const mixture = validateMixture(raw.mixture); const kinetic = validateKinetic(raw.kinetic); const learn = validateLearn(raw.learn);
  if (!container || !calc || !mixture || !kinetic || !learn) return null;
  return { subject: "general", tool: "gaslaws", view: raw.view as GasView, container, calc, mixture, kinetic, learn };
}
export function describeGasAnalysis(i: GasInputs): string {
  if (i.view === "container") { const p = GAS_PROCESSES.find((x) => x.id === i.container.process); return `Gas: ${p?.label ?? "process"}, ${i.container.n} mol, ${i.container.VL} L at ${i.container.TC} °C`.slice(0, 300); }
  if (i.view === "calculator") return `PV = nRT: solve for ${i.calc.unknown}`;
  if (i.view === "mixture") return `Gas mixture: ${i.mixture.components.map((c) => c.formula).join(", ")}`.slice(0, 300);
  return `Molecular speeds: ${i.kinetic.a} and ${i.kinetic.b}`;
}

// ---- electrochemistry --------------------------------------------------------------------------------------------------------------------

export const ELECTRO_VIEWS = ["galvanic", "electrolysis"] as const;
export type ElectroView = (typeof ELECTRO_VIEWS)[number];
export const ELECTRO_VIEW_LABEL: Record<ElectroView, string> = { galvanic: "Galvanic cell", electrolysis: "Electrolysis" };

export type ElectroInputs = {
  subject: "general";
  tool: "electrochem";
  view: ElectroView;
  cell: CellInput;
  electro: ElectrolysisInput;
  /** Elapsed time shown on the deposition graph (minutes), from 0 to the electrolysis time. */
  tNow: number;
  learn: LearnState;
};
export const DEFAULT_ELECTRO_INPUTS: ElectroInputs = { subject: "general", tool: "electrochem", view: "galvanic", cell: DEFAULT_CELL, electro: DEFAULT_ELECTROLYSIS, tNow: 15, learn: DEFAULT_LEARN };

function validateCell(raw: unknown): CellInput | null {
  if (!isObject(raw) || typeof raw.a !== "string" || typeof raw.b !== "string" || !Array.isArray(raw.ca) || !Array.isArray(raw.cb)) return null;
  if (raw.ca.length > 4 || raw.cb.length > 4 || !raw.ca.every(finite) || !raw.cb.every(finite) || !finite(raw.pH) || !finite(raw.TC)) return null;
  const c: CellInput = { a: raw.a, b: raw.b, ca: raw.ca as number[], cb: raw.cb as number[], pH: raw.pH, TC: raw.TC };
  return buildGalvanicCell(c).ok ? c : null;
}
function validateElectrolysis(raw: unknown): ElectrolysisInput | null {
  if (!isObject(raw) || typeof raw.id !== "string" || !finite(raw.I) || !finite(raw.tMin) || !finite(raw.eff) || !finite(raw.TC) || !finite(raw.PkPa)) return null;
  const e: ElectrolysisInput = { id: raw.id, I: raw.I, tMin: raw.tMin, eff: raw.eff, TC: raw.TC, PkPa: raw.PkPa };
  return solveElectrolysis(e).ok ? e : null;
}
export function validateElectroInputs(raw: unknown): ElectroInputs | null {
  if (!isObject(raw) || raw.subject !== "general" || raw.tool !== "electrochem") return null;
  if (typeof raw.view !== "string" || !(ELECTRO_VIEWS as readonly string[]).includes(raw.view)) return null;
  const cell = validateCell(raw.cell); const electro = validateElectrolysis(raw.electro); const learn = validateLearn(raw.learn);
  if (!cell || !electro || !learn) return null;
  if (!finite(raw.tNow) || raw.tNow < 0 || raw.tNow > electro.tMin * (1 + 1e-9) + 1e-12) return null;
  return { subject: "general", tool: "electrochem", view: raw.view as ElectroView, cell, electro, tNow: raw.tNow, learn };
}
export function describeElectroAnalysis(i: ElectroInputs): string {
  if (i.view === "galvanic") return `Galvanic cell: ${i.cell.a} and ${i.cell.b} half-cells`.slice(0, 300);
  return `Electrolysis: ${i.electro.id}, ${i.electro.I} A for ${i.electro.tMin} min`.slice(0, 300);
}
