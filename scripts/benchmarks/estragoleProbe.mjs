// One-shot probe of the Deep-budget estragole search (p-cresol + bromomethane + acetylene) used by
// synthesisReliability L3: prints elapsed time, whether the 45 s abort fired, and the route's rules.
// Run it once per code state; do not loop it (memory-heavy).
import { closeEngine, loadModule } from "../tests/engine.mjs";
import { modules } from "../tests/fixtures/convergentHelpers.mjs";
const { registry } = await modules();
const synthesis = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts");
const ui = await loadModule("/src/utils/reactions/engine/searchOptionsFromUi.ts");
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 45000);
const started = Date.now();
const options = ui.buildSynthesisSearchOptions("deep", 45000, { convergent: false, bidirectional: false, copies: 1 }, { signal: controller.signal });
const routes = await synthesis.findMultistepSynthesisRoutesFromRules("Cc1ccc(O)cc1.CBr.C#C", "COc1ccc(CC=C)cc1", registry, options);
clearTimeout(timer);
console.log(JSON.stringify({
  ms: Date.now() - started,
  aborted: controller.signal.aborted,
  rssMB: Math.round(process.memoryUsage().rss / 1048576),
  routes: routes.map((r) => ({ status: r.verification?.status, rules: r.steps.map((s) => s.ruleId) })),
}));
await closeEngine();
process.exit(0);
