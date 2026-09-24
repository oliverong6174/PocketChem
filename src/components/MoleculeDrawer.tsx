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
import { resolveMoleculeName, type MoleculeNameResolution } from "../utils/moleculeNameResolver";

const KetcherEditor = lazy(() => import("./KetcherEditor"));

export type KetcherApi = {
  getSmiles: () => Promise<string>;
  getMolfile: () => Promise<string>;
  getKet: () => Promise<string>;
  setMolecule: (structure: string) => Promise<void>;
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
  onChange,
  nameInputMode = "replace",
  onNameStructureApplied,
  onNameSubmitProcess,
  globalKey = "ketcher",
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
      const currentSmiles = (await api.getSmiles()).trim();
      const nextHasStructure = currentSmiles.length > 0;
      if (structureCheckVersionRef.current === checkVersion) {
        setHasStructure(nextHasStructure);
      }
      return nextHasStructure;
    } catch {
      // Ketcher can briefly reject serialization while an atom/bond edit is in
      // progress. Keep the previous state and let the next change event retry.
      return false;
    }
  }, []);

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
        if ((await api.getSmiles()).trim()) return;
      } catch {
        // Retry on the next browser turn.
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }, []);

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
      setNameMessage("Enter a common or IUPAC molecule name first.");
      return;
    }

    setIsResolvingName(true);
    setNameMessageKind("info");
    setNameMessage(`Resolving “${query}”…`);

    try {
      const resolution = await resolveMoleculeName(query);

      // Invalidate any previously imported identity before changing Ketcher.
      // Suppress the editor's own change event during this programmatic import;
      // onNameStructureApplied below installs the new authoritative resolution
      // after the imported graph is readable.
      onChange?.();
      suppressEditorChangeRef.current = true;

      if (action === "add") {
        if (api.addFragment) {
          await api.addFragment(resolution.smiles, { needZoom: true });
        } else {
          const current = (await api.getSmiles()).trim();
          await api.setMolecule(current ? `${current}.${resolution.smiles}` : resolution.smiles);
        }
      } else {
        await api.setMolecule(resolution.smiles);
      }

      await waitForReadableStructure(api);
      setHasStructure(true);
      const resolvedLabel = resolution.iupacName || resolution.title || resolution.query;
      const formulaSuffix = resolution.molecularFormula ? ` · ${resolution.molecularFormula}` : "";

      onNameStructureApplied?.(resolution, action);
      window.setTimeout(() => {
        suppressEditorChangeRef.current = false;
      }, 0);

      if (processAfterApply && onNameSubmitProcess) {
        setNameMessageKind("info");
        setNameMessage(`Loaded: ${resolvedLabel}${formulaSuffix} · Processing…`);
        try {
          await onNameSubmitProcess();
        } catch (processError) {
          console.error(`[PocketChem:NameInput:${globalKey}] automatic processing failed`, processError);
          setNameMessageKind("error");
          setNameMessage(`Loaded: ${resolvedLabel}${formulaSuffix} · Automatic processing failed.`);
          return;
        }
      }

      setNameMessageKind("success");
      setNameMessage(`${action === "add" ? "Added" : "Loaded"}: ${resolvedLabel}${formulaSuffix}`);
    } catch (error) {
      suppressEditorChangeRef.current = false;
      setNameMessageKind("error");
      setNameMessage(error instanceof Error ? error.message : "The molecule name could not be resolved.");
    } finally {
      setIsResolvingName(false);
    }
  }, [
    globalKey,
    isResolvingName,
    nameQuery,
    onChange,
    onNameStructureApplied,
    onNameSubmitProcess,
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
          <KetcherEditor
            debugLabel={globalKey}
            onChange={handleEditorChange}
            onError={handleError}
            onReady={handleReady}
          />
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
          <label htmlFor={`${globalKey}-molecule-name`}>Type a molecule name</label>
          <span>Common name or IUPAC name</span>
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
            placeholder="e.g. acetone or 2-methylpropan-2-ol"
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
