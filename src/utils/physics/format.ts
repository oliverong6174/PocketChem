/** Unit-aware number formatting for the Physics tools. All values stay in SI inside the models; scaling happens only for display. */
import { formatSig } from "../generalChem/format";

const PREFIXES: Array<{ exp: number; prefix: string }> = [
  { exp: 9, prefix: "G" }, { exp: 6, prefix: "M" }, { exp: 3, prefix: "k" }, { exp: 0, prefix: "" },
  { exp: -3, prefix: "m" }, { exp: -6, prefix: "µ" }, { exp: -9, prefix: "n" }, { exp: -12, prefix: "p" },
];

/** "4.7 kΩ", "2.2 mA": the value in the SI prefix that keeps the mantissa between 1 and 1000. */
export function formatSI(value: number, unit: string, sig = 3): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return `0 ${unit}`;
  const abs = Math.abs(value);
  const p = PREFIXES.find((q) => abs >= 10 ** q.exp * 0.9995) ?? PREFIXES[PREFIXES.length - 1];
  return `${formatSig(value / 10 ** p.exp, sig)} ${p.prefix}${unit}`;
}

/** A display scale for an axis: the prefix and factor so that `value / factor` is a comfortable number. */
export function siScale(maxAbs: number, baseUnit: string): { unit: string; factor: number } {
  if (!Number.isFinite(maxAbs) || maxAbs <= 0) return { unit: baseUnit, factor: 1 };
  const p = PREFIXES.find((q) => maxAbs >= 10 ** q.exp * 0.9995 && q.exp <= 3) ?? PREFIXES[PREFIXES.length - 1];
  return { unit: `${p.prefix}${baseUnit}`, factor: 10 ** p.exp };
}

/** Metres, seconds etc. with a fixed number of significant figures and a sign that does not show "-0". */
export function fmt(value: number, sig = 3): string {
  if (!Number.isFinite(value)) return "—";
  return formatSig(Math.abs(value) < 1e-12 ? 0 : value, sig);
}
export const fmtUnit = (value: number, unit: string, sig = 3) => `${fmt(value, sig)} ${unit}`;

/** Components of one vector in a shared SI prefix, so a force of 1e-16 N reads "(8.01×10⁻⁴, 0) pN" rather than "(0, 0) N". Components far below the largest are shown as 0. */
export function scaleVec(values: number[], baseUnit: string, sig = 3): { unit: string; items: string[] } {
  const max = Math.max(0, ...values.map((x) => (Number.isFinite(x) ? Math.abs(x) : 0)));
  const { unit, factor } = siScale(max, baseUnit);
  return { unit, items: values.map((x) => (Math.abs(x) < max * 1e-9 ? "0" : fmt(x / factor, sig))) };
}
/** "(a, b, c) pN" for the note under a vector quantity. */
export function fmtVecSI(values: number[], baseUnit: string, sig = 3): string {
  const { unit, items } = scaleVec(values, baseUnit, sig);
  return `(${items.join(", ")}) ${unit}`;
}

/** A new particle keeps the same physical scale of the run: the duration is rescaled by m/|q| (cyclotron period, or time to change the velocity by the same amount), so switching proton → electron neither exceeds the non-relativistic limit nor aliases thousands of orbits into the plot. */
export function rescaledDuration(old: { q: number; m: number; duration: number }, next: { q: number; m: number }): number {
  const ratio = (next.m / Math.abs(next.q)) / (old.m / Math.abs(old.q));
  const d = old.duration * ratio;
  return Number.isFinite(d) && d > 0 ? Number(d.toPrecision(2)) : old.duration;
}

/** Display wording for a sense of rotation: the engines use "counterclockwise"; the page text is hyphenated like the diagram labels. */
export const senseWord = (s: string): string => (s === "counterclockwise" ? "counter-clockwise" : s);

/** Floating-point residue (cos 90° ≈ 6×10⁻¹⁷) displayed as a physical value would read "6×10⁻⁷ pWb": values below 10⁻⁹ of their natural scale are shown as exactly 0. */
export const zeroNoise = (x: number, ref: number): number => (Math.abs(x) < 1e-9 * Math.abs(ref) ? 0 : x);
