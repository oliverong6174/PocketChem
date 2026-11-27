/**
 * Nucleic-acid sequence utilities (pure; no React). Every sequence is written 5′→3′ unless a function says otherwise; strand
 * orientation is never reversed silently. Reusable by later Biochemistry and Genetics modules.
 *
 * Input rules (stated to the user): letters are case-insensitive; spaces, tabs and line breaks are ignored; anything else is
 * rejected with its position. DNA allows A, C, G, T; RNA allows A, C, G, U. Nothing is substituted, trimmed or invented.
 */

export const SEQ_LIMITS = { minDna: 6, maxDna: 120, maxRna: 360, maxReplication: 40, minReplication: 8 } as const;

export type Parsed = { ok: true; seq: string; ignoredWhitespace: number } | { ok: false; error: string; index?: number };

export function parseNucleic(raw: unknown, kind: "DNA" | "RNA", min = 1, max = kind === "DNA" ? SEQ_LIMITS.maxDna : SEQ_LIMITS.maxRna): Parsed {
  if (typeof raw !== "string") return { ok: false, error: `The ${kind} sequence must be text.` };
  const allowed = kind === "DNA" ? "ACGT" : "ACGU";
  let out = "";
  let ignored = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (/\s/.test(ch)) { ignored += 1; continue; }
    const up = ch.toUpperCase();
    if (!allowed.includes(up)) {
      const hint = kind === "DNA" && up === "U" ? " RNA uses U; DNA uses T." : kind === "RNA" && up === "T" ? " RNA uses U instead of T." : "";
      return { ok: false, error: `“${ch}” at position ${i + 1} is not a ${kind} base (${allowed.split("").join(", ")}).${hint}`, index: i };
    }
    out += up;
  }
  if (out.length < min) return { ok: false, error: `Enter at least ${min} bases (${out.length} found).` };
  if (out.length > max) return { ok: false, error: `This tool accepts at most ${max} bases (${out.length} found).` };
  return { ok: true, seq: out, ignoredWhitespace: ignored };
}

export const isDna = (s: string) => /^[ACGT]*$/.test(s);
export const isRna = (s: string) => /^[ACGU]*$/.test(s);

const DNA_COMP: Record<string, string> = { A: "T", T: "A", C: "G", G: "C" };
const RNA_COMP: Record<string, string> = { A: "U", U: "A", C: "G", G: "C" };

/** Base-by-base complement, NOT reversed: written left to right it reads 3′→5′ when the input reads 5′→3′. */
export function complementDna(seq: string): string { return [...seq].map((b) => DNA_COMP[b] ?? "?").join(""); }
export function complementRna(seq: string): string { return [...seq].map((b) => RNA_COMP[b] ?? "?").join(""); }
/** The partner strand written 5′→3′. */
export function reverseComplementDna(seq: string): string { return [...complementDna(seq)].reverse().join(""); }
export function reverseComplementRna(seq: string): string { return [...complementRna(seq)].reverse().join(""); }
export const reverseString = (s: string) => [...s].reverse().join("");

/** Replace T by U (a coding-strand DNA read as the RNA with the same sequence). */
export const dnaToRna = (dna: string) => dna.replace(/T/g, "U");
export const rnaToDna = (rna: string) => rna.replace(/U/g, "T");

/** The template strand (5′→3′) of a gene whose coding strand is written 5′→3′. */
export const templateFromCoding = (coding: string) => reverseComplementDna(coding);
/** The coding strand (5′→3′) of a gene whose template strand is written 5′→3′. */
export const codingFromTemplate = (template: string) => reverseComplementDna(template);

/** Position i (0-based) on the coding strand pairs with position L−1−i of the template strand when that strand is written 5′→3′. */
export const pairedIndex = (i: number, length: number) => length - 1 - i;

/** Hydrogen bonds in a Watson–Crick pair: A–T/U 2, G–C 3. */
export const hydrogenBonds = (base: string) => (base === "G" || base === "C" ? 3 : 2);

export function gcContent(seq: string): number {
  if (!seq.length) return 0;
  return ([...seq].filter((b) => b === "G" || b === "C").length / seq.length) * 100;
}

export function formatSeqBlocks(seq: string, block = 3): string {
  const out: string[] = [];
  for (let i = 0; i < seq.length; i += block) out.push(seq.slice(i, i + block));
  return out.join(" ");
}
