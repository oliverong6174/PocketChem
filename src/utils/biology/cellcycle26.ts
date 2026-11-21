/**
 * Stage 26 / Tool 2: Cell cycle and checkpoint control.
 *
 * Three small curated models, all qualitative (active / inactive) with explicit rules:
 *   CYCLE_GRAPH   : mitogen → cyclin D–CDK4/6 → RB/E2F → cyclin E–CDK2 (G1/S); ATM/ATR → CHK → p53/p21/Cdc25 (DNA damage);
 *                   Wee1/Cdc25/cyclin B–CDK1 (G2/M); kinetochore → MCC → APC/C–Cdc20 → securin → separase → cohesin (spindle checkpoint).
 *   CDK_GRAPH     : the four conditions that decide whether one cyclin–CDK complex is active (cyclin concentration alone does not).
 *   LICENSE_GRAPH : once-per-cycle origin licensing (ORC, Cdc6, Cdt1, MCM) versus firing, with the three brakes that prevent re-licensing.
 * No durations, rates or activity levels are produced. Outcomes beyond the modelled gate (repair, senescence, apoptosis, mitotic errors) are listed as
 * NOT determined, never decided.
 */
import { all, any, canAdd, evaluateGraph, not, pertById, rootCauses, validatePerturbations, type Checked, type Outcome, type Perturbation, type RegGraph, type RootCause } from "./mechanism26";

// ================================================================ phases ================================================================

export type PhaseId = "G0" | "G1" | "S" | "G2" | "M";
export const PHASE_IDS: readonly PhaseId[] = ["G0", "G1", "S", "G2", "M"];
export interface PhaseInfo {
  id: PhaseId; name: string; process: "quiescence" | "growth" | "DNA replication" | "growth and preparation" | "chromosome segregation";
  summary: string; complexes: string[]; transitionOut: string; links: string;
}
export const PHASES: readonly PhaseInfo[] = [
  { id: "G0", name: "G0 (quiescence)", process: "quiescence", summary: "A cell that has left the cycle (or not yet entered it). Re-entry needs mitogenic signals, which switch cyclin D synthesis back on.", complexes: ["No cyclin–CDK complexes driving the cycle"], transitionOut: "G0 → G1 (re-entry)", links: "Mitogens arrive through receptor pathways such as the RTK–Ras–ERK cascade (Cell signaling)." },
  { id: "G1", name: "G1 (first gap)", process: "growth", summary: "The cell grows and decides whether to commit. Origins are licensed (MCM loaded). Cyclin D–CDK4/6 and then cyclin E–CDK2 inactivate the RB brake.", complexes: ["Cyclin D–CDK4/6", "Cyclin E–CDK2 (late G1)"], transitionOut: "G1 → S (restriction point, DNA-damage checkpoint)", links: "Licensing is the first half of DNA replication (DNA replication tool); the mitogen input comes from Cell signaling." },
  { id: "S", name: "S (synthesis)", process: "DNA replication", summary: "Licensed origins fire and the genome is replicated once. New licensing is blocked. Stalled forks activate ATR–CHK1.", complexes: ["Cyclin E–CDK2 → cyclin A–CDK2"], transitionOut: "S → G2 (replication complete)", links: "The replication machinery itself is in the DNA replication tool." },
  { id: "G2", name: "G2 (second gap)", process: "growth and preparation", summary: "Cyclin B accumulates but cyclin B–CDK1 is held inactive by Wee1 until Cdc25 removes the inhibitory phosphates and replication is complete.", complexes: ["Cyclin A–CDK1/2", "Cyclin B–CDK1 (held in check)"], transitionOut: "G2 → M (G2/M checkpoint)", links: "Entry into mitosis is the start of the Mitosis and meiosis tool." },
  { id: "M", name: "M (mitosis)", process: "chromosome segregation", summary: "Chromosomes attach to the spindle. Anaphase starts only when every kinetochore is attached; then APC/C–Cdc20 degrades securin and separase cleaves cohesin.", complexes: ["Cyclin B–CDK1", "APC/C–Cdc20"], transitionOut: "Metaphase → anaphase (spindle assembly checkpoint)", links: "The stages of mitosis are drawn in the Mitosis and meiosis tool." },
];
export const phaseInfo = (id: PhaseId): PhaseInfo => PHASES.find((p) => p.id === id)!;

// ================================================================ the regulatory graph ================================================================

export const CYCLE_MODULES = ["g1s", "ddr", "g2m", "sac"] as const;
export type CycleModule = (typeof CYCLE_MODULES)[number];
export const MODULE_TITLE: Record<CycleModule, string> = { g1s: "G1/S control", ddr: "DNA-damage checkpoint", g2m: "G2/M control", sac: "Spindle assembly checkpoint" };

export const CYCLE_GRAPH: RegGraph = {
  id: "cycle",
  nodes: [
    // ---- G1/S
    { id: "mitogen", label: "Mitogenic signal", module: "g1s", kind: "input", default: true, where: "Extracellular, receptor", role: "Growth-factor signalling (for example RTK–Ras–ERK) that drives cyclin D synthesis.", evidence: "established", caveat: "Cell types differ in how strongly they depend on growth factors." },
    { id: "pastRestriction", label: "Past the restriction point", module: "g1s", kind: "input", default: false, where: "Nucleus", role: "The cell has already committed to the cycle; cyclin E–CDK2 and RB phosphorylation reinforce each other so removing mitogen no longer stops it.", evidence: "simplified", caveat: "Committed status is a switch-like property of the network; here it is a user-set condition, not computed." },
    { id: "cycD", label: "Cyclin D available", module: "g1s", kind: "derived", expr: any("mitogen", "pastRestriction"), where: "Nucleus", role: "Cyclin D synthesis follows mitogenic signalling, and is sustained once the cell is committed.", evidence: "simplified" },
    { id: "cdk46", label: "Cyclin D–CDK4/6 active", module: "g1s", kind: "derived", expr: "cycD", where: "Nucleus", role: "Begins phosphorylating RB.", evidence: "established", caveat: "CDK4/6 also needs activating phosphorylation and can be restrained by INK4 proteins (see CDK regulation)." },
    { id: "rbBrake", label: "RB holds E2F (hypophosphorylated)", module: "g1s", kind: "derived", expr: not("cdk46"), where: "Nucleus", role: "Hypophosphorylated RB binds E2F and represses S-phase genes.", evidence: "established", caveat: "RB family members (RB, p107, p130) have partly distinct roles; RB is shown." },
    { id: "e2f", label: "E2F active", module: "g1s", kind: "derived", expr: not("rbBrake"), where: "Nucleus", role: "Transcription factor for cyclin E and S-phase genes.", evidence: "established" },
    { id: "cycE", label: "Cyclin E expressed", module: "g1s", kind: "derived", expr: "e2f", where: "Nucleus", role: "An E2F target gene.", evidence: "established" },
    { id: "cdk2e", label: "Cyclin E–CDK2 active", module: "g1s", kind: "derived", expr: all("cycE", not("p21"), "cdc25"), where: "Nucleus", role: "Further phosphorylates RB (positive feedback) and promotes origin firing.", evidence: "established", caveat: "The feedback loop is described in text, not drawn as a cycle, so the model stays a one-pass rule set." },
    { id: "licensed", label: "Origins licensed", module: "g1s", kind: "input", default: true, where: "Chromatin", role: "MCM2–7 loaded onto origins during G1 (see Replication licensing).", evidence: "established" },
    { id: "g1sPass", label: "G1/S transition permitted", module: "g1s", kind: "derived", expr: all("cdk2e", "licensed"), where: "Whole cell", role: "S phase can start: cyclin E–CDK2 (itself downstream of E2F) is active and licensed origins exist.", evidence: "simplified" },
    // ---- DNA damage
    { id: "dsb", label: "DNA double-strand breaks", module: "ddr", kind: "input", default: false, where: "Nucleus", role: "Damage recognised by sensors such as the MRN complex.", evidence: "established" },
    { id: "replStress", label: "Stalled replication forks (single-stranded DNA)", module: "ddr", kind: "input", default: false, where: "Replication fork", role: "RPA-coated single-stranded DNA at stalled forks activates ATR.", evidence: "established" },
    { id: "atm", label: "ATM active", module: "ddr", kind: "derived", expr: "dsb", where: "Nucleus", role: "ATM kinase is activated mainly by double-strand breaks.", evidence: "established" },
    { id: "atr", label: "ATR active", module: "ddr", kind: "derived", expr: any("replStress", "dsb"), where: "Nucleus", role: "ATR responds to single-stranded DNA at stalled forks, and to processed double-strand breaks.", evidence: "simplified", caveat: "Crosstalk between ATM and ATR is more extensive than drawn." },
    { id: "chk2", label: "CHK2 active", module: "ddr", kind: "derived", expr: "atm", where: "Nucleus", role: "Phosphorylated by ATM.", evidence: "established" },
    { id: "unreplicated", label: "Unreplicated DNA remains", module: "g2m", kind: "derived", expr: not("replicationComplete"), where: "Chromatin", role: "Replication is not finished.", evidence: "established" },
    { id: "chk1", label: "CHK1 active", module: "ddr", kind: "derived", expr: any("atr", "unreplicated"), where: "Nucleus", role: "Phosphorylated by ATR; also monitors incomplete replication.", evidence: "simplified" },
    { id: "p53", label: "p53 stabilised and active", module: "ddr", kind: "derived", expr: any("chk2", "atr"), where: "Nucleus", role: "Phosphorylation by ATM/CHK2 (and ATR/CHK1) stabilises p53.", evidence: "established", caveat: "p53 loss does not by itself produce malignancy or any single cell fate." },
    { id: "p21", label: "p21 (CDK inhibitor) induced", module: "ddr", kind: "derived", expr: "p53", where: "Nucleus", role: "A p53 target that inhibits cyclin–CDK complexes, notably CDK2.", evidence: "established", caveat: "Induction takes time (transcription); the delay is not modelled." },
    { id: "cdc25", label: "Cdc25 phosphatases active", module: "ddr", kind: "derived", expr: not(any("chk1", "chk2")), where: "Nucleus", role: "CHK1/CHK2 phosphorylate Cdc25, inactivating or destabilising it, so CDKs stay phosphorylated and inactive.", evidence: "established", caveat: "Cdc25A acts on CDK2 and Cdc25B/C on CDK1; one node stands for the family." },
    // ---- G2/M
    { id: "replicationComplete", label: "DNA replication complete", module: "g2m", kind: "input", default: true, where: "Chromatin", role: "All origins have fired and forks have merged.", evidence: "established" },
    { id: "cycB", label: "Cyclin B accumulated", module: "g2m", kind: "input", default: true, where: "Cytoplasm", role: "Cyclin B builds up through G2.", evidence: "established" },
    { id: "wee1", label: "Wee1 active", module: "g2m", kind: "input", default: true, where: "Nucleus", role: "Adds inhibitory phosphates (Thr14/Tyr15) to CDK1.", evidence: "established" },
    { id: "cdk1Inhib", label: "CDK1 inhibited by phosphorylation", module: "g2m", kind: "derived", expr: all("wee1", not("cdc25")), where: "Nucleus", role: "Inhibitory phosphates remain when Wee1 acts and Cdc25 does not remove them.", evidence: "simplified", caveat: "Myt1 also adds inhibitory phosphates, and CDK1 feeds back on Wee1 and Cdc25. Not drawn." },
    { id: "cdk1Active", label: "Cyclin B–CDK1 active", module: "g2m", kind: "derived", expr: all("cycB", not("cdk1Inhib"), not("p21")), where: "Cytoplasm → nucleus", role: "The mitotic kinase that triggers nuclear-envelope breakdown and chromosome condensation.", evidence: "simplified", caveat: "Also needs activating phosphorylation by CAK (see CDK regulation)." },
    { id: "g2mPass", label: "Entry into mitosis permitted", module: "g2m", kind: "derived", expr: "cdk1Active", where: "Whole cell", role: "Cyclin B–CDK1 is active.", evidence: "simplified" },
    // ---- spindle assembly checkpoint
    { id: "allAttached", label: "All kinetochores attached (bipolar, under tension)", module: "sac", kind: "input", default: true, where: "Kinetochores", role: "Every chromosome is correctly attached to spindle microtubules from opposite poles.", evidence: "simplified", caveat: "Attachment and tension are sensed by distinct mechanisms in real cells; one yes/no input is a simplification." },
    { id: "unattached", label: "Unattached or improperly attached kinetochore", module: "sac", kind: "derived", expr: not("allAttached"), where: "Kinetochores", role: "At least one kinetochore lacks a correct attachment.", evidence: "simplified" },
    { id: "sacOk", label: "Checkpoint proteins functional (MAD/BUB)", module: "sac", kind: "input", default: true, where: "Kinetochores", role: "Mad1–Mad2, BubR1/Bub1, Bub3 and the kinase Mps1.", evidence: "established" },
    { id: "sacSignal", label: "Checkpoint signal ON", module: "sac", kind: "derived", expr: all("unattached", "sacOk"), where: "Kinetochores", role: "An unattached kinetochore catalyses assembly of the inhibitor.", evidence: "established" },
    { id: "mcc", label: "Mitotic checkpoint complex (Mad2–BubR1–Bub3–Cdc20)", module: "sac", kind: "derived", expr: "sacSignal", where: "Cytoplasm", role: "Sequesters Cdc20.", evidence: "established" },
    { id: "cdc20ok", label: "Cdc20 available", module: "sac", kind: "input", default: true, where: "Cytoplasm", role: "Co-activator of APC/C in mitosis.", evidence: "established" },
    { id: "apcCdc20", label: "APC/C–Cdc20 active", module: "sac", kind: "derived", expr: all("cdc20ok", "cdk1Active", not("mcc")), where: "Cytoplasm", role: "Ubiquitin ligase that targets securin and cyclin B for destruction. Needs mitotic CDK1 phosphorylation.", evidence: "established" },
    { id: "securinDown", label: "Securin degraded", module: "sac", kind: "derived", expr: "apcCdc20", where: "Cytoplasm", role: "Ubiquitinated by APC/C–Cdc20 and degraded.", evidence: "established" },
    { id: "separase", label: "Separase active", module: "sac", kind: "derived", expr: "securinDown", where: "Cytoplasm", role: "A protease held inactive by securin.", evidence: "established" },
    { id: "cohesinCleaved", label: "Cohesin (Scc1/RAD21) cleaved", module: "sac", kind: "derived", expr: "separase", where: "Chromosomes", role: "Separase cuts the cohesin ring that holds sister chromatids together.", evidence: "established" },
    { id: "anaphase", label: "Sister chromatids separate (anaphase)", module: "sac", kind: "derived", expr: "cohesinCleaved", where: "Spindle", role: "Sister chromatids are pulled apart.", evidence: "simplified", caveat: "Chromosome arms and centromeres are protected and released by different mechanisms in vertebrates; one cohesin node is shown." },
  ],
};
export const cycleNode = (id: string) => CYCLE_GRAPH.nodes.find((n) => n.id === id)!;

export const CYCLE_PERTURBATIONS: readonly Perturbation[] = [
  { id: "cdk46-inhibited", label: "CDK4/6 inhibited", target: "cdk46", force: false, kind: "loss", explanation: "Cyclin D–CDK4/6 cannot phosphorylate RB." },
  { id: "rb-loss", label: "RB loss of function", target: "rbBrake", force: false, kind: "loss", explanation: "E2F is no longer restrained by RB." },
  { id: "cyclin-d-constitutive", label: "Cyclin D constitutively available", target: "cycD", force: true, kind: "gain", explanation: "Cyclin D no longer depends on mitogenic signalling." },
  { id: "licensing-defective", label: "Origin licensing defective", target: "licensed", force: false, kind: "loss", explanation: "MCM2–7 is not loaded on origins, so S phase cannot be entered with licensed origins." },
  { id: "atm-defective", label: "ATM signalling defective", target: "atm", force: false, kind: "loss", explanation: "Double-strand breaks do not activate ATM–CHK2." },
  { id: "chk1-defective", label: "CHK1 signalling defective", target: "chk1", force: false, kind: "loss", explanation: "ATR does not activate CHK1 and incomplete replication is not sensed." },
  { id: "p53-loss", label: "p53 loss of function", target: "p53", force: false, kind: "loss", explanation: "p53 cannot be stabilised, so p21 is not induced." },
  { id: "cdc25-loss", label: "Cdc25 lost / inhibited", target: "cdc25", force: false, kind: "loss", explanation: "CDKs keep their inhibitory phosphates." },
  { id: "wee1-inhibited", label: "Wee1 inhibited", target: "wee1", force: false, kind: "loss", explanation: "CDK1 no longer receives inhibitory phosphates." },
  { id: "sac-defective", label: "Spindle checkpoint defective (MAD/BUB)", target: "sacOk", force: false, kind: "loss", explanation: "Unattached kinetochores no longer produce the checkpoint signal." },
  { id: "securin-stable", label: "Non-degradable securin", target: "securinDown", force: false, kind: "loss", explanation: "Securin cannot be destroyed, so separase stays inhibited." },
  { id: "cohesin-uncleavable", label: "Non-cleavable cohesin", target: "cohesinCleaved", force: false, kind: "loss", explanation: "Separase cannot cut the cohesin ring." },
];
export const MAX_CYCLE_PERTURBATIONS = 4;

export interface CycleInput {
  phase: PhaseId;
  mitogen: boolean; pastRestriction: boolean; dsb: boolean; replStress: boolean; replicationComplete: boolean; allAttached: boolean;
  perturbations: string[];
}
export const DEFAULT_CYCLE: CycleInput = { phase: "G1", mitogen: true, pastRestriction: false, dsb: false, replStress: false, replicationComplete: true, allAttached: true, perturbations: [] };

/** Contradictions between the cell's phase and the conditions set. Empty = consistent. */
export function cycleConsistency(i: CycleInput): string[] {
  const e: string[] = [];
  if (i.phase === "G0" && i.pastRestriction) e.push("A G0 cell has not passed the restriction point.");
  if ((i.phase === "S" || i.phase === "G2" || i.phase === "M") && !i.pastRestriction) e.push("A cell in S, G2 or M has already passed the restriction point.");
  if (i.replStress && i.phase !== "S" && i.phase !== "G2") e.push("Stalled replication forks exist only in S or G2 (replication in progress or unfinished).");
  if ((i.phase === "G0" || i.phase === "G1") && !i.replicationComplete) e.push("Before S phase there is no replication to complete: replication is treated as complete.");
  if (i.phase === "S" && i.replicationComplete) e.push("A cell in S phase has not yet completed replication.");
  if (!i.allAttached && i.phase !== "M") e.push("Kinetochores are attached to the spindle only in mitosis.");
  return e;
}
/** Moves to a phase and adjusts the dependent conditions so the result is consistent. */
export function withPhase(i: CycleInput, phase: PhaseId): CycleInput {
  const n: CycleInput = { ...i, phase };
  n.pastRestriction = phase === "S" || phase === "G2" || phase === "M" ? true : phase === "G0" ? false : i.pastRestriction;
  if (phase === "G0" || phase === "G1") n.replicationComplete = true;
  if (phase === "S") n.replicationComplete = false;
  if (phase === "M" && i.phase !== "M") n.replicationComplete = true;
  if (phase === "G2" && i.phase === "S") n.replicationComplete = true;
  if (phase !== "S" && phase !== "G2") n.replStress = false;
  if (phase !== "M") n.allAttached = true;
  return n;
}

export type TransitionId = "g0g1" | "g1s" | "s" | "g2m" | "m";
export interface CycleVerdict {
  id: TransitionId; label: string; from: PhaseId; gate: string; signal: string;
  status: "proceeds" | "pauses" | "unresolved";
  /** Components that decide the verdict (root causes in the regulatory graph). */
  causes: RootCause[];
  text: string;
}
const GATES: Array<{ id: TransitionId; label: string; from: PhaseId; gate: string; signalNodes: string[]; signal: string }> = [
  { id: "g0g1", label: "G0 → G1 (cell-cycle re-entry)", from: "G0", gate: "cycD", signalNodes: [], signal: "none" },
  { id: "g1s", label: "G1 → S (S-phase entry)", from: "G1", gate: "g1sPass", signalNodes: ["dsb", "replStress"], signal: "DNA damage" },
  { id: "s", label: "S → G2 (replication complete)", from: "S", gate: "replicationComplete", signalNodes: ["replStress"], signal: "stalled replication forks" },
  { id: "g2m", label: "G2 → M (mitotic entry)", from: "G2", gate: "g2mPass", signalNodes: ["dsb", "replStress", "unreplicated"], signal: "damage or unreplicated DNA" },
  { id: "m", label: "Metaphase → anaphase", from: "M", gate: "anaphase", signalNodes: ["unattached"], signal: "an unattached kinetochore" },
];
export interface CycleEval {
  values: Record<string, boolean>; forced: Record<string, boolean>; because: Record<string, Array<{ id: string; sign: 1 | -1; value: boolean }>>;
  verdicts: CycleVerdict[]; outcome: Outcome;
}
export function evaluateCycle(i: CycleInput): CycleEval {
  const ev = evaluateGraph(CYCLE_GRAPH, { mitogen: i.mitogen, pastRestriction: i.pastRestriction, dsb: i.dsb, replStress: i.replStress, replicationComplete: i.replicationComplete, allAttached: i.allAttached }, pertById(CYCLE_PERTURBATIONS, i.perturbations));
  const verdicts: CycleVerdict[] = GATES.map((g) => {
    const pass = ev.values[g.gate];
    const signalOn = g.signalNodes.some((n) => ev.values[n]);
    const status: CycleVerdict["status"] = !pass ? "pauses" : signalOn ? "unresolved" : "proceeds";
    const causes = rootCauses(CYCLE_GRAPH, ev, g.gate);
    const text = status === "proceeds" ? "Every condition modelled for this transition is met, so it proceeds."
      : status === "pauses" ? "A required condition is missing or an inhibitor is active, so the cell pauses here in this model."
        : `The transition is permitted in the model although ${g.signal} is present: the checkpoint arm that should stop it is defective. Whether the cell repairs, errs, arrests later or dies is not determined by the model.`;
    return { id: g.id, label: g.label, from: g.from, gate: g.gate, signal: g.signal, status, causes, text };
  });
  const definite: string[] = [], uncertain: string[] = [];
  const cur = verdicts.find((v) => v.from === i.phase)!;
  definite.push(`${cur.label}: ${cur.status}.`);
  if (ev.values.sacSignal) definite.push("The spindle checkpoint signal is ON: APC/C–Cdc20 is inhibited, securin is not degraded and anaphase cannot begin.");
  if (ev.values.p21) definite.push("p21 is induced and inhibits cyclin–CDK complexes in this model.");
  if (ev.values.chk1 || ev.values.chk2) definite.push("CHK1/CHK2 are active and keep Cdc25 inactive, so CDKs stay inhibited.");
  if (cur.status === "unresolved") uncertain.push("Progression despite a checkpoint signal: outcome for the cell (repair, mutation, senescence, apoptosis) is not determined.");
  if (i.dsb || i.replStress) uncertain.push("Whether damage is repaired (transient arrest), leads to senescence or to apoptosis depends on damage amount, cell type and p53 status. Only the modelled arrest/no-arrest logic is shown.");
  if (i.perturbations.includes("p53-loss")) uncertain.push("p53 loss does not by itself predict malignancy or any particular cell fate.");
  if (!i.allAttached) uncertain.push("Attachment and tension are sensed by more complex mechanisms than one yes/no condition; merotelic attachments, for example, can escape the checkpoint.");
  return { values: ev.values, forced: ev.forced, because: ev.because, verdicts, outcome: { definite, uncertain } };
}
export function validateCycle(raw: unknown): Checked<CycleInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Cell-cycle state must be an object." };
  const r = raw as Record<string, unknown>;
  if (typeof r.phase !== "string" || !(PHASE_IDS as readonly string[]).includes(r.phase)) return { ok: false, error: "Unknown phase." };
  for (const k of ["mitogen", "pastRestriction", "dsb", "replStress", "replicationComplete", "allAttached"]) if (typeof r[k] !== "boolean") return { ok: false, error: `${k} must be true or false.` };
  const p = validatePerturbations(r.perturbations, CYCLE_PERTURBATIONS, MAX_CYCLE_PERTURBATIONS);
  if (!p.ok) return p;
  const v: CycleInput = { phase: r.phase as PhaseId, mitogen: r.mitogen as boolean, pastRestriction: r.pastRestriction as boolean, dsb: r.dsb as boolean, replStress: r.replStress as boolean, replicationComplete: r.replicationComplete as boolean, allAttached: r.allAttached as boolean, perturbations: p.value };
  const errs = cycleConsistency(v);
  return errs.length ? { ok: false, error: errs[0] } : { ok: true, value: v };
}
export const canAddCyclePerturbation = (cur: readonly string[], id: string) => canAdd(CYCLE_PERTURBATIONS, cur, id, MAX_CYCLE_PERTURBATIONS);

// ================================================================ cyclin–CDK regulation ================================================================

export interface CdkComplex { id: "cdk46d" | "cdk2e" | "cdk2a" | "cdk1b"; name: string; phase: string; substrates: string; inhibitors: string; role: string }
export const CDK_COMPLEXES: readonly CdkComplex[] = [
  { id: "cdk46d", name: "Cyclin D–CDK4/6", phase: "G1", substrates: "RB family proteins", inhibitors: "INK4 proteins (for example p16) bind CDK4/6; p21 and p27 also associate", role: "Mitogen-dependent start of RB phosphorylation." },
  { id: "cdk2e", name: "Cyclin E–CDK2", phase: "Late G1 to S", substrates: "RB, replication-initiation factors", inhibitors: "p21 and p27 (CIP/KIP family)", role: "Completes RB inactivation and helps trigger origin firing." },
  { id: "cdk2a", name: "Cyclin A–CDK2 (and CDK1)", phase: "S and G2", substrates: "Replication factors, Cdc6/Cdt1 control, mitotic preparation", inhibitors: "p21 and p27", role: "Drives S phase and into G2; also contributes to blocking re-licensing." },
  { id: "cdk1b", name: "Cyclin B–CDK1", phase: "G2/M and M", substrates: "Lamins, condensin, spindle components, APC/C", inhibitors: "Inhibitory phosphorylation (Wee1/Myt1); p21 can also inhibit", role: "Triggers entry into mitosis." },
];
export const CDK_GRAPH: RegGraph = {
  id: "cdk",
  nodes: [
    { id: "cyclin", label: "Cyclin bound", module: "cdk", kind: "input", default: true, where: "Nucleus / cytoplasm", role: "The cyclin subunit must be present and bound; a CDK alone has no activity.", evidence: "established" },
    { id: "cak", label: "Activating phosphorylation by CAK", module: "cdk", kind: "input", default: true, where: "Nucleus", role: "CDK-activating kinase (CDK7–cyclin H) phosphorylates the T-loop (Thr160 in CDK2, Thr161 in CDK1).", evidence: "established" },
    { id: "inhibPhos", label: "Inhibitory phosphates (Thr14/Tyr15)", module: "cdk", kind: "input", default: false, where: "Nucleus / cytoplasm", role: "Added by Wee1/Myt1, removed by Cdc25 phosphatases.", evidence: "established" },
    { id: "cki", label: "CDK inhibitor bound (INK4 / CIP-KIP)", module: "cdk", kind: "input", default: false, where: "Nucleus", role: "p16, p21 and p27 and relatives block the complex.", evidence: "established" },
    { id: "active", label: "Complex active", module: "cdk", kind: "derived", expr: all("cyclin", "cak", not("inhibPhos"), not("cki")), where: "Nucleus / cytoplasm", role: "All four conditions must hold at once.", evidence: "established", caveat: "Subcellular location and cyclin degradation add further layers that are not drawn." },
  ],
};
export interface CdkInput { complex: CdkComplex["id"]; cyclin: boolean; cak: boolean; inhibPhos: boolean; cki: boolean }
export const DEFAULT_CDK: CdkInput = { complex: "cdk1b", cyclin: true, cak: true, inhibPhos: true, cki: false };
export const evaluateCdk = (i: CdkInput) => evaluateGraph(CDK_GRAPH, { cyclin: i.cyclin, cak: i.cak, inhibPhos: i.inhibPhos, cki: i.cki });
export function validateCdk(raw: unknown): Checked<CdkInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "CDK state must be an object." };
  const r = raw as Record<string, unknown>;
  if (typeof r.complex !== "string" || !CDK_COMPLEXES.some((c) => c.id === r.complex)) return { ok: false, error: "Unknown cyclin–CDK complex." };
  for (const k of ["cyclin", "cak", "inhibPhos", "cki"]) if (typeof r[k] !== "boolean") return { ok: false, error: `${k} must be true or false.` };
  return { ok: true, value: { complex: r.complex as CdkComplex["id"], cyclin: r.cyclin as boolean, cak: r.cak as boolean, inhibPhos: r.inhibPhos as boolean, cki: r.cki as boolean } };
}

// ================================================================ replication licensing ================================================================

export type LicensePhase = "mexit" | "g1" | "s" | "g2" | "m";
export const LICENSE_PHASES: readonly LicensePhase[] = ["mexit", "g1", "s", "g2", "m"];
export const LICENSE_PHASE_LABEL: Record<LicensePhase, string> = { mexit: "Mitotic exit (late M)", g1: "G1", s: "S", g2: "G2", m: "Mitosis (before anaphase)" };
/** Documented simplification: each phase fixes five conditions. */
const PHASE_INPUTS: Record<LicensePhase, { cdkS: boolean; cdkM: boolean; apcCdh1: boolean; forks: boolean; licensed: boolean }> = {
  mexit: { cdkS: false, cdkM: false, apcCdh1: true, forks: false, licensed: false },
  g1: { cdkS: false, cdkM: false, apcCdh1: true, forks: false, licensed: true },
  s: { cdkS: true, cdkM: false, apcCdh1: false, forks: true, licensed: true },
  g2: { cdkS: true, cdkM: false, apcCdh1: false, forks: false, licensed: false },
  m: { cdkS: false, cdkM: true, apcCdh1: false, forks: false, licensed: false },
};
export const LICENSE_GRAPH: RegGraph = {
  id: "licensing",
  nodes: [
    { id: "cdkS", label: "Cyclin E/A–CDK2 active", module: "licensing", kind: "input", where: "Nucleus", role: "S-phase CDK activity.", evidence: "established" },
    { id: "cdkM", label: "Cyclin B–CDK1 active", module: "licensing", kind: "input", where: "Nucleus", role: "Mitotic CDK activity.", evidence: "established" },
    { id: "apcCdh1", label: "APC/C–Cdh1 active", module: "licensing", kind: "input", where: "Nucleus", role: "Active from late mitosis through G1; degrades geminin and mitotic cyclins.", evidence: "established" },
    { id: "forks", label: "Replication forks present", module: "licensing", kind: "input", where: "Chromatin", role: "PCNA-bound forks target Cdt1 for destruction (CRL4–Cdt2).", evidence: "established" },
    { id: "licensedNow", label: "Origins already carry loaded MCM", module: "licensing", kind: "input", where: "Chromatin", role: "MCM2–7 double hexamers sit on origins.", evidence: "established" },
    { id: "ddk", label: "DDK (Cdc7–Dbf4) active", module: "licensing", kind: "input", default: true, where: "Nucleus", role: "Needed with CDK to convert MCM into the active helicase.", evidence: "established" },
    { id: "cdkHigh", label: "High CDK activity", module: "licensing", kind: "derived", expr: any("cdkS", "cdkM"), where: "Nucleus", role: "Either S-phase or mitotic CDK.", evidence: "established" },
    { id: "geminin", label: "Geminin present (binds and inhibits Cdt1)", module: "licensing", kind: "derived", expr: not("apcCdh1"), where: "Nucleus", role: "Accumulates when APC/C–Cdh1 is off.", evidence: "established" },
    { id: "cdt1Degraded", label: "Cdt1 degraded", module: "licensing", kind: "derived", expr: any("forks", "cdkHigh"), where: "Nucleus", role: "Destroyed at forks and by CDK-dependent ubiquitination.", evidence: "established" },
    { id: "cdt1Active", label: "Cdt1 present and free", module: "licensing", kind: "derived", expr: all(not("cdt1Degraded"), not("geminin")), where: "Nucleus", role: "Needed to load MCM.", evidence: "established" },
    { id: "cdc6Active", label: "Cdc6/ORC licensing-competent", module: "licensing", kind: "derived", expr: not("cdkHigh"), where: "Chromatin", role: "CDK phosphorylation removes or inactivates Cdc6 (and ORC subunits).", evidence: "simplified", caveat: "Details differ between yeast and metazoa." },
    { id: "licensingPermitted", label: "Licensing (MCM loading) permitted", module: "licensing", kind: "derived", expr: all("cdc6Active", "cdt1Active"), where: "Chromatin", role: "ORC recruits Cdc6 and Cdt1, which load MCM2–7.", evidence: "established" },
    { id: "firing", label: "Origin firing (CMG helicase activation) possible", module: "licensing", kind: "derived", expr: all("licensedNow", "cdkS", "ddk"), where: "Chromatin", role: "CDK and DDK activate licensed origins; replication starts.", evidence: "established" },
    { id: "relicensing", label: "Inappropriate re-licensing possible", module: "licensing", kind: "derived", expr: all("licensingPermitted", any("cdkS", "cdkM", "forks")), where: "Chromatin", role: "Licensing permitted at a time when S/G2/M conditions hold: the situation the brakes exist to prevent.", evidence: "simplified" },
  ],
};
export const LICENSE_PERTURBATIONS: readonly Perturbation[] = [
  { id: "geminin-loss", label: "Geminin lost", target: "geminin", force: false, kind: "loss", explanation: "Cdt1 is no longer inhibited by geminin." },
  { id: "cdt1-stable", label: "Cdt1 not degraded", target: "cdt1Degraded", force: false, kind: "loss", explanation: "Cdt1 is not destroyed at forks or by CDK." },
  { id: "cdc6-cdk-resistant", label: "CDK-resistant Cdc6/ORC", target: "cdc6Active", force: true, kind: "gain", explanation: "Cdc6/ORC stay licensing-competent despite high CDK." },
  { id: "ddk-inhibited", label: "DDK inhibited", target: "ddk", force: false, kind: "loss", explanation: "Origins cannot be fired even when licensed." },
];
export const BRAKES = ["geminin-loss", "cdt1-stable", "cdc6-cdk-resistant"] as const;
export interface LicenseInput { phase: LicensePhase; perturbations: string[] }
export const DEFAULT_LICENSE: LicenseInput = { phase: "g1", perturbations: [] };
export type OriginState = "unlicensed" | "being licensed" | "licensed" | "firing" | "re-licensed (hazard)" | "used";
export interface LicenseEval {
  values: Record<string, boolean>; forced: Record<string, boolean>; because: Record<string, Array<{ id: string; sign: 1 | -1; value: boolean }>>;
  origin: OriginState; brakesDisabled: number; outcome: Outcome;
}
export function evaluateLicense(i: LicenseInput): LicenseEval {
  const p = PHASE_INPUTS[i.phase];
  const ev = evaluateGraph(LICENSE_GRAPH, { cdkS: p.cdkS, cdkM: p.cdkM, apcCdh1: p.apcCdh1, forks: p.forks, licensedNow: p.licensed }, pertById(LICENSE_PERTURBATIONS, i.perturbations));
  const v = ev.values;
  const origin: OriginState = v.relicensing ? "re-licensed (hazard)" : v.firing ? "firing" : v.licensingPermitted ? (v.licensedNow ? "licensed" : "being licensed") : v.licensedNow ? "licensed" : i.phase === "g2" || i.phase === "m" || i.phase === "s" ? "used" : "unlicensed";
  const brakesDisabled = BRAKES.filter((b) => i.perturbations.includes(b)).length;
  const definite: string[] = [], uncertain: string[] = [];
  definite.push(v.licensingPermitted ? "Licensing (MCM loading) is permitted at this point." : "Licensing is blocked at this point.");
  definite.push(v.firing ? "Licensed origins can fire: CDK and DDK are present." : "Origins cannot fire at this point.");
  if (v.relicensing) definite.push("All brakes that prevent licensing during S/G2/M are off: in this model origins could be licensed again and replicated a second time.");
  if (brakesDisabled > 0 && !v.relicensing && (p.cdkS || p.cdkM || p.forks)) uncertain.push("The remaining brakes still block licensing in this model. In real cells, loss of a single brake (for example geminin depletion) can already cause some re-replication in some cell types; the redundancy here is qualitative.");
  uncertain.push("Consequences of re-replication (DNA damage, checkpoint activation, arrest or death) are not modelled.");
  return { values: v, forced: ev.forced, because: ev.because, origin, brakesDisabled, outcome: { definite, uncertain } };
}
export function validateLicense(raw: unknown): Checked<LicenseInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Licensing state must be an object." };
  const r = raw as Record<string, unknown>;
  if (typeof r.phase !== "string" || !(LICENSE_PHASES as readonly string[]).includes(r.phase)) return { ok: false, error: "Unknown licensing phase." };
  const p = validatePerturbations(r.perturbations, LICENSE_PERTURBATIONS, 4);
  if (!p.ok) return p;
  return { ok: true, value: { phase: r.phase as LicensePhase, perturbations: p.value } };
}

export const CELLCYCLE_ASSUMPTIONS = [
  "Qualitative regulatory graphs (active or inactive). No cyclin concentrations, CDK activities, rates or cell-cycle durations are produced.",
  "Each transition is evaluated from the conditions you set: proceeds, pauses, or unresolved (permitted although a checkpoint signal is present).",
  "Repair, senescence, apoptosis and mitotic errors are outside the model: when a transition proceeds despite a signal, the cell's fate is reported as not determined.",
  "p53 loss, RB loss or checkpoint defects do not by themselves predict cancer or any single fate. Cell types differ in growth-factor dependence and checkpoint strength.",
  "Origin licensing phases are fixed sets of conditions per phase (documented simplification). The three brakes on re-licensing are modelled as independently sufficient.",
  "Spindle checkpoint: one yes/no for attachment and tension, whereas real cells use separate attachment and tension sensing.",
];
