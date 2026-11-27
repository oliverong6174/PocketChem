import { closeEngine, loadModule } from "../../tests/engine.mjs";
const N = await loadModule("/src/utils/biochem/metabolism/network.ts");
const F = await loadModule("/src/utils/biochem/metabolism/fuel.ts");
const bad = [];
for (const r of N.REACTIONS) {
  if (r.tags?.includes("transport")) continue;
  const l = F.reactionLedgers(r);
  if (l.carbon.net !== 0 && !(l.carbon.net === 0)) bad.push(`${r.id} C ${l.carbon.net}`);
  if (Math.abs(l.nitrogen.net) > 1e-9) bad.push(`${r.id} N ${l.nitrogen.net}`);
}
console.log("imbalances:", bad.length, bad.slice(0, 30));
console.log("shared", F.sharedMetabolites().join(","));
console.log(JSON.stringify(F.substrateComparison().map(r => [r.id, r.atp, +r.atpPerCarbon.toFixed(2)])));
console.log(JSON.stringify(F.acetylCoaSources()));
for (const p of Object.keys(N.PATHWAYS)) { const l = F.pathwayLedger(p); console.log(p, l.unit, JSON.stringify(l.ledgers)); }
await closeEngine();
