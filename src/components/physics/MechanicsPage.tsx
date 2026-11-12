import { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import { LineChart, type ChartMarker, type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch, type LearningMode } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GcPredictPanel, NumberField, Paragraphs } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { fmt } from "../../utils/physics/format";
import {
  bestAngleFromHeight, GRAVITY_PRESETS, launchComponents, MECH_LIMITS, stateAt, summarize, trace,
  validateConstantAccel, validateProjectile, type ConstantAccelInput, type MotionMode, type ProjectileInput,
} from "../../utils/physics/mechanics";
import { mechanicsLessons, mechanicsScenarios } from "../../utils/physics/physicsLearning";
import { summarizeMechanics, MECHANICS_ASSUMPTIONS } from "../../utils/physics/physicsSummary";
import { rateFor, type SpeedChoice } from "../../utils/physics/simClock";
import {
  DEFAULT_MECHANICS_INPUTS, describeMechanicsAnalysis, MECHANICS_ENGINE_VERSION, mechanicsKinematics, validateMechanicsInputs, validatePhysicsResults,
  type MechanicsInputs,
} from "../../utils/persistence/physicsTools";
import { MotionDiagram } from "./MotionDiagram";
import { ParamSlider, SimControls } from "./sim";
import { useSimClock } from "./simHooks";
import { useSimTime } from "./useSimTime";

type Props = {
  openRequest?: { id: string; recordId: string } | null;
  onOpenHandled?: (requestId: string) => void;
};

const PROJECTILE_PRESETS: Array<{ label: string; p: ProjectileInput }> = [
  { label: "Ball kicked from the ground", p: { x0: 0, y0: 0, speed: 20, angleDeg: 40, g: 9.81 } },
  { label: "Thrown from a rooftop", p: { x0: 0, y0: 25, speed: 15, angleDeg: 25, g: 9.81 } },
  { label: "Horizontal launch off a cliff", p: { x0: 0, y0: 45, speed: 15, angleDeg: 0, g: 9.81 } },
  { label: "Thrown straight down", p: { x0: 0, y0: 20, speed: 10, angleDeg: -90, g: 9.81 } },
  { label: "Same throw on the Moon", p: { x0: 0, y0: 0, speed: 20, angleDeg: 40, g: 1.62 } },
];
const CONSTANT_PRESETS: Array<{ label: string; c: ConstantAccelInput }> = [
  { label: "Car speeding up", c: { x0: 0, y0: 0, vx0: 4, vy0: 0, ax: 1.5, ay: 0, ground: false, duration: 10 } },
  { label: "Braking to a stop", c: { x0: 0, y0: 0, vx0: 20, vy0: 0, ax: -2.5, ay: 0, ground: false, duration: 8 } },
  { label: "Dropped from a tower", c: { x0: 0, y0: 60, vx0: 0, vy0: 0, ax: 0, ay: -9.81, ground: true, duration: 10 } },
  { label: "Curving: both components accelerate", c: { x0: 0, y0: 0, vx0: 6, vy0: 8, ax: -0.5, ay: -2, ground: false, duration: 10 } },
];
const SPEEDS: SpeedChoice[] = ["quarter", "real", "fast", "fit"];
const pad = (lo: number, hi: number, include?: number): [number, number] => {
  let a = Math.min(lo, hi);
  let b = Math.max(lo, hi);
  if (include !== undefined) { a = Math.min(a, include); b = Math.max(b, include); }
  const span = b - a || Math.max(1, Math.abs(b));
  return [a - span * 0.08, b + span * 0.08];
};

export default function MechanicsPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<MechanicsInputs>({
    page: "mechanics",
    engineVersion: MECHANICS_ENGINE_VERSION,
    defaults: DEFAULT_MECHANICS_INPUTS,
    validateInputs: validateMechanicsInputs,
    validateResults: validatePhysicsResults,
    summarize: summarizeMechanics,
    describe: describeMechanicsAnalysis,
    fallbackName: "Mechanics analysis",
    openRequest,
    onOpenHandled,
    onReset: () => resetClockRef.current(),
  });
  const resetClockRef = useRef<() => void>(() => undefined);
  const { raw, update } = ws;
  const [mode, setMode] = useState<LearningMode>("explore");
  const [equal, setEqual] = useState(true);
  const [components, setComponents] = useState(true);

  const setProj = (patch: Partial<ProjectileInput>) => update((c) => ({ ...c, projectile: { ...c.projectile, ...patch } }));
  const setConst = (patch: Partial<ConstantAccelInput>) => update((c) => ({ ...c, constant: { ...c.constant, ...patch } }));

  const pv = useMemo(() => validateProjectile(raw.projectile), [raw.projectile]);
  const cv = useMemo(() => validateConstantAccel(raw.constant), [raw.constant]);
  const active = raw.mode === "projectile" ? pv : cv;
  const errors = active.ok ? null : active.errors;
  const errorFor = (needle: RegExp) => errors?.find((e) => needle.test(e)) ?? null;
  const valid = ws.valid;
  const kin = useMemo(() => (valid ? mechanicsKinematics(valid) : null), [valid]);
  const sum = useMemo(() => (kin ? summarize(kin) : null), [kin]);
  const tr = useMemo(() => (kin ? trace(kin, 160) : null), [kin]);
  const tEnd = sum?.tEnd ?? 0;

  const [t, setT] = useSimTime(raw.tNow, tEnd, (next) => update((c) => (Object.is(c.tNow, next) ? c : { ...c, tNow: next })));
  const clock = useSimClock({ t, tEnd, rate: rateFor(raw.speed, tEnd), onTime: (next, final) => setT(next, final) });
  useEffect(() => { resetClockRef.current = () => { clock.pause(); setT(0, true); }; });
  const now = kin ? stateAt(kin, t) : null;

  const series = useMemo(() => {
    if (!tr) return null;
    const mk = (id: string, label: string, ys: number[], color?: string): ChartSeries => ({ id, label, color, points: tr.t.map((tt, i) => ({ x: tt, y: ys[i] })) });
    return { x: mk("x", "x", tr.x), y: mk("y", "y", tr.y), vx: mk("vx", "vₓ", tr.vx), vy: mk("vy", "v_y", tr.vy, "#b45309") };
  }, [tr]);

  const practice = mode === "practice";
  const practiceInput = useMemo(() => (valid ? { ...valid, tNow: 0 } : null), [valid?.mode, valid?.projectile, valid?.constant]); // eslint-disable-line react-hooks/exhaustive-deps
  const scenarios = useMemo(() => (practiceInput ? mechanicsScenarios(practiceInput) : []), [practiceInput]);
  const lessons = useMemo(() => (valid ? mechanicsLessons({ ...valid, tNow: t }) : []), [valid, t]);

  const markers = (key: "y" | "vy"): ChartMarker[] => {
    if (!sum || !sum.apexIsTurning) return [];
    return key === "y" ? [{ id: "apex", kind: "equivalence", label: "apex", x: sum.tApex, y: sum.maxHeight }] : [{ id: "apex", kind: "equivalence", label: "v_y = 0", x: sum.tApex, y: 0 }];
  };
  const chart = (title: string, yLabel: string, s: ChartSeries, value: number, key?: "y" | "vy", include0 = false) => {
    const ys = s.points.map((p) => p.y);
    return (
      <DiagramFrame label={title} title={title}>
        <LineChart
          current={{ x: t, y: value }}
          formatX={(x) => String(Number(x.toPrecision(3)))}
          formatY={(y) => String(Number(y.toPrecision(3)))}
          markers={key ? markers(key) : []}
          onXChange={(x) => setT(x, true)}
          series={[s]}
          title={title}
          valueText={`${title}: ${fmt(value)} at t = ${fmt(t)} s`}
          xDomain={[0, tEnd]}
          xLabel="Time (s)"
          xStep={tEnd / 200}
          yDomain={pad(Math.min(...ys), Math.max(...ys), include0 ? 0 : undefined)}
          yLabel={yLabel}
        />
      </DiagramFrame>
    );
  };

  const projectile = raw.mode === "projectile";
  const comps = projectile && pv.ok ? launchComponents(pv.value.speed, pv.value.angleDeg) : null;

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Analyze"
        title="Mechanics & motion"
        purpose="Launch a projectile or accelerate a particle and watch its position, velocity and acceleration change together on the diagram, in the numbers and on the graphs."
        evidence="model"
        steps={[
          { label: "Set the launch", detail: "Speed, angle, height and gravity." },
          { label: "Play or drag time", detail: "Diagram, readouts and graphs share one clock." },
          { label: "Predict, then check", detail: "Practice mode asks before it shows." },
        ]}
        aside={<Badge tone="neutral" title="Point particle, constant acceleration, no air resistance.">Point particle · no drag</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <Segmented<MotionMode>
          label="Motion model"
          onChange={(m) => update((c) => ({ ...c, mode: m, tNow: 0 }))}
          options={[{ id: "projectile", label: "Projectile (gravity)" }, { id: "constant", label: "Constant acceleration" }]}
          value={raw.mode}
        />
        <LearningModeSwitch mode={mode} modes={["explore", "practice"]} onChange={setMode} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle={projectile ? "Gravity is the only acceleration; the ground is y = 0." : "Both acceleration components are constant."} title={projectile ? "Launch" : "Motion"}>
          <div className="gc-presets" role="group" aria-label="Example motions">
            {projectile
              ? PROJECTILE_PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => update((c) => ({ ...c, projectile: { ...p.p }, tNow: 0 }))} type="button">{p.label}</button>)
              : CONSTANT_PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => update((c) => ({ ...c, constant: { ...p.c }, tNow: 0 }))} type="button">{p.label}</button>)}
          </div>
          {projectile ? (
            <>
              <ParamSlider format={(v) => `${fmt(v)} m/s`} label="Initial speed" max={100} min={0} onChange={(speed) => setProj({ speed })} step={0.5} value={raw.projectile.speed} />
              <NumberField error={errorFor(/speed/)} label="Initial speed" onChange={(speed) => setProj({ speed })} unit="m/s" value={raw.projectile.speed} />
              <ParamSlider format={(v) => `${fmt(v)}°`} label="Launch angle" max={90} min={-90} onChange={(angleDeg) => setProj({ angleDeg })} step={1} value={raw.projectile.angleDeg} />
              <NumberField error={errorFor(/angle/)} hint="Above horizontal; negative aims downward." label="Launch angle" onChange={(angleDeg) => setProj({ angleDeg })} unit="°" value={raw.projectile.angleDeg} />
              <ParamSlider format={(v) => `${fmt(v)} m`} label="Launch height" max={100} min={0} onChange={(y0) => setProj({ y0 })} step={0.5} value={raw.projectile.y0} />
              <NumberField error={errorFor(/height/)} label="Launch height above ground" onChange={(y0) => setProj({ y0 })} unit="m" value={raw.projectile.y0} />
              <ParamSlider format={(v) => `${fmt(v)} m/s²`} label="Gravity" max={30} min={0.1} onChange={(g) => setProj({ g })} step={0.01} value={raw.projectile.g} />
              <div className="gc-presets" role="group" aria-label="Gravity presets">
                {GRAVITY_PRESETS.map((g) => <button aria-pressed={raw.projectile.g === g.g} className={raw.projectile.g === g.g ? "secondary-button gc-chip is-on" : "ghost-button gc-chip"} key={g.label} onClick={() => setProj({ g: g.g })} type="button">{g.label} {g.g}</button>)}
              </div>
              <NumberField error={errorFor(/Gravity/)} label="Gravity (downward)" onChange={(g) => setProj({ g })} unit="m/s²" value={raw.projectile.g} />
              <NumberField error={errorFor(/x position/)} label="Initial x position" onChange={(x0) => setProj({ x0 })} unit="m" value={raw.projectile.x0} />
              {comps ? <p className="gc-field-hint">Components: vₓ₀ = {fmt(comps.vx0)} m/s, v_y₀ = {fmt(comps.vy0)} m/s</p> : null}
            </>
          ) : (
            <>
              <NumberField error={errorFor(/Initial x position/)} label="Initial x position" onChange={(x0) => setConst({ x0 })} unit="m" value={raw.constant.x0} />
              <NumberField error={errorFor(/Initial y position/)} label="Initial y position" onChange={(y0) => setConst({ y0 })} unit="m" value={raw.constant.y0} />
              <NumberField error={errorFor(/Initial x velocity/)} label="Initial x velocity" onChange={(vx0) => setConst({ vx0 })} unit="m/s" value={raw.constant.vx0} />
              <NumberField error={errorFor(/Initial y velocity/)} label="Initial y velocity" onChange={(vy0) => setConst({ vy0 })} unit="m/s" value={raw.constant.vy0} />
              <ParamSlider format={(v) => `${fmt(v)} m/s²`} label="x acceleration" max={20} min={-20} onChange={(ax) => setConst({ ax })} step={0.1} value={raw.constant.ax} />
              <NumberField error={errorFor(/x acceleration/)} label="x acceleration" onChange={(ax) => setConst({ ax })} unit="m/s²" value={raw.constant.ax} />
              <ParamSlider format={(v) => `${fmt(v)} m/s²`} label="y acceleration" max={20} min={-20} onChange={(ay) => setConst({ ay })} step={0.1} value={raw.constant.ay} />
              <NumberField error={errorFor(/y acceleration/)} label="y acceleration" onChange={(ay) => setConst({ ay })} unit="m/s²" value={raw.constant.ay} />
              <label className="gc-check"><input checked={raw.constant.ground} onChange={(e) => setConst({ ground: e.target.checked })} type="checkbox" /> Ground at y = 0 (the motion ends when the particle lands)</label>
              <NumberField error={errorFor(/Observation/)} hint="Used when there is no landing." label="Observation time" onChange={(duration) => setConst({ duration })} unit="s" value={raw.constant.duration} />
            </>
          )}
          {errors ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
          <p className="gc-field-hint">Limits: speeds up to {MECH_LIMITS.maxSpeed} m/s, gravity {MECH_LIMITS.minG}–{MECH_LIMITS.maxG} m/s², positions to ±{MECH_LIMITS.maxPos} m.</p>
        </Panel>

        <div className="gc-stage">
          {kin && sum && now && series ? (
            <>
              <SimControls
                format={(x) => `${fmt(x)} s of ${fmt(tEnd)} s`}
                onPlay={clock.play}
                onPause={() => { clock.pause(); setT(t, true); }}
                onReset={() => { clock.pause(); setT(0, true); }}
                onSpeed={(speed) => update((c) => ({ ...c, speed }))}
                onTime={(x) => { clock.pause(); setT(x, true); }}
                playing={clock.playing}
                speed={raw.speed}
                speeds={SPEEDS}
                t={t}
                tEnd={tEnd}
              />
              {sum.degenerate ? (
                <Callout tone="info" title="No flight">
                  <p>The particle starts on the ground and is not moving upward, so it has landed at t = 0: there is no time of flight, range or trajectory to draw. Raise the launch height or aim above horizontal.</p>
                </Callout>
              ) : null}
              <DiagramFrame
                caption={equal ? "Equal scales: one metre is the same length horizontally and vertically, so the path has its true shape." : "Stretched to fill the frame: the path is exaggerated vertically."}
                label="Motion diagram"
                title="Motion diagram"
                toolbar={(
                  <span className="ph-toggles">
                    <label className="gc-check"><input checked={equal} onChange={(e) => setEqual(e.target.checked)} type="checkbox" /> Equal axis scales</label>
                    <label className="gc-check"><input checked={components} onChange={(e) => setComponents(e.target.checked)} type="checkbox" /> Velocity components</label>
                  </span>
                )}
              >
                <MotionDiagram equal={equal} kin={kin} showComponents={components} summary={sum} t={t} />
              </DiagramFrame>

              <KeyFigures
                items={[
                  { label: "Time", value: `${fmt(t)} s` },
                  { label: "Position (x, y)", value: `(${fmt(now.x)}, ${fmt(now.y)}) m` },
                  { label: "Velocity (vₓ, v_y)", value: `(${fmt(now.vx)}, ${fmt(now.vy)}) m/s`, note: `speed ${fmt(now.speed)} m/s` },
                  { label: "Acceleration", value: `(${fmt(now.ax)}, ${fmt(now.ay)}) m/s²` },
                  { label: "Displacement from start", value: `(${fmt(now.dx)}, ${fmt(now.dy)}) m`, note: `${fmt(now.displacement)} m in a straight line` },
                ]}
              />
              <KeyFigures
                items={[
                  { label: "Time of flight", value: sum.lands ? `${fmt(sum.tFlight!)} s` : "does not land", note: sum.lands ? undefined : `observed for ${fmt(sum.tEnd)} s` },
                  { label: "Horizontal range", value: sum.range === null ? "—" : `${fmt(sum.range)} m` },
                  { label: "Maximum height", value: `${fmt(sum.maxHeight)} m`, note: sum.apexIsTurning ? `at t = ${fmt(sum.tApex)} s` : "at the start (no rise)" },
                  { label: "Final velocity", value: `(${fmt(sum.end.vx)}, ${fmt(sum.end.vy)}) m/s`, note: `speed ${fmt(sum.end.speed)} m/s` },
                ]}
              />
              {projectile && pv.ok ? <p className="ph-note">Best angle for range from this height and speed: {fmt(bestAngleFromHeight(pv.value.speed, pv.value.y0, pv.value.g))}° (45° only when launching from ground level).</p> : null}

              {tEnd > 0 ? (
                <div className="ph-charts">
                  {chart("Horizontal position x(t)", "x (m)", series.x, now.x)}
                  {chart("Vertical position y(t)", "y (m)", series.y, now.y, "y", true)}
                  {chart("Horizontal velocity vₓ(t)", "vₓ (m/s)", series.vx, now.vx, undefined, true)}
                  {chart("Vertical velocity v_y(t)", "v_y (m/s)", series.vy, now.vy, "vy", true)}
                </div>
              ) : null}

              <Panel subtitle="The same equations every display uses, with your numbers and the current time." title="Equations at this moment">
                <ul className="gc-eq-list">
                  <li>x = x₀ + vₓ₀t + ½aₓt² = {fmt(kin.x0)} + {fmt(kin.vx0)}·{fmt(t)} + ½·{fmt(kin.ax)}·{fmt(t)}² = {fmt(now.x)} m</li>
                  <li>y = y₀ + v_y₀t + ½a_y t² = {fmt(kin.y0)} + {fmt(kin.vy0)}·{fmt(t)} + ½·({fmt(kin.ay)})·{fmt(t)}² = {fmt(now.y)} m</li>
                  <li>vₓ = vₓ₀ + aₓt = {fmt(kin.vx0)} + {fmt(kin.ax)}·{fmt(t)} = {fmt(now.vx)} m/s</li>
                  <li>v_y = v_y₀ + a_y t = {fmt(kin.vy0)} + ({fmt(kin.ay)})·{fmt(t)} = {fmt(now.vy)} m/s</li>
                  {sum.lands ? <li>Landing: y = 0 → t = {fmt(sum.tFlight!)} s{projectile && pv.ok ? ` = (v_y₀ + √(v_y₀² + 2gy₀))/g` : ""}</li> : null}
                  {sum.apexIsTurning ? <li>Apex: v_y = 0 → t = −v_y₀/a_y = {fmt(sum.tApex)} s, y = {fmt(sum.maxHeight)} m</li> : null}
                </ul>
              </Panel>

              {practice ? (
                scenarios.length && practiceInput ? <GcPredictPanel input={practiceInput} onApply={(next) => update(() => next)} scenarios={scenarios} /> : <Callout tone="info" title="Nothing to predict yet"><p>Enter valid values to get prediction questions.</p></Callout>
              ) : (
                <Panel subtitle="Each answer quotes the numbers for the motion you have set up." title="Why does it behave this way?">
                  {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
                </Panel>
              )}
            </>
          ) : (
            <Callout tone="info" title="Enter valid values to see the simulation"><p>{errors?.[0] ?? "The diagram, readouts and graphs appear as soon as every field is valid."}</p></Callout>
          )}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">
          {MECHANICS_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
          <li>Not modelled: air resistance, spin, rockets (changing mass), uneven or moving ground, rotation of the Earth. Results are teaching values for the stated model, not predictions of real flights.</li>
        </ul>
      </Panel>
    </div>
  );
}
