import { useEffect, useMemo, useState } from "react";
import { takeHandoff } from "../../utils/biology/handoff16";
import { prepareMrnaContext } from "../../utils/concepts/context";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { OrganismNote, PredictPanel, QuizPanel, SeqField, StepControls } from "./bioShared";
import { useStepPlayer } from "./bioHooks";
import { PeptideHandoff } from "./PeptideHandoff";
import { RibosomeDiagram } from "./RibosomeDiagram";
import { ALL_CODONS, readCodon } from "../../utils/biology/geneticCode";
import { findStarts } from "../../utils/biology/translate";
import { buildTranslation, TRANSLATION_LIMITS, validateTranslationInput, type TranslationInput } from "../../utils/biology/translation";
import { TRANSLATION_EXAMPLES } from "../../utils/biology/examples";
import { translationPredictNext, translationQuestions } from "../../utils/biology/bioLearning";
import { TRANSLATION_ASSUMPTIONS, summarizeTranslation } from "../../utils/biology/bioSummary";
import {
  DEFAULT_TRANSLATION_INPUTS, describeTranslationAnalysis, TRANSLATION_ENGINE_VERSION, validateBiologyResults, validateTranslationInputs, type TranslationInputs,
} from "../../utils/persistence/biologyTools";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void; onOpenPeptide?: () => void };

export function GeneticCodeTable({ highlight }: { highlight: string | null }) {
  return (
    <div className="bio-code" data-testid="code-table" role="table" aria-label="The standard genetic code">
      {ALL_CODONS.map((c) => {
        const m = readCodon(c);
        const cls = m?.kind === "stop" ? " is-stop" : c === "AUG" ? " is-start" : "";
        return (
          <div className={`bio-code-cell${cls}${c === highlight ? " is-here" : ""}`} key={c} role="row" title={m?.kind === "amino" ? m.info.name : "Stop codon"}>
            <span>{c}</span><span>{m?.kind === "stop" ? "Stop" : m?.info.three}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function TranslationPage({ openRequest = null, onOpenHandled, onOpenPeptide }: Props) {
  const ws = useGcWorkspace<TranslationInputs>({
    page: "translation",
    engineVersion: TRANSLATION_ENGINE_VERSION,
    defaults: DEFAULT_TRANSLATION_INPUTS,
    validateInputs: validateTranslationInputs,
    validateResults: validateBiologyResults,
    summarize: summarizeTranslation,
    describe: describeTranslationAnalysis,
    fallbackName: "Translation",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  // An mRNA sent from the Transcription tool (the user clicked the button there): taken once, validated, then saved in this tool's own state.
  const [arrivalNote, setArrivalNote] = useState<string | null>(null);
  useEffect(() => {
    const h = takeHandoff("translation");
    if (!h) return;
    const ok = prepareMrnaContext(h.mrna, h.organism);
    if (ok.ok) {
      update((c) => ({ ...c, input: { ...c.input, mrna: ok.value.mrna, organism: ok.value.organism, start: null, step: 0 } }));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- takes the one-shot hand-off slot (an external value) once at mount
      setArrivalNote(`Loaded the mRNA (${ok.value.mrna.length} bases, ${ok.value.organism === "bacteria" ? "bacterial" : "eukaryotic"}) from ${h.source}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setIn = (patch: Partial<TranslationInput>) => update((c) => ({ ...c, input: { ...c.input, ...patch, step: 0 } }));
  const check = useMemo(() => validateTranslationInput(raw.input), [raw.input]);
  const errors = check.ok ? null : check.errors;
  const model = useMemo(() => (check.ok ? buildTranslation(check.value) : null), [check]);
  const max = model ? model.steps.length - 1 : 0;
  const step = Math.min(raw.input.step, max);
  const setStep = (n: number) => update((c) => (c.input.step === n ? c : { ...c, input: { ...c.input, step: n } }));
  const player = useStepPlayer(step, max, setStep);
  const [revealed, setRevealed] = useState(false);
  const mode = raw.mode;
  const cur = model ? model.steps[step] : null;
  const hide = mode === "practice" && !revealed;
  const bact = raw.input.organism === "bacteria";
  const questions = useMemo(() => (model ? translationQuestions(model, step) : []), [model, step]);
  const predict = useMemo(() => (model ? translationPredictNext(model, step) : null), [model, step]);
  const starts = useMemo(() => findStarts(raw.input.mrna), [raw.input.mrna]);
  const nextCodon = () => { if (!model) return; const j = model.codonStarts.find((s) => s > step); setStep(j === undefined ? max : j); };
  const errorFor = (re: RegExp) => errors?.find((e) => re.test(e)) ?? null;
  const aCodon = cur?.sites.A?.codon ?? null;

  return (
    <div className="gc-page ph-page bio-page">
      <ToolHeader
        group="Gene expression"
        title="Translation"
        purpose="Watch a ribosome read an mRNA codon by codon. See which tRNA pairs with each codon, how the peptide grows, and how a stop codon ends translation."
        evidence="model"
        steps={[
          { label: "Enter an mRNA", detail: "RNA, 5′→3′." },
          { label: "Step through the ribosome", detail: "A, P and E sites; bind, bond, translocate." },
          { label: "Practise or predict", detail: "Hide labels, or predict the next amino acid." },
        ]}
        aside={<Badge tone="neutral" title="Standard genetic code; no wobble or tRNA scarcity.">Standard code</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { setRevealed(false); player.pause(); update((c) => ({ ...c, mode: m })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      {arrivalNote ? <Callout tone="info" title="mRNA received"><p data-testid="arrival-note">{arrivalNote}</p></Callout> : null}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Choose an mRNA and an organism." title="mRNA">
          <div className="gc-presets" role="group" aria-label="Example mRNAs">
            {TRANSLATION_EXAMPLES.map((e) => <button className="secondary-button gc-chip" key={e.label} onClick={() => update((c) => ({ ...c, input: { ...c.input, mrna: e.mrna, start: null, step: 0 } }))} type="button">{e.label}</button>)}
          </div>
          <SeqField error={errorFor(/mRNA/)} hint={`mRNA 5′→3′, ${TRANSLATION_LIMITS.minLen}–${TRANSLATION_LIMITS.maxLen} bases of A, C, G, U (not T).`} label="mRNA (5′→3′)" onChange={(mrna) => setIn({ mrna, start: null })} rows={4} value={raw.input.mrna} />
          <Segmented<"bacteria" | "eukaryote"> label="Organism" onChange={(organism) => setIn({ organism, start: null })} options={[{ id: "bacteria", label: "Bacterium" }, { id: "eukaryote", label: "Eukaryote" }]} value={raw.input.organism} />
          {bact && starts.length > 1 ? (
            <div className="gc-field">
              <label htmlFor="tr-start">Start codon (bacteria can start at any AUG)</label>
              <select id="tr-start" onChange={(e) => setIn({ start: e.target.value === "" ? null : Number(e.target.value) })} value={raw.input.start === null ? "" : String(raw.input.start)}>
                <option value="">First AUG (position {starts[0].position + 1})</option>
                {starts.map((s) => <option key={s.position} value={s.position}>AUG at position {s.position + 1} (frame {s.frame + 1})</option>)}
              </select>
            </div>
          ) : null}
          {!bact ? <p className="gc-field-hint">A scanning eukaryotic ribosome starts at the first AUG.</p> : null}
          {errors ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
          <OrganismNote organism={bact ? "bacteria" : "eukaryote"} />
        </Panel>

        <div className="gc-stage">
          {model && cur ? (
            <>
              <StepControls
                extra={<>
                  <button className="ghost-button" disabled={step >= max || mode === "challenge"} onClick={() => { player.pause(); nextCodon(); }} type="button">Next codon ⏭</button>
                  {mode === "practice" ? <button className="secondary-button" onClick={() => setRevealed((r) => !r)} type="button">{revealed ? "Hide labels" : "Reveal labels"}</button> : null}
                </>}
                locked={mode === "challenge"}
                max={max}
                onStep={setStep}
                player={player}
                step={step}
              />
              <div aria-live="polite" className="bio-caption" data-testid="step-caption">
                <h3>{cur.title} <Badge tone="neutral">{cur.phase}</Badge></h3>
                <p>{hide && cur.phase === "binding" ? "Labels are hidden. Which tRNA anticodon pairs with this codon, and which amino acid does it carry? Use Reveal labels to check." : cur.caption}</p>
              </div>
              <DiagramFrame
                caption="The anticodon under each codon is written 3′→5′ so that it pairs base by base. The chain moves from the P-site tRNA to the A-site tRNA at each peptide bond; then the ribosome shifts three nucleotides along the mRNA."
                label="Ribosome diagram"
                legend={<Legend items={[{ label: "mRNA codon", color: "#be123c" }, { label: "tRNA / anticodon", color: "#166534" }, { label: "Amino acid", color: "#92400e" }, { label: "Subunits", color: "#4338ca" }]} />}
                title={`${bact ? "Bacterial (70S)" : "Eukaryotic (80S)"} ribosome`}
              >
                <RibosomeDiagram hideLabels={hide} model={model} step={cur} />
              </DiagramFrame>
              <KeyFigures
                items={[
                  { label: "Codon in the A site", value: aCodon ?? (cur.phase === "termination" ? "stop codon" : "—"), note: cur.sites.A?.aaName ?? undefined },
                  { label: "Peptide so far", value: cur.peptide ? `${cur.peptide.length} aa` : "0 aa", note: cur.peptide.length > 24 ? `${cur.peptide.slice(0, 24)}…` : cur.peptide },
                  { label: "Initiator", value: bact ? "fMet-tRNA" : "Met-tRNAi" },
                  { label: "Factors in action", value: cur.factors.length ? cur.factors.join(", ") : "none" },
                ]}
              />
              <Panel subtitle="Codons of the chosen reading frame, from the start codon." title="Reading frame" >
                <div className="bio-codon-strip" data-testid="codon-strip">
                  {model.translation?.codons.map((c, i) => <span className={`bio-codon-chip${i === 0 ? " start" : ""}${c.kind === "stop" ? " stop" : ""}${(c.start === (model.start as number) + 3 * cur.codonIndex) ? " here" : ""}`} key={c.start}>{c.codon}</span>)}
                  {model.translation && model.translation.leftover ? <span className="bio-codon-chip">{model.translation.leftover}</span> : null}
                </div>
                <p className="ph-note">Peptide read so far: <strong data-testid="peptide-text">{cur.peptide || "(none)"}</strong>{model.translation && step >= max ? ` — final peptide ${model.translation.protein || "(none)"}` : ""}.</p>
                {model.translation && step >= max ? <PeptideHandoff onOpen={onOpenPeptide} sequence={model.translation.protein} source="the Translation tool" /> : null}
              </Panel>

              {mode === "explore" ? (
                <Panel subtitle="Each answer refers to the mRNA you set up." title="Why does it behave this way?">
                  <Disclosure defaultOpen summary="What do the A, P and E sites do?"><p>The <strong>A</strong> site receives the incoming aminoacyl-tRNA whose anticodon pairs with the codon. The <strong>P</strong> site holds the tRNA attached to the growing chain. The <strong>E</strong> site holds the empty tRNA on its way out. Each cycle moves a tRNA A→P→E as the ribosome advances one codon.</p></Disclosure>
                  <Disclosure summary="How does a tRNA match a codon?"><p>The anticodon is the reverse complement of the codon, so 5′-AUG-3′ pairs with 5′-CAU-3′ (written 3′-UAC-5′ under the codon). An enzyme (aminoacyl-tRNA synthetase) attaches the right amino acid to each tRNA; the genetic code is that matching. This tool uses one tRNA per codon; real cells use wobble pairing at the third position.</p></Disclosure>
                  <Disclosure summary={bact ? "Bacterial initiation and termination" : "Eukaryotic initiation and termination"}><p>{bact ? "The 30S subunit binds a Shine–Dalgarno sequence upstream of the start codon and starts with formylmethionine; RF1 (UAA, UAG) or RF2 (UAA, UGA) ends translation." : "The 40S subunit binds the 5′ cap and scans to the first AUG, starting with methionine; the single release factor eRF1 recognises all three stop codons."}</p></Disclosure>
                  <Disclosure summary="The genetic code"><GeneticCodeTable highlight={aCodon} /></Disclosure>
                </Panel>
              ) : null}
              {mode === "practice" ? <QuizPanel questions={questions} /> : null}
              {mode === "challenge" ? <PredictPanel finished={step >= max} onReveal={() => setStep(Math.min(max, step + 1))} question={predict} /> : null}
              {model.translation === null ? <Callout tone="warn" title="No start codon"><p>This mRNA has no AUG, so translation never begins.</p></Callout> : null}
            </>
          ) : (
            <Callout tone="info" title="Enter a valid mRNA to see the ribosome"><p>{errors?.[0] ?? "The diagram appears as soon as every field is valid."}</p></Callout>
          )}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{TRANSLATION_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      <RelatedConcepts subject="biology" toolId="bioTranslation" />
    </div>
  );
}
