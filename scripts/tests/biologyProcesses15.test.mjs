// Stage 15: replication fork, transcription + RNA processing, and the ribosome timeline.
// Expected strands are computed here independently (plain string reversal and pairing tables), not by calling the engine's helpers.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let R, X, TR;
before(async () => {
  R = await loadModule("/src/utils/biology/replication.ts");
  X = await loadModule("/src/utils/biology/transcription.ts");
  TR = await loadModule("/src/utils/biology/translation.ts");
});
after(async () => { await closeEngine(); });

const pair = { A: "T", T: "A", C: "G", G: "C" };
const comp = (s) => [...s].map((b) => pair[b]).join("");
const rev = (s) => [...s].reverse().join("");
const revcomp = (s) => rev(comp(s));

describe("replication: strand roles and orientation", () => {
  test("fork moving right: the bottom parental strand (3'->5' left to right) is the leading template", () => {
    const r = R.forkRoles("right");
    assert.equal(r.leadingTemplate, "bottom"); assert.equal(r.laggingTemplate, "top");
    const l = R.forkRoles("left");
    assert.equal(l.leadingTemplate, "top"); assert.equal(l.laggingTemplate, "bottom");
  });
  test("a daughter strand has its 5' end on the side where its template has its 3' end (antiparallel)", () => {
    assert.equal(R.daughterFivePrimeSide("top"), "right"); // top template 5'->3' L->R, so daughter 3'->5' L->R
    assert.equal(R.daughterFivePrimeSide("bottom"), "left");
  });
  for (const direction of ["right", "left"]) {
    test(`semi-conservative: final daughters equal the reverse complements of their templates (fork ${direction}), 5'->3'`, () => {
      const input = { ...R.DEFAULT_REPLICATION_INPUT, direction };
      const m = R.buildReplication(input);
      const top = input.template;
      // Each daughter, read 5'->3', is the reverse complement of its parental template read 5'->3'.
      // top template 5'->3' = top; bottom template 5'->3' = reverse of its left-to-right text = revcomp(top).
      const topTemplate53 = top;
      const bottomTemplate53 = revcomp(top);
      const leadTemplate53 = m.leadingTemplate === "top" ? topTemplate53 : bottomTemplate53;
      const lagTemplate53 = m.laggingTemplate === "top" ? topTemplate53 : bottomTemplate53;
      assert.equal(m.finalLeading, revcomp(leadTemplate53));
      assert.equal(m.finalLagging, revcomp(lagTemplate53));
      // and the two daughters, being copies of the two parental strands, are the parental top and bottom strands' sequences
      assert.deepEqual([m.finalLeading, m.finalLagging].sort(), [topTemplate53, bottomTemplate53].sort());
    });
  }
});

describe("replication: the timeline", () => {
  const run = (o = {}) => R.buildReplication({ ...R.DEFAULT_REPLICATION_INPUT, ...o });
  test("32 bp, Okazaki 8, primer 3 gives 4 lagging fragments and 3 junctions", () => {
    const m = run();
    assert.equal(m.fragments.length, 4); assert.deepEqual(m.fragments.map((f) => [f.a, f.b]), [[0, 7], [8, 15], [16, 23], [24, 31]]);
    assert.equal(m.steps.at(-1).junctions.length, 3);
  });
  test("a remainder joins the last fragment: 35 bp with Okazaki 8 gives 4 fragments, the last 11 nt", () => {
    const m = run({ template: "ATGCGTACCGGATTCAGCTAGCATCGGATACCGTA".slice(0, 35) });
    assert.deepEqual(m.fragments.map((f) => f.b - f.a + 1), [8, 8, 8, 11]);
  });
  test("the helicase opens one base pair per step and never more than the duplex length", () => {
    const m = run();
    for (let i = 1; i < m.steps.length; i += 1) assert.ok(m.steps[i].unwound - m.steps[i - 1].unwound <= 1);
    assert.equal(m.steps.at(-1).unwound, 32);
  });
  test("no new strand is ever made where the template is still double-stranded", () => {
    const m = run();
    for (const s of m.steps) {
      for (let u = s.unwound; u < 32; u += 1) { assert.equal(s.lead[u], 0, `lead u=${u} step ${s.step}`); assert.equal(s.lag[u], 0, `lag u=${u} step ${s.step}`); }
    }
  });
  test("the leading strand is continuous: its filled cells are always a prefix 0..n-1", () => {
    const m = run();
    for (const s of m.steps) { const n = s.lead.filter((c) => c).length; assert.ok(s.lead.slice(0, n).every((c) => c), `step ${s.step}`); }
  });
  test("the leading strand starts with an RNA primer of the chosen length, then DNA", () => {
    const m = run({ primerLength: 4 });
    const end = m.steps.at(-1);
    assert.deepEqual(end.lead.slice(0, 4), [1, 1, 1, 1]); assert.ok(end.lead.slice(4).every((c) => c === 2));
  });
  test("the lagging strand is discontinuous: after the second fragment is primed there are separate pieces", () => {
    const m = run();
    const gapped = m.steps.some((s) => { const f = s.lag.map((c) => (c ? 1 : 0)).join("").replace(/^0+|0+$/g, ""); return f.includes("0"); });
    assert.ok(gapped, "lagging cells were never separated by single-stranded gaps");
  });
  test("each Okazaki fragment is extended 5'->3' away from the fork: lower u (farther from the fork) is filled later than its primer", () => {
    const m = run(); let lastNext = new Map();
    for (const s of m.steps) for (const f of s.fragments) { if (lastNext.has(f.index)) assert.ok(f.next <= lastNext.get(f.index)); lastNext.set(f.index, f.next); }
  });
  test("primers are laid only after a fragment's whole template is single-stranded", () => {
    const m = run();
    for (const s of m.steps) for (const f of s.fragments) if (f.primed) assert.ok(s.unwound >= f.b + 1, `fragment ${f.index} primed at ${s.unwound}`);
  });
  test("the end state: all internal primers are replaced by DNA and sealed; only the two edge primers remain RNA", () => {
    const m = run(); const e = m.steps.at(-1);
    assert.ok(e.junctions.every((j) => j.stage === "sealed"));
    assert.equal(e.lead.filter((c) => c === 1).length, 3); assert.equal(e.lag.filter((c) => c === 1).length, 3);
    assert.equal(e.lead.filter((c) => c === 2).length, 29); assert.equal(e.lag.filter((c) => c === 2).length, 29);
    assert.ok(e.fragments.every((f) => f.done));
  });
  test("primer count: 0 at the start, rises as primers are laid, and ends at the two edge primers", () => {
    const m = run(); const counts = m.steps.map((s) => R.primerCount(s, 3));
    assert.equal(counts[0], 0); assert.equal(counts.at(-1), 2);
    assert.ok(Math.max(...counts) >= 3 && Math.max(...counts) <= 1 + m.fragments.length, "never more primers than the leading primer plus one per fragment");
    assert.ok(counts.slice(1).every((c, i) => c >= 0 && i >= 0));
  });
  test("ligase is the last action and only appears after primer removal and gap filling of that junction", () => {
    const m = run(); const stages = m.steps.flatMap((s) => s.actions.map((a) => a.kind)).filter((k) => ["removePrimer", "fillGap", "ligate"].includes(k));
    assert.deepEqual(stages.slice(0, 5), ["removePrimer", "fillGap", "fillGap", "fillGap", "ligate"]);
    assert.equal(stages.at(-1), "ligate");
  });
  test("every non-initial step does something and enzyme names follow the organism", () => {
    const b = run(); const e = run({ organism: "eukaryote" });
    assert.ok(b.steps.slice(1).every((s) => s.actions.length > 0));
    assert.ok(b.steps.some((s) => /DnaB helicase/.test(s.caption)) && b.steps.some((s) => /DNA polymerase I/.test(s.caption)));
    assert.ok(e.steps.some((s) => /CMG helicase/.test(s.caption)) && e.steps.some((s) => /Pol α–primase/.test(s.caption)) && e.steps.some((s) => /DNA ligase I/.test(s.caption)));
    assert.ok(!e.steps.some((s) => /DnaB|DnaG/.test(s.caption)), "bacterial enzymes must not appear in the eukaryote timeline");
    assert.ok(!b.steps.some((s) => /CMG|Pol α|PCNA/.test(s.caption)));
  });
  test("a single-fragment duplex (shorter than one Okazaki length) still completes", () => {
    const m = run({ template: "ATGCGTAC", okazakiLength: 12, primerLength: 3 });
    assert.equal(m.fragments.length, 1); assert.equal(m.steps.at(-1).fragments[0].done, true);
  });
  test("validation rejects bad templates and parameters; nothing is coerced", () => {
    const v = (o) => R.validateReplicationInput({ ...R.DEFAULT_REPLICATION_INPUT, ...o });
    assert.equal(v({}).ok, true);
    assert.equal(v({ template: "ATGU" + "A".repeat(10) }).ok, false);
    assert.equal(v({ template: "ATG" }).ok, false);
    assert.equal(v({ template: "A".repeat(41) }).ok, false);
    assert.equal(v({ primerLength: 1 }).ok, false);
    assert.equal(v({ okazakiLength: 4 }).ok, false);
    assert.equal(v({ primerLength: 6, okazakiLength: 7 }).ok, false);
    assert.equal(v({ direction: "up" }).ok, false);
    assert.equal(v({ organism: "virus" }).ok, false);
    assert.equal(R.validateReplicationInput(null).ok, false);
  });
});

describe("transcription", () => {
  const euk = () => X.buildTranscription(X.DEFAULT_TRANSCRIPTION_INPUT);
  test("the template strand, written under the coding strand, is its complement; RNA is the RNA-complement of the template column by column", () => {
    const m = euk(); const coding = X.DEFAULT_TRANSCRIPTION_INPUT.coding;
    assert.equal(m.template, comp(coding));
    assert.equal(X.rnaFromTemplateColumns(m.template), m.rna);
    assert.equal(m.rna, coding.replace(/T/g, "U"));
    // read 5'->3' the template is the reverse complement of the coding strand
    assert.equal(rev(m.template), revcomp(coding));
  });
  test("elongation adds one nucleotide per step, 5'->3', and each RNA prefix equals the coding strand's prefix with U", () => {
    const m = euk(); const el = m.steps.filter((s) => s.phase === "elongation");
    assert.equal(el.length, X.DEFAULT_TRANSCRIPTION_INPUT.coding.length);
    el.forEach((s, i) => { assert.equal(s.state.transcribed, i + 1); assert.equal(s.state.rna, m.rna.slice(0, i + 1)); });
  });
  test("the transcription bubble keeps an RNA-DNA hybrid of at most 9 and an unwound region around the active site", () => {
    const m = euk(); const s = m.steps.filter((x) => x.phase === "elongation")[29];
    assert.equal(s.state.bubble.to - s.state.bubble.from, 12); assert.equal(s.state.bubble.to, 33);
  });
  test("intron rules: GU...AG required, exons on both sides, branch-point A, no overlap", () => {
    const gene = X.DEFAULT_TRANSCRIPTION_INPUT.coding;
    assert.deepEqual(X.validateIntrons(gene, [{ start: 14, end: 31 }]), []);
    assert.match(X.validateIntrons(gene, [{ start: 15, end: 31 }])[0], /starts with .*GU/);
    assert.match(X.validateIntrons(gene, [{ start: 14, end: 30 }])[0], /3′ splice site is AG/);
    assert.ok(X.validateIntrons(gene, [{ start: 0, end: 17 }]).some((e) => /exon before/.test(e)));
    assert.ok(X.validateIntrons(gene, [{ start: 14, end: 15 }]).some((e) => /at least/.test(e)));
    assert.ok(X.validateIntrons("AAAAAAAAAAAAAAAGTAGAAAAAAAA", [{ start: 15, end: 19 }]).length > 0);
  });
  test("splicing joins the exons: pre-mRNA GGAUGGCUAAACUG|intron|GGUUAC... gives ...CUGGGUUAC... and the lariat holds the intron", () => {
    const m = euk(); const sp = X.splice(m.rna, X.DEFAULT_TRANSCRIPTION_INPUT.introns);
    assert.equal(sp.exons.length, 2); assert.equal(sp.lariats[0], "GUAAGUCUAACUUUCAG");
    assert.equal(sp.mature, "GGAUGGCUAAACUG" + "GGUUACUGAUUAAUAAAGCUAGCUAGGACCUUAC");
    assert.equal(sp.mature.length, m.rna.length - 17);
  });
  test("branch point: the last A before the terminal AG (hand-found at intron offset 9)", () => { assert.equal(X.branchPoint({ start: 14, end: 31 }, euk().rna), 14 + 9); });
  test("poly(A): signal AAUAAA is found in the spliced RNA and cleavage is 15 nt downstream", () => {
    const m = euk(); const p = X.findPolyA(X.splice(m.rna, X.DEFAULT_TRANSCRIPTION_INPUT.introns).mature);
    assert.equal(p.signalIndex, 14 + 9 + 2); // exon 1 (14) + "GGUUACUGA" (9) + "UU" (2) = 25
    assert.equal(X.findPolyA("GGGGGGGG"), null);
    assert.equal(X.findPolyA("CCAAUAAACC").short, true);
  });
  test("the mature mRNA of the default gene is cleaved after the signal and translates to M A K L G Y", () => {
    const m = euk();
    assert.equal(m.polyA.cleavageIndex - m.polyA.signalIndex, 6 + 15);
    assert.equal(m.translation.protein, "MAKLGY"); assert.equal(m.translation.status, "terminated");
  });
  test("eukaryotic timeline order: initiation, elongation, termination, cap, splicing (3 steps/intron), cleavage, tail, mature", () => {
    const m = euk(); const phases = m.steps.map((s) => s.phase);
    const first = (p) => phases.indexOf(p);
    assert.ok(first("initiation") < first("elongation") && first("elongation") < first("termination") && first("termination") < first("cap") && first("cap") < first("splicing") && first("splicing") < first("polyA") && first("polyA") < first("mature"));
    assert.equal(phases.filter((p) => p === "splicing").length, 3);
    const last = m.steps.at(-1).state;
    assert.equal(last.capped, true); assert.equal(last.tailed, true); assert.deepEqual(last.introns, ["removed"]); assert.equal(last.rna, m.mature);
  });
  test("the cap is added during elongation (about 20 nt) not at the end", () => {
    const m = euk(); const s19 = m.steps.find((s) => s.phase === "elongation" && s.state.transcribed === 19);
    const s20 = m.steps.find((s) => s.phase === "elongation" && s.state.transcribed === 20);
    assert.equal(s19.state.capped, false); assert.equal(s20.state.capped, true);
  });
  test("bacteria: no cap, no splicing, no poly(A); the transcript is the mRNA and may be translated at once", () => {
    const gene = "ATGGCTAAACTGGGTTACTGA" + "CC";
    const m = X.buildTranscription({ coding: gene, organism: "bacteria", introns: [], step: 0 });
    const phases = new Set(m.steps.map((s) => s.phase));
    for (const p of ["cap", "splicing", "polyA"]) assert.ok(!phases.has(p), p);
    assert.equal(m.mature, gene.replace(/T/g, "U")); assert.equal(m.polyA, null);
    assert.equal(m.translation.protein, "MAKLGY");
    assert.ok(!m.steps.some((s) => /spliceosome|m7G|TATA/i.test(s.caption)));
    assert.ok(m.steps.some((s) => /σ factor/.test(s.caption)));
    assert.equal(m.steps.at(-1).state.capped, false);
  });
  test("validation: bacterial introns, bad bases, bad lengths", () => {
    const v = (o) => X.validateTranscriptionInput({ ...X.DEFAULT_TRANSCRIPTION_INPUT, ...o });
    assert.equal(v({}).ok, true);
    assert.equal(v({ organism: "bacteria" }).ok, false);
    assert.equal(v({ coding: "AUGAUGAUGAUGAUG" }).ok, false);
    assert.equal(v({ coding: "ATG" }).ok, false);
    assert.equal(v({ introns: [{ start: 1, end: 2 }, {}, {}, {}] }).ok, false);
    assert.equal(v({ step: -1 }).ok, false);
  });
});

describe("translation (ribosome timeline)", () => {
  const model = (mrna, o = {}) => TR.buildTranslation({ mrna, organism: "bacteria", start: null, step: 0, ...o });
  test("AUGGCUAAAUGA: initiation (2) + 2 elongation cycles (3 each) + termination (2) = 10 steps", () => {
    const m = model("AUGGCUAAAUGA");
    assert.equal(m.steps.length, 10);
    assert.deepEqual(m.steps.map((s) => s.phase), ["initiation", "initiation", "binding", "peptidyl transfer", "translocation", "binding", "peptidyl transfer", "translocation", "termination", "termination"]);
    assert.equal(m.steps.at(-1).peptide, "MAK"); assert.equal(m.steps.at(-1).released, true);
  });
  test("tRNAs: the A-site tRNA's anticodon is the reverse complement of its codon and carries the right amino acid", () => {
    const m = model("AUGGCUAAAUGA"); const s = m.steps[2];
    assert.equal(s.sites.A.codon, "GCU"); assert.equal(s.sites.A.anticodon5to3, "AGC"); assert.equal(s.sites.A.anticodonUnder, "CGA"); assert.equal(s.sites.A.aa, "A");
    assert.equal(s.sites.P.codon, "AUG"); assert.equal(s.sites.P.initiator, true); assert.equal(s.sites.P.anticodon5to3, "CAU");
  });
  test("peptide grows by exactly one residue at each peptide-bond step and only then", () => {
    const m = model("AUGGCUAAAUGA"); let prev = 0;
    for (const s of m.steps) { if (s.phase === "peptidyl transfer") assert.equal(s.peptide.length, prev + 1); else assert.ok(s.peptide.length >= prev); prev = s.peptide.length; }
  });
  test("translocation shifts the tRNAs A->P->E: after it the old P tRNA is in E and the old A tRNA is in P; the A site is empty", () => {
    const m = model("AUGGCUAAAUGA"); const bond = m.steps[3], tl = m.steps[4];
    assert.equal(tl.sites.E.codon, bond.sites.P.codon); assert.equal(tl.sites.P.codon, bond.sites.A.codon); assert.equal(tl.sites.A, null);
    assert.equal(tl.aSiteStart, bond.aSiteStart + 3);
  });
  test("at a stop codon no tRNA is in the A site and a release factor is named: UAG -> RF1 in bacteria, eRF1 in eukaryotes", () => {
    const b = model("AUGUAG"); const e = model("AUGUAG", { organism: "eukaryote" });
    assert.equal(b.steps.at(-2).sites.A, null); assert.deepEqual(b.steps.at(-2).factors, ["RF1"]);
    assert.deepEqual(e.steps.at(-2).factors, ["eRF1"]);
    assert.equal(b.steps.at(-1).peptide, "M");
    assert.deepEqual(model("AUGUGA").steps.at(-2).factors, ["RF2"]);
  });
  test("initiator differs: fMet in bacteria, Met in eukaryotes, and no bacterial factors in the eukaryote text", () => {
    const b = model("AUGGCUUAA"), e = model("AUGGCUUAA", { organism: "eukaryote" });
    assert.match(b.steps[1].caption, /fMet/); assert.match(e.steps[1].caption, /Met-tRNA/); assert.doesNotMatch(e.steps.map((s) => s.caption).join(" "), /EF-Tu|EF-G|(?<!e)RF1|RF2|Shine/);
    assert.match(e.steps[0].caption, /scans/); assert.match(b.steps[0].caption, /Shine–Dalgarno/);
  });
  test("no stop codon: the ribosome stalls and the chain stays attached (not released)", () => {
    const m = model("AUGGCUAAA"); const s = m.steps.at(-1);
    assert.equal(s.phase, "stalled"); assert.equal(s.released, false); assert.equal(m.translation.status, "no-stop");
    const part = model("AUGGCUAAAGG").steps.at(-1); assert.match(part.caption, /2 bases/);
  });
  test("no AUG: a single explanatory step and no translation", () => { const m = model("GGCCUUAAGGCC"); assert.equal(m.steps.length, 1); assert.equal(m.translation, null); });
  test("the start can be chosen only where there is an AUG, and only for bacteria", () => {
    const v = (o) => TR.validateTranslationInput({ mrna: "GGAUGGCUAUGAAAUAA", organism: "bacteria", start: null, step: 0, ...o });
    assert.equal(v({ start: 2 }).ok, true); assert.equal(v({ start: 8 }).ok, true); assert.equal(v({ start: 3 }).ok, false);
    assert.equal(v({ organism: "eukaryote", start: 8 }).ok, false); assert.equal(v({ organism: "eukaryote", start: 2 }).ok, true);
    assert.equal(v({ mrna: "ATGC" }).ok, false);
  });
  test("a chosen second AUG gives the alternative frame's peptide (bacteria)", () => {
    const m = model("GGAUGGCUAUGAAAUAA", { start: 8 });
    assert.equal(m.translation.protein, "MK"); assert.equal(m.steps.at(-1).peptide, "MK");
  });
  test("the timeline's final peptide equals the hand-read peptide", () => {
    const cases = { AUGGCUAAAUGA: "MAK", AUGUUUUUUUUUUAA: "MFFF", GGAUGGGAGAGUAUCCAUGA: "MGEYP", AUGCCCGGGUAG: "MPG" };
    for (const [mrna, peptide] of Object.entries(cases)) assert.equal(model(mrna).steps.at(-1).peptide, peptide, mrna);
  });
});

describe("bundled examples", () => {
  let E, D;
  before(async () => { E = await loadModule("/src/utils/biology/examples.ts"); D = await loadModule("/src/utils/biology/dogma.ts"); });
  test("every replication example is valid", () => { for (const e of E.REPLICATION_EXAMPLES) assert.equal(R.validateReplicationInput({ ...R.DEFAULT_REPLICATION_INPUT, template: e.template }).ok, true, e.label); });
  test("every transcription example is valid and the gene examples encode M A K L G Y", () => {
    for (const e of E.TRANSCRIPTION_EXAMPLES) {
      const v = X.validateTranscriptionInput({ coding: e.coding, organism: e.organism, introns: e.introns, step: 0 });
      assert.equal(v.ok, true, `${e.label}: ${v.errors?.join(" ")}`);
      assert.equal(X.buildTranscription(v.value).translation.protein, "MAKLGY", e.label);
    }
  });
  test("every translation example is valid", () => { for (const e of E.TRANSLATION_EXAMPLES) assert.equal(TR.validateTranslationInput({ mrna: e.mrna, organism: "bacteria", start: null, step: 0 }).ok, true, e.label); });
  test("the translation examples behave as labelled", () => {
    const by = (label) => TR.buildTranslation({ mrna: E.TRANSLATION_EXAMPLES.find((e) => e.label === label).mrna, organism: "bacteria", start: null, step: 0 }).translation;
    assert.equal(by("M A K L G Y").protein, "MAKLGY"); assert.equal(by("Stop right after start").protein, "M"); assert.equal(by("Two AUGs").protein, "MAMK"); assert.equal(by("No stop codon").status, "no-stop");
  });
  test("every dogma example is valid and its peptide matches its label", () => {
    const expect = { "Gene 1 (M A K L G Y E P S)": "MAKLGYEPS", "Gene 2 (M F F S K)": "MFFSK", "Gene 3 (longer)": "MGEYPVLHWKT" };
    for (const e of E.DOGMA_EXAMPLES) { const v = D.validateDogmaInput({ coding: e.coding, mutation: null }); assert.equal(v.ok, true, e.label); assert.equal(D.analyzeDogma(v.value).wild.protein, expect[e.label], e.label); }
  });
});

describe("central dogma analysis", () => {
  let D;
  before(async () => { D = await loadModule("/src/utils/biology/dogma.ts"); });
  test("coding strand, template (both ways), mRNA and peptide agree: 5'-TTATGGCTAAA...", () => {
    const a = D.analyzeDogma(D.DEFAULT_DOGMA_INPUT);
    assert.equal(a.mrna, D.DEFAULT_DOGMA_INPUT.coding.replace(/T/g, "U"));
    assert.equal(a.templateUnder, comp(a.coding)); assert.equal(a.template53, revcomp(a.coding)); assert.equal(rev(a.templateUnder), a.template53);
    assert.equal(a.start, 2); assert.equal(a.wild.protein, "MAKLGYEPS");
  });
  test("a mutation is applied to the coding strand and consequences are recomputed: C->A at codon 2 gives Asp", () => {
    const a = D.analyzeDogma({ coding: D.DEFAULT_DOGMA_INPUT.coding, mutation: { kind: "substitution", pos: 6, base: "A" } }); // GCT -> GAT
    assert.equal(a.mutantCoding.slice(5, 8), "GAT"); assert.equal(a.mutant.protein, "MDKLGYEPS"); assert.equal(a.consequence.class, "missense");
  });
  test("mutations that do not fit are rejected by the validator", () => {
    assert.equal(D.validateDogmaInput({ coding: D.DEFAULT_DOGMA_INPUT.coding, mutation: { kind: "substitution", pos: 99, base: "A" } }).ok, false);
    assert.equal(D.validateDogmaInput({ coding: D.DEFAULT_DOGMA_INPUT.coding, mutation: { kind: "bogus" } }).ok, false);
    assert.equal(D.validateDogmaInput({ coding: "AUGAUGAUG", mutation: null }).ok, false);
  });
});
