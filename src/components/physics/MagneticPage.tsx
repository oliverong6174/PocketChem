import { useEffect, useMemo, useRef } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import { LineChart, type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GcPredictPanel, NumberField, Paragraphs } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { fmt, fmtVecSI, formatSI, rescaledDuration, scaleVec, senseWord, siScale } from "../../utils/physics/format";
import { PARTICLES } from "../../utils/physics/electrostatics";
import {
  angleBetweenDeg, circulation, conductorForce, cross3, currentDirectionWord, dot3, loopAxial, loopCentre, longSolenoidOk, lorentzForce, magneticForce, magneticMagnitude, MAX_WIRES, MU0,
  motionState, motionSummary, motionTrace, norm3, RIGHT_HAND_RULES, solenoidAxial, solenoidIdeal, validateLoop, validateLorentz, validateMotion, validateSolenoid, validateWires, WIRE_WORLD,
  wireFieldAt, type Vec3, type Wire,
} from "../../utils/physics/magnetism";
import { MAGNETIC_ASSUMPTIONS, summarizeMagnetic } from "../../utils/physics/electromagnetismSummary";
import { MAGNETIC_CHALLENGES, magneticLessons, magneticScenarios } from "../../utils/physics/electromagnetismLearning";
import {
  DEFAULT_MAGNETIC_INPUTS, describeMagneticAnalysis, MAGNETIC_ENGINE_VERSION, MAGNETIC_SCENARIOS, validateConductor, validateMagneticInputs, type MagneticInputs, type MagneticScenario,
} from "../../utils/persistence/physicsTools24";
import { validatePhysicsResults } from "../../utils/persistence/physicsTools";
import { rateForTransient, type SpeedChoice } from "../../utils/physics/simClock";
import { ChallengePanel } from "./ChallengePanel";
import { directionWords } from "../../utils/physics/directionWords";
import { LoopDiagram, MotionOblique, MotionTopView, SolenoidDiagram, VectorDiagram, WireDiagram, type VecItem } from "./MagneticDiagrams";
import { ParamSlider, SimControls } from "./sim";
import { useSimClock } from "./simHooks";
import { useSimTime } from "./useSimTime";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

const SCENARIO_LABEL: Record<MagneticScenario, string> = { wire: "Straight wires", loop: "Current loop", solenoid: "Solenoid", lorentz: "Lorentz force", motion: "Particle motion", conductor: "Force on a conductor" };
const SPEEDS: SpeedChoice[] = ["quarter", "real", "fast"];
const SPEED_TEXT: Partial<Record<SpeedChoice, string>> = { quarter: "Slow 12 s", real: "Normal 6 s", fast: "Fast 3 s" };
const WIRE_PRESETS: Array<{ label: string; wires: Wire[] }> = [
  { label: "One wire, current out of the screen", wires: [{ id: "a", x: 0, y: 0, I: 10 }] },
  { label: "One wire, current into the screen", wires: [{ id: "a", x: 0, y: 0, I: -10 }] },
  { label: "Two wires, same direction", wires: [{ id: "a", x: -0.1, y: 0, I: 10 }, { id: "b", x: 0.1, y: 0, I: 10 }] },
  { label: "Two wires, opposite directions", wires: [{ id: "a", x: -0.1, y: 0, I: 10 }, { id: "b", x: 0.1, y: 0, I: -10 }] },
  { label: "Three wires", wires: [{ id: "a", x: -0.15, y: -0.05, I: 10 }, { id: "b", x: 0.15, y: -0.05, I: 10 }, { id: "c", x: 0, y: 0.12, I: -10 }] },
];
const PARTICLE_PRESETS = Object.entries(PARTICLES);
/** The angle between two vectors, or null when one is zero (typing the components one by one passes through v = 0; the engine refuses that angle on purpose). */
const safeAngle = (a: Vec3, b: Vec3): number | null => (norm3(a) === 0 || norm3(b) === 0 ? null : angleBetweenDeg(a, b));

function VecFields({ label, unit, value, onChange }: { label: string; unit: string; value: Vec3; onChange: (v: Vec3) => void }) {
  return (
    <fieldset className="gc-fieldset">
      <legend>{label}</legend>
      <div className="ph-vec-fields">
        <NumberField label="x" onChange={(x) => onChange({ ...value, x })} unit={unit} value={value.x} />
        <NumberField label="y" onChange={(y) => onChange({ ...value, y })} unit={unit} value={value.y} />
        <NumberField label="z (out +)" onChange={(z) => onChange({ ...value, z })} unit={unit} value={value.z} />
      </div>
    </fieldset>
  );
}

function magneticErrors(raw: MagneticInputs): string[] {
  const out: string[] = [];
  const add = (r: { ok: boolean; errors?: string[] }) => { if (!r.ok && r.errors) out.push(...r.errors); };
  if (raw.scenario === "wire") {
    add(validateWires(raw.wires));
    const { x, y } = raw.probe;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < WIRE_WORLD.xMin || x > WIRE_WORLD.xMax || y < WIRE_WORLD.yMin || y > WIRE_WORLD.yMax) out.push("The probe must lie inside the 100 cm × 70 cm window.");
    else if (raw.wires.some((w) => Math.hypot(w.x - x, w.y - y) < 1e-3)) out.push("The probe sits on a wire, where the ideal filament field is singular. Move it away.");
  }
  if (raw.scenario === "loop") add(validateLoop(raw.loop));
  if (raw.scenario === "solenoid") add(validateSolenoid(raw.solenoid));
  if (raw.scenario === "loop" || raw.scenario === "solenoid") if (!Number.isFinite(raw.axisX) || Math.abs(raw.axisX) > 1) out.push("The axis position must be within ±1 m.");
  if (raw.scenario === "lorentz") add(validateLorentz(raw.lorentz));
  if (raw.scenario === "motion") add(validateMotion(raw.motion));
  if (raw.scenario === "conductor" && !validateConductor(raw.conductor)) out.push("Check the conductor: current 1 mA–1 kA, components within ±10, and a length of at least 1 mm.");
  return out;
}

export default function MagneticPage({ openRequest = null, onOpenHandled }: Props) {
  const resetClockRef = useRef<() => void>(() => undefined);
  const ws = useGcWorkspace<MagneticInputs>({
    page: "magnetic",
    engineVersion: MAGNETIC_ENGINE_VERSION,
    defaults: DEFAULT_MAGNETIC_INPUTS,
    validateInputs: validateMagneticInputs,
    validateResults: validatePhysicsResults,
    summarize: summarizeMagnetic,
    describe: describeMagneticAnalysis,
    fallbackName: "Magnetic field analysis",
    openRequest,
    onOpenHandled,
    onReset: () => resetClockRef.current(),
  });
  const { raw, update } = ws;
  const v = ws.valid;
  const errors = useMemo(() => magneticErrors(raw), [raw]);
  const mode = raw.mode;
  const sc = raw.scenario;
  const hasErrors = errors.length > 0 || !v;

  const setScenario = (next: MagneticScenario) => update((c) => ({ ...c, scenario: next }));
  const setWire = (id: string, patch: Partial<Wire>) => update((c) => ({ ...c, wires: c.wires.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
  const addWire = () => update((c) => {
    if (c.wires.length >= MAX_WIRES) return c;
    const id = "abc".split("").find((l) => !c.wires.some((w) => w.id === l)) as string;
    const spot = [[0, 0], [-0.2, 0.1], [0.2, 0.1], [0, -0.15]].find(([x, y]) => c.wires.every((w) => Math.hypot(w.x - x, w.y - y) > 0.06) && Math.hypot(c.probe.x - x, c.probe.y - y) > 0.05) ?? [0.3, -0.2];
    return { ...c, wires: [...c.wires, { id, x: spot[0], y: spot[1], I: 10 }], selectedWire: id };
  });
  const removeWire = () => update((c) => (c.selectedWire && c.wires.length > 1 ? { ...c, wires: c.wires.filter((w) => w.id !== c.selectedWire), selectedWire: null } : c));
  const selWire = raw.wires.find((w) => w.id === raw.selectedWire) ?? null;
  const setLorentz = (patch: Partial<MagneticInputs["lorentz"]>) => update((c) => ({ ...c, lorentz: { ...c.lorentz, ...patch } }));
  const setMotion = (patch: Partial<MagneticInputs["motion"]>) => update((c) => {
    const motion = { ...c.motion, ...patch };
    return { ...c, motion, tNow: Number.isFinite(motion.duration) ? Math.min(c.tNow, motion.duration) : c.tNow };
  });
  const setConductor = (patch: Partial<MagneticInputs["conductor"]>) => update((c) => ({ ...c, conductor: { ...c.conductor, ...patch } }));

  // ---- time (particle motion) ----
  const end = Number.isFinite(raw.motion.duration) && raw.motion.duration > 0 ? raw.motion.duration : 1;
  const [t, setT] = useSimTime(raw.tNow, end, (next) => update((c) => (Object.is(c.tNow, next) ? c : { ...c, tNow: next })));
  const clock = useSimClock({ t, tEnd: end, rate: rateForTransient(raw.speed, end), onTime: (next, final) => setT(next, final) });
  useEffect(() => { resetClockRef.current = () => { clock.pause(); setT(0, true); }; });
  const mOk = useMemo(() => validateMotion(raw.motion), [raw.motion]);
  const motion = mOk.ok ? mOk.value : null;
  const msum = motion ? motionSummary(motion) : null;
  const now = motion ? motionState(motion, Math.min(t, motion.duration)) : null;
  const trace = useMemo(() => (motion ? motionTrace(motion, 200) : []), [motion]);
  const tScale = siScale(end, "s");
  const eT = (x: number) => x / tScale.factor;
  const keMax = trace.length ? Math.max(...trace.map((s) => s.ke)) : 0;
  const keMin = trace.length ? Math.min(...trace.map((s) => s.ke)) : 0;
  const keScale = siScale(keMax, "J");
  const vScale = siScale(trace.length ? Math.max(...trace.map((s) => s.speed)) : 1, "m/s");
  const pad = (lo: number, hi: number): [number, number] => { const s = hi - lo > 1e-9 * Math.max(Math.abs(lo), Math.abs(hi)) ? hi - lo : Math.max(1e-30, Math.abs(hi) * 0.2); return [lo - s * 0.1, hi + s * 0.1]; };

  // ---- profiles for the graphs ----
  const wireProfile = useMemo<ChartSeries[]>(() => {
    if (!v || sc !== "wire") return [];
    const Bc = (MU0 * v.wires.reduce((s, w) => s + Math.abs(w.I), 0)) / (2 * Math.PI * 0.02);
    const runs: ChartSeries[] = [];
    let cur: Array<{ x: number; y: number }> = [];
    const flush = () => { if (cur.length > 1) runs.push({ id: `run${runs.length}`, label: "|B| along the line through the probe", color: "#0b6a72", points: cur }); cur = []; };
    for (let n = 0; n <= 400; n += 1) {
      const x = WIRE_WORLD.xMin + ((WIRE_WORLD.xMax - WIRE_WORLD.xMin) * n) / 400;
      const near = v.wires.some((w) => Math.hypot(x - w.x, v.probe.y - w.y) < 0.02);
      const f = near ? null : wireFieldAt(v.wires, x, v.probe.y);
      if (!f || !f.ok || f.magnitude > Bc) { flush(); continue; }
      cur.push({ x: x * 100, y: f.magnitude * 1e3 });
    }
    flush();
    return runs;
  }, [v, sc]);
  const wireBc = v ? (MU0 * v.wires.reduce((s, w) => s + Math.abs(w.I), 0)) / (2 * Math.PI * 0.02) : 1;
  const axisXr = v ? Math.max(sc === "loop" ? 3 * v.loop.a : v.solenoid.L * 0.8, Math.abs(v.axisX) * 1.2, 0.1) : 1;
  const axisSeries = useMemo<ChartSeries[]>(() => {
    if (!v || (sc !== "loop" && sc !== "solenoid")) return [];
    const pts = (f: (x: number) => number) => Array.from({ length: 241 }, (_, i) => { const x = -axisXr + (2 * axisXr * i) / 240; return { x, y: f(x) * 1e3 }; });
    if (sc === "loop") return [{ id: "loop", label: "B(x) on the axis", color: "#0b6a72", points: pts((x) => loopAxial(v.loop, x)) }];
    const sgn = Math.sign(v.solenoid.I);
    return [
      { id: "ideal", label: "ideal μ₀nI (inside)", color: "#64748b", dash: "7 4", points: [{ x: -v.solenoid.L / 2, y: solenoidIdeal(v.solenoid) * 1e3 }, { x: v.solenoid.L / 2, y: solenoidIdeal(v.solenoid) * 1e3 }] },
      { id: "exact", label: "exact B(x) on the axis", color: "#0b6a72", points: pts((x) => solenoidAxial(v.solenoid, x) * sgn) },
    ];
  }, [v, sc, axisXr]);
  const axisY = useMemo<[number, number]>(() => { const ys = axisSeries.flatMap((s) => s.points.map((p) => p.y)); return pad(Math.min(0, ...ys), Math.max(0, ...ys)); }, [axisSeries]);

  const practice = mode === "practice", challenge = mode === "challenge";
  const practiceInput = useMemo(() => (v ? { ...v, tNow: 0 } : null), [v?.scenario, v?.wires, v?.probe, v?.loop, v?.solenoid, v?.lorentz, v?.motion, v?.conductor, v?.axisX]); // eslint-disable-line react-hooks/exhaustive-deps
  const scenarios = useMemo(() => (practiceInput ? magneticScenarios(practiceInput) : []), [practiceInput]);
  const lessons = useMemo(() => (v ? magneticLessons(v) : []), [v]);

  // ---- derived numbers for the readouts ----
  const wf = v && sc === "wire" ? wireFieldAt(v.wires, v.probe.x, v.probe.y) : null;
  const lz = v && sc === "lorentz" ? v.lorentz : null;
  const Fm = lz ? magneticForce(lz.q, lz.v, lz.B) : null;
  const Ftot = lz ? lorentzForce(lz.q, lz.v, lz.B, lz.E) : null;
  const vxB = lz ? cross3(lz.v, lz.B) : null;
  const cd = v && sc === "conductor" ? v.conductor : null;
  const Fc = cd ? conductorForce(cd.I, cd.L, cd.B) : null;
  const LI: Vec3 | null = cd ? { x: cd.L.x * Math.sign(cd.I), y: cd.L.y * Math.sign(cd.I), z: cd.L.z * Math.sign(cd.I) } : null;
  const lzItems: VecItem[] = lz && Ftot ? [
    { id: "v", label: "v", v: lz.v, kind: "v" }, { id: "B", label: "B", v: lz.B, kind: "k" },
    ...(norm3(lz.E) > 0 ? [{ id: "E", label: "E", v: lz.E, kind: "i" as const }] : []), { id: "F", label: "F", v: Ftot, kind: "a" },
  ] : [];
  const cdItems: VecItem[] = cd && Fc && LI ? [{ id: "L", label: "I L", v: LI, kind: "v" }, { id: "B", label: "B", v: cd.B, kind: "k" }, { id: "F", label: "F", v: Fc, kind: "a" }] : [];

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Electromagnetism"
        title="Magnetic fields & forces"
        purpose="Build magnetic fields from wires, a loop and a solenoid with the right-hand rule, then watch the Lorentz force turn moving charges into circles and helices — with x to the right, y up and z out of the screen throughout."
        evidence="model"
        steps={[
          { label: "Choose a situation", detail: "Wires, loop, solenoid, a single charge, motion or a conductor." },
          { label: "Read the symbols", detail: "⊙ is out of the screen, ⊗ is into it." },
          { label: "Change one thing", detail: "Reverse a current or a charge and watch the force flip." },
        ]}
        aside={<Badge tone="neutral" title="Steady currents in vacuum; non-relativistic motion.">steady fields · vacuum</Badge>}
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
        <Panel className="gc-inputs" subtitle="SI units. x right, y up, z out of the screen." title="Setup">
          <Segmented<MagneticScenario> label="Situation" onChange={setScenario} options={MAGNETIC_SCENARIOS.map((x) => ({ id: x, label: SCENARIO_LABEL[x] }))} value={sc} />

          {sc === "wire" ? (
            <>
              <div className="gc-presets" role="group" aria-label="Example wire arrangements">
                {WIRE_PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => update((c) => ({ ...c, wires: p.wires.map((w) => ({ ...w })), selectedWire: null }))} type="button">{p.label}</button>)}
              </div>
              <div className="ph-chargelist" role="group" aria-label="Wires (select one to edit it)">
                {raw.wires.map((w) => <button aria-pressed={w.id === raw.selectedWire} className={w.id === raw.selectedWire ? "secondary-button gc-chip is-on" : "ghost-button gc-chip"} key={w.id} onClick={() => update((c) => ({ ...c, selectedWire: c.selectedWire === w.id ? null : w.id }))} type="button">{w.id}: {Number.isFinite(w.I) ? `${fmt(Math.abs(w.I))} A ${w.I > 0 ? "⊙" : "⊗"}` : "—"}</button>)}
                <button className="secondary-button gc-chip" disabled={raw.wires.length >= MAX_WIRES} onClick={addWire} type="button">+ Add wire</button>
                <button className="ghost-button gc-chip" disabled={!selWire || raw.wires.length <= 1} onClick={removeWire} type="button">Remove selected</button>
              </div>
              {selWire ? (
                <fieldset className="gc-fieldset">
                  <legend>Wire {selWire.id}</legend>
                  <NumberField hint="Positive: out of the screen (⊙). Negative: into the screen (⊗)." label="Current I" onChange={(I) => setWire(selWire.id, { I })} unit="A" value={selWire.I} />
                  <ParamSlider format={(x) => `${fmt(x)} A`} label="Current" max={100} min={-100} onChange={(I) => setWire(selWire.id, { I: Math.abs(I) < 0.5 ? (I < 0 ? -0.5 : 0.5) : I })} step={0.5} value={selWire.I} />
                  <NumberField label="Position x" onChange={(x) => setWire(selWire.id, { x: x / 100 })} unit="cm" value={selWire.x * 100} />
                  <NumberField label="Position y" onChange={(y) => setWire(selWire.id, { y: y / 100 })} unit="cm" value={selWire.y * 100} />
                </fieldset>
              ) : <p className="gc-field-hint">Select a wire here or in the diagram to change its current and position.</p>}
              <fieldset className="gc-fieldset">
                <legend>Probe P</legend>
                <NumberField label="Probe x" onChange={(x) => update((c) => ({ ...c, probe: { ...c.probe, x: x / 100 } }))} unit="cm" value={raw.probe.x * 100} />
                <NumberField label="Probe y" onChange={(y) => update((c) => ({ ...c, probe: { ...c.probe, y: y / 100 } }))} unit="cm" value={raw.probe.y * 100} />
              </fieldset>
            </>
          ) : null}

          {sc === "loop" ? (
            <>
              <NumberField hint="Positive: counter-clockwise as seen from +x, which makes B point along +x." label="Current I" onChange={(I) => update((c) => ({ ...c, loop: { ...c.loop, I } }))} unit="A" value={raw.loop.I} />
              <ParamSlider format={(x) => `${fmt(x)} A`} label="Current" max={50} min={-50} onChange={(I) => update((c) => ({ ...c, loop: { ...c.loop, I: Math.abs(I) < 0.1 ? 0.1 : I } }))} step={0.5} value={raw.loop.I} />
              <NumberField label="Loop radius a" onChange={(a) => update((c) => ({ ...c, loop: { ...c.loop, a: a / 100 } }))} unit="cm" value={raw.loop.a * 100} />
              <NumberField hint="Whole number, 1 to 1000." label="Turns N" onChange={(N) => update((c) => ({ ...c, loop: { ...c.loop, N } }))} value={raw.loop.N} />
              <ParamSlider format={(x) => `${fmt(x * 100)} cm`} label="Field point on the axis" max={0.5} min={-0.5} onChange={(axisX) => update((c) => ({ ...c, axisX }))} step={0.005} value={raw.axisX} />
            </>
          ) : null}

          {sc === "solenoid" ? (
            <>
              <NumberField label="Turns per metre n" onChange={(n) => update((c) => ({ ...c, solenoid: { ...c.solenoid, n } }))} unit="turns/m" value={raw.solenoid.n} />
              <NumberField hint="Positive: counter-clockwise as seen from +x, B along +x." label="Current I" onChange={(I) => update((c) => ({ ...c, solenoid: { ...c.solenoid, I } }))} unit="A" value={raw.solenoid.I} />
              <ParamSlider format={(x) => `${fmt(x)} A`} label="Current" max={20} min={-20} onChange={(I) => update((c) => ({ ...c, solenoid: { ...c.solenoid, I: Math.abs(I) < 0.05 ? 0.05 : I } }))} step={0.25} value={raw.solenoid.I} />
              <NumberField label="Length L" onChange={(L) => update((c) => ({ ...c, solenoid: { ...c.solenoid, L } }))} unit="m" value={raw.solenoid.L} />
              <NumberField label="Radius R" onChange={(R) => update((c) => ({ ...c, solenoid: { ...c.solenoid, R: R / 100 } }))} unit="cm" value={raw.solenoid.R * 100} />
              <ParamSlider format={(x) => `${fmt(x * 100)} cm`} label="Field point on the axis" max={1} min={-1} onChange={(axisX) => update((c) => ({ ...c, axisX }))} step={0.01} value={raw.axisX} />
            </>
          ) : null}

          {sc === "lorentz" ? (
            <>
              <div className="gc-presets" role="group" aria-label="Particle types">
                {PARTICLE_PRESETS.map(([key, p]) => <button className="secondary-button gc-chip" key={key} onClick={() => setLorentz({ m: p.m, q: p.q })} type="button">{p.label}</button>)}
                <button className="ghost-button gc-chip" onClick={() => setLorentz({ q: -raw.lorentz.q })} type="button">Flip the sign of q</button>
              </div>
              <NumberField label="Charge q" onChange={(q) => setLorentz({ q })} unit="C" value={raw.lorentz.q} />
              <NumberField label="Mass m" onChange={(m) => setLorentz({ m })} unit="kg" value={raw.lorentz.m} />
              <VecFields label="Velocity v" onChange={(x) => setLorentz({ v: x })} unit="m/s" value={raw.lorentz.v} />
              <VecFields label="Magnetic field B" onChange={(x) => setLorentz({ B: x })} unit="T" value={raw.lorentz.B} />
              <VecFields label="Electric field E (optional)" onChange={(x) => setLorentz({ E: x })} unit="V/m" value={raw.lorentz.E} />
            </>
          ) : null}

          {sc === "motion" ? (
            <>
              <div className="gc-presets" role="group" aria-label="Particle types">
                {PARTICLE_PRESETS.map(([key, p]) => <button className="secondary-button gc-chip" key={key} onClick={() => setMotion({ m: p.m, q: p.q, duration: rescaledDuration(raw.motion, p) })} type="button">{p.label}</button>)}
                <button className="ghost-button gc-chip" onClick={() => setMotion({ vz: 5e4 })} type="button">Add motion along B (helix)</button>
              </div>
              <NumberField label="Charge q" onChange={(q) => setMotion({ q })} unit="C" value={raw.motion.q} />
              <NumberField label="Mass m" onChange={(m) => setMotion({ m })} unit="kg" value={raw.motion.m} />
              <NumberField label="Velocity vx" onChange={(vx) => setMotion({ vx })} unit="m/s" value={raw.motion.vx} />
              <NumberField label="Velocity vy" onChange={(vy) => setMotion({ vy })} unit="m/s" value={raw.motion.vy} />
              <NumberField hint="Along the field (out of the screen when B > 0): makes a helix." label="Velocity vz" onChange={(vz) => setMotion({ vz })} unit="m/s" value={raw.motion.vz} />
              <NumberField hint="Positive: out of the screen ⊙. Negative: into the screen ⊗." label="Magnetic field Bz" onChange={(Bz) => setMotion({ Bz })} unit="T" value={raw.motion.Bz} />
              <ParamSlider format={(x) => `${fmt(x)} T`} label="Magnetic field Bz" max={1} min={-1} onChange={(Bz) => setMotion({ Bz: Math.abs(Bz) < 0.01 ? (Bz < 0 ? -0.01 : 0.01) : Bz })} step={0.01} value={raw.motion.Bz} />
              <NumberField label="Electric field Ex (optional)" onChange={(Ex) => setMotion({ Ex })} unit="V/m" value={raw.motion.Ex} />
              <NumberField label="Electric field Ey (optional)" onChange={(Ey) => setMotion({ Ey })} unit="V/m" value={raw.motion.Ey} />
              <NumberField label="Duration" onChange={(duration) => setMotion({ duration })} unit="s" value={raw.motion.duration} />
            </>
          ) : null}

          {sc === "conductor" ? (
            <>
              <NumberField hint="Positive current flows along the length vector below." label="Current I" onChange={(I) => setConductor({ I })} unit="A" value={raw.conductor.I} />
              <VecFields label="Length vector L" onChange={(x) => setConductor({ L: x })} unit="m" value={raw.conductor.L} />
              <VecFields label="Magnetic field B" onChange={(x) => setConductor({ B: x })} unit="T" value={raw.conductor.B} />
            </>
          ) : null}
          {errors.length ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
        </Panel>

        <div className="gc-stage">
          {v && !hasErrors && sc === "wire" && wf?.ok ? (
            <>
              <Callout tone="info" title={`Field at P: ${formatSI(wf.magnitude, "T")}`}>
                <p>{RIGHT_HAND_RULES.wire} {v.wires.map((w) => `Wire ${w.id}: current ${currentDirectionWord(w.I)}, so its field circulates ${circulation(w.I)}.`).join(" ")} Dots and crosses mark current out of and into the screen; the field itself lies in the plane of the screen.</p>
              </Callout>
              <DiagramFrame caption="Drag a wire or P (or use the arrow keys when one has focus; Shift for bigger steps). The dashed circle and its arrowhead show how the field circulates; grey arrows give the field direction at one length, shaded by strength. B at P is teal." label="Magnetic field of straight wires" legend={<Legend items={[{ label: "B at P", color: "#0b6a72", kind: "line" }, { label: "field direction", color: "#475569", kind: "line" }]} />} title="Wires seen end-on">
                <WireDiagram
                  onMoveProbe={(x, y) => update((c) => ({ ...c, probe: { x, y } }))}
                  onMoveWire={(id, x, y) => setWire(id, { x, y })}
                  onSelect={(id) => update((c) => ({ ...c, selectedWire: id }))}
                  probe={v.probe}
                  selected={v.selectedWire}
                  wires={v.wires}
                />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Field B at P", value: formatSI(wf.magnitude, "T"), note: `Bx = ${fmt(wf.B.x * 1e3)} mT, By = ${fmt(wf.B.y * 1e3)} mT` },
                { label: "Direction", value: directionWords(wf.B), note: "in the plane of the screen" },
                ...(v.wires.length === 1 ? [{ label: "Distance from the wire", value: formatSI(Math.hypot(v.probe.x - v.wires[0].x, v.probe.y - v.wires[0].y), "m"), note: "B = μ₀I/(2πr)" }] : []),
                { label: "Wires", value: String(v.wires.length), note: "added as vectors" },
              ]} />
              <DiagramFrame caption="|B| along the horizontal line through P, from the same wire model. It is cut near a wire, where the ideal filament is singular." label="Field strength along a line" legend={<Legend items={[{ label: "|B| (mT)", color: "#0b6a72", kind: "line" }]} />} title="Field strength along the line through P">
                <LineChart
                  current={{ x: v.probe.x * 100, y: Math.min(wireBc * 1e3, wf.magnitude * 1e3) }}
                  formatX={(x) => String(Number(x.toPrecision(3)))}
                  formatY={(y) => String(Number(y.toPrecision(3)))}
                  onXChange={(x) => { const nx = Math.round(x * 2) / 200; if (v.wires.every((w) => Math.hypot(w.x - nx, w.y - v.probe.y) >= 0.03)) update((c) => ({ ...c, probe: { ...c.probe, x: nx } })); }}
                  series={wireProfile}
                  title="Field strength along the line through P"
                  valueText={`B = ${formatSI(wf.magnitude, "T")} at x = ${fmt(v.probe.x * 100)} cm`}
                  xDomain={[WIRE_WORLD.xMin * 100, WIRE_WORLD.xMax * 100]}
                  xLabel="x (cm)"
                  xStep={0.5}
                  yDomain={[0, wireBc * 1e3]}
                  yLabel="|B| (mT)"
                />
              </DiagramFrame>
            </>
          ) : null}

          {v && !hasErrors && (sc === "loop" || sc === "solenoid") ? (
            <>
              <Callout tone="info" title={sc === "loop" ? `Loop: B at the centre ${formatSI(loopCentre(v.loop), "T")}` : `Solenoid: ideal interior field ${formatSI(solenoidIdeal(v.solenoid), "T")}`}>
                <p>{RIGHT_HAND_RULES.loop} {sc === "loop"
                  ? `Here the current circulates ${v.loop.I > 0 ? "counter-clockwise as seen from +x" : "clockwise as seen from +x"}, so the field inside points ${v.loop.I > 0 ? "along +x" : "along −x"}. B(x) = μ₀NIa²/(2(a²+x²)^{3/2}) holds on the axis only.`
                  : `B = μ₀nI inside a long solenoid. ${longSolenoidOk(v.solenoid) ? "This one is long compared with its radius, so the ideal value is a good guide away from the ends." : "This solenoid is short (length < 10 radii): the ideal value overestimates the field."}`}</p>
              </Callout>
              <DiagramFrame caption="Side view of the axis, x to the right, z out of the screen. Dots and crosses mark the wire crossing the screen. Grey arrows give the on-axis field direction (shaded by strength); the teal arrow is the field at the chosen point. Off-axis field is not drawn." label={sc === "loop" ? "Current loop" : "Solenoid"} title={sc === "loop" ? "Current loop and its axis" : "Solenoid and its axis"}>
                {sc === "loop" ? <LoopDiagram axisX={v.axisX} p={v.loop} /> : <SolenoidDiagram axisX={v.axisX} p={v.solenoid} />}
              </DiagramFrame>
              <KeyFigures items={sc === "loop" ? [
                { label: "Field at the centre", value: formatSI(loopCentre(v.loop), "T"), note: "μ₀NI/2a" },
                { label: `Field at x = ${fmt(v.axisX * 100)} cm`, value: formatSI(Math.abs(loopAxial(v.loop, v.axisX)), "T"), note: `${loopAxial(v.loop, v.axisX) >= 0 ? "along +x" : "along −x"}` },
                { label: "Ratio to the centre", value: fmt(loopAxial(v.loop, v.axisX) / loopCentre(v.loop)), note: "(1 + x²/a²)^{−3/2}" },
              ] : [
                { label: "Ideal interior field", value: formatSI(solenoidIdeal(v.solenoid), "T"), note: "μ₀nI" },
                { label: `Exact on-axis field at x = ${fmt(v.axisX * 100)} cm`, value: formatSI(Math.abs(solenoidAxial(v.solenoid, v.axisX)), "T"), note: "finite solenoid, on the axis" },
                { label: "Turns in all", value: fmt(v.solenoid.n * v.solenoid.L), note: "n × L" },
              ]} />
              <DiagramFrame caption={sc === "solenoid" ? "The exact on-axis field of the finite solenoid against the ideal μ₀nI: the field is nearly flat inside and about half as strong at each end." : "Field on the axis: strongest at the centre and falling roughly as 1/x³ far away."} label="Axial field" legend={<Legend items={sc === "solenoid" ? [{ label: "exact on axis", color: "#0b6a72", kind: "line" }, { label: "ideal μ₀nI", color: "#64748b", kind: "dashed" }] : [{ label: "B(x)", color: "#0b6a72", kind: "line" }]} />} title="Field along the axis">
                <LineChart
                  current={{ x: v.axisX, y: (sc === "loop" ? loopAxial(v.loop, v.axisX) : solenoidAxial(v.solenoid, v.axisX) * Math.sign(v.solenoid.I)) * 1e3 }}
                  formatX={(x) => String(Number(x.toPrecision(3)))}
                  formatY={(y) => String(Number(y.toPrecision(3)))}
                  onXChange={(x) => update((c) => ({ ...c, axisX: Math.max(-1, Math.min(1, Math.round(x * 200) / 200)) }))}
                  series={axisSeries}
                  title="Field along the axis"
                  valueText={`B = ${formatSI(Math.abs(sc === "loop" ? loopAxial(v.loop, v.axisX) : solenoidAxial(v.solenoid, v.axisX)), "T")} at x = ${fmt(v.axisX * 100)} cm`}
                  xDomain={[-axisXr, axisXr]}
                  xLabel="x (m)"
                  xStep={axisXr / 100}
                  yDomain={axisY}
                  yLabel="B (mT)"
                />
              </DiagramFrame>
            </>
          ) : null}

          {v && !hasErrors && sc === "lorentz" && lz && Fm && Ftot && vxB ? (
            <>
              <Callout tone="info" title={`Force on the charge: ${formatSI(norm3(Ftot), "N")}, ${directionWords(Ftot)}`}>
                <p>{RIGHT_HAND_RULES.force} Here v × B points {directionWords(vxB)}{lz.q > 0 ? ", and the charge is positive, so the force points that way." : ", but the charge is negative, so the force is the reverse."}</p>
              </Callout>
              <DiagramFrame caption="The in-plane part of each vector is an arrow; its out-of-screen part is a ⊙ (out) or ⊗ (into) that grows with the z fraction. Each vector is scaled separately. v teal, B dark, E rose, F amber." label="Lorentz force vectors" legend={<Legend items={[{ label: "velocity v", color: "#0b6a72", kind: "line" }, { label: "field B", color: "#0f172a", kind: "line" }, { label: "force F", color: "#b45309", kind: "line" }]} />} title="v, B and the force">
                <VectorDiagram items={lzItems} title="Velocity, magnetic field and Lorentz force of a moving charge" />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Magnetic force qv × B", value: formatSI(norm3(Fm), "N"), note: fmtVecSI([Fm.x, Fm.y, Fm.z], "N") },
                ...(norm3(lz.E) > 0 ? [{ label: "Electric force qE", value: formatSI(norm3({ x: lz.E.x * lz.q, y: lz.E.y * lz.q, z: lz.E.z * lz.q }), "N"), note: "adds to the magnetic force" }] : []),
                { label: "Total force", value: formatSI(norm3(Ftot), "N"), note: fmtVecSI([Ftot.x, Ftot.y, Ftot.z], "N") },
                { label: "Angle between v and B", value: safeAngle(lz.v, lz.B) === null ? "undefined" : `${fmt(safeAngle(lz.v, lz.B) as number)}°`, note: safeAngle(lz.v, lz.B) === null ? "v or B is zero, so F = 0" : `|q|vB sin θ = ${formatSI(magneticMagnitude(lz.q, norm3(lz.v), norm3(lz.B), safeAngle(lz.v, lz.B) as number), "N")}` },
                { label: "Power of the magnetic force", value: formatSI(dot3(Fm, lz.v), "W"), note: "F·v = 0: it does no work" },
                { label: "Acceleration", value: formatSI(norm3(Ftot) / lz.m, "m/s²"), note: "F/m" },
              ]} />
              <Panel subtitle="Components in the right-handed screen coordinates." title="Vectors">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="lorentz-table">
                    <thead><tr><th scope="col">Vector</th><th scope="col">x</th><th scope="col">y</th><th scope="col">z (out +)</th><th scope="col">Direction</th></tr></thead>
                    <tbody>
                      {[["v", "m/s", lz.v], ["B", "T", lz.B], ["v × B", "T·m/s", vxB], ["F total", "N", Ftot]].map(([name, unit, vec]) => { const w = vec as Vec3; const sv = unit === "N" ? scaleVec([w.x, w.y, w.z], "N") : { unit: unit as string, items: [fmt(w.x), fmt(w.y), fmt(w.z)] }; return <tr key={name as string}><th scope="row">{`${name as string} (${sv.unit})`}</th><td>{sv.items[0]}</td><td>{sv.items[1]}</td><td>{sv.items[2]}</td><td>{directionWords(w)}</td></tr>; })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          ) : null}

          {v && !hasErrors && sc === "motion" && motion && msum && now ? (
            <>
              <SimControls
                format={(tt) => `${formatSI(tt, "s")} = ${fmt(tt / msum.period)} orbits`}
                labels={SPEED_TEXT}
                onPause={() => { clock.pause(); setT(t, true); }}
                onPlay={clock.play}
                onReset={() => { clock.pause(); setT(0, true); }}
                onSpeed={(speed) => update((c) => ({ ...c, speed }))}
                onTime={(tt) => { clock.pause(); setT(tt, true); }}
                playing={clock.playing}
                rateOf={rateForTransient}
                speed={raw.speed}
                speeds={SPEEDS}
                t={t}
                tEnd={end}
              />
              <Callout tone="info" title={`${motion.Ex === 0 && motion.Ey === 0 ? (motion.vz === 0 ? "Circular" : "Helical") : "E × B drift"} motion: radius ${formatSI(msum.radius, "m")}, period ${formatSI(msum.period, "s")}`}>
                <p>The force is perpendicular to v, so the speed and kinetic energy stay constant (when E = 0). From the screen this {motion.q > 0 ? "positive" : "negative"} charge turns {senseWord(msum.sense)} in a field {motion.Bz > 0 ? "out of" : "into"} the screen.{motion.vz !== 0 ? ` The velocity along the field, ${formatSI(motion.vz, "m/s")}, carries it ${formatSI(Math.abs(msum.pitch), "m")} per turn.` : ""}</p>
              </Callout>
              <DiagramFrame caption={`Top view, equal scales. ${motion.Bz > 0 ? "⊙" : "⊗"} marks the field, dashed is the whole path, v is teal and the force F amber.`} label="Charged particle in a magnetic field, top view" legend={<Legend items={[{ label: "velocity v", color: "#0b6a72", kind: "line" }, { label: "force F", color: "#b45309", kind: "line" }]} />} title="Path seen from the screen">
                <MotionTopView p={motion} t={t} />
              </DiagramFrame>
              {motion.vz !== 0 ? (
                <DiagramFrame caption="The same motion in an oblique 3-D projection: the path advances along the field while it circles, which makes a helix." label="Helical path" title="Helix (oblique view)">
                  <MotionOblique p={motion} t={t} />
                </DiagramFrame>
              ) : null}
              <KeyFigures items={[
                { label: "Cyclotron frequency", value: formatSI(msum.frequency, "Hz"), note: "|q|B/(2πm)" },
                { label: "Period", value: formatSI(msum.period, "s"), note: "independent of speed" },
                { label: "Radius", value: formatSI(msum.radius, "m"), note: "m v⊥/(|q|B)" },
                { label: "Pitch", value: motion.vz === 0 ? "—" : formatSI(Math.abs(msum.pitch), "m"), note: "v∥ T" },
                { label: "Speed now", value: formatSI(now.speed, "m/s"), note: `kinetic energy ${formatSI(now.ke, "J")}` },
                { label: "Force now", value: formatSI(Math.hypot(now.fx, now.fy, now.fz), "N"), note: fmtVecSI([now.fx, now.fy, now.fz], "N") },
              ]} />
              <div className="ph-charts">
                <DiagramFrame label="Speed versus time" title="Speed">
                  <LineChart
                    current={{ x: eT(t), y: now.speed / vScale.factor }}
                    formatX={(x) => String(Number(x.toPrecision(3)))}
                    formatY={(y) => String(Number(y.toPrecision(4)))}
                    onXChange={(x) => { clock.pause(); setT(x * tScale.factor, true); }}
                    series={[{ id: "speed", label: "speed", color: "#0b6a72", points: trace.map((s) => ({ x: eT(s.t), y: s.speed / vScale.factor })) }]}
                    title="Speed versus time"
                    valueText={`Speed ${formatSI(now.speed, "m/s")} at ${formatSI(now.t, "s")}`}
                    xDomain={[0, eT(end)]}
                    xLabel={`Time (${tScale.unit})`}
                    xStep={eT(end) / 200}
                    yDomain={pad(Math.min(...trace.map((s) => s.speed)) / vScale.factor, Math.max(...trace.map((s) => s.speed)) / vScale.factor)}
                    yLabel={`speed (${vScale.unit})`}
                  />
                </DiagramFrame>
                <DiagramFrame label="Kinetic energy versus time" title="Kinetic energy">
                  <LineChart
                    current={{ x: eT(t), y: now.ke / keScale.factor }}
                    formatX={(x) => String(Number(x.toPrecision(3)))}
                    formatY={(y) => String(Number(y.toPrecision(4)))}
                    onXChange={(x) => { clock.pause(); setT(x * tScale.factor, true); }}
                    series={[{ id: "ke", label: "kinetic energy", color: "#6d28d9", points: trace.map((s) => ({ x: eT(s.t), y: s.ke / keScale.factor })) }]}
                    title="Kinetic energy versus time"
                    valueText={`Kinetic energy ${formatSI(now.ke, "J")} at ${formatSI(now.t, "s")}`}
                    xDomain={[0, eT(end)]}
                    xLabel={`Time (${tScale.unit})`}
                    xStep={eT(end) / 200}
                    yDomain={pad(keMin / keScale.factor, keMax / keScale.factor)}
                    yLabel={`KE (${keScale.unit})`}
                  />
                </DiagramFrame>
              </div>
            </>
          ) : null}

          {v && !hasErrors && sc === "conductor" && cd && Fc && LI ? (
            <>
              <Callout tone="info" title={`Force on the conductor: ${formatSI(norm3(Fc), "N")}, ${directionWords(Fc)}`}>
                <p>A current is moving charge, so F = I L × B, with L along the conventional current ({directionWords(LI)}). The force is largest when the wire is perpendicular to B and zero when it is parallel; the angle here is {safeAngle(LI, cd.B) === null ? "undefined (L or B is zero, so F = 0)" : `${fmt(safeAngle(LI, cd.B) as number)}°`}.</p>
              </Callout>
              <DiagramFrame caption="I L is the length vector along the current (teal), B the field (dark) and F the force (amber). Out-of-screen parts are ⊙ and ⊗." label="Force on a current-carrying conductor" legend={<Legend items={[{ label: "I L", color: "#0b6a72", kind: "line" }, { label: "field B", color: "#0f172a", kind: "line" }, { label: "force F", color: "#b45309", kind: "line" }]} />} title="Current, field and force">
                <VectorDiagram items={cdItems} title="Current direction, magnetic field and force on a conductor" />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Force F = I L × B", value: formatSI(norm3(Fc), "N"), note: fmtVecSI([Fc.x, Fc.y, Fc.z], "N") },
                { label: "Check: |I| L B sin θ", value: formatSI(Math.abs(cd.I) * norm3(cd.L) * norm3(cd.B) * Math.sin(((safeAngle(LI, cd.B) ?? 0) * Math.PI) / 180), "N"), note: "agrees with the cross product" },
                { label: "Length / current", value: `${formatSI(norm3(cd.L), "m")} · ${formatSI(Math.abs(cd.I), "A")}` },
              ]} />
            </>
          ) : null}

          {hasErrors ? <Callout tone="info" title="Enter valid values to see the diagram"><p>{errors[0] ?? "The diagram appears as soon as every field is valid."}</p></Callout> : null}

          {v && !hasErrors ? (
            practice ? (
              scenarios.length && practiceInput ? <GcPredictPanel input={practiceInput} onApply={(next) => update(() => next)} scenarios={scenarios} /> : <Callout tone="info" title="Nothing to predict here"><p>Practice questions need valid settings.</p></Callout>
            ) : challenge ? (
              <ChallengePanel
                challenges={MAGNETIC_CHALLENGES}
                index={Math.min(raw.challenge, MAGNETIC_CHALLENGES.length - 1)}
                inputs={v}
                onIndex={(i) => update((c) => ({ ...c, challenge: i }))}
                onPick={(c) => { if (c.view) setScenario(c.view as MagneticScenario); }}
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
        <ul className="gc-assumptions">{MAGNETIC_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      <RelatedConcepts subject="physics" toolId="phMagnetic" />
    </div>
  );
}

