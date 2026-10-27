import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { type MoleculeNameResolution } from "../utils/moleculeNameResolver";
import { loadInputIntoEditor, resolveMoleculeInput } from "../utils/moleculeInput";
import { extractKetMolecules, type KetDocument } from "../utils/ketcherKet";

const KetcherEditor = lazy(() => import("./KetcherEditor"));
const IsolatedKetcherEditor = lazy(() => import("./IsolatedKetcherEditor"));

export type KetcherApi = {
  getSmiles: () => Promise<string>;
  getMolfile: () => Promise<string>;
  getKet: () => Promise<string>;
  setMolecule: (structure: string, options?: {
    position?: { x: number; y: number };
    needZoom?: boolean;
  }) => Promise<void>;
  addFragment?: (structure: string, options?: {
    position?: { x: number; y: number };
    needZoom?: boolean;
  }) => Promise<void>;
  editor?: {
    subscribe?: (eventName: string, handler: () => void) => unknown;
    unsubscribe?: (eventName: string, handler: () => void) => void;
  };
};

declare global {
  interface Window {
    ketcher?: KetcherApi;
    reactionKetcher?: KetcherApi;
    acidBaseKetcher?: KetcherApi;
    synthesisReactantKetcher?: KetcherApi;
    synthesisProductKetcher?: KetcherApi;
  }
}

export type MoleculeNameInputMode = "replace" | "add-or-replace";

type MoleculeDrawerProps = {
  onReady?: (ketcher: KetcherApi) => void;
  /** Called when a previously-ready isolated editor reloads/unmounts. */
  onNotReady?: () => void;
  onChange?: () => void;
  nameInputMode?: MoleculeNameInputMode;
  onNameStructureApplied?: (resolution: MoleculeNameResolution, action: "add" | "replace") => void;
  /**
   * Optional page-level action to run after a name is entered/replaced.
   * Use this for single-molecule pages whose normal workflow has one obvious
   * primary action (Analyze Molecule, Predict Spectra, etc.).
   */
  onNameSubmitProcess?: () => void | Promise<void>;
  /**
   * Optional debug/global handle. Synthesis can create dynamic additional
   * reactant editors, so this intentionally accepts a unique string key.
   */
  globalKey?: string;
  /** Reset the drawer-local name/input state without remounting Ketcher. */
  resetVersion?: number;
  /**
   * Host this editor in its own iframe document. Use this when multiple Ketcher
   * canvases are visible simultaneously so their global keyboard/selection
   * handlers cannot interfere with one another.
   */
  isolateEditor?: boolean;
  /**
   * Most disconnected molecules this editor accepts from text input (the synthesis target
   * takes one). Input with more components is rejected, never silently truncated, and Add is
   * refused when the editor already holds a structure.
   */
  maxComponents?: number;
  /**
   * Called after a name or SMILES has been loaded into the editor. Name loads suppress the
   * editor's own change events, so a page that mirrors the editor (workspace recovery) uses
   * this to know the content changed.
   */
  onStructureLoaded?: () => void;
};

type ErrorBoundaryProps = {
  children: ReactNode;
  onError: (error: unknown) => void;
};

type ErrorBoundaryState = { failed: boolean };

class KetcherErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError({ error, info });
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="ketcher-error" role="alert">
          The molecule editor could not load. Refresh the page and try again.
        </div>
      );
    }

    return this.props.children;
  }
}

function KetcherLoadingState() {
  return (
    <div className="ketcher-wait" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>Loading molecule editor…</span>
    </div>
  );
}

let activeKetcherScrollLocks = 0;
let originalFocus: typeof HTMLElement.prototype.focus | null = null;
let originalScrollIntoView: typeof Element.prototype.scrollIntoView | null = null;

const isInsideKetcherShell = (target: unknown) => {
  return target instanceof Element && Boolean(target.closest(".ketcher-shell"));
};

const installKetcherScrollLock = () => {
  if (activeKetcherScrollLocks === 0) {
    originalFocus = HTMLElement.prototype.focus;
    originalScrollIntoView = Element.prototype.scrollIntoView;

    HTMLElement.prototype.focus = function patchedFocus(options?: FocusOptions) {
      if (isInsideKetcherShell(this)) {
        const safeOptions =
          typeof options === "object" && options !== null
            ? { ...options, preventScroll: true }
            : { preventScroll: true };

        return originalFocus?.call(this, safeOptions);
      }

      return originalFocus?.call(this, options);
    };

    Element.prototype.scrollIntoView = function patchedScrollIntoView(
      arg?: boolean | ScrollIntoViewOptions
    ) {
      if (isInsideKetcherShell(this)) {
        return;
      }

      return originalScrollIntoView?.call(this, arg);
    };
  }

  activeKetcherScrollLocks += 1;

  return () => {
    activeKetcherScrollLocks -= 1;

    if (activeKetcherScrollLocks === 0) {
      if (originalFocus) {
        HTMLElement.prototype.focus = originalFocus;
      }

      if (originalScrollIntoView) {
        Element.prototype.scrollIntoView = originalScrollIntoView;
      }

      originalFocus = null;
      originalScrollIntoView = null;
    }
  };
};

function MoleculeDrawer({
  onReady,
  onNotReady,
  onChange,
  nameInputMode = "replace",
  onNameStructureApplied,
  onNameSubmitProcess,
  globalKey = "ketcher",
  resetVersion = 0,
  isolateEditor = false,
  maxComponents,
  onStructureLoaded,
}: MoleculeDrawerProps) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  const [isResolvingName, setIsResolvingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [nameMessageKind, setNameMessageKind] = useState<"success" | "error" | "info">("info");
  const [hasStructure, setHasStructure] = useState(false);
  const apiRef = useRef<KetcherApi | null>(null);
  const structureCheckVersionRef = useRef(0);
  const suppressEditorChangeRef = useRef(false);

  useEffect(() => {
    return installKetcherScrollLock();
  }, []);

  useEffect(() => {
    // Clear PocketChem's drawer-local UI state while keeping the initialized
    // Ketcher instance mounted. This avoids the large loading/blank-canvas flash
    // that occurs when a parent remounts the entire editor just to clear it.
    structureCheckVersionRef.current += 1;
    suppressEditorChangeRef.current = false;
    setNameQuery("");
    setIsResolvingName(false);
    setNameMessage(null);
    setNameMessageKind("info");
    setHasStructure(false);
  }, [resetVersion]);

  useEffect(() => {
    return () => {
      const globalKetchers = window as unknown as Record<
        string,
        KetcherApi | undefined
      >;
      if (globalKetchers[globalKey] === apiRef.current) {
        delete globalKetchers[globalKey];
      }
    };
  }, [globalKey]);


  const ketHasStructure = useCallback((ketText: string): boolean => {
    const trimmed = ketText.trim();
    if (!trimmed) return false;

    try {
      const document = JSON.parse(trimmed) as KetDocument;
      return extractKetMolecules(document).some(
        (molecule) => Array.isArray(molecule.atoms) && molecule.atoms.length > 0,
      );
    } catch {
      return false;
    }
  }, []);

  const handleError = useCallback((error: unknown) => {
    console.error(`[PocketChem:Ketcher:${globalKey}] drawer error`, error);
    setFailed(true);
  }, [globalKey]);

  const refreshHasStructure = useCallback(async (api: KetcherApi | null = apiRef.current) => {
    if (!api) {
      setHasStructure(false);
      return false;
    }

    const checkVersion = structureCheckVersionRef.current + 1;
    structureCheckVersionRef.current = checkVersion;

    try {
      // getKet() reads Ketcher's in-memory editor state and does not need the
      // standalone Indigo export worker. Calling getSmiles() on every keystroke
      // used to create avoidable worker contention between the two synthesis
      // editors.
      const currentKet = await api.getKet();
      const nextHasStructure = ketHasStructure(currentKet);
      if (structureCheckVersionRef.current === checkVersion) {
        setHasStructure(nextHasStructure);
      }
      return nextHasStructure;
    } catch {
      // Ketcher can briefly reject serialization while an atom/bond edit is in
      // progress. Keep the previous state and let the next change event retry.
      return false;
    }
  }, [ketHasStructure]);

  const handleEditorChange = useCallback(() => {
    void refreshHasStructure();
    if (!suppressEditorChangeRef.current) {
      onChange?.();
    }
  }, [onChange, refreshHasStructure]);

  const waitForReadableStructure = useCallback(async (api: KetcherApi) => {
    // setMolecule/addFragment resolve after import, but Ketcher's serialized
    // structure can lag the canvas by one browser turn. Wait briefly so an
    // automatic Analyze/Predict action reads the structure that was just entered.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        if (ketHasStructure(await api.getKet())) return;
      } catch {
        // Retry on the next browser turn.
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }, [ketHasStructure]);

  const handleEditorUnavailable = useCallback(() => {
    console.info(`[PocketChem:Ketcher:${globalKey}] drawer unavailable`);
    const previousApi = apiRef.current;
    apiRef.current = null;
    setReady(false);
    setHasStructure(false);

    const globalKetchers = window as unknown as Record<
      string,
      KetcherApi | undefined
    >;
    if (globalKetchers[globalKey] === previousApi) {
      delete globalKetchers[globalKey];
    }

    onNotReady?.();
  }, [globalKey, onNotReady]);

  const handleReady = useCallback((api: KetcherApi) => {
    console.info(`[PocketChem:Ketcher:${globalKey}] drawer ready`, {
      api,
      hasGetMolfile: typeof api.getMolfile === "function",
      hasGetKet: typeof api.getKet === "function",
      hasGetSmiles: typeof api.getSmiles === "function",
      hasSetMolecule: typeof api.setMolecule === "function",
    });
    apiRef.current = api;
    const globalKetchers = window as unknown as Record<
      string,
      KetcherApi | undefined
    >;
    globalKetchers[globalKey] = api;
    onReady?.(api);
    setFailed(false);
    setReady(true);
    void refreshHasStructure(api);
  }, [globalKey, onReady, refreshHasStructure]);


  const applyResolvedName = useCallback(async (
    action: "add" | "replace",
    processAfterApply = false,
  ) => {
    const api = apiRef.current;
    if (!api || isResolvingName) return;

    const query = nameQuery.trim();
    if (!query) {
      setNameMessageKind("error");
      setNameMessage("Enter a chemical name or SMILES first.");
      return;
    }
    if (action === "add" && maxComponents === 1 && hasStructure) {
      setNameMessageKind("error");
      setNameMessage("This editor holds a single molecule. Use Replace to change it; Add would create a second, disconnected molecule.");
      return;
    }

    setIsResolvingName(true);
    setNameMessageKind("info");
    setNameMessage(`Resolving “${query}”…`);

    try {
      // A chemical name (offline database) or a SMILES string (validated by RDKit). Ambiguous
      // or invalid input throws with an explanatory message before the editor is touched.
      const input = await resolveMoleculeInput(query, { maxComponents });

      // Invalidate any previously imported identity before changing Ketcher.
      // Suppress the editor's own change event during this programmatic import;
      // onNameStructureApplied below installs the new authoritative resolution
      // after the imported graph is readable.
      onChange?.();
      suppressEditorChangeRef.current = true;

      await loadInputIntoEditor(api, input, action);

      await waitForReadableStructure(api);
      setHasStructure(true);
      onStructureLoaded?.();
      const resolvedLabel = input.label;
      const noteSuffix = input.notes.length > 0 ? ` · ${input.notes.join(" ")}` : "";

      // Only a database name carries an identity to install; a SMILES is just a structure.
      if (input.nameResolution) onNameStructureApplied?.(input.nameResolution, action);
      window.setTimeout(() => {
        suppressEditorChangeRef.current = false;
      }, 0);

      if (processAfterApply && onNameSubmitProcess) {
        setNameMessageKind("info");
        setNameMessage(`Loaded: ${resolvedLabel} · Processing…`);
        try {
          await onNameSubmitProcess();
        } catch (processError) {
          console.error(`[PocketChem:NameInput:${globalKey}] automatic processing failed`, processError);
          setNameMessageKind("error");
          setNameMessage(`Loaded: ${resolvedLabel} · Automatic processing failed.`);
          return;
        }
      }

      setNameMessageKind("success");
      setNameMessage(`${action === "add" ? "Added" : "Loaded"}: ${resolvedLabel}${noteSuffix}`);
    } catch (error) {
      suppressEditorChangeRef.current = false;
      setNameMessageKind("error");
      setNameMessage(error instanceof Error ? error.message : "The molecule input could not be resolved.");
    } finally {
      setIsResolvingName(false);
    }
  }, [
    globalKey,
    isResolvingName,
    hasStructure,
    maxComponents,
    nameQuery,
    onChange,
    onNameStructureApplied,
    onNameSubmitProcess,
    onStructureLoaded,
    waitForReadableStructure,
  ]);

  const submitName = useCallback(() => {
    // The primary name action is Enter on an empty editor and Replace once a
    // structure exists. On single-molecule analysis pages it also runs the
    // page's normal primary analysis action. Reactions intentionally omit the
    // process callback because users may still be assembling multiple reactants.
    void applyResolvedName("replace", Boolean(onNameSubmitProcess));
  }, [applyResolvedName, onNameSubmitProcess]);


  return (
    <div className="molecule-drawer-stack">
      <div className="ketcher-shell">
      {!ready && !failed && <div className="ketcher-badge loading">Loading</div>}

      <KetcherErrorBoundary onError={handleError}>
        <Suspense fallback={<KetcherLoadingState />}>
          {isolateEditor ? (
            <IsolatedKetcherEditor
              debugLabel={globalKey}
              onChange={handleEditorChange}
              onError={handleError}
              onReady={handleReady}
              onUnavailable={handleEditorUnavailable}
            />
          ) : (
            <KetcherEditor
              debugLabel={globalKey}
              onChange={handleEditorChange}
              onError={handleError}
              onReady={handleReady}
            />
          )}
        </Suspense>
      </KetcherErrorBoundary>
      </div>

      <form
        className="molecule-name-input-panel"
        onSubmit={(event) => {
          event.preventDefault();
          submitName();
        }}
      >
        <div className="molecule-name-input-copy">
          <label htmlFor={`${globalKey}-molecule-name`}>Type a chemical name or SMILES</label>
          <span>Common name, IUPAC name or SMILES (start with “smiles:” to force SMILES)</span>
        </div>

        <div className="molecule-name-input-row">
          <input
            id={`${globalKey}-molecule-name`}
            className="molecule-name-input"
            type="text"
            value={nameQuery}
            onChange={(event) => {
              setNameQuery(event.target.value);
              setNameMessage(null);
            }}
            placeholder="Chemical name or SMILES"
            autoComplete="off"
            spellCheck={false}
            disabled={!ready || failed || isResolvingName}
          />

          {nameInputMode === "add-or-replace" && hasStructure && (
            <button
              className="secondary-button molecule-name-action"
              type="button"
              disabled={!ready || failed || isResolvingName || !nameQuery.trim()}
              onClick={() => void applyResolvedName("add")}
            >
              {isResolvingName ? "Resolving…" : "Add"}
            </button>
          )}

          <button
            className="secondary-button molecule-name-action"
            type="button"
            disabled={!ready || failed || isResolvingName || !nameQuery.trim()}
            onClick={submitName}
          >
            {isResolvingName ? "Resolving…" : hasStructure ? "Replace" : "Enter"}
          </button>
        </div>

        {nameMessage && (
          <p className={`molecule-name-message ${nameMessageKind}`} aria-live="polite">
            {nameMessage}
          </p>
        )}
      </form>
    </div>
  );
}

export default MoleculeDrawer;
