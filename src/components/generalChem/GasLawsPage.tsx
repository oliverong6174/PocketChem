import { useMemo, useState } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import "../../styles/chem22.css";
import { LineChart, type ChartMarker, type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { ParamSlider } from "../physics/sim";
import { GcPredictPanel, NumberField, Paragraphs } from "./shared";
import { QuestionPanel } from "./QuestionPanel";
import { GasContainerDiagram, MixtureBar } from "./GasDiagrams";
import { useGcWorkspace } from "./useGcWorkspace";
import { prettyFormula } from "../../utils/generalChem/formula";
import { formatSig } from "../../utils/generalChem/format";
import {
  GAS_PROCESSES, GAS_SPECIES, MIXTURE_LIMITS, PRESSURE_UNITS, R_GAS, TEMPERATURE_UNITS, VOLUME_UNITS, calculateIdeal, mbDensity, mbFractionAbove, molarVolumeLitres, processCurve, processInfo, runProcess,
  solveKinetic, solveMixture, temperatureFromK, pressureFromPa, volumeFromM3, type CalcInput, type GasUnknown, type PressureUnit, type TemperatureUnit, type VolumeUnit,
} from "../../utils/generalChem/gas";
import { GAS_ASSUMPTIONS, GAS_PRACTICE, GAS_SCENARIOS, gasLessons, summarizeGas } from "../../utils/generalChem/chem22Learning";
import {
  DEFAULT_GAS_INPUTS, GASLAWS_ENGINE_VERSION, GAS_VIEWS, GAS_VIEW_LABEL, describeGasAnalysis, validateGasInputs, validateGcResults22, type GasInputs, type GasView,
} from "../../utils/persistence/gcTools22";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };
const g = (v: number, sig = 4) => formatSig(v, sig);
const CONTROL_UNIT: Record<"V" | "T" | "n", string> = { V: "L", T: "°C", n: "mol" };
const CONTROL_NAME: Record<"V" | "T" | "n", string> = { V: "volume", T: "temperature", n: "amount of gas" };
const SCENARIO_IDS: Record<GasView, string[]> = {
  container: ["compress-more", "expand", "heat-rigid", "double-celsius", "heat-free", "add-gas-p", "add-gas-v"],
  calculator: [],
  mixture: ["inert-partial"],
  kinetic: ["light-gas-speed", "same-ke"],
};
const PRACTICE_ORDER = GAS_PRACTICE;

function extent(values: number[], pad = 0.08): [number, number] {
  const lo = Math.min(...values); const hi = Math.max(...values);
  // a variable that does not change in this experiment still gets a readable axis (about ±20 % of its value)
  const span = hi - lo > 1e-9 * Math.max(1, Math.abs(hi)) ? hi - lo : Math.abs(hi) * 0.4 || 1;
  return [lo - span * pad, hi + span * pad];
}

export default function GasLawsPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<GasInputs>({
    page: "gaslaws",
    engineVersion: GASLAWS_ENGINE_VERSION,
    defaults: DEFAULT_GAS_INPUTS,
    validateInputs: validateGasInputs,
    validateResults: validateGcResults22,
    summarize: summarizeGas,
    describe: describeGasAnalysis,
    fallbackName: "Gas laws analysis",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  const mode = raw.learn.mode;
  const setLearn = (patch: Partial<GasInputs["learn"]>) => update((c) => ({ ...c, learn: { ...c.learn, ...patch } }));
  const [playing, setPlaying] = useState(true);
  const [showing, setShowing] = useState<"initial" | "final">("final");
  const [vProbe, setVProbe] = useState<number | null>(null);

  const cont = raw.container;
  const run = useMemo(() => runProcess(cont), [cont]);
  const info = processInfo(cont.process);
  const lessons = useMemo(() => (ws.valid ? gasLessons(ws.valid) : []), [ws.valid]);
  const scenarios = useMemo(() => GAS_SCENARIOS.filter((s) => SCENARIO_IDS[raw.view].includes(s.id)), [raw.view]);
  const setC = (patch: Partial<GasInputs["container"]>) => update((c) => ({ ...c, container: { ...c.container, ...patch } }));

  const changeProcess = (process: GasInputs["container"]["process"]) => update((c) => {
    const i = processInfo(process);
    const target = i.controlled === "V" ? c.container.VL / 2 : i.controlled === "T" ? c.container.TC + 75 : c.container.n * 2;
    return { ...c, container: { ...c.container, process, target } };
  });

  // ---- curves for the three synchronized graphs ----
  const curves = useMemo(() => {
    if (!run.ok) return null;
    const ctrl = info.controlled;
    const c0 = ctrl === "V" ? cont.VL : ctrl === "T" ? cont.TC : cont.n;
    const c1 = cont.target;
    const lo = Math.min(c0, c1); const hi = Math.max(c0, c1);
    const span = hi - lo || Math.abs(c0) * 0.2 || 1;
    const minValid = ctrl === "T" ? -272 : 1e-6;
    const from = Math.max(minValid, lo - span * 0.5); const to = hi + span * 0.5;
    const path = processCurve(cont, lo, hi, 61);
    const ext = processCurve(cont, from, to, 121);
    return { path, ext, s1: run.s1, s2: run.s2 };
  }, [cont, run, info.controlled]);

  const charts = useMemo(() => {
    if (!curves) return [];
    const mk = (id: string, title: string, xl: string, yl: string, fx: (s: { P: number; V: number; T: number; n: number }) => number, fy: (s: { P: number; V: number; T: number; n: number }) => number, note: string) => {
      const series: ChartSeries[] = [
        { id: "ext", label: "the same law, extended", color: "#94a3b8", dash: "6 4", points: curves.ext.map((s) => ({ x: fx(s), y: fy(s) })) },
        { id: "path", label: "this experiment", color: "#0b6a72", points: curves.path.map((s) => ({ x: fx(s), y: fy(s) })) },
      ];
      const markers: ChartMarker[] = [
        { id: "s", x: fx(curves.s1), y: fy(curves.s1), label: "start", kind: "info" },
        { id: "e", x: fx(curves.s2), y: fy(curves.s2), label: "end", kind: "equivalence" },
      ];
      const xs = curves.ext.map(fx); const ys = curves.ext.map(fy);
      return { id, title, xl, yl, series, markers, xDomain: extent(xs), yDomain: extent(ys), note };
    };
    return [
      mk("pv", "Pressure against volume", "Volume V (L)", "Pressure P (kPa)", (s) => s.V * 1000, (s) => s.P / 1000, "P–V"),
      mk("vt", "Volume against temperature", "Temperature T (K)", "Volume V (L)", (s) => s.T, (s) => s.V * 1000, "V–T"),
      mk("pt", "Pressure against temperature", "Temperature T (K)", "Pressure P (kPa)", (s) => s.T, (s) => s.P / 1000, "P–T"),
    ];
  }, [curves]);

  // ---- calculator ----
  const calc = raw.calc;
  const setCalc = (patch: Partial<CalcInput>) => update((c) => ({ ...c, calc: { ...c.calc, ...patch } }));
  const calcRes = useMemo(() => calculateIdeal(calc), [calc]);
  const switchUnknown = (unknown: GasUnknown) => {
    const old = calc.unknown;
    const shown = unknownDisplay(old);
    update((c) => ({ ...c, calc: { ...c.calc, unknown, ...(Number.isFinite(shown) ? (old === "n" ? { n: shown } : { [old]: { ...c.calc[old], v: shown } }) : {}) } }));
  };
  const unknownDisplay = (u: GasUnknown): number => {
    if (!calcRes.ok) return NaN;
    if (u === "P") return pressureFromPa(calcRes.state.P, calc.P.u);
    if (u === "V") return volumeFromM3(calcRes.state.V, calc.V.u);
    if (u === "T") return temperatureFromK(calcRes.state.T, calc.T.u);
    return calcRes.state.n;
  };

  // ---- mixture ----
  const mixRes = useMemo(() => solveMixture(raw.mixture), [raw.mixture]);
  const setMixComp = (k: number, patch: Partial<{ formula: string; mol: number }>) => update((c) => ({ ...c, mixture: { ...c.mixture, components: c.mixture.components.map((x, j) => (j === k ? { ...x, ...patch } : x)) } }));

  // ---- kinetic ----
  const kin = useMemo(() => solveKinetic(raw.kinetic), [raw.kinetic]);
  const kinChart = useMemo(() => {
    if (!kin.ok) return null;
    const vmax = Math.max(...kin.rows.map((r) => r.vmp)) * 3.6;
    const pts = (r: (typeof kin.rows)[number]) => Array.from({ length: 161 }, (_, i) => { const v = (vmax * i) / 160; return { x: v, y: mbDensity(v, r.T, r.M) * 100 }; });
    const series: ChartSeries[] = [
      { id: "a", label: `${raw.kinetic.a} at ${g(kin.rows[0].T, 4)} K`, color: "#0b6a72", points: pts(kin.rows[0]) },
      { id: "b", label: `${raw.kinetic.b} at ${g(kin.rows[1].T, 4)} K`, color: "#b45309", dash: "7 4", points: pts(kin.rows[1]) },
    ];
    const ymax = Math.max(...series.flatMap((s) => s.points.map((p) => p.y)));
    return { series, vmax, ymax };
  }, [kin, raw.kinetic.a, raw.kinetic.b]);
  const probe = kin.ok && kinChart ? Math.min(kinChart.vmax, vProbe ?? kin.rows[0].vrms) : 0;

  const speciesOptions = GAS_SPECIES.map((s) => <option key={s.formula} value={s.formula}>{prettyFormula(s.formula)} ({s.name})</option>);
  const errors = (view: GasView) => (view === "container" && !run.ok ? run.errors : view === "calculator" && !calcRes.ok ? calcRes.errors : view === "mixture" && !mixRes.ok ? mixRes.errors : view === "kinetic" && !kin.ok ? kin.errors : null);
  const err = errors(raw.view);
  const unitSel = <T extends string>(value: T, options: Record<T, { label: string }>, onChange: (v: T) => void, label: string) => (
    <select aria-label={label} onChange={(e) => onChange(e.target.value as T)} value={value}>{(Object.keys(options) as T[]).map((k) => <option key={k} value={k}>{options[k].label}</option>)}</select>
  );

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Analyze"
        title="Gas laws"
        purpose="Change a gas's pressure, volume, temperature or amount one controlled experiment at a time, mix gases, and see how temperature sets molecular speeds."
        evidence="model"
        steps={[
          { label: "Pick an experiment", detail: "What is held fixed and what is changed." },
          { label: "Change the controlled variable", detail: "The dependent variable follows from PV = nRT." },
          { label: "Read the graphs", detail: "Each graph is the constrained process, with start and end marked." },
        ]}
        aside={<Badge tone="neutral" title="Ideal-gas teaching model: no attractions, no condensation.">ideal gas</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch
          blurbs={{ explore: "Change the container and inspect the equations.", practice: "Solve gas-law and partial-pressure problems; answer, then see the working.", challenge: "Predict how a change affects the system under its constraints." }}
          mode={mode}
          modes={["explore", "practice", "challenge"]}
          onChange={(m) => setLearn({ mode: m })}
        />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Absolute temperature is used in every calculation." title="Experiment">
          <Segmented<GasView> label="What to work on" onChange={(view) => update((c) => ({ ...c, view }))} options={GAS_VIEWS.map((v) => ({ id: v, label: GAS_VIEW_LABEL[v] }))} value={raw.view} />

          {raw.view === "container" ? (
            <>
              <div className="chem-select">
                <label htmlFor="gas-process">Experiment (what is held fixed)</label>
                <select id="gas-process" onChange={(e) => changeProcess(e.target.value as GasInputs["container"]["process"])} value={cont.process}>
                  {GAS_PROCESSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <Callout tone="info" title={info.law}>
                <p data-testid="constraints">Held fixed: <strong>{info.held.map((h) => ({ P: "pressure", V: "volume", T: "temperature", n: "amount" }[h] ?? h)).join(" and ")}</strong>. You change: <strong>{CONTROL_NAME[info.controlled]}</strong>. Follows from PV = nRT: <strong>{info.dependent === "P" ? "pressure" : "volume"}</strong>.</p>
              </Callout>
              <NumberField label="Starting volume" onChange={(VL) => setC({ VL })} unit="L" value={cont.VL} />
              <NumberField error={run.ok ? null : run.errors.find((e) => /temperature/i.test(e)) ?? null} label="Starting temperature" onChange={(TC) => setC({ TC })} unit="°C" value={cont.TC} />
              <NumberField label="Amount of gas" onChange={(n) => setC({ n })} unit="mol" value={cont.n} />
              <NumberField error={run.ok ? null : run.errors.find((e) => /final/i.test(e)) ?? null} label={`Final ${CONTROL_NAME[info.controlled]}`} onChange={(target) => setC({ target })} unit={CONTROL_UNIT[info.controlled]} value={cont.target} />
              <ParamSlider
                format={(v) => `${g(v, 4)} ${CONTROL_UNIT[info.controlled]}`}
                label={`Adjust final ${CONTROL_NAME[info.controlled]}`}
                max={info.controlled === "V" ? cont.VL * 3 : info.controlled === "T" ? 600 : cont.n * 4}
                min={info.controlled === "V" ? cont.VL * 0.2 : info.controlled === "T" ? -250 : cont.n * 0.1}
                onChange={(target) => setC({ target: Math.round(target * 100) / 100 })}
                step={info.controlled === "T" ? 1 : info.controlled === "V" ? cont.VL / 100 : cont.n / 100}
                value={Number.isFinite(cont.target) ? cont.target : 0}
              />
            </>
          ) : null}

          {raw.view === "calculator" ? (
            <>
              <Segmented<GasUnknown> label="Solve for" onChange={switchUnknown} options={[{ id: "P", label: "P" }, { id: "V", label: "V" }, { id: "n", label: "n" }, { id: "T", label: "T" }]} value={calc.unknown} />
              <div className="chem-unit-row">
                <NumberField disabled={calc.unknown === "P"} error={calcRes.ok ? null : calcRes.errors.find((e) => /^Pressure/.test(e)) ?? null} label="Pressure P" onChange={(v) => setCalc({ P: { ...calc.P, v } })} value={calc.unknown === "P" ? unknownDisplay("P") : calc.P.v} />
                {unitSel<PressureUnit>(calc.P.u, PRESSURE_UNITS, (u) => setCalc({ P: { v: calc.unknown === "P" ? 0 : calc.P.v, u } }), "Pressure unit")}
              </div>
              <div className="chem-unit-row">
                <NumberField disabled={calc.unknown === "V"} error={calcRes.ok ? null : calcRes.errors.find((e) => /^Volume/.test(e)) ?? null} label="Volume V" onChange={(v) => setCalc({ V: { ...calc.V, v } })} value={calc.unknown === "V" ? unknownDisplay("V") : calc.V.v} />
                {unitSel<VolumeUnit>(calc.V.u, VOLUME_UNITS, (u) => setCalc({ V: { v: calc.unknown === "V" ? 0 : calc.V.v, u } }), "Volume unit")}
              </div>
              <NumberField disabled={calc.unknown === "n"} error={calcRes.ok ? null : calcRes.errors.find((e) => /^Amount/.test(e)) ?? null} label="Amount n" onChange={(n) => setCalc({ n })} unit="mol" value={calc.unknown === "n" ? unknownDisplay("n") : calc.n} />
              <div className="chem-unit-row">
                <NumberField disabled={calc.unknown === "T"} error={calcRes.ok ? null : calcRes.errors.find((e) => /^Temperature/.test(e)) ?? null} label="Temperature T" onChange={(v) => setCalc({ T: { ...calc.T, v } })} value={calc.unknown === "T" ? unknownDisplay("T") : calc.T.v} />
                {unitSel<TemperatureUnit>(calc.T.u, TEMPERATURE_UNITS, (u) => setCalc({ T: { v: calc.unknown === "T" ? 0 : calc.T.v, u } }), "Temperature unit")}
              </div>
            </>
          ) : null}

          {raw.view === "mixture" ? (
            <>
              {raw.mixture.components.map((comp, k) => (
                <div className="chem-mix-row" key={k}>
                  <div className="chem-select">
                    <label htmlFor={`mix-gas-${k}`}>Gas {k + 1}</label>
                    <select id={`mix-gas-${k}`} onChange={(e) => setMixComp(k, { formula: e.target.value })} value={comp.formula}>{speciesOptions}</select>
                  </div>
                  <NumberField label="Amount" onChange={(mol) => setMixComp(k, { mol })} unit="mol" value={comp.mol} />
                </div>
              ))}
              <div className="gc-toolbar-actions">
                <button className="secondary-button" disabled={raw.mixture.components.length >= MIXTURE_LIMITS.maxComponents} onClick={() => update((c) => { const used = new Set(c.mixture.components.map((x) => x.formula)); const next = GAS_SPECIES.find((s) => !used.has(s.formula)); return next ? { ...c, mixture: { ...c.mixture, components: [...c.mixture.components, { formula: next.formula, mol: 0.1 }] } } : c; })} type="button">Add a gas</button>
                <button className="ghost-button" disabled={raw.mixture.components.length <= MIXTURE_LIMITS.minComponents} onClick={() => update((c) => ({ ...c, mixture: { ...c.mixture, components: c.mixture.components.slice(0, -1) } }))} type="button">Remove last</button>
              </div>
              <NumberField label="Container volume" onChange={(VL) => update((c) => ({ ...c, mixture: { ...c.mixture, VL } }))} unit="L" value={raw.mixture.VL} />
              <NumberField label="Temperature" onChange={(TC) => update((c) => ({ ...c, mixture: { ...c.mixture, TC } }))} unit="°C" value={raw.mixture.TC} />
            </>
          ) : null}

          {raw.view === "kinetic" ? (
            <>
              {(["a", "b"] as const).map((w) => (
                <div className="chem-mix-row" key={w}>
                  <div className="chem-select">
                    <label htmlFor={`kin-${w}`}>Gas {w.toUpperCase()}</label>
                    <select id={`kin-${w}`} onChange={(e) => update((c) => ({ ...c, kinetic: { ...c.kinetic, [w]: e.target.value } }))} value={raw.kinetic[w]}>{speciesOptions}</select>
                  </div>
                  <NumberField label={`Temperature of ${w.toUpperCase()}`} onChange={(v) => update((c) => ({ ...c, kinetic: { ...c.kinetic, [w === "a" ? "TaC" : "TbC"]: v } }))} unit="°C" value={w === "a" ? raw.kinetic.TaC : raw.kinetic.TbC} />
                </div>
              ))}
              <button className="ghost-button" onClick={() => update((c) => ({ ...c, kinetic: { ...c.kinetic, TbC: c.kinetic.TaC } }))} type="button">Same temperature for both</button>
            </>
          ) : null}
          {err ? <Callout tone="danger" title="These values cannot be used"><ul>{err.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
        </Panel>

        <div className="gc-stage">
          {raw.view === "container" && run.ok && curves ? (
            <>
              <DiagramFrame
                caption="Volume sets the width of the gas region, amount the number of dots, temperature their speed and colour, pressure the gauge."
                label="Gas container"
                title="The container"
                toolbar={(
                  <div className="gc-toolbar-actions">
                    <Segmented<"initial" | "final"> label="State shown" onChange={setShowing} options={[{ id: "initial", label: "Start" }, { id: "final", label: "End" }]} value={showing} />
                    <button className="secondary-button" onClick={() => setPlaying((p) => !p)} type="button">{playing ? "Pause particles" : "Animate particles"}</button>
                  </div>
                )}
              >
                <GasContainerDiagram caption={showing === "final" ? "End state" : "Start state"} initial={run.s1} maxP={Math.max(run.s1.P, run.s2.P) * 1.15} maxV={Math.max(run.s1.V, run.s2.V) * 1.05} playing={playing} state={showing === "final" ? run.s2 : run.s1} />
              </DiagramFrame>
              <Panel subtitle={info.law} title="Start and end states">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="states">
                    <thead><tr><th scope="col">State</th><th scope="col">P (kPa)</th><th scope="col">V (L)</th><th scope="col">T (K)</th><th scope="col">T (°C)</th><th scope="col">n (mol)</th><th scope="col">PV/nT (J/(mol·K))</th></tr></thead>
                    <tbody>
                      {([["Start", run.s1], ["End", run.s2]] as const).map(([name, s]) => <tr key={name}><th scope="row">{name}</th><td>{g(s.P / 1000)}</td><td>{g(s.V * 1000)}</td><td>{g(s.T)}</td><td>{g(s.T - 273.15)}</td><td>{g(s.n)}</td><td>{g((s.P * s.V) / (s.n * s.T), 7)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
                <p className="chem-law-note" data-testid="law-note">{summarizeGas(raw)?.headline[2]}</p>
                <p className="gc-field-hint">The last column is R = {R_GAS} J/(mol·K) at both ends, as PV = nRT requires.</p>
              </Panel>
              <DiagramFrame caption={`Each graph is the constrained process "${info.label.toLowerCase()}"; other paths between the same two states would look different. The grey dashed line extends the same law.`} label="Graphs" legend={<Legend items={[{ label: "this experiment", color: "#0b6a72", kind: "line" }, { label: "same law, extended", color: "#94a3b8", kind: "dashed" }]} />} title="Synchronized graphs">
                <div className="chem-charts">
                  {charts.map((c) => (
                    <LineChart key={c.id} formatX={(x) => g(x, 3)} formatY={(y) => g(y, 3)} markers={c.markers} series={c.series} title={c.title} valueText={`${c.title}: ${c.markers[0].label} to ${c.markers[1].label}`} xDomain={c.xDomain} xLabel={c.xl} yDomain={c.yDomain} yLabel={c.yl} />
                  ))}
                </div>
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Pressure", value: `${g(run.s1.P / 1000)} → ${g(run.s2.P / 1000)} kPa`, note: info.dependent === "P" ? "dependent variable" : "held fixed" },
                { label: "Volume", value: `${g(run.s1.V * 1000)} → ${g(run.s2.V * 1000)} L`, note: info.controlled === "V" ? "you change this" : info.dependent === "V" ? "dependent variable" : "held fixed" },
                { label: "Temperature", value: `${g(run.s1.T)} → ${g(run.s2.T)} K`, note: info.controlled === "T" ? "you change this" : "held fixed" },
                { label: "Amount", value: `${g(run.s1.n)} → ${g(run.s2.n)} mol`, note: info.controlled === "n" ? "you change this" : "held fixed" },
              ]} />
            </>
          ) : null}

          {raw.view === "calculator" && calcRes.ok ? (
            <>
              <Callout tone="info" title={`${{ P: "Pressure", V: "Volume", n: "Amount", T: "Temperature" }[calc.unknown]} = ${g(unknownDisplay(calc.unknown))} ${calc.unknown === "P" ? PRESSURE_UNITS[calc.P.u].label : calc.unknown === "V" ? VOLUME_UNITS[calc.V.u].label : calc.unknown === "T" ? TEMPERATURE_UNITS[calc.T.u].label : "mol"}`}>
                <p data-testid="calc-result">The tool first converts to SI: P = {g(calcRes.state.P)} Pa, V = {g(calcRes.state.V, 5)} m³, n = {g(calcRes.state.n)} mol, T = {g(calcRes.state.T)} K, then uses PV = nRT with R = {R_GAS} J/(mol·K).</p>
              </Callout>
              <KeyFigures items={[
                { label: "Pressure", value: `${g(calcRes.state.P / 1000)} kPa`, note: `${g(calcRes.state.P / 101325)} atm` },
                { label: "Volume", value: `${g(calcRes.state.V * 1000)} L` },
                { label: "Temperature", value: `${g(calcRes.state.T)} K`, note: `${g(calcRes.state.T - 273.15)} °C` },
                { label: "Amount", value: `${g(calcRes.state.n)} mol` },
                { label: "Molar volume here", value: `${g(molarVolumeLitres(calcRes.state.P, calcRes.state.T))} L/mol`, note: "RT/P at this P and T, not a universal constant" },
              ]} />
            </>
          ) : null}

          {raw.view === "mixture" && mixRes.ok ? (
            <>
              <DiagramFrame caption="Each gas contributes n_i·R·T/V, which equals its mole fraction times the total pressure." label="Partial pressures" title="Contributions to the total pressure">
                <MixtureBar rows={mixRes.rows} totalPa={mixRes.totalPa} />
              </DiagramFrame>
              <Panel subtitle="Ideal mixture: the gases do not react or interact." title="Composition">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="mixture">
                    <thead><tr><th scope="col">Gas</th><th scope="col">Amount (mol)</th><th scope="col">Mole fraction</th><th scope="col">Partial pressure (kPa)</th><th scope="col">Mass (g)</th></tr></thead>
                    <tbody>{mixRes.rows.map((r) => <tr key={r.formula}><th scope="row">{prettyFormula(r.formula)}</th><td>{g(r.mol)}</td><td>{g(r.x)}</td><td>{g(r.partialPa / 1000)}</td><td>{g(r.massG)}</td></tr>)}</tbody>
                  </table>
                </div>
              </Panel>
              <KeyFigures items={[
                { label: "Total pressure", value: `${g(mixRes.totalPa / 1000)} kPa`, note: `${g(mixRes.totalPa / 101325)} atm` },
                { label: "Total amount", value: `${g(mixRes.totalMol)} mol` },
                { label: "Average molar mass", value: `${g(mixRes.avgMolarMass)} g/mol` },
                { label: "Density", value: `${g(mixRes.densityGperL)} g/L`, note: "total mass ÷ volume" },
              ]} />
            </>
          ) : null}

          {raw.view === "kinetic" && kin.ok && kinChart ? (
            <>
              <DiagramFrame caption="The ideal Maxwell–Boltzmann speed distribution for a classical gas, from the model: not measured data. Each curve has the same total area (all molecules). Drag the marker or use the arrow keys." label="Speed distribution" legend={<Legend items={[{ label: `${raw.kinetic.a}`, color: "#0b6a72", kind: "line" }, { label: `${raw.kinetic.b}`, color: "#b45309", kind: "dashed" }]} />} title="Molecular speed distribution">
                <LineChart
                  current={{ x: probe, y: mbDensity(probe, kin.rows[0].T, kin.rows[0].M) * 100 }}
                  formatX={(x) => g(x, 4)}
                  formatY={(y) => g(y, 2)}
                  markers={kin.rows.map((r, k) => ({ id: `rms${k}`, x: r.vrms, y: mbDensity(r.vrms, r.T, r.M) * 100, label: `v_rms ${k === 0 ? "A" : "B"}`, kind: (k === 0 ? "info" : "half") as ChartMarker["kind"] }))}
                  onXChange={(x) => setVProbe(x)}
                  series={kinChart.series}
                  title="Maxwell-Boltzmann speed distribution"
                  valueText={`Probe at ${g(probe)} m/s`}
                  xDomain={[0, kinChart.vmax]}
                  xLabel="Molecular speed v (m/s)"
                  xStep={kinChart.vmax / 100}
                  yDomain={[0, kinChart.ymax * 1.1]}
                  yLabel="Fraction of molecules per 100 m/s"
                />
              </DiagramFrame>
              <Panel subtitle={`Speed marker at ${g(probe)} m/s.`} title="Speeds and energies">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="speeds">
                    <thead><tr><th scope="col">Gas</th><th scope="col">T (K)</th><th scope="col">M (g/mol)</th><th scope="col">Most probable (m/s)</th><th scope="col">Mean (m/s)</th><th scope="col">rms (m/s)</th><th scope="col">Mean KE (kJ/mol)</th><th scope="col">Faster than marker</th></tr></thead>
                    <tbody>{kin.rows.map((r, k) => <tr key={k}><th scope="row">{k === 0 ? "A" : "B"}: {prettyFormula(r.formula)}</th><td>{g(r.T)}</td><td>{g(r.M)}</td><td>{g(r.vmp)}</td><td>{g(r.vmean)}</td><td>{g(r.vrms)}</td><td>{g(r.keKJperMol)}</td><td>{g(mbFractionAbove(probe, r.T, r.M) * 100, 3)} %</td></tr>)}</tbody>
                  </table>
                </div>
              </Panel>
              <Callout tone="info" title={Math.abs(kin.rows[0].T - kin.rows[1].T) < 1e-9 ? "Same temperature: same mean kinetic energy, different speeds" : "Different temperatures"}>
                <p>{Math.abs(kin.rows[0].T - kin.rows[1].T) < 1e-9 ? `Both gases have a mean translational kinetic energy of ${g(kin.rows[0].keKJperMol)} kJ/mol (3/2 RT), but A's rms speed is ${g(kin.rows[0].vrms)} m/s and B's is ${g(kin.rows[1].vrms)} m/s because their masses differ (E = ½mv²).` : `Mean kinetic energy per mole is ${g(kin.rows[0].keKJperMol)} kJ/mol for A and ${g(kin.rows[1].keKJperMol)} kJ/mol for B: it depends only on temperature.`}</p>
              </Callout>
            </>
          ) : null}

          {err ? null : null}

          {mode === "practice" ? (
            <QuestionPanel current={raw} index={raw.learn.practice} onIndex={(practice) => setLearn({ practice })} onLoad={(next) => update(() => next)} questions={PRACTICE_ORDER} subtitle="Work it out, type your answer, then check. The answer comes from the same model as the tool." title="Practice" />
          ) : mode === "challenge" ? (
            ws.valid && scenarios.length ? (
              <>
                {raw.view === "container" ? <p className="gc-field-hint">Each challenge applies to its own experiment: choose that experiment in the Experiment menu first, then predict.</p> : null}
                <GcPredictPanel input={ws.valid} onApply={(next) => update(() => next)} scenarios={scenarios} />
              </>
            ) : <Callout tone="info" title={raw.view === "calculator" ? "Challenges are in the container, mixture and speed views" : "Nothing to predict here"}><p>{raw.view === "calculator" ? "Switch to “Gas container”, “Gas mixtures” or “Molecular speeds” to predict how a change affects the gas." : "Challenges need valid settings."}</p></Callout>
          ) : lessons.length ? (
            <Panel subtitle="Each answer quotes the numbers for your current setup." title="Why does it behave this way?">
              {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
            </Panel>
          ) : null}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{GAS_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      <RelatedConcepts subject="general" toolId="gcGas" />
    </div>
  );
}
