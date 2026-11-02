// Stage 9E Phase D: finds products that carry a DEFINED tetrahedral stereocentre although every reactant is
// stereo-free and the pathway is not labelled as a mixture. For an achiral reaction that is an arbitrarily chosen
// absolute configuration (one enantiomer presented as the product).
// Usage: node scripts/benchmarks/inventedStereoAudit.mjs [--json out.json]
// Runs the Reactions-page layer over a corpus of simple substrates and every rule that applies to them.
import fs from "node:fs";
import { closeEngine, loadEngine, loadModule } from "../tests/engine.mjs";

const { utils } = await loadEngine();
const groups = await loadModule("/src/utils/functionalGroups/index.ts");
const stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
/** Meso/achiral: swapping every @ and @@ gives the same canonical structure. */
const isSelfMirror = async (smiles) => {
  const mirror = smiles.replace(/@@?/g, (tag) => (tag === "@" ? "@@" : "@"));
  const a = await stereo.canonicalizeStereoStructure(smiles);
  const b = await stereo.canonicalizeStereoStructure(mirror);
  return Boolean(a && b && a.isomeric === b.isomeric);
};

// Stereo-free substrates, one or two per functional class (multi-reactant rules are probed with the second reactant joined by ".").
const CORPUS = [
  "CC(=O)C", "CCC(=O)CC", "CC(=O)c1ccccc1", "O=Cc1ccccc1", "CCC=O", "C1CCC(=O)CC1",
  "CC(C)=O.[Mg+]C", "CC(=O)c1ccccc1.C[Mg]Br", "CCC=O.CC(C)=O",
  "CCC(C)=O", "CCC(C)=O.[Mg](Br)c1ccccc1", "CC=O.CC=O", "CC(C)=O.CC=O", "CCC=O.CCC=O", "C=CC(C)=O", "C=CC=O.C=CC=C", "C=CC=C.C=CC(=O)OC", "CC(=O)CC.[C-]#N",
  "C=CCC", "CC=CC", "C/C=C/C", "CC=C(C)C", "C1CCC=CC1", "C=C(C)CC", "c1ccccc1C=C",
  "CC#C", "C#CCC", "CC#CC",
  "CCC(C)Br", "CCC(C)O", "CC(O)c1ccccc1", "CCC(C)Cl", "CC(C)C(C)Br", "BrC1CCCCC1",
  "CC1CO1", "CC1OC1C", "C1CCC2OC2C1",
  "CCC(=O)OC", "CC(=O)Cl", "CCC(=O)O", "CC#N", "CCC(C)N", "CC(C)=NO",
  "Cc1ccccc1", "CCc1ccccc1", "c1ccccc1C(C)C",
  "OCC(O)C", "CC(O)CC(C)O", "CC(=O)CC(C)=O", "CC(=O)CCC=O",
  "C=CC=C", "CC=CC=C", "C1=CC=CC1",
];

const rows = [];
for (const smiles of CORPUS) {
  let pathways = [];
  try {
    const hierarchy = await groups.analyzeFunctionalGroupHierarchy(smiles.split(".")[0]);
    pathways = await utils.predictReactionPathways(smiles, hierarchy.primaryGroups);
  } catch (error) {
    console.log(`ERROR ${smiles}: ${error?.message ?? error}`);
    continue;
  }
  for (const pathway of pathways) {
    if (!pathway.productSmiles) continue;
    const tetra = /@/.test(pathway.productSmiles);
    if (!tetra) continue;
    const mixture = pathway.productMixture?.kind ?? null;
    rows.push({ substrate: smiles, ruleId: pathway.ruleId, product: pathway.productSmiles, mixture, members: pathway.productMixture?.memberSmiles?.length ?? 0, achiral: await isSelfMirror(pathway.productSmiles) });
  }
}

// Invented: no mixture label at all, or a label that lists fewer than two members for a chiral (non-meso) product.
const invented = rows.filter((row) => !row.achiral && (!row.mixture || row.members < 2));
const byRule = new Map();
for (const row of invented) {
  const list = byRule.get(row.ruleId) ?? [];
  list.push(row);
  byRule.set(row.ruleId, list);
}
console.log(`pathways with a defined stereocentre from stereo-free input: ${rows.length}; labelled mixture: ${rows.length - invented.length}; UNLABELLED: ${invented.length}`);
for (const [ruleId, list] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${ruleId.padEnd(46)} ${String(list.length).padStart(3)}  e.g. ${list[0].substrate} -> ${list[0].product}`);
}
const out = process.argv.indexOf("--json");
if (out > 0) fs.writeFileSync(process.argv[out + 1], JSON.stringify({ rows }, null, 1));
await closeEngine();
process.exit(0);
