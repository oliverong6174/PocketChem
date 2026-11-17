import { useMemo } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { PredictPanel, QuizPanel, StepControls } from "./bioShared";
import { useNarrow, useStepPlayer } from "./bioHooks";
import { CheckRow } from "./cell23";
import { SignalingCards, SignalingDiagram } from "./SignalingDiagram";
import { STATUS_SYMBOL, STATUS_WORD } from "./signalingSymbols";
import {
  AMPLIFICATION_NOTE, MAX_PERTURBATIONS, RECEPTOR_CLASSES, SYSTEMS, SYSTEM_IDS, TERMINATION_SUMMARY, acContext, evaluateSignaling, eventCaption, nodeStateText, perturbationEffect, isOn,
  type Phase, type SystemId,
} from "../../utils/biology/signaling23";
import { signalingChallenge, signalingQuestions } from "../../utils/biology/bioLearning23";
import { SIGNALING_ASSUMPTIONS, describeSignaling, summarizeSignaling } from "../../utils/biology/bioSummary23";
import { DEFAULT_SIGNALING_INPUTS, SIGNALING_ENGINE_VERSION, validateSignalingInputs, type SignalingInputs } from "../../utils/persistence/biologyTools23";
import { validateBiologyResults } from "../../utils/persistence/biologyTools";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void; onNavigate?: (id: "bioNeuron" | "bioRegulation") => void };

const SYSTEM_LABEL: Record<SystemId, string> = { gs: "GPCR · Gs", gi: "GPCR · Gi", gq: "GPCR · Gq", rtk: "RTK · EGFR → ERK", lgic: "Ligand-gated channel", nuclear: "Intracellular receptor" };
const PHASE_LABEL: Record<Phase, string> = { acute: "Ligand present", prolonged: "Prolonged exposure", removed: "Ligand removed" };
const AC_TEXT = {
  blocked: "Adenylyl cyclase is blocked: no cAMP is made whatever the G proteins do.",
  basal: "No stimulation: adenylyl cyclase makes only its basal cAMP.",
  stimulated: "Adenylyl cyclase is stimulated by Gαs·GTP: cAMP production rises.",
  "stimulated-opposed": "Gαs·GTP stimulates adenylyl cyclase and Gαi·GTP opposes it: production is stimulated but lower than with Gs alone.",
  inhibited: "Gαi·GTP inhibits adenylyl cyclase: production falls (no cAMP increase).",
} as const;

export default function SignalingPage({ openRequest = null, onOpenHandled, onNavigate }: Props) {
  const ws = useGcWorkspace<SignalingInputs>({
    page: "signaling", engineVersion: SIGNALING_ENGINE_VERSION, defaults: DEFAULT_SIGNALING_INPUTS, validateInputs: validateSignalingInputs, validateResults: validateBiologyResults,
    summarize: summarizeSignaling, describe: describeSignaling, fallbackName: "Cell signaling", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const sig = raw.sig, mode = raw.mode;
  const sys = SYSTEMS[sig.system];
  const narrow = useNarrow(600);
  const setSig = (patch: Partial<SignalingInputs["sig"]>) => update((c) => ({ ...c, sig: { ...c.sig, ...patch } }));
  const setStep = (n: number) => update((c) => (c.sig.step === n ? c : { ...c, sig: { ...c.sig, step: n } }));
  const player = useStepPlayer(sig.step, sys.steps, setStep);
  const setSystem = (id: SystemId) => { player.pause(); update((c) => ({ ...c, selected: null, sig: { system: id, ligand: true, coLigand: false, perturbations: [], phase: "acute", step: 0 } })); };
  const select = (id: string | null) => update((c) => ({ ...c, selected: id }));

  const ev = useMemo(() => evaluateSignaling(sig), [sig]);
  const eff = useMemo(() => perturbationEffect(sig), [sig]);
  const caption = sig.phase === "acute" ? eventCaption(sys, ev, sig.step)
    : sig.phase === "prolonged" ? { title: "Prolonged exposure", text: "The ligand is still present. Where negative feedback or desensitization is functional the signal is attenuated (◐); where it is blocked the signal stays fully on." }
      : { title: "Ligand removed", text: "The ligand is withdrawn. Components switch off when their termination mechanism works; a component whose termination step is blocked (↻) or that is constitutively active stays on." };
  const validPert = (id: string, checked: boolean) => {
    if (checked) return true;
    if (sig.perturbations.length >= MAX_PERTURBATIONS) return false;
    const def = sys.perturbations.find((p) => p.id === id)!;
    return !sig.perturbations.some((o) => { const od = sys.perturbations.find((p) => p.id === o)!; return od.target === def.target && od.kind !== def.kind; });
  };
  const togglePert = (id: string, on: boolean) => setSig({ perturbations: on ? [...sig.perturbations, id] : sig.perturbations.filter((p) => p !== id) });
  const questions = useMemo(() => signalingQuestions(raw), [raw]);
  const challenge = useMemo(() => signalingChallenge(raw, raw.challenge), [raw]);
  const applyChallenge = () => { if (challenge) update((c) => ({ ...challenge.next, challenge: c.challenge + 1 })); };
  const sel = sys.nodes.find((n) => n.id === raw.selected) ?? null;
  const ac = acContext(ev);
  const figures = sys.keyNodes.map((id) => { const n = sys.nodes.find((x) => x.id === id)!; const reached = ev.reached[id]; const s = ev.current[id]; return { label: n.label, value: reached ? `${STATUS_SYMBOL[s]} ${STATUS_WORD[s]}` : "· not yet", note: nodeStateText(sys, id, ev).slice(0, 60) }; });
  const activeCount = sys.nodes.filter((n) => n.kind !== "terminator" && ev.reached[n.id] && isOn(ev.current[n.id])).length;

  return (
    <div className="gc-page ph-page bio-page">
      <ToolHeader
        group="Cellular biology & physiology"
        title="Cell signaling"
        purpose="Follow a signal from receptor to effector one event at a time. Each step is an actual state change derived from the pathway, so you can block a step, make one constitutively active, remove the ligand and see what switches off."
        evidence="model"
        steps={[{ label: "Pick a receptor pathway", detail: "GPCR (Gs, Gi, Gq), EGFR → ERK, a ligand-gated channel or a nuclear receptor." }, { label: "Step through", detail: "Select any component to see its state and role." }, { label: "Perturb and predict", detail: "Inhibitors, mutations, termination." }]}
        aside={<Badge tone="neutral" title="Curated pathways; no rates or amplification factors.">Mechanism graph</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => update((c) => ({ ...c, mode: m }))} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <Panel subtitle="Receptors do not all work the same way. Choose a class to open its model." title="Receptor classes">
        <table className="c23-table" data-testid="receptor-table">
          <thead><tr><th scope="col">Class</th><th scope="col">Location</th><th scope="col">Activation</th><th scope="col">Signal transmission</th><th scope="col">Speed</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
          <tbody>{RECEPTOR_CLASSES.map((c) => (
            <tr key={c.id}><th scope="row">{c.name}</th><td>{c.location}</td><td>{c.activation}</td><td>{c.transmission}</td><td>{c.speed}</td>
              <td><button className="secondary-button" data-testid={`open-${c.id}`} onClick={() => setSystem(c.system)} type="button">Open</button></td></tr>
          ))}</tbody>
        </table>
      </Panel>

      <div className="c23-sections"><Segmented<SystemId> label="Signaling pathway" onChange={setSystem} options={SYSTEM_IDS.map((id) => ({ id, label: SYSTEM_LABEL[id] }))} value={sig.system} /></div>

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle={sys.summary} title="Ligand, phase and perturbations">
          <CheckRow checked={sig.ligand} id="ligand" label={`${sys.nodes.find((n) => n.id === sys.ligandId)!.label} present`} onChange={(v) => setSig({ ligand: v })} />
          {sys.coLigandId ? <CheckRow checked={sig.coLigand} id="coligand" label={`${sys.nodes.find((n) => n.id === sys.coLigandId)!.label} present`} onChange={(v) => setSig({ coLigand: v })} /> : null}
          <Segmented<Phase> label="Signal phase" onChange={(p) => { player.pause(); setSig({ phase: p }); }} options={(["acute", "prolonged", "removed"] as Phase[]).map((p) => ({ id: p, label: PHASE_LABEL[p] }))} value={sig.phase} />
          <fieldset className="c23-fieldset">
            <legend>Inhibitors and mutations (up to {MAX_PERTURBATIONS})</legend>
            <div className="c23-pert-list">
              {sys.perturbations.map((p) => {
                const checked = sig.perturbations.includes(p.id);
                return (
                  <label className="bio-check" key={p.id} title={p.explanation}>
                    <input checked={checked} data-testid={`pert-${p.id}`} disabled={!validPert(p.id, checked)} onChange={(e) => togglePert(p.id, e.target.checked)} type="checkbox" />
                    {" "}{p.label}{p.kind === "constitutive" ? " (constitutive)" : ""}
                  </label>
                );
              })}
            </div>
            <button className="ghost-button" disabled={!sig.perturbations.length} onClick={() => setSig({ perturbations: [] })} type="button">Clear perturbations</button>
          </fieldset>
        </Panel>

        <div className="gc-stage">
          {sig.phase === "acute" ? <StepControls locked={false} max={sys.steps} onStep={setStep} player={player} step={sig.step} unit="Event" extra={<button className="secondary-button" data-testid="replay" onClick={() => { setStep(0); }} type="button">Reset to resting</button>} /> : null}
          <div aria-live="polite" className="bio-caption" data-testid="step-caption"><h3>{caption.title}</h3><p>{caption.text}</p></div>
          <DiagramFrame
            caption="Symbols and words, not colour alone: ● ON, ○ off, ✕ BLOCKED (hatched, dashed), ◐ ATTENUATED, ↻ PERSISTING. Green arrows are active links; ⊣ bars are inhibition (red), termination (purple) or feedback (orange)."
            label="Signalling pathway diagram" title={sys.label}
          >
            {narrow ? <SignalingCards ev={ev} onSelect={select} selected={raw.selected} system={sys} /> : <SignalingDiagram ev={ev} onSelect={select} selected={raw.selected} system={sys} />}
          </DiagramFrame>
          <KeyFigures items={figures} />
          {ac && sig.phase !== "removed" ? <p className="bio-note" data-testid="ac-context">{AC_TEXT[ac]}</p> : null}

          {sel ? (
            <Panel subtitle="Component selected in the diagram." title={sel.label}>
              <dl className="bio-seqline" data-testid="component-detail">
                <dt>Kind</dt><dd>{sel.kind}</dd>
                <dt>Where</dt><dd>{sel.where}</dd>
                <dt>Role</dt><dd>{sel.role}</dd>
                <dt>State now</dt><dd>{nodeStateText(sys, sel.id, ev)}</dd>
                {sel.kind !== "terminator" ? <><dt>Mechanism</dt><dd>{sel.mechanism}</dd><dt>Amplifies?</dt><dd>{sel.amplifies ? "Can amplify: one active molecule can act on many targets (factor not modelled)." : "Not a recognised amplification step in this model."}</dd></> : null}
              </dl>
              <button className="ghost-button" onClick={() => select(null)} type="button">Clear selection</button>
            </Panel>
          ) : <p className="bio-note">Select a component (click, or Tab then Enter) to see its state, location and role.</p>}

          {mode === "explore" ? (
            <>
              <Panel subtitle={`${activeCount} component${activeCount === 1 ? "" : "s"} on in this view.`} title="Effect of the perturbations">
                {sig.perturbations.length === 0 ? <p>No perturbation applied. Add an inhibitor or a mutation to see what changes compared with the normal pathway.</p> : (
                  <>
                    <ul className="gc-assumptions" data-testid="effects">{eff.statements.map((s) => <li key={s}>{s}</li>)}</ul>
                    <Callout tone="info" title="What is and is not predicted"><p>{eff.uncertain}</p></Callout>
                  </>
                )}
              </Panel>
              <Panel subtitle="How the signal ends." title="Amplification and termination">
                <p>{AMPLIFICATION_NOTE}</p>
                <ul className="gc-assumptions" data-testid="termination">{TERMINATION_SUMMARY[sig.system].map((t) => <li key={t}>{t}</li>)}</ul>
              </Panel>
              {sig.system === "gs" || sig.system === "gi" ? (
                <Disclosure summary="Not every GPCR raises cAMP">
                  <p>Gs-coupled receptors stimulate adenylyl cyclase, Gi-coupled receptors inhibit it, and Gq-coupled receptors act through phospholipase C and IP₃/DAG instead. The same transmitter (for example epinephrine) can do different things at different receptor subtypes.</p>
                </Disclosure>
              ) : null}
              {sig.system === "lgic" && onNavigate ? <p className="c23-note">See what the resulting current does to a neuron: <button className="ghost-button" onClick={() => onNavigate("bioNeuron")} type="button">open Neuronal physiology</button></p> : null}
              {(sig.system === "rtk" || sig.system === "nuclear") && onNavigate ? <p className="c23-note">Where these signals end up: <button className="ghost-button" onClick={() => onNavigate("bioRegulation")} type="button">open Gene regulation</button></p> : null}
            </>
          ) : null}
          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" ? (
            challenge ? <PredictPanel finished={false} onReveal={applyChallenge} question={challenge.question} revealLabel={`Apply: ${challenge.label}`} subtitle="Commit to a prediction first; the perturbation is applied to the diagram afterwards." /> : <Callout tone="info" title="Nothing to predict"><p>No challenge is available for this pathway.</p></Callout>
          ) : null}
        </div>
      </div>
      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{SIGNALING_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}<li>{sys.limits}</li></ul>
      </Panel>
      <RelatedConcepts subject="biology" toolId="bioSignaling" />
    </div>
  );
}
