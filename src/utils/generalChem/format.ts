/** Number formatting for General Chemistry readouts (significant figures follow the model's ideal-solution accuracy). */

const SUPERSCRIPT: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };

/** pH values are shown to 2 decimals: the model assumes ideal solutions, so more digits would overstate accuracy. */
export function formatPH(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return (Math.abs(value) < 0.005 ? 0 : value).toFixed(2).replace("-0.00", "0.00");
}

/** Significant-figure formatting, scientific (×10ⁿ) below 1e-3 or from 1e4. */
export function formatSig(value: number, sig = 3): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e-3 && abs < 1e4) {
    return String(Number(value.toPrecision(sig)));
  }
  const exp = Math.floor(Math.log10(abs));
  let mant = value / 10 ** exp;
  let e = exp;
  if (Math.abs(Number(mant.toFixed(sig - 1))) >= 10) { mant /= 10; e += 1; }
  const exponent = String(e).split("").map((ch) => SUPERSCRIPT[ch] ?? ch).join("");
  return `${mant.toFixed(sig - 1)}×10${exponent}`;
}

export const formatConc = (value: number, sig = 3) => `${formatSig(value, sig)} mol/L`;
export const formatMl = (value: number) => `${Number.isFinite(value) ? (value >= 100 ? value.toFixed(1) : value.toFixed(2)) : "—"} mL`;
export const formatPercent = (value: number) => (value >= 99.95 ? "100 %" : value >= 10 ? `${value.toFixed(1)} %` : value >= 0.01 ? `${value.toFixed(2)} %` : `${formatSig(value, 2)} %`);
