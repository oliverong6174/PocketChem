/**
 * Explanations and predict-then-observe scenarios for the Physics tools. Every number quoted comes from the same model the page
 * draws, so the text always describes the system the learner has set up.
 */
import type { PredictScenario } from "../generalChem/predict";
import { addResistor, analyzeCircuit, resistorsOf, setResistance } from "./circuits";
import { fmt, formatSI } from "./format";
import {
  bestAngleFromHeight, launchComponents, stateAt, summarize, validateConstantAccel, validateProjectile, type MotionSummary,
} from "./mechanics";
import { stateAt as rcStateAt, summarize as rcSummarize, timeConstant, validateRc } from "./rc";
import {
  mechanicsKinematics, type CircuitsInputs, type MechanicsInputs, type RcInputs,
} from "../persistence/physicsTools";

export interface Lesson { id: string; title: string; body: string[] }

// ---- mechanics ---------------------------------------------------------------------------------------------------------------

export function mechanicsLessons(inputs: MechanicsInputs): Lesson[] {
  const k = mechanicsKinematics(inputs);
  const s: MotionSummary = summarize(k);
  const now = stateAt(k, Math.min(Math.max(inputs.tNow, 0), s.tEnd));
  const g = -k.ay;
  const projectile = inputs.mode === "projectile";
  const lessons: Lesson[] = [
    {
      id: "horizontal",
      title: "Why does the horizontal velocity stay constant?",
      body: k.ax === 0
        ? [
          `Nothing pushes the particle sideways: the horizontal acceleration is 0 m/s². With no acceleration the velocity cannot change, so vₓ stays at ${fmt(k.vx0)} m/s for the whole motion and x grows in equal steps, x = x₀ + vₓt.`,
          `At t = ${fmt(now.t)} s the horizontal velocity is ${fmt(now.vx)} m/s, the same as at launch. Gravity acts only downward, and the two directions are independent.`,
        ]
        : [
          `Here the horizontal acceleration is ${fmt(k.ax)} m/s², so vₓ is not constant: vₓ = vₓ₀ + aₓt = ${fmt(now.vx)} m/s at t = ${fmt(now.t)} s. It was only constant for projectile motion because gravity has no horizontal part.`,
        ],
    },
    {
      id: "vertical",
      title: "Why does the vertical velocity change?",
      body: [
        k.ay === 0
          ? "There is no vertical acceleration in this setup, so the vertical velocity is constant as well."
          : `The vertical acceleration is ${fmt(k.ay)} m/s². Every second the vertical velocity changes by that amount: v_y = v_y₀ + a_y t. At t = ${fmt(now.t)} s it is ${fmt(now.vy)} m/s (${now.vy > 0 ? "still moving up" : now.vy < 0 ? "moving down" : "momentarily at rest vertically"}).`,
        "On the v_y–t graph this is a straight line whose slope is the acceleration; the area between the line and the time axis is the vertical displacement.",
      ],
    },
    {
      id: "parabola",
      title: "Why is the path a parabola?",
      body: [
        "Eliminate time: t = (x − x₀)/vₓ. Substituting into y = y₀ + v_y₀t + ½a_y t² gives y as a quadratic function of x, and a quadratic is a parabola.",
        projectile ? `That needs constant gravity and no air resistance, the assumptions of this model. With drag the real path is shorter and steeper on the way down.` : "That argument needs constant acceleration in a fixed direction. With both components accelerating the path is still a parabola (or a straight line), but not necessarily symmetric about a vertical axis.",
      ],
    },
    {
      id: "apex",
      title: "Why is the highest point where the vertical velocity is zero?",
      body: s.apexIsTurning
        ? [
          `Going up, gravity reduces v_y; at the top v_y = 0, and after it v_y is negative and the particle descends. Setting v_y₀ − g t = 0 gives t = v_y₀/g = ${fmt(s.tApex)} s, and then the height is y₀ + v_y₀²/(2g) = ${fmt(s.maxHeight)} m.`,
          `Check on the graphs: at t = ${fmt(s.tApex)} s the v_y line crosses zero while the y curve peaks.`,
        ]
        : [
          `With these values the particle never rises above its starting height of ${fmt(s.maxHeight)} m: ${projectile ? "it is launched level or downward, so v_y is never positive" : "the motion in y has no turning point inside the window"}. There is no turning point to mark.`,
        ],
    },
  ];
  if (projectile) {
    const p = inputs.projectile;
    const best = bestAngleFromHeight(p.speed, p.y0, p.g);
    lessons.push({
      id: "angle",
      title: "How does the launch angle change range and height?",
      body: [
        `The launch speed ${fmt(p.speed)} m/s splits into vₓ₀ = v cos θ = ${fmt(launchComponents(p.speed, p.angleDeg).vx0)} m/s and v_y₀ = v sin θ = ${fmt(launchComponents(p.speed, p.angleDeg).vy0)} m/s. A steeper angle gives more v_y₀: higher and longer in the air, but less vₓ.`,
        `Maximum height grows with sin²θ. Range balances time in the air against horizontal speed: on level ground range = v² sin 2θ / g, greatest at 45°, and θ and 90° − θ give the same range. From a height of ${fmt(p.y0)} m the best angle is ${fmt(best)}°${p.y0 > 0 ? ", below 45° because the extra fall time already helps" : ""}.`,
        s.range === null ? "" : `Your launch at ${fmt(p.angleDeg)}° travels ${fmt(s.range)} m and reaches ${fmt(s.maxHeight)} m.`,
      ].filter(Boolean),
    });
    lessons.push({
      id: "energy",
      title: "Energy check",
      body: [
        `Without air resistance ½v² + g y (energy per kilogram) is constant. At launch it is ${fmt(0.5 * s.launch.speed ** 2 + g * s.launch.y)} J/kg and at landing ${fmt(0.5 * s.end.speed ** 2 + g * s.end.y)} J/kg. So the landing speed ${fmt(s.end.speed)} m/s depends only on the launch speed and height, not on the launch angle.`,
      ],
    });
  }
  return lessons;
}

type Mech = MechanicsInputs;
const mechProj = (m: Mech, patch: Partial<Mech["projectile"]>): Mech | null => {
  const next = { ...m.projectile, ...patch };
  const v = validateProjectile(next);
  return v.ok ? { ...m, mode: "projectile", projectile: v.value, tNow: 0 } : null;
};
const measureOf = (pick: (s: MotionSummary) => number) => (m: Mech) => pick(summarize(mechanicsKinematics(m)));
const rangeOf = measureOf((s) => s.range ?? NaN);

export function mechanicsScenarios(m: Mech): PredictScenario<Mech>[] {
  if (m.mode !== "projectile") {
    const c = m.constant;
    const withC = (patch: Partial<Mech["constant"]>): Mech | null => {
      const v = validateConstantAccel({ ...c, ...patch });
      return v.ok ? { ...m, constant: v.value, tNow: 0 } : null;
    };
    const endVx = measureOf((s) => s.end.vx);
    const endX = measureOf((s) => s.end.dx);
    return [
      {
        id: "double-ax", change: "double the x acceleration", quantity: "the x velocity at the end of the motion",
        apply: (i) => withC({ ax: i.constant.ax * 2 }), measure: endVx, format: (v) => `${fmt(v)} m/s`,
        explain: (b, a) => `vₓ = vₓ₀ + aₓt: the gain over the starting ${fmt(c.vx0)} m/s doubles, so the end velocity goes from ${fmt(b)} to ${fmt(a)} m/s.`,
      },
      {
        id: "double-v0", change: "double the initial x velocity", quantity: "the x displacement during the motion",
        apply: (i) => withC({ vx0: i.constant.vx0 * 2 }), measure: endX, format: (v) => `${fmt(v)} m`,
        explain: () => "Displacement = v₀t + ½at². Doubling v₀ doubles the first term only, so the displacement rises but by less than a factor of two when there is also acceleration.",
      },
    ];
  }
  const p = m.projectile;
  return [
    {
      id: "speed-up", change: "increase the launch speed by 50 %", quantity: "the horizontal range",
      apply: (i) => mechProj(i, { speed: Math.min(i.projectile.speed * 1.5, 1000) }), measure: rangeOf, format: (v) => `${fmt(v)} m`,
      explain: (b, a) => `Both the time in the air and the horizontal speed grow with launch speed, so range rises from ${fmt(b)} to ${fmt(a)} m, faster than the speed itself (on level ground range goes as v²).`,
    },
    {
      id: "gravity-double", change: "double the gravitational acceleration", quantity: "the maximum height",
      apply: (i) => mechProj(i, { g: i.projectile.g * 2 }), measure: measureOf((s) => s.maxHeight), format: (v) => `${fmt(v)} m`,
      explain: (b, a) => `Stronger gravity removes the upward velocity sooner: the rise above the launch point is v_y₀²/2g, so it halves. Maximum height goes from ${fmt(b)} to ${fmt(a)} m.`,
    },
    {
      id: "gravity-time", change: "halve the gravitational acceleration", quantity: "the time of flight",
      apply: (i) => mechProj(i, { g: Math.max(i.projectile.g / 2, 0.1) }), measure: measureOf((s) => s.tFlight ?? NaN), format: (v) => `${fmt(v)} s`,
      explain: (b, a) => `Weaker gravity pulls the particle back more slowly, so it stays up longer: ${fmt(b)} s becomes ${fmt(a)} s (for a launch from the ground it is exactly twice as long).`,
    },
    {
      id: "height-up", change: "raise the launch height by 20 m", quantity: "the horizontal range",
      apply: (i) => mechProj(i, { y0: i.projectile.y0 + 20 }), measure: rangeOf, format: (v) => `${fmt(v)} m`,
      explain: (b, a) => `More height means a longer fall and therefore more time moving sideways at the same horizontal speed: range ${fmt(b)} → ${fmt(a)} m. The landing height is the ground, not the launch height.`,
    },
    {
      id: "angle-comp", change: `launch at ${fmt(90 - p.angleDeg)}° instead of ${fmt(p.angleDeg)}° (its complement)`, quantity: "the horizontal range",
      apply: (i) => mechProj(i, { angleDeg: 90 - i.projectile.angleDeg }), measure: rangeOf, format: (v) => `${fmt(v)} m`, relTol: 1e-3,
      explain: (b, a, t) => (t === "same"
        ? `On level ground θ and 90° − θ give the same range because sin 2θ = sin(180° − 2θ): ${fmt(b)} m both ways. The heights and flight times differ.`
        : `Complementary angles give equal ranges only when the launch and landing heights are equal. With a launch height of ${fmt(p.y0)} m they differ: ${fmt(b)} → ${fmt(a)} m.`),
    },
    {
      id: "angle-up", change: "increase the launch angle by 15°", quantity: "the maximum height",
      apply: (i) => mechProj(i, { angleDeg: Math.min(i.projectile.angleDeg + 15, 90) }), measure: measureOf((s) => s.maxHeight), format: (v) => `${fmt(v)} m`,
      explain: (b, a, t) => `The rise above the launch point is (v sin θ)²/2g. ${t === "same" ? "At 90° already there is nothing more to gain." : "A steeper launch puts more of the speed into the vertical direction, so the peak is higher"}: ${fmt(b)} → ${fmt(a)} m.`,
    },
  ];
}

// ---- circuits ----------------------------------------------------------------------------------------------------------------

export function circuitLessons(inputs: CircuitsInputs): Lesson[] {
  const a = analyzeCircuit(inputs.circuit);
  const sel = inputs.selected ? a.byId[inputs.selected] : null;
  const par = a.kclJunctions[0];
  const rs = a.resistors;
  const lessons: Lesson[] = [
    {
      id: "series",
      title: "Why is the current the same through series resistors?",
      body: [
        "Charge cannot pile up or disappear at a connection between two parts joined end to end, so the charge entering one resistor each second must be the charge leaving it into the next. That is conservation of charge (Kirchhoff's current law applied to the node between them).",
        `In this circuit the source current is ${formatSI(a.current, "A")}, and any resistor in series with the source carries exactly that.`,
      ],
    },
    {
      id: "parallel",
      title: "Why is the voltage the same across parallel branches?",
      body: par
        ? [
          "Every branch is connected between the same two junctions, so each branch has the same potential difference across it, the difference between those two points. An ideal wire has no voltage drop, so nothing can make the branches differ.",
          `Here the group has ${formatSI(a.byId[par.groupId].voltage, "V")} across every branch; the branches carry ${par.outflow.map((o) => `${formatSI(o.amps, "A")} (${o.label})`).join(" and ")}.`,
        ]
        : ["This network has no parallel group; add a resistor beside another to see two branches share one voltage."],
    },
    {
      id: "divide",
      title: "How does the current divide?",
      body: par
        ? [
          `At the top junction ${formatSI(par.inflow, "A")} arrives and splits. Each branch current is the shared voltage divided by that branch's resistance, I = V/R, so the smaller resistance takes the larger share: ${par.outflow.map((o) => `${o.label} takes ${fmt(100 * o.amps / par.inflow)} %`).join(", ")}.`,
          "Two branches R₁ and R₂ share a total current I as I₁ = I·R₂/(R₁ + R₂): the current divider rule.",
        ]
        : ["Current only divides at a parallel junction. Series parts all carry the full current."],
    },
    {
      id: "kirchhoff",
      title: "Why do Kirchhoff's laws express conservation?",
      body: [
        `Current law: the charge flowing into any junction equals the charge flowing out, conservation of charge. The largest violation computed here is ${fmt(a.kclResidual, 2)} A.`,
        `Voltage law: going once around any closed loop the potential changes sum to zero, because the electric potential energy per charge is a single-valued function (conservation of energy). Around each loop the source's ${fmt(a.voltage)} V equals the drops across the resistors; the largest mismatch is ${fmt(a.kvlResidual, 2)} V.`,
        `Power: the source delivers ${formatSI(a.power, "W")} and the resistors dissipate ${formatSI(rs.reduce((s, r) => s + r.power, 0), "W")}.`,
      ],
    },
  ];
  if (sel) {
    lessons.unshift({
      id: "selected",
      title: `Reading ${sel.label}`,
      body: [`${sel.label}: R = ${formatSI(sel.resistance, "Ω")}, V = ${formatSI(sel.voltage, "V")}, I = ${formatSI(sel.current, "A")}, P = ${formatSI(sel.power, "W")}. Ohm's law: ${formatSI(sel.current, "A")} × ${formatSI(sel.resistance, "Ω")} = ${formatSI(sel.current * sel.resistance, "V")}.`],
    });
  }
  return lessons;
}

type Circ = CircuitsInputs;
const withCircuit = (i: Circ, circuit: Circ["circuit"]): Circ | null => (circuit === i.circuit ? null : { ...i, circuit });

export function circuitScenarios(inputs: Circ): PredictScenario<Circ>[] {
  const rs = resistorsOf(inputs.circuit.root);
  const first = rs[0];
  const last = rs[rs.length - 1];
  const out: PredictScenario<Circ>[] = [
    {
      id: "v-double", change: "double the source voltage", quantity: "the total power dissipated",
      apply: (i) => (i.circuit.voltage * 2 <= 1000 ? { ...i, circuit: { ...i.circuit, voltage: i.circuit.voltage * 2 } } : null),
      measure: (i) => analyzeCircuit(i.circuit).power, format: (v) => formatSI(v, "W"),
      explain: (b, a) => `Doubling V doubles every current (Ohm's law), and P = VI, so power quadruples: ${formatSI(b, "W")} → ${formatSI(a, "W")}.`,
    },
    {
      id: "r-double-current", change: `double the resistance of ${first.label}`, quantity: "the total current from the source",
      apply: (i) => { const r = resistorsOf(i.circuit.root)[0]; return r.ohms * 2 <= 1e9 ? withCircuit(i, setResistance(i.circuit, r.id, r.ohms * 2)) : null; },
      measure: (i) => analyzeCircuit(i.circuit).current, format: (v) => formatSI(v, "A"),
      explain: (b, a, t) => `Adding resistance to any part raises the equivalent resistance, and with a fixed source voltage I = V/R_eq, so the current falls (${formatSI(b, "A")} → ${formatSI(a, "A")}${t === "same" ? "" : ""}).`,
    },
    {
      id: "r-double-other", change: `double the resistance of ${first.label}`, quantity: `the voltage across ${last.label}`,
      apply: (i) => { const r = resistorsOf(i.circuit.root)[0]; return r.ohms * 2 <= 1e9 ? withCircuit(i, setResistance(i.circuit, r.id, r.ohms * 2)) : null; },
      measure: (i) => { const a = analyzeCircuit(i.circuit); const l = resistorsOf(i.circuit.root).slice(-1)[0]; return a.byId[l.id].voltage; }, format: (v) => formatSI(v, "V"),
      explain: (b, a, t) => `The source voltage is fixed, so the voltages must still add up around every loop (KVL). Changing ${first.label} redistributes the drops: ${last.label} goes from ${formatSI(b, "V")} to ${formatSI(a, "V")} (${t}). ${first.id === last.id ? "" : `If ${first.label} and ${last.label} share a series path, more of the voltage goes to the larger resistance; if they are in parallel branches of an ideal source, ${last.label} is unaffected.`}`,
    },
    {
      id: "add-parallel", change: `add a resistor in parallel with ${last.label}`, quantity: "the total current from the source",
      apply: (i) => { const r = resistorsOf(i.circuit.root).slice(-1)[0]; return withCircuit(i, addResistor(i.circuit, r.id, "parallel", r.ohms)); },
      measure: (i) => analyzeCircuit(i.circuit).current, format: (v) => formatSI(v, "A"),
      explain: (b, a) => `A new parallel path gives the current one more way through, so the equivalent resistance falls and the source supplies more current: ${formatSI(b, "A")} → ${formatSI(a, "A")}.`,
    },
    {
      id: "add-series", change: `add a resistor in series with ${last.label}`, quantity: "the total current from the source",
      apply: (i) => { const r = resistorsOf(i.circuit.root).slice(-1)[0]; return withCircuit(i, addResistor(i.circuit, r.id, "series", r.ohms)); },
      measure: (i) => analyzeCircuit(i.circuit).current, format: (v) => formatSI(v, "A"),
      explain: (b, a) => `A resistor in series makes the single path harder to push current through, so the equivalent resistance rises and the current drops: ${formatSI(b, "A")} → ${formatSI(a, "A")}.`,
    },
  ];
  return out.filter((s) => s.apply(inputs) !== null);
}

// ---- RC ----------------------------------------------------------------------------------------------------------------------

export function rcLessons(inputs: RcInputs): Lesson[] {
  const p = inputs.rc;
  const s = rcSummarize(p);
  const tau = timeConstant(p);
  const now = rcStateAt(p, Math.min(Math.max(inputs.tNow, 0), 5 * tau));
  return [
    {
      id: "no-jump",
      title: "Why can't the capacitor voltage change instantly?",
      body: [
        "The voltage across a capacitor is v = q/C, set by the charge on its plates. Changing the charge takes current (i = dq/dt), and here the current is limited by the resistor to at most (Vs − v)/R, a finite value. Finite current means the charge, and so v, can only change gradually.",
        `So at t = 0 the capacitor is still at ${fmt(p.V0)} V and the resistor takes the whole difference: i(0) = (${fmt(p.Vs)} − ${fmt(p.V0)})/${formatSI(p.R, "Ω")} = ${formatSI(s.I0, "A")}. A jump would need infinite current, which an ideal finite resistance rules out.`,
      ],
    },
    {
      id: "tau",
      title: "What does the time constant mean?",
      body: [
        `τ = RC = ${formatSI(p.R, "Ω")} × ${formatSI(p.C, "F")} = ${formatSI(tau, "s")}. After one τ the capacitor has covered 63.2 % of the distance from its starting voltage to the final voltage; after 2τ, 86.5 %; after 5τ, 99.3 %.`,
        `Larger R limits the current and larger C needs more charge for the same voltage change; both slow the transient. At t = ${formatSI(now.t, "s")} (${fmt(now.t / tau)} τ) the capacitor has covered ${fmt(100 * now.progress)} % of the way.`,
      ],
    },
    {
      id: "current",
      title: "Why does the current change with time?",
      body: [
        `The current is set by the voltage still left across the resistor, vR = Vs − vC. At first vR is as large as it will ever be (${fmt(p.Vs - p.V0)} V), and as the capacitor charges toward Vs it shrinks, so the current falls exponentially, i = i₀e^(−t/τ). Now it is ${formatSI(now.i, "A")}.`,
        "At the end the capacitor voltage equals the source voltage, the resistor has no voltage across it and the current is zero.",
      ],
    },
    {
      id: "energy",
      title: "Where does the energy go?",
      body: [
        `The source supplies Vs·ΔQ = ${formatSI(s.sourceWork, "J")}. The capacitor's stored energy changes by ${formatSI(s.deltaU, "J")} and the resistor turns ${formatSI(s.resistorHeat, "J")} into heat, which adds up: ${formatSI(s.deltaU + s.resistorHeat, "J")}.`,
        p.V0 === 0 && p.Vs !== 0 ? "Charging from empty always wastes exactly half of the source energy as heat, however large or small R is: a smaller R gives a bigger current for a shorter time." : "",
      ].filter(Boolean),
    },
    {
      id: "limits",
      title: "Where does this model stop working?",
      body: ["It describes one resistor and one capacitor in one loop. With several capacitors, extra loops or an inductor the response has more than one time constant (or oscillates), and this single exponential is wrong."],
    },
  ];
}

type Rc = RcInputs;
const rcWith = (i: Rc, patch: Partial<Rc["rc"]>): Rc | null => {
  const v = validateRc({ ...i.rc, ...patch });
  return v.ok ? { ...i, rc: v.value, tNow: 0 } : null;
};
export function rcScenarios(inputs: Rc): PredictScenario<Rc>[] {
  const p = inputs.rc;
  const out: PredictScenario<Rc>[] = [
    {
      id: "r-double-tau", change: "double the resistance", quantity: "the time constant",
      apply: (i) => rcWith(i, { R: i.rc.R * 2 }), measure: (i) => timeConstant(i.rc), format: (v) => formatSI(v, "s"),
      explain: (b, a) => `τ = RC is proportional to R: ${formatSI(b, "s")} → ${formatSI(a, "s")}. The same voltage change takes twice as long.`,
    },
    {
      id: "r-double-i0", change: "double the resistance", quantity: "the initial current",
      apply: (i) => rcWith(i, { R: i.rc.R * 2 }), measure: (i) => rcSummarize(i.rc).I0, format: (v) => formatSI(v, "A"),
      explain: (b, a) => `At t = 0 the whole voltage difference is across R, so i₀ = ΔV/R, halved: ${formatSI(b, "A")} → ${formatSI(a, "A")}.`,
    },
    {
      id: "c-double-i0", change: "double the capacitance", quantity: "the initial current",
      apply: (i) => rcWith(i, { C: i.rc.C * 2 }), measure: (i) => rcSummarize(i.rc).I0, format: (v) => formatSI(v, "A"),
      explain: (b) => `The initial current depends only on the voltage difference and R, i₀ = ΔV/R = ${formatSI(b, "A")}; the capacitor does not change that first instant, only how long the current lasts.`,
    },
    {
      id: "c-double-tau", change: "double the capacitance", quantity: "the time to reach 63 % of the final change",
      apply: (i) => rcWith(i, { C: i.rc.C * 2 }), measure: (i) => timeConstant(i.rc), format: (v) => formatSI(v, "s"),
      explain: (b, a) => `A bigger capacitor needs more charge for the same voltage, which the same current supplies more slowly: ${formatSI(b, "s")} → ${formatSI(a, "s")}.`,
    },
    {
      id: "c-double-energy", change: "double the capacitance", quantity: "the energy stored when the capacitor has fully charged",
      apply: (i) => rcWith(i, { C: i.rc.C * 2 }), measure: (i) => rcSummarize(i.rc).Uinf, format: (v) => formatSI(v, "J"),
      explain: (b, a) => `Stored energy is ½CV² at the same final voltage, so it is proportional to C: ${formatSI(b, "J")} → ${formatSI(a, "J")}.`,
    },
    {
      id: "vs-double-final", change: "double the source voltage", quantity: "the final capacitor voltage",
      apply: (i) => rcWith(i, { Vs: i.rc.Vs * 2 }), measure: (i) => i.rc.Vs, format: (v) => `${fmt(v)} V`,
      explain: (b, a) => `The capacitor charges toward the source voltage: ${fmt(b)} V → ${fmt(a)} V.`,
    },
    {
      id: "vs-double-tau", change: "double the source voltage", quantity: "the time constant",
      apply: (i) => rcWith(i, { Vs: i.rc.Vs * 2 }), measure: (i) => timeConstant(i.rc), format: (v) => formatSI(v, "s"),
      explain: () => "τ = RC does not involve the voltage. A bigger voltage makes the transient bigger, not slower: the same fraction is covered in the same time.",
    },
    {
      id: "v0-raise", change: `start the capacitor at ${fmt((p.V0 + p.Vs) / 2)} V instead of ${fmt(p.V0)} V (halfway to the final value)`, quantity: "the initial current",
      apply: (i) => rcWith(i, { V0: (i.rc.V0 + i.rc.Vs) / 2 }), measure: (i) => Math.abs(rcSummarize(i.rc).I0), format: (v) => formatSI(v, "A"),
      explain: (b, a) => `With less voltage difference left, i₀ = |Vs − V0|/R is smaller: ${formatSI(b, "A")} → ${formatSI(a, "A")}.`,
    },
  ];
  return out.filter((s) => s.apply(inputs) !== null && !(p.Vs === 0 && s.id.startsWith("vs-")));
}
