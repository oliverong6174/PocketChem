import { norm3, type Vec3 } from "./magnetism";
import { fmt } from "./format";

/** Words for the direction of a 3-D vector in the screen convention (x right, y up, z out of the screen), e.g. "−y (down the screen)". */
export function directionWords(v: Vec3): string {
  const m = norm3(v);
  if (m === 0) return "zero";
  const parts: Array<[number, string, string]> = [[v.x, "x", v.x > 0 ? "to the right" : "to the left"], [v.y, "y", v.y > 0 ? "up the screen" : "down the screen"], [v.z, "z", v.z > 0 ? "out of the screen" : "into the screen"]];
  const big = parts.filter(([c]) => Math.abs(c) > 1e-6 * m);
  if (big.length === 1) return `${big[0][0] > 0 ? "+" : "−"}${big[0][1]} (${big[0][2]})`;
  return big.map(([c, ax]) => `${c > 0 ? "+" : "−"}${ax}`).join(" ") + ` components (${fmt(v.x / m)}, ${fmt(v.y / m)}, ${fmt(v.z / m)})`;
}
