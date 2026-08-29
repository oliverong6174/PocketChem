declare global {
  interface Window {
    initRDKitModule?: () => Promise<any>;
  }
}

let RDKitModule: any | null = null;
let RDKitLoadPromise: Promise<any> | null = null;

function loadRDKitScript(): Promise<void> {
  if (window.initRDKitModule) {
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-pocketchem-rdkit="true"]',
  );
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(
        "Failed to load RDKit_minimal.js. Check that public/rdkit/RDKit_minimal.js exists."
      )), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${import.meta.env.BASE_URL}rdkit/RDKit_minimal.js`;
    script.async = true;
    script.dataset.pocketchemRdkit = "true";
    script.onload = () => {
      if (window.initRDKitModule) {
        resolve();
      } else {
        reject(new Error(
          "RDKit_minimal.js loaded but did not expose initRDKitModule."
        ));
      }
    };
    script.onerror = () => reject(new Error(
      `Failed to load RDKit_minimal.js from ${script.src}. Check the public/rdkit files.`
    ));
    document.head.appendChild(script);
  });
}

export async function getRDKit() {
  if (RDKitModule) {
    return RDKitModule;
  }

  if (!RDKitLoadPromise) {
    RDKitLoadPromise = (async () => {
      await loadRDKitScript();

      if (!window.initRDKitModule) {
        throw new Error(
          "RDKit module is not available after loading RDKit_minimal.js."
        );
      }

      return window.initRDKitModule();
    })();
  }

  RDKitModule = await RDKitLoadPromise;
  return RDKitModule;
}
