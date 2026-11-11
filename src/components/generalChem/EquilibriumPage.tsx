import { useMemo, useState } from "react";
import "../../styles/generalChem.css";
import { LineChart, type ChartMarker, type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch, type LearningMode } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, Explanation, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import {
  EQ_LIMITS, VOLUME_FACTOR_RANGE, R_L_BAR, deltaNu, kExpressionText, kpFromKc, lnQ, predictDirection, progressCurve, reactionText,
  solveEquilibrium, validateEquilibrium, applyDisturbance, withInitial,
  type Direction, type EquilibriumSystem, type Species,
} from "../../utils/generalChem/equilibrium";
import {
  conceptLessons, directionExamples, directionSentence, disturbanceLabel, guidedSolution, shiftExplanation, shiftScenarios,
} from "../../utils/generalChem/equilibriumLearning";
import { formatSig } from "../../utils/generalChem/format";
import { summarizeEquilibrium, toDisturbance } from "../../utils/generalChem/toolSummary";
import {
  DEFAULT_EQUILIBRIUM_INPUTS, EQUILIBRIUM_ENGINE_VERSION, describeEquilibriumAnalysis, validateEquilibriumInputs, validateEquilibriumResults,
  type DisturbanceKind, type DisturbanceSpec, type EquilibriumInputs,
} from "../../utils/persistence/generalChemTools";
import { NumberField, Paragraphs, TextField } from "./shared";
import { useGcWorkspace } from "./useGcWorkspace";

type Props = {
  openRequest?: { id: string; recordId: string } | null;
  onOpenHandled?: (requestId: string) => void;
};

const sp = (name: string, coeff: number, c0: number): Species => ({ name, coeff, c0 });
const PRESETS: Array<{ label: string; system: EquilibriumSystem; tempK: number; note: string }> = [
  { label: "N₂O₄ ⇌ 2 NO₂", system: { reactants: [sp("N₂O₄", 1, 0.1)], products: [sp("NO₂", 2, 0)], K: 4.6e-3, phase: "gas" }, tempK: 298.15, note: "Kc ≈ 4.6×10⁻³ near 298 K (textbook value)." },
  { label: "H₂ + I₂ ⇌ 2 HI", system: { reactants: [sp("H₂", 1, 0.1), sp("I₂", 1, 0.1)], products: [sp("HI", 2, 0)], K: 54.3, phase: "gas" }, tempK: 700, note: "Kc = 54.3 is a textbook value near 700 K; Δν = 0." },
  { label: "HA ⇌ H⁺ + A⁻", system: { reactants: [sp("HA", 1, 0.1)], products: [sp("H⁺", 1, 0), sp("A⁻", 1, 0)], K: 1.8e-5, phase: "aqueous" }, tempK: 298.15, note: "A weak acid with Ka = 1.8×10⁻⁵ (acetic-acid scale), ignoring water's own ionization." },
  { label: "A + B ⇌ C (large K)", system: { reactants: [sp("A", 1, 0.1), sp("B", 1, 0.15)], products: [sp("C", 1, 0)], K: 1e6, phase: "aqueous" }, tempK: 298.15, note: "A generic reaction with an illustrative large K; A is limiting." },
  { label: "N₂ + 3 H₂ ⇌ 2 NH₃", system: { reactants: [sp("N₂", 1, 1), sp("H₂", 3, 3)], products: [sp("NH₃", 2, 0)], K: 0.5, phase: "gas" }, tempK: 700, note: "Illustrative K (not a measured value); Δν = −2, so volume matters." },
];

const COLORS = ["#0b6a72", "#b45309", "#6d28d9", "#be123c"];
const DASHES = [undefined, "7 4", "2 4", "10 4 2 4"];
const sup = (n: number) => String(n).split("").map((c) => (c === "-" ? "⁻" : "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(c)])).join("");
const fmt = (v: number) => formatSig(v, 3);
const DIR_TEXT: Record<Direction, string> = { forward: "forward (to the right)", reverse: "reverse (to the left)", none: "no net change" };

const KIND_OPTIONS: Array<{ id: DisturbanceKind; label: string }> = [
  { id: "add", label: "Add a species" },
  { id: "remove", label: "Remove a species" },
  { id: "volume", label: "Change volume" },
  { id: "inert", label: "Add inert gas" },
];

export default function EquilibriumPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<EquilibriumInputs>({
    page: "equilibrium",
    engineVersion: EQUILIBRIUM_ENGINE_VERSION,
    defaults: DEFAULT_EQUILIBRIUM_INPUTS,
    validateInputs: validateEquilibriumInputs,
    validateResults: validateEquilibriumResults,
    summarize: summarizeEquilibrium,
    describe: describeEquilibriumAnalysis,
    fallbackName: "Equilibrium analysis",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  const [mode, setMode] = useState<LearningMode>("explore");
  const [view, setView] = useState<"composition" | "shift">("composition");
  const [probe, setProbe] = useState<number | null>(null);

  const sv = useMemo(() => validateEquilibrium(raw.system), [raw.system]);
  const model = useMemo(() => {
    if (!sv.ok) return null;
    const system = sv.value;
    const result = solveEquilibrium(system);
    const eq = { reactants: result.reactants, products: result.products };
    return { system, result, eq, curve: progressCurve(system, result.xi), lessons: conceptLessons(system, result), guided: guidedSolution(system, result), directions: directionExamples(system), scenarios: shiftScenarios(system, eq) };
  }, [sv]);

  const outcome = useMemo(() => {
    if (!model || !ws.valid) return null;
    return applyDisturbance(model.system, model.eq, toDisturbance(ws.valid.disturbance));
  }, [model, ws.valid]);

  const setSystem = (patch: Partial<EquilibriumSystem>) => { setProbe(null); update((c) => ({ ...c, system: { ...c.system, ...patch } })); };
  const setSpecies = (side: "reactants" | "products", index: number, patch: Partial<Species>) =>
    setSystem({ [side]: raw.system[side].map((s, i) => (i === index ? { ...s, ...patch } : s)) } as Partial<EquilibriumSystem>);
  const setDisturbance = (patch: Partial<DisturbanceSpec>) => update((c) => ({ ...c, disturbance: { ...c.disturbance, ...patch } }));
  const loadPreset = (p: (typeof PRESETS)[number]) => {
    setProbe(null);
    update((c) => ({ ...c, system: structuredClone(p.system), tempK: p.tempK, disturbance: { ...c.disturbance, target: "reactants:0" } }));
  };
  const addSpecies = (side: "reactants" | "products") => {
    const used = new Set([...raw.system.reactants, ...raw.system.products].map((s) => s.name));
    const name = ["A", "B", "C", "D", "E", "F"].find((n) => !used.has(n)) ?? "X";
    setSystem({ [side]: [...raw.system[side], sp(name, 1, 0)] } as Partial<EquilibriumSystem>);
  };
  const removeSpecies = (side: "reactants" | "products", index: number) => {
    setSystem({ [side]: raw.system[side].filter((_, i) => i !== index) } as Partial<EquilibriumSystem>);
    update((c) => ({ ...c, disturbance: { ...c.disturbance, target: "reactants:0" } }));
  };

  const errors = sv.ok ? null : sv.errors;
  const errorFor = (needle: RegExp) => errors?.find((e) => needle.test(e)) ?? null;
  const allSpecies = (system: EquilibriumSystem) => [...system.reactants.map((s, i) => ({ s, side: "reactants" as const, i })), ...system.products.map((s, i) => ({ s, side: "products" as const, i }))];

  const speciesRow = (side: "reactants" | "products", s: Species, i: number) => {
    const title = `${side === "reactants" ? "Reactant" : "Product"} ${i + 1}`;
    return (
      <fieldset className="gc-fieldset gc-species" key={`${side}${i}`}>
        <legend>{title}</legend>
        <TextField error={errorFor(new RegExp(`${title}: the name`))} label={`${title} name`} maxLength={EQ_LIMITS.maxNameLength} onChange={(name) => setSpecies(side, i, { name })} value={s.name} />
        <div className="gc-pair">
          <NumberField error={errorFor(new RegExp(`${title}: the coefficient`))} label={`${title} coefficient`} onChange={(coeff) => setSpecies(side, i, { coeff })} value={s.coeff} />
          <NumberField error={errorFor(new RegExp(`${title}: the initial`))} label={`${title} initial`} onChange={(c0) => setSpecies(side, i, { c0 })} unit="mol/L" value={s.c0} />
        </div>
        {raw.system[side].length > 1 && <button className="ghost-button" onClick={() => removeSpecies(side, i)} type="button">Remove {title.toLowerCase()}</button>}
      </fieldset>
    );
  };

  // ---- derived display values ----------------------------------------------------------------------------------------------------
  const view1 = model && model.curve.length > 0 ? model : null;
  const xiStart = 0;
  const probeXi = view1 ? Math.min(view1.result.xiMax, Math.max(view1.result.xiMin, probe ?? xiStart)) : 0;
  const probeConc = view1
    ? { reactants: view1.system.reactants.map((s) => Math.max(0, s.c0 - s.coeff * probeXi)), products: view1.system.products.map((s) => Math.max(0, s.c0 + s.coeff * probeXi)) }
    : null;
  const probeDir = view1 && probeConc ? predictDirection(view1.system, probeConc) : null;
  const probeQ = view1 && probeConc ? lnQ(view1.system.reactants.map((s, i) => ({ coeff: s.coeff, c: probeConc.reactants[i] })), view1.system.products.map((s, i) => ({ coeff: s.coeff, c: probeConc.products[i] }))) : NaN;

  const series: ChartSeries[] = view1
    ? allSpecies(view1.system).map(({ s, side, i }, idx) => ({
        id: `${side}${i}`,
        label: s.name,
        color: COLORS[idx % COLORS.length],
        dash: DASHES[idx % DASHES.length],
        points: view1.curve.map((p) => ({ x: p.xi, y: (side === "reactants" ? p.reactants : p.products)[i] })),
      }))
    : [];
  const yMax = view1 ? Math.max(...series.flatMap((s) => s.points.map((p) => p.y)), 1e-12) : 1;
  const lnK = model ? Math.log10(model.system.K) : 0;
  const qSeries: ChartSeries[] = view1
    ? [
        { id: "Q", label: "Q", color: "#0b6a72", points: view1.curve.map((p) => ({ x: p.xi, y: Number.isFinite(p.lnQ) ? p.lnQ / Math.LN10 : Number.NaN })) },
        { id: "K", label: "K", color: "#475569", dash: "7 4", points: [{ x: view1.result.xiMin, y: lnK }, { x: view1.result.xiMax, y: lnK }] },
      ]
    : [];
  const qMarkers: ChartMarker[] = view1 ? [{ id: "eq", kind: "equivalence", label: "Q = K", x: view1.result.xi, y: lnK }] : [];

  const kp = model && model.system.phase === "gas" ? kpFromKc(model.system.K, deltaNu(model.system), raw.tempK) : null;
  const dn = model ? deltaNu(model.system) : 0;
  const practice = mode === "practice";

  return (
    <div className="gc-page">
      <ToolHeader
        group="Analyze"
        title="Chemical equilibrium"
        purpose="Compare Q with K, solve the equilibrium composition with an ICE table, and see how adding or removing species or changing the volume shifts it."
        evidence="model"
        steps={[
          { label: "Define the reaction", detail: "Up to 2 reactants, 2 products, and K." },
          { label: "Set starting amounts", detail: "The tool compares Q with K and solves for the extent." },
          { label: "Disturb it", detail: "Add, remove or change volume, then see the shift." },
        ]}
        aside={<Badge tone="neutral" title="Ideal behaviour, constant temperature. See the assumptions below.">Ideal · constant T</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <Segmented<"composition" | "shift">
          label="Analysis"
          onChange={setView}
          options={[{ id: "composition", label: "Equilibrium composition" }, { id: "shift", label: "Disturb (Le Châtelier)" }]}
          value={view}
        />
        <LearningModeSwitch mode={mode} modes={["explore", "practice"]} onChange={setMode} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Coefficients are whole numbers 1–6; concentrations in mol/L." title="Reaction">
          <div className="gc-presets" role="group" aria-label="Example reactions">
            {PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => loadPreset(p)} title={p.note} type="button">{p.label}</button>)}
          </div>
          <Segmented<EquilibriumSystem["phase"]>
            label="Phase"
            onChange={(phase) => setSystem({ phase })}
            options={[{ id: "gas", label: "Gas" }, { id: "aqueous", label: "Solution" }]}
            value={raw.system.phase}
          />
          {raw.system.reactants.map((s, i) => speciesRow("reactants", s, i))}
          {raw.system.reactants.length < 2 && <button className="ghost-button" onClick={() => addSpecies("reactants")} type="button">Add a second reactant</button>}
          {raw.system.products.map((s, i) => speciesRow("products", s, i))}
          {raw.system.products.length < 2 && <button className="ghost-button" onClick={() => addSpecies("products")} type="button">Add a second product</button>}
          <NumberField
            error={errorFor(/^K must/)}
            hint={model ? kExpressionText(model.system) : undefined}
            label="Equilibrium constant K (Kc)"
            onChange={(K) => setSystem({ K })}
            value={raw.system.K}
          />
          {raw.system.phase === "gas" && (
            <NumberField
              error={raw.tempK >= 50 && raw.tempK <= 6000 ? null : "Use a temperature from 50 to 6000 K."}
              hint="Used only to convert Kc to Kp. It does not change Kc."
              label="Temperature" onChange={(tempK) => update((c) => ({ ...c, tempK }))} unit="K" value={raw.tempK}
            />
          )}
          {errors && <Callout tone="danger" title="These values cannot be used"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout>}
          {sv.ok && sv.warnings.length > 0 && <Callout tone="warn" title="Check these assumptions"><ul>{sv.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Callout>}
        </Panel>

        <div className="gc-stage">
          {!model ? (
            <Callout tone="info" title="Enter valid values to see the equilibrium"><p>The composition, ICE table and explanations appear as soon as every field is valid.</p></Callout>
          ) : view === "composition" ? (
            <>
              <KeyFigures
                items={[
                  { label: "Reaction", value: <span className="gc-reaction">{reactionText(model.system)}</span>, note: kExpressionText(model.system) },
                  { label: "Q₀ versus K", value: model.result.Q0 === null ? "Q₀ undefined" : `${fmt(model.result.Q0)} vs ${fmt(model.system.K)}`, note: `Net reaction: ${DIR_TEXT[model.result.direction]}` },
                  { label: "Extent ξ", value: `${fmt(model.result.xi)} mol/L`, note: `Allowed range ${fmt(model.result.xiMin)} to ${fmt(model.result.xiMax)}` },
                  { label: "Check", value: `Q = ${Number.isFinite(model.result.Qeq) ? fmt(model.result.Qeq) : "—"}`, note: "recomputed from the answer; equals K" },
                ]}
              />

              {view1 ? (
                <DiagramFrame
                  caption={`Progress ξ = ${fmt(probeXi)} mol/L. Drag on the graph, use the arrow keys, or move the slider; the equilibrium is where the amounts stop changing.`}
                  label="Equilibrium composition"
                  legend={<Legend items={[...allSpecies(view1.system).map(({ s }, idx) => ({ label: s.name, color: COLORS[idx % COLORS.length], kind: (DASHES[idx % DASHES.length] ? "dashed" : "line") as "line" | "dashed" })), { label: "Selected progress", color: "#be123c", kind: "dashed" as const }, { label: "Equilibrium", color: "#b45309" }]} />}
                  title="Composition against reaction progress"
                >
                  <LineChart
                    current={{ x: probeXi, y: probeConc!.reactants[0] }}
                    formatX={(x) => String(Number(x.toPrecision(3)))}
                    formatY={(y) => String(Number(y.toPrecision(2)))}
                    markers={[{ id: "eq", kind: "equivalence", label: "Equilibrium", x: view1.result.xi, y: allSpecies(view1.system).map(({ side, i }) => (side === "reactants" ? view1.result.reactants : view1.result.products)[i])[0] }]}
                    onXChange={(x) => setProbe(x)}
                    series={series}
                    title="Concentrations against reaction progress"
                    valueText={`Progress ${fmt(probeXi)} mol/L: ${allSpecies(view1.system).map(({ s, side, i }) => `${s.name} ${fmt((side === "reactants" ? probeConc!.reactants : probeConc!.products)[i])}`).join(", ")}; ${probeDir ? DIR_TEXT[probeDir.direction] : ""}`}
                    xDomain={[view1.result.xiMin, view1.result.xiMax]}
                    xLabel="Reaction progress ξ (mol/L); negative = reverse of the equation"
                    xStep={(view1.result.xiMax - view1.result.xiMin) / 400}
                    yDomain={[0, yMax * 1.05]}
                    yLabel="Concentration (mol/L)"
                  />
                </DiagramFrame>
              ) : (
                <Callout tone="info" title="Nothing can react"><p>{directionSentence("none", null, model.system.K)} Give a reactant and a product a non-zero amount, or a reactant a non-zero amount alone.</p></Callout>
              )}

              {view1 && probeConc && probeDir && (
                <>
                  <div className="gc-slider">
                    <label htmlFor="gc-xi-slider">Reaction progress: <strong>{fmt(probeXi)} mol/L</strong></label>
                    <input
                      aria-valuetext={`ξ = ${fmt(probeXi)} mol/L; Q is ${Number.isFinite(probeQ) ? (Math.abs(probeQ / Math.LN10 - lnK) < 1e-9 ? "equal to" : probeQ / Math.LN10 < lnK ? "below" : "above") : "undefined relative to"} K`}
                      id="gc-xi-slider"
                      max={view1.result.xiMax}
                      min={view1.result.xiMin}
                      onChange={(event) => setProbe(Number(event.target.value))}
                      step={(view1.result.xiMax - view1.result.xiMin) / 1000}
                      type="range"
                      value={probeXi}
                    />
                    <div className="gc-jumps" role="group" aria-label="Jump to a point">
                      <button className="secondary-button gc-chip" onClick={() => setProbe(0)} type="button">Start</button>
                      <button className="secondary-button gc-chip" onClick={() => setProbe(view1.result.xi)} type="button">Equilibrium</button>
                    </div>
                  </div>
                  <Callout tone={probeDir.direction === "none" ? "ok" : "info"} title={`At this progress: ${probeDir.direction === "none" ? "Q = K (equilibrium)" : probeDir.direction === "forward" ? "Q < K" : "Q > K"}`}>
                    <p>
                      {allSpecies(view1.system).map(({ s, side, i }) => `[${s.name}] = ${fmt((side === "reactants" ? probeConc.reactants : probeConc.products)[i])}`).join(", ")} mol/L.{" "}
                      Q = {Number.isFinite(probeQ) ? fmt(Math.exp(probeQ)) : "0 or undefined"}, K = {fmt(model.system.K)}: {probeDir.direction === "none" ? "no net change from here." : `the net reaction would go ${DIR_TEXT[probeDir.direction]}.`}
                    </p>
                  </Callout>

                  <DiagramFrame
                    caption="Q rises with progress and crosses K exactly once: that crossing is the equilibrium. Plotted as log₁₀."
                    label="Q against K"
                    legend={<Legend items={[{ label: "log₁₀ Q", color: "#0b6a72", kind: "line" }, { label: "log₁₀ K (fixed)", color: "#475569", kind: "dashed" }, { label: "Selected progress", color: "#be123c", kind: "dashed" }]} />}
                    title="Reaction quotient against progress"
                  >
                    <LineChart
                      current={{ x: probeXi, y: Number.isFinite(probeQ) ? probeQ / Math.LN10 : lnK }}
                      formatX={(x) => String(Number(x.toPrecision(3)))}
                      formatY={(y) => `10${sup(Math.round(y))}`}
                      markers={qMarkers}
                      onXChange={(x) => setProbe(x)}
                      series={qSeries}
                      title="log Q against reaction progress, with the fixed K"
                      valueText={`ξ = ${fmt(probeXi)} mol/L`}
                      xDomain={[view1.result.xiMin, view1.result.xiMax]}
                      xLabel="Reaction progress ξ (mol/L)"
                      xStep={(view1.result.xiMax - view1.result.xiMin) / 400}
                      yDomain={[lnK - 6, lnK + 6]}
                      yLabel="Q (log scale)"
                      yTickStep={2}
                    />
                  </DiagramFrame>
                </>
              )}

              <Panel subtitle="Initial + Change = Equilibrium for every species (mol/L)." title="ICE table">
                <table className="gc-table gc-ice">
                  <caption className="visually-hidden">Initial, change and equilibrium concentrations</caption>
                  <thead><tr><th scope="col">Species</th><th scope="col">Initial</th><th scope="col">Change</th><th scope="col">Equilibrium</th></tr></thead>
                  <tbody>
                    {allSpecies(model.system).map(({ s, side, i }) => {
                      const eqC = (side === "reactants" ? model.result.reactants : model.result.products)[i];
                      const change = eqC - s.c0;
                      return (
                        <tr key={`${side}${i}`}>
                          <th scope="row">{s.name} <span className="gc-unit">({side === "reactants" ? "reactant" : "product"}, ν = {s.coeff})</span></th>
                          <td>{fmt(s.c0)}</td>
                          <td>{change === 0 ? "0" : `${change > 0 ? "+" : "−"}${fmt(Math.abs(change))}`}</td>
                          <td><strong>{fmt(eqC)}</strong></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Panel>

              {kp !== null && (
                <Panel subtitle="Gas-phase systems only. Concentration basis (mol/L) versus pressure basis (bar)." title="Kc and Kp">
                  <p className="gc-eq-line">Kp = Kc (RT)<sup>Δν</sup> with R = {R_L_BAR.toFixed(5)} L·bar/(mol·K), Δν = {dn > 0 ? "+" : ""}{dn}, T = {fmt(raw.tempK)} K</p>
                  <p>Kc = {fmt(model.system.K)} → Kp = <strong>{fmt(kp)}</strong> (dimensionless, standard pressure 1 bar, ideal gases). When Δν = 0, Kp = Kc. Kp changes with temperature; this conversion uses the temperature you entered and nothing else.</p>
                </Panel>
              )}

              <Disclosure summary="Worked solution: the ICE method step by step" hint="Uses your numbers">
                {model.guided.map((step) => (
                  <div className="gc-step" key={step.title}><h4>{step.title}</h4>{step.lines.map((l) => <p key={l}>{l}</p>)}</div>
                ))}
              </Disclosure>

              {practice ? (
                <DirectionPractice
                  examples={model.directions}
                  system={model.system}
                  onLoad={(ex) => { setProbe(null); update((c) => ({ ...c, system: withInitial(c.system, { reactants: ex.reactants, products: ex.products }) })); }}
                />
              ) : (
                <Panel subtitle="Each answer uses the numbers for the reaction you have set up." title="Why does it behave this way?">
                  {model.lessons.map((lesson) => <Disclosure key={lesson.id} summary={lesson.title}><Paragraphs items={lesson.body} /></Disclosure>)}
                </Panel>
              )}
            </>
          ) : (
            <ShiftView
              mode={mode}
              model={model}
              onApply={(spec) => update((c) => ({ ...c, disturbance: { ...c.disturbance, ...spec } }))}
              outcome={outcome}
              raw={raw}
              setDisturbance={setDisturbance}
            />
          )}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">
          <li>One reaction, 1–2 reactants and 1–2 products with whole-number coefficients; every species is an ideal gas or ideal solute with activity equal to concentration.</li>
          <li>Pure solids, pure liquids and solvents are left out of K and are not supported. Coupled or simultaneous equilibria are not supported.</li>
          <li>Constant temperature: K is fixed. The effect of temperature on K is not modelled here because it needs ΔH° (see the Thermodynamics tool for K from ΔG°).</li>
          <li>The solution is the unique root with every concentration non-negative, found numerically; the check line shows Q recomputed from it.</li>
        </ul>
      </Panel>
    </div>
  );
}

// ---- Which way does it go? (Q versus K) -------------------------------------------------------------------------------------------------------

function DirectionPractice({ examples, system, onLoad }: {
  examples: ReturnType<typeof directionExamples>; system: EquilibriumSystem; onLoad: (e: ReturnType<typeof directionExamples>[number]) => void;
}) {
  const [index, setIndex] = useState(0);
  const key = `${index}|${JSON.stringify(system)}`;
  const [answer, setAnswer] = useState<{ key: string; guess: Direction } | null>(null);
  const guess = answer?.key === key ? answer.guess : null;
  const ex = examples[Math.min(index, examples.length - 1)];
  return (
    <Panel className="gc-predict" subtitle="Compare Q with K before you look at the answer." title="Practice: which way does it go?">
      <div className="gc-scenario-pick" role="group" aria-label="Choose a starting mixture">
        {examples.map((e, i) => <button aria-pressed={i === index} className={i === index ? "secondary-button is-on" : "ghost-button"} key={e.id} onClick={() => setIndex(i)} type="button">Mixture {i + 1}</button>)}
      </div>
      <p className="gc-question">
        Mixture {index + 1}: {system.reactants.map((s, i) => `[${s.name}] = ${fmt(ex.reactants[i])}`).join(", ")}, {system.products.map((s, i) => `[${s.name}] = ${fmt(ex.products[i])}`).join(", ")} mol/L, with K = {fmt(system.K)}. Which way does the net reaction go?
      </p>
      <Segmented<Direction>
        label="Your prediction"
        onChange={(next) => setAnswer({ key, guess: next })}
        options={[{ id: "forward", label: "Forward (right)" }, { id: "reverse", label: "Reverse (left)" }, { id: "none", label: "Already at equilibrium" }]}
        value={(guess ?? "") as Direction}
      />
      {guess && (
        <div aria-live="polite" className="gc-reveal">
          <Callout tone={guess === ex.direction ? "ok" : "warn"} title={guess === ex.direction ? "Correct" : "Not quite"}>
            <p>Q = {fmt(ex.Q)} ({ex.label}) and K = {fmt(system.K)}. {directionSentence(ex.direction, ex.Q, system.K)}</p>
            <button className="ghost-button" onClick={() => onLoad(ex)} type="button">Load this mixture into the tool</button>
          </Callout>
        </div>
      )}
    </Panel>
  );
}

// ---- Le Châtelier view --------------------------------------------------------------------------------------------------------------------

function ShiftView({ mode, model, outcome, raw, setDisturbance, onApply }: {
  mode: LearningMode;
  model: { system: EquilibriumSystem; result: ReturnType<typeof solveEquilibrium>; eq: { reactants: number[]; products: number[] }; scenarios: ReturnType<typeof shiftScenarios> };
  outcome: ReturnType<typeof applyDisturbance> | null;
  raw: EquilibriumInputs;
  setDisturbance: (patch: Partial<DisturbanceSpec>) => void;
  onApply: (spec: Partial<DisturbanceSpec>) => void;
}) {
  const d = raw.disturbance;
  const list = [...model.system.reactants.map((s, i) => ({ id: `reactants:${i}`, label: s.name })), ...model.system.products.map((s, i) => ({ id: `products:${i}`, label: s.name }))];
  const names = list.map((x) => x.label);
  const [side, idx] = d.target.split(":");
  const targetConc = ((side === "reactants" ? model.eq.reactants : model.eq.products)[Number(idx)]) ?? 0;
  const [pick, setPick] = useState(0);
  const [guess, setGuess] = useState<{ key: string; value: Direction } | null>(null);
  const scenarioKey = `${pick}|${JSON.stringify(model.system)}`;
  const scenario = model.scenarios[Math.min(pick, model.scenarios.length - 1)];
  const guessed = guess?.key === scenarioKey ? guess.value : null;

  const all = [...model.system.reactants.map((s, i) => ({ name: s.name, before: model.eq.reactants[i], imm: outcome?.ok ? outcome.immediate.reactants[i] : NaN, after: outcome?.ok ? outcome.after.reactants[i] : NaN })), ...model.system.products.map((s, i) => ({ name: s.name, before: model.eq.products[i], imm: outcome?.ok ? outcome.immediate.products[i] : NaN, after: outcome?.ok ? outcome.after.products[i] : NaN }))];
  const maxC = Math.max(1e-12, ...all.flatMap((x) => [x.before, x.imm, x.after].filter(Number.isFinite)));
  const bar = (v: number) => (Number.isFinite(v) ? <span aria-hidden="true" className="gc-bar" style={{ width: `${Math.max(1, (v / maxC) * 100)}%` }} /> : null);

  return (
    <>
      <Panel subtitle="The system starts at the equilibrium on the previous tab; K is fixed by temperature." title="Disturbance">
        <Segmented<DisturbanceKind> label="Type of disturbance" onChange={(kind) => setDisturbance({ kind })} options={KIND_OPTIONS} value={d.kind} />
        {(d.kind === "add" || d.kind === "remove") && (
          <>
            <Segmented<string> label="Species" onChange={(target) => setDisturbance({ target })} options={list.map((x) => ({ id: x.id, label: x.label }))} value={d.target} />
            <NumberField
              error={outcome && !outcome.ok ? outcome.reason : null}
              hint={d.kind === "remove" ? `Present at equilibrium: ${fmt(targetConc)} mol/L` : undefined}
              label={`${d.kind === "add" ? "Amount to add" : "Amount to remove"} (${names[Number(idx) + (side === "products" ? model.system.reactants.length : 0)] ?? ""})`}
              onChange={(amount) => setDisturbance({ amount })}
              unit="mol/L"
              value={d.amount}
            />
          </>
        )}
        {d.kind === "volume" && (
          <>
            <NumberField
              error={outcome && !outcome.ok ? outcome.reason : null}
              hint={`New volume ÷ old volume, from ${VOLUME_FACTOR_RANGE[0]} to ${VOLUME_FACTOR_RANGE[1]}. Above 1 expands; below 1 compresses.`}
              label="Volume factor V₂/V₁" onChange={(factor) => setDisturbance({ factor })} value={d.factor}
            />
            <div className="gc-slider">
              <label htmlFor="gc-vol-slider">Volume factor on a log scale</label>
              <input id="gc-vol-slider" max={Math.log2(VOLUME_FACTOR_RANGE[1])} min={Math.log2(VOLUME_FACTOR_RANGE[0])} onChange={(e) => setDisturbance({ factor: Number((2 ** Number(e.target.value)).toPrecision(4)) })} step={0.02} type="range" value={Math.log2(Math.min(VOLUME_FACTOR_RANGE[1], Math.max(VOLUME_FACTOR_RANGE[0], d.factor)))} />
              <div className="gc-jumps"><button className="secondary-button gc-chip" onClick={() => setDisturbance({ factor: 0.5 })} type="button">Compress ×0.5</button><button className="secondary-button gc-chip" onClick={() => setDisturbance({ factor: 2 })} type="button">Expand ×2</button></div>
            </div>
          </>
        )}
      </Panel>

      {outcome && outcome.ok ? (
        <>
          <KeyFigures
            items={[
              { label: "Q right after", value: outcome.QImmediate === null ? "0 or undefined" : fmt(outcome.QImmediate), note: `K = ${fmt(outcome.K)} (unchanged)` },
              { label: "Net shift", value: outcome.shift === "none" ? "None" : outcome.shift === "forward" ? "To the right" : "To the left", note: outcome.shift === "none" ? "Q = K" : outcome.shift === "forward" ? "Q < K: toward products" : "Q > K: toward reactants" },
              { label: "New Q", value: Number.isFinite(outcome.after.Qeq) ? fmt(outcome.after.Qeq) : "—", note: "equals K again" },
            ]}
          />
          <Panel subtitle="mol/L. Bars are scaled to the largest value shown." title="Before, right after, and the new equilibrium">
            <table className="gc-table gc-shift-table">
              <caption className="visually-hidden">Concentrations before the disturbance, immediately after it, and at the new equilibrium</caption>
              <thead><tr><th scope="col">Species</th><th scope="col">Old equilibrium</th><th scope="col">Right after</th><th scope="col">New equilibrium</th></tr></thead>
              <tbody>
                {all.map((x) => (
                  <tr key={x.name}>
                    <th scope="row">{x.name}</th>
                    <td>{fmt(x.before)}{bar(x.before)}</td>
                    <td>{fmt(x.imm)}{bar(x.imm)}</td>
                    <td><strong>{fmt(x.after)}</strong>{bar(x.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Explanation title={`${disturbanceLabel(model.system, toDisturbance(d))[0].toUpperCase()}${disturbanceLabel(model.system, toDisturbance(d)).slice(1)}`}>
            <Paragraphs items={shiftExplanation(model.system, outcome)} />
          </Explanation>
        </>
      ) : (
        outcome && <Callout tone="danger" title="This disturbance cannot be applied"><p>{outcome.reason}</p></Callout>
      )}

      {mode === "practice" && scenario && (
        <Panel className="gc-predict" subtitle="Decide the direction of the shift, then compare with the model." title="Practice: predict the shift">
          <div className="gc-scenario-pick" role="group" aria-label="Choose a disturbance">
            {model.scenarios.map((s, i) => <button aria-pressed={i === pick} className={i === pick ? "secondary-button is-on" : "ghost-button"} key={s.id} onClick={() => setPick(i)} type="button">{s.label}</button>)}
          </div>
          <p className="gc-question">The system is at equilibrium. If you <strong>{scenario.label}</strong>, which way does the net reaction go?</p>
          <Segmented<Direction>
            label="Your prediction"
            onChange={(value) => setGuess({ key: scenarioKey, value })}
            options={[{ id: "forward", label: "Right (more products)" }, { id: "reverse", label: "Left (more reactants)" }, { id: "none", label: "No shift" }]}
            value={(guessed ?? "") as Direction}
          />
          {guessed && (
            <div aria-live="polite" className="gc-reveal">
              <Callout tone={guessed === scenario.answer ? "ok" : "warn"} title={guessed === scenario.answer ? "Your prediction matches the model" : "Not quite"}>
                <Paragraphs items={shiftExplanation(model.system, scenario.outcome)} />
                <button
                  className="ghost-button"
                  onClick={() => {
                    const x = scenario.disturbance;
                    onApply(x.kind === "volume" ? { kind: "volume", factor: x.factor } : x.kind === "inert" ? { kind: "inert" } : { kind: x.kind, target: `${x.side}:${x.index}`, amount: x.amount });
                  }}
                  type="button"
                >
                  Apply this disturbance to the tool
                </button>
              </Callout>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
