import { reagentBubbleLabels } from "../utils/reactions/reactionPresentation";
import { useEffect, useRef, useState } from "react";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import { rendererForReactionDisplay } from "./reactionProductRenderer";
import {
  analyzeFunctionalGroupHierarchy,
  getCondensedSulfonateSvg,
  getRDKit,
} from "../utils/functionalGroups";
import { analyzeNomenclatureAndProperties } from "../utils/nomenclatureUtils";
import {
  extractKetMolecules,
  ketMoleculeHasDefinedWedgeStereo,
  ketMoleculeToV3000,
  type KetDocument,
} from "../utils/ketcherKet";
import {
  reactionRegistry,
  splitReactionComponents,
  type MultistepSynthesisProgress,
  type MultistepSynthesisRoute,
  type SynthesisStep,
} from "../utils/reactionUtils";
import {
  SearchRunController,
  UNIFIED_SEARCH_TOTAL_MS,
  type SearchRunState,
} from "../utils/reactions/engine/synthesisSearchRun";
import { describeRouteStructure } from "../utils/reactions/engine/routePresentation";

type StepSvgSet = {
  reactants: string[];
  products: string[];
};

type RouteSvgMap = Record<string, StepSvgSet>;

const KETCHER_READ_TIMEOUT_MS = 8000;
const EMPTY_KET = JSON.stringify({ root: { nodes: [] } });

async function ketToSmiles(
  ketText: string,
  label: string,
  runId: number,
): Promise<string | null> {
  const prefix = `[PocketChem:Synthesis #${runId}]`;
  const startedAt = performance.now();

  try {
    const ket = JSON.parse(ketText) as KetDocument;
    const molecules = extractKetMolecules(ket);
    console.info(`${prefix} parsed KET for ${label}`, {
      ketLength: ketText.length,
      moleculeCount: molecules.length,
      atomCounts: molecules.map((molecule) => molecule.atoms?.length ?? 0),
      bondCounts: molecules.map((molecule) => molecule.bonds?.length ?? 0),
    });
    if (molecules.length === 0) return null;

    const rdkitStart = performance.now();
    const rdkit = await getRDKit();
    console.info(`${prefix} RDKit ready for ${label}`, {
      elapsedMs: Math.round(performance.now() - rdkitStart),
    });

    const components: string[] = [];
    for (let index = 0; index < molecules.length; index += 1) {
      const molblock = ketMoleculeToV3000(molecules[index]);
      if (!molblock) continue;

      const mol = rdkit.get_mol(molblock);
      console.info(`${prefix} RDKit parsed KET molecule ${index + 1} for ${label}`, {
        success: Boolean(mol),
        atomCount: molecules[index].atoms?.length ?? 0,
        bondCount: molecules[index].bonds?.length ?? 0,
      });
      if (!mol) return null;

      try {
        const smiles = mol.get_smiles?.();
        if (typeof smiles !== "string" || !smiles.trim()) return null;
        const normalizedSmiles = smiles.trim();

        if (
          ketMoleculeHasDefinedWedgeStereo(molecules[index]) &&
          !normalizedSmiles.includes("@")
        ) {
          console.debug(`${prefix} KET wedge stereo did not produce a tetrahedral tag for ${label}`, {
            moleculeIndex: index + 1,
            note: "The wedged bond may be on an achiral or incompletely specified center.",
          });
        }

        components.push(normalizedSmiles);
      } finally {
        mol.delete?.();
      }
    }

    const combined = components.join(".");
    console.info(`${prefix} KET -> SMILES complete for ${label}`, {
      smiles: combined,
      componentCount: components.length,
      elapsedMs: Math.round(performance.now() - startedAt),
    });
    return combined || null;
  } catch (conversionError) {
    console.error(`${prefix} KET -> SMILES failed for ${label}`, conversionError);
    return null;
  }
}

function courseLabel(course: SynthesisStep["course"]) {
  return course === "ochem-1"
    ? "O-Chem I"
    : course === "ochem-2"
      ? "O-Chem II"
      : "Advanced";
}


function synthesisStepProductRenderer(step: SynthesisStep) {
  return rendererForReactionDisplay(step.display, { allowGenericHalogen: false });
}

function progressLabel(progress: MultistepSynthesisProgress): string {
  const nodeProgress =
    typeof progress.total === "number" && progress.total > 0
      ? ` · ${Math.min(progress.processed ?? 0, progress.total)}/${progress.total} frontier nodes`
      : "";
  const candidates =
    typeof progress.candidateCount === "number"
      ? ` · ${progress.candidateCount} candidates`
      : "";

  if (progress.phase === "forward") {
    return `Forward reaction search · depth ${progress.depth}/${progress.maxSteps}${nodeProgress}${candidates}`;
  }

  if (progress.phase === "retrosynthesis") {
    return `Reverse reaction search · depth ${progress.depth}/${progress.maxSteps}${nodeProgress}${candidates}`;
  }

  const left = progress.processed ?? 0;
  const right = progress.candidateCount ?? 0;
  return `Connecting search frontiers · testing ${progress.depth}-step routes · ${left} × ${right} states`;
}

async function moleculeDisplayName(smiles: string): Promise<string> {
  try {
    const hierarchy = await analyzeFunctionalGroupHierarchy(smiles);
    const functionalGroups = hierarchy.functionalGroups ?? [];
    const identity = await analyzeNomenclatureAndProperties(
      smiles,
      hierarchy.primaryGroups,
      hierarchy.mainGroup ?? functionalGroups[0] ?? null,
    );

    return (
      identity.nomenclature.displayName ||
      identity.nomenclature.estimatedName ||
      "Unnamed structure"
    );
  } catch (nameError) {
    console.warn("Could not generate a synthesis display name:", { smiles, nameError });
    return "Unnamed structure";
  }
}

async function hydrateRouteLabels(
  routes: MultistepSynthesisRoute[],
): Promise<MultistepSynthesisRoute[]> {
  return Promise.all(
    routes.map(async (route) => ({
      ...route,
      steps: await Promise.all(
        route.steps.map(async (step) => {
          const productComponents = (
            step.productMixture?.memberSmiles ?? step.productComponents
          )
            .flatMap((member) => member.split("."))
            .map((component) => component.trim())
            .filter(Boolean);

          const [reactantNames, productNames] = await Promise.all([
            Promise.all(step.reactantComponents.map(moleculeDisplayName)),
            Promise.all(productComponents.map(moleculeDisplayName)),
          ]);

          return {
            ...step,
            reactantLabel:
              reactantNames.length > 0 ? reactantNames.join(" + ") : step.reactantLabel,
            productLabel:
              productNames.length > 0 ? productNames.join(" + ") : step.productLabel,
          };
        }),
      ),
    })),
  );
}

function RouteStructurePanel({ route }: { route: MultistepSynthesisRoute }) {
  const verification = route.verification;
  if (!verification) return null;
  const structure = describeRouteStructure(route);
  const multiCopy = (verification.inventory ?? []).some((entry) => entry.copies > 1);
  if (structure.kind !== "convergent" && !multiCopy) return null;

  const targetLotId = verification.targetLineage?.lotId;
  const otherLeftovers = (verification.leftovers ?? []).filter((item) => item.lotId !== targetLotId);

  return (
    <div className="reaction-detail synthesis-structure-panel">
      {structure.kind === "convergent" && (
        <>
          <p>
            <strong>Convergent route.</strong> Independently prepared branches meet in one
            reaction:
          </p>
          <ul>
            {structure.joins.map((join) => (
              <li key={join.step}>
                Step {join.step} combines{" "}
                {join.branches
                  .map(
                    (branch) =>
                      `step${branch.steps.length === 1 ? "" : "s"} ${branch.steps.join(", ")}` +
                      (branch.startingMaterials.length > 0
                        ? ` (from supplied material${branch.startingMaterials.length === 1 ? "" : "s"} ${branch.startingMaterials
                            .map((index) => index + 1)
                            .join(", ")})`
                        : ""),
                  )
                  .join(" and ")}
                .
              </li>
            ))}
          </ul>
        </>
      )}
      {structure.unusedSteps.length > 0 && (
        <p>Steps that do not feed the target: {structure.unusedSteps.join(", ")}.</p>
      )}
      {(verification.inventory ?? []).length > 0 && (
        <p>
          <strong>Material copies used:</strong>{" "}
          {(verification.inventory ?? [])
            .map(
              (entry) =>
                `supplied material ${entry.startIndex + 1}: ${entry.consumed} of ${entry.copies} cop${entry.copies === 1 ? "y" : "ies"}`,
            )
            .join(" · ")}
        </p>
      )}
      {verification.unusedStartingMaterials.length > 0 && (
        <p>Unused (spectator) materials: {verification.unusedStartingMaterials.join(", ")}.</p>
      )}
      {otherLeftovers.length > 0 && (
        <p>
          Other species left at the end:{" "}
          {otherLeftovers.map((item) => item.smiles).join(", ")}.
        </p>
      )}
      <p className="reaction-note">
        A copy is a qualitative availability count, not an amount of substance. Selectivity
        labels are model estimates, not measured yields.
      </p>
    </div>
  );
}

export default function SynthesisPage() {
  const [reactantKetcher, setReactantKetcher] = useState<KetcherApi | null>(null);
  const [productKetcher, setProductKetcher] = useState<KetcherApi | null>(null);
  const [routes, setRoutes] = useState<MultistepSynthesisRoute[]>([]);
  const [routeSvgs, setRouteSvgs] = useState<RouteSvgMap>({});
  const [isSearching, setIsSearching] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [status, setStatus] = useState(
    "Draw starting materials and a target product to begin.",
  );
  const [error, setError] = useState<string | null>(null);
  const [technicalError, setTechnicalError] = useState<string | null>(null);
  const [startingSmiles, setStartingSmiles] = useState("");
  const [targetSmiles, setTargetSmiles] = useState("");
  const [startingNames, setStartingNames] = useState<string[]>([]);
  const [targetName, setTargetName] = useState("");
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchElapsedMs, setSearchElapsedMs] = useState(0);
  // Reading the editors is guarded by searchRunRef/searchAbortRef; the engine run itself is
  // owned by the controller, which drops everything from a superseded or cancelled run.
  const searchRunRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchControllerRef = useRef<SearchRunController | null>(null);
  const applyRunStateRef = useRef<((state: SearchRunState) => void) | null>(null);
  const runContextRef = useRef<{ startingComponents: string[]; targetSmiles: string; namesRequested: boolean } | null>(null);
  const hydrateSequenceRef = useRef(0);
  const searchStartedAtRef = useRef(0);
  // Explicit user choice; never changed by the search. A copy is a qualitative availability count.
  const [copies, setCopies] = useState<1 | 2>(1);
  const [interruptedNote, setInterruptedNote] = useState<string | null>(null);
  const [drawerResetVersion, setDrawerResetVersion] = useState(0);
  const [editorMountVersion, setEditorMountVersion] = useState(0);

  const editorsReady = Boolean(reactantKetcher && productKetcher);

  useEffect(() => {
    const controller = new SearchRunController({ rules: reactionRegistry });
    searchControllerRef.current = controller;
    const unsubscribe = controller.subscribe((state) => applyRunStateRef.current?.(state));
    return () => {
      unsubscribe();
      controller.dispose();
      searchControllerRef.current = null;
      searchRunRef.current += 1;
      searchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isSearching) return;
    const timer = setInterval(() => setSearchElapsedMs(Date.now() - searchStartedAtRef.current), 200);
    return () => clearInterval(timer);
  }, [isSearching]);

  useEffect(() => {
    let cancelled = false;

    async function buildRouteSvgs() {
      const next: RouteSvgMap = {};

      for (const route of routes) {
        for (const step of route.steps) {
          const key = `${route.id}--step-${step.stepNumber}`;
          const productRenderer = synthesisStepProductRenderer(step);
          const [reactants, products] = await Promise.all([
            Promise.all(
              step.reactantComponents.map((component) =>
                getCondensedSulfonateSvg(component),
              ),
            ),
            Promise.all(
              (step.productMixture?.memberSmiles ?? step.productComponents)
                .flatMap((member) =>
                  member
                    .split(".")
                    .map((component) => component.trim())
                    .filter(Boolean),
                )
                .map((component) => productRenderer(component)),
            ),
          ]);

          next[key] = {
            reactants: reactants.filter((svg): svg is string => Boolean(svg)),
            products: products.filter((svg): svg is string => Boolean(svg)),
          };
        }
      }

      if (!cancelled) setRouteSvgs(next);
    }

    void buildRouteSvgs();
    return () => {
      cancelled = true;
    };
  }, [routes]);

  async function readEditorSmiles(
    editor: KetcherApi,
    label: string,
    runId: number,
  ): Promise<string | null> {
    const prefix = `[PocketChem:Synthesis #${runId}]`;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const startedAt = performance.now();

    console.info(`${prefix} about to read ${label}`, {
      editor,
      hasGetKet: typeof editor.getKet === "function",
      hasGetMolfile: typeof editor.getMolfile === "function",
      hasGetSmiles: typeof editor.getSmiles === "function",
      hasSetMolecule: typeof editor.setMolecule === "function",
    });

    try {
      // getMolfile()/getSmiles() in Ketcher standalone pass through Indigo's
      // worker-backed conversion service. That promise is what is hanging in
      // the current Ketcher build. getKet() serializes Ketcher's in-memory
      // structure instead, so PocketChem can bypass Indigo and let RDKit do the
      // chemistry-format conversion locally.
      const getKetStartedAt = performance.now();
      console.info(`${prefix} calling getKet() for ${label}`);

      const observedKetPromise = editor.getKet().then(
        (value) => {
          console.info(`${prefix} getKet() resolved for ${label}`, {
            elapsedMs: Math.round(performance.now() - getKetStartedAt),
            length: typeof value === "string" ? value.length : null,
          });
          return value;
        },
        (apiError) => {
          console.error(`${prefix} getKet() rejected for ${label}`, {
            elapsedMs: Math.round(performance.now() - getKetStartedAt),
            error: apiError,
          });
          throw apiError;
        },
      );

      const ketText = await Promise.race([
        observedKetPromise,
        new Promise<never>((_resolve, reject) => {
          timeoutId = setTimeout(() => {
            console.warn(`${prefix} getKet() TIMEOUT for ${label}`, {
              timeoutMs: KETCHER_READ_TIMEOUT_MS,
              elapsedMs: Math.round(performance.now() - getKetStartedAt),
              editor,
            });
            reject(new Error(`Timed out while reading ${label} from Ketcher.`));
          }, KETCHER_READ_TIMEOUT_MS);
        }),
      ]);

      if (!ketText.trim()) {
        if (searchRunRef.current === runId) {
          setError(`Draw ${label} before searching.`);
          setStatus("Draw the missing structure and try again.");
        }
        return null;
      }

      const smiles = await ketToSmiles(ketText, label, runId);
      if (!smiles) {
        if (searchRunRef.current === runId) {
          setError(`PocketChem could not interpret ${label}.`);
          setStatus("Could not convert the drawn structures.");
        }
        return null;
      }

      console.info(`${prefix} finished reading ${label}`, {
        smiles,
        totalElapsedMs: Math.round(performance.now() - startedAt),
      });
      return smiles;
    } catch (readError) {
      console.error(`${prefix} could not export ${label} from Ketcher`, {
        error: readError,
        totalElapsedMs: Math.round(performance.now() - startedAt),
      });
      const timedOut =
        readError instanceof Error && readError.message.startsWith("Timed out");

      if (searchRunRef.current === runId) {
        setError(
          timedOut
            ? `Ketcher took too long to read ${label}. Try the search again.`
            : `PocketChem could not read ${label}. Check the structure and try again.`,
        );
        setStatus("Could not read the structures from Ketcher.");
      }
      return null;
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  }

  /**
   * Applies the search controller's state to the page. The controller is the only source:
   * it already drops anything from a superseded, cancelled or cleared run, so this never
   * sees a stale result.
   */
  function applyRunState(state: SearchRunState) {
    if (state.phase === "idle") return;
    const context = runContextRef.current;
    setSearchProgress((current) => (state.phase === "running" ? Math.max(current, state.percent) : state.percent));

    if (state.routes.length > 0) {
      const shownRunId = state.runId;
      setRoutes(state.routes);
      const sequence = (hydrateSequenceRef.current += 1);
      void hydrateRouteLabels(state.routes)
        .then((hydrated) => {
          // Only the latest update of the still-current run may replace what is shown.
          if (hydrateSequenceRef.current !== sequence) return;
          if (searchControllerRef.current?.getState().runId !== shownRunId) return;
          setRoutes(hydrated);
        })
        .catch((hydrateError) => {
          console.warn("[PocketChem:Synthesis] Could not format routes; showing them as found.", hydrateError);
        });
      if (context && !context.namesRequested) {
        context.namesRequested = true;
        const { startingComponents, targetSmiles: targetComponent } = context;
        void Promise.all([
          Promise.all(startingComponents.map((component) => moleculeDisplayName(component))),
          moleculeDisplayName(targetComponent),
        ]).then(([startingLabels, targetLabel]) => {
          if (runContextRef.current !== context) return;
          setStartingNames(startingLabels);
          setTargetName(targetLabel);
        });
      }
    }

    if (state.phase === "running") {
      const detail = state.progress ? progressLabel(state.progress) : state.stage ?? "Preparing the search";
      setStatus(
        state.routes.length > 0
          ? `Verified route found · still looking for better routes · ${detail}`
          : `Searching · ${detail}`,
      );
      return;
    }

    // Finished.
    setIsSearching(false);
    setSearchElapsedMs(state.startedAt === null ? 0 : Date.now() - state.startedAt);
    const outcome = state.outcome;
    if (!outcome) return;
    setInterruptedNote(null);
    setError(null);
    setTechnicalError(state.errorDetail);
    switch (outcome.kind) {
      case "found":
        setStatus(outcome.message);
        break;
      case "found-interrupted":
        setInterruptedNote(outcome.message);
        setStatus("Search stopped early · verified route kept.");
        break;
      case "cancelled":
        if (state.routes.length > 0) {
          setInterruptedNote(outcome.message);
          setStatus("Search cancelled · verified route kept.");
        } else {
          setStatus("Synthesis search cancelled.");
        }
        break;
      case "no-route-within-budget":
      case "no-route-within-bounds":
        setStatus(outcome.message);
        break;
      case "stalled":
        setError(outcome.message);
        setStatus("Search stopped: no progress was reported.");
        break;
      default:
        setError(outcome.message);
        setStatus("Synthesis search encountered an internal reaction-engine error.");
    }
  }
  useEffect(() => {
    applyRunStateRef.current = applyRunState;
  });

  async function findSynthesis() {
    if (!reactantKetcher || !productKetcher || isSearching || isClearing) return;

    const runId = searchRunRef.current + 1;
    searchRunRef.current = runId;
    searchAbortRef.current?.abort();
    const readController = new AbortController();
    searchAbortRef.current = readController;
    const prefix = `[PocketChem:Synthesis #${runId}]`;
    let engineStarted = false;

    console.groupCollapsed(`${prefix} Search`);
    setIsSearching(true);
    setInterruptedNote(null);
    setError(null);
    setTechnicalError(null);
    setRoutes([]);
    setRouteSvgs({});
    setStartingNames([]);
    setTargetName("");
    setSearchElapsedMs(0);
    setSearchProgress(3);
    setStatus("Reading the starting materials and target product…");
    runContextRef.current = null;
    searchStartedAtRef.current = Date.now();

    try {
      setStatus("Reading starting materials…");
      const start = await readEditorSmiles(reactantKetcher, "the starting materials", runId);
      if (!start || searchRunRef.current !== runId || readController.signal.aborted) return;
      setSearchProgress(8);

      // Read the Ketcher instances one at a time. Concurrent editor exports can
      // leave one embedded Ketcher worker waiting indefinitely in some sessions.
      setStatus("Reading target product…");
      const target = await readEditorSmiles(productKetcher, "the target product", runId);
      if (!target || searchRunRef.current !== runId || readController.signal.aborted) return;
      setSearchProgress(14);

      setStatus("Preparing structures for the reaction-rule search…");
      const startingComponents = splitReactionComponents(start);
      const targetComponents = splitReactionComponents(target);
      console.info(`${prefix} reaction components parsed`, { startingComponents, targetComponents, copies });

      if (startingComponents.length < 1 || targetComponents.length !== 1) {
        setError(
          "Draw one or more disconnected starting materials on the left and exactly one target product on the right.",
        );
        setStatus("Adjust the structures and try again.");
        return;
      }

      const combinedStart = startingComponents.join(".");
      setStartingSmiles(combinedStart);
      setTargetSmiles(targetComponents[0]);
      setSearchProgress(20);
      setStatus("Starting the synthesis search…");
      runContextRef.current = {
        startingComponents,
        targetSmiles: targetComponents[0],
        namesRequested: false,
      };

      const controller = searchControllerRef.current;
      if (!controller) return;
      engineStarted = true;
      // One button, one adaptive search under the 45-second limit. The copy count is the
      // user's explicit choice (default one) and is passed through unchanged.
      await controller.start({ startingSmiles: combinedStart, targetSmiles: targetComponents[0], copies });
    } catch (searchError) {
      // Reading the editors failed; the search controller reports its own errors.
      console.error(`${prefix} synthesis search setup failed`, searchError);
      if (searchRunRef.current === runId) {
        setTechnicalError(
          searchError instanceof Error ? `${searchError.name}: ${searchError.message}` : String(searchError),
        );
        setError("The synthesis search could not start. The structures do not need to be redrawn.");
        setStatus("Synthesis search encountered an internal error.");
      }
    } finally {
      console.groupEnd();
      if (searchAbortRef.current === readController) searchAbortRef.current = null;
      if (!engineStarted && searchRunRef.current === runId) setIsSearching(false);
    }
  }

  function cancelSynthesisSearch() {
    const controller = searchControllerRef.current;
    const wasRunning = controller?.isRunning() ?? false;
    // The controller keeps the verified routes found so far and invalidates its run.
    controller?.cancel();
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    searchRunRef.current += 1;
    setIsSearching(false);
    setSearchElapsedMs(0);
    if (!wasRunning) {
      setSearchProgress(0);
      setStatus("Synthesis search cancelled.");
    }
  }

  async function clearSynthesis() {
    if (isClearing) return;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    searchControllerRef.current?.reset();
    searchRunRef.current += 1;
    const clearRunId = searchRunRef.current;
    setIsClearing(true);
    setIsSearching(false);
    setInterruptedNote(null);
    runContextRef.current = null;
    setError(null);
    setTechnicalError(null);
    setRoutes([]);
    setRouteSvgs({});
    setStartingSmiles("");
    setTargetSmiles("");
    setStartingNames([]);
    setTargetName("");
    setSearchProgress(0);
    setSearchElapsedMs(0);
    setStatus("Clearing molecule editors…");

    try {
      // Keep both Ketcher instances mounted. The old implementation remounted
      // the editors on every Clear, which forced Ketcher through its loading
      // state again and produced the large dark/blank box seen in the UI.
      // Importing a valid empty KET document replaces the canvas contents
      // without asking Ketcher to parse an empty string. needZoom:false also
      // prevents an empty import from changing the canvas zoom/viewport.
      const clearOptions = { needZoom: false };
      await Promise.all([
        reactantKetcher?.setMolecule(EMPTY_KET, clearOptions),
        productKetcher?.setMolecule(EMPTY_KET, clearOptions),
      ]);

      if (searchRunRef.current !== clearRunId) return;
      setDrawerResetVersion((version) => version + 1);
      setStatus("Draw starting materials and a target product to begin.");
    } catch (clearError) {
      if (searchRunRef.current !== clearRunId) return;
      console.warn("Could not clear synthesis editors in place; remounting as fallback.", clearError);

      // Rare fallback if Ketcher rejects the empty KET import. The normal path
      // above does not remount, so users should not see a loading flash on Clear.
      setReactantKetcher(null);
      setProductKetcher(null);
      setDrawerResetVersion((version) => version + 1);
      setEditorMountVersion((version) => version + 1);
      setStatus("Draw starting materials and a target product to begin.");
    } finally {
      if (searchRunRef.current === clearRunId) setIsClearing(false);
    }
  }

  return (
    <section className={`synthesis-page${isSearching ? " is-searching" : ""}`}>
      <div className="card synthesis-intro-card">
        <div>
          <h2>Multistep Synthesis</h2>
          <p>
            Draw all supplied starting materials together on the left and the
            target on the right. Disconnected structures are treated as separate
            starting materials.
          </p>
        </div>
        <span className={`status ${editorsReady ? "ready" : "loading"}`}>
          {editorsReady ? "Editors ready" : "Loading editors"}
        </span>
      </div>

      <div className="synthesis-drawers">
        <div className="card synthesis-drawer-card">
          <div className="synthesis-drawer-header">
            <h2>Starting Materials</h2>
          </div>
          <div className="synthesis-ketcher-box">
            <MoleculeDrawer
              key={`synthesis-reactant-${editorMountVersion}`}
              globalKey="synthesisReactantKetcher"
              resetVersion={drawerResetVersion}
              isolateEditor
              nameInputMode="add-or-replace"
              onReady={setReactantKetcher}
              onNotReady={() => setReactantKetcher(null)}
            />
          </div>
        </div>

        <div className="card synthesis-drawer-card">
          <div className="synthesis-drawer-header">
            <h2>Target Product</h2>
          </div>
          <div className="synthesis-ketcher-box">
            <MoleculeDrawer
              key={`synthesis-product-${editorMountVersion}`}
              globalKey="synthesisProductKetcher"
              resetVersion={drawerResetVersion}
              isolateEditor
              maxComponents={1}
              onReady={setProductKetcher}
              onNotReady={() => setProductKetcher(null)}
            />
          </div>
        </div>
      </div>

      <div className="card synthesis-controls-card">
        <div className="synthesis-controls-row">
          <p className="reaction-progress synthesis-progress" aria-live="polite">
            {isSearching && <span className="loading-spinner" aria-hidden="true" />}
            {status}
          </p>

          <div className="reaction-actions synthesis-actions">
            <button
              className="primary-button"
              disabled={!editorsReady || isSearching || isClearing}
              onClick={() => void findSynthesis()}
              type="button"
            >
              {isSearching ? "Searching…" : "Search"}
            </button>
            <button
              className="secondary-button"
              disabled={!editorsReady || isClearing}
              onClick={() =>
                isSearching ? cancelSynthesisSearch() : void clearSynthesis()
              }
              type="button"
            >
              {isSearching ? "Cancel" : "Clear"}
            </button>
          </div>
        </div>

        <div className="synthesis-copies-control">
          <label>
            Copies of each starting material{" "}
            <select
              value={copies}
              disabled={isSearching}
              onChange={(event) => setCopies(event.target.value === "2" ? 2 : 1)}
            >
              <option value={1}>One copy (default)</option>
              <option value={2}>Two copies</option>
            </select>
          </label>
          <p className="reaction-note">
            Controls how many times each supplied starting material can be used. Copies do not
            represent quantity or reaction yield.
          </p>
        </div>

        {isSearching && (
          <div className="synthesis-search-telemetry">
            <div
              className="synthesis-loading-track"
              role="progressbar"
              aria-label="Synthesis search work completed"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(searchProgress)}
            >
              <div
                className="synthesis-loading-fill"
                style={{ width: `${Math.max(4, searchProgress)}%` }}
              />
            </div>
            <div className="synthesis-progress-meta">
              <span>Deterministic reaction-rule search · bar estimates completed search work, not time remaining</span>
              <span>
                {(searchElapsedMs / 1000).toFixed(1)}s of {Math.round(UNIFIED_SEARCH_TOTAL_MS / 1000)}s limit
              </span>
            </div>
          </div>
        )}

        {error && <p className="reaction-detail reaction-limitation synthesis-error">{error}</p>}
        {interruptedNote && (
          <p className="reaction-detail reaction-limitation synthesis-interrupted">
            <strong>Search interrupted.</strong> {interruptedNote}
          </p>
        )}

        {technicalError && (
          <details className="reaction-detail synthesis-error-details">
            <summary>Technical error details</summary>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {technicalError}
            </pre>
          </details>
        )}

        {startingNames.length > 0 && targetName && (
          <div className="synthesis-identity-row">
            <p title={startingSmiles}>
              <strong>Starting materials:</strong>{" "}
              <span>{startingNames.join(" + ")}</span>
            </p>
            <span aria-hidden="true">→</span>
            <p title={targetSmiles}>
              <strong>Target:</strong> <span>{targetName}</span>
            </p>
          </div>
        )}
      </div>

      {routes.map((route) => (
        <div className="card synthesis-route-card" key={route.id}>
          <div className="synthesis-route-header">
            <div>
              <p className="label">{route.verification?.status === "verified" || route.verification?.status === "connectivity-only" ? "Replay-confirmed route" : "Unverified candidate route"}</p>
              <h2>
                {route.steps.length === 0
                  ? "A starting material already matches target"
                  : `${route.steps.length}-step synthesis`}
              </h2>
            </div>
            <span className="status ready">
              {route.verification?.status === "verified"
                ? "Structure verified"
                : route.verification?.status === "connectivity-only"
                  ? "Connectivity verified"
                  : "Not replay-verified"}
            </span>
          </div>

          {route.verification && route.verification.status !== "verified" && (
            <p className="reaction-detail reaction-limitation">
              <strong>
                {route.verification.status === "failed"
                  ? "End-to-end replay did not confirm this route."
                  : "End-to-end replay matched by connectivity only."}
              </strong>{" "}
              {route.verification.problems.slice(0, 3).join(" ")}
            </p>
          )}
          {route.verification && route.verification.coproducts.length > 0 && (
            <p className="reaction-note">
              The final step also gives: {route.verification.coproducts.join(", ")}.
            </p>
          )}
          {route.verification?.status === "verified" && (
            <p className="reaction-note">
              Replayed end to end from the supplied starting materials with PocketChem&apos;s
              reaction model (a model check, not an experimental validation). It does not check
              whether the reagents are compatible with the other functional groups in each
              intermediate (for example a strong base or organometallic reagent with an acidic
              OH or N–H group), nor whether a protecting group would be needed.
            </p>
          )}

          <RouteStructurePanel route={route} />

          {route.compatibility && (route.compatibility.warnings.length > 0 || route.compatibility.unassessedRuleIds.length > 0) && (
            <div className="reaction-detail reaction-limitation synthesis-compatibility">
              <p>
                <strong>Compatibility notes (advisory).</strong> These come from declared reaction
                conditions and the groups left unreacted in each step; they are not part of the
                structural verification and are not experimental predictions.
              </p>
              {route.compatibility.warnings.length > 0 && (
                <ul>
                  {route.compatibility.warnings.map((warning, index) => (
                    <li key={`${warning.stepNumber}-${warning.group}-${index}`}>
                      Step {warning.stepNumber}:{" "}
                      <strong>{warning.severity === "model-constraint" ? "likely problem" : "possible issue"}</strong>{" "}
                      — {warning.message}
                    </li>
                  ))}
                </ul>
              )}
              {route.compatibility.unassessedRuleIds.length > 0 && (
                <p>
                  {route.compatibility.unassessedRuleIds.length} reaction type
                  {route.compatibility.unassessedRuleIds.length === 1 ? " has" : "s have"} no
                  condition data yet, so compatibility could not be assessed for{" "}
                  {route.compatibility.unassessedRuleIds.length === 1 ? "it" : "them"}.
                </p>
              )}
            </div>
          )}

          {route.steps.length > 0 && (() => {
            const finalStep = route.steps[route.steps.length - 1];
            const targetRequestsTetrahedralStereo = targetSmiles.includes("@");
            const targetObtainedAsMixture = Boolean(
              targetRequestsTetrahedralStereo && finalStep?.productMixture,
            );

            return (
            <>
              {targetObtainedAsMixture && finalStep?.productMixture && (
                <p className="reaction-detail reaction-limitation">
                  <strong>Stereochemistry:</strong>{" "}
                  The drawn target stereoisomer is formed as part of a{" "}
                  {finalStep.productMixture.label.toLowerCase()}, not as an
                  enantiopure product.
                </p>
              )}
            <div className="synthesis-step-list">
              {route.steps.map((step) => {
                const svgKey = `${route.id}--step-${step.stepNumber}`;
                const svgs = routeSvgs[svgKey];
                const structure = describeRouteStructure(route);
                const stepInputs =
                  structure.kind === "convergent" ? structure.stepInputs[step.stepNumber] : undefined;

                return (
                  <div className="synthesis-step-card" key={step.id}>
                    <div className="reaction-card-heading">
                      <div>
                        <p className="synthesis-step-label">Step {step.stepNumber}</p>
                        {stepInputs && stepInputs.length > 0 && (
                          <p className="reaction-curriculum">Inputs: {stepInputs.join(" + ")}</p>
                        )}
                        <h3>{step.title}</h3>
                        <p className="reaction-curriculum">
                          {courseLabel(step.course)} · {step.chapter}
                          {step.mechanism ? ` · ${step.mechanism}` : ""}
                        </p>
                      </div>
                      <span className="synthesis-source-pill">
                        {step.source === "forward-search"
                          ? "Forward match"
                          : step.retrosynthesisConfidence === "confirmed"
                            ? "Retro + forward verified"
                            : "Retro connectivity verified"}
                      </span>
                    </div>

                    <div className="reaction-three-column">
                      <div className="reaction-column">
                        <div className="reaction-svg-box reaction-component-box">
                          {(svgs?.reactants ?? []).map((svg, index) => (
                            <div
                              className="reaction-component-item"
                              key={`${step.id}-reactant-${index}`}
                            >
                              {index > 0 && (
                                <span className="reaction-component-plus">+</span>
                              )}
                              <div dangerouslySetInnerHTML={{ __html: svg }} />
                            </div>
                          ))}
                        </div>
                        <p>{step.reactantLabel}</p>
                      </div>

                      <div className="reaction-column reagent-column">
                        <div className="reagent-pill-group">
                          {(() => {
                            const labels = reagentBubbleLabels(
                              step.reagentLabel,
                              step.display?.reagentBubbleMode,
                            );
                            const showAlternativeSeparators =
                              labels.length > 1 &&
                              /\bor\b/i.test(step.reagentLabel) &&
                              !/\bthen\b/i.test(step.reagentLabel);

                            return labels.map((reagent, index) => (
                              <span
                                key={`${step.id}-reagent-wrap-${index}`}
                                style={{
                                  display: "contents",
                                }}
                              >
                                {index > 0 && showAlternativeSeparators && (
                                  <span
                                    aria-label="or"
                                    style={{
                                      fontSize: "0.78rem",
                                      fontWeight: 800,
                                      letterSpacing: "0.08em",
                                      opacity: 0.72,
                                    }}
                                  >
                                    OR
                                  </span>
                                )}
                                <div
                                  className="reagent-pill"
                                  key={`${step.id}-reagent-${index}`}
                                >
                                  {reagent}
                                </div>
                              </span>
                            ));
                          })()}
                        </div>
                        <span className="reaction-arrow">→</span>
                        <p>{step.reagentNote}</p>
                      </div>

                      <div className="reaction-column">
                        <div className="reaction-svg-box reaction-component-box">
                          {(svgs?.products ?? []).map((svg, index) => (
                            <div
                              className="reaction-component-item"
                              key={`${step.id}-product-${index}`}
                            >
                              {index > 0 && (
                                <span className="reaction-component-plus">+</span>
                              )}
                              <div dangerouslySetInnerHTML={{ __html: svg }} />
                            </div>
                          ))}
                        </div>
                        <p>{step.productMixture?.displayName ?? step.productLabel}</p>
                      </div>
                    </div>

                    {step.productMixture && (
                      <p className="reaction-detail">
                        <strong>Product mixture:</strong>{" "}
                        {step.productMixture.label} · {step.productMixture.memberCount}{" "}
                        stereoisomer{step.productMixture.memberCount === 1 ? "" : "s"} shown
                      </p>
                    )}

                    <p className="reaction-note">{step.shortExplanation}</p>
                    {(step.selectivityAssessment || step.selectivity.length > 0) && (
                      <p
                        className="reaction-detail"
                        title={step.selectivityAssessment?.basis}
                      >
                        <strong>Selectivity:</strong>{" "}
                        {step.selectivityAssessment
                          ? `${step.selectivityAssessment.label} · ${step.selectivityAssessment.basis.split(";")[0]}`
                          : step.selectivity.join(" · ")}
                      </p>
                    )}
                    {step.limitations.length > 0 && (
                      <p className="reaction-detail reaction-limitation">
                        <strong>Model note:</strong> {step.limitations.join(" ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            </>
            );
          })()}
        </div>
      ))}
    </section>
  );
}
