import { useEffect, useState } from "react";
import { Editor } from "ketcher-react";
import { StandaloneStructServiceProvider } from "ketcher-standalone";
import "ketcher-react/dist/index.css";

const structServiceProvider = new StandaloneStructServiceProvider();

type KetcherApi = {
  getSmiles: () => Promise<string>;
};

declare global {
  interface Window {
    ketcher?: KetcherApi;
  }
}

function MoleculeDrawer() {
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
      <div className={ready ? "ketcher-badge ready" : "ketcher-badge loading"}>
        {ready ? "Ketcher Ready" : "Ketcher Loading"}
      </div>

      {mounted ? (
        <Editor
          staticResourcesUrl=""
          structServiceProvider={structServiceProvider}
          errorHandler={handleError}
          onInit={(ketcher) => {
            console.log("KETCHER INIT FIRED:", ketcher);
            window.ketcher = ketcher as KetcherApi;
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