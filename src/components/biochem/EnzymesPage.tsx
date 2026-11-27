import { useMemo, useState } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { LineChart, type ChartMarker, type ChartSeries } from "../ui/LineChart";
import { ParamSlider } from "../physics/sim";
import { NumberField } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { PredictPanel, QuizPanel, StepControls } from "../biology/bioShared";
import { useStepPlayer } from "../biology/bioHooks";
import { BindingDiagram, MechanismDiagram, SpeciesBars } from "./EnzymeDiagrams";
import {
  BINDING_MODELS, INHIBITION_TYPES, KINETIC_LIMITS, MECHANISM, MECHANISM_NOTE, alphas, apparentParameters, barrierLoweringKJ, catalyticConstants, direction, energyProfile,
  inhibitedVelocity, lineweaver, percentOfVmax, speciesFractions, substrateForFraction, validateEnzymeInput, velocity, ENERGY_LIMITS, type BindingModel, type InhibitionType,
} from "../../utils/biochem/enzyme";
import { enzymeChallenges, enzymeQuestions } from "../../utils/biochem/learning";
import type { Question } from "../../utils/biology/bioLearning";
import {
  DEFAULT_ENZYMES_INPUTS, ENZYMES_ASSUMPTIONS, ENZYMES_ENGINE_VERSION, ENZYME_VIEWS, describeEnzymesAnalysis, summarizeEnzymes, validateEnzymesInputs, type EnzymeView, type EnzymesInputs,
} from "../../utils/persistence/biochemTools17";
import { validateBiologyResults } from "../../utils/persistence/biologyTools";
import "../../styles/biochemistry.css";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

const VIEW_LABEL: Record<EnzymeView, string> = { binding: "Enzyme–substrate binding", mechanism: "Catalytic mechanism", kinetics: "Kinetics & inhibition", energy: "Energy & catalysis" };
const INH_LABEL: Record<InhibitionType, string> = { none: "None", competitive: "Competitive", uncompetitive: "Uncompetitive", noncompetitive: "Noncompetitive", mixed: "Mixed" };
const INH_TEXT: Record<InhibitionType, string> = {
  none: "No inhibitor: v = Vmax[S]/(Km + [S]).",
  competitive: "The inhibitor binds only the free enzyme, at the same site as the substrate. A high [S] outcompetes it: Vmax is unchanged and the apparent Km rises.",
  uncompetitive: "The inhibitor binds only the enzyme–substrate complex (ES). Both the apparent Vmax and the apparent Km fall by the same factor, giving parallel double-reciprocal lines.",
  noncompetitive: "The inhibitor binds E and ES equally well (Ki = Ki′) at a separate site: the apparent Vmax falls and the apparent Km is unchanged.",
  mixed: "The inhibitor binds E and ES with different affinities (Ki ≠ Ki′): the apparent Vmax falls and the apparent Km rises or falls depending on which binding is tighter.",
};
const fmt = (x: number) => (Number.isFinite(x) ? String(Number(x.toPrecision(4))) : "—");

function mechanismPrediction(step: number): Question | null {
  if (step >= MECHANISM.length - 1) return null;
  const next = MECHANISM[step + 1];
  const others = MECHANISM.filter((_, i) => i !== step + 1 && i !== step).slice(0, 2);
  const options = [next.title, ...others.map((o) => o.title)].sort();
  return { id: `mech-${step}`, prompt: `The reaction is at “${MECHANISM[step].title}”. What happens next?`, options, answer: options.indexOf(next.title), explanation: next.text };
}

export default function EnzymesPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<EnzymesInputs>({
    page: "enzymes", engineVersion: ENZYMES_ENGINE_VERSION, defaults: DEFAULT_ENZYMES_INPUTS, validateInputs: validateEnzymesInputs, validateResults: validateBiologyResults,
    summarize: summarizeEnzymes, describe: describeEnzymesAnalysis, fallbackName: "Enzymes & catalysis", openRequest, onOpenHandled,
  });
  const { raw, update } = ws;
  const set = (patch: Partial<EnzymesInputs>) => update((c) => ({ ...c, ...patch }));
  const setK = (patch: Partial<EnzymesInputs["kinetics"]>) => update((c) => ({ ...c, kinetics: { ...c.kinetics, ...patch } }));
  const setInh = (patch: Partial<EnzymesInputs["kinetics"]["inhibition"]>) => update((c) => ({ ...c, kinetics: { ...c.kinetics, inhibition: { ...c.kinetics.inhibition, ...patch } } }));
  const mode = raw.mode, view = raw.view;
  const [bound, setBound] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hide = mode === "practice" && !revealed;

  const kCheck = useMemo(() => validateEnzymeInput(raw.kinetics), [raw.kinetics]);
  const k = raw.kinetics, inh = k.inhibition;
  const kOk = kCheck.ok;
  const base = { ...inh, type: "none" as InhibitionType, conc: 0 };
  const app = useMemo(() => (kOk ? apparentParameters(k.vmax, k.km, inh) : null), [kOk, k, inh]);
  const v = kOk ? inhibitedVelocity(k.vmax, k.km, k.substrate, inh) : NaN;
  const v0 = kOk ? velocity(k.vmax, k.km, k.substrate) : NaN;
  const frac = kOk ? speciesFractions(k.km, k.substrate, inh) : null;
  const sMax = Math.max(10 * k.km, k.substrate * 1.2, 1);
  const lw = kOk ? lineweaver(k.vmax, k.km, inh) : null;
  const lw0 = kOk ? lineweaver(k.vmax, k.km, base) : null;
  const cat = kOk && k.enzymeTotal > 0 ? catalyticConstants(k.vmax, k.km, k.enzymeTotal) : null;
  const al = kOk ? alphas(inh) : null;

  const curves = useMemo<ChartSeries[]>(() => {
    if (!kOk) return [];
    const pts = (f: (s: number) => number) => Array.from({ length: 81 }, (_, i) => { const s = (sMax * i) / 80; return { x: s, y: f(s) }; });
    const out: ChartSeries[] = [{ id: "none", label: "No inhibitor", points: pts((s) => velocity(k.vmax, k.km, s)), dash: inh.type === "none" ? undefined : "7 4", color: "#64748b" }];
    if (inh.type !== "none") out.push({ id: "inh", label: `${INH_LABEL[inh.type]} inhibitor`, points: pts((s) => inhibitedVelocity(k.vmax, k.km, s, inh)) });
    return out;
  }, [kOk, k, inh, sMax]);
  const lwPlot = useMemo(() => {
    if (!kOk || !lw || !lw0) return null;
    const span = 1.6 / Math.min(k.km, app!.kmApp);
    const xs = [-span, span * 1.6];
    const line = (l: { slope: number; intercept: number }) => xs.map((x) => ({ x, y: l.intercept + l.slope * x }));
    const series: ChartSeries[] = [{ id: "none", label: "No inhibitor", points: line(lw0), dash: inh.type === "none" ? undefined : "7 4", color: "#64748b" }];
    if (inh.type !== "none") series.push({ id: "inh", label: `${INH_LABEL[inh.type]} inhibitor`, points: line(lw) });
    const ys = series.flatMap((s) => s.points.map((p) => p.y));
    return { series, xDomain: xs as [number, number], yDomain: [Math.min(0, ...ys) * 1.08, Math.max(...ys) * 1.08] as [number, number] };
  }, [kOk, lw, lw0, k, app, inh.type]);

  const energy = useMemo(() => energyProfile(raw.energy), [raw.energy]);
  const questions = useMemo(() => (kOk ? enzymeQuestions(k) : []), [kOk, k]);
  const challenges = useMemo(() => enzymeChallenges(), []);
  const challenge = challenges[raw.challenge % challenges.length];
  const mech = MECHANISM[Math.min(raw.mechStep, MECHANISM.length - 1)];
  const maxStep = MECHANISM.length - 1;
  const setStep = (n: number) => update((c) => (c.mechStep === n ? c : { ...c, mechStep: n }));
  const player = useStepPlayer(raw.mechStep, maxStep, setStep);
  const errs = kCheck.ok ? null : kCheck.errors;
  const errFor = (re: RegExp) => errs?.find((e) => re.test(e)) ?? null;

  const kinMarkers: ChartMarker[] = kOk && app ? [
    { id: "vhalf", x: app.kmApp, y: app.vmaxApp / 2, label: `Km,app ${fmt(app.kmApp)}`, kind: "half" },
  ] : [];

  return (
    <div className="gc-page ph-page bio-page bc-page">
      <ToolHeader
        group="Biomolecules"
        title="Enzymes & catalysis"
        purpose="See how an enzyme binds its substrate, how a catalytic mechanism lowers the barrier, and how Michaelis–Menten kinetics and four kinds of inhibition change the rate. The diagram and the graph use the same numbers."
        evidence="model"
        steps={[
          { label: "Pick a view", detail: "Binding, mechanism, kinetics or energy." },
          { label: "Change a constant", detail: "Vmax, Km, [S], inhibitor type, [I], Ki." },
          { label: "Practise or predict", detail: "Hide labels, answer questions, predict an inhibitor's effect." },
        ]}
        aside={<Badge tone="neutral" title="Idealised single-substrate kinetics">Idealised kinetics</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice", "challenge"]} onChange={(m) => { setRevealed(false); player.pause(); update((c) => ({ ...c, mode: m })); }} />
        {ws.actions}
      </div>
      {ws.saveFormEl}
      <div className="bc-views"><Segmented<EnzymeView> label="View" onChange={(x) => { player.pause(); set({ view: x }); }} options={ENZYME_VIEWS.map((x) => ({ id: x, label: VIEW_LABEL[x] }))} value={view} /></div>

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Each view has its own controls." title="Controls">
          {view === "binding" ? (
            <>
              <Segmented<BindingModel> label="Model" onChange={(m) => { setBound(false); set({ binding: m }); }} options={(Object.keys(BINDING_MODELS) as BindingModel[]).map((m) => ({ id: m, label: BINDING_MODELS[m].label }))} value={raw.binding} />
              <button className="primary-button" data-testid="bind-toggle" onClick={() => setBound((b) => !b)} type="button">{bound ? "Release substrate" : "Bind substrate"}</button>
            </>
          ) : null}
          {view === "kinetics" ? (
            <>
              <NumberField error={errFor(/Vmax/)} hint={`${KINETIC_LIMITS.vmax[0]}–${KINETIC_LIMITS.vmax[1]} (rate units)`} label="Vmax" onChange={(x) => setK({ vmax: x })} value={k.vmax} />
              <NumberField error={errFor(/Km/)} hint={`${KINETIC_LIMITS.km[0]}–${KINETIC_LIMITS.km[1]} (concentration units)`} label="Km" onChange={(x) => setK({ km: x })} value={k.km} />
              <NumberField error={errFor(/\[S\]/)} hint="same concentration units as Km" label="Substrate [S]" onChange={(x) => setK({ substrate: x })} value={k.substrate} />
              {kOk ? <ParamSlider format={(x) => fmt(x)} label="[S] (slider)" max={sMax} min={0} onChange={(x) => setK({ substrate: Number(x.toPrecision(4)) })} step={Math.max(sMax / 400, 1e-4)} value={Math.min(k.substrate, sMax)} /> : null}
              <Segmented<InhibitionType> label="Inhibitor" onChange={(t) => setInh({ type: t, ...(t === "noncompetitive" ? { kiPrime: inh.ki } : {}), ...(t !== "none" && inh.conc === 0 ? { conc: 4 } : {}) })} options={INHIBITION_TYPES.map((t) => ({ id: t, label: INH_LABEL[t] }))} value={inh.type} />
              {inh.type !== "none" ? (
                <>
                  <NumberField error={errFor(/\[I\]/)} label="Inhibitor [I]" onChange={(x) => setInh({ conc: x })} value={inh.conc} />
                  {inh.type !== "uncompetitive" ? <NumberField error={errFor(/Ki\b(?!′)/)} hint="binding to free enzyme E" label="Ki" onChange={(x) => setInh(inh.type === "noncompetitive" ? { ki: x, kiPrime: x } : { ki: x })} value={inh.ki} /> : null}
                  {inh.type !== "competitive" && inh.type !== "noncompetitive" ? <NumberField error={errFor(/Ki′/)} hint="binding to the ES complex" label="Ki′" onChange={(x) => setInh({ kiPrime: x })} value={inh.kiPrime} /> : null}
                </>
              ) : null}
              <NumberField hint="optional; 0 = not given (gives kcat)" label="Total enzyme [E]total" onChange={(x) => setK({ enzymeTotal: x })} value={k.enzymeTotal} />
              {errs ? <Callout tone="danger" title="These values cannot be used"><ul>{errs.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
            </>
          ) : null}
          {view === "energy" ? (
            <>
              <ParamSlider format={(x) => `${x} kJ/mol`} label="Reaction ΔG°" max={ENERGY_LIMITS.deltaG[1]} min={ENERGY_LIMITS.deltaG[0]} onChange={(x) => update((c) => ({ ...c, energy: { ...c.energy, deltaG: Math.round(x) } }))} step={1} value={raw.energy.deltaG} />
              <ParamSlider format={(x) => `10^${x} faster`} label="Catalysis speeds the reaction" max={ENERGY_LIMITS.decades[1]} min={ENERGY_LIMITS.decades[0]} onChange={(x) => update((c) => ({ ...c, energy: { ...c.energy, decades: x } }))} step={1} value={raw.energy.decades} />
            </>
          ) : null}
          {view === "mechanism" ? <p className="ph-note">Use the step controls above the diagram. {MECHANISM_NOTE}</p> : null}
        </Panel>

        <div className="gc-stage">
          {view === "binding" ? (
            <>
              <DiagramFrame caption={BINDING_MODELS[raw.binding].text} label="Enzyme substrate binding" title={BINDING_MODELS[raw.binding].label}>
                <BindingDiagram bound={bound} model={raw.binding} />
              </DiagramFrame>
              {mode === "explore" ? (
                <Panel title="Why does it behave this way?">
                  <Disclosure defaultOpen summary="What gives an enzyme its specificity?"><p>The active site is a three-dimensional pocket whose shape, charges and hydrogen-bonding groups complement the substrate. Binding energy from many weak interactions is also used to stabilize the transition state, which is how enzymes speed reactions.</p></Disclosure>
                  <Disclosure summary="Do the models compete?"><p>They are not mutually exclusive. Induced fit and conformational selection can both describe parts of the same enzyme's behavior, and lock and key is a limiting case with a rigid site.</p></Disclosure>
                </Panel>
              ) : null}
            </>
          ) : null}

          {view === "mechanism" ? (
            <>
              <StepControls extra={mode === "practice" ? <button className="secondary-button" onClick={() => setRevealed((r) => !r)} type="button">{revealed ? "Hide labels" : "Reveal labels"}</button> : null} locked={mode === "challenge"} max={maxStep} onStep={setStep} player={player} step={raw.mechStep} unit="Mechanism step" />
              <div aria-live="polite" className="bio-caption" data-testid="step-caption">
                <h3>{mech.title}</h3>
                <p>{hide ? "Labels are hidden. Work out which residue acts as the nucleophile and which as the general acid or base, then use Reveal labels." : mech.text}</p>
              </div>
              <DiagramFrame caption={MECHANISM_NOTE} label="Serine protease mechanism" title={hide ? "Catalytic mechanism" : `${mech.species}`}>
                <MechanismDiagram hideLabels={hide} state={mech} />
              </DiagramFrame>
              {mode === "explore" ? (
                <Panel title="Why does it behave this way?">
                  <Disclosure defaultOpen summary="What does the catalytic triad do?"><p>Asp102 orients and polarizes His57; His57 removes the proton from Ser195 so that serine becomes a strong nucleophile, and later acts as a general acid. This is acid–base and covalent catalysis together.</p></Disclosure>
                  <Disclosure summary="Why the oxyanion hole?"><p>The negative charge on the tetrahedral intermediate's oxygen is stabilized by backbone N–H groups of the enzyme. These bind the transition state more tightly than the substrate, which lowers the barrier.</p></Disclosure>
                </Panel>
              ) : null}
            </>
          ) : null}

          {view === "kinetics" ? (
            kOk && app && frac && lwPlot ? (
              <>
                <KeyFigures items={[
                  { label: "Velocity v", value: fmt(v), note: inh.type === "none" ? `${percentOfVmax(k.km, k.substrate).toFixed(1)}% of Vmax` : `${((v / v0) * 100).toFixed(1)}% of the uninhibited ${fmt(v0)}` },
                  { label: "Vmax,app", value: fmt(app.vmaxApp), note: direction(app.vmaxApp, k.vmax) },
                  { label: "Km,app", value: fmt(app.kmApp), note: direction(app.kmApp, k.km) },
                  { label: "α, α′", value: `${fmt(al!.alpha)}, ${fmt(al!.alphaPrime)}`, note: "1 + [I]/Ki and 1 + [I]/Ki′" },
                  ...(cat ? [{ label: "kcat, kcat/Km", value: `${fmt(cat.kcat)}, ${fmt(cat.efficiency)}`, note: "from Vmax/[E]total" }] : []),
                ]} />
                <DiagramFrame caption={`${INH_TEXT[inh.type]} Drag the marker (or use the arrow keys) to change [S]; the readouts and the diagram below follow.`} label="Michaelis–Menten plot" title="Velocity versus substrate concentration">
                  <LineChart
                    current={{ x: Math.min(k.substrate, sMax), y: v }}
                    formatX={fmt}
                    formatY={fmt}
                    markers={kinMarkers}
                    onXChange={(x) => setK({ substrate: Number(x.toPrecision(4)) })}
                    series={curves}
                    title="Michaelis–Menten curve"
                    valueText={`[S] ${fmt(k.substrate)}, velocity ${fmt(v)}`}
                    xDomain={[0, sMax]} xLabel="[S] (concentration)" xStep={sMax / 100}
                    yDomain={[0, k.vmax * 1.05]} yLabel="Initial velocity v"
                  />
                </DiagramFrame>
                <DiagramFrame caption="Lineweaver–Burk (double-reciprocal) lines: y-intercept 1/Vmax,app, x-intercept −1/Km,app, slope Km,app/Vmax,app. Competitive lines meet on the y-axis, uncompetitive lines are parallel, noncompetitive lines meet on the x-axis." label="Lineweaver-Burk plot" title="Double-reciprocal plot (1/v versus 1/[S])">
                  <LineChart formatX={fmt} formatY={fmt} series={lwPlot.series} title="Lineweaver–Burk plot" xDomain={lwPlot.xDomain} xLabel="1 / [S]" yDomain={lwPlot.yDomain} yLabel="1 / v" />
                </DiagramFrame>
                <DiagramFrame caption="Fraction of the enzyme in each form at this [S] and [I]; derived from α and α′, the same numbers that set the curves." label="Enzyme species" title="Where the enzyme is">
                  <SpeciesBars fractions={frac} />
                </DiagramFrame>
                <Panel subtitle="Closed-form results for the values entered." title="Useful numbers">
                  <ul className="gc-assumptions">
                    <li>[S] for 50% of Vmax: Km = {fmt(k.km)}; for 90%: {fmt(substrateForFraction(k.km, 0.9))} (9 × Km); for 99%: {fmt(substrateForFraction(k.km, 0.99))}.</li>
                    <li>Catalytic efficiency (when [E]total is given) is kcat/Km; a diffusion-limited enzyme reaches roughly 10⁸–10⁹ M⁻¹s⁻¹.</li>
                  </ul>
                </Panel>
                {mode === "explore" ? (
                  <Panel title="Why does it behave this way?">
                    <Disclosure defaultOpen summary={`How a ${INH_LABEL[inh.type].toLowerCase()} inhibitor acts`}><p>{INH_TEXT[inh.type]}</p></Disclosure>
                    <Disclosure summary="Reading the double-reciprocal plot"><p>Taking reciprocals of v = Vmax[S]/(Km + [S]) gives 1/v = (Km/Vmax)(1/[S]) + 1/Vmax, a straight line. Inhibition changes the slope, the intercepts, or both in a pattern that reveals the type.</p></Disclosure>
                    <Disclosure summary="Limits of the model"><p>Steady state, one substrate, initial rates, reversible binding. Tight-binding, irreversible, allosteric and substrate-inhibited enzymes do not follow these equations.</p></Disclosure>
                  </Panel>
                ) : null}
              </>
            ) : <Callout tone="info" title="Enter valid kinetic constants"><p>{errs?.[0] ?? "The graphs appear as soon as every value is valid."}</p></Callout>
          ) : null}

          {view === "energy" ? (
            <>
              <KeyFigures items={[
                { label: "Barrier lowered by", value: `${barrierLoweringKJ(raw.energy.decades).toFixed(1)} kJ/mol`, note: `${raw.energy.decades} decade${raw.energy.decades === 1 ? "" : "s"} faster at 298 K` },
                { label: "Reaction ΔG°", value: `${raw.energy.deltaG} kJ/mol`, note: "unchanged by the enzyme" },
                { label: "Equilibrium constant K", value: energy.K >= 1e4 || energy.K < 1e-3 ? energy.K.toExponential(2) : energy.K.toPrecision(3), note: "same with and without catalyst" },
                { label: "Rate enhancement", value: raw.energy.decades === 0 ? "1×" : `10^${raw.energy.decades}`, note: "forward and reverse both" },
              ]} />
              <DiagramFrame caption="The enzyme lowers the transition-state energy, giving a faster path with an intermediate (enzyme–substrate complex). Reactants and products stay at the same energies, so ΔG° and K are the same. The vertical scale is schematic." label="Reaction energy profile" title="Reaction coordinate diagram">
                <LineChart
                  formatX={(x) => x.toFixed(1)} formatY={(y) => y.toFixed(0)}
                  series={[{ id: "u", label: "Uncatalysed", points: energy.uncatalysed, color: "#64748b", dash: "7 4" }, { id: "c", label: "Catalysed", points: energy.catalysed }]}
                  title="Energy profile"
                  xDomain={[0, 1]} xLabel="Reaction progress" yDomain={[Math.min(-20, raw.energy.deltaG - 20), 140 + Math.max(0, raw.energy.deltaG)]} yLabel="Free energy (kJ/mol, schematic)"
                />
              </DiagramFrame>
              {mode === "explore" ? (
                <Panel title="Why does it behave this way?">
                  <Disclosure defaultOpen summary="Does an enzyme change the equilibrium?"><p>No. K = e^(−ΔG°/RT) depends only on the reactants and products. A catalyst speeds forward and reverse reactions by the same factor, so the system reaches equilibrium sooner without shifting it.</p></Disclosure>
                  <Disclosure summary="How much does each decade cost?"><p>A factor of 10 in rate at 298 K corresponds to RT ln 10 ≈ 5.7 kJ/mol of barrier lowering (transition-state theory).</p></Disclosure>
                </Panel>
              ) : null}
            </>
          ) : null}

          {mode === "practice" && view === "kinetics" ? <QuizPanel questions={questions} /> : null}
          {mode === "practice" && view !== "kinetics" ? <Callout tone="info" title="Hidden labels and quiz"><p>{view === "mechanism" ? "Use Reveal labels above the diagram to check your reasoning." : "Practice questions are on the Kinetics & inhibition view."}</p><button className="secondary-button" onClick={() => set({ view: "kinetics" })} type="button">Go to Kinetics &amp; inhibition</button></Callout> : null}
          {mode === "challenge" ? (
            view === "mechanism" ? (
              <PredictPanel finished={raw.mechStep >= maxStep} onReveal={() => setStep(Math.min(maxStep, raw.mechStep + 1))} question={mechanismPrediction(raw.mechStep)} />
            ) : (
              <PredictPanel
                finished={false}
                onReveal={() => update((c) => ({ ...c, view: "kinetics", challenge: c.challenge + 1, kinetics: { ...c.kinetics, vmax: 100, km: 2, substrate: 2, inhibition: { type: challenge.apply.type ?? "competitive", conc: 4, ki: 2, kiPrime: 2 } } }))}
                question={challenge.question}
                revealLabel="Apply the inhibitor and show the graph"
                subtitle="Commit to a prediction first; the inhibitor is then applied to the graph."
              />
            )
          ) : null}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits"><ul className="gc-assumptions">{ENZYMES_ASSUMPTIONS.map((x) => <li key={x}>{x}</li>)}</ul></Panel>
      <RelatedConcepts subject="biochemistry" toolId="bcEnzymes" />
    </div>
  );
}
