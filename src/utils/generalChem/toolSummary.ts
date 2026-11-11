/**
 * Display summaries (and the one `check` number) that are stored beside saved inputs for the three Stage 12 tools, plus the
 * assumption lists each tool states. Pure functions of validated inputs; used by the pages and by the tests.
 */
import {
  applyDisturbance, deltaNu, solveEquilibrium, type Disturbance,
} from "./equilibrium";
import { formatSig } from "./format";
import {
  analyzeArrhenius, concentrationAt, fitRateLaws, halfLife, kUnits, ORDER_NAME, parsePairs,
} from "./kinetics";
import { analyzeCalorimetry, analyzeGibbs, solveHess } from "./thermo";
import {
  EQUILIBRIUM_ENGINE_VERSION, KINETICS_ENGINE_VERSION, THERMO_ENGINE_VERSION,
  type DisturbanceSpec, type EquilibriumInputs, type KineticsInputs, type ThermoInputs, type ToolResults,
} from "../persistence/generalChemTools";

const f = (v: number, sig = 3) => formatSig(v, sig);

export const EQUILIBRIUM_ASSUMPTIONS = [
  "One reaction with 1–2 reactants and 1–2 products; every species is an ideal solute or ideal gas whose activity equals its concentration (mol/L).",
  "Pure solids, pure liquids and solvents are not in the K expression and are not supported; coupled equilibria are not supported.",
  "Constant temperature, so K is fixed. Temperature changes are not modelled here.",
  "Volume changes scale every concentration equally (ideal gases or ideal dilute solutions).",
];
export const KINETICS_ASSUMPTIONS = [
  "One reactant A with rate = k[A]ⁿ and n = 0, 1 or 2, at constant temperature and volume. The order is an input or a fitted result; it is never read from the reaction's coefficients.",
  "Rate constants refer to −d[A]/dt. Real reactions may have several steps, reversible steps, or orders that are not integers; those are not modelled.",
  "Arrhenius: k = A·exp(−Ea/RT) with constant A and Ea over the temperatures used.",
];
export const THERMO_ASSUMPTIONS = [
  "ΔG° = ΔH° − TΔS°. With ΔCp = 0, ΔH° and ΔS° are constants, a good approximation only near the temperature where they were measured and never across a phase change.",
  "ΔG describes thermodynamic favourability only; it says nothing about how fast a reaction proceeds.",
  "Standard-state quantities (ΔG°, K) differ from nonstandard ΔG = ΔG° + RT ln Q.",
  "Calorimetry assumes no heat loss to the surroundings and constant specific heats.",
];

export function toDisturbance(spec: DisturbanceSpec): Disturbance {
  if (spec.kind === "volume") return { kind: "volume", factor: spec.factor };
  if (spec.kind === "inert") return { kind: "inert" };
  const [side, idx] = spec.target.split(":");
  return { kind: spec.kind, side: side as "reactants" | "products", index: Number(idx), amount: spec.amount };
}

export function summarizeEquilibrium(inputs: EquilibriumInputs): ToolResults | null {
  const sys = inputs.system;
  const r = solveEquilibrium(sys);
  if (!Number.isFinite(r.Qeq) && r.direction !== "none") return null;
  const dir = r.direction === "none" ? "no net change" : r.direction === "forward" ? "forward (toward products)" : "reverse (toward reactants)";
  const comp = [...sys.reactants.map((s, i) => `[${s.name}] = ${f(r.reactants[i])}`), ...sys.products.map((s, i) => `[${s.name}] = ${f(r.products[i])}`)].join(", ");
  const headline = [
    `K = ${f(sys.K)}; Q₀ = ${r.Q0 === null ? "undefined (a species is absent)" : f(r.Q0)}: ${dir}`,
    `Equilibrium (mol/L): ${comp}`,
    `Extent ξ = ${f(r.xi)} mol/L`,
  ];
  const probe = applyDisturbance(sys, { reactants: r.reactants, products: r.products }, toDisturbance(inputs.disturbance));
  if (probe.ok) headline.push(`Disturbance → shift ${probe.shift === "none" ? "none" : probe.shift === "forward" ? "to the right" : "to the left"} (Δν = ${deltaNu(sys)})`);
  return { engineVersion: EQUILIBRIUM_ENGINE_VERSION, headline, assumptions: EQUILIBRIUM_ASSUMPTIONS, check: r.xi, checkLabel: "extent ξ (mol/L)" };
}

export function summarizeKinetics(inputs: KineticsInputs): ToolResults | null {
  const u = inputs.timeUnit;
  if (inputs.view === "model") {
    const m = inputs.model;
    const th = halfLife(m);
    return {
      engineVersion: KINETICS_ENGINE_VERSION,
      headline: [
        `${ORDER_NAME[m.order]}, k = ${f(m.k)} ${kUnits(m.order, u)}, [A]₀ = ${f(m.c0)} mol/L`,
        `Half-life = ${f(th)} ${u}`,
        `[A] at t = ${f(inputs.tNow)} ${u}: ${f(concentrationAt(m, inputs.tNow))} mol/L`,
      ],
      assumptions: KINETICS_ASSUMPTIONS,
      check: th,
      checkLabel: `half-life (${u})`,
    };
  }
  if (inputs.view === "fit") {
    const parsed = parsePairs(inputs.fitText, "concentration–time");
    if (!parsed.ok) return null;
    const fit = fitRateLaws(parsed.rows.map(([t, c]) => ({ t, c })));
    if (!fit.ok || fit.best === null) return null;
    const best = fit.fits.find((x) => x.order === fit.best)!;
    return {
      engineVersion: KINETICS_ENGINE_VERSION,
      headline: [`Best-fitting model: ${ORDER_NAME[fit.best]} (${fit.verdict})`, `k = ${f(best.k)} ${kUnits(best.order, u)}`, fit.message.slice(0, 300)],
      assumptions: KINETICS_ASSUMPTIONS,
      check: best.k,
      checkLabel: "fitted k",
    };
  }
  const a = analyzeArrhenius(inputs.arrhenius);
  if (!a.ok) return null;
  return {
    engineVersion: KINETICS_ENGINE_VERSION,
    headline: [`Ea = ${f(a.EaKJ)} kJ/mol`, `k at ${inputs.arrhenius.T} K = ${f(a.kAtT)}`, `Factor for +10 K: ${f(a.factor10)}`],
    assumptions: KINETICS_ASSUMPTIONS,
    check: a.EaKJ,
    checkLabel: "Ea (kJ/mol)",
  };
}

export function summarizeThermo(inputs: ThermoInputs): ToolResults | null {
  if (inputs.view === "gibbs") {
    const a = analyzeGibbs(inputs.gibbs);
    const cross = a.crossovers.length ? `ΔG° = 0 at ${a.crossovers.map((t) => `${f(t, 4)} K`).join(" and ")}` : "no ΔG° = 0 temperature in the plotted range";
    return {
      engineVersion: THERMO_ENGINE_VERSION,
      headline: [
        `ΔG° = ${f(a.dGT)} kJ/mol at ${inputs.gibbs.T} K (${a.dGT < 0 ? "favourable, standard conditions" : a.dGT > 0 ? "unfavourable, standard conditions" : "at equilibrium"})`,
        `K = ${f(a.K)}`,
        cross,
      ],
      assumptions: THERMO_ASSUMPTIONS,
      check: a.dGT,
      checkLabel: "ΔG° (kJ/mol)",
    };
  }
  if (inputs.view === "hess") {
    const r = solveHess(inputs.hess);
    if (!r.ok) return null;
    return {
      engineVersion: THERMO_ENGINE_VERSION,
      headline: [`ΔH(target) = ${f(r.total, 4)} kJ`, ...r.lines.map((l) => `Equation ${l.index}: ${l.description} (× ${f(l.multiplier)})`)].slice(0, 8),
      assumptions: THERMO_ASSUMPTIONS,
      check: r.total,
      checkLabel: "ΔH (kJ)",
    };
  }
  const c = analyzeCalorimetry(inputs.calorimetry);
  return {
    engineVersion: THERMO_ENGINE_VERSION,
    headline: c.headline.map((h) => `${h.label}: ${h.value}`),
    assumptions: THERMO_ASSUMPTIONS,
    check: c.value,
    checkLabel: c.unit,
  };
}

