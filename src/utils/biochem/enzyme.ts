/**
 * Idealised single-substrate enzyme kinetics and reversible inhibition (pure; no React).
 *
 * Model: E + S ⇌ ES → E + P, steady state, [S] ≫ [E], [P] ≈ 0 (initial rate). v = Vmax[S] / (Km + [S]).
 * Reversible inhibition with an inhibitor I binding E (constant Ki) and/or ES (constant Ki′):
 *     α = 1 + [I]/Ki,   α′ = 1 + [I]/Ki′,   v = Vmax[S] / (α·Km + α′·[S])
 *     Vmax,app = Vmax / α′,   Km,app = (α / α′) · Km
 * Competitive: α′ = 1 · Uncompetitive: α = 1 · Pure noncompetitive: α = α′ (Ki = Ki′) · Mixed: α ≠ α′, both > 1.
 * The curves, the apparent parameters, the double-reciprocal lines and the species fractions in the binding diagram all come from these same
 * two numbers, α and α′. Real inhibitors are not always ideal (tight binding, slow binding, irreversible or substrate-inhibited enzymes,
 * allosteric cooperativity and multi-substrate mechanisms all behave differently).
 */

export const KINETIC_LIMITS = { vmax: [0.01, 1000], km: [0.01, 1000], conc: [0, 1000], ki: [0.01, 1000], substrateMax: 5000 } as const;
export const R_GAS = 8.314462618; // J/(mol·K)

export const velocity = (vmax: number, km: number, s: number): number => (vmax * s) / (km + s);

export type InhibitionType = "none" | "competitive" | "uncompetitive" | "noncompetitive" | "mixed";
export const INHIBITION_TYPES: readonly InhibitionType[] = ["none", "competitive", "uncompetitive", "noncompetitive", "mixed"];
export interface InhibitionInput { type: InhibitionType; /** [I] in the same concentration unit as Km */ conc: number; /** binding of I to free E */ ki: number; /** binding of I to the ES complex */ kiPrime: number }
export interface EnzymeInput { vmax: number; km: number; substrate: number; /** optional total enzyme concentration (same unit as Vmax·time/…); 0 = not given */ enzymeTotal: number; inhibition: InhibitionInput }

export const DEFAULT_ENZYME_INPUT: EnzymeInput = { vmax: 100, km: 2, substrate: 2, enzymeTotal: 0, inhibition: { type: "competitive", conc: 5, ki: 2, kiPrime: 4 } };

/** α and α′ of an inhibition setting; the type decides which of the two constants applies. */
export function alphas(i: InhibitionInput): { alpha: number; alphaPrime: number } {
  const a = 1 + i.conc / i.ki, b = 1 + i.conc / i.kiPrime;
  switch (i.type) {
    case "none": return { alpha: 1, alphaPrime: 1 };
    case "competitive": return { alpha: a, alphaPrime: 1 };
    case "uncompetitive": return { alpha: 1, alphaPrime: b };
    case "noncompetitive": return { alpha: a, alphaPrime: a }; // pure noncompetitive: Ki = Ki′ (the single constant is `ki`)
    case "mixed": return { alpha: a, alphaPrime: b };
  }
}

export interface Apparent { alpha: number; alphaPrime: number; vmaxApp: number; kmApp: number; /** catalytic efficiency ratio (Vmax/Km)app ÷ (Vmax/Km) = 1/α */ efficiencyRatio: number }
export function apparentParameters(vmax: number, km: number, i: InhibitionInput): Apparent {
  const { alpha, alphaPrime } = alphas(i);
  return { alpha, alphaPrime, vmaxApp: vmax / alphaPrime, kmApp: (alpha / alphaPrime) * km, efficiencyRatio: 1 / alpha };
}
export function inhibitedVelocity(vmax: number, km: number, s: number, i: InhibitionInput): number {
  const { alpha, alphaPrime } = alphas(i);
  return (vmax * s) / (alpha * km + alphaPrime * s);
}

/** Direction of change of an apparent parameter relative to the uninhibited enzyme. */
export const direction = (app: number, base: number, tol = 1e-9): "increases" | "decreases" | "unchanged" => (Math.abs(app - base) <= tol * Math.max(1, Math.abs(base)) ? "unchanged" : app > base ? "increases" : "decreases");

/**
 * Species fractions of the enzyme at a given [S] and [I] under RAPID EQUILIBRIUM (Km taken as the dissociation constant of ES). Which complexes
 * can form follows from the mechanism: I binds E (EI) in competitive, noncompetitive and mixed inhibition; I binds ES (ESI) in uncompetitive,
 * noncompetitive and mixed inhibition. v/Vmax equals the ES fraction, which reproduces the velocity equation above exactly.
 */
export function speciesFractions(km: number, s: number, i: InhibitionInput): { E: number; ES: number; EI: number; ESI: number } {
  const bindsE = i.type === "competitive" || i.type === "noncompetitive" || i.type === "mixed";
  const bindsES = i.type === "uncompetitive" || i.type === "noncompetitive" || i.type === "mixed";
  const kiPrime = i.type === "noncompetitive" ? i.ki : i.kiPrime;
  const E = 1, ES = s / km, EI = bindsE ? i.conc / i.ki : 0, ESI = bindsES ? (s / km) * (i.conc / kiPrime) : 0;
  const t = E + ES + EI + ESI;
  return { E: E / t, ES: ES / t, EI: EI / t, ESI: ESI / t };
}

/** Double-reciprocal (Lineweaver–Burk) line 1/v = slope·(1/[S]) + intercept. */
export function lineweaver(vmax: number, km: number, i: InhibitionInput): { slope: number; intercept: number; xIntercept: number } {
  const { alpha, alphaPrime } = alphas(i);
  return { slope: (alpha * km) / vmax, intercept: alphaPrime / vmax, xIntercept: -alphaPrime / (alpha * km) };
}

export const percentOfVmax = (km: number, s: number) => (100 * s) / (km + s);
/** [S] needed for a given fraction of Vmax (0 < f < 1): [S] = f·Km / (1 − f). */
export const substrateForFraction = (km: number, f: number) => (f * km) / (1 - f);

/** Catalytic constants from an enzyme concentration: kcat = Vmax / [E]t, and the specificity constant kcat / Km. */
export function catalyticConstants(vmax: number, km: number, enzymeTotal: number): { kcat: number; efficiency: number } | null {
  return enzymeTotal > 0 ? { kcat: vmax / enzymeTotal, efficiency: vmax / enzymeTotal / km } : null;
}

export type Valid<T> = { ok: true; value: T } | { ok: false; errors: string[] };
export function validateEnzymeInput(raw: unknown): Valid<EnzymeInput> {
  const errors: string[] = [];
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const inh = (typeof r.inhibition === "object" && r.inhibition !== null ? r.inhibition : {}) as Record<string, unknown>;
  const num = (v: unknown, name: string, lo: number, hi: number, inclusiveLo = true): number => {
    if (typeof v !== "number" || !Number.isFinite(v)) { errors.push(`${name} must be a number.`); return NaN; }
    if (v < lo || v > hi || (!inclusiveLo && v <= lo)) errors.push(`${name} must be between ${lo} and ${hi}.`);
    return v;
  };
  const vmax = num(r.vmax, "Vmax", KINETIC_LIMITS.vmax[0], KINETIC_LIMITS.vmax[1]);
  const km = num(r.km, "Km", KINETIC_LIMITS.km[0], KINETIC_LIMITS.km[1]);
  const substrate = num(r.substrate, "[S]", 0, KINETIC_LIMITS.substrateMax);
  const enzymeTotal = num(r.enzymeTotal, "[E]total", 0, 1000);
  const type = inh.type;
  if (typeof type !== "string" || !(INHIBITION_TYPES as readonly string[]).includes(type)) errors.push("Unknown inhibition type.");
  const conc = num(inh.conc, "[I]", KINETIC_LIMITS.conc[0], KINETIC_LIMITS.conc[1]);
  const ki = num(inh.ki, "Ki", KINETIC_LIMITS.ki[0], KINETIC_LIMITS.ki[1]);
  const kiPrime = num(inh.kiPrime, "Ki′", KINETIC_LIMITS.ki[0], KINETIC_LIMITS.ki[1]);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { vmax, km, substrate, enzymeTotal, inhibition: { type: type as InhibitionType, conc, ki, kiPrime } } };
}

// ---- energy profile ---------------------------------------------------------------------------------------------------------------

export const ENERGY_LIMITS = { deltaG: [-40, 40], decades: [0, 12] } as const;
export interface EnergyInput { /** reaction ΔG° in kJ/mol (negative = products more stable) */ deltaG: number; /** rate enhancement of the catalysed reaction, as log10(kcat_cat / k_uncat) */ decades: number }
export const DEFAULT_ENERGY_INPUT: EnergyInput = { deltaG: -10, decades: 6 };
/** Lowering of the activation free energy that gives a rate enhancement of 10^decades at temperature T (transition-state theory): ΔΔG‡ = RT·ln(10)·decades. */
export const barrierLoweringKJ = (decades: number, T = 298.15) => (R_GAS * T * Math.LN10 * decades) / 1000;
/** Equilibrium constant from ΔG° = −RT ln K. The same value applies with and without a catalyst. */
export const equilibriumConstant = (deltaGkJ: number, T = 298.15) => Math.exp((-deltaGkJ * 1000) / (R_GAS * T));
export function validateEnergyInput(raw: unknown): Valid<EnergyInput> {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const num = (v: unknown, name: string, [lo, hi]: readonly [number, number]) => { if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) errors.push(`${name} must be a number from ${lo} to ${hi}.`); return v as number; };
  const deltaG = num(r.deltaG, "ΔG°", ENERGY_LIMITS.deltaG), decades = num(r.decades, "Rate enhancement (powers of ten)", ENERGY_LIMITS.decades);
  return errors.length ? { ok: false, errors } : { ok: true, value: { deltaG, decades } };
}

/** Conceptual profile points in relative drawing units (NOT energies of a real reaction): reactants, transition state, products. */
export function energyProfile(input: EnergyInput): { uncatalysed: Array<{ x: number; y: number }>; catalysed: Array<{ x: number; y: number }>; ddG: number; K: number; kRatio: number } {
  const scale = 1.0; // 1 kJ/mol = 1 drawing unit; the reference barrier is a drawing choice
  const ref = 100;
  const ddG = barrierLoweringKJ(input.decades);
  const tsUn = ref + Math.max(0, input.deltaG), tsCat = Math.max(Math.max(0, input.deltaG) + 4, tsUn - ddG * scale);
  const prod = input.deltaG;
  const curve = (ts: number, esDip: number) => [{ x: 0, y: 0 }, { x: 0.2, y: -esDip }, { x: 0.5, y: ts }, { x: 0.8, y: prod - esDip * 0.5 }, { x: 1, y: prod }];
  return { uncatalysed: curve(tsUn, 0).filter((_, i) => i !== 1 && i !== 3).concat([]), catalysed: curve(tsCat, 12), ddG, K: equilibriumConstant(input.deltaG), kRatio: 10 ** input.decades };
}

// ---- mechanism (worked example: a serine protease) ---------------------------------------------------------------------------------

export type BindingModel = "lock-and-key" | "induced-fit" | "conformational-selection";
export const BINDING_MODELS: Record<BindingModel, { label: string; text: string }> = {
  "lock-and-key": { label: "Lock and key", text: "The active site has a fixed shape that already matches the substrate. This explains specificity but not why some enzymes bind transition states best or change shape on binding; it is an analogy, not how most enzymes behave." },
  "induced-fit": { label: "Induced fit", text: "Substrate binding alters the shape of the enzyme (and sometimes the substrate), improving complementarity and positioning the catalytic groups. The conformational change follows binding." },
  "conformational-selection": { label: "Conformational selection", text: "The free enzyme already samples several conformations; the substrate preferentially binds the one that fits and shifts the equilibrium toward it. The conformational change precedes binding. Induced fit and conformational selection can both contribute and are hard to separate experimentally." },
};

export interface MechState {
  id: string; title: string; species: string; text: string;
  /** What the diagram draws */
  substrate: "free" | "bound-intact" | "tetrahedral" | "acyl-enzyme" | "second-tetrahedral" | "released";
  site: "open" | "closed";
  /** state of Ser195 O–H / His57 */
  ser: "OH" | "O–C bond" | "O–H restored";
  his: "neutral" | "protonated";
  oxyanion: boolean;
  water: boolean;
  product1: "none" | "leaving" | "free";
  product2: "none" | "leaving" | "free";
}
export const MECHANISM_NOTE = "A worked example of ONE mechanism class (a chymotrypsin-like serine protease cutting a peptide bond). Other enzymes use different catalytic strategies (metal ions, covalent catalysis with other residues, cofactors, RNA) and different step counts.";
export const MECHANISM: MechState[] = [
  { id: "free", title: "Free enzyme and substrate", species: "E + S", text: "The enzyme (E) and a peptide substrate (S) are separate. The catalytic triad (Asp102, His57, Ser195) sits in the active site; Ser195's O–H is not yet a good nucleophile.", substrate: "free", site: "open", ser: "OH", his: "neutral", oxyanion: false, water: false, product1: "none", product2: "none" },
  { id: "binding", title: "Substrate recognition", species: "E + S ⇌ ES", text: "The substrate's large hydrophobic side chain (P1, such as Phe or Tyr) enters the hydrophobic S1 pocket, and backbone N–H and C=O groups of the substrate hydrogen-bond to the enzyme. This is what makes the enzyme specific. The scissile peptide bond lies next to Ser195.", substrate: "bound-intact", site: "open", ser: "OH", his: "neutral", oxyanion: false, water: false, product1: "none", product2: "none" },
  { id: "fit", title: "Positioning (induced fit / conformational selection)", species: "ES", text: "The site closes around the substrate (or the substrate selects the closed conformer). The carbonyl carbon of the scissile bond is placed close to Ser195's oxygen and its oxygen sits in the oxyanion hole (the backbone N–H groups of Gly193 and Ser195).", substrate: "bound-intact", site: "closed", ser: "OH", his: "neutral", oxyanion: true, water: false, product1: "none", product2: "none" },
  { id: "attack", title: "Nucleophilic attack: first tetrahedral intermediate", species: "ES → ES‡ (tetrahedral intermediate)", text: "His57 (held by Asp102) acts as a general base and removes the proton from Ser195's O–H as the serine oxygen attacks the carbonyl carbon. The carbonyl oxygen becomes an oxyanion, stabilised by the oxyanion hole. The enzyme stabilises this high-energy tetrahedral species (and the transition states leading to it), which lowers the activation barrier.", substrate: "tetrahedral", site: "closed", ser: "O–C bond", his: "protonated", oxyanion: true, water: false, product1: "none", product2: "none" },
  { id: "acyl", title: "Acyl-enzyme formed; first product leaves", species: "EP₁ (acyl-enzyme) + P₁", text: "The tetrahedral intermediate collapses: the C–N bond breaks as His57, now a general acid, gives its proton to the leaving nitrogen. The amine fragment (P₁) is released, leaving the acyl group covalently attached to Ser195 as an ester (the acyl-enzyme).", substrate: "acyl-enzyme", site: "closed", ser: "O–C bond", his: "neutral", oxyanion: false, water: false, product1: "leaving", product2: "none" },
  { id: "water", title: "Water attacks: second tetrahedral intermediate", species: "EP₁ + H₂O → tetrahedral intermediate 2", text: "A water molecule enters the space left by the first product. His57 acts as a general base again and activates the water, which attacks the carbonyl carbon of the acyl-enzyme, giving a second tetrahedral intermediate stabilised by the oxyanion hole.", substrate: "second-tetrahedral", site: "closed", ser: "O–C bond", his: "protonated", oxyanion: true, water: true, product1: "free", product2: "none" },
  { id: "release", title: "Second product leaves; enzyme regenerated", species: "EP₂ → E + P₂", text: "The intermediate collapses, breaking the Ser195 ester; His57 returns its proton to Ser195. The carboxylic-acid fragment (P₂) is released and the enzyme is back in its original state, ready to bind another substrate. The enzyme is not consumed.", substrate: "released", site: "open", ser: "O–H restored", his: "neutral", oxyanion: false, water: false, product1: "free", product2: "leaving" },
];
