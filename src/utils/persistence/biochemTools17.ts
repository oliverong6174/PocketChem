/**
 * Saved state of the Stage 17 Biochemistry tools (persisted pages "aminoacids", "proteins", "enzymes"; subject "biochemistry").
 *
 * Inputs are the scientific state: the residue or sequence, pH, structure parameters, kinetic constants, the view shown and the learning
 * mode. Every structure, charge, bond list, velocity and curve is rebuilt from them on open, never read back. Validators build new
 * objects from known fields, reject unknown ids, out-of-range numbers and unusable sequences, and never coerce.
 */
import { AMINO_ACIDS_BY_ONE } from "../biochem/aminoAcids";
import { isoelectricPoint, netCharge, peptideNetCharge, peptideIsoelectricPoint } from "../biochem/ionization";
import { parsePeptide, peptideFormula } from "../biochem/peptide";
import {
  DEFAULT_CONDITIONS, HELIX_LIMITS, SCENARIOS, SHEET_LIMITS, PROTEIN_EXAMPLES, analyzeConditions, classifyPhiPsi, RAMA_LABEL,
  type InteractionConditions, type Thermal,
} from "../biochem/protein";
import {
  DEFAULT_ENERGY_INPUT, DEFAULT_ENZYME_INPUT, MECHANISM, apparentParameters, inhibitedVelocity, validateEnergyInput, validateEnzymeInput,
  type BindingModel, type EnergyInput, type EnzymeInput,
} from "../biochem/enzyme";
import type { LearningMode } from "../../components/ui/LearningModeSwitch";

export const AMINOACIDS_ENGINE_VERSION = 1;
export const PROTEINS_ENGINE_VERSION = 1;
export const ENZYMES_ENGINE_VERSION = 1;

const MODES: readonly LearningMode[] = ["explore", "practice", "challenge"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const validMode = (v: unknown): v is LearningMode => typeof v === "string" && (MODES as readonly string[]).includes(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const isLetter = (v: unknown): v is string => typeof v === "string" && v.length === 1 && v in AMINO_ACIDS_BY_ONE;

// ---- amino acids & peptides ---------------------------------------------------------------------------------------------------

export const AA_VIEWS = ["residue", "compare", "ionization", "peptide"] as const;
export type AaView = (typeof AA_VIEWS)[number];
export type AminoAcidsInputs = {
  subject: "biochemistry"; tool: "aminoacids"; mode: LearningMode; view: AaView;
  residue: string; other: string; pH: number; sequence: string;
  /** Residue index selected in the peptide (null = none). */
  selected: number | null; challenge: number;
};
export const DEFAULT_AMINOACIDS_INPUTS: AminoAcidsInputs = {
  subject: "biochemistry", tool: "aminoacids", mode: "explore", view: "residue", residue: "A", other: "L", pH: 7, sequence: "GAS", selected: null, challenge: 0,
};
export function validateAminoAcidsInputs(raw: unknown): AminoAcidsInputs | null {
  if (!isObject(raw) || raw.subject !== "biochemistry" || raw.tool !== "aminoacids" || !validMode(raw.mode)) return null;
  if (typeof raw.view !== "string" || !(AA_VIEWS as readonly string[]).includes(raw.view)) return null;
  if (!isLetter(raw.residue) || !isLetter(raw.other) || !isNum(raw.pH, 0, 14) || !isInt(raw.challenge, 0, 10000)) return null;
  const p = parsePeptide(raw.sequence);
  if (!p.ok || p.ignored !== 0 || p.seq !== raw.sequence) return null;
  let selected: number | null = null;
  if (raw.selected !== null) { if (!isInt(raw.selected, 0, p.seq.length - 1)) return null; selected = raw.selected; }
  return { subject: "biochemistry", tool: "aminoacids", mode: raw.mode, view: raw.view as AaView, residue: raw.residue, other: raw.other, pH: Math.round(raw.pH * 10) / 10, sequence: p.seq, selected, challenge: raw.challenge };
}
export function describeAminoAcidsAnalysis(i: AminoAcidsInputs): string {
  if (i.view === "peptide") return `Peptide ${i.sequence} (${i.sequence.length} residues, pH ${i.pH.toFixed(1)})`;
  if (i.view === "compare") return `${AMINO_ACIDS_BY_ONE[i.residue].name} vs ${AMINO_ACIDS_BY_ONE[i.other].name}`;
  if (i.view === "ionization") return `${AMINO_ACIDS_BY_ONE[i.residue].name} ionization at pH ${i.pH.toFixed(1)}`;
  return `${AMINO_ACIDS_BY_ONE[i.residue].name} (${AMINO_ACIDS_BY_ONE[i.residue].three})`;
}

// ---- protein structure --------------------------------------------------------------------------------------------------------

export const PROTEIN_VIEWS = ["levels", "helix", "sheet", "rama", "interactions", "mutation"] as const;
export type ProteinView = (typeof PROTEIN_VIEWS)[number];
export type RamaResidue = "general" | "G" | "P";
export type ProteinsInputs = {
  subject: "biochemistry"; tool: "proteins"; mode: LearningMode; view: ProteinView;
  example: string; helixLength: number; sheetKind: "parallel" | "antiparallel"; strandLength: number; strands: number;
  phi: number; psi: number; ramaResidue: RamaResidue; conditions: InteractionConditions; scenario: string; mutant: string; challenge: number;
};
export const DEFAULT_PROTEINS_INPUTS: ProteinsInputs = {
  subject: "biochemistry", tool: "proteins", mode: "explore", view: "levels", example: PROTEIN_EXAMPLES[0].id, helixLength: 14, sheetKind: "antiparallel", strandLength: 6, strands: 3,
  phi: -57, psi: -47, ramaResidue: "general", conditions: DEFAULT_CONDITIONS, scenario: SCENARIOS[0].id, mutant: SCENARIOS[0].suggested, challenge: 0,
};
function validateConditions(raw: unknown): InteractionConditions | null {
  if (!isObject(raw) || !isNum(raw.pH, 0, 14) || typeof raw.reducingAgent !== "boolean" || typeof raw.denaturant !== "boolean") return null;
  if (raw.thermal !== "low" && raw.thermal !== "moderate" && raw.thermal !== "high") return null;
  return { pH: Math.round(raw.pH * 10) / 10, thermal: raw.thermal as Thermal, reducingAgent: raw.reducingAgent, denaturant: raw.denaturant };
}
export function validateProteinsInputs(raw: unknown): ProteinsInputs | null {
  if (!isObject(raw) || raw.subject !== "biochemistry" || raw.tool !== "proteins" || !validMode(raw.mode)) return null;
  if (typeof raw.view !== "string" || !(PROTEIN_VIEWS as readonly string[]).includes(raw.view)) return null;
  if (typeof raw.example !== "string" || !PROTEIN_EXAMPLES.some((e) => e.id === raw.example)) return null;
  if (!isInt(raw.helixLength, HELIX_LIMITS.min, HELIX_LIMITS.max) || !isInt(raw.strandLength, SHEET_LIMITS.minLen, SHEET_LIMITS.maxLen) || !isInt(raw.strands, SHEET_LIMITS.minStrands, SHEET_LIMITS.maxStrands)) return null;
  if (raw.sheetKind !== "parallel" && raw.sheetKind !== "antiparallel") return null;
  if (!isNum(raw.phi, -180, 180) || !isNum(raw.psi, -180, 180) || !(raw.ramaResidue === "general" || raw.ramaResidue === "G" || raw.ramaResidue === "P")) return null;
  const conditions = validateConditions(raw.conditions);
  if (!conditions || typeof raw.scenario !== "string" || !SCENARIOS.some((s) => s.id === raw.scenario) || !isLetter(raw.mutant) || !isInt(raw.challenge, 0, 10000)) return null;
  return {
    subject: "biochemistry", tool: "proteins", mode: raw.mode, view: raw.view as ProteinView, example: raw.example, helixLength: raw.helixLength, sheetKind: raw.sheetKind, strandLength: raw.strandLength,
    strands: raw.strands, phi: Math.round(raw.phi), psi: Math.round(raw.psi), ramaResidue: raw.ramaResidue, conditions, scenario: raw.scenario, mutant: raw.mutant, challenge: raw.challenge,
  };
}
export function describeProteinsAnalysis(i: ProteinsInputs): string {
  switch (i.view) {
    case "helix": return `α-helix of ${i.helixLength} residues`;
    case "sheet": return `${i.sheetKind} β-sheet, ${i.strands} strands of ${i.strandLength}`;
    case "rama": return `Ramachandran φ ${i.phi}°, ψ ${i.psi}°`;
    case "interactions": return `Folding interactions at pH ${i.conditions.pH.toFixed(1)}`;
    case "mutation": return `Substitution to ${AMINO_ACIDS_BY_ONE[i.mutant].name}: ${SCENARIOS.find((s) => s.id === i.scenario)!.title}`.slice(0, 300);
    default: return `Structure levels: ${PROTEIN_EXAMPLES.find((e) => e.id === i.example)!.name}`;
  }
}

// ---- enzymes ------------------------------------------------------------------------------------------------------------------

export const ENZYME_VIEWS = ["binding", "mechanism", "kinetics", "energy"] as const;
export type EnzymeView = (typeof ENZYME_VIEWS)[number];
export type EnzymesInputs = {
  subject: "biochemistry"; tool: "enzymes"; mode: LearningMode; view: EnzymeView;
  binding: BindingModel; mechStep: number; kinetics: EnzymeInput; energy: EnergyInput; challenge: number;
};
export const DEFAULT_ENZYMES_INPUTS: EnzymesInputs = { subject: "biochemistry", tool: "enzymes", mode: "explore", view: "kinetics", binding: "induced-fit", mechStep: 0, kinetics: DEFAULT_ENZYME_INPUT, energy: DEFAULT_ENERGY_INPUT, challenge: 0 };
export function validateEnzymesInputs(raw: unknown): EnzymesInputs | null {
  if (!isObject(raw) || raw.subject !== "biochemistry" || raw.tool !== "enzymes" || !validMode(raw.mode)) return null;
  if (typeof raw.view !== "string" || !(ENZYME_VIEWS as readonly string[]).includes(raw.view)) return null;
  if (raw.binding !== "lock-and-key" && raw.binding !== "induced-fit" && raw.binding !== "conformational-selection") return null;
  if (!isInt(raw.mechStep, 0, MECHANISM.length - 1) || !isInt(raw.challenge, 0, 10000)) return null;
  const k = validateEnzymeInput(raw.kinetics), e = validateEnergyInput(raw.energy);
  if (!k.ok || !e.ok) return null;
  return { subject: "biochemistry", tool: "enzymes", mode: raw.mode, view: raw.view as EnzymeView, binding: raw.binding, mechStep: raw.mechStep, kinetics: k.value, energy: e.value, challenge: raw.challenge };
}
export function describeEnzymesAnalysis(i: EnzymesInputs): string {
  if (i.view === "kinetics") return `Kinetics: Vmax ${i.kinetics.vmax}, Km ${i.kinetics.km}, ${i.kinetics.inhibition.type === "none" ? "no inhibitor" : `${i.kinetics.inhibition.type} inhibitor`}`;
  if (i.view === "energy") return `Catalysis: ΔG° ${i.energy.deltaG} kJ/mol, ${i.energy.decades} decades faster`;
  if (i.view === "mechanism") return `Serine protease mechanism: ${MECHANISM[i.mechStep].title}`.slice(0, 300);
  return `Enzyme–substrate binding: ${i.binding}`;
}

// ---- summaries saved beside the inputs ----------------------------------------------------------------------------------------

export type BiochemResults = { engineVersion: number; headline: string[]; assumptions: string[]; check: number; checkLabel: string };
const res = (engineVersion: number, headline: string[], assumptions: string[], check: number, checkLabel: string): BiochemResults =>
  ({ engineVersion, headline: headline.map((h) => h.slice(0, 390)), assumptions, check, checkLabel });

export const AMINOACIDS_ASSUMPTIONS = [
  "pKa values are approximate textbook values for the free amino acid in water at 25 °C; in a peptide or protein the local environment shifts them (peptide-terminus and side-chain values here are typical, not measured).",
  "Charge is the Henderson–Hasselbalch average; isoelectric points are calculated from these pKa values and may differ from titration or software values by a few tenths.",
  "Hydropathy is the Kyte–Doolittle scale and volume the Zamyatnin residue volume; classes follow the common five-way grouping, which is a convention, not a sharp physical boundary.",
  "Structures are the L-amino acids drawn with RDKit from their SMILES; the peptide builder joins residues by standard peptide bonds and shows the neutral, un-ionized molecule.",
];
export const PROTEINS_ASSUMPTIONS = [
  "This tool illustrates secondary structure and stabilizing interactions with ideal geometry. It does not predict how a sequence folds and makes no claim to accurate protein-structure prediction.",
  "Ramachandran regions are broad textbook boundaries for a non-glycine, non-proline residue (glycine and proline have different allowed regions, handled separately); real structures also depend on neighbors.",
  "The interaction and mutation demonstrations are qualitative: they say which interaction is intact, weakened or lost and what is supported or uncertain, not a ΔΔG or a stability number.",
  "Protein examples (insulin, myoglobin, hemoglobin, GFP) are described from the literature; their fold is not drawn from coordinates.",
];
export const ENZYMES_ASSUMPTIONS = [
  "Michaelis–Menten kinetics assumes a single substrate, the steady-state (or rapid-equilibrium) approximation, [S] ≫ [E], and initial rates; allostery, cooperativity and product inhibition are not included.",
  "Inhibition uses the general reversible mixed-inhibition scheme with dissociation constants Ki (to E) and Ki′ (to ES): competitive (Ki′ → ∞), uncompetitive (Ki → ∞), noncompetitive (Ki = Ki′), mixed (otherwise).",
  "The catalytic mechanism is one worked example (a chymotrypsin-like serine protease); other enzymes use different strategies and step counts.",
  "Catalysis lowers the activation barrier and leaves ΔG° and the equilibrium constant unchanged; the energy diagram is schematic.",
];

export function summarizeAminoAcids(i: AminoAcidsInputs): BiochemResults | null {
  const a = AMINO_ACIDS_BY_ONE[i.residue], b = AMINO_ACIDS_BY_ONE[i.other];
  if (i.view === "peptide") {
    if (!parsePeptide(i.sequence).ok) return null;
    const pI = peptideIsoelectricPoint(i.sequence);
    return res(AMINOACIDS_ENGINE_VERSION, [`${i.sequence}: ${peptideFormula(i.sequence)}, ${i.sequence.length - 1} peptide bond${i.sequence.length === 2 ? "" : "s"}`, `Net charge at pH ${i.pH.toFixed(1)}: ${peptideNetCharge(i.sequence, i.pH).toFixed(2)}; pI ≈ ${pI.toFixed(2)}`], AMINOACIDS_ASSUMPTIONS, pI, "peptide pI");
  }
  if (i.view === "compare") return res(AMINOACIDS_ENGINE_VERSION, [`${a.name}: ${a.cls}, hydropathy ${a.hydropathy}`, `${b.name}: ${b.cls}, hydropathy ${b.hydropathy}`], AMINOACIDS_ASSUMPTIONS, a.hydropathy - b.hydropathy, "hydropathy difference");
  const pI = isoelectricPoint(a.groups);
  return res(AMINOACIDS_ENGINE_VERSION, [`${a.name} (${a.three}, ${a.one}): ${a.formula}`, `Net charge at pH ${i.pH.toFixed(1)}: ${netCharge(a, i.pH).toFixed(2)}; pI ≈ ${pI.toFixed(2)}`], AMINOACIDS_ASSUMPTIONS, pI, "pI");
}
export function summarizeProteins(i: ProteinsInputs): BiochemResults | null {
  if (i.view === "rama") {
    const c = classifyPhiPsi(i.phi, i.psi, i.ramaResidue);
    return res(PROTEINS_ENGINE_VERSION, [`φ ${i.phi}°, ψ ${i.psi}°: ${RAMA_LABEL[c]}`], PROTEINS_ASSUMPTIONS, c === "disallowed" ? 0 : 1, "allowed (1) or disallowed (0)");
  }
  if (i.view === "interactions") {
    const o = analyzeConditions(i.conditions);
    return res(PROTEINS_ENGINE_VERSION, [`Overall: ${o.overall}`, ...o.statuses.map((s) => `${s.label}: ${s.state}`)], PROTEINS_ASSUMPTIONS, o.statuses.filter((s) => s.state !== "intact").length, "interactions not intact");
  }
  if (i.view === "helix") return res(PROTEINS_ENGINE_VERSION, [`α-helix of ${i.helixLength} residues: ${i.helixLength - 4} i→i+4 hydrogen bonds`], PROTEINS_ASSUMPTIONS, i.helixLength - 4, "backbone hydrogen bonds");
  if (i.view === "sheet") return res(PROTEINS_ENGINE_VERSION, [`${i.sheetKind} sheet, ${i.strands} strands × ${i.strandLength} residues`], PROTEINS_ASSUMPTIONS, i.strands, "strands");
  return res(PROTEINS_ENGINE_VERSION, [describeProteinsAnalysis(i)], PROTEINS_ASSUMPTIONS, 0, "none");
}
export function summarizeEnzymes(i: EnzymesInputs): BiochemResults | null {
  const k = i.kinetics, app = apparentParameters(k.vmax, k.km, k.inhibition), v = inhibitedVelocity(k.vmax, k.km, k.substrate, k.inhibition);
  if (i.view === "kinetics") return res(ENZYMES_ENGINE_VERSION, [`v = ${v.toPrecision(4)} at [S] = ${k.substrate}`, `Apparent Vmax ${app.vmaxApp.toPrecision(4)}, apparent Km ${app.kmApp.toPrecision(4)}`], ENZYMES_ASSUMPTIONS, v, "initial velocity");
  return res(ENZYMES_ENGINE_VERSION, [describeEnzymesAnalysis(i)], ENZYMES_ASSUMPTIONS, v, "initial velocity");
}
