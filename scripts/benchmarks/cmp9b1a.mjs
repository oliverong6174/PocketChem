// Runtime and route comparison: 9A-0 baseline, 9B-1 and 9B-1A. Usage: node cmp9b1a.mjs
import fs from "node:fs";
const load = (p) => JSON.parse(fs.readFileSync(p, "utf8")).results;
const base = load("baseline/9a0/observed-results.json");
const b1 = load("results/9b1-after.json");
const b1a = load("results/9b1a-after.json");
const rules = (p) => (p.routes?.[0]?.steps ?? []).map((s) => s.ruleId).join(">");
for (const r of b1a) {
  const get = (set) => set.find((x) => x.id === r.id)?.planner;
  const row = (label, p) => p ? `${label.padEnd(7)} ${String(p.elapsedMs).padStart(6)} ms  routes=${p.routeCount}  ${p.outcome}  ${p.routes?.[0]?.verification ?? ""}  ${rules(p)}` : `${label.padEnd(7)} (not run)`;
  console.log(r.id);
  console.log("  " + row("9A-0", get(base)));
  console.log("  " + row("9B-1", get(b1)));
  console.log("  " + row("9B-1A", get(b1a)));
}
