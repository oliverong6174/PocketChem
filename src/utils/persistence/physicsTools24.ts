/**
 * Saved state of the Stage 24 Physics tools (persisted pages "efield", "magnetic", "induction"; subject "physics").
 *
 * Inputs hold every scientific setting (charges, currents, fields, particle properties, circuit values), the selected object, the
 * simulation time and the learning mode. Every number shown (fields, potentials, forces, trajectories, flux, EMF, currents) is
 * re-derived from them when a record is opened. Validators build new objects from known fields, reject unknown ids, singular or
 * contradictory configurations (a probe on a charge, a time beyond the end of the run) and never coerce.
 */
import {
  MIN_SEPARATION, Q_RANGE, WORLD, DEFAULT_UNIFORM, PRESETS, validateCharges, validateUniform, type PointCharge, type UniformFieldInput,
} from "../physics/electrostatics";
import {
  DEFAULT_LOOP, DEFAULT_LORENTZ, DEFAULT_MOTION, DEFAULT_SOLENOID, MIN_WIRE_DISTANCE, WIRE_WORLD, validateLoop, validateLorentz, validateMotion, validateSolenoid, validateWires,
  v3, type LoopInput, type LorentzInput, type MotionInput, type SolenoidInput, type Vec3, type Wire,
} from "../physics/magnetism";
import {
  DEFAULT_FARADAY, DEFAULT_FLUX, DEFAULT_GENERATOR, DEFAULT_MOTIONAL, DEFAULT_RL, generatorDuration, rlEnd, validateFaraday, validateFlux, validateGenerator, validateMotional, validateRl,
  type FaradayInput, type FluxInput, type GeneratorInput, type MotionalInput, type RlInput,
} from "../physics/induction";
import { SPEED_CHOICES, type SpeedChoice } from "../physics/simClock";
import type { LearningMode } from "../../components/ui/LearningModeSwitch";

export const EFIELD_ENGINE_VERSION = 1;
export const MAGNETIC_ENGINE_VERSION = 1;
export const INDUCTION_ENGINE_VERSION = 1;

const MODES: readonly LearningMode[] = ["explore", "practice", "challenge"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const validMode = (v: unknown): v is LearningMode => typeof v === "string" && (MODES as readonly string[]).includes(v);
const validChallenge = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10000;
const validSpeed = (v: unknown): v is SpeedChoice => typeof v === "string" && (SPEED_CHOICES as readonly string[]).includes(v);
/** A saved time may exceed the end of the run only by round-off. */
const withinEnd = (t: unknown, end: number): t is number => finite(t) && t >= 0 && t <= end * (1 + 1e-9) + 1e-15;

// ---- electric fields ------------------------------------------------------------------------------------------------------------

export type EfieldView = "field" | "potential" | "particle";
export const EFIELD_VIEWS: readonly EfieldView[] = ["field", "potential", "particle"];
export type EfieldInputs = {
  subject: "physics"; tool: "efield";
  view: EfieldView;
  charges: PointCharge[];
  /** The charge selected in the diagram (null = none). */
  selected: string | null;
  /** The field-sampling point and the test charge placed there (signed coulombs). */
  probe: { x: number; y: number };
  qTest: number;
  showArrows: boolean; showLines: boolean; showContours: boolean;
  /** Potential values (volts) whose equipotential contours are drawn; at most five. */
  levels: number[];
  particle: UniformFieldInput;
  tNow: number; speed: SpeedChoice;
  mode: LearningMode; challenge: number;
};
export const DEFAULT_EFIELD_INPUTS: EfieldInputs = {
  subject: "physics", tool: "efield", view: "field", charges: PRESETS.dipole.charges, selected: null, probe: { x: 0, y: 1 }, qTest: 1e-9,
  showArrows: true, showLines: true, showContours: false, levels: [20, -20], particle: DEFAULT_UNIFORM, tNow: 0, speed: "fit", mode: "explore", challenge: 0,
};
export function validateEfieldInputs(raw: unknown): EfieldInputs | null {
  if (!isObject(raw) || raw.subject !== "physics" || raw.tool !== "efield" || !validMode(raw.mode) || !validChallenge(raw.challenge) || !validSpeed(raw.speed)) return null;
  if (typeof raw.view !== "string" || !(EFIELD_VIEWS as readonly string[]).includes(raw.view)) return null;
  const charges = validateCharges(raw.charges); if (!charges.ok) return null;
  const particle = validateUniform(raw.particle); if (!particle.ok) return null;
  const pr = raw.probe;
  if (!isObject(pr) || !finite(pr.x) || !finite(pr.y) || pr.x < WORLD.xMin || pr.x > WORLD.xMax || pr.y < WORLD.yMin || pr.y > WORLD.yMax) return null;
  const px = pr.x, py = pr.y;
  if (charges.value.some((c) => Math.hypot(c.x - px, c.y - py) < MIN_SEPARATION)) return null; // the field is singular at a source
  if (!finite(raw.qTest) || Math.abs(raw.qTest) < Q_RANGE[0] || Math.abs(raw.qTest) > Q_RANGE[1]) return null;
  if (typeof raw.showArrows !== "boolean" || typeof raw.showLines !== "boolean" || typeof raw.showContours !== "boolean") return null;
  if (!Array.isArray(raw.levels) || raw.levels.length > 5 || !raw.levels.every((l) => finite(l) && Math.abs(l) >= 1e-3 && Math.abs(l) <= 1e6)) return null;
  let selected: string | null = null;
  if (raw.selected !== null) { if (typeof raw.selected !== "string" || !charges.value.some((c) => c.id === raw.selected)) return null; selected = raw.selected; }
  if (!withinEnd(raw.tNow, particle.value.duration)) return null;
  return {
    subject: "physics", tool: "efield", view: raw.view as EfieldView, charges: charges.value, selected, probe: { x: pr.x, y: pr.y }, qTest: raw.qTest,
    showArrows: raw.showArrows, showLines: raw.showLines, showContours: raw.showContours, levels: [...(raw.levels as number[])], particle: particle.value,
    tNow: raw.tNow, speed: raw.speed, mode: raw.mode, challenge: raw.challenge,
  };
}

// ---- magnetic fields ---------------------------------------------------------------------------------------------------------------

export type MagneticScenario = "wire" | "loop" | "solenoid" | "lorentz" | "motion" | "conductor";
export const MAGNETIC_SCENARIOS: readonly MagneticScenario[] = ["wire", "loop", "solenoid", "lorentz", "motion", "conductor"];
export interface ConductorInput { I: number; L: Vec3; B: Vec3 }
export const DEFAULT_CONDUCTOR: ConductorInput = { I: 5, L: v3(0.2, 0, 0), B: v3(0, 0, 0.3) };
export function validateConductor(raw: unknown): ConductorInput | null {
  if (!isObject(raw) || !finite(raw.I) || Math.abs(raw.I) < 1e-3 || Math.abs(raw.I) > 1e3) return null;
  const vec = (x: unknown, lim: number): Vec3 | null => (isObject(x) && finite(x.x) && finite(x.y) && finite(x.z) && Math.abs(x.x) <= lim && Math.abs(x.y) <= lim && Math.abs(x.z) <= lim ? v3(x.x, x.y, x.z) : null);
  const L = vec(raw.L, 10), B = vec(raw.B, 10);
  if (!L || !B || Math.hypot(L.x, L.y, L.z) < 1e-3) return null;
  return { I: raw.I, L, B };
}
export type MagneticInputs = {
  subject: "physics"; tool: "magnetic";
  scenario: MagneticScenario;
  wires: Wire[]; selectedWire: string | null; probe: { x: number; y: number };
  loop: LoopInput; solenoid: SolenoidInput;
  /** Position on the loop or solenoid axis where the field is read (m). */
  axisX: number;
  lorentz: LorentzInput; motion: MotionInput; conductor: ConductorInput;
  tNow: number; speed: SpeedChoice;
  mode: LearningMode; challenge: number;
};
export const DEFAULT_MAGNETIC_INPUTS: MagneticInputs = {
  subject: "physics", tool: "magnetic", scenario: "wire", wires: [{ id: "a", x: 0, y: 0, I: 10 }], selectedWire: null, probe: { x: 0.15, y: 0.1 },
  loop: DEFAULT_LOOP, solenoid: DEFAULT_SOLENOID, axisX: 0, lorentz: DEFAULT_LORENTZ, motion: DEFAULT_MOTION, conductor: DEFAULT_CONDUCTOR, tNow: 0, speed: "fit", mode: "explore", challenge: 0,
};
export function validateMagneticInputs(raw: unknown): MagneticInputs | null {
  if (!isObject(raw) || raw.subject !== "physics" || raw.tool !== "magnetic" || !validMode(raw.mode) || !validChallenge(raw.challenge) || !validSpeed(raw.speed)) return null;
  if (typeof raw.scenario !== "string" || !(MAGNETIC_SCENARIOS as readonly string[]).includes(raw.scenario)) return null;
  const wires = validateWires(raw.wires), loop = validateLoop(raw.loop), solenoid = validateSolenoid(raw.solenoid), lorentz = validateLorentz(raw.lorentz), motion = validateMotion(raw.motion);
  if (!wires.ok || !loop.ok || !solenoid.ok || !lorentz.ok || !motion.ok) return null;
  const conductor = validateConductor(raw.conductor); if (!conductor) return null;
  const pr = raw.probe;
  if (!isObject(pr) || !finite(pr.x) || !finite(pr.y) || pr.x < WIRE_WORLD.xMin || pr.x > WIRE_WORLD.xMax || pr.y < WIRE_WORLD.yMin || pr.y > WIRE_WORLD.yMax) return null;
  const px = pr.x, py = pr.y;
  if (wires.value.some((w) => Math.hypot(w.x - px, w.y - py) < MIN_WIRE_DISTANCE)) return null;
  if (!finite(raw.axisX) || Math.abs(raw.axisX) > 1) return null;
  let selectedWire: string | null = null;
  if (raw.selectedWire !== null) { if (typeof raw.selectedWire !== "string" || !wires.value.some((w) => w.id === raw.selectedWire)) return null; selectedWire = raw.selectedWire; }
  if (!withinEnd(raw.tNow, motion.value.duration)) return null;
  return {
    subject: "physics", tool: "magnetic", scenario: raw.scenario as MagneticScenario, wires: wires.value, selectedWire, probe: { x: pr.x, y: pr.y }, loop: loop.value, solenoid: solenoid.value,
    axisX: raw.axisX, lorentz: lorentz.value, motion: motion.value, conductor, tNow: raw.tNow, speed: raw.speed, mode: raw.mode, challenge: raw.challenge,
  };
}

// ---- induction ---------------------------------------------------------------------------------------------------------------------

export type InductionScenario = "flux" | "faraday" | "motional" | "generator" | "rl";
export const INDUCTION_SCENARIOS: readonly InductionScenario[] = ["flux", "faraday", "motional", "generator", "rl"];
export const MOTIONAL_RUN_S = 2; // duration of the rod animation
export type InductionInputs = {
  subject: "physics"; tool: "induction";
  scenario: InductionScenario;
  flux: FluxInput; faraday: FaradayInput; motional: MotionalInput; generator: GeneratorInput; rl: RlInput;
  tNow: number; speed: SpeedChoice;
  mode: LearningMode; challenge: number;
};
export const DEFAULT_INDUCTION_INPUTS: InductionInputs = {
  subject: "physics", tool: "induction", scenario: "faraday", flux: DEFAULT_FLUX, faraday: DEFAULT_FARADAY, motional: DEFAULT_MOTIONAL, generator: DEFAULT_GENERATOR, rl: DEFAULT_RL,
  tNow: 0, speed: "fit", mode: "explore", challenge: 0,
};
export const inductionEnd = (i: Pick<InductionInputs, "scenario" | "faraday" | "generator" | "rl">): number =>
  i.scenario === "faraday" ? i.faraday.duration : i.scenario === "generator" ? generatorDuration(i.generator) : i.scenario === "rl" ? rlEnd(i.rl) : i.scenario === "motional" ? MOTIONAL_RUN_S : 1;
export function validateInductionInputs(raw: unknown): InductionInputs | null {
  if (!isObject(raw) || raw.subject !== "physics" || raw.tool !== "induction" || !validMode(raw.mode) || !validChallenge(raw.challenge) || !validSpeed(raw.speed)) return null;
  if (typeof raw.scenario !== "string" || !(INDUCTION_SCENARIOS as readonly string[]).includes(raw.scenario)) return null;
  const flux = validateFlux(raw.flux), faraday = validateFaraday(raw.faraday), motional = validateMotional(raw.motional), generator = validateGenerator(raw.generator), rl = validateRl(raw.rl);
  if (!flux.ok || !faraday.ok || !motional.ok || !generator.ok || !rl.ok) return null;
  const out: InductionInputs = {
    subject: "physics", tool: "induction", scenario: raw.scenario as InductionScenario, flux: flux.value, faraday: faraday.value, motional: motional.value, generator: generator.value, rl: rl.value,
    tNow: 0, speed: raw.speed, mode: raw.mode, challenge: raw.challenge,
  };
  if (!withinEnd(raw.tNow, inductionEnd(out))) return null;
  out.tNow = raw.tNow;
  return out;
}

// ---- shared result summary and saved-analysis descriptions -----------------------------------------------------------------------------

const nano = (q: number) => { const a = Math.abs(q); const s = q < 0 ? "−" : "+"; return a >= 1e-6 ? `${s}${Number((a * 1e6).toPrecision(3))} µC` : `${s}${Number((a * 1e9).toPrecision(3))} nC`; };

export function describeEfieldAnalysis(i: EfieldInputs): string {
  const what = i.view === "particle" ? "uniform-field particle motion" : i.view === "potential" ? "electric potential" : "electric field";
  return `Electric ${what}: ${i.charges.length} charge${i.charges.length === 1 ? "" : "s"} (${i.charges.map((c) => nano(c.q)).join(", ")})`.slice(0, 300);
}
export function describeMagneticAnalysis(i: MagneticInputs): string {
  const names: Record<MagneticScenario, string> = {
    wire: `Straight-wire field: ${i.wires.length} wire${i.wires.length === 1 ? "" : "s"}`, loop: `Current loop: ${i.loop.N} turn${i.loop.N === 1 ? "" : "s"}, ${i.loop.I} A`,
    solenoid: `Solenoid: ${i.solenoid.n} turns/m, ${i.solenoid.I} A`, lorentz: "Lorentz force on a moving charge", motion: `Charged-particle motion in B = ${i.motion.Bz} T`, conductor: `Force on a conductor: ${i.conductor.I} A`,
  };
  return names[i.scenario].slice(0, 300);
}
export function describeInductionAnalysis(i: InductionInputs): string {
  const names: Record<InductionScenario, string> = {
    flux: `Magnetic flux: B = ${i.flux.B} T, A = ${i.flux.A} m², θ = ${i.flux.thetaDeg}°`, faraday: `Faraday's law: ${i.faraday.N} turns, dB/dt = ${i.faraday.bRate} T/s`,
    motional: `Motional EMF: B = ${i.motional.Bz} T, L = ${i.motional.L} m, v = ${i.motional.v} m/s`, generator: `AC generator: ${i.generator.N} turns, ${i.generator.frequency} Hz`,
    rl: `RL circuit: R = ${i.rl.R} Ω, L = ${i.rl.L} H`,
  };
  return names[i.scenario].slice(0, 300);
}
