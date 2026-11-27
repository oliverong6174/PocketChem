/**
 * One-shot hand-offs between Biology tools (pure module state; nothing is persisted here). A tool that wants to send the learner
 * somewhere else puts a validated payload in the slot; the receiving page takes it once when it opens and then saves it in its
 * own workspace through its own validator. A payload that is not taken (or fails validation) is simply dropped.
 */
import type { Individual } from "./chromosome";
import type { Mutation } from "./mutations";

export type Handoff =
  | { to: "genetics"; individual: Individual }
  | { to: "celldivision"; individual: Individual }
  | { to: "dogma"; coding: string; mutation: Mutation | null }
  /** Stage 17: a translated peptide sent to the Biochemistry peptide explorer. */
  | { to: "peptide"; sequence: string; source: string }
  /** Stage 19: a finished mRNA sent from Transcription to Translation (validated again by the Translation validator on arrival). */
  | { to: "translation"; mrna: string; organism: "bacteria" | "eukaryote"; source: string };

let slot: Handoff | null = null;
export const putHandoff = (h: Handoff): void => { slot = h; };
/** Takes the payload for `to` (and clears it); returns null when the slot holds nothing for that page. */
export function takeHandoff<T extends Handoff["to"]>(to: T): Extract<Handoff, { to: T }> | null {
  if (slot && slot.to === to) { const h = slot as Extract<Handoff, { to: T }>; slot = null; return h; }
  return null;
}
export const clearHandoff = (): void => { slot = null; };
