// Prints what the Reactions-page layer returns for one drawn molecule and rule (stereo completion included).
// Usage: node scripts/benchmarks/pageProbe.mjs <smiles> <ruleId> [<ruleId> ...]
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
const { utils } = await loadEngine();
const groups = await loadModule("/src/utils/functionalGroups/index.ts");
const smiles = process.argv[2];
const hierarchy = await groups.analyzeFunctionalGroupHierarchy(smiles);
const all = await utils.predictReactionPathways(smiles, hierarchy.primaryGroups);
for (const id of process.argv.slice(3)) {
  const rows = all.filter((p) => p.ruleId === id);
  console.log(id, "->", rows.length ? rows.map((p) => `${p.productSmiles}${p.productMixture ? ` {${p.productMixture.kind}: ${(p.productMixture.memberSmiles ?? []).join(" + ")}}` : ""}`).join("  |  ") : "(none)");
}
await closeEngine(); process.exit(0);
