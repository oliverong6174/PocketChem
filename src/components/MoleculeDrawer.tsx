import { useEffect, useState } from "react";
import { Editor } from "ketcher-react";
import { StandaloneStructServiceProvider } from "ketcher-standalone";
import "ketcher-react/dist/index.css";

const structServiceProvider = new StandaloneStructServiceProvider();

export type KetcherApi = {
  getSmiles: () => Promise<string>;
  getMolfile: () => Promise<string>;
};

declare global {
  interface Window {
    ketcher?: KetcherApi;
    reactionKetcher?: KetcherApi;
  }
}

type MoleculeDrawerProps = {
  onReady?: (ketcher: KetcherApi) => void;
  globalKey?: "ketcher" | "reactionKetcher";
};

function MoleculeDrawer({
  onReady,
  globalKey = "ketcher",
}: MoleculeDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true);
    }, 300);

    return () => window.clearTimeout(timer);
  }, []);

  const handleError = (error: unknown) => {
    console.error("Ketcher error:", error);
  };

  return (
    <div className="ketcher-shell">
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
          }}
        />
      ) : (
        <div className="ketcher-wait">Preparing molecule editor...</div>
      )}
    </div>
  );
}

export default MoleculeDrawer;