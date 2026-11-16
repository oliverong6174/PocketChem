import { useMemo, useState } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import { LineChart, type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch, type LearningMode } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GcPredictPanel, NumberField, Paragraphs } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import { fmt, formatSI } from "../../utils/physics/format";
import {
  defaultScreenHalfWidth, dispersion, intensityAtScreen, pathDifferenceWavelengths, samplePattern, SLIT_LIMITS, summarizeSlits, validateSlits, wavelengthColor,
} from "../../utils/physics/interference";
import { INTERFERENCE_ASSUMPTIONS, summarizeInterference } from "../../utils/physics/physicsSummary";
import { INTERFERENCE_CHALLENGES, interferenceLessons, interferenceScenarios } from "../../utils/physics/waveOpticsLearning";
import {
  DEFAULT_INTERFERENCE_INPUTS, describeInterferenceAnalysis, INTERFERENCE_ENGINE_VERSION, validateInterferenceInputs, validatePhysicsResults, type InterferenceInputs,
} from "../../utils/persistence/physicsTools";
import { ChallengePanel } from "./ChallengePanel";
import { FringeStrip, SlitSetupDiagram } from "./InterferenceDiagrams";
import { ParamSlider } from "./sim";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };

const PRESETS: Array<{ label: string; slits: InterferenceInputs["slits"] }> = [
  { label: "Young's double slit (green)", slits: { lambdaNm: 550, aUm: 20, dUm: 100, N: 2, L: 1.5 } },
  { label: "Single slit", slits: { lambdaNm: 550, aUm: 50, dUm: 100, N: 1, L: 2 } },
  { label: "Missing orders (d = 4a)", slits: { lambdaNm: 500, aUm: 50, dUm: 200, N: 2, L: 2 } },
  { label: "Five-slit grating", slits: { lambdaNm: 550, aUm: 10, dUm: 100, N: 5, L: 1.5 } },
  { label: "Red light, double slit", slits: { lambdaNm: 650, aUm: 20, dUm: 100, N: 2, L: 1.5 } },
  { label: "Violet light, double slit", slits: { lambdaNm: 420, aUm: 20, dUm: 100, N: 2, L: 1.5 } },
];
const COLOR_NOTE = "Colour is a display aid for the wavelength; the intensity is the physics.";

export default function InterferencePage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<InterferenceInputs>({
    page: "interference",
    engineVersion: INTERFERENCE_ENGINE_VERSION,
    defaults: DEFAULT_INTERFERENCE_INPUTS,
    validateInputs: validateInterferenceInputs,
    validateResults: validatePhysicsResults,
    summarize: summarizeInterference,
    describe: describeInterferenceAnalysis,
    fallbackName: "Interference analysis",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  const [mode, setMode] = useState<LearningMode>("explore");
  const setS = (p: Partial<InterferenceInputs["slits"]>) => update((c) => {
    const slits = { ...c.slits, ...p };
    // keep the probe on the screen when the geometry changes
    const lim = 500 * (Number.isFinite(slits.L) ? slits.L : 1);
    return { ...c, slits, probeMm: Math.max(-lim, Math.min(lim, c.probeMm)) };
  });
  const check = useMemo(() => validateSlits(raw.slits), [raw.slits]);
  const errors = check.ok ? null : check.errors;
  const errorFor = (needle: RegExp) => errors?.find((e) => needle.test(e)) ?? null;
  const s = check.ok ? check.value : null;
  const summary = useMemo(() => (s ? summarizeSlits(s) : null), [s]);
  const half = useMemo(() => (s ? defaultScreenHalfWidth(s) : 0), [s]);
  const probeM = raw.probeMm / 1000;
  const probeShown = Math.max(-half, Math.min(half, probeM));
  const series = useMemo<ChartSeries[]>(() => {
    if (!s) return [];
    const data = samplePattern(s, half, 801);
    return [
      { id: "I", label: "intensity", color: "#0b6a72", points: data.map((d) => ({ x: d.y * 1000, y: d.I })) },
      ...(s.N > 1 ? [{ id: "env", label: "single-slit envelope", color: "#b45309", dash: "7 4", points: data.map((d) => ({ x: d.y * 1000, y: d.envelope })) }] : []),
    ];
  }, [s, half]);
  const practice = mode === "practice";
  const challenge = mode === "challenge";
  const practiceInput = ws.valid;
  const scenarios = useMemo(() => (practiceInput ? interferenceScenarios(practiceInput) : []), [practiceInput]);
  const lessons = useMemo(() => (ws.valid ? interferenceLessons(ws.valid) : []), [ws.valid]);
  const probeI = s ? intensityAtScreen(s, probeM) : 0;
  const delta = s && s.N > 1 ? pathDifferenceWavelengths(s, probeM) : null;
  const disp = s && s.N > 1 ? dispersion(s, [400, 550, 700]) : [];
  const kindOf = (N: number) => (N === 1 ? "one" : N === 2 ? "two" : "grating");

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Waves & optics"
        title="Interference & diffraction"
        purpose="Send monochromatic light through one slit, two slits or a grating and see the fringes on a screen, why some orders vanish, and why more slits make sharper maxima."
        evidence="model"
        steps={[
          { label: "Choose the slits", detail: "One slit, two slits or a grating of up to 20." },
          { label: "Set colour and geometry", detail: "Wavelength, slit width and spacing, screen distance." },
          { label: "Probe the screen", detail: "Move the probe to see the path difference and the intensity." },
        ]}
        aside={<Badge tone="neutral" title="Far-field (Fraunhofer) pattern of identical slits.">far-field model</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch blurbs={{ practice: "Predict what a change does, then check it against the model.", challenge: "Reach a stated target setup; the model checks it." }} mode={mode} modes={["explore", "practice", "challenge"]} onChange={setMode} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Wavelength in nanometres, slit sizes in micrometres." title="Slits and light">
          <div className="gc-presets" role="group" aria-label="Example setups">
            {PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => update((c) => ({ ...c, slits: p.slits, probeMm: Math.min(4, 500 * p.slits.L) }))} type="button">{p.label}</button>)}
          </div>
          <Segmented<"one" | "two" | "grating"> label="Apparatus" onChange={(k) => setS({ N: k === "one" ? 1 : k === "two" ? 2 : Math.max(3, raw.slits.N) })} options={[{ id: "one", label: "One slit" }, { id: "two", label: "Two slits" }, { id: "grating", label: "Grating (N slits)" }]} value={kindOf(raw.slits.N)} />
          {raw.slits.N >= 3 ? <NumberField error={errorFor(/number of slits/)} hint={`Whole number from ${SLIT_LIMITS.minN} to ${SLIT_LIMITS.maxN}.`} label="Number of slits N" onChange={(N) => setS({ N })} value={raw.slits.N} /> : null}
          <ParamSlider format={(v) => `${fmt(v)} nm`} label="Wavelength" max={SLIT_LIMITS.maxLambda} min={SLIT_LIMITS.minLambda} onChange={(lambdaNm) => setS({ lambdaNm })} step={5} value={raw.slits.lambdaNm} />
          <div aria-hidden="true" className="ph-swatch" style={{ background: wavelengthColor(raw.slits.lambdaNm) }} title={COLOR_NOTE} />
          <NumberField error={errorFor(/Wavelength/)} hint={COLOR_NOTE} label="Wavelength" onChange={(lambdaNm) => setS({ lambdaNm })} unit="nm" value={raw.slits.lambdaNm} />
          <NumberField error={errorFor(/Slit width|narrower|slit narrower/)} label="Slit width a" onChange={(aUm) => setS({ aUm })} unit="µm" value={raw.slits.aUm} />
          {raw.slits.N > 1 ? <NumberField error={errorFor(/separation/)} label="Slit separation d" onChange={(dUm) => setS({ dUm })} unit="µm" value={raw.slits.dUm} /> : null}
          <ParamSlider format={(v) => `${fmt(v)} m`} label="Screen distance" max={5} min={SLIT_LIMITS.minL} onChange={(L) => setS({ L })} step={0.1} value={raw.slits.L} />
          <NumberField error={errorFor(/Screen distance|screen is too close|far-field/)} label="Screen distance L" onChange={(L) => setS({ L })} unit="m" value={raw.slits.L} />
          {errors ? <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
          <p className="gc-field-hint">Limits: {SLIT_LIMITS.minLambda}–{SLIT_LIMITS.maxLambda} nm, a {SLIT_LIMITS.minA}–{SLIT_LIMITS.maxA} µm, d {SLIT_LIMITS.minD}–{SLIT_LIMITS.maxD} µm (and a &lt; d), L {SLIT_LIMITS.minL}–{SLIT_LIMITS.maxL} m, and a Fresnel number D²/(λL) of at most {SLIT_LIMITS.maxFresnel}.</p>
        </Panel>

        <div className="gc-stage">
          {s && summary ? (
            <>
              <Callout tone="info" title={s.N === 1 ? `Single-slit diffraction: central maximum ${fmt(2000 * (summary.centralHalfWidth ?? 0))} mm wide` : `${s.N === 2 ? "Double slit" : `${s.N}-slit grating`}: fringes about ${fmt(1000 * (summary.fringeSpacing as number))} mm apart`}>
                <p>{s.N === 1 ? `The first minima are at a sinθ = ±λ, that is ±${fmt(1000 * (summary.centralHalfWidth ?? 0))} mm on a screen ${fmt(s.L)} m away.` : `Bright fringes at d sinθ = mλ. The small-angle spacing λL/d is ${fmt(1000 * (summary.fringeSpacing as number))} mm; the exact first-order position is ${fmt(1000 * (summary.firstOrderY ?? NaN))} mm. ${summary.missingOrders.length ? `Orders ${summary.missingOrders.slice(0, 4).join(", ")}${summary.missingOrders.length > 4 ? "…" : ""} are missing (they fall on diffraction minima).` : "No orders are missing."}`}</p>
              </Callout>
              <DiagramFrame caption="Not to scale. The two lines are the paths from the first two slits to the probe point on the screen; their difference decides bright or dark." label="Slit schematic" title="Slits, screen and probe">
                <SlitSetupDiagram probeY={probeM} slits={s} />
              </DiagramFrame>
              <DiagramFrame caption={COLOR_NOTE} label="Screen pattern" title="What the screen shows">
                <FringeStrip halfWidth={half} probeY={probeShown} slits={s} />
              </DiagramFrame>
              <DiagramFrame label="Intensity graph" legend={<Legend items={[{ label: "intensity I/I₀", color: "#0b6a72", kind: "line" }, ...(s.N > 1 ? [{ label: "single-slit envelope", color: "#b45309", kind: "dashed" as const }] : [])]} />} title="Intensity across the screen">
                <LineChart
                  current={{ x: probeShown * 1000, y: intensityAtScreen(s, probeShown) }}
                  formatX={(x) => String(Number(x.toPrecision(3)))}
                  formatY={(y) => String(Number(y.toPrecision(2)))}
                  onXChange={(x) => update((c) => ({ ...c, probeMm: Math.round(x * 100) / 100 }))}
                  series={series}
                  title="Intensity across the screen"
                  valueText={`Probe at ${fmt(probeShown * 1000)} mm: relative intensity ${fmt(intensityAtScreen(s, probeShown))}`}
                  xDomain={[-half * 1000, half * 1000]}
                  xLabel="Position on the screen (mm)"
                  xStep={(half * 1000) / 100}
                  yDomain={[0, 1.05]}
                  yLabel="I / I₀"
                />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Probe position", value: `${fmt(probeShown * 1000)} mm`, note: "drag the graph marker" },
                { label: "Intensity at the probe", value: fmt(probeI), note: "relative to the centre" },
                ...(delta !== null ? [{ label: "Path difference d sinθ", value: `${fmt(delta)} λ`, note: Math.abs(delta - Math.round(delta)) < 0.02 ? "whole number: in step" : Math.abs(Math.abs(delta % 1) - 0.5) < 0.02 ? "half-integer: out of step" : "partial" }] : []),
                ...(s.N > 1 ? [{ label: "Fringe spacing λL/d", value: formatSI(summary.fringeSpacing as number, "m"), note: "small-angle" }] : []),
                { label: "Central maximum, first minima", value: summary.centralHalfWidth === null ? "none" : `±${formatSI(summary.centralHalfWidth, "m")}`, note: "a sinθ = λ" },
                ...(s.N > 1 ? [{ label: "Fringes in the central peak", value: String(summary.fringesInCentral) }, { label: "Highest order", value: String(summary.maxOrder) }, { label: "Secondary maxima", value: String(summary.secondaryMaxima), note: "between principal maxima" }] : []),
                { label: "Fresnel number", value: fmt(summary.fresnel), note: `valid below ${SLIT_LIMITS.maxFresnel}` },
              ]} />
              {s.N > 1 ? (
                <Panel subtitle="Interference orders m = 1, 2, 3… on one side; the pattern is symmetric." title="Orders">
                  <div className="gc-table-scroll">
                    <table className="gc-table ph-table" data-testid="orders">
                      <thead><tr><th scope="col">Order m</th><th scope="col">Angle</th><th scope="col">Position</th><th scope="col">Relative intensity</th><th scope="col">Note</th></tr></thead>
                      <tbody>{summary.orders.slice(0, 8).map((o) => <tr key={o.m}><th scope="row">{o.m}</th><td>{fmt(o.thetaDeg)}°</td><td>{formatSI(o.y, "m")}</td><td>{fmt(o.intensity)}</td><td>{o.missing ? "missing: on a diffraction minimum" : ""}</td></tr>)}</tbody>
                    </table>
                  </div>
                  {summary.orders.length > 8 ? <p className="ph-note">{summary.orders.length - 8} more orders exist (up to m = {summary.maxOrder}); the first {Math.min(8, summary.orders.length)} are listed.</p> : null}
                </Panel>
              ) : null}
              {s.N > 1 ? (
                <Panel subtitle="The same slits give each colour its own angle: a grating spreads white light into a spectrum." title="First-order angle for different colours">
                  <div className="gc-table-scroll">
                    <table className="gc-table ph-table" data-testid="dispersion">
                      <thead><tr><th scope="col">Wavelength</th><th scope="col">First-order angle</th><th scope="col">Position on the screen</th></tr></thead>
                      <tbody>{disp.map((d) => <tr key={d.lambdaNm}><th scope="row"><span aria-hidden="true" className="ph-dot" style={{ background: wavelengthColor(d.lambdaNm) }} /> {d.lambdaNm} nm</th><td>{d.thetaDeg === null ? "no first order" : `${fmt(d.thetaDeg)}°`}</td><td>{d.y === null ? "—" : formatSI(d.y, "m")}</td></tr>)}</tbody>
                    </table>
                  </div>
                </Panel>
              ) : null}
            </>
          ) : (
            <Callout tone="info" title="Enter valid values to see the pattern"><p>{errors?.[0] ?? "The diagram and graph appear as soon as every field is valid."}</p></Callout>
          )}
          {s ? (
            practice ? (
              scenarios.length && practiceInput ? <GcPredictPanel input={practiceInput} onApply={(next) => update(() => next)} scenarios={scenarios} /> : <Callout tone="info" title="Nothing to predict here"><p>Practice questions need valid settings.</p></Callout>
            ) : challenge ? (
              <ChallengePanel challenges={INTERFERENCE_CHALLENGES} inputs={raw} />
            ) : (
              <Panel subtitle="Each answer quotes the numbers for the setup you have chosen." title="Why does it behave this way?">
                {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
              </Panel>
            )
          ) : null}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{INTERFERENCE_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      <RelatedConcepts subject="physics" toolId="phInterference" />
    </div>
  );
}
