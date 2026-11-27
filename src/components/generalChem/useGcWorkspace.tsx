import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReplaceWorkspacePrompt, SaveAnalysisForm } from "../SavedAnalysisControls";
import WorkspaceNotice, { type WorkspaceNoticeItem } from "../WorkspaceNotice";
import { getAppAnalysisLibrary } from "../../utils/persistence/analysisLibraryApp";
import type { OpenedAnalysis } from "../../utils/persistence/analysisLibrary";
import type { ToolResults } from "../../utils/persistence/generalChemTools";
import { useSavedAnalysisOpen } from "../../utils/persistence/useSavedAnalysisOpen";
import { useWorkspacePersistence } from "../../utils/persistence/useWorkspacePersistence";
import type { PersistedPage } from "../../utils/persistence/workspaceStore";
import type { Capture, RecoveryOutcome } from "../../utils/persistence/workspacePersistence";

// Autosave + saved analyses shared by the three Stage 12 tools. --------------------------------------------------------

type WorkspaceConfig<I> = {
  page: PersistedPage;
  engineVersion: number;
  defaults: I;
  validateInputs: (raw: unknown) => I | null;
  validateResults: (raw: unknown) => ToolResults | null;
  /** Re-derives the saved summary from valid inputs (null when the inputs give no result). */
  summarize: (inputs: I) => ToolResults | null;
  describe: (inputs: I) => string;
  fallbackName: string;
  openRequest: { id: string; recordId: string } | null;
  onOpenHandled?: (requestId: string) => void;
  /** Called when the user presses Reset (the Physics pages stop their clock and zero the shared time). */
  onReset?: () => void;
};

/** Autosave, restore, Save Analysis and open-from-Saved for a tool whose whole state is one validated inputs object. */
export function useGcWorkspace<I>(cfg: WorkspaceConfig<I>) {
  const { page, engineVersion, defaults, validateInputs, validateResults, summarize, describe, fallbackName } = cfg;
  const [raw, setRaw] = useState<I>(defaults);
  const touchedRef = useRef(false);
  const [notices, setNotices] = useState<WorkspaceNoticeItem[]>([]);
  const [saveForm, setSaveForm] = useState<{ name: string } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<WorkspaceNoticeItem | null>(null);
  const [openedName, setOpenedName] = useState<string | null>(null);

  const update = useCallback((fn: (current: I) => I) => {
    touchedRef.current = true;
    setSaveMessage(null);
    setRaw(fn);
  }, []);
  const onResetRef = useRef(cfg.onReset);
  useEffect(() => { onResetRef.current = cfg.onReset; });
  const reset = useCallback(() => {
    onResetRef.current?.();
    touchedRef.current = true;
    setSaveMessage(null);
    setOpenedName(null);
    setRaw(structuredClone(defaults));
    setNotices([{ tone: "info", text: "Reset to the example values." }]);
  }, [defaults]);

  const valid = useMemo(() => validateInputs(raw), [raw, validateInputs]);
  const live = useMemo(() => (valid ? summarize(valid) : null), [valid, summarize]);

  const { controller: persistence, recovery, status: persistenceStatus } = useWorkspacePersistence<I, ToolResults>({
    page,
    engineVersion,
    validateInputs,
    validateResults,
  });
  const latestRef = useRef({ raw, live });
  const requestPersistRef = useRef<() => void>(() => undefined);
  const appliedRecoveryRef = useRef<unknown>(null);

  function captureWorkspace(): Capture<I, ToolResults> | null {
    const { raw: current, live: results } = latestRef.current;
    const inputs = validateInputs(current);
    if (!inputs || !touchedRef.current) return null;
    return { inputs, results: results ? { computedAt: new Date().toISOString(), engineVersion, stale: false, status: "complete", data: results } : null };
  }
  useEffect(() => {
    latestRef.current = { raw, live };
    requestPersistRef.current = () => persistence.requestSave(captureWorkspace);
  });
  useEffect(() => { requestPersistRef.current(); }, [raw]);

  useEffect(() => {
    if (!recovery || appliedRecoveryRef.current === recovery) return;
    appliedRecoveryRef.current = recovery;
    try {
      const outcome = recovery as RecoveryOutcome<I, ToolResults>;
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

  const defaultName = () => (valid ? describe(valid) : fallbackName).slice(0, 100);

  async function saveCurrentAnalysis(name: string, announce = true): Promise<boolean> {
    setSaveBusy(true);
    try {
      const inputs = validateInputs(latestRef.current.raw);
      const results = latestRef.current.live;
      if (!inputs || !results) {
        setSaveMessage({ tone: "warn", text: "Fix the highlighted values before saving: only a valid analysis can be saved." });
        return false;
      }
      const result = await getAppAnalysisLibrary().save(page, {
        name,
        summary: describe(inputs),
        inputs,
        results: { computedAt: new Date().toISOString(), engineVersion, stale: false, status: "complete", data: results },
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

  async function applySavedAnalysis(opened: OpenedAnalysis<I, ToolResults>): Promise<boolean> {
    touchedRef.current = true;
    setRaw(opened.inputs);
    setOpenedName(opened.record.name);
    const fresh = summarize(opened.inputs);
    const saved = opened.results?.data;
    const changed = saved && fresh && (opened.results!.engineVersion !== engineVersion || Math.abs(saved.check - fresh.check) > 1e-6 * Math.max(1, Math.abs(saved.check)));
    setNotices(
      changed
        ? [{ tone: "warn", text: `The calculation model changed since “${opened.record.name}” was saved (saved ${saved!.checkLabel} ${Number(saved!.check.toPrecision(5))}, now ${Number(fresh!.check.toPrecision(5))}). The current values are shown.` }]
        : opened.resultsDropped
          ? [{ tone: "warn", text: "The saved summary could not be validated; your values were opened and recalculated." }]
          : [{ tone: "info", text: `Opened “${opened.record.name}”. Results were recalculated from the saved values.` }],
    );
    return true;
  }

  const savedOpen = useSavedAnalysisOpen<I, ToolResults>({
    page,
    openRequest: cfg.openRequest,
    onOpenHandled: cfg.onOpenHandled,
    ready: recovery !== null,
    busyReason: () => null,
    hasUnsavedWork: () => touchedRef.current,
    canSaveCurrent: () => Boolean(latestRef.current.live),
    saveCurrent: (name) => saveCurrentAnalysis(name, false),
    defaultName,
    apply: applySavedAnalysis,
    notify: (item) => setNotices((items) => [...items, item]),
  });

  const workspaceNotices: WorkspaceNoticeItem[] = [...notices];
  if (saveMessage) workspaceNotices.push(saveMessage);
  if (!persistenceStatus.available) workspaceNotices.push({ tone: "warn", text: "Browser storage is unavailable, so your work on this page will not be saved." });
  if (persistenceStatus.saveError) workspaceNotices.push({ tone: "warn", text: `Your latest changes could not be saved (${persistenceStatus.saveError.message}).` });

  const chrome = (
    <>
      <WorkspaceNotice notices={workspaceNotices} />
      {savedOpen.prompt && (
        <ReplaceWorkspacePrompt
          busy={savedOpen.saveBusy}
          canSaveFirst={Boolean(live)}
          name={savedOpen.prompt.opened.record.name}
          onChoose={(choice) => void savedOpen.resolve(choice)}
        />
      )}
    </>
  );
  const actions = (
    <div className="gc-toolbar-actions">
      <button className="secondary-button" onClick={reset} type="button">Reset</button>
      <button className="secondary-button" disabled={!live} onClick={() => { setSaveMessage(null); setSaveForm({ name: defaultName() }); }} type="button">Save Analysis</button>
    </div>
  );
  const saveFormEl = (
    <>
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
    </>
  );
  return { raw, update, reset, valid, live, chrome, actions, saveFormEl };
}
