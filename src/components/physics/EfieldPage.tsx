import { useEffect, useMemo, useRef } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import { LineChart, type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GcPredictPanel, NumberField, Paragraphs } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { fmt, fmtVecSI, formatSI, rescaledDuration, siScale } from "../../utils/physics/format";
import {
  coulombForceOn, fieldAt, forceOnTest, K_E, MAX_CHARGES, netForceOn, norm, PARTICLES, potentialAt, potentialEnergy, PRESETS, Q_RANGE, uniformState, uniformTrace, validateCharges, validateUniform, WORLD,
  angleDeg, type PointCharge, type UniformFieldInput,
} from "../../utils/physics/electrostatics";
import { EFIELD_ASSUMPTIONS, summarizeEfield } from "../../utils/physics/electromagnetismSummary";
import { EFIELD_CHALLENGES, efieldLessons, efieldScenarios } from "../../utils/physics/electromagnetismLearning";
import {
  DEFAULT_EFIELD_INPUTS, describeEfieldAnalysis, EFIELD_ENGINE_VERSION, EFIELD_VIEWS, validateEfieldInputs, type EfieldInputs, type EfieldView,
} from "../../utils/persistence/physicsTools24";
import { validatePhysicsResults } from "../../utils/persistence/physicsTools";
import { rateForTransient, type SpeedChoice } from "../../utils/physics/simClock";
import { ChallengePanel } from "./ChallengePanel";
import { EfieldDiagram, UniformFieldDiagram } from "./EfieldDiagrams";
import { ParamSlider, SimControls } from "./sim";
import { useSimClock } from "./simHooks";
import { useSimTime } from "./useSimTime";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

const VIEW_LABEL: Record<EfieldView, string> = { field: "Field & force", potential: "Potential", particle: "Uniform-field motion" };
const SPEEDS: SpeedChoice[] = ["quarter", "real", "fast"];
const SPEED_TEXT: Partial<Record<SpeedChoice, string>> = { quarter: "Slow 12 s", real: "Normal 6 s", fast: "Fast 3 s" };
const FREE_SPOTS: Array<[number, number]> = [[0, 0], [-2, 1.5], [2, 1.5], [-2, -1.5], [2, -1.5], [0, 2.5], [0, -2.5], [-3.5, 0], [3.5, 0]];
const PARTICLE_PRESETS = Object.entries(PARTICLES);
const nanoC = (q: number) => `${q < 0 ? "−" : "+"}${Number((Math.abs(q) * 1e9).toPrecision(3))} nC`;

/** Errors in the raw (possibly half-typed) settings, phrased by the engine's own validators. */
function efieldErrors(raw: EfieldInputs): string[] {
  const out: string[] = [];
  const c = validateCharges(raw.charges); if (!c.ok) out.push(...c.errors);
  const u = validateUniform(raw.particle); if (!u.ok) out.push(...u.errors);
  const { x, y } = raw.probe;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < WORLD.xMin || x > WORLD.xMax || y < WORLD.yMin || y > WORLD.yMax) out.push("The probe must lie inside the 10 m × 7 m window.");
  else if (c.ok && c.value.some((ch) => Math.hypot(ch.x - x, ch.y - y) < 1e-3)) out.push("The probe sits on a charge, where the point-charge field is singular. Move it away.");
  if (!Number.isFinite(raw.qTest) || Math.abs(raw.qTest) < Q_RANGE[0] || Math.abs(raw.qTest) > Q_RANGE[1]) out.push("The test charge must be between 0.1 nC and 100 µC in size.");
  return out;
}

export default function EfieldPage({ openRequest = null, onOpenHandled }: Props) {
  const resetClockRef = useRef<() => void>(() => undefined);
  const ws = useGcWorkspace<EfieldInputs>({
    page: "efield",
    engineVersion: EFIELD_ENGINE_VERSION,
    defaults: DEFAULT_EFIELD_INPUTS,
    validateInputs: validateEfieldInputs,
    validateResults: validatePhysicsResults,
    summarize: summarizeEfield,
    describe: describeEfieldAnalysis,
    fallbackName: "Electric field analysis",
    openRequest,
    onOpenHandled,
    onReset: () => resetClockRef.current(),
  });
  const { raw, update } = ws;
  const v = ws.valid;
  const errors = useMemo(() => (v ? [] : efieldErrors(raw)), [v, raw]);
  const mode = raw.mode;
  const view = raw.view;

  const setView = (next: EfieldView) => update((c) => ({ ...c, view: next, showContours: next === "potential" ? true : c.showContours }));
  const setCharge = (id: string, patch: Partial<PointCharge>) => update((c) => ({ ...c, charges: c.charges.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));
  const setParticle = (patch: Partial<UniformFieldInput>) => update((c) => {
    const particle = { ...c.particle, ...patch };
    return { ...c, particle, tNow: Number.isFinite(particle.duration) ? Math.min(c.tNow, particle.duration) : c.tNow };
  });
  const setPreset = (key: string) => update((c) => ({ ...c, charges: PRESETS[key].charges.map((q) => ({ ...q })), selected: null, probe: key === "pair" ? { x: 0, y: 1 } : c.probe }));
  const addCharge = () => update((c) => {
    if (c.charges.length >= MAX_CHARGES) return c;
    const id = "abcdef".split("").find((l) => !c.charges.some((q) => q.id === l)) as string;
    const spot = FREE_SPOTS.find(([x, y]) => c.charges.every((q) => Math.hypot(q.x - x, q.y - y) > 0.6) && Math.hypot(c.probe.x - x, c.probe.y - y) > 0.4) ?? [0.5, 0.5];
    return { ...c, charges: [...c.charges, { id, q: 2e-9, x: spot[0], y: spot[1] }], selected: id };
  });
  const removeSelected = () => update((c) => (c.selected && c.charges.length > 1 ? { ...c, charges: c.charges.filter((q) => q.id !== c.selected), selected: null } : c));
  const sel = raw.charges.find((q) => q.id === raw.selected) ?? null;

  // ---- time (uniform-field motion) ----
  const end = Number.isFinite(raw.particle.duration) && raw.particle.duration > 0 ? raw.particle.duration : 1;
  const [t, setT] = useSimTime(raw.tNow, end, (next) => update((c) => (Object.is(c.tNow, next) ? c : { ...c, tNow: next })));
  const clock = useSimClock({ t, tEnd: end, rate: rateForTransient(raw.speed, end), onTime: (next, final) => setT(next, final) });
  useEffect(() => { resetClockRef.current = () => { clock.pause(); setT(0, true); }; });
  const pOk = useMemo(() => validateUniform(raw.particle), [raw.particle]);
  const particle = pOk.ok ? pOk.value : null;
  const tScale = siScale(end, "s");
  const trace = useMemo(() => (particle ? uniformTrace(particle, 160) : []), [particle]);
  const now = particle ? uniformState(particle, Math.min(t, particle.duration)) : null;

  // ---- derived readouts (same model as the diagram) ----
  const field = v ? fieldAt(v.charges, v.probe) : null;
  const pot = v ? potentialAt(v.charges, v.probe) : null;
  const force = field?.ok ? forceOnTest(field.E, raw.qTest) : null;

  const profile = useMemo<ChartSeries[]>(() => {
    if (!v || view !== "potential") return [];
    const Vc = (K_E * v.charges.reduce((s, c) => s + Math.abs(c.q), 0)) / 0.5;
    const runs: ChartSeries[] = [];
    let cur: Array<{ x: number; y: number }> = [];
    const flush = () => { if (cur.length > 1) runs.push({ id: `run${runs.length}`, label: "V along the line through the probe", color: "#0b6a72", points: cur }); cur = []; };
    const N = 500;
    for (let k = 0; k <= N; k += 1) {
      const x = WORLD.xMin + ((WORLD.xMax - WORLD.xMin) * k) / N;
      const near = v.charges.some((c) => Math.hypot(x - c.x, v.probe.y - c.y) < 0.08);
      const r = near ? null : potentialAt(v.charges, { x, y: v.probe.y });
      if (!r || !r.ok || Math.abs(r.V) > Vc) { flush(); continue; }
      cur.push({ x, y: r.V });
    }
    flush();
    return runs;
  }, [v, view]);
  const Vc = v ? (K_E * v.charges.reduce((s, c) => s + Math.abs(c.q), 0)) / 0.5 : 1;

  const practice = mode === "practice", challenge = mode === "challenge";
  const practiceInput = useMemo(() => (v ? { ...v, tNow: 0 } : null), [v?.charges, v?.probe, v?.qTest, v?.particle, v?.view]); // eslint-disable-line react-hooks/exhaustive-deps
  const scenarios = useMemo(() => (practiceInput ? efieldScenarios(practiceInput) : []), [practiceInput]);
  const lessons = useMemo(() => (v ? efieldLessons(v) : []), [v]);

  const addLevel = () => { if (pot?.ok && Math.abs(pot.V) >= 1e-3 && raw.levels.length < 5) { const lv = Number(pot.V.toPrecision(3)); update((c) => (c.levels.includes(lv) ? c : { ...c, levels: [...c.levels, lv], showContours: true })); } };
  const eT = (x: number) => x / tScale.factor;
  const keMax = particle && trace.length ? Math.max(...trace.map((s) => s.ke)) : 0;
  const keScale = siScale(keMax, "J");
  const vExtent = trace.flatMap((s) => [s.vx, s.vy]);
  const pad = (lo: number, hi: number): [number, number] => { const s = hi - lo > 1e-9 * Math.max(Math.abs(lo), Math.abs(hi)) ? hi - lo : Math.max(1, Math.abs(hi)); return [lo - s * 0.08, hi + s * 0.08]; };
  const vScale = siScale(Math.max(...vExtent.map(Math.abs), 1e-30), "m/s");

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Electromagnetism"
        title="Electric fields & potential"
        purpose="Place point charges, move a probe and a test charge, and see the field vectors, field lines, equipotentials, forces and potential all computed from Coulomb's law — then follow a charged particle through a uniform field."
        evidence="model"
        steps={[
          { label: "Place the charges", detail: "Drag them in the diagram or edit their size and position." },
          { label: "Probe the field", detail: "Move P and read E, V, the force and the energy." },
          { label: "Switch the view", detail: "Field, potential with equipotentials, or uniform-field motion." },
        ]}
        aside={<Badge tone="neutral" title="Static point charges in vacuum, in a 10 m × 7 m window.">point charges · vacuum</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch
          blurbs={{ practice: "Predict what a change does, then check it against the model.", challenge: "Reach a stated target setup; the model checks it." }}
          mode={mode}
          modes={["explore", "practice", "challenge"]}
          onChange={(m) => update((c) => ({ ...c, mode: m }))}
        />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Charges in nanocoulombs, positions in metres (x right, y up)." title="Charges and probe">
          <Segmented<EfieldView> label="View" onChange={setView} options={EFIELD_VIEWS.map((x) => ({ id: x, label: VIEW_LABEL[x] }))} value={view} />
          {view !== "particle" ? (
            <>
              <div className="gc-presets" role="group" aria-label="Example charge configurations">
                {Object.entries(PRESETS).map(([key, p]) => <button className="secondary-button gc-chip" key={key} onClick={() => setPreset(key)} type="button">{p.label}</button>)}
              </div>
              <div className="ph-chargelist" role="group" aria-label="Charges (select one to edit it)">
                {raw.charges.map((c) => (
                  <button aria-pressed={c.id === raw.selected} className={c.id === raw.selected ? "secondary-button gc-chip is-on" : "ghost-button gc-chip"} key={c.id} onClick={() => update((s) => ({ ...s, selected: s.selected === c.id ? null : c.id }))} type="button">
                    {c.id}: {Number.isFinite(c.q) ? nanoC(c.q) : "—"}
                  </button>
                ))}
                <button className="secondary-button gc-chip" disabled={raw.charges.length >= MAX_CHARGES} onClick={addCharge} type="button">+ Add charge</button>
                <button className="ghost-button gc-chip" disabled={!sel || raw.charges.length <= 1} onClick={removeSelected} type="button">Remove selected</button>
              </div>
              {sel ? (
                <fieldset className="gc-fieldset">
                  <legend>Charge {sel.id}</legend>
                  <NumberField label="Charge q" onChange={(x) => setCharge(sel.id, { q: x * 1e-9 })} unit="nC" value={sel.q * 1e9} />
                  <ParamSlider format={(x) => `${fmt(x)} nC`} label="Size and sign" max={20} min={-20} onChange={(x) => setCharge(sel.id, { q: (Math.abs(x) < 0.1 ? 0.1 : x) * 1e-9 })} step={0.5} value={sel.q * 1e9} />
                  <NumberField label="Position x" onChange={(x) => setCharge(sel.id, { x })} unit="m" value={sel.x} />
                  <NumberField label="Position y" onChange={(y) => setCharge(sel.id, { y })} unit="m" value={sel.y} />
                </fieldset>
              ) : <p className="gc-field-hint">Select a charge here or in the diagram to change its size, sign and position.</p>}
              <fieldset className="gc-fieldset">
                <legend>Probe P and test charge</legend>
                <NumberField label="Probe x" onChange={(x) => update((c) => ({ ...c, probe: { ...c.probe, x } }))} unit="m" value={raw.probe.x} />
                <NumberField label="Probe y" onChange={(y) => update((c) => ({ ...c, probe: { ...c.probe, y } }))} unit="m" value={raw.probe.y} />
                <NumberField label="Test charge" onChange={(x) => update((c) => ({ ...c, qTest: x * 1e-9 }))} unit="nC" value={raw.qTest * 1e9} />
              </fieldset>
              <div className="ph-toggles">
                <label className="gc-check"><input checked={raw.showArrows} onChange={(e) => update((c) => ({ ...c, showArrows: e.target.checked }))} type="checkbox" /> Field arrows</label>
                <label className="gc-check"><input checked={raw.showLines} onChange={(e) => update((c) => ({ ...c, showLines: e.target.checked }))} type="checkbox" /> Field lines</label>
                <label className="gc-check"><input checked={raw.showContours} onChange={(e) => update((c) => ({ ...c, showContours: e.target.checked }))} type="checkbox" /> Equipotentials</label>
              </div>
              {raw.showContours ? (
                <div className="ph-chargelist" role="group" aria-label="Equipotential levels">
                  {raw.levels.map((lv) => <button aria-label={`Remove the ${formatSI(lv, "V")} contour`} className="ghost-button gc-chip" key={lv} onClick={() => update((c) => ({ ...c, levels: c.levels.filter((x) => x !== lv) }))} type="button">{formatSI(lv, "V")} ✕</button>)}
                  <button className="secondary-button gc-chip" disabled={!pot?.ok || raw.levels.length >= 5 || Math.abs(pot.V) < 1e-3} onClick={addLevel} type="button">Add contour through P</button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="gc-presets" role="group" aria-label="Particle types">
                {PARTICLE_PRESETS.map(([key, p]) => <button className="secondary-button gc-chip" key={key} onClick={() => setParticle({ m: p.m, q: p.q, duration: rescaledDuration(raw.particle, p) })} type="button">{p.label}</button>)}
              </div>
              <NumberField label="Charge q" onChange={(q) => setParticle({ q })} unit="C" value={raw.particle.q} />
              <NumberField label="Mass m" onChange={(m) => setParticle({ m })} unit="kg" value={raw.particle.m} />
              <NumberField label="Field Ex" onChange={(Ex) => setParticle({ Ex })} unit="V/m" value={raw.particle.Ex} />
              <NumberField label="Field Ey" onChange={(Ey) => setParticle({ Ey })} unit="V/m" value={raw.particle.Ey} />
              <ParamSlider format={(x) => `${fmt(x)} V/m`} label="Field Ey" max={20000} min={-20000} onChange={(Ey) => setParticle({ Ey })} step={250} value={raw.particle.Ey} />
              <NumberField label="Initial velocity vx" onChange={(vx0) => setParticle({ vx0 })} unit="m/s" value={raw.particle.vx0} />
              <NumberField label="Initial velocity vy" onChange={(vy0) => setParticle({ vy0 })} unit="m/s" value={raw.particle.vy0} />
              <NumberField label="Duration" onChange={(duration) => setParticle({ duration })} unit="s" value={raw.particle.duration} />
            </>
          )}
          {errors.length ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
        </Panel>

        <div className="gc-stage">
          {v && view !== "particle" && field?.ok && pot?.ok && force ? (
            <>
              <Callout tone="info" title={view === "potential" ? `Potential at P: ${formatSI(pot.V, "V")}` : `Field at P: ${formatSI(field.magnitude, "N/C")} at ${fmt(field.angleDeg)}° from +x`}>
                <p>{view === "potential"
                  ? `V = Σ kq/r is a number, not a vector. A test charge of ${nanoC(raw.qTest)} here has potential energy U = qV = ${formatSI(potentialEnergy(raw.qTest, pot.V), "J")}. Equipotentials cross the field lines at right angles, and E points toward lower potential.`
                  : `The field is the vector sum of every charge's contribution. A test charge of ${nanoC(raw.qTest)} feels F = qE = ${formatSI(norm(force), "N")} ${raw.qTest > 0 ? "along" : "against"} E. Arrows show direction at one length; the shade shows strength.`}</p>
              </Callout>
              <DiagramFrame
                caption="Drag a charge or the probe P (or focus it and use the arrow keys; hold Shift for larger steps). E is teal, the force on the test charge amber; red charges are positive and blue negative."
                label="Electric field diagram"
                legend={<Legend items={[{ label: "E at P", color: "#0b6a72", kind: "line" }, { label: "F on test charge", color: "#b45309", kind: "line" }, { label: "field direction", color: "#475569", kind: "line" }, ...(raw.showContours ? [{ label: "equipotential", color: "#0b6a72", kind: "dashed" as const }] : [])]} />}
                title="Charges, field and probe"
              >
                <EfieldDiagram
                  charges={v.charges}
                  levels={raw.showContours ? v.levels : []}
                  onMoveCharge={(id, x, y) => update((c) => ({ ...c, charges: c.charges.map((q) => (q.id === id ? { ...q, x, y } : q)) }))}
                  onMoveProbe={(x, y) => update((c) => ({ ...c, probe: { x, y } }))}
                  onSelect={(id) => update((c) => ({ ...c, selected: id }))}
                  probe={v.probe}
                  qTest={v.qTest}
                  selected={v.selected}
                  showArrows={v.showArrows}
                  showLines={v.showLines}
                />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Field E at P", value: formatSI(field.magnitude, "N/C"), note: `Ex = ${fmt(field.E.x)}, Ey = ${fmt(field.E.y)} N/C` },
                { label: "Direction of E", value: `${fmt(field.angleDeg)}°`, note: "from +x, counter-clockwise" },
                { label: "Force on test charge", value: formatSI(norm(force), "N"), note: `F = qE, ${force.x === 0 && force.y === 0 ? "zero" : `${fmt(angleDeg(force))}° from +x`}` },
                { label: "Potential V at P", value: formatSI(pot.V, "V"), note: "V = Σ kq/r" },
                { label: "Potential energy U", value: formatSI(potentialEnergy(raw.qTest, pot.V), "J"), note: "U = qV" },
                { label: "Work to move P → infinity", value: formatSI(raw.qTest * pot.V, "J"), note: "done by the field: q(V − 0)" },
              ]} />
              <Panel subtitle="Each row isolates one charge: the Coulomb force it feels from all the others, and its own contribution to E and V at P." title="Superposition, charge by charge">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="efield-table">
                    <thead><tr><th scope="col">Charge</th><th scope="col">Position (m)</th><th scope="col">Force on it from the others</th><th scope="col">Its E at P</th><th scope="col">Its V at P</th></tr></thead>
                    <tbody>
                      {v.charges.map((c) => {
                        const net = netForceOn(v.charges, c.id);
                        const fe = fieldAt([c], v.probe);
                        const fv = potentialAt([c], v.probe);
                        return (
                          <tr key={c.id}>
                            <th scope="row">{c.id} ({nanoC(c.q)})</th>
                            <td>({fmt(c.x)}, {fmt(c.y)})</td>
                            <td>{v.charges.length === 1 ? "—" : `${formatSI(norm(net), "N")}${norm(net) > 0 ? ` at ${fmt(angleDeg(net))}°` : ""}`}</td>
                            <td>{fe.ok ? `${formatSI(fe.magnitude, "N/C")} at ${fmt(fe.angleDeg)}°` : "—"}</td>
                            <td>{fv.ok ? formatSI(fv.V, "V") : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {v.charges.length === 2 ? <p className="ph-note">Newton's third law check: the force on {v.charges[0].id} from {v.charges[1].id} is {formatSI(norm(coulombForceOn(v.charges[0], v.charges[1])), "N")}, equal and opposite to the force on {v.charges[1].id} from {v.charges[0].id}.</p> : null}
              </Panel>
              {view === "potential" ? (
                <DiagramFrame caption="The potential along the horizontal line through P, from the same V(x, y). It rises toward positive charges and falls toward negative ones; the line is cut where |V| is larger than the plotted range." label="Potential along a line" legend={<Legend items={[{ label: "V(x) at the height of P", color: "#0b6a72", kind: "line" }]} />} title="Potential along the line through P">
                  <LineChart
                    current={{ x: v.probe.x, y: Math.max(-Vc, Math.min(Vc, pot.V)) }}
                    formatX={(x) => String(Number(x.toPrecision(3)))}
                    formatY={(y) => String(Number(y.toPrecision(3)))}
                    onXChange={(x) => { const nx = Math.round(x * 20) / 20; if (!v.charges.some((c) => Math.hypot(c.x - nx, c.y - v.probe.y) < 0.12)) update((c) => ({ ...c, probe: { ...c.probe, x: nx } })); }}
                    series={profile}
                    title="Potential along the line through P"
                    valueText={`Potential ${formatSI(pot.V, "V")} at x = ${fmt(v.probe.x)} m`}
                    xDomain={[WORLD.xMin, WORLD.xMax]}
                    xLabel="x (m)"
                    xStep={0.05}
                    yDomain={[-Vc, Vc]}
                    yLabel="V (volts)"
                  />
                </DiagramFrame>
              ) : null}
            </>
          ) : null}

          {v && view === "particle" && particle && now ? (
            <>
              <SimControls
                format={(tt) => formatSI(tt, "s")}
                onPause={() => { clock.pause(); setT(t, true); }}
                onPlay={clock.play}
                onReset={() => { clock.pause(); setT(0, true); }}
                onSpeed={(speed) => update((c) => ({ ...c, speed }))}
                onTime={(tt) => { clock.pause(); setT(tt, true); }}
                labels={SPEED_TEXT}
                playing={clock.playing}
                rateOf={rateForTransient}
                speed={raw.speed}
                speeds={SPEEDS}
                t={t}
                tEnd={end}
              />
              <Callout tone="info" title={`Acceleration a = qE/m = ${formatSI(Math.hypot(now.ax, now.ay), "m/s²")}, constant`}>
                <p>{particle.q > 0 ? "A positive charge accelerates along E; " : "A negative charge accelerates against E; "}the path is a parabola unless the velocity starts along the field. The model is non-relativistic and ignores gravity.</p>
              </Callout>
              <DiagramFrame caption="Equal scales on both axes. The dashed line is the whole path; the solid part is the motion so far. Velocity v is teal, the force F = qE amber." label="Particle in a uniform electric field" legend={<Legend items={[{ label: "velocity v", color: "#0b6a72", kind: "line" }, { label: "force F = qE", color: "#b45309", kind: "line" }]} />} title="Charged particle in a uniform field">
                <UniformFieldDiagram p={particle} t={t} />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Time", value: formatSI(now.t, "s") },
                { label: "Position", value: `(${formatSI(now.x, "m")}, ${formatSI(now.y, "m")})` },
                { label: "Velocity", value: `(${formatSI(now.vx, "m/s")}, ${formatSI(now.vy, "m/s")})`, note: `speed ${formatSI(now.speed, "m/s")}` },
                { label: "Force qE", value: formatSI(Math.hypot(now.fx, now.fy), "N"), note: fmtVecSI([now.fx, now.fy], "N") },
                { label: "Kinetic energy", value: formatSI(now.ke, "J"), note: "½mv²" },
                { label: "Work done by the field", value: formatSI(now.ke - 0.5 * particle.m * (particle.vx0 ** 2 + particle.vy0 ** 2), "J"), note: "equals the change in kinetic energy" },
              ]} />
              <div className="ph-charts">
                <DiagramFrame label="Velocity components versus time" legend={<Legend items={[{ label: "vx", color: "#0b6a72", kind: "line" }, { label: "vy", color: "#b45309", kind: "dashed" }]} />} title="Velocity components">
                  <LineChart
                    current={{ x: eT(t), y: now.vx / vScale.factor }}
                    formatX={(x) => String(Number(x.toPrecision(3)))}
                    formatY={(y) => String(Number(y.toPrecision(3)))}
                    onXChange={(x) => { clock.pause(); setT(x * tScale.factor, true); }}
                    series={[
                      { id: "vx", label: "vx", color: "#0b6a72", points: trace.map((s) => ({ x: eT(s.t), y: s.vx / vScale.factor })) },
                      { id: "vy", label: "vy", color: "#b45309", dash: "7 4", points: trace.map((s) => ({ x: eT(s.t), y: s.vy / vScale.factor })) },
                    ]}
                    title="Velocity components versus time"
                    valueText={`vx = ${formatSI(now.vx, "m/s")}, vy = ${formatSI(now.vy, "m/s")} at ${formatSI(now.t, "s")}`}
                    xDomain={[0, eT(end)]}
                    xLabel={`Time (${tScale.unit})`}
                    xStep={eT(end) / 200}
                    yDomain={pad(Math.min(...vExtent, 0) / vScale.factor, Math.max(...vExtent, 0) / vScale.factor)}
                    yLabel={`v (${vScale.unit})`}
                  />
                </DiagramFrame>
                <DiagramFrame label="Kinetic energy versus time" title="Kinetic energy">
                  <LineChart
                    current={{ x: eT(t), y: now.ke / keScale.factor }}
                    formatX={(x) => String(Number(x.toPrecision(3)))}
                    formatY={(y) => String(Number(y.toPrecision(3)))}
                    onXChange={(x) => { clock.pause(); setT(x * tScale.factor, true); }}
                    series={[{ id: "ke", label: "kinetic energy", color: "#6d28d9", points: trace.map((s) => ({ x: eT(s.t), y: s.ke / keScale.factor })) }]}
                    title="Kinetic energy versus time"
                    valueText={`Kinetic energy ${formatSI(now.ke, "J")} at ${formatSI(now.t, "s")}`}
                    xDomain={[0, eT(end)]}
                    xLabel={`Time (${tScale.unit})`}
                    xStep={eT(end) / 200}
                    yDomain={pad(0, keMax / keScale.factor)}
                    yLabel={`KE (${keScale.unit})`}
                  />
                </DiagramFrame>
              </div>
            </>
          ) : null}

          {!v ? <Callout tone="info" title="Enter valid values to see the diagram"><p>{errors[0] ?? "The diagram appears as soon as every field is valid."}</p></Callout> : null}

          {v ? (
            practice ? (
              scenarios.length && practiceInput ? <GcPredictPanel input={practiceInput} onApply={(next) => update(() => next)} scenarios={scenarios} /> : <Callout tone="info" title="Nothing to predict here"><p>Practice questions need valid settings.</p></Callout>
            ) : challenge ? (
              <ChallengePanel
                challenges={EFIELD_CHALLENGES}
                index={Math.min(raw.challenge, EFIELD_CHALLENGES.length - 1)}
                inputs={v}
                onIndex={(i) => update((c) => ({ ...c, challenge: i }))}
                onPick={(c) => { if (c.view) setView(c.view as EfieldView); }}
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
        <ul className="gc-assumptions">{EFIELD_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      <RelatedConcepts subject="physics" toolId="phEfield" />
    </div>
  );
}
