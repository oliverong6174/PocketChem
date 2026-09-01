import { useEffect, useRef, useState } from "react";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import {
  analyzeFunctionalGroupHierarchy,
  getMoleculeSvg,
  getRDKit,
} from "../utils/functionalGroups";
import { analyzeNomenclatureAndProperties } from "../utils/nomenclatureUtils";
import {
  findMultistepSynthesisRoutes,
  splitReactionComponents,
  type MultistepSynthesisProgress,
  type MultistepSynthesisRoute,
  type SynthesisStep,
} from "../utils/reactionUtils";

type StepSvgSet = {
  reactants: string[];
  products: string[];
};

type RouteSvgMap = Record<string, StepSvgSet>;

const KETCHER_READ_TIMEOUT_MS = 8000;

type KetAtom = {
  label?: string;
  location?: number[];
  charge?: number;
  isotope?: number;
  radical?: number;
};

type KetBond = {
  type?: number;
  atoms?: number[];
  stereo?: number;
};

type KetMolecule = {
  type?: string;
  atoms?: KetAtom[];
  bonds?: KetBond[];
};

type KetDocument = {
  root?: {
    nodes?: Array<Record<string, unknown>>;
  };
  [key: string]: unknown;
};

function v3000AtomLabel(label: string | undefined): string {
  const normalized = (label ?? "C").trim();
  if (!normalized) return "C";
  if (normalized === "R" || normalized === "R#" || /^R\d+$/.test(normalized)) {
    return "*";
  }
  return normalized;
}

function v3000BondType(type: number | undefined): number {
  return type === 2 || type === 3 || type === 4 ? type : 1;
}

function v3000BondCfg(stereo: number | undefined): string {
  // Ketcher uses 1=up, 4=either and 6=down for the common stereo bonds.
  if (stereo === 1) return " CFG=1";
  if (stereo === 4) return " CFG=2";
  if (stereo === 6) return " CFG=3";
  return "";
}

function ketMoleculeToV3000(molecule: KetMolecule): string | null {
  const atoms = Array.isArray(molecule.atoms) ? molecule.atoms : [];
  const bonds = Array.isArray(molecule.bonds) ? molecule.bonds : [];
  if (atoms.length === 0) return null;

  const atomLines = atoms.map((atom, index) => {
    const location = Array.isArray(atom.location) ? atom.location : [];
    const x = Number.isFinite(location[0]) ? Number(location[0]) : 0;
    const y = Number.isFinite(location[1]) ? Number(location[1]) : 0;
    const z = Number.isFinite(location[2]) ? Number(location[2]) : 0;
    const properties: string[] = [];

    if (Number.isFinite(atom.charge) && atom.charge !== 0) {
      properties.push(`CHG=${Math.trunc(atom.charge as number)}`);
    }
    if (Number.isFinite(atom.isotope) && (atom.isotope as number) > 0) {
      properties.push(`MASS=${Math.trunc(atom.isotope as number)}`);
    }
    if (
      Number.isFinite(atom.radical) &&
      (atom.radical as number) >= 1 &&
      (atom.radical as number) <= 3
    ) {
      properties.push(`RAD=${Math.trunc(atom.radical as number)}`);
    }

    return `M  V30 ${index + 1} ${v3000AtomLabel(atom.label)} ${x} ${y} ${z} 0${
      properties.length ? ` ${properties.join(" ")}` : ""
    }`;
  });

  const bondLines = bonds.flatMap((bond, index) => {
    if (!Array.isArray(bond.atoms) || bond.atoms.length < 2) return [];
    const begin = bond.atoms[0];
    const end = bond.atoms[1];
    if (!Number.isInteger(begin) || !Number.isInteger(end)) return [];
    if (begin < 0 || end < 0 || begin >= atoms.length || end >= atoms.length) return [];

    return [
      `M  V30 ${index + 1} ${v3000BondType(bond.type)} ${begin + 1} ${end + 1}${v3000BondCfg(
        bond.stereo,
      )}`,
    ];
  });

  return [
    "PocketChem",
    "  Ketcher KET export",
    "",
    "  0  0  0  0  0  0            999 V3000",
    "M  V30 BEGIN CTAB",
    `M  V30 COUNTS ${atoms.length} ${bondLines.length} 0 0 0`,
    "M  V30 BEGIN ATOM",
    ...atomLines,
    "M  V30 END ATOM",
    "M  V30 BEGIN BOND",
    ...bondLines,
    "M  V30 END BOND",
    "M  V30 END CTAB",
    "M  END",
  ].join("\n");
}

function extractKetMolecules(ket: KetDocument): KetMolecule[] {
  const molecules: KetMolecule[] = [];
  const seenRefs = new Set<string>();
  const nodes = Array.isArray(ket.root?.nodes) ? ket.root?.nodes ?? [] : [];

  for (const node of nodes) {
    const ref = typeof node?.$ref === "string" ? node.$ref : null;
    if (!ref || seenRefs.has(ref)) continue;
    seenRefs.add(ref);
    const candidate = ket[ref];
    if (
      candidate &&
      typeof candidate === "object" &&
      (candidate as KetMolecule).type === "molecule"
    ) {
      molecules.push(candidate as KetMolecule);
    }
  }

  // Defensive fallback for KET documents that omit root references.
  if (molecules.length === 0) {
    for (const candidate of Object.values(ket)) {
      if (
        candidate &&
        typeof candidate === "object" &&
        (candidate as KetMolecule).type === "molecule"
      ) {
        molecules.push(candidate as KetMolecule);
      }
    }
  }

  return molecules;
}

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
        components.push(smiles.trim());
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

function progressLabel(progress: MultistepSynthesisProgress): string {
  if (progress.phase === "forward") {
    return "Exploring forward pathways…";
  }

  if (progress.phase === "retrosynthesis") {
    return "Working backward from the target…";
  }

  return "Checking the shortest route connections…";
}

function progressPercent(progress: MultistepSynthesisProgress): number {
  const depthRatio = Math.min(1, Math.max(0, progress.depth / progress.maxSteps));
  const phaseOffset =
    progress.phase === "forward" ? 0 : progress.phase === "retrosynthesis" ? 5 : 10;
  return Math.min(95, Math.round(20 + depthRatio * 65 + phaseOffset));
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

export default function SynthesisPage() {
  const [reactantKetcher, setReactantKetcher] = useState<KetcherApi | null>(null);
  const [productKetcher, setProductKetcher] = useState<KetcherApi | null>(null);
  const [routes, setRoutes] = useState<MultistepSynthesisRoute[]>([]);
  const [routeSvgs, setRouteSvgs] = useState<RouteSvgMap>({});
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState(
    "Draw starting materials and a target product to begin.",
  );
  const [error, setError] = useState<string | null>(null);
  const [startingSmiles, setStartingSmiles] = useState("");
  const [targetSmiles, setTargetSmiles] = useState("");
  const [startingNames, setStartingNames] = useState<string[]>([]);
  const [targetName, setTargetName] = useState("");
  const [searchProgress, setSearchProgress] = useState(0);
  const searchRunRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [editorResetVersion, setEditorResetVersion] = useState(0);

  const editorsReady = Boolean(reactantKetcher && productKetcher);

  useEffect(() => {
    return () => {
      searchRunRef.current += 1;
      searchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function buildRouteSvgs() {
      const next: RouteSvgMap = {};

      for (const route of routes) {
        for (const step of route.steps) {
          const key = `${route.id}--step-${step.stepNumber}`;
          const [reactants, products] = await Promise.all([
            Promise.all(
              step.reactantComponents.map((component) =>
                getMoleculeSvg(component),
              ),
            ),
            Promise.all(
              step.productComponents.map((component) => getMoleculeSvg(component)),
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
        setError(`Draw ${label} before searching.`);
        setStatus("Draw the missing structure and try again.");
        return null;
      }

      const smiles = await ketToSmiles(ketText, label, runId);
      if (!smiles) {
        setError(`PocketChem could not interpret ${label}.`);
        setStatus("Could not convert the drawn structures.");
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

      setError(
        timedOut
          ? `Ketcher took too long to read ${label}. Try the search again.`
          : `PocketChem could not read ${label}. Check the structure and try again.`,
      );
      setStatus("Could not read the structures from Ketcher.");
      return null;
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  }

  async function findSynthesis() {
    if (!reactantKetcher || !productKetcher || isSearching) return;

    const runId = searchRunRef.current + 1;
    searchRunRef.current = runId;
    searchAbortRef.current?.abort();
    const searchController = new AbortController();
    searchAbortRef.current = searchController;
    const prefix = `[PocketChem:Synthesis #${runId}]`;
    console.groupCollapsed(`${prefix} Find Synthesis`);
    console.info(`${prefix} search requested`, {
      reactantKetcher,
      productKetcher,
      sameEditorObject: reactantKetcher === productKetcher,
      windowReactantMatches:
        window.synthesisReactantKetcher === reactantKetcher,
      windowProductMatches: window.synthesisProductKetcher === productKetcher,
      windowEditorsSame:
        window.synthesisReactantKetcher === window.synthesisProductKetcher,
    });
    setIsSearching(true);
    setError(null);
    setRoutes([]);
    setRouteSvgs({});
    setStartingNames([]);
    setTargetName("");
    setSearchProgress(3);
    setStatus("Reading the starting materials and target product…");

    try {
      setStatus("Reading starting materials…");
      const start = await readEditorSmiles(
        reactantKetcher,
        "the starting materials",
        runId,
      );
      if (!start || searchRunRef.current !== runId || searchController.signal.aborted) return;
      setSearchProgress(8);

      // Read the Ketcher instances one at a time. Concurrent getSmiles() calls can
      // leave one embedded editor waiting indefinitely in some browser sessions.
      setStatus("Reading target product…");
      const target = await readEditorSmiles(
        productKetcher,
        "the target product",
        runId,
      );
      if (!target || searchRunRef.current !== runId || searchController.signal.aborted) return;
      setSearchProgress(14);

      console.info(`${prefix} both Ketcher reads completed`, { start, target });
      setStatus("Naming structures and preparing the search…");

      const startingComponents = splitReactionComponents(start);
      const targetComponents = splitReactionComponents(target);
      console.info(`${prefix} reaction components parsed`, {
        startingComponents,
        targetComponents,
      });

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

      const [resolvedStartingNames, resolvedTargetName] = await Promise.all([
        Promise.all(startingComponents.map((component) => moleculeDisplayName(component))),
        moleculeDisplayName(targetComponents[0]),
      ]);
      if (searchRunRef.current !== runId || searchController.signal.aborted) return;
      setStartingNames(resolvedStartingNames);
      setTargetName(resolvedTargetName);
      setSearchProgress(20);
      setStatus("Searching for the shortest synthesis…");

      console.info(`${prefix} starting multistep synthesis engine`, {
        combinedStart,
        target: targetComponents[0],
        beamWidth: 14,
        branchLimit: 28,
        maxRoutes: 1,
      });

      const results = await findMultistepSynthesisRoutes(
        combinedStart,
        targetComponents[0],
        {
          beamWidth: 14,
          branchLimit: 28,
          maxRoutes: 1,
          signal: searchController.signal,
        },
        (progress) => {
          if (searchRunRef.current === runId) {
            console.debug(`${prefix} search progress`, progress);
            setStatus(progressLabel(progress));
            setSearchProgress((current) =>
              Math.max(current, progressPercent(progress)),
            );
          }
        },
      );

      if (searchRunRef.current !== runId || searchController.signal.aborted) return;
      setSearchProgress(100);
      console.info(`${prefix} synthesis engine finished`, {
        routeCount: results.length,
        routes: results,
      });
      setRoutes(results);

      if (results.length === 0) {
        setStatus("No verified route was found with the reactions PocketChem currently knows.");
      } else if (results[0].steps.length === 0) {
        setStatus("A supplied starting material already matches the target product.");
      } else {
        const shortest = results[0].steps.length;
        setStatus(
          `Shortest verified route found: ${shortest} step${shortest === 1 ? "" : "s"}.`,
        );
      }
    } catch (searchError) {
      console.error(`${prefix} multistep synthesis search failed`, searchError);
      if (searchRunRef.current === runId) {
        setError(
          "The synthesis search failed while evaluating reaction pathways. Check the structures and try again.",
        );
        setStatus("Synthesis search failed.");
      }
    } finally {
      console.info(`${prefix} search run finished`, {
        stillCurrentRun: searchRunRef.current === runId,
      });
      console.groupEnd();
      if (searchAbortRef.current === searchController) {
        searchAbortRef.current = null;
      }
      if (searchRunRef.current === runId) setIsSearching(false);
    }
  }

  function cancelSynthesisSearch() {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    searchRunRef.current += 1;
    setIsSearching(false);
    setSearchProgress(0);
    setStatus("Synthesis search cancelled.");
  }

  function clearSynthesis() {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    searchRunRef.current += 1;
    setIsSearching(false);
    setError(null);
    setRoutes([]);
    setRouteSvgs({});
    setStartingSmiles("");
    setTargetSmiles("");
    setStartingNames([]);
    setTargetName("");
    setSearchProgress(0);
    setStatus("Resetting molecule editors…");

    // Do not use setMolecule("") as a clear operation. setMolecule is an
    // import API and Ketcher attempts to fit/transform the imported structure;
    // an empty structure can leave the canvas in a bad zoom/tool state.
    // Remounting gives each drawer a genuinely fresh Ketcher canvas and also
    // clears any active rotate/select/pointer interaction.
    setReactantKetcher(null);
    setProductKetcher(null);
    setEditorResetVersion((version) => version + 1);
    setStatus("Draw starting materials and a target product to begin.");
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
              key={`synthesis-reactant-${editorResetVersion}`}
              globalKey="synthesisReactantKetcher"
              onReady={setReactantKetcher}
            />
          </div>
        </div>

        <div className="card synthesis-drawer-card">
          <div className="synthesis-drawer-header">
            <h2>Target Product</h2>
          </div>
          <div className="synthesis-ketcher-box">
            <MoleculeDrawer
              key={`synthesis-product-${editorResetVersion}`}
              globalKey="synthesisProductKetcher"
              onReady={setProductKetcher}
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
              disabled={!editorsReady || isSearching}
              onClick={() => void findSynthesis()}
              type="button"
            >
              {isSearching ? "Searching…" : "Find Synthesis"}
            </button>
            <button
              className="secondary-button"
              disabled={!editorsReady}
              onClick={() =>
                isSearching ? cancelSynthesisSearch() : clearSynthesis()
              }
              type="button"
            >
              {isSearching ? "Cancel" : "Clear"}
            </button>
          </div>
        </div>

        {isSearching && (
          <div
            className="synthesis-loading-track"
            role="progressbar"
            aria-label="Synthesis search progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(searchProgress)}
          >
            <div
              className="synthesis-loading-fill"
              style={{ width: `${Math.max(4, searchProgress)}%` }}
            />
          </div>
        )}

        {error && <p className="reaction-detail reaction-limitation synthesis-error">{error}</p>}

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
              <p className="label">Shortest route</p>
              <h2>
                {route.steps.length === 0
                  ? "A starting material already matches target"
                  : `${route.steps.length}-step synthesis`}
              </h2>
            </div>
            <span className="status ready">
              {route.confidence === "verified"
                ? "Structure verified"
                : "Connectivity verified"}
            </span>
          </div>

          {route.steps.length > 0 && (
            <div className="synthesis-step-list">
              {route.steps.map((step) => {
                const svgKey = `${route.id}--step-${step.stepNumber}`;
                const svgs = routeSvgs[svgKey];

                return (
                  <div className="synthesis-step-card" key={step.id}>
                    <div className="reaction-card-heading">
                      <div>
                        <p className="synthesis-step-label">Step {step.stepNumber}</p>
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
                        <div className="reagent-pill">{step.reagentLabel}</div>
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
                        <p>{step.productLabel}</p>
                      </div>
                    </div>

                    <p className="reaction-note">{step.shortExplanation}</p>
                    {step.selectivity.length > 0 && (
                      <p className="reaction-detail">
                        <strong>Selectivity:</strong> {step.selectivity.join(" · ")}
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
          )}
        </div>
      ))}
    </section>
  );
}
