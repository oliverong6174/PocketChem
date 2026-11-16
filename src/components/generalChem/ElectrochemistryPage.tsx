import { useMemo } from "react";
import { RelatedConcepts } from "../ui/RelatedConcepts";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import "../../styles/chem22.css";
import { LineChart, type ChartMarker, type ChartSeries } from "../ui/LineChart";
import { LearningModeSwitch } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GcPredictPanel, NumberField, Paragraphs } from "./shared";
import { QuestionPanel } from "./QuestionPanel";
import { CellDiagram } from "./ElectroDiagrams";
import { halfEquation, sideLabel, speciesLabel } from "../../utils/generalChem/electroLabels";
import { useGcWorkspace } from "./useGcWorkspace";
import { prettyFormula } from "../../utils/generalChem/formula";
import { formatSig } from "../../utils/generalChem/format";
import {
  ELECTROLYSIS_CASES, ELECTRO_LIMITS, FARADAY, buildGalvanicCell, HALF_REACTIONS, halfReaction, nernstAtLog10Q, polarity, solveElectrolysis, standardConditions, usesProtons, variableSpecies, type HalfReaction,
} from "../../utils/generalChem/electrochem";
import { ELECTROLYSIS_SCENARIOS, ELECTRO_ASSUMPTIONS, ELECTRO_PRACTICE, ELECTRO_SCENARIOS, electroGalvanic, electroLessons, summarizeElectro } from "../../utils/generalChem/chem22Learning";
import {
  DEFAULT_ELECTRO_INPUTS, ELECTROCHEM_ENGINE_VERSION, ELECTRO_VIEWS, ELECTRO_VIEW_LABEL, describeElectroAnalysis, validateElectroInputs, validateGcResults22, type ElectroInputs, type ElectroView,
} from "../../utils/persistence/gcTools22";

type Props = { openRequest?: { id: string; recordId: string } | null; onOpenHandled?: (requestId: string) => void };
const g = (v: number, sig = 4) => formatSig(v, sig);
const SORTED = [...HALF_REACTIONS].sort((a, b) => a.E0 - b.E0);

const PRESETS: Array<{ label: string; a: string; b: string; pH?: number }> = [
  { label: "Daniell cell (Zn | Cu)", a: "Zn", b: "Cu" },
  { label: "Copper–silver", a: "Cu", b: "Ag" },
  { label: "Zinc–aluminium (3 : 2)", a: "Zn", b: "Al" },
  { label: "Permanganate–iron(II)", a: "MnO4", b: "Fe3" },
  { label: "Hydrogen electrode–copper", a: "H2", b: "Cu" },
  { label: "Lead–tin (nearly equal)", a: "Pb", b: "Sn" },
];

const solutionText = (h: HalfReaction, values: number[], pH: number): string => {
  const vars = variableSpecies(h);
  const parts = vars.map((v, k) => `${prettyFormula(v.f)}${v.phase === "g" ? ` ${g(values[k], 3)} bar` : ` ${g(values[k], 3)} M`}`);
  if (usesProtons(h)) parts.push(`pH ${g(pH, 3)}`);
  return parts.join(", ");
};
const electrodeText = (h: HalfReaction) => h.electrode.replace(" (illustrative)", "");
const bridgeIons = { cation: "K^+", anion: "NO3^-" } as const;

export default function ElectrochemistryPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<ElectroInputs>({
    page: "electrochem",
    engineVersion: ELECTROCHEM_ENGINE_VERSION,
    defaults: DEFAULT_ELECTRO_INPUTS,
    validateInputs: validateElectroInputs,
    validateResults: validateGcResults22,
    summarize: summarizeElectro,
    describe: describeElectroAnalysis,
    fallbackName: "Electrochemistry analysis",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  const mode = raw.learn.mode;
  const setLearn = (patch: Partial<ElectroInputs["learn"]>) => update((c) => ({ ...c, learn: { ...c.learn, ...patch } }));
  const cell = raw.cell;
  const setCell = (patch: Partial<ElectroInputs["cell"]>) => update((c) => ({ ...c, cell: { ...c.cell, ...patch } }));
  const setHalf = (side: "a" | "b", id: string) => update((c) => ({ ...c, cell: { ...c.cell, [side]: id, [side === "a" ? "ca" : "cb"]: standardConditions(id) } }));
  const setConc = (side: "ca" | "cb", k: number, v: number) => update((c) => ({ ...c, cell: { ...c.cell, [side]: c.cell[side].map((x, j) => (j === k ? v : x)) } }));
  const setElectro = (patch: Partial<ElectroInputs["electro"]>) => update((c) => {
    const electro = { ...c.electro, ...patch };
    const tNow = Math.min(c.tNow, Number.isFinite(electro.tMin) ? Math.max(0, electro.tMin) : c.tNow);
    return { ...c, electro, tNow };
  });

  const built = useMemo(() => electroGalvanic(raw), [raw]);
  const cellCheck = useMemo(() => buildGalvanicCell(raw.cell), [raw.cell]);
  const elec = useMemo(() => solveElectrolysis(raw.electro), [raw.electro]);
  const eAt = useMemo(() => (elec.ok ? solveElectrolysis(raw.electro, raw.tNow) : null), [elec, raw.electro, raw.tNow]);
  const lessons = useMemo(() => (ws.valid ? electroLessons(ws.valid) : []), [ws.valid]);
  const ha = halfReaction(cell.a); const hb = halfReaction(cell.b);
  const eCase = ELECTROLYSIS_CASES.find((c) => c.id === raw.electro.id);

  // cell results for the diagram
  const view = raw.view;
  const galv = built;
  const cathodeSide = galv ? (cell.a === galv.cathode.id ? "a" : "b") : "a";
  const sol = (h: HalfReaction, side: "a" | "b") => solutionText(h, side === "a" ? cell.ca : cell.cb, cell.pH);

  const nernstChart = useMemo(() => {
    if (!galv) return null;
    const A = Math.max(8, Math.ceil(Math.abs(galv.log10K)) + 2);
    const pts = [-A, A].map((x) => ({ x, y: nernstAtLog10Q(galv.E0cell, galv.n, galv.T, x) }));
    const ys = [...pts.map((p) => p.y), galv.E, 0];
    const lo = Math.min(...ys); const hi = Math.max(...ys);
    const pad = (hi - lo) * 0.1 || 0.1;
    const series: ChartSeries[] = [{ id: "E", label: "E = E° − (RT/nF) ln Q", color: "#0b6a72", points: pts }, { id: "zero", label: "E = 0", color: "#94a3b8", dash: "5 4", points: [{ x: -A, y: 0 }, { x: A, y: 0 }] }];
    const markers: ChartMarker[] = [
      ...(Math.abs(galv.log10Q) > 3 ? [{ id: "std", x: 0, y: galv.E0cell, label: "standard state, Q = 1", kind: "info" as const }] : []),
      { id: "now", x: galv.log10Q, y: galv.E, label: Math.abs(galv.log10Q) > 3 ? "your conditions" : `your conditions (E° at Q = 1 is ${g(galv.E0cell)} V)`, kind: "equivalence" },
      ...(Math.abs(galv.log10K) <= A ? [{ id: "k", x: galv.log10K, y: 0, label: "Q = K: E = 0", kind: "half" as const }] : []),
    ];
    return { series, markers, xDomain: [-A, A] as [number, number], yDomain: [lo - pad, hi + pad] as [number, number] };
  }, [galv]);

  const depChart = useMemo(() => {
    if (!elec.ok || !(raw.electro.tMin > 0)) return null;
    const first = elec.value.cathode[0];
    const rate = elec.value.rateGPerMin;
    const T = raw.electro.tMin;
    const series: ChartSeries[] = [{ id: "m", label: `${first.f} formed`, color: "#0b6a72", points: [{ x: 0, y: 0 }, { x: T, y: rate * T }] }];
    return { series, T, ymax: Math.max(rate * T, 1e-12) };
  }, [elec, raw.electro.tMin]);

  const errList: string[] = [];
  if (view === "galvanic" && !cellCheck.ok) errList.push(...cellCheck.errors);
  if (view === "electrolysis" && !elec.ok) errList.push(...elec.errors);
  const valuesFor = (id: string) => { const h = halfReaction(id); return h ? variableSpecies(h).map((v, k) => ({ v, k })) : []; };
  const needPH = (ha && usesProtons(ha)) || (hb && usesProtons(hb));
  const pol = polarity(view === "galvanic" ? "galvanic" : "electrolytic");
  const polOther = polarity(view === "galvanic" ? "electrolytic" : "galvanic");

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Analyze"
        title="Electrochemistry"
        purpose="Build a galvanic cell from curated half-reactions, see the electrodes, electron flow and cell potential, change concentrations with the Nernst equation, and use Faraday's law for electrolysis."
        evidence="model"
        steps={[
          { label: "Pick two half-cells", detail: "Standard reduction potentials decide which is the cathode." },
          { label: "Change the conditions", detail: "Concentrations, gas pressures, pH and temperature move E through Q." },
          { label: "Read the consequences", detail: "ΔG° and K from E°; moles and mass from charge in electrolysis." },
        ]}
        aside={<Badge tone="neutral" title="Equilibrium potentials only: no kinetics, overpotential or current.">thermodynamic model</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch
          blurbs={{ explore: "Inspect the half-cells, electrodes, reactions and electron flow.", practice: "Identify the anode and cathode, calculate potentials, balance electron transfer; answer, then see the working.", challenge: "Predict the change in potential or in product amount before it is shown." }}
          mode={mode}
          modes={["explore", "practice", "challenge"]}
          onChange={(m) => setLearn({ mode: m })}
        />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Potentials are versus the standard hydrogen electrode at 25 °C." title="Cell">
          <Segmented<ElectroView> label="What to work on" onChange={(v) => update((c) => ({ ...c, view: v }))} options={ELECTRO_VIEWS.map((v) => ({ id: v, label: ELECTRO_VIEW_LABEL[v] }))} value={raw.view} />

          {view === "galvanic" ? (
            <>
              <div className="gc-presets" role="group" aria-label="Example cells">
                {PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => update((c) => ({ ...c, cell: { a: p.a, b: p.b, ca: standardConditions(p.a), cb: standardConditions(p.b), pH: 0, TC: 25 } }))} type="button">{p.label}</button>)}
              </div>
              {(["a", "b"] as const).map((side) => {
                const h = side === "a" ? ha : hb;
                const id = side === "a" ? cell.a : cell.b;
                const key = side === "a" ? "ca" : "cb";
                return (
                  <div className="chem-half-pick" key={side}>
                    <div className="chem-select">
                      <label htmlFor={`half-${side}`}>Half-cell {side === "a" ? "1" : "2"}</label>
                      <select id={`half-${side}`} onChange={(e) => setHalf(side, e.target.value)} value={id}>
                        {SORTED.map((x) => <option key={x.id} value={x.id}>{x.name}: E° = {x.E0 > 0 ? "+" : ""}{x.E0} V</option>)}
                      </select>
                    </div>
                    {h ? (
                      <div className="chem-conc-list">
                        {valuesFor(id).map(({ v, k }) => (
                          <NumberField key={`${id}-${v.f}`} label={`${prettyFormula(v.f)}${v.phase === "g" ? " (gas pressure)" : " concentration"}`} onChange={(x) => setConc(key, k, x)} unit={v.phase === "g" ? "bar" : "mol/L"} value={(side === "a" ? cell.ca : cell.cb)[k] ?? NaN} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {needPH ? <NumberField hint="Used by every half-reaction that contains H⁺." label="pH" onChange={(pH) => setCell({ pH })} value={cell.pH} /> : null}
              <NumberField hint={`E° values are for 25 °C and are not corrected for temperature (${ELECTRO_LIMITS.minTC}–${ELECTRO_LIMITS.maxTC} °C).`} label="Temperature" onChange={(TC) => setCell({ TC })} unit="°C" value={cell.TC} />
              <button className="ghost-button" onClick={() => update((c) => ({ ...c, cell: { ...c.cell, ca: standardConditions(c.cell.a), cb: standardConditions(c.cell.b), pH: 0, TC: 25 } }))} type="button">Back to standard conditions</button>
            </>
          ) : (
            <>
              <div className="chem-select">
                <label htmlFor="el-case">Electrolysis (curated cases only)</label>
                <select id="el-case" onChange={(e) => setElectro({ id: e.target.value })} value={raw.electro.id}>
                  {ELECTROLYSIS_CASES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {eCase ? <p className="gc-field-hint">{eCase.setup}</p> : null}
              <NumberField label="Current I" onChange={(I) => setElectro({ I })} unit="A" value={raw.electro.I} />
              <NumberField label="Time t" onChange={(tMin) => setElectro({ tMin })} unit="min" value={raw.electro.tMin} />
              <NumberField hint="The share of the charge that makes the product shown; the rest goes to side reactions." label="Current efficiency" onChange={(eff) => setElectro({ eff })} unit="%" value={raw.electro.eff} />
              <NumberField label="Gas temperature (for gas volumes)" onChange={(TC) => setElectro({ TC })} unit="°C" value={raw.electro.TC} />
              <NumberField label="Gas pressure (for gas volumes)" onChange={(PkPa) => setElectro({ PkPa })} unit="kPa" value={raw.electro.PkPa} />
            </>
          )}
          {errList.length ? <Callout tone="danger" title="These values cannot be used"><ul>{errList.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
        </Panel>

        <div className="gc-stage">
          {view === "galvanic" && galv && ha && hb ? (
            <>
              <Callout tone="info" title={`${galv.cathode.name} is the cathode; ${galv.anode.name} is the anode`}>
                <p data-testid="cell-notation">{electrodeText(galv.anode)} | {sol(galv.anode, cathodeSide === "a" ? "b" : "a")} ‖ {sol(galv.cathode, cathodeSide)} | {electrodeText(galv.cathode)}</p>
                <p data-testid="overall">{sideLabel(galv.reaction.reactants)} → {sideLabel(galv.reaction.products)} (n = {galv.n} electrons)</p>
                {galv.reversedByConditions ? <p><strong>Conditions reverse the standard order:</strong> at standard state the electrodes would swap, but these concentrations favour the direction shown. Here E°cell is negative and the cell potential E is positive.</p> : null}
              </Callout>
              <DiagramFrame caption="Not to scale. Electrons never cross the salt bridge or the solution: ions carry the charge there." label="Galvanic cell" title="The cell">
                <CellDiagram
                  anodeElectrode={electrodeText(galv.anode)}
                  anodeLine={halfEquation(galv.anode.red, galv.anode.ox, galv.anode.n, "right")}
                  anodeSolution={sol(galv.anode, cathodeSide === "a" ? "b" : "a")}
                  bridge={bridgeIons}
                  cathodeElectrode={electrodeText(galv.cathode)}
                  cathodeLine={halfEquation(galv.cathode.ox, galv.cathode.red, galv.cathode.n, "left")}
                  cathodeSolution={sol(galv.cathode, cathodeSide)}
                  kind="galvanic"
                  overall={`${sideLabel(galv.reaction.reactants)} → ${sideLabel(galv.reaction.products)}`}
                  readoutLabel="E (V)"
                  readoutValue={g(galv.E)}
                />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "E° (standard)", value: `${g(galv.E0cell)} V`, note: `E°cathode − E°anode = ${g(galv.cathode.E0)} − (${g(galv.anode.E0)})` },
                { label: "E (these conditions)", value: `${g(galv.E)} V`, note: "Nernst equation" },
                { label: "Electrons n", value: String(galv.n), note: "lowest common multiple of the half-reactions" },
                { label: "Reaction quotient Q", value: g(galv.Q), note: `log₁₀ Q = ${g(galv.log10Q)}` },
                { label: "ΔG°", value: `${g(galv.dG0 / 1000)} kJ/mol`, note: "−nFE°" },
                { label: "ΔG", value: `${g(galv.dG / 1000)} kJ/mol`, note: "−nFE, under these conditions" },
                { label: "K", value: Math.abs(galv.log10K) < 300 ? g(Math.exp(galv.lnK)) : `10^${g(galv.log10K, 4)}`, note: `log₁₀ K = ${g(galv.log10K)}` },
              ]} />
              <Panel subtitle="Each half-reaction is stored as a reduction; the anode half is reversed, and its potential is NOT multiplied by any coefficient." title="Half-cells">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="halves">
                    <thead><tr><th scope="col">Role</th><th scope="col">Couple</th><th scope="col">Reaction at the electrode</th><th scope="col">E° (V)</th><th scope="col">E here (V)</th><th scope="col">Terminal</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Cathode: reduction</th><td>{galv.cathode.name}</td><td>{halfEquation(galv.cathode.ox, galv.cathode.red, galv.cathode.n, "left")}</td><td>{g(galv.cathode.E0)}</td><td>{g(galv.Ecathode)}</td><td>{pol.cathodeSign}</td></tr>
                      <tr><th scope="row">Anode: oxidation</th><td>{galv.anode.name}</td><td>{halfEquation(galv.anode.red, galv.anode.ox, galv.anode.n, "right")}</td><td>{g(galv.anode.E0)} as a reduction; {g(-galv.anode.E0)} as an oxidation</td><td>{g(galv.Eanode)}</td><td>{pol.anodeSign}</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="gc-field-hint">Scaled so the electrons balance: cathode × {galv.reaction.kc}, anode × {galv.reaction.ka}; the potentials stay as they are.</p>
              </Panel>
              {nernstChart ? (
                <DiagramFrame caption="E falls by (RT ln 10)/(nF) for each tenfold increase in Q, reaching 0 at Q = K." label="Potential against Q" title="Cell potential against log Q">
                  <LineChart
                    current={{ x: galv.log10Q, y: galv.E }}
                    formatX={(x) => g(x, 3)}
                    formatY={(y) => g(y, 3)}
                    markers={nernstChart.markers}
                    series={nernstChart.series}
                    title="Cell potential against log Q"
                    valueText={`log Q ${g(galv.log10Q)}, E ${g(galv.E)} V`}
                    xDomain={nernstChart.xDomain}
                    xLabel="log₁₀ Q (reaction quotient)"
                    yDomain={nernstChart.yDomain}
                    yLabel="Cell potential E (V)"
                  />
                </DiagramFrame>
              ) : null}
              <div className="chem-vs">
                <div className="chem-vs-card"><h4>Standard versus these conditions</h4><p>E° = {g(galv.E0cell)} V at 1 mol/L, 1 bar. Here E = {g(galv.E)} V, a change of {g(galv.E - galv.E0cell)} V from Q = {g(galv.Q)}. Concentrations are used in place of activities.</p></div>
                <div className="chem-vs-card"><h4>If this cell were driven (electrolytic)</h4><p>Oxidation stays at the anode, reduction at the cathode, but the anode would be {polOther.anodeSign} and the cathode {polOther.cathodeSign}, and a source of more than {g(galv.E)} V would be needed to run the reaction backwards.</p></div>
                <div className="chem-vs-card"><h4>Electron flow and current</h4><p>Electrons go {pol.electronsFlow}. Conventional current goes {pol.conventionalCurrent}.</p></div>
              </div>
            </>
          ) : null}

          {view === "electrolysis" && elec.ok && eCase ? (
            <>
              <Callout tone="info" title={`${eCase.name}: ${g(elec.value.cathode[0].mol)} mol ${prettyFormula(elec.value.cathode[0].f)} at the cathode`}>
                <p data-testid="electrolysis-summary">Q = I·t = {g(raw.electro.I)} A × {g(raw.electro.tMin * 60)} s = {g(elec.value.Q)} C, which is {g(elec.value.molElectrons)} mol of electrons (F = {g(FARADAY, 7)} C/mol). {eCase.note}</p>
                <p>These are ideal amounts for the stated current efficiency, not what an industrial or laboratory cell would necessarily give.</p>
              </Callout>
              <DiagramFrame caption="Not to scale. The source forces the reaction: the anode is the positive terminal here, and the electrons still travel from anode to cathode through the wire." label="Electrolytic cell" title="The electrolytic cell">
                <CellDiagram
                  anodeElectrode="anode: inert or the plating metal"
                  anodeLine={halfEquation(eCase.anodeOx.left, eCase.anodeOx.right, eCase.anodeOx.n, "right")}
                  anodeSolution=""
                  cathodeElectrode="cathode: where the product forms"
                  cathodeLine={halfEquation(eCase.cathode.ox, eCase.cathode.red, eCase.cathode.n, "left")}
                  cathodeSolution={eCase.setup.split(" with ")[0]}
                  kind="electrolytic"
                  overall={eCase.minVoltage === null ? "minimum voltage: not given for a molten salt" : `minimum applied voltage (thermodynamic) ≈ ${g(eCase.minVoltage)} V`}
                  readoutLabel="source"
                  readoutValue={`I = ${g(raw.electro.I)} A`}
                />
              </DiagramFrame>
              <KeyFigures items={[
                { label: "Charge Q", value: `${g(elec.value.Q)} C`, note: "Q = It" },
                { label: "Electrons", value: `${g(elec.value.molElectrons)} mol`, note: "Q / F" },
                { label: `Cathode: ${prettyFormula(elec.value.cathode[0].f)}`, value: `${g(elec.value.cathode[0].massG)} g`, note: `${g(elec.value.cathode[0].mol)} mol` },
                { label: `Anode: ${prettyFormula(elec.value.anode[0].f)}`, value: `${g(elec.value.anode[0].massG)} g`, note: `${g(elec.value.anode[0].mol)} mol` },
                { label: "Minimum voltage", value: elec.value.minVoltage === null ? "not given" : `${g(elec.value.minVoltage)} V`, note: "thermodynamic only" },
              ]} />
              <Panel subtitle="Per electrode: what forms and what is consumed." title="Electrode products">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table" data-testid="products">
                    <thead><tr><th scope="col">Electrode</th><th scope="col">Species</th><th scope="col">Role</th><th scope="col">Amount (mol)</th><th scope="col">Mass (g)</th><th scope="col">Gas volume (L)</th></tr></thead>
                    <tbody>
                      {[...elec.value.cathode.map((p) => ({ e: "Cathode (−, reduction)", p })), ...elec.value.anode.map((p) => ({ e: "Anode (+, oxidation)", p }))].map(({ e, p }, k) => (
                        <tr key={`${e}-${k}-${p.f}`}><th scope="row">{e}</th><td>{speciesLabel({ f: p.f, nu: 1, phase: p.phase })}</td><td>{p.role}</td><td>{g(p.mol)}</td><td>{g(p.massG)}</td><td>{p.volumeL === null ? "—" : g(p.volumeL)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              {depChart ? (
                <DiagramFrame caption="Ideal deposit against time at constant current and efficiency. Drag the marker or use the arrow keys." label="Deposit against time" title="Product formed against time">
                  <LineChart
                    current={{ x: raw.tNow, y: eAt && eAt.ok ? eAt.value.cathodeMassG : 0 }}
                    formatX={(x) => g(x, 3)}
                    formatY={(y) => g(y, 3)}
                    onXChange={(x) => update((c) => ({ ...c, tNow: Math.max(0, Math.min(c.electro.tMin, Math.round(x * 100) / 100)) }))}
                    series={depChart.series}
                    title="Product formed against time"
                    valueText={`After ${g(raw.tNow)} min: ${g(eAt && eAt.ok ? eAt.value.cathodeMassG : 0)} g`}
                    xDomain={[0, depChart.T]}
                    xLabel="Time (min)"
                    xStep={depChart.T / 100}
                    yDomain={[0, depChart.ymax * 1.08]}
                    yLabel={`Mass of ${elec.value.cathode[0].f} (g)`}
                  />
                </DiagramFrame>
              ) : null}
              <div className="chem-vs">
                <div className="chem-vs-card"><h4>At t = {g(raw.tNow)} min</h4><p>{eAt && eAt.ok ? `${g(eAt.value.cathodeMassG)} g of ${prettyFormula(elec.value.cathode[0].f)} so far (${g(eAt.value.molElectrons)} mol of electrons passed).` : "—"}</p></div>
                <div className="chem-vs-card"><h4>Compared with a galvanic cell</h4><p>Oxidation is at the anode in both. Here the anode is {pol.anodeSign} and the cathode {pol.cathodeSign}; in a galvanic cell it is the other way round. {pol.driver.charAt(0).toUpperCase() + pol.driver.slice(1)}.</p></div>
              </div>
            </>
          ) : null}

          {mode === "practice" ? (
            <QuestionPanel current={raw} index={raw.learn.practice} onIndex={(practice) => setLearn({ practice })} onLoad={(next) => update(() => next)} questions={ELECTRO_PRACTICE} subtitle="Work it out, answer, then check. The answer comes from the same model as the tool." title="Practice" />
          ) : mode === "challenge" ? (
            ws.valid ? <GcPredictPanel input={ws.valid} onApply={(next) => update(() => next)} scenarios={view === "galvanic" ? ELECTRO_SCENARIOS : ELECTROLYSIS_SCENARIOS} /> : <Callout tone="info" title="Nothing to predict here"><p>Challenges need valid settings.</p></Callout>
          ) : lessons.length ? (
            <Panel subtitle="Each answer quotes the numbers for your current cell." title="Why does it behave this way?">
              {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
            </Panel>
          ) : null}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">{ELECTRO_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
      <RelatedConcepts subject="general" toolId="gcElectro" />
    </div>
  );
}
