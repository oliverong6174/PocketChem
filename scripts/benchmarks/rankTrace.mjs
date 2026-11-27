// Traces how the route book ranks routes as lanes report them (read-only).
// Usage: node scripts/benchmarks/rankTrace.mjs "<starts joined by .>" "<target>" <budgetMs>
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
await loadEngine();
const { reactionRegistry } = await loadModule("/src/utils/reactionUtils.ts");
const runModule = await loadModule("/src/utils/reactions/engine/synthesisSearchRun.ts");
const budget = Number(process.argv[4] ?? 15000);
const controller = new runModule.SearchRunController({ rules: reactionRegistry, totalMs: budget });
const t0 = Date.now();
let last = "";
let lastStage = "";
controller.subscribe((state) => {
  if (state.stage !== lastStage) { lastStage = state.stage; console.log(`+${Date.now() - t0}ms stage: ${state.stage}`); }
  const snapshot = state.ranked.map((r) => `#${r.order}[${r.lane}] tier${r.tier} len${r.adjustedLength} unassessed${r.unassessedSteps} disf${r.disfavoredSteps} unranked${r.unrankedSteps} compat:${r.compatibility} :: ${r.route.steps.map((s) => s.ruleId).join(" > ")}`).join("\n    ");
  if (snapshot && snapshot !== last) { last = snapshot; console.log(`+${Date.now() - t0}ms\n    ${snapshot}`); }
});
await controller.start({ startingSmiles: process.argv[2], targetSmiles: process.argv[3], copies: 1 });
const outcome = controller.getState().outcome;
console.log("final outcome:", outcome?.kind, "stop:", outcome?.stopReason ?? "", "lanes:", JSON.stringify((outcome?.lanes ?? outcome?.laneReports ?? []).map((l) => `${l.id}:${l.status}:${l.usedMs ?? ""}ms`)));
await closeEngine();
process.exit(0);
