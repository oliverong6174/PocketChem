 import {
    getMoleculeAnnotation,
    getHighlightedMoleculeSvg,
    type AnnotationConcept,
    type MoleculeAnnotation,
  } from "./utils/moleculeAnnotation";
  import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
  } from "react";
import { readKetcherStructureSnapshot } from "./utils/ketcherSnapshot";
  import MoleculeDrawer, { type KetcherApi } from "./components/MoleculeDrawer";
import { ToolHeader } from "./components/ui/primitives";
import { ConceptSearch } from "./components/shell/ConceptSearch";
import { NavigationContext } from "./navigation/NavigationContext";
import type { ConceptDestination } from "./utils/concepts/conceptIndex";
import { SUBJECT_TOOLS, parseRoute, routeHash, type BiochemistryToolId, type BiologyToolId, type PhysicsToolId, type SubjectId, type SubjectToolId } from "./navigation/subjects";
  import {
    applyResolvedNameToIdentity,
    type MoleculeNameResolution,
  } from "./utils/moleculeNameResolver";
  import {
    analyzeFunctionalGroupHierarchy,
    flattenFunctionalGroupOccurrences,
    getRDKit,
    type FunctionalGroupResult,
    type FunctionalGroupOccurrence,
  } from "./utils/functionalGroups";
  import {
    analyzeResonance,
    type ResonanceResult,
  } from "./utils/resonanceUtils";
  import "./App.css";
  import "./styles/ui.css";
  import "./styles/concepts.css";
  import "./styles/organic.css";
  import { PropertiesDetail, PropertiesIdentity, PropertiesSummary } from "./components/properties/PropertiesResults";
  import { countGroups } from "./utils/propertiesSections";
  import { AppShell } from "./components/shell/AppShell";
  import {
    analyzeChirality,
    type ChiralityResult,
  } from "./utils/chiralityUtils";
  import {
    analyzeNomenclatureAndProperties,
    type MoleculeIdentityResult,
  } from "./utils/nomenclatureUtils";
  import {
    analyzeAcidity,
    type AcidityResult,
  } from "./utils/ranking/acidBase/analyzeAcidity";
  import {
    analyzeBasicity,
    type BasicityResult,
  } from "./utils/ranking/acidBase/analyzeBasicity";

  import type { ReactionPathway } from "./utils/reactionUtils";
  import WorkspaceNotice, { type WorkspaceNoticeItem } from "./components/WorkspaceNotice";
  import { DebouncedTask } from "./utils/persistence/debouncedTask";
  import { runLeaveHooks } from "./utils/persistence/leaveGate";
  import { ANALYSIS_APP_PAGE } from "./utils/persistence/analysisLibraryApp";
  import { useWorkspacePersistence } from "./utils/persistence/useWorkspacePersistence";
  import { ketHasStructureText, ketIdentityKey } from "./utils/persistence/ketIdentity";
  import {
    PROPERTIES_ENGINE_VERSION,
    describePropertiesAnalysis,
    validatePropertiesInputs,
    validatePropertiesResults,
    type PropertiesWorkspaceInputs,
    type PropertiesWorkspaceResults,
  } from "./utils/persistence/propertiesWorkspace";
  import type { Capture, RecoveryOutcome } from "./utils/persistence/workspacePersistence";
  import type { WorkspaceResults } from "./utils/persistence/workspaceStore";
  import { getAppAnalysisLibrary } from "./utils/persistence/analysisLibraryApp";
  import type { OpenedAnalysis } from "./utils/persistence/analysisLibrary";
  import { transferIntoEditors } from "./utils/persistence/handoffTransfer";
  import { useSavedAnalysisOpen } from "./utils/persistence/useSavedAnalysisOpen";
  import { ReplaceWorkspacePrompt, SaveAnalysisForm } from "./components/SavedAnalysisControls";

  import { initializeFunctionalGroups } from "./utils/functionalGroups/bootstrap";

  const ReactionsPage = lazy(() => import("./components/ReactionsPage"));
  const AcidBasePage = lazy(() => import("./components/RankingPage"));
  const SynthesisPage = lazy(() => import("./components/SynthesisPage"));
  const SavedAnalysesPage = lazy(() => import("./components/SavedAnalysesPage"));
  const MultiCatalyticPage = lazy(() => import("./components/MultiCatalyticPage"));
  const SpectroscopyPage = lazy(() => import("./components/SpectroscopyPage"));
  const ConformationsPage = lazy(() => import("./components/ConformationsPage"));
  const AcidBaseTitrationPage = lazy(() => import("./components/generalChem/AcidBaseTitrationPage"));
  const GeneralChemistryOverview = lazy(() => import("./components/generalChem/GeneralChemistryOverview"));
  const EquilibriumPage = lazy(() => import("./components/generalChem/EquilibriumPage"));
  const KineticsPage = lazy(() => import("./components/generalChem/KineticsPage"));
  const ThermodynamicsPage = lazy(() => import("./components/generalChem/ThermodynamicsPage"));
  const StoichiometryPage = lazy(() => import("./components/generalChem/StoichiometryPage"));
  const GasLawsPage = lazy(() => import("./components/generalChem/GasLawsPage"));
  const ElectrochemistryPage = lazy(() => import("./components/generalChem/ElectrochemistryPage"));
  const PhysicsOverview = lazy(() => import("./components/physics/PhysicsOverview"));
  const MechanicsPage = lazy(() => import("./components/physics/MechanicsPage"));
  const CircuitsPage = lazy(() => import("./components/physics/CircuitsPage"));
  const RcPage = lazy(() => import("./components/physics/RcPage"));
  const ForcesPage = lazy(() => import("./components/physics/ForcesPage"));
  const EnergyPage = lazy(() => import("./components/physics/EnergyPage"));
  const CollisionsPage = lazy(() => import("./components/physics/CollisionsPage"));
const WavesPage = lazy(() => import("./components/physics/WavesPage"));
const OpticsPage = lazy(() => import("./components/physics/OpticsPage"));
const InterferencePage = lazy(() => import("./components/physics/InterferencePage"));
  const BiologyOverview = lazy(() => import("./components/biology/BiologyOverview"));
  const ReplicationPage = lazy(() => import("./components/biology/ReplicationPage"));
  const TranscriptionPage = lazy(() => import("./components/biology/TranscriptionPage"));
  const TranslationPage = lazy(() => import("./components/biology/TranslationPage"));
  const CentralDogmaPage = lazy(() => import("./components/biology/CentralDogmaPage"));
  const RegulationPage = lazy(() => import("./components/biology/RegulationPage"));
  const GeneticsPage = lazy(() => import("./components/biology/GeneticsPage"));
  const CellDivisionPage = lazy(() => import("./components/biology/CellDivisionPage"));
  const MembranePage = lazy(() => import("./components/biology/MembranePage"));
  const SignalingPage = lazy(() => import("./components/biology/SignalingPage"));
  const NeuronPage = lazy(() => import("./components/biology/NeuronPage"));
  const BiochemOverview = lazy(() => import("./components/biochem/BiochemOverview"));
  const AminoAcidsPage = lazy(() => import("./components/biochem/AminoAcidsPage"));
  const ProteinsPage = lazy(() => import("./components/biochem/ProteinsPage"));
  const EnzymesPage = lazy(() => import("./components/biochem/EnzymesPage"));
  const GlycolysisPage = lazy(() => import("./components/biochem/metabolism/GlycolysisPage"));
  const GluconeogenesisPage = lazy(() => import("./components/biochem/metabolism/GluconeogenesisPage"));
  const CitricAcidPage = lazy(() => import("./components/biochem/metabolism/CitricAcidPage"));
  const ElectronTransportPage = lazy(() => import("./components/biochem/metabolism/ElectronTransportPage"));
  const MetabolicMapPage = lazy(() => import("./components/biochem/metabolism/MetabolicMapPage"));


  type AnnotationCarouselItem =
    | {
        kind: "atom";
        atom: MoleculeAnnotation["atoms"][number];
      }
    | {
        kind: "bond";
        bond: MoleculeAnnotation["bonds"][number];
      }
    | {
        kind: "resonance";
        resonance: ResonanceResult;
      }
    | {
        kind: "chirality";
        chirality: ChiralityResult;
      }
    | {
      kind: "functionalGroup";
      functionalGroup: FunctionalGroupOccurrence;
      };
    

  type AnalysisPanel = "overview" | "acidBase" | "concepts" | "properties";
  type AppPage = "analysis" | "acidBase" | "reactions" | "spectroscopy" | "multiStep" | "multiCatalytic" | "conformations" | "saved";

  /** What the page knows about the dashboard results on screen. */
  type PropertiesResultMeta = {
    computedAt: string;
    engineVersion: number;
    /** Chemistry identity of the structure that was analyzed. */
    structureKey: string;
    /** Loaded from a previous session instead of computed in this one. */
    restored: boolean;
    /** Saved by an earlier version of the analysis code; shown as saved, never re-computed. */
    engineMismatch: boolean;
    /** The drawn structure changed after this analysis. */
    stale: boolean;
    /** Set when the results were opened from the Saved Analyses library. */
    opened?: { name: string; savedAt: string } | null;
  };

  const APP_PAGES: Array<{ id: AppPage; label: string }> = [
    { id: "analysis", label: "Properties" },
    { id: "acidBase", label: "Ranking" },
    { id: "reactions", label: "Reactions" },
    { id: "spectroscopy", label: "Spectroscopy" },
    { id: "multiStep", label: "Multi-Step" },
    { id: "multiCatalytic", label: "Multi-Catalytic" },
    { id: "conformations", label: "Conformations" },
    { id: "saved", label: "Saved" },
  ];

  const ANALYSIS_PANELS: Array<{ id: AnalysisPanel; label: string }> = [
    { id: "overview", label: "Summary" },
    { id: "acidBase", label: "Acid/Base" },
    { id: "concepts", label: "Concepts" },
    { id: "properties", label: "All properties" },
  ];

  const CONCEPT_OPTIONS: Array<{ id: AnnotationConcept; label: string }> = [
    { id: "functionalGroups", label: "Functional Groups" },
    { id: "hybridization", label: "Hybridization" },
    { id: "bondOrbitals", label: "Bond Orbitals" },
    { id: "lonePairs", label: "Lone Pairs" },
    { id: "acidBaseSites", label: "Acid/Base Sites" },
    { id: "reactiveSites", label: "Reactive Sites" },
    { id: "resonance", label: "Resonance Sites" },
    { id: "chirality", label: "Chirality" },
  ];

  function formatPkaRange(range: readonly [number, number]) {
    return `${range[0]}–${range[1]}`;
  }

  function App() {
    //useState calls
    const analyzeInFlightRef = useRef(false);
    const latestAnalyzeRunRef = useRef(0);
    const importedNameResolutionRef = useRef<MoleculeNameResolution | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isMainEditorReady, setIsMainEditorReady] = useState(false);
    const [mainEditorResetVersion, setMainEditorResetVersion] = useState(0);
    const [smiles, setSmiles] = useState("Not analyzed yet");
    const [status, setStatus] = useState("Draw a molecule first");
    const [, setMainGroup] = useState<FunctionalGroupResult | null>(
      null
    );
    const [functionalGroups, setFunctionalGroups] = useState<
      FunctionalGroupResult[]
    >([]);
    const [acidityResults, setAcidityResults] = useState<AcidityResult[]>([]);
    const [basicityResults, setBasicityResults] = useState<BasicityResult[]>([]);
    const [resonanceResults, setResonanceResults] = useState<ResonanceResult[]>([]);
    const [moleculeAnnotation, setMoleculeAnnotation] =
      useState<MoleculeAnnotation | null>(null);

    const [selectedConcept, setSelectedConcept] =
      useState<AnnotationConcept>("functionalGroups");
    const [selectedHybridization, setSelectedHybridization] =
    useState<"all" | "sp" | "sp2" | "sp3">("all");
    const [selectedBondType, setSelectedBondType] =
    useState<"all" | "single" | "double" | "triple">("all");

    const [selectedAtomIndex, setSelectedAtomIndex] = useState<number | null>(null);
    const [selectedBondIndex, setSelectedBondIndex] = useState<number | null>(null);
    const [annotationCardIndex, setAnnotationCardIndex] = useState(0);
    const [highlightedMoleculeSvg, setHighlightedMoleculeSvg] =
    useState<string | null>(null);
    const highlightedSvgRef = useRef<HTMLDivElement | null>(null);

    const [chiralityResults, setChiralityResults] = useState<ChiralityResult[]>([]);
    const [molfile, setMolfile] = useState<string | null>(null);

    const [moleculeIdentity, setMoleculeIdentity] =
    useState<MoleculeIdentityResult | null>(null);

    // Subject and tool: the URL hash (#/organic/reactions, #/general/acid-base-titration) selects them on load and follows them.
    const initialRoute = useMemo(() => (typeof window === "undefined" ? null : parseRoute(window.location.hash)), []);
    const [activeSubject, setActiveSubject] = useState<SubjectId>(initialRoute?.subject ?? "organic");
    const [generalTool, setGeneralTool] = useState<SubjectToolId>(initialRoute && initialRoute.subject !== "organic" ? (initialRoute.toolId as SubjectToolId) : "gcOverview");
    const [activePage, setActivePage] = useState<AppPage>(initialRoute?.subject === "organic" ? (initialRoute.toolId as AppPage) : "analysis");
    const [analysisPanel, setAnalysisPanel] = useState<AnalysisPanel>("overview");
    const [reactionPathways, setReactionPathways] = useState<ReactionPathway[]>([]);
    const appShellRef = useRef<HTMLElement | null>(null);
    const switchRequestRef = useRef(0);
    const openSequenceRef = useRef(0);

    // ---- workspace recovery for the Properties page (Stage 8B-1) --------------------------------
    // The drawn structure and the completed analysis are saved and come back after a reload or a
    // visit to another page. Restored results are a saved snapshot: nothing is recomputed, and they
    // are labelled as stale as soon as the structure no longer matches the one that was analyzed.
    const [snapshotTask] = useState(() => new DebouncedTask(async () => undefined));
    const { controller: persistence, recovery, status: persistenceStatus } = useWorkspacePersistence<
      PropertiesWorkspaceInputs,
      PropertiesWorkspaceResults
    >({
      page: "properties",
      engineVersion: PROPERTIES_ENGINE_VERSION,
      validateInputs: validatePropertiesInputs,
      validateResults: validatePropertiesResults,
      // Leaving the page finishes reading the editor first, so a last-moment edit is not lost.
      beforeLeave: () => snapshotTask.flushNow(),
    });
    const [resultMeta, setResultMeta] = useState<PropertiesResultMeta | null>(null);
    const [recoveryNotices, setRecoveryNotices] = useState<WorkspaceNoticeItem[]>([]);
    const [inputsOnlyRestored, setInputsOnlyRestored] = useState(false);
    const mainEditorApiRef = useRef<KetcherApi | null>(null);
    const propsSnapshotRef = useRef<{ ket: string | null; key: string | null }>({ ket: null, key: null });
    const propsRestoringRef = useRef(false);
    const openingRef = useRef(false);
    const propsRestoreBusyRef = useRef(0);
    const appliedRecoveryRef = useRef<unknown>(null);
    const applyRestoreRef = useRef<((outcome: RecoveryOutcome<PropertiesWorkspaceInputs, PropertiesWorkspaceResults>) => void) | null>(null);
    const requestPersistRef = useRef<() => void>(() => undefined);
    const restoreMainEditorRef = useRef<() => void>(() => undefined);
    const scheduleSnapshotRef = useRef<() => void>(() => undefined);
    const latestRef = useRef({
      smiles, molfile, functionalGroups, acidityResults, basicityResults, resonanceResults, chiralityResults,
      moleculeAnnotation, moleculeIdentity, reactionPathways, analysisPanel, selectedConcept,
      selectedHybridization, selectedBondType, resultMeta, isAnalyzing,
    });

    function capturePropertiesWorkspace(): Capture<PropertiesWorkspaceInputs, PropertiesWorkspaceResults> | null {
      const latest = latestRef.current;
      const snapshot = propsSnapshotRef.current;
      const inputs: PropertiesWorkspaceInputs = {
        ket: snapshot.ket,
        key: snapshot.key,
        analysisPanel: latest.analysisPanel,
        selectedConcept: latest.selectedConcept,
        selectedHybridization: latest.selectedHybridization,
        selectedBondType: latest.selectedBondType,
      };
      let results: WorkspaceResults<PropertiesWorkspaceResults> | null = null;
      const meta = latest.resultMeta;
      // Only a finished analysis is a result; a half-filled dashboard is never saved.
      if (meta && !latest.isAnalyzing) {
        results = {
          computedAt: meta.computedAt,
          engineVersion: meta.engineVersion,
          stale: meta.stale,
          status: "complete",
          data: {
            inputKey: meta.structureKey,
            smiles: latest.smiles,
            molfile: latest.molfile,
            functionalGroups: latest.functionalGroups,
            acidityResults: latest.acidityResults,
            basicityResults: latest.basicityResults,
            resonanceResults: latest.resonanceResults,
            chiralityResults: latest.chiralityResults,
            moleculeAnnotation: latest.moleculeAnnotation,
            moleculeIdentity: latest.moleculeIdentity,
            reactionPathways: latest.reactionPathways,
          },
        };
      }
      if (!inputs.ket && !results) return null;
      return { inputs, results };
    }

    function requestPersist() {
      persistence.requestSave(capturePropertiesWorkspace);
    }

    /** Reads the editor and refreshes the saved structure and the stale-result check. */
    async function takePropertiesSnapshot() {
      const api = mainEditorApiRef.current;
      if (!api || analyzeInFlightRef.current || propsRestoringRef.current) return;
      const token = persistence.token();
      try {
        const ket = await Promise.race([
          api.getKet(),
          new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("Timed out reading the editor.")), 8000)),
        ]);
        const key = await ketIdentityKey(ket);
        if (!persistence.isCurrent(token) || analyzeInFlightRef.current || propsRestoringRef.current) return;
        propsSnapshotRef.current = { ket: ketHasStructureText(ket) ? ket : null, key };
        setResultMeta((meta) => (meta && !meta.stale && meta.structureKey !== key ? { ...meta, stale: true } : meta));
        requestPersist();
      } catch (snapshotError) {
        console.warn("[PocketChem:Properties] Could not read the editor for workspace recovery.", snapshotError);
      }
    }

    function schedulePropertiesSnapshot() {
      if (propsRestoringRef.current) return;
      snapshotTask.schedule();
    }

    /**
     * Puts the saved structure into a (new, empty) editor: after a reload, and whenever the page is
     * revisited, because leaving the page unmounts the editor. A structure the user already drew wins.
     */
    async function restoreMainEditor() {
      const api = mainEditorApiRef.current;
      const saved = propsSnapshotRef.current;
      if (!api || !saved.ket || propsRestoringRef.current || openingRef.current) return;
      const token = persistence.token();
      // Opening a saved analysis invalidates a drawing restore, exactly like Clear does.
      const stillWanted = () => persistence.isCurrent(token) && !openingRef.current;
      propsRestoreBusyRef.current += 1;
      propsRestoringRef.current = true;
      let userContentWon = false;
      try {
        if (ketHasStructureText(await api.getKet())) {
          userContentWon = true;
          return;
        }
        if (!stillWanted()) return;
        await api.setMolecule(saved.ket, { needZoom: true });
        const actual = await ketIdentityKey(await api.getKet());
        if (!stillWanted()) return;
        if (saved.key && actual !== saved.key) throw new Error("The restored structure does not match the saved one.");
      } catch (restoreError) {
        console.warn("[PocketChem:Properties] Could not restore the saved structure.", restoreError);
        if (persistence.isCurrent(token)) {
          // Do not let an editor that failed to restore overwrite the saved copy.
          persistence.disable();
          setRecoveryNotices((notices) => [
            ...notices,
            { tone: "warn", text: "The saved structure could not be restored into the editor. Your saved work was kept and will not be overwritten; use Clear Analysis to start over." },
          ]);
        }
      } finally {
        propsRestoreBusyRef.current -= 1;
        window.setTimeout(() => {
          if (propsRestoreBusyRef.current === 0) propsRestoringRef.current = false;
          if (userContentWon) void takePropertiesSnapshot();
        }, 500);
      }
    }

    function applyRestoredProperties(outcome: RecoveryOutcome<PropertiesWorkspaceInputs, PropertiesWorkspaceResults>) {
      if (appliedRecoveryRef.current === outcome) return;
      appliedRecoveryRef.current = outcome;
      if (outcome.kind === "rejected") {
        setRecoveryNotices([{ tone: "warn", text: `Saved work from a previous session could not be used (${outcome.message}). It was set aside and the page started clean.` }]);
        return;
      }
      if (outcome.kind !== "restored" || !persistence.isCurrent(outcome.epoch)) return;

      const latest = latestRef.current;
      if (latestAnalyzeRunRef.current > 0 || latest.resultMeta || latest.smiles !== "Not analyzed yet") {
        setRecoveryNotices([{ tone: "info", text: "Saved work from a previous session was not restored because you had already started new work on this page." }]);
        return;
      }

      const { inputs, results } = outcome;
      const notices: WorkspaceNoticeItem[] = [];
      setAnalysisPanel(inputs.analysisPanel);
      setSelectedConcept(inputs.selectedConcept);
      setSelectedHybridization(inputs.selectedHybridization);
      setSelectedBondType(inputs.selectedBondType);
      propsSnapshotRef.current = { ket: inputs.ket, key: inputs.key };

      if (results) {
        const data = results.data;
        setSmiles(data.smiles);
        setMolfile(data.molfile);
        setFunctionalGroups(data.functionalGroups);
        setAcidityResults(data.acidityResults);
        setBasicityResults(data.basicityResults);
        setResonanceResults(data.resonanceResults);
        setChiralityResults(data.chiralityResults);
        setMoleculeAnnotation(data.moleculeAnnotation);
        setMoleculeIdentity(data.moleculeIdentity);
        setReactionPathways(data.reactionPathways);
        setStatus("Restored from your previous session");
        setResultMeta({
          computedAt: results.computedAt,
          engineVersion: results.engineVersion,
          structureKey: data.inputKey,
          restored: true,
          engineMismatch: outcome.engineMismatch,
          // A record whose results do not match its own saved structure is never presented as current.
          stale: results.stale || inputs.key === null || inputs.key !== data.inputKey,
        });
      } else if (inputs.ket) {
        setInputsOnlyRestored(true);
        setStatus("Restored your drawn structure from your previous session.");
      }
      if (outcome.resultsDropped) {
        notices.push({ tone: "warn", text: "Saved results could not be validated and were not restored. Your structure was." });
      }
      if (outcome.migratedFrom !== null) {
        notices.push({ tone: "info", text: "Your saved workspace was upgraded from an older storage format." });
      }
      setRecoveryNotices(notices);
      if (inputs.ket) restoreMainEditorRef.current();
    }

    useEffect(() => {
      requestPersistRef.current = requestPersist;
      snapshotTask.setTask(takePropertiesSnapshot);
      restoreMainEditorRef.current = () => void restoreMainEditor();
      scheduleSnapshotRef.current = schedulePropertiesSnapshot;
      applyRestoreRef.current = applyRestoredProperties;
      latestRef.current = {
        smiles, molfile, functionalGroups, acidityResults, basicityResults, resonanceResults, chiralityResults,
        moleculeAnnotation, moleculeIdentity, reactionPathways, analysisPanel, selectedConcept,
        selectedHybridization, selectedBondType, resultMeta, isAnalyzing,
      };
    });

    // Autosave: only settled state is watched (the debounce and the completed-analysis rule keep
    // half-finished dashboards and rapid edits out of storage).
    useEffect(() => {
      requestPersistRef.current();
    }, [
      smiles, molfile, functionalGroups, acidityResults, basicityResults, resonanceResults, chiralityResults,
      moleculeAnnotation, moleculeIdentity, reactionPathways, analysisPanel, selectedConcept,
      selectedHybridization, selectedBondType, resultMeta, isAnalyzing,
    ]);

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
      // Leaving the page unmounts its editor; the next visit gets a new one.
      if (activePage !== "analysis") mainEditorApiRef.current = null;
    }, [activePage]);

    useEffect(() => {
      return () => snapshotTask.cancel();
    }, [snapshotTask]);

    const handleMainEditorReady = useCallback((api?: KetcherApi) => {
      if (api) mainEditorApiRef.current = api;
      setIsMainEditorReady(true);
      restoreMainEditorRef.current();
      window.setTimeout(() => {
        void getRDKit().catch((error) => {
          console.warn("RDKit warm-up was deferred after a load failure.", error);
        });
      }, 800);
    }, []);

    const handleMainEditorChange = useCallback(() => {
      // Any manual edit means the previously resolved name is no longer
      // guaranteed to describe the current graph.
      importedNameResolutionRef.current = null;
      scheduleSnapshotRef.current();
    }, []);

    const handleMainNameApplied = useCallback((
      resolution: MoleculeNameResolution,
      action: "add" | "replace",
    ) => {
      importedNameResolutionRef.current = action === "replace" ? resolution : null;
    }, []);

    const scrollToAppTop = () => {
      const activeElement = document.activeElement as HTMLElement | null;
      activeElement?.blur?.();

      appShellRef.current?.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto",
      });

      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto",
      });

    };

    // A saved analysis chosen on the Saved page, waiting for its page to open it. Any other way of
    // changing page forgets it, so it can never be applied later by surprise.
    const [pendingOpen, setPendingOpen] = useState<{ id: string; recordId: string; page: AppPage | SubjectToolId } | null>(null);

    const switchPage = (page: AppPage, options?: { keepOpenRequest?: boolean }) => {
      if (!options?.keepOpenRequest) setPendingOpen(null);
      // Let the page being left finish reading its editor and saving before it is unmounted.
      const request = (switchRequestRef.current += 1);
      void runLeaveHooks().then(() => {
        if (switchRequestRef.current === request) {
          // Leaving Properties unmounts its editor; the next visit gets a new one.
          if (page !== "analysis") setIsMainEditorReady(false);
          setActivePage(page);
        }
      });
    };

    // General Chemistry navigation. Leaving a tool lets it finish saving first, exactly like switchPage.
    const switchGeneralTool = (tool: SubjectToolId, options?: { keepOpenRequest?: boolean }) => {
      if (!options?.keepOpenRequest) setPendingOpen(null);
      const request = (switchRequestRef.current += 1);
      void runLeaveHooks().then(() => {
        if (switchRequestRef.current === request) setGeneralTool(tool);
      });
    };

    const switchSubject = (subject: SubjectId, options?: { keepOpenRequest?: boolean; tool?: SubjectToolId; page?: AppPage }) => {
      if (subject === activeSubject && !options?.tool) return;
      // The tool shown in a non-Organic subject: the requested one, else the one already open if it belongs to that subject, else its Overview.
      const subjectTools = SUBJECT_TOOLS[subject];
      const toolFor: SubjectToolId | undefined = options?.tool ?? (subjectTools.some((entry) => entry.id === generalTool) ? generalTool : (subjectTools[0]?.id as SubjectToolId | undefined));
      if (!options?.keepOpenRequest) setPendingOpen(null);
      const request = (switchRequestRef.current += 1);
      void runLeaveHooks().then(() => {
        if (switchRequestRef.current !== request) return;
        // Leaving Organic Chemistry unmounts the Properties editor; the next visit gets a new one.
        if (subject !== "organic") setIsMainEditorReady(false);
        if (subject !== "organic" && toolFor) setGeneralTool(toolFor);
        if (subject === "organic" && options?.page) setActivePage(options.page);
        setActiveSubject(subject);
      });
    };

    const openSavedAnalysis = (analysis: { id: string; page: string }) => {
      const target = ANALYSIS_APP_PAGE[analysis.page as keyof typeof ANALYSIS_APP_PAGE];
      if (!target) return;
      openSequenceRef.current += 1;
      setPendingOpen({ id: `open-${openSequenceRef.current}`, recordId: analysis.id, page: target });
      if (target === "gcAcidBase" || target === "gcEquilibrium" || target === "gcKinetics" || target === "gcThermo" || target === "gcStoichiometry" || target === "gcGas" || target === "gcElectro") {
        if (activeSubject === "general") switchGeneralTool(target, { keepOpenRequest: true });
        else switchSubject("general", { keepOpenRequest: true, tool: target });
        return;
      }
      if (target === "phMechanics" || target === "phCircuits" || target === "phRc" || target === "phForces" || target === "phEnergy" || target === "phCollisions" || target === "phWaves" || target === "phOptics" || target === "phInterference") {
        if (activeSubject === "physics") switchGeneralTool(target, { keepOpenRequest: true });
        else switchSubject("physics", { keepOpenRequest: true, tool: target });
        return;
      }
      if (target === "bcAminoAcids" || target === "bcProteins" || target === "bcEnzymes" || target === "bcGlycolysis" || target === "bcGluconeogenesis" || target === "bcTca" || target === "bcEtc" || target === "bcMetabolism") {
        if (activeSubject === "biochemistry") switchGeneralTool(target, { keepOpenRequest: true });
        else switchSubject("biochemistry", { keepOpenRequest: true, tool: target });
        return;
      }
      if (target === "bioReplication" || target === "bioTranscription" || target === "bioTranslation" || target === "bioDogma" || target === "bioRegulation" || target === "bioGenetics" || target === "bioDivision" || target === "bioMembrane" || target === "bioSignaling" || target === "bioNeuron") {
        if (activeSubject === "biology") switchGeneralTool(target, { keepOpenRequest: true });
        else switchSubject("biology", { keepOpenRequest: true, tool: target });
        return;
      }
      if (activeSubject !== "organic") {
        switchSubject("organic", { keepOpenRequest: true, page: target });
        return;
      }
      switchPage(target, { keepOpenRequest: true });
    };

    // Keep the address bar in step with the subject and tool, and follow back/forward.
    const routeFirstRef = useRef(true);
    const navRef = useRef<(route: { subject: SubjectId; toolId: string }) => void>(() => undefined);
    useEffect(() => {
      navRef.current = (route) => {
        if (route.subject !== activeSubject) {
          switchSubject(route.subject, route.subject === "organic" ? { page: route.toolId as AppPage } : { tool: route.toolId as SubjectToolId });
        } else if (route.subject === "organic") switchPage(route.toolId as AppPage);
        else switchGeneralTool(route.toolId as SubjectToolId);
      };
    });
    useEffect(() => {
      const hash = routeHash({ subject: activeSubject, toolId: activeSubject === "organic" ? activePage : generalTool });
      if (window.location.hash !== hash) {
        if (routeFirstRef.current) window.history.replaceState(null, "", hash);
        else window.history.pushState(null, "", hash);
      }
      routeFirstRef.current = false;
    }, [activeSubject, activePage, generalTool]);
    useEffect(() => {
      const onPop = () => {
        const route = parseRoute(window.location.hash);
        if (route) navRef.current(route);
      };
      window.addEventListener("popstate", onPop);
      return () => window.removeEventListener("popstate", onPop);
    }, []);


    // ---- Stage 19: global concept search and cross-subject navigation --------------------------------
    const [searchState, setSearchState] = useState<{ open: boolean; query: string }>({ open: false, query: "" });
    const openSearch = useCallback((query = "") => setSearchState({ open: true, query }), []);
    const closeSearch = useCallback(() => setSearchState((current) => ({ ...current, open: false })), []);
    // Opens a tool of any subject through the same switch functions as the tab bar, so unsaved work is flushed first and
    // Back/Forward follow the address bar. Opening a tool never changes another tool's inputs.
    const openDestination = (destination: ConceptDestination) => {
      if (destination.subject === "organic") {
        if (activeSubject === "organic") switchPage(destination.toolId as AppPage);
        else switchSubject("organic", { page: destination.toolId as AppPage });
      } else if (destination.subject === activeSubject) switchGeneralTool(destination.toolId as SubjectToolId);
      else switchSubject(destination.subject, { tool: destination.toolId as SubjectToolId });
    };
    const openDestinationRef = useRef(openDestination);
    useEffect(() => { openDestinationRef.current = openDestination; });
    const navigation = useMemo(() => ({ openDestination: (destination: ConceptDestination) => openDestinationRef.current(destination), openSearch }), [openSearch]);
    useEffect(() => {
      const onKey = (event: KeyboardEvent) => {
        if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
          event.preventDefault();
          setSearchState((current) => (current.open ? current : { open: true, query: "" }));
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);

    // ---- Saved Analyses for Properties (Stage 8B-3B-2) ---------------------------------------------
    // "Save Analysis" copies the finished analysis (structure, groups, acid/base, resonance,
    // chirality, annotation, name and properties, predicted reactions) into the library; opening one
    // puts it back without recomputing anything.
    const [isOpening, setIsOpening] = useState(false);
    const [saveForm, setSaveForm] = useState<{ name: string } | null>(null);
    const [saveBusy, setSaveBusy] = useState(false);
    const [saveMessage, setSaveMessage] = useState<WorkspaceNoticeItem | null>(null);

    function defaultAnalysisName(): string {
      const l = latestRef.current;
      const nomenclature = l.moleculeIdentity?.nomenclature;
      return `Properties of ${nomenclature?.displayName || nomenclature?.estimatedName || l.smiles}`.slice(0, 100);
    }

    async function saveCurrentAnalysis(analysisName: string, announce = true): Promise<boolean> {
      setSaveBusy(true);
      try {
        await snapshotTask.flushNow();
        const capture = capturePropertiesWorkspace();
        if (!capture || !capture.results || latestRef.current.isAnalyzing) {
          setSaveMessage({ tone: "warn", text: "Analyze a molecule before saving an analysis." });
          return false;
        }
        const saved = await getAppAnalysisLibrary().save("properties", {
          name: analysisName,
          summary: describePropertiesAnalysis(capture.results.data),
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

    /** Replaces the Properties workspace with a saved analysis, as one transaction (see transferIntoEditors). */
    async function applySavedAnalysis(opened: OpenedAnalysis<PropertiesWorkspaceInputs, PropertiesWorkspaceResults>): Promise<boolean> {
      const api = mainEditorApiRef.current;
      if (!api || openingRef.current || analyzeInFlightRef.current) return false;
      openingRef.current = true;
      setIsOpening(true);
      snapshotTask.cancel();
      propsRestoringRef.current = true;
      const { inputs, results } = opened;
      const outcome = await transferIntoEditors(
        [{ api, source: inputs.ket, expectKey: inputs.ket ? inputs.key : null }],
        persistence,
      );
      if (outcome.kind !== "adopted") {
        if (outcome.kind === "rolled-back") {
          setRecoveryNotices((notices) => [
            ...notices,
            { tone: "warn", text: `“${opened.record.name}” could not be opened. Your Properties workspace is unchanged.` },
          ]);
          requestPersistRef.current();
        } else {
          // The editor may have changed, so the results on screen no longer describe it.
          setResultMeta(null);
          setRecoveryNotices([
            { tone: "warn", text: `“${opened.record.name}” could not be opened and the editor could not be restored. Your saved workspace is unchanged; reload this page to bring it back.` },
          ]);
        }
        openingRef.current = false;
        setIsOpening(false);
        window.setTimeout(() => {
          propsRestoringRef.current = false;
        }, 500);
        return false;
      }

      // Success: the old workspace's callbacks are invalid and the saved analysis is the workspace now.
      importedNameResolutionRef.current = null;
      latestAnalyzeRunRef.current += 1;
      propsSnapshotRef.current = { ket: outcome.editors[0].ket, key: outcome.editors[0].key };
      setAnalysisPanel(inputs.analysisPanel);
      setSelectedConcept(inputs.selectedConcept);
      setSelectedHybridization(inputs.selectedHybridization);
      setSelectedBondType(inputs.selectedBondType);
      setSelectedAtomIndex(null);
      setSelectedBondIndex(null);
      setAnnotationCardIndex(0);
      setHighlightedMoleculeSvg(null);
      setInputsOnlyRestored(false);
      setRecoveryNotices(
        opened.resultsDropped ? [{ tone: "warn", text: "The saved results could not be validated and were not opened. The structure was." }] : [],
      );
      if (results) {
        const data = results.data;
        setSmiles(data.smiles);
        setMolfile(data.molfile);
        setFunctionalGroups(data.functionalGroups);
        setAcidityResults(data.acidityResults);
        setBasicityResults(data.basicityResults);
        setResonanceResults(data.resonanceResults);
        setChiralityResults(data.chiralityResults);
        setMoleculeAnnotation(data.moleculeAnnotation);
        setMoleculeIdentity(data.moleculeIdentity);
        setReactionPathways(data.reactionPathways);
        setStatus(`Opened saved analysis “${opened.record.name}”`);
        setResultMeta({
          computedAt: results.computedAt,
          engineVersion: results.engineVersion,
          structureKey: data.inputKey,
          restored: false,
          opened: { name: opened.record.name, savedAt: opened.record.updatedAt },
          engineMismatch: opened.engineMismatch,
          // Whatever was true when it was saved stays true; an inconsistent record is never shown as current.
          stale: results.stale || inputs.key === null || inputs.key !== data.inputKey,
        });
      } else {
        setSmiles("Not analyzed yet");
        setMolfile(null);
        setMainGroup(null);
        setFunctionalGroups([]);
        setAcidityResults([]);
        setBasicityResults([]);
        setResonanceResults([]);
        setChiralityResults([]);
        setMoleculeAnnotation(null);
        setMoleculeIdentity(null);
        setReactionPathways([]);
        setResultMeta(null);
        setStatus(`Opened saved analysis “${opened.record.name}” (structure only).`);
      }
      // One write replaces the automatic workspace with the opened analysis.
      persistence.requestSave(() => ({ inputs: opened.inputs, results: opened.results }));
      await persistence.flush();
      openingRef.current = false;
      setIsOpening(false);
      window.setTimeout(() => {
        propsRestoringRef.current = false;
        schedulePropertiesSnapshot();
      }, 500);
      return true;
    }

    const savedOpen = useSavedAnalysisOpen<PropertiesWorkspaceInputs, PropertiesWorkspaceResults>({
      page: "properties",
      openRequest: pendingOpen?.page === "analysis" ? pendingOpen : null,
      onOpenHandled: (requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current)),
      ready: recovery !== null && activePage === "analysis" && isMainEditorReady,
      busyReason: () =>
        latestRef.current.isAnalyzing || openingRef.current ? "Wait for the current analysis to finish before opening a saved one." : null,
      hasUnsavedWork: () => capturePropertiesWorkspace() !== null,
      canSaveCurrent: () => Boolean(latestRef.current.resultMeta),
      saveCurrent: (analysisName) => saveCurrentAnalysis(analysisName, false),
      defaultName: defaultAnalysisName,
      apply: applySavedAnalysis,
      notify: (item) => setRecoveryNotices((notices) => [...notices, item]),
    });

    const handlePageTabKeyDown = (
      event: ReactKeyboardEvent<HTMLButtonElement>,
      currentPage: AppPage,
    ) => {
      const currentIndex = APP_PAGES.findIndex((page) => page.id === currentPage);
      let nextIndex = currentIndex;

      if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % APP_PAGES.length;
      if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + APP_PAGES.length) % APP_PAGES.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = APP_PAGES.length - 1;
      if (nextIndex === currentIndex) return;

      event.preventDefault();
      const nextPage = APP_PAGES[nextIndex].id;
      switchPage(nextPage);
      requestAnimationFrame(() => {
        document.getElementById(`page-tab-${nextPage}`)?.focus();
      });
    };

    const handleGeneralTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, current: SubjectToolId) => {
      const tools = SUBJECT_TOOLS[activeSubject];
      const index = tools.findIndex((tool) => tool.id === current);
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tools.length;
      if (event.key === "ArrowLeft") next = (index - 1 + tools.length) % tools.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tools.length - 1;
      if (next === index) return;
      event.preventDefault();
      const id = tools[next].id as SubjectToolId;
      switchGeneralTool(id);
      requestAnimationFrame(() => document.getElementById(`page-tab-${id}`)?.focus());
    };

    useLayoutEffect(() => {
      scrollToAppTop();
    }, [activePage, activeSubject, generalTool]);

    const PROPERTY_INFO: Record<string, string> = {
    formula:
      "Molecular formula shows the number and type of atoms in the molecule, such as C2H4O2.",

    dbe:
      "DBE means degrees of unsaturation. It estimates how many rings and/or pi bonds are present. A double bond counts as 1 DBE, a ring counts as 1 DBE, and a triple bond counts as 2 DBE.",

    molecularWeight:
      "Molecular weight is the average mass of one mole of the molecule, usually shown in g/mol. It helps estimate molecule size.",

    exactMass:
      "Exact mass is calculated using the exact masses of specific isotopes, usually the most common isotope of each atom.",

    formalCharge:
      "Formal charge is the overall charge assigned from the Lewis structure. Neutral molecules have formal charge 0.",

    heavyAtoms:
      "Heavy atom count is the number of non-hydrogen atoms. It helps estimate molecule size and complexity.",

    hbd:
      "H-bond donors are atoms/groups that can donate a hydrogen bond, usually O-H or N-H groups.",

    hba:
      "H-bond acceptors are atoms with lone pairs that can accept a hydrogen bond, usually oxygen or nitrogen. Some atoms, like the OH oxygen in carboxylic acids, may not count as effective acceptors.",

    rotatableBonds:
      "Rotatable bonds are single bonds that can freely rotate. More rotatable bonds usually means a molecule is more flexible.",

    tpsa:
    "TPSA means topological polar surface area. It estimates how much of the molecule's surface is polar. Low TPSA, about 0–40 Å², means less polar and often better membrane crossing. Medium TPSA, about 40–90 Å², means moderate polarity. High TPSA, above 90–140 Å², means more polar and more hydrogen bonding. Very high TPSA, above 140 Å², often lowers intestinal absorption.",

    logP:
    "logP estimates whether a neutral molecule prefers oil/fat or water. Negative logP means very water-loving. logP around 0–1 is fairly hydrophilic. logP around 1–3 is often a good balance for drug-like molecules. logP around 3–5 is more lipophilic. logP above 5 may be too greasy, poorly water-soluble, and more likely to accumulate in fat.",
    
    rings:
      "Ring count is the number of ring systems detected in the molecule. Rings affect shape, rigidity, and chemical behavior.",

    boilingPoint:
    "Boiling point tendency estimates whether a molecule should have a low, medium, or high boiling point. It is based on molecular weight, polarity, hydrogen bonding, charge, and branching. This is not an exact experimental boiling point.",
      
      waterSolubility:
      "Water solubility tendency estimates how well a molecule dissolves in water. Very low means mostly nonpolar or greasy. Low means limited water solubility. Medium means some polar groups but not extremely water-loving. High means polar or hydrogen-bonding groups. Very high usually means charged, very polar, or many hydrogen-bonding groups.",

    membranePermeability:
      "Membrane permeability tendency estimates passive crossing through lipid membranes. Very low usually means charged, very large, or very polar. Low means crossing may be difficult. Medium means possible but structure-dependent. High means a good balance of lipid solubility and size. Very high means small, neutral, and lipid-compatible, but extremely greasy molecules may still have poor useful absorption.",

    volatility:
      "Volatility tendency estimates how easily a molecule evaporates. Very low means it is not very volatile, often because it is large, charged, or strongly hydrogen-bonding. Low means it evaporates slowly. Medium means moderate evaporation. High means fairly volatile. Very high means small molecules with weak intermolecular forces that evaporate easily.",
      
    };

    const functionalGroupOccurrences = useMemo(
    () =>
      flattenFunctionalGroupOccurrences(
        functionalGroups.filter(
          (group) => (group.category ?? "functionalGroup") === "functionalGroup"
        )
      ),
    [functionalGroups]
  );

  {/*DEBUG MOLFILE SMILES*/}
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

      if (!trimmed) return "";
      if (isMolBlockLike(trimmed)) return "";

      return trimmed;
    }

    const analyzeMolecule = async () => {
      if (analyzeInFlightRef.current || openingRef.current) return;

      const editor = window.ketcher;
      if (!editor) {
        setStatus("The molecule editor is still loading.");
        return;
      }

      const runId = latestAnalyzeRunRef.current + 1;
      latestAnalyzeRunRef.current = runId;
      analyzeInFlightRef.current = true;
      setIsAnalyzing(true);
      setResultMeta(null);
      setInputsOnlyRestored(false);
      setRecoveryNotices([]);
      setStatus("Reading the structure…");

      try {
        const editorSnapshot = await readKetcherStructureSnapshot(editor);
        const result = editorSnapshot?.smiles ?? "";
        const currentMolfile = editorSnapshot?.molfile ?? null;
        const safeSmiles = sanitizeDisplayedSmiles(result);
        // The structure this analysis is about; results are tied to it.
        let analyzedKet: string | null = null;
        try {
          analyzedKet = await editor.getKet();
        } catch {
          analyzedKet = null;
        }
        const analyzedKey = await ketIdentityKey(analyzedKet);

        if (!safeSmiles) {
          setSmiles("No molecule detected");
          setMolfile(null);
          setStatus("Draw a molecule before analyzing.");
          return;
        }

        const moleculeSource = currentMolfile || safeSmiles;
        setSmiles(safeSmiles);
        setMolfile(currentMolfile);
        setStatus("Finding groups, orbitals, and stereochemistry…");

        const [annotation, resonance, chirality, hierarchy] = await Promise.all([
          getMoleculeAnnotation(moleculeSource),
          analyzeResonance(moleculeSource),
          analyzeChirality(safeSmiles, currentMolfile ?? undefined),
          analyzeFunctionalGroupHierarchy(moleculeSource),
        ]);

        if (latestAnalyzeRunRef.current !== runId) return;

        const detectedFunctionalGroups = hierarchy.functionalGroups ?? [];
        setMoleculeAnnotation(annotation);
        setResonanceResults(resonance);
        setChiralityResults(chirality);
        setMainGroup(hierarchy.mainGroup ?? detectedFunctionalGroups[0] ?? null);
        setFunctionalGroups(detectedFunctionalGroups);
        setStatus("Calculating properties and supported reactions…");

        const [pathways, identity, acidity, basicity] = await Promise.all([
          import("./utils/reactionUtils").then(({ predictReactionPathways }) =>
            predictReactionPathways(safeSmiles, detectedFunctionalGroups),
          ),
          analyzeNomenclatureAndProperties(
            safeSmiles,
            hierarchy.primaryGroups,
            hierarchy.mainGroup,
          ).catch((nomenclatureError) => {
            console.error(
              "Nomenclature/property analysis failed:",
              nomenclatureError,
            );
            return null;
          }),
          analyzeAcidity(safeSmiles, hierarchy.primaryGroups).catch((acidError) => {
            console.error("Acidity analysis failed:", acidError);
            return [] as AcidityResult[];
          }),
          analyzeBasicity(safeSmiles, hierarchy.primaryGroups).catch((baseError) => {
            console.error("Basicity analysis failed:", baseError);
            return [] as BasicityResult[];
          }),
        ]);

        if (latestAnalyzeRunRef.current !== runId) return;

        setReactionPathways(pathways);
        setMoleculeIdentity(
          identity
            ? applyResolvedNameToIdentity(identity, importedNameResolutionRef.current)
            : null,
        );
        setAcidityResults(acidity);
        setBasicityResults(basicity);
        if (analyzedKey) {
          propsSnapshotRef.current = { ket: ketHasStructureText(analyzedKet) ? analyzedKet : null, key: analyzedKey };
          setResultMeta({
            computedAt: new Date().toISOString(),
            engineVersion: PROPERTIES_ENGINE_VERSION,
            structureKey: analyzedKey,
            restored: false,
            engineMismatch: false,
            stale: false,
          });
          // Edits made while the analysis ran are caught by this re-check.
          scheduleSnapshotRef.current();
        }
        setStatus("Analysis complete");
      } catch (error) {
        console.error("Analyze error:", error);
        if (latestAnalyzeRunRef.current === runId) {
          setStatus("Analysis failed. Check the structure and try again.");
        }
      } finally {
        if (latestAnalyzeRunRef.current === runId) {
          analyzeInFlightRef.current = false;
          setIsAnalyzing(false);
        }
      }
    };
  
  const getAtomCardClassName = (atom: MoleculeAnnotation["atoms"][number]) => {
    const classes = ["annotation-card"];

    if (selectedConcept === "hybridization") {
      classes.push(`hybridization-${atom.hybridization}`);

      if (
        selectedHybridization !== "all" &&
        atom.hybridization === selectedHybridization
      ) {
        classes.push("annotation-card-highlighted");
      }
    }

    if (selectedConcept === "lonePairs" && atom.lonePairInfo.count > 0) {
      classes.push("annotation-card-highlighted");
    }

    if (selectedAtomIndex === atom.atomIndex) {
      classes.push("annotation-card-selected");
    }

    return classes.join(" ");
  };

  const getBondCardClassName = (bond: MoleculeAnnotation["bonds"][number]) => {
    const classes = ["annotation-card"];

    if (selectedConcept === "bondOrbitals") {
      classes.push(`bond-${bond.bondType}`);

      if (selectedBondType !== "all" && bond.bondType === selectedBondType) {
        classes.push("annotation-card-highlighted");
      }
    }

    if (selectedBondIndex === bond.bondIndex) {
      classes.push("annotation-card-selected");
    }

    return classes.join(" ");
  };

  const getVisibleAtomAnnotations = useCallback(() => {

    
    if (!moleculeAnnotation) return [];

    if (selectedConcept === "hybridization") {
      return moleculeAnnotation.atoms.filter((atom) => {
        if (atom.hybridization === "unknown") return false;

        if (selectedHybridization === "all") {
          return true;
        }

        return atom.hybridization === selectedHybridization;
      });
    }

    if (selectedConcept === "lonePairs") {
      return moleculeAnnotation.atoms.filter(
        (atom) => atom.lonePairInfo.count > 0
      );
    }

    if (selectedConcept === "acidBaseSites") {
      return moleculeAnnotation.atoms.filter((atom) =>
        atom.siteTypes.some(
          (site) =>
            site.includes("basic") ||
            site.includes("acid") ||
            site.includes("lone-pair")
        )
      );
    }

    if (selectedConcept === "reactiveSites") {
      return moleculeAnnotation.atoms.filter((atom) =>
        atom.siteTypes.some(
          (site) =>
            site.includes("electrophilic") ||
            site.includes("basic") ||
            site.includes("lone-pair")
        )
      );
    }

    return [];
  }, [moleculeAnnotation, selectedConcept, selectedHybridization]);

  const getVisibleBondAnnotations = useCallback(() => {
    if (!moleculeAnnotation) return [];

    if (selectedConcept === "bondOrbitals") {
      return moleculeAnnotation.bonds.filter((bond) => {
        if (selectedBondType === "all") return true;
        return bond.bondType === selectedBondType;
      });
    }

    return [];
  }, [moleculeAnnotation, selectedBondType, selectedConcept]);

  const getHighlightedAtomIndices = useCallback(() => {
    const visibleAtomIndices = getVisibleAtomAnnotations().map(
      (atom) => atom.atomIndex
    );

    if (selectedConcept === "functionalGroups") {
    return Array.from(
      new Set(
        functionalGroupOccurrences.flatMap((occurrence) => occurrence.atoms)
      )
    );
  }

    if (selectedConcept === "resonance") {
      const allResonanceAtomIndices = resonanceResults.flatMap((result) => [
        ...result.matchedAtoms,
        ...(result.possibleRadicalSites ?? []),
      ]);

      return Array.from(new Set(allResonanceAtomIndices));
    }

    if (selectedConcept === "chirality") {
    return Array.from(
      new Set(chiralityResults.map((result) => result.atomIndex))
    );
    }

    if (selectedAtomIndex !== null) {
      visibleAtomIndices.push(selectedAtomIndex);
    }

    if (selectedBondIndex !== null && moleculeAnnotation) {
      const selectedBond = moleculeAnnotation.bonds.find(
        (bond) => bond.bondIndex === selectedBondIndex
      );

      if (selectedBond) {
        visibleAtomIndices.push(...selectedBond.atomIndices);
      }
    }

    return Array.from(new Set(visibleAtomIndices));
  }, [
    chiralityResults,
    functionalGroupOccurrences,
    getVisibleAtomAnnotations,
    moleculeAnnotation,
    resonanceResults,
    selectedAtomIndex,
    selectedBondIndex,
    selectedConcept,
  ]);

  const getHighlightedBondIndices = useCallback(() => {
    const visibleBondIndices: number[] = [];

    if (selectedConcept === "functionalGroups") {
    return Array.from(
      new Set(
        functionalGroupOccurrences.flatMap((occurrence) => occurrence.bonds)
      )
    );
  }

    if (selectedConcept === "resonance") {
      const allResonanceBondIndices = resonanceResults.flatMap(
        (result) => result.resonanceBondIndices ?? []
      );

      return Array.from(new Set(allResonanceBondIndices));
    }

    if (selectedConcept === "bondOrbitals") {
      visibleBondIndices.push(
        ...getVisibleBondAnnotations().map((bond) => bond.bondIndex)
      );
    }

    if (selectedBondIndex !== null) {
      visibleBondIndices.push(selectedBondIndex);
    }

    return Array.from(new Set(visibleBondIndices));
  }, [
    functionalGroupOccurrences,
    getVisibleBondAnnotations,
    resonanceResults,
    selectedBondIndex,
    selectedConcept,
  ]);

  const annotationCarouselItems = useMemo<AnnotationCarouselItem[]>(() => {
    if (selectedConcept === "resonance") {
      return resonanceResults.map((resonance) => ({
        kind: "resonance" as const,
        resonance,
      }));
    }

    if (selectedConcept === "functionalGroups") {
      return functionalGroupOccurrences.map((functionalGroup) => ({
        kind: "functionalGroup" as const,
        functionalGroup,
      }));
    }

    if (selectedConcept === "chirality") {
      return chiralityResults.map((chirality) => ({
        kind: "chirality" as const,
        chirality,
      }));
    }

    const atomItems = getVisibleAtomAnnotations().map((atom) => ({
      kind: "atom" as const,
      atom,
    }));
    const bondItems = getVisibleBondAnnotations().map((bond) => ({
      kind: "bond" as const,
      bond,
    }));

    return [...atomItems, ...bondItems];
  }, [
    selectedConcept,
    resonanceResults,
    chiralityResults,
    functionalGroupOccurrences,
    getVisibleAtomAnnotations,
    getVisibleBondAnnotations,
  ]);

  const currentAnnotationItem =
    annotationCarouselItems[annotationCardIndex] ?? null;

  const getSelectedFunctionalGroupAtomIndices = useCallback(() => {
    if (
      selectedConcept !== "functionalGroups" ||
      currentAnnotationItem?.kind !== "functionalGroup"
    ) { 
      return [];
    }

    return currentAnnotationItem.functionalGroup.atoms;
  }, [currentAnnotationItem, selectedConcept]);

  const getSelectedFunctionalGroupBondIndices = useCallback(() => {
    if (
      selectedConcept !== "functionalGroups" ||
      currentAnnotationItem?.kind !== "functionalGroup"
    ) {
      return [];
    }

    return currentAnnotationItem.functionalGroup.bonds;
  }, [currentAnnotationItem, selectedConcept]);

  const getSelectedResonanceAtomIndices = useCallback(() => {
    if (
      selectedConcept !== "resonance" ||
      currentAnnotationItem?.kind !== "resonance"
    ) {
      return [];
    }

    return Array.from(
      new Set([
        ...currentAnnotationItem.resonance.matchedAtoms,
        ...(currentAnnotationItem.resonance.possibleRadicalSites ?? []),
      ])
    );
  }, [currentAnnotationItem, selectedConcept]);

  const getSelectedResonanceBondIndices = useCallback(() => {
    if (
      selectedConcept !== "resonance" ||
      currentAnnotationItem?.kind !== "resonance"
    ) {
      return [];
    }

    return Array.from(
      new Set(currentAnnotationItem.resonance.resonanceBondIndices ?? [])
    );
  }, [currentAnnotationItem, selectedConcept]);

  const getSelectedChiralityAtomIndices = useCallback(() => {
    if (
      selectedConcept !== "chirality" ||
      currentAnnotationItem?.kind !== "chirality"
    ) {
      return [];
    }

    return [currentAnnotationItem.chirality.atomIndex];
  }, [currentAnnotationItem, selectedConcept]);

  useEffect(() => {
    let cancelled = false;

    const updateHighlightedSvg = async () => {
      if (!moleculeAnnotation || smiles === "Not analyzed yet") {
        if (!cancelled) setHighlightedMoleculeSvg(null);
        return;
      }

      const atomIndices = getHighlightedAtomIndices();
      const bondIndices = getHighlightedBondIndices();

  const moleculeSourceForHighlight = molfile || smiles;

    
  const svg = await getHighlightedMoleculeSvg(
    moleculeSourceForHighlight,
    atomIndices,
    bondIndices,
    selectedConcept === "resonance" || selectedConcept === "chirality" || selectedConcept === "functionalGroups"
      ? null
      : selectedAtomIndex,
    selectedConcept === "resonance" || selectedConcept === "chirality" || selectedConcept === "functionalGroups"
      ? null
      : selectedBondIndex,
    [
      ...getSelectedResonanceAtomIndices(),
      ...getSelectedChiralityAtomIndices(),
      ...getSelectedFunctionalGroupAtomIndices(),
    ],
    [
      ...getSelectedResonanceBondIndices(),
      ...getSelectedFunctionalGroupBondIndices(),
    ]
  );

      if (!cancelled) setHighlightedMoleculeSvg(svg);
    };

    void updateHighlightedSvg();

    return () => {
      cancelled = true;
    };
  }, [
    moleculeAnnotation,
    smiles,
    molfile,
    selectedConcept,
    selectedHybridization,
    selectedBondType,
    selectedAtomIndex,
    selectedBondIndex,
    resonanceResults,
    annotationCardIndex,
    getHighlightedAtomIndices,
    getHighlightedBondIndices,
    getSelectedChiralityAtomIndices,
    getSelectedFunctionalGroupAtomIndices,
    getSelectedFunctionalGroupBondIndices,
    getSelectedResonanceAtomIndices,
    getSelectedResonanceBondIndices,
  ]);

  useEffect(() => {
    initializeFunctionalGroups();
  }, []);

  useEffect(() => {
    const nextAtomIndex =
      currentAnnotationItem?.kind === "atom"
        ? currentAnnotationItem.atom.atomIndex
        : null;
    const nextBondIndex =
      currentAnnotationItem?.kind === "bond"
        ? currentAnnotationItem.bond.bondIndex
        : null;

    const frame = requestAnimationFrame(() => {
      setSelectedAtomIndex(nextAtomIndex);
      setSelectedBondIndex(nextBondIndex);
    });

    return () => cancelAnimationFrame(frame);
  }, [currentAnnotationItem]);

  const goToPreviousAnnotationCard = useCallback(() => {
    if (annotationCarouselItems.length === 0) return;

    setAnnotationCardIndex((currentIndex) =>
      currentIndex === 0 ? annotationCarouselItems.length - 1 : currentIndex - 1
    );
  }, [annotationCarouselItems.length]);

  const goToNextAnnotationCard = useCallback(() => {
    if (annotationCarouselItems.length === 0) return;

    setAnnotationCardIndex((currentIndex) =>
      currentIndex === annotationCarouselItems.length - 1 ? 0 : currentIndex + 1
    );
  }, [annotationCarouselItems.length]);

  {/* FAST MOLECULE NAVIGATION CLICKER */}

  const jumpToAnnotationItem = useCallback((kind: "atom" | "bond", index: number) => {

      if (selectedConcept === "functionalGroups") {
    const targetIndex = annotationCarouselItems.findIndex((item) => {
      if (item.kind !== "functionalGroup") return false;

      return kind === "atom"
        ? item.functionalGroup.atoms.includes(index)
        : item.functionalGroup.bonds.includes(index);
    });

    if (targetIndex !== -1) {
      setAnnotationCardIndex(targetIndex);
      setSelectedAtomIndex(null);
      setSelectedBondIndex(null);
    }

    return;
  }
    // Special behavior for Resonance mode:
    // clicking any atom/bond in a resonance system jumps to that resonance card.
    if (selectedConcept === "resonance") {
      const targetIndex = annotationCarouselItems.findIndex((item) => {
        if (item.kind !== "resonance") return false;

        const resonance = item.resonance;

        if (kind === "atom") {
          return [
            ...resonance.matchedAtoms,
            ...(resonance.possibleRadicalSites ?? []),
          ].includes(index);
        }

        if (kind === "bond") {
          return (resonance.resonanceBondIndices ?? []).includes(index);
        }

        return false;
      });

      if (targetIndex !== -1) {
        setAnnotationCardIndex(targetIndex);
        setSelectedAtomIndex(null);
        setSelectedBondIndex(null);
      }

      return;
    }

    if (selectedConcept === "chirality" && kind === "atom") {
    const targetIndex = annotationCarouselItems.findIndex(
      (item) =>
        item.kind === "chirality" && item.chirality.atomIndex === index
    );

    if (targetIndex !== -1) {
      setAnnotationCardIndex(targetIndex);
      setSelectedAtomIndex(null);
      setSelectedBondIndex(null);
    }

    return;
  }

    // Normal atom/bond behavior for non-resonance modes
    const targetIndex = annotationCarouselItems.findIndex((item) => {
      if (kind === "atom" && item.kind === "atom") {
        return item.atom.atomIndex === index;
      }

      if (kind === "bond" && item.kind === "bond") {
        return item.bond.bondIndex === index;
      }

      return false;
    });

    if (targetIndex === -1) return;

    setAnnotationCardIndex(targetIndex);

    if (kind === "atom") {
      setSelectedAtomIndex(index);
      setSelectedBondIndex(null);
    } else {
      setSelectedBondIndex(index);
      setSelectedAtomIndex(null);
    }
  }, [annotationCarouselItems, selectedConcept]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnnotationCardIndex(0));
    return () => cancelAnimationFrame(frame);
  }, [selectedConcept, selectedHybridization, selectedBondType, moleculeAnnotation]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (annotationCarouselItems.length <= 1) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousAnnotationCard();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextAnnotationCard();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    annotationCarouselItems.length,
    goToNextAnnotationCard,
    goToPreviousAnnotationCard,
  ]);

  {/* CLICKER FUNCTION */}
  useEffect(() => {
    const container = highlightedSvgRef.current;
    if (!container) return;

    const svg = container.querySelector("svg");
    if (!svg) return;

    const clickableElements = svg.querySelectorAll(
      "[class*='atom-'], [class*='bond-']"
    );

    const cleanupFunctions: Array<() => void> = [];

    clickableElements.forEach((element) => {
      element.classList.add("svg-clickable-site");

      const handleClick = (event: Event) => {
        event.stopPropagation();

        const className = element.getAttribute("class") ?? "";

        const bondMatch = className.match(/bond-(\d+)/);
        const atomMatch = className.match(/atom-(\d+)/);

        if (bondMatch) {
          jumpToAnnotationItem("bond", Number(bondMatch[1]));
          return;
        }

        if (atomMatch) {
          jumpToAnnotationItem("atom", Number(atomMatch[1]));
        }
      };

      element.addEventListener("click", handleClick);

      cleanupFunctions.push(() => {
        element.removeEventListener("click", handleClick);
      });
    });

    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }, [highlightedMoleculeSvg, annotationCarouselItems, jumpToAnnotationItem]);

  const renderCurrentAnnotationCard = () => {
    if (!currentAnnotationItem) return null;

    if (currentAnnotationItem.kind === "atom") {
      return (
        <div
          className={getAtomCardClassName(currentAnnotationItem.atom)}
          onClick={() => {
            setSelectedAtomIndex(currentAnnotationItem.atom.atomIndex);
            setSelectedBondIndex(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setSelectedAtomIndex(currentAnnotationItem.atom.atomIndex);
            setSelectedBondIndex(null);
          }}
          role="button"
          tabIndex={0}
        >
          <h3>
            Atom {currentAnnotationItem.atom.atomIndex + 1}: {" "}
            {currentAnnotationItem.atom.element}
          </h3>

          {selectedAtomIndex === currentAnnotationItem.atom.atomIndex && (
            <p className="selected-note">Selected atom</p>
          )}

          <p>
            <strong>Hybridization:</strong> {" "}
            {currentAnnotationItem.atom.hybridization}
          </p>

          {selectedConcept === "lonePairs" && (
            <>
              <p>
                <strong>Lone pairs:</strong> {" "}
                {currentAnnotationItem.atom.lonePairInfo.count}
              </p>
              <p>
                <strong>Lone pair orbital:</strong> {" "}
                {currentAnnotationItem.atom.lonePairInfo.orbital}
              </p>
              <p>
                <strong>Resonance participation:</strong> {" "}
                {currentAnnotationItem.atom.lonePairInfo.participatesInResonance
                  ? "Yes"
                  : "No"}
              </p>
              <p>{currentAnnotationItem.atom.lonePairInfo.explanation}</p>
            </>
          )}

          {currentAnnotationItem.atom.siteTypes.length > 0 &&
            selectedConcept !== "lonePairs" && (
              <p>
                <strong>Site type:</strong> {" "}
                {currentAnnotationItem.atom.siteTypes.join(", ")}
              </p>
            )}

          {selectedConcept !== "lonePairs" && (
            <p>{currentAnnotationItem.atom.explanation}</p>
          )}
        </div>
      );
    }

    if (currentAnnotationItem.kind === "bond") {
      return (
        <div
          className={getBondCardClassName(currentAnnotationItem.bond)}
          onClick={() => {
            setSelectedBondIndex(currentAnnotationItem.bond.bondIndex);
            setSelectedAtomIndex(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setSelectedBondIndex(currentAnnotationItem.bond.bondIndex);
            setSelectedAtomIndex(null);
          }}
          role="button"
          tabIndex={0}
        >
          <h3>
            {currentAnnotationItem.bond.bondType} bond: Atom {" "}
            {currentAnnotationItem.bond.atomIndices[0] + 1}–Atom {" "}
            {currentAnnotationItem.bond.atomIndices[1] + 1}
          </h3>

          {selectedBondIndex === currentAnnotationItem.bond.bondIndex && (
            <p className="selected-note">Selected bond</p>
          )}

          <p>
            <strong>Sigma overlap:</strong> {" "}
            {currentAnnotationItem.bond.sigmaOverlap}
          </p>

          {currentAnnotationItem.bond.piOverlap && (
            <p>
              <strong>Pi overlap:</strong> {" "}
              {currentAnnotationItem.bond.piOverlap}
            </p>
          )}

          <p>
            <strong>Orbital info:</strong> {" "}
            {currentAnnotationItem.bond.orbitalInfo.join(", ")}
          </p>

          <p>{currentAnnotationItem.bond.explanation}</p>
        </div>
      );
    }

    if (currentAnnotationItem.kind === "chirality") {
      return (
        <div className="annotation-card annotation-card-selected">
          <h3>
            Atom {currentAnnotationItem.chirality.atomIndex + 1}: {" "}
            {currentAnnotationItem.chirality.element}
          </h3>

          <p className="selected-note">Selected chiral center</p>

          <p>
            <strong>Configuration:</strong> {" "}
            {currentAnnotationItem.chirality.configuration === "unknown"
              ? "Not assigned"
              : currentAnnotationItem.chirality.configuration}
          </p>

          <p>
            <strong>Assignment source:</strong> {" "}
            {currentAnnotationItem.chirality.assignmentSource === "rdkit"
              ? "Automatic Analysis"
              : currentAnnotationItem.chirality.assignmentSource ===
                "pocketchem-fallback"
              ? "Manual Analysis"
              : "Unassigned"}
          </p>

          {currentAnnotationItem.chirality.configuration === "unknown" && (
            <p className="empty">
              Add wedge/dash bonds in Ketcher to specify stereochemistry for R/S
              assignment.
            </p>
          )}

          <p>
            <strong>Type:</strong> {currentAnnotationItem.chirality.label}
          </p>

          <p>{currentAnnotationItem.chirality.explanation}</p>

          <p>
            <strong>Why this is chiral:</strong> {" "}
            {currentAnnotationItem.chirality.whyChiralExplanation}
          </p>

          <p>
            <strong>How the configuration was assigned:</strong> {" "}
            {currentAnnotationItem.chirality.configurationExplanation}
          </p>
        </div>
      );
    }

    if (currentAnnotationItem.kind === "functionalGroup") {
      return (
        <div className="annotation-card annotation-card-selected">
          <h3>{currentAnnotationItem.functionalGroup.groupName}</h3>

          <p className="selected-note">
            Occurrence {currentAnnotationItem.functionalGroup.occurrence} / {" "}
            {currentAnnotationItem.functionalGroup.totalOccurrences}
          </p>

          <p>
            <strong>Confidence:</strong> {" "}
            {currentAnnotationItem.functionalGroup.group.confidence}
          </p>

          <p>
            <strong>Suffix:</strong> {" "}
            {currentAnnotationItem.functionalGroup.group.suffix}
          </p>

          <p>
            <strong>Prefix:</strong> {" "}
            {currentAnnotationItem.functionalGroup.group.prefix}
          </p>

          <p>
            <strong>Highlighted atoms:</strong> {" "}
            {currentAnnotationItem.functionalGroup.atoms
              .map((atomIndex) => atomIndex + 1)
              .join(", ")}
          </p>

          <p>{currentAnnotationItem.functionalGroup.group.mcatNote}</p>
        </div>
      );
    }

    return null;
  };

  const clearAnalysis = () => {
    // Clearing also discards the saved workspace and invalidates any restoration still in flight.
    void persistence.discard();
    propsSnapshotRef.current = { ket: null, key: null };
    snapshotTask.cancel();
    setResultMeta(null);
    setInputsOnlyRestored(false);
    setRecoveryNotices([]);
    importedNameResolutionRef.current = null;
    analyzeInFlightRef.current = false;
    latestAnalyzeRunRef.current += 1;
    setIsAnalyzing(false);

    setSmiles("Not analyzed yet");
    setStatus("Draw a molecule first");
    setMainGroup(null);
    setFunctionalGroups([]);
    setAcidityResults([]);
    setBasicityResults([]);
    setResonanceResults([]);
    setChiralityResults([]);
    setReactionPathways([]);
    setActivePage("analysis");
    setAnalysisPanel("overview");
    setMoleculeAnnotation(null);
    setSelectedAtomIndex(null);
    setSelectedBondIndex(null);
    setAnnotationCardIndex(0);
    setHighlightedMoleculeSvg(null);
    setMolfile(null);
    setMoleculeIdentity(null);

    // Ketcher's setMolecule("") is an import operation rather than a true clear.
    // Remounting gives the main drawer a fresh editor canvas and also clears any
    // active selection/rotate/tool state without disturbing the rest of the page.
    setIsMainEditorReady(false);
    setMainEditorResetVersion((version) => version + 1);
  };

  // What was recovered, what is only a saved snapshot, and what could not be saved.
  const propertiesNotices: WorkspaceNoticeItem[] = [...recoveryNotices];
  if (resultMeta?.restored) {
    propertiesNotices.push({
      tone: "info",
      text: `Restored from your previous session (analyzed ${new Date(resultMeta.computedAt).toLocaleString()}). These results were not recomputed.`,
    });
  } else if (inputsOnlyRestored) {
    propertiesNotices.push({ tone: "info", text: "Restored your drawn structure from your previous session." });
  }
  if (resultMeta?.opened) {
    propertiesNotices.push({
      tone: "info",
      text: `Opened saved analysis “${resultMeta.opened.name}” (saved ${new Date(resultMeta.opened.savedAt).toLocaleString()}; analyzed ${new Date(resultMeta.computedAt).toLocaleString()}). These results were not recomputed.`,
    });
  }
  if (saveMessage) propertiesNotices.push(saveMessage);
  if (resultMeta?.engineMismatch) {
    propertiesNotices.push({
      tone: "warn",
      text: "These results were saved by an earlier version of the analysis code. They are shown as saved and have not been recomputed.",
    });
  }
  if (resultMeta?.stale) {
    propertiesNotices.push({
      tone: "warn",
      text: `The structure changed after this analysis. The results below describe the earlier structure (${smiles}); analyze again to update them.`,
    });
  }
  if (!persistenceStatus.available) {
    propertiesNotices.push({ tone: "warn", text: "Browser storage is unavailable, so your work on this page will not be saved." });
  }
  if (persistenceStatus.saveError) {
    propertiesNotices.push({
      tone: "warn",
      text: persistenceStatus.saveError.code === "quota"
        ? "Your latest changes could not be saved because browser storage is full."
        : `Your latest changes could not be saved (${persistenceStatus.saveError.message}).`,
    });
  }
  if (persistenceStatus.resultsOmitted) {
    propertiesNotices.push({ tone: "warn", text: "The results were too large to save; your structure was saved without them." });
  }

  const propertyGroups = useMemo(() => countGroups(functionalGroupOccurrences), [functionalGroupOccurrences]);
  const propertyStereocenters = useMemo(() => chiralityResults.map((result) => ({ label: result.label, configuration: result.configuration })), [chiralityResults]);

  {/*RETURN STATEMENT*/}

  return (
    <NavigationContext.Provider value={navigation}>
    <main className="app" ref={appShellRef}>
      {activeSubject === "organic" ? (
        <AppShell
          activeToolId={activePage}
          onSelectTool={(id) => switchPage(id as AppPage)}
          onToolKeyDown={(event, id) => handlePageTabKeyDown(event, id as AppPage)}
          onOpenSearch={() => openSearch()}
          onSelectSubject={(id) => switchSubject(id)}
        />
      ) : (
        <AppShell
          activeSubject={activeSubject}
          activeToolId={generalTool}
          onOpenSearch={() => openSearch()}
          onSelectSubject={(id) => switchSubject(id)}
          onSelectTool={(id) => switchGeneralTool(id as SubjectToolId)}
          onToolKeyDown={(event, id) => handleGeneralTabKeyDown(event, id as SubjectToolId)}
          tools={SUBJECT_TOOLS[activeSubject]}
        />
      )}

      <div id="main-content" tabIndex={-1} className="main-content">
      {activeSubject === "biochemistry" ? (
        <section
          aria-labelledby={`page-tab-${generalTool}`}
          className="page-panel"
          id={`page-panel-${generalTool}`}
          role="tabpanel"
        >
          <Suspense fallback={<div className="card page-loading" role="status"><span className="loading-spinner" aria-hidden="true" />Loading tool…</div>}>
            {generalTool === "bcAminoAcids" ? (
              <AminoAcidsPage
                openRequest={pendingOpen?.page === "bcAminoAcids" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bcProteins" ? (
              <ProteinsPage
                openRequest={pendingOpen?.page === "bcProteins" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bcEnzymes" ? (
              <EnzymesPage
                openRequest={pendingOpen?.page === "bcEnzymes" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bcGlycolysis" ? (
              <GlycolysisPage
                openRequest={pendingOpen?.page === "bcGlycolysis" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bcGluconeogenesis" ? (
              <GluconeogenesisPage
                openRequest={pendingOpen?.page === "bcGluconeogenesis" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bcTca" ? (
              <CitricAcidPage
                openRequest={pendingOpen?.page === "bcTca" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bcEtc" ? (
              <ElectronTransportPage
                openRequest={pendingOpen?.page === "bcEtc" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bcMetabolism" ? (
              <MetabolicMapPage
                openRequest={pendingOpen?.page === "bcMetabolism" ? pendingOpen : null}
                onOpenTool={(id: BiochemistryToolId) => switchGeneralTool(id)}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bcSaved" ? (
              <SavedAnalysesPage onOpen={openSavedAnalysis} />
            ) : (
              <BiochemOverview onOpenTool={(id: BiochemistryToolId) => switchGeneralTool(id)} />
            )}
          </Suspense>
        </section>
      ) : activeSubject === "biology" ? (
        <section
          aria-labelledby={`page-tab-${generalTool}`}
          className="page-panel"
          id={`page-panel-${generalTool}`}
          role="tabpanel"
        >
          <Suspense fallback={<div className="card page-loading" role="status"><span className="loading-spinner" aria-hidden="true" />Loading tool…</div>}>
            {generalTool === "bioReplication" ? (
              <ReplicationPage
                openRequest={pendingOpen?.page === "bioReplication" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bioTranscription" ? (
              <TranscriptionPage
                openRequest={pendingOpen?.page === "bioTranscription" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bioTranslation" ? (
              <TranslationPage
                onOpenPeptide={() => switchSubject("biochemistry", { tool: "bcAminoAcids" })}
                openRequest={pendingOpen?.page === "bioTranslation" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bioDogma" ? (
              <CentralDogmaPage
                openRequest={pendingOpen?.page === "bioDogma" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bioRegulation" ? (
              <RegulationPage
                openRequest={pendingOpen?.page === "bioRegulation" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bioGenetics" ? (
              <GeneticsPage
                onNavigate={(id: BiologyToolId) => switchGeneralTool(id)}
                openRequest={pendingOpen?.page === "bioGenetics" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bioDivision" ? (
              <CellDivisionPage
                onNavigate={(id: BiologyToolId) => switchGeneralTool(id)}
                openRequest={pendingOpen?.page === "bioDivision" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bioMembrane" ? (
              <MembranePage
                onNavigate={(id) => switchGeneralTool(id)}
                openRequest={pendingOpen?.page === "bioMembrane" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bioSignaling" ? (
              <SignalingPage
                onNavigate={(id) => switchGeneralTool(id)}
                openRequest={pendingOpen?.page === "bioSignaling" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bioNeuron" ? (
              <NeuronPage
                onNavigate={(id) => switchGeneralTool(id)}
                openRequest={pendingOpen?.page === "bioNeuron" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "bioSaved" ? (
              <SavedAnalysesPage onOpen={openSavedAnalysis} />
            ) : (
              <BiologyOverview onOpenTool={(id: BiologyToolId) => switchGeneralTool(id)} />
            )}
          </Suspense>
        </section>
      ) : activeSubject === "physics" ? (
        <section
          aria-labelledby={`page-tab-${generalTool}`}
          className="page-panel"
          id={`page-panel-${generalTool}`}
          role="tabpanel"
        >
          <Suspense fallback={<div className="card page-loading" role="status"><span className="loading-spinner" aria-hidden="true" />Loading tool…</div>}>
            {generalTool === "phMechanics" ? (
              <MechanicsPage
                openRequest={pendingOpen?.page === "phMechanics" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "phCircuits" ? (
              <CircuitsPage
                openRequest={pendingOpen?.page === "phCircuits" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "phForces" ? (
              <ForcesPage
                openRequest={pendingOpen?.page === "phForces" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "phEnergy" ? (
              <EnergyPage
                openRequest={pendingOpen?.page === "phEnergy" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "phCollisions" ? (
              <CollisionsPage
                openRequest={pendingOpen?.page === "phCollisions" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "phWaves" ? (
              <WavesPage
                openRequest={pendingOpen?.page === "phWaves" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "phOptics" ? (
              <OpticsPage
                openRequest={pendingOpen?.page === "phOptics" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "phInterference" ? (
              <InterferencePage
                openRequest={pendingOpen?.page === "phInterference" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "phRc" ? (
              <RcPage
                openRequest={pendingOpen?.page === "phRc" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "phSaved" ? (
              <SavedAnalysesPage onOpen={openSavedAnalysis} />
            ) : (
              <PhysicsOverview onOpenTool={(id: PhysicsToolId) => switchGeneralTool(id)} />
            )}
          </Suspense>
        </section>
      ) : activeSubject === "general" ? (
        <section
          aria-labelledby={`page-tab-${generalTool}`}
          className="page-panel"
          id={`page-panel-${generalTool}`}
          role="tabpanel"
        >
          <Suspense fallback={<div className="card page-loading" role="status"><span className="loading-spinner" aria-hidden="true" />Loading tool…</div>}>
            {generalTool === "gcOverview" ? (
              <GeneralChemistryOverview onOpenTool={(id) => switchGeneralTool(id)} />
            ) : generalTool === "gcSaved" ? (
              <SavedAnalysesPage onOpen={openSavedAnalysis} />
            ) : generalTool === "gcEquilibrium" ? (
              <EquilibriumPage
                openRequest={pendingOpen?.page === "gcEquilibrium" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "gcKinetics" ? (
              <KineticsPage
                openRequest={pendingOpen?.page === "gcKinetics" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "gcStoichiometry" ? (
              <StoichiometryPage
                openRequest={pendingOpen?.page === "gcStoichiometry" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "gcGas" ? (
              <GasLawsPage
                openRequest={pendingOpen?.page === "gcGas" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "gcElectro" ? (
              <ElectrochemistryPage
                openRequest={pendingOpen?.page === "gcElectro" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : generalTool === "gcThermo" ? (
              <ThermodynamicsPage
                openRequest={pendingOpen?.page === "gcThermo" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : (
              <AcidBaseTitrationPage
                openRequest={pendingOpen?.page === "gcAcidBase" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            )}
          </Suspense>
        </section>
      ) : activePage === "analysis" ? (
        <section
          aria-labelledby="page-tab-analysis"
          className="workspace workspace-compact"
          id="page-panel-analysis"
          role="tabpanel"
        >
          <div className="card molecule-card molecule-card-compact">
            <ToolHeader
              group="Analyze"
              title="Properties"
              purpose="Draw a molecule to review its overview, acid/base sites, concepts, and molecular properties."
              ready={isMainEditorReady}
              evidence="estimate"
              steps={[
                { label: "Draw or name", detail: "Draw it, or type a name and press Enter." },
                { label: "Analyze Molecule", detail: "Computes identity, groups and properties." },
                { label: "Open a dashboard tab", detail: "Overview, acid/base, concepts, properties." },
              ]}
            />

            <div className="drawer-placeholder drawer-placeholder-compact">
              <MoleculeDrawer
                key={`main-editor-${mainEditorResetVersion}`}
                onReady={handleMainEditorReady}
                onChange={handleMainEditorChange}
                onStructureLoaded={schedulePropertiesSnapshot}
                onNameStructureApplied={handleMainNameApplied}
                onNameSubmitProcess={analyzeMolecule}
              />
            </div>

            <div className="button-row">
              <button
                className="primary-button"
                onClick={analyzeMolecule}
                disabled={isAnalyzing || !isMainEditorReady}
                type="button"
              >
                {isAnalyzing ? "Analyzing…" : "Analyze Molecule"}
              </button>

              <button
                className="secondary-button"
                onClick={clearAnalysis}
                disabled={isAnalyzing}
                type="button"
              >
                Clear Analysis
              </button>

              <button
                className="secondary-button"
                onClick={() => {
                  setSaveMessage(null);
                  setSaveForm({ name: defaultAnalysisName() });
                }}
                disabled={!resultMeta || isAnalyzing || isOpening || saveBusy}
                title={resultMeta ? "Keep this analysis in Saved analyses" : "Analyze a molecule first"}
                type="button"
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
          </div>

          <div className="card analysis-card analysis-dashboard-card">
            <div className="dashboard-header">
              <div>
                <h2>Properties Dashboard</h2>
                <p>
                  {moleculeIdentity
                    ? moleculeIdentity.nomenclature.displayName ||
                      moleculeIdentity.nomenclature.estimatedName
                    : "Analyze a molecule to fill this dashboard."}
                </p>
              </div>

              <span className="status">
                {functionalGroupOccurrences.length} group
                {functionalGroupOccurrences.length === 1 ? "" : "s"}
              </span>
            </div>

            <WorkspaceNotice
              embedded
              notices={propertiesNotices}
              onDiscard={resultMeta?.restored || inputsOnlyRestored ? clearAnalysis : undefined}
              discardDisabled={isAnalyzing}
            />

            {savedOpen.prompt && (
              <ReplaceWorkspacePrompt
                embedded
                name={savedOpen.prompt.opened.record.name}
                canSaveFirst={Boolean(resultMeta) && !isAnalyzing}
                busy={savedOpen.saveBusy}
                onChoose={(choice) => void savedOpen.resolve(choice)}
              />
            )}

            <p aria-live="polite" className="pr-status" data-testid="pr-status">
              <span className="label">Status</span> <strong>{status}</strong>
              {moleculeIdentity ? <span className="pr-status-meta"> · {reactionPathways.length} predicted {reactionPathways.length === 1 ? "reaction" : "reactions"}</span> : null}
            </p>

            {moleculeIdentity ? (
              <PropertiesIdentity groups={propertyGroups} identity={moleculeIdentity} smiles={smiles} stereocenters={propertyStereocenters} />
            ) : null}

            <div className="dashboard-tab-row">
              {ANALYSIS_PANELS.map((panel) => (
                <button
                  aria-pressed={analysisPanel === panel.id}
                  key={panel.id}
                  className={
                    analysisPanel === panel.id
                      ? "dashboard-tab active"
                      : "dashboard-tab"
                  }
                  onClick={() => setAnalysisPanel(panel.id)}
                  type="button"
                >
                  {panel.label}
                </button>
              ))}
            </div>

            <div className="dashboard-panel-scroll">
              {analysisPanel === "overview" && (
                <div className="dashboard-panel">
                  {moleculeIdentity ? (
                    <PropertiesSummary groups={propertyGroups} identity={moleculeIdentity} info={PROPERTY_INFO} smiles={smiles} stereocenters={propertyStereocenters} />
                  ) : (
                    <p className="empty">Analyze a molecule to estimate its name, formula, DBE, and molecular properties.</p>
                  )}
                </div>
              )}

              {analysisPanel === "acidBase" && (
                <div className="dashboard-panel">
                  <div className="analysis-section compact-section">
                    <p className="label">Acid/Base Sites & Estimates</p>

                    <div className="acid-base-summary-grid">
                      <div className="acid-base-summary-card">
                        <span>Strongest acidic site</span>
                        <strong>
                          {acidityResults[0]
                            ? `${acidityResults[0].acidicSite} (atom ${acidityResults[0].siteAtomIndex + 1})`
                            : "None detected"}
                        </strong>
                        <p>
                          {acidityResults[0]
                            ? `Estimated pKa ${acidityResults[0].estimatedPka} · typical range ${formatPkaRange(acidityResults[0].estimatedPkaRange)} · ${acidityResults[0].confidence.toLowerCase()} confidence`
                            : "Analyze a molecule first."}
                        </p>
                      </div>

                      <div className="acid-base-summary-card">
                        <span>Strongest basic site</span>
                        <strong>
                          {basicityResults[0]
                            ? `${basicityResults[0].basicSite} (atom ${basicityResults[0].siteAtomIndex + 1})`
                            : "None detected"}
                        </strong>
                        <p>
                          {basicityResults[0]
                            ? `Conjugate acid pKa ${basicityResults[0].conjugateAcidPka} · ${basicityResults[0].confidence.toLowerCase()} confidence`
                            : "Analyze a molecule first."}
                        </p>
                      </div>

                      <div className="acid-base-summary-card">
                        <span>Detected groups</span>
                        <strong>{functionalGroups.length}</strong>
                        <p>
                          {functionalGroups.length > 0
                            ? functionalGroups.map((group) => group.name).join(", ")
                            : "No groups loaded yet."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="analysis-section compact-section">
                    <p className="label">Acidity Estimate</p>
                    {acidityResults.length === 0 ? (
                      <p className="empty">No acidic sites estimated yet.</p>
                    ) : (
                      <div className="group-list compact-group-list">
                        {acidityResults.map((result, index) => (
                          <div className="group-card" key={`${result.relatedGroup}-${result.acidicSite}-${index}`}>
                            <div className="group-card-header">
                              <h3>{index === 0 ? "Strongest acidic site" : "Weaker acidic site"}: {result.acidicSite}</h3>
                              <span>pKa {result.estimatedPka}</span>
                            </div>
                            <p><strong>Related group:</strong> {result.relatedGroup}</p>
                            <p><strong>Detected atom:</strong> Atom {result.siteAtomIndex + 1} · {result.confidence.toLowerCase()} confidence</p>
                            <p><strong>Typical pKa range:</strong> {formatPkaRange(result.estimatedPkaRange)}</p>
                            <p><strong>A — Atom:</strong> {result.atom}</p>
                            <p><strong>R — Resonance:</strong> {result.resonance}</p>
                            <p><strong>I — Induction:</strong> {result.induction}</p>
                            <p><strong>O — Orbital:</strong> {result.orbital}</p>
                            <p>{result.explanation}</p>
                            {result.modifiers.length > 0 && (
                              <p><strong>pKa modifier:</strong> {result.modifiers.join(" ")}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="analysis-section compact-section">
                    <p className="label">Basicity Estimate</p>
                    {basicityResults.length === 0 ? (
                      <p className="empty">No basic sites estimated yet.</p>
                    ) : (
                      <div className="group-list compact-group-list">
                        {basicityResults.map((result, index) => (
                          <div className="group-card" key={`${result.relatedGroup}-${result.basicSite}-${index}`}>
                            <div className="group-card-header">
                              <h3>{index === 0 ? "Strongest basic site" : "Weaker basic site"}: {result.basicSite}</h3>
                              <span>conj. acid pKa {result.conjugateAcidPka}</span>
                            </div>
                            <p><strong>Related group:</strong> {result.relatedGroup}</p>
                            <p><strong>Detected atom:</strong> Atom {result.siteAtomIndex + 1} · {result.confidence.toLowerCase()} confidence</p>
                            <p><strong>Typical conjugate-acid pKa range:</strong> {formatPkaRange(result.conjugateAcidPkaRange)}</p>
                            <p>{result.explanation}</p>
                            {result.modifiers.length > 0 && (
                              <p><strong>Basicity modifier:</strong> {result.modifiers.join(" ")}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {analysisPanel === "concepts" && (
                <div className="dashboard-panel">
                  <div className="analysis-section compact-section">
                    <p className="label">Concept View</p>

                    <div className="concept-button-row compact-concept-grid">
                      {CONCEPT_OPTIONS.map((concept) => (
                        <button
                          aria-pressed={selectedConcept === concept.id}
                          key={concept.id}
                          className={
                            selectedConcept === concept.id
                              ? "concept-button active"
                              : "concept-button"
                          }
                          onClick={() => {
                            setSelectedConcept(concept.id);
                            setSelectedAtomIndex(null);
                            setSelectedBondIndex(null);
                          }}
                          type="button"
                        >
                          {concept.label}
                        </button>
                      ))}
                    </div>

                    {selectedConcept === "hybridization" && (
                      <div className="concept-subfilter-row">
                        {(["all", "sp", "sp2", "sp3"] as const).map(
                          (hybridization) => (
                            <button
                              aria-pressed={selectedHybridization === hybridization}
                              key={hybridization}
                              className={
                                selectedHybridization === hybridization
                                  ? "concept-subfilter-button active"
                                  : "concept-subfilter-button"
                              }
                              onClick={() =>
                                setSelectedHybridization(hybridization)
                              }
                              type="button"
                            >
                              {hybridization === "all" ? "All" : hybridization}
                            </button>
                          )
                        )}
                      </div>
                    )}

                    {selectedConcept === "bondOrbitals" && (
                      <div className="concept-subfilter-row">
                        {(["all", "single", "double", "triple"] as const).map(
                          (bondType) => (
                            <button
                              aria-pressed={selectedBondType === bondType}
                              key={bondType}
                              className={
                                selectedBondType === bondType
                                  ? "concept-subfilter-button active"
                                  : "concept-subfilter-button"
                              }
                              onClick={() => setSelectedBondType(bondType)}
                              type="button"
                            >
                              {bondType === "all" ? "All" : bondType}
                            </button>
                          )
                        )}
                      </div>
                    )}

                    {highlightedMoleculeSvg && (
                      <div className="highlight-preview-wrapper">
                        <p className="annotation-summary">
                          Highlighted molecule preview:
                        </p>

                        <div className="highlight-preview">
                          <div
                            ref={highlightedSvgRef}
                            className="highlighted-molecule-svg"
                            dangerouslySetInnerHTML={{
                              __html: highlightedMoleculeSvg,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {!moleculeAnnotation ? (
                      <p className="empty">
                        Analyze a molecule to see concept annotations.
                      </p>
                    ) : (
                      <div className="annotation-list">
                        {selectedConcept === "hybridization" && (
                          <p className="annotation-summary">
                            Showing {" "}
                            {selectedHybridization === "all"
                              ? "all hybridized atoms"
                              : `${selectedHybridization} atoms`}
                            .
                          </p>
                        )}

                        {selectedConcept === "bondOrbitals" && (
                          <p className="annotation-summary">
                            Showing {" "}
                            {selectedBondType === "all"
                              ? "all bond orbital overlaps"
                              : `${selectedBondType} bond orbital overlaps`}
                            .
                          </p>
                        )}

                        {selectedConcept === "resonance" && (
                          <p className="annotation-summary">
                            Showing atoms or bonds that can participate in resonance, conjugation, or
                            electron delocalization.
                          </p>
                        )}

                        {selectedConcept === "chirality" && (
                          <p className="annotation-summary">
                            Showing possible chiral centers. Specific R/S
                            assignment requires wedge/dash stereochemistry.
                          </p>
                        )}

                        {annotationCarouselItems.length === 0 ? (
                          <p className="empty">
                            No annotations found for this concept yet.
                          </p>
                        ) : (
                          <div className="annotation-carousel compact-carousel">
                            <button
                              className="carousel-arrow"
                              type="button"
                              onClick={goToPreviousAnnotationCard}
                              disabled={annotationCarouselItems.length <= 1}
                              aria-label="Previous annotation"
                            >
                              ‹
                            </button>

                            <div className="annotation-carousel-card">
                              <p className="annotation-counter">
                                Card {annotationCardIndex + 1} of {" "}
                                {annotationCarouselItems.length}
                              </p>

                              {renderCurrentAnnotationCard()}
                            </div>

                            <button
                              className="carousel-arrow"
                              type="button"
                              onClick={goToNextAnnotationCard}
                              disabled={annotationCarouselItems.length <= 1}
                              aria-label="Next annotation"
                            >
                              ›
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {analysisPanel === "properties" && (
                <div className="dashboard-panel">
                  {moleculeIdentity ? (
                    <PropertiesDetail groups={propertyGroups} identity={moleculeIdentity} info={PROPERTY_INFO} smiles={smiles} stereocenters={propertyStereocenters} />
                  ) : (
                    <p className="empty">Analyze a molecule to estimate its name, formula, DBE, and molecular properties.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section
          aria-labelledby={`page-tab-${activePage}`}
          className="page-panel"
          id={`page-panel-${activePage}`}
          role="tabpanel"
        >
          <Suspense fallback={<div className="card page-loading" role="status"><span className="loading-spinner" aria-hidden="true" />Loading tool…</div>}>
            {activePage === "acidBase" ? (
              <AcidBasePage
                openRequest={pendingOpen?.page === "acidBase" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : activePage === "reactions" ? (
              <ReactionsPage
                initialPathways={reactionPathways}
                initialReactantMolfile={molfile}
                handoffId={reactionPathways.length > 0 || molfile ? (resultMeta?.computedAt ?? `unsaved:${smiles}`) : null}
                handoffLabel={moleculeIdentity?.nomenclature.displayName || moleculeIdentity?.nomenclature.estimatedName || null}
                handoffSmiles={sanitizeDisplayedSmiles(smiles) || null}
                openRequest={pendingOpen?.page === "reactions" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : activePage === "spectroscopy" ? (
              <SpectroscopyPage
                openRequest={pendingOpen?.page === "spectroscopy" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : activePage === "multiStep" ? (
              <SynthesisPage
                openRequest={pendingOpen?.page === "multiStep" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            ) : activePage === "conformations" ? (
              <ConformationsPage
                openRequest={pendingOpen?.page === "conformations" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
                handoffSmiles={sanitizeDisplayedSmiles(smiles) || null}
                handoffMolfile={molfile || null}
              />
            ) : activePage === "saved" ? (
              <SavedAnalysesPage onOpen={openSavedAnalysis} />
            ) : (
              <MultiCatalyticPage
                openRequest={pendingOpen?.page === "multiCatalytic" ? pendingOpen : null}
                onOpenHandled={(requestId) => setPendingOpen((current) => (current?.id === requestId ? null : current))}
              />
            )}
          </Suspense>
        </section>
      )}
    </div>
    </main>
    <ConceptSearch initialQuery={searchState.query} onClose={closeSearch} onOpenDestination={openDestination} onOpenSaved={(analysis) => openSavedAnalysis(analysis)} open={searchState.open} />
    </NavigationContext.Provider>
  );
}

export default App;