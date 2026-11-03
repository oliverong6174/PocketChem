// Stage 9F: epoxide + hydrogen halide regiochemistry for cation-stabilizing carbons (benzylic, allylic, tertiary).
// Principle (Wade 15.08 / Nassau 8.14 for the tertiary and primary/secondary cases; Parker and Isaacs, Chem. Rev. 1959, for aryl epoxides, not re-read here):
// the halide attacks the epoxide carbon that better carries positive charge when exactly one does; otherwise the less substituted carbon.
// These tests are development tests written from the mechanism, not benchmark cases. Structures are compared as canonical forms.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, getRdkit, loadEngine, loadModule } from "./engine.mjs";

let registry;
let engine;
let stereo;

before(async () => {
  ({ utils: { reactionRegistry: registry } } = await loadEngine());
  engine = await loadModule("/src/utils/reactions/engine/reactionEngine.ts");
  stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
  await getRdkit();
});
after(async () => { await closeEngine(); });

const rule = (id) => registry.find((item) => item.id === id);
const conn = async (smiles) => (await stereo.canonicalizeStereoStructure(smiles)).connectivity;
const hx = async (smiles, acid = "hbr") => engine.predictReactionPathwaysFromRules(smiles, [], [rule(`epoxide-hx-opening-${acid}`)], { planning: true });
const set = async (pathways) => [...new Set(await Promise.all(pathways.map((p) => conn(p.productSmiles))))].sort();
const wanted = async (...smiles) => (await Promise.all(smiles.map(conn))).sort();

describe("epoxide + HX: benzylic and allylic carbons are attacked like tertiary ones", () => {
  test("styrene oxide + HBr: bromide on the benzylic carbon, not on CH2", async () => {
    assert.deepEqual(await set(await hx("C1OC1c1ccccc1")), await wanted("OCC(Br)c1ccccc1"));
  });
  test("HCl and HI behave the same", async () => {
    assert.deepEqual(await set(await hx("C1OC1c1ccccc1", "hcl")), await wanted("OCC(Cl)c1ccccc1"));
    assert.deepEqual(await set(await hx("C1OC1c1ccccc1", "hi")), await wanted("OCC(I)c1ccccc1"));
  });
  test("a secondary benzylic carbon beats an alkyl secondary carbon", async () => {
    assert.deepEqual(await set(await hx("CC1OC1c1ccccc1")), await wanted("CC(O)C(Br)c1ccccc1"));
  });
  test("an allylic carbon (vinyl epoxide) is attacked", async () => {
    assert.deepEqual(await set(await hx("C=CC1CO1")), await wanted("C=CC(Br)CO"));
  });
  test("both carbons stabilized (tertiary + benzylic): both regioisomers are kept, neither dropped", async () => {
    assert.deepEqual(await set(await hx("CC1(C)OC1c1ccccc1")), await wanted("CC(C)(Br)C(O)c1ccccc1", "CC(C)(O)C(Br)c1ccccc1"));
  });
  test("negative controls: unstabilized epoxides keep the Stage 9E behaviour", async () => {
    assert.deepEqual(await set(await hx("CC1CO1")), await wanted("CC(O)CBr"));
    assert.deepEqual(await set(await hx("CC1(C)CO1")), await wanted("CC(C)(Br)CO"));
    assert.deepEqual(await set(await hx("CC1OC1C")), await wanted("CC(O)C(C)Br"));
  });
  test("a ring-fused epoxide still gives the trans halohydrin as a racemate", async () => {
    const out = await hx("C1CCC2OC2C1");
    assert.deepEqual(await set(out), await wanted("OC1CCCCC1Br"));
    assert.ok(out.every((p) => p.productMixture?.kind === "racemic"));
  });
  test("base-promoted opening is not changed by this rule (methoxide attacks the less hindered CH2 of styrene oxide)", async () => {
    const out = await engine.predictReactionPathwaysFromRules("C1OC1c1ccccc1.[O-]C", [], [rule("epoxide-base-alkoxide-opening")], { planning: true });
    assert.deepEqual(await set(out), await wanted("COCC(O)c1ccccc1"));
  });
  test("backside attack: the benzylic carbon is inverted, so the product is neither the retention product nor its mirror image", async () => {
    const reaction = await loadModule("/src/utils/reactions/engine/rdkitReaction.ts");
    const epoxide = "C[C@H]1O[C@@H]1c1ccccc1";
    const out = await hx(epoxide);
    assert.equal(out.length, 1);
    // A plain template carries the reactant chirality tags through, i.e. retention at the attacked carbon.
    const retained = await reaction.runReactionSmarts([epoxide], "[O:1]1[C;$(C-a):2][C:3]1>>[OH:1][C:3][C:2]Br", 4);
    assert.equal(retained.length, 1);
    const mirror = (smiles) => smiles.replace(/@@/g, "").replace(/@/g, "@@").replace(//g, "@");
    const iso = async (smiles) => (await stereo.canonicalizeStereoStructure(smiles)).isomeric;
    const got = await iso(out[0].productSmiles);
    assert.notEqual(got, await iso(retained[0]));
    assert.notEqual(got, await iso(mirror(retained[0])));
    const rd = await getRdkit();
    const mol = rd.get_mol(got);
    const tags = JSON.parse(mol.get_stereo_tags());
    mol.delete();
    assert.equal(tags.CIP_atoms.length, 2, "both stereocentres stay defined");
  });
});
