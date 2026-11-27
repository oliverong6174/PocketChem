/**
 * Explanations for the equilibrium tool. Every sentence quotes numbers from the same model the page uses, so the text can
 * never disagree with the calculation. Nothing here is static textbook prose except the short definitions.
 */
import {
  applyDisturbance, deltaNu, kExpressionText, predictDirection, reactionText,
  type Direction, type Disturbance, type DisturbanceOutcome, type EquilibriumResult, type EquilibriumSystem,
} from "./equilibrium";
import { formatSig } from "./format";

export interface Lesson { id: string; title: string; body: string[] }
export interface GuidedStep { title: string; lines: string[] }

const f = (v: number) => formatSig(v, 3);
const side = (d: Direction) => (d === "forward" ? "to the right (toward products)" : d === "reverse" ? "to the left (toward reactants)" : "nowhere");

export function directionSentence(direction: Direction, Q: number | null, K: number): string {
  if (direction === "none") return Q === null ? "Nothing can react in either direction with these starting amounts." : `Q equals K (${f(K)}), so the mixture is already at equilibrium and nothing changes.`;
  const qText = Q === null ? "Q is 0 or undefined because a species on one side is absent" : `Q₀ = ${f(Q)}, K = ${f(K)}`;
  return direction === "forward"
    ? `${qText}: Q < K, so there is too little product for equilibrium and the net reaction goes ${side(direction)}.`
    : `${qText}: Q > K, so there is too much product for equilibrium and the net reaction goes ${side(direction)}.`;
}

/** The ICE-table solution written as the steps a student would follow, with this system's numbers. */
export function guidedSolution(system: EquilibriumSystem, r: EquilibriumResult): GuidedStep[] {
  const steps: GuidedStep[] = [
    { title: "1. Write the reaction and K", lines: [reactionText(system), `${kExpressionText(system)} = ${f(system.K)}`] },
    { title: "2. Compare Q with K", lines: [directionSentence(r.direction, r.Q0, system.K)] },
  ];
  if (r.direction === "none") return steps;
  const fwd = r.direction === "forward";
  const x = fwd ? r.xi : -r.xi;
  const term = (c0: number, coeff: number, plus: boolean) => `(${f(c0)} ${plus ? "+" : "−"} ${coeff === 1 ? "" : coeff}x)`;
  const pow = (t: string, n: number) => (n === 1 ? t : `${t}^${n}`);
  const reactantTerms = system.reactants.map((s) => pow(term(s.c0, s.coeff, !fwd), s.coeff));
  const productTerms = system.products.map((s) => pow(term(s.c0, s.coeff, fwd), s.coeff));
  steps.push(
    {
      title: "3. Set up the ICE table",
      lines: [
        `Let x be the progress (mol/L of reaction events) in the ${fwd ? "forward" : "reverse"} direction. Each species changes by its coefficient times x: reactants ${fwd ? "−" : "+"}, products ${fwd ? "+" : "−"}.`,
        "Initial + Change = Equilibrium, species by species (see the table).",
      ],
    },
    { title: "4. Put the equilibrium amounts into K", lines: [`${f(system.K)} = ${productTerms.join(" × ")} / ${reactantTerms.join(" × ")}`] },
    {
      title: "5. Solve for x",
      lines: [
        `x must keep every concentration ≥ 0, so x lies between 0 and ${f(fwd ? r.xiMax : -r.xiMin)}.`,
        `On that interval the right-hand side rises steadily from ${fwd ? "below" : "above"} K to ${fwd ? "infinity" : "zero"}, so there is exactly one physical root: x = ${f(x)} mol/L. (The tool finds it by bisection; any other algebraic root would give a negative concentration and is discarded.)`,
      ],
    },
    {
      title: "6. Check the answer",
      lines: [
        `Q at the answer = ${f(r.Qeq)}; K = ${f(system.K)}.`,
        `Mass balance: each species equals its starting value ∓ coefficient × x, so atoms are conserved. All concentrations are non-negative.`,
      ],
    },
  );
  return steps;
}

export function conceptLessons(system: EquilibriumSystem, r: EquilibriumResult): Lesson[] {
  const dn = deltaNu(system);
  const eq = [...system.reactants.map((s, i) => `[${s.name}] = ${f(r.reactants[i])}`), ...system.products.map((s, i) => `[${s.name}] = ${f(r.products[i])}`)].join(", ");
  return [
    {
      id: "q-vs-k",
      title: "What is the difference between Q and K?",
      body: [
        "Q and K have the same form (products over reactants, each raised to its coefficient). Q is evaluated with the concentrations present at any moment; K is the value Q takes at equilibrium, and at a given temperature it is a constant.",
        directionSentence(r.direction, r.Q0, system.K),
        `At the equilibrium found here, ${eq}, so Q = ${f(r.Qeq)}, equal to K.`,
      ],
    },
    {
      id: "dynamic",
      title: "What does 'dynamic equilibrium' mean?",
      body: [
        "Equilibrium does not mean the reaction has stopped. Forward and reverse changes both continue and happen at equal net rates, so the concentrations stay constant.",
        "This tool shows only the concentrations, which stop changing; it does not model the molecular rates. Equal rates do not mean equal concentrations: here the concentrations differ greatly because K is " + f(system.K) + ".",
      ],
    },
    {
      id: "ice",
      title: "How does an ICE table work?",
      body: [
        "I (initial) lists what you start with. C (change) records that every species moves by its coefficient times one unknown x, because the balanced equation fixes the ratios. E (equilibrium) is I + C.",
        `Substituting the E row into K leaves one equation in x. Here x = ${f(Math.abs(r.xi))} mol/L, and each species changes by its coefficient times that: the Change row of the table.`,
      ],
    },
    {
      id: "k-constant",
      title: "Why does a shift not change K?",
      body: [
        "When you add or remove a species or change the volume, Q moves away from K and the mixture reacts until Q = K again. K itself is set by temperature alone, so it is unchanged by these disturbances.",
        `Try it in the Disturb tab: K stays ${f(system.K)} before and after every change. A change in temperature is different, because it changes K itself; this tool does not model that since it would need ΔH° (see the Thermodynamics tool for K from ΔG°).`,
      ],
    },
    {
      id: "volume",
      title: "When does volume matter?",
      body: [
        dn === 0
          ? "The number of moles of gas is the same on both sides (Δν = 0), so changing the volume scales numerator and denominator of Q equally. Q stays equal to K: no shift."
          : `Δν = ${dn > 0 ? "+" : ""}${dn} (products minus reactants). Changing the volume by a factor f multiplies Q by f^(−Δν). ${dn > 0 ? "Expanding (f > 1) lowers Q below K, so the reaction goes toward products (more moles); compressing does the opposite." : "Expanding (f > 1) raises Q above K, so the reaction goes toward reactants (more moles); compressing does the opposite."}`,
        "This relies on ideal gases (or ideal dilute solutions, where changing volume means diluting).",
      ],
    },
  ];
}

/** Starting mixtures with Q = K/10, K, 10K built from the system's reactants, for the "which way does it go?" practice. */
export interface DirectionExample { id: string; label: string; reactants: number[]; products: number[]; direction: Direction; Q: number }
export function directionExamples(system: EquilibriumSystem): DirectionExample[] {
  const r = system.reactants.map(() => 0.1);
  const lnDen = system.reactants.reduce((a, s, i) => a + s.coeff * Math.log(r[i]), 0);
  const nu = system.products.reduce((a, s) => a + s.coeff, 0);
  return [0.1, 1, 10].map((mult, idx) => {
    const lnTarget = Math.log(system.K * mult) + lnDen; // ln(∏p^ν) = ln(Qt) + ln(∏r^ν)
    const p = Math.exp(lnTarget / nu);
    const products = system.products.map(() => p);
    const Q = Math.exp(system.products.reduce((a, s, i) => a + s.coeff * Math.log(products[i]), 0) - lnDen);
    const dir = predictDirection(system, { reactants: r, products }).direction;
    return { id: `q${idx}`, label: mult === 1 ? "Q = K" : mult === 0.1 ? "Q = K ÷ 10" : "Q = 10 × K", reactants: r, products, direction: dir, Q };
  });
}

// ---- disturbance text -----------------------------------------------------------------------------------------------------------

export function disturbanceLabel(system: EquilibriumSystem, d: Disturbance): string {
  if (d.kind === "volume") return d.factor > 1 ? `expand the volume ×${f(d.factor)}` : `compress the volume to ${f(d.factor)} of its value`;
  if (d.kind === "inert") return "add an inert gas at constant volume";
  const sp = (d.side === "reactants" ? system.reactants : system.products)[d.index];
  return `${d.kind === "add" ? "add" : "remove"} ${f(d.amount)} mol/L of ${sp?.name ?? "a species"}`;
}

export function shiftExplanation(system: EquilibriumSystem, o: DisturbanceOutcome): string[] {
  const lines: string[] = [o.note];
  lines.push(
    o.QImmediate === null
      ? `Immediately afterwards Q is 0 or undefined because a species is absent, while K = ${f(system.K)}.`
      : `Immediately afterwards Q = ${f(o.QImmediate)} while K = ${f(system.K)} (unchanged).`,
  );
  lines.push(
    o.shift === "none"
      ? "Q still equals K, so there is no shift: concentrations do not change."
      : `${o.shift === "forward" ? "Q < K" : "Q > K"}, so the net reaction goes ${side(o.shift)} until Q = K again. Le Châtelier's principle states this qualitatively (the system partly counteracts the change); the Q-versus-K comparison is what the calculation uses.`,
  );
  if (o.shift !== "none") {
    lines.push(`At the new equilibrium Q = ${f(o.after.Qeq)} = K. The system does not return to its old concentrations; it settles at new ones with the same K.`);
  }
  return lines;
}

export interface ShiftScenario { id: string; label: string; disturbance: Disturbance; answer: Direction; outcome: DisturbanceOutcome }

/** Disturbances for the practice mode, each solved by the model so the answer is never hand-written. */
export function shiftScenarios(system: EquilibriumSystem, eq: { reactants: number[]; products: number[] }): ShiftScenario[] {
  const candidates: Disturbance[] = [];
  const r0 = eq.reactants[0];
  const p0 = eq.products[0];
  if (r0 > 0) candidates.push({ kind: "add", side: "reactants", index: 0, amount: Math.max(r0 * 0.5, 1e-6) });
  if (p0 > 0) candidates.push({ kind: "remove", side: "products", index: 0, amount: p0 * 0.5 });
  candidates.push({ kind: "add", side: "products", index: 0, amount: Math.max(p0 * 0.5, 1e-6) });
  candidates.push({ kind: "volume", factor: 2 }, { kind: "volume", factor: 0.5 }, { kind: "inert" });
  const out: ShiftScenario[] = [];
  for (const d of candidates) {
    const o = applyDisturbance(system, eq, d);
    if (o.ok) out.push({ id: `${d.kind}-${out.length}`, label: disturbanceLabel(system, d), disturbance: d, answer: o.shift, outcome: o });
  }
  return out;
}

