// Stage 9E Phase D: does the Reactions page distinguish (E)- from (Z)-alkenes? For every rule that gives a defined
// stereo-product for one geometry, compare the stereoisomer sets from the E and Z alkene. Identical sets for the two
// geometries mean the geometry was ignored, which is wrong for a stereospecific addition (the two geometries give
// different diastereomers whenever the product has two stereocentres that are not meso-related).
// Usage: node scripts/benchmarks/geometryAudit.mjs
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
const { utils } = await loadEngine();
const groups = await loadModule("/src/utils/functionalGroups/index.ts");
const stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
const BS = String.fromCharCode(92);
const PAIRS = [
  ["2-butene", "C/C=C/C", "C/C=C" + BS + "C"],
  ["2-pentene", "CC/C=C/C", "CC/C=C" + BS + "C"],
  ["3-methylpent-2-ene", "C/C=C(" + BS + "C)CC", "C/C=C(/C)CC"],
  ["2,3-dimethylpent-2-ene... tetra", "CC(C)=C(C)CC", "CC(C)=C(C)CC"],
];
const canonSet = async (pathways) => {
  const out = new Map();
  for (const p of pathways) {
    if (!p.productSmiles) continue;
    const members = p.productMixture?.memberSmiles?.length ? p.productMixture.memberSmiles : [p.productSmiles];
    const canon = [];
    for (const m of members) canon.push((await stereo.canonicalizeStereoStructure(m)).isomeric);
    const key = (await stereo.canonicalizeStereoStructure(p.productSmiles)).connectivity;
    out.set(key, [...new Set([...(out.get(key) ?? []), ...canon])].sort().join(" + "));
  }
  return out;
};
const run = async (smiles) => {
  const h = await groups.analyzeFunctionalGroupHierarchy(smiles);
  const all = await utils.predictReactionPathways(smiles, h.primaryGroups);
  const byRule = new Map();
  for (const p of all) byRule.set(p.ruleId, [...(byRule.get(p.ruleId) ?? []), p]);
  return byRule;
};
for (const [name, e, z] of PAIRS) {
  if (e === z) continue;
  const [re, rz] = [await run(e), await run(z)];
  const bad = [];
  let checked = 0;
  for (const [ruleId, pe] of re) {
    const pz = rz.get(ruleId);
    if (!pz) continue;
    const [se, sz] = [await canonSet(pe), await canonSet(pz)];
    for (const [key, valE] of se) {
      const valZ = sz.get(key);
      if (valZ === undefined || !/@/.test(valE)) continue;
      checked += 1;
      if (valE === valZ) bad.push(`${ruleId}: ${valE}`);
    }
  }
  console.log(`${name}: ${checked} stereo-defined product groups compared; identical for E and Z: ${bad.length}`);
  for (const line of bad) console.log("   SAME", line);
}
await closeEngine(); process.exit(0);
