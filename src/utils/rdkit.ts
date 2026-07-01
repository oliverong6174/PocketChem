declare global {
  interface Window {
    initRDKitModule?: () => Promise<any>;
  }
}

let RDKitModule: any | null = null;

export async function getRDKit() {
  if (RDKitModule) {
    return RDKitModule;
  }

  if (!window.initRDKitModule) {
    throw new Error("RDKit module is not loaded. Check public/index.html.");
  }

  RDKitModule = await window.initRDKitModule();

  return RDKitModule;
}