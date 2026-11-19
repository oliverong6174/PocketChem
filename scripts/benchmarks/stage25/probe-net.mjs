import { closeEngine, loadModule } from "../../tests/engine.mjs";
const N = await loadModule("/src/utils/biochem/metabolism/network.ts");
const errs = N.validateNetwork();
console.log("validateNetwork problems:", errs.length); for (const e of errs.slice(0, 40)) console.log(" -", e);
await closeEngine();
