import { closeEngine, loadModule } from "../../tests/engine.mjs";
import { modules, canonSet } from "../../tests/fixtures/convergentHelpers.mjs";
const targets = JSON.parse(process.argv[2]);
const { registry } = await modules();
const retro = await loadModule("/src/utils/reactions/engine/retroSynthesis.ts");
for (const target of targets) {
  const t = Date.now();
  const p = await retro.predictRetrosynthesisPathwaysFromRules(target, registry, { planning: true, maxResults: 36, maxTransformsExecuted: 28 });
  console.log(`\n== ${target} ${Date.now() - t}ms n=${p.length}`);
  for (const x of p) console.log(" ", x.ruleId, "<=", (await canonSet(x.precursorComponents)).join(" + "), `[${x.confidence}]`);
}
await closeEngine();
