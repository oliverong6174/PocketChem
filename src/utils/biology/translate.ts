/**
 * Reading frames, codon segmentation and translation of an mRNA (pure; no React). The mRNA is always written 5′→3′.
 * Nothing here chooses a "correct" open reading frame on the user's behalf: every AUG is reported, and the caller names the start.
 */
import { readCodon, START_CODON } from "./geneticCode";

export interface CodonCall {
  /** 0-based number of the codon in the reading, and the index of its first base in the mRNA. */
  index: number;
  start: number;
  codon: string;
  kind: "amino" | "stop";
  /** One-letter amino acid (undefined for a stop codon). */
  aa?: string;
}

/** Complete codons of a reading frame (0, 1 or 2 bases skipped) plus the bases left over at the end. */
export function segmentCodons(mrna: string, frame: 0 | 1 | 2 | number): { codons: CodonCall[]; leftover: string; skipped: string } {
  const codons: CodonCall[] = [];
  let n = 0;
  let i = frame;
  for (; i + 3 <= mrna.length; i += 3) {
    const codon = mrna.slice(i, i + 3);
    const m = readCodon(codon);
    codons.push({ index: n, start: i, codon, kind: m?.kind === "stop" ? "stop" : "amino", aa: m?.kind === "amino" ? m.aa : undefined });
    n += 1;
  }
  return { codons, leftover: mrna.slice(i), skipped: mrna.slice(0, frame) };
}

/** Every AUG in the mRNA with the frame it lies in (position mod 3). */
export function findStarts(mrna: string): Array<{ position: number; frame: number }> {
  const out: Array<{ position: number; frame: number }> = [];
  for (let i = 0; i + 3 <= mrna.length; i += 1) if (mrna.slice(i, i + 3) === START_CODON) out.push({ position: i, frame: i % 3 });
  return out;
}

export type TranslationStatus = "terminated" | "no-stop" | "incomplete-codon" | "no-start";

export interface Translation {
  start: number;
  frame: number;
  /** The codons read, up to and including the stop codon when there is one. */
  codons: CodonCall[];
  /** One-letter peptide (stop codon not included). */
  protein: string;
  status: TranslationStatus;
  /** Index (into `codons`) of the stop codon, when terminated. */
  stopCodonIndex: number | null;
  /** Position of the first base of the stop codon in the mRNA. */
  stopPosition: number | null;
  leftover: string;
}

/** Translate from a chosen start position (that codon is read as the first one) until a stop codon or the end of the mRNA. */
export function translateFrom(mrna: string, start: number): Translation {
  if (!Number.isInteger(start) || start < 0 || start + 3 > mrna.length) {
    return { start, frame: ((start % 3) + 3) % 3, codons: [], protein: "", status: "no-start", stopCodonIndex: null, stopPosition: null, leftover: mrna.slice(Math.max(0, start)) };
  }
  const { codons, leftover } = segmentCodons(mrna.slice(start), 0);
  const read: CodonCall[] = [];
  let protein = "";
  let stopIdx: number | null = null;
  for (const c of codons) {
    const call = { ...c, index: read.length, start: start + c.start };
    read.push(call);
    if (c.kind === "stop") { stopIdx = call.index; break; }
    protein += c.aa;
  }
  const status: TranslationStatus = stopIdx !== null ? "terminated" : leftover.length > 0 ? "incomplete-codon" : "no-stop";
  return { start, frame: start % 3, codons: read, protein, status, stopCodonIndex: stopIdx, stopPosition: stopIdx === null ? null : read[stopIdx].start, leftover: stopIdx !== null ? "" : leftover };
}

/** Translate a whole reading frame, stop codons shown as "*" (no start site is assumed). */
export function translateFrame(mrna: string, frame: 0 | 1 | 2): { protein: string; codons: CodonCall[]; leftover: string } {
  const { codons, leftover } = segmentCodons(mrna, frame);
  return { protein: codons.map((c) => (c.kind === "stop" ? "*" : c.aa)).join(""), codons, leftover };
}

/** The translation starting at the first AUG, or null when there is none. */
export function translateFirstAug(mrna: string): Translation | null {
  const s = findStarts(mrna)[0];
  return s ? translateFrom(mrna, s.position) : null;
}

export function describeStatus(t: Translation): string {
  if (t.status === "terminated") return `Translation ends at the stop codon ${t.codons[t.stopCodonIndex as number].codon} (position ${(t.stopPosition as number) + 1}).`;
  if (t.status === "incomplete-codon") return `No stop codon: the mRNA ends with an incomplete codon (${t.leftover.length} base${t.leftover.length === 1 ? "" : "s"} left), so the ribosome cannot read it and no peptide is released.`;
  if (t.status === "no-stop") return "No stop codon before the mRNA ends: the ribosome runs off the end without release factors (a stalled, non-stop translation).";
  return "There is no start codon at this position.";
}
