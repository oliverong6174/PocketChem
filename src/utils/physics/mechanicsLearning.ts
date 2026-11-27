/**
 * Explanations, free-body-diagram quiz and predict-then-observe scenarios for the Forces, Work & Energy and Momentum & Collisions
 * tools. Every number quoted comes from the same model the page draws.
 */
import type { PredictScenario } from "../generalChem/predict";
import { solveCollision, validateCollisionInput, BODY_WIDTH } from "./collisions";
import { analyzeEnergy, validateEnergyInput } from "./energy";
import { analyzeForces, validateForceInput, describeState } from "./forces";
import { fmt, formatSI } from "./format";
import type { Lesson } from "./physicsLearning";
import type { CollisionsInputs, EnergyInputs, ForcesInputs } from "../persistence/physicsTools";

// ---- forces ------------------------------------------------------------------------------------------------------------------

export function forcesLessons(inputs: ForcesInputs): Lesson[] {
  const i = inputs.input;
  const a = analyzeForces(i);
  const m = a.at(Math.min(Math.max(inputs.tNow, 0), i.duration));
  const pulley = i.mode === "pulley";
  const lessons: Lesson[] = [
    {
      id: "vectors",
      title: "Why are forces vectors, and how is a free-body diagram built?",
      body: [
        "A force has a size and a direction, and the same push in a different direction does something different, so forces are added as vectors: component by component along chosen axes. Here x runs along the surface and y is perpendicular to it.",
        "To draw a free-body diagram: isolate the one body, draw only the forces acting ON it (never the forces it exerts on others), put each arrow's tail on the body, and label each with its cause. For this system the forces are " + m.forces.map((f) => `${f.label.toLowerCase()} (${fmt(f.magnitude)} N)`).join(", ") + ".",
        `The net force is the vector sum: (${fmt(m.net.x)}, ${fmt(m.net.y)}) N. Newton's second law then says the acceleration is the net force divided by the mass (${fmt(a.inertia)} kg of inertia here): ${fmt(m.a)} m/s² along the surface.`,
      ],
    },
    {
      id: "normal",
      title: "Why is the normal force not always equal to the weight?",
      body: [
        "The normal force is a contact force: it is whatever the surface must supply to stop the body sinking into it, so it balances the force components pressing into the surface, not the weight itself.",
        pulley
          ? `On a horizontal table with nothing pushing up or down, N = mg = ${fmt(a.normal)} N.`
          : `Here N = mg cosθ − F sinφ = ${fmt(a.perpendicular)} − ${fmt(a.perpendicular - a.normalRaw)} = ${fmt(a.normalRaw)} N, while the weight is ${fmt(a.weight)} N. An incline lowers N by the factor cosθ, pushing down on the block raises it, and pulling up lowers it.`,
        a.contact ? "" : "Here the upward pull exceeds what the surface could ever balance, so N would have to be negative. A surface cannot pull, so the body leaves it: N = 0, there is no friction, and the model reports only the weight and the applied force.",
      ].filter(Boolean),
    },
    {
      id: "friction",
      title: "What is the difference between static and kinetic friction?",
      body: [
        `Static friction acts when there is no sliding. It is not a fixed number: it adjusts to exactly cancel the other forces along the surface, up to a maximum μₛN = ${fmt(i.mus)} × ${fmt(a.normal)} = ${fmt(a.staticMax)} N. Right now the force along the surface (apart from friction) is ${fmt(a.driving)} N, so ${Math.abs(a.driving) <= a.staticMax ? "static friction can hold the body: it supplies exactly " + fmt(Math.abs(a.driving)) + " N" : "it exceeds the limit and the body slides"}.`,
        `Once it slides, friction has the fixed size μₖN = ${fmt(i.muk)} × ${fmt(a.normal)} = ${fmt(i.muk * a.normal)} N and points against the sliding. Kinetic friction is usually smaller than the static limit, which is why it is harder to start something moving than to keep it moving.`,
      ],
    },
    {
      id: "zero-net",
      title: "Does zero net force mean zero velocity?",
      body: [
        `No. Zero net force means zero acceleration: the velocity stays as it is. A body at rest stays at rest, but a body already moving keeps moving at constant velocity. Right now the state is “${describeState(m.state)}”.`,
        "A box pushed at a steady speed across a rough floor has the push balanced by kinetic friction: net force zero, constant velocity. Set the initial velocity above 0 and the push equal to μₖN to see it.",
      ],
    },
  ];
  if (!pulley) {
    lessons.push({
      id: "incline",
      title: "How does an inclined plane change the force balance?",
      body: [
        `Gravity points straight down, but the surface is tilted by ${fmt(i.theta)}°, so the weight is split into a component along the slope, mg sinθ = ${fmt(a.parallel)} N (pulling the body down the slope), and one into the slope, mg cosθ = ${fmt(a.perpendicular)} N (balanced by the normal force).`,
        i.theta > 0 ? `A body at rest stays put while tanθ ≤ μₛ. Here tan ${fmt(i.theta)}° = ${fmt(Math.tan((i.theta * Math.PI) / 180))} and μₛ = ${fmt(i.mus)}, so ${Math.tan((i.theta * Math.PI) / 180) <= i.mus ? "it can stay at rest" : "it slides"} (when nothing else pulls on it).` : "On a flat surface the weight has no component along the surface.",
      ],
    });
  }
  if (pulley) {
    lessons.push({
      id: "tension",
      title: "How do the block and the hanging mass share the acceleration?",
      body: [
        `The string forces them to move together, so one acceleration describes both. The hanging mass obeys m₂g − T = m₂a and the block obeys T − friction = ma. Adding eliminates T: a = (m₂g − friction)/(m + m₂) = ${fmt(m.a)} m/s².`,
        m.tension === null ? "" : `The tension is T = m₂(g − a) = ${fmt(m.tension)} N: less than the hanging weight ${fmt(i.m2 * i.g)} N while the mass is accelerating downward, equal to it at rest.`,
      ].filter(Boolean),
    });
  }
  return lessons;
}

export interface QuizCandidate { id: string; label: string }
/** The candidate forces offered in the "which forces act?" question: the real ones plus two common mistakes. */
export const QUIZ_CANDIDATES: QuizCandidate[] = [
  { id: "weight", label: "Weight (gravity)" },
  { id: "normal", label: "Normal force" },
  { id: "static", label: "Static friction" },
  { id: "kinetic", label: "Kinetic friction" },
  { id: "applied", label: "Applied force / tension" },
  { id: "motion", label: "“Force of motion” (in the direction of travel)" },
  { id: "thrust", label: "A force of the body on the surface (its push on the ground)" },
];
/** Which candidates really act on the body at t = 0 (the "motion" and "thrust" candidates never do). */
export function quizAnswer(inputs: ForcesInputs): string[] {
  const m = analyzeForces(inputs.input).at(0);
  const ids = new Set(m.forces.map((f) => f.id));
  const out: string[] = ["weight"];
  if (ids.has("normal") && m.forces.find((f) => f.id === "normal")!.magnitude > 0) out.push("normal");
  if (m.friction.kind === "static" && m.friction.value !== 0) out.push("static");
  if (m.friction.kind === "kinetic" && m.friction.value !== 0) out.push("kinetic");
  if (ids.has("applied") || ids.has("tension")) out.push("applied");
  return out;
}

type Fi = ForcesInputs;
const withForce = (i: Fi, patch: Partial<Fi["input"]>): Fi | null => {
  const v = validateForceInput({ ...i.input, ...patch });
  return v.ok ? { ...i, input: v.value, tNow: 0, selected: null } : null;
};
const at0 = (i: Fi) => analyzeForces(i.input).at(0);

export function forcesScenarios(inputs: Fi): PredictScenario<Fi>[] {
  const i = inputs.input;
  const list: PredictScenario<Fi>[] = [];
  if (i.mode === "surface") {
    list.push(
      {
        id: "double-force-friction", change: "double the applied force", quantity: "the friction force",
        apply: (x) => withForce(x, { F: Math.min(x.input.F * 2, 2000) }), measure: (x) => Math.abs(at0(x).friction.value), format: (v) => fmtN(v),
        explain: (b, a, t) => (t === "higher" ? `While the body stays at rest, static friction grows to match the push: ${fmtN(b)} → ${fmtN(a)}.` : t === "lower" ? `The push passed the static limit, so the body slides and friction drops to the kinetic value μₖN: ${fmtN(b)} → ${fmtN(a)}.` : `Friction stayed at ${fmtN(a)}: it is already the constant kinetic value μₖN, which does not depend on how hard you push along the surface.`),
      },
      {
        id: "tilt-normal", change: "tilt the surface 10° steeper", quantity: "the normal force",
        apply: (x) => withForce(x, { theta: Math.min(x.input.theta + 10, 80) }), measure: (x) => analyzeForces(x.input).normal, format: (v) => fmtN(v),
        explain: (b, a) => `On a steeper slope less of the weight presses into the surface: N = mg cosθ − F sinφ goes from ${fmtN(b)} to ${fmtN(a)}.`,
      },
      {
        id: "lift-normal", change: "tilt the applied force 20° upward", quantity: "the normal force",
        apply: (x) => withForce(x, { phi: Math.min(x.input.phi + 20, 90) }), measure: (x) => analyzeForces(x.input).normal, format: (v) => fmtN(v),
        explain: (b, a, t) => `The upward part of the applied force, F sinφ, carries some of the weight, so the surface has to supply less: ${fmtN(b)} → ${fmtN(a)} (${t}).`,
      },
      {
        id: "mass-a", change: "double the mass", quantity: "the acceleration along the surface",
        apply: (x) => withForce(x, { m: Math.min(x.input.m * 2, 1000) }), measure: (x) => Math.abs(at0(x).a), format: (v) => `${fmt(v)} m/s²`,
        explain: (b, a, t) => (t === "same" ? `Every force here is proportional to the mass (weight, normal force, friction), so the mass cancels in F = ma: ${fmt(a)} m/s² either way.` : `The applied force does not grow with the mass, so the same push now moves more inertia: ${fmt(b)} → ${fmt(a)} m/s².`),
      },
      {
        id: "muk-a", change: "raise μₖ by 0.2 (μₛ raised too if needed)", quantity: "the acceleration along the surface",
        apply: (x) => withForce(x, { muk: x.input.muk + 0.2, mus: Math.max(x.input.mus, x.input.muk + 0.2) }), measure: (x) => Math.abs(at0(x).a), format: (v) => `${fmt(v)} m/s²`,
        explain: (b, a, t) => `More kinetic friction opposes the sliding more, so the acceleration is ${t === "same" ? "unchanged" : t}: ${fmt(b)} → ${fmt(a)} m/s². If the body is at rest and held by static friction nothing changes.`,
      },
    );
  } else {
    list.push(
      {
        id: "hang-more", change: "double the hanging mass", quantity: "the acceleration",
        apply: (x) => withForce(x, { m2: Math.min(x.input.m2 * 2, 1000) }), measure: (x) => Math.abs(at0(x).a), format: (v) => `${fmt(v)} m/s²`,
        explain: (b, a) => `A heavier hanging mass pulls harder, although it also adds inertia: a = (m₂g − μmg)/(m + m₂) goes from ${fmt(b)} to ${fmt(a)} m/s².`,
      },
      {
        id: "tension-vs-weight", change: "double the hanging mass", quantity: "the tension in the string",
        apply: (x) => withForce(x, { m2: Math.min(x.input.m2 * 2, 1000) }), measure: (x) => at0(x).tension ?? NaN, format: (v) => fmtN(v),
        explain: (b, a) => `Tension is T = m₂(g − a). It is never larger than the hanging weight while that mass speeds up downward: ${fmtN(b)} → ${fmtN(a)}.`,
      },
      {
        id: "block-heavier", change: "double the mass of the block on the table", quantity: "the acceleration",
        apply: (x) => withForce(x, { m: Math.min(x.input.m * 2, 1000) }), measure: (x) => Math.abs(at0(x).a), format: (v) => `${fmt(v)} m/s²`,
        explain: (b, a, t) => `More mass on the table means more inertia and, with friction, more resistance: the acceleration is ${t}: ${fmt(b)} → ${fmt(a)} m/s².`,
      },
    );
  }
  return list.filter((s) => s.apply(inputs) !== null);
}
const fmtN = (v: number) => formatSI(v, "N");

// ---- work and energy ----------------------------------------------------------------------------------------------------------

export function energyLessons(inputs: EnergyInputs): Lesson[] {
  const i = inputs.input;
  const a = analyzeEnergy(i);
  const s = a.at(Math.min(Math.max(inputs.tNow, 0), a.tEnd));
  const lessons: Lesson[] = [
    {
      id: "work",
      title: "What is work, and why can it be positive, negative or zero?",
      body: [
        "Work is force applied through a displacement: W = F·d·cosθ, where θ is the angle between the force and the displacement. A force along the motion does positive work and speeds the body up; a force against the motion does negative work and slows it; a force at right angles to the motion (like the normal force on a block sliding along a surface) does zero work.",
        `So far in this run: gravity has done ${formatSI(s.Wgravity, "J")}, the spring ${formatSI(s.Wspring, "J")}, friction ${formatSI(s.Wfriction, "J")} and the applied force ${formatSI(s.Wapplied, "J")}. Their sum is ${formatSI(s.Wgravity + s.Wspring + s.Wfriction + s.Wapplied, "J")}, which is exactly the change in kinetic energy ${formatSI(s.KE - a.initial.KE, "J")}. That is the work–energy theorem.`,
      ],
    },
    {
      id: "conservative",
      title: "What are conservative and nonconservative forces?",
      body: [
        "A force is conservative if the work it does between two points does not depend on the path: gravity and an ideal spring are. Their work can be stored as potential energy, mg·h for gravity and ½kx² for the spring, and given back.",
        "Friction is nonconservative: the work it does depends on the path length, and it cannot be stored. It turns mechanical energy into thermal energy.",
      ],
    },
    {
      id: "lost",
      title: "Can mechanical energy decrease while total energy is conserved?",
      body: [
        `Yes. Here the mechanical energy (KE + PE) is ${formatSI(s.Emech, "J")}, and it started at ${formatSI(a.initial.Emech, "J")}. The difference went into heat Q = ${formatSI(s.Q, "J")} (and ${formatSI(s.Wapplied, "J")} was put in by the applied force). KE + PE + Q = ${formatSI(s.Etotal, "J")}: the full ledger balances at every instant, which is what the energy bars show.`,
      ],
    },
    {
      id: "power",
      title: "How do force, energy and power differ?",
      body: [
        "Force is a push or pull in newtons. Energy is the capacity stored or transferred, in joules. Power is the rate of transfer, energy per time in watts.",
        `For a force F acting on a body moving at v the instantaneous power is P = F·v. At this moment the speed is ${fmt(Math.abs(s.v))} m/s${i.scenario === "flat" && i.F !== 0 ? `, so the applied force delivers P = ${formatSI(i.F * s.v, "W")}` : ""}.`,
      ],
    },
  ];
  if (i.scenario === "spring") {
    lessons.push({
      id: "spring",
      title: "Why does a spring store energy?",
      body: [
        `Pushing the spring in against its force takes work. The force grows in proportion to the compression, F = kx, so the work is the area under that line, ½kx² = ½ × ${fmt(i.k)} N/m × (${fmt(i.x0)} m)² = ${formatSI(0.5 * i.k * i.x0 * i.x0, "J")}. That work is stored as elastic potential energy and is returned as kinetic energy when the spring is released (less whatever friction takes).`,
        `Doubling the compression stores four times the energy because the energy grows with x².`,
      ],
    });
  }
  if (i.scenario === "height" || i.scenario === "incline") {
    lessons.push({
      id: "reference",
      title: "Why must the reference height for gravitational energy be stated?",
      body: [
        `Only changes in potential energy matter physically, so the zero of potential energy is a choice: ${i.scenario === "height" ? `here it is ${fmt(i.href)} m above the ground` : "here it is the bottom of the incline"}. Moving it shifts every PE value (even to negative values below it) and the total, but not the speeds or any change in energy.`,
      ],
    });
  }
  return lessons;
}

type Ei = EnergyInputs;
const withEnergy = (i: Ei, patch: Partial<Ei["input"]>): Ei | null => {
  const v = validateEnergyInput({ ...i.input, ...patch });
  return v.ok ? { ...i, input: v.value, tNow: 0 } : null;
};
const eMeasure = (pick: (a: ReturnType<typeof analyzeEnergy>) => number) => (i: Ei) => pick(analyzeEnergy(i.input));

export function energyScenarios(inputs: Ei): PredictScenario<Ei>[] {
  const s = inputs.input.scenario;
  const list: PredictScenario<Ei>[] = [];
  const speed = (name: string, change: string, apply: (x: Ei) => Ei | null, explain: PredictScenario<Ei>["explain"]): PredictScenario<Ei> => ({
    id: name, change, quantity: "the speed at the end of the motion", apply, measure: eMeasure((a) => Math.abs(a.final.v)), format: (v) => `${fmt(v)} m/s`, explain,
  });
  if (s === "incline") {
    list.push(
      speed("m-incline", "double the mass", (x) => withEnergy(x, { m: Math.min(x.input.m * 2, 1000) }), (b, a, t) => (t === "same" ? `Gravity and friction are both proportional to the mass, so m cancels in ½mv² = mgh − μmg cosθ·d: v = ${fmt(a)} m/s either way.` : `The mass changed the result because the incline is too short or the block stops: ${fmt(b)} → ${fmt(a)} m/s.`)),
      speed("mu-incline", "increase μₖ by 0.1", (x) => withEnergy(x, { muk: x.input.muk + 0.1, mus: Math.max(x.input.mus, x.input.muk + 0.1) }), (b, a) => `More of the gravitational energy is turned into heat on the way down, so less is left as kinetic energy: ${fmt(b)} → ${fmt(a)} m/s.`),
      {
        id: "heat-incline", change: "double the length of the incline (same angle, start at the top)", quantity: "the heat produced by friction",
        apply: (x) => withEnergy(x, { L: Math.min(x.input.L * 2, 100), u0: Math.min(x.input.L * 2, 100) }), measure: eMeasure((a) => a.final.Q), format: (v) => formatSI(v, "J"),
        explain: (b, a) => `Heat is μₖN × distance slid, and the distance doubles: ${formatSI(b, "J")} → ${formatSI(a, "J")}.`,
      },
    );
  } else if (s === "flat") {
    list.push(
      {
        id: "v-flat", change: "double the starting speed", quantity: "the distance it slides before stopping (no push)",
        apply: (x) => withEnergy(x, { v0: Math.min(x.input.v0 * 2, 100), F: 0 }), measure: eMeasure((a) => a.final.pos), format: (v) => `${fmt(v)} m`,
        explain: (b, a) => `Friction removes kinetic energy ½mv² at a constant rate per metre, so the stopping distance goes as v²: ${fmt(b)} → ${fmt(a)} m, four times as far for twice the speed.`,
      },
      speed("m-flat", "double the mass", (x) => withEnergy(x, { m: Math.min(x.input.m * 2, 1000) }), (b, a, t) => `Friction and inertia both scale with the mass, but the applied force does not, so the speed is ${t}: ${fmt(b)} → ${fmt(a)} m/s.`),
    );
  } else if (s === "spring") {
    list.push(
      {
        id: "x-spring", change: "double the compression", quantity: "the energy stored in the spring at release",
        apply: (x) => withEnergy(x, { x0: Math.min(x.input.x0 * 2, 5) }), measure: eMeasure((a) => a.initial.PEs), format: (v) => formatSI(v, "J"),
        explain: (b, a) => `Elastic energy is ½kx²: doubling x quadruples it, ${formatSI(b, "J")} → ${formatSI(a, "J")}.`,
      },
      {
        id: "k-spring", change: "double the spring constant (same compression)", quantity: "the speed at which the block leaves the spring",
        apply: (x) => withEnergy(x, { k: Math.min(x.input.k * 2, 1e5) }), measure: (x) => { const run = analyzeEnergy(x.input); return Math.max(...Array.from({ length: 101 }, (_, k) => Math.abs(run.at((run.tEnd * k) / 100).v))); }, format: (v) => `${fmt(v)} m/s`,
        explain: (b, a) => `A stiffer spring stores more energy for the same compression (½kx²), so the block leaves faster: ${fmt(b)} → ${fmt(a)} m/s.`,
      },
      speed("m-spring", "double the mass", (x) => withEnergy(x, { m: Math.min(x.input.m * 2, 1000) }), (b, a) => `The same stored energy now moves twice the mass, v = √(2E/m) (less friction effects), so it is slower: ${fmt(b)} → ${fmt(a)} m/s at the end.`),
    );
  } else {
    list.push(
      {
        id: "h-height", change: "double the drop height", quantity: "the speed on landing",
        apply: (x) => withEnergy(x, { h0: Math.min(x.input.h0 * 2, 1000) }), measure: eMeasure((a) => Math.abs(a.final.v)), format: (v) => `${fmt(v)} m/s`,
        explain: (b, a) => `½mv² = mgh + ½mv₀²: the speed grows with √h, not h: ${fmt(b)} → ${fmt(a)} m/s (the mass cancels).`,
      },
      {
        id: "href-height", change: "move the reference height up by 5 m", quantity: "the speed on landing",
        apply: (x) => withEnergy(x, { href: x.input.href + 5 }), measure: eMeasure((a) => Math.abs(a.final.v)), format: (v) => `${fmt(v)} m/s`,
        explain: () => "Only differences in potential energy matter. Changing the zero of PE shifts every PE value but not the change in energy, so the speed is the same.",
      },
      {
        id: "v0-height", change: "throw it up at 5 m/s more", quantity: "the maximum height",
        apply: (x) => withEnergy(x, { v0: Math.min(x.input.v0 + 5, 100) }), measure: eMeasure((a) => a.posMax), format: (v) => `${fmt(v)} m`,
        explain: (b, a) => `More kinetic energy at the start becomes more potential energy at the top: ${fmt(b)} → ${fmt(a)} m.`,
      },
    );
  }
  return list.filter((x) => x.apply(inputs) !== null);
}

// ---- collisions ----------------------------------------------------------------------------------------------------------------

export function collisionLessons(inputs: CollisionsInputs): Lesson[] {
  const i = inputs.input;
  const r = solveCollision(i);
  const lessons: Lesson[] = [
    {
      id: "momentum",
      title: "Why is total momentum conserved in an isolated collision?",
      body: [
        `During the collision A pushes B with a force and, by Newton's third law, B pushes A with an equal and opposite force for exactly the same time. The impulses are equal and opposite, so the momentum A gains B loses: total momentum ${fmt(r.pTotal)} kg·m/s stays the same. External forces (like friction here) would break this; this model has none.`,
        r.collides ? `Check: before ${fmt(i.mA)}×${fmt(i.vA)} + ${fmt(i.mB)}×${fmt(i.vB)} = ${fmt(r.pTotal)}; after ${fmt(i.mA)}×${fmt(r.vA2)} + ${fmt(i.mB)}×${fmt(r.vB2)} = ${fmt(i.mA * r.vA2 + i.mB * r.vB2)}.` : "",
      ].filter(Boolean),
    },
    {
      id: "energy",
      title: "Why may kinetic energy not be conserved?",
      body: [
        "Only momentum is conserved in every collision. Kinetic energy is conserved only in an elastic collision, where the bodies spring apart perfectly. In real collisions some of it goes into deformation, sound and heat.",
        r.collides ? `Here kinetic energy goes from ${formatSI(r.KEbefore, "J")} to ${formatSI(r.KEafter, "J")}: ${fmt(100 * r.lossFraction)} % lost (${formatSI(r.lossJ, "J")}). The loss is ½μ(1 − e²)(vA − vB)² with reduced mass μ = mAmB/(mA + mB).` : "",
      ].filter(Boolean),
    },
    {
      id: "restitution",
      title: "How is the coefficient of restitution different from conserving kinetic energy?",
      body: [
        "e compares speeds, not energies: it is the ratio of the speed of separation to the speed of approach, e = (vB′ − vA′)/(vA − vB). e = 1 is elastic (the speed of separation equals the speed of approach and kinetic energy is conserved), e = 0 is perfectly inelastic (no separation).",
        r.collides ? `With e = ${fmt(i.e)}, the bodies separate at ${fmt(r.vB2 - r.vA2)} m/s after approaching at ${fmt(i.vA - i.vB)} m/s, but they keep ${fmt(100 * (1 - r.lossFraction))} % of the kinetic energy, not ${fmt(100 * i.e)} %: the energy ratio is not e.` : "",
      ].filter(Boolean),
    },
    {
      id: "inelastic",
      title: "Why do bodies in a perfectly inelastic collision share a final velocity?",
      body: [
        "With e = 0 the relative velocity after is zero: the bodies do not separate, so they move together. Momentum conservation then gives one velocity, v = (mAvA + mBvB)/(mA + mB), which is also the velocity of the centre of mass. It is the largest possible loss of kinetic energy compatible with momentum conservation.",
        `This system's centre-of-mass velocity is ${fmt(r.vcm)} m/s, and it is the same before and after the collision for every e.`,
      ],
    },
    {
      id: "mass",
      title: "How do the outcomes depend on the mass ratio?",
      body: [
        "Equal masses at e = 1 swap velocities. A light body bouncing off a heavy one rebounds almost at its own speed and barely moves the heavy body. A heavy body hitting a light one barely slows and sends the light one off at up to twice its own speed.",
        `Here the mass ratio mB/mA is ${fmt(i.mB / i.mA)}.`,
      ],
    },
    {
      id: "impulse",
      title: "How are impulse and change in momentum related?",
      body: [
        `Impulse is force × time and equals the change in momentum, J = Δp. Body B's momentum changes by ${r.collides ? fmt(r.dpB) : "0"} kg·m/s, so the impulse on B is ${r.collides ? fmt(r.J) : "0"} N·s (equal and opposite on A).`,
        r.averageForce !== null ? `With the collision lasting ${fmt(i.contactTime as number)} s the average force is J/Δt = ${fmt(r.averageForce)} N.` : "The size of the force depends on how long the collision lasts, which this idealised model does not specify: give a duration to get an average force. The force history during the contact is not modelled.",
      ],
    },
  ];
  return lessons;
}

type Ci = CollisionsInputs;
const withColl = (i: Ci, patch: Partial<Ci["input"]>): Ci | null => {
  const v = validateCollisionInput({ ...i.input, ...patch });
  return v.ok ? { ...i, input: v.value, tNow: 0 } : null;
};
const cMeasure = (pick: (r: ReturnType<typeof solveCollision>) => number) => (i: Ci) => { const r = solveCollision(i.input); return r.collides ? pick(r) : NaN; };

export function collisionScenarios(inputs: Ci): PredictScenario<Ci>[] {
  const list: PredictScenario<Ci>[] = [
    {
      id: "e0-ke", change: "make the collision perfectly inelastic (e = 0)", quantity: "the kinetic energy after the collision",
      apply: (x) => withColl(x, { e: 0 }), measure: cMeasure((r) => r.KEafter), format: (v) => formatSI(v, "J"),
      explain: (b, a, t) => `With e = 0 the bodies stick, which dissipates the most kinetic energy: ${formatSI(b, "J")} → ${formatSI(a, "J")} (${t}). Momentum is the same either way.`,
    },
    {
      id: "e1-loss", change: "make the collision perfectly elastic (e = 1)", quantity: "the kinetic energy lost in the collision",
      apply: (x) => withColl(x, { e: 1 }), measure: cMeasure((r) => r.lossJ), format: (v) => formatSI(v, "J"),
      explain: (b, a) => `Elastic collisions conserve kinetic energy, so nothing is lost: ${formatSI(b, "J")} → ${formatSI(a, "J")}.`,
    },
    {
      id: "double-masses", change: "double both masses", quantity: "the final velocity of B",
      apply: (x) => withColl(x, { mA: Math.min(x.input.mA * 2, 1000), mB: Math.min(x.input.mB * 2, 1000) }), measure: cMeasure((r) => r.vB2), format: (v) => `${fmt(v)} m/s`,
      explain: (b, a, t) => `The final velocities depend only on the mass ratio, which did not change: ${fmt(b)} → ${fmt(a)} m/s (${t}). The momentum and the energies double, though.`,
    },
    {
      id: "double-v", change: "double both initial velocities", quantity: "the change in momentum of A",
      apply: (x) => withColl(x, { vA: Math.max(-50, Math.min(50, x.input.vA * 2)), vB: Math.max(-50, Math.min(50, x.input.vB * 2)) }), measure: cMeasure((r) => Math.abs(r.dpA)), format: (v) => `${fmt(v)} kg·m/s`,
      explain: (b, a) => `Impulse is μ(1 + e)(vA − vB), proportional to the approach speed: ${fmt(b)} → ${fmt(a)} kg·m/s.`,
    },
    {
      id: "heavier-b", change: "make B ten times heavier", quantity: "the final speed of A",
      apply: (x) => withColl(x, { mB: Math.min(x.input.mB * 10, 1000) }), measure: cMeasure((r) => Math.abs(r.vA2)), format: (v) => `${fmt(v)} m/s`,
      explain: (b, a) => `A heavier target changes A's velocity more: it rebounds harder when B is much heavier. Speed of A after: ${fmt(b)} → ${fmt(a)} m/s.`,
    },
  ];
  void BODY_WIDTH;
  return list.filter((s) => s.apply(inputs) !== null && Number.isFinite(s.measure(inputs)));
}

/** The quick comparison used by the "which loses more kinetic energy?" question. */
export function lossComparison(inputs: Ci): Array<{ e: number; lossJ: number; lossFraction: number }> {
  return [0, 0.5, 1].map((e) => { const r = solveCollision({ ...inputs.input, e }); return { e, lossJ: r.lossJ, lossFraction: r.lossFraction }; });
}
