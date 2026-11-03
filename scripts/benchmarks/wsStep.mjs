// Runs one workspace step (the path the benchmark and the multi-catalytic page use): node wsStep.mjs <ruleId> <reactant> [<reactant>...]
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
const { utils } = await loadEngine();
const ws = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
const [ruleId, ...reactants] = process.argv.slice(2);
const created = await ws.createWorkspace(reactants);
if (!created.ok) { console.log("create failed:", created.problems); process.exit(0); }
const lotIds = created.workspace.pool.lots.map((l) => l.id);
const result = await ws.executeWorkspaceStep(created.workspace, { ruleId, lotIds }, utils.reactionRegistry);
console.log(ruleId, "status:", result.step.status, "| outcomes:", result.step.outcomes.map((o) => o.productSmiles).join(" ; ") || "-");
console.log("note:", JSON.stringify(result.step.diagnostics ?? result.step.message ?? result.step.reason ?? null).slice(0, 400));
await closeEngine(); process.exit(0);
