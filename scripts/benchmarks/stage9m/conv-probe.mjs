import { closeEngine, loadModule } from "../../tests/engine.mjs";
import { modules } from "../../tests/fixtures/convergentHelpers.mjs";
const jobs = JSON.parse(process.argv[2]);
const { registry } = await modules();
const syn = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts");
for (const { start, target, wall = 20000, copies = 1 } of jobs) {
  const t = Date.now();
  const res = await syn.findConvergentSynthesisRoutes(start, target, registry, { maxRoutes: 1, convergentSearch: { bidirectional: true, startingMaterialCopies: copies, maxWallMs: wall } });
  console.log(`\n== ${start} -> ${target} ${Date.now() - t}ms routes=${res.routes.length}`);
  const { routes, ...rest } = res;
  console.log(JSON.stringify(rest).slice(0, 1200));
  for (const s of (routes[0]?.steps ?? [])) console.log("  -", s.ruleId, "|", (s.reactantComponents ?? []).join(" + "), "=>", (s.productComponents ?? []).join(" + "));
}
await closeEngine();
