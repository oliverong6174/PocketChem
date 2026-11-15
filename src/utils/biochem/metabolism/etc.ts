/**
 * Educational model of the mitochondrial respiratory chain: the electron path, conventional proton-translocation stoichiometry, the oxygen
 * sink, ATP synthase and a table of inhibitor / uncoupler scenarios. Outcomes are derived from the topology of the chain (which complexes a
 * donor's electrons must pass) and from stated rules, as QUALITATIVE directions. No concentration, rate or realistic cell flux is computed.
 */
import { OXPHOS_ASSUMPTIONS, atpPerFadh2, atpPerNadh } from "./ledger";

export type ComplexId = "CI" | "CII" | "CIII" | "CIV";
export type CarrierId = "NADH" | "CI" | "Q" | "CII" | "CIII" | "cytc" | "CIV" | "O2";
export interface Complex { id: ComplexId; name: string; short: string; protonsPerPair: number; text: string }
export const COMPLEXES: Record<ComplexId, Complex> = {
  CI: { id: "CI", name: "Complex I (NADH:ubiquinone oxidoreductase)", short: "I", protonsPerPair: 4, text: "Accepts two electrons from NADH, passes them through FMN and iron–sulfur centres to coenzyme Q (Q → QH₂), and pumps about 4 H⁺ from the matrix to the intermembrane space." },
  CII: { id: "CII", name: "Complex II (succinate dehydrogenase)", short: "II", protonsPerPair: 0, text: "The citric-acid-cycle enzyme: it passes electrons from succinate (through bound FAD and iron–sulfur centres) to coenzyme Q. It does NOT pump protons." },
  CIII: { id: "CIII", name: "Complex III (cytochrome bc₁)", short: "III", protonsPerPair: 4, text: "Oxidizes QH₂ and reduces cytochrome c (one electron at a time, by the Q cycle), with about 4 H⁺ released into the intermembrane space per electron pair." },
  CIV: { id: "CIV", name: "Complex IV (cytochrome c oxidase)", short: "IV", protonsPerPair: 2, text: "Takes electrons from cytochrome c and reduces O₂ to water (½ O₂ + 2 H⁺ + 2 e⁻ → H₂O per electron pair); about 2 H⁺ are pumped per electron pair, in addition to the protons consumed to make water." },
};
export const CARRIER_LABEL: Record<CarrierId, string> = { NADH: "NADH", CI: "Complex I", Q: "Coenzyme Q", CII: "Complex II", CIII: "Complex III", cytc: "Cytochrome c", CIV: "Complex IV", O2: "O₂ → H₂O" };

export type Donor = "nadh" | "succinate";
export const DONORS: Record<Donor, { label: string; short: string; path: CarrierId[]; text: string }> = {
  nadh: { label: "NADH (enters at complex I)", short: "NADH", path: ["NADH", "CI", "Q", "CIII", "cytc", "CIV", "O2"], text: "NADH from the citric acid cycle or pyruvate dehydrogenase donates two electrons to complex I." },
  succinate: { label: "Succinate / FADH₂ (enters at complex II)", short: "Succinate (FADH₂)", path: ["CII", "Q", "CIII", "cytc", "CIV", "O2"], text: "Electrons from succinate (FADH₂) enter at complex II, bypassing complex I." },
};
export const DONOR_IDS: Donor[] = ["nadh", "succinate"];

export const complexesOnPath = (donor: Donor): ComplexId[] => DONORS[donor].path.filter((c): c is ComplexId => c in COMPLEXES);
/** Protons pumped per electron pair for one donor: the sum over complexes on its path (complex II contributes 0). */
export const protonsPerPair = (donor: Donor): number => complexesOnPath(donor).reduce((s, c) => s + COMPLEXES[c].protonsPerPair, 0);

export interface EtcCondition {
  id: string; title: string; kind: "control" | "inhibitor" | "uncoupler" | "hypoxia";
  target?: ComplexId | "ATPSYN"; agent: string; text: string;
}
export const CONDITIONS: EtcCondition[] = [
  { id: "control", title: "Coupled, normal", kind: "control", agent: "none", text: "Electron transport and ATP synthesis are coupled through the proton gradient." },
  { id: "rotenone", title: "Complex I inhibited (rotenone)", kind: "inhibitor", target: "CI", agent: "Rotenone (also amobarbital)", text: "Blocks electron transfer from complex I's iron–sulfur centres to coenzyme Q." },
  { id: "malonate", title: "Complex II inhibited (malonate)", kind: "inhibitor", target: "CII", agent: "Malonate (a competitive inhibitor of succinate)", text: "Competes with succinate at complex II's substrate site." },
  { id: "antimycin", title: "Complex III inhibited (antimycin A)", kind: "inhibitor", target: "CIII", agent: "Antimycin A", text: "Blocks the Qi site of complex III, stopping electron transfer from the cytochrome b hemes to coenzyme Q." },
  { id: "cyanide", title: "Complex IV inhibited (cyanide, CO, azide)", kind: "inhibitor", target: "CIV", agent: "Cyanide, carbon monoxide or azide", text: "Binds the heme a₃–Cu_B centre of complex IV so electrons cannot reach O₂." },
  { id: "oligomycin", title: "ATP synthase inhibited (oligomycin)", kind: "inhibitor", target: "ATPSYN", agent: "Oligomycin", text: "Blocks the proton channel (F₀) of ATP synthase, so protons cannot flow back through it." },
  { id: "uncoupler", title: "Uncoupler (2,4-dinitrophenol, FCCP)", kind: "uncoupler", agent: "2,4-Dinitrophenol (a protonophore)", text: "A lipid-soluble weak acid that carries protons across the inner membrane, bypassing ATP synthase." },
  { id: "hypoxia", title: "Low oxygen supply", kind: "hypoxia", agent: "Reduced O₂", text: "The terminal electron acceptor is scarce, so complex IV is slowed (not blocked at the enzyme)." },
];
export const CONDITIONS_BY_ID: Record<string, EtcCondition> = Object.fromEntries(CONDITIONS.map((c) => [c.id, c]));

export type Level = "stops" | "falls" | "normal" | "rises";
export type GradientLevel = "collapses" | "lower" | "normal" | "higher";
export interface RedoxEntry { carrier: CarrierId; state: "more reduced" | "more oxidized" | "unchanged" }
export interface EtcOutcome {
  donors: Array<{ donor: Donor; flows: boolean; blockedAt: ComplexId | null; protonsPerPair: number }>;
  electronFlow: Level; oxygenUse: Level; protonPumping: Level; gradient: GradientLevel; atpSynthesis: Level; heat: Level;
  redox: RedoxEntry[];
  explanation: string[];
  /** Every statement is derived from the chain topology and rules above; none is a measured rate. */
  basis: "topology-and-stated-rules";
}

/** `donors`: which electron donors are supplied. */
export function etcOutcome(donors: Donor[], conditionId: string): EtcOutcome {
  const cond = CONDITIONS_BY_ID[conditionId] ?? CONDITIONS[0];
  const supplied = DONOR_IDS.filter((d) => donors.includes(d));
  const rows = supplied.map((donor) => {
    const blockedAt = cond.kind === "inhibitor" && cond.target && cond.target !== "ATPSYN" && complexesOnPath(donor).includes(cond.target) ? cond.target : null;
    return { donor, flows: blockedAt === null, blockedAt, protonsPerPair: protonsPerPair(donor) };
  });
  const anyFlow = rows.some((r) => r.flows);
  const allFlow = rows.length > 0 && rows.every((r) => r.flows);
  let electronFlow: Level = allFlow ? "normal" : anyFlow ? "falls" : "stops";
  let protonPumping: Level = electronFlow;
  let gradient: GradientLevel = allFlow ? "normal" : anyFlow ? "lower" : "collapses";
  let atp: Level = allFlow ? "normal" : anyFlow ? "falls" : "stops";
  let heat: Level = "normal";
  const explanation: string[] = [];
  const names = (xs: ComplexId[]) => xs.map((x) => `complex ${COMPLEXES[x].short}`).join(", ");
  const short = (d: Donor) => DONORS[d].short;

  if (!rows.length) { explanation.push("No electron donor is supplied, so there is no electron flow."); electronFlow = protonPumping = atp = "stops"; gradient = "collapses"; }
  if (cond.kind === "inhibitor" && cond.target && cond.target !== "ATPSYN" && rows.length) {
    const blocked = rows.filter((r) => !r.flows).map((r) => short(r.donor));
    if (blocked.length) explanation.push(`${cond.agent} acts at ${names([cond.target])}. Electrons from ${blocked.join(" and ")} must pass that complex, so that route stops.`);
    const others = rows.filter((r) => r.flows);
    if (others.length && blocked.length) explanation.push(`${others.map((r) => short(r.donor)).join(" and ")} does not pass ${names([cond.target])}, so that route keeps running (at its own proton-pumping stoichiometry).`);
    if (!anyFlow && blocked.length) explanation.push("With no route open, protons are no longer pumped and the existing gradient dissipates through ATP synthase and leaks, so ATP synthesis falls.");
    if (!blocked.length) explanation.push(`${cond.agent} acts at ${names([cond.target])}, which the supplied donor's electrons never pass, so this donor is unaffected.`);
  }
  if (cond.id === "oligomycin") {
    electronFlow = rows.length ? "falls" : "stops"; protonPumping = electronFlow; gradient = rows.length ? "higher" : "collapses"; atp = "stops";
    explanation.push("ATP synthase cannot let protons back, so the gradient rises. A steep gradient opposes further proton pumping, so electron transport and O₂ use fall (respiratory control). ATP synthesis stops.");
  }
  if (cond.kind === "uncoupler" && rows.length) {
    electronFlow = "rises"; protonPumping = "rises"; gradient = "collapses"; atp = "falls"; heat = "rises";
    explanation.push("The uncoupler returns protons to the matrix without passing through ATP synthase, so the gradient is dissipated. With no back-pressure the chain runs faster and O₂ use rises, but little of the energy is captured as ATP; much is released as heat.");
  }
  if (cond.kind === "hypoxia" && rows.length) {
    electronFlow = "falls"; protonPumping = "falls"; gradient = "lower"; atp = "falls";
    explanation.push("O₂ is the terminal acceptor. When it is scarce, complex IV slows, electrons back up, carriers upstream stay reduced, and proton pumping and ATP synthesis fall.");
  }
  if (cond.kind === "control" && rows.length) explanation.push("Electron flow, proton pumping and ATP synthesis proceed together because the gradient links them.");

  // redox "crossover": upstream of a block stays reduced, downstream is more oxidized
  const redox: RedoxEntry[] = [];
  if (cond.kind === "inhibitor" && cond.target && cond.target !== "ATPSYN") {
    const blockedDonor = rows.find((r) => !r.flows);
    if (blockedDonor) {
      const path = DONORS[blockedDonor.donor].path, at = path.indexOf(cond.target);
      path.forEach((c, i) => { if (c !== "O2") redox.push({ carrier: c, state: i < at ? "more reduced" : i === at ? "unchanged" : "more oxidized" }); });
    }
  } else if (cond.kind === "hypoxia" && rows.length) {
    DONORS[rows[0].donor].path.filter((c) => c !== "O2").forEach((c) => redox.push({ carrier: c, state: "more reduced" }));
  }
  return { donors: rows, electronFlow, oxygenUse: electronFlow, protonPumping, gradient, atpSynthesis: atp, heat, redox, explanation, basis: "topology-and-stated-rules" };
}

/** Teaching estimate of ATP per electron pair of each donor. */
export const atpEstimate = (donor: Donor): number => (donor === "nadh" ? atpPerNadh() : atpPerFadh2());
export const ETC_ASSUMPTIONS = [
  `Conventional mammalian teaching values: about ${OXPHOS_ASSUMPTIONS.protonsPerNadh} H⁺ pumped per electron pair from NADH (complexes I 4 + III 4 + IV 2) and about ${OXPHOS_ASSUMPTIONS.protonsPerFadh2} H⁺ from succinate/FADH₂ (complex II pumps none: III 4 + IV 2). Measured stoichiometries vary and are still debated.`,
  `ATP per electron pair is an estimate: protons pumped ÷ about ${OXPHOS_ASSUMPTIONS.protonsPerAtp} H⁺ per ATP (≈ 2.7 through ATP synthase plus ≈ 1 for phosphate/nucleotide transport) gives about 2.5 ATP per NADH and 1.5 per FADH₂. These are illustrative P/O ratios, not universal constants.`,
  "Inhibitor and uncoupler outcomes are qualitative directions derived from the chain's topology and from respiratory control; no oxygen-consumption rate, membrane potential or ATP rate is computed.",
  "Glycolytic NADH cannot cross the inner membrane; its reducing equivalents enter through a shuttle, which changes the yield (malate–aspartate ≈ 2.5, glycerol-phosphate ≈ 1.5 ATP per cytosolic NADH).",
];
