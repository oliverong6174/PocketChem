import { loadEngine, loadModule, closeEngine } from "./engine.mjs";
await loadEngine();
const analysis = await loadModule("/src/utils/ranking/comparisonAnalysis.ts");
const groups = await loadModule("/src/utils/functionalGroups/index.ts");
const sets = JSON.parse(process.argv[3]);
for (const smi of sets) {
  const h = await groups.analyzeFunctionalGroupHierarchy(smi);
  const p = await analysis.analyzeComparisonMolecule(smi, h);
  const m = p.metrics[process.argv[2]];
  console.log(smi.padEnd(28), m.score, "|", m.headline, "|", JSON.stringify(m.sortVector));
}
await closeEngine();
