// Stage 9D Phase A: where does stereochemistry get lost or invented? Runs each probe through
// (1) the base engine (workspace/planner path) and (2) the Reactions-page layer, and prints both.
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";
const { utils } = await loadEngine();
const eng = await loadModule("/src/utils/reactions/engine/reactionEngine.ts");
const groups = await loadModule("/src/utils/functionalGroups/index.ts");
const B = String.fromCharCode(92);
const registry = utils.reactionRegistry;
const probes = [
  ["alkene-epoxidation", ["C/C=C/C", "C/C=C" + B + "C", "CC=CC", "C=CCC", "C1CCC=CC1", "c1ccccc1/C=C/c1ccccc1"]],
  ["alkene-halogenation-bromine", ["C/C=C/C", "C/C=C" + B + "C", "CC=CC", "C1CCC=CC1", "C=CCC"]],
  ["alkene-simmons-smith", ["C/C=C/C", "C/C=C" + B + "C", "C1CCC=CC1", "C=CCC"]],
  ["alkene-dichlorocyclopropanation", ["C/C=C/C", "C/C=C" + B + "C", "C1CCC=CC1"]],
  ["alkene-syn-dihydroxylation", ["C/C=C/C", "C/C=C" + B + "C", "C1CCC=CC1"]],
  ["alkene-anti-dihydroxylation", ["C/C=C/C", "C/C=C" + B + "C", "C1CCC=CC1"]],
  ["alkene-hx-addition-hbr", ["C=CCC", "CC=CC"]],
];
for (const [ruleId, subs] of probes) {
  const rule = registry.find((r) => r.id === ruleId);
  for (const s of subs) {
    const base = await eng.predictReactionPathwaysFromRules(s, [], [rule], { planning: true });
    const hier = await groups.analyzeFunctionalGroupHierarchy(s);
    const page = (await utils.predictReactionPathways(s, hier.primaryGroups)).filter((p) => p.ruleId === ruleId);
    const fmt = (list) => list.map((p) => `${p.productSmiles}${p.productMixture ? "{" + p.productMixture.kind + "/" + p.productMixture.memberCount + "}" : ""}`).join(" ; ") || "-";
    console.log(`${ruleId.padEnd(34)} ${s.padEnd(24)} BASE: ${fmt(base).padEnd(52)} PAGE: ${fmt(page)}`);
  }
}
await closeEngine(); process.exit(0);
