import { useEffect, useMemo, useRef } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import { LineChart, type ChartMarker, type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GcPredictPanel, NumberField, Paragraphs } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { fmt, formatSI, senseWord, siScale, zeroNoise } from "../../utils/physics/format";
import {
  angleAtTime, areaAtTime, faradayTrace, fieldAtTime, flux as fluxOf, fluxAtTime, fluxLinkage, generatorOmega, generatorPeakEmf, generatorPeriod, generatorRmsEmf, generatorState, lenz, motionalEmf,
  RL_LIMITS, rlEnd, rlKind, rlState, rlTau, rlTrace, validateFaraday, validateFlux, validateGenerator, validateMotional, validateRl, VIEWING_CONVENTION,
} from "../../utils/physics/induction";
import { INDUCTION_ASSUMPTIONS, summarizeInduction } from "../../utils/physics/electromagnetismSummary";
import { INDUCTION_CHALLENGES, inductionLessons, inductionScenarios } from "../../utils/physics/electromagnetismLearning";
import {
  DEFAULT_INDUCTION_INPUTS, describeInductionAnalysis, INDUCTION_ENGINE_VERSION, INDUCTION_SCENARIOS, inductionEnd, MOTIONAL_RUN_S, validateInductionInputs, type InductionInputs, type InductionScenario,
} from "../../utils/persistence/physicsTools24";
import { validatePhysicsResults } from "../../utils/persistence/physicsTools";
import { rateForTransient, type SpeedChoice } from "../../utils/physics/simClock";
import { ChallengePanel } from "./ChallengePanel";
import { LoopFieldDiagram, MotionalDiagram, RlDiagram } from "./InductionDiagrams";
import { ParamSlider, SimControls } from "./sim";
import { useSimClock } from "./simHooks";
import { useSimTime } from "./useSimTime";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

const SCENARIO_LABEL: Record<InductionScenario, string> = { flux: "Magnetic flux", faraday: "Faraday & Lenz", motional: "Motional EMF", generator: "AC generator", rl: "RL circuit" };
const SPEEDS: SpeedChoice[] = ["quarter", "real", "fast"];
const SPEED_TEXT: Partial<Record<SpeedChoice, string>> = { quarter: "Slow 12 s", real: "Normal 6 s", fast: "Fast 3 s" };
const FARADAY_PRESETS: Array<{ label: string; p: Partial<InductionInputs["faraday"]> }> = [
  { label: "Field increasing", p: { B0: 0.2, bRate: 0.4, A0: 0.05, aRate: 0, N: 50, theta0Deg: 0, omega: 0, closed: true, R: 2, duration: 2 } },
  { label: "Field decreasing", p: { B0: 1.0, bRate: -0.4, A0: 0.05, aRate: 0, N: 50, theta0Deg: 0, omega: 0, closed: true, R: 2, duration: 2 } },
  { label: "Loop expanding in a steady field", p: { B0: 0.5, bRate: 0, A0: 0.02, aRate: 0.03, N: 20, theta0Deg: 0, omega: 0, closed: true, R: 2, duration: 2 } },
  { label: "Loop turning in a steady field", p: { B0: 0.5, bRate: 0, A0: 0.05, aRate: 0, N: 50, theta0Deg: 0, omega: 3, closed: true, R: 2, duration: 2 } },
  { label: "Constant field: no EMF", p: { B0: 0.5, bRate: 0, A0: 0.05, aRate: 0, N: 50, theta0Deg: 0, omega: 0, closed: true, R: 2, duration: 2 } },
  { label: "Open loop (EMF, no current)", p: { B0: 0.2, bRate: 0.4, A0: 0.05, aRate: 0, N: 50, theta0Deg: 0, omega: 0, closed: false, R: 2, duration: 2 } },
];
const RL_PRESETS: Array<{ label: string; p: Partial<InductionInputs["rl"]> }> = [
  { label: "Switch on (current grows)", p: { Vs: 12, i0: 0, R: 20, L: 0.5 } },
  { label: "Switch off (current decays)", p: { Vs: 0, i0: 0.6, R: 20, L: 0.5 } },
  { label: "Large inductor, slow", p: { Vs: 12, i0: 0, R: 10, L: 5 } },
  { label: "Reverse the source", p: { Vs: -12, i0: 0.6, R: 20, L: 0.5 } },
];

function errorsFor(raw: InductionInputs): string[] {
  const out: string[] = [];
  const add = (r: { ok: boolean; errors?: string[] }) => { if (!r.ok && r.errors) out.push(...r.errors); };
  if (raw.scenario === "flux") add(validateFlux(raw.flux));
  if (raw.scenario === "faraday") add(validateFaraday(raw.faraday));
  if (raw.scenario === "motional") add(validateMotional(raw.motional));
  if (raw.scenario === "generator") add(validateGenerator(raw.generator));
  if (raw.scenario === "rl") add(validateRl(raw.rl));
  return out;
}
const safeEnd = (c: InductionInputs): number => { const e = inductionEnd(c); return Number.isFinite(e) && e > 0 ? e : 1; };

export default function InductionPage({ openRequest = null, onOpenHandled }: Props) {
  const resetClockRef = useRef<() => void>(() => undefined);
  const ws = useGcWorkspace<InductionInputs>({
    page: "induction",
    engineVersion: INDUCTION_ENGINE_VERSION,
    defaults: DEFAULT_INDUCTION_INPUTS,
    validateInputs: validateInductionInputs,
    validateResults: validatePhysicsResults,
    summarize: summarizeInduction,
    describe: describeInductionAnalysis,
    fallbackName: "Induction analysis",
    openRequest,
    onOpenHandled,
    onReset: () => resetClockRef.current(),
  });
  const { raw } = ws;
  const v = ws.valid;
  /** Every edit keeps the saved time inside the (possibly shorter) run, so a valid page never becomes invalid by editing the duration. */
  const set = (fn: (c: InductionInputs) => InductionInputs) => ws.update((c) => { const n = fn(c); const e = inductionEnd(n); return Number.isFinite(e) && n.tNow > e ? { ...n, tNow: Math.max(0, e) } : n; });
  const errors = useMemo(() => errorsFor(raw), [raw]);
  const mode = raw.mode, sc = raw.scenario;
  const ok = !!v && errors.length === 0;

  const setScenario = (next: InductionScenario) => { resetClockRef.current(); set((c) => ({ ...c, scenario: next, tNow: 0 })); };
  const setF = (patch: Partial<InductionInputs["faraday"]>) => set((c) => ({ ...c, faraday: { ...c.faraday, ...patch } }));
  const setM = (patch: Partial<InductionInputs["motional"]>) => set((c) => ({ ...c, motional: { ...c.motional, ...patch } }));
  const setG = (patch: Partial<InductionInputs["generator"]>) => set((c) => ({ ...c, generator: { ...c.generator, ...patch } }));
  const setR = (patch: Partial<InductionInputs["rl"]>) => set((c) => ({ ...c, rl: { ...c.rl, ...patch } }));
  const setFlux = (patch: Partial<InductionInputs["flux"]>) => set((c) => ({ ...c, flux: { ...c.flux, ...patch } }));

  // ---- one clock for the whole page ----
  const end = safeEnd(raw);
  const [t, setT] = useSimTime(raw.tNow, end, (next) => set((c) => (Object.is(c.tNow, next) ? c : { ...c, tNow: next })));
  const clock = useSimClock({ t, tEnd: end, rate: rateForTransient(raw.speed, end), onTime: (next, final) => setT(next, final) });
  useEffect(() => { resetClockRef.current = () => { clock.pause(); setT(0, true); }; });
  const tScale = siScale(end, "s");
  const x = (tt: number) => tt / tScale.factor;
  const onTime = (xv: number) => { clock.pause(); setT(Math.min(end, Math.max(0, xv * tScale.factor)), true); };
  const pad = (lo: number, hi: number): [number, number] => { const s = hi - lo > 1e-9 * Math.max(Math.abs(lo), Math.abs(hi)) ? hi - lo : Math.max(1e-30, Math.abs(hi) * 0.2 || 1); return [lo - s * 0.08, hi + s * 0.08]; };
  const chart = (title: string, yLabel: string, series: ChartSeries[], cur: number, lo: number, hi: number, text: string, markers: ChartMarker[] = []) => (
    <LineChart
      current={{ x: x(t), y: cur }}
      formatX={(xv) => String(Number(xv.toPrecision(3)))}
      formatY={(yv) => String(Number(yv.toPrecision(3)))}
      markers={markers}
      onXChange={onTime}
      series={series}
      title={title}
      valueText={text}
      xDomain={[0, x(end)]}
      xLabel={`Time (${tScale.unit})`}
      xStep={x(end) / 200}
      yDomain={pad(lo, hi)}
      yLabel={yLabel}
    />
  );

  // ---- scenario models (the same functions drive diagram, numbers and graphs) ----
  const fOk = useMemo(() => validateFaraday(raw.faraday), [raw.faraday]);
  const gOk = useMemo(() => validateGenerator(raw.generator), [raw.generator]);
  const mOk = useMemo(() => validateMotional(raw.motional), [raw.motional]);
  const rOk = useMemo(() => validateRl(raw.rl), [raw.rl]);
  const xOk = useMemo(() => validateFlux(raw.flux), [raw.flux]);
  const fp = fOk.ok ? fOk.value : null, gp = gOk.ok ? gOk.value : null, mp = mOk.ok ? mOk.value : null, rp = rOk.ok ? rOk.value : null, xp = xOk.ok ? xOk.value : null;
  const ftrace = useMemo(() => (fp ? faradayTrace(fp, 300) : []), [fp]);
  const gtrace = useMemo(() => (gp ? Array.from({ length: 301 }, (_, i) => generatorState(gp, ((gp.periods / gp.frequency) * i) / 300)) : []), [gp]);
  const rtrace = useMemo(() => (rp ? rlTrace(rp, 240) : []), [rp]);

  const practice = mode === "practice", challenge = mode === "challenge";
  const practiceInput = useMemo(() => (v ? { ...v, tNow: 0 } : null), [v?.scenario, v?.flux, v?.faraday, v?.motional, v?.generator, v?.rl]); // eslint-disable-line react-hooks/exhaustive-deps
  const scenarios = useMemo(() => (practiceInput ? inductionScenarios(practiceInput) : []), [practiceInput]);
  const lessons = useMemo(() => (v ? inductionLessons({ ...v, tNow: 0 }) : []), [v]);

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Electromagnetism"
        title="Electromagnetic induction"
        purpose="Change the magnetic flux through a loop and see the EMF, the induced current and Lenz's law at work — in a changing field, a moving rod, a rotating-coil generator and an RL circuit — with every graph moving on one shared clock."
        evidence="model"
        steps={[
          { label: "Pick a situation", detail: "Flux, Faraday and Lenz, a moving rod, a generator or an RL circuit." },
          { label: "Play or drag time", detail: "Diagram, numbers and graphs share one clock." },
          { label: "Read the sign", detail: "Positive EMF is counter-clockwise seen from the side the normal n̂ points to." },
        ]}
        aside={<Badge tone="neutral" title="Uniform fields, ideal components, no loop self-inductance.">ideal components</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch
          blurbs={{ practice: "Predict what a change does, then check it against the model.", challenge: "Reach a stated target setup; the model checks it." }}
          mode={mode}
          modes={["explore", "practice", "challenge"]}
          onChange={(m) => set((c) => ({ ...c, mode: m }))}
        />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="SI units. Sign convention: ε = −N dΦ/dt; positive = counter-clockwise from the n̂ side." title="Setup">
          <Segmented<InductionScenario> label="Situation" onChange={setScenario} options={INDUCTION_SCENARIOS.map((s) => ({ id: s, label: SCENARIO_LABEL[s] }))} value={sc} />

          {sc === "flux" ? (
            <>
              <ParamSlider format={(xv) => `${fmt(xv)} T`} label="Field B" max={2} min={0} onChange={(B) => setFlux({ B })} step={0.05} value={raw.flux.B} />
              <NumberField hint="Magnitude, 0 to 20 T." label="Field B" onChange={(B) => setFlux({ B })} unit="T" value={raw.flux.B} />
              <NumberField label="Loop area A" onChange={(A) => setFlux({ A })} unit="m²" value={raw.flux.A} />
              <NumberField hint="Whole number, 1 to 10 000." label="Turns N" onChange={(N) => setFlux({ N })} value={raw.flux.N} />
              <ParamSlider format={(xv) => `${fmt(xv)}°`} label="Angle θ between n̂ and B" max={180} min={-180} onChange={(thetaDeg) => setFlux({ thetaDeg })} step={1} value={raw.flux.thetaDeg} />
              <NumberField label="Angle θ" onChange={(thetaDeg) => setFlux({ thetaDeg })} unit="°" value={raw.flux.thetaDeg} />
            </>
          ) : null}

          {sc === "faraday" ? (
            <>
              <div className="gc-presets" role="group" aria-label="Example situations">
                {FARADAY_PRESETS.map((q) => <button className="secondary-button gc-chip" key={q.label} onClick={() => set((c) => ({ ...c, faraday: { ...c.faraday, ...q.p }, tNow: 0 }))} type="button">{q.label}</button>)}
              </div>
              <NumberField hint="Signed: negative means the field points against n̂ when θ = 0." label="Initial field B₀" onChange={(B0) => setF({ B0 })} unit="T" value={raw.faraday.B0} />
              <NumberField label="Field rate dB/dt" onChange={(bRate) => setF({ bRate })} unit="T/s" value={raw.faraday.bRate} />
              <ParamSlider format={(xv) => `${fmt(xv)} T/s`} label="Field rate dB/dt" max={2} min={-2} onChange={(bRate) => setF({ bRate })} step={0.05} value={raw.faraday.bRate} />
              <NumberField label="Initial area A₀" onChange={(A0) => setF({ A0 })} unit="m²" value={raw.faraday.A0} />
              <NumberField label="Area rate dA/dt" onChange={(aRate) => setF({ aRate })} unit="m²/s" value={raw.faraday.aRate} />
              <NumberField label="Turns N" onChange={(N) => setF({ N })} value={raw.faraday.N} />
              <NumberField label="Initial angle θ₀" onChange={(theta0Deg) => setF({ theta0Deg })} unit="°" value={raw.faraday.theta0Deg} />
              <NumberField label="Rotation rate ω" onChange={(omega) => setF({ omega })} unit="rad/s" value={raw.faraday.omega} />
              <label className="gc-check"><input checked={raw.faraday.closed} onChange={(e) => setF({ closed: e.target.checked })} type="checkbox" /> Closed circuit (a current can flow)</label>
              <NumberField label="Circuit resistance R" onChange={(R) => setF({ R })} unit="Ω" value={raw.faraday.R} />
              <NumberField label="Duration" onChange={(duration) => setF({ duration })} unit="s" value={raw.faraday.duration} />
            </>
          ) : null}

          {sc === "motional" ? (
            <>
              <ParamSlider format={(xv) => `${fmt(xv)} T`} label="Field Bz (positive: out of the screen)" max={2} min={-2} onChange={(Bz) => setM({ Bz })} step={0.05} value={raw.motional.Bz} />
              <NumberField hint="Positive: out of the screen ⊙. Negative: into the screen ⊗." label="Field Bz" onChange={(Bz) => setM({ Bz })} unit="T" value={raw.motional.Bz} />
              <NumberField label="Rod length L" onChange={(L) => setM({ L })} unit="m" value={raw.motional.L} />
              <ParamSlider format={(xv) => `${fmt(xv)}°`} label="Rod direction (tail → tip, from +x)" max={180} min={-180} onChange={(rodAngleDeg) => setM({ rodAngleDeg })} step={5} value={raw.motional.rodAngleDeg} />
              <NumberField label="Rod direction" onChange={(rodAngleDeg) => setM({ rodAngleDeg })} unit="°" value={raw.motional.rodAngleDeg} />
              <NumberField label="Speed v" onChange={(v2) => setM({ v: v2 })} unit="m/s" value={raw.motional.v} />
              <ParamSlider format={(xv) => `${fmt(xv)}°`} label="Velocity direction (from +x)" max={180} min={-180} onChange={(velAngleDeg) => setM({ velAngleDeg })} step={5} value={raw.motional.velAngleDeg} />
              <NumberField label="Velocity direction" onChange={(velAngleDeg) => setM({ velAngleDeg })} unit="°" value={raw.motional.velAngleDeg} />
              <NumberField hint="Used when the rod moves perpendicular to its length (rails)." label="Circuit resistance R" onChange={(R) => setM({ R })} unit="Ω" value={raw.motional.R} />
            </>
          ) : null}

          {sc === "generator" ? (
            <>
              <div className="gc-presets" role="group" aria-label="Example generators">
                <button className="secondary-button gc-chip" onClick={() => set((c) => ({ ...c, generator: { B: 0.4, A: 0.05, N: 200, frequency: 50, theta0Deg: 0, periods: 2 }, tNow: 0 }))} type="button">50 Hz coil</button>
                <button className="secondary-button gc-chip" onClick={() => set((c) => ({ ...c, generator: { B: 0.25, A: 0.02, N: 90, frequency: 60, theta0Deg: 0, periods: 2 }, tNow: 0 }))} type="button">60 Hz coil</button>
                <button className="secondary-button gc-chip" onClick={() => set((c) => ({ ...c, generator: { B: 0.5, A: 0.01, N: 100, frequency: 1, theta0Deg: 0, periods: 3 }, tNow: 0 }))} type="button">Hand-cranked (1 Hz)</button>
              </div>
              <NumberField label="Field B" onChange={(B) => setG({ B })} unit="T" value={raw.generator.B} />
              <NumberField label="Coil area A" onChange={(A) => setG({ A })} unit="m²" value={raw.generator.A} />
              <NumberField label="Turns N" onChange={(N) => setG({ N })} value={raw.generator.N} />
              <NumberField label="Rotation frequency" onChange={(frequency) => setG({ frequency })} unit="Hz" value={raw.generator.frequency} />
              <ParamSlider format={(xv) => `${fmt(xv)}°`} label="Starting angle θ₀" max={180} min={-180} onChange={(theta0Deg) => setG({ theta0Deg })} step={5} value={raw.generator.theta0Deg} />
              <NumberField hint="Whole number, 1 to 6." label="Periods shown" onChange={(periods) => setG({ periods })} value={raw.generator.periods} />
            </>
          ) : null}

          {sc === "rl" ? (
            <>
              <div className="gc-presets" role="group" aria-label="Example circuits">
                {RL_PRESETS.map((q) => <button className="secondary-button gc-chip" key={q.label} onClick={() => set((c) => ({ ...c, rl: { ...c.rl, ...q.p }, tNow: 0 }))} type="button">{q.label}</button>)}
              </div>
              <NumberField label="Source voltage Vs" onChange={(Vs) => setR({ Vs })} unit="V" value={raw.rl.Vs} />
              <ParamSlider format={(xv) => `${fmt(xv)} V`} label="Source voltage Vs" max={50} min={-50} onChange={(Vs) => setR({ Vs })} step={0.5} value={raw.rl.Vs} />
              <NumberField label="Initial current i₀" onChange={(i0) => setR({ i0 })} unit="A" value={raw.rl.i0} />
              <NumberField label="Resistance R" onChange={(R) => setR({ R })} unit="Ω" value={raw.rl.R} />
              <NumberField label="Inductance L" onChange={(L) => setR({ L })} unit="H" value={raw.rl.L} />
              <Segmented<"3" | "5" | "7" | "10"> label="Time shown (in time constants)" onChange={(s) => setR({ spanTau: Number(s) })} options={RL_LIMITS.spans.map((s) => ({ id: String(s) as "3" | "5" | "7" | "10", label: `${s} τ` }))} value={String(raw.rl.spanTau) as "3" | "5" | "7" | "10"} />
            </>
          ) : null}
          {errors.length ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
        </Panel>

        <div className="gc-stage">
          {/* ---------------- flux ---------------- */}
          {ok && sc === "flux" && xp ? (() => {
            const f = fluxOf(xp.B, xp.A, xp.thetaDeg);
            const curve = Array.from({ length: 361 }, (_, i) => ({ x: -180 + i, y: fluxOf(xp.B, xp.A, -180 + i) }));
            const word = Math.abs(Math.cos((xp.thetaDeg * Math.PI) / 180)) < 1e-9 ? "edge-on to the field: no flux" : f > 0 ? "the field crosses the loop along n̂: positive flux" : "the field crosses the loop against n̂: negative flux";
            return (
              <>
                <Callout tone="info" title={`Flux through one turn: ${formatSI(f, "Wb")}`}>
                  <p>Φ = B A cos θ. Here {word}. With N = {xp.N} turns the flux linkage is NΦ = {formatSI(fluxLinkage(xp), "Wb")}. Drag the angle slider and count how many field lines cross the loop.</p>
                </Callout>
                <DiagramFrame caption="The loop is seen edge-on. n̂ is its area normal (amber); the highlighted field lines are the ones that cross the loop. Flux is largest when n̂ is along the field." label="Magnetic flux through a loop" title="Loop in a uniform field">
                  <LoopFieldDiagram A={xp.A} Ascale={xp.A} B={xp.B} Bscale={Math.max(xp.B, 1e-9)} flux={f} N={xp.N} sense={null} thetaDeg={xp.thetaDeg} />
                </DiagramFrame>
                <KeyFigures items={[
                  { label: "Flux per turn Φ", value: formatSI(zeroNoise(f, xp.B * xp.A), "Wb"), note: "B A cos θ" },
                  { label: "Flux linkage NΦ", value: formatSI(zeroNoise(xp.N * f, xp.N * xp.B * xp.A), "Wb"), note: `N = ${xp.N}` },
                  { label: "Effective area", value: `${fmt(xp.A * Math.cos((xp.thetaDeg * Math.PI) / 180))} m²`, note: "A cos θ, the area facing the field" },
                  { label: "Maximum flux", value: formatSI(xp.B * xp.A, "Wb"), note: "at θ = 0°" },
                ]} />
                <DiagramFrame caption="Φ against θ, from the same flux function. Drag the marker or use the arrow keys to turn the loop." label="Flux against angle" legend={<Legend items={[{ label: "Φ(θ)", color: "#0b6a72", kind: "line" }]} />} title="Flux against angle">
                  <LineChart
                    current={{ x: xp.thetaDeg, y: f }}
                    formatX={(xv) => String(Number(xv.toPrecision(3)))}
                    formatY={(yv) => String(Number(yv.toPrecision(3)))}
                    onXChange={(xv) => setFlux({ thetaDeg: Math.round(xv) })}
                    series={[{ id: "phi", label: "Φ", color: "#0b6a72", points: curve }]}
                    title="Flux against angle"
                    valueText={`Flux ${formatSI(f, "Wb")} at θ = ${fmt(xp.thetaDeg)}°`}
                    xDomain={[-180, 180]}
                    xLabel="θ (degrees)"
                    xStep={1}
                    yDomain={pad(-xp.B * xp.A, xp.B * xp.A)}
                    yLabel="Φ (Wb)"
                  />
                </DiagramFrame>
              </>
            );
          })() : null}

          {/* ---------------- Faraday and Lenz ---------------- */}
          {ok && sc === "faraday" && fp ? (() => {
            const tt = Math.min(t, fp.duration), L = lenz(fp, tt);
            const Bt = fieldAtTime(fp, tt), At = areaAtTime(fp, tt), th = angleAtTime(fp, tt);
            const Bmax = Math.max(...ftrace.map((q) => Math.abs(q.B)), 1e-9), Amax = Math.max(...ftrace.map((q) => q.A), 1e-9);
            const phiScale = siScale(Math.max(...ftrace.map((q) => Math.abs(q.flux)), 1e-30), "Wb");
            const eScale = siScale(Math.max(...ftrace.map((q) => Math.abs(q.emf)), 1e-30), "V");
            const iScale = siScale(Math.max(...ftrace.map((q) => Math.abs(q.current)), 1e-30), "A");
            const sense = L.change === "constant" ? "none" : L.sense;
            const pts = (key: "flux" | "emf" | "current", f: number): ChartSeries[] => [{ id: key, label: key, color: key === "flux" ? "#0b6a72" : key === "emf" ? "#be123c" : "#b45309", points: ftrace.map((q) => ({ x: x(q.t), y: q[key] / f })) }];
            return (
              <>
                <SimControls format={(s) => formatSI(s, "s")} labels={SPEED_TEXT} onPause={() => { clock.pause(); setT(t, true); }} onPlay={clock.play} onReset={() => { clock.pause(); setT(0, true); }} onSpeed={(speed) => set((c) => ({ ...c, speed }))} onTime={(s) => { clock.pause(); setT(s, true); }} playing={clock.playing} rateOf={rateForTransient} speed={raw.speed} speeds={SPEEDS} t={t} tEnd={end} />
                <Callout tone={L.change === "constant" ? "info" : "ok"} title={`ε = −N dΦ/dt = ${formatSI(L.emf, "V")} — ${L.change === "constant" ? "no induced current" : `flux ${L.change}, current ${fp.closed ? senseWord(sense) : `would be ${senseWord(sense)}`}`}`}>
                  <p>{L.text}</p>
                </Callout>
                <DiagramFrame caption={`Positive EMF and current run counter-clockwise ${VIEWING_CONVENTION}. The ⊙ and ⊗ at the ends of the loop show which way the induced current crosses the screen; the rose arrow is its own magnetic field, always opposing the change in flux.`} label="Loop, changing flux and induced current" title="Faraday and Lenz">
                  <LoopFieldDiagram A={At} Ascale={Amax} B={Bt} Bscale={Bmax} flux={fluxAtTime(fp, tt)} N={fp.N} open={!fp.closed} sense={sense as "none" | "clockwise" | "counterclockwise"} thetaDeg={th} />
                </DiagramFrame>
                <KeyFigures items={[
                  { label: "Time", value: formatSI(tt, "s") },
                  { label: "B · A · θ", value: `${fmt(Bt)} T · ${fmt(At)} m² · ${fmt(th)}°` },
                  { label: "Flux Φ", value: formatSI(zeroNoise(L.flux, Bmax * Amax), "Wb"), note: `linkage NΦ = ${formatSI(zeroNoise(fp.N * L.flux, fp.N * Bmax * Amax), "Wb")}` },
                  { label: "dΦ/dt", value: formatSI(L.dFluxDt, "Wb/s"), note: L.change },
                  { label: "EMF ε", value: formatSI(L.emf, "V"), note: "−N dΦ/dt" },
                  { label: "Current", value: fp.closed ? formatSI(L.current, "A") : "none (open)", note: fp.closed ? `${senseWord(sense)}, ε/R` : `would be ${senseWord(sense)}` },
                ]} />
                <div className="ph-charts">
                  <DiagramFrame label="Flux versus time" legend={<Legend items={[{ label: "Φ per turn", color: "#0b6a72", kind: "line" }]} />} title="Flux Φ(t)">
                    {chart("Flux versus time", `Φ (${phiScale.unit})`, pts("flux", phiScale.factor), L.flux / phiScale.factor, Math.min(...ftrace.map((q) => q.flux)) / phiScale.factor, Math.max(...ftrace.map((q) => q.flux)) / phiScale.factor, `Flux ${formatSI(L.flux, "Wb")} at ${formatSI(tt, "s")}`)}
                  </DiagramFrame>
                  <DiagramFrame label="EMF versus time" legend={<Legend items={[{ label: "ε = −N dΦ/dt", color: "#be123c", kind: "line" }]} />} title="EMF ε(t)">
                    {chart("EMF versus time", `ε (${eScale.unit})`, pts("emf", eScale.factor), L.emf / eScale.factor, Math.min(...ftrace.map((q) => q.emf), 0) / eScale.factor, Math.max(...ftrace.map((q) => q.emf), 0) / eScale.factor, `EMF ${formatSI(L.emf, "V")} at ${formatSI(tt, "s")}`)}
                  </DiagramFrame>
                  {fp.closed ? (
                    <DiagramFrame label="Current versus time" legend={<Legend items={[{ label: "i = ε/R", color: "#b45309", kind: "line" }]} />} title="Current i(t)">
                      {chart("Current versus time", `i (${iScale.unit})`, pts("current", iScale.factor), L.current / iScale.factor, Math.min(...ftrace.map((q) => q.current), 0) / iScale.factor, Math.max(...ftrace.map((q) => q.current), 0) / iScale.factor, `Current ${formatSI(L.current, "A")} at ${formatSI(tt, "s")}`)}
                    </DiagramFrame>
                  ) : null}
                </div>
                <p className="ph-note">The EMF graph is −N times the slope of the flux graph: where Φ rises, ε is negative; where Φ falls, ε is positive; where Φ is flat, ε = 0.</p>
              </>
            );
          })() : null}

          {/* ---------------- motional EMF ---------------- */}
          {ok && sc === "motional" && mp ? (() => {
            const r = motionalEmf(mp);
            const speeds = Array.from({ length: 101 }, (_, i) => { const vv = (Math.max(2 * mp.v, 10) * i) / 100; return { x: vv, y: motionalEmf({ ...mp, v: vv }).emf }; });
            const angles = Array.from({ length: 361 }, (_, i) => ({ x: -180 + i, y: motionalEmf({ ...mp, rodAngleDeg: -180 + i }).emf }));
            const eMax = Math.abs(mp.Bz) * mp.L * Math.max(2 * mp.v, 10);
            return (
              <>
                <SimControls format={(s) => `${fmt(s / MOTIONAL_RUN_S)} of the run`} labels={SPEED_TEXT} onPause={() => { clock.pause(); setT(t, true); }} onPlay={clock.play} onReset={() => { clock.pause(); setT(0, true); }} onSpeed={(speed) => set((c) => ({ ...c, speed }))} onTime={(s) => { clock.pause(); setT(s, true); }} playing={clock.playing} rateOf={rateForTransient} speed={raw.speed} speeds={SPEEDS} t={t} tEnd={end} />
                <Callout tone="info" title={`Motional EMF ${formatSI(r.emf, "V")}${r.positiveEnd === "neither" ? " — none" : ` — the ${r.positiveEnd} of the rod is positive`}`}>
                  <p>Positive charges in the rod feel q v × B. The EMF is ε = (v × B)·L = B L v sin(ψ − α) where ψ is the velocity direction and α the rod direction: {fmt(r.geometryFactor)} here. {r.rails ? `The closed rails circuit carries ${formatSI(r.rails.current, "A")}, so the magnetic force on the rod, ${formatSI(r.rails.force, "N")}, opposes the motion (Lenz): the mechanical power ${formatSI(r.rails.mechanicalPower, "W")} you supply equals the electrical power ${formatSI(r.rails.electricalPower, "W")} dissipated in R.` : "The rails model needs the rod to move perpendicular to its length."}</p>
                </Callout>
                <DiagramFrame caption="Inside the rod, current flows from the negative end to the positive end (like a battery), and returns through the rails. The amber arrow is the force on positive charges, q(v × B)." label="Rod moving in a magnetic field" title="Moving rod">
                  <MotionalDiagram p={mp} progress={Math.min(1, t / MOTIONAL_RUN_S)} r={r} />
                </DiagramFrame>
                <KeyFigures items={[
                  { label: "EMF ε", value: formatSI(zeroNoise(r.emf, mp.Bz * mp.v * mp.L), "V"), note: "(v × B)·L" },
                  { label: "Positive end", value: r.positiveEnd, note: "higher potential" },
                  { label: "sin(ψ − α)", value: fmt(r.geometryFactor), note: r.perpendicular ? "rod ⟂ velocity" : "rod not perpendicular" },
                  { label: "Rails current", value: r.rails ? formatSI(r.rails.current, "A") : "—", note: r.rails ? "ε/R" : "needs a perpendicular rod" },
                  { label: "Braking force", value: r.rails ? formatSI(r.rails.force, "N") : "—", note: "B I L, against v" },
                  { label: "Power", value: r.rails ? formatSI(r.rails.electricalPower, "W") : "—", note: "= F v" },
                ]} />
                <div className="ph-charts">
                  <DiagramFrame label="EMF against speed" title="EMF against speed">
                    <LineChart
                      current={{ x: mp.v, y: r.emf }}
                      formatX={(xv) => String(Number(xv.toPrecision(3)))}
                      formatY={(yv) => String(Number(yv.toPrecision(3)))}
                      onXChange={(xv) => setM({ v: Math.max(0, Math.round(xv * 10) / 10) })}
                      series={[{ id: "emf-v", label: "ε", color: "#be123c", points: speeds }]}
                      title="EMF against speed"
                      valueText={`EMF ${formatSI(r.emf, "V")} at ${formatSI(mp.v, "m/s")}`}
                      xDomain={[0, Math.max(2 * mp.v, 10)]}
                      xLabel="speed v (m/s)"
                      xStep={0.1}
                      yDomain={pad(Math.min(0, -eMax, eMax), Math.max(eMax, 1e-12))}
                      yLabel="ε (V)"
                    />
                  </DiagramFrame>
                  <DiagramFrame label="EMF against rod direction" title="EMF against rod direction">
                    <LineChart
                      current={{ x: ((mp.rodAngleDeg + 180) % 360 + 360) % 360 - 180, y: r.emf }}
                      formatX={(xv) => String(Number(xv.toPrecision(3)))}
                      formatY={(yv) => String(Number(yv.toPrecision(3)))}
                      onXChange={(xv) => setM({ rodAngleDeg: Math.round(xv) })}
                      series={[{ id: "emf-a", label: "ε", color: "#be123c", points: angles }]}
                      title="EMF against rod direction"
                      valueText={`EMF ${formatSI(r.emf, "V")} at rod direction ${fmt(mp.rodAngleDeg)}°`}
                      xDomain={[-180, 180]}
                      xLabel="rod direction α (degrees)"
                      xStep={1}
                      yDomain={pad(-Math.abs(mp.Bz) * mp.L * mp.v, Math.max(Math.abs(mp.Bz) * mp.L * mp.v, 1e-12))}
                      yLabel="ε (V)"
                    />
                  </DiagramFrame>
                </div>
              </>
            );
          })() : null}

          {/* ---------------- generator ---------------- */}
          {ok && sc === "generator" && gp ? (() => {
            const tt = Math.min(t, gp.periods / gp.frequency), s = generatorState(gp, tt);
            const fScale = siScale(gp.B * gp.A, "Wb"), eScale = siScale(generatorPeakEmf(gp), "V");
            const sense = Math.abs(s.emf) < 1e-9 * generatorPeakEmf(gp) ? "none" : s.emf > 0 ? "counterclockwise" : "clockwise";
            const T = generatorPeriod(gp);
            const peaks: ChartMarker[] = [{ id: "pk", kind: "info", label: "ε peak", x: x(((Math.PI / 2 - (gp.theta0Deg * Math.PI) / 180) / generatorOmega(gp) + T) % T), y: generatorPeakEmf(gp) / eScale.factor }];
            return (
              <>
                <SimControls format={(q) => `${formatSI(q, "s")} = ${fmt(q / T)} periods`} labels={SPEED_TEXT} onPause={() => { clock.pause(); setT(t, true); }} onPlay={clock.play} onReset={() => { clock.pause(); setT(0, true); }} onSpeed={(sp) => set((c) => ({ ...c, speed: sp }))} onTime={(q) => { clock.pause(); setT(q, true); }} playing={clock.playing} rateOf={rateForTransient} speed={raw.speed} speeds={SPEEDS} t={t} tEnd={end} />
                <Callout tone="info" title={`ε = N B A ω sin θ = ${formatSI(s.emf, "V")} at θ = ${fmt(((s.thetaDeg % 360) + 360) % 360)}°`}>
                  <p>The EMF follows the <em>slope</em> of the flux, not its value: it is zero when the flux is largest (coil facing the field) and largest when the flux passes through zero (coil edge-on). The EMF graph is the flux graph shifted a quarter period later (a 90° phase lag), with the sign flipped by Lenz's law.</p>
                </Callout>
                <DiagramFrame caption="The coil turns at constant ω. Highlighted lines cross the coil; ⊙ and ⊗ mark the direction the induced current crosses the screen." label="Rotating coil generator" title="Coil turning in a field">
                  <LoopFieldDiagram A={gp.A} Ascale={gp.A} B={gp.B} Bscale={gp.B} flux={s.flux} N={gp.N} sense={sense as "none" | "clockwise" | "counterclockwise"} thetaDeg={s.thetaDeg} />
                </DiagramFrame>
                <KeyFigures items={[
                  { label: "Angle θ", value: `${fmt(((s.thetaDeg % 360) + 360) % 360)}°`, note: `ω = ${fmt(generatorOmega(gp))} rad/s` },
                  { label: "Flux per turn Φ", value: formatSI(zeroNoise(s.flux, gp.B * gp.A), "Wb"), note: "BA cos θ" },
                  { label: "EMF ε", value: formatSI(zeroNoise(s.emf, generatorPeakEmf(gp)), "V"), note: "NBAω sin θ" },
                  { label: "Peak EMF", value: formatSI(generatorPeakEmf(gp), "V"), note: "NBAω" },
                  { label: "RMS EMF", value: formatSI(generatorRmsEmf(gp), "V"), note: "peak/√2" },
                  { label: "Period", value: formatSI(T, "s"), note: `${fmt(gp.frequency)} Hz` },
                ]} />
                <div className="ph-charts">
                  <DiagramFrame label="Flux versus time" legend={<Legend items={[{ label: "Φ per turn", color: "#0b6a72", kind: "line" }]} />} title="Flux Φ(t)">
                    {chart("Flux versus time", `Φ (${fScale.unit})`, [{ id: "flux", label: "Φ", color: "#0b6a72", points: gtrace.map((q) => ({ x: x(q.t), y: q.flux / fScale.factor })) }], s.flux / fScale.factor, -gp.B * gp.A / fScale.factor, gp.B * gp.A / fScale.factor, `Flux ${formatSI(s.flux, "Wb")} at ${formatSI(tt, "s")}`)}
                  </DiagramFrame>
                  <DiagramFrame label="EMF versus time" legend={<Legend items={[{ label: "ε(t)", color: "#be123c", kind: "line" }]} />} title="EMF ε(t)">
                    {chart("EMF versus time", `ε (${eScale.unit})`, [{ id: "emf", label: "ε", color: "#be123c", points: gtrace.map((q) => ({ x: x(q.t), y: q.emf / eScale.factor })) }], s.emf / eScale.factor, -generatorPeakEmf(gp) / eScale.factor, generatorPeakEmf(gp) / eScale.factor, `EMF ${formatSI(s.emf, "V")} at ${formatSI(tt, "s")}`, peaks)}
                  </DiagramFrame>
                </div>
              </>
            );
          })() : null}

          {/* ---------------- RL circuit ---------------- */}
          {ok && sc === "rl" && rp ? (() => {
            const tau = rlTau(rp), tt = Math.min(t, rlEnd(rp)), s = rlState(rp, tt);
            const kind = rlKind(rp);
            const iInf = rp.Vs / rp.R;
            const tMark = (y: number): ChartMarker[] => (tau <= rlEnd(rp) ? [{ id: "tau", kind: "half", label: "t = τ", x: x(tau), y }] : []);
            const iScale = siScale(Math.max(Math.abs(iInf), Math.abs(rp.i0), 1e-30), "A");
            const vMax = Math.max(Math.abs(rp.Vs), Math.abs(rp.R * rp.i0), 1e-30);
            const uMax = Math.max(...rtrace.map((q) => q.energy), 1e-30);
            const uScale = siScale(uMax, "J");
            const iSeries = (id: string, label: string, ys: number[], color: string, dash?: string): ChartSeries => ({ id, label, color, dash, points: rtrace.map((q, n) => ({ x: x(q.t), y: ys[n] })) });
            return (
              <>
                <SimControls format={(q) => `${formatSI(q, "s")} = ${fmt(q / tau)} τ`} labels={SPEED_TEXT} onPause={() => { clock.pause(); setT(t, true); }} onPlay={clock.play} onReset={() => { clock.pause(); setT(0, true); }} onSpeed={(sp) => set((c) => ({ ...c, speed: sp }))} onTime={(q) => { clock.pause(); setT(q, true); }} playing={clock.playing} rateOf={rateForTransient} speed={raw.speed} speeds={SPEEDS} t={t} tEnd={end} />
                <Callout tone={kind === "steady" ? "info" : "ok"} title={kind === "growth" ? "Current growing toward Vs/R" : kind === "decay" ? "Current decaying toward Vs/R" : "No transient (i₀ = Vs/R)"}>
                  <p>The inductor opposes <em>changes</em> in current with an EMF −L di/dt, so the current cannot jump: it moves from i₀ = {fmt(rp.i0)} A toward Vs/R = {fmt(iInf)} A with time constant τ = L/R = {formatSI(tau, "s")}. In the steady state di/dt = 0 and the inductor drops no voltage.</p>
                </Callout>
                <DiagramFrame caption="Passive sign convention: the current enters the + terminal of the inductor, so v_L = +L di/dt. When the current falls, v_L is negative and the inductor drives current like a source." label="RL circuit" title="Circuit at the selected time">
                  <RlDiagram now={s} p={rp} />
                </DiagramFrame>
                <KeyFigures items={[
                  { label: "Time", value: formatSI(tt, "s"), note: `${fmt(tt / tau)} τ` },
                  { label: "Current i", value: formatSI(s.i, "A"), note: `${fmt(100 * s.progress)} % of the way to ${fmt(iInf)} A` },
                  { label: "Inductor voltage vL", value: formatSI(s.vL, "V"), note: `L di/dt, di/dt = ${formatSI(s.didt, "A/s")}` },
                  { label: "Resistor voltage vR", value: formatSI(s.vR, "V"), note: "R i" },
                  { label: "Stored energy U", value: formatSI(s.energy, "J"), note: "½ L i²" },
                  { label: "Flux linkage NΦ", value: formatSI(s.linkage, "Wb"), note: "L i" },
                ]} />
                <div className="ph-charts">
                  <DiagramFrame label="Current versus time" legend={<Legend items={[{ label: "i(t)", color: "#0b6a72", kind: "line" }, { label: `final Vs/R = ${fmt(iInf)} A`, color: "#64748b", kind: "dashed" }]} />} title="Current i(t)">
                    {chart("Current versus time", `i (${iScale.unit})`, [iSeries("final", "Vs/R", rtrace.map(() => iInf / iScale.factor), "#64748b", "7 4"), iSeries("i", "i", rtrace.map((q) => q.i / iScale.factor), "#0b6a72")], s.i / iScale.factor, Math.min(rp.i0, iInf, 0) / iScale.factor, Math.max(rp.i0, iInf, 0) / iScale.factor, `Current ${formatSI(s.i, "A")} at ${formatSI(tt, "s")}`, tMark(rlState(rp, tau).i / iScale.factor))}
                  </DiagramFrame>
                  <DiagramFrame label="Voltages versus time" legend={<Legend items={[{ label: "vR = Ri", color: "#b45309", kind: "line" }, { label: "vL = L di/dt", color: "#be123c", kind: "dashed" }]} />} title="Voltages vR(t) and vL(t)">
                    {chart("Voltages versus time", "voltage (V)", [iSeries("vr", "vR", rtrace.map((q) => q.vR), "#b45309"), iSeries("vl", "vL", rtrace.map((q) => q.vL), "#be123c", "7 4")], s.vL, Math.min(...rtrace.map((q) => Math.min(q.vR, q.vL)), 0), Math.max(...rtrace.map((q) => Math.max(q.vR, q.vL)), vMax * 0.01), `Inductor voltage ${formatSI(s.vL, "V")} at ${formatSI(tt, "s")}`)}
                  </DiagramFrame>
                  <DiagramFrame label="Stored energy versus time" title="Energy U(t) = ½ L i²">
                    {chart("Stored energy versus time", `U (${uScale.unit})`, [iSeries("u", "U", rtrace.map((q) => q.energy / uScale.factor), "#6d28d9")], s.energy / uScale.factor, 0, uMax / uScale.factor, `Stored energy ${formatSI(s.energy, "J")} at ${formatSI(tt, "s")}`)}
                  </DiagramFrame>
                </div>
              </>
            );
          })() : null}

          {!ok ? <Callout tone="info" title="Enter valid values to see the diagram"><p>{errors[0] ?? "The diagram appears as soon as every field is valid."}</p></Callout> : null}

          {ok && v ? (
            practice ? (
              scenarios.length && practiceInput ? <GcPredictPanel input={practiceInput} onApply={(next) => set(() => next)} scenarios={scenarios} /> : <Callout tone="info" title="Nothing to predict here"><p>Practice questions need valid settings.</p></Callout>
            ) : challenge ? (
              <ChallengePanel
                challenges={INDUCTION_CHALLENGES}
                index={Math.min(raw.challenge, INDUCTION_CHALLENGES.length - 1)}
                inputs={v}
                onIndex={(i) => set((c) => ({ ...c, challenge: i }))}
                onPick={(c) => { if (c.view) setScenario(c.view as InductionScenario); }}
              />
            ) : (
              <Panel subtitle="Each answer quotes the numbers for the setup you have chosen." title="Why does it behave this way?">
                {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
              </Panel>
            )
          ) : null}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{INDUCTION_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      <RelatedConcepts subject="physics" toolId="phInduction" />
    </div>
  );
}
