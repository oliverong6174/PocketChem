/** Explanations and predict-then-observe scenarios for the kinetics tool. All numbers come from the same model the page plots. */
import { formatSig } from "./format";
import {
  analyzeArrhenius, concentrationAt, factorPer10K, halfLife, KIN_LIMITS, kUnits, ORDER_NAME, rateAt, successiveHalfLives, validateRateModel,
  type Order,
} from "./kinetics";
import type { PredictScenario } from "./predict";
import type { KineticsInputs } from "../persistence/generalChemTools";

export interface Lesson { id: string; title: string; body: string[] }
const f = (v: number, sig = 3) => formatSig(v, sig);

export const HALF_LIFE_RULE: Record<Order, string> = {
  0: "zero order: t½ = [A]₀ / 2k, proportional to the starting concentration, so each successive half-life is half as long",
  1: "first order: t½ = ln 2 / k, independent of the concentration, so every half-life is the same length",
  2: "second order: t½ = 1 / (k[A]₀), inversely proportional to the starting concentration, so each successive half-life is twice as long",
};

export function conceptLessons(inputs: KineticsInputs): Lesson[] {
  const m = inputs.model;
  const u = inputs.timeUnit;
  const steps = successiveHalfLives(m, 4);
  const arr = analyzeArrhenius(inputs.arrhenius);
  return [
    {
      id: "four-things",
      title: "Rate, rate constant, order and activation energy: what is the difference?",
      body: [
        `Rate is how fast [A] is being consumed right now: for this model it is ${f(rateAt(m, inputs.tNow))} mol L⁻¹ ${u}⁻¹ at t = ${f(inputs.tNow)} ${u}, and it changes as the reactant is used up.`,
        `The rate constant k = ${f(m.k)} ${kUnits(m.order, u)} is the proportionality in rate = k[A]${m.order === 1 ? "" : m.order === 0 ? "⁰" : "²"}. It does not change as the reaction proceeds, but it does depend on temperature, and its units depend on the order.`,
        `The order (${m.order} here) says how the rate scales with concentration. It is found by experiment, not read off the balanced equation.`,
        arr.ok
          ? `The activation energy (Ea = ${f(arr.EaKJ)} kJ/mol in the Arrhenius tab) says how steeply k rises with temperature: at ${inputs.arrhenius.T} K, +10 K multiplies k by ${f(arr.factor10)}.`
          : "The activation energy says how steeply k rises with temperature; set it in the Arrhenius tab.",
      ],
    },
    {
      id: "half-life",
      title: "Why does the half-life depend on the order?",
      body: [
        `For ${HALF_LIFE_RULE[m.order]}.`,
        `With your numbers the first four half-lives last ${steps.map((s) => `${f(s.duration)} ${u}`).join(", ")}.`,
        "Half-life that stays constant is the signature of first order; half-lives that lengthen as the reaction proceeds point to second order; half-lives that shorten point to zero order (the rate is constant, so a smaller amount is used up sooner).",
      ],
    },
    {
      id: "not-stoichiometry",
      title: "Why can't I read the order from the balanced equation?",
      body: [
        "The rate law reflects the mechanism, the sequence of elementary steps, and the balanced equation only gives the overall stoichiometry. A reaction written with coefficient 2 can be first order, and a one-reactant reaction can be zero order if a surface or catalyst is saturated.",
        "That is why this tool asks for the order (as an assumed teaching model) or fits it from concentration–time data. Only elementary steps have orders equal to their molecularity.",
      ],
    },
    {
      id: "linear",
      title: "What does the linearized plot tell me?",
      body: [
        m.order === 0 ? "For zero order [A] itself is linear in t, with slope −k." : m.order === 1 ? "For first order ln[A] is linear in t, with slope −k and intercept ln[A]₀." : "For second order 1/[A] is linear in t, with slope +k and intercept 1/[A]₀.",
        `Here the slope is ${f(m.order === 2 ? m.k : -m.k)}. A curved plot on the wrong axes means that order does not describe the data; the Fit data tab compares all three.`,
      ],
    },
    {
      id: "temperature",
      title: "How does temperature change the rate?",
      body: [
        "Raising the temperature increases k exponentially (Arrhenius: k = A·e^(−Ea/RT)); it does not change the order or the integrated-law shape, only k and therefore the time scale.",
        arr.ok ? `With Ea = ${f(arr.EaKJ)} kJ/mol, k at ${inputs.arrhenius.T} K is ${f(arr.kAtT)}; each additional 10 K multiplies it by about ${f(arr.factor10)}. The familiar "doubles every 10 K" is only a rough rule: it is ${f(factorPer10K(50, 298.15))} for Ea = 50 kJ/mol near 298 K and larger for larger Ea.` : "Enter a valid Arrhenius set-up to see the factor for your activation energy.",
      ],
    },
  ];
}

function withModel(i: KineticsInputs, patch: Partial<KineticsInputs["model"]>): KineticsInputs | null {
  const m = validateRateModel({ ...i.model, ...patch });
  return m.ok ? { ...i, model: m.value, tNow: 0 } : null;
}

export function kineticsScenarios(inputs: KineticsInputs): PredictScenario<KineticsInputs>[] {
  const out: PredictScenario<KineticsInputs>[] = [
    {
      id: "c0-halflife",
      change: "double the starting concentration",
      quantity: "the half-life",
      apply: (i) => withModel(i, { c0: i.model.c0 * 2 }),
      measure: (i) => halfLife(i.model),
      format: (v) => `${f(v)} ${inputs.timeUnit}`,
      explain: (b, a) => `For ${HALF_LIFE_RULE[inputs.model.order]}. The half-life went ${f(b)} → ${f(a)} ${inputs.timeUnit} (×${f(a / b)}).`,
    },
    {
      id: "c0-rate",
      change: "double the starting concentration",
      quantity: "the initial rate",
      apply: (i) => withModel(i, { c0: i.model.c0 * 2 }),
      measure: (i) => rateAt(i.model, 0),
      format: (v) => `${f(v)} mol L⁻¹ ${inputs.timeUnit}⁻¹`,
      explain: (b, a) => `rate = k[A]^${inputs.model.order}, so doubling [A] multiplies the rate by 2^${inputs.model.order} = ${2 ** inputs.model.order}. Here ${f(b)} → ${f(a)}.`,
    },
    {
      id: "k-halflife",
      change: "double the rate constant",
      quantity: "the half-life",
      apply: (i) => withModel(i, { k: i.model.k * 2 }),
      measure: (i) => halfLife(i.model),
      format: (v) => `${f(v)} ${inputs.timeUnit}`,
      explain: (b, a) => `In every order t½ is inversely proportional to k, so doubling k halves it: ${f(b)} → ${f(a)} ${inputs.timeUnit}.`,
    },
    {
      id: "remaining",
      change: "wait twice as long (double the time shown)",
      quantity: "the concentration remaining",
      apply: (i) => (i.tNow > 0 ? { ...i, tNow: i.tNow * 2 } : null),
      measure: (i) => concentrationAt(i.model, i.tNow),
      format: (v) => `${f(v)} mol/L`,
      explain: (b, a) => `${ORDER_NAME[inputs.model.order]} decay: [A] falls from ${f(b)} to ${f(a)} mol/L. Doubling the time does not simply halve the concentration unless the time equals a half-life.`,
    },
  ];
  const arr = analyzeArrhenius(inputs.arrhenius);
  if (arr.ok) {
    out.push({
      id: "T-plus-10",
      change: "raise the temperature by 10 K (Arrhenius tab)",
      quantity: "the rate constant k",
      apply: (i) => (i.arrhenius.T + 10 <= KIN_LIMITS.maxT ? { ...i, arrhenius: { ...i.arrhenius, T: i.arrhenius.T + 10 } } : null),
      measure: (i) => { const a = analyzeArrhenius(i.arrhenius); return a.ok ? a.kAtT : Number.NaN; },
      format: (v) => f(v),
      explain: (b, a) => `With Ea = ${f(arr.EaKJ)} kJ/mol, k is multiplied by exp[(Ea/R)(1/T − 1/(T+10))] = ${f(a / b)}.`,
    });
  }
  return out;
}
