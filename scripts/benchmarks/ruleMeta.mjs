// Prints the selectivity-related metadata of registry rules. Usage: node scripts/benchmarks/ruleMeta.mjs id1,id2 | --summary
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
await loadEngine();
const { reactionRegistry } = await loadModule("/src/utils/reactionUtils.ts");
const arg = process.argv[2] ?? "--summary";
if (arg === "--summary") {
  const n = reactionRegistry.length;
  const c = (f) => reactionRegistry.filter(f).length;
  console.log(JSON.stringify({
    rules: n,
    withSelectivityProfile: c((r) => r.selectivityProfile),
    regioModes: Object.fromEntries([...new Set(reactionRegistry.map((r) => r.selectivityProfile?.regiochemistry?.mode ?? "none"))].map((m) => [m, c((r) => (r.selectivityProfile?.regiochemistry?.mode ?? "none") === m)])),
    mixture: Object.fromEntries([...new Set(reactionRegistry.map((r) => r.selectivityProfile?.mixture ?? "none"))].map((m) => [m, c((r) => (r.selectivityProfile?.mixture ?? "none") === m)])),
    majorProductOnly: c((r) => r.selectivityProfile?.majorProductOnly),
    withLimitations: c((r) => (r.limitations ?? []).length > 0),
    status: Object.fromEntries([...new Set(reactionRegistry.map((r) => r.productStatus ?? "computed"))].map((m) => [m, c((r) => (r.productStatus ?? "computed") === m)])),
  }, null, 1));
} else {
  for (const id of arg.split(",")) {
    const r = reactionRegistry.find((x) => x.id === id);
    console.log(id, JSON.stringify(r ? { status: r.productStatus, selectivity: r.selectivity, profile: r.selectivityProfile, limitations: r.limitations, competition: r.competition, transform: r.transform.type } : null, null, 1));
  }
}
await closeEngine();
process.exit(0);
