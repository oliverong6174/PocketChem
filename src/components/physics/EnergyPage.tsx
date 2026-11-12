import { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import { type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch, type LearningMode } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GcPredictPanel, NumberField, Paragraphs } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { analyzeEnergy, ENERGY_LIMITS, reachPosition, validateEnergyInput, type EnergyScenario } from "../../utils/physics/energy";
import { fmt, formatSI } from "../../utils/physics/format";
import { energyLessons, energyScenarios } from "../../utils/physics/mechanicsLearning";
import { ENERGY_ASSUMPTIONS, summarizeEnergy } from "../../utils/physics/physicsSummary";
import { rateForTransient, type SpeedChoice } from "../../utils/physics/simClock";
import {
  DEFAULT_ENERGY_INPUTS, describeEnergyAnalysis, ENERGY_ENGINE_VERSION, validateEnergyInputs, validatePhysicsResults, type EnergyInputs,
} from "../../utils/persistence/physicsTools";
import { EnergyBars, EnergyDiagram } from "./EnergyDiagram";
import { ParamSlider, SimControls } from "./sim";
import { useSimClock } from "./simHooks";
import { TimeChart } from "./TimeChart";
import { useSimTime } from "./useSimTime";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

const SPEEDS: SpeedChoice[] = ["quarter", "real", "fast"];
const SPEED_TEXT: Partial<Record<SpeedChoice, string>> = { quarter: "Slow 12 s", real: "Normal 6 s", fast: "Fast 3 s" };
const SCENARIOS: Array<{ id: EnergyScenario; label: string }> = [
  { id: "incline", label: "Block on an incline" },
  { id: "flat", label: "Rough horizontal surface" },
  { id: "spring", label: "Spring launch" },
  { id: "height", label: "Height under gravity" },
];
const PRESETS: Record<EnergyScenario, Array<{ label: string; input: Partial<EnergyInputs["input"]> }>> = {
  incline: [
    { label: "Frictionless slide", input: { m: 2, theta: 30, L: 5, u0: 5, v0: 0, mus: 0, muk: 0 } },
    { label: "Rough slide", input: { m: 2, theta: 30, L: 5, u0: 5, v0: 0, mus: 0.3, muk: 0.2 } },
    { label: "Launched up a rough slope", input: { m: 1, theta: 30, L: 50, u0: 0, v0: 10, mus: 0.8, muk: 0.2 } },
  ],
  flat: [
    { label: "Skidding to a stop", input: { m: 4, v0: 6, F: 0, mus: 0.3, muk: 0.25 } },
    { label: "Pushed with 20 N", input: { m: 4, v0: 0, F: 20, mus: 0.3, muk: 0.25 } },
    { label: "Push too weak to start", input: { m: 4, v0: 0, F: 10, mus: 0.3, muk: 0.25 } },
  ],
  spring: [
    { label: "Frictionless launch", input: { m: 2, k: 200, x0: 0.5, mus: 0, muk: 0 } },
    { label: "Rough floor", input: { m: 2, k: 200, x0: 0.5, mus: 0.3, muk: 0.2 } },
    { label: "Spring too weak", input: { m: 2, k: 200, x0: 0.1, mus: 0.9, muk: 0.9 } },
  ],
  height: [
    { label: "Dropped from 20 m", input: { m: 2, h0: 20, v0: 0, href: 0 } },
    { label: "Thrown up at 10 m/s", input: { m: 1, h0: 0, v0: 10, href: 0 } },
    { label: "Reference 4 m above ground", input: { m: 1, h0: 10, v0: 0, href: 4 } },
  ],
};

export default function EnergyPage({ openRequest = null, onOpenHandled }: Props) {
  const resetClockRef = useRef<() => void>(() => undefined);
  const ws = useGcWorkspace<EnergyInputs>({
    page: "energy",
    engineVersion: ENERGY_ENGINE_VERSION,
    defaults: DEFAULT_ENERGY_INPUTS,
    validateInputs: validateEnergyInputs,
    validateResults: validatePhysicsResults,
    summarize: summarizeEnergy,
    describe: describeEnergyAnalysis,
    fallbackName: "Energy analysis",
    openRequest,
    onOpenHandled,
    onReset: () => resetClockRef.current(),
  });
  const { raw, update } = ws;
  const [mode, setMode] = useState<LearningMode>("explore");
  const setIn = (patch: Partial<EnergyInputs["input"]>) => update((c) => ({ ...c, input: { ...c.input, ...patch } }));
  const check = useMemo(() => validateEnergyInput(raw.input), [raw.input]);
  const errors = check.ok ? null : check.errors;
  const errorFor = (needle: RegExp) => errors?.find((e) => needle.test(e)) ?? null;
  const input = check.ok ? check.value : null;
  const analysis = useMemo(() => (input ? analyzeEnergy(input) : null), [input]);
  const tEnd = analysis?.tEnd ?? 0;
  const [t, setT] = useSimTime(raw.tNow, tEnd, (next) => update((c) => (Object.is(c.tNow, next) ? c : { ...c, tNow: next })));
  const clock = useSimClock({ t, tEnd, rate: rateForTransient(raw.speed, tEnd), onTime: (next, final) => setT(next, final) });
  useEffect(() => { resetClockRef.current = () => { clock.pause(); setT(0, true); }; });
  const now = analysis ? analysis.at(t) : null;

  const data = useMemo(() => {
    if (!analysis) return null;
    const pts = Array.from({ length: 161 }, (_, k) => analysis.at((analysis.tEnd * k) / 160));
    const mk = (id: string, label: string, ys: number[], color: string, dash?: string): ChartSeries => ({ id, label, color, dash, points: pts.map((p, k) => ({ x: p.t, y: ys[k] })) });
    const scaleMax = Math.max(1e-9, ...pts.flatMap((p) => [p.Etotal, p.KE, p.PEg, p.PEs, p.Q]));
    return {
      pts, scaleMax,
      energy: [
        mk("KE", "Kinetic", pts.map((p) => p.KE), "#0b6a72"),
        mk("PEg", "Gravitational PE", pts.map((p) => p.PEg), "#b45309"),
        mk("PEs", "Spring PE", pts.map((p) => p.PEs), "#6d28d9", "7 4"),
        mk("Q", "Heat", pts.map((p) => p.Q), "#be123c", "2 4"),
        mk("Etotal", "KE + PE + heat", pts.map((p) => p.Etotal), "#0f172a", "10 4"),
      ],
      pos: mk("pos", "position", pts.map((p) => p.pos), "#0b6a72"),
      v: mk("v", "velocity", pts.map((p) => p.v), "#b45309"),
    };
  }, [analysis]);

  const reach = useMemo(() => (analysis && Number.isFinite(raw.target) ? reachPosition(analysis, raw.target) : null), [analysis, raw.target]);
  const practice = mode === "practice";
  const practiceInput = useMemo(() => (ws.valid ? { ...ws.valid, tNow: 0 } : null), [ws.valid?.input]); // eslint-disable-line react-hooks/exhaustive-deps
  const scenarios = useMemo(() => (practiceInput ? energyScenarios(practiceInput) : []), [practiceInput]);
  const lessons = useMemo(() => (ws.valid ? energyLessons({ ...ws.valid, tNow: t }) : []), [ws.valid, t]);
  const sc = raw.input.scenario;
  const coordName = { incline: "distance up the slope from the bottom", flat: "position from the start", spring: "position from the natural length (− is compressed)", height: "height above the ground" }[sc];

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Mechanics"
        title="Work & energy"
        purpose="Follow kinetic, gravitational and spring energy as a block slides, is launched by a spring or falls, see the work done by each force, and check that the energy ledger always balances."
        evidence="model"
        steps={[
          { label: "Choose a scenario", detail: "Incline, rough floor, spring or free fall." },
          { label: "Watch the bars", detail: "Energy moves between forms; friction turns it into heat." },
          { label: "Ask “can it get there?”", detail: "Energy tells you how far it goes." },
        ]}
        aside={<Badge tone="neutral" title="Constant g, ideal spring, kinetic friction.">Ideal spring · constant friction</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <Segmented<EnergyScenario> label="Scenario" onChange={(s) => update((c) => ({ ...c, input: { ...c.input, scenario: s }, tNow: 0, target: s === "height" ? 5 : s === "spring" ? 1 : 2 }))} options={SCENARIOS} value={raw.input.scenario} />
        <LearningModeSwitch mode={mode} modes={["explore", "practice"]} onChange={setMode} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Change a value and the diagram, bars, graphs and equations all follow." title="Setup">
          <div className="gc-presets" role="group" aria-label="Example setups">
            {PRESETS[sc].map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => update((c) => ({ ...c, input: { ...c.input, ...p.input }, tNow: 0 }))} type="button">{p.label}</button>)}
          </div>
          <ParamSlider format={(v) => `${fmt(v)} kg`} label="Mass" max={20} min={0.5} onChange={(m) => setIn({ m })} step={0.5} value={raw.input.m} />
          <NumberField error={errorFor(/^Mass/)} label="Mass" onChange={(m) => setIn({ m })} unit="kg" value={raw.input.m} />
          {sc === "incline" ? (
            <>
              <ParamSlider format={(v) => `${fmt(v)}°`} label="Incline angle" max={80} min={1} onChange={(theta) => setIn({ theta })} step={1} value={raw.input.theta} />
              <NumberField error={errorFor(/Incline angle/)} label="Incline angle" onChange={(theta) => setIn({ theta })} unit="°" value={raw.input.theta} />
              <NumberField error={errorFor(/Incline length/)} label="Incline length" onChange={(L) => setIn({ L })} unit="m" value={raw.input.L} />
              <NumberField error={errorFor(/start distance|Start distance/)} hint="Measured up the slope from the bottom; the block starts here." label="Start distance from the bottom" onChange={(u0) => setIn({ u0 })} unit="m" value={raw.input.u0} />
              <NumberField error={errorFor(/Initial velocity/)} hint="Positive is up the slope." label="Initial velocity" onChange={(v0) => setIn({ v0 })} unit="m/s" value={raw.input.v0} />
            </>
          ) : null}
          {sc === "flat" ? (
            <>
              <NumberField error={errorFor(/Initial velocity/)} label="Initial velocity (to the right)" onChange={(v0) => setIn({ v0 })} unit="m/s" value={raw.input.v0} />
              <ParamSlider format={(v) => `${fmt(v)} N`} label="Horizontal applied force" max={100} min={-100} onChange={(F) => setIn({ F })} step={1} value={raw.input.F} />
              <NumberField error={errorFor(/Applied force/)} hint="Positive to the right." label="Applied force" onChange={(F) => setIn({ F })} unit="N" value={raw.input.F} />
            </>
          ) : null}
          {sc === "spring" ? (
            <>
              <ParamSlider format={(v) => `${fmt(v)} N/m`} label="Spring constant" max={1000} min={10} onChange={(k) => setIn({ k })} step={10} value={raw.input.k} />
              <NumberField error={errorFor(/Spring constant/)} label="Spring constant" onChange={(k) => setIn({ k })} unit="N/m" value={raw.input.k} />
              <ParamSlider format={(v) => `${fmt(v)} m`} label="Compression" max={1.5} min={0.01} onChange={(x0) => setIn({ x0 })} step={0.01} value={raw.input.x0} />
              <NumberField error={errorFor(/Spring compression/)} label="Compression at release" onChange={(x0) => setIn({ x0 })} unit="m" value={raw.input.x0} />
            </>
          ) : null}
          {sc === "height" ? (
            <>
              <ParamSlider format={(v) => `${fmt(v)} m`} label="Starting height" max={100} min={0} onChange={(h0) => setIn({ h0 })} step={1} value={raw.input.h0} />
              <NumberField error={errorFor(/Starting height/)} label="Starting height" onChange={(h0) => setIn({ h0 })} unit="m" value={raw.input.h0} />
              <NumberField error={errorFor(/Initial velocity/)} hint="Positive is upward." label="Initial velocity" onChange={(v0) => setIn({ v0 })} unit="m/s" value={raw.input.v0} />
              <NumberField error={errorFor(/Reference height/)} hint="Where gravitational PE is taken as zero." label="Reference height" onChange={(href) => setIn({ href })} unit="m" value={raw.input.href} />
            </>
          ) : null}
          {sc !== "height" ? (
            <>
              <ParamSlider format={(v) => fmt(v)} label="Kinetic friction μₖ" max={1} min={0} onChange={(muk) => setIn({ muk, mus: Math.max(raw.input.mus, muk) })} step={0.01} value={raw.input.muk} />
              <NumberField error={errorFor(/Kinetic/)} label="Kinetic friction coefficient μₖ" onChange={(muk) => setIn({ muk })} value={raw.input.muk} />
              <NumberField error={errorFor(/Static/) ?? errorFor(/cannot exceed/)} label="Static friction coefficient μₛ" onChange={(mus) => setIn({ mus })} value={raw.input.mus} />
            </>
          ) : null}
          <NumberField error={errorFor(/Gravity/)} label="Gravity" onChange={(g) => setIn({ g })} unit="m/s²" value={raw.input.g} />
          {sc === "flat" || sc === "spring" ? <NumberField error={errorFor(/Observation/)} hint="Longest time a motion that never stops is followed." label="Observation time" onChange={(duration) => setIn({ duration })} unit="s" value={raw.input.duration} /> : null}
          {errors ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
          <p className="gc-field-hint">Limits: mass {ENERGY_LIMITS.minMass}–{ENERGY_LIMITS.maxMass} kg, spring {ENERGY_LIMITS.minK}–{ENERGY_LIMITS.maxK} N/m, μ up to {ENERGY_LIMITS.maxMu} (μₖ ≤ μₛ).</p>
        </Panel>

        <div className="gc-stage">
          {analysis && now && data ? (
            <>
              <SimControls
                format={(x) => `${fmt(x)} s of ${fmt(tEnd)} s`}
                labels={SPEED_TEXT}
                onPause={() => { clock.pause(); setT(t, true); }}
                onPlay={clock.play}
                onReset={() => { clock.pause(); setT(0, true); }}
                onSpeed={(speed) => update((c) => ({ ...c, speed }))}
                onTime={(x) => { clock.pause(); setT(x, true); }}
                playing={clock.playing}
                rateOf={rateForTransient}
                speed={raw.speed}
                speeds={SPEEDS}
                t={t}
                tEnd={tEnd}
              />
              <Callout tone={analysis.stays ? "warn" : "info"} title={`The body ${analysis.ending}`}>
                <p>{analysis.stays ? "Nothing moves in this setup, so every energy stays constant. Change a value to start it." : `Kinetic energy ${formatSI(now.KE, "J")}, potential ${formatSI(now.PEg + now.PEs, "J")}, heat ${formatSI(now.Q, "J")} at t = ${fmt(t)} s.`}</p>
              </Callout>
              <DiagramFrame caption={sc === "incline" ? "Gravitational PE is measured from the bottom of the incline." : sc === "height" ? "The dashed line is where gravitational PE is taken as zero." : "The block moves with the simulation time."} label="Scenario" title="Physical configuration">
                <EnergyDiagram analysis={analysis} state={now} />
              </DiagramFrame>
              <DiagramFrame caption="Heat is energy that has left the mechanical store through friction; the ledger KE + PE + heat equals the start plus the work done by the applied force at every instant." label="Energy bars" legend={<Legend items={[{ label: "Kinetic", color: "#0b6a72" }, { label: "Gravitational PE", color: "#b45309" }, { label: "Spring PE", color: "#6d28d9" }, { label: "Heat", color: "#be123c" }]} />} title="Energy accounting">
                <EnergyBars initial={analysis.initial} scaleMax={data.scaleMax} state={now} />
              </DiagramFrame>
              <KeyFigures
                items={[
                  { label: "Time", value: `${fmt(t)} s` },
                  { label: "Position", value: `${fmt(now.pos)} m`, note: coordName },
                  { label: "Velocity", value: `${fmt(now.v)} m/s`, note: `speed ${fmt(Math.abs(now.v))} m/s` },
                  { label: "Kinetic energy", value: formatSI(now.KE, "J"), note: "½mv²" },
                  { label: "Potential energy", value: formatSI(now.PEg + now.PEs, "J"), note: `gravity ${formatSI(now.PEg, "J")}, spring ${formatSI(now.PEs, "J")}` },
                  { label: "Heat (friction)", value: formatSI(now.Q, "J") },
                  { label: "Mechanical energy", value: formatSI(now.Emech, "J"), note: "KE + PE" },
                  { label: "Total with heat", value: formatSI(now.Etotal, "J"), note: `start ${formatSI(analysis.initial.Etotal, "J")} + applied work ${formatSI(now.Wapplied, "J")}` },
                ]}
              />

              <Panel subtitle="The work done on the body since t = 0, one force at a time." title="Work–energy theorem">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table">
                    <thead><tr><th scope="col">Force</th><th scope="col">Work so far</th><th scope="col">Sign</th></tr></thead>
                    <tbody>
                      {[["Gravity", now.Wgravity], ["Spring", now.Wspring], ["Friction", now.Wfriction], ["Applied force", now.Wapplied]].map(([name, w]) => (
                        <tr key={name as string}><th scope="row">{name as string}</th><td>{formatSI(w as number, "J")}</td><td>{(w as number) > 1e-12 ? "positive: adds kinetic energy" : (w as number) < -1e-12 ? "negative: removes kinetic energy" : "zero"}</td></tr>
                      ))}
                      <tr className="ph-group-row"><th scope="row">Total work</th><td>{formatSI(now.Wgravity + now.Wspring + now.Wfriction + now.Wapplied, "J")}</td><td>= ΔKE = {formatSI(now.KE - analysis.initial.KE, "J")}</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="gc-eq-line" data-testid="work-check">W_total = {fmt(now.Wgravity + now.Wspring + now.Wfriction + now.Wapplied)} J, ΔKE = {fmt(now.KE - analysis.initial.KE)} J, difference {fmt(Math.abs(now.Wgravity + now.Wspring + now.Wfriction + now.Wapplied - (now.KE - analysis.initial.KE)))} J</p>
              </Panel>

              <div className="ph-charts">
                <TimeChart include0 legend={[{ label: "Kinetic", color: "#0b6a72", kind: "line" }, { label: "Gravitational PE", color: "#b45309", kind: "line" }, { label: "Spring PE", color: "#6d28d9", kind: "dashed" }, { label: "Heat", color: "#be123c", kind: "dashed" }, { label: "KE + PE + heat", color: "#0f172a", kind: "dashed" }]} onTime={(x) => { clock.pause(); setT(x, true); }} series={data.energy} t={t} tEnd={tEnd} title="Energy against time" value={now.KE} yLabel="energy (J)" />
                <TimeChart onTime={(x) => { clock.pause(); setT(x, true); }} series={[data.pos]} t={t} tEnd={tEnd} title="Position x(t)" value={now.pos} yLabel="position (m)" />
                <TimeChart include0 onTime={(x) => { clock.pause(); setT(x, true); }} series={[data.v]} t={t} tEnd={tEnd} title="Velocity v(t)" value={now.v} yLabel="v (m/s)" />
              </div>

              <Panel subtitle="Energy decides how far the body can go." title="Can it get there?">
                <NumberField hint={`The ${coordName}.`} label="Position to ask about" onChange={(target) => update((c) => ({ ...c, target }))} unit="m" value={raw.target} />
                {reach ? (
                  reach.reached && reach.state ? (
                    <Callout tone="ok" title={`It reaches ${fmt(raw.target)} m at t = ${fmt(reach.t as number)} s`}>
                      <p data-testid="reach-result">Speed there: <strong>{fmt(Math.abs(reach.state.v))} m/s</strong> (KE = {formatSI(reach.state.KE, "J")}). Energy balance: ½mv² = KE₀ + W_gravity + W_spring + W_friction + W_applied = {fmt(analysis.initial.KE)} + {fmt(reach.state.Wgravity)} + {fmt(reach.state.Wspring)} + {fmt(reach.state.Wfriction)} + {fmt(reach.state.Wapplied)} = {fmt(reach.state.KE)} J.</p>
                    </Callout>
                  ) : (
                    <Callout tone="warn" title={`It never reaches ${fmt(raw.target)} m`}>
                      <p data-testid="reach-result">The motion only covers positions from {fmt(reach.min)} m to {fmt(reach.max)} m. Kinetic energy would have to be negative to get to {fmt(raw.target)} m: ½mv² = KE₀ + W would be below zero, which is impossible, so the body {analysis.ending.includes("rest") || analysis.stays ? "stops or stays" : "turns back or the track ends"} first.</p>
                    </Callout>
                  )
                ) : null}
              </Panel>

              {practice ? (
                scenarios.length && practiceInput ? <GcPredictPanel input={practiceInput} onApply={(next) => update(() => next)} scenarios={scenarios} /> : <Callout tone="info" title="Nothing to predict yet"><p>Enter valid values to get prediction questions.</p></Callout>
              ) : (
                <Panel subtitle="Each answer quotes the numbers for the setup you have chosen." title="Why does it behave this way?">
                  {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
                </Panel>
              )}
            </>
          ) : (
            <Callout tone="info" title="Enter valid values to see the simulation"><p>{errors?.[0] ?? "The diagram, bars and graphs appear as soon as every field is valid."}</p></Callout>
          )}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">
          {ENERGY_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
          <li>Not modelled: air resistance, springs with mass or damping, non-Hookean springs, rolling, curved tracks, a block that leaves the end of the track, and impact at the end of a fall.</li>
        </ul>
      </Panel>
    </div>
  );
}
