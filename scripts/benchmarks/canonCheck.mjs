import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
await loadEngine();
const stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
for (const s of process.argv.slice(2)) console.log(s, "=>", JSON.stringify(await stereo.canonicalizeStereoStructure(s)));
await closeEngine();
process.exit(0);
