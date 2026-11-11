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
    tagline: "Acid–base, equilibrium, kinetics and thermodynamics today; more quantitative tools planned.",
    planned: ["Stoichiometry and limiting reagents", "Gas laws", "Solubility equilibria", "Periodic trends"],
  },
  {
    id: "physics", slug: "physics", label: "Physics", mode: "workbench", icon: "physics", status: "planned",
    tagline: "Mechanics, waves, circuits and simulations with explicit units.",
    planned: ["Kinematics and forces", "Waves and optics", "Circuits", "Unit-aware calculators"],
  },
  {
    id: "biology", slug: "biology", label: "Biology", mode: "learning", icon: "biology", status: "planned",
    tagline: "Labelled, explorable diagrams of cells, systems and processes.",
    planned: ["Cell structure explorer", "Inheritance and genetics", "Physiology pathways", "Label-hiding practice"],
  },
  {
    id: "biochemistry", slug: "biochemistry", label: "Biochemistry", mode: "learning", icon: "biochemistry", status: "planned",
    tagline: "Metabolic pathways, enzymes and macromolecule structure.",
    planned: ["Metabolic pathway maps", "Enzyme kinetics and inhibition", "Amino acids and protein structure", "Predict-the-change challenges"],
  },
];

export type ToolGroupId = "analyze" | "synthesize" | "library";

export const TOOL_GROUPS: Array<{ id: ToolGroupId; label: string }> = [
  { id: "analyze", label: "Analyze" },
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

export type GeneralToolId = "gcOverview" | "gcAcidBase" | "gcEquilibrium" | "gcKinetics" | "gcThermo" | "gcSaved";

export const GENERAL_TOOLS: ToolDef[] = [
  { id: "gcOverview", slug: "overview", label: "Overview", summary: "What General Chemistry offers now, and what is still planned.", group: "analyze", icon: "general" },
  { id: "gcAcidBase", slug: "acid-base-titration", label: "Acid–base & titration", summary: "pH, buffers, dilution and titration curves for monoprotic acids and bases.", group: "analyze", icon: "flask" },
  { id: "gcEquilibrium", slug: "equilibrium", label: "Chemical equilibrium", summary: "Q versus K, ICE tables, equilibrium compositions and Le Châtelier shifts for one reaction.", group: "analyze", icon: "equilibrium" },
  { id: "gcKinetics", slug: "kinetics", label: "Reaction kinetics", summary: "Zero-, first- and second-order rate laws, half-lives, rate-law fitting and Arrhenius.", group: "analyze", icon: "kinetics" },
  { id: "gcThermo", slug: "thermodynamics", label: "Thermodynamics", summary: "Gibbs energy versus temperature, Hess's law and calorimetry.", group: "analyze", icon: "thermo" },
  { id: "gcSaved", slug: "saved", label: "Saved", summary: "Reopen analyses saved on this device.", group: "library", icon: "saved" },
];

/** Tools of every subject. Planned subjects have none: they cannot render a tool until they are implemented. */
export const SUBJECT_TOOLS: Record<SubjectId, ToolDef[]> = {
  organic: ORGANIC_TOOLS,
  general: GENERAL_TOOLS,
  physics: [],
  biology: [],
  biochemistry: [],
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
