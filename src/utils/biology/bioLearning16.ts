/**
 * Practice and Challenge material for gene regulation, genetics and cell division (pure; no React). Every answer is computed from
 * the same engine state that draws the diagram; there is no stored answer key.
 */
import { makeQuestion, type Question } from "./bioLearning";
import {
  compareRanks, eukChanges, eukComponents, eukRank, evaluateEuk, evaluateLac, evaluateTrp, lacChanges, lacCisTrans, lacComponents, lacRank, trpChanges, trpComponents, trpRank,
  type EukInput, type LacInput, type RegChange, type TrpInput,
} from "./geneRegulation";
import { cross, frAdd, frNum, frText, gametesOf, FR_ZERO, type CrossResult, type Fr } from "./genetics";
import { LAYOUTS, LOCI, alleleText, type Individual } from "./chromosome";
import { disomyType, gameteComplements, meiosisCore, type DivisionStage, type MeiosisSettings } from "./cellDivision";

// ---- gene regulation ---------------------------------------------------------------------------------------------------------

const EFFECT_TEXT = { increases: "Transcription increases", decreases: "Transcription decreases", same: "Transcription stays about the same", uncertain: "It cannot be predicted from the conditions given" } as const;
export type Effect = keyof typeof EFFECT_TEXT;
export const effectLabel = (e: Effect) => EFFECT_TEXT[e];

export interface RegChallenge<I> { change: RegChange<I>; question: Question; effect: Effect }

function challengeFor<I>(changes: Array<RegChange<I>>, index: number, rank: (i: I) => number | null, current: I, system: string): RegChallenge<I> | null {
  if (!changes.length) return null;
  const change = changes[((index % changes.length) + changes.length) % changes.length];
  const effect = compareRanks(rank(current), rank(change.next));
  const options = [EFFECT_TEXT.increases, EFFECT_TEXT.decreases, EFFECT_TEXT.same, EFFECT_TEXT.uncertain];
  const correct = EFFECT_TEXT[effect];
  const question = makeQuestion(`reg-${system}-${change.id}-${index}`, `Predict: ${change.label}. What happens to transcription of this gene?`, correct, options.filter((o) => o !== correct), "");
  return { change, question, effect };
}
export const lacChallenge = (i: LacInput, index: number) => withReason(challengeFor(lacChanges(i), index, lacRank, i, "lac"), (c) => evaluateLac(c.change.next).reasons.slice(0, 3).join(" "), (c) => `Before: ${evaluateLac(i).transcription.label}. After: ${evaluateLac(c.change.next).transcription.label}.`);
export const trpChallenge = (i: TrpInput, index: number) => withReason(challengeFor(trpChanges(i), index, trpRank, i, "trp"), (c) => evaluateTrp(c.change.next).reasons.slice(0, 2).join(" "), (c) => `Before: ${evaluateTrp(i).level.label}. After: ${evaluateTrp(c.change.next).level.label}.`);
export const eukChallenge = (i: EukInput, index: number) => withReason(challengeFor(eukChanges(i), index, eukRank, i, "euk"), (c) => evaluateEuk(c.change.next).reasons.slice(0, 3).join(" "), (c) => `Before: ${evaluateEuk(i).level.label}. After: ${evaluateEuk(c.change.next).level.label}.`);
function withReason<I>(c: RegChallenge<I> | null, why: (c: RegChallenge<I>) => string, summary: (c: RegChallenge<I>) => string): RegChallenge<I> | null {
  if (!c) return null;
  return { ...c, question: { ...c.question, explanation: `${summary(c)} ${why(c)}` } };
}

/** Practice questions about the regulation state on screen. */
export function lacQuestions(i: LacInput): Question[] {
  const ev = evaluateLac(i);
  const qs: Question[] = [];
  const comps = lacComponents(i);
  const cis = comps.filter((c) => c.kind === "cis-acting DNA element").map((c) => c.label);
  const trans = comps.filter((c) => c.kind === "trans-acting protein").map((c) => c.label);
  qs.push(makeQuestion("lac-state", "With the conditions shown, what is the level of lacZYA transcription?", ev.transcription.label, ["None (no promoter function)", "Basal (leaky)", "Low", "High"].filter((x) => x !== ev.transcription.label), ev.reasons.join(" ")));
  qs.push(makeQuestion("lac-cis", "Which of these is a cis-acting DNA element?", cis[0], trans, "A cis-acting element is a DNA sequence that works only on genes on the same DNA molecule. Proteins that diffuse, such as the repressor and cAMP–CRP, act in trans."));
  qs.push(makeQuestion("lac-trans", "Which of these acts in trans (a diffusible factor)?", trans[0], cis.slice(0, 3), "The LacI repressor and cAMP–CRP are proteins that move through the cell, so they act on every copy of the operon. The operator, promoter and CAP site are DNA sites that only work in cis."));
  qs.push(makeQuestion("lac-why", "Why do lactose and glucose have different kinds of effects on the lac operon?", "Lactose controls a repressor (negative control, specific to lactose); glucose controls cAMP–CRP (positive control, shared by many sugar operons)", ["Both act only on the repressor", "Glucose binds the operator directly and lactose binds the promoter", "Lactose and glucose both act only through cAMP"], "Lactose, via allolactose, decides whether the repressor blocks the operator: it removes a brake. Glucose, via cAMP, decides whether CRP helps RNA polymerase: it controls the accelerator. High expression needs the brake off and the accelerator on."));
  qs.push(makeQuestion("lac-leak", "Even when the repressor is bound to the operator, a little transcription still occurs. What is this called?", "Basal (leaky) expression", ["Induction", "Attenuation", "Catabolite repression"], "A repressor binding is a reversible equilibrium, not a permanent lock; it dissociates now and then, so a small amount of transcription leaks through."));
  for (const k of ["I-", "Oc"] as const) {
    const r = lacCisTrans(k);
    qs.push(makeQuestion(`lac-ct-${k}`, k === "I-" ? "A lacI⁻ mutation (no repressor) is put on one DNA molecule of a cell that also has a wild-type lacI⁺ copy. Does the wild-type copy rescue the mutant operon?" : "A lacOᶜ mutation is put on one DNA molecule of a cell that also has a wild-type operon. Does the wild-type copy fix the mutant operon?", r.verdict === "trans" ? "Yes: the effect is trans, a diffusible repressor restores control" : "No: the effect is cis, only the genes beside the operator are affected", r.verdict === "trans" ? ["No: the effect is cis, only the genes beside the operator are affected", "Only when lactose is absent and glucose is present"] : ["Yes: the effect is trans, a diffusible repressor restores control", "Only when lactose is absent and glucose is present"], r.evidence.join(" ")));
  }
  return qs;
}
export function trpQuestions(i: TrpInput): Question[] {
  const ev = evaluateTrp(i);
  const comps = trpComponents(i);
  const qs: Question[] = [];
  qs.push(makeQuestion("trp-state", "With these conditions, what is the level of trp-operon expression?", ev.level.label, ["Very low", "Low", "Intermediate", "Moderately high", "High"].filter((x) => x !== ev.level.label), ev.reasons.join(" ")));
  qs.push(makeQuestion("trp-diff", "What is the difference between repression and attenuation?", "Repression controls whether transcription starts (a protein at the operator); attenuation controls whether a started transcript is finished (RNA structure decided by the ribosome)", ["Both are a protein binding the operator, one at high and one at low tryptophan", "Attenuation happens after translation of the trp enzymes", "Repression acts on the RNA and attenuation on the DNA"], "Repression acts on DNA before transcription; attenuation acts during transcription of the leader, by choosing between the 2:3 antiterminator and the 3:4 terminator hairpin."));
  qs.push(makeQuestion("trp-core", "What does tryptophan do to the trp repressor?", "It binds as a corepressor and activates the repressor so it can bind the operator", ["It binds the repressor and releases it from the operator", "It binds the operator directly", "It binds RNA polymerase"], "In the trp operon the repressor is inactive alone; tryptophan is a corepressor. (In the lac operon the inducer does the reverse: it releases the repressor.)"));
  qs.push(makeQuestion("trp-stall", "At low tryptophan the ribosome stalls on the leader. Which hairpin forms?", "2:3 (antiterminator): region 3 is not free to pair with 4", ["3:4 (terminator)", "1:2 only, then termination", "No hairpin forms"], "With the ribosome stalled on region 1, region 2 is free and pairs with region 3. Region 3 is then not available to pair with region 4, so the terminator does not form."));
  qs.push(makeQuestion("trp-coupling", "Why can the ribosome control the RNA structure of the leader in bacteria?", "Transcription and translation are coupled: the ribosome translates the leader while it is still being made", ["The leader is made in the nucleus and exported first", "The ribosome makes the DNA", "The leader is translated after transcription ends"], "There is no nuclear envelope in bacteria, so a ribosome follows close behind RNA polymerase."));
  qs.push(makeQuestion("trp-cis", "Which of these acts in cis?", comps.find((c) => c.id === "attenuator")!.label, [comps.find((c) => c.id === "trp")!.label, comps.find((c) => c.id === "ribosome")!.label, "The trp repressor protein"], "The attenuator is a DNA sequence (and the RNA it makes) that works only on the operon it belongs to."));
  return qs;
}
export function eukQuestions(i: EukInput): Question[] {
  const ev = evaluateEuk(i);
  const comps = eukComponents(i);
  const qs: Question[] = [];
  qs.push(makeQuestion("euk-state", "Under these conditions, what does the model predict for transcription?", ev.level.label, ["Silent / repressed", "Basal", "High (activated)", "Uncertain (conflicting chromatin marks)", "Uncertain (activator and repressor compete)"].filter((x) => x !== ev.level.label), ev.reasons.join(" ")));
  qs.push(makeQuestion("euk-cis", "Which is a cis-acting element?", comps.find((c) => c.id === "enhancer")!.label, [comps.find((c) => c.id === "activator")!.label, comps.find((c) => c.id === "mediator")!.label, comps.find((c) => c.id === "polII")!.label], "Enhancers, silencers and promoters are DNA sequences that act on the gene on the same chromosome. Activators, repressors, Mediator and Pol II are diffusible and act in trans."));
  qs.push(makeQuestion("euk-link", "What links an enhancer far from the gene to the promoter?", "Looping of the DNA, with Mediator bridging activators to the general transcription factors", ["The enhancer is transcribed into the promoter", "Pol II slides from the enhancer", "The enhancer must lie directly beside the promoter"], "Enhancers work at a distance and in either orientation because DNA can loop. Mediator carries the signal to Pol II."));
  qs.push(makeQuestion("euk-ac", "How does histone acetylation usually affect transcription?", "It loosens nucleosomes and makes the DNA more accessible", ["It makes the DNA sequence change", "It always silences the gene", "It cuts the DNA"], "Acetylation neutralises positive charge on histone tails, loosening their grip on DNA. It is reversible and does not change the DNA sequence. The effect on a given gene still depends on context."));
  qs.push(makeQuestion("euk-me", "What is true of promoter DNA methylation?", "It is an epigenetic mark, usually associated with silencing, whose effect depends on context", ["It always switches a gene off", "It changes the DNA bases into different bases", "It has no effect on any gene"], "Methyl groups on cytosines in CpG islands are read by proteins that recruit histone deacetylases, often silencing the gene. But methylation inside genes or at other sites can have other roles, so it is not a universal switch."));
  return qs;
}

// ---- genetics ----------------------------------------------------------------------------------------------------------------

/** Gamete-picking task: choose every gamete this parent can make. */
export interface GameteTask { prompt: string; candidates: string[]; correct: string[]; explanation: string }
export function gameteTask(ind: Individual, r: Fr): GameteTask {
  const layout = LAYOUTS[ind.layout];
  // candidates: every combination of one allele per locus, across all pairs
  let combos: string[][] = [[]];
  layout.pairs.forEach((loci) => { combos = combos.flatMap((c) => (ind.layout === "xlinked" ? [] : loci.reduce<string[][]>((acc, id) => acc.flatMap((a) => LOCI[id].alleles.map((al) => [...a, al])), [[]]).map((hap) => [...c, hap.map(alleleText).join("")]))); });
  const candidates = ind.layout === "xlinked" ? gametesOf(ind, r).map((g) => g.label) : combos.map((c) => c.join(" "));
  const correct = gametesOf(ind, r).filter((g) => g.p.n > 0).map((g) => g.label);
  const unique = [...new Set(candidates)];
  return {
    prompt: "Select every gamete this parent can make.",
    candidates: unique, correct: [...new Set(correct)].sort(),
    explanation: `Each gamete gets one homolog of every chromosome pair. ${layout.linked ? `The two genes are linked, so the parental combinations are most common and recombinants appear with total frequency ${frText(r)} when the parent is heterozygous at both genes.` : "Different pairs separate independently, so every combination of one allele per pair is possible."}`,
  };
}
export function gradeGameteTask(task: GameteTask, chosen: string[]): { right: string[]; missing: string[]; extra: string[]; ok: boolean } {
  const set = new Set(chosen);
  const right = task.correct.filter((c) => set.has(c));
  const missing = task.correct.filter((c) => !set.has(c));
  const extra = chosen.filter((c) => !task.correct.includes(c));
  return { right, missing, extra, ok: !missing.length && !extra.length };
}

/** Parses "1/4", "0.25", "25%" or "3 in 16" into a number, or null. */
export function parseProbabilityInput(text: string): number | null {
  const t = text.trim().replace(/\s+/g, " ");
  let m = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (m) { const d = Number(m[2]); return d === 0 ? null : Number(m[1]) / d; }
  m = /^(\d+)\s+in\s+(\d+)$/i.exec(t);
  if (m) { const d = Number(m[2]); return d === 0 ? null : Number(m[1]) / d; }
  m = /^(\d+(?:\.\d+)?)\s*%$/.exec(t);
  if (m) return Number(m[1]) / 100;
  if (/^\d*\.?\d+$/.test(t)) { const v = Number(t); return v >= 0 && v <= 1 ? v : null; }
  return null;
}
export const probabilityMatches = (guess: number, answer: Fr) => Math.abs(guess - frNum(answer)) < 0.005;

export interface GeneticsChallenge { prompt: string; answer: Fr; className: string; explanation: string; kind: "phenotype" | "recombinant" }
/** A numeric prediction about the cross currently set up: the fraction of offspring in its rarest phenotype class (or of recombinant gametes). */
export function geneticsChallenge(p1: Individual, p2: Individual, r: Fr, result: CrossResult = cross(p1, p2, r)): GeneticsChallenge {
  const layout = LAYOUTS[p1.layout];
  if (layout.linked) {
    const rec = gametesOf(p1, r).filter((g) => g.kind === "recombinant").reduce((a, g) => frAdd(a, g.p), FR_ZERO);
    const answer = rec;
    return { kind: "recombinant", prompt: `Parent 1 is ${p1.pairs[0].a.alleles.map(alleleText).join("")}/${p1.pairs[0].b.alleles.map(alleleText).join("")} with a recombination fraction of ${frText(r)}. What fraction of its gametes will carry a RECOMBINANT chromosome? (enter a fraction, decimal or %)`, answer, className: "recombinant gametes", explanation: `Recombinant gametes carry a chromosome whose allele combination differs from both homologs. With a recombination fraction of ${frText(r)} they total ${frText(answer)}${answer.n === 0 ? " (parent 1 is not heterozygous at both genes, so crossing over cannot make a new combination)" : ""}.` };
  }
  const rare = [...result.phenotypes].filter((t) => t.p.n > 0).sort((a, b) => frNum(a.p) - frNum(b.p))[0];
  return { kind: "phenotype", prompt: `What fraction of the offspring will be “${rare.label}”? (enter a fraction, decimal or %)`, answer: rare.p, className: rare.label, explanation: `Offspring distribution (${result.phenotypicRatio}): ${result.phenotypes.map((t) => `${t.label} ${frText(t.p)}`).join("; ")}.` };
}

export function geneticsQuestions(p1: Individual, p2: Individual, r: Fr, result: CrossResult = cross(p1, p2, r)): Question[] {
  const qs: Question[] = [];
  const top = result.phenotypes[0];
  qs.push(makeQuestion("gen-ratio", "What is the phenotypic ratio of the offspring of this cross?", result.phenotypicRatio, [...new Set(["3:1", "1:1", "1:2:1", "9:3:3:1", "1:1:1:1", "1:0", "2:1", "3:1:1:3"])].filter((x) => x !== result.phenotypicRatio), `Phenotypes: ${result.phenotypes.map((t) => `${t.label} ${frText(t.p)}`).join("; ")}.`));
  qs.push(makeQuestion("gen-most", "Which phenotype is most common among the offspring?", top.label, result.phenotypes.slice(1).map((t) => t.label).concat(["none of these"]), `${top.label} has probability ${frText(top.p)}.`));
  qs.push(makeQuestion("gen-count", "How many different gamete classes can parent 1 make?", String(result.gametes1.length), [String(result.gametes1.length + 1), String(Math.max(1, result.gametes1.length - 1)), String(result.gametes1.length * 2)], `Parent 1's gametes: ${result.gametes1.map((g) => g.label).join(", ")}.`));
  qs.push(makeQuestion("gen-cells", "How many boxes does the Punnett square have?", String(result.gametes1.length * result.gametes2.length), [String(result.gametes1.length * result.gametes2.length + 2), String(result.gametes1.length + result.gametes2.length), "16"], "One box for each pairing of a gamete class from parent 1 with a gamete class from parent 2."));
  if (LAYOUTS[p1.layout].linked) {
    const lk = gametesOf(p1, r);
    const par = lk.filter((g) => g.kind === "parental");
    qs.push(makeQuestion("gen-parental", "Which gametes are the PARENTAL (non-recombinant) classes?", par.map((g) => g.label).join(" and ") || "none", [lk.filter((g) => g.kind === "recombinant").map((g) => g.label).join(" and ") || "none", "all four equally", "only one class"], "Parental gametes carry a chromosome exactly as it is in the parent; recombinant gametes carry a new combination made by crossing over."));
  }
  return qs;
}

// ---- cell division -----------------------------------------------------------------------------------------------------------

export function divisionQuestions(stages: DivisionStage[], step: number, kind: "mitosis" | "meiosis"): Question[] {
  const st = stages[Math.min(step, stages.length - 1)];
  const c = st.counts[0];
  const qs: Question[] = [];
  const dist = (n: number) => [n + 1, Math.max(0, n - 1), n * 2, n + 2].filter((x) => x !== n && x >= 0).map(String);
  qs.push(makeQuestion(`dv-chr-${kind}-${st.id}`, `At “${st.title}”, how many chromosomes (centromeres) does ${st.cells.length === 1 ? "the cell" : "each cell"} have?`, String(c.chromosomes), dist(c.chromosomes), `${st.title}: ${c.chromosomes} chromosomes (counted by centromeres), ${c.chromatids} chromatids, DNA content ${c.dnaC}C.`));
  qs.push(makeQuestion(`dv-dna-${kind}-${st.id}`, `At “${st.title}”, what is the DNA content of ${st.cells.length === 1 ? "the cell" : "each cell"} (haploid amount = 1C)?`, `${c.dnaC}C`, ["1C", "2C", "4C", "0.5C"].filter((x) => x !== `${c.dnaC}C`), `DNA content is chromatids ÷ haploid chromosome number: ${c.chromatids} ÷ ${stages[0].counts[0].chromosomes / 2} = ${c.dnaC}C. Chromosome number and DNA content are not the same thing.`));
  qs.push(makeQuestion(`dv-chtd-${kind}-${st.id}`, `How many chromatids are there ${st.cells.length === 1 ? "in the cell" : "in each cell"} at “${st.title}”?`, String(c.chromatids), dist(c.chromatids), `Each unreplicated chromosome has one chromatid; each replicated chromosome has two sister chromatids. Here: ${c.chromosomes} chromosomes, ${c.chromatids} chromatids.`));
  if (kind === "meiosis") {
    qs.push(makeQuestion("dv-sep1", "What separates in anaphase I?", "Homologous chromosomes", ["Sister chromatids", "Non-sister chromatids", "Nothing separates"], "In meiosis I the homologs of each pair move to opposite poles while sister chromatids stay together."));
    qs.push(makeQuestion("dv-sep2", "What separates in anaphase II?", "Sister chromatids", ["Homologous chromosomes", "Bivalents", "Nothing separates"], "Meiosis II resembles mitosis: the centromeres split and sister chromatids separate."));
    qs.push(makeQuestion("dv-repl", "How many rounds of DNA replication occur in meiosis, which has two divisions?", "One", ["Two", "None", "One before each division"], "DNA is replicated once (S phase) and then divided twice. That is why the products are haploid."));
  } else {
    qs.push(makeQuestion("dv-mit-pair", "Do homologous chromosomes pair up in mitosis?", "No: each chromosome lines up on its own", ["Yes, as in prophase I of meiosis", "Only at metaphase", "Only at anaphase"], "Pairing (synapsis) and crossing over are features of prophase I of meiosis, not of mitosis."));
    qs.push(makeQuestion("dv-mit-ana", "What happens to the chromosome number in anaphase of mitosis?", "It doubles (each sister chromatid becomes a chromosome); DNA content stays the same", ["It halves", "It stays the same, and DNA content doubles", "It doubles and DNA content doubles"], "At anaphase the centromeres split, so the chromosome count doubles; no DNA is made, so the DNA content is unchanged until the cell divides."));
  }
  return qs;
}

export interface DivisionChallenge { prompt: string; question: Question; answer: number }
/** Challenge: with the chosen settings, predict a property of the four gametes before they are revealed. */
export function meiosisChallenge(ind: Individual, s: MeiosisSettings): DivisionChallenge {
  const gs = gameteComplements(ind, s);
  const nPairs = ind.pairs.length;
  if (s.nd.kind !== "none") {
    const abnormal = gs.filter((g) => g.perPair.some((k) => k !== 1)).length;
    const q = makeQuestion(`dv-ch-nd-${abnormal}`, "How many of the four gametes will have an abnormal chromosome number?", String(abnormal), ["0", "1", "2", "3", "4"].filter((x) => x !== String(abnormal)), `The gametes are: ${gs.map((g) => `${g.label} (${g.sets})`).join("; ")}.`);
    return { prompt: q.prompt, question: q, answer: abnormal };
  }
  const core = meiosisCore(ind, s);
  const recombinant = core.gametes.filter((g) => g.some((c) => new Set(c.chromatids[0].origins).size > 1)).length;
  void nPairs;
  const q = makeQuestion(`dv-ch-rec-${recombinant}`, "How many of the four gametes will carry a recombinant chromosome (part maternal, part paternal)?", String(recombinant), ["0", "1", "2", "3", "4"].filter((x) => x !== String(recombinant)), `A single crossover between two non-sister chromatids produces two recombinant chromatids out of the four; how many of them reach different gametes follows from the orientations at metaphase II. Here: ${recombinant} of 4. Gametes: ${core.gametes.map((g) => g.map((c) => c.chromatids[0].alleles.join("")).join(" ")).join("; ")}.`);
  return { prompt: q.prompt, question: q, answer: recombinant };
}

export function ndGameteNotes(ind: Individual, s: MeiosisSettings): string[] {
  if (s.nd.kind === "none") return [];
  const core = meiosisCore(ind, s);
  const pair = s.nd.pair;
  const notes: string[] = [];
  core.gametes.forEach((g, i) => {
    const count = g.filter((c) => c.pair === pair).length;
    if (count === 2) notes.push(`Gamete ${i + 1} has two chromosomes of pair ${pair + 1}: ${disomyType(g, pair) === "both homologs" ? "both the maternal and the paternal homolog (a meiosis I error leaves the two different homologs together)" : "two copies of the same homolog (a meiosis II error leaves two sister chromatids together)"}.`);
    if (count === 0) notes.push(`Gamete ${i + 1} has no chromosome of pair ${pair + 1}.`);
  });
  return notes;
}
