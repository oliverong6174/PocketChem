/** Example sequences offered by the Biology tools (pure data; every one is checked by the tests). */
import type { Intron } from "./transcription";

export const REPLICATION_EXAMPLES: Array<{ label: string; template: string }> = [
  { label: "Mixed 32 bp", template: "ATGCGTACCGGATTCAGCTAGCATCGGATACC" },
  { label: "GC-rich 24 bp", template: "GGCGCCGCGGCCGGCGCCGCGGCC" },
  { label: "AT-rich 24 bp", template: "ATATTAATTTAATATTATAATTAA" },
  { label: "Short 16 bp", template: "ATGCGTACCGGATTCA" },
];

const EXON_A = "GGATGGCT";
const INTRON = "GTAAGTCTAACTTTCAG";

export const TRANSCRIPTION_EXAMPLES: Array<{ label: string; organism: "bacteria" | "eukaryote"; coding: string; introns: Intron[] }> = [
  { label: "Eukaryote: one intron", organism: "eukaryote", coding: "GGATGGCTAAACTG" + INTRON + "GGTTACTGATTAATAAAGCTAGCTAGGACCTTAC", introns: [{ start: 14, end: 31 }] },
  { label: "Eukaryote: two introns", organism: "eukaryote", coding: EXON_A + INTRON + "AAACTGGGT" + INTRON + "TACTGATTAATAAAGCTAGCTAGGACCTTAC", introns: [{ start: 8, end: 25 }, { start: 34, end: 51 }] },
  { label: "Eukaryote: no intron", organism: "eukaryote", coding: "GGATGGCTAAACTGGGTTACTGATTAATAAAGCTAGCTAGGACC", introns: [] },
  { label: "Bacterium: short gene", organism: "bacteria", coding: "TTAAGGAGGTGATA" + "ATGGCTAAACTGGGTTACTGA" + "CC", introns: [] },
];

export const TRANSLATION_EXAMPLES: Array<{ label: string; mrna: string }> = [
  { label: "M A K L G Y", mrna: "GGAUGGCUAAACUGGGUUACUGAUUAAUAAAGCUAGC" },
  { label: "Stop right after start", mrna: "GGAUGUAAGCUAGC" },
  { label: "Two AUGs", mrna: "GGAUGGCUAUGAAAUAAGGCC" },
  { label: "No stop codon", mrna: "GGAUGGCUAAACUGGGUUAC" },
];

export const DOGMA_EXAMPLES: Array<{ label: string; coding: string }> = [
  { label: "Gene 1 (M A K L G Y E P S)", coding: "TTATGGCTAAACTGGGTTACGAGCCTAGCTAA" },
  { label: "Gene 2 (M F F S K)", coding: "GCATGTTCTTTAGCAAATAAGGC" },
  { label: "Gene 3 (longer)", coding: "ATGGGAGAGTATCCAGTTCTGCATTGGAAGACTTAGTAA" },
];

