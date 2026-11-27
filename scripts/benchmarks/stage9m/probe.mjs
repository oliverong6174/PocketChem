// Exploratory probe: run one rule on drawn reactants and print canonical isomeric products.
import { closeEngine } from "../../tests/engine.mjs";
import { modules, canon } from "../../tests/fixtures/convergentHelpers.mjs";
const cases = JSON.parse(process.argv[2]);
const { engine, registry } = await modules();
for (const [ruleId, reactants] of cases) {
  const rule = registry.find((r) => r.id === ruleId);
  if (!rule) { console.log(ruleId, "UNKNOWN RULE"); continue; }
  const t = Date.now();
  const p = await engine.predictReactionPathwaysFromRules(reactants, [], [rule], { planning: true });
  const out = [];
  for (const x of p.filter((y) => y.productSmiles)) out.push((await Promise.all(x.productSmiles.split(".").map(canon))).join(" . "));
  console.log(ruleId, "|", reactants, "=>", out.length ? [...new Set(out)].join("  ||  ") : "(none)", `(${Date.now() - t}ms)`);
}
await closeEngine();
