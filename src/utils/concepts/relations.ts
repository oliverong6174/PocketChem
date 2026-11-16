/**
 * Stage 19: typed relationships between tools of different subjects.
 *
 * A relation says how two tools are connected scientifically, in one sentence, with an optional caution when the connection is
 * conceptual rather than numerical. Relations are NOT equivalences: "related" never means the two models share numbers. A relation
 * that moves data does so through the one-shot validated handoff slot (utils/biology/handoff16.ts) and only on an explicit click;
 * the relations here only describe and open.
 *
 * Endpoints are tool destinations in the single subject registry; `validateRelations()` fails if one does not exist.
 */
import { SUBJECT_TOOLS } from "../../navigation/subjects";
import { isValidDestination, type ConceptDestination } from "./conceptIndex";

export type RelationType = "related" | "prerequisite" | "mechanism" | "continues" | "tool";

export const RELATION_LABEL: Record<RelationType, string> = {
  related: "Related concept",
  prerequisite: "Builds on",
  mechanism: "Mechanistic explanation",
  continues: "Continues the process",
  tool: "Applicable analytical tool",
};

export interface ToolRelation {
  id: string;
  from: ConceptDestination;
  to: ConceptDestination;
  type: RelationType;
  /** Link text (names the destination in the learner's words). */
  label: string;
  /** Why the destination is relevant. */
  explanation: string;
  /** What the connection does NOT mean (shown after the explanation). */
  caution?: string;
}

const at = (subject: ConceptDestination["subject"], toolId: string): ConceptDestination => ({ subject, toolId });

export const RELATIONS: ToolRelation[] = [
  // Biology -> Biochemistry
  { id: "translation-to-peptides", from: at("biology", "bioTranslation"), to: at("biochemistry", "bcAminoAcids"), type: "continues", label: "Peptide builder (Biochemistry)", explanation: "A translated peptide is a chain of amino acids joined by peptide bonds. The peptide builder lists its residues, formula, mass and charge, keeping the N-to-C order.", caution: "Only the amino-acid sequence is passed on. The tool does not predict how the peptide folds." },
  { id: "dogma-to-peptides", from: at("biology", "bioDogma"), to: at("biochemistry", "bcAminoAcids"), type: "continues", label: "Amino acids and peptides (Biochemistry)", explanation: "The peptide this gene encodes is built from the amino acids described there, with the chemistry of the side chains.", caution: "A mutation here changes the amino-acid sequence; what it does to function or folding is not computed." },
  // Gene expression progression
  { id: "transcription-to-translation", from: at("biology", "bioTranscription"), to: at("biology", "bioTranslation"), type: "continues", label: "Translation", explanation: "The mature mRNA that transcription and processing produce is what the ribosome reads next." },
  { id: "regulation-to-transcription", from: at("biology", "bioRegulation"), to: at("biology", "bioTranscription"), type: "mechanism", label: "Transcription and RNA processing", explanation: "Regulators act mostly by changing how often RNA polymerase transcribes a gene; this tool shows the transcription step itself." },
  { id: "regulation-to-translation", from: at("biology", "bioRegulation"), to: at("biology", "bioTranslation"), type: "continues", label: "Translation", explanation: "Once a regulated gene is transcribed, its mRNA is translated into protein.", caution: "The regulation diagrams are schematic and carry no sequence, so nothing is transferred." },
  // Biochemistry -> General Chemistry
  { id: "amino-acids-to-acid-base", from: at("biochemistry", "bcAminoAcids"), to: at("general", "gcAcidBase"), type: "tool", label: "Acid–base and titration (General Chemistry)", explanation: "Whether an amino or carboxyl group is protonated depends on the pH relative to its pKa (the Henderson–Hasselbalch relationship). The acid–base tool works through that equilibrium for a single acid or base.", caution: "No pKa is copied across. An amino acid has several ionizable groups that influence each other, and the acid–base tool models one monoprotic acid or base at a time." },
  { id: "amino-acids-to-translation", from: at("biochemistry", "bcAminoAcids"), to: at("biology", "bioTranslation"), type: "mechanism", label: "Translation (Biology)", explanation: "Shows how cells assemble amino acids into a peptide, one codon at a time." },
  { id: "acid-base-to-amino-acids", from: at("general", "gcAcidBase"), to: at("biochemistry", "bcAminoAcids"), type: "related", label: "Amino acid ionization (Biochemistry)", explanation: "Amino acids are weak acids and bases, so their charge changes with pH exactly as pKa and pH predict for each group.", caution: "The acid–base tool is for one monoprotic species; amino acids are polyprotic." },
  // Enzymes and metabolism
  { id: "enzymes-to-glycolysis", from: at("biochemistry", "bcEnzymes"), to: at("biochemistry", "bcGlycolysis"), type: "related", label: "Glycolysis: enzymes in a pathway", explanation: "Hexokinase, PFK-1 and pyruvate kinase are enzymes whose catalysis and regulation matter to a pathway.", caution: "The Michaelis–Menten model here is a standalone single-substrate teaching model. It does not predict the flux through a pathway in a living cell, where substrate levels, regulation and many enzymes interact." },
  { id: "enzymes-to-regulation", from: at("biochemistry", "bcEnzymes"), to: at("biochemistry", "bcMetabolism"), type: "continues", label: "Integrated metabolic map", explanation: "Allosteric and covalent regulation of key enzymes decides how pathways respond to energy state.", caution: "The map shows qualitative regulation directions, not rates." },
  { id: "enzymes-to-kinetics", from: at("biochemistry", "bcEnzymes"), to: at("general", "gcKinetics"), type: "prerequisite", label: "Reaction kinetics (General Chemistry)", explanation: "Michaelis–Menten kinetics extends ordinary rate laws: at low substrate the rate is first order, and at saturation it is zero order." },
  { id: "kinetics-to-enzymes", from: at("general", "gcKinetics"), to: at("biochemistry", "bcEnzymes"), type: "continues", label: "Enzymes and catalysis (Biochemistry)", explanation: "Enzymes lower activation energy and so change the rate constant; the enzyme tool treats saturation kinetics." },
  // Thermodynamics <-> metabolism
  { id: "thermo-to-metabolism", from: at("general", "gcThermo"), to: at("biochemistry", "bcMetabolism"), type: "related", label: "Metabolism and energy coupling (Biochemistry)", explanation: "A reaction with a positive ΔG can proceed when it is coupled to one with a sufficiently negative ΔG, such as ATP hydrolysis. The metabolic map tallies the ATP and electron carriers that pathways make and spend.", caution: "The thermodynamics calculator is idealized (standard conditions, ideal behaviour). It does not predict cellular concentrations, rates or metabolic flux, and the metabolic map shows no ΔG values." },
  { id: "metabolism-to-thermo", from: at("biochemistry", "bcMetabolism"), to: at("general", "gcThermo"), type: "prerequisite", label: "Gibbs energy (General Chemistry)", explanation: "Why a pathway step is favourable or must be driven depends on ΔG = ΔH − TΔS; this is the underlying idea behind energy coupling.", caution: "The two tools do not exchange numbers." },
  // Physics (conceptual only)
  { id: "energy-to-thermo", from: at("physics", "phEnergy"), to: at("general", "gcThermo"), type: "related", label: "Thermodynamics (General Chemistry)", explanation: "Energy is conserved in both settings, but thermodynamics also tracks heat and entropy.", caution: "Mechanical energy and chemical Gibbs energy are different models; their numbers are not interchangeable." },
  { id: "waves-to-spectroscopy", from: at("physics", "phWaves"), to: at("organic", "spectroscopy"), type: "related", label: "Spectroscopy (Organic Chemistry)", explanation: "Spectra are measured as a function of the frequency or wavelength of a wave, and an absorption band is where the radiation's frequency matches a molecular transition.", caution: "The Waves laboratory models waves in a medium (sound, strings); it does not model electromagnetic waves or molecular vibrations." },
  { id: "interference-to-waves", from: at("physics", "phInterference"), to: at("physics", "phWaves"), type: "related", label: "Superposition and beats", explanation: "Interference fringes are the superposition of waves arriving with different phases, the same addition that gives standing waves and beats.", caution: "Light is modelled as a scalar wave here; sound waves in a medium are a separate model." },
  { id: "optics-to-interference", from: at("physics", "phOptics"), to: at("physics", "phInterference"), type: "related", label: "Interference and diffraction", explanation: "Geometric optics treats light as rays; interference and diffraction show where that approximation fails, when slits or obstacles are comparable to the wavelength.", caution: "The ray model is valid only for objects much larger than the wavelength." },
  { id: "rc-to-kinetics", from: at("physics", "phRc"), to: at("general", "gcKinetics"), type: "related", label: "First-order kinetics (General Chemistry)", explanation: "A charging capacitor and a first-order reaction both follow exponential approach laws.", caution: "A mathematical analogy only; the quantities are unrelated." },
  // Organic
  { id: "reactions-to-multistep", from: at("organic", "reactions"), to: at("organic", "multiStep"), type: "continues", label: "Multi-step synthesis", explanation: "Chain single transformations into a route from a starting material to a target." },
  { id: "analysis-to-ranking", from: at("organic", "analysis"), to: at("organic", "acidBase"), type: "related", label: "Ranking", explanation: "Compare this molecule's acidity or basicity with up to four others." },
  { id: "ranking-to-acid-base", from: at("organic", "acidBase"), to: at("general", "gcAcidBase"), type: "prerequisite", label: "pH and acid–base (General Chemistry)", explanation: "pKa and the acid–base equilibrium underlie any acidity ranking." },
];

export function relationsFrom(subject: ConceptDestination["subject"], toolId: string, limit = 3): ToolRelation[] {
  return RELATIONS.filter((relation) => relation.from.subject === subject && relation.from.toolId === toolId).slice(0, limit);
}

export function validateRelations(relations: readonly ToolRelation[] = RELATIONS): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const relation of relations) {
    if (ids.has(relation.id)) problems.push(`duplicate relation id ${relation.id}`);
    ids.add(relation.id);
    if (!isValidDestination(relation.from)) problems.push(`${relation.id}: source is not a real tool`);
    if (!isValidDestination(relation.to)) problems.push(`${relation.id}: destination is not a real tool`);
    if (relation.from.subject === relation.to.subject && relation.from.toolId === relation.to.toolId) problems.push(`${relation.id}: relates a tool to itself`);
    if (!relation.explanation.trim() || !relation.label.trim()) problems.push(`${relation.id}: missing text`);
  }
  return problems;
}

/** The destination tool's registry label (for tests and accessible names). */
export const destinationLabel = (destination: ConceptDestination): string => SUBJECT_TOOLS[destination.subject].find((tool) => tool.id === destination.toolId)?.label ?? "";
