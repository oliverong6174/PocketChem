import { METABOLITES_BY_ID, type Reaction, type Tendency } from "../../../utils/biochem/metabolism/network";
import { reactionNet } from "../../../utils/biochem/metabolism/ledger";

export const SIGN = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
export const KEY_CARRIERS: Array<[string, string]> = [["atp", "ATP"], ["gtp", "GTP"], ["nadh", "NADH"], ["fadh2", "FADH₂"], ["co2", "CO₂"]];

/** Cofactor changes of a reaction run once in the given direction, as signed text chips (never colour alone). */
export function carrierChanges(reaction: Reaction, direction: "forward" | "reverse" = "forward"): Array<{ key: string; text: string; sign: 1 | -1 }> {
  const net = reactionNet(reaction, direction);
  const out: Array<{ key: string; text: string; sign: 1 | -1 }> = [];
  for (const [id, label] of KEY_CARRIERS) {
    // NAD+/FAD changes are the mirror image of NADH/FADH2; ADP/GDP mirror ATP/GTP. Only the main carrier is shown.
    const v = net[id] ?? 0;
    if (v !== 0) out.push({ key: id, text: `${SIGN(v)} ${label}`, sign: v > 0 ? 1 : -1 });
  }
  return out;
}

const coef = (n: number) => (n === 1 ? "" : n === 0.5 ? "½ " : `${n} `);
const side = (xs: Array<{ met: string; n: number }>) => xs.map((x) => `${coef(x.n)}${METABOLITES_BY_ID[x.met].abbreviation}`).join(" + ");
export function equationText(reaction: Reaction, direction: "forward" | "reverse" = "forward"): string {
  return direction === "forward" ? `${side(reaction.substrates)} → ${side(reaction.products)}` : `${side(reaction.products)} → ${side(reaction.substrates)}`;
}

export const TENDENCY_GLYPH: Record<Tendency, string> = { higher: "▲ Higher", lower: "▼ Lower", reference: "● Reference", uncertain: "? Uncertain" };
