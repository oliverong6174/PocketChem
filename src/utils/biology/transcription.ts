/**
 * Transcription and (eukaryotic) RNA processing (pure; no React).
 *
 * The gene is given as its CODING strand, 5′→3′, from the transcription start site (+1) onward. The TEMPLATE strand is its
 * antiparallel complement; written under the coding strand column for column it reads 3′→5′. RNA polymerase reads the template
 * 3′→5′ and makes RNA 5′→3′, so the RNA has the coding strand's sequence with U in place of T.
 *
 * Bacteria and eukaryotes are kept apart on purpose: bacterial mRNA is the primary transcript (no cap, no introns, no poly(A)
 * tail, and ribosomes can start on it while it is still being made); eukaryotic pre-mRNA is capped, spliced and polyadenylated
 * before export.
 *
 * Simplifications (stated in the tool): the promoter and terminator are upstream/downstream of the region shown and are described
 * but not sequence-modelled; cap, splicing and cleavage/polyadenylation are shown one after another although in cells they overlap
 * with transcription; the poly(A) tail is drawn as 20 A (real tails are ~70–250); the branch-point A is taken as the last A before
 * the intron's terminal AG (real branch points lie 18–40 nt upstream of the 3′ splice site in a degenerate consensus); only GU–AG
 * (major-spliceosome) introns are accepted; alternative splicing and RNA editing are not modelled.
 */
import { complementDna, dnaToRna, isDna } from "./sequence";
import type { Organism } from "./replication";
import { translateFirstAug, type Translation } from "./translate";

export const TRANSCRIPTION_LIMITS = { minLen: 12, maxLen: 120, minIntron: 8 } as const;
export const POLY_A_SHOWN = 20;
export const POLYA_SIGNAL = "AAUAAA";
/** Cleavage happens 10–30 nt after the signal (usually after a CA); the model uses 15 nt. */
export const CLEAVAGE_OFFSET = 15;
/** The cap is added when the nascent RNA is ~20–30 nt long (co-transcriptionally). */
export const CAP_AT = 20;
/** Typical RNA–DNA hybrid length (8–9 bp) inside RNA polymerase, and unwound DNA ahead of the active site. */
export const HYBRID_LENGTH = 9;
export const UNWOUND_AHEAD = 3;

export interface Intron { /** 0-based, inclusive start; exclusive end (positions on the coding strand = pre-mRNA). */ start: number; end: number }

export interface TranscriptionInput {
  coding: string;
  organism: Organism;
  introns: Intron[];
  /** Current step in the generated timeline. */
  step: number;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const GENE_RULE = "GU…AG introns only: an intron starts with GU and ends with AG.";

export function validateIntrons(coding: string, introns: Intron[]): string[] {
  const errors: string[] = [];
  const rna = dnaToRna(coding);
  const sorted = [...introns].sort((a, b) => a.start - b.start);
  sorted.forEach((it, i) => {
    const n = i + 1;
    if (!Number.isInteger(it.start) || !Number.isInteger(it.end)) { errors.push(`Intron ${n}: positions must be whole numbers.`); return; }
    if (it.start < 1) errors.push(`Intron ${n}: there must be an exon before it (it cannot start at position 1).`);
    if (it.end > coding.length - 1) errors.push(`Intron ${n}: there must be an exon after it (it cannot reach the last base).`);
    if (it.end - it.start < TRANSCRIPTION_LIMITS.minIntron) errors.push(`Intron ${n}: at least ${TRANSCRIPTION_LIMITS.minIntron} nucleotides are needed here (real introns are far longer).`);
    if (it.start >= 0 && it.end <= coding.length && it.end - it.start >= 4) {
      const seq = rna.slice(it.start, it.end);
      if (!seq.startsWith("GU")) errors.push(`Intron ${n}: it starts with ${seq.slice(0, 2)}, but a 5′ splice site is GU. ${GENE_RULE}`);
      if (!seq.endsWith("AG")) errors.push(`Intron ${n}: it ends with ${seq.slice(-2)}, but a 3′ splice site is AG. ${GENE_RULE}`);
      if (seq.startsWith("GU") && seq.endsWith("AG") && branchPoint(it, rna) === null) errors.push(`Intron ${n}: it has no adenosine between the splice sites to serve as the branch point.`);
    }
    if (i > 0 && it.start - sorted[i - 1].end < 1) errors.push(`Introns ${i} and ${n} must be separated by at least one exon nucleotide.`);
  });
  return errors;
}

/** Branch-point A (model: the last A before the intron's terminal AG), as an index in the pre-mRNA, or null. */
export function branchPoint(intron: Intron, rna: string): number | null {
  for (let i = intron.end - 3; i >= intron.start + 2; i -= 1) if (rna[i] === "A") return i;
  return null;
}

export function validateTranscriptionInput(raw: unknown): Validation<TranscriptionInput> {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const coding = typeof r.coding === "string" ? r.coding : "";
  if (!isDna(coding) || coding.length === 0) errors.push("The coding strand must contain only A, C, G and T.");
  else if (coding.length < TRANSCRIPTION_LIMITS.minLen || coding.length > TRANSCRIPTION_LIMITS.maxLen) errors.push(`The gene must be ${TRANSCRIPTION_LIMITS.minLen}–${TRANSCRIPTION_LIMITS.maxLen} bases (found ${coding.length}).`);
  if (r.organism !== "bacteria" && r.organism !== "eukaryote") errors.push("The organism must be bacteria or eukaryote.");
  const introns: Intron[] = [];
  if (!Array.isArray(r.introns) || r.introns.length > 3) errors.push("Between 0 and 3 introns are supported.");
  else for (const it of r.introns) {
    if (typeof it !== "object" || it === null || typeof (it as Intron).start !== "number" || typeof (it as Intron).end !== "number") { errors.push("Each intron needs a start and an end."); break; }
    introns.push({ start: (it as Intron).start, end: (it as Intron).end });
  }
  if (r.organism === "bacteria" && introns.length) errors.push("Bacterial genes have no introns to splice, so none can be set for bacteria.");
  if (typeof r.step !== "number" || !Number.isInteger(r.step) || r.step < 0) errors.push("The step must be a whole number of 0 or more.");
  if (!errors.length) errors.push(...validateIntrons(coding, introns));
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { coding, organism: r.organism as Organism, introns: [...introns].sort((a, b) => a.start - b.start), step: r.step as number } };
}

/** exon 1 (with ATG) | intron GT…AG (17 nt) | exon 2 (stop codon, then a 3′ UTR holding AATAAA). */
export const DEFAULT_TRANSCRIPTION_INPUT: TranscriptionInput = {
  coding: "GGATGGCTAAACTG" + "GTAAGTCTAACTTTCAG" + "GGTTACTGATTAATAAAGCTAGCTAGGACCTTAC",
  organism: "eukaryote",
  introns: [{ start: 14, end: 31 }],
  step: 0,
};

// ---- derived strands ----------------------------------------------------------------------------------------------------

export const templateColumns = (coding: string) => complementDna(coding); // 3′→5′ left to right
export const preMrna = (coding: string) => dnaToRna(coding);

/** Mature transcript pieces after removing introns. */
export function splice(rna: string, introns: Intron[]) {
  const sorted = [...introns].sort((a, b) => a.start - b.start);
  const exons: Array<{ start: number; end: number; text: string }> = [];
  const lariats: string[] = [];
  let pos = 0;
  for (const it of sorted) {
    exons.push({ start: pos, end: it.start, text: rna.slice(pos, it.start) });
    lariats.push(rna.slice(it.start, it.end));
    pos = it.end;
  }
  exons.push({ start: pos, end: rna.length, text: rna.slice(pos) });
  return { exons, lariats, mature: exons.map((e) => e.text).join("") };
}

export interface PolyA { signalIndex: number; cleavageIndex: number; /** True when fewer than the usual 15 nt follow the signal. */ short: boolean }

/** First AAUAAA in a (spliced) transcript, with the cleavage site 15 nt after it (or the end of the RNA when less remains). */
export function findPolyA(rna: string): PolyA | null {
  const i = rna.indexOf(POLYA_SIGNAL);
  if (i < 0) return null;
  const after = i + POLYA_SIGNAL.length;
  const cleave = Math.min(rna.length, after + CLEAVAGE_OFFSET);
  return { signalIndex: i, cleavageIndex: cleave, short: after + CLEAVAGE_OFFSET > rna.length };
}

// ---- timeline -----------------------------------------------------------------------------------------------------------

export type TxPhase = "initiation" | "elongation" | "termination" | "cap" | "splicing" | "polyA" | "mature";

export interface TxState {
  /** Nucleotides of RNA made (0..L). */
  transcribed: number;
  /** DNA is released from the polymerase at this step. */
  polymerasePresent: boolean;
  bubble: { open: boolean; from: number; to: number };
  capped: boolean;
  introns: Array<"pre" | "recognized" | "step1" | "removed">;
  cleaved: boolean;
  tailed: boolean;
  /** Current linear RNA 5′→3′ (without cap or tail), introns removed once spliced out. */
  rna: string;
  /** Lariat intermediates (RNA text) by intron index while present. */
  lariats: Array<string | null>;
}

export interface TxStep { index: number; phase: TxPhase; title: string; caption: string; state: TxState }

export interface TranscriptionModel {
  input: TranscriptionInput;
  template: string;
  rna: string;
  steps: TxStep[];
  /** Mature (processed) transcript without cap and tail, and its first-AUG translation. */
  mature: string;
  polyA: PolyA | null;
  translation: Translation | null;
}

export function buildTranscription(input: TranscriptionInput): TranscriptionModel {
  const { coding, organism, introns } = input;
  const L = coding.length;
  const rna = preMrna(coding);
  const template = templateColumns(coding);
  const euk = organism === "eukaryote";
  const sp = splice(rna, euk ? introns : []);
  const polyA = euk ? findPolyA(sp.mature) : null;
  const matureBody = euk && polyA ? sp.mature.slice(0, polyA.cleavageIndex) : sp.mature;

  const steps: TxStep[] = [];
  const blank = (): TxState => ({ transcribed: 0, polymerasePresent: false, bubble: { open: false, from: 0, to: 0 }, capped: false, introns: introns.map(() => "pre") as TxState["introns"], cleaved: false, tailed: false, rna: "", lariats: introns.map(() => null) });
  let st = blank();
  const push = (phase: TxPhase, title: string, caption: string, patch: Partial<TxState>) => {
    st = { ...st, ...patch, introns: patch.introns ?? [...st.introns], lariats: patch.lariats ?? [...st.lariats] };
    steps.push({ index: steps.length, phase, title, caption, state: st });
  };
  const bubbleFor = (s: number) => ({ open: true, from: Math.max(0, s - HYBRID_LENGTH), to: Math.min(L, s + UNWOUND_AHEAD) });

  push("initiation", "Promoter recognition",
    euk
      ? "General transcription factors (TFIID binds the TATA box about 25–30 bp upstream) assemble RNA polymerase II at the promoter. The promoter lies upstream of +1 and is not part of the sequence shown."
      : "The RNA polymerase holoenzyme (core enzyme + σ factor) binds the promoter, recognising the −35 and −10 elements upstream of +1. The promoter is not part of the sequence shown.",
    {});
  push("initiation", "Open complex",
    `The polymerase unwinds about 12–14 bp of DNA around the start site, forming a transcription bubble. The template strand (3′→5′, bottom) is read; the coding strand (5′→3′, top) has the same sequence as the RNA to be made, with T for U.`,
    { polymerasePresent: true, bubble: { open: true, from: 0, to: Math.min(L, UNWOUND_AHEAD + 1) } });
  for (let s = 1; s <= L; s += 1) {
    const base = rna[s - 1];
    const tcol = template[s - 1];
    const capNow = euk && s === Math.min(CAP_AT, L);
    push("elongation", `Add nucleotide ${s}`,
      `The polymerase reads template base ${tcol} (3′→5′) and adds ${base} to the 3′ end of the growing RNA (${tcol}–${base} pair). RNA grows 5′→3′ and the RNA–DNA hybrid stays about ${HYBRID_LENGTH} bp long; behind it the DNA closes again.${capNow ? " At about this length the 5′ end is capped by the capping enzymes." : ""}`,
      { transcribed: s, bubble: bubbleFor(s), rna: rna.slice(0, s), capped: euk && s >= Math.min(CAP_AT, L) });
  }
  push("termination", "Termination",
    euk
      ? "Pol II continues past the cleavage site and is released after the transcript is cleaved (the exact termination mechanism, e.g. the torpedo model, is not modelled). The DNA closes and the pre-mRNA is released."
      : "At an intrinsic terminator (a GC-rich hairpin followed by a run of U) or with the Rho factor, the polymerase releases the RNA and the DNA. The terminator is downstream of the sequence shown. In bacteria this mRNA is already finished: no cap, splicing or poly(A) tail.",
    { polymerasePresent: false, bubble: { open: false, from: 0, to: 0 } });

  if (euk) {
    push("cap", "5′ cap",
      "A 7-methylguanosine (m7G) is joined to the first nucleotide by an unusual 5′–5′ triphosphate bridge. The cap protects the RNA from 5′ exonucleases and helps ribosome recruitment.",
      { capped: true });
    introns.forEach((it, i) => {
      const lariatText = rna.slice(it.start, it.end);
      const bp = branchPoint(it, rna);
      const mark = (kind: TxState["introns"][number], lariat: string | null, text: string, title: string) => {
        const nextIntrons = [...st.introns]; nextIntrons[i] = kind;
        const nextLariats = [...st.lariats]; nextLariats[i] = lariat;
        const done = nextIntrons.map((k, idx) => (k === "removed" ? introns[idx] : null)).filter((x): x is Intron => x !== null);
        push("splicing", title, text, { introns: nextIntrons, lariats: nextLariats, rna: splice(rna, done).mature });
      };
      mark("recognized", null, `The spliceosome assembles: U1 snRNP pairs with the 5′ splice site (GU at positions ${it.start + 1}–${it.start + 2}), and the branch-point adenosine (position ${(bp as number) + 1}) and the 3′ splice site AG (positions ${it.end - 1}–${it.end}) are recognised.`, `Spliceosome on intron ${i + 1}`);
      mark("step1", lariatText, `Transesterification 1: the 2′-OH of the branch-point A attacks the 5′ splice site. The exon upstream is cut free with a 3′-OH, and the intron's 5′ end (G) is joined to the A through a 2′–5′ bond, forming a lariat.`, `Branch-point attack (intron ${i + 1})`);
      mark("removed", lariatText, `Transesterification 2: the free 3′-OH of the upstream exon attacks the 3′ splice site. The two exons are joined by an ordinary 3′–5′ bond and the intron is released as a lariat, which is debranched and degraded.`, `Exons joined (intron ${i + 1})`);
    });
    if (polyA) {
      push("polyA", "Cleavage at the poly(A) site",
        `Cleavage and polyadenylation factors recognise the signal ${POLYA_SIGNAL} (positions ${polyA.signalIndex + 1}–${polyA.signalIndex + 6} of the spliced RNA) and cut the RNA ${polyA.short ? "at the end of the RNA (fewer than 15 nt follow the signal here)" : `${CLEAVAGE_OFFSET} nt after it (the real distance is 10–30 nt)`}. The 3′ piece is degraded.`,
        { cleaved: true, rna: matureBody });
      push("polyA", "Poly(A) tail",
        `Poly(A) polymerase adds a tail of A residues that is not encoded in the DNA (drawn here as ${POLY_A_SHOWN}; real tails are about 70–250). The tail stabilises the mRNA and aids translation.`,
        { tailed: true });
    }
    push("mature", "Mature mRNA", "The capped, spliced and polyadenylated mRNA is exported from the nucleus and is ready for translation.", {});
  } else {
    push("mature", "Finished mRNA", "The primary transcript is the mRNA. There is no nucleus, so ribosomes can begin translating it while RNA polymerase is still making it (coupled transcription–translation).", {});
  }
  return { input, template, rna, steps, mature: matureBody, polyA, translation: translateFirstAug(matureBody) };
}

export const RNA_PAIRING_NOTE = "RNA pairs A–U and G–C with the template: the RNA base at each column is the RNA complement of the template base in that column.";
const TEMPLATE_TO_RNA: Record<string, string> = { A: "U", T: "A", C: "G", G: "C" };
/** RNA made from template bases read column by column (the template written 3′→5′ under the coding strand). */
export const rnaFromTemplateColumns = (templateCols: string) => [...templateCols].map((b) => TEMPLATE_TO_RNA[b] ?? "?").join("");
