// What does the linear planner return for start/target, and does each candidate pass end-to-end replay?
// Usage: node scripts/benchmarks/routeTrace.mjs "<start>" "<target>" [budgetMs] [normal|deep]
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
await loadEngine();
const { reactionRegistry } = await loadModule("/src/utils/reactionUtils.ts");
const ms = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts");
const so = await loadModule("/src/utils/reactions/engine/searchOptionsFromUi.ts");
const budget = Number(process.argv[4] ?? 15000);
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), budget);
const options = so.buildSynthesisSearchOptions(process.argv[5] ?? "normal", budget, so.DEFAULT_ADVANCED_SETTINGS, { signal: controller.signal });
const t0 = Date.now();
const routes = await ms.searchLinearSynthesisRoutes(process.argv[2], process.argv[3], reactionRegistry, options);
clearTimeout(timer);
console.log(`returned ${routes.length} route(s) in ${Date.now() - t0} ms; aborted=${controller.signal.aborted}`);
for (const r of routes) {
  console.log("-", r.steps.map((s) => `${s.ruleId}: ${s.reactantSmiles}>>${s.productSmiles}`).join(" | "));
  console.log("  verification:", r.verification?.status, JSON.stringify(r.verification?.problems ?? []).slice(0, 400));
}
await closeEngine(); process.exit(0);
