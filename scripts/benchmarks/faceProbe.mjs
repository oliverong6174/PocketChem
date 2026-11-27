// For ring products of the Reactions page: are the two heteroatom substituents on adjacent ring carbons on the SAME or OPPOSITE face?
// Usage: node scripts/benchmarks/faceProbe.mjs <smiles> <ruleId> [<ruleId> ...]
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
const { utils } = await loadEngine();
const groups = await loadModule("/src/utils/functionalGroups/index.ts");
const stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
const smiles = process.argv[2];
const hierarchy = await groups.analyzeFunctionalGroupHierarchy(smiles);
const all = await utils.predictReactionPathways(smiles, hierarchy.primaryGroups);
const query = { smarts: "[N,O,Cl,Br,I;!R]-[C;R]-[C;R]-[N,O,Cl,Br,I;!R]", firstBond: [0, 1], secondBond: [3, 2] };
for (const id of process.argv.slice(3)) {
  for (const p of all.filter((x) => x.ruleId === id)) {
    const members = p.productMixture?.memberSmiles?.length ? p.productMixture.memberSmiles : [p.productSmiles];
    const faces = [];
    for (const m of members) faces.push(await stereo.relativeSubstituentFace(m, query));
    console.log(id.padEnd(30), p.productSmiles.padEnd(34), "faces:", faces.join(","));
  }
}
await closeEngine(); process.exit(0);
