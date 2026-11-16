/**
 * Chemical formula parser (pure, no React). A bounded, documented grammar; anything outside it is rejected with a reason
 * instead of being interpreted in a guessed way.
 *
 * Supported:
 *   - element symbols (case-sensitive: "Co" is cobalt, "CO" is carbon + oxygen) with integer subscripts: H2O, C6H12O6
 *   - groups in ( ) or [ ] with an optional integer multiplier, nested up to 6 deep: Ca(OH)2, Fe2(SO4)3, K4[Fe(CN)6]
 *   - hydrates and adducts joined by "·", "." or "*" with an optional leading whole-number multiplier: CuSO4·5H2O, CuSO4.5H2O
 *   - ionic charge: "^n+" / "^n-" for any charge (SO4^2-, Fe^3+, Al^3+), or a single bare trailing "+" or "-" for a charge of
 *     one (NH4+, OH-, Cl-). Charges of two or more MUST use the caret: "Fe3+" is read as Fe3 with a charge of +1, not Fe(3+).
 *   - the free electron "e-" (charge -1, no atoms, no mass), for half-reactions
 * Not supported (rejected): coefficients inside a formula, isotopes, oxidation-state notation, fractional subscripts, phase labels,
 * radicals, and lower-case or unknown element symbols.
 * The mass of an ion ignores the electron mass (about 5.5e-4 g/mol per electron), which is far below the precision of the table.
 */
import { atomicMass, isElement } from "./elements";

export type Counts = Record<string, number>;
export interface HydratePart { multiplier: number; counts: Counts }
export interface ParsedFormula {
  /** The text as entered, trimmed. */
  text: string;
  counts: Counts;
  charge: number;
  /** g/mol (0 for the free electron). */
  mass: number;
  electron: boolean;
  parts: HydratePart[];
}
export type FormulaResult = { ok: true; value: ParsedFormula } | { ok: false; error: string };

export const FORMULA_LIMITS = { maxLength: 80, maxSubscript: 999, maxAtoms: 5000, maxDepth: 6, maxMultiplier: 99, maxCharge: 9 } as const;
export const FORMULA_SYNTAX = [
  "Element symbols are case-sensitive: Co is cobalt, CO is carbon monoxide.",
  "Subscripts are whole numbers written after the symbol: C6H12O6. Groups use ( ) or [ ] with an optional multiplier: Ca(OH)2.",
  "Hydrates are joined with ·, . or *: CuSO4·5H2O.",
  "Charges: SO4^2-, Fe^3+, or a single sign for ±1: NH4+, OH-. Charges of 2 or more need the ^ (Fe3+ means Fe₃ with charge +1).",
  "The free electron is written e-.",
] as const;

const fail = (error: string): FormulaResult => ({ ok: false, error });
const addInto = (target: Counts, source: Counts, times: number) => { for (const [k, v] of Object.entries(source)) target[k] = (target[k] ?? 0) + v * times; };
const total = (c: Counts) => Object.values(c).reduce((a, b) => a + b, 0);

function parseBody(body: string): { ok: true; counts: Counts } | { ok: false; error: string } {
  let i = 0;
  const stack: Counts[] = [{}];
  const closers: string[] = [];
  const readInt = (): number | null | "bad" => {
    const m = /^\d+/.exec(body.slice(i));
    if (!m) return null;
    i += m[0].length;
    const v = Number(m[0]);
    if (v < 1 || v > FORMULA_LIMITS.maxSubscript) return "bad";
    return v;
  };
  if (body.length === 0) return { ok: false, error: "The formula is empty." };
  while (i < body.length) {
    const ch = body[i];
    if (ch === "(" || ch === "[") {
      if (stack.length > FORMULA_LIMITS.maxDepth) return { ok: false, error: `Groups are nested more than ${FORMULA_LIMITS.maxDepth} deep.` };
      closers.push(ch === "(" ? ")" : "]");
      stack.push({});
      i += 1;
    } else if (ch === ")" || ch === "]") {
      if (closers.length === 0 || closers[closers.length - 1] !== ch) return { ok: false, error: `Unmatched "${ch}" in the formula.` };
      closers.pop();
      i += 1;
      const mult = readInt();
      if (mult === "bad") return { ok: false, error: `A group multiplier must be a whole number from 1 to ${FORMULA_LIMITS.maxSubscript}.` };
      const group = stack.pop() as Counts;
      if (total(group) === 0) return { ok: false, error: "A group in brackets is empty." };
      addInto(stack[stack.length - 1], group, mult ?? 1);
    } else if (/[A-Z]/.test(ch)) {
      let sym = ch;
      i += 1;
      if (i < body.length && /[a-z]/.test(body[i])) { sym += body[i]; i += 1; }
      if (!isElement(sym)) return { ok: false, error: `"${sym}" is not a supported element symbol (symbols start with a capital letter; check the capitalisation).` };
      const sub = readInt();
      if (sub === "bad") return { ok: false, error: `The subscript after ${sym} must be a whole number from 1 to ${FORMULA_LIMITS.maxSubscript}.` };
      const top = stack[stack.length - 1];
      top[sym] = (top[sym] ?? 0) + (sub ?? 1);
    } else if (/\d/.test(ch)) {
      return { ok: false, error: "A number must follow an element symbol or a closing bracket (a leading coefficient is not part of a formula)." };
    } else {
      return { ok: false, error: `Unsupported character "${ch}" in the formula.` };
    }
  }
  if (closers.length > 0) return { ok: false, error: `Missing "${closers[closers.length - 1]}" to close a group.` };
  const counts = stack[0];
  if (total(counts) > FORMULA_LIMITS.maxAtoms) return { ok: false, error: `More than ${FORMULA_LIMITS.maxAtoms} atoms per formula unit is outside the supported range.` };
  return { ok: true, counts };
}

export function parseFormula(input: string): FormulaResult {
  if (typeof input !== "string") return fail("The formula must be text.");
  const text = input.trim();
  if (text.length === 0) return fail("Enter a formula.");
  if (text.length > FORMULA_LIMITS.maxLength) return fail(`A formula is limited to ${FORMULA_LIMITS.maxLength} characters.`);
  if (text === "e-") return { ok: true, value: { text, counts: {}, charge: -1, mass: 0, electron: true, parts: [] } };
  let rest = text;
  let charge = 0;
  const caret = /\^(\d{0,2})([+-])$/.exec(rest);
  if (caret) {
    const n = caret[1] === "" ? 1 : Number(caret[1]);
    if (n < 1 || n > FORMULA_LIMITS.maxCharge) return fail(`A charge must be from 1 to ${FORMULA_LIMITS.maxCharge} (written ^n+ or ^n-).`);
    charge = caret[2] === "+" ? n : -n;
    rest = rest.slice(0, caret.index);
  } else if (/[+-]$/.test(rest)) {
    charge = rest.endsWith("+") ? 1 : -1;
    rest = rest.slice(0, -1);
  }
  if (/[+\-^]/.test(rest)) return fail("A charge must come at the end, written ^n+ or ^n- (or one bare + or - for a charge of one). Separate species in an equation with \" + \" (spaces around the plus).");
  const pieces = rest.split(/[·.*]/);
  if (pieces.length > 1 && charge !== 0) return fail("A charge on a hydrate or adduct is not supported.");
  const parts: HydratePart[] = [];
  const counts: Counts = {};
  for (let k = 0; k < pieces.length; k += 1) {
    let piece = pieces[k];
    let multiplier = 1;
    if (k > 0) {
      const lead = /^(\d+)/.exec(piece);
      if (lead) {
        multiplier = Number(lead[1]);
        if (multiplier < 1 || multiplier > FORMULA_LIMITS.maxMultiplier) return fail(`A hydrate multiplier must be a whole number from 1 to ${FORMULA_LIMITS.maxMultiplier}.`);
        piece = piece.slice(lead[1].length);
      }
    }
    const body = parseBody(piece);
    if (!body.ok) return fail(body.error);
    parts.push({ multiplier, counts: body.counts });
    addInto(counts, body.counts, multiplier);
  }
  if (total(counts) > FORMULA_LIMITS.maxAtoms) return fail(`More than ${FORMULA_LIMITS.maxAtoms} atoms per formula unit is outside the supported range.`);
  let mass = 0;
  for (const [sym, n] of Object.entries(counts)) mass += (atomicMass(sym) as number) * n;
  return { ok: true, value: { text, counts, charge, mass, electron: false, parts } };
}

export const molarMass = (text: string): number | null => { const r = parseFormula(text); return r.ok ? r.value.mass : null; };

const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉" };
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻" };

/** Display form: subscripts and a superscript charge (H₂O, SO₄²⁻, Fe³⁺, CuSO₄·5H₂O). Display only; never parsed back. */
export function prettyFormula(text: string): string {
  const t = text.trim();
  if (t === "e-") return "e⁻";
  let body = t;
  let charge = "";
  const caret = /\^(\d{0,2})([+-])$/.exec(body);
  if (caret) { charge = (caret[1] === "1" ? "" : caret[1]) + caret[2]; body = body.slice(0, caret.index); }
  else if (/[+-]$/.test(body)) { charge = body.slice(-1); body = body.slice(0, -1); }
  let out = "";
  let afterSymbol = false;
  for (const ch of body) {
    if (/\d/.test(ch)) out += afterSymbol ? SUB[ch] : ch;
    else { out += ch === "." || ch === "*" ? "·" : ch; afterSymbol = /[A-Za-z)\]]/.test(ch); }
  }
  return out + [...charge].map((c) => SUP[c] ?? c).join("");
}

export const formatCounts = (counts: Counts): string => Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([s, n]) => `${s}${n === 1 ? "" : n}`).join(" ");
