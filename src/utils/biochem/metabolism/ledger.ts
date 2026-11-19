/**
 * Energy-carrier ledger for the shared network. Every number comes from reaction stoichiometry × how often a reaction happens per glucose
 * (or per cycle turn), so a metabolite or carrier is counted once, in one place, for every page. The oxidative-phosphorylation ATP figures
 * are ESTIMATES built from stated assumptions (protons pumped per electron pair, protons per ATP), not measured universal constants.
 */
import { METABOLITES_BY_ID, REACTIONS_BY_ID, pathwayReactions, type PathwayId, type Reaction } from "./network";

export type Net = Record<string, number>;
const clean = (n: Net): Net => { const o: Net = {}; for (const [k, v] of Object.entries(n)) { const r = Math.round(v * 1e6) / 1e6; if (r !== 0) o[k] = r; } return o; };

/** How many times a reaction runs: per glucose (`glucose`) or once each (`event`, e.g. one turn of the cycle). */
export type Basis = "glucose" | "event";

/** Net change (products − substrates) of running one reaction once in the stated direction. */
export function reactionNet(r: Reaction, direction: "forward" | "reverse" = "forward"): Net {
  const n: Net = {};
  const s = direction === "forward" ? 1 : -1;
  for (const p of r.products) n[p.met] = (n[p.met] ?? 0) + s * p.n;
  for (const p of r.substrates) n[p.met] = (n[p.met] ?? 0) - s * p.n;
  return n;
}

/** Sum of a pathway's reactions (first `upTo` steps; default all). Intermediates cancel, leaving the pathway's net equation. */
export function pathwayNet(pathway: PathwayId, basis: Basis = "glucose", upTo = Infinity): Net {
  const total: Net = {};
  for (const { reaction, role } of pathwayReactions(pathway)) {
    if (role.step > upTo || reaction.branchOf) continue;
    const times = basis === "glucose" ? role.perGlucose : 1;
    for (const [k, v] of Object.entries(reactionNet(reaction, role.direction))) total[k] = (total[k] ?? 0) + v * times;
  }
  return clean(total);
}

export interface Equation { substrates: Array<{ met: string; n: number }>; products: Array<{ met: string; n: number }> }
export function equationOf(net: Net): Equation {
  const subs = Object.entries(net).filter(([, v]) => v < 0).map(([met, v]) => ({ met, n: -v }));
  const prods = Object.entries(net).filter(([, v]) => v > 0).map(([met, v]) => ({ met, n: v }));
  return { substrates: subs, products: prods };
}
const FIRST = ["glucose", "pyruvate", "acetylcoa", "oaa", "nadh", "fadh2", "atp", "gtp", "adp", "gdp", "nad", "fad", "coa", "pi", "co2", "o2", "hplus", "h2o"];
const order = (met: string) => { const i = FIRST.indexOf(met); return i < 0 ? 99 : i; };
export function formatEquation(net: Net): string {
  const eq = equationOf(net);
  const side = (xs: Equation["substrates"]) => xs.slice().sort((a, b) => order(a.met) - order(b.met)).map((x) => `${x.n === 1 ? "" : `${x.n} `}${METABOLITES_BY_ID[x.met].abbreviation}`).join(" + ");
  return `${side(eq.substrates)} → ${side(eq.products)}`;
}

export interface CarrierLedger {
  /** ATP and GTP are summed as "NTP equivalents": negative means consumed. */
  atp: number; gtp: number; ntpEquivalents: number;
  nadh: number; fadh2: number; co2: number; water: number; pi: number;
}
export function carriersOf(net: Net): CarrierLedger {
  // ATP/ADP and GTP/GDP: the NTP formed minus the NTP spent (ADP/GDP are the matching diphosphates).
  const atp = net.atp ?? 0, gtp = net.gtp ?? 0;
  return { atp, gtp, ntpEquivalents: atp + gtp, nadh: net.nadh ?? 0, fadh2: net.fadh2 ?? 0, co2: net.co2 ?? 0, water: net.h2o ?? 0, pi: net.pi ?? 0 };
}

/** Gross ATP formed and ATP invested by glycolysis: the answer to "four ATP made, two net". */
export function glycolysisAtpBreakdown(): { invested: number; produced: number; net: number } {
  let invested = 0, produced = 0;
  for (const { reaction, role } of pathwayReactions("glycolysis")) {
    const d = reactionNet(reaction, role.direction).atp ?? 0;
    if (d < 0) invested += -d * role.perGlucose; else produced += d * role.perGlucose;
  }
  return { invested, produced, net: produced - invested };
}

/** Per-step cumulative ledger used by the step controls. */
export function cumulativeCarriers(pathway: PathwayId, step: number, basis: Basis = "glucose"): CarrierLedger {
  return carriersOf(pathwayNet(pathway, basis, step));
}

// ---- respiratory chain estimates (assumptions are exported so the UI can state them) -------------------------------------------------

export const OXPHOS_ASSUMPTIONS = {
  protonsPerNadh: 10, protonsPerFadh2: 6,
  /** About 8 H⁺ turn the c-ring of mammalian ATP synthase per 3 ATP (≈ 2.7 H⁺/ATP) plus ≈ 1 H⁺ for phosphate/ADP·ATP transport, rounded to 4. */
  protonsPerAtp: 4,
} as const;
export const atpPerNadh = () => OXPHOS_ASSUMPTIONS.protonsPerNadh / OXPHOS_ASSUMPTIONS.protonsPerAtp;
export const atpPerFadh2 = () => OXPHOS_ASSUMPTIONS.protonsPerFadh2 / OXPHOS_ASSUMPTIONS.protonsPerAtp;

export type Shuttle = "malate-aspartate" | "glycerol-phosphate";
export const SHUTTLES: Record<Shuttle, { label: string; note: string }> = {
  "malate-aspartate": { label: "Malate–aspartate shuttle", note: "Reducing equivalents of cytosolic NADH re-appear as mitochondrial NADH (liver, heart, kidney); the shuttle itself costs some proton-motive force, which this estimate ignores." },
  "glycerol-phosphate": { label: "Glycerol-phosphate shuttle", note: "Reducing equivalents enter as FADH₂/QH₂ (skeletal muscle, brain): about 1.5 ATP rather than 2.5 per cytosolic NADH." },
};

export interface GlucoseLedger {
  substrateLevel: { glycolysis: number; cycle: number };
  cytosolicNadh: number; matrixNadh: number; fadh2: number;
  oxidativeAtp: { cytosolicNadh: number; matrixNadh: number; fadh2: number };
  totalAtp: number; co2: number;
}
/** Complete oxidation of one glucose: glycolysis + pyruvate oxidation + cycle (two turns) + estimated oxidative phosphorylation. */
export function glucoseLedger(shuttle: Shuttle): GlucoseLedger {
  const g = carriersOf(pathwayNet("glycolysis")), p = carriersOf(pathwayNet("pyruvate-oxidation")), t = carriersOf(pathwayNet("tca"));
  const cytNadh = g.nadh, matNadh = p.nadh + t.nadh, fadh2 = t.fadh2;
  const cytAtp = cytNadh * (shuttle === "malate-aspartate" ? atpPerNadh() : atpPerFadh2());
  const oxidative = { cytosolicNadh: cytAtp, matrixNadh: matNadh * atpPerNadh(), fadh2: fadh2 * atpPerFadh2() };
  const sub = { glycolysis: g.ntpEquivalents, cycle: t.ntpEquivalents };
  return {
    substrateLevel: sub, cytosolicNadh: cytNadh, matrixNadh: matNadh, fadh2, oxidativeAtp: oxidative,
    totalAtp: sub.glycolysis + sub.cycle + oxidative.cytosolicNadh + oxidative.matrixNadh + oxidative.fadh2,
    co2: p.co2 + t.co2,
  };
}

/** Net NTP-equivalent, NADH and water change of running a list of reactions once each (used for futile-cycle demonstrations). */
export function cycleNet(reactionIds: Array<{ id: string; direction?: "forward" | "reverse" }>): Net {
  const total: Net = {};
  for (const { id, direction } of reactionIds) for (const [k, v] of Object.entries(reactionNet(REACTIONS_BY_ID[id], direction ?? "forward"))) total[k] = (total[k] ?? 0) + v;
  return clean(total);
}
