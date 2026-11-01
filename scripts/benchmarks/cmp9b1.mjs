// Before/after summary of planner results: 9A-0 baseline vs 9B-1 re-run. Usage: node cmp9b1.mjs
import fs from "node:fs";
const load = (p) => JSON.parse(fs.readFileSync(p, "utf8")).results;
const before = load("baseline/9a0/observed-results.json");
const after = load("results/9b1-after.json");
const sum = (p) => {
  if (!p) return "(none)";
  const best = p.best ?? p.routes?.[0] ?? null;
  return JSON.stringify({ keys: Object.keys(p), outcome: p.outcome ?? p.verdict, ms: p.elapsedMs ?? p.ms, best: best && (best.rules ?? best.ruleIds ?? best) }).slice(0, 700);
};
for (const a of after) {
  const b = before.find((x) => x.id === a.id);
  console.log(`${a.id}\n  before ${sum(b.planner)}\n  after  ${sum(a.planner)}`);
}
