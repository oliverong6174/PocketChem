// Prints what the registry produces for one set of reactants (to inspect stereo and mixtures).
// Usage: node scripts/benchmarks/inspectStep.mjs "<smiles>[.<smiles>]" [ruleIdSubstring]
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";

const input = process.argv[2];
const filter = process.argv[3] ?? "";
await loadEngine();
const reactionUtils = await loadModule("/src/utils/reactionUtils.ts");
const groups = await loadModule("/src/utils/functionalGroups/index.ts");
const parts = input.split(".");
const hierarchy = parts.length === 1 ? await groups.analyzeFunctionalGroupHierarchy(input) : null;
const pathways = await reactionUtils.predictReactionPathways(input, hierarchy?.primaryGroups ?? []);
for (const p of pathways) {
  if (filter && !p.ruleId.includes(filter)) continue;
  console.log(JSON.stringify({
    rule: p.ruleId, reagents: p.reagentLabel, status: p.productStatus, product: p.productSmiles,
    components: p.productComponents, mixture: p.productMixture ? { kind: p.productMixture.kind, label: p.productMixture.label, members: p.productMixture.memberSmiles } : null,
    missing: (p.missingReactants ?? []).map((m) => m.label),
  }));
}
await closeEngine();
process.exit(0);
