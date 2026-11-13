/**
 * The standard genetic code (NCBI translation table 1) with the amino acids' names, plus tRNA anticodon helpers.
 * Context: the universal standard code used by nuclear genes of most organisms and by bacteria. Mitochondria and a few other
 * systems use variants that are NOT modelled.
 *
 * Simplification (stated in the tools): each codon is read by a tRNA whose anticodon is its exact reverse complement. Real cells
 * use fewer tRNA species by wobble pairing at the third codon position, which is not modelled.
 */
import { reverseComplementRna, complementRna } from "./sequence";

/** Codon index = 16·b1 + 4·b2 + b3 with the base order U, C, A, G; "*" marks a stop codon. */
const BASE_ORDER = "UCAG";
const AA_TABLE = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG";

export interface AminoAcid { one: string; three: string; name: string; group: "nonpolar" | "polar" | "acidic" | "basic" }

export const AMINO_ACIDS: Record<string, AminoAcid> = {
  A: { one: "A", three: "Ala", name: "Alanine", group: "nonpolar" },
  R: { one: "R", three: "Arg", name: "Arginine", group: "basic" },
  N: { one: "N", three: "Asn", name: "Asparagine", group: "polar" },
  D: { one: "D", three: "Asp", name: "Aspartic acid", group: "acidic" },
  C: { one: "C", three: "Cys", name: "Cysteine", group: "polar" },
  Q: { one: "Q", three: "Gln", name: "Glutamine", group: "polar" },
  E: { one: "E", three: "Glu", name: "Glutamic acid", group: "acidic" },
  G: { one: "G", three: "Gly", name: "Glycine", group: "nonpolar" },
  H: { one: "H", three: "His", name: "Histidine", group: "basic" },
  I: { one: "I", three: "Ile", name: "Isoleucine", group: "nonpolar" },
  L: { one: "L", three: "Leu", name: "Leucine", group: "nonpolar" },
  K: { one: "K", three: "Lys", name: "Lysine", group: "basic" },
  M: { one: "M", three: "Met", name: "Methionine", group: "nonpolar" },
  F: { one: "F", three: "Phe", name: "Phenylalanine", group: "nonpolar" },
  P: { one: "P", three: "Pro", name: "Proline", group: "nonpolar" },
  S: { one: "S", three: "Ser", name: "Serine", group: "polar" },
  T: { one: "T", three: "Thr", name: "Threonine", group: "polar" },
  W: { one: "W", three: "Trp", name: "Tryptophan", group: "nonpolar" },
  Y: { one: "Y", three: "Tyr", name: "Tyrosine", group: "polar" },
  V: { one: "V", three: "Val", name: "Valine", group: "nonpolar" },
};

export const START_CODON = "AUG";
export const STOP_CODONS: readonly string[] = ["UAA", "UAG", "UGA"];

/** All 64 RNA codons in table order. */
export const ALL_CODONS: readonly string[] = (() => {
  const out: string[] = [];
  for (const a of BASE_ORDER) for (const b of BASE_ORDER) for (const c of BASE_ORDER) out.push(a + b + c);
  return out;
})();

export type CodonMeaning = { kind: "amino"; aa: string; info: AminoAcid } | { kind: "stop" };

/** What a codon (RNA, 5′→3′) means. Returns null for anything that is not exactly three RNA bases. */
export function readCodon(codon: string): CodonMeaning | null {
  if (!/^[ACGU]{3}$/.test(codon)) return null;
  const i = 16 * BASE_ORDER.indexOf(codon[0]) + 4 * BASE_ORDER.indexOf(codon[1]) + BASE_ORDER.indexOf(codon[2]);
  const aa = AA_TABLE[i];
  return aa === "*" ? { kind: "stop" } : { kind: "amino", aa, info: AMINO_ACIDS[aa] };
}

export const isStopCodon = (codon: string) => STOP_CODONS.includes(codon);

/** The codons that specify one amino acid (synonymous codons). */
export function codonsFor(aa: string): string[] { return ALL_CODONS.filter((c) => { const m = readCodon(c); return m?.kind === "amino" && m.aa === aa; }); }

/** The tRNA anticodon written 5′→3′ (reverse complement of the codon): codon 5′-AUG-3′ pairs with anticodon 5′-CAU-3′. */
export const anticodon5to3 = (codon: string) => reverseComplementRna(codon);
/** The anticodon letters in the order they sit under the codon in a diagram (3′→5′, left to right): the plain complement. */
export const anticodonUnderCodon = (codon: string) => complementRna(codon);

/** Bacterial release factors: RF1 recognises UAA and UAG, RF2 recognises UAA and UGA. */
export function releaseFactorFor(codon: string): string[] {
  const out: string[] = [];
  if (codon === "UAA" || codon === "UAG") out.push("RF1");
  if (codon === "UAA" || codon === "UGA") out.push("RF2");
  return out;
}
