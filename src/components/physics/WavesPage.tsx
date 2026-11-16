import { useEffect, useMemo, useRef, useState } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import { type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch, type LearningMode } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GcPredictPanel, NumberField, Paragraphs } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { fmt } from "../../utils/physics/format";
import { WAVES_ASSUMPTIONS, summarizeWaves } from "../../utils/physics/physicsSummary";
import { rateForTransient, type SpeedChoice } from "../../utils/physics/simClock";
import { WAVES_CHALLENGES, wavesLessons, wavesScenarios } from "../../utils/physics/waveOpticsLearning";
import {
  allowedHarmonic, allowedHarmonics, antinodePositions, classifySuperposition, displacement, dopplerGeometry, harmonicFrequency, harmonicWavelength, nodePositions,
  particleVelocity, RESONATOR_LABEL, RESONATOR_LIMITS, solveDoppler, standingDisplacement, sumDisplacement, validateDoppler, validateResonator, validateSuperposition, validateWave,
  waveQuantities, wavefrontsReceived, WAVE_LIMITS, DOPPLER_LIMITS, TWO_PI, type ResonatorKind,
} from "../../utils/physics/waves";
import {
  DEFAULT_WAVES_INPUTS, describeWavesAnalysis, validateWavesInputs, validatePhysicsResults, WAVE_VIEWS, WAVE_VIEW_LABEL, wavesEnd, WAVES_ENGINE_VERSION, type WavesInputs, type WaveView,
} from "../../utils/persistence/physicsTools";
import { ChallengePanel } from "./ChallengePanel";
import { ParamSlider, SimControls } from "./sim";
import { useSimClock } from "./simHooks";
import { TimeChart } from "./TimeChart";
import { useSimTime } from "./useSimTime";
import { DopplerDiagram, ResonatorDiagram, SuperpositionDiagram, TravelDiagram } from "./WaveDiagrams";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

const SPEEDS: SpeedChoice[] = ["quarter", "real", "fast"];
const SPEED_TEXT: Partial<Record<SpeedChoice, string>> = { quarter: "Slow 12 s", real: "Normal 6 s", fast: "Fast 3 s" };
const TEAL = "#0b6a72";
const AMBER = "#b45309";
const INK = "#0f172a";

type WavePatch = Partial<WavesInputs["wave"]>;
const WAVE_PRESETS: Array<{ label: string; wave: WavePatch; longitudinal?: boolean }> = [
  { label: "Rope wave", wave: { A: 0.1, f: 2, v: 4, phiDeg: 0, dir: 1 } },
  { label: "Longitudinal pulse (clear compressions)", wave: { A: 0.15, f: 2, v: 4, phiDeg: 0, dir: 1 }, longitudinal: true },
  { label: "Sound in air, 440 Hz", wave: { A: 0.005, f: 440, v: 343, phiDeg: 0, dir: 1 } },
  { label: "Wave toward −x", wave: { A: 0.1, f: 2, v: 4, phiDeg: 0, dir: -1 } },
];
const SUP_PRESETS: Array<{ label: string; sup: WavesInputs["sup"] }> = [
  { label: "Standing wave", sup: { v: 4, w1: { A: 0.1, f: 2, v: 4, phiDeg: 0, dir: 1 }, w2: { A: 0.1, f: 2, v: 4, phiDeg: 0, dir: -1 } } },
  { label: "Constructive (same direction)", sup: { v: 4, w1: { A: 0.1, f: 2, v: 4, phiDeg: 0, dir: 1 }, w2: { A: 0.1, f: 2, v: 4, phiDeg: 0, dir: 1 } } },
  { label: "Destructive (180° apart)", sup: { v: 4, w1: { A: 0.1, f: 2, v: 4, phiDeg: 0, dir: 1 }, w2: { A: 0.1, f: 2, v: 4, phiDeg: 180, dir: 1 } } },
  { label: "Partly standing (unequal amplitudes)", sup: { v: 4, w1: { A: 0.1, f: 2, v: 4, phiDeg: 0, dir: 1 }, w2: { A: 0.05, f: 2, v: 4, phiDeg: 0, dir: -1 } } },
  { label: "Beats: 440 and 444 Hz sound", sup: { v: 343, w1: { A: 0.001, f: 440, v: 343, phiDeg: 0, dir: 1 }, w2: { A: 0.001, f: 444, v: 343, phiDeg: 0, dir: 1 } } },
];
const DOP_PRESETS: Array<{ label: string; dop: WavesInputs["dop"] }> = [
  { label: "Ambulance approaching (30 m/s)", dop: { fs: 440, c: 343, vs: 30, vo: 0 } },
  { label: "Ambulance receding", dop: { fs: 440, c: 343, vs: -30, vo: 0 } },
  { label: "Observer walks toward a siren (30 m/s)", dop: { fs: 440, c: 343, vs: 0, vo: 30 } },
  { label: "Both approach (40 m/s each)", dop: { fs: 440, c: 343, vs: 40, vo: 40 } },
  { label: "Source at 300 m/s (near sonic)", dop: { fs: 440, c: 343, vs: 300, vo: 0 } },
];
const RES_PRESETS: Array<{ label: string; res: WavesInputs["res"] }> = [
  { label: "Guitar-like string, 3rd harmonic", res: { kind: "string", L: 0.65, v: 260, n: 3, A: 0.01 } },
  { label: "Open pipe, 2nd harmonic", res: { kind: "open", L: 0.5, v: 340, n: 2, A: 0.01 } },
  { label: "Closed pipe, 3rd harmonic", res: { kind: "closed", L: 0.85, v: 340, n: 3, A: 0.01 } },
];

export default function WavesPage({ openRequest = null, onOpenHandled }: Props) {
  const resetClockRef = useRef<() => void>(() => undefined);
  const ws = useGcWorkspace<WavesInputs>({
    page: "waves",
    engineVersion: WAVES_ENGINE_VERSION,
    defaults: DEFAULT_WAVES_INPUTS,
    validateInputs: validateWavesInputs,
    validateResults: validatePhysicsResults,
    summarize: summarizeWaves,
    describe: describeWavesAnalysis,
    fallbackName: "Wave analysis",
    openRequest,
    onOpenHandled,
    onReset: () => resetClockRef.current(),
  });
  const { raw, update } = ws;
  const [mode, setMode] = useState<LearningMode>("explore");
  /** Applies a change and keeps the saved time inside the (possibly shorter) time axis. */
  const patch = (fn: (c: WavesInputs) => WavesInputs) => update((c) => { const n = fn(c); const end = (() => { try { return wavesEnd(n); } catch { return 0; } })(); return { ...n, tNow: Number.isFinite(end) ? Math.min(n.tNow, Math.max(end, 0)) : 0 }; });
  const view = raw.view;

  const waveCheck = useMemo(() => validateWave(raw.wave), [raw.wave]);
  const supCheck = useMemo(() => validateSuperposition(raw.sup), [raw.sup]);
  const resCheck = useMemo(() => validateResonator(raw.res), [raw.res]);
  const dopCheck = useMemo(() => validateDoppler(raw.dop), [raw.dop]);
  const check = { travel: waveCheck, superposition: supCheck, standing: resCheck, doppler: dopCheck }[view];
  const errors = check.ok ? null : check.errors;
  const errorFor = (needle: RegExp) => errors?.find((e) => needle.test(e)) ?? null;
  const ok = check.ok;

  const tEnd = ok && ws.valid ? wavesEnd(ws.valid) : ok ? wavesEnd(raw) : 0;
  const [t, setT] = useSimTime(raw.tNow, tEnd, (next) => update((c) => (Object.is(c.tNow, next) ? c : { ...c, tNow: next })));
  const clock = useSimClock({ t, tEnd, rate: rateForTransient(raw.speed, tEnd), onTime: (next, final) => setT(next, final) });
  useEffect(() => { resetClockRef.current = () => { clock.pause(); setT(0, true); }; });
  const seek = (x: number) => { clock.pause(); setT(x, true); };

  const q = waveCheck.ok ? waveQuantities(waveCheck.value) : null;
  const cls = supCheck.ok ? classifySuperposition(supCheck.value) : null;
  const dop = dopCheck.ok ? solveDoppler(dopCheck.value) : null;
  const geo = dopCheck.ok ? dopplerGeometry(dopCheck.value) : null;
  const resV = resCheck.ok ? resCheck.value : null;
  const [drive, setDrive] = useState(300);

  const charts = (() => {
    if (!ok) return null;
    const N = 200;
    const times = Array.from({ length: N + 1 }, (_, k) => (tEnd * k) / N);
    const mk = (id: string, label: string, ys: number[], color: string, dash?: string): ChartSeries => ({ id, label, color, dash, points: times.map((x, k) => ({ x, y: ys[k] })) });
    if (view === "travel" && waveCheck.ok) {
      const w = waveCheck.value;
      const x0 = 0.25 * (w.v / w.f);
      return [
        { title: "Displacement of one particle", yLabel: "y (m)", series: [mk("y", "particle at the marked position", times.map((x) => displacement(w, x0, x)), TEAL)] },
        { title: "Velocity of that particle", yLabel: "∂y/∂t (m/s)", series: [mk("v", "particle velocity", times.map((x) => particleVelocity(w, x0, x)), AMBER)] },
      ];
    }
    if (view === "superposition" && supCheck.ok) {
      const s = supCheck.value;
      const series: ChartSeries[] = [mk("sum", "sum at x = 0", times.map((x) => sumDisplacement(s, 0, x)), INK)];
      if (classifySuperposition(s).kind === "beats") {
        const env = (x: number) => Math.sqrt(Math.max(0, s.w1.A ** 2 + s.w2.A ** 2 + 2 * s.w1.A * s.w2.A * Math.cos((-s.w2.dir * TWO_PI * s.w2.f + s.w1.dir * TWO_PI * s.w1.f) * x + ((s.w2.phiDeg - s.w1.phiDeg) * Math.PI) / 180)));
        series.push(mk("up", "envelope", times.map(env), AMBER, "7 4"), mk("dn", "envelope (lower)", times.map((x) => -env(x)), AMBER, "7 4"));
      }
      return [{ title: "Disturbance at x = 0", yLabel: "y (m)", series }];
    }
    if (view === "standing" && resV) {
      const a = antinodePositions(resV.kind, resV.L, resV.n)[0] ?? resV.L / 2;
      return [{ title: "Displacement at the first antinode", yLabel: "y (m)", series: [mk("y", `antinode at ${fmt(a)} m`, times.map((x) => standingDisplacement(resV, a, x)), TEAL)] }];
    }
    return null;
  })();

  const practice = mode === "practice";
  const challenge = mode === "challenge";
  const practiceInput = useMemo(() => (ws.valid ? { ...ws.valid, tNow: 0 } : null), [ws.valid]);
  const scenarios = useMemo(() => (practiceInput ? wavesScenarios(practiceInput) : []), [practiceInput]);
  const lessons = useMemo(() => (ws.valid ? wavesLessons(ws.valid) : []), [ws.valid]);
  const setWave = (p: WavePatch) => patch((c) => ({ ...c, wave: { ...c.wave, ...p } }));
  const setSupWave = (which: "w1" | "w2", p: WavePatch) => patch((c) => ({ ...c, sup: { ...c.sup, [which]: { ...c.sup[which], ...p } } }));
  const setMedium = (v: number) => patch((c) => ({ ...c, sup: { v, w1: { ...c.sup.w1, v }, w2: { ...c.sup.w2, v } } }));
  const setRes = (p: Partial<WavesInputs["res"]>) => patch((c) => ({ ...c, res: { ...c.res, ...p } }));
  const setDop = (p: Partial<WavesInputs["dop"]>) => patch((c) => ({ ...c, dop: { ...c.dop, ...p } }));
  const dirOptions = [{ id: "1", label: "toward +x" }, { id: "-1", label: "toward −x" }];

  const waveControls = (which: "w1" | "w2", name: string) => {
    const w = raw.sup[which];
    const set = (p: WavePatch) => setSupWave(which, p);
    return (
      <fieldset className="gc-fieldset" key={which}>
        <legend>{name}</legend>
        <NumberField error={errorFor(new RegExp(`${name} amplitude`))} label={`${name} amplitude`} onChange={(A) => set({ A })} unit="m" value={w.A} />
        <ParamSlider format={(v) => `${fmt(v)} Hz`} label={`${name} frequency`} max={which === "w1" ? 600 : 600} min={0.5} onChange={(f) => set({ f })} step={0.5} value={w.f} />
        <NumberField error={errorFor(new RegExp(`${name} frequency`))} label={`${name} frequency`} onChange={(f) => set({ f })} unit="Hz" value={w.f} />
        <ParamSlider format={(v) => `${fmt(v)}°`} label={`${name} phase`} max={180} min={-180} onChange={(phiDeg) => set({ phiDeg })} step={5} value={w.phiDeg} />
        <Segmented<"1" | "-1"> label={`${name} direction`} onChange={(d) => set({ dir: d === "1" ? 1 : -1 })} options={dirOptions as Array<{ id: "1" | "-1"; label: string }>} value={w.dir === 1 ? "1" : "-1"} />
      </fieldset>
    );
  };

  const nodeList = resV ? nodePositions(resV.kind, resV.L, resV.n) : [];
  const antiList = resV ? antinodePositions(resV.kind, resV.L, resV.n) : [];
  const nearest = resV ? allowedHarmonics(resV.kind).map((n) => ({ n, f: harmonicFrequency(resV.kind, resV.L, resV.v, n) })).reduce((best, h) => (Math.abs(h.f - drive) < Math.abs(best.f - drive) ? h : best)) : null;
  const resonant = nearest ? Math.abs(nearest.f - drive) / nearest.f <= 0.01 : false;
  const wavefronts = dopCheck.ok && geo ? wavefrontsReceived(dopCheck.value, t) : 0;
  const ratioCounted = dopCheck.ok && geo ? 10 / (geo.arrival(10) - geo.arrival(0)) : NaN;

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Waves & optics"
        title="Waves & sound"
        purpose="Watch a wave travel, add two waves together, find the standing waves of a string or pipe, and see how motion changes the pitch you hear."
        evidence="model"
        steps={[
          { label: "Choose a view", detail: "Traveling wave, superposition, standing waves or Doppler." },
          { label: "Change a quantity", detail: "Frequency, speed, amplitude, phase, length or motion." },
          { label: "Read the pattern", detail: "Diagram, numbers and graphs share one clock." },
        ]}
        aside={<Badge tone="neutral" title="Small-amplitude waves in a lossless medium.">linear waves</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch blurbs={{ practice: "Predict what a change does, then check it against the model.", challenge: "Reach a stated target setup; the model checks it." }} mode={mode} modes={["explore", "practice", "challenge"]} onChange={setMode} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Everything here is in SI units." title="Settings">
          <Segmented<WaveView> label="View" onChange={(v) => { clock.pause(); update((c) => ({ ...c, view: v, tNow: 0 })); }} options={WAVE_VIEWS.map((id) => ({ id, label: WAVE_VIEW_LABEL[id] }))} value={view} />

          {view === "travel" ? (
            <>
              <div className="gc-presets" role="group" aria-label="Example waves">
                {WAVE_PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => patch((c) => ({ ...c, wave: { ...c.wave, ...p.wave }, longitudinal: p.longitudinal ?? false, tNow: 0 }))} type="button">{p.label}</button>)}
              </div>
              <Segmented<"t" | "l"> label="Wave type shown" onChange={(k) => patch((c) => ({ ...c, longitudinal: k === "l" }))} options={[{ id: "t", label: "Transverse" }, { id: "l", label: "Longitudinal" }]} value={raw.longitudinal ? "l" : "t"} />
              <ParamSlider format={(v) => `${fmt(v)} Hz`} label="Frequency" max={20} min={0.5} onChange={(f) => setWave({ f })} step={0.5} value={raw.wave.f} />
              <NumberField error={errorFor(/frequency/)} label="Frequency" onChange={(f) => setWave({ f })} unit="Hz" value={raw.wave.f} />
              <ParamSlider format={(v) => `${fmt(v)} m/s`} label="Wave speed (set by the medium)" max={50} min={1} onChange={(v) => setWave({ v })} step={0.5} value={raw.wave.v} />
              <NumberField error={errorFor(/speed/)} label="Wave speed" onChange={(v) => setWave({ v })} unit="m/s" value={raw.wave.v} />
              <ParamSlider format={(v) => `${fmt(v)} m`} label="Amplitude" max={0.5} min={0.01} onChange={(A) => setWave({ A })} step={0.01} value={raw.wave.A} />
              <NumberField error={errorFor(/amplitude/)} hint={`At most ${WAVE_LIMITS.maxSteep} of the wavelength.`} label="Amplitude" onChange={(A) => setWave({ A })} unit="m" value={raw.wave.A} />
              <ParamSlider format={(v) => `${fmt(v)}°`} label="Phase φ" max={180} min={-180} onChange={(phiDeg) => setWave({ phiDeg })} step={5} value={raw.wave.phiDeg} />
              <Segmented<"1" | "-1"> label="Direction" onChange={(d) => setWave({ dir: d === "1" ? 1 : -1 })} options={dirOptions as Array<{ id: "1" | "-1"; label: string }>} value={raw.wave.dir === 1 ? "1" : "-1"} />
            </>
          ) : null}

          {view === "superposition" ? (
            <>
              <div className="gc-presets" role="group" aria-label="Example combinations">
                {SUP_PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => patch((c) => ({ ...c, sup: p.sup, tNow: 0 }))} type="button">{p.label}</button>)}
              </div>
              <NumberField error={errorFor(/Wave speed|medium/)} hint="Both waves travel in this one medium." label="Wave speed in the medium" onChange={setMedium} unit="m/s" value={raw.sup.v} />
              {waveControls("w1", "Wave 1")}
              {waveControls("w2", "Wave 2")}
            </>
          ) : null}

          {view === "standing" ? (
            <>
              <div className="gc-presets" role="group" aria-label="Example resonators">
                {RES_PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => patch((c) => ({ ...c, res: p.res, tNow: 0 }))} type="button">{p.label}</button>)}
              </div>
              <Segmented<ResonatorKind> label="System" onChange={(kind) => setRes({ kind, n: kind === "closed" && raw.res.n % 2 === 0 ? raw.res.n + 1 : raw.res.n })} options={(["string", "open", "closed"] as ResonatorKind[]).map((id) => ({ id, label: RESONATOR_LABEL[id] }))} value={raw.res.kind} />
              <NumberField error={errorFor(/Length/)} label="Length L" onChange={(L) => setRes({ L })} unit="m" value={raw.res.L} />
              <NumberField error={errorFor(/speed|Speed/)} label={raw.res.kind === "string" ? "Wave speed on the string" : "Speed of sound"} onChange={(v) => setRes({ v })} unit="m/s" value={raw.res.v} />
              <div className="ph-harmonics" role="group" aria-label="Harmonic number">
                {Array.from({ length: RESONATOR_LIMITS.maxN }, (_, k) => k + 1).map((n) => (
                  <button aria-pressed={raw.res.n === n} className={raw.res.n === n ? "secondary-button is-on gc-chip" : "ghost-button gc-chip"} disabled={!allowedHarmonic(raw.res.kind, n)} key={n} onClick={() => setRes({ n })} title={allowedHarmonic(raw.res.kind, n) ? `Harmonic ${n}` : "A pipe closed at one end has only odd harmonics"} type="button">n = {n}</button>
                ))}
              </div>
              {raw.res.kind === "closed" ? <p className="gc-field-hint">Closed pipes support odd harmonics only; even ones are disabled.</p> : null}
              <NumberField error={errorFor(/Amplitude|amplitude/)} label="Antinode amplitude (drawing)" onChange={(A) => setRes({ A })} unit="m" value={raw.res.A} />
            </>
          ) : null}

          {view === "doppler" ? (
            <>
              <div className="gc-presets" role="group" aria-label="Example motions">
                {DOP_PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => patch((c) => ({ ...c, dop: p.dop, tNow: 0 }))} type="button">{p.label}</button>)}
              </div>
              <NumberField error={errorFor(/Source frequency/)} label="Frequency emitted" onChange={(fs) => setDop({ fs })} unit="Hz" value={raw.dop.fs} />
              <NumberField error={errorFor(/Speed of sound/)} label="Speed of sound c" onChange={(c) => setDop({ c })} unit="m/s" value={raw.dop.c} />
              <ParamSlider format={(v) => `${fmt(v)} m/s`} label="Source velocity (+ toward the observer)" max={Math.min(raw.dop.c - 1, 330)} min={-Math.min(raw.dop.c - 1, 330)} onChange={(vs) => setDop({ vs })} step={1} value={raw.dop.vs} />
              <NumberField error={errorFor(/source speed/i)} hint="Must be below the speed of sound." label="Source velocity" onChange={(vs) => setDop({ vs })} unit="m/s" value={raw.dop.vs} />
              <ParamSlider format={(v) => `${fmt(v)} m/s`} label="Observer velocity (+ toward the source)" max={Math.min(raw.dop.c - 1, 330)} min={-Math.min(raw.dop.c - 1, 330)} onChange={(vo) => setDop({ vo })} step={1} value={raw.dop.vo} />
              <NumberField error={errorFor(/observer speed/i)} label="Observer velocity" onChange={(vo) => setDop({ vo })} unit="m/s" value={raw.dop.vo} />
              <p className="gc-field-hint">Limits: {DOPPLER_LIMITS.minF}–{DOPPLER_LIMITS.maxF} Hz, c {DOPPLER_LIMITS.minC}–{DOPPLER_LIMITS.maxC} m/s, both speeds below c.</p>
            </>
          ) : null}
          {errors ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
        </Panel>

        <div className="gc-stage">
          {ok ? (
            <>
              <SimControls
                format={(x) => (view === "doppler" ? `${fmt(x)} of ${fmt(tEnd)} source periods` : `${fmt(x)} s of ${fmt(tEnd)} s`)}
                labels={SPEED_TEXT}
                onPause={() => { clock.pause(); setT(t, true); }}
                onPlay={clock.play}
                onReset={() => seek(0)}
                onSpeed={(speed) => update((c) => ({ ...c, speed }))}
                onTime={seek}
                playing={clock.playing}
                rateOf={rateForTransient}
                speed={raw.speed}
                speeds={SPEEDS}
                t={t}
                tEnd={tEnd}
              />

              {view === "travel" && q && waveCheck.ok ? (
                <>
                  <DiagramFrame caption={raw.longitudinal ? "Red lines mark one particle in nine; each oscillates about its fixed place. Dark lines are particles, bunched where the density curve rises above 1." : "The red dot is one particle of the medium: it moves up and down while the wave moves along."} label="Traveling wave diagram" legend={<Legend items={[{ label: "wave", color: TEAL }, { label: "one particle", color: "#be123c" }]} />} title={raw.longitudinal ? "Longitudinal wave" : "Transverse wave"}>
                    <TravelDiagram longitudinal={raw.longitudinal} t={t} wave={waveCheck.value} />
                  </DiagramFrame>
                  <KeyFigures items={[
                    { label: "Wavelength", value: `${fmt(q.lambda)} m`, note: "λ = v/f" },
                    { label: "Period", value: `${fmt(q.T)} s`, note: "T = 1/f" },
                    { label: "Wave speed", value: `${fmt(waveCheck.value.v)} m/s`, note: "set by the medium" },
                    { label: "Greatest particle speed", value: `${fmt(q.omega * waveCheck.value.A)} m/s`, note: "ωA: not the wave speed" },
                    { label: "Wave number", value: `${fmt(q.k)} rad/m`, note: "k = 2π/λ" },
                    { label: "Angular frequency", value: `${fmt(q.omega)} rad/s`, note: "ω = 2πf" },
                  ]} />
                  <p className="gc-eq-line">y(x, t) = A sin(kx {waveCheck.value.dir === 1 ? "−" : "+"} ωt + φ) = {fmt(waveCheck.value.A)} sin({fmt(q.k)}x {waveCheck.value.dir === 1 ? "−" : "+"} {fmt(q.omega)}t + {fmt(waveCheck.value.phiDeg)}°)</p>
                </>
              ) : null}

              {view === "superposition" && cls && supCheck.ok ? (
                <>
                  <Callout tone={cls.kind === "partly-standing" ? "warn" : "info"} title={cls.title}><p>{cls.detail}</p></Callout>
                  <DiagramFrame label="Superposition diagram" legend={<Legend items={[{ label: "wave 1", color: TEAL }, { label: "wave 2", color: AMBER, kind: "dashed" }, { label: "sum", color: INK }]} />} title="Two waves and their sum">
                    <SuperpositionDiagram sup={supCheck.value} t={t} />
                  </DiagramFrame>
                  <KeyFigures items={[
                    { label: "Largest amplitude", value: `${fmt(cls.maxAmplitude)} m` },
                    { label: "Smallest amplitude", value: `${fmt(cls.minAmplitude)} m`, note: cls.kind === "standing" ? "zero at the nodes" : undefined },
                    { label: "Beat frequency", value: `${fmt(cls.beatFrequency)} Hz`, note: "|f₁ − f₂|" },
                    { label: "Phase difference", value: `${fmt(cls.phaseDifferenceDeg)}°`, note: "second wave minus first" },
                  ]} />
                </>
              ) : null}

              {view === "standing" && resV ? (
                <>
                  <DiagramFrame caption="Red dots: nodes (displacement always zero). Rings: antinodes. The dashed curves are the envelope of the motion." label="Standing wave diagram" title={RESONATOR_LABEL[resV.kind]}>
                    <ResonatorDiagram res={resV} t={t} />
                  </DiagramFrame>
                  <KeyFigures items={[
                    { label: `Frequency of harmonic ${resV.n}`, value: `${fmt(harmonicFrequency(resV.kind, resV.L, resV.v, resV.n))} Hz` },
                    { label: "Fundamental", value: `${fmt(harmonicFrequency(resV.kind, resV.L, resV.v, 1))} Hz` },
                    { label: "Wavelength", value: `${fmt(harmonicWavelength(resV.kind, resV.L, resV.n))} m`, note: resV.kind === "closed" ? "4L/n, n odd" : "2L/n" },
                    { label: "Nodes", value: String(nodeList.length), note: nodeList.map((x) => fmt(x)).join(", ") + " m" },
                    { label: "Antinodes", value: String(antiList.length), note: antiList.map((x) => fmt(x)).join(", ") + " m" },
                  ]} />
                  <Panel subtitle="Frequencies this system can sustain." title="Harmonics and resonance">
                    <div className="gc-table-scroll">
                      <table className="gc-table ph-table" data-testid="harmonics">
                        <thead><tr><th scope="col">n</th><th scope="col">Frequency</th><th scope="col">Wavelength</th><th scope="col">Nodes</th></tr></thead>
                        <tbody>{allowedHarmonics(resV.kind, 8).map((n) => <tr className={n === resV.n ? "is-here" : ""} key={n}><th scope="row">{n}</th><td>{fmt(harmonicFrequency(resV.kind, resV.L, resV.v, n))} Hz</td><td>{fmt(harmonicWavelength(resV.kind, resV.L, n))} m</td><td>{nodePositions(resV.kind, resV.L, n).length}</td></tr>)}</tbody>
                      </table>
                    </div>
                    <NumberField hint="A driver whose frequency matches a harmonic (within 1 %) builds up a large standing wave." label="Driving frequency" onChange={setDrive} unit="Hz" value={drive} />
                    {nearest ? <p className="gc-eq-line" data-testid="resonance">{resonant ? `Resonance: ${fmt(drive)} Hz matches harmonic ${nearest.n} (${fmt(nearest.f)} Hz).` : `No resonance: the nearest harmonic is n = ${nearest.n} at ${fmt(nearest.f)} Hz, ${fmt(Math.abs(nearest.f - drive))} Hz away.`}</p> : null}
                  </Panel>
                </>
              ) : null}

              {view === "doppler" && dop && dopCheck.ok ? (
                <>
                  <Callout tone="info" title={`Heard: ${fmt(dop.fObserved)} Hz (${dop.trend === "same" ? "same as emitted" : `${dop.trend} than the ${fmt(dopCheck.value.fs)} Hz emitted`})`}>
                    <p>f′ = f (c + v_o)/(c − v_s) = {fmt(dopCheck.value.fs)} × ({fmt(dopCheck.value.c)} + {fmt(dopCheck.value.vo)})/({fmt(dopCheck.value.c)} − {fmt(dopCheck.value.vs)}) = {fmt(dop.fObserved)} Hz.</p>
                  </Callout>
                  <DiagramFrame caption="Lengths are in rest wavelengths and times in source periods, so the picture is the same for any frequency; the numbers beside it carry the units. One circle per source period." label="Doppler diagram" title="Wavefronts from a moving source">
                    <DopplerDiagram dop={dopCheck.value} t={t} />
                  </DiagramFrame>
                  <KeyFigures items={[
                    { label: "Observed frequency", value: `${fmt(dop.fObserved)} Hz` },
                    { label: "Frequency ratio", value: fmt(dop.ratio), note: "f′/f" },
                    { label: "Wavelength in the medium", value: `${fmt(dop.lambdaMedium)} m`, note: `${fmt(dop.lambdaAtRest)} m at rest` },
                    { label: "Source moving alone", value: `${fmt(dop.fSourceOnly)} Hz` },
                    { label: "Observer moving alone", value: `${fmt(dop.fObserverOnly)} Hz` },
                    { label: "Wavefronts received so far", value: String(wavefronts), note: `counted ratio ${fmt(ratioCounted, 4)} = f′/f` },
                  ]} />
                </>
              ) : null}

              {charts ? <div className="ph-charts">{charts.map((c) => <TimeChart include0 key={c.title} onTime={seek} series={c.series} t={t} tEnd={tEnd} title={c.title} value={c.series[0].points[Math.min(c.series[0].points.length - 1, Math.round((t / (tEnd || 1)) * (c.series[0].points.length - 1)))]?.y ?? 0} yLabel={c.yLabel} />)}</div> : null}

              {practice ? (
                scenarios.length && practiceInput ? <GcPredictPanel input={practiceInput} onApply={(next) => update(() => next)} scenarios={scenarios} /> : <Callout tone="info" title="Nothing to predict here"><p>Practice questions need valid settings in this view.</p></Callout>
              ) : challenge ? (
                <ChallengePanel challenges={WAVES_CHALLENGES} inputs={raw} onPick={(c) => { if (c.view && c.view !== raw.view) { clock.pause(); update((x) => ({ ...x, view: c.view as WaveView, tNow: 0 })); } }} />
              ) : (
                <Panel subtitle="Each answer quotes the numbers for the system you have set up." title="Why does it behave this way?">
                  {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
                </Panel>
              )}
            </>
          ) : (
            <Callout tone="info" title="Enter valid values to see the wave"><p>{errors?.[0] ?? "The diagram, numbers and graphs appear as soon as every field is valid."}</p></Callout>
          )}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">
          {WAVES_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
          <li>Not modelled: damping and dispersion, nonlinear waves, waves in two or three dimensions, reflection and transmission at boundaries between media, and real instruments (end corrections, stiffness, mode coupling).</li>
        </ul>
      </Panel>
      <RelatedConcepts subject="physics" toolId="phWaves" />
    </div>
  );
}
