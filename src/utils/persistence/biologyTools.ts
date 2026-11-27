/**
 * Saved state of the Biology tools (persisted pages "replication", "transcription", "translation", "dogma"; subject "biology").
 *
 * Inputs hold everything needed to rebuild the diagram exactly: the sequence, the organism, the introns or mutation, the learning
 * mode and the step shown. The stored result is a small display summary plus one `check` number used to notice that a model
 * changed since saving. Validators build new objects from known fields, reject anything of the wrong type or outside the
 * model's bounds, and reject records whose parts contradict each other (a step beyond the end of the timeline, a mutation that
 * does not fit the gene). They never coerce.
 */
import { buildReplication, validateReplicationInput, DEFAULT_REPLICATION_INPUT, type ReplicationInput } from "../biology/replication";
import { buildTranscription, validateTranscriptionInput, DEFAULT_TRANSCRIPTION_INPUT, type Intron, type TranscriptionInput } from "../biology/transcription";
import { buildTranslation, validateTranslationInput, DEFAULT_TRANSLATION_INPUT, type TranslationInput } from "../biology/translation";
import { analyzeDogma, validateDogmaInput, DEFAULT_DOGMA_INPUT, type DogmaInput } from "../biology/dogma";
import type { LearningMode } from "../../components/ui/LearningModeSwitch";
export { validateToolResults as validateBiologyResults } from "./generalChemTools";
export type { ToolResults as BiologyResults } from "./generalChemTools";

export const REPLICATION_ENGINE_VERSION = 1;
export const TRANSCRIPTION_ENGINE_VERSION = 1;
export const TRANSLATION_ENGINE_VERSION = 1;
export const DOGMA_ENGINE_VERSION = 1;

export const LEARNING_MODES: readonly LearningMode[] = ["explore", "practice", "challenge"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const validMode = (v: unknown): v is LearningMode => typeof v === "string" && (LEARNING_MODES as readonly string[]).includes(v);

// ---- replication --------------------------------------------------------------------------------------------------------------

export type ReplicationInputs = { subject: "biology"; tool: "replication"; input: ReplicationInput; step: number; mode: LearningMode };
export const DEFAULT_REPLICATION_INPUTS: ReplicationInputs = { subject: "biology", tool: "replication", input: DEFAULT_REPLICATION_INPUT, step: 0, mode: "explore" };

export function validateReplicationInputs(raw: unknown): ReplicationInputs | null {
  if (!isObject(raw) || raw.subject !== "biology" || raw.tool !== "replication" || !validMode(raw.mode)) return null;
  const input = validateReplicationInput(raw.input);
  if (!input.ok) return null;
  if (typeof raw.step !== "number" || !Number.isInteger(raw.step) || raw.step < 0) return null;
  if (raw.step >= buildReplication(input.value).steps.length) return null;
  return { subject: "biology", tool: "replication", input: input.value, step: raw.step, mode: raw.mode };
}
export function describeReplicationAnalysis(i: ReplicationInputs): string {
  return `DNA replication: ${i.input.template.length} bp, fork moving ${i.input.direction}, Okazaki fragments of ${i.input.okazakiLength} nt (${i.input.organism})`.slice(0, 300);
}

// ---- transcription ------------------------------------------------------------------------------------------------------------

export type TranscriptionInputs = { subject: "biology"; tool: "transcription"; input: TranscriptionInput; mode: LearningMode };
export const DEFAULT_TRANSCRIPTION_INPUTS: TranscriptionInputs = { subject: "biology", tool: "transcription", input: DEFAULT_TRANSCRIPTION_INPUT, mode: "explore" };

export function validateTranscriptionInputs(raw: unknown): TranscriptionInputs | null {
  if (!isObject(raw) || raw.subject !== "biology" || raw.tool !== "transcription" || !validMode(raw.mode)) return null;
  const input = validateTranscriptionInput(raw.input);
  if (!input.ok) return null;
  if (input.value.step >= buildTranscription(input.value).steps.length) return null;
  return { subject: "biology", tool: "transcription", input: input.value, mode: raw.mode };
}
export function describeTranscriptionAnalysis(i: TranscriptionInputs): string {
  const n = i.input.introns.length;
  return `Transcription: ${i.input.coding.length}-base ${i.input.organism} gene${i.input.organism === "eukaryote" ? ` with ${n} intron${n === 1 ? "" : "s"}` : ""}`.slice(0, 300);
}
export const cloneIntrons = (x: Intron[]) => x.map((i) => ({ ...i }));

// ---- translation --------------------------------------------------------------------------------------------------------------

export type TranslationInputs = { subject: "biology"; tool: "translation"; input: TranslationInput; mode: LearningMode };
export const DEFAULT_TRANSLATION_INPUTS: TranslationInputs = { subject: "biology", tool: "translation", input: DEFAULT_TRANSLATION_INPUT, mode: "explore" };

export function validateTranslationInputs(raw: unknown): TranslationInputs | null {
  if (!isObject(raw) || raw.subject !== "biology" || raw.tool !== "translation" || !validMode(raw.mode)) return null;
  const input = validateTranslationInput(raw.input);
  if (!input.ok) return null;
  if (input.value.step >= buildTranslation(input.value).steps.length) return null;
  return { subject: "biology", tool: "translation", input: input.value, mode: raw.mode };
}
export function describeTranslationAnalysis(i: TranslationInputs): string {
  return `Translation: ${i.input.mrna.length}-base mRNA (${i.input.organism})`.slice(0, 300);
}

// ---- DNA → RNA → protein ------------------------------------------------------------------------------------------------------

export type DogmaInputs = { subject: "biology"; tool: "dogma"; input: DogmaInput; mode: LearningMode };
export const DEFAULT_DOGMA_INPUTS: DogmaInputs = { subject: "biology", tool: "dogma", input: DEFAULT_DOGMA_INPUT, mode: "explore" };

export function validateDogmaInputs(raw: unknown): DogmaInputs | null {
  if (!isObject(raw) || raw.subject !== "biology" || raw.tool !== "dogma" || !validMode(raw.mode)) return null;
  const input = validateDogmaInput(raw.input);
  if (!input.ok) return null;
  return { subject: "biology", tool: "dogma", input: input.value, mode: raw.mode };
}
export function describeDogmaAnalysis(i: DogmaInputs): string {
  const a = analyzeDogma(i.input);
  return `DNA → RNA → protein: ${a.wild?.protein || "no peptide"}${i.input.mutation ? `, with a ${i.input.mutation.kind}` : ""}`.slice(0, 300);
}
