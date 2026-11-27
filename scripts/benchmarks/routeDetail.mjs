// Prints the selectivity and limitation metadata the planner attached to each step of the best route.
// Usage: node scripts/benchmarks/routeDetail.mjs "<starts joined by .>" "<target>" [budgetMs]
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
await loadEngine();
const { reactionRegistry } = await loadModule("/src/utils/reactionUtils.ts");
const runModule = await loadModule("/src/utils/reactions/engine/synthesisSearchRun.ts");
const controller = new runModule.SearchRunController({ rules: reactionRegistry, totalMs: Number(process.argv[4] ?? 15000) });
await controller.start({ startingSmiles: process.argv[2], targetSmiles: process.argv[3], copies: 1 });
const route = controller.getState().routes[0];
for (const s of route?.steps ?? []) {
  console.log(`${s.stepNumber}. ${s.ruleId}: ${s.reactantSmiles} -> ${s.productSmiles}`);
  console.log("   selectivity:", JSON.stringify(s.selectivity));
  console.log("   assessment:", JSON.stringify(s.selectivityAssessment ?? null).slice(0, 400));
  console.log("   limitations:", JSON.stringify(s.limitations));
  console.log("   mixture:", JSON.stringify(s.productMixture ? s.productMixture.kind : null), "status-conf:", s.retrosynthesisConfidence ?? null);
}
console.log("route compatibility:", JSON.stringify(route?.compatibility ?? null).slice(0, 300));
await closeEngine();
process.exit(0);
