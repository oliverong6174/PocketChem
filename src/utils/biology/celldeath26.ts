/**
 * Stage 26 / Tool 3: Apoptosis, autophagy and cell fate.
 *
 * APOPTOSIS_GRAPH covers the intrinsic (mitochondrial) pathway, the extrinsic (death-receptor, Fas) pathway, their BID link and the executioner caspases.
 * AUTOPHAGY_GRAPH is a SEPARATE pathway (macroautophagy): autophagy is not apoptosis, and more of it does not by itself cause cell death.
 * The fate map connects selected stressors to the modelled mechanisms and labels every connection as established or context-dependent.
 * It is a teaching model of selected mechanisms. It does not predict survival probabilities, clinical outcomes, cancer susceptibility or treatment responses.
 */
import { all, any, canAdd, evaluateGraph, not, pertById, rootCauses, validatePerturbations, type Checked, type Outcome, type Perturbation, type RegGraph } from "./mechanism26";
import { CYCLE_GRAPH, CYCLE_PERTURBATIONS } from "./cellcycle26";

// ================================================================ apoptosis ================================================================

export const APOPTOSIS_GRAPH: RegGraph = {
  id: "apoptosis",
  nodes: [
    // ---- stimuli and intrinsic pathway
    { id: "dnaDamage", label: "Severe DNA damage", module: "intrinsic", kind: "input", default: false, where: "Nucleus", role: "Damage that is not repaired in time.", evidence: "established", caveat: "DNA damage does not always lead to apoptosis; it can cause repair and arrest (see the cell-cycle tool)." },
    { id: "gfWithdrawal", label: "Growth-factor withdrawal", module: "intrinsic", kind: "input", default: false, where: "Cell surface", role: "Loss of survival signalling.", evidence: "established" },
    { id: "erStress", label: "Severe, unresolved ER stress", module: "intrinsic", kind: "input", default: false, where: "ER", role: "Persistent unfolded-protein stress.", evidence: "context-dependent", caveat: "ER stress first triggers adaptive responses; apoptosis follows only if the stress is severe or prolonged." },
    { id: "mitoStress", label: "Mitochondrial stress or damage", module: "intrinsic", kind: "input", default: false, where: "Mitochondria", role: "For example calcium or oxidative overload.", evidence: "context-dependent", caveat: "Mitochondrial stress may instead cause mitophagy or recovery." },
    { id: "p53ok", label: "p53 functional", module: "intrinsic", kind: "input", default: true, where: "Nucleus", role: "Transcription factor that induces PUMA and NOXA after damage.", evidence: "established" },
    { id: "pumaNoxa", label: "PUMA / NOXA induced", module: "intrinsic", kind: "derived", expr: all("dnaDamage", "p53ok"), where: "Cytosol → mitochondria", role: "BH3-only proteins made by p53 in response to DNA damage.", evidence: "established", caveat: "Damage can also engage BH3-only proteins independently of p53 in some cells." },
    { id: "bim", label: "BIM and other BH3-only proteins engaged", module: "intrinsic", kind: "derived", expr: any("gfWithdrawal", "erStress"), where: "Cytosol → mitochondria", role: "Released or induced by loss of survival signalling or by severe ER stress.", evidence: "context-dependent" },
    { id: "tbid", label: "tBID (truncated BID)", module: "intrinsic", kind: "derived", expr: "casp8", where: "Cytosol → mitochondria", role: "Caspase-8 cleaves BID to tBID, a BH3-only protein that links the extrinsic pathway to mitochondria.", evidence: "established" },
    { id: "bh3Signal", label: "BH3-only signal present", module: "intrinsic", kind: "derived", expr: any("pumaNoxa", "bim", "mitoStress", "tbid"), where: "Mitochondrial outer membrane", role: "At least one BH3-only protein is engaged.", evidence: "simplified" },
    { id: "prosurvivalExcess", label: "Pro-survival BCL-2 proteins in excess", module: "intrinsic", kind: "input", default: false, where: "Mitochondrial outer membrane", role: "BCL-2, BCL-xL, MCL-1 hold BAX/BAK and BH3-only proteins in check; in excess they neutralise the signal.", evidence: "established", caveat: "The balance is a matter of relative amounts; this model treats excess as sufficient to neutralise." },
    { id: "bh3Effective", label: "BH3 signal not neutralised", module: "intrinsic", kind: "derived", expr: all("bh3Signal", not("prosurvivalExcess")), where: "Mitochondrial outer membrane", role: "BH3-only proteins overcome pro-survival BCL-2 proteins (by binding them or by activating BAX/BAK directly).", evidence: "simplified", caveat: "Direct-activation and displacement models of how BH3-only proteins act both have support." },
    { id: "baxOk", label: "BAX present", module: "intrinsic", kind: "input", default: true, where: "Cytosol / outer membrane", role: "Pore-forming BCL-2 family effector.", evidence: "established" },
    { id: "bakOk", label: "BAK present", module: "intrinsic", kind: "input", default: true, where: "Outer membrane", role: "Pore-forming BCL-2 family effector.", evidence: "established" },
    { id: "baxBak", label: "BAX/BAK activated and oligomerised", module: "intrinsic", kind: "derived", expr: all("bh3Effective", any("baxOk", "bakOk")), where: "Mitochondrial outer membrane", role: "Either BAX or BAK is sufficient; losing both blocks the pathway.", evidence: "established" },
    { id: "momp", label: "Outer-membrane permeabilisation (MOMP)", module: "intrinsic", kind: "derived", expr: "baxBak", where: "Mitochondrial outer membrane", role: "BAX/BAK pores let intermembrane-space proteins escape. This is not the same as every change of mitochondrial membrane potential.", evidence: "established" },
    { id: "cytC", label: "Cytochrome c released", module: "intrinsic", kind: "derived", expr: "momp", where: "Intermembrane space → cytosol", role: "Released through the outer-membrane pores.", evidence: "established" },
    { id: "apaf1Ok", label: "APAF1 functional", module: "intrinsic", kind: "input", default: true, where: "Cytosol", role: "Adaptor protein of the apoptosome.", evidence: "established" },
    { id: "apoptosome", label: "Apoptosome assembled (APAF1 + cytochrome c)", module: "intrinsic", kind: "derived", expr: all("cytC", "apaf1Ok"), where: "Cytosol", role: "Cytochrome c and dATP/ATP drive APAF1 into a wheel-shaped platform.", evidence: "established" },
    { id: "casp9Ok", label: "Caspase-9 functional", module: "intrinsic", kind: "input", default: true, where: "Cytosol", role: "Initiator caspase of the intrinsic pathway.", evidence: "established" },
    { id: "casp9", label: "Caspase-9 active (initiator)", module: "intrinsic", kind: "derived", expr: all("apoptosome", "casp9Ok"), where: "Apoptosome", role: "Recruited to the apoptosome and activated by induced proximity.", evidence: "established" },
    // ---- extrinsic
    { id: "deathLigand", label: "Death ligand (FasL) present", module: "extrinsic", kind: "input", default: false, where: "Extracellular", role: "FasL binds the Fas (CD95) receptor.", evidence: "established" },
    { id: "receptorOk", label: "Fas receptor functional", module: "extrinsic", kind: "input", default: true, where: "Plasma membrane", role: "A death receptor with an intracellular death domain.", evidence: "established" },
    { id: "receptor", label: "Fas trimerised and activated", module: "extrinsic", kind: "derived", expr: all("deathLigand", "receptorOk"), where: "Plasma membrane", role: "Ligand binding clusters the receptor.", evidence: "established", caveat: "Other death receptors (TNFR1, TRAIL receptors) use different adaptors and can also signal survival; they do not all operate like Fas." },
    { id: "faddOk", label: "FADD adaptor functional", module: "extrinsic", kind: "input", default: true, where: "Cytosol", role: "Adaptor with a death domain and a death-effector domain.", evidence: "established" },
    { id: "fadd", label: "FADD recruited", module: "extrinsic", kind: "derived", expr: all("receptor", "faddOk"), where: "Plasma membrane", role: "Binds the activated receptor through death domains.", evidence: "established" },
    { id: "disc", label: "DISC (death-inducing signalling complex)", module: "extrinsic", kind: "derived", expr: "fadd", where: "Plasma membrane", role: "Receptor, FADD and procaspase-8 assembled through death-effector domains.", evidence: "established" },
    { id: "cflipHigh", label: "c-FLIP in excess", module: "extrinsic", kind: "input", default: false, where: "Cytosol", role: "A caspase-8-like protein without activity that competes for the DISC.", evidence: "established" },
    { id: "casp8Ok", label: "Caspase-8 functional", module: "extrinsic", kind: "input", default: true, where: "Cytosol", role: "Initiator caspase of the extrinsic pathway.", evidence: "established" },
    { id: "casp8", label: "Caspase-8 active (initiator)", module: "extrinsic", kind: "derived", expr: all("disc", not("cflipHigh"), "casp8Ok"), where: "DISC", role: "Activated by induced proximity at the DISC.", evidence: "established" },
    { id: "typeII", label: "Type II cell (needs mitochondrial amplification)", module: "extrinsic", kind: "input", default: false, where: "Cell type", role: "In type II cells little caspase-8 is activated at the DISC, so the mitochondrial route via tBID is needed; type I cells activate caspase-3 directly.", evidence: "established", caveat: "The type I/II distinction is a property of the cell type and the stimulus." },
    { id: "casp3Direct", label: "Direct caspase-3/7 activation by caspase-8 (type I)", module: "extrinsic", kind: "derived", expr: all("casp8", not("typeII")), where: "Cytosol", role: "Caspase-8 cleaves and activates executioner caspases.", evidence: "established" },
    // ---- execution
    { id: "casp37", label: "Executioner caspase-3/7 active", module: "caspase", kind: "derived", expr: any("casp3Direct", "casp9"), where: "Cytosol", role: "Activated by proteolytic cleavage by an initiator caspase.", evidence: "established", caveat: "Caspase activation is not always an irreversible commitment: sublethal activation is reported." },
    { id: "lamin", label: "Nuclear lamins cleaved: nuclear fragmentation", module: "caspase", kind: "derived", expr: "casp37", where: "Nucleus", role: "Lamin cleavage helps dismantle the nuclear envelope.", evidence: "established" },
    { id: "dnase", label: "ICAD cleaved: CAD DNase freed, DNA fragmented", module: "caspase", kind: "derived", expr: "casp37", where: "Nucleus", role: "Caspase-activated DNase cuts chromatin between nucleosomes.", evidence: "established" },
    { id: "bleb", label: "Cytoskeletal regulators cleaved: blebbing", module: "caspase", kind: "derived", expr: "casp37", where: "Cortex", role: "For example ROCK1 and gelsolin cleavage drive membrane blebbing and fragmentation.", evidence: "established" },
    { id: "ps", label: "Phosphatidylserine exposed", module: "caspase", kind: "derived", expr: "casp37", where: "Plasma membrane", role: "Caspase-dependent lipid scrambling signals neighbouring phagocytes.", evidence: "established" },
  ],
};
export const APOPTOSIS_MODULES = ["intrinsic", "extrinsic", "caspase"] as const;
export type ApoptosisModule = (typeof APOPTOSIS_MODULES)[number];
export const APOPTOSIS_MODULE_TITLE: Record<ApoptosisModule, string> = { intrinsic: "Intrinsic (mitochondrial) pathway", extrinsic: "Extrinsic (death-receptor) pathway", caspase: "Caspase cascade and consequences" };

export const APOPTOSIS_PERTURBATIONS: readonly Perturbation[] = [
  { id: "bcl2-overexpression", label: "Pro-survival BCL-2 proteins increased", target: "prosurvivalExcess", force: true, kind: "gain", explanation: "BH3 signals are neutralised." },
  { id: "bax-loss", label: "BAX lost", target: "baxOk", force: false, kind: "loss", explanation: "Only BAK remains to form pores." },
  { id: "bak-loss", label: "BAK lost", target: "bakOk", force: false, kind: "loss", explanation: "Only BAX remains to form pores." },
  { id: "p53-loss", label: "p53 loss of function", target: "p53ok", force: false, kind: "loss", explanation: "PUMA and NOXA are not induced by DNA damage." },
  { id: "apaf1-loss", label: "APAF1 impaired", target: "apaf1Ok", force: false, kind: "loss", explanation: "The apoptosome cannot assemble." },
  { id: "casp9-inhibited", label: "Caspase-9 inhibited", target: "casp9Ok", force: false, kind: "loss", explanation: "The intrinsic initiator caspase is inactive." },
  { id: "casp8-inhibited", label: "Caspase-8 inhibited", target: "casp8Ok", force: false, kind: "loss", explanation: "The extrinsic initiator caspase is inactive." },
  { id: "executioner-inhibited", label: "Executioner caspases inhibited", target: "casp37", force: false, kind: "loss", explanation: "Caspase-3/7 activity is blocked." },
  { id: "receptor-defective", label: "Death-receptor signalling defective", target: "receptorOk", force: false, kind: "loss", explanation: "Fas cannot be activated." },
  { id: "fadd-loss", label: "FADD lost", target: "faddOk", force: false, kind: "loss", explanation: "The DISC cannot assemble." },
  { id: "cflip-high", label: "c-FLIP in excess", target: "cflipHigh", force: true, kind: "gain", explanation: "Caspase-8 is not activated at the DISC." },
  { id: "bid-loss", label: "BID lost", target: "tbid", force: false, kind: "loss", explanation: "The extrinsic pathway cannot signal to mitochondria." },
];
export const MAX_DEATH_PERTURBATIONS = 4;
export interface ApoptosisInput {
  dnaDamage: boolean; gfWithdrawal: boolean; erStress: boolean; mitoStress: boolean; deathLigand: boolean; typeII: boolean;
  perturbations: string[];
  /** Number of steps of the selected pathway shown (0 = start). */
  step: number;
  /** Pathway shown in the stepped diagram. */
  path: "intrinsic" | "extrinsic";
}
export const DEFAULT_APOPTOSIS: ApoptosisInput = { dnaDamage: true, gfWithdrawal: false, erStress: false, mitoStress: false, deathLigand: false, typeII: false, perturbations: [], step: 0, path: "intrinsic" };

export interface PathStep { id: string; title: string; node: string }
export const PATH_STEPS: Record<"intrinsic" | "extrinsic", PathStep[]> = {
  intrinsic: [
    { id: "i1", title: "BH3-only protein signal", node: "bh3Signal" },
    { id: "i2", title: "Signal not neutralised by pro-survival BCL-2 proteins", node: "bh3Effective" },
    { id: "i3", title: "BAX/BAK activated", node: "baxBak" },
    { id: "i4", title: "Outer-membrane permeabilisation", node: "momp" },
    { id: "i5", title: "Cytochrome c released", node: "cytC" },
    { id: "i6", title: "Apoptosome assembled", node: "apoptosome" },
    { id: "i7", title: "Caspase-9 activated", node: "casp9" },
    { id: "i8", title: "Executioner caspase-3/7 activated", node: "casp37" },
  ],
  extrinsic: [
    { id: "e1", title: "Death ligand binds Fas", node: "receptor" },
    { id: "e2", title: "FADD recruited", node: "fadd" },
    { id: "e3", title: "DISC assembled", node: "disc" },
    { id: "e4", title: "Caspase-8 activated", node: "casp8" },
    { id: "e5", title: "Executioner caspase-3/7 activated", node: "casp37" },
  ],
};
export interface ApoptosisEval { values: Record<string, boolean>; forced: Record<string, boolean>; because: Record<string, Array<{ id: string; sign: 1 | -1; value: boolean }>>; outcome: Outcome; reasons: Record<string, string[]> }
export function evaluateApoptosis(i: ApoptosisInput): ApoptosisEval {
  const ev = evaluateGraph(APOPTOSIS_GRAPH, { dnaDamage: i.dnaDamage, gfWithdrawal: i.gfWithdrawal, erStress: i.erStress, mitoStress: i.mitoStress, deathLigand: i.deathLigand, typeII: i.typeII }, pertById(APOPTOSIS_PERTURBATIONS, i.perturbations));
  const v = ev.values;
  const stimulus = i.dnaDamage || i.gfWithdrawal || i.erStress || i.mitoStress || i.deathLigand;
  const definite: string[] = [], uncertain: string[] = [];
  if (!stimulus) definite.push("No death stimulus is present, so no apoptotic pathway is activated.");
  if (v.momp) definite.push("BAX/BAK pores form: cytochrome c is released (MOMP).");
  if (v.casp8) definite.push(`Caspase-8 is active at the DISC${v.tbid && i.typeII ? "; tBID carries the signal to mitochondria (type II)" : "; in a type I cell it can also activate caspase-3/7 directly"}.`);
  if (v.casp37) definite.push("Executioner caspases-3/7 are active: nuclear, DNA, cytoskeletal and membrane changes of apoptosis follow in the model.");
  else if (stimulus) definite.push("Executioner caspases-3/7 are not activated in this model.");
  if (stimulus && !v.casp37) uncertain.push("A cell with a blocked pathway may survive, die by another mechanism (for example necroptosis), or die more slowly. Cell fate beyond pathway activation or inhibition is not determined.");
  if (v.momp && !v.casp37) uncertain.push("MOMP without caspase activity can still lead to cell death in some contexts (caspase-independent death); the model does not predict it.");
  if (v.casp37) uncertain.push("Caspase activation is usually, but not always, irreversible; sublethal caspase activity is reported. Time course and commitment point are not modelled.");
  if (i.perturbations.includes("bax-loss") || i.perturbations.includes("bak-loss")) if (!(i.perturbations.includes("bax-loss") && i.perturbations.includes("bak-loss"))) definite.push("The remaining one of BAX/BAK is sufficient to permeabilise the outer membrane in this model.");
  const reasons: Record<string, string[]> = {};
  for (const n of APOPTOSIS_GRAPH.nodes) if (n.kind === "derived") reasons[n.id] = rootCauses(APOPTOSIS_GRAPH, ev, n.id).map((c) => `${APOPTOSIS_GRAPH.nodes.find((x) => x.id === c.id)!.label}: ${c.forced ? "set by a perturbation, " : ""}${c.value ? "on" : "off"}`);
  return { values: v, forced: ev.forced, because: ev.because, outcome: { definite, uncertain }, reasons };
}
export function validateApoptosis(raw: unknown): Checked<ApoptosisInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Apoptosis state must be an object." };
  const r = raw as Record<string, unknown>;
  for (const k of ["dnaDamage", "gfWithdrawal", "erStress", "mitoStress", "deathLigand", "typeII"]) if (typeof r[k] !== "boolean") return { ok: false, error: `${k} must be true or false.` };
  if (r.path !== "intrinsic" && r.path !== "extrinsic") return { ok: false, error: "Unknown pathway." };
  if (typeof r.step !== "number" || !Number.isInteger(r.step) || r.step < 0 || r.step > PATH_STEPS[r.path].length) return { ok: false, error: "Step out of range." };
  const p = validatePerturbations(r.perturbations, APOPTOSIS_PERTURBATIONS, MAX_DEATH_PERTURBATIONS);
  if (!p.ok) return p;
  return { ok: true, value: { dnaDamage: r.dnaDamage as boolean, gfWithdrawal: r.gfWithdrawal as boolean, erStress: r.erStress as boolean, mitoStress: r.mitoStress as boolean, deathLigand: r.deathLigand as boolean, typeII: r.typeII as boolean, perturbations: p.value, step: r.step, path: r.path } };
}
export const canAddDeathPerturbation = (cur: readonly string[], id: string) => canAdd(APOPTOSIS_PERTURBATIONS, cur, id, MAX_DEATH_PERTURBATIONS);

/** How far along a pathway the cell gets: the number of consecutive steps whose node is ON from the start. */
export function pathProgress(path: "intrinsic" | "extrinsic", values: Record<string, boolean>): number {
  let n = 0;
  for (const s of PATH_STEPS[path]) { if (!values[s.node]) break; n += 1; }
  return n;
}

export interface CaspaseInfo { id: string; name: string; kind: "initiator" | "executioner"; platform: string; activation: string; role: string }
export const CASPASES: readonly CaspaseInfo[] = [
  { id: "casp8", name: "Caspase-8", kind: "initiator", platform: "DISC (death-receptor complex)", activation: "Induced proximity of procaspase-8 on FADD, then autoprocessing", role: "Starts the extrinsic pathway; cleaves BID and (in type I cells) executioner caspases." },
  { id: "casp9", name: "Caspase-9", kind: "initiator", platform: "Apoptosome", activation: "Recruited to the APAF1 platform; activated by proximity and dimerisation", role: "Starts the intrinsic pathway; cleaves executioner caspases." },
  { id: "casp3", name: "Caspase-3", kind: "executioner", platform: "None (activated as a pre-formed dimer)", activation: "Cleavage between its large and small subunits by an initiator caspase", role: "Cleaves hundreds of substrates." },
  { id: "casp7", name: "Caspase-7", kind: "executioner", platform: "None (activated as a pre-formed dimer)", activation: "Cleavage by an initiator caspase", role: "Overlaps with caspase-3; substrate preferences differ." },
];

// ================================================================ autophagy ================================================================

export const AUTOPHAGY_GRAPH: RegGraph = {
  id: "autophagy",
  nodes: [
    { id: "nutrients", label: "Nutrients (amino acids, growth factors) available", module: "autophagy", kind: "input", default: true, where: "Cell", role: "Sustain mTORC1 activity.", evidence: "established" },
    { id: "energyStress", label: "Low energy (high AMP/ATP)", module: "autophagy", kind: "input", default: false, where: "Cell", role: "Activates AMPK.", evidence: "established" },
    { id: "ampk", label: "AMPK active", module: "autophagy", kind: "derived", expr: "energyStress", where: "Cytosol", role: "Inhibits mTORC1 and phosphorylates ULK1.", evidence: "established" },
    { id: "mtorc1", label: "mTORC1 active", module: "autophagy", kind: "derived", expr: all("nutrients", not("ampk")), where: "Lysosome surface", role: "Growth-promoting kinase that inhibits ULK1.", evidence: "simplified", caveat: "mTORC1 integrates many more inputs than drawn." },
    { id: "ulk1Ok", label: "ULK1 complex functional", module: "autophagy", kind: "input", default: true, where: "Cytosol", role: "ULK1/2 with ATG13, FIP200 and ATG101.", evidence: "established" },
    { id: "ulk1", label: "ULK1 complex active (initiation)", module: "autophagy", kind: "derived", expr: all(not("mtorc1"), "ulk1Ok"), where: "Cytosol → ER", role: "Initiates autophagy when mTORC1 is off.", evidence: "established" },
    { id: "vps34Ok", label: "Beclin 1–VPS34 complex functional", module: "autophagy", kind: "input", default: true, where: "ER", role: "Class III PI3-kinase complex.", evidence: "established" },
    { id: "vps34", label: "Beclin 1–VPS34 makes PI3P (nucleation)", module: "autophagy", kind: "derived", expr: all("ulk1", "vps34Ok"), where: "ER subdomain", role: "PI3P recruits effectors that nucleate the phagophore.", evidence: "established" },
    { id: "phagophore", label: "Phagophore (isolation membrane) formed", module: "autophagy", kind: "derived", expr: "vps34", where: "Near the ER", role: "A cup-shaped membrane begins to grow.", evidence: "established" },
    { id: "atgOk", label: "ATG5/ATG7/ATG16L1 conjugation system functional", module: "autophagy", kind: "input", default: true, where: "Cytosol", role: "Conjugation of LC3 to phosphatidylethanolamine.", evidence: "established" },
    { id: "lc3", label: "LC3-II on the membrane (expansion)", module: "autophagy", kind: "derived", expr: all("phagophore", "atgOk"), where: "Phagophore", role: "Lipidated LC3 supports membrane expansion and cargo recognition.", evidence: "established" },
    { id: "cargoAvailable", label: "Cargo available (for example protein aggregates, damaged organelles)", module: "autophagy", kind: "input", default: true, where: "Cytosol", role: "Material tagged for autophagy; receptors such as p62 link it to LC3.", evidence: "established", caveat: "Bulk (non-selective) and selective autophagy differ." },
    { id: "cargo", label: "Cargo sequestered", module: "autophagy", kind: "derived", expr: all("lc3", "cargoAvailable"), where: "Phagophore", role: "The membrane encloses cargo.", evidence: "established" },
    { id: "autophagosome", label: "Autophagosome (double-membrane vesicle) formed", module: "autophagy", kind: "derived", expr: "lc3", where: "Cytosol", role: "The phagophore closes.", evidence: "established" },
    { id: "fusionOk", label: "Fusion machinery functional (STX17, SNAREs, HOPS)", module: "autophagy", kind: "input", default: true, where: "Autophagosome / lysosome", role: "Allows autophagosome–lysosome fusion.", evidence: "established" },
    { id: "fusion", label: "Autophagosome–lysosome fusion (autolysosome)", module: "autophagy", kind: "derived", expr: all("autophagosome", "fusionOk"), where: "Cytosol", role: "The autophagosome fuses with a lysosome.", evidence: "established" },
    { id: "lysoAcid", label: "Lysosome acidified (V-ATPase)", module: "autophagy", kind: "input", default: true, where: "Lysosome", role: "Acidic pH is needed for hydrolase activity.", evidence: "established" },
    { id: "hydrolasesOk", label: "Lysosomal hydrolases present", module: "autophagy", kind: "input", default: true, where: "Lysosome", role: "Proteases, lipases and other acid hydrolases.", evidence: "established" },
    { id: "degradation", label: "Cargo degraded", module: "autophagy", kind: "derived", expr: all("fusion", "lysoAcid", "hydrolasesOk"), where: "Autolysosome", role: "Hydrolases break down the inner membrane and the cargo.", evidence: "established" },
    { id: "recycled", label: "Building blocks recycled", module: "autophagy", kind: "derived", expr: all("degradation", "cargoAvailable"), where: "Autolysosome → cytosol", role: "Amino acids, fatty acids and other products are exported for reuse.", evidence: "established" },
    { id: "accumulating", label: "Autophagosomes accumulate (flux blocked)", module: "autophagy", kind: "derived", expr: all("autophagosome", not("degradation")), where: "Cytosol", role: "Autophagosomes are made but not cleared.", evidence: "established" },
  ],
};
export const AUTOPHAGY_PERTURBATIONS: readonly Perturbation[] = [
  { id: "mtor-inhibited", label: "mTORC1 inhibited", target: "mtorc1", force: false, kind: "loss", explanation: "The brake on ULK1 is removed even with nutrients present." },
  { id: "ulk1-loss", label: "ULK1 complex impaired", target: "ulk1Ok", force: false, kind: "loss", explanation: "Initiation fails." },
  { id: "vps34-inhibited", label: "VPS34 / Beclin 1 complex inhibited", target: "vps34Ok", force: false, kind: "loss", explanation: "No PI3P is made for nucleation." },
  { id: "atg-conjugation-loss", label: "ATG5/ATG7 conjugation impaired", target: "atgOk", force: false, kind: "loss", explanation: "LC3 is not lipidated and the membrane cannot expand." },
  { id: "fusion-defective", label: "Autophagosome–lysosome fusion defective", target: "fusionOk", force: false, kind: "loss", explanation: "Autophagosomes cannot fuse with lysosomes." },
  { id: "v-atpase-inhibited", label: "Lysosomal V-ATPase inhibited", target: "lysoAcid", force: false, kind: "loss", explanation: "The lysosome is not acidified, so hydrolases do not work." },
];
export const MAX_AUTOPHAGY_PERTURBATIONS = 3;
export interface AutophagyInput { nutrients: boolean; energyStress: boolean; cargoAvailable: boolean; perturbations: string[]; step: number }
export const AUTOPHAGY_STEPS: PathStep[] = [
  { id: "a1", title: "Initiation (mTORC1 off, ULK1 complex active)", node: "ulk1" },
  { id: "a2", title: "Nucleation (Beclin 1–VPS34, PI3P)", node: "vps34" },
  { id: "a3", title: "Phagophore formation and LC3 lipidation", node: "lc3" },
  { id: "a4", title: "Cargo sequestration", node: "cargo" },
  { id: "a5", title: "Autophagosome formed", node: "autophagosome" },
  { id: "a6", title: "Fusion with the lysosome", node: "fusion" },
  { id: "a7", title: "Cargo degradation", node: "degradation" },
  { id: "a8", title: "Recycling of constituents", node: "recycled" },
];
export const DEFAULT_AUTOPHAGY: AutophagyInput = { nutrients: false, energyStress: false, cargoAvailable: true, perturbations: [], step: 0 };
export interface AutophagyEval { values: Record<string, boolean>; forced: Record<string, boolean>; because: Record<string, Array<{ id: string; sign: 1 | -1; value: boolean }>>; outcome: Outcome; progress: number }
export function evaluateAutophagy(i: AutophagyInput): AutophagyEval {
  const ev = evaluateGraph(AUTOPHAGY_GRAPH, { nutrients: i.nutrients, energyStress: i.energyStress, cargoAvailable: i.cargoAvailable }, pertById(AUTOPHAGY_PERTURBATIONS, i.perturbations));
  const v = ev.values;
  let progress = 0;
  for (const s of AUTOPHAGY_STEPS) { if (!v[s.node]) break; progress += 1; }
  const definite: string[] = [], uncertain: string[] = [];
  if (!v.ulk1) definite.push(v.mtorc1 ? "mTORC1 is active and keeps ULK1 off: autophagy is not initiated." : "Autophagy is not initiated.");
  if (v.autophagosome && !v.degradation) definite.push("Autophagosomes are made but not cleared: flux is blocked after formation.");
  if (v.recycled) definite.push("Cargo is degraded and its building blocks are recycled.");
  definite.push("Autophagy is a separate pathway from apoptosis. Nothing in this pathway activates caspases.");
  uncertain.push("Whether increased or blocked autophagy helps the cell survive or contributes to its death depends on cell type, stress and duration. It is not predicted.");
  return { values: v, forced: ev.forced, because: ev.because, outcome: { definite, uncertain }, progress };
}
export function validateAutophagy(raw: unknown): Checked<AutophagyInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Autophagy state must be an object." };
  const r = raw as Record<string, unknown>;
  for (const k of ["nutrients", "energyStress", "cargoAvailable"]) if (typeof r[k] !== "boolean") return { ok: false, error: `${k} must be true or false.` };
  if (typeof r.step !== "number" || !Number.isInteger(r.step) || r.step < 0 || r.step > AUTOPHAGY_STEPS.length) return { ok: false, error: "Step out of range." };
  const p = validatePerturbations(r.perturbations, AUTOPHAGY_PERTURBATIONS, MAX_AUTOPHAGY_PERTURBATIONS);
  if (!p.ok) return p;
  return { ok: true, value: { nutrients: r.nutrients as boolean, energyStress: r.energyStress as boolean, cargoAvailable: r.cargoAvailable as boolean, perturbations: p.value, step: r.step } };
}
export const canAddAutophagyPerturbation = (cur: readonly string[], id: string) => canAdd(AUTOPHAGY_PERTURBATIONS, cur, id, MAX_AUTOPHAGY_PERTURBATIONS);

// ================================================================ cell-fate map ================================================================

export type FateNodeId = "dna-damage" | "checkpoint" | "arrest" | "er-stress" | "nutrient-deprivation" | "mito-stress" | "lysosomal-dysfunction" | "death-ligand" | "bcl2" | "intrinsic" | "extrinsic" | "caspases" | "autophagy" | "recycling";
export interface FateNode { id: FateNodeId; label: string; kind: "stressor" | "mechanism" | "outcome"; modelled: boolean }
export const FATE_NODES: readonly FateNode[] = [
  { id: "dna-damage", label: "DNA damage", kind: "stressor", modelled: true },
  { id: "er-stress", label: "ER stress", kind: "stressor", modelled: true },
  { id: "nutrient-deprivation", label: "Nutrient deprivation", kind: "stressor", modelled: true },
  { id: "mito-stress", label: "Mitochondrial stress", kind: "stressor", modelled: true },
  { id: "death-ligand", label: "Death-receptor activation", kind: "stressor", modelled: true },
  { id: "lysosomal-dysfunction", label: "Lysosomal dysfunction", kind: "stressor", modelled: true },
  { id: "checkpoint", label: "DNA-damage checkpoint (ATM/ATR, CHK, p53)", kind: "mechanism", modelled: true },
  { id: "arrest", label: "Cell-cycle arrest", kind: "outcome", modelled: true },
  { id: "bcl2", label: "BCL-2 family balance", kind: "mechanism", modelled: true },
  { id: "intrinsic", label: "Mitochondrial apoptosis", kind: "mechanism", modelled: true },
  { id: "extrinsic", label: "Extrinsic apoptosis", kind: "mechanism", modelled: true },
  { id: "caspases", label: "Executioner caspases", kind: "outcome", modelled: true },
  { id: "autophagy", label: "Autophagy", kind: "mechanism", modelled: true },
  { id: "recycling", label: "Lysosomal recycling", kind: "outcome", modelled: true },
];
export interface FateLink { id: string; from: FateNodeId; to: FateNodeId; kind: "activates" | "inhibits"; evidence: "established" | "context-dependent"; text: string }
export const FATE_LINKS: readonly FateLink[] = [
  { id: "dd-cp", from: "dna-damage", to: "checkpoint", kind: "activates", evidence: "established", text: "Damage sensors activate ATM/ATR, CHK1/CHK2 and p53." },
  { id: "cp-arrest", from: "checkpoint", to: "arrest", kind: "activates", evidence: "established", text: "p21 and Cdc25 inhibition keep CDKs inactive, delaying the cycle." },
  { id: "cp-int", from: "checkpoint", to: "intrinsic", kind: "activates", evidence: "established", text: "p53 induces PUMA and NOXA when damage is severe. Arrest and death are alternatives, not a sequence." },
  { id: "cp-auto", from: "checkpoint", to: "autophagy", kind: "activates", evidence: "context-dependent", text: "Nuclear p53 can induce some autophagy genes; cytoplasmic p53 has been reported to inhibit autophagy. The net effect depends on context." },
  { id: "er-int", from: "er-stress", to: "intrinsic", kind: "activates", evidence: "context-dependent", text: "Severe or unresolved ER stress can engage BIM/PUMA through the unfolded-protein response." },
  { id: "er-auto", from: "er-stress", to: "autophagy", kind: "activates", evidence: "context-dependent", text: "The unfolded-protein response can induce autophagy (including ER-phagy)." },
  { id: "nut-auto", from: "nutrient-deprivation", to: "autophagy", kind: "activates", evidence: "established", text: "Low nutrients switch off mTORC1 and release ULK1." },
  { id: "mito-int", from: "mito-stress", to: "intrinsic", kind: "activates", evidence: "context-dependent", text: "Severe mitochondrial damage can lead to MOMP." },
  { id: "mito-auto", from: "mito-stress", to: "autophagy", kind: "activates", evidence: "context-dependent", text: "Damaged mitochondria can be removed by selective autophagy (mitophagy, for example PINK1–Parkin); this is not drawn in detail." },
  { id: "dl-ext", from: "death-ligand", to: "extrinsic", kind: "activates", evidence: "established", text: "Fas trimerisation → FADD → DISC → caspase-8." },
  { id: "ext-int", from: "extrinsic", to: "intrinsic", kind: "activates", evidence: "established", text: "Caspase-8 cleaves BID; tBID engages BAX/BAK (needed in type II cells)." },
  { id: "ext-casp", from: "extrinsic", to: "caspases", kind: "activates", evidence: "established", text: "Caspase-8 can activate executioner caspases directly (type I cells)." },
  { id: "int-casp", from: "intrinsic", to: "caspases", kind: "activates", evidence: "established", text: "Cytochrome c → apoptosome → caspase-9 → caspase-3/7." },
  { id: "bcl-int", from: "bcl2", to: "intrinsic", kind: "inhibits", evidence: "established", text: "Pro-survival BCL-2 proteins restrain BAX/BAK and BH3-only proteins." },
  { id: "bcl-auto", from: "bcl2", to: "autophagy", kind: "inhibits", evidence: "context-dependent", text: "BCL-2 binding to Beclin 1 can restrain autophagy initiation." },
  { id: "casp-auto", from: "caspases", to: "autophagy", kind: "inhibits", evidence: "context-dependent", text: "Caspase cleavage of autophagy proteins such as Beclin 1 has been reported to dampen autophagy during apoptosis." },
  { id: "auto-rec", from: "autophagy", to: "recycling", kind: "activates", evidence: "established", text: "Autophagosomes fuse with lysosomes and cargo is degraded and recycled." },
  { id: "lyso-rec", from: "lysosomal-dysfunction", to: "recycling", kind: "inhibits", evidence: "established", text: "Without acidic, functional lysosomes autophagic cargo is not degraded." },
  { id: "lyso-int", from: "lysosomal-dysfunction", to: "intrinsic", kind: "activates", evidence: "context-dependent", text: "Lysosomal membrane permeabilisation can release cathepsins that promote cell death in some settings." },
];
export function validateFateMap(nodes: readonly FateNode[] = FATE_NODES, links: readonly FateLink[] = FATE_LINKS): string[] {
  const errs: string[] = [], ids = new Set(nodes.map((n) => n.id)), lids = new Set<string>();
  for (const l of links) {
    if (!ids.has(l.from) || !ids.has(l.to)) errs.push(`link ${l.id} has an unknown endpoint`);
    if (lids.has(l.id)) errs.push(`duplicate link ${l.id}`);
    lids.add(l.id);
  }
  return errs;
}

export type ScenarioId = "dna-damage" | "nutrient-deprivation" | "er-stress" | "mito-stress" | "death-receptor" | "lysosomal-dysfunction";
export interface Scenario { id: ScenarioId; label: string; stressor: FateNodeId; summary: string }
export const SCENARIOS: readonly Scenario[] = [
  { id: "dna-damage", label: "DNA damage", stressor: "dna-damage", summary: "Double-strand breaks in a G1 cell." },
  { id: "nutrient-deprivation", label: "Nutrient deprivation", stressor: "nutrient-deprivation", summary: "Amino acids and growth factors are withdrawn." },
  { id: "er-stress", label: "ER stress", stressor: "er-stress", summary: "Severe, unresolved unfolded-protein stress." },
  { id: "mito-stress", label: "Mitochondrial stress", stressor: "mito-stress", summary: "Mitochondrial damage or overload." },
  { id: "death-receptor", label: "Death-receptor activation", stressor: "death-ligand", summary: "FasL binds Fas on a type I cell." },
  { id: "lysosomal-dysfunction", label: "Lysosomal dysfunction", stressor: "lysosomal-dysfunction", summary: "Lysosomes are not acidified; starvation induces autophagy so the block is visible." },
];
export const FATE_PERTURBATIONS: readonly Perturbation[] = [
  ...APOPTOSIS_PERTURBATIONS.filter((p) => ["bcl2-overexpression", "bax-loss", "bak-loss", "p53-loss", "apaf1-loss", "casp9-inhibited", "executioner-inhibited", "receptor-defective", "cflip-high"].includes(p.id)),
  { id: "atm-defective", label: "ATM signalling defective", target: "atm", force: false, kind: "loss", explanation: "Double-strand breaks do not activate ATM–CHK2." },
  ...AUTOPHAGY_PERTURBATIONS.filter((p) => ["mtor-inhibited", "ulk1-loss", "atg-conjugation-loss", "fusion-defective"].includes(p.id)),
];
export const MAX_FATE_PERTURBATIONS = 4;
export interface FateInput { scenario: ScenarioId; perturbations: string[]; selected: FateNodeId | null }
export const DEFAULT_FATE: FateInput = { scenario: "dna-damage", perturbations: [], selected: null };
export type PathwayStatus = "engaged" | "not-engaged" | "blocked" | "possible";
export interface PathwayRow { id: FateNodeId; label: string; status: PathwayStatus; evidence: "established" | "context-dependent"; text: string }
export interface FateEval { rows: PathwayRow[]; established: string[]; uncertain: string[]; apoptosis: ApoptosisEval; autophagy: AutophagyEval }

const SCENARIO_CONTEXT: Record<ScenarioId, Partial<Record<FateNodeId, string>>> = {
  "dna-damage": { autophagy: "p53 can promote or restrain autophagy depending on context; the net effect is not determined." },
  "nutrient-deprivation": { intrinsic: "Prolonged deprivation can also engage apoptosis (for example through BIM), depending on the cell and duration; only autophagy is derived here." },
  "er-stress": { autophagy: "The unfolded-protein response can induce autophagy; the extent is context-dependent." },
  "mito-stress": { autophagy: "Damaged mitochondria can be removed by mitophagy; this is not simulated." },
  "death-receptor": {},
  "lysosomal-dysfunction": { intrinsic: "Lysosomal membrane permeabilisation can promote cell death in some settings; not simulated." },
};
const SCENARIO_UNCERTAIN: Record<ScenarioId, string[]> = {
  "dna-damage": ["Whether the cell repairs and resumes, arrests permanently (senescence), or undergoes apoptosis depends on damage level, cell type and p53 status and is not predicted."],
  "nutrient-deprivation": ["Whether autophagy helps the cell survive or contributes to its death depends on duration and context and is not predicted."],
  "er-stress": ["Adaptive versus pro-death outcomes of the unfolded-protein response depend on severity and duration and are not predicted."],
  "mito-stress": ["Whether mitochondrial damage leads to repair, mitophagy or apoptosis is not predicted."],
  "death-receptor": ["Whether a cell dies, survives, or switches to a different mechanism (for example necroptosis when caspase-8 is inhibited) is not predicted."],
  "lysosomal-dysfunction": ["Consequences for cell viability depend on the cause and extent of the lysosomal defect and are not predicted."],
};
export function scenarioInputs(s: ScenarioId): { apop: Omit<ApoptosisInput, "perturbations" | "step" | "path">; auto: Omit<AutophagyInput, "perturbations" | "step"> } {
  const a = { dnaDamage: false, gfWithdrawal: false, erStress: false, mitoStress: false, deathLigand: false, typeII: false };
  const u = { nutrients: true, energyStress: false, cargoAvailable: true };
  switch (s) {
    case "dna-damage": return { apop: { ...a, dnaDamage: true }, auto: u };
    case "nutrient-deprivation": return { apop: a, auto: { ...u, nutrients: false } };
    case "er-stress": return { apop: { ...a, erStress: true }, auto: u };
    case "mito-stress": return { apop: { ...a, mitoStress: true }, auto: u };
    case "death-receptor": return { apop: { ...a, deathLigand: true }, auto: u };
    case "lysosomal-dysfunction": return { apop: a, auto: { ...u, nutrients: false } };
  }
}
export function evaluateFate(i: FateInput): FateEval {
  const { apop, auto } = scenarioInputs(i.scenario);
  const apIds = i.perturbations.filter((p) => APOPTOSIS_PERTURBATIONS.some((q) => q.id === p));
  const auIds = i.perturbations.filter((p) => AUTOPHAGY_PERTURBATIONS.some((q) => q.id === p));
  const cyIds = i.perturbations.filter((p) => CYCLE_PERTURBATIONS.some((q) => q.id === p));
  // lysosomal dysfunction is a scenario-defined condition: lysosomes are not acidified, and starvation-independent autophagy initiation is shown by making cargo flux observable
  const autoPerts = i.scenario === "lysosomal-dysfunction" ? [...auIds, ...(auIds.includes("v-atpase-inhibited") ? [] : ["v-atpase-inhibited"])] : auIds;
  const apoptosis = evaluateApoptosis({ ...apop, perturbations: apIds, step: 0, path: "intrinsic" });
  const autophagy = evaluateAutophagy({ ...auto, perturbations: autoPerts, step: 0 });
  const cycle = evaluateGraph(CYCLE_GRAPH, { dsb: i.scenario === "dna-damage", mitogen: true }, pertById(CYCLE_PERTURBATIONS, cyIds));
  const av = apoptosis.values, uv = autophagy.values, cv = cycle.values;
  const ctx = SCENARIO_CONTEXT[i.scenario];
  const row = (id: FateNodeId, status: PathwayStatus, text: string, evidence: PathwayRow["evidence"] = "established"): PathwayRow => ({ id, label: FATE_NODES.find((n) => n.id === id)!.label, status, text, evidence });
  const dd = i.scenario === "dna-damage";
  const rows: PathwayRow[] = [];
  rows.push(dd ? (cv.atm || cv.atr ? row("checkpoint", "engaged", "ATM/ATR, CHK1/CHK2 and p53 are active.") : row("checkpoint", "blocked", "Damage is present but ATM/ATR signalling is defective in this model."))
    : row("checkpoint", "not-engaged", "No DNA damage in this scenario."));
  rows.push(dd ? (!cv.g1sPass ? row("arrest", "engaged", cv.p21 ? "G1/S is held: p21 inhibits CDK2 and Cdc25 is inhibited." : "G1/S is held through CHK2–Cdc25 even without p21.") : row("arrest", "blocked", "The G1/S transition is permitted in spite of damage: the arrest arm is defective. Outcome for the cell is not determined.")) : row("arrest", "not-engaged", "No checkpoint signal in this scenario."));
  const stim = apop.dnaDamage || apop.erStress || apop.mitoStress;
  rows.push(av.momp ? row("intrinsic", "engaged", "BAX/BAK permeabilise the outer membrane; cytochrome c is released; the apoptosome and caspase-9 follow.")
    : stim ? row("intrinsic", "blocked", "A BH3-only signal is present but the pathway does not reach MOMP/caspase-9 in this model.")
      : ctx.intrinsic ? row("intrinsic", "possible", ctx.intrinsic, "context-dependent") : row("intrinsic", "not-engaged", "No intrinsic stimulus modelled in this scenario."));
  rows.push(av.casp8 ? row("extrinsic", "engaged", "Fas → FADD → DISC → caspase-8 is active.")
    : apop.deathLigand ? row("extrinsic", "blocked", "Ligand is present but caspase-8 is not activated (receptor, adaptor, c-FLIP or caspase-8 status).") : row("extrinsic", "not-engaged", "No death ligand in this scenario."));
  rows.push(row("caspases", av.casp37 ? "engaged" : (stim || apop.deathLigand) ? "blocked" : "not-engaged", av.casp37 ? "Executioner caspases-3/7 are active." : (stim || apop.deathLigand) ? "Executioner caspases are not activated in this model; the cell is not determined to survive." : "No apoptotic stimulus."));
  rows.push(uv.autophagosome ? row("autophagy", "engaged", "ULK1 → Beclin 1–VPS34 → LC3 lipidation → autophagosome.")
    : ctx.autophagy ? row("autophagy", "possible", ctx.autophagy, "context-dependent") : row("autophagy", "not-engaged", uv.mtorc1 ? "mTORC1 is active and keeps ULK1 off." : "Autophagy is not initiated in this model."));
  rows.push(uv.recycled ? row("recycling", "engaged", "Autolysosomes degrade cargo and building blocks are recycled.")
    : uv.autophagosome ? row("recycling", "blocked", "Autophagosomes form but cargo is not degraded: fusion or lysosomal function is impaired.") : row("recycling", "not-engaged", "No autophagic cargo reaches the lysosome."));
  const established = rows.filter((r) => r.evidence === "established" && r.status !== "not-engaged").map((r) => `${r.label}: ${r.status === "engaged" ? "engaged" : r.status === "blocked" ? "blocked" : "possible"}. ${r.text}`);
  const uncertain = [...SCENARIO_UNCERTAIN[i.scenario], ...rows.filter((r) => r.status === "possible").map((r) => `${r.label}: ${r.text}`),
    "The map is a teaching model of selected mechanisms. It gives no survival probability, clinical outcome, cancer susceptibility or treatment response."];
  return { rows, established, uncertain, apoptosis, autophagy };
}
export function validateFate(raw: unknown): Checked<FateInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Fate-map state must be an object." };
  const r = raw as Record<string, unknown>;
  if (typeof r.scenario !== "string" || !SCENARIOS.some((s) => s.id === r.scenario)) return { ok: false, error: "Unknown scenario." };
  if (r.selected !== null && (typeof r.selected !== "string" || !FATE_NODES.some((n) => n.id === r.selected))) return { ok: false, error: "Unknown fate-map node." };
  const p = validatePerturbations(r.perturbations, FATE_PERTURBATIONS, MAX_FATE_PERTURBATIONS);
  if (!p.ok) return p;
  return { ok: true, value: { scenario: r.scenario as ScenarioId, perturbations: p.value, selected: r.selected as FateNodeId | null } };
}
export const canAddFatePerturbation = (cur: readonly string[], id: string) => canAdd(FATE_PERTURBATIONS, cur, id, MAX_FATE_PERTURBATIONS);

export const CELLDEATH_ASSUMPTIONS = [
  "Qualitative pathway graphs (active or inactive). No caspase kinetics, protein amounts, timing or survival probabilities are produced.",
  "Pathways are curated for selected mechanisms: Fas as the example death receptor, BAX/BAK-dependent MOMP, caspase-3/7 execution and macroautophagy. Other death receptors, necroptosis, pyroptosis, ferroptosis and non-canonical routes are not modelled.",
  "Pathway activation or inhibition does not by itself establish a cell's fate: a cell with a blocked pathway may survive, die differently or die later. Caspase activation is usually but not always irreversible.",
  "Regulated cell death (such as apoptosis) is distinct from accidental, injury-induced necrosis, which is not modelled.",
  "Autophagy is a separate recycling pathway. More autophagy does not necessarily cause cell death, and autophagy is not apoptosis.",
  "Scenarios are curated: each links a stressor to modelled mechanisms and labels the link established or context-dependent. No clinical or treatment-response claims are made.",
];
