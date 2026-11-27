import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
await loadEngine();
const stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
const isMeso = async (smiles) => {
  const c = await stereo.canonicalizeStereoStructure(smiles);
  const mirrored = c.isomeric.replace(/@@/g, "#").replace(/@/g, "@@").replace(/#/g, "@");
  const m = await stereo.canonicalizeStereoStructure(mirrored);
  return { canonical: c.isomeric, meso: m.isomeric === c.isomeric };
};
for (const s of process.argv.slice(2)) console.log(s, JSON.stringify(await isMeso(s)));
await closeEngine();
process.exit(0);
