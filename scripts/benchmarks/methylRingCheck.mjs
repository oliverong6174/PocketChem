// Ground truth by construction for 1-methylcyclohexene products: take the validated cyclohexane relative configuration and replace the
// implicit H on C1 by methyl (the methyl takes the H's neighbour slot, so the geometry is unchanged). Compare member sets.
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
const { utils } = await loadEngine();
const groups = await loadModule("/src/utils/functionalGroups/index.ts");
const stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
const canon = async (s) => (await stereo.canonicalizeStereoStructure(s)).isomeric;
const mirror = (s) => s.replace(/@@?/g, (t) => (t === "@" ? "@@" : "@"));
const REF = {
  "alkene-syn-dihydroxylation": "O[C@@](C)1CCCC[C@@H]1O",     // from cis  O[C@@H]1CCCC[C@@H]1O (faces: same)
  "alkene-anti-dihydroxylation": "O[C@@](C)1CCCC[C@H]1O",     // from trans O[C@@H]1CCCC[C@H]1O (faces: opposite)
  "alkene-halogenation-bromine": "Br[C@@](C)1CCCC[C@H]1Br",   // from trans dibromide
  "alkene-halohydrin-formation": "O[C@@](C)1CCCC[C@H]1Br",    // OH on the more substituted carbon, trans
};
const smiles = "CC1=CCCCC1";
const hierarchy = await groups.analyzeFunctionalGroupHierarchy(smiles);
const all = await utils.predictReactionPathways(smiles, hierarchy.primaryGroups);
for (const [rule, ref] of Object.entries(REF)) {
  const p = all.find((x) => x.ruleId === rule);
  const members = p.productMixture?.memberSmiles?.length ? p.productMixture.memberSmiles : [p.productSmiles];
  const allowed = new Set([await canon(ref), await canon(mirror(ref))]);
  const got = await Promise.all(members.map(canon));
  console.log(rule.padEnd(30), got.every((g) => allowed.has(g)) && got.length === 2 ? "MATCH (racemic pair of the expected relative configuration)" : `MISMATCH members=${got.join(" ")} expected=${[...allowed].join(" ")}`);
}
await closeEngine(); process.exit(0);
