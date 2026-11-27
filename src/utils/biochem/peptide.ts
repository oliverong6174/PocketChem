/**
 * Peptide model (pure; no React): validated one-letter sequences (N-terminus first, the same orientation and alphabet as the Biology
 * Translation tool), composition, formula and masses, edit operations, and an explicit atom-level SMILES whose atom order is tracked so
 * the drawing can highlight backbone, side chains and peptide bonds without any guessing.
 */
import { AMINO_ACIDS_BY_ONE, ONE_LETTERS, avgMass, formulaText, monoMass, parseFormula, type AminoAcid } from "./aminoAcids";

export const PEPTIDE_LIMITS = { min: 1, max: 30 } as const;

export type ParsedPeptide = { ok: true; seq: string; ignored: number } | { ok: false; error: string; index?: number };

/** Upper-cases and ignores spaces, tabs, line breaks and hyphens; any other character outside the 20 letters is rejected with its position. */
export function parsePeptide(raw: unknown, max: number = PEPTIDE_LIMITS.max): ParsedPeptide {
  if (typeof raw !== "string") return { ok: false, error: "The sequence must be text." };
  let seq = "", ignored = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (/[\s-]/.test(ch)) { ignored += 1; continue; }
    const up = ch.toUpperCase();
    if (!ONE_LETTERS.includes(up)) {
      const hint = "BJOUXZ".includes(up) ? " (not one of the 20 standard amino acids)" : up === "*" ? " (a stop codon is not an amino acid)" : "";
      return { ok: false, error: `“${ch}” at position ${i + 1} is not a standard amino-acid letter${hint}. Use ${ONE_LETTERS}.`, index: i };
    }
    seq += up;
  }
  if (seq.length < PEPTIDE_LIMITS.min) return { ok: false, error: "Enter at least one residue." };
  if (seq.length > max) return { ok: false, error: `Diagrams are limited to ${max} residues (found ${seq.length}).` };
  return { ok: true, seq, ignored };
}

// ---- editing ----------------------------------------------------------------------------------------------------------------------
export const addResidue = (seq: string, one: string, at: number = seq.length): string | null => (seq.length >= PEPTIDE_LIMITS.max || !AMINO_ACIDS_BY_ONE[one] ? null : seq.slice(0, at) + one + seq.slice(at));
export const removeResidue = (seq: string, i: number): string | null => (seq.length <= PEPTIDE_LIMITS.min || i < 0 || i >= seq.length ? null : seq.slice(0, i) + seq.slice(i + 1));
export const replaceResidue = (seq: string, i: number, one: string): string | null => (i < 0 || i >= seq.length || !AMINO_ACIDS_BY_ONE[one] ? null : seq.slice(0, i) + one + seq.slice(i + 1));
/** Swaps residue i with its neighbour in the given direction (−1 toward the N-terminus, +1 toward the C-terminus). */
export function moveResidue(seq: string, i: number, dir: -1 | 1): string | null {
  const j = i + dir;
  if (i < 0 || j < 0 || i >= seq.length || j >= seq.length) return null;
  const a = [...seq];
  [a[i], a[j]] = [a[j], a[i]];
  return a.join("");
}
/** Reversal changes the peptide (N→C direction matters): Gly-Ala is not Ala-Gly. */
export const reversed = (seq: string) => [...seq].reverse().join("");

// ---- composition ------------------------------------------------------------------------------------------------------------------
export function composition(seq: string): Record<string, number> {
  const c: Record<string, number> = {};
  for (const r of seq) c[r] = (c[r] ?? 0) + 1;
  return c;
}

/** Elemental composition: the sum of the free amino acids minus one water per peptide bond. */
export function peptideAtoms(seq: string): Record<string, number> {
  const t: Record<string, number> = {};
  for (const r of seq) for (const [e, n] of Object.entries(parseFormula(AMINO_ACIDS_BY_ONE[r].formula))) t[e] = (t[e] ?? 0) + n;
  const bonds = seq.length - 1;
  t.H -= 2 * bonds; t.O -= bonds;
  return t;
}
export const peptideFormula = (seq: string) => formulaText(peptideAtoms(seq));
export const peptideMonoisotopicMass = (seq: string) => monoMass(peptideAtoms(seq));
export const peptideAverageMass = (seq: string) => avgMass(peptideAtoms(seq));
/** Mass of one residue as it sits in a chain (amino acid minus water). */
export function residueMass(one: string, kind: "mono" | "avg" = "mono"): number {
  const a = parseFormula(AMINO_ACIDS_BY_ONE[one].formula); a.H -= 2; a.O -= 1;
  return kind === "mono" ? monoMass(a) : avgMass(a);
}
/** Kyte–Doolittle mean hydropathy (GRAVY). */
export const gravy = (seq: string) => [...seq].reduce((s, r) => s + AMINO_ACIDS_BY_ONE[r].hydropathy, 0) / seq.length;

export interface PeptideSummary { length: number; formula: string; monoMass: number; avgMass: number; gravy: number; bonds: number; counts: { positive: number; negative: number; aromatic: number; hydrophobic: number; polar: number } }
export function summarizePeptide(seq: string): PeptideSummary {
  const c = (f: (a: AminoAcid) => boolean) => [...seq].filter((r) => f(AMINO_ACIDS_BY_ONE[r])).length;
  return {
    length: seq.length, formula: peptideFormula(seq), monoMass: peptideMonoisotopicMass(seq), avgMass: peptideAverageMass(seq), gravy: gravy(seq), bonds: seq.length - 1,
    counts: { positive: c((a) => a.one === "K" || a.one === "R"), negative: c((a) => a.one === "D" || a.one === "E"), aromatic: c((a) => a.one === "F" || a.one === "W" || a.one === "Y"), hydrophobic: c((a) => a.hydropathy > 1.5), polar: c((a) => a.cls === "polar-uncharged") },
  };
}

// ---- atom-level structure --------------------------------------------------------------------------------------------------------

export interface ResidueAtoms { one: string; N: number; CA: number; C: number; O: number; side: number[] }
export interface PeptideStructure {
  smiles: string;
  residues: ResidueAtoms[];
  /** Index of the C-terminal hydroxyl oxygen. */
  terminalO: number;
  /** One entry per peptide bond: the carbonyl C and O of residue i and the N of residue i+1 (the planar unit also includes both Cα). */
  bonds: Array<{ index: number; C: number; O: number; N: number; caBefore: number; caAfter: number }>;
  atomCount: number;
}

/** SMILES of a residue inside a chain (backbone N … C(=O)); the side-chain atoms follow the Cα in SMILES order. */
function piece(a: AminoAcid): { smi: string; n: number; ca: number; c: number; o: number; side: number[] } {
  if (a.one === "G") return { smi: "NCC(=O)", n: 0, ca: 1, c: 2, o: 3, side: [] };
  if (a.one === "P") return { smi: "N1CCC[C@H]1C(=O)", n: 0, ca: 4, c: 5, o: 6, side: [1, 2, 3] };
  const k = a.sideChainHeavyAtoms;
  return { smi: `N[C@@H](${a.branch})C(=O)`, n: 0, ca: 1, c: 2 + k, o: 3 + k, side: Array.from({ length: k }, (_, i) => 2 + i) };
}

export function peptideStructure(seq: string): PeptideStructure {
  let smiles = "", offset = 0;
  const residues: ResidueAtoms[] = [];
  for (const r of seq) {
    const p = piece(AMINO_ACIDS_BY_ONE[r]);
    smiles += p.smi;
    residues.push({ one: r, N: offset + p.n, CA: offset + p.ca, C: offset + p.c, O: offset + p.o, side: p.side.map((s) => offset + s) });
    offset += p.o + 1;
  }
  smiles += "O";
  const bonds = residues.slice(0, -1).map((r, i) => ({ index: i, C: r.C, O: r.O, N: residues[i + 1].N, caBefore: r.CA, caAfter: residues[i + 1].CA }));
  return { smiles, residues, terminalO: offset, bonds, atomCount: offset + 1 };
}

// ---- peptide-bond facts shown to the learner (approximate, textbook values) -----------------------------------------------------------
export const PEPTIDE_BOND_FACTS = [
  "The C–N bond of an amide is about 1.33 Å, between a typical C–N single bond (about 1.45–1.47 Å) and a C=N double bond (about 1.27 Å).",
  "Resonance delocalises the nitrogen lone pair into the carbonyl, giving the C–N bond partial double-bond character (often quoted as roughly 40 %) and placing a partial negative charge on O and a partial positive charge on N.",
  "Because of that partial double-bond character, rotation about C–N is restricted (a barrier of the order of 80 kJ/mol): the six atoms Cα, C, O, N, H, Cα lie in one plane, and the backbone can turn only about the N–Cα bond (φ) and the Cα–C bond (ψ).",
  "The two planar arrangements are trans (ω ≈ 180°, the usual one) and cis (ω ≈ 0°). Cis is rare for ordinary peptide bonds but occurs in a few percent of bonds that precede proline.",
  "Because the N–H and C=O point in opposite directions in the trans form, backbone groups are available for hydrogen bonds in helices and sheets.",
];
export const PEPTIDE_BOND_CONTEXT =
  "In water, forming a peptide bond from two free amino acids is thermodynamically uphill (hydrolysis is the favourable direction), although hydrolysis is very slow without a catalyst. Cells therefore build proteins with activated amino acids: ATP is used to attach each amino acid to its tRNA, and the ribosome (its rRNA catalyses the reaction) transfers the growing chain onto the next aminoacyl-tRNA. In the laboratory, peptides are made with coupling reagents or enzymes in controlled conditions.";
