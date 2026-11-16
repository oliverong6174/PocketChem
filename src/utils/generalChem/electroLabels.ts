import { prettyFormula } from "./formula";
import type { HSpecies, Phase } from "./electrochem";

/** Display text for species and half-reactions of the electrochemistry tool (pure; no React). */
const PHASE: Record<Phase, string> = { aq: "(aq)", s: "(s)", l: "(l)", g: "(g)" };
export const speciesLabel = (s: { f: string; nu: number; phase: Phase }) => `${s.nu === 1 ? "" : `${s.nu} `}${prettyFormula(s.f)}${PHASE[s.phase]}`;
export const sideLabel = (list: Array<{ f: string; nu: number; phase: Phase }>, electrons = 0) => {
  const parts = list.map(speciesLabel);
  if (electrons) parts.push(`${electrons === 1 ? "" : `${electrons} `}e⁻`);
  return parts.join(" + ");
};
/** "Zn²⁺(aq) + 2 e⁻ → Zn(s)" for a reduction and the reverse text for an oxidation. */
export const halfEquation = (left: HSpecies[], right: HSpecies[], n: number, electronsOn: "left" | "right") =>
  `${sideLabel(left, electronsOn === "left" ? n : 0)} → ${sideLabel(right, electronsOn === "right" ? n : 0)}`;

