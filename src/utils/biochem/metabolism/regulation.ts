/**
 * Curated, QUALITATIVE regulation of the shared network. A signal is low / normal / high relative to a stated reference; each curated effect
 * says whether a higher level of that signal tends to raise (+) or lower (−) an enzyme's net activity. Combining effects gives only a direction
 * (higher / lower / reference / uncertain). It never gives a rate, a flux or a concentration, and it is not a substitute for a kinetic model.
 */
import { ENZYMES_BY_ID, REGULATION, SIGNALS, TENDENCY_DEFINITIONS, type RegulatoryEffect, type SignalId, type SignalLevel, type Tendency } from "./network";
import { cycleNet } from "./ledger";

export type Signals = Record<SignalId, SignalLevel>;
export const NORMAL_SIGNALS: Signals = { atp: "normal", amp: "normal", f26bp: "normal", g6p: "normal", acetylcoa: "normal", nadh: "normal", adp: "normal" };
export const SIGNAL_IDS = Object.keys(SIGNALS) as SignalId[];
export const LEVELS: readonly SignalLevel[] = ["low", "normal", "high"];
const value = (l: SignalLevel) => (l === "low" ? -1 : l === "high" ? 1 : 0);

export interface Contribution { effect: RegulatoryEffect; level: SignalLevel; direction: -1 | 0 | 1 }
export function contributions(enzyme: string, signals: Signals): Contribution[] {
  return REGULATION.filter((e) => e.enzyme === enzyme).map((effect) => {
    const d = effect.sign * value(signals[effect.signal]);
    return { effect, level: signals[effect.signal], direction: (d > 0 ? 1 : d < 0 ? -1 : 0) as -1 | 0 | 1 };
  });
}
export function enzymeTendency(enzyme: string, signals: Signals): { tendency: Tendency; contributions: Contribution[] } {
  const cs = contributions(enzyme, signals);
  const up = cs.some((c) => c.direction > 0), down = cs.some((c) => c.direction < 0);
  const tendency: Tendency = up && down ? "uncertain" : up ? "higher" : down ? "lower" : "reference";
  return { tendency, contributions: cs };
}
export const combineTendencies = (ts: Tendency[]): Tendency => {
  const active = new Set(ts.filter((t) => t !== "reference"));
  if (!active.size) return "reference";
  if (active.has("uncertain") || (active.has("higher") && active.has("lower"))) return "uncertain";
  return active.has("higher") ? "higher" : "lower";
};

export const GLYCOLYTIC_CONTROL = ["hk", "pfk1", "pk"] as const;
export const GLUCONEOGENIC_CONTROL = ["fbpase1", "pc"] as const;
export type Verdict = "favours-glycolysis" | "favours-gluconeogenesis" | "reference" | "mixed-or-uncertain";
export const VERDICT_TEXT: Record<Verdict, string> = {
  "favours-glycolysis": "Curated signals push glycolytic control points up and gluconeogenic ones down.",
  "favours-gluconeogenesis": "Curated signals push gluconeogenic control points up and glycolytic ones down.",
  reference: "No curated signal departs from normal.",
  "mixed-or-uncertain": "Signals are mixed or conflicting; the net direction needs concentrations and kinetics that this model does not have.",
};
export function comparePathways(signals: Signals): { glycolysis: Tendency; gluconeogenesis: Tendency; verdict: Verdict; perEnzyme: Record<string, Tendency> } {
  const perEnzyme: Record<string, Tendency> = {};
  for (const id of [...GLYCOLYTIC_CONTROL, ...GLUCONEOGENIC_CONTROL]) perEnzyme[id] = enzymeTendency(id, signals).tendency;
  const glycolysis = combineTendencies(GLYCOLYTIC_CONTROL.map((id) => perEnzyme[id]));
  const gluconeogenesis = combineTendencies(GLUCONEOGENIC_CONTROL.map((id) => perEnzyme[id]));
  let verdict: Verdict = "mixed-or-uncertain";
  if (glycolysis === "reference" && gluconeogenesis === "reference") verdict = "reference";
  else if (glycolysis === "higher" && gluconeogenesis === "lower") verdict = "favours-glycolysis";
  else if (glycolysis === "lower" && gluconeogenesis === "higher") verdict = "favours-gluconeogenesis";
  return { glycolysis, gluconeogenesis, verdict, perEnzyme };
}

export interface RegScenario { id: string; title: string; signals: Partial<Signals>; text: string; caveat: string }
export const REG_SCENARIOS: RegScenario[] = [
  { id: "reference", title: "Reference (all normal)", signals: {}, text: "Every signal at its reference level: nothing is pushed up or down.", caveat: "The reference state is a bookkeeping origin, not a measured cellular condition." },
  { id: "fed", title: "Fed-associated (liver)", signals: { f26bp: "high" }, text: "After a carbohydrate meal, insulin favours the kinase form of the bifunctional PFK-2/FBPase-2 enzyme, so liver fructose 2,6-bisphosphate rises. It activates PFK-1 and inhibits FBPase-1.", caveat: "Liver-specific. The hormonal chain (insulin → PFK-2) is indirect and is represented only by its end signal here; muscle and other tissues are regulated differently." },
  { id: "fasting", title: "Fasting-associated (liver)", signals: { f26bp: "low", acetylcoa: "high" }, text: "Glucagon lowers liver fructose 2,6-bisphosphate (phosphorylating the bifunctional enzyme toward its phosphatase activity), and fatty-acid oxidation raises acetyl-CoA, which activates pyruvate carboxylase.", caveat: "Liver pyruvate kinase is also phosphorylated and inhibited under glucagon (covalent, indirect); that effect is not in the signal model. Glucagon does not act this way in muscle." },
  { id: "low-energy", title: "Low energy charge (high AMP)", signals: { atp: "low", amp: "high", adp: "high" }, text: "ATP falls while AMP and ADP rise: PFK-1 and pyruvate kinase are released from ATP inhibition and AMP also inhibits FBPase-1.", caveat: "Real cells keep ATP nearly constant; AMP changes proportionally more, which is why it is a sensitive signal. Magnitudes are not modelled." },
  { id: "energy-rich", title: "Energy-rich (high ATP)", signals: { atp: "high", amp: "low", adp: "low", nadh: "high" }, text: "High ATP and NADH with low AMP and ADP: PFK-1 and pyruvate kinase are inhibited, the pyruvate dehydrogenase complex and isocitrate dehydrogenase are inhibited, and AMP no longer restrains FBPase-1.", caveat: "Several signals are combined; where they conflict the model reports 'uncertain' rather than guessing." },
  { id: "acetylcoa-rich", title: "Acetyl-CoA rich", signals: { acetylcoa: "high", nadh: "high" }, text: "Abundant acetyl-CoA and NADH (for example during fatty-acid oxidation) activate pyruvate carboxylase and, through the kinase, inhibit the pyruvate dehydrogenase complex, sparing pyruvate for gluconeogenesis.", caveat: "Illustrates the allosteric and covalent links only; it does not predict how much pyruvate is diverted." },
];
export const REG_SCENARIOS_BY_ID: Record<string, RegScenario> = Object.fromEntries(REG_SCENARIOS.map((s) => [s.id, s]));
export const signalsFor = (id: string): Signals => ({ ...NORMAL_SIGNALS, ...(REG_SCENARIOS_BY_ID[id]?.signals ?? {}) });

/** Substrate (futile) cycles, with the NTP cost computed from the same stoichiometry as the ledger. */
export const SUBSTRATE_CYCLES = [
  { id: "f6p-f16bp", title: "Fructose 6-phosphate ⇄ fructose 1,6-bisphosphate", steps: [{ id: "PFK1" }, { id: "FBP1" }] },
  { id: "glc-g6p", title: "Glucose ⇄ glucose 6-phosphate", steps: [{ id: "HK" }, { id: "G6PASE" }] },
  { id: "pep-pyr", title: "Phosphoenolpyruvate ⇄ pyruvate (via oxaloacetate)", steps: [{ id: "PK" }, { id: "PC" }, { id: "PEPCK" }] },
] as const;
export type CycleId = (typeof SUBSTRATE_CYCLES)[number]["id"];
export function substrateCycleCost(id: CycleId) {
  const c = SUBSTRATE_CYCLES.find((x) => x.id === id)!;
  const net = cycleNet(c.steps.map((s) => ({ id: s.id })));
  const ntp = -((net.atp ?? 0) + (net.gtp ?? 0));
  return { net, ntpHydrolysed: ntp };
}

export const enzymeName = (id: string) => ENZYMES_BY_ID[id].short;
export { TENDENCY_DEFINITIONS };
