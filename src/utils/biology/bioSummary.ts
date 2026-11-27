/**
 * Display summaries (and the one `check` number) stored beside saved Biology inputs, plus the assumption lists each tool states.
 * Pure functions of validated inputs; used by the pages and by the tests.
 */
import { buildReplication, ENZYMES } from "./replication";
import { buildTranscription } from "./transcription";
import { buildTranslation } from "./translation";
import { analyzeDogma } from "./dogma";
import {
  DOGMA_ENGINE_VERSION, REPLICATION_ENGINE_VERSION, TRANSCRIPTION_ENGINE_VERSION, TRANSLATION_ENGINE_VERSION,
  type BiologyResults, type DogmaInputs, type ReplicationInputs, type TranscriptionInputs, type TranslationInputs,
} from "../persistence/biologyTools";

export const REPLICATION_ASSUMPTIONS = [
  "One replication fork on a short duplex. A real origin opens a bubble with two forks moving in opposite directions, and the leading and lagging roles of the two parental strands swap between them.",
  "Orientation is exact: the top parental strand reads 5′→3′ left to right, every new strand is built 5′→3′ antiparallel to its template, and the strand whose new copy grows toward the fork is the leading strand.",
  "Primers and Okazaki fragments are a few nucleotides long so the diagram stays readable (real RNA primers are about 10 nt and fragments are 100–200 nt in eukaryotes and 1000–2000 nt in bacteria).",
  "One nucleotide is added per step by one leading and one lagging polymerase; proofreading, mismatch repair, supercoiling, and the real number of replisome proteins are not modelled.",
  "Bacterial and eukaryotic enzyme names are never mixed. The leading-strand RNA primer at the origin and the last lagging primer at the far edge stay as RNA in this segment (in a chromosome, neighbouring replication units or telomere biology deal with them).",
];
export const TRANSCRIPTION_ASSUMPTIONS = [
  "The gene is given as its coding strand from the transcription start site (+1). The promoter and the terminator are described but not drawn as sequence.",
  "Bacteria: RNA polymerase with a σ factor makes an mRNA that needs no processing. Eukaryotes: RNA polymerase II makes a pre-mRNA that is capped, spliced and polyadenylated. The two sets of machinery are never mixed.",
  "In cells capping, splicing and cleavage overlap with transcription; the tool shows them one after another. The cap is shown at about 20 nt.",
  "Only GU…AG introns are accepted. The branch-point A is taken as the last A before the intron's terminal AG; real branch points are upstream in a degenerate consensus. Alternative splicing is not modelled.",
  "Cleavage is placed 15 nt after the first AAUAAA in the spliced RNA (real distances are 10–30 nt) and the poly(A) tail is drawn as 20 A (real tails are about 70–250).",
];
export const TRANSLATION_ASSUMPTIONS = [
  "The standard genetic code only. Mitochondrial and other variant codes, selenocysteine and frameshifting are not modelled.",
  "Each codon is read by a tRNA whose anticodon is its exact reverse complement. Real cells use fewer tRNAs and wobble pairing at the third codon position.",
  "Only AUG starts translation. Bacteria also use GUG and UUG. The Shine–Dalgarno sequence and the Kozak context are described but not scored.",
  "Bacterial translation starts with formylmethionine and ends with RF1/RF2; eukaryotic translation starts with methionine, begins by scanning from the cap, and ends with eRF1. Initiation, elongation and release factors are named, not simulated.",
  "The mRNA is read from the chosen start to the first stop codon; peptide folding, modification and the cost in GTP are not modelled.",
];
export const DOGMA_ASSUMPTIONS = [
  "An intronless gene, read from the first AUG of its mRNA. Introns, capping and polyadenylation are in the Transcription tool.",
  "Mutations are single changes to the coding strand: one substitution, an insertion of 1–6 bases or a deletion of 1–6 bases. Their consequence is found by translating the mutant mRNA and comparing it with the wild type, not looked up.",
  "The peptide is read in the frame of the original start codon; a mutation that creates an earlier AUG is not followed.",
  "Effects on protein function, folding, splicing or regulation are not predicted; only the amino-acid sequence is compared.",
];

export function summarizeReplication(inputs: ReplicationInputs): BiologyResults | null {
  const m = buildReplication(inputs.input);
  const enz = ENZYMES[inputs.input.organism];
  const headline = [
    `${m.length} bp duplex, fork moving ${inputs.input.direction}: the ${m.leadingTemplate} parental strand is the leading template`,
    `Leading strand 5′-${m.finalLeading}-3′ (continuous, one primer)`,
    `Lagging strand 5′-${m.finalLagging}-3′ (${m.fragments.length} Okazaki fragment${m.fragments.length === 1 ? "" : "s"})`,
    `${enz.helicase}, ${enz.primase}, ${enz.leadingPol}${enz.leadingPol === enz.laggingPol ? "" : ` (leading) and ${enz.laggingPol} (lagging)`}, ${enz.ligase}`,
    `${m.steps.length - 1} steps from the intact duplex to two daughter duplexes`,
  ];
  return { engineVersion: REPLICATION_ENGINE_VERSION, headline, assumptions: REPLICATION_ASSUMPTIONS, check: m.steps.length, checkLabel: "timeline length (steps)" };
}

export function summarizeTranscription(inputs: TranscriptionInputs): BiologyResults | null {
  const m = buildTranscription(inputs.input);
  const t = m.translation;
  const euk = inputs.input.organism === "eukaryote";
  const headline = [
    `Pre-mRNA / transcript: 5′-${m.rna.length > 60 ? `${m.rna.slice(0, 57)}…` : m.rna}-3′ (${m.rna.length} nt)`,
    euk ? `Mature mRNA: ${m.mature.length} nt between the cap and the tail (${inputs.input.introns.length} intron${inputs.input.introns.length === 1 ? "" : "s"} spliced out; poly(A) ${m.polyA ? "added after cleavage" : "not added: no AAUAAA signal"})` : "Bacterial mRNA: the primary transcript, ready for translation",
    t ? `First-AUG peptide: ${t.protein || "(none)"}` : "No AUG: no peptide",
  ];
  return { engineVersion: TRANSCRIPTION_ENGINE_VERSION, headline: headline.map((h) => h.slice(0, 390)), assumptions: TRANSCRIPTION_ASSUMPTIONS, check: m.mature.length, checkLabel: "mature mRNA length (nt)" };
}

export function summarizeTranslation(inputs: TranslationInputs): BiologyResults | null {
  const m = buildTranslation(inputs.input);
  const t = m.translation;
  if (!t) return { engineVersion: TRANSLATION_ENGINE_VERSION, headline: ["No AUG start codon: no translation"], assumptions: TRANSLATION_ASSUMPTIONS, check: 0, checkLabel: "peptide length (residues)" };
  const headline = [
    `Start codon AUG at position ${(m.start as number) + 1}`,
    `Peptide: ${t.protein.length > 80 ? `${t.protein.slice(0, 77)}…` : t.protein} (${t.protein.length} residues)`,
    t.status === "terminated" ? `Terminated at ${t.codons[t.stopCodonIndex as number].codon}` : t.status === "no-stop" ? "No stop codon: the ribosome stalls at the end of the mRNA" : "The mRNA ends with an incomplete codon: the ribosome stalls",
  ];
  return { engineVersion: TRANSLATION_ENGINE_VERSION, headline, assumptions: TRANSLATION_ASSUMPTIONS, check: t.protein.length, checkLabel: "peptide length (residues)" };
}

export function summarizeDogma(inputs: DogmaInputs): BiologyResults | null {
  const a = analyzeDogma(inputs.input);
  const headline = [
    `Coding strand 5′-${a.coding}-3′ → mRNA 5′-${a.mrna}-3′`,
    a.wild ? `Peptide: ${a.wild.protein || "(none)"} (${a.wild.protein.length} residues, ${a.wild.status})` : "No AUG in the mRNA: no peptide",
    a.consequence ? `Mutation: ${a.consequence.class} — mutant peptide ${a.consequence.mutant.protein || "(none)"}` : "No mutation applied",
  ];
  return { engineVersion: DOGMA_ENGINE_VERSION, headline: headline.map((h) => h.slice(0, 390)), assumptions: DOGMA_ASSUMPTIONS, check: a.wild ? a.wild.protein.length : 0, checkLabel: "wild-type peptide length (residues)" };
}
