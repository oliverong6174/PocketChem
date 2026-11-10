import type { IconName } from "../components/ui/Icon";

/**
 * Subject architecture. PocketChem is organised as subjects (branches of science) that each belong to a
 * product mode:
 *   workbench  - Scientific Workbench: draw / compute / compare tools (Organic, General Chemistry, Physics)
 *   learning   - Interactive Learning: explore / practice / challenge diagrams (Biology, Biochemistry)
 * Only Organic Chemistry is implemented. Planned subjects are listed so the navigation does not need
 * redesigning later, but they are informational only and never render tool interfaces.
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
}

export const MODE_LABELS: Record<SubjectMode, { label: string; blurb: string }> = {
  workbench: { label: "Scientific Workbench", blurb: "Draw, compute and compare with quantitative tools." },
  learning: { label: "Interactive Learning", blurb: "Explore labelled diagrams, practise, then predict outcomes." },
};

export const SUBJECTS: SubjectDef[] = [
  { id: "organic", label: "Organic Chemistry", mode: "workbench", icon: "molecule", status: "available", tagline: "Structures, reactions, synthesis, spectra and conformations." },
  {
    id: "general", label: "General Chemistry", mode: "workbench", icon: "general", status: "planned",
    tagline: "Stoichiometry, equilibria, thermochemistry and periodic trends.",
    planned: ["Stoichiometry and limiting reagents", "Equilibrium and acid-base calculations", "Thermochemistry", "Periodic trends"],
  },
  {
    id: "physics", label: "Physics", mode: "workbench", icon: "physics", status: "planned",
    tagline: "Mechanics, waves, circuits and simulations with explicit units.",
    planned: ["Kinematics and forces", "Waves and optics", "Circuits", "Unit-aware calculators"],
  },
  {
    id: "biology", label: "Biology", mode: "learning", icon: "biology", status: "planned",
    tagline: "Labelled, explorable diagrams of cells, systems and processes.",
    planned: ["Cell structure explorer", "Inheritance and genetics", "Physiology pathways", "Label-hiding practice"],
  },
  {
    id: "biochemistry", label: "Biochemistry", mode: "learning", icon: "biochemistry", status: "planned",
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
  label: string;
  /** One line: what the tool is for. */
  summary: string;
  group: ToolGroupId;
  icon: IconName;
}

/** Tools of each available subject. Adding a subject means adding an entry here, not changing the shell. */
export const ORGANIC_TOOLS: ToolDef[] = [
  { id: "analysis", label: "Properties", summary: "Draw a molecule; read its name, formula, groups and acid/base behaviour.", group: "analyze", icon: "molecule" },
  { id: "acidBase", label: "Ranking", summary: "Rank up to five molecules by acidity, basicity and other measures.", group: "analyze", icon: "ranking" },
  { id: "spectroscopy", label: "Spectroscopy", summary: "Estimate IR, NMR and mass spectra for a structure.", group: "analyze", icon: "spectrum" },
  { id: "conformations", label: "Conformations", summary: "Chair flips, Newman and sawhorse projections with a strain model.", group: "analyze", icon: "conformations" },
  { id: "reactions", label: "Reactions", summary: "Choose reagents and predict products with stereochemistry.", group: "synthesize", icon: "reactions" },
  { id: "multiStep", label: "Multi-Step", summary: "Plan forward or retro-synthetic routes between molecules.", group: "synthesize", icon: "route" },
  { id: "multiCatalytic", label: "Multi-Catalytic", summary: "Apply a sequence of reagent and catalyst conditions.", group: "synthesize", icon: "catalysis" },
  { id: "saved", label: "Saved", summary: "Reopen analyses saved on this device.", group: "library", icon: "saved" },
];
