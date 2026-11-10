import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import WorkspaceNotice, { type WorkspaceNoticeItem } from "./WorkspaceNotice";
import { ReplaceWorkspacePrompt, SaveAnalysisForm } from "./SavedAnalysisControls";
import { ChairDrawing, EnergyGraph, NewmanDrawing, SawhorseDrawing, StructureMap } from "./conformations/views";
import { easeInOut, morphConformer, prefersReducedMotion } from "./conformations/morph";
import { Badge, Callout, DiagramFrame, Disclosure, EmptyState, EvidenceBadge, Explanation, Legend, Panel } from "./ui/primitives";
import { LearningModeSwitch } from "./ui/LearningModeSwitch";
import { Icon } from "./ui/Icon";
import "../styles/conformations.css";
import { getRDKit } from "../utils/rdkit";
import { readKetcherStructureSnapshot } from "../utils/ketcherSnapshot";
import { buildConformationGraph, type ConformationGraph, type RdKitLike } from "../utils/conformations/graph";
import {
  analyzeChairs,
  buildChairModel,
  buildConformer,
  describeChairAvailability,
  findChairCandidates,
  type ChairAnalysis,
  type ChairConformer,
  type ChairModel,
  type FaceChoices,
} from "../utils/conformations/chair";
import {
  checkRotatableBond,
  classify,
  conformationAt,
  dihedralBetween,
  ENERGY_MODEL,
  energyProfile,
  listRotatableBonds,
  newmanDiagram,
  newmanToSawhorse,
  qualitativeAssessment,
  reverseView,
  setupTorsion,
  strainEnergyKJ,
  TORSION_ENGINE_VERSION,
  type TorsionSetup,
} from "../utils/conformations/torsion";
import { chairNotes, chairQuestions, torsionNotes, torsionQuestions, type Question } from "../utils/conformations/guide";
import { wrap180, wrap360 } from "../utils/conformations/geometry";
import { A_VALUE_TABLE } from "../utils/conformations/substituents";
import { useWorkspacePersistence } from "../utils/persistence/useWorkspacePersistence";
import { useSavedAnalysisOpen } from "../utils/persistence/useSavedAnalysisOpen";
import { getAppAnalysisLibrary } from "../utils/persistence/analysisLibraryApp";
import type { OpenedAnalysis } from "../utils/persistence/analysisLibrary";
import type { Capture, RecoveryOutcome } from "../utils/persistence/workspacePersistence";
import {
  CONFORMATIONS_ENGINE_VERSION,
  describeConformationsAnalysis,
  validateConformationsInputs,
  validateConformationsResults,
  type ChairSummary,
  type ConformationsMode,
  type ConformationsWorkspaceInputs,
  type ConformationsWorkspaceResults,
  type TorsionSummary,
} from "../utils/persistence/conformationsWorkspace";

type Props = {
  openRequest?: { id: string; recordId: string } | null;
  onOpenHandled?: (requestId: string) => void;
  /** SMILES / molfile of the molecule currently analysed on the Properties page, if any. */
  handoffSmiles?: string | null;
  handoffMolfile?: string | null;
};

const EXAMPLES: Array<{ label: string; smiles: string; mode: ConformationsMode }> = [
  { label: "Butane", smiles: "CCCC", mode: "newman" },
  { label: "Methylcyclohexane", smiles: "CC1CCCCC1", mode: "chair" },
  { label: "tert-Butylcyclohexane", smiles: "CC(C)(C)C1CCCCC1", mode: "chair" },
  { label: "trans-1,4-Dimethyl", smiles: "C[C@H]1CC[C@H](C)CC1", mode: "chair" },
  { label: "cis-1,3-Dimethyl", smiles: "C[C@H]1CCC[C@@H](C)C1", mode: "chair" },
  { label: "(2R,3R)-2,3-Dibromobutane", smiles: "C[C@@H](Br)[C@H](Br)C", mode: "newman" },
];

const EMPTY_STATE: ConformationsWorkspaceInputs = {
  source: null,
  mode: "chair",
  chair: { ring: null, flipped: false, choices: {} },
  torsion: { front: null, rear: null, frontRef: null, rearRef: null, rotation: 180 },
};

const rdkitOf = (module: unknown) => module as RdKitLike;
const fmt = (value: number, digits = 1) => value.toFixed(digits);
const KJ_PER_KCAL = 4.184;

/** Chooses a sensible initial ring and bond for a freshly loaded molecule. Nothing here is stereochemistry. */
function defaultsFor(graph: ConformationGraph): Pick<ConformationsWorkspaceInputs, "chair" | "torsion"> & { hasRing: boolean; hasBond: boolean } {
  const ring = findChairCandidates(graph).find((item) => item.eligible)?.ring ?? null;
  const bonds = listRotatableBonds(graph).filter((item) => item.check.ok);
  const internal = bonds.find((item) => graph.atoms[item.bond.a].neighbors.length > 1 && graph.atoms[item.bond.b].neighbors.length > 1);
  const pick = internal ?? bonds[0];
  return {
    chair: { ring, flipped: false, choices: {} },
    torsion: { front: pick?.bond.a ?? null, rear: pick?.bond.b ?? null, frontRef: null, rearRef: null, rotation: 180 },
    hasRing: ring !== null,
    hasBond: pick !== undefined,
  };
}

type Saved = {
  results: ConformationsWorkspaceResults;
  origin: "restored" | "opened";
  name?: string;
  savedAt?: string;
  computedAt: string;
  engineMismatch: boolean;
};

export default function ConformationsPage({ openRequest = null, onOpenHandled, handoffSmiles = null, handoffMolfile = null }: Props) {
  const [rdkit, setRdkit] = useState<RdKitLike | null>(null);
  const [state, setStateRaw] = useState<ConformationsWorkspaceInputs>(EMPTY_STATE);
  const [history, setHistory] = useState<ConformationsWorkspaceInputs[]>([]);
  const lastPush = useRef<{ key: string; at: number } | null>(null);
  const [smilesText, setSmilesText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ketcher, setKetcher] = useState<KetcherApi | null>(null);
  const [showHydrogens, setShowHydrogens] = useState(true);
  const [showDiaxial, setShowDiaxial] = useState(true);
  const [showIndices, setShowIndices] = useState(false);
  const [practice, setPractice] = useState(false);
  const [morph, setMorph] = useState<{ from: ChairConformer; to: ChairConformer; t: number } | null>(null);
  const morphFrame = useRef<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, { choice: number | null; revealed: boolean }>>({});
  const [notices, setNotices] = useState<WorkspaceNoticeItem[]>([]);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [saveForm, setSaveForm] = useState<{ name: string } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<WorkspaceNoticeItem | null>(null);
  const appliedRecoveryRef = useRef<unknown>(null);
  const requestPersistRef = useRef<() => void>(() => undefined);
  const latestRef = useRef({ state, saved });

  useEffect(() => {
    let active = true;
    void getRDKit().then((module) => {
      if (active) setRdkit(rdkitOf(module));
    });
    return () => {
      active = false;
    };
  }, []);

  /** Updates the view state. Changes with the same `coalesceKey` made close together are one undo step. */
  const setState = useCallback((next: ConformationsWorkspaceInputs | ((current: ConformationsWorkspaceInputs) => ConformationsWorkspaceInputs), coalesceKey?: string) => {
    setStateRaw((current) => {
      const value = typeof next === "function" ? next(current) : next;
      const now = Date.now();
      const last = lastPush.current;
      if (!(coalesceKey && last && last.key === coalesceKey && now - last.at < 900)) {
        setHistory((items) => [...items.slice(-39), current]);
      }
      lastPush.current = { key: coalesceKey ?? `#${now}`, at: now };
      return value;
    });
  }, []);

  // ---- derived chemistry ----------------------------------------------------------------------
  const graphResult = useMemo(
    () => (rdkit && state.source ? buildConformationGraph(rdkit, state.source.text) : null),
    [rdkit, state.source],
  );
  const graph = graphResult?.ok ? graphResult.graph : null;

  const candidates = useMemo(() => (graph ? findChairCandidates(graph) : []), [graph]);
  const eligibleRings = candidates.filter((item) => item.eligible);
  const activeRing = useMemo(() => {
    const wanted = state.chair.ring;
    const match = wanted ? eligibleRings.find((item) => item.ring.length === wanted.length && item.ring.every((atom) => wanted.includes(atom))) : null;
    return (match ?? eligibleRings[0])?.ring ?? null;
  }, [eligibleRings, state.chair.ring]);

  const faceChoices: FaceChoices = useMemo(() => {
    const out: FaceChoices = {};
    for (const [key, value] of Object.entries(state.chair.choices)) out[Number(key)] = value;
    return out;
  }, [state.chair.choices]);

  const chairModel: ChairModel | null = useMemo(
    () => (rdkit && graph && activeRing ? buildChairModel(rdkit, graph, activeRing, faceChoices) : null),
    [rdkit, graph, activeRing, faceChoices],
  );
  const chairAnalysis: ChairAnalysis | null = useMemo(() => (chairModel && chairModel.status === "ready" ? analyzeChairs(chairModel) : null), [chairModel]);

  const rotatable = useMemo(() => {
    const map = new Map<number, string | null>();
    if (graph) for (const item of listRotatableBonds(graph)) map.set(item.bond.index, item.check.ok ? null : item.check.reason);
    return map;
  }, [graph]);

  const bondCheck = graph && state.torsion.front !== null && state.torsion.rear !== null ? checkRotatableBond(graph, state.torsion.front, state.torsion.rear) : null;
  const setup: TorsionSetup | null = useMemo(
    () =>
      graph && bondCheck?.ok && state.torsion.front !== null && state.torsion.rear !== null
        ? setupTorsion(graph, state.torsion.front, state.torsion.rear, { frontRef: state.torsion.frontRef ?? undefined, rearRef: state.torsion.rearRef ?? undefined })
        : null,
    [graph, bondCheck, state.torsion.front, state.torsion.rear, state.torsion.frontRef, state.torsion.rearRef],
  );
  const profile = useMemo(() => (graph && setup ? energyProfile(graph, setup, 2) : null), [graph, setup]);
  const rotation = state.torsion.rotation;
  const cls = graph && setup ? classify(graph, setup, rotation) : null;
  const energyAbs = graph && setup ? strainEnergyKJ(graph, setup, rotation) : null;
  const energyRel = energyAbs !== null && profile?.supported ? energyAbs - profile.baselineKJ : null;
  const qualitative = graph && setup ? qualitativeAssessment(graph, setup, rotation) : null;
  const newman = useMemo(() => (graph && setup ? newmanDiagram(graph, setup, rotation) : null), [graph, setup, rotation]);
  const sawhorse = useMemo(() => (newman ? newmanToSawhorse(newman) : null), [newman]);

  // ---- loading a molecule ---------------------------------------------------------------------
  function loadSource(kind: "smiles" | "molfile", text: string, preferredMode?: ConformationsMode, announce = true): boolean {
    if (!rdkit) {
      setError("The chemistry engine is still loading. Try again in a moment.");
      return false;
    }
    const built = buildConformationGraph(rdkit, text);
    if (!built.ok) {
      setError(built.message);
      return false;
    }
    const defaults = defaultsFor(built.graph);
    const mode: ConformationsMode = preferredMode ?? (defaults.hasRing ? "chair" : defaults.hasBond ? "newman" : "chair");
    setError(null);
    setSaved(null);
    setAnswers({});
    setState({ source: { kind, text }, mode, chair: defaults.chair, torsion: defaults.torsion });
    if (announce) setNotices([]);
    return true;
  }

  async function analyseDrawnStructure() {
    if (!ketcher) {
      setError("The structure editor is still loading.");
      return;
    }
    try {
      const snapshot = await readKetcherStructureSnapshot(ketcher);
      if (!snapshot) {
        setError("Draw a molecule first.");
        return;
      }
      if (snapshot.componentMolfiles.length !== 1 || !snapshot.molfile) {
        setError("Draw one connected molecule: the editor holds several separate structures.");
        return;
      }
      loadSource("molfile", snapshot.molfile);
      setSmilesText("");
    } catch {
      setError("The drawn structure could not be read.");
    }
  }

  function applySmilesField() {
    const text = smilesText.trim();
    if (!text) {
      setError("Enter a SMILES string, or draw a molecule and use it.");
      return;
    }
    loadSource("smiles", text);
  }

  // ---- state mutations ------------------------------------------------------------------------
  const setMode = (mode: ConformationsMode) => setState((current) => ({ ...current, mode }));
  const commitFlip = () => setState((current) => ({ ...current, chair: { ...current.chair, flipped: !current.chair.flipped } }));
  // The flip itself is instant state (shared with undo, save and the stability panel); the animation only
  // eases between the two computed chairs and is skipped for people who prefer reduced motion.
  const flipChair = () => {
    if (morph) return;
    if (!chairModel || !chairAnalysis || prefersReducedMotion()) {
      commitFlip();
      return;
    }
    const from = buildConformer(chairModel, state.chair.flipped);
    const to = buildConformer(chairModel, !state.chair.flipped);
    const started = performance.now();
    const duration = 560;
    const step = (now: number) => {
      const raw = Math.min(1, (now - started) / duration);
      if (raw >= 1) {
        morphFrame.current = null;
        setMorph(null);
        commitFlip();
        return;
      }
      setMorph({ from, to, t: easeInOut(raw) });
      morphFrame.current = requestAnimationFrame(step);
    };
    setMorph({ from, to, t: 0 });
    morphFrame.current = requestAnimationFrame(step);
  };
  useEffect(() => () => { if (morphFrame.current !== null) cancelAnimationFrame(morphFrame.current); }, []);
  const setRotation = (value: number, coalesce = "rotate") => setState((current) => ({ ...current, torsion: { ...current.torsion, rotation: wrap180(value) } }), coalesce);
  const chooseBond = (a: number, b: number) => setState((current) => ({ ...current, torsion: { ...current.torsion, front: a, rear: b, frontRef: null, rearRef: null } }));
  const chooseRing = (ring: number[]) => setState((current) => ({ ...current, chair: { ring, flipped: false, choices: {} } }));
  const setFaceChoice = (atom: number, face: "up" | "down") =>
    setState((current) => ({ ...current, chair: { ...current.chair, choices: { ...current.chair.choices, [String(atom)]: face } } }));

  function viewFromOtherEnd() {
    if (!graph || !setup) return;
    const other = reverseView(graph, setup);
    setState((current) => ({
      ...current,
      torsion: { ...current.torsion, front: other.front.atom, rear: other.rear.atom, frontRef: other.frontRef, rearRef: other.rearRef },
    }));
  }

  function pickReference(end: "front" | "rear", atom: number) {
    if (!setup) return;
    const currentRef = end === "front" ? setup.frontRef : setup.rearRef;
    if (atom === currentRef) return;
    // Keep the conformation the same: the new rotation is the dihedral between the new references in the present arrangement.
    const conf = conformationAt(setup, rotation);
    const frontRef = end === "front" ? atom : setup.frontRef;
    const rearRef = end === "rear" ? atom : setup.rearRef;
    const f = conf.front.find((item) => item.atom === frontRef);
    const r = conf.rear.find((item) => item.atom === rearRef);
    if (!f || !r) return;
    setState((current) => ({ ...current, torsion: { ...current.torsion, frontRef, rearRef, rotation: wrap180(r.angle - f.angle) } }));
  }

  function snapTo(kind: "staggered" | "eclipsed") {
    const phase = kind === "staggered" ? 60 : 0;
    const base = Math.round((rotation - phase) / 120) * 120 + phase;
    setRotation(base, "snap");
  }

  const undo = () =>
    setHistory((items) => {
      if (items.length === 0) return items;
      const previous = items[items.length - 1];
      setStateRaw(previous);
      lastPush.current = null;
      return items.slice(0, -1);
    });

  function reset() {
    if (!graph || !state.source) return;
    const defaults = defaultsFor(graph);
    setState((current) => ({ ...current, chair: defaults.chair, torsion: defaults.torsion }));
    setAnswers({});
  }

  // ---- assessment summaries (persisted / compared) --------------------------------------------
  const chairSummary: ChairSummary | null = useMemo(() => {
    if (!chairModel || !activeRing) return null;
    const a = chairAnalysis;
    const pref = a?.preference;
    return {
      ring: activeRing,
      status: chairModel.status,
      preferenceKind: pref?.kind ?? "unassessed",
      preferred: pref?.kind === "quantified" ? pref.preferred : null,
      deltaKcal: pref?.kind === "quantified" ? Number(pref.deltaKcal.toFixed(3)) : null,
      strainAKcal: a?.A.strainKcal ?? null,
      strainBKcal: a?.B.strainKcal ?? null,
      axialA: a?.A.axialGroups.map((g) => g.label) ?? [],
      axialB: a?.B.axialGroups.map((g) => g.label) ?? [],
      showing: state.chair.flipped ? "Chair B" : "Chair A",
    };
  }, [chairModel, chairAnalysis, activeRing, state.chair.flipped]);

  const torsionSummary: TorsionSummary | null = useMemo(() => {
    if (!setup || !cls) return null;
    return {
      front: setup.front.atom,
      rear: setup.rear.atom,
      rotation: Number(wrap180(rotation).toFixed(2)),
      kind: cls.kind,
      name: cls.name,
      energyKJ: energyAbs === null ? null : Number(energyAbs.toFixed(3)),
      relativeKJ: energyRel === null ? null : Number(energyRel.toFixed(3)),
      quantified: energyAbs !== null,
    };
  }, [setup, cls, rotation, energyAbs, energyRel]);

  const limits = useMemo(() => {
    const out: string[] = [];
    if (state.mode === "chair") {
      out.push("Approximate additive A-value model; not a quantum-mechanical or experimentally validated energy.");
      if (chairAnalysis) out.push(...chairAnalysis.notIncluded);
    } else {
      out.push(ENERGY_MODEL.description);
    }
    return out;
  }, [state.mode, chairAnalysis]);

  const liveResults: ConformationsWorkspaceResults | null = useMemo(() => {
    if (!graph) return null;
    const useChair = state.mode === "chair";
    const chair = useChair ? chairSummary : null;
    const torsion = useChair ? null : torsionSummary;
    if (!chair && !torsion) return null;
    return { smiles: graph.smiles, mode: state.mode, engineVersion: CONFORMATIONS_ENGINE_VERSION, chair, torsion, limits };
  }, [graph, state.mode, chairSummary, torsionSummary, limits]);

  // ---- persistence ----------------------------------------------------------------------------
  const { controller: persistence, recovery, status: persistenceStatus } = useWorkspacePersistence<ConformationsWorkspaceInputs, ConformationsWorkspaceResults>({
    page: "conformations",
    engineVersion: CONFORMATIONS_ENGINE_VERSION,
    validateInputs: validateConformationsInputs,
    validateResults: validateConformationsResults,
  });
  const liveResultsRef = useRef(liveResults);

  function captureWorkspace(): Capture<ConformationsWorkspaceInputs, ConformationsWorkspaceResults> | null {
    const { state: current } = latestRef.current;
    if (!current.source) return null;
    const results = liveResultsRef.current;
    return {
      inputs: current,
      results: results
        ? { computedAt: new Date().toISOString(), engineVersion: CONFORMATIONS_ENGINE_VERSION, stale: false, status: "complete", data: results }
        : null,
    };
  }

  useEffect(() => {
    latestRef.current = { state, saved };
    liveResultsRef.current = liveResults;
    requestPersistRef.current = () => persistence.requestSave(captureWorkspace);
  });
  useEffect(() => {
    requestPersistRef.current();
  }, [state, liveResults]);

  /** Applies saved inputs (from recovery or a saved analysis) if they still make sense for the molecule. */
  const applyInputs = useCallback(
    (inputs: ConformationsWorkspaceInputs): boolean => {
      if (!rdkit) return false;
      if (!inputs.source) {
        setStateRaw(EMPTY_STATE);
        return true;
      }
      const built = buildConformationGraph(rdkit, inputs.source.text);
      if (!built.ok) {
        setNotices((items) => [...items, { tone: "warn", text: `The saved structure could not be read (${built.message}).` }]);
        return false;
      }
      const defaults = defaultsFor(built.graph);
      const g = built.graph;
      const ringOk = inputs.chair.ring !== null && findChairCandidates(g).some((c) => c.eligible && inputs.chair.ring!.every((atom) => c.ring.includes(atom)));
      const bondOk = inputs.torsion.front !== null && inputs.torsion.rear !== null && checkRotatableBond(g, inputs.torsion.front, inputs.torsion.rear).ok;
      const next: ConformationsWorkspaceInputs = {
        source: inputs.source,
        mode: inputs.mode,
        chair: ringOk ? inputs.chair : defaults.chair,
        torsion: bondOk ? inputs.torsion : defaults.torsion,
      };
      if (!ringOk || !bondOk) {
        setNotices((items) => [...items, { tone: "warn", text: "Part of the saved selection (ring or bond) no longer matches the structure and was reset to a default; the molecule itself is unchanged." }]);
      }
      setStateRaw(next);
      setHistory([]);
      lastPush.current = null;
      return true;
    },
    [rdkit],
  );

  useEffect(() => {
    if (!recovery || !rdkit || appliedRecoveryRef.current === recovery) return;
    appliedRecoveryRef.current = recovery;
    try {
      const outcome = recovery as RecoveryOutcome<ConformationsWorkspaceInputs, ConformationsWorkspaceResults>;
      if (outcome.kind === "rejected") {
        setNotices([{ tone: "warn", text: `Saved work from a previous session could not be used (${outcome.message}). It was set aside and the page started clean.` }]);
      } else if (outcome.kind === "restored" && persistence.isCurrent(outcome.epoch)) {
        if (latestRef.current.state.source) {
          setNotices([{ tone: "info", text: "Saved work from a previous session was not restored because you had already started new work on this page." }]);
        } else if (applyInputs(outcome.inputs)) {
          if (outcome.results) {
            setSaved({ results: outcome.results.data, origin: "restored", computedAt: outcome.results.computedAt, engineMismatch: outcome.engineMismatch });
          }
          setNotices((items) => [...items, { tone: "info", text: "Restored your molecule and view from your previous session. The structure editor itself is not restored; draw again or use the SMILES field to replace the molecule." }]);
        }
      }
    } finally {
      persistence.resumeAfterRestore();
    }
  }, [recovery, rdkit, persistence, applyInputs]);

  // ---- saved analyses -------------------------------------------------------------------------
  const defaultAnalysisName = () => `Conformations of ${graph?.smiles ?? "molecule"}`.slice(0, 100);

  async function saveCurrentAnalysis(name: string, announce = true): Promise<boolean> {
    setSaveBusy(true);
    try {
      const capture = captureWorkspace();
      if (!capture || !capture.results) {
        setSaveMessage({ tone: "warn", text: "Load a molecule with a valid view before saving an analysis." });
        return false;
      }
      const result = await getAppAnalysisLibrary().save("conformations", {
        name,
        summary: describeConformationsAnalysis(capture.results.data),
        inputs: capture.inputs,
        results: capture.results,
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

  async function applySavedAnalysis(opened: OpenedAnalysis<ConformationsWorkspaceInputs, ConformationsWorkspaceResults>): Promise<boolean> {
    if (!applyInputs(opened.inputs)) return false;
    setSmilesText("");
    setError(null);
    setAnswers({});
    setNotices(opened.resultsDropped ? [{ tone: "warn", text: "The saved assessment could not be validated and was not opened. The molecule and view were." }] : []);
    setSaved(
      opened.results
        ? { results: opened.results.data, origin: "opened", name: opened.record.name, savedAt: opened.record.updatedAt, computedAt: opened.results.computedAt, engineMismatch: opened.engineMismatch }
        : null,
    );
    return true;
  }

  const savedOpen = useSavedAnalysisOpen<ConformationsWorkspaceInputs, ConformationsWorkspaceResults>({
    page: "conformations",
    openRequest,
    onOpenHandled,
    ready: recovery !== null && rdkit !== null,
    busyReason: () => null,
    hasUnsavedWork: () => latestRef.current.state.source !== null,
    canSaveCurrent: () => Boolean(liveResultsRef.current),
    saveCurrent: (name) => saveCurrentAnalysis(name, false),
    defaultName: defaultAnalysisName,
    apply: applySavedAnalysis,
    notify: (item) => setNotices((items) => [...items, item]),
  });

  // ---- practice -------------------------------------------------------------------------------
  const signature = `${state.mode}|${state.chair.flipped}|${Math.round(rotation)}|${state.torsion.front}-${state.torsion.rear}|${graph?.smiles ?? ""}`;
  const questions: Question[] = useMemo(() => {
    if (!practice || !graph) return [];
    if (state.mode === "chair") return chairModel && chairAnalysis ? chairQuestions(chairModel, chairAnalysis, state.chair.flipped) : [];
    return setup ? torsionQuestions(graph, setup, rotation) : [];
  }, [practice, graph, state.mode, chairModel, chairAnalysis, state.chair.flipped, setup, rotation]);

  // ---- rendering ------------------------------------------------------------------------------
  const guideNotes = useMemo(() => {
    if (!graph) return [];
    if (state.mode === "chair") return chairModel && chairAnalysis ? chairNotes(chairModel, chairAnalysis, state.chair.flipped) : [];
    return setup ? torsionNotes(graph, setup, rotation) : [];
  }, [graph, state.mode, chairModel, chairAnalysis, state.chair.flipped, setup, rotation]);

  const workspaceNotices: WorkspaceNoticeItem[] = [...notices];
  if (saveMessage) workspaceNotices.push(saveMessage);
  if (!persistenceStatus.available) workspaceNotices.push({ tone: "warn", text: "Browser storage is unavailable, so your work on this page will not be saved." });
  if (persistenceStatus.saveError) workspaceNotices.push({ tone: "warn", text: `Your latest changes could not be saved (${persistenceStatus.saveError.message}).` });

  const torsionView = state.mode === "newman" || state.mode === "sawhorse";
  const hideAnswers = practice;
  const correctCount = questions.filter((question) => { const entry = answers[`${question.id}|${signature}`]; return entry?.revealed && entry.choice === question.correct; }).length;

  return (
    <div className="conf-page">
      <section className="card conf-input-card">
        <div className="card-header">
          <div>
            <h2>Conformations</h2>
            <p>Chair flips, Newman projections and sawhorse projections built from the same molecular graph. Draw a molecule or enter a SMILES string.</p>
          </div>
          <span className={`status ${rdkit ? "ready" : "loading"}`}>{rdkit ? "Engine ready" : "Loading engine"}</span>
        </div>
        <div className="conf-input-grid">
          <div className="drawer-placeholder conf-drawer">
            <MoleculeDrawer onReady={setKetcher} globalKey="conformationsKetcher" onNameSubmitProcess={analyseDrawnStructure} />
          </div>
          <div className="conf-input-side">
            <div className="button-row">
              <button className="primary-button" type="button" onClick={() => void analyseDrawnStructure()} disabled={!ketcher || !rdkit}>Analyse drawn structure</button>
              {(handoffMolfile || handoffSmiles) && (
                <button className="secondary-button" type="button" disabled={!rdkit} onClick={() => { loadSource(handoffMolfile ? "molfile" : "smiles", (handoffMolfile || handoffSmiles) as string); }}>
                  Use the Properties molecule
                </button>
              )}
            </div>
            <form className="conf-smiles" onSubmit={(event) => { event.preventDefault(); applySmilesField(); }}>
              <label>
                SMILES (stereochemistry is used exactly as written)
                <input type="text" value={smilesText} placeholder="e.g. C[C@H]1CC[C@H](C)CC1" onChange={(event) => setSmilesText(event.target.value)} spellCheck={false} />
              </label>
              <button className="secondary-button" type="submit" disabled={!rdkit}>Load</button>
            </form>
            <div className="conf-examples" role="group" aria-label="Example molecules">
              {EXAMPLES.map((example) => (
                <button key={example.label} className="secondary-button conf-chip" type="button" disabled={!rdkit} onClick={() => { setSmilesText(example.smiles); loadSource("smiles", example.smiles, example.mode); }}>
                  {example.label}
                </button>
              ))}
            </div>
            {error && <p className="conf-error" role="alert">{error}</p>}
          </div>
        </div>
      </section>

      <WorkspaceNotice notices={workspaceNotices} />
      {savedOpen.prompt && (
        <ReplaceWorkspacePrompt
          name={savedOpen.prompt.opened.record.name}
          canSaveFirst={Boolean(liveResults)}
          busy={savedOpen.saveBusy}
          onChoose={(choice) => void savedOpen.resolve(choice)}
        />
      )}

      {!graph ? (
        <EmptyState icon="conformations" title="No molecule loaded yet">
          {graphResult && !graphResult.ok ? graphResult.message : "Load a molecule above to analyse its conformations. Try an example, or draw a cyclohexane or a chain such as butane."}
        </EmptyState>
      ) : (
        <section className="conf-main" aria-label="Conformational analysis">
          <div className="conf-toolbar">
            <div className="conf-tabs" role="tablist" aria-label="Projection type">
              {([["chair", "Chair"], ["newman", "Newman"], ["sawhorse", "Sawhorse"]] as Array<[ConformationsMode, string]>).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={state.mode === id} className={state.mode === id ? "conf-tab active" : "conf-tab"} type="button" onClick={() => setMode(id)}>{label}</button>
              ))}
            </div>
            <LearningModeSwitch
              mode={practice ? "practice" : "explore"}
              onChange={(next) => { setPractice(next === "practice"); setAnswers({}); }}
            />
            <div className="conf-toolbar-actions">
              <button className="ghost-button" type="button" onClick={undo} disabled={history.length === 0}>Undo</button>
              <button className="ghost-button" type="button" onClick={reset}>Reset view</button>
              <button className="secondary-button" type="button" disabled={!liveResults} onClick={() => { setSaveMessage(null); setSaveForm({ name: defaultAnalysisName() }); }}>Save Analysis</button>
            </div>
          </div>
          {saveForm && (
            <SaveAnalysisForm
              name={saveForm.name}
              busy={saveBusy}
              onChange={(name) => setSaveForm({ name })}
              onCancel={() => setSaveForm(null)}
              onSubmit={() => { void saveCurrentAnalysis(saveForm.name).then((ok) => { if (ok) setSaveForm(null); }); }}
            />
          )}
          <p className="conf-molecule">
            <span>Molecule: <code>{graph.smiles}</code>{graph.coordsSource === "generated" ? "" : " · drawing coordinates from the editor"}</span>
            <EvidenceBadge level="model" />
          </p>

          {state.mode === "chair" && (
            <div className="conf-grid">
              <div className="conf-visual">
                {!activeRing ? (
                  <Callout tone="warn" title="No chair analysis for this molecule.">
                    <p>{describeChairAvailability(graph)}</p>
                  </Callout>
                ) : chairModel?.status === "needs-choice" ? (
                  <Callout tone="warn" title="The input does not say which substituents are on the same face of the ring.">
                    <p>PocketChem will not guess. Choose the arrangement below (or enter stereochemistry in the SMILES / draw wedge bonds) to see the chairs.</p>
                    {chairModel.unresolved.map((atom) => {
                      const slot = chairModel.slots.find((s) => s.ringAtom === atom && !s.isHydrogen);
                      const current = state.chair.choices[String(atom)];
                      return (
                        <div key={atom} className="conf-choice">
                          <span>Substituent on ring atom {atom}{slot?.identity ? ` (${slot.identity.label})` : ""}:</span>
                          {(["up", "down"] as const).map((face) => (
                            <button key={face} type="button" className={current === face ? "primary-button" : "secondary-button"} onClick={() => setFaceChoice(atom, face)}>{face}</button>
                          ))}
                        </div>
                      );
                    })}
                  </Callout>
                ) : chairModel && chairAnalysis ? (
                  <DiagramFrame
                    title={<span className="conf-view-title">{morph ? `${morph.from.label} → ${morph.to.label}` : state.chair.flipped ? "Chair B" : "Chair A"}</span>}
                    toolbar={
                      <button className="primary-button conf-flip" type="button" onClick={flipChair} disabled={morph !== null}>
                        <Icon name="flip" size={18} /> Flip chair
                      </button>
                    }
                    legend={hideAnswers ? undefined : <ChairLegend />}
                    caption={morph ? "Animating between the two computed chairs. The path between them is not modelled, so no axial or equatorial labels are drawn until it finishes." : undefined}
                    label="Cyclohexane chair"
                  >
                    <ChairDrawing
                      graph={graph}
                      model={chairModel}
                      conformer={morph ? morphConformer(morph.from, morph.to, morph.t) : buildConformer(chairModel, state.chair.flipped)}
                      showHydrogens={showHydrogens}
                      showDiaxial={showDiaxial && !morph}
                      hideLabels={hideAnswers || morph !== null}
                      showIndices={showIndices}
                    />
                  </DiagramFrame>
                ) : null}
                {chairModel && chairAnalysis && (
                  <div className="conf-controls" role="group" aria-label="Chair display options">
                    <label className="conf-toggle"><input type="checkbox" checked={showHydrogens} onChange={(e) => setShowHydrogens(e.target.checked)} /> Hydrogens</label>
                    <label className="conf-toggle"><input type="checkbox" checked={showDiaxial} onChange={(e) => setShowDiaxial(e.target.checked)} disabled={hideAnswers} /> 1,3-diaxial contacts</label>
                    <label className="conf-toggle"><input type="checkbox" checked={showIndices} onChange={(e) => setShowIndices(e.target.checked)} /> Atom numbers</label>
                  </div>
                )}
              </div>
              <div className="conf-side">
                {chairModel && chairAnalysis && <ChairStability model={chairModel} analysis={chairAnalysis} showing={state.chair.flipped ? "B" : "A"} hidden={hideAnswers} />}
                {candidates.length > 0 && (
                  <Panel className="conf-block" title="Ring" subtitle="Choose the ring to analyse.">
                    <DiagramFrame label="Structure map">
                      <StructureMap graph={graph} mode="ring" rotatable={rotatable} selectedBond={null} frontAtom={null} rings={candidates} selectedRing={activeRing} showIndices={showIndices} onPickBond={() => undefined} onPickRing={chooseRing} />
                    </DiagramFrame>
                    {candidates.filter((c) => !c.eligible).map((c) => <Callout key={c.ring.join("-")} tone="warn">Ring {c.ring.join("–")}: {c.eligible ? "" : c.reason}</Callout>)}
                  </Panel>
                )}
              </div>
            </div>
          )}

          {torsionView && (
            <div className="conf-grid">
              <div className="conf-visual">
                {!setup || !newman || !sawhorse || !cls ? (
                  <Callout tone="warn" title={bondCheck && !bondCheck.ok ? "This bond cannot be shown as a rotation." : "Choose a bond to view along."}>
                    <p>{bondCheck && !bondCheck.ok ? bondCheck.reason : "Click an eligible single bond in the structure (or pick it from the list). Double, triple, aromatic and ring bonds are not offered because they do not rotate freely."}</p>
                  </Callout>
                ) : (
                  <>
                    <div className="conf-pair">
                      <DiagramFrame
                        title={<span className="conf-view-title">{state.mode === "newman" ? "Newman projection" : "Sawhorse projection"}</span>}
                        toolbar={<span className="conf-dihedral-chip" aria-hidden="true">{Math.round(wrap360(rotation))}°</span>}
                        legend={state.mode === "newman" ? <NewmanLegend /> : undefined}
                        label={state.mode === "newman" ? "Newman projection" : "Sawhorse projection"}
                      >
                        {state.mode === "newman"
                          ? <NewmanDrawing diagram={newman} setup={setup} onRotate={(value) => setRotation(value - 0, "drag")} onPickRef={pickReference} />
                          : <SawhorseDrawing diagram={sawhorse} setup={setup} />}
                      </DiagramFrame>
                      <DiagramFrame
                        title={<span className="conf-view-title conf-view-title-aside">{state.mode === "newman" ? "Same conformation, sawhorse" : "Same conformation, Newman"}</span>}
                        label="Companion projection"
                      >
                        {state.mode === "newman"
                          ? <SawhorseDrawing diagram={sawhorse} setup={setup} compact />
                          : <NewmanDrawing diagram={newman} setup={setup} onRotate={() => undefined} onPickRef={pickReference} compact />}
                      </DiagramFrame>
                    </div>
                    <Panel className="conf-controls-panel">
                      <div className="conf-rotation">
                        <div className="conf-rotation-head">
                          <label htmlFor="conf-rotation">Rotate the rear carbon</label>
                          <output aria-live="polite" htmlFor="conf-rotation">{Math.round(wrap360(rotation))}°</output>
                        </div>
                        <input id="conf-rotation" type="range" min={0} max={360} step={1} list="conf-rotation-ticks" value={Math.round(wrap360(rotation))} onChange={(event) => setRotation(Number(event.target.value))} aria-valuetext={`${Math.round(wrap360(rotation))} degrees`} />
                        <datalist id="conf-rotation-ticks">{[0, 60, 120, 180, 240, 300, 360].map((tick) => <option key={tick} value={tick} />)}</datalist>
                        <div className="conf-rotation-scale" aria-hidden="true">
                          {[0, 60, 120, 180, 240, 300, 360].map((tick) => <span key={tick}>{tick}°</span>)}
                        </div>
                      </div>
                      <div className="conf-controls">
                        <button className="secondary-button" type="button" onClick={() => setRotation(rotation - 60, "step")}>−60°</button>
                        <button className="secondary-button" type="button" onClick={() => setRotation(rotation + 60, "step")}>+60°</button>
                        <button className="secondary-button" type="button" onClick={() => snapTo("staggered")}>Snap to staggered</button>
                        <button className="secondary-button" type="button" onClick={() => snapTo("eclipsed")}>Snap to eclipsed</button>
                        <button className="ghost-button" type="button" onClick={viewFromOtherEnd}>View from the other end</button>
                      </div>
                      <p className="conf-hint">Drag around the Newman circle (arrow keys also turn it), drag on the graph, or use the slider. Click a substituent to make it the reference group for the dihedral angle. Viewing along {graph.atoms[setup.front.atom].symbol}{setup.front.atom} → {graph.atoms[setup.rear.atom].symbol}{setup.rear.atom}: the front carbon is the one nearer the viewer.</p>
                    </Panel>
                    {setup.warnings.map((warning) => <Callout key={warning} tone="warn">{warning}</Callout>)}
                  </>
                )}
              </div>
              <div className="conf-side">
                {setup && cls && qualitative && (
                  <TorsionAssessment graph={graph} setup={setup} rotation={rotation} cls={cls} energyAbs={energyAbs} energyRel={energyRel} qualitative={qualitative} hidden={hideAnswers} />
                )}
                <Panel className="conf-block" title="Bond" subtitle="Click a bond in the structure to view along it.">
                  <DiagramFrame label="Structure map">
                    <StructureMap graph={graph} mode="bond" rotatable={rotatable} selectedBond={state.torsion.front !== null && state.torsion.rear !== null ? [state.torsion.front, state.torsion.rear] : null} frontAtom={state.torsion.front} rings={[]} selectedRing={null} showIndices={showIndices} onPickBond={(bond) => chooseBond(bond.a, bond.b)} onPickRing={() => undefined} />
                  </DiagramFrame>
                  <label className="conf-toggle"><input type="checkbox" checked={showIndices} onChange={(e) => setShowIndices(e.target.checked)} /> Atom numbers</label>
                  <label className="conf-select">Or pick a bond
                    <select value={state.torsion.front !== null && state.torsion.rear !== null ? `${state.torsion.front}-${state.torsion.rear}` : ""} onChange={(event) => { const [a, b] = event.target.value.split("-").map(Number); if (Number.isInteger(a) && Number.isInteger(b)) chooseBond(a, b); }}>
                      <option value="">Select…</option>
                      {listRotatableBonds(graph).filter((item) => item.check.ok).map(({ bond }) => (
                        <option key={bond.index} value={`${bond.a}-${bond.b}`}>{graph.atoms[bond.a].symbol}{bond.a} – {graph.atoms[bond.b].symbol}{bond.b}</option>
                      ))}
                    </select>
                  </label>
                </Panel>
              </div>
              {profile && setup && (
                <div className="conf-graph-wrap">
                  {profile.supported ? (
                    <DiagramFrame
                      title="Strain energy against dihedral angle"
                      toolbar={<Badge tone="estimate" icon="warning" title="Teaching model: textbook increments, not a calculation.">Teaching model</Badge>}
                      legend={<Legend label="Graph legend" items={[
                        { label: "strain curve", color: "var(--draw-curve)", kind: "line" },
                        { label: "energy minimum", color: "var(--draw-min)" },
                        { label: "energy maximum", color: "var(--draw-max)" },
                        { label: "current rotation", color: "var(--draw-select)", kind: "dashed" },
                      ]} />}
                      caption={<>Energies are relative to the lowest conformation of this bond. {ENERGY_MODEL.description}</>}
                      label="Strain energy graph"
                    >
                      <div className="conf-graph-host">
                        <EnergyGraph profile={profile} rotation={rotation} onRotate={(angle) => setRotation(angle, "graph")} />
                      </div>
                      <table className="conf-table conf-feature-table">
                        <caption className="visually-hidden">Marked conformations on the strain curve</caption>
                        <thead><tr><th scope="col">Angle</th><th scope="col">Conformation</th><th scope="col">Strain (kJ/mol)</th></tr></thead>
                        <tbody>
                          {profile.features.map((feature) => (
                            <tr key={`${feature.kind}-${feature.angle}`}><td>{feature.angle}°</td><td>{feature.name} <span className="conf-feature-kind">({feature.kind})</span></td><td>{fmt(feature.kJ)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </DiagramFrame>
                  ) : (
                    <Callout tone="info" title="No energy curve for this bond.">
                      <p>{profile.reason} No energy curve is drawn rather than inventing one.</p>
                    </Callout>
                  )}
                </div>
              )}
            </div>
          )}

          {practice && questions.length > 0 && (
            <Panel className="conf-practice" title="Practice" subtitle={`${correctCount} of ${questions.length} answered correctly`}>
              <div role="region" aria-label="Practice questions" className="conf-questions">
                {questions.map((question) => {
                  const key = `${question.id}|${signature}`;
                  const entry = answers[key] ?? { choice: null, revealed: false };
                  return (
                    <fieldset key={key} className="conf-question">
                      <legend>{question.prompt}</legend>
                      {question.choices.map((choice, index) => (
                        <label key={choice} className={`conf-radio${entry.choice === index ? " is-chosen" : ""}`}>
                          <input type="radio" name={key} checked={entry.choice === index} onChange={() => setAnswers((current) => ({ ...current, [key]: { choice: index, revealed: false } }))} /> {choice}
                        </label>
                      ))}
                      <div>
                        <button className="secondary-button" type="button" disabled={entry.choice === null} onClick={() => setAnswers((current) => ({ ...current, [key]: { ...entry, revealed: true } }))}>Check answer</button>
                      </div>
                      {entry.revealed && (
                        <Callout tone={entry.choice === question.correct ? "ok" : "info"} className={entry.choice === question.correct ? "conf-correct" : "conf-incorrect"}>
                          <p>{entry.choice === question.correct ? "Correct. " : `Not quite: the answer is ${question.choices[question.correct]}. `}{question.explanation}</p>
                        </Callout>
                      )}
                    </fieldset>
                  );
                })}
              </div>
            </Panel>
          )}
          {practice && questions.length === 0 && <p className="conf-hint">No practice question is available for this molecule and view.</p>}

          {!practice && guideNotes.length > 0 && (
            <Panel className="conf-notes" title="What you are seeing">
              <div role="region" aria-label="Explanations" className="conf-note-list">
                {guideNotes.map((note) => (
                  <Disclosure key={note.id} summary={note.title} defaultOpen={note.id === "flip" || note.id === "state"}>
                    <Explanation>
                      <p>{note.text}</p>
                    </Explanation>
                  </Disclosure>
                ))}
              </div>
            </Panel>
          )}

          {saved && <SavedPanel saved={saved} live={liveResults} />}

          <details className="conf-model">
            <summary>Energy model, parameters and limits</summary>
            <ul>{limits.map((text) => <li key={text}>{text}</li>)}</ul>
            {state.mode === "chair" ? (
              <>
                <p>Documented A-values (kcal/mol) used by the chair model; groups not listed get no value:</p>
                <table className="conf-table"><tbody>
                  {A_VALUE_TABLE.map((entry) => (
                    <tr key={entry.id}><td>{entry.name}</td><td>{entry.a}{entry.range ? ` (${entry.range[0]}–${entry.range[1]})` : ""}{entry.lowerBound ? " ≥" : ""}</td><td>{entry.confidence}</td></tr>
                  ))}
                </tbody></table>
                <p>Sources: Eliel &amp; Wilen, Stereochemistry of Organic Compounds (1994); Jensen &amp; Bushweller, J. Am. Chem. Soc. 1969, 91, 3223; Hirsch, Top. Stereochem. 1967, 1, 199. Recalled from the literature, not re-read in this build.</p>
              </>
            ) : (
              <ul>{ENERGY_MODEL.references.map((reference) => <li key={reference}>{reference}</li>)}</ul>
            )}
            <p>Engine versions: chair {CONFORMATIONS_ENGINE_VERSION}, torsion {TORSION_ENGINE_VERSION}. Tetrahedral configuration is taken from the input only; substituents without stereo information are never assigned one.</p>
          </details>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function ChairLegend() {
  return (
    <Legend
      label="Chair legend"
      items={[
        { label: "axial (parallel to the ring axis)", color: "var(--draw-axial)", kind: "line" },
        { label: "equatorial (around the ring's equator)", color: "var(--draw-equatorial)", kind: "line" },
        { label: "1,3-diaxial contact", color: "var(--draw-diaxial)", kind: "dashed" },
      ]}
    />
  );
}

function NewmanLegend() {
  return (
    <Legend
      label="Newman legend"
      items={[
        { label: "front carbon (bonds meet at the centre)", color: "var(--draw-ink)", kind: "line" },
        { label: "rear carbon (bonds start at the circle)", color: "var(--draw-ink-soft)", kind: "line" },
        { label: "reference group for the dihedral", color: "var(--draw-select)" },
      ]}
    />
  );
}

function StrainBar({ name, assessment, max, current }: { name: string; assessment: ChairAnalysis["A"]; max: number; current: boolean }) {
  const kcal = assessment.strainKcal;
  const width = kcal === null ? 0 : Math.max(2, (kcal / max) * 100);
  return (
    <div className={`conf-bar-row${current ? " is-current" : ""}`}>
      <span className="conf-bar-name">{name}{current ? <span className="conf-bar-now"> (shown)</span> : null}</span>
      <span aria-hidden="true" className={`conf-bar-track${kcal === null ? " is-unassessed" : ""}`}>
        <span className="conf-bar-fill" style={{ width: `${width}%` }} />
      </span>
      <span className="conf-bar-value">{kcal === null ? "not assessed" : `${fmt(kcal, 2)} kcal/mol${assessment.axialGroups.some((g) => g.lowerBound) ? " ≥" : ""}`}</span>
    </div>
  );
}

function ChairStability({ model, analysis, showing, hidden }: { model: ChairModel; analysis: ChairAnalysis; showing: "A" | "B"; hidden: boolean }) {
  const pref = analysis.preference;
  const numeric = [analysis.A.strainKcal, analysis.B.strainKcal].filter((value): value is number => value !== null);
  const max = Math.max(0.5, ...numeric);
  const cell = (assessment: ChairAnalysis["A"]) => (
    <>
      <div><strong>Axial:</strong> {assessment.axialGroups.length === 0 ? "none" : assessment.axialGroups.map((g) => `${g.label} (atom ${g.atom})`).join(", ")}</div>
      <div><strong>Equatorial:</strong> {assessment.equatorialGroups.length === 0 ? "none" : assessment.equatorialGroups.map((g) => g.label).join(", ")}</div>
      <div><strong>Axial strain:</strong>{" "}
        {assessment.strainKcal === null ? `not assessed (no A-value for ${assessment.missing.join(", ")})` : `${fmt(assessment.strainKcal, 2)} kcal/mol${assessment.axialGroups.some((g) => g.lowerBound) ? " (lower bound)" : ""}`}
      </div>
      {assessment.synDiaxial.length > 0 && <div><strong>1,3-diaxial contacts:</strong> {assessment.synDiaxial.length} ({assessment.synDiaxial.filter((x) => x.partnerIsHydrogen).length} with hydrogen)</div>}
    </>
  );
  return (
    <Panel className="conf-block" title="Stability" actions={<EvidenceBadge level="model" />}>
      {hidden ? (
        <p className="conf-hint">Hidden in practice mode. Work out which chair is more stable, then check your answer below.</p>
      ) : (
        <>
          <p className={`conf-verdict conf-verdict-${pref.kind}`} role="status">{pref.summary}</p>
          <div className="conf-bars" role="group" aria-label="Axial strain of each chair; a shorter bar is more stable in this model">
            <StrainBar name="Chair A" assessment={analysis.A} max={max} current={showing === "A"} />
            <StrainBar name="Chair B" assessment={analysis.B} max={max} current={showing === "B"} />
            <p className="conf-hint">Shorter bar = less axial strain in this additive A-value model.</p>
          </div>
          {pref.kind === "quantified" && (
            <p className="conf-hint">
              Model-implied population of the favoured chair at 298 K: about {fmt(pref.impliedPreferredPercent, pref.impliedPreferredPercent > 99.9 ? 2 : 1)}% (arithmetic from the energy gap, not a measurement){pref.usesLowerBound ? "; the gap is a lower bound" : ""}{pref.usesApproximate ? "; at least one A-value is approximate" : ""}.
            </p>
          )}
          <div className="conf-two">
            <div className={showing === "A" ? "conf-chair-card current" : "conf-chair-card"}><h4>Chair A</h4>{cell(analysis.A)}</div>
            <div className={showing === "B" ? "conf-chair-card current" : "conf-chair-card"}><h4>Chair B</h4>{cell(analysis.B)}</div>
          </div>
          <Disclosure summary="Not included in this model">
            <ul className="conf-limits">{analysis.notIncluded.map((text) => <li key={text}>{text}</li>)}</ul>
          </Disclosure>
          {model.warnings.map((warning) => <Callout key={warning} tone="warn">{warning}</Callout>)}
        </>
      )}
    </Panel>
  );
}

function TorsionAssessment({ graph, setup, rotation, cls, energyAbs, energyRel, qualitative, hidden }: {
  graph: ConformationGraph;
  setup: TorsionSetup;
  rotation: number;
  cls: ReturnType<typeof classify>;
  energyAbs: number | null;
  energyRel: number | null;
  qualitative: ReturnType<typeof qualitativeAssessment>;
  hidden: boolean;
}) {
  const label = (atom: number) => (atom >= graph.implicitHydrogenBase || graph.atoms[atom].atomicNumber === 1 ? "H" : `${graph.atoms[atom].symbol}${atom}`);
  return (
    <Panel className="conf-block" title="Assessment" actions={<EvidenceBadge level="model" />}>
      <p className="conf-readout">Dihedral {label(setup.frontRef)}–{graph.atoms[setup.front.atom].symbol}{setup.front.atom}–{graph.atoms[setup.rear.atom].symbol}{setup.rear.atom}–{label(setup.rearRef)}: <strong>{fmt(dihedralBetween(conformationAt(setup, rotation), setup.frontRef, setup.rearRef), 0)}°</strong></p>
      {hidden ? (
        <p className="conf-hint">The name, interactions and energy are hidden in practice mode.</p>
      ) : (
        <>
          <p className={`conf-verdict conf-verdict-${cls.kind}`} role="status"><strong>{cls.name}</strong> — {cls.description}</p>
          {energyAbs !== null && energyRel !== null ? (
            <p>
              Strain: <strong>{fmt(energyRel)} kJ/mol</strong> ({fmt(energyRel / KJ_PER_KCAL, 2)} kcal/mol) above the lowest conformation of this bond. <span className="conf-hint">Parameter-supported approximation (textbook increments), not a calculation.</span>
            </p>
          ) : (
            <Callout tone="info">No numeric energy: the model only has parameters for hydrogen and methyl groups. Qualitative comparison follows.</Callout>
          )}
          <p>{qualitative.staggeredVsEclipsed}</p>
          <p>{qualitative.stericNote}</p>
          {qualitative.caveats.map((caveat) => <Callout key={caveat} tone="warn">{caveat}</Callout>)}
          {cls.relations.length > 0 && (
            <div className="conf-table-scroll">
              <table className="conf-table">
                <thead><tr><th>Front</th><th>Rear</th><th>Angle</th><th>Relation</th></tr></thead>
                <tbody>
                  {cls.relations.map((relation) => (
                    <tr key={`${relation.front}-${relation.rear}`}><td>{label(relation.front)}</td><td>{label(relation.rear)}</td><td>{Math.round(Math.abs(relation.dihedral))}°</td><td>{relation.relation}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function SavedPanel({ saved, live }: { saved: Saved; live: ConformationsWorkspaceResults | null }) {
  const r = saved.results;
  const mismatch = saved.engineMismatch || r.engineVersion !== CONFORMATIONS_ENGINE_VERSION;
  let differs: string[] = [];
  if (live && !mismatch) {
    if (r.chair && live.chair) {
      if (r.chair.preferenceKind !== live.chair.preferenceKind || r.chair.preferred !== live.chair.preferred || r.chair.deltaKcal !== live.chair.deltaKcal) differs.push("the chair preference");
    }
    if (r.torsion && live.torsion && r.torsion.relativeKJ !== live.torsion.relativeKJ && r.torsion.rotation === live.torsion.rotation) differs.push("the strain energy");
  }
  differs = [...new Set(differs)];
  return (
    <Panel className="conf-saved" title="Saved assessment" actions={<Badge tone="neutral" icon="info">Saved result</Badge>}>
      <div role="region" aria-label="Saved assessment" className="ui-stack">
        <p>
          {saved.origin === "opened" ? `Opened saved analysis “${saved.name}”` : "Restored from your previous session"} (assessed {new Date(saved.computedAt).toLocaleString()}). {describeConformationsAnalysis(r)}.
        </p>
        {mismatch && <Callout tone="warn">Saved by another version of the conformation model (v{r.engineVersion}, now v{CONFORMATIONS_ENGINE_VERSION}). The values above are the saved ones and have not been recomputed; the live view uses the current model.</Callout>}
        {differs.length > 0 && <Callout tone="warn">The live model now gives a different {differs.join(" and ")} than the saved assessment.</Callout>}
        {!mismatch && differs.length === 0 && <p className="conf-hint">The live model reproduces the saved assessment.</p>}
        <ul className="conf-limits">{r.limits.map((text) => <li key={text}>{text}</li>)}</ul>
      </div>
    </Panel>
  );
}
