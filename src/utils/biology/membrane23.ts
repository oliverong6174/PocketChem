/**
 * Stage 23: cell membranes and transport. Pure, deterministic, typed models; no React.
 *
 * Units: concentrations in mM (= mol/m³ = µmol/cm³), voltages in mV, temperature in °C (converted to kelvin inside),
 * permeability in cm/s, fluxes in µmol cm⁻² s⁻¹, energies in kJ/mol.
 *
 * Sign convention: Vm = φ_inside − φ_outside. A positive passive flux is an INWARD flux. The free energy of moving one mole of
 * an ion inward is Δμ_in = zF(Vm − E_ion), where E_ion is the Nernst potential; the ion is driven inward when Δμ_in < 0.
 *
 * Everything here is a bounded teaching model (ideal solutions, constant field where GHK is used, symmetric simple carrier).
 * Nothing is fitted to a particular cell.
 */

export const R_GAS = 8.314462618; // J mol⁻¹ K⁻¹
export const FARADAY = 96485.33212; // C mol⁻¹
export const toKelvin = (tempC: number) => tempC + 273.15;
/** RT/F in millivolts at a temperature in °C. */
export const rtOverFMv = (tempC: number) => (1000 * R_GAS * toKelvin(tempC)) / FARADAY;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

export const TEMP_RANGE: [number, number] = [0, 50];
export const CONC_RANGE: [number, number] = [1e-6, 2000]; // mM
export const VM_RANGE: [number, number] = [-200, 100]; // mV

export const validTemp = (t: unknown): t is number => num(t) && t >= TEMP_RANGE[0] && t <= TEMP_RANGE[1];
export const validConc = (c: unknown): c is number => num(c) && c >= CONC_RANGE[0] && c <= CONC_RANGE[1];
export const validVm = (v: unknown): v is number => num(v) && v >= VM_RANGE[0] && v <= VM_RANGE[1];

// ---- ions ---------------------------------------------------------------------------------------------------------------------

export type IonId = "na" | "k" | "cl" | "ca";
export const ION_IDS: readonly IonId[] = ["na", "k", "cl", "ca"];
export const IONS: Record<IonId, { symbol: string; name: string; z: number }> = {
  na: { symbol: "Na⁺", name: "sodium", z: 1 },
  k: { symbol: "K⁺", name: "potassium", z: 1 },
  cl: { symbol: "Cl⁻", name: "chloride", z: -1 },
  ca: { symbol: "Ca²⁺", name: "calcium (free)", z: 2 },
};
export type Gradient = { out: number; in: number };
export type IonSet = Record<IonId, Gradient>;

/** Illustrative textbook values for a typical mammalian neuron (mM). Real values vary with cell type, species and conditions. */
export const TYPICAL_IONS: IonSet = {
  na: { out: 145, in: 12 },
  k: { out: 4, in: 140 },
  cl: { out: 110, in: 10 },
  ca: { out: 1.8, in: 0.0001 },
};

export function validateIonSet(raw: unknown): Result<IonSet> {
  if (!isObject(raw)) return fail("Ion concentrations must be an object.");
  const out = {} as IonSet;
  for (const id of ION_IDS) {
    const g = raw[id];
    if (!isObject(g) || !validConc(g.out) || !validConc(g.in)) return fail(`${IONS[id].symbol}: concentrations must be numbers between ${CONC_RANGE[0]} and ${CONC_RANGE[1]} mM.`);
    out[id] = { out: g.out, in: g.in };
  }
  return { ok: true, value: out };
}

/** Nernst equilibrium potential in mV: E = (RT/zF) ln([out]/[in]); z is the signed valence. */
export function nernstMv(z: number, cOut: number, cIn: number, tempC: number): number {
  if (!Number.isInteger(z) || z === 0) throw new RangeError("Valence must be a non-zero integer.");
  if (!(cOut > 0) || !(cIn > 0)) throw new RangeError("Concentrations must be positive.");
  return (rtOverFMv(tempC) / z) * Math.log(cOut / cIn);
}

export type Direction = "inward" | "outward" | "none";
/** Millivolt tolerance under which an ion is treated as being at electrochemical equilibrium. */
export const EQUILIBRIUM_TOL_MV = 0.05;

export interface IonDriving {
  ion: IonId; z: number;
  eMv: number; vmMv: number;
  /** Vm − E: positive means the electrical+chemical balance favours outward movement of a cation (see `direction`). */
  drivingMv: number;
  /** Contribution of the concentration gradient to the inward driving term, in mV-equivalents of Vm − E: the part that is −E. */
  chemicalMv: number;
  /** Contribution of the membrane potential: +Vm. chemicalMv + electricalMv = Vm − E. */
  electricalMv: number;
  deltaGInwardKJ: number;
  direction: Direction;
  /** Sign of the current carried by this ion if its channels open: outward positive. */
  currentSign: -1 | 0 | 1;
}

export function ionDriving(ion: IonId, g: Gradient, vmMv: number, tempC: number): IonDriving {
  const z = IONS[ion].z;
  const e = nernstMv(z, g.out, g.in, tempC);
  const driving = vmMv - e;
  const dG = (z * FARADAY * (driving / 1000)) / 1000;
  const near = Math.abs(driving) < EQUILIBRIUM_TOL_MV;
  // Δμ_in = zF(Vm − E): inward when z(Vm − E) < 0
  const s = z * driving;
  const direction: Direction = near ? "none" : s < 0 ? "inward" : "outward";
  // current convention: outward positive; an inward cation flow is negative, an outward cation flow positive, an inward anion flow is positive
  const flowSign = direction === "outward" ? 1 : direction === "inward" ? -1 : 0;
  const currentSign = (flowSign * Math.sign(z)) as -1 | 0 | 1;
  return { ion, z, eMv: e, vmMv, drivingMv: driving, chemicalMv: -e, electricalMv: vmMv, deltaGInwardKJ: dG, direction, currentSign };
}

/** Goldman–Hodgkin–Katz voltage for K⁺, Na⁺ and Cl⁻ (monovalent only), in mV. Permeabilities are relative and non-negative. */
export interface Permeabilities { k: number; na: number; cl: number }
export function ghkVoltageMv(set: IonSet, p: Permeabilities, tempC: number): number {
  const top = p.k * set.k.out + p.na * set.na.out + p.cl * set.cl.in;
  const bottom = p.k * set.k.in + p.na * set.na.in + p.cl * set.cl.out;
  if (!(top > 0) || !(bottom > 0)) throw new RangeError("At least one permeability must be positive.");
  return rtOverFMv(tempC) * Math.log(top / bottom);
}
export function validatePermeabilities(raw: unknown): Result<Permeabilities> {
  if (!isObject(raw)) return fail("Permeabilities must be an object.");
  const out = { k: raw.k, na: raw.na, cl: raw.cl } as Record<string, unknown>;
  for (const key of ["k", "na", "cl"]) {
    const v = out[key];
    if (!num(v) || v < 0 || v > 1000) return fail("Relative permeabilities must be numbers from 0 to 1000.");
  }
  if ((out.k as number) + (out.na as number) + (out.cl as number) <= 0) return fail("At least one permeability must be greater than zero.");
  return { ok: true, value: { k: out.k as number, na: out.na as number, cl: out.cl as number } };
}
/** Relative permeabilities often quoted for a resting neuron (P_K : P_Na : P_Cl). Illustrative. */
export const RESTING_PERMEABILITIES: Permeabilities = { k: 1, na: 0.04, cl: 0.45 };

// ---- ion-gradient explorer ----------------------------------------------------------------------------------------------------

export interface IonExplorerInput {
  ions: IonSet; tempC: number;
  /** "manual": the membrane voltage you set; "ghk": computed from the relative permeabilities. */
  vmSource: "manual" | "ghk";
  vmManualMv: number; perms: Permeabilities;
  /** The ion highlighted in the diagram. */
  selected: IonId;
}
export const DEFAULT_ION_EXPLORER: IonExplorerInput = { ions: TYPICAL_IONS, tempC: 37, vmSource: "ghk", vmManualMv: -70, perms: RESTING_PERMEABILITIES, selected: "k" };

export function validateIonExplorer(raw: unknown): Result<IonExplorerInput> {
  if (!isObject(raw)) return fail("Ion explorer state must be an object.");
  const ions = validateIonSet(raw.ions); if (!ions.ok) return ions;
  const perms = validatePermeabilities(raw.perms); if (!perms.ok) return perms;
  if (!validTemp(raw.tempC)) return fail(`Temperature must be between ${TEMP_RANGE[0]} and ${TEMP_RANGE[1]} °C.`);
  if (raw.vmSource !== "manual" && raw.vmSource !== "ghk") return fail("Unknown voltage source.");
  if (!validVm(raw.vmManualMv)) return fail(`Membrane voltage must be between ${VM_RANGE[0]} and ${VM_RANGE[1]} mV.`);
  if (typeof raw.selected !== "string" || !(ION_IDS as readonly string[]).includes(raw.selected)) return fail("Unknown ion.");
  return { ok: true, value: { ions: ions.value, tempC: raw.tempC, vmSource: raw.vmSource, vmManualMv: raw.vmManualMv, perms: perms.value, selected: raw.selected as IonId } };
}
export function explorerVm(i: IonExplorerInput): number { return i.vmSource === "ghk" ? ghkVoltageMv(i.ions, i.perms, i.tempC) : i.vmManualMv; }
export function evaluateIons(i: IonExplorerInput) {
  const vm = explorerVm(i);
  return { vmMv: vm, ions: ION_IDS.map((id) => ionDriving(id, i.ions[id], vm, i.tempC)) };
}

// ---- passive transport --------------------------------------------------------------------------------------------------------

export type PassiveSolute = "o2" | "glycerol" | "glucose" | "na" | "k" | "cl" | "ca";
export type PassiveMechanism = "simple" | "channel" | "carrier";
export const PASSIVE_SOLUTES: Record<PassiveSolute, { label: string; z: number; mechanisms: PassiveMechanism[]; note: string; ion?: IonId }> = {
  o2: { label: "Oxygen (O₂)", z: 0, mechanisms: ["simple"], note: "A small nonpolar molecule that dissolves in the hydrophobic core and crosses by simple diffusion." },
  glycerol: { label: "Glycerol", z: 0, mechanisms: ["simple", "channel"], note: "A small polar molecule: it crosses the bilayer slowly by simple diffusion and faster through aquaglyceroporin channels." },
  glucose: { label: "Glucose", z: 0, mechanisms: ["carrier"], note: "A large polar molecule that crosses poorly by itself; GLUT carriers move it by facilitated diffusion, with no ATP." },
  na: { label: "Na⁺", z: 1, mechanisms: ["channel"], note: "A cation: its movement depends on the electrochemical gradient, not on the concentration difference alone.", ion: "na" },
  k: { label: "K⁺", z: 1, mechanisms: ["channel"], note: "A cation moving through K⁺ channels, driven by the electrochemical gradient.", ion: "k" },
  cl: { label: "Cl⁻", z: -1, mechanisms: ["channel"], note: "An anion: the electrical term pushes it in the opposite sense to a cation.", ion: "cl" },
  ca: { label: "Ca²⁺", z: 2, mechanisms: ["channel"], note: "A divalent cation: the electrical term counts twice per ion.", ion: "ca" },
};
export const PASSIVE_SOLUTE_IDS = Object.keys(PASSIVE_SOLUTES) as PassiveSolute[];
export const PERMEABILITY_RANGE: [number, number] = [1e-9, 10]; // cm/s

export interface PassiveInput {
  solute: PassiveSolute; mechanism: PassiveMechanism;
  cOut: number; cIn: number; vmMv: number; tempC: number;
  /** Membrane permeability to a neutral solute (cm/s); the symmetrical-carrier and ion cases do not use it. */
  permeability: number;
  /** Carrier: maximum flux (µmol cm⁻² s⁻¹) and half-saturation concentration (mM). */
  jmax: number; km: number;
}
export const DEFAULT_PASSIVE: PassiveInput = { solute: "o2", mechanism: "simple", cOut: 8, cIn: 2, vmMv: -70, tempC: 37, permeability: 0.01, jmax: 2e-4, km: 5 };

export function validatePassive(raw: unknown): Result<PassiveInput> {
  if (!isObject(raw)) return fail("Passive-transport state must be an object.");
  if (typeof raw.solute !== "string" || !(PASSIVE_SOLUTE_IDS as string[]).includes(raw.solute)) return fail("Unknown solute.");
  const solute = raw.solute as PassiveSolute;
  if (typeof raw.mechanism !== "string" || !PASSIVE_SOLUTES[solute].mechanisms.includes(raw.mechanism as PassiveMechanism)) return fail(`${PASSIVE_SOLUTES[solute].label} does not use that passive mechanism in this model.`);
  if (!validConc(raw.cOut) || !validConc(raw.cIn)) return fail(`Concentrations must be between ${CONC_RANGE[0]} and ${CONC_RANGE[1]} mM.`);
  if (!validVm(raw.vmMv)) return fail("Membrane voltage is out of range.");
  if (!validTemp(raw.tempC)) return fail("Temperature is out of range.");
  if (!num(raw.permeability) || raw.permeability < PERMEABILITY_RANGE[0] || raw.permeability > PERMEABILITY_RANGE[1]) return fail("Permeability must be between 1e-9 and 10 cm/s.");
  if (!num(raw.jmax) || raw.jmax <= 0 || raw.jmax > 1) return fail("Maximum carrier flux must be positive and at most 1 µmol cm⁻² s⁻¹.");
  if (!num(raw.km) || raw.km <= 0 || raw.km > 1000) return fail("Km must be positive and at most 1000 mM.");
  return { ok: true, value: { solute, mechanism: raw.mechanism as PassiveMechanism, cOut: raw.cOut, cIn: raw.cIn, vmMv: raw.vmMv, tempC: raw.tempC, permeability: raw.permeability, jmax: raw.jmax, km: raw.km } };
}

export interface PassiveResult {
  charged: boolean; direction: Direction;
  /** Neutral solutes: net inward flux, µmol cm⁻² s⁻¹ (negative = outward). Ions: null (no magnitude is claimed). */
  fluxIn: number | null;
  /** The two one-way terms for the carrier (saturating) case, otherwise null. */
  carrierTerms: { out: number; in: number } | null;
  concentrationDifference: number;
  ion: IonDriving | null;
  equilibrium: boolean;
  requiresATP: false;
  equation: string;
  explanation: string[];
}

export function evaluatePassive(i: PassiveInput): PassiveResult {
  const def = PASSIVE_SOLUTES[i.solute];
  const dC = i.cOut - i.cIn;
  const notes = ["Passive transport never uses ATP and never moves a solute against its driving force."];
  if (def.ion) {
    const d = ionDriving(def.ion, { out: i.cOut, in: i.cIn }, i.vmMv, i.tempC);
    notes.push(`E(${def.label}) = ${d.eMv.toFixed(1)} mV; Vm = ${i.vmMv.toFixed(1)} mV; Vm − E = ${d.drivingMv.toFixed(1)} mV.`);
    notes.push(`The concentration gradient alone would drive ${dC > 0 ? "inward" : dC < 0 ? "outward" : "no"} movement; the net direction follows the electrochemical balance (Δμ_in = zF(Vm − E) = ${d.deltaGInwardKJ.toFixed(2)} kJ/mol).`);
    notes.push(d.direction === "none" ? "Vm equals the equilibrium potential: no net movement (individual ions still cross both ways)." : `Net movement through an open ${def.label} channel would be ${d.direction}.`);
    return { charged: true, direction: d.direction, fluxIn: null, carrierTerms: null, concentrationDifference: dC, ion: d, equilibrium: d.direction === "none", requiresATP: false, equation: "Δμ_in = zF(Vm − E_ion); E_ion = (RT/zF) ln([out]/[in])", explanation: notes };
  }
  if (i.mechanism === "carrier") {
    const a = i.jmax * (i.cOut / (i.km + i.cOut));
    const b = i.jmax * (i.cIn / (i.km + i.cIn));
    const j = a - b;
    notes.push("A symmetrical carrier: its one-way flux saturates at high concentration, so net flux is not proportional to the concentration difference.");
    const direction: Direction = Math.abs(j) < 1e-15 ? "none" : j > 0 ? "inward" : "outward";
    return { charged: false, direction, fluxIn: j, carrierTerms: { out: a, in: b }, concentrationDifference: dC, ion: null, equilibrium: direction === "none", requiresATP: false, equation: "J_in = Jmax·([S]out/(Km+[S]out) − [S]in/(Km+[S]in))", explanation: notes };
  }
  const j = i.permeability * dC;
  notes.push(i.mechanism === "channel" ? "Channel-mediated flux of a neutral solute is modelled as proportional to the concentration difference (no saturation within this model)." : "Simple diffusion: net flux is the permeability times the concentration difference (Fick's first law across a membrane).");
  const direction: Direction = dC === 0 ? "none" : dC > 0 ? "inward" : "outward";
  return { charged: false, direction, fluxIn: j, carrierTerms: null, concentrationDifference: dC, ion: null, equilibrium: direction === "none", requiresATP: false, equation: "J_in = P·([S]out − [S]in)", explanation: notes };
}

// ---- active transport ---------------------------------------------------------------------------------------------------------

export type PumpPerturbation = "none" | "no-atp" | "ouabain";
export const PUMP_PERTURBATIONS: Array<{ id: PumpPerturbation; label: string; effect: string }> = [
  { id: "none", label: "Normal pump", effect: "The cycle runs to completion." },
  { id: "no-atp", label: "No ATP available", effect: "Na⁺ can bind to E1, but with no ATP the pump cannot be phosphorylated, so nothing is transported." },
  { id: "ouabain", label: "Ouabain bound", effect: "Ouabain binds the extracellular face of the phosphorylated E2P state and blocks K⁺ binding and dephosphorylation: the cycle stops after Na⁺ release." },
];

export interface PumpState {
  step: number; title: string; text: string;
  conformation: "E1" | "E1~P" | "E2~P" | "E2";
  facing: "cytosol" | "extracellular" | "occluded";
  phosphorylated: boolean;
  atpBound: boolean;
  naBound: number; kBound: number;
  /** Cumulative over the cycle shown. */
  naMovedOut: number; kMovedIn: number; atpHydrolyzed: number; adpReleased: number; piReleased: number;
  netChargeOut: number;
}

export const NAK_STOICHIOMETRY = { naOut: 3, kIn: 2, atpPerCycle: 1 } as const;
export const NAK_STEPS = 8;
const mk = (s: Omit<PumpState, "netChargeOut">): PumpState => ({ ...s, netChargeOut: s.naMovedOut - s.kMovedIn });

/** The simplified Post–Albers cycle in its correct order. */
export const NAK_CYCLE: PumpState[] = [
  mk({ step: 0, title: "E1 with ATP, open to the cytosol", text: "In the E1 conformation the ion sites face the cytosol and have a high affinity for Na⁺. ATP is bound.", conformation: "E1", facing: "cytosol", phosphorylated: false, atpBound: true, naBound: 0, kBound: 0, naMovedOut: 0, kMovedIn: 0, atpHydrolyzed: 0, adpReleased: 0, piReleased: 0 }),
  mk({ step: 1, title: "Three Na⁺ bind from the cytosol", text: "Three intracellular Na⁺ bind to the E1 sites.", conformation: "E1", facing: "cytosol", phosphorylated: false, atpBound: true, naBound: 3, kBound: 0, naMovedOut: 0, kMovedIn: 0, atpHydrolyzed: 0, adpReleased: 0, piReleased: 0 }),
  mk({ step: 2, title: "Phosphorylation and occlusion", text: "ATP is hydrolysed: its terminal phosphate is transferred to an aspartate of the pump (E1~P) and ADP leaves. The three Na⁺ are occluded, open to neither side.", conformation: "E1~P", facing: "occluded", phosphorylated: true, atpBound: false, naBound: 3, kBound: 0, naMovedOut: 0, kMovedIn: 0, atpHydrolyzed: 1, adpReleased: 1, piReleased: 0 }),
  mk({ step: 3, title: "E1~P → E2~P: the sites open outward", text: "The phosphorylated pump changes conformation. The ion sites now face the extracellular fluid and their affinity for Na⁺ falls.", conformation: "E2~P", facing: "extracellular", phosphorylated: true, atpBound: false, naBound: 3, kBound: 0, naMovedOut: 0, kMovedIn: 0, atpHydrolyzed: 1, adpReleased: 1, piReleased: 0 }),
  mk({ step: 4, title: "Three Na⁺ are released outside", text: "The low-affinity sites release the three Na⁺ into the extracellular fluid, against their electrochemical gradient: this uphill step is paid for by the phosphorylation.", conformation: "E2~P", facing: "extracellular", phosphorylated: true, atpBound: false, naBound: 0, kBound: 0, naMovedOut: 3, kMovedIn: 0, atpHydrolyzed: 1, adpReleased: 1, piReleased: 0 }),
  mk({ step: 5, title: "Two K⁺ bind from outside", text: "E2~P has a high affinity for K⁺: two extracellular K⁺ bind.", conformation: "E2~P", facing: "extracellular", phosphorylated: true, atpBound: false, naBound: 0, kBound: 2, naMovedOut: 3, kMovedIn: 0, atpHydrolyzed: 1, adpReleased: 1, piReleased: 0 }),
  mk({ step: 6, title: "Dephosphorylation and K⁺ occlusion", text: "The aspartyl phosphate is hydrolysed (inorganic phosphate leaves). The pump relaxes to E2 and the two K⁺ are occluded.", conformation: "E2", facing: "occluded", phosphorylated: false, atpBound: false, naBound: 0, kBound: 2, naMovedOut: 3, kMovedIn: 0, atpHydrolyzed: 1, adpReleased: 1, piReleased: 1 }),
  mk({ step: 7, title: "ATP binds; E2 → E1; two K⁺ released inside", text: "ATP binds with low affinity and speeds the return to E1. The sites open to the cytosol and release the two K⁺. The cycle is complete: 3 Na⁺ out, 2 K⁺ in, one ATP hydrolysed.", conformation: "E1", facing: "cytosol", phosphorylated: false, atpBound: true, naBound: 0, kBound: 0, naMovedOut: 3, kMovedIn: 2, atpHydrolyzed: 1, adpReleased: 1, piReleased: 1 }),
];

/** Highest step the pump can reach under a perturbation. */
export function pumpMaxStep(p: PumpPerturbation): number { return p === "none" ? NAK_STEPS - 1 : p === "no-atp" ? 1 : 4; }
export function pumpState(step: number, p: PumpPerturbation): PumpState {
  if (!Number.isInteger(step) || step < 0 || step >= NAK_STEPS) throw new RangeError("Pump step out of range.");
  const s = NAK_CYCLE[Math.min(step, pumpMaxStep(p))];
  if (p === "no-atp") return { ...s, atpBound: false, title: step === 0 ? "E1 without ATP, open to the cytosol" : s.title };
  return s;
}
export const PUMP_ELECTROGENIC_NOTE =
  "Each completed cycle moves three positive charges out and two in, a net of one positive charge out, so the pump is electrogenic. That direct contribution is usually small. Most of the resting membrane potential comes from the ion gradients the pump maintains acting through the membrane's selective permeabilities (mainly the K⁺ leak), not from the pump current itself.";

// SGLT1: secondary active symport (2 Na⁺ : 1 glucose). The cotransporter never hydrolyses ATP.
export const SGLT_NA_PER_GLUCOSE = 2;
export interface SgltInput { naOut: number; naIn: number; gluOut: number; gluIn: number; vmMv: number; tempC: number }
export const DEFAULT_SGLT: SgltInput = { naOut: 145, naIn: 12, gluOut: 5, gluIn: 5, vmMv: -60, tempC: 37 };
export function validateSglt(raw: unknown): Result<SgltInput> {
  if (!isObject(raw)) return fail("Cotransport state must be an object.");
  for (const k of ["naOut", "naIn", "gluOut", "gluIn"]) if (!validConc(raw[k])) return fail(`${k}: concentrations must be between ${CONC_RANGE[0]} and ${CONC_RANGE[1]} mM.`);
  if (!validVm(raw.vmMv)) return fail("Membrane voltage is out of range.");
  if (!validTemp(raw.tempC)) return fail("Temperature is out of range.");
  return { ok: true, value: { naOut: raw.naOut as number, naIn: raw.naIn as number, gluOut: raw.gluOut as number, gluIn: raw.gluIn as number, vmMv: raw.vmMv, tempC: raw.tempC } };
}
export interface SgltResult {
  /** Δμ for one cycle taking 2 Na⁺ + 1 glucose inward, kJ/mol of cycles. Negative: the cycle can run inward. */
  deltaGCycleKJ: number; naTermKJ: number; glucoseTermKJ: number;
  glucoseDirection: Direction;
  /** Largest [glucose]in/[glucose]out the Na⁺ gradient and voltage could hold at equilibrium (a thermodynamic limit, not a prediction). */
  maxAccumulationRatio: number;
  usesATPDirectly: false;
}
export function evaluateSglt(i: SgltInput): SgltResult {
  const n = SGLT_NA_PER_GLUCOSE;
  const rt = (R_GAS * toKelvin(i.tempC)) / 1000; // kJ/mol
  const fKJ = FARADAY / 1e6; // kJ per mol per mV
  const naTerm = n * (rt * Math.log(i.naIn / i.naOut) + fKJ * i.vmMv);
  const gluTerm = rt * Math.log(i.gluIn / i.gluOut);
  const dG = naTerm + gluTerm;
  const dir: Direction = Math.abs(dG) < 1e-6 ? "none" : dG < 0 ? "inward" : "outward";
  const ratio = Math.exp((-naTerm) / rt);
  return { deltaGCycleKJ: dG, naTermKJ: naTerm, glucoseTermKJ: gluTerm, glucoseDirection: dir, maxAccumulationRatio: ratio, usesATPDirectly: false };
}

export const SGLT_STEPS = [
  { title: "Outward-facing, empty", text: "The transporter's binding sites open to the extracellular fluid." },
  { title: "Two Na⁺ and one glucose bind", text: "Na⁺ binding promotes glucose binding: the two substrates are bound together (symport)." },
  { title: "Occlusion and change of conformation", text: "The loaded carrier closes to the outside and opens to the cytosol. No ATP is hydrolysed by the transporter." },
  { title: "Release inside", text: "Low intracellular Na⁺ lets Na⁺ dissociate, and glucose follows into the cytosol." },
  { title: "Return", text: "The empty carrier returns to the outward-facing state. The Na⁺ gradient it used is maintained by the Na⁺/K⁺-ATPase, which does use ATP." },
] as const;

export interface TransporterClass { id: string; name: string; category: "Primary active" | "Secondary active (symport)" | "Secondary active (antiport)" | "Facilitated diffusion" | "Channel (passive)" | "Simple diffusion"; usesATPDirectly: boolean; driver: string; example: string }
export const TRANSPORTERS: TransporterClass[] = [
  { id: "nak", name: "Na⁺/K⁺-ATPase", category: "Primary active", usesATPDirectly: true, driver: "ATP hydrolysis", example: "Moves 3 Na⁺ out and 2 K⁺ in per ATP." },
  { id: "serca", name: "Ca²⁺-ATPase (SERCA, PMCA)", category: "Primary active", usesATPDirectly: true, driver: "ATP hydrolysis", example: "Pumps Ca²⁺ out of the cytosol." },
  { id: "sglt1", name: "SGLT1", category: "Secondary active (symport)", usesATPDirectly: false, driver: "Na⁺ electrochemical gradient", example: "2 Na⁺ and 1 glucose move in the same direction." },
  { id: "ncx", name: "Na⁺/Ca²⁺ exchanger (NCX)", category: "Secondary active (antiport)", usesATPDirectly: false, driver: "Na⁺ electrochemical gradient", example: "Na⁺ and Ca²⁺ move in opposite directions; the exchanger itself does not hydrolyse ATP." },
  { id: "glut", name: "GLUT glucose carrier", category: "Facilitated diffusion", usesATPDirectly: false, driver: "Glucose concentration gradient", example: "Passive uniport; direction set by the gradient." },
  { id: "kchan", name: "K⁺ leak channel", category: "Channel (passive)", usesATPDirectly: false, driver: "K⁺ electrochemical gradient", example: "Selective pore; no coupling to energy." },
  { id: "o2", name: "O₂ across the bilayer", category: "Simple diffusion", usesATPDirectly: false, driver: "Concentration gradient", example: "No protein required." },
];

// ---- osmosis and tonicity -----------------------------------------------------------------------------------------------------

export interface OsmosisInput {
  /** Effectively impermeant intracellular solutes, in osmoles per litre × 1000 (mOsm/L). */
  inImpermeant: number;
  /** Intracellular concentration of a freely permeant solute (urea), mM. */
  inUrea: number;
  /** Extracellular: NaCl (mM, treated as effectively impermeant and fully dissociated), sucrose (mM, impermeant) and urea (mM, permeant). */
  naCl: number; sucrose: number; urea: number;
}
export const DEFAULT_OSMOSIS: OsmosisInput = { inImpermeant: 300, inUrea: 0, naCl: 150, sucrose: 0, urea: 0 };
export const OSM_TOL = 0.5; // mOsm/L

export function validateOsmosis(raw: unknown): Result<OsmosisInput> {
  if (!isObject(raw)) return fail("Osmosis state must be an object.");
  const ranges: Array<[keyof OsmosisInput, number, number]> = [["inImpermeant", 10, 1000], ["inUrea", 0, 1000], ["naCl", 0, 600], ["sucrose", 0, 1000], ["urea", 0, 1000]];
  const out = {} as OsmosisInput;
  for (const [k, lo, hi] of ranges) {
    const v = raw[k];
    if (!num(v) || v < lo || v > hi) return fail(`${k} must be a number from ${lo} to ${hi}.`);
    out[k] = v;
  }
  return { ok: true, value: out };
}

export type Relation = "greater" | "less" | "equal";
const rel = (a: number, b: number): Relation => (Math.abs(a - b) <= OSM_TOL ? "equal" : a > b ? "greater" : "less");
export interface OsmosisResult {
  outImpermeantOsm: number; outTotalOsm: number; inTotalOsm: number; inImpermeantOsm: number;
  /** Extracellular fluid relative to the cell. */
  osmolarity: "hyperosmotic" | "hypoosmotic" | "iso-osmotic";
  tonicity: "hypertonic" | "hypotonic" | "isotonic";
  initialWater: "out of the cell" | "into the cell" | "no net movement";
  cellInitially: "shrinks" | "swells" | "keeps its volume";
  disagree: boolean;
  /** Idealized equilibrium volume relative to the starting volume, or null when the model does not support a number. */
  relativeVolume: number | null;
  volumeNote: string;
  notes: string[];
}
export const VOLUME_SUPPORTED: [number, number] = [0.5, 2];
export function evaluateOsmosis(i: OsmosisInput): OsmosisResult {
  const outImp = 2 * i.naCl + i.sucrose;
  const outTot = outImp + i.urea;
  const inTot = i.inImpermeant + i.inUrea;
  const o = rel(outTot, inTot);
  const t = rel(outImp, i.inImpermeant);
  const osmolarity = o === "greater" ? "hyperosmotic" : o === "less" ? "hypoosmotic" : "iso-osmotic";
  const tonicity = t === "greater" ? "hypertonic" : t === "less" ? "hypotonic" : "isotonic";
  const initialWater = t === "greater" ? "out of the cell" : t === "less" ? "into the cell" : "no net movement";
  const cellInitially = t === "greater" ? "shrinks" : t === "less" ? "swells" : "keeps its volume";
  const notes: string[] = [];
  notes.push("Osmolarity counts all dissolved particles. Tonicity counts only the solutes that cannot cross the membrane, because only they hold water on one side.");
  if (i.urea > 0 || i.inUrea > 0) notes.push("Urea is treated as freely permeant: it equilibrates across the membrane, so it adds to osmolarity but not to tonicity.");
  const disagree = o !== t;
  if (disagree) notes.push(`The two classifications disagree: the solution is ${osmolarity} but ${tonicity} for this cell.`);
  let relativeVolume: number | null = null;
  let volumeNote: string;
  if (outImp < 1e-9) volumeNote = "The extracellular fluid contains no effectively impermeant solute. This model has no elasticity, wall or lysis threshold, so it gives no equilibrium volume.";
  else {
    const r = i.inImpermeant / outImp;
    if (r < VOLUME_SUPPORTED[0] || r > VOLUME_SUPPORTED[1]) volumeNote = `The ideal ratio would be ${r.toFixed(2)}, outside ${VOLUME_SUPPORTED[0]}–${VOLUME_SUPPORTED[1]}; the model's assumptions (no elastic limit, no volume regulation, no lysis) are not supported there, so no volume is reported.`;
    else { relativeVolume = r; volumeNote = "Idealized Boyle–van 't Hoff equilibrium: V/V₀ = (impermeant solute inside) / (impermeant solute outside)."; }
  }
  return { outImpermeantOsm: outImp, outTotalOsm: outTot, inTotalOsm: inTot, inImpermeantOsm: i.inImpermeant, osmolarity, tonicity, initialWater, cellInitially, disagree, relativeVolume, volumeNote, notes };
}

// ---- bilayer ------------------------------------------------------------------------------------------------------------------

export type BilayerComponentId = "head" | "tail" | "integral" | "peripheral" | "cholesterol" | "channel" | "carrier" | "pump" | "glyco";
export interface BilayerComponent { id: BilayerComponentId; label: string; kind: string; where: string; role: string; note: string }
export const BILAYER_COMPONENTS: BilayerComponent[] = [
  { id: "head", label: "Phospholipid head group", kind: "Lipid, hydrophilic part", where: "Both surfaces, facing water", role: "A polar (often charged) phosphate-containing head that interacts with water on the extracellular and cytosolic sides.", note: "Its polarity is why the heads face the aqueous solutions." },
  { id: "tail", label: "Fatty-acid tails", kind: "Lipid, hydrophobic part", where: "The interior of the bilayer", role: "Two hydrocarbon chains per phospholipid. They are hydrophobic and form the barrier that keeps ions and polar molecules from crossing freely.", note: "Saturated tails are straight and pack tightly; a cis double bond puts a kink in an unsaturated tail and loosens packing." },
  { id: "integral", label: "Integral membrane protein", kind: "Protein", where: "Embedded in or spanning the bilayer", role: "Contains hydrophobic regions (often α-helices) that sit in the lipid core. Includes channels, carriers, pumps and many receptors.", note: "Removing it normally needs detergent, because it is embedded in the hydrophobic core." },
  { id: "peripheral", label: "Peripheral membrane protein", kind: "Protein", where: "On either surface, not spanning", role: "Attached to the surface by interactions with lipid heads or with integral proteins; often part of the cytoskeleton or signalling.", note: "It can usually be released without destroying the bilayer, for example by changing ionic strength or pH." },
  { id: "cholesterol", label: "Cholesterol", kind: "Lipid (sterol), amphipathic", where: "Between phospholipids in animal cell membranes", role: "A small polar hydroxyl group sits near the head groups and a rigid steroid ring system lies among the upper parts of the tails. It moderates fluidity: it restrains tail motion when the membrane is warm and hinders tight packing when it is cold.", note: "Bacterial membranes generally lack cholesterol; plants use other sterols." },
  { id: "channel", label: "Channel protein", kind: "Integral protein", where: "Spans the bilayer", role: "A water-filled pore that lets specific ions or molecules pass down their electrochemical or concentration gradient. Passive; no ATP.", note: "Many channels are gated by voltage, ligand or mechanical force." },
  { id: "carrier", label: "Carrier (uniporter)", kind: "Integral protein", where: "Spans the bilayer", role: "Binds a specific solute, changes conformation and releases it on the other side. Facilitated diffusion is passive and saturable; it needs no ATP.", note: "GLUT glucose carriers are an example." },
  { id: "pump", label: "Pump (ATPase)", kind: "Integral protein", where: "Spans the bilayer", role: "Uses energy from ATP hydrolysis to move ions against their electrochemical gradient (primary active transport).", note: "The Na⁺/K⁺-ATPase moves 3 Na⁺ out and 2 K⁺ in per ATP." },
  { id: "glyco", label: "Glycoprotein / glycolipid", kind: "Carbohydrate-modified molecule", where: "Extracellular surface only", role: "Carbohydrate chains on proteins or lipids contribute to cell recognition and protection.", note: "The membrane is asymmetric: these carbohydrates face the outside." },
];

export type LipidMix = "saturated" | "mixed" | "unsaturated";
export type MembraneTemp = "cool" | "moderate" | "warm";
export interface BilayerState { lipids: LipidMix; temperature: MembraneTemp; cholesterol: boolean; selected: BilayerComponentId | null }
export const DEFAULT_BILAYER: BilayerState = { lipids: "mixed", temperature: "moderate", cholesterol: false, selected: null };
export function validateBilayer(raw: unknown): Result<BilayerState> {
  if (!isObject(raw)) return fail("Bilayer state must be an object.");
  if (raw.lipids !== "saturated" && raw.lipids !== "mixed" && raw.lipids !== "unsaturated") return fail("Unknown lipid composition.");
  if (raw.temperature !== "cool" && raw.temperature !== "moderate" && raw.temperature !== "warm") return fail("Unknown temperature class.");
  if (typeof raw.cholesterol !== "boolean") return fail("Cholesterol must be true or false.");
  let selected: BilayerComponentId | null = null;
  if (raw.selected !== null) {
    if (typeof raw.selected !== "string" || !BILAYER_COMPONENTS.some((c) => c.id === raw.selected)) return fail("Unknown membrane component.");
    selected = raw.selected as BilayerComponentId;
  }
  return { ok: true, value: { lipids: raw.lipids, temperature: raw.temperature, cholesterol: raw.cholesterol, selected } };
}
export const FLUIDITY_LABELS = ["very low (gel-like packing)", "low", "intermediate", "high", "very high"] as const;
/**
 * A five-step ORDINAL class for the schematic states only: saturation and temperature each add 0–2; cholesterol moves the two
 * extremes one step toward the middle. It is a teaching comparison, not a prediction for any real lipid mixture.
 */
export function fluidity(s: Pick<BilayerState, "lipids" | "temperature" | "cholesterol">): { level: number; label: string; reasons: string[] } {
  const sat = s.lipids === "saturated" ? 0 : s.lipids === "mixed" ? 1 : 2;
  const temp = s.temperature === "cool" ? 0 : s.temperature === "moderate" ? 1 : 2;
  let level = sat + temp;
  const reasons = [
    s.lipids === "saturated" ? "Saturated tails are straight and pack tightly, which lowers fluidity." : s.lipids === "unsaturated" ? "Unsaturated tails are kinked (cis double bonds), which prevents tight packing and raises fluidity." : "A mixture of saturated and unsaturated tails packs at an intermediate level.",
    s.temperature === "cool" ? "Lower temperature slows tail motion and favours tighter packing." : s.temperature === "warm" ? "Higher temperature increases tail motion." : "A moderate temperature gives intermediate tail motion.",
  ];
  if (s.cholesterol) {
    if (level === 0) { level = 1; reasons.push("Cholesterol hinders tight packing, so a cold, saturated membrane is less rigid than it would be without it."); }
    else if (level === 4) { level = 3; reasons.push("Cholesterol's rigid rings restrain tail motion, so a warm, unsaturated membrane is less fluid than it would be without it."); }
    else reasons.push("Cholesterol buffers fluidity: it changes the extremes most and has little effect on an intermediate membrane in this scale.");
  }
  return { level, label: FLUIDITY_LABELS[level], reasons };
}
export const FLUIDITY_CAVEAT = "This is a five-step comparison between the schematic states shown, not a measurement or a prediction for any real lipid mixture. Real fluidity depends on lipid composition, cholesterol content, temperature and the organism; many organisms adjust their lipid composition to their temperature (for example, more unsaturated lipids in the cold).";

export interface PermeabilityClass { id: string; label: string; examples: string; bilayer: "high" | "moderate" | "low" | "very low"; route: string }
export const PERMEABILITY_CLASSES: PermeabilityClass[] = [
  { id: "nonpolar", label: "Small nonpolar molecules", examples: "O₂, CO₂, N₂", bilayer: "high", route: "Simple diffusion through the lipid." },
  { id: "polar-small", label: "Small uncharged polar molecules", examples: "water, urea, glycerol", bilayer: "moderate", route: "Slowly through the lipid; often much faster through channels (for example aquaporins for water)." },
  { id: "polar-large", label: "Large uncharged polar molecules", examples: "glucose", bilayer: "low", route: "Facilitated by carriers." },
  { id: "ions", label: "Ions", examples: "Na⁺, K⁺, Cl⁻, Ca²⁺", bilayer: "very low", route: "Through channels, carriers or pumps, because charge makes the hydrophobic core energetically unfavourable." },
];
