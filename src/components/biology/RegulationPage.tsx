import { useMemo, useState, type ReactNode } from "react";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { PredictPanel, QuizPanel, StepControls } from "./bioShared";
import { useStepPlayer } from "./bioHooks";
import { EukDiagram, LacDiagram, TrpDiagram } from "./RegulationDiagrams";
import {
  EUK_STEPS, LAC_MUTATIONS, LAC_STEPS, TRP_LEADER_PEPTIDE, TRP_STEPS, WILD_LAC, eukComponents, eukStepCaption, evaluateEuk, evaluateLac, evaluateTrp, lacCisTrans, lacComponents, lacStepCaption, trpComponents, trpStep,
  type ComponentInfo, type EukInput, type LacCopy, type LacInput, type RegSystem, type TrpInput,
} from "../../utils/biology/geneRegulation";
import { eukChallenge, eukQuestions, lacChallenge, lacQuestions, trpChallenge, trpQuestions } from "../../utils/biology/bioLearning16";
import { REGULATION_ASSUMPTIONS, summarizeRegulation } from "../../utils/biology/bioSummary16";
import {
  DEFAULT_REGULATION_INPUTS, REGULATION_ENGINE_VERSION, describeRegulationAnalysis, validateRegulationInputs, type RegulationInputs,
} from "../../utils/persistence/biologyTools16";
import { validateBiologyResults } from "../../utils/persistence/biologyTools";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

const SYSTEMS: Array<{ id: RegSystem; label: string }> = [{ id: "lac", label: "lac operon" }, { id: "trp", label: "trp operon" }, { id: "euk", label: "Eukaryotic gene" }];

function Check({ label, checked, onChange, id }: { label: string; checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return <label className="bio-check"><input checked={checked} data-testid={id} onChange={(e) => onChange(e.target.checked)} type="checkbox" /> {label}</label>;
}
function Sel<T extends string>({ label, value, options, onChange, id }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void; id: string }) {
  return (
    <label className="bio-select-row">
      <span>{label}</span>
      <select aria-label={label} data-testid={id} onChange={(e) => onChange(e.target.value as T)} value={value}>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
    </label>
  );
}

export default function RegulationPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<RegulationInputs>({
    page: "regulation",
    engineVersion: REGULATION_ENGINE_VERSION,
    defaults: DEFAULT_REGULATION_INPUTS,
    validateInputs: validateRegulationInputs,
    validateResults: validateBiologyResults,
    summarize: summarizeRegulation,
    describe: describeRegulationAnalysis,
    fallbackName: "Gene regulation",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  const { system, mode } = raw;
  const [revealed, setRevealed] = useState(false);
  const hide = mode === "practice" && !revealed;

  const setLac = (patch: Partial<LacInput>) => update((c) => ({ ...c, lac: { ...c.lac, ...patch } }));
  const setCopy = (i: number, patch: Partial<LacCopy>) => update((c) => ({ ...c, lac: { ...c.lac, copies: c.lac.copies.map((x, k) => (k === i ? { ...x, ...patch } : x)) } }));
  const setTrp = (patch: Partial<TrpInput>) => update((c) => ({ ...c, trp: { ...c.trp, ...patch } }));
  const setEuk = (patch: Partial<EukInput>) => update((c) => ({ ...c, euk: { ...c.euk, ...patch } }));
  const select = (id: string | null) => update((c) => ({ ...c, selected: id }));

  const cur = system === "lac" ? raw.lac : system === "trp" ? raw.trp : raw.euk;
  const max = (system === "lac" ? LAC_STEPS : system === "trp" ? TRP_STEPS : EUK_STEPS) - 1;
  const step = cur.step;
  const setStep = (n: number) => update((c) => (c[c.system].step === n ? c : { ...c, [c.system]: { ...c[c.system], step: n } }));
  const player = useStepPlayer(step, max, setStep);
  const setSystem = (s: RegSystem) => { player.pause(); setRevealed(false); update((c) => ({ ...c, system: s, selected: null })); };

  const lacEv = useMemo(() => evaluateLac(raw.lac), [raw.lac]);
  const trpEv = useMemo(() => evaluateTrp(raw.trp), [raw.trp]);
  const eukEv = useMemo(() => evaluateEuk(raw.euk), [raw.euk]);
  const comps: ComponentInfo[] = useMemo(() => (system === "lac" ? lacComponents(raw.lac) : system === "trp" ? trpComponents(raw.trp) : eukComponents(raw.euk)), [system, raw.lac, raw.trp, raw.euk]);
  const selectedInfo = comps.find((c) => c.id === raw.selected) ?? null;
  const caption = system === "lac" ? lacStepCaption(raw.lac, step) : system === "trp" ? (() => { const s = trpStep(raw.trp, step); return { title: s.title, text: s.text }; })() : eukStepCaption(raw.euk, step);
  const questions = useMemo(() => (system === "lac" ? lacQuestions(raw.lac) : system === "trp" ? trpQuestions(raw.trp) : eukQuestions(raw.euk)), [system, raw.lac, raw.trp, raw.euk]);
  const lacCh = useMemo(() => lacChallenge(raw.lac, raw.challenge), [raw.lac, raw.challenge]);
  const trpCh = useMemo(() => trpChallenge(raw.trp, raw.challenge), [raw.trp, raw.challenge]);
  const eukCh = useMemo(() => eukChallenge(raw.euk, raw.challenge), [raw.euk, raw.challenge]);
  const ch = system === "lac" ? lacCh : system === "trp" ? trpCh : eukCh;
  const applyChallenge = () => {
    if (!ch) return;
    update((c) => ({ ...c, [c.system]: ch.change.next, challenge: c.challenge + 1, selected: null }));
  };
  const reasons = system === "lac" ? lacEv.reasons : system === "trp" ? trpEv.reasons : eukEv.reasons;
  const levelLabel = system === "lac" ? lacEv.transcription.label : system === "trp" ? trpEv.level.label : eukEv.level.label;

  const figures = system === "lac"
    ? [{ label: "Repressor", value: lacEv.repressor === "none" ? "absent" : lacEv.repressor === "uninducible" ? "uninducible" : lacEv.copies.some((c) => c.repressorBound) ? "on operator" : "released" }, { label: "cAMP–CRP", value: lacEv.crpActive ? "bound" : "not bound" }, { label: "lacZYA transcription", value: lacEv.transcription.label }, { label: "β-galactosidase", value: lacEv.enzyme.label }]
    : system === "trp"
      ? [{ label: "Operator", value: trpEv.operator }, { label: "Leader", value: trpEv.scenario === "no-ribosome" ? "no ribosome" : trpEv.scenario }, { label: "Terminator", value: trpEv.readthrough === 0 ? "forms" : trpEv.readthrough === 2 ? "does not form" : "forms in some" }, { label: "Expression", value: trpEv.level.label }]
      : [{ label: "Chromatin", value: eukEv.chromatin }, { label: "Pol II", value: eukEv.polII }, { label: "Prediction", value: eukEv.level.label }];

  let inputs: ReactNode;
  if (system === "lac") {
    inputs = (
      <>
        <Check checked={raw.lac.lactose} id="lactose" label="Lactose present" onChange={(v) => setLac({ lactose: v })} />
        <Check checked={raw.lac.glucose} id="glucose" label="Glucose present" onChange={(v) => setLac({ glucose: v })} />
        <Check checked={raw.lac.crp === "+"} id="crp-ok" label="cAMP–CRP system functional" onChange={(v) => setLac({ crp: v ? "+" : "-" })} />
        <Check checked={raw.lac.copies.length === 2} id="second-copy" label="Add a second copy of the operon (F′ plasmid)" onChange={(v) => setLac({ copies: v ? [raw.lac.copies[0], { ...WILD_LAC }] : [raw.lac.copies[0]] })} />
        {raw.lac.copies.map((copy, i) => (
          <fieldset className="bio-genotype" key={i}>
            <legend>{raw.lac.copies.length > 1 ? (i === 0 ? "Chromosome" : "F′ plasmid") : "Operon"}</legend>
            <Sel id={`preset-${i}`} label="Preset" onChange={(id) => { const m = LAC_MUTATIONS.find((x) => x.id === id)!; setCopy(i, { ...WILD_LAC, ...m.set }); }} options={LAC_MUTATIONS.map((m): [string, string] => [m.id, m.label])} value={LAC_MUTATIONS.find((m) => Object.entries(m.set).every(([k, v]) => copy[k as keyof LacCopy] === v) && Object.keys(WILD_LAC).every((k) => (k in m.set ? true : copy[k as keyof LacCopy] === WILD_LAC[k as keyof LacCopy])))?.id ?? "wt"} />
            <Sel id={`lacI-${i}`} label="lacI (repressor gene)" onChange={(v) => setCopy(i, { I: v })} options={[["+", "lacI⁺ wild type"], ["-", "lacI⁻ no repressor"], ["s", "lacIˢ uninducible"]]} value={copy.I} />
            <Sel id={`lacO-${i}`} label="Operator" onChange={(v) => setCopy(i, { O: v })} options={[["+", "lacO⁺ wild type"], ["c", "lacOᶜ constitutive"]]} value={copy.O} />
            <Sel id={`lacP-${i}`} label="Promoter" onChange={(v) => setCopy(i, { P: v })} options={[["+", "lacP⁺ wild type"], ["-", "lacP⁻ defective"]]} value={copy.P} />
            <Sel id={`lacZ-${i}`} label="lacZ" onChange={(v) => setCopy(i, { Z: v })} options={[["+", "lacZ⁺ wild type"], ["-", "lacZ⁻ defective"]]} value={copy.Z} />
          </fieldset>
        ))}
      </>
    );
  } else if (system === "trp") {
    inputs = (
      <>
        <Segmented<"low" | "moderate" | "high"> label="Tryptophan available" onChange={(trp) => setTrp({ trp })} options={[{ id: "low", label: "Low" }, { id: "moderate", label: "Moderate" }, { id: "high", label: "High" }]} value={raw.trp.trp} />
        <Sel id="trpR" label="trpR (repressor gene)" onChange={(v) => setTrp({ repressor: v })} options={[["+", "trpR⁺ wild type"], ["-", "trpR⁻ lost"]]} value={raw.trp.repressor} />
        <Sel id="trpO" label="Operator" onChange={(v) => setTrp({ operator: v })} options={[["+", "wild type"], ["-", "mutated (no binding)"]]} value={raw.trp.operator} />
        <Sel id="leaderStart" label="Leader start codon" onChange={(v) => setTrp({ leaderStart: v })} options={[["+", "intact AUG"], ["-", "lost"]]} value={raw.trp.leaderStart} />
        <Sel id="trpCodons" label="Two Trp codons in the leader" onChange={(v) => setTrp({ trpCodons: v })} options={[["+", "intact (UGG UGG)"], ["-", "replaced by non-Trp codons"]]} value={raw.trp.trpCodons} />
        <Sel id="attenuator" label="Attenuator (region 4)" onChange={(v) => setTrp({ attenuator: v })} options={[["+", "intact"], ["-", "deleted"]]} value={raw.trp.attenuator} />
      </>
    );
  } else {
    inputs = (
      <>
        <fieldset className="bio-genotype">
          <legend>Cis-acting DNA elements (this chromosome)</legend>
          <Sel id="enhancer" label="Enhancer" onChange={(v) => setEuk({ enhancer: v })} options={[["present", "present"], ["mutated", "binding sites mutated"], ["absent", "absent"]]} value={raw.euk.enhancer} />
          <Sel id="orientation" label="Enhancer orientation" onChange={(v) => setEuk({ enhancerOrientation: v })} options={[["forward", "forward →"], ["reverse", "reversed ←"]]} value={raw.euk.enhancerOrientation} />
          <Sel id="distance" label="Enhancer distance" onChange={(v) => setEuk({ enhancerDistance: v })} options={[["near", "near the promoter"], ["far", "far from the promoter"]]} value={raw.euk.enhancerDistance} />
          <Sel id="silencer" label="Silencer" onChange={(v) => setEuk({ silencer: v })} options={[["absent", "absent"], ["present", "present"]]} value={raw.euk.silencer} />
          <Sel id="promoter" label="Core promoter" onChange={(v) => setEuk({ promoter: v })} options={[["intact", "TATA box intact"], ["TATA-mutated", "TATA box mutated"]]} value={raw.euk.promoter} />
        </fieldset>
        <fieldset className="bio-genotype">
          <legend>Trans-acting factors (this cell type)</legend>
          <Check checked={raw.euk.activator} id="activator" label="Activator transcription factor present" onChange={(v) => setEuk({ activator: v })} />
          <Check checked={raw.euk.repressor} id="repressor" label="Repressor transcription factor present" onChange={(v) => setEuk({ repressor: v })} />
          <Check checked={raw.euk.mediator} id="mediator" label="Mediator available" onChange={(v) => setEuk({ mediator: v })} />
        </fieldset>
        <fieldset className="bio-genotype">
          <legend>Epigenetic marks</legend>
          <Check checked={raw.euk.acetylation} id="acetylation" label="Histone acetylation" onChange={(v) => setEuk({ acetylation: v })} />
          <Check checked={raw.euk.methylation} id="methylation" label="Promoter DNA methylation" onChange={(v) => setEuk({ methylation: v })} />
        </fieldset>
      </>
    );
  }

  const diagram = system === "lac"
    ? <LacDiagram hideLabels={hide} input={raw.lac} onSelect={select} selected={raw.selected} />
    : system === "trp" ? <TrpDiagram hideLabels={hide} input={raw.trp} onSelect={select} selected={raw.selected} /> : <EukDiagram hideLabels={hide} input={raw.euk} onSelect={select} selected={raw.selected} />;

  const ct = system === "lac" ? (["I-", "Is", "Oc", "P-"] as const).map((k) => ({ k, ...lacCisTrans(k) })) : null;

  return (
    <div className="gc-page ph-page bio-page">
      <ToolHeader
        group="Gene expression"
        title="Gene regulation"
        purpose="Change the conditions or mutate a regulatory element and see which proteins bind, which RNA structures form and what happens to transcription. Expression is shown as a qualitative level, never as an invented rate."
        evidence="model"
        steps={[
          { label: "Pick a system", detail: "lac operon, trp operon or a eukaryotic gene." },
          { label: "Change conditions or mutate", detail: "Select components to see cis versus trans." },
          { label: "Predict, then check", detail: "Increase, decrease or uncertain?" },
        ]}
        aside={<Badge tone="neutral" title="Ordinal model levels, not measured rates.">Qualitative levels</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { setRevealed(false); player.pause(); update((c) => ({ ...c, mode: m })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Choose the system, then set the conditions and genotype." title="System and conditions">
          <Segmented<RegSystem> label="System" onChange={setSystem} options={SYSTEMS.map((s) => ({ id: s.id, label: s.label }))} value={system} />
          {inputs}
        </Panel>

        <div className="gc-stage">
          <StepControls extra={mode === "practice" ? <button className="secondary-button" data-testid="reveal-btn" onClick={() => setRevealed((x) => !x)} type="button">{revealed ? "Hide labels" : "Reveal labels"}</button> : null} locked={false} max={max} onStep={setStep} player={player} step={step} unit="Event" />
          <div aria-live="polite" className="bio-caption" data-testid="step-caption"><h3>{caption.title}</h3><p>{caption.text}</p></div>
          <DiagramFrame
            caption="Rectangles are DNA elements (cis-acting); ellipses and rounded boxes are proteins and machines (trans-acting); diamonds are small molecules; wavy lines are RNA. Select any element to read its role."
            label="Regulatory diagram"
            title={system === "lac" ? "The lac operon" : system === "trp" ? "The trp operon: repression and attenuation" : "A eukaryotic gene and its regulatory elements"}
          >
            {diagram}
          </DiagramFrame>
          <KeyFigures items={figures} />

          {selectedInfo ? (
            <Panel subtitle="Component selected in the diagram." title={selectedInfo.label}>
              <dl className="bio-seqline" data-testid="component-detail">
                <dt>Kind</dt><dd>{selectedInfo.kind}</dd>
                <dt>Role</dt><dd>{selectedInfo.role}</dd>
                <dt>Right now</dt><dd>{selectedInfo.state}</dd>
                <dt>If mutated</dt><dd>{selectedInfo.mutation}</dd>
              </dl>
              <button className="ghost-button" onClick={() => select(null)} type="button">Clear selection</button>
            </Panel>
          ) : <p className="bio-note">Select a component in the diagram (click, or Tab then Enter) to see what it is, its current state and whether it acts in cis or in trans.</p>}

          {mode === "explore" ? (
            <Panel subtitle="Each line follows from the state on the left." title="What the model says">
              <ul className="gc-assumptions" data-testid="reasons">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              <p><strong>Result:</strong> {levelLabel}</p>
              {system === "lac" ? (
                <>
                  <Disclosure defaultOpen summary="Why lactose and glucose act differently">
                    <p>Lactose controls the repressor: with no lactose the repressor sits on the operator and blocks the polymerase (negative control, lifted by the inducer allolactose). Glucose controls cAMP–CRP: with glucose, cAMP is low, CRP does not bind and the weak promoter is poorly used (positive control, absent). Both conditions are needed for high expression: the repressor must be off AND cAMP–CRP on.</p>
                    <ul className="gc-assumptions">
                      <li>Lactose, no glucose: high.</li><li>Lactose and glucose: low (the brake is off, but the accelerator is off too).</li><li>No lactose: basal (leaky) whatever the glucose level, because the repressor is on the operator.</li>
                    </ul>
                  </Disclosure>
                  <Disclosure summary="Cis or trans? Test a mutation with a second copy">
                    <p>A cis-acting mutation changes only the genes on the same DNA molecule; a trans-acting one changes a diffusible product that acts on every copy. The verdicts below come from putting each mutation on one molecule, with a lacZ⁺ reporter, in a cell that also has a wild-type copy.</p>
                    <table className="bio-dist" data-testid="cis-trans-table"><thead><tr><th scope="col">Mutation</th><th scope="col">Verdict</th></tr></thead><tbody>{ct!.map((x) => <tr key={x.k}><th scope="row">{x.k === "I-" ? "lacI⁻" : x.k === "Is" ? "lacIˢ" : x.k === "Oc" ? "lacOᶜ" : "lacP⁻"}</th><td>{x.verdict}</td></tr>)}</tbody></table>
                  </Disclosure>
                </>
              ) : null}
              {system === "trp" ? (
                <>
                  <Disclosure defaultOpen summary="Repression versus attenuation">
                    <p><strong>Repression</strong> is a protein at the operator deciding whether transcription starts. <strong>Attenuation</strong> is not an operator-binding event: while the leader RNA is still being made, a ribosome translates the leader peptide ({TRP_LEADER_PEPTIDE}), and its position decides whether region 3 pairs with region 2 (antiterminator, transcription continues) or with region 4 (terminator, transcription stops). Try the repressor-deletion and attenuator-deletion cases: each removes only one of the two controls.</p>
                  </Disclosure>
                  <Disclosure summary="Why the ribosome position matters">
                    <p>At low tryptophan the ribosome stalls on the two Trp codons in region 1, so region 2 is free to pair with region 3. At high tryptophan it continues to the stop codon, covering region 2, so region 3 pairs with region 4 and the terminator forms. The leader here is a schematic sequence; its pairing is checked by base complementarity.</p>
                  </Disclosure>
                </>
              ) : null}
              {system === "euk" ? (
                <Disclosure defaultOpen summary="Context dependence">
                  <p>Real regulatory elements and marks do not have universal effects. An enhancer works only if its activator is present and the chromatin is accessible; acetylation and methylation are usually activating and repressive respectively, but together or at other sites their effect depends on the gene and cell type. This model therefore reports <em>uncertain</em> when signals conflict, and it does not predict the effect of an arbitrary sequence.</p>
                </Disclosure>
              ) : null}
            </Panel>
          ) : null}

          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" ? (
            ch ? <PredictPanel finished={false} onReveal={applyChallenge} question={ch.question} revealLabel="Apply the change and show the result" subtitle="Commit to a prediction first; the change is applied to the diagram afterwards." /> : <Callout tone="info" title="Nothing to predict"><p>No further changes are available for this state.</p></Callout>
          ) : null}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{REGULATION_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
    </div>
  );
}
