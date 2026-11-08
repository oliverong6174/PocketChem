import { closeEngine } from "../../tests/engine.mjs";
import { modules } from "../../tests/fixtures/convergentHelpers.mjs";
const inputs = JSON.parse(process.argv[2]);
const { engine, registry } = await modules();
const timeRule = {};
for (const input of inputs) {
  for (let i = 0; i < 2; i += 1) {
    const t = Date.now();
    const p = await engine.predictReactionPathwaysFromRules(input, [], registry, { planning: true });
    console.log(input, `run${i}`, `${Date.now() - t}ms`, p.length);
  }
}
await closeEngine();
