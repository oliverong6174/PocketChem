/**
 * Ribosome timeline for translating an mRNA (pure; no React). The state at every step is derived from the mRNA, the chosen start
 * codon and the genetic code; nothing about the peptide is stored separately.
 *
 * Model: the ribosome has three tRNA sites. A (aminoacyl) takes the incoming aminoacyl-tRNA, P (peptidyl) holds the tRNA carrying
 * the growing chain, E (exit) holds the tRNA that has just given up its chain. One elongation cycle is: aminoacyl-tRNA enters the
 * A site (anticodon pairs with the codon), the peptidyl transferase (the rRNA of the large subunit) moves the chain onto the
 * amino acid in the A site, then translocation moves the mRNA by three nucleotides (A→P, P→E, next codon into A).
 *
 * Bacteria and eukaryotes differ in initiation: a bacterial small subunit binds the Shine–Dalgarno sequence just upstream of any
 * start codon and starts with formylmethionine; a eukaryotic small subunit binds the 5′ cap and scans to the first AUG, and starts
 * with unformylated methionine. Termination uses RF1/RF2 (bacteria) or the single eRF1 (eukaryotes).
 *
 * Simplifications (stated in the tool): every codon has its own tRNA whose anticodon is its exact reverse complement (real cells use
 * wobble pairing and fewer tRNAs); only AUG is accepted as a start codon (bacteria also use GUG and UUG); the Shine–Dalgarno
 * sequence and the Kozak context are described but not scored; elongation, initiation and release factors are named, not simulated;
 * the mitochondrial/alternative genetic codes, selenocysteine and frameshifting are not modelled.
 */
import { AMINO_ACIDS, anticodon5to3, anticodonUnderCodon, readCodon, releaseFactorFor, START_CODON } from "./geneticCode";
import { findStarts, segmentCodons, translateFrom, type Translation } from "./translate";
import type { Organism } from "./replication";

export const TRANSLATION_LIMITS = { minLen: 6, maxLen: 360 } as const;

export interface TranslationInput {
  mrna: string;
  organism: Organism;
  /** Index of the start codon's first base; null means "the first AUG" (the only choice for a scanning eukaryotic ribosome). */
  start: number | null;
  step: number;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const DEFAULT_TRANSLATION_INPUT: TranslationInput = {
  mrna: "GGAUGGCUAAACUGGGUUACUGAUUAAUAAAGCUAGC",
  organism: "eukaryote",
  start: null,
  step: 0,
};

export function validateTranslationInput(raw: unknown): Validation<TranslationInput> {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const mrna = typeof r.mrna === "string" ? r.mrna : "";
  if (!/^[ACGU]+$/.test(mrna)) errors.push("The mRNA must contain only A, C, G and U (5′→3′).");
  else if (mrna.length < TRANSLATION_LIMITS.minLen || mrna.length > TRANSLATION_LIMITS.maxLen) errors.push(`The mRNA must be ${TRANSLATION_LIMITS.minLen}–${TRANSLATION_LIMITS.maxLen} bases (found ${mrna.length}).`);
  if (r.organism !== "bacteria" && r.organism !== "eukaryote") errors.push("The organism must be bacteria or eukaryote.");
  let start: number | null = null;
  if (r.start !== null && r.start !== undefined) {
    if (typeof r.start !== "number" || !Number.isInteger(r.start)) errors.push("The start position must be a whole number or empty.");
    else {
      start = r.start;
      if (mrna && mrna.slice(start, start + 3) !== START_CODON) errors.push("The chosen start position is not an AUG.");
      else if (r.organism === "eukaryote" && mrna && start !== mrna.indexOf(START_CODON)) errors.push("A scanning eukaryotic ribosome starts at the first AUG; choose bacteria to select a different AUG.");
    }
  }
  if (typeof r.step !== "number" || !Number.isInteger(r.step) || r.step < 0) errors.push("The step must be a whole number of 0 or more.");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { mrna, organism: r.organism as Organism, start, step: r.step as number } };
}

export type TrPhase = "initiation" | "binding" | "peptidyl transfer" | "translocation" | "termination" | "stalled" | "finished";

export interface TrnaOnSite { codon: string; anticodon5to3: string; anticodonUnder: string; aa: string | null; aaName: string | null; initiator: boolean }

export interface TrStep {
  index: number;
  phase: TrPhase;
  /** Codon index being decoded (0 = start codon). */
  codonIndex: number;
  title: string;
  caption: string;
  /** Index in the mRNA of the first base of the codon in the A site (or of the codon about to enter it). */
  aSiteStart: number;
  sites: { E: TrnaOnSite | null; P: TrnaOnSite | null; A: TrnaOnSite | null };
  /** True once the A-site tRNA's amino acid has been joined to the chain. */
  chainOnA: boolean;
  /** Amino acids (one-letter) already joined to the chain, and where the chain is attached: "P" or "A". */
  peptide: string;
  released: boolean;
  /** Names of factors in action. */
  factors: string[];
  largeSubunit: boolean;
}

export interface TranslationModel {
  input: TranslationInput;
  start: number | null;
  translation: Translation | null;
  steps: TrStep[];
  /** 0-based step indices at which each codon's cycle begins (for "next codon"). */
  codonStarts: number[];
}

export function startFor(input: TranslationInput): number | null {
  if (input.start !== null) return input.start;
  const first = findStarts(input.mrna)[0];
  return first ? first.position : null;
}

const trna = (codon: string, initiator = false): TrnaOnSite => {
  const m = readCodon(codon);
  const aa = m?.kind === "amino" ? m.aa : null;
  return { codon, anticodon5to3: anticodon5to3(codon), anticodonUnder: anticodonUnderCodon(codon), aa, aaName: aa ? AMINO_ACIDS[aa].name : null, initiator };
};

export function buildTranslation(input: TranslationInput): TranslationModel {
  const { mrna, organism } = input;
  const start = startFor(input);
  const bact = organism === "bacteria";
  const steps: TrStep[] = [];
  const codonStarts: number[] = [];
  if (start === null) {
    steps.push({ index: 0, phase: "stalled", codonIndex: 0, title: "No start codon", caption: "There is no AUG in this mRNA, so the small subunit has nowhere to begin: no translation occurs.", aSiteStart: 0, sites: { E: null, P: null, A: null }, chainOnA: false, peptide: "", released: false, factors: [], largeSubunit: false });
    return { input, start, translation: null, steps, codonStarts };
  }
  const translation = translateFrom(mrna, start);
  const { codons } = segmentCodons(mrna.slice(start), 0);
  const initName = bact ? "fMet" : "Met";
  const push = (s: Omit<TrStep, "index">) => steps.push({ ...s, index: steps.length });
  const empty = { E: null, P: null, A: null } as TrStep["sites"];

  push({ phase: "initiation", codonIndex: 0, title: "Small subunit on the mRNA", aSiteStart: start + 3, sites: empty, chainOnA: false, peptide: "", released: false, largeSubunit: false, factors: [bact ? "IF1, IF2, IF3" : "eIF2, eIF4F, eIF3"],
    caption: bact
      ? `The small (30S) subunit binds the mRNA by pairing its 16S rRNA with the Shine–Dalgarno sequence a few nucleotides upstream of the start codon (the model does not search for it). The start codon AUG (position ${start + 1}) is placed at the P site.`
      : `The small (40S) subunit, with initiator tRNA, binds the 5′ cap and scans along the mRNA 5′→3′ until it reaches the first AUG (position ${start + 1}), ideally in a Kozak context.` });
  push({ phase: "initiation", codonIndex: 0, title: "Initiator tRNA and large subunit", aSiteStart: start + 3, sites: { E: null, P: trna(START_CODON, true), A: null }, chainOnA: false, peptide: "M", released: false, largeSubunit: true, factors: [bact ? "IF2·GTP" : "eIF5B·GTP"],
    caption: `${initName}-tRNA (anticodon 5′-${anticodon5to3(START_CODON)}-3′) pairs with AUG in the P site and the large subunit joins. The chain so far is just ${bact ? "formylmethionine" : "methionine"}. The A site is open for codon 2.` });
  codonStarts.push(1);

  let peptide = "M";
  let prevP: TrnaOnSite = trna(START_CODON, true);
  let prevE: TrnaOnSite | null = null;
  for (let i = 1; i < codons.length; i += 1) {
    const c = codons[i];
    const pos = start + 3 * i;
    const t = trna(c.codon);
    if (c.kind === "stop") {
      const rf = bact ? releaseFactorFor(c.codon).join(" or ") : "eRF1";
      codonStarts.push(steps.length);
      push({ phase: "termination", codonIndex: i, title: `Stop codon ${c.codon}`, aSiteStart: pos, sites: { E: prevE, P: prevP, A: null }, chainOnA: false, peptide, released: false, largeSubunit: true, factors: [rf],
        caption: `${c.codon} enters the A site. No tRNA matches a stop codon; ${bact ? `release factor ${rf} (RF1 reads UAA and UAG, RF2 reads UAA and UGA)` : "eRF1 (which mimics a tRNA and reads all three stop codons)"} binds instead.` });
      push({ phase: "termination", codonIndex: i, title: "Release of the polypeptide", aSiteStart: pos, sites: { E: prevE, P: prevP, A: null }, chainOnA: false, peptide, released: true, largeSubunit: true, factors: [rf, bact ? "RF3·GTP" : "eRF3·GTP"],
        caption: `The factor makes the peptidyl transferase centre hydrolyse the bond between the chain and the P-site tRNA, releasing a ${peptide.length}-residue polypeptide (${peptide}). The ribosome then separates into subunits (ribosome recycling) and the mRNA is free.` });
      return { input, start, translation, steps, codonStarts };
    }
    codonStarts.push(steps.length);
    push({ phase: "binding", codonIndex: i, title: `Codon ${i + 1}: ${c.codon} in the A site`, aSiteStart: pos, sites: { E: prevE, P: prevP, A: t }, chainOnA: false, peptide, released: false, largeSubunit: true, factors: [bact ? "EF-Tu·GTP" : "eEF1A·GTP"],
      caption: `The codon ${c.codon} is in the A site. The aminoacyl-tRNA carrying ${t.aaName} (anticodon 5′-${t.anticodon5to3}-3′) pairs with it antiparallel and enters with ${bact ? "EF-Tu" : "eEF1A"}.` });
    peptide += c.aa;
    push({ phase: "peptidyl transfer", codonIndex: i, title: "Peptide bond", aSiteStart: pos, sites: { E: prevE, P: prevP, A: t }, chainOnA: true, peptide, released: false, largeSubunit: true, factors: [],
      caption: `The ribosome's rRNA (peptidyl transferase) joins the growing chain to ${t.aaName}: the chain is transferred from the P-site tRNA to the A-site tRNA, which is now ${peptide.length} residues long.` });
    push({ phase: "translocation", codonIndex: i, title: "Translocation", aSiteStart: pos + 3, sites: { E: prevP, P: t, A: null }, chainOnA: false, peptide, released: false, largeSubunit: true, factors: [bact ? "EF-G·GTP" : "eEF2·GTP"],
      caption: `${bact ? "EF-G" : "eEF2"} moves the mRNA three nucleotides: the tRNA that carried the chain moves A→P, the empty tRNA moves P→E and leaves, and the next codon enters the A site.` });
    prevE = prevP;
    prevP = t;
  }
  // ran out of codons without a stop
  const last = steps[steps.length - 1];
  const left = mrna.slice(start + 3 * codons.length);
  push({ phase: "stalled", codonIndex: codons.length, title: "End of the mRNA", aSiteStart: start + 3 * codons.length, sites: last.sites, chainOnA: false, peptide, released: false, largeSubunit: true, factors: [],
    caption: left.length > 0 ? `The mRNA ends with ${left.length} base${left.length === 1 ? "" : "s"} (${left}), not a full codon, and there is no stop codon. No release factor can act, so the ribosome stalls with the chain still attached to the P-site tRNA and no free polypeptide.` : "The mRNA ends without a stop codon. No release factor can act, so the ribosome stalls with the chain still attached to the P-site tRNA and no free polypeptide (in cells such non-stop mRNAs are rescued and the product degraded)." });
  return { input, start, translation, steps, codonStarts };
}

export const stepAt = (m: TranslationModel, i: number): TrStep => m.steps[Math.max(0, Math.min(m.steps.length - 1, Math.round(i)))];
