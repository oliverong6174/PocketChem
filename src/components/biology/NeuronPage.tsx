import { useMemo, useState } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { PredictPanel, QuizPanel, StepControls } from "./bioShared";
import { useNarrow, useStepPlayer } from "./bioHooks";
import { CheckRow, LogParam, Param, SelectRow } from "./cell23";
import { mv } from "./cellConst23";
import { ChannelDiagram, MsChart, NeuronAnatomy, PropagationDiagram, SynapseDiagram } from "./NeuronDiagrams";
import { VoltageLadder } from "./MembraneDiagrams";
import { SimControls } from "../physics/sim";
import { useSimClock } from "../physics/simHooks";
import { useSimTime } from "../physics/useSimTime";
import { rateForTransient, type SpeedChoice } from "../../utils/physics/simClock";
import { CONC_RANGE, IONS, TYPICAL_IONS } from "../../utils/biology/membrane23";
import {
  AP_PHASE_INFO, GHK_ASSUMPTIONS, HH, HH_LIMITS, MYELIN_EXPLANATION, NEURON_PARTS, PERTURBATIONS_SYN, PROPAGATION_LIMITS, REFRACTORY_NOTE, RESTING_NOTE, SUMMATION_ASSUMPTIONS, SYNAPSE_CONTEXT_NOTE, SYNAPSE_EXAMPLES, SYNAPSE_LIMITS, SYNAPSE_STEPS,
  analyzeHh, channelState, evaluateSummation, membraneTauMs, passiveVoltageMv, passiveTrace, postsynapticResponse, propagationMaxStep, propagationState, refractoryScan, regenerativeSites, restingPotential, simulateHh,
  steadyDeltaMv, stepFraction, synapseState, synapseStages, thresholdAmplitude, validateHh, validatePassiveMembrane, validateSummation, type PartId, type RefractoryPoint,
} from "../../utils/biology/neuron23";
import { neuronChallenge, neuronQuestions } from "../../utils/biology/bioLearning23";
import { NEURON_ASSUMPTIONS, describeNeuron, summarizeNeuron } from "../../utils/biology/bioSummary23";
import { DEFAULT_NEURON_INPUTS, NEURON_ENGINE_VERSION, NEURON_SECTIONS, validateNeuronInputs, type NeuronInputs, type NeuronSection } from "../../utils/persistence/biologyTools23";
import { validateBiologyResults } from "../../utils/persistence/biologyTools";
import { EvidencePanel } from "../ui/EvidencePanel";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void; onNavigate?: (id: "bioMembrane" | "bioSignaling") => void };
const SECTION_LABELS: Record<NeuronSection, string> = { anatomy: "Anatomy", resting: "Resting potential", passive: "Passive membrane", ap: "Action potential", propagation: "Propagation", synapse: "Synapse", summation: "Summation" };
const SPEEDS: SpeedChoice[] = ["quarter", "real", "fast"];
const SPEED_TEXT: Partial<Record<SpeedChoice, string>> = { quarter: "Slow 12 s", real: "Normal 6 s", fast: "Fast 3 s" };
const PHASE_BAND_LABEL = { depol: "stimulus", rising: "rising", repol: "repolarizing", ahp: "AHP", recovery: "recovery", rest: "" } as const;

export default function NeuronPage({ openRequest = null, onOpenHandled, onNavigate }: Props) {
  const ws = useGcWorkspace<NeuronInputs>({
    page: "neuron", engineVersion: NEURON_ENGINE_VERSION, defaults: DEFAULT_NEURON_INPUTS, validateInputs: validateNeuronInputs, validateResults: validateBiologyResults,
    summarize: summarizeNeuron, describe: describeNeuron, fallbackName: "Neuronal physiology", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const { section, mode } = raw;
  const narrow = useNarrow(600);
  const [speed, setSpeed] = useState<SpeedChoice>("real");
  const [thrAmp, setThrAmp] = useState<number | null | undefined>(undefined);
  const [refr, setRefr] = useState<RefractoryPoint[] | null>(null);

  const passiveCheck = validatePassiveMembrane(raw.passive), hhCheck = validateHh(raw.hh), sumCheck = validateSummation(raw.summation);
  const passiveEnd = passiveCheck.ok ? raw.passive.tMaxMs : 1;
  const hhEnd = hhCheck.ok ? raw.hh.durationMs : 1;
  const [tp, setTp] = useSimTime(raw.passiveTimeMs, passiveEnd, (v) => update((c) => (Object.is(c.passiveTimeMs, v) ? c : { ...c, passiveTimeMs: v })));
  const [th, setTh] = useSimTime(raw.hhTimeMs, hhEnd, (v) => update((c) => (Object.is(c.hhTimeMs, v) ? c : { ...c, hhTimeMs: v })));
  const clockP = useSimClock({ t: tp, tEnd: passiveEnd, rate: rateForTransient(speed, passiveEnd), onTime: (n, f) => setTp(n, f) });
  const clockH = useSimClock({ t: th, tEnd: hhEnd, rate: rateForTransient(speed, hhEnd), onTime: (n, f) => setTh(n, f) });

  const propMax = propagationMaxStep(raw.prop.myelinated);
  const setPropStep = (n: number) => update((c) => (c.prop.step === n ? c : { ...c, prop: { ...c.prop, step: n } }));
  const propPlayer = useStepPlayer(raw.prop.step, propMax, setPropStep);
  const setSynStep = (n: number) => update((c) => (c.synapse.step === n ? c : { ...c, synapse: { ...c.synapse, step: n } }));
  const synPlayer = useStepPlayer(raw.synapse.step, SYNAPSE_STEPS - 1, setSynStep);

  const pauseAll = () => { clockP.pause(); clockH.pause(); propPlayer.pause(); synPlayer.pause(); };
  const setSection = (s: NeuronSection) => { pauseAll(); update((c) => ({ ...c, section: s })); };
  const setRest = (p: Partial<NeuronInputs["resting"]>) => update((c) => ({ ...c, resting: { ...c.resting, ...p } }));
  const setRestConc = (id: "na" | "k" | "cl", side: "out" | "in", v: number) => update((c) => ({ ...c, resting: { ...c.resting, ions: { ...c.resting.ions, [id]: { ...c.resting.ions[id], [side]: v } } } }));
  const setPassive = (p: Partial<NeuronInputs["passive"]>) => update((c) => { const passive = { ...c.passive, ...p }; return { ...c, passive, summation: { ...c.summation, rMohm: passive.rMohm, cPf: passive.cPf, vRestMv: passive.vRestMv }, passiveTimeMs: Math.min(c.passiveTimeMs, passive.tMaxMs) }; });
  const setHh = (p: Partial<NeuronInputs["hh"]>) => { setThrAmp(undefined); setRefr(null); update((c) => { const hh = { ...c.hh, ...p }; return { ...c, hh, hhTimeMs: Math.min(c.hhTimeMs, hh.durationMs) }; }); };
  const setSyn = (p: Partial<NeuronInputs["synapse"]>) => update((c) => ({ ...c, synapse: { ...c.synapse, ...p } }));
  const setSum = (p: Partial<NeuronInputs["summation"]>) => update((c) => ({ ...c, summation: { ...c.summation, ...p } }));
  const setEvent = (i: number, p: Partial<{ tMs: number; ampMv: number }>) => setSum({ events: raw.summation.events.map((e, k) => (k === i ? { ...e, ...p } : e)) });

  const valid = ws.valid;
  const questions = useMemo(() => (valid ? neuronQuestions(valid) : []), [valid]);
  const challenge = useMemo(() => (valid ? neuronChallenge(valid, raw.challenge) : null), [valid, raw.challenge]);
  const applyChallenge = () => { if (challenge) update((c) => ({ ...challenge.next, challenge: c.challenge + 1 })); };

  const trace = useMemo(() => (hhCheck.ok ? simulateHh(raw.hh) : null), [hhCheck.ok, raw.hh]);
  const analysis = useMemo(() => (trace ? analyzeHh(trace) : null), [trace]);
  const hhIndex = trace ? Math.min(trace.t.length - 1, Math.round(th / (trace.dt * trace.every))) : 0;
  const resting = useMemo(() => restingPotential(raw.resting), [raw.resting]);

  let inputs: JSX.Element | null = null, main: JSX.Element | null = null, extra: JSX.Element | null = null, figures: Array<{ label: string; value: string; note?: string }> = [], steps: JSX.Element | null = null;

  if (section === "anatomy") {
    const part = NEURON_PARTS.find((p) => p.id === raw.part);
    inputs = (
      <div className="c23-chips" role="group" aria-label="Neuron parts">
        {NEURON_PARTS.map((p) => <button aria-pressed={raw.part === p.id} className={raw.part === p.id ? "primary-button" : "secondary-button"} data-testid={`part-${p.id}`} key={p.id} onClick={() => update((c) => ({ ...c, part: c.part === p.id ? null : p.id }))} type="button">{p.label}</button>)}
      </div>
    );
    main = <DiagramFrame caption="Select a part (click, Tab then Enter, or the buttons) to read what it does. The labels follow the direction of information flow." label="Neuron anatomy diagram" title="A neuron and a chemical synapse"><NeuronAnatomy onSelect={(id: PartId | null) => update((c) => ({ ...c, part: id }))} selected={raw.part} /></DiagramFrame>;
    extra = part ? (
      <Panel subtitle={`Stage: ${part.process}`} title={part.label}>
        <dl className="bio-seqline" data-testid="part-detail"><dt>Role</dt><dd>{part.role}</dd><dt>Note</dt><dd>{part.note}</dd></dl>
        <button className="ghost-button" onClick={() => update((c) => ({ ...c, part: null }))} type="button">Clear selection</button>
      </Panel>
    ) : <p className="bio-note">Select a part of the neuron to see its function.</p>;
  }

  if (section === "resting") {
    const r = resting;
    inputs = (
      <>
        {(["k", "na", "cl"] as const).map((id) => (
          <div className="c23-fieldset" key={id}>
            <LogParam hi={CONC_RANGE[1]} label={`Outside ${IONS[id].symbol}`} lo={CONC_RANGE[0]} onChange={(v) => setRestConc(id, "out", v)} unit="mM" value={raw.resting.ions[id].out} />
            <LogParam hi={CONC_RANGE[1]} label={`Inside ${IONS[id].symbol}`} lo={CONC_RANGE[0]} onChange={(v) => setRestConc(id, "in", v)} unit="mM" value={raw.resting.ions[id].in} />
          </div>
        ))}
        <Param format={(v) => `${v}`} label="Relative P(K⁺)" max={2} min={0} onChange={(v) => setRest({ perms: { ...raw.resting.perms, k: v } })} step={0.01} testId="rest-pk" unit="" value={raw.resting.perms.k} />
        <Param format={(v) => `${v}`} label="Relative P(Na⁺)" max={2} min={0} onChange={(v) => setRest({ perms: { ...raw.resting.perms, na: v } })} step={0.01} testId="rest-pna" unit="" value={raw.resting.perms.na} />
        <Param format={(v) => `${v}`} label="Relative P(Cl⁻)" max={2} min={0} onChange={(v) => setRest({ perms: { ...raw.resting.perms, cl: v } })} step={0.01} unit="" value={raw.resting.perms.cl} />
        <Param label="Temperature" max={50} min={0} onChange={(v) => setRest({ tempC: v })} step={1} unit="°C" value={raw.resting.tempC} />
        <button className="secondary-button" onClick={() => setRest({ ions: TYPICAL_IONS })} type="button">Restore typical values</button>
      </>
    );
    main = <DiagramFrame caption="Each ion's equilibrium potential (E) and the GHK resting potential (▲) on one voltage axis." label="Voltage ladder" title="Equilibrium potentials and the resting potential"><VoltageLadder input={{ ...raw.resting, vmSource: "ghk" }} /></DiagramFrame>;
    figures = [{ label: "GHK resting potential", value: mv(r.vmMv) }, ...r.nernst.filter((n) => n.ion !== "ca").map((n) => ({ label: `E(${n.symbol})`, value: mv(n.eMv), note: `P = ${n.permeability}` })), { label: "Gap above E_K", value: mv(r.gapFromEkMv) }];
    extra = (
      <Panel subtitle="The numbers match the model: Vm = (RT/F) ln[(PK·Ko + PNa·Nao + PCl·Cli) / (PK·Ki + PNa·Nai + PCl·Clo)]." title="Why the resting potential is not simply E_K">
        <p data-testid="reasons">{RESTING_NOTE}</p>
        <p className="gc-mono">numerator = {r.ghkTop.toPrecision(5)}, denominator = {r.ghkBottom.toPrecision(5)}, ratio = {(r.ghkTop / r.ghkBottom).toPrecision(5)}</p>
        <ul className="gc-assumptions">{GHK_ASSUMPTIONS.map((g) => <li key={g}>{g}</li>)}</ul>
        {onNavigate ? <p className="c23-note">The Membranes tool explores the same equations: <button className="ghost-button" onClick={() => onNavigate("bioMembrane")} type="button">open Membranes & transport</button></p> : null}
      </Panel>
    );
  }

  if (section === "passive" && passiveCheck.ok) {
    const p = raw.passive;
    const tau = membraneTauMs(p.rMohm, p.cPf), dv = steadyDeltaMv(p.iPa, p.rMohm);
    const pts = passiveTrace(p, 300);
    const now = passiveVoltageMv(p, tp);
    inputs = (
      <>
        <Param label="Membrane resistance R" max={1000} min={10} onChange={(v) => setPassive({ rMohm: v })} step={5} testId="pm-r" unit="MΩ" value={p.rMohm} />
        <Param label="Membrane capacitance C" max={500} min={10} onChange={(v) => setPassive({ cPf: v })} step={5} testId="pm-c" unit="pF" value={p.cPf} />
        <Param label="Injected current I" max={300} min={-300} onChange={(v) => setPassive({ iPa: v })} step={5} testId="pm-i" unit="pA" value={p.iPa} />
        <Param label="Pulse start" max={50} min={0} onChange={(v) => setPassive({ tStartMs: v })} step={1} unit="ms" value={p.tStartMs} />
        <Param label="Pulse width" max={200} min={1} onChange={(v) => setPassive({ pulseMs: v })} step={1} unit="ms" value={p.pulseMs} />
        <Param label="Resting voltage" max={-40} min={-90} onChange={(v) => setPassive({ vRestMv: v })} step={1} unit="mV" value={p.vRestMv} />
        <Param label="Time shown" max={500} min={10} onChange={(v) => setPassive({ tMaxMs: v })} step={5} unit="ms" value={p.tMaxMs} />
      </>
    );
    steps = <SimControls format={(t) => `${t.toFixed(1)} ms = ${(t / tau).toFixed(2)} τ`} label="Time" labels={SPEED_TEXT} onPlay={clockP.play} onPause={() => { clockP.pause(); setTp(tp, true); }} onReset={() => { clockP.pause(); setTp(0, true); }} onSpeed={setSpeed} onTime={(t) => { clockP.pause(); setTp(t, true); }} playing={clockP.playing} rateOf={rateForTransient} speed={speed} speeds={SPEEDS} t={tp} tEnd={passiveEnd} />;
    main = (
      <>
        <MsChart caption="Voltage follows the pulse exponentially: V = Vrest + IR(1 − e^(−t/τ)) while the current flows, then decays with the same τ." legend={[{ label: "membrane voltage", color: "#0b6a72", kind: "line" }, { label: "resting voltage", color: "#64748b", kind: "dashed" }]} onTime={(t) => { clockP.pause(); setTp(t, true); }} series={[{ id: "rest", label: "rest", color: "#64748b", dash: "7 4", points: [{ x: 0, y: p.vRestMv }, { x: p.tMaxMs, y: p.vRestMv }] }, { id: "v", label: "V", color: "#0b6a72", points: pts.map((q) => ({ x: q.t, y: q.v })) }]} t={tp} tEnd={p.tMaxMs} title="Membrane voltage" y={now} yDomain={[Math.min(p.vRestMv, p.vRestMv + dv) - 3, Math.max(p.vRestMv, p.vRestMv + dv) + 3]} yLabel="V (mV)" valueText={`V = ${now.toFixed(2)} mV at ${tp.toFixed(1)} ms`} />
        <MsChart onTime={(t) => { clockP.pause(); setTp(t, true); }} series={[{ id: "i", label: "I", color: "#be123c", points: pts.map((q) => ({ x: q.t, y: q.i })) }]} t={tp} tEnd={p.tMaxMs} title="Injected current" y={tp >= p.tStartMs && tp < p.tStartMs + p.pulseMs ? p.iPa : 0} yDomain={[Math.min(0, p.iPa) - 20, Math.max(0, p.iPa) + 20]} yLabel="I (pA)" />
      </>
    );
    figures = [{ label: "Time constant τ = RC", value: `${Number(tau.toPrecision(4))} ms`, note: `${p.rMohm} MΩ × ${p.cPf} pF` }, { label: "Steady change I·R", value: mv(dv, 2) }, { label: `Voltage at ${tp.toFixed(1)} ms`, value: mv(now, 2) }, { label: "After one τ of the pulse", value: `${(100 * stepFraction(1)).toFixed(1)} % of the change` }];
    extra = (
      <Panel subtitle="Governing equation: C dV/dt = I − (V − Vrest)/R." title="A membrane patch as a parallel R and C">
        <p data-testid="reasons">This is the same exponential charging as the Physics <strong>RC transient</strong>: a current source I in parallel with R and C is equivalent to a voltage source IR in series with R, so the capacitor voltage approaches IR with time constant RC. Real membranes are not ideal: their conductances change with voltage and they are not isopotential, which is why this model holds only for small voltage changes.</p>
        <p className="gc-mono">τ = R·C = {p.rMohm} MΩ × {p.cPf} pF = {Number(tau.toPrecision(4))} ms · ΔV(∞) = I·R = {p.iPa} pA × {p.rMohm} MΩ = {Number(dv.toPrecision(4))} mV</p>
      </Panel>
    );
  }

  if (section === "ap" && hhCheck.ok && trace && analysis) {
    const h = raw.hh;
    const phase = analysis.phases[hhIndex];
    const cs = channelState(trace.m[hhIndex], trace.h[hhIndex], trace.n[hhIndex]);
    const bands = analysis.transitions.map((t, i, a) => ({ t, end: a[i + 1] })).filter(({ t }) => t.phase === "rising" || t.phase === "repol" || t.phase === "ahp").map(({ t, end }, i) => ({ id: `b${i}${t.index}`, x0: trace.t[t.index], x1: end ? trace.t[end.index] : trace.t[trace.t.length - 1], label: PHASE_BAND_LABEL[t.phase] }));
    inputs = (
      <>
        <Param label="Stimulus amplitude" max={100} min={0} onChange={(v) => setHh({ amp: v })} step={0.5} testId="hh-amp" unit="µA/cm²" value={h.amp} />
        <Param label="Stimulus start" max={20} min={0} onChange={(v) => setHh({ startMs: v })} step={0.5} unit="ms" value={h.startMs} />
        <Param label="Stimulus duration" max={50} min={0.1} onChange={(v) => setHh({ durMs: v })} step={0.1} testId="hh-dur" unit="ms" value={h.durMs} />
        <Param label="Second stimulus amplitude (0 = none)" max={100} min={0} onChange={(v) => setHh({ amp2: v })} step={0.5} testId="hh-amp2" unit="µA/cm²" value={h.amp2} />
        <Param label="Second stimulus starts after the first" max={40} min={0.5} onChange={(v) => setHh({ delayMs: v })} step={0.5} testId="hh-delay" unit="ms" value={h.delayMs} />
        <Param label="Simulated time" max={60} min={10} onChange={(v) => setHh({ durationMs: v })} step={1} unit="ms" value={h.durationMs} />
        <CheckRow checked={h.blockNa} id="block-na" label="Block voltage-gated Na⁺ channels (TTX-like)" onChange={(v) => setHh({ blockNa: v })} />
        <CheckRow checked={h.blockK} id="block-k" label="Block delayed-rectifier K⁺ channels (TEA-like)" onChange={(v) => setHh({ blockK: v })} />
        <div className="c23-chips">
          <button className="secondary-button" data-testid="find-threshold" onClick={() => setThrAmp(thresholdAmplitude({ ...h, amp2: 0 }))} type="button">Find threshold amplitude</button>
          <button className="secondary-button" data-testid="measure-refractory" onClick={() => setRefr(refractoryScan(h, Math.max(h.amp, 15), [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20]))} type="button">Measure refractory profile</button>
        </div>
        {thrAmp !== undefined ? <p className="bio-note" data-testid="threshold-result">{thrAmp === null ? "No amplitude up to 200 µA/cm² evokes a spike with these settings." : `Smallest first-pulse amplitude that evokes a spike with this duration: about ${thrAmp} µA/cm².`}</p> : null}
      </>
    );
    steps = <SimControls format={(t) => `${t.toFixed(2)} ms`} label="Time" labels={SPEED_TEXT} onPlay={clockH.play} onPause={() => { clockH.pause(); setTh(th, true); }} onReset={() => { clockH.pause(); setTh(0, true); }} onSpeed={setSpeed} onTime={(t) => { clockH.pause(); setTh(t, true); }} playing={clockH.playing} rateOf={rateForTransient} speed={speed} speeds={SPEEDS} t={th} tEnd={hhEnd} />;
    const pts = (a: number[]) => trace.t.map((t, i) => ({ x: t, y: a[i] }));
    main = (
      <>
        <MsChart bands={bands} caption="Shaded bands are the phases found in the integrated trace. Drag the marker or use the time slider; the channel diagram follows." onTime={(t) => { clockH.pause(); setTh(t, true); }} series={[{ id: "v", label: "V", color: "#0b6a72", points: pts(trace.v) }, { id: "ena", label: "E_Na", color: "#2563eb", dash: "7 4", points: [{ x: 0, y: HH.eNa }, { x: h.durationMs, y: HH.eNa }] }, { id: "ek", label: "E_K", color: "#c2410c", dash: "7 4", points: [{ x: 0, y: HH.eK }, { x: h.durationMs, y: HH.eK }] }]} legend={[{ label: "V (mV)", color: "#0b6a72", kind: "line" }, { label: `E_Na = ${HH.eNa} mV`, color: "#2563eb", kind: "dashed" }, { label: `E_K = ${HH.eK} mV`, color: "#c2410c", kind: "dashed" }]} t={th} tEnd={h.durationMs} title="Membrane voltage" y={trace.v[hhIndex]} yDomain={[-95, 65]} yLabel="V (mV)" valueText={`V = ${trace.v[hhIndex].toFixed(1)} mV at ${th.toFixed(2)} ms (${AP_PHASE_INFO[phase].label})`} />
        <div className="c23-chart-pair">
          <MsChart legend={[{ label: "m (Na⁺ activation)", color: "#2563eb", kind: "line" }, { label: "h (Na⁺ inactivation)", color: "#be123c", kind: "line" }, { label: "n (K⁺ activation)", color: "#c2410c", kind: "line" }]} onTime={(t) => { clockH.pause(); setTh(t, true); }} series={[{ id: "m", label: "m", color: "#2563eb", points: pts(trace.m) }, { id: "h", label: "h", color: "#be123c", points: pts(trace.h) }, { id: "n", label: "n", color: "#c2410c", points: pts(trace.n) }]} t={th} tEnd={h.durationMs} title="Gating variables" y={trace.h[hhIndex]} yDomain={[0, 1]} yLabel="open fraction" />
          <MsChart legend={[{ label: "gNa", color: "#2563eb", kind: "line" }, { label: "gK", color: "#c2410c", kind: "line" }]} onTime={(t) => { clockH.pause(); setTh(t, true); }} series={[{ id: "gna", label: "gNa", color: "#2563eb", points: pts(trace.gNa) }, { id: "gk", label: "gK", color: "#c2410c", points: pts(trace.gK) }]} t={th} tEnd={h.durationMs} title="Conductances" y={trace.gNa[hhIndex]} yDomain={[0, 45]} yLabel="g (mS/cm²)" />
        </div>
        <DiagramFrame caption="Gate positions and arrows are drawn from the gating variables and currents at the selected time." label="Channel states" title="Ion channels at the selected time"><ChannelDiagram index={hhIndex} phase={phase} tr={trace} /></DiagramFrame>
      </>
    );
    figures = [{ label: "Spikes", value: `${analysis.spikes}` }, { label: "Peak", value: analysis.spikes ? mv(analysis.peakMv) : "no spike", note: `E_Na = ${HH.eNa} mV` }, { label: "Lowest after spike", value: analysis.minAfterMv === null ? "—" : mv(analysis.minAfterMv), note: `E_K = ${HH.eK} mV` }, { label: "Phase at cursor", value: AP_PHASE_INFO[phase].label }];
    extra = (
      <>
        <Panel subtitle={`At ${th.toFixed(2)} ms.`} title={AP_PHASE_INFO[phase].label}>
          <p data-testid="phase-text">{AP_PHASE_INFO[phase].text}</p>
          <ul className="gc-assumptions" data-testid="channel-text"><li>{cs.naChannel}</li><li>{cs.kChannel}</li><li>m = {cs.m.toFixed(2)}, h = {cs.h.toFixed(2)}, n = {cs.n.toFixed(2)}; open fractions m³h = {cs.pNa.toFixed(3)}, n⁴ = {cs.pK.toFixed(3)}.</li></ul>
        </Panel>
        <Panel subtitle="Hodgkin–Huxley model; relative and absolute refractory periods." title="Refractory behaviour">
          <p>{REFRACTORY_NOTE}</p>
          {refr ? (
            <div className="c23-tablewrap"><table className="c23-table" data-testid="refractory-table"><thead><tr><th scope="col">Second pulse starts after</th><th scope="col">Smallest amplitude that fires a second spike</th><th scope="col">Period</th></tr></thead>
              <tbody>{refr.map((r) => { const base = thrAmp ?? thresholdAmplitude({ ...h, amp2: 0 }) ?? 0; return <tr key={r.delayMs}><th scope="row">{r.delayMs} ms</th><td>{r.minAmp === null ? "none up to 400 µA/cm²" : `${r.minAmp} µA/cm²`}</td><td>{r.minAmp === null ? "absolute refractory" : r.minAmp > base * 1.25 ? "relative refractory" : "recovered"}</td></tr>; })}</tbody></table></div>
          ) : <p className="bio-note">Press “Measure refractory profile” to run the model for several delays.</p>}
        </Panel>
        <Panel subtitle="Read before using the numbers." title="What this model is, and is not">
          <ul className="gc-assumptions">{HH_LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
        </Panel>
      </>
    );
  }

  if (section === "propagation") {
    const st = propagationState(raw.prop.myelinated, raw.prop.step);
    const un = regenerativeSites(false), my = regenerativeSites(true);
    inputs = (
      <>
        <Segmented<"myelinated" | "unmyelinated"> label="Axon type" onChange={(v) => { propPlayer.pause(); update((c) => ({ ...c, prop: { myelinated: v === "myelinated", step: 0 } })); }} options={[{ id: "myelinated", label: "Myelinated" }, { id: "unmyelinated", label: "Unmyelinated" }]} value={raw.prop.myelinated ? "myelinated" : "unmyelinated"} />
        <p className="c23-note">Same length either way: {un} regenerative sites without myelin, {my} with it.</p>
      </>
    );
    steps = <StepControls locked={false} max={propMax} onStep={setPropStep} player={propPlayer} step={raw.prop.step} unit="Site" />;
    main = (
      <>
        <div aria-live="polite" className="bio-caption" data-testid="step-caption"><h3>{raw.prop.myelinated ? "Saltatory conduction" : "Continuous conduction"}</h3><p>{st.caption}</p></div>
        <DiagramFrame caption="Yellow = regenerating the action potential; red = refractory behind it; orange = being depolarized by local current; blue arrows = passive current under the myelin." label="Propagation diagram" title={raw.prop.myelinated ? "Myelinated axon: the spike jumps between nodes" : "Unmyelinated axon: the spike regenerates along the whole membrane"}><PropagationDiagram myelinated={raw.prop.myelinated} state={st} /></DiagramFrame>
      </>
    );
    figures = [{ label: "Current site", value: `${raw.prop.step + 1} of ${st.sitesNeeded}` }, { label: "Regenerative sites (this axon)", value: `${st.sitesNeeded}` }, { label: "Spike direction", value: "away from the soma" }];
    extra = (
      <Panel subtitle="Schematic; no speeds are computed." title="Why myelination changes propagation">
        <p data-testid="reasons">{MYELIN_EXPLANATION}</p>
        <ul className="gc-assumptions">{PROPAGATION_LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
      </Panel>
    );
  }

  if (section === "synapse") {
    const s = raw.synapse;
    const st = synapseState(s), ex = SYNAPSE_EXAMPLES.find((e) => e.id === s.example)!, r = postsynapticResponse(s);
    const stages = synapseStages(ex);
    inputs = (
      <>
        <SelectRow id="syn-example" label="Synapse example" onChange={(v) => setSyn({ example: v })} options={SYNAPSE_EXAMPLES.map((e): [typeof s.example, string] => [e.id, e.label])} value={s.example} />
        <SelectRow id="syn-pert" label="Condition" onChange={(v) => setSyn({ perturbation: v })} options={PERTURBATIONS_SYN.map((p): [typeof s.perturbation, string] => [p.id, p.label])} value={s.perturbation} />
        <Param label="Postsynaptic voltage" max={-30} min={-100} onChange={(v) => setSyn({ vmPostMv: v })} step={1} testId="syn-vm" unit="mV" value={s.vmPostMv} />
        {s.example === "gaba-a" ? <Param label="Intracellular Cl⁻" max={60} min={2} onChange={(v) => setSyn({ clInMm: v })} step={1} testId="syn-cl" unit="mM" value={s.clInMm} /> : null}
        <Param label="Assumed spike threshold" max={-40} min={-65} onChange={(v) => setSyn({ thresholdMv: v })} step={1} unit="mV" value={s.thresholdMv} />
        <p className="c23-note">{ex.context}</p>
      </>
    );
    steps = <StepControls locked={false} max={SYNAPSE_STEPS - 1} onStep={setSynStep} player={synPlayer} step={s.step} unit="Stage" />;
    main = (
      <>
        <div aria-live="polite" className="bio-caption" data-testid="step-caption"><h3>{stages[s.step].title}</h3><p>{st.caption}</p></div>
        <DiagramFrame caption="Presynaptic Ca²⁺ channels are voltage-gated; the postsynaptic receptor is gated by the transmitter (or acts through a G protein). Each element's state comes from the stage and condition selected." label="Chemical synapse diagram" title={ex.label}><SynapseDiagram input={s} state={st} /></DiagramFrame>
      </>
    );
    figures = [{ label: "Presynaptic Ca²⁺ channels", value: st.cavOpen ? "open" : "closed" }, { label: "Vesicle fusion", value: st.vesiclesFused ? "yes" : "no" }, { label: ex.neurotransmitter, value: st.transmitterInCleft ? "in the cleft" : st.cleared ? "cleared" : "not released" }, { label: ex.receptor, value: st.receptorActive ? "active" : "not active" }, { label: "Reversal potential", value: mv(r.reversalMv) }, { label: "Response", value: `${r.polarity}, ${r.effect}` }];
    extra = (
      <Panel subtitle={ex.kind === "ionotropic" ? "Ligand-gated channel (ionotropic)." : "G-protein-coupled (metabotropic)."} title="The postsynaptic response">
        <p data-testid="reasons">{r.explanation}</p>
        <p>{SYNAPSE_CONTEXT_NOTE}</p>
        <p><strong>Clearance:</strong> {ex.clearance}</p>
        {onNavigate ? <p className="c23-note">How receptors and G proteins signal: <button className="ghost-button" onClick={() => onNavigate("bioSignaling")} type="button">open Cell signaling</button> · ion movement across membranes: <button className="ghost-button" onClick={() => onNavigate("bioMembrane")} type="button">open Membranes & transport</button></p> : null}
        <ul className="gc-assumptions">{SYNAPSE_LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
      </Panel>
    );
  }

  if (section === "summation" && sumCheck.ok) {
    const sm = raw.summation, res = evaluateSummation(sm, 400);
    const th0 = sm.thresholdMv;
    inputs = (
      <>
        {sm.events.map((e, i) => (
          <fieldset className="c23-fieldset" key={i}>
            <legend>Potential {i + 1}: {e.ampMv > 0 ? "excitatory" : "inhibitory"}</legend>
            <Param label={`Time of potential ${i + 1}`} max={100} min={0} onChange={(v) => setEvent(i, { tMs: v })} step={1} testId={`sum-t${i}`} unit="ms" value={e.tMs} />
            <Param label={`Peak amplitude ${i + 1}`} max={20} min={-20} onChange={(v) => setEvent(i, { ampMv: v === 0 ? 0.5 : v })} step={0.5} testId={`sum-a${i}`} unit="mV" value={e.ampMv} />
            {sm.events.length > 1 ? <button className="ghost-button" onClick={() => setSum({ events: sm.events.filter((_, k) => k !== i) })} type="button">Remove potential {i + 1}</button> : null}
          </fieldset>
        ))}
        <button className="secondary-button" data-testid="add-psp" disabled={sm.events.length >= 4} onClick={() => setSum({ events: [...sm.events, { tMs: Math.min(100, (sm.events.at(-1)?.tMs ?? 0) + 5), ampMv: 5 }] })} type="button">Add a potential</button>
        <Param label="Assumed spike threshold" max={-30} min={-65} onChange={(v) => setSum({ thresholdMv: v })} step={1} unit="mV" value={sm.thresholdMv} />
        <p className="c23-note">Membrane τ = {Number(res.tauMs.toPrecision(3))} ms, from R and C in the Passive membrane section (R = {sm.rMohm} MΩ, C = {sm.cPf} pF).</p>
      </>
    );
    main = <MsChart caption="Dashed line: the assumed threshold. The curve is the sum of the individual potentials (linear model)." legend={[{ label: "summed voltage", color: "#0b6a72", kind: "line" }, { label: `assumed threshold ${th0} mV`, color: "#be123c", kind: "dashed" }]} series={[{ id: "th", label: "threshold", color: "#be123c", dash: "7 4", points: [{ x: 0, y: th0 }, { x: sm.tMaxMs, y: th0 }] }, { id: "v", label: "V", color: "#0b6a72", points: res.series.map((q) => ({ x: q.t, y: q.v })) }]} tEnd={sm.tMaxMs} title="Summed postsynaptic potential" yDomain={[Math.min(sm.vRestMv, ...res.series.map((q) => q.v)) - 2, Math.max(th0, res.peakMv) + 3]} yLabel="V (mV)" />;
    figures = [{ label: "Peak summed voltage", value: mv(res.peakMv), note: `at ${res.peakMs.toFixed(1)} ms` }, { label: "Assumed threshold", value: mv(th0) }, { label: "Reaches threshold?", value: res.reachesThreshold ? "yes (linear model)" : "no" }, { label: "Membrane τ", value: `${Number(res.tauMs.toPrecision(3))} ms` }];
    extra = (
      <Panel subtitle="Temporal summation: potentials close in time add; spatial summation: simultaneous inputs add." title="What the model says">
        <p data-testid="reasons">{res.statement}</p>
        <ul className="gc-assumptions">{SUMMATION_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
    );
  }

  const err = (section === "passive" && !passiveCheck.ok ? passiveCheck.error : section === "ap" && !hhCheck.ok ? hhCheck.error : section === "summation" && !sumCheck.ok ? sumCheck.error : null);
  void narrow;

  return (
    <div className="gc-page ph-page bio-page">
      <ToolHeader
        group="Cellular biology & physiology"
        title="Neuronal physiology"
        purpose="Follow a signal through a neuron: input at the dendrites, a threshold at the axon hillock, an action potential computed from the Hodgkin–Huxley equations, propagation along the axon, and transmission across a chemical synapse."
        evidence="model"
        steps={[{ label: "Pick a section", detail: "Anatomy, resting potential, passive membrane, action potential, propagation, synapse or summation." }, { label: "Change the parameters", detail: "Currents, ion gradients, channel blocks, timing." }, { label: "Predict, then check", detail: "Practice and Challenge use the same model." }]}
        aside={<Badge tone="neutral" title="Hodgkin–Huxley squid axon at 6.3 °C; not a mammalian neuron predictor.">Squid-axon model</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { pauseAll(); update((c) => ({ ...c, mode: m })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="c23-sections"><Segmented<NeuronSection> label="Neuron section" onChange={setSection} options={NEURON_SECTIONS.map((s) => ({ id: s, label: SECTION_LABELS[s] }))} value={section} /></div>

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Change a value and the diagram, graph and numbers update together." title={SECTION_LABELS[section]}>
          {inputs}
          {err ? <Callout tone="danger" title="These values cannot be used"><p>{err}</p></Callout> : null}
        </Panel>
        <div className="gc-stage">
          {steps}
          {main}
          {figures.length ? <KeyFigures items={figures} /> : null}
          {mode === "explore" ? extra : null}
          {mode === "practice" ? <QuizPanel questions={questions} /> : null}
          {mode === "challenge" ? (
            challenge ? <PredictPanel finished={false} onReveal={applyChallenge} question={challenge.question} revealLabel={`Apply: ${challenge.label}`} subtitle="Commit to a prediction first; the change is applied afterwards." /> : <Callout tone="info" title="Nothing to predict here"><p>Choose another section: this one has no challenge.</p></Callout>
          ) : null}
          {mode !== "explore" && section === "anatomy" ? null : null}
          {section === "ap" ? <Disclosure summary="Parameters of the model"><p>C = {HH.cm} µF/cm², g<sub>Na</sub> = {HH.gNa}, g<sub>K</sub> = {HH.gK}, g<sub>L</sub> = {HH.gL} mS/cm², E<sub>Na</sub> = {HH.eNa}, E<sub>K</sub> = {HH.eK}, E<sub>L</sub> = {HH.eL} mV, rest {HH.vRest} mV, {HH.tempC} °C.</p></Disclosure> : null}
        </div>
      </div>
      <EvidencePanel id="bio-hodgkin-huxley" />
      <EvidencePanel id="bio-membrane" />
      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{NEURON_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      <RelatedConcepts subject="biology" toolId="bioNeuron" />
    </div>
  );
}
