// Exploratory: run the real planner and print the steps it finds.
import { closeEngine, loadModule } from "../../tests/engine.mjs";
import { modules } from "../../tests/fixtures/convergentHelpers.mjs";
const jobs = JSON.parse(process.argv[2]);
const { registry } = await modules();
const synthesis = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts");
const ui = await loadModule("/src/utils/reactions/engine/searchOptionsFromUi.ts");
for (const job of jobs) {
  const { start, target, convergent = false, copies = 1, effort = "deep" } = job;
  const a = new AbortController();
  const timer = setTimeout(() => a.abort(), 45000);
  const t = Date.now();
  const options = ui.buildSynthesisSearchOptions(effort, 45000, { convergent, bidirectional: convergent, copies }, { signal: a.signal });
  const routes = await synthesis.findMultistepSynthesisRoutesFromRules(start, target, registry, options);
  clearTimeout(timer);
  console.log(`\n== ${start} -> ${target} [${effort}${convergent ? ", convergent" : ""}] ${Date.now() - t}ms aborted=${a.signal.aborted} routes=${routes.length}`);
  for (const r of routes.slice(0, 1)) {
    console.log(" verification:", r.verification?.status, "| confidence:", r.confidence);
    for (const s of r.steps) console.log("  -", s.ruleId, "|", s.reactantSmiles ?? s.reactants ?? "", "=>", s.productSmiles ?? s.product ?? "");
  }
}
await closeEngine();
