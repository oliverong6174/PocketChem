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

// ---- forces, energy and collisions (Stage 14) ---------------------------------------------------------------------------------

import { analyzeEnergy } from "./energy";
import { analyzeForces, describeState } from "./forces";
import { solveCollision } from "./collisions";
import {
  COLLISIONS_ENGINE_VERSION, ENERGY_ENGINE_VERSION, FORCES_ENGINE_VERSION,
  type CollisionsInputs, type EnergyInputs, type ForcesInputs,
} from "../persistence/physicsTools";

export const FORCES_ASSUMPTIONS = [
  "One rigid body treated as a point (or a block with a hanging mass over an ideal pulley): no rotation, no tipping, no torques.",
  "Coulomb friction: static friction adapts up to μₛN, kinetic friction is μₖN and opposes sliding; both coefficients are constant and μₖ ≤ μₛ.",
  "A flat or inclined plane with constant gravity and no air resistance. The normal force is whatever the surface supplies, N = mg cosθ − F sinφ; if that is negative the body has left the surface.",
  "Constant applied force; the string is light, inextensible and stays taut; the pulley is ideal and frictionless.",
];
export const ENERGY_ASSUMPTIONS = [
  "A point mass with constant gravity near Earth's surface; potential energy mg(h − h_ref) depends on the chosen reference height (the bottom of the incline, or the height you set).",
  "An ideal Hookean spring (massless, F = kx, no damping) and constant kinetic friction μₖN; no air resistance.",
  "Friction turns mechanical energy into heat (Q): mechanical energy decreases, total energy KE + PE + Q is conserved; the external applied force adds W_applied.",
  "The block never leaves its track: the incline has ends, the spring is released from rest, and the height scenario stops at the ground.",
];
export const COLLISION_ASSUMPTIONS = [
  "Two rigid bodies on a frictionless straight line with A to the left of B; no external forces, so total momentum is conserved.",
  "The collision is instantaneous and idealised: the velocities after it follow from momentum conservation and the coefficient of restitution e (0 ≤ e ≤ 1). No contact-force history is modelled.",
  "Bodies collide only if A is closing on B (vA > vB); otherwise they never touch and nothing is invented.",
  "An average collision force is shown only when you give a collision duration (F = impulse / duration).",
];

const fmtN = (v: number) => formatSI(v, "N");

export function summarizeForces(inputs: ForcesInputs): PhysicsResults | null {
  const a = analyzeForces(inputs.input);
  const m = a.at(0);
  return {
    engineVersion: FORCES_ENGINE_VERSION,
    headline: [
      `${describeState(m.state)}${m.state === "sliding" ? `: a = ${fmt(m.a)} m/s²` : ""}`,
      a.contact ? `Normal force ${fmtN(a.normal)}; ${m.friction.kind === "none" ? "no friction" : `${m.friction.kind} friction ${fmtN(Math.abs(m.friction.value))}`}` : "Contact lost: no normal force or surface friction",
      `Net force ${fmtN(m.net.magnitude)}`,
      a.contact ? `Static friction limit μₛN = ${fmtN(a.staticMax)}` : "No static-friction limit (not touching)",
    ],
    assumptions: FORCES_ASSUMPTIONS,
    check: a.contact ? a.normal : m.net.magnitude,
    checkLabel: a.contact ? "normal force (N)" : "net force (N)",
  };
}

export function summarizeEnergy(inputs: EnergyInputs): PhysicsResults | null {
  const a = analyzeEnergy(inputs.input);
  const f = a.final;
  return {
    engineVersion: ENERGY_ENGINE_VERSION,
    headline: [
      `The body ${a.ending}`,
      `Final speed ${fmt(Math.abs(f.v))} m/s, kinetic energy ${formatSI(f.KE, "J")}`,
      `Heat from friction ${formatSI(f.Q, "J")}; work by the applied force ${formatSI(f.Wapplied, "J")}`,
      `Energy ledger KE + PE + Q = ${formatSI(f.Etotal, "J")} (started at ${formatSI(a.initial.Etotal, "J")})`,
    ],
    assumptions: ENERGY_ASSUMPTIONS,
    check: f.Etotal,
    checkLabel: "total energy at the end (J)",
  };
}

export function summarizeCollisions(inputs: CollisionsInputs): PhysicsResults | null {
  const r = solveCollision(inputs.input);
  const i = inputs.input;
  return {
    engineVersion: COLLISIONS_ENGINE_VERSION,
    headline: r.collides
      ? [
        `${r.kind[0].toUpperCase()}${r.kind.slice(1)} collision at t = ${fmt(r.tc!)} s`,
        `Velocities after: A ${fmt(r.vA2)} m/s, B ${fmt(r.vB2)} m/s (before: ${fmt(i.vA)} and ${fmt(i.vB)} m/s)`,
        `Total momentum ${fmt(r.pTotal)} kg·m/s conserved; impulse on B ${fmt(r.J)} N·s`,
        `Kinetic energy ${formatSI(r.KEbefore, "J")} → ${formatSI(r.KEafter, "J")} (${fmt(100 * r.lossFraction)} % lost)`,
      ]
      : [r.reason, `Total momentum ${fmt(r.pTotal)} kg·m/s`],
    assumptions: COLLISION_ASSUMPTIONS,
    check: r.collides ? r.vB2 : r.pTotal,
    checkLabel: r.collides ? "final velocity of B (m/s)" : "total momentum (kg·m/s)",
  };
}
