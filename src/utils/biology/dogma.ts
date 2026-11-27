/**
 * The connected DNA → RNA → protein workflow (pure; no React), for a gene WITHOUT introns (a bacterial-style gene, or a cDNA).
 * One coding strand (5′→3′, from the transcription start site) determines the template strand, the mRNA, the reading frame and the
 * peptide. A point mutation is applied to the coding strand and every downstream quantity is recomputed from it, never patched.
 * Introns, capping and polyadenylation are in the Transcription tool.
 */
import { applyMutation, classify, MUTATION_LIMITS, type Consequence, type Mutation } from "./mutations";
import { complementDna, dnaToRna, isDna, reverseComplementDna } from "./sequence";
import { findStarts, translateFrom, type Translation } from "./translate";

export const DOGMA_LIMITS = { minLen: 9, maxLen: 120 } as const;

export interface DogmaInput { coding: string; mutation: Mutation | null }

export const DEFAULT_DOGMA_INPUT: DogmaInput = { coding: "TTATGGCTAAACTGGGTTACGAGCCTAGCTAA", mutation: null };

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function validateDogmaInput(raw: unknown): Validation<DogmaInput> {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const coding = typeof r.coding === "string" ? r.coding : "";
  if (!isDna(coding) || coding.length === 0) errors.push("The coding strand must contain only A, C, G and T.");
  else if (coding.length < DOGMA_LIMITS.minLen || coding.length > DOGMA_LIMITS.maxLen) errors.push(`The gene must be ${DOGMA_LIMITS.minLen}–${DOGMA_LIMITS.maxLen} bases (found ${coding.length}).`);
  let mutation: Mutation | null = null;
  if (r.mutation !== null && r.mutation !== undefined) {
    const m = r.mutation as Record<string, unknown>;
    if (typeof m !== "object") errors.push("The mutation is malformed.");
    else if (m.kind === "substitution" && typeof m.pos === "number" && typeof m.base === "string") mutation = { kind: "substitution", pos: m.pos, base: m.base };
    else if (m.kind === "insertion" && typeof m.pos === "number" && typeof m.bases === "string") mutation = { kind: "insertion", pos: m.pos, bases: m.bases };
    else if (m.kind === "deletion" && typeof m.pos === "number" && typeof m.length === "number") mutation = { kind: "deletion", pos: m.pos, length: m.length };
    else errors.push("The mutation is malformed.");
    if (mutation && !errors.length && applyMutation(coding, mutation, "ACGT") === null) errors.push(`The mutation does not fit this gene (insertions and deletions are limited to ${MUTATION_LIMITS.maxInsert} bases; positions must lie within the sequence; bases must be A, C, G or T).`);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { coding, mutation } };
}

export interface DogmaAnalysis {
  coding: string;
  /** Template strand written 3′→5′ under the coding strand (column for column). */
  templateUnder: string;
  /** Template strand written 5′→3′. */
  template53: string;
  mrna: string;
  starts: Array<{ position: number; frame: number }>;
  start: number | null;
  wild: Translation | null;
  mutantCoding: string | null;
  mutantMrna: string | null;
  mutant: Translation | null;
  consequence: Consequence | null;
}

export function analyzeDogma(input: DogmaInput): DogmaAnalysis {
  const { coding, mutation } = input;
  const mrna = dnaToRna(coding);
  const starts = findStarts(mrna);
  const start = starts.length ? starts[0].position : null;
  const wild = start === null ? null : translateFrom(mrna, start);
  let mutantCoding: string | null = null;
  let mutantMrna: string | null = null;
  let mutant: Translation | null = null;
  let consequence: Consequence | null = null;
  if (mutation) {
    mutantCoding = applyMutation(coding, mutation, "ACGT");
    if (mutantCoding !== null) {
      mutantMrna = dnaToRna(mutantCoding);
      if (start !== null) {
        consequence = classify(mrna, mutantMrna, start, mutation);
        mutant = consequence.mutant;
      }
    }
  }
  return { coding, templateUnder: complementDna(coding), template53: reverseComplementDna(coding), mrna, starts, start, wild, mutantCoding, mutantMrna, mutant, consequence };
}
