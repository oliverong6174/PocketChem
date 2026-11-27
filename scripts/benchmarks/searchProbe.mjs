// Runs the adaptive synthesis search (15 s budget) for [[start, target], ...] given as JSON and prints the route rule ids.
// Usage: node scripts/benchmarks/searchProbe.mjs '[["CCO","CC=O"]]'
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
await loadEngine();
const { reactionRegistry } = await loadModule("/src/utils/reactionUtils.ts");
const run = await loadModule("/src/utils/reactions/engine/synthesisSearchRun.ts");
const cases = JSON.parse(process.argv[2]);
for (const [s, t] of cases) {
  const t0 = Date.now();
  const c = new run.SearchRunController({ rules: reactionRegistry, totalMs: 15000 });
  await c.start({ startingSmiles: s, targetSmiles: t, copies: 1 });
  const st = c.getState(); const r = st.ranked[0]?.route;
  console.log(`${s} -> ${t}: ${r ? r.steps.map((x) => x.ruleId).join(">") : st.outcome?.kind} (${Date.now() - t0}ms)`);
}
await closeEngine(); process.exit(0);
