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

const KetcherEditor = lazy(() => import("./KetcherEditor"));

export type KetcherApi = {
  getSmiles: () => Promise<string>;
  getMolfile: () => Promise<string>;
  getKet: () => Promise<string>;
  setMolecule: (structure: string) => Promise<void>;
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

type MoleculeDrawerProps = {
  onReady?: (ketcher: KetcherApi) => void;
  onChange?: () => void;
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
  globalKey = "ketcher",
}: MoleculeDrawerProps) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const apiRef = useRef<KetcherApi | null>(null);

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
  }, [globalKey, onReady]);

  return (
    <div className="ketcher-shell">
      {!ready && !failed && <div className="ketcher-badge loading">Loading</div>}

      <KetcherErrorBoundary onError={handleError}>
        <Suspense fallback={<KetcherLoadingState />}>
          <KetcherEditor
            debugLabel={globalKey}
            onChange={onChange}
            onError={handleError}
            onReady={handleReady}
          />
        </Suspense>
      </KetcherErrorBoundary>
    </div>
  );
}

export default MoleculeDrawer;
