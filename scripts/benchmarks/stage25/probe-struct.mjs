import { closeEngine, loadModule } from "../../tests/engine.mjs";
const N = await loadModule("/src/utils/biochem/metabolism/network.ts");
const RD = await loadModule("/src/utils/rdkit.ts");
const rd = await RD.getRDKit();
const S18 = new Set(["glucose","g6p","f6p","f16bp","dhap","g3p","bpg13","pg3","pg2","pep","pyruvate","oaa","citrate","isocitrate","akg","succinate","fumarate","malate","co2","h2o","pi","o2"]);
for (const m of N.METABOLITES) {
  if (!m.structure || S18.has(m.id)) continue;
  const mol = rd.get_mol(m.structure.smiles);
  const ok = mol && mol.is_valid();
  let inchiF = "", labels = [];
  if (ok) { inchiF = mol.get_inchi().split("/")[1]; labels = (JSON.parse(mol.get_stereo_tags()).CIP_atoms ?? []).map((x) => x[1]); mol.delete(); }
  const flag = ok && inchiF === m.formula ? "ok " : "BAD";
  console.log(flag, m.id.padEnd(14), m.formula.padEnd(14), inchiF.padEnd(14), labels.join(","));
}
for (const [name, smi] of [["oleate", "CCCCCCCC/C=C\CCCCCCCC(=O)O"]]) { const mol = rd.get_mol(smi); console.log(name, mol.get_inchi().split("/")[1], JSON.stringify(JSON.parse(mol.get_stereo_tags()).CIP_bonds ?? JSON.parse(mol.get_stereo_tags()))); mol.delete(); }
await closeEngine();
