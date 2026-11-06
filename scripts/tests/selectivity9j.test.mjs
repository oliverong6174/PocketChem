// Stage 9J: qualitative selectivity additions. These are development tests written from textbook principles (not benchmark cases):
//   * SN2 vs E2 by substrate class and reagent class (Wade ch. 6-7; Clayden ch. 17),
//   * steric disfavor of ortho attack by bulky electrophiles (acylium, tert-alkyl),
//   * primary-halide Friedel-Crafts alkylation is condition-dependent (rearrangement),
//   * aldol: a ketone electrophile is minor when an aldehyde electrophile is available.
// No fractions are asserted anywhere: the engine must stay qualitative.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let registry;
let engine;
let stereo;
before(async () => {
  ({ utils: { reactionRegistry: registry } } = await loadEngine());
  engine = await loadModule("/src/utils/reactions/engine/reactionEngine.ts");
  stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
});
after(async () => { await closeEngine(); });

const key = async (smiles) => (await stereo.canonicalizeStereoStructure(smiles)).connectivity;
const run = (ids, reactants) => engine.predictReactionPathwaysFromRules(reactants, [], ids.map((id) => registry.find((r) => r.id === id)), { planning: true });
const levelMap = async (out) => {
  const map = {};
  for (const p of out) map[`${p.ruleId}:${await key(p.productSmiles)}`] = p.selectivityAssessment?.level ?? "unranked";
  return map;
};
const pair = ["haloalkane-sn2-hydroxide", "haloalkane-e2-hydroxide"];

describe("substitution vs elimination", () => {
  test("primary halide + hydroxide: SN2 major, E2 minor", async () => {
    const m = await levelMap(await run(pair, "CCBr.[OH-]"));
    assert.equal(m[`haloalkane-sn2-hydroxide:${await key("CCO")}`], "major");
    assert.equal(m[`haloalkane-e2-hydroxide:${await key("C=C")}`], "minor");
  });
  test("secondary halide + hydroxide: both retained and competitive", async () => {
    const m = await levelMap(await run(pair, "CC(C)Br.[OH-]"));
    assert.equal(Object.keys(m).length, 2);
    assert.ok(Object.values(m).every((v) => v === "competitive"));
  });
  test("tertiary halide + hydroxide: the lone E2 outcome is not ranked (no competing pathway, so no evidence of 'major')", async () => {
    const m = await levelMap(await run(pair, "CC(C)(C)Br.[OH-]"));
    assert.deepEqual(Object.values(m), ["unranked"]);
  });
  test("secondary halide + cyanide: SN2 major (weakly basic nucleophile)", async () => {
    const m = await levelMap(await run(["haloalkane-sn2-cyanide"], "CC(C)Br.[C-]#N"));
    assert.deepEqual(Object.values(m), ["major"]);
  });
  test("bulky base: elimination major even for a primary halide", async () => {
    const m = await levelMap(await run(["haloalkane-e2-hofmann"], "CCBr.CC(C)(C)[O-]"));
    assert.deepEqual(Object.values(m), ["major"]);
  });
  test("secondary + small alkoxide: E2 major; the less substituted alkene stays minor", async () => {
    const out = await run(["haloalkane-sn2-hydroxide", "haloalkane-e2-zaitsev"], "CC(Br)CC.CC[O-]");
    const e2 = out.filter((p) => p.ruleId === "haloalkane-e2-zaitsev");
    assert.ok(e2.length >= 1);
    const byKey = {};
    for (const p of e2) byKey[await key(p.productSmiles)] = p.selectivityAssessment?.level;
    assert.equal(byKey[await key("CC=CC")], "major");
    if (byKey[await key("C=CCC")]) assert.equal(byKey[await key("C=CCC")], "minor");
  });
  test("negative controls: benzylic, allylic and beta-branched primary halides are NOT ranked", async () => {
    for (const halide of ["BrCc1ccccc1", "C=CCBr", "CC(C)CBr"]) {
      const out = await run(pair, `${halide}.[OH-]`);
      assert.ok(out.length >= 1, halide);
      for (const p of out) {
        if (p.ruleId === "haloalkane-sn2-hydroxide") assert.equal(p.selectivityAssessment?.level ?? "unranked", "unranked", halide);
      }
    }
  });
  test("no numeric fraction is ever produced", async () => {
    for (const r of ["CCBr.[OH-]", "CC(C)Br.[OH-]", "CC(C)(C)Br.[OH-]"]) {
      for (const p of await run(pair, r)) assert.equal(p.selectivityAssessment?.estimatedFraction ?? null, null);
    }
  });
});

describe("Friedel-Crafts", () => {
  test("acylation of toluene: ortho is sterically disfavored (minor), para major", async () => {
    const m = await levelMap(await run(["aromatic-friedel-crafts-acylation"], "Cc1ccccc1.CC(=O)Cl"));
    assert.equal(m[`aromatic-friedel-crafts-acylation:${await key("CC(=O)c1ccccc1C")}`], "minor");
    assert.equal(m[`aromatic-friedel-crafts-acylation:${await key("CC(=O)c1ccc(C)cc1")}`], "major");
  });
  test("tert-butylation of toluene: ortho minor, para major", async () => {
    const m = await levelMap(await run(["aromatic-friedel-crafts-alkylation"], "Cc1ccccc1.CC(C)(C)Cl"));
    assert.equal(m[`aromatic-friedel-crafts-alkylation:${await key("Cc1ccccc1C(C)(C)C")}`], "minor");
    assert.equal(m[`aromatic-friedel-crafts-alkylation:${await key("Cc1ccc(C(C)(C)C)cc1")}`], "major");
  });
  test("isopropylation (not bulky enough for the steric rule) keeps ortho competitive when activated equally", async () => {
    const out = await run(["aromatic-friedel-crafts-alkylation"], "Cc1ccccc1.CC(C)Cl");
    const ortho = out.find((p) => /c1ccccc1C\(C\)C|c1ccccc1C\(C\)C/.test(p.productSmiles) || p.productSmiles === "Cc1ccccc1C(C)C");
    if (ortho) assert.notEqual(ortho.selectivityAssessment?.label, "Disfavored ring position (steric, qualitative)");
  });
  test("primary alkyl halide: direct and rearranged products both kept, neither called major", async () => {
    const out = await run(["aromatic-friedel-crafts-alkylation"], "c1ccccc1.CCCCl");
    const keys = await Promise.all(out.map((p) => key(p.productSmiles)));
    assert.ok(keys.includes(await key("CCCc1ccccc1")) && keys.includes(await key("CC(C)c1ccccc1")));
    for (const p of out) assert.equal(p.selectivityAssessment?.level, "competitive");
  });
  test("a tertiary or secondary halide (no hydride-shift ambiguity) is not labelled condition-dependent", async () => {
    for (const p of await run(["aromatic-friedel-crafts-alkylation"], "c1ccccc1.CC(C)Cl")) {
      assert.notEqual(p.selectivityAssessment?.label, "Condition-dependent (rearrangement possible)");
    }
  });
});

describe("aldol", () => {
  const aldol = ["aldol-addition-general"];
  test("acetone + acetaldehyde: the ketone-electrophile adduct is minor; the aldehyde adduct is NOT promoted to major", async () => {
    const m = await levelMap(await run(aldol, "CC(=O)C.CC=O"));
    assert.equal(m[`aldol-addition-general:${await key("CC(C)(O)CC=O")}`], "minor");
    assert.equal(m[`aldol-addition-general:${await key("CC(=O)CC(C)O")}`], "unranked");
  });
  test("two ketones, no aldehyde: nothing is ranked", async () => {
    const out = await run(aldol, "CC(=O)C.CC(=O)CC");
    assert.ok(out.length >= 1);
    assert.ok(out.every((p) => !p.selectivityAssessment));
  });
});

describe("acid-catalysed epoxide opening by an alcohol", () => {
  const acid = ["epoxide-acid-alcohol-opening"];
  const set = async (smiles) => [...new Set(await Promise.all((await run(acid, smiles)).map((p) => key(p.productSmiles))))].sort();
  const want = async (...smiles) => (await Promise.all(smiles.map(key))).sort();
  test("propylene oxide (primary/secondary): both regioisomers kept and left unranked", async () => {
    assert.deepEqual(await set("CC1CO1.CO"), await want("COC(C)CO", "COCC(C)O"));
    for (const p of await run(acid, "CC1CO1.CO")) assert.ok(!p.selectivityAssessment);
  });
  test("2-methyl-1,2-epoxypropane (tertiary carbon): tertiary attack only", async () => {
    assert.deepEqual(await set("CC1(C)CO1.CO"), await want("COC(C)(C)CO"));
  });
  test("styrene oxide (benzylic carbon): benzylic attack only", async () => {
    assert.deepEqual(await set("C1OC1c1ccccc1.CO"), await want("COC(CO)c1ccccc1"));
  });
  test("symmetric epoxide: a single constitution", async () => {
    assert.equal((await set("CC1OC1C.CO")).length, 1);
  });
});
