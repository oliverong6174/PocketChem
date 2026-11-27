// Prints the planner's progress phases with timestamps (compressed) for start/target. Usage: node progressTrace.mjs start target [budgetMs]
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
await loadEngine();
const { reactionRegistry } = await loadModule("/src/utils/reactionUtils.ts");
const ms = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts");
const so = await loadModule("/src/utils/reactions/engine/searchOptionsFromUi.ts");
const budget = Number(process.argv[4] ?? 15000);
const controller = new AbortController();
setTimeout(() => controller.abort(), budget);
const options = so.buildSynthesisSearchOptions("normal", budget, so.DEFAULT_ADVANCED_SETTINGS, { signal: controller.signal });
const t0 = Date.now(); let last = "", count = 0;
const flush = () => { if (last) console.log(`  x${count} ${last}`); };
await ms.searchLinearSynthesisRoutes(process.argv[2], process.argv[3], reactionRegistry, options, (p) => {
  const key = `${p.phase} d${p.depth}`;
  if (key !== last) { flush(); last = key; count = 0; console.log(`[${String(Date.now() - t0).padStart(5)}ms] ${key} total=${p.total} cand=${p.candidateCount}`); }
  count += 1;
});
flush();
console.log(`finished at ${Date.now() - t0} ms, aborted=${controller.signal.aborted}`);
await closeEngine(); process.exit(0);
