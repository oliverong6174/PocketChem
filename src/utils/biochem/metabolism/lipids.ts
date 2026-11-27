/**
 * Stage 25 fatty-acid and ketone-body engine (pure; no React). Every count is obtained by summing the stoichiometry of the shared network's
 * reactions (network.ts), never from a stored answer: the diagram, the cofactor ledger, the questions and the tests all read the same sequence.
 *
 * Accounting conventions (stated in the UI):
 *  - ATP equivalents follow Stage 18: about 2.5 ATP per NADH and 1.5 per FADH₂ (10 and 6 H⁺ pumped, about 4 H⁺ per ATP), and one acetyl-CoA
 *    through the citric acid cycle gives 3 NADH + 1 FADH₂ + 1 GTP, about 10 ATP. These are conventions, not measurements.
 *  - "High-energy bonds" counts phosphoanhydride bonds: ATP 2, ADP 1, PPi 1 (GTP 2, GDP 1). Thioesters are not counted.
 *  - Nothing here is a rate, concentration or flux.
 */
import {
  REACTIONS_BY_ID, SUPPORTED_EVEN_CHAINS, SUPPORTED_ODD_CHAINS, CHAIN_BASES, carnitineRequirement, chainMetabolite, chainMetaboliteId, chainReaction, fasReaction,
  FATTY_ACID_NAME, type ChainBase, type FasBase, type Reaction, type Tendency,
} from "./network";
import { atpPerFadh2, atpPerNadh, carriersOf, pathwayNet, reactionNet, type Net } from "./ledger";

const add = (a: Net, b: Net, times = 1): Net => { const o: Net = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = (o[k] ?? 0) + v * times; return o; };
const tidy = (n: Net): Net => { const o: Net = {}; for (const [k, v] of Object.entries(n)) { const r = Math.round(v * 1e6) / 1e6; if (r !== 0) o[k] = r; } return o; };

// ---- high-energy bond accounting --------------------------------------------------------------------------------------------------------

export const HIGH_ENERGY_BONDS: Record<string, number> = { atp: 2, adp: 1, gtp: 2, gdp: 1, ppi: 1 };
/** Change in the number of phosphoanhydride (high-energy) bonds; negative means bonds were spent. */
export function bondChange(net: Net): number { return Object.entries(net).reduce((s, [k, v]) => s + (HIGH_ENERGY_BONDS[k] ?? 0) * v, 0); }

/** A registered reaction, or the generated chain-length instance named by an id such as "ACAD:12" or "KS:10". */
export function reactionOfId(id: string): Reaction {
  const known = REACTIONS_BY_ID[id];
  if (known) return known;
  const [base, n] = id.split(":");
  return (CHAIN_BASES as string[]).includes(base) ? chainReaction(base as ChainBase, Number(n)).reaction : fasReaction(base as FasBase, Number(n));
}

// ---- fatty-acid structure explorer ------------------------------------------------------------------------------------------------------

export interface FattyAcidInfo {
  carbons: number; name: string; formula: string; smiles: string; acylCoaFormula: string; acylCoaId: string; fattyAcidId: string;
  /** Carbon numbering from the carboxyl carbon (C1), then α (C2), β (C3) and the ω (methyl) carbon. */
  carbonLabels: Array<{ position: number; role: "carboxyl" | "alpha" | "beta" | "chain" | "omega" }>;
  saturation: "saturated"; carnitine: "no" | "partly" | "yes"; activationCompartment: "omm" | "matrix"; activationEnzyme: string;
  cycles: number; acetylCoA: number;
}
export function isSupportedSaturatedLength(n: number): boolean { return (SUPPORTED_EVEN_CHAINS as readonly number[]).includes(n); }
export function fattyAcidInfo(n: number): FattyAcidInfo {
  if (!isSupportedSaturatedLength(n)) throw new Error("Unsupported chain length: " + n);
  const fa = chainMetabolite("fa", n), acyl = chainMetabolite("acylcoa", n);
  const labels = Array.from({ length: n }, (_, i) => ({ position: i + 1, role: (i === 0 ? "carboxyl" : i === 1 ? "alpha" : i === 2 ? "beta" : i === n - 1 ? "omega" : "chain") as FattyAcidInfo["carbonLabels"][number]["role"] }));
  return {
    carbons: n, name: FATTY_ACID_NAME[n], formula: fa.formula!, smiles: fa.structure!.smiles, acylCoaFormula: acyl.formula!, acylCoaId: acyl.id, fattyAcidId: fa.id, carbonLabels: labels,
    saturation: "saturated", carnitine: carnitineRequirement(n), activationCompartment: n <= 10 ? "matrix" : "omm", activationEnzyme: n <= 10 ? "Medium-chain acyl-CoA synthetase (matrix)" : "Long-chain acyl-CoA synthetase (outer mitochondrial membrane)",
    cycles: n / 2 - 1, acetylCoA: n / 2,
  };
}

// ---- activation ---------------------------------------------------------------------------------------------------------------------------

export interface ActivationModel {
  carbons: number;
  /** Net of the synthetase step alone: ATP → AMP + PPi. */
  synthetase: Net; synthetaseBonds: number;
  /** After pyrophosphatase hydrolyses PPi. */
  withPyrophosphatase: Net; bondsAfterPyrophosphatase: number;
  /** After adenylate kinase shows the ATP equivalents (AMP + ATP → 2 ADP). */
  full: Net; atpMolecules: number; atpEquivalents: number;
}
export function activation(n: number): ActivationModel {
  const acs = reactionNet(chainReaction("ACS", n).reaction), ppase = reactionNet(REACTIONS_BY_ID.PPASE), adk = reactionNet(REACTIONS_BY_ID.ADK);
  const withPp = tidy(add(acs, ppase)), full = tidy(add(withPp, adk));
  return {
    carbons: n, synthetase: acs, synthetaseBonds: -bondChange(acs), withPyrophosphatase: withPp, bondsAfterPyrophosphatase: -bondChange(withPp),
    full, atpMolecules: -(acs.atp ?? 0), atpEquivalents: -(full.atp ?? 0),
  };
}

// ---- carnitine shuttle --------------------------------------------------------------------------------------------------------------------

export interface ShuttleStep { id: string; title: string; reactionId: string; location: string; acylForm: string; carnitineMovement: string; text: string }
export function carnitineShuttle(n: number): { required: "no" | "partly" | "yes"; steps: ShuttleStep[]; note: string } {
  const req = carnitineRequirement(n);
  const cpt1 = chainReaction("CPT1", n).reaction, cact = chainReaction("CACT", n).reaction, cpt2 = chainReaction("CPT2", n).reaction;
  const steps: ShuttleStep[] = [
    { id: "activated", title: "Acyl-CoA in the cytosol", reactionId: chainReaction("ACS", n).reaction.id, location: "Cytosol, outer-membrane face", acylForm: "Acyl-CoA", carnitineMovement: "Carnitine in the intermembrane space", text: "Long-chain acyl-CoA is made at the outer mitochondrial membrane. The inner membrane is impermeable to CoA derivatives." },
    { id: "cpt1", title: "CPT I: acyl-CoA + carnitine → acylcarnitine + CoA", reactionId: cpt1.id, location: "Outer mitochondrial membrane", acylForm: "Acylcarnitine", carnitineMovement: "Carnitine is acylated; CoA is released into the cytosol", text: "The acyl group moves from CoA to carnitine. Malonyl-CoA inhibits this step." },
    { id: "cact", title: "Translocase: acylcarnitine in, free carnitine out", reactionId: cact.id, location: "Inner mitochondrial membrane", acylForm: "Acylcarnitine (crossing)", carnitineMovement: "Antiport: acylcarnitine enters the matrix while free carnitine leaves", text: "A carrier (no bonds change) exchanges the two species so that carnitine is recycled." },
    { id: "cpt2", title: "CPT II: acylcarnitine + CoA → acyl-CoA + carnitine", reactionId: cpt2.id, location: "Matrix face of the inner membrane", acylForm: "Acyl-CoA (matrix)", carnitineMovement: "Free carnitine is regenerated for the translocase", text: "The acyl group moves back to a mitochondrial CoA, the pool β-oxidation uses." },
  ];
  const note = req === "yes" ? "Long-chain acyl groups (about C14 and longer) need the carnitine shuttle." : req === "partly" ? "C12 is borderline: some enters without carnitine and some uses the shuttle; the boundary is approximate." : "Short and medium chains (about C4–C10) cross the membranes without the shuttle and are activated in the matrix, so CPT I and malonyl-CoA control do not apply to them.";
  return { required: req, steps, note };
}

// ---- β-oxidation ------------------------------------------------------------------------------------------------------------------------

export type Substrate = { kind: "saturated"; carbons: number } | { kind: "oleate" };
export type OxidationSupport = { supported: true; atpSupported: boolean; reason?: string } | { supported: false; reason: string };

/** Cases that are deliberately NOT calculated, with the reason shown in the interface. */
export const UNSUPPORTED_CASES: Array<{ id: string; label: string; reason: string }> = [
  { id: "linoleate", label: "Polyunsaturated fatty acids (e.g. linoleate, C18:2)", reason: "They also need 2,4-dienoyl-CoA reductase (consuming NADPH), whose placement depends on the double-bond positions; the ATP value is not calculated here." },
  { id: "very-long", label: "Very-long-chain fatty acids (longer than C20)", reason: "Their first cycles occur in peroxisomes, where the first oxidation step (acyl-CoA oxidase) makes H₂O₂ instead of FADH₂ for the respiratory chain." },
  { id: "branched", label: "Branched-chain fatty acids (e.g. phytanic acid)", reason: "A β-methyl branch blocks β-oxidation; α-oxidation in peroxisomes is needed first." },
  { id: "short-acetate", label: "Acetate and propionate as substrates", reason: "These are activated by different synthetases and do not go through a full β-oxidation cycle." },
  { id: "hydroxy-modified", label: "Hydroxylated, branched or otherwise modified fatty acids", reason: "No verified structure or enzyme sequence is available for arbitrary modifications." },
];

export function oxidationSupport(substrate: Substrate): OxidationSupport {
  if (substrate.kind === "oleate") return { supported: true, atpSupported: true, reason: "Monounsaturated cis-Δ9 case: one acyl-CoA dehydrogenase step is replaced by enoyl-CoA isomerase." };
  const n = substrate.carbons;
  if (!Number.isInteger(n) || n < 4) return { supported: false, reason: "Fewer than four carbons: not a β-oxidation substrate in this model (see acetate and propionate)." };
  if (n > 18) return { supported: false, reason: "Longer than C18: very-long-chain oxidation begins in peroxisomes and is not modelled." };
  if (n % 2 === 0) return { supported: true, atpSupported: true };
  if ((SUPPORTED_ODD_CHAINS as readonly number[]).includes(n)) return { supported: true, atpSupported: false, reason: "Odd-chain: the products of β-oxidation are counted exactly, but the ATP value is not calculated because it depends on how the three-carbon end (via succinyl-CoA) is finally disposed of." };
  return { supported: false, reason: "Unsupported chain length." };
}

export type StepPhase = "acad" | "ech" | "hadh" | "thiol" | "isomerase";
export interface OxidationStep {
  index: number; cycle: number; phase: StepPhase; reactionId: string; direction: "forward" | "reverse";
  /** Chain length of the acyl-CoA at the start of the cycle. */
  chainBefore: number;
  /** Chain length of the acyl-CoA that remains after this step (only changes at thiolysis). */
  chainAfter: number;
  title: string; enzyme: string; carriers: Net; note?: string;
}
const PHASE_BASE: Record<Exclude<StepPhase, "isomerase">, ChainBase> = { acad: "ACAD", ech: "ECH", hadh: "HADH", thiol: "THIOL" };
const PHASE_TITLE: Record<StepPhase, string> = { acad: "Dehydrogenation (FAD → FADH₂)", ech: "Hydration", hadh: "Dehydrogenation (NAD⁺ → NADH)", thiol: "Thiolytic cleavage", isomerase: "Isomerization (cis-Δ3 → trans-Δ2)" };

/** The ordered reaction sequence that takes the activated substrate to acetyl-CoA (and propionyl-CoA for odd chains). */
export function oxidationSequence(substrate: Substrate): OxidationStep[] {
  const start = substrate.kind === "oleate" ? 18 : substrate.carbons;
  if (!oxidationSupport(substrate).supported) return [];
  const odd = start % 2 === 1, last = odd ? 5 : 4;
  const steps: OxidationStep[] = [];
  let cycle = 0;
  for (let L = start; L >= last; L -= 2) {
    cycle += 1;
    const isomeraseHere = substrate.kind === "oleate" && L === 12;
    for (const phase of ["acad", "ech", "hadh", "thiol"] as const) {
      const useIso = isomeraseHere && phase === "acad";
      const { reaction, direction } = useIso ? { reaction: REACTIONS_BY_ID["ECI:12"], direction: "forward" as const } : chainReaction(PHASE_BASE[phase], L);
      const effPhase: StepPhase = useIso ? "isomerase" : phase;
      steps.push({
        index: steps.length + 1, cycle, phase: effPhase, reactionId: reaction.id, direction, chainBefore: L, chainAfter: phase === "thiol" ? L - 2 : L,
        title: PHASE_TITLE[effPhase], enzyme: reaction.enzyme, carriers: reactionNet(reaction, direction),
        note: substrate.kind === "oleate" && L > 12 ? "Unsaturated intermediate: shown by chain length; its carrier changes equal those of the saturated step." : undefined,
      });
    }
  }
  return steps;
}

export interface OxidationState {
  step: number; cycle: number; chain: number; stepsTotal: number;
  /** Cumulative carriers and products after `step` reactions. */
  nadh: number; fadh2: number; acetylCoA: number; propionylCoA: number; coaConsumed: number;
  /** Phase of the last step performed (null at the start). */
  lastPhase: StepPhase | null;
}
export function oxidationStateAfter(substrate: Substrate, step: number): OxidationState {
  const seq = oxidationSequence(substrate);
  let nadh = 0, fadh2 = 0, acetyl = 0, prop = 0, coa = 0;
  let chain = substrate.kind === "oleate" ? 18 : substrate.carbons, cycle = 0;
  let last: StepPhase | null = null;
  for (const s of seq.slice(0, Math.max(0, Math.min(step, seq.length)))) {
    nadh += s.carriers.nadh ?? 0; fadh2 += s.carriers.fadh2 ?? 0;
    acetyl += s.carriers.acetylcoa ?? 0; prop += s.carriers.propionylcoa ?? 0; coa += -(s.carriers.coa ?? 0);
    chain = s.chainAfter; cycle = s.cycle; last = s.phase;
  }
  return { step: Math.min(step, seq.length), cycle, chain, stepsTotal: seq.length, nadh, fadh2, acetylCoA: acetyl, propionylCoA: prop, coaConsumed: coa, lastPhase: last };
}

export interface OxidationTotals {
  cycles: number; acetylCoA: number; propionylCoA: number; nadh: number; fadh2: number;
  activationAtpEquivalents: number;
  /** ATP-equivalent breakdown; null when the case is not supported quantitatively. */
  atp: null | { fromNadh: number; fromFadh2: number; fromAcetylCoA: number; activation: number; total: number };
  /** Direct yield of the β-oxidation sequence alone: no ATP, only carriers and acetyl-CoA. */
  atpDirectlyFromBetaOxidation: 0;
  /** Per acetyl-CoA through the cycle (from the shared Stage 18 cycle ledger). */
  atpPerAcetylCoA: number;
  note?: string;
}
export const acetylCoaCycleAtp = (): number => { const t = carriersOf(pathwayNet("tca", "event")); return t.nadh * atpPerNadh() + t.fadh2 * atpPerFadh2() + t.ntpEquivalents; };

export function oxidationTotals(substrate: Substrate): OxidationTotals | null {
  const support = oxidationSupport(substrate);
  if (!support.supported) return null;
  const seq = oxidationSequence(substrate);
  let net: Net = {};
  for (const s of seq) net = add(net, s.carriers);
  const start = substrate.kind === "oleate" ? 18 : substrate.carbons;
  const act = activation(start);
  const activationCost = act.atpEquivalents;
  const t = { cycles: seq.filter((s) => s.phase === "thiol").length, acetylCoA: net.acetylcoa ?? 0, propionylCoA: net.propionylcoa ?? 0, nadh: net.nadh ?? 0, fadh2: net.fadh2 ?? 0 };
  const perAcetyl = acetylCoaCycleAtp();
  let atp: OxidationTotals["atp"] = null;
  if (support.atpSupported) {
    const fromNadh = t.nadh * atpPerNadh(), fromFadh2 = t.fadh2 * atpPerFadh2(), fromAcetyl = t.acetylCoA * perAcetyl;
    atp = { fromNadh, fromFadh2, fromAcetylCoA: fromAcetyl, activation: -activationCost, total: fromNadh + fromFadh2 + fromAcetyl - activationCost };
  }
  return { ...t, activationAtpEquivalents: activationCost, atp, atpDirectlyFromBetaOxidation: 0, atpPerAcetylCoA: perAcetyl, note: support.reason };
}

// ---- odd-chain: propionyl-CoA to succinyl-CoA -------------------------------------------------------------------------------------------

export const PROPIONATE_ROUTE = ["PCC", "MCEE", "MUT"] as const;
export function propionateRoute() {
  const steps = PROPIONATE_ROUTE.map((id) => REACTIONS_BY_ID[id]);
  let net: Net = {};
  for (const r of steps) net = add(net, reactionNet(r));
  return {
    steps, net: tidy(net), atpSpent: -(net.atp ?? 0), cofactors: [{ enzyme: "Propionyl-CoA carboxylase", cofactor: "Biotin (vitamin B₇)", reaction: "PCC" }, { enzyme: "Methylmalonyl-CoA mutase", cofactor: "Adenosylcobalamin (vitamin B₁₂)", reaction: "MUT" }],
    note: "Succinyl-CoA enters the citric acid cycle as an intermediate. Whether its four carbons are fully oxidized to CO₂ or leave as a glucose precursor depends on what else happens to malate and oxaloacetate; the model therefore gives no ATP total for odd-chain fatty acids.",
  };
}

// ---- fatty-acid synthesis ---------------------------------------------------------------------------------------------------------------

export type AcetylSource = "mitochondrial-citrate" | "cytosolic";
export interface SynthesisStep { index: number; round: number; reactionId: string; chainAfter: number; title: string }
export function isSupportedSynthesisLength(n: number): boolean { return (SUPPORTED_EVEN_CHAINS as readonly number[]).includes(n); }
/** Reactions of de novo synthesis in order: loading, then per round condensation, reduction, dehydration, reduction, finally release. */
export function synthesisSequence(n: number): SynthesisStep[] {
  if (!isSupportedSynthesisLength(n)) return [];
  const out: SynthesisStep[] = [];
  const push = (r: Reaction, round: number, chainAfter: number, title: string) => out.push({ index: out.length + 1, round, reactionId: r.id, chainAfter, title });
  push(REACTIONS_BY_ID["MAT-AC"], 0, 2, "Load the acetyl primer onto ACP");
  for (let m = 4, round = 1; m <= n; m += 2, round += 1) {
    push(REACTIONS_BY_ID.ACC, round, m - 2, "Make malonyl-CoA (acetyl-CoA carboxylase)");
    push(REACTIONS_BY_ID["MAT-MAL"], round, m - 2, "Load malonyl onto ACP");
    push(fasReaction("KS", m), round, m, "Condensation (+2 carbons, CO₂ lost)");
    push(fasReaction("KR", m), round, m, "Reduction (NADPH)");
    push(fasReaction("DH", m), round, m, "Dehydration");
    push(fasReaction("ER", m), round, m, "Reduction (NADPH)");
  }
  push(fasReaction("TE", n), Math.floor(n / 2) - 1, n, "Release the free fatty acid");
  return out;
}
export interface SynthesisLedger {
  carbons: number; acetylUnits: number; malonylCoA: number; rounds: number;
  nadphConsumed: number; atpForMalonylCoA: number; atpForAcetylCoAExport: number; atpTotalFromAcetylSource: number;
  nadphFromMalicEnzyme: number; nadphOtherSources: number; co2Fixed: number; co2Released: number; coaReleased: number; water: number;
  net: Net; source: AcetylSource;
}
export function synthesisLedger(n: number, source: AcetylSource = "mitochondrial-citrate"): SynthesisLedger | null {
  if (!isSupportedSynthesisLength(n)) return null;
  const u = n / 2;
  let net: Net = {};
  for (const s of synthesisSequence(n)) net = add(net, reactionNet(REACTIONS_BY_ID[s.reactionId] ?? fasReaction(s.reactionId.split(":")[0] as "KS", Number(s.reactionId.split(":")[1]))));
  let malic = 0, exportAtp = 0;
  if (source === "mitochondrial-citrate") {
    // each exported acetyl-CoA: citrate carrier, ATP-citrate lyase, then oxaloacetate → malate (cytosolic MDH, NADH) → pyruvate (malic enzyme, NADPH)
    net = add(net, reactionNet(REACTIONS_BY_ID["CIT-EXP"]), u); net = add(net, reactionNet(REACTIONS_BY_ID.ACLY), u);
    net = add(net, reactionNet(REACTIONS_BY_ID["MDH-C"], "reverse"), u); net = add(net, reactionNet(REACTIONS_BY_ID.ME1), u);
    malic = u; exportAtp = u;
  }
  net = tidy(net);
  const needed = 2 * (u - 1);
  const acc = u - 1;
  return {
    carbons: n, acetylUnits: u, malonylCoA: acc, rounds: u - 1, nadphConsumed: needed, atpForMalonylCoA: acc, atpForAcetylCoAExport: exportAtp, atpTotalFromAcetylSource: acc + exportAtp,
    nadphFromMalicEnzyme: Math.min(malic, needed), nadphOtherSources: needed - Math.min(malic, needed), co2Fixed: acc, co2Released: acc, coaReleased: u, water: net.h2o ?? 0, net, source,
  };
}
export const SYNTHESIS_NOTES = [
  "ATP spent forming malonyl-CoA (acetyl-CoA carboxylase) and NADPH consumed by the two reductions per round are different currencies: ATP is not NADPH, and the model keeps them in separate ledger rows.",
  "The CO₂ added by acetyl-CoA carboxylase is released again at the condensation, so no carbon from CO₂ ends up in the fatty acid; the condensation is driven by that decarboxylation.",
  "Cytosolic NADPH comes from the pentose phosphate pathway and malic enzyme. Only the malic-enzyme share that follows from the citrate shuttle is derived here; the rest is labelled 'other sources' and is not modelled.",
  "The 8 ATP for acetyl-CoA export apply only when the acetyl-CoA is exported from mitochondria as citrate; acetyl-CoA formed in the cytosol would not incur them.",
];
export const WHY_NOT_REVERSE = [
  "Location: oxidation is mitochondrial; synthesis is cytosolic.",
  "Carrier: oxidation intermediates are CoA thioesters; synthesis intermediates are bound to the acyl carrier protein of fatty-acid synthase.",
  "Reducing agent: oxidation makes FADH₂ and NADH; synthesis consumes NADPH, a separate pool.",
  "Stereochemistry: oxidation uses the L-3-hydroxyacyl isomer; synthesis makes the D-3-hydroxyacyl isomer.",
  "Carbon donor and energy: synthesis adds carbons from malonyl-CoA (made with ATP) and is driven by decarboxylation, whereas oxidation removes acetyl-CoA by thiolysis.",
  "Control: malonyl-CoA, made only by the synthesis pathway, inhibits CPT I so that both pathways are not run at once.",
];

// ---- ketone bodies ----------------------------------------------------------------------------------------------------------------------

export const KETOGENESIS_STEPS = ["ACAT", "HMGCS2", "HMGCL", "BDH1", "KB-EXPORT"] as const;
export const KETOLYSIS_STEPS = ["KB-IMPORT", "BDH1", "SCOT", "ACAT"] as const;
export type KetoneForm = "acetoacetate" | "bhb";
export function ketogenesisNet(form: KetoneForm): Net {
  let net: Net = {};
  for (const id of ["ACAT", "HMGCS2", "HMGCL"]) net = add(net, reactionNet(REACTIONS_BY_ID[id]));
  if (form === "bhb") net = add(net, reactionNet(REACTIONS_BY_ID.BDH1));
  return tidy(net);
}
export function ketolysisNet(form: KetoneForm): Net {
  let net: Net = {};
  if (form === "bhb") net = add(net, reactionNet(REACTIONS_BY_ID.BDH1, "reverse"));
  net = add(net, reactionNet(REACTIONS_BY_ID.SCOT)); net = add(net, reactionNet(REACTIONS_BY_ID.ACAT, "reverse"));
  return tidy(net);
}
/** ATP equivalents from oxidizing one ketone body completely: 2 acetyl-CoA through the cycle, minus the GTP of succinyl-CoA synthetase that SCOT bypasses, plus NADH from β-hydroxybutyrate. */
export function ketoneOxidationAtp(form: KetoneForm) {
  const k = ketolysisNet(form);
  const acetyl = k.acetylcoa ?? 0;
  const perTurn = acetylCoaCycleAtp();
  const bypassed = carriersOf(reactionNet(REACTIONS_BY_ID.SCS)).ntpEquivalents; // GTP/ATP the cycle would have made from the succinyl-CoA that SCOT consumed
  const upstreamNadh = (k.nadh ?? 0) * atpPerNadh();
  return { acetylCoA: acetyl, fromCycle: acetyl * perTurn, forgoneNtp: bypassed, fromBdh1Nadh: upstreamNadh, total: acetyl * perTurn - bypassed + upstreamNadh };
}
export const KETONE_TISSUES: Array<{ id: string; label: string; makes: boolean; uses: boolean; why: string }> = [
  { id: "liver", label: "Liver (hepatocyte mitochondria)", makes: true, uses: false, why: "Expresses mitochondrial HMG-CoA synthase and lyase; has very little SCOT, so it cannot activate ketone bodies for oxidation." },
  { id: "heart-muscle", label: "Heart and skeletal muscle", makes: false, uses: true, why: "Express SCOT and have abundant mitochondria; do not make ketone bodies in meaningful amounts." },
  { id: "brain", label: "Brain (after adaptation to fasting)", makes: false, uses: true, why: "Cannot burn fatty acids appreciably but can use ketone bodies delivered in blood, sparing glucose." },
  { id: "kidney", label: "Kidney", makes: false, uses: true, why: "Uses ketone bodies; also a site of gluconeogenesis." },
  { id: "rbc", label: "Red blood cells", makes: false, uses: false, why: "No mitochondria, so neither ketolysis nor oxidation of fatty acids is possible; they rely on glycolysis." },
];
export const KETOGENESIS_CONDITIONS = [
  "Ketogenesis becomes important when hepatic β-oxidation delivers more acetyl-CoA to the matrix than the citric acid cycle takes up, typically when insulin is low and glucagon is high (fasting, prolonged exercise, uncontrolled diabetes) and fatty-acid supply to the liver is high.",
  "More acetyl-CoA does not automatically mean more ketone bodies: in the fed state, high insulin favours fatty-acid synthesis and malonyl-CoA inhibits CPT I, so little acetyl-CoA comes from fatty-acid oxidation; the model gives a direction only when the curated conditions are met.",
  "Oxaloacetate availability (competition with gluconeogenesis) and the mitochondrial NADH/NAD⁺ ratio also matter; the model does not quantify them.",
];

// ---- qualitative regulation of lipid metabolism --------------------------------------------------------------------------------------

export type Hormone = "insulin" | "balanced" | "glucagon";
export type Level3 = "low" | "normal" | "high";
export interface LipidConditions { hormone: Hormone; energy: Level3; citrate: Level3; acylCoa: Level3 }
export const NORMAL_LIPID_CONDITIONS: LipidConditions = { hormone: "balanced", energy: "normal", citrate: "normal", acylCoa: "normal" };
export const LIPID_PRESETS: Array<{ id: string; title: string; conditions: LipidConditions; text: string; caveat: string }> = [
  { id: "reference", title: "Reference (all balanced)", conditions: NORMAL_LIPID_CONDITIONS, text: "No condition departs from the reference state.", caveat: "The reference is a bookkeeping origin, not a measured physiological state." },
  { id: "fed", title: "Fed-associated", conditions: { hormone: "insulin", energy: "high", citrate: "high", acylCoa: "normal" }, text: "Insulin-dominant, energy-rich: acetyl-CoA carboxylase tends to be more active, malonyl-CoA tends to be higher, CPT I is inhibited, so synthesis is favoured over oxidation.", caveat: "Liver and adipose tissue respond in the way described; muscle uses its own ACC isoform and malonyl-CoA decarboxylase. No rates are computed." },
  { id: "fasting", title: "Fasting-associated", conditions: { hormone: "glucagon", energy: "low", citrate: "low", acylCoa: "normal" }, text: "Glucagon-dominant, low energy: ACC tends to be phosphorylated (less active), malonyl-CoA tends to fall, CPT I is released from inhibition, so oxidation is favoured over synthesis.", caveat: "Adipose lipolysis supplies the fatty acids but is outside this model. Magnitudes and timing are not modelled." },
  { id: "low-energy", title: "Low cellular energy (AMPK-like signal)", conditions: { hormone: "balanced", energy: "low", citrate: "normal", acylCoa: "normal" }, text: "A low-energy signal phosphorylates ACC, lowering malonyl-CoA and releasing CPT I: oxidation is favoured and synthesis, an ATP-consuming process, is disfavoured.", caveat: "Only the ACC/CPT I axis is represented." },
  { id: "acyl-coa-feedback", title: "Abundant long-chain acyl-CoA", conditions: { hormone: "balanced", energy: "normal", citrate: "normal", acylCoa: "high" }, text: "Long-chain acyl-CoA feeds back to inhibit ACC, so synthesis is restrained when its product is plentiful.", caveat: "Feedback strength is not quantified." },
];
const val = (l: Level3) => (l === "low" ? -1 : l === "high" ? 1 : 0);
export interface LipidEffect { id: string; condition: keyof LipidConditions; target: "acc" | "cpt1"; sign: 1 | -1; kind: "covalent-indirect" | "allosteric" | "product-feedback"; note: string }
export const LIPID_EFFECTS: LipidEffect[] = [
  { id: "hormone-acc", condition: "hormone", target: "acc", sign: 1, kind: "covalent-indirect", note: "Insulin favours dephosphorylated (active) ACC and raises its expression; glucagon (through PKA) phosphorylates ACC and lowers its activity. One bipolar axis: insulin-dominant pushes up, glucagon-dominant pushes down (indirect, through kinases, phosphatases and transcription)." },
  { id: "energy-acc", condition: "energy", target: "acc", sign: 1, kind: "covalent-indirect", note: "Low cellular energy activates AMP-activated protein kinase (AMPK), which phosphorylates and inactivates ACC; high energy does not change ACC in this model." },
  { id: "citrate-acc", condition: "citrate", target: "acc", sign: 1, kind: "allosteric", note: "Citrate (a signal of abundant acetyl-CoA and ATP) is an allosteric activator of ACC (feed-forward)." },
  { id: "acylcoa-acc", condition: "acylCoa", target: "acc", sign: -1, kind: "product-feedback", note: "Long-chain acyl-CoA inhibits ACC (product feedback)." },
];
/** Direction of each condition level on ACC; the hormone axis is bipolar (insulin +, glucagon −) and energy acts only when low. */
function accDirection(c: LipidConditions) {
  const rows = [
    { effect: LIPID_EFFECTS[0], dir: c.hormone === "insulin" ? 1 : c.hormone === "glucagon" ? -1 : 0 },
    { effect: LIPID_EFFECTS[1], dir: c.energy === "low" ? -1 : 0 },
    { effect: LIPID_EFFECTS[2], dir: val(c.citrate) },
    { effect: LIPID_EFFECTS[3], dir: -val(c.acylCoa) },
  ];
  return rows;
}
export interface LipidTendencies { acc: Tendency; malonylCoA: Tendency; cpt1: Tendency; synthesis: Tendency; oxidation: Tendency; reasons: Array<{ id: string; dir: -1 | 0 | 1; note: string }> }
export function lipidRegulation(c: LipidConditions): LipidTendencies {
  const rows = accDirection(c);
  const up = rows.some((r) => r.dir > 0), down = rows.some((r) => r.dir < 0);
  const acc: Tendency = up && down ? "uncertain" : up ? "higher" : down ? "lower" : "reference";
  const flip = (t: Tendency): Tendency => (t === "higher" ? "lower" : t === "lower" ? "higher" : t);
  // malonyl-CoA is taken to follow ACC activity (malonyl-CoA decarboxylase is not modelled); CPT I is inhibited by malonyl-CoA
  const malonylCoA = acc, cpt1 = flip(malonylCoA);
  return { acc, malonylCoA, cpt1, synthesis: acc, oxidation: cpt1, reasons: rows.filter((r) => r.dir !== 0).map((r) => ({ id: r.effect.id, dir: r.dir as -1 | 1, note: r.effect.note })) };
}
export const LIPID_REGULATION_CAVEAT = "Directions only. Malonyl-CoA is assumed to follow ACC activity (malonyl-CoA decarboxylase and tissue isoforms are not modelled), and CPT I tendency is the opposite of the malonyl-CoA tendency. No rate, flux or concentration is computed; conflicting signals are reported as uncertain.";
export { chainMetaboliteId };
