// public/ is copied into every build, so being git-ignored does not keep a restricted file out of dist/. This plugin
// removes restricted data from the output unless the build was explicitly asked for personal, noncommercial use.
import fs from "node:fs";
import path from "node:path";

/** Paths relative to the build output. The IUPAC pKa index is CC BY-NC 4.0 (see scripts/buildPkaReferenceIndex.mjs). */
export const RESTRICTED_DATA = ["data/pka-reference.index.json"];

/** The one mode that keeps the data: `vite build --mode personal` (npm run build:personal). */
export const PERSONAL_MODE = "personal";

export function restrictedData() {
  let config;
  return {
    name: "pocketchem-restricted-data",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = path.resolve(config.root, config.build.outDir);
      for (const relative of RESTRICTED_DATA) {
        const file = path.join(outDir, relative);
        if (!fs.existsSync(file)) continue;
        if (config.mode === PERSONAL_MODE) {
          config.logger.warn(`[pocketchem] Personal, noncommercial build: includes ${relative} (CC BY-NC 4.0, IUPAC). Do not distribute commercially.`);
        } else {
          fs.rmSync(file);
          config.logger.info(`[pocketchem] Excluded restricted data from the build: ${relative}`);
        }
      }
    },
  };
}
