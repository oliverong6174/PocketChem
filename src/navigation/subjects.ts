import type { IconName } from "../components/ui/Icon";

/**
 * Subject architecture. PocketChem is organised as subjects (branches of science) that each belong to a
 * product mode:
 *   workbench  - Scientific Workbench: draw / compute / compare tools (Organic, General Chemistry, Physics)
 *   learning   - Interactive Learning: explore / practice / challenge diagrams (Biology, Biochemistry)
 * Organic Chemistry and General Chemistry are implemented. Planned subjects are listed so the navigation does not
 * need redesigning later, but they are informational only and never render tool interfaces.
 *
 * ADDING A SUBJECT: (1) mark it "available" here and give it a tool list in SUBJECT_TOOLS; (2) give each tool a stable
 * id and a URL slug; (3) render its panels in App.tsx under the same shell; (4) if it saves work, add a persisted page
 * in utils/persistence/workspaceStore.ts and its subject in PAGE_SUBJECT. The shell, themes, learning-mode switch,
 * diagram frame, chart and saved-analysis library are shared and need no change.
 * See docs/SUBJECTS.md.
 */
export type SubjectId = "organic" | "general" | "physics" | "biology" | "biochemistry";
export type SubjectMode = "workbench" | "learning";

export interface SubjectDef {
  id: SubjectId;
  label: string;
  mode: SubjectMode;
  icon: IconName;
  status: "available" | "planned";
  tagline: string;
  /** Intended areas, shown only on the planned-subject preview and always labelled as plans. */
  planned?: string[];
  /** URL segment: #/<slug>/<tool slug>. */
  slug: string;
}

export const MODE_LABELS: Record<SubjectMode, { label: string; blurb: string }> = {
  workbench: { label: "Scientific Workbench", blurb: "Draw, compute and compare with quantitative tools." },
  learning: { label: "Interactive Learning", blurb: "Explore labelled diagrams, practise, then predict outcomes." },
};

export const SUBJECTS: SubjectDef[] = [
  { id: "organic", slug: "organic", label: "Organic Chemistry", mode: "workbench", icon: "molecule", status: "available", tagline: "Structures, reactions, synthesis, spectra and conformations." },
  {
    id: "general", slug: "general", label: "General Chemistry", mode: "workbench", icon: "general", status: "available",
    tagline: "Stoichiometry, gas laws, acid–base, equilibrium, kinetics, thermodynamics and electrochemistry; more quantitative tools planned.",
    planned: ["Solubility equilibria", "Periodic trends", "Phase diagrams and colligative properties"],
  },
  {
    id: "physics", slug: "physics", label: "Physics", mode: "workbench", icon: "physics", status: "available",
    tagline: "Motion, forces, energy, collisions, waves and sound, optics, interference, electric fields and potential, magnetic fields and forces, electromagnetic induction, resistor networks and RC transients with live diagrams and synchronized graphs.",
    planned: ["Rotational motion and torque", "Gravitation and orbits", "Thin-film interference and polarization", "AC circuits: RLC, impedance and resonance"],
  },
  {
    id: "biology", slug: "biology", label: "Biology", mode: "learning", icon: "biology", status: "available",
    tagline: "Interactive diagrams of gene expression and its regulation, genetics, mitosis and meiosis, membrane transport, cell signaling, neuronal physiology, organelles and protein trafficking, the cell cycle and checkpoints, and apoptosis and autophagy.",
    planned: ["Population genetics", "Organ-system physiology", "Evolution and phylogenetics"],
  },
  {
    id: "biochemistry", slug: "biochemistry", label: "Biochemistry", mode: "learning", icon: "biochemistry", status: "available",
    tagline: "Amino acids and peptides, protein structure and folding, enzymes and catalysis, and the central metabolic pathways from glucose to ATP.",
    planned: ["Carbohydrates and lipids", "Nucleic-acid structure and thermodynamics", "Bioenergetics and ATP coupling"],
  },
];

export type ToolGroupId = "analyze" | "mechanics" | "waves" | "electromagnetism" | "electricity" | "geneExpression" | "inheritance" | "cellular" | "cellOrg" | "biomolecules" | "metabolism" | "synthesize" | "library";

export const TOOL_GROUPS: Array<{ id: ToolGroupId; label: string }> = [
  { id: "analyze", label: "Analyze" },
  { id: "mechanics", label: "Mechanics" },
  { id: "waves", label: "Waves & optics" },
  { id: "electromagnetism", label: "Electromagnetism" },
  { id: "electricity", label: "Electricity" },
  { id: "geneExpression", label: "Gene expression" },
  { id: "inheritance", label: "Genetics & cell division" },
  { id: "cellular", label: "Cellular biology & physiology" },
  { id: "cellOrg", label: "Cell organization & regulation" },
  { id: "biomolecules", label: "Biomolecules" },
  { id: "metabolism", label: "Metabolism" },
  { id: "synthesize", label: "Synthesize" },
  { id: "library", label: "Library" },
];

export interface ToolDef {
  id: string;
  /** URL segment after the subject slug. */
  slug: string;
  label: string;
  /** One line: what the tool is for. */
  summary: string;
  group: ToolGroupId;
  icon: IconName;
}

/** Tools of each available subject. Adding a subject means adding an entry here, not changing the shell. */
export const ORGANIC_TOOLS: ToolDef[] = [
  { id: "analysis", slug: "properties", label: "Properties", summary: "Draw a molecule; read its name, formula, groups and acid/base behaviour.", group: "analyze", icon: "molecule" },
  { id: "acidBase", slug: "ranking", label: "Ranking", summary: "Rank up to five molecules by acidity, basicity and other measures.", group: "analyze", icon: "ranking" },
  { id: "spectroscopy", slug: "spectroscopy", label: "Spectroscopy", summary: "Estimate IR, NMR and mass spectra for a structure.", group: "analyze", icon: "spectrum" },
  { id: "conformations", slug: "conformations", label: "Conformations", summary: "Chair flips, Newman and sawhorse projections with a strain model.", group: "analyze", icon: "conformations" },
  { id: "reactions", slug: "reactions", label: "Reactions", summary: "Choose reagents and predict products with stereochemistry.", group: "synthesize", icon: "reactions" },
  { id: "multiStep", slug: "multi-step", label: "Multi-Step", summary: "Plan forward or retro-synthetic routes between molecules.", group: "synthesize", icon: "route" },
  { id: "multiCatalytic", slug: "multi-catalytic", label: "Multi-Catalytic", summary: "Apply a sequence of reagent and catalyst conditions.", group: "synthesize", icon: "catalysis" },
  { id: "saved", slug: "saved", label: "Saved", summary: "Reopen analyses saved on this device.", group: "library", icon: "saved" },
];

export type GeneralToolId = "gcOverview" | "gcStoichiometry" | "gcGas" | "gcAcidBase" | "gcEquilibrium" | "gcKinetics" | "gcThermo" | "gcElectro" | "gcSaved";

export const GENERAL_TOOLS: ToolDef[] = [
  { id: "gcOverview", slug: "overview", label: "Overview", summary: "What General Chemistry offers now, and what is still planned.", group: "analyze", icon: "general" },
  { id: "gcStoichiometry", slug: "stoichiometry", label: "Stoichiometry", summary: "Formula masses, equation balancing, limiting reagents, yields, dilution and solution reactions.", group: "analyze", icon: "stoichiometry" },
  { id: "gcGas", slug: "gas-laws", label: "Gas laws", summary: "PV = nRT, controlled gas experiments, mixtures, kinetic theory and molecular speed distributions.", group: "analyze", icon: "gas" },
  { id: "gcAcidBase", slug: "acid-base-titration", label: "Acid–base & titration", summary: "pH, buffers, dilution and titration curves for monoprotic acids and bases.", group: "analyze", icon: "flask" },
  { id: "gcEquilibrium", slug: "equilibrium", label: "Chemical equilibrium", summary: "Q versus K, ICE tables, equilibrium compositions and Le Châtelier shifts for one reaction.", group: "analyze", icon: "equilibrium" },
  { id: "gcKinetics", slug: "kinetics", label: "Reaction kinetics", summary: "Zero-, first- and second-order rate laws, half-lives, rate-law fitting and Arrhenius.", group: "analyze", icon: "kinetics" },
  { id: "gcThermo", slug: "thermodynamics", label: "Thermodynamics", summary: "Gibbs energy versus temperature, Hess's law and calorimetry.", group: "analyze", icon: "thermo" },
  { id: "gcElectro", slug: "electrochemistry", label: "Electrochemistry", summary: "Galvanic cells, standard and Nernst potentials, ΔG° and K, and electrolysis with Faraday's law.", group: "analyze", icon: "electro" },
  { id: "gcSaved", slug: "saved", label: "Saved", summary: "Reopen analyses saved on this device.", group: "library", icon: "saved" },
];

export type PhysicsToolId = "phOverview" | "phMechanics" | "phForces" | "phEnergy" | "phCollisions" | "phWaves" | "phOptics" | "phInterference" | "phEfield" | "phMagnetic" | "phInduction" | "phCircuits" | "phRc" | "phSaved";

export const PHYSICS_TOOLS: ToolDef[] = [
  { id: "phOverview", slug: "overview", label: "Overview", summary: "What Physics offers now, and what is still planned.", group: "analyze", icon: "physics" },
  { id: "phMechanics", slug: "mechanics", label: "Mechanics & motion", summary: "Projectile and constant-acceleration motion: a live diagram, vectors and synchronized graphs.", group: "mechanics", icon: "mechanics" },
  { id: "phForces", slug: "forces", label: "Forces & Newton's laws", summary: "Free-body diagrams, friction, inclines and tension for one body or a block with a hanging mass.", group: "mechanics", icon: "forces" },
  { id: "phEnergy", slug: "energy", label: "Work & energy", summary: "Kinetic, gravitational and spring energy, work, friction losses and energy bar charts.", group: "mechanics", icon: "energy" },
  { id: "phCollisions", slug: "collisions", label: "Momentum & collisions", summary: "Two-body one-dimensional collisions: momentum, restitution, impulse and energy loss.", group: "mechanics", icon: "collisions" },
  { id: "phWaves", slug: "waves-sound", label: "Waves & sound", summary: "Traveling and longitudinal waves, superposition and beats, standing waves and resonance in strings and pipes, and the Doppler effect.", group: "waves", icon: "waves" },
  { id: "phOptics", slug: "geometric-optics", label: "Geometric optics", summary: "Thin lenses, spherical mirrors, ray diagrams and image formation, plus refraction and total internal reflection.", group: "waves", icon: "optics" },
  { id: "phInterference", slug: "interference-diffraction", label: "Interference & diffraction", summary: "Single-slit, double-slit and grating patterns: fringe spacing, missing orders and the intensity across the screen.", group: "waves", icon: "interference" },
  { id: "phEfield", slug: "electric-fields", label: "Electric fields & potential", summary: "Point charges, field vectors and lines, equipotentials, forces on a test charge, and charged-particle motion in a uniform field.", group: "electromagnetism", icon: "efield" },
  { id: "phMagnetic", slug: "magnetic-fields", label: "Magnetic fields & forces", summary: "Fields of wires, loops and solenoids, the right-hand rule, the Lorentz force, circular and helical motion, and the force on a conductor.", group: "electromagnetism", icon: "magnetic" },
  { id: "phInduction", slug: "induction", label: "Electromagnetic induction", summary: "Magnetic flux, Faraday's and Lenz's laws, motional EMF, a rotating-coil generator and RL circuit transients.", group: "electromagnetism", icon: "induction" },
  { id: "phCircuits", slug: "circuits", label: "DC circuits", summary: "Series and parallel resistor networks: equivalent resistance, currents, voltages and power.", group: "electricity", icon: "circuits" },
  { id: "phRc", slug: "rc-transient", label: "RC transient", summary: "Charging and discharging of one capacitor through one resistor.", group: "electricity", icon: "rc" },
  { id: "phSaved", slug: "saved", label: "Saved", summary: "Reopen analyses saved on this device.", group: "library", icon: "saved" },
];

export type BiologyToolId = "bioOverview" | "bioReplication" | "bioTranscription" | "bioTranslation" | "bioDogma" | "bioRegulation" | "bioGenetics" | "bioDivision" | "bioMembrane" | "bioSignaling" | "bioNeuron" | "bioOrganelles" | "bioCellCycle" | "bioCellDeath" | "bioSaved";

export const BIOLOGY_TOOLS: ToolDef[] = [
  { id: "bioOverview", slug: "overview", label: "Overview", summary: "What Biology offers now, and what is still planned.", group: "analyze", icon: "biology" },
  { id: "bioReplication", slug: "dna-replication", label: "DNA replication", summary: "A replication fork: helicase, primers, leading and lagging strands, Okazaki fragments and ligase.", group: "geneExpression", icon: "dna" },
  { id: "bioTranscription", slug: "transcription", label: "Transcription & RNA processing", summary: "Template and coding strands, RNA synthesis, and eukaryotic capping, splicing and polyadenylation.", group: "geneExpression", icon: "rna" },
  { id: "bioTranslation", slug: "translation", label: "Translation", summary: "A ribosome reading an mRNA: A, P and E sites, codons, tRNAs, peptide growth and termination.", group: "geneExpression", icon: "ribosome" },
  { id: "bioDogma", slug: "dna-rna-protein", label: "DNA → RNA → protein", summary: "One gene from DNA to peptide, with reading frames and point mutations.", group: "geneExpression", icon: "biology" },
  { id: "bioRegulation", slug: "gene-regulation", label: "Gene regulation", summary: "The lac and trp operons and a eukaryotic promoter: repressors, activators, attenuation, enhancers and chromatin.", group: "geneExpression", icon: "operon" },
  { id: "bioGenetics", slug: "genetics", label: "Genetics & inheritance", summary: "Chromosomes, alleles, gametes and offspring: Punnett squares, dominance patterns, X-linkage and linked genes.", group: "inheritance", icon: "chromosome" },
  { id: "bioDivision", slug: "mitosis-meiosis", label: "Mitosis & meiosis", summary: "Chromosomes and chromatids through mitosis and meiosis: crossing over, independent assortment and nondisjunction.", group: "inheritance", icon: "cell" },
  { id: "bioMembrane", slug: "membranes-transport", label: "Membranes & transport", summary: "The phospholipid bilayer, passive and active transport, ion gradients and the Nernst potential, the Na⁺/K⁺ pump, and osmosis and tonicity.", group: "cellular", icon: "membrane" },
  { id: "bioSignaling", slug: "cell-signaling", label: "Cell signaling", summary: "Receptor classes and signal transduction: GPCR (Gs, Gi, Gq), the EGFR–Ras–ERK cascade, ligand-gated channels and intracellular receptors, with inhibitors, mutations and termination.", group: "cellular", icon: "signaling" },
  { id: "bioNeuron", slug: "neuronal-physiology", label: "Neuronal physiology", summary: "Neuron anatomy, resting potential, passive RC membrane, a Hodgkin–Huxley action potential, propagation and myelination, chemical synapses and synaptic summation.", group: "cellular", icon: "neuron" },
  { id: "bioOrganelles", slug: "organelles-trafficking", label: "Organelles & protein trafficking", summary: "A selectable eukaryotic cell and a cargo tracker: follow a secreted, membrane, lysosomal, nuclear, mitochondrial or cytosolic protein through its route, with vesicle coats, endosomes, protein quality control and perturbations.", group: "cellOrg", icon: "cell" },
  { id: "bioCellCycle", slug: "cell-cycle-checkpoints", label: "Cell cycle & checkpoints", summary: "Cyclin–CDK regulation, G1/S control by RB and E2F, replication licensing, the DNA-damage checkpoint, G2/M control and the spindle assembly checkpoint with anaphase gating.", group: "cellOrg", icon: "chromosome" },
  { id: "bioCellDeath", slug: "apoptosis-autophagy", label: "Apoptosis & autophagy", summary: "Intrinsic and extrinsic apoptosis, the caspase cascade, macroautophagy and a fate map linking stressors to the modelled mechanisms, with perturbations and explicit uncertainty.", group: "cellOrg", icon: "biology" },
  { id: "bioSaved", slug: "saved", label: "Saved", summary: "Reopen analyses saved on this device.", group: "library", icon: "saved" },
];


export type BiochemistryToolId = "bcOverview" | "bcAminoAcids" | "bcProteins" | "bcEnzymes" | "bcGlycolysis" | "bcGluconeogenesis" | "bcTca" | "bcEtc" | "bcMetabolism" | "bcFattyAcids" | "bcAminoMetabolism" | "bcFuel" | "bcSaved";

export const BIOCHEMISTRY_TOOLS: ToolDef[] = [
  { id: "bcOverview", slug: "overview", label: "Overview", summary: "What Biochemistry offers now, and what is still planned.", group: "analyze", icon: "biochemistry" },
  { id: "bcAminoAcids", slug: "amino-acids", label: "Amino acids & peptides", summary: "The 20 amino acids: structures, side chains, ionization and pKa, and peptide bonds in sequences you build.", group: "biomolecules", icon: "molecule" },
  { id: "bcProteins", slug: "protein-structure", label: "Protein structure & folding", summary: "Primary to quaternary structure, α-helices, β-sheets, Ramachandran angles, stabilizing interactions and mutations.", group: "biomolecules", icon: "chromosome" },
  { id: "bcEnzymes", slug: "enzymes", label: "Enzymes & catalysis", summary: "Enzyme–substrate binding, a catalytic mechanism, Michaelis–Menten kinetics and the four kinds of reversible inhibition.", group: "biomolecules", icon: "kinetics" },
  { id: "bcGlycolysis", slug: "glycolysis", label: "Glycolysis", summary: "The ten reactions from glucose to pyruvate: ATP investment and payoff, NADH, irreversible steps and regulation.", group: "metabolism", icon: "kinetics" },
  { id: "bcGluconeogenesis", slug: "gluconeogenesis", label: "Gluconeogenesis", summary: "Pyruvate to glucose: the shared reversible steps, the three bypasses, energy cost and reciprocal regulation, side by side with glycolysis.", group: "metabolism", icon: "kinetics" },
  { id: "bcTca", slug: "citric-acid-cycle", label: "Pyruvate oxidation & citric acid cycle", summary: "The pyruvate dehydrogenase complex and the eight cycle reactions: carbon counts, carriers, oxaloacetate regeneration and regulation.", group: "metabolism", icon: "kinetics" },
  { id: "bcEtc", slug: "electron-transport", label: "Electron transport & oxidative phosphorylation", summary: "Complexes I to IV, coenzyme Q, cytochrome c, the proton gradient and ATP synthase; NADH versus FADH₂, inhibitors and uncouplers.", group: "metabolism", icon: "kinetics" },
  { id: "bcMetabolism", slug: "metabolic-map", label: "Integrated metabolic map", summary: "One connected map from glucose to oxidative phosphorylation, with shared metabolites, an energy ledger and qualitative scenarios.", group: "metabolism", icon: "kinetics" },
  { id: "bcFattyAcids", slug: "fatty-acids-ketone-bodies", label: "Fatty-acid & ketone-body metabolism", summary: "Fatty-acid structure, activation, the carnitine shuttle, β-oxidation and its ledger, fatty-acid synthesis, ketogenesis, ketolysis and the reciprocal regulation of synthesis and oxidation.", group: "metabolism", icon: "kinetics" },
  { id: "bcAminoMetabolism", slug: "amino-acid-metabolism", label: "Amino-acid metabolism & urea cycle", summary: "Transamination with pyridoxal phosphate, oxidative deamination, carbon-skeleton destinations (glucogenic, ketogenic), nitrogen carriers and the five-step urea cycle with its nitrogen and ATP ledgers.", group: "metabolism", icon: "kinetics" },
  { id: "bcFuel", slug: "fuel-metabolism", label: "Integrated fuel metabolism", summary: "Carbohydrate, fatty-acid, ketone-body and amino-acid metabolism on one map: shared metabolites, separate carbon, nitrogen and energy ledgers, tissue context and qualitative scenarios.", group: "metabolism", icon: "kinetics" },
  { id: "bcSaved", slug: "saved", label: "Saved", summary: "Reopen analyses saved on this device.", group: "library", icon: "saved" },
];

/** The tool ids of every non-Organic subject (Organic keeps its own page state in App.tsx). */
export type SubjectToolId = GeneralToolId | PhysicsToolId | BiologyToolId | BiochemistryToolId;

/** Tools of every subject. Planned subjects have none: they cannot render a tool until they are implemented. */
export const SUBJECT_TOOLS: Record<SubjectId, ToolDef[]> = {
  organic: ORGANIC_TOOLS,
  general: GENERAL_TOOLS,
  physics: PHYSICS_TOOLS,
  biology: BIOLOGY_TOOLS,
  biochemistry: BIOCHEMISTRY_TOOLS,
};

export const getSubject = (id: SubjectId): SubjectDef => SUBJECTS.find((subject) => subject.id === id) ?? SUBJECTS[0];
export const isAvailable = (id: SubjectId): boolean => getSubject(id).status === "available" && SUBJECT_TOOLS[id].length > 0;

// ---- routes (#/<subject>/<tool>) -------------------------------------------------------------------------------------

export interface Route { subject: SubjectId; toolId: string }

export function routeHash(route: Route): string {
  const subject = getSubject(route.subject);
  const tool = SUBJECT_TOOLS[route.subject].find((entry) => entry.id === route.toolId);
  return tool ? `#/${subject.slug}/${tool.slug}` : `#/${subject.slug}`;
}

/** Parses a location hash. Unknown, malformed or planned-subject routes give null (callers keep their default). */
export function parseRoute(hash: string): Route | null {
  const match = /^#\/([a-z-]+)(?:\/([a-z-]+))?\/?$/.exec(hash);
  if (!match) return null;
  const subject = SUBJECTS.find((entry) => entry.slug === match[1]);
  if (!subject || !isAvailable(subject.id)) return null;
  const tools = SUBJECT_TOOLS[subject.id];
  const tool = match[2] ? tools.find((entry) => entry.slug === match[2]) : tools[0];
  return tool ? { subject: subject.id, toolId: tool.id } : null;
}
