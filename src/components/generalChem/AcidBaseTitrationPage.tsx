import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import "../../styles/generalChem.css";
import { ReplaceWorkspacePrompt, SaveAnalysisForm } from "../SavedAnalysisControls";
import WorkspaceNotice, { type WorkspaceNoticeItem } from "../WorkspaceNotice";
import { LineChart } from "../ui/LineChart";
import { LearningModeSwitch, type LearningMode } from "../ui/LearningModeSwitch";
import { Badge, Callout, DiagramFrame, Disclosure, Explanation, KeyFigures, Legend, Panel, Segmented, ToolHeader } from "../ui/primitives";
import {
  analyzeBuffer, analyzeSolution, dilute, isWeak, validateBuffer, validateSingleSolution,
  LIMITS, type SpeciesKind,
} from "../../utils/generalChem/acidBase";
import { formatConc, formatMl, formatPH, formatPercent, formatSig } from "../../utils/generalChem/format";
import { conceptLessons, evaluateScenario, explainPoint, scenariosFor, type Direction } from "../../utils/generalChem/learning";
import { ASSUMPTIONS, summarize } from "../../utils/generalChem/summary";
import {
  CURVE_SPAN, equationsFor, equivalenceVolume, pointAt, specialPoints, titrantOf, titrationCurve, validateTitration,
  type TitrationInput,
} from "../../utils/generalChem/titration";
import { getAppAnalysisLibrary } from "../../utils/persistence/analysisLibraryApp";
import type { OpenedAnalysis } from "../../utils/persistence/analysisLibrary";
import {
  DEFAULT_GENCHEM_INPUTS, GENCHEM_ENGINE_VERSION, describeGenChemAnalysis, validateGenChemInputs, validateGenChemResults,
  type GenChemInputs, type GenChemResults, type GenChemView,
} from "../../utils/persistence/generalChemWorkspace";
import { useSavedAnalysisOpen } from "../../utils/persistence/useSavedAnalysisOpen";
import { useWorkspacePersistence } from "../../utils/persistence/useWorkspacePersistence";
import type { Capture, RecoveryOutcome } from "../../utils/persistence/workspacePersistence";

type Props = {
  openRequest?: { id: string; recordId: string } | null;
  onOpenHandled?: (requestId: string) => void;
};

const KIND_OPTIONS: Array<{ id: SpeciesKind; label: string }> = [
  { id: "strong-acid", label: "Strong acid" },
  { id: "weak-acid", label: "Weak acid" },
  { id: "strong-base", label: "Strong base" },
  { id: "weak-base", label: "Weak base" },
];

const PRESETS: Array<{ label: string; titration: Partial<TitrationInput> & { analyte: SpeciesKind } }> = [
  { label: "HCl + NaOH", titration: { analyte: "strong-acid", c0: 0.1, v0: 25, ct: 0.1 } },
  { label: "Acetic acid + NaOH", titration: { analyte: "weak-acid", c0: 0.1, v0: 25, pK: 4.76, ct: 0.1 } },
  { label: "NaOH + HCl", titration: { analyte: "strong-base", c0: 0.1, v0: 25, ct: 0.1 } },
  { label: "Ammonia + HCl", titration: { analyte: "weak-base", c0: 0.1, v0: 25, pK: 4.75, ct: 0.1 } },
];

const REGION_LABEL: Record<string, string> = {
  initial: "Start",
  early: "Early buffering",
  buffer: "Buffer region",
  "approaching-equivalence": "Approaching equivalence",
  "half-equivalence": "Half-equivalence",
  equivalence: "Equivalence point",
  "excess-titrant": "Past equivalence",
};

/** A number field that keeps what the user typed (so "1e-" or "" can be edited) and reports numbers (NaN when unreadable). */
function NumberField({ label, unit, value, onChange, error, hint, step }: {
  label: string; unit?: string; value: number; onChange: (value: number) => void; error?: string | null; hint?: string; step?: number;
}) {
  const id = useId();
  const show = (v: number) => (Number.isFinite(v) ? String(Number(v.toPrecision(10))) : "");
  const [text, setText] = useState(show(value));
  const [seen, setSeen] = useState(value);
  if (!Object.is(value, seen)) {
    // follow external changes (slider, presets, restored analysis) without fighting the user's typing
    setSeen(value);
    const typed = text.trim() === "" ? NaN : Number(text);
    if (!Object.is(typed, value)) setText(show(value));
  }
  return (
    <div className={`gc-field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}{unit ? <span className="gc-unit"> ({unit})</span> : null}</label>
      <input
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        aria-invalid={error ? true : undefined}
        id={id}
        inputMode="decimal"
        onChange={(event) => { setText(event.target.value); onChange(event.target.value.trim() === "" ? NaN : Number(event.target.value)); }}
        step={step}
        type="text"
        value={text}
      />
      {error ? <p className="gc-field-error" id={`${id}-err`} role="alert">{error}</p> : hint ? <p className="gc-field-hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

const clampVt = (t: TitrationInput): TitrationInput => {
  const veq = equivalenceVolume(t);
  return Number.isFinite(veq) && veq > 0 ? { ...t, vt: Math.min(Math.max(Number.isFinite(t.vt) ? t.vt : 0, 0), CURVE_SPAN * veq) } : t;
};

export default function AcidBaseTitrationPage({ openRequest = null, onOpenHandled }: Props) {
  const [raw, setRaw] = useState<GenChemInputs>(DEFAULT_GENCHEM_INPUTS);
  const [mode, setMode] = useState<LearningMode>("explore");
  const touchedRef = useRef(false);
  const [notices, setNotices] = useState<WorkspaceNoticeItem[]>([]);
  const [saveForm, setSaveForm] = useState<{ name: string } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<WorkspaceNoticeItem | null>(null);
  const [openedName, setOpenedName] = useState<string | null>(null);

  const update = useCallback((fn: (current: GenChemInputs) => GenChemInputs) => {
    touchedRef.current = true;
    setSaveMessage(null);
    setRaw(fn);
  }, []);
  const setView = (view: GenChemView) => update((c) => ({ ...c, view }));
  const setTitration = (patch: Partial<TitrationInput>, clamp = true) =>
    update((c) => ({ ...c, titration: clamp ? clampVt({ ...c.titration, ...patch }) : { ...c.titration, ...patch } }));

  // ---- model ----------------------------------------------------------------------------------------------------
  const tv = useMemo(() => validateTitration(raw.titration), [raw.titration]);
  const titration = useMemo(() => {
    if (!tv.ok) return null;
    const special = specialPoints(tv.value);
    const point = pointAt(tv.value, tv.value.vt, special);
    return { input: tv.value, special, point, curve: titrationCurve(tv.value), explanation: explainPoint(tv.value, point, special), lessons: conceptLessons(tv.value) };
  }, [tv]);

  const sv = useMemo(() => validateSingleSolution(raw.solution), [raw.solution]);
  const solution = useMemo(() => {
    if (!sv.ok) return null;
    const a = analyzeSolution(sv.value);
    if (!("equilibrium" in a)) return null;
    const d = dilute(sv.value, raw.solution.startVolumeMl, raw.solution.dilutedVolumeMl);
    const after = d.ok ? analyzeSolution(d.input) : null;
    return { a, dilution: d, after: after && "equilibrium" in after ? after : null };
  }, [sv, raw.solution.startVolumeMl, raw.solution.dilutedVolumeMl]);

  const bv = useMemo(() => validateBuffer(raw.buffer), [raw.buffer]);
  const buffer = useMemo(() => {
    if (!bv.ok) return null;
    const a = analyzeBuffer(bv.value);
    return "equilibrium" in a ? a : null;
  }, [bv]);

  const liveResults: GenChemResults | null = useMemo(() => {
    const inputs = validateGenChemInputs(raw);
    return inputs ? summarize(inputs) : null;
  }, [raw]);

  // ---- persistence ----------------------------------------------------------------------------------------------
  const { controller: persistence, recovery, status: persistenceStatus } = useWorkspacePersistence<GenChemInputs, GenChemResults>({
    page: "genchem",
    engineVersion: GENCHEM_ENGINE_VERSION,
    validateInputs: validateGenChemInputs,
    validateResults: validateGenChemResults,
  });
  const latestRef = useRef({ raw, liveResults });
  const requestPersistRef = useRef<() => void>(() => undefined);
  const appliedRecoveryRef = useRef<unknown>(null);

  function captureWorkspace(): Capture<GenChemInputs, GenChemResults> | null {
    const { raw: current, liveResults: results } = latestRef.current;
    const inputs = validateGenChemInputs(current);
    if (!inputs || !touchedRef.current) return null;
    return { inputs, results: results ? { computedAt: new Date().toISOString(), engineVersion: GENCHEM_ENGINE_VERSION, stale: false, status: "complete", data: results } : null };
  }
  useEffect(() => {
    latestRef.current = { raw, liveResults };
    requestPersistRef.current = () => persistence.requestSave(captureWorkspace);
  });
  useEffect(() => { requestPersistRef.current(); }, [raw]);

  useEffect(() => {
    if (!recovery || appliedRecoveryRef.current === recovery) return;
    appliedRecoveryRef.current = recovery;
    try {
      const outcome = recovery as RecoveryOutcome<GenChemInputs, GenChemResults>;
      if (outcome.kind === "rejected") {
        setNotices([{ tone: "warn", text: `Saved work from a previous session could not be used (${outcome.message}). It was set aside and the page started clean.` }]);
      } else if (outcome.kind === "restored" && persistence.isCurrent(outcome.epoch)) {
        if (touchedRef.current) {
          setNotices([{ tone: "info", text: "Saved work from a previous session was not restored because you had already started new work on this page." }]);
        } else {
          setRaw(outcome.inputs);
          touchedRef.current = true;
          setNotices([{ tone: "info", text: "Restored your values from the previous session; results were recalculated from them." }]);
        }
      }
    } finally {
      persistence.resumeAfterRestore();
    }
  }, [recovery, persistence]);

  const defaultName = () => (liveResults ? describeGenChemAnalysis(raw, liveResults) : "Acid–base analysis").slice(0, 100);

  async function saveCurrentAnalysis(name: string, announce = true): Promise<boolean> {
    setSaveBusy(true);
    try {
      const capture = (() => {
        const inputs = validateGenChemInputs(latestRef.current.raw);
        const results = latestRef.current.liveResults;
        return inputs && results ? { inputs, results } : null;
      })();
      if (!capture) {
        setSaveMessage({ tone: "warn", text: "Fix the highlighted values before saving: only a valid analysis can be saved." });
        return false;
      }
      const result = await getAppAnalysisLibrary().save("genchem", {
        name,
        summary: describeGenChemAnalysis(capture.inputs, capture.results),
        inputs: capture.inputs,
        results: { computedAt: new Date().toISOString(), engineVersion: GENCHEM_ENGINE_VERSION, stale: false, status: "complete", data: capture.results },
      });
      if (!result.ok) {
        setSaveMessage({ tone: "warn", text: `The analysis was not saved: ${result.error.message}` });
        return false;
      }
      if (announce) setSaveMessage({ tone: "info", text: `Saved “${result.value.name}” to Saved analyses.` });
      return true;
    } finally {
      setSaveBusy(false);
    }
  }

  async function applySavedAnalysis(opened: OpenedAnalysis<GenChemInputs, GenChemResults>): Promise<boolean> {
    touchedRef.current = true;
    setRaw(opened.inputs);
    setOpenedName(opened.record.name);
    const fresh = summarize(opened.inputs);
    const saved = opened.results?.data;
    const changed = saved && fresh && (opened.results!.engineVersion !== GENCHEM_ENGINE_VERSION || Math.abs(saved.pH - fresh.pH) > 0.005);
    setNotices(
      changed
        ? [{ tone: "warn", text: `The calculation model changed since “${opened.record.name}” was saved (saved pH ${formatPH(saved!.pH)}, now ${formatPH(fresh!.pH)}). The current values are shown.` }]
        : opened.resultsDropped
          ? [{ tone: "warn", text: "The saved summary could not be validated; your values were opened and recalculated." }]
          : [{ tone: "info", text: `Opened “${opened.record.name}”. Results were recalculated from the saved values.` }],
    );
    return true;
  }

  const savedOpen = useSavedAnalysisOpen<GenChemInputs, GenChemResults>({
    page: "genchem",
    openRequest,
    onOpenHandled,
    ready: recovery !== null,
    busyReason: () => null,
    hasUnsavedWork: () => touchedRef.current,
    canSaveCurrent: () => Boolean(latestRef.current.liveResults),
    saveCurrent: (name) => saveCurrentAnalysis(name, false),
    defaultName,
    apply: applySavedAnalysis,
    notify: (item) => setNotices((items) => [...items, item]),
  });

  const workspaceNotices: WorkspaceNoticeItem[] = [...notices];
  if (saveMessage) workspaceNotices.push(saveMessage);
  if (!persistenceStatus.available) workspaceNotices.push({ tone: "warn", text: "Browser storage is unavailable, so your work on this page will not be saved." });
  if (persistenceStatus.saveError) workspaceNotices.push({ tone: "warn", text: `Your latest changes could not be saved (${persistenceStatus.saveError.message}).` });

  // ---- field errors (shown next to the offending field) --------------------------------------------------------------
  const errorFor = (errors: string[] | null, needle: RegExp) => errors?.find((e) => needle.test(e)) ?? null;
  const tErrors = tv.ok ? null : tv.errors;
  const sErrors = sv.ok ? null : sv.errors;
  const bErrors = bv.ok ? null : bv.errors;

  const practice = mode === "practice";

  return (
    <div className="gc-page">
      <ToolHeader
        group="Analyze"
        title="Acid–base equilibria & titration"
        purpose="Calculate pH, ionization, buffers and dilution for one monoprotic acid or base in water, and watch a titration curve respond to every change."
        evidence="model"
        steps={[
          { label: "Choose a system", detail: "Strong or weak, acid or base." },
          { label: "Change the values", detail: "The pH and the curve update together." },
          { label: "Read the point", detail: "Explanations follow the position you select." },
        ]}
        aside={<Badge tone="neutral" title="Ideal solutions at 25 °C. See the assumptions below.">25 °C · ideal</Badge>}
      />

      <WorkspaceNotice notices={workspaceNotices} />
      {savedOpen.prompt && (
        <ReplaceWorkspacePrompt
          busy={savedOpen.saveBusy}
          canSaveFirst={Boolean(liveResults)}
          name={savedOpen.prompt.opened.record.name}
          onChoose={(choice) => void savedOpen.resolve(choice)}
        />
      )}

      <div className="gc-toolbar">
        <Segmented
          label="Analysis type"
          onChange={setView}
          options={[
            { id: "titration", label: "Titration" },
            { id: "solution", label: "Single solution" },
            { id: "buffer", label: "Buffer" },
          ]}
          value={raw.view}
        />
        <LearningModeSwitch mode={mode} modes={["explore", "practice"]} onChange={setMode} />
        <div className="gc-toolbar-actions">
          <button className="secondary-button" disabled={!liveResults} onClick={() => { setSaveMessage(null); setSaveForm({ name: defaultName() }); }} type="button">Save Analysis</button>
        </div>
      </div>
      {saveForm && (
        <SaveAnalysisForm
          busy={saveBusy}
          name={saveForm.name}
          onCancel={() => setSaveForm(null)}
          onChange={(name) => setSaveForm({ name })}
          onSubmit={() => { void saveCurrentAnalysis(saveForm.name).then((ok) => { if (ok) setSaveForm(null); }); }}
        />
      )}
      {openedName && <p className="gc-opened">Opened from Saved analyses: <strong>{openedName}</strong></p>}

      {/* ------------------------------------------------------------------ titration ------------------------------------------------------------------ */}
      {raw.view === "titration" && (
        <div className="gc-layout">
          <Panel className="gc-inputs" title="System" subtitle={`Titrant: ${titrantOf(raw.titration.analyte)} (chosen automatically)`}>
            <div className="gc-presets" role="group" aria-label="Example systems">
              {PRESETS.map((preset) => (
                <button className="secondary-button gc-chip" key={preset.label} onClick={() => setTitration({ ...preset.titration, vt: 0 })} type="button">{preset.label}</button>
              ))}
            </div>
            <Segmented
              label="Analyte"
              onChange={(analyte) => setTitration({ analyte, pK: isWeak(analyte) ? raw.titration.pK ?? 4.76 : undefined })}
              options={KIND_OPTIONS}
              value={raw.titration.analyte}
            />
            <NumberField error={errorFor(tErrors, /Analyte concentration/)} label="Analyte concentration" onChange={(c0) => setTitration({ c0 })} unit="mol/L" value={raw.titration.c0} />
            <NumberField error={errorFor(tErrors, /Analyte volume/)} label="Analyte volume" onChange={(v0) => setTitration({ v0 })} unit="mL" value={raw.titration.v0} />
            {isWeak(raw.titration.analyte) && (
              <NumberField
                error={errorFor(tErrors, /pK[ab]/)}
                hint={`${raw.titration.analyte === "weak-acid" ? "Ka" : "Kb"} = ${Number.isFinite(raw.titration.pK) ? formatSig(10 ** -(raw.titration.pK as number), 3) : "—"}`}
                label={raw.titration.analyte === "weak-acid" ? "pKa" : "pKb"}
                onChange={(pK) => setTitration({ pK })}
                value={raw.titration.pK ?? NaN}
              />
            )}
            <NumberField error={errorFor(tErrors, /Titrant concentration/)} label="Titrant concentration" onChange={(ct) => setTitration({ ct })} unit="mol/L" value={raw.titration.ct} />
            <NumberField error={errorFor(tErrors, /titrant volume|at most/i)} label="Added titrant volume" onChange={(vt) => setTitration({ vt }, false)} unit="mL" value={raw.titration.vt} />
            {tErrors && <Callout tone="danger" title="These values cannot be used"><ul>{tErrors.map((e) => <li key={e}>{e}</li>)}</ul></Callout>}
            {tv.ok && tv.warnings.length > 0 && <Callout tone="warn" title="Check these assumptions"><ul>{tv.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Callout>}
          </Panel>

          <div className="gc-stage">
            {titration ? (
              <>
                <DiagramFrame
                  caption={`Added titrant: ${formatMl(titration.point.vt)} → pH ${formatPH(titration.point.pH)}. Drag on the graph, use the arrow keys, or move the slider.`}
                  label="Titration curve"
                  legend={
                    <Legend
                      items={[
                        { label: "pH of the mixture", color: "#0b6a72", kind: "line" },
                        { label: "Selected point", color: "#be123c", kind: "dashed" },
                        { label: "Equivalence point", color: "#b45309" },
                        ...(titration.special.halfEquivalence ? [{ label: "Half-equivalence", color: "#6d28d9" }] : []),
                        ...(titration.special.bufferRegion ? [{ label: "Buffer region (pH = pKa ± 1)", color: "rgba(11,106,114,0.22)" }] : []),
                      ]}
                    />
                  }
                  title="Titration curve"
                >
                  <LineChart
                    bands={titration.special.bufferRegion ? [{ id: "buf", x0: titration.special.bufferRegion.vStart, x1: titration.special.bufferRegion.vEnd, label: "Buffer region" }] : []}
                    current={{ x: titration.point.vt, y: titration.point.pH }}
                    formatX={(x) => String(Number(x.toPrecision(3)))}
                    formatY={(y) => String(Math.round(y))}
                    markers={[
                      { id: "eq", kind: "equivalence", label: "Equivalence", x: titration.special.veq, y: titration.special.pHEquivalence },
                      ...(titration.special.halfEquivalence ? [{ id: "half", kind: "half" as const, label: "Half-equivalence", x: titration.special.halfEquivalence.vt, y: titration.special.halfEquivalence.pH }] : []),
                    ]}
                    onXChange={(x) => setTitration({ vt: Number(x.toPrecision(8)) }, false)}
                    series={[{ id: "pH", label: "pH", points: titration.curve.map((p) => ({ x: p.vt, y: p.pH })) }]}
                    title="Titration curve: pH against volume of titrant added"
                    valueText={`${formatMl(titration.point.vt)} added, pH ${formatPH(titration.point.pH)}, ${REGION_LABEL[titration.point.region]}`}
                    xDomain={[0, CURVE_SPAN * titration.special.veq]}
                    xLabel={`Volume of ${titrantOf(titration.input.analyte)} added (mL)`}
                    xStep={(CURVE_SPAN * titration.special.veq) / 400}
                    yDomain={[Math.min(0, Math.floor(Math.min(...titration.curve.map((p) => p.pH)))), Math.max(14, Math.ceil(Math.max(...titration.curve.map((p) => p.pH))))]}
                    yLabel="pH"
                    yTickStep={2}
                  />
                </DiagramFrame>

                <div className="gc-slider">
                  <label htmlFor="gc-vt-slider">Added titrant: <strong>{formatMl(titration.point.vt)}</strong></label>
                  <input
                    aria-valuetext={`${formatMl(titration.point.vt)}, pH ${formatPH(titration.point.pH)}`}
                    id="gc-vt-slider"
                    max={CURVE_SPAN * titration.special.veq}
                    min={0}
                    onChange={(event) => setTitration({ vt: Number(event.target.value) }, false)}
                    step={(CURVE_SPAN * titration.special.veq) / 1000}
                    type="range"
                    value={titration.point.vt}
                  />
                  <div className="gc-jumps" role="group" aria-label="Jump to a point">
                    <button className="secondary-button gc-chip" onClick={() => setTitration({ vt: 0 }, false)} type="button">Start</button>
                    {titration.special.halfEquivalence && <button className="secondary-button gc-chip" onClick={() => setTitration({ vt: titration.special.halfEquivalence!.vt }, false)} type="button">Half-equivalence</button>}
                    <button className="secondary-button gc-chip" onClick={() => setTitration({ vt: titration.special.veq }, false)} type="button">Equivalence</button>
                    <button className="secondary-button gc-chip" onClick={() => setTitration({ vt: titration.special.veq * 1.5 }, false)} type="button">Past equivalence</button>
                  </div>
                </div>

                <KeyFigures
                  items={[
                    { label: "pH now", value: <span className="gc-big" data-testid="ph-now">{formatPH(titration.point.pH)}</span>, note: `pOH ${formatPH(titration.point.pOH)}` },
                    { label: "Position", value: REGION_LABEL[titration.point.region], note: `${(titration.point.fraction * 100).toFixed(1)} % of equivalence` },
                    { label: "Total volume", value: formatMl(titration.point.vTotal) },
                    { label: "Equivalence", value: formatMl(titration.special.veq), note: `pH ${formatPH(titration.special.pHEquivalence)}` },
                    ...(titration.special.halfEquivalence
                      ? [{ label: "Half-equivalence", value: `pH ${formatPH(titration.special.halfEquivalence.pH)}`, note: `${raw.titration.analyte === "weak-acid" ? "pKa" : "pKa of BH⁺"} = ${formatPH(titration.special.pKaEffective ?? NaN)}` }]
                      : []),
                    ...(titration.special.bufferRegion
                      ? [{ label: "Buffer region", value: `${formatMl(titration.special.bufferRegion.vStart)} – ${formatMl(titration.special.bufferRegion.vEnd)}`, note: `pH ${formatPH(titration.special.bufferRegion.pHStart)} – ${formatPH(titration.special.bufferRegion.pHEnd)}` }]
                      : []),
                  ]}
                />

                <Explanation title={titration.explanation.heading}>
                  {titration.explanation.paragraphs.map((p) => <p key={p}>{p}</p>)}
                </Explanation>

                <Panel className="gc-equations" title="Relevant equations">
                  <ul className="gc-eq-list">{equationsFor(titration.input, titration.point.region).map((e) => <li key={e}>{e}</li>)}</ul>
                </Panel>

                <Disclosure summary="Species concentrations and the balance checks" hint="Charge balance and mass balance at this point">
                  <SpeciesTable eq={titration.point.equilibrium} />
                </Disclosure>
                <Disclosure summary="Data table (same values as the graph)">
                  <table className="gc-table">
                    <caption className="visually-hidden">pH at selected fractions of the equivalence volume</caption>
                    <thead><tr><th scope="col">Titrant added (mL)</th><th scope="col">Fraction of equivalence</th><th scope="col">pH</th></tr></thead>
                    <tbody>
                      {[0, 0.25, 0.5, 0.75, 0.9, 0.99, 1, 1.01, 1.1, 1.5, 2].map((f) => {
                        const v = f * titration.special.veq;
                        return <tr key={f}><td>{formatMl(v).replace(" mL", "")}</td><td>{f}</td><td>{formatPH(pointAt(titration.input, v, titration.special).pH)}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </Disclosure>

                {practice ? (
                  <PredictPanel input={titration.input} onApply={(next) => setTitration({ ...next, vt: 0 })} />
                ) : (
                  <Panel className="gc-lessons" subtitle="Each answer uses the numbers for the system you have set up." title="Why does it behave this way?">
                    {titration.lessons.map((lesson) => (
                      <Disclosure key={lesson.id} summary={lesson.title}>
                        {lesson.body.map((p) => <p key={p}>{p}</p>)}
                      </Disclosure>
                    ))}
                  </Panel>
                )}
              </>
            ) : (
              <Callout tone="info" title="Enter valid values to see the titration">
                <p>The curve, readouts and explanations appear as soon as every field is valid.</p>
              </Callout>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ single solution ------------------------------------------------------------------ */}
      {raw.view === "solution" && (
        <div className="gc-layout">
          <Panel className="gc-inputs" title="Solution" subtitle="One acid or base dissolved in water">
            <Segmented
              label="Solute"
              onChange={(kind) => update((c) => ({ ...c, solution: { ...c.solution, kind, pK: isWeak(kind) ? c.solution.pK ?? 4.76 : undefined } }))}
              options={KIND_OPTIONS}
              value={raw.solution.kind}
            />
            <NumberField error={errorFor(sErrors, /Concentration/)} label="Concentration" onChange={(concentration) => update((c) => ({ ...c, solution: { ...c.solution, concentration } }))} unit="mol/L" value={raw.solution.concentration} />
            {isWeak(raw.solution.kind) && (
              <NumberField error={errorFor(sErrors, /pK[ab]/)} label={raw.solution.kind === "weak-acid" ? "pKa" : "pKb"} onChange={(pK) => update((c) => ({ ...c, solution: { ...c.solution, pK } }))} value={raw.solution.pK ?? NaN} />
            )}
            <fieldset className="gc-fieldset">
              <legend>Dilute with water</legend>
              <NumberField label="Starting volume" onChange={(startVolumeMl) => update((c) => ({ ...c, solution: { ...c.solution, startVolumeMl } }))} unit="mL" value={raw.solution.startVolumeMl} />
              <NumberField
                error={solution && !solution.dilution.ok ? solution.dilution.reason : null}
                label="Final volume"
                onChange={(dilutedVolumeMl) => update((c) => ({ ...c, solution: { ...c.solution, dilutedVolumeMl } }))}
                unit="mL"
                value={raw.solution.dilutedVolumeMl}
              />
            </fieldset>
            {sErrors && <Callout tone="danger" title="These values cannot be used"><ul>{sErrors.map((e) => <li key={e}>{e}</li>)}</ul></Callout>}
            {sv.ok && sv.warnings.length > 0 && <Callout tone="warn" title="Check these assumptions"><ul>{sv.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Callout>}
          </Panel>

          <div className="gc-stage">
            {solution ? (
              <>
                <KeyFigures
                  items={[
                    { label: "pH", value: <span className="gc-big" data-testid="ph-now">{formatPH(solution.a.equilibrium.pH)}</span>, note: `pOH ${formatPH(solution.a.equilibrium.pOH)}` },
                    { label: "[H₃O⁺]", value: formatConc(solution.a.equilibrium.h) },
                    { label: "[OH⁻]", value: formatConc(solution.a.equilibrium.oh) },
                    { label: "Ionized", value: formatPercent(solution.a.percentIonized) },
                    ...(solution.a.Ka !== null ? [{ label: "Ka", value: formatSig(solution.a.Ka) }] : []),
                    ...(solution.a.Kb !== null ? [{ label: "Kb", value: formatSig(solution.a.Kb) }] : []),
                  ]}
                />
                {solution.a.approximation && (
                  <Callout tone={solution.a.approximation.valid ? "ok" : "warn"} title={solution.a.approximation.valid ? "The textbook shortcut is accurate here" : "The textbook shortcut is not reliable here"}>
                    <p>Shortcut ({solution.a.approximation.rule}): pH {formatPH(solution.a.approximation.pH)}, versus {formatPH(solution.a.equilibrium.pH)} from the full model (difference {Math.abs(solution.a.approximation.errorPH).toFixed(2)}). The full charge-balance model is used for every number on this page.</p>
                  </Callout>
                )}
                {solution.a.waterMatters && <Callout tone="info" title="Water's own ions matter here"><p>The [{raw.solution.kind.endsWith("acid") ? "OH⁻" : "H₃O⁺"}] from water autoionization is comparable to the solute's contribution, so the simple “x = C” approach would be wrong; the model includes water exactly.</p></Callout>}
                <Panel title="After dilution" subtitle={`${formatMl(raw.solution.startVolumeMl)} diluted to ${formatMl(raw.solution.dilutedVolumeMl)}`}>
                  {solution.after && solution.dilution.ok ? (
                    <>
                      <KeyFigures
                        items={[
                          { label: "Concentration", value: formatConc(solution.dilution.input.concentration), note: `C₁V₁ = C₂V₂, factor ${solution.dilution.factor.toPrecision(3)}` },
                          { label: "pH", value: formatPH(solution.after.equilibrium.pH), note: `change ${(solution.after.equilibrium.pH - solution.a.equilibrium.pH >= 0 ? "+" : "") + (solution.after.equilibrium.pH - solution.a.equilibrium.pH).toFixed(2)}` },
                          { label: "Ionized", value: formatPercent(solution.after.percentIonized), note: `was ${formatPercent(solution.a.percentIonized)}` },
                        ]}
                      />
                      {!practice && (
                        <Explanation title="Why dilution changes equilibrium">
                          <p>
                            {isWeak(raw.solution.kind)
                              ? `A weak ${raw.solution.kind === "weak-acid" ? "acid" : "base"} ionizes more when it is diluted (${formatPercent(solution.a.percentIonized)} → ${formatPercent(solution.after.percentIonized)}): the equilibrium shifts toward more, smaller particles. That offsets part of the concentration drop, so a tenfold dilution moves the pH by about half a unit, not a full unit.`
                              : "A strong acid or base is already fully ionized, so dilution changes only the concentration: each tenfold dilution moves the pH by exactly one unit (until water's own ions start to matter)."}
                          </p>
                        </Explanation>
                      )}
                    </>
                  ) : (
                    <p className="gc-field-hint">{solution.dilution.ok ? "" : solution.dilution.reason}</p>
                  )}
                </Panel>
                <Disclosure summary="Species concentrations and the balance checks"><SpeciesTable eq={solution.a.equilibrium} /></Disclosure>
              </>
            ) : (
              <Callout tone="info" title="Enter valid values to see the result"><p>Results appear as soon as every field is valid.</p></Callout>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ buffer ------------------------------------------------------------------ */}
      {raw.view === "buffer" && (
        <div className="gc-layout">
          <Panel className="gc-inputs" title="Buffer" subtitle="A weak acid or base with its conjugate">
            <Segmented
              label="Buffer family"
              onChange={(family) => update((c) => ({ ...c, buffer: { ...c.buffer, family } }))}
              options={[{ id: "acid", label: "Weak acid + conjugate base" }, { id: "base", label: "Weak base + conjugate acid" }]}
              value={raw.buffer.family}
            />
            <NumberField error={errorFor(bErrors, /pK[ab]/)} label={raw.buffer.family === "acid" ? "pKa" : "pKb"} onChange={(pK) => update((c) => ({ ...c, buffer: { ...c.buffer, pK } }))} value={raw.buffer.pK} />
            <NumberField error={errorFor(bErrors, /Weak/)} label={raw.buffer.family === "acid" ? "Weak acid (HA)" : "Weak base (B)"} onChange={(weak) => update((c) => ({ ...c, buffer: { ...c.buffer, weak } }))} unit="mol/L" value={raw.buffer.weak} />
            <NumberField error={errorFor(bErrors, /Conjugate/)} label={raw.buffer.family === "acid" ? "Conjugate base (A⁻)" : "Conjugate acid (BH⁺)"} onChange={(conjugate) => update((c) => ({ ...c, buffer: { ...c.buffer, conjugate } }))} unit="mol/L" value={raw.buffer.conjugate} />
            <p className="gc-field-hint">Concentrations are those in the final mixture. The conjugate is supplied as a salt (for example sodium acetate or ammonium chloride).</p>
            {bErrors && <Callout tone="danger" title="These values cannot be used"><ul>{bErrors.map((e) => <li key={e}>{e}</li>)}</ul></Callout>}
          </Panel>
          <div className="gc-stage">
            {buffer ? (
              <>
                <KeyFigures
                  items={[
                    { label: "pH (full model)", value: <span className="gc-big" data-testid="ph-now">{formatPH(buffer.equilibrium.pH)}</span> },
                    { label: "Henderson–Hasselbalch", value: formatPH(buffer.hh.pH), note: `difference ${Math.abs(buffer.hh.errorPH).toFixed(3)}` },
                    { label: "[conjugate]/[weak]", value: buffer.hh.ratio.toPrecision(3) },
                    { label: "Buffer capacity", value: `${formatSig(buffer.capacity, 3)} mol/L per pH`, note: "base or acid needed to move pH by 1 (exact model)" },
                  ]}
                />
                <Callout tone={buffer.hh.valid ? "ok" : "warn"} title={buffer.hh.valid ? "Henderson–Hasselbalch is valid here" : "Henderson–Hasselbalch is outside its regime"}>
                  <p>
                    {buffer.hh.valid
                      ? "The ratio is between 1:10 and 10:1 and both components are much larger than the H⁺/OH⁻ they could produce, so pH = pKa + log([A⁻]/[HA]) is a good approximation."
                      : `Not valid because ${buffer.hh.reasons.join(" and ")}. Use the full-model pH (${formatPH(buffer.equilibrium.pH)}), which includes water and the weak species' own ionization.`}
                  </p>
                </Callout>
                {!practice && (
                  <Explanation title="What makes a buffer work">
                    <p>Both members of the conjugate pair are present, so added {raw.buffer.family === "acid" ? "OH⁻ is absorbed by HA" : "H⁺ is absorbed by B"} and added {raw.buffer.family === "acid" ? "H⁺ by A⁻" : "OH⁻ by BH⁺"}. The pH is set by the ratio of the pair, not by their absolute amounts; capacity grows with concentration and is largest when the pair is about 1:1 (pH ≈ {raw.buffer.family === "acid" ? "pKa" : "14 − pKb"} = {formatPH(raw.buffer.family === "acid" ? raw.buffer.pK : 14 - raw.buffer.pK)}).</p>
                  </Explanation>
                )}
                <Disclosure summary="Species concentrations and the balance checks"><SpeciesTable eq={buffer.equilibrium} /></Disclosure>
              </>
            ) : (
              <Callout tone="info" title="Enter valid values to see the result"><p>Results appear as soon as every field is valid.</p></Callout>
            )}
          </div>
        </div>
      )}

      <Disclosure summary="Scope, assumptions and limits" hint="What this tool does and does not model">
        <ul className="gc-assumptions">
          {ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
          <li>Supported ranges: concentration {formatSig(LIMITS.minConcentration, 1)} to {LIMITS.maxConcentration} mol/L; pKa/pKb {LIMITS.minPK} to {LIMITS.maxPK}; volumes {LIMITS.minVolumeMl} to {LIMITS.maxVolumeMl} mL.</li>
          <li>Values outside these ranges are refused rather than approximated. pH is shown to two decimals because the ideal-solution assumption limits real accuracy.</li>
        </ul>
      </Disclosure>
    </div>
  );
}

function SpeciesTable({ eq }: { eq: import("../../utils/generalChem/acidBase").EquilibriumResult }) {
  return (
    <>
      <table className="gc-table">
        <caption className="visually-hidden">Equilibrium concentrations</caption>
        <thead><tr><th scope="col">Species</th><th scope="col">Concentration (mol/L)</th></tr></thead>
        <tbody>
          <tr><th scope="row">H₃O⁺</th><td>{formatSig(eq.h)}</td></tr>
          <tr><th scope="row">OH⁻</th><td>{formatSig(eq.oh)}</td></tr>
          {eq.acid && <><tr><th scope="row">HA</th><td>{formatSig(eq.acid.ha)}</td></tr><tr><th scope="row">A⁻</th><td>{formatSig(eq.acid.a)}</td></tr></>}
          {eq.base && <><tr><th scope="row">B</th><td>{formatSig(eq.base.b)}</td></tr><tr><th scope="row">BH⁺</th><td>{formatSig(eq.base.bh)}</td></tr></>}
        </tbody>
      </table>
      <p className="gc-field-hint">
        Charge balance: positive charge {formatSig(eq.positiveCharge)} mol/L = negative charge {formatSig(eq.negativeCharge)} mol/L (relative difference {eq.chargeBalanceError.toExponential(1)}). Mass balance: [HA] + [A⁻] (or [B] + [BH⁺]) equals the analytical concentration by construction.
      </p>
    </>
  );
}

/** Predict, then observe: the learner commits to "higher / lower / about the same" before the model answers. */
function PredictPanel({ input, onApply }: { input: TitrationInput; onApply: (next: TitrationInput) => void }) {
  const scenarios = useMemo(() => scenariosFor(input), [input]);
  const [index, setIndex] = useState(0);
  // a prediction belongs to one scenario on one system: changing either starts a fresh question
  const key = `${index}|${JSON.stringify(input)}`;
  const [answer, setAnswer] = useState<{ key: string; guess: Direction } | null>(null);
  const guess = answer?.key === key ? answer.guess : null;
  const setGuess = (next: Direction) => setAnswer({ key, guess: next });
  const scenario = scenarios[Math.min(index, scenarios.length - 1)];
  const outcome = useMemo(() => (guess ? evaluateScenario(scenario, input) : null), [guess, scenario, input]);
  const fmt = (v: number) => (scenario.unit === "pH" ? formatPH(v) : formatMl(v));
  return (
    <Panel className="gc-predict" subtitle="Commit to an answer first; the model then shows the result for your system." title="Predict, then observe">
      <div className="gc-scenario-pick" role="group" aria-label="Choose a change to predict">
        {scenarios.map((s, i) => (
          <button aria-pressed={i === index} className={i === index ? "secondary-button is-on" : "ghost-button"} key={s.id} onClick={() => setIndex(i)} type="button">{s.change}</button>
        ))}
      </div>
      <p className="gc-question">If you <strong>{scenario.change}</strong>, will <strong>{scenario.quantity}</strong> be higher, lower, or about the same?</p>
      <Segmented<Direction>
        label="Your prediction"
        onChange={setGuess}
        options={[{ id: "higher", label: "Higher" }, { id: "lower", label: "Lower" }, { id: "same", label: "About the same" }]}
        value={(guess ?? "") as Direction}
      />
      {outcome && (
        <div aria-live="polite" className="gc-reveal">
          <Callout tone={guess === outcome.direction ? "ok" : "warn"} title={guess === outcome.direction ? "Your prediction matches the model" : "Not quite"}>
            <p>{scenario.quantity[0].toUpperCase() + scenario.quantity.slice(1)} goes from <strong>{fmt(outcome.before)}</strong> to <strong>{fmt(outcome.after)}</strong>: {outcome.direction === "same" ? "about the same" : outcome.direction}.</p>
            <button className="ghost-button" onClick={() => onApply(outcome.afterInput)} type="button">Apply this change to the tool</button>
          </Callout>
        </div>
      )}
    </Panel>
  );
}
