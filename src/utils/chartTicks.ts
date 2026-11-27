/** "Nice" axis ticks (1, 2, 5 × 10ⁿ steps) covering [min, max]. */
export function niceTicks(min: number, max: number, target = 6): number[] {
  const span = max - min;
  // A span far below the float spacing of the values would make `v += step` stall forever: treat it as a single value.
  if (!(span > 1e-12 * Math.max(Math.abs(min), Math.abs(max)))) return [min];
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9 && out.length < 200; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}
