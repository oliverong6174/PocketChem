// Scratch tool: run a reaction SMARTS on SMILES inputs and print canonical products with CIP labels.
// Usage: node scripts/benchmarks/rxnExperiment.mjs '<smarts>' '<reactant>' ['<reactant2>' ...]
import { closeEngine, getRdkit, loadEngine, loadModule } from "../tests/engine.mjs";
await loadEngine();
const { runReactionSmarts } = await loadModule("/src/utils/reactions/engine/rdkitReaction.ts");
const stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
const rd = await getRdkit();
const [smarts, ...reactants] = process.argv.slice(2);
const out = await runReactionSmarts(reactants, smarts, 16);
for (const smi of out) {
  const canon = (await stereo.canonicalizeStereoStructure(smi)).isomeric;
  const m = rd.get_mol(smi); const tags = JSON.parse(m.get_stereo_tags()); m.delete();
  console.log(canon.padEnd(28), (tags.CIP_atoms ?? []).map((a) => a[1]).join(" "));
}
if (!out.length) console.log("(no products)");
await closeEngine(); process.exit(0);
