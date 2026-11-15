import { useEffect, useMemo, useRef, useState } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import { LineChart, type ChartMarker, type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch, type LearningMode } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GcPredictPanel, NumberField, Paragraphs } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { fmt, formatSI, siScale } from "../../utils/physics/format";
import { rcLessons, rcScenarios } from "../../utils/physics/physicsLearning";
import { RC_ASSUMPTIONS, summarizeRc } from "../../utils/physics/physicsSummary";
import { RC_LIMITS, samples, stateAt, summarize, tEnd as rcEnd, timeConstant, validateRc, type RcInput } from "../../utils/physics/rc";
import { rateForTransient, type SpeedChoice } from "../../utils/physics/simClock";
import {
  DEFAULT_RC_INPUTS, describeRcAnalysis, RC_ENGINE_VERSION, validatePhysicsResults, validateRcInputs, type RcInputs,
} from "../../utils/persistence/physicsTools";
import { RcDiagram } from "./RcDiagram";
import { ParamSlider, SimControls } from "./sim";
import { useSimClock } from "./simHooks";
import { useSimTime } from "./useSimTime";

type Props = {
  openRequest?: { id: string; recordId: string } | null;
  onOpenHandled?: (requestId: string) => void;
};

const PRESETS: Array<{ label: string; rc: Partial<RcInput> }> = [
  { label: "Charging from empty", rc: { Vs: 9, V0: 0, R: 10_000, C: 100e-6 } },
  { label: "Discharging through R", rc: { Vs: 0, V0: 9, R: 10_000, C: 100e-6 } },
  { label: "Partly charged, then driven higher", rc: { Vs: 12, V0: 3, R: 4_700, C: 220e-6 } },
  { label: "Fast: microsecond circuit", rc: { Vs: 5, V0: 0, R: 1_000, C: 1e-9 } },
];
const SPEEDS: SpeedChoice[] = ["quarter", "real", "fast"];
const SPEED_TEXT: Partial<Record<SpeedChoice, string>> = { quarter: "Slow 12 s", real: "Normal 6 s", fast: "Fast 3 s" };

export default function RcPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<RcInputs>({
    page: "rc",
    engineVersion: RC_ENGINE_VERSION,
    defaults: DEFAULT_RC_INPUTS,
    validateInputs: validateRcInputs,
    validateResults: validatePhysicsResults,
    summarize: summarizeRc,
    describe: describeRcAnalysis,
    fallbackName: "RC transient",
    openRequest,
    onOpenHandled,
    onReset: () => resetClockRef.current(),
  });
  const resetClockRef = useRef<() => void>(() => undefined);
  const { raw, update } = ws;
  const [mode, setMode] = useState<LearningMode>("explore");
  const setRc = (patch: Partial<RcInput>) => update((c) => ({ ...c, rc: { ...c.rc, ...patch } }));

  const check = useMemo(() => validateRc(raw.rc), [raw.rc]);
  const errors = check.ok ? null : check.errors;
  const p = check.ok ? check.value : null;
  const errorFor = (needle: RegExp) => errors?.find((e) => needle.test(e)) ?? null;
  const tau = p ? timeConstant(p) : 0;
  const end = p ? rcEnd(p) : 0;
  const sum = useMemo(() => (p ? summarize(p) : null), [p]);

  const [t, setT] = useSimTime(raw.tNow, end, (next) => update((c) => (Object.is(c.tNow, next) ? c : { ...c, tNow: next })));
  const clock = useSimClock({ t, tEnd: end, rate: rateForTransient(raw.speed, end), onTime: (next, final) => setT(next, final) });
  useEffect(() => { resetClockRef.current = () => { clock.pause(); setT(0, true); }; });
  const now = p ? stateAt(p, t) : null;

  const tScale = siScale(end, "s");
  const rows = useMemo(() => (p ? samples(p, 160) : []), [p]);
  const iMax = sum ? Math.abs(sum.I0) : 0;
  const iScale = siScale(iMax, "A");
  const eMax = p ? Math.max(0.5 * p.C * p.Vs ** 2, 0.5 * p.C * p.V0 ** 2, ...rows.map((r) => r.energy)) : 0;
  const eScale = siScale(eMax, "J");

  const x = (tt: number) => tt / tScale.factor;
  const lineOf = (id: string, label: string, ys: number[], color?: string, dash?: string): ChartSeries => ({ id, label, color, dash, points: rows.map((r, i) => ({ x: x(r.t), y: ys[i] })) });
  const flat = (y: number, id: string, label: string): ChartSeries => ({ id, label, color: "#64748b", dash: "7 4", points: [{ x: 0, y }, { x: x(end), y }] });
  const padY = (lo: number, hi: number): [number, number] => { const s = hi - lo || Math.max(1, Math.abs(hi)); return [lo - s * 0.08, hi + s * 0.08]; };
  const tauMarker = (y: number): ChartMarker[] => (p ? [{ id: "tau", kind: "half", label: "t = τ", x: x(tau), y }] : []);

  const practice = mode === "practice";
  const practiceInput = useMemo(() => (ws.valid ? { ...ws.valid, tNow: 0 } : null), [ws.valid?.rc]); // eslint-disable-line react-hooks/exhaustive-deps
  const scenarios = useMemo(() => (practiceInput ? rcScenarios(practiceInput) : []), [practiceInput]);
  const lessons = useMemo(() => (ws.valid ? rcLessons({ ...ws.valid, tNow: t }) : []), [ws.valid, t]);

  const dirLabel = sum?.direction === "charging" ? "Charging" : sum?.direction === "discharging" ? "Discharging" : "No transient (Vs = V₀)";
  const stateAtTau = p ? stateAt(p, tau) : null;

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Analyze"
        title="RC transient"
        purpose="Close the switch on one resistor and one capacitor and watch the capacitor voltage and the current approach their final values, with the circuit, readouts and graphs moving together."
        evidence="model"
        steps={[
          { label: "Set R, C and the voltages", detail: "Initial and final capacitor voltage are separate inputs." },
          { label: "Play or drag time", detail: "Diagram, numbers and graphs share one clock." },
          { label: "Find τ on the graph", detail: "63 % of the way after one time constant." },
        ]}
        aside={<Badge tone="neutral" title="One resistor, one capacitor, one loop.">1 R · 1 C · 1 loop</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice"]} onChange={setMode} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="At t = 0 the switch closes. The capacitor starts at V₀ and approaches Vs." title="Circuit">
          <div className="gc-presets" role="group" aria-label="Example circuits">
            {PRESETS.map((q) => <button className="secondary-button gc-chip" key={q.label} onClick={() => update((c) => ({ ...c, rc: { ...c.rc, ...q.rc }, tNow: 0 }))} type="button">{q.label}</button>)}
          </div>
          <ParamSlider format={(v) => `${fmt(v)} V`} label="Source voltage Vs (final capacitor voltage)" max={50} min={-50} onChange={(Vs) => setRc({ Vs })} step={0.5} value={raw.rc.Vs} />
          <NumberField error={errorFor(/Source voltage/)} label="Source voltage Vs" onChange={(Vs) => setRc({ Vs })} unit="V" value={raw.rc.Vs} />
          <ParamSlider format={(v) => `${fmt(v)} V`} label="Initial capacitor voltage V₀" max={50} min={-50} onChange={(V0) => setRc({ V0 })} step={0.5} value={raw.rc.V0} />
          <NumberField error={errorFor(/Initial capacitor/)} label="Initial capacitor voltage V₀" onChange={(V0) => setRc({ V0 })} unit="V" value={raw.rc.V0} />
          <NumberField error={errorFor(/Resistance/)} hint={Number.isFinite(raw.rc.R) ? formatSI(raw.rc.R, "Ω") : undefined} label="Resistance R" onChange={(R) => setRc({ R })} unit="Ω" value={raw.rc.R} />
          <NumberField error={errorFor(/Capacitance/)} hint={Number.isFinite(raw.rc.C) ? formatSI(raw.rc.C, "F") : undefined} label="Capacitance C" onChange={(C) => setRc({ C })} unit="F" value={raw.rc.C} />
          <Segmented<"3" | "5" | "7" | "10">
            label="Time shown (in time constants)"
            onChange={(s) => setRc({ spanTau: Number(s) })}
            options={RC_LIMITS.spans.map((s) => ({ id: String(s) as "3" | "5" | "7" | "10", label: `${s} τ` }))}
            value={String(raw.rc.spanTau) as "3" | "5" | "7" | "10"}
          />
          {errors ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
          <p className="gc-field-hint">Enter plain numbers in SI units (4700 for 4.7 kΩ, 1e-6 for 1 µF). Limits: |V| ≤ {RC_LIMITS.maxV} V, R {RC_LIMITS.minR} Ω–1 GΩ, C 1 pF–1 F.</p>
        </Panel>

        <div className="gc-stage">
          {p && sum && now ? (
            <>
              <SimControls
                format={(tt) => `${formatSI(tt, "s")} = ${fmt(tt / tau)} τ`}
                onPlay={clock.play}
                onPause={() => { clock.pause(); setT(t, true); }}
                onReset={() => { clock.pause(); setT(0, true); }}
                onSpeed={(speed) => update((c) => ({ ...c, speed }))}
                onTime={(tt) => { clock.pause(); setT(tt, true); }}
                playing={clock.playing}
                labels={SPEED_TEXT}
                rateOf={rateForTransient}
                speed={raw.speed}
                speeds={SPEEDS}
                t={t}
                tEnd={end}
              />
              <Callout tone={sum.direction === "steady" ? "info" : "ok"} title={dirLabel}>
                <p>
                  <strong>Initial</strong> capacitor voltage V₀ = {fmt(p.V0)} V → <strong>final</strong> voltage Vs = {fmt(p.Vs)} V.
                  {sum.direction === "steady" ? " They are equal, so no current flows and nothing changes." : ` The capacitor ${sum.direction === "charging" ? "rises" : "falls"} by ${fmt(Math.abs(p.Vs - p.V0))} V toward the source; the current is ${sum.direction === "charging" ? "positive (into the + plate)" : "negative (out of the + plate)"}.`}
                </p>
              </Callout>
              <DiagramFrame caption="The fill shows the capacitor voltage; the arrow shows the current direction and fades as the current dies away." label="RC circuit diagram" title="Circuit at the selected time">
                <RcDiagram i0={sum.I0} now={now} p={p} />
              </DiagramFrame>
              <KeyFigures
                items={[
                  { label: "Time", value: formatSI(now.t, "s"), note: `${fmt(now.t / tau)} τ` },
                  { label: "Capacitor voltage vC", value: `${fmt(now.vC)} V`, note: `${fmt(100 * now.progress)} % of the way to ${fmt(p.Vs)} V` },
                  { label: "Current i", value: formatSI(now.i, "A"), note: `vR = ${fmt(now.vR)} V` },
                  { label: "Stored energy", value: formatSI(now.energy, "J"), note: "U = ½CvC²" },
                ]}
              />
              <KeyFigures
                items={[
                  { label: "Time constant τ = RC", value: formatSI(tau, "s"), note: `${formatSI(p.R, "Ω")} × ${formatSI(p.C, "F")}` },
                  { label: "Initial current i(0)", value: formatSI(sum.I0, "A"), note: "(Vs − V₀)/R" },
                  { label: "Half-way time", value: formatSI(sum.halfTime, "s"), note: "τ ln 2" },
                  { label: "99 % settled", value: formatSI(sum.settle99, "s"), note: "τ ln 100 ≈ 4.6 τ" },
                ]}
              />

              <div className="ph-charts">
                <DiagramFrame
                  label="Capacitor voltage versus time"
                  legend={<Legend items={[{ label: "vC(t)", color: "#0b6a72", kind: "line" }, { label: `Final value ${fmt(p.Vs)} V`, color: "#64748b", kind: "dashed" }]} />}
                  title="Capacitor voltage vC(t)"
                >
                  <LineChart
                    current={{ x: x(t), y: now.vC }}
                    formatX={(v) => String(Number(v.toPrecision(3)))}
                    formatY={(v) => String(Number(v.toPrecision(3)))}
                    markers={stateAtTau && tau <= end ? tauMarker(stateAtTau.vC) : []}
                    onXChange={(v) => { clock.pause(); setT(v * tScale.factor, true); }}
                    series={[flat(p.Vs, "final", "final"), lineOf("vc", "vC", rows.map((r) => r.vC))]}
                    title="Capacitor voltage versus time"
                    valueText={`vC = ${fmt(now.vC)} V at ${formatSI(now.t, "s")}`}
                    xDomain={[0, x(end)]}
                    xLabel={`Time (${tScale.unit})`}
                    xStep={x(end) / 200}
                    yDomain={padY(Math.min(p.V0, p.Vs, 0), Math.max(p.V0, p.Vs, 0))}
                    yLabel="vC (V)"
                  />
                </DiagramFrame>
                <DiagramFrame label="Capacitor current versus time" title="Capacitor current i(t)">
                  <LineChart
                    current={{ x: x(t), y: now.i / iScale.factor }}
                    formatX={(v) => String(Number(v.toPrecision(3)))}
                    formatY={(v) => String(Number(v.toPrecision(3)))}
                    markers={stateAtTau && tau <= end ? tauMarker(stateAtTau.i / iScale.factor) : []}
                    onXChange={(v) => { clock.pause(); setT(v * tScale.factor, true); }}
                    series={[lineOf("i", "i", rows.map((r) => r.i / iScale.factor), "#be123c")]}
                    title="Capacitor current versus time"
                    valueText={`i = ${formatSI(now.i, "A")} at ${formatSI(now.t, "s")}`}
                    xDomain={[0, x(end)]}
                    xLabel={`Time (${tScale.unit})`}
                    xStep={x(end) / 200}
                    yDomain={padY(Math.min(0, sum.I0 / iScale.factor), Math.max(0, sum.I0 / iScale.factor))}
                    yLabel={`i (${iScale.unit})`}
                  />
                </DiagramFrame>
                <DiagramFrame label="Stored energy versus time" title="Stored energy U(t)">
                  <LineChart
                    current={{ x: x(t), y: now.energy / eScale.factor }}
                    formatX={(v) => String(Number(v.toPrecision(3)))}
                    formatY={(v) => String(Number(v.toPrecision(3)))}
                    onXChange={(v) => { clock.pause(); setT(v * tScale.factor, true); }}
                    series={[lineOf("u", "U", rows.map((r) => r.energy / eScale.factor), "#6d28d9")]}
                    title="Stored energy versus time"
                    valueText={`U = ${formatSI(now.energy, "J")} at ${formatSI(now.t, "s")}`}
                    xDomain={[0, x(end)]}
                    xLabel={`Time (${tScale.unit})`}
                    xStep={x(end) / 200}
                    yDomain={padY(0, Math.max(eMax / eScale.factor, 1e-12))}
                    yLabel={`U (${eScale.unit})`}
                  />
                </DiagramFrame>
              </div>

              <Panel subtitle="The exact solution of Vs = Ri + vC with i = C dvC/dt, evaluated at the selected time." title="Equations at this moment">
                <ul className="gc-eq-list">
                  <li>τ = RC = {formatSI(p.R, "Ω")} × {formatSI(p.C, "F")} = {formatSI(tau, "s")}</li>
                  <li>vC = Vs + (V₀ − Vs)e^(−t/τ) = {fmt(p.Vs)} + ({fmt(p.V0)} − {fmt(p.Vs)})·e^(−{fmt(now.t / tau)}) = {fmt(now.vC)} V</li>
                  <li>i = (Vs − V₀)/R · e^(−t/τ) = {formatSI(sum.I0, "A")} · e^(−{fmt(now.t / tau)}) = {formatSI(now.i, "A")}</li>
                  <li>U = ½CvC² = ½ · {formatSI(p.C, "F")} · ({fmt(now.vC)} V)² = {formatSI(now.energy, "J")}</li>
                  <li>Energy: source {formatSI(sum.sourceWork, "J")} = stored change {formatSI(sum.deltaU, "J")} + heat in R {formatSI(sum.resistorHeat, "J")}</li>
                </ul>
              </Panel>

              {practice ? (
                scenarios.length && practiceInput ? <GcPredictPanel input={practiceInput} onApply={(next) => update(() => next)} scenarios={scenarios} /> : <Callout tone="info" title="Nothing to predict yet"><p>Enter valid values to get prediction questions.</p></Callout>
              ) : (
                <Panel subtitle="Each answer quotes the numbers for the circuit you have set up." title="Why does it behave this way?">
                  {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
                </Panel>
              )}
            </>
          ) : (
            <Callout tone="info" title="Enter valid values to see the transient"><p>{errors?.[0] ?? "The diagram, readouts and graphs appear as soon as every field is valid."}</p></Callout>
          )}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">
          {RC_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
          <li>Not modelled: several capacitors or loops, inductors (RL and RLC circuits), a non-ideal source, a leaky or non-linear capacitor, a switch with its own resistance or bounce.</li>
        </ul>
      </Panel>
      <RelatedConcepts subject="physics" toolId="phRc" />
    </div>
  );
}
