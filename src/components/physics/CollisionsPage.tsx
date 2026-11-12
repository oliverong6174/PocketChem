import { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import { type ChartMarker, type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch, type LearningMode } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GcPredictPanel, NumberField, Paragraphs } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { BODY_WIDTH, COLLISION_LIMITS, solveCollision, stateAt, traceCollision, validateCollisionInput, type CollisionInput } from "../../utils/physics/collisions";
import { fmt, formatSI } from "../../utils/physics/format";
import { collisionLessons, collisionScenarios, lossComparison } from "../../utils/physics/mechanicsLearning";
import { COLLISION_ASSUMPTIONS, summarizeCollisions } from "../../utils/physics/physicsSummary";
import { rateForTransient, type SpeedChoice } from "../../utils/physics/simClock";
import {
  COLLISIONS_ENGINE_VERSION, DEFAULT_COLLISIONS_INPUTS, describeCollisionsAnalysis, validateCollisionsInputs, validatePhysicsResults, type CollisionsInputs,
} from "../../utils/persistence/physicsTools";
import { CollisionDiagram } from "./CollisionDiagram";
import { ParamSlider, SimControls } from "./sim";
import { useSimClock } from "./simHooks";
import { TimeChart } from "./TimeChart";
import { useSimTime } from "./useSimTime";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

const SPEEDS: SpeedChoice[] = ["quarter", "real", "fast"];
const SPEED_TEXT: Partial<Record<SpeedChoice, string>> = { quarter: "Slow 12 s", real: "Normal 6 s", fast: "Fast 3 s" };
const PRESETS: Array<{ label: string; input: Partial<CollisionInput> }> = [
  { label: "Elastic, unequal masses", input: { mA: 2, mB: 3, vA: 4, vB: -1, e: 1, xA: -4, xB: 3 } },
  { label: "Equal masses swap velocities", input: { mA: 2, mB: 2, vA: 3, vB: -1, e: 1, xA: -4, xB: 3 } },
  { label: "Perfectly inelastic (stick)", input: { mA: 2, mB: 3, vA: 4, vB: -1, e: 0, xA: -4, xB: 3 } },
  { label: "Partly elastic, e = 0.5", input: { mA: 2, mB: 3, vA: 4, vB: -1, e: 0.5, xA: -4, xB: 3 } },
  { label: "Heavy hits light at rest", input: { mA: 10, mB: 1, vA: 3, vB: 0, e: 1, xA: -4, xB: 3 } },
  { label: "Light hits heavy at rest", input: { mA: 1, mB: 10, vA: 3, vB: 0, e: 1, xA: -4, xB: 3 } },
  { label: "No collision (separating)", input: { mA: 2, mB: 3, vA: 1, vB: 3, e: 1, xA: -4, xB: 3 } },
];

export default function CollisionsPage({ openRequest = null, onOpenHandled }: Props) {
  const resetClockRef = useRef<() => void>(() => undefined);
  const ws = useGcWorkspace<CollisionsInputs>({
    page: "collisions",
    engineVersion: COLLISIONS_ENGINE_VERSION,
    defaults: DEFAULT_COLLISIONS_INPUTS,
    validateInputs: validateCollisionsInputs,
    validateResults: validatePhysicsResults,
    summarize: summarizeCollisions,
    describe: describeCollisionsAnalysis,
    fallbackName: "Collision analysis",
    openRequest,
    onOpenHandled,
    onReset: () => resetClockRef.current(),
  });
  const { raw, update } = ws;
  const [mode, setMode] = useState<LearningMode>("explore");
  const setIn = (patch: Partial<CollisionInput>) => update((c) => ({ ...c, input: { ...c.input, ...patch } }));
  const check = useMemo(() => validateCollisionInput(raw.input), [raw.input]);
  const errors = check.ok ? null : check.errors;
  const errorFor = (needle: RegExp) => errors?.find((e) => needle.test(e)) ?? null;
  const input = check.ok ? check.value : null;
  const result = useMemo(() => (input ? solveCollision(input) : null), [input]);
  const tEnd = result?.tEnd ?? 0;
  const [t, setT] = useSimTime(raw.tNow, tEnd, (next) => update((c) => (Object.is(c.tNow, next) ? c : { ...c, tNow: next })));
  const clock = useSimClock({ t, tEnd, rate: rateForTransient(raw.speed, tEnd), onTime: (next, final) => setT(next, final) });
  useEffect(() => { resetClockRef.current = () => { clock.pause(); setT(0, true); }; });
  const now = input && result ? stateAt(input, result, t) : null;

  const data = useMemo(() => {
    if (!input || !result) return null;
    const tr = traceCollision(input, result, 160);
    const mk = (id: string, label: string, ys: number[], color: string, dash?: string): ChartSeries => ({ id, label, color, dash, points: tr.map((p, k) => ({ x: p.t, y: ys[k] })) });
    const marker: ChartMarker[] = result.collides && result.tc! < result.tEnd ? [{ id: "c", kind: "equivalence", label: "collision", x: result.tc!, y: 0 }] : [];
    return {
      xs: [mk("xA", "A", tr.map((p) => p.xA), "#0b6a72"), mk("xB", "B", tr.map((p) => p.xB), "#b45309", "7 4")],
      vs: [mk("vA", "A", tr.map((p) => p.vA), "#0b6a72"), mk("vB", "B", tr.map((p) => p.vB), "#b45309", "7 4")],
      ps: [mk("pA", "A", tr.map((p) => p.pA), "#0b6a72"), mk("pB", "B", tr.map((p) => p.pB), "#b45309", "7 4"), mk("p", "total", tr.map((p) => p.p), "#0f172a", "2 4")],
      ke: [mk("ke", "total kinetic energy", tr.map((p) => p.KE), "#6d28d9")],
      marker,
    };
  }, [input, result]);

  const practice = mode === "practice";
  const practiceInput = useMemo(() => (ws.valid ? { ...ws.valid, tNow: 0 } : null), [ws.valid?.input]); // eslint-disable-line react-hooks/exhaustive-deps
  const scenarios = useMemo(() => (practiceInput ? collisionScenarios(practiceInput) : []), [practiceInput]);
  const lessons = useMemo(() => (ws.valid ? collisionLessons({ ...ws.valid, tNow: t }) : []), [ws.valid, t]);
  const comparison = useMemo(() => (ws.valid ? lossComparison(ws.valid) : []), [ws.valid]);
  const [specifyDt, setSpecifyDt] = useState(raw.input.contactTime !== null);
  if (raw.input.contactTime !== null && !specifyDt) setSpecifyDt(true);
  const mu = input ? (input.mA * input.mB) / (input.mA + input.mB) : 0;
  const kindText = (e: number) => (e === 1 ? "Elastic (e = 1)" : e === 0 ? "Perfectly inelastic (e = 0)" : "Partly inelastic");

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Mechanics"
        title="Momentum & collisions"
        purpose="Send two bodies toward each other on a frictionless track, choose how bouncy the collision is, and compare momentum, kinetic energy and impulse before and after."
        evidence="model"
        steps={[
          { label: "Choose masses and velocities", detail: "Positive velocities point right." },
          { label: "Set the collision type", detail: "Elastic, partly elastic or perfectly inelastic." },
          { label: "Compare before and after", detail: "Momentum is conserved; kinetic energy may not be." },
        ]}
        aside={<Badge tone="neutral" title="Two bodies, one dimension, instantaneous collision.">2 bodies · 1-D</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice"]} onChange={setMode} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="A is on the left and B on the right; each box is 1 m wide." title="Bodies">
          <div className="gc-presets" role="group" aria-label="Example collisions">
            {PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => update((c) => ({ ...c, input: { ...c.input, ...p.input, contactTime: c.input.contactTime }, tNow: 0 }))} type="button">{p.label}</button>)}
          </div>
          <ParamSlider format={(v) => `${fmt(v)} kg`} label="Mass of A" max={20} min={0.5} onChange={(mA) => setIn({ mA })} step={0.5} value={raw.input.mA} />
          <NumberField error={errorFor(/Mass of A/)} label="Mass of A" onChange={(mA) => setIn({ mA })} unit="kg" value={raw.input.mA} />
          <ParamSlider format={(v) => `${fmt(v)} m/s`} label="Velocity of A" max={20} min={-20} onChange={(vA) => setIn({ vA })} step={0.5} value={raw.input.vA} />
          <NumberField error={errorFor(/Velocity of A/)} label="Velocity of A" onChange={(vA) => setIn({ vA })} unit="m/s" value={raw.input.vA} />
          <ParamSlider format={(v) => `${fmt(v)} kg`} label="Mass of B" max={20} min={0.5} onChange={(mB) => setIn({ mB })} step={0.5} value={raw.input.mB} />
          <NumberField error={errorFor(/Mass of B/)} label="Mass of B" onChange={(mB) => setIn({ mB })} unit="kg" value={raw.input.mB} />
          <ParamSlider format={(v) => `${fmt(v)} m/s`} label="Velocity of B" max={20} min={-20} onChange={(vB) => setIn({ vB })} step={0.5} value={raw.input.vB} />
          <NumberField error={errorFor(/Velocity of B/)} label="Velocity of B" onChange={(vB) => setIn({ vB })} unit="m/s" value={raw.input.vB} />
          <Segmented<"elastic" | "partial" | "inelastic">
            label="Collision type"
            onChange={(k) => setIn({ e: k === "elastic" ? 1 : k === "inelastic" ? 0 : raw.input.e > 0 && raw.input.e < 1 ? raw.input.e : 0.5 })}
            options={[{ id: "elastic", label: "Elastic" }, { id: "partial", label: "Partly elastic" }, { id: "inelastic", label: "Perfectly inelastic" }]}
            value={raw.input.e === 1 ? "elastic" : raw.input.e === 0 ? "inelastic" : "partial"}
          />
          <ParamSlider format={(v) => fmt(v)} label="Coefficient of restitution e" max={1} min={0} onChange={(e) => setIn({ e })} step={0.01} value={raw.input.e} />
          <NumberField error={errorFor(/restitution/)} hint="0 = bodies stick, 1 = perfectly elastic." label="Coefficient of restitution e" onChange={(e) => setIn({ e })} value={raw.input.e} />
          <NumberField error={errorFor(/Position of A|overlap/)} label="Position of A (centre)" onChange={(xA) => setIn({ xA })} unit="m" value={raw.input.xA} />
          <NumberField error={errorFor(/Position of B/)} label="Position of B (centre)" onChange={(xB) => setIn({ xB })} unit="m" value={raw.input.xB} />
          <NumberField error={errorFor(/Time shown/)} hint="Shown after the collision (or in total when they never touch)." label="Time shown" onChange={(span) => setIn({ span })} unit="s" value={raw.input.span} />
          <label className="gc-check"><input checked={specifyDt} onChange={(e) => { setSpecifyDt(e.target.checked); setIn({ contactTime: e.target.checked ? 0.05 : null }); }} type="checkbox" /> I know how long the collision lasts (to get an average force)</label>
          {specifyDt ? <NumberField error={errorFor(/Collision duration/)} label="Collision duration" onChange={(contactTime) => setIn({ contactTime })} unit="s" value={raw.input.contactTime ?? NaN} /> : null}
          {errors ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
          <p className="gc-field-hint">Limits: mass {COLLISION_LIMITS.minMass}–{COLLISION_LIMITS.maxMass} kg, speeds up to {COLLISION_LIMITS.maxV} m/s, bodies at least {BODY_WIDTH} m apart (centre to centre).</p>
        </Panel>

        <div className="gc-stage">
          {input && result && now && data ? (
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
              <Callout tone={result.collides ? "ok" : "warn"} title={result.collides ? `${kindText(input.e)}: the bodies collide at t = ${fmt(result.tc as number)} s` : "No collision"}>
                <p>{result.collides ? `A closes on B at ${fmt(input.vA - input.vB)} m/s. After the collision A moves at ${fmt(result.vA2)} m/s and B at ${fmt(result.vB2)} m/s; total momentum stays ${fmt(result.pTotal)} kg·m/s.` : result.reason}</p>
              </Callout>
              <DiagramFrame caption="Arrows: velocities on one scale. Diamond: centre of mass. Dashed line: where the collision happens." label="Collision diagram" legend={<Legend items={[{ label: "A", color: "#0b6a72" }, { label: "B", color: "#b45309" }]} />} title="Two bodies on a track">
                <CollisionDiagram input={input} result={result} t={t} />
              </DiagramFrame>
              <KeyFigures
                items={[
                  { label: "Time", value: `${fmt(t)} s`, note: now.after ? "after the collision" : result.collides ? "before the collision" : "no collision" },
                  { label: "Velocity of A", value: `${fmt(now.vA)} m/s`, note: `p = ${fmt(now.pA)} kg·m/s` },
                  { label: "Velocity of B", value: `${fmt(now.vB)} m/s`, note: `p = ${fmt(now.pB)} kg·m/s` },
                  { label: "Total momentum", value: `${fmt(now.p)} kg·m/s`, note: "conserved" },
                  { label: "Total kinetic energy", value: formatSI(now.KE, "J") },
                  { label: "Centre-of-mass velocity", value: `${fmt(result.vcm)} m/s`, note: "unchanged by the collision" },
                ]}
              />

              <Panel subtitle="The whole collision at a glance." title="Before and after">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="before-after">
                    <thead><tr><th scope="col" /><th scope="col">Mass</th><th scope="col">v before</th><th scope="col">v after</th><th scope="col">p before</th><th scope="col">p after</th><th scope="col">KE before</th><th scope="col">KE after</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">A</th><td>{fmt(input.mA)} kg</td><td>{fmt(input.vA)} m/s</td><td>{fmt(result.vA2)} m/s</td><td>{fmt(input.mA * input.vA)}</td><td>{fmt(input.mA * result.vA2)}</td><td>{formatSI(0.5 * input.mA * input.vA ** 2, "J")}</td><td>{formatSI(0.5 * input.mA * result.vA2 ** 2, "J")}</td></tr>
                      <tr><th scope="row">B</th><td>{fmt(input.mB)} kg</td><td>{fmt(input.vB)} m/s</td><td>{fmt(result.vB2)} m/s</td><td>{fmt(input.mB * input.vB)}</td><td>{fmt(input.mB * result.vB2)}</td><td>{formatSI(0.5 * input.mB * input.vB ** 2, "J")}</td><td>{formatSI(0.5 * input.mB * result.vB2 ** 2, "J")}</td></tr>
                      <tr className="ph-group-row"><th scope="row">Total</th><td>{fmt(input.mA + input.mB)} kg</td><td /><td /><td>{fmt(result.pTotal)}</td><td>{fmt(input.mA * result.vA2 + input.mB * result.vB2)}</td><td>{formatSI(result.KEbefore, "J")}</td><td>{formatSI(result.KEafter, "J")}</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="gc-eq-line" data-testid="ke-loss">Kinetic energy lost: {formatSI(result.lossJ, "J")} ({fmt(100 * result.lossFraction)} %) = ½μ(1 − e²)(vA − vB)² with μ = {fmt(mu)} kg</p>
              </Panel>

              <Panel subtitle="Impulse is the change in momentum. The collision itself is idealised as instantaneous." title="Impulse">
                {result.collides ? (
                  <>
                    <p className="gc-eq-line" data-testid="impulse">J on B = Δp_B = m_B(v_B′ − v_B) = {fmt(input.mB)} × ({fmt(result.vB2)} − {fmt(input.vB)}) = {fmt(result.dpB)} N·s; on A: Δp_A = {fmt(result.dpA)} N·s (equal and opposite)</p>
                    <p className="gc-eq-line">Also J = μ(1 + e)(vA − vB) = {fmt(mu)} × {fmt(1 + input.e)} × {fmt(input.vA - input.vB)} = {fmt(mu * (1 + input.e) * (input.vA - input.vB))} N·s</p>
                    {result.averageForce !== null ? <p className="gc-eq-line" data-testid="avg-force">Average force over {fmt(input.contactTime as number)} s: |J|/Δt = {formatSI(result.averageForce, "N")}</p> : <p className="ph-note">No average force is shown: it needs the duration of the collision, which this model does not assume. Tick the box in the inputs to supply one. The force history during contact is not modelled.</p>}
                  </>
                ) : <p>No collision, so no impulse: both momenta are unchanged.</p>}
              </Panel>

              <div className="ph-charts">
                <TimeChart legend={[{ label: "A", color: "#0b6a72", kind: "line" }, { label: "B", color: "#b45309", kind: "dashed" }]} markers={data.marker.map((m) => ({ ...m, y: result.xAc ?? 0 }))} onTime={(x) => { clock.pause(); setT(x, true); }} series={data.xs} t={t} tEnd={tEnd} title="Position against time" value={now.xA} yLabel="x (m)" />
                <TimeChart include0 legend={[{ label: "A", color: "#0b6a72", kind: "line" }, { label: "B", color: "#b45309", kind: "dashed" }]} onTime={(x) => { clock.pause(); setT(x, true); }} series={data.vs} t={t} tEnd={tEnd} title="Velocity against time" value={now.vA} yLabel="v (m/s)" />
                <TimeChart include0 legend={[{ label: "A", color: "#0b6a72", kind: "line" }, { label: "B", color: "#b45309", kind: "dashed" }, { label: "Total", color: "#0f172a", kind: "dashed" }]} onTime={(x) => { clock.pause(); setT(x, true); }} series={data.ps} t={t} tEnd={tEnd} title="Momentum against time" value={now.p} yLabel="p (kg·m/s)" />
                <TimeChart include0 onTime={(x) => { clock.pause(); setT(x, true); }} series={data.ke} t={t} tEnd={tEnd} title="Total kinetic energy against time" value={now.KE} yLabel="KE (J)" />
              </div>

              <Panel subtitle="Same bodies, different collision types." title="Which collision loses the most kinetic energy?">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table">
                    <thead><tr><th scope="col">Collision</th><th scope="col">Kinetic energy lost</th><th scope="col">Fraction lost</th></tr></thead>
                    <tbody>{comparison.map((c) => <tr className={c.e === input.e ? "is-here" : ""} key={c.e}><th scope="row">e = {c.e}: {c.e === 1 ? "elastic" : c.e === 0 ? "perfectly inelastic" : "partly inelastic"}</th><td>{formatSI(c.lossJ, "J")}</td><td>{fmt(100 * c.lossFraction)} %</td></tr>)}</tbody>
                  </table>
                </div>
              </Panel>

              {practice ? (
                scenarios.length && practiceInput ? <GcPredictPanel input={practiceInput} onApply={(next) => update(() => next)} scenarios={scenarios} /> : <Callout tone="info" title="Nothing to predict here"><p>Practice questions need a collision: set A moving toward B.</p></Callout>
              ) : (
                <Panel subtitle="Each answer quotes the numbers for the collision you have set up." title="Why does it behave this way?">
                  {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
                </Panel>
              )}
            </>
          ) : (
            <Callout tone="info" title="Enter valid values to see the collision"><p>{errors?.[0] ?? "The diagram, table and graphs appear as soon as every field is valid."}</p></Callout>
          )}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">
          {COLLISION_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
          <li>Not modelled: friction or other external forces, rotation, collisions in two dimensions, more than two bodies, deformation or the detailed force during contact, bodies that bounce off walls.</li>
        </ul>
      </Panel>
    </div>
  );
}
