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
