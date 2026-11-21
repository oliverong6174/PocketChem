/**
 * Stage 26 / Tool 1: Organelles and protein trafficking.
 *
 * A curated TRANSPORT GRAPH: compartments, the transitions that are allowed between them (each with its machinery), and six curated cargo routes
 * whose steps must follow those transitions. Outcomes of perturbations are DERIVED by walking the route and stopping or detouring at a gated step.
 * Coordinates are schematic layout positions for the diagram, not measured organelle sizes or positions. Nothing here predicts the localisation of
 * an arbitrary sequence, and no clinical phenotype is attached to any perturbation.
 */
import { evaluateGraph, pertById, type Checked, type Evidence, type Outcome, type Perturbation, type RegGraph, all, any, not } from "./mechanism26";

// ================================================================ compartments ================================================================

export type CompartmentId =
  | "cytosol" | "nucleus" | "npc" | "er" | "v-copii" | "v-copi" | "golgi-cis" | "golgi-medial" | "golgi-trans" | "v-secretory" | "v-clathrin" | "v-endocytic" | "v-recycling"
  | "pm" | "extracellular" | "early-endo" | "late-endo" | "lysosome" | "mito-ims" | "mito-matrix" | "proteasome";

export interface Compartment { id: CompartmentId; name: string; kind: "organelle" | "vesicle" | "cytosolic" | "extracellular" | "pore" | "membrane"; organelle: string; x: number; y: number }
/** Layout coordinates in the 900 × 580 cell diagram. Schematic only. */
export const COMPARTMENTS: readonly Compartment[] = [
  { id: "cytosol", name: "Cytosol", kind: "cytosolic", organelle: "cytosol", x: 400, y: 420 },
  { id: "nucleus", name: "Nucleus (nucleoplasm)", kind: "organelle", organelle: "nucleus", x: 170, y: 220 },
  { id: "npc", name: "Nuclear pore complex", kind: "pore", organelle: "nuclear-pore", x: 275, y: 250 },
  { id: "er", name: "Endoplasmic reticulum (lumen and membrane)", kind: "organelle", organelle: "rough-er", x: 400, y: 245 },
  { id: "v-copii", name: "COPII-coated carrier (ER exit)", kind: "vesicle", organelle: "golgi", x: 470, y: 215 },
  { id: "v-copi", name: "COPI-coated carrier (retrograde)", kind: "vesicle", organelle: "golgi", x: 470, y: 290 },
  { id: "golgi-cis", name: "cis-Golgi", kind: "organelle", organelle: "golgi", x: 525, y: 205 },
  { id: "golgi-medial", name: "medial-Golgi", kind: "organelle", organelle: "golgi", x: 565, y: 185 },
  { id: "golgi-trans", name: "trans-Golgi network", kind: "organelle", organelle: "golgi", x: 605, y: 165 },
  { id: "v-secretory", name: "Secretory carrier", kind: "vesicle", organelle: "golgi", x: 690, y: 130 },
  { id: "v-clathrin", name: "Clathrin/AP-1-coated carrier", kind: "vesicle", organelle: "endosome", x: 650, y: 265 },
  { id: "v-endocytic", name: "Clathrin/AP-2-coated endocytic vesicle", kind: "vesicle", organelle: "endosome", x: 790, y: 270 },
  { id: "v-recycling", name: "Recycling carrier", kind: "vesicle", organelle: "endosome", x: 800, y: 340 },
  { id: "pm", name: "Plasma membrane", kind: "membrane", organelle: "plasma-membrane", x: 800, y: 200 },
  { id: "extracellular", name: "Extracellular space", kind: "extracellular", organelle: "plasma-membrane", x: 862, y: 200 },
  { id: "early-endo", name: "Early (sorting) endosome", kind: "organelle", organelle: "endosome", x: 745, y: 330 },
  { id: "late-endo", name: "Late endosome", kind: "organelle", organelle: "endosome", x: 690, y: 395 },
  { id: "lysosome", name: "Lysosome", kind: "organelle", organelle: "lysosome", x: 610, y: 470 },
  { id: "mito-ims", name: "Mitochondrial intermembrane space", kind: "organelle", organelle: "mitochondrion", x: 135, y: 455 },
  { id: "mito-matrix", name: "Mitochondrial matrix", kind: "organelle", organelle: "mitochondrion", x: 215, y: 485 },
  { id: "proteasome", name: "Proteasome (cytosol)", kind: "cytosolic", organelle: "cytosol", x: 480, y: 410 },
];
export const compartmentOf = (id: CompartmentId): Compartment => COMPARTMENTS.find((c) => c.id === id)!;

/** Which side of a membrane-embedded domain corresponds to the lumen/extracellular face at each location: used to show that membrane topology never flips. */
export const LUMENAL_FACE: Partial<Record<CompartmentId, string>> = {
  er: "ER lumen", "v-copii": "carrier lumen", "golgi-cis": "Golgi lumen", "golgi-medial": "Golgi lumen", "golgi-trans": "Golgi lumen", "v-secretory": "carrier lumen",
  pm: "extracellular space", "v-clathrin": "carrier lumen", "early-endo": "endosome lumen", "late-endo": "endosome lumen", lysosome: "lysosome lumen",
};

// ================================================================ transitions ================================================================

export type TransitionKind = "translocation" | "vesicle" | "pore" | "import" | "fusion" | "maturation" | "retrotranslocation" | "release";
export interface Transition { id: string; from: CompartmentId; to: CompartmentId; kind: TransitionKind; machinery: string[]; note: string }
export const TRANSITIONS: readonly Transition[] = [
  { id: "srp-targeting", from: "cytosol", to: "er", kind: "translocation", machinery: ["SRP", "SRP receptor", "Sec61 translocon"], note: "Co-translational: the ribosome docks on the Sec61 channel and the chain is threaded as it is made." },
  { id: "copii-budding", from: "er", to: "v-copii", kind: "vesicle", machinery: ["Sar1-GTP", "Sec23/Sec24", "Sec13/Sec31"], note: "COPII coat assembles at ER exit sites and selects cargo." },
  { id: "copii-fusion", from: "v-copii", to: "golgi-cis", kind: "fusion", machinery: ["Rab1", "tethers", "SNAREs"], note: "Carriers tether, dock and fuse with the ER–Golgi intermediate/cis-Golgi." },
  { id: "cisternal-1", from: "golgi-cis", to: "golgi-medial", kind: "maturation", machinery: ["cisternal maturation", "COPI recycling of Golgi enzymes"], note: "Mechanism of intra-Golgi transfer (cisternal maturation versus vesicular shuttling) is still debated; the order of processing is not." },
  { id: "cisternal-2", from: "golgi-medial", to: "golgi-trans", kind: "maturation", machinery: ["cisternal maturation"], note: "Cargo reaches the trans-Golgi network, the main sorting station." },
  { id: "tgn-secretory", from: "golgi-trans", to: "v-secretory", kind: "vesicle", machinery: ["TGN carrier formation"], note: "Default (constitutive) route for cargo with no other sorting signal." },
  { id: "exocytosis-soluble", from: "v-secretory", to: "extracellular", kind: "fusion", machinery: ["Rab GTPases", "SNAREs"], note: "Fusion releases the soluble contents outside the cell." },
  { id: "exocytosis-membrane", from: "v-secretory", to: "pm", kind: "fusion", machinery: ["Rab GTPases", "SNAREs"], note: "Fusion adds the carrier membrane to the plasma membrane; the lumenal face becomes the extracellular face." },
  { id: "tgn-clathrin", from: "golgi-trans", to: "v-clathrin", kind: "vesicle", machinery: ["Arf1", "AP-1/GGA", "clathrin"], note: "Cargo carrying a sorting signal (for example mannose 6-phosphate receptors) is packaged here." },
  { id: "clathrin-endosome", from: "v-clathrin", to: "late-endo", kind: "fusion", machinery: ["Rab GTPases", "tethers", "SNAREs"], note: "Carriers deliver to endosomes (the early/late endosome boundary is a continuum)." },
  { id: "endosome-lysosome", from: "late-endo", to: "lysosome", kind: "maturation", machinery: ["Rab7", "HOPS tether", "SNAREs"], note: "Late endosomes fuse with or mature into lysosomes." },
  { id: "npc-docking", from: "cytosol", to: "npc", kind: "pore", machinery: ["importin-α/β", "FG-nucleoporins"], note: "The importin–cargo complex docks at the nuclear pore." },
  { id: "npc-translocation", from: "npc", to: "nucleus", kind: "import", machinery: ["FG-nucleoporin meshwork", "Ran-GTP gradient"], note: "Transport through the pore; directionality comes from the Ran-GTP gradient." },
  { id: "tom-translocation", from: "cytosol", to: "mito-ims", kind: "translocation", machinery: ["TOM20/TOM22 receptors", "TOM40 channel"], note: "Precursor crosses the outer membrane as an unfolded chain." },
  { id: "tim23-translocation", from: "mito-ims", to: "mito-matrix", kind: "translocation", machinery: ["TIM23 channel", "membrane potential", "mtHsp70 motor"], note: "Presequence is driven across the inner membrane by the membrane potential; the matrix motor pulls the rest." },
  { id: "pm-endocytosis", from: "pm", to: "v-endocytic", kind: "vesicle", machinery: ["AP-2", "clathrin", "dynamin"], note: "Clathrin-coated pits pinch off carrying receptors and bound ligands." },
  { id: "endocytic-early", from: "v-endocytic", to: "early-endo", kind: "fusion", machinery: ["Rab5", "EEA1", "SNAREs"], note: "Uncoated vesicles fuse with the early (sorting) endosome." },
  { id: "early-recycling", from: "early-endo", to: "v-recycling", kind: "vesicle", machinery: ["Rab4/Rab11", "sorting nexins"], note: "Receptors destined for reuse leave in recycling carriers." },
  { id: "recycling-pm", from: "v-recycling", to: "pm", kind: "fusion", machinery: ["Rab11", "SNAREs"], note: "Recycling carriers return membrane and receptors to the cell surface." },
  { id: "early-late", from: "early-endo", to: "late-endo", kind: "maturation", machinery: ["Rab5→Rab7 conversion"], note: "Maturation of the endosome; internal vesicles form (multivesicular body)." },
  { id: "late-tgn", from: "late-endo", to: "golgi-trans", kind: "vesicle", machinery: ["retromer"], note: "Receptors such as the mannose 6-phosphate receptor are retrieved to the TGN." },
  { id: "golgi-copi", from: "golgi-cis", to: "v-copi", kind: "vesicle", machinery: ["Arf1-GTP", "coatomer (COPI)"], note: "COPI retrieves escaped ER residents and recycles transport machinery." },
  { id: "copi-er", from: "v-copi", to: "er", kind: "fusion", machinery: ["Rab/tethers", "SNAREs"], note: "Retrograde carriers fuse with the ER." },
  { id: "er-erad", from: "er", to: "cytosol", kind: "retrotranslocation", machinery: ["Hrd1 E3 ligase", "p97/VCP"], note: "Misfolded proteins are returned to the cytosol for degradation." },
  { id: "cytosol-proteasome", from: "cytosol", to: "proteasome", kind: "release", machinery: ["polyubiquitin chain", "26S proteasome"], note: "Polyubiquitinated proteins are unfolded and degraded by the proteasome." },
];
export const transitionBetween = (from: CompartmentId, to: CompartmentId): Transition | undefined => TRANSITIONS.find((t) => t.from === from && t.to === to);
/** True when a direct move between two compartments exists in the transport graph. Anything else is an invalid compartment transition. */
export const isValidTransition = (from: CompartmentId, to: CompartmentId): boolean => from === to || !!transitionBetween(from, to);

// ================================================================ perturbations ================================================================

export type TraffPertId = "srp-disabled" | "er-export-impaired" | "nuclear-targeting-defective" | "ran-gradient-lost" | "m6p-blocked" | "mts-defective" | "mito-potential-lost";
export interface TraffPert { id: TraffPertId; label: string; explanation: string }
export const TRAFF_PERTURBATIONS: readonly TraffPert[] = [
  { id: "srp-disabled", label: "SRP recognition disabled", explanation: "The signal sequence is not recognised, so the ribosome is not delivered to the ER." },
  { id: "er-export-impaired", label: "ER export (COPII) impaired", explanation: "Cargo cannot leave the ER in COPII carriers." },
  { id: "nuclear-targeting-defective", label: "Nuclear targeting defective (NLS not recognised)", explanation: "The importin–NLS interaction fails, so the protein is not delivered to the nuclear pore." },
  { id: "ran-gradient-lost", label: "Ran-GTP gradient lost", explanation: "Without the nuclear Ran-GTP/cytosolic Ran-GDP gradient, import complexes cannot be dissociated in the nucleus and importins are not recycled." },
  { id: "m6p-blocked", label: "Mannose 6-phosphate tagging blocked", explanation: "Lysosomal hydrolases are not marked, so the TGN receptors cannot sort them." },
  { id: "mts-defective", label: "Mitochondrial targeting sequence defective", explanation: "The presequence is not recognised by the TOM receptors." },
  { id: "mito-potential-lost", label: "Mitochondrial membrane potential dissipated", explanation: "The inner-membrane potential that drives the presequence across the TIM23 channel is lost." },
];
export const TRAFF_PERT_IDS = TRAFF_PERTURBATIONS.map((p) => p.id);
export const MAX_TRAFF_PERTURBATIONS = 3;

// ================================================================ cargo routes ================================================================

export type CargoId = "cytosolic" | "secreted" | "membrane" | "lysosomal" | "nuclear" | "mitochondrial";
export interface RouteStep {
  id: string;
  title: string;
  /** Where the cargo is after this step. */
  at: CompartmentId;
  /** Required when `at` differs from the previous step's location: the transition used. */
  transition?: string;
  machinery: string[];
  /** Processing / folding state after this step. */
  processing: string;
  /** Direction of movement in this step. */
  direction: string;
  explanation: string;
  /** If this perturbation is active the cargo cannot take this step. */
  gate?: TraffPertId;
}
export interface Detour { gate: TraffPertId; outcome: string; steps: RouteStep[] }
export interface Cargo {
  id: CargoId;
  name: string;
  example: string;
  translatedAt: string;
  signal: string;
  recognition: string;
  routeSummary: string;
  destination: CompartmentId;
  destinationNote: string;
  membraneProtein: boolean;
  steps: RouteStep[];
  /** What happens when a gate is closed and the biology of the alternative is well established. Otherwise the cargo is simply retained. */
  detours: Detour[];
  evidence: Evidence;
  limits: string;
}

const S = (id: string, title: string, at: CompartmentId, machinery: string[], processing: string, direction: string, explanation: string, extra: Partial<RouteStep> = {}): RouteStep =>
  ({ id, title, at, machinery, processing, direction, explanation, ...extra });

const ER_LEG = (membrane: boolean): RouteStep[] => [
  S("recognise", "Signal recognised by SRP", "cytosol", ["Free ribosome", "SRP (SRP54 subunit)"], "Nascent chain with an exposed hydrophobic signal sequence; translation pauses", "None: recognition in the cytosol", "As the N-terminal signal sequence emerges from the ribosome, the signal recognition particle binds it and slows translation.", { gate: "srp-disabled" }),
  S("target", "Ribosome–SRP delivered to the Sec61 translocon", "er", ["SRP receptor", "Sec61 translocon"], "Ribosome docked on the ER membrane; SRP released", "Cytosol → ER membrane", "The SRP receptor on the ER membrane hands the ribosome to Sec61 and translation resumes into the channel.", { transition: "srp-targeting", gate: "srp-disabled" }),
  S("translocate", membrane ? "Signal sequence cleaved; transmembrane segment stops transfer" : "Chain threaded into the lumen; signal peptide cleaved", "er", membrane ? ["Sec61 lateral gate", "Signal peptidase"] : ["Sec61 channel", "Signal peptidase", "BiP"],
    membrane ? "Single-pass membrane protein: N-terminal domain in the ER lumen, hydrophobic transmembrane helix in the bilayer, C-terminal domain in the cytosol" : "Soluble chain in the ER lumen, signal peptide removed",
    "Cytosol → ER lumen (as it is synthesised)", membrane ? "A hydrophobic stop-transfer segment leaves the Sec61 channel sideways into the lipid bilayer, anchoring the protein with its lumenal domain on the lumenal side." : "The whole chain passes into the lumen and signal peptidase cleaves the signal sequence."),
  S("fold-qc", "Folding, N-glycosylation and quality control", "er", ["Oligosaccharyltransferase", "BiP and PDI", "Calnexin/calreticulin cycle"], "N-glycosylated, disulphide-bonded, folded; passes quality control", "None: in the ER", "Lumenal chaperones and enzymes fold the protein. Only correctly folded protein is allowed to leave; misfolded protein is retained (see Protein quality control)."),
  S("export", "Packaged into COPII carriers at ER exit sites", "v-copii", ["Sar1-GTP", "Sec23/Sec24 (cargo selection)", "Sec13/Sec31"], "Folded cargo selected into a budding vesicle", "ER → carrier", membrane ? "The Sec24 coat subunit binds export signals in the cytosolic domain of the membrane protein, so the cytosolic domain faces the coat." : "Soluble cargo is concentrated into COPII carriers, often by transmembrane cargo receptors.", { transition: "copii-budding", gate: "er-export-impaired" }),
  S("to-golgi", "Tethering, docking and fusion with the cis-Golgi", "golgi-cis", ["Rab1", "Tethers", "SNAREs (for example Sec22b with syntaxin 5)"], "Delivered to the cis-Golgi; the coat has been shed", "ER → Golgi (anterograde)", "The uncoated carrier tethers, docks and fuses, releasing soluble cargo into the Golgi lumen or adding membrane protein to the cisterna.", { transition: "copii-fusion" }),
  S("golgi", "Processing through the Golgi stack", "golgi-medial", ["Glycosidases and glycosyltransferases", "Cisternal maturation"], "N-glycans trimmed and extended (complex glycans)", "cis → medial", "Resident enzymes progressively trim and extend the N-linked glycans as the cargo moves across the stack.", { transition: "cisternal-1" }),
];

export const CARGOS: readonly Cargo[] = [
  {
    id: "cytosolic", name: "Cytosolic protein", example: "A glycolytic enzyme such as hexokinase", translatedAt: "Free ribosome in the cytosol",
    signal: "None (no signal sequence, no NLS, no MTS)", recognition: "None needed: with no targeting signal the default is to stay in the cytosol",
    routeSummary: "Synthesised and folded in the cytosol; it stays there.", destination: "cytosol", destinationNote: "Cytosol (the default when no signal is present)", membraneProtein: false, evidence: "established",
    limits: "Some cytosolic proteins carry a weak or conditional signal; this example has none.",
    steps: [
      S("translate", "Translated on a free ribosome", "cytosol", ["Free ribosome"], "Nascent chain; no signal sequence emerges", "None", "Translation of this mRNA begins on a ribosome that is not attached to any membrane."),
      S("fold", "Folded with chaperone help", "cytosol", ["Hsp70 / Hsp90 chaperones"], "Folded, functional enzyme", "None", "Cytosolic chaperones assist folding. Nothing recognises the protein for transport."),
      S("stay", "Remains in the cytosol", "cytosol", [], "Functional in the cytosol", "None", "Without a targeting signal the protein is not selected by any import or sorting machinery, so the cytosol is its destination."),
    ], detours: [],
  },
  {
    id: "secreted", name: "Secreted protein", example: "A soluble hormone or serum protein (for example a precursor of insulin)", translatedAt: "Free ribosome, then ER-bound (co-translational)",
    signal: "N-terminal hydrophobic signal sequence", recognition: "SRP and the SRP receptor, then Sec61",
    routeSummary: "ER → COPII carriers → Golgi → trans-Golgi network → secretory carriers → released outside the cell.", destination: "extracellular", destinationNote: "Extracellular space (soluble)", membraneProtein: false, evidence: "established",
    limits: "Regulated secretion (storage granules released on a signal) is not drawn; this is the constitutive route.",
    steps: [
      S("translate", "Translation starts on a free ribosome", "cytosol", ["Free ribosome"], "Nascent chain emerging", "None", "All eukaryotic protein synthesis starts on cytosolic ribosomes. The signal sequence decides whether the ribosome goes to the ER."),
      ...ER_LEG(false),
      S("tgn", "Sorted at the trans-Golgi network", "golgi-trans", ["TGN sorting"], "Mature glycoprotein with no extra sorting tag", "medial → trans", "No lysosomal or other sorting signal is present, so the protein follows the default pathway.", { transition: "cisternal-2" }),
      S("carrier", "Packaged into secretory carriers", "v-secretory", ["TGN carrier formation"], "Soluble cargo in a carrier lumen", "TGN → carrier", "Cargo is packaged into carriers destined for the cell surface.", { transition: "tgn-secretory" }),
      S("exocytose", "Exocytosis releases it outside the cell", "extracellular", ["Rab GTPases", "SNAREs"], "Soluble protein in the extracellular space", "Carrier → outside", "The carrier fuses with the plasma membrane and releases its contents.", { transition: "exocytosis-soluble" }),
    ], detours: [],
  },
  {
    id: "membrane", name: "Integral membrane protein", example: "A single-pass type I plasma-membrane receptor", translatedAt: "Free ribosome, then ER-bound (co-translational)",
    signal: "N-terminal signal sequence plus a hydrophobic stop-transfer (transmembrane) segment", recognition: "SRP and the SRP receptor, then Sec61 with its lateral gate",
    routeSummary: "ER membrane → COPII → Golgi → secretory carrier → plasma membrane, with the lumenal domain ending up outside the cell.", destination: "pm", destinationNote: "Plasma membrane, lumenal domain facing the extracellular space", membraneProtein: true, evidence: "established",
    limits: "Multi-pass and tail-anchored membrane proteins insert by other routes and are not modelled; the cargo is single-pass type I.",
    steps: [
      S("translate", "Translation starts on a free ribosome", "cytosol", ["Free ribosome"], "Nascent chain emerging", "None", "Synthesis starts in the cytosol; the signal sequence directs the ribosome to the ER."),
      ...ER_LEG(true),
      S("tgn", "Sorted at the trans-Golgi network", "golgi-trans", ["TGN sorting"], "Mature membrane glycoprotein", "medial → trans", "A plasma-membrane receptor with no endosomal/lysosomal signal follows the default route to the surface.", { transition: "cisternal-2" }),
      S("carrier", "Packaged into secretory carriers", "v-secretory", ["TGN carrier formation"], "Membrane protein in the carrier bilayer", "TGN → carrier", "The protein is now in the membrane of a carrier; its lumenal domain faces the carrier lumen.", { transition: "tgn-secretory" }),
      S("fuse", "Carrier fuses with the plasma membrane", "pm", ["Rab GTPases", "SNAREs"], "Receptor in the plasma membrane", "Carrier → cell surface", "After fusion the former lumenal face is outside the cell. The topology has been the same since insertion: the protein never flips.", { transition: "exocytosis-membrane" }),
    ], detours: [],
  },
  {
    id: "lysosomal", name: "Lysosomal hydrolase", example: "A soluble acid hydrolase such as a cathepsin or β-hexosaminidase", translatedAt: "Free ribosome, then ER-bound (co-translational)",
    signal: "N-terminal signal sequence, then a mannose 6-phosphate tag added in the Golgi", recognition: "SRP for the ER; GlcNAc-phosphotransferase in the cis-Golgi; mannose 6-phosphate receptors in the TGN",
    routeSummary: "ER → Golgi (M6P tag) → TGN receptors → clathrin/AP-1 carriers → endosomes → lysosome. Without the tag it follows the default secretory route.", destination: "lysosome", destinationNote: "Lysosome (acidic lumen)", membraneProtein: false, evidence: "established",
    limits: "Some lysosomal proteins use M6P-independent routes (for example via sortilin or LIMP-2); only the M6P pathway is shown.",
    steps: [
      S("translate", "Translation starts on a free ribosome", "cytosol", ["Free ribosome"], "Nascent chain emerging", "None", "A soluble hydrolase is made like a secreted protein: it first enters the ER."),
      ...ER_LEG(false),
      S("m6p-tag", "Mannose 6-phosphate tag added in the cis-Golgi", "golgi-medial", ["GlcNAc-1-phosphotransferase", "Uncovering enzyme"], "N-glycan carries mannose 6-phosphate", "Within the Golgi", "GlcNAc-phosphotransferase recognises the hydrolase and adds GlcNAc-phosphate to mannose; a second enzyme exposes the mannose 6-phosphate.", { gate: "m6p-blocked" }),
      S("tgn-bind", "M6P receptors bind the hydrolase in the TGN", "golgi-trans", ["Mannose 6-phosphate receptors (M6PR)"], "Receptor-bound hydrolase", "medial → trans", "Receptors in the TGN bind the exposed M6P groups, concentrating the hydrolase.", { transition: "cisternal-2", gate: "m6p-blocked" }),
      S("clathrin", "Packaged into clathrin/AP-1-coated carriers", "v-clathrin", ["Arf1", "AP-1 / GGA adaptors", "Clathrin"], "Hydrolase–receptor complexes in a carrier", "TGN → endosome-bound carrier", "AP-1/GGA adaptors bind the receptor tail and clathrin shapes the bud.", { transition: "tgn-clathrin", gate: "m6p-blocked" }),
      S("endosome", "Carrier fuses with an endosome; acid releases the hydrolase", "late-endo", ["Rab GTPases", "SNAREs", "V-ATPase acidification"], "Hydrolase released from the receptor; receptor retrieved to the TGN", "Carrier → late endosome", "The lower pH of the endosome weakens receptor binding. Receptors return to the TGN by retromer.", { transition: "clathrin-endosome", gate: "m6p-blocked" }),
      S("lysosome", "Delivered to the lysosome", "lysosome", ["Rab7", "HOPS", "SNAREs"], "Active acid hydrolase in the lysosome", "Late endosome → lysosome", "Endosomal contents are delivered to lysosomes, where the hydrolase works at acidic pH.", { transition: "endosome-lysosome", gate: "m6p-blocked" }),
    ],
    detours: [{
      gate: "m6p-blocked", outcome: "Without the M6P tag the hydrolase is not sorted at the TGN and follows the default secretory route to the outside of the cell.",
      steps: [
        S("default-tgn", "Reaches the TGN without an M6P tag", "golgi-trans", ["TGN"], "Untagged soluble glycoprotein", "medial → trans", "The enzyme still reaches the TGN, but no receptor binds it.", { transition: "cisternal-2" }),
        S("default-carrier", "No sorting tag: default secretory carrier", "v-secretory", ["TGN carrier formation"], "Untagged soluble protein in a secretory carrier", "TGN → carrier", "Without M6P, receptors do not capture the enzyme, so it is carried by default.", { transition: "tgn-secretory" }),
        S("default-exocytosis", "Secreted instead of reaching the lysosome", "extracellular", ["Rab GTPases", "SNAREs"], "Enzyme outside the cell", "Carrier → outside", "The hydrolase is released extracellularly. Clinical consequences are not modelled here.", { transition: "exocytosis-soluble" }),
      ],
    }],
  },
  {
    id: "nuclear", name: "Nuclear protein", example: "A transcription factor or histone with a basic nuclear localisation sequence", translatedAt: "Free ribosome in the cytosol (post-translational import)",
    signal: "Nuclear localisation sequence (NLS), commonly short basic stretches", recognition: "Importin-α (adaptor) with importin-β, FG-nucleoporins, Ran",
    routeSummary: "Made in the cytosol → importin–NLS complex → docks at the nuclear pore → passes through it → Ran-GTP releases the cargo in the nucleus.", destination: "nucleus", destinationNote: "Nucleus", membraneProtein: false, evidence: "established",
    limits: "Not all nuclear proteins use importin-α/β: other importins and signal-independent routes exist; this is the classical NLS pathway only.",
    steps: [
      S("translate", "Translated on a free ribosome", "cytosol", ["Free ribosome"], "Protein with an exposed NLS", "None", "Nuclear proteins are made in the cytosol and carry a signal that is read after synthesis."),
      S("bind", "NLS bound by importin-α/β in the cytosol", "cytosol", ["Importin-α", "Importin-β"], "Cargo–importin complex", "None: recognition", "Importin-α binds the NLS; importin-β binds importin-α and the pore proteins.", { gate: "nuclear-targeting-defective" }),
      S("dock", "Complex docks at the nuclear pore", "npc", ["FG-nucleoporins", "Importin-β"], "Cargo–importin complex in the pore", "Cytosol → nuclear pore", "Importin-β interacts with the FG repeats that fill the pore channel.", { transition: "npc-docking", gate: "nuclear-targeting-defective" }),
      S("pass", "Passes through the nuclear pore into the nucleus", "nucleus", ["FG-nucleoporin meshwork", "Ran-GTP gradient (high in the nucleus)"], "Folded cargo–importin complex in the nucleus", "Cytosol → nucleus", "The complex moves through the pore by facilitated diffusion; the Ran gradient makes the net direction inward.", { transition: "npc-translocation", gate: "ran-gradient-lost" }),
      S("release", "Ran-GTP binds importin-β and releases the cargo", "nucleus", ["Ran-GTP (made by RCC1)", "Importin-β"], "Free NLS-protein in the nucleus", "None", "Nuclear Ran-GTP binds importin-β and the complex falls apart. The importins return to the cytosol; cytosolic RanGAP converts Ran-GTP to Ran-GDP.", { gate: "ran-gradient-lost" }),
    ],
    detours: [],
  },
  {
    id: "mitochondrial", name: "Mitochondrial matrix protein", example: "A nuclear-encoded matrix enzyme with an N-terminal presequence", translatedAt: "Free ribosome in the cytosol (post-translational import)",
    signal: "N-terminal mitochondrial targeting sequence (amphipathic presequence)", recognition: "TOM20/TOM22 receptors, TOM40 channel, TIM23 channel",
    routeSummary: "Made in the cytosol → presequence recognised at the outer membrane → TOM → TIM23 (membrane potential) → matrix → presequence cleaved.", destination: "mito-matrix", destinationNote: "Mitochondrial matrix", membraneProtein: false, evidence: "established",
    limits: "Other mitochondrial classes (carrier proteins, β-barrel outer-membrane proteins, intermembrane-space proteins) use different machinery and are not shown.",
    steps: [
      S("translate", "Translated on a free ribosome", "cytosol", ["Free ribosome", "Hsp70/Hsp90 keep the chain unfolded"], "Unfolded precursor with a presequence", "None", "Precursors are kept import-competent (unfolded) by cytosolic chaperones."),
      S("recognise", "Presequence recognised by TOM receptors", "cytosol", ["TOM20", "TOM22"], "Precursor bound to the outer membrane", "None: recognition", "The amphipathic presequence binds the TOM receptors on the outer membrane.", { gate: "mts-defective" }),
      S("tom", "Crosses the outer membrane through TOM40", "mito-ims", ["TOM40 channel"], "Unfolded chain in the intermembrane space", "Cytosol → intermembrane space", "The presequence enters the TOM40 channel; the chain crosses as an unfolded polypeptide.", { transition: "tom-translocation", gate: "mts-defective" }),
      S("tim23", "Presequence pulled through TIM23 by the membrane potential", "mito-matrix", ["TIM23 channel", "Inner-membrane potential (negative in the matrix)", "mtHsp70 / ATP"], "Presequence in the matrix, chain being pulled in", "Intermembrane space → matrix", "The positively charged presequence is drawn across the inner membrane by the potential; mtHsp70 and ATP pull the rest of the chain.", { transition: "tim23-translocation", gate: "mito-potential-lost" }),
      S("process", "Presequence cleaved and the protein folds", "mito-matrix", ["Mitochondrial processing peptidase", "Hsp60"], "Mature, folded matrix protein", "None", "The processing peptidase removes the presequence and the chain folds in the matrix."),
    ],
    detours: [],
  },
];
export const cargoById = (id: CargoId): Cargo => CARGOS.find((c) => c.id === id)!;
export const CARGO_IDS: readonly CargoId[] = CARGOS.map((c) => c.id);

/** Structural validation of every route against the transport graph. Returns error strings (empty = all valid). */
export function validateRoutes(cargos: readonly Cargo[] = CARGOS, transitions: readonly Transition[] = TRANSITIONS): string[] {
  const errors: string[] = [];
  const ok = (a: CompartmentId, b: CompartmentId, via?: string) => {
    if (a === b) return via === undefined;
    const t = transitions.find((x) => x.from === a && x.to === b);
    return !!t && (via === undefined || via === t.id);
  };
  const walk = (cargo: string, steps: RouteStep[], startAt: CompartmentId | null, label: string) => {
    let prev = startAt;
    const ids = new Set<string>();
    for (const s of steps) {
      if (ids.has(s.id)) errors.push(`${cargo}/${label}: duplicate step id ${s.id}`);
      ids.add(s.id);
      if (s.gate && !TRAFF_PERT_IDS.includes(s.gate)) errors.push(`${cargo}/${s.id}: unknown gate ${s.gate}`);
      if (prev !== null) {
        if (!ok(prev, s.at, s.transition)) errors.push(`${cargo}/${s.id}: invalid compartment transition ${prev} → ${s.at}${s.transition ? ` via ${s.transition}` : " (missing transition id)"}`);
      }
      prev = s.at;
    }
    return prev;
  };
  for (const c of cargos) {
    const end = walk(c.id, c.steps, null, "main");
    if (end !== c.destination) errors.push(`${c.id}: route ends at ${String(end)} but the destination is ${c.destination}`);
    for (const d of c.detours) {
      const gated = c.steps.findIndex((s) => s.gate === d.gate);
      if (gated < 1) { errors.push(`${c.id}: detour for ${d.gate} has no gated step`); continue; }
      walk(c.id, d.steps, c.steps[gated - 1].at, `detour-${d.gate}`);
    }
  }
  return errors;
}

export type TraceStatus = "destination" | "retained" | "detour";
export interface CargoTrace {
  cargo: CargoId;
  /** Steps actually taken, in order. */
  steps: RouteStep[];
  /** The first step that was blocked (the cargo does not take it). */
  blocked: RouteStep | null;
  blockedBy: TraffPertId | null;
  final: CompartmentId;
  status: TraceStatus;
  applied: TraffPertId[];
  ignored: TraffPertId[];
  summary: string;
  outcome: Outcome;
}

export function traceCargo(id: CargoId, perturbations: readonly TraffPertId[]): CargoTrace {
  const cargo = cargoById(id);
  const active = new Set(perturbations);
  const taken: RouteStep[] = [];
  let blocked: RouteStep | null = null, blockedBy: TraffPertId | null = null;
  for (const s of cargo.steps) {
    if (s.gate && active.has(s.gate)) { blocked = s; blockedBy = s.gate; break; }
    taken.push(s);
  }
  const relevant = new Set(cargo.steps.map((s) => s.gate).filter((g): g is TraffPertId => !!g));
  const applied = blockedBy ? [blockedBy] : [];
  const ignored = perturbations.filter((p) => !relevant.has(p) || (blockedBy !== null && p !== blockedBy)).filter((p, i, a) => a.indexOf(p) === i);
  const det = blockedBy ? cargo.detours.find((d) => d.gate === blockedBy) : undefined;
  let status: TraceStatus = "destination";
  let summary = `${cargo.name} reaches its destination: ${cargo.destinationNote}.`;
  const definite: string[] = [], uncertain: string[] = [];
  if (blocked && blockedBy) {
    const p = TRAFF_PERTURBATIONS.find((x) => x.id === blockedBy)!;
    const last = taken.length ? taken[taken.length - 1].at : "cytosol" as CompartmentId;
    if (det) {
      taken.push(...det.steps);
      status = "detour";
      summary = det.outcome;
      definite.push(`${p.label}: the step “${blocked.title}” cannot occur. ${det.outcome}`);
      uncertain.push("Whether the cell tolerates the mislocalised or missing protein, and any clinical consequence, is not modelled.");
    } else {
      status = "retained";
      summary = `${cargo.name} is stopped before “${blocked.title}” and stays at: ${compartmentOf(last).name}.`;
      definite.push(`${p.label}: “${blocked.title}” cannot occur, so within this route the cargo does not get past ${compartmentOf(last).name}.`);
      uncertain.push("What eventually happens to the stalled protein (degradation, aggregation, a stress response, an alternative route) is not modelled.");
    }
  } else {
    definite.push(`No active perturbation blocks any step of this route.`);
  }
  for (const p of ignored) if (!(blockedBy && p === blockedBy)) {
    const label = TRAFF_PERTURBATIONS.find((x) => x.id === p)!.label;
    const onRoute = relevant.has(p);
    definite.push(onRoute ? `${label}: also gates this route, but the cargo was already stopped earlier.` : `${label}: no step of this route depends on it, so it has no effect on this cargo.`);
  }
  return { cargo: id, steps: taken, blocked, blockedBy, final: taken.length ? taken[taken.length - 1].at : "cytosol", status, applied, ignored, summary, outcome: { definite, uncertain } };
}

/** Membrane topology at a step for a membrane protein: which side the N-terminal domain faces. The cytosolic domain always faces the cytosol. */
export function topologyAt(cargoId: CargoId, trace: CargoTrace, stepIndex: number): { nDomain: string; cDomain: string } | null {
  if (!cargoById(cargoId).membraneProtein) return null;
  const s = trace.steps[Math.min(stepIndex, trace.steps.length - 1)];
  if (!s) return null;
  const inserted = trace.steps.findIndex((x) => x.id === "translocate");
  if (inserted < 0 || trace.steps.indexOf(s) < inserted) return { nDomain: "not yet inserted (nascent chain on the ribosome)", cDomain: "not yet inserted" };
  return { nDomain: LUMENAL_FACE[s.at] ?? "lumenal side", cDomain: "cytosol" };
}

// ================================================================ vesicular trafficking ================================================================

export const VESICLE_STAGES = ["selection", "budding", "transport", "tethering", "docking", "fusion"] as const;
export type VesicleStageId = (typeof VESICLE_STAGES)[number];
export const VESICLE_STAGE_TITLE: Record<VesicleStageId, string> = { selection: "Cargo selection", budding: "Budding", transport: "Transport", tethering: "Tethering", docking: "Docking", fusion: "Fusion" };
export const VESICLE_STAGE_DISTINCTION: Record<VesicleStageId, string> = {
  selection: "Coat or adaptor subunits bind sorting signals on cargo or cargo receptors. Selection happens before and while the vesicle forms.",
  budding: "Coat assembly deforms the donor membrane into a bud and (for clathrin) dynamin or other scission machinery pinches it off. Budding makes the vesicle; it does not move it.",
  transport: "The uncoated vesicle travels, commonly along cytoskeletal tracks using motor proteins. Movement is distinct from recognising the target.",
  tethering: "Long-range, low-specificity capture by Rab effectors or tethering complexes brings the vesicle near the target membrane. Tethering is not fusion.",
  docking: "Close contact, with SNARE proteins on the two membranes starting to pair. Docking prepares for fusion but does not complete it.",
  fusion: "Zippering of the SNARE complex pulls the bilayers together; membranes merge and the cargo/membrane is delivered. Only now does the content cross.",
};
export interface VesicleRoute {
  id: "copii" | "copi" | "clathrin-ap2" | "clathrin-ap1";
  name: string; donor: CompartmentId; acceptor: CompartmentId; transition: string;
  stage: Record<VesicleStageId, { machinery: string[]; text: string }>;
  rab: string; snares: string; caveat: string;
}
export const VESICLE_ROUTES: readonly VesicleRoute[] = [
  {
    id: "copii", name: "COPII: ER → Golgi (anterograde)", donor: "er", acceptor: "golgi-cis", transition: "copii-budding", rab: "Rab1", snares: "R-SNARE Sec22b pairs with Q-SNAREs including syntaxin 5",
    caveat: "COPII is the coat for leaving the ER. It does not decide the final destination of every cargo: later Golgi and TGN sorting does.",
    stage: {
      selection: { machinery: ["Sar1-GTP (activated by Sec12)", "Sec24 (cargo binding)"], text: "Sec24 binds export signals on cargo or cargo receptors at ER exit sites." },
      budding: { machinery: ["Sec23/Sec24 inner coat", "Sec13/Sec31 outer coat"], text: "The coat polymerises and curves the membrane; Sar1 inserts an amphipathic helix into the bilayer." },
      transport: { machinery: ["Coat shed after GTP hydrolysis", "Microtubule motors"], text: "The vesicle loses its coat and moves toward the ER–Golgi intermediate compartment/cis-Golgi." },
      tethering: { machinery: ["Rab1", "Tethering complexes (for example TRAPP, p115)"], text: "Rab1 effectors capture the carrier near the target." },
      docking: { machinery: ["SNAREs (v-SNARE on vesicle, t-SNAREs on target)"], text: "Cognate SNAREs begin to pair, which provides specificity." },
      fusion: { machinery: ["Four-helix SNARE bundle", "NSF/α-SNAP recycle SNAREs afterwards"], text: "SNARE zippering fuses the membranes, delivering cargo to the cis-Golgi." },
    },
  },
  {
    id: "copi", name: "COPI: Golgi → ER and within the Golgi (retrograde)", donor: "golgi-cis", acceptor: "er", transition: "golgi-copi", rab: "Rab1 and others (not a single-destination code)", snares: "ER-localised SNAREs (for example syntaxin 18) with Sec22b",
    caveat: "COPI mainly retrieves proteins to the ER and recycles Golgi machinery; its exact role in forward intra-Golgi transport is debated.",
    stage: {
      selection: { machinery: ["Arf1-GTP", "Coatomer binds KKXX motifs and KDEL-receptor tails"], text: "Coatomer binds retrieval signals: C-terminal KKXX motifs on membrane proteins or the tail of the KDEL receptor carrying KDEL-tagged soluble ER proteins." },
      budding: { machinery: ["Arf1-GTP", "Coatomer (COPI)"], text: "Arf1 recruits coatomer to Golgi membranes, which forms the bud." },
      transport: { machinery: ["Uncoating", "Cytoskeletal transport"], text: "The coat is removed and the vesicle moves toward the ER." },
      tethering: { machinery: ["Dsl1 tether complex"], text: "A tether near the ER captures the retrograde carrier." },
      docking: { machinery: ["SNAREs"], text: "SNARE pairing at the ER membrane." },
      fusion: { machinery: ["SNARE bundle"], text: "Fusion returns the retrieved protein to the ER." },
    },
  },
  {
    id: "clathrin-ap2", name: "Clathrin/AP-2: plasma membrane → early endosome (endocytosis)", donor: "pm", acceptor: "early-endo", transition: "pm-endocytosis", rab: "Rab5 at the early endosome", snares: "Endosomal SNAREs (not enumerated here)",
    caveat: "Clathrin-mediated endocytosis is one of several routes of uptake (caveolae, macropinocytosis and others are not modelled), and clathrin is also used elsewhere.",
    stage: {
      selection: { machinery: ["AP-2 adaptor", "PI(4,5)P₂", "Cargo motifs (YxxΦ, dileucine)"], text: "AP-2 binds cargo tails and the plasma-membrane lipid PI(4,5)P₂." },
      budding: { machinery: ["Clathrin triskelia", "Dynamin (scission)"], text: "Clathrin assembles a coated pit; dynamin constricts the neck and releases a coated vesicle." },
      transport: { machinery: ["Uncoating (Hsc70, auxilin)", "Actin and microtubule transport"], text: "The coat is removed and the vesicle moves inward." },
      tethering: { machinery: ["Rab5", "EEA1"], text: "Rab5 effectors such as EEA1 tether the vesicle to the early endosome." },
      docking: { machinery: ["SNAREs"], text: "SNARE pairing with the endosomal membrane." },
      fusion: { machinery: ["SNARE bundle"], text: "Fusion delivers the cargo to the early endosome." },
    },
  },
  {
    id: "clathrin-ap1", name: "Clathrin/AP-1 (GGA): trans-Golgi network → endosome (M6P receptors)", donor: "golgi-trans", acceptor: "late-endo", transition: "tgn-clathrin", rab: "Rab GTPases of the endosomal system", snares: "Endosomal SNAREs",
    caveat: "AP-1 and GGA adaptors serve several TGN/endosome pathways; the same coat does not alone fix the final destination of a cargo.",
    stage: {
      selection: { machinery: ["Arf1-GTP", "AP-1 / GGA adaptors", "Acidic-cluster dileucine signal on M6P receptors"], text: "Adaptors bind signals in the cytosolic tail of the mannose 6-phosphate receptor that carries the hydrolase." },
      budding: { machinery: ["Clathrin"], text: "Clathrin assembles on the TGN membrane and forms the carrier." },
      transport: { machinery: ["Uncoating", "Cytoskeletal transport"], text: "The carrier moves toward an endosome." },
      tethering: { machinery: ["Rab GTPase effectors", "Tethers"], text: "The carrier is captured at the endosome." },
      docking: { machinery: ["SNAREs"], text: "SNARE pairing with the endosome." },
      fusion: { machinery: ["SNARE bundle"], text: "Fusion delivers the receptor–hydrolase complexes; acid then releases the hydrolase." },
    },
  },
];
export const vesicleRoute = (id: VesicleRoute["id"]): VesicleRoute => VESICLE_ROUTES.find((v) => v.id === id)!;

// ================================================================ endosomes and lysosomes ================================================================

export type EndoStageId = "uptake" | "early" | "recycle" | "late" | "lysosome" | "degraded" | "transcytosed";
export interface EndoStage { id: EndoStageId; title: string; compartment: CompartmentId; ph: string; machinery: string[]; text: string }
export const ENDO_STAGES: readonly EndoStage[] = [
  { id: "uptake", title: "Endocytosis", compartment: "v-endocytic", ph: "≈ 7 (extracellular)", machinery: ["AP-2", "Clathrin", "Dynamin"], text: "A clathrin-coated vesicle internalises receptors and bound ligand." },
  { id: "early", title: "Early (sorting) endosome", compartment: "early-endo", ph: "≈ 6.0–6.5", machinery: ["Rab5", "EEA1", "V-ATPase"], text: "Mildly acidic; many ligands dissociate from their receptors here and cargo is sorted: recycle, or continue toward degradation." },
  { id: "recycle", title: "Recycling to the plasma membrane", compartment: "v-recycling", ph: "mildly acidic → 7 on return", machinery: ["Rab4/Rab11", "Sorting nexins"], text: "Receptors (and membrane) return to the cell surface for reuse." },
  { id: "late", title: "Late endosome / multivesicular body", compartment: "late-endo", ph: "≈ 5.0–5.5", machinery: ["Rab7", "ESCRT (internal vesicles)", "V-ATPase"], text: "More acidic. Cargo marked for degradation is sorted into internal vesicles; M6P receptors release hydrolases and return to the TGN." },
  { id: "lysosome", title: "Lysosome", compartment: "lysosome", ph: "≈ 4.5–5.0", machinery: ["V-ATPase", "Acid hydrolases"], text: "Acidic lumen with acid hydrolases, at the end of the endolysosomal route." },
  { id: "degraded", title: "Lysosomal degradation", compartment: "lysosome", ph: "≈ 4.5–5.0", machinery: ["Acid hydrolases (proteases, lipases, glycosidases)"], text: "Hydrolases break the contents into small molecules that are exported for reuse." },
  { id: "transcytosed", title: "Transcytosis to the opposite surface", compartment: "pm", ph: "—", machinery: ["Recycling endosome", "Polarised sorting"], text: "In polarised cells some cargo crosses the cell and is released on the opposite surface, undegraded." },
];
export const endoStage = (id: EndoStageId): EndoStage => ENDO_STAGES.find((s) => s.id === id)!;
export type EndoCargoId = "transferrin" | "ldl" | "egf" | "iga";
export interface EndoCargo { id: EndoCargoId; name: string; summary: string; /** Normal fate as stage ids, from uptake. */ path: EndoStageId[]; needsAcid: boolean; note: string; evidence: Evidence }
export const ENDO_CARGOS: readonly EndoCargo[] = [
  { id: "transferrin", name: "Transferrin receptor with iron-loaded transferrin", summary: "Acid in the endosome releases iron; the apo-transferrin–receptor complex recycles. Nothing is degraded.", path: ["uptake", "early", "recycle"], needsAcid: true, note: "Internalised material is not necessarily destroyed: this cargo is recycled intact.", evidence: "established" },
  { id: "ldl", name: "LDL bound to the LDL receptor", summary: "Acid releases LDL from its receptor in the early endosome. The receptor recycles; LDL goes on to the lysosome, where its lipids are degraded.", path: ["uptake", "early", "late", "lysosome", "degraded"], needsAcid: true, note: "The receptor and its ligand take different routes after the sorting endosome.", evidence: "established" },
  { id: "egf", name: "EGF bound to its receptor (EGFR)", summary: "Active, ubiquitinated receptors are sorted into internal vesicles and degraded in the lysosome; under some conditions receptors recycle instead.", path: ["uptake", "early", "late", "lysosome", "degraded"], needsAcid: false, note: "Whether EGFR is degraded or recycled depends on ligand dose and receptor modification. The degradative route is shown.", evidence: "context-dependent" },
  { id: "iga", name: "Polymeric IgA receptor with IgA (polarised epithelial cell)", summary: "In polarised cells IgA–receptor complexes are carried across the cell and released at the opposite surface; they are not degraded.", path: ["uptake", "early", "recycle", "transcytosed"], needsAcid: false, note: "Transcytosis exists only in polarised cells; the route is endosome-based but not lysosomal.", evidence: "established" },
];
export const endoCargo = (id: EndoCargoId): EndoCargo => ENDO_CARGOS.find((c) => c.id === id)!;
export type EndoPert = "v-atpase-inhibited" | "m6p-blocked";
export const ENDO_PERTURBATIONS: ReadonlyArray<{ id: EndoPert; label: string; explanation: string }> = [
  { id: "v-atpase-inhibited", label: "Vacuolar H⁺-ATPase inhibited", explanation: "V-ATPases pump protons into endosomes and lysosomes. Without them the lumen is not acidified." },
  { id: "m6p-blocked", label: "M6P tagging blocked (lysosomal hydrolases not delivered)", explanation: "Newly made hydrolases are secreted instead of reaching the lysosome, so lysosomes lack hydrolase supply." },
];
export interface EndoTrace { path: EndoStageId[]; acidified: boolean; hydrolaseSupply: boolean; statements: string[]; uncertain: string[]; degrades: boolean; reachesLysosome: boolean }
export function traceEndocytosis(id: EndoCargoId, perts: readonly EndoPert[]): EndoTrace {
  const c = endoCargo(id);
  const acidified = !perts.includes("v-atpase-inhibited"), hydrolaseSupply = !perts.includes("m6p-blocked");
  const path = [...c.path];
  const statements: string[] = [], uncertain: string[] = [];
  const reachesLysosome = path.includes("lysosome");
  let degrades = reachesLysosome && path.includes("degraded");
  if (!acidified) {
    statements.push("Without V-ATPase the endosomal and lysosomal lumen is not acidified.");
    if (c.needsAcid) statements.push(`${c.name}: acid-dependent release of the ligand from the receptor in the endosome fails.`);
    if (degrades) { degrades = false; statements.push("Acid hydrolases need acidic pH, so delivery to the lysosome does not lead to degradation in this model."); }
    uncertain.push("Secondary effects of lost acidification (altered trafficking, signalling, cell viability) are not modelled.");
  }
  if (!hydrolaseSupply && reachesLysosome) {
    statements.push("Lysosomes receive less hydrolase because new enzymes are secreted instead of delivered; the contents would be degraded less completely.");
    uncertain.push("How strongly degradation falls, over what time, and the resulting storage or disease phenotype is not modelled.");
    if (id === "ldl" && degrades) { /* degradation is reduced, not abolished: keep true but flagged */ }
  }
  if (!statements.length) statements.push(`${c.summary}`);
  return { path, acidified, hydrolaseSupply, statements, uncertain, degrades, reachesLysosome };
}

// ================================================================ protein quality control ================================================================

export const QC_GRAPH: RegGraph = {
  id: "qc",
  nodes: [
    { id: "defect", label: "Folding-prone (defective) protein", module: "qc", kind: "input", default: false, where: "ER lumen", role: "A newly made secretory protein that cannot reach its native fold.", evidence: "established" },
    { id: "aggregates", label: "Forms large aggregates", module: "qc", kind: "input", default: false, where: "ER lumen", role: "Misfolded protein that has aggregated and is too large to pass the retrotranslocation channel.", evidence: "established" },
    { id: "chaperones", label: "Chaperones functional (BiP, PDI, calnexin cycle)", module: "qc", kind: "input", default: true, where: "ER lumen", role: "Assist folding and hold unfolded chains.", evidence: "established" },
    { id: "eradOk", label: "ERAD machinery (Hrd1, p97) functional", module: "qc", kind: "input", default: true, where: "ER membrane / cytosol", role: "Retrotranslocates misfolded proteins for degradation.", evidence: "established" },
    { id: "proteasomeOk", label: "Proteasome functional", module: "qc", kind: "input", default: true, where: "Cytosol, nucleus", role: "Degrades polyubiquitinated, unfolded proteins.", evidence: "established" },
    { id: "lysoOk", label: "Autophagy–lysosome route functional", module: "qc", kind: "input", default: true, where: "Cytosol, lysosome", role: "Delivers bulk material, aggregates and organelle fragments to lysosomes for degradation.", evidence: "established" },
    { id: "folded", label: "Native fold reached", module: "qc", kind: "derived", expr: all("chaperones", not("defect")), where: "ER lumen", role: "Correctly folded protein passes ER quality control.", evidence: "simplified", caveat: "Chaperone loss is modelled as preventing folding of every protein; real proteins differ in their chaperone dependence." },
    { id: "misfolded", label: "Misfolded, retained in the ER", module: "qc", kind: "derived", expr: not("folded"), where: "ER lumen", role: "Quality control retains the protein instead of exporting it.", evidence: "established" },
    { id: "exported", label: "Exported (COPII)", module: "qc", kind: "derived", expr: "folded", where: "ER exit sites", role: "Only folded protein leaves the ER.", evidence: "established" },
    { id: "retro", label: "Retrotranslocated to the cytosol (ERAD)", module: "qc", kind: "derived", expr: all("misfolded", not("aggregates"), "eradOk"), where: "ER membrane", role: "Hrd1/p97 move soluble misfolded protein to the cytosol, where it is polyubiquitinated.", evidence: "established" },
    { id: "proteasomeDeg", label: "Degraded by the proteasome", module: "qc", kind: "derived", expr: all("retro", "proteasomeOk"), where: "Cytosol", role: "The 26S proteasome unfolds and degrades the ubiquitinated chain.", evidence: "established" },
    { id: "lysoDeg", label: "Degraded in lysosomes (ER-phagy / autophagy)", module: "qc", kind: "derived", expr: all("misfolded", any("aggregates", not("eradOk")), "lysoOk"), where: "Lysosome", role: "Aggregates or protein that cannot be retrotranslocated can be delivered to lysosomes.", evidence: "context-dependent", caveat: "The lysosomal route as a back-up for failed ERAD is established for some substrates, not all." },
    { id: "accumulates", label: "Accumulates (not degraded)", module: "qc", kind: "derived", expr: all("misfolded", not("proteasomeDeg"), not("lysoDeg")), where: "ER lumen or cytosol", role: "No modelled degradation route is available for the retained protein.", evidence: "simplified", caveat: "Accumulation is expected to trigger a stress response (the unfolded protein response), which is not modelled." },
  ],
};
export const QC_PERTURBATIONS: readonly Perturbation[] = [
  { id: "chaperone-loss", label: "Chaperones non-functional", target: "chaperones", force: false, kind: "loss", explanation: "Without chaperone help, protein folding fails." },
  { id: "erad-impaired", label: "ERAD impaired", target: "eradOk", force: false, kind: "loss", explanation: "Misfolded protein cannot be retrotranslocated." },
  { id: "proteasome-inhibited", label: "Proteasome inhibited", target: "proteasomeOk", force: false, kind: "loss", explanation: "Ubiquitinated protein reaches the cytosol but is not degraded." },
  { id: "lysosome-route-impaired", label: "Autophagy–lysosome route impaired", target: "lysoOk", force: false, kind: "loss", explanation: "The lysosomal back-up route is unavailable." },
];
export interface QcInput { defect: boolean; aggregates: boolean; perturbations: string[] }
export const DEFAULT_QC: QcInput = { defect: true, aggregates: false, perturbations: [] };
export const evaluateQc = (q: QcInput) => evaluateGraph(QC_GRAPH, { defect: q.defect, aggregates: q.aggregates }, pertById(QC_PERTURBATIONS, q.perturbations));

export function validateQc(raw: unknown): Checked<QcInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Quality-control state must be an object." };
  const r = raw as Record<string, unknown>;
  if (typeof r.defect !== "boolean" || typeof r.aggregates !== "boolean") return { ok: false, error: "defect and aggregates must be true or false." };
  if (r.aggregates && !r.defect) return { ok: false, error: "Aggregates can only form from a misfolding protein." };
  if (!Array.isArray(r.perturbations) || r.perturbations.length > 3 || new Set(r.perturbations).size !== r.perturbations.length || r.perturbations.some((p) => !QC_PERTURBATIONS.some((q) => q.id === p))) return { ok: false, error: "Unknown or repeated quality-control perturbation." };
  return { ok: true, value: { defect: r.defect, aggregates: r.aggregates, perturbations: r.perturbations as string[] } };
}

// ================================================================ organelles ================================================================

export interface Organelle {
  id: string; name: string; boundary: "single membrane" | "double membrane" | "none / protein-based" | "membrane-continuous";
  functions: string[]; relation: string; compartments: CompartmentId[]; schematic: string;
}
export const ORGANELLES: readonly Organelle[] = [
  { id: "plasma-membrane", name: "Plasma membrane", boundary: "single membrane", functions: ["Selective barrier between the cell and its surroundings", "Hosts transporters, channels and receptors", "Site of exocytosis and endocytosis"], relation: "Receives secretory carriers; pinches off endocytic vesicles.", compartments: ["pm", "extracellular"], schematic: "Outline drawn as a smooth rounded boundary." },
  { id: "cytosol", name: "Cytoplasm and cytosol", boundary: "none / protein-based", functions: ["Site of most protein synthesis on free ribosomes", "Glycolysis and many other pathways", "Proteasomal degradation of ubiquitinated proteins"], relation: "The cytoplasm is the cytosol plus the organelles; the cytosol itself has no enclosing membrane.", compartments: ["cytosol", "proteasome"], schematic: "The space between the organelles." },
  { id: "nucleus", name: "Nucleus", boundary: "double membrane", functions: ["Houses chromosomal DNA", "Site of DNA replication and transcription", "RNA processing before export"], relation: "Surrounded by a double membrane, the nuclear envelope, which is continuous with the ER.", compartments: ["nucleus"], schematic: "Drawn as a single round body; real nuclei vary in size and shape." },
  { id: "nuclear-envelope", name: "Nuclear envelope", boundary: "double membrane", functions: ["Separates nucleoplasm from cytoplasm", "Outer membrane is continuous with the ER", "Supported by the nuclear lamina"], relation: "Perforated by nuclear pore complexes.", compartments: [], schematic: "Drawn as two concentric lines." },
  { id: "nuclear-pore", name: "Nuclear pore complex", boundary: "none / protein-based", functions: ["Channel through the nuclear envelope", "Lets small molecules diffuse and carrier-bound cargo pass", "FG-nucleoporins form the selective permeability barrier"], relation: "Used by the nuclear import route.", compartments: ["npc"], schematic: "Drawn as gaps in the envelope; a real pore is a large protein assembly." },
  { id: "rough-er", name: "Rough endoplasmic reticulum", boundary: "membrane-continuous", functions: ["Ribosomes translate secretory, membrane and lysosomal proteins into it", "Folding, N-glycosylation and quality control", "Starting point of the secretory pathway"], relation: "Continuous with the nuclear envelope and the smooth ER.", compartments: ["er"], schematic: "Flattened sacs studded with ribosomes." },
  { id: "smooth-er", name: "Smooth endoplasmic reticulum", boundary: "membrane-continuous", functions: ["Lipid synthesis", "Calcium storage and release", "Detoxification in some cell types"], relation: "Continuous with the rough ER; lacks ribosomes on its surface.", compartments: [], schematic: "Tubules without ribosomes." },
  { id: "golgi", name: "Golgi apparatus", boundary: "single membrane", functions: ["Processes glycans on proteins and lipids", "Sorts cargo at the trans-Golgi network", "Adds the mannose 6-phosphate tag to lysosomal hydrolases"], relation: "Receives COPII carriers from the ER; sends carriers to the surface and endosomes; COPI returns material to the ER.", compartments: ["golgi-cis", "golgi-medial", "golgi-trans", "v-copii", "v-copi", "v-secretory"], schematic: "A stack of flattened cisternae with cis, medial and trans faces." },
  { id: "mitochondrion", name: "Mitochondrion", boundary: "double membrane", functions: ["Oxidative phosphorylation and the citric acid cycle", "Release of cytochrome c in intrinsic apoptosis", "Imports most of its proteins from the cytosol"], relation: "Not part of the vesicular secretory pathway; proteins cross the outer and inner membranes through TOM and TIM complexes.", compartments: ["mito-ims", "mito-matrix"], schematic: "Bean-shaped with an inner membrane folded into cristae." },
  { id: "lysosome", name: "Lysosome", boundary: "single membrane", functions: ["Acidic lumen (V-ATPase) with acid hydrolases", "Degrades endocytosed material, autophagic cargo and worn organelles", "Recycling of constituents"], relation: "Receives hydrolases from the TGN via endosomes and cargo from endosomes and autophagosomes.", compartments: ["lysosome"], schematic: "Small round vesicle." },
  { id: "endosome", name: "Endosomes", boundary: "single membrane", functions: ["Early endosomes sort endocytosed material", "Recycling endosomes return receptors to the surface", "Late endosomes/multivesicular bodies lead to lysosomes"], relation: "Between the plasma membrane, the TGN and lysosomes.", compartments: ["early-endo", "late-endo", "v-endocytic", "v-clathrin", "v-recycling"], schematic: "Tubulo-vesicular compartments of varying shape." },
  { id: "peroxisome", name: "Peroxisome", boundary: "single membrane", functions: ["Fatty-acid oxidation (very-long-chain fatty acids)", "Hydrogen-peroxide metabolism by catalase", "Imports folded proteins from the cytosol by its own targeting signals"], relation: "Not on the secretory route; its proteins are imported post-translationally. Peroxisomal import is not modelled here.", compartments: [], schematic: "Small round body." },
  { id: "ribosomes", name: "Ribosomes", boundary: "none / protein-based", functions: ["Translate mRNA into protein", "Free in the cytosol or bound to the rough ER", "Which pool a ribosome joins depends on the nascent chain"], relation: "A ribosome becomes ER-bound when SRP recognises a signal sequence.", compartments: [], schematic: "Tiny dots, not to scale." },
  { id: "cytoskeleton", name: "Cytoskeletal elements", boundary: "none / protein-based", functions: ["Microtubules, actin filaments and intermediate filaments", "Motor proteins move vesicles along microtubules and actin", "Organise organelle positions"], relation: "Transport vesicles are carried on tracks; tracks are not drawn for every route.", compartments: [], schematic: "A few representative microtubules." },
];
export const organelleById = (id: string): Organelle => ORGANELLES.find((o) => o.id === id)!;
/** Processes (cargo routes and their steps) that pass through an organelle, derived from the route data. */
export function processesThrough(organelleId: string): Array<{ cargo: CargoId; cargoName: string; steps: string[] }> {
  const ids = new Set(COMPARTMENTS.filter((c) => c.organelle === organelleId).map((c) => c.id));
  const out: Array<{ cargo: CargoId; cargoName: string; steps: string[] }> = [];
  for (const c of CARGOS) {
    const steps = c.steps.filter((s) => ids.has(s.at)).map((s) => s.title);
    if (steps.length) out.push({ cargo: c.id, cargoName: c.name, steps });
  }
  return out;
}

export const TRAFFICKING_ASSUMPTIONS = [
  "A curated transport graph: six cargo classes, each with a fixed route through allowed compartment transitions. The tool does not predict where an arbitrary amino-acid sequence goes.",
  "Layout coordinates are schematic. Organelle sizes, numbers and positions are not measurements.",
  "Perturbations stop or redirect a cargo at one gated step. What the cell does with a stalled or mislocalised protein, and any disease consequence, is not modelled.",
  "Vesicle coats and small GTPases are shown with textbook roles. A coat does not by itself fix a cargo's final destination; sorting signals and later steps do.",
  "pH values are approximate and vary between cell types. No transport rates, kinetics or degradation half-lives are given.",
  "Mitochondrial protein classes other than presequence-containing matrix proteins, tail-anchored and multi-pass membrane proteins and peroxisomal import are not modelled.",
];
