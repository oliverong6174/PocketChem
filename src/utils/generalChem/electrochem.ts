/**
 * Electrochemistry for the Electrochemistry Laboratory (pure). A bounded set of curated half-reactions, galvanic cells built from two of
 * them, the Nernst equation, ΔG° and K, and a curated set of electrolyses with Faraday's laws.
 *
 * Conventions
 *  - Every half-reaction is stored as a REDUCTION: oxidised species + n e⁻ → reduced species, with its standard reduction potential E°
 *    (V versus the standard hydrogen electrode, 25 °C, 1 mol/L for dissolved species, 1 bar for gases, pure solids and liquids).
 *  - The oxidation of a species is the reverse reaction; its potential as an oxidation is −E°. A potential is intensive: it is never
 *    multiplied by a stoichiometric coefficient. Combining half-reactions multiplies the REACTIONS (to balance electrons), not the potentials.
 *  - Galvanic cell: E°cell = E°cathode − E°anode. Oxidation is at the anode and reduction at the cathode in every cell; in a galvanic cell
 *    the anode is the negative terminal and the cathode the positive one; in an electrolytic cell the polarity is imposed by the source,
 *    so the anode is positive and the cathode negative, while oxidation is still at the anode.
 *  - Nernst: E = E° − (RT/nF) ln Q with Q the reaction quotient of the overall cell reaction written with the lowest whole electron count n.
 *    Concentrations stand in for activities (ideal solutions), gases enter as pressure in bar, pure solids and liquids have activity 1.
 *
 * Reference data: standard potentials are values of the kind tabulated in the CRC Handbook of Chemistry and Physics ("Electrochemical
 * Series") and in Bard, Parsons & Jordan, Standard Potentials in Aqueous Solution (IUPAC, 1985), to the 3 decimals those sources give for
 * teaching use. Stage 27 cross-checked all 28 couples (identity, electron count, sign, value) against the Wikipedia "Standard electrode
 * potential (data page)" compilation, a SECONDARY source (scripts/reference/stage27/standard-reduction-potentials.json): every value
 * lies within 0.025 V of it and Au3+/Au differs by 0.022 V (1.498 here, 1.52 there), which is genuine source variation. The CRC Handbook
 * and Bard et al. themselves were not opened, so the values are "cross-checked", not "primary-source verified". Standard-state note: the
 * tables use 101.325 kPa for gases while this module says 1 bar; the 0.17 mV-scale difference is below the precision of the data.
 * Not modelled: temperature dependence of E°, activity coefficients, overpotentials, junction potentials, internal resistance, kinetics,
 * and complexation or precipitation.
 */
import { parseFormula } from "./formula";
import { R_GAS, ZERO_C_IN_K } from "./gas";

export const FARADAY = 96485.33212; // C/mol, exact in the 2019 SI (N_A e)
export const T_STANDARD = 298.15;

export type Phase = "aq" | "s" | "l" | "g";
export interface HSpecies { f: string; nu: number; phase: Phase }
export interface HalfReaction {
  id: string;
  /** Plain-language name of the couple, "Zn²⁺/Zn". */
  name: string;
  /** Oxidised side (left, with the electrons) and reduced side (right). */
  ox: HSpecies[];
  red: HSpecies[];
  n: number;
  E0: number;
  /** What the electrode is made of. */
  electrode: string;
  /** Species the learner can set a concentration (mol/L) or pressure (bar) for, excluding H⁺ (set through pH) and pure solids/liquids. */
  tags: Array<"metal" | "gas" | "acid">;
}

const aq = (f: string, nu = 1): HSpecies => ({ f, nu, phase: "aq" });
const sd = (f: string, nu = 1): HSpecies => ({ f, nu, phase: "s" });
const lq = (f: string, nu = 1): HSpecies => ({ f, nu, phase: "l" });
const gs = (f: string, nu = 1): HSpecies => ({ f, nu, phase: "g" });
const H = (nu: number) => aq("H^+", nu);

export const HALF_REACTIONS: HalfReaction[] = [
  { id: "Li", name: "Li⁺/Li", ox: [aq("Li^+")], red: [sd("Li")], n: 1, E0: -3.040, electrode: "Li (illustrative)", tags: ["metal"] },
  { id: "K", name: "K⁺/K", ox: [aq("K^+")], red: [sd("K")], n: 1, E0: -2.931, electrode: "K (illustrative)", tags: ["metal"] },
  { id: "Ca", name: "Ca²⁺/Ca", ox: [aq("Ca^2+")], red: [sd("Ca")], n: 2, E0: -2.868, electrode: "Ca (illustrative)", tags: ["metal"] },
  { id: "Na", name: "Na⁺/Na", ox: [aq("Na^+")], red: [sd("Na")], n: 1, E0: -2.71, electrode: "Na (illustrative)", tags: ["metal"] },
  { id: "Mg", name: "Mg²⁺/Mg", ox: [aq("Mg^2+")], red: [sd("Mg")], n: 2, E0: -2.372, electrode: "Mg", tags: ["metal"] },
  { id: "Al", name: "Al³⁺/Al", ox: [aq("Al^3+")], red: [sd("Al")], n: 3, E0: -1.662, electrode: "Al", tags: ["metal"] },
  { id: "Mn", name: "Mn²⁺/Mn", ox: [aq("Mn^2+")], red: [sd("Mn")], n: 2, E0: -1.185, electrode: "Mn", tags: ["metal"] },
  { id: "Zn", name: "Zn²⁺/Zn", ox: [aq("Zn^2+")], red: [sd("Zn")], n: 2, E0: -0.762, electrode: "Zn", tags: ["metal"] },
  { id: "Cr", name: "Cr³⁺/Cr", ox: [aq("Cr^3+")], red: [sd("Cr")], n: 3, E0: -0.744, electrode: "Cr", tags: ["metal"] },
  { id: "Fe", name: "Fe²⁺/Fe", ox: [aq("Fe^2+")], red: [sd("Fe")], n: 2, E0: -0.447, electrode: "Fe", tags: ["metal"] },
  { id: "Cd", name: "Cd²⁺/Cd", ox: [aq("Cd^2+")], red: [sd("Cd")], n: 2, E0: -0.403, electrode: "Cd", tags: ["metal"] },
  { id: "Co", name: "Co²⁺/Co", ox: [aq("Co^2+")], red: [sd("Co")], n: 2, E0: -0.28, electrode: "Co", tags: ["metal"] },
  { id: "Ni", name: "Ni²⁺/Ni", ox: [aq("Ni^2+")], red: [sd("Ni")], n: 2, E0: -0.257, electrode: "Ni", tags: ["metal"] },
  { id: "Sn", name: "Sn²⁺/Sn", ox: [aq("Sn^2+")], red: [sd("Sn")], n: 2, E0: -0.138, electrode: "Sn", tags: ["metal"] },
  { id: "Pb", name: "Pb²⁺/Pb", ox: [aq("Pb^2+")], red: [sd("Pb")], n: 2, E0: -0.126, electrode: "Pb", tags: ["metal"] },
  { id: "H2", name: "H⁺/H₂ (standard hydrogen electrode)", ox: [H(2)], red: [gs("H2")], n: 2, E0: 0.000, electrode: "Pt (inert), H₂ bubbled", tags: ["gas", "acid"] },
  { id: "Sn4", name: "Sn⁴⁺/Sn²⁺", ox: [aq("Sn^4+")], red: [aq("Sn^2+")], n: 2, E0: 0.151, electrode: "Pt (inert)", tags: ["metal"] },
  { id: "Cu", name: "Cu²⁺/Cu", ox: [aq("Cu^2+")], red: [sd("Cu")], n: 2, E0: 0.342, electrode: "Cu", tags: ["metal"] },
  { id: "I2", name: "I₂/I⁻", ox: [sd("I2")], red: [aq("I^-", 2)], n: 2, E0: 0.5355, electrode: "Pt (inert)", tags: ["metal"] },
  { id: "Fe3", name: "Fe³⁺/Fe²⁺", ox: [aq("Fe^3+")], red: [aq("Fe^2+")], n: 1, E0: 0.771, electrode: "Pt (inert)", tags: ["metal"] },
  { id: "Ag", name: "Ag⁺/Ag", ox: [aq("Ag^+")], red: [sd("Ag")], n: 1, E0: 0.800, electrode: "Ag", tags: ["metal"] },
  { id: "Br2", name: "Br₂/Br⁻", ox: [lq("Br2")], red: [aq("Br^-", 2)], n: 2, E0: 1.066, electrode: "Pt (inert)", tags: ["metal"] },
  { id: "O2", name: "O₂/H₂O (acidic)", ox: [gs("O2"), H(4)], red: [lq("H2O", 2)], n: 4, E0: 1.229, electrode: "Pt (inert), O₂ bubbled", tags: ["gas", "acid"] },
  { id: "Cr2O7", name: "Cr₂O₇²⁻/Cr³⁺ (acidic)", ox: [aq("Cr2O7^2-"), H(14)], red: [aq("Cr^3+", 2), lq("H2O", 7)], n: 6, E0: 1.33, electrode: "Pt (inert)", tags: ["metal", "acid"] },
  { id: "Cl2", name: "Cl₂/Cl⁻", ox: [gs("Cl2")], red: [aq("Cl^-", 2)], n: 2, E0: 1.358, electrode: "Pt (inert), Cl₂ bubbled", tags: ["gas"] },
  { id: "Au", name: "Au³⁺/Au", ox: [aq("Au^3+")], red: [sd("Au")], n: 3, E0: 1.498, electrode: "Au", tags: ["metal"] },
  { id: "MnO4", name: "MnO₄⁻/Mn²⁺ (acidic)", ox: [aq("MnO4^-"), H(8)], red: [aq("Mn^2+"), lq("H2O", 4)], n: 5, E0: 1.507, electrode: "Pt (inert)", tags: ["metal", "acid"] },
  { id: "F2", name: "F₂/F⁻", ox: [gs("F2")], red: [aq("F^-", 2)], n: 2, E0: 2.866, electrode: "Pt (inert) (illustrative)", tags: ["gas"] },
];
export const halfReaction = (id: string): HalfReaction | undefined => HALF_REACTIONS.find((h) => h.id === id);

/** Species of a half-reaction the learner may set (dissolved species except H⁺, and gases), in a fixed order: oxidised side then reduced side. */
export function variableSpecies(h: HalfReaction): HSpecies[] {
  const out: HSpecies[] = [];
  for (const s of [...h.ox, ...h.red]) if ((s.phase === "aq" || s.phase === "g") && s.f !== "H^+" && !out.some((o) => o.f === s.f)) out.push(s);
  return out;
}
export const usesProtons = (h: HalfReaction) => [...h.ox, ...h.red].some((s) => s.f === "H^+");

// ---- limits and conditions -------------------------------------------------------------------------------------------------------------

export const ELECTRO_LIMITS = { minConc: 1e-9, maxConc: 20, minBar: 1e-6, maxBar: 100, minPH: -1, maxPH: 15, minTC: 0, maxTC: 100 } as const;

export interface CellInput {
  a: string;
  b: string;
  /** Concentration (mol/L) or gas pressure (bar) for the variable species of each half-cell, in `variableSpecies` order. */
  ca: number[];
  cb: number[];
  /** pH of any half-cell involving H⁺ (both half-cells share it in this model). */
  pH: number;
  TC: number;
}
export const standardConditions = (id: string): number[] => { const h = halfReaction(id); return h ? variableSpecies(h).map(() => 1) : []; };
/** Daniell cell: Zn²⁺/Zn and Cu²⁺/Cu each have one variable species (the metal ion), both at 1 mol/L. */
export const DEFAULT_CELL: CellInput = { a: "Zn", b: "Cu", ca: [1], cb: [1], pH: 0, TC: 25 };

/** The lowest common multiple of two electron counts. */
const gcdI = (a: number, b: number): number => (b === 0 ? a : gcdI(b, a % b));
const lcm = (a: number, b: number) => (a / gcdI(a, b)) * b;

export interface NetSpecies { f: string; nu: number; phase: Phase }
export interface CellReaction { n: number; reactants: NetSpecies[]; products: NetSpecies[]; kc: number; ka: number }

/** The overall reaction of a cell: cathode reduction as written, anode half reversed, scaled to the same electron count, electrons and common species cancelled. */
export function combine(cathode: HalfReaction, anode: HalfReaction): CellReaction {
  const n = lcm(cathode.n, anode.n);
  const kc = n / cathode.n; const ka = n / anode.n;
  const net = new Map<string, NetSpecies & { net: number }>();
  const add = (s: HSpecies, amount: number) => {
    const key = `${s.f}|${s.phase}`;
    const cur = net.get(key) ?? { f: s.f, phase: s.phase, nu: 0, net: 0 };
    cur.net += amount;
    net.set(key, cur);
  };
  // products minus reactants; the cathode runs forward, the anode backward
  for (const s of cathode.red) add(s, s.nu * kc);
  for (const s of cathode.ox) add(s, -s.nu * kc);
  for (const s of anode.ox) add(s, s.nu * ka);
  for (const s of anode.red) add(s, -s.nu * ka);
  const reactants: NetSpecies[] = []; const products: NetSpecies[] = [];
  for (const v of net.values()) {
    if (v.net < 0) reactants.push({ f: v.f, phase: v.phase, nu: -v.net });
    else if (v.net > 0) products.push({ f: v.f, phase: v.phase, nu: v.net });
  }
  return { n, reactants, products, kc, ka };
}

const phaseTag = (p: Phase) => (p === "aq" ? "(aq)" : p === "s" ? "(s)" : p === "l" ? "(l)" : "(g)");
export const speciesText = (s: { f: string; nu: number; phase: Phase }, withPhase = true) => `${s.nu === 1 ? "" : s.nu} ${s.f}${withPhase ? phaseTag(s.phase) : ""}`.trim();
/** Equation in the plain input syntax (parseable species), e.g. "Zn(s) + Cu^2+(aq) -> Zn^2+(aq) + Cu(s)". */
export const reactionText = (r: { reactants: Array<{ f: string; nu: number; phase: Phase }>; products: Array<{ f: string; nu: number; phase: Phase }> }, electrons = 0) => {
  const side = (l: Array<{ f: string; nu: number; phase: Phase }>) => l.map((s) => speciesText(s)).join(" + ");
  const left = side(r.reactants); const right = side(r.products);
  return electrons ? `${left} + ${electrons} e- -> ${right}` : `${left} -> ${right}`;
};
export const halfText = (h: HalfReaction, direction: "reduction" | "oxidation"): { left: HSpecies[]; right: HSpecies[]; electrons: number } =>
  direction === "reduction" ? { left: h.ox, right: h.red, electrons: h.n } : { left: h.red, right: h.ox, electrons: h.n };

// ---- Nernst -----------------------------------------------------------------------------------------------------------------------------

function activity(s: HSpecies, values: number[], vars: HSpecies[], pH: number): number {
  if (s.phase === "s" || s.phase === "l") return 1;
  if (s.f === "H^+") return 10 ** -pH;
  const idx = vars.findIndex((v) => v.f === s.f);
  return values[idx];
}
/** ln of the reduction quotient of one half-cell: Π a(reduced)^ν / Π a(oxidised)^ν. */
export function lnHalfQ(h: HalfReaction, values: number[], pH: number): number {
  const vars = variableSpecies(h);
  let ln = 0;
  for (const s of h.red) ln += s.nu * Math.log(activity(s, values, vars, pH));
  for (const s of h.ox) ln -= s.nu * Math.log(activity(s, values, vars, pH));
  return ln;
}
/** Potential of one half-cell (as a reduction) under the stated conditions (V vs SHE): E = E° − (RT/nF) ln Q_half. */
export function halfPotential(h: HalfReaction, values: number[], pH: number, T: number): number {
  return h.E0 - ((R_GAS * T) / (h.n * FARADAY)) * lnHalfQ(h, values, pH);
}

export function checkConditions(h: HalfReaction, values: number[], pH: number, label: string): string[] {
  const errors: string[] = [];
  const vars = variableSpecies(h);
  if (values.length !== vars.length) return [`${label}: expected ${vars.length} concentration value(s).`];
  vars.forEach((v, i) => {
    const x = values[i];
    if (!Number.isFinite(x)) { errors.push(`${label}, ${v.f}: enter a number.`); return; }
    if (v.phase === "g") { if (x < ELECTRO_LIMITS.minBar || x > ELECTRO_LIMITS.maxBar) errors.push(`${label}, ${v.f}: pressure must be ${ELECTRO_LIMITS.minBar}–${ELECTRO_LIMITS.maxBar} bar.`); }
    else if (x < ELECTRO_LIMITS.minConc || x > ELECTRO_LIMITS.maxConc) errors.push(`${label}, ${v.f}: concentration must be ${ELECTRO_LIMITS.minConc}–${ELECTRO_LIMITS.maxConc} mol/L.`);
  });
  if (usesProtons(h) && !(Number.isFinite(pH) && pH >= ELECTRO_LIMITS.minPH && pH <= ELECTRO_LIMITS.maxPH)) errors.push(`pH must be from ${ELECTRO_LIMITS.minPH} to ${ELECTRO_LIMITS.maxPH}.`);
  return errors;
}

export interface CellResult {
  cathode: HalfReaction; anode: HalfReaction;
  /** Values for each half-cell, matching `cathode`/`anode`. */
  cathodeValues: number[]; anodeValues: number[];
  reaction: CellReaction;
  n: number;
  E0cell: number;
  E: number;
  lnQ: number;
  Q: number;
  log10Q: number;
  T: number;
  /** ΔG° = −nFE° (J per mole of the reaction as written). */
  dG0: number;
  /** ΔG = −nFE (J/mol). */
  dG: number;
  /** K = exp(nFE°/RT) (reported as ln K and log10 K to avoid overflow). */
  lnK: number;
  log10K: number;
  /** The assignment the model chose differs from the standard one (concentrations reverse the cell). */
  reversedByConditions: boolean;
  /** Potentials of each half-cell (as reductions) under the conditions. */
  Ecathode: number; Eanode: number;
}
export type CellOutcome = { ok: true; value: CellResult } | { ok: false; errors: string[] };

export function buildGalvanicCell(c: CellInput): CellOutcome {
  const A = halfReaction(c.a); const B = halfReaction(c.b);
  const errors: string[] = [];
  if (!A) errors.push("Choose the first half-cell from the list.");
  if (!B) errors.push("Choose the second half-cell from the list.");
  if (errors.length) return { ok: false, errors };
  if (A!.id === B!.id) return { ok: false, errors: ["The two half-cells are the same couple. Choose two different couples."] };
  if (!(Number.isFinite(c.TC) && c.TC >= ELECTRO_LIMITS.minTC && c.TC <= ELECTRO_LIMITS.maxTC)) errors.push(`Temperature must be ${ELECTRO_LIMITS.minTC}–${ELECTRO_LIMITS.maxTC} °C.`);
  errors.push(...checkConditions(A!, c.ca, c.pH, A!.name), ...checkConditions(B!, c.cb, c.pH, B!.name));
  if (errors.length) return { ok: false, errors };
  const T = c.TC + ZERO_C_IN_K;
  const Ea = halfPotential(A!, c.ca, c.pH, T); const Eb = halfPotential(B!, c.cb, c.pH, T);
  const aIsCathode = Ea > Eb || (Ea === Eb && A!.E0 >= B!.E0);
  const cathode = aIsCathode ? A! : B!; const anode = aIsCathode ? B! : A!;
  const cv = aIsCathode ? c.ca : c.cb; const av = aIsCathode ? c.cb : c.ca;
  const reaction = combine(cathode, anode);
  const n = reaction.n;
  const Ecathode = aIsCathode ? Ea : Eb; const Eanode = aIsCathode ? Eb : Ea;
  const E = Ecathode - Eanode;
  const E0cell = cathode.E0 - anode.E0;
  const lnQ = reaction.kc * lnHalfQ(cathode, cv, c.pH) - reaction.ka * lnHalfQ(anode, av, c.pH);
  const dG0 = -n * FARADAY * E0cell;
  const lnK = (n * FARADAY * E0cell) / (R_GAS * T);
  return {
    ok: true,
    value: {
      cathode, anode, cathodeValues: cv, anodeValues: av, reaction, n, E0cell, E, lnQ, Q: Math.exp(lnQ), log10Q: lnQ / Math.LN10, T,
      dG0, dG: -n * FARADAY * E, lnK, log10K: lnK / Math.LN10, reversedByConditions: E0cell < 0, Ecathode, Eanode,
    },
  };
}

/** E as a function of log10 Q for the cell's own n and T: a straight line with slope −(RT ln10)/(nF) ≈ −0.0592/n V at 25 °C. */
export const nernstAtLog10Q = (E0: number, n: number, T: number, log10Q: number) => E0 - ((R_GAS * T * Math.LN10) / (n * FARADAY)) * log10Q;
export const nernstSlope = (n: number, T: number) => (R_GAS * T * Math.LN10) / (n * FARADAY);

// ---- electrolysis -------------------------------------------------------------------------------------------------------------------------

export interface ElectrolysisCase {
  id: string;
  name: string;
  /** Electrolyte and electrodes in words. */
  setup: string;
  cathode: HalfReaction;
  /** The anode reaction as an oxidation (what actually happens at the anode). */
  anodeOx: { left: HSpecies[]; right: HSpecies[]; n: number; reductionPartner: HalfReaction | null };
  /** Minimum applied voltage from E° (V), or null when the aqueous E° table does not apply (molten salts). */
  minVoltage: number | null;
  note: string;
}

const mkHalf = (id: string, name: string, ox: HSpecies[], red: HSpecies[], n: number, E0: number): HalfReaction => ({ id, name, ox, red, n, E0, electrode: "", tags: [] });
const NA_MOLTEN = mkHalf("Na-melt", "Na⁺/Na (molten)", [aq("Na^+")], [lq("Na")], 1, NaN);
const CL_MOLTEN = mkHalf("Cl-melt", "Cl₂/Cl⁻ (molten)", [gs("Cl2")], [aq("Cl^-", 2)], 2, NaN);
const metalCase = (id: string, label: string, ion: string, symbol: string, n: number): ElectrolysisCase => {
  const h = halfReaction(id) as HalfReaction;
  return { id: `${id}-plate`, name: `${label} plating or refining`, setup: `${ion} solution with a ${symbol} cathode and a ${symbol} anode`, cathode: h, anodeOx: { left: h.red, right: h.ox, n, reductionPartner: h }, minVoltage: 0, note: "Both electrodes are the same metal, so the thermodynamic minimum is 0 V; a real cell needs a driving voltage for resistance and overpotentials." };
};
export const ELECTROLYSIS_CASES: ElectrolysisCase[] = [
  metalCase("Cu", "Copper", "Cu²⁺(aq) (copper sulfate)", "Cu", 2),
  metalCase("Ag", "Silver", "Ag⁺(aq) (silver nitrate)", "Ag", 1),
  metalCase("Ni", "Nickel", "Ni²⁺(aq) (nickel sulfate)", "Ni", 2),
  metalCase("Zn", "Zinc", "Zn²⁺(aq) (zinc sulfate)", "Zn", 2),
  {
    id: "cu-inert", name: "Copper from copper sulfate, inert anode", setup: "Cu²⁺(aq) with a Cu cathode and an inert (platinum) anode, acidic",
    cathode: halfReaction("Cu") as HalfReaction,
    anodeOx: { left: (halfReaction("O2") as HalfReaction).red, right: (halfReaction("O2") as HalfReaction).ox, n: 4, reductionPartner: halfReaction("O2") as HalfReaction },
    minVoltage: (halfReaction("O2") as HalfReaction).E0 - (halfReaction("Cu") as HalfReaction).E0,
    note: "Water is oxidised at the inert anode (O₂ and H⁺ form). The minimum voltage is the thermodynamic E° difference; overpotential at the anode raises the real value.",
  },
  {
    id: "water", name: "Electrolysis of water (acidic)", setup: "dilute H₂SO₄(aq) with inert platinum electrodes",
    cathode: halfReaction("H2") as HalfReaction,
    anodeOx: { left: (halfReaction("O2") as HalfReaction).red, right: (halfReaction("O2") as HalfReaction).ox, n: 4, reductionPartner: halfReaction("O2") as HalfReaction },
    minVoltage: (halfReaction("O2") as HalfReaction).E0 - (halfReaction("H2") as HalfReaction).E0,
    note: "The minimum 1.229 V is the reverse of the hydrogen–oxygen cell; practical cells need more because of overpotentials.",
  },
  {
    id: "molten-nacl", name: "Molten sodium chloride", setup: "molten NaCl with inert electrodes (no water present)",
    cathode: NA_MOLTEN,
    anodeOx: { left: CL_MOLTEN.red, right: CL_MOLTEN.ox, n: 2, reductionPartner: null },
    minVoltage: null,
    note: "The aqueous potential table does not apply to a molten salt, so no minimum voltage is given. In aqueous NaCl the products depend on overpotentials and concentrations, and are not predicted here.",
  },
];
export const electrolysisCase = (id: string) => ELECTROLYSIS_CASES.find((c) => c.id === id);

export interface ElectrolysisInput { id: string; I: number; tMin: number; eff: number; TC: number; PkPa: number }
export const DEFAULT_ELECTROLYSIS: ElectrolysisInput = { id: "Cu-plate", I: 2, tMin: 30, eff: 100, TC: 25, PkPa: 101.325 };
export const ELECTROLYSIS_LIMITS = { maxI: 1e4, maxMin: 1e5, minEff: 0.1, maxEff: 100 } as const;

export interface ElectrodeProduct { f: string; phase: Phase; role: "formed" | "consumed"; mol: number; massG: number; volumeL: number | null }
export interface ElectrolysisResult {
  Q: number;
  molElectrons: number;
  cathode: ElectrodeProduct[];
  anode: ElectrodeProduct[];
  /** Mass of the product on the cathode (first formed species), g, for the time graph. */
  cathodeMassG: number;
  rateGPerMin: number;
  minVoltage: number | null;
}
export type ElectrolysisOutcome = { ok: true; value: ElectrolysisResult } | { ok: false; errors: string[] };

const massOfSpecies = (f: string): number => { const p = parseFormula(f); return p.ok ? p.value.mass : NaN; };

export function solveElectrolysis(e: ElectrolysisInput, tMinOverride?: number): ElectrolysisOutcome {
  const c = electrolysisCase(e.id);
  const errors: string[] = [];
  if (!c) return { ok: false, errors: ["Choose one of the supported electrolysis cases."] };
  if (!Number.isFinite(e.I) || e.I <= 0 || e.I > ELECTROLYSIS_LIMITS.maxI) errors.push(`The current must be above 0 and at most ${ELECTROLYSIS_LIMITS.maxI} A.`);
  const tMin = tMinOverride ?? e.tMin;
  if (!Number.isFinite(tMin) || tMin < 0 || tMin > ELECTROLYSIS_LIMITS.maxMin) errors.push(`The time must be from 0 to ${ELECTROLYSIS_LIMITS.maxMin} minutes.`);
  if (!Number.isFinite(e.eff) || e.eff < ELECTROLYSIS_LIMITS.minEff || e.eff > ELECTROLYSIS_LIMITS.maxEff) errors.push(`The current efficiency must be from ${ELECTROLYSIS_LIMITS.minEff} to ${ELECTROLYSIS_LIMITS.maxEff} %.`);
  if (!(Number.isFinite(e.TC) && e.TC >= 0 && e.TC <= 100)) errors.push("The gas temperature must be 0–100 °C.");
  if (!(Number.isFinite(e.PkPa) && e.PkPa >= 1 && e.PkPa <= 10000)) errors.push("The gas pressure must be 1–10 000 kPa.");
  if (errors.length) return { ok: false, errors };
  const Q = e.I * tMin * 60;
  const molE = Q / FARADAY;
  const frac = e.eff / 100;
  const T = e.TC + ZERO_C_IN_K; const P = e.PkPa * 1000;
  const make = (species: HSpecies, role: "formed" | "consumed", n: number): ElectrodeProduct => {
    const mol = (species.nu / n) * molE * frac;
    const gas = species.phase === "g" ? (mol * R_GAS * T) / P * 1000 : null;
    return { f: species.f, phase: species.phase, role, mol, massG: mol * massOfSpecies(species.f), volumeL: gas };
  };
  const cathode: ElectrodeProduct[] = [
    ...c.cathode.red.map((s) => make(s, "formed", c.cathode.n)),
    ...c.cathode.ox.map((s) => make(s, "consumed", c.cathode.n)),
  ];
  const anode: ElectrodeProduct[] = [
    ...c.anodeOx.right.map((s) => make(s, "formed", c.anodeOx.n)),
    ...c.anodeOx.left.map((s) => make(s, "consumed", c.anodeOx.n)),
  ];
  const first = cathode[0];
  return { ok: true, value: { Q, molElectrons: molE, cathode, anode, cathodeMassG: first.massG, rateGPerMin: ((e.I * 60) / FARADAY) * frac * (c.cathode.red[0].nu / c.cathode.n) * massOfSpecies(c.cathode.red[0].f), minVoltage: c.minVoltage } };
}

export type CellKind = "galvanic" | "electrolytic";
/** Where oxidation and reduction happen, the terminal signs, and which way electrons and conventional current go (external circuit). */
export function polarity(kind: CellKind) {
  return {
    oxidationAt: "anode" as const,
    reductionAt: "cathode" as const,
    anodeSign: kind === "galvanic" ? ("negative" as const) : ("positive" as const),
    cathodeSign: kind === "galvanic" ? ("positive" as const) : ("negative" as const),
    electronsFlow: "from the anode through the external circuit to the cathode" as const,
    conventionalCurrent: "from the cathode through the external circuit to the anode (opposite to the electron flow)" as const,
    driver: kind === "galvanic" ? "the spontaneous cell reaction drives the current" : "an external source drives the reaction against its natural direction",
  };
}
