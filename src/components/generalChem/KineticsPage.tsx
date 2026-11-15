import { useMemo, useState } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import "../../styles/generalChem.css";
import { LineChart, type ChartMarker, type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch, type LearningMode } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, Explanation, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { formatSig } from "../../utils/generalChem/format";
import {
  analyzeArrhenius, concentrationAt, fitRateLaws, halfLife, KIN_LIMITS, kUnits, linearLabel, linearSlope, linearUnit, linearized, modelCurve,
  ORDER_NAME, parsePairs, plotSpan, R_GAS, rateAt, successiveHalfLives, TIME_UNITS, timeToFraction, validateArrhenius, validateRateModel,
  type ArrheniusInput, type Order, type OrderFit, type RateModel, type TimeUnit,
} from "../../utils/generalChem/kinetics";
import { conceptLessons, HALF_LIFE_RULE, kineticsScenarios } from "../../utils/generalChem/kineticsLearning";
import { summarizeKinetics } from "../../utils/generalChem/toolSummary";
import {
  DEFAULT_KINETICS_INPUTS, describeKineticsAnalysis, KINETICS_ENGINE_VERSION, validateKineticsInputs, validateKineticsResults,
  type KineticsInputs, type KineticsView,
} from "../../utils/persistence/generalChemTools";
import { GcPredictPanel, NumberField, Paragraphs, TextAreaField } from "./shared";
import { useGcWorkspace } from "./useGcWorkspace";

type Props = {
  openRequest?: { id: string; recordId: string } | null;
  onOpenHandled?: (requestId: string) => void;
};

const f = (v: number, sig = 3) => formatSig(v, sig);
const ORDER_OPTIONS: Array<{ id: "0" | "1" | "2"; label: string }> = [{ id: "0", label: "Zero order" }, { id: "1", label: "First order" }, { id: "2", label: "Second order" }];
const SAMPLES: Array<{ label: string; text: string }> = [
  { label: "First-order data", text: "0, 1\n10, 0.607\n20, 0.368\n30, 0.223\n45, 0.105\n60, 0.0498\n90, 0.0111" },
  { label: "Second-order data", text: "0, 0.5\n2, 0.278\n5, 0.167\n10, 0.1\n20, 0.0556\n40, 0.0294\n80, 0.0152" },
  { label: "Zero-order data", text: "0, 0.5\n20, 0.42\n40, 0.34\n60, 0.26\n80, 0.18\n100, 0.1" },
  { label: "Too little decay", text: "0, 1\n20, 0.980\n40, 0.961\n60, 0.942\n80, 0.923\n100, 0.905" },
];
const MODEL_PRESETS: Array<{ label: string; model: RateModel }> = [
  { label: "Zero-order example", model: { order: 0, k: 0.01, c0: 0.5 } },
  { label: "First-order example", model: { order: 1, k: 0.05, c0: 1 } },
  { label: "Second-order example", model: { order: 2, k: 0.5, c0: 0.2 } },
];
const ORDER_COLORS: Record<Order, string> = { 0: "#b45309", 1: "#0b6a72", 2: "#6d28d9" };
const ORDER_DASH: Record<Order, string | undefined> = { 0: "7 4", 1: undefined, 2: "2 4" };

export default function KineticsPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<KineticsInputs>({
    page: "kinetics",
    engineVersion: KINETICS_ENGINE_VERSION,
    defaults: DEFAULT_KINETICS_INPUTS,
    validateInputs: validateKineticsInputs,
    validateResults: validateKineticsResults,
    summarize: summarizeKinetics,
    describe: describeKineticsAnalysis,
    fallbackName: "Kinetics analysis",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  const [mode, setMode] = useState<LearningMode>("explore");
  const [linOrder, setLinOrder] = useState<Order>(1);
  const u = raw.timeUnit;

  const setView = (view: KineticsView) => update((c) => ({ ...c, view }));
  const setModel = (patch: Partial<RateModel>) => update((c) => ({ ...c, model: { ...c.model, ...patch } }));
  const setArr = (patch: Partial<ArrheniusInput>) => update((c) => ({ ...c, arrhenius: { ...c.arrhenius, ...patch } }));

  const mv = useMemo(() => validateRateModel(raw.model), [raw.model]);
  const model = mv.ok ? mv.value : null;
  const span = model ? plotSpan(model) : 1;
  const tNow = Math.min(Math.max(Number.isFinite(raw.tNow) ? raw.tNow : 0, 0), span);
  const curve = useMemo(() => (model ? modelCurve(model) : []), [model]);

  const fit = useMemo(() => {
    const parsed = parsePairs(raw.fitText, "concentration–time");
    if (!parsed.ok) return { kind: "error", error: parsed.error } as const;
    const data = parsed.rows.map(([t, c]) => ({ t, c }));
    const result = fitRateLaws(data);
    return result.ok ? ({ kind: "ok", data, result } as const) : ({ kind: "error", error: result.error } as const);
  }, [raw.fitText]);

  const av = useMemo(() => validateArrhenius(raw.arrhenius), [raw.arrhenius]);
  const arr = useMemo(() => (av.ok ? analyzeArrhenius(av.value) : null), [av]);
  const arrErrors = av.ok ? (arr && !arr.ok ? [arr.error] : null) : av.errors;

  const errorFor = (errors: string[] | null | undefined, needle: RegExp) => errors?.find((e) => needle.test(e)) ?? null;
  const mErrors = mv.ok ? null : mv.errors;
  const practice = mode === "practice";
  const scenarios = useMemo(() => (ws.valid ? kineticsScenarios(ws.valid) : []), [ws.valid]);

  const lessonsAndPractice = ws.valid && (practice ? (
    <GcPredictPanel input={ws.valid} onApply={(next) => update(() => next)} scenarios={scenarios} />
  ) : (
    <Panel subtitle="Each answer uses the numbers for the system you have set up." title="Why does it behave this way?">
      {conceptLessons(ws.valid).map((lesson) => <Disclosure key={lesson.id} summary={lesson.title}><Paragraphs items={lesson.body} /></Disclosure>)}
    </Panel>
  ));

  return (
    <div className="gc-page">
      <ToolHeader
        group="Analyze"
        title="Reaction kinetics"
        purpose="Explore zero-, first- and second-order rate laws for one reactant, fit concentration–time data, and see how temperature changes the rate constant."
        evidence="model"
        steps={[
          { label: "Choose a view", detail: "Model, fit data, or Arrhenius." },
          { label: "Change the values", detail: "Both plots and every readout update together." },
          { label: "Read the half-life", detail: "Compare how it behaves for each order." },
        ]}
        aside={<Badge tone="neutral" title="Single reactant, constant temperature unless you use the Arrhenius tab.">1 reactant · n = 0, 1, 2</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <Segmented<KineticsView>
          label="Analysis"
          onChange={setView}
          options={[{ id: "model", label: "Rate-law model" }, { id: "fit", label: "Fit data" }, { id: "arrhenius", label: "Arrhenius" }]}
          value={raw.view}
        />
        <LearningModeSwitch mode={mode} modes={["explore", "practice"]} onChange={setMode} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      {/* ------------------------------------------------------------------ model ------------------------------------------------------------------ */}
      {raw.view === "model" && (
        <div className="gc-layout">
          <Panel className="gc-inputs" subtitle="The order is an assumption of this teaching model. Real orders are measured." title="Rate law">
            <div className="gc-presets" role="group" aria-label="Example systems">
              {MODEL_PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => update((c) => ({ ...c, model: { ...p.model }, tNow: 0 }))} type="button">{p.label}</button>)}
            </div>
            <Segmented<"0" | "1" | "2"> label="Reaction order" onChange={(o) => setModel({ order: Number(o) as Order })} options={ORDER_OPTIONS} value={String(raw.model.order) as "0" | "1" | "2"} />
            <Segmented<TimeUnit> label="Time unit" onChange={(timeUnit) => update((c) => ({ ...c, timeUnit }))} options={TIME_UNITS.map((t) => ({ id: t, label: t }))} value={u} />
            <NumberField error={errorFor(mErrors, /rate constant/)} hint={`rate = k[A]${raw.model.order === 1 ? "" : raw.model.order === 0 ? "⁰" : "²"}`} label="Rate constant k" onChange={(k) => setModel({ k })} unit={kUnits(raw.model.order, u)} value={raw.model.k} />
            <NumberField error={errorFor(mErrors, /initial concentration/)} label="Initial concentration [A]₀" onChange={(c0) => setModel({ c0 })} unit="mol/L" value={raw.model.c0} />
            {mErrors && <Callout tone="danger" title="These values cannot be used"><ul>{mErrors.map((e) => <li key={e}>{e}</li>)}</ul></Callout>}
          </Panel>

          <div className="gc-stage">
            {model ? (
              <>
                <KeyFigures
                  items={[
                    { label: "Half-life", value: <span className="gc-big" data-testid="half-life">{f(halfLife(model))} {u}</span>, note: HALF_LIFE_RULE[model.order].split(":")[0] },
                    { label: `[A] at t = ${f(tNow)} ${u}`, value: `${f(concentrationAt(model, tNow))} mol/L`, note: `${f((concentrationAt(model, tNow) / model.c0) * 100, 3)} % remaining` },
                    { label: "Rate at that time", value: `${f(rateAt(model, tNow))} mol L⁻¹ ${u}⁻¹`, note: `k = ${f(model.k)} ${kUnits(model.order, u)}` },
                    { label: "Linear plot", value: `${linearLabel(model.order)} against t`, note: `slope ${f(linearSlope(model))}${model.order === 1 ? ` ${u}⁻¹` : ""}` },
                  ]}
                />

                <DiagramFrame
                  caption={`t = ${f(tNow)} ${u}: [A] = ${f(concentrationAt(model, tNow))} mol/L. Drag on either graph, use the arrow keys, or move the slider; both graphs show the same moment.`}
                  label="Concentration against time"
                  legend={<Legend items={[{ label: "[A]", color: "#0b6a72", kind: "line" }, { label: "Selected time", color: "#be123c", kind: "dashed" }, { label: "Half-lives", color: "#6d28d9" }]} />}
                  title="Concentration against time"
                >
                  <LineChart
                    current={{ x: tNow, y: concentrationAt(model, tNow) }}
                    formatX={(x) => String(Number(x.toPrecision(3)))}
                    formatY={(y) => String(Number(y.toPrecision(2)))}
                    markers={halfMarkers(model, span)}
                    onXChange={(t) => update((c) => ({ ...c, tNow: Number(t.toPrecision(8)) }))}
                    series={[{ id: "c", label: "[A]", points: curve.map((p) => ({ x: p.t, y: p.c })) }]}
                    title="Concentration of A against time"
                    valueText={`t = ${f(tNow)} ${u}, [A] = ${f(concentrationAt(model, tNow))} mol/L`}
                    xDomain={[0, span]}
                    xLabel={`Time (${u})`}
                    xStep={span / 400}
                    yDomain={[0, model.c0 * 1.05]}
                    yLabel="[A] (mol/L)"
                  />
                </DiagramFrame>

                <DiagramFrame
                  caption={`${linearLabel(model.order)} is a straight line against t for ${ORDER_NAME[model.order]} kinetics; the slope is ${model.order === 2 ? "+k" : "−k"}.`}
                  label="Linearized plot"
                  legend={<Legend items={[{ label: `${linearLabel(model.order)}${linearUnit(model.order) ? ` (${linearUnit(model.order)})` : ""}`, color: "#0b6a72", kind: "line" }, { label: "Selected time", color: "#be123c", kind: "dashed" }]} />}
                  title={`Linearized plot: ${linearLabel(model.order)} against time`}
                >
                  {(() => {
                    const ys = curve.map((p) => p.y).filter(Number.isFinite);
                    const lo = Math.min(...ys); const hi = Math.max(...ys);
                    const pad = (hi - lo || 1) * 0.05;
                    const yNow = model.order === 0 ? concentrationAt(model, tNow) : linearized(model.order, concentrationAt(model, tNow));
                    return (
                      <LineChart
                        current={{ x: tNow, y: Number.isFinite(yNow) ? yNow : lo }}
                        formatX={(x) => String(Number(x.toPrecision(3)))}
                        formatY={(y) => String(Number(y.toPrecision(3)))}
                        onXChange={(t) => update((c) => ({ ...c, tNow: Number(t.toPrecision(8)) }))}
                        series={[{ id: "lin", label: linearLabel(model.order), points: curve.map((p) => ({ x: p.t, y: p.y })) }]}
                        title={`${linearLabel(model.order)} against time`}
                        valueText={`t = ${f(tNow)} ${u}, ${linearLabel(model.order)} = ${f(yNow)}`}
                        xDomain={[0, span]}
                        xLabel={`Time (${u})`}
                        xStep={span / 400}
                        yDomain={[lo - pad, hi + pad]}
                        yLabel={`${linearLabel(model.order)}${linearUnit(model.order) ? ` (${linearUnit(model.order)})` : ""}`}
                      />
                    );
                  })()}
                </DiagramFrame>

                <div className="gc-slider">
                  <label htmlFor="gc-t-slider">Time: <strong>{f(tNow)} {u}</strong></label>
                  <input
                    aria-valuetext={`${f(tNow)} ${u}, concentration ${f(concentrationAt(model, tNow))} mol/L`}
                    id="gc-t-slider" max={span} min={0} onChange={(event) => update((c) => ({ ...c, tNow: Number(event.target.value) }))} step={span / 1000} type="range" value={tNow}
                  />
                  <div className="gc-jumps" role="group" aria-label="Jump to a time">
                    <button className="secondary-button gc-chip" onClick={() => update((c) => ({ ...c, tNow: 0 }))} type="button">Start</button>
                    <button className="secondary-button gc-chip" onClick={() => update((c) => ({ ...c, tNow: halfLife(model) }))} type="button">One half-life</button>
                    <button className="secondary-button gc-chip" onClick={() => update((c) => ({ ...c, tNow: Math.min(span, timeToFraction(model, 0.1)) }))} type="button">90 % reacted</button>
                  </div>
                </div>

                <Panel subtitle="How long does each halving take?" title="Successive half-lives">
                  <table className="gc-table">
                    <caption className="visually-hidden">Duration of successive half-lives</caption>
                    <thead><tr><th scope="col">Half-life</th><th scope="col">[A] from → to (mol/L)</th><th scope="col">Duration ({u})</th><th scope="col">Ends at t ({u})</th></tr></thead>
                    <tbody>{successiveHalfLives(model, 4).map((s) => <tr key={s.n}><td>{s.n}</td><td>{f(s.cStart)} → {f(s.cEnd)}</td><td>{f(s.duration)}</td><td>{f(s.end)}</td></tr>)}</tbody>
                  </table>
                </Panel>

                <Explanation title={`Half-life for ${ORDER_NAME[model.order]} kinetics`}>
                  <p>{HALF_LIFE_RULE[model.order][0].toUpperCase() + HALF_LIFE_RULE[model.order].slice(1)}.</p>
                  <p>Here t½ = {f(halfLife(model))} {u} for [A]₀ = {f(model.c0)} mol/L and k = {f(model.k)} {kUnits(model.order, u)}.</p>
                </Explanation>

                <Panel title="Integrated rate law">
                  <ul className="gc-eq-list">
                    <li>{model.order === 0 ? `[A] = [A]₀ − kt = ${f(model.c0)} − ${f(model.k)}·t  (valid until [A] reaches 0 at t = ${f(model.c0 / model.k)} ${u})` : model.order === 1 ? `[A] = [A]₀·e^(−kt) = ${f(model.c0)}·e^(−${f(model.k)}·t)` : `1/[A] = 1/[A]₀ + kt = ${f(1 / model.c0)} + ${f(model.k)}·t`}</li>
                    <li>rate = −d[A]/dt = k[A]^{model.order} = {f(rateAt(model, tNow))} mol L⁻¹ {u}⁻¹ at the selected time</li>
                  </ul>
                </Panel>
                {lessonsAndPractice}
              </>
            ) : (
              <Callout tone="info" title="Enter valid values to see the model"><p>The plots and readouts appear as soon as every field is valid.</p></Callout>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ fit ------------------------------------------------------------------ */}
      {raw.view === "fit" && (
        <div className="gc-layout">
          <Panel className="gc-inputs" subtitle="One time and concentration per line (mol/L). Times in the unit you choose." title="Concentration–time data">
            <div className="gc-presets" role="group" aria-label="Example data">
              {SAMPLES.map((s) => <button className="secondary-button gc-chip" key={s.label} onClick={() => update((c) => ({ ...c, fitText: s.text }))} type="button">{s.label}</button>)}
            </div>
            <Segmented<TimeUnit> label="Time unit" onChange={(timeUnit) => update((c) => ({ ...c, timeUnit }))} options={TIME_UNITS.map((t) => ({ id: t, label: t }))} value={u} />
            <TextAreaField error={fit.kind === "error" ? fit.error : null} hint="At least 4 rows. Lines starting with # are ignored." label={`Rows of "time, concentration" (${u}, mol/L)`} onChange={(fitText) => update((c) => ({ ...c, fitText }))} rows={9} value={raw.fitText} />
          </Panel>
          <div className="gc-stage">
            {fit.kind === "ok" ? (
              <>
                <Callout tone={fit.result.verdict === "supported" ? "ok" : fit.result.verdict === "poor" ? "danger" : "warn"} title={fit.result.best === null ? "No model fitted" : `Best fit: ${ORDER_NAME[fit.result.best]} (${fit.result.verdict})`}>
                  <p>{fit.result.message}</p>
                </Callout>
                <Panel subtitle="Smallest RMSE on the concentration axis is the yardstick." title="Candidate rate laws">
                  <div className="gc-table-scroll">
                    <table className="gc-table gc-fit-table">
                      <caption className="visually-hidden">Fit quality of each order</caption>
                      <thead><tr><th scope="col">Model</th><th scope="col">k ({u} units for that order)</th><th scope="col">R² of linear plot</th><th scope="col">RMSE (mol/L)</th><th scope="col">RMSE / range</th></tr></thead>
                      <tbody>
                        {fit.result.fits.map((x) => (
                          <tr className={x.order === fit.result.best ? "is-best" : undefined} key={x.order}>
                            <th scope="row">{ORDER_NAME[x.order]}{x.order === fit.result.best ? " (best)" : ""}</th>
                            {x.usable ? (
                              <>
                                <td>{f(x.k)} {kUnits(x.order, u)}{Number.isFinite(x.kSE) ? ` ± ${f(x.kSE, 2)}` : ""}</td>
                                <td>{x.r2.toFixed(4)}</td><td>{f(x.rmse)}</td><td>{(x.nrmse * 100).toFixed(1)} %</td>
                              </>
                            ) : <td colSpan={4}>Not usable: {x.reason}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="gc-field-hint">{fit.result.criterion}</p>
                  <p className="gc-field-hint">± is the standard error of the slope of the linearized line, a rough guide only (it assumes equal scatter on the transformed axis).</p>
                </Panel>

                <DiagramFrame
                  caption="Dots are your data; each usable order is drawn with its fitted parameters."
                  label="Data and fitted models"
                  legend={<Legend items={[{ label: "Data", color: "#0f172a" }, ...fit.result.fits.filter((x) => x.usable).map((x) => ({ label: ORDER_NAME[x.order], color: ORDER_COLORS[x.order], kind: (ORDER_DASH[x.order] ? "dashed" : "line") as "line" | "dashed" }))]} />}
                  title="Concentration data with fitted models"
                >
                  <LineChart
                    formatX={(x) => String(Number(x.toPrecision(3)))}
                    formatY={(y) => String(Number(y.toPrecision(2)))}
                    series={fitSeries(fit.data, fit.result.fits)}
                    title="Concentration data with the three fitted rate laws"
                    xDomain={[0, Math.max(...fit.data.map((d) => d.t)) * 1.03]}
                    xLabel={`Time (${u})`}
                    yDomain={[0, Math.max(...fit.data.map((d) => d.c)) * 1.08]}
                    yLabel="[A] (mol/L)"
                  />
                </DiagramFrame>

                <Segmented<"0" | "1" | "2"> label="Linearized plot to show" onChange={(o) => setLinOrder(Number(o) as Order)} options={ORDER_OPTIONS} value={String(linOrder) as "0" | "1" | "2"} />
                {(() => {
                  const x = fit.result.fits.find((q) => q.order === linOrder)!;
                  if (!x.usable) return <Callout tone="info" title={`${ORDER_NAME[linOrder]} cannot be plotted`}><p>{x.reason}.</p></Callout>;
                  const pts = fit.data.map((d) => ({ x: d.t, y: linearized(linOrder, d.c) }));
                  const tMax = Math.max(...fit.data.map((d) => d.t));
                  const slope = linOrder === 2 ? x.k : -x.k;
                  const b = linOrder === 0 ? x.c0Fit : linOrder === 1 ? Math.log(x.c0Fit) : 1 / x.c0Fit;
                  const ys = [...pts.map((p) => p.y), b, b + slope * tMax];
                  const lo = Math.min(...ys); const hi = Math.max(...ys); const pad = (hi - lo || 1) * 0.06;
                  return (
                    <DiagramFrame caption={`R² = ${x.r2.toFixed(4)} for the ${ORDER_NAME[linOrder]} line. A good R² on one plot does not by itself rule out another order; compare the table.`} label="Linearized fit" title={`Linearized plot for ${ORDER_NAME[linOrder]}`}>
                      <LineChart
                        formatX={(v) => String(Number(v.toPrecision(3)))}
                        formatY={(v) => String(Number(v.toPrecision(3)))}
                        series={[
                          { id: "line", label: "Fitted line", color: ORDER_COLORS[linOrder], points: [{ x: 0, y: b }, { x: tMax, y: b + slope * tMax }] },
                          { id: "data", label: "Data", color: "#0f172a", dots: true, noLine: true, points: pts },
                        ]}
                        title={`${linearLabel(linOrder)} against time with fitted line`}
                        xDomain={[0, tMax * 1.03]}
                        xLabel={`Time (${u})`}
                        yDomain={[lo - pad, hi + pad]}
                        yLabel={`${linearLabel(linOrder)}${linearUnit(linOrder) ? ` (${linearUnit(linOrder)})` : ""}`}
                      />
                    </DiagramFrame>
                  );
                })()}
                <Callout tone="info" title="What this does and does not show">
                  <p>It compares three single-reactant, integer-order models on one data set at one temperature. It cannot identify fractional or mixed orders, several steps, reversible reactions or orders in other reactants. Distinguishing orders reliably usually needs data over several half-lives or runs with different starting concentrations.</p>
                </Callout>
                {lessonsAndPractice}
              </>
            ) : (
              <Callout tone="danger" title="Enter valid data to fit"><p>{fit.error}</p></Callout>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ Arrhenius ------------------------------------------------------------------ */}
      {raw.view === "arrhenius" && (
        <div className="gc-layout">
          <Panel className="gc-inputs" subtitle="Temperatures in kelvin (K = °C + 273.15)." title="Temperature dependence">
            <Segmented<ArrheniusInput["mode"]>
              label="Activation energy from"
              onChange={(m) => setArr({ mode: m })}
              options={[{ id: "given", label: "Given Ea" }, { id: "two-point", label: "Two measurements" }, { id: "fit", label: "Table of data" }]}
              value={raw.arrhenius.mode}
            />
            {raw.arrhenius.mode !== "fit" && (
              <>
                <NumberField error={errorFor(arrErrors, /reference rate constant|k₁/)} label="Rate constant k₁" onChange={(k1) => setArr({ k1 })} value={raw.arrhenius.k1} />
                <NumberField error={errorFor(arrErrors, /reference temperature|T₁/)} label="Temperature T₁" onChange={(T1) => setArr({ T1 })} unit="K" value={raw.arrhenius.T1} />
              </>
            )}
            {raw.arrhenius.mode === "given" && <NumberField error={errorFor(arrErrors, /Ea must/)} label="Activation energy Ea" onChange={(EaKJ) => setArr({ EaKJ })} unit="kJ/mol" value={raw.arrhenius.EaKJ} />}
            {raw.arrhenius.mode === "two-point" && (
              <>
                <NumberField error={errorFor(arrErrors, /k₂/)} label="Rate constant k₂" onChange={(k2) => setArr({ k2 })} value={raw.arrhenius.k2} />
                <NumberField error={errorFor(arrErrors, /T₂|must differ/)} label="Temperature T₂" onChange={(T2) => setArr({ T2 })} unit="K" value={raw.arrhenius.T2} />
              </>
            )}
            {raw.arrhenius.mode === "fit" && (
              <TextAreaField error={arr && !arr.ok ? arr.error : null} hint="At least 2 rows (3 or more to check the fit). Temperatures in K." label='Rows of "T (K), k"' onChange={(fitText) => setArr({ fitText })} rows={8} value={raw.arrhenius.fitText} />
            )}
            <NumberField error={errorFor(arrErrors, /target temperature/)} label="Temperature of interest" onChange={(T) => setArr({ T })} unit="K" value={raw.arrhenius.T} />
            <div className="gc-slider">
              <label htmlFor="gc-arr-T">Temperature: <strong>{f(raw.arrhenius.T, 4)} K</strong></label>
              <input id="gc-arr-T" max={Math.min(KIN_LIMITS.maxT, 600)} min={KIN_LIMITS.minT} onChange={(e) => setArr({ T: Number(e.target.value) })} step={1} type="range" value={Math.min(Math.max(raw.arrhenius.T, KIN_LIMITS.minT), Math.min(KIN_LIMITS.maxT, 600))} />
            </div>
            {arrErrors && <Callout tone="danger" title="These values cannot be used"><ul>{arrErrors.map((e) => <li key={e}>{e}</li>)}</ul></Callout>}
            {arr && arr.ok && arr.warnings.length > 0 && <Callout tone="warn" title="Check these"><ul>{arr.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Callout>}
          </Panel>
          <div className="gc-stage">
            {arr && arr.ok && av.ok ? (
              <>
                <KeyFigures
                  items={[
                    { label: "Activation energy", value: <span className="gc-big">{f(arr.EaKJ)} kJ/mol</span>, note: arr.fit && arr.fit.n >= 3 ? `± ${f(arr.fit.EaSEKJ, 2)} (standard error), R² = ${arr.fit.r2.toFixed(4)}` : undefined },
                    { label: `k at ${f(av.value.T, 4)} K`, value: f(arr.kAtT), note: "same units as the k you entered" },
                    { label: "Per +10 K", value: `× ${f(arr.factor10)}`, note: "factor on k at this temperature" },
                    { label: "Pre-exponential A", value: f(arr.A), note: "k = A·exp(−Ea/RT)" },
                  ]}
                />
                {(() => {
                  const Ts = [...arr.points.map((p) => p.T), av.value.T];
                  const lo = Math.max(KIN_LIMITS.minT, Math.min(...Ts) - 30); const hi = Math.min(KIN_LIMITS.maxT, Math.max(...Ts) + 30);
                  const kAt = (T: number) => arr.A * Math.exp(-(arr.EaKJ * 1000) / (R_GAS * T));
                  const N = 120;
                  const lineT = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N);
                  const lnk = lineT.map((T) => Math.log(kAt(T)));
                  const ymin = Math.min(...lnk, ...arr.points.map((p) => Math.log(p.k))); const ymax = Math.max(...lnk, ...arr.points.map((p) => Math.log(p.k)));
                  const pad = (ymax - ymin || 1) * 0.06;
                  const kMax = Math.max(...lineT.map(kAt), ...arr.points.map((p) => p.k));
                  return (
                    <>
                      <DiagramFrame
                        caption="Arrhenius plot: ln k against 1000/T is a straight line of slope −Ea/R. Drag to change the temperature (1000/T decreases to the right)."
                        label="Arrhenius plot"
                        legend={<Legend items={[{ label: "Arrhenius line", color: "#0b6a72", kind: "line" }, { label: "Data", color: "#0f172a" }, { label: "Temperature of interest", color: "#be123c", kind: "dashed" }]} />}
                        title="Arrhenius plot"
                      >
                        <LineChart
                          current={{ x: 1000 / av.value.T, y: Math.log(arr.kAtT) }}
                          formatX={(x) => String(Number(x.toPrecision(3)))}
                          formatY={(y) => String(Number(y.toPrecision(3)))}
                          onXChange={(x) => setArr({ T: Math.min(KIN_LIMITS.maxT, Math.max(KIN_LIMITS.minT, Number((1000 / x).toPrecision(5)))) })}
                          series={[
                            { id: "line", label: "ln k", points: lineT.map((T, i) => ({ x: 1000 / T, y: lnk[i] })).reverse() },
                            { id: "data", label: "Data", color: "#0f172a", dots: true, noLine: true, points: arr.points.map((p) => ({ x: 1000 / p.T, y: Math.log(p.k) })) },
                          ]}
                          title="ln k against 1000/T"
                          valueText={`T = ${f(av.value.T, 4)} K, ln k = ${f(Math.log(arr.kAtT))}`}
                          xDomain={[1000 / hi, 1000 / lo]}
                          xLabel="1000 / T (K⁻¹)"
                          xStep={(1000 / lo - 1000 / hi) / 300}
                          yDomain={[ymin - pad, ymax + pad]}
                          yLabel="ln k"
                        />
                      </DiagramFrame>
                      <DiagramFrame caption="The same relation on a linear temperature axis: k rises exponentially, not linearly." label="Rate constant against temperature" title="Rate constant against temperature">
                        <LineChart
                          current={{ x: av.value.T, y: arr.kAtT }}
                          formatX={(x) => String(Math.round(x))}
                          formatY={(y) => f(y, 2)}
                          markers={arr.points.map((p, i): ChartMarker => ({ id: `d${i}`, kind: "info", label: `${f(p.T, 4)} K`, x: p.T, y: p.k }))}
                          onXChange={(T) => setArr({ T: Number(T.toPrecision(5)) })}
                          series={[{ id: "k", label: "k(T)", points: lineT.map((T) => ({ x: T, y: kAt(T) })) }]}
                          title="Rate constant k against temperature"
                          valueText={`T = ${f(av.value.T, 4)} K, k = ${f(arr.kAtT)}`}
                          xDomain={[lo, hi]}
                          xLabel="Temperature (K)"
                          xStep={(hi - lo) / 300}
                          yDomain={[0, kMax * 1.05]}
                          yLabel="k"
                        />
                      </DiagramFrame>
                    </>
                  );
                })()}
                <Panel title="Equations used">
                  <ul className="gc-eq-list">
                    <li>k = A·exp(−Ea / RT), R = {R_GAS} J/(mol·K)</li>
                    <li>ln(k₂/k₁) = −(Ea/R)(1/T₂ − 1/T₁)  →  Ea = R·ln(k₂/k₁) / (1/T₁ − 1/T₂)</li>
                    <li>Ea = {f(arr.EaKJ)} kJ/mol; k({f(av.value.T, 4)} K) = {f(arr.kAtT)}</li>
                  </ul>
                </Panel>
                <Callout tone="info" title="Limits of the Arrhenius model">
                  <p>It assumes A and Ea are constant over the temperatures used and that the rate-determining mechanism does not change. Extrapolating far beyond the measured range, or across a change of mechanism or phase, can be badly wrong.</p>
                </Callout>
                {lessonsAndPractice}
              </>
            ) : (
              <Callout tone="info" title="Enter valid values to see the Arrhenius analysis"><p>{arrErrors?.[0] ?? "The plots and readouts appear as soon as every field is valid."}</p></Callout>
            )}
          </div>
        </div>
      )}

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">
          <li>One reactant A with rate = k[A]ⁿ, n = 0, 1 or 2, at constant temperature and volume. The order is never inferred from the reaction's coefficients.</li>
          <li>The rate-law model uses an order you choose (a teaching assumption). Only the Fit data tab estimates order, and only among these three, with the criterion it states.</li>
          <li>Rate constants refer to −d[A]/dt. Multi-step, reversible, catalysed or multi-reactant rate laws are not modelled.</li>
          <li>Arrhenius assumes constant A and Ea over the temperature range; it is an empirical description, not a prediction for an unmeasured mechanism.</li>
        </ul>
      </Panel>
      <RelatedConcepts subject="general" toolId="gcKinetics" />
    </div>
  );
}

function halfMarkers(m: RateModel, span: number): ChartMarker[] {
  return successiveHalfLives(m, 3).filter((s) => s.end <= span * 1.0001).map((s) => ({ id: `h${s.n}`, kind: "half" as const, label: `t½ ×${s.n}`, x: s.end, y: s.cEnd }));
}

function fitSeries(data: Array<{ t: number; c: number }>, fits: OrderFit[]): ChartSeries[] {
  const tMax = Math.max(...data.map((d) => d.t));
  const out: ChartSeries[] = [];
  for (const x of fits) {
    if (!x.usable) continue;
    const m: RateModel = { order: x.order, k: x.k, c0: x.c0Fit };
    out.push({ id: `fit${x.order}`, label: ORDER_NAME[x.order], color: ORDER_COLORS[x.order], dash: ORDER_DASH[x.order], points: Array.from({ length: 121 }, (_, i) => ({ x: (tMax * 1.03 * i) / 120, y: concentrationAt(m, (tMax * 1.03 * i) / 120) })) });
  }
  out.push({ id: "data", label: "Data", color: "#0f172a", dots: true, noLine: true, points: data.map((d) => ({ x: d.t, y: d.c })) });
  return out;
}
