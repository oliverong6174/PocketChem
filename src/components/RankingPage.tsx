import { useEffect, useMemo, useRef, useState } from "react";
import { useIncomingMolecule } from "./ui/useIncomingMolecule";
import { MolecularFigure } from "./ui/MolecularFigure";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import {
  analyzeFunctionalGroupHierarchy,
  getMoleculeSvg,
} from "../utils/functionalGroups";
import {
  analyzeComparisonMolecule,
  COMPARISON_CATEGORIES,
  COMPARISON_MODES,
  getComparisonMode,
  type ComparisonCategory,
  type ComparisonModeId,
  type ComparisonProfile,
} from "../utils/ranking/comparisonAnalysis";
import { deriveRanking, displayedRankingSnapshot } from "../utils/ranking/rankingDisplay";
import WorkspaceNotice, { type WorkspaceNoticeItem } from "./WorkspaceNotice";
import { ToolHeader } from "./ui/primitives";
import { useWorkspacePersistence } from "../utils/persistence/useWorkspacePersistence";
import { DebouncedTask } from "../utils/persistence/debouncedTask";
import { restoreEditorContent } from "../utils/persistence/editorRestore";
import { ketHasStructureText, ketIdentityKey } from "../utils/persistence/ketIdentity";
import {
  RANKING_ENGINE_VERSION,
  validateRankingInputs,
  validateRankingResults,
  type DisplayedRanking,
  type RankingWorkspaceInputs,
  type RankingWorkspaceResults,
} from "../utils/persistence/rankingWorkspace";
import type { Capture, RecoveryOutcome } from "../utils/persistence/workspacePersistence";
import type { WorkspaceResults } from "../utils/persistence/workspaceStore";
import { getAppAnalysisLibrary } from "../utils/persistence/analysisLibraryApp";
import type { OpenedAnalysis } from "../utils/persistence/analysisLibrary";
import { transferIntoEditors } from "../utils/persistence/handoffTransfer";
import { ReplaceWorkspacePrompt, SaveAnalysisForm } from "./SavedAnalysisControls";
import { useSavedAnalysisOpen } from "../utils/persistence/useSavedAnalysisOpen";
import { describeRankingAnalysis } from "../utils/persistence/rankingWorkspace";

type ComparisonMolecule = {
  id: number;
  label: string;
  smiles: string;
  structureSvg: string | null;
  profile: ComparisonProfile;
};

const COMPARISON_LABELS = [
  "Molecule A",
  "Molecule B",
  "Molecule C",
  "Molecule D",
  "Molecule E",
] as const;

function getNextComparisonLabel(molecules: ComparisonMolecule[]) {
  const usedLabels = new Set(molecules.map((molecule) => molecule.label));
  return COMPARISON_LABELS.find((label) => !usedLabels.has(label)) ?? "Molecule";
}

function isMolBlockLike(value: unknown) {
  if (typeof value !== "string") return false;
  return (
    value.includes("M  END") ||
    value.includes("V2000") ||
    value.includes("V3000") ||
    value.includes("-INDIGO-") ||
    /^\s*\n?\s*-INDIGO-/i.test(value)
  );
}

function sanitizeDisplayedSmiles(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || isMolBlockLike(trimmed)) return "";
  return trimmed;
}

/** What the page knows about the comparison on screen. */
type RankingResultMeta = {
  computedAt: string;
  engineVersion: number;
  /** The set was loaded from a previous session instead of built in this one. */
  restored: boolean;
  /** Saved by an earlier version of the ranking code, or no longer sorts as it was shown. */
  engineMismatch: boolean;
  /** Set when the comparison was opened from the Saved Analyses library. */
  opened?: { name: string; savedAt: string } | null;
};

type RankingPageProps = {
  /** A saved analysis the user chose on the Saved page; opened once recovery has finished. */
  openRequest?: { id: string; recordId: string } | null;
  onOpenHandled?: (requestId: string) => void;
};

/** Explains how the order below was decided, from the same rows the cards use (presentation only). */
function OrderingBasis({ direction, total, ranked, distinctRanks }: { direction: string; total: number; ranked: number; distinctRanks: number }) {
  const unranked = total - ranked;
  const ties = ranked - distinctRanks;
  return (
    <section aria-label="How the order was decided" className="card ranking-basis" data-testid="ranking-basis">
      <p className="label">How the order was decided</p>
      {direction === "none" ? (
        <p>This is a side-by-side comparison, not a ranking: molecules are labelled A, B, C in the order you added them and no order is implied.</p>
      ) : (
        <ul>
          <li>Molecules are ordered by the criterion above, {direction === "asc" ? "lowest value first" : "highest value first"}. Values come from PocketChem's estimation models, not measurements.</li>
          <li><strong>{ranked}</strong> of {total} {total === 1 ? "molecule is" : "molecules are"} ranked{ties > 0 ? `; ${ties} ${ties === 1 ? "shares" : "share"} a rank with another because the values are equal` : ""}.</li>
          {unranked > 0 ? <li><strong>{unranked}</strong> {unranked === 1 ? "molecule is" : "molecules are"} not ranked: no tabulated or computed value exists for this criterion, so it is left out of the order rather than given an invented one.</li> : null}
        </ul>
      )}
    </section>
  );
}

export default function RankingPage({ openRequest = null, onOpenHandled }: RankingPageProps) {
  const [ketcher, setKetcher] = useState<KetcherApi | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [status, setStatus] = useState("Add a molecule to begin comparing.");
  const [comparisonMolecules, setComparisonMolecules] = useState<ComparisonMolecule[]>([]);
  const [activeCategory, setActiveCategory] = useState<ComparisonCategory>("Electronic effects");
  const [rankingMode, setRankingMode] = useState<ComparisonModeId>("ewgStrength");

  const activeMode = getComparisonMode(rankingMode);
  const visibleModes = useMemo(
    () => COMPARISON_MODES.filter((mode) => mode.category === activeCategory),
    [activeCategory],
  );

  const { rankedRows, rankById } = useMemo(
    () => deriveRanking(comparisonMolecules, rankingMode),
    [comparisonMolecules, rankingMode],
  );

  // ---- workspace recovery (Stage 8B-2A) --------------------------------------------------------
  // The comparison set (with each molecule's computed profile), the chosen category and mode, and
  // the structure in the editor are saved and come back after a reload or a visit to another page.
  // Restored profiles are not recalculated: the page orders them with the same code as before.
  const [snapshotTask] = useState(() => new DebouncedTask(async () => undefined));
  const { controller: persistence, recovery, status: persistenceStatus } = useWorkspacePersistence<
    RankingWorkspaceInputs,
    RankingWorkspaceResults
  >({
    page: "ranking",
    engineVersion: RANKING_ENGINE_VERSION,
    validateInputs: validateRankingInputs,
    validateResults: validateRankingResults,
    beforeLeave: () => snapshotTask.flushNow(),
  });
  const [resultMeta, setResultMeta] = useState<RankingResultMeta | null>(null);
  const [recoveryNotices, setRecoveryNotices] = useState<WorkspaceNoticeItem[]>([]);
  const [inputsOnlyRestored, setInputsOnlyRestored] = useState(false);
  const [editorRestoreVersion, setEditorRestoreVersion] = useState(0);
  const [isOpening, setIsOpening] = useState(false);
  const [saveForm, setSaveForm] = useState<{ name: string } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<WorkspaceNoticeItem | null>(null);
  const openingRef = useRef(false);
  const ketcherRef = useRef<KetcherApi | null>(null);
  const snapshotRef = useRef<{ ket: string | null; key: string | null }>({ ket: null, key: null });
  const pendingEditorRef = useRef<{ ket: string; key: string | null; token: number } | null>(null);
  const restoringRef = useRef(false);
  const svgAttemptedRef = useRef(new Set<number>());
  const appliedRecoveryRef = useRef<unknown>(null);
  const applyRestoreRef = useRef<((outcome: RecoveryOutcome<RankingWorkspaceInputs, RankingWorkspaceResults>) => void) | null>(null);
  const requestPersistRef = useRef<() => void>(() => undefined);
  const restoreEditorRef = useRef<() => void>(() => undefined);
  const latestRef = useRef({ comparisonMolecules, activeCategory, rankingMode, resultMeta, displayed: null as DisplayedRanking | null, isAnalyzing });

  function captureRanking(): Capture<RankingWorkspaceInputs, RankingWorkspaceResults> | null {
    const latest = latestRef.current;
    const snapshot = snapshotRef.current;
    const inputs: RankingWorkspaceInputs = {
      editorKet: snapshot.ket,
      editorKey: snapshot.key,
      activeCategory: latest.activeCategory,
      rankingMode: latest.rankingMode,
    };
    let results: WorkspaceResults<RankingWorkspaceResults> | null = null;
    const meta = latest.resultMeta;
    if (latest.comparisonMolecules.length > 0 && meta) {
      results = {
        computedAt: meta.computedAt,
        engineVersion: meta.engineVersion,
        stale: false,
        status: "complete",
        data: {
          molecules: latest.comparisonMolecules.map(({ id, label, smiles, profile }) => ({ id, label, smiles, profile })),
          displayed: latest.displayed,
        },
      };
    }
    if (!inputs.editorKet && !results) return null;
    return { inputs, results };
  }

  function requestPersist() {
    persistence.requestSave(captureRanking);
  }

  /** Reads the editor and refreshes the saved drawing. */
  async function takeEditorSnapshot() {
    const api = ketcherRef.current;
    if (!api || restoringRef.current || pendingEditorRef.current) return;
    const token = persistence.token();
    try {
      const ket = await Promise.race([
        api.getKet(),
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("Timed out reading the editor.")), 8000)),
      ]);
      const key = await ketIdentityKey(ket);
      if (!persistence.isCurrent(token) || restoringRef.current || pendingEditorRef.current) return;
      snapshotRef.current = { ket: ketHasStructureText(ket) ? ket : null, key };
      requestPersist();
    } catch (snapshotError) {
      console.warn("[PocketChem:Ranking] Could not read the editor for workspace recovery.", snapshotError);
    }
  }

  async function restoreEditor() {
    const pending = pendingEditorRef.current;
    const api = ketcherRef.current;
    if (!pending || !api || restoringRef.current || openingRef.current) return;
    restoringRef.current = true;
    const { token } = pending;
    // Opening a saved analysis invalidates a drawing restore, exactly like Clear does.
    const outcome = await restoreEditorContent(api, { ket: pending.ket, key: pending.key }, () => persistence.isCurrent(token) && !openingRef.current);
    if (persistence.isCurrent(token)) {
      pendingEditorRef.current = null;
      if (outcome.kind === "failed") {
        // Do not let an editor that failed to restore overwrite the saved copy.
        persistence.disable();
        setRecoveryNotices((notices) => [
          ...notices,
          { tone: "warn", text: "The saved drawing could not be restored into the editor. Your saved work was kept and will not be overwritten; use Clear all to start over." },
        ]);
      }
    }
    window.setTimeout(() => {
      restoringRef.current = false;
      if (outcome.kind === "user-content-kept") snapshotTask.schedule();
    }, 500);
  }

  function applyRestoredRanking(outcome: RecoveryOutcome<RankingWorkspaceInputs, RankingWorkspaceResults>) {
    if (appliedRecoveryRef.current === outcome) return;
    appliedRecoveryRef.current = outcome;
    if (outcome.kind === "rejected") {
      setRecoveryNotices([{ tone: "warn", text: `Saved work from a previous session could not be used (${outcome.message}). It was set aside and the page started clean.` }]);
      return;
    }
    if (outcome.kind !== "restored" || !persistence.isCurrent(outcome.epoch)) return;
    if (latestRef.current.comparisonMolecules.length > 0 || isAnalyzing) {
      setRecoveryNotices([{ tone: "info", text: "Saved work from a previous session was not restored because you had already started new work on this page." }]);
      return;
    }

    const { inputs, results } = outcome;
    const notices: WorkspaceNoticeItem[] = [];
    setActiveCategory(inputs.activeCategory);
    setRankingMode(inputs.rankingMode);
    snapshotRef.current = { ket: inputs.editorKet, key: inputs.editorKey };
    if (inputs.editorKet) {
      pendingEditorRef.current = { ket: inputs.editorKet, key: inputs.editorKey, token: outcome.epoch };
      setEditorRestoreVersion((version) => version + 1);
    }

    if (results) {
      const molecules: ComparisonMolecule[] = results.data.molecules.map((molecule) => ({ ...molecule, structureSvg: null }));
      // The saved profiles are ordered again by the page's own code; a different outcome than the
      // one that was shown means the ordering code changed, and the user is told.
      const saved = results.data.displayed;
      const again = deriveRanking(molecules, inputs.rankingMode);
      const derived = displayedRankingSnapshot(again.rankedRows, again.rankById, inputs.rankingMode);
      const orderChanged = Boolean(saved && saved.modeId === derived.modeId && JSON.stringify(saved) !== JSON.stringify(derived));
      setComparisonMolecules(molecules);
      setResultMeta({
        computedAt: results.computedAt,
        engineVersion: results.engineVersion,
        restored: true,
        engineMismatch: outcome.engineMismatch || orderChanged,
      });
      setStatus(`Restored ${molecules.length} molecule${molecules.length === 1 ? "" : "s"} from your previous session. Nothing was recalculated.`);
    } else if (inputs.editorKet) {
      setInputsOnlyRestored(true);
      setStatus("Restored your drawing from your previous session.");
    }
    if (outcome.resultsDropped) {
      notices.push({ tone: "warn", text: "Saved comparison results could not be validated and were not restored." });
    }
    if (outcome.migratedFrom !== null) {
      notices.push({ tone: "info", text: "Your saved workspace was upgraded from an older storage format." });
    }
    setRecoveryNotices(notices);
  }

  // ---- Saved Analyses (Stage 8B-3B-1) -----------------------------------------------------------
  // "Save Analysis" copies the comparison (every molecule's computed profile and the ranking as it
  // was shown) into the library; opening one puts it back without recalculating anything.

  function defaultAnalysisName(): string {
    const l = latestRef.current;
    const mode = getComparisonMode(l.rankingMode);
    return `Ranking of ${l.comparisonMolecules.length} molecule${l.comparisonMolecules.length === 1 ? "" : "s"}, ${mode.label}`.slice(0, 100);
  }

  async function saveCurrentAnalysis(name: string, announce = true): Promise<boolean> {
    setSaveBusy(true);
    try {
      await snapshotTask.flushNow();
      const capture = captureRanking();
      if (!capture || !capture.results || latestRef.current.isAnalyzing) {
        setSaveMessage({ tone: "warn", text: "Add at least one molecule to the comparison before saving." });
        return false;
      }
      const saved = await getAppAnalysisLibrary().save("ranking", {
        name,
        summary: describeRankingAnalysis(capture.results.data, capture.inputs.rankingMode),
        inputs: capture.inputs,
        results: capture.results,
      });
      if (!saved.ok) {
        setSaveMessage({ tone: "warn", text: `The analysis was not saved: ${saved.error.message}` });
        return false;
      }
      if (announce) setSaveMessage({ tone: "info", text: `Saved “${saved.value.name}” to Saved analyses.` });
      return true;
    } finally {
      setSaveBusy(false);
    }
  }

  /** Replaces the Ranking workspace with a saved analysis, as one transaction (see transferIntoEditors). */
  async function applySavedAnalysis(opened: OpenedAnalysis<RankingWorkspaceInputs, RankingWorkspaceResults>): Promise<boolean> {
    const api = ketcherRef.current;
    if (!api || openingRef.current) return false;
    openingRef.current = true;
    setIsOpening(true);
    snapshotTask.cancel();
    restoringRef.current = true;
    const { inputs, results } = opened;
    const outcome = await transferIntoEditors(
      [{ api, source: inputs.editorKet, expectKey: inputs.editorKet ? inputs.editorKey : null }],
      persistence,
    );
    if (outcome.kind !== "adopted") {
      setRecoveryNotices((notices) => [
        ...notices,
        {
          tone: "warn",
          text:
            outcome.kind === "rolled-back"
              ? `“${opened.record.name}” could not be opened. Your Ranking workspace is unchanged.`
              : `“${opened.record.name}” could not be opened and the editor could not be restored. Your saved workspace is unchanged; reload this page to bring it back.`,
        },
      ]);
      if (outcome.kind === "rolled-back") requestPersistRef.current();
      openingRef.current = false;
      setIsOpening(false);
      window.setTimeout(() => {
        restoringRef.current = false;
      }, 500);
      return false;
    }

    // Success: the old workspace's callbacks are invalid and the saved analysis is the workspace now.
    pendingEditorRef.current = null;
    snapshotRef.current = { ket: outcome.editors[0].ket, key: outcome.editors[0].key };
    svgAttemptedRef.current.clear(); // previews are drawn again for the opened molecules
    setActiveCategory(inputs.activeCategory);
    setRankingMode(inputs.rankingMode);
    setInputsOnlyRestored(false);
    setRecoveryNotices(
      opened.resultsDropped ? [{ tone: "warn", text: "The saved comparison could not be validated and was not opened. The drawing was." }] : [],
    );
    if (results) {
      const molecules: ComparisonMolecule[] = results.data.molecules.map((molecule) => ({ ...molecule, structureSvg: null }));
      const saved = results.data.displayed;
      const again = deriveRanking(molecules, inputs.rankingMode);
      const derived = displayedRankingSnapshot(again.rankedRows, again.rankById, inputs.rankingMode);
      const orderChanged = Boolean(saved && saved.modeId === derived.modeId && JSON.stringify(saved) !== JSON.stringify(derived));
      setComparisonMolecules(molecules);
      setResultMeta({
        computedAt: results.computedAt,
        engineVersion: results.engineVersion,
        restored: false,
        opened: { name: opened.record.name, savedAt: opened.record.updatedAt },
        engineMismatch: opened.engineMismatch || orderChanged,
      });
      setStatus(`Opened saved analysis “${opened.record.name}” with ${molecules.length} molecule${molecules.length === 1 ? "" : "s"}. Nothing was recalculated.`);
    } else {
      setComparisonMolecules([]);
      setResultMeta(null);
      setStatus(`Opened saved analysis “${opened.record.name}” (drawing only).`);
    }
    // One write replaces the automatic workspace with the opened analysis.
    persistence.requestSave(() => ({ inputs: opened.inputs, results: opened.results }));
    await persistence.flush();
    openingRef.current = false;
    setIsOpening(false);
    window.setTimeout(() => {
      restoringRef.current = false;
      snapshotTask.schedule();
    }, 500);
    return true;
  }

  const savedOpen = useSavedAnalysisOpen<RankingWorkspaceInputs, RankingWorkspaceResults>({
    page: "ranking",
    openRequest,
    onOpenHandled,
    ready: recovery !== null && ketcher !== null,
    busyReason: () =>
      latestRef.current.isAnalyzing || openingRef.current ? "Wait for the current analysis to finish before opening a saved one." : null,
    hasUnsavedWork: () => captureRanking() !== null,
    canSaveCurrent: () => Boolean(latestRef.current.resultMeta) && latestRef.current.comparisonMolecules.length > 0,
    saveCurrent: (name) => saveCurrentAnalysis(name, false),
    defaultName: defaultAnalysisName,
    apply: applySavedAnalysis,
    notify: (item) => setRecoveryNotices((notices) => [...notices, item]),
  });

  useEffect(() => {
    ketcherRef.current = ketcher;
    requestPersistRef.current = requestPersist;
    restoreEditorRef.current = () => void restoreEditor();
    applyRestoreRef.current = applyRestoredRanking;
    snapshotTask.setTask(takeEditorSnapshot);
    latestRef.current = {
      comparisonMolecules,
      activeCategory,
      rankingMode,
      resultMeta,
      displayed: displayedRankingSnapshot(rankedRows, rankById, rankingMode),
      isAnalyzing,
    };
  });

  // Autosave: only settled state is watched (the debounce keeps rapid edits out of storage).
  useEffect(() => {
    requestPersistRef.current();
  }, [comparisonMolecules, activeCategory, rankingMode, resultMeta]);

  useEffect(() => {
    if (!recovery) return;
    try {
      applyRestoreRef.current?.(recovery);
    } finally {
      // Saving starts only after the recovered record has been applied (or deliberately skipped).
      persistence.resumeAfterRestore();
    }
  }, [recovery, persistence]);

  useEffect(() => {
    if (ketcher && pendingEditorRef.current) restoreEditorRef.current();
  }, [ketcher, editorRestoreVersion]);

  // Previews are drawn again from the saved SMILES (they are not stored).
  useEffect(() => {
    const missing = comparisonMolecules.filter((m) => m.structureSvg === null && !svgAttemptedRef.current.has(m.id));
    if (missing.length === 0) return;
    missing.forEach((m) => svgAttemptedRef.current.add(m.id));
    void Promise.all(
      missing.map(async (m) => ({ id: m.id, smiles: m.smiles, svg: await getMoleculeSvg(m.smiles).catch(() => null) })),
    ).then((entries) => {
      setComparisonMolecules((previous) =>
        previous.map((m) => {
          const entry = entries.find((candidate) => candidate.id === m.id && candidate.smiles === m.smiles);
          return entry && entry.svg && m.structureSvg === null ? { ...m, structureSvg: entry.svg } : m;
        }),
      );
    });
  }, [comparisonMolecules]);

  useEffect(() => {
    return () => snapshotTask.cancel();
  }, [snapshotTask]);

  function handleEditorChange() {
    // Programmatic restores are not user edits.
    if (restoringRef.current) return;
    snapshotTask.schedule();
  }

  async function discardRecovered() {
    void persistence.discard();
    pendingEditorRef.current = null;
    snapshotRef.current = { ket: null, key: null };
    snapshotTask.cancel();
    setComparisonMolecules([]);
    setResultMeta(null);
    setInputsOnlyRestored(false);
    setRecoveryNotices([]);
    setStatus("Recovered work discarded.");
    try {
      await ketcher?.setMolecule("");
    } catch {
      // The editor will simply keep its content.
    }
  }

  // What was recovered and what could not be saved.
  const workspaceNotices: WorkspaceNoticeItem[] = [...recoveryNotices];
  if (resultMeta?.restored) {
    workspaceNotices.push({
      tone: "info",
      text: `Molecules restored from your previous session (computed ${new Date(resultMeta.computedAt).toLocaleString()}) were not recalculated.`,
    });
  } else if (inputsOnlyRestored) {
    workspaceNotices.push({ tone: "info", text: "Restored your drawing from your previous session." });
  }
  if (resultMeta?.opened) {
    workspaceNotices.push({
      tone: "info",
      text: `Opened saved analysis “${resultMeta.opened.name}” (saved ${new Date(resultMeta.opened.savedAt).toLocaleString()}; computed ${new Date(resultMeta.computedAt).toLocaleString()}). The profiles were not recalculated.`,
    });
  }
  if (saveMessage) workspaceNotices.push(saveMessage);
  if (resultMeta?.engineMismatch) {
    workspaceNotices.push({
      tone: "warn",
      text: "These results were saved by an earlier version of the ranking code, or they no longer sort the way they did. They are shown as saved profiles and were not recalculated.",
    });
  }
  if (!persistenceStatus.available) {
    workspaceNotices.push({ tone: "warn", text: "Browser storage is unavailable, so your work on this page will not be saved." });
  }
  if (persistenceStatus.saveError) {
    workspaceNotices.push({
      tone: "warn",
      text: persistenceStatus.saveError.code === "quota"
        ? "Your latest changes could not be saved because browser storage is full."
        : `Your latest changes could not be saved (${persistenceStatus.saveError.message}).`,
    });
  }
  if (persistenceStatus.resultsOmitted) {
    workspaceNotices.push({ tone: "warn", text: "The comparison was too large to save; your drawing was saved without it." });
  }

  async function addCurrentMoleculeToComparison(throwOnError = false) {
    if (!ketcher) {
      setStatus("Molecule editor is still loading. Try again in a second.");
      return;
    }

    if (isAnalyzing || openingRef.current) return;
    if (comparisonMolecules.length >= 5) {
      setStatus("Comparison list is full. You can compare up to 5 molecules.");
      return;
    }

    setIsAnalyzing(true);
    setStatus("Calculating all comparison modes for this molecule…");

    try {
      const rawSmiles = await ketcher.getSmiles();
      const safeSmiles = sanitizeDisplayedSmiles(rawSmiles);

      if (!safeSmiles) {
        setStatus("Draw or enter a molecule before adding it to comparison.");
        return;
      }

      if (safeSmiles.includes(".")) {
        setStatus("Please use one molecule at a time on the Ranking page.");
        return;
      }

      if (comparisonMolecules.some((molecule) => molecule.smiles === safeSmiles)) {
        setStatus("That molecule is already in the comparison list.");
        return;
      }

      const hierarchy = await analyzeFunctionalGroupHierarchy(safeSmiles);
      const [profile, svg] = await Promise.all([
        analyzeComparisonMolecule(safeSmiles, hierarchy),
        getMoleculeSvg(safeSmiles),
      ]);

      const nextLabel = getNextComparisonLabel(comparisonMolecules);
      const newMolecule: ComparisonMolecule = {
        id: Date.now() + Math.random(),
        label: nextLabel,
        smiles: safeSmiles,
        structureSvg: svg,
        profile,
      };

      setComparisonMolecules((previous) => [...previous, newMolecule]);
      // The first molecule of a set starts its record; a restored set keeps its original details.
      setResultMeta((meta) => meta ?? { computedAt: new Date().toISOString(), engineVersion: RANKING_ENGINE_VERSION, restored: false, engineMismatch: false });
      setInputsOnlyRestored(false);
      setStatus(`${nextLabel} added. All comparison categories are ready.`);
    } catch (error) {
      console.error("Ranking comparison analysis error:", error);
      setStatus("Something went wrong while calculating comparison modes.");
      if (throwOnError) throw error;
    } finally {
      setIsAnalyzing(false);
    }
  }

  function deleteComparisonMolecule(id: number) {
    if (comparisonMolecules.length <= 1) setResultMeta(null);
    setComparisonMolecules((previous) => previous.filter((molecule) => molecule.id !== id));
    setStatus("Molecule removed from comparison.");
  }

  async function clearCurrentMolecule() {
    await ketcher?.setMolecule("");
    snapshotTask.schedule();
    setStatus("Editor cleared. Your comparison set is unchanged.");
  }

  function clearComparison() {
    // Clear all also discards the saved comparison and invalidates any restoration still in flight.
    void persistence.discard();
    setResultMeta(null);
    setInputsOnlyRestored(false);
    setRecoveryNotices([]);
    setComparisonMolecules([]);
    snapshotTask.schedule();
    setStatus("Comparison set cleared.");
  }

  function selectCategory(category: ComparisonCategory) {
    setActiveCategory(category);
    const firstMode = COMPARISON_MODES.find((mode) => mode.category === category);
    if (firstMode) setRankingMode(firstMode.id);
  }

  const incoming = useIncomingMolecule({ destination: "acidBase", api: ketcher, ready: recovery !== null && ketcher !== null, expectRestore: recovery?.kind === "restored" });
  return (
    <section className="ranking-page">
{incoming}
      <div className="ranking-hero">
        <ToolHeader
          group="Analyze"
          title="Ranking"
          headingLevel={1}
          purpose="Add up to five molecules once, then compare electronic effects, stability, mechanisms, spectroscopy, physical properties, and more."
          evidence="estimate"
          steps={[
            { label: "Add molecules", detail: "Up to five, by drawing or by name." },
            { label: "Pick a comparison", detail: "Choose a category, then a ranking." },
            { label: "Read the order", detail: "Ties share a rank; reasons are listed." },
          ]}
        />
        <div className="ranking-count-card" aria-label={`${comparisonMolecules.length} comparison molecules`}>
          <strong>{comparisonMolecules.length}</strong>
          <span>/ 5 molecules</span>
        </div>
      </div>

      <WorkspaceNotice
        notices={workspaceNotices}
        onDiscard={resultMeta?.restored || inputsOnlyRestored ? () => void discardRecovered() : undefined}
        discardDisabled={isAnalyzing}
      />

      {savedOpen.prompt && (
        <ReplaceWorkspacePrompt
          name={savedOpen.prompt.opened.record.name}
          canSaveFirst={Boolean(resultMeta) && comparisonMolecules.length > 0 && !isAnalyzing}
          busy={savedOpen.saveBusy}
          onChoose={(choice) => void savedOpen.resolve(choice)}
        />
      )}

      <div className="ranking-workspace">
        <aside className="card ranking-editor-card">
          <div className="card-header">
            <div>
              <h2>Add molecule</h2>
              
            </div>
            {ketcher ? null : <span className="status loading" role="status">Loading editor</span>}
          </div>

          <div className="ranking-ketcher-box">
            <MoleculeDrawer
              globalKey="rankingKetcher"
              onReady={setKetcher}
              onChange={handleEditorChange}
              onStructureLoaded={() => snapshotTask.schedule()}
              onNameSubmitProcess={() => addCurrentMoleculeToComparison(true)}
            />
          </div>

          <div className="ranking-editor-actions">
            <button
              className="primary-button"
              onClick={() => void addCurrentMoleculeToComparison()}
              disabled={isAnalyzing || !ketcher || comparisonMolecules.length >= 5}
            >
              {isAnalyzing ? "Analyzing…" : "Add to comparison"}
            </button>
            <button
              className="secondary-button"
              onClick={clearCurrentMolecule}
              disabled={isAnalyzing || !ketcher}
            >
              Clear editor
            </button>
            <button
              className="secondary-button"
              onClick={clearComparison}
              disabled={isAnalyzing || comparisonMolecules.length === 0}
            >
              Clear all
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                setSaveMessage(null);
                setSaveForm({ name: defaultAnalysisName() });
              }}
              disabled={!resultMeta || comparisonMolecules.length === 0 || isAnalyzing || isOpening || saveBusy}
              title={comparisonMolecules.length > 0 ? "Keep this comparison in Saved analyses" : "Add a molecule first"}
            >
              Save Analysis
            </button>
          </div>

          {saveForm && (
            <SaveAnalysisForm
              name={saveForm.name}
              busy={saveBusy}
              onChange={(name) => setSaveForm({ name })}
              onCancel={() => setSaveForm(null)}
              onSubmit={() => {
                void saveCurrentAnalysis(saveForm.name).then((saved) => {
                  if (saved) setSaveForm(null);
                });
              }}
            />
          )}

          <p className="reaction-progress ranking-status" aria-live="polite">
            {isAnalyzing && <span className="loading-spinner" aria-hidden="true" />}
            {status}
          </p>

          <div className="ranking-editor-note">
            <strong>One analysis, every mode.</strong>
            <span>
              PocketChem calculates the comparison profile when a molecule is added,
              so switching categories does not re-run the molecule.
            </span>
          </div>
        </aside>

        <main className="ranking-main-column">
          <section className="card ranking-selector-card">
            <div className="ranking-selector-heading">
              <div>
                <p className="label">Comparison category</p>
                <h2>{activeCategory}</h2>
              </div>
              <span className="ranking-mode-count">
                {visibleModes.length} mode{visibleModes.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="ranking-select-grid">
              <label className="ranking-select-field">
                <span>Category</span>
                <select
                  value={activeCategory}
                  onChange={(event) =>
                    selectCategory(event.target.value as ComparisonCategory)
                  }
                  aria-label="Comparison category"
                >
                  {COMPARISON_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label className="ranking-select-field">
                <span>Comparison</span>
                <select
                  value={rankingMode}
                  onChange={(event) =>
                    setRankingMode(event.target.value as ComparisonModeId)
                  }
                  aria-label="Comparison mode"
                >
                  {visibleModes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="card ranking-active-mode-card">
            <div className="ranking-active-mode-copy">
              <div>
                <p className="label">Current comparison</p>
                <h2>{activeMode.label}</h2>
                <p>{activeMode.description}</p>
              </div>
              <span className={`ranking-kind-badge ${activeMode.direction === "none" ? "compare" : "rank"}`}>
                {activeMode.direction === "none" ? "Compare" : "Rank"}
              </span>
            </div>
            {activeMode.assumption && (
              <p className="ranking-assumption"><strong>Assumption:</strong> {activeMode.assumption}</p>
            )}
          </section>

          {comparisonMolecules.length === 0 ? (
            <section className="card ranking-empty-state">
              <div className="ranking-empty-number">01</div>
              <h2>Add your first molecule</h2>
              <p>
                Use the editor or type a molecule name. Once it is added, the same
                molecule can be compared across every category without redrawing it.
              </p>
            </section>
          ) : (
            <>
            <OrderingBasis direction={activeMode.direction} total={rankedRows.length} ranked={rankedRows.filter(({ molecule, metric }) => (metric.score !== null || Boolean(metric.sortVector)) && rankById.get(molecule.id) !== undefined).length} distinctRanks={new Set(rankedRows.map(({ molecule }) => rankById.get(molecule.id)).filter((rank) => rank !== undefined)).size} />
            <section className="ranking-results-list" aria-label={`${activeMode.label} results`}>
              {rankedRows.map(({ molecule, metric }) => {
                const displayRank = rankById.get(molecule.id);
                const isRankable = metric.score !== null || Boolean(metric.sortVector);
                return (
                  <article className="card ranking-result-card" key={molecule.id}>
                    <div className="ranking-result-rank">
                      {activeMode.direction === "none" ? (
                        <span>{molecule.label.replace("Molecule ", "")}</span>
                      ) : isRankable && displayRank !== undefined ? (
                        <>
                          <small>Rank</small>
                          <strong>#{displayRank}</strong>
                        </>
                      ) : (
                        <span className="ranking-unranked" title="No ranking for this comparison: the molecule has no tabulated or computed value for it."><span aria-hidden="true">—</span><span className="pc-visually-hidden">Not ranked</span></span>
                      )}
                    </div>

                    <div className="ranking-result-structure">
                      {molecule.structureSvg ? (
                        <MolecularFigure
                          className="molecule-preview ranking-molecule-preview"
                          source={{ smiles: molecule.smiles, label: molecule.label }}
                          svg={molecule.structureSvg}
                          title={`Structure of ${molecule.label}`}
                        />
                      ) : (
                        <div className="ranking-no-structure">No preview</div>
                      )}
                    </div>

                    <div className="ranking-result-copy">
                      <div className="ranking-result-title-row">
                        <div>
                          <p className="ranking-result-label">{molecule.label}</p>
                          <h3>{metric.headline}</h3>
                        </div>
                        <button
                          className="ranking-delete-button"
                          type="button"
                          onClick={() => deleteComparisonMolecule(molecule.id)}
                          aria-label={`Delete ${molecule.label}`}
                        >
                          Delete
                        </button>
                      </div>

                      <p className="ranking-result-detail">{metric.detail}</p>

                      {metric.factors && metric.factors.length > 0 && (
                        <details className="ranking-factors">
                          <summary>Why this result?</summary>
                          <ul>
                            {metric.factors.slice(0, 6).map((factor, index) => (
                              <li key={`${molecule.id}-${index}`}>{factor}</li>
                            ))}
                          </ul>
                        </details>
                      )}

                      <div className="ranking-molecule-meta">
                        <span>{molecule.profile.formula || "Formula unavailable"}</span>
                        <code>{molecule.smiles}</code>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
            </>
          )}
        </main>
      </div>
    </section>
  );
}
