// Inventory of the reaction registry: how catalysts and reagents are represented.
// Read-only; loads the real registry through the same Node harness the tests use.
import { loadEngine, loadModule, closeEngine } from "../tests/engine.mjs";

await loadEngine();
const { reactionRegistry } = await loadModule("/src/utils/reactionUtils.ts");

const catalystWords = /\b(Pd|Pt|Ni|Rh|Ru|Cu|Fe|Zn|Lindlar|Raney|catalyst|catalytic|AlCl3|FeBr3|FeCl3|H2SO4|H3O\+|acid|TsOH|HgSO4|OsO4|MnO2|PCC|PDC|base catalyst|cat\.)/i;
const rows = reactionRegistry.map((rule) => ({
  id: rule.id,
  family: rule.family,
  reagents: rule.reagents,
  transform: rule.transform.type,
  additional: (rule.additionalReactants ?? []).map((r) => r.label),
  hasConditions: Boolean(rule.conditions),
  catalystLike: catalystWords.test(rule.reagents),
  status: rule.productStatus ?? "computed",
}));

const summary = {
  rules: rows.length,
  transformTypes: Object.fromEntries([...new Set(rows.map((r) => r.transform))].map((t) => [t, rows.filter((r) => r.transform === t).length])),
  catalystLikeReagentText: rows.filter((r) => r.catalystLike).length,
  withAdditionalStructuralReactants: rows.filter((r) => r.additional.length > 0).length,
  withConditionMetadata: rows.filter((r) => r.hasConditions).length,
  hasCatalystField: reactionRegistry.some((rule) => "catalyst" in rule || "catalysts" in rule),
  roleCatalystUsedByRules: reactionRegistry.flatMap((rule) => (rule.additionalReactants ?? []).filter((r) => r.role === "catalyst").map(() => rule.id)),
  productStatusCounts: Object.fromEntries([...new Set(rows.map((r) => r.status))].map((s) => [s, rows.filter((r) => r.status === s).length])),
};
console.log(JSON.stringify(summary, null, 2));
console.log("--- catalyst-like reagent strings (sample) ---");
for (const r of rows.filter((x) => x.catalystLike).slice(0, 40)) console.log(`${r.id} | ${r.reagents} | extra: ${r.additional.join("; ") || "-"}`);
console.log("--- rules with additional structural reactants ---");
for (const r of rows.filter((x) => x.additional.length > 0)) console.log(`${r.id} | ${r.reagents} | + ${r.additional.join("; ")}`);
await closeEngine();
process.exit(0);
