// Prints the display name the nomenclature module gives each SMILES. Usage: node nameProbe.mjs <smiles> [<smiles>...]
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
await loadEngine();
const groups = await loadModule("/src/utils/functionalGroups/index.ts");
const nom = await loadModule("/src/utils/nomenclatureUtils.ts");
for (const smi of process.argv.slice(2)) {
  const h = await groups.analyzeFunctionalGroupHierarchy(smi);
  const id = await nom.analyzeNomenclatureAndProperties(smi, h.primaryGroups, h.mainGroup);
  console.log(smi.padEnd(24), "=>", id.nomenclature.displayName || id.nomenclature.estimatedName);
}
await closeEngine(); process.exit(0);
