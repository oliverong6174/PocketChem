import { closeEngine, loadModule } from "../../tests/engine.mjs";
import { modules } from "../../tests/fixtures/convergentHelpers.mjs";
const targets = JSON.parse(process.argv[2]);
const { registry } = await modules();
const retro = await loadModule("/src/utils/reactions/engine/retroSynthesis.ts");
const old = registry.filter((r) => !/^(wacker-tsuji|ring-closing|mitsunobu|benzilic|pinacol-coupling|ketonic|dieckmann)/.test(r.id));
console.log("rules", registry.length, "baseline", old.length);
for (const target of targets) {
  for (const [label, rules] of [["baseline", old], ["full", registry], ["baseline", old], ["full", registry]]) {
    const t = Date.now();
    const p = await retro.predictRetrosynthesisPathwaysFromRules(target, rules, { planning: true, maxResults: 36, maxTransformsExecuted: 28 });
    console.log(target, label, `${Date.now() - t}ms`, p.length);
  }
}
await closeEngine();
