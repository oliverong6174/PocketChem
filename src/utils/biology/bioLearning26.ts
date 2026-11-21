/**
 * Stage 26: Practice questions and Challenge predictions for the three Cell Organization and Regulation tools.
 * Every question is built from the same state and the same engine calls that draw the diagram and fill the explanatory panels, so the answer, the
 * explanation and what is shown cannot disagree. Challenges commit to a prediction first; `next` is the state applied afterwards.
 */
import type { Question } from "./bioLearning";
import type { Challenge } from "./bioLearning23";
import {
  CARGOS, ENDO_CARGOS, ORGANELLES, TRAFF_PERTURBATIONS, VESICLE_STAGES, VESICLE_STAGE_DISTINCTION, VESICLE_STAGE_TITLE, cargoById, compartmentOf, endoCargo, endoStage,
  evaluateQc, organelleById, traceCargo, traceEndocytosis, vesicleRoute, type CargoId, type TraffPertId,
} from "./trafficking26";
import {
  CDK_COMPLEXES, LICENSE_PHASES, LICENSE_PHASE_LABEL, MODULE_TITLE, PHASES, cycleNode, evaluateCdk, evaluateCycle, evaluateLicense, phaseInfo, withPhase, type CycleInput, type PhaseId,
} from "./cellcycle26";
import { AUTOPHAGY_STEPS, CASPASES, PATH_STEPS, SCENARIOS, evaluateApoptosis, evaluateAutophagy, evaluateFate, pathProgress, type PathStep } from "./celldeath26";
import type { CellCycleInputs, CellDeathInputs, OrganelleInputs } from "../persistence/biologyTools26";

/** Builds a question whose correct option sits at a position that varies with `rot` (deterministic). */
function mc(id: string, prompt: string, correct: string, wrong: string[], explanation: string, rot = 0): Question {
  const uniq = [correct, ...wrong.filter((w, i) => w !== correct && wrong.indexOf(w) === i)].slice(0, 4);
  const n = uniq.length;
  const r = ((rot % n) + n) % n;
  const options = uniq.map((_, k) => uniq[(k + n - r) % n]);
  return { id, prompt, options, answer: options.indexOf(correct), explanation };
}
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ================================================================ organelles and trafficking ================================================================

const ER_CARGOS = (): string => CARGOS.filter((c) => c.steps.some((s) => s.at === "er")).map((c) => lc(c.name)).join(", ").replace(/, ([^,]*)$/, " and $1");

export function organelleQuestions(i: OrganelleInputs): Question[] {
  const qs: Question[] = [];
  switch (i.section) {
    case "cell": {
      qs.push(mc("or-secretory", "Which proteins enter the secretory pathway?", `${cap(ER_CARGOS())}: those made with an ER signal sequence`, ["All proteins, including cytosolic ones", "Only secreted proteins", "Nuclear and mitochondrial proteins"], `Only cargo whose route in the transport graph passes through the ER does so: ${ER_CARGOS()}. Cytosolic, nuclear and mitochondrial proteins are made on free ribosomes and never enter the ER.`, 0));
      const o = organelleById(i.organelle ?? "golgi");
      const others = ORGANELLES.filter((x) => x.id !== o.id).flatMap((x) => x.functions);
      qs.push(mc(`or-fn-${o.id}`, `Which of these is a function of the ${lc(o.name)}?`, o.functions[0], others.slice(0, 3), `${o.name}: ${o.functions.join("; ")}.`, 1));
      qs.push(mc("or-double", "Which of these organelles is surrounded by a double membrane?", "The mitochondrion", ["The lysosome", "The Golgi apparatus", "The peroxisome"], "The nucleus (nuclear envelope) and the mitochondrion have two membranes; lysosomes, the Golgi and peroxisomes have one.", 2));
      break;
    }
    case "tracker": {
      const c = cargoById(i.cargo), t = traceCargo(i.cargo, i.perturbations);
      const s = t.steps[Math.min(i.step, t.steps.length - 1)];
      const names = ["cytosol", "er", "golgi-cis", "lysosome", "nucleus", "mito-matrix", "pm"].map((id) => compartmentOf(id as never).name);
      qs.push(mc(`or-where-${i.cargo}-${s.id}`, `${c.name}: after the step “${s.title}”, where is the cargo?`, compartmentOf(s.at).name, names.filter((n) => n !== compartmentOf(s.at).name), `${s.explanation} Location after this step: ${compartmentOf(s.at).name}.`, i.step));
      qs.push(mc("or-srp", "What is the role of SRP in the secretory pathway?", "It recognises the signal sequence on a nascent chain and delivers the ribosome to the Sec61 translocon in the ER membrane", ["It cleaves the signal peptide inside the ER", "It packages cargo into COPII vesicles", "It adds mannose 6-phosphate in the Golgi"], "SRP binds the emerging hydrophobic signal sequence, pauses translation and, with the SRP receptor, hands the ribosome to Sec61. Signal peptidase cleaves the signal; COPII and M6P tagging come later.", 1));
      qs.push(mc("or-m6p", "Why can lysosomal hydrolase sorting fail?", "If the mannose 6-phosphate tag is not added in the Golgi, TGN receptors cannot bind the enzyme and it follows the default route out of the cell", ["Because lysosomal enzymes are made on free ribosomes and never reach the Golgi", "Because the COPII coat selects lysosomal enzymes for secretion", "Because lysosomes have no V-ATPase"], traceCargo("lysosomal", ["m6p-blocked"]).summary + " Hydrolases do enter the ER and Golgi; the M6P tag is the sorting signal.", 2));
      if (c.membraneProtein) qs.push(mc("or-topology", `For this integral membrane protein, which face does its N-terminal domain show once the carrier has fused with the plasma membrane?`, "The outside of the cell: the face that was in the ER lumen", ["The cytosol", "The nucleus", "It changes at each fusion"], "Topology is set at insertion and does not flip: the lumenal domain faces the lumen of every carrier and, after fusion, the extracellular space.", 3));
      if (i.perturbations.length) {
        const p = TRAFF_PERTURBATIONS.find((x) => x.id === i.perturbations[0])!;
        qs.push(mc(`or-pert-${p.id}-${i.cargo}`, `With “${p.label}”, where does ${lc(c.name)} end up in this model?`, compartmentOf(t.final).name, [...new Set(["cytosol", "er", "lysosome", "nucleus", "extracellular"])].map((id) => compartmentOf(id as never).name).filter((n) => n !== compartmentOf(t.final).name), `${t.outcome.definite[0]} ${t.outcome.uncertain[0] ?? ""}`.trim(), 0));
      }
      break;
    }
    case "vesicles": {
      const r = vesicleRoute(i.vesicle.route), stage = i.vesicle.stage ?? "budding";
      qs.push(mc("or-copii-copi", "What distinguishes COPII from COPI transport?", "COPII carries cargo from the ER to the Golgi (anterograde); COPI mainly retrieves proteins from the Golgi back to the ER (retrograde)", ["COPII is used only for endocytosis and COPI only for exocytosis", "COPII uses clathrin and COPI uses SNAREs", "They carry the same cargo in the same direction"], `${vesicleRoute("copii").name}; ${vesicleRoute("copi").name}. ${vesicleRoute("copii").caveat}`, 0));
      qs.push(mc(`or-stage-${r.id}-${stage}`, `Which stage of vesicle transport is this? “${VESICLE_STAGE_DISTINCTION[stage].slice(0, 120)}…”`, VESICLE_STAGE_TITLE[stage], VESICLE_STAGES.filter((s) => s !== stage).map((s) => VESICLE_STAGE_TITLE[s]), `${VESICLE_STAGE_TITLE[stage]}: ${VESICLE_STAGE_DISTINCTION[stage]}`, 1));
      qs.push(mc("or-tether-fuse", "Which statement about tethering and fusion is correct?", "Tethering captures a vesicle near its target using Rab effectors; only SNARE-driven fusion merges the membranes", ["Tethering and fusion are the same event", "SNAREs tether vesicles from a distance and Rabs fuse them", "Fusion happens before docking"], `${VESICLE_STAGE_DISTINCTION.tethering} ${VESICLE_STAGE_DISTINCTION.fusion}`, 2));
      break;
    }
    case "endosomes": {
      const c = endoCargo(i.endo.cargo), t = traceEndocytosis(c.id, i.endo.perturbations);
      qs.push(mc("or-all-destroyed", "Is all internalised material destroyed in lysosomes?", "No: some cargo is recycled or transcytosed intact, for example transferrin and its receptor", ["Yes: every endocytic vesicle fuses with a lysosome", "Yes, but only receptors survive", "No: nothing is ever degraded"], `${endoCargo("transferrin").summary} ${endoCargo("iga").summary}`, 0));
      qs.push(mc(`or-endo-${c.id}`, `${c.name}: which route does the normal path follow?`, c.path.map((p) => endoStage(p).title).join(" → "), ENDO_CARGOS.filter((x) => x.id !== c.id).map((x) => x.path.map((p) => endoStage(p).title).join(" → ")), `${c.summary}`, 1));
      qs.push(mc("or-vatpase", "What do vacuolar H⁺-ATPases do in endosomes and lysosomes?", "Pump protons into the lumen, acidifying it so ligands dissociate and acid hydrolases work", ["Pump sodium out of the cell", "Add the mannose 6-phosphate tag", "Make ATP"], t.statements.join(" "), 2));
      break;
    }
    case "quality": {
      const v = evaluateQc(i.qc).values;
      qs.push(mc("or-qc-route", "What happens to a misfolded soluble ER protein in this model?", v.proteasomeDeg ? "It is retained, retrotranslocated by ERAD, polyubiquitinated and degraded by the proteasome" : v.lysoDeg ? "It is degraded in lysosomes through an autophagy/ER-phagy route" : v.exported ? "It folds and is exported from the ER" : "It is retained and accumulates", ["It is exported to the Golgi anyway", "It is secreted", "It is imported into mitochondria"].slice(v.exported ? 0 : 0), "The route is derived from the quality-control graph with the current settings.", 0));
      qs.push(mc("or-proteasome-lysosome", "What distinguishes proteasomal from lysosomal degradation?", "The proteasome degrades individual polyubiquitinated, unfolded polypeptides; lysosomes degrade bulk cargo, aggregates, membranes and endocytosed material in an acidic compartment", ["They are the same machinery in different places", "Lysosomes degrade only soluble cytosolic proteins", "The proteasome acts only on extracellular proteins"], "ERAD substrates reach the proteasome after retrotranslocation; aggregates or substrates that cannot be retrotranslocated can be delivered to lysosomes.", 1));
      break;
    }
  }
  return qs;
}

type OrganelleProbe = { cargo: CargoId; perts: TraffPertId[] };
const ORGANELLE_PROBES: OrganelleProbe[] = [
  { cargo: "secreted", perts: ["srp-disabled"] }, { cargo: "secreted", perts: ["er-export-impaired"] }, { cargo: "lysosomal", perts: ["m6p-blocked"] }, { cargo: "membrane", perts: ["er-export-impaired"] },
  { cargo: "nuclear", perts: ["nuclear-targeting-defective"] }, { cargo: "nuclear", perts: ["ran-gradient-lost"] }, { cargo: "mitochondrial", perts: ["mito-potential-lost"] }, { cargo: "mitochondrial", perts: ["mts-defective"] },
  { cargo: "cytosolic", perts: ["srp-disabled"] }, { cargo: "nuclear", perts: ["srp-disabled"] },
];
export function organelleChallenge(i: OrganelleInputs, idx: number): Challenge<OrganelleInputs> | null {
  const p = ORGANELLE_PROBES[idx % ORGANELLE_PROBES.length];
  const t = traceCargo(p.cargo, p.perts);
  const c = cargoById(p.cargo);
  const pert = TRAFF_PERTURBATIONS.find((x) => x.id === p.perts[0])!;
  const correct = t.status === "destination" ? `${compartmentOf(t.final).name} (unaffected: no step of this route depends on it)` : compartmentOf(t.final).name;
  const distract = ["cytosol", "er", "golgi-trans", "nucleus", "lysosome", "extracellular", "mito-matrix"].map((id) => compartmentOf(id as never).name).filter((n) => !correct.startsWith(n));
  return {
    id: `or-${idx}`, label: `${c.name} with ${pert.label}`,
    question: mc(`or-ch-${p.cargo}-${p.perts.join("-")}`, `Predict: ${c.name} (${c.example}) when “${pert.label}”. Where is it in this model?`, correct, distract, `${t.outcome.definite.join(" ")} ${t.outcome.uncertain[0] ?? ""}`.trim(), idx),
    next: { ...i, section: "tracker", cargo: p.cargo, perturbations: p.perts, step: t.steps.length - 1, mode: i.mode },
  };
}

// ================================================================ cell cycle ================================================================

const STATUS_TEXT = { proceeds: "Proceeds: every modelled condition is met", pauses: "Pauses: a required condition is missing or an inhibitor is active", unresolved: "Permitted although a checkpoint signal is present (checkpoint arm defective); fate not determined" } as const;
const labelOf = (id: string) => cycleNode(id).label;

export function cellCycleQuestions(i: CellCycleInputs): Question[] {
  const qs: Question[] = [];
  const ev = evaluateCycle(i.cycle);
  const cur = ev.verdicts.find((v) => v.from === i.cycle.phase)!;
  switch (i.section) {
    case "overview": {
      const ph = phaseInfo(i.cycle.phase);
      qs.push(mc(`cc-phase-${ph.id}`, `Which process does ${ph.name} mainly serve?`, cap(ph.process), PHASES.filter((p) => p.process !== ph.process).map((p) => cap(p.process)), `${ph.summary}`, PHASES.findIndex((p) => p.id === ph.id)));
      qs.push(mc("cc-repl", "In which phase is the genome replicated?", "S phase", ["G1", "G2", "Mitosis"], phaseInfo("S").summary, 1));
      qs.push(mc("cc-verdict", `With the conditions set, what does the model say about “${cur.label}”?`, STATUS_TEXT[cur.status], Object.values(STATUS_TEXT).filter((t) => t !== STATUS_TEXT[cur.status]), `${cur.text} Decided by: ${cur.causes.map((c) => `${labelOf(c.id)} ${c.value ? "ON" : "off"}`).join("; ")}.`, 2));
      break;
    }
    case "cdk": {
      const c = CDK_COMPLEXES.find((x) => x.id === i.cdk.complex)!, a = evaluateCdk(i.cdk);
      qs.push(mc(`cc-cdk-${c.id}`, `With the four conditions as set, is ${c.name} active?`, a.values.active ? "Active: cyclin bound, activating phosphorylation, no inhibitory phosphates, no CKI" : "Inactive: at least one of the four conditions is not met", [a.values.active ? "Inactive: at least one of the four conditions is not met" : "Active: cyclin bound, activating phosphorylation, no inhibitory phosphates, no CKI", "Active whenever the cyclin is present", "Cannot be determined"], "A cyclin–CDK is active only if it has its cyclin, CAK activating phosphorylation, no Thr14/Tyr15 inhibitory phosphates and no CDK inhibitor. Cyclin concentration alone does not decide.", 0));
      qs.push(mc("cc-cki", `Which inhibitors restrain ${c.name}?`, c.inhibitors, CDK_COMPLEXES.filter((x) => x.id !== c.id).map((x) => x.inhibitors), `${c.name}: ${c.role}`, 1));
      break;
    }
    case "g1s": {
      qs.push(mc("cc-rb", "What does cyclin D–CDK4/6 do to RB, and why does it matter?", "It phosphorylates RB, which releases E2F so S-phase genes (including cyclin E) are expressed", ["It degrades E2F directly", "It phosphorylates p21", "It loads MCM onto origins"], "Hypophosphorylated RB binds E2F; phosphorylation by cyclin D–CDK4/6 (then cyclin E–CDK2) frees it.", 0));
      qs.push(mc("cc-g1s-now", "With the conditions shown, what does the model say about the G1/S transition?", STATUS_TEXT[ev.verdicts.find((v) => v.id === "g1s")!.status], Object.values(STATUS_TEXT).filter((t) => t !== STATUS_TEXT[ev.verdicts.find((v) => v.id === "g1s")!.status]), ev.verdicts.find((v) => v.id === "g1s")!.text, 1));
      break;
    }
    case "licensing": {
      const when = LICENSE_PHASES.filter((p) => evaluateLicense({ phase: p, perturbations: [] }).values.licensingPermitted).map((p) => LICENSE_PHASE_LABEL[p]);
      qs.push(mc("cc-license-when", "When can replication origins be licensed (MCM2–7 loaded)?", `${when.join(" and ")}, when CDK activity is low`, ["Throughout S phase, as each origin fires", "Only in G2", "Only during mitosis"], "Licensing needs low CDK activity, active Cdt1 (not degraded, not bound by geminin) and Cdc6. Those conditions hold from mitotic exit through G1 and are lost once S phase begins.", 0));
      qs.push(mc("cc-license-once", "Why is DNA ordinarily replicated once per cell cycle?", "Origins can be licensed only before S phase and each fires at most once; the same CDK activity that fires origins blocks new licensing", ["Because each origin can fire repeatedly in S phase", "Because DNA polymerase can copy a region only once", "Because MCM is not needed for replication"], "Licensing and firing are separated in time by CDK activity; three brakes (geminin, Cdt1 destruction, Cdc6/ORC phosphorylation) prevent re-licensing.", 1));
      qs.push(mc("cc-license-vs", "How does origin licensing differ from replication itself?", "Licensing loads inactive MCM helicases in G1; replication starts only when CDK and DDK fire licensed origins in S phase", ["They are the same event", "Licensing copies the DNA", "Firing happens in G1"], "Loading MCM2–7 marks origins; the CMG helicase is activated at firing.", 2));
      break;
    }
    case "ddr": {
      qs.push(mc("cc-atm", "Which kinase responds mainly to double-strand breaks, and which to stalled replication forks?", "ATM to double-strand breaks; ATR to single-stranded DNA at stalled forks", ["ATR to double-strand breaks; ATM to stalled forks", "CHK1 to both", "p53 to both"], "ATM–CHK2 and ATR–CHK1 are the two main arms; they cross-talk in real cells.", 0));
      qs.push(mc("cc-p21", "How does p53 contribute to cell-cycle arrest?", "It induces p21, a CDK inhibitor that keeps CDK2 inactive", ["It degrades cyclin B", "It phosphorylates RB directly", "It loads MCM"], "p21 binds cyclin–CDK complexes; the CHK–Cdc25 arm also holds CDKs inactive independently of p53.", 1));
      qs.push(mc("cc-ddr-now", "With the conditions shown, what happens at G1/S?", STATUS_TEXT[ev.verdicts.find((v) => v.id === "g1s")!.status], Object.values(STATUS_TEXT).filter((t) => t !== STATUS_TEXT[ev.verdicts.find((v) => v.id === "g1s")!.status]), ev.verdicts.find((v) => v.id === "g1s")!.text, 2));
      break;
    }
    case "g2m": {
      qs.push(mc("cc-wee1", "What keeps cyclin B–CDK1 inactive in G2?", "Inhibitory phosphorylation of CDK1 by Wee1, until Cdc25 removes it", ["Absence of cyclin B", "Binding of securin", "Cohesin"], "Cyclin B accumulates in G2, but CDK1 is held by Thr14/Tyr15 phosphates until Cdc25 acts; checkpoint kinases keep Cdc25 off if replication is unfinished or DNA is damaged.", 0));
      const g = ev.verdicts.find((v) => v.id === "g2m")!;
      qs.push(mc("cc-g2m-now", "With the conditions shown, what does the model say about entry into mitosis?", STATUS_TEXT[g.status], Object.values(STATUS_TEXT).filter((t) => t !== STATUS_TEXT[g.status]), g.text, 1));
      break;
    }
    case "sac": {
      qs.push(mc("cc-sac", "Why can an unattached kinetochore delay anaphase?", "It generates a checkpoint signal (MAD/BUB) that assembles the MCC, which inhibits APC/C–Cdc20, so securin is not degraded and separase stays inactive", ["It degrades separase", "It cleaves cohesin early", "It phosphorylates RB"], "Without APC/C–Cdc20, securin keeps separase inactive, cohesin is intact and sister chromatids stay together.", 0));
      const g = ev.verdicts.find((v) => v.id === "m")!;
      qs.push(mc("cc-sac-now", "With the conditions shown, what does the model say about anaphase onset?", STATUS_TEXT[g.status], Object.values(STATUS_TEXT).filter((t) => t !== STATUS_TEXT[g.status]), g.text, 1));
      qs.push(mc("cc-separase", "What does separase do, and what restrains it until metaphase?", "It cleaves the cohesin ring (Scc1/RAD21); securin restrains it until APC/C–Cdc20 degrades securin", ["It degrades cyclin B; cohesin restrains it", "It phosphorylates securin; MAD2 restrains it", "It loads MCM; geminin restrains it"], "APC/C–Cdc20 ubiquitinates securin; freed separase cleaves cohesin.", 2));
      break;
    }
  }
  return qs;
}

type CycleProbe = { label: string; section: CellCycleInputs["section"]; phase: PhaseId; patch: Partial<CycleInput>; perts: string[]; gate: "g1s" | "g2m" | "m" };
const CYCLE_PROBES: CycleProbe[] = [
  { label: "No mitogen in early G1", section: "g1s", phase: "G1", patch: { mitogen: false }, perts: [], gate: "g1s" },
  { label: "No mitogen, RB lost", section: "g1s", phase: "G1", patch: { mitogen: false }, perts: ["rb-loss"], gate: "g1s" },
  { label: "No mitogen, but the restriction point has been passed", section: "g1s", phase: "G1", patch: { mitogen: false, pastRestriction: true }, perts: [], gate: "g1s" },
  { label: "DNA breaks with p53 lost", section: "ddr", phase: "G1", patch: { dsb: true }, perts: ["p53-loss"], gate: "g1s" },
  { label: "DNA breaks with p53, ATM and CHK1 signalling all defective", section: "ddr", phase: "G1", patch: { dsb: true }, perts: ["p53-loss", "atm-defective", "chk1-defective"], gate: "g1s" },
  { label: "Unreplicated DNA in G2", section: "g2m", phase: "G2", patch: { replicationComplete: false }, perts: [], gate: "g2m" },
  { label: "Unreplicated DNA in G2 with CHK1 signalling defective", section: "g2m", phase: "G2", patch: { replicationComplete: false }, perts: ["chk1-defective"], gate: "g2m" },
  { label: "An unattached kinetochore", section: "sac", phase: "M", patch: { allAttached: false }, perts: [], gate: "m" },
  { label: "An unattached kinetochore with a defective MAD/BUB checkpoint", section: "sac", phase: "M", patch: { allAttached: false }, perts: ["sac-defective"], gate: "m" },
  { label: "All kinetochores attached, non-degradable securin", section: "sac", phase: "M", patch: {}, perts: ["securin-stable"], gate: "m" },
];
export function cellCycleChallenge(i: CellCycleInputs, idx: number): Challenge<CellCycleInputs> | null {
  const list = CYCLE_PROBES.filter((p) => i.section === "overview" || i.section === "cdk" || i.section === "licensing" ? true : p.section === i.section);
  const p = list[idx % list.length];
  const cycle: CycleInput = { ...withPhase({ ...i.cycle, perturbations: [] }, p.phase), ...p.patch, perturbations: p.perts };
  const ev = evaluateCycle(cycle), v = ev.verdicts.find((x) => x.id === p.gate)!;
  return {
    id: `cc-${idx}`, label: p.label,
    question: mc(`cc-ch-${p.label}`, `Predict (${MODULE_TITLE[p.section as keyof typeof MODULE_TITLE] ?? "checkpoint"}): ${p.label}. What does the model say about “${v.label}”?`, STATUS_TEXT[v.status], Object.values(STATUS_TEXT).filter((t) => t !== STATUS_TEXT[v.status]), `${v.text} Decided by: ${v.causes.map((c) => `${labelOf(c.id)} ${c.forced ? "(perturbed) " : ""}${c.value ? "ON" : "off"}`).join("; ")}.`, idx),
    next: { ...i, section: p.section, cycle, selected: null },
  };
}

// ================================================================ apoptosis, autophagy and cell fate ================================================================

const lastReached = (steps: PathStep[], n: number) => (n === 0 ? "The pathway does not start (no step is reached)" : `It reaches “${steps[n - 1].title}”${n < steps.length ? ` and stops before “${steps[n].title}”` : " and completes"}`);

export function cellDeathQuestions(i: CellDeathInputs): Question[] {
  const qs: Question[] = [];
  switch (i.section) {
    case "overview": {
      qs.push(mc("cd-regulated", "How does regulated cell death differ from accidental cell death?", "Regulated death (for example apoptosis) is executed by dedicated molecular machinery; accidental death follows physical or chemical injury that overwhelms the cell", ["There is no difference", "Regulated death is always caused by caspases", "Accidental death is always apoptosis"], "Apoptosis is one regulated form; others exist and are not modelled. Accidental, injury-induced death is not a signalling pathway.", 0));
      qs.push(mc("cd-damage", "Does every kind of cellular damage lead to apoptosis?", "No: depending on severity and context a cell may repair the damage, arrest, enter senescence, recycle components by autophagy or die", ["Yes, always", "Only DNA damage does", "Only mitochondrial damage does"], "Pathway engagement is not fate. The fate map shows which mechanisms are engaged and which outcomes remain undetermined.", 1));
      break;
    }
    case "intrinsic": {
      const steps = PATH_STEPS.intrinsic, ev = evaluateApoptosis(i.apop), n = pathProgress("intrinsic", ev.values);
      qs.push(mc("cd-int-activate", "What activates the intrinsic apoptotic pathway?", "Cellular stress or damage signals (for example DNA damage or growth-factor withdrawal) that engage BH3-only proteins and overcome pro-survival BCL-2 proteins", ["Binding of a death ligand such as FasL to its receptor", "Caspase-8 at the DISC alone", "Nutrient abundance"], "BH3-only proteins signal to BAX/BAK; pro-survival BCL-2 family proteins restrain them. Death ligands act through the extrinsic pathway.", 0));
      qs.push(mc("cd-int-order", "In what order do these events occur?", "BAX/BAK activation → outer-membrane permeabilisation → cytochrome c release → apoptosome → caspase-9 → caspase-3/7", ["Caspase-3/7 → cytochrome c release → BAX/BAK", "Apoptosome → BAX/BAK → caspase-9", "Caspase-9 → MOMP → BH3-only signal"], steps.map((s) => s.title).join(" → "), 1));
      qs.push(mc("cd-int-here", "With the stimulus and perturbations shown, how far does the intrinsic pathway get?", lastReached(steps, n), steps.map((_, k) => lastReached(steps, k)).filter((_, k) => k !== n).slice(0, 3), `Each step requires the previous one. ${ev.outcome.definite.join(" ")}`, 2));
      qs.push(mc("cd-momp", "Is MOMP the same as any change in mitochondrial membrane potential?", "No: MOMP is permeabilisation of the outer membrane by BAX/BAK pores, which releases intermembrane-space proteins", ["Yes: any loss of membrane potential is MOMP", "MOMP occurs only through the extrinsic pathway", "MOMP is the activation of caspase-3"], "Membrane potential changes can occur without MOMP.", 3));
      break;
    }
    case "extrinsic": {
      const steps = PATH_STEPS.extrinsic, ev = evaluateApoptosis({ ...i.apop, deathLigand: true }), n = pathProgress("extrinsic", ev.values);
      qs.push(mc("cd-ext-order", "What is the order of events in Fas-mediated apoptosis?", steps.map((s) => s.title).join(" → "), ["FADD → Fas → caspase-3/7 → DISC", "Caspase-8 → Fas → DISC → FADD", "Cytochrome c → DISC → Fas"], "The ligand clusters the receptor; FADD binds through death domains; procaspase-8 is recruited into the DISC and activated.", 0));
      qs.push(mc("cd-ext-int", "How do the extrinsic and intrinsic pathways differ in how they start, and how can they connect?", "Extrinsic starts at a death receptor and caspase-8; intrinsic starts with BH3-only proteins and mitochondria. Caspase-8 can cleave BID to tBID, which engages mitochondria (needed in type II cells)", ["They are identical", "Extrinsic starts with cytochrome c release", "They can never connect"], "The type I/II distinction depends on how much caspase-8 is activated at the DISC.", 1));
      qs.push(mc("cd-ext-here", "With the settings shown, how far does the extrinsic pathway get?", lastReached(steps, n), steps.map((_, k) => lastReached(steps, k)).filter((_, k) => k !== n).slice(0, 3), ev.outcome.definite.join(" "), 2));
      break;
    }
    case "caspases": {
      qs.push(mc("cd-casp-kinds", "What is the difference between initiator and executioner caspases?", "Initiators (caspase-8, -9) are activated on adaptor platforms (DISC, apoptosome) by induced proximity; executioners (caspase-3, -7) are activated by proteolytic cleavage by an initiator and cleave many cellular substrates", ["Initiators cleave DNA; executioners assemble platforms", "They are identical enzymes activated in a chain", "Executioners are activated before initiators"], CASPASES.map((c) => `${c.name}: ${c.activation}`).join(" "), 0));
      qs.push(mc("cd-casp-conseq", "Which of these follows executioner-caspase activation?", "Lamin cleavage (nuclear fragmentation), ICAD cleavage (DNA fragmentation), cytoskeletal changes (blebbing) and phosphatidylserine exposure", ["Cytochrome c release from mitochondria", "Assembly of the DISC", "Activation of mTORC1"], "Cytochrome c release and the DISC come earlier; these consequences come from cleaved substrates.", 1));
      break;
    }
    case "autophagy": {
      const ev = evaluateAutophagy(i.auto);
      qs.push(mc("cd-auto-apop", "Why is autophagy not synonymous with apoptosis?", "Autophagy is a lysosome-based recycling pathway (ULK1, Beclin 1–VPS34, LC3) that does not require caspases; it often supports survival and does not necessarily lead to death", ["Because autophagy activates caspase-3", "Because autophagy is a form of necrosis", "They are two names for the same process"], "The autophagy graph contains no caspase, MOMP or apoptosome step. More autophagy does not by itself cause cell death.", 0));
      qs.push(mc("cd-auto-here", "With the settings shown, how far does autophagy get?", lastReached(AUTOPHAGY_STEPS, ev.progress), AUTOPHAGY_STEPS.map((_, k) => lastReached(AUTOPHAGY_STEPS, k)).filter((_, k) => k !== ev.progress).slice(0, 3), ev.outcome.definite.join(" "), 1));
      qs.push(mc("cd-auto-nuc", "Which complexes are responsible for initiation, nucleation and membrane expansion?", "ULK1 complex (initiation), Beclin 1–VPS34 (PI3P, nucleation), LC3 lipidation by the ATG5/ATG7 system (expansion)", ["mTORC1, Beclin 1, caspase-9", "APAF1, BAX, LC3", "SNAREs, Rabs, COPII"], "Starvation switches mTORC1 off, freeing ULK1; VPS34 makes PI3P; the ATG conjugation system lipidates LC3.", 2));
      break;
    }
    case "fate": {
      const f = evaluateFate(i.fate), sc = SCENARIOS.find((s) => s.id === i.fate.scenario)!;
      const r = f.rows.find((x) => x.id === "intrinsic")!;
      qs.push(mc(`cd-fate-${sc.id}`, `In the scenario “${sc.label}”, what does the model say about mitochondrial apoptosis?`, { engaged: "Engaged", blocked: "Blocked (a stimulus is present but the pathway does not complete)", "not-engaged": "Not engaged", possible: "Possible in some contexts, but not derived by the model" }[r.status], ["Engaged", "Not engaged", "Blocked (a stimulus is present but the pathway does not complete)", "Possible in some contexts, but not derived by the model"].filter((t) => !t.startsWith({ engaged: "Engaged", blocked: "Blocked", "not-engaged": "Not engaged", possible: "Possible" }[r.status])), r.text, 0));
      qs.push(mc("cd-fate-undetermined", "Does the fate map tell you whether the cell survives?", "No: it shows which modelled mechanisms are engaged or blocked; survival, senescence or death are not predicted", ["Yes, it gives a survival probability", "Yes, it predicts cancer susceptibility", "Yes, it predicts a treatment response"], f.uncertain.join(" "), 1));
      break;
    }
  }
  return qs;
}

export function cellDeathChallenge(i: CellDeathInputs, idx: number): Challenge<CellDeathInputs> | null {
  const sec = i.section;
  if (sec === "autophagy") {
    const probes: Array<{ perts: string[]; auto: Partial<CellDeathInputs["auto"]>; label: string }> = [
      { perts: ["fusion-defective"], auto: { nutrients: false }, label: "Starvation with defective autophagosome–lysosome fusion" }, { perts: ["v-atpase-inhibited"], auto: { nutrients: false }, label: "Starvation with an inhibited lysosomal V-ATPase" },
      { perts: ["ulk1-loss"], auto: { nutrients: false }, label: "Starvation with an impaired ULK1 complex" }, { perts: ["atg-conjugation-loss"], auto: { nutrients: false }, label: "Starvation with impaired ATG5/ATG7 conjugation" },
      { perts: ["mtor-inhibited"], auto: { nutrients: true }, label: "Nutrient-rich cell with mTORC1 inhibited" }, { perts: [], auto: { nutrients: true }, label: "A nutrient-rich cell with no perturbation" },
    ];
    const p = probes[idx % probes.length];
    const auto = { ...i.auto, ...p.auto, perturbations: p.perts, step: AUTOPHAGY_STEPS.length };
    const ev = evaluateAutophagy(auto);
    const tail = ev.values.accumulating ? " Autophagosomes accumulate without being cleared." : "";
    return { id: `cd-a-${idx}`, label: p.label, question: mc(`cd-ach-${idx}`, `Predict: ${p.label}. How far does autophagy get?`, lastReached(AUTOPHAGY_STEPS, ev.progress), AUTOPHAGY_STEPS.map((_, k) => lastReached(AUTOPHAGY_STEPS, k)).filter((_, k) => k !== ev.progress).slice(0, 3), `${ev.outcome.definite.join(" ")}${tail}`, idx), next: { ...i, auto, selected: null } };
  }
  if (sec === "fate") {
    const probes: Array<{ scenario: CellDeathInputs["fate"]["scenario"]; perts: string[]; row: "intrinsic" | "caspases" | "recycling" | "arrest"; label: string }> = [
      { scenario: "dna-damage", perts: ["p53-loss"], row: "intrinsic", label: "DNA damage with p53 lost" }, { scenario: "death-receptor", perts: ["bcl2-overexpression"], row: "caspases", label: "Death receptor activation with BCL-2 in excess (type I cell)" },
      { scenario: "death-receptor", perts: ["cflip-high"], row: "caspases", label: "Death receptor activation with c-FLIP in excess" }, { scenario: "lysosomal-dysfunction", perts: [], row: "recycling", label: "Lysosomal dysfunction" },
      { scenario: "er-stress", perts: ["bax-loss", "bak-loss"], row: "caspases", label: "Severe ER stress with BAX and BAK both lost" }, { scenario: "nutrient-deprivation", perts: ["ulk1-loss"], row: "recycling", label: "Nutrient deprivation with an impaired ULK1 complex" },
    ];
    const p = probes[idx % probes.length];
    const fate = { scenario: p.scenario, perturbations: p.perts, selected: null };
    const f = evaluateFate(fate), r = f.rows.find((x) => x.id === p.row)!;
    const T = { engaged: "Engaged", blocked: "Blocked", "not-engaged": "Not engaged", possible: "Possible (context-dependent, not derived)" } as const;
    return { id: `cd-f-${idx}`, label: p.label, question: mc(`cd-fch-${idx}`, `Predict: ${p.label}. What does the model say about “${r.label}”?`, T[r.status], Object.values(T).filter((t) => t !== T[r.status]), `${r.text} The model does not say whether the cell survives or dies.`, idx), next: { ...i, section: "fate", fate, selected: null } };
  }
  const path: "intrinsic" | "extrinsic" = sec === "extrinsic" ? "extrinsic" : "intrinsic";
  const probes: Array<{ perts: string[]; patch: Partial<CellDeathInputs["apop"]>; label: string }> = path === "intrinsic"
    ? [
      { perts: ["bcl2-overexpression"], patch: { dnaDamage: true }, label: "DNA damage with pro-survival BCL-2 proteins in excess" }, { perts: ["bax-loss", "bak-loss"], patch: { dnaDamage: true }, label: "DNA damage with BAX and BAK both lost" },
      { perts: ["bax-loss"], patch: { dnaDamage: true }, label: "DNA damage with BAX lost (BAK present)" }, { perts: ["apaf1-loss"], patch: { dnaDamage: true }, label: "DNA damage with APAF1 impaired" },
      { perts: ["casp9-inhibited"], patch: { dnaDamage: true }, label: "DNA damage with caspase-9 inhibited" }, { perts: ["p53-loss"], patch: { dnaDamage: true }, label: "DNA damage with p53 lost" }, { perts: ["p53-loss"], patch: { dnaDamage: false, gfWithdrawal: true }, label: "Growth-factor withdrawal with p53 lost" },
    ]
    : [
      { perts: ["cflip-high"], patch: { dnaDamage: false, deathLigand: true }, label: "FasL with c-FLIP in excess" }, { perts: ["fadd-loss"], patch: { dnaDamage: false, deathLigand: true }, label: "FasL with FADD lost" },
      { perts: ["receptor-defective"], patch: { dnaDamage: false, deathLigand: true }, label: "FasL with defective Fas signalling" }, { perts: ["bcl2-overexpression"], patch: { dnaDamage: false, deathLigand: true, typeII: true }, label: "FasL in a type II cell with BCL-2 in excess" },
      { perts: ["bcl2-overexpression"], patch: { dnaDamage: false, deathLigand: true, typeII: false }, label: "FasL in a type I cell with BCL-2 in excess" },
    ];
  const p = probes[idx % probes.length];
  const apop = { ...i.apop, dnaDamage: false, gfWithdrawal: false, erStress: false, mitoStress: false, deathLigand: false, typeII: false, ...p.patch, perturbations: p.perts, path, step: PATH_STEPS[path].length };
  const ev = evaluateApoptosis(apop), n = pathProgress(path, ev.values), steps = PATH_STEPS[path];
  return { id: `cd-p-${idx}`, label: p.label, question: mc(`cd-pch-${path}-${idx}`, `Predict: ${p.label}. How far does the ${path} pathway get?`, lastReached(steps, n), steps.map((_, k) => lastReached(steps, k)).filter((_, k) => k !== n).slice(0, 3), `${ev.outcome.definite.join(" ")} ${ev.outcome.uncertain[0] ?? ""}`.trim(), idx), next: { ...i, section: path, apop, selected: null } };
}
