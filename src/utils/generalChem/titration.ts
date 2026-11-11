/**
 * Titration model (General Chemistry, Stage 11). One analyte, one strong titrant, 25 °C, ideal solution.
 *
 * Supported: strong acid + strong base, weak acid + strong base, strong base + strong acid, weak base + strong acid.
 * The titrant is always the strong reagent of the opposite kind. Every point, the curve, the special points and the
 * explanations all call solveEquilibrium() with the diluted composition, so they cannot disagree.
 *
 * At added titrant volume Vt (mL), total volume Vtot = V0 + Vt (volumes additive):
 *   acid analyte : analyte total = c0 V0 / Vtot ; strong-base cation = ct Vt / Vtot  (strong acid: analyte anion = c0 V0 / Vtot)
 *   base analyte : analyte total = c0 V0 / Vtot ; strong-acid anion  = ct Vt / Vtot  (strong base: cation   = c0 V0 / Vtot)
 */
import {
  LIMITS,
  PKW_25C,
  isAcidKind,
  isSpeciesKind,
  isWeak,
  solveEquilibrium,
  validateConcentration,
  validatePK,
  type EquilibriumResult,
  type SolutionSpec,
  type SpeciesKind,
  type Validation,
} from "./acidBase";

export interface TitrationInput {
  analyte: SpeciesKind;
  /** Analyte concentration, mol/L. */
  c0: number;
  /** Analyte volume, mL. */
  v0: number;
  /** pKa (weak acid) or pKb (weak base); ignored for strong analytes. */
  pK?: number;
  /** Titrant concentration, mol/L. */
  ct: number;
  /** Added titrant volume, mL. */
  vt: number;
}

/** Curve and slider cover 0 .. 2 equivalence volumes. */
export const CURVE_SPAN = 2;

export const titrantOf = (analyte: SpeciesKind) => (isAcidKind(analyte) ? "strong base" : "strong acid");

export function equivalenceVolume(input: Pick<TitrationInput, "c0" | "v0" | "ct">): number {
  return (input.c0 * input.v0) / input.ct;
}

export function validateTitration(raw: unknown): Validation<TitrationInput> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["No input given."] };
  const r = raw as Record<string, unknown>;
  if (!isSpeciesKind(r.analyte)) return { ok: false, errors: ["Choose strong acid, weak acid, strong base or weak base as the analyte. Polyprotic, mixed and amphoteric analytes are not supported."] };
  const c0 = validateConcentration(r.c0, "Analyte concentration", errors, warnings);
  const ct = validateConcentration(r.ct, "Titrant concentration", errors, warnings);
  const pK = validatePK(r.analyte, r.pK, errors);
  let v0 = NaN;
  if (typeof r.v0 !== "number" || !Number.isFinite(r.v0)) errors.push("Analyte volume must be a number.");
  else if (r.v0 < LIMITS.minVolumeMl || r.v0 > LIMITS.maxVolumeMl) errors.push(`Analyte volume must be between ${LIMITS.minVolumeMl} and ${LIMITS.maxVolumeMl} mL.`);
  else v0 = r.v0;
  let vt = NaN;
  if (typeof r.vt !== "number" || !Number.isFinite(r.vt)) errors.push("Added titrant volume must be a number.");
  else if (r.vt < 0) errors.push("Added titrant volume cannot be negative.");
  else vt = r.vt;
  if (errors.length) return { ok: false, errors };
  const veq = equivalenceVolume({ c0, v0, ct });
  if (!(veq > 0) || !Number.isFinite(veq)) return { ok: false, errors: ["The equivalence volume is not a finite positive number."] };
  if (vt > CURVE_SPAN * veq * (1 + 1e-12)) return { ok: false, errors: [`Added titrant can be at most ${CURVE_SPAN}× the equivalence volume (${(CURVE_SPAN * veq).toPrecision(4)} mL here); beyond that the solution is just excess titrant.`] };
  if (veq > 1e5 || veq < 1e-3) warnings.push(`The equivalence volume (${veq.toPrecision(3)} mL) is outside the range of a practical burette titration.`);
  return { ok: true, value: { analyte: r.analyte, c0, v0, ...(pK === undefined ? {} : { pK }), ct, vt }, warnings };
}

export function compositionAt(input: TitrationInput, vt: number): SolutionSpec {
  const vtot = input.v0 + vt;
  const analyte = (input.c0 * input.v0) / vtot;
  const titrant = (input.ct * vt) / vtot;
  switch (input.analyte) {
    case "strong-acid": return { strongAcidAnion: analyte, strongBaseCation: titrant };
    case "weak-acid": return { weakAcid: { total: analyte, pKa: input.pK as number }, strongBaseCation: titrant };
    case "strong-base": return { strongBaseCation: analyte, strongAcidAnion: titrant };
    default: return { weakBase: { total: analyte, pKb: input.pK as number }, strongAcidAnion: titrant };
  }
}

export type Region = "initial" | "buffer" | "approaching-equivalence" | "half-equivalence" | "equivalence" | "excess-titrant" | "early";

export interface TitrationPoint {
  vt: number;
  vTotal: number;
  pH: number;
  pOH: number;
  /** Fraction of the equivalence volume that has been added. */
  fraction: number;
  equilibrium: EquilibriumResult;
  region: Region;
}

export interface SpecialPoints {
  veq: number;
  pHInitial: number;
  pHEquivalence: number;
  /** Weak analytes only. */
  pKaEffective: number | null; // pKa of the acid form (pKa of HA, or pKa of BH+ = 14 - pKb)
  halfEquivalence: { vt: number; pH: number; deviationFromPK: number } | null;
  bufferRegion: { vStart: number; vEnd: number; pHStart: number; pHEnd: number } | null;
  /** pH just before / after the equivalence point (±1 % of Veq), showing how steep the jump is. */
  jump: { vBefore: number; pHBefore: number; vAfter: number; pHAfter: number };
}

const EQ_TOL = 0.002;

export function pHAt(input: TitrationInput, vt: number): number {
  const eq = solveEquilibrium(compositionAt(input, vt));
  if (!eq.ok) throw new Error(eq.reason);
  return eq.pH;
}

export function classify(input: TitrationInput, vt: number, buffer: SpecialPoints["bufferRegion"]): Region {
  const veq = equivalenceVolume(input);
  if (vt === 0) return "initial";
  if (Math.abs(vt - veq) <= EQ_TOL * veq) return "equivalence";
  if (vt > veq) return "excess-titrant";
  if (isWeak(input.analyte) && Math.abs(vt - veq / 2) <= EQ_TOL * veq) return "half-equivalence";
  if (buffer && vt >= buffer.vStart && vt <= buffer.vEnd) return "buffer";
  return isWeak(input.analyte) ? (vt < veq / 2 ? "early" : "approaching-equivalence") : "approaching-equivalence";
}

/** Bisection for the volume (in [a,b]) where pH equals `target`; pH is monotone in vt. Returns null if never crossed. */
function volumeAtPH(input: TitrationInput, target: number, a: number, b: number): number | null {
  let fa = pHAt(input, a) - target;
  const fb = pHAt(input, b) - target;
  if (fa === 0) return a;
  if (fa * fb > 0) return null;
  let lo = a;
  let hi = b;
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    const fm = pHAt(input, mid) - target;
    if (fm === 0) return mid;
    if (fa * fm < 0) hi = mid;
    else { lo = mid; fa = fm; }
  }
  return (lo + hi) / 2;
}

export function specialPoints(input: TitrationInput): SpecialPoints {
  const veq = equivalenceVolume(input);
  const weak = isWeak(input.analyte);
  const acidic = isAcidKind(input.analyte);
  const pKa = weak ? (acidic ? (input.pK as number) : PKW_25C - (input.pK as number)) : null;
  let buffer: SpecialPoints["bufferRegion"] = null;
  let half: SpecialPoints["halfEquivalence"] = null;
  if (weak && pKa !== null) {
    // the acid/base pair is within a factor of ten of 1:1 when pH is within one unit of pKa (of the acid form)
    const lowPH = pKa - 1;
    const highPH = pKa + 1;
    const [firstPH, lastPH] = acidic ? [lowPH, highPH] : [highPH, lowPH]; // base analyte: pH falls as acid is added
    const pHStart0 = pHAt(input, 0);
    const pHEnd = pHAt(input, veq);
    const startReached = acidic ? pHStart0 >= firstPH : pHStart0 <= firstPH;
    const vStart = startReached ? 0 : volumeAtPH(input, firstPH, 0, veq);
    const endReached = acidic ? pHEnd < lastPH : pHEnd > lastPH;
    const vEnd = endReached ? veq : volumeAtPH(input, lastPH, 0, veq);
    if (vStart !== null && vEnd !== null && vEnd - vStart > 1e-6 * veq) {
      buffer = { vStart, vEnd, pHStart: pHAt(input, vStart), pHEnd: pHAt(input, vEnd) };
    }
    const pHHalf = pHAt(input, veq / 2);
    half = { vt: veq / 2, pH: pHHalf, deviationFromPK: pHHalf - pKa };
  }
  const vb = veq * 0.99;
  const va = veq * 1.01;
  return {
    veq,
    pHInitial: pHAt(input, 0),
    pHEquivalence: pHAt(input, veq),
    pKaEffective: pKa,
    halfEquivalence: half,
    bufferRegion: buffer,
    jump: { vBefore: vb, pHBefore: pHAt(input, vb), vAfter: va, pHAfter: pHAt(input, va) },
  };
}

export function pointAt(input: TitrationInput, vt: number, special?: SpecialPoints): TitrationPoint {
  const eq = solveEquilibrium(compositionAt(input, vt));
  if (!eq.ok) throw new Error(eq.reason);
  const sp = special ?? specialPoints(input);
  return {
    vt,
    vTotal: input.v0 + vt,
    pH: eq.pH,
    pOH: eq.pOH,
    fraction: vt / sp.veq,
    equilibrium: eq,
    region: classify(input, vt, sp.bufferRegion),
  };
}

/**
 * Titration curve, 0 .. CURVE_SPAN * Veq. A uniform grid is refined wherever neighbouring points differ by more
 * than `maxStepPH` (so the vertical rise at equivalence is traced smoothly); Veq and Veq/2 are always sample points.
 */
export function titrationCurve(input: TitrationInput, opts: { baseSteps?: number; maxStepPH?: number; maxPoints?: number } = {}): Array<{ vt: number; pH: number }> {
  const veq = equivalenceVolume(input);
  const vMax = CURVE_SPAN * veq;
  const base = opts.baseSteps ?? 120;
  const maxStep = opts.maxStepPH ?? 0.1;
  const maxPoints = opts.maxPoints ?? 1500;
  const xs = new Set<number>();
  for (let i = 0; i <= base; i += 1) xs.add((vMax * i) / base);
  xs.add(veq);
  xs.add(veq / 2);
  let pts = [...xs].sort((a, b) => a - b).map((vt) => ({ vt, pH: pHAt(input, vt) }));
  for (let pass = 0; pass < 14 && pts.length < maxPoints; pass += 1) {
    const next: typeof pts = [pts[0]];
    let refined = false;
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      if (Math.abs(b.pH - a.pH) > maxStep && pts.length + next.length < maxPoints) {
        const vt = (a.vt + b.vt) / 2;
        next.push({ vt, pH: pHAt(input, vt) });
        refined = true;
      }
      next.push(b);
    }
    pts = next;
    if (!refined) break;
  }
  return pts;
}

// ---- equations shown for the selected point ----------------------------------------------------------------------

export function equationsFor(input: TitrationInput, region: Region): string[] {
  const out: string[] = [];
  switch (input.analyte) {
    case "strong-acid":
      out.push("HA(aq) → H⁺(aq) + A⁻(aq)  (complete)");
      out.push("H⁺(aq) + OH⁻(aq) → H₂O(l)  (neutralisation)");
      break;
    case "weak-acid":
      out.push("HA(aq) + H₂O(l) ⇌ H₃O⁺(aq) + A⁻(aq)    Ka = [H₃O⁺][A⁻]/[HA]");
      out.push("HA(aq) + OH⁻(aq) → A⁻(aq) + H₂O(l)  (goes essentially to completion)");
      if (region === "equivalence") out.push("A⁻(aq) + H₂O(l) ⇌ HA(aq) + OH⁻(aq)    Kb = Kw/Ka  (why the solution is basic)");
      if (region === "buffer" || region === "half-equivalence") out.push("pH = pKa + log([A⁻]/[HA])  (Henderson–Hasselbalch, within its regime)");
      break;
    case "strong-base":
      out.push("MOH(aq) → M⁺(aq) + OH⁻(aq)  (complete)");
      out.push("H⁺(aq) + OH⁻(aq) → H₂O(l)  (neutralisation)");
      break;
    default:
      out.push("B(aq) + H₂O(l) ⇌ BH⁺(aq) + OH⁻(aq)    Kb = [BH⁺][OH⁻]/[B]");
      out.push("B(aq) + H⁺(aq) → BH⁺(aq)  (goes essentially to completion)");
      if (region === "equivalence") out.push("BH⁺(aq) + H₂O(l) ⇌ B(aq) + H₃O⁺(aq)    Ka = Kw/Kb  (why the solution is acidic)");
      if (region === "buffer" || region === "half-equivalence") out.push("pOH = pKb + log([BH⁺]/[B])  (Henderson–Hasselbalch, within its regime)");
  }
  out.push("H₂O(l) + H₂O(l) ⇌ H₃O⁺(aq) + OH⁻(aq)    Kw = 1.0×10⁻¹⁴ at 25 °C");
  return out;
}
