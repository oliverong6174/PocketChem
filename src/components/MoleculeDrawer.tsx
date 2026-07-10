import { useEffect, useRef, useState } from "react";
import { Editor } from "ketcher-react";
import { StandaloneStructServiceProvider } from "ketcher-standalone";
import "ketcher-react/dist/index.css";

const structServiceProvider = new StandaloneStructServiceProvider();

export type KetcherApi = {
  getSmiles: () => Promise<string>;
  getMolfile: () => Promise<string>;
  setMolecule: (structure: string) => Promise<void>;
};

declare global {
  interface Window {
    ketcher?: KetcherApi;
    reactionKetcher?: KetcherApi;
    acidBaseKetcher?: KetcherApi;
  }
}

type MoleculeDrawerProps = {
  onReady?: (ketcher: KetcherApi) => void;
  globalKey?: "ketcher" | "reactionKetcher" | "acidBaseKetcher";
};

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
  globalKey = "ketcher",
}: MoleculeDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return installKetcherScrollLock();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true);
    }, 300);

    return () => window.clearTimeout(timer);
  }, []);

  const scrollPageTopOnce = () => {
    const appScroller = shellRef.current?.closest(".app") as HTMLElement | null;

    appScroller?.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  const handleError = (error: unknown) => {
    console.error("Ketcher error:", error);
  };

  return (
    <div className="ketcher-shell" ref={shellRef}>
      {!ready && <div className="ketcher-badge loading">Ketcher Loading</div>}

      {mounted ? (
        <Editor
          staticResourcesUrl=""
          structServiceProvider={structServiceProvider}
          errorHandler={handleError}
          onInit={(ketcher) => {
            const api = ketcher as KetcherApi;

            window[globalKey] = api;
            onReady?.(api);

            setReady(true);

            requestAnimationFrame(() => {
              scrollPageTopOnce();
            });
          }}
        />
      ) : (
        <div className="ketcher-wait">Preparing molecule editor...</div>
      )}
    </div>
  );
}

export default MoleculeDrawer;