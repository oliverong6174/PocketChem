import { useMemo, useState } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { NumberField } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { OrganismNote, PredictPanel, QuizPanel, SeqField, StepControls } from "./bioShared";
import { useStepPlayer } from "./bioHooks";
import { ReplicationDiagram, ReplicationLegend } from "./ReplicationDiagram";
import { REPLICATION_EXAMPLES } from "../../utils/biology/examples";
import { buildReplication, ENZYMES, forkRoles, primerCount, REPLICATION_LIMITS, validateReplicationInput, type ReplicationInput } from "../../utils/biology/replication";
import { replicationPredictNext, replicationQuestions } from "../../utils/biology/bioLearning";
import { REPLICATION_ASSUMPTIONS, summarizeReplication } from "../../utils/biology/bioSummary";
import {
  DEFAULT_REPLICATION_INPUTS, describeReplicationAnalysis, REPLICATION_ENGINE_VERSION, validateBiologyResults, validateReplicationInputs, type ReplicationInputs,
} from "../../utils/persistence/biologyTools";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };


export default function ReplicationPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<ReplicationInputs>({
    page: "replication",
    engineVersion: REPLICATION_ENGINE_VERSION,
    defaults: DEFAULT_REPLICATION_INPUTS,
    validateInputs: validateReplicationInputs,
    validateResults: validateBiologyResults,
    summarize: summarizeReplication,
    describe: describeReplicationAnalysis,
    fallbackName: "DNA replication",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  const setIn = (patch: Partial<ReplicationInput>) => update((c) => ({ ...c, input: { ...c.input, ...patch }, step: 0 }));
  const check = useMemo(() => validateReplicationInput(raw.input), [raw.input]);
  const errors = check.ok ? null : check.errors;
  const model = useMemo(() => (check.ok ? buildReplication(check.value) : null), [check]);
  const max = model ? model.steps.length - 1 : 0;
  const step = Math.min(raw.step, max);
  const setStep = (n: number) => update((c) => (c.step === n ? c : { ...c, step: n }));
  const player = useStepPlayer(step, max, setStep);
  const [revealed, setRevealed] = useState(false);
  const mode = raw.mode;
  const snap = model ? model.steps[step] : null;
  const hide = mode === "practice" && !revealed;
  const questions = useMemo(() => (model ? replicationQuestions(model, step) : []), [model, step]);
  const predict = useMemo(() => (model ? replicationPredictNext(model, step) : null), [model, step]);
  const roles = model ? forkRoles(model.input.direction) : null;
  const enz = ENZYMES[raw.input.organism === "eukaryote" ? "eukaryote" : "bacteria"];
  const errorFor = (re: RegExp) => errors?.find((e) => re.test(e)) ?? null;

  return (
    <div className="gc-page ph-page bio-page">
      <ToolHeader
        group="Gene expression"
        title="DNA replication"
        purpose="Watch one replication fork copy a short DNA duplex. Every base in the diagram is a real base from your sequence, and every new strand is built 5′→3′ opposite its template."
        evidence="model"
        steps={[
          { label: "Enter or pick a duplex", detail: "The top strand is written 5′→3′." },
          { label: "Step through the fork", detail: "Helicase, primase, polymerase, then repair." },
          { label: "Practise or predict", detail: "Hide the labels, or predict the next step." },
        ]}
        aside={<Badge tone="neutral" title="One fork, a few nucleotides per primer: a simplified teaching model.">One fork · simplified</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { setRevealed(false); player.pause(); update((c) => ({ ...c, mode: m })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Pick an organism, a sequence and a fork direction." title="Duplex and fork">
          <div className="gc-presets" role="group" aria-label="Example sequences">
            {REPLICATION_EXAMPLES.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => setIn({ template: p.template })} type="button">{p.label}</button>)}
          </div>
          <SeqField error={errorFor(/template|A, C, G/)} hint={`Top strand 5′→3′, ${REPLICATION_LIMITS.minLen}–${REPLICATION_LIMITS.maxLen} bases of A, C, G, T. Letters are case-insensitive; spaces are ignored.`} label="Parental top strand (5′→3′)" onChange={(template) => setIn({ template })} rows={3} value={raw.input.template} />
          <Segmented<"bacteria" | "eukaryote"> label="Organism" onChange={(organism) => setIn({ organism })} options={[{ id: "bacteria", label: "Bacterium" }, { id: "eukaryote", label: "Eukaryote" }]} value={raw.input.organism} />
          <Segmented<"right" | "left"> label="Fork moves" onChange={(direction) => setIn({ direction })} options={[{ id: "right", label: "Right →" }, { id: "left", label: "← Left" }]} value={raw.input.direction} />
          <NumberField error={errorFor(/Okazaki/)} hint="Nucleotides per fragment, primer included (real: 100–2000)." label="Okazaki fragment length" onChange={(okazakiLength) => setIn({ okazakiLength })} unit="nt" value={raw.input.okazakiLength} />
          <NumberField error={errorFor(/primer length/)} hint="RNA primer length (real: about 10)." label="RNA primer length" onChange={(primerLength) => setIn({ primerLength })} unit="nt" value={raw.input.primerLength} />
          {errors ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
          <OrganismNote organism={raw.input.organism === "eukaryote" ? "eukaryote" : "bacteria"} />
        </Panel>

        <div className="gc-stage">
          {model && snap ? (
            <>
              <StepControls
                extra={mode === "practice" ? <button className="secondary-button" onClick={() => setRevealed((r) => !r)} type="button">{revealed ? "Hide labels" : "Reveal labels"}</button> : null}
                locked={mode === "challenge"}
                max={max}
                onStep={setStep}
                player={player}
                step={step}
              />
              <div aria-live="polite" className="bio-caption" data-testid="step-caption">
                <h3>{step === 0 ? "Start" : `Step ${step}`}</h3>
                <p>{mode === "practice" && !revealed && step > 0 ? "Labels are hidden. Work out what each enzyme is doing from its position, then use Reveal labels to check." : snap.caption}</p>
              </div>
              <DiagramFrame
                caption="Arrowheads show the 3′ end of each new strand: DNA polymerase can only add there, so every new strand grows 5′→3′. Dashed lines are hydrogen-bonded base pairs (2 for A–T, 3 for G–C)."
                label="Replication fork diagram"
                legend={<ReplicationLegend />}
                title={`Replication fork (${raw.input.organism === "bacteria" ? "bacterial" : "eukaryotic"}) moving ${raw.input.direction}`}
              >
                <ReplicationDiagram hideLabels={hide} model={model} snap={snap} />
              </DiagramFrame>
              <KeyFigures
                items={[
                  { label: "Base pairs open", value: `${snap.unwound} of ${model.length}` },
                  { label: "Leading strand", value: `${snap.lead.filter((c) => c).length} nt`, note: "continuous" },
                  { label: "Okazaki fragments", value: `${snap.fragments.filter((f) => f.done).length} of ${snap.fragments.length} complete`, note: `${snap.junctions.filter((j) => j.stage === "sealed").length} of ${snap.junctions.length} junctions sealed` },
                  { label: "RNA primers present", value: String(primerCount(snap, raw.input.primerLength)), note: "removed and replaced by DNA, except at the edges" },
                ]}
              />

              {mode === "explore" ? (
                <Panel subtitle="Each answer refers to the duplex and fork direction you set up." title="Why does it behave this way?">
                  {roles ? (
                    <Disclosure defaultOpen summary="Which strand is leading, and why?">
                      <p>{roles.why}</p>
                      <p>Try the other fork direction: the leading and lagging roles of the two parental strands swap, because the strands themselves have not changed, only which way the fork travels along them.</p>
                    </Disclosure>
                  ) : null}
                  <Disclosure summary="Why Okazaki fragments?"><p>A polymerase only extends a 3′-OH. On the lagging template the 5′→3′ direction points away from the fork, so the polymerase must wait until a stretch of template is exposed, prime it, and copy back toward the previous fragment. Each piece starts with its own RNA primer. Primers are then removed by {enz.primerRemoval}, the gap is filled with DNA, and {enz.ligase} seals the nick.</p></Disclosure>
                  <Disclosure summary={`The enzymes in this ${raw.input.organism === "bacteria" ? "bacterial" : "eukaryotic"} fork`}>
                    <ul className="gc-assumptions">
                      <li><strong>{enz.helicase}</strong>: unwinds the duplex ahead of the fork (uses ATP).</li>
                      <li><strong>{enz.topo}</strong>: relieves the supercoiling that builds up ahead of the fork.</li>
                      <li><strong>{enz.ssb}</strong>: coats single-stranded DNA so it does not re-pair or fold.</li>
                      <li><strong>{enz.primase}</strong>: makes the short RNA primers (one on the leading strand, one per Okazaki fragment).</li>
                      <li><strong>{enz.leadingPol}</strong> (leading) and <strong>{enz.laggingPol}</strong> (lagging): extend primers 5′→3′; the {enz.clamp} keeps them on the DNA.</li>
                      <li><strong>{enz.primerRemoval}</strong>: removes RNA primers.</li>
                      <li><strong>{enz.ligase}</strong>: seals nicks.</li>
                    </ul>
                  </Disclosure>
                  <Disclosure summary="Is this the whole replication machine?"><p>No. A real origin opens a bubble with two forks, and proofreading, mismatch repair and the full replisome are omitted. See the assumptions below.</p></Disclosure>
                </Panel>
              ) : null}
              {mode === "practice" ? <QuizPanel questions={questions} /> : null}
              {mode === "challenge" ? <PredictPanel finished={step >= max} onReveal={() => setStep(Math.min(max, step + 1))} question={predict} /> : null}

              {step >= max ? (
                <Panel subtitle="Read 5′→3′. Each daughter duplex holds one parental strand and one new strand (semi-conservative replication)." title="The finished strands">
                  <dl className="bio-seqline">
                    <dt>Leading strand</dt><dd data-testid="final-leading">5′-{model.finalLeading}-3′</dd>
                    <dt>Lagging strand</dt><dd data-testid="final-lagging">5′-{model.finalLagging}-3′</dd>
                  </dl>
                  <p className="ph-note">The two RNA primers at the edges of this segment stay as RNA; in a chromosome they are handled by the neighbouring replication unit or telomere biology.</p>
                </Panel>
              ) : null}
            </>
          ) : (
            <Callout tone="info" title="Enter a valid duplex to see the fork"><p>{errors?.[0] ?? "The diagram appears as soon as every field is valid."}</p></Callout>
          )}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{REPLICATION_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      <RelatedConcepts limit={5} subject="biology" toolId="bioReplication" />
    </div>
  );
}
