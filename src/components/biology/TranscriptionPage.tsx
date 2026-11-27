import { useMemo, useState } from "react";
import { useNavigation } from "../../navigation/NavigationContext";
import { putHandoff } from "../../utils/biology/handoff16";
import { prepareMrnaContext } from "../../utils/concepts/context";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { NumberField } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { OrganismNote, PredictPanel, QuizPanel, SeqField, StepControls } from "./bioShared";
import { useStepPlayer } from "./bioHooks";
import { RnaProcessingDiagram, TranscriptionDiagram } from "./TranscriptionDiagram";
import { buildTranscription, preMrna, splice, TRANSCRIPTION_LIMITS, validateTranscriptionInput, type TranscriptionInput } from "../../utils/biology/transcription";
import { TRANSCRIPTION_EXAMPLES } from "../../utils/biology/examples";
import { transcriptionPredictNext, transcriptionQuestions } from "../../utils/biology/bioLearning";
import { reverseComplementDna } from "../../utils/biology/sequence";
import { TRANSCRIPTION_ASSUMPTIONS, summarizeTranscription } from "../../utils/biology/bioSummary";
import {
  DEFAULT_TRANSCRIPTION_INPUTS, describeTranscriptionAnalysis, TRANSCRIPTION_ENGINE_VERSION, validateBiologyResults, validateTranscriptionInputs, type TranscriptionInputs,
} from "../../utils/persistence/biologyTools";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

export default function TranscriptionPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<TranscriptionInputs>({
    page: "transcription",
    engineVersion: TRANSCRIPTION_ENGINE_VERSION,
    defaults: DEFAULT_TRANSCRIPTION_INPUTS,
    validateInputs: validateTranscriptionInputs,
    validateResults: validateBiologyResults,
    summarize: summarizeTranscription,
    describe: describeTranscriptionAnalysis,
    fallbackName: "Transcription",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  const setIn = (patch: Partial<TranscriptionInput>) => update((c) => ({ ...c, input: { ...c.input, ...patch, step: 0 } }));
  const check = useMemo(() => validateTranscriptionInput(raw.input), [raw.input]);
  const errors = check.ok ? null : check.errors;
  const model = useMemo(() => (check.ok ? buildTranscription(check.value) : null), [check]);
  const max = model ? model.steps.length - 1 : 0;
  const step = Math.min(raw.input.step, max);
  const setStep = (n: number) => update((c) => (c.input.step === n ? c : { ...c, input: { ...c.input, step: n } }));
  const player = useStepPlayer(step, max, setStep);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const { openDestination } = useNavigation();
  const mode = raw.mode;
  const cur = model ? model.steps[step] : null;
  const hide = mode === "practice" && !revealed;
  const euk = raw.input.organism === "eukaryote";
  const questions = useMemo(() => (model ? transcriptionQuestions(model, step) : []), [model, step]);
  const predict = useMemo(() => (model ? transcriptionPredictNext(model, step) : null), [model, step]);
  const errorFor = (re: RegExp) => errors?.find((e) => re.test(e)) ?? null;
  const setIntron = (i: number, key: "start" | "end", display: number) => update((c) => {
    const introns = c.input.introns.map((it) => ({ ...it }));
    // shown 1-based inclusive: start = first base, end = last base; stored 0-based start, exclusive end
    if (key === "start") introns[i].start = display - 1; else introns[i].end = display;
    return { ...c, input: { ...c.input, introns, step: 0 } };
  });
  const processing = cur !== null && cur.phase !== "initiation" && cur.phase !== "elongation" && cur.phase !== "termination" && euk;
  const nextStage = () => { if (!model) return; const ph = model.steps[step].phase; const j = model.steps.findIndex((s, i) => i > step && s.phase !== ph); setStep(j < 0 ? max : j); };
  const mature = model && step >= max ? model.mature : null;

  // pre-mRNA preview with exons / introns coloured
  const preview = useMemo(() => {
    if (!check.ok) return null;
    const rna = preMrna(check.value.coding);
    const parts: Array<{ text: string; intron: boolean }> = [];
    let pos = 0;
    for (const it of check.value.introns) { parts.push({ text: rna.slice(pos, it.start), intron: false }, { text: rna.slice(it.start, it.end), intron: true }); pos = it.end; }
    parts.push({ text: rna.slice(pos), intron: false });
    return parts;
  }, [check]);

  return (
    <div className="gc-page ph-page bio-page">
      <ToolHeader
        group="Gene expression"
        title="Transcription & RNA processing"
        purpose="Follow RNA polymerase along a gene. See which strand is the template, how each RNA base is chosen, and, for a eukaryote, how the pre-mRNA is capped, spliced and polyadenylated."
        evidence="model"
        steps={[
          { label: "Enter a gene", detail: "Coding strand, 5′→3′, from +1." },
          { label: "Step through", detail: "Initiation, elongation, termination, processing." },
          { label: "Practise or predict", detail: "Hide labels, or predict the next nucleotide." },
        ]}
        aside={<Badge tone="neutral" title="Promoters and terminators are described, not drawn as sequence.">Simplified</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { setRevealed(false); player.pause(); update((c) => ({ ...c, mode: m })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Choose a gene and an organism." title="Gene">
          <div className="gc-presets" role="group" aria-label="Example genes">
            {TRANSCRIPTION_EXAMPLES.map((e) => <button className="secondary-button gc-chip" key={e.label} onClick={() => update((c) => ({ ...c, input: { coding: e.coding, organism: e.organism, introns: e.introns.map((i) => ({ ...i })), step: 0 } }))} type="button">{e.label}</button>)}
          </div>
          <SeqField error={errorFor(/coding strand|bases \(found|DNA/)} hint={`Coding strand 5′→3′ from the start site, ${TRANSCRIPTION_LIMITS.minLen}–${TRANSCRIPTION_LIMITS.maxLen} bases of A, C, G, T.`} label="Coding strand (5′→3′)" onChange={(coding) => setIn({ coding })} rows={4} value={raw.input.coding} />
          <Segmented<"bacteria" | "eukaryote"> label="Organism" onChange={(organism) => update((c) => ({ ...c, input: { ...c.input, organism, introns: organism === "bacteria" ? [] : c.input.introns, step: 0 } }))} options={[{ id: "bacteria", label: "Bacterium" }, { id: "eukaryote", label: "Eukaryote" }]} value={raw.input.organism} />
          {euk ? (
            <fieldset className="gc-field">
              <legend>Introns (positions in the gene, counted from 1)</legend>
              {raw.input.introns.map((it, i) => (
                <div className="bio-intron-row" key={i}>
                  <NumberField error={errorFor(new RegExp(`Intron ${i + 1}`))} label={`Intron ${i + 1} first base`} onChange={(v) => setIntron(i, "start", v)} value={it.start + 1} />
                  <NumberField label={`Intron ${i + 1} last base`} onChange={(v) => setIntron(i, "end", v)} value={it.end} />
                  <button aria-label={`Remove intron ${i + 1}`} className="ghost-button" onClick={() => update((c) => ({ ...c, input: { ...c.input, introns: c.input.introns.filter((_, k) => k !== i), step: 0 } }))} type="button">Remove</button>
                </div>
              ))}
              <button className="secondary-button" disabled={raw.input.introns.length >= 3} onClick={() => update((c) => ({ ...c, input: { ...c.input, introns: [...c.input.introns, { start: 14, end: 31 }], step: 0 } }))} type="button">Add an intron</button>
              <p className="gc-field-hint">An intron must start with GU and end with AG (in the RNA), contain an A for the branch point, and have exon bases on both sides.</p>
            </fieldset>
          ) : null}
          {errors ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
          <OrganismNote organism={raw.input.organism === "eukaryote" ? "eukaryote" : "bacteria"} />
        </Panel>

        <div className="gc-stage">
          {model && cur ? (
            <>
              <StepControls
                extra={<>{mode === "practice" ? <button className="secondary-button" onClick={() => setRevealed((r) => !r)} type="button">{revealed ? "Hide labels" : "Reveal labels"}</button> : null}{mode === "challenge" ? <button className="ghost-button" disabled={step >= max} onClick={nextStage} type="button">Skip to the next stage</button> : null}</>}
                locked={mode === "challenge"}
                max={max}
                onStep={setStep}
                player={player}
                step={step}
              />
              <div aria-live="polite" className="bio-caption" data-testid="step-caption">
                <h3>{cur.title} <Badge tone="neutral">{cur.phase}</Badge></h3>
                <p>{hide && cur.phase === "elongation" ? "Labels are hidden. Which template base is at the active site, and which RNA base pairs with it? Use Reveal labels to check." : cur.caption}</p>
              </div>
              <DiagramFrame
                caption={processing ? "Blue: exons. Grey: introns. Yellow: the branch-point A. The DNA gene is unchanged by processing." : "The template strand is drawn 3′→5′ under the coding strand. Each RNA base is the RNA complement of the template base in its column, so the RNA has the coding strand's sequence with U for T."}
                label={processing ? "RNA processing diagram" : "Transcription diagram"}
                legend={processing ? <Legend items={[{ label: "Exon", color: "#1d4ed8" }, { label: "Intron / lariat", color: "#6b7280" }, { label: "Branch-point A", color: "#92400e" }, { label: "Cap / tail", color: "#9a3412" }]} /> : <Legend items={[{ label: "Coding strand", color: "#3b5b7d" }, { label: "Template strand", color: "#5b4f8f" }, { label: "RNA", color: "#be123c" }]} />}
                title={processing ? "Eukaryotic pre-mRNA processing" : `${euk ? "Eukaryotic" : "Bacterial"} transcription`}
              >
                {processing ? <RnaProcessingDiagram hideLabels={hide} model={model} step={cur} /> : <TranscriptionDiagram hideLabels={hide} model={model} step={cur} />}
              </DiagramFrame>
              <KeyFigures
                items={[
                  { label: "RNA made", value: `${cur.state.transcribed} of ${model.rna.length} nt` },
                  { label: "5′ cap", value: euk ? (cur.state.capped ? "added" : "not yet") : "none (bacteria)" },
                  { label: "Introns removed", value: euk ? `${cur.state.introns.filter((s) => s === "removed").length} of ${raw.input.introns.length}` : "none (bacteria)" },
                  { label: "Poly(A) tail", value: euk ? (cur.state.tailed ? "added" : "not yet") : "none (bacteria)" },
                ]}
              />
              <Panel subtitle="Written as in the diagram; read each line in the direction shown." title="The strands">
                <dl className="bio-seqline" data-testid="strands">
                  <dt>Coding 5′→3′</dt><dd>{raw.input.coding}</dd>
                  <dt>Template 3′→5′</dt><dd>{model.template}</dd>
                  <dt>Template 5′→3′</dt><dd>{reverseComplementDna(raw.input.coding)}</dd>
                  <dt>{euk ? "Pre-mRNA 5′→3′" : "mRNA 5′→3′"}</dt>
                  <dd data-testid="rna-seq">{euk && preview ? preview.map((p, i) => <span key={i} style={p.intron ? { opacity: 0.55, textDecoration: "underline dotted" } : { fontWeight: 700 }}>{p.text}</span>) : model.rna}</dd>
                </dl>
                {euk && raw.input.introns.length ? <p className="ph-note">Bold: exons. Faded and underlined: introns.</p> : null}
              </Panel>
              {mature !== null ? (
                <Panel subtitle="Ready for translation." title="The finished mRNA">
                  <dl className="bio-seqline">
                    <dt>{euk ? "mRNA body 5′→3′" : "mRNA 5′→3′"}</dt><dd data-testid="mature-seq">{euk ? "(cap) " : ""}{mature}{euk && model.polyA ? " (poly-A tail)" : ""}</dd>
                    <dt>First-AUG peptide</dt><dd data-testid="mature-peptide">{model.translation ? `${model.translation.protein || "(none)"} (${model.translation.status})` : "no AUG: no peptide"}</dd>
                  </dl>
                  <button className="secondary-button" onClick={() => { void navigator.clipboard?.writeText(mature).then(() => setCopied(true), () => setCopied(false)); }} type="button">{copied ? "Copied" : "Copy the mRNA for the Translation tool"}</button>
                  <button className="secondary-button" data-testid="to-translation" onClick={() => { const c = prepareMrnaContext(mature, raw.input.organism); if (c.ok) { putHandoff({ to: "translation", mrna: c.value.mrna, organism: c.value.organism, source: "the Transcription tool" }); openDestination({ subject: "biology", toolId: "bioTranslation" }); } else setHandoffError(c.error); }} type="button">Open this mRNA in Translation</button>
                  <p className="ph-note">Replaces the mRNA in the Translation tool with this finished mRNA (cap and tail omitted). {handoffError}</p>
                  {euk && !model.polyA ? <p className="ph-note">No AAUAAA signal was found, so no cleavage or poly(A) tail is shown.</p> : null}
                  {euk && model.polyA?.short ? <p className="ph-note">Fewer than 15 nt follow the AAUAAA signal, so cleavage is placed at the end of the RNA.</p> : null}
                </Panel>
              ) : null}

              {mode === "explore" ? (
                <Panel subtitle="Each answer refers to the gene you set up." title="Why does it behave this way?">
                  <Disclosure defaultOpen summary="Which strand is the template?"><p>RNA polymerase reads the <strong>template</strong> strand 3′→5′ and builds RNA 5′→3′. The RNA is therefore complementary to the template and has the same sequence as the <strong>coding</strong> strand, with U in place of T. In the diagram the template is drawn 3′→5′ so each column shows a base pair.</p></Disclosure>
                  <Disclosure summary="What is the transcription bubble?"><p>The polymerase unwinds about 12–14 bp. Inside it the newest RNA stays paired with the template for about 9 bp (the RNA–DNA hybrid); older RNA peels away and the DNA behind the enzyme closes again.</p></Disclosure>
                  {euk ? (
                    <>
                      <Disclosure summary="Capping, splicing and polyadenylation"><p>The 7-methylguanosine cap is added to the 5′ end early. Introns (GU…AG) are removed by the spliceosome in two transesterifications that form a lariat. The 3′ end is cut downstream of AAUAAA and poly(A) polymerase adds a tail of A residues. In cells these steps overlap with transcription; the tool shows them one after another.</p></Disclosure>
                      <Disclosure summary="Why do introns need an A?"><p>The 2′-OH of the branch-point adenosine attacks the 5′ splice site, joining the intron's first nucleotide to it through a 2′–5′ bond and forming the lariat.</p></Disclosure>
                    </>
                  ) : (
                    <Disclosure summary="What about bacteria?"><p>A bacterial mRNA is the primary transcript: it has no cap, no introns to splice and no poly(A) tail in this model, and ribosomes can start translating it while it is still being made.</p></Disclosure>
                  )}
                  {euk && raw.input.introns.length ? <p className="ph-note">Spliced length: {splice(model.rna, raw.input.introns).mature.length} nt (from {model.rna.length}).</p> : null}
                </Panel>
              ) : null}
              {mode === "practice" ? <QuizPanel questions={questions} /> : null}
              {mode === "challenge" ? <PredictPanel finished={step >= max} onReveal={() => setStep(Math.min(max, step + 1))} question={predict} /> : null}
            </>
          ) : (
            <Callout tone="info" title="Enter a valid gene to see transcription"><p>{errors?.[0] ?? "The diagram appears as soon as every field is valid."}</p></Callout>
          )}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{TRANSCRIPTION_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      <RelatedConcepts subject="biology" toolId="bioTranscription" />
    </div>
  );
}
