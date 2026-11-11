/**
 * Saved state of the Stage 12 General Chemistry tools (persisted pages "equilibrium", "kinetics", "thermo"; subject "general").
 *
 * As for the acid–base tool, inputs hold everything needed to rebuild a result exactly; every number is re-derived from the
 * inputs when a record is opened. The stored results are a small display summary plus one `check` number used to notice that
 * the model changed since saving (then the page says so and shows the current values). Validators build new objects from known
 * fields and reject anything of the wrong type or outside the model's bounds; they never coerce.
 */
import { EQ_LIMITS, validateEquilibrium, VOLUME_FACTOR_RANGE, type EquilibriumSystem } from "../generalChem/equilibrium";
import { TIME_UNITS, validateArrhenius, validateRateModel, type ArrheniusInput, type RateModel, type TimeUnit } from "../generalChem/kinetics";
import { THERMO_LIMITS, validateCalorimetry, validateGibbs, validateHess, type CalorimetryInput, type GibbsInput, type HessInput } from "../generalChem/thermo";

export const EQUILIBRIUM_ENGINE_VERSION = 1;
export const KINETICS_ENGINE_VERSION = 1;
export const THERMO_ENGINE_VERSION = 1;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// ---- shared result summary ---------------------------------------------------------------------------------------------------

export type ToolResults = {
  engineVersion: number;
  /** Headline lines exactly as shown when saved (display only; recomputed on open). */
  headline: string[];
  /** The assumptions that applied. */
  assumptions: string[];
  /** One key number for the integrity check on open (extent, half-life, ΔG …). */
  check: number;
  checkLabel: string;
};

function validateToolResults(raw: unknown): ToolResults | null {
  if (!isObject(raw)) return null;
  if (typeof raw.engineVersion !== "number" || !Number.isInteger(raw.engineVersion)) return null;
  if (!finite(raw.check)) return null;
  if (typeof raw.checkLabel !== "string" || raw.checkLabel.length > 80) return null;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 20 && v.every((x) => typeof x === "string" && x.length <= 400);
  if (!strings(raw.headline) || !strings(raw.assumptions)) return null;
  return { engineVersion: raw.engineVersion, headline: raw.headline, assumptions: raw.assumptions, check: raw.check, checkLabel: raw.checkLabel };
}

// ---- equilibrium -------------------------------------------------------------------------------------------------------------

export type DisturbanceKind = "add" | "remove" | "volume" | "inert";
export const DISTURBANCE_KINDS: readonly DisturbanceKind[] = ["add", "remove", "volume", "inert"];

export type DisturbanceSpec = {
  kind: DisturbanceKind;
  /** "reactants:0", "products:1" … the species the add/remove acts on. */
  target: string;
  /** mol/L for add/remove. */
  amount: number;
  /** V₂/V₁ for a volume change. */
  factor: number;
};

export type EquilibriumInputs = {
  subject: "general";
  tool: "equilibrium";
  system: EquilibriumSystem;
  /** Temperature used only to convert Kc to Kp for gases. It does not change Kc. */
  tempK: number;
  disturbance: DisturbanceSpec;
};
export type EquilibriumResults = ToolResults;

export const DEFAULT_EQUILIBRIUM_INPUTS: EquilibriumInputs = {
  subject: "general",
  tool: "equilibrium",
  system: {
    reactants: [{ name: "N₂O₄", coeff: 1, c0: 0.1 }],
    products: [{ name: "NO₂", coeff: 2, c0: 0 }],
    K: 4.6e-3,
    phase: "gas",
  },
  tempK: 298.15,
  disturbance: { kind: "volume", target: "reactants:0", amount: 0.05, factor: 2 },
};

export function validateEquilibriumInputs(raw: unknown): EquilibriumInputs | null {
  if (!isObject(raw) || raw.subject !== "general" || raw.tool !== "equilibrium") return null;
  const sys = validateEquilibrium(raw.system);
  if (!sys.ok) return null;
  if (!finite(raw.tempK) || raw.tempK < THERMO_LIMITS.minT || raw.tempK > THERMO_LIMITS.maxT) return null;
  const d = raw.disturbance;
  if (!isObject(d) || typeof d.kind !== "string" || !DISTURBANCE_KINDS.includes(d.kind as DisturbanceKind)) return null;
  if (typeof d.target !== "string" || !/^(reactants|products):[01]$/.test(d.target)) return null;
  const [side, idx] = d.target.split(":");
  if (Number(idx) >= (side === "reactants" ? sys.value.reactants.length : sys.value.products.length)) return null;
  if (!finite(d.amount) || d.amount <= 0 || d.amount > EQ_LIMITS.maxConc) return null;
  if (!finite(d.factor) || d.factor < VOLUME_FACTOR_RANGE[0] || d.factor > VOLUME_FACTOR_RANGE[1]) return null;
  return {
    subject: "general", tool: "equilibrium", system: sys.value, tempK: raw.tempK,
    disturbance: { kind: d.kind as DisturbanceKind, target: d.target, amount: d.amount, factor: d.factor },
  };
}
export const validateEquilibriumResults = validateToolResults;

export function describeEquilibriumAnalysis(inputs: EquilibriumInputs): string {
  const side = (list: EquilibriumSystem["reactants"]) => list.map((s) => `${s.coeff === 1 ? "" : s.coeff}${s.name}`).join(" + ");
  return `Equilibrium ${side(inputs.system.reactants)} ⇌ ${side(inputs.system.products)}, K = ${Number(inputs.system.K.toPrecision(3))}`.slice(0, 300);
}

// ---- kinetics ----------------------------------------------------------------------------------------------------------------

export type KineticsView = "model" | "fit" | "arrhenius";
export const KINETICS_VIEWS: readonly KineticsView[] = ["model", "fit", "arrhenius"];

export type KineticsInputs = {
  subject: "general";
  tool: "kinetics";
  view: KineticsView;
  model: RateModel;
  timeUnit: TimeUnit;
  /** The time shown on both plots, in the chosen unit. */
  tNow: number;
  /** "t, c" per line for the fitting view. */
  fitText: string;
  arrhenius: ArrheniusInput;
};
export type KineticsResults = ToolResults;

export const DEFAULT_KINETICS_INPUTS: KineticsInputs = {
  subject: "general",
  tool: "kinetics",
  view: "model",
  model: { order: 1, k: 0.05, c0: 1 },
  timeUnit: "s",
  tNow: 10,
  fitText: "0, 1\n10, 0.607\n20, 0.368\n30, 0.223\n45, 0.105\n60, 0.0498\n90, 0.0111",
  arrhenius: { mode: "given", k1: 2e-3, T1: 300, EaKJ: 60, k2: 9e-3, T2: 320, fitText: "290, 0.000873\n300, 0.002\n310, 0.00435\n320, 0.00899\n330, 0.0178\n340, 0.0339", T: 320 },
};

export function validateKineticsInputs(raw: unknown): KineticsInputs | null {
  if (!isObject(raw) || raw.subject !== "general" || raw.tool !== "kinetics") return null;
  if (typeof raw.view !== "string" || !KINETICS_VIEWS.includes(raw.view as KineticsView)) return null;
  const model = validateRateModel(raw.model);
  if (!model.ok) return null;
  if (typeof raw.timeUnit !== "string" || !TIME_UNITS.includes(raw.timeUnit as TimeUnit)) return null;
  if (!finite(raw.tNow) || raw.tNow < 0 || raw.tNow > 1e12) return null;
  if (typeof raw.fitText !== "string" || raw.fitText.length > 20000) return null;
  const arr = validateArrhenius(raw.arrhenius);
  if (!arr.ok) return null;
  return { subject: "general", tool: "kinetics", view: raw.view as KineticsView, model: model.value, timeUnit: raw.timeUnit as TimeUnit, tNow: raw.tNow, fitText: raw.fitText, arrhenius: arr.value };
}
export const validateKineticsResults = validateToolResults;

export function describeKineticsAnalysis(inputs: KineticsInputs): string {
  const order = ["Zero", "First", "Second"][inputs.model.order];
  const lead = inputs.view === "model" ? `${order}-order decay, k = ${Number(inputs.model.k.toPrecision(3))}` : inputs.view === "fit" ? "Rate-law fit to concentration–time data" : `Arrhenius analysis at ${inputs.arrhenius.T} K`;
  return `Kinetics: ${lead}`.slice(0, 300);
}

// ---- thermodynamics ----------------------------------------------------------------------------------------------------------

export type ThermoView = "gibbs" | "hess" | "calorimetry";
export const THERMO_VIEWS: readonly ThermoView[] = ["gibbs", "hess", "calorimetry"];

export type ThermoInputs = {
  subject: "general";
  tool: "thermodynamics";
  view: ThermoView;
  gibbs: GibbsInput;
  hess: HessInput;
  calorimetry: CalorimetryInput;
};
export type ThermoResults = ToolResults;

export const DEFAULT_THERMO_INPUTS: ThermoInputs = {
  subject: "general",
  tool: "thermodynamics",
  view: "gibbs",
  gibbs: { dH: -92.2, dS: -198.7, dCp: 0, T0: 298.15, T: 400, Tmin: 200, Tmax: 800, Q: null },
  hess: {
    target: "C(s) + 1/2 O2(g) -> CO(g)",
    steps: [
      { equation: "C(s) + O2(g) -> CO2(g)", dH: -393.5 },
      { equation: "CO(g) + 1/2 O2(g) -> CO2(g)", dH: -283.0 },
    ],
  },
  calorimetry: {
    mode: "reaction",
    reaction: { massG: 100, cJgK: 4.184, ccalJK: 0, Ti: 22, Tf: 28.5, moles: 0.05 },
    mixing: { m1: 100, c1: 4.184, T1: 80, m2: 100, c2: 4.184, T2: 20 },
    specificHeat: { mMetal: 50, TMetal: 100, mWater: 100, TWater: 20, Tf: 25 },
  },
};

export function validateThermoInputs(raw: unknown): ThermoInputs | null {
  if (!isObject(raw) || raw.subject !== "general" || raw.tool !== "thermodynamics") return null;
  if (typeof raw.view !== "string" || !THERMO_VIEWS.includes(raw.view as ThermoView)) return null;
  const gibbs = validateGibbs(raw.gibbs);
  const hess = validateHess(raw.hess);
  // The calorimetry block holds three sub-forms; only the selected one is range-checked, the others only for shape.
  const cal = isObject(raw.calorimetry) ? raw.calorimetry : null;
  if (!gibbs.ok || !hess.ok || !cal) return null;
  const calOk = validateCalorimetry(cal);
  if (!calOk.ok) return null;
  for (const key of ["reaction", "mixing", "specificHeat"] as const) {
    const block = cal[key];
    if (!isObject(block) || !Object.values(block).every((x) => finite(x) && Math.abs(x) <= 1e7)) return null;
  }
  return {
    subject: "general", tool: "thermodynamics", view: raw.view as ThermoView,
    gibbs: gibbs.value, hess: hess.value, calorimetry: calOk.value,
  };
}
export const validateThermoResults = validateToolResults;

export function describeThermoAnalysis(inputs: ThermoInputs): string {
  const lead = inputs.view === "gibbs"
    ? `ΔH = ${inputs.gibbs.dH} kJ/mol, ΔS = ${inputs.gibbs.dS} J/(mol·K), T = ${inputs.gibbs.T} K`
    : inputs.view === "hess" ? `Hess's law for ${inputs.hess.target}` : `Calorimetry (${inputs.calorimetry.mode.replace("-", " ")})`;
  return `Thermodynamics: ${lead}`.slice(0, 300);
}
