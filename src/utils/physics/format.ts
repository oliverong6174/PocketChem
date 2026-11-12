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
