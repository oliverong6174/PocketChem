/**
 * Display summaries (and the one `check` number) saved beside the Stage 23 inputs, plus the assumption lists each tool states.
 * Pure functions of validated inputs. Assumption lines are kept under 400 characters so they can be saved.
 */
import {
  ION_IDS, IONS, PASSIVE_SOLUTES, evaluateIons, evaluateOsmosis, evaluatePassive, evaluateSglt, fluidity, pumpState,
} from "./membrane23";
import { SYSTEMS, evaluateSignaling, isOn } from "./signaling23";
import {
  HH, SYNAPSE_EXAMPLES, analyzeHh, evaluateSummation, membraneTauMs, passiveVoltageMv, postsynapticResponse, regenerativeSites, restingPotential, simulateHh, steadyDeltaMv,
} from "./neuron23";
import {
  MEMBRANE_ENGINE_VERSION, NEURON_ENGINE_VERSION, SIGNALING_ENGINE_VERSION, type MembraneInputs, type NeuronInputs, type SignalingInputs,
} from "../persistence/biologyTools23";
import type { BiologyResults } from "../persistence/biologyTools";

export const MEMBRANE_ASSUMPTIONS = [
  "Ideal solutions, a single temperature (0–50 °C) and concentrations in mM. Concentrations and permeabilities are illustrative textbook values, not those of a specific cell.",
  "Nernst potentials use the signed valence z; an ion's Nernst potential is its equilibrium potential, not the actual membrane voltage unless that ion is the only permeant one.",
  "Neutral solutes: flux = permeability × concentration difference (simple diffusion, channel) or a symmetrical saturable carrier. Ion movement is decided by the electrochemical balance; no ion flux magnitude is claimed.",
  "GHK voltage uses K⁺, Na⁺ and Cl⁻ only, with constant field, independent ions and zero net current; the pump's electrogenic current is not included.",
  "Na⁺/K⁺-ATPase is shown as one simplified Post–Albers cycle (3 Na⁺ out, 2 K⁺ in, 1 ATP). SGLT1 is a 2 Na⁺ : 1 glucose symporter; its limit is thermodynamic, not a prediction.",
  "Osmosis: NaCl and sucrose are effectively impermeant, urea is freely permeant, NaCl counts two particles. Volume is reported only within 0.5–2 × the starting volume and only as an idealized equilibrium; no wall, elasticity or lysis.",
  "Membrane fluidity is a five-step ordinal comparison between schematic states, not a measurement or a prediction for real lipids.",
];
export const SIGNALING_ASSUMPTIONS = [
  "Each pathway is a small curated mechanism graph; states are on, off, blocked, attenuated or persisting, derived from the graph and the chosen perturbations. They are not concentrations or rates.",
  "No amplification factor is given: that would need rate constants and concentrations. Steps that can amplify are only marked.",
  "Termination and feedback are modelled as functional or blocked. Blocking a terminator lets the state persist after the ligand is removed; prolonged exposure attenuates the signal where feedback is functional.",
  "Perturbations give direct modelled consequences only. Effects on proliferation, differentiation, survival or organism-level phenotype depend on cell type and context and are not predicted.",
  "The RTK route is EGFR → Grb2/SOS → Ras → Raf → MEK → ERK only; other receptors and branches differ. Only conventional PKC is modelled in the Gq branch. Gβγ effectors are not shown.",
];
export const NEURON_ASSUMPTIONS = [
  "Resting potential: Goldman–Hodgkin–Katz with K⁺, Na⁺ and Cl⁻ and relative permeabilities you set; constant field, no pump current. It is not a measurement of any particular neuron.",
  "Passive membrane: one parallel RC compartment driven by a current pulse (C dV/dt = I − (V − Vrest)/R). Real membranes are not ideal capacitors and resistors and are not isopotential.",
  "Action potential: Hodgkin–Huxley squid giant axon at 6.3 °C, fixed parameters, RK4 with dt = 0.01 ms. Only stimulus and TTX-/TEA-like blocks vary. Not a predictor of mammalian neuron excitability.",
  "Propagation is schematic: the order of regenerative events and the number of sites needed. No conduction velocity or conduction failure is computed.",
  "Synapse: ordered qualitative stages; postsynaptic polarity from the reversal potential versus the membrane voltage; excitatory or inhibitory is judged against an assumed threshold.",
  "Summation: linear superposition in one RC compartment with 2 ms synaptic current decay. Reaching the assumed threshold does not by itself produce an action potential.",
];

const ok = (engineVersion: number, headline: string[], assumptions: string[], check: number, checkLabel: string): BiologyResults => ({ engineVersion, headline: headline.map((h) => h.slice(0, 390)), assumptions, check, checkLabel });

export function summarizeMembrane(i: MembraneInputs): BiologyResults | null {
  switch (i.section) {
    case "bilayer": {
      const f = fluidity(i.bilayer);
      return ok(MEMBRANE_ENGINE_VERSION, [`Bilayer: ${i.bilayer.lipids} lipids, ${i.bilayer.temperature} temperature, cholesterol ${i.bilayer.cholesterol ? "present" : "absent"}`, `Schematic fluidity class: ${f.label}`], MEMBRANE_ASSUMPTIONS, f.level, "ordinal fluidity class (0–4)");
    }
    case "passive": {
      const r = evaluatePassive(i.passive);
      const lines = [`${PASSIVE_SOLUTES[i.passive.solute].label}, ${i.passive.mechanism} transport: net movement ${r.direction === "none" ? "none (equilibrium)" : r.direction}`];
      if (r.ion) lines.push(`E = ${r.ion.eMv.toFixed(1)} mV, Vm = ${i.passive.vmMv} mV, Vm − E = ${r.ion.drivingMv.toFixed(1)} mV`);
      else lines.push(`Net inward flux = ${(r.fluxIn ?? 0).toExponential(3)} µmol cm⁻² s⁻¹`);
      return ok(MEMBRANE_ENGINE_VERSION, lines, MEMBRANE_ASSUMPTIONS, r.ion ? Number(r.ion.drivingMv.toFixed(3)) : Number((r.fluxIn ?? 0).toPrecision(6)), r.ion ? "Vm − E (mV)" : "net inward flux (µmol cm⁻² s⁻¹)");
    }
    case "ions": {
      const e = evaluateIons(i.ions);
      const sel = e.ions.find((x) => x.ion === i.ions.selected)!;
      return ok(MEMBRANE_ENGINE_VERSION, [`Membrane voltage ${e.vmMv.toFixed(1)} mV (${i.ions.vmSource === "ghk" ? "GHK" : "set manually"}) at ${i.ions.tempC} °C`, ...ION_IDS.map((id) => { const x = e.ions.find((y) => y.ion === id)!; return `E(${IONS[id].symbol}) = ${x.eMv.toFixed(1)} mV; open channel: net ${x.direction}`; })], MEMBRANE_ASSUMPTIONS, Number(sel.eMv.toFixed(3)), `E(${IONS[sel.ion].symbol}) (mV)`);
    }
    case "active": {
      if (i.active.transporter === "nak") {
        const s = pumpState(i.active.pumpStep, i.active.pumpPerturbation);
        return ok(MEMBRANE_ENGINE_VERSION, [`Na⁺/K⁺-ATPase step ${i.active.pumpStep} of 7: ${s.title}`, `Na⁺ out ${s.naMovedOut}, K⁺ in ${s.kMovedIn}, ATP hydrolysed ${s.atpHydrolyzed}`], MEMBRANE_ASSUMPTIONS, s.atpHydrolyzed, "ATP hydrolysed so far");
      }
      const r = evaluateSglt(i.active.sglt);
      return ok(MEMBRANE_ENGINE_VERSION, [`SGLT1 (2 Na⁺ : 1 glucose): ΔG per cycle ${r.deltaGCycleKJ.toFixed(1)} kJ/mol, net glucose ${r.glucoseDirection}`, `Thermodynamic accumulation limit ${r.maxAccumulationRatio.toPrecision(3)}×`], MEMBRANE_ASSUMPTIONS, Number(r.deltaGCycleKJ.toFixed(4)), "ΔG per cycle (kJ/mol)");
    }
    case "osmosis": {
      const r = evaluateOsmosis(i.osmosis);
      return ok(MEMBRANE_ENGINE_VERSION, [`Solution is ${r.osmolarity} and ${r.tonicity} for this cell`, `Initial water movement: ${r.initialWater}; the cell ${r.cellInitially}`, r.relativeVolume === null ? "No equilibrium volume reported (outside the supported range)" : `Idealized equilibrium volume ${r.relativeVolume.toFixed(2)} × starting volume`], MEMBRANE_ASSUMPTIONS, r.outImpermeantOsm - r.inImpermeantOsm, "effective (impermeant) osmolarity out − in (mOsm/L)");
    }
  }
}
export function describeMembrane(i: MembraneInputs): string {
  const s = summarizeMembrane(i);
  return `Membranes, ${i.section}: ${s?.headline[0] ?? ""}`.slice(0, 300);
}

export function summarizeSignaling(i: SignalingInputs): BiologyResults | null {
  const ev = evaluateSignaling(i.sig);
  const sys = SYSTEMS[i.sig.system];
  const active = sys.nodes.filter((n) => n.kind !== "terminator" && ev.reached[n.id] && isOn(ev.current[n.id]));
  const blocked = sys.nodes.filter((n) => ev.current[n.id] === "blocked" && n.kind !== "terminator");
  const lines = [`${sys.label}, phase: ${i.sig.phase}`, `Active components: ${active.map((n) => n.label).join(", ") || "none"}`];
  if (i.sig.perturbations.length) lines.push(`Perturbations: ${i.sig.perturbations.map((p) => sys.perturbations.find((x) => x.id === p)!.label).join("; ")}`);
  if (blocked.length) lines.push(`Blocked: ${blocked.map((n) => n.label).join(", ")}`);
  return ok(SIGNALING_ENGINE_VERSION, lines, SIGNALING_ASSUMPTIONS, active.length, "active signalling components");
}
export function describeSignaling(i: SignalingInputs): string {
  const sys = SYSTEMS[i.sig.system];
  return `Signaling: ${sys.example}${i.sig.perturbations.length ? ` with ${i.sig.perturbations.length} perturbation${i.sig.perturbations.length > 1 ? "s" : ""}` : ""} (${i.sig.phase})`.slice(0, 300);
}

export function summarizeNeuron(i: NeuronInputs): BiologyResults | null {
  switch (i.section) {
    case "anatomy": return ok(NEURON_ENGINE_VERSION, ["Neuron anatomy: input, integration, initiation, propagation and output"], NEURON_ASSUMPTIONS, 0, "no calculation (anatomy)");
    case "resting": {
      const r = restingPotential(i.resting);
      return ok(NEURON_ENGINE_VERSION, [`GHK resting potential ${r.vmMv.toFixed(1)} mV`, `Gap from E_K: ${r.gapFromEkMv.toFixed(1)} mV`, ...r.nernst.map((n) => `E(${n.symbol}) = ${n.eMv.toFixed(1)} mV`)], NEURON_ASSUMPTIONS, Number(r.vmMv.toFixed(3)), "GHK resting potential (mV)");
    }
    case "passive": {
      const tau = membraneTauMs(i.passive.rMohm, i.passive.cPf);
      return ok(NEURON_ENGINE_VERSION, [`τ = RC = ${tau.toPrecision(4)} ms; steady change IR = ${steadyDeltaMv(i.passive.iPa, i.passive.rMohm).toPrecision(4)} mV`, `Voltage at the cursor (${i.passiveTimeMs.toFixed(1)} ms): ${passiveVoltageMv(i.passive, i.passiveTimeMs).toFixed(2)} mV`], NEURON_ASSUMPTIONS, Number(tau.toPrecision(6)), "membrane time constant (ms)");
    }
    case "ap": {
      const a = analyzeHh(simulateHh(i.hh));
      return ok(NEURON_ENGINE_VERSION, [`Hodgkin–Huxley: ${a.spikes} spike${a.spikes === 1 ? "" : "s"}; peak ${a.peakMv.toFixed(1)} mV (E_Na = ${HH.eNa} mV)`, a.minAfterMv === null ? "No spike: no afterhyperpolarization" : `Minimum after the spike ${a.minAfterMv.toFixed(1)} mV (E_K = ${HH.eK} mV)`], NEURON_ASSUMPTIONS, a.spikes, "spikes in the simulation");
    }
    case "propagation": return ok(NEURON_ENGINE_VERSION, [`${i.prop.myelinated ? "Myelinated" : "Unmyelinated"} axon, regenerative site ${i.prop.step + 1} of ${regenerativeSites(i.prop.myelinated)}`], NEURON_ASSUMPTIONS, regenerativeSites(i.prop.myelinated), "regenerative sites over the same length");
    case "synapse": {
      const ex = SYNAPSE_EXAMPLES.find((e) => e.id === i.synapse.example)!;
      const r = postsynapticResponse(i.synapse);
      return ok(NEURON_ENGINE_VERSION, [`${ex.label}: stage ${i.synapse.step + 1} of 9`, `Reversal potential ${r.reversalMv.toFixed(1)} mV; response ${r.polarity}, ${r.effect}`], NEURON_ASSUMPTIONS, Number(r.reversalMv.toFixed(3)), "reversal potential (mV)");
    }
    case "summation": {
      const r = evaluateSummation(i.summation);
      return ok(NEURON_ENGINE_VERSION, [`${i.summation.events.length} postsynaptic potential${i.summation.events.length > 1 ? "s" : ""}; τ = ${r.tauMs.toPrecision(3)} ms`, `Peak ${r.peakMv.toFixed(1)} mV; ${r.reachesThreshold ? "reaches" : "does not reach"} the assumed threshold`], NEURON_ASSUMPTIONS, Number(r.peakMv.toFixed(3)), "peak summed voltage (mV)");
    }
  }
}
export function describeNeuron(i: NeuronInputs): string {
  const s = summarizeNeuron(i);
  return `Neuron, ${i.section}: ${s?.headline[0] ?? ""}`.slice(0, 300);
}
