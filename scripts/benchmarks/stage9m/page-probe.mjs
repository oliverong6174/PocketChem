// Exploratory: run the SAME single-button search the Synthesis page runs (scheduler + engine lanes).
import { closeEngine, loadModule } from "../../tests/engine.mjs";
import { modules } from "../../tests/fixtures/convergentHelpers.mjs";
const jobs = JSON.parse(process.argv[2]);
const { registry } = await modules();
const run = await loadModule("/src/utils/reactions/engine/synthesisSearchRun.ts");
for (const { start, target, copies = 1 } of jobs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 47000);
  const t = Date.now();
  const result = await run.defaultSearchRunner({
    startingSmiles: start, targetSmiles: target, rules: registry, totalMs: 45000, copies,
    signal: controller.signal, isCurrent: () => true, onRoutes() {}, onStage() {}, onProgress() {}, onPlan() {},
  });
  clearTimeout(timer);
  console.log(`\n== ${start} -> ${target} ${Date.now() - t}ms verdict=${result.verdict} stop=${result.stopReason} routes=${result.routes.length}`);
  console.log(" lanes:", JSON.stringify(result.lanes.map((l) => [l.id ?? l.laneId, l.stoppedBy, l.elapsedMs ?? l.ms, l.routes ?? l.routeCount])));
  for (const rr of result.routes.slice(0, 1)) {
    const r = rr.route;
    console.log(" lane:", rr.lane, "| verification:", r.verification?.status);
    for (const s of r.steps) console.log("  -", s.ruleId, "|", (s.reactantComponents ?? []).join(" + "), "=>", (s.productComponents ?? []).join(" + "));
  }
}
await closeEngine();
