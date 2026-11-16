/**
 * Learning content and saved-result summaries of the Stage 22 tools (pure). Explore lessons quote the model's own numbers for the learner's
 * current setup; Practice questions and Challenge scenarios are answered by the same models the pages use, and the tests compare every answer
 * with an independent hand calculation. Nothing here predicts which reaction occurs: reactions are supplied by the learner or curated.
 */
import { balanceEquation, parseEquation } from "./balance";
import { prettyFormula, molarMass } from "./formula";
import {
  GAS_PROCESSES, R_GAS, ZERO_C_IN_K, calculateIdeal, gasDensityGperL, gasMolarMass, processInfo, rmsSpeed, runProcess, solveKinetic, solveMixture,
  type GasState,
} from "./gas";
import {
  FARADAY, buildGalvanicCell, halfReaction, polarity, reactionText, solveElectrolysis, electrolysisCase, variableSpecies, type CellResult,
} from "./electrochem";
import { percentYield, resolveReaction, solveDilution, solveStoichiometry, type ReactionModel, type StoichResult } from "./stoichiometry";
import { formatSig } from "./format";
import {
  DEFAULT_ELECTRO_INPUTS, ELECTROCHEM_ENGINE_VERSION, GASLAWS_ENGINE_VERSION, STOICHIOMETRY_ENGINE_VERSION,
  type ElectroInputs, type GasInputs, type StoichInputs,
} from "../persistence/gcTools22";
import type { ToolResults } from "../persistence/generalChemTools";
import type { PredictScenario } from "./predict";

const g = (v: number, sig = 4) => formatSig(v, sig);

// ---- shared types -------------------------------------------------------------------------------------------------------------------------

export interface Lesson { id: string; title: string; body: string[] }
export type Question<I> = {
  id: string;
  title: string;
  prompt: string;
  /** Puts the tool into the state the question is about (it replaces only the fields the question needs). */
  setup: (cur: I) => I;
  explain: (answer: number) => string;
} & (
  | { kind: "number"; unit: string; relTol: number; answer: () => number }
  | { kind: "choice"; options: () => string[]; answer: () => number }
);

// ---- stoichiometry ------------------------------------------------------------------------------------------------------------------------

export const STOICH_ASSUMPTIONS = [
  "You supply the reaction. Balancing makes a given equation obey conservation of atoms and charge; it does not predict that the reaction occurs, or that these are the products.",
  "Theoretical yield assumes the reaction goes to completion in the stated ratio, with no side reactions. Actual yields are measurements and are usually lower; a percent yield above 100 % points to a measurement, purity or reporting problem, not to a chemical result.",
  "Atomic masses are conventional values with 4 to 5 significant figures (see the data note); molar masses ignore isotopic composition and electron mass.",
  "Solution calculations treat volumes as additive and reactions as complete: no equilibrium, no activity effects. For weak acids and bases or partial reactions use the Acid–base and Equilibrium tools.",
  "Dilution only adds solvent: moles of solute do not change. Mixing reactive solutions changes the amounts (the reaction extent) and is a different calculation.",
  "The particle picture is a schematic count of particles, not a molecular-scale simulation.",
];

export const formatReaction = (r: ReactionModel, pretty = true): string => {
  const side = (list: ReactionModel["reactants"]) => list.map((s) => `${s.coeff === 1 ? "" : `${s.coeff} `}${pretty ? prettyFormula(s.text) : s.text}`).join(" + ");
  return `${side(r.reactants)} ${pretty ? "→" : "->"} ${side(r.products)}`;
};

export function stoichState(i: StoichInputs): { rxn: ReactionModel; result: StoichResult } | null {
  const rxn = resolveReaction(i.equation);
  if (!rxn.ok) return null;
  const out = solveStoichiometry(rxn.value, i.amounts);
  return out.ok ? { rxn: rxn.value, result: out.value } : null;
}

export function summarizeStoich(i: StoichInputs): ToolResults | null {
  const s = stoichState(i);
  if (!s) return null;
  const lim = s.result.limiting.map((k) => s.rxn.reactants[k].text);
  const headline = [
    `Balanced: ${formatReaction(s.rxn)}`,
    s.result.extent === 0 ? "Nothing reacts: a reactant is absent" : s.result.exact ? "All reactants are used up together (a stoichiometric mixture)" : `Limiting reactant: ${lim.map(prettyFormula).join(", ")}`,
    `Reaction extent ${g(s.result.extent)} mol`,
    ...s.result.ledger.filter((r) => r.role === "product").map((r) => `Theoretical ${prettyFormula(r.text)}: ${g(r.finalMol)} mol = ${g(r.finalG)} g`),
  ].slice(0, 12);
  return { engineVersion: STOICHIOMETRY_ENGINE_VERSION, headline, assumptions: STOICH_ASSUMPTIONS.slice(0, 5), check: s.result.extent, checkLabel: "reaction extent (mol)" };
}

export function stoichLessons(i: StoichInputs): Lesson[] {
  const s = stoichState(i);
  if (!s) return [];
  const { rxn, result } = s;
  const first = rxn.reactants[0]; const prod = rxn.products[0];
  const lim = result.limiting.map((k) => rxn.reactants[k]);
  const out: Lesson[] = [
    {
      id: "ratio", title: "What do the coefficients tell me?",
      body: [
        `In ${formatReaction(rxn)} the coefficients are mole ratios: ${first.coeff} mol of ${prettyFormula(first.text)} goes with ${prod.coeff} mol of ${prettyFormula(prod.text)}, so 1 mol of ${prettyFormula(first.text)} gives ${g(prod.coeff / first.coeff)} mol of ${prettyFormula(prod.text)}.`,
        `They are not mass ratios. ${first.coeff} mol of ${prettyFormula(first.text)} is ${g(first.coeff * first.mass)} g (molar mass ${g(first.mass)} g/mol) and ${prod.coeff} mol of ${prettyFormula(prod.text)} is ${g(prod.coeff * prod.mass)} g.`,
      ],
    },
    {
      id: "limiting", title: result.exact ? "Why do all the reactants run out together?" : "Why does one reactant limit the reaction?",
      body: result.extent === 0 ? ["A reactant is present at 0 mol, so the reaction extent is 0: nothing can form."] : [
        `Each reactant allows a reaction extent of (moles ÷ coefficient): ${result.ledger.filter((r) => r.role === "reactant").map((r) => `${prettyFormula(r.text)} ${g(r.capacity as number)} mol`).join(", ")}.`,
        result.exact ? "They are equal, so the amounts are in exactly the ratio of the equation and nothing is left over." : `The smallest is ${g(result.extent)} mol, set by ${lim.map((l) => prettyFormula(l.text)).join(" and ")}. The reaction stops when it is used up, and the other reactants are left over: ${result.ledger.filter((r) => r.excess).map((r) => `${g(r.finalMol)} mol ${prettyFormula(r.text)}`).join(", ") || "none"}.`,
        "Products are never limited one by one: a single reaction extent sets every product at once.",
      ],
    },
    {
      id: "ceiling", title: "Why is theoretical yield a ceiling?",
      body: [
        `At extent ${g(result.extent)} mol the model forms ${g(prod.coeff * result.extent)} mol (${g(prod.coeff * result.extent * prod.mass)} g) of ${prettyFormula(prod.text)}. That is the most the reaction could give if it went to completion with no losses.`,
        "A measured mass is an observation. Percent yield = actual ÷ theoretical × 100; it is normally below 100 % because of incomplete reaction, side reactions and recovery losses. A value above 100 % is not a chemical result: suspect wet product, impurities or a calculation or measurement error.",
      ],
    },
  ];
  const parsed = parseEquation(i.equation);
  if (parsed.ok) {
    const el = Object.keys(parsed.value.reactants[0].parsed.counts)[0];
    if (el) {
      const left = parsed.value.reactants.reduce((sum, sp, k) => sum + (sp.parsed.counts[el] ?? 0) * rxn.reactants[k].coeff, 0);
      const right = parsed.value.products.reduce((sum, sp, k) => sum + (sp.parsed.counts[el] ?? 0) * rxn.products[k].coeff, 0);
      out.push({ id: "conserve", title: "How do I know the equation is balanced?", body: [`Count ${el}: ${left} atoms on the left and ${right} on the right. The same holds for every element, and for charge when ions are present. Balancing only changes coefficients, never the formulas: changing a subscript would change the substance.`] });
    }
  }
  return out;
}

const withEq = (equation: string, amounts: StoichInputs["amounts"], extra: Partial<StoichInputs> = {}) => (cur: StoichInputs): StoichInputs => ({ ...cur, equation, amounts, manual: [], yieldProduct: 0, ...extra });
const mol = (value: number) => ({ mode: "mol" as const, value, purity: 100, M: 1, mL: 100 });
const gr = (value: number, purity = 100) => ({ mode: "g" as const, value, purity, M: 1, mL: 100 });
const sol = (M: number, mL: number) => ({ mode: "soln" as const, value: 0, purity: 100, M, mL });
const solved = (equation: string, amounts: StoichInputs["amounts"]) => { const r = resolveReaction(equation); if (!r.ok) throw new Error(r.error); const o = solveStoichiometry(r.value, amounts); if (!o.ok) throw new Error(o.error); return { rxn: r.value, result: o.value }; };
const coeffOf = (equation: string, formula: string) => { const b = balanceEquation((parseEquation(equation) as { ok: true; value: Parameters<typeof balanceEquation>[0] }).value); if (!b.ok) throw new Error(b.error); const eq = (parseEquation(equation) as { ok: true; value: { reactants: Array<{ text: string }>; products: Array<{ text: string }> } }).value; return b.coefficients[[...eq.reactants, ...eq.products].findIndex((s) => s.text === formula)]; };

export const STOICH_PRACTICE: Question<StoichInputs>[] = [
  { id: "bal-fe", title: "Balance iron oxidation", kind: "number", unit: "", relTol: 0, prompt: "Balance Fe + O2 → Fe2O3 in the smallest whole numbers. What is the coefficient of O2?", setup: (c) => ({ ...c, view: "balance", equation: "Fe + O2 -> Fe2O3", manual: [] }), answer: () => coeffOf("Fe + O2 -> Fe2O3", "O2"), explain: () => "Fe + O2 → Fe2O3 needs 2 Fe and 3 O atoms in Fe2O3; the smallest whole numbers that balance both are 4 Fe + 3 O2 → 2 Fe2O3." },
  { id: "bal-propane", title: "Balance propane combustion", kind: "number", unit: "", relTol: 0, prompt: "Balance C3H8 + O2 → CO2 + H2O. How many O2 per C3H8?", setup: (c) => ({ ...c, view: "balance", equation: "C3H8 + O2 -> CO2 + H2O", manual: [] }), answer: () => coeffOf("C3H8 + O2 -> CO2 + H2O", "O2"), explain: () => "3 CO2 and 4 H2O contain 6 + 4 = 10 O atoms, so 5 O2: C3H8 + 5 O2 → 3 CO2 + 4 H2O." },
  { id: "mass-h2o", title: "Mass of product", kind: "number", unit: "g", relTol: 0.005, prompt: "How many grams of H2O form from 4.000 g H2 with plenty of O2? (2 H2 + O2 → 2 H2O)", setup: withEq("H2 + O2 -> H2O", [gr(4), gr(1000)]), answer: () => solved("H2 + O2 -> H2O", [gr(4), gr(1000)]).result.ledger[2].finalG, explain: () => "4.000 g ÷ 2.016 g/mol = 1.984 mol H2, which gives 1.984 mol H2O (ratio 1:1) × 18.015 g/mol = 35.74 g." },
  { id: "mol-nh3", title: "Limiting reagent in moles", kind: "number", unit: "mol", relTol: 0.001, prompt: "N2 + 3 H2 → 2 NH3. From 3.00 mol N2 and 6.00 mol H2, how many mol NH3 can form?", setup: withEq("N2 + H2 -> NH3", [mol(3), mol(6)]), answer: () => solved("N2 + H2 -> NH3", [mol(3), mol(6)]).result.ledger[2].finalMol, explain: () => "N2 would allow an extent of 3.00 mol, H2 only 6.00 ÷ 3 = 2.00 mol. H2 limits, so 2 × 2.00 = 4.00 mol NH3." },
  { id: "pct-yield", title: "Percent yield", kind: "number", unit: "%", relTol: 0.005, prompt: "Heating 25.0 g CaCO3 gives 12.0 g CaO (CaCO3 → CaO + CO2). What is the percent yield?", setup: (c) => ({ ...withEq("CaCO3 -> CaO + CO2", [gr(25)])(c), view: "limiting", actualOn: true, actualG: 12, yieldProduct: 0 }), answer: () => { const s = solved("CaCO3 -> CaO + CO2", [gr(25)]); return (percentYield(s.result, 0, 12) as { percent: number }).percent; }, explain: () => "25.0 g ÷ 100.09 g/mol = 0.2498 mol CaCO3 → 0.2498 mol CaO × 56.077 g/mol = 14.01 g theoretical. 12.0 ÷ 14.01 × 100 = 85.7 %." },
  { id: "molarity", title: "Molarity of a solution", kind: "number", unit: "mol/L", relTol: 0.005, prompt: "5.85 g of NaCl is dissolved to make 250 mL of solution. What is its molarity?", setup: (c) => ({ ...c, view: "solution" }), answer: () => (5.85 / (molarMass("NaCl") as number)) / 0.25, explain: () => "5.85 g ÷ 58.44 g/mol = 0.1001 mol; 0.1001 mol ÷ 0.250 L = 0.400 mol/L." },
  { id: "dilution", title: "Dilution", kind: "number", unit: "mol/L", relTol: 0.001, prompt: "25.0 mL of 12.0 M stock is diluted to 500 mL. What is the final molarity?", setup: (c) => ({ ...c, view: "solution", dilution: { unknown: "M2", M1: 12, V1: 25, M2: 0, V2: 500 } }), answer: () => { const r = solveDilution({ unknown: "M2", M1: 12, V1: 25, M2: 0, V2: 500 }); return r.ok ? r.value : NaN; }, explain: () => "The solute does not change: 12.0 M × 25.0 mL = M2 × 500 mL, so M2 = 0.600 M." },
];

const limitingChoice = (id: string, title: string, equation: string, amounts: StoichInputs["amounts"], prompt: string): Question<StoichInputs> => ({
  id, title, kind: "choice", prompt, setup: withEq(equation, amounts, { view: "limiting" }),
  options: () => { const s = solved(equation, amounts); return [...s.rxn.reactants.map((r) => prettyFormula(r.text)), "They run out together"]; },
  answer: () => { const s = solved(equation, amounts); return s.result.exact ? s.rxn.reactants.length : s.result.limiting[0]; },
  explain: () => { const s = solved(equation, amounts); return s.result.exact ? `Each reactant allows the same extent (${g(s.result.extent)} mol), so they are used up together.` : `Extent allowed by each reactant (moles ÷ coefficient): ${s.result.ledger.filter((r) => r.role === "reactant").map((r) => `${prettyFormula(r.text)} ${g(r.capacity as number)} mol`).join(", ")}. The smallest, ${g(s.result.extent)} mol, belongs to ${prettyFormula(s.rxn.reactants[s.result.limiting[0]].text)}.`; },
});
export const STOICH_CHALLENGE: Question<StoichInputs>[] = [
  limitingChoice("lim-alcl3", "Aluminium and chlorine", "Al + Cl2 -> AlCl3", [gr(5), gr(10)], "Look at the amounts loaded in the tool (5.00 g Al, 10.0 g Cl2; 2 Al + 3 Cl2 → 2 AlCl3). Which reactant limits? Decide before you open the ledger."),
  limitingChoice("lim-haber", "Ammonia synthesis", "N2 + H2 -> NH3", [mol(4), mol(6)], "4.00 mol N2 and 6.00 mol H2 (N2 + 3 H2 → 2 NH3). Which reactant limits?"),
  limitingChoice("lim-mg", "Magnesium in acid", "Mg + HCl -> MgCl2 + H2", [gr(2), sol(0.5, 100)], "2.00 g of Mg meets 100 mL of 0.500 M HCl (Mg + 2 HCl → MgCl2 + H2). Which reactant limits?"),
  limitingChoice("lim-exact", "A balanced mixture", "H2 + O2 -> H2O", [mol(2), mol(1)], "2.00 mol H2 and 1.00 mol O2 (2 H2 + O2 → 2 H2O). Which reactant limits?"),
  { id: "max-alcl3", title: "Maximum aluminium chloride", kind: "number", unit: "g", relTol: 0.01, prompt: "With 5.00 g Al and 10.0 g Cl2 (2 Al + 3 Cl2 → 2 AlCl3), what is the maximum mass of AlCl3? Predict, then compare with the ledger.", setup: withEq("Al + Cl2 -> AlCl3", [gr(5), gr(10)], { view: "limiting" }), answer: () => solved("Al + Cl2 -> AlCl3", [gr(5), gr(10)]).result.ledger[2].finalG, explain: () => "Cl2: 10.0 g ÷ 70.90 g/mol = 0.1410 mol, ÷ 3 = 0.04701 extent (Al allows 0.0927). The extent is 0.04701, so 2 × 0.04701 = 0.09403 mol AlCl3 × 133.33 g/mol = 12.5 g." },
  { id: "max-nh3", title: "Maximum ammonia from a mixture", kind: "number", unit: "mol", relTol: 0.001, prompt: "4.00 mol N2 and 6.00 mol H2 (N2 + 3 H2 → 2 NH3): the maximum amount of NH3?", setup: withEq("N2 + H2 -> NH3", [mol(4), mol(6)], { view: "limiting" }), answer: () => solved("N2 + H2 -> NH3", [mol(4), mol(6)]).result.ledger[2].finalMol, explain: () => "H2 allows 6.00 ÷ 3 = 2.00 mol of extent and N2 allows 4.00. The extent is 2.00, giving 2 × 2.00 = 4.00 mol NH3, with 2.00 mol N2 left over." },
];

// ---- gas laws ----------------------------------------------------------------------------------------------------------------------------

export const GAS_ASSUMPTIONS = [
  "An ideal gas: point-like molecules with no attractions. Real gases deviate near condensation and at high pressure; the model does not warn about condensation.",
  "Temperatures are converted to kelvin before every calculation, and must stay above 0 K. The ideal gas constant is R = 8.314 462 618 J/(mol·K).",
  "Each experiment fixes some variables and changes one; the others follow from PV = nRT. The graphs show that constrained process, not any path between two states.",
  "The moving particles are a schematic: a few animated dots coloured and sped up qualitatively with temperature, not a statistical simulation.",
  "Mixtures are ideal: Dalton's law holds exactly and the gases do not react.",
  "Kinetic theory counts translational energy only: (3/2)kT per molecule for every gas. The Maxwell–Boltzmann curve is the ideal classical distribution, not measured data.",
];

export function gasContainer(i: GasInputs) { const r = runProcess(i.container); return r.ok ? r : null; }

const gasLawNote = (p: (typeof GAS_PROCESSES)[number]["id"], s1: GasState, s2: GasState): string => {
  if (p === "isothermal") return `P × V stays ${g(s1.P * s1.V)} J: P went from ${g(s1.P / 1000)} to ${g(s2.P / 1000)} kPa while V went from ${g(s1.V * 1000)} to ${g(s2.V * 1000)} L.`;
  if (p === "isochoric") return `P ÷ T stays ${g(s1.P / s1.T)} Pa/K: P went from ${g(s1.P / 1000)} to ${g(s2.P / 1000)} kPa as T went from ${g(s1.T)} to ${g(s2.T)} K.`;
  if (p === "isobaric") return `V ÷ T stays ${g((s1.V * 1000) / s1.T)} L/K: V went from ${g(s1.V * 1000)} to ${g(s2.V * 1000)} L as T went from ${g(s1.T)} to ${g(s2.T)} K.`;
  if (p === "amountP") return `V ÷ n stays ${g((s1.V * 1000) / s1.n)} L/mol: V went from ${g(s1.V * 1000)} to ${g(s2.V * 1000)} L as n went from ${g(s1.n)} to ${g(s2.n)} mol.`;
  return `P ÷ n stays ${g(s1.P / s1.n / 1000)} kPa/mol: P went from ${g(s1.P / 1000)} to ${g(s2.P / 1000)} kPa as n went from ${g(s1.n)} to ${g(s2.n)} mol.`;
};

export function summarizeGas(i: GasInputs): ToolResults | null {
  if (i.view === "container") {
    const r = gasContainer(i); if (!r) return null; const info = processInfo(i.container.process);
    return { engineVersion: GASLAWS_ENGINE_VERSION, headline: [info.label, info.law, gasLawNote(i.container.process, r.s1, r.s2), `Held fixed: ${info.held.join(", ")}`].slice(0, 6), assumptions: GAS_ASSUMPTIONS.slice(0, 4), check: r.s2.P, checkLabel: "final pressure (Pa)" };
  }
  if (i.view === "calculator") {
    const r = calculateIdeal(i.calc); if (!r.ok) return null;
    return { engineVersion: GASLAWS_ENGINE_VERSION, headline: [`PV = nRT solved for ${i.calc.unknown}`, `P ${g(r.state.P / 1000)} kPa, V ${g(r.state.V * 1000)} L, n ${g(r.state.n)} mol, T ${g(r.state.T)} K`], assumptions: GAS_ASSUMPTIONS.slice(0, 2), check: r.state.P, checkLabel: "pressure (Pa)" };
  }
  if (i.view === "mixture") {
    const m = solveMixture(i.mixture); if (!m.ok) return null;
    return { engineVersion: GASLAWS_ENGINE_VERSION, headline: [`Total pressure ${g(m.totalPa / 1000)} kPa`, ...m.rows.map((r) => `${prettyFormula(r.formula)}: x = ${g(r.x)}, partial pressure ${g(r.partialPa / 1000)} kPa`)].slice(0, 8), assumptions: [GAS_ASSUMPTIONS[4], GAS_ASSUMPTIONS[0]], check: m.totalPa, checkLabel: "total pressure (Pa)" };
  }
  const k = solveKinetic(i.kinetic); if (!k.ok) return null;
  return { engineVersion: GASLAWS_ENGINE_VERSION, headline: k.rows.map((r) => `${prettyFormula(r.formula)} at ${g(r.T)} K: rms speed ${g(r.vrms)} m/s, mean kinetic energy ${g(r.keKJperMol)} kJ/mol`), assumptions: [GAS_ASSUMPTIONS[5], GAS_ASSUMPTIONS[0]], check: k.rows[0].vrms, checkLabel: "rms speed of gas A (m/s)" };
}

export function gasLessons(i: GasInputs): Lesson[] {
  if (i.view === "container") {
    const r = gasContainer(i); if (!r) return [];
    const info = processInfo(i.container.process);
    const T25 = 25 + ZERO_C_IN_K; const T50 = 50 + ZERO_C_IN_K;
    return [
      { id: "law", title: `What law does this experiment show? (${info.law})`, body: [`You hold ${info.held.join(" and ")} fixed and change ${info.controlled === "V" ? "the volume" : info.controlled === "T" ? "the temperature" : "the amount of gas"}; ${info.dependent === "P" ? "the pressure" : "the volume"} follows from PV = nRT.`, gasLawNote(i.container.process, r.s1, r.s2)] },
      { id: "kelvin", title: "Why must temperature be in kelvin?", body: [`Gas volume or pressure is proportional to the ABSOLUTE temperature. Warming from 25 °C to 50 °C is not a doubling: it multiplies T by ${g(T50 / T25)} (from ${g(T25)} K to ${g(T50)} K), so the pressure at fixed volume rises by only ${g((T50 / T25 - 1) * 100, 3)} %. Using Celsius directly would predict 100 %.`] },
      { id: "particles", title: "What do the particles do?", body: [`Higher temperature means faster molecules: the rms speed of N₂ is ${g(rmsSpeed(r.s1.T, 28.014))} m/s at ${g(r.s1.T)} K and ${g(rmsSpeed(r.s2.T, 28.014))} m/s at ${g(r.s2.T)} K. Pressure comes from many collisions with the walls; compressing the gas makes collisions more frequent. The dots are a schematic, not a simulation.`] },
    ];
  }
  if (i.view === "calculator") {
    const r = calculateIdeal(i.calc); if (!r.ok) return [];
    return [
      { id: "stp", title: "Is there one 'molar volume'?", body: [`No. One mole occupies RT/P: ${g((R_GAS * 273.15 / 101325) * 1000)} L at 0 °C and 1 atm, but ${g((R_GAS * 298.15 / 101325) * 1000)} L at 25 °C and 1 atm. Always state the pressure and temperature.`] },
      { id: "units", title: "Which units go into R?", body: [`With R = 8.314 J/(mol·K) the pressure must be in Pa, the volume in m³ and the temperature in K. This tool converts your units first: here P = ${g(r.state.P)} Pa, V = ${g(r.state.V, 5)} m³, T = ${g(r.state.T)} K.`] },
    ];
  }
  if (i.view === "mixture") {
    const m = solveMixture(i.mixture); if (!m.ok) return [];
    return [
      { id: "dalton", title: "What is Dalton's law?", body: [`Each gas in an ideal mixture behaves as if it were alone: its partial pressure is n_i RT/V, which equals x_i P_total. Here the partial pressures ${m.rows.map((r) => `${prettyFormula(r.formula)} ${g(r.partialPa / 1000)} kPa`).join(" + ")} add to ${g(m.totalPa / 1000)} kPa.`, "Adding an unreactive gas at fixed volume and temperature raises the total pressure but leaves every other gas's partial pressure unchanged."] },
      { id: "real", title: "What does the model leave out?", body: ["Real gases attract each other and have a size, and gases may react or dissolve. This is an ideal-gas teaching model, not a prediction for real mixtures at high pressure or low temperature."] },
    ];
  }
  const k = solveKinetic(i.kinetic); if (!k.ok) return [];
  const [a, b] = k.rows;
  return [
    { id: "ke", title: "Why do different gases have different speeds at the same temperature?", body: [`At the same T every molecule has the same mean translational kinetic energy, (3/2)kT = ${g(a.keJ)} J. Since E = ½mv², a lighter molecule must move faster: rms speed ${g(a.vrms)} m/s for ${prettyFormula(a.formula)} (M = ${g(a.M)} g/mol) against ${g(b.vrms)} m/s for ${prettyFormula(b.formula)} (M = ${g(b.M)} g/mol).`] },
    { id: "mb", title: "What does the curve show?", body: ["The Maxwell–Boltzmann distribution gives the fraction of molecules per unit speed in an ideal classical gas. It is a model, not measured data. The peak is the most probable speed, the mean is a little higher and the rms speed is higher still, because fast molecules count more in v²."] },
  ];
}

export const GAS_PRACTICE: Question<GasInputs>[] = [
  { id: "boyle", title: "Boyle's law", kind: "number", unit: "atm", relTol: 0.001, prompt: "A gas at 1.00 atm is compressed from 4.00 L to 1.00 L at constant temperature. What is the final pressure?", setup: (c) => ({ ...c, view: "calculator" }), answer: () => (1 * 4) / 1, explain: () => "At constant T and n, PV is constant: P2 = P1V1/V2 = 1.00 × 4.00 ÷ 1.00 = 4.00 atm." },
  { id: "charles", title: "Charles's law", kind: "number", unit: "L", relTol: 0.001, prompt: "2.00 L of gas at constant pressure is heated from 300 K to 450 K. What is the final volume?", setup: (c) => ({ ...c, view: "calculator" }), answer: () => (2 * 450) / 300, explain: () => "V/T is constant at fixed P and n: V2 = 2.00 × 450 ÷ 300 = 3.00 L." },
  { id: "gaylussac", title: "Gay-Lussac's law", kind: "number", unit: "atm", relTol: 0.001, prompt: "A rigid container holds gas at 2.00 atm and 300 K. It is heated to 400 K. What is the pressure?", setup: (c) => ({ ...c, view: "calculator" }), answer: () => (2 * 400) / 300, explain: () => "P/T is constant at fixed V and n: P2 = 2.00 × 400 ÷ 300 = 2.67 atm." },
  { id: "moles", title: "Amount from PV = nRT", kind: "number", unit: "mol", relTol: 0.005, prompt: "How many moles of gas are in 5.00 L at 2.00 atm and 27 °C?", setup: (c) => ({ ...c, view: "calculator", calc: { unknown: "n", P: { v: 2, u: "atm" }, V: { v: 5, u: "L" }, n: 0, T: { v: 27, u: "C" } } }), answer: () => { const r = calculateIdeal({ unknown: "n", P: { v: 2, u: "atm" }, V: { v: 5, u: "L" }, n: 0, T: { v: 27, u: "C" } }); return r.ok ? r.unknownValue : NaN; }, explain: () => "T = 27 + 273.15 = 300.15 K. n = PV/RT = (202 650 Pa × 0.00500 m³) ÷ (8.3145 × 300.15) = 0.406 mol." },
  { id: "dalton", title: "Partial pressure", kind: "number", unit: "atm", relTol: 0.001, prompt: "A mixture of 2.00 mol N2 and 1.00 mol O2 has a total pressure of 3.00 atm. What is the partial pressure of N2?", setup: (c) => ({ ...c, view: "mixture" }), answer: () => (2 / 3) * 3, explain: () => "x(N2) = 2.00 ÷ 3.00 = 0.667, so P(N2) = 0.667 × 3.00 atm = 2.00 atm." },
  { id: "density", title: "Gas density", kind: "number", unit: "g/L", relTol: 0.005, prompt: "What is the density of CO2 at 25 °C and 1.00 atm?", setup: (c) => ({ ...c, view: "calculator" }), answer: () => gasDensityGperL(101325, 298.15, gasMolarMass("CO2") as number), explain: () => "ρ = PM/RT = 101 325 Pa × 44.009 g/mol ÷ (8.3145 × 298.15) ÷ 1000 = 1.80 g/L." },
  { id: "vrms", title: "Molecular speed", kind: "number", unit: "m/s", relTol: 0.01, prompt: "What is the rms speed of N2 molecules at 25 °C?", setup: (c) => ({ ...c, view: "kinetic" }), answer: () => rmsSpeed(298.15, gasMolarMass("N2") as number), explain: () => "v = √(3RT/M) = √(3 × 8.3145 × 298.15 ÷ 0.028014) = 515 m/s." },
  { id: "stp", title: "Molar volume at 0 °C", kind: "number", unit: "L", relTol: 0.002, prompt: "What volume does 1.00 mol of ideal gas occupy at 0 °C and 1.00 atm?", setup: (c) => ({ ...c, view: "calculator" }), answer: () => (R_GAS * 273.15 / 101325) * 1000, explain: () => "V = nRT/P = 8.3145 × 273.15 ÷ 101 325 = 0.02241 m³ = 22.4 L. At 25 °C the same mole takes 24.5 L: there is no universal molar volume." },
];

/** A container scenario applies only to the matching experiment (it changes that experiment's final value); otherwise it is not applicable. */
const onlyIn = (process: GasInputs["container"]["process"], target: (c: GasInputs["container"]) => number) => (c: GasInputs): GasInputs | null => {
  if (c.container.process !== process) return null;
  const container = { ...c.container, target: target(c.container) };
  return runProcess(container).ok ? { ...c, view: c.view, container } : null;
};
const finalOf = (c: GasInputs, pick: (s: GasState) => number): number => { const r = runProcess(c.container); return r.ok ? pick(r.s2) : NaN; };
export const GAS_SCENARIOS: Array<PredictScenario<GasInputs>> = [
  { id: "compress-more", change: "compress the gas further, to half of its current final volume (isothermal experiment)", quantity: "the final pressure", apply: onlyIn("isothermal", (c) => c.target / 2), measure: (c) => finalOf(c, (s) => s.P / 1000), format: (v) => `${g(v)} kPa`, explain: (b, a) => `Boyle's law: PV is constant at fixed T and n, so halving V doubles P (${g(b)} → ${g(a)} kPa).` },
  { id: "expand", change: "let the gas expand to twice its current final volume (isothermal experiment)", quantity: "the final pressure", apply: onlyIn("isothermal", (c) => c.target * 2), measure: (c) => finalOf(c, (s) => s.P / 1000), format: (v) => `${g(v)} kPa`, explain: (b, a) => `With the same molecules in twice the volume, there are half as many wall collisions per area: P falls from ${g(b)} to ${g(a)} kPa.` },
  { id: "heat-rigid", change: "heat the gas a further 50 °C in the rigid container (isochoric experiment)", quantity: "the final pressure", apply: onlyIn("isochoric", (c) => c.target + 50), measure: (c) => finalOf(c, (s) => s.P / 1000), format: (v) => `${g(v)} kPa`, explain: (b, a) => `Gay-Lussac's law: P ∝ T in kelvin. The rise of 50 K is a fraction of the current absolute temperature, so P rises by ${g((a / b - 1) * 100, 3)} % (${g(b)} → ${g(a)} kPa).` },
  { id: "double-celsius", change: "double the final Celsius temperature in the rigid container (isochoric experiment)", quantity: "the final pressure", apply: onlyIn("isochoric", (c) => c.target * 2), measure: (c) => finalOf(c, (s) => s.P / 1000), format: (v) => `${g(v)} kPa`, explain: (b, a) => `Pressure follows the kelvin temperature, and doubling the Celsius number does not double T: P changes by a factor of ${g(a / b)} here, not 2.` },
  { id: "heat-free", change: "heat the gas a further 50 °C with a free piston (isobaric experiment)", quantity: "the final volume", apply: onlyIn("isobaric", (c) => c.target + 50), measure: (c) => finalOf(c, (s) => s.V * 1000), format: (v) => `${g(v)} L`, explain: (b, a) => `Charles's law: V ∝ T in kelvin at constant P and n. The gas expands from ${g(b)} to ${g(a)} L.` },
  { id: "add-gas-p", change: "double the final amount of gas at constant pressure and temperature", quantity: "the final volume", apply: onlyIn("amountP", (c) => c.target * 2), measure: (c) => finalOf(c, (s) => s.V * 1000), format: (v) => `${g(v)} L`, explain: (b, a) => `Avogadro's law: V ∝ n at fixed P and T, so doubling n doubles V (${g(b)} → ${g(a)} L).` },
  { id: "add-gas-v", change: "double the final amount of gas in the rigid container at constant temperature", quantity: "the final pressure", apply: onlyIn("amountV", (c) => c.target * 2), measure: (c) => finalOf(c, (s) => s.P / 1000), format: (v) => `${g(v)} kPa`, explain: (b, a) => `P ∝ n at fixed V and T: twice the molecules hit the walls (${g(b)} → ${g(a)} kPa).` },
  { id: "inert-partial", change: "add 0.10 mol of argon to the mixture at fixed volume and temperature", quantity: "the partial pressure of nitrogen", apply: (c) => { if (c.mixture.components.some((x) => x.formula === "Ar")) { const components = c.mixture.components.map((x) => (x.formula === "Ar" ? { ...x, mol: x.mol + 0.1 } : x)); const mixture = { ...c.mixture, components }; return solveMixture(mixture).ok ? { ...c, view: "mixture", mixture } : null; } if (c.mixture.components.length >= 5) return null; const mixture = { ...c.mixture, components: [...c.mixture.components, { formula: "Ar", mol: 0.1 }] }; return solveMixture(mixture).ok ? { ...c, view: "mixture", mixture } : null; }, measure: (c) => { const m = solveMixture(c.mixture); if (!m.ok) return NaN; return (m.rows.find((r) => r.formula === "N2")?.partialPa ?? NaN) / 1000; }, format: (v) => `${g(v)} kPa`, absTol: 1e-9, explain: () => "Dalton's law: each gas contributes n_i RT/V and does not feel the others. The argon raises the total pressure but not nitrogen's partial pressure." },
  { id: "light-gas-speed", change: "replace the heavier gas by hydrogen at the same temperature", quantity: "the rms speed of gas B", apply: (c) => { const kinetic = { ...c.kinetic, b: "H2" }; return solveKinetic(kinetic).ok && c.kinetic.b !== "H2" ? { ...c, view: "kinetic", kinetic } : null; }, measure: (c) => { const k = solveKinetic(c.kinetic); return k.ok ? k.rows[1].vrms : NaN; }, format: (v) => `${g(v)} m/s`, explain: (b, a) => `Same temperature, same mean kinetic energy, so the lighter molecule is faster: ${g(b)} → ${g(a)} m/s.` },
  { id: "same-ke", change: "swap gas A for a gas of different mass at the same temperature", quantity: "the mean kinetic energy per molecule of gas A", apply: (c) => { const kinetic = { ...c.kinetic, a: c.kinetic.a === "He" ? "CO2" : "He" }; return solveKinetic(kinetic).ok ? { ...c, view: "kinetic", kinetic } : null; }, measure: (c) => { const k = solveKinetic(c.kinetic); return k.ok ? k.rows[0].keJ * 1e21 : NaN; }, format: (v) => `${g(v)} zJ`, explain: (b) => `The mean translational kinetic energy is (3/2)kT = ${g(b)} zJ for every ideal gas at that temperature; only the speed depends on the mass.` },
];

// ---- electrochemistry ----------------------------------------------------------------------------------------------------------------------

export const ELECTRO_ASSUMPTIONS = [
  "Standard reduction potentials (25 °C, 1 mol/L, 1 bar, versus the standard hydrogen electrode) are transcribed reference values with an uncertainty of about ±0.005 V; they were not re-checked against the source tables in this session.",
  "E°cell = E°cathode − E°anode. Potentials are intensive, so they are never multiplied by stoichiometric coefficients when half-reactions are combined; the reactions are scaled instead so the electrons balance.",
  "Concentrations stand in for activities (ideal solutions); gases enter as pressures in bar, solids and liquids have activity 1. E° is not corrected for temperature.",
  "The cell potential is an equilibrium (thermodynamic) quantity. It says nothing about reaction rate, polarisation, internal resistance, current or power.",
  "Electrons travel through the external wire, never through the salt bridge; the salt bridge carries ions to balance charge. Conventional current runs opposite to the electron flow.",
  "Electrolysis uses a few curated cases. Which products form in an arbitrary aqueous electrolysis depends on overpotentials and concentrations and is not predicted. Faraday's law gives the ideal amount for the charge passed times the stated current efficiency.",
  "A simple galvanic cell is not a model of mitochondrial electron transport or oxidative phosphorylation.",
];

export function electroGalvanic(i: ElectroInputs): CellResult | null { const r = buildGalvanicCell(i.cell); return r.ok ? r.value : null; }

export function summarizeElectro(i: ElectroInputs): ToolResults | null {
  if (i.view === "galvanic") {
    const c = electroGalvanic(i); if (!c) return null;
    return { engineVersion: ELECTROCHEM_ENGINE_VERSION, headline: [`Cathode (reduction): ${c.cathode.name}; anode (oxidation): ${c.anode.name}`, `E°cell = ${g(c.E0cell)} V; E = ${g(c.E)} V; n = ${c.n}`, `ΔG° = ${g(c.dG0 / 1000)} kJ/mol; log K = ${g(c.log10K)}`], assumptions: ELECTRO_ASSUMPTIONS.slice(0, 4), check: c.E, checkLabel: "cell potential (V)" };
  }
  const r = solveElectrolysis(i.electro); if (!r.ok) return null;
  const v = r.value; const cs = electrolysisCase(i.electro.id);
  return { engineVersion: ELECTROCHEM_ENGINE_VERSION, headline: [cs?.name ?? "Electrolysis", `Charge ${g(v.Q)} C = ${g(v.molElectrons)} mol of electrons`, `Cathode: ${g(v.cathode[0].mol)} mol ${prettyFormula(v.cathode[0].f)} = ${g(v.cathode[0].massG)} g`], assumptions: ELECTRO_ASSUMPTIONS.slice(3, 7), check: v.cathode[0].massG, checkLabel: "cathode product (g)" };
}

export function electroLessons(i: ElectroInputs): Lesson[] {
  if (i.view === "galvanic") {
    const c = electroGalvanic(i); if (!c) return [];
    const p = polarity("galvanic");
    return [
      { id: "roles", title: "Which electrode is the anode?", body: [`Oxidation happens at the anode and reduction at the cathode. Here ${c.anode.name} is oxidised (E° = ${g(c.anode.E0)} V) and ${c.cathode.name} is reduced (E° = ${g(c.cathode.E0)} V), because the couple with the higher reduction potential is the better electron acceptor.`, `In a galvanic cell the anode is the ${p.anodeSign} terminal and the cathode the ${p.cathodeSign} one; electrons go ${p.electronsFlow}.`] },
      { id: "balance", title: "Why isn't the potential multiplied by the coefficients?", body: [`E° measures energy per unit charge, so it does not depend on how many times the reaction is written. Overall: ${reactionText(c.reaction).replace(/->/g, "→")}, with n = ${c.n} electrons transferred. E°cell = ${g(c.cathode.E0)} − (${g(c.anode.E0)}) = ${g(c.E0cell)} V whatever the coefficients.`] },
      { id: "nernst", title: "How do concentrations change the potential?", body: [`E = E° − (RT/nF) ln Q. Here Q = ${g(c.Q)} and RT/nF = ${g((R_GAS * c.T) / (c.n * FARADAY))} V, so E = ${g(c.E0cell)} − ${g(((R_GAS * c.T) / (c.n * FARADAY)) * c.lnQ)} = ${g(c.E)} V. At Q = 1 the cell is at standard state; as Q grows toward K the potential falls to 0 (equilibrium: a dead battery).`] },
      { id: "gibbs", title: "What does E tell me about ΔG and K?", body: [`ΔG° = −nFE° = ${g(c.dG0 / 1000)} kJ/mol and K = exp(nFE°/RT), log₁₀K = ${g(c.log10K)}. A favourable reaction (positive E°) says nothing about how fast it goes: kinetics is a separate question.`] },
    ];
  }
  const r = solveElectrolysis(i.electro); if (!r.ok) return [];
  const v = r.value; const cs = electrolysisCase(i.electro.id); const p = polarity("electrolytic");
  return [
    { id: "faraday", title: "How much product does the charge give?", body: [`Q = It = ${g(i.electro.I)} A × ${g(i.electro.tMin * 60)} s = ${g(v.Q)} C. Moles of electrons = Q/F = ${g(v.molElectrons)} mol (F = 96 485 C/mol). The half-reaction at the cathode needs ${cs?.cathode.n} electrons per formula unit, so ${g(v.cathode[0].mol)} mol of ${prettyFormula(v.cathode[0].f)} forms (${g(v.cathode[0].massG)} g) at ${g(i.electro.eff)} % current efficiency.`] },
    { id: "signs", title: "Galvanic versus electrolytic", body: [`Oxidation is at the anode and reduction at the cathode in both kinds of cell. In an electrolytic cell the source forces the reaction: the anode is ${p.anodeSign} and the cathode ${p.cathodeSign} (opposite to a galvanic cell). Electrons still go from the anode to the cathode through the wire.`] },
    { id: "ideal", title: "Is this what a real cell gives?", body: [v.minVoltage === null ? cs?.note ?? "" : `The thermodynamic minimum applied voltage is ${g(v.minVoltage)} V. ${cs?.note ?? ""}`, "Real cells lose some current to side reactions (current efficiency below 100 %) and need more than the thermodynamic minimum voltage. Industrial results differ from this ideal calculation."] },
  ];
}

const measureE = (c: ElectroInputs) => { const r = electroGalvanic(c); return r ? r.E : NaN; };
export const ELECTRO_SCENARIOS: Array<PredictScenario<ElectroInputs>> = [
  { id: "product-conc-low", change: "make the PRODUCT-side ion of the anode half-cell 100 times more dilute", quantity: "the cell potential", apply: (c) => { const r = electroGalvanic(c); if (!r) return null; const isA = c.cell.a === r.anode.id; const key = isA ? "ca" : "cb"; const arr = c.cell[key]; const vars = variableSpecies(r.anode); const idx = vars.findIndex((v) => r.anode.ox.some((o) => o.f === v.f)); if (idx < 0) return null; const next = arr.map((x, k) => (k === idx ? x / 100 : x)); const cell = { ...c.cell, [key]: next }; return buildGalvanicCell(cell).ok ? { ...c, view: "galvanic", cell } : null; }, measure: measureE, format: (v) => `${g(v)} V`, explain: (b, a) => `A smaller concentration of a product lowers Q, and E = E° − (RT/nF) ln Q rises (${g(b)} → ${g(a)} V). Le Châtelier's reasoning agrees: the reaction is driven harder.` },
  { id: "reactant-conc-low", change: "make the REACTANT-side ion of the cathode half-cell 100 times more dilute", quantity: "the cell potential", apply: (c) => { const r = electroGalvanic(c); if (!r) return null; const isA = c.cell.a === r.cathode.id; const key = isA ? "ca" : "cb"; const arr = c.cell[key]; const vars = variableSpecies(r.cathode); const idx = vars.findIndex((v) => r.cathode.ox.some((o) => o.f === v.f && o.f !== "H^+")); if (idx < 0) return null; const next = arr.map((x, k) => (k === idx ? x / 100 : x)); const cell = { ...c.cell, [key]: next }; return buildGalvanicCell(cell).ok ? { ...c, view: "galvanic", cell } : null; }, measure: measureE, format: (v) => `${g(v)} V`, explain: (b, a) => `Less of the species being reduced raises Q and lowers E (${g(b)} → ${g(a)} V): the cell has less driving force.` },
  { id: "temperature", change: "warm the cell by 35 °C (to 60 °C), keeping the concentrations", quantity: "the cell potential in this model", apply: (c) => { if (c.cell.TC === 60) return null; const cell = { ...c.cell, TC: 60 }; return buildGalvanicCell(cell).ok ? { ...c, view: "galvanic", cell } : null; }, measure: measureE, format: (v) => `${g(v)} V`, relTol: 1e-9, explain: (b, a) => `Temperature enters only through RT/nF in the Nernst term (E° is not corrected for temperature here). ${Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)) ? `At Q = 1 that term vanishes, so E stays ${g(b)} V.` : `With Q ≠ 1 the term changes E from ${g(b)} to ${g(a)} V.`} Real cells also have a temperature coefficient of E° that this model leaves out.` },
  { id: "acidify", change: "make the cell more acidic (pH 0 to pH 2) when it contains H⁺", quantity: "the cell potential", apply: (c) => { const r = electroGalvanic(c); if (!r) return null; const uses = [...r.cathode.ox, ...r.cathode.red, ...r.anode.ox, ...r.anode.red].some((s) => s.f === "H^+"); if (!uses) return null; const cell = { ...c.cell, pH: c.cell.pH === 2 ? 0 : 2 }; return buildGalvanicCell(cell).ok ? { ...c, view: "galvanic", cell } : null; }, measure: measureE, format: (v) => `${g(v)} V`, explain: (b, a) => `Whether E rises or falls depends on which side H⁺ is on in the overall reaction: it moved ${g(b)} → ${g(a)} V.` },
];
export const ELECTROLYSIS_SCENARIOS: Array<PredictScenario<ElectroInputs>> = [
  { id: "double-current", change: "double the current for the same time", quantity: "the mass at the cathode", apply: (c) => { const electro = { ...c.electro, I: c.electro.I * 2 }; return solveElectrolysis(electro).ok ? { ...c, view: "electrolysis", electro } : null; }, measure: (c) => { const r = solveElectrolysis(c.electro); return r.ok ? r.value.cathodeMassG : NaN; }, format: (v) => `${g(v)} g`, explain: (b, a) => `Q = It, so twice the current passes twice the charge and deposits twice the amount (${g(b)} → ${g(a)} g).` },
  { id: "double-time", change: "run the electrolysis for twice as long", quantity: "the mass at the cathode", apply: (c) => { const electro = { ...c.electro, tMin: c.electro.tMin * 2 }; return solveElectrolysis(electro).ok ? { ...c, view: "electrolysis", electro, tNow: c.tNow } : null; }, measure: (c) => { const r = solveElectrolysis(c.electro); return r.ok ? r.value.cathodeMassG : NaN; }, format: (v) => `${g(v)} g`, explain: (b, a) => `Charge grows linearly with time, so the deposit doubles (${g(b)} → ${g(a)} g).` },
  { id: "lower-eff", change: "lower the current efficiency to 80 %", quantity: "the mass at the cathode", apply: (c) => { const electro = { ...c.electro, eff: 80 }; return c.electro.eff === 80 ? null : solveElectrolysis(electro).ok ? { ...c, view: "electrolysis", electro } : null; }, measure: (c) => { const r = solveElectrolysis(c.electro); return r.ok ? r.value.cathodeMassG : NaN; }, format: (v) => `${g(v)} g`, explain: (b, a) => `Only 80 % of the charge forms this product; the rest goes to side reactions (${g(b)} → ${g(a)} g).` },
  { id: "switch-ag", change: "switch to silver plating with the same current, time and efficiency", quantity: "the mass at the cathode", apply: (c) => { if (c.electro.id === "Ag-plate") return null; const electro = { ...c.electro, id: "Ag-plate" }; return solveElectrolysis(electro).ok ? { ...c, view: "electrolysis", electro } : null; }, measure: (c) => { const r = solveElectrolysis(c.electro); return r.ok ? r.value.cathodeMassG : NaN; }, format: (v) => `${g(v)} g`, explain: (b, a) => `Silver needs one electron per atom and has a molar mass of 107.87 g/mol, while copper needs two electrons and weighs 63.55 g/mol: the same charge deposits ${g(a / b)}× the mass (${g(b)} → ${g(a)} g).` },
];

const eBase = DEFAULT_ELECTRO_INPUTS;
const cellSetup = (a: string, b: string, extra: Partial<ElectroInputs["cell"]> = {}) => (c: ElectroInputs): ElectroInputs => {
  const ha = halfReaction(a); const hb = halfReaction(b);
  if (!ha || !hb) return c;
  return { ...c, view: "galvanic", cell: { a, b, ca: variableSpecies(ha).map(() => 1), cb: variableSpecies(hb).map(() => 1), pH: 0, TC: 25, ...extra } };
};
const cellOf = (a: string, b: string, extra: Partial<ElectroInputs["cell"]> = {}) => { const r = buildGalvanicCell(cellSetup(a, b, extra)(eBase).cell); if (!r.ok) throw new Error(r.errors.join(" ")); return r.value; };
export const ELECTRO_PRACTICE: Question<ElectroInputs>[] = [
  { id: "which-anode", title: "Identify the anode", kind: "choice", prompt: "In a cell made from Zn²⁺/Zn (−0.762 V) and Cu²⁺/Cu (+0.342 V), which metal is the anode (oxidised)?", setup: cellSetup("Zn", "Cu"), options: () => ["Zinc", "Copper"], answer: () => (cellOf("Zn", "Cu").anode.id === "Zn" ? 0 : 1), explain: () => "The couple with the lower reduction potential, Zn²⁺/Zn, is oxidised: Zn → Zn²⁺ + 2 e⁻ at the anode. Copper is reduced at the cathode." },
  { id: "e-cell", title: "Standard cell potential", kind: "number", unit: "V", relTol: 0.01, prompt: "Cu²⁺/Cu (+0.342 V) and Ag⁺/Ag (+0.800 V) form a cell. What is E°cell?", setup: cellSetup("Cu", "Ag"), answer: () => cellOf("Cu", "Ag").E0cell, explain: () => "E°cell = E°cathode − E°anode = 0.800 − 0.342 = 0.458 V. The coefficient 2 in Cu + 2 Ag⁺ does not multiply the potential." },
  { id: "n-electrons", title: "Electrons transferred", kind: "number", unit: "", relTol: 0, prompt: "Zn²⁺/Zn (2 e⁻) and Al³⁺/Al (3 e⁻) form a cell. How many electrons are transferred in the balanced overall reaction?", setup: cellSetup("Zn", "Al"), answer: () => cellOf("Zn", "Al").n, explain: () => "The lowest common multiple of 2 and 3 is 6: 3 Zn²⁺ + 2 Al → 3 Zn + 2 Al³⁺ moves 6 electrons." },
  { id: "nernst", title: "Nonstandard potential", kind: "number", unit: "V", relTol: 0.002, prompt: "A Daniell cell has [Zn²⁺] = 0.010 M and [Cu²⁺] = 1.00 M at 25 °C. What is the cell potential?", setup: cellSetup("Zn", "Cu", { ca: [0.01], cb: [1] }), answer: () => cellOf("Zn", "Cu", { ca: [0.01], cb: [1] }).E, explain: () => "Q = [Zn²⁺]/[Cu²⁺] = 0.010, n = 2: E = 1.104 − (0.02569/2) ln 0.010 = 1.104 + 0.0592 = 1.163 V." },
  { id: "dg", title: "Gibbs energy from the cell", kind: "number", unit: "kJ/mol", relTol: 0.005, prompt: "What is ΔG° (in kJ per mole of reaction) for the standard Daniell cell (E° = 1.104 V, n = 2)?", setup: cellSetup("Zn", "Cu"), answer: () => cellOf("Zn", "Cu").dG0 / 1000, explain: () => "ΔG° = −nFE° = −2 × 96 485 × 1.104 = −213 kJ/mol. The negative sign means the reaction is thermodynamically favourable." },
  { id: "faraday-cu", title: "Faraday's law: copper", kind: "number", unit: "g", relTol: 0.005, prompt: "A current of 2.00 A passes through copper(II) sulfate solution for 30.0 minutes. What mass of copper is deposited (100 % efficiency)?", setup: (c) => ({ ...c, view: "electrolysis", electro: { ...c.electro, id: "Cu-plate", I: 2, tMin: 30, eff: 100 }, tNow: 15 }), answer: () => { const r = solveElectrolysis({ id: "Cu-plate", I: 2, tMin: 30, eff: 100, TC: 25, PkPa: 101.325 }); return r.ok ? r.value.cathodeMassG : NaN; }, explain: () => "Q = 2.00 × 1800 = 3600 C → 3600 ÷ 96 485 = 0.0373 mol e⁻ → ÷ 2 = 0.01866 mol Cu × 63.546 g/mol = 1.19 g." },
  { id: "faraday-time", title: "Time for a deposit", kind: "number", unit: "min", relTol: 0.01, prompt: "How long must 0.500 A flow through silver nitrate solution to deposit 1.00 g of silver (100 % efficiency)?", setup: (c) => ({ ...c, view: "electrolysis", electro: { ...c.electro, id: "Ag-plate", I: 0.5, eff: 100 } }), answer: () => (1 / 107.87) * FARADAY / 0.5 / 60, explain: () => "1.00 g ÷ 107.87 g/mol = 0.00927 mol Ag = 0.00927 mol e⁻ (1 e⁻ per Ag) → Q = 0.00927 × 96 485 = 894.4 C → t = Q/I = 1789 s = 29.8 min." },
  { id: "anode-water", title: "Water electrolysis", kind: "choice", prompt: "In the electrolysis of water with inert electrodes in acid, which gas forms at the ANODE?", setup: (c) => ({ ...c, view: "electrolysis", electro: { ...c.electro, id: "water" } }), options: () => ["Hydrogen", "Oxygen"], answer: () => 1, explain: () => "Oxidation is always at the anode: 2 H₂O → O₂ + 4 H⁺ + 4 e⁻. Hydrogen forms at the cathode (reduction), twice as many moles as oxygen." },
];

export function stoichSummaryHeadline(i: StoichInputs): string[] { return summarizeStoich(i)?.headline ?? []; }
