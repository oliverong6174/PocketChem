/**
 * Display summaries (and the one `check` number) saved beside the Stage 16 inputs, plus the assumption lists each tool states.
 * Pure functions of validated inputs.
 */
import { evaluateEuk, evaluateLac, evaluateTrp } from "./geneRegulation";
import { cross, frNum, frText, parseRecombination, fr } from "./genetics";
import { gameteComplements } from "./cellDivision";
import { describeIndividual, LAYOUTS } from "./chromosome";
import {
  CELLDIVISION_ENGINE_VERSION, GENETICS_ENGINE_VERSION, REGULATION_ENGINE_VERSION, divisionStages,
  type CellDivisionInputs, type GeneticsInputs, type RegulationInputs,
} from "../persistence/biologyTools16";
import type { BiologyResults } from "../persistence/biologyTools";

export const REGULATION_ASSUMPTIONS = [
  "Expression is an ordinal model rank with a qualitative label, not a measured rate. Ranks say 'more than', 'less than' or 'about the same', never by how much.",
  "Basal (leaky) expression is modelled: a bound repressor lowers transcription but does not reduce it to zero.",
  "lac operon: lactose is assumed to supply allolactose whenever it is present (inducer exclusion by glucose, permease dynamics and the real kinetics are not modelled); cAMP–CRP acts only through glucose; the CAP site is assumed intact.",
  "trp operon: the leader is a schematic sequence that keeps the real leader peptide and the real 1:2, 2:3, 3:4 pairing logic, but it is not the E. coli nucleotide sequence. Pairing is decided by base complementarity and ribosome coverage, not by RNA energy calculations.",
  "Eukaryotic model: a handful of declared elements and marks with declared, context-dependent effects. It does not predict the effect of an arbitrary sequence or epigenetic change, and several combinations are reported as uncertain on purpose.",
];
export const GENETICS_ASSUMPTIONS = [
  "Probabilities are exact fractions from the stated model; they describe expected proportions among many offspring, not the result of any one family.",
  "Each parent's homologs segregate into gametes with equal probability (Mendel's first law) and different chromosome pairs assort independently (second law), except for the two linked genes.",
  "Linked genes: the recombination fraction r (0–0.5) is an input. The model does not compute r from map distance or DNA sequence, ignores interference and double crossovers, and treats crossing over as the only source of recombinants. At r = 0.5 linked genes behave as if unlinked.",
  "Genotype-to-phenotype rules are stated for each gene (complete dominance, incomplete dominance, codominance, a multiple-allele series, X-linked recessive). Real traits are often influenced by many genes and the environment; these are teaching examples.",
  "X-linked example: a female (XX) mother and a male (XY) father; the Y chromosome carries no allele at this locus. Males are hemizygous.",
];
export const DIVISION_ASSUMPTIONS = [
  "A small cell: one or two chromosome pairs (2n = 2 or 4), each with one or two genes, so every chromosome and chromatid can be drawn.",
  "Chromosome number is the number of centromeres; DNA content is the number of chromatids ÷ the haploid chromosome number (1C = one haploid set of DNA).",
  "One illustrated meiosis is one random outcome, not a distribution. The crossover, the orientations at metaphase I and II and any nondisjunction are settings you choose; expected frequencies come from the Genetics tool, which agrees with the average over all settings.",
  "At most one crossover per chromosome pair, between two non-sister chromatids and between the two genes; interference, double crossovers, the synaptonemal complex and chiasma maintenance are not modelled.",
  "Nondisjunction demonstrations produce one abnormal pair at a time (meiosis I: both homologs to one pole; meiosis II: both sister chromatids to one pole). Chromosome-number errors are not gene mutations: no allele changes, but a gamete may carry zero or two copies of a whole chromosome. Autosomes only.",
];

const ok = (engineVersion: number, headline: string[], assumptions: string[], check: number, checkLabel: string): BiologyResults => ({ engineVersion, headline: headline.map((h) => h.slice(0, 390)), assumptions, check, checkLabel });

export function summarizeRegulation(i: RegulationInputs): BiologyResults | null {
  if (i.system === "lac") {
    const e = evaluateLac(i.lac);
    return ok(REGULATION_ENGINE_VERSION, [`lac operon: lactose ${i.lac.lactose ? "present" : "absent"}, glucose ${i.lac.glucose ? "present" : "absent"}`, `Repressor: ${e.repressor}; cAMP–CRP ${e.crpActive ? "active" : "not active"}`, `lacZYA transcription: ${e.transcription.label}`], REGULATION_ASSUMPTIONS, e.transcription.rank, "lac model transcription rank (0–3, ordinal)");
  }
  if (i.system === "trp") {
    const e = evaluateTrp(i.trp);
    return ok(REGULATION_ENGINE_VERSION, [`trp operon: tryptophan ${i.trp.trp}`, `Operator ${e.operator}; leader scenario ${e.scenario}`, `Expression: ${e.level.label}`], REGULATION_ASSUMPTIONS, e.level.rank, "trp model expression rank (0–4, ordinal)");
  }
  const e = evaluateEuk(i.euk);
  return ok(REGULATION_ENGINE_VERSION, [`Chromatin ${e.chromatin}; Pol II ${e.polII}`, `Predicted transcription: ${e.level.label}`], REGULATION_ASSUMPTIONS, e.level.rank ?? -1, "eukaryotic model rank (0–2; −1 = uncertain)");
}

export function summarizeGenetics(i: GeneticsInputs): BiologyResults | null {
  const r = parseRecombination(i.recombination) ?? fr(1, 2);
  const x = cross(i.parent1, i.parent2, r);
  const lines = [
    `${describeIndividual(i.parent1)} × ${describeIndividual(i.parent2)}${LAYOUTS[i.parent1.layout].linked ? ` (recombination fraction ${i.recombination})` : ""}`,
    `Phenotypes: ${x.phenotypes.map((t) => `${t.label} ${frText(t.p)}`).join("; ")} (ratio ${x.phenotypicRatio})`,
    `Genotypes: ${x.genotypes.map((t) => `${t.label} ${frText(t.p)}`).join("; ")} (ratio ${x.genotypicRatio})`,
  ];
  return ok(GENETICS_ENGINE_VERSION, lines, GENETICS_ASSUMPTIONS, Number(frNum(x.phenotypes[0].p).toFixed(6)), "probability of the most common phenotype");
}

export function summarizeCellDivision(i: CellDivisionInputs): BiologyResults | null {
  const stages = divisionStages(i);
  const last = stages[stages.length - 1];
  const lines = [`${i.process === "mitosis" ? "Mitosis" : "Meiosis"} of ${describeIndividual(i.individual)}`, `${last.cells.length} final cells: ${last.counts.map((c) => `${c.chromosomes} chromosomes (${c.sets})`).join("; ")}`];
  if (i.process === "meiosis") lines.push(`Gametes: ${gameteComplements(i.individual, i.settings).map((g) => g.label).join(" | ")}`);
  return ok(CELLDIVISION_ENGINE_VERSION, lines, DIVISION_ASSUMPTIONS, last.counts.reduce((a, c) => a + c.chromosomes, 0), "total chromosomes in the final cells");
}
