// Lists the outcomes (with mixture annotation) a workspace step offers. Usage: node wsOutcomes.mjs <ruleId> <reactant> [<reactant>...]
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
const { utils } = await loadEngine();
const ws = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
const [ruleId, ...reactants] = process.argv.slice(2);
const created = await ws.createWorkspace(reactants);
const lotIds = created.workspace.pool.lots.map((l) => l.id);
const result = await ws.executeWorkspaceStep(created.workspace, { ruleId, lotIds }, utils.reactionRegistry);
console.log("status:", result.step.status, "| outcomes:", result.step.outcomes.length);
for (const o of result.step.outcomes) console.log("  ", o.productSmiles, "| mixture:", JSON.stringify(o.productMixture ? { kind: o.productMixture.kind, members: o.productMixture.memberSmiles } : null), "| class:", o.selectivity?.class ?? o.class ?? "");
await closeEngine(); process.exit(0);
