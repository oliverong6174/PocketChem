/**
 * Stage 23: neuronal electrophysiology and synaptic transmission. Pure, deterministic, typed; no React.
 *
 *  - Passive membrane: a parallel RC circuit driven by a current pulse (closed form).
 *  - Action potential: the Hodgkin–Huxley (1952) squid giant axon equations at 6.3 °C, integrated with fixed-step RK4.
 *    This is a validated conductance-based model of ONE preparation; it is not a predictor of any particular mammalian
 *    neuron's excitability, and its parameters are fixed (only the stimulus and two classical channel blockers vary).
 *  - Propagation: a schematic site-counting model (no conduction velocities).
 *  - Synapse: ordered stages with curated receptor examples; the postsynaptic polarity comes from the receptor's reversal
 *    potential relative to the membrane voltage.
 *  - Summation: linear superposition of postsynaptic potentials in a single RC compartment.
 *
 * Units: ms, mV, µA/cm², mS/cm², µF/cm² for Hodgkin–Huxley; MΩ, pF, pA, ms, mV for the passive membrane.
 */
import { IONS, ION_IDS, TYPICAL_IONS, ghkVoltageMv, nernstMv, rtOverFMv, type IonExplorerInput, type IonSet, type Result } from "./membrane23";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const fail = <T>(error: string): Result<T> => ({ ok: false, error });
const inRange = (v: unknown, lo: number, hi: number): v is number => num(v) && v >= lo && v <= hi;

// ---- anatomy ------------------------------------------------------------------------------------------------------------------

export type PartId = "dendrites" | "soma" | "hillock" | "axon" | "myelin" | "node" | "terminal" | "cleft" | "postsynaptic";
export interface NeuronPart { id: PartId; label: string; role: string; process: "Input" | "Integration" | "Initiation" | "Propagation" | "Output" | "Reception"; note: string }
export const NEURON_PARTS: NeuronPart[] = [
  { id: "dendrites", label: "Dendrites", process: "Input", role: "Branching extensions that receive synaptic input. Ligand-gated channels in their membrane produce graded postsynaptic potentials that spread passively toward the soma.", note: "Dendritic input is graded and decays with distance; it is not an all-or-none action potential." },
  { id: "soma", label: "Soma (cell body)", process: "Integration", role: "Contains the nucleus and most organelles. Postsynaptic potentials from all dendrites sum here and in the axon initial segment.", note: "The summed membrane voltage is what the axon hillock responds to." },
  { id: "hillock", label: "Axon hillock / initial segment", process: "Initiation", role: "Where the axon begins. A high density of voltage-gated Na⁺ channels makes this region the usual site where an action potential starts, when the summed depolarization reaches threshold.", note: "Initiation is a threshold event: the depolarization must be large enough for Na⁺ current to become regenerative." },
  { id: "axon", label: "Axon", process: "Propagation", role: "A long process that conducts action potentials away from the soma. Each patch of membrane regenerates the spike, so its size does not decay along the axon.", note: "The wave of depolarization moves along the axon. Individual Na⁺ ions do not travel along the axon at that speed: they cross the membrane locally and diffuse only short distances." },
  { id: "myelin", label: "Myelin sheath", process: "Propagation", role: "Layers of glial membrane (oligodendrocytes in the CNS, Schwann cells in the periphery) wrapped around the axon. The sheath raises membrane resistance and lowers capacitance of the insulated stretch, so local current spreads farther before it leaks out.", note: "Myelin changes the axon's passive electrical properties; it does not itself make a spike." },
  { id: "node", label: "Node of Ranvier", process: "Propagation", role: "A short gap in the myelin where voltage-gated Na⁺ channels are concentrated. The action potential is regenerated at each node, and current flows passively through the insulated stretch between nodes (saltatory conduction).", note: "Channels are mostly clustered at nodes; internodes have few." },
  { id: "terminal", label: "Axon terminal", process: "Output", role: "The ending of the axon. Depolarization opens voltage-gated Ca²⁺ channels; Ca²⁺ entry triggers vesicle fusion and neurotransmitter release.", note: "The presynaptic Ca²⁺ channels are voltage-gated, unlike the postsynaptic receptors." },
  { id: "cleft", label: "Synaptic cleft", process: "Output", role: "The narrow extracellular gap (tens of nanometres) between the presynaptic terminal and the postsynaptic cell. Released neurotransmitter diffuses across it and is then removed.", note: "Transmission across the cleft is by diffusion of neurotransmitter, not electrical current, at a chemical synapse." },
  { id: "postsynaptic", label: "Postsynaptic membrane", process: "Reception", role: "Contains receptors for the neurotransmitter. Binding changes channel opening (ionotropic) or starts a G-protein pathway (metabotropic) and produces a postsynaptic potential.", note: "Whether the response is excitatory or inhibitory depends on the receptor and the cell, not on the neurotransmitter alone." },
];

// ---- passive membrane (RC) ----------------------------------------------------------------------------------------------------

export interface PassiveMembraneInput {
  rMohm: number; cPf: number; iPa: number; tStartMs: number; pulseMs: number; vRestMv: number; tMaxMs: number;
}
export const DEFAULT_PASSIVE_MEMBRANE: PassiveMembraneInput = { rMohm: 100, cPf: 100, iPa: 100, tStartMs: 5, pulseMs: 40, vRestMv: -65, tMaxMs: 120 };
export function validatePassiveMembrane(raw: unknown): Result<PassiveMembraneInput> {
  if (!isObject(raw)) return fail("Passive membrane state must be an object.");
  if (!inRange(raw.rMohm, 10, 1000)) return fail("Membrane resistance must be 10–1000 MΩ.");
  if (!inRange(raw.cPf, 10, 500)) return fail("Membrane capacitance must be 10–500 pF.");
  if (!inRange(raw.iPa, -300, 300)) return fail("Injected current must be −300 to 300 pA.");
  if (!inRange(raw.tStartMs, 0, 50)) return fail("Pulse start must be 0–50 ms.");
  if (!inRange(raw.pulseMs, 1, 200)) return fail("Pulse width must be 1–200 ms.");
  if (!inRange(raw.vRestMv, -90, -40)) return fail("Resting voltage must be −90 to −40 mV.");
  if (!inRange(raw.tMaxMs, 10, 500)) return fail("Duration must be 10–500 ms.");
  return { ok: true, value: { rMohm: raw.rMohm, cPf: raw.cPf, iPa: raw.iPa, tStartMs: raw.tStartMs, pulseMs: raw.pulseMs, vRestMv: raw.vRestMv, tMaxMs: raw.tMaxMs } };
}
/** τ = R C. MΩ × pF = µs, so τ(ms) = R(MΩ)·C(pF)/1000. */
export const membraneTauMs = (rMohm: number, cPf: number) => (rMohm * cPf) / 1000;
/** Steady-state voltage change for a constant current: ΔV = I R. pA × MΩ = µV, so ΔV(mV) = I(pA)·R(MΩ)/1000. */
export const steadyDeltaMv = (iPa: number, rMohm: number) => (iPa * rMohm) / 1000;
/**
 * Governing equation C dV/dt = I(t) − (V − V_rest)/R, solved piecewise:
 *   during the pulse  V = Vrest + IR(1 − e^{−(t−t0)/τ});  afterwards V = Vrest + IR(1 − e^{−w/τ}) e^{−(t−t1)/τ}.
 */
export function passiveVoltageMv(p: PassiveMembraneInput, tMs: number): number {
  const tau = membraneTauMs(p.rMohm, p.cPf), dv = steadyDeltaMv(p.iPa, p.rMohm);
  const t1 = p.tStartMs + p.pulseMs;
  if (tMs < p.tStartMs) return p.vRestMv;
  if (tMs < t1) return p.vRestMv + dv * (1 - Math.exp(-(tMs - p.tStartMs) / tau));
  return p.vRestMv + dv * (1 - Math.exp(-p.pulseMs / tau)) * Math.exp(-(tMs - t1) / tau);
}
export function passiveTrace(p: PassiveMembraneInput, points = 240): Array<{ t: number; v: number; i: number }> {
  const out: Array<{ t: number; v: number; i: number }> = [];
  for (let k = 0; k <= points; k += 1) {
    const t = (p.tMaxMs * k) / points;
    out.push({ t, v: passiveVoltageMv(p, t), i: t >= p.tStartMs && t < p.tStartMs + p.pulseMs ? p.iPa : 0 });
  }
  return out;
}
/** Fraction of the final value reached after n time constants of a step: 1 − e^{−n}. */
export const stepFraction = (nTau: number) => 1 - Math.exp(-nTau);

// ---- resting potential (shares the membrane engine) -------------------------------------------------------------------------------

export interface RestingInput { explorer: IonExplorerInput }
export interface RestingResult { vmMv: number; nernst: Array<{ ion: string; symbol: string; eMv: number; permeability: number | null }>; gapFromEkMv: number; ghkTop: number; ghkBottom: number }
export function restingPotential(i: IonExplorerInput): RestingResult {
  const vm = ghkVoltageMv(i.ions, i.perms, i.tempC);
  const nernst = ION_IDS.map((id) => ({ ion: id, symbol: IONS[id].symbol, eMv: nernstMv(IONS[id].z, i.ions[id].out, i.ions[id].in, i.tempC), permeability: id === "ca" ? null : i.perms[id] }));
  return {
    vmMv: vm, nernst, gapFromEkMv: vm - nernst.find((n) => n.ion === "k")!.eMv,
    ghkTop: i.perms.k * i.ions.k.out + i.perms.na * i.ions.na.out + i.perms.cl * i.ions.cl.in,
    ghkBottom: i.perms.k * i.ions.k.in + i.perms.na * i.ions.na.in + i.perms.cl * i.ions.cl.out,
  };
}
export const RESTING_NOTE =
  "The resting potential is not simply E_K. Each permeant ion pulls the membrane voltage toward its own equilibrium potential in proportion to how permeable the membrane is to it (Goldman–Hodgkin–Katz). Because K⁺ is the most permeant ion at rest the voltage lies close to E_K, but the small Na⁺ and Cl⁻ permeabilities move it away. The Na⁺/K⁺ pump maintains the gradients and adds a small electrogenic current that the GHK equation omits.";
export const GHK_ASSUMPTIONS = [
  "Constant electric field across the membrane and independent movement of ions.",
  "Only the monovalent ions K⁺, Na⁺ and Cl⁻ are included; Ca²⁺ is excluded because its permeability at rest is very small and its valence needs a different form.",
  "Zero net current (steady state); the electrogenic contribution of the pump is not included.",
  "Relative permeabilities are inputs, not measurements of a specific neuron.",
];

// ---- Hodgkin–Huxley ------------------------------------------------------------------------------------------------------------

export const HH = { cm: 1, gNa: 120, gK: 36, gL: 0.3, eNa: 50, eK: -77, eL: -54.387, vRest: -65, tempC: 6.3 } as const;
/**
 * alpha_n and alpha_m have the form c*x/(1 - exp(-x/10)), a removable singularity at x = 0 with limit 10c. Evaluated as
 * c*x/(-expm1(-x/10)) the relative error stays near machine precision for every x (1 - exp(-x/10) loses digits for small x), and
 * x = 0 returns the exact limit, so there is no cut-off and no discontinuity.
 */
const xOverOneMinusExp = (x: number, c: number) => (x === 0 ? 10 * c : (c * x) / -Math.expm1(-x / 10));
export const alphaN = (v: number) => xOverOneMinusExp(v + 55, 0.01);
export const betaN = (v: number) => 0.125 * Math.exp(-(v + 65) / 80);
export const alphaM = (v: number) => xOverOneMinusExp(v + 40, 0.1);
export const betaM = (v: number) => 4 * Math.exp(-(v + 65) / 18);
export const alphaH = (v: number) => 0.07 * Math.exp(-(v + 65) / 20);
export const betaH = (v: number) => 1 / (1 + Math.exp(-(v + 35) / 10));
export const steadyGate = (a: number, b: number) => a / (a + b);

export interface HhInput {
  /** First pulse: amplitude (µA/cm²), start and duration (ms). */
  amp: number; startMs: number; durMs: number;
  /** Optional second pulse of the same duration, starting `delayMs` after the START of the first; amplitude 0 disables it. */
  amp2: number; delayMs: number;
  durationMs: number;
  /** Classical pharmacology: tetrodotoxin-like Na⁺ channel block and tetraethylammonium-like K⁺ channel block. */
  blockNa: boolean; blockK: boolean;
}
export const DEFAULT_HH: HhInput = { amp: 20, startMs: 2, durMs: 1, amp2: 0, delayMs: 8, durationMs: 30, blockNa: false, blockK: false };
export function validateHh(raw: unknown): Result<HhInput> {
  if (!isObject(raw)) return fail("Action-potential state must be an object.");
  if (!inRange(raw.amp, 0, 100)) return fail("Stimulus amplitude must be 0–100 µA/cm².");
  if (!inRange(raw.startMs, 0, 20)) return fail("Stimulus start must be 0–20 ms.");
  if (!inRange(raw.durMs, 0.1, 50)) return fail("Stimulus duration must be 0.1–50 ms.");
  if (!inRange(raw.amp2, 0, 100)) return fail("Second stimulus amplitude must be 0–100 µA/cm².");
  if (!inRange(raw.delayMs, 0.5, 40)) return fail("Second stimulus delay must be 0.5–40 ms.");
  if (!inRange(raw.durationMs, 10, 60)) return fail("Simulated duration must be 10–60 ms.");
  if (typeof raw.blockNa !== "boolean" || typeof raw.blockK !== "boolean") return fail("Channel blocks must be true or false.");
  if (raw.startMs + raw.delayMs + raw.durMs > raw.durationMs + 1e-9 && raw.amp2 > 0) return fail("The second pulse must end before the simulation does.");
  if (raw.startMs + raw.durMs > raw.durationMs + 1e-9) return fail("The stimulus must end before the simulation does.");
  return { ok: true, value: { amp: raw.amp, startMs: raw.startMs, durMs: raw.durMs, amp2: raw.amp2, delayMs: raw.delayMs, durationMs: raw.durationMs, blockNa: raw.blockNa, blockK: raw.blockK } };
}

export interface HhTrace {
  dt: number; every: number;
  t: number[]; v: number[]; m: number[]; h: number[]; n: number[];
  gNa: number[]; gK: number[]; iNa: number[]; iK: number[]; iL: number[]; iStim: number[];
}

/** Fixed-step RK4. Deterministic; `dt` in ms. */
export function simulateHh(input: HhInput, dt = 0.01, every = 5): HhTrace {
  if (!(dt > 0 && dt <= 0.05)) throw new RangeError("dt must be in (0, 0.05] ms.");
  const gNaMax = input.blockNa ? 0 : HH.gNa, gKMax = input.blockK ? 0 : HH.gK;
  const stim = (t: number) => {
    let i = 0;
    if (t >= input.startMs && t < input.startMs + input.durMs) i += input.amp;
    const s2 = input.startMs + input.delayMs;
    if (input.amp2 > 0 && t >= s2 && t < s2 + input.durMs) i += input.amp2;
    return i;
  };
  let v = HH.vRest;
  let m = steadyGate(alphaM(v), betaM(v)), h = steadyGate(alphaH(v), betaH(v)), n = steadyGate(alphaN(v), betaN(v));
  const f = (vv: number, mm: number, hh: number, nn: number, i: number): [number, number, number, number] => {
    const iNa = gNaMax * mm ** 3 * hh * (vv - HH.eNa), iK = gKMax * nn ** 4 * (vv - HH.eK), iL = HH.gL * (vv - HH.eL);
    return [(i - iNa - iK - iL) / HH.cm, alphaM(vv) * (1 - mm) - betaM(vv) * mm, alphaH(vv) * (1 - hh) - betaH(vv) * hh, alphaN(vv) * (1 - nn) - betaN(vv) * nn];
  };
  const out: HhTrace = { dt, every, t: [], v: [], m: [], h: [], n: [], gNa: [], gK: [], iNa: [], iK: [], iL: [], iStim: [] };
  const steps = Math.round(input.durationMs / dt);
  const record = (k: number) => {
    out.t.push(k * dt); out.v.push(v); out.m.push(m); out.h.push(h); out.n.push(n);
    out.gNa.push(gNaMax * m ** 3 * h); out.gK.push(gKMax * n ** 4);
    out.iNa.push(gNaMax * m ** 3 * h * (v - HH.eNa)); out.iK.push(gKMax * n ** 4 * (v - HH.eK)); out.iL.push(HH.gL * (v - HH.eL)); out.iStim.push(stim(k * dt + dt / 2));
  };
  for (let k = 0; k <= steps; k += 1) {
    if (k % every === 0) record(k);
    if (k === steps) break;
    const i = stim(k * dt + dt / 2);
    const k1 = f(v, m, h, n, i);
    const k2 = f(v + (dt / 2) * k1[0], m + (dt / 2) * k1[1], h + (dt / 2) * k1[2], n + (dt / 2) * k1[3], i);
    const k3 = f(v + (dt / 2) * k2[0], m + (dt / 2) * k2[1], h + (dt / 2) * k2[2], n + (dt / 2) * k2[3], i);
    const k4 = f(v + dt * k3[0], m + dt * k3[1], h + dt * k3[2], n + dt * k3[3], i);
    v += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    m += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    h += (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    n += (dt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
  }
  return out;
}

export type ApPhase = "rest" | "depol" | "rising" | "repol" | "ahp" | "recovery";
export const AP_PHASE_INFO: Record<ApPhase, { label: string; text: string }> = {
  rest: { label: "Resting", text: "Most voltage-gated Na⁺ channels are closed but available (activation gates m closed, inactivation gates h mostly open), and most delayed-rectifier K⁺ channels are closed. The membrane voltage is set by the leak and K⁺ permeability." },
  depol: { label: "Depolarization (stimulus)", text: "Injected current charges the membrane. Net ionic current is still outward (leak and K⁺ current exceed any Na⁺ current), so the response decays if the stimulus stops. If the depolarization reaches threshold, Na⁺ current takes over." },
  rising: { label: "Rising phase", text: "Threshold has been passed: Na⁺ activation gates open quickly, inward Na⁺ current exceeds outward current, and the depolarization regenerates. The voltage heads toward E_Na but does not reach it." },
  repol: { label: "Repolarization", text: "Na⁺ channels inactivate (h falls) and the slower delayed-rectifier K⁺ channels open (n rises), so outward K⁺ current exceeds the shrinking Na⁺ current and the voltage falls." },
  ahp: { label: "Afterhyperpolarization", text: "K⁺ conductance is still elevated after Na⁺ conductance has fallen, so the voltage dips below rest toward E_K. Na⁺ channels are still partly inactivated." },
  recovery: { label: "Recovery toward rest", text: "K⁺ channels close (n falls) and Na⁺ inactivation is removed (h recovers) while the voltage returns to rest." },
};

export interface HhAnalysis {
  spikes: number; peakMv: number; peakMs: number | null; thresholdMv: number | null; thresholdMs: number | null;
  minAfterMv: number | null; phases: ApPhase[];
  /** First sample index of each phase in the order they were entered (for the labelled trace). */
  transitions: Array<{ phase: ApPhase; index: number }>;
}
export function analyzeHh(tr: HhTrace, rest: number = HH.vRest): HhAnalysis {
  const N = tr.v.length;
  let spikes = 0, peak = -Infinity, peakIdx = 0;
  for (let i = 0; i < N; i += 1) {
    if (tr.v[i] > peak) { peak = tr.v[i]; peakIdx = i; }
    if (i > 0 && tr.v[i - 1] < 0 && tr.v[i] >= 0) spikes += 1;
  }
  const phases: ApPhase[] = [];
  const transitions: Array<{ phase: ApPhase; index: number }> = [];
  let st: ApPhase = "rest";
  let thresholdIdx: number | null = null;
  for (let i = 0; i < N; i += 1) {
    const dv = i < N - 1 ? tr.v[i + 1] - tr.v[i] : i > 0 ? tr.v[i] - tr.v[i - 1] : 0;
    const iion = tr.iNa[i] + tr.iK[i] + tr.iL[i];
    const v = tr.v[i];
    const regen = iion < 0 && dv > 0 && v > rest + 0.5;
    let next: ApPhase = st;
    switch (st) {
      case "rest": if (v > rest + 0.5) next = regen ? "rising" : "depol"; break;
      case "depol": if (regen) next = "rising"; else if (Math.abs(v - rest) < 0.5) next = "rest"; break;
      case "rising": if (dv <= 0) next = "repol"; break;
      case "repol": if (v < rest) next = "ahp"; else if (regen) next = "rising"; else if (dv >= 0 && Math.abs(v - rest) < 0.5) next = "rest"; break;
      case "ahp": if (dv >= 0) next = "recovery"; break;
      case "recovery": if (regen) next = "rising"; else if (Math.abs(v - rest) < 0.5) next = "rest"; break;
    }
    if (next === "rising" && st !== "rising" && thresholdIdx === null) thresholdIdx = i;
    if (next !== st) transitions.push({ phase: next, index: i });
    st = next;
    phases.push(st);
  }
  let minAfter: number | null = null;
  if (spikes > 0) { minAfter = Infinity; for (let i = peakIdx; i < N; i += 1) if (tr.v[i] < minAfter) minAfter = tr.v[i]; }
  return {
    spikes, peakMv: peak, peakMs: spikes ? tr.t[peakIdx] : null,
    thresholdMv: thresholdIdx !== null ? tr.v[thresholdIdx] : null, thresholdMs: thresholdIdx !== null ? tr.t[thresholdIdx] : null,
    minAfterMv: minAfter, phases, transitions,
  };
}

export interface ChannelState {
  m: number; h: number; n: number; pNa: number; pK: number;
  naActivation: "closed" | "partly open" | "open";
  naInactivation: "available" | "partly inactivated" | "inactivated";
  kGate: "closed" | "partly open" | "open";
  naChannel: string; kChannel: string;
}
export function channelState(m: number, h: number, n: number): ChannelState {
  const naActivation = m < 0.3 ? "closed" : m < 0.7 ? "partly open" : "open";
  const naInactivation = h > 0.5 ? "available" : h > 0.2 ? "partly inactivated" : "inactivated";
  const kGate = n < 0.4 ? "closed" : n < 0.7 ? "partly open" : "open";
  const pNa = m ** 3 * h, pK = n ** 4;
  const naChannel = pNa > 0.1 ? "Na⁺ channels: mostly conducting" : naInactivation === "inactivated" ? "Na⁺ channels: inactivated (cannot open until h recovers)" : naActivation === "closed" ? "Na⁺ channels: closed but available" : "Na⁺ channels: opening or closing";
  const kChannel = pK > 0.2 ? "K⁺ channels: mostly conducting" : pK > 0.05 ? "K⁺ channels: partly conducting" : "K⁺ channels: mostly closed";
  return { m, h, n, pNa, pK, naActivation, naInactivation, kGate, naChannel, kChannel };
}

/** Counts spikes (upward 0 mV crossings) in a simulation. */
export const countSpikes = (input: HhInput) => analyzeHh(simulateHh(input)).spikes;

/** Smallest first-pulse amplitude (µA/cm²) that makes a spike, by bisection to ±0.05; null if none up to `max`. */
export function thresholdAmplitude(base: HhInput, max = 200): number | null {
  const fires = (amp: number) => countSpikes({ ...base, amp, amp2: 0 }) >= 1;
  if (!fires(max)) return null;
  let lo = 0, hi = max;
  while (hi - lo > 0.05) { const mid = (lo + hi) / 2; if (fires(mid)) hi = mid; else lo = mid; }
  return Number(hi.toFixed(2));
}

export interface RefractoryPoint { delayMs: number; minAmp: number | null }
/**
 * For each delay, the smallest second-pulse amplitude (µA/cm², same duration as the first) that evokes a second spike,
 * or null if none up to `maxAmp` does. The first pulse is held at `firstAmp`.
 */
export function refractoryScan(base: HhInput, firstAmp: number, delays: number[], maxAmp = 400): RefractoryPoint[] {
  const out: RefractoryPoint[] = [];
  for (const d of delays) {
    const dur = Math.max(base.durationMs, base.startMs + d + base.durMs + 15);
    const cfg = (amp2: number): HhInput => ({ ...base, amp: firstAmp, amp2, delayMs: d, durationMs: Math.min(60, dur) });
    const second = (amp2: number) => countSpikes(cfg(amp2)) >= 2;
    if (!second(maxAmp)) { out.push({ delayMs: d, minAmp: null }); continue; }
    let lo = 0, hi = maxAmp;
    while (hi - lo > 0.2) { const mid = (lo + hi) / 2; if (second(mid)) hi = mid; else lo = mid; }
    out.push({ delayMs: d, minAmp: Number(hi.toFixed(1)) });
  }
  return out;
}
export const REFRACTORY_NOTE =
  "Absolute refractory period: no stimulus of any strength (within the tested range) can evoke a second spike, because Na⁺ channels are inactivated and cannot open. Relative refractory period: a second spike is possible but needs a stronger stimulus than normal, because some Na⁺ channels are still inactivated and K⁺ conductance is elevated.";
export const HH_LIMITS = [
  "Hodgkin–Huxley equations for the squid giant axon at 6.3 °C (Q₁₀ scaling to other temperatures is not offered). Parameters are fixed.",
  "A single isopotential patch of membrane with three currents (Na⁺, delayed-rectifier K⁺, leak). Other channels (Ca²⁺, A-type K⁺, HCN, Ca²⁺-activated K⁺) and the intracellular and extracellular concentration changes are not modelled.",
  "Results describe this model. They are not predictions of the excitability, firing rate or threshold of any mammalian neuron.",
  "Fixed-step fourth-order Runge–Kutta (dt = 0.01 ms); the trace is deterministic.",
];

// ---- propagation (schematic) ------------------------------------------------------------------------------------------------

export type SiteState = "resting" | "firing" | "refractory" | "depolarizing" | "passive-current";
export interface AxonUnit { id: string; kind: "initial" | "segment" | "node" | "internode" | "terminal"; label: string; regenerative: boolean }
export const AXON_LENGTH_UNITS = 12;
export function buildAxon(myelinated: boolean): AxonUnit[] {
  const units: AxonUnit[] = [{ id: "u0", kind: "initial", label: "Initial segment", regenerative: true }];
  if (!myelinated) {
    for (let i = 1; i <= AXON_LENGTH_UNITS - 1; i += 1) units.push({ id: `u${i}`, kind: "segment", label: `Segment ${i}`, regenerative: true });
  } else {
    // the same length: a node every third unit, insulated stretches between
    let node = 1, id = 1;
    for (let blockIdx = 0; blockIdx < 3; blockIdx += 1) {
      units.push({ id: `u${id}`, kind: "internode", label: `Internode ${blockIdx + 1}`, regenerative: false }); id += 1;
      units.push({ id: `u${id}`, kind: "node", label: `Node ${node}`, regenerative: true }); id += 1; node += 1;
    }
  }
  units.push({ id: `u${units.length}`, kind: "terminal", label: "Axon terminal", regenerative: true });
  return units;
}
export const regenerativeSites = (myelinated: boolean) => buildAxon(myelinated).filter((u) => u.regenerative).length;
export const propagationMaxStep = (myelinated: boolean) => regenerativeSites(myelinated) - 1;
export interface PropagationState { units: Array<AxonUnit & { state: SiteState }>; activeIndex: number; caption: string; sitesNeeded: number }
/** Step k means the k-th regenerative site is firing. Neighbouring sites only depolarize by local current until their turn. */
export function propagationState(myelinated: boolean, step: number): PropagationState {
  const axon = buildAxon(myelinated);
  const max = propagationMaxStep(myelinated);
  if (!Number.isInteger(step) || step < 0 || step > max) throw new RangeError("Propagation step out of range.");
  const sites = axon.map((u, i) => (u.regenerative ? i : -1)).filter((i) => i >= 0);
  const active = sites[step];
  const next = step < max ? sites[step + 1] : -1;
  const prevSites = sites.slice(Math.max(0, step - 2), step);
  const units = axon.map((u, i): AxonUnit & { state: SiteState } => {
    let state: SiteState = "resting";
    if (i === active) state = "firing";
    else if (prevSites.includes(i)) state = "refractory";
    else if (i === next) state = "depolarizing";
    else if (!u.regenerative && i > active && i < next) state = "passive-current";
    return { ...u, state };
  });
  const caption = step === 0
    ? "Threshold is reached at the axon initial segment, where Na⁺ channels are dense: the first action potential is generated."
    : myelinated
      ? `Node ${step} is firing. Current entering there flows passively through the insulated internode and depolarizes the next node to threshold; sites behind are refractory, so the spike moves one way.`
      : `Segment ${step} is firing. Its local current depolarizes the next segment to threshold; segments behind are refractory, so the spike moves one way.`;
  return { units, activeIndex: active, caption, sitesNeeded: sites.length };
}
export const MYELIN_EXPLANATION =
  "Myelin wraps the axon in many layers of membrane. That raises the resistance and lowers the capacitance of the insulated stretch, so less current leaks out and less charge is needed to depolarize it. Current entering at one node spreads passively along the internode and can depolarize the next node to threshold. Because the voltage-gated Na⁺ channels are clustered at the nodes, the action potential is regenerated only there (saltatory conduction). The same length needs far fewer regenerative events than continuous conduction in an unmyelinated axon.";
export const PROPAGATION_LIMITS = [
  "A schematic model of a regenerative event passing from site to site. Units are arbitrary: no conduction velocity, internode length or safety factor is computed.",
  "Only the order of events and the number of regenerative sites needed to cover the same length are compared.",
  "No claim is made about conduction failure or about how much structural change an axon can tolerate.",
];

// ---- synapse -------------------------------------------------------------------------------------------------------------------

export type SynapseExampleId = "glu-ampa" | "gaba-a" | "ach-nicotinic" | "ach-m2";
export type SynapsePerturbation = "none" | "block-cav" | "block-receptor" | "block-clearance";
export interface SynapseExample {
  id: SynapseExampleId; label: string; neurotransmitter: string; receptor: string; kind: "ionotropic" | "metabotropic";
  channelIons: string; clearance: string; context: string;
}
export const SYNAPSE_EXAMPLES: SynapseExample[] = [
  { id: "glu-ampa", label: "Glutamate at an AMPA receptor", neurotransmitter: "Glutamate", receptor: "AMPA receptor", kind: "ionotropic", channelIons: "Na⁺ (and K⁺) through a non-selective cation channel", clearance: "Excitatory amino-acid transporters take glutamate up into glia and neurons.", context: "A common fast excitatory synapse in the central nervous system." },
  { id: "gaba-a", label: "GABA at a GABA_A receptor", neurotransmitter: "GABA", receptor: "GABA_A receptor", kind: "ionotropic", channelIons: "Cl⁻ through an anion channel", clearance: "GABA transporters take GABA back up into neurons and glia.", context: "A common fast inhibitory synapse in mature neurons; the direction of Cl⁻ flow depends on the cell's intracellular Cl⁻." },
  { id: "ach-nicotinic", label: "Acetylcholine at a nicotinic receptor", neurotransmitter: "Acetylcholine", receptor: "Nicotinic receptor", kind: "ionotropic", channelIons: "Na⁺ and K⁺ through a non-selective cation channel", clearance: "Acetylcholinesterase hydrolyzes acetylcholine in the cleft.", context: "The skeletal-muscle neuromuscular junction." },
  { id: "ach-m2", label: "Acetylcholine at a muscarinic M₂ receptor", neurotransmitter: "Acetylcholine", receptor: "M₂ receptor (G-protein-coupled)", kind: "metabotropic", channelIons: "K⁺ through GIRK channels opened by Gβγ", clearance: "Acetylcholinesterase hydrolyzes acetylcholine in the cleft.", context: "Cardiac pacemaker cells: the same transmitter that excites muscle at a nicotinic receptor slows the heart here." },
];
export interface SynapseInput { example: SynapseExampleId; step: number; perturbation: SynapsePerturbation; vmPostMv: number; clInMm: number; thresholdMv: number }
export const DEFAULT_SYNAPSE: SynapseInput = { example: "glu-ampa", step: 0, perturbation: "none", vmPostMv: -60, clInMm: 8, thresholdMv: -55 };
export const SYNAPSE_STEPS = 9;
export const PERTURBATIONS_SYN: Array<{ id: SynapsePerturbation; label: string; effect: string }> = [
  { id: "none", label: "Normal synapse", effect: "All stages occur in order." },
  { id: "block-cav", label: "Presynaptic voltage-gated Ca²⁺ channels blocked", effect: "The action potential arrives but Ca²⁺ cannot enter, so vesicles do not fuse and no transmitter is released." },
  { id: "block-receptor", label: "Postsynaptic receptor blocked", effect: "Transmitter is released and reaches the cleft, but the receptor does not respond." },
  { id: "block-clearance", label: "Transmitter clearance blocked", effect: "Transmitter stays in the cleft, so the receptor keeps being activated." },
];
export function validateSynapse(raw: unknown): Result<SynapseInput> {
  if (!isObject(raw)) return fail("Synapse state must be an object.");
  if (typeof raw.example !== "string" || !SYNAPSE_EXAMPLES.some((e) => e.id === raw.example)) return fail("Unknown synapse example.");
  if (typeof raw.step !== "number" || !Number.isInteger(raw.step) || raw.step < 0 || raw.step >= SYNAPSE_STEPS) return fail("Synapse step out of range.");
  if (typeof raw.perturbation !== "string" || !PERTURBATIONS_SYN.some((p) => p.id === raw.perturbation)) return fail("Unknown synapse perturbation.");
  if (!inRange(raw.vmPostMv, -100, -30)) return fail("Postsynaptic voltage must be −100 to −30 mV.");
  if (!inRange(raw.clInMm, 2, 60)) return fail("Intracellular Cl⁻ must be 2–60 mM.");
  if (!inRange(raw.thresholdMv, -65, -40)) return fail("Threshold must be −65 to −40 mV.");
  return { ok: true, value: { example: raw.example as SynapseExampleId, step: raw.step, perturbation: raw.perturbation as SynapsePerturbation, vmPostMv: raw.vmPostMv, clInMm: raw.clInMm, thresholdMv: raw.thresholdMv } };
}
export const SYNAPSE_TEMP_C = 37;
const CL_OUT = TYPICAL_IONS.cl.out;
/** Reversal potential of the postsynaptic conductance for an example, in mV. */
export function reversalMv(example: SynapseExampleId, clInMm: number, ions: IonSet = TYPICAL_IONS): number {
  switch (example) {
    case "glu-ampa": case "ach-nicotinic": // equal Na⁺ and K⁺ permeability (GHK)
      return rtOverFMv(SYNAPSE_TEMP_C) * Math.log((ions.na.out + ions.k.out) / (ions.na.in + ions.k.in));
    case "gaba-a": return nernstMv(-1, CL_OUT, clInMm, SYNAPSE_TEMP_C);
    case "ach-m2": return nernstMv(1, ions.k.out, ions.k.in, SYNAPSE_TEMP_C);
  }
}
export interface SynapseStage { step: number; title: string; text: string }
export interface SynapseState {
  stage: SynapseStage;
  apArrived: boolean; cavOpen: boolean; calciumInflux: boolean; vesiclesFused: boolean; transmitterInCleft: boolean;
  transmitterBound: boolean; receptorActive: boolean; clearing: boolean; cleared: boolean;
  caption: string;
}
export function synapseStages(example: SynapseExample): SynapseStage[] {
  return [
    { step: 0, title: "Resting terminal", text: "Vesicles loaded with neurotransmitter sit near the presynaptic membrane. Voltage-gated Ca²⁺ channels are closed." },
    { step: 1, title: "Action potential arrives", text: "The presynaptic action potential depolarizes the axon terminal." },
    { step: 2, title: "Voltage-gated Ca²⁺ channels open", text: "Depolarization opens presynaptic voltage-gated Ca²⁺ channels. These are gated by voltage, not by the neurotransmitter." },
    { step: 3, title: "Ca²⁺ enters the terminal", text: "Ca²⁺ flows in down its electrochemical gradient (outside about 1–2 mM, inside about 100 nM at rest)." },
    { step: 4, title: "Vesicle fusion", text: "Ca²⁺ binds a sensor (synaptotagmin) and triggers SNARE-mediated fusion of vesicles with the presynaptic membrane (exocytosis)." },
    { step: 5, title: `${example.neurotransmitter} released`, text: `${example.neurotransmitter} is released into the synaptic cleft.` },
    { step: 6, title: "Diffusion across the cleft", text: `${example.neurotransmitter} diffuses across the narrow cleft and binds ${example.receptor} on the postsynaptic membrane.` },
    { step: 7, title: example.kind === "ionotropic" ? "Receptor channel opens; postsynaptic potential" : "G protein activates GIRK channels; postsynaptic potential", text: example.kind === "ionotropic" ? `${example.receptor} is a ligand-gated channel: binding opens its own pore (${example.channelIons}) and the membrane voltage moves toward the pore's reversal potential.` : "The receptor activates Gi; Gβγ then opens GIRK channels (K⁺ efflux). The response is slower than at an ionotropic receptor because it goes through a G-protein pathway." },
    { step: 8, title: "Transmitter cleared", text: `${example.clearance} The receptor deactivates and the postsynaptic potential decays.` },
  ];
}
export function synapseState(i: SynapseInput): SynapseState {
  const ex = SYNAPSE_EXAMPLES.find((e) => e.id === i.example)!;
  const stages = synapseStages(ex);
  const s = i.step;
  const noCa = i.perturbation === "block-cav";
  const apArrived = s >= 1;
  const cavOpen = s >= 2 && !noCa;
  const calciumInflux = s >= 3 && cavOpen;
  const vesiclesFused = s >= 4 && calciumInflux;
  const released = s >= 5 && vesiclesFused;
  const clearable = i.perturbation !== "block-clearance";
  const cleared = released && s >= 8 && clearable;
  const transmitterInCleft = released && !cleared;
  const transmitterBound = s >= 6 && released && !cleared;
  const receptorActive = s >= 7 && transmitterInCleft && i.perturbation !== "block-receptor";
  const clearing = released && s >= 8 && clearable;
  let caption = stages[s].text;
  if (noCa && s >= 2) caption = s === 2 ? "Presynaptic voltage-gated Ca²⁺ channels are blocked: they cannot open, so the downstream stages do not occur." : "No Ca²⁺ entered, so no vesicle fused and no neurotransmitter is in the cleft.";
  else if (i.perturbation === "block-receptor" && s >= 7) caption = `${ex.neurotransmitter} is in the cleft but ${ex.receptor} is blocked, so there is no postsynaptic response.`;
  else if (i.perturbation === "block-clearance" && s === 8) caption = `Clearance is blocked, so ${ex.neurotransmitter} stays in the cleft and keeps acting on the receptor.`;
  return { stage: stages[s], apArrived, cavOpen, calciumInflux, vesiclesFused, transmitterInCleft, transmitterBound, receptorActive, clearing, cleared, caption };
}
export interface PostsynapticResponse {
  reversalMv: number; vmMv: number; thresholdMv: number;
  polarity: "depolarizing" | "hyperpolarizing" | "no net change";
  effect: "excitatory" | "inhibitory";
  explanation: string;
}
export function postsynapticResponse(i: SynapseInput): PostsynapticResponse {
  const ex = SYNAPSE_EXAMPLES.find((e) => e.id === i.example)!;
  const erev = reversalMv(i.example, i.clInMm);
  const diff = erev - i.vmPostMv;
  const polarity = Math.abs(diff) < 0.05 ? "no net change" : diff > 0 ? "depolarizing" : "hyperpolarizing";
  const effect = erev > i.thresholdMv ? "excitatory" : "inhibitory";
  const why = `The conductance drives the voltage toward its reversal potential (${erev.toFixed(1)} mV). With the postsynaptic voltage at ${i.vmPostMv.toFixed(1)} mV that is ${polarity}. Because ${erev.toFixed(1)} mV is ${erev > i.thresholdMv ? "above" : "below"} the assumed threshold (${i.thresholdMv.toFixed(1)} mV), activating it can${erev > i.thresholdMv ? "" : "not"} by itself bring the membrane to threshold: ${effect}.`;
  return { reversalMv: erev, vmMv: i.vmPostMv, thresholdMv: i.thresholdMv, polarity, effect, explanation: `${ex.receptor}: ${why}` };
}
export const SYNAPSE_CONTEXT_NOTE =
  "A neurotransmitter has no fixed effect. The response depends on the receptor it binds and on the postsynaptic cell: acetylcholine is excitatory at the nicotinic receptors of skeletal muscle and inhibitory at M₂ receptors in the heart, and GABA's effect depends on the cell's intracellular Cl⁻. 'Excitatory' and 'inhibitory' here are decided by the reversal potential relative to an assumed spike threshold.";
export const SYNAPSE_LIMITS = [
  "Stages are ordered qualitatively; no release probability, vesicle count, cleft concentration or time course is computed.",
  "Reversal potentials come from the typical mammalian ion concentrations at 37 °C and equal Na⁺/K⁺ permeability for the cation channels; GABA_A is modelled as Cl⁻ only (bicarbonate permeability is ignored).",
  "The 'excitatory / inhibitory' label uses a threshold you set; it is not a measured property of the transmitter.",
];

// ---- synaptic integration ---------------------------------------------------------------------------------------------------------

export interface PspEvent { tMs: number; ampMv: number }
export interface SummationInput { events: PspEvent[]; rMohm: number; cPf: number; vRestMv: number; thresholdMv: number; tMaxMs: number }
export const SYNAPTIC_DECAY_MS = 2;
export const DEFAULT_SUMMATION: SummationInput = { events: [{ tMs: 5, ampMv: 5 }, { tMs: 10, ampMv: 5 }], rMohm: 100, cPf: 100, vRestMv: -65, thresholdMv: -55, tMaxMs: 60 };
export function validateSummation(raw: unknown): Result<SummationInput> {
  if (!isObject(raw)) return fail("Summation state must be an object.");
  if (!Array.isArray(raw.events) || raw.events.length < 1 || raw.events.length > 4) return fail("Between 1 and 4 postsynaptic potentials are supported.");
  const events: PspEvent[] = [];
  for (const e of raw.events) {
    if (!isObject(e) || !inRange(e.tMs, 0, 100) || !inRange(e.ampMv, -20, 20) || e.ampMv === 0) return fail("Each potential needs a time of 0–100 ms and a non-zero amplitude of −20 to 20 mV.");
    events.push({ tMs: e.tMs, ampMv: e.ampMv });
  }
  if (!inRange(raw.rMohm, 10, 1000) || !inRange(raw.cPf, 10, 500)) return fail("Membrane R must be 10–1000 MΩ and C 10–500 pF.");
  if (!inRange(raw.vRestMv, -90, -40) || !inRange(raw.thresholdMv, -65, -30) || raw.thresholdMv <= raw.vRestMv) return fail("Threshold must be above the resting voltage.");
  if (!inRange(raw.tMaxMs, 20, 200)) return fail("Duration must be 20–200 ms.");
  return { ok: true, value: { events, rMohm: raw.rMohm, cPf: raw.cPf, vRestMv: raw.vRestMv, thresholdMv: raw.thresholdMv, tMaxMs: raw.tMaxMs } };
}
/**
 * Unit-peak postsynaptic potential shape for an RC membrane (time constant tauM) driven by an exponentially decaying synaptic
 * current (time constant tauS): the difference of exponentials, scaled to peak 1 (alpha function if the constants are equal).
 */
export function pspShape(tMs: number, tauM: number, tauS: number = SYNAPTIC_DECAY_MS): number {
  if (tMs <= 0) return 0;
  if (Math.abs(tauM - tauS) < 1e-6) { const peak = tauM * Math.exp(-1); return ((tMs) * Math.exp(-tMs / tauM)) / peak; }
  const tPeak = (tauM * tauS * Math.log(tauM / tauS)) / (tauM - tauS);
  const f = (t: number) => Math.exp(-t / tauM) - Math.exp(-t / tauS);
  return f(tMs) / f(tPeak);
}
export function summationVoltage(i: SummationInput, tMs: number): number {
  const tau = membraneTauMs(i.rMohm, i.cPf);
  return i.vRestMv + i.events.reduce((sum, e) => sum + e.ampMv * pspShape(tMs - e.tMs, tau), 0);
}
export interface SummationResult { tauMs: number; peakMv: number; peakMs: number; reachesThreshold: boolean; series: Array<{ t: number; v: number }>; statement: string }
export function evaluateSummation(i: SummationInput, points = 400): SummationResult {
  const tau = membraneTauMs(i.rMohm, i.cPf);
  const series: Array<{ t: number; v: number }> = [];
  let peak = -Infinity, peakMs = 0;
  for (let k = 0; k <= points; k += 1) {
    const t = (i.tMaxMs * k) / points, v = summationVoltage(i, t);
    series.push({ t, v });
    if (v > peak) { peak = v; peakMs = t; }
  }
  const reaches = peak >= i.thresholdMv;
  const statement = reaches
    ? `The summed potential reaches ${peak.toFixed(1)} mV, at or above the assumed threshold (${i.thresholdMv} mV). Whether an action potential follows depends on the cell's voltage-gated Na⁺ channels, which this linear model does not include.`
    : `The summed potential peaks at ${peak.toFixed(1)} mV, below the assumed threshold (${i.thresholdMv} mV).`;
  return { tauMs: tau, peakMv: peak, peakMs, reachesThreshold: reaches, series, statement };
}
export const SUMMATION_ASSUMPTIONS = [
  "One passive RC compartment (the time constant is R·C from the passive-membrane settings); potentials add linearly. Changes in driving force, channel conductance shunting and dendritic geometry are ignored, so spatial summation here means simultaneous inputs at different synapses onto the same compartment.",
  "Each synaptic current decays exponentially with a 2 ms time constant; amplitudes are the peak potentials you enter.",
  "The threshold is an assumption you can change. Reaching it does not by itself produce an action potential: that needs voltage-gated Na⁺ channels, as in the Hodgkin–Huxley model.",
];
