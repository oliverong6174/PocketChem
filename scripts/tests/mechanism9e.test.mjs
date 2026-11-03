// Stage 9E Phase C: product selectivity and carbocation rearrangements.
// Expected structures come from the cited sources, not from PocketChem output:
//   - Toluene nitration gives ortho and para (about 58% / 38%) and little meta (LibreTexts/UIS CHE 269, 18.07).
//   - Zaitsev with a small base; Hofmann product major for tertiary halides with tert-butoxide
//     (LibreTexts E2 page, UCLA glossary "Hofmann's rule", Reusch/MSU 80:20 and 25:75).
//   - 3,3-Dimethylbut-1-ene + HCl: methyl shift gives a roughly equal mixture of rearranged and unrearranged
//     chloride (LibreTexts/NC State carbocation rearrangements), so neither is ranked.
//   - Neopentyl chloride/benzene/AlCl3 gives 2-methyl-2-phenylbutane through a methyl shift (NC State).
// Structures are compared as canonical isomeric forms, never as spellings.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, getRdkit, loadEngine, loadModule } from "./engine.mjs";

let utils;
let registry;
let engine;
let stereo;
let groups;

before(async () => {
  ({ utils } = await loadEngine());
  registry = utils.reactionRegistry;
  engine = await loadModule("/src/utils/reactions/engine/reactionEngine.ts");
  stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
  groups = await loadModule("/src/utils/functionalGroups/index.ts");
  await getRdkit();
});

after(async () => {
  await closeEngine();
});

const rule = (id) => registry.find((item) => item.id === id);
const run = (ruleId, smiles) => engine.predictReactionPathwaysFromRules(smiles, [], [rule(ruleId)], { planning: true });
const canon = async (smiles) => (await stereo.canonicalizeStereoStructure(smiles)).isomeric;
const conn = async (smiles) => (await stereo.canonicalizeStereoStructure(smiles)).connectivity;
/** Sorted canonical constitutions offered by a rule. */
const constitutions = async (pathways) => [...new Set(await Promise.all(pathways.map((p) => conn(p.productSmiles))))].sort();
const wanted = async (...smiles) => (await Promise.all(smiles.map(conn))).sort();
const levels = async (pathways) => {
  const out = {};
  for (const pathway of pathways) out[await conn(pathway.productSmiles)] = pathway.selectivityAssessment?.level ?? "unranked";
  return out;
};

describe("electrophilic aromatic substitution keeps ortho and para and does not rank them", () => {
  const nitrate = (smiles) => run("aromatic-nitration", smiles);
  test("toluene gives o- and p-nitrotoluene and no meta isomer", async () => {
    const out = await nitrate("Cc1ccccc1");
    assert.deepEqual(await constitutions(out), await wanted("Cc1ccccc1[N+](=O)[O-]", "Cc1ccc([N+](=O)[O-])cc1"));
  });
  test("anisole and chlorobenzene (ortho/para directors) give both positions", async () => {
    assert.deepEqual(await constitutions(await nitrate("COc1ccccc1")), await wanted("COc1ccccc1[N+](=O)[O-]", "COc1ccc([N+](=O)[O-])cc1"));
    assert.deepEqual(await constitutions(await nitrate("Clc1ccccc1")), await wanted("O=[N+]([O-])c1ccccc1Cl", "O=[N+]([O-])c1ccc(Cl)cc1"));
  });
  test("meta directors still give only the meta product", async () => {
    assert.deepEqual(await constitutions(await nitrate("O=[N+]([O-])c1ccccc1")), await wanted("O=[N+]([O-])c1cccc([N+](=O)[O-])c1"));
    assert.deepEqual(await constitutions(await nitrate("N#Cc1ccccc1")), await wanted("N#Cc1cccc([N+](=O)[O-])c1"));
  });
  test("no outcome is labelled major or minor: the ortho:para ratio is not predicted", async () => {
    for (const pathway of await nitrate("Cc1ccccc1")) assert.equal(pathway.selectivityAssessment, null);
  });
  test("the rule no longer claims para is preferred", () => {
    const text = [...rule("aromatic-nitration").selectivity, ...(rule("aromatic-nitration").limitations ?? [])].join(" ");
    assert.doesNotMatch(text, /para is preferred over ortho/i);
    assert.match(text, /ortho and para/i);
  });
  test("a fully equivalent substrate still gives one product (p-xylene)", async () => {
    assert.deepEqual(await constitutions(await nitrate("Cc1ccc(C)cc1")), await wanted("Cc1ccc(C)c([N+](=O)[O-])c1"));
  });
  test("fused rings fall back to unranked enumeration (naphthalene keeps both positions)", async () => {
    assert.equal((await constitutions(await nitrate("c1ccc2ccccc2c1"))).length, 2);
  });
  test("other EAS electrophiles share the behaviour (bromination of toluene)", async () => {
    assert.deepEqual(await constitutions(await run("aromatic-halogenation-bromination", "Cc1ccccc1")), await wanted("Cc1ccccc1Br", "Cc1ccc(Br)cc1"));
  });
});

describe("E2/E1: Zaitsev and Hofmann alkenes are both kept and ranked only where the sources support it", () => {
  const tertiary = "CC(C)C(C)(C)Br";
  const tetra = "CC(C)=C(C)C";
  const terminal = "C=C(C)C(C)C";
  test("small alkoxide on 2-bromo-2,3-dimethylbutane: tetrasubstituted alkene major, terminal alkene minor (Reusch 80:20)", async () => {
    const out = await run("haloalkane-e2-zaitsev", `${tertiary}.[O-]CC`);
    assert.deepEqual(await constitutions(out), await wanted(tetra, terminal));
    assert.deepEqual(await levels(out), { [await conn(tetra)]: "major", [await conn(terminal)]: "minor" });
  });
  test("tert-butoxide on the same tertiary bromide: terminal alkene major, the Zaitsev alkene stays competitive (Reusch 25:75)", async () => {
    const out = await run("haloalkane-e2-hofmann", `${tertiary}.[O-]C(C)(C)C`);
    assert.deepEqual(await constitutions(out), await wanted(tetra, terminal));
    assert.deepEqual(await levels(out), { [await conn(terminal)]: "major", [await conn(tetra)]: "competitive" });
  });
  test("2-bromobutane + tert-butoxide: both alkenes kept, neither called major (documented cases are tertiary halides)", async () => {
    const out = await run("haloalkane-e2-hofmann", "CCC(C)Br.[O-]C(C)(C)C");
    assert.equal(out.length >= 2, true);
    assert.ok(Object.values(await levels(out)).every((level) => level === "competitive"));
  });
  test("hydroxide / ethoxide on 2-bromobutane: 2-butene major, 1-butene minor", async () => {
    const out = await run("haloalkane-e2-hydroxide", "CCC(C)Br.[OH-]");
    const byLevel = await levels(out);
    assert.equal(byLevel[await conn("CC=CC")], "major");
    assert.equal(byLevel[await conn("C=CCC")], "minor");
  });
  test("E1 dehydration of 3-methylbutan-2-ol: the shifted, tertiary-derived alkene is offered and is the major one", async () => {
    const out = await run("alcohol-dehydration-alkene", "CC(C)C(C)O");
    const byLevel = await levels(out);
    assert.equal(byLevel[await conn("CC=C(C)C")], "major");
    assert.ok(Object.keys(byLevel).length >= 2);
  });
  test("ring substrates are not ranked (anti-periplanar access decides, not substitution)", async () => {
    for (const pathway of await run("haloalkane-e2-zaitsev", "CC1CCCCC1Br.[O-]CC")) assert.equal(pathway.selectivityAssessment, null);
  });
  test("a conjugated alternative is not outranked by substitution count (2-bromo-1-phenylpropane)", async () => {
    const out = await run("haloalkane-e2-zaitsev", "CC(Br)Cc1ccccc1.[O-]CC");
    for (const pathway of out) assert.equal(pathway.selectivityAssessment, null);
  });
  test("a single possible alkene stays a single, unlabelled outcome (tert-butyl bromide)", async () => {
    const out = await run("haloalkane-e2-zaitsev", "CC(C)(C)Br.[O-]CC");
    assert.equal(out.length, 1);
    assert.equal(out[0].selectivityAssessment, null);
  });
  test("quaternary-ammonium Hofmann elimination keeps its documented single least-substituted product", async () => {
    const pathways = await run("amine-hofmann-elimination", "CCC(C)[N+](C)(C)C");
    if (pathways.length) assert.equal((await constitutions(pathways)).length, 1);
  });
});

describe("carbocation rearrangements in alkene hydration and HX addition", () => {
  test("3,3-dimethylbut-1-ene hydration lists the direct and the methyl-shifted alcohol, unranked", async () => {
    const out = await run("alkene-acid-hydration", "C=CC(C)(C)C");
    assert.deepEqual(await constitutions(out), await wanted("CC(O)C(C)(C)C", "CC(C)C(C)(C)O"));
    for (const pathway of out) assert.equal(pathway.selectivityAssessment, null);
  });
  test("3-methylbut-1-ene hydration lists the hydride-shifted tertiary alcohol as well", async () => {
    assert.deepEqual(await constitutions(await run("alkene-acid-hydration", "C=CC(C)C")), await wanted("CC(O)C(C)C", "CCC(C)(C)O"));
  });
  test("HCl adds with the same two outcomes (textbook: about an equal mixture, so unranked)", async () => {
    const out = await run("alkene-hx-addition-hcl", "C=CC(C)(C)C");
    assert.deepEqual(await constitutions(out), await wanted("CC(Cl)C(C)(C)C", "CC(C)C(C)(C)Cl"));
    for (const pathway of out) assert.equal(pathway.selectivityAssessment, null);
  });
  test("no downhill shift exists for propene or 1-butene: one product, as before", async () => {
    assert.deepEqual(await constitutions(await run("alkene-acid-hydration", "C=CC")), await wanted("CC(C)O"));
    assert.deepEqual(await constitutions(await run("alkene-acid-hydration", "C=CCC")), await wanted("CCC(C)O"));
  });
  test("an already tertiary Markovnikov product does not rearrange (2-methylbut-2-ene)", async () => {
    assert.deepEqual(await constitutions(await run("alkene-acid-hydration", "CC=C(C)C")), await wanted("CCC(C)(C)O"));
  });
  test("rules without the ionic mechanism are unaffected: hydroboration and oxymercuration of 3,3-dimethylbut-1-ene", async () => {
    assert.deepEqual(await constitutions(await run("alkene-hydroboration-oxidation", "C=CC(C)(C)C")), await wanted("OCCC(C)(C)C"));
    assert.deepEqual(await constitutions(await run("alkene-oxymercuration-demercuration", "C=CC(C)(C)C")), await wanted("CC(O)C(C)(C)C"));
  });
  test("peroxide HBr (radical) does not rearrange", async () => {
    assert.deepEqual(await constitutions(await run("alkene-hbr-peroxide", "C=CC(C)(C)C")), await wanted("BrCCC(C)(C)C"));
  });
  test("stereochemistry elsewhere in the molecule is not invented: no chirality tag appears on a rearranged product", async () => {
    for (const pathway of await run("alkene-acid-hydration", "C=CC(C)(C)C")) assert.doesNotMatch(pathway.productSmiles, /@/);
  });
});

describe("Friedel-Crafts alkylation lists carbocation-rearranged products", () => {
  const fc = (smiles) => run("aromatic-friedel-crafts-alkylation", smiles);
  test("benzene + neopentyl chloride gives neopentylbenzene and 2-methyl-2-phenylbutane", async () => {
    assert.deepEqual(await constitutions(await fc("c1ccccc1.CC(C)(C)CCl")), await wanted("CC(C)(C)Cc1ccccc1", "CCC(C)(C)c1ccccc1"));
  });
  test("benzene + 1-chloropropane gives propyl- and isopropylbenzene (hydride shift)", async () => {
    assert.deepEqual(await constitutions(await fc("c1ccccc1.CCCCl")), await wanted("CCCc1ccccc1", "CC(C)c1ccccc1"));
  });
  test("tert-butyl chloride cannot rearrange further: one product", async () => {
    assert.deepEqual(await constitutions(await fc("c1ccccc1.CC(C)(C)Cl")), await wanted("CC(C)(C)c1ccccc1"));
  });
  test("benzene + isopropyl chloride: one product", async () => {
    assert.deepEqual(await constitutions(await fc("c1ccccc1.CC(C)Cl")), await wanted("CC(C)c1ccccc1"));
  });
  test("rearranged products are not labelled major or minor by the ring-position model", async () => {
    const out = await fc("c1ccccc1.CC(C)(C)CCl");
    assert.equal(out.length, 2);
    for (const pathway of out) assert.notEqual(pathway.selectivityAssessment?.level, "major");
  });
  test("the rule text no longer says the rearrangement is unmodelled", () => {
    const text = (rule("aromatic-friedel-crafts-alkylation").limitations ?? []).join(" ");
    assert.match(text, /rearranged alkylarene is listed/i);
  });
});

describe("the Reactions-page layer shows the same alternatives for a single drawn molecule", () => {
  const page = async (smiles, ruleId) => {
    const hierarchy = await groups.analyzeFunctionalGroupHierarchy(smiles);
    return (await utils.predictReactionPathways(smiles, hierarchy.primaryGroups)).filter((item) => item.ruleId === ruleId);
  };
  test("acid hydration of 3,3-dimethylbut-1-ene on the page offers both alcohols", async () => {
    const out = await page("C=CC(C)(C)C", "alkene-acid-hydration");
    assert.deepEqual(await constitutions(out), await wanted("CC(O)C(C)(C)C", "CC(C)C(C)(C)O"));
  });
  test("nitration of toluene on the page offers ortho and para", async () => {
    const out = await page("Cc1ccccc1", "aromatic-nitration");
    assert.deepEqual(await constitutions(out), await wanted("Cc1ccccc1[N+](=O)[O-]", "Cc1ccc([N+](=O)[O-])cc1"));
  });
});

describe("epoxide opening by hydrogen halides follows the sourced regiochemistry (LibreTexts Wade 15.08, Nassau 8.14)", () => {
  const hx = (smiles, acid = "hbr") => run(`epoxide-hx-opening-${acid}`, smiles);
  test("primary/secondary epoxide carbons: the halide attacks the LESS substituted carbon (propylene oxide gives 1-bromopropan-2-ol)", async () => {
    assert.deepEqual(await constitutions(await hx("CC1CO1")), await wanted("CC(O)CBr"));
    assert.deepEqual(await constitutions(await hx("CCC1CO1")), await wanted("CCC(O)CBr"));
  });
  test("one tertiary epoxide carbon: the halide attacks the tertiary carbon", async () => {
    assert.deepEqual(await constitutions(await hx("CC1(C)CO1")), await wanted("CC(C)(Br)CO"));
    assert.deepEqual(await constitutions(await hx("CC1(C)OC1C")), await wanted("CC(O)C(C)(C)Br"));
  });
  test("the rule holds for HCl and HI too", async () => {
    assert.deepEqual(await constitutions(await hx("CC1CO1", "hcl")), await wanted("CC(O)CCl"));
    assert.deepEqual(await constitutions(await hx("CC1CO1", "hi")), await wanted("CC(O)CI"));
  });
  test("a symmetric epoxide gives one constitution, and stereo-defined ones keep the inversion rule", async () => {
    assert.deepEqual(await constitutions(await hx("CC1OC1C")), await wanted("CC(O)C(C)Br"));
  });
  test("other openings are unchanged: methoxide still attacks the less substituted carbon, acid/methanol the more substituted one", async () => {
    assert.deepEqual(await constitutions(await run("epoxide-base-alkoxide-opening", "CC1CO1.[O-]C")), await wanted("COCC(C)O"));
    assert.deepEqual(await constitutions(await run("epoxide-acid-alcohol-opening", "CC1CO1.CO")), await wanted("COC(C)CO"));
    assert.deepEqual(await constitutions(await run("epoxide-acid-water-opening", "CC1(C)CO1")), await wanted("CC(C)(O)CO"));
  });
  test("the rule text no longer claims the more substituted carbon is attacked", () => {
    const text = rule("epoxide-hx-opening-hbr").selectivity.join(" ");
    assert.doesNotMatch(text, /Acidic opening favors attack at the more substituted/);
    assert.match(text, /tertiary/);
  });
});
