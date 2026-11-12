import { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import { type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch, type LearningMode } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GcPredictPanel, NumberField, Paragraphs } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { analyzeForces, decompose, describeState, FORCE_LIMITS, validateForceInput, type AppliedKind, type ForceId, type ForceMode } from "../../utils/physics/forces";
import { fmt, formatSI } from "../../utils/physics/format";
import { forcesLessons, forcesScenarios, QUIZ_CANDIDATES, quizAnswer } from "../../utils/physics/mechanicsLearning";
import { FORCES_ASSUMPTIONS, summarizeForces } from "../../utils/physics/physicsSummary";
import { rateForTransient, type SpeedChoice } from "../../utils/physics/simClock";
import {
  DEFAULT_FORCES_INPUTS, describeForcesAnalysis, FORCES_ENGINE_VERSION, validateForcesInputs, validatePhysicsResults, type ForcesInputs,
} from "../../utils/persistence/physicsTools";
import { ForceDiagram } from "./ForceDiagram";
import { ParamSlider, SimControls } from "./sim";
import { useSimClock } from "./simHooks";
import { TimeChart } from "./TimeChart";
import { useSimTime } from "./useSimTime";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

const SPEEDS: SpeedChoice[] = ["quarter", "real", "fast"];
const SPEED_TEXT: Partial<Record<SpeedChoice, string>> = { quarter: "Slow 12 s", real: "Normal 6 s", fast: "Fast 3 s" };
type Preset = { label: string; input: Partial<ForcesInputs["input"]> };
const PRESETS: Preset[] = [
  { label: "Push on a rough floor", input: { mode: "surface", m: 5, theta: 0, F: 20, phi: 0, kind: "applied", mus: 0.5, muk: 0.3, v0: 0, duration: 6 } },
  { label: "Push past the static limit", input: { mode: "surface", m: 5, theta: 0, F: 30, phi: 0, kind: "applied", mus: 0.5, muk: 0.3, v0: 0, duration: 6 } },
  { label: "Block on a rough incline", input: { mode: "surface", m: 10, theta: 30, F: 0, phi: 0, kind: "applied", mus: 0.7, muk: 0.5, v0: 0, duration: 6 } },
  { label: "Sliding down a slope", input: { mode: "surface", m: 10, theta: 30, F: 0, phi: 0, kind: "applied", mus: 0.5, muk: 0.4, v0: 0, duration: 6 } },
  { label: "Up the slope, then back", input: { mode: "surface", m: 2, theta: 30, F: 0, phi: 0, kind: "applied", mus: 0.3, muk: 0.2, v0: 5, duration: 6 } },
  { label: "Pulled by a rope at an angle", input: { mode: "surface", m: 10, theta: 0, F: 40, phi: 30, kind: "tension", mus: 0.5, muk: 0.3, v0: 0, duration: 6 } },
  { label: "Constant velocity", input: { mode: "surface", m: 5, theta: 0, F: 14.715, phi: 0, kind: "applied", mus: 0.5, muk: 0.3, g: 9.81, v0: 4, duration: 6 } },
  { label: "Block with a hanging mass", input: { mode: "pulley", m: 4, m2: 3, theta: 0, mus: 0.5, muk: 0.3, v0: 0, duration: 6 } },
];

export default function ForcesPage({ openRequest = null, onOpenHandled }: Props) {
  const resetClockRef = useRef<() => void>(() => undefined);
  const ws = useGcWorkspace<ForcesInputs>({
    page: "forces",
    engineVersion: FORCES_ENGINE_VERSION,
    defaults: DEFAULT_FORCES_INPUTS,
    validateInputs: validateForcesInputs,
    validateResults: validatePhysicsResults,
    summarize: summarizeForces,
    describe: describeForcesAnalysis,
    fallbackName: "Forces analysis",
    openRequest,
    onOpenHandled,
    onReset: () => resetClockRef.current(),
  });
  const { raw, update } = ws;
  const [mode, setMode] = useState<LearningMode>("explore");
  const [revealed, setRevealed] = useState(false);
  const setIn = (patch: Partial<ForcesInputs["input"]>) => update((c) => ({ ...c, input: { ...c.input, ...patch } }));
  const check = useMemo(() => validateForceInput(raw.input), [raw.input]);
  const errors = check.ok ? null : check.errors;
  const errorFor = (needle: RegExp) => errors?.find((e) => needle.test(e)) ?? null;
  const input = check.ok ? check.value : null;
  const analysis = useMemo(() => (input ? analyzeForces(input) : null), [input]);
  const tEnd = input?.duration ?? 0;
  const [t, setT] = useSimTime(raw.tNow, tEnd, (next) => update((c) => (Object.is(c.tNow, next) ? c : { ...c, tNow: next })));
  const clock = useSimClock({ t, tEnd, rate: rateForTransient(raw.speed, tEnd), onTime: (next, final) => setT(next, final) });
  useEffect(() => { resetClockRef.current = () => { clock.pause(); setT(0, true); }; });
  const now = analysis ? analysis.at(t) : null;

  const samples = useMemo(() => {
    if (!analysis) return null;
    const pts = Array.from({ length: 161 }, (_, k) => analysis.at((tEnd * k) / 160));
    const xs = pts.map((p) => p.x);
    const mk = (id: string, label: string, ys: number[], color?: string): ChartSeries => ({ id, label, color, points: pts.map((p, k) => ({ x: p.t, y: ys[k] })) });
    return {
      pts,
      xRange: Math.max(1, ...xs.map(Math.abs)),
      x: mk("x", "x", xs), v: mk("v", "v", pts.map((p) => p.v), "#b45309"), f: mk("f", "friction", pts.map((p) => p.friction.value), "#be123c"),
      net: mk("net", "net", pts.map((p) => p.net.x), "#0f172a"),
    };
  }, [analysis, tEnd]);

  const practice = mode === "practice";
  const practiceInput = useMemo(() => (ws.valid ? { ...ws.valid, tNow: 0, selected: null } : null), [ws.valid?.input]); // eslint-disable-line react-hooks/exhaustive-deps
  const scenarios = useMemo(() => (practiceInput ? forcesScenarios(practiceInput) : []), [practiceInput]);
  const lessons = useMemo(() => (ws.valid ? forcesLessons({ ...ws.valid, tNow: t }) : []), [ws.valid, t]);
  const selected = raw.selected && now?.forces.find((f) => f.id === raw.selected) ? raw.selected : null;
  const selForce = selected && now ? now.forces.find((f) => f.id === selected) ?? null : null;
  const pulley = raw.input.mode === "pulley";
  const quizKey = JSON.stringify(raw.input);
  const [quizSeen, setQuizSeen] = useState(quizKey);
  if (quizSeen !== quizKey) { setQuizSeen(quizKey); setRevealed(false); }
  const hideArrows = practice && !revealed;

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Mechanics"
        title="Forces & Newton's laws"
        purpose="Build a free-body diagram for a body on a flat or inclined surface (or a block with a hanging mass), change the forces and friction, and watch the net force, acceleration and motion follow."
        evidence="model"
        steps={[
          { label: "Set the system", detail: "Mass, slope, applied force, friction." },
          { label: "Read the diagram", detail: "Every arrow, table row and graph comes from one calculation." },
          { label: "Predict, then check", detail: "Practice hides the answer first." },
        ]}
        aside={<Badge tone="neutral" title="One body or a block with a hanging mass; Coulomb friction.">Point body · Coulomb friction</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <Segmented<ForceMode> label="System" onChange={(m) => update((c) => ({ ...c, input: { ...c.input, mode: m }, tNow: 0, selected: null }))} options={[{ id: "surface", label: "Body on a surface" }, { id: "pulley", label: "Block + hanging mass" }]} value={raw.input.mode} />
        <LearningModeSwitch mode={mode} modes={["explore", "practice"]} onChange={setMode} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle={pulley ? "A light string over an ideal pulley joins the block to the hanging mass." : "Gravity, the normal force and friction act; add an applied force or rope if you like."} title="System">
          <div className="gc-presets" role="group" aria-label="Example systems">
            {PRESETS.filter((p) => p.input.mode === raw.input.mode).map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => update((c) => ({ ...c, input: { ...c.input, ...p.input }, tNow: 0, selected: null }))} type="button">{p.label}</button>)}
          </div>
          <ParamSlider format={(v) => `${fmt(v)} kg`} label="Mass" max={50} min={0.5} onChange={(m) => setIn({ m })} step={0.5} value={raw.input.m} />
          <NumberField error={errorFor(/^Mass/)} label="Mass of the body" onChange={(m) => setIn({ m })} unit="kg" value={raw.input.m} />
          {pulley ? (
            <>
              <ParamSlider format={(v) => `${fmt(v)} kg`} label="Hanging mass" max={50} min={0.5} onChange={(m2) => setIn({ m2 })} step={0.5} value={raw.input.m2} />
              <NumberField error={errorFor(/Hanging/)} label="Hanging mass" onChange={(m2) => setIn({ m2 })} unit="kg" value={raw.input.m2} />
            </>
          ) : (
            <>
              <ParamSlider format={(v) => `${fmt(v)}°`} label="Incline angle" max={80} min={0} onChange={(theta) => setIn({ theta })} step={1} value={raw.input.theta} />
              <NumberField error={errorFor(/Incline/)} label="Incline angle" onChange={(theta) => setIn({ theta })} unit="°" value={raw.input.theta} />
              <Segmented<AppliedKind> label="The extra force is a" onChange={(kind) => setIn({ kind })} options={[{ id: "applied", label: "Push / pull" }, { id: "tension", label: "Rope tension" }]} value={raw.input.kind} />
              <ParamSlider format={(v) => `${fmt(v)} N`} label="Force magnitude" max={200} min={0} onChange={(F) => setIn({ F })} step={1} value={raw.input.F} />
              <NumberField error={errorFor(/Applied force/)} label="Force magnitude" onChange={(F) => setIn({ F })} unit="N" value={raw.input.F} />
              <ParamSlider format={(v) => `${fmt(v)}°`} label="Force direction (above the surface)" max={90} min={-90} onChange={(phi) => setIn({ phi })} step={1} value={raw.input.phi} />
              <NumberField error={errorFor(/Force angle/)} hint="0° along the surface (up the slope); positive lifts, negative presses down." label="Force direction" onChange={(phi) => setIn({ phi })} unit="°" value={raw.input.phi} />
            </>
          )}
          <ParamSlider format={(v) => fmt(v)} label="Static friction μₛ" max={1.5} min={0} onChange={(mus) => setIn({ mus })} step={0.01} value={raw.input.mus} />
          <NumberField error={errorFor(/Static/) ?? errorFor(/kinetic friction coefficient cannot/)} label="Static friction coefficient μₛ" onChange={(mus) => setIn({ mus })} value={raw.input.mus} />
          <ParamSlider format={(v) => fmt(v)} label="Kinetic friction μₖ" max={1.5} min={0} onChange={(muk) => setIn({ muk })} step={0.01} value={raw.input.muk} />
          <NumberField error={errorFor(/Kinetic/)} label="Kinetic friction coefficient μₖ" onChange={(muk) => setIn({ muk })} value={raw.input.muk} />
          <NumberField error={errorFor(/Initial velocity/)} hint="Along the surface; positive is up the slope (toward the pulley)." label="Initial velocity" onChange={(v0) => setIn({ v0 })} unit="m/s" value={raw.input.v0} />
          <NumberField error={errorFor(/Gravity/)} label="Gravity" onChange={(g) => setIn({ g })} unit="m/s²" value={raw.input.g} />
          <NumberField error={errorFor(/Observation/)} label="Observation time" onChange={(duration) => setIn({ duration })} unit="s" value={raw.input.duration} />
          {errors ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
          <p className="gc-field-hint">Limits: mass {FORCE_LIMITS.minMass}–{FORCE_LIMITS.maxMass} kg, incline 0–{FORCE_LIMITS.maxAngle}°, force up to {FORCE_LIMITS.maxForce} N, μ up to {FORCE_LIMITS.maxMu} (μₖ ≤ μₛ).</p>
        </Panel>

        <div className="gc-stage">
          {analysis && now && samples ? (
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
              <Callout tone={now.state === "airborne" ? "warn" : now.state === "sliding" ? "info" : "ok"} title={`The body is ${describeState(now.state)}`}>
                <p>
                  {now.state === "airborne"
                    ? "The applied force lifts the body off the surface, so there is no normal force and no friction. The model shows only the weight and the applied force; it does not track where the body lands."
                    : now.state === "rest" || now.state === "verge"
                      ? `Static friction (${formatSI(Math.abs(now.friction.value), "N")}) exactly cancels the force along the surface; its limit is ${formatSI(analysis.staticMax, "N")}. The net force is zero, so the acceleration is zero.${now.state === "verge" ? " The push equals the limit: any more and the body slides." : ""}`
                      : now.state === "constant-velocity"
                        ? `The forces balance (net force zero), but the body is moving at ${fmt(now.v)} m/s: zero net force means constant velocity, not rest.`
                        : `Kinetic friction (${formatSI(Math.abs(now.friction.value), "N")}) opposes the sliding. Net force ${formatSI(now.net.magnitude, "N")} gives a = ${fmt(now.a)} m/s² along the surface.`}
                </p>
              </Callout>
              <DiagramFrame caption="Weight is gray, normal teal, friction amber, applied force or tension red; the dashed arrow is the net force." label="Free-body diagram" title="Free-body diagram">
                <ForceDiagram analysis={analysis} hideArrows={hideArrows} moment={now} onSelect={(id: ForceId | null) => update((c) => ({ ...c, selected: id }))} selected={selected} xRange={samples.xRange} />
              </DiagramFrame>
              <KeyFigures
                items={[
                  { label: "Time", value: `${fmt(t)} s` },
                  { label: "Normal force", value: analysis.contact ? formatSI(analysis.normal, "N") : "0 N (contact lost)", note: pulley ? "N = mg" : `N = mg cosθ − F sinφ, weight ${formatSI(analysis.weight, "N")}` },
                  { label: now.friction.kind === "none" ? "Friction" : `${now.friction.kind === "static" ? "Static" : "Kinetic"} friction`, value: formatSI(now.friction.value, "N"), note: now.friction.kind === "static" ? `limit μₛN = ${formatSI(analysis.staticMax, "N")}` : now.friction.kind === "kinetic" ? "μₖN, opposes sliding" : "not touching" },
                  { label: "Net force", value: formatSI(now.net.magnitude, "N"), note: `(${fmt(now.net.x)}, ${fmt(now.net.y)}) N along, perpendicular` },
                  { label: "Acceleration", value: `${fmt(now.a)} m/s²`, note: `inertia ${fmt(analysis.inertia)} kg` },
                  { label: "Velocity / position", value: `${fmt(now.v)} m/s`, note: `x = ${fmt(now.x)} m along the surface` },
                ]}
              />
              {pulley && now.tension !== null ? <p className="ph-note">String tension T = m₂(g − a) = {fmt(raw.input.m2)}({fmt(raw.input.g)} − {fmt(now.a)}) = {formatSI(now.tension, "N")}; the hanging weight is {formatSI(raw.input.m2 * raw.input.g, "N")}.</p> : null}

              <Panel subtitle="Select a row (or an arrow) to see how the force splits into components." title="The forces on the body">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table">
                    <thead><tr><th scope="col">Force</th><th scope="col">Size</th><th scope="col">Along the surface</th><th scope="col">Perpendicular</th><th scope="col">Direction</th></tr></thead>
                    <tbody>
                      {now.forces.map((f) => (
                        <tr className={f.id === selected ? "is-here" : ""} key={f.id}>
                          <th scope="row"><button aria-pressed={f.id === selected} className="ph-row-button" onClick={() => update((c) => ({ ...c, selected: f.id === selected ? null : f.id }))} type="button">{f.label}</button></th>
                          <td>{formatSI(f.magnitude, "N")}</td><td>{formatSI(f.x, "N")}</td><td>{formatSI(f.y, "N")}</td><td>{fmt(f.angle)}°</td>
                        </tr>
                      ))}
                      <tr className="ph-group-row"><th scope="row">Net force</th><td>{formatSI(now.net.magnitude, "N")}</td><td>{formatSI(now.net.x, "N")}</td><td>{formatSI(now.net.y, "N")}</td><td>= m·a</td></tr>
                    </tbody>
                  </table>
                </div>
                {selForce ? (
                  <div className="gc-step" data-testid="force-inspector">
                    <h4>Inspector: {selForce.label}</h4>
                    <p className="gc-eq-line">|F| = {fmt(selForce.magnitude)} N at {fmt(selForce.angle)}° to the surface → along = |F| cos = {fmt(selForce.x)} N, perpendicular = |F| sin = {fmt(selForce.y)} N</p>
                    {selForce.id === "weight" && !pulley ? <p className="gc-eq-line">mg = {fmt(analysis.weight)} N splits into mg sinθ = {fmt(analysis.parallel)} N down the slope and mg cosθ = {fmt(analysis.perpendicular)} N into it</p> : null}
                    {selForce.id === "applied" || selForce.id === "tension" ? <p className="gc-eq-line">{fmt(raw.input.F)} N at {fmt(raw.input.phi)}° → ({fmt(decompose(raw.input.F, raw.input.phi).x)}, {fmt(decompose(raw.input.F, raw.input.phi).y)}) N</p> : null}
                    {selForce.id === "normal" ? <p className="gc-eq-line">Balances everything pressing into the surface: N = {fmt(analysis.normal)} N (not necessarily mg = {fmt(analysis.weight)} N)</p> : null}
                    {selForce.id === "friction" ? <p className="gc-eq-line">{now.friction.kind === "static" ? `Static: adapts, |fₛ| ≤ μₛN = ${fmt(analysis.staticMax)} N; here ${fmt(Math.abs(now.friction.value))} N` : `Kinetic: μₖN = ${fmt(raw.input.muk * analysis.normal)} N, opposite to the sliding`}</p> : null}
                    {selForce.id === "tension" && pulley ? <p className="gc-eq-line">T = m₂(g − a) = {fmt(selForce.magnitude)} N</p> : null}
                    <button className="ghost-button" onClick={() => update((c) => ({ ...c, selected: null }))} type="button">Clear selection</button>
                  </div>
                ) : null}
              </Panel>

              <div className="ph-charts">
                <TimeChart onTime={(x) => { clock.pause(); setT(x, true); }} series={[samples.x]} t={t} tEnd={tEnd} title="Position along the surface x(t)" value={now.x} yLabel="x (m)" />
                <TimeChart include0 onTime={(x) => { clock.pause(); setT(x, true); }} series={[samples.v]} t={t} tEnd={tEnd} title="Velocity v(t)" value={now.v} yLabel="v (m/s)" />
                <TimeChart include0 legend={[{ label: "Friction (along the surface)", color: "#be123c", kind: "line" }, { label: "Net force", color: "#0f172a", kind: "line" }]} onTime={(x) => { clock.pause(); setT(x, true); }} series={[samples.f, samples.net]} t={t} tEnd={tEnd} title="Friction and net force (along the surface)" value={now.friction.value} yLabel="force (N)" />
              </div>

              <Panel subtitle="Newton's second law applied along the surface, with your numbers." title="Equations at this moment">
                <ul className="gc-eq-list">
                  {pulley ? (
                    <>
                      <li>Hanging mass: m₂g − T = m₂a → T = m₂(g − a)</li>
                      <li>Block: T + f = m·a, friction f = {fmt(now.friction.value)} N</li>
                      <li>Together: a = (m₂g + f)/(m + m₂) = ({fmt(raw.input.m2 * raw.input.g)} + {fmt(now.friction.value)})/{fmt(analysis.inertia)} = {fmt(now.a)} m/s²</li>
                    </>
                  ) : (
                    <>
                      <li>Perpendicular: N = mg cosθ − F sinφ = {fmt(analysis.perpendicular)} − {fmt(decompose(raw.input.F, raw.input.phi).y)} = {fmt(analysis.normalRaw)} N</li>
                      <li>Along the surface: F cosφ − mg sinθ = {fmt(decompose(raw.input.F, raw.input.phi).x)} − {fmt(analysis.parallel)} = {fmt(analysis.driving)} N before friction</li>
                      <li>Newton II: ΣF = m·a → ({fmt(analysis.driving)} + {fmt(now.friction.value)}) N = {fmt(raw.input.m)} kg × {fmt(now.a)} m/s²</li>
                    </>
                  )}
                  <li>Static limit μₛN = {fmt(raw.input.mus)} × {fmt(analysis.normal)} = {fmt(analysis.staticMax)} N; kinetic μₖN = {fmt(raw.input.muk * analysis.normal)} N</li>
                </ul>
              </Panel>

              {practice ? (
                <>
                  {practiceInput ? <ForcesQuiz inputs={practiceInput} onReveal={() => setRevealed(true)} revealed={revealed} /> : null}
                  {scenarios.length && practiceInput ? <GcPredictPanel input={practiceInput} onApply={(next) => update(() => next)} scenarios={scenarios} /> : null}
                </>
              ) : (
                <Panel subtitle="Each answer quotes the numbers for the system you have set up." title="Why does it behave this way?">
                  {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
                </Panel>
              )}
            </>
          ) : (
            <Callout tone="info" title="Enter valid values to see the free-body diagram"><p>{errors?.[0] ?? "The diagram, table and graphs appear as soon as every field is valid."}</p></Callout>
          )}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">
          {FORCES_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
          <li>Not modelled: rolling or rotating bodies, tipping, air drag, a string that goes slack or stretches, pulleys with mass or friction, more than two bodies, curved or moving surfaces, and the landing of a body that leaves the surface.</li>
        </ul>
      </Panel>
    </div>
  );
}

/** Practice: tick the forces that act on the body and predict the acceleration before the diagram and the answer are shown. */
function ForcesQuiz({ inputs, revealed, onReveal }: { inputs: ForcesInputs; revealed: boolean; onReveal: () => void }) {
  const key = JSON.stringify(inputs.input);
  const [state, setState] = useState<{ key: string; picked: string[]; guess: string; checked: boolean }>({ key, picked: [], guess: "", checked: false });
  const cur = state.key === key ? state : { key, picked: [], guess: "", checked: false };
  const truth = useMemo(() => quizAnswer(inputs), [inputs]);
  const a = useMemo(() => analyzeForces(inputs.input).at(0).a, [inputs]);
  const toggle = (id: string) => setState({ ...cur, checked: false, picked: cur.picked.includes(id) ? cur.picked.filter((x) => x !== id) : [...cur.picked, id] });
  const missing = truth.filter((id) => !cur.picked.includes(id));
  const extra = cur.picked.filter((id) => !truth.includes(id));
  const guessN = Number(cur.guess);
  const guessOk = cur.guess.trim() !== "" && Number.isFinite(guessN) && Math.abs(guessN - a) <= Math.max(0.02 * Math.abs(a), 0.05);
  const name = (id: string) => QUIZ_CANDIDATES.find((c) => c.id === id)?.label ?? id;
  return (
    <Panel className="gc-predict" subtitle="Decide first; the diagram stays hidden until you check." title="Which forces act on the body?">
      <fieldset className="gc-fieldset">
        <legend>Tick every force that acts ON the body right now (t = 0)</legend>
        {QUIZ_CANDIDATES.map((c) => (
          <label className="gc-check" key={c.id}><input checked={cur.picked.includes(c.id)} onChange={() => toggle(c.id)} type="checkbox" /> {c.label}</label>
        ))}
      </fieldset>
      <div className="gc-field">
        <label htmlFor="ph-quiz-a">Predict the acceleration along the surface (m/s², positive up the slope or toward the pulley)</label>
        <input id="ph-quiz-a" inputMode="decimal" onChange={(e) => setState({ ...cur, guess: e.target.value, checked: false })} type="text" value={cur.guess} />
      </div>
      <button className="primary-button" onClick={() => { setState({ ...cur, checked: true }); onReveal(); }} type="button">Check my answer</button>
      {cur.checked && revealed ? (
        <div aria-live="polite" className="gc-reveal">
          <Callout tone={missing.length === 0 && extra.length === 0 ? "ok" : "warn"} title={missing.length === 0 && extra.length === 0 ? "Your free-body diagram is complete" : "Check the diagram"}>
            {missing.length ? <p>Missing: {missing.map(name).join(", ")}.</p> : null}
            {extra.length ? <p>Not acting on the body: {extra.map(name).join(", ")}. {extra.includes("motion") ? "There is no “force of motion”: a body keeps moving without one (Newton's first law). " : ""}{extra.includes("thrust") ? "That force acts on the surface, not on the body. " : ""}</p> : null}
            <p>The forces are now drawn above. The acceleration is <strong>{fmt(a)} m/s²</strong>{cur.guess.trim() === "" ? "." : guessOk ? ": your prediction is within 2 %." : `, you predicted ${fmt(guessN)}.`}</p>
          </Callout>
        </div>
      ) : null}
    </Panel>
  );
}
