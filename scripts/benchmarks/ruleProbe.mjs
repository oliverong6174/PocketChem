// Prints the products (and selectivity labels) one rule gives for each substrate.
// Usage: node scripts/benchmarks/ruleProbe.mjs <ruleId> <smiles> [<smiles> ...]   (joined reactants with ".")
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
await loadEngine();
const { reactionRegistry } = await loadModule("/src/utils/reactionUtils.ts");
const eng = await loadModule("/src/utils/reactions/engine/reactionEngine.ts");
const rule = reactionRegistry.find((r) => r.id === process.argv[2]);
if (!rule) throw new Error("unknown rule " + process.argv[2]);
for (const smi of process.argv.slice(3)) {
  const out = await eng.predictReactionPathwaysFromRules(smi, [], [rule], { planning: true });
  console.log(smi, "->", out.length ? out.map((p) => `${p.productSmiles}${p.selectivityAssessment ? ` [${p.selectivityAssessment.level}]` : ""}${p.productMixture ? ` {${p.productMixture.kind}}` : ""}`).join("  |  ") : "(none)");
}
await closeEngine(); process.exit(0);
