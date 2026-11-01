import fs from "node:fs";
const data = JSON.parse(fs.readFileSync(new URL("./results/multicatalytic-audit.json", import.meta.url), "utf8"));
for (const r of data.results) {
  console.log(`\n## ${r.id} L${r.level} ${r.title}`);
  const p = r.planner;
  if (!p) { console.log("  (no planner)"); continue; }
  if (p.skipped || p.error) { console.log("  ", p.skipped ?? p.error); continue; }
  console.log(`  outcome=${p.outcome} ${p.elapsedMs}ms first=${p.firstRouteAfterMs} routes=${p.routeCount}${p.finalIsMeso !== undefined ? ` meso=${p.finalIsMeso}` : ""}`);
  console.log(`  msg: ${String(p.outcomeMessage).slice(0, 200)}`);
  for (const route of p.routes.slice(0, 2)) {
    console.log(`  route ${route.stepCount} steps, verification=${route.verification}, targetMatch=${route.targetMatch}, finalVsTarget=${route.finalVsTarget}, compat=${route.compatibilityWorst}, unused=${JSON.stringify(route.unusedStartingMaterials)}, coproducts=${JSON.stringify(route.coproducts)}`);
    for (const s of route.steps) console.log(`    ${s.n}. [${s.ruleId}] ${s.reagents} :: ${s.reactants.join(" + ")} -> ${s.product}${s.introducedElements.length ? `  (+${s.introducedElements.join(",")})` : ""}${s.metalsInProduct.length ? ` METAL:${s.metalsInProduct}` : ""}${s.compatibility.length ? ` compat:${s.compatibility.join("|")}` : ""}`);
  }
}
