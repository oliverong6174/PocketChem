import { useMemo, useState } from "react";
import { ProvenancePanel } from "./ProvenancePanel";
import { LearningModeSwitch } from "../../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../../ui/primitives";
import { useGcWorkspace } from "../../generalChem/useGcWorkspace";
import { QuizPanel, StepControls } from "../../biology/bioShared";
import { useStepPlayer } from "../../biology/bioHooks";
import { MitoDiagram } from "./MitoDiagram";
import { AssumptionsPanel, ChallengePanel, ScrollBox } from "./shared";
import {
  CARRIER_LABEL, COMPLEXES, CONDITIONS, CONDITIONS_BY_ID, DONORS, ETC_ASSUMPTIONS, atpEstimate, etcOutcome, protonsPerPair, type CarrierId, type Donor, type Level,
} from "../../../utils/biochem/metabolism/etc";
import { OXPHOS_ASSUMPTIONS, SHUTTLES, glucoseLedger, type Shuttle } from "../../../utils/biochem/metabolism/ledger";
import { etcChallenges, etcQuestions } from "../../../utils/biochem/metabolism/learning";
import {
  DEFAULT_ETC_INPUTS, ETC_ENGINE_VERSION, ETC_VIEWS, METABOLIC_ASSUMPTIONS, describeEtcAnalysis, summarizeEtc, validateEtcInputs, type DonorChoice, type EtcInputs, type EtcView,
} from "../../../utils/persistence/biochemTools18";
import { validateBiologyResults } from "../../../utils/persistence/biologyTools";
import "../../../styles/biochemistry.css";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };
const VIEW_LABEL: Record<EtcView, string> = { chain: "Electron transport", inhibitors: "Inhibitors and uncouplers", yield: "ATP yield" };
const GLYPH: Record<Level, string> = { stops: "✖ stops", falls: "▼ falls", normal: "■ normal", rises: "▲ rises" };
const GRAD: Record<string, string> = { collapses: "✖ collapses", lower: "▼ lower", normal: "■ normal", higher: "▲ higher" };
const toneOf = (l: Level) => (l === "normal" ? "ok" : l === "rises" ? "info" : "warn") as "ok" | "info" | "warn";
const donorsOf = (c: DonorChoice): Donor[] => (c === "both" ? ["nadh", "succinate"] : [c]);

export default function ElectronTransportPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<EtcInputs>({
    page: "etc", engineVersion: ETC_ENGINE_VERSION, defaults: DEFAULT_ETC_INPUTS, validateInputs: validateEtcInputs, validateResults: validateBiologyResults,
    summarize: summarizeEtc, describe: describeEtcAnalysis, fallbackName: "Electron transport & oxidative phosphorylation", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const set = (patch: Partial<EtcInputs>) => update((c) => ({ ...c, ...patch }));
  const { mode, view, step } = raw;
  const donors = donorsOf(raw.donor);
  const [revealed, setRevealed] = useState(false);
  const [sel, setSel] = useState<CarrierId | "ATPSYN" | null>(null);
  const hide = mode === "practice" && !revealed;
  const longest = Math.max(...donors.map((d) => DONORS[d].path.length));
  const setStep = (n: number) => update((c) => (c.step === n ? c : { ...c, step: n }));
  const player = useStepPlayer(step, longest, setStep);
  const outcome = useMemo(() => etcOutcome(donors, raw.condition), [raw.donor, raw.condition]); // eslint-disable-line react-hooks/exhaustive-deps
  const cond = CONDITIONS_BY_ID[raw.condition];
  const questions = useMemo(() => etcQuestions(), []);
  const challenges = useMemo(() => etcChallenges(), []);
  const g = glucoseLedger(raw.shuttle);
  const pumped = outcome.donors.filter((d) => d.flows).reduce((s, d) => s + d.protonsPerPair, 0);
  const complexInfo = sel === "ATPSYN" ? null : sel && sel in COMPLEXES ? COMPLEXES[sel as keyof typeof COMPLEXES] : null;

  return (
    <div className="gc-page ph-page bio-page bc-page">
      <ToolHeader
        group="Metabolism"
        title="Electron transport & oxidative phosphorylation"
        purpose="Follow electrons from NADH or succinate through complexes I to IV to oxygen, count the protons pumped, and see how ATP synthase uses the gradient. Compare NADH with FADH₂ entry, then test inhibitors, an uncoupler and low oxygen."
        evidence="estimate"
        steps={[
          { label: "Pick a donor", detail: "NADH enters at complex I, succinate at complex II." },
          { label: "Trace the electrons", detail: "Step along the carriers; watch H⁺ pumping." },
          { label: "Apply a condition", detail: "Inhibitor, uncoupler or low O₂." },
        ]}
        aside={<Badge tone="neutral" title="Qualitative gradient; ATP counts are estimates">Estimates, not measurements</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { setRevealed(false); player.pause(); update((c) => ({ ...c, mode: m })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="bc-views"><Segmented<EtcView> label="View" onChange={(v) => { player.pause(); set({ view: v }); }} options={ETC_VIEWS.map((v) => ({ id: v, label: VIEW_LABEL[v] }))} value={view} /></div>

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Choose the electron donor, move along the chain, apply a condition." title="Controls">
          <Segmented<DonorChoice> label="Electron donor" onChange={(d) => update((c) => ({ ...c, donor: d, step: Math.min(c.step, Math.max(...donorsOf(d).map((x) => DONORS[x].path.length))) }))} options={[{ id: "nadh", label: "NADH" }, { id: "succinate", label: "Succinate (FADH₂)" }, { id: "both", label: "Both" }]} value={raw.donor} />
          {view !== "yield" ? (
            <StepControls extra={mode === "practice" ? <button className="secondary-button" data-testid="reveal-labels" onClick={() => setRevealed((r) => !r)} type="button">{revealed ? "Hide labels" : "Reveal labels"}</button> : null} locked={mode === "challenge"} max={longest} onStep={setStep} player={player} step={step} unit="Carrier" />
          ) : null}
          {view !== "yield" ? (
            <label className="bc-select">Condition
              <select data-testid="condition-select" onChange={(e) => set({ condition: e.target.value })} value={raw.condition}>
                {CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
          ) : (
            <Segmented<Shuttle> label="Glycolytic NADH enters by" onChange={(s) => set({ shuttle: s })} options={(Object.keys(SHUTTLES) as Shuttle[]).map((s) => ({ id: s, label: SHUTTLES[s].label }))} value={raw.shuttle} />
          )}
          <Callout tone="info" title="Complex II pumps no protons"><p>Electrons from succinate (FADH₂) bypass complex I, so about {protonsPerPair("succinate")} H⁺ are pumped per electron pair instead of about {protonsPerPair("nadh")}.</p></Callout>
        </Panel>

        <div className="gc-stage">
          {view !== "yield" ? (
            <>
              <div aria-live="polite" className="mt-caption" data-testid="step-caption">
                <h3>{cond.title}</h3>
                <p>{cond.text}{cond.kind !== "control" ? ` Agent: ${cond.agent}.` : ""}</p>
                <p className="mt-chips"><span className="ph-note">Now:</span> <span className="mt-chip mt-chip-none" data-testid="flow-electron">Electron flow {GLYPH[outcome.electronFlow]}</span> <span className="mt-chip mt-chip-none" data-testid="flow-o2">O₂ use {GLYPH[outcome.oxygenUse]}</span> <span className="mt-chip mt-chip-none" data-testid="flow-gradient">H⁺ gradient {GRAD[outcome.gradient]}</span> <span className="mt-chip mt-chip-none" data-testid="flow-atp">ATP synthesis {GLYPH[outcome.atpSynthesis]}</span></p>
              </div>
              <DiagramFrame caption="Inner mitochondrial membrane: electrons (blue) move along the donor's real path; protons (red) are pumped by complexes I, III and IV only. The dots show a relative, qualitative proton level, not a concentration." label="Electron transport chain diagram" title="Respiratory chain">
                <ScrollBox focusKey={sel}><MitoDiagram condition={raw.condition} donors={donors} hideNames={hide} onSelect={setSel} outcome={outcome} selected={sel} step={step} /></ScrollBox>
                <ul className="mt-legend" aria-label="Legend"><li><i style={{ color: "#1d4ed8" }} />Electrons</li><li><i style={{ color: "#be123c" }} />Protons (H⁺)</li><li>✖ marks a blocked complex</li></ul>
              </DiagramFrame>
              {sel ? (
                <div className="mt-card" data-testid="complex-card">
                  {sel === "ATPSYN" ? (
                    <>
                      <h3>ATP synthase (complex V)</h3>
                      <p>Protons flow back down their gradient through the F₀ rotor in the membrane; the rotation drives conformational changes in the F₁ head that join ADP and Pi to make ATP. About {OXPHOS_ASSUMPTIONS.protonsPerAtp} H⁺ per ATP including phosphate transport is assumed here (an approximation).</p>
                    </>
                  ) : complexInfo ? (
                    <><h3>{complexInfo.name}</h3><p>{complexInfo.text}</p><p><strong>Protons pumped per electron pair:</strong> {complexInfo.protonsPerPair}</p></>
                  ) : (
                    <><h3>{CARRIER_LABEL[sel]}</h3><p>{sel === "Q" ? "Ubiquinone dissolves in the membrane lipid and carries electron pairs from complexes I and II to complex III (as QH₂)." : sel === "cytc" ? "Cytochrome c is a small heme protein in the intermembrane space that carries one electron at a time from complex III to complex IV." : "Electron carrier."}</p></>
                  )}
                </div>
              ) : <Callout tone="info" title="Inspect a part"><p>Select a complex, coenzyme Q, cytochrome c or ATP synthase in the diagram.</p></Callout>}
              <KeyFigures items={[
                { label: "H⁺ pumped per electron pair", value: String(pumped), note: outcome.donors.map((d) => `${DONORS[d.donor].short} ${d.flows ? d.protonsPerPair : "blocked"}`).join(" · ") },
                { label: "Estimated ATP per pair", value: outcome.donors.filter((d) => d.flows).map((d) => atpEstimate(d.donor)).join(" + ") || "0", note: `estimate: H⁺ ÷ ${OXPHOS_ASSUMPTIONS.protonsPerAtp}` },
              ]} />
              {view === "inhibitors" ? (
                <>
                  <Panel subtitle="Directions come from the chain's topology and stated rules; they are not rates." title="What changes">
                    <table className="bc-table" data-testid="outcome-table">
                      <thead><tr><th scope="col">Quantity</th><th scope="col">Direction</th></tr></thead>
                      <tbody>
                        <tr><th scope="row">Electron transport</th><td><Badge tone={toneOf(outcome.electronFlow)}>{GLYPH[outcome.electronFlow]}</Badge></td></tr>
                        <tr><th scope="row">Oxygen consumption</th><td><Badge tone={toneOf(outcome.oxygenUse)}>{GLYPH[outcome.oxygenUse]}</Badge></td></tr>
                        <tr><th scope="row">Proton pumping</th><td><Badge tone={toneOf(outcome.protonPumping)}>{GLYPH[outcome.protonPumping]}</Badge></td></tr>
                        <tr><th scope="row">Proton-motive force (gradient)</th><td><Badge tone={outcome.gradient === "normal" ? "ok" : "warn"}>{GRAD[outcome.gradient]}</Badge></td></tr>
                        <tr><th scope="row">ATP synthesis</th><td><Badge tone={toneOf(outcome.atpSynthesis)}>{GLYPH[outcome.atpSynthesis]}</Badge></td></tr>
                        <tr><th scope="row">Heat</th><td><Badge tone={outcome.heat === "rises" ? "info" : "ok"}>{GLYPH[outcome.heat]}</Badge></td></tr>
                      </tbody>
                    </table>
                    <ul className="gc-assumptions" data-testid="outcome-explanation">{outcome.explanation.map((t) => <li key={t}>{t}</li>)}</ul>
                    {outcome.redox.length ? (
                      <p data-testid="redox">Redox state of carriers on the blocked route: {outcome.redox.map((r) => `${CARRIER_LABEL[r.carrier]} ${r.state}`).join(" · ")}.</p>
                    ) : null}
                  </Panel>
                  <Callout tone="warn" title="Not a cellular simulation"><p>These are qualitative outcomes for a schematic gradient. No oxygen-consumption rate, membrane potential or ATP rate is calculated, and real cells have additional controls (for example ATP-synthase reversal and other electron entry points) that are not modelled.</p></Callout>
                  {mode === "explore" ? (
                    <Panel title="Why does it behave this way?">
                      <Disclosure defaultOpen summary="Inhibitor versus uncoupler: why different?"><p>A respiratory-chain inhibitor stops electron flow, so O₂ consumption, proton pumping and ATP synthesis fall together. An uncoupler leaves electron flow intact but makes the membrane leaky, so the chain speeds up and O₂ consumption rises while the gradient and ATP synthesis fall, and the energy appears as heat.</p></Disclosure>
                      <Disclosure summary="Why does oligomycin slow electron transport?"><p>Blocking ATP synthase prevents protons from returning. The gradient rises, and a steep gradient opposes further proton pumping, so electron transport and O₂ use fall: this is respiratory control.</p></Disclosure>
                    </Panel>
                  ) : null}
                </>
              ) : mode === "explore" ? (
                <Panel title="Why does it behave this way?">
                  <Disclosure defaultOpen summary="Why does FADH₂ give less ATP than NADH?"><p>Succinate donates electrons at complex II, downstream of complex I. Complex II does not pump protons, so only complexes III and IV contribute: about {protonsPerPair("succinate")} H⁺ per electron pair instead of {protonsPerPair("nadh")}.</p></Disclosure>
                  <Disclosure summary="Where does the oxygen go?"><p>Complex IV passes four electrons from cytochrome c to O₂, which is reduced to two H₂O using protons from the matrix. Oxygen is the sink that keeps the chain oxidized and flowing.</p></Disclosure>
                </Panel>
              ) : null}
            </>
          ) : (
            <>
              <KeyFigures items={[
                { label: "ATP per NADH", value: String(atpEstimate("nadh")), note: `estimate: ${protonsPerPair("nadh")} H⁺ ÷ ${OXPHOS_ASSUMPTIONS.protonsPerAtp}` },
                { label: "ATP per FADH₂", value: String(atpEstimate("succinate")), note: `estimate: ${protonsPerPair("succinate")} H⁺ ÷ ${OXPHOS_ASSUMPTIONS.protonsPerAtp}` },
                { label: "ATP per glucose (estimate)", value: String(g.totalAtp), note: SHUTTLES[raw.shuttle].label },
              ]} />
              <Panel subtitle="One glucose, complete oxidation. Every figure is an estimate that depends on the assumptions below." title="Estimated ATP from one glucose">
                <table className="bc-table" data-testid="yield-table">
                  <thead><tr><th scope="col">Source</th><th scope="col">Carriers</th><th scope="col">ATP (estimate)</th></tr></thead>
                  <tbody>
                    <tr><th scope="row">Glycolysis, substrate-level</th><td>2 ATP</td><td>{g.substrateLevel.glycolysis}</td></tr>
                    <tr><th scope="row">Citric acid cycle, substrate-level</th><td>2 GTP</td><td>{g.substrateLevel.cycle}</td></tr>
                    <tr><th scope="row">Glycolytic NADH (cytosolic, via shuttle)</th><td>{g.cytosolicNadh} NADH</td><td>{g.oxidativeAtp.cytosolicNadh}</td></tr>
                    <tr><th scope="row">Matrix NADH (pyruvate oxidation + cycle)</th><td>{g.matrixNadh} NADH</td><td>{g.oxidativeAtp.matrixNadh}</td></tr>
                    <tr><th scope="row">FADH₂ (cycle)</th><td>{g.fadh2} FADH₂</td><td>{g.oxidativeAtp.fadh2}</td></tr>
                    <tr><th scope="row">Total (estimate)</th><td />  <td data-testid="atp-total">{g.totalAtp}</td></tr>
                  </tbody>
                </table>
                <p className="ph-note">{SHUTTLES[raw.shuttle].note}</p>
              </Panel>
              <Callout tone="warn" title="Not one fixed number"><p>The total depends on the shuttle used for glycolytic NADH, the H⁺ per ATP, proton leak and the cell type. Older textbooks gave 36–38; current estimates are about 30–32.</p></Callout>
            </>
          )}

          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" ? (
            <ChallengePanel items={challenges} index={raw.challenge} onNext={() => set({ challenge: raw.challenge + 1 })} onReveal={(p) => update((c) => ({ ...c, condition: p.condition, donor: p.donor, view: p.view, step: Math.max(...donorsOf(p.donor).map((x) => DONORS[x].path.length)) }))} />
          ) : null}
          <AssumptionsPanel items={[...ETC_ASSUMPTIONS, ...METABOLIC_ASSUMPTIONS.slice(0, 2)]} />
          <ProvenancePanel topics={["etc"]} />
        </div>
      </div>
    </div>
  );
}
