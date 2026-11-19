/**
 * Explanations, predict-then-observe scenarios and design challenges for the Electric fields, Magnetic fields and Electromagnetic
 * induction laboratories. Every number quoted comes from the same engine the page draws; challenge checks are pure functions of the
 * saved inputs, so they can be tested without the interface.
 */
import type { PredictScenario } from "../generalChem/predict";
import { fmt, formatSI } from "./format";
import type { Lesson } from "./physicsLearning";
import type { Challenge } from "./waveOpticsLearning";
import { fieldAt, norm, potentialAt, uniformState } from "./electrostatics";
import {
  circulation, conductorForce, currentDirectionWord, dot3, loopAxial, loopCentre, lorentzForce, motionSummary, norm3, solenoidIdeal, wireFieldAt, magneticForce,
} from "./magnetism";
import {
  emfAtTime, flux, generatorPeakEmf, lenz, motionalEmf, rlState, rlTau,
} from "./induction";
import {
  validateEfieldInputs, validateInductionInputs, validateMagneticInputs, type EfieldInputs, type InductionInputs, type MagneticInputs,
} from "../persistence/physicsTools24";

// ================================================================================================================================
// Electric fields and potential
// ================================================================================================================================

type Ei = EfieldInputs;
const efieldAfter = (i: Ei, patch: Partial<Ei>): Ei | null => validateEfieldInputs({ ...i, ...patch });
const probeField = (i: Ei) => { const f = fieldAt(i.charges, i.probe); return f.ok ? f : null; };
const probeV = (i: Ei) => { const v = potentialAt(i.charges, i.probe); return v.ok ? v.V : NaN; };

export function efieldLessons(i: Ei): Lesson[] {
  const f = probeField(i);
  const V = probeV(i);
  const out: Lesson[] = [];
  if (f) {
    const per = i.charges.map((c) => { const x = fieldAt([c], i.probe); return x.ok ? `${c.id}: ${formatSI(x.magnitude, "N/C")}` : `${c.id}: —`; }).join(", ");
    out.push({
      id: "superposition", title: "Why are the fields of several charges added as vectors?",
      body: [
        `Each charge makes its own field, E = kq/r² pointing away from a positive charge and toward a negative one, and the fields simply add as vectors: at the probe the separate magnitudes are ${per}, and the vector sum is ${formatSI(f.magnitude, "N/C")} at ${fmt(f.angleDeg)}° from +x.`,
        "Magnitudes alone cannot be added, because the contributions point in different directions: two equal fields that point oppositely cancel completely.",
      ],
    });
    const F = norm({ x: f.E.x * i.qTest, y: f.E.y * i.qTest });
    out.push({
      id: "force-on-test", title: "How does the force on a test charge follow from the field?",
      body: [
        `The field is the force per unit charge, so F = qE. A test charge of ${formatSI(i.qTest, "C")} here feels ${formatSI(F, "N")}, ${i.qTest > 0 ? "along E (a positive charge is pushed the way the field points)" : "opposite to E (a negative charge is pushed against the field)"}.`,
        "The test charge is assumed too small to move the sources, so the field itself does not depend on it. Doubling q doubles the force and leaves E unchanged.",
      ],
    });
  }
  if (Number.isFinite(V)) {
    out.push({
      id: "potential-scalar", title: "Why is the potential simply added, and what is an equipotential?",
      body: [
        `Potential is a scalar: V = Σ kq/r, with no directions to worry about. Here V = ${formatSI(V, "V")}, so the test charge has potential energy U = qV = ${formatSI(i.qTest * V, "J")}.`,
        "An equipotential is a curve of constant V. Moving a charge along it changes no potential energy, so the field does no work along it: the field must be perpendicular to the equipotential everywhere, and it points toward lower V.",
        "The contours bunch together where the potential changes quickly, which is where the field is strong: |E| = −dV/ds along the steepest direction.",
      ],
    });
  }
  const u = i.particle, end = uniformState(u, u.duration);
  out.push({
    id: "uniform-motion", title: "Why does a charge in a uniform field follow a parabola?",
    body: [
      `The force qE is constant, so the acceleration a = qE/m = ${formatSI(Math.hypot(end.ax, end.ay), "m/s²")} is constant, like projectile motion with the field in place of gravity. The path is a parabola unless the initial velocity is along the field.`,
      `Starting at ${formatSI(Math.hypot(u.vx0, u.vy0), "m/s")}, the particle reaches ${formatSI(end.speed, "m/s")} after ${formatSI(u.duration, "s")}: the work done by the field, qEΔs along its motion, equals the change in kinetic energy.`,
      "Reversing the sign of the charge reverses the acceleration; the mass sets how big it is (an electron accelerates about 1800 times more than a proton in the same field).",
    ],
  });
  return out;
}

const scaleCharges = (i: Ei, k: number): Ei | null => efieldAfter(i, { charges: i.charges.map((c) => ({ ...c, q: c.q * k })) });
export function efieldScenarios(i: Ei): Array<PredictScenario<Ei>> {
  const list: Array<PredictScenario<Ei>> = [];
  if (i.view === "particle") {
    const kin = (x: Ei) => uniformState(x.particle, x.particle.duration).ke;
    list.push(
      {
        id: "double-field", change: "double the electric field", quantity: "the particle's acceleration",
        apply: (x) => efieldAfter(x, { particle: { ...x.particle, Ex: x.particle.Ex * 2, Ey: x.particle.Ey * 2 } }), measure: (x) => Math.hypot(uniformState(x.particle, 0).ax, uniformState(x.particle, 0).ay), format: (v) => formatSI(v, "m/s²"),
        explain: (b, a) => `a = qE/m is proportional to E: ${formatSI(b, "m/s²")} → ${formatSI(a, "m/s²")}.`,
      },
      {
        id: "double-mass", change: "double the particle's mass", quantity: "the particle's acceleration",
        apply: (x) => efieldAfter(x, { particle: { ...x.particle, m: x.particle.m * 2 } }), measure: (x) => Math.hypot(uniformState(x.particle, 0).ax, uniformState(x.particle, 0).ay), format: (v) => formatSI(v, "m/s²"),
        explain: (b, a) => `The force qE is unchanged but a = F/m halves: ${formatSI(b, "m/s²")} → ${formatSI(a, "m/s²")}.`,
      },
      {
        id: "reverse-charge", change: "reverse the sign of the particle's charge", quantity: "the size of the particle's acceleration",
        apply: (x) => efieldAfter(x, { particle: { ...x.particle, q: -x.particle.q } }), measure: (x) => Math.hypot(uniformState(x.particle, 0).ax, uniformState(x.particle, 0).ay), format: (v) => formatSI(v, "m/s²"),
        explain: (b, a) => `The size of the force is |q|E, so only its direction reverses: ${formatSI(b, "m/s²")} → ${formatSI(a, "m/s²")}.`,
      },
      {
        id: "double-duration", change: "let the field act for twice as long", quantity: "the kinetic energy at the end",
        apply: (x) => efieldAfter(x, { particle: { ...x.particle, duration: x.particle.duration * 2 } }), measure: kin, format: (v) => formatSI(v, "J"),
        explain: (b, a, t) => `${t === "higher" ? "The field keeps speeding the particle up" : t === "lower" ? "The field slows the particle" : "No change"}: ${formatSI(b, "J")} → ${formatSI(a, "J")}.`,
      },
    );
    return list.filter((s) => { const after = s.apply(i); return after !== null && Number.isFinite(s.measure(i)) && Number.isFinite(s.measure(after)); });
  }
  const mag = (x: Ei) => probeField(x)?.magnitude ?? NaN;
  list.push(
    {
      id: "double-sources", change: "double every source charge", quantity: "the field strength at the probe",
      apply: (x) => scaleCharges(x, 2), measure: mag, format: (v) => formatSI(v, "N/C"),
      explain: (b, a) => `The field is linear in the sources (superposition), so doubling all of them doubles E: ${formatSI(b, "N/C")} → ${formatSI(a, "N/C")}.`,
    },
    {
      id: "flip-signs", change: "reverse the sign of every source charge", quantity: "the field strength (magnitude) at the probe",
      apply: (x) => scaleCharges(x, -1), measure: mag, format: (v) => formatSI(v, "N/C"),
      explain: (b, a) => `The direction of E reverses but its size does not: ${formatSI(b, "N/C")} → ${formatSI(a, "N/C")}.`,
    },
    {
      id: "double-qtest", change: "double the test charge", quantity: "the force on the test charge",
      apply: (x) => efieldAfter(x, { qTest: x.qTest * 2 }), measure: (x) => Math.abs(x.qTest) * mag(x), format: (v) => formatSI(v, "N"),
      explain: (b, a) => `F = qE: the force doubles (${formatSI(b, "N")} → ${formatSI(a, "N")}) while the field at the probe stays the same.`,
    },
    {
      id: "flip-for-potential", change: "reverse the sign of every source charge", quantity: "the potential at the probe",
      apply: (x) => scaleCharges(x, -1), measure: probeV, format: (v) => formatSI(v, "V"),
      explain: (b, a) => `Potential is the sum of kq/r, so every term changes sign: ${formatSI(b, "V")} → ${formatSI(a, "V")}.`,
    },
  );
  return list.filter((s) => { const after = s.apply(i); return after !== null && Number.isFinite(s.measure(i)) && Number.isFinite(s.measure(after)); });
}

export const EFIELD_CHALLENGES: Array<Challenge<Ei>> = [
  {
    id: "ef-null", title: "Find a point of zero field", view: "field",
    prompt: "With at least two charges, place the probe where their fields cancel: the net field must be below 5 % of the strongest single charge's contribution there.",
    check: (i) => {
      const f = probeField(i);
      const parts = i.charges.map((c) => fieldAt([c], i.probe)).filter((x) => x.ok).map((x) => (x.ok ? x.magnitude : 0));
      const biggest = parts.length ? Math.max(...parts) : 0;
      const met = i.charges.length >= 2 && f !== null && biggest > 0 && f.magnitude < 0.05 * biggest;
      return { met, status: !f ? "The probe sits on a charge." : `${i.charges.length} charges: |E| = ${formatSI(f.magnitude, "N/C")}, the strongest single contribution is ${formatSI(biggest, "N/C")}${biggest > 0 ? ` (net = ${fmt((100 * f.magnitude) / biggest)} %)` : ""}` };
    },
    hint: "For two equal like charges, the fields cancel halfway between them.",
    solution: "Choose \"Two equal positive charges\" and move the probe to (0, 0): the two fields have equal size and opposite direction there, so E = 0.",
  },
  {
    id: "ef-potential-40", title: "A potential of +40 V", view: "potential",
    prompt: "With a single source charge, place the probe where the potential is +40 V (± 2 V).",
    check: (i) => { const V = probeV(i); const met = i.charges.length === 1 && Math.abs(V - 40) <= 2; return { met, status: i.charges.length !== 1 ? "Use exactly one source charge." : `V = ${formatSI(V, "V")} at the probe` }; },
    hint: "V = kq/r, so r = kq/V.",
    solution: `For q = +2 nC: r = kq/V = (8.99×10⁹)(2×10⁻⁹)/40 = 0.45 m, so put the probe 0.45 m from the charge.`,
  },
  {
    id: "ef-turn-around", title: "Turn the proton around", view: "particle",
    prompt: "A proton starts moving in +x. Choose the field so that at the end of the run it is moving in −x at 50 km/s or more.",
    check: (i) => { const p = i.particle; const end = uniformState(p, p.duration); const met = p.vx0 > 0 && p.q > 0 && end.vx <= -5e4; return { met, status: `final vx = ${formatSI(end.vx, "m/s")} (start ${formatSI(p.vx0, "m/s")})` }; },
    hint: "A positive charge accelerates along E, so E must point in −x and be strong enough to reverse vx within the run.",
    solution: "Set Ex = −8000 V/m: a = qE/m ≈ −7.7×10¹¹ m/s², so vx = 1×10⁵ − 7.7×10¹¹ × 4×10⁻⁷ ≈ −2.1×10⁵ m/s.",
  },
];

// ================================================================================================================================
// Magnetic fields and forces
// ================================================================================================================================

type Mi = MagneticInputs;
const magAfter = (i: Mi, patch: Partial<Mi>): Mi | null => validateMagneticInputs({ ...i, ...patch });

export function magneticLessons(i: Mi): Lesson[] {
  const out: Lesson[] = [];
  const wf = wireFieldAt(i.wires, i.probe.x, i.probe.y);
  out.push({
    id: "wire-rhr", title: "How does the right-hand rule give the field of a wire?",
    body: [
      `Point the right thumb along the current and the fingers curl the way the field circulates. ${i.wires.map((w) => `Wire ${w.id} carries ${fmt(Math.abs(w.I))} A ${currentDirectionWord(w.I)}, so its field circulates ${circulation(w.I)} as seen on the screen`).join("; ")}.`,
      wf.ok ? `The field of one long wire is B = μ₀I/(2πr), so it falls as 1/r. At the probe the total from all wires is ${formatSI(wf.magnitude, "T")}, always in the plane of the screen (never along z).` : "The probe sits on a wire, where the ideal filament model is singular.",
      "The field lines are closed circles around the current: they never begin or end. The dot ⊙ marks a current or field out of the screen and the cross ⊗ one going into it.",
    ],
  });
  const l = i.lorentz;
  const Fm = magneticForce(l.q, l.v, l.B);
  out.push({
    id: "lorentz", title: "Why is the magnetic force perpendicular to the velocity?",
    body: [
      `The magnetic force is F = q v × B. A cross product is perpendicular to both of its factors, so F is perpendicular to v and to B. Here F = (${fmt(Fm.x)}, ${fmt(Fm.y)}, ${fmt(Fm.z)}) N, magnitude ${formatSI(norm3(Fm), "N")}.`,
      `Because F ⊥ v, the power F·v is ${fmt(dot3(Fm, l.v))} W: the magnetic force never does work. It changes the direction of the velocity but not the speed.`,
      `For q > 0 point the fingers along v, curl them toward B and the thumb gives F. This charge is ${l.q > 0 ? "positive" : "negative"}${l.q > 0 ? "" : ", so the force is the reverse of the positive-charge result"}.`,
    ],
  });
  const m = i.motion, s = motionSummary(m);
  out.push({
    id: "orbit", title: "Why does a charge move in a circle or a helix?",
    body: [
      `The force is always perpendicular to v and so provides a centripetal force: m v²/r = |q| v B gives r = m v/(|q|B) = ${formatSI(s.radius, "m")} here.`,
      `The period T = 2πm/(|q|B) = ${formatSI(s.period, "s")} does not depend on the speed: faster particles travel a bigger circle in the same time. Seen from the screen this charge turns ${s.sense}.`,
      m.vz !== 0 ? `The velocity component along B, v∥ = ${formatSI(m.vz, "m/s")}, is unchanged by the field, so the path is a helix with pitch ${formatSI(Math.abs(s.pitch), "m")}.` : "With no velocity component along B the path is a flat circle; add one to get a helix.",
    ],
  });
  const lp = i.loop, sol = i.solenoid;
  out.push({
    id: "loop-solenoid", title: "How do loops and solenoids make fields?",
    body: [
      `A circular loop of ${lp.N} turn${lp.N === 1 ? "" : "s"} carrying ${fmt(lp.I)} A has a centre field B = μ₀NI/2a = ${formatSI(loopCentre(lp), "T")}; along the axis it falls as B(x) = μ₀NIa²/(2(a²+x²)^{3/2}). Curl the right fingers with the current and the thumb gives the field direction inside.`,
      `A long solenoid with n = ${fmt(sol.n)} turns/m and ${fmt(sol.I)} A has a nearly uniform interior field B = μ₀nI = ${formatSI(solenoidIdeal(sol), "T")}, independent of its radius and of the position inside. Near an end it falls to about half of that value.`,
    ],
  });
  const c = i.conductor, F = conductorForce(c.I, c.L, c.B);
  out.push({
    id: "conductor", title: "What force does a magnetic field exert on a wire?",
    body: [
      `A current is moving charge, so a segment feels F = I L × B, with L along the current. Here F = ${formatSI(norm3(F), "N")}, directed (${fmt(F.x)}, ${fmt(F.y)}, ${fmt(F.z)}) N.`,
      "The force is greatest when the wire is perpendicular to B and zero when it is parallel to B.",
    ],
  });
  return out;
}

export function magneticScenarios(i: Mi): Array<PredictScenario<Mi>> {
  const list: Array<PredictScenario<Mi>> = [];
  if (i.scenario === "wire") {
    const mag = (x: Mi) => { const f = wireFieldAt(x.wires, x.probe.x, x.probe.y); return f.ok ? f.magnitude : NaN; };
    list.push(
      {
        id: "double-I", change: "double the current in every wire", quantity: "the field at the probe",
        apply: (x) => magAfter(x, { wires: x.wires.map((w) => ({ ...w, I: w.I * 2 })) }), measure: mag, format: (v) => formatSI(v, "T"),
        explain: (b, a) => `B is proportional to I: ${formatSI(b, "T")} → ${formatSI(a, "T")}.`,
      },
      {
        id: "reverse-I", change: "reverse the current in every wire", quantity: "the size of the field at the probe",
        apply: (x) => magAfter(x, { wires: x.wires.map((w) => ({ ...w, I: -w.I })) }), measure: mag, format: (v) => formatSI(v, "T"),
        explain: (b, a) => `Only the circulation direction reverses; the size is the same: ${formatSI(b, "T")} → ${formatSI(a, "T")}.`,
      },
    );
    if (i.wires.length === 1) {
      const w = i.wires[0];
      list.push({
        id: "double-r", change: "move the probe twice as far from the wire", quantity: "the field at the probe",
        apply: (x) => { const ww = x.wires[0]; const dx = x.probe.x - ww.x, dy = x.probe.y - ww.y; return magAfter(x, { probe: { x: ww.x + 2 * dx, y: ww.y + 2 * dy } }); }, measure: mag, format: (v) => formatSI(v, "T"),
        explain: (b, a) => `B ∝ 1/r, so doubling the distance halves the field: ${formatSI(b, "T")} → ${formatSI(a, "T")}.`,
      });
      void w;
    }
  } else if (i.scenario === "loop") {
    list.push(
      {
        id: "double-a", change: "double the loop radius", quantity: "the field at the centre",
        apply: (x) => magAfter(x, { loop: { ...x.loop, a: x.loop.a * 2 } }), measure: (x) => loopCentre(x.loop), format: (v) => formatSI(v, "T"),
        explain: (b, a) => `B = μ₀NI/2a falls as 1/a: ${formatSI(b, "T")} → ${formatSI(a, "T")}.`,
      },
      {
        id: "double-N", change: "double the number of turns", quantity: "the field at the centre",
        apply: (x) => magAfter(x, { loop: { ...x.loop, N: x.loop.N * 2 } }), measure: (x) => loopCentre(x.loop), format: (v) => formatSI(v, "T"),
        explain: (b, a) => `Each turn adds the same field, so B ∝ N: ${formatSI(b, "T")} → ${formatSI(a, "T")}.`,
      },
      {
        id: "axis-away", change: "move the field point to twice the distance along the axis", quantity: "the axial field",
        apply: (x) => magAfter(x, { axisX: Math.max(-1, Math.min(1, x.axisX === 0 ? x.loop.a : x.axisX * 2)) }), measure: (x) => Math.abs(loopAxial(x.loop, x.axisX)), format: (v) => formatSI(v, "T"),
        explain: (b, a) => `The on-axis field decreases away from the loop: ${formatSI(b, "T")} → ${formatSI(a, "T")}.`,
      },
    );
  } else if (i.scenario === "solenoid") {
    list.push(
      {
        id: "double-length", change: "double the solenoid length (same turns per metre and current)", quantity: "the ideal interior field",
        apply: (x) => magAfter(x, { solenoid: { ...x.solenoid, L: Math.min(10, x.solenoid.L * 2) } }), measure: (x) => solenoidIdeal(x.solenoid), format: (v) => formatSI(v, "T"),
        explain: (b, a) => `B = μ₀nI does not depend on the length: ${formatSI(b, "T")} → ${formatSI(a, "T")}.`,
      },
      {
        id: "double-n", change: "double the turns per metre", quantity: "the ideal interior field",
        apply: (x) => magAfter(x, { solenoid: { ...x.solenoid, n: x.solenoid.n * 2 } }), measure: (x) => solenoidIdeal(x.solenoid), format: (v) => formatSI(v, "T"),
        explain: (b, a) => `B ∝ n: ${formatSI(b, "T")} → ${formatSI(a, "T")}.`,
      },
    );
  } else if (i.scenario === "lorentz") {
    const mag = (x: Mi) => norm3(lorentzForce(x.lorentz.q, x.lorentz.v, x.lorentz.B, x.lorentz.E));
    list.push(
      {
        id: "double-v", change: "double the speed", quantity: "the force on the charge",
        apply: (x) => magAfter(x, { lorentz: { ...x.lorentz, v: { x: x.lorentz.v.x * 2, y: x.lorentz.v.y * 2, z: x.lorentz.v.z * 2 } } }), measure: mag, format: (v) => formatSI(v, "N"),
        explain: (b, a) => `With E = 0 the force is q v B sin θ, proportional to v: ${formatSI(b, "N")} → ${formatSI(a, "N")}.`,
      },
      {
        id: "flip-q", change: "reverse the sign of the charge", quantity: "the size of the force",
        apply: (x) => magAfter(x, { lorentz: { ...x.lorentz, q: -x.lorentz.q } }), measure: mag, format: (v) => formatSI(v, "N"),
        explain: (b, a) => `The force reverses direction but not size: ${formatSI(b, "N")} → ${formatSI(a, "N")}.`,
      },
      {
        id: "parallel-v", change: "turn the velocity to point along B", quantity: "the magnetic force",
        apply: (x) => { const Bn = norm3(x.lorentz.B); const s = norm3(x.lorentz.v); if (Bn === 0) return null; const k = s / Bn; return magAfter(x, { lorentz: { ...x.lorentz, v: { x: x.lorentz.B.x * k, y: x.lorentz.B.y * k, z: x.lorentz.B.z * k }, E: { x: 0, y: 0, z: 0 } } }); },
        measure: mag, format: (v) => formatSI(v, "N"), absTol: 1e-30,
        explain: (b, a) => `v × B = 0 when v ∥ B, so there is no magnetic force: ${formatSI(b, "N")} → ${formatSI(a, "N")}.`,
      },
    );
  } else if (i.scenario === "motion") {
    list.push(
      {
        id: "double-speed", change: "double the particle's speed", quantity: "the orbit radius",
        apply: (x) => magAfter(x, { motion: { ...x.motion, vx: x.motion.vx * 2, vy: x.motion.vy * 2, vz: x.motion.vz * 2 } }), measure: (x) => motionSummary(x.motion).radius, format: (v) => formatSI(v, "m"),
        explain: (b, a) => `r = mv/(|q|B) is proportional to v: ${formatSI(b, "m")} → ${formatSI(a, "m")}.`,
      },
      {
        id: "double-speed-period", change: "double the particle's speed", quantity: "the time for one orbit",
        apply: (x) => magAfter(x, { motion: { ...x.motion, vx: x.motion.vx * 2, vy: x.motion.vy * 2, vz: x.motion.vz * 2 } }), measure: (x) => motionSummary(x.motion).period, format: (v) => formatSI(v, "s"),
        explain: (b, a) => `T = 2πm/(|q|B) does not contain the speed: ${formatSI(b, "s")} → ${formatSI(a, "s")}.`,
      },
      {
        id: "double-B", change: "double the magnetic field", quantity: "the orbit radius",
        apply: (x) => magAfter(x, { motion: { ...x.motion, Bz: x.motion.Bz * 2 } }), measure: (x) => motionSummary(x.motion).radius, format: (v) => formatSI(v, "m"),
        explain: (b, a) => `r ∝ 1/B: ${formatSI(b, "m")} → ${formatSI(a, "m")}.`,
      },
    );
  } else {
    const mag = (x: Mi) => norm3(conductorForce(x.conductor.I, x.conductor.L, x.conductor.B));
    list.push(
      {
        id: "double-L", change: "double the length of the conductor in the field", quantity: "the force",
        apply: (x) => magAfter(x, { conductor: { ...x.conductor, L: { x: x.conductor.L.x * 2, y: x.conductor.L.y * 2, z: x.conductor.L.z * 2 } } }), measure: mag, format: (v) => formatSI(v, "N"),
        explain: (b, a) => `F = I L B sin θ is proportional to L: ${formatSI(b, "N")} → ${formatSI(a, "N")}.`,
      },
      {
        id: "flip-I", change: "reverse the current", quantity: "the size of the force",
        apply: (x) => magAfter(x, { conductor: { ...x.conductor, I: -x.conductor.I } }), measure: mag, format: (v) => formatSI(v, "N"),
        explain: (b, a) => `The force reverses direction; its size is unchanged: ${formatSI(b, "N")} → ${formatSI(a, "N")}.`,
      },
    );
  }
  return list.filter((s) => { const after = s.apply(i); return after !== null && Number.isFinite(s.measure(i)) && Number.isFinite(s.measure(after)); });
}

const wireB = (i: Mi) => { const f = wireFieldAt(i.wires, i.probe.x, i.probe.y); return f.ok ? f.magnitude : NaN; };
export const MAGNETIC_CHALLENGES: Array<Challenge<Mi>> = [
  {
    id: "mag-wire-half-mT", title: "A field of 0.50 mT from one wire", view: "wire",
    prompt: "With exactly one wire, make the field at the probe 0.50 mT (± 0.02 mT).",
    check: (i) => { const B = wireB(i); const met = i.wires.length === 1 && Math.abs(B - 5e-4) <= 2e-5; return { met, status: i.wires.length !== 1 ? "Use exactly one wire." : `B = ${formatSI(B, "T")} at the probe` }; },
    hint: "B = μ₀I/(2πr), so I = 2πrB/μ₀.",
    solution: `At r = 0.2 m, I = 2π(0.2)(5×10⁻⁴)/(1.2566×10⁻⁶) ≈ 500 A.`,
  },
  {
    id: "mag-solenoid-5mT", title: "A 5 mT solenoid", view: "solenoid",
    prompt: "Make the ideal interior field of the solenoid 5.0 mT (± 0.2 mT).",
    check: (i) => { const B = solenoidIdeal(i.solenoid); return { met: Math.abs(B - 5e-3) <= 2e-4, status: `μ₀nI = ${formatSI(B, "T")}` }; },
    hint: "B = μ₀nI: raise n or I.",
    solution: "n = 2000 turns/m with I = 2.0 A gives μ₀nI = 5.03 mT.",
  },
  {
    id: "mag-orbit-5mm", title: "An orbit 5 mm in radius", view: "motion",
    prompt: "With no electric field, make the particle's circular orbit 5.0 mm in radius (± 0.25 mm).",
    check: (i) => { const m = i.motion; const r = motionSummary(m).radius; const met = m.Ex === 0 && m.Ey === 0 && Math.abs(r - 5e-3) <= 2.5e-4; return { met, status: m.Ex !== 0 || m.Ey !== 0 ? "Set the electric field to zero first." : `radius = ${formatSI(r, "m")}` }; },
    hint: "r = mv⊥/(|q|B): lower B or raise the speed to enlarge the orbit.",
    solution: "For the default proton at 1×10⁵ m/s, B = mv/(|q|r) = (1.67×10⁻²⁷)(10⁵)/((1.6×10⁻¹⁹)(0.005)) ≈ 0.21 T.",
  },
  {
    id: "mag-conductor-up", title: "Push the conductor up", view: "conductor",
    prompt: "The conductor lies along +x in a field along +z. Make the magnetic force on it point toward +y with a size of at least 0.50 N.",
    check: (i) => { const F = conductorForce(i.conductor.I, i.conductor.L, i.conductor.B); const met = F.y > 0 && Math.abs(F.x) < 1e-9 * (1 + Math.abs(F.y)) && norm3(F) >= 0.5; return { met, status: `F = (${fmt(F.x)}, ${fmt(F.y)}, ${fmt(F.z)}) N` }; },
    hint: "F = I L × B and x̂ × ẑ = −ŷ, so a positive current pushes the wire toward −y.",
    solution: "Reverse the current: I = −10 A gives F = (−10)(0.2)(0.3)(x̂ × ẑ) = +0.60 ŷ N.",
  },
];

// ================================================================================================================================
// Electromagnetic induction
// ================================================================================================================================

type Ii = InductionInputs;
const indAfter = (i: Ii, patch: Partial<Ii>): Ii | null => validateInductionInputs({ ...i, ...patch });

export function inductionLessons(i: Ii): Lesson[] {
  const out: Lesson[] = [];
  const f = i.flux;
  out.push({
    id: "flux", title: "What is magnetic flux, and why can it be negative?",
    body: [
      `Flux counts the field lines through a loop: Φ = B A cos θ, where θ is the angle between the loop's area normal n̂ and B. For B = ${fmt(f.B)} T, A = ${fmt(f.A)} m² and θ = ${fmt(f.thetaDeg)}° one turn has Φ = ${formatSI(flux(f.B, f.A, f.thetaDeg), "Wb")}; N = ${f.N} turns link ${formatSI(f.N * flux(f.B, f.A, f.thetaDeg), "Wb")}.`,
      "Flux is largest when the loop faces the field (θ = 0°), zero when the field lies in the plane of the loop (θ = 90°), and negative past 90° because the field then crosses the loop against n̂.",
    ],
  });
  const fa = i.faraday, l = lenz(fa, 0);
  out.push({
    id: "faraday", title: "What does Faraday's law say?",
    body: [
      `The induced EMF is the rate of change of the flux linkage with a minus sign: ε = −N dΦ/dt. At t = 0 here dΦ/dt = ${formatSI(l.dFluxDt, "Wb/s")}, so ε = ${formatSI(l.emf, "V")}.`,
      "Only a changing flux induces an EMF: a strong but constant field through a stationary loop gives dΦ/dt = 0 and no EMF. The flux can change through B(t), the area A(t) or the angle θ(t).",
      fa.closed ? `The loop is closed, so a current i = ε/R = ${formatSI(l.current, "A")} flows (R = ${fmt(fa.R)} Ω).` : "The loop is open: the EMF exists as a potential difference but no sustained current flows.",
    ],
  });
  out.push({
    id: "lenz", title: "What does the minus sign mean (Lenz's law)?",
    body: [
      l.text,
      "Lenz's law is Faraday's minus sign, and it is energy conservation: if the induced current helped the change instead of opposing it, the change would grow without any work being done. The induced field opposes the CHANGE in flux, not the flux itself.",
    ],
  });
  const m = i.motional, mr = motionalEmf(m);
  out.push({
    id: "motional", title: "Where does motional EMF come from?",
    body: [
      `Charges in a rod moving through a magnetic field feel q v × B. Along a rod of length L this gives ε = (v × B)·L = B L v sin(ψ − α) = ${formatSI(mr.emf, "V")} here, with the ${mr.positiveEnd === "neither" ? "rod producing no net EMF" : `${mr.positiveEnd} end positive`}.`,
      mr.rails ? `On rails the current ${formatSI(mr.rails.current, "A")} feels a magnetic force ${formatSI(mr.rails.force, "N")} against the motion; pushing the rod costs mechanical power ${formatSI(mr.rails.mechanicalPower, "W")}, equal to the electrical power ${formatSI(mr.rails.electricalPower, "W")} (energy is conserved).` : "The rails model applies only when the rod moves perpendicular to its length.",
    ],
  });
  const g = i.generator;
  out.push({
    id: "generator", title: "Why is the generator's EMF largest when the flux is zero?",
    body: [
      `A coil turning at ω in a field has Φ = B A cos ωt, so ε = −N dΦ/dt = N B A ω sin ωt. The peak is ${formatSI(generatorPeakEmf(g), "V")} at ${fmt(g.frequency)} Hz.`,
      "The EMF follows the SLOPE of the flux, not its value: where Φ crosses zero it changes fastest, and where Φ is at its maximum the slope is zero. EMF and flux are therefore a quarter of a period out of phase.",
    ],
  });
  const rl = i.rl, tau = rlTau(rl), s = rlState(rl, tau);
  out.push({
    id: "rl", title: "Why does an inductor delay the current?",
    body: [
      `An inductor develops an EMF −L di/dt that opposes any change in current. With R = ${fmt(rl.R)} Ω and L = ${fmt(rl.L)} H the time constant is τ = L/R = ${formatSI(tau, "s")}; after one τ the current has made ${fmt(100 * s.progress)} % of its change.`,
      "In steady state di/dt = 0, so the inductor drops no voltage and the current is V/R. The stored energy U = ½Li² and the flux linkage NΦ = Li both follow the current.",
    ],
  });
  return out;
}

export function inductionScenarios(i: Ii): Array<PredictScenario<Ii>> {
  const list: Array<PredictScenario<Ii>> = [];
  if (i.scenario === "flux") {
    list.push(
      {
        id: "tilt", change: "turn the loop from its current angle to 90° to the field direction (θ = 90°)", quantity: "the flux through one turn",
        apply: (x) => indAfter(x, { flux: { ...x.flux, thetaDeg: 90 } }), measure: (x) => flux(x.flux.B, x.flux.A, x.flux.thetaDeg), format: (v) => formatSI(v, "Wb"), absTol: 1e-15,
        explain: (b, a) => `cos 90° = 0, so no field lines cross the loop: ${formatSI(b, "Wb")} → ${formatSI(a, "Wb")}.`,
      },
      {
        id: "double-A", change: "double the loop area", quantity: "the flux through one turn",
        apply: (x) => indAfter(x, { flux: { ...x.flux, A: x.flux.A * 2 } }), measure: (x) => flux(x.flux.B, x.flux.A, x.flux.thetaDeg), format: (v) => formatSI(v, "Wb"),
        explain: (b, a) => `Φ ∝ A: ${formatSI(b, "Wb")} → ${formatSI(a, "Wb")}.`,
      },
    );
  } else if (i.scenario === "faraday") {
    const emf = (x: Ii) => Math.abs(emfAtTime(x.faraday, 0));
    list.push(
      {
        id: "double-rate", change: "double the rate of change of the field", quantity: "the size of the induced EMF",
        apply: (x) => indAfter(x, { faraday: { ...x.faraday, bRate: x.faraday.bRate * 2 } }), measure: emf, format: (v) => formatSI(v, "V"),
        explain: (b, a) => `For a fixed loop ε = −NA dB/dt, proportional to the rate: ${formatSI(b, "V")} → ${formatSI(a, "V")}.`,
      },
      {
        id: "double-turns", change: "double the number of turns", quantity: "the size of the induced EMF",
        apply: (x) => indAfter(x, { faraday: { ...x.faraday, N: x.faraday.N * 2 } }), measure: emf, format: (v) => formatSI(v, "V"),
        explain: (b, a) => `Each turn adds its own EMF in series: ${formatSI(b, "V")} → ${formatSI(a, "V")}.`,
      },
      {
        id: "stop-change", change: "make the field constant (dB/dt = 0)", quantity: "the size of the induced EMF",
        apply: (x) => indAfter(x, { faraday: { ...x.faraday, bRate: 0 } }), measure: emf, format: (v) => formatSI(v, "V"), absTol: 1e-12,
        explain: (b, a) => `A steady field through a fixed loop induces nothing: ${formatSI(b, "V")} → ${formatSI(a, "V")}.`,
      },
    );
  } else if (i.scenario === "motional") {
    const emf = (x: Ii) => Math.abs(motionalEmf(x.motional).emf);
    list.push(
      {
        id: "double-v", change: "double the rod's speed", quantity: "the size of the EMF",
        apply: (x) => indAfter(x, { motional: { ...x.motional, v: x.motional.v * 2 } }), measure: emf, format: (v) => formatSI(v, "V"),
        explain: (b, a) => `ε = BLv: ${formatSI(b, "V")} → ${formatSI(a, "V")}.`,
      },
      {
        id: "rod-parallel", change: "turn the rod to lie along its velocity", quantity: "the size of the EMF",
        apply: (x) => indAfter(x, { motional: { ...x.motional, rodAngleDeg: x.motional.velAngleDeg } }), measure: emf, format: (v) => formatSI(v, "V"), absTol: 1e-12,
        explain: (b, a) => `v × B is perpendicular to v, so a rod along v feels no force along itself: ${formatSI(b, "V")} → ${formatSI(a, "V")}.`,
      },
    );
  } else if (i.scenario === "generator") {
    const pk = (x: Ii) => generatorPeakEmf(x.generator);
    list.push(
      {
        id: "double-f", change: "double the rotation frequency", quantity: "the peak EMF",
        apply: (x) => indAfter(x, { generator: { ...x.generator, frequency: x.generator.frequency * 2 } }), measure: pk, format: (v) => formatSI(v, "V"),
        explain: (b, a) => `Peak ε = NBAω is proportional to the frequency: ${formatSI(b, "V")} → ${formatSI(a, "V")}.`,
      },
      {
        id: "double-B", change: "double the magnetic field", quantity: "the peak EMF",
        apply: (x) => indAfter(x, { generator: { ...x.generator, B: x.generator.B * 2 } }), measure: pk, format: (v) => formatSI(v, "V"),
        explain: (b, a) => `Peak ε is proportional to B: ${formatSI(b, "V")} → ${formatSI(a, "V")}.`,
      },
    );
  } else {
    list.push(
      {
        id: "double-L", change: "double the inductance", quantity: "the time constant",
        apply: (x) => indAfter(x, { rl: { ...x.rl, L: x.rl.L * 2 } }), measure: (x) => rlTau(x.rl), format: (v) => formatSI(v, "s"),
        explain: (b, a) => `τ = L/R: ${formatSI(b, "s")} → ${formatSI(a, "s")}. A bigger inductor opposes changes more.`,
      },
      {
        id: "double-R", change: "double the resistance", quantity: "the time constant",
        apply: (x) => indAfter(x, { rl: { ...x.rl, R: x.rl.R * 2 } }), measure: (x) => rlTau(x.rl), format: (v) => formatSI(v, "s"),
        explain: (b, a) => `τ = L/R, so more resistance makes the current settle faster: ${formatSI(b, "s")} → ${formatSI(a, "s")}.`,
      },
      {
        id: "double-Vs", change: "double the source voltage", quantity: "the final steady current",
        apply: (x) => indAfter(x, { rl: { ...x.rl, Vs: x.rl.Vs * 2 } }), measure: (x) => x.rl.Vs / x.rl.R, format: (v) => formatSI(v, "A"),
        explain: (b, a) => `In steady state i = Vs/R: ${formatSI(b, "A")} → ${formatSI(a, "A")}; the time constant does not change.`,
      },
    );
  }
  return list.filter((s) => { const after = s.apply(i); return after !== null && Number.isFinite(s.measure(i)) && Number.isFinite(s.measure(after)); });
}

export const INDUCTION_CHALLENGES: Array<Challenge<Ii>> = [
  {
    id: "ind-ccw", title: "Induce a counter-clockwise current", view: "faraday",
    prompt: "With a closed loop, make the induced current at t = 0 at least 0.8 A and counter-clockwise (as seen from the side the area normal points toward).",
    check: (i) => { const p = i.faraday; const c = p.closed ? emfAtTime(p, 0) / p.R : 0; const met = p.closed && c >= 0.8; return { met, status: !p.closed ? "The loop must be closed." : `i = ${formatSI(c, "A")} (${c > 0 ? "counter-clockwise" : c < 0 ? "clockwise" : "none"})` }; },
    hint: "Counter-clockwise means positive EMF, so the flux must be DEcreasing along n̂ (ε = −N dΦ/dt).",
    solution: "Set dB/dt = −0.8 T/s: ε = −N A dB/dt = −50(0.05)(−0.8) = +2.0 V, i = 1.0 A.",
  },
  {
    id: "ind-motional-1V", title: "Make the tip positive at 1.0 V", view: "motional",
    prompt: "Make the rod's EMF +1.0 V (± 0.05 V), meaning the tip is the positive end.",
    check: (i) => { const m = motionalEmf(i.motional); const met = Math.abs(m.emf - 1) <= 0.05; return { met, status: `ε = ${formatSI(m.emf, "V")} (${m.positiveEnd === "neither" ? "no net EMF" : `${m.positiveEnd} positive`})` }; },
    hint: "ε = (v × B)·L. For B out of the screen and a vertical rod, the tip is positive when the rod moves to the left.",
    solution: "Velocity angle 180° (moving left) with v = 5 m/s, B = 0.5 T, L = 0.4 m: ε = BLv = +1.0 V.",
  },
  {
    id: "ind-generator-170", title: "A generator peaking at 170 V", view: "generator",
    prompt: "Make the generator's peak EMF 170 V (± 5 V) at a frequency of 60 Hz.",
    check: (i) => { const pk = generatorPeakEmf(i.generator); const met = Math.abs(i.generator.frequency - 60) < 1e-9 && Math.abs(pk - 170) <= 5; return { met, status: `peak ${formatSI(pk, "V")} at ${fmt(i.generator.frequency)} Hz` }; },
    hint: "Peak ε = N B A ω with ω = 2π f.",
    solution: "N = 90, B = 0.25 T, A = 0.02 m² at 60 Hz: 90 × 0.25 × 0.02 × 377 ≈ 170 V.",
  },
  {
    id: "ind-rl", title: "Settle to 0.5 A with τ = 10 ms", view: "rl",
    prompt: "Choose the circuit so that the final current is 0.50 A (± 0.01 A) and the time constant is 10 ms (± 0.5 ms).",
    check: (i) => { const r = i.rl; const iInf = r.Vs / r.R, tau = rlTau(r); const met = Math.abs(iInf - 0.5) <= 0.01 && Math.abs(tau - 0.01) <= 5e-4; return { met, status: `final current ${formatSI(iInf, "A")}, τ = ${formatSI(tau, "s")}` }; },
    hint: "i∞ = Vs/R and τ = L/R: fix R from the voltage, then L from τ.",
    solution: "Vs = 12 V with R = 24 Ω gives 0.50 A; L = τR = 0.01 × 24 = 0.24 H.",
  },
];
