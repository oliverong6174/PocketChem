/**
 * Saved state of the Physics tools (persisted pages "mechanics", "circuits", "rc"; subject "physics").
 *
 * Inputs hold everything needed to rebuild a result exactly; every number is re-derived from the inputs when a record is
 * opened. The stored results are a small display summary plus one `check` number used to notice that a model changed since
 * saving. Validators build new objects from known fields, reject anything of the wrong type or outside the model's bounds,
 * and reject records whose parts contradict each other (a selected time beyond the end of the motion, a selected component
 * that is not in the circuit). They never coerce.
 */
import { describeStructure, validateCircuit, type Circuit, type CircuitNode, DEFAULT_CIRCUIT } from "../physics/circuits";
import {
  DEFAULT_CONSTANT, DEFAULT_PROJECTILE, constantKinematics, endTime, projectileKinematics, validateConstantAccel, validateProjectile,
  type ConstantAccelInput, type MotionMode, type ProjectileInput,
} from "../physics/mechanics";
import { DEFAULT_RC, tEnd as rcEnd, validateRc, type RcInput } from "../physics/rc";
import { SPEED_CHOICES, type SpeedChoice } from "../physics/simClock";
export { validateToolResults as validatePhysicsResults } from "./generalChemTools";
export type { ToolResults as PhysicsResults } from "./generalChemTools";

export const MECHANICS_ENGINE_VERSION = 1;
export const CIRCUITS_ENGINE_VERSION = 1;
export const RC_ENGINE_VERSION = 1;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** A saved time may exceed the end of the motion only by round-off. */
const withinEnd = (t: number, end: number) => t >= 0 && t <= end * (1 + 1e-9) + 1e-12;

// ---- mechanics ---------------------------------------------------------------------------------------------------------------

export const MOTION_MODES: readonly MotionMode[] = ["projectile", "constant"];

export type MechanicsInputs = {
  subject: "physics";
  tool: "mechanics";
  mode: MotionMode;
  projectile: ProjectileInput;
  constant: ConstantAccelInput;
  /** The simulation time shown (s). */
  tNow: number;
  speed: SpeedChoice;
};

export const DEFAULT_MECHANICS_INPUTS: MechanicsInputs = {
  subject: "physics", tool: "mechanics", mode: "projectile",
  projectile: DEFAULT_PROJECTILE, constant: DEFAULT_CONSTANT, tNow: 0, speed: "real",
};

export function mechanicsKinematics(inputs: Pick<MechanicsInputs, "mode" | "projectile" | "constant">) {
  return inputs.mode === "projectile" ? projectileKinematics(inputs.projectile) : constantKinematics(inputs.constant);
}

export function validateMechanicsInputs(raw: unknown): MechanicsInputs | null {
  if (!isObject(raw) || raw.subject !== "physics" || raw.tool !== "mechanics") return null;
  if (typeof raw.mode !== "string" || !MOTION_MODES.includes(raw.mode as MotionMode)) return null;
  const projectile = validateProjectile(raw.projectile);
  const constant = validateConstantAccel(raw.constant);
  if (!projectile.ok || !constant.ok) return null;
  if (typeof raw.speed !== "string" || !SPEED_CHOICES.includes(raw.speed as SpeedChoice)) return null;
  if (!finite(raw.tNow)) return null;
  const out: MechanicsInputs = { subject: "physics", tool: "mechanics", mode: raw.mode as MotionMode, projectile: projectile.value, constant: constant.value, tNow: raw.tNow, speed: raw.speed as SpeedChoice };
  if (!withinEnd(out.tNow, endTime(mechanicsKinematics(out)))) return null;
  return out;
}

export function describeMechanicsAnalysis(inputs: MechanicsInputs): string {
  if (inputs.mode === "projectile") {
    const p = inputs.projectile;
    return `Projectile: ${p.speed} m/s at ${p.angleDeg}° from ${p.y0} m, g = ${p.g} m/s²`.slice(0, 300);
  }
  const c = inputs.constant;
  return `Constant acceleration: a = (${c.ax}, ${c.ay}) m/s², v₀ = (${c.vx0}, ${c.vy0}) m/s`.slice(0, 300);
}

// ---- resistor circuits -------------------------------------------------------------------------------------------------------

export type CircuitsInputs = {
  subject: "physics";
  tool: "circuits";
  circuit: Circuit;
  /** The id of the inspected component, or null. */
  selected: string | null;
};

export const DEFAULT_CIRCUITS_INPUTS: CircuitsInputs = { subject: "physics", tool: "circuits", circuit: DEFAULT_CIRCUIT, selected: null };

function containsId(n: CircuitNode, id: string): boolean {
  return n.id === id || (n.kind !== "resistor" && n.children.some((c) => containsId(c, id)));
}

export function validateCircuitsInputs(raw: unknown): CircuitsInputs | null {
  if (!isObject(raw) || raw.subject !== "physics" || raw.tool !== "circuits") return null;
  const circuit = validateCircuit(raw.circuit);
  if (!circuit.ok) return null;
  if (raw.selected !== null && (typeof raw.selected !== "string" || !containsId(circuit.value.root, raw.selected))) return null;
  return { subject: "physics", tool: "circuits", circuit: circuit.value, selected: raw.selected };
}

export function describeCircuitsAnalysis(inputs: CircuitsInputs): string {
  return `Resistor network ${describeStructure(inputs.circuit.root)} at ${inputs.circuit.voltage} V`.slice(0, 300);
}

// ---- RC transient ------------------------------------------------------------------------------------------------------------

export type RcInputs = {
  subject: "physics";
  tool: "rc";
  rc: RcInput;
  tNow: number;
  speed: SpeedChoice;
};

export const DEFAULT_RC_INPUTS: RcInputs = { subject: "physics", tool: "rc", rc: DEFAULT_RC, tNow: 0, speed: "real" };

export function validateRcInputs(raw: unknown): RcInputs | null {
  if (!isObject(raw) || raw.subject !== "physics" || raw.tool !== "rc") return null;
  const rc = validateRc(raw.rc);
  if (!rc.ok) return null;
  if (typeof raw.speed !== "string" || !SPEED_CHOICES.includes(raw.speed as SpeedChoice)) return null;
  if (!finite(raw.tNow) || !withinEnd(raw.tNow, rcEnd(rc.value))) return null;
  return { subject: "physics", tool: "rc", rc: rc.value, tNow: raw.tNow, speed: raw.speed as SpeedChoice };
}

export function describeRcAnalysis(inputs: RcInputs): string {
  const { Vs, V0, R, C } = inputs.rc;
  return `RC transient: ${Vs} V source, ${V0} V initial, R = ${R} Ω, C = ${C} F`.slice(0, 300);
}

// ---- forces, energy and collisions (Stage 14) ---------------------------------------------------------------------------------

import { analyzeEnergy, validateEnergyInput, type EnergyInput } from "../physics/energy";
import { solveCollision, validateCollisionInput, type CollisionInput } from "../physics/collisions";
import { DEFAULT_FORCE_INPUT, validateForceInput, type ForceId, type ForceInput } from "../physics/forces";
import { DEFAULT_COLLISION_INPUT } from "../physics/collisions";
import { DEFAULT_ENERGY_INPUT } from "../physics/energy";

export const FORCES_ENGINE_VERSION = 1;
export const ENERGY_ENGINE_VERSION = 1;
export const COLLISIONS_ENGINE_VERSION = 1;

const FORCE_IDS: readonly ForceId[] = ["weight", "normal", "friction", "applied", "tension", "hangingWeight"];

export type ForcesInputs = {
  subject: "physics";
  tool: "forces";
  input: ForceInput;
  /** The simulation time shown (s) and the force being inspected. */
  tNow: number;
  speed: SpeedChoice;
  selected: ForceId | null;
};
export const DEFAULT_FORCES_INPUTS: ForcesInputs = { subject: "physics", tool: "forces", input: DEFAULT_FORCE_INPUT, tNow: 0, speed: "real", selected: null };

export function validateForcesInputs(raw: unknown): ForcesInputs | null {
  if (!isObject(raw) || raw.subject !== "physics" || raw.tool !== "forces") return null;
  const input = validateForceInput(raw.input);
  if (!input.ok) return null;
  if (typeof raw.speed !== "string" || !SPEED_CHOICES.includes(raw.speed as SpeedChoice)) return null;
  if (raw.selected !== null && (typeof raw.selected !== "string" || !FORCE_IDS.includes(raw.selected as ForceId))) return null;
  if (!finite(raw.tNow) || !withinEnd(raw.tNow, input.value.duration)) return null;
  return { subject: "physics", tool: "forces", input: input.value, tNow: raw.tNow, speed: raw.speed as SpeedChoice, selected: raw.selected as ForceId | null };
}
export function describeForcesAnalysis(inputs: ForcesInputs): string {
  const i = inputs.input;
  return (i.mode === "pulley" ? `Forces: ${i.m} kg block with a ${i.m2} kg hanging mass, μk = ${i.muk}` : `Forces: ${i.m} kg on a ${i.theta}° surface, F = ${i.F} N, μs = ${i.mus}, μk = ${i.muk}`).slice(0, 300);
}

export type EnergyInputs = {
  subject: "physics";
  tool: "energy";
  input: EnergyInput;
  tNow: number;
  speed: SpeedChoice;
  /** Position (m, along the scenario's own coordinate) asked about in the "can it get there?" question. */
  target: number;
};
export const DEFAULT_ENERGY_INPUTS: EnergyInputs = { subject: "physics", tool: "energy", input: DEFAULT_ENERGY_INPUT, tNow: 0, speed: "real", target: 2 };

export function validateEnergyInputs(raw: unknown): EnergyInputs | null {
  if (!isObject(raw) || raw.subject !== "physics" || raw.tool !== "energy") return null;
  const input = validateEnergyInput(raw.input);
  if (!input.ok) return null;
  if (typeof raw.speed !== "string" || !SPEED_CHOICES.includes(raw.speed as SpeedChoice)) return null;
  if (!finite(raw.target) || Math.abs(raw.target) > 1e4) return null;
  if (!finite(raw.tNow) || !withinEnd(raw.tNow, analyzeEnergy(input.value).tEnd)) return null;
  return { subject: "physics", tool: "energy", input: input.value, tNow: raw.tNow, speed: raw.speed as SpeedChoice, target: raw.target };
}
export function describeEnergyAnalysis(inputs: EnergyInputs): string {
  const i = inputs.input;
  const name = { incline: `incline ${i.theta}°, μk = ${i.muk}`, flat: `rough surface, F = ${i.F} N, μk = ${i.muk}`, spring: `spring ${i.k} N/m compressed ${i.x0} m`, height: `height ${i.h0} m, v₀ = ${i.v0} m/s` }[i.scenario];
  return `Energy: ${i.m} kg, ${name}`.slice(0, 300);
}

export type CollisionsInputs = {
  subject: "physics";
  tool: "collisions";
  input: CollisionInput;
  tNow: number;
  speed: SpeedChoice;
};
export const DEFAULT_COLLISIONS_INPUTS: CollisionsInputs = { subject: "physics", tool: "collisions", input: DEFAULT_COLLISION_INPUT, tNow: 0, speed: "real" };

export function validateCollisionsInputs(raw: unknown): CollisionsInputs | null {
  if (!isObject(raw) || raw.subject !== "physics" || raw.tool !== "collisions") return null;
  const input = validateCollisionInput(raw.input);
  if (!input.ok) return null;
  if (typeof raw.speed !== "string" || !SPEED_CHOICES.includes(raw.speed as SpeedChoice)) return null;
  if (!finite(raw.tNow) || !withinEnd(raw.tNow, solveCollision(input.value).tEnd)) return null;
  return { subject: "physics", tool: "collisions", input: input.value, tNow: raw.tNow, speed: raw.speed as SpeedChoice };
}
export function describeCollisionsAnalysis(inputs: CollisionsInputs): string {
  const i = inputs.input;
  return `Collision: ${i.mA} kg at ${i.vA} m/s and ${i.mB} kg at ${i.vB} m/s, e = ${i.e}`.slice(0, 300);
}


// ---- waves and sound, geometric optics, interference and diffraction (Stage 21) ---------------------------------------------------

import {
  DEFAULT_DOPPLER, DEFAULT_RESONATOR, DEFAULT_SUPERPOSITION, DEFAULT_WAVE, dopplerGeometry, fundamentalFrequency, harmonicFrequency, superpositionEnd,
  validateDoppler, validateResonator, validateSuperposition, validateWave,
  type DopplerInput, type ResonatorInput, type SuperpositionInput, type WaveInput,
} from "../physics/waves";
import {
  DEFAULT_IMAGING, DEFAULT_REFRACTION, validateImaging, validateRefraction, type ImagingInput, type RefractionInput,
} from "../physics/optics";
import { DEFAULT_SLITS, validateSlits, type SlitInput } from "../physics/interference";

export const WAVES_ENGINE_VERSION = 1;
export const OPTICS_ENGINE_VERSION = 1;
export const INTERFERENCE_ENGINE_VERSION = 1;

export const WAVE_VIEWS = ["travel", "superposition", "standing", "doppler"] as const;
export type WaveView = (typeof WAVE_VIEWS)[number];
export const WAVE_VIEW_LABEL: Record<WaveView, string> = { travel: "Traveling wave", superposition: "Superposition and beats", standing: "Standing waves and resonance", doppler: "Doppler effect" };

export type WavesInputs = {
  subject: "physics";
  tool: "waves";
  view: WaveView;
  wave: WaveInput;
  /** Draw the wave as a longitudinal (compression) wave instead of a transverse one. */
  longitudinal: boolean;
  sup: SuperpositionInput;
  res: ResonatorInput;
  dop: DopplerInput;
  tNow: number;
  speed: SpeedChoice;
};
export const DEFAULT_WAVES_INPUTS: WavesInputs = {
  subject: "physics", tool: "waves", view: "travel", wave: DEFAULT_WAVE, longitudinal: false, sup: DEFAULT_SUPERPOSITION, res: DEFAULT_RESONATOR, dop: DEFAULT_DOPPLER, tNow: 0, speed: "real",
};

/** End of the time axis for the page that is showing (s). */
export function wavesEnd(i: Pick<WavesInputs, "view" | "wave" | "sup" | "res" | "dop">): number {
  if (i.view === "travel") return 3 / i.wave.f;
  if (i.view === "superposition") return superpositionEnd(i.sup);
  if (i.view === "standing") return 3 / harmonicFrequency(i.res.kind, i.res.L, i.res.v, i.res.n);
  // The Doppler picture is dimensionless: time in source periods.
  return dopplerGeometry(i.dop).tEnd;
}

export function validateWavesInputs(raw: unknown): WavesInputs | null {
  if (!isObject(raw) || raw.subject !== "physics" || raw.tool !== "waves") return null;
  if (typeof raw.view !== "string" || !(WAVE_VIEWS as readonly string[]).includes(raw.view)) return null;
  if (typeof raw.longitudinal !== "boolean") return null;
  const wave = validateWave(raw.wave);
  const sup = validateSuperposition(raw.sup);
  const res = validateResonator(raw.res);
  const dop = validateDoppler(raw.dop);
  if (!wave.ok || !sup.ok || !res.ok || !dop.ok) return null;
  if (typeof raw.speed !== "string" || !SPEED_CHOICES.includes(raw.speed as SpeedChoice)) return null;
  if (!finite(raw.tNow)) return null;
  const out: WavesInputs = { subject: "physics", tool: "waves", view: raw.view as WaveView, wave: wave.value, longitudinal: raw.longitudinal, sup: sup.value, res: res.value, dop: dop.value, tNow: raw.tNow, speed: raw.speed as SpeedChoice };
  if (!withinEnd(out.tNow, wavesEnd(out))) return null;
  return out;
}
export function describeWavesAnalysis(i: WavesInputs): string {
  if (i.view === "travel") return `Wave: ${i.wave.f} Hz, ${i.wave.v} m/s, A = ${i.wave.A} m, ${i.longitudinal ? "longitudinal" : "transverse"}`.slice(0, 300);
  if (i.view === "superposition") return `Superposition: ${i.sup.w1.f} Hz and ${i.sup.w2.f} Hz in a ${i.sup.v} m/s medium`.slice(0, 300);
  if (i.view === "standing") return `${i.res.kind === "string" ? "String" : i.res.kind === "open" ? "Open pipe" : "Closed pipe"}: L = ${i.res.L} m, harmonic ${i.res.n}, f = ${Number(harmonicFrequency(i.res.kind, i.res.L, i.res.v, i.res.n).toPrecision(4))} Hz`.slice(0, 300);
  return `Doppler: ${i.dop.fs} Hz, source ${i.dop.vs} m/s, observer ${i.dop.vo} m/s, c = ${i.dop.c} m/s`.slice(0, 300);
}
export { fundamentalFrequency };

export const OPTICS_VIEWS = ["imaging", "refraction"] as const;
export type OpticsView = (typeof OPTICS_VIEWS)[number];
export type OpticsInputs = { subject: "physics"; tool: "optics"; view: OpticsView; imaging: ImagingInput; refraction: RefractionInput };
export const DEFAULT_OPTICS_INPUTS: OpticsInputs = { subject: "physics", tool: "optics", view: "imaging", imaging: DEFAULT_IMAGING, refraction: DEFAULT_REFRACTION };

export function validateOpticsInputs(raw: unknown): OpticsInputs | null {
  if (!isObject(raw) || raw.subject !== "physics" || raw.tool !== "optics") return null;
  if (typeof raw.view !== "string" || !(OPTICS_VIEWS as readonly string[]).includes(raw.view)) return null;
  const imaging = validateImaging(raw.imaging);
  const refraction = validateRefraction(raw.refraction);
  if (!imaging.ok || !refraction.ok) return null;
  return { subject: "physics", tool: "optics", view: raw.view as OpticsView, imaging: imaging.value, refraction: refraction.value };
}
export function describeOpticsAnalysis(i: OpticsInputs): string {
  if (i.view === "refraction") return `Refraction: n = ${i.refraction.n1} to ${i.refraction.n2} at ${i.refraction.theta1}°`.slice(0, 300);
  const g = i.imaging;
  return `${g.element === "lens" ? (g.f > 0 ? "Converging lens" : "Diverging lens") : g.f > 0 ? "Concave mirror" : "Convex mirror"}: f = ${g.f} cm, object at ${g.s} cm`.slice(0, 300);
}

export type InterferenceInputs = {
  subject: "physics";
  tool: "interference";
  slits: SlitInput;
  /** Height of the probe point on the screen, from the centre (mm). */
  probeMm: number;
};
export const DEFAULT_INTERFERENCE_INPUTS: InterferenceInputs = { subject: "physics", tool: "interference", slits: DEFAULT_SLITS, probeMm: 4 };

export function validateInterferenceInputs(raw: unknown): InterferenceInputs | null {
  if (!isObject(raw) || raw.subject !== "physics" || raw.tool !== "interference") return null;
  const slits = validateSlits(raw.slits);
  if (!slits.ok) return null;
  if (!finite(raw.probeMm) || Math.abs(raw.probeMm) > 1000 * slits.value.L * 0.5) return null;
  return { subject: "physics", tool: "interference", slits: slits.value, probeMm: raw.probeMm };
}
export function describeInterferenceAnalysis(i: InterferenceInputs): string {
  const s = i.slits;
  return (s.N === 1 ? `Single slit: a = ${s.aUm} µm, λ = ${s.lambdaNm} nm` : s.N === 2 ? `Double slit: d = ${s.dUm} µm, a = ${s.aUm} µm, λ = ${s.lambdaNm} nm` : `${s.N}-slit grating: d = ${s.dUm} µm, λ = ${s.lambdaNm} nm`).slice(0, 300);
}