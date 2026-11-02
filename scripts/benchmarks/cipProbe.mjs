// Prints canonical isomeric SMILES and CIP labels for each SMILES argument.
import { closeEngine, getRdkit, loadEngine, loadModule } from "../tests/engine.mjs";
await loadEngine();
const stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
const rd = await getRdkit();
for (const smi of process.argv.slice(2)) {
  const canon = (await stereo.canonicalizeStereoStructure(smi)).isomeric;
  const mol = rd.get_mol(smi);
  const tags = JSON.parse(mol.get_stereo_tags());
  mol.delete();
  console.log(smi.padEnd(34), "=>", canon.padEnd(30), (tags.CIP_atoms ?? []).map((a) => a[1]).join(" "));
}
await closeEngine(); process.exit(0);
