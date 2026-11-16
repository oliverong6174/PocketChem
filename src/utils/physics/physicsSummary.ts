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


// ---- waves, optics, interference (Stage 21) --------------------------------------------------------------------------------------

import { solveImaging, solveRefraction } from "./optics";
import { summarizeSlits } from "./interference";
import { classifySuperposition, harmonicFrequency, solveDoppler, waveQuantities } from "./waves";
import {
  INTERFERENCE_ENGINE_VERSION, OPTICS_ENGINE_VERSION, WAVES_ENGINE_VERSION,
  type InterferenceInputs, type OpticsInputs, type WavesInputs,
} from "../persistence/physicsTools";

export const WAVES_ASSUMPTIONS = [
  "Small-amplitude (linear) waves in a uniform, lossless medium: the wave speed is set by the medium and does not depend on frequency or amplitude, and nothing is damped. The amplitude is limited to 0.15 of the wavelength.",
  "Superposition is exact addition of displacements. Two waves share one medium and so one wave speed. A true standing wave needs equal frequency and amplitude in opposite directions; other opposite-direction pairs are labelled partly standing.",
  "Standing waves use the elementary boundary conditions: a string fixed at both ends, a pipe open at both ends and a pipe closed at one end, with no end correction, damping or driving model. Displacement (not pressure) is drawn.",
  "Doppler effect for sound in a medium at rest and motion along the line joining source and observer, with speeds below the speed of sound: f′ = f (c + v_o)/(c − v_s). Supersonic sources (shock waves), motion across the line, wind and the relativistic Doppler shift of light are not modelled.",
];
export const OPTICS_ASSUMPTIONS = [
  "A single thin lens or spherical mirror in the paraxial approximation: rays stay close to the axis and make small angles, so there are no spherical or chromatic aberrations and no lens thickness. Two-element systems are not modelled.",
  "Real objects only (object distance positive). Sign convention: real images have s′ > 0; f > 0 for a converging lens or concave mirror. The mirror focal length is R/2.",
  "Refraction at a flat boundary between two uniform transparent media with Snell's law. The reflected ray is drawn with angle of reflection equal to the angle of incidence; how much light is reflected and transmitted (Fresnel) is not calculated, and dispersion is ignored.",
  "Principal rays are constructed from the standard rules and drawn from the same numbers as the equations; an image at infinity is reported as such, never as a very large number.",
];
export const INTERFERENCE_ASSUMPTIONS = [
  "Monochromatic, coherent, scalar light and identical rectangular slits, observed in the far field (Fraunhofer): I/I₀ = sinc²β · [sin Nγ / (N sin γ)]². Settings whose Fresnel number exceeds 0.5 are refused, because the pattern would not be correct there.",
  "The pattern is calculated at the true angle (screen position y = L tanθ), with no small-angle approximation in the intensity; the simple fringe spacing λL/d is labelled as small-angle.",
  "Not modelled: finite source size or coherence, polarization, slits of different widths, thin-film and Michelson interference, and the angle dependence of the amplitude beyond the slit envelope. The colour is a display aid for the wavelength.",
];

export function summarizeWaves(inputs: WavesInputs): PhysicsResults | null {
  const v = inputs.view;
  if (v === "travel") {
    const q = waveQuantities(inputs.wave);
    return {
      engineVersion: WAVES_ENGINE_VERSION,
      headline: [
        `Wavelength ${fmt(q.lambda)} m, period ${fmt(q.T)} s (v = fλ = ${fmt(inputs.wave.v)} m/s)`,
        `Greatest particle speed ωA = ${fmt(q.omega * inputs.wave.A)} m/s, not the wave speed`,
        `${inputs.longitudinal ? "Longitudinal" : "Transverse"} display, traveling toward ${inputs.wave.dir === 1 ? "+x" : "−x"}`,
      ],
      assumptions: WAVES_ASSUMPTIONS, check: q.lambda, checkLabel: "wavelength (m)",
    };
  }
  if (v === "superposition") {
    const c = classifySuperposition(inputs.sup);
    return {
      engineVersion: WAVES_ENGINE_VERSION,
      headline: [c.title, `Largest amplitude ${fmt(c.maxAmplitude)} m, smallest ${fmt(c.minAmplitude)} m`, `Beat frequency |f₁ − f₂| = ${fmt(c.beatFrequency)} Hz`],
      assumptions: WAVES_ASSUMPTIONS, check: c.maxAmplitude, checkLabel: "largest amplitude (m)",
    };
  }
  if (v === "standing") {
    const r = inputs.res;
    const f = harmonicFrequency(r.kind, r.L, r.v, r.n);
    return {
      engineVersion: WAVES_ENGINE_VERSION,
      headline: [`Harmonic ${r.n} at ${fmt(f)} Hz (fundamental ${fmt(harmonicFrequency(r.kind, r.L, r.v, 1))} Hz)`, `Wavelength ${fmt((r.kind === "closed" ? 4 : 2) * r.L / r.n)} m in a length of ${fmt(r.L)} m`],
      assumptions: WAVES_ASSUMPTIONS, check: f, checkLabel: "frequency of the harmonic (Hz)",
    };
  }
  const d = solveDoppler(inputs.dop);
  return {
    engineVersion: WAVES_ENGINE_VERSION,
    headline: [`Observed frequency ${fmt(d.fObserved)} Hz from ${fmt(inputs.dop.fs)} Hz emitted (${d.trend === "same" ? "no shift" : d.trend})`, `Wavelength in the medium ${fmt(d.lambdaMedium)} m (${fmt(d.lambdaAtRest)} m at rest)`],
    assumptions: WAVES_ASSUMPTIONS, check: d.fObserved, checkLabel: "observed frequency (Hz)",
  };
}

export function summarizeOptics(inputs: OpticsInputs): PhysicsResults | null {
  if (inputs.view === "refraction") {
    const s = solveRefraction(inputs.refraction);
    return {
      engineVersion: OPTICS_ENGINE_VERSION,
      headline: [
        s.tir ? "Total internal reflection: no refracted ray" : `Refracted ray at ${fmt(s.theta2 as number)}° (${s.bending})`,
        s.critical === null ? "No critical angle: light enters a denser medium" : `Critical angle ${fmt(s.critical)}°`,
      ],
      assumptions: OPTICS_ASSUMPTIONS, check: s.theta2 ?? s.thetaReflected, checkLabel: s.tir ? "angle of reflection (°)" : "angle of refraction (°)",
    };
  }
  const r = solveImaging(inputs.imaging);
  return {
    engineVersion: OPTICS_ENGINE_VERSION,
    headline: r.sPrime === null
      ? ["The object is at the focal point: the rays leave parallel and there is no image (it is at infinity)"]
      : [`${r.nature[0].toUpperCase()}${r.nature.slice(1)}, ${r.orientation}, ${r.size} image`, `Image distance ${fmt(r.sPrime)} cm, magnification ${fmt(r.m as number)}`, `Image height ${fmt(r.hPrime as number)} cm; power ${fmt(r.power)} dioptres`],
    assumptions: OPTICS_ASSUMPTIONS, check: r.sPrime ?? 0, checkLabel: r.sPrime === null ? "image distance (none: at infinity)" : "image distance (cm)",
  };
}

export function summarizeInterference(inputs: InterferenceInputs): PhysicsResults | null {
  const s = inputs.slits;
  const r = summarizeSlits(s);
  return {
    engineVersion: INTERFERENCE_ENGINE_VERSION,
    headline: s.N === 1
      ? [`Central maximum ${fmt(2000 * (r.centralHalfWidth ?? 0))} mm wide (first minima at ±${fmt(1000 * (r.centralHalfWidth ?? 0))} mm)`, `Fresnel number ${fmt(r.fresnel)} (far-field model valid below 0.5)`]
      : [
        `Fringe spacing ≈ ${fmt(1000 * (r.fringeSpacing as number))} mm; highest order ${r.maxOrder}`,
        r.missingOrders.length ? `Missing orders: ${r.missingOrders.slice(0, 4).join(", ")}${r.missingOrders.length > 4 ? "…" : ""}` : "No missing orders",
        `${r.fringesInCentral} fringes inside the central diffraction peak`,
      ],
    assumptions: INTERFERENCE_ASSUMPTIONS, check: s.N === 1 ? 2000 * (r.centralHalfWidth ?? 0) : 1000 * (r.fringeSpacing as number), checkLabel: s.N === 1 ? "width of the central maximum (mm)" : "fringe spacing (mm)",
  };
}