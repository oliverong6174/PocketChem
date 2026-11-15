import { useEffect, useMemo, useState } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { NumberField } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { Options, QuizPanel, SeqField } from "./bioShared";
import { GeneticCodeTable } from "./TranslationPage";
import { AMINO_ACIDS, anticodon5to3, readCodon } from "../../utils/biology/geneticCode";
import { analyzeDogma, DOGMA_LIMITS, validateDogmaInput, type DogmaAnalysis } from "../../utils/biology/dogma";
import { exampleMutations, dogmaQuestions, mutationClassLabel, mutationQuestion } from "../../utils/biology/bioLearning";
import { DOGMA_EXAMPLES } from "../../utils/biology/examples";
import { complementDna } from "../../utils/biology/sequence";
import { describeMutation, MUTATION_LIMITS, type Mutation } from "../../utils/biology/mutations";
import { translateFrame, type Translation } from "../../utils/biology/translate";
import { DOGMA_ASSUMPTIONS, summarizeDogma } from "../../utils/biology/bioSummary";
import { takeHandoff } from "../../utils/biology/handoff16";
import {
  DEFAULT_DOGMA_INPUTS, describeDogmaAnalysis, DOGMA_ENGINE_VERSION, validateBiologyResults, validateDogmaInputs, type DogmaInputs,
} from "../../utils/persistence/biologyTools";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

/** One column per codon of the reading: the DNA triplets, the mRNA codon, the tRNA anticodon and the amino acid. */
function CodonLadder({ coding, tr, other, label }: { coding: string; tr: Translation; other?: Translation | null; label: string }) {
  return (
    <div className="gc-table-scroll" data-testid="codon-ladder" role="group" aria-label={label}>
      <table className="gc-table ph-table bio-ladder">
        <thead><tr><th scope="col">{label}</th>{tr.codons.map((c) => <th className={c.kind === "stop" ? "bio-stop" : ""} key={c.start} scope="col">{c.index + 1}</th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">Coding 5′→3′</th>{tr.codons.map((c) => <td className="bio-mono" key={c.start}>{coding.slice(c.start, c.start + 3)}</td>)}</tr>
          <tr><th scope="row">Template 3′→5′</th>{tr.codons.map((c) => <td className="bio-mono" key={c.start}>{complementDna(coding.slice(c.start, c.start + 3))}</td>)}</tr>
          <tr><th scope="row">mRNA codon</th>{tr.codons.map((c) => <td className="bio-mono" key={c.start}><strong>{c.codon}</strong></td>)}</tr>
          <tr><th scope="row">tRNA anticodon 5′→3′</th>{tr.codons.map((c) => <td className="bio-mono" key={c.start}>{c.kind === "stop" ? "—" : anticodon5to3(c.codon)}</td>)}</tr>
          <tr><th scope="row">Amino acid</th>{tr.codons.map((c, i) => {
            const m = readCodon(c.codon);
            const diff = other && (other.protein[i] !== tr.protein[i]);
            return <td className={`${c.kind === "stop" ? "bio-stop" : ""}${diff ? " bio-aa-diff" : ""}`} key={c.start}>{m?.kind === "stop" ? "Stop" : `${m?.info.three} (${m?.aa})`}</td>;
          })}</tr>
        </tbody>
      </table>
    </div>
  );
}

function FramesPanel({ a }: { a: DogmaAnalysis }) {
  return (
    <Panel subtitle="The same mRNA read three ways. Only the frame that starts at the first AUG gives this gene's peptide." title="Reading frames">
      <dl className="bio-seqline" data-testid="frames">
        {([0, 1, 2] as const).map((f) => {
          const r = translateFrame(a.mrna, f);
          return (<><dt key={`t${f}`}>Frame {f + 1}{a.start !== null && a.start % 3 === f ? " (start codon)" : ""}</dt><dd key={`d${f}`}>{r.protein || "(too short)"}{r.leftover ? ` +${r.leftover.length} nt left` : ""}</dd></>);
        })}
      </dl>
      <p className="ph-note">* marks a stop codon. Every AUG: {a.starts.length ? a.starts.map((s) => `position ${s.position + 1} (frame ${s.frame + 1})`).join(", ") : "none"}.</p>
    </Panel>
  );
}

export default function CentralDogmaPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<DogmaInputs>({
    page: "dogma",
    engineVersion: DOGMA_ENGINE_VERSION,
    defaults: DEFAULT_DOGMA_INPUTS,
    validateInputs: validateDogmaInputs,
    validateResults: validateBiologyResults,
    summarize: summarizeDogma,
    describe: describeDogmaAnalysis,
    fallbackName: "DNA → RNA → protein",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  // a gene sent from the Genetics tool (one-shot, validated before use)
  useEffect(() => {
    const h = takeHandoff("dogma");
    if (!h) return;
    const ok = validateDogmaInput({ coding: h.coding, mutation: h.mutation });
    if (ok.ok) update((c) => ({ ...c, input: ok.value }));
  }, [update]);
  const mode = raw.mode;
  const setCoding = (coding: string) => update((c) => ({ ...c, input: { coding, mutation: null } }));
  const setMutation = (mutation: Mutation | null) => update((c) => ({ ...c, input: { ...c.input, mutation } }));
  const check = useMemo(() => validateDogmaInput(raw.input), [raw.input]);
  const errors = check.ok ? null : check.errors;
  const a = useMemo(() => (check.ok ? analyzeDogma(check.value) : null), [check]);
  const mut = raw.input.mutation;
  const questions = useMemo(() => (a ? dogmaQuestions(a) : []), [a]);
  const examples = useMemo(() => (a && a.start !== null ? exampleMutations(a.coding, a.start) : []), [a]);
  // Challenge: predict the class of a candidate mutation, then apply it
  const [exIdx, setExIdx] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const ex = examples.length ? examples[exIdx % examples.length] : null;
  const exQuestion = useMemo(() => (a && a.start !== null && ex ? mutationQuestion(a.coding, a.start, ex.mutation) : null), [a, ex]);
  const kind = mut === null ? "none" : mut.kind;
  const errorFor = (re: RegExp) => errors?.find((e) => re.test(e)) ?? null;
  const setKind = (k: "none" | "substitution" | "insertion" | "deletion") => {
    if (k === "none") setMutation(null);
    else if (k === "substitution") setMutation({ kind: "substitution", pos: 8, base: a && a.coding[8] === "A" ? "G" : "A" });
    else if (k === "insertion") setMutation({ kind: "insertion", pos: 8, bases: "G" });
    else setMutation({ kind: "deletion", pos: 8, length: 1 });
  };

  return (
    <div className="gc-page ph-page bio-page">
      <ToolHeader
        group="Gene expression"
        title="DNA → RNA → protein"
        purpose="Follow one gene from its DNA strands to its mRNA codons, tRNA anticodons and peptide, then change a base and see exactly what changes downstream."
        evidence="model"
        steps={[
          { label: "Enter a gene", detail: "Coding strand, 5′→3′." },
          { label: "Read the chain", detail: "Template → mRNA → anticodons → amino acids." },
          { label: "Mutate and predict", detail: "Substitution, insertion or deletion." },
        ]}
        aside={<Badge tone="neutral" title="An intronless gene; introns and processing are in the Transcription tool.">Intronless gene</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { setChoice(null); update((c) => ({ ...c, mode: m, input: m === "challenge" ? { ...c.input, mutation: null } : c.input })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Enter a gene, then optionally mutate it." title="Gene and mutation">
          <div className="gc-presets" role="group" aria-label="Example genes">
            {DOGMA_EXAMPLES.map((e) => <button className="secondary-button gc-chip" key={e.label} onClick={() => setCoding(e.coding)} type="button">{e.label}</button>)}
          </div>
          <SeqField error={errorFor(/coding strand|bases \(found/)} hint={`Coding strand 5′→3′ from the start site, ${DOGMA_LIMITS.minLen}–${DOGMA_LIMITS.maxLen} bases of A, C, G, T. The mRNA is read from the first ATG.`} label="Coding strand (5′→3′)" onChange={setCoding} rows={3} value={raw.input.coding} />
          {mode !== "challenge" ? (
            <fieldset className="gc-field" data-testid="mutation-editor">
              <legend>Mutation</legend>
              <Segmented<"none" | "substitution" | "insertion" | "deletion"> label="Mutation type" onChange={setKind} options={[{ id: "none", label: "None" }, { id: "substitution", label: "Substitution" }, { id: "insertion", label: "Insertion" }, { id: "deletion", label: "Deletion" }]} value={kind} />
              {mut ? <NumberField hint={mut.kind === "insertion" ? "The new bases go before this position." : "Position on the coding strand, counted from 1."} label="Position" onChange={(v) => setMutation({ ...mut, pos: v - 1 } as Mutation)} value={mut.pos + 1} /> : null}
              {mut?.kind === "substitution" ? (
                <div className="gc-field"><label htmlFor="mut-base">New base</label>
                  <select id="mut-base" onChange={(e) => setMutation({ ...mut, base: e.target.value })} value={mut.base}>{["A", "C", "G", "T"].map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
              ) : null}
              {mut?.kind === "insertion" ? <SeqField hint={`1–${MUTATION_LIMITS.maxInsert} bases of A, C, G, T.`} label="Bases to insert" onChange={(bases) => setMutation({ ...mut, bases })} value={mut.bases} /> : null}
              {mut?.kind === "deletion" ? <NumberField hint={`1–${MUTATION_LIMITS.maxDelete} bases.`} label="Bases to delete" onChange={(length) => setMutation({ ...mut, length })} value={mut.length} /> : null}
            </fieldset>
          ) : <p className="gc-field-hint">In Challenge mode the mutation is chosen for you: predict its effect first, then apply it.</p>}
          {errors ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
        </Panel>

        <div className="gc-stage">
          {a ? (
            <>
              {a.wild && a.start !== null ? (
                <>
                  <KeyFigures
                    items={[
                      { label: "Start codon", value: `AUG at ${a.start + 1}`, note: `frame ${a.start % 3 + 1}` },
                      { label: "Peptide", value: `${a.wild.protein.length} aa`, note: a.wild.protein.length > 24 ? `${a.wild.protein.slice(0, 24)}…` : a.wild.protein },
                      { label: "Ends", value: a.wild.status === "terminated" ? `at ${a.wild.codons[a.wild.stopCodonIndex as number].codon}` : "no stop codon" },
                    ]}
                  />
                  <Panel subtitle="Read the columns downward: DNA → mRNA → tRNA → amino acid. The template is written 3′→5′ under the coding strand." title="Wild type: from DNA to protein">
                    <dl className="bio-seqline">
                      <dt>Coding 5′→3′</dt><dd data-testid="dogma-coding">{a.coding}</dd>
                      <dt>Template 3′→5′</dt><dd data-testid="dogma-template">{a.templateUnder}</dd>
                      <dt>mRNA 5′→3′</dt><dd data-testid="dogma-mrna">{a.mrna}</dd>
                    </dl>
                    <CodonLadder coding={a.coding} label="Codon" tr={a.wild} />
                    <p className="ph-note">Peptide: <strong data-testid="dogma-peptide">{a.wild.protein}</strong>.</p>
                  </Panel>
                </>
              ) : <Callout tone="warn" title="No start codon"><p>There is no ATG in this gene's coding strand (no AUG in the mRNA), so no peptide is made.</p></Callout>}

              {a.consequence && a.mutantCoding !== null && a.start !== null && mode !== "challenge" ? (
                <Panel subtitle={describeMutation(mut as Mutation)} title="After the mutation">
                  <Callout tone={a.consequence.class === "silent" || a.consequence.class === "none" ? "ok" : "warn"} title={mutationClassLabel(a.consequence.class)}>
                    <p data-testid="mutation-summary">{a.consequence.summary}</p>
                  </Callout>
                  <div className="bio-compare" data-testid="mutation-compare">
                    <div className="row"><span>DNA (wild)</span><span>{a.coding}</span></div>
                    <div className="row"><span>DNA (mutant)</span><span>{[...a.mutantCoding].map((b, i) => <span className={b !== a.coding[i] || a.mutantCoding!.length !== a.coding.length ? "bio-nt-diff" : ""} key={i}>{b}</span>)}</span></div>
                    <div className="row"><span>Peptide (wild)</span><span>{a.wild?.protein || "(none)"}</span></div>
                    <div className="row"><span>Peptide (mutant)</span><span data-testid="mutant-peptide">{a.mutant ? [...a.mutant.protein].map((aa, i) => <span className={aa !== a.wild?.protein[i] ? "bio-aa-diff" : ""} key={i}>{aa}</span>) : "(none)"}{a.mutant && a.mutant.protein.length === 0 ? "(none)" : ""}</span></div>
                  </div>
                  {a.mutant && a.mutant.codons.length ? <CodonLadder coding={a.mutantCoding} label="Mutant codon" other={a.wild} tr={a.mutant} /> : null}
                  {a.mutantMrna && a.start !== null && a.mutantMrna.slice(a.start, a.start + 3) !== "AUG" ? <p className="ph-note">A different start codon would have to be found for translation to begin.</p> : null}
                </Panel>
              ) : null}

              {mode === "challenge" ? (
                <Panel subtitle="Predict the class of a mutation found in this gene, then apply it and compare." title="Predict the mutation's effect">
                  {exQuestion && ex ? (
                    <>
                      <p className="bio-score">Candidate {exIdx % examples.length + 1} of {examples.length}</p>
                      <p className="gc-question" data-testid="predict-prompt">{exQuestion.prompt}</p>
                      <Options choice={choice} onChoose={setChoice} q={exQuestion} />
                      {choice !== null ? (
                        <div aria-live="polite" className="gc-reveal">
                          <Callout tone={choice === exQuestion.answer ? "ok" : "warn"} title={choice === exQuestion.answer ? "Your prediction matches" : `Not quite: it is “${exQuestion.options[exQuestion.answer]}”`}>
                            <p>{exQuestion.explanation}</p>
                            <div className="bio-chip-row">
                              <button className="primary-button" data-testid="apply-mutation" onClick={() => setMutation(ex.mutation)} type="button">Apply this mutation to the gene</button>
                              <button className="ghost-button" onClick={() => { setChoice(null); setExIdx((i) => i + 1); setMutation(null); }} type="button">Next candidate</button>
                            </div>
                          </Callout>
                        </div>
                      ) : null}
                    </>
                  ) : <p>This gene has no start codon to compare against.</p>}
                </Panel>
              ) : null}
              {mode === "challenge" && a.consequence && a.mutantCoding !== null && a.start !== null ? (
                <Panel subtitle={describeMutation(mut as Mutation)} title="Applied mutation">
                  <Callout tone="info" title={mutationClassLabel(a.consequence.class)}><p>{a.consequence.summary}</p></Callout>
                  <div className="bio-compare">
                    <div className="row"><span>Peptide (wild)</span><span>{a.wild?.protein || "(none)"}</span></div>
                    <div className="row"><span>Peptide (mutant)</span><span>{a.mutant?.protein || "(none)"}</span></div>
                  </div>
                </Panel>
              ) : null}

              <FramesPanel a={a} />
              {mode === "explore" ? (
                <Panel subtitle="Each answer refers to the gene you set up." title="Why does it behave this way?">
                  <Disclosure defaultOpen summary="Why does a deletion of one base do more damage than a substitution?"><p>Codons are read in non-overlapping triplets from the start codon. One inserted or deleted base shifts every downstream codon (a frameshift), usually giving a different peptide and often an early stop. A substitution changes one codon at most; it may be silent (the genetic code is redundant), missense, or nonsense. Insertions or deletions of a multiple of three keep the frame.</p></Disclosure>
                  <Disclosure summary="Is the consequence looked up?"><p>No. The mutant sequence is translated and compared with the wild type; the class is derived from that comparison.</p></Disclosure>
                  <Disclosure summary="The genetic code"><GeneticCodeTable highlight={null} /></Disclosure>
                  <Disclosure summary="Amino acids used in this peptide">
                    <ul className="gc-assumptions">{[...new Set((a.wild?.protein ?? "").split(""))].map((aa) => <li key={aa}><strong>{AMINO_ACIDS[aa].three} ({aa})</strong>: {AMINO_ACIDS[aa].name}, {AMINO_ACIDS[aa].group}</li>)}</ul>
                  </Disclosure>
                </Panel>
              ) : null}
              {mode === "practice" ? <QuizPanel questions={questions} /> : null}
            </>
          ) : (
            <Callout tone="info" title="Enter a valid gene"><p>{errors?.[0] ?? "The chain from DNA to protein appears as soon as every field is valid."}</p></Callout>
          )}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{DOGMA_ASSUMPTIONS.map((x) => <li key={x}>{x}</li>)}</ul>
      </Panel>
      <RelatedConcepts subject="biology" toolId="bioDogma" />
    </div>
  );
}
