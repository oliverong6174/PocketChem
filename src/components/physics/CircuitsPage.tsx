import { useMemo, useState } from "react";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import { LearningModeSwitch, type LearningMode } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import { GcPredictPanel, NumberField, Paragraphs, TextField } from "../generalChem/shared";
import { useGcWorkspace } from "../generalChem/useGcWorkspace";
import {
  addResistor, analyzeCircuit, CIRCUIT_LIMITS, CIRCUIT_PRESETS, describeStructure, removeNode, resistorsOf, setLabel, setResistance, toggleGroupKind,
  validateCircuit, type Circuit, type CircuitNode,
} from "../../utils/physics/circuits";
import { fmt, formatSI } from "../../utils/physics/format";
import { circuitLessons, circuitScenarios } from "../../utils/physics/physicsLearning";
import { CIRCUITS_ASSUMPTIONS, summarizeCircuits } from "../../utils/physics/physicsSummary";
import {
  CIRCUITS_ENGINE_VERSION, DEFAULT_CIRCUITS_INPUTS, describeCircuitsAnalysis, validateCircuitsInputs, validatePhysicsResults, type CircuitsInputs,
} from "../../utils/persistence/physicsTools";
import { CircuitDiagram } from "./CircuitDiagram";

type Props = {
  openRequest?: { id: string; recordId: string } | null;
  onOpenHandled?: (requestId: string) => void;
};

export default function CircuitsPage({ openRequest = null, onOpenHandled }: Props) {
  const ws = useGcWorkspace<CircuitsInputs>({
    page: "circuits",
    engineVersion: CIRCUITS_ENGINE_VERSION,
    defaults: DEFAULT_CIRCUITS_INPUTS,
    validateInputs: validateCircuitsInputs,
    validateResults: validatePhysicsResults,
    summarize: summarizeCircuits,
    describe: describeCircuitsAnalysis,
    fallbackName: "Circuit analysis",
    openRequest,
    onOpenHandled,
  });
  const { raw, update } = ws;
  const [mode, setMode] = useState<LearningMode>("explore");
  const circuitCheck = useMemo(() => validateCircuit(raw.circuit), [raw.circuit]);
  const errors = circuitCheck.ok ? null : circuitCheck.errors;
  const circuit: Circuit | null = circuitCheck.ok ? circuitCheck.value : null;
  const analysis = useMemo(() => (circuit ? analyzeCircuit(circuit) : null), [circuit]);
  const selected = raw.selected && analysis?.byId[raw.selected] ? raw.selected : null;

  const edit = (fn: (c: Circuit) => Circuit) => update((cur) => {
    const next = fn(cur.circuit);
    // an element that disappeared can no longer be selected
    const stillThere = cur.selected !== null && (function has(n: CircuitNode): boolean { return n.id === cur.selected || (n.kind !== "resistor" && n.children.some(has)); })(next.root);
    return { ...cur, circuit: next, selected: stillThere ? cur.selected : null };
  });
  const select = (id: string | null) => update((cur) => ({ ...cur, selected: id }));

  const practice = mode === "practice";
  const practiceInput = useMemo(() => (ws.valid ? { ...ws.valid, selected: null } : null), [ws.valid?.circuit]); // eslint-disable-line react-hooks/exhaustive-deps
  const scenarios = useMemo(() => (practiceInput ? circuitScenarios(practiceInput) : []), [practiceInput]);
  const lessons = useMemo(() => (ws.valid ? circuitLessons(ws.valid) : []), [ws.valid]);
  const sel = selected && analysis ? analysis.byId[selected] : null;

  return (
    <div className="gc-page ph-page">
      <ToolHeader
        group="Analyze"
        title="DC circuits"
        purpose="Build a series and parallel network of resistors, change a value, and see the equivalent resistance, every current, voltage drop and power update on the diagram."
        evidence="model"
        steps={[
          { label: "Build the network", detail: "Add resistors, group them in series or parallel." },
          { label: "Select a component", detail: "Click it in the diagram or the table." },
          { label: "Check Kirchhoff", detail: "Currents add at junctions; drops add around loops." },
        ]}
        aside={<Badge tone="neutral" title="Ideal DC source and resistors; series/parallel networks only.">Ideal · series/parallel only</Badge>}
      />
      {ws.chrome}
      <div className="gc-toolbar">
        <LearningModeSwitch mode={mode} modes={["explore", "practice"]} onChange={setMode} />
        {ws.actions}
      </div>
      {ws.saveFormEl}

      <div className="gc-layout">
        <Panel className="gc-inputs" subtitle="Each group joins its parts in series (one path) or in parallel (side by side)." title="Circuit">
          <div className="gc-presets" role="group" aria-label="Example circuits">
            {CIRCUIT_PRESETS.map((p) => <button className="secondary-button gc-chip" key={p.label} onClick={() => update((c) => ({ ...c, circuit: structuredClone(p.circuit), selected: null }))} type="button">{p.label}</button>)}
          </div>
          <NumberField
            error={errors?.find((e) => /Source voltage/.test(e)) ?? null}
            hint={`Ideal DC source, 0 < V ≤ ${CIRCUIT_LIMITS.maxV} V.`}
            label="Source voltage"
            onChange={(voltage) => update((c) => ({ ...c, circuit: { ...c.circuit, voltage } }))}
            unit="V"
            value={raw.circuit.voltage}
          />
          <div className="ph-vslider gc-slider">
            <label htmlFor="ph-v-slider">Adjust voltage: <strong>{fmt(raw.circuit.voltage)} V</strong></label>
            <input id="ph-v-slider" max={48} min={1} onChange={(e) => update((c) => ({ ...c, circuit: { ...c.circuit, voltage: Number(e.target.value) } }))} step={0.5} type="range" value={Math.min(48, Math.max(1, Number.isFinite(raw.circuit.voltage) ? raw.circuit.voltage : 1))} />
          </div>
          <NodeEditor
            errors={errors}
            node={raw.circuit.root}
            onAdd={(id, kind) => edit((c) => addResistor(c, id, kind, 100))}
            onKind={(id) => edit((c) => toggleGroupKind(c, id))}
            onLabel={(id, label) => edit((c) => setLabel(c, id, label))}
            onOhms={(id, ohms) => edit((c) => setResistance(c, id, ohms))}
            onRemove={(id) => edit((c) => removeNode(c, id))}
            onSelect={select}
            root
            selected={selected}
            total={resistorsOf(raw.circuit.root).length}
          />
          {errors ? <Callout tone="danger" title="This circuit cannot be analysed"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout> : null}
          <p className="gc-field-hint">Up to {CIRCUIT_LIMITS.maxResistors} resistors, {CIRCUIT_LIMITS.minR} Ω to {CIRCUIT_LIMITS.maxR} Ω, nested {CIRCUIT_LIMITS.maxDepth} levels. Networks that are not series/parallel (a bridge, for example) cannot be built here.</p>
        </Panel>

        <div className="gc-stage">
          {circuit && analysis ? (
            <>
              <DiagramFrame
                caption="Conventional current leaves the + terminal and flows left to right through the network. Each resistor is marked + on the side the current enters; V is the drop in the direction of the current."
                label="Circuit diagram"
                legend={<Legend items={[{ label: "Current direction", color: "#be123c", kind: "line" }, { label: "Selected component", color: "#b45309", kind: "box" }]} />}
                title={`Circuit: ${describeStructure(circuit.root)}`}
              >
                <CircuitDiagram analysis={analysis} circuit={circuit} onSelect={select} selected={selected} />
              </DiagramFrame>

              <KeyFigures
                items={[
                  { label: "Equivalent resistance", value: formatSI(analysis.equivalent, "Ω"), note: describeStructure(circuit.root) },
                  { label: "Source current", value: formatSI(analysis.current, "A"), note: `I = V / R_eq = ${fmt(circuit.voltage)} V / ${formatSI(analysis.equivalent, "Ω")}` },
                  { label: "Source power", value: formatSI(analysis.power, "W"), note: "P = V · I" },
                  { label: "Power in the resistors", value: formatSI(analysis.resistors.reduce((s, r) => s + r.power, 0), "W"), note: "equals the source power" },
                ]}
              />

              {sel ? (
                <Panel subtitle="Selected in the diagram or the table." title={`Inspector: ${sel.label}`}>
                  <KeyFigures
                    items={[
                      { label: sel.kind === "resistor" ? "Resistance" : "Equivalent resistance", value: formatSI(sel.resistance, "Ω") },
                      { label: "Voltage across", value: formatSI(sel.voltage, "V"), note: `${fmt(100 * sel.voltage / circuit.voltage)} % of the source` },
                      { label: "Current through", value: formatSI(sel.current, "A"), note: `${fmt(100 * sel.currentShare)} % of the total` },
                      { label: "Power", value: formatSI(sel.power, "W") },
                    ]}
                  />
                  <p className="gc-eq-line">Ohm's law: V = I·R = {formatSI(sel.current, "A")} × {formatSI(sel.resistance, "Ω")} = {formatSI(sel.current * sel.resistance, "V")}; P = V·I = {formatSI(sel.voltage * sel.current, "W")}</p>
                  <button className="ghost-button" onClick={() => select(null)} type="button">Clear selection</button>
                </Panel>
              ) : null}

              <Panel subtitle="Select a row to highlight that part in the diagram." title="Every part of the circuit">
                <div className="gc-table-scroll">
                  <table className="gc-table ph-table">
                    <thead><tr><th scope="col">Part</th><th scope="col">R</th><th scope="col">V across</th><th scope="col">I through</th><th scope="col">P</th></tr></thead>
                    <tbody>
                      {analysis.nodes.map((n) => (
                        <tr className={`${n.id === selected ? "is-here" : ""}${n.kind === "resistor" ? "" : " ph-group-row"}`} key={n.id}>
                          <th scope="row">
                            <button aria-pressed={n.id === selected} className="ph-row-button" onClick={() => select(n.id === selected ? null : n.id)} style={{ paddingLeft: 6 + n.depth * 12 }} type="button">{n.label}</button>
                          </th>
                          <td>{formatSI(n.resistance, "Ω")}</td><td>{formatSI(n.voltage, "V")}</td><td>{formatSI(n.current, "A")}</td><td>{formatSI(n.power, "W")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel subtitle="Computed from the same network, shown so you can verify them by hand." title="Kirchhoff's laws and conservation">
                <div className="gc-step">
                  <h4>Current law (KCL) at each parallel junction</h4>
                  {analysis.kclJunctions.length === 0 ? <p>No parallel group: every part carries the one source current.</p> : analysis.kclJunctions.map((j) => (
                    <p className="gc-eq-line" key={j.groupId}>{analysis.byId[j.groupId].label}: {formatSI(j.inflow, "A")} in = {j.outflow.map((o) => `${formatSI(o.amps, "A")} (${o.label})`).join(" + ")} = {formatSI(j.outflow.reduce((s, o) => s + o.amps, 0), "A")} out</p>
                  ))}
                </div>
                <div className="gc-step">
                  <h4>Voltage law (KVL) around the loop through each resistor</h4>
                  {analysis.kvlLoops.map((l) => (
                    <p className="gc-eq-line" key={l.resistorId}>Source {fmt(circuit.voltage)} V = {l.terms.map((t) => `${formatSI(t.volts, "V")} (${t.label})`).join(" + ")} = {formatSI(l.sum, "V")}</p>
                  ))}
                </div>
                <div className="gc-step">
                  <h4>Energy</h4>
                  <p className="gc-eq-line">Source {formatSI(analysis.power, "W")} = resistors {formatSI(analysis.resistors.reduce((s, r) => s + r.power, 0), "W")}</p>
                </div>
              </Panel>

              {practice ? (
                scenarios.length && practiceInput ? <GcPredictPanel input={practiceInput} onApply={(next) => update(() => next)} scenarios={scenarios} /> : <Callout tone="info" title="Nothing to predict yet"><p>Enter a valid circuit to get prediction questions.</p></Callout>
              ) : (
                <Panel subtitle="Each answer quotes the numbers for the circuit you have built." title="Why does it behave this way?">
                  {lessons.map((l) => <Disclosure key={l.id} summary={l.title}><Paragraphs items={l.body} /></Disclosure>)}
                </Panel>
              )}
            </>
          ) : (
            <Callout tone="info" title="Fix the circuit to see the analysis"><p>{errors?.[0] ?? "The diagram and numbers appear as soon as every value is valid."}</p></Callout>
          )}
        </div>
      </div>

      <Panel subtitle="What this tool does and does not model." title="Assumptions and limits">
        <ul className="gc-assumptions">
          {CIRCUITS_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
          <li>Not modelled: capacitors and inductors (see the RC tool for one capacitor), AC, diodes and transistors, internal resistance, wire resistance, meters, temperature effects. Resistor power ratings are not checked.</li>
        </ul>
      </Panel>
    </div>
  );
}

// ---- structured editor: one row per resistor, one block per group -----------------------------------------------------------------

function NodeEditor({
  node, root = false, total, errors, selected, onSelect, onAdd, onKind, onLabel, onOhms, onRemove,
}: {
  node: CircuitNode; root?: boolean; total: number; errors: string[] | null; selected: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (id: string, kind: "series" | "parallel") => void;
  onKind: (id: string) => void;
  onLabel: (id: string, label: string) => void;
  onOhms: (id: string, ohms: number) => void;
  onRemove: (id: string) => void;
}) {
  const shared = { total, errors, selected, onSelect, onAdd, onKind, onLabel, onOhms, onRemove };
  if (node.kind === "resistor") {
    const err = errors?.find((e) => e.startsWith(`${node.label} `)) ?? null;
    return (
      <div className={`ph-res-row${selected === node.id ? " is-selected" : ""}`}>
        <div className="gc-pair">
          <TextField label="Name" maxLength={CIRCUIT_LIMITS.maxLabelLength} onChange={(label) => onLabel(node.id, label)} value={node.label} />
          <NumberField error={err} hint={Number.isFinite(node.ohms) ? formatSI(node.ohms, "Ω") : undefined} label="Resistance" onChange={(ohms) => onOhms(node.id, ohms)} unit="Ω" value={node.ohms} />
        </div>
        <div className="ph-row-actions">
          <button className="ghost-button" onClick={() => onSelect(selected === node.id ? null : node.id)} type="button">{selected === node.id ? "Deselect" : "Inspect"}</button>
          <button aria-label={`Add a resistor in series with ${node.label}`} className="ghost-button" onClick={() => onAdd(node.id, "series")} type="button">+ series</button>
          <button aria-label={`Add a resistor in parallel with ${node.label}`} className="ghost-button" onClick={() => onAdd(node.id, "parallel")} type="button">+ parallel</button>
          <button aria-label={`Remove ${node.label}`} className="ghost-button" disabled={total <= 1} onClick={() => onRemove(node.id)} type="button">Remove</button>
        </div>
      </div>
    );
  }
  return (
    <fieldset className={`gc-fieldset ph-group${node.kind === "parallel" ? " is-parallel" : ""}`}>
      <legend>{node.kind === "series" ? "Series group" : "Parallel group"}</legend>
      <div className="ph-row-actions">
        <Segmented<"series" | "parallel"> label={`Group ${node.id} type`} onChange={(k) => { if (k !== node.kind) onKind(node.id); }} options={[{ id: "series", label: "Series" }, { id: "parallel", label: "Parallel" }]} value={node.kind} />
        <button className="ghost-button" onClick={() => onAdd(node.id, node.kind)} type="button">+ resistor</button>
        {!root ? <button className="ghost-button" onClick={() => onRemove(node.id)} type="button">Remove group</button> : null}
      </div>
      {node.children.map((c) => <NodeEditor key={c.id} node={c} {...shared} />)}
    </fieldset>
  );
}
