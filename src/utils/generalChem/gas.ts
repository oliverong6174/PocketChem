/**
 * Ideal-gas model for the Gas Laboratory (pure). Internal units are SI: pressure in Pa, volume in m³, amount in mol, temperature in K, with
 * R = 8.314 462 618 J/(mol·K) (CODATA 2018, exact in the 2019 SI). Every law here is a special case of PV = nRT; temperatures are converted to
 * kelvin before any calculation and must stay above 0 K.
 *
 * Scope: ideal gas, ideal mixture (Dalton), classical kinetic theory with translational energy only, and the Maxwell–Boltzmann speed
 * distribution of a classical three-dimensional ideal gas. Real gases (attraction, finite molecular size, condensation) are not modelled.
 */
import { parseFormula } from "./formula";

export const R_GAS = 8.314462618;
export const K_BOLTZMANN = 1.380649e-23;
export const N_AVOGADRO = 6.02214076e23;
export const ZERO_C_IN_K = 273.15;
export const ATM_PA = 101325;

export type PressureUnit = "Pa" | "kPa" | "atm" | "bar" | "mmHg";
export type VolumeUnit = "m3" | "L" | "mL";
export type TemperatureUnit = "K" | "C";
export const PRESSURE_UNITS: Record<PressureUnit, { label: string; toPa: number }> = {
  Pa: { label: "Pa", toPa: 1 }, kPa: { label: "kPa", toPa: 1000 }, atm: { label: "atm", toPa: ATM_PA }, bar: { label: "bar", toPa: 1e5 }, mmHg: { label: "mmHg (torr)", toPa: ATM_PA / 760 },
};
export const VOLUME_UNITS: Record<VolumeUnit, { label: string; toM3: number }> = { m3: { label: "m³", toM3: 1 }, L: { label: "L", toM3: 1e-3 }, mL: { label: "mL", toM3: 1e-6 } };
export const TEMPERATURE_UNITS: Record<TemperatureUnit, { label: string }> = { K: { label: "K" }, C: { label: "°C" } };

export const pressureToPa = (v: number, u: PressureUnit) => v * PRESSURE_UNITS[u].toPa;
export const pressureFromPa = (pa: number, u: PressureUnit) => pa / PRESSURE_UNITS[u].toPa;
export const volumeToM3 = (v: number, u: VolumeUnit) => v * VOLUME_UNITS[u].toM3;
export const volumeFromM3 = (m3: number, u: VolumeUnit) => m3 / VOLUME_UNITS[u].toM3;
export const temperatureToK = (v: number, u: TemperatureUnit) => (u === "K" ? v : v + ZERO_C_IN_K);
export const temperatureFromK = (k: number, u: TemperatureUnit) => (u === "K" ? k : k - ZERO_C_IN_K);

export const GAS_LIMITS = { minT: 1, maxT: 5000, minP: 1, maxP: 1e9, minV: 1e-9, maxV: 1e4, minN: 1e-9, maxN: 1e6 } as const;

export interface GasState { P: number; V: number; n: number; T: number }
export type GasUnknown = "P" | "V" | "n" | "T";

/** Check that one state variable is physically usable (SI). Returns an error text or null. */
export function checkVariable(name: GasUnknown, v: number): string | null {
  if (!Number.isFinite(v)) return "Enter a number.";
  if (name === "T") {
    if (v <= 0) return "The absolute temperature must be above 0 K (below −273.15 °C is impossible for this model).";
    if (v < GAS_LIMITS.minT || v > GAS_LIMITS.maxT) return `The ideal-gas model is limited to ${GAS_LIMITS.minT}–${GAS_LIMITS.maxT} K here.`;
    return null;
  }
  const lim = { P: [GAS_LIMITS.minP, GAS_LIMITS.maxP, "pressure"], V: [GAS_LIMITS.minV, GAS_LIMITS.maxV, "volume"], n: [GAS_LIMITS.minN, GAS_LIMITS.maxN, "amount"] }[name];
  if (v <= 0) return `The ${lim[2]} must be above zero.`;
  if (v < lim[0] || v > lim[1]) return `The ${lim[2]} is outside the supported range.`;
  return null;
}

/** PV = nRT solved for the unknown from the other three (SI). */
export function solveIdeal(unknown: GasUnknown, s: Partial<GasState>): number {
  const { P, V, n, T } = s;
  if (unknown === "P") return (n! * R_GAS * T!) / V!;
  if (unknown === "V") return (n! * R_GAS * T!) / P!;
  if (unknown === "n") return (P! * V!) / (R_GAS * T!);
  return (P! * V!) / (n! * R_GAS);
}
export const pressureOf = (n: number, T: number, V: number) => (n * R_GAS * T) / V;

export interface CalcInput {
  unknown: GasUnknown;
  P: { v: number; u: PressureUnit };
  V: { v: number; u: VolumeUnit };
  n: number;
  T: { v: number; u: TemperatureUnit };
}
export type CalcResult = { ok: true; state: GasState; unknownValue: number } | { ok: false; errors: string[] };
/** The three known quantities, in the units chosen, give the fourth. */
export function calculateIdeal(c: CalcInput): CalcResult {
  const errors: string[] = [];
  const si: Partial<GasState> = {};
  if (c.unknown !== "P") { si.P = pressureToPa(c.P.v, c.P.u); const e = checkVariable("P", si.P); if (e) errors.push(`Pressure: ${e}`); }
  if (c.unknown !== "V") { si.V = volumeToM3(c.V.v, c.V.u); const e = checkVariable("V", si.V); if (e) errors.push(`Volume: ${e}`); }
  if (c.unknown !== "n") { si.n = c.n; const e = checkVariable("n", c.n); if (e) errors.push(`Amount: ${e}`); }
  if (c.unknown !== "T") { si.T = temperatureToK(c.T.v, c.T.u); const e = checkVariable("T", si.T); if (e) errors.push(`Temperature: ${e}`); }
  if (errors.length) return { ok: false, errors };
  const value = solveIdeal(c.unknown, si);
  const state = { ...si, [c.unknown]: value } as GasState;
  const e = checkVariable(c.unknown, value);
  if (e) return { ok: false, errors: [`The result is outside the supported range: ${e}`] };
  return { ok: true, state, unknownValue: value };
}

// ---- controlled processes -----------------------------------------------------------------------------------------------------------

export type GasProcess = "isothermal" | "isochoric" | "isobaric" | "amountP" | "amountV";
export const GAS_PROCESSES: Array<{ id: GasProcess; label: string; law: string; held: string[]; controlled: "V" | "T" | "n"; dependent: GasUnknown }> = [
  { id: "isothermal", label: "Isothermal compression/expansion", law: "Boyle's law: PV = constant", held: ["T", "n"], controlled: "V", dependent: "P" },
  { id: "isochoric", label: "Isochoric heating/cooling", law: "Gay-Lussac's law: P/T = constant", held: ["V", "n"], controlled: "T", dependent: "P" },
  { id: "isobaric", label: "Isobaric expansion/contraction", law: "Charles's law: V/T = constant", held: ["P", "n"], controlled: "T", dependent: "V" },
  { id: "amountP", label: "Adding gas at constant pressure and temperature", law: "Avogadro's law: V/n = constant", held: ["P", "T"], controlled: "n", dependent: "V" },
  { id: "amountV", label: "Adding gas in a rigid container at constant temperature", law: "P/n = constant at fixed V and T", held: ["V", "T"], controlled: "n", dependent: "P" },
];
export const processInfo = (p: GasProcess) => GAS_PROCESSES.find((x) => x.id === p) as (typeof GAS_PROCESSES)[number];

export interface ContainerInput {
  /** Initial volume (L), temperature (°C) and amount (mol); the initial pressure follows from PV = nRT. */
  VL: number;
  TC: number;
  n: number;
  process: GasProcess;
  /** Final value of the controlled variable: V (L), T (°C) or n (mol) as the process says. */
  target: number;
}
export const DEFAULT_CONTAINER: ContainerInput = { VL: 10, TC: 25, n: 0.5, process: "isothermal", target: 5 };

export function initialState(c: ContainerInput): GasState {
  const V = c.VL * 1e-3; const T = c.TC + ZERO_C_IN_K;
  return { V, T, n: c.n, P: pressureOf(c.n, T, V) };
}
export type ContainerResult = { ok: true; s1: GasState; s2: GasState } | { ok: false; errors: string[] };
export function runProcess(c: ContainerInput): ContainerResult {
  const errors: string[] = [];
  const V1 = c.VL * 1e-3; const T1 = c.TC + ZERO_C_IN_K;
  const e1 = checkVariable("V", V1); if (e1) errors.push(`Initial volume: ${e1}`);
  const e2 = checkVariable("T", T1); if (e2) errors.push(`Initial temperature: ${e2}`);
  const e3 = checkVariable("n", c.n); if (e3) errors.push(`Amount of gas: ${e3}`);
  if (errors.length) return { ok: false, errors };
  const s1 = initialState(c);
  let s2: GasState;
  const info = processInfo(c.process);
  if (info.controlled === "V") {
    const V2 = c.target * 1e-3; const e = checkVariable("V", V2); if (e) return { ok: false, errors: [`Final volume: ${e}`] };
    s2 = { ...s1, V: V2, P: pressureOf(s1.n, s1.T, V2) };
  } else if (info.controlled === "T") {
    const T2 = c.target + ZERO_C_IN_K; const e = checkVariable("T", T2); if (e) return { ok: false, errors: [`Final temperature: ${e}`] };
    s2 = c.process === "isochoric" ? { ...s1, T: T2, P: pressureOf(s1.n, T2, s1.V) } : { ...s1, T: T2, V: solveIdeal("V", { P: s1.P, n: s1.n, T: T2 }) };
  } else {
    const n2 = c.target; const e = checkVariable("n", n2); if (e) return { ok: false, errors: [`Final amount: ${e}`] };
    s2 = c.process === "amountP" ? { ...s1, n: n2, V: solveIdeal("V", { P: s1.P, n: n2, T: s1.T }) } : { ...s1, n: n2, P: pressureOf(n2, s1.T, s1.V) };
  }
  for (const k of ["P", "V", "n", "T"] as const) { const e = checkVariable(k, s2[k]); if (e) return { ok: false, errors: [`The final ${k === "P" ? "pressure" : k === "V" ? "volume" : k === "n" ? "amount" : "temperature"} would be outside the supported range: ${e}`] }; }
  return { ok: true, s1, s2 };
}

/** Points of the constrained process between two values of the controlled variable (for graphs). */
export function processCurve(c: ContainerInput, from: number, to: number, count = 121): GasState[] {
  const info = processInfo(c.process);
  const s1 = initialState(c);
  const out: GasState[] = [];
  for (let k = 0; k < count; k += 1) {
    const x = from + ((to - from) * k) / (count - 1);
    let s: GasState;
    if (info.controlled === "V") s = { ...s1, V: x * 1e-3, P: pressureOf(s1.n, s1.T, x * 1e-3) };
    else if (info.controlled === "T") { const T = x + ZERO_C_IN_K; s = c.process === "isochoric" ? { ...s1, T, P: pressureOf(s1.n, T, s1.V) } : { ...s1, T, V: solveIdeal("V", { P: s1.P, n: s1.n, T }) }; }
    else s = c.process === "amountP" ? { ...s1, n: x, V: solveIdeal("V", { P: s1.P, n: x, T: s1.T }) } : { ...s1, n: x, P: pressureOf(x, s1.T, s1.V) };
    out.push(s);
  }
  return out;
}

/** P·V / (n·T) = R for any ideal state; equal at both ends of any process (the combined gas law). */
export const combinedInvariant = (s: GasState) => (s.P * s.V) / (s.n * s.T);
/** Final pressure from the combined gas law P1V1/(n1T1) = P2V2/(n2T2). */
export const combinedPressure = (s1: GasState, V2: number, n2: number, T2: number) => (s1.P * s1.V * n2 * T2) / (s1.n * s1.T * V2);

/** Density of an ideal gas of molar mass M (g/mol): ρ = PM/(RT), in g/L. */
export const gasDensityGperL = (P: number, T: number, molarMassGperMol: number) => (P * molarMassGperMol) / (R_GAS * T) / 1000;
export const molarVolumeLitres = (P: number, T: number) => ((R_GAS * T) / P) * 1000;

// ---- curated gases, mixtures, kinetic theory ---------------------------------------------------------------------------------------

export const GAS_SPECIES: Array<{ formula: string; name: string }> = [
  { formula: "He", name: "helium" }, { formula: "Ne", name: "neon" }, { formula: "Ar", name: "argon" }, { formula: "Kr", name: "krypton" },
  { formula: "H2", name: "hydrogen" }, { formula: "N2", name: "nitrogen" }, { formula: "O2", name: "oxygen" }, { formula: "F2", name: "fluorine" }, { formula: "Cl2", name: "chlorine" },
  { formula: "CO", name: "carbon monoxide" }, { formula: "CO2", name: "carbon dioxide" }, { formula: "NO", name: "nitric oxide" }, { formula: "N2O", name: "nitrous oxide" },
  { formula: "CH4", name: "methane" }, { formula: "C2H6", name: "ethane" }, { formula: "C3H8", name: "propane" }, { formula: "NH3", name: "ammonia" }, { formula: "H2O", name: "water vapour" },
  { formula: "H2S", name: "hydrogen sulfide" }, { formula: "SO2", name: "sulfur dioxide" }, { formula: "HCl", name: "hydrogen chloride" },
];
export const isGasSpecies = (f: string) => GAS_SPECIES.some((g) => g.formula === f);
export const gasMolarMass = (f: string): number | null => { if (!isGasSpecies(f)) return null; const p = parseFormula(f); return p.ok ? p.value.mass : null; };

export interface MixtureInput { components: Array<{ formula: string; mol: number }>; VL: number; TC: number }
export const MIXTURE_LIMITS = { minComponents: 1, maxComponents: 5 } as const;
export const DEFAULT_MIXTURE: MixtureInput = { components: [{ formula: "N2", mol: 0.78 }, { formula: "O2", mol: 0.21 }, { formula: "Ar", mol: 0.01 }], VL: 24.4, TC: 25 };
export interface MixtureRow { formula: string; mol: number; x: number; partialPa: number; massG: number }
export type MixtureResult = { ok: true; totalPa: number; totalMol: number; avgMolarMass: number; densityGperL: number; rows: MixtureRow[]; T: number; V: number } | { ok: false; errors: string[] };

/** Dalton's law for an ideal-gas mixture: P_i = x_i P_total with x_i = n_i / n_total and P_total = n_total RT/V. */
export function solveMixture(m: MixtureInput): MixtureResult {
  const errors: string[] = [];
  if (m.components.length < MIXTURE_LIMITS.minComponents || m.components.length > MIXTURE_LIMITS.maxComponents) errors.push(`A mixture has from ${MIXTURE_LIMITS.minComponents} to ${MIXTURE_LIMITS.maxComponents} gases.`);
  const seen = new Set<string>();
  m.components.forEach((c, i) => {
    if (!isGasSpecies(c.formula)) errors.push(`Gas ${i + 1}: "${c.formula}" is not one of the supported gases.`);
    if (seen.has(c.formula)) errors.push(`Gas ${i + 1}: ${c.formula} is listed twice.`);
    seen.add(c.formula);
    if (!Number.isFinite(c.mol) || c.mol < 0 || c.mol > GAS_LIMITS.maxN) errors.push(`Gas ${i + 1}: the amount must be a number of moles from 0 up.`);
  });
  const V = m.VL * 1e-3; const T = m.TC + ZERO_C_IN_K;
  const ev = checkVariable("V", V); if (ev) errors.push(`Volume: ${ev}`);
  const et = checkVariable("T", T); if (et) errors.push(`Temperature: ${et}`);
  const totalMol = m.components.reduce((s, c) => s + (Number.isFinite(c.mol) ? c.mol : 0), 0);
  if (!errors.length && totalMol <= 0) errors.push("The mixture needs some gas: give at least one amount above zero.");
  if (errors.length) return { ok: false, errors };
  const totalPa = pressureOf(totalMol, T, V);
  const ep = checkVariable("P", totalPa); if (ep) return { ok: false, errors: [`Total pressure: ${ep}`] };
  const rows = m.components.map((c) => ({ formula: c.formula, mol: c.mol, x: c.mol / totalMol, partialPa: (c.mol / totalMol) * totalPa, massG: c.mol * (gasMolarMass(c.formula) as number) }));
  const massTotal = rows.reduce((s, r) => s + r.massG, 0);
  return { ok: true, totalPa, totalMol, avgMolarMass: massTotal / totalMol, densityGperL: massTotal / (V * 1000), rows, T, V };
}

/** Molecular mass in kg per molecule from a molar mass in g/mol. */
export const moleculeMassKg = (molarMassGperMol: number) => molarMassGperMol / 1000 / N_AVOGADRO;
export const rmsSpeed = (T: number, molarMassGperMol: number) => Math.sqrt((3 * R_GAS * T) / (molarMassGperMol / 1000));
export const meanSpeed = (T: number, molarMassGperMol: number) => Math.sqrt((8 * R_GAS * T) / (Math.PI * (molarMassGperMol / 1000)));
export const mostProbableSpeed = (T: number, molarMassGperMol: number) => Math.sqrt((2 * R_GAS * T) / (molarMassGperMol / 1000));
/** Mean translational kinetic energy of one molecule, (3/2) k_B T (J). Independent of the molecular mass. */
export const meanKineticEnergy = (T: number) => 1.5 * K_BOLTZMANN * T;
export const meanKineticEnergyPerMole = (T: number) => 1.5 * R_GAS * T;

/** Maxwell–Boltzmann speed density f(v) in s/m for a classical 3-D ideal gas: 4π (m/2πkT)^{3/2} v² exp(−mv²/2kT). Integrates to 1. */
export function mbDensity(v: number, T: number, molarMassGperMol: number): number {
  const m = moleculeMassKg(molarMassGperMol);
  const a = m / (2 * K_BOLTZMANN * T);
  return 4 * Math.PI * (a / Math.PI) ** 1.5 * v * v * Math.exp(-a * v * v);
}
/** Fraction of molecules with a speed between v0 and v1 (Simpson integration of the density). */
export function mbFraction(v0: number, v1: number, T: number, molarMassGperMol: number, steps = 2000): number {
  if (v1 <= v0) return 0;
  const n = steps % 2 === 0 ? steps : steps + 1;
  const h = (v1 - v0) / n;
  let s = mbDensity(v0, T, molarMassGperMol) + mbDensity(v1, T, molarMassGperMol);
  for (let k = 1; k < n; k += 1) s += (k % 2 ? 4 : 2) * mbDensity(v0 + k * h, T, molarMassGperMol);
  return (s * h) / 3;
}
/** Fraction of molecules faster than v (integrates out to 12 most-probable speeds, beyond which the density is below 1e-60). */
export const mbFractionAbove = (v: number, T: number, molarMassGperMol: number) => mbFraction(v, Math.max(v, 12 * mostProbableSpeed(T, molarMassGperMol)), T, molarMassGperMol, 4000);

export interface KineticInput { a: string; b: string; TaC: number; TbC: number }
export const DEFAULT_KINETIC: KineticInput = { a: "H2", b: "N2", TaC: 25, TbC: 25 };
export type KineticResult = { ok: true; rows: Array<{ formula: string; T: number; M: number; vrms: number; vmean: number; vmp: number; keJ: number; keKJperMol: number }> } | { ok: false; errors: string[] };
export function solveKinetic(k: KineticInput): KineticResult {
  const errors: string[] = [];
  for (const [which, f, tc] of [["Gas A", k.a, k.TaC], ["Gas B", k.b, k.TbC]] as const) {
    if (!isGasSpecies(f)) errors.push(`${which}: "${f}" is not one of the supported gases.`);
    const e = checkVariable("T", tc + ZERO_C_IN_K); if (e) errors.push(`${which} temperature: ${e}`);
  }
  if (errors.length) return { ok: false, errors };
  const row = (f: string, tc: number) => {
    const T = tc + ZERO_C_IN_K; const M = gasMolarMass(f) as number;
    return { formula: f, T, M, vrms: rmsSpeed(T, M), vmean: meanSpeed(T, M), vmp: mostProbableSpeed(T, M), keJ: meanKineticEnergy(T), keKJperMol: meanKineticEnergyPerMole(T) / 1000 };
  };
  return { ok: true, rows: [row(k.a, k.TaC), row(k.b, k.TbC)] };
}
