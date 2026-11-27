/**
 * Stage 19: validation of the scientific context carried between tools.
 *
 * Only values with an unambiguous meaning in the destination tool are accepted, and each is checked with the destination's own
 * validator. A malformed payload is rejected with a reason and never coerced, truncated silently or partly applied. The payloads
 * are placed in the one-shot slot in utils/biology/handoff16.ts only after an explicit click.
 */
import { PEPTIDE_LIMITS, parsePeptide } from "../biochem/peptide";
import { validateTranslationInput } from "../biology/translation";

export type ContextResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface PeptideContext { sequence: string; truncatedFrom: number | null }

/** A translated peptide for the peptide builder: N-to-C one-letter sequence, cut (and reported) at the builder's limit. */
export function preparePeptideContext(sequence: unknown): ContextResult<PeptideContext> {
  if (typeof sequence !== "string" || sequence.length === 0) return { ok: false, error: "There is no peptide to send." };
  const cut = sequence.slice(0, PEPTIDE_LIMITS.max);
  const parsed = parsePeptide(cut);
  if (!parsed.ok) return { ok: false, error: "The peptide contains a symbol the peptide builder does not accept." };
  // parsePeptide drops whitespace; anything else it ignores means the text was not a plain sequence.
  if (parsed.ignored !== 0 || parsed.seq !== cut) return { ok: false, error: "The peptide is not a plain one-letter amino-acid sequence." };
  return { ok: true, value: { sequence: parsed.seq, truncatedFrom: sequence.length > PEPTIDE_LIMITS.max ? sequence.length : null } };
}

export interface MrnaContext { mrna: string; organism: "bacteria" | "eukaryote" }

/** A finished mRNA (5'→3', A/C/G/U) for the Translation tool, validated by that tool's own input validator. */
export function prepareMrnaContext(mrna: unknown, organism: unknown): ContextResult<MrnaContext> {
  const check = validateTranslationInput({ mrna, organism, start: null, step: 0 });
  if (!check.ok) return { ok: false, error: check.errors[0] ?? "The mRNA is not valid for the Translation tool." };
  return { ok: true, value: { mrna: check.value.mrna, organism: check.value.organism } };
}
