// Boots the REAL PocketChem reaction engines under Node using only existing
// dependencies: Vite's SSR module loader (handles the project's TypeScript,
// extensionless imports and import.meta.env) plus the bundled local RDKit
// build in public/rdkit. No network access is used.
import { createServer } from "vite";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function installLocalRdkit() {
  const dir = path.join(root, "public", "rdkit");
  const file = path.join(dir, "RDKit_minimal.js");
  const source = fs.readFileSync(file, "utf8");
  // The emscripten build is a plain script that defines a global
  // `initRDKitModule`; evaluate it with the CommonJS context it expects.
  const init = new Function(
    "require",
    "__dirname",
    "__filename",
    `${source}\n;return initRDKitModule;`,
  )(createRequire(import.meta.url), dir, file);
  // src/utils/rdkit.ts reads window.initRDKitModule when a DOM is absent.
  globalThis.window = {
    initRDKitModule: () => init({ locateFile: (name) => path.join(dir, name) }),
  };
}

let serverPromise = null;

export async function loadEngine() {
  if (!serverPromise) {
    installLocalRdkit();
    // The app logs hundreds of classifier warnings on load; keep test output readable.
    const originalWarn = console.warn;
    const originalError = console.error;
    console.warn = () => {};
    console.error = () => {};
    serverPromise = createServer({
      root,
      configFile: path.join(root, "vite.config.ts"),
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: "custom",
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true },
    }).then(async (server) => {
      const utils = await server.ssrLoadModule("/src/utils/reactionUtils.ts");
      const regression = await server.ssrLoadModule(
        "/src/utils/reactions/regression/reactionRegression.ts",
      );
      const stereoRegression = await server.ssrLoadModule(
        "/src/utils/stereochemistry/regression.ts",
      );
      const stereo = await server.ssrLoadModule(
        "/src/utils/reactions/engine/stereochemistry.ts",
      );
      console.warn = originalWarn;
      console.error = originalError;
      return { server, utils, regression, stereoRegression, stereo };
    });
  }
  return serverPromise;
}

export async function loadModule(viteRelativePath) {
  const { server } = await loadEngine();
  return server.ssrLoadModule(viteRelativePath);
}

export async function getRdkit() {
  await loadEngine();
  return globalThis.window.initRDKitModule();
}

export async function closeEngine() {
  if (!serverPromise) return;
  const { server } = await serverPromise;
  await server.close();
  serverPromise = null;
}
