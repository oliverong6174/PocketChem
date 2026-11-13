import type { RamaClass } from "../../utils/biochem/protein";

/** Ramachandran region styling: a fill color plus a glyph, so a region is never identified by color alone. */
export const RAMA_FILL: Record<RamaClass, string> = {
  "alpha-helix": "#99f6e4", "polyproline-II": "#fde68a", "beta-strand": "#fcd34d", bridge: "#d9f99d", "left-handed-helix": "#c4b5fd", disallowed: "#f1f5f9",
};
export const RAMA_PATTERN: Partial<Record<RamaClass, string>> = { "alpha-helix": "▲", "beta-strand": "■", "polyproline-II": "■", "left-handed-helix": "◆", bridge: "●" };
export const RAMA_LEGEND: Array<{ cls: RamaClass; mark: string }> = (Object.keys(RAMA_FILL) as RamaClass[]).map((cls) => ({ cls, mark: RAMA_PATTERN[cls] ?? "" }));
export const ramaColor = (c: RamaClass) => RAMA_FILL[c];
