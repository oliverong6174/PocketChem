/**
 * Point mutations and their consequences for a protein, derived by comparing translations (pure; no React).
 * Positions are 0-based indices into the sequence being edited (a coding-strand DNA or an mRNA, both written 5′→3′).
 * The consequence is never hard-coded: it comes from translating the original and the changed sequence.
 */
import { translateFrom, type Translation } from "./translate";

export type Mutation =
  | { kind: "substitution"; pos: number; base: string }
  | { kind: "insertion"; pos: number; bases: string }
  | { kind: "deletion"; pos: number; length: number };

export const MUTATION_LIMITS = { maxInsert: 6, maxDelete: 6 } as const;

export function describeMutation(m: Mutation): string {
  if (m.kind === "substitution") return `substitution at position ${m.pos + 1} to ${m.base}`;
  if (m.kind === "insertion") return `insertion of ${m.bases} before position ${m.pos + 1}`;
  return `deletion of ${m.length} base${m.length === 1 ? "" : "s"} from position ${m.pos + 1}`;
}

/** Apply a mutation; returns null for an out-of-range or malformed edit (nothing is clamped or guessed). */
export function applyMutation(seq: string, m: Mutation, alphabet: "ACGT" | "ACGU"): string | null {
  const ok = (s: string) => [...s].every((b) => alphabet.includes(b));
  if (m.kind === "substitution") {
    if (!Number.isInteger(m.pos) || m.pos < 0 || m.pos >= seq.length || m.base.length !== 1 || !ok(m.base)) return null;
    return seq.slice(0, m.pos) + m.base + seq.slice(m.pos + 1);
  }
  if (m.kind === "insertion") {
    if (!Number.isInteger(m.pos) || m.pos < 0 || m.pos > seq.length || m.bases.length < 1 || m.bases.length > MUTATION_LIMITS.maxInsert || !ok(m.bases)) return null;
    return seq.slice(0, m.pos) + m.bases + seq.slice(m.pos);
  }
  if (!Number.isInteger(m.pos) || !Number.isInteger(m.length) || m.length < 1 || m.length > MUTATION_LIMITS.maxDelete || m.pos < 0 || m.pos + m.length > seq.length) return null;
  return seq.slice(0, m.pos) + seq.slice(m.pos + m.length);
}

export type MutationClass =
  | "none"
  | "silent"
  | "missense"
  | "nonsense"
  | "stop-loss"
  | "start-loss"
  | "frameshift"
  | "in-frame insertion"
  | "in-frame deletion"
  | "no peptide";

export interface Consequence {
  class: MutationClass;
  /** First position (0-based amino-acid index) at which the peptides differ, or -1. */
  firstDifference: number;
  wild: Translation;
  mutant: Translation;
  summary: string;
}

/**
 * Classify the effect on the peptide read from the original start codon. The mutant is read from the same start position (shifted
 * for an indel before it); if the start codon itself is destroyed the class is "start-loss".
 */
export function classify(wildMrna: string, mutantMrna: string, startPos: number, m: Mutation): Consequence {
  const wild = translateFrom(wildMrna, startPos);
  // an insertion/deletion before the start shifts the start codon
  let mutStart = startPos;
  if (m.kind === "insertion" && m.pos <= startPos) mutStart += m.bases.length;
  if (m.kind === "deletion" && m.pos + m.length <= startPos) mutStart -= m.length;
  const startIntact = mutantMrna.slice(mutStart, mutStart + 3) === wildMrna.slice(startPos, startPos + 3);
  const mutant = translateFrom(mutantMrna, mutStart);
  let first = -1;
  const n = Math.max(wild.protein.length, mutant.protein.length);
  for (let i = 0; i < n; i += 1) if (wild.protein[i] !== mutant.protein[i]) { first = i; break; }
  const mk = (cls: MutationClass, summary: string): Consequence => ({ class: cls, firstDifference: first, wild, mutant, summary });
  if (wild.status === "no-start" || wild.protein.length === 0 && wild.codons.length === 0) return mk("no peptide", "There is no start codon to read from, so there is no peptide to compare.");
  if (mutantMrna === wildMrna) return mk("none", "The sequence is unchanged.");
  if (!startIntact) return mk("start-loss", "The start codon was changed, so translation does not begin at this site; any peptide would have to start at another AUG.");
  const inDel = m.kind !== "substitution";
  const delta = m.kind === "insertion" ? m.bases.length : m.kind === "deletion" ? -m.length : 0;
  if (inDel && m.pos >= mutStart && delta % 3 !== 0) {
    return mk("frameshift", `Inserting or deleting ${Math.abs(delta)} base${Math.abs(delta) === 1 ? "" : "s"} (not a multiple of 3) shifts the reading frame after the change: every codon downstream is read differently${first >= 0 ? `, from amino acid ${first + 1} on` : ""}.`);
  }
  if (inDel && m.pos >= mutStart) {
    return mk(delta > 0 ? "in-frame insertion" : "in-frame deletion", `A multiple of 3 bases was ${delta > 0 ? "added" : "removed"}, so the frame is kept and ${Math.abs(delta) / 3} amino acid${Math.abs(delta) === 3 ? " is" : "s are"} ${delta > 0 ? "inserted" : "lost"} (plus any change where the edit splits a codon).`);
  }
  if (wild.protein === mutant.protein && wild.status === mutant.status && m.pos < startPos && (m.kind === "substitution" ? m.pos + 1 <= startPos : m.pos <= startPos)) {
    return mk("silent", "The change lies upstream of the start codon (in the 5′ untranslated region), so the codons that are read, and the peptide, are unchanged.");
  }
  if (wild.protein === mutant.protein && wild.status === mutant.status) return mk("silent", "The codon changed but still specifies the same amino acid (or both are stops): the peptide is identical (a synonymous change).");
  if (mutant.status === "terminated" && mutant.protein.length < wild.protein.length && wild.protein.startsWith(mutant.protein)) {
    return mk("nonsense", `The change created a premature stop codon: the peptide is cut short, ${mutant.protein.length} instead of ${wild.protein.length} amino acids.`);
  }
  if (wild.status === "terminated" && mutant.status !== "terminated") return mk("stop-loss", "The stop codon was changed to an amino-acid codon, so the ribosome reads on past it.");
  if (wild.status === "terminated" && mutant.protein.length > wild.protein.length && mutant.protein.startsWith(wild.protein)) return mk("stop-loss", "The stop codon was changed to an amino-acid codon, so the peptide is extended.");
  if (wild.protein.length === mutant.protein.length) return mk("missense", `One amino acid changes (position ${first + 1}: ${wild.protein[first]} → ${mutant.protein[first]}); the length is the same.`);
  return mk("missense", "The peptide changes.");
}
