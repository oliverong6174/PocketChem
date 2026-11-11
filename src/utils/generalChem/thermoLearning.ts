/** Explanations and predict-then-observe scenarios for the thermodynamics tool. Numbers come from the model the page uses. */
import { formatSig } from "./format";
import type { PredictScenario } from "./predict";
import {
  analyzeCalorimetry, analyzeGibbs, enthalpyAt, entropyAt, gibbsAt, lnKAt, solveHess, THERMO_LIMITS,
  type CalorimetryInput, type GibbsAnalysis, type GibbsCase, type GibbsInput,
} from "./thermo";
import type { ThermoInputs } from "../persistence/generalChemTools";

export interface Lesson { id: string; title: string; body: string[] }
const f = (v: number, sig = 3) => formatSig(v, sig);
const log10K = (g: GibbsInput) => lnKAt(g, g.T) / Math.LN10;

export const CASE_ROWS: Array<{ id: GibbsCase; dH: string; dS: string; result: string }> = [
  { id: "always", dH: "negative (exothermic)", dS: "positive", result: "ΔG° < 0 at every temperature: favourable throughout" },
  { id: "low-T", dH: "negative (exothermic)", dS: "negative", result: "ΔG° < 0 below T* = ΔH/ΔS, > 0 above it: favourable at low temperature" },
  { id: "high-T", dH: "positive (endothermic)", dS: "positive", result: "ΔG° > 0 below T*, < 0 above it: favourable at high temperature" },
  { id: "never", dH: "positive (endothermic)", dS: "negative", result: "ΔG° > 0 at every temperature: never favourable" },
];

export function gibbsExplanation(g: GibbsInput, a: GibbsAnalysis): string[] {
  const dH = a.dHT;
  const tds = (g.T * a.dST) / 1000;
  const out = [
    `At ${f(g.T, 4)} K: ΔH° = ${f(dH)} kJ/mol and TΔS° = ${f(tds)} kJ/mol, so ΔG° = ΔH° − TΔS° = ${f(dH)} − (${f(tds)}) = ${f(a.dGT)} kJ/mol.`,
    a.dGT < 0
      ? `ΔG° < 0: the reaction is exergonic under standard conditions; at equilibrium products are favoured (K = ${f(a.K)}).`
      : a.dGT > 0
        ? `ΔG° > 0: the reaction is endergonic under standard conditions; at equilibrium reactants are favoured (K = ${f(a.K)}).`
        : "ΔG° = 0: reactants and products are at equilibrium under standard conditions (K = 1).",
  ];
  if (g.dCp === 0) {
    if (a.case === "always") out.push("ΔH is negative and ΔS positive, so both terms favour reaction at any temperature: no crossover temperature exists.");
    else if (a.case === "never") out.push("ΔH is positive and ΔS negative, so both terms oppose reaction at any temperature: no crossover temperature exists.");
    else if (a.closedFormCrossover !== null) {
      out.push(`The two terms balance at T* = ΔH/ΔS = ${f(a.closedFormCrossover, 4)} K${a.crossovers.length ? "" : " (outside the plotted range)"}. ${a.case === "low-T" ? "Below T* the enthalpy term wins; above it the entropy term wins and the reaction is no longer favourable." : "Below T* the enthalpy cost wins; above it the entropy gain wins and the reaction becomes favourable."}`);
    }
  } else if (a.crossovers.length) {
    out.push(`With ΔCp = ${f(g.dCp)} J/(mol·K), ΔG° = 0 at ${a.crossovers.map((t) => `${f(t, 4)} K`).join(" and ")} in the plotted range (found numerically).`);
  } else out.push("ΔG° does not change sign in the plotted range.");
  if (a.dGnon !== null && g.Q !== null) out.push(`Nonstandard: ΔG = ΔG° + RT ln Q = ${f(a.dGT)} + ${f((8.314462618 * g.T * Math.log(g.Q)) / 1000)} = ${f(a.dGnon)} kJ/mol for Q = ${f(g.Q)}. ΔG < 0 means the reaction proceeds forward from that mixture; ΔG° alone does not tell you that unless Q = 1.`);
  return out;
}

export function conceptLessons(inputs: ThermoInputs): Lesson[] {
  const g = inputs.gibbs;
  const a = analyzeGibbs(g);
  return [
    {
      id: "temperature",
      title: "Why can a reaction become favourable or unfavourable as temperature changes?",
      body: [
        "ΔG° = ΔH° − TΔS° has two terms. The enthalpy term does not depend on T (when ΔCp = 0), but the entropy term TΔS° grows in proportion to T, so its influence grows with temperature.",
        `For your numbers, at ${f(g.T, 4)} K the entropy term TΔS° is ${f((g.T * a.dST) / 1000)} kJ/mol against ΔH° = ${f(a.dHT)} kJ/mol. ${a.case === "low-T" || a.case === "high-T" ? `The two balance at ${a.closedFormCrossover !== null ? f(a.closedFormCrossover, 4) : "—"} K.` : a.case === "always" ? "Both terms favour reaction, so temperature cannot reverse the sign." : a.case === "never" ? "Both terms oppose reaction, so temperature cannot reverse the sign." : ""}`,
        "Physically: a reaction that increases disorder (ΔS > 0) is helped by heating; one that decreases disorder is hurt by it, and an exothermic reaction is helped by cooling.",
      ],
    },
    {
      id: "kinetics",
      title: "Does ΔG < 0 mean the reaction is fast?",
      body: [
        "No. ΔG° tells you which side is favoured at equilibrium; it says nothing about the rate. Rate depends on the activation barrier (kinetics), which a thermodynamic quantity does not contain.",
        "A classic example: diamond → graphite has ΔG° ≈ −2.9 kJ/mol (thermodynamically favoured at room temperature), yet diamonds persist for geological times because the barrier is enormous.",
        "Conversely a favourable reaction can be made faster with a catalyst or by heating without changing ΔG° at that temperature. The Reaction kinetics tool covers the rate side.",
      ],
    },
    {
      id: "standard",
      title: "Standard versus nonstandard: ΔG° and ΔG",
      body: [
        "ΔG° refers to every species at its standard state (for example 1 bar for gases and 1 mol/L for solutes) at the stated temperature. ΔG = ΔG° + RT ln Q describes the actual mixture, with reaction quotient Q.",
        `At equilibrium ΔG = 0 and Q = K, which gives ΔG° = −RT ln K. For your ΔG° of ${f(a.dGT)} kJ/mol at ${f(g.T, 4)} K, K = ${f(a.K)}. Tick "nonstandard Q" to see ΔG change with the mixture.`,
      ],
    },
    {
      id: "terms",
      title: "Exothermic, endothermic, exergonic, endergonic",
      body: [
        "Exothermic and endothermic describe the sign of ΔH (heat released or absorbed at constant pressure). Exergonic and endergonic describe the sign of ΔG (favourable or unfavourable).",
        "They are independent: an endothermic reaction can be exergonic at high temperature if ΔS is large and positive, and an exothermic reaction can be endergonic at high temperature if ΔS is negative.",
      ],
    },
    {
      id: "assumption",
      title: "How far can ΔH° and ΔS° be treated as constant?",
      body: [
        "ΔH° and ΔS° themselves change with temperature through the heat-capacity change ΔCp: ΔH°(T) = ΔH°(T₀) + ΔCp(T − T₀), ΔS°(T) = ΔS°(T₀) + ΔCp ln(T/T₀). For many reactions ΔCp is small, so the constants work well within a few hundred kelvin of T₀.",
        "They fail across a phase change of any reactant or product, because ΔH and ΔS then jump by the enthalpy and entropy of the transition. Enter ΔCp if you know it; the graph then uses the equations above.",
      ],
    },
  ];
}

export function hessLessons(inputs: ThermoInputs): Lesson[] {
  const r = solveHess(inputs.hess);
  return [
    {
      id: "state",
      title: "Why does Hess's law work?",
      body: [
        "Enthalpy is a state function: ΔH depends only on the initial and final states, not the path. So the ΔH of a target reaction equals the sum of the ΔH of any steps that add up to it.",
        "Rules: reversing an equation reverses the sign of its ΔH; multiplying an equation multiplies its ΔH by the same factor; adding equations adds the ΔH values. Species that appear on both sides cancel.",
      ],
    },
    {
      id: "worked",
      title: "Your target, step by step",
      body: r.ok
        ? [...r.lines.map((l) => `Equation ${l.index} (ΔH = ${f(l.dH, 4)} kJ): ${l.description}; contributes ${f(l.contribution, 4)} kJ.`), `Sum: ΔH = ${f(r.total, 4)} kJ.`]
        : [`The current set cannot be combined: ${r.error}`],
    },
  ];
}

export function calorimetryLessons(c: CalorimetryInput): Lesson[] {
  const r = analyzeCalorimetry(c);
  return [
    {
      id: "balance",
      title: "The energy balance",
      body: [
        "Heat gained by one part of the isolated system equals heat lost by another: Σq = 0. For a reaction in a calorimeter, q(reaction) = −[q(solution) + q(calorimeter)].",
        "q = m·c·ΔT for a sample of mass m and specific heat c; q = C·ΔT for a calorimeter with heat capacity C. A positive q means the object gained heat.",
        c.mode === "reaction"
          ? `Here the solution warmed, so the reaction released heat: q(reaction) is ${r.value < 0 ? "negative" : "positive"} (${r.classification}); ΔH = ${f(r.value)} kJ per mole of limiting reagent.`
          : `Result: ${r.headline[0]?.label ?? ""} = ${r.headline[0]?.value ?? ""}.`,
      ],
    },
    {
      id: "limits",
      title: "Why are calorimetry results usually approximate?",
      body: ["Real calorimeters lose some heat to the surroundings, the specific heat of a solution is not exactly that of water, and small temperature changes have large relative uncertainty. The tool assumes none of these; it states the idealisation instead of hiding it."],
    },
  ];
}

// ---- predict, then observe -------------------------------------------------------------------------------------------------------------

function gibbsWith(i: ThermoInputs, patch: Partial<GibbsInput>): ThermoInputs | null {
  const g = { ...i.gibbs, ...patch };
  if (g.T < THERMO_LIMITS.minT || g.T > THERMO_LIMITS.maxT) return null;
  return { ...i, gibbs: g };
}

export function thermoScenarios(inputs: ThermoInputs): Array<PredictScenario<ThermoInputs>> {
  if (inputs.view === "gibbs") {
    const g = inputs.gibbs;
    return [
      {
        id: "T-up",
        change: "raise the temperature by 100 K",
        quantity: "ΔG°",
        apply: (i) => gibbsWith(i, { T: i.gibbs.T + 100 }),
        measure: (i) => gibbsAt(i.gibbs, i.gibbs.T),
        format: (v) => `${f(v)} kJ/mol`,
        absTol: 0.005,
        explain: (b, a) => `dΔG°/dT = −ΔS° = ${f(-entropyAt(g, g.T))} J/(mol·K), so ${g.dS > 0 ? "a positive ΔS° makes ΔG° more negative on heating" : g.dS < 0 ? "a negative ΔS° makes ΔG° less negative on heating" : "ΔS° ≈ 0 leaves ΔG° unchanged"}: ${f(b)} → ${f(a)} kJ/mol.`,
      },
      {
        id: "K-up",
        change: "raise the temperature by 100 K",
        quantity: "log₁₀ K",
        apply: (i) => gibbsWith(i, { T: i.gibbs.T + 100 }),
        measure: (i) => log10K(i.gibbs),
        format: (v) => f(v),
        absTol: 0.005,
        explain: (b, a) => `K rises with temperature for an endothermic reaction and falls for an exothermic one (van 't Hoff). Here ΔH° = ${f(enthalpyAt(g, g.T))} kJ/mol: log₁₀K ${f(b)} → ${f(a)}.`,
      },
      {
        id: "dS-up",
        change: "make ΔS° 50 J/(mol·K) more positive",
        quantity: "ΔG°",
        apply: (i) => gibbsWith(i, { dS: i.gibbs.dS + 50 }),
        measure: (i) => gibbsAt(i.gibbs, i.gibbs.T),
        format: (v) => `${f(v)} kJ/mol`,
        absTol: 0.005,
        explain: (b, a) => `ΔG° changes by −TΔ(ΔS°) = −${f(g.T, 4)} K × 0.050 kJ/(mol·K) = ${f(-g.T * 0.05)} kJ/mol: ${f(b)} → ${f(a)}.`,
      },
      {
        id: "dH-down",
        change: "make ΔH° 20 kJ/mol more negative",
        quantity: "ΔG°",
        apply: (i) => gibbsWith(i, { dH: i.gibbs.dH - 20 }),
        measure: (i) => gibbsAt(i.gibbs, i.gibbs.T),
        format: (v) => `${f(v)} kJ/mol`,
        absTol: 0.005,
        explain: (b, a) => `ΔG° = ΔH° − TΔS°, so a 20 kJ/mol lower ΔH° lowers ΔG° by exactly 20 kJ/mol: ${f(b)} → ${f(a)}.`,
      },
    ];
  }
  if (inputs.view === "calorimetry" && inputs.calorimetry.mode === "reaction") {
    const base = analyzeCalorimetry(inputs.calorimetry);
    const r = inputs.calorimetry.reaction;
    const qRxn = (base.value * 1000) * r.moles; // J, sign as reaction
    const withRxn = (i: ThermoInputs, patch: Partial<CalorimetryInput["reaction"]>, moleScale = 1): ThermoInputs | null => {
      const rx = { ...i.calorimetry.reaction, ...patch };
      const heat = -qRxn * moleScale; // heat absorbed by solution+calorimeter
      const dT = heat / (rx.massG * rx.cJgK + rx.ccalJK);
      return { ...i, calorimetry: { ...i.calorimetry, reaction: { ...rx, Tf: rx.Ti + dT, moles: r.moles * moleScale } } };
    };
    return [
      {
        id: "mass-x2",
        change: "use twice as much solution (same amount of reaction)",
        quantity: "the temperature rise",
        apply: (i) => withRxn(i, { massG: i.calorimetry.reaction.massG * 2 }),
        measure: (i) => i.calorimetry.reaction.Tf - i.calorimetry.reaction.Ti,
        format: (v) => `${f(v)} K`,
        explain: (b, a) => `The same heat is shared among more mass: ΔT = q/(mc + C_cal), ${f(b)} → ${f(a)} K. ΔH per mole is unchanged (the same reaction).`,
      },
      {
        id: "moles-x2",
        change: "react twice as many moles in the same solution",
        quantity: "the temperature rise",
        apply: (i) => withRxn(i, {}, 2),
        measure: (i) => i.calorimetry.reaction.Tf - i.calorimetry.reaction.Ti,
        format: (v) => `${f(v)} K`,
        explain: (b, a) => `Twice the moles release twice the heat into the same heat capacity: ΔT doubles, ${f(b)} → ${f(a)} K. ΔH per mole stays ${f(base.value)} kJ/mol.`,
      },
    ];
  }
  if (inputs.view === "calorimetry" && inputs.calorimetry.mode === "mixing") {
    return [
      {
        id: "m1-x2",
        change: "double the mass of the first (sample 1) sample",
        quantity: "the final temperature",
        apply: (i) => ({ ...i, calorimetry: { ...i.calorimetry, mixing: { ...i.calorimetry.mixing, m1: i.calorimetry.mixing.m1 * 2 } } }),
        measure: (i) => analyzeCalorimetry(i.calorimetry).value,
        format: (v) => `${f(v)} °C`,
        explain: (b, a) => `T_f is the heat-capacity-weighted average of the two starting temperatures; more of sample 1 pulls it toward T₁: ${f(b)} → ${f(a)} °C.`,
      },
    ];
  }
  return [];
}
