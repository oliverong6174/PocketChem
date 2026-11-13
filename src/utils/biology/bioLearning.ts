/**
 * Practice and Challenge questions for the Biology tools (pure; no React). Every answer is derived from the engine state the
 * learner is looking at (the replication timeline, the transcript, the ribosome step, the mutation), never from a stored answer
 * key, so a question about "the next nucleotide" is about the sequence actually on screen.
 */
import { ENZYMES, forkRoles, type ActionKind, type ReplicationModel } from "./replication";
import type { TranscriptionModel } from "./transcription";
import { rnaFromTemplateColumns } from "./transcription";
import type { TranslationModel } from "./translation";
import { AMINO_ACIDS } from "./geneticCode";
import { applyMutation, classify, describeMutation, type Mutation, type MutationClass } from "./mutations";
import { complementDna } from "./sequence";
import type { DogmaAnalysis } from "./dogma";

export interface Question {
  id: string;
  prompt: string;
  options: string[];
  /** Index into `options`. */
  answer: number;
  explanation: string;
}

/** Deterministic 32-bit hash for reproducible option order. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Builds options with the correct one among up to four, in an order fixed by `seed`. */
export function makeQuestion(id: string, prompt: string, correct: string, distractors: string[], explanation: string): Question {
  let h = hash(id + prompt);
  // choose (not just truncate) the distractors so the same few options are not always shown
  const pool = [...new Set(distractors.filter((d) => d !== correct))].map((value, i) => ({ value, key: hash(`${id}|${value}|${i}`) }));
  pool.sort((a, b) => a.key - b.key);
  const all = [correct, ...pool.slice(0, 3).map((x) => x.value)];
  const order = all.map((value, i) => ({ value, key: (h = Math.imul(h ^ (i + 1), 2654435761) >>> 0) }));
  order.sort((a, b) => a.key - b.key);
  const options = order.map((o) => o.value);
  return { id, prompt, options, answer: options.indexOf(correct), explanation };
}

// ---- replication --------------------------------------------------------------------------------------------------------------

const KIND_TEXT: Record<ActionKind, string> = {
  unwind: "The helicase opens another base pair",
  leadPrimer: "Primase makes the RNA primer of the leading strand",
  leadExtend: "A polymerase extends the leading strand",
  lagPrimer: "Primase lays an RNA primer for a new Okazaki fragment",
  lagExtend: "A polymerase extends an Okazaki fragment",
  removePrimer: "An RNA primer is removed",
  fillGap: "A gap left by a primer is filled with DNA",
  ligate: "Ligase seals a nick",
};

export function replicationQuestions(model: ReplicationModel, step: number): Question[] {
  const input = model.input;
  const enz = ENZYMES[input.organism];
  const roles = forkRoles(input.direction);
  const qs: Question[] = [];
  const dir = input.direction;
  qs.push(makeQuestion(`rep-lead-${dir}`, `The fork moves ${dir}. Which parental strand is the template for the LEADING strand?`, `The ${roles.leadingTemplate} strand`, [`The ${roles.laggingTemplate} strand`, "Both strands equally", "Neither: leading strands need no template"], roles.why));
  qs.push(makeQuestion(`rep-lag-${dir}`, "Which new strand is made in Okazaki fragments?", `The strand copied from the ${roles.laggingTemplate} parental strand`, [`The strand copied from the ${roles.leadingTemplate} parental strand`, "Both new strands", "Neither new strand"], `DNA polymerases only add nucleotides to a 3′ end, so a new strand can only grow 5′→3′. On the ${roles.laggingTemplate} template that direction points away from the fork, so the strand is made in short pieces, each needing its own primer.`));
  qs.push(makeQuestion("rep-dir", "In which direction does a DNA polymerase extend a new strand?", "5′ → 3′ (it adds to the 3′-OH end)", ["3′ → 5′", "Either direction, depending on the strand", "From the middle outward"], "The polymerase needs a free 3′-OH to attach the next nucleotide's 5′ phosphate. Both new strands are therefore built 5′→3′, antiparallel to their templates."));
  qs.push(makeQuestion("rep-primer", "What is a primer made of, and why is it needed?", "RNA; polymerases cannot start a chain, only extend a 3′-OH", ["DNA; it is needed to unwind the helix", "Protein; it holds the strands apart", "RNA; it replaces the template"], `${enz.primase} makes a short RNA primer. A DNA polymerase can only add to an existing 3′-OH, so it needs this starter. Primers are later removed and replaced with DNA.`));
  qs.push(makeQuestion("rep-ligase", "Which enzyme joins neighbouring Okazaki fragments after the primer is replaced?", enz.ligase, [enz.helicase, enz.primase, enz.topo], `${enz.ligase} forms the final phosphodiester bond across the nick between fragments.`));
  qs.push(makeQuestion("rep-helicase", "Which enzyme separates the parental strands at the fork?", enz.helicase, [enz.ligase, enz.primase, enz.leadingPol], `${enz.helicase} uses ATP to break the hydrogen bonds between base pairs and move along the DNA. ${enz.ssb} then keeps the single strands apart and ${enz.topo} relieves the torsional strain ahead of the fork.`));
  const n = model.fragments.length;
  qs.push(makeQuestion(`rep-count-${n}`, `This segment (${model.length} bp) has Okazaki fragments of about ${input.okazakiLength} nt. How many fragments are made on the lagging strand?`, String(n), [String(n + 1), String(Math.max(1, n - 1)), String(n * 2)], `${model.length} bp divided into pieces of ${input.okazakiLength} nt gives ${n} fragment${n === 1 ? "" : "s"} (any remainder joins the last one).`));
  const next = model.steps[step + 1];
  if (next) {
    const lead = next.actions.find((a) => a.kind === "leadExtend");
    if (lead) {
      const col = input.direction === "right" ? lead.u : model.length - 1 - lead.u;
      const tb = (model.leadingTemplate === "top" ? model.top : model.bottom)[col];
      const nb = complementDna(tb);
      qs.push(makeQuestion(`rep-next-${step}`, `The leading-strand polymerase is at a template base ${tb}. Which nucleotide does it add next?`, nb, ["A", "C", "G", "T"].filter((b) => b !== nb), `${tb} pairs with ${nb} (A–T, G–C), so the polymerase adds ${nb} to the 3′ end of the leading strand.`));
    }
  }
  return qs;
}

/** Challenge: which processes will occur at the next step? The correct option is one that really occurs. */
export function replicationPredictNext(model: ReplicationModel, step: number): Question | null {
  const next = model.steps[step + 1];
  if (!next) return null;
  const occurs = new Set(next.actions.map((a) => a.kind));
  const priority: ActionKind[] = ["ligate", "removePrimer", "fillGap", "lagPrimer", "leadPrimer", "lagExtend", "leadExtend", "unwind"];
  const pick = priority.find((k) => occurs.has(k));
  if (!pick) return null;
  const absent = priority.filter((k) => !occurs.has(k));
  return makeQuestion(`rep-pn-${step}`, "Predict the next step: which of these will happen?", KIND_TEXT[pick], absent.map((k) => KIND_TEXT[k]), `In the next step: ${next.actions.map((a) => a.text).join("; ")}.`);
}

// ---- transcription ------------------------------------------------------------------------------------------------------------

export function transcriptionQuestions(model: TranscriptionModel, step: number): Question[] {
  const qs: Question[] = [];
  const euk = model.input.organism === "eukaryote";
  const st = model.steps[Math.min(step, model.steps.length - 1)].state;
  qs.push(makeQuestion("tx-template", "Which strand does RNA polymerase read as its template?", "The template strand, read 3′→5′", ["The coding strand, read 5′→3′", "Both strands at once", "Neither: RNA is made without a template"], "The polymerase reads the template strand 3′→5′ and builds RNA 5′→3′. The coding strand is called that because the RNA has its sequence (with U for T)."));
  qs.push(makeQuestion("tx-dir", "In which direction is RNA synthesised?", "5′ → 3′", ["3′ → 5′", "Both directions", "From the middle outward"], "Like DNA polymerases, RNA polymerase adds each ribonucleotide to the 3′-OH of the growing chain."));
  const nextIdx = st.transcribed;
  if (nextIdx < model.rna.length) {
    const tcol = model.template[nextIdx];
    const nb = rnaFromTemplateColumns(tcol);
    qs.push(makeQuestion(`tx-next-${nextIdx}`, `The template base at the active site is ${tcol} (reading 3′→5′). Which RNA nucleotide is added?`, nb, ["A", "C", "G", "U"].filter((b) => b !== nb), `${tcol} pairs with ${nb}: template A→U, T→A, G→C, C→G. RNA has no T; it uses U.`));
  }
  qs.push(makeQuestion("tx-same", "Which DNA strand has the same sequence as the RNA (except T→U)?", "The coding (non-template) strand", ["The template strand", "Neither", "Both"], "The RNA is complementary to the template, so it matches the coding strand."));
  if (euk) {
    const sp = model.input.introns;
    const removed = sp.reduce((a, i) => a + (i.end - i.start), 0);
    if (sp.length) qs.push(makeQuestion(`tx-splice-${removed}`, `How many nucleotides does splicing remove from this pre-mRNA?`, String(removed), [String(removed + 3), String(Math.max(1, removed - 2)), String(removed * 2)], `The intron${sp.length > 1 ? "s span" : " spans"} ${sp.map((i) => `${i.end - i.start} nt`).join(" + ")} = ${removed} nt; the exons are joined with nothing between them.`));
    qs.push(makeQuestion("tx-cap", "What is added to the 5′ end of a eukaryotic pre-mRNA?", "A 7-methylguanosine cap joined by a 5′–5′ triphosphate", ["A poly(A) tail", "A σ factor", "An intron"], "The cap protects the RNA from 5′ exonucleases and helps ribosomes bind. The poly(A) tail is added at the 3′ end."));
    qs.push(makeQuestion("tx-signal", "Which signal marks where the 3′ end is cut for polyadenylation?", "AAUAAA, 10–30 nt upstream of the cut", ["GU…AG", "TATA", "AUG"], "The cleavage and polyadenylation machinery recognises AAUAAA; GU…AG are splice sites, TATA is a promoter element, AUG is the start codon."));
    qs.push(makeQuestion("tx-which", "Which statement about RNA processing is correct?", "It happens in eukaryotes: cap, splicing and poly(A) tail", ["It happens in bacteria and eukaryotes alike", "It happens only in bacteria", "It changes the DNA gene"], "Bacterial mRNA needs no processing and is translated while still being made. Eukaryotic pre-mRNA is processed in the nucleus; the DNA gene is unchanged."));
  } else {
    qs.push(makeQuestion("tx-bact", "What must a bacterial transcript undergo before it can be translated?", "Nothing: ribosomes can begin on it while it is still being made", ["Capping and splicing", "Poly(A) tail addition only", "Export from a nucleus"], "Bacteria have no nucleus and, in general, no introns in these genes; transcription and translation are coupled."));
    qs.push(makeQuestion("tx-sigma", "What helps bacterial RNA polymerase find the promoter?", "The σ (sigma) factor", ["The spliceosome", "A 5′ cap", "TFIID"], "The holoenzyme (core enzyme + σ) recognises the −35 and −10 promoter elements. TFIID and the spliceosome belong to eukaryotic transcription."));
  }
  return qs;
}

export function transcriptionPredictNext(model: TranscriptionModel, step: number): Question | null {
  const cur = model.steps[Math.min(step, model.steps.length - 1)];
  const next = model.steps[step + 1];
  if (!next) return null;
  if (next.phase === "elongation") {
    const i = next.state.transcribed - 1;
    const tcol = model.template[i];
    const nb = rnaFromTemplateColumns(tcol);
    return makeQuestion(`tx-pn-${step}`, `Predict the next nucleotide: the template base is ${tcol}. Which RNA base is added?`, nb, ["A", "C", "G", "U"].filter((b) => b !== nb), `${tcol} pairs with ${nb}. The new base joins the 3′ end of the RNA (${cur.state.transcribed} nt so far).`);
  }
  const labels: Record<string, string> = { initiation: "Promoter recognition and opening", elongation: "Nucleotide addition", termination: "Termination and release", cap: "Addition of the 5′ cap", splicing: "A splicing event", polyA: "3′ cleavage or poly(A) tail addition", mature: "The mRNA is ready for use" };
  const all = ["initiation", "elongation", "termination", "cap", "splicing", "polyA", "mature"].filter((p) => (model.input.organism === "eukaryote" ? true : !["cap", "splicing", "polyA"].includes(p)));
  return makeQuestion(`tx-pn-${step}`, "Predict the next stage of the process.", labels[next.phase], all.filter((p) => p !== next.phase).map((p) => labels[p]), `Next: ${next.title}. ${next.caption}`);
}

// ---- translation --------------------------------------------------------------------------------------------------------------

const AA_LETTERS = Object.keys(AMINO_ACIDS);

export function translationQuestions(model: TranslationModel, step: number): Question[] {
  const qs: Question[] = [];
  const s = model.steps[Math.min(step, model.steps.length - 1)];
  const euk = model.input.organism === "eukaryote";
  const a = s.sites.A;
  if (a && a.aaName) {
    const names = AA_LETTERS.map((l) => AMINO_ACIDS[l].name);
    qs.push(makeQuestion(`tr-aa-${s.index}`, `The codon in the A site is ${a.codon}. Which amino acid does it specify?`, a.aaName, names.filter((n) => n !== a.aaName), `The genetic code assigns ${a.codon} to ${a.aaName}.`));
    qs.push(makeQuestion(`tr-anti-${s.index}`, `Which anticodon (written 5′→3′) pairs with ${a.codon}?`, a.anticodon5to3, [a.anticodonUnder, a.codon, [...a.codon].reverse().join("")], `The anticodon pairs antiparallel with the codon: the codon 5′-${a.codon}-3′ pairs with 5′-${a.anticodon5to3}-3′ (read 3′-${a.anticodonUnder}-5′ under the codon). The model uses one tRNA per codon; real cells use wobble at the third position.`));
  }
  qs.push(makeQuestion("tr-sites", "Which ribosomal site holds the tRNA attached to the growing polypeptide, before the peptide bond forms?", "The P site", ["The A site", "The E site", "The small subunit only"], "The aminoacyl-tRNA enters the A site; the P site holds the peptidyl-tRNA. The E site holds the empty tRNA on its way out."));
  qs.push(makeQuestion("tr-bond", "What forms the peptide bond between amino acids?", "The rRNA of the large subunit (peptidyl transferase, a ribozyme)", ["A protein enzyme bound to the tRNA", "The release factor", "The mRNA"], "The peptidyl transferase centre is made of rRNA. The chain moves from the P-site tRNA onto the amino acid in the A site."));
  qs.push(makeQuestion("tr-move", "What happens at translocation?", "The ribosome moves three nucleotides along the mRNA (A→P→E)", ["A new amino acid is added", "The peptide is released", "The mRNA is copied"], `${euk ? "eEF2" : "EF-G"} uses GTP to move the mRNA and tRNAs by one codon so the next codon enters the A site.`));
  qs.push(makeQuestion("tr-stop", "What happens when a stop codon reaches the A site?", "A release factor binds and the polypeptide is released", ["A tRNA with a stop anticodon binds", "The ribosome skips the codon", "The ribosome adds a blank residue"], euk ? "There is no tRNA for a stop codon. eRF1 reads all three stop codons and triggers hydrolysis of the peptidyl-tRNA bond." : "There is no tRNA for a stop codon. RF1 (UAA, UAG) or RF2 (UAA, UGA) binds and triggers hydrolysis of the peptidyl-tRNA bond."));
  qs.push(makeQuestion("tr-start", euk ? "How does a eukaryotic ribosome choose its start codon?" : "How does a bacterial ribosome find its start codon?", euk ? "It binds the 5′ cap and scans to the first AUG" : "Its 16S rRNA pairs with a Shine–Dalgarno sequence just upstream of the start codon", euk ? ["Its 16S rRNA pairs with a Shine–Dalgarno sequence", "It starts at the first base of the mRNA", "It starts at any codon"] : ["It binds the 5′ cap and scans to the first AUG", "It starts at the first base of the mRNA", "It starts at any codon"], euk ? "Eukaryotic initiation uses the 5′ cap and scanning (best at an AUG in a Kozak context)." : "Bacterial mRNAs can have several start sites, each preceded by its own Shine–Dalgarno sequence."));
  return qs;
}

export function translationPredictNext(model: TranslationModel, step: number): Question | null {
  const next = model.steps[step + 1];
  if (!next) return null;
  if (next.phase === "binding" && next.sites.A?.aaName) {
    const a = next.sites.A;
    const names = AA_LETTERS.map((l) => AMINO_ACIDS[l].name);
    return makeQuestion(`tr-pn-${step}`, `The next codon in the A site is ${a.codon}. Which amino acid will be delivered?`, a.aaName as string, names.filter((n) => n !== a.aaName), `${a.codon} codes for ${a.aaName}; the tRNA with anticodon 5′-${a.anticodon5to3}-3′ carries it.`);
  }
  const text: Record<string, string> = { binding: "An aminoacyl-tRNA enters the A site", "peptidyl transfer": "A peptide bond forms", translocation: "The ribosome translocates three nucleotides", termination: "A release factor acts at a stop codon", initiation: "Initiation", stalled: "The ribosome stalls", finished: "Translation ends" };
  const all = ["binding", "peptidyl transfer", "translocation", "termination"];
  if (!text[next.phase]) return null;
  return makeQuestion(`tr-pn-${step}`, "Predict the next event in translation.", text[next.phase], all.filter((p) => p !== next.phase).map((p) => text[p]), `Next: ${next.title}. ${next.caption}`);
}

// ---- central dogma / mutations --------------------------------------------------------------------------------------------------

const CLASS_TEXT: Record<MutationClass, string> = {
  none: "No change", silent: "Silent (same peptide)", missense: "Missense (one amino acid changes)", nonsense: "Nonsense (premature stop)", "stop-loss": "Stop-loss (peptide extended)", "start-loss": "Start-loss (no translation from this start)",
  frameshift: "Frameshift (downstream codons all change)", "in-frame insertion": "In-frame insertion (extra amino acids)", "in-frame deletion": "In-frame deletion (amino acids lost)", "no peptide": "No peptide to compare",
};
export const mutationClassLabel = (c: MutationClass) => CLASS_TEXT[c];

/** Mutation question: classify the mutation currently set on the gene. */
export function mutationQuestion(codingDna: string, start: number, m: Mutation): Question | null {
  const wild = codingDna.replace(/T/g, "U");
  const mutated = applyMutation(wild, m, "ACGU");
  if (mutated === null) return null;
  const c = classify(wild, mutated, start, m);
  const pool: MutationClass[] = ["silent", "missense", "nonsense", "frameshift", "in-frame deletion", "start-loss"];
  return makeQuestion(`mut-${JSON.stringify(m)}`, `Predict the effect: ${describeMutation(m)}.`, CLASS_TEXT[c.class], pool.filter((p) => p !== c.class).map((p) => CLASS_TEXT[p]), `${c.summary} Wild type: ${c.wild.protein || "(none)"}; mutant: ${c.mutant.protein || "(none)"}.`);
}

/** Candidate mutations found by scanning the gene, one per class where it exists (used for Challenge). */
export function exampleMutations(codingDna: string, start: number): Array<{ mutation: Mutation; class: MutationClass }> {
  const wild = codingDna.replace(/T/g, "U");
  const found = new Map<MutationClass, Mutation>();
  const tryM = (m: Mutation) => {
    const mut = applyMutation(wild, m, "ACGU");
    if (mut === null) return;
    const c = classify(wild, mut, start, m).class;
    if (!found.has(c) && c !== "none" && c !== "no peptide") found.set(c, m);
  };
  for (let p = start; p < wild.length; p += 1) for (const b of "ACGU") if (b !== wild[p]) tryM({ kind: "substitution", pos: p, base: b });
  for (let p = start + 3; p + 1 <= wild.length; p += 1) { tryM({ kind: "deletion", pos: p, length: 1 }); tryM({ kind: "insertion", pos: p, bases: "G" }); tryM({ kind: "insertion", pos: p, bases: "GGG" }); if (p + 3 <= wild.length) tryM({ kind: "deletion", pos: p, length: 3 }); }
  return [...found.entries()].map(([cls, mutation]) => ({ mutation, class: cls }));
}


/** Practice questions about the gene on screen (the central dogma). */
export function dogmaQuestions(a: DogmaAnalysis): Question[] {
  const qs: Question[] = [];
  if (a.start !== null && a.wild) {
    const st: number = a.start;
    const trip = a.templateUnder.slice(a.start, a.start + 3);
    const codon = a.mrna.slice(a.start, a.start + 3);
    qs.push(makeQuestion(`dg-codon-${a.start}`, `Under the start codon the template strand reads 3′-${trip}-5′. Which mRNA codon does RNA polymerase make?`, codon, [[...codon].reverse().join(""), a.coding.slice(a.start, a.start + 3), trip.replace(/T/g, "U")], `Each template base pairs with an RNA base (A→U, T→A, G→C, C→G), so 3′-${trip}-5′ gives 5′-${codon}-3′, which is the coding strand's ${a.coding.slice(a.start, a.start + 3)} written with U.`));
    const n = a.wild.protein.length;
    qs.push(makeQuestion(`dg-len-${n}`, "How many amino acids does the peptide contain (the stop codon codes for none)?", String(n), [String(n + 1), String(Math.max(0, n - 1)), String(n + 3)], `Translation starts at AUG (position ${a.start + 1}) and ends at ${a.wild.status === "terminated" ? "the stop codon" : "the end of the mRNA"}: ${n} amino acid${n === 1 ? "" : "s"}.`));
    qs.push(makeQuestion(`dg-frame-${a.start}`, "In which reading frame (counting from the first base of the mRNA) does the start codon lie?", `Frame ${a.start % 3 + 1}`, [1, 2, 3].filter((f) => f !== st % 3 + 1).map((f) => `Frame ${f}`), `The start codon begins at base ${a.start + 1}. Frame 1 starts at base 1, frame 2 at base 2, frame 3 at base 3; ${a.start + 1} is in frame ${a.start % 3 + 1}.`));
  }
  qs.push(makeQuestion("dg-template", "Which strand does RNA polymerase copy to make this mRNA?", "The template strand (the mRNA matches the coding strand)", ["The coding strand", "Both strands", "The protein"], "RNA is made complementary to the template, so it has the coding strand's sequence with U for T."));
  qs.push(makeQuestion("dg-dir", "The mRNA is read by the ribosome in which direction?", "5′ → 3′", ["3′ → 5′", "Either direction", "From the stop codon backward"], "Both RNA synthesis and the reading of the mRNA run 5′→3′."));
  if (a.consequence && a.consequence.class !== "none" && a.consequence.class !== "no peptide") {
    qs.push(makeQuestion(`dg-mut-${a.consequence.class}-${a.consequence.firstDifference}`, "What kind of mutation is the one currently set on this gene?", CLASS_TEXT[a.consequence.class], (Object.keys(CLASS_TEXT) as MutationClass[]).filter((c) => c !== a.consequence?.class && c !== "none" && c !== "no peptide").map((c) => CLASS_TEXT[c]), a.consequence.summary));
  }
  return qs;
}
