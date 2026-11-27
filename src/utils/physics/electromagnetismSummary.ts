/**
 * Stage 24 display summaries (and the single `check` number stored beside saved inputs) plus the assumption lists for the Electric
 * fields, Magnetic fields and Electromagnetic induction laboratories. Pure functions of validated inputs.
 */
import { fmt, formatSI } from "./format";
import { fieldAt, forceOnTest, norm, potentialAt, potentialEnergy, uniformState } from "./electrostatics";
import {
  conductorForce, currentDirectionWord, loopAxial, loopCentre, longSolenoidOk, lorentzForce, motionSummary, norm3, solenoidAxial, solenoidIdeal, wireFieldAt, circulation, dot3,
} from "./magnetism";
import {
  emfAtTime, flux, fluxLinkage, generatorPeakEmf, generatorRmsEmf, lenz, motionalEmf, rlKind, rlTau, rlState, currentAtTime,
} from "./induction";
import {
  EFIELD_ENGINE_VERSION, INDUCTION_ENGINE_VERSION, MAGNETIC_ENGINE_VERSION,
  type EfieldInputs, type InductionInputs, type MagneticInputs,
} from "../persistence/physicsTools24";
import type { PhysicsResults } from "../persistence/physicsTools";

export const EFIELD_ASSUMPTIONS = [
  "Static ideal point charges in vacuum (Coulomb's law with k = 1/4πε₀). The field and potential at a point are the exact sum over the sources; a point exactly on a charge is singular and is refused, and the diagram leaves a small disc around every charge unsampled.",
  "A test charge is assumed too small to disturb the sources: F = qE and U = qV use the field of the sources alone. The plane is a two-dimensional slice of three-dimensional Coulomb fields (1/r², not the 1/r of a line charge).",
  "Field lines and equipotential contours are drawn from the same E and V functions as the readouts. Field lines show direction, not particle paths; contours are traced on a grid and are accurate to about one grid cell.",
  "Uniform-field motion is non-relativistic (speed below 10 % of the speed of light) with constant a = qE/m and no gravity, radiation or collisions.",
];
export const MAGNETIC_ASSUMPTIONS = [
  "Steady currents in vacuum with μ₀ = 1.25663706212×10⁻⁶ N A⁻². Coordinates are right-handed: x to the right, y up, positive z out of the screen; a dot means out of the screen and a cross means into it.",
  "A wire is an infinitely long, infinitely thin filament along z; its field is exact at every point except on the wire itself (refused). The loop field is exact on the axis only, and the solenoid field shown is the exact on-axis finite-solenoid value beside the ideal long-solenoid μ₀nI.",
  "The Lorentz force F = q(E + v × B) is exact for the given fields. Magnetic force alone is perpendicular to v and does no work; with an electric field present the speed is not constant and the E × B drift is included.",
  "Particle motion is non-relativistic (speed below 10 % of the speed of light), in a uniform field with no radiation, no collisions and no gravity. Helical motion needs a velocity component along B.",
  "The force on a straight conductor F = I L × B assumes a straight segment in a uniform field.",
];
export const INDUCTION_ASSUMPTIONS = [
  "Sign convention: positive EMF and positive current circulate counter-clockwise as seen from the side the loop's area normal n̂ points toward; the flux Φ = B A cos θ is signed with θ the angle between n̂ and B.",
  "Faraday's law ε = −N dΦ/dt is evaluated analytically for B(t), A(t) and θ(t) that change linearly in time; a closed circuit carries i = ε/R, with no self-inductance of the loop, and an open loop has an EMF but no current.",
  "Motional EMF ε = (v × B)·L for a straight rod in a uniform field; the rails model (a closed rectangle) is used only when the rod moves perpendicular to its length.",
  "The generator is a single rigid coil turning at constant ω in a uniform field; the EMF is the open-circuit value, with no load, internal resistance or losses.",
  "The RL circuit has one ideal inductor in series with one resistor and an ideal DC source switched at t = 0; v_L = +L di/dt (passive sign convention).",
];

export function summarizeEfield(i: EfieldInputs): PhysicsResults | null {
  const base = { engineVersion: EFIELD_ENGINE_VERSION, assumptions: EFIELD_ASSUMPTIONS };
  if (i.view === "particle") {
    const end = uniformState(i.particle, i.particle.duration);
    const a = Math.hypot(end.ax, end.ay);
    return { ...base, headline: [`Acceleration a = qE/m = ${formatSI(a, "m/s²")}, constant`, `Speed ${formatSI(Math.hypot(i.particle.vx0, i.particle.vy0), "m/s")} → ${formatSI(end.speed, "m/s")} over ${formatSI(i.particle.duration, "s")}`, `Kinetic energy gained ${formatSI(end.ke - 0.5 * i.particle.m * (i.particle.vx0 ** 2 + i.particle.vy0 ** 2), "J")}`], check: end.speed, checkLabel: "final speed (m/s)" };
  }
  const f = fieldAt(i.charges, i.probe), v = potentialAt(i.charges, i.probe);
  if (!f.ok || !v.ok) return null;
  if (i.view === "potential") {
    return { ...base, headline: [`Electric potential at the probe V = ${formatSI(v.V, "V")}`, `Potential energy of the test charge U = qV = ${formatSI(potentialEnergy(i.qTest, v.V), "J")}`, `Field there ${formatSI(f.magnitude, "N/C")} (E = −∇V)`], check: v.V, checkLabel: "potential at the probe (V)" };
  }
  const F = forceOnTest(f.E, i.qTest);
  return { ...base, headline: [`Field at the probe E = ${formatSI(f.magnitude, "N/C")} at ${fmt(f.angleDeg)}° from +x`, `Force on the test charge ${formatSI(norm(F), "N")} ${i.qTest > 0 ? "along E" : "against E"}`, `${i.charges.length} source charge${i.charges.length === 1 ? "" : "s"} added as vectors`], check: f.magnitude, checkLabel: "field at the probe (N/C)" };
}

export function summarizeMagnetic(i: MagneticInputs): PhysicsResults | null {
  const base = { engineVersion: MAGNETIC_ENGINE_VERSION, assumptions: MAGNETIC_ASSUMPTIONS };
  if (i.scenario === "wire") {
    const f = wireFieldAt(i.wires, i.probe.x, i.probe.y);
    if (!f.ok) return null;
    return { ...base, headline: [`Field at the probe B = ${formatSI(f.magnitude, "T")}, in the plane of the screen`, `${i.wires.length} wire${i.wires.length === 1 ? "" : "s"}: ${i.wires.map((w) => `${fmt(Math.abs(w.I))} A ${currentDirectionWord(w.I)} (field ${circulation(w.I)})`).join("; ")}`], check: f.magnitude, checkLabel: "field at the probe (T)" };
  }
  if (i.scenario === "loop") {
    const B = loopAxial(i.loop, i.axisX);
    return { ...base, headline: [`Field at the centre ${formatSI(loopCentre(i.loop), "T")}`, `Field on the axis at x = ${fmt(i.axisX)} m: ${formatSI(B, "T")} ${B * i.loop.I >= 0 ? "along +x" : "along −x"}`], check: B, checkLabel: "axial field (T)" };
  }
  if (i.scenario === "solenoid") {
    const B = solenoidIdeal(i.solenoid);
    return { ...base, headline: [`Ideal interior field μ₀nI = ${formatSI(B, "T")}`, `Exact on-axis field at x = ${fmt(i.axisX)} m: ${formatSI(solenoidAxial(i.solenoid, i.axisX), "T")}`, longSolenoidOk(i.solenoid) ? "Long solenoid: the ideal value is reliable well inside" : "Short solenoid: the ideal value overestimates the field"], check: B, checkLabel: "ideal interior field (T)" };
  }
  if (i.scenario === "lorentz") {
    const l = i.lorentz;
    const F = lorentzForce(l.q, l.v, l.B, l.E);
    return { ...base, headline: [`Force on the charge ${formatSI(norm3(F), "N")}`, `F = (${fmt(F.x)}, ${fmt(F.y)}, ${fmt(F.z)}) N`, `Magnetic force does work at rate ${formatSI(dot3(lorentzForce(l.q, l.v, l.B), l.v), "W")}`], check: norm3(F), checkLabel: "force magnitude (N)" };
  }
  if (i.scenario === "motion") {
    const s = motionSummary(i.motion);
    return { ...base, headline: [`Cyclotron period ${formatSI(s.period, "s")} (independent of speed)`, `Orbit radius ${formatSI(s.radius, "m")}, turning ${s.sense}`, `Pitch along the field ${formatSI(Math.abs(s.pitch), "m")}`], check: s.period, checkLabel: "cyclotron period (s)" };
  }
  const F = conductorForce(i.conductor.I, i.conductor.L, i.conductor.B);
  return { ...base, headline: [`Force on the conductor ${formatSI(norm3(F), "N")}`, `F = I L × B = (${fmt(F.x)}, ${fmt(F.y)}, ${fmt(F.z)}) N`], check: norm3(F), checkLabel: "force magnitude (N)" };
}

export function summarizeInduction(i: InductionInputs): PhysicsResults | null {
  const base = { engineVersion: INDUCTION_ENGINE_VERSION, assumptions: INDUCTION_ASSUMPTIONS };
  if (i.scenario === "flux") {
    const f = flux(i.flux.B, i.flux.A, i.flux.thetaDeg);
    return { ...base, headline: [`Flux through one turn Φ = BA cos θ = ${formatSI(f, "Wb")}`, `Flux linkage NΦ = ${formatSI(fluxLinkage(i.flux), "Wb")}`], check: f, checkLabel: "flux per turn (Wb)" };
  }
  if (i.scenario === "faraday") {
    const e = emfAtTime(i.faraday, 0), l = lenz(i.faraday, 0);
    return { ...base, headline: [`EMF at t = 0: ${formatSI(e, "V")}`, `Closed-loop current ${formatSI(currentAtTime(i.faraday, 0), "A")}${i.faraday.closed ? "" : " (open loop: none)"}`, l.change === "constant" ? "Flux constant: no EMF" : `Flux ${l.change}: induced current ${l.sense}`], check: e, checkLabel: "EMF at t = 0 (V)" };
  }
  if (i.scenario === "motional") {
    const m = motionalEmf(i.motional);
    return { ...base, headline: [`EMF ${formatSI(m.emf, "V")} (${m.positiveEnd === "neither" ? "no net EMF" : `${m.positiveEnd} end positive`})`, m.rails ? `Rails current ${formatSI(m.rails.current, "A")}, braking force ${formatSI(m.rails.force, "N")}` : "Not a perpendicular rails case"], check: m.emf, checkLabel: "motional EMF (V)" };
  }
  if (i.scenario === "generator") {
    return { ...base, headline: [`Peak EMF ${formatSI(generatorPeakEmf(i.generator), "V")}, RMS ${formatSI(generatorRmsEmf(i.generator), "V")}`, `EMF is largest when the flux is zero`], check: generatorPeakEmf(i.generator), checkLabel: "peak EMF (V)" };
  }
  const tau = rlTau(i.rl), end = rlState(i.rl, i.rl.spanTau * tau);
  return { ...base, headline: [`Time constant τ = L/R = ${formatSI(tau, "s")} (${rlKind(i.rl)})`, `Final current ${formatSI(i.rl.Vs / i.rl.R, "A")}; stored energy ½Li² reaches ${formatSI(end.energy, "J")}`], check: tau, checkLabel: "time constant (s)" };
}
