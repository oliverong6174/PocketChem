/**
 * Thermodynamics model (Stage 12): Gibbs energy versus temperature, Hess's law, and basic calorimetry.
 *
 * Conventions: ΔH and ΔG in kJ/mol, ΔS and ΔCp in J/(mol·K), temperatures in kelvin (calorimetry takes °C readings, which only
 * ever enter as differences). Standard-state quantities (ΔH°, ΔS°, ΔG°, K) are distinguished from nonstandard ΔG = ΔG° + RT ln Q.
 *
 * Assumptions, stated wherever they matter:
 *  - ΔG° = ΔH° − TΔS°. With ΔCp = 0 (the default) ΔH° and ΔS° are constants: a good approximation near the temperature
 *    where they were measured, increasingly poor far from it, and invalid across a phase change of any species. If a
 *    nonzero ΔCp (assumed constant) is given, ΔH°(T) = ΔH°(T₀) + ΔCp (T − T₀) and ΔS°(T) = ΔS°(T₀) + ΔCp ln(T/T₀).
 *  - ΔG describes thermodynamic favourability only. It says nothing about how fast a reaction goes (that is kinetics).
 */

export const R_GAS = 8.314462618; // J/(mol·K)
export const THERMO_LIMITS = {
  maxH: 5000, // kJ/mol
  maxS: 5000, // J/(mol·K)
  maxCp: 1000,
  minT: 50, maxT: 6000,
  minSpan: 50,
  maxQ: 1e30, minQ: 1e-30,
} as const;

export type Validation<T> = { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[] };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

// ---- Gibbs energy versus temperature ---------------------------------------------------------------------------------------

export interface GibbsInput {
  /** ΔH° at T₀, kJ/mol. */
  dH: number;
  /** ΔS° at T₀, J/(mol·K). */
  dS: number;
  /** Constant ΔCp, J/(mol·K). Zero means ΔH° and ΔS° are taken as constants. */
  dCp: number;
  /** Temperature at which ΔH° and ΔS° apply, K. */
  T0: number;
  /** Temperature of interest, K. */
  T: number;
  /** Plotted range, K. */
  Tmin: number;
  Tmax: number;
  /** Optional reaction quotient for a nonstandard ΔG. */
  Q: number | null;
}

export function validateGibbs(raw: unknown): Validation<GibbsInput> {
  const r = obj(raw);
  const errors: string[] = [];
  if (!finite(r.dH) || Math.abs(r.dH) > THERMO_LIMITS.maxH) errors.push(`ΔH must be a number between −${THERMO_LIMITS.maxH} and ${THERMO_LIMITS.maxH} kJ/mol.`);
  if (!finite(r.dS) || Math.abs(r.dS) > THERMO_LIMITS.maxS) errors.push(`ΔS must be a number between −${THERMO_LIMITS.maxS} and ${THERMO_LIMITS.maxS} J/(mol·K). Remember ΔS is in joules, not kilojoules.`);
  if (!finite(r.dCp) || Math.abs(r.dCp) > THERMO_LIMITS.maxCp) errors.push(`ΔCp must be a number between −${THERMO_LIMITS.maxCp} and ${THERMO_LIMITS.maxCp} J/(mol·K); use 0 for constant ΔH and ΔS.`);
  for (const [key, label] of [["T0", "The reference temperature"], ["T", "The temperature"], ["Tmin", "The lowest plotted temperature"], ["Tmax", "The highest plotted temperature"]] as const) {
    if (!finite(r[key]) || (r[key] as number) < THERMO_LIMITS.minT || (r[key] as number) > THERMO_LIMITS.maxT) errors.push(`${label} must be in kelvin, from ${THERMO_LIMITS.minT} to ${THERMO_LIMITS.maxT} K.`);
  }
  if (finite(r.Tmin) && finite(r.Tmax) && r.Tmax - r.Tmin < THERMO_LIMITS.minSpan) errors.push(`The plotted range must span at least ${THERMO_LIMITS.minSpan} K.`);
  if (r.Q !== null && r.Q !== undefined && (!finite(r.Q) || r.Q < THERMO_LIMITS.minQ || r.Q > THERMO_LIMITS.maxQ)) errors.push("The reaction quotient Q must be a positive number (leave it empty for standard conditions).");
  if (errors.length) return { ok: false, errors };
  const v: GibbsInput = { dH: r.dH as number, dS: r.dS as number, dCp: r.dCp as number, T0: r.T0 as number, T: r.T as number, Tmin: r.Tmin as number, Tmax: r.Tmax as number, Q: r.Q === undefined ? null : (r.Q as number | null) };
  const warnings: string[] = [];
  if (v.dCp === 0) {
    const far = Math.max(Math.abs(v.Tmin - v.T0), Math.abs(v.Tmax - v.T0), Math.abs(v.T - v.T0));
    if (far > 300) warnings.push(`With ΔCp = 0, ΔH° and ΔS° are treated as constant. The temperatures reach ${Math.round(far)} K from the reference temperature, where that is usually a poor approximation; enter ΔCp if you know it. It is also invalid across any melting, boiling or other phase change.`);
  } else if (Math.max(Math.abs(v.Tmin - v.T0), Math.abs(v.Tmax - v.T0)) > 1000) {
    warnings.push("A constant ΔCp over more than ±1000 K is a rough model; heat capacities themselves vary with temperature.");
  }
  if (v.T < v.Tmin || v.T > v.Tmax) warnings.push("The temperature of interest is outside the plotted range.");
  return { ok: true, value: v, warnings };
}

/** ΔH°(T) in kJ/mol. */
export const enthalpyAt = (g: GibbsInput, T: number): number => g.dH + (g.dCp * (T - g.T0)) / 1000;
/** ΔS°(T) in J/(mol·K). */
export const entropyAt = (g: GibbsInput, T: number): number => g.dS + g.dCp * Math.log(T / g.T0);
/** ΔG°(T) = ΔH°(T) − T ΔS°(T), kJ/mol. */
export const gibbsAt = (g: GibbsInput, T: number): number => enthalpyAt(g, T) - (T * entropyAt(g, T)) / 1000;
/** Nonstandard ΔG = ΔG° + RT ln Q, kJ/mol. */
export const gibbsNonstandard = (g: GibbsInput, T: number, Q: number): number => gibbsAt(g, T) + (R_GAS * T * Math.log(Q)) / 1000;
/** ln K = −ΔG°/RT. */
export const lnKAt = (g: GibbsInput, T: number): number => -(gibbsAt(g, T) * 1000) / (R_GAS * T);

export type GibbsCase = "always" | "never" | "low-T" | "high-T" | "degenerate";
export function classifyCase(dH: number, dS: number): GibbsCase {
  if (dH === 0 && dS === 0) return "degenerate";
  if (dH <= 0 && dS >= 0) return "always";
  if (dH >= 0 && dS <= 0) return "never";
  return dH < 0 ? "low-T" : "high-T"; // (dH<0, dS<0) favourable at low T; (dH>0, dS>0) at high T
}

/** Temperatures in [Tmin, Tmax] where ΔG° = 0 (sign changes found on a fine grid, refined by bisection). */
export function crossoverTemperatures(g: GibbsInput): number[] {
  const out: number[] = [];
  const N = 600;
  let prevT = g.Tmin;
  let prevG = gibbsAt(g, prevT);
  if (prevG === 0) out.push(prevT);
  for (let i = 1; i <= N; i += 1) {
    const T = g.Tmin + ((g.Tmax - g.Tmin) * i) / N;
    const G = gibbsAt(g, T);
    if (G === 0) out.push(T);
    else if (prevG !== 0 && Math.sign(G) !== Math.sign(prevG)) {
      let lo = prevT; let hi = T; let gl = prevG;
      for (let k = 0; k < 100; k += 1) {
        const mid = (lo + hi) / 2;
        const gm = gibbsAt(g, mid);
        if (Math.sign(gm) === Math.sign(gl)) { lo = mid; gl = gm; } else hi = mid;
      }
      out.push((lo + hi) / 2);
    }
    prevT = T; prevG = G;
  }
  return out.filter((t, i, a) => i === 0 || Math.abs(t - a[i - 1]) > 1e-9);
}

export interface GibbsAnalysis {
  dHT: number; dST: number; dGT: number; lnK: number; K: number;
  dGnon: number | null;
  /** Spontaneity wording for the quantity that applies (nonstandard if Q was given). */
  favourable: boolean | "equilibrium";
  case: GibbsCase;
  /** ΔG = 0 temperatures inside the plotted range. */
  crossovers: number[];
  /** Closed-form ΔH/ΔS when ΔCp = 0, regardless of range (can lie outside it). */
  closedFormCrossover: number | null;
  curve: Array<{ T: number; dG: number; dH: number; TdS: number }>;
  yRange: [number, number];
}

export function analyzeGibbs(g: GibbsInput): GibbsAnalysis {
  const dHT = enthalpyAt(g, g.T);
  const dST = entropyAt(g, g.T);
  const dGT = gibbsAt(g, g.T);
  const lnK = lnKAt(g, g.T);
  const dGnon = g.Q === null ? null : gibbsNonstandard(g, g.T, g.Q);
  const effective = dGnon ?? dGT;
  const favourable: GibbsAnalysis["favourable"] = Math.abs(effective) < 1e-9 ? "equilibrium" : effective < 0;
  const curve: GibbsAnalysis["curve"] = [];
  const N = 240;
  for (let i = 0; i <= N; i += 1) {
    const T = g.Tmin + ((g.Tmax - g.Tmin) * i) / N;
    curve.push({ T, dG: gibbsAt(g, T), dH: enthalpyAt(g, T), TdS: (T * entropyAt(g, T)) / 1000 });
  }
  const ys = curve.map((p) => p.dG);
  const closed = g.dCp === 0 && g.dS !== 0 ? (g.dH * 1000) / g.dS : null;
  return {
    dHT, dST, dGT, lnK, K: Math.exp(lnK), dGnon, favourable,
    case: g.dCp === 0 ? classifyCase(g.dH, g.dS) : "degenerate",
    crossovers: crossoverTemperatures(g),
    closedFormCrossover: closed !== null && closed > 0 ? closed : null,
    curve,
    yRange: [Math.min(...ys), Math.max(...ys)],
  };
}

// ---- Hess's law --------------------------------------------------------------------------------------------------------------

export interface ParsedTerm { key: string; formula: string; state: string; coeff: number; atoms: Record<string, number> }
export interface ParsedEquation { reactants: ParsedTerm[]; products: ParsedTerm[]; text: string }

const STATES = new Set(["s", "l", "g", "aq"]);

function parseFormula(formula: string): Record<string, number> | null {
  let i = 0;
  const parseGroup = (close: string | null): Record<string, number> | null => {
    const atoms: Record<string, number> = {};
    while (i < formula.length) {
      const ch = formula[i];
      if (ch === ")" || ch === "]") {
        if (close === null || close !== ch) return null;
        i += 1;
        return atoms;
      }
      let add: Record<string, number> | null;
      if (ch === "(" || ch === "[") {
        i += 1;
        add = parseGroup(ch === "(" ? ")" : "]");
        if (!add) return null;
      } else if (/[A-Z]/.test(ch)) {
        let el = ch; i += 1;
        if (i < formula.length && /[a-z]/.test(formula[i])) { el += formula[i]; i += 1; }
        add = { [el]: 1 };
      } else return null;
      let digits = "";
      while (i < formula.length && /\d/.test(formula[i])) { digits += formula[i]; i += 1; }
      const mult = digits === "" ? 1 : Number(digits);
      if (mult < 1 || mult > 1000) return null;
      for (const [el, n] of Object.entries(add)) atoms[el] = (atoms[el] ?? 0) + n * mult;
    }
    return close === null ? atoms : null;
  };
  const atoms = parseGroup(null);
  return atoms && Object.keys(atoms).length > 0 ? atoms : null;
}

function parseCoefficient(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text);
  if (/^\d*\.\d+$/.test(text)) return Number(text);
  const frac = /^(\d+)\/(\d+)$/.exec(text);
  if (frac && Number(frac[2]) > 0) return Number(frac[1]) / Number(frac[2]);
  return null;
}

function parseTerm(raw: string): ParsedTerm | string {
  const text = raw.trim();
  const m = /^((?:\d+\/\d+|\d*\.\d+|\d+)\s*)?([A-Za-z()[\]0-9]+?)(?:\((s|l|g|aq)\))?$/.exec(text);
  if (!m) return `"${text}" is not a species with an optional coefficient and state, such as 2 H2(g) or 1/2 O2(g).`;
  let coeff = 1;
  if (m[1]) {
    const c = parseCoefficient(m[1].trim());
    if (c === null || !(c > 0) || c > 1000) return `"${text}" has an invalid coefficient.`;
    coeff = c;
  }
  const formula = m[2];
  const state = m[3] ?? "";
  if (state !== "" && !STATES.has(state)) return `"${text}" has an unknown state.`;
  const atoms = parseFormula(formula);
  if (!atoms) return `"${formula}" is not a formula the tool can read (charges, dots and hydrate notation are not supported).`;
  return { key: state ? `${formula}(${state})` : formula, formula, state, coeff, atoms };
}

/** Parses "2 H2(g) + O2(g) -> 2 H2O(l)". Species are separated by " + " (spaces required); the arrow may be ->, → or =. */
export function parseEquation(text: string): { ok: true; equation: ParsedEquation } | { ok: false; error: string } {
  if (typeof text !== "string" || text.trim() === "") return { ok: false, error: "The equation is empty." };
  if (text.length > 300) return { ok: false, error: "The equation is too long." };
  const sides = text.split(/->|→|=>|⇌|=/);
  if (sides.length !== 2) return { ok: false, error: "Write the equation with exactly one arrow (->, → or =)." };
  const side = (s: string): ParsedTerm[] | string => {
    const terms = s.trim().split(/\s+\+\s+/);
    const out: ParsedTerm[] = [];
    for (const t of terms) {
      if (t.trim() === "") return "A side of the equation has an empty term (use spaces around each + between species).";
      const parsed = parseTerm(t);
      if (typeof parsed === "string") return parsed;
      out.push(parsed);
    }
    return out;
  };
  const left = side(sides[0]);
  if (typeof left === "string") return { ok: false, error: left };
  const right = side(sides[1]);
  if (typeof right === "string") return { ok: false, error: right };
  const tally = (terms: ParsedTerm[]) => { const a: Record<string, number> = {}; for (const t of terms) for (const [el, n] of Object.entries(t.atoms)) a[el] = (a[el] ?? 0) + n * t.coeff; return a; };
  const l = tally(left); const r = tally(right);
  const els = new Set([...Object.keys(l), ...Object.keys(r)]);
  const off = [...els].filter((el) => Math.abs((l[el] ?? 0) - (r[el] ?? 0)) > 1e-9);
  if (off.length) return { ok: false, error: `The equation is not balanced (${off.join(", ")}).` };
  return { ok: true, equation: { reactants: left, products: right, text: text.trim() } };
}

export interface HessStepInput { equation: string; dH: number }
export interface HessInput { target: string; steps: HessStepInput[] }

export const HESS_LIMITS = { minSteps: 1, maxSteps: 6, maxH: 20000 } as const;

export function validateHess(raw: unknown): Validation<HessInput> {
  const r = obj(raw);
  const errors: string[] = [];
  if (typeof r.target !== "string" || r.target.trim() === "") errors.push("Enter the target equation.");
  if (!Array.isArray(r.steps) || r.steps.length < HESS_LIMITS.minSteps || r.steps.length > HESS_LIMITS.maxSteps) errors.push(`Use ${HESS_LIMITS.minSteps}–${HESS_LIMITS.maxSteps} known equations.`);
  if (errors.length) return { ok: false, errors };
  const steps: HessStepInput[] = [];
  (r.steps as unknown[]).forEach((s, i) => {
    const o = obj(s);
    if (typeof o.equation !== "string" || o.equation.trim() === "") errors.push(`Equation ${i + 1} is empty.`);
    else if (!finite(o.dH) || Math.abs(o.dH) > HESS_LIMITS.maxH) errors.push(`ΔH of equation ${i + 1} must be a number in kJ.`);
    else steps.push({ equation: o.equation, dH: o.dH });
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { target: r.target as string, steps }, warnings: [] };
}

export interface HessLine {
  index: number;
  equation: string;
  dH: number;
  /** Signed multiplier applied to the equation: negative means reversed. */
  multiplier: number;
  reversed: boolean;
  scale: number;
  contribution: number;
  description: string;
}

export interface HessResult {
  ok: true;
  lines: HessLine[];
  total: number;
  /** Net coefficient of every species after combining (must equal the target's). */
  species: Array<{ key: string; fromSteps: number[]; net: number; target: number }>;
  warnings: string[];
}

const nearRational = (x: number): number => {
  for (let d = 1; d <= 12; d += 1) { const n = Math.round(x * d); if (Math.abs(x - n / d) < 1e-9) return n / d; }
  return x;
};

function netCoefficients(e: ParsedEquation): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of e.products) m.set(t.key, (m.get(t.key) ?? 0) + t.coeff);
  for (const t of e.reactants) m.set(t.key, (m.get(t.key) ?? 0) - t.coeff);
  return m;
}

/**
 * Finds multipliers m_i (negative = reversed) with Σ m_i · step_i = target for every species, then ΔH_target = Σ m_i ΔH_i.
 * Requires the equations to be balanced and the same species to carry the same states. If the steps are linearly dependent
 * the multipliers are not unique and the tool refuses rather than choose.
 */
export function solveHess(input: HessInput): HessResult | { ok: false; error: string } {
  const target = parseEquation(input.target);
  if (!target.ok) return { ok: false, error: `Target: ${target.error}` };
  const parsed: ParsedEquation[] = [];
  for (const [i, s] of input.steps.entries()) {
    const p = parseEquation(s.equation);
    if (!p.ok) return { ok: false, error: `Equation ${i + 1}: ${p.error}` };
    parsed.push(p.equation);
  }
  const nets = parsed.map(netCoefficients);
  const tnet = netCoefficients(target.equation);
  if ([...tnet.values()].every((v) => Math.abs(v) < 1e-9)) return { ok: false, error: "Target: the same species appear on both sides, so there is no net reaction to find a ΔH for." };

  // The same formula in different states is a different species: say so when it is the only obstacle.
  const keys = new Set<string>([...tnet.keys(), ...nets.flatMap((n) => [...n.keys()])]);
  const byFormula = new Map<string, Set<string>>();
  for (const k of keys) { const f = k.replace(/\((s|l|g|aq)\)$/, ""); (byFormula.get(f) ?? byFormula.set(f, new Set()).get(f)!).add(k); }
  const mixed = [...byFormula.values()].filter((s) => s.size > 1);

  const species = [...keys];
  const n = parsed.length;
  // Augmented matrix: rows = species, columns = steps | target
  const M = species.map((s) => [...nets.map((net) => net.get(s) ?? 0), tnet.get(s) ?? 0]);
  const rows = M.length;
  let rank = 0;
  const pivotCols: number[] = [];
  for (let c = 0; c < n && rank < rows; c += 1) {
    let p = rank;
    for (let r = rank + 1; r < rows; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) continue;
    [M[rank], M[p]] = [M[p], M[rank]];
    const div = M[rank][c];
    M[rank] = M[rank].map((v) => v / div);
    for (let r = 0; r < rows; r += 1) {
      if (r !== rank) { const f = M[r][c]; if (f !== 0) M[r] = M[r].map((v, j) => v - f * M[rank][j]); }
    }
    pivotCols.push(c);
    rank += 1;
  }
  const hint = mixed.length ? ` Check the states: ${mixed.map((s) => [...s].join(" and ")).join("; ")} are different species.` : "";
  for (let r = rank; r < rows; r += 1) {
    if (Math.abs(M[r][n]) > 1e-9) return { ok: false, error: `No combination of these equations (each scaled and/or reversed) gives the target.${hint}` };
  }
  if (rank < n) return { ok: false, error: "These equations are not independent (one can be built from the others), so the multipliers are not unique. Remove the redundant equation." };

  const mult = new Array<number>(n).fill(0);
  pivotCols.forEach((c, r) => { mult[c] = nearRational(M[r][n]); });
  const lines: HessLine[] = mult.map((m, i) => {
    const reversed = m < 0;
    const scale = Math.abs(m);
    const contribution = m * input.steps[i].dH;
    const description = m === 0 ? "not used" : `${reversed ? "reversed" : "as written"}${scale !== 1 ? `, multiplied by ${Number(scale.toPrecision(6))}` : ""}`;
    return { index: i + 1, equation: input.steps[i].equation, dH: input.steps[i].dH, multiplier: m, reversed, scale, contribution, description };
  });
  const warnings: string[] = [];
  if (mult.some((m) => m === 0)) warnings.push("At least one equation is not needed for this target (multiplier 0).");
  warnings.push("Assumes every ΔH was measured at the same temperature and for the same states; Hess's law applies because ΔH is a state function.");
  const total = lines.reduce((a, l) => a + l.contribution, 0);
  return {
    ok: true, lines, total,
    species: species.map((k) => ({ key: k, fromSteps: nets.map((net, i) => mult[i] * (net.get(k) ?? 0)), net: nets.reduce((a, net, i) => a + mult[i] * (net.get(k) ?? 0), 0), target: tnet.get(k) ?? 0 })),
    warnings,
  };
}

// ---- calorimetry ---------------------------------------------------------------------------------------------------------------

export const C_WATER = 4.184; // J/(g·K)

export type CalorimetryMode = "reaction" | "mixing" | "specific-heat";
export interface CalorimetryInput {
  mode: CalorimetryMode;
  /** Constant-pressure solution calorimeter: ΔH of a reaction. */
  reaction: { massG: number; cJgK: number; ccalJK: number; Ti: number; Tf: number; moles: number };
  /** Two samples exchanging heat: final temperature. */
  mixing: { m1: number; c1: number; T1: number; m2: number; c2: number; T2: number };
  /** Hot metal dropped into water: specific heat of the metal. */
  specificHeat: { mMetal: number; TMetal: number; mWater: number; TWater: number; Tf: number };
}

export const CAL_LIMITS = { minMass: 1e-3, maxMass: 1e5, minC: 0.05, maxC: 15, maxCcal: 1e6, minTemp: -100, maxTemp: 1500, minMoles: 1e-9, maxMoles: 1e3 } as const;

export function validateCalorimetry(raw: unknown): Validation<CalorimetryInput> {
  const r = obj(raw);
  const errors: string[] = [];
  if (r.mode !== "reaction" && r.mode !== "mixing" && r.mode !== "specific-heat") return { ok: false, errors: ["Choose a calorimetry type."] };
  const check = (src: Record<string, unknown>, key: string, label: string, lo: number, hi: number) => {
    if (!finite(src[key]) || (src[key] as number) < lo || (src[key] as number) > hi) errors.push(`${label} must be a number from ${lo} to ${hi}.`);
  };
  const re = obj(r.reaction); const mx = obj(r.mixing); const sh = obj(r.specificHeat);
  if (r.mode === "reaction") {
    check(re, "massG", "The solution mass (g)", CAL_LIMITS.minMass, CAL_LIMITS.maxMass);
    check(re, "cJgK", "The specific heat (J/(g·K))", CAL_LIMITS.minC, CAL_LIMITS.maxC);
    check(re, "ccalJK", "The calorimeter heat capacity (J/K)", 0, CAL_LIMITS.maxCcal);
    check(re, "Ti", "The initial temperature (°C)", CAL_LIMITS.minTemp, CAL_LIMITS.maxTemp);
    check(re, "Tf", "The final temperature (°C)", CAL_LIMITS.minTemp, CAL_LIMITS.maxTemp);
    check(re, "moles", "The moles of limiting reagent", CAL_LIMITS.minMoles, CAL_LIMITS.maxMoles);
  } else if (r.mode === "mixing") {
    check(mx, "m1", "Mass 1 (g)", CAL_LIMITS.minMass, CAL_LIMITS.maxMass); check(mx, "c1", "Specific heat 1 (J/(g·K))", CAL_LIMITS.minC, CAL_LIMITS.maxC); check(mx, "T1", "Temperature 1 (°C)", CAL_LIMITS.minTemp, CAL_LIMITS.maxTemp);
    check(mx, "m2", "Mass 2 (g)", CAL_LIMITS.minMass, CAL_LIMITS.maxMass); check(mx, "c2", "Specific heat 2 (J/(g·K))", CAL_LIMITS.minC, CAL_LIMITS.maxC); check(mx, "T2", "Temperature 2 (°C)", CAL_LIMITS.minTemp, CAL_LIMITS.maxTemp);
  } else {
    check(sh, "mMetal", "The metal mass (g)", CAL_LIMITS.minMass, CAL_LIMITS.maxMass); check(sh, "TMetal", "The metal's initial temperature (°C)", CAL_LIMITS.minTemp, CAL_LIMITS.maxTemp);
    check(sh, "mWater", "The water mass (g)", CAL_LIMITS.minMass, CAL_LIMITS.maxMass); check(sh, "TWater", "The water's initial temperature (°C)", CAL_LIMITS.minTemp, CAL_LIMITS.maxTemp);
    check(sh, "Tf", "The final temperature (°C)", CAL_LIMITS.minTemp, CAL_LIMITS.maxTemp);
    if (finite(sh.TMetal) && finite(sh.TWater) && finite(sh.Tf)) {
      const lo = Math.min(sh.TMetal, sh.TWater); const hi = Math.max(sh.TMetal, sh.TWater);
      if (sh.TMetal === sh.TWater) errors.push("The metal and the water start at the same temperature, so no heat flows.");
      else if (sh.Tf < lo || sh.Tf > hi || sh.Tf === sh.TMetal || sh.Tf === sh.TWater) errors.push("The final temperature must lie strictly between the two starting temperatures (heat flows only from hot to cold).");
    }
  }
  if (r.mode === "mixing" && finite(mx.T1) && finite(mx.T2) && mx.T1 === mx.T2) errors.push("Both samples start at the same temperature, so no heat flows.");
  if (errors.length) return { ok: false, errors };
  const n = (src: Record<string, unknown>, key: string, fb: number) => (finite(src[key]) ? (src[key] as number) : fb);
  return {
    ok: true,
    value: {
      mode: r.mode as CalorimetryMode,
      reaction: { massG: n(re, "massG", 100), cJgK: n(re, "cJgK", C_WATER), ccalJK: n(re, "ccalJK", 0), Ti: n(re, "Ti", 22), Tf: n(re, "Tf", 28.5), moles: n(re, "moles", 0.05) },
      mixing: { m1: n(mx, "m1", 100), c1: n(mx, "c1", C_WATER), T1: n(mx, "T1", 80), m2: n(mx, "m2", 100), c2: n(mx, "c2", C_WATER), T2: n(mx, "T2", 20) },
      specificHeat: { mMetal: n(sh, "mMetal", 50), TMetal: n(sh, "TMetal", 100), mWater: n(sh, "mWater", 100), TWater: n(sh, "TWater", 20), Tf: n(sh, "Tf", 25) },
    },
    warnings: [],
  };
}

export interface CalStep { label: string; expression: string; value: string }
export interface CalorimetryResult {
  steps: CalStep[];
  /** Headline numbers. */
  headline: Array<{ label: string; value: string; note?: string }>;
  classification: "exothermic" | "endothermic" | "none";
  /** Main numeric result: ΔH (kJ/mol), final T (°C) or c (J/(g·K)). */
  value: number;
  unit: string;
  warnings: string[];
}

const sig = (x: number, d = 4) => String(Number(x.toPrecision(d)));

export function analyzeCalorimetry(input: CalorimetryInput): CalorimetryResult {
  if (input.mode === "reaction") {
    const { massG, cJgK, ccalJK, Ti, Tf, moles } = input.reaction;
    const dT = Tf - Ti;
    const qSoln = massG * cJgK * dT;
    const qCal = ccalJK * dT;
    const qRxn = -(qSoln + qCal);
    const dH = qRxn / moles / 1000;
    const warnings = ["Assumes no heat is lost to the surroundings, the solution has the specific heat entered, and the process is at constant pressure (so q = ΔH)."];
    if (Math.abs(dT) < 0.2) warnings.push("The temperature change is under 0.2 °C, which is comparable to thermometer resolution; the result is very uncertain.");
    return {
      steps: [
        { label: "Temperature change", expression: `ΔT = T_f − T_i = ${sig(Tf)} − ${sig(Ti)}`, value: `${sig(dT)} K` },
        { label: "Heat absorbed by the solution", expression: `q_soln = m c ΔT = ${sig(massG)} g × ${sig(cJgK)} J/(g·K) × ${sig(dT)} K`, value: `${sig(qSoln)} J` },
        { label: "Heat absorbed by the calorimeter", expression: `q_cal = C_cal ΔT = ${sig(ccalJK)} J/K × ${sig(dT)} K`, value: `${sig(qCal)} J` },
        { label: "Heat of the reaction", expression: "q_rxn = −(q_soln + q_cal)  (the surroundings gain what the reaction loses)", value: `${sig(qRxn)} J` },
        { label: "Per mole of limiting reagent", expression: `ΔH = q_rxn / n = ${sig(qRxn)} J / ${sig(moles)} mol / 1000`, value: `${sig(dH)} kJ/mol` },
      ],
      headline: [
        { label: "ΔH of reaction", value: `${sig(dH)} kJ/mol`, note: "per mole of the limiting reagent" },
        { label: "Heat of reaction", value: `${sig(qRxn / 1000)} kJ`, note: qRxn < 0 ? "released by the reaction" : qRxn > 0 ? "absorbed by the reaction" : "none" },
        { label: "Temperature change", value: `${dT >= 0 ? "+" : ""}${sig(dT)} K` },
      ],
      classification: dH < 0 ? "exothermic" : dH > 0 ? "endothermic" : "none",
      value: dH,
      unit: "kJ/mol",
      warnings,
    };
  }
  if (input.mode === "mixing") {
    const { m1, c1, T1, m2, c2, T2 } = input.mixing;
    const C1 = m1 * c1; const C2 = m2 * c2;
    const Tf = (C1 * T1 + C2 * T2) / (C1 + C2);
    const q1 = C1 * (Tf - T1);
    return {
      steps: [
        { label: "Heat capacities", expression: `C₁ = m₁c₁ = ${sig(m1)} × ${sig(c1)};  C₂ = m₂c₂ = ${sig(m2)} × ${sig(c2)}`, value: `${sig(C1)} J/K and ${sig(C2)} J/K` },
        { label: "Energy balance", expression: "q₁ + q₂ = 0  →  C₁(T_f − T₁) + C₂(T_f − T₂) = 0", value: "" },
        { label: "Final temperature", expression: `T_f = (C₁T₁ + C₂T₂)/(C₁ + C₂) = (${sig(C1 * T1)} + ${sig(C2 * T2)}) / ${sig(C1 + C2)}`, value: `${sig(Tf)} °C` },
        { label: "Heat transferred", expression: `q₁ = C₁(T_f − T₁) = ${sig(C1)} × ${sig(Tf - T1)}`, value: `${sig(q1)} J (sample 1 ${q1 < 0 ? "loses" : "gains"} it; sample 2 ${q1 < 0 ? "gains" : "loses"} the same amount)` },
      ],
      headline: [
        { label: "Final temperature", value: `${sig(Tf)} °C`, note: "no heat lost, no phase change" },
        { label: "Heat transferred", value: `${sig(Math.abs(q1) / 1000)} kJ` },
      ],
      classification: "none",
      value: Tf,
      unit: "°C",
      warnings: ["Assumes an isolated system, constant specific heats, and no phase change or reaction (for water, stay between 0 and 100 °C)."].concat(
        Tf < 0 || Tf > 100 ? ["The result is outside 0–100 °C; if either sample is water, a phase change would invalidate this answer."] : [],
      ),
    };
  }
  const { mMetal, TMetal, mWater, TWater, Tf } = input.specificHeat;
  const qWater = mWater * C_WATER * (Tf - TWater);
  const cMetal = qWater / (mMetal * (TMetal - Tf));
  return {
    steps: [
      { label: "Heat gained by the water", expression: `q_w = m c ΔT = ${sig(mWater)} g × ${sig(C_WATER)} J/(g·K) × (${sig(Tf)} − ${sig(TWater)}) K`, value: `${sig(qWater)} J` },
      { label: "Heat lost by the metal", expression: "q_m = −q_w (no loss to the surroundings)", value: `${sig(-qWater)} J` },
      { label: "Specific heat of the metal", expression: `c_m = q_w / [m_m (T_metal − T_f)] = ${sig(qWater)} / (${sig(mMetal)} × ${sig(TMetal - Tf)})`, value: `${sig(cMetal)} J/(g·K)` },
    ],
    headline: [{ label: "Specific heat of the metal", value: `${sig(cMetal)} J/(g·K)`, note: "assumes a perfectly insulated calorimeter" }],
    classification: "none",
    value: cMetal,
    unit: "J/(g·K)",
    warnings: ["Assumes the calorimeter itself absorbs no heat and nothing is lost to the air; real results usually come out low."],
  };
}
