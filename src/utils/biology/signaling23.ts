/**
 * Stage 23: receptor and signal-transduction pathways. Pure, deterministic, typed; no React.
 *
 * Each pathway is a small curated mechanism graph. A node's state is DERIVED from its inputs (`requires`), its inhibitors
 * (`suppressedBy`), the ligand, and the perturbations chosen: it is never painted by hand. Perturbations are either a
 * loss of function ("block") or a ligand-independent active state ("constitutive"). Three phases are evaluated:
 *   acute     - ligand present, signal building up
 *   prolonged - ligand still present; negative feedback / desensitization attenuates the signal where it is functional
 *   removed   - ligand withdrawn; states persist only where the relevant termination mechanism is blocked or a node is constitutive
 *
 * Only ordinal states are produced. No amplification factors, rates or concentrations are invented, and nothing is inferred
 * about proliferation, differentiation, survival or organism-level phenotype.
 */

export type SystemId = "gs" | "gi" | "gq" | "rtk" | "lgic" | "nuclear";
export const SYSTEM_IDS: readonly SystemId[] = ["gs", "gi", "gq", "rtk", "lgic", "nuclear"];
export type Phase = "acute" | "prolonged" | "removed";
export const PHASES: readonly Phase[] = ["acute", "prolonged", "removed"];
export type Status = "active" | "inactive" | "blocked" | "attenuated" | "persisting";
export type NodeKind = "ligand" | "receptor" | "gprotein" | "enzyme" | "messenger" | "kinase" | "channel" | "adapter" | "gtpase" | "effector" | "terminator" | "output";

export const isOn = (s: Status) => s === "active" || s === "attenuated" || s === "persisting";

export interface SigNode {
  id: string; label: string; kind: NodeKind;
  /** Activation event (1-based) at which the node can change state; 0 for terminators. */
  step: number;
  where: string; role: string; mechanism: string;
  offState: string; onState: string;
  requires: string[];
  /** Any active suppressor switches the node off. */
  suppressedBy?: string[];
  /** Partial opposition: changes the description of the state, not whether it is on. */
  opposedBy?: string[];
  /** Terminator node whose failure lets this node's state persist after the ligand is gone. */
  terminatedBy?: string;
  /** Terminator node whose normal function attenuates this node in the prolonged phase. */
  attenuatedBy?: string;
  amplifies?: boolean;
  /** Layout: column 0–2 and row. */
  pos: [number, number];
}
export interface Perturbation { id: string; label: string; kind: "block" | "constitutive"; target: string; explanation: string; example?: string }
export interface SigSystem {
  id: SystemId; label: string; receptorClass: string; example: string; summary: string;
  nodes: SigNode[]; perturbations: Perturbation[];
  ligandId: string; /** Optional second ligand (Gi system: a Gs-coupled co-stimulus). */ coLigandId?: string;
  steps: number; membraneRow: number; keyNodes: string[];
  limits: string;
}

const T = (id: string, label: string, role: string, pos: [number, number]): SigNode => ({ id, label, kind: "terminator", step: 0, where: "—", role, mechanism: role, offState: "not functional", onState: "functional", requires: [], pos });

const GS: SigSystem = {
  id: "gs", label: "GPCR: Gs → adenylyl cyclase → cAMP → PKA", receptorClass: "G-protein-coupled receptor (Gs-coupled)", example: "β₂-adrenergic receptor and epinephrine",
  summary: "A Gs-coupled receptor activates Gαs, which stimulates adenylyl cyclase; the second messenger cAMP activates protein kinase A.",
  ligandId: "lig", steps: 6, membraneRow: 1, keyNodes: ["rec", "gp", "camp", "pka"],
  limits: "Amplification is described qualitatively only. Which proteins PKA phosphorylates, and with what effect, depends on the cell type and is not modelled. Gβγ signalling to its own effectors is not shown.",
  nodes: [
    { id: "lig", label: "Agonist", kind: "ligand", step: 1, where: "Extracellular fluid", role: "An extracellular signal that binds the receptor (here, epinephrine).", mechanism: "The agonist binds the extracellular side of the receptor and stabilizes its active conformation.", offState: "absent", onState: "present and bound", requires: [], pos: [1, 0] },
    { id: "rec", label: "Gs-coupled receptor", kind: "receptor", step: 1, where: "Plasma membrane (seven transmembrane helices)", role: "Detects the ligand and activates a heterotrimeric G protein on its cytosolic face.", mechanism: "Ligand binding changes the receptor's conformation so that its cytosolic side acts as a guanine-nucleotide exchange factor (GEF) for the G protein.", offState: "inactive conformation", onState: "agonist-bound, active conformation (GEF for Gs)", requires: ["lig"], attenuatedBy: "desens", amplifies: true, pos: [1, 1] },
    { id: "gp", label: "Gαs·βγ", kind: "gprotein", step: 2, where: "Inner face of the plasma membrane", role: "A heterotrimeric G protein that switches between GDP-bound (off) and GTP-bound (on) forms.", mechanism: "The active receptor makes Gαs release GDP; GTP, which is more abundant in the cytosol, binds. Gαs·GTP separates from Gβγ and can act on effectors.", offState: "Gαs·GDP bound to Gβγ (inactive heterotrimer)", onState: "Gαs·GTP separated from Gβγ (active)", requires: ["rec"], terminatedBy: "gtpase", amplifies: true, pos: [1, 2] },
    { id: "ac", label: "Adenylyl cyclase", kind: "enzyme", step: 3, where: "Plasma membrane enzyme", role: "Converts ATP to cAMP and pyrophosphate.", mechanism: "Gαs·GTP binds adenylyl cyclase and stimulates it.", offState: "basal activity (not stimulated by Gs)", onState: "stimulated by Gαs·GTP", requires: ["gp"], amplifies: true, pos: [1, 3] },
    { id: "camp", label: "cAMP", kind: "messenger", step: 4, where: "Cytosol (diffusible second messenger)", role: "Second messenger made from ATP; it carries the signal into the cytosol.", mechanism: "Stimulated adenylyl cyclase makes many cAMP molecules, so one enzyme can produce a large chemical signal.", offState: "low (basal)", onState: "elevated", requires: ["ac"], terminatedBy: "pde", amplifies: true, pos: [1, 4] },
    { id: "pka", label: "Protein kinase A", kind: "kinase", step: 5, where: "Cytosol", role: "A serine/threonine kinase activated by cAMP.", mechanism: "cAMP binds the regulatory subunits of the inactive R₂C₂ tetramer and releases the active catalytic subunits.", offState: "inactive R₂C₂ tetramer", onState: "catalytic subunits released (active)", requires: ["camp"], amplifies: true, pos: [1, 5] },
    { id: "tgt", label: "PKA substrates", kind: "output", step: 6, where: "Cytosol (and nucleus)", role: "Proteins whose phosphorylation by PKA changes their activity; they differ between cell types.", mechanism: "Active PKA transfers phosphate from ATP to serine/threonine residues on substrate proteins.", offState: "not phosphorylated by PKA", onState: "phosphorylated (effect is cell-type specific)", requires: ["pka"], terminatedBy: "pp", pos: [1, 6] },
    T("gtpase", "Gαs GTPase", "Gαs hydrolyzes its bound GTP to GDP and returns to the inactive heterotrimer.", [0, 2]),
    T("pde", "Phosphodiesterase", "Phosphodiesterase (PDE) hydrolyzes cAMP to 5′-AMP, ending the second-messenger signal.", [2, 4]),
    T("pp", "Protein phosphatases", "Protein phosphatases remove the phosphates PKA added.", [2, 6]),
    T("desens", "GRK / β-arrestin", "G-protein receptor kinase and β-arrestin desensitize an agonist-occupied receptor, uncoupling it from the G protein.", [2, 1]),
  ],
  perturbations: [
    { id: "rec-nobind", label: "Receptor cannot bind ligand", kind: "block", target: "rec", explanation: "A binding-site mutation or a competitive antagonist keeps the receptor inactive.", example: "a competitive antagonist such as a β-blocker" },
    { id: "gp-noexchange", label: "G protein cannot exchange GDP for GTP", kind: "block", target: "gp", explanation: "Gαs stays GDP-bound, so the active receptor cannot switch it on." },
    { id: "gp-gtpase", label: "GTPase-deficient Gαs (stays GTP-bound)", kind: "constitutive", target: "gp", explanation: "Gαs cannot hydrolyze GTP, so it stays on without the receptor.", example: "cholera toxin modifies Gαs this way" },
    { id: "ac-inhib", label: "Adenylyl cyclase inhibited", kind: "block", target: "ac", explanation: "Gs may be active, but no cAMP is made." },
    { id: "pde-inhib", label: "Phosphodiesterase inhibited", kind: "block", target: "pde", explanation: "cAMP is not degraded, so it persists after the signal stops.", example: "IBMX, a non-selective PDE inhibitor" },
    { id: "pka-inhib", label: "Protein kinase A inhibited", kind: "block", target: "pka", explanation: "cAMP may rise but PKA cannot phosphorylate its substrates." },
    { id: "pp-inhib", label: "Protein phosphatases inhibited", kind: "block", target: "pp", explanation: "Substrate phosphates are not removed." },
    { id: "grk-block", label: "Desensitization (GRK/arrestin) blocked", kind: "block", target: "desens", explanation: "The receptor stays coupled during prolonged exposure, so the signal is not attenuated." },
  ],
};

const GI: SigSystem = {
  id: "gi", label: "GPCR: Gi inhibits adenylyl cyclase", receptorClass: "G-protein-coupled receptor (Gi-coupled)", example: "α₂-adrenergic receptor opposing a Gs-coupled stimulus",
  summary: "A Gi-coupled receptor does not raise cAMP. Gαi·GTP inhibits adenylyl cyclase, so it lowers cAMP production, most visibly when a Gs-coupled input is also stimulating it.",
  ligandId: "lig", coLigandId: "lig2", steps: 7, membraneRow: 1, keyNodes: ["gp", "ac", "camp", "pka"],
  limits: "Whether the net cAMP with both inputs is above or below the basal level depends on the relative strengths, which the model does not know; it reports only that the Gs-stimulated production is opposed. Gβγ effects (for example on K⁺ channels) are not shown.",
  nodes: [
    { id: "lig2", label: "Gs-coupled agonist (optional stimulus)", kind: "ligand", step: 1, where: "Extracellular fluid", role: "A separate agonist that stimulates adenylyl cyclase through Gs, so the opposing effect of Gi can be seen.", mechanism: "The Gs-coupled agonist binds its receptor.", offState: "absent", onState: "present and bound", requires: [], pos: [0, 0] },
    { id: "rec2", label: "Gs-coupled receptor", kind: "receptor", step: 1, where: "Plasma membrane", role: "Activates Gs when its agonist is bound.", mechanism: "The agonist-bound receptor acts as a GEF for Gs.", offState: "inactive conformation", onState: "agonist-bound, active", requires: ["lig2"], pos: [0, 1] },
    { id: "gps", label: "Gαs·βγ", kind: "gprotein", step: 2, where: "Inner face of the plasma membrane", role: "Gs, which stimulates adenylyl cyclase.", mechanism: "GDP is exchanged for GTP; Gαs·GTP separates from Gβγ.", offState: "Gαs·GDP·βγ (inactive)", onState: "Gαs·GTP (active)", requires: ["rec2"], terminatedBy: "gtpase", pos: [0, 2] },
    { id: "lig", label: "Gi-coupled agonist", kind: "ligand", step: 3, where: "Extracellular fluid", role: "An agonist for a Gi-coupled receptor (for example an α₂-adrenergic agonist).", mechanism: "The agonist binds the Gi-coupled receptor.", offState: "absent", onState: "present and bound", requires: [], pos: [2, 0] },
    { id: "rec", label: "Gi-coupled receptor", kind: "receptor", step: 3, where: "Plasma membrane", role: "Activates Gi when its agonist is bound.", mechanism: "The agonist-bound receptor acts as a GEF for Gi.", offState: "inactive conformation", onState: "agonist-bound, active (GEF for Gi)", requires: ["lig"], pos: [2, 1] },
    { id: "gp", label: "Gαi·βγ", kind: "gprotein", step: 4, where: "Inner face of the plasma membrane", role: "Gi: its GTP-bound α subunit inhibits adenylyl cyclase.", mechanism: "GDP is exchanged for GTP; Gαi·GTP separates from Gβγ and inhibits adenylyl cyclase.", offState: "Gαi·GDP·βγ (inactive)", onState: "Gαi·GTP (active; inhibits adenylyl cyclase)", requires: ["rec"], terminatedBy: "gtpase", pos: [2, 2] },
    { id: "ac", label: "Adenylyl cyclase", kind: "enzyme", step: 5, where: "Plasma membrane enzyme", role: "Makes cAMP; stimulated by Gαs·GTP and inhibited by Gαi·GTP.", mechanism: "It integrates both inputs: Gαs·GTP stimulates it and Gαi·GTP opposes the stimulation.", offState: "basal (not stimulated by Gs)", onState: "stimulated by Gαs·GTP", requires: ["gps"], opposedBy: ["gp"], pos: [1, 3] },
    { id: "camp", label: "cAMP", kind: "messenger", step: 6, where: "Cytosol", role: "Second messenger produced by adenylyl cyclase.", mechanism: "cAMP is produced at the rate set by adenylyl cyclase and removed by phosphodiesterase.", offState: "not elevated", onState: "elevated", requires: ["ac"], terminatedBy: "pde", pos: [1, 4] },
    { id: "pka", label: "Protein kinase A", kind: "kinase", step: 7, where: "Cytosol", role: "Activated by cAMP.", mechanism: "cAMP releases the catalytic subunits.", offState: "inactive R₂C₂", onState: "catalytic subunits released (active)", requires: ["camp"], pos: [1, 5] },
    T("gtpase", "Gα GTPase", "Each Gα hydrolyzes its bound GTP and returns to the inactive heterotrimer.", [0, 4]),
    T("pde", "Phosphodiesterase", "Phosphodiesterase hydrolyzes cAMP to 5′-AMP.", [2, 4]),
  ],
  perturbations: [
    { id: "rec-nobind", label: "Gi receptor cannot bind ligand", kind: "block", target: "rec", explanation: "The Gi branch is never activated." },
    { id: "gp-noexchange", label: "Gαi cannot exchange GDP for GTP", kind: "block", target: "gp", explanation: "Gαi stays GDP-bound, so Gi cannot inhibit adenylyl cyclase.", example: "pertussis toxin locks Gαi this way" },
    { id: "ac-inhib", label: "Adenylyl cyclase inhibited", kind: "block", target: "ac", explanation: "No cAMP is made whatever the G proteins do." },
    { id: "pde-inhib", label: "Phosphodiesterase inhibited", kind: "block", target: "pde", explanation: "Any cAMP made is not degraded.", example: "IBMX" },
    { id: "pka-inhib", label: "Protein kinase A inhibited", kind: "block", target: "pka", explanation: "cAMP cannot be turned into PKA activity." },
  ],
};

const GQ: SigSystem = {
  id: "gq", label: "GPCR: Gq → PLC → IP₃ and DAG", receptorClass: "G-protein-coupled receptor (Gq-coupled)", example: "α₁-adrenergic or M₃ muscarinic receptor",
  summary: "A Gq-coupled receptor activates phospholipase C-β, which splits PIP₂ into IP₃ (releases Ca²⁺ from the ER) and DAG (with Ca²⁺ activates conventional PKC). This branch does not raise cAMP.",
  ligandId: "lig", steps: 7, membraneRow: 1, keyNodes: ["gp", "plc", "ip3", "dag", "ca", "pkc"],
  limits: "Only conventional PKC (which needs both DAG and Ca²⁺) is modelled; some PKC isoforms need only DAG. Ca²⁺ is a qualitative on/off state, not a concentration or oscillation pattern. Downstream targets differ between cell types.",
  nodes: [
    { id: "lig", label: "Agonist", kind: "ligand", step: 1, where: "Extracellular fluid", role: "An extracellular signal for a Gq-coupled receptor.", mechanism: "The agonist binds the receptor and stabilizes its active conformation.", offState: "absent", onState: "present and bound", requires: [], pos: [1, 0] },
    { id: "rec", label: "Gq-coupled receptor", kind: "receptor", step: 1, where: "Plasma membrane", role: "Activates the G protein Gq.", mechanism: "The agonist-bound receptor acts as a GEF for Gq.", offState: "inactive conformation", onState: "agonist-bound, active (GEF for Gq)", requires: ["lig"], pos: [1, 1] },
    { id: "gp", label: "Gαq·βγ", kind: "gprotein", step: 2, where: "Inner face of the plasma membrane", role: "Gq: its GTP-bound α subunit activates phospholipase C-β.", mechanism: "GDP is exchanged for GTP; Gαq·GTP separates from Gβγ.", offState: "Gαq·GDP·βγ (inactive)", onState: "Gαq·GTP (active)", requires: ["rec"], terminatedBy: "gtpase", amplifies: true, pos: [1, 2] },
    { id: "plc", label: "Phospholipase C-β", kind: "enzyme", step: 3, where: "Plasma membrane enzyme", role: "Hydrolyzes the membrane phospholipid PIP₂.", mechanism: "Gαq·GTP binds and activates PLC-β.", offState: "inactive", onState: "active (cleaves PIP₂)", requires: ["gp"], amplifies: true, pos: [1, 3] },
    { id: "ip3", label: "IP₃", kind: "messenger", step: 4, where: "Cytosol (soluble)", role: "Soluble second messenger released from PIP₂ that opens IP₃ receptors on the ER.", mechanism: "PLC-β cleaves PIP₂ into soluble IP₃ and membrane-bound DAG.", offState: "low", onState: "elevated", requires: ["plc"], terminatedBy: "ip3ptase", pos: [0, 4] },
    { id: "dag", label: "DAG", kind: "messenger", step: 4, where: "Inner leaflet of the plasma membrane", role: "Lipid second messenger that stays in the membrane and helps activate PKC.", mechanism: "Produced together with IP₃ when PLC-β cleaves PIP₂.", offState: "low", onState: "elevated", requires: ["plc"], terminatedBy: "dagk", pos: [2, 4] },
    { id: "ca", label: "Ca²⁺ (from ER)", kind: "messenger", step: 5, where: "Cytosol; stored in the ER", role: "IP₃ opens IP₃-receptor Ca²⁺ channels, releasing Ca²⁺ from the ER down its gradient.", mechanism: "IP₃ binds IP₃ receptors on the ER membrane; the open channel lets stored Ca²⁺ flow into the cytosol.", offState: "low cytosolic Ca²⁺", onState: "raised cytosolic Ca²⁺", requires: ["ip3"], terminatedBy: "pump", amplifies: true, pos: [0, 5] },
    { id: "caResp", label: "Ca²⁺-dependent proteins", kind: "output", step: 6, where: "Cytosol", role: "Ca²⁺-binding proteins (for example calmodulin-regulated enzymes) change activity.", mechanism: "Ca²⁺ binds proteins such as calmodulin and changes their activity; targets differ between cell types.", offState: "not activated by Ca²⁺", onState: "activated by Ca²⁺", requires: ["ca"], pos: [0, 6] },
    { id: "pkc", label: "Protein kinase C (conventional)", kind: "kinase", step: 6, where: "Cytosol → plasma membrane", role: "Conventional PKC needs both Ca²⁺ and DAG.", mechanism: "Ca²⁺ brings PKC to the membrane, where DAG binds and activates it.", offState: "inactive", onState: "active at the membrane", requires: ["dag", "ca"], pos: [2, 5] },
    { id: "tgt", label: "PKC substrates", kind: "output", step: 7, where: "Cytosol and membrane", role: "Proteins phosphorylated by PKC.", mechanism: "Active PKC phosphorylates serine/threonine residues of substrates.", offState: "not phosphorylated by PKC", onState: "phosphorylated (effect is cell-type specific)", requires: ["pkc"], terminatedBy: "pp", pos: [2, 6] },
    T("gtpase", "Gαq GTPase", "Gαq hydrolyzes its GTP; PLC-β itself speeds this up.", [0, 2]),
    T("ip3ptase", "IP₃ phosphatase / kinase", "IP₃ is dephosphorylated or phosphorylated into forms that do not open IP₃ receptors.", [0, 3]),
    T("dagk", "DAG kinase", "DAG kinase converts DAG to phosphatidic acid.", [2, 3]),
    T("pump", "SERCA / PMCA pumps", "Ca²⁺-ATPases pump Ca²⁺ back into the ER or out of the cell (primary active transport).", [1, 5]),
    T("pp", "Protein phosphatases", "Phosphatases remove PKC-added phosphates.", [1, 6]),
  ],
  perturbations: [
    { id: "rec-nobind", label: "Receptor cannot bind ligand", kind: "block", target: "rec", explanation: "The receptor is never activated." },
    { id: "gp-noexchange", label: "G protein cannot exchange GDP for GTP", kind: "block", target: "gp", explanation: "Gαq stays GDP-bound." },
    { id: "gp-gtpase", label: "GTPase-deficient Gαq (stays GTP-bound)", kind: "constitutive", target: "gp", explanation: "Gαq stays on without the receptor." },
    { id: "plc-inhib", label: "Phospholipase C inhibited", kind: "block", target: "plc", explanation: "PIP₂ is not cleaved, so neither IP₃ nor DAG is made.", example: "U73122" },
    { id: "ip3r-block", label: "IP₃ receptor channel blocked", kind: "block", target: "ca", explanation: "IP₃ and DAG still form but no Ca²⁺ is released from the ER; conventional PKC then lacks its Ca²⁺ requirement." },
    { id: "pkc-inhib", label: "Protein kinase C inhibited", kind: "block", target: "pkc", explanation: "Ca²⁺-dependent responses are unaffected; PKC substrates are not phosphorylated." },
    { id: "ip3ptase-block", label: "IP₃ degradation blocked", kind: "block", target: "ip3ptase", explanation: "IP₃ persists after the signal stops." },
    { id: "pump-block", label: "Ca²⁺ pumps blocked", kind: "block", target: "pump", explanation: "Cytosolic Ca²⁺ is not cleared." },
    { id: "dagk-block", label: "DAG kinase blocked", kind: "block", target: "dagk", explanation: "DAG is not removed." },
  ],
};

const RTK: SigSystem = {
  id: "rtk", label: "Receptor tyrosine kinase: EGFR → Ras → Raf → MEK → ERK", receptorClass: "Receptor tyrosine kinase", example: "EGFR (epidermal growth factor receptor) and EGF",
  summary: "EGF binding makes EGFR dimerize and phosphorylate itself on tyrosines. Adaptor proteins recruit a Ras activator, and Ras starts the Raf → MEK → ERK kinase cascade.",
  ligandId: "lig", steps: 9, membraneRow: 1, keyNodes: ["rec", "pty", "ras", "raf", "mek", "erk"],
  limits: "This is one curated EGFR → MAPK route. Other RTKs differ in their activation mechanism, phosphorylation sites and downstream effectors, and EGFR also signals through other branches (for example PI3K) that are not shown. ERK activation is not the same as proliferation: what the cell does depends on cell type, signal duration and other pathways.",
  nodes: [
    { id: "lig", label: "EGF", kind: "ligand", step: 1, where: "Extracellular fluid", role: "Epidermal growth factor, the ligand of EGFR.", mechanism: "EGF binds the extracellular domain of EGFR.", offState: "absent", onState: "present and bound", requires: [], pos: [1, 0] },
    { id: "rec", label: "EGFR", kind: "receptor", step: 1, where: "Plasma membrane (single transmembrane helix)", role: "Receptor tyrosine kinase with an intracellular kinase domain.", mechanism: "Ligand binding drives EGFR to form dimers, which brings the two kinase domains together in an active arrangement.", offState: "monomer, kinase inactive", onState: "ligand-bound dimer, kinase active", requires: ["lig"], attenuatedBy: "fb", amplifies: false, pos: [1, 1] },
    { id: "pty", label: "Tyrosine autophosphorylation", kind: "kinase", step: 2, where: "Receptor C-terminal tail (cytosolic)", role: "Each receptor in the dimer phosphorylates tyrosines on the other.", mechanism: "The active kinase transfers phosphate from ATP to tyrosine residues in the receptor's tail (trans-autophosphorylation). The phosphotyrosines become docking sites.", offState: "tail unphosphorylated", onState: "tail tyrosines phosphorylated (docking sites)", requires: ["rec"], terminatedBy: "ptp", pos: [1, 2] },
    { id: "grb", label: "Grb2 adaptor", kind: "adapter", step: 3, where: "Recruited to the receptor tail", role: "An adaptor with an SH2 domain that binds phosphotyrosine and an SH3 domain that binds SOS.", mechanism: "Its SH2 domain binds a phosphotyrosine on the receptor (directly or through Shc), recruiting Grb2 to the membrane.", offState: "free in the cytosol", onState: "bound to phosphotyrosine", requires: ["pty"], pos: [1, 3] },
    { id: "sos", label: "SOS (Ras GEF)", kind: "enzyme", step: 4, where: "Recruited to the membrane by Grb2", role: "A guanine-nucleotide exchange factor for Ras.", mechanism: "Grb2 brings SOS next to membrane-anchored Ras, where SOS promotes GDP release.", offState: "cytosolic, away from Ras", onState: "at the membrane next to Ras", requires: ["grb"], pos: [1, 4] },
    { id: "ras", label: "Ras", kind: "gprotein", step: 5, where: "Inner face of the plasma membrane", role: "A small GTPase that switches between GDP-bound (off) and GTP-bound (on).", mechanism: "SOS lets Ras release GDP and bind GTP. Ras·GTP can bind Raf.", offState: "Ras·GDP (inactive)", onState: "Ras·GTP (active)", requires: ["sos"], terminatedBy: "rasgap", amplifies: true, pos: [1, 5] },
    { id: "raf", label: "Raf kinase", kind: "kinase", step: 6, where: "Recruited to the membrane by Ras·GTP", role: "First kinase of the MAP kinase cascade (MAPKKK).", mechanism: "Ras·GTP binds Raf, recruiting it to the membrane where it is activated.", offState: "cytosolic, autoinhibited", onState: "active at the membrane", requires: ["ras"], pos: [1, 6] },
    { id: "mek", label: "MEK", kind: "kinase", step: 7, where: "Cytosol", role: "A dual-specificity kinase (MAPKK).", mechanism: "Raf phosphorylates MEK on two serines in its activation loop.", offState: "unphosphorylated", onState: "phosphorylated (active)", requires: ["raf"], amplifies: true, pos: [1, 7] },
    { id: "erk", label: "ERK", kind: "kinase", step: 8, where: "Cytosol, then nucleus", role: "A MAP kinase (MAPK).", mechanism: "MEK phosphorylates ERK on a threonine and a tyrosine in its activation loop.", offState: "unphosphorylated", onState: "dually phosphorylated (active)", requires: ["mek"], terminatedBy: "dusp", amplifies: true, pos: [1, 8] },
    { id: "tgt", label: "ERK substrates", kind: "output", step: 9, where: "Cytosol and nucleus", role: "Proteins phosphorylated by ERK, including transcription factors such as Elk-1.", mechanism: "Active ERK phosphorylates substrates; some change gene expression. What the cell then does depends on cell type and context.", offState: "not phosphorylated by ERK", onState: "phosphorylated (cellular outcome context-dependent)", requires: ["erk"], pos: [1, 9] },
    T("ptp", "Phosphotyrosine phosphatases", "Phosphatases remove phosphate from receptor tyrosines.", [2, 2]),
    T("rasgap", "Ras GAP", "A GTPase-activating protein (for example NF1 or p120GAP) stimulates Ras to hydrolyze GTP.", [2, 5]),
    T("dusp", "MAPK phosphatases (DUSPs)", "Dual-specificity phosphatases dephosphorylate ERK.", [2, 8]),
    T("fb", "Negative feedback", "Receptor internalization and ERK feedback onto upstream components reduce signalling during prolonged stimulation.", [2, 1]),
  ],
  perturbations: [
    { id: "rec-nobind", label: "Receptor cannot bind ligand", kind: "block", target: "rec", explanation: "EGFR never dimerizes." },
    { id: "egfr-tki", label: "EGFR kinase inhibitor", kind: "block", target: "pty", explanation: "EGFR may dimerize, but without kinase activity there is no autophosphorylation and no docking sites.", example: "gefitinib or erlotinib block the ATP site" },
    { id: "grb-block", label: "Grb2 cannot bind phosphotyrosine", kind: "block", target: "grb", explanation: "The receptor is phosphorylated but cannot recruit SOS through Grb2 in this route." },
    { id: "ras-g12v", label: "Constitutively active Ras (G12V-type)", kind: "constitutive", target: "ras", explanation: "Ras cannot hydrolyze GTP efficiently, so it stays GTP-bound whether or not EGF is present.", example: "oncogenic RAS mutations" },
    { id: "raf-inhib", label: "Raf inhibited", kind: "block", target: "raf", explanation: "Ras may be active, but Raf does not phosphorylate MEK." },
    { id: "mek-inhib", label: "MEK inhibitor", kind: "block", target: "mek", explanation: "Everything upstream can be active; ERK is not phosphorylated.", example: "trametinib" },
    { id: "ptp-block", label: "Phosphotyrosine phosphatases inhibited", kind: "block", target: "ptp", explanation: "Receptor phosphotyrosines are not removed after the ligand is gone." },
    { id: "rasgap-block", label: "Ras GAP lost", kind: "block", target: "rasgap", explanation: "Ras·GTP is not switched off efficiently." },
    { id: "dusp-block", label: "ERK phosphatases inhibited", kind: "block", target: "dusp", explanation: "Phosphorylated ERK persists after the signal stops." },
    { id: "fb-block", label: "Negative feedback lost", kind: "block", target: "fb", explanation: "The signal is not attenuated during prolonged stimulation." },
  ],
};

const LGIC: SigSystem = {
  id: "lgic", label: "Ligand-gated ion channel (receptor and channel in one)", receptorClass: "Ligand-gated ion channel", example: "nicotinic acetylcholine receptor at the skeletal-muscle end plate",
  summary: "The receptor is itself an ion channel. Ligand binding opens the pore directly, with no G protein, second messenger or kinase cascade.",
  ligandId: "lig", steps: 4, membraneRow: 1, keyNodes: ["rec", "flux", "resp"],
  limits: "Only one fast ionotropic receptor is shown. Receptor desensitization, subunit composition and the end-plate's size relative to the threshold for a muscle action potential are not modelled.",
  nodes: [
    { id: "lig", label: "Acetylcholine", kind: "ligand", step: 1, where: "Synaptic cleft", role: "The neurotransmitter that binds the receptor.", mechanism: "Acetylcholine binds sites on the extracellular part of the receptor.", offState: "absent", onState: "present and bound", requires: [], terminatedBy: "ache", pos: [1, 0] },
    { id: "rec", label: "Nicotinic receptor (channel)", kind: "channel", step: 2, where: "Postsynaptic membrane", role: "A pentameric ligand-gated cation channel.", mechanism: "Binding changes the receptor's conformation and opens the central pore.", offState: "pore closed", onState: "pore open", requires: ["lig"], pos: [1, 1] },
    { id: "flux", label: "Cation flux", kind: "effector", step: 3, where: "Through the open pore", role: "Na⁺ and K⁺ pass through the pore, each down its electrochemical gradient.", mechanism: "At a resting membrane voltage the net movement is inward Na⁺ (K⁺ moves out), because the pore's reversal potential is near 0 mV.", offState: "no flow", onState: "net inward Na⁺ at resting voltage", requires: ["rec"], pos: [1, 2] },
    { id: "resp", label: "Postsynaptic depolarization", kind: "output", step: 4, where: "Postsynaptic membrane", role: "The membrane voltage moves toward the pore's reversal potential.", mechanism: "Net inward current depolarizes the membrane (an excitatory postsynaptic potential).", offState: "resting voltage", onState: "depolarized", requires: ["flux"], pos: [1, 3] },
    T("ache", "Acetylcholinesterase", "The enzyme hydrolyzes acetylcholine in the cleft and ends the signal.", [2, 0]),
  ],
  perturbations: [
    { id: "rec-nobind", label: "Receptor cannot bind ligand", kind: "block", target: "rec", explanation: "A competitive antagonist or binding-site change keeps the pore closed.", example: "a curare-like competitive antagonist" },
    { id: "pore-block", label: "Pore blocked", kind: "block", target: "flux", explanation: "The receptor opens but no ions pass." },
    { id: "ache-block", label: "Acetylcholinesterase inhibited", kind: "block", target: "ache", explanation: "Acetylcholine is not broken down, so it can keep acting after release stops." },
  ],
};

const NUCLEAR: SigSystem = {
  id: "nuclear", label: "Intracellular (nuclear) receptor", receptorClass: "Intracellular receptor", example: "a steroid hormone receptor such as the glucocorticoid receptor",
  summary: "A lipid-soluble hormone crosses the plasma membrane and binds a receptor inside the cell. The receptor moves to the nucleus, binds DNA and changes gene transcription.",
  ligandId: "lig", steps: 5, membraneRow: 0, keyNodes: ["rec", "nuc", "dna", "tx"],
  limits: "This is a general steroid-receptor route. Some nuclear receptors are already in the nucleus, and each receptor regulates its own set of genes, some up and some down. The speed (minutes to hours) is stated qualitatively.",
  nodes: [
    { id: "lig", label: "Steroid hormone", kind: "ligand", step: 1, where: "Crosses the plasma membrane", role: "A lipid-soluble ligand that diffuses through the bilayer without a surface receptor.", mechanism: "Being hydrophobic, the hormone passes through the lipid bilayer into the cytosol.", offState: "absent", onState: "present inside the cell", requires: [], terminatedBy: "clear", pos: [1, 0] },
    { id: "rec", label: "Cytoplasmic receptor", kind: "receptor", step: 2, where: "Cytosol (with chaperone proteins)", role: "A ligand-regulated transcription factor.", mechanism: "Hormone binding releases chaperone proteins such as HSP90 and exposes the receptor's nuclear-localization and dimerization regions.", offState: "unbound, held by chaperones", onState: "hormone-bound, chaperones released", requires: ["lig"], pos: [1, 1] },
    { id: "nuc", label: "Nuclear translocation", kind: "effector", step: 3, where: "Nuclear pore", role: "The activated receptor enters the nucleus.", mechanism: "The hormone-bound receptor (as a dimer) is imported through nuclear pores.", offState: "in the cytosol", onState: "in the nucleus", requires: ["rec"], pos: [1, 2] },
    { id: "dna", label: "DNA binding", kind: "effector", step: 4, where: "Nucleus", role: "The receptor binds specific hormone response elements in DNA.", mechanism: "The DNA-binding domain recognizes hormone response elements near target genes and recruits co-regulators.", offState: "not bound to response elements", onState: "bound to response elements", requires: ["nuc"], pos: [1, 3] },
    { id: "tx", label: "Altered transcription", kind: "output", step: 5, where: "Nucleus", role: "Transcription of target genes is increased or decreased, depending on the gene.", mechanism: "Bound receptor and co-regulators change how often RNA polymerase transcribes target genes. The response takes minutes to hours.", offState: "unchanged", onState: "changed (up or down, gene-specific)", requires: ["dna"], pos: [1, 4] },
    T("clear", "Hormone metabolism / clearance", "Metabolism and clearance lower the hormone level, so the receptor releases ligand.", [2, 0]),
  ],
  perturbations: [
    { id: "rec-nobind", label: "Receptor cannot bind hormone", kind: "block", target: "rec", explanation: "An antagonist or mutation prevents activation." },
    { id: "nuc-block", label: "Nuclear import blocked", kind: "block", target: "nuc", explanation: "The activated receptor cannot reach DNA." },
    { id: "dna-block", label: "DNA-binding domain defective", kind: "block", target: "dna", explanation: "The receptor enters the nucleus but cannot bind response elements." },
    { id: "clear-block", label: "Hormone clearance blocked", kind: "block", target: "clear", explanation: "The hormone persists, so the receptor stays active after supply stops." },
  ],
};

export const SYSTEMS: Record<SystemId, SigSystem> = { gs: GS, gi: GI, gq: GQ, rtk: RTK, lgic: LGIC, nuclear: NUCLEAR };

// ---- input and validation ------------------------------------------------------------------------------------------------------

export interface SignalingInput {
  system: SystemId;
  ligand: boolean;
  /** Gi system only: the optional Gs-coupled co-stimulus. */
  coLigand: boolean;
  perturbations: string[];
  phase: Phase;
  step: number;
}
export const MAX_PERTURBATIONS = 3;
export const DEFAULT_SIGNALING: SignalingInput = { system: "gs", ligand: true, coLigand: false, perturbations: [], phase: "acute", step: 0 };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateSignaling(raw: unknown): Checked<SignalingInput> {
  if (!isObject(raw)) return { ok: false, error: "Signaling state must be an object." };
  if (typeof raw.system !== "string" || !(SYSTEM_IDS as readonly string[]).includes(raw.system)) return { ok: false, error: "Unknown signaling system." };
  const sys = SYSTEMS[raw.system as SystemId];
  if (typeof raw.ligand !== "boolean" || typeof raw.coLigand !== "boolean") return { ok: false, error: "Ligand switches must be true or false." };
  if (raw.coLigand && !sys.coLigandId) return { ok: false, error: "This system has no second ligand." };
  if (typeof raw.phase !== "string" || !(PHASES as readonly string[]).includes(raw.phase)) return { ok: false, error: "Unknown phase." };
  if (!Array.isArray(raw.perturbations) || raw.perturbations.length > MAX_PERTURBATIONS) return { ok: false, error: `At most ${MAX_PERTURBATIONS} perturbations.` };
  const seen = new Set<string>();
  const blocked = new Set<string>(), constitutive = new Set<string>();
  for (const p of raw.perturbations) {
    if (typeof p !== "string" || seen.has(p)) return { ok: false, error: "Perturbations must be unique ids." };
    const def = sys.perturbations.find((x) => x.id === p);
    if (!def) return { ok: false, error: `Perturbation "${String(p)}" is not supported for this system.` };
    seen.add(p);
    (def.kind === "block" ? blocked : constitutive).add(def.target);
  }
  for (const t of constitutive) if (blocked.has(t)) return { ok: false, error: "A component cannot be both blocked and constitutively active." };
  if (typeof raw.step !== "number" || !Number.isInteger(raw.step) || raw.step < 0 || raw.step > sys.steps) return { ok: false, error: "Step out of range." };
  return { ok: true, value: { system: raw.system as SystemId, ligand: raw.ligand, coLigand: raw.coLigand, perturbations: [...raw.perturbations as string[]], phase: raw.phase as Phase, step: raw.step } };
}

// ---- evaluation ----------------------------------------------------------------------------------------------------------------

export type Statuses = Record<string, Status>;
export interface Evaluation {
  system: SigSystem;
  acute: Statuses; prolonged: Statuses; removed: Statuses;
  /** The statuses of the selected phase. */
  current: Statuses;
  /** Nodes whose activation event has been reached (all of them outside the acute phase). */
  reached: Record<string, boolean>;
  blocked: string[]; constitutive: string[];
}

function targets(sys: SigSystem, ids: string[]) {
  const blocked = new Set<string>(), constitutive = new Set<string>();
  for (const id of ids) { const d = sys.perturbations.find((x) => x.id === id); if (d) (d.kind === "block" ? blocked : constitutive).add(d.target); }
  return { blocked, constitutive };
}

function evalPhase(sys: SigSystem, input: SignalingInput, phase: Phase, acute: Statuses | null, blockedSet: Set<string>, constitutive: Set<string>): Statuses {
  const st: Statuses = {};
  const byId = new Map(sys.nodes.map((n) => [n.id, n]));
  for (const n of sys.nodes) {
    if (n.kind === "terminator") { st[n.id] = blockedSet.has(n.id) ? "blocked" : "active"; continue; }
    const present = n.id === sys.ligandId ? input.ligand : n.id === sys.coLigandId ? input.coLigand : null;
    const persistsBy = n.terminatedBy && blockedSet.has(n.terminatedBy) && acute && isOn(acute[n.id]);
    if (n.kind === "ligand") {
      const on = phase === "removed" ? Boolean(persistsBy) : Boolean(present);
      st[n.id] = on ? (phase === "removed" ? "persisting" : "active") : "inactive";
      continue;
    }
    if (blockedSet.has(n.id)) { st[n.id] = "blocked"; continue; }
    const driven = n.requires.every((r) => isOn(st[r])) && !(n.suppressedBy ?? []).some((s) => isOn(st[s]));
    if (constitutive.has(n.id)) { st[n.id] = "active"; continue; }
    if (phase === "removed") {
      if (persistsBy) { st[n.id] = "persisting"; continue; }
      st[n.id] = driven ? (n.requires.some((r) => st[r] === "persisting") ? "persisting" : "active") : "inactive";
      continue;
    }
    if (!driven) { st[n.id] = "inactive"; continue; }
    if (phase === "prolonged") {
      const att = n.attenuatedBy && !blockedSet.has(n.attenuatedBy) && byId.has(n.attenuatedBy);
      st[n.id] = att || n.requires.some((r) => st[r] === "attenuated") ? "attenuated" : "active";
      continue;
    }
    st[n.id] = "active";
  }
  return st;
}

export function evaluateSignaling(input: SignalingInput): Evaluation {
  const sys = SYSTEMS[input.system];
  const { blocked, constitutive } = targets(sys, input.perturbations);
  const acute = evalPhase(sys, input, "acute", null, blocked, constitutive);
  const prolonged = evalPhase(sys, input, "prolonged", acute, blocked, constitutive);
  const removed = evalPhase(sys, input, "removed", acute, blocked, constitutive);
  const current = input.phase === "acute" ? acute : input.phase === "prolonged" ? prolonged : removed;
  const reached: Record<string, boolean> = {};
  for (const n of sys.nodes) reached[n.id] = input.phase !== "acute" || n.kind === "terminator" || n.step <= input.step;
  return { system: sys, acute, prolonged, removed, current, reached, blocked: [...blocked], constitutive: [...constitutive] };
}

/** The state of a node as shown: not-yet-reached nodes show their resting state, and the text states what the status means. */
export function nodeStateText(sys: SigSystem, id: string, ev: Evaluation): string {
  const n = sys.nodes.find((x) => x.id === id);
  if (!n) throw new RangeError(`Unknown node ${id}`);
  const s = ev.current[id];
  if (n.kind === "terminator") return s === "blocked" ? "blocked or lost" : "functional";
  if (!ev.reached[id]) return `${n.offState} (not reached yet)`;
  if (s === "blocked") return `blocked: ${n.offState}`;
  if (s === "attenuated") return `${n.onState}, attenuated by feedback or desensitization`;
  if (s === "persisting") return `${n.onState}, persisting because its termination step is blocked or it is constitutively active`;
  if (s === "active") {
    if (ev.constitutive.includes(id)) return `${n.onState} (constitutively active)`;
    return n.onState;
  }
  // inactive: describe the cAMP / adenylyl cyclase context in the Gi system
  if (sys.id === "gi" && (id === "ac" || id === "camp")) {
    const giOn = isOn(ev.current.gp);
    if (id === "ac") return giOn ? "inhibited by Gαi·GTP (basal output lowered)" : n.offState;
    return giOn ? "not elevated (Gαi·GTP lowers production)" : n.offState;
  }
  return n.offState;
}
/** Gi system: how Gαi·GTP modifies a stimulated adenylyl cyclase. */
export function acContext(ev: Evaluation): "blocked" | "basal" | "stimulated" | "stimulated-opposed" | "inhibited" | null {
  if (ev.system.id !== "gi" && ev.system.id !== "gs") return null;
  const ac = ev.current.ac;
  if (ac === "blocked") return "blocked";
  const stim = isOn(ac);
  const opp = ev.system.id === "gi" && isOn(ev.current.gp);
  return stim ? (opp ? "stimulated-opposed" : "stimulated") : opp ? "inhibited" : "basal";
}

export function eventCaption(sys: SigSystem, ev: Evaluation, step: number): { title: string; text: string } {
  if (ev.system !== sys) throw new RangeError("Evaluation belongs to another system");
  if (step === 0) return { title: "Resting state", text: `Before any signal: every component of the ${sys.receptorClass.toLowerCase()} pathway is in its resting state.` };
  const here = sys.nodes.filter((n) => n.step === step && n.kind !== "terminator");
  const title = here.map((n) => n.label).join(" and ");
  const parts = here.map((n) => {
    const s = ev.acute[n.id];
    if (s === "blocked") return `${n.label} is blocked here, so it cannot act: ${n.mechanism.charAt(0).toLowerCase()}${n.mechanism.slice(1)} does not occur.`;
    if (!isOn(s)) {
      const missing = n.requires.filter((r) => !isOn(ev.acute[r]));
      return missing.length ? `${n.label} stays inactive because ${missing.map((m) => sys.nodes.find((x) => x.id === m)!.label).join(" and ")} ${missing.length > 1 ? "are" : "is"} not active.` : `${n.label} stays inactive.`;
    }
    return ev.constitutive.includes(n.id) ? `${n.label} is constitutively active, independent of its normal input. ${n.mechanism}` : n.mechanism;
  });
  return { title, text: parts.join(" ") };
}

export interface NodeChange { id: string; label: string; from: Status; to: Status }
export interface PerturbationEffect {
  changed: NodeChange[];
  statements: string[];
  uncertain: string;
}
export const UNCERTAIN_DOWNSTREAM =
  "These are the direct consequences of the modelled mechanism. Effects on cell proliferation, differentiation, survival, secretion or behaviour depend on the cell type, the duration of the signal and other pathways, and are not predicted here.";

/** Differences caused by the chosen perturbations, in the selected phase, compared with the unperturbed pathway. */
export function perturbationEffect(input: SignalingInput): PerturbationEffect {
  const base = evaluateSignaling({ ...input, perturbations: [] });
  const cur = evaluateSignaling(input);
  const sys = cur.system;
  const changed: NodeChange[] = [];
  for (const n of sys.nodes) {
    const a = base.current[n.id], b = cur.current[n.id];
    if (a !== b) changed.push({ id: n.id, label: n.label, from: a, to: b });
  }
  const statements: string[] = [];
  for (const id of input.perturbations) {
    const p = sys.perturbations.find((x) => x.id === id)!;
    statements.push(`${p.label}: ${p.explanation}`);
  }
  for (const c of changed) {
    const node = sys.nodes.find((n) => n.id === c.id)!;
    if (node.kind === "terminator") continue;
    statements.push(`${c.label}: ${c.from} → ${c.to}.`);
  }
  return { changed, statements, uncertain: UNCERTAIN_DOWNSTREAM };
}

export const AMPLIFICATION_NOTE =
  "Many steps are enzymes or switches that stay on long enough to act on many targets, so one activated receptor can lead to a large downstream response. This model marks which steps can amplify but gives no amplification factor, because that would need rate constants and concentrations.";

export const TERMINATION_SUMMARY: Record<SystemId, string[]> = {
  gs: ["Gαs hydrolyzes GTP to GDP (intrinsic GTPase) and rejoins Gβγ.", "Phosphodiesterase converts cAMP to 5′-AMP.", "Phosphatases remove phosphates added by PKA.", "GRK and β-arrestin desensitize the receptor during prolonged exposure."],
  gi: ["Each Gα hydrolyzes its GTP.", "Phosphodiesterase removes cAMP."],
  gq: ["Gαq hydrolyzes GTP (PLC-β accelerates this).", "IP₃ is dephosphorylated or phosphorylated into inactive forms.", "DAG kinase converts DAG to phosphatidic acid.", "SERCA and PMCA pumps remove cytosolic Ca²⁺."],
  rtk: ["Phosphotyrosine phosphatases dephosphorylate the receptor.", "Ras GAPs stimulate Ras GTP hydrolysis.", "DUSPs dephosphorylate ERK.", "Receptor internalization and feedback attenuate signalling."],
  lgic: ["Acetylcholinesterase degrades acetylcholine, so the pore closes."],
  nuclear: ["Hormone metabolism and clearance lower the ligand level; the receptor then releases hormone."],
};

export interface ReceptorClass { id: string; name: string; location: string; ligand: string; activation: string; transmission: string; speed: string; system: SystemId }
export const RECEPTOR_CLASSES: ReceptorClass[] = [
  { id: "gpcr", name: "G-protein-coupled receptor", location: "Plasma membrane", ligand: "Hormones, neurotransmitters, odorants, light (rhodopsin)", activation: "Ligand binding changes the receptor's shape so it acts as a GEF for a heterotrimeric G protein.", transmission: "G protein → effector enzyme or channel → second messengers.", speed: "Fast (seconds)", system: "gs" },
  { id: "rtk", name: "Receptor tyrosine kinase", location: "Plasma membrane", ligand: "Growth factors, insulin", activation: "Ligand binding brings kinase domains together (often dimerization) and they phosphorylate tyrosines. Details differ between receptors.", transmission: "Phosphotyrosines recruit adaptor and signalling proteins, and cascades such as Ras–MAPK follow.", speed: "Seconds to minutes", system: "rtk" },
  { id: "lgic", name: "Ligand-gated ion channel", location: "Plasma membrane", ligand: "Neurotransmitters such as acetylcholine, glutamate, GABA", activation: "Ligand binding opens the receptor's own pore.", transmission: "Ion flux changes the membrane voltage directly.", speed: "Very fast (milliseconds)", system: "lgic" },
  { id: "nuclear", name: "Intracellular receptor", location: "Cytosol or nucleus", ligand: "Lipid-soluble hormones (steroids, thyroid hormone)", activation: "The ligand crosses the membrane and binds the receptor, which is a ligand-regulated transcription factor.", transmission: "The receptor binds DNA and changes gene transcription.", speed: "Slow (minutes to hours)", system: "nuclear" },
];
