import { useEffect, useMemo, useRef, useState } from "react";
import { MolecularFigure } from "./ui/MolecularFigure";
import { useIncomingMolecule } from "./ui/useIncomingMolecule";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import WorkspaceNotice, { type WorkspaceNoticeItem } from "./WorkspaceNotice";
import { ReplaceWorkspacePrompt, SaveAnalysisForm } from "./SavedAnalysisControls";
import { analyzeFunctionalGroupHierarchy, getCondensedSulfonateSvg } from "../utils/functionalGroups";
import { analyzeNomenclatureAndProperties } from "../utils/nomenclatureUtils";
import { getSequentialConditionOptions, reactionRegistry, type SequentialConditionOption } from "../utils/reactionUtils";
import {
  addMaterial,
  assessWorkspace,
  candidateLotSelections,
  createWorkspace,
  executeWorkspaceStep,
  replayActions,
  structuralArity,
  type ReactionWorkspace,
  type WorkspaceAssessment,
  type WorkspaceStep,
  type WorkspaceStepRequest,
} from "../utils/reactions/engine/reactionWorkspace";
import {
  STEP_STATUS_CHIP,
  STEP_STATUS_HEADING,
  catalysisSummaryLines,
  combinationLabel,
  conditionLines,
  inventoryGroups,
  isUnresolvedStep,
  lotLabel,
  lotLabelById,
  lotOrigin,
  outcomeSummary,
  pendingSelection,
  roleLines,
  selectivityCountsLine,
  selectivityIsCaution,
  selectivityText,
  verificationWording,
} from "../utils/reactions/engine/workspacePresentation";
import { assessWorkspaceCatalysis } from "../utils/reactions/engine/workspaceCatalysis";
import { getAppAnalysisLibrary } from "../utils/persistence/analysisLibraryApp";
import type { OpenedAnalysis } from "../utils/persistence/analysisLibrary";
import {
  MULTICATALYTIC_ENGINE_VERSION,
  describeMulticatalyticAnalysis,
  multicatalyticInputKey,
  validateMulticatalyticInputs,
  validateMulticatalyticResults,
  type MulticatalyticAssessmentSummary,
  type MulticatalyticWorkspaceInputs,
  type MulticatalyticWorkspaceResults,
} from "../utils/persistence/multicatalyticWorkspace";
import { useWorkspacePersistence } from "../utils/persistence/useWorkspacePersistence";
import { useSavedAnalysisOpen } from "../utils/persistence/useSavedAnalysisOpen";
import type { Capture, RecoveryOutcome } from "../utils/persistence/workspacePersistence";
import type { WorkspaceResults } from "../utils/persistence/workspaceStore";
import { Callout, ToolHeader } from "./ui/primitives";
import { WorkspaceRoutePanel } from "./multicatalytic/RouteViews";
import { buildWorkspaceOverview } from "../utils/reactions/engine/workspaceRoute";

type SvgMap = Record<string, string | null>;
type Selection = { ruleId: string | null; lotIds: string[] };
type AssessmentState = { workspace: ReactionWorkspace | null; data: MulticatalyticAssessmentSummary | null; saved: boolean };

const EMPTY_SELECTION: Selection = { ruleId: null, lotIds: [] };
const UNDO_LIMIT = 20;
const RULE_LIST_LIMIT = 60;

async function moleculeDisplayName(smiles: string): Promise<string> {
  try {
    const hierarchy = await analyzeFunctionalGroupHierarchy(smiles);
    const functionalGroups = hierarchy.functionalGroups ?? [];
    const identity = await analyzeNomenclatureAndProperties(
      smiles,
      hierarchy.primaryGroups,
      hierarchy.mainGroup ?? functionalGroups[0] ?? null,
    );
    return identity.nomenclature.displayName || identity.nomenclature.estimatedName || "Unnamed structure";
  } catch {
    return "Unnamed structure";
  }
}

type Props = {
  openRequest?: { id: string; recordId: string } | null;
  onOpenHandled?: (requestId: string) => void;
};

export default function ReactionWorkspacePanel({ openRequest = null, onOpenHandled }: Props) {
  const [ketcher, setKetcher] = useState<KetcherApi | null>(null);
  const [workspace, setWorkspace] = useState<ReactionWorkspace | null>(null);
  const [past, setPast] = useState<ReactionWorkspace[]>([]);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [query, setQuery] = useState("");
  const [showEveryReaction, setShowEveryReaction] = useState(false);
  const [fitState, setFitState] = useState<{ key: string; ids: Set<string> | null } | null>(null);
  const [suggestionState, setSuggestionState] = useState<{ key: string; list: string[][] } | null>(null);
  const [assessment, setAssessment] = useState<AssessmentState>({ workspace: null, data: null, saved: false });
  const [svgs, setSvgs] = useState<SvgMap>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Draw a molecule or enter a name, then add it to the inventory.");
  const [error, setError] = useState<string | null>(null);
  const [recoveryNotices, setRecoveryNotices] = useState<WorkspaceNoticeItem[]>([]);
  const [restoredFrom, setRestoredFrom] = useState<{ computedAt: string; opened: { name: string; savedAt: string } | null } | null>(null);
  const [engineMismatch, setEngineMismatch] = useState(false);
  const [replayable, setReplayable] = useState<MulticatalyticWorkspaceInputs["actions"] | null>(null);
  const [saveForm, setSaveForm] = useState<{ name: string } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<WorkspaceNoticeItem | null>(null);
  // A what-if only (never saved): completed steps the user imagines sharing one vessel.
  const [vesselSteps, setVesselSteps] = useState<number[]>([]);

  // Latest values for asynchronous work and for the debounced save, which must never see stale state.
  const workspaceRef = useRef<ReactionWorkspace | null>(null);
  const selectionRef = useRef<Selection>(EMPTY_SELECTION);
  const assessmentRef = useRef<AssessmentState>(assessment);
  const computedAtRef = useRef<string>(new Date().toISOString());
  const busyRef = useRef(false);
  const inFlightRef = useRef<Promise<unknown> | null>(null);
  const mountedRef = useRef(true);
  const namedRef = useRef<Set<string>>(new Set());
  const renderedRef = useRef<Set<string>>(new Set());

  const { controller: persistence, recovery } = useWorkspacePersistence<
    MulticatalyticWorkspaceInputs,
    MulticatalyticWorkspaceResults
  >({
    page: "multicatalytic",
    engineVersion: MULTICATALYTIC_ENGINE_VERSION,
    validateInputs: validateMulticatalyticInputs,
    validateResults: validateMulticatalyticResults,
    // Leaving the page waits for a step that is still running, so its result is saved, not lost.
    beforeLeave: async () => {
      await inFlightRef.current?.catch(() => undefined);
    },
  });

  const allOptions = useMemo(() => getSequentialConditionOptions(reactionRegistry), []);
  const ruleById = useMemo(() => new Map(reactionRegistry.map((rule) => [rule.id, rule])), []);
  const selectedRule = selection.ruleId ? ruleById.get(selection.ruleId) ?? null : null;
  const requirement = useMemo(() => (selectedRule ? structuralArity(selectedRule) : null), [selectedRule]);

  useEffect(() => {
    workspaceRef.current = workspace;
    selectionRef.current = selection;
    assessmentRef.current = assessment;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ---- persistence -----------------------------------------------------------------------------

  function captureWorkspace(): Capture<MulticatalyticWorkspaceInputs, MulticatalyticWorkspaceResults> | null {
    const current = workspaceRef.current;
    if (!current) return null;
    const inputs: MulticatalyticWorkspaceInputs = {
      actions: current.actions,
      selection: { ruleId: selectionRef.current.ruleId, lotIds: selectionRef.current.lotIds },
    };
    const assessed = assessmentRef.current;
    const results: WorkspaceResults<MulticatalyticWorkspaceResults> = {
      computedAt: computedAtRef.current,
      engineVersion: MULTICATALYTIC_ENGINE_VERSION,
      stale: false,
      status: current.records.length > 0 ? "workspace" : "workspace-empty",
      data: {
        inputKey: multicatalyticInputKey(current.actions),
        workspace: current,
        assessment: assessed.workspace === current ? assessed.data : null,
      },
    };
    return { inputs, results };
  }

  useEffect(() => {
    persistence.requestSave(captureWorkspace);
    // captureWorkspace reads refs, so only the state that changes what is saved is watched.
  }, [workspace, selection, assessment, persistence]);

  function applyRecovery(outcome: RecoveryOutcome<MulticatalyticWorkspaceInputs, MulticatalyticWorkspaceResults>) {
    const notices: WorkspaceNoticeItem[] = [];
    if (outcome.kind === "unavailable") {
      notices.push({ tone: "warn", text: `Browser storage is not available, so this workspace will not be saved. ${outcome.message}` });
    } else if (outcome.kind === "rejected") {
      notices.push({ tone: "warn", text: `A saved workspace was found but could not be used (${outcome.message}). Starting empty.` });
    } else if (outcome.kind === "restored") {
      if (outcome.results) {
        const data = outcome.results.data;
        setWorkspace(data.workspace);
        setAssessment({ workspace: data.workspace, data: data.assessment, saved: data.assessment !== null });
        computedAtRef.current = outcome.results.computedAt;
        setRestoredFrom({ computedAt: outcome.results.computedAt, opened: null });
        setEngineMismatch(outcome.engineMismatch);
        setStatus("Restored your previous workspace. Nothing was recomputed.");
      } else if (outcome.inputs.actions.length > 0) {
        setReplayable(outcome.inputs.actions);
        notices.push({
          tone: "warn",
          text: outcome.resultsDropped
            ? "The saved results could not be validated and were not shown. The actions that produced them are kept; you can recompute the workspace from them."
            : "Only the actions were saved (the results were too large to store). You can recompute the workspace from them.",
        });
      }
      const live = new Set(outcome.results?.data.workspace.pool.lots.filter((lot) => lot.availability === "live").map((lot) => lot.id));
      setSelection({
        ruleId: outcome.inputs.selection.ruleId,
        lotIds: outcome.inputs.selection.lotIds.filter((id) => live.has(id)),
      });
    }
    setRecoveryNotices(notices);
  }

  const applyRecoveryRef = useRef(applyRecovery);
  useEffect(() => {
    applyRecoveryRef.current = applyRecovery;
  });
  useEffect(() => {
    if (!recovery) return;
    try {
      applyRecoveryRef.current(recovery);
    } finally {
      // Saving starts only after the recovered record has been applied (or deliberately skipped).
      persistence.resumeAfterRestore();
    }
  }, [recovery, persistence]);

  // ---- derived display data ----------------------------------------------------------------------

  // Structure drawings and names for every molecule the workspace shows (cached per structure).
  // A structure is marked done only once its drawing/name exists, so an interrupted run is retried.
  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    const wanted = new Set<string>();
    for (const lot of workspace.pool.lots) wanted.add(lot.smiles);
    for (const outcome of pendingSelection(workspace)?.outcomes ?? []) wanted.add(outcome.productSmiles);
    const draw = [...wanted].filter((smiles) => !renderedRef.current.has(smiles));
    const name = workspace.pool.lots
      .filter((lot) => lot.availability === "live")
      .map((lot) => lot.smiles)
      .filter((smiles) => !namedRef.current.has(smiles));
    void (async () => {
      for (const smiles of draw) {
        if (cancelled || !mountedRef.current) return;
        let svg: string | null = null;
        try {
          svg = await getCondensedSulfonateSvg(smiles);
        } catch {
          svg = null;
        }
        if (cancelled || !mountedRef.current) return;
        renderedRef.current.add(smiles);
        setSvgs((current) => ({ ...current, [smiles]: svg }));
      }
      for (const smiles of name) {
        if (cancelled || !mountedRef.current) return;
        const label = await moleculeDisplayName(smiles);
        if (cancelled || !mountedRef.current) return;
        namedRef.current.add(smiles);
        setNames((current) => ({ ...current, [smiles]: label }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  // Structure replay + advisory assessments for the committed steps (cheap; recomputed on change).
  useEffect(() => {
    if (!workspace || workspace.records.length === 0 || assessment.workspace === workspace) return;
    let cancelled = false;
    void assessWorkspace(workspace, reactionRegistry)
      .then((result: WorkspaceAssessment | null) => {
        if (cancelled || !mountedRef.current) return;
        setAssessment({
          workspace,
          data: result
            ? { verification: result.verification, compatibility: result.compatibility, selectivity: result.selectivity }
            : null,
          saved: false,
        });
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) setAssessment({ workspace, data: null, saved: false });
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, assessment.workspace]);

  // Reactions that structurally fit the selected molecules (a fit, not a prediction). The result is
  // keyed by what it was computed for, so a late answer for an older selection is never used.
  const fitKey = workspace && selection.lotIds.length > 0 ? `${workspace.history.length}|${workspace.pool.lots.length}|${selection.lotIds.join(",")}` : "";
  useEffect(() => {
    if (!workspace || !fitKey) return;
    let cancelled = false;
    const chosen = new Set(selection.lotIds);
    void (async () => {
      let ids: Set<string> | null;
      try {
        const fits = new Set<string>();
        const { ReactantRoleIndex } = await import("../utils/reactions/engine/reactantRoleIndex");
        const index = new ReactantRoleIndex(reactionRegistry);
        const selectedLots = workspace.pool.lots.filter((lot) => chosen.has(lot.id) && lot.availability === "live");
        if (selectedLots.length === 1) {
          for (const rule of await index.singleLotRules(selectedLots[0])) fits.add(rule.id);
        } else if (selectedLots.length >= 2) {
          const indexable = selectedLots.map((lot) => ({ id: lot.id, smiles: lot.smiles, canonical: lot.canonical, equivalenceKey: `${lot.canonical}|${lot.stereoMixture ?? "-"}` }));
          for (const assignment of await index.candidateAssignments(indexable, { maxArity: selectedLots.length })) fits.add(assignment.ruleId);
        }
        ids = fits;
      } catch {
        ids = null;
      }
      if (!cancelled && mountedRef.current) setFitState({ key: fitKey, ids });
    })();
    return () => {
      cancelled = true;
    };
    // The key already captures the workspace and the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  const fitIds = fitState && fitState.key === fitKey ? fitState.ids : null;

  // Which molecules could fill the selected reaction's structural roles.
  const suggestionKey = workspace && selectedRule ? `${workspace.history.length}|${workspace.pool.lots.length}|${selectedRule.id}` : "";
  useEffect(() => {
    if (!workspace || !selectedRule) return;
    let cancelled = false;
    void candidateLotSelections(workspace, selectedRule)
      .then((list) => {
        if (!cancelled && mountedRef.current) setSuggestionState({ key: suggestionKey, list: list.slice(0, 8) });
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) setSuggestionState({ key: suggestionKey, list: [] });
      });
    return () => {
      cancelled = true;
    };
    // The key already captures the workspace and the selected reaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionKey]);
  const suggestions = suggestionState && suggestionState.key === suggestionKey ? suggestionState.list : [];
  const suggestionsReady = suggestionState?.key === suggestionKey;

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let source = normalized ? allOptions.filter((option) => option.searchText.includes(normalized)) : allOptions;
    if (fitIds && !showEveryReaction) source = source.filter((option) => fitIds.has(option.ruleId));
    return source;
  }, [allOptions, query, fitIds, showEveryReaction]);

  // ---- actions -----------------------------------------------------------------------------------

  /** Runs one async workspace change at a time; leaving the page waits for it (see beforeLeave). */
  async function exclusive(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const promise = (async () => {
      try {
        await task();
      } catch (taskError) {
        console.error("Multi-catalytic workspace step failed:", taskError);
        if (mountedRef.current) setError("The step could not be computed. Nothing was changed.");
      } finally {
        busyRef.current = false;
        if (mountedRef.current) setBusy(false);
      }
    })();
    inFlightRef.current = promise;
    await promise;
  }

  function commit(next: ReactionWorkspace, previous: ReactionWorkspace | null) {
    computedAtRef.current = new Date().toISOString();
    if (previous) setPast((current) => [...current.slice(-(UNDO_LIMIT - 1)), previous]);
    setRestoredFrom(null);
    setEngineMismatch(false);
    setWorkspace(next);
  }

  async function addDrawnMolecules() {
    if (!ketcher) return;
    await exclusive(async () => {
      const smiles = (await ketcher.getSmiles()).trim();
      if (!smiles) {
        setError("Draw a molecule (or enter a name) first.");
        return;
      }
      const current = workspaceRef.current;
      if (!current) {
        const created = await createWorkspace([smiles]);
        if (!created.ok) {
          setError(created.problems.join(" "));
          return;
        }
        commit(created.workspace, null);
        setStatus(`Added ${created.workspace.materials.length} molecule${created.workspace.materials.length === 1 ? "" : "s"} to the inventory.`);
      } else {
        const added = await addMaterial(current, smiles);
        if (!added.ok) {
          setError(added.problems.join(" "));
          return;
        }
        commit(added.workspace, current);
        setStatus(`Added ${added.lotIds.length} molecule${added.lotIds.length === 1 ? "" : "s"} to the inventory.`);
      }
      await ketcher.setMolecule("");
    });
  }

  async function runStep(outcome?: number, requestOverride?: WorkspaceStepRequest) {
    const current = workspaceRef.current;
    const sel = selectionRef.current;
    const request: WorkspaceStepRequest | null = requestOverride ?? (sel.ruleId ? { ruleId: sel.ruleId, lotIds: sel.lotIds, outcome } : null);
    if (!current || !request) return;
    await exclusive(async () => {
      setStatus("Running the selected reaction on the selected molecules…");
      const result = await executeWorkspaceStep(current, request, reactionRegistry);
      commit(result.workspace, current);
      if (result.step.status === "reaction") {
        setSelection(EMPTY_SELECTION);
        setStatus(`Step ${result.step.committedStep} completed: ${result.step.title}.`);
      } else {
        setStatus(`${STEP_STATUS_CHIP[result.step.status]}: nothing was consumed.`);
      }
    });
  }

  function undoLast() {
    if (busyRef.current) return;
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast((current) => current.slice(0, -1));
    computedAtRef.current = new Date().toISOString();
    setWorkspace(previous);
    setSelection(EMPTY_SELECTION);
    setStatus("Undid the last action. The earlier inventory is back.");
  }

  async function recomputeFromActions() {
    const actions = replayable;
    if (!actions) return;
    await exclusive(async () => {
      setStatus("Recomputing the workspace from the saved actions…");
      const result = await replayActions(actions, reactionRegistry);
      if (!result.ok) {
        setError(`The saved actions could not be replayed: ${result.problems.join(" ")}`);
        return;
      }
      commit(result.workspace, workspaceRef.current);
      setReplayable(null);
      setRecoveryNotices([{ tone: "info", text: "Recomputed from the saved actions with the current reaction rules." }]);
      setStatus("Workspace recomputed from the saved actions.");
    });
  }

  async function clearWorkspace() {
    if (busyRef.current) return;
    await ketcher?.setMolecule("");
    setWorkspace(null);
    setPast([]);
    setSelection(EMPTY_SELECTION);
    setAssessment({ workspace: null, data: null, saved: false });
    setRestoredFrom(null);
    setEngineMismatch(false);
    setReplayable(null);
    setRecoveryNotices([]);
    setSaveMessage(null);
    setError(null);
    setStatus("Draw a molecule or enter a name, then add it to the inventory.");
    await persistence.discard();
  }

  function toggleLot(id: string) {
    setSelection((current) => ({
      ...current,
      lotIds: current.lotIds.includes(id) ? current.lotIds.filter((item) => item !== id) : [...current.lotIds, id],
    }));
  }

  function chooseRule(option: SequentialConditionOption) {
    setSelection((current) => ({ ...current, ruleId: option.ruleId }));
    setQuery("");
  }

  // ---- saved analyses ----------------------------------------------------------------------------

  async function saveCurrentAnalysis(name: string, announce = true): Promise<boolean> {
    setSaveBusy(true);
    try {
      await inFlightRef.current?.catch(() => undefined);
      const capture = captureWorkspace();
      if (!capture || !capture.results) {
        setSaveMessage({ tone: "warn", text: "There is no workspace to save yet." });
        return false;
      }
      const saved = await getAppAnalysisLibrary().save("multicatalytic", {
        name,
        summary: describeMulticatalyticAnalysis(capture.results.data),
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

  function defaultAnalysisName(): string {
    const current = workspaceRef.current;
    if (!current) return "Multi-catalytic workspace";
    const first = current.materials.slice(0, 2).map((material) => names[material.smiles] ?? material.smiles);
    return `Workspace: ${first.join(" + ")}${current.materials.length > 2 ? " + …" : ""}`.slice(0, 100);
  }

  async function applySavedAnalysis(opened: OpenedAnalysis<MulticatalyticWorkspaceInputs, MulticatalyticWorkspaceResults>): Promise<boolean> {
    persistence.suspend();
    try {
      const { inputs, results } = opened;
      const notices: WorkspaceNoticeItem[] = [];
      let nextWorkspace: ReactionWorkspace | null = null;
      if (results) {
        nextWorkspace = results.data.workspace;
        setAssessment({ workspace: nextWorkspace, data: results.data.assessment, saved: results.data.assessment !== null });
        computedAtRef.current = results.computedAt;
        setRestoredFrom({ computedAt: results.computedAt, opened: { name: opened.record.name, savedAt: opened.record.updatedAt } });
        setEngineMismatch(opened.engineMismatch);
        setReplayable(null);
      } else {
        setRestoredFrom(null);
        setEngineMismatch(false);
        if (opened.resultsDropped) notices.push({ tone: "warn", text: "The saved results could not be validated and were not opened." });
        if (inputs.actions.length > 0) {
          setReplayable(inputs.actions);
          notices.push({ tone: "warn", text: "Only the actions were saved. Use “Recompute from saved actions” to rebuild the workspace with the current rules." });
        }
      }
      setWorkspace(nextWorkspace);
      setPast([]);
      setSelection({ ruleId: inputs.selection.ruleId, lotIds: inputs.selection.lotIds });
      setRecoveryNotices(notices);
      setSaveMessage(null);
      setError(null);
      setStatus(`Opened saved analysis “${opened.record.name}”.`);
      // One write replaces the automatic workspace with the opened analysis.
      persistence.replaceWorkspace();
      persistence.requestSave(() => ({ inputs: opened.inputs, results: opened.results }));
      await persistence.flush();
      return true;
    } catch (applyError) {
      console.error("Opening a saved Multi-Catalytic analysis failed:", applyError);
      persistence.resume();
      return false;
    }
  }

  const savedOpen = useSavedAnalysisOpen<MulticatalyticWorkspaceInputs, MulticatalyticWorkspaceResults>({
    page: "multicatalytic",
    openRequest,
    onOpenHandled,
    ready: recovery !== null,
    busyReason: () => (busyRef.current ? "Wait for the current step to finish before opening a saved analysis." : null),
    hasUnsavedWork: () => Boolean(workspaceRef.current) && !restoredFrom?.opened,
    canSaveCurrent: () => Boolean(workspaceRef.current) && !busyRef.current,
    saveCurrent: (analysisName) => saveCurrentAnalysis(analysisName, false),
    defaultName: defaultAnalysisName,
    apply: applySavedAnalysis,
    notify: (item) => setRecoveryNotices((notices) => [...notices, item]),
  });

  // ---- rendering ---------------------------------------------------------------------------------

  const groups = workspace ? inventoryGroups(workspace) : { live: [], consumed: [] };
  const catalysis = useMemo(
    () =>
      workspace && workspace.records.length > 0
        ? assessWorkspaceCatalysis(workspace, reactionRegistry, {
            // Step numbers from before an undo may no longer exist; only existing steps are judged.
            sharedVessels: ((existing) => (existing.length >= 2 ? [existing] : []))(
              vesselSteps.filter((step) => step <= workspace.records.length),
            ),
          })
        : null,
    [workspace, vesselSteps],
  );
  const pending = workspace ? pendingSelection(workspace) : null;
  const overview = useMemo(() => (workspace ? buildWorkspaceOverview(workspace) : null), [workspace]);
  const assessed = workspace && assessment.workspace === workspace ? assessment.data : null;
  const expectedMolecules = requirement?.arity ?? 1;
  const selectionReady =
    Boolean(selection.ruleId) && selection.lotIds.length === expectedMolecules && !busy && !pending;

  const notices: WorkspaceNoticeItem[] = [...recoveryNotices];
  if (restoredFrom?.opened) {
    notices.push({
      tone: "info",
      text: `Opened saved analysis “${restoredFrom.opened.name}” (saved ${new Date(restoredFrom.opened.savedAt).toLocaleString()}). The steps are shown as saved and were not recomputed.`,
    });
  } else if (restoredFrom) {
    notices.push({
      tone: "info",
      text: `Restored from your previous session (computed ${new Date(restoredFrom.computedAt).toLocaleString()}). These are previously computed model results and were not recomputed.`,
    });
  }
  if (engineMismatch) {
    notices.push({ tone: "warn", text: "This workspace was saved by an earlier version of the reaction engine. It is shown as saved and has not been recomputed." });
  }
  if (saveMessage) notices.push(saveMessage);

  const label = (smiles: string) => names[smiles] ?? smiles;

  function renderLot(lotId: string) {
    const lot = workspace?.pool.lots.find((item) => item.id === lotId);
    if (!workspace || !lot) return <span key={lotId}>{lotId}</span>;
    return (
      <span key={lotId} className="workspace-lot-ref" title={lot.smiles}>
        {lotLabelById(workspace, lotId)}: {label(lot.smiles)}
      </span>
    );
  }

  function renderStep(step: WorkspaceStep) {
    if (!workspace) return null;
    const unresolved = isUnresolvedStep(step);
    const selected = step.selectedOutcome !== null ? step.outcomes[step.selectedOutcome] : null;
    const roles = roleLines(step.roles);
    const conditions = conditionLines(step.conditions);
    return (
      <div className="multicatalytic-result-step" key={step.attempt} data-status={step.status}>
        <div className="multicatalytic-result-step-heading">
          <strong>
            Attempt {step.attempt}
            {step.committedStep !== null ? `, step ${step.committedStep}` : ""}: {step.title}
          </strong>
          <span className={step.status === "reaction" ? "reaction-status reaction-status-computed" : "no-reaction-chip"}>
            {STEP_STATUS_CHIP[step.status]}
          </span>
        </div>
        <div className="reagent-pill">{step.reagentLabel}</div>
        {step.reagentNote && <small className="reaction-note">{step.reagentNote}</small>}
        <div className="workspace-roles">
          <small className="reaction-note"><strong>Catalysts and reagents.</strong> {roles.heading}</small>
          {roles.lines.length > 0 && (
            <ul>
              {roles.lines.map((line) => (
                <li key={`${line.label}-${line.text}`}>
                  <strong>{line.label}:</strong> {line.text}
                  {line.note ? <small className="reaction-note"> {line.note}</small> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="workspace-roles">
          <small className="reaction-note"><strong>Conditions.</strong> {conditions.heading}</small>
          {conditions.lines.length > 0 && (
            <ul>
              {conditions.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <small className="reaction-note">{step.conditions?.isolation.statement}</small>
        </div>
        <p className="reaction-note">
          <strong>Selected:</strong> {step.requestedLotIds.length > 0 ? step.requestedLotIds.map(renderLot) : "nothing"}
        </p>
        {unresolved ? (
          <div className="no-reaction-result">
            <strong>{STEP_STATUS_HEADING[step.status as Exclude<typeof step.status, "reaction">]}</strong>
            <p>{step.explanation}</p>
            {step.missingPartners.length > 0 && <p><strong>Still needed:</strong> {step.missingPartners.join(", ")}</p>}
            {step.issues.length > 0 && <p className="reaction-limitation">{step.issues.join("; ")}</p>}
            {step.status === "needs-selection" && step.attempt !== workspace.history.length && (
              <small>This choice was resolved by a later attempt.</small>
            )}
          </div>
        ) : (
          <>
            <p className="reaction-note"><strong>Consumed:</strong> {step.consumedLotIds.map(renderLot)}</p>
            <p className="reaction-note"><strong>Created:</strong> {step.producedLotIds.map(renderLot)}</p>
            {step.retainedLotIds.length > 0 && (
              <p className="reaction-note">Unchanged and still available: {step.retainedLotIds.length} other molecule{step.retainedLotIds.length === 1 ? "" : "s"}.</p>
            )}
            {selected && (
              <>
                <p className="multicatalytic-product-name">{selected.productLabel}</p>
                <p className={`reaction-note${selectivityIsCaution(selected.selectivityFinding.class) ? " reaction-limitation" : ""}`}>
                  {selectivityText(selected.selectivityFinding.class)}
                  {selected.selectivity ? ` — ${selected.selectivity.label}` : ""}.
                  {step.selectedBy === "user" ? " You chose this outcome." : ""}
                </p>
                {selected.mixture && (
                  <p className="reaction-note">
                    {selected.mixture.collapsed
                      ? `Racemic mixture of ${selected.mixture.memberCount} enantiomers; one is shown.`
                      : `One member of a ${selected.mixture.kind} product mixture (${selected.mixture.memberCount} members).`}
                  </p>
                )}
                {selected.productStatus !== "computed" && (
                  <p className="reaction-note reaction-limitation">This product is {selected.productStatus}, not a computed structure.</p>
                )}
                {selected.limitations.map((limitation) => (
                  <p className="reaction-note reaction-limitation" key={limitation}>{limitation}</p>
                ))}
                <p className="reaction-note">{selected.explanation}</p>
              </>
            )}
            {step.outcomes.length > 1 && (
              <details>
                <summary>{step.outcomes.length} outcomes were offered{step.omittedOutcomes > 0 ? ` (${step.omittedOutcomes} more not shown)` : ""}</summary>
                <ul>
                  {step.outcomes.map((outcome) => (
                    <li key={outcome.index}>
                      {outcome.index === step.selectedOutcome ? "★ " : ""}{outcomeSummary(outcome)} — {selectivityText(outcome.selectivityFinding.class)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {step.compatibility === null && (
              <small className="reaction-note">Condition compatibility: unassessed.</small>
            )}
            {step.compatibility && step.compatibility.length === 0 && (
              <small className="reaction-note">Declared conditions raise no compatibility warning for the molecules that stayed unreacted.</small>
            )}
            {step.compatibility?.map((warning) => (
              <p className="reaction-note reaction-limitation" key={`${warning.group}-${warning.kind}`}>
                {warning.severity === "model-constraint" ? "Conflict" : "Possible issue"}: {warning.message}
              </p>
            ))}
          </>
        )}
      </div>
    );
  }

  const incoming = useIncomingMolecule({ destination: "multiCatalytic", api: ketcher, ready: recovery !== null && ketcher !== null, expectRestore: recovery?.kind === "restored" });

  return (
    <>
      {incoming}
      <ToolHeader
        group="Synthesize"
        title="Multi-Catalytic Workspace"
        purpose="Keep several molecules in an inventory, pick exactly which ones each reaction consumes, and build separate branches that you can later combine."
        ready={Boolean(ketcher)}
        evidence="rule"
        steps={[
          { label: "Add molecules", detail: "Draw or name each one into the inventory." },
          { label: "Choose what a step consumes", detail: "Pick the molecules and a reagent or catalyst." },
          { label: "Combine branches", detail: "Later steps use only what was actually made." },
        ]}
      />
      <Callout tone="info" title="How steps run">
        <p>
          Steps run one after another on isolated compounds: this is sequential and convergent synthesis, not a one-pot tandem
          or cooperative catalytic process. A reaction that gives no product consumes nothing, and a later step cannot use a
          molecule that was never made.
        </p>
      </Callout>

      <WorkspaceNotice
        embedded
        notices={notices}
        onDiscard={restoredFrom && !restoredFrom.opened ? () => void clearWorkspace() : undefined}
        discardDisabled={busy}
      />

      {replayable && (
        <div className="reaction-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void recomputeFromActions()}>
            Recompute from saved actions
          </button>
        </div>
      )}

      {savedOpen.prompt && (
        <ReplaceWorkspacePrompt
          embedded
          name={savedOpen.prompt.opened.record.name}
          canSaveFirst={Boolean(workspace) && !busy}
          busy={savedOpen.saveBusy}
          onChoose={(choice) => void savedOpen.resolve(choice)}
        />
      )}

      <div className="multicatalytic-editor">
        <MoleculeDrawer globalKey="multiCatalyticWorkspaceKetcher" onReady={setKetcher} />
      </div>
      <div className="reaction-actions">
        <button className="primary-button" type="button" disabled={!ketcher || busy} onClick={() => void addDrawnMolecules()}>
          Add drawn molecule(s) to inventory
        </button>
        <small className="reaction-note">
          Each disconnected structure on the canvas becomes its own inventory entry. Add the same molecule twice when a reaction needs two copies. A
          drawing that has not been added is not part of the saved workspace.
        </small>
      </div>

      <section aria-label="Inventory" className="workspace-inventory">
        <h3>Inventory ({groups.live.length} available)</h3>
        {groups.live.length === 0 ? (
          <p className="empty">No molecules yet. Add at least one starting molecule.</p>
        ) : (
          <ul className="workspace-lot-list">
            {groups.live.map((lot) => (
              <li key={lot.id} className={selection.lotIds.includes(lot.id) ? "workspace-lot selected" : "workspace-lot"}>
                <label>
                  <input
                    type="checkbox"
                    checked={selection.lotIds.includes(lot.id)}
                    disabled={busy}
                    onChange={() => toggleLot(lot.id)}
                    aria-label={`Select ${lotLabel(lot)} (${lot.id})`}
                  />
                  <strong>{lotLabel(lot)}</strong> <code>{lot.id}</code>
                </label>
                {svgs[lot.smiles] && <MolecularFigure className="reaction-svg-box multicatalytic-product-svg" source={{ smiles: lot.smiles }} svg={svgs[lot.smiles] ?? ""} title={lotLabel(lot)} />}
                <p className="multicatalytic-product-name">{label(lot.smiles)}</p>
                <small className="reaction-note">
                  {workspace ? lotOrigin(workspace, lot) : ""}
                  {lot.role === "coproduct" ? ", coproduct" : ""}
                  {lot.stereoMixture ? `, ${lot.stereoMixture} mixture member` : ""}
                </small>
              </li>
            ))}
          </ul>
        )}
        {groups.consumed.length > 0 && (
          <details>
            <summary>Used up ({groups.consumed.length})</summary>
            <ul>
              {groups.consumed.map((lot) => (
                <li key={lot.id}>
                  {lotLabel(lot)} <code>{lot.id}</code>: {label(lot.smiles)} — consumed by step {lot.consumedByStep}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section aria-label="Reaction step" className="multicatalytic-builder">
        <div className="multicatalytic-search-panel">
          <label htmlFor="workspace-condition-search"><strong>1. Choose a reaction</strong></label>
          <input
            id="workspace-condition-search"
            className="multicatalytic-search-input"
            type="search"
            value={query}
            placeholder="Search PCC, Grignard, Fischer, Sonogashira…"
            onChange={(event: { target: { value: string } }) => setQuery(event.target.value)}
          />
          <small className="reaction-note">
            {fitIds && !showEveryReaction
              ? `Showing ${Math.min(searchResults.length, RULE_LIST_LIMIT)} of ${searchResults.length} reactions whose structural requirements the selected molecules satisfy (a structural fit, not a prediction).`
              : `${searchResults.length} reactions available${query.trim() ? " for this search" : ""}.`}
          </small>
          {fitIds && (
            <label className="reaction-note">
              <input type="checkbox" checked={showEveryReaction} onChange={(event: { target: { checked: boolean } }) => setShowEveryReaction(event.target.checked)} />{" "}
              Show every reaction, not just those that fit the selection
            </label>
          )}
          <div className="multicatalytic-search-results" role="listbox" aria-label="Reaction conditions">
            {searchResults.slice(0, RULE_LIST_LIMIT).map((option) => (
              <button
                className="multicatalytic-condition-option"
                key={option.ruleId}
                type="button"
                data-rule-id={option.ruleId}
                onClick={() => chooseRule(option)}
              >
                <span>{option.reagents}</span>
                <small>
                  {option.title}, {option.family}
                  {option.requiresStructuralReactantInput ? ", needs another molecule" : ""}
                </small>
              </button>
            ))}
          </div>
        </div>

        <div className="multicatalytic-sequence-panel">
          <div className="multicatalytic-sequence-heading">
            <strong>2. Select molecules and run</strong>
            <span>{selection.lotIds.length} selected</span>
          </div>
          {selectedRule && requirement ? (
            <>
              <p>
                <strong>{selectedRule.title}</strong> — {selectedRule.reagents}
              </p>
              <small className="reaction-note">
                Consumes {requirement.arity} molecule{requirement.arity === 1 ? "" : "s"}
                {requirement.partnerLabels.length > 0 ? `: the substrate plus ${requirement.partnerLabels.join(", ")}` : ""}.
                {selection.lotIds.length !== requirement.arity ? ` ${selection.lotIds.length} selected.` : ""}
              </small>
              {suggestions.length > 0 && (
                <div className="workspace-suggestions">
                  <small className="reaction-note">Molecules that structurally fit this reaction:</small>
                  {suggestions.map((ids) => (
                    <button
                      key={ids.join("|")}
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => setSelection((current) => ({ ...current, lotIds: ids }))}
                    >
                      Select {ids.map((id) => id).join(" + ")}
                    </button>
                  ))}
                </div>
              )}
              {suggestionsReady && suggestions.length === 0 && workspace && (
                <small className="reaction-note reaction-limitation">
                  None of the available molecules fits this reaction&apos;s structural requirements.
                </small>
              )}
            </>
          ) : (
            <p className="empty">Pick a reaction, then tick the molecule(s) it should consume.</p>
          )}
          <div className="reaction-actions">
            <button className="primary-button" type="button" disabled={!selectionReady} onClick={() => void runStep()}>
              {busy ? "Computing…" : "Run step"}
            </button>
            <button className="secondary-button" type="button" disabled={busy || past.length === 0} onClick={undoLast}>
              Undo last action
            </button>
            <button className="secondary-button" type="button" disabled={busy || !workspace} onClick={() => void clearWorkspace()}>
              Clear workspace
            </button>
          </div>
          {pending && (
            <small className="reaction-note reaction-limitation">Choose one of the offered outcomes below before running another step.</small>
          )}
        </div>
      </section>

      {error && <p className="reaction-detail reaction-limitation" role="alert">{error}</p>}
      <p className="reaction-progress" aria-live="polite">{status}</p>

      {pending && workspace && (
        <article className="reaction-pathway-card workspace-choice" aria-label="Choose an outcome">
          <h3>Choose an outcome for {pending.title}</h3>
          <p className="reaction-note">{pending.explanation}</p>
          <div className="workspace-outcomes">
            {pending.outcomes.map((outcome) => (
              <div className="workspace-outcome" key={outcome.index}>
                {svgs[outcome.productSmiles] && <MolecularFigure className="reaction-svg-box multicatalytic-product-svg" source={{ smiles: outcome.productSmiles }} svg={svgs[outcome.productSmiles] ?? ""} title="Predicted product" />}
                <p className="multicatalytic-product-name">{outcomeSummary(outcome)}</p>
                <p className={`reaction-note${selectivityIsCaution(outcome.selectivityFinding.class) ? " reaction-limitation" : ""}`}>
                  {selectivityText(outcome.selectivityFinding.class)}
                </p>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runStep(outcome.index, { ruleId: pending.ruleId, lotIds: pending.requestedLotIds, outcome: outcome.index })
                  }
                >
                  Use this outcome
                </button>
              </div>
            ))}
          </div>
          {pending.omittedOutcomes > 0 && (
            <p className="reaction-note reaction-limitation">
              {pending.omittedOutcomes} further outcome{pending.omittedOutcomes === 1 ? " was" : "s were"} not listed (the display is limited to {pending.outcomes.length}).
            </p>
          )}
        </article>
      )}

      {overview && overview.supplied.length > 0 && workspace && workspace.history.length > 0 && (
        <WorkspaceRoutePanel nameOf={label} overview={overview} svgOf={(smiles) => svgs[smiles]} />
      )}

      {workspace && workspace.history.length > 0 && (
        <section aria-label="Reaction history" className="multicatalytic-results">
          <h3>Step-by-step details</h3>
          <p className="mc-caveat">Each attempt, with its conditions, what it consumed and made, selectivity and cautions. The latest attempt and any without a product are open.</p>
          <div className="multicatalytic-route-steps">
            {workspace.history.map((step, index) => (
              <details className="mc-step-details" data-testid="mc-step-details" key={step.attempt} open={index === workspace.history.length - 1 || isUnresolvedStep(step)}>
                <summary>Attempt {step.attempt}{step.committedStep !== null ? `, step ${step.committedStep}` : ""}: {step.title} — {STEP_STATUS_CHIP[step.status]}</summary>
                {renderStep(step)}
              </details>
            ))}
          </div>
        </section>
      )}

      {workspace && workspace.records.length > 0 && (
        <section aria-label="Assessment" className="reaction-pathway-card">
          <h3>Assessment of the completed steps</h3>
          {assessed ? (
            <>
              <p className={`reaction-note${verificationWording(assessed.verification.status).tone === "ok" ? "" : " reaction-limitation"}`}>
                <strong>{verificationWording(assessed.verification.status).headline}.</strong>{" "}
                {verificationWording(assessed.verification.status).detail}
                {assessment.saved ? " (Shown as saved.)" : ""}
              </p>
              {assessed.verification.problems.map((problem) => (
                <p className="reaction-note reaction-limitation" key={problem}>{problem}</p>
              ))}
              <p className="reaction-note">
                <strong>Selectivity (advisory):</strong> {selectivityCountsLine(assessed.selectivity.counts)}. Only a rule&apos;s own numeric estimate
                is ever called major or minor.
              </p>
              <p className="reaction-note">
                <strong>Condition compatibility (advisory):</strong>{" "}
                {assessed.compatibility.warnings.length === 0
                  ? "no conflicts found among the declared conditions"
                  : `${assessed.compatibility.warnings.length} warning${assessed.compatibility.warnings.length === 1 ? "" : "s"}`}
                {assessed.compatibility.unassessedRuleIds.length > 0
                  ? `; unassessed (no declared conditions, not the same as compatible): ${assessed.compatibility.unassessedRuleIds.join(", ")}`
                  : ""}
                .
              </p>
              {catalysis && (
                <div className="reaction-note">
                  <strong>Catalysts and condition compatibility (advisory):</strong>
                  {catalysisSummaryLines(catalysis).map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  {workspace && workspace.records.length >= 2 && (
                    <details>
                      <summary>What if steps shared one vessel? (a what-if, not saved)</summary>
                      <p>As run, every step is isolated. Tick two or more completed steps to ask whether their declared conditions could share a vessel.</p>
                      {workspace.records.map((record) => (
                        <label key={record.step.stepNumber} className="reaction-note">
                          <input
                            type="checkbox"
                            checked={vesselSteps.includes(record.step.stepNumber)}
                            onChange={() =>
                              setVesselSteps((current) =>
                                current.includes(record.step.stepNumber)
                                  ? current.filter((item) => item !== record.step.stepNumber)
                                  : [...current, record.step.stepNumber],
                              )
                            }
                          />{" "}
                          Step {record.step.stepNumber}: {record.step.title}
                        </label>
                      ))}
                    </details>
                  )}
                  {catalysis.combinations.length > 0 && (
                    <details>
                      <summary>If two of these steps were ever combined in one pot ({catalysis.combinations.length} pair{catalysis.combinations.length === 1 ? "" : "s"})</summary>
                      <p>These pairs are assessed only from each reaction&apos;s declared conditions. They do not mean any pair was run together here.</p>
                      <ul>
                        {catalysis.combinations.map((pair) => (
                          <li key={pair.stepNumbers.join("-")}>
                            Steps {pair.stepNumbers[0]} and {pair.stepNumbers[1]}: <strong>{combinationLabel(pair.category)}</strong> — {pair.reasons.join(" ")}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
              {assessed.verification.unusedStartingMaterials.length > 0 && (
                <p className="reaction-note">Starting materials not used so far: {assessed.verification.unusedStartingMaterials.join(", ")}.</p>
              )}
            </>
          ) : (
            <p className="reaction-note">Replaying the steps…</p>
          )}
        </section>
      )}

      <div className="reaction-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={!workspace || busy}
          title={workspace ? "Keep this workspace in Saved analyses" : "Add a molecule first"}
          onClick={() => {
            setSaveMessage(null);
            setSaveForm({ name: defaultAnalysisName() });
          }}
        >
          Save Analysis
        </button>
      </div>
      {saveForm && (
        <SaveAnalysisForm
          name={saveForm.name}
          busy={saveBusy}
          onChange={(analysisName) => setSaveForm({ name: analysisName })}
          onCancel={() => setSaveForm(null)}
          onSubmit={() => {
            void saveCurrentAnalysis(saveForm.name).then((saved) => {
              if (saved) setSaveForm(null);
            });
          }}
        />
      )}
    </>
  );
}
