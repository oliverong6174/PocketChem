import { useMemo, useState } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import "../../styles/generalChem.css";
import { LineChart, type ChartBand, type ChartMarker, type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch, type LearningMode } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, Explanation, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { formatSig } from "../../utils/generalChem/format";
import {
  analyzeCalorimetry, analyzeGibbs, gibbsNonstandard, HESS_LIMITS, solveHess, validateCalorimetry, validateGibbs, validateHess,
  type CalorimetryInput, type CalorimetryMode, type GibbsInput,
} from "../../utils/generalChem/thermo";
import { calorimetryLessons, CASE_ROWS, conceptLessons, gibbsExplanation, hessLessons, thermoScenarios } from "../../utils/generalChem/thermoLearning";
import { summarizeThermo } from "../../utils/generalChem/toolSummary";
import {
  DEFAULT_THERMO_INPUTS, describeThermoAnalysis, THERMO_ENGINE_VERSION, validateThermoInputs, validateThermoResults,
  type ThermoInputs, type ThermoView,
} from "../../utils/persistence/generalChemTools";
import { GcPredictPanel, NumberField, Paragraphs, TextField } from "./shared";
import { useGcWorkspace } from "./useGcWorkspace";

type Props = {
  openRequest?: { id: string; recordId: string } | null;
  onOpenHandled?: (requestId: string) => void;
};

const f = (v: number, sig = 3) => formatSig(v, sig);

const GIBBS_PRESETS: Array<{ label: string; patch: Partial<GibbsInput>; note: string }> = [
  { label: "N₂ + 3 H₂ → 2 NH₃", patch: { dH: -92.2, dS: -198.7, dCp: 0, T0: 298.15, Tmin: 200, Tmax: 800, T: 400, Q: null }, note: "ΔH° and ΔS° near 298 K: both negative, so favourable at low T." },
  { label: "CaCO₃ → CaO + CO₂", patch: { dH: 178.3, dS: 160.5, dCp: 0, T0: 298.15, Tmin: 300, Tmax: 1500, T: 1000, Q: null }, note: "Both positive: favourable at high T." },
  { label: "H₂O(l) → H₂O(g)", patch: { dH: 40.7, dS: 109, dCp: 0, T0: 373.15, Tmin: 300, Tmax: 450, T: 373.15, Q: null }, note: "Vaporization near 373 K. The constants describe this transition only; they do not extend across it." },
  { label: "C + O₂ → CO₂", patch: { dH: -393.5, dS: 2.9, dCp: 0, T0: 298.15, Tmin: 300, Tmax: 1500, T: 500, Q: null }, note: "ΔH° very negative, ΔS° slightly positive: favourable at every temperature." },
  { label: "N₂ + 2 O₂ → 2 NO₂", patch: { dH: 66.4, dS: -121.6, dCp: 0, T0: 298.15, Tmin: 200, Tmax: 1000, T: 298.15, Q: null }, note: "ΔH° positive, ΔS° negative: never favourable (standard conditions, constant ΔH° and ΔS°)." },
];

const CAL_PRESETS: Array<{ label: string; mode: CalorimetryMode }> = [
  { label: "Reaction in a calorimeter", mode: "reaction" },
  { label: "Mix two samples", mode: "mixing" },
  { label: "Specific heat of a metal", mode: "specific-heat" },
];

export default function ThermodynamicsPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<ThermoInputs>({
    page: "thermo",
    engineVersion: THERMO_ENGINE_VERSION,
    defaults: DEFAULT_THERMO_INPUTS,
    validateInputs: validateThermoInputs,
    validateResults: validateThermoResults,
    summarize: summarizeThermo,
    describe: describeThermoAnalysis,
    fallbackName: "Thermodynamics analysis",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  const [mode, setMode] = useState<LearningMode>("explore");
  const practice = mode === "practice";

  const setView = (view: ThermoView) => update((c) => ({ ...c, view }));
  const setGibbs = (patch: Partial<GibbsInput>) => update((c) => ({ ...c, gibbs: { ...c.gibbs, ...patch } }));
  const setCal = (patch: Partial<CalorimetryInput>) => update((c) => ({ ...c, calorimetry: { ...c.calorimetry, ...patch } }));
  const setCalPart = <K extends "reaction" | "mixing" | "specificHeat">(key: K, patch: Partial<CalorimetryInput[K]>) =>
    update((c) => ({ ...c, calorimetry: { ...c.calorimetry, [key]: { ...c.calorimetry[key], ...patch } } }));

  const gv = useMemo(() => validateGibbs(raw.gibbs), [raw.gibbs]);
  const gibbs = useMemo(() => {
    if (!gv.ok) return null;
    return { input: gv.value, a: analyzeGibbs(gv.value) };
  }, [gv]);
  const hv = useMemo(() => validateHess(raw.hess), [raw.hess]);
  const hess = useMemo(() => (hv.ok ? solveHess(hv.value) : null), [hv]);
  const cv = useMemo(() => validateCalorimetry(raw.calorimetry), [raw.calorimetry]);
  const cal = useMemo(() => (cv.ok ? analyzeCalorimetry(cv.value) : null), [cv]);

  const errorFor = (errors: string[] | null | undefined, needle: RegExp) => errors?.find((e) => needle.test(e)) ?? null;
  const gErrors = gv.ok ? null : gv.errors;
  const cErrors = cv.ok ? null : cv.errors;
  const scenarios = useMemo(() => (ws.valid ? thermoScenarios(ws.valid) : []), [ws.valid]);

  return (
    <div className="gc-page">
      <ToolHeader
        group="Analyze"
        title="Thermodynamics"
        purpose="See how ΔH and ΔS decide whether a reaction is favourable at a given temperature, combine reaction enthalpies with Hess's law, and work through a calorimetry energy balance."
        evidence="model"
        steps={[
          { label: "Choose a view", detail: "Gibbs energy, Hess's law, or calorimetry." },
          { label: "Change the values", detail: "Graphs and results update together." },
          { label: "Read the explanation", detail: "It quotes your numbers and your assumptions." },
        ]}
        aside={<Badge tone="neutral" title="Standard-state quantities with stated assumptions.">Standard state · stated assumptions</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <Segmented<ThermoView>
          label="Analysis"
          onChange={setView}
          options={[{ id: "gibbs", label: "Gibbs energy vs T" }, { id: "hess", label: "Hess's law" }, { id: "calorimetry", label: "Calorimetry" }]}
          value={raw.view}
        />
        <LearningModeSwitch mode={mode} modes={["explore", "practice"]} onChange={setMode} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      {/* ------------------------------------------------------------------ Gibbs ------------------------------------------------------------------ */}
      {raw.view === "gibbs" && (
        <div className="gc-layout">
          <Panel className="gc-inputs" subtitle="ΔH° in kJ/mol; ΔS° in J/(mol·K), joules, not kilojoules." title="Reaction thermodynamics">
            <div className="gc-presets" role="group" aria-label="Example reactions">
              {GIBBS_PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => setGibbs(p.patch)} title={p.note} type="button">{p.label}</button>)}
            </div>
            <NumberField error={errorFor(gErrors, /^ΔH/)} label="ΔH°" onChange={(dH) => setGibbs({ dH })} unit="kJ/mol" value={raw.gibbs.dH} />
            <NumberField error={errorFor(gErrors, /^ΔS/)} label="ΔS°" onChange={(dS) => setGibbs({ dS })} unit="J/(mol·K)" value={raw.gibbs.dS} />
            <NumberField error={errorFor(gErrors, /^ΔCp/)} hint="0 keeps ΔH° and ΔS° constant. A nonzero value is assumed constant over the range." label="ΔCp (optional)" onChange={(dCp) => setGibbs({ dCp })} unit="J/(mol·K)" value={raw.gibbs.dCp} />
            <NumberField error={errorFor(gErrors, /reference temperature/)} hint="The temperature at which ΔH° and ΔS° were measured." label="Reference temperature T₀" onChange={(T0) => setGibbs({ T0 })} unit="K" value={raw.gibbs.T0} />
            <NumberField error={errorFor(gErrors, /^The temperature must/)} label="Temperature of interest" onChange={(T) => setGibbs({ T })} unit="K" value={raw.gibbs.T} />
            <div className="gc-pair">
              <NumberField error={errorFor(gErrors, /lowest plotted|range must/)} label="Plot from" onChange={(Tmin) => setGibbs({ Tmin })} unit="K" value={raw.gibbs.Tmin} />
              <NumberField error={errorFor(gErrors, /highest plotted/)} label="Plot to" onChange={(Tmax) => setGibbs({ Tmax })} unit="K" value={raw.gibbs.Tmax} />
            </div>
            <label className="gc-check">
              <input checked={raw.gibbs.Q !== null} onChange={(e) => setGibbs({ Q: e.target.checked ? 1 : null })} type="checkbox" />
              <span>Nonstandard conditions: give the reaction quotient Q</span>
            </label>
            {raw.gibbs.Q !== null && <NumberField error={errorFor(gErrors, /quotient/)} hint="Q = 1 reproduces standard conditions." label="Reaction quotient Q" onChange={(Q) => setGibbs({ Q })} value={raw.gibbs.Q} />}
            {gErrors && <Callout tone="danger" title="These values cannot be used"><ul>{gErrors.map((e) => <li key={e}>{e}</li>)}</ul></Callout>}
            {gv.ok && gv.warnings.length > 0 && <Callout tone="warn" title="Check these assumptions"><ul>{gv.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Callout>}
          </Panel>

          <div className="gc-stage">
            {gibbs ? (() => {
              const { input: g, a } = gibbs;
              const series: ChartSeries[] = [
                { id: "dG", label: "ΔG°", color: "#0b6a72", points: a.curve.map((p) => ({ x: p.T, y: p.dG })) },
                { id: "dH", label: "ΔH°(T)", color: "#b45309", dash: "7 4", points: a.curve.map((p) => ({ x: p.T, y: p.dH })) },
                { id: "TdS", label: "TΔS°(T)", color: "#6d28d9", dash: "2 4", points: a.curve.map((p) => ({ x: p.T, y: p.TdS })) },
                { id: "zero", label: "ΔG = 0", color: "#64748b", dash: "3 3", points: [{ x: g.Tmin, y: 0 }, { x: g.Tmax, y: 0 }] },
              ];
              if (g.Q !== null) series.push({ id: "dGQ", label: "ΔG (nonstandard)", color: "#be123c", dash: "10 4 2 4", points: a.curve.map((p) => ({ x: p.T, y: gibbsNonstandard(g, p.T, g.Q as number) })) });
              const allY = series.flatMap((s) => s.points.map((p) => p.y)).concat(0);
              const lo = Math.min(...allY); const hi = Math.max(...allY); const pad = (hi - lo || 1) * 0.08;
              // favourable (ΔG° < 0) intervals
              const bands: ChartBand[] = [];
              let startT: number | null = null;
              a.curve.forEach((p, i) => {
                if (p.dG < 0 && startT === null) startT = p.T;
                if ((p.dG >= 0 || i === a.curve.length - 1) && startT !== null) { bands.push({ id: `fav${bands.length}`, x0: startT, x1: p.T, label: "ΔG° < 0: favourable (standard conditions)" }); startT = null; }
              });
              if (g.dCp === 0) {
                if (g.T0 - 300 > g.Tmin) bands.push({ id: "extLo", x0: g.Tmin, x1: Math.min(g.Tmax, g.T0 - 300), label: "More than 300 K from T₀: constant ΔH°, ΔS° less reliable", kind: "warn" });
                if (g.T0 + 300 < g.Tmax) bands.push({ id: "extHi", x0: Math.max(g.Tmin, g.T0 + 300), x1: g.Tmax, label: "More than 300 K from T₀: constant ΔH°, ΔS° less reliable", kind: "warn" });
              }
              const markers: ChartMarker[] = a.crossovers.map((t, i) => ({ id: `x${i}`, kind: "equivalence", label: `ΔG° = 0 at ${f(t, 4)} K`, x: t, y: 0 }));
              const current = Math.min(g.Tmax, Math.max(g.Tmin, g.T));
              const regime = a.dGnon !== null ? a.dGnon : a.dGT;
              return (
                <>
                  <KeyFigures
                    items={[
                      { label: `ΔG° at ${f(g.T, 4)} K`, value: <span className="gc-big" data-testid="dg-now">{f(a.dGT)} kJ/mol</span>, note: a.dGT < 0 ? "exergonic (favourable, standard)" : a.dGT > 0 ? "endergonic (unfavourable, standard)" : "at equilibrium (standard)" },
                      { label: "ΔH° and TΔS°", value: `${f(a.dHT)} and ${f((g.T * a.dST) / 1000)} kJ/mol`, note: `ΔS° = ${f(a.dST)} J/(mol·K)` },
                      { label: "K at this temperature", value: f(a.K), note: `ln K = ${f(a.lnK)} (from −ΔG°/RT)` },
                      { label: a.crossovers.length ? "ΔG° = 0 at" : "Crossover", value: a.crossovers.length ? a.crossovers.map((t) => `${f(t, 4)} K`).join(", ") : "none in range", note: a.closedFormCrossover !== null && !a.crossovers.length ? `ΔH°/ΔS° = ${f(a.closedFormCrossover, 4)} K, outside the plot` : undefined },
                      ...(a.dGnon !== null ? [{ label: "Nonstandard ΔG", value: `${f(a.dGnon)} kJ/mol`, note: regime < 0 ? "forward from this Q" : regime > 0 ? "reverse from this Q" : "at equilibrium" }] : []),
                    ]}
                  />
                  <DiagramFrame
                    caption={`T = ${f(g.T, 4)} K: ΔG° = ${f(a.dGT)} kJ/mol. Drag on the graph, use the arrow keys, or move the slider. Shaded teal: ΔG° < 0${g.dCp === 0 ? "; shaded amber: far from T₀, where constant ΔH° and ΔS° are less reliable" : ""}.`}
                    label="Gibbs energy against temperature"
                    legend={<Legend items={[{ label: "ΔG°", color: "#0b6a72", kind: "line" }, { label: "ΔH°", color: "#b45309", kind: "dashed" }, { label: "TΔS°", color: "#6d28d9", kind: "dashed" }, ...(g.Q !== null ? [{ label: "ΔG (nonstandard Q)", color: "#be123c", kind: "dashed" as const }] : []), { label: "Selected temperature", color: "#be123c", kind: "dashed" as const }]} />}
                    title="ΔG° against temperature"
                  >
                    <LineChart
                      bands={bands}
                      current={{ x: current, y: a.dGT }}
                      formatX={(x) => String(Math.round(x))}
                      formatY={(y) => String(Number(y.toPrecision(3)))}
                      markers={markers}
                      onXChange={(T) => setGibbs({ T: Number(T.toFixed(2)) })}
                      series={series}
                      title="Gibbs energy change against temperature"
                      valueText={`T = ${f(g.T, 4)} K, ΔG° = ${f(a.dGT)} kJ/mol`}
                      xDomain={[g.Tmin, g.Tmax]}
                      xLabel="Temperature (K)"
                      xStep={(g.Tmax - g.Tmin) / 400}
                      yDomain={[lo - pad, hi + pad]}
                      yLabel="Energy (kJ/mol)"
                    />
                  </DiagramFrame>
                  <div className="gc-slider">
                    <label htmlFor="gc-T-slider">Temperature: <strong>{f(g.T, 4)} K</strong></label>
                    <input aria-valuetext={`${f(g.T, 4)} K, ΔG° ${f(a.dGT)} kJ/mol`} id="gc-T-slider" max={g.Tmax} min={g.Tmin} onChange={(e) => setGibbs({ T: Number(e.target.value) })} step={(g.Tmax - g.Tmin) / 1000} type="range" value={current} />
                    <div className="gc-jumps" role="group" aria-label="Jump to a temperature">
                      <button className="secondary-button gc-chip" onClick={() => setGibbs({ T: g.Tmin })} type="button">Lowest</button>
                      {a.crossovers[0] !== undefined && <button className="secondary-button gc-chip" onClick={() => setGibbs({ T: Number(a.crossovers[0].toFixed(2)) })} type="button">At ΔG° = 0</button>}
                      <button className="secondary-button gc-chip" onClick={() => setGibbs({ T: g.T0 >= g.Tmin && g.T0 <= g.Tmax ? g.T0 : g.Tmin })} type="button">At T₀</button>
                      <button className="secondary-button gc-chip" onClick={() => setGibbs({ T: g.Tmax })} type="button">Highest</button>
                    </div>
                  </div>
                  <Explanation title="What the numbers say"><Paragraphs items={gibbsExplanation(g, a)} /></Explanation>
                  <Panel subtitle="Valid when ΔCp = 0; the highlighted row is your reaction." title="Four sign combinations">
                    <div className="gc-table-scroll">
                      <table className="gc-table gc-case-table">
                        <caption className="visually-hidden">How the signs of ΔH and ΔS decide favourability</caption>
                        <thead><tr><th scope="col">ΔH°</th><th scope="col">ΔS°</th><th scope="col">Result</th></tr></thead>
                        <tbody>
                          {CASE_ROWS.map((row) => (
                            <tr className={g.dCp === 0 && a.case === row.id ? "is-here" : undefined} key={row.id}>
                              <td>{row.dH}</td><td>{row.dS}</td><td>{row.result}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                  <Callout tone="info" title="Favourable is not the same as fast">
                    <p>ΔG° &lt; 0 says the products are favoured at equilibrium. It does not say how quickly the reaction gets there: that is set by the activation barrier (see the Reaction kinetics tool).</p>
                  </Callout>
                  {practice ? (
                    ws.valid && <GcPredictPanel input={ws.valid} onApply={(next) => update(() => next)} scenarios={scenarios} />
                  ) : (
                    ws.valid && <Panel subtitle="Each answer uses the numbers for the reaction you have set up." title="Why does it behave this way?">{conceptLessons(ws.valid).map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}</Panel>
                  )}
                </>
              );
            })() : (
              <Callout tone="info" title="Enter valid values to see the graph"><p>The graph and results appear as soon as every field is valid.</p></Callout>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ Hess ------------------------------------------------------------------ */}
      {raw.view === "hess" && (
        <div className="gc-layout">
          <Panel className="gc-inputs" subtitle='Balanced equations; separate species with " + " and write states, e.g. 2 H2(g) + O2(g) -> 2 H2O(l). Use 1/2 for fractions.' title="Equations">
            <TextField error={hess && !hess.ok && /^Target/.test(hess.error) ? hess.error : errorFor(hv.ok ? null : hv.errors, /target/i)} label="Target equation" mono onChange={(target) => update((c) => ({ ...c, hess: { ...c.hess, target } }))} value={raw.hess.target} />
            {raw.hess.steps.map((s, i) => (
              <fieldset className="gc-fieldset gc-hess-step" key={i}>
                <legend>Known equation {i + 1}</legend>
                <TextField error={hess && !hess.ok && new RegExp(`^Equation ${i + 1}:`).test(hess.error) ? hess.error : null} label={`Equation ${i + 1}`} mono onChange={(equation) => update((c) => ({ ...c, hess: { ...c.hess, steps: c.hess.steps.map((x, j) => (j === i ? { ...x, equation } : x)) } }))} value={s.equation} />
                <NumberField label={`ΔH of equation ${i + 1}`} onChange={(dH) => update((c) => ({ ...c, hess: { ...c.hess, steps: c.hess.steps.map((x, j) => (j === i ? { ...x, dH } : x)) } }))} unit="kJ" value={s.dH} />
                {raw.hess.steps.length > HESS_LIMITS.minSteps && <button className="ghost-button" onClick={() => update((c) => ({ ...c, hess: { ...c.hess, steps: c.hess.steps.filter((_, j) => j !== i) } }))} type="button">Remove equation {i + 1}</button>}
              </fieldset>
            ))}
            {raw.hess.steps.length < HESS_LIMITS.maxSteps && <button className="secondary-button" onClick={() => update((c) => ({ ...c, hess: { ...c.hess, steps: [...c.hess.steps, { equation: "", dH: 0 }] } }))} type="button">Add an equation</button>}
            {!hv.ok && <Callout tone="danger" title="These values cannot be used"><ul>{hv.errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout>}
          </Panel>
          <div className="gc-stage">
            {hess && hess.ok ? (
              <>
                <KeyFigures items={[{ label: "ΔH of the target", value: <span className="gc-big" data-testid="hess-total">{f(hess.total, 4)} kJ</span>, note: hess.total < 0 ? "exothermic" : hess.total > 0 ? "endothermic" : "no net heat" }, { label: "Equations used", value: String(hess.lines.filter((l) => l.multiplier !== 0).length) }]} />
                <Panel subtitle="Each known equation is reversed and/or scaled so that the species cancel to give the target." title="Accounting: reversal, scaling and summation">
                  <ol className="gc-ledger">
                    {hess.lines.map((l) => (
                      <li key={l.index}>
                        <span><strong>Equation {l.index}:</strong> <code>{l.equation}</code> &nbsp; ΔH = {f(l.dH, 4)} kJ</span>
                        <span>{l.description === "not used" ? "Not used." : `${l.reversed ? "Reverse it (ΔH changes sign)" : "Use it as written"}${l.scale !== 1 ? `, multiply by ${f(l.scale, 4)} (ΔH is multiplied too)` : ""}.`} Multiplier {l.multiplier > 0 ? "+" : "−"}{f(Math.abs(l.multiplier), 4)} × {f(l.dH, 4)} = <strong>{f(l.contribution, 4)} kJ</strong></span>
                      </li>
                    ))}
                    <li className="gc-ledger-total">Sum: ΔH = {hess.lines.map((l) => f(l.contribution, 4)).join(" + ").replace(/\+ -/g, "− ")} = {f(hess.total, 4)} kJ</li>
                  </ol>
                </Panel>
                <Panel subtitle="Net moles of each species after combining; products positive, reactants negative." title="Species cancellation">
                  <div className="gc-table-scroll">
                    <table className="gc-table">
                      <caption className="visually-hidden">Net coefficient of each species per equation, in total, and in the target</caption>
                      <thead><tr><th scope="col">Species</th>{hess.lines.map((l) => <th key={l.index} scope="col">Eq {l.index}</th>)}<th scope="col">Sum</th><th scope="col">Target</th></tr></thead>
                      <tbody>
                        {hess.species.map((s) => (
                          <tr key={s.key}>
                            <th scope="row">{s.key}</th>
                            {s.fromSteps.map((v, i) => <td key={i}>{f(v, 4)}</td>)}
                            <td><strong>{f(s.net, 4)}</strong></td><td>{f(s.target, 4)} {Math.abs(s.net - s.target) < 1e-9 ? "✓" : "✗"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
                {hess.warnings.length > 0 && <Callout tone="info" title="Assumptions"><ul>{hess.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Callout>}
                {practice ? (
                  <HessCheck answer={hess.total} lines={hess.lines.map((l) => `${l.description === "not used" ? "unused" : l.description} → ${f(l.contribution, 4)} kJ`)} />
                ) : (
                  ws.valid && <Panel subtitle="Each answer uses the equations you entered." title="Why does it behave this way?">{hessLessons(ws.valid).map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}</Panel>
                )}
              </>
            ) : (
              <Callout tone={hess ? "danger" : "info"} title="This set of equations cannot be combined">
                <p>{hess && !hess.ok ? hess.error : "Fix the highlighted values."}</p>
                <p>Hess's law needs balanced equations whose species (with their states) can be added, reversed and scaled to give the target.</p>
              </Callout>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ calorimetry ------------------------------------------------------------------ */}
      {raw.view === "calorimetry" && (
        <div className="gc-layout">
          <Panel className="gc-inputs" subtitle="Temperatures in °C, masses in g, heat capacities in J/(g·K) or J/K." title="Experiment">
            <div className="gc-presets" role="group" aria-label="Type of experiment">
              {CAL_PRESETS.map((p) => <button aria-pressed={raw.calorimetry.mode === p.mode} className={raw.calorimetry.mode === p.mode ? "secondary-button gc-chip is-on" : "secondary-button gc-chip"} key={p.mode} onClick={() => setCal({ mode: p.mode })} type="button">{p.label}</button>)}
            </div>
            {raw.calorimetry.mode === "reaction" && (
              <>
                <NumberField error={errorFor(cErrors, /solution mass/)} label="Mass of solution" onChange={(massG) => setCalPart("reaction", { massG })} unit="g" value={raw.calorimetry.reaction.massG} />
                <NumberField error={errorFor(cErrors, /specific heat/)} label="Specific heat of solution" onChange={(cJgK) => setCalPart("reaction", { cJgK })} unit="J/(g·K)" value={raw.calorimetry.reaction.cJgK} />
                <NumberField error={errorFor(cErrors, /calorimeter heat capacity/)} hint="0 if the calorimeter absorbs a negligible amount" label="Calorimeter heat capacity" onChange={(ccalJK) => setCalPart("reaction", { ccalJK })} unit="J/K" value={raw.calorimetry.reaction.ccalJK} />
                <div className="gc-pair">
                  <NumberField error={errorFor(cErrors, /initial temperature/)} label="Initial T" onChange={(Ti) => setCalPart("reaction", { Ti })} unit="°C" value={raw.calorimetry.reaction.Ti} />
                  <NumberField error={errorFor(cErrors, /final temperature/)} label="Final T" onChange={(Tf) => setCalPart("reaction", { Tf })} unit="°C" value={raw.calorimetry.reaction.Tf} />
                </div>
                <NumberField error={errorFor(cErrors, /moles/)} label="Moles of limiting reagent" onChange={(moles) => setCalPart("reaction", { moles })} unit="mol" value={raw.calorimetry.reaction.moles} />
              </>
            )}
            {raw.calorimetry.mode === "mixing" && (
              <>
                <fieldset className="gc-fieldset"><legend>Sample 1</legend>
                  <NumberField error={errorFor(cErrors, /Mass 1/)} label="Mass 1" onChange={(m1) => setCalPart("mixing", { m1 })} unit="g" value={raw.calorimetry.mixing.m1} />
                  <NumberField error={errorFor(cErrors, /Specific heat 1/)} label="Specific heat 1" onChange={(c1) => setCalPart("mixing", { c1 })} unit="J/(g·K)" value={raw.calorimetry.mixing.c1} />
                  <NumberField error={errorFor(cErrors, /Temperature 1|same temperature/)} label="Temperature 1" onChange={(T1) => setCalPart("mixing", { T1 })} unit="°C" value={raw.calorimetry.mixing.T1} />
                </fieldset>
                <fieldset className="gc-fieldset"><legend>Sample 2</legend>
                  <NumberField error={errorFor(cErrors, /Mass 2/)} label="Mass 2" onChange={(m2) => setCalPart("mixing", { m2 })} unit="g" value={raw.calorimetry.mixing.m2} />
                  <NumberField error={errorFor(cErrors, /Specific heat 2/)} label="Specific heat 2" onChange={(c2) => setCalPart("mixing", { c2 })} unit="J/(g·K)" value={raw.calorimetry.mixing.c2} />
                  <NumberField error={errorFor(cErrors, /Temperature 2/)} label="Temperature 2" onChange={(T2) => setCalPart("mixing", { T2 })} unit="°C" value={raw.calorimetry.mixing.T2} />
                </fieldset>
              </>
            )}
            {raw.calorimetry.mode === "specific-heat" && (
              <>
                <NumberField error={errorFor(cErrors, /metal mass/)} label="Mass of metal" onChange={(mMetal) => setCalPart("specificHeat", { mMetal })} unit="g" value={raw.calorimetry.specificHeat.mMetal} />
                <NumberField error={errorFor(cErrors, /metal's initial/)} label="Metal initial T" onChange={(TMetal) => setCalPart("specificHeat", { TMetal })} unit="°C" value={raw.calorimetry.specificHeat.TMetal} />
                <NumberField error={errorFor(cErrors, /water mass/)} label="Mass of water" onChange={(mWater) => setCalPart("specificHeat", { mWater })} unit="g" value={raw.calorimetry.specificHeat.mWater} />
                <NumberField error={errorFor(cErrors, /water's initial/)} label="Water initial T" onChange={(TWater) => setCalPart("specificHeat", { TWater })} unit="°C" value={raw.calorimetry.specificHeat.TWater} />
                <NumberField error={errorFor(cErrors, /final temperature/)} label="Final T" onChange={(Tf) => setCalPart("specificHeat", { Tf })} unit="°C" value={raw.calorimetry.specificHeat.Tf} />
              </>
            )}
            {cErrors && <Callout tone="danger" title="These values cannot be used"><ul>{cErrors.map((e) => <li key={e}>{e}</li>)}</ul></Callout>}
          </Panel>
          <div className="gc-stage">
            {cal ? (
              <>
                <KeyFigures items={cal.headline.map((h) => ({ label: h.label, value: <span className={h === cal.headline[0] ? "gc-big" : undefined} data-testid={h === cal.headline[0] ? "cal-main" : undefined}>{h.value}</span>, note: h.note }))} />
                {cal.classification !== "none" && <Callout tone="info" title={cal.classification === "exothermic" ? "Exothermic: the reaction releases heat (ΔH < 0)" : "Endothermic: the reaction absorbs heat (ΔH > 0)"}><p>{cal.classification === "exothermic" ? "The surroundings warmed, so the reaction lost energy to them." : "The surroundings cooled, so the reaction took energy from them."}</p></Callout>}
                <Panel subtitle="Every line uses your numbers." title="Energy balance, step by step">
                  <ol className="gc-calc-steps">
                    {cal.steps.map((s) => (
                      <li key={s.label}><span><strong>{s.label}</strong></span><span className="gc-expr">{s.expression}</span>{s.value && <span className="gc-result">= {s.value}</span>}</li>
                    ))}
                  </ol>
                </Panel>
                {cal.warnings.length > 0 && <Callout tone="info" title="Assumptions"><ul>{cal.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Callout>}
                {practice ? (
                  ws.valid && <GcPredictPanel input={ws.valid} onApply={(next) => update(() => next)} scenarios={scenarios} />
                ) : (
                  cv.ok && <Panel subtitle="Each answer uses the numbers for your experiment." title="Why does it behave this way?">{calorimetryLessons(cv.value).map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}</Panel>
                )}
              </>
            ) : (
              <Callout tone="info" title="Enter valid values to see the energy balance"><p>The calculation appears as soon as every field is valid.</p></Callout>
            )}
          </div>
        </div>
      )}

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">
          <li>ΔG° = ΔH° − TΔS°. With ΔCp = 0, ΔH° and ΔS° are constants: reasonable near the temperature where they were measured, increasingly poor far from it, and invalid across any phase change.</li>
          <li>ΔG° and K refer to standard states; the nonstandard ΔG = ΔG° + RT ln Q applies to the mixture you describe with Q.</li>
          <li>ΔG says what is thermodynamically favourable, never how fast. Spontaneous in the thermodynamic sense does not mean quick.</li>
          <li>Hess's law needs balanced equations measured at the same temperature with consistent states. Calorimetry assumes no heat loss and constant specific heats.</li>
        </ul>
      </Panel>
      <RelatedConcepts subject="general" toolId="gcThermo" />
    </div>
  );
}

function HessCheck({ answer, lines }: { answer: number; lines: string[] }) {
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<string | null>(null);
  const guess = Number(text);
  const valid = text.trim() !== "" && Number.isFinite(guess);
  const close = valid && Math.abs(guess - answer) <= Math.max(0.05, Math.abs(answer) * 0.005);
  return (
    <Panel className="gc-predict" subtitle="Work out ΔH of the target yourself, then check it against the model." title="Practice: do the accounting">
      <p className="gc-question">Decide which equations to reverse or scale, add their ΔH values, and enter your total.</p>
      <NumberField label="Your ΔH for the target" onChange={(v) => { setText(Number.isFinite(v) ? String(v) : ""); setChecked(null); }} unit="kJ" value={valid ? guess : NaN} />
      <button className="secondary-button" disabled={!valid} onClick={() => setChecked(text)} type="button">Check my answer</button>
      {checked !== null && (
        <div aria-live="polite" className="gc-reveal">
          <Callout tone={close ? "ok" : "warn"} title={close ? "Matches the model" : "Not quite"}>
            <p>The model gives {f(answer, 4)} kJ (you entered {f(guess, 4)} kJ).</p>
            <ul>{lines.map((l, i) => <li key={i}>Equation {i + 1}: {l}</li>)}</ul>
          </Callout>
        </div>
      )}
    </Panel>
  );
}
