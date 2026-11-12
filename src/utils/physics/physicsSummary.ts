/**
 * Display summaries (and the one `check` number) stored beside saved Physics inputs, plus the assumption lists each tool states.
 * Pure functions of validated inputs; used by the pages and by the tests.
 */
import { analyzeCircuit, describeStructure } from "./circuits";
import { fmt, formatSI } from "./format";
import { summarize as summarizeMotion } from "./mechanics";
import { summarize as summarizeRcModel, timeConstant } from "./rc";
import {
  CIRCUITS_ENGINE_VERSION, MECHANICS_ENGINE_VERSION, RC_ENGINE_VERSION, mechanicsKinematics,
  type CircuitsInputs, type MechanicsInputs, type PhysicsResults, type RcInputs,
} from "../persistence/physicsTools";

export const MECHANICS_ASSUMPTIONS = [
  "A point particle: no size, spin or shape.",
  "Constant acceleration. For projectile motion that is gravity alone, constant in size and direction, with no air resistance, wind or lift.",
  "A flat ground at y = 0. The flight ends the first time the particle comes back down to it; the landing height is never assumed equal to the launch height.",
  "Flat, non-rotating Earth over distances short enough that g is constant. Not valid for long-range or orbital motion.",
];
export const CIRCUITS_ASSUMPTIONS = [
  "One ideal DC voltage source (no internal resistance) driving ideal resistors (no inductance, capacitance or temperature dependence) joined by ideal wires.",
  "Only networks built from series and parallel groups are supported. Other topologies, such as a Wheatstone bridge with a bridging resistor, are refused rather than approximated.",
  "Steady state: all voltages and currents are constant. Transients are in the RC tool.",
  "Conventional current: from the source's + terminal through the network to its − terminal.",
];
export const RC_ASSUMPTIONS = [
  "One ideal source, one resistor and one ideal capacitor in a single loop, with the switch closing at t = 0. Ideal wires and source; no leakage current through the capacitor.",
  "The capacitor voltage at t = 0 is the stated initial voltage, and the voltage cannot jump because that would need an infinite current through a finite resistance.",
  "The single exponential applies only to this one-resistor, one-capacitor circuit. It does not describe several capacitors, several loops or inductors.",
];

export function summarizeMechanics(inputs: MechanicsInputs): PhysicsResults | null {
  const s = summarizeMotion(mechanicsKinematics(inputs));
  const headline = [
    s.lands ? `Time of flight ${fmt(s.tFlight!)} s${s.degenerate ? " (the particle starts on the ground and is not moving up)" : ""}` : `Observed for ${fmt(s.tEnd)} s; the particle does not land`,
    s.range === null ? "No landing, so there is no range" : `Horizontal range ${fmt(s.range)} m`,
    `Maximum height ${fmt(s.maxHeight)} m${s.apexIsTurning ? ` at t = ${fmt(s.tApex)} s` : ""}`,
    `Final velocity (${fmt(s.end.vx)}, ${fmt(s.end.vy)}) m/s, speed ${fmt(s.end.speed)} m/s`,
  ];
  return { engineVersion: MECHANICS_ENGINE_VERSION, headline, assumptions: MECHANICS_ASSUMPTIONS, check: s.range ?? s.tEnd, checkLabel: s.range === null ? "observation time (s)" : "range (m)" };
}

export function summarizeCircuits(inputs: CircuitsInputs): PhysicsResults | null {
  const a = analyzeCircuit(inputs.circuit);
  if (!Number.isFinite(a.current) || !Number.isFinite(a.equivalent)) return null;
  return {
    engineVersion: CIRCUITS_ENGINE_VERSION,
    headline: [
      `${describeStructure(inputs.circuit.root)} at ${fmt(a.voltage)} V`,
      `Equivalent resistance ${formatSI(a.equivalent, "Ω")}`,
      `Source current ${formatSI(a.current, "A")}, power ${formatSI(a.power, "W")}`,
      ...a.resistors.map((r) => `${r.label}: ${formatSI(r.voltage, "V")}, ${formatSI(r.current, "A")}, ${formatSI(r.power, "W")}`),
    ].slice(0, 12),
    assumptions: CIRCUITS_ASSUMPTIONS,
    check: a.equivalent,
    checkLabel: "equivalent resistance (Ω)",
  };
}

export function summarizeRc(inputs: RcInputs): PhysicsResults | null {
  const s = summarizeRcModel(inputs.rc);
  const { Vs, V0 } = inputs.rc;
  return {
    engineVersion: RC_ENGINE_VERSION,
    headline: [
      `${s.direction === "steady" ? "No transient" : s.direction === "charging" ? "Charging" : "Discharging"}: ${fmt(V0)} V → ${fmt(Vs)} V`,
      `Time constant τ = RC = ${formatSI(timeConstant(inputs.rc), "s")}`,
      `Initial current ${formatSI(s.I0, "A")}; energy change ${formatSI(s.deltaU, "J")}`,
    ],
    assumptions: RC_ASSUMPTIONS,
    check: s.tau,
    checkLabel: "time constant (s)",
  };
}
